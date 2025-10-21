import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const { ingredientName, brandQuery } = await req.json()

    console.log('AI Brand Search Request:', {
      ingredientName,
      brandQuery
    })

    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set!')
      throw new Error('Anthropic API key not configured')
    }

    if (!ingredientName) {
      return new Response(
        JSON.stringify({ products: [], error: 'Ingredient name is required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    // Step 1: Use Claude with web search to find relevant products
    console.log('Calling Claude API with web search...')

    const searchQuery = brandQuery
      ? `${ingredientName} ${brandQuery} brand products`
      : `${ingredientName} brand products`;

    const systemPrompt = `You are a food product research assistant. Your task is to search the web for food products and identify specific brand names and product names that would be available in Open Food Facts database.

When given an ingredient name and optional brand filter, you should:
1. Search the web for relevant products
2. If the initial search doesn't find good results, try related terms (e.g., "capicola" -> "capocollo", "gabagool", "coppa")
3. Extract specific brand names and product names from your search results
4. Return a list of products to search for in Open Food Facts

IMPORTANT:
- Focus on products that would likely have detailed ingredient labels
- Prefer well-known brands that are likely to be in Open Food Facts database
- Return specific product names, not generic descriptions
- If you find multiple spellings or variants, include all of them

You MUST respond with ONLY valid JSON in this exact format:
{
  "searchQueries": [
    "brand name product name",
    "another brand product"
  ],
  "reasoning": "Brief explanation of search strategy and any term variations tried"
}`

    const userPrompt = brandQuery
      ? `Find specific brand products for: "${ingredientName}" with brand filter: "${brandQuery}". Search the web and return specific product names to look up in Open Food Facts.`
      : `Find specific brand products for: "${ingredientName}". Search the web and return specific product names to look up in Open Food Facts.`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt
        }],
        tools: [{
          type: "web_search_20250410",
          name: "web_search",
          max_uses: 5
        }]
      })
    })

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text()
      console.error('Claude API error:', claudeResponse.status, errorText)
      throw new Error(`Claude API error: ${claudeResponse.status}`)
    }

    const claudeData = await claudeResponse.json()
    console.log('Claude API response received')
    console.log('Response content blocks:', claudeData.content?.length || 0)

    // Extract the final text response from Claude
    let aiResponseText = ''
    for (const block of claudeData.content || []) {
      if (block.type === 'text') {
        aiResponseText += block.text
      }
    }

    console.log('AI response text:', aiResponseText.substring(0, 500))

    // Parse the JSON response from Claude
    let aiResult
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = aiResponseText.match(/```json\n([\s\S]*?)\n```/) ||
                       aiResponseText.match(/```\n([\s\S]*?)\n```/) ||
                       aiResponseText.match(/\{[\s\S]*\}/)

      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiResponseText
      aiResult = JSON.parse(jsonText)
    } catch (e) {
      console.error('Failed to parse JSON from Claude:', e)
      console.error('Raw response:', aiResponseText.substring(0, 500))
      throw new Error('Invalid JSON response from AI')
    }

    const searchQueries = aiResult.searchQueries || []
    console.log('AI suggested search queries:', searchQueries)
    console.log('AI reasoning:', aiResult.reasoning)

    if (searchQueries.length === 0) {
      return new Response(
        JSON.stringify({
          products: [],
          message: 'No products found',
          aiReasoning: aiResult.reasoning
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    // Step 2: Search Open Food Facts for each suggested query
    console.log('Searching Open Food Facts for suggested products...')
    const allProducts = []
    const seenCodes = new Set()

    for (const query of searchQueries.slice(0, 10)) { // Limit to 10 queries
      try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`
        console.log('Searching Open Food Facts:', query)

        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          const products = Array.isArray(data.products) ? data.products : []

          // Add products we haven't seen yet
          for (const product of products) {
            if (product.code && !seenCodes.has(product.code)) {
              seenCodes.add(product.code)
              allProducts.push(product)
            }
          }
        }
      } catch (err) {
        console.warn('Open Food Facts search failed for query:', query, err)
      }
    }

    console.log(`Found ${allProducts.length} unique products from Open Food Facts`)

    // Step 3: Fetch detailed product info and filter for required images
    const detailedProducts = await Promise.all(
      allProducts.slice(0, 20).map(async (product) => {
        if (!product.code) return null

        try {
          const detailRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${product.code}.json`)
          if (detailRes.ok) {
            const detailData = await detailRes.json()
            if (detailData.product) {
              return { ...product, ...detailData.product }
            }
          }
        } catch (err) {
          console.warn('Failed to fetch product details for', product.code, err)
        }

        return product
      })
    )

    // Step 4: Filter to only products with BOTH brand image and ingredients image
    const validProducts = detailedProducts.filter(product => {
      if (!product) return false

      // Check for brand/front image
      const hasBrandImage = !!(
        product.image_front_url ||
        product.image_front_small_url ||
        product.image_url
      )

      // Check for ingredients image
      let hasIngredientsImage = !!product.image_ingredients_url

      if (!hasIngredientsImage && product.selected_images?.ingredients) {
        const ingredImgs = product.selected_images.ingredients.display ||
                          product.selected_images.ingredients.small
        if (ingredImgs) {
          hasIngredientsImage = !!(
            ingredImgs.en ||
            ingredImgs.fr ||
            ingredImgs.es ||
            ingredImgs.de ||
            Object.values(ingredImgs)[0]
          )
        }
      }

      const isValid = hasBrandImage && hasIngredientsImage

      if (!isValid) {
        console.log(`Filtered out ${product.product_name}: brandImage=${hasBrandImage}, ingredientsImage=${hasIngredientsImage}`)
      }

      return isValid
    })

    console.log(`Filtered to ${validProducts.length} products with both required images`)

    // Step 5: Format products for frontend
    const formattedProducts = validProducts.map(product => {
      const allergens = []
      if (Array.isArray(product.allergens_tags)) {
        product.allergens_tags.forEach((tag: string) => {
          const key = tag.replace(/^en:/, '').replace(/-/g, ' ')
          allergens.push(key)
        })
      }

      const ingredientsText = product.ingredients_text_en ||
                             product.ingredients_text ||
                             product.ingredients_original ||
                             ''

      let ingredientsList = []
      if (ingredientsText) {
        ingredientsList = ingredientsText
          .split(/[,;\n]/)
          .map((part: string) => part.replace(/\(.+?\)/g, '').trim())
          .filter(Boolean)
      }

      // Get ingredients image from multiple possible sources
      let ingredientsImage = product.image_ingredients_url || ''
      if (!ingredientsImage && product.selected_images?.ingredients) {
        const ingredImgs = product.selected_images.ingredients.display ||
                          product.selected_images.ingredients.small
        if (ingredImgs) {
          ingredientsImage = ingredImgs.en ||
                            ingredImgs.fr ||
                            ingredImgs.es ||
                            ingredImgs.de ||
                            Object.values(ingredImgs)[0] ||
                            ''
        }
      }

      return {
        name: product.product_name || product.brands || '',
        brand: product.brands || '',
        image: product.image_front_small_url || product.image_front_url || product.image_url || '',
        ingredientsImage,
        ingredientsList,
        allergens,
        productUrl: product.url || `https://world.openfoodfacts.org/product/${product.code}`,
        code: product.code
      }
    }).filter(item => item.name && item.image && item.ingredientsImage) // Final safety check

    console.log(`Returning ${formattedProducts.length} formatted products`)

    return new Response(
      JSON.stringify({
        products: formattedProducts.slice(0, 6), // Return max 6 products
        aiReasoning: aiResult.reasoning,
        searchCount: searchQueries.length,
        totalFound: allProducts.length,
        withImages: formattedProducts.length
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )

  } catch (error: any) {
    console.error('Error in AI brand search:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'AI brand search failed',
        products: []
      }),
      {
        status: 200, // Return 200 to avoid breaking the UI
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  }
})

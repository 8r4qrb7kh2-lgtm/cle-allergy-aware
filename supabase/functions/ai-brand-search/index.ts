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

    // Step 1: Use Claude to generate specific US brand product names
    console.log('Calling Claude API to generate US brand product names...')

    const systemPrompt = `You are a US grocery product expert. Generate specific product search queries for Open Food Facts.

Rules:
1. ONLY suggest products from major US brands commonly found in American grocery stores
2. Use FULL brand names + product type (e.g., "Boar's Head Hard Salami", "Oscar Mayer Turkey")
3. Common US brands: Boar's Head, Oscar Mayer, Hormel, Applegate, Columbus, Hillshire Farm, Buddig, Land O'Lakes, Kraft, Private Selection
4. If a brand is specified, prioritize it but also include 2-3 other major US brands
5. Include alternative spellings of the ingredient if relevant
6. Return 8-10 specific product names

Respond with ONLY valid JSON:
{
  "searchQueries": [
    "Boar's Head Hard Salami",
    "Oscar Mayer Hard Salami"
  ],
  "reasoning": "Brief explanation"
}`

    const userPrompt = brandQuery
      ? `Generate US brand product searches for: "${ingredientName}" with brand preference: "${brandQuery}"`
      : `Generate US brand product searches for: "${ingredientName}"`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt
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

    let aiResponseText = ''
    for (const block of claudeData.content || []) {
      if (block.type === 'text') {
        aiResponseText += block.text
      }
    }

    console.log('AI response text:', aiResponseText.substring(0, 500))

    let aiResult
    try {
      const jsonMatch = aiResponseText.match(/```json\n([\s\S]*?)\n```/) ||
                       aiResponseText.match(/```\n([\s\S]*?)\n```/) ||
                       aiResponseText.match(/\{[\s\S]*\}/)

      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : aiResponseText
      aiResult = JSON.parse(jsonText)
    } catch (e) {
      console.error('Failed to parse JSON from Claude:', e)
      console.error('Raw response:', aiResponseText)
      throw new Error('Invalid JSON response from AI')
    }

    const searchQueries = aiResult.searchQueries || []
    console.log('AI suggested US brand products:', searchQueries)
    console.log('AI reasoning:', aiResult.reasoning)

    if (searchQueries.length === 0) {
      return new Response(
        JSON.stringify({
          products: [],
          message: 'No US brand products found',
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

    // Step 2: Search Open Food Facts for each specific US brand product
    console.log('Searching Open Food Facts for US brand products...')
    const allProducts = []
    const seenCodes = new Set()

    for (const query of searchQueries) {
      try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=3`
        console.log('Searching Open Food Facts:', query)

        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          const products = Array.isArray(data.products) ? data.products : []

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

    if (allProducts.length === 0) {
      return new Response(
        JSON.stringify({
          products: [],
          message: 'No products found in Open Food Facts',
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

    // Step 3: Fetch detailed product info
    const detailedProducts = await Promise.all(
      allProducts.map(async (product) => {
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

    // Step 4: Filter for products with BOTH images
    const validProducts = detailedProducts.filter(product => {
      if (!product) return false

      const hasBrandImage = !!(
        product.image_front_url ||
        product.image_front_small_url ||
        product.image_url
      )

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

    // Step 5: Format products
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
    }).filter(item => item.name && item.image && item.ingredientsImage)

    console.log(`Returning ${formattedProducts.length} formatted products`)

    return new Response(
      JSON.stringify({
        products: formattedProducts.slice(0, 6),
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
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  }
})

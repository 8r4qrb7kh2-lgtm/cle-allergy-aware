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

    // Step 1: Use Claude to generate smart search queries
    console.log('Calling Claude API to generate search queries...')

    const systemPrompt = `You are a food product research assistant. Your task is to generate intelligent search queries for finding food products in the Open Food Facts database.

When given an ingredient name and optional brand filter, you should:
1. Consider alternative spellings and terms (e.g., "capicola" -> also try "capocollo", "coppa", "gabagool")
2. Think about common brands that sell this ingredient
3. Generate 5-10 specific search queries that would find relevant products in Open Food Facts
4. Focus on products that would likely have detailed ingredient labels

IMPORTANT:
- Include the ingredient name variations
- If a brand is specified, include it in searches
- Also include searches without the brand to find alternatives
- Think about what consumers actually search for

You MUST respond with ONLY valid JSON in this exact format:
{
  "searchQueries": [
    "search term 1",
    "search term 2",
    "search term 3"
  ],
  "reasoning": "Brief explanation of search strategy and variations"
}`

    const userPrompt = brandQuery
      ? `Generate search queries for: "${ingredientName}" with brand preference: "${brandQuery}". Include variations of the ingredient name, the specified brand, and other popular brands that make this product.`
      : `Generate search queries for: "${ingredientName}". Include variations of the ingredient name and popular brands that make this product.`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
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

    // Extract the text response from Claude
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
    console.log('AI suggested search queries:', searchQueries)
    console.log('AI reasoning:', aiResult.reasoning)

    if (searchQueries.length === 0) {
      return new Response(
        JSON.stringify({
          products: [],
          message: 'No search queries generated',
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

    for (const query of searchQueries.slice(0, 10)) {
      try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=5`
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

    // Step 3: Fetch detailed product info
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

    // Step 5: Filter for English products first, then use Claude to rank
    // Filter out products with non-English text in name or ingredients
    const englishProducts = validProducts.filter(p => {
      const productName = (p.product_name || '').toLowerCase()
      const ingredientsText = (p.ingredients_text_en || p.ingredients_text || '').toLowerCase()
      const combinedText = productName + ' ' + ingredientsText

      // Check for common non-English words
      const germanWords = ['mühlen', 'rügenwalder', 'klassisch', 'mit', 'ohne', 'und', 'von', 'der', 'die', 'das']
      const frenchWords = ['avec', 'sans', 'fromage', 'viande', 'de', 'du', 'le', 'la', 'les']
      const italianWords = ['con', 'senza', 'formaggio', 'carne', 'della', 'degli']

      const hasGerman = germanWords.some(word => new RegExp(`\\b${word}\\b`, 'i').test(combinedText))
      const hasFrench = frenchWords.some(word => new RegExp(`\\b${word}\\b`, 'i').test(combinedText))
      const hasItalian = italianWords.some(word => new RegExp(`\\b${word}\\b`, 'i').test(combinedText))

      if (hasGerman || hasFrench || hasItalian) {
        console.log(`Filtered out non-English product: ${p.product_name}`)
        return false
      }

      return true
    })

    console.log(`Filtered to ${englishProducts.length} English products`)

    // Step 6: Use Claude to rank by relevance
    let rankedProducts = englishProducts
    if (englishProducts.length > 0) {
      const productsForRanking = englishProducts.map((p, idx) => ({
        index: idx,
        name: p.product_name || '',
        brand: p.brands || '',
        categories: p.categories || ''
      }))

      const rankingPrompt = `Rank these products by relevance to "${ingredientName}"${brandQuery ? ` from brand "${brandQuery}"` : ''}.

Rank by:
1. Exact brand match (if brand specified)
2. Ingredient/product name match
3. Product quality/popularity

Return maximum 6 products, best matches first

Products:
${JSON.stringify(productsForRanking, null, 2)}

Respond with ONLY valid JSON:
{
  "selectedIndices": [0, 2, 5],
  "reasoning": "Brief explanation"
}`

      try {
        const rankResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [{
              role: 'user',
              content: rankingPrompt
            }]
          })
        })

        if (rankResponse.ok) {
          const rankData = await rankResponse.json()
          let rankText = ''
          for (const block of rankData.content || []) {
            if (block.type === 'text') rankText += block.text
          }

          const jsonMatch = rankText.match(/```json\n([\s\S]*?)\n```/) ||
                           rankText.match(/```\n([\s\S]*?)\n```/) ||
                           rankText.match(/\{[\s\S]*\}/)
          const rankResult = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : rankText)

          console.log('AI ranking reasoning:', rankResult.reasoning)

          // Reorder products based on AI selection
          const selectedIndices = rankResult.selectedIndices || []
          rankedProducts = selectedIndices
            .filter((idx: number) => idx < englishProducts.length)
            .map((idx: number) => englishProducts[idx])
          console.log(`AI ranked ${rankedProducts.length} products`)
        }
      } catch (err) {
        console.warn('AI ranking failed, returning all products:', err)
      }
    }

    // Step 7: Format products for frontend
    const formattedProducts = rankedProducts.map(product => {
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

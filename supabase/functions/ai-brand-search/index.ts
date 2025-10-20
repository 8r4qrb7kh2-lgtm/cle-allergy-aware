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
    const { products, ingredientName, brandQuery } = await req.json()

    console.log('AI Brand Search Request:', {
      productCount: products?.length || 0,
      ingredientName,
      brandQuery
    })

    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set!')
      throw new Error('Anthropic API key not configured')
    }

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ filteredProducts: [] }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    // Prepare product data for AI analysis
    const productsForAI = products.map((p: any, idx: number) => ({
      index: idx,
      product_name: p.product_name || '',
      brands: p.brands || '',
      ingredients_text: p.ingredients_text || '',
      categories: p.categories || '',
      allergens_tags: p.allergens_tags || [],
      labels_tags: p.labels_tags || []
    }))

    const systemPrompt = `You are a brand search assistant for a restaurant ingredient management system.

Your task is to analyze product search results from Open Food Facts and filter/rank them based on:
1. Whether the ingredient label is in ENGLISH (reject non-English labels)
2. Relevance to the ingredient name "${ingredientName}"
3. Match quality with brand query "${brandQuery}"

CRITICAL: You MUST respond with ONLY valid JSON. No explanations, no markdown, no text outside the JSON structure.

Return format:
{
  "filteredProducts": [
    {
      "index": 0,
      "relevanceScore": 95,
      "isEnglish": true,
      "reasoning": "Perfect match - English ingredients, exact ingredient and brand match"
    }
  ]
}

Rules:
1. ONLY include products with ingredients text in English
2. Reject products with French (lait, origine, pasteurisé), Danish (komælk, pasteuriseret), German (milch, käse), or other non-English ingredient labels
3. Score products 0-100 based on relevance (100 = perfect match)
4. Return maximum 6 products, sorted by relevanceScore descending
5. If a product has no ingredients_text, accept it only if other fields suggest it's English
6. Be strict about English-only ingredient labels`

    const userPrompt = `Analyze these products and return only English-labeled products relevant to "${ingredientName}" and brand "${brandQuery}":

${JSON.stringify(productsForAI, null, 2)}

Return ONLY the JSON response with filtered and ranked products.`

    console.log('Calling Claude API for brand filtering...')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt
        }]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Claude API error:', response.status, errorText)
      throw new Error(`Claude API error: ${response.status}`)
    }

    const data = await response.json()
    console.log('Claude API response received')

    const messageContent = data.content?.[0]?.text
    if (!messageContent) {
      throw new Error('No content in Claude response')
    }

    // Parse the JSON response from Claude
    let aiResult
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = messageContent.match(/```json\n([\s\S]*?)\n```/) ||
                       messageContent.match(/```\n([\s\S]*?)\n```/) ||
                       messageContent.match(/\{[\s\S]*\}/)

      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : messageContent
      aiResult = JSON.parse(jsonText)
    } catch (e) {
      console.error('Failed to parse JSON from Claude:', e)
      console.error('Raw response:', messageContent.substring(0, 500))
      throw new Error('Invalid JSON response from AI')
    }

    // Map AI-filtered indices back to original products
    const filteredProducts = (aiResult.filteredProducts || [])
      .map((fp: any) => ({
        ...products[fp.index],
        _aiRelevanceScore: fp.relevanceScore,
        _aiReasoning: fp.reasoning
      }))
      .slice(0, 6) // Ensure max 6 results

    console.log(`AI filtered ${products.length} products down to ${filteredProducts.length}`)

    return new Response(
      JSON.stringify({
        filteredProducts,
        aiAnalysis: {
          originalCount: products.length,
          filteredCount: filteredProducts.length
        }
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
        filteredProducts: []
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

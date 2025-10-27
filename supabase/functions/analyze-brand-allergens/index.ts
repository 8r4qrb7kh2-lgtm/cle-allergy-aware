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
    const { ingredientText, productName, labels, categories } = await req.json()

    console.log('Analyzing brand product:', {
      productName: productName || 'unknown',
      ingredientTextLength: ingredientText ? ingredientText.length : 0,
      labelsCount: labels ? labels.length : 0,
      categoriesCount: categories ? categories.length : 0
    })

    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set!')
      throw new Error('Anthropic API key not configured')
    }

    if (!ingredientText || ingredientText.trim().length === 0) {
      throw new Error('ingredientText is required')
    }

    const systemPrompt = `You are an allergen and dietary preference analyzer for a restaurant allergen awareness system.

CRITICAL: You MUST respond with ONLY valid JSON. No explanations, no markdown, no text outside the JSON structure.

TASK:
Analyze the ingredient list and determine:
1. Which allergens are present from this list: dairy, egg, peanut, tree nut, shellfish, fish, gluten, soy, sesame, wheat
2. Which dietary preferences this product is compatible with: Vegan, Vegetarian, Pescatarian

IMPORTANT RULES FOR ALLERGEN DETECTION:
- "almond milk", "oat milk", "soy milk", "coconut milk", etc. are NOT dairy - they are plant-based alternatives
- Only mark dairy if there's actual milk, cream, butter, cheese, whey, casein, or lactose from animals
- "almond milk" DOES contain tree nuts (almonds)
- Be context-aware: "milk powder" after animal ingredients = dairy, but "almond milk" = tree nut only

DIETARY PREFERENCE RULES:
- Vegan: NO animal products at all (no meat, fish, dairy, eggs, honey, gelatin, or animal-derived additives)
- Vegetarian: No meat or fish, but MAY contain dairy and/or eggs
- Pescatarian: May contain fish/seafood, dairy, and eggs, but NO other meat (chicken, beef, pork, etc.)

IMPORTANT:
- A vegetarian product (with dairy/eggs) is ALSO pescatarian-compatible
- If product is vegan, it's also vegetarian AND pescatarian
- If product is vegetarian (no meat/fish), it's also pescatarian

EXAMPLES:
1. "almond milk (water, almonds), oats, dates" → allergens: ["tree nut"], diets: ["Vegan", "Vegetarian", "Pescatarian"]
2. "yogurt (milk), oats, honey" → allergens: ["dairy"], diets: ["Vegetarian", "Pescatarian"]
3. "chicken, salt, pepper" → allergens: [], diets: []
4. "tuna, water, salt" → allergens: ["fish"], diets: ["Pescatarian"]
5. "egg, milk, flour" → allergens: ["egg", "dairy", "wheat"], diets: ["Vegetarian", "Pescatarian"]

Return a JSON object with this exact structure:
{
  "allergens": ["allergen1", "allergen2"],
  "diets": ["Vegan", "Vegetarian", "Pescatarian"],
  "reasoning": "Brief explanation of your analysis"
}`

    const userPrompt = `Product Name: ${productName || 'Unknown Product'}

Ingredient List: ${ingredientText}

${labels && labels.length > 0 ? `\nProduct Labels: ${labels.join(', ')}` : ''}
${categories && categories.length > 0 ? `\nProduct Categories: ${categories.join(', ')}` : ''}

Please analyze these ingredients and determine allergens and dietary compatibility.`

    console.log('Calling Claude API (Sonnet 4.5)...')

    // Call Claude API with Sonnet 4.5
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',  // Sonnet 4.5
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt
        }]
      }),
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      console.error('Claude API error:', error)
      console.error('Claude API status:', claudeResponse.status)
      throw new Error(`Claude API error (${claudeResponse.status}): ${error.substring(0, 500)}`)
    }

    const aiResult = await claudeResponse.json()
    const responseText = aiResult.content[0].text

    console.log('Claude response received, length:', responseText.length)

    // Parse JSON from response
    let parsed
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                       responseText.match(/```\n([\s\S]*?)\n```/) ||
                       responseText.match(/\{[\s\S]*\}/)

      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText
      parsed = JSON.parse(jsonText)

      console.log('Successfully parsed:', {
        allergens: parsed.allergens,
        diets: parsed.diets
      })
    } catch (e) {
      console.error('Failed to parse JSON from Claude response')
      console.error('Response text:', responseText)
      console.error('Parse error:', e.message)

      // Return empty results rather than crashing
      return new Response(
        JSON.stringify({
          error: 'AI returned invalid format',
          allergens: [],
          diets: [],
          raw_response: responseText.substring(0, 200)
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

    // Ensure allergens and diets are arrays
    if (!Array.isArray(parsed.allergens)) {
      parsed.allergens = []
    }
    if (!Array.isArray(parsed.diets)) {
      parsed.diets = []
    }

    return new Response(
      JSON.stringify({
        allergens: parsed.allergens,
        diets: parsed.diets,
        reasoning: parsed.reasoning || ''
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to process request',
        allergens: [],
        diets: []
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  }
})

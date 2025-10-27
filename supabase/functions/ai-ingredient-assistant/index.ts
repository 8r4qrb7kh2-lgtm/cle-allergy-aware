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
    const { text, dishName, imageData } = await req.json()

    console.log('Request received:', {
      hasImageData: !!imageData,
      imageDataLength: imageData ? imageData.length : 0,
      hasText: !!text,
      dishName: dishName || 'none'
    })

    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set!')
      throw new Error('Anthropic API key not configured')
    }

    console.log('API key is configured, proceeding with Claude API call...')

    // Build the prompt based on whether we have an image
    const systemPrompt = imageData
      ? `You are an ingredient analysis assistant for a restaurant allergen awareness system.

CRITICAL: You MUST respond with ONLY valid JSON. No explanations, no markdown, no text outside the JSON structure.

IMPORTANT INSTRUCTIONS:
1. Read ALL ingredients from the image - whether it's a product label, recipe card, or preparation instructions
2. If the image shows preparation instructions (like "arrange cheese, add salami, etc."), extract each mentioned food item as a separate ingredient
3. Create a SEPARATE entry for EACH distinct ingredient (e.g., "spinach", "ricotta", "egg", "parsley" should be 4 separate entries, NOT combined)
4. INCLUDE optional ingredients, garnishes, and toppings - they still need allergen awareness!
5. For each ingredient, identify allergens from this list: dairy, egg, peanut, tree nut, shellfish, fish, gluten, soy, sesame, wheat
6. Also determine which dietary options the overall dish meets from this list: Vegan, Vegetarian, Pescatarian
7. Even if the image format is unexpected, extract food items mentioned and return valid JSON
8. If the image is unclear, indicate that in imageQuality but STILL return valid JSON

CRITICAL: You MUST respond with ONLY the JSON object below. No other text before or after.

Return a JSON object with this exact structure:
{
  "ingredients": [
    {
      "name": "single ingredient name (e.g., 'spinach', NOT 'spinach ricotta egg')",
      "brand": "brand name if visible in image, otherwise empty string",
      "allergens": ["allergen1", "allergen2"],
      "diets": ["Vegan", "Vegetarian", "Pescatarian"],
      "ingredientsList": ["raw sub-ingredients if this is a processed product, otherwise just the ingredient name"],
      "imageQuality": "good|poor|unreadable"
    }
  ],
  "dietaryOptions": ["Vegan", "Vegetarian", "Pescatarian"],
  "verifiedFromImage": true
}

DIETARY OPTIONS RULES (IMPORTANT - Be proactive in assigning these):
- Vegan: Include if ALL ingredients are plant-based (no meat, dairy, eggs, honey, gelatin, or animal-derived additives)
- Vegetarian: Include if no meat or fish, even if dairy/eggs are present
- Pescatarian: Include if contains fish/seafood but no other meat, may contain dairy/eggs

IMPORTANT: Include the "diets" field for EACH ingredient to show which dietary preferences that ingredient satisfies.

EXAMPLE 1: If you see "30 oz spinach, 15 oz cottage cheese, 1 egg, parsley":
- {"name": "spinach", "allergens": [], "diets": ["Vegan", "Vegetarian", "Pescatarian"], ...}
- {"name": "cottage cheese", "allergens": ["dairy"], "diets": ["Vegetarian", "Pescatarian"], ...}
- {"name": "egg", "allergens": ["egg"], "diets": ["Vegetarian", "Pescatarian"], ...}
- {"name": "parsley", "allergens": [], "diets": ["Vegan", "Vegetarian", "Pescatarian"], ...}
dietaryOptions: ["Vegetarian"] (not vegan due to dairy/egg)

EXAMPLE 2: If you see "radish, water, vinegar, salt":
- All plant-based ingredients with "diets": ["Vegan", "Vegetarian", "Pescatarian"]
dietaryOptions: ["Vegan", "Vegetarian", "Pescatarian"] (all apply since no animal products)

EXAMPLE 3: If you see "rapeseed oil, water, egg yolk, vinegar, salt":
- "egg yolk" has "diets": ["Vegetarian", "Pescatarian"]
- Other ingredients have "diets": ["Vegan", "Vegetarian", "Pescatarian"]
dietaryOptions: ["Vegetarian"] (contains egg, so not vegan)

Be VERY conservative with allergens but PROACTIVE with dietary options - if ingredients clearly meet the criteria, include them.`
      : `You are an ingredient analysis assistant for a restaurant allergen awareness system.

Analyze the dish description and extract:
1. Individual ingredients (INCLUDING optional ingredients, garnishes, and toppings)
2. Likely brands (if mentioned)
3. Potential allergens from this list: dairy, egg, peanut, tree nut, shellfish, fish, gluten, soy, sesame, wheat
4. Dietary options the dish meets from this list: Vegan, Vegetarian, Pescatarian

IMPORTANT: Include ALL mentioned ingredients, even if they are:
- Optional ("optionally add paprika")
- Garnishes ("garnish with parsley")
- Toppings ("topped with sesame seeds")
- Alternative options ("serve with cilantro or parsley")
These still need to be flagged for allergen awareness!

Return a JSON object with this exact structure:
{
  "ingredients": [
    {
      "name": "ingredient name",
      "brand": "brand name if mentioned, otherwise empty string",
      "allergens": ["allergen1", "allergen2"],
      "diets": ["Vegan", "Vegetarian", "Pescatarian"],
      "ingredientsList": ["raw ingredient from label"]
    }
  ],
  "dietaryOptions": ["Vegan", "Vegetarian", "Pescatarian"],
  "verifiedFromImage": false
}

DIETARY OPTIONS RULES (IMPORTANT - Be proactive in assigning these):
- Vegan: Include if ALL ingredients are plant-based (no meat, dairy, eggs, honey, gelatin, or animal-derived additives)
- Vegetarian: Include if no meat or fish, even if dairy/eggs are present
- Pescatarian: Include if contains fish/seafood but no other meat, may contain dairy/eggs

IMPORTANT: Include the "diets" field for EACH ingredient to show which dietary preferences that ingredient satisfies.

EXAMPLES:
- "radish" → {"allergens": [], "diets": ["Vegan", "Vegetarian", "Pescatarian"], ...}
- "olive oil" → {"allergens": [], "diets": ["Vegan", "Vegetarian", "Pescatarian"], ...}
- "egg yolk" → {"allergens": ["egg"], "diets": ["Vegetarian", "Pescatarian"], ...}
- "chicken" → {"allergens": [], "diets": [], ...}
- "hummus, optionally garnish with paprika" → Include both hummus AND paprika as separate ingredients

Be conservative with allergens but PROACTIVE with dietary options - if ingredients clearly meet the criteria, include them.`

    const userPrompt = imageData
      ? `${text ? `Context: ${text}` : ''}
${dishName ? `Dish Name: ${dishName}` : ''}

Please analyze the ingredient label image.`
      : `Dish Name: ${dishName || 'Unknown'}
Description: ${text}

Please analyze this dish.`

    // Build content array for Claude
    const content: any[] = []

    if (imageData) {
      // Extract base64 data from data URL
      const base64Data = imageData.split(',')[1] || imageData
      const mediaType = imageData.includes('image/png') ? 'image/png' :
                       imageData.includes('image/jpeg') ? 'image/jpeg' :
                       imageData.includes('image/jpg') ? 'image/jpeg' :
                       imageData.includes('image/webp') ? 'image/webp' :
                       'image/jpeg'

      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data
        }
      })
    }

    content.push({
      type: 'text',
      text: userPrompt
    })

    console.log('Calling Claude API with:', {
      model: 'claude-sonnet-4-20250514',
      contentItems: content.length,
      hasImage: content.some(c => c.type === 'image'),
      systemPromptLength: systemPrompt.length
    })

    // Call Claude API (using Sonnet 4.5 for better accuracy)
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: content
        }]
      }),
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      console.error('Claude API error:', error)
      console.error('Claude API status:', claudeResponse.status)
      console.error('Claude API headers:', JSON.stringify(Object.fromEntries(claudeResponse.headers)))
      throw new Error(`Claude API error (${claudeResponse.status}): ${error.substring(0, 500)}`)
    }

    const aiResult = await claudeResponse.json()
    const responseText = aiResult.content[0].text

    // Parse JSON from response
    let parsed
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                       responseText.match(/```\n([\s\S]*?)\n```/) ||
                       responseText.match(/\{[\s\S]*\}/)  // Try to find any JSON object

      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText
      console.log('Attempting to parse JSON, length:', jsonText.length)
      parsed = JSON.parse(jsonText)
    } catch (e) {
      console.error('Failed to parse JSON from Claude response')
      console.error('Response text (first 500 chars):', responseText.substring(0, 500))
      console.error('Parse error:', e.message)

      // Return a helpful error with empty ingredients rather than crashing
      return new Response(
        JSON.stringify({
          error: 'AI returned invalid format. Please try again or describe ingredients in text.',
          ingredients: [],
          raw_response: responseText.substring(0, 200)
        }),
        {
          status: 200,  // Return 200 so WordPress doesn't show generic error
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    return new Response(
      JSON.stringify(parsed),
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
        ingredients: []
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

// Allergen and diet name mappings for consistent capitalization
const ALLERGEN_NAMES = ['Dairy', 'Egg', 'Peanut', 'Tree Nut', 'Soy', 'Wheat', 'Fish', 'Shellfish', 'Sesame']
const DIET_NAMES = ['Vegan', 'Vegetarian', 'Pescatarian', 'Gluten-free']

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
    const { ingredients } = await req.json()

    if (!ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured')
    }

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      throw new Error('ingredients array is required')
    }

    console.log('Checking dietary/allergens for ingredients:', ingredients.length, 'items')
    const ingredientText = ingredients.join(', ')

    const userPrompt = `I want you to look through the following list of ingredients and decide if there are any of the following allergens: dairy, egg, peanut, tree nut, soy, wheat, fish, shellfish, or sesame. Then, I want you to look through the same ingredient list again for any violations of the following diets: vegan, vegetarian, pescatarian, or gluten-free.  Here is the ingredient list: "${ingredientText}". Before sending your response, double check to make sure that you didn't make a mistake in misclassifying. Also list a reason for each allergen/diet you flag. After writing out all of the reasoning, write "FINAL DECISION", and then write ONLY this (with each entry having its own bullet point): "[what the allergen/diet (with exact spelling and capitalization that I referred to it as in this prompt], [ingredient name exactly as it appears in the ingredient list]". If you don't find any allergens or diet violations, please return: "nothing".`

    console.log('Calling Claude Haiku 4.5 API...')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Claude API error:', error)
      throw new Error(`Claude API error: ${response.status}`)
    }

    const aiResult = await response.json()
    const responseText = aiResult.content[0].text.trim()
    console.log('Claude response:', responseText)

    // Initialize results with all allergens unflagged and all diets compliant
    const allergens: { [key: string]: { flagged: boolean; triggers: string[] } } = {}
    for (const name of ALLERGEN_NAMES) {
      allergens[name] = { flagged: false, triggers: [] }
    }

    const diets: { [key: string]: { flagged: boolean; triggers: string[] } } = {}
    for (const name of DIET_NAMES) {
      diets[name] = { flagged: false, triggers: [] }
    }

    // Extract only the content after "FINAL DECISION"
    const finalDecisionMatch = responseText.match(/FINAL DECISION[:\s]*([\s\S]*)/i)
    const finalSection = finalDecisionMatch ? finalDecisionMatch[1].trim() : responseText

    if (finalSection.toLowerCase() !== 'nothing') {
      // Parse bullet points from the final decision section
      const lines = finalSection.split('\n').filter((line: string) => line.trim())

      for (const line of lines) {
        // Remove bullet point markers and trim
        const cleanLine = line.replace(/^[-•*]\s*/, '').trim()

        // Split by comma - format is "allergen/diet, ingredient"
        const commaIndex = cleanLine.indexOf(',')
        if (commaIndex === -1) continue

        const category = cleanLine.substring(0, commaIndex).trim().toLowerCase()
        const ingredient = cleanLine.substring(commaIndex + 1).trim()

        // Skip if ingredient is "nothing", "none", "n/a", or empty (AI sometimes outputs this incorrectly)
        if (!ingredient || ingredient.toLowerCase() === 'nothing' || ingredient.toLowerCase() === 'none' || ingredient.toLowerCase() === 'n/a') {
          continue
        }

        // Check if it's an allergen
        const allergenMatch = ALLERGEN_NAMES.find(a => a.toLowerCase() === category)
        if (allergenMatch) {
          allergens[allergenMatch].flagged = true
          allergens[allergenMatch].triggers.push(ingredient)
        }

        // Check if it's a diet violation
        const dietMatch = DIET_NAMES.find(d => d.toLowerCase() === category)
        if (dietMatch) {
          diets[dietMatch].flagged = true
          diets[dietMatch].triggers.push(ingredient)
        }
      }
    }

    console.log('Parsed results:', {
      allergens,
      diets
    })

    return new Response(
      JSON.stringify({ allergens, diets }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )

  } catch (error) {
    console.error('Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  }
})

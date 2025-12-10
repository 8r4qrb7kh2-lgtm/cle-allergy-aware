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

    const userPrompt = `I want you to look through the following list of ingredients and decide if there are any of the following allergens: dairy, egg, peanut, tree nut, soy, wheat, fish, shellfish, or sesame. Then, I want you to look through the same ingredient list again for any violations of the following diets: vegan, vegetarian, pescatarian, or gluten-free.  Here is the ingredient list: "${ingredientText}". Before sending your response, double check to make sure that you didn't make a mistake in misclassifying. Also list a reason for each allergen/diet you flag. After writing out all of the reasoning, write "FINAL DECISION", and then write ONLY this (with each entry having its own bullet point): "[what the allergen/diet (with exact spelling and capitalization that I referred to it as in this prompt], [ingredient name exactly as it appears in the ingredient list]". If you don't find any allergens or diet violations, please return: "nothing".`

    console.log('Calling Claude Haiku 4.5 API...')

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: userPrompt
        }]
      }),
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      console.error('Claude API error:', error)
      throw new Error(`Claude API error (${claudeResponse.status}): ${error.substring(0, 500)}`)
    }

    const aiResult = await claudeResponse.json()
    const responseText = aiResult.content[0].text.trim()
    console.log('Claude response:', responseText)

    // Parse the response
    const allergens: { name: string; triggers: string[] }[] = []
    const dietViolations: { [key: string]: { is_compliant: boolean; reason: string } } = {
      'Vegan': { is_compliant: true, reason: 'No violations found' },
      'Vegetarian': { is_compliant: true, reason: 'No violations found' },
      'Pescatarian': { is_compliant: true, reason: 'No violations found' },
      'Gluten-free': { is_compliant: true, reason: 'No violations found' }
    }

    // Track triggers for each allergen/diet
    const allergenTriggers: { [key: string]: string[] } = {}
    const dietTriggersList: { [key: string]: string[] } = {}

    // Extract only the content after "FINAL DECISION"
    const finalDecisionMatch = responseText.match(/FINAL DECISION[:\s]*([\s\S]*)/i)
    const finalSection = finalDecisionMatch ? finalDecisionMatch[1].trim() : responseText

    if (finalSection.toLowerCase() !== 'nothing') {
      // Parse bullet points from the final decision section
      const lines = finalSection.split('\n').filter(line => line.trim())

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
          if (!allergenTriggers[allergenMatch]) {
            allergenTriggers[allergenMatch] = []
          }
          allergenTriggers[allergenMatch].push(ingredient)
        }

        // Check if it's a diet violation
        const dietMatch = DIET_NAMES.find(d => d.toLowerCase() === category)
        if (dietMatch) {
          if (!dietTriggersList[dietMatch]) {
            dietTriggersList[dietMatch] = []
          }
          dietTriggersList[dietMatch].push(ingredient)
        }
      }
    }

    // Build allergens array
    for (const [name, triggers] of Object.entries(allergenTriggers)) {
      allergens.push({ name, triggers })
    }

    // Update diet violations
    for (const [diet, triggers] of Object.entries(dietTriggersList)) {
      if (triggers.length > 0) {
        dietViolations[diet] = {
          is_compliant: false,
          reason: triggers.join(', ')
        }
      }
    }

    // Build legacy diets array (diets that ARE compliant)
    const diets = Object.entries(dietViolations)
      .filter(([_, status]) => status.is_compliant)
      .map(([diet]) => diet)

    // Determine needsScan - if ingredient is vague like "spices", "natural flavors", etc.
    const vagueIngredients = ['spices', 'spice', 'natural flavors', 'natural flavoring', 'artificial flavors', 'seasonings']
    const needsScan = vagueIngredients.some(v => ingredientText.toLowerCase().includes(v))

    console.log('Parsed results:', {
      allergens,
      diets,
      dietViolations,
      needsScan
    })

    return new Response(
      JSON.stringify({
        allergens,
        diets,
        dietary_compliance: dietViolations,
        needsScan,
        reasoning: responseText
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )

  } catch (error) {
    console.error('Error in analyze-brand-allergens:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to process request',
        allergens: [],
        diets: ['Vegan', 'Vegetarian', 'Pescatarian', 'Gluten-free'],
        dietary_compliance: {
          'Vegan': { is_compliant: true, reason: 'Error during analysis' },
          'Vegetarian': { is_compliant: true, reason: 'Error during analysis' },
          'Pescatarian': { is_compliant: true, reason: 'Error during analysis' },
          'Gluten-free': { is_compliant: true, reason: 'Error during analysis' }
        },
        needsScan: true
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

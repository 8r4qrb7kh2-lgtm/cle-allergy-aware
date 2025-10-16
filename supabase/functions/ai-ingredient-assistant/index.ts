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

    if (!ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured')
    }

    // Build the prompt based on whether we have an image
    const systemPrompt = imageData
      ? `You are an ingredient analysis assistant for a restaurant allergen awareness system.

CRITICAL: You have been provided an ingredient label image. Read the ACTUAL ingredients from the image.

IMPORTANT INSTRUCTIONS:
1. Read the ingredients list EXACTLY as shown in the image
2. Do NOT guess or infer - only use what you can clearly read
3. Identify allergens from this list: dairy, egg, peanut, tree nut, shellfish, fish, gluten, soy, sesame, wheat
4. If the image is unclear or missing ingredients, indicate that in the response

Return a JSON object with this exact structure:
{
  "ingredients": [
    {
      "name": "ingredient name",
      "brand": "brand name if visible in image, otherwise empty string",
      "allergens": ["allergen1", "allergen2"],
      "ingredientsList": ["exact ingredients as listed on the label"],
      "imageQuality": "good|poor|unreadable"
    }
  ],
  "verifiedFromImage": true
}

Be VERY conservative with allergens - only flag what you can clearly identify from the label.`
      : `You are an ingredient analysis assistant for a restaurant allergen awareness system.

Analyze the dish description and extract:
1. Individual ingredients
2. Likely brands (if mentioned)
3. Potential allergens from this list: dairy, egg, peanut, tree nut, shellfish, fish, gluten, soy, sesame, wheat

Return a JSON object with this exact structure:
{
  "ingredients": [
    {
      "name": "ingredient name",
      "brand": "brand name if mentioned, otherwise empty string",
      "allergens": ["allergen1", "allergen2"],
      "ingredientsList": ["raw ingredient from label"]
    }
  ],
  "verifiedFromImage": false
}

Be conservative - only flag allergens you are confident about based on the description.`

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

    // Call Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
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
      throw new Error(`Claude API error: ${error}`)
    }

    const aiResult = await claudeResponse.json()
    const responseText = aiResult.content[0].text

    // Parse JSON from response
    let parsed
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                       responseText.match(/```\n([\s\S]*?)\n```/)
      const jsonText = jsonMatch ? jsonMatch[1] : responseText
      parsed = JSON.parse(jsonText)
    } catch (e) {
      console.error('Failed to parse JSON:', responseText)
      throw new Error('Failed to parse AI response as JSON')
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

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

    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured')
    }

    // Build the prompt based on whether we have an image
    const prompt = imageData
      ? `You are an ingredient analysis assistant for a restaurant allergen awareness system.

CRITICAL: You have been provided an ingredient label image. Read the ACTUAL ingredients from the image.

${text ? `Context: ${text}` : ''}
${dishName ? `Dish Name: ${dishName}` : ''}

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

Analyze the following dish description and extract:
1. Individual ingredients
2. Likely brands (if mentioned)
3. Potential allergens from this list: dairy, egg, peanut, tree nut, shellfish, fish, gluten, soy, sesame, wheat

Dish Name: ${dishName || 'Unknown'}
Description: ${text}

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

    // Call OpenAI API
    const messages: any[] = [
      {
        role: 'user',
        content: prompt
      }
    ]

    // If image data is provided, use vision model
    if (imageData) {
      messages[0].content = [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image_url',
          image_url: {
            url: imageData // Should be base64 data URL
          }
        }
      ]
    }

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: imageData ? 'gpt-4o' : 'gpt-4o-mini',
        messages: messages,
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    })

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text()
      throw new Error(`OpenAI API error: ${error}`)
    }

    const aiResult = await openaiResponse.json()
    const content = aiResult.choices[0].message.content
    const parsed = JSON.parse(content)

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

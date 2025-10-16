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
    const { imageData } = await req.json()

    if (!ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured')
    }

    if (!imageData) {
      throw new Error('No image data provided')
    }

    const systemPrompt = `You are a menu analysis assistant for a restaurant allergen awareness system.

Your task is to analyze a menu image and detect all the dishes visible on it, along with their approximate locations.

IMPORTANT INSTRUCTIONS:
1. Identify ALL dish names visible on the menu
2. For each dish, estimate its bounding box location as percentages of the image (x, y, width, height)
3. x and y are the top-left corner coordinates as percentages (0-100)
4. width and height are the dimensions as percentages (0-100)
5. Try to create tight bounding boxes around each dish name and its description
6. If dishes are organized in columns or sections, respect that layout

Return a JSON object with this exact structure:
{
  "dishes": [
    {
      "id": "dish name as it appears on menu",
      "x": 10.5,
      "y": 15.2,
      "w": 25.0,
      "h": 8.0,
      "allergens": [],
      "removable": [],
      "crossContamination": [],
      "diets": [],
      "details": {}
    }
  ]
}

IMPORTANT:
- x, y, w, h should be percentages (decimals between 0 and 100)
- Make sure bounding boxes don't overlap too much
- Leave allergens, removable, crossContamination, diets, and details as empty arrays/objects - the restaurant manager will fill these in
- Focus on getting accurate dish names and reasonable bounding boxes`

    const userPrompt = `Please analyze this menu image and detect all dishes with their locations.`

    // Extract base64 data from data URL
    const base64Data = imageData.split(',')[1] || imageData
    const mediaType = imageData.includes('image/png') ? 'image/png' :
                     imageData.includes('image/jpeg') ? 'image/jpeg' :
                     imageData.includes('image/jpg') ? 'image/jpeg' :
                     imageData.includes('image/webp') ? 'image/webp' :
                     'image/jpeg'

    const content = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data
        }
      },
      {
        type: 'text',
        text: userPrompt
      }
    ]

    // Call Claude API with vision model
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
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
      JSON.stringify({
        success: true,
        dishes: parsed.dishes || []
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
        success: false,
        error: error.message || 'Failed to process request',
        dishes: []
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

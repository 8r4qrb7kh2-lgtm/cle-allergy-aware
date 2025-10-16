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

    const systemPrompt = `You are a menu analysis assistant that detects dish locations on restaurant menu images.

TASK: Find each dish and return its bounding box as percentages of the image dimensions.

COORDINATE SYSTEM:
- x, y, w, h are ALL percentages (0-100) of the image dimensions
- x = horizontal distance from LEFT edge of image to LEFT edge of dish
- y = vertical distance from TOP edge of image to TOP edge of dish
- w = width of the dish area (name + price + description)
- h = height of the dish area

MEASUREMENT PROCESS:
1. Look at the ENTIRE image dimensions (width and height in pixels)
2. Find where the dish text starts horizontally - that's your x
3. Find where the dish text starts vertically - that's your y
4. Measure how wide the dish text area is - convert to percentage of image width
5. Measure how tall the dish text area is - convert to percentage of image height

COMMON PATTERNS:
- Menus often have 2-3 columns
- Left column typically: x=2-8%, w=20-30%
- Middle column typically: x=35-45%, w=20-30%
- Right column typically: x=68-78%, w=20-30%
- Dishes usually have h=4-8% (height)
- First dish often starts at y=15-25%
- Subsequent dishes add 8-12% to y each time

CRITICAL: Measure from the actual image edges, NOT from the menu board edges visible in the photo.

Return JSON:
{
  "dishes": [
    {
      "id": "exact dish name",
      "x": 5.0,
      "y": 18.0,
      "w": 25.0,
      "h": 6.0,
      "allergens": [],
      "removable": [],
      "crossContamination": [],
      "diets": [],
      "details": {}
    }
  ]
}

Be very careful with positioning - overlays will be drawn using these exact coordinates.`

    const userPrompt = `Please analyze this menu image and detect all dishes with their PRECISE locations.

Important:
- Measure coordinates from the actual image edges (not menu board edges)
- Be very accurate with x, y positions - they must align with where the dishes actually appear
- Each dish should have a tight bounding box around its name, price, and description`

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
        model: 'claude-3-haiku-20240307',
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

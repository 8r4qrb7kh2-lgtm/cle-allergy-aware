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

    const systemPrompt = `You are a menu analysis assistant. Your job is to identify dishes and their bounding boxes on menu images.

IMPORTANT: Return coordinates as PIXEL VALUES relative to the image dimensions, NOT percentages.

For each dish, provide:
- pixelX: horizontal pixel distance from LEFT edge of image to LEFT edge of dish name
- pixelY: vertical pixel distance from TOP edge of image to TOP edge of dish name
- pixelWidth: width of the dish text block in pixels
- pixelHeight: height of the dish text block in pixels
- imageWidth: the total width of the image you're analyzing in pixels
- imageHeight: the total height of the image you're analyzing in pixels

MEASUREMENT GUIDELINES:
1. Look at the ENTIRE image - measure from the absolute edges of the digital image file
2. DO NOT measure from menu board edges or decorative borders - use the IMAGE file edges
3. A dish's bounding box should tightly wrap around: dish name + price + description
4. Be precise with pixel coordinates - these will be used to draw overlays

Return JSON format:
{
  "imageWidth": 1920,
  "imageHeight": 2560,
  "dishes": [
    {
      "id": "exact dish name",
      "pixelX": 120,
      "pixelY": 450,
      "pixelWidth": 380,
      "pixelHeight": 95,
      "allergens": [],
      "removable": [],
      "crossContamination": [],
      "diets": [],
      "details": {}
    }
  ]
}

CRITICAL: Report the actual pixel dimensions you observe in the image.`

    const userPrompt = `Analyze this menu image and identify all dishes.

For each dish, provide:
1. The exact dish name
2. Pixel coordinates (pixelX, pixelY) from the top-left corner of the IMAGE FILE
3. Pixel dimensions (pixelWidth, pixelHeight) of the dish text block
4. The total image dimensions (imageWidth, imageHeight) that you're observing

Remember: Measure from the absolute edges of the digital image file, not from menu board edges.`

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
      console.error('Claude API error status:', claudeResponse.status)
      console.error('Claude API error body:', error)
      throw new Error(`Claude API error (${claudeResponse.status}): ${error.substring(0, 200)}`)
    }

    const aiResult = await claudeResponse.json()
    const responseText = aiResult.content[0].text

    console.log('AI Response:', responseText.substring(0, 500)) // Log first 500 chars

    // Parse JSON from response
    let parsed
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                       responseText.match(/```\n([\s\S]*?)\n```/)
      const jsonText = jsonMatch ? jsonMatch[1] : responseText
      parsed = JSON.parse(jsonText)
      console.log('Parsed dishes count:', parsed.dishes?.length || 0)
    } catch (e) {
      console.error('Failed to parse JSON:', responseText)
      console.error('Parse error:', e)
      throw new Error(`Failed to parse AI response as JSON: ${e.message}`)
    }

    // Convert pixel coordinates to percentages
    const imageWidth = parsed.imageWidth || 1920
    const imageHeight = parsed.imageHeight || 2560

    const convertedDishes = (parsed.dishes || []).map(dish => {
      // Convert pixel values to percentages
      const x = ((dish.pixelX || 0) / imageWidth) * 100
      const y = ((dish.pixelY || 0) / imageHeight) * 100
      const w = ((dish.pixelWidth || 0) / imageWidth) * 100
      const h = ((dish.pixelHeight || 0) / imageHeight) * 100

      return {
        id: dish.id,
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
        w: Math.max(0, Math.min(100 - x, w)),
        h: Math.max(0, Math.min(100 - y, h)),
        allergens: dish.allergens || [],
        removable: dish.removable || [],
        crossContamination: dish.crossContamination || [],
        diets: dish.diets || [],
        details: dish.details || {}
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        dishes: convertedDishes
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

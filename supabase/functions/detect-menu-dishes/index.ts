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

COORDINATE SYSTEM - EXTREMELY IMPORTANT:
- x, y, w, h are ALL percentages (0-100) of the ENTIRE image dimensions
- x = horizontal distance from LEFT edge of ENTIRE IMAGE to LEFT edge of dish text
- y = vertical distance from TOP edge of ENTIRE IMAGE to TOP edge of dish text
- w = width of the dish area (name + price + description)
- h = height of the dish area

CRITICAL MEASUREMENT RULES:
1. ALWAYS measure from the absolute edges of the digital image file, NOT from any menu board or visible objects
2. If there's whitespace or borders in the image, include those in your calculations
3. Look at where dishes ACTUALLY appear on screen when viewing the raw image file

STEP-BY-STEP CALCULATION METHOD:
For each dish, imagine the image is 1000 pixels wide and 1000 pixels tall:
1. Count how many pixels from the LEFT edge of the image to where the dish text starts (e.g., 50 pixels)
2. Divide by image width and multiply by 100 to get x% (e.g., 50/1000 * 100 = 5%)
3. Count how many pixels from the TOP edge of the image to where the dish text starts (e.g., 200 pixels)
4. Divide by image height and multiply by 100 to get y% (e.g., 200/1000 * 100 = 20%)
5. Measure the dish text width in pixels and convert to percentage
6. Measure the dish text height in pixels and convert to percentage

VALIDATION CHECKS:
- If your x values are consistently too high or too low, you're measuring from the wrong reference point
- All dishes in a single column should have similar x values (within 1-2%)
- Dishes should have consistent spacing - if y values jump erratically, recheck your measurements
- The sum x + w should never exceed 100
- The sum y + h should never exceed 100

COMMON ERRORS TO AVOID:
❌ Measuring from menu board edge instead of image edge
❌ Using pixel values instead of percentages
❌ Ignoring whitespace/margins in the image
❌ Inconsistent x values for dishes in the same column
❌ Overlays that extend beyond image boundaries (x+w > 100 or y+h > 100)

EXAMPLE MEASUREMENTS:
If image is 800px wide × 1200px tall:
- Dish at pixel position (60, 240) with size (200, 80)
  → x = 60/800 * 100 = 7.5%
  → y = 240/1200 * 100 = 20%
  → w = 200/800 * 100 = 25%
  → h = 80/1200 * 100 = 6.67%

Return JSON:
{
  "dishes": [
    {
      "id": "exact dish name",
      "x": 7.5,
      "y": 20.0,
      "w": 25.0,
      "h": 6.67,
      "allergens": [],
      "removable": [],
      "crossContamination": [],
      "diets": [],
      "details": {}
    }
  ]
}

FINAL REMINDER: Double-check that ALL x, y coordinates are measured from the absolute top-left corner (0, 0) of the entire digital image file.`

    const userPrompt = `Please analyze this menu image and detect all dishes with their PRECISE locations.

CRITICAL INSTRUCTIONS:
1. Measure ALL coordinates from the top-left corner (0,0) of the ENTIRE digital image file
2. Include any whitespace, borders, or margins in your percentage calculations
3. DO NOT measure from menu board edges or visible objects - only from the image file edges
4. Verify that dishes in the same column have consistent x values (within 1-2%)
5. Double-check that x+w ≤ 100 and y+h ≤ 100 for every dish
6. Use the step-by-step calculation method described in the system prompt

Each dish should have a tight bounding box around its name, price, and description.`

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

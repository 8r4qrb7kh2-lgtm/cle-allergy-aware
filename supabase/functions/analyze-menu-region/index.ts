import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@0.30.1'

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY') || '',
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    const { regionImage, dishName, tapX, tapY, regionX, regionY, regionWidth, regionHeight } = await req.json()

    if (!regionImage) {
      return new Response(JSON.stringify({ error: 'No region image provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Extract base64 data
    const base64Data = regionImage.split(',')[1]

    const prompt = `You are analyzing a cropped region of a restaurant menu. The user tapped on this region to indicate where the menu item "${dishName}" is located.

The tap coordinates within this region are:
- tapX: ${tapX}%
- tapY: ${tapY}%

This region represents ${regionWidth}% width and ${regionHeight}% height of the full menu, starting at position (${regionX}%, ${regionY}%).

Your task:
1. Find the exact text "${dishName}" in this image
2. Determine the precise bounding box (x, y, width, height as percentages) that tightly encompasses just this menu item's NAME and PRICE
3. The coordinates should be relative to the FULL MENU IMAGE (not this cropped region)
4. Try to infer common allergens based on the dish name (e.g., "Chicken Parmesan" likely contains dairy, egg, wheat, gluten)

Return ONLY a JSON object with this structure:
{
  "dishName": "exact dish name as it appears",
  "x": number (percentage from left of FULL menu),
  "y": number (percentage from top of FULL menu),
  "w": number (percentage width of FULL menu),
  "h": number (percentage height of FULL menu),
  "allergens": ["dairy", "egg", "wheat", "gluten", "fish", "shellfish", "soy", "tree_nut", "peanut"],
  "removable": [],
  "crossContamination": [],
  "diets": ["Vegan", "Vegetarian", "Pescatarian", "Kosher", "Halal"],
  "details": {}
}

IMPORTANT:
- x and y coordinates must account for the region's offset: add ${regionX} to your calculated x, add ${regionY} to your calculated y
- Make the bounding box as tight as possible around the dish name and price only
- Be generous with allergens if unsure - better safe than sorry
- Only include diets if you're confident (e.g., clear vegetarian dish)

Example calculation:
If you find the dish at 50% x within this region, the full menu x = ${regionX} + (50 * ${regionWidth} / 100) = ${regionX + 50 * regionWidth / 100}%`

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    })

    const textContent = message.content.find((block: any) => block.type === 'text')
    if (!textContent || !textContent.text) {
      throw new Error('No text response from Claude')
    }

    // Extract JSON from response
    let jsonText = textContent.text.trim()

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '')
    }

    const analysis = JSON.parse(jsonText)

    return new Response(JSON.stringify({
      success: true,
      ...analysis
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (error: any) {
    console.error('Error analyzing menu region:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to analyze menu region'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
})

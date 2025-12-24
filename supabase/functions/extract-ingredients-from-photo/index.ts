import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

async function processImageInput(input: string) {
  const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return { mediaType: matches[1], data: matches[2] };
  }
  try {
    const response = await fetch(input);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const base64 = encode(new Uint8Array(buffer));
    return { mediaType: blob.type || 'image/jpeg', data: base64 };
  } catch (e) {
    throw new Error('Invalid image input');
  }
}

serve(async (req) => {
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
    const { imageData } = JSON.parse(await req.text());
    if (!ANTHROPIC_API_KEY || !imageData) throw new Error('Missing API Key or Image Data');

    const imageParts = await processImageInput(imageData);

    console.log('=== Extracting ingredients with per-line bounding boxes ===');

    const prompt = `Analyze this food product image to find and extract the INGREDIENTS list.

IMPORTANT DISTINCTIONS:
- INGREDIENTS = Plain text starting with "INGREDIENTS:" followed by comma-separated food items (flour, water, salt, etc.)
- NUTRITION FACTS = A table/box showing Calories, Fat, Protein, etc. - THIS IS NOT WHAT I WANT

TASK: Find ONLY the ingredient text and provide a bounding box for EACH visual line.

For each line of ingredient text you can see in the image:
1. Read the exact text on that line
2. Provide a tight bounding box that contains JUST that line of text (not too tall, not too short)
3. The bounding box should capture the FULL HEIGHT of the text characters including ascenders and descenders

COORDINATE SYSTEM (percentages of image dimensions, 0-100):
- x = left edge of the text line
- y = TOP edge of that specific line (where the tallest letters begin)
- w = width of the text line
- h = height of JUST that line (typically 2-5% of image height for small text)

Return this JSON:
{
  "found": true,
  "lines": [
    {"text": "INGREDIENTS: FLOUR, WATER, SALT,", "x": 10, "y": 35, "w": 80, "h": 3},
    {"text": "YEAST, OIL, SEASONING", "x": 10, "y": 38, "w": 60, "h": 3}
  ],
  "debug": {
    "ingredient_location": "describe where you see the ingredients text",
    "what_is_above": "what is directly above the first ingredient line",
    "what_is_below": "what is directly below the last ingredient line"
  }
}

CRITICAL RULES:
1. Each line's y coordinate should be where THAT SPECIFIC LINE starts, not the overall region
2. Line heights (h) should be tight - just enough to contain that line's text (usually 2-5%)
3. Do NOT include "Net Wt", website URLs, or Nutrition Facts in your bounding boxes
4. The y value for line 2 should be GREATER than y value for line 1 (lines go top to bottom)
5. If ingredients span 3 visual lines, return 3 separate entries with 3 different y values

Return ONLY the JSON.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: "image", source: { type: "base64", media_type: imageParts.mediaType, data: imageParts.data } },
            { type: "text", text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('API Error:', errorBody);
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.content[0].text;
    console.log('Raw response:', responseText);

    // Parse the response
    let result;
    try {
      const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      console.error('Parse error:', e);
      throw new Error('Could not parse AI response');
    }

    console.log('Parsed result:', JSON.stringify(result, null, 2));

    if (!result.found || !result.lines || result.lines.length === 0) {
      throw new Error('Could not find ingredients in image');
    }

    // Validate and clamp each line's coordinates
    const ingredientLines = result.lines.map((line: any, idx: number) => {
      // Ensure reasonable values
      const x = Math.max(0, Math.min(95, line.x || 10));
      const y = Math.max(0, Math.min(95, line.y || (30 + idx * 4)));
      const w = Math.max(10, Math.min(95, line.w || 80));
      const h = Math.max(1.5, Math.min(10, line.h || 3)); // Line height between 1.5% and 10%

      return {
        text: line.text || '',
        x,
        y,
        w,
        h
      };
    });

    // Sort by y position to ensure correct order
    ingredientLines.sort((a: any, b: any) => a.y - b.y);

    // Calculate overall region from individual lines
    const minX = Math.min(...ingredientLines.map((l: any) => l.x));
    const minY = Math.min(...ingredientLines.map((l: any) => l.y));
    const maxX = Math.max(...ingredientLines.map((l: any) => l.x + l.w));
    const maxY = Math.max(...ingredientLines.map((l: any) => l.y + l.h));

    const region = {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY
    };

    // Log each line
    ingredientLines.forEach((line: any, idx: number) => {
      console.log(`Line ${idx + 1}: "${line.text.substring(0, 40)}..." @ y=${line.y}%, h=${line.h}%`);
    });

    const ingredientList = ingredientLines.map((l: any) => l.text).join(' ');

    return new Response(JSON.stringify({
      success: true,
      ingredientLines,
      ingredientList,
      region,
      debug: result.debug || {}
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({
      success: false,
      error: e.message || "Unknown Error"
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
})

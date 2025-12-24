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

    console.log('=== Finding ingredients with landmark-based location ===');

    // Single prompt that asks for BOTH description and coordinates with verification
    const prompt = `Analyze this food product packaging image to find the INGREDIENTS list.

CRITICAL DISTINCTION:
- INGREDIENTS = Plain text paragraph starting with "INGREDIENTS:" containing comma-separated food items
- NUTRITION FACTS = A bordered table/box with "Nutrition Facts" header, showing calories, fat, protein, etc.

These are TWO DIFFERENT things. I need the INGREDIENTS, NOT the Nutrition Facts table.

TASK:
1. First, visually locate the text that starts with "INGREDIENTS:"
2. Look at where this text physically appears in the image
3. Describe its position relative to other elements
4. Provide bounding box coordinates

Think step by step:
- Where is the word "INGREDIENTS:" in the image? (top/middle/bottom, left/center/right)
- What is directly ABOVE the ingredients text?
- What is directly BELOW the ingredients text?
- Is the Nutrition Facts table ABOVE or BELOW the ingredients?

Based on your analysis, provide:
{
  "found": true/false,
  "position_description": "description of where ingredients are located",
  "above_ingredients": "what appears directly above",
  "below_ingredients": "what appears directly below",
  "nutrition_facts_position": "where is the nutrition table relative to ingredients",
  "region": {
    "x": number (0-100, left edge percentage),
    "y": number (0-100, top edge percentage - THIS IS CRITICAL),
    "w": number (0-100, width percentage),
    "h": number (0-100, height percentage)
  },
  "ingredient_text": "the full text of all ingredients"
}

COORDINATE VERIFICATION:
- If ingredients are in the UPPER half of image → y should be 10-50
- If ingredients are in the MIDDLE of image → y should be 30-60
- If ingredients are in the LOWER half of image → y should be 50-90
- The y value is the TOP edge of the ingredient text

Return ONLY the JSON object.`;

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

    // Log the position analysis for debugging
    console.log('Position description:', result.position_description);
    console.log('Above ingredients:', result.above_ingredients);
    console.log('Below ingredients:', result.below_ingredients);
    console.log('Nutrition Facts position:', result.nutrition_facts_position);

    if (!result.found || !result.region) {
      throw new Error('Could not find ingredients in image');
    }

    // Validate coordinates based on position description
    let region = result.region;

    // Sanity check: if description says "above nutrition facts" but y > 60, something is wrong
    const desc = (result.position_description || '').toLowerCase();
    const nutritionPos = (result.nutrition_facts_position || '').toLowerCase();

    if (nutritionPos.includes('below') && region.y > 55) {
      console.log('WARNING: Position says nutrition is below, but y is high. Adjusting.');
      // If nutrition facts is BELOW ingredients, ingredients should be in upper half
      region.y = Math.min(region.y, 50);
    }

    if (desc.includes('middle') && (region.y < 25 || region.y > 65)) {
      console.log('WARNING: Position says middle, but y is extreme. Adjusting.');
      region.y = 40;
    }

    // Clamp values
    region = {
      x: Math.max(0, Math.min(95, region.x || 10)),
      y: Math.max(0, Math.min(90, region.y || 40)),
      w: Math.max(10, Math.min(95, region.w || 80)),
      h: Math.max(5, Math.min(40, region.h || 15))
    };

    console.log('Final region:', region);

    // Parse ingredient text into lines
    const ingredientText = result.ingredient_text || '';
    let lines: string[] = [];

    if (ingredientText) {
      // Split on common line break patterns
      lines = ingredientText
        .split(/(?:INGREDIENTS:\s*)|(?:\.\s+(?=[A-Z]))|(?:,\s*(?=CONTAINS|ALLERGEN|MAY CONTAIN))/i)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      // If still one big chunk, try to split by visual lines (roughly 60-80 chars)
      if (lines.length === 1 && lines[0].length > 80) {
        const text = lines[0];
        lines = [];
        let start = 0;
        while (start < text.length) {
          let end = Math.min(start + 70, text.length);
          // Find a comma near the end to break at
          if (end < text.length) {
            const commaIdx = text.lastIndexOf(',', end);
            if (commaIdx > start + 30) end = commaIdx + 1;
          }
          lines.push(text.substring(start, end).trim());
          start = end;
        }
      }
    }

    // Fallback if no lines extracted
    if (lines.length === 0) {
      lines = ['(No ingredient text extracted)'];
    }

    // Calculate line positions
    const lineHeight = region.h / lines.length;
    const ingredientLines = lines.map((text: string, idx: number) => ({
      text,
      x: region.x,
      y: region.y + (idx * lineHeight),
      w: region.w,
      h: lineHeight
    }));

    console.log(`Created ${ingredientLines.length} lines`);

    return new Response(JSON.stringify({
      success: true,
      ingredientLines,
      ingredientList: ingredientText,
      region,
      debug: {
        position_description: result.position_description,
        above_ingredients: result.above_ingredients,
        below_ingredients: result.below_ingredients,
        nutrition_facts_position: result.nutrition_facts_position
      }
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

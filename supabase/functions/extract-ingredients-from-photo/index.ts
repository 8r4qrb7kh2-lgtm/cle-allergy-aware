import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

// Helper to extract base64 data and media type from Data URL or fetch from remote URL
async function processImageInput(input: string) {
  // Check if it's already a Data URL
  const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return {
      mediaType: matches[1],
      data: matches[2]
    };
  }

  // Assume it's a URL and try to fetch it
  try {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const base64 = encode(new Uint8Array(buffer));
    return {
      mediaType: blob.type || 'image/jpeg',
      data: base64
    };
  } catch (e) {
    console.error("Error processing image input:", e);
    throw new Error('Invalid image input: Must be valid Data URL or accessible HTTP URL');
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
    const bodyText = await req.text();
    const { imageData } = JSON.parse(bodyText);

    if (!ANTHROPIC_API_KEY || !imageData) {
      throw new Error('Missing API Key or Image Data');
    }

    const imageParts = await processImageInput(imageData);

    console.log('Extracting ingredient lines with bounding boxes...');

    // Single-step extraction with very explicit coordinate instructions
    const extractionPrompt = `Analyze this food product image and extract the ingredient list with PRECISE bounding boxes.

CRITICAL INSTRUCTION:
For each line of text you extract, the bounding box coordinates MUST point to the EXACT LOCATION where that specific text appears in the image. The text and coordinates must match - if you read "INGREDIENTS: WHEAT FLOUR" the bounding box must surround those exact words in the image.

COORDINATE SYSTEM (0-100 percentage scale):
- x = distance from LEFT edge (0=left, 100=right)
- y = distance from TOP edge (0=top, 100=bottom)
- w = width of the text box
- h = height of the text box (typically 2-5% for a single line of text)

TASK:
1. Locate the ingredient list in the image (starts with "INGREDIENTS:" or "Ingredients:")
2. For EACH LINE of text in the ingredient list:
   - Read the exact text on that line
   - Measure the bounding box coordinates for THAT SPECIFIC LINE
   - The coordinates must point to where you see that text

VERIFICATION:
Before outputting, verify that each bounding box actually contains the text you transcribed. The crop at those coordinates should show the exact words in the "text" field.

Return ONLY this JSON format:
{
  "ingredientLines": [
    {"text": "exact text from line 1", "x": number, "y": number, "w": number, "h": number},
    {"text": "exact text from line 2", "x": number, "y": number, "w": number, "h": number}
  ]
}`;

    const extractionResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: "image", source: { type: "base64", media_type: imageParts.mediaType, data: imageParts.data } },
            { type: "text", text: extractionPrompt }
          ]
        }]
      })
    });

    if (!extractionResponse.ok) {
      const errorBody = await extractionResponse.text();
      console.error('Extraction API Error Body:', errorBody);
      throw new Error(`Extraction API Error: ${extractionResponse.status} - ${errorBody}`);
    }

    const extractionData = await extractionResponse.json();

    // DEBUG: Log raw AI response
    const rawResponseText = extractionData.content[0].text;
    console.log('=== RAW AI RESPONSE ===');
    console.log(rawResponseText);
    console.log('=== END RAW RESPONSE ===');

    let result;
    try {
      const cleanJson = rawResponseText.replace(/```json\n?|```/g, '').trim();
      result = JSON.parse(cleanJson);
      console.log('=== PARSED RESULT ===');
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error("Failed to parse extraction JSON", e);
      console.error("Raw response text:", rawResponseText);
      throw new Error("Invalid format from AI");
    }

    let validLines = (result.ingredientLines || []).filter((line: any) =>
      line &&
      typeof line.text === 'string' &&
      typeof line.x === 'number' &&
      typeof line.y === 'number' &&
      typeof line.w === 'number' &&
      typeof line.h === 'number'
    );

    // Validate and fix coordinates - ensure they're in reasonable ranges
    validLines = validLines.map((line: any) => {
      // Clamp values to 0-100 range
      const x = Math.max(0, Math.min(100, line.x));
      const y = Math.max(0, Math.min(100, line.y));
      const w = Math.max(1, Math.min(100 - x, line.w));
      const h = Math.max(1, Math.min(100 - y, line.h));

      return {
        text: line.text,
        x,
        y,
        w,
        h
      };
    });

    console.log(`Extracted ${validLines.length} ingredient lines with coordinates`);

    // DEBUG: Log each line with its coordinates
    validLines.forEach((line: any, idx: number) => {
      console.log(`Line ${idx + 1}: "${line.text.substring(0, 50)}..." | x=${line.x}%, y=${line.y}%, w=${line.w}%, h=${line.h}%`);
    });

    // Construct ingredient list string
    const ingredientList = validLines.map((l: any) => l.text).join(' ');

    return new Response(JSON.stringify({
      success: true,
      ingredientLines: validLines,
      ingredientList: ingredientList
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    console.error("Edge Function Error:", e);
    console.error("Error stack:", e.stack);
    return new Response(JSON.stringify({
      success: false,
      error: e.message || "Unknown Error",
      stack: e.stack || "No stack trace"
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
})

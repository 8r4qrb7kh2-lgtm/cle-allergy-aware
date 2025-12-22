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

    // --- Two-step approach: First find ingredient region, then extract lines within it ---
    // This ensures we constrain the search to the correct area
    console.log('Step 1: Finding ingredient list region...');
    
    // Step 1: Identify the ingredient list region
    const regionPrompt = `Find the bounding box of the ENTIRE ingredient list section in this image.

CRITICAL:
- Look for text that starts with "INGREDIENTS:" or "Ingredients:"
- Find the COMPLETE block from "INGREDIENTS:" to the end of the last ingredient
- IGNORE product names, brand names, nutrition facts, marketing badges
- The ingredient list is typically in smaller text, located in the middle/lower portion

Return the bounding box (x, y, w, h) for the ENTIRE ingredient list section on a 0-1000 scale.
Coordinates: 0 is top/left, 1000 is bottom/right.

Output JSON only:
{ "x": number, "y": number, "w": number, "h": number }`;

    let ingredientRegion = null;
    try {
      const regionResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: "You are a coordinate extractor. Find the bounding box for the ingredient list section only. Return 0-1000 scale coordinates.",
          messages: [{
            role: 'user',
            content: [
              { type: "image", source: { type: "base64", media_type: imageParts.mediaType, data: imageParts.data } },
              { type: "text", text: regionPrompt }
            ]
          }]
        })
      });

      if (regionResponse.ok) {
        const regionData = await regionResponse.json();
        const cleanRegion = regionData.content[0].text.replace(/```json\n?|```/g, '').trim();
        ingredientRegion = JSON.parse(cleanRegion);
        console.log('Ingredient region found:', ingredientRegion);
      }
    } catch (err) {
      console.error('Failed to identify ingredient region:', err);
    }

    // Step 2: Extract lines WITHIN the ingredient region
    console.log('Step 2: Extracting ingredient lines with coordinates...');
    const extractionPrompt = `Extract each line of the ingredient list WITH its precise bounding box coordinates.

${ingredientRegion ? `The ingredient list region is approximately: x=${ingredientRegion.x}, y=${ingredientRegion.y}, w=${ingredientRegion.w}, h=${ingredientRegion.h}. Find each line WITHIN this region.` : 'Find the ingredient list section (starts with "INGREDIENTS:" or "Ingredients:").'}

CRITICAL RULES:
1. ONLY extract lines from the ingredient list section (starts with "INGREDIENTS:")
2. Each line should be a separate entry
3. Extract the exact text as written on the package
4. Determine the precise bounding box (x, y, w, h) on a 0-1000 scale for EACH line
5. The bounding box should tightly encompass just that line of text
6. Coordinates: 0 is top/left, 1000 is bottom/right
7. The y-coordinate should increase for lines that appear lower on the package

${ingredientRegion ? `IMPORTANT: All coordinates MUST be within or very close to the ingredient region (x=${ingredientRegion.x}-${ingredientRegion.x + ingredientRegion.w}, y=${ingredientRegion.y}-${ingredientRegion.y + ingredientRegion.h}). If you see the same text in multiple places, choose the one that is WITHIN this ingredient region.` : ''}

Return ONLY a JSON object with this structure:
{
  "ingredientLines": [
    {
      "text": "INGREDIENTS: WATER, ORGANIC CARROT JUICE CONCENTRATE, SEA SALT,",
      "x": number (0-1000),
      "y": number (0-1000),
      "w": number (0-1000),
      "h": number (0-1000)
    },
    {
      "text": "ORGANIC CELERY JUICE CONCENTRATE, ORGANIC GARLIC,",
      "x": number,
      "y": number,
      "w": number,
      "h": number
    }
  ]
}

DO NOT include:
- Product names
- Brand names  
- Nutrition facts
- Marketing badges or text
- Any text outside the ingredient list section`;

    const extractionResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: "You are a coordinate extractor for ingredient lists. Extract each line of the ingredient list with its exact text and precise bounding box coordinates. Ignore product names, brand names, and other text. Return 0-1000 scale coordinates.",
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
    console.log('=== RAW AI RESPONSE (first 500 chars) ===');
    console.log(rawResponseText.substring(0, 500));
    console.log('=== END RAW RESPONSE ===');
    
    let result;
    try {
      const cleanJson = rawResponseText.replace(/```json\n?|```/g, '').trim();
      result = JSON.parse(cleanJson);
      console.log('=== PARSED RESULT ===');
      console.log(JSON.stringify(result, null, 2));
      console.log('=== END PARSED RESULT ===');
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

    // Validate coordinates are within ingredient region if we have it
    if (ingredientRegion) {
      const regionX = ingredientRegion.x;
      const regionY = ingredientRegion.y;
      const regionRight = regionX + ingredientRegion.w;
      const regionBottom = regionY + ingredientRegion.h;
      
      validLines = validLines.filter((line: any) => {
        const lineX = line.x;
        const lineY = line.y;
        const lineRight = lineX + line.w;
        const lineBottom = lineY + line.h;
        
        // Check if line center is within region (more lenient check)
        const lineCenterX = lineX + (line.w / 2);
        const lineCenterY = lineY + (line.h / 2);
        
        const isWithinRegion = 
          lineCenterX >= regionX && lineCenterX <= regionRight &&
          lineCenterY >= regionY && lineCenterY <= regionBottom;
        
        if (!isWithinRegion) {
          console.warn(`Filtered out line outside ingredient region: "${line.text.substring(0, 50)}..." | coords: (${lineX}, ${lineY}) | region: (${regionX}, ${regionY}, ${ingredientRegion.w}, ${ingredientRegion.h})`);
        }
        
        return isWithinRegion;
      });
    }

    console.log(`Extracted ${validLines.length} ingredient lines with coordinates`);
    
    // DEBUG: Log each line with its coordinates
    validLines.forEach((line: any, idx: number) => {
      console.log(`Line ${idx + 1}: "${line.text.substring(0, 50)}..." | coords: x=${line.x}, y=${line.y}, w=${line.w}, h=${line.h}`);
    });

    // Construct ingredient list string
    const ingredientList = validLines.map((l: any) => l.text).join(' ');

    // Return lines in the expected format
    const formattedLines = validLines.map((line: any) => ({
      text: line.text,
      x: line.x,
      y: line.y,
      w: line.w,
      h: line.h
    }));
    
    // DEBUG: Log the full response being returned
    console.log('Returning formatted lines:', JSON.stringify(formattedLines, null, 2));

    return new Response(JSON.stringify({
      success: true,
      ingredientLines: formattedLines,
      ingredientList: ingredientList
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    console.error("Edge Function Error:", e);
    return new Response(JSON.stringify({
      success: false,
      error: e.message || "Unknown Error"
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
})

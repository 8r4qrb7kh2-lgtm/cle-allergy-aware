import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

interface IngredientLine {
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

async function processImageInput(input: string) {
  const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return { mediaType: matches[1], data: matches[2] };
  }
  // Assume URL
  const response = await fetch(input);
  if (!response.ok) throw new Error('Failed to fetch image');
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  return { mediaType: blob.type || 'image/jpeg', data: encode(new Uint8Array(buffer)) };
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
    const { imageData, barcode } = JSON.parse(bodyText);

    if (!ANTHROPIC_API_KEY || !imageData) {
      throw new Error('Missing API Key or Image Data');
    }

    const imageParts = await processImageInput(imageData);

    console.log('Extracting ingredients from photo...');

    // First pass: Extract ingredient list and check quality
    const qualityCheckPrompt = `You are an expert at reading ingredient lists from product packaging photos.

Analyze this photo and determine:
1. Is the ingredient list clearly visible and readable?
2. Is the text in focus?
3. Is the lighting sufficient?

**CRITICAL EXTRACTION RULES:**
- Extract ONLY the regulatory ingredient list paragraph (usually starts with "INGREDIENTS:").
- Do NOT include "Gluten Free", "Keto", "Non-GMO" badges, or marketing text.
- Do NOT include the Nutrition Facts table.
- If the ingredient list is split across multiple lines, merge them into a single string.

If the photo is too blurry, out of focus, or the ingredient list is not visible, respond with:
{
  "needsRetake": true,
  "message": "The photo is too blurry/unclear. Please retake with better focus and lighting."
}

If the photo is clear, extract the full ingredient list text and respond with:
{
  "needsRetake": false,
  "ingredientList": "INGREDIENTS: ..."
}

Do not include markdown formatting. Just the JSON.`;

    const qualityCheckResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        system: qualityCheckPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: "image", source: { type: "base64", media_type: imageParts.mediaType, data: imageParts.data } },
            { type: "text", text: "Analyze this product packaging photo and extract the ingredient list." }
          ]
        }]
      })
    });

    if (!qualityCheckResponse.ok) {
      const errText = await qualityCheckResponse.text();
      console.error("Anthropic API Error:", qualityCheckResponse.status, errText);
      throw new Error(`Anthropic API Error: ${qualityCheckResponse.status}`);
    }

    const qualityData = await qualityCheckResponse.json();
    console.log("Quality check response:", JSON.stringify(qualityData));

    if (!qualityData.content || !qualityData.content[0] || !qualityData.content[0].text) {
      throw new Error("Invalid response format from AI");
    }

    const qualityResultText = qualityData.content[0].text;
    const qualityJsonMatch = qualityResultText.match(/\{[\s\S]*\}/);
    const qualityResult = qualityJsonMatch ? JSON.parse(qualityJsonMatch[0]) : null;

    if (!qualityResult) {
      throw new Error("Failed to parse quality check result");
    }

    // If photo needs retake, return early
    if (qualityResult.needsRetake) {
      return new Response(JSON.stringify({
        success: false,
        needsRetake: true,
        message: qualityResult.message || 'Photo quality is insufficient. Please retake.'
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const fullIngredientList = qualityResult.ingredientList;

    if (!fullIngredientList || fullIngredientList.trim().length < 10) {
      return new Response(JSON.stringify({
        success: false,
        needsRetake: false,
        message: 'Could not find ingredient list in the photo.'
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Second pass: Get the bounding box of the entire ingredient list region
    const regionDetectionPrompt = `You are an expert at locating ingredient list text on packaging photos.

The ingredient list contains this exact text (search for this specific text in the image):
"${fullIngredientList}"

**What to look for**
- The ingredient list is the TINY regulatory paragraph, usually near the Nutrition Facts box toward the lower half or edge of the package.
- It is much smaller than the product name, brand name, or flavor callout (e.g., "Barbecue"). Ignore decorative banners or hero text.
- Expect a wide, low-height rectangle of dense uppercase text.

**CRITICAL RULE: REJECT BADGES**
- A "Gluten Free" or "Keto Friendly" badge is NOT the ingredient list.
- If the text inside the box is large and sparse (3-4 words), REJECT IT.
- You MUST find the tiny paragraph.

**Strategy**
1. Identify the "Nutrition Facts" panel. The ingredients are usually directly BELOW it.
2. Look for the word "INGREDIENTS:" in bold.
3. If you see a "Gluten Free" box, look *below* or *next* to it for the small print.

Output ONLY valid JSON:
{
  "reasoning": "I initially saw a 'Gluten Free' badge at [coords] but rejected it because it's a badge. I found the actual ingredient paragraph at [coords] which matches the text '${fullIngredientList.substring(0, 20)}...'",
  "ingredientRegion": { "x": 100, "y": 450, "width": 650, "height": 60 }
}

Notes:
- The image is conceptualized as a 1000x1000 grid (x,y,width,height are integers on 0-1000).
- 0 is top/left, 1000 is bottom/right.
- The bounding box MUST include the whole tiny ingredient paragraph that matches: "${fullIngredientList.substring(0, 100)}..."
- Fit the box snugly; no characters cut off.
- No markdown; just JSON.`;

    const regionDetectionResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        system: regionDetectionPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: "image", source: { type: "base64", media_type: imageParts.mediaType, data: imageParts.data } },
            { type: "text", text: "Locate the bounding box of the ingredient list region." }
          ]
        }]
      })
    });

    if (!regionDetectionResponse.ok) {
      const errText = await regionDetectionResponse.text();
      console.error("Region detection API Error:", regionDetectionResponse.status, errText);
      // Fall back to returning just the full text without region
      return new Response(JSON.stringify({
        success: true,
        needsRetake: false,
        ingredientList: fullIngredientList,
        ingredientRegion: null
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const regionData = await regionDetectionResponse.json();
    console.log("Region detection response:", JSON.stringify(regionData));

    if (!regionData.content || !regionData.content[0] || !regionData.content[0].text) {
      // Fall back to full text only
      return new Response(JSON.stringify({
        success: true,
        needsRetake: false,
        ingredientList: fullIngredientList,
        ingredientRegion: null
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const regionResultText = regionData.content[0].text;
    const regionJsonMatch = regionResultText.match(/\{[\s\S]*\}/);
    const regionResult = regionJsonMatch ? JSON.parse(regionJsonMatch[0]) : null;

    if (!regionResult || !regionResult.ingredientRegion) {
      // Fall back to full text only
      return new Response(JSON.stringify({
        success: true,
        needsRetake: false,
        ingredientList: fullIngredientList,
        ingredientRegion: null
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    console.log(`Successfully identified ingredient region`);

    // Third pass: Detect individual text lines with bounding boxes
    const ingredientRegion = regionResult.ingredientRegion;
    const regionContext = ingredientRegion
      ? `\nThe ingredient list region was ESTIMATED at x=${ingredientRegion.x}, y=${ingredientRegion.y}, width=${ingredientRegion.width}, height=${ingredientRegion.height} on a 0-1000 grid. \n**CRITICAL:** Use this region as a HINT. If this region visually corresponds to a "Gluten Free" badge, "Keto" label, or other marketing text instead of the actual ingredient list, IGNORE THIS REGION and find the correct dense text block elsewhere.`
      : '';

    const lineDetectionPrompt = `You are an expert at analyzing ingredient lists on product packaging.

The ingredient list contains this text:
"${fullIngredientList}"

Ingredient list characteristics:
- Tiny, dense regulatory text (smallest text on the package), often near the Nutrition Facts toward the lower half.
- Avoid large decorative or flavor banners (e.g., "Barbecue") near the product name.
- Prefer wide, low-height blocks of fine text.
- Do NOT select certification badges (e.g., "Gluten Free", "Keto Friendly", "Non-GMO", "Organic").
- The box must NOT contain large, sparse text. It should contain small, dense text.
${regionContext}
 
Your task is to identify each PHYSICAL LINE of text in the ingredient list as it appears in the photo.
 
**CRITICAL INSTRUCTIONS FOR ACCURACY:**
1. **PIXEL-PERFECT MATCHING:** You are acting as an OCR Verification Engine. The bounding box you draw MUST contain the pixels of the *specific text string* provided.
2. **ANTI-HALLUCINATION:** Do NOT draw a box around a "Gluten Free" badge just because it is a box. If the text says "INGREDIENTS: WATER...", you must find the pixels that spell "INGREDIENTS: WATER...".
3. **BADGE AVOIDANCE:** If you provided a box that surrounds "Gluten Free" or "Keto" text, YOU HAVE FAILED. Look for the tiny paragraph of regulatory text.
4. **FALLBACK SEARCH:** If the ingredients are hard to find, look at the very bottom of the package or below the nutrition facts. They are never in a "Badge".
 
**IMPORTANT:**
- The ingredient list is in VERY SMALL font - regulatory text, typically the smallest text on the package
- Identify each LINE as it appears visually in the image (e.g., if "INGREDIENTS: WHEAT FLOUR, WATER, SALT" is all on one line, that's ONE line)
- Do NOT parse ingredients semantically - just identify the physical text lines
- Each line may contain multiple ingredients separated by commas
- Include ALL text on each line (including "INGREDIENTS:" label if present)
 
Output ONLY a valid JSON object with this structure:
{
  "reasoning": "I see a Gluten Free badge at [coords], but I am ignoring it because it does not match the ingredient text. I found the ingredient text at [coords].",
  "ingredientLines": [
    {
      "text": "INGREDIENTS: UNBLEACHED NON BROMATED WHEAT FLOUR, WATER, SALT, YEAST,",
      "boundingBox": { "x": 100, "y": 450, "width": 650, "height": 25 }
    },
    {
      "text": "CANOLA OIL, BARBECUE SEASONING: (PAPRIKA, BLACK PEPPER, WHITE PEPPER,",
      "boundingBox": { "x": 100, "y": 475, "width": 650, "height": 25 }
    }
  ]
}
 
Notes:
- Provide coordinates as INTEGERS on a 0-1000 scale.
- x=0, y=0 is the TOP-LEFT corner of the ENTIRE IMAGE
- x=1000, y=1000 is the BOTTOM-RIGHT corner of the ENTIRE IMAGE
- Do NOT crop or use coordinates relative to the found "ingredient region". Use global image coordinates.
- For each bounding box, include the FULL LINE HEIGHT including line spacing (not just the tight text bounds)
- The bounding box should fully contain all text on that line with comfortable spacing
- In the example above, height 25 = 2.5% of the image height.
- Width should span the full horizontal extent of the text on that line
- Height should include the full vertical space the line occupies (including spacing above/below)
- Extract the EXACT text as it appears on that line, preserving all punctuation and capitalization
- Do not include markdown formatting. Just the JSON.`;

    const lineDetectionResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        system: lineDetectionPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: "image", source: { type: "base64", media_type: imageParts.mediaType, data: imageParts.data } },
            {
              type: "text", text: `Identify each physical LINE of text in the ingredient list and provide the bounding box for each line.

**CRITICAL RULES:**
1. **PIXEL-PERFECT MATCHING:** You are acting as an OCR Verification Engine. The bounding box you draw MUST contain the pixels of the *specific text string* provided.
2. **ANTI-HALLUCINATION:** Do NOT draw a box around a "Gluten Free" badge just because it is a box. If the text says "INGREDIENTS: WATER...", you must find the pixels that spell "INGREDIENTS: WATER...".
3. **BADGE AVOIDANCE:** If you provided a box that surrounds "Gluten Free" or "Keto" text, YOU HAVE FAILED. Look for the tiny paragraph of regulatory text.
4. **REASONING REQUIRED:** Before outputting JSON, verify: "Does this box contain the text 'Gluten Free'? If yes, REJECT IT. Does it contain tiny regulatory text? If yes, ACCEPT IT."

Use **0-1000** global integer coordinates. (0,0) is top-left, (1000,1000) is bottom-right.` }
          ]
        }]
      })
    });

    let ingredientLines = null;

    if (lineDetectionResponse.ok) {
      const lineData = await lineDetectionResponse.json();
      console.log("Line detection response:", JSON.stringify(lineData));

      if (lineData.content && lineData.content[0] && lineData.content[0].text) {
        const lineResultText = lineData.content[0].text;
        const lineJsonMatch = lineResultText.match(/\{[\s\S]*\}/);
        const lineResult = lineJsonMatch ? JSON.parse(lineJsonMatch[0]) : null;

        if (lineResult && lineResult.ingredientLines && Array.isArray(lineResult.ingredientLines)) {
          // Normalize 0-1000 coordinates to 0-1 float
          ingredientLines = lineResult.ingredientLines.map((line: any) => {
            if (line.boundingBox) {
              return {
                ...line,
                boundingBox: {
                  x: line.boundingBox.x / 1000,
                  y: line.boundingBox.y / 1000,
                  width: line.boundingBox.width / 1000,
                  height: line.boundingBox.height / 1000
                }
              };
            }
            return line;
          });
          console.log(`Successfully identified ${ingredientLines.length} ingredient lines (normalized)`);
        }
      }
    }

    // Return success with full text, region, and individual lines
    return new Response(JSON.stringify({
      success: true,
      needsRetake: false,
      ingredientList: fullIngredientList,
      ingredientRegion: regionResult.ingredientRegion,
      ingredientLines: ingredientLines,
      imageData: imageData // Return original image for frontend cropping
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    console.error("Edge Function Error:", e);
    return new Response(JSON.stringify({
      success: false,
      error: e.message || "Unknown Error",
      message: "An error occurred while processing the image."
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
})

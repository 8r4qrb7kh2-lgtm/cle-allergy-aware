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

    // Prompt adapted from the successful 'reposition-overlays' (dish detection) logic
    const systemPrompt = `You are an expert at analyzing product packaging to extract ingredient lists.
    
    Your task is to identify the **lines of text** that make up the ingredient list.

    Output ONLY a valid JSON object with the following structure:
    {
      "ingredientLines": [
        { "text": "exact text on this line", "x": number, "y": number, "w": number, "h": number }
      ]
    }

    Notes:
    - The image is conceptualized as a 1000x1000 grid.
    - IMPORTANT: Return ALL coordinates (x, y, w, h) as integers on a **0-1000 scale**.
    - 0 is top/left, 1000 is bottom/right.
    - **CRITICAL: The bounding box MUST be a TIGHT fit around the line of text.**
    - Identify EACH physical line of the ingredient statement as a separate item.
    - **IGNORE** large marketing badges like "Gluten Free", "Keto", etc.
    - **Focus ONLY on the 'INGREDIENTS: ...' text block.**
    - If the text is wrapped, treat each visual line as a separate entry.
    - Do not include markdown formatting. Just the JSON.`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929', // Using the model specified by the user as "working super well"
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: "image", source: { type: "base64", media_type: imageParts.mediaType, data: imageParts.data } },
            { type: "text", text: "Find the ingredient lines and return their text and bounding boxes (0-1000 scale)." }
          ]
        }]
      })
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      throw new Error(`Anthropic API Error: ${claudeResponse.status} ${errText}`);
    }

    const aiData = await claudeResponse.json();
    const resultText = aiData.content[0].text;

    // Parse JSON
    let result;
    try {
      const cleanJson = resultText.replace(/```json\n?|```/g, '').trim();
      result = JSON.parse(cleanJson);
    } catch (e) {
      console.error("Failed to parse AI response:", resultText);
      throw new Error("Invalid format from AI");
    }

    return new Response(JSON.stringify({
      success: true,
      ingredientLines: result.ingredientLines || []
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

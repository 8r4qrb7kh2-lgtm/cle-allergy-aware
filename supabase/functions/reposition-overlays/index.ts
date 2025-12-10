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
        console.log(`Fetching remote image from URL: ${input.substring(0, 50)}...`);
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
        // Read body locally first
        const bodyText = await req.text();
        let body;
        try {
            body = JSON.parse(bodyText);
        } catch (e) {
            throw new Error('Invalid JSON body');
        }

        const { oldImageUrl, newImageUrl, overlays, imageWidth, imageHeight } = body;

        if (!ANTHROPIC_API_KEY) {
            console.error('ANTHROPIC_API_KEY is not set')
            throw new Error('Anthropic API key not configured')
        }

        if (!newImageUrl) {
            throw new Error('Missing required field: newImageUrl')
        }

        const usePixels = imageWidth && imageHeight;
        console.log(`Processing image with Claude. Overlays: ${overlays?.length || 0}. Pixels: ${usePixels ? `Yes (${imageWidth}x${imageHeight})` : 'No'}`)

        let systemPrompt = '';
        let userPromptText = '';
        let messages = [];

        // Prepare image blocks
        const newImageParts = await processImageInput(newImageUrl);
        const newImageBlock = {
            type: "image",
            source: {
                type: "base64",
                media_type: newImageParts.mediaType,
                data: newImageParts.data
            }
        };

        if (oldImageUrl) {
            // DUAL IMAGE MODE: Reposition + Discover
            const oldImageParts = await processImageInput(oldImageUrl);
            const oldImageBlock = {
                type: "image",
                source: {
                    type: "base64",
                    media_type: oldImageParts.mediaType,
                    data: oldImageParts.data
                }
            };

            const overlayDataStr = JSON.stringify((overlays || []).map((o: any) => ({
                id: o.id,
                text: o.text || o.id,
                x: o.x,
                y: o.y,
                w: o.w,
                h: o.h
            })), null, 2);

            systemPrompt = `You are an expert UI layout assistant. Your task is to look at two versions of a restaurant menu (an old version and a new version).

    1. **Reposition Existing Overlays:** Move the bounding box overlays from the old menu to their new corresponding locations on the new menu. Be faithful to the original bounding box sizes relative to the text they cover.
    2. **Discover New Items:** Identify any NEW menu items (dishes) on the new menu that do NOT have a corresponding overlay from the old list. Create a new bounding box for each of these.

    Output ONLY a valid JSON object with the following structure:
    {
      "updatedOverlays": [
        { "id": "original_id", "x": number, "y": number, "w": number, "h": number }
      ],
      "newOverlays": [
        { "id": "new_dish_name", "x": number, "y": number, "w": number, "h": number }
      ]
    }

    Notes:
    - The image is conceptualized as a 1000x1000 grid.
    - IMPORTANT: Return ALL coordinates (x, y, w, h) as integers on a **0-1000 scale**.
    - 0 is top/left, 1000 is bottom/right.
    - **CRITICAL: The bounding box MUST include the dish NAME, the full DESCRIPTION, and the PRICE.**
    - **Fit the box snugly** around the text and price. Ensure **NO characters are cut off**, but avoid excessive empty space on the sides.
    - For "newOverlays", use the dish name as the "id".
    - Do not include markdown formatting. Just the JSON.`;

            userPromptText = `Here is the OLD menu image (first image) and the NEW menu image (second image).
            
Here is the list of existing overlays on the OLD menu image:
${overlayDataStr}

Please reposition these existing items onto the NEW menu image AND identify any completely new dishes that need overlays. Return coordinates on the 0-1000 scale.`;

            messages = [
                {
                    role: 'user',
                    content: [
                        { type: "text", text: "Old Menu Image:" },
                        oldImageBlock,
                        { type: "text", text: "New Menu Image:" },
                        newImageBlock,
                        { type: "text", text: userPromptText }
                    ]
                }
            ];

        } else {
            // SINGLE IMAGE MODE: Discover Only
            systemPrompt = `You are an expert UI layout assistant. Your task is to look at a restaurant menu image and identify all the menu items (dishes, drinks) listed.

    Create a bounding box overlay for each item found.

    Output ONLY a valid JSON object with the following structure:
    {
      "updatedOverlays": [],
      "newOverlays": [
        { "id": "dish_name", "x": number, "y": number, "w": number, "h": number }
      ]
    }

    Notes:
    - The image is conceptualized as a 1000x1000 grid.
    - IMPORTANT: Return ALL coordinates (x, y, w, h) as integers on a **0-1000 scale**.
    - 0 is top/left, 1000 is bottom/right.
    - **CRITICAL: The bounding box MUST include the dish NAME, the full DESCRIPTION, and the PRICE.**
    - **Fit the box snugly** around the text and price. Ensure **NO characters are cut off**, but avoid excessive empty space on the sides.
    - For "newOverlays", use the dish name as the "id".
    - Do not include markdown formatting. Just the JSON.`;

            userPromptText = `Please identify all menu items in this image and return their bounding box coordinates on the 0-1000 scale.`;

            messages = [
                {
                    role: 'user',
                    content: [
                        newImageBlock,
                        { type: "text", text: userPromptText }
                    ]
                }
            ];
        }

        console.log('Calling Claude 3.5 Sonnet...')

        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 8192,
                system: systemPrompt,
                messages: messages
            }),
        })

        if (!claudeResponse.ok) {
            const errorText = await claudeResponse.text()
            console.error('Claude API error:', errorText)
            throw new Error(`Claude API error: ${claudeResponse.status} ${errorText}`)
        }

        const aiResult = await claudeResponse.json()
        const content = aiResult.content[0].text
        console.log('Claude response content:', content.substring(0, 500))

        interface Overlay { id: string; x: number; y: number; w: number; h: number;[key: string]: any; }
        let resultData: { updatedOverlays: Overlay[]; newOverlays: Overlay[] } = { updatedOverlays: [], newOverlays: [] }

        try {
            // clean up any markdown code blocks if present
            const cleanJson = content.replace(/```json\n?|```/g, '').trim()
            resultData = JSON.parse(cleanJson)

            if (resultData.updatedOverlays) {
                // Return raw 0-1000 values
            }
            if (resultData.newOverlays) {
                // Return raw 0-1000 values
            }

        } catch (e) {
            console.error('Failed to parse AI response JSON:', e)
            // Fallback: try to parse as array (backward compatibility or AI hallucination)
            try {
                const arr = JSON.parse(content.replace(/```json\n?|```/g, '').trim());
                if (Array.isArray(arr)) {
                    // Normalize array if needed
                    if (Array.isArray(arr)) {
                        // Return raw 0-1000 values
                        resultData = { updatedOverlays: arr, newOverlays: [] };
                    }
                }
            } catch (e2) {
                console.error('Final parse failure', e2);
                throw new Error('Failed to parse AI response: ' + content.substring(0, 100) + '...')
            }
        }

        return new Response(
            JSON.stringify(resultData),
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            }
        )
    } catch (error) {
        console.error('Error in reposition-overlays:', error)
        // Ensure we return JSON error even for 500s so frontend can read it
        return new Response(
            JSON.stringify({
                error: error.message || 'Unknown error',
                stack: error.stack
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*', // CRITICAL: Must have CORS headers to be readable by browser
                }
            }
        )
    }
})

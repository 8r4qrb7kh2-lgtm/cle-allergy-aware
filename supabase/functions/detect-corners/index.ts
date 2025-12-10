import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

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
        const { image } = JSON.parse(bodyText);

        if (!ANTHROPIC_API_KEY || !image) {
            throw new Error('Missing API Key or Image');
        }

        const imageParts = await processImageInput(image);

        // MATCHING LOGIC FROM reposition-overlays:
        // do not confuse the AI with pixel dimensions.
        // simply ask for the 1000x1000 grid.

        const systemPrompt = `You are an expert UI layout assistant. Your task is to locate the 4 corners of the menu board in this photo for perspective correction.

        Find the **PHYSICAL MENU BOARD** - this is usually a wooden frame around a chalkboard or printed menu mounted on a wall.

        Output ONLY a valid JSON object with the following structure:
        {
            "description": "Brief description of the menu board...",
            "topLeft": { "x": number, "y": number },
            "topRight": { "x": number, "y": number },
            "bottomRight": { "x": number, "y": number },
            "bottomLeft": { "x": number, "y": number }
        }

        Notes:
        - The image is conceptualized as a 1000x1000 grid.
        - IMPORTANT: Return ALL coordinates (x, y) as integers on a **0-1000 scale**.
        - 0 is top/left, 1000 is bottom/right.
        - Find the OUTERMOST corners of the wooden frame (not the inner chalkboard edge).
        - The board may be photographed at an angle, so the shape will be trapezoidal.
        - Do not include markdown formatting. Just the JSON.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 1000,
                system: systemPrompt,
                messages: [{
                    role: 'user',
                    content: [
                        { type: "image", source: { type: "base64", media_type: imageParts.mediaType, data: imageParts.data } },
                        { type: "text", text: "Find the 4 outermost corners on the 0-1000 grid." }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Anthropic API Error:", response.status, errText);
            throw new Error(`Anthropic API Error: ${response.status} ${errText}`);
        }

        const data = await response.json();
        console.log("Anthropic Response:", JSON.stringify(data));

        if (!data.content || !data.content[0] || !data.content[0].text) {
            console.error("Unexpected Anthropic format:", data);
            throw new Error("Invalid response format from AI");
        }

        const resultText = data.content[0].text;
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        let corners = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

        if (!corners) {
            throw new Error("Failed to parse corners JSON from AI response: " + resultText);
        }

        // Return raw 0-1000 values directly


        if (!corners) {
            throw new Error("Failed to parse corners JSON from AI response: " + resultText);
        }

        return new Response(JSON.stringify(corners), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });

    } catch (e) {
        console.error("Edge Function Error:", e);
        return new Response(JSON.stringify({ error: e.message || "Unknown Error" }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
})

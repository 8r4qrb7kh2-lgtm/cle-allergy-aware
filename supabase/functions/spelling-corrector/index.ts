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
    const { query, ingredientName } = await req.json()

    if (!ANTHROPIC_API_KEY) {
      // Return original query if no API key
      return new Response(
        JSON.stringify({ corrected: query }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    // Use Claude to correct spelling
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: `You are a spelling correction assistant for food product searches. The user is searching for "${ingredientName}" and typed the brand name "${query}".

IMPORTANT: Only correct OBVIOUS spelling mistakes. If the brand name looks reasonable (even if you don't recognize it), return it EXACTLY as typed. Do NOT replace valid brand names with alternatives.

Examples:
- "chobaani" → "chobani" (clear typo)
- "danon" → "dannon" (clear typo)
- "sysco" → "sysco" (valid brand, return as-is)
- "chobani" → "chobani" (correct, return as-is)
- "kraft" → "kraft" (correct, return as-is)
- "badia" → "badia" (valid brand, return as-is)

Response (brand name only, no explanations):`
        }]
      }),
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      console.error('Claude API error:', error)
      // Return original query on error
      return new Response(
        JSON.stringify({ corrected: query }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    const aiResult = await claudeResponse.json()
    const corrected = aiResult.content[0].text.trim()

    return new Response(
      JSON.stringify({ corrected: corrected || query }),
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
        error: error.message || 'Failed to process request',
        corrected: req.body?.query || ''
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

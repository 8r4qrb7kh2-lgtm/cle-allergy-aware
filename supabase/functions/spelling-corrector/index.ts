import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

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

    if (!OPENAI_API_KEY) {
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

    // Use ChatGPT to correct spelling
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `You are a spelling correction assistant for food product searches. The user is searching for "${ingredientName}" and typed the brand name "${query}".

If there's a spelling mistake, return ONLY the corrected brand name. If the spelling looks correct, return the original text exactly as provided.

Examples:
- "chobaani" → "chobani"
- "danon" → "dannon"
- "chobani" → "chobani"
- "kraft" → "kraft"

Response (brand name only):`
        }],
        temperature: 0.3,
        max_tokens: 20
      }),
    })

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text()
      console.error('OpenAI API error:', error)
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

    const aiResult = await openaiResponse.json()
    const corrected = aiResult.choices[0].message.content.trim()

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
        corrected: query
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

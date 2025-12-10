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
    const { rawText } = await req.json()

    if (!ANTHROPIC_API_KEY) {
      // Return original text if no API key
      return new Response(
        JSON.stringify({ cleanedText: rawText }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    if (!rawText || rawText.trim().length === 0) {
      return new Response(
        JSON.stringify({ cleanedText: '' }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    console.log('Cleaning up extracted text, length:', rawText.length)

    // Use Claude Haiku to clean up the extracted text - just filter out non-ingredient text
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Here is text extracted from a photo of a product ingredient list. Filter out any extra text that isn't part of the ingredients list and return only the cleaned ingredient list text. Do not add any commentary or explanation - just return the ingredient list.

Extracted text:
${rawText}`
        }]
      }),
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      console.error('Claude API error:', error)
      // Return original text on error
      return new Response(
        JSON.stringify({ cleanedText: rawText }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    const aiResult = await claudeResponse.json()
    const cleanedText = aiResult.content[0].text.trim()
    console.log('Haiku cleaned text:', cleanedText)

    return new Response(
      JSON.stringify({ cleanedText }),
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
        cleanedText: ''
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

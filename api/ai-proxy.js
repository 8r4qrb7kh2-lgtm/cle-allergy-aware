// Vercel Serverless Function to proxy Supabase Edge Function calls
// This avoids CORS issues by making the request server-side

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { functionName, payload } = req.body;

  if (!functionName) {
    return res.status(400).json({ error: 'functionName is required' });
  }

  const SUPABASE_URL = 'https://fgoiyycctnwnghrvsilt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb2l5eWNjdG53bmdocnZzaWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MzY1MjYsImV4cCI6MjA3NjAxMjUyNn0.xlSSXr0Gl7j-vsckrj-2anpPmp4BG2SUIdN-_dquSA8';

  // Create an AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    // Check if response is ok before trying to parse JSON
    const contentType = response.headers.get('content-type') || '';
    let data;
    
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (parseError) {
        const text = await response.text();
        console.error('Failed to parse JSON response:', text.substring(0, 500));
        return res.status(response.status || 500).json({
          error: 'Invalid response from Edge Function',
          message: 'Response was not valid JSON',
          code: 'INVALID_RESPONSE'
        });
      }
    } else {
      // If not JSON, read as text
      const text = await response.text();
      console.error('Non-JSON response from Edge Function:', text.substring(0, 500));
      return res.status(response.status || 500).json({
        error: 'Invalid response format',
        message: text.substring(0, 200),
        code: 'INVALID_RESPONSE'
      });
    }

    // If response indicates an error (including BOOT_ERROR)
    if (!response.ok || data.code === 'BOOT_ERROR') {
      return res.status(response.status || 500).json({
        ...data,
        code: data.code || 'EDGE_FUNCTION_ERROR'
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    // Always clear timeout on error
    clearTimeout(timeoutId);
    console.error('Proxy error:', error);
    
    // Handle timeout errors
    if (error.name === 'AbortError' || error.message.includes('timeout') || error.message.includes('aborted')) {
      return res.status(504).json({
        error: 'Request timeout',
        message: 'The Edge Function took too long to respond',
        code: 'TIMEOUT'
      });
    }
    
    // Handle fetch errors (network issues, etc.)
    if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: 'Unable to reach the Edge Function. It may be starting up.',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    return res.status(500).json({
      error: 'Failed to proxy request',
      message: error.message,
      code: 'PROXY_ERROR'
    });
  }
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const ADMIN_EMAIL = 'mattdav53@gmail.com' // Your email

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
    const {
      restaurantName,
      addedItems,
      removedItems,
      keptItems,
      restaurantSlug
    } = await req.json()

    if (!RESEND_API_KEY) {
      throw new Error('Resend API key not configured')
    }

    // Build email content
    const hasChanges = (addedItems?.length || 0) + (removedItems?.length || 0) > 0

    let htmlContent = `
      <h2>🍽️ Menu Update at ${restaurantName}</h2>
      <p>A restaurant has uploaded a new menu image with detected changes.</p>

      ${hasChanges ? '<h3 style="color: #dc5252;">⚠️ Changes Detected - Approval Needed</h3>' : '<h3 style="color: #4caf50;">✓ No Changes Detected</h3>'}
    `

    if (addedItems?.length > 0) {
      htmlContent += `
        <h4 style="color: #4caf50;">✅ New Items (${addedItems.length}):</h4>
        <ul>
          ${addedItems.map((item: string) => `<li>${item}</li>`).join('')}
        </ul>
      `
    }

    if (removedItems?.length > 0) {
      htmlContent += `
        <h4 style="color: #dc5252;">❌ Removed Items (${removedItems.length}):</h4>
        <ul>
          ${removedItems.map((item: string) => `<li>${item}</li>`).join('')}
        </ul>
      `
    }

    if (keptItems > 0) {
      htmlContent += `<p><strong>Existing items found:</strong> ${keptItems}</p>`
    }

    htmlContent += `
      <hr style="margin: 20px 0;">
      <p><strong>Action Required:</strong> Please review the menu changes at:</p>
      <p><a href="https://clarivore.org/restaurant.html?slug=${restaurantSlug}" style="background: #4c5ad4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Restaurant Menu</a></p>

      <hr style="margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">This notification was sent because menu changes were detected during a confirmation update.</p>
    `

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Clarivore <notifications@clarivore.org>',
        to: [ADMIN_EMAIL],
        subject: `🔔 Menu Update: ${restaurantName}${hasChanges ? ' - Changes Detected' : ''}`,
        html: htmlContent,
      }),
    })

    if (!resendResponse.ok) {
      const error = await resendResponse.text()
      console.error('Resend API error:', error)
      throw new Error(`Failed to send email: ${error}`)
    }

    const result = await resendResponse.json()

    return new Response(
      JSON.stringify({
        success: true,
        emailId: result.id,
        hasChanges
      }),
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
        success: false,
        error: error.message || 'Failed to send notification'
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

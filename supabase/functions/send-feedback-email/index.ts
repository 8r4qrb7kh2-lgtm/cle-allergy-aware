import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const BASE_URL = 'https://clarivore.org'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!SENDGRID_API_KEY) {
      throw new Error('SendGrid API key not configured')
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const body = await req.json()
    const { action } = body

    if (action === 'process_queue') {
      // Process pending feedback emails from the queue
      const now = new Date().toISOString()

      const { data: pendingEmails, error: fetchError } = await supabase
        .from('feedback_email_queue')
        .select(`
          *,
          restaurants:restaurant_id (name, slug)
        `)
        .lte('scheduled_for', now)
        .is('sent_at', null)
        .limit(50)

      if (fetchError) {
        throw new Error(`Failed to fetch pending emails: ${fetchError.message}`)
      }

      console.log(`Found ${pendingEmails?.length || 0} pending feedback emails to send`)

      const results = []

      for (const emailRecord of (pendingEmails || [])) {
        try {
          const restaurantName = emailRecord.restaurants?.name || 'the restaurant'
          const feedbackUrl = `${BASE_URL}/order-feedback.html?token=${emailRecord.feedback_token}`

          const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
              <div style="background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <h2 style="color: #333; margin-top: 0;">How was your meal at ${restaurantName}?</h2>

                <p style="color: #666;">We hope you enjoyed your dining experience! We'd love to hear your feedback.</p>

                <div style="background: #f0f4ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #3651ff; margin-top: 0;">Share your thoughts:</h3>
                  <ul style="color: #666; margin-bottom: 0;">
                    <li>Tell the restaurant what they did well</li>
                    <li>Suggest improvements for allergy-friendly options</li>
                    <li>Request dishes to be made accommodatable for your dietary needs</li>
                  </ul>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${feedbackUrl}" style="background: #3651ff; color: white; padding: 14px 32px; text-decoration: none; border-radius: 999px; font-weight: bold; display: inline-block; box-shadow: 0 4px 12px rgba(54, 81, 255, 0.3);">
                    Give Feedback
                  </a>
                </div>

                <p style="color: #999; font-size: 0.85rem; margin-bottom: 0;">
                  This link is unique to your order and will expire in 7 days.
                </p>
              </div>

              <div style="text-align: center; margin-top: 20px;">
                <p style="color: #999; font-size: 0.8rem; margin: 0;">
                  Sent by <a href="https://clarivore.org" style="color: #3651ff;">Clarivore</a><br>
                  Helping people with food allergies dine safely
                </p>
              </div>
            </body>
            </html>
          `

          const textContent = `
How was your meal at ${restaurantName}?

We hope you enjoyed your dining experience! We'd love to hear your feedback.

Share your thoughts:
- Tell the restaurant what they did well
- Suggest improvements for allergy-friendly options
- Request dishes to be made accommodatable for your dietary needs

Give feedback: ${feedbackUrl}

This link is unique to your order and will expire in 7 days.

---
Sent by Clarivore
https://clarivore.org
          `.trim()

          const sendgridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SENDGRID_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{
                to: [{ email: emailRecord.user_email }]
              }],
              from: { email: 'noreply@clarivore.org', name: 'Clarivore' },
              subject: `How was your meal at ${restaurantName}?`,
              content: [
                { type: 'text/plain', value: textContent },
                { type: 'text/html', value: htmlContent }
              ]
            }),
          })

          if (!sendgridResponse.ok) {
            const error = await sendgridResponse.text()
            console.error(`Failed to send email to ${emailRecord.user_email}:`, error)
            results.push({ id: emailRecord.id, success: false, error })
            continue
          }

          // Mark as sent
          await supabase
            .from('feedback_email_queue')
            .update({ sent_at: new Date().toISOString() })
            .eq('id', emailRecord.id)

          results.push({ id: emailRecord.id, success: true })
          console.log(`Sent feedback email to ${emailRecord.user_email}`)

        } catch (emailError) {
          console.error(`Error processing email ${emailRecord.id}:`, emailError)
          results.push({ id: emailRecord.id, success: false, error: emailError.message })
        }
      }

      return new Response(
        JSON.stringify({ success: true, processed: results.length, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } else if (action === 'queue_feedback_email') {
      // Queue a new feedback email for an order
      const { orderId, restaurantId, userId, userEmail, userAllergens, userDiets, delayHours = 2 } = body

      if (!orderId || !restaurantId || !userEmail) {
        throw new Error('orderId, restaurantId, and userEmail are required')
      }

      // Calculate scheduled time (default 2 hours from now)
      const scheduledFor = new Date()
      scheduledFor.setHours(scheduledFor.getHours() + delayHours)

      const { data: queueEntry, error: insertError } = await supabase
        .from('feedback_email_queue')
        .insert({
          order_id: orderId,
          restaurant_id: restaurantId,
          user_id: userId || null,
          user_email: userEmail,
          user_allergens: userAllergens || [],
          user_diets: userDiets || [],
          scheduled_for: scheduledFor.toISOString()
        })
        .select()
        .single()

      if (insertError) {
        throw new Error(`Failed to queue email: ${insertError.message}`)
      }

      return new Response(
        JSON.stringify({ success: true, queued: queueEntry }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } else {
      throw new Error(`Unknown action: ${action}`)
    }

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

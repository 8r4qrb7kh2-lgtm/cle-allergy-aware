import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')
const REPORT_EMAIL = 'matt.29.ds@gmail.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://fgoiyycctnwnghrvsilt.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

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

        const { message, productName, barcode, analysisDetails } = await req.json()

        // Store report in database
        if (SUPABASE_SERVICE_ROLE_KEY) {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

            const { error: dbError } = await supabase
                .from('product_issue_reports')
                .insert({
                    product_name: productName || null,
                    barcode: barcode || null,
                    message: message,
                    analysis_details: analysisDetails || null
                })

            if (dbError) {
                console.error('Database insert error:', dbError)
                // Continue to send email even if database insert fails
            } else {
                console.log('Report stored in database successfully')
            }
        } else {
            console.warn('SUPABASE_SERVICE_ROLE_KEY not set, skipping database insert')
        }

        if (!message) {
            throw new Error('Message is required')
        }

        const subject = `[Clarivore Issue Report] ${productName || 'Unknown Product'} (${barcode || 'No Barcode'})`

        const textContent = `
User reported an issue with product analysis.

Product: ${productName || 'N/A'}
Barcode: ${barcode || 'N/A'}

User Message:
${message}

Analysis Details:
${JSON.stringify(analysisDetails, null, 2)}
    `.trim()

        const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Issue Report</h2>
        <p><strong>Product:</strong> ${productName || 'N/A'}</p>
        <p><strong>Barcode:</strong> ${barcode || 'N/A'}</p>
        
        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #991b1b; margin-top: 0;">User Message</h3>
          <p style="white-space: pre-wrap; color: #333;">${message}</p>
        </div>

        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
          <h3 style="color: #374151; margin-top: 0;">Analysis Details</h3>
          <pre style="white-space: pre-wrap; font-size: 0.85rem; color: #4b5563; overflow-x: auto;">${JSON.stringify(analysisDetails, null, 2)}</pre>
        </div>
      </div>
    `

        const sendgridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SENDGRID_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                personalizations: [{
                    to: [{ email: REPORT_EMAIL }]
                }],
                from: { email: 'noreply@clarivore.org', name: 'Clarivore Reporter' },
                subject: subject,
                content: [
                    { type: 'text/plain', value: textContent },
                    { type: 'text/html', value: htmlContent }
                ]
            }),
        })

        if (!sendgridResponse.ok) {
            const error = await sendgridResponse.text()
            console.error('SendGrid error:', error)
            throw new Error(`Failed to send email: ${error}`)
        }

        return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Error:', error)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})

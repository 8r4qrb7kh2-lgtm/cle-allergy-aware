import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')
const ADMIN_EMAIL = 'matt.29.ds@gmail.com' // Your email
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

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
    const requestData = await req.json()
    const { type } = requestData

    if (!SENDGRID_API_KEY) {
      throw new Error('SendGrid API key not configured')
    }

    let htmlContent = ''
    let subject = ''
    let emailText = ''

    // Handle different email types
    if (type === 'appeal') {
      const { restaurantName, ingredientName, photoUrl, restaurantSlug } = requestData
      
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">📷 New Ingredient Scan Appeal</h2>
          <p>A restaurant manager has submitted an appeal regarding an AI scanning recommendation.</p>
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Restaurant:</strong> ${restaurantName}</p>
            <p style="margin: 0 0 10px 0;"><strong>Ingredient:</strong> ${ingredientName}</p>
            <p style="margin: 0;"><strong>Status:</strong> Manager disagrees that scanning is required</p>
          </div>

          ${photoUrl ? `
            <div style="margin: 20px 0;">
              <p><strong>Photo submitted:</strong></p>
              <img src="${photoUrl}" alt="Appeal photo" style="max-width: 100%; border-radius: 8px; border: 1px solid #ddd;">
            </div>
          ` : ''}

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p><strong>Review Appeal:</strong></p>
          <p><a href="https://clarivore.org/restaurant.html?slug=${restaurantSlug}" style="background: #4c5ad4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Restaurant</a></p>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">
            Sent by Clarivore<br>
            <a href="https://clarivore.org" style="color: #4c5ad4;">clarivore.org</a>
          </p>
        </body>
        </html>
      `

      emailText = `New Ingredient Scan Appeal\n\nRestaurant: ${restaurantName}\nIngredient: ${ingredientName}\nStatus: Manager disagrees that scanning is required\n\n${photoUrl ? `Photo: ${photoUrl}\n` : ''}View Restaurant: https://clarivore.org/restaurant.html?slug=${restaurantSlug}`
      subject = `📷 Appeal: ${ingredientName} at ${restaurantName}`
    } else if (type === 'appeal_removed') {
      const { restaurantName, ingredientName, restaurantSlug } = requestData
      
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">❌ Ingredient Scan Appeal Removed</h2>
          <p>A restaurant manager has removed a previously submitted appeal.</p>
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Restaurant:</strong> ${restaurantName}</p>
            <p style="margin: 0 0 10px 0;"><strong>Ingredient:</strong> ${ingredientName}</p>
            <p style="margin: 0;"><strong>Status:</strong> Appeal removed - scan requirement has been restored</p>
          </div>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p><strong>View Restaurant:</strong></p>
          <p><a href="https://clarivore.org/restaurant.html?slug=${restaurantSlug}" style="background: #4c5ad4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Restaurant</a></p>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">
            Sent by Clarivore<br>
            <a href="https://clarivore.org" style="color: #4c5ad4;">clarivore.org</a>
          </p>
        </body>
        </html>
      `

      emailText = `Ingredient Scan Appeal Removed\n\nRestaurant: ${restaurantName}\nIngredient: ${ingredientName}\nStatus: Appeal removed - scan requirement has been restored\n\nView Restaurant: https://clarivore.org/restaurant.html?slug=${restaurantSlug}`
      subject = `❌ Appeal Removed: ${ingredientName} at ${restaurantName}`
    } else if (type === 'feedback') {
      const { restaurantName, feedbackText, restaurantSlug } = requestData
      
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">💬 New Customer Feedback</h2>
          <p>You received anonymous feedback about a restaurant's allergy handling:</p>
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Restaurant:</strong> ${restaurantName}</p>
            <p style="margin: 0; white-space: pre-wrap;">${feedbackText}</p>
          </div>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p><strong>View Restaurant:</strong></p>
          <p><a href="https://clarivore.org/restaurant.html?slug=${restaurantSlug}" style="background: #4c5ad4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Restaurant Page</a></p>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">
            Sent by Clarivore<br>
            <a href="https://clarivore.org" style="color: #4c5ad4;">clarivore.org</a>
          </p>
        </body>
        </html>
      `

      emailText = `New Customer Feedback\n\nRestaurant: ${restaurantName}\n\n${feedbackText}\n\nView Restaurant: https://clarivore.org/restaurant.html?slug=${restaurantSlug}`
      subject = `💬 New Feedback: ${restaurantName}`
    } else if (type === 'allergen_issue') {
      const { restaurantName, productName, ingredientList, detectedAllergens, detectedDiets, managerComment, restaurantSlug } = requestData
      
      // Validate required fields
      if (!restaurantName) {
        throw new Error('restaurantName is required for allergen_issue emails')
      }
      if (!productName) {
        throw new Error('productName is required for allergen_issue emails')
      }
      if (!managerComment) {
        throw new Error('managerComment is required for allergen_issue emails')
      }
      
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #dc2626;">⚠️ Allergen/Diet Detection Issue Reported</h2>
          <p>A restaurant manager has reported an issue with the allergen or diet detection for a product.</p>
          
          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Restaurant:</strong> ${restaurantName}</p>
            <p style="margin: 0 0 10px 0;"><strong>Product:</strong> ${productName}</p>
          </div>

          <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <h3 style="margin: 0 0 10px 0; color: #856404;">Manager Comment:</h3>
            <p style="margin: 0; white-space: pre-wrap; color: #856404;">${managerComment}</p>
          </div>

          <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0;">Detected Information:</h3>
            <p style="margin: 0 0 10px 0;"><strong>Ingredient List:</strong></p>
            <p style="margin: 0 0 10px 0; white-space: pre-wrap; font-family: monospace; font-size: 0.9rem;">${ingredientList || 'Not provided'}</p>
            
            <p style="margin: 10px 0 10px 0;"><strong>Detected Allergens:</strong> ${detectedAllergens && detectedAllergens.length > 0 ? detectedAllergens.join(', ') : 'None'}</p>
            <p style="margin: 10px 0 10px 0;"><strong>Detected Diets:</strong> ${detectedDiets && detectedDiets.length > 0 ? detectedDiets.join(', ') : 'None'}</p>
          </div>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p><strong>Review and Resolve:</strong></p>
          <p><a href="https://clarivore.org/restaurant.html?slug=${restaurantSlug}" style="background: #4c5ad4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Restaurant</a></p>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">
            Sent by Clarivore<br>
            <a href="https://clarivore.org" style="color: #4c5ad4;">clarivore.org</a>
          </p>
        </body>
        </html>
      `

      emailText = `Allergen/Diet Detection Issue Reported\n\nRestaurant: ${restaurantName}\nProduct: ${productName}\n\nManager Comment:\n${managerComment}\n\nDetected Allergens: ${detectedAllergens && detectedAllergens.length > 0 ? detectedAllergens.join(', ') : 'None'}\nDetected Diets: ${detectedDiets && detectedDiets.length > 0 ? detectedDiets.join(', ') : 'None'}\n\nIngredient List:\n${ingredientList || 'Not provided'}\n\nView Restaurant: https://clarivore.org/restaurant.html?slug=${restaurantSlug}`
      subject = `⚠️ Allergen Issue: ${productName} at ${restaurantName}`
      
      // Save to database
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
          
          // Get restaurant_id from slug or name
          let restaurantId = null
          if (restaurantSlug) {
            const { data: restaurant } = await supabase
              .from('restaurants')
              .select('id')
              .eq('slug', restaurantSlug)
              .single()
            
            if (restaurant) {
              restaurantId = restaurant.id
            }
          }
          
          // If not found by slug, try by name
          if (!restaurantId && restaurantName) {
            const { data: restaurant } = await supabase
              .from('restaurants')
              .select('id')
              .ilike('name', restaurantName)
              .limit(1)
              .single()
            
            if (restaurant) {
              restaurantId = restaurant.id
            }
          }
          
          await supabase
            .from('allergen_detection_issues')
            .insert({
              restaurant_id: restaurantId,
              restaurant_name: restaurantName,
              restaurant_slug: restaurantSlug || null,
              product_name: productName,
              ingredient_list: ingredientList || null,
              detected_allergens: detectedAllergens || [],
              detected_diets: detectedDiets || [],
              manager_comment: managerComment,
              status: 'pending'
            })
        } catch (dbError) {
          console.error('Error saving allergen issue to database:', dbError)
          // Don't fail the email send if database save fails
        }
      }
    } else {
      // Original menu update email
      const {
        restaurantName,
        addedItems,
        removedItems,
        keptItems,
        restaurantSlug
      } = requestData

      const hasChanges = (addedItems?.length || 0) + (removedItems?.length || 0) > 0

      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Menu Update at ${restaurantName}</h2>
          <p>Your restaurant monitoring system detected a menu change.</p>

          ${hasChanges ? '<h3 style="color: #dc5252;">Changes Detected - Review Required</h3>' : '<h3 style="color: #4caf50;">No Changes Detected</h3>'}
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
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p><strong>Review Changes:</strong></p>
          <p><a href="https://clarivore.org/restaurant.html?slug=${restaurantSlug}" style="background: #4c5ad4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Menu</a></p>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          <p style="color: #666; font-size: 12px;">
            Sent by Clarivore Menu Monitor<br>
            <a href="https://clarivore.org" style="color: #4c5ad4;">clarivore.org</a>
          </p>
        </body>
        </html>
      `

      subject = `🔔 Menu Update: ${restaurantName}${hasChanges ? ' - Changes Detected' : ''}`
      emailText = `Menu Update at ${restaurantName}\n\n${hasChanges ? 'Changes Detected - Review Required' : 'No Changes Detected'}\n\nView Menu: https://clarivore.org/restaurant.html?slug=${restaurantSlug}`
    }

    // Get recipient email (use 'to' from request or fall back to ADMIN_EMAIL)
    const recipientEmail = requestData.to || ADMIN_EMAIL

    // Send email via SendGrid
    const sendgridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: recipientEmail }]
        }],
        from: { email: 'noreply@clarivore.org', name: 'Clarivore' },
        reply_to: { email: ADMIN_EMAIL },
        subject: subject,
        content: [
          { type: 'text/plain', value: emailText },
          { type: 'text/html', value: htmlContent }
        ]
      }),
    })

    if (!sendgridResponse.ok) {
      const error = await sendgridResponse.text()
      console.error('SendGrid API error:', error)
      throw new Error(`Failed to send email: ${error}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email sent successfully'
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

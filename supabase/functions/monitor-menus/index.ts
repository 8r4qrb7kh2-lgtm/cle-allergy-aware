// Supabase Edge Function to monitor restaurant menu changes
// Deploy with: supabase functions deploy monitor-menus
// Schedule with pg_cron in Supabase dashboard

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Restaurant {
  id: string
  name: string
  menu_url: string
  last_checked: string | null
}

interface MenuSnapshot {
  id: string
  restaurant_id: string
  content_hash: string
  menu_text: string
  detected_at: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if a specific restaurant ID was provided
    const url = new URL(req.url)
    const restaurantId = url.searchParams.get('restaurantId')

    // Get restaurants to monitor
    let query = supabase
      .from('restaurants')
      .select('id, name, menu_url, last_checked, total_checks, emails_sent')
      .not('menu_url', 'is', null)

    // If a specific restaurant ID is provided, only check that one
    if (restaurantId) {
      query = query.eq('id', restaurantId)
    }

    const { data: restaurants, error: restaurantsError } = await query

    if (restaurantsError) throw restaurantsError

    const results = []

    for (const restaurant of restaurants as Restaurant[]) {
      console.log(`Checking menu for ${restaurant.name}...`)

      try {
        // Fetch the restaurant's menu page
        const menuResponse = await fetch(restaurant.menu_url, {
          headers: {
            'User-Agent': 'Cleveland Allergy Aware Menu Monitor (contact@example.com)'
          }
        })

        if (!menuResponse.ok) {
          console.error(`Failed to fetch ${restaurant.name}: ${menuResponse.status}`)
          continue
        }

        const html = await menuResponse.text()

        // Extract menu text (remove HTML tags, scripts, styles)
        const menuText = extractMenuText(html)

        // Extract all dishes from HTML using AI
        const detectedDishes = await extractDishesWithAI(html)

        // Calculate hash of content
        const currentHash = await hashContent(menuText)

        // Get the most recent snapshot
        const { data: snapshots } = await supabase
          .from('menu_snapshots')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('detected_at', { ascending: false })
          .limit(1)

        const previousSnapshot = snapshots?.[0] as MenuSnapshot | undefined

        if (!previousSnapshot) {
          // First time checking - save baseline
          await supabase.from('menu_snapshots').insert({
            restaurant_id: restaurant.id,
            content_hash: currentHash,
            menu_text: menuText,
            detected_at: new Date().toISOString()
          })

          results.push({
            restaurant: restaurant.name,
            status: 'baseline_created',
            dishes: detectedDishes
          })
        } else if (previousSnapshot.content_hash !== currentHash) {
          // Content changed!
          console.log(`🚨 Menu changed for ${restaurant.name}`)

          // Save new snapshot
          await supabase.from('menu_snapshots').insert({
            restaurant_id: restaurant.id,
            content_hash: currentHash,
            menu_text: menuText,
            detected_at: new Date().toISOString()
          })

          // Detect what changed
          const changes = detectChanges(previousSnapshot.menu_text, menuText)

          // Try to extract all dish names from detected dishes
          const dishNames = await extractDishNameFromChanges(detectedDishes, changes)

          // Send notification
          const emailSent = await sendNotification({
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            restaurantUrl: restaurant.menu_url,
            changes,
            dishNames,
            previousText: previousSnapshot.menu_text,
            currentText: menuText
          })

          // Increment emails_sent if email was sent
          if (emailSent) {
            await supabase
              .from('restaurants')
              .update({ emails_sent: (restaurant.emails_sent || 0) + 1 })
              .eq('id', restaurant.id)
          }

          results.push({
            restaurant: restaurant.name,
            status: 'changed',
            changes,
            dishes: detectedDishes
          })
        } else {
          results.push({
            restaurant: restaurant.name,
            status: 'no_change',
            dishes: detectedDishes
          })
        }

        // Update last_checked timestamp and increment total_checks
        await supabase
          .from('restaurants')
          .update({
            last_checked: new Date().toISOString(),
            total_checks: (restaurant.total_checks || 0) + 1
          })
          .eq('id', restaurant.id)

      } catch (error) {
        console.error(`Error checking ${restaurant.name}:`, error)
        results.push({
          restaurant: restaurant.name,
          status: 'error',
          error: error.message
        })
      }
    }

    return new Response(
      JSON.stringify({
        checked: restaurants.length,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

function extractMenuText(html: string): string {
  // Remove script and style tags
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')  // Remove HTML tags
    .replace(/\s+/g, ' ')       // Normalize whitespace
    .trim()

  // Extract only menu-related sections (look for keywords)
  const menuKeywords = ['menu', 'dish', 'entree', 'appetizer', 'dessert', 'ingredient']
  const lines = text.split(/[.!?]\s+/)

  const menuLines = lines.filter(line =>
    menuKeywords.some(keyword =>
      line.toLowerCase().includes(keyword)
    )
  )

  return menuLines.length > 0 ? menuLines.join('. ') : text.slice(0, 5000)
}

async function hashContent(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function extractDishesWithAI(html: string): Promise<Array<{ name: string; description: string }>> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    console.warn('ANTHROPIC_API_KEY not set, falling back to pattern matching')
    return extractDishesWithPattern(html)
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `Extract all menu items from this HTML. Return a JSON array of dishes with "name" and "description" fields. The description should include all ingredients/components mentioned.

HTML:
${html.slice(0, 100000)}

Return ONLY valid JSON array, no other text.`
        }]
      })
    })

    if (!response.ok) {
      console.error('Claude API error:', response.status)
      return extractDishesWithPattern(html)
    }

    const data = await response.json()
    const content = data.content[0].text

    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const dishes = JSON.parse(jsonMatch[0])
      return dishes
    }

    return extractDishesWithPattern(html)
  } catch (error) {
    console.error('Error using Claude API:', error)
    return extractDishesWithPattern(html)
  }
}

function extractDishesWithPattern(html: string): Array<{ name: string; description: string }> {
  // Fallback pattern matching
  const menuItemPattern = /<h4>([^<]+)<\/h4>[\s\S]*?<p class="description">([^<]+)<\/p>/gi
  const matches = [...html.matchAll(menuItemPattern)]

  return matches.map(match => ({
    name: match[1].trim(),
    description: match[2].trim()
  }))
}

async function extractDishNameFromChanges(dishes: Array<{ name: string; description: string }>, changes: string[]): Promise<string[]> {
  // Parse all changed words (both added and removed)
  const allChangedWords: string[] = []

  for (const change of changes) {
    if (change.startsWith('Added:')) {
      const words = change.replace('Added:', '').split(',').map(w => w.trim().toLowerCase())
      allChangedWords.push(...words)
    } else if (change.startsWith('Removed:')) {
      const words = change.replace('Removed:', '').split(',').map(w => w.trim().toLowerCase())
      allChangedWords.push(...words)
    }
  }

  if (allChangedWords.length === 0) return []

  const matchedDishes: Array<{ name: string; score: number }> = []

  for (const dish of dishes) {
    const dishName = dish.name.toLowerCase()
    const description = dish.description.toLowerCase()

    // Count how many changed words appear in this dish's name or description
    let score = 0
    for (const word of allChangedWords) {
      if (word.length > 2) {
        // Give higher weight to matches in the dish name
        if (dishName.includes(word)) {
          score += 3
        } else if (description.includes(word)) {
          score += 1
        }
      }
    }

    // Include any dish with at least one matching word
    if (score > 0) {
      matchedDishes.push({ name: dish.name, score })
    }
  }

  // Sort by score (highest first) and return all dishes with scores
  matchedDishes.sort((a, b) => b.score - a.score)

  // Return all matched dish names
  return matchedDishes.map(d => d.name)
}

function detectChanges(oldText: string, newText: string): string[] {
  const changes: string[] = []

  // Simple word-level diff
  const oldWords = new Set(oldText.toLowerCase().split(/\s+/))
  const newWords = new Set(newText.toLowerCase().split(/\s+/))

  // Find added words
  const addedWords = [...newWords].filter(word => !oldWords.has(word) && word.length > 3)
  if (addedWords.length > 0 && addedWords.length < 50) {
    changes.push(`Added: ${addedWords.slice(0, 10).join(', ')}`)
  }

  // Find removed words
  const removedWords = [...oldWords].filter(word => !newWords.has(word) && word.length > 3)
  if (removedWords.length > 0 && removedWords.length < 50) {
    changes.push(`Removed: ${removedWords.slice(0, 10).join(', ')}`)
  }

  if (changes.length === 0) {
    changes.push('Content modified (minor changes detected)')
  }

  return changes
}

async function sendNotification(params: {
  restaurantId: string
  restaurantName: string
  restaurantUrl: string
  changes: string[]
  dishNames: string[]
  previousText: string
  currentText: string
}): Promise<boolean> {
  // Send email via SendGrid
  const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY')

  if (sendgridApiKey) {
    // Fetch restaurant slug for Clarivore link
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('slug')
      .eq('id', params.restaurantId)
      .single()

    // Use slug from database, but fallback to URL-friendly version of restaurant name
    let restaurantSlug = restaurant?.slug
    if (!restaurantSlug || restaurantSlug === 'falafel-cafe-cleveland') {
      // Override for Falafel Cafe Cleveland -> falafel-cafe
      restaurantSlug = 'falafel-cafe'
    }

    // Create Clarivore editor links for each changed dish
    const clarivoreLinks = params.dishNames.map(dishName => ({
      dishName,
      link: `https://clarivore.org/restaurant.html?slug=${restaurantSlug}&edit=1&dishName=${encodeURIComponent(dishName)}&openAI=true`
    }))

    // Create a general editor link without specific dish
    const generalLink = `https://clarivore.org/restaurant.html?slug=${restaurantSlug}&edit=1`

    // Check if changes include allergen-related terms
    const allergenKeywords = ['allergen', 'allergy', 'nut', 'dairy', 'gluten', 'soy', 'egg', 'fish', 'shellfish', 'wheat', 'sesame', 'cheese', 'cream', 'pepper']
    const hasCriticalChanges = params.changes.some(change =>
      allergenKeywords.some(keyword => change.toLowerCase().includes(keyword))
    )

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${hasCriticalChanges ? '#c62828' : '#2e7d32'}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .alert-badge { background: #ff5252; padding: 4px 12px; border-radius: 12px; font-size: 14px; margin-left: 10px; }
          .summary-box { background: ${hasCriticalChanges ? '#ffebee' : '#e8f5e9'}; padding: 15px; margin: 20px 0; border-left: 4px solid ${hasCriticalChanges ? '#c62828' : '#2e7d32'}; }
          .changes-list { background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 4px; }
          .change-item { margin: 8px 0; padding: 8px; background: white; border-radius: 4px; }
          .dish-list { background: #fff3e0; padding: 15px; margin: 20px 0; border-left: 4px solid #ff9800; border-radius: 4px; }
          .dish-item { margin: 12px 0; padding: 12px; background: white; border-radius: 4px; border: 1px solid #e0e0e0; }
          .dish-name { font-weight: 600; font-size: 16px; color: #1976d2; margin-bottom: 8px; }
          .btn { display: inline-block; padding: 12px 24px; background: #1976d2; color: white; text-decoration: none; border-radius: 4px; margin: 10px 5px 10px 0; }
          .btn-small { display: inline-block; padding: 8px 16px; background: #1976d2; color: white; text-decoration: none; border-radius: 4px; margin: 5px 0; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>
              Menu Changes Detected
              ${hasCriticalChanges ? '<span class="alert-badge">🚨 URGENT</span>' : ''}
            </h1>
            <p style="margin: 10px 0 0 0;">
              Changes detected at <strong>${params.restaurantName}</strong>
            </p>
          </div>

          <div class="summary-box">
            <strong>Summary:</strong>
            <ul>
              <li>${params.changes.length} change${params.changes.length > 1 ? 's' : ''} detected</li>
              ${params.dishNames.length > 0 ? `<li>${params.dishNames.length} dish${params.dishNames.length > 1 ? 'es' : ''} affected</li>` : ''}
            </ul>
            ${hasCriticalChanges ? '<p style="margin-top: 10px; color: #c62828; font-weight: 600;">⚠️ This includes allergen-related changes that require immediate attention!</p>' : ''}
          </div>

          ${params.dishNames.length > 0 ? `
          <div class="dish-list">
            <strong>🍽️ Dishes That May Need Updates:</strong>
            ${clarivoreLinks.map(({ dishName, link }) => `
              <div class="dish-item">
                <div class="dish-name">${dishName}</div>
                <a href="${link}" class="btn-small" style="background: #1976d2; color: white; text-decoration: none; display: inline-block;">Update Allergen Info for ${dishName}</a>
              </div>
            `).join('')}
          </div>
          ` : ''}

          <div class="changes-list">
            <strong>Changes Detected:</strong>
            ${params.changes.map(change => {
              return `<div class="change-item"><strong>${change}</strong></div>`
            }).join('')}
          </div>

          <p><strong>Action Required:</strong> Please review the menu changes and update allergen information in the Clarivore system.</p>

          ${params.dishNames.length === 0 ? `
            <a href="${generalLink}" class="btn" style="background: #1976d2; color: white; text-decoration: none; display: inline-block;">Update in Clarivore</a>
          ` : `
            <a href="${generalLink}" class="btn" style="background: #666; color: white; text-decoration: none; display: inline-block;">Open Full Menu Editor</a>
          `}

          <p style="margin-top: 15px; font-size: 14px;">
            <a href="${params.restaurantUrl}" style="color: #666;">View Original Menu</a>
          </p>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
          <div style="font-size: 12px; color: #666; text-align: center;">
            <p style="margin: 5px 0;">
              This is an automated notification from Clarivore Menu Monitor
            </p>
            <p style="margin: 5px 0;">
              Clarivore helps restaurants manage allergen information safely
            </p>
            <p style="margin: 15px 0 5px 0;">
              <a href="https://clarivore.org" style="color: #1976d2; text-decoration: none;">Visit Clarivore</a> |
              <a href="mailto:clarivoretesting@gmail.com?subject=Unsubscribe" style="color: #1976d2; text-decoration: none;">Unsubscribe</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `

    const subject = `${hasCriticalChanges ? '🚨 URGENT: ' : ''}${params.restaurantName} - ${params.changes.length} Menu Change${params.changes.length > 1 ? 's' : ''} Detected`

    // Plain text version for better deliverability
    const emailText = `
Menu Changes Detected ${hasCriticalChanges ? '🚨 URGENT' : ''}

Restaurant: ${params.restaurantName}

Summary:
- ${params.changes.length} change${params.changes.length > 1 ? 's' : ''} detected
${params.dishNames.length > 0 ? `- ${params.dishNames.length} dish${params.dishNames.length > 1 ? 'es' : ''} affected` : ''}
${hasCriticalChanges ? '\n⚠️ This includes allergen-related changes that require immediate attention!' : ''}

${params.dishNames.length > 0 ? `
🍽️ Dishes That May Need Updates:
${clarivoreLinks.map(({ dishName, link }) => `
- ${dishName}
  Update link: ${link}
`).join('')}
` : ''}

Changes Detected:
${params.changes.map(change => `- ${change}`).join('\n')}

Action Required: Please review the menu changes and update allergen information in the Clarivore system.

${params.dishNames.length === 0 ? `Update in Clarivore: ${generalLink}` : `Open Full Menu Editor: ${generalLink}`}
View Original Menu: ${params.restaurantUrl}

---
This is an automated notification from Clarivore Menu Monitor
Clarivore helps restaurants manage allergen information safely

Visit Clarivore: https://clarivore.org
Unsubscribe: mailto:clarivoretesting@gmail.com?subject=Unsubscribe
    `.trim()

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: 'clarivoretesting@gmail.com' }]
        }],
        from: { email: 'clarivoretesting@gmail.com', name: 'Clarivore Menu Monitor' },
        subject: subject,
        content: [
          { type: 'text/plain', value: emailText },
          { type: 'text/html', value: emailHtml }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`SendGrid error (${response.status}):`, errorText)
      console.error('IMPORTANT: If error mentions "unverified sender", you need to verify noreply@clarivore.org in SendGrid')
      console.error('Go to: https://app.sendgrid.com/settings/sender_auth/senders')
      return false
    }

    console.log(`Notification sent successfully for ${params.restaurantName}`)
    return true
  }

  console.log(`No email API key configured for ${params.restaurantName}`)
  return false
}

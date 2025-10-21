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

    // Get all restaurants to monitor
    const { data: restaurants, error: restaurantsError } = await supabase
      .from('restaurants')
      .select('id, name, menu_url, last_checked')
      .not('menu_url', 'is', null)

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

          results.push({ restaurant: restaurant.name, status: 'baseline_created' })
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

          // Send notification
          await sendNotification({
            restaurantName: restaurant.name,
            restaurantUrl: restaurant.menu_url,
            changes,
            previousText: previousSnapshot.menu_text,
            currentText: menuText
          })

          results.push({
            restaurant: restaurant.name,
            status: 'changed',
            changes
          })
        } else {
          results.push({ restaurant: restaurant.name, status: 'no_change' })
        }

        // Update last_checked timestamp
        await supabase
          .from('restaurants')
          .update({ last_checked: new Date().toISOString() })
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
  restaurantName: string
  restaurantUrl: string
  changes: string[]
  previousText: string
  currentText: string
}) {
  // Option 1: Send email via Resend
  const resendApiKey = Deno.env.get('RESEND_API_KEY')

  if (resendApiKey) {
    const emailHtml = `
      <h2>🚨 Menu Change Detected: ${params.restaurantName}</h2>
      <p><strong>Restaurant:</strong> ${params.restaurantName}</p>
      <p><strong>Menu URL:</strong> <a href="${params.restaurantUrl}">${params.restaurantUrl}</a></p>

      <h3>Changes Detected:</h3>
      <ul>
        ${params.changes.map(change => `<li>${change}</li>`).join('')}
      </ul>

      <p><strong>Action Required:</strong> Please review the menu changes and update allergen information in the Cleveland Allergy Aware system.</p>

      <hr>
      <p><small>This is an automated notification from Cleveland Allergy Aware Menu Monitor</small></p>
    `

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Menu Monitor <monitor@yourdomain.com>',
        to: 'your-email@example.com',  // TODO: Make this configurable
        subject: `🚨 Menu Change: ${params.restaurantName}`,
        html: emailHtml
      })
    })
  }

  // Option 2: Could also send to Slack, SMS, etc.
  console.log(`Notification sent for ${params.restaurantName}`)
}

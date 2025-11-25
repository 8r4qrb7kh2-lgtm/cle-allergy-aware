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
    const { ingredientText, productName, labels, categories } = await req.json()

    console.log('Analyzing brand product:', {
      productName: productName || 'unknown',
      ingredientTextLength: ingredientText ? ingredientText.length : 0,
      labelsCount: labels ? labels.length : 0,
      categoriesCount: categories ? categories.length : 0
    })

    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY is not set!')
      throw new Error('Anthropic API key not configured')
    }

    if (!ingredientText || ingredientText.trim().length === 0) {
      throw new Error('ingredientText is required')
    }

    const systemPrompt = `You are an allergen and dietary preference analyzer for a restaurant allergen awareness system.

CRITICAL: You MUST respond with ONLY valid JSON. No explanations, no markdown, no text outside the JSON structure.

TASK:
Analyze the ingredient list and determine:
1. Which allergens are present from this FDA Top 9 list ONLY: dairy, egg, peanut, tree nut, shellfish, fish, wheat, soy, sesame
2. Which dietary preferences this product is compatible with: Vegan, Vegetarian, Pescatarian, Gluten-free
3. Whether a barcode/ingredient label scan is REQUIRED (needsScan = true) or optional (needsScan = false)

CRITICAL ALLERGEN RULES:
- ONLY flag allergens from the top 9 list above
- Do NOT flag "gluten" as a separate allergen - wheat covers gluten-containing grains
- Oats by themselves are NOT wheat and should NOT be flagged (unless ingredients explicitly mention wheat)
- Only flag wheat if wheat/wheat flour/wheat-based ingredients are explicitly present

IMPORTANT RULES FOR ALLERGEN DETECTION:
- "almond milk", "oat milk", "soy milk", "coconut milk", etc. are NOT dairy - they are plant-based alternatives
- Only mark dairy if there's actual milk, cream, butter, cheese, whey, casein, or lactose from animals
- "almond milk" DOES contain tree nuts (almonds)
- Be context-aware: "milk powder" after animal ingredients = dairy, but "almond milk" = tree nut only

DIETARY COMPATIBILITY RULES (DO NOT SKIP):
- ALWAYS return every compatible dietary option. Only leave the diets array empty if the ingredient clearly violates ALL diets (e.g., contains mixed meats with gluten and animal products).
- Plant-based ONLY (no animal-derived terms) → ["Vegan","Vegetarian","Pescatarian"] plus "Gluten-free" if there is no wheat/barley/rye/malt.
- Contains dairy and/or eggs but NO meat or fish (e.g., cream, butter, cheese, mayo) → ["Vegetarian","Pescatarian"] and add "Gluten-free" if no gluten sources.
- Contains fish or seafood but no other meat → ["Pescatarian"] (add "Gluten-free" only if appropriate).
- Contains any meat/poultry/pork/gelatin → usually no Vegan/Vegetarian/Pescatarian, but still include "Gluten-free" when the ingredients are free of gluten grains.
- Vegan implies Vegetarian and Pescatarian. Vegetarian implies Pescatarian. NEVER mark Vegan if any dairy, egg, meat, fish, honey, or gelatin is present.

GLUTEN RULE:
- Only mark "Gluten-free" if there are ZERO gluten sources (wheat, barley, rye, malt, breadcrumbs, batter, semolina, couscous, farro, bulgur, etc.). Oats alone are fine if uncontaminated.

BARCODE SCAN RULES:
- Please require barcode scanning if you think the ingredient will be composed of multiple ingredients. Use common sense and require a barcode scan if you're not sure.
- PROCESSED DAIRY PRODUCTS (cream, heavy cream, light cream, half-and-half, sour cream, whipping cream, coffee creamers, flavored creams, butter, ghee, yogurt, kefir, labneh, mascarpone, ricotta, cream cheese, cottage cheese, etc.) MUST ALWAYS SET needsScan = true. These products vary by brand and contain multiple sub-ingredients, stabilizers, and preservatives.
- If the ingredient name ends with "cream" or clearly references a packaged dairy spread, treat it as processed and require a scan even if no sub-ingredients are listed.

EXAMPLES:
1. "almond milk (water, almonds), oats, dates" → allergens: ["tree nut"], diets: ["Vegan", "Vegetarian", "Pescatarian", "Gluten-free"]
2. "yogurt (milk), oats, honey" → allergens: ["dairy"], diets: ["Vegetarian", "Pescatarian", "Gluten-free"]
3. "chicken, salt, pepper" → allergens: [], diets: []
4. "tuna, water, salt" → allergens: ["fish"], diets: ["Pescatarian", "Gluten-free"]
5. "egg, milk, flour" → allergens: ["egg", "dairy", "wheat"], diets: ["Vegetarian", "Pescatarian"] (NOT gluten-free due to flour)

Return a JSON object with this exact structure:
{
  "allergens": ["allergen1", "allergen2"],
  "diets": ["Vegan", "Vegetarian", "Pescatarian", "Gluten-free"],
  "needsScan": true or false,
  "reasoning": "Brief explanation of your analysis"
}`

    const userPrompt = `Product Name: ${productName || 'Unknown Product'}

Ingredient List: ${ingredientText}

${labels && labels.length > 0 ? `\nProduct Labels: ${labels.join(', ')}` : ''}
${categories && categories.length > 0 ? `\nProduct Categories: ${categories.join(', ')}` : ''}

Please analyze these ingredients and determine allergens and dietary compatibility.`

    console.log('Calling Claude API (Haiku 4.5)...')

    // Call Claude API with Haiku 4.5
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',  // Claude 3.5 Haiku
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt
        }]
      }),
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      console.error('Claude API error:', error)
      console.error('Claude API status:', claudeResponse.status)
      throw new Error(`Claude API error (${claudeResponse.status}): ${error.substring(0, 500)}`)
    }

    const aiResult = await claudeResponse.json()
    const responseText = aiResult.content[0].text
    const modelUsed = aiResult.model || 'unknown';
    console.log('Claude response model:', modelUsed);

    console.log('Claude response received, length:', responseText.length)

    // Parse JSON from response
    let parsed
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                       responseText.match(/```\n([\s\S]*?)\n```/) ||
                       responseText.match(/\{[\s\S]*\}/)

      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText
      parsed = JSON.parse(jsonText)

      console.log('Successfully parsed:', {
        allergens: parsed.allergens,
        diets: parsed.diets,
        needsScan: parsed.needsScan,
        reasoning: parsed.reasoning
      })
    } catch (e) {
      console.error('Failed to parse JSON from Claude response')
      console.error('Response text:', responseText)
      console.error('Parse error:', e.message)

      // Return empty results rather than crashing
      return new Response(
        JSON.stringify({
          error: 'AI returned invalid format',
          allergens: [],
          diets: [],
          needsScan: false,
          raw_response: responseText.substring(0, 200)
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      )
    }

    // Ensure allergens and diets are arrays
    if (!Array.isArray(parsed.allergens)) {
      parsed.allergens = []
    }
    if (!Array.isArray(parsed.diets)) {
      parsed.diets = []
    }
    parsed.needsScan = Boolean(parsed.needsScan);

    // Post-process diets to guarantee coverage even if the model omits them
    const rawText = (ingredientText || '').toLowerCase();
    const tokenSet = new Set(
      (ingredientText || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter(Boolean)
    );
    const hasToken = (...tokens: string[]) => tokens.some(token => tokenSet.has(token));
    const hasPhrase = (...phrases: string[]) => phrases.some(phrase => rawText.includes(phrase));
    const allergenSet = new Set(parsed.allergens.map(a => a.toLowerCase()));

    const hasDairy = allergenSet.has('dairy') || hasToken('cream','milk','butter','cheese','yogurt','yoghurt','ghee','casein','whey','custard','kefir','labneh','mascarpone','ricotta','sour','mozzarella');
    const hasHalfAndHalf = hasPhrase('half and half','half-and-half');
    const hasEgg = allergenSet.has('egg') || hasToken('egg','eggs','yolk','yolks','albumen');
    const hasFish = allergenSet.has('fish') || hasToken('fish','salmon','tuna','cod','anchovy','anchovies','sardine','trout','tilapia','halibut','mahi','snapper');
    const hasShellfish = allergenSet.has('shellfish') || hasToken('shrimp','prawn','lobster','crab','clam','clams','mussel','mussels','scallop','scallops','oyster','oysters');
    const hasMeat = hasToken('beef','steak','pork','bacon','ham','prosciutto','salami','chicken','turkey','duck','lamb','veal','sausage','sausages','pepperoni','meatball','chorizo','pastrami','corned','brisket','gelatin','gelatine','lard');
    const hasHoney = hasToken('honey');
    const hasGelatin = hasToken('gelatin','gelatine','collagen','lard');
    const containsAnimalProduct = hasMeat || hasFish || hasShellfish || hasDairy || hasHalfAndHalf || hasEgg || hasHoney || hasGelatin;

    const glutenTokens = [
      'wheat','flour','breadcrumbs','breadcrumb','bread','pasta','spaghetti','noodles','barley','rye','malt',
      'semolina','spelt','farro','bulgur','couscous','cracker','crackers','pretzel','pretzels','cake','cookies',
      'biscuit','biscuits','batter','pastry','dough','seitan'
    ];
    const hasGluten = allergenSet.has('wheat') || glutenTokens.some(token => tokenSet.has(token));

    const dietsSet = new Set(
      Array.isArray(parsed.diets) ? parsed.diets.filter(Boolean) : []
    );

    const addDiet = (diet: string) => dietsSet.add(diet);
    const removeDiet = (diet: string) => dietsSet.delete(diet);

    if (dietsSet.size === 0) {
      if (!containsAnimalProduct) {
        addDiet('Vegan');
        addDiet('Vegetarian');
        addDiet('Pescatarian');
      } else if (!hasMeat && !hasFish && !hasShellfish) {
        addDiet('Vegetarian');
        addDiet('Pescatarian');
      } else if (!hasMeat && (hasFish || hasShellfish)) {
        addDiet('Pescatarian');
      }
    }

    if (hasDairy || hasHalfAndHalf || hasEgg || hasHoney || hasGelatin) {
      removeDiet('Vegan');
    }
    if (hasFish || hasShellfish || hasMeat) {
      removeDiet('Vegetarian');
    }
    if (hasMeat) {
      removeDiet('Pescatarian');
    }

    if (dietsSet.has('Vegan')) {
      addDiet('Vegetarian');
      addDiet('Pescatarian');
    }
    if (dietsSet.has('Vegetarian')) {
      addDiet('Pescatarian');
    }

    if (hasGluten) {
      removeDiet('Gluten-free');
    } else {
      addDiet('Gluten-free');
    }

    parsed.diets = Array.from(dietsSet);

    const needsScan = Boolean(parsed.needsScan);
    console.log(`needsScan decision (model ${modelUsed}):`, needsScan, '-', parsed.reasoning || 'no reasoning provided');
    console.log('Final diets after safeguards:', parsed.diets);

    return new Response(
      JSON.stringify({
        allergens: parsed.allergens,
        diets: parsed.diets,
        needsScan,
        reasoning: parsed.reasoning || ''
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )

  } catch (error) {
    console.error('Error in analyze-brand-allergens:', error)
    console.error('Error stack:', error.stack)
    console.error('Error name:', error.name)
    console.error('Error message:', error.message)

    return new Response(
        JSON.stringify({
        error: error.message || 'Failed to process request',
        errorName: error.name,
        allergens: [],
        diets: [],
          needsScan: false,
        debug: {
          message: error.message,
          stack: error.stack?.substring(0, 500)
        }
      }),
      {
        status: 200,  // Changed to 200 to avoid 500 errors on client side
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  }
})

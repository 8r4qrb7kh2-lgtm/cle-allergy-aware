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
1. Which allergens are present from this FDA Top 9 list ONLY: dairy, egg, peanut, tree nut, shellfish, fish, wheat, soy, sesame. For each detected allergen, list the SPECIFIC ingredients that triggered it.
2. Which dietary preferences this product is compatible with: Vegan, Vegetarian, Pescatarian, Gluten-free. For each diet, determine compliance and provide a specific reason.
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
- Plant-based ONLY (no animal-derived terms) → ["Vegan","Vegetarian","Pescatarian"] plus "Gluten-free" if there is no wheat/barley/rye/malt.
- Contains dairy and/or eggs but NO meat or fish (e.g., cream, butter, cheese, mayo) → ["Vegetarian","Pescatarian"] and add "Gluten-free" if no gluten sources.
- Contains fish or seafood but no other meat → ["Pescatarian"] (add "Gluten-free" only if appropriate).
- Contains any meat/poultry/pork/gelatin → usually no Vegan/Vegetarian/Pescatarian, but still include "Gluten-free" when the ingredients are free of gluten grains.
- Vegan implies Vegetarian and Pescatarian. Vegetarian implies Pescatarian. NEVER mark Vegan if any dairy, egg, meat, fish, honey, or gelatin is present.

- Only mark "Gluten-free" if there are ZERO gluten sources (wheat, barley, rye, malt, breadcrumbs, batter, semolina, couscous, farro, bulgur, etc.). Oats alone are fine if uncontaminated.

CRITICAL FOR "REASON" FIELD:
- If is_compliant is FALSE, the "reason" MUST be a comma-separated list of the SPECIFIC INGREDIENTS from the text that cause the violation.
- DO NOT use generic terms like "Contains dairy" or "Contains meat".
- ONLY list the actual ingredient names found in the text.
- Example: "Pasteurized Lowfat Milk, Nonfat Milk" (NOT "Contains dairy products")
- Example: "Wheat Flour, Barley Malt" (NOT "Contains gluten")

BARCODE SCAN RULES:
- Please require barcode scanning if you think the ingredient will be composed of multiple ingredients. Use common sense and require a barcode scan if you're not sure.
- PROCESSED DAIRY PRODUCTS (cream, heavy cream, light cream, half-and-half, sour cream, whipping cream, coffee creamers, flavored creams, butter, ghee, yogurt, kefir, labneh, mascarpone, ricotta, cream cheese, cottage cheese, etc.) MUST ALWAYS SET needsScan = true. These products vary by brand and contain multiple sub-ingredients, stabilizers, and preservatives.
- If the ingredient name ends with "cream" or clearly references a packaged dairy spread, treat it as processed and require a scan even if no sub-ingredients are listed.

EXAMPLES:
1. "almond milk (water, almonds), oats, dates"
   allergens: [{ "name": "tree nut", "triggers": ["almonds"] }]
   dietary_compliance: {
     "Vegan": { "is_compliant": true, "reason": "No animal products found." },
     "Vegetarian": { "is_compliant": true, "reason": "No meat or animal products found." },
     "Pescatarian": { "is_compliant": true, "reason": "No meat found." },
     "Gluten-free": { "is_compliant": true, "reason": "No gluten sources found." }
   }

2. "yogurt (milk), oats, honey"
   allergens: [{ "name": "dairy", "triggers": ["yogurt (milk)"] }]
   dietary_compliance: {
     "Vegan": { "is_compliant": false, "reason": "yogurt (milk), honey" },
     "Vegetarian": { "is_compliant": true, "reason": "Contains dairy and honey, but no meat." },
     "Pescatarian": { "is_compliant": true, "reason": "Contains dairy, but no meat." },
     "Gluten-free": { "is_compliant": true, "reason": "No gluten sources found." }
   }

Return a JSON object with this exact structure:
{
  "allergens": [
    { "name": "allergen1", "triggers": ["ingredient1", "ingredient2"] }
  ],
  // CRITICAL: For each allergen, you MUST list the specific ingredients (triggers) that caused it to be flagged.
  // Do NOT return simple strings like ["milk"]. Return objects with "name" and "triggers".
  "dietary_compliance": {
    "Vegan": { "is_compliant": boolean, "reason": "string" },
    "Vegetarian": { "is_compliant": boolean, "reason": "string" },
    "Pescatarian": { "is_compliant": boolean, "reason": "string" },
    "Gluten-free": { "is_compliant": boolean, "reason": "string" }
  },
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
        max_tokens: 2000,
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
        allergensCount: parsed.allergens?.length || 0,
        dietsCount: Object.keys(parsed.dietary_compliance || {}).length,
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
          dietary_compliance: {},
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

    // Ensure allergens is array of objects
    if (!Array.isArray(parsed.allergens)) {
      parsed.allergens = []
    }
    // Handle legacy string array format if AI hallucinates old format
    if (parsed.allergens.length > 0 && typeof parsed.allergens[0] === 'string') {
      parsed.allergens = parsed.allergens.map((a: string) => ({ name: a, triggers: [] }));
    }

    // Ensure dietary_compliance is object
    if (!parsed.dietary_compliance || typeof parsed.dietary_compliance !== 'object') {
      parsed.dietary_compliance = {};
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
    // Helper to find matching tokens
    const getMatchingTokens = (...tokens: string[]) => tokens.filter(token => tokenSet.has(token));
    const getMatchingPhrases = (...phrases: string[]) => phrases.filter(phrase => rawText.includes(phrase));

    // Helper to check if allergen is present in parsed results
    const hasAllergen = (name: string) => parsed.allergens.some((a: any) => a.name.toLowerCase() === name.toLowerCase());

    // Helper to get triggers for an allergen
    const getAllergenTriggers = (name: string) => {
      const allergen = parsed.allergens.find((a: any) => a.name.toLowerCase() === name.toLowerCase());
      return allergen ? (allergen.triggers || []) : [];
    };

    const addAllergen = (name: string, trigger: string) => {
      if (!hasAllergen(name)) {
        parsed.allergens.push({ name, triggers: [trigger] });
      }
    };

    // Helper to combine triggers, preferring specific AI-detected ones over generic keywords
    const collectTriggers = (specificTriggers: string[], ...keywordSources: string[][]) => {
      if (specificTriggers.length > 0) return specificTriggers;
      return keywordSources.flat();
    };

    // Collect triggers for each category
    const dairySpecific = getAllergenTriggers('dairy');
    const dairyKeywords = [
      ...getMatchingTokens('cream', 'butter', 'cheese', 'yogurt', 'yoghurt', 'ghee', 'casein', 'whey', 'custard', 'kefir', 'labneh', 'mascarpone', 'ricotta', 'sour', 'mozzarella'),
      ...getMatchingPhrases('half and half', 'half-and-half')
    ];

    // Only add 'milk' if it's not part of a plant-based milk phrase
    if (tokenSet.has('milk')) {
      const plantMilks = ['almond milk', 'soy milk', 'oat milk', 'coconut milk', 'rice milk', 'cashew milk', 'hemp milk', 'pea milk', 'macadamia milk', 'flax milk'];
      const hasPlantMilk = plantMilks.some(pm => rawText.includes(pm));
      // Simple heuristic: if we find "milk" but also a plant milk phrase, we need to be careful.
      // Ideally we'd check if there's an "orphan" milk, but for now, let's trust the AI more if plant milk is present,
      // OR check if "milk" appears more times than plant milk phrases? 
      // Better: check if the string "milk" exists not preceded by these words.
      // But we only have rawText.

      // Let's use a regex to find "milk" NOT preceded by plant bases.
      // \b(almond|soy|oat|coconut|rice|cashew|hemp|pea|macadamia|flax)\s+milk\b
      const plantMilkRegex = /\b(almond|soy|oat|coconut|rice|cashew|hemp|pea|macadamia|flax)\s+milk\b/gi;
      const allMilkRegex = /\bmilk\b/gi;

      const plantMatches = (rawText.match(plantMilkRegex) || []).length;
      const allMatches = (rawText.match(allMilkRegex) || []).length;

      if (allMatches > plantMatches) {
        dairyKeywords.push('milk');
      }
    }
    const dairyTriggers = collectTriggers(dairySpecific, dairyKeywords);
    const hasDairy = dairyTriggers.length > 0;
    if (hasDairy && !hasAllergen('dairy')) addAllergen('dairy', dairyTriggers[0] || 'Detected by keyword match');

    const eggSpecific = getAllergenTriggers('egg');
    const eggKeywords = getMatchingTokens('egg', 'eggs', 'yolk', 'yolks', 'albumen');
    const eggTriggers = collectTriggers(eggSpecific, eggKeywords);
    const hasEgg = eggTriggers.length > 0;
    if (hasEgg && !hasAllergen('egg')) addAllergen('egg', eggTriggers[0] || 'Detected by keyword match');

    const fishSpecific = getAllergenTriggers('fish');
    const fishKeywords = getMatchingTokens('fish', 'salmon', 'tuna', 'cod', 'anchovy', 'anchovies', 'sardine', 'trout', 'tilapia', 'halibut', 'mahi', 'snapper');
    const fishTriggers = collectTriggers(fishSpecific, fishKeywords);
    const hasFish = fishTriggers.length > 0;
    if (hasFish && !hasAllergen('fish')) addAllergen('fish', fishTriggers[0] || 'Detected by keyword match');

    const shellfishSpecific = getAllergenTriggers('shellfish');
    const shellfishKeywords = getMatchingTokens('shrimp', 'prawn', 'lobster', 'crab', 'clam', 'clams', 'mussel', 'mussels', 'scallop', 'scallops', 'oyster', 'oysters');
    const shellfishTriggers = collectTriggers(shellfishSpecific, shellfishKeywords);
    const hasShellfish = shellfishTriggers.length > 0;
    if (hasShellfish && !hasAllergen('shellfish')) addAllergen('shellfish', shellfishTriggers[0] || 'Detected by keyword match');

    const meatTriggers = getMatchingTokens('beef', 'steak', 'pork', 'bacon', 'ham', 'prosciutto', 'salami', 'chicken', 'turkey', 'duck', 'lamb', 'veal', 'sausage', 'sausages', 'pepperoni', 'meatball', 'chorizo', 'pastrami', 'corned', 'brisket', 'gelatin', 'gelatine', 'lard');
    const hasMeat = meatTriggers.length > 0;

    const honeyTriggers = getMatchingTokens('honey');
    const hasHoney = honeyTriggers.length > 0;

    const gelatinTriggers = getMatchingTokens('gelatin', 'gelatine', 'collagen', 'lard');
    const hasGelatin = gelatinTriggers.length > 0;

    const containsAnimalProduct = hasMeat || hasFish || hasShellfish || hasDairy || hasEgg || hasHoney || hasGelatin;

    const glutenTokens = [
      'wheat', 'flour', 'breadcrumbs', 'breadcrumb', 'bread', 'pasta', 'spaghetti', 'noodles', 'barley', 'rye', 'malt',
      'semolina', 'spelt', 'farro', 'bulgur', 'couscous', 'cracker', 'crackers', 'pretzel', 'pretzels', 'cake', 'cookies',
      'biscuit', 'biscuits', 'batter', 'pastry', 'dough', 'seitan'
    ];
    const glutenSpecific = getAllergenTriggers('wheat');
    const glutenKeywords = getMatchingTokens(...glutenTokens);
    const glutenTriggers = collectTriggers(glutenSpecific, glutenKeywords);
    const hasGluten = glutenTriggers.length > 0;

    // Update dietary compliance - can both set non-compliant AND fix incorrect AI responses
    const setCompliance = (diet: string, isCompliant: boolean, reason: string) => {
      parsed.dietary_compliance[diet] = { is_compliant: isCompliant, reason };
    };

    // Helper to format triggers for display - just ingredient names, no categories
    const formatTriggers = (triggers: string[]) => {
      // Return unique ingredient names exactly as they appear
      const unique = [...new Set(triggers)];
      return unique.join(', ');
    };

    // VEGAN: Not compatible with ANY animal products (dairy, eggs, meat, fish, shellfish, honey, gelatin)
    if (containsAnimalProduct) {
      const allTriggers = [
        ...dairyTriggers,
        ...eggTriggers,
        ...meatTriggers,
        ...fishTriggers,
        ...shellfishTriggers,
        ...honeyTriggers,
        ...gelatinTriggers
      ];
      setCompliance('Vegan', false, formatTriggers(allTriggers));
    } else {
      setCompliance('Vegan', true, 'No animal products found.');
    }

    // VEGETARIAN: Compatible with dairy, eggs, honey. NOT compatible with meat, fish, shellfish, gelatin
    if (hasMeat || hasFish || hasShellfish || hasGelatin) {
      const triggers = [...meatTriggers, ...fishTriggers, ...shellfishTriggers, ...gelatinTriggers];
      setCompliance('Vegetarian', false, formatTriggers(triggers));
    } else {
      setCompliance('Vegetarian', true, 'No meat, fish, or shellfish found.');
    }

    // PESCATARIAN: Compatible with dairy, eggs, honey, fish, shellfish. NOT compatible with meat, gelatin
    if (hasMeat || hasGelatin) {
      const triggers = [...meatTriggers, ...gelatinTriggers];
      setCompliance('Pescatarian', false, formatTriggers(triggers));
    } else {
      setCompliance('Pescatarian', true, 'No meat found.');
    }

    // GLUTEN-FREE: Not compatible with wheat/gluten
    if (hasGluten) {
      setCompliance('Gluten-free', false, formatTriggers(glutenTriggers));
    } else {
      setCompliance('Gluten-free', true, 'No gluten sources found.');
    }

    // Construct legacy diets array for backward compatibility
    const diets = Object.entries(parsed.dietary_compliance)
      .filter(([_, status]: [string, any]) => status.is_compliant)
      .map(([diet]) => diet);

    const needsScan = Boolean(parsed.needsScan);
    console.log(`needsScan decision (model ${modelUsed}):`, needsScan, '-', parsed.reasoning || 'no reasoning provided');
    console.log('Final diets:', diets);

    return new Response(
      JSON.stringify({
        allergens: parsed.allergens, // Now array of objects {name, triggers}
        diets: diets, // Legacy array of strings
        dietary_compliance: parsed.dietary_compliance, // New detailed object
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

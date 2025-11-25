import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

// CORS headers - defined outside handler to ensure they're always available
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  // Handle CORS preflight requests FIRST - before any other logic
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return new Response('ok', {
      status: 200,
      headers: corsHeaders
    })
  }

  // Check for API key early and return proper error if missing
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set!');
    return new Response(
      JSON.stringify({
        error: 'Server configuration error',
        message: 'Anthropic API key not configured'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }

  try {
    const { text, dishName, imageData, generateDescription } = await req.json()

    console.log('Request received:', {
      hasImageData: !!imageData,
      imageDataLength: imageData ? imageData.length : 0,
      hasText: !!text,
      dishName: dishName || 'none'
    })

    console.log('API key is configured, proceeding with Claude API call...')

    // Check if this is a description generation request
    const isDescriptionGeneration = generateDescription === true || (text && text.includes('GENERATE_DESCRIPTION_MODE'))
    
    let systemPrompt = ''
    let userPrompt = ''
    
    if(isDescriptionGeneration){
      // For description generation, generate a narrative-style recipe paragraph
      systemPrompt = `You are a professional recipe writer. Generate complete, detailed recipes written as a single flowing paragraph that mentions ingredients naturally within the preparation steps.

The recipe should:
- Start with "To make [dish name], start by..."
- Mention ingredients naturally as they're used in the preparation (e.g., "combine ground beef with ground pork, breadcrumbs, grated parmesan cheese, minced garlic...")
- Describe each preparation step in detail
- Flow naturally from one step to the next
- Include specific cooking methods, temperatures, and times where relevant
- End with serving instructions or finishing touches
- DO NOT include a separate ingredients list or "Ingredients:" section
- DO NOT use bullet points or numbered lists

Return ONLY plain text. No JSON, no markdown, no code blocks. Write it as a single continuous paragraph that reads like a narrative recipe.`
      
      userPrompt = `Generate a complete recipe for "${dishName || 'this dish'}".

Write it as a single flowing paragraph that starts with "To make [dish name], start by..." and mentions ingredients naturally as they're used in the preparation steps. Do NOT include a separate ingredients list at the beginning. Instead, mention all ingredients naturally within the narrative as you describe the preparation process.

Include ingredient details (e.g., "diced onion", "minced garlic", "crushed tomatoes") as they appear in the steps. Describe the preparation in detail, following the format:

"To make [dish name], start by preparing [component]: combine [ingredients mentioned naturally], then [next step]. [Continue describing steps in detail, mentioning ingredients as they're used]. [Finish with serving instructions]."

Be thorough and specific about ingredient preparation (diced, minced, chopped, etc.) and cooking techniques. Write it all as one continuous paragraph without any lists or sections.`
    } else {
      // Original ingredient extraction logic
      systemPrompt = imageData
        ? `You are an ingredient analysis assistant for a restaurant allergen awareness system.

Respond with ONLY valid JSON matching the schema below—no extra text.

Read every ingredient mentioned in the image, including optional items or garnishes, and create a separate entry for each.

For each ingredient:

- Decide whether a barcode scan is required. Set needsScan=true when you believe the ingredient is or could be made of multiple sub-ingredients (processed, packaged, blended, or branded products). Set it to false when the ingredient is clearly a single whole item.

- Answer the following questions one-by-one: does this contain dairy?, does this contain egg?, does this contain peanut?, does this contain tree nut?, does this contain shellfish?, does this contain fish?, does this contain soy?, does this contain sesame?, and does this contain wheat? Include the allergen in the list only when the ingredient clearly contains it, but you must consider all nine before responding.

- Answer the following questions one-by-one: is this vegan?, is this vegetarian?, is this pescatarian?, is this gluten-free? Include the diet in the list only when the ingredient clearly complies with it, but you must consider all four before responding.

- Provide a sentence that contains the answers to all of the above questions and your needsScan decision.

Return a JSON object with this exact structure:
{
  "ingredients": [
    {
      "name": "single ingredient name (e.g., 'spinach', NOT 'spinach ricotta egg')",
      "brand": "brand name if visible in image, otherwise empty string",
      "allergens": ["allergen1", "allergen2"],
      "diets": ["Vegan", "Vegetarian", "Pescatarian", "Gluten-free"],
      "ingredientsList": ["raw sub-ingredients if this is a processed product, otherwise just the ingredient name"],
      "imageQuality": "good|poor|unreadable",
      "needsScan": true or false,
      "reasoning": "One concise sentence explaining how you decided the allergens and diets for this ingredient, referencing specific words from the recipe or label"
    }
  ],
  "dietaryOptions": ["Vegan", "Vegetarian", "Pescatarian", "Gluten-free"],
  "verifiedFromImage": true
}`
        : `You are an ingredient analysis assistant for a restaurant allergen awareness system.

Read every ingredient mentioned in the dish description, including optional items, garnishes, toppings, and alternatives. Create a separate entry for each ingredient you find.

For each ingredient:

- Decide whether a barcode scan is required. Set needsScan=true when you believe the ingredient is or could be made of multiple sub-ingredients (processed, packaged, blended, or branded products). Set it to false when the ingredient is clearly a single whole item.

- Answer the following questions one-by-one: does this contain dairy?, does this contain egg?, does this contain peanut?, does this contain tree nut?, does this contain shellfish?, does this contain fish?, does this contain soy?, does this contain sesame?, and does this contain wheat? Include the allergen in the list only when the ingredient clearly contains it, but you must consider all nine before responding.

- Answer the following questions one-by-one: is this vegan?, is this vegetarian?, is this pescatarian?, is this gluten-free? Include the diet in the list only when the ingredient clearly complies with it, but you must consider all four before responding.

- Provide a sentence that contains the answers to all of the above questions and your needsScan decision.

Return a JSON object with this exact structure:
{
  "ingredients": [
    {
      "name": "ingredient name",
      "brand": "brand name if mentioned, otherwise empty string",
      "allergens": ["allergen1", "allergen2"],
      "diets": ["Vegan", "Vegetarian", "Pescatarian", "Gluten-free"],
      "ingredientsList": ["raw ingredient from label"],
      "needsScan": true or false,
      "reasoning": "One concise sentence explaining how you decided the allergens and diets for this ingredient, referencing specific words from the recipe text"
    }
  ],
  "dietaryOptions": ["Vegan", "Vegetarian", "Pescatarian", "Gluten-free"],
  "verifiedFromImage": false
}`
      
      userPrompt = imageData
        ? `${text ? `Context: ${text}` : ''}
${dishName ? `Dish Name: ${dishName}` : ''}

Please analyze the ingredient label image.`
        : `Dish Name: ${dishName || 'Unknown'}
Description: ${text}

Please analyze this dish.`
    }

    // Build content array for Claude
    const content: any[] = []

    const claudeModel = 'claude-haiku-4-5-20251001'

    if (imageData) {
      // Extract base64 data from data URL
      const base64Data = imageData.split(',')[1] || imageData
      const mediaType = imageData.includes('image/png') ? 'image/png' :
                       imageData.includes('image/jpeg') ? 'image/jpeg' :
                       imageData.includes('image/jpg') ? 'image/jpeg' :
                       imageData.includes('image/webp') ? 'image/webp' :
                       'image/jpeg'

      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data
        }
      })
    }

    content.push({
      type: 'text',
      text: userPrompt
    })

    console.log('Calling Claude API with:', {
      model: claudeModel,
      contentItems: content.length,
      hasImage: content.some(c => c.type === 'image'),
      systemPromptLength: systemPrompt.length
    })

    // Call Claude API (using Haiku 3.5 for faster, cost-effective responses)
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: claudeModel,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: content
        }]
      }),
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      console.error('Claude API error:', error)
      console.error('Claude API status:', claudeResponse.status)
      console.error('Claude API headers:', JSON.stringify(Object.fromEntries(claudeResponse.headers)))
      throw new Error(`Claude API error (${claudeResponse.status}): ${error.substring(0, 500)}`)
    }

    const aiResult = await claudeResponse.json()
    const responseText = aiResult.content[0].text

    // For description generation, return plain text
    if(isDescriptionGeneration){
      return new Response(
        JSON.stringify({
          description: responseText.trim(),
          text: responseText.trim()
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Parse JSON from response for ingredient extraction
    let parsed
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) ||
                       responseText.match(/```\n([\s\S]*?)\n```/) ||
                       responseText.match(/\{[\s\S]*\}/)  // Try to find any JSON object

      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : responseText
      console.log('Attempting to parse JSON, length:', jsonText.length)
      parsed = JSON.parse(jsonText)
    } catch (e) {
      console.error('Failed to parse JSON from Claude response')
      console.error('Response text (first 500 chars):', responseText.substring(0, 500))
      console.error('Parse error:', e.message)

      // Return a helpful error with empty ingredients rather than crashing
      return new Response(
        JSON.stringify({
          error: 'AI returned invalid format. Please try again or describe ingredients in text.',
          ingredients: [],
          raw_response: responseText.substring(0, 200)
        }),
        {
          status: 200,  // Return 200 so WordPress doesn't show generic error
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      )
    }

    // Post-process each ingredient to ensure correct diet/allergen identification
    if (parsed && Array.isArray(parsed.ingredients)) {
      parsed.ingredients.forEach((ingredient: any, idx: number) => {
        // Ensure allergens and diets are arrays
        if (!Array.isArray(ingredient.allergens)) {
          ingredient.allergens = []
        }
        if (!Array.isArray(ingredient.diets)) {
          ingredient.diets = []
        }

        // Get ingredient text for analysis (use name + ingredientsList if available)
        const ingredientText = [
          ingredient.name || '',
          ...(Array.isArray(ingredient.ingredientsList) ? ingredient.ingredientsList : [])
        ].filter(Boolean).join(' ').toLowerCase()

        // Create token set for matching
        const tokenSet = new Set(
          ingredientText
            .replace(/[^a-z0-9]+/g, ' ')
            .split(' ')
            .filter(Boolean)
        )
        const hasToken = (...tokens: string[]) => tokens.some(token => tokenSet.has(token))
        const hasPhrase = (...phrases: string[]) => phrases.some(phrase => ingredientText.includes(phrase))
        const allergenSet = new Set(ingredient.allergens.map((a: string) => a.toLowerCase()))

        // Detect allergens and ingredients
        const hasDairy = allergenSet.has('dairy') || hasToken('cream','milk','butter','cheese','yogurt','yoghurt','ghee','casein','whey','custard','kefir','labneh','mascarpone','ricotta','sour','mozzarella')
        const hasHalfAndHalf = hasPhrase('half and half','half-and-half')
        const hasEgg = allergenSet.has('egg') || hasToken('egg','eggs','yolk','yolks','albumen')
        const hasFish = allergenSet.has('fish') || hasToken('fish','salmon','tuna','cod','anchovy','anchovies','sardine','trout','tilapia','halibut','mahi','snapper')
        const hasShellfish = allergenSet.has('shellfish') || hasToken('shrimp','prawn','lobster','crab','clam','clams','mussel','mussels','scallop','scallops','oyster','oysters')
        const hasMeat = hasToken('beef','steak','pork','bacon','ham','prosciutto','salami','chicken','turkey','duck','lamb','veal','sausage','sausages','pepperoni','meatball','chorizo','pastrami','corned','brisket','gelatin','gelatine','lard')
        const hasHoney = hasToken('honey')
        const hasGelatin = hasToken('gelatin','gelatine','collagen','lard')
        const containsAnimalProduct = hasMeat || hasFish || hasShellfish || hasDairy || hasHalfAndHalf || hasEgg || hasHoney || hasGelatin

        const glutenTokens = [
          'wheat','flour','breadcrumbs','breadcrumb','bread','pasta','spaghetti','noodles','barley','rye','malt',
          'semolina','spelt','farro','bulgur','couscous','cracker','crackers','pretzel','pretzels','cake','cookies',
          'biscuit','biscuits','batter','pastry','dough','seitan'
        ]
        const hasGluten = allergenSet.has('wheat') || glutenTokens.some(token => tokenSet.has(token))

        // Update allergen set based on detection
        if (hasDairy && !allergenSet.has('dairy')) {
          ingredient.allergens.push('dairy')
        }
        if (hasEgg && !allergenSet.has('egg')) {
          ingredient.allergens.push('egg')
        }
        if (hasFish && !allergenSet.has('fish')) {
          ingredient.allergens.push('fish')
        }
        if (hasShellfish && !allergenSet.has('shellfish')) {
          ingredient.allergens.push('shellfish')
        }
        if (hasGluten && !allergenSet.has('wheat')) {
          ingredient.allergens.push('wheat')
        }

        // Normalize diet names to expected format and process with safeguards
        const dietNameMap: Record<string, string> = {
          'vegan': 'Vegan',
          'vegetarian': 'Vegetarian',
          'pescatarian': 'Pescatarian',
          'gluten-free': 'Gluten-free',
          'gluten free': 'Gluten-free',
          'glutenfree': 'Gluten-free'
        }
        const normalizeDietName = (diet: string): string => {
          const normalized = diet.trim()
          return dietNameMap[normalized.toLowerCase()] || normalized
        }

        const dietsSet = new Set(
          Array.isArray(ingredient.diets) 
            ? ingredient.diets.filter(Boolean).map(normalizeDietName)
            : []
        )

        const addDiet = (diet: string) => dietsSet.add(diet)
        const removeDiet = (diet: string) => dietsSet.delete(diet)

        // If no diets detected, infer from ingredients
        if (dietsSet.size === 0) {
          if (!containsAnimalProduct) {
            addDiet('Vegan')
            addDiet('Vegetarian')
            addDiet('Pescatarian')
          } else if (!hasMeat && !hasFish && !hasShellfish) {
            // Has dairy/eggs but no meat/fish - vegetarian compatible
            addDiet('Vegetarian')
            addDiet('Pescatarian')
          } else if (!hasMeat && (hasFish || hasShellfish)) {
            addDiet('Pescatarian')
          }
        }

        // Remove incompatible diets
        if (hasDairy || hasHalfAndHalf || hasEgg || hasHoney || hasGelatin) {
          removeDiet('Vegan')
        }
        if (hasFish || hasShellfish || hasMeat) {
          removeDiet('Vegetarian')
        }
        if (hasMeat) {
          removeDiet('Pescatarian')
        }

        // Ensure diet hierarchy (Vegan → Vegetarian → Pescatarian)
        if (dietsSet.has('Vegan')) {
          addDiet('Vegetarian')
          addDiet('Pescatarian')
        }
        if (dietsSet.has('Vegetarian')) {
          addDiet('Pescatarian')
        }

        // Add Gluten-free if no gluten sources
        if (hasGluten) {
          removeDiet('Gluten-free')
        } else {
          addDiet('Gluten-free')
        }

        // Update ingredient diets
        ingredient.diets = Array.from(dietsSet)

        // Log the final result
        const name = (ingredient?.name && ingredient.name.trim()) || `Ingredient ${idx + 1}`
        const allergens = Array.isArray(ingredient?.allergens) ? ingredient.allergens.join(', ') || 'none' : 'none'
        const diets = Array.isArray(ingredient?.diets) ? ingredient.diets.join(', ') || 'none' : 'none'
        const reasoningText = typeof ingredient?.reasoning === 'string' && ingredient.reasoning.trim()
          ? ingredient.reasoning.trim()
          : 'No reasoning provided. (AI must explain how allergens/diets were determined.)'
        console.log(`[AI Decision] ${name} | Allergens: ${allergens} | Diets: ${diets} | Reason: ${reasoningText}`)
      })
    } else {
      console.log('Parsed AI response did not include an ingredients array to log reasoning.')
    }

    return new Response(
      JSON.stringify(parsed),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )

  } catch (error) {
    console.error('Error:', error)
    // Always include CORS headers in error responses
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to process request',
        ingredients: [],
        description: null
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    )
  }
})

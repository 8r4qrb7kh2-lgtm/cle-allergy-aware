import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface Source {
  name: string;
  url: string;
  productImage?: string;
  ingredientsText: string;
  explicitAllergenStatement?: string;
  explicitDietaryLabels?: string;
  crossContaminationWarnings?: string;
  allergens?: string[];
  diets?: string[];
  confidence: number;
  dataAvailable: boolean;
}

interface VerificationResult {
  product: {
    name: string;
    brand: string;
    barcode: string;
  };
  sources: Source[];
  consistency: {
    score: number;
    allMatch: boolean;
    differences: string[];
  };
  consolidatedIngredients: string;
  crossContaminationWarnings: string;
  allergens: string[];
  allergensInferred: boolean;
  diets: string[];
  dietsInferred: boolean;
  visualMatching: {
    imagesAvailable: number;
    primaryImage: string;
  };
  error?: string;
  minimumSourcesRequired: number;
  sourcesFound: number;
}

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
const MINIMUM_SOURCES_REQUIRED = 3;

type SearchProvider = 'claude' | 'perplexity';

// Helper function to validate if a URL is publicly accessible
async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    console.log(`Validating URL: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });

    clearTimeout(timeoutId);

    // Consider 200-299 and 300-399 (redirects) as accessible
    const accessible = response.status >= 200 && response.status < 400;
    console.log(`  URL ${url}: ${accessible ? '✓ Accessible' : '✗ Not accessible'} (${response.status})`);
    return accessible;
  } catch (error) {
    console.log(`  URL ${url}: ✗ Failed to access (${error.message})`);
    return false;
  }
}

// Helper function to normalize ingredient text for comparison
function normalizeIngredients(text: string): string {
  return text.toLowerCase()
    .replace(/[,;.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper function to check if ingredient lists match
function ingredientsMatch(text1: string, text2: string): boolean {
  const normalized1 = normalizeIngredients(text1);
  const normalized2 = normalizeIngredients(text2);

  // Calculate similarity (simple approach: check if words match)
  const words1 = normalized1.split(' ').filter(w => w.length > 0);
  const words2 = normalized2.split(' ').filter(w => w.length > 0);

  const commonWords = words1.filter(w => words2.includes(w)).length;
  const totalWords = Math.max(words1.length, words2.length);
  const minWords = Math.min(words1.length, words2.length);

  const similarity = commonWords / totalWords;

  // Use lenient threshold if EITHER list is short (≤15 words)
  // This handles cases where one source has detailed list and another has abbreviated list
  const isShortList = minWords <= 15;
  const threshold = isShortList ? 0.60 : 0.85; // 60% for short lists, 85% for long lists

  console.log(`Matching: "${text1.substring(0, 50)}..." vs "${text2.substring(0, 50)}..."`);
  console.log(`  Words: ${words1.length} vs ${words2.length}, Common: ${commonWords}, Similarity: ${(similarity * 100).toFixed(1)}%, Threshold: ${(threshold * 100)}%, Match: ${similarity >= threshold}`);

  return similarity >= threshold;
}

// Helper function to identify specific wording differences between sources
function findIngredientDifferences(sources: Source[]): string[] {
  if (sources.length < 2) return [];

  const differences: string[] = [];
  const ingredientTexts = sources.map(s => ({ name: s.name, text: s.ingredientsText.trim() }));

  // Check if all texts are exactly identical (ignoring case and extra whitespace)
  const normalizedTexts = ingredientTexts.map(t => t.text.toLowerCase().replace(/\s+/g, ' ').trim());
  const allIdentical = normalizedTexts.every(t => t === normalizedTexts[0]);

  if (allIdentical) {
    return []; // Perfect match
  }

  // Extract ingredient phrases (comma-separated parts)
  const sourceIngredientPhrases = ingredientTexts.map(({ name, text }) => {
    const phrases = text
      .toLowerCase()
      .split(/,|;/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    return { name, phrases };
  });

  // Find all unique multi-word ingredient phrases (like "brewer's yeast", "roasted malted barley")
  const allPhrases = new Set<string>();
  sourceIngredientPhrases.forEach(si => si.phrases.forEach(p => {
    // Only track phrases with 2+ words or important single ingredients
    if (p.split(/\s+/).length >= 2 || ['water', 'hops', 'yeast'].some(ing => p.includes(ing))) {
      allPhrases.add(p);
    }
  }));

  // Group phrases by ingredient topic (e.g., all barley-related phrases together)
  // BUT: Only group if the last word is a specific ingredient, not a generic descriptor
  const specificIngredients = ['barley', 'malt', 'yeast', 'wheat', 'rice', 'oat', 'corn', 'sugar', 'salt', 'oil'];
  const genericDescriptors = ['powder', 'flavor', 'spice', 'extract', 'seasoning'];
  
  const phraseGroups = new Map<string, Set<string>>();

  for (const phrase of allPhrases) {
    const words = phrase.split(/\s+/);
    const lastWord = words[words.length - 1];
    
    // Only group if last word is a specific ingredient AND phrase has 2+ words
    // Don't group if last word is a generic descriptor like "powder" or "flavor"
    if (words.length >= 2 && specificIngredients.includes(lastWord) && !genericDescriptors.includes(lastWord)) {
      // This is something like "malted barley" or "cane sugar" - group it
      if (!phraseGroups.has(lastWord)) {
        phraseGroups.set(lastWord, new Set());
      }
      phraseGroups.get(lastWord)!.add(phrase);
    } else if (words.length >= 3) {
      // For 3+ word phrases, use the second-to-last word as the grouping key
      // This groups "cayenne pepper powder" with other "pepper" items
      const secondToLastWord = words[words.length - 2];
      if (specificIngredients.includes(secondToLastWord)) {
        if (!phraseGroups.has(secondToLastWord)) {
          phraseGroups.set(secondToLastWord, new Set());
        }
        phraseGroups.get(secondToLastWord)!.add(phrase);
      }
    }
  }

  // For each ingredient group, find sources that use different wording
  const phraseDifferences: string[] = [];

  for (const [ingredient, phrasesSet] of phraseGroups) {
    const phrases = Array.from(phrasesSet);
    if (phrases.length > 1) {
      // Multiple ways to describe this ingredient - show what each source says
      const sourcePhrasings = new Map<string, string[]>();

      for (const si of sourceIngredientPhrases) {
        for (const phrase of phrases) {
          if (si.phrases.some(p => p === phrase)) {
            if (!sourcePhrasings.has(phrase)) {
              sourcePhrasings.set(phrase, []);
            }
            sourcePhrasings.get(phrase)!.push(si.name);
          }
        }
      }

      // Build comparison showing what each source says
      // Only report as a difference if sources actually disagree (have different phrases)
      if (sourcePhrasings.size > 1) {
        // Check if all sources have the exact same set of phrases (no disagreement)
        const firstSourcePhrases = new Set<string>();
        let isFirstSource = true;
        let allSourcesAgree = true;
        
        for (const si of sourceIngredientPhrases) {
          const thisSourcePhrases = new Set<string>();
          for (const phrase of phrases) {
            if (si.phrases.some(p => p === phrase)) {
              thisSourcePhrases.add(phrase);
            }
          }
          
          if (isFirstSource) {
            firstSourcePhrases.clear();
            thisSourcePhrases.forEach(p => firstSourcePhrases.add(p));
            isFirstSource = false;
          } else {
            // Check if this source has the same phrases as the first source
            if (thisSourcePhrases.size !== firstSourcePhrases.size ||
                ![...thisSourcePhrases].every(p => firstSourcePhrases.has(p))) {
              allSourcesAgree = false;
              break;
            }
          }
        }
        
        // Only report if sources actually disagree
        if (!allSourcesAgree) {
          const comparisons: string[] = [];
          for (const [phrase, sourceNames] of sourcePhrasings) {
            comparisons.push(`${sourceNames.join(', ')}: "${phrase}"`);
          }
          phraseDifferences.push(comparisons.join('||')); // Use || as separator for frontend parsing
        }
      }
    }
  }

  // Add phrase differences
  differences.push(...phraseDifferences.slice(0, 4)); // Top 4 phrase differences

  // Check if ingredients are in different order
  if (differences.length === 0) {
    const firstThreeIngredients = sourceIngredientPhrases.map(si =>
      si.phrases.slice(0, 3).join(', ')
    );
    const allSameOrder = firstThreeIngredients.every(order => order === firstThreeIngredients[0]);

    if (!allSameOrder) {
      differences.push('Ingredients listed in different order across sources');
    }
  }

  return differences;
}

// Helper function to search a single retailer with Perplexity
async function searchSingleRetailerPerplexity(
  retailerName: string,
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string
): Promise<Source | null> {
  console.log(`🔍 [PERPLEXITY] Searching ${retailerName} for ${brand} ${productName}`);
  
  const searchPrompt = `Find the ingredient list for this product on ${retailerName}:

Product: ${brand} ${productName}
Barcode: ${barcode}
Retailer: ${retailerName}

Search for: ${searchQuery}

Extract the COMPLETE ingredient list word-for-word. Also look for:
- Allergen statements (CONTAINS:, allergen warnings)
- Dietary labels (Vegan, Vegetarian, etc.)
- Cross-contamination warnings

Return JSON with this exact format:
{
  "name": "${retailerName}",
  "url": "https://...",
  "ingredientsText": "complete ingredient list here",
  "explicitAllergenStatement": "if found",
  "explicitDietaryLabels": "if found",
  "crossContaminationWarnings": "if found",
  "allergens": ["tree nuts"],
  "diets": ["vegan"],
  "confidence": 90
}

If you cannot find this product on ${retailerName}, return: {"found": false}`;

  try {
    console.log(`📡 [PERPLEXITY] Making API call to Perplexity for ${retailerName}...`);
    
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{
          role: 'user',
          content: searchPrompt
        }],
        temperature: 0.2,
        max_tokens: 4000
      }),
    });

    console.log(`📥 [PERPLEXITY] ${retailerName} API response status: ${perplexityResponse.status}`);

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      console.log(`❌ [PERPLEXITY] ${retailerName} search failed:`, perplexityResponse.status, errorText);
      return null;
    }

    const perplexityResult = await perplexityResponse.json();
    const responseText = perplexityResult.choices?.[0]?.message?.content || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`${retailerName}: No JSON found`);
      return null;
    }

    let searchData;
    try {
      searchData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.log(`${retailerName}: JSON parse error`);
      return null;
    }

    if (searchData.found === false || !searchData.ingredientsText || searchData.ingredientsText.trim().length < 10) {
      console.log(`✗ ${retailerName}: Product not found or incomplete`);
      return null;
    }

    console.log(`✓ ${retailerName}: Found ingredients (${searchData.ingredientsText.length} chars)`);
    
    return {
      name: searchData.name || retailerName,
      url: searchData.url || '',
      ingredientsText: searchData.ingredientsText,
      explicitAllergenStatement: searchData.explicitAllergenStatement || '',
      explicitDietaryLabels: searchData.explicitDietaryLabels || '',
      crossContaminationWarnings: searchData.crossContaminationWarnings || '',
      allergens: searchData.allergens || [],
      diets: searchData.diets || [],
      confidence: searchData.confidence || 85,
      dataAvailable: true
    };
  } catch (error) {
    console.log(`${retailerName} search error:`, error.message);
    return null;
  }
}

// Parallel search function using Perplexity AI (makes multiple targeted calls)
async function searchSourceTypePerplexity(
  sourceType: string,
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string
): Promise<Source[]> {
  console.log(`Starting ${sourceType} search with Perplexity...`);
  console.log(`Search query: ${searchQuery}`);
  
  // Parse the retailers from sourceType
  const retailers = sourceType.split(/\s+/).filter(r => r.length > 2);
  console.log(`Targeting retailers: ${retailers.join(', ')}`);
  
  // Make individual searches for each retailer to ensure we get multiple sources
  const searchPromises = retailers.slice(0, 3).map(async (retailer) => {
    return searchSingleRetailerPerplexity(retailer, searchQuery, productName, brand, barcode);
  });
  
  const results = await Promise.all(searchPromises);
  const sources = results.filter(s => s !== null) as Source[];
  
  console.log(`${sourceType} Perplexity search complete: ${sources.length} sources found from individual retailer searches`);
  return sources;
}

// Alternative: Try to get multiple sources in one call (backup method)
async function searchSourceTypePerplexityBulk(
  sourceType: string,
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string
): Promise<Source[]> {
  console.log(`Starting ${sourceType} bulk search with Perplexity...`);
  console.log(`Search query: ${searchQuery}`);
  
  const searchPrompt = `Find ingredient information for this food product from MULTIPLE SOURCES:

Product: ${brand} ${productName}
Barcode: ${barcode}
Search Focus: ${sourceType}

IMPORTANT: Search for this EXACT product on MULTIPLE websites from the following list: ${sourceType}
You MUST find at least 2-3 different sources. Search each retailer/website separately.

CRITICAL REQUIREMENTS:
1. Extract the FULL, COMPLETE ingredient list word-for-word (do NOT abbreviate, truncate, or summarize)
   - For packaged foods: list all ingredients
   - For beverages (beer, wine, spirits, etc.): even short lists are acceptable (e.g., "Water, Barley, Hops, Yeast")
   - Accept ANY valid ingredient list, whether long or short
2. Look for explicit allergen statements:
   - "CONTAINS:" statements
   - "Allergen Information:" sections
   - Bold allergen warnings
   - Extract these word-for-word
3. Look for explicit dietary labels:
   - "Vegan", "Vegetarian", "Pescatarian"
   - "Plant-Based", "Dairy-Free", "Egg-Free"
   - Any certification badges or labels
4. Look for cross-contamination warnings:
   - "May contain..."
   - "Processed in a facility that also processes..."
5. ANALYZE INGREDIENTS for allergens:
   - Tree Nuts: almonds, cashews, walnuts, pecans, pistachios
   - Wheat: ONLY when "wheat" or "wheat flour" is explicitly listed (NOT barley, NOT rye, NOT oats - these are different grains)
   - Soy: soy, soybean oil, soy lecithin
   - Milk: milk, butter, cheese, whey, casein
   - Eggs: egg, albumin
   - Fish: fish, anchovy, cod
   - Shellfish: shrimp, crab, lobster
   - Peanuts: peanut
   - Sesame: sesame, tahini

   IMPORTANT: Barley is NOT wheat. Only detect wheat allergen when the word "wheat" appears in ingredients.
6. DETERMINE DIETARY COMPATIBILITY (use logical rules):
   - Vegan: NO animal products (no meat, fish, dairy, eggs, honey)
     → If VEGAN, automatically also VEGETARIAN and PESCATARIAN
   - Vegetarian: NO meat or fish (may have dairy/eggs)
     → If VEGETARIAN (not vegan), automatically also PESCATARIAN
   - Pescatarian: NO meat (may have fish, dairy, eggs)

   IMPORTANT: Apply these rules:
   * If vegan → return ["vegan", "vegetarian", "pescatarian"]
   * If vegetarian but has dairy/eggs → return ["vegetarian", "pescatarian"]
   * If pescatarian only → return ["pescatarian"]
7. Set confidence level (0-100) based on:
   - 90-100: Found exact product match with complete ingredient list
   - 70-89: Found product but some uncertainty (different size/flavor variation)
   - Below 70: Don't include - not confident it's the right product

📋 RESPONSE FORMAT - Return JSON with ALL sources you find:

EXAMPLE (you should return 2-3+ sources like this):
{
  "sources": [
    {
      "name": "Amazon",
      "url": "https://amazon.com/...",
      "ingredientsText": "COMPLETE ingredient list here",
      "explicitAllergenStatement": "CONTAINS: TREE NUTS (ALMONDS)",
      "explicitDietaryLabels": "Vegan, Gluten-Free",
      "crossContaminationWarnings": "May contain sesame",
      "allergens": ["tree nuts"],
      "diets": ["vegan", "vegetarian", "pescatarian"],
      "confidence": 95
    },
    {
      "name": "Walmart",
      "url": "https://walmart.com/...",
      "ingredientsText": "COMPLETE ingredient list here",
      "explicitAllergenStatement": "",
      "explicitDietaryLabels": "",
      "crossContaminationWarnings": "",
      "allergens": ["tree nuts"],
      "diets": ["vegan", "vegetarian", "pescatarian"],
      "confidence": 90
    },
    {
      "name": "Target",
      "url": "https://target.com/...",
      "ingredientsText": "COMPLETE ingredient list here",
      ...same fields...
      "confidence": 85
    }
  ]
}

✅ GOOD: 2-3+ sources in your response
❌ BAD: Only 1 source (keep searching!)
❌ BAD: Empty sources array {"sources": []} (unless product truly doesn't exist anywhere)

Accept ANY length ingredient list - even "Water, Barley, Hops, Yeast" is valid.

REMINDER: You MUST search multiple websites and return 2-3+ sources in the sources array. Do not stop after finding just one source!`;

  try {
    const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: 'You are a food product research assistant. When searching for product information, you must search multiple retailers and websites to find ingredient information from at least 2-3 different sources. Always return a JSON response with a "sources" array containing multiple source objects.'
          },
          {
            role: 'user',
            content: searchPrompt
          }
        ],
        temperature: 0.2,
        max_tokens: 8000,
        return_citations: true
      }),
    });

    if (!perplexityResponse.ok) {
      console.log(`${sourceType} search failed:`, perplexityResponse.status);
      return [];
    }

    const perplexityResult = await perplexityResponse.json();

    // Log citations if available
    if (perplexityResult.citations && perplexityResult.citations.length > 0) {
      console.log(`\n=== Perplexity Citations ===`);
      console.log(`Found ${perplexityResult.citations.length} citations`);
      perplexityResult.citations.forEach((citation: string, idx: number) => {
        console.log(`  ${idx + 1}. ${citation}`);
      });
    }

    // Extract text response
    const responseText = perplexityResult.choices?.[0]?.message?.content || '';
    
    console.log(`\n=== ${sourceType} Perplexity Response ===`);
    console.log(`Response length: ${responseText.length} chars`);
    console.log(`First 500 chars: ${responseText.substring(0, 500)}`);

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`${sourceType}: No JSON found in response`);
      console.log(`Full response: ${responseText}`);
      return [];
    }

    let searchData;
    try {
      searchData = JSON.parse(jsonMatch[0]);
      console.log(`${sourceType}: Parsed JSON successfully`);
      console.log(`Sources in JSON: ${searchData.sources?.length || 0}`);
      
      // Debug: Log what sources were returned
      if (searchData.sources && Array.isArray(searchData.sources)) {
        console.log(`\n=== Sources returned by Perplexity ===`);
        searchData.sources.forEach((src: any, idx: number) => {
          console.log(`  ${idx + 1}. ${src.name || 'Unknown'} - Ingredients length: ${src.ingredientsText?.length || 0} chars`);
        });
      }
    } catch (e) {
      console.log(`${sourceType}: JSON parse error: ${e.message}`);
      console.log(`Attempted to parse: ${jsonMatch[0].substring(0, 200)}...`);
      return [];
    }
    
    const sources: Source[] = [];

    if (searchData.sources && Array.isArray(searchData.sources)) {
      for (const source of searchData.sources) {
        // Accept any non-empty ingredient text (changed from 30 to 10 chars minimum)
        // This allows for products with naturally short ingredient lists (e.g., beer, wine, simple products)
        if (source.ingredientsText && source.ingredientsText.trim().length > 10) {
          const allergenInfo = source.allergens && source.allergens.length > 0 ? ` [Allergens: ${source.allergens.join(', ')}]` : '';
          const dietInfo = source.diets && source.diets.length > 0 ? ` [Diets: ${source.diets.join(', ')}]` : '';
          console.log(`✓ ${sourceType} found: ${source.name} (${source.confidence}% confidence)${allergenInfo}${dietInfo}`);
          console.log(`  Ingredients (${source.ingredientsText.length} chars): ${source.ingredientsText.substring(0, 100)}...`);
          sources.push({
            name: source.name,
            url: source.url,
            ingredientsText: source.ingredientsText,
            explicitAllergenStatement: source.explicitAllergenStatement || '',
            explicitDietaryLabels: source.explicitDietaryLabels || '',
            crossContaminationWarnings: source.crossContaminationWarnings || '',
            allergens: source.allergens || [],
            diets: source.diets || [],
            confidence: source.confidence || 80,
            dataAvailable: true
          });
        } else {
          console.log(`✗ ${sourceType} rejected: ${source.name || 'Unknown'} - ingredient text too short (${source.ingredientsText?.length || 0} chars)`);
        }
      }
    }

    console.log(`${sourceType} search complete: ${sources.length} sources found`);
    return sources;

  } catch (error) {
    console.log(`${sourceType} search error:`, error.message);
    return [];
  }
}

// Parallel search function for a specific source type (Claude)
async function searchSourceTypeClaude(
  sourceType: string,
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string
): Promise<Source[]> {
  console.log(`Starting ${sourceType} search with Claude...`);

  const searchPrompt = `You are searching for ingredient information for a food or beverage product.

Product: ${brand} ${productName}
Barcode: ${barcode}
Focus: ${sourceType}

Search for this EXACT product's ingredient list on ${sourceType}.

CRITICAL REQUIREMENTS:
1. Extract the FULL, COMPLETE ingredient list word-for-word (do NOT abbreviate, truncate, or summarize)
   - For packaged foods: list all ingredients
   - For beverages (beer, wine, spirits, etc.): even short lists are acceptable (e.g., "Water, Barley, Hops, Yeast")
   - Accept ANY valid ingredient list, whether long or short
2. Look for explicit allergen statements:
   - "CONTAINS:" statements
   - "Allergen Information:" sections
   - Bold allergen warnings
   - Extract these word-for-word
3. Look for explicit dietary labels:
   - "Vegan", "Vegetarian", "Pescatarian"
   - "Plant-Based", "Dairy-Free", "Egg-Free"
   - Any certification badges or labels
4. Look for cross-contamination warnings:
   - "May contain..."
   - "Processed in a facility that also processes..."
5. ANALYZE INGREDIENTS for allergens:
   - Tree Nuts: almonds, cashews, walnuts, pecans, pistachios
   - Wheat: ONLY when "wheat" or "wheat flour" is explicitly listed (NOT barley, NOT rye, NOT oats - these are different grains)
   - Soy: soy, soybean oil, soy lecithin
   - Milk: milk, butter, cheese, whey, casein
   - Eggs: egg, albumin
   - Fish: fish, anchovy, cod
   - Shellfish: shrimp, crab, lobster
   - Peanuts: peanut
   - Sesame: sesame, tahini

   IMPORTANT: Barley is NOT wheat. Only detect wheat allergen when the word "wheat" appears in ingredients.
6. DETERMINE DIETARY COMPATIBILITY (use logical rules):
   - Vegan: NO animal products (no meat, fish, dairy, eggs, honey)
     → If VEGAN, automatically also VEGETARIAN and PESCATARIAN
   - Vegetarian: NO meat or fish (may have dairy/eggs)
     → If VEGETARIAN (not vegan), automatically also PESCATARIAN
   - Pescatarian: NO meat (may have fish, dairy, eggs)

   IMPORTANT: Apply these rules:
   * If vegan → return ["vegan", "vegetarian", "pescatarian"]
   * If vegetarian but has dairy/eggs → return ["vegetarian", "pescatarian"]
   * If pescatarian only → return ["pescatarian"]
7. Set confidence level (0-100) based on:
   - 90-100: Found exact product match with complete ingredient list
   - 70-89: Found product but some uncertainty (different size/flavor variation)
   - Below 70: Don't include - not confident it's the right product

Format your response as JSON:
{
  "sources": [
    {
      "name": "Website Name (e.g., 'Kroger', 'Amazon', 'Stacy's Official Site')",
      "url": "https://...",
      "ingredientsText": "COMPLETE FULL ingredient list here - every single ingredient",
      "explicitAllergenStatement": "CONTAINS: TREE NUTS (ALMONDS)" (if found, otherwise empty string),
      "explicitDietaryLabels": "Vegan, Gluten-Free" (if found, otherwise empty string),
      "crossContaminationWarnings": "May contain sesame" (if any warning exists, otherwise empty string),
      "allergens": ["tree nuts"],
      "diets": ["vegan", "vegetarian", "pescatarian"],
      "confidence": 90
    }
  ]
}

If you cannot find any ingredient information for this product, return empty sources array: {"sources": []}
Accept sources with ANY length ingredient list - even very short lists like "Water, Barley, Hops, Yeast" are valid.`;

  try {
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: searchPrompt
        }],
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 3
        }]
      }),
    });

    if (!claudeResponse.ok) {
      console.log(`${sourceType} search failed:`, claudeResponse.status);
      return [];
    }

    const claudeResult = await claudeResponse.json();

    // Extract text response
    let responseText = '';
    for (const block of claudeResult.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`${sourceType}: No JSON found`);
      return [];
    }

    const searchData = JSON.parse(jsonMatch[0]);
    const sources: Source[] = [];

    if (searchData.sources && Array.isArray(searchData.sources)) {
      for (const source of searchData.sources) {
        // Accept any non-empty ingredient text (changed from 30 to 10 chars minimum)
        // This allows for products with naturally short ingredient lists (e.g., beer, wine, simple products)
        if (source.ingredientsText && source.ingredientsText.trim().length > 10) {
          const allergenInfo = source.allergens && source.allergens.length > 0 ? ` [Allergens: ${source.allergens.join(', ')}]` : '';
          const dietInfo = source.diets && source.diets.length > 0 ? ` [Diets: ${source.diets.join(', ')}]` : '';
          console.log(`✓ ${sourceType} found: ${source.name} (${source.confidence}% confidence)${allergenInfo}${dietInfo}`);
          console.log(`  Ingredients (${source.ingredientsText.length} chars): ${source.ingredientsText.substring(0, 100)}...`);
          sources.push({
            name: source.name,
            url: source.url,
            ingredientsText: source.ingredientsText,
            explicitAllergenStatement: source.explicitAllergenStatement || '',
            explicitDietaryLabels: source.explicitDietaryLabels || '',
            crossContaminationWarnings: source.crossContaminationWarnings || '',
            allergens: source.allergens || [],
            diets: source.diets || [],
            confidence: source.confidence || 80,
            dataAvailable: true
          });
        } else {
          console.log(`✗ ${sourceType} rejected: ${source.name || 'Unknown'} - ingredient text too short (${source.ingredientsText?.length || 0} chars)`);
        }
      }
    }

    console.log(`${sourceType} search complete: ${sources.length} sources found`);
    return sources;

  } catch (error) {
    console.log(`${sourceType} search error:`, error.message);
    return [];
  }
}

// Wrapper function to route to the correct search provider
async function searchSourceType(
  sourceType: string,
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string,
  provider: SearchProvider = 'claude'
): Promise<Source[]> {
  console.log(`🎯 [ROUTER] Provider requested: ${provider}, PERPLEXITY_API_KEY exists: ${!!PERPLEXITY_API_KEY}, ANTHROPIC_API_KEY exists: ${!!ANTHROPIC_API_KEY}`);
  
  if (provider === 'perplexity' && PERPLEXITY_API_KEY) {
    console.log(`✅ [ROUTER] Using Perplexity for ${sourceType}`);
    return searchSourceTypePerplexity(sourceType, searchQuery, productName, brand, barcode);
  } else if (provider === 'claude' && ANTHROPIC_API_KEY) {
    console.log(`✅ [ROUTER] Using Claude for ${sourceType}`);
    return searchSourceTypeClaude(sourceType, searchQuery, productName, brand, barcode);
  } else {
    console.log(`⚠️ [ROUTER] Provider ${provider} not available or API key missing. Falling back to Claude.`);
    return searchSourceTypeClaude(sourceType, searchQuery, productName, brand, barcode);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    const { productName, brand, barcode, openFoodFactsData, provider = 'claude' } = await req.json();

    console.log(`\n========================================`);
    console.log(`Multi-Source Verification Request`);
    console.log(`Product: ${brand} ${productName}`);
    console.log(`Barcode: ${barcode}`);
    console.log(`Search Provider: ${provider.toUpperCase()}`);
    console.log(`========================================\n`);

    // Validate API keys based on provider
    if (provider === 'perplexity' && !PERPLEXITY_API_KEY) {
      throw new Error('PERPLEXITY_API_KEY not configured. Please set it in Supabase environment variables.');
    }
    if (provider === 'claude' && !ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured. Please set it in Supabase environment variables.');
    }
    
    // Fallback to Claude if provider not recognized
    const searchProvider: SearchProvider = (provider === 'perplexity' || provider === 'claude') ? provider : 'claude';

    let allSources: Source[] = [];

    // Add Open Food Facts if available
    if (openFoodFactsData && openFoodFactsData.ingredients_text) {
      console.log('✓ Adding Open Food Facts');
      allSources.push({
        name: 'Open Food Facts',
        url: `https://world.openfoodfacts.org/product/${barcode}`,
        productImage: openFoodFactsData.image_url || '',
        ingredientsText: openFoodFactsData.ingredients_text,
        explicitAllergenStatement: '',
        explicitDietaryLabels: '',
        crossContaminationWarnings: '',
        allergens: [],
        diets: [],
        confidence: 75,
        dataAvailable: true
      });
    }

    // PHASE 1: Launch initial parallel searches targeting specific retailers and sources
    console.log('PHASE 1: Launching parallel searches...');
    const phase1Promises = [
      searchSourceType('Amazon Walmart Target', `${brand} ${productName} ingredients Amazon Walmart Target nutrition facts allergens`, productName, brand, barcode, searchProvider),
      searchSourceType('Official Brand & Kroger', `${brand} ${productName} ingredients official website Kroger nutrition label`, productName, brand, barcode, searchProvider),
      searchSourceType('MyFitnessPal Nutritionix', `${brand} ${productName} MyFitnessPal Nutritionix ingredients allergen information`, productName, brand, barcode, searchProvider)
    ];

    const phase1Results = await Promise.all(phase1Promises);
    for (const sources of phase1Results) {
      allSources.push(...sources);
    }

    console.log(`\nPhase 1 complete: ${allSources.length} total sources (before deduplication)`);

    // DEDUPLICATE by URL - same URL means same source
    const seenUrls = new Map<string, Source>();
    for (const source of allSources) {
      const normalizedUrl = source.url.toLowerCase().trim();
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.set(normalizedUrl, source);
      } else {
        console.log(`⚠ Duplicate URL removed: ${source.name} (${source.url})`);
      }
    }
    allSources = Array.from(seenUrls.values());
    console.log(`After deduplication: ${allSources.length} unique sources`);

    // VALIDATE URLs - remove sources with inaccessible URLs
    console.log('\nValidating source URLs...');
    const urlValidationPromises = allSources.map(async (source) => {
      const isAccessible = await isUrlAccessible(source.url);
      return { source, isAccessible };
    });

    const validationResults = await Promise.all(urlValidationPromises);
    const accessibleSources: Source[] = [];
    const inaccessibleSources: Source[] = [];

    for (const result of validationResults) {
      if (result.isAccessible) {
        accessibleSources.push(result.source);
      } else {
        inaccessibleSources.push(result.source);
        console.log(`⚠ Removing inaccessible source: ${result.source.name} (${result.source.url})`);
      }
    }

    allSources = accessibleSources;
    console.log(`After URL validation: ${allSources.length} accessible sources (removed ${inaccessibleSources.length} inaccessible)`);

    // Check if we already have 3 matching sources
    let matchingSources: Source[] = [];
    const referenceIngredients = allSources[0]?.ingredientsText || '';

    for (const source of allSources) {
      if (ingredientsMatch(source.ingredientsText, referenceIngredients)) {
        matchingSources.push(source);
        console.log(`✓ ${source.name} matches reference`);
        if (matchingSources.length >= MINIMUM_SOURCES_REQUIRED) {
          console.log(`\n✓ Found ${MINIMUM_SOURCES_REQUIRED} matching sources in Phase 1`);
          break;
        }
      }
    }

    // PHASE 2: If needed, do 2 more searches with even more diverse queries
    if (matchingSources.length < MINIMUM_SOURCES_REQUIRED) {
      console.log(`\nPHASE 2: Only ${matchingSources.length} matches so far. Searching 2 more sources...`);

      const phase2Promises = [
        searchSourceType('Whole Foods Costco', `${brand} ${productName} ingredients Whole Foods Costco Sprouts nutrition information`, productName, brand, barcode, searchProvider),
        searchSourceType('Instacart Safeway', `${brand} ${productName} ingredients Instacart Safeway Albertsons product details`, productName, brand, barcode, searchProvider)
      ];

      const phase2Results = await Promise.all(phase2Promises);
      for (const sources of phase2Results) {
        allSources.push(...sources);
      }

      console.log(`\nPhase 2 complete: ${allSources.length} total sources (before deduplication)`);

      // DEDUPLICATE again after Phase 2
      const seenUrlsPhase2 = new Map<string, Source>();
      for (const source of allSources) {
        const normalizedUrl = source.url.toLowerCase().trim();
        if (!seenUrlsPhase2.has(normalizedUrl)) {
          seenUrlsPhase2.set(normalizedUrl, source);
        } else {
          console.log(`⚠ Duplicate URL removed: ${source.name} (${source.url})`);
        }
      }
      allSources = Array.from(seenUrlsPhase2.values());
      console.log(`After deduplication: ${allSources.length} unique sources`);

      // VALIDATE URLs again after Phase 2
      console.log('\nValidating Phase 2 source URLs...');
      const urlValidationPromises2 = allSources.map(async (source) => {
        const isAccessible = await isUrlAccessible(source.url);
        return { source, isAccessible };
      });

      const validationResults2 = await Promise.all(urlValidationPromises2);
      const accessibleSources2: Source[] = [];
      const inaccessibleSources2: Source[] = [];

      for (const result of validationResults2) {
        if (result.isAccessible) {
          accessibleSources2.push(result.source);
        } else {
          inaccessibleSources2.push(result.source);
          console.log(`⚠ Removing inaccessible source: ${result.source.name} (${result.source.url})`);
        }
      }

      allSources = accessibleSources2;
      console.log(`After URL validation: ${allSources.length} accessible sources (removed ${inaccessibleSources2.length} inaccessible)`);

      // Re-check for matching sources
      matchingSources = [];
      for (const source of allSources) {
        if (ingredientsMatch(source.ingredientsText, referenceIngredients)) {
          matchingSources.push(source);
          console.log(`✓ ${source.name} matches reference`);
          if (matchingSources.length >= MINIMUM_SOURCES_REQUIRED) {
            console.log(`\n✓ Found ${MINIMUM_SOURCES_REQUIRED} matching sources after Phase 2`);
            break;
          }
        }
      }
    }

    // PHASE 3: If still not enough, do additional targeted searches
    if (matchingSources.length < MINIMUM_SOURCES_REQUIRED) {
      console.log(`\nPHASE 3: Only ${matchingSources.length} matches after Phase 2. Searching for more sources...`);

      const phase3Promises = [
        searchSourceType('Publix HEB Wegmans', `${brand} ${productName} ingredients Publix HEB Wegmans nutrition allergen`, productName, brand, barcode, searchProvider),
        searchSourceType('CVS Walgreens Product Sites', `${brand} ${productName} ingredients CVS Walgreens Rite Aid product information`, productName, brand, barcode, searchProvider)
      ];

      const phase3Results = await Promise.all(phase3Promises);
      for (const sources of phase3Results) {
        allSources.push(...sources);
      }

      console.log(`\nPhase 3 complete: ${allSources.length} total sources (before deduplication)`);

      // DEDUPLICATE again after Phase 3
      const seenUrlsPhase3 = new Map<string, Source>();
      for (const source of allSources) {
        const normalizedUrl = source.url.toLowerCase().trim();
        if (!seenUrlsPhase3.has(normalizedUrl)) {
          seenUrlsPhase3.set(normalizedUrl, source);
        } else {
          console.log(`⚠ Duplicate URL removed: ${source.name} (${source.url})`);
        }
      }
      allSources = Array.from(seenUrlsPhase3.values());
      console.log(`After deduplication: ${allSources.length} unique sources`);

      // VALIDATE URLs again after Phase 3
      console.log('\nValidating Phase 3 source URLs...');
      const urlValidationPromises3 = allSources.map(async (source) => {
        const isAccessible = await isUrlAccessible(source.url);
        return { source, isAccessible };
      });

      const validationResults3 = await Promise.all(urlValidationPromises3);
      const accessibleSources3: Source[] = [];
      const inaccessibleSources3: Source[] = [];

      for (const result of validationResults3) {
        if (result.isAccessible) {
          accessibleSources3.push(result.source);
        } else {
          inaccessibleSources3.push(result.source);
          console.log(`⚠ Removing inaccessible source: ${result.source.name} (${result.source.url})`);
        }
      }

      allSources = accessibleSources3;
      console.log(`After URL validation: ${allSources.length} accessible sources (removed ${inaccessibleSources3.length} inaccessible)`);

      // Re-check for matching sources one more time
      matchingSources = [];
      for (const source of allSources) {
        if (ingredientsMatch(source.ingredientsText, referenceIngredients)) {
          matchingSources.push(source);
          console.log(`✓ ${source.name} matches reference`);
          if (matchingSources.length >= MINIMUM_SOURCES_REQUIRED) {
            console.log(`\n✓ Found ${MINIMUM_SOURCES_REQUIRED} matching sources after Phase 3`);
            break;
          }
        }
      }
    }

    const sourcesWithData = matchingSources.filter(s => s.dataAvailable);
    console.log(`\nFinal matching sources: ${sourcesWithData.length}`);
    console.log(`Minimum required: ${MINIMUM_SOURCES_REQUIRED}`);

    // Check if we have minimum required sources
    if (sourcesWithData.length < MINIMUM_SOURCES_REQUIRED) {
      console.log(`✗ FAILED: Only found ${sourcesWithData.length} matching sources, need ${MINIMUM_SOURCES_REQUIRED}`);

      return new Response(
        JSON.stringify({
          error: `Insufficient sources: Found ${sourcesWithData.length} sources with matching ingredient data, but require at least ${MINIMUM_SOURCES_REQUIRED} independent sources for verification.`,
          minimumSourcesRequired: MINIMUM_SOURCES_REQUIRED,
          sourcesFound: sourcesWithData.length,
          sources: allSources,
          consolidatedIngredients: '',
          crossContaminationWarnings: '',
          allergens: [],
          allergensInferred: false,
          diets: [],
          dietsInferred: false
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✓ SUCCESS: Found sufficient matching sources');

    // Collect all cross-contamination warnings
    const allCrossContaminationWarnings = sourcesWithData
      .map(s => s.crossContaminationWarnings)
      .filter(w => w && w.length > 0);

    const consolidatedCrossContaminationWarnings = allCrossContaminationWarnings.length > 0
      ? [...new Set(allCrossContaminationWarnings)].join('; ')
      : '';

    // Consolidate allergens and diets from all sources (already analyzed by Claude in each search)
    console.log('\nConsolidating allergens and dietary information from sources...');

    const allAllergens = new Set<string>();
    const allDiets = new Set<string>();
    const explicitAllergenStatements: string[] = [];
    const explicitDietaryLabels: string[] = [];

    for (const source of sourcesWithData) {
      // Collect allergens
      if (source.allergens && source.allergens.length > 0) {
        source.allergens.forEach(a => allAllergens.add(a.toLowerCase()));
      }

      // Collect diets
      if (source.diets && source.diets.length > 0) {
        source.diets.forEach(d => allDiets.add(d.toLowerCase()));
      }

      // Track if we have explicit statements
      if (source.explicitAllergenStatement && source.explicitAllergenStatement.length > 0) {
        explicitAllergenStatements.push(source.explicitAllergenStatement);
      }

      if (source.explicitDietaryLabels && source.explicitDietaryLabels.length > 0) {
        explicitDietaryLabels.push(source.explicitDietaryLabels);
      }
    }

    const allergens = Array.from(allAllergens);
    const diets = Array.from(allDiets);

    // If we found explicit statements on ANY source, mark as not inferred
    const allergensInferred = explicitAllergenStatements.length === 0 && allergens.length > 0;
    const dietsInferred = explicitDietaryLabels.length === 0 && diets.length > 0;

    console.log(`Allergens found: ${allergens.join(', ')} ${allergensInferred ? '(inferred from ingredients)' : '(from explicit statements)'}`);
    console.log(`Diets: ${diets.join(', ')} ${dietsInferred ? '(inferred from ingredients)' : '(from explicit labels)'}`);
    console.log(`Cross-contamination warnings: ${consolidatedCrossContaminationWarnings || 'None'}`);

    // Check for ingredient wording differences
    const differences = findIngredientDifferences(sourcesWithData);
    const allMatch = differences.length === 0;
    console.log(`Ingredient consistency: ${allMatch ? 'Perfect match' : `${differences.length} differences found`}`);
    if (differences.length > 0) {
      differences.forEach(diff => console.log(`  - ${diff}`));
    }

    // Build final result
    const result: VerificationResult = {
      product: {
        name: productName,
        brand: brand,
        barcode: barcode
      },
      sources: sourcesWithData,
      consistency: {
        score: allMatch ? 100 : 95,
        allMatch: allMatch,
        differences: differences
      },
      consolidatedIngredients: referenceIngredients,
      crossContaminationWarnings: consolidatedCrossContaminationWarnings,
      allergens: allergens,
      allergensInferred: allergensInferred,
      diets: diets,
      dietsInferred: dietsInferred,
      visualMatching: {
        imagesAvailable: sourcesWithData.filter(s => s.productImage).length,
        primaryImage: openFoodFactsData?.image_url || sourcesWithData.find(s => s.productImage)?.productImage || ''
      },
      minimumSourcesRequired: MINIMUM_SOURCES_REQUIRED,
      sourcesFound: sourcesWithData.length
    };

    console.log('\n========================================');
    console.log('Verification Complete');
    console.log(`Sources: ${result.sourcesFound}/${result.minimumSourcesRequired}`);
    console.log(`Consistency: ${result.consistency.score}%`);
    console.log('========================================\n');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in verify-brand-sources:', error);
    return new Response(
      JSON.stringify({
        error: error.message,
        minimumSourcesRequired: MINIMUM_SOURCES_REQUIRED,
        sourcesFound: 0
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  }
});

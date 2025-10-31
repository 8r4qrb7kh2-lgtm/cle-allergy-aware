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
  productTitle?: string;
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
  searchLogs?: string[];
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

// Helper: check if the found page's product title likely matches the expected brand/product
function titlesLikelyMatch(expectedBrand: string, expectedProduct: string, actualTitle?: string): boolean {
  if (!actualTitle || actualTitle.trim().length === 0) return true; // If unknown, don't reject

  const normalize = (s: string) => s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const expected = normalize(`${expectedBrand} ${expectedProduct}`);
  const title = normalize(actualTitle);

  const expectedTokens = new Set(expected.split(' '));
  const titleTokens = new Set(title.split(' '));

  // All expected tokens should be present in the title (subset test)
  const allExpectedPresent = [...expectedTokens].every(t => titleTokens.has(t));
  if (!allExpectedPresent) return false;

  return true;
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

🚨 CRITICAL INSTRUCTIONS FOR INGREDIENT EXTRACTION:

1. **EXTRACT INGREDIENTS EXACTLY AS WRITTEN - VERBATIM COPY**
   - Copy the ENTIRE ingredient list EXACTLY as it appears on the website
   - Include EVERY single ingredient - do NOT skip, abbreviate, or summarize
   - Preserve ALL punctuation, capitalization, and formatting
   - Include parenthetical information: "Natural Flavor (Contains Milk)" not "Natural Flavor"
   - Include percentages if shown: "Water (70%)" not "Water"
   - Include all sub-ingredients: "Seasoning (Salt, Spices, Garlic Powder)" not "Seasoning"
   - DO NOT paraphrase or reword - copy character-by-character
   - DO NOT use "..." or "etc." - include the complete list
   
   ❌ WRONG: "Whole Grain Oats, Sugar, Salt, Natural Flavor"
   ✅ CORRECT: "Whole grain oats, chicory root extract, sugar, salt, natural flavor, monk fruit extract."

2. Look for explicit allergen statements (CONTAINS:, allergen warnings)
3. Look for dietary labels (Vegan, Vegetarian, Pescatarian)
4. Look for cross-contamination warnings (May contain...)

ALLERGEN DETECTION (TOP 9 ONLY):
Analyze ingredients and detect ONLY these allergens:
- "milk" (milk, butter, cheese, whey, casein, lactose, cream)
- "eggs" (egg, albumin, mayonnaise)
- "fish" (fish, anchovy, cod, salmon, tuna)
- "shellfish" (shrimp, crab, lobster, clam, oyster)
- "tree nuts" (almonds, cashews, walnuts, pecans, pistachios, hazelnuts, macadamia)
- "peanuts" (peanut, peanut butter, peanut oil)
- "wheat" (wheat, wheat flour - NOT barley, rye, or oats)
- "soybeans" (soy, soybean, soy lecithin, tofu, edamame)
- "sesame" (sesame, tahini, sesame oil)

DIETARY COMPATIBILITY:
- Vegan: NO animal products (no meat, fish, dairy, eggs, honey, gelatin)
  → If vegan, also vegetarian and pescatarian
- Vegetarian: NO meat or fish (may have dairy/eggs)
  → If vegetarian, also pescatarian
- Pescatarian: NO meat (may have fish, dairy, eggs)

Return JSON:
{
  "name": "${retailerName}",
  "url": "https://...",  // MUST be the SPECIFIC product page URL, NOT the homepage
  "productTitle": "Exact product title from the page",
  "ingredientsText": "EXACT VERBATIM ingredient list - copy character-by-character from the website",
  "explicitAllergenStatement": "if found",
  "explicitDietaryLabels": "if found",
  "crossContaminationWarnings": "if found",
  "allergens": ["tree nuts", "milk"],
  "diets": ["pescatarian"],
  "confidence": 90
}

CRITICAL: 
- The "ingredientsText" field MUST be copied EXACTLY as written on the website - verbatim, character-by-character
- The "url" field MUST be the specific product page URL where you found the ingredients
- Do NOT use homepage URLs like "https://www.nutritionix.com/" - use the actual product page

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

    // Reject search URLs - we only want actual product pages
    const url = searchData.url || '';
    const isSearchUrl = url.includes('/s?') || url.includes('/search?') || url.includes('searchTerm=') || url.includes('/search/');
    if (isSearchUrl) {
      console.log(`✗ ${retailerName}: Rejected - URL is a search page, not a product page: ${url}`);
      return null;
    }

    // Validate product title if provided
    if (!titlesLikelyMatch(brand, productName, searchData.productTitle)) {
      console.log(`✗ ${retailerName}: Rejected - product title likely mismatch: "${searchData.productTitle || 'N/A'}" vs expected "${brand} ${productName}"`);
      return null;
    }

    console.log(`✓ ${retailerName}: Found ingredients (${searchData.ingredientsText.length} chars)`);
    
    return {
      name: searchData.name || retailerName,
      url: url,
      productTitle: searchData.productTitle || '',
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
  
  // If the caller asked for general web search, use the bulk flow with a general prompt
  if (sourceType.toLowerCase().includes('general web')) {
    return searchGeneralWebPerplexity(searchQuery, productName, brand, barcode);
  }

  // Otherwise treat sourceType as a list of retailers
  const retailers = sourceType.split(/\s+/).filter(r => r.length > 2);
  console.log(`Targeting retailers: ${retailers.join(', ')}`);

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

🚨 CRITICAL REQUIREMENTS FOR INGREDIENT EXTRACTION:

1. **EXTRACT INGREDIENTS EXACTLY AS WRITTEN - VERBATIM COPY**
   - Copy the ENTIRE ingredient list EXACTLY as it appears on each website
   - Include EVERY single ingredient - do NOT skip, abbreviate, or summarize
   - Preserve ALL punctuation, capitalization, and formatting
   - Include parenthetical information: "Natural Flavor (Contains Milk)" not "Natural Flavor"
   - Include percentages if shown: "Water (70%)" not "Water"
   - Include all sub-ingredients: "Seasoning (Salt, Spices, Garlic Powder)" not "Seasoning"
   - DO NOT paraphrase or reword - copy character-by-character
   - DO NOT use "..." or "etc." - include the complete list
   - For beverages: even short lists are acceptable (e.g., "Water, Barley, Hops, Yeast")
   
   ❌ WRONG: "Whole Grain Oats, Sugar, Salt, Natural Flavor"
   ✅ CORRECT: "Whole grain oats, chicory root extract, sugar, salt, natural flavor, monk fruit extract."

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
5. ANALYZE INGREDIENTS for allergens (TOP 9 FDA ALLERGENS ONLY):
   - "milk": milk, butter, cheese, whey, casein, lactose, cream, yogurt
   - "eggs": egg, albumin, mayonnaise, meringue
   - "fish": fish, anchovy, cod, salmon, tuna, bass
   - "shellfish": shrimp, crab, lobster, clam, oyster, mussel
   - "tree nuts": almonds, cashews, walnuts, pecans, pistachios, hazelnuts, macadamia
   - "peanuts": peanut, peanut butter, peanut oil
   - "wheat": wheat, wheat flour (NOT barley, rye, or oats)
   - "soybeans": soy, soybean, soy lecithin, tofu, edamame
   - "sesame": sesame, tahini, sesame oil

   IMPORTANT: Use exact allergen names above (e.g., "tree nuts" not "almonds", "soybeans" not "soy")
6. DETERMINE DIETARY COMPATIBILITY (use logical rules):
   - Vegan: NO animal products (no meat, fish, dairy, eggs, honey, gelatin, whey)
     → If vegan → return ["vegan", "vegetarian", "pescatarian"]
   - Vegetarian: NO meat or fish (may have dairy/eggs)
     → If vegetarian (not vegan) → return ["vegetarian", "pescatarian"]
   - Pescatarian: NO meat (may have fish, dairy, eggs)
     → If pescatarian only → return ["pescatarian"]
   - If contains meat/poultry → return []

   IMPORTANT: Check carefully:
   - If has milk/cheese/whey/butter → NOT vegan (but may be vegetarian)
   - If has eggs → NOT vegan (but may be vegetarian)
   - If has fish → NOT vegan/vegetarian (but may be pescatarian)
   - If has meat/chicken/beef/pork → return []
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
      "url": "https://amazon.com/dp/B08XYZ123",  // SPECIFIC product page
      "productTitle": "Exact product title",
      "ingredientsText": "EXACT VERBATIM ingredient list - copy character-by-character from Amazon's website",
      "explicitAllergenStatement": "CONTAINS: TREE NUTS (ALMONDS)",
      "explicitDietaryLabels": "Vegan, Gluten-Free",
      "crossContaminationWarnings": "May contain sesame",
      "allergens": ["tree nuts"],
      "diets": ["vegan", "vegetarian", "pescatarian"],
      "confidence": 95
    },
    {
      "name": "Walmart",
      "url": "https://walmart.com/ip/Product-Name/12345",  // SPECIFIC product page
      "productTitle": "Exact product title",
      "ingredientsText": "EXACT VERBATIM ingredient list - copy character-by-character from Walmart's website",
      "explicitAllergenStatement": "",
      "explicitDietaryLabels": "",
      "crossContaminationWarnings": "",
      "allergens": ["tree nuts"],
      "diets": ["vegan", "vegetarian", "pescatarian"],
      "confidence": 90
    },
    {
      "name": "Target",
      "url": "https://target.com/p/product-name/-/A-12345",  // SPECIFIC product page
      "productTitle": "Exact product title",
      "ingredientsText": "EXACT VERBATIM ingredient list - copy character-by-character from Target's website",
      ...same fields...
      "confidence": 85
    }
  ]
}

// General Web search with Perplexity (defined later after bulk function)

✅ GOOD: 2-3+ sources in your response
❌ BAD: Only 1 source (keep searching!)
❌ BAD: Empty sources array {"sources": []} (unless product truly doesn't exist anywhere)
❌ BAD: Homepage URLs like "https://www.nutritionix.com/" - use the SPECIFIC product page!
❌ BAD: Summarized ingredients like "Whole Grain Oats, Sugar, Salt, Natural Flavor" - MUST be verbatim copy!

Accept ANY length ingredient list - even "Water, Barley, Hops, Yeast" is valid.

CRITICAL REMINDERS:
- Each "ingredientsText" field MUST be copied EXACTLY, character-by-character from the website
- Each "url" field MUST be the specific product page URL where you found the ingredients
- Do NOT use homepage URLs - use the actual product page with the ingredient information
- Do NOT paraphrase, summarize, or abbreviate the ingredient list - copy it verbatim
- You MUST search multiple websites and return 2-3+ sources in the sources array`;

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
          // Reject search URLs - we only want actual product pages
          const url = source.url || '';
          const isSearchUrl = url.includes('/s?') || url.includes('/search?') || url.includes('searchTerm=') || url.includes('/search/');
          if (isSearchUrl) {
            console.log(`✗ ${sourceType} rejected: ${source.name || 'Unknown'} - URL is a search page, not a product page: ${url}`);
            continue;
          }

          // Validate product title if provided
          if (!titlesLikelyMatch(brand, productName, source.productTitle || source.title)) {
            console.log(`✗ ${sourceType} rejected: ${source.name || 'Unknown'} - product title likely mismatch: "${source.productTitle || source.title || 'N/A'}"`);
            continue;
          }

          // Validate product title if provided
          if (!titlesLikelyMatch(brand, productName, source.productTitle || source.title)) {
            console.log(`✗ ${sourceType} rejected: ${source.name || 'Unknown'} - product title likely mismatch: "${source.productTitle || source.title || 'N/A'}"`);
            continue;
          }

          const allergenInfo = source.allergens && source.allergens.length > 0 ? ` [Allergens: ${source.allergens.join(', ')}]` : '';
          const dietInfo = source.diets && source.diets.length > 0 ? ` [Diets: ${source.diets.join(', ')}]` : '';
          console.log(`✓ ${sourceType} found: ${source.name} (${source.confidence}% confidence)${allergenInfo}${dietInfo}`);
          console.log(`  Ingredients (${source.ingredientsText.length} chars): ${source.ingredientsText.substring(0, 100)}...`);
          sources.push({
            name: source.name,
            url: url,
            productTitle: source.productTitle || source.title || '',
            productTitle: source.productTitle || source.title || '',
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

// General Web search with Perplexity
async function searchGeneralWebPerplexity(
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string
): Promise<Source[]> {
  console.log(`General Web search with Perplexity: ${searchQuery}`);

  const generalPrompt = `You are searching the web for ingredient information about this product: ${brand} ${productName} (Barcode: ${barcode})

🎯 YOUR TASK: Find ingredient lists from AT LEAST 3 DIFFERENT INDEPENDENT WEBSITES

Search the entire web and use your own judgment to find ANY websites that have ingredient information for this product.

⚠️ CRITICAL REQUIREMENTS:
1. You MUST find AT LEAST 3 independent sources - this is not optional
2. Each source must have the COMPLETE ingredient list for this exact product
3. All 3+ ingredient lists must match (same ingredients, possibly different wording)
4. If ingredient lists don't match across sources, keep searching until you find 3 that DO match
5. URLs must be SPECIFIC product pages (not search results or homepages)
6. Copy ingredient lists EXACTLY as written on each website (verbatim, character-by-character)
7. Search ANY websites you find - don't limit yourself to specific types of sites

📋 RETURN FORMAT:
{
  "sources": [
    {
      "name": "Source Name",
      "url": "https://specific-product-page-url.com",
      "productTitle": "Exact product title from page",
      "ingredientsText": "EXACT VERBATIM ingredient list copied character-by-character",
      "explicitAllergenStatement": "Any allergen warnings found",
      "explicitDietaryLabels": "Any dietary labels found",
      "crossContaminationWarnings": "Any cross-contamination warnings",
      "allergens": ["detected allergens"],
      "diets": ["detected diets"],
      "confidence": 90
    },
    ... AT LEAST 2 MORE SOURCES LIKE THIS ...
  ]
}

IMPORTANT REMINDERS:
- If you only find 1-2 sources, KEEP SEARCHING until you have at least 3
- Search the ENTIRE WEB - any website that has ingredient information is valid
- Verify all ingredient lists match before returning
- Use your own judgment about which websites to search and which results to trust`;

  try {
    const resp = await fetch('https://api.perplexity.ai/chat/completions', {
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
            content: 'You are a comprehensive web researcher. When asked to find ingredient information, you MUST search multiple different websites until you find at least 3 independent sources with matching ingredient lists. Do not stop searching after finding just 1-2 sources.'
          },
          { role: 'user', content: generalPrompt }
        ],
        temperature: 0.1,
        max_tokens: 16000,
        return_citations: true,
        search_recency_filter: 'month'
      })
    });

    if (!resp.ok) {
      console.log('General Web Perplexity search failed:', resp.status);
      return [];
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    const out: Source[] = [];
    if (Array.isArray(parsed.sources)) {
      for (const s of parsed.sources) {
        if (!s.ingredientsText || s.ingredientsText.trim().length <= 10) continue;
        const url: string = s.url || '';
        const isSearchUrl = url.includes('/s?') || url.includes('/search?') || url.includes('searchTerm=') || url.includes('/search/');
        if (isSearchUrl) continue;
        if (!titlesLikelyMatch(brand, productName, s.productTitle || s.title)) continue;
        out.push({
          name: s.name,
          url: url,
          productTitle: s.productTitle || s.title || '',
          ingredientsText: s.ingredientsText,
          explicitAllergenStatement: s.explicitAllergenStatement || '',
          explicitDietaryLabels: s.explicitDietaryLabels || '',
          crossContaminationWarnings: s.crossContaminationWarnings || '',
          allergens: s.allergens || [],
          diets: s.diets || [],
          confidence: s.confidence || 80,
          dataAvailable: true
        });
      }
    }
    console.log(`General Web Perplexity: ${out.length} sources`);
    return out;
  } catch (e) {
    console.log('General Web Perplexity error:', (e as any).message);
    return [];
  }
}

// General Web search with Claude
async function searchGeneralWebClaude(
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string
): Promise<Source[]> {
  console.log(`General Web search with Claude: ${searchQuery}`);

  const prompt = `Search the web broadly for the EXACT product below and extract ingredient lists from multiple independent pages.

Product: ${brand} ${productName}
Barcode: ${barcode}

INSTRUCTIONS:
- Find 2-4 independent sources (official brand site, reputable retailers, databases, PDFs) for this exact product.
- For EACH source:
  - Provide the SPECIFIC product page URL (not a search/homepage)
  - Include productTitle from the page
  - Copy the ingredient list VERBATIM (character-by-character)
  - Include explicit allergen statements, dietary labels, and cross-contamination warnings if present
- Reject pages that are not the exact product (different size/flavor/variant).

Return JSON: {"sources": [{"name":"","url":"","productTitle":"","ingredientsText":"...", "explicitAllergenStatement":"", "explicitDietaryLabels":"", "crossContaminationWarnings":"", "allergens":[], "diets":[], "confidence":90}]} `;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]
      })
    });

    if (!resp.ok) return [];
    const result = await resp.json();
    let text = '';
    for (const block of result.content) {
      if (block.type === 'text') text += block.text;
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    const out: Source[] = [];
    if (Array.isArray(parsed.sources)) {
      for (const s of parsed.sources) {
        if (!s.ingredientsText || s.ingredientsText.trim().length <= 10) continue;
        const url: string = s.url || '';
        const isSearchUrl = url.includes('/s?') || url.includes('/search?') || url.includes('searchTerm=') || url.includes('/search/');
        if (isSearchUrl) continue;
        if (!titlesLikelyMatch(brand, productName, s.productTitle || s.title)) continue;
        out.push({
          name: s.name,
          url: url,
          productTitle: s.productTitle || s.title || '',
          ingredientsText: s.ingredientsText,
          explicitAllergenStatement: s.explicitAllergenStatement || '',
          explicitDietaryLabels: s.explicitDietaryLabels || '',
          crossContaminationWarnings: s.crossContaminationWarnings || '',
          allergens: s.allergens || [],
          diets: s.diets || [],
          confidence: s.confidence || 80,
          dataAvailable: true
        });
      }
    }
    console.log(`General Web Claude: ${out.length} sources`);
    return out;
  } catch (e) {
    console.log('General Web Claude error:', (e as any).message);
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
  if (sourceType.toLowerCase().includes('general web')) {
    return searchGeneralWebClaude(searchQuery, productName, brand, barcode);
  }

  const searchPrompt = `You are searching for ingredient information for a food or beverage product.

Product: ${brand} ${productName}
Barcode: ${barcode}
Focus: ${sourceType}

Search for this EXACT product's ingredient list on ${sourceType}.

🚨 CRITICAL REQUIREMENTS FOR INGREDIENT EXTRACTION:

1. **EXTRACT INGREDIENTS EXACTLY AS WRITTEN - VERBATIM COPY**
   - Copy the ENTIRE ingredient list EXACTLY as it appears on the website
   - Include EVERY single ingredient - do NOT skip, abbreviate, or summarize
   - Preserve ALL punctuation, capitalization, and formatting
   - Include parenthetical information: "Natural Flavor (Contains Milk)" not "Natural Flavor"
   - Include percentages if shown: "Water (70%)" not "Water"
   - Include all sub-ingredients: "Seasoning (Salt, Spices, Garlic Powder)" not "Seasoning"
   - DO NOT paraphrase or reword - copy character-by-character
   - DO NOT use "..." or "etc." - include the complete list
   - For beverages: even short lists are acceptable (e.g., "Water, Barley, Hops, Yeast")
   
   ❌ WRONG: "Whole Grain Oats, Sugar, Salt, Natural Flavor"
   ✅ CORRECT: "Whole grain oats, chicory root extract, sugar, salt, natural flavor, monk fruit extract."

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
5. ANALYZE INGREDIENTS for allergens (TOP 9 FDA ALLERGENS ONLY):
   - "milk": milk, butter, cheese, whey, casein, lactose, cream, yogurt
   - "eggs": egg, albumin, mayonnaise, meringue
   - "fish": fish, anchovy, cod, salmon, tuna, bass
   - "shellfish": shrimp, crab, lobster, clam, oyster, mussel
   - "tree nuts": almonds, cashews, walnuts, pecans, pistachios, hazelnuts, macadamia
   - "peanuts": peanut, peanut butter, peanut oil
   - "wheat": wheat, wheat flour (NOT barley, rye, or oats)
   - "soybeans": soy, soybean, soy lecithin, tofu, edamame
   - "sesame": sesame, tahini, sesame oil

   IMPORTANT: Use exact allergen names above (e.g., "tree nuts" not "almonds", "soybeans" not "soy")
6. DETERMINE DIETARY COMPATIBILITY (use logical rules):
   - Vegan: NO animal products (no meat, fish, dairy, eggs, honey, gelatin, whey)
     → If vegan → return ["vegan", "vegetarian", "pescatarian"]
   - Vegetarian: NO meat or fish (may have dairy/eggs)
     → If vegetarian (not vegan) → return ["vegetarian", "pescatarian"]
   - Pescatarian: NO meat (may have fish, dairy, eggs)
     → If pescatarian only → return ["pescatarian"]
   - If contains meat/poultry → return []

   IMPORTANT: Check carefully:
   - If has milk/cheese/whey/butter → NOT vegan (but may be vegetarian)
   - If has eggs → NOT vegan (but may be vegetarian)
   - If has fish → NOT vegan/vegetarian (but may be pescatarian)
   - If has meat/chicken/beef/pork → return []
7. Set confidence level (0-100) based on:
   - 90-100: Found exact product match with complete ingredient list
   - 70-89: Found product but some uncertainty (different size/flavor variation)
   - Below 70: Don't include - not confident it's the right product

Format your response as JSON:
{
  "sources": [
    {
      "name": "Website Name (e.g., 'Kroger', 'Amazon', 'Stacy's Official Site')",
      "url": "https://...",  // MUST be SPECIFIC product page URL, NOT homepage
      "ingredientsText": "EXACT VERBATIM ingredient list - copy character-by-character from the website - every single ingredient",
      "explicitAllergenStatement": "CONTAINS: TREE NUTS (ALMONDS)" (if found, otherwise empty string),
      "explicitDietaryLabels": "Vegan, Gluten-Free" (if found, otherwise empty string),
      "crossContaminationWarnings": "May contain sesame" (if any warning exists, otherwise empty string),
      "allergens": ["tree nuts"],
      "diets": ["vegan", "vegetarian", "pescatarian"],
      "confidence": 90
    }
  ]
}

// General Web search with Claude (defined later after Claude function)

CRITICAL REMINDERS:
- The "ingredientsText" field MUST be copied EXACTLY, character-by-character from the website
- The "url" field MUST be the specific product page URL where you found the ingredients
- Do NOT use homepage URLs like "https://www.nutritionix.com/" - use the actual product page
- Do NOT paraphrase, summarize, or abbreviate the ingredient list - copy it verbatim

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
          // Reject search URLs - we only want actual product pages
          const url = source.url || '';
          const isSearchUrl = url.includes('/s?') || url.includes('/search?') || url.includes('searchTerm=') || url.includes('/search/');
          if (isSearchUrl) {
            console.log(`✗ ${sourceType} rejected: ${source.name || 'Unknown'} - URL is a search page, not a product page: ${url}`);
            continue;
          }

          const allergenInfo = source.allergens && source.allergens.length > 0 ? ` [Allergens: ${source.allergens.join(', ')}]` : '';
          const dietInfo = source.diets && source.diets.length > 0 ? ` [Diets: ${source.diets.join(', ')}]` : '';
          console.log(`✓ ${sourceType} found: ${source.name} (${source.confidence}% confidence)${allergenInfo}${dietInfo}`);
          console.log(`  Ingredients (${source.ingredientsText.length} chars): ${source.ingredientsText.substring(0, 100)}...`);
          sources.push({
            name: source.name,
            url: url,
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

  // Initialize search logs array
  const searchLogs: string[] = [];
  const addLog = (message: string) => {
    console.log(message);
    searchLogs.push(message);
  };

  try {
    const { productName, brand, barcode, openFoodFactsData, provider = 'claude' } = await req.json();

    addLog(`🔍 Starting search for: ${brand} ${productName}`);
    addLog(`📊 Barcode: ${barcode}`);
    addLog(`🤖 Using: ${provider.toUpperCase()} API`);
    addLog(`⚙️ Minimum sources required: 3 with matching ingredients`);

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
      addLog('✅ Found product in Open Food Facts database');
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
    addLog('');
    addLog('🌐 PHASE 1: Searching the web for ingredient sources...');
    addLog(`📝 Search query: "${brand} ${productName} ingredients"`);
    const phase1Promises = [
      searchSourceType('General Web', `${brand} ${productName} ingredients`, productName, brand, barcode, searchProvider)
    ];

    const phase1Results = await Promise.all(phase1Promises);
    for (const sources of phase1Results) {
      allSources.push(...sources);
    }

    addLog(`📊 Phase 1 complete: Found ${allSources.length} potential sources`);

    // DEDUPLICATE by URL - same URL means same source
    addLog('');
    addLog('🔄 Deduplicating sources by URL...');
    const seenUrls = new Map<string, Source>();
    for (const source of allSources) {
      const normalizedUrl = source.url.toLowerCase().trim();
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.set(normalizedUrl, source);
        addLog(`  ✓ ${source.name}: ${source.url.substring(0, 60)}...`);
      }
    }
    allSources = Array.from(seenUrls.values());
    addLog(`✅ ${allSources.length} unique sources after deduplication`);

    // Skip URL validation - Perplexity has already extracted the ingredient data
    addLog('');
    addLog('🔍 Checking if ingredient lists match across sources...');

    // Check if we already have 3 matching sources
    let matchingSources: Source[] = [];
    const referenceIngredients = allSources[0]?.ingredientsText || '';

    for (const source of allSources) {
      if (ingredientsMatch(source.ingredientsText, referenceIngredients)) {
        matchingSources.push(source);
        addLog(`  ✅ ${source.name} - Ingredients match!`);
        if (matchingSources.length >= MINIMUM_SOURCES_REQUIRED) {
          addLog('');
          addLog(`🎉 SUCCESS: Found ${MINIMUM_SOURCES_REQUIRED} sources with matching ingredients in Phase 1!`);
          break;
        }
      } else {
        addLog(`  ❌ ${source.name} - Ingredients don't match (will not use)`);
      }
    }

    // PHASE 2: If needed, do 2 more searches with even more diverse queries
    if (matchingSources.length < MINIMUM_SOURCES_REQUIRED) {
      addLog('');
      addLog(`⚠️ Only found ${matchingSources.length} matching sources. Need ${MINIMUM_SOURCES_REQUIRED}.`);
      addLog('🌐 PHASE 2: Expanding web search with more queries...');
      addLog(`📝 Additional searches: "${brand} ${productName} ingredient list" and "${brand} ${productName} ingredients allergens"`);

      const phase2Promises = [
        searchSourceType('General Web', `${brand} ${productName} ingredient list`, productName, brand, barcode, searchProvider),
        searchSourceType('General Web', `${brand} ${productName} ingredients allergens site`, productName, brand, barcode, searchProvider)
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
      console.log(`\nPHASE 3: Only ${matchingSources.length} matches after Phase 2. Trying additional general queries...`);

      const phase3Promises = [
        searchSourceType('General Web', `${brand} ${productName} nutrition facts ingredients`, productName, brand, barcode, searchProvider),
        searchSourceType('General Web', `${brand} ${productName} label ingredients PDF`, productName, brand, barcode, searchProvider)
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
      addLog('');
      addLog(`❌ VERIFICATION FAILED`);
      addLog(`   Found ${sourcesWithData.length} matching sources, need ${MINIMUM_SOURCES_REQUIRED}`);
      addLog(`   Perplexity was unable to find enough independent sources with matching ingredients`);

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
          dietsInferred: false,
          searchLogs
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    addLog('');
    addLog('✅ VERIFICATION SUCCESSFUL!');
    addLog(`   Found ${sourcesWithData.length} independent sources with matching ingredients`);

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

    // Add search logs to result
    result.searchLogs = searchLogs;

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

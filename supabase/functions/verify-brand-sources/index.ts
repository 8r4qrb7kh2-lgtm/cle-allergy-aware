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
  dietary_compliance?: {
    [key: string]: { is_compliant: boolean; reason: string };
  };
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
  dietary_compliance?: {
    [key: string]: { is_compliant: boolean; reason: string };
  };
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
// PERPLEXITY_API_KEY is deprecated - using Claude web search instead
const MINIMUM_SOURCES_REQUIRED = 3;

// Top 9 FDA allergens (must match exactly)
const APPROVED_ALLERGENS = new Set([
  'milk',
  'dairy',
  'eggs',
  'egg',
  'fish',
  'shellfish',
  'tree nuts',
  'tree nut',
  'peanuts',
  'peanut',
  'wheat',
  'soybeans',
  'soy',
  'sesame'
]);

// Helper function to filter allergens to only approved top 9
function filterApprovedAllergens(allergens: string[]): string[] {
  return allergens
    .map(a => a.toLowerCase().trim())
    .filter(a => APPROVED_ALLERGENS.has(a));
}

// Helper function to scrape ingredients directly from HTML
async function scrapeIngredientsFromHtml(url: string, addLog?: (msg: string) => void): Promise<string | null> {
  const log = addLog || console.log;

  try {
    log(`📥 Fetching HTML from ${url}...`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      log(`❌ Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();
    log(`✅ Fetched ${html.length} characters of HTML`);

    // Try multiple strategies to find ingredients
    const strategies = [
      // Strategy 1: Look for common ingredient section patterns
      () => {
        // Match patterns like "Ingredients:" or "INGREDIENTS:" followed by text
        const patterns = [
          /ingredients?[:\s]*[:\-]?\s*([^<]+?)(?:\s*<|$)/i,
          /<[^>]*>ingredients?[:\s]*[:\-]?\s*<\/[^>]*>\s*([^<]+?)(?:\s*<|$)/i,
          /<dt[^>]*>ingredients?[:\s]*[:\-]?\s*<\/dt>\s*<dd[^>]*>([^<]+?)<\/dd>/i,
          /<div[^>]*class[^>]*ingredient[^>]*>([^<]+?)<\/div>/i,
          /<span[^>]*class[^>]*ingredient[^>]*>([^<]+?)<\/span>/i,
        ];

        for (const pattern of patterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            const ingredients = match[1]
              .replace(/\s+/g, ' ')
              .trim();
            if (ingredients.length > 20 && ingredients.length < 2000) {
              return ingredients;
            }
          }
        }
        return null;
      },

      // Strategy 2: Look for JSON-LD structured data
      () => {
        const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        while ((match = jsonLdPattern.exec(html)) !== null) {
          try {
            const jsonData = JSON.parse(match[1]);
            // Check if it's product data with ingredients
            if (jsonData['@type'] === 'Product' || jsonData['@type'] === 'FoodProduct') {
              if (jsonData.ingredients) {
                return typeof jsonData.ingredients === 'string'
                  ? jsonData.ingredients
                  : Array.isArray(jsonData.ingredients)
                    ? jsonData.ingredients.join(', ')
                    : null;
              }
              // Check for nutrition information
              if (jsonData.nutrition && jsonData.nutrition.ingredients) {
                return typeof jsonData.nutrition.ingredients === 'string'
                  ? jsonData.nutrition.ingredients
                  : Array.isArray(jsonData.nutrition.ingredients)
                    ? jsonData.nutrition.ingredients.join(', ')
                    : null;
              }
            }
          } catch (e) {
            // Continue to next JSON-LD block
          }
        }
        return null;
      },

      // Strategy 3: Look for data attributes or specific class names common on retailer sites
      () => {
        const dataPatterns = [
          /data-ingredients=["']([^"']+)["']/i,
          /data-product-ingredients=["']([^"']+)["']/i,
          /class=["'][^"']*ingredient[^"']*["'][^>]*>([^<]+?)</i,
        ];

        for (const pattern of dataPatterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            const ingredients = match[1]
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/\s+/g, ' ')
              .trim();
            if (ingredients.length > 20 && ingredients.length < 2000) {
              return ingredients;
            }
          }
        }
        return null;
      },

      // Strategy 4: Look for text content after "Ingredients" label with various HTML structures
      () => {
        // Find text nodes or elements containing "Ingredients" and extract following content
        const ingredientSection = html.match(/ingredients?[:\s]*[:\-]?[\s\n]*([A-Za-z][^<]{20,2000})/is);
        if (ingredientSection && ingredientSection[1]) {
          let ingredients = ingredientSection[1]
            .replace(/[\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          // Remove HTML tags if any got through
          ingredients = ingredients.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

          // Stop at common ending markers
          const stopMarkers = ['Allergen', 'Contains', 'Nutrition', 'Serving', '<div', '<span'];
          for (const marker of stopMarkers) {
            const markerIndex = ingredients.toLowerCase().indexOf(marker.toLowerCase());
            if (markerIndex > 50) { // Only if we have substantial content before the marker
              ingredients = ingredients.substring(0, markerIndex).trim();
              break;
            }
          }

          if (ingredients.length > 20 && ingredients.length < 2000) {
            return ingredients;
          }
        }
        return null;
      },

      // Strategy 5: Kroger-specific patterns (most accurate extraction for kroger.com)
      () => {
        // Kroger uses specific HTML structure for ingredients in Nutrition Information section
        const krogerPatterns = [
          // Pattern: "Ingredients:" or "Ingredients" heading followed by ingredient text
          // Matches structure like: <h3>Ingredients</h3> or <strong>Ingredients:</strong> followed by text
          /<h[2-6][^>]*>[\s\n]*ingredients?[:\s]*<\/h[2-6]>[\s\n]*(?:<p[^>]*>|<div[^>]*>|<span[^>]*>)?[\s\n]*([A-Za-z][^<]{30,2000}?)(?:(?:<\/p>|<\/div>|<\/span>)|(?=\s*(?:<[^>]*>)?\s*(?:allergen|contains|nutrition|serving|disclaimer|foodhealth)))/is,
          // Pattern: Strong/bold "Ingredients:" followed by ingredient text
          /<strong[^>]*>[\s\n]*ingredients?[:\s]*<\/strong>[\s\n]*(?:<p[^>]*>|<div[^>]*>|<span[^>]*>)?[\s\n]*([A-Za-z][^<]{30,2000}?)(?:(?:<\/p>|<\/div>|<\/span>)|(?=\s*(?:<[^>]*>)?\s*(?:allergen|contains|nutrition|serving|disclaimer|foodhealth)))/is,
          // Pattern: Ingredients label in various tag formats
          /<[^>]*class[^>]*>[\s\n]*ingredients?[:\s]*<\/[^>]*>[\s\n]*(?:<[^>]*>)?[\s\n]*([A-Za-z][^<]{30,2000}?)(?=\s*(?:<[^>]*>)?\s*(?:allergen|contains|nutrition|serving|disclaimer|foodhealth|<\/))/is,
          // Pattern: Ingredients after "Nutrition Information" heading section
          /nutrition\s+information[^<]{0,500}?ingredients?[:\s]*[:\-]?[\s\n]*(?:<p[^>]*>|<div[^>]*>|<span[^>]*>)?[\s\n]*([A-Za-z][^<]{30,2000}?)(?:(?:<\/p>|<\/div>|<\/span>)|(?=\s*(?:<[^>]*>)?\s*(?:allergen|contains|nutrition|serving|disclaimer|foodhealth)))/is,
          // Pattern: Direct text extraction after "Ingredients:" label (fallback for simple structures)
          /ingredients?:\s*([A-Za-z][^<]{30,2000}?)(?=\s*(?:allergen|contains|nutrition|serving|disclaimer|foodhealth|<\/|$))/is,
        ];

        for (const pattern of krogerPatterns) {
          const match = html.match(pattern);
          if (match) {
            let ingredients = (match[1] || match[0]).trim();

            // Remove HTML tags
            ingredients = ingredients.replace(/<[^>]+>/g, ' ');

            // Clean up HTML entities
            ingredients = ingredients
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&nbsp;/g, ' ')
              .replace(/&#x27;/g, "'")
              .replace(/&apos;/g, "'")
              .replace(/[\r\n]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            // Stop at common ending markers
            const stopMarkers = ['Allergen Info', 'Allergen', 'Contains', 'Nutrition Facts', 'Serving', 'Disclaimer', 'FoodHealth', 'Learn More'];
            for (const marker of stopMarkers) {
              const markerIndex = ingredients.toLowerCase().indexOf(marker.toLowerCase());
              if (markerIndex > 50 && markerIndex < ingredients.length - 20) {
                ingredients = ingredients.substring(0, markerIndex).trim();
                break;
              }
            }

            // Validate it looks like an ingredient list
            if (ingredients.length > 30 && ingredients.length < 2000 &&
              /[A-Za-z]/.test(ingredients) &&
              ingredients.split(',').length >= 2) {
              return ingredients;
            }
          }
        }
        return null;
      },

      // Strategy 6: Look for structured data patterns specific to retailers (Kroger, Target, etc.)
      () => {
        // Common patterns for retailer ingredient sections
        const retailerPatterns = [
          // Pattern: <h2/h3>Ingredients</h2/h3> followed by text
          /<h[2-6][^>]*>ingredients?[:\s]*<\/h[2-6]>[\s\n]*([^<]{20,2000})/is,
          // Pattern: <p><strong>Ingredients</strong> followed by text
          /<p[^>]*>[\s\n]*<strong[^>]*>ingredients?[:\s]*<\/strong>[\s\n]*([^<]{20,2000})/is,
          // Pattern: Ingredients in a list format
          /ingredients?[:\s]*[:\-]?[\s\n]*<li[^>]*>([^<]+)<\/li>/is,
          // Pattern: Ingredients in a paragraph immediately after label
          /<p[^>]*class[^>]*>[\s\n]*ingredients?[:\s]*[:\-]?[\s\n]*([^<]{20,2000})/is,
          // Pattern: Ingredients in div with specific classes (common on retailer sites)
          /<div[^>]*>[\s\n]*<[^>]*>ingredients?[:\s]*[:\-]?<\/[^>]*>[\s\n]*<div[^>]*>([^<]{20,2000})<\/div>/is,
        ];

        for (const pattern of retailerPatterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            let ingredients = match[1]
              .replace(/<[^>]+>/g, ' ') // Remove HTML tags
              .replace(/[\r\n]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            // Clean up HTML entities
            ingredients = ingredients
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&nbsp;/g, ' ')
              .trim();

            // Stop at common ending markers
            const stopMarkers = ['Allergen', 'Contains', 'Nutrition', 'Serving', 'Disclaimer', '<div', '<span', '</div>'];
            for (const marker of stopMarkers) {
              const markerIndex = ingredients.toLowerCase().indexOf(marker.toLowerCase());
              if (markerIndex > 50) {
                ingredients = ingredients.substring(0, markerIndex).trim();
                break;
              }
            }

            if (ingredients.length > 20 && ingredients.length < 2000) {
              return ingredients;
            }
          }
        }
        return null;
      }
    ];

    // Try each strategy until we find ingredients
    for (let i = 0; i < strategies.length; i++) {
      log(`   Trying strategy ${i + 1}...`);
      const ingredients = strategies[i]();
      if (ingredients) {
        log(`   ✅ Found ingredients using strategy ${i + 1} (${ingredients.length} chars)`);
        log(`   Preview: ${ingredients.substring(0, 100)}...`);
        return ingredients;
      }
    }

    log(`   ❌ Could not extract ingredients from HTML`);
    return null;
  } catch (error) {
    log(`   ❌ Error scraping HTML: ${(error as any).message}`);
    return null;
  }
}

// Common retailer disclaimers to filter out (not actual product information)
const RETAILER_DISCLAIMERS = [
  /actual product packaging and materials may contain additional and\/or different information/i,
  /product information provided by/i,
  /we recommend that you do not rely solely on the information presented/i,
  /contact manufacturer for most current/i,
  /nutritional content may vary/i,
  /check label for most current/i,
  /product images are for illustrative purposes/i,
  /actual product may vary/i,
  /always read labels/i,
  /disclaimer/i
];

// Helper function to filter out generic retailer disclaimers from warnings
function filterRetailerDisclaimers(text: string): string | null {
  if (!text || text.trim().length === 0) return null;

  // Check if this is just a generic retailer disclaimer
  for (const pattern of RETAILER_DISCLAIMERS) {
    if (pattern.test(text)) {
      return null; // Filter it out
    }
  }

  return text; // Keep it if it's not a disclaimer
}

// Known retailers where we should prioritize direct HTML scraping over LLM extraction
const KNOWN_RETAILERS = [
  { domain: 'kroger.com', name: 'Kroger' },
  { domain: 'target.com', name: 'Target' },
  { domain: 'walmart.com', name: 'Walmart' },
  { domain: 'amazon.com', name: 'Amazon' },
  { domain: 'cub.com', name: 'Cub' },
  { domain: 'safeway.com', name: 'Safeway' },
  { domain: 'wegmans.com', name: 'Wegmans' },
  { domain: 'publix.com', name: 'Publix' },
];

// Check if URL is from a known retailer that supports direct scraping
function isKnownRetailer(url: string): { domain: string; name: string } | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().replace('www.', '');

    for (const retailer of KNOWN_RETAILERS) {
      if (hostname === retailer.domain || hostname.endsWith('.' + retailer.domain)) {
        return retailer;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Use Claude Sonnet 4.5 to extract ingredients verbatim from HTML with strict validation
async function extractIngredientsWithClaude(
  url: string,
  html: string,
  productName: string,
  brand: string,
  addLog?: (msg: string) => void
): Promise<{
  ingredientsText: string;
  explicitAllergenStatement: string;
  crossContaminationWarnings: string;
  allergens: string[];
  dietary_compliance?: {
    [key: string]: {
      is_compliant: boolean;
      reason: string;
    }
  };
  diets?: string[];
} | null> {
  const log = addLog || console.log;

  log(`🤖 [CLAUDE] Extracting ingredients from HTML using Claude Sonnet 4.5...`);

  if (!ANTHROPIC_API_KEY) {
    log(`❌ [CLAUDE] ANTHROPIC_API_KEY not available`);
    return null;
  }

  try {
    // Extract larger HTML sections to capture full ingredient lists
    // Find the ingredient section and include more context around it
    let htmlSnippet = '';

    // First, try to find JSON-LD structured data (most reliable)
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const match of jsonLdMatches) {
        const jsonContent = match.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1];
        if (jsonContent && (jsonContent.includes('ingredient') || jsonContent.includes('Product') || jsonContent.includes('FoodProduct'))) {
          htmlSnippet += `JSON-LD Structured Data:\n${jsonContent}\n\n`;
          log(`   ✅ Found JSON-LD structured data`);
        }
      }
    }

    // Extract HTML sections that likely contain ingredients
    // Look for "Ingredients" heading/section and capture a MUCH larger surrounding context
    // Increased from 5000 to 15000 chars to ensure we capture full ingredient lists with all sub-ingredients
    const ingredientPatterns = [
      /<h[2-6][^>]*>[\s\S]{0,100}ingredients?[:\s]*<\/h[2-6]>[\s\S]{0,15000}/i,
      /<strong[^>]*>[\s\S]{0,100}ingredients?[:\s]*<\/strong>[\s\S]{0,15000}/i,
      /ingredients?[:\s]*<\/[^>]*>[\s\S]{0,15000}/i,
      /<div[^>]*class[^>]*ingredient[^>]*>[\s\S]{0,15000}/i,
      /<p[^>]*>[\s\S]{0,100}ingredients?[:\s]*[:\-]?[\s\S]{0,15000}/i,
      /nutrition[\s\S]{0,500}ingredients?[\s\S]{0,15000}/i,
    ];

    let foundIngredientSection = false;
    for (const pattern of ingredientPatterns) {
      const match = html.match(pattern);
      if (match && match[0]) {
        htmlSnippet += `HTML Section:\n${match[0]}\n\n`;
        foundIngredientSection = true;
        log(`   ✅ Found ingredient section with pattern (${match[0].length} chars)`);
        break;
      }
    }

    // If no specific section found, extract a larger chunk around ingredient keywords
    if (!foundIngredientSection) {
      const keywordIndex = html.toLowerCase().indexOf('ingredient');
      if (keywordIndex >= 0) {
        const start = Math.max(0, keywordIndex - 1000);
        const end = Math.min(html.length, keywordIndex + 15000);
        htmlSnippet += `HTML Content (around 'ingredient' keyword):\n${html.substring(start, end)}\n\n`;
        log(`   ⚠️ Using fallback extraction around keyword (${end - start} chars)`);
      } else {
        // Last resort: use first 50000 chars (should include most product pages)
        htmlSnippet += `HTML Content (first 50k chars):\n${html.substring(0, 50000)}\n\n`;
        log(`   ⚠️ Using fallback: first 50k chars of HTML`);
      }
    }

    // Also include any "Allergen" or "Contains" sections
    const allergenPatterns = [
      /allergen[^<]{0,500}contains?[^<]{0,2000}/i,
      /contains[^<]{0,2000}/i,
      /allergen[\s\S]{0,2000}/i,
    ];

    for (const pattern of allergenPatterns) {
      const match = html.match(pattern);
      if (match && match[0] && !htmlSnippet.includes(match[0])) {
        htmlSnippet += `Allergen Section:\n${match[0]}\n\n`;
        log(`   ✅ Found allergen section`);
        break;
      }
    }

    log(`   📄 Extracted HTML snippet (${htmlSnippet.length} chars) for Claude analysis`);

    // Log what we're sending to Claude for debugging
    log(`   🔍 HTML snippet preview (first 1000 chars):\n${htmlSnippet.substring(0, 1000)}...`);
    log(`   🔍 HTML snippet preview (last 1000 chars):\n...${htmlSnippet.substring(Math.max(0, htmlSnippet.length - 1000))}`);

    // Also log if ingredient keywords are in the snippet
    const snippetLower = htmlSnippet.toLowerCase();
    const hasIngredientKeyword = snippetLower.includes('ingredient');
    const ingredientKeywordCount = (snippetLower.match(/ingredient/g) || []).length;
    log(`   🔍 HTML snippet contains 'ingredient' keyword: ${hasIngredientKeyword} (${ingredientKeywordCount} times)`);

    const claudePrompt = `You are extracting ingredient and allergen information from HTML content. This is CRITICAL for food safety - accuracy is essential.

Product: ${brand} ${productName}
URL: ${url}

HTML CONTENT TO ANALYZE (this is the actual HTML from the website - extract exactly what it says):
${htmlSnippet}

⚠️ IMPORTANT: The HTML above may contain:
- HTML tags like <p>, <div>, <h3>, etc.
- HTML entities like &amp; (for &), &nbsp; (for space)
- The actual ingredient text is INSIDE these tags
- You must extract the TEXT CONTENT, not the HTML tags themselves

🚨 CRITICAL EXTRACTION RULES - READ CAREFULLY:

1. **FIND THE INGREDIENT LIST IN THE HTML**
   - Look for text labeled "Ingredients:" or "INGREDIENTS"
   - It may be in various HTML structures (divs, paragraphs, lists, JSON-LD)
   - Look for patterns like: "Ingredients:", "<h3>Ingredients</h3>", or JSON-LD product data

2. **EXTRACT INGREDIENTS VERBATIM - CHARACTER-BY-CHARACTER**
   - Find the TEXT CONTENT (the actual words) inside HTML tags
   - For example, if HTML has: <p>Almonds, Elote Seasoning (Corn Maltodextrin, Salt...)</p>
   - Extract: "Almonds, Elote Seasoning (Corn Maltodextrin, Salt...)"
   - Copy the ingredient list EXACTLY as it appears in the TEXT CONTENT (ignore HTML tags)
   - Convert HTML entities: &amp; → &, &nbsp; → space, &quot; → "
   - Preserve ALL punctuation, capitalization, spacing EXACTLY as written
   - Include parenthetical information: "(Corn Maltodextrin, Salt, ...)"
   - Include ALL sub-ingredients in parentheses
   - DO NOT add anything that's not in the HTML
   - DO NOT remove anything that IS in the HTML
   - DO NOT rearrange the order
   - DO NOT paraphrase or summarize
   - DO NOT include HTML tags in your output - only the text content
   - DO NOT change capitalization: if it says "Almonds" keep it "Almonds", if it says "almonds" keep it "almonds"
   - DO NOT normalize spacing: preserve exact spacing, line breaks, and formatting
   - DO NOT fix or "correct" anything - extract exactly as written, even if it looks wrong
   - DO NOT add periods or punctuation if they're not in the source
   - DO NOT remove periods or punctuation if they ARE in the source
   
3. **FIND EXPLICIT ALLERGEN STATEMENTS**
   - Look for "Contains:" statements
   - Look for "Allergen Information:" sections
   - Extract these word-for-word from the HTML
   
4. **FIND CROSS-CONTAMINATION WARNINGS**
   - Look for "May contain..." statements
   - Look for "Processed in a facility..." statements
   - Extract these word-for-word
   - IGNORE generic disclaimers like "Actual product packaging may contain..."

5. **VALIDATION - BEFORE RETURNING:**
   - Every word in your ingredientsText must appear in the HTML
   - Check that you haven't added ingredients not in the HTML
   - Check that you haven't removed ingredients that ARE in the HTML
   - If uncertain, return what you find, even if partial

Return JSON ONLY (no markdown, no explanations):
{
  "ingredientsText": "Exact ingredient list as it appears in HTML - verbatim copy",
  "explicitAllergenStatement": "Exact text if found (e.g., 'CONTAINS: TREE NUTS (ALMONDS)') or empty string",
  "crossContaminationWarnings": "Exact text if found (e.g., 'May contain sesame') or empty string",
  "allergens": [
    { "name": "tree nuts", "triggers": ["almonds"] },
    { "name": "milk", "triggers": ["milk powder", "whey"] }
  ],
  // CRITICAL: For each allergen, you MUST list the specific ingredients (triggers) that caused it to be flagged.
  // Do NOT return simple strings like ["milk"]. Return objects with "name" and "triggers".
  "dietary_compliance": {
    "Vegan": { "is_compliant": boolean, "reason": "string" },
    "Vegetarian": { "is_compliant": boolean, "reason": "string" },
    "Pescatarian": { "is_compliant": boolean, "reason": "string" },
    "Gluten-free": { "is_compliant": boolean, "reason": "string" }
  }
}

DIETARY COMPATIBILITY RULES:
- Plant-based ONLY (no animal-derived terms) → Vegan/Vegetarian/Pescatarian = true.
- Contains dairy/eggs but NO meat/fish → Vegetarian/Pescatarian = true, Vegan = false.
- Contains fish/seafood but no other meat → Pescatarian = true, Vegan/Vegetarian = false.
- Contains meat/poultry/pork/gelatin → Vegan/Vegetarian/Pescatarian = false.
- Gluten-free: true ONLY if NO wheat, barley, rye, malt, or gluten-containing grains.

CRITICAL FOR "REASON" FIELD:
- If is_compliant is FALSE, the "reason" MUST be a comma-separated list of the SPECIFIC INGREDIENTS from the text that cause the violation.
- DO NOT use generic terms like "Contains dairy" or "Contains meat".
- ONLY list the actual ingredient names found in the text.
- Example: "Pasteurized Lowfat Milk, Nonfat Milk" (NOT "Contains dairy products")
- Example: "Wheat Flour, Barley Malt" (NOT "Contains gluten")

EXAMPLE - If HTML contains:
"<h3>Ingredients</h3><p>Almonds, Elote Seasoning (Corn Maltodextrin, Salt, Cane Sugar, Cayenne Pepper Powder, Chili Pepper, Spices, Citric Acid, Chipotle Pepper Powder, Sunflower Oil, Corn Powder, Natural Flavor, Natural Smoke Flavor), Vegetable Oil (Almond, Canola, Safflower and/or Sunflower).</p>"

You MUST return:
{
  "ingredientsText": "Almonds, Elote Seasoning (Corn Maltodextrin, Salt, Cane Sugar, Cayenne Pepper Powder, Chili Pepper, Spices, Citric Acid, Chipotle Pepper Powder, Sunflower Oil, Corn Powder, Natural Flavor, Natural Smoke Flavor), Vegetable Oil (Almond, Canola, Safflower and/or Sunflower).",
  "explicitAllergenStatement": "",
  "crossContaminationWarnings": "",
  "allergens": ["tree nuts"],
  "dietary_compliance": {
    "Vegan": { "is_compliant": true, "reason": "No animal products found." },
    "Vegetarian": { "is_compliant": true, "reason": "No meat found." },
    "Pescatarian": { "is_compliant": true, "reason": "No meat found." },
    "Gluten-free": { "is_compliant": true, "reason": "No gluten sources found." }
  }
}

CRITICAL: Your ingredientsText must match the HTML EXACTLY. Check character-by-character.`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        temperature: 0.0, // Zero temperature for maximum determinism
        messages: [{
          role: 'user',
          content: claudePrompt
        }]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      log(`❌ [CLAUDE] API error: ${claudeResponse.status} - ${errorText}`);
      return null;
    }

    const claudeResult = await claudeResponse.json();
    const responseText = claudeResult.content?.[0]?.text || '';

    log(`📥 [CLAUDE] Received response (${responseText.length} chars)`);
    log(`   🔍 Raw response preview: ${responseText.substring(0, 1000)}...`);

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log(`❌ [CLAUDE] No JSON found in response`);
      log(`   Full response: ${responseText}`);
      return null;
    }

    log(`   🔍 Extracted JSON: ${jsonMatch[0].substring(0, 500)}...`);

    let extractedData;
    try {
      extractedData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      log(`❌ [CLAUDE] JSON parse error: ${(e as any).message}`);
      return null;
    }

    if (!extractedData.ingredientsText || extractedData.ingredientsText.trim().length < 20) {
      log(`⚠️ [CLAUDE] Invalid or too short ingredient text`);
      return null;
    }

    log(`✅ [CLAUDE] Successfully extracted ingredients (${extractedData.ingredientsText.length} chars)`);
    log(`   🔍 Full extracted text: ${extractedData.ingredientsText}`);

    // Enhanced validation: Check that extracted ingredients actually appear in HTML
    // First, extract clean text from HTML for comparison
    const htmlTextOnly = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ') // Remove script tags
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ') // Remove style tags
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    const htmlLower = htmlTextOnly.toLowerCase();
    const extractedLower = extractedData.ingredientsText.toLowerCase().trim();

    log(`   🔍 Validating against HTML (${htmlTextOnly.length} chars of text content)...`);
    log(`   🔍 HTML text preview (first 1000 chars): ${htmlTextOnly.substring(0, 1000)}...`);

    // Check if key ingredients appear in HTML text (word-level check)
    const ingredientWords = extractedData.ingredientsText
      .split(/[,\s\(\)\.]+/)
      .filter(w => w.length > 3 && !['and', 'and/or', 'or', 'the', 'may', 'contain'].includes(w.toLowerCase()));

    let matchingWords = 0;
    const checkedWords: string[] = [];

    for (const word of ingredientWords.slice(0, 15)) { // Check first 15 significant words
      const wordLower = word.toLowerCase().trim();
      if (wordLower.length < 2) continue;

      // Check if word appears in HTML (as whole word or part of larger word)
      if (htmlLower.includes(wordLower)) {
        matchingWords++;
        checkedWords.push(`✓${wordLower}`);
      } else {
        checkedWords.push(`✗${wordLower}`);
      }
    }

    log(`   📊 Word-level validation: ${matchingWords}/${ingredientWords.slice(0, 15).length} words found`);
    log(`   Words checked: ${checkedWords.join(', ')}`);

    // STRICT VALIDATION: Check for exact phrase matches (character-by-character)
    // Extract first 50 characters of ingredient list and check if it appears in HTML
    const extractedFirst50 = extractedData.ingredientsText.substring(0, 50).toLowerCase().trim();
    const extractedFirst100 = extractedData.ingredientsText.substring(0, 100).toLowerCase().trim();

    const hasExactPhrase50 = htmlLower.includes(extractedFirst50);
    const hasExactPhrase100 = htmlLower.includes(extractedFirst100);

    log(`   🔍 Exact phrase validation (first 50 chars): ${hasExactPhrase50 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    log(`   🔍 Exact phrase validation (first 100 chars): ${hasExactPhrase100 ? '✓ FOUND' : '✗ NOT FOUND'}`);

    if (!hasExactPhrase50) {
      log(`   ⚠️ CRITICAL: First 50 chars of extracted text NOT found in HTML!`);
      log(`   Extracted first 50: "${extractedFirst50}"`);
      log(`   This strongly suggests hallucination or reformatting!`);
    }

    // Check for key phrases that should definitely match
    const keyPhrases = extractedData.ingredientsText
      .split(',')
      .slice(0, 5)
      .map(p => p.trim().toLowerCase())
      .filter(p => p.length > 5);

    let matchingPhrases = 0;
    for (const phrase of keyPhrases) {
      if (htmlLower.includes(phrase)) {
        matchingPhrases++;
        log(`   ✓ Found phrase: "${phrase.substring(0, 40)}..."`);
      } else {
        log(`   ✗ MISSING phrase: "${phrase.substring(0, 40)}..."`);
      }
    }

    log(`   📊 Phrase-level validation: ${matchingPhrases}/${keyPhrases.length} phrases found`);

    if (matchingWords < 5 || !hasExactPhrase50 || matchingPhrases < 3) {
      log(`⚠️ [CLAUDE] WARNING: Validation failed!`);
      log(`   - Word match: ${matchingWords}/15`);
      log(`   - Exact phrase (50 chars): ${hasExactPhrase50}`);
      log(`   - Phrase match: ${matchingPhrases}/${keyPhrases.length}`);
      log(`   This may indicate the ingredient list was hallucinated or reformatted`);
      log(`   Extracted: ${extractedData.ingredientsText.substring(0, 300)}`);
      log(`   HTML snippet sent (first 1000 chars): ${htmlSnippet.substring(0, 1000)}...`);

      // Reject the result if validation is too poor
      if (matchingWords < 3 || (!hasExactPhrase50 && matchingPhrases < 2)) {
        log(`❌ [CLAUDE] REJECTING result due to poor validation`);
        return null;
      }
    } else {
      log(`✅ [CLAUDE] Validation passed: ${matchingWords} key words and exact phrases found in HTML`);
    }

    // Extract diets from dietary_compliance
    const dietaryCompliance = extractedData.dietary_compliance || {};
    const diets: string[] = [];

    if (dietaryCompliance) {
      Object.entries(dietaryCompliance).forEach(([diet, data]: [string, any]) => {
        if (data && (data.is_compliant === true || data.isCompliant === true)) {
          diets.push(diet);
        }
      });
    }

    return {
      ingredientsText: extractedData.ingredientsText.trim(),
      explicitAllergenStatement: extractedData.explicitAllergenStatement || '',
      crossContaminationWarnings: extractedData.crossContaminationWarnings || '',
      allergens: Array.isArray(extractedData.allergens) ? extractedData.allergens : [],
      dietary_compliance: dietaryCompliance,
      diets: diets
    };

  } catch (error) {
    log(`❌ [CLAUDE] Error: ${(error as any).message}`);
    return null;
  }
}

// Extract allergen information directly from HTML
async function extractAllergenInfoFromHtml(url: string, html: string, addLog?: (msg: string) => void): Promise<{
  explicitAllergenStatement: string;
  crossContaminationWarnings: string;
}> {
  const log = addLog || console.log;
  let explicitAllergenStatement = '';
  let crossContaminationWarnings = '';

  try {
    // Look for explicit allergen statements
    const allergenPatterns = [
      /contains[:\s]+([^<\.]+?)(?:\.|<\/|allergen)/i,
      /allergen[^<]*contains[:\s]+([^<\.]+?)(?:\.|<\/)/i,
      /allergen[:\s]+([^<\.]+?)(?:\.|<\/|contains)/i,
      /contains[:\s]+allergen[^<]*:?\s*([^<\.]+?)(?:\.|<\/)/i,
    ];

    for (const pattern of allergenPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const statement = match[1].trim()
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (statement.length > 5 && statement.length < 500) {
          explicitAllergenStatement = statement;
          log(`   📋 Found explicit allergen statement: ${statement.substring(0, 100)}...`);
          break;
        }
      }
    }

    // Look for cross-contamination warnings
    const crossContaminationPatterns = [
      /may\s+contain[:\s]+([^<\.]+?)(?:\.|<\/)/i,
      /processed\s+in\s+a\s+facility[^<]+([^<\.]+?)(?:\.|<\/)/i,
      /manufactured\s+on\s+equipment[^<]+([^<\.]+?)(?:\.|<\/)/i,
      /may\s+contain\s+traces[^<]+([^<\.]+?)(?:\.|<\/)/i,
    ];

    for (const pattern of crossContaminationPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const warning = match[1].trim()
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (warning.length > 5 && warning.length < 500) {
          crossContaminationWarnings = warning;
          log(`   ⚠️  Found cross-contamination warning: ${warning.substring(0, 100)}...`);
          break;
        }
      }
    }
  } catch (error) {
    log(`   ⚠️  Error extracting allergen info: ${(error as any).message}`);
  }

  return { explicitAllergenStatement, crossContaminationWarnings };
}

// Try direct HTML scraping using Claude Sonnet 4.5 with validation
async function tryDirectScrapingForRetailer(
  url: string,
  retailerInfo: { domain: string; name: string },
  productName: string,
  brand: string,
  addLog?: (msg: string) => void
): Promise<Source | null> {
  const log = addLog || console.log;

  log(`🔍 [EXTRACTION] Processing ${retailerInfo.name}...`);
  log(`   Step 1: Fetching HTML from ${url}...`);

  try {
    // STEP 1: Fetch HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      log(`❌ Step 1 failed: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    log(`✅ Step 1 complete: Fetched ${html.length} characters of HTML`);

    // STEP 2: Try regex extraction first (for validation/comparison)
    log(`   Step 2: Attempting regex-based extraction (for validation)...`);
    const regexIngredients = await scrapeIngredientsFromHtml(url, log);

    // STEP 3: Use Claude to extract from HTML
    log(`   Step 3: Using Claude Sonnet 4.5 to extract ingredients from HTML...`);
    const claudeResult = await extractIngredientsWithClaude(url, html, productName, brand, log);

    if (!claudeResult) {
      log(`❌ Step 3 failed: Claude extraction returned null`);
      // Fallback to regex if Claude fails
      if (regexIngredients && regexIngredients.trim().length > 30) {
        log(`⚠️ Falling back to regex extraction`);
        const allergenInfo = await extractAllergenInfoFromHtml(url, html, log);
        const ingredientText = regexIngredients.toLowerCase();
        const allergens: string[] = [];

        if (ingredientText.includes('milk') || ingredientText.includes('whey') || ingredientText.includes('casein') || ingredientText.includes('lactose')) allergens.push('milk');
        if (ingredientText.includes('egg') || ingredientText.includes('albumin')) allergens.push('eggs');
        if (ingredientText.match(/\bfish\b/) || ingredientText.includes('anchovy')) allergens.push('fish');
        if (ingredientText.match(/\bshrimp\b/) || ingredientText.includes('crab') || ingredientText.includes('lobster') || ingredientText.includes('clam')) allergens.push('shellfish');
        if (ingredientText.includes('almond') || ingredientText.includes('cashew') || ingredientText.includes('walnut') || ingredientText.includes('pecan') || ingredientText.includes('pistachio')) allergens.push('tree nuts');
        if (ingredientText.includes('peanut')) allergens.push('peanuts');
        if (ingredientText.includes('wheat') && ingredientText.includes('flour')) allergens.push('wheat');
        if (ingredientText.includes('soy')) allergens.push('soybeans');
        if (ingredientText.includes('sesame')) allergens.push('sesame');

        return {
          name: retailerInfo.name,
          url: url,
          productTitle: `${brand} ${productName}`,
          ingredientsText: regexIngredients.trim(),
          explicitAllergenStatement: allergenInfo.explicitAllergenStatement,
          explicitDietaryLabels: '',
          crossContaminationWarnings: allergenInfo.crossContaminationWarnings,
          allergens: filterApprovedAllergens(allergens),
          diets: [],
          confidence: 85, // Lower confidence for regex-only
          dataAvailable: true
        };
      }
      return null;
    }

    log(`✅ Step 3 complete: Claude extracted ingredients (${claudeResult.ingredientsText.length} chars)`);

    // STEP 4: Validation - Compare Claude extraction with regex (if both succeeded)
    if (regexIngredients && regexIngredients.trim().length > 30) {
      log(`   Step 4: Validating Claude extraction against regex extraction...`);

      // Normalize both for comparison
      const claudeNorm = claudeResult.ingredientsText.toLowerCase().replace(/\s+/g, ' ').trim();
      const regexNorm = regexIngredients.toLowerCase().replace(/\s+/g, ' ').trim();

      // Check similarity (simple character-based comparison)
      const minLength = Math.min(claudeNorm.length, regexNorm.length);
      const maxLength = Math.max(claudeNorm.length, regexNorm.length);
      let matchingChars = 0;
      for (let i = 0; i < minLength; i++) {
        if (claudeNorm[i] === regexNorm[i]) matchingChars++;
      }
      const similarity = matchingChars / maxLength;

      log(`   Similarity score: ${(similarity * 100).toFixed(1)}%`);

      if (similarity < 0.7) {
        log(`⚠️ WARNING: Significant discrepancy between Claude and regex extraction!`);
        log(`   Claude: ${claudeResult.ingredientsText.substring(0, 200)}...`);
        log(`   Regex:  ${regexIngredients.substring(0, 200)}...`);
        log(`   This may indicate hallucination - using Claude result but with lower confidence`);
      } else {
        log(`✅ Validation passed: Claude and regex extractions match closely`);
      }
    }

    // STEP 5: Final validation - verify key ingredients appear in HTML
    log(`   Step 5: Final validation - checking ingredients appear in HTML...`);
    const htmlLower = html.toLowerCase();
    const extractedLower = claudeResult.ingredientsText.toLowerCase();
    const keyWords = claudeResult.ingredientsText.split(/[,\s\(\)]+/)
      .filter(w => w.length > 4)
      .slice(0, 5);

    let verifiedWords = 0;
    for (const word of keyWords) {
      if (htmlLower.includes(word.toLowerCase())) {
        verifiedWords++;
      }
    }

    if (verifiedWords < 3) {
      log(`⚠️ WARNING: Only ${verifiedWords}/5 key words found in HTML - possible hallucination`);
    } else {
      log(`✅ Final validation passed: ${verifiedWords}/5 key words verified in HTML`);
    }

    log(`✅ [EXTRACTION] Successfully extracted from ${retailerInfo.name}`);
    log(`   Final ingredients: ${claudeResult.ingredientsText.substring(0, 150)}...`);

    return {
      name: retailerInfo.name,
      url: url,
      productTitle: `${brand} ${productName}`,
      ingredientsText: claudeResult.ingredientsText.trim(),
      explicitAllergenStatement: claudeResult.explicitAllergenStatement || '',
      explicitDietaryLabels: '',
      crossContaminationWarnings: claudeResult.crossContaminationWarnings || '',
      allergens: filterApprovedAllergens(claudeResult.allergens || []),
      diets: [],
      dietary_compliance: claudeResult.dietary_compliance || {},
      confidence: verifiedWords >= 3 ? 95 : 85, // Higher confidence if validated
      dataAvailable: true
    };

  } catch (error) {
    log(`❌ [EXTRACTION] Error: ${(error as any).message}`);
    log(`   Stack: ${(error as any).stack}`);
    return null;
  }
}

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
  // DRASTICALLY increased thresholds to prevent false positives
  // Short lists must be almost identical (0.90)
  // Long lists must be very similar (0.85)
  const threshold = isShortList ? 0.90 : 0.85;

  // Additional check: if lists are very different in length (e.g. one is >2x the other), they likely don't match
  // unless the shorter one is a subset of the longer one (which simple word overlap captures, but let's be safe)
  if (words1.length > words2.length * 2 || words2.length > words1.length * 2) {
    // If length discrepancy is huge, require even higher similarity (effectively requiring the shorter to be fully contained)
    // But wait, similarity = common / max_length. So if lengths are 10 and 30, max is 30.
    // If all 10 match, common=10. 10/30 = 0.33. This will ALREADY fail the 0.85 threshold.
    // So the standard similarity metric handles length discrepancy well.
    // The issue might be that "Chicken stock" (2 words) and "Chicken broth" (2 words) have 1 common word -> 0.5 similarity.
    // "Chicken stock, salt" (3 words) vs "Chicken stock" (2 words) -> 2 common, max 3 -> 0.66.
    // With 0.90 threshold, "Chicken stock, salt" vs "Chicken stock" will FAIL (0.66 < 0.90).
    // This is GOOD. We want to flag that "salt" is missing.
  }

  console.log(`Matching: "${text1.substring(0, 50)}..." vs "${text2.substring(0, 50)}..."`);
  console.log(`  Words: ${words1.length} vs ${words2.length}, Common: ${commonWords}, Similarity: ${(similarity * 100).toFixed(1)}%, Threshold: ${(threshold * 100)}%, Match: ${similarity >= threshold}`);

  return similarity >= threshold;
}

// Analyze source agreement using AI to handle wording variations
async function analyzeSourceAgreement(
  sources: Source[],
  addLog: (msg: string) => void
): Promise<{ groups: Source[][], largestGroup: Source[] }> {
  if (sources.length === 0) {
    return { groups: [], largestGroup: [] };
  }

  // Filter out invalid sources
  const validSources = sources.filter(s => s && s.ingredientsText && s.name);
  if (validSources.length === 0) {
    addLog('   ⚠️ No valid sources to analyze');
    return { groups: [], largestGroup: [] };
  }

  // First, do simple text matching to group obviously matching sources
  const groups: Source[][] = [];

  for (const source of validSources) {
    let foundGroup = false;
    for (const group of groups) {
      if (group[0] && group[0].ingredientsText && source.ingredientsText) {
        if (ingredientsMatch(source.ingredientsText, group[0].ingredientsText)) {
          group.push(source);
          foundGroup = true;
          break;
        }
      }
    }
    if (!foundGroup) {
      groups.push([source]);
    }
  }

  addLog(`   Initial grouping: ${groups.length} group(s) found`);

  // Always validate with AI to catch cases where similar wording hides missing ingredients
  addLog(`   🤖 Using AI to validate if groups are actually the same formulation...`);

  const largestGroup = groups.sort((a, b) => b.length - a.length)[0];
  if (!largestGroup || largestGroup.length === 0 || !largestGroup[0]) {
    addLog('   ⚠️ No valid largest group found');
    return { groups: [], largestGroup: [] };
  }

  const referenceSource = largestGroup[0];
  if (!referenceSource || !referenceSource.ingredientsText) {
    addLog('   ⚠️ Invalid reference source');
    return { groups: [], largestGroup: [] };
  }

  // Check sources not in the largest group
  const sourcesToAnalyze = groups.filter(g => g !== largestGroup).flatMap(g => g).filter(s => s && s.ingredientsText);

  // ALSO validate sources WITHIN the largest group if it has multiple sources
  // This catches cases where all sources were grouped together but shouldn't have been
  const sourcesInLargestGroup = largestGroup.length > 1
    ? largestGroup.slice(1).filter(s => s && s.ingredientsText)
    : [];

  // Combine sources to analyze
  const allSourcesToAnalyze = [...sourcesToAnalyze, ...sourcesInLargestGroup];

  // If all sources were in one group, they passed simple matching
  const allSourcesInLargestGroup = largestGroup.length === validSources.length && sourcesToAnalyze.length === 0;

  // Check if sources are nearly identical (simple text match might be too lenient)
  const areSourcesIdentical = allSourcesInLargestGroup && sourcesInLargestGroup.every(s => {
    return s.ingredientsText === referenceSource.ingredientsText ||
      (s.ingredientsText.length === referenceSource.ingredientsText.length && s.ingredientsText === referenceSource.ingredientsText);
  });

  // Always run AI validation unless sources are literally identical
  // This fixes the issue where "No discrepancies" was reported for different ingredient lists
  if (allSourcesToAnalyze.length > 0 && !areSourcesIdentical) {
    const aiAnalysis = await analyzeIngredientVariations(
      allSourcesToAnalyze,
      referenceSource,
      addLog
    );

    // If all sources were in the largest group but AI found differences, split them
    if (sourcesInLargestGroup.length > 0 && aiAnalysis.matchingSources.length < allSourcesToAnalyze.length) {
      addLog(`   ⚠️ AI found differences within the grouped sources - splitting groups`);
    }

    // Rebuild the largest group based on AI analysis results
    // Start with just the reference source
    const validatedLargestGroup: Source[] = [referenceSource];
    const aiMatchedUrls = new Set(aiAnalysis.matchingSources.map(s => s.url).filter(url => url));

    // Add all sources that AI confirmed match (including those originally in largest group)
    for (const source of validSources) {
      if (source && source.url && aiMatchedUrls.has(source.url) && !validatedLargestGroup.includes(source)) {
        validatedLargestGroup.push(source);
        addLog(`      ✅ AI confirmed: ${source.name}`);
      }
    }

    // Track sources that were analyzed but not matched by AI
    const unmatchedSources = allSourcesToAnalyze.filter(s => !aiMatchedUrls.has(s.url));
    for (const source of unmatchedSources) {
      addLog(`      ❌ AI determined ${source.name} is different formulation`);
    }

    // Update largestGroup to only include validated sources
    largestGroup.length = 0;
    largestGroup.push(...validatedLargestGroup);
  }

  // Rebuild groups after AI analysis
  const finalGroups: Source[][] = [largestGroup];
  const usedSources = new Set(largestGroup.map(s => s && s.url ? s.url : '').filter(url => url));

  for (const source of validSources) {
    if (source && source.url && !usedSources.has(source.url)) {
      finalGroups.push([source]);
    }
  }

  return { groups: finalGroups, largestGroup };
}

// AI-powered ingredient analysis to determine if differences are just wording variations
async function analyzeIngredientVariations(
  sources: Source[],
  referenceSource: Source,
  addLog: (msg: string) => void
): Promise<{ matchingSources: Source[], differences: string[] }> {
  // Validate inputs
  if (!referenceSource || !referenceSource.ingredientsText) {
    addLog('   ⚠️ Invalid reference source provided');
    return { matchingSources: [], differences: [] };
  }

  const validSources = sources.filter(s => s && s.ingredientsText && s.name);
  const nonMatchingSources = validSources.filter(s =>
    s !== referenceSource && s.ingredientsText && referenceSource.ingredientsText &&
    !ingredientsMatch(s.ingredientsText, referenceSource.ingredientsText)
  );

  if (nonMatchingSources.length === 0) {
    return { matchingSources: [], differences: [] };
  }

  const referenceName = referenceSource.name || 'Reference Source';
  const referenceIngredients = referenceSource.ingredientsText || '';

  const prompt = `You are analyzing ingredient lists from multiple sources for the same product to determine if they represent:
A) The SAME formulation with different wording or different levels of detail
B) DIFFERENT formulations (actually different products or variants)

Reference ingredient list:
${referenceName}: "${referenceIngredients}"

Sources to compare:
${nonMatchingSources.map((s, i) => `Source ${i + 1} (${s.name || 'Unknown'}): "${s.ingredientsText || ''}"`).join('\n\n')}

For each source, determine:
1. Are these the SAME formulation? (YES/NO)
2. What are the key differences you found?

IMPORTANT GUIDELINES:

**SAME Formulation (Answer YES):**
- "Water, carrots, celery" vs "Water, carrot juice concentrate, celery juice concentrate" = SAME (different processing, same ingredients)
- "Elote Seasoning (corn, salt, sugar)" vs "Elote Seasoning (corn maltodextrin, salt, cane sugar, peppers, paprika)" = SAME (more detailed breakdown of the same blend)
- One source shows "Seasoning Blend" and another expands what's IN that blend = SAME (just more detail)
- Minor ingredient order differences if the core ingredients are identical = SAME
- Ignore: asterisks, organic labels, capitalization, "and/or" variations, punctuation (periods, commas)
- ALL CAPS vs Title Case vs lowercase = SAME if ingredients are the same
- Trailing periods or commas = SAME
- **"WATER, ORGANIC CARROT JUICE CONCENTRATE"** vs **"Water, Organic Carrot Juice Concentrate."** = SAME (identical ingredients, different formatting)

**DIFFERENT Formulation (Answer NO):**
- One list has "apple cider vinegar" and another completely omits it = DIFFERENT (missing ingredient)
- One list has "citric acid" and another completely omits it = DIFFERENT (missing ingredient)
- "Whole grain oats" vs "Whole grain oats + chicory root extract" = DIFFERENT (added functional ingredient)
- "Regular" vs "High Fiber" or "Reduced Sugar" variants = DIFFERENT
- Core ingredients fundamentally different (e.g., wheat flour vs rice flour) = DIFFERENT
- One has dairy/eggs and the other doesn't = DIFFERENT
- Presence/absence of ANY actual ingredient (not just color additives) = DIFFERENT

**The Key Question:** If someone with allergies ate this product, would both ingredient lists describe the SAME product they're eating, just with different levels of detail?

**CRITICAL:** Any ingredient that appears in one list but is completely absent from another list indicates a DIFFERENT formulation. Missing ingredients matter more than word variations.

Return JSON:
{
  "analyses": [
    {
      "sourceIndex": 0,
      "sourceName": "name",
      "sameFormulation": true/false,
      "differences": "Brief description of key differences found",
      "reasoning": "Why you determined they are same/different"
    }
  ]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 0,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      addLog('   ⚠️ AI analysis failed, using simple matching only');
      return { matchingSources: [], differences: [] };
    }

    const data = await response.json();
    const content = data.content[0].text;

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*"analyses"[\s\S]*\}/);
    if (!jsonMatch) {
      addLog('   ⚠️ Could not parse AI response, using simple matching only');
      return { matchingSources: [], differences: [] };
    }

    const analysis = JSON.parse(jsonMatch[0]);
    const matchingSources: Source[] = [];
    const allDifferences: string[] = [];

    if (!analysis.analyses || !Array.isArray(analysis.analyses)) {
      addLog('   ⚠️ Invalid analysis format from AI');
      return { matchingSources: [], differences: [] };
    }

    for (const result of analysis.analyses) {
      if (!result || typeof result.sourceIndex !== 'number' || result.sourceIndex < 0 || result.sourceIndex >= nonMatchingSources.length) {
        addLog(`   ⚠️ Invalid source index in analysis: ${result?.sourceIndex}`);
        continue;
      }

      const source = nonMatchingSources[result.sourceIndex];
      if (!source || !source.name) {
        addLog(`   ⚠️ Invalid source at index ${result.sourceIndex}`);
        continue;
      }

      if (result.sameFormulation) {
        matchingSources.push(source);
        const sourceName = result.sourceName || source.name || 'Unknown';
        addLog(`   ✅ ${sourceName} - Same formulation (different wording)`);
        if (result.differences) {
          addLog(`      Differences noted: ${result.differences}`);
          allDifferences.push(`${sourceName}: ${result.differences}`);
        }
      } else {
        const sourceName = result.sourceName || source.name || 'Unknown';
        addLog(`   ❌ ${sourceName} - Different formulation`);
        if (result.reasoning) {
          addLog(`      ${result.reasoning}`);
        }
      }
    }

    return { matchingSources, differences: allDifferences };

  } catch (error) {
    console.error('Error in AI ingredient analysis:', error);
    addLog(`   ⚠️ AI analysis error: ${error.message}`);
    return { matchingSources: [], differences: [] };
  }
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
// MODIFIED: Only uses Perplexity for URL discovery, never for ingredient extraction
async function searchSingleRetailerClaude(
  retailerName: string,
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<Source | null> {
  console.log(`🔍 [CLAUDE] Finding ${retailerName} product page URL for ${brand} ${productName}`);

  if (!ANTHROPIC_API_KEY) {
    console.log(`Anthropic API key not available for ${retailerName}`);
    return null;
  }

  // MODIFIED: Only ask for URL, NOT ingredient extraction
  const searchPrompt = `Find the product page URL for this product on ${retailerName}:

Product: ${brand} ${productName}
Barcode: ${barcode}
Retailer: ${retailerName}

Search for: ${searchQuery}

🚨 IMPORTANT: You are ONLY being asked to find the product page URL.
Do NOT extract ingredient information - that will be scraped directly from the HTML.
Just return the URL where this product can be found on ${retailerName}.

Return JSON:
{
  "url": "https://www.${retailerName.toLowerCase()}.com/p/exact-product-url",
  "productTitle": "Product title from the page"
}

CRITICAL: The URL must be a SPECIFIC product page, NOT a search page or homepage.

If you cannot find this product on ${retailerName}, return: {"found": false}`;

  try {
    console.log(`📡 [CLAUDE] Making API call to Claude for ${retailerName}...`);

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 4000,
        temperature: 0.2,
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

    console.log(`📥 [CLAUDE] ${retailerName} API response status: ${claudeResponse.status}`);

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.log(`❌ [CLAUDE] ${retailerName} search failed:`, claudeResponse.status, errorText);

      // Try a more capable model if we used Haiku
      if (model === 'claude-haiku-4-5-20251001' || model === 'claude-3-5-haiku-latest') {
        console.log(`Trying more capable model: claude-sonnet-4-5-20250929`);
        return await searchSingleRetailerClaude(retailerName, searchQuery, productName, brand, barcode, 'claude-sonnet-4-5-20250929');
      }
      return null;
    }

    const claudeResult = await claudeResponse.json();

    // Extract text response from Claude
    let responseText = '';
    for (const block of claudeResult.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

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

    if (searchData.found === false || !searchData.url || searchData.url.trim().length < 10) {
      console.log(`✗ ${retailerName}: Product not found or no URL returned`);
      return null;
    }

    // Reject search URLs - we only want actual product pages
    const url = searchData.url || '';
    const isSearchUrl = url.includes('/s?') || url.includes('/search?') || url.includes('searchTerm=') || url.includes('/search/');
    if (isSearchUrl) {
      console.log(`✗ ${retailerName}: Rejected - URL is a search page, not a product page: ${url}`);
      return null;
    }

    console.log(`✓ ${retailerName}: Found product page URL: ${url}`);

    // ALWAYS scrape directly from HTML - never use LLM for ingredient extraction
    const retailerInfo = isKnownRetailer(url) || { domain: new URL(url).hostname, name: retailerName };

    try {
      console.log(`🔍 [${retailerName}] Scraping ingredients directly from HTML (no LLM extraction)...`);
      const directScrapedSource = await tryDirectScrapingForRetailer(url, retailerInfo, productName, brand);

      if (directScrapedSource && directScrapedSource.ingredientsText.trim().length > 30) {
        console.log(`✅ [${retailerName}] Successfully scraped ingredients (${directScrapedSource.ingredientsText.length} chars)`);
        console.log(`📝 [${retailerName}] Using DIRECT SCRAPED ingredients only (no LLM hallucination)`);

        return {
          name: retailerName,
          url: url,
          productTitle: searchData.productTitle || `${brand} ${productName}`,
          ingredientsText: directScrapedSource.ingredientsText.trim(),
          explicitAllergenStatement: directScrapedSource.explicitAllergenStatement || '',
          explicitDietaryLabels: directScrapedSource.explicitDietaryLabels || '',
          crossContaminationWarnings: directScrapedSource.crossContaminationWarnings || '',
          allergens: directScrapedSource.allergens || [],
          diets: directScrapedSource.diets || [],
          confidence: 95, // High confidence for direct scraping
          dataAvailable: true
        };
      } else {
        console.log(`⚠️ [${retailerName}] Direct scraping failed - no ingredients extracted`);
        return null; // Don't return source if we can't scrape ingredients directly
      }
    } catch (scrapeError) {
      console.log(`❌ [${retailerName}] Scraping error: ${(scrapeError as any).message}`);
      return null; // Don't return source if scraping fails
    }
  } catch (error) {
    console.log(`${retailerName} search error:`, error.message);
    return null;
  }
}

// Parallel search function using Claude AI (makes multiple targeted calls)
async function searchSourceTypeClaudeParallel(
  sourceType: string,
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string,
  addLog?: (msg: string) => void
): Promise<Source[]> {
  const log = addLog || console.log;
  log(`🔍 Starting ${sourceType} search with Claude...`);

  // If the caller asked for general web search, use the general web search function
  if (sourceType.toLowerCase().includes('general web')) {
    return searchGeneralWebClaude(searchQuery, productName, brand, barcode);
  }

  // Otherwise treat sourceType as a list of retailers
  const retailers = sourceType.split(/\s+/).filter(r => r.length > 2);
  console.log(`Targeting retailers: ${retailers.join(', ')}`);

  const searchPromises = retailers.slice(0, 3).map(async (retailer) => {
    return searchSingleRetailerClaude(retailer, searchQuery, productName, brand, barcode);
  });

  const results = await Promise.all(searchPromises);
  const sources = results.filter(s => s !== null) as Source[];

  console.log(`${sourceType} Claude search complete: ${sources.length} sources found from individual retailer searches`);
  return sources;
}

// Legacy function name - redirects to Claude
async function searchSourceTypePerplexity(
  sourceType: string,
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string,
  addLog?: (msg: string) => void
): Promise<Source[]> {
  return searchSourceTypeClaudeParallel(sourceType, searchQuery, productName, brand, barcode, addLog);
}

// Alternative: Try to get multiple sources in one call (backup method) - Redirects to Claude
async function searchSourceTypePerplexityBulk(
  sourceType: string,
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string
): Promise<Source[]> {
  // Redirect to Claude version
  return searchSourceTypeClaude(sourceType, searchQuery, productName, brand, barcode);
}

// Legacy bulk Perplexity function (deprecated)
async function searchSourceTypePerplexityBulk_OLD(
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
   - "Vegan", "Vegetarian", "Pescatarian", "Gluten-free"
   - "Plant-Based", "Dairy-Free", "Egg-Free"
   - Any certification badges or labels
4. Look for cross-contamination warnings (ONLY actual allergen warnings):
   - "May contain..." (allergen-specific, e.g., "May contain tree nuts")
   - "Processed in a facility that also processes..." (allergen-specific)
   - ❌ DO NOT include generic retailer disclaimers like:
     * "Actual product packaging may contain additional information"
     * "Product information provided by manufacturer"
     * "We recommend that you do not rely solely on..."
     * These are legal disclaimers, NOT product warnings
5. ANALYZE INGREDIENTS for allergens (TOP 9 FDA ALLERGENS ONLY):
   - "milk": milk, butter, cheese, whey, casein, lactose, cream, yogurt
   - "eggs": egg, albumin, mayonnaise, meringue
   - "fish": fish, anchovy, cod, salmon, tuna, bass
   - "shellfish": shrimp, crab, lobster, clam, oyster, mussel
   - "tree nuts": almonds, cashews, walnuts, pecans, pistachios, hazelnuts, macadamia
   - "peanuts": peanut, peanut butter, peanut oil
   - "wheat": wheat, wheat flour (NOT barley, rye, OR OATS - oats is NOT an allergen)
   - "soybeans": soy, soybean, soy lecithin, tofu, edamame
   - "sesame": sesame, tahini, sesame oil

   ❌ DO NOT INCLUDE: oats, barley, rye, corn, rice, or any ingredient NOT listed above
   ❌ CRITICAL: "oats" is NOT an allergen - NEVER include it in allergens array
   ✅ IMPORTANT: Use exact allergen names above (e.g., "tree nuts" not "almonds", "soybeans" not "soy")
6. DETERMINE DIETARY COMPATIBILITY (use logical rules):
   - Vegan: NO animal products (no meat, fish, dairy, eggs, honey, gelatin, whey)
     → If vegan → return ["vegan", "vegetarian", "pescatarian", "gluten-free"]
   - Vegetarian: NO meat or fish (may have dairy/eggs)
     → If vegetarian (not vegan) → return ["vegetarian", "pescatarian", "gluten-free"]
   - Pescatarian: NO meat (may have fish, dairy, eggs)
     → If pescatarian only → return ["pescatarian", "gluten-free"] (only if no gluten ingredients)
   - Gluten-free: ONLY if there are NO wheat, barley, rye, malt, breadcrumbs, batter, or other gluten sources. Oats alone are acceptable unless wheat is mentioned.
     → If gluten-free but not vegetarian/vegan, include ["gluten-free"] alongside any applicable diet labels
   - If contains meat/poultry → return [] unless it can still be pescatarian (fish-only)

   IMPORTANT: Check carefully:
   - If has milk/cheese/whey/butter → NOT vegan (but may be vegetarian)
   - If has eggs → NOT vegan (but may be vegetarian)
   - If has fish → NOT vegan/vegetarian (but may be pescatarian)
   - If has meat/chicken/beef/pork → return []
   
   VEGAN DETECTION - Be proactive when ingredients are clearly plant-based:
   - If ingredient list contains ONLY: oats, grains, seeds, nuts, fruits, vegetables, sugars, salts, plant-based oils, natural flavors (without animal-derived qualifiers), spices, extracts → LIKELY VEGAN
   - "Natural flavor" alone (without "contains milk/eggs/etc") in a plant-based product is typically vegan
   - Only exclude from vegan if you have POSITIVE evidence of animal products (milk, eggs, meat, fish, honey, gelatin)
   - When in doubt with "natural flavor" but all other ingredients are clearly plant-based, INCLUDE vegan
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

// General Web search with Perplexity - Simplified approach: let Perplexity search and verify
async function searchGeneralWebPerplexity(
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string,
  addLog?: (msg: string) => void
): Promise<Source[]> {
  // Redirect to Claude version
  return searchGeneralWebClaude(searchQuery, productName, brand, barcode);
}

async function searchGeneralWebPerplexity_OLD(
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string,
  addLog?: (msg: string) => void
): Promise<Source[]> {
  const log = addLog || console.log;
  log(`🔎 Searching web for: ${brand} ${productName}`);

  try {
    const searchPrompt = `Search the web to find ingredient information for this product from exactly 3 independent sources.

Product: ${brand} ${productName}
Barcode/UPC: ${barcode}

CRITICAL REQUIREMENTS:

1. **FIND EXACTLY 3 INDEPENDENT SOURCES**
   - Search different websites (retailers, brand sites, databases)
   - Each source must be from a DIFFERENT website
   - Return exactly 3 sources (not more, not less)
   - Use your judgment to find the best sources

2. **WORKING URLs**
   - Each URL must link directly to the page where you found the ingredient information
   - URLs must be specific product pages, not homepages or search pages
   - Test that URLs are accessible and point to the exact ingredient list

3. **INGREDIENT VERIFICATION**
   - All sources must have THE SAME ingredients
   - Compare ingredient lists across all sources
   - If ingredients don't match, search for more sources until you find at least 3 with matching ingredients
   - Only include sources where the ingredient lists are consistent

4. **EXTRACT INGREDIENTS VERBATIM**
   - Copy the ingredient list EXACTLY as written on each website
   - Include everything: punctuation, capitalization, parenthetical information
   - Do NOT summarize, abbreviate, or paraphrase
   - For beverages like beer, short lists are fine (e.g., "Water, Barley, Hops, Yeast")

5. **ALLERGEN & DIETARY ANALYSIS**
   - Detect allergens from ingredients: milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame
   - Determine dietary compatibility: vegan, vegetarian, pescatarian

You MUST return ONLY valid JSON in this exact format (no markdown, no explanations, just JSON):

{
  "sources": [
    {
      "name": "Website name",
      "url": "https://exact-product-page-url.com",
      "productTitle": "Product title",
      "ingredientsText": "Complete ingredient list exactly as shown",
      "explicitAllergenStatement": "",
      "explicitDietaryLabels": "",
      "crossContaminationWarnings": "",
      "allergens": [],
      "diets": [],
      "confidence": 95
    }
  ]
}

CRITICAL: Return ONLY the JSON object above, nothing else. No markdown formatting, no code blocks, no explanations. Just the raw JSON.

Return exactly 3 sources if possible. If you cannot find 3 sources with matching ingredients, return as many as you found (minimum 1). Never return an empty sources array unless the product truly doesn't exist.

⚠️ CRITICAL VALIDATION FOR EACH SOURCE:
Before including a source in your response, verify:
1. The ingredient list you extracted matches EXACTLY what is written on that specific URL
2. You have not added any ingredients that don't appear on the page (e.g., don't add "Onion Powder, Garlic Powder" if they're not there)
3. You have not removed any ingredients that do appear on the page (e.g., don't remove "Sunflower Oil, Corn Powder, Natural Smoke Flavor" if they are there)
4. The ingredient order matches the order on the webpage
5. All sub-ingredients in parentheses are included exactly as shown

If you are uncertain about the exact ingredient list, DO NOT guess or infer. Only include sources where you can see the exact ingredient list on the page.`;

    log(`📡 Calling Perplexity to find product page URLs (URL discovery only - no ingredient extraction)...`);

    // MODIFIED: Use Perplexity ONLY for URL discovery, NOT for ingredient extraction
    // This prevents hallucination - we will scrape ingredients directly from HTML
    const urlDiscoveryPrompt = `Find product pages for this food product on multiple retailer websites:

Product: ${brand} ${productName}
Barcode: ${barcode}

IMPORTANT: You are ONLY being asked to find URLs. Do NOT extract or guess ingredient lists.
Return ONLY the product page URLs where this product can be found.

Return JSON with URLs only:
{
  "urls": [
    {
      "name": "Kroger",
      "url": "https://www.kroger.com/p/product-name/..."
    },
    {
      "name": "Target", 
      "url": "https://www.target.com/p/product-name/-/A-..."
    },
    {
      "name": "Amazon",
      "url": "https://www.amazon.com/dp/..."
    }
  ]
}

Find 3-5 different retailer URLs. Only return URLs that point to specific product pages, NOT search pages.`;

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
            content: 'You are a web search assistant. Find product page URLs only. Do NOT extract ingredient information - that will be done by scraping the URLs directly.'
          },
          {
            role: 'user',
            content: urlDiscoveryPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000,
        return_citations: true
      }),
    });

    if (!perplexityResponse.ok) {
      const errorText = await perplexityResponse.text();
      log(`❌ Perplexity API error: ${perplexityResponse.status}`);
      log(`   Details: ${errorText}`);
      return [];
    }

    const perplexityResult = await perplexityResponse.json();
    const responseText = perplexityResult.choices?.[0]?.message?.content || '';

    log(`📨 Response received (${responseText.length} chars)`);
    log(`   First 1000 chars: ${responseText.substring(0, 1000)}`);

    if (perplexityResult.citations && perplexityResult.citations.length > 0) {
      log(`📚 Citations: ${perplexityResult.citations.length} found`);
      perplexityResult.citations.forEach((cite: string, i: number) => {
        log(`   ${i + 1}. ${cite}`);
      });
    }

    // Try multiple strategies to extract JSON
    let searchData = null;

    // Strategy 1: Look for JSON object with "sources" key
    let jsonMatch = responseText.match(/\{[\s\S]*"sources"[\s\S]*\}/);

    // Strategy 2: Look for any JSON object
    if (!jsonMatch) {
      jsonMatch = responseText.match(/\{[\s\S]{20,}\}/);
      log(`⚠️  No "sources" key found, trying to parse any JSON object...`);
    }

    // Strategy 3: Look for code blocks with JSON
    if (!jsonMatch) {
      const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (codeBlockMatch) {
        jsonMatch = codeBlockMatch;
        log(`⚠️  Found JSON in code block`);
      }
    }

    if (!jsonMatch) {
      log(`❌ No JSON found in response`);
      log(`   Full response: ${responseText}`);
      log(`   This might mean Perplexity couldn't find sources for this product`);
      return [];
    }

    try {
      searchData = JSON.parse(jsonMatch[0] || jsonMatch[1] || '{}');
      log(`✅ Parsed JSON successfully`);

      // Check if it has urls array (new format) or sources array (old format)
      let urls: Array<{ name: string, url: string }> = [];
      if (searchData.urls && Array.isArray(searchData.urls)) {
        urls = searchData.urls;
        log(`✅ Found ${urls.length} URLs for direct scraping`);
      } else if (searchData.sources && Array.isArray(searchData.sources)) {
        // Fallback: extract URLs from old format
        urls = searchData.sources
          .filter((s: any) => s.url && s.url.length > 10)
          .map((s: any) => ({ name: s.name || new URL(s.url).hostname, url: s.url }));
        log(`✅ Extracted ${urls.length} URLs from sources array`);
      } else {
        log(`❌ JSON doesn't contain urls or sources array`);
        log(`   JSON structure: ${Object.keys(searchData).join(', ')}`);
        if (searchData.message || searchData.error) {
          log(`   Message: ${searchData.message || searchData.error}`);
        }
        return [];
      }

      log(`✅ Found ${urls.length} URLs for direct scraping`);
    } catch (e) {
      log(`❌ JSON parse error: ${(e as any).message}`);
      log(`   Attempted to parse: ${(jsonMatch[0] || jsonMatch[1] || '').substring(0, 500)}...`);
      return [];
    }

    const sources: Source[] = [];

    // CRITICAL CHANGE: Scrape ingredients directly from HTML for ALL URLs
    // Never trust LLM-extracted ingredients - always scrape directly
    for (const urlData of urls) {
      const url = urlData.url;
      const retailerName = urlData.name || new URL(url).hostname.replace('www.', '');

      if (!url || url.includes('/search') || url.includes('/s?') || url.length < 10) {
        log(`✗ Rejected: ${retailerName} - invalid URL: ${url}`);
        continue;
      }

      log(`✓ Processing: ${retailerName} - ${url.substring(0, 60)}...`);

      // ALWAYS scrape directly - never use LLM-extracted ingredients
      const retailerInfo = isKnownRetailer(url) || { domain: new URL(url).hostname, name: retailerName };

      try {
        log(`   🔍 Scraping ingredients directly from HTML (no LLM extraction)...`);
        const scrapedSource = await tryDirectScrapingForRetailer(url, retailerInfo, productName, brand, log);

        if (scrapedSource && scrapedSource.ingredientsText.trim().length > 30) {
          log(`   ✅ Successfully scraped ingredients (${scrapedSource.ingredientsText.length} chars)`);
          log(`   📝 Using DIRECT SCRAPED ingredients only (no LLM hallucination)`);

          sources.push({
            name: retailerName,
            url: url,
            productTitle: `${brand} ${productName}`,
            ingredientsText: scrapedSource.ingredientsText.trim(),
            explicitAllergenStatement: scrapedSource.explicitAllergenStatement || '',
            explicitDietaryLabels: scrapedSource.explicitDietaryLabels || '',
            crossContaminationWarnings: scrapedSource.crossContaminationWarnings || '',
            allergens: scrapedSource.allergens || [],
            diets: scrapedSource.diets || [],
            confidence: 95, // High confidence for direct scraping
            dataAvailable: true
          });
        } else {
          log(`   ⚠️  Direct scraping failed for ${retailerName} - skipping (no fallback to LLM)`);
        }
      } catch (scrapeError) {
        log(`   ❌ Scraping error for ${retailerName}: ${(scrapeError as any).message} - skipping`);
      }
    }

    log(`✅ Found ${sources.length} valid sources`);
    return sources;
  } catch (e) {
    log(`❌ Error: ${(e as any).message}`);
    console.error('Full error:', e);
    return [];
  }
}

// General Web search with Claude
async function searchGeneralWebClaude(
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<Source[]> {
  console.log(`General Web search with Claude (${model}): ${searchQuery}`);

  const prompt = `Search the web broadly for the EXACT product below and extract ingredient lists from multiple independent pages.

Product: ${brand} ${productName}
Barcode: ${barcode}

🚨 CRITICAL REQUIREMENT: You MUST find and return EXACTLY 5 independent sources with complete ingredient lists. This is MANDATORY.

STRATEGY FOR FINDING 5 SOURCES:
1. Search major retailers: Walmart, Amazon, Target, Kroger, Safeway, Publix, Whole Foods, Stop & Shop, etc.
2. Search grocery delivery services: Instacart, Shipt, FreshDirect, etc.
3. Search manufacturer/brand websites and nutrition databases (MyFoodData, Nutritionix, EWG Food Scores)
4. Use the web search tool MULTIPLE TIMES - you have 5 web search attempts available
5. Make separate searches for different retailer websites if needed
6. Each source MUST be from a DIFFERENT domain (different retailer/website)
7. If you can't find a source with any of the above methods, just do a generic web search for the exact product name and look through all of the site results. Don't stop looking until you find 5 good sources with full ingredient lists. You must not stop searching.

INSTRUCTIONS FOR EACH SOURCE:
- Provide the SPECIFIC product page URL (not a search/homepage)
- Include productTitle from the page
- Copy the ingredient list VERBATIM (character-by-character) - do not paraphrase
- Include explicit allergen statements, dietary labels, and cross-contamination warnings if present
- Reject pages that are not the exact product (different size/flavor/variant)
- Even partial ingredient lists are acceptable - use what you find

⚠️ RESPONSE FORMAT: You may include explanatory text about your search process, but you MUST also include a complete, valid JSON object with all 5 sources. The JSON object can be wrapped in markdown code blocks (\`\`\`json ... \`\`\`) or appear as plain JSON in your response.

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
        model: model,
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }]
      })
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.log(`General Web Claude search failed:`, resp.status, errorText);

      // Try a more capable model if we used Haiku
      if (model === 'claude-haiku-4-5-20251001' || model === 'claude-3-5-haiku-latest') {
        console.log(`Trying more capable model: claude-sonnet-4-5-20250929`);
        return await searchGeneralWebClaude(searchQuery, productName, brand, barcode, 'claude-sonnet-4-5-20250929');
      }
      return [];
    }
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

    // If we got insufficient sources with Haiku, try a more capable model
    if (out.length < 2 && (model === 'claude-haiku-4-5-20251001' || model === 'claude-3-5-haiku-latest')) {
      console.log(`Insufficient sources with Haiku (${out.length}), trying Sonnet 4.5...`);
      const sonnetSources = await searchGeneralWebClaude(searchQuery, productName, brand, barcode, 'claude-sonnet-4-5-20250929');
      if (sonnetSources.length > out.length) {
        return sonnetSources;
      }
    }

    return out;
  } catch (e) {
    console.log('General Web Claude error:', (e as any).message);

    // Try a more capable model on error if we used Haiku
    if (model === 'claude-haiku-4-5-20251001' || model === 'claude-3-5-haiku-latest') {
      console.log(`Error with Haiku, trying Sonnet 4.5...`);
      return await searchGeneralWebClaude(searchQuery, productName, brand, barcode, 'claude-sonnet-4-5-20250929');
    }
    return [];
  }
}

// Phase 2 search function - gets exactly 2 additional sources
async function searchGeneralWebPhase2(
  productName: string,
  brand: string,
  barcode: string,
  addLog?: (msg: string) => void,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<Source[]> {
  const log = addLog || console.log;
  log(`Phase 2 search with Claude (${model}): Getting 2 additional sources`);

  const prompt = `Search the web broadly for the EXACT product below and extract ingredient lists from multiple independent pages.

Product: ${brand} ${productName}
Barcode: ${barcode}

INSTRUCTIONS:
- Find EXACTLY 2 additional independent sources (official brand site, reputable retailers, databases, PDFs) for this exact product.
- These are additional sources to help verify ingredient consistency.
- For EACH source:
  - Provide the SPECIFIC product page URL (not a search/homepage)
  - Include productTitle from the page
  - Copy the ingredient list VERBATIM (character-by-character)
  - Include explicit allergen statements, dietary labels, and cross-contamination warnings if present
- Reject pages that are not the exact product (different size/flavor/variant).
- IMPORTANT: Return EXACTLY 2 sources.

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
        model: model,
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }]
      })
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      log(`Phase 2 search failed:`, resp.status, errorText);

      // Try a more capable model if we used Haiku
      if (model === 'claude-haiku-4-5-20251001' || model === 'claude-3-5-haiku-latest') {
        log(`Trying more capable model: claude-sonnet-4-5-20250929`);
        return await searchGeneralWebPhase2(productName, brand, barcode, addLog, 'claude-sonnet-4-5-20250929');
      }
      return [];
    }
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
    log(`Phase 2 search: ${out.length} sources`);

    return out;
  } catch (e) {
    log(`Phase 2 search error:`, (e as any).message);

    // Try a more capable model on error if we used Haiku
    if (model === 'claude-haiku-4-5-20251001' || model === 'claude-3-5-haiku-latest') {
      log(`Error with Haiku, trying Sonnet 4.5...`);
      return await searchGeneralWebPhase2(productName, brand, barcode, addLog, 'claude-sonnet-4-5-20250929');
    }
    return [];
  }
}

// Parallel search function for a specific source type (Claude)
async function searchSourceTypeClaude(
  sourceType: string,
  searchQuery: string,
  productName: string,
  brand: string,
  barcode: string,
  model: string = 'claude-haiku-4-5-20251001'
): Promise<Source[]> {
  console.log(`Starting ${sourceType} search with Claude (${model})...`);
  if (sourceType.toLowerCase().includes('general web')) {
    return searchGeneralWebClaude(searchQuery, productName, brand, barcode, model);
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
   - DO NOT add ingredients that are NOT visible on the page
   - DO NOT remove ingredients that ARE visible on the page
   - DO NOT rearrange or reorder ingredients
   - For beverages: even short lists are acceptable (e.g., "Water, Barley, Hops, Yeast")
   
   ❌ WRONG: "Whole Grain Oats, Sugar, Salt, Natural Flavor"
   ✅ CORRECT: "Whole grain oats, chicory root extract, sugar, salt, natural flavor, monk fruit extract."
   
   ⚠️ CRITICAL VALIDATION: Before returning the ingredient list, verify:
      - Every ingredient in your list appears EXACTLY as written on the webpage
      - You have not added any ingredients that are not on the page
      - You have not removed any ingredients that are on the page
      - The order matches the order on the webpage

2. Look for explicit allergen statements:
   - "CONTAINS:" statements
   - "Allergen Information:" sections
   - Bold allergen warnings
   - Extract these word-for-word
3. Look for explicit dietary labels:
   - "Vegan", "Vegetarian", "Pescatarian", "Gluten-free"
   - "Plant-Based", "Dairy-Free", "Egg-Free"
   - Any certification badges or labels
4. Look for cross-contamination warnings (ONLY actual allergen warnings):
   - "May contain..." (allergen-specific, e.g., "May contain tree nuts")
   - "Processed in a facility that also processes..." (allergen-specific)
   - ❌ DO NOT include generic retailer disclaimers like:
     * "Actual product packaging may contain additional information"
     * "Product information provided by manufacturer"
     * "We recommend that you do not rely solely on..."
     * These are legal disclaimers, NOT product warnings
5. ANALYZE INGREDIENTS for allergens (TOP 9 FDA ALLERGENS ONLY):
   - "milk": milk, butter, cheese, whey, casein, lactose, cream, yogurt
   - "eggs": egg, albumin, mayonnaise, meringue
   - "fish": fish, anchovy, cod, salmon, tuna, bass
   - "shellfish": shrimp, crab, lobster, clam, oyster, mussel
   - "tree nuts": almonds, cashews, walnuts, pecans, pistachios, hazelnuts, macadamia
   - "peanuts": peanut, peanut butter, peanut oil
   - "wheat": wheat, wheat flour (NOT barley, rye, OR OATS - oats is NOT an allergen)
   - "soybeans": soy, soybean, soy lecithin, tofu, edamame
   - "sesame": sesame, tahini, sesame oil

   ❌ DO NOT INCLUDE: oats, barley, rye, corn, rice, or any ingredient NOT listed above
   ❌ CRITICAL: "oats" is NOT an allergen - NEVER include it in allergens array
   ✅ IMPORTANT: Use exact allergen names above (e.g., "tree nuts" not "almonds", "soybeans" not "soy")
6. DETERMINE DIETARY COMPATIBILITY (use logical rules):
   - Vegan: NO animal products (no meat, fish, dairy, eggs, honey, gelatin, whey)
     → If vegan → return ["vegan", "vegetarian", "pescatarian", "gluten-free"]
   - Vegetarian: NO meat or fish (may have dairy/eggs)
     → If vegetarian (not vegan) → return ["vegetarian", "pescatarian", "gluten-free"]
   - Pescatarian: NO meat (may have fish, dairy, eggs)
     → If pescatarian only → return ["pescatarian", "gluten-free"] when no gluten ingredients are present
   - Gluten-free: ONLY if there are NO wheat, barley, rye, malt, breadcrumbs, batter, or other gluten sources. Oats alone are acceptable unless wheat is explicitly listed.
     → If ingredient list is gluten-free but not vegan/vegetarian, still include ["gluten-free"] along with any applicable dietary labels
   - If contains meat/poultry → return [] unless fish-only (pescatarian)

   IMPORTANT: Check carefully:
   - If has milk/cheese/whey/butter → NOT vegan (but may be vegetarian)
   - If has eggs → NOT vegan (but may be vegetarian)
   - If has fish → NOT vegan/vegetarian (but may be pescatarian)
   - If has meat/chicken/beef/pork → return []
   
   VEGAN DETECTION - Be proactive when ingredients are clearly plant-based:
   - If ingredient list contains ONLY: oats, grains, seeds, nuts, fruits, vegetables, sugars, salts, plant-based oils, natural flavors (without animal-derived qualifiers), spices, extracts → LIKELY VEGAN
   - "Natural flavor" alone (without "contains milk/eggs/etc") in a plant-based product is typically vegan
   - Only exclude from vegan if you have POSITIVE evidence of animal products (milk, eggs, meat, fish, honey, gelatin)
   - When in doubt with "natural flavor" but all other ingredients are clearly plant-based, INCLUDE vegan
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
        model: model,
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: searchPrompt
        }],
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5
        }]
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.log(`${sourceType} search failed:`, claudeResponse.status, errorText);

      // Try a more capable model if we used Haiku
      if (model === 'claude-haiku-4-5-20251001' || model === 'claude-3-5-haiku-latest') {
        console.log(`Trying more capable model: claude-sonnet-4-5-20250929`);
        return await searchSourceTypeClaude(sourceType, searchQuery, productName, brand, barcode, 'claude-sonnet-4-5-20250929');
      }
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

    // If we got insufficient sources with Haiku, try a more capable model
    if (sources.length < 2 && (model === 'claude-haiku-4-5-20251001' || model === 'claude-3-5-haiku-latest')) {
      console.log(`Insufficient sources with Haiku (${sources.length}), trying Sonnet 4.5...`);
      const sonnetSources = await searchSourceTypeClaude(sourceType, searchQuery, productName, brand, barcode, 'claude-sonnet-4-5-20250929');
      if (sonnetSources.length > sources.length) {
        return sonnetSources;
      }
    }

    return sources;

  } catch (error) {
    console.log(`${sourceType} search error:`, error.message);

    // Try a more capable model on error if we used Haiku
    if (model === 'claude-haiku-4-5-20251001' || model === 'claude-3-5-haiku-latest') {
      console.log(`Error with Haiku, trying Sonnet 4.5...`);
      return await searchSourceTypeClaude(sourceType, searchQuery, productName, brand, barcode, 'claude-sonnet-4-5-20250929');
    }
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
  provider: SearchProvider = 'claude',
  addLog?: (msg: string) => void
): Promise<Source[]> {
  const log = addLog || console.log;

  // Always use Claude - Perplexity is deprecated
  log(`🎯 Using Claude web search (Perplexity is deprecated)`);
  log(`🔑 Anthropic API Key available: ${!!ANTHROPIC_API_KEY}`);

  if (!ANTHROPIC_API_KEY) {
    log(`⚠️ ANTHROPIC_API_KEY not configured. Please set it in Supabase environment variables.`);
    return [];
  }

  // Always use Claude
  return searchSourceTypeClaude(sourceType, searchQuery, productName, brand, barcode);
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

  // Initialize streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Initialize search logs array within the stream scope
      const searchLogs: string[] = [];
      const addLog = (message: string) => {
        console.log(message);
        searchLogs.push(message);
        sendSSE('log', { message });
      };

      try {
        const { productName, brand, barcode, openFoodFactsData, provider = 'claude' } = await req.json();

        addLog(`🔍 Starting search for: ${brand} ${productName}`);
        addLog(`📊 Barcode: ${barcode}`);
        addLog(`🤖 Using: Claude web search (Perplexity is deprecated)`);
        addLog(`⚙️ Minimum sources required: 3 with matching ingredients`);

        // Always use Claude - Perplexity is deprecated
        if (!ANTHROPIC_API_KEY) {
          throw new Error('ANTHROPIC_API_KEY not configured. Please set it in Supabase environment variables.');
        }

        // Always use Claude
        const searchProvider: SearchProvider = 'claude';

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

        let attempt = 1;
        const maxAttempts = 3;
        const targetSourceCount = 5;

        while (attempt <= maxAttempts && allSources.length < targetSourceCount) {
          if (attempt > 1) {
            addLog(`   ⚠️ Found only ${allSources.length} sources. Retrying search (Attempt ${attempt}/${maxAttempts})...`);
          }

          // Vary search query based on attempt to find different sources
          let currentQuery = `${brand} ${productName} ingredients`;
          if (attempt === 2) {
            currentQuery = `${productName} ingredients label`;
          } else if (attempt === 3) {
            currentQuery = `${brand} ${productName} nutrition facts ingredients`;
          }

          addLog(`📝 Search query: "${currentQuery}"`);

          const phase1Promises = [
            searchSourceType('General Web', currentQuery, productName, brand, barcode, searchProvider, addLog)
          ];

          const phase1Results = await Promise.all(phase1Promises);
          for (const sources of phase1Results) {
            // Filter out any undefined/null sources before adding
            const validSources = sources.filter(s => s !== null && s !== undefined);

            // Deduplicate against existing sources immediately
            for (const source of validSources) {
              const isDuplicate = allSources.some(s => s.url === source.url);
              if (!isDuplicate) {
                allSources.push(source);
              }
            }
          }

          if (allSources.length >= targetSourceCount) {
            addLog(`   ✅ Reached target of ${allSources.length} sources.`);
            break;
          }

          attempt++;
        }

        addLog(`📊 Phase 1 complete: Found ${allSources.length} potential sources`);

        // DEDUPLICATE by URL - same URL means same source
        addLog('');
        addLog('🔄 Deduplicating sources by URL...');
        const seenUrls = new Map<string, Source>();
        for (const source of allSources) {
          // Skip undefined or invalid sources
          if (!source || !source.url || !source.name) continue;

          const normalizedUrl = source.url.toLowerCase().trim();
          if (!seenUrls.has(normalizedUrl)) {
            seenUrls.set(normalizedUrl, source);
            addLog(`  ✓ ${source.name}: ${source.url.substring(0, 60)}...`);
          }
        }
        allSources = Array.from(seenUrls.values());
        addLog(`✅ ${allSources.length} unique sources after deduplication`);

        // OPTIMIZED ALGORITHM: Start with exactly 3 WEB sources (excluding Open Food Facts), analyze, then add 2 more only if needed
        addLog('');
        addLog('🎯 PHASE 1 ANALYSIS: Checking agreement among first 3 web sources...');

        // Separate Open Food Facts from web sources for analysis
        const openFoodFactsSource = allSources.find(s => s.name === 'Open Food Facts');
        const webSources = allSources.filter(s => s.name !== 'Open Food Facts');

        // Limit to first 3 WEB sources for initial analysis (excluding Open Food Facts)
        const initialSources = webSources.slice(0, 3);
        if (initialSources.length < 3) {
          addLog(`⚠️ Only found ${initialSources.length} web sources initially. Need at least 3.`);
        } else {
          addLog(`   Analyzing ${initialSources.length} web sources: ${initialSources.map(s => s.name).join(', ')}`);
          if (openFoodFactsSource) {
            addLog(`   (Open Food Facts will be analyzed separately)`);
          }
        }

        // Use AI to group sources by formulation (handles wording variations)
        const phase1Analysis = await analyzeSourceAgreement(initialSources, addLog);

        addLog(`   Found ${phase1Analysis.groups.length} different formulation(s)`);
        addLog(`   Largest group: ${phase1Analysis.largestGroup.length} source(s) agreeing`);

        let matchingSources: Source[] = phase1Analysis.largestGroup;

        // If Open Food Facts is available, check if it matches the web sources
        if (openFoodFactsSource && matchingSources.length >= 3 && initialSources.length >= 3) {
          addLog('');
          addLog(`🔍 Validating Open Food Facts against web sources...`);

          // Check if Open Food Facts matches the winning formulation
          const offAnalysis = await analyzeIngredientVariations(
            [openFoodFactsSource],
            matchingSources[0],
            addLog
          );

          if (offAnalysis.matchingSources.length > 0) {
            addLog(`   ✅ Open Food Facts confirms the formulation`);
            matchingSources.push(openFoodFactsSource);
          } else {
            addLog(`   ❌ Open Food Facts differs from web sources`);
            // Don't add Open Food Facts to matching sources
          }
        }

        // Check if we have consensus among all sources
        const totalSourcesAnalyzed = initialSources.length + (openFoodFactsSource ? 1 : 0);
        if (matchingSources.length >= 3 && totalSourcesAnalyzed === matchingSources.length) {
          addLog('');
          addLog(`✅ SUCCESS: All sources agree!`);
          addLog(`   Total: ${matchingSources.length} sources (${initialSources.length} web + ${openFoodFactsSource ? '1 Open Food Facts' : '0'})`);
          addLog(`   Stopping search - no need for additional sources`);
          addLog(`   Efficiently verified with minimum required sources`);
        } else if ((matchingSources.length >= 1 && matchingSources.length <= 2 && initialSources.length === 3) ||
          (matchingSources.length === 3 && initialSources.length === 3 && openFoodFactsSource && !matchingSources.includes(openFoodFactsSource))) {
          // Phase 2 trigger conditions:
          // 1. 1-2 out of 3 web sources agree, others differ - need more sources to determine consensus
          // 2. 3 out of 3 web sources agree BUT Open Food Facts differs
          addLog('');
          if (openFoodFactsSource && matchingSources.length === 3 && !matchingSources.includes(openFoodFactsSource)) {
            addLog(`⚠️ Web sources all agree, but Open Food Facts differs from them.`);
          } else if (matchingSources.length === 1) {
            addLog(`⚠️ Only 1/3 web sources agree. Two sources differ.`);
          } else {
            addLog(`⚠️ Only 2/3 web sources agree. One source differs.`);
          }
          addLog(`🌐 PHASE 2: Getting 2 more sources for 4/5 majority vote...`);
          addLog(`📝 This will help determine the correct formulation`);

          const phase2Promises = [
            searchGeneralWebPhase2(productName, brand, barcode, addLog)
          ];

          const phase2Results = await Promise.all(phase2Promises);
          const newSources: Source[] = [];
          for (const sources of phase2Results) {
            // Filter out any undefined/null sources before adding
            const validSources = sources.filter(s => s !== null && s !== undefined);
            newSources.push(...validSources);
          }

          addLog(`📊 Phase 2 found ${newSources.length} additional sources`);

          // Add new sources to existing list, avoiding duplicates
          for (const source of newSources) {
            if (!source || !source.url || !source.name) continue;

            const normalizedUrl = source.url.toLowerCase().trim();
            const isDuplicate = webSources.some(s => s.url.toLowerCase().trim() === normalizedUrl);

            if (!isDuplicate) {
              webSources.push(source);
              allSources.push(source); // Also update allSources for error response
              addLog(`  ✓ Added: ${source.name}`);

              // Stop when we have 5 total web sources (Open Food Facts is separate)
              if (webSources.length >= 5) {
                addLog(`   Reached 5 web sources total, stopping search`);
                break;
              }
            } else {
              addLog(`  ⚠️  Skipped duplicate: ${source.name}`);
            }
          }

          // Use only the 5 web sources for Phase 2 analysis (no Open Food Facts)
          const finalSources = webSources.slice(0, 5);
          addLog(`✅ ${finalSources.length} total web sources for final analysis`);

          // Re-analyze all sources with AI
          addLog('');
          addLog(`🎯 FINAL ANALYSIS: Checking agreement among all ${finalSources.length} sources...`);

          // Calculate required majority: for 5 sources need 4, for 4 sources need 3
          const MAJORITY_REQUIRED = finalSources.length === 5 ? 4 : 3;
          addLog(`   Need ${MAJORITY_REQUIRED}+ agreeing sources for success (allows 1 outlier)`);

          const finalAnalysis = await analyzeSourceAgreement(finalSources, addLog);

          addLog(`   Found ${finalAnalysis.groups.length} different formulation(s)`);
          addLog(`   Largest group: ${finalAnalysis.largestGroup.length} source(s) agreeing`);

          matchingSources = finalAnalysis.largestGroup;

          // Check if we have the required majority
          if (matchingSources.length >= MAJORITY_REQUIRED) {
            addLog('');
            addLog(`✅ SUCCESS: ${matchingSources.length}/${finalSources.length} sources agree (majority vote)`);
            if (matchingSources.length < finalSources.length) {
              const outliers = finalSources.filter(s => s && !matchingSources.includes(s)).map(s => s.name);
              addLog(`   ⚠️  Outlier(s) detected and ignored: ${outliers.join(', ')}`);
            }
          } else {
            addLog('');
            addLog(`❌ INSUFFICIENT AGREEMENT: Only ${matchingSources.length}/${finalSources.length} sources agree`);
            addLog(`   Need at least ${MAJORITY_REQUIRED} agreeing sources for verification`);
            addLog(`   This product requires MANUAL ingredient entry by the manager`);
          }
        } else {
          // Less than 2 sources agree, or we don't have 3 sources yet
          addLog('');
          if (initialSources.length < 3) {
            addLog(`❌ INSUFFICIENT SOURCES: Only found ${initialSources.length} sources`);
            addLog(`   Need at least 3 sources for verification`);
          } else {
            addLog(`❌ INSUFFICIENT AGREEMENT: Only ${matchingSources.length}/${initialSources.length} sources agree`);
            addLog(`   This product requires MANUAL ingredient entry by the manager`);
          }
        }

        let sourcesWithData = matchingSources.filter(s => s.dataAvailable);

        // FINAL DEDUPLICATION - ensure no duplicate domains/retailers in final results
        addLog('');
        addLog('🔄 Final deduplication of matching sources...');
        const finalSeenDomains = new Map<string, Source>();
        for (const source of sourcesWithData) {
          // Skip undefined or invalid sources
          if (!source || !source.url || !source.name) continue;

          // Extract domain from URL (e.g., "kroger.com" from "https://www.kroger.com/...")
          let domain = source.name.toLowerCase();
          try {
            const url = new URL(source.url);
            domain = url.hostname.replace('www.', '');
          } catch (e) {
            // If URL parsing fails, use source.name
            domain = source.name.toLowerCase();
          }

          if (!finalSeenDomains.has(domain)) {
            finalSeenDomains.set(domain, source);
          } else {
            addLog(`  ⚠️  Removed duplicate retailer: ${source.name} (already have ${domain})`);
          }
        }
        sourcesWithData = Array.from(finalSeenDomains.values());
        addLog(`✅ ${sourcesWithData.length} unique sources after final deduplication`);

        console.log(`\nFinal matching sources: ${sourcesWithData.length}`);
        console.log(`Minimum required: ${MINIMUM_SOURCES_REQUIRED}`);

        // Check if we have minimum required sources (either 3/3 or 4/5)
        if (sourcesWithData.length < MINIMUM_SOURCES_REQUIRED) {
          const errorResult = {
            error: `MANUAL ENTRY REQUIRED: Unable to verify ingredients with sufficient confidence. Please manually enter allergens and dietary preferences from the product label.`,
            requiresManualEntry: true,
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
          };
          sendSSE('result', errorResult);
          controller.close();
          return;
        }

        addLog('');
        addLog('✅ VERIFICATION SUCCESSFUL!');
        addLog(`   Found ${sourcesWithData.length} independent sources with matching ingredients`);

        // Collect all cross-contamination warnings (filter out generic retailer disclaimers)
        const allCrossContaminationWarnings = sourcesWithData
          .map(s => s.crossContaminationWarnings)
          .map(w => filterRetailerDisclaimers(w || '')) // Filter out generic disclaimers
          .filter(w => w !== null && w.length > 0) as string[];

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

        // Consolidate dietary compliance
        // Rule: If ANY source says a diet is NOT compliant, mark it as NOT compliant.
        // Reason: Safety first.
        const consolidatedCompliance: { [key: string]: { is_compliant: boolean; reason: string } } = {};
        const allDietKeys = new Set<string>();

        // First, gather all diet keys
        for (const source of sourcesWithData) {
          if (source.dietary_compliance) {
            Object.keys(source.dietary_compliance).forEach(k => allDietKeys.add(k));
          }
        }

        // Then consolidate
        for (const diet of allDietKeys) {
          let isCompliant = true;
          const reasons: string[] = [];

          for (const source of sourcesWithData) {
            if (source.dietary_compliance && source.dietary_compliance[diet]) {
              const compliance = source.dietary_compliance[diet];
              if (!compliance.is_compliant) {
                isCompliant = false;
                if (compliance.reason) reasons.push(compliance.reason);
              } else if (isCompliant && compliance.reason) {
                // Only add compliant reasons if we haven't found a non-compliant one yet
                // (though we'll likely overwrite this if we find a non-compliant one later)
                // Actually, for compliant, we can just take the first reason or merge them.
                // Let's just collect all reasons for now.
              }
            }
          }

          // If compliant, use a generic or merged reason. If not, use the negative reasons.
          // Filter reasons to avoid duplicates
          const uniqueReasons = [...new Set(reasons)];

          // If we found non-compliant sources, use their reasons
          if (!isCompliant) {
            consolidatedCompliance[diet] = {
              is_compliant: false,
              reason: uniqueReasons.join('; ') || 'Not compliant based on ingredient analysis.'
            };
          } else {
            // If all sources say compliant (or don't mention it), check if we have positive reasons
            // We need to find positive reasons from the sources
            const positiveReasons: string[] = [];
            for (const source of sourcesWithData) {
              if (source.dietary_compliance && source.dietary_compliance[diet] && source.dietary_compliance[diet].is_compliant) {
                positiveReasons.push(source.dietary_compliance[diet].reason);
              }
            }
            const uniquePositiveReasons = [...new Set(positiveReasons)];

            consolidatedCompliance[diet] = {
              is_compliant: true,
              reason: uniquePositiveReasons.join('; ') || 'No non-compliant ingredients found.'
            };
          }
        }

        // Validate allergens against ingredient lists
        // If an allergen is mentioned in an explicit statement but NOT in the ingredient list,
        // it's likely a cross-contamination warning, not a direct ingredient
        const validatedAllergens = new Set<string>();
        const ingredientTexts = sourcesWithData.map(s => s.ingredientsText.toLowerCase());

        for (const allergen of allAllergens) {
          const allergenLower = allergen.toLowerCase();
          let foundInIngredients = false;

          // Check if allergen appears in any ingredient list
          for (const ingredientText of ingredientTexts) {
            // Common patterns for allergen detection in ingredients
            const allergenPatterns: { [key: string]: RegExp[] } = {
              'milk': [/milk/, /butter/, /cheese/, /whey/, /casein/, /lactose/, /cream/, /yogurt/],
              'eggs': [/egg/, /albumin/, /mayonnaise/, /meringue/],
              'fish': [/fish/, /anchovy/, /cod/, /salmon/, /tuna/, /bass/, /sardine/],
              'shellfish': [/shrimp/, /crab/, /lobster/, /clam/, /oyster/, /mussel/],
              'tree nuts': [/almond/, /cashew/, /walnut/, /pecan/, /pistachio/, /hazelnut/, /macadamia/],
              'peanuts': [/peanut/],
              'wheat': [/wheat/, /wheat flour/, /wheat-based/],
              'soybeans': [/soy/, /soybean/, /tofu/, /edamame/],
              'sesame': [/sesame/, /tahini/]
            };

            const patterns = allergenPatterns[allergenLower];
            if (patterns) {
              foundInIngredients = patterns.some(pattern => pattern.test(ingredientText));
              if (foundInIngredients) break;
            }
          }

          // Also check if any explicit statement mentions it AND it's in ingredients
          // (if not in ingredients, it's likely cross-contamination and should go in warnings)
          if (foundInIngredients) {
            validatedAllergens.add(allergenLower);
          } else {
            // Check explicit statements - if mentioned but not in ingredients, log as potential cross-contamination
            const mentionedInStatement = explicitAllergenStatements.some(stmt =>
              stmt.toLowerCase().includes(allergenLower)
            );
            if (mentionedInStatement) {
              addLog(`⚠️  "${allergen}" mentioned in explicit allergen statement but not found in ingredient lists - treating as cross-contamination risk`);
              // Don't add to allergens, but ensure it's in cross-contamination warnings if not already
            }
          }
        }

        // Filter validated allergens to only include top 9 FDA allergens
        const rawAllergens = Array.from(validatedAllergens);
        const allergens = filterApprovedAllergens(rawAllergens);

        // Log if any allergens were filtered out
        const filteredOut = rawAllergens.filter(a => !APPROVED_ALLERGENS.has(a.toLowerCase()));
        if (filteredOut.length > 0) {
          addLog(`⚠️  Filtered out non-FDA allergens: ${filteredOut.join(', ')} (only top 9 FDA allergens are included)`);
        }

        const diets = Array.from(allDiets);

        // If we found explicit statements on ANY source, mark as not inferred
        const allergensInferred = explicitAllergenStatements.length === 0 && allergens.length > 0;
        const dietsInferred = explicitDietaryLabels.length === 0 && diets.length > 0;

        console.log(`Allergens found: ${allergens.join(', ')} ${allergensInferred ? '(inferred from ingredients)' : '(from explicit statements)'}`);
        if (filteredOut.length > 0) {
          console.log(`Filtered out: ${filteredOut.join(', ')}`);
        }
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
          consolidatedIngredients: sourcesWithData[0]?.ingredientsText || '',
          crossContaminationWarnings: consolidatedCrossContaminationWarnings,
          allergens: Array.from(allAllergens),
          allergensInferred: explicitAllergenStatements.length === 0,
          diets: Array.from(allDiets),
          dietsInferred: explicitDietaryLabels.length === 0,
          dietary_compliance: consolidatedCompliance,
          visualMatching: {
            imagesAvailable: sourcesWithData.filter(s => s.productImage).length,
            primaryImage: sourcesWithData.find(s => s.productImage)?.productImage || ''
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

        sendSSE('result', result);
        controller.close();

      } catch (error) {
        console.error('Error in verify-brand-sources:', error);
        const errorResult = {
          error: error.message,
          minimumSourcesRequired: MINIMUM_SOURCES_REQUIRED,
          sourcesFound: 0,
          searchLogs // Include logs up to the point of error
        };
        sendSSE('error', errorResult);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

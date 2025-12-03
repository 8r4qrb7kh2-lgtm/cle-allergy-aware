import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const FOODDATA_CENTRAL_API_KEY = Deno.env.get('FOODDATA_CENTRAL_API_KEY');
const FATSECRET_CLIENT_ID = Deno.env.get('FATSECRET_CLIENT_ID');
const FATSECRET_CLIENT_SECRET = Deno.env.get('FATSECRET_CLIENT_SECRET');

// Cache for FatSecret access token (expires after ~24 hours)
let fatSecretAccessToken: string | null = null;
let fatSecretTokenExpiry: number = 0;

interface IngredientSource {
  sourceName: string;
  url: string;
  ingredientsText: string;
  productName: string;
  brand?: string;
  urlValid?: boolean;
  productImage?: string;
  // Allergen and diet information (location varies by source - see comments in fetch functions)
  allergenStatement?: string;           // Direct "Contains:" allergen statement
  crossContaminationStatement?: string; // "May contain:" cross-contamination warnings
  allergenTags?: string[];              // Machine-readable allergen tags (e.g., "en:gluten", "en:milk")
  dietLabels?: string[];                // Diet certifications (e.g., "vegan", "vegetarian", "gluten-free")
}

interface BarcodeLookupResult {
  success: boolean;
  needsPhoto: boolean;
  productName?: string;
  brand?: string; // Brand name from barcode database (not extracted from product name)
  ingredientList?: string;
  ingredientNames?: string[]; // Clean list of extracted ingredient names
  sources?: IngredientSource[];
  productImage?: string;
  message?: string;
  consistencyInfo?: {
    totalSources: number;
    matchingSources: number;
    differentSources: number;
    differences?: Array<{
      sourceName: string;
      ingredientsText: string;
      groupSize: number;
    } | {
      ingredient: string;
      presentIn: string[];
      missingIn: string[];
      note?: string;
    }>;
  };
  // Antigravity analysis data
  unifiedIngredientList?: string[];
  top9Allergens?: string[];
  allergens?: string[];
  dietaryCompliance?: {
    vegan: { isCompliant: boolean; reason?: string };
    vegetarian: { isCompliant: boolean; reason?: string };
    pescatarian: { isCompliant: boolean; reason?: string };
    glutenFree: { isCompliant: boolean; reason?: string };
  };
  sourceDifferences?: Array<{
    ingredient: string;
    presentIn: string[];
    missingIn: string[];
    note?: string;
  }>;
}

// Fetch from Open Food Facts
// ALLERGEN/DIET FIELD LOCATIONS in Open Food Facts:
//   - allergens: Human-readable allergen text (e.g., "Soy, Wheat")
//   - allergens_tags: Machine-readable tags (e.g., ["en:gluten", "en:soybeans"])
//   - traces: Human-readable cross-contamination text
//   - traces_tags: Machine-readable trace tags
//   - labels_tags: Diet certifications (e.g., ["en:vegan", "en:vegetarian", "en:gluten-free"])
//   - labels: Human-readable labels
async function fetchFromOpenFoodFacts(barcode: string): Promise<{ source: IngredientSource | null; brand: string }> {
  try {
    console.log('Trying Open Food Facts...');
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    if (!response.ok) return { source: null, brand: '' };

    const data = await response.json();
    if (data.status !== 1 || !data.product) return { source: null, brand: '' };

    const product = data.product;
    const ingredientsText = product.ingredients_text_en ||
      product.ingredients_text ||
      product.ingredients_original ||
      '';

    // Extract allergen information
    const allergenTags = product.allergens_tags || [];
    const tracesTags = product.traces_tags || [];

    // Use allergens field if available, otherwise generate from tags
    let allergenStatement = product.allergens || '';
    if (!allergenStatement && allergenTags.length > 0) {
      // Convert tags like "en:gluten", "en:soybeans" to readable format
      const readableAllergens = allergenTags.map((tag: string) =>
        tag.replace(/^en:/, '').replace(/-/g, ' ')
          .split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      );
      allergenStatement = `Contains: ${readableAllergens.join(', ')}`;
    }

    // Use traces field if available, otherwise generate from traces_tags
    let crossContaminationStatement = product.traces || '';
    if (!crossContaminationStatement && tracesTags.length > 0) {
      const readableTraces = tracesTags.map((tag: string) =>
        tag.replace(/^en:/, '').replace(/-/g, ' ')
          .split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      );
      crossContaminationStatement = `May contain: ${readableTraces.join(', ')}`;
    }

    // Extract diet labels (vegan, vegetarian, gluten-free, etc.)
    const dietLabels = (product.labels_tags || []).map((tag: string) =>
      tag.replace(/^en:/, '').replace(/-/g, ' ')
    );

    if (allergenStatement || allergenTags.length > 0) {
      console.log(`  Allergens found: ${allergenStatement || allergenTags.join(', ')}`);
    }
    if (crossContaminationStatement) {
      console.log(`  Traces/May contain: ${crossContaminationStatement}`);
    }
    if (dietLabels.length > 0) {
      console.log(`  Diet labels: ${dietLabels.join(', ')}`);
    }

    if (!ingredientsText || ingredientsText.trim().length < 10) {
      console.log('Open Food Facts found product but no ingredients');
      return { source: null, brand: '' };
    }

    // Extract brand name - try multiple fields, prioritizing brand_owner
    // NOTE: We do NOT try to extract brand from product_name as it's unreliable
    // (e.g., "Tofubaked Marinated Baked Tofu" would wrongly extract "Tofubaked Marinated" as brand)
    let brandName = product.brand_owner ||
      product.brands ||
      product.brand ||
      product.brands_tags?.[0]?.replace(/^en:/, '').replace(/-/g, ' ') ||
      '';

    // Clean up brand name
    if (brandName.includes(',')) {
      brandName = brandName.split(',')[0].trim();
    }

    // Remove common suffixes that appear in brand_owner field (e.g., "WEIS QUALITY" -> "WEIS")
    const commonSuffixes = ['QUALITY', 'BRANDS', 'FOODS', 'COMPANY', 'INC', 'LLC', 'CORP', 'CORPORATION', 'GROCERY', 'MARKETS'];
    for (const suffix of commonSuffixes) {
      const regex = new RegExp(`\\s+${suffix}\\s*$`, 'i');
      if (regex.test(brandName)) {
        brandName = brandName.replace(regex, '').trim();
        console.log(`Removed suffix "${suffix}" from brand name`);
        break; // Only remove one suffix
      }
    }

    brandName = brandName.trim();

    // Normalize to title case for better search matching (e.g., "WEIS" -> "Weis", "WEIS QUALITY" -> "Weis")
    if (brandName) {
      const words = brandName.split(/\s+/);
      if (words.length === 1) {
        // Single word: capitalize first letter, lowercase rest
        brandName = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
      } else {
        // Multiple words: title case each word
        brandName = words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
      }
    }

    // Log available brand-related fields for debugging
    if (!brandName) {
      console.log('⚠️ No brand found. Available fields:', {
        brands: product.brands,
        brand: product.brand,
        brand_owner: product.brand_owner,
        brands_tags: product.brands_tags,
        product_name: product.product_name
      });
    } else {
      console.log(`✓ Found brand: "${brandName}"`);
    }

    console.log('✓ Found in Open Food Facts');
    return {
      source: {
        sourceName: 'Open Food Facts',
        url: product.url || `https://world.openfoodfacts.org/product/${barcode}`,
        ingredientsText: ingredientsText.trim(),
        productName: product.product_name || product.brands || 'Unknown Product',
        productImage: product.image_front_small_url || product.image_front_url || product.image_url || '',
        allergenStatement: allergenStatement || undefined,
        allergenTags: allergenTags.length > 0 ? allergenTags : undefined,
        crossContaminationStatement: crossContaminationStatement || undefined,
        dietLabels: dietLabels.length > 0 ? dietLabels : undefined
      },
      brand: brandName
    };
  } catch (err) {
    console.log('✗ Open Food Facts failed:', (err as any).message);
    return { source: null, brand: '' };
  }
}

// Fetch from USDA FoodData Central - provides both brand identification and ingredient data
// ALLERGEN/DIET FIELD LOCATIONS in FoodData Central:
//   - ingredients: Full ingredient text (allergens often embedded here, e.g., "CONTAINS: MILK, SOY")
//   - foodAllergens: Some products have this field with allergen info (from label)
//   - marketCountry: Market info (sometimes relevant for labeling requirements)
//   NOTE: FDC is a nutritional database, so allergen/diet info is less structured than OFF
//   Allergens are typically found at the end of the ingredients text after "CONTAINS:"
async function fetchFromFoodDataCentral(barcode: string): Promise<{ source: IngredientSource | null; brand: string; productName: string }> {
  if (!FOODDATA_CENTRAL_API_KEY) {
    console.log('✗ FoodData Central API key not configured');
    return { source: null, brand: '', productName: '' };
  }

  try {
    console.log('Trying USDA FoodData Central...');

    // Search by GTIN/UPC barcode
    const searchUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${FOODDATA_CENTRAL_API_KEY}&query=${barcode}&dataType=Branded`;

    const response = await fetch(searchUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`✗ FoodData Central returned status ${response.status}`);
      return { source: null, brand: '', productName: '' };
    }

    const data = await response.json();

    if (!data.foods || data.foods.length === 0) {
      console.log('✗ FoodData Central found no items for this barcode');
      return { source: null, brand: '', productName: '' };
    }

    // Find the food item that matches the barcode exactly (gtinUpc field)
    let matchingFood = data.foods.find((food: any) => food.gtinUpc === barcode);

    // If no exact match, use the first branded food result
    if (!matchingFood) {
      matchingFood = data.foods[0];
      console.log(`No exact barcode match, using first result: ${matchingFood.description}`);
    }

    const productName = matchingFood.description || matchingFood.brandedFoodCategory || '';
    const brand = matchingFood.brandOwner || matchingFood.brandName || '';
    const ingredientsText = matchingFood.ingredients || '';
    const fdcId = matchingFood.fdcId;

    // Extract allergen statement from ingredients text (often at end after "CONTAINS:")
    let allergenStatement = '';
    let crossContaminationStatement = '';

    // Look for "CONTAINS:" statement in ingredients
    const containsMatch = ingredientsText.match(/CONTAINS[:\s]+([^.]+(?:\.|\s*$))/i);
    if (containsMatch) {
      allergenStatement = containsMatch[1].trim().replace(/\.$/, '');
      console.log(`  Allergen statement found: ${allergenStatement}`);
    }

    // Look for "MAY CONTAIN" statement
    const mayContainMatch = ingredientsText.match(/MAY CONTAIN[:\s]+([^.]+(?:\.|\s*$))/i);
    if (mayContainMatch) {
      crossContaminationStatement = mayContainMatch[1].trim().replace(/\.$/, '');
      console.log(`  May contain found: ${crossContaminationStatement}`);
    }

    // Also check foodAllergens field if available
    if (matchingFood.foodAllergens && !allergenStatement) {
      allergenStatement = matchingFood.foodAllergens;
      console.log(`  Allergens from foodAllergens field: ${allergenStatement}`);
    }

    if (!productName) {
      console.log('✗ FoodData Central found item but no product name');
      return { source: null, brand: '', productName: '' };
    }

    // If we have ingredients, create a source
    if (ingredientsText && ingredientsText.trim().length > 10) {
      console.log(`✓ Found in FoodData Central: "${productName}"${brand ? ` (Brand: ${brand})` : ''}`);
      console.log(`  Ingredients length: ${ingredientsText.length} chars`);

      return {
        source: {
          sourceName: 'USDA FoodData Central',
          url: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${fdcId}/nutrients`,
          ingredientsText: ingredientsText.trim(),
          productName: productName,
          productImage: '',
          allergenStatement: allergenStatement || undefined,
          crossContaminationStatement: crossContaminationStatement || undefined
        },
        brand: brand,
        productName: productName
      };
    } else {
      // No ingredients but we have product info - return brand/name for searching
      console.log(`✓ FoodData Central found product info (no ingredients): "${productName}"${brand ? ` (Brand: ${brand})` : ''}`);
      return {
        source: null,
        brand: brand,
        productName: productName
      };
    }
  } catch (err) {
    console.log('✗ FoodData Central failed:', (err as any).message);
    return { source: null, brand: '', productName: '' };
  }
}

// Get FatSecret OAuth 2.0 access token
async function getFatSecretAccessToken(): Promise<string | null> {
  // Check if we have a valid cached token
  if (fatSecretAccessToken && Date.now() < fatSecretTokenExpiry) {
    return fatSecretAccessToken;
  }

  if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
    console.log('✗ FatSecret credentials not configured');
    return null;
  }

  try {
    console.log('Getting FatSecret access token...');

    // OAuth 2.0 Client Credentials flow
    const credentials = btoa(`${FATSECRET_CLIENT_ID}:${FATSECRET_CLIENT_SECRET}`);

    // NOTE: Change scope from "basic" to "premier" once Premier tier is approved
    // Basic scope only supports OAuth 1.0 for barcode endpoint, Premier supports OAuth 2.0
    const response = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials&scope=basic'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`✗ FatSecret token request failed: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    fatSecretAccessToken = data.access_token;
    // Set expiry to 23 hours (tokens last 24 hours, but we refresh early)
    fatSecretTokenExpiry = Date.now() + (23 * 60 * 60 * 1000);

    console.log('✓ Got FatSecret access token');
    return fatSecretAccessToken;
  } catch (err) {
    console.log('✗ FatSecret token error:', (err as any).message);
    return null;
  }
}

// Fetch from FatSecret API using barcode
// ALLERGEN/DIET FIELD LOCATIONS in FatSecret (Premier tier required for most):
//   - food_allergens: Allergen information (e.g., "Contains: Milk, Soy")
//   - food_attributes: May contain diet-related attributes
//   NOTE: Most allergen data requires Premier API tier
//   The food_ingredients field may also contain embedded "Contains:" statements
async function fetchFromFatSecret(barcode: string): Promise<{ source: IngredientSource | null; brand: string; productName: string }> {
  const accessToken = await getFatSecretAccessToken();
  if (!accessToken) {
    return { source: null, brand: '', productName: '' };
  }

  try {
    console.log('Trying FatSecret...');

    // Step 1: Find food by barcode
    const searchUrl = `https://platform.fatsecret.com/rest/food/barcode/find-by-id/v1?barcode=${barcode}&format=json`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.log(`✗ FatSecret barcode lookup failed: ${searchResponse.status} - ${errorText}`);
      return { source: null, brand: '', productName: '' };
    }

    const searchData = await searchResponse.json();

    // Check if food was found
    if (!searchData.food) {
      console.log('✗ FatSecret found no food for this barcode');
      return { source: null, brand: '', productName: '' };
    }

    const food = searchData.food;
    const foodId = food.food_id;
    const productName = food.food_name || '';
    const brand = food.brand_name || '';

    console.log(`✓ FatSecret found: "${productName}"${brand ? ` (Brand: ${brand})` : ''}`);

    // Step 2: Get full food details including ingredients
    const detailsUrl = `https://platform.fatsecret.com/rest/food/v4?food_id=${foodId}&format=json`;

    const detailsResponse = await fetch(detailsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!detailsResponse.ok) {
      console.log(`✗ FatSecret food details failed: ${detailsResponse.status}`);
      return { source: null, brand: brand, productName: productName };
    }

    const detailsData = await detailsResponse.json();
    const foodDetails = detailsData.food;

    // Extract ingredients - FatSecret uses 'food_ingredients' field
    const ingredientsText = foodDetails?.food_ingredients || '';

    // Extract allergen information from FatSecret
    // food_allergens field (Premier tier) or embedded in ingredients
    let allergenStatement = foodDetails?.food_allergens || '';
    let crossContaminationStatement = '';

    // If no dedicated allergen field, try to extract from ingredients text
    if (!allergenStatement && ingredientsText) {
      const containsMatch = ingredientsText.match(/CONTAINS[:\s]+([^.]+(?:\.|\s*$))/i);
      if (containsMatch) {
        allergenStatement = containsMatch[1].trim().replace(/\.$/, '');
      }
    }

    // Look for "May contain" in ingredients
    if (ingredientsText) {
      const mayContainMatch = ingredientsText.match(/MAY CONTAIN[:\s]+([^.]+(?:\.|\s*$))/i);
      if (mayContainMatch) {
        crossContaminationStatement = mayContainMatch[1].trim().replace(/\.$/, '');
      }
    }

    if (allergenStatement) {
      console.log(`  Allergens found: ${allergenStatement}`);
    }
    if (crossContaminationStatement) {
      console.log(`  May contain: ${crossContaminationStatement}`);
    }

    if (!ingredientsText || ingredientsText.trim().length < 10) {
      console.log('✓ FatSecret found product but no ingredients');
      return { source: null, brand: brand, productName: productName };
    }

    console.log(`✓ Found ingredients in FatSecret (${ingredientsText.length} chars)`);

    return {
      source: {
        sourceName: 'FatSecret',
        url: foodDetails.food_url || `https://www.fatsecret.com/calories-nutrition/search?q=${encodeURIComponent(productName)}`,
        ingredientsText: ingredientsText.trim(),
        productName: productName,
        productImage: foodDetails.food_images?.food_image?.[0]?.image_url || '',
        allergenStatement: allergenStatement || undefined,
        crossContaminationStatement: crossContaminationStatement || undefined
      },
      brand: brand,
      productName: productName
    };
  } catch (err) {
    console.log('✗ FatSecret failed:', (err as any).message);
    return { source: null, brand: '', productName: '' };
  }
}

// Search Fig (foodisgood.com) for product information via web search
// Fig's website is JavaScript-rendered, so we search for the product and extract from search snippets
// ALLERGEN/DIET FIELD LOCATIONS in Fig:
//   - Fig provides detailed allergen warnings and diet compatibility
//   - Products are analyzed against 2800+ dietary restrictions
//   - Diet compatibility shown as badges (vegan, gluten-free, etc.)
//   - Allergen warnings are prominently displayed
async function searchFigForProduct(productName: string, brandName: string): Promise<{ source: IngredientSource | null; _debug?: string }> {
  if (!ANTHROPIC_API_KEY) {
    console.log('✗ No Anthropic API key for Fig search');
    return { source: null };
  }

  try {
    // Clean up product name for better Fig search matching
    // Fig uses format: "Brand Product Type" (e.g., "Goya Cooking Wine Red")
    // Our data may have: "Cooking Wine, Red Wine" - need to clean this up
    const cleanProductName = productName
      .replace(/,\s*/g, ' ')           // Replace commas with spaces
      .replace(/\s+/g, ' ')            // Normalize multiple spaces
      .replace(/\bWINE\b/gi, '')       // Remove duplicate "wine" if present
      .trim();

    // Build search variations
    const searchQuery = brandName
      ? `${brandName} ${cleanProductName}`.trim()
      : cleanProductName;

    // Also try a simplified version (first few words only)
    const simpleQuery = brandName
      ? `${brandName} ${cleanProductName.split(' ').slice(0, 3).join(' ')}`
      : cleanProductName.split(' ').slice(0, 3).join(' ');

    console.log(`Searching Fig for: "${searchQuery}" (simple: "${simpleQuery}")...`);

    const prompt = `Search for this product on the Fig food database at foodisgood.com.

Product to find: "${searchQuery}"
Brand: "${brandName || 'unknown'}"

Try these search queries on foodisgood.com:
1. ${searchQuery}
2. ${simpleQuery}
3. ${brandName} cooking ${cleanProductName.split(' ')[0]}

Fig product URLs follow this pattern: foodisgood.com/product/{brand}-{product-name}/
Example: foodisgood.com/product/goya-cooking-wine-red/

When you find the product page, extract:
- The complete ingredient list (under "Ingredients" heading)
- Allergen warnings
- Diet labels

Return JSON only:
{
  "found": true/false,
  "productName": "exact product name from Fig",
  "ingredients": "full ingredient list text",
  "allergenStatement": "Contains: X, Y, Z" or null,
  "crossContamination": "May contain: X" or null,
  "dietLabels": ["vegan", "gluten-free", ...] or [],
  "figUrl": "full URL of the Fig product page"
}

If not found, return: {"found": false}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        temperature: 0,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5
        }],
        messages: [{ role: 'user', content: prompt }]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`✗ Fig search API error: ${response.status} - ${errorText}`);
      return { source: null };
    }

    const data = await response.json();
    console.log(`Fig search API response stop_reason: ${data.stop_reason}`);
    console.log(`Fig search content blocks: ${data.content?.length || 0}`);

    // Check if web search was actually used
    let webSearchUsed = false;
    for (const block of data.content || []) {
      if (block.type === 'tool_use' && block.name === 'web_search') {
        webSearchUsed = true;
        console.log('Web search was invoked');
      }
      if (block.type === 'web_search_tool_result') {
        console.log(`Web search returned ${block.content?.length || 0} results`);
      }
    }
    if (!webSearchUsed) {
      console.log('WARNING: Web search was NOT used by Claude');
    }

    // Extract text response from Claude (may have tool use blocks)
    let textContent = '';
    for (const block of data.content || []) {
      console.log(`  Block type: ${block.type}`);
      if (block.type === 'text') {
        textContent += block.text;
      }
    }

    console.log(`Fig search text content length: ${textContent.length}`);
    if (textContent.length < 500) {
      console.log(`Fig search text content: ${textContent}`);
    }

    // Parse JSON from response
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('✗ Could not parse Fig search response - no JSON found in text');
      return { source: null, _debug: `no_json_in_response, text_len=${textContent.length}` };
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log(`Fig search parsed result: found=${result.found}, hasIngredients=${!!result.ingredients}`);

    if (!result.found || !result.ingredients) {
      console.log('✗ Product not found on Fig or no ingredients returned');
      return { source: null, _debug: `found=${result.found}, ingredients=${!!result.ingredients}` };
    }

    console.log(`✓ Found on Fig: "${result.productName}"`);
    if (result.allergenStatement) {
      console.log(`  Allergens: ${result.allergenStatement}`);
    }
    if (result.dietLabels?.length > 0) {
      console.log(`  Diet labels: ${result.dietLabels.join(', ')}`);
    }

    return {
      source: {
        sourceName: 'Fig',
        url: result.figUrl || `https://foodisgood.com/product/${productName.toLowerCase().replace(/\s+/g, '-')}/`,
        ingredientsText: result.ingredients,
        productName: result.productName || productName,
        allergenStatement: result.allergenStatement || undefined,
        crossContaminationStatement: result.crossContamination || undefined,
        dietLabels: result.dietLabels?.length > 0 ? result.dietLabels : undefined
      }
    };

  } catch (err) {
    console.log('✗ Fig search failed:', (err as any).message);
    return { source: null };
  }
}

// Use AI to extract clean ingredient names from verbatim ingredient text
async function extractIngredientNames(verbatimText: string): Promise<string[]> {
  if (!verbatimText || verbatimText.trim().length < 10) {
    return [];
  }

  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) {
    console.log('No Anthropic API key available for ingredient extraction');
    return [];
  }

  try {
    console.log('Extracting ingredient names from verbatim text...');

    const prompt = `Parse this ingredient list into a clean, normalized list for allergy/dietary checking.

RULES:
1. REMOVE prefixes: "organic", "natural", "filtered", "purified", "contains 2% or less of", "less than 2% of"
2. REMOVE generic items that aren't allergens: "water", "salt", "sugar" (unless they're the main product)
3. NORMALIZE to Title Case: "MAGNESIUM CHLORIDE" → "Magnesium Chloride"
4. For COMPOUND ingredients with parentheses:
   - "SOY SAUCE (WATER, SOYBEANS, WHEAT, SALT)" → extract "Soy Sauce" AND "Soybeans" AND "Wheat" (because soybeans and wheat are allergens)
   - Only extract sub-ingredients if they're potential allergens (soy, wheat, milk, eggs, nuts, fish, shellfish, sesame)
5. Keep food additives: "Magnesium Chloride", "Calcium Sulfate", "Xanthan Gum", etc.
6. KEEP bacterial/probiotic species names TOGETHER - do NOT split on the period:
   - "L. Acidophilus" stays as "L. Acidophilus" (NOT "L" and "Acidophilus")
   - "S. Thermophilus" stays as "S. Thermophilus"
   - "L. Bulgaricus", "L. Casei", "L. Rhamnosus", "Bifidus" etc. are single ingredients
7. Output PLAIN TEXT only - no markdown, no underscores, no asterisks, no special formatting

EXAMPLES:
- "WATER, ORGANIC SOYBEANS, MAGNESIUM CHLORIDE, CALCIUM SULFATE" → ["Soybeans", "Magnesium Chloride", "Calcium Sulfate"]
- "ORGANIC TAMARI SOY SAUCE (WATER, ORGANIC SOYBEANS, SALT)" → ["Tamari Soy Sauce", "Soybeans"]
- "ENRICHED FLOUR (WHEAT FLOUR, NIACIN, IRON)" → ["Enriched Flour", "Wheat"]
- "CULTURED NONFAT MILK, S. THERMOPHILUS, L. BULGARICUS, L. ACIDOPHILUS" → ["Cultured Nonfat Milk", "S. Thermophilus", "L. Bulgaricus", "L. Acidophilus"]

INGREDIENT LIST:
${verbatimText}

Return ONLY a JSON array of ingredient name strings (plain text, no markdown):
["Ingredient 1", "Ingredient 2", ...]`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }]
      }),
    });

    if (!response.ok) {
      console.log(`Ingredient extraction API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    // Parse JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const ingredients = JSON.parse(jsonMatch[0]);
      if (Array.isArray(ingredients)) {
        console.log(`Extracted ${ingredients.length} ingredient names`);
        return ingredients.filter((i: any) => typeof i === 'string' && i.trim().length > 0);
      }
    }

    console.log('Failed to parse ingredient names from AI response');
    return [];

  } catch (error) {
    console.log('Ingredient extraction error:', (error as any).message);
    return [];
  }
}

// =============================================================================
// ANTIGRAVITY SEARCH SYSTEM
// Multi-engine web search and scraping for finding brand product ingredients
// Uses Yahoo, Bing, Google, and DuckDuckGo to find product pages, then scrapes
// and uses AI to extract and verify ingredient lists from 5 sources
// =============================================================================

interface AntigravityScrapedSource {
  url: string;
  content: string;
  title: string;
  matchCount?: number;
  hasBrand?: boolean;
  productImage?: string;
}

interface AntigravityAnalysisResult {
  productName: string;
  productImage?: string;
  sources: Array<{
    url: string;
    ingredients: string[];
    hasIngredients: boolean;
  }>;
  unifiedIngredientList: string[];
  top9Allergens: string[];
  dietaryCompliance: {
    vegan: { isCompliant: boolean; reason?: string };
    vegetarian: { isCompliant: boolean; reason?: string };
    pescatarian: { isCompliant: boolean; reason?: string };
    glutenFree: { isCompliant: boolean; reason?: string };
  };
  differences: Array<{
    ingredient: string;
    presentIn: string[];
    missingIn: string[];
    note?: string;
  }>;
}

// Helper: Parse HTML to extract text (simple cheerio-like parsing for Deno)
function parseHtml(html: string): { text: string; title: string } {
  // Remove scripts and styles
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Extract title
  const titleMatch = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // Convert block elements to newlines
  cleaned = cleaned
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n');

  // Remove all remaining HTML tags
  const text = cleaned
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  return { text, title };
}

// Search Yahoo for product URLs
async function antigravitySearchYahoo(query: string, addLog?: (msg: string) => void): Promise<string[]> {
  const log = addLog || console.log;
  log(`[Antigravity] Yahoo search: ${query}`);
  try {
    const searchUrl = `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!response.ok) return [];
    const html = await response.text();

    // Extract links from Yahoo results
    const links: string[] = [];
    const linkRegex = /\/RU=([^/]+)/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const decoded = decodeURIComponent(match[1]);
        if (decoded.startsWith('http') && !decoded.includes('yahoo.com') && !decoded.includes('google.com')) {
          links.push(decoded);
        }
      } catch (e) { /* ignore decode errors */ }
    }

    log(`  Yahoo found ${links.length} links`);
    return links.slice(0, 10);
  } catch (error) {
    log(`  Yahoo search failed: ${(error as any).message}`);
    return [];
  }
}

// Search Bing for product URLs
async function antigravitySearchBing(query: string, addLog?: (msg: string) => void): Promise<string[]> {
  const log = addLog || console.log;
  log(`[Antigravity] Bing search: ${query}`);
  try {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    if (!response.ok) return [];
    const html = await response.text();

    // Extract links from Bing results
    const links: string[] = [];
    const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      if (!href.includes('bing.com') && !href.includes('microsoft.com') && !href.includes('go.microsoft')) {
        links.push(href);
      }
    }

    log(`  Bing found ${links.length} links`);
    return links.slice(0, 10);
  } catch (error) {
    log(`  Bing search failed: ${(error as any).message}`);
    return [];
  }
}

// Search Google for product URLs
async function antigravitySearchGoogle(query: string, addLog?: (msg: string) => void): Promise<string[]> {
  const log = addLog || console.log;
  log(`[Antigravity] Google search: ${query}`);
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    if (!response.ok) return [];
    const html = await response.text();

    // Extract links from Google results (look for /url?q= pattern)
    const links: string[] = [];
    const linkRegex = /\/url\?q=(https?:\/\/[^&"]+)/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const href = decodeURIComponent(match[1]);
        if (!href.includes('google.com') && !href.includes('youtube.com')) {
          links.push(href);
        }
      } catch (e) { /* ignore */ }
    }

    // Also try direct href pattern
    const directRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>/gi;
    while ((match = directRegex.exec(html)) !== null) {
      const href = match[1];
      if (!href.includes('google.com') && href.startsWith('http')) {
        if (!links.includes(href)) links.push(href);
      }
    }

    log(`  Google found ${links.length} links`);
    return links.slice(0, 10);
  } catch (error) {
    log(`  Google search failed: ${(error as any).message}`);
    return [];
  }
}

// Search DuckDuckGo Lite for product URLs
async function antigravitySearchDDGLite(query: string, addLog?: (msg: string) => void): Promise<string[]> {
  const log = addLog || console.log;
  log(`[Antigravity] DuckDuckGo search: ${query}`);
  try {
    const response = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `q=${encodeURIComponent(query)}`
    });

    if (!response.ok) return [];
    const html = await response.text();

    // Extract links from DDG results
    const links: string[] = [];
    const linkRegex = /<a[^>]+class="result-link"[^>]*href="(https?:\/\/[^"]+)"/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      links.push(match[1]);
    }

    // Fallback: any http links in result sections
    const fallbackRegex = /<a[^>]+href="(https?:\/\/(?!duckduckgo)[^"]+)"/gi;
    while ((match = fallbackRegex.exec(html)) !== null) {
      if (!links.includes(match[1])) links.push(match[1]);
    }

    log(`  DuckDuckGo found ${links.length} links`);
    return links.slice(0, 10);
  } catch (error) {
    log(`  DuckDuckGo search failed: ${(error as any).message}`);
    return [];
  }
}

// Scrape a URL and extract content
async function antigravityScrapeUrl(url: string): Promise<AntigravityScrapedSource | null> {
  try {
    // Special handling for OpenFoodFacts - use API
    if (url.includes('openfoodfacts.org')) {
      const barcodeMatch = url.match(/product\/(\d+)/);
      if (barcodeMatch) {
        const barcode = barcodeMatch[1];
        const apiUrl = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
        try {
          const response = await fetch(apiUrl);
          if (response.ok) {
            const data = await response.json();
            if (data.status === 1 && data.product) {
              const ingredients = data.product.ingredients_text ||
                data.product.ingredients_text_en ||
                data.product.ingredients_text_with_allergens || '';

              if (ingredients) {
                const content = `Product Name: ${data.product.product_name || 'Unknown'}
Ingredients: ${ingredients}
Allergens: ${data.product.allergens || 'None listed'}
Brands: ${data.product.brands || 'Unknown'}`;
                return { url, content, title: data.product.product_name || '' };
              }
            }
          }
        } catch (e) {
          console.log(`  OFF API failed for ${url}`);
        }
      }
    }

    // General scraping
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });

    if (!response.ok) return null;
    const html = await response.text();
    const { text, title } = parseHtml(html);

    // Extract og:image
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    const productImage = ogImageMatch ? ogImageMatch[1] : undefined;

    // Check for blocked pages
    const lowerContent = text.toLowerCase();
    const blockKeywords = ['access denied', 'security check', 'captcha', 'robot',
      'human verification', '403 forbidden', '404 not found', 'enable javascript'];

    if (blockKeywords.some(k => lowerContent.includes(k)) && text.length < 500) {
      return null;
    }

    // Limit content size
    const content = text.substring(0, 15000);

    if (content.length < 50) return null;

    return { url, content, title };
  } catch (error) {
    console.log(`  Failed to scrape ${url}: ${(error as any).message}`);
    return null;
  }
}

// Scrape multiple URLs in parallel
async function antigravityScrapeUrls(urls: string[], addLog?: (msg: string) => void): Promise<AntigravityScrapedSource[]> {
  const log = addLog || console.log;
  log(`[Antigravity] Scraping ${urls.length} URLs...`);
  const results = await Promise.all(urls.map(url => antigravityScrapeUrl(url)));
  const valid = results.filter((r): r is AntigravityScrapedSource => r !== null);
  log(`  Scraped ${valid.length} successfully`);
  return valid;
}

// Extract best title from scraped sources
function antigravityExtractBestTitle(data: AntigravityScrapedSource[]): string {
  const titleBlacklist = [
    'nutrition facts', 'calories in', 'upc lookup', 'barcode lookup',
    'search results', 'item', 'product', 'food', 'amazon.com',
    'walmart.com', 'target.com', 'access denied', 'captcha',
    'page not found', '404', 'error', 'log in', 'sign in'
  ];

  for (const d of data) {
    if (d.title && d.title.length > 5) {
      const titleLower = d.title.toLowerCase();
      if (titleBlacklist.some(term => titleLower.includes(term))) continue;

      let cleanTitle = d.title
        .replace(/UPC\s*\d+/i, '')
        .replace(/Barcode\s*lookup/i, '')
        .replace(/\|\s*.*$/, '')
        .replace(/-\s*.*$/, '')
        .replace(/Nutrition\s*Facts/i, '')
        .trim();

      if (cleanTitle.length > 5) return cleanTitle;
    }
  }
  return '';
}

// Filter sources by relevance to product
function antigravityFilterData(data: AntigravityScrapedSource[], title: string): {
  valid: AntigravityScrapedSource[];
  rejected: AntigravityScrapedSource[];
} {
  const result = { valid: [] as AntigravityScrapedSource[], rejected: [] as AntigravityScrapedSource[] };
  if (!title) {
    result.valid = data;
    return result;
  }

  const brandBlacklist = ['nutrition', 'calories', 'facts', 'the', 'a', 'an', 'food', 'product', 'item', 'organic', 'natural'];
  const keywords = title.toLowerCase().split(' ').filter(w => w.length > 2 && !brandBlacklist.includes(w));

  if (keywords.length === 0) {
    result.valid = data;
    return result;
  }

  for (const d of data) {
    if (!d.title) continue;
    const titleLower = d.title.toLowerCase().replace(/[^\w\s]/g, '');

    const matchCount = keywords.reduce((acc, k) => {
      const kClean = k.replace(/[^\w\s]/g, '');
      return titleLower.includes(kClean) ? acc + 1 : acc;
    }, 0);

    // Relaxed logic: Just need some keyword overlap
    // If we have few keywords (e.g. "Tofu"), need 1 match
    // If we have many (e.g. "Premium Extra Firm Tofu"), need 2 matches
    const minMatches = keywords.length > 2 ? 2 : 1;
    const isRelevant = matchCount >= minMatches;

    if (isRelevant) {
      result.valid.push(d);
    } else {
      d.matchCount = matchCount;
      result.rejected.push(d);
    }
  }

  return result;
}

// Get unique domains from sources
function antigravityGetUniqueDomains(data: AntigravityScrapedSource[]): AntigravityScrapedSource[] {
  const unique: AntigravityScrapedSource[] = [];
  const seen = new Set<string>();

  for (const d of data) {
    try {
      const domain = new URL(d.url).hostname.replace('www.', '');
      if (!seen.has(domain)) {
        seen.add(domain);
        unique.push(d);
      }
    } catch (e) {
      unique.push(d);
    }
  }

  return unique;
}

// Use AI to analyze scraped sources and extract verified ingredient lists
// EXACT COPY of prompt from native antigravity app (antigravity search copy/barcode-app/src/app/lib/ai.ts)
async function antigravityAnalyzeWithAI(
  scrapedData: AntigravityScrapedSource[],
  addLog?: (msg: string) => void,
  brandName?: string,
  productName?: string,
  barcode?: string
): Promise<AntigravityAnalysisResult | null> {
  const log = addLog || console.log;
  if (!ANTHROPIC_API_KEY) {
    log('[Antigravity] No Anthropic API key');
    return null;
  }

  try {
    // EXACT prompt from native antigravity ai.ts lines 35-84
    const prompt = `
    You are a food ingredient expert. I will provide you with scraped text from multiple websites for a specific food product.

    Target Product: "${brandName || ''} ${productName || ''}".
    Target Barcode: "${barcode || ''}".
    
    Your task is to:
    1. Identify the product name AND BRAND. If you cannot find a clear product name, use "Product Analysis".
       - VERIFY that the source is for this specific product (or very similar variant).
       - CHECK THE BRAND: Ensure the target brand (or a close variant) is mentioned in the source.
       - ALLOW PARENT COMPANIES: Do NOT reject the source just because other company names are present (they might be parent companies or distributors).
       - REJECT ONLY IF: The target brand is COMPLETELY MISSING and the source is clearly for a competitor brand (e.g. target is 'Pacific Foods' but source is ONLY 'Brodo').
       - CHECK FOR BARCODE: Look for the barcode "${barcode || 'N/A'}" in the text. If the barcode is present, it is a high-quality source.
       - FILTER RECIPES: If the source does NOT contain the barcode AND looks like a home recipe (e.g. "instructions", "prep time", "cook time"), return "ingredients: []".
       - If the text is for a different brand or a significantly different product, return "ingredients: []".
    2. Extract the ingredient list from EACH source.
       - Look for "Ingredients:", "Contains:", or lists of food items.
       - Ingredients MUST be specific food items (e.g. "Water", "Beef", "Salt").
       - DO NOT extract sentences, marketing slogans, descriptions, or metadata as ingredients.
       - BAD EXAMPLES (Return []):
         - "at prices you can get down with" (Sentence)
         - "for a rich, versatile flavor that elevates every dish" (Marketing)
         - "11-digit NDC, Product Name, Ingredients" (Metadata/Header)
         - "Gelatins, Puddings" (Category tags)
       - IGNORE "free from" lists (e.g. "No artificial flavors", "Gluten free").
       - IGNORE recipes (e.g. "1 cup flour", "2 eggs").
       - If the text seems to be for a different product or brand, return "ingredients: []".
       - IMPORTANT: You MUST populate the "ingredients" array for every source where text is found. Do not leave it empty if you used the text to build the unified list.
       - CRITICAL: Your "sources" array MUST have the exact same number of items as the input. Map every input source to an output source.
       - If a source has no ingredients, return it with "ingredients: []". DO NOT DROP IT.
    3. Create a "unified" ingredient list from the sources.
       - YOUR PRIMARY GOAL IS TO RETURN THIS LIST.
       - Scan ALL sources. If ANY source contains a valid ingredient list, you MUST populate "unifiedIngredientList".
       - Select the most complete and detailed list found.
       - COPY that list exactly into "unifiedIngredientList".
       - Do NOT leave "unifiedIngredientList" empty if any source has ingredients.
       - CLEAN the ingredients: Remove trailing text like "Product Details", "Additional Info", "Certified Organic", or punctuation.
       - Example: "Black Pepper (Organic).\nPRODUCT DETAILS" -> "Black Pepper (Organic)"
    4. Check the unified list for ONLY these top 9 allergens: Milk, Eggs, Fish, Crustacean Shellfish, Tree Nuts, Peanuts, Wheat, Soybeans, Sesame.
       - Return a list of objects with "allergen" and "trigger".
       - The "trigger" MUST be the specific ingredient from the list that causes the allergen warning (e.g., allergen: "Wheat", trigger: "Enriched Flour").
       - Do not leave "trigger" empty.
       - Do NOT include any other allergens (e.g., no Coconut, no Mustard, no Celery).
       - CRITICAL: You MUST list the specific ingredients (triggers) that caused the allergen to be flagged.
       - Do NOT return simple strings like ["milk"]. Return objects with "allergen" and "trigger".
    5. Analyze the unified list for dietary compliance (Vegan, Vegetarian, Pescatarian, Gluten-Free).
       - Return isCompliant (boolean), reason (string), and trigger (string).
        - IF NOT COMPLIANT: You MUST identify the specific ingredient (trigger).
          - Example: {"isCompliant": false, "reason": "Contains Honey", "trigger": "Honey"}
          - CRITICAL: For the "reason" field, you MUST list the SPECIFIC ingredients that violate the diet.
          - DO NOT use generic phrases like "Contains dairy" or "Animal products".
          - CORRECT: "reason": "Pasteurized Lowfat Milk, Nonfat Milk"
          - INCORRECT: "reason": "Contains dairy products"
          - Do not use "Unknown ingredient" if you can find the specific item.

    6. Identify discrepancies between sources.
       - Compare each source's ingredient list to the "unifiedIngredientList".
       - IGNORE qualifiers like "Organic", "Natural", "Fresh", or "Contains 2% or less of".
         - Example: "Organic Carrots" matches "Carrots". This is NOT a discrepancy.
       - STRICTLY report ANY ingredient that is completely MISSING from a source.
         - Example: Source A has "Carrots", Source B does NOT. This IS a discrepancy.
         - Example: Source A has "Carrot Juice Concentrate", Source B has "Carrots". This IS a discrepancy (different form).
       - CHECK FOR COUNT MISMATCHES: If Source A has 20 ingredients and Source B has 10, there ARE discrepancies. Find them.
       - Return: { ingredient: "Name", presentIn: ["url1"], missingIn: ["url2"], note: "Optional explanation" }
       - If a source lists "Spices" and another lists specific spices, report it as a discrepancy.

    7. Extract a product image URL.
       - Look for a high-quality image URL of the product in the sources.
       - Prefer clear, isolated product shots.
       - Return "productImage": "https://..." or null if none found.

    IMPORTANT: You MUST return a valid JSON object matching the schema.

    Here is the data:
    ${JSON.stringify(scrapedData.map(s => ({ url: s.url, content: s.content.substring(0, 5000) })))}
  `;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }]
      }),
    });

    if (!response.ok) {
      console.log(`[Antigravity] AI analysis failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    // Log raw AI response for debugging
    console.log('[Antigravity] Raw AI response length:', content.length);
    console.log('[Antigravity] Raw AI response (first 2000 chars):', content.substring(0, 2000));

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[Antigravity] Failed to parse AI response - no JSON found');
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);

    // Log parsed result for debugging
    console.log('[Antigravity] Parsed top9Allergens:', JSON.stringify(result.top9Allergens));
    console.log('[Antigravity] Parsed allergens:', JSON.stringify(result.allergens));
    console.log('[Antigravity] Parsed dietaryCompliance:', JSON.stringify(result.dietaryCompliance));

    // Post-processing to handle various AI response formats

    // Helper to format allergens (handles both object and string formats)
    const formatAllergens = (val: any): string[] => {
      if (!Array.isArray(val)) return [];
      return val.map(item => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          const allergen = item.allergen || item.name || 'Unknown';
          const trigger = item.trigger || item.source;
          return trigger ? `${allergen} (${trigger})` : allergen;
        }
        return String(item);
      });
    };

    // Helper to ensure array of strings (for ingredients)
    const ensureStringArray = (val: any): string[] => {
      if (Array.isArray(val)) {
        return val.flatMap(item => {
          const str = String(item);
          return str.includes(',') ? str.split(',').map(s => s.trim()).filter(s => s.length > 0) : [str];
        });
      }
      if (typeof val === 'string') {
        // If it's a comma-separated string, split it
        if (val.includes(',')) {
          return val.split(',').map(s => s.trim()).filter(s => s.length > 0);
        }
        return [val];
      }
      return [];
    };

    // Helper to coerce boolean (handles string "true"/"false" from AI)
    const coerceBool = (val: any) => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') return val.toLowerCase() === 'true';
      return false;
    };

    // Get allergens - AI might use different field names
    const rawAllergens = result.top9Allergens || result.allergens || result.detectedAllergens || [];
    console.log('[Antigravity] Using allergens from:', result.top9Allergens ? 'top9Allergens' : result.allergens ? 'allergens' : 'none');

    // Handle dietaryCompliance - AI returns it as an ARRAY instead of object!
    // Convert array format [{"diet":"Vegan","isCompliant":true},...] to object format
    let dietaryComplianceObj: any = {
      vegan: { isCompliant: false, reason: '' },
      vegetarian: { isCompliant: false, reason: '' },
      pescatarian: { isCompliant: false, reason: '' },
      glutenFree: { isCompliant: false, reason: '' }
    };

    const rawDc = result.dietaryCompliance;
    if (Array.isArray(rawDc)) {
      // AI returned array format - convert to object
      console.log('[Antigravity] Converting dietaryCompliance from array to object');
      for (const item of rawDc) {
        const dietName = (item.diet || '').toLowerCase().replace('-', '').replace(' ', '');
        if (dietName === 'vegan') {
          dietaryComplianceObj.vegan = { isCompliant: coerceBool(item.isCompliant), reason: item.reason || '' };
        } else if (dietName === 'vegetarian') {
          dietaryComplianceObj.vegetarian = { isCompliant: coerceBool(item.isCompliant), reason: item.reason || '' };
        } else if (dietName === 'pescatarian') {
          dietaryComplianceObj.pescatarian = { isCompliant: coerceBool(item.isCompliant), reason: item.reason || '' };
        } else if (dietName === 'glutenfree') {
          dietaryComplianceObj.glutenFree = { isCompliant: coerceBool(item.isCompliant), reason: item.reason || '' };
        }
      }
    } else if (rawDc && typeof rawDc === 'object') {
      // AI returned object format - use directly
      dietaryComplianceObj = {
        vegan: {
          isCompliant: coerceBool(rawDc.vegan?.isCompliant),
          reason: rawDc.vegan?.reason || ''
        },
        vegetarian: {
          isCompliant: coerceBool(rawDc.vegetarian?.isCompliant),
          reason: rawDc.vegetarian?.reason || ''
        },
        pescatarian: {
          isCompliant: coerceBool(rawDc.pescatarian?.isCompliant),
          reason: rawDc.pescatarian?.reason || ''
        },
        glutenFree: {
          isCompliant: coerceBool(rawDc.glutenFree?.isCompliant),
          reason: rawDc.glutenFree?.reason || ''
        }
      };
    }

    console.log('[Antigravity] Final dietaryComplianceObj:', JSON.stringify(dietaryComplianceObj));

    // If AI didn't return allergens, detect them from ingredients
    let finalAllergens = formatAllergens(rawAllergens);
    if (finalAllergens.length === 0 && result.unifiedIngredientList) {
      console.log('[Antigravity] No allergens from AI, detecting from ingredients...');
      const ingredients = ensureStringArray(result.unifiedIngredientList);
      const ingredientsLower = ingredients.map(i => i.toLowerCase()).join(' ');

      // Detect top 9 allergens from ingredient text
      const allergenKeywords: { [key: string]: string[] } = {
        'Wheat': ['wheat', 'flour', 'gluten', 'barley', 'semolina', 'durum'],
        'Soybeans': ['soy', 'soya', 'soybean', 'edamame', 'tofu'],
        'Milk': ['milk', 'dairy', 'cream', 'butter', 'cheese', 'whey', 'casein', 'lactose'],
        'Eggs': ['egg', 'albumin', 'mayonnaise'],
        'Peanuts': ['peanut'],
        'Tree Nuts': ['almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia'],
        'Fish': ['fish', 'salmon', 'tuna', 'cod', 'anchovy', 'tilapia'],
        'Crustacean Shellfish': ['shrimp', 'crab', 'lobster', 'crawfish', 'prawn'],
        'Sesame': ['sesame', 'tahini']
      };

      for (const [allergen, keywords] of Object.entries(allergenKeywords)) {
        for (const keyword of keywords) {
          if (ingredientsLower.includes(keyword)) {
            // Find the actual ingredient that triggered this
            const trigger = ingredients.find(i => i.toLowerCase().includes(keyword)) || keyword;
            finalAllergens.push(`${allergen} (${trigger})`);
            break;
          }
        }
      }
      console.log('[Antigravity] Detected allergens:', finalAllergens);
    }

    // POST-PROCESSING: Fix incorrect AI dietary compliance based on actual allergens detected
    // The AI often incorrectly flags Vegetarian/Pescatarian for dairy products
    const ingredients = ensureStringArray(result.unifiedIngredientList);
    const ingredientsLower = ingredients.map(i => i.toLowerCase()).join(' ');

    // Detect what's actually in the product
    const hasMeat = /\b(beef|steak|pork|bacon|ham|chicken|turkey|duck|lamb|veal|sausage|pepperoni|chorizo|pastrami|brisket)\b/i.test(ingredientsLower);
    const hasFish = /\b(fish|salmon|tuna|cod|anchovy|anchovies|sardine|trout|tilapia|halibut|mahi|snapper)\b/i.test(ingredientsLower);
    const hasShellfish = /\b(shrimp|prawn|lobster|crab|clam|mussel|scallop|oyster)\b/i.test(ingredientsLower);
    const hasGelatin = /\b(gelatin|gelatine|collagen)\b/i.test(ingredientsLower);
    const hasDairy = /\b(milk|cream|butter|cheese|yogurt|whey|casein|lactose|kefir)\b/i.test(ingredientsLower);
    const hasEgg = /\b(egg|yolk|albumen)\b/i.test(ingredientsLower);
    const hasHoney = /\b(honey)\b/i.test(ingredientsLower);
    const hasGluten = /\b(wheat|flour|barley|rye|malt|semolina|spelt|farro|bulgur|couscous|seitan)\b/i.test(ingredientsLower);

    // Helper to get triggering ingredients
    const getTriggers = (pattern: RegExp): string[] => {
      return ingredients.filter(i => pattern.test(i.toLowerCase()));
    };

    // VEGETARIAN: Compatible with dairy, eggs, honey. NOT compatible with meat, fish, shellfish, gelatin
    if (hasMeat || hasFish || hasShellfish || hasGelatin) {
      const triggers = [
        ...getTriggers(/beef|steak|pork|bacon|ham|chicken|turkey|duck|lamb|veal|sausage|pepperoni|chorizo|pastrami|brisket/i),
        ...getTriggers(/fish|salmon|tuna|cod|anchovy|anchovies|sardine|trout|tilapia|halibut|mahi|snapper/i),
        ...getTriggers(/shrimp|prawn|lobster|crab|clam|mussel|scallop|oyster/i),
        ...getTriggers(/gelatin|gelatine|collagen/i)
      ];
      dietaryComplianceObj.vegetarian = { isCompliant: false, reason: triggers.join(', ') };
    } else {
      dietaryComplianceObj.vegetarian = { isCompliant: true, reason: '' };
    }

    // PESCATARIAN: Compatible with dairy, eggs, honey, fish, shellfish. NOT compatible with meat, gelatin
    if (hasMeat || hasGelatin) {
      const triggers = [
        ...getTriggers(/beef|steak|pork|bacon|ham|chicken|turkey|duck|lamb|veal|sausage|pepperoni|chorizo|pastrami|brisket/i),
        ...getTriggers(/gelatin|gelatine|collagen/i)
      ];
      dietaryComplianceObj.pescatarian = { isCompliant: false, reason: triggers.join(', ') };
    } else {
      dietaryComplianceObj.pescatarian = { isCompliant: true, reason: '' };
    }

    // VEGAN: Not compatible with ANY animal products
    if (hasDairy || hasEgg || hasMeat || hasFish || hasShellfish || hasHoney || hasGelatin) {
      const triggers = [
        ...getTriggers(/milk|cream|butter|cheese|yogurt|whey|casein|lactose|kefir/i),
        ...getTriggers(/egg|yolk|albumen/i),
        ...getTriggers(/beef|steak|pork|bacon|ham|chicken|turkey|duck|lamb|veal|sausage|pepperoni|chorizo|pastrami|brisket/i),
        ...getTriggers(/fish|salmon|tuna|cod|anchovy|anchovies|sardine|trout|tilapia|halibut|mahi|snapper/i),
        ...getTriggers(/shrimp|prawn|lobster|crab|clam|mussel|scallop|oyster/i),
        ...getTriggers(/honey/i),
        ...getTriggers(/gelatin|gelatine|collagen/i)
      ];
      dietaryComplianceObj.vegan = { isCompliant: false, reason: triggers.join(', ') };
    } else {
      dietaryComplianceObj.vegan = { isCompliant: true, reason: '' };
    }

    // GLUTEN-FREE: Not compatible with wheat/gluten
    if (hasGluten) {
      const triggers = getTriggers(/wheat|flour|barley|rye|malt|semolina|spelt|farro|bulgur|couscous|seitan/i);
      dietaryComplianceObj.glutenFree = { isCompliant: false, reason: triggers.join(', ') };
    } else {
      dietaryComplianceObj.glutenFree = { isCompliant: true, reason: '' };
    }

    console.log('[Antigravity] Post-processed dietaryComplianceObj:', JSON.stringify(dietaryComplianceObj));

    // Derive diets list from dietaryCompliance
    const diets: string[] = [];
    if (dietaryComplianceObj) {
      Object.entries(dietaryComplianceObj).forEach(([diet, data]: [string, any]) => {
        if (data && (data.isCompliant === true || data.is_compliant === true)) {
          diets.push(diet);
        }
      });
    }

    // Post-processing result
    const processedObject = {
      productName: result.productName || 'Unknown Product',
      productImage: result.productImage || '',
      unifiedIngredientList: ensureStringArray(result.unifiedIngredientList),
      top9Allergens: finalAllergens,
      differences: Array.isArray(result.differences) ? result.differences : [],
      sources: (result.sources || []).map((source: any) => ({
        url: source.url || '',
        ingredients: ensureStringArray(source.ingredients),
        hasIngredients: coerceBool(source.hasIngredients) || (ensureStringArray(source.ingredients).length > 0)
      })),
      dietaryCompliance: dietaryComplianceObj,
      diets: diets
    };

    console.log('[Antigravity] Final top9Allergens:', JSON.stringify(processedObject.top9Allergens));
    console.log('[Antigravity] Final dietaryCompliance:', JSON.stringify(processedObject.dietaryCompliance));

    return processedObject;
  } catch (error) {
    console.log(`[Antigravity] AI analysis error: ${(error as any).message}`);
    return null;
  }
}

// Main antigravity search pipeline
async function antigravitySearchForBrandProduct(
  barcode: string,
  productName: string,
  brandName: string,
  addLog?: (msg: string) => void
): Promise<{
  source: IngredientSource | null;
  additionalSources: IngredientSource[];
  analysis: AntigravityAnalysisResult | null;
}> {
  const log = addLog || console.log;
  log(`\n=== Antigravity Search for: ${brandName} ${productName} ===`);

  const allVisitedUrls = new Set<string>();
  let verifiedSources: AntigravityScrapedSource[] = [];
  const allRejectedSources: AntigravityScrapedSource[] = []; // Accumulate rejected sources
  const sourceIngredientsMap = new Map<string, string[]>(); // Persist ingredients found during verification
  const TARGET_SOURCES = 5;
  const MAX_CYCLES = 5;

  let knownTitle = productName ? `${brandName} ${productName}`.trim() : '';

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    const needed = TARGET_SOURCES - verifiedSources.length;
    if (needed <= 0) break;

    log(`[Antigravity] Cycle ${cycle}/${MAX_CYCLES}: Looking for ${needed} more sources...`);

    // Build search queries based on cycle
    const queries: string[] = [];

    if (cycle === 1) {
      // Cycle 1: High precision
      if (barcode) queries.push(`${barcode} ingredients`);
      if (knownTitle) queries.push(`${knownTitle} ingredients`);
      if (brandName && productName) queries.push(`${brandName} ${productName} ingredients`);
    } else if (cycle === 2) {
      // Cycle 2: Broader search
      if (productName) queries.push(`${productName} ingredients label`);
      if (knownTitle) queries.push(`${knownTitle} nutrition facts`);
      if (brandName && productName) queries.push(`${brandName} ${productName} food label`);
    } else {
      // Cycle 3: Catch-all / alternative terms
      if (productName) queries.push(`${productName} contents`);
      if (knownTitle) queries.push(`${knownTitle} ingredients text`);
      if (brandName) queries.push(`${brandName} products ingredients`);
    }

    // Search all engines in parallel
    const searchPromises = queries.flatMap(query => [
      antigravitySearchYahoo(query, addLog),
      antigravitySearchBing(query, addLog),
      antigravitySearchGoogle(query, addLog),
      antigravitySearchDDGLite(query, addLog)
    ]);

    const searchResults = await Promise.all(searchPromises);
    const allUrls = new Set<string>();
    searchResults.flat().forEach(url => {
      if (!allVisitedUrls.has(url)) {
        allUrls.add(url);
        allVisitedUrls.add(url);
      }
    });

    // Add direct lookups
    const directLookups = [
      `https://world.openfoodfacts.org/product/${barcode}`,
      `https://www.barcodelookup.com/${barcode}`,
      `https://go-upc.com/search?q=${barcode}`
    ];

    for (const url of directLookups) {
      if (!allVisitedUrls.has(url)) {
        allUrls.add(url);
        allVisitedUrls.add(url);
      }
    }

    if (allUrls.size === 0) {
      console.log('[Antigravity] No new URLs found');
      continue;
    }

    // Scrape URLs
    const urlsToScrape = Array.from(allUrls).slice(0, 15);
    const scraped = await antigravityScrapeUrls(urlsToScrape, addLog);

    if (scraped.length === 0) continue;

    // Extract title if we don't have one
    if (!knownTitle) {
      knownTitle = antigravityExtractBestTitle(scraped);
    }

    // Filter by relevance
    const { valid, rejected } = antigravityFilterData(scraped, knownTitle);

    // Accumulate rejected sources for later fallback
    allRejectedSources.push(...rejected);

    // Get unique domains
    let uniqueValid = antigravityGetUniqueDomains(valid);

    // Filter by barcode presence OR (Brand + Product Name)
    if (uniqueValid.length > 0) {
      const initialCount = uniqueValid.length;
      uniqueValid = uniqueValid.filter(s => {
        const content = s.content.toLowerCase();
        const hasBarcode = content.includes(barcode);

        // Also allow if it has BOTH brand and product name (if we know them)
        let hasBrandAndProduct = false;
        if (brandName && productName) {
          const b = brandName.toLowerCase();
          const p = productName.toLowerCase();

          // Check for brand presence
          if (content.includes(b)) {
            // Token-based product name matching
            // Remove commas and extra spaces, split into words
            const tokens = p.replace(/,/g, '').split(/\s+/).filter(t => t.length > 2); // Ignore very short words
            if (tokens.length > 0) {
              const matchedTokens = tokens.filter(t => content.includes(t));
              const matchRatio = matchedTokens.length / tokens.length;
              // Require 60% of significant words to be present
              if (matchRatio >= 0.6) {
                hasBrandAndProduct = true;
              }
            } else {
              // Fallback for very short product names (1-2 chars?) - strict match
              hasBrandAndProduct = content.includes(p);
            }
          }
        }

        return hasBarcode || hasBrandAndProduct;
      });
      const filteredCount = initialCount - uniqueValid.length;
      if (filteredCount > 0) {
        log(`[Antigravity] Filtered ${filteredCount} sources missing barcode "${barcode}" AND (Brand+Product)`);
      }
    }

    // 4. Verify candidates with AI
    if (uniqueValid.length > 0) {
      log(`[Antigravity] Verifying ${uniqueValid.length} candidates with AI...`);
      log(`[Antigravity] Candidates: ${uniqueValid.map(s => s.url).join(', ')}`);
      const analysis = await antigravityAnalyzeWithAI(uniqueValid, addLog, brandName, productName, barcode);

      if (analysis) {
        const goodSources = analysis.sources.filter(s => s.hasIngredients);
        console.log(`[Antigravity] AI verified ${goodSources.length} sources with ingredients`);
        console.log(`[Antigravity] Accepted: ${goodSources.map(s => s.url).join(', ')}`);

        for (const s of goodSources) {
          const original = uniqueValid.find(u => u.url === s.url);
          if (original) {
            const domain = new URL(s.url).hostname.replace('www.', '');
            const alreadyHas = verifiedSources.some(v => {
              try {
                return new URL(v.url).hostname.replace('www.', '') === domain;
              } catch { return false; }
            });
            if (!alreadyHas) {
              verifiedSources.push(original);
              // Cache the ingredients we found
              sourceIngredientsMap.set(original.url, s.ingredients);
            }
          }
        }
      }
    }

    // Fallback logic moved to AFTER loop


    console.log(`[Antigravity] Total verified sources: ${verifiedSources.length}`);

    // Check if we have enough sources
    if (verifiedSources.length >= 5) {
      log(`[Antigravity] Found ${verifiedSources.length} potential sources. Running re-verification...`);

      // RE-VERIFICATION: Check if these sources actually hold up together
      const reVerification = await antigravityAnalyzeWithAI(verifiedSources, addLog, brandName, productName, barcode);

      if (reVerification) {
        const validReVerified = reVerification.sources.filter(s => s.hasIngredients);

        if (validReVerified.length >= 5) {
          log(`[Antigravity] Re-verification passed with ${validReVerified.length} sources.`);
          // Filter original sources to keep full objects (content, title)
          const validUrls = new Set(validReVerified.map(s => s.url));
          verifiedSources = verifiedSources.filter(s => validUrls.has(s.url));
          break; // Success!
        } else {
          const droppedCount = verifiedSources.length - validReVerified.length;
          log(`[Antigravity] Re-verification dropped ${droppedCount} sources. Now have ${validReVerified.length}. Resuming search...`);
          // Filter original sources to keep full objects
          const validUrls = new Set(validReVerified.map(s => s.url));
          verifiedSources = verifiedSources.filter(s => validUrls.has(s.url));
        }
      } else {
        log(`[Antigravity] Re-verification failed (AI error). Resuming search...`);
      }
    }
  }

  // Use rejected sources if needed (AFTER trying all cycles)
  if (verifiedSources.length < TARGET_SOURCES && allRejectedSources.length > 0) {
    console.log(`[Antigravity] Filling quota with rejected sources (Found ${verifiedSources.length}, Need ${TARGET_SOURCES})...`);

    allRejectedSources.sort((a, b) => {
      if (a.hasBrand && !b.hasBrand) return -1;
      if (!a.hasBrand && b.hasBrand) return 1;
      return (b.matchCount || 0) - (a.matchCount || 0);
    });

    const rejectedUnique = antigravityGetUniqueDomains(allRejectedSources);
    for (const d of rejectedUnique) { // Try all unique rejected sources until quota filled
      if (verifiedSources.length >= TARGET_SOURCES) break;

      const domain = new URL(d.url).hostname.replace('www.', '');
      const exists = verifiedSources.some(v => {
        try { return new URL(v.url).hostname.replace('www.', '') === domain; }
        catch { return false; }
      });

      if (!exists) {
        verifiedSources.push(d);
      }
    }
  }

  // Check if we have enough sources
  if (verifiedSources.length >= 5) {
    log(`[Antigravity] Found ${verifiedSources.length} potential sources. Running re-verification...`);

    // RE-VERIFICATION: Check if these sources actually hold up together
    const reVerification = await antigravityAnalyzeWithAI(verifiedSources, addLog, brandName, productName, barcode);

    if (reVerification) {
      const validReVerified = reVerification.sources.filter(s => s.hasIngredients);

      if (validReVerified.length >= 5) {
        log(`[Antigravity] Re-verification passed with ${validReVerified.length} sources.`);
        // Filter original sources to keep full objects (content, title)
        const validUrls = new Set(validReVerified.map(s => s.url));
        verifiedSources = verifiedSources.filter(s => validUrls.has(s.url));
        // break; // Success!
      } else {
        const droppedCount = verifiedSources.length - validReVerified.length;
        log(`[Antigravity] Re-verification dropped ${droppedCount} sources. Now have ${validReVerified.length}. Resuming search...`);
        // Filter original sources to keep full objects
        const validUrls = new Set(validReVerified.map(s => s.url));
        verifiedSources = verifiedSources.filter(s => validUrls.has(s.url));
      }
    } else {
      log(`[Antigravity] Re-verification failed (AI error). Resuming search...`);
    }
  }

  if (verifiedSources.length === 0) {
    console.log('[Antigravity] No verified sources found');
    return { source: null, additionalSources: [], analysis: null };
  }

  // Final analysis of all verified sources
  log(`[Antigravity] Final analysis of ${verifiedSources.length} sources...`);
  const finalAnalysis = await antigravityAnalyzeWithAI(verifiedSources, addLog, brandName, productName, barcode);

  if (!finalAnalysis || finalAnalysis.unifiedIngredientList.length === 0) {
    console.log('[Antigravity] Failed to extract unified ingredients');
    return { source: null, additionalSources: [], analysis: null };
  }

  console.log(`[Antigravity] ✓ Found ${finalAnalysis.unifiedIngredientList.length} ingredients from ${verifiedSources.length} sources`);

  // Build the primary source
  const ingredientsText = finalAnalysis.unifiedIngredientList.join(', ');
  const primarySource: IngredientSource = {
    sourceName: 'Antigravity Web Search',
    url: verifiedSources[0]?.url || '',
    ingredientsText: ingredientsText,
    productName: finalAnalysis.productName || productName || 'Unknown Product',
    productImage: finalAnalysis.productImage || '',
    allergenStatement: finalAnalysis.top9Allergens.length > 0
      ? `Contains: ${finalAnalysis.top9Allergens.join(', ')}`
      : undefined
  };

  // Build additional sources
  const additionalSources: IngredientSource[] = verifiedSources.slice(1).map((s, i) => {
    const analysisSource = finalAnalysis.sources.find(as => as.url === s.url);
    // Use ingredients from final analysis, or fallback to what we found during verification
    const ingredients = (analysisSource?.ingredients && analysisSource.ingredients.length > 0)
      ? analysisSource.ingredients
      : sourceIngredientsMap.get(s.url) || [];

    return {
      sourceName: `Web Source ${i + 2}`,
      url: s.url,
      ingredientsText: ingredients.join(', '),
      productName: finalAnalysis.productName
    };
  }).filter(s => s.ingredientsText.length > 0);

  return { source: primarySource, additionalSources, analysis: finalAnalysis };
}

// =============================================================================
// END ANTIGRAVITY SEARCH SYSTEM
// =============================================================================

// Helper to normalize ingredient text for comparison (token-based)
function normalizeForTokens(text: string): string[] {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents (e.g. Purée -> Puree)
    .replace(/organic|natural|fresh|contains 2% or less of/g, '')
    .replace(/[^a-z0-9\s]/g, '') // Keep spaces, remove punctuation
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => t.replace(/s$/, '')); // Simple singularization (e.g. leaves -> leave, roots -> root)
}

// Helper to check if two ingredients are similar enough to be considered the same
function areIngredientsSimilar(a: string, b: string): boolean {
  const tokensA = normalizeForTokens(a);
  const tokensB = normalizeForTokens(b);

  if (tokensA.length === 0 || tokensB.length === 0) return false;

  // Check for subset (all tokens of one are present in the other)
  // e.g. "Ground Bay Leaf" (ground, bay, leaf) vs "Bay Leaves" (bay, leave)
  // "bay" matches "bay", "leaf" matches "leave" (singularized)
  const aInB = tokensA.every(t => tokensB.some(tb => tb.includes(t) || t.includes(tb)));
  const bInA = tokensB.every(t => tokensA.some(ta => ta.includes(t) || t.includes(ta)));

  if (aInB || bInA) return true;

  // Check for significant overlap (e.g. 2/3 tokens match)
  const intersection = tokensA.filter(t => tokensB.some(tb => tb === t || tb.includes(t) || t.includes(tb)));
  // If we have at least 2 matching tokens, or if it's a single token match for short strings
  if (intersection.length >= 2) return true;
  if (tokensA.length === 1 && tokensB.length === 1 && intersection.length === 1) return true;

  return false;
}

// Helper to calculate discrepancies programmatically
function calculateDiscrepancies(
  unifiedList: string[],
  sources: Array<{ url: string, ingredients: string[] }>
): Array<{ ingredient: string, presentIn: string[], missingIn: string[], note?: string }> {
  const differences: Array<{ ingredient: string, presentIn: string[], missingIn: string[], note?: string }> = [];

  // Check for missing ingredients in each source
  for (const item of unifiedList) {
    const presentIn: string[] = [];
    const missingIn: string[] = [];

    for (const source of sources) {
      // Check if source has this ingredient using robust matching
      const hasIngredient = source.ingredients.some(si => areIngredientsSimilar(si, item));

      if (hasIngredient) {
        presentIn.push(source.url);
      } else {
        missingIn.push(source.url);
      }
    }

    // If missing in some but present in others, it's a discrepancy
    if (missingIn.length > 0 && presentIn.length > 0) {
      differences.push({
        ingredient: item,
        presentIn,
        missingIn,
        note: 'Detected programmatically'
      });
    }
  }
  return differences;
}

// Helper to search for product image
async function searchProductImage(productName: string, brandName: string, addLog?: (msg: string) => void): Promise<string | undefined> {
  const query = `${brandName} ${productName} product image`;
  const results = await antigravitySearchGoogle(query, addLog);

  // Try to find an image URL in the results by scraping the top result
  if (results.length > 0) {
    // Prefer results that look like product pages
    const bestResult = results.find(url => !url.includes('youtube') && !url.includes('facebook')) || results[0];
    const scraped = await antigravityScrapeUrl(bestResult);
    if (scraped && scraped.productImage) {
      return scraped.productImage;
    }
  }
  return undefined;
}

// Main barcode lookup function
// Uses Antigravity Web Search - Multi-engine web scraping to find 5 verified sources
async function lookupBarcode(barcode: string, addLog?: (msg: string) => void): Promise<BarcodeLookupResult> {
  const log = addLog || console.log;
  log(`\n=== Barcode Lookup: ${barcode} ===`);
  log(`🚀 Using Antigravity Web Search...`);
  const startTime = Date.now();

  // Run Antigravity search immediately - searches Yahoo, Bing, Google, DuckDuckGo
  // and scrapes up to 5 verified sources with AI verification
  try {
    // First, try to get brand and product name from databases to guide the search
    let brandName = '';
    let productName = '';

    // Try Open Food Facts first
    const offResult = await fetchFromOpenFoodFacts(barcode);
    if (offResult.source) {
      brandName = offResult.brand || '';
      productName = offResult.source.productName || '';
      log(`Found in Open Food Facts: ${brandName} ${productName}`);
    }

    // If no brand from OFF, try FoodData Central
    if (!brandName) {
      const fdcResult = await fetchFromFoodDataCentral(barcode);
      if (fdcResult.source) {
        brandName = fdcResult.brand || '';
        productName = fdcResult.productName || '';
        log(`Found in FoodData Central: ${brandName} ${productName}`);
      }
    }

    const antigravityResult = await antigravitySearchForBrandProduct(barcode, productName, brandName, addLog);
    log(`Time after Antigravity search: ${Date.now() - startTime}ms`);

    if (!antigravityResult.source) {
      log('❌ Antigravity: No verified sources found');
      log(`Total time: ${Date.now() - startTime}ms`);

      return {
        success: false,
        needsPhoto: true,
        message: 'Product not found. Please take a photo of the ingredient list.'
      };
    }

    // Build sources array
    const allSources: IngredientSource[] = [antigravityResult.source];
    for (const additionalSource of antigravityResult.additionalSources) {
      allSources.push(additionalSource);
    }

    const finalProductName = antigravityResult.source.productName || '';
    const ingredientsText = antigravityResult.source.ingredientsText || '';

    console.log(`✅ Antigravity: Found ${allSources.length} verified sources`);
    console.log(`Product: "${finalProductName}"`);
    console.log(`Total time: ${Date.now() - startTime}ms`);

    // Extract clean ingredient names
    const extractedIngredientNames = await extractIngredientNames(ingredientsText);

    // Enforce minimum source count for high confidence
    if (allSources.length < 5) {
      log(`❌ Antigravity: Only found ${allSources.length} sources. Enforcing 5 source minimum.`);
      return {
        success: false,
        needsPhoto: true,
        message: `Found only ${allSources.length} verified sources. Please take a photo for better accuracy.`
      };
    }

    // Build success message
    const successMessage = `Found ${allSources.length} verified sources with matching ingredients.`;

    // Include full antigravity analysis data
    const analysis = antigravityResult.analysis;

    // Calculate discrepancies programmatically
    const calculatedDifferences = (analysis && analysis.sources)
      ? calculateDiscrepancies(analysis.unifiedIngredientList, analysis.sources)
      : (analysis?.differences || []);

    // Ensure we have a product image
    let finalProductImage = antigravityResult.source.productImage || '';
    if (!finalProductImage && finalProductName) {
      log(`[Antigravity] No image found in sources. Searching for image...`);
      const foundImage = await searchProductImage(finalProductName, antigravityResult.source.brand || '', log);
      if (foundImage) {
        finalProductImage = foundImage;
        log(`[Antigravity] Found image via search: ${foundImage}`);
      }
    }

    return {
      success: true,
      needsPhoto: false,
      productName: finalProductName,
      productImage: finalProductImage,
      brand: '',
      ingredientList: ingredientsText,
      ingredientNames: extractedIngredientNames,
      sources: allSources,
      message: successMessage,
      consistencyInfo: {
        totalSources: allSources.length,
        matchingSources: (calculatedDifferences.length > 0) ? 0 : allSources.length,
        differentSources: (calculatedDifferences.length > 0) ? allSources.length : 0,
        differences: calculatedDifferences
      },
      // Antigravity analysis data for frontend display
      unifiedIngredientList: analysis?.unifiedIngredientList || [],
      top9Allergens: analysis?.top9Allergens || [],
      allergens: analysis?.top9Allergens || [],
      dietaryCompliance: analysis?.dietaryCompliance,
      sourceDifferences: calculatedDifferences
    };

  } catch (error) {
    console.log(`❌ Antigravity search error: ${(error as any).message}`);
    console.log(`Total time: ${Date.now() - startTime}ms`);

    return {
      success: false,
      needsPhoto: true,
      message: `Error during search: ${(error as any).message}. Please take a photo of the ingredient list.`
    };
  }
}

// Use Claude to compare ingredient lists from multiple sources and extract consensus
async function compareIngredientListsWithClaude(
  sources: IngredientSource[],
  productName: string,
  brandName: string
): Promise<{ consensusIngredients: string; agreementLevel: 'full' | 'partial' | 'significant_differences'; differences?: Array<{ sourceName: string; ingredientsText: string; groupSize: number }> } | null> {
  if (!ANTHROPIC_API_KEY) {
    console.log('No Anthropic API key available for comparison');
    return null;
  }

  try {
    // Build the comparison prompt
    const sourcesText = sources.map((s, i) =>
      `Source ${i + 1} (${s.sourceName}):\n${s.ingredientsText}`
    ).join('\n\n');

    const prompt = `Compare these ingredient lists for "${brandName} ${productName}" from ${sources.length} different food databases.

${sourcesText}

Analyze and return JSON only (no other text):
{
  "agreementLevel": "full" | "partial" | "significant_differences",
  "consensusIngredients": "the most accurate/complete ingredient list",
  "analysis": "brief explanation of any differences found"
}

RULES:
- "full": All lists are essentially identical (only minor formatting/punctuation differences)
- "partial": Lists mostly agree but have minor differences (e.g., one missing a sub-ingredient)
- "significant_differences": Lists have major differences that affect allergen/dietary analysis
- For consensusIngredients, use the most complete and accurate list
- If lists differ significantly, prefer the source with more detail (parenthetical sub-ingredients)`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }]
      }),
    });

    if (!response.ok) {
      console.log(`Claude comparison API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('Could not parse Claude comparison response');
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);

    console.log(`Agreement level: ${result.agreementLevel}`);
    if (result.analysis) {
      console.log(`Analysis: ${result.analysis}`);
    }

    // Build differences array for consistency info
    const differences = sources.map(s => ({
      sourceName: s.sourceName,
      ingredientsText: s.ingredientsText,
      groupSize: 1
    }));

    return {
      consensusIngredients: result.consensusIngredients,
      agreementLevel: result.agreementLevel,
      differences: differences
    };

  } catch (error) {
    console.log('Claude comparison error:', (error as any).message);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendSSE = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      const addLog = (message: string) => {
        console.log(message);
        sendSSE('log', { message });
      };

      try {
        let requestData;
        try {
          requestData = await req.json();
        } catch (parseError) {
          console.error('Failed to parse request JSON:', parseError);
          sendSSE('error', { message: 'Invalid JSON in request body' });
          controller.close();
          return;
        }

        const { barcode } = requestData;

        if (!barcode || !barcode.trim()) {
          sendSSE('error', { message: 'Barcode is required' });
          controller.close();
          return;
        }

        // Add timeout handling (2 minutes max)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout - lookup took too long')), 120000)
        );

        const lookupPromise = lookupBarcode(barcode.trim(), addLog).catch(err => {
          console.error('Error in lookupBarcode function:', err);
          throw err;
        });

        const result = await Promise.race([lookupPromise, timeoutPromise]);

        // Ensure result is valid
        if (!result || typeof result !== 'object') {
          throw new Error('Lookup returned invalid result');
        }

        sendSSE('result', result);
        controller.close();

      } catch (error: any) {
        console.error('Error in lookup-barcode:', error);
        console.error('Error stack:', error.stack);

        const errorMessage = error.message?.includes('timeout')
          ? 'Lookup took too long. Please try again or take a photo of the ingredient list.'
          : `Error: ${error.message || 'Unknown error'}. Please take a photo of the ingredient list.`;

        sendSSE('error', { message: errorMessage });
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
    }
  });
});

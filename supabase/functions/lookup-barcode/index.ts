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
const BARCODE_LOOKUP_API_KEY = Deno.env.get('BARCODE_LOOKUP_API_KEY');

// Cache for FatSecret access token (expires after ~24 hours)
let fatSecretAccessToken: string | null = null;
let fatSecretTokenExpiry: number = 0;

// Fetch product image from UPCitemdb.com (free tier: 100 requests/day)
// This is used as a fallback when other sources don't have images
async function fetchProductImageFromUPCitemdb(barcode: string): Promise<string | null> {
  try {
    console.log('[UPCitemdb] Fetching product image for barcode:', barcode);

    const response = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Clarivore-Allergen-App/1.0'
      }
    });

    if (!response.ok) {
      console.log(`[UPCitemdb] Failed with status ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.code === 'OK' && data.items && data.items.length > 0) {
      const item = data.items[0];
      // UPCitemdb returns images array - get the first one
      if (item.images && item.images.length > 0) {
        console.log('[UPCitemdb] Found product image:', item.images[0]);
        return item.images[0];
      }
    }

    console.log('[UPCitemdb] No image found for barcode');
    return null;
  } catch (err) {
    console.log('[UPCitemdb] Error:', (err as any).message);
    return null;
  }
}

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

    // FatSecret barcode endpoint requires Premier tier
    const response = await fetch('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials&scope=premier'
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
async function fetchFromFatSecret(barcode: string): Promise<{ source: IngredientSource | null; brand: string; productName: string; error?: string }> {
  const accessToken = await getFatSecretAccessToken();
  if (!accessToken) {
    return { source: null, brand: '', productName: '', error: 'Failed to get FatSecret access token' };
  }

  try {
    console.log('Trying FatSecret...');

    // FatSecret requires GTIN-13 format (13 digits, zero-padded on the left)
    const paddedBarcode = barcode.padStart(13, '0');
    console.log(`  Using padded barcode: ${paddedBarcode}`);

    // Step 1: Find food by barcode
    const searchUrl = `https://platform.fatsecret.com/rest/food/barcode/find-by-id/v1?barcode=${paddedBarcode}&format=json`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.log(`✗ FatSecret barcode lookup failed: ${searchResponse.status} - ${errorText}`);
      return { source: null, brand: '', productName: '', error: `API error ${searchResponse.status}: ${errorText.substring(0, 100)}` };
    }

    const searchData = await searchResponse.json();

    // Check if food was found
    if (!searchData.food) {
      console.log('✗ FatSecret found no food for this barcode');
      return { source: null, brand: '', productName: '', error: 'Barcode not in FatSecret database' };
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

// Fetch from Barcode Lookup API (barcodelookup.com)
// This is a commercial API with good coverage of US products
async function fetchFromBarcodeLookup(barcode: string): Promise<{ source: IngredientSource | null; brand: string; productName: string; error?: string }> {
  if (!BARCODE_LOOKUP_API_KEY) {
    console.log('✗ Barcode Lookup API key not configured');
    return { source: null, brand: '', productName: '', error: 'API key not configured' };
  }

  try {
    console.log('Trying Barcode Lookup API...');

    const apiUrl = `https://api.barcodelookup.com/v3/products?barcode=${barcode}&key=${BARCODE_LOOKUP_API_KEY}`;

    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`✗ Barcode Lookup API failed: ${response.status} - ${errorText}`);
      return { source: null, brand: '', productName: '', error: `API error ${response.status}` };
    }

    const data = await response.json();

    // Check if products were found
    if (!data.products || data.products.length === 0) {
      console.log('✗ Barcode Lookup found no products for this barcode');
      return { source: null, brand: '', productName: '', error: 'Barcode not in database' };
    }

    const product = data.products[0];
    const productName = product.title || product.product_name || '';
    const brand = product.brand || product.manufacturer || '';

    console.log(`✓ Barcode Lookup found: "${productName}"${brand ? ` (Brand: ${brand})` : ''}`);

    // Extract ingredients if available
    const ingredientsText = product.ingredients || '';

    // Extract other useful fields
    const productImage = product.images?.[0] || '';
    const description = product.description || '';

    if (!ingredientsText || ingredientsText.trim().length < 10) {
      console.log('✓ Barcode Lookup found product but no ingredients');
      return { source: null, brand: brand, productName: productName };
    }

    console.log(`✓ Found ingredients in Barcode Lookup (${ingredientsText.length} chars)`);

    return {
      source: {
        sourceName: 'Barcode Lookup',
        url: `https://www.barcodelookup.com/${barcode}`,
        ingredientsText: ingredientsText.trim(),
        productName: productName,
        productImage: productImage,
        brand: brand
      },
      brand: brand,
      productName: productName
    };
  } catch (err) {
    console.log('✗ Barcode Lookup failed:', (err as any).message);
    return { source: null, brand: '', productName: '', error: (err as any).message };
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
    return links.slice(0, 15);
  } catch (error) {
    log(`  Yahoo search failed: ${(error as any).message}`);
    return [];
  }
}

// Search Ecosia for product URLs (uses Bing's index but different blocking)
async function antigravitySearchEcosia(query: string, addLog?: (msg: string) => void): Promise<string[]> {
  const log = addLog || console.log;
  log(`[Antigravity] Ecosia search: ${query}`);
  try {
    const searchUrl = `https://www.ecosia.org/search?method=index&q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) return [];
    const html = await response.text();

    const links: string[] = [];
    // Ecosia result links have data-test-id="mainline-result-link"
    const linkRegex = /href="(https?:\/\/(?!ecosia\.org)[^"]+)"[^>]*data-test-id="mainline-result-link"/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      if (!links.includes(match[1])) links.push(match[1]);
    }

    // Fallback: look for result links with class patterns
    const fallbackRegex = /<a[^>]+class="[^"]*result__link[^"]*"[^>]*href="(https?:\/\/(?!ecosia)[^"]+)"/gi;
    while ((match = fallbackRegex.exec(html)) !== null) {
      if (!links.includes(match[1])) links.push(match[1]);
    }

    // Another fallback: external https links
    const externalRegex = /href="(https?:\/\/(?!ecosia\.org|www\.ecosia)[^"]+)"/gi;
    while ((match = externalRegex.exec(html)) !== null) {
      const href = match[1];
      if (!href.includes('ecosia.org') && !href.includes('bing.com') && !links.includes(href)) {
        links.push(href);
      }
    }

    log(`  Ecosia found ${links.length} links`);
    return links.slice(0, 15);
  } catch (error) {
    log(`  Ecosia search failed: ${(error as any).message}`);
    return [];
  }
}

// Search Mojeek for product URLs (independent index, good for diversity)
async function antigravitySearchMojeek(query: string, addLog?: (msg: string) => void): Promise<string[]> {
  const log = addLog || console.log;
  log(`[Antigravity] Mojeek search: ${query}`);
  try {
    const searchUrl = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    if (!response.ok) return [];
    const html = await response.text();

    const links: string[] = [];
    // Mojeek uses class="ob" for result links
    const linkRegex = /<a[^>]+class="ob"[^>]*href="(https?:\/\/[^"]+)"/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      if (!links.includes(match[1])) links.push(match[1]);
    }

    // Fallback: any external links in results section
    const fallbackRegex = /href="(https?:\/\/(?!mojeek\.com|www\.mojeek)[^"]+)"/gi;
    while ((match = fallbackRegex.exec(html)) !== null) {
      const href = match[1];
      if (!href.includes('mojeek.com') && !links.includes(href)) {
        links.push(href);
      }
    }

    log(`  Mojeek found ${links.length} links`);
    return links.slice(0, 15);
  } catch (error) {
    log(`  Mojeek search failed: ${(error as any).message}`);
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

// Search Brave for product URLs (better results than Google scraping)
async function antigravitySearchBrave(query: string, addLog?: (msg: string) => void): Promise<string[]> {
  const log = addLog || console.log;
  log(`[Antigravity] Brave search: ${query}`);
  try {
    const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });

    if (!response.ok) return [];
    const html = await response.text();

    const links: string[] = [];
    // Brave uses data-href or href in result links
    const linkRegex = /href="(https?:\/\/(?!search\.brave\.com)[^"]+)"/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      if (!href.includes('brave.com') &&
          !href.includes('youtube.com') &&
          !href.includes('google.com') &&
          !links.includes(href)) {
        links.push(href);
      }
    }

    log(`  Brave found ${links.length} links`);
    return links.slice(0, 15);
  } catch (error) {
    log(`  Brave search failed: ${(error as any).message}`);
    return [];
  }
}

// Search Startpage for product URLs (proxies Google results)
async function antigravitySearchStartpage(query: string, addLog?: (msg: string) => void): Promise<string[]> {
  const log = addLog || console.log;
  log(`[Antigravity] Startpage search: ${query}`);
  try {
    const response = await fetch('https://www.startpage.com/sp/search', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      body: `query=${encodeURIComponent(query)}&cat=web`
    });

    if (!response.ok) return [];
    const html = await response.text();

    const links: string[] = [];
    // Startpage wraps results in specific classes
    const linkRegex = /class="w-gl__result-url[^"]*"[^>]*href="(https?:\/\/[^"]+)"/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      if (!links.includes(match[1])) links.push(match[1]);
    }

    // Fallback: look for result links
    const fallbackRegex = /<a[^>]+class="[^"]*result[^"]*"[^>]*href="(https?:\/\/(?!startpage)[^"]+)"/gi;
    while ((match = fallbackRegex.exec(html)) !== null) {
      if (!links.includes(match[1])) links.push(match[1]);
    }

    // Another fallback: any external links
    const externalRegex = /href="(https?:\/\/(?!startpage|www\.startpage)[^"]+)"/gi;
    while ((match = externalRegex.exec(html)) !== null) {
      const href = match[1];
      if (!href.includes('startpage.com') && !links.includes(href)) {
        links.push(href);
      }
    }

    log(`  Startpage found ${links.length} links`);
    return links.slice(0, 15);
  } catch (error) {
    log(`  Startpage search failed: ${(error as any).message}`);
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
    return links.slice(0, 15);
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
    let { text, title } = parseHtml(html);

    // Extract JSON-LD structured data - many sites include product info for SEO
    const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of jsonLdMatches) {
      try {
        const jsonLd = JSON.parse(match[1]);
        // Handle both single object and array
        const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
        for (const item of items) {
          // Look for Product schema with ingredients
          if (item['@type'] === 'Product' || item['@type']?.includes?.('Product')) {
            if (item.description) {
              text += '\n\n--- Product Schema Description ---\n' + item.description;
            }
            // Some sites put ingredients directly in schema
            if (item.ingredients) {
              const ingStr = Array.isArray(item.ingredients) ? item.ingredients.join(', ') : item.ingredients;
              text += '\n\nIngredients: ' + ingStr;
              console.log(`[JSON-LD] Found ingredients in schema: ${ingStr.substring(0, 100)}...`);
            }
          }
          // Look for NutritionInformation
          if (item['@type'] === 'NutritionInformation' && item.ingredients) {
            text += '\n\nIngredients: ' + item.ingredients;
          }
        }
      } catch (e) {
        // Invalid JSON-LD, skip
      }
    }

    // Extract data from __NEXT_DATA__ (Next.js sites) or similar hydration scripts
    const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        // Recursively search for ingredients in the data
        const searchForIngredients = (obj: any, depth = 0): string | null => {
          if (depth > 10 || !obj) return null;
          if (typeof obj === 'string' && obj.toLowerCase().includes('ingredients')) {
            return obj;
          }
          if (typeof obj === 'object') {
            // Check for common ingredient field names
            for (const key of ['ingredients', 'ingredientList', 'ingredient_list', 'ingredientStatement']) {
              if (obj[key] && typeof obj[key] === 'string' && obj[key].length > 20) {
                return obj[key];
              }
            }
            // Recurse into objects/arrays
            for (const key in obj) {
              const found = searchForIngredients(obj[key], depth + 1);
              if (found) return found;
            }
          }
          return null;
        };
        const foundIngredients = searchForIngredients(nextData);
        if (foundIngredients) {
          text += '\n\n--- NEXT_DATA Ingredients ---\n' + foundIngredients;
          console.log(`[NEXT_DATA] Found ingredients: ${foundIngredients.substring(0, 100)}...`);
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }

    // Look for data in window.__PRELOADED_STATE__ or similar (Redux/Zustand stores)
    const preloadedStateMatch = html.match(/window\.__(?:PRELOADED_STATE__|INITIAL_STATE__|APP_STATE__)__?\s*=\s*({[\s\S]*?});?\s*(?:<\/script>|window\.)/i);
    if (preloadedStateMatch) {
      try {
        const stateData = JSON.parse(preloadedStateMatch[1]);
        const searchForIngredients = (obj: any, depth = 0): string | null => {
          if (depth > 8 || !obj) return null;
          if (typeof obj === 'object') {
            for (const key of ['ingredients', 'ingredientList', 'ingredient_list']) {
              if (obj[key] && typeof obj[key] === 'string' && obj[key].length > 20) {
                return obj[key];
              }
            }
            for (const key in obj) {
              const found = searchForIngredients(obj[key], depth + 1);
              if (found) return found;
            }
          }
          return null;
        };
        const foundIngredients = searchForIngredients(stateData);
        if (foundIngredients) {
          text += '\n\n--- Preloaded State Ingredients ---\n' + foundIngredients;
          console.log(`[PRELOAD] Found ingredients: ${foundIngredients.substring(0, 100)}...`);
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }

    // Special handling for eBay - fetch item description from iframe
    if (url.includes('ebay.com')) {
      // eBay loads descriptions in iframes - try to find and fetch the iframe content
      // Look for iframe src pointing to description (vi.vipr.ebaydesc.com or similar)
      const iframeSrcMatch = html.match(/iframe[^>]+src=["']([^"']*(?:ebaydesc|vi\.vipr)[^"']*)["']/i) ||
                            html.match(/iframe[^>]+src=["']([^"']*desc[^"']*)["']/i);

      if (iframeSrcMatch) {
        try {
          let iframeUrl = iframeSrcMatch[1];
          // Handle relative URLs
          if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;
          else if (iframeUrl.startsWith('/')) iframeUrl = 'https://www.ebay.com' + iframeUrl;

          console.log(`[eBay] Fetching description iframe: ${iframeUrl.substring(0, 100)}...`);
          const iframeResponse = await fetch(iframeUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,*/*',
              'Referer': url
            }
          });

          if (iframeResponse.ok) {
            const iframeHtml = await iframeResponse.text();
            const iframeContent = parseHtml(iframeHtml);
            if (iframeContent.text.length > 100) {
              console.log(`[eBay] Got iframe content: ${iframeContent.text.length} chars`);
              // Append iframe content to main content
              text = text + '\n\n--- Item Description ---\n\n' + iframeContent.text;
            }
          }
        } catch (e) {
          console.log(`[eBay] Failed to fetch iframe: ${(e as any).message}`);
        }
      }

      // Also try eBay's GetSingleItem API if we have an item ID
      const itemIdMatch = url.match(/\/itm\/(\d+)/);
      if (itemIdMatch && !text.toLowerCase().includes('ingredients')) {
        const itemId = itemIdMatch[1];
        // Try the description endpoint directly
        try {
          const descUrl = `https://vi.vipr.ebaydesc.com/ws/eBayISAPI.dll?ViewItemDescV4&item=${itemId}`;
          console.log(`[eBay] Trying direct desc URL for item ${itemId}`);
          const descResponse = await fetch(descUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,*/*',
              'Referer': url
            }
          });
          if (descResponse.ok) {
            const descHtml = await descResponse.text();
            const descContent = parseHtml(descHtml);
            if (descContent.text.length > 100) {
              console.log(`[eBay] Got direct desc: ${descContent.text.length} chars`);
              text = text + '\n\n--- Seller Description ---\n\n' + descContent.text;
            }
          }
        } catch (e) {
          console.log(`[eBay] Direct desc failed: ${(e as any).message}`);
        }
      }
    }

    // Extract og:image
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    const productImage = ogImageMatch ? ogImageMatch[1] : undefined;

    // Check for blocked pages
    let lowerContent = text.toLowerCase();
    const blockKeywords = ['access denied', 'security check', 'captcha', 'robot',
      'human verification', '403 forbidden', '404 not found', 'enable javascript'];

    if (blockKeywords.some(k => lowerContent.includes(k)) && text.length < 500) {
      return null;
    }

    // Skip rendered scraping for now - Jina/Microlink have rate limits that cause issues
    // Sites that need JS rendering (eBay, etc.) will just be filtered out if no ingredients found
    // This keeps the scraping fast and reliable for sites that work with simple fetch

    // Limit content size (reduced to save memory)
    const content = text.substring(0, 8000);

    if (content.length < 50) return null;

    return { url, content, title };
  } catch (error) {
    console.log(`  Failed to scrape ${url}: ${(error as any).message}`);
    return null;
  }
}

// Extract the most ingredient-relevant portion of content
// Instead of blindly taking first N chars, find sections with ingredient keywords
function extractIngredientRelevantContent(content: string, maxLength: number = 10000): string {
  const lowerContent = content.toLowerCase();

  // Keywords that indicate ingredient sections
  const ingredientKeywords = [
    'ingredients:', 'ingredients', 'contains:', 'made with:',
    'allergen', 'nutrition facts', 'nutritional information'
  ];

  // Find all positions where ingredient keywords appear
  const keywordPositions: number[] = [];
  for (const keyword of ingredientKeywords) {
    let pos = lowerContent.indexOf(keyword);
    while (pos !== -1) {
      keywordPositions.push(pos);
      pos = lowerContent.indexOf(keyword, pos + 1);
    }
  }

  // If no ingredient keywords found, return first portion of content
  if (keywordPositions.length === 0) {
    return content.substring(0, maxLength);
  }

  // Sort positions
  keywordPositions.sort((a, b) => a - b);

  // Extract content around keyword positions
  // Take 500 chars before and 3000 chars after each keyword position
  const segments: string[] = [];
  let usedLength = 0;
  const seenRanges: [number, number][] = [];

  for (const pos of keywordPositions) {
    if (usedLength >= maxLength) break;

    const start = Math.max(0, pos - 500);
    const end = Math.min(content.length, pos + 3500);

    // Check if this range overlaps with already extracted ranges
    const overlaps = seenRanges.some(([s, e]) => start < e && end > s);
    if (overlaps) continue;

    seenRanges.push([start, end]);
    const segment = content.substring(start, end);
    segments.push(segment);
    usedLength += segment.length;
  }

  // If we found ingredient sections, return those
  if (segments.length > 0) {
    const result = segments.join('\n\n---\n\n');
    // Also include beginning of content for product name/brand context
    const beginning = content.substring(0, 1500);
    if (!result.includes(beginning.substring(0, 500))) {
      return (beginning + '\n\n---\n\n' + result).substring(0, maxLength);
    }
    return result.substring(0, maxLength);
  }

  return content.substring(0, maxLength);
}

// Scrape a single batch of URLs (5 at a time)
async function antigravityScrapeBatch(urls: string[]): Promise<AntigravityScrapedSource[]> {
  const batchResults = await Promise.all(urls.map(url => antigravityScrapeUrl(url)));
  return batchResults.filter((r): r is AntigravityScrapedSource => r !== null);
}

// Filter sources by barcode or brand+product presence
function antigravityFilterByContent(
  sources: AntigravityScrapedSource[],
  barcode: string,
  brandName: string,
  productName: string,
  seenDomains: Set<string>,
  addLog?: (msg: string) => void
): { passed: AntigravityScrapedSource[], failed: string[] } {
  const log = addLog || console.log;
  const passed: AntigravityScrapedSource[] = [];
  const failed: string[] = [];

  for (const s of sources) {
    // Skip if we already have this domain
    const domain = new URL(s.url).hostname.replace('www.', '');
    if (seenDomains.has(domain)) continue;

    const content = s.content.toLowerCase();
    const hasBarcode = content.includes(barcode);

    let hasBrandAndProduct = false;
    if (brandName && productName) {
      const b = brandName.toLowerCase();
      const p = productName.toLowerCase();
      const hasBrand = content.includes(b);
      if (hasBrand) {
        const tokens = p.replace(/,/g, '').split(/\s+/).filter(t => t.length > 2);
        if (tokens.length > 0) {
          const matchedTokens = tokens.filter(t => content.includes(t));
          if (matchedTokens.length / tokens.length >= 0.6) {
            hasBrandAndProduct = true;
          }
        } else {
          hasBrandAndProduct = content.includes(p);
        }
      }
    }

    if (hasBarcode || hasBrandAndProduct) {
      passed.push(s);
      seenDomains.add(domain);
      log(`[Antigravity] ✓ ${domain} (${hasBarcode ? 'has barcode' : 'has brand+product'})`);
    } else {
      failed.push(domain);
    }
  }

  return { passed, failed };
}

// Extract best title from scraped sources
function antigravityExtractBestTitle(data: AntigravityScrapedSource[]): string {
  const titleBlacklist = [
    'nutrition facts', 'calories in', 'upc lookup', 'barcode lookup',
    'search results', 'item', 'product', 'food', 'amazon.com',
    'walmart.com', 'target.com', 'access denied', 'captcha',
    'page not found', '404', 'error', 'log in', 'sign in',
    'ndc lookup', 'ndc search', 'drug code', 'national drug code',
    'go-upc', 'upcitemdb', 'barcode spider', 'ean lookup'
  ];

  for (const d of data) {
    if (d.title && d.title.length > 5) {
      const titleLower = d.title.toLowerCase();
      if (titleBlacklist.some(term => titleLower.includes(term))) continue;

      let cleanTitle = d.title
        .replace(/UPC\s*\d+/i, '')
        .replace(/Barcode\s*lookup/i, '')
        .replace(/NDC\s*Lookup/i, '')
        .replace(/Go-?UPC/i, '')
        .replace(/UPCitemdb/i, '')
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
// SIMPLIFIED: No title filtering - all sources pass through to content-based filtering
function antigravityFilterData(data: AntigravityScrapedSource[], title: string): {
  valid: AntigravityScrapedSource[];
  rejected: AntigravityScrapedSource[];
} {
  // Pass all sources through - real filtering happens later based on barcode/brand+product in content
  return { valid: data, rejected: [] };
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
    1. For EACH source, determine if it is for the EXACT target product.
       - The source MUST be for "${brandName || ''} ${productName || ''}" specifically.
       - Different flavors, variants, or sizes of the same brand are WRONG. For example:
         - If target is "Momofuku Spicy Noodles", then "Momofuku Soy & Scallion Noodles" is WRONG.
         - If target is "Coca-Cola Classic", then "Coca-Cola Zero" is WRONG.
       - Set "isCorrectProduct": false if the source is for a different variant.
       - Only set "isCorrectProduct": true if you are confident the source matches the exact target product.
       - If the barcode "${barcode || 'N/A'}" appears in the source, it is likely correct.
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
    4. Check the unified list for the FDA top 9 allergens.
       - Return a list of objects with "allergen" and "trigger".
       - The "trigger" MUST be the specific ingredient from the list that causes the allergen warning.
       - Do not leave "trigger" empty.
       - Do NOT include any other allergens (e.g., no Coconut, no Mustard, no Celery).

       EXACT ALLERGEN NAMES - Use these EXACT strings (case-sensitive):
       - "Dairy" (for milk, cream, butter, cheese, whey, casein, lactose, yogurt, kefir)
       - "Egg" (for eggs, egg whites, yolks, albumen, mayonnaise)
       - "Peanut" (for peanuts, peanut butter, peanut oil, groundnuts)
       - "Tree Nut" (for almonds, cashews, walnuts, pecans, pistachios, hazelnuts, macadamia)
       - "Shellfish" (for shrimp, crab, lobster, clams, mussels, scallops, oysters)
       - "Fish" (for fish, salmon, tuna, cod, anchovies, sardines)
       - "Wheat" (for wheat, flour, bread, pasta, barley, rye, malt, semolina)
       - "Soy" (for soy, soya, soybeans, tofu, tempeh, edamame, soy protein, soy lecithin)
       - "Sesame" (for sesame seeds, tahini, sesame oil)

       DO NOT use: "Milk", "Eggs", "Peanuts", "Tree Nuts", "Crustacean Shellfish", "Soybeans", etc.

    5. Analyze the unified list for dietary compliance.
       - Return isCompliant (boolean), reason (string), and trigger (string).

       EXACT DIET NAMES - Use these EXACT strings (case-sensitive):
       - "Vegan"
       - "Vegetarian"
       - "Pescatarian"
       - "Gluten-free"

       DO NOT use "Gluten-Free" (capital F) - use "Gluten-free".

       CRITICAL DIETARY RULES:
       - VEGAN: NOT compatible with animal products ONLY: dairy (milk, cream, butter, cheese, whey, casein, yogurt), eggs, meat, fish, shellfish, honey, gelatin/collagen
         - Tree nuts (almonds, walnuts, cashews, etc.) ARE VEGAN - they are plant-based
         - Peanuts and peanut oil ARE VEGAN - they are plant-based legumes
         - All plant oils ARE VEGAN
         - Soy products ARE VEGAN
       - VEGETARIAN: Compatible with dairy, eggs, honey. NOT compatible with meat, fish, shellfish, gelatin
       - PESCATARIAN: Compatible with dairy, eggs, honey, fish, shellfish. NOT compatible with meat, gelatin
       - GLUTEN-FREE: NOT compatible with wheat, barley, rye, malt, semolina

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

    7. Extract a product image URL for the TARGET PRODUCT ONLY.
       - The image MUST be of "${brandName || ''} ${productName || ''}" - the specific food product we're analyzing.
       - DO NOT return images of unrelated products, ads, or other items on the page.
       - Look for a high-quality image URL in og:image tags or product image URLs.
       - Prefer clear, isolated product shots of the target food item.
       - If you cannot find an image that clearly matches the target product, return null.
       - Return "productImage": "https://..." or null if none found.

    IMPORTANT: You MUST return a valid JSON object matching the schema.

    Here is the data:
    ${JSON.stringify(scrapedData.map(s => ({ url: s.url, content: extractIngredientRelevantContent(s.content, 5000) })))}
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
        max_tokens: 8000,  // Increased to handle larger source batches
        temperature: 0,
        messages: [{ role: 'user', content: prompt }]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[Antigravity] AI analysis failed: ${response.status} - ${errorText.substring(0, 500)}`);
      return null;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    // Log raw AI response for debugging
    console.log('[Antigravity] Raw AI response length:', content.length);
    console.log('[Antigravity] Raw AI response (first 2000 chars):', content.substring(0, 2000));

    // Extract first complete JSON object using balanced brace counting
    // This handles cases where AI adds text with curly braces after the JSON
    function extractFirstJsonObject(text: string): string | null {
      const startIdx = text.indexOf('{');
      if (startIdx === -1) return null;

      let depth = 0;
      let inString = false;
      let escapeNext = false;

      for (let i = startIdx; i < text.length; i++) {
        const char = text[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\' && inString) {
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') depth++;
          else if (char === '}') {
            depth--;
            if (depth === 0) {
              return text.substring(startIdx, i + 1);
            }
          }
        }
      }
      return null; // Unbalanced braces
    }

    const jsonString = extractFirstJsonObject(content);
    if (!jsonString) {
      console.log('[Antigravity] Failed to parse AI response - no valid JSON object found');
      console.log('[Antigravity] Response preview:', content.substring(0, 500));
      return null;
    }

    let result;
    try {
      result = JSON.parse(jsonString);
    } catch (parseError) {
      console.log('[Antigravity] JSON parse error:', (parseError as Error).message);
      console.log('[Antigravity] JSON string length:', jsonString.length);
      console.log('[Antigravity] JSON string (last 200 chars):', jsonString.substring(jsonString.length - 200));
      return null;
    }

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

    // POST-PROCESSING: Fix allergen triggers to include ALL matching ingredients
    // The AI often only returns one trigger when multiple ingredients contain the allergen
    const allergenPatterns: { [key: string]: RegExp } = {
      'Dairy': /\b(milk|cream|butter|cheese|yogurt|whey|casein|lactose|kefir|ghee)\b/i,
      'Milk': /\b(milk|cream|butter|cheese|yogurt|whey|casein|lactose|kefir|ghee)\b/i,
      'Egg': /\b(egg|yolk|albumen|mayonnaise)\b/i,
      'Eggs': /\b(egg|yolk|albumen|mayonnaise)\b/i,
      'Peanut': /\b(peanut)\b/i,
      'Peanuts': /\b(peanut)\b/i,
      'Tree Nut': /\b(almond|walnut|cashew|pecan|pistachio|hazelnut|macadamia|brazil\s*nut)\b/i,
      'Tree Nuts': /\b(almond|walnut|cashew|pecan|pistachio|hazelnut|macadamia|brazil\s*nut)\b/i,
      'Fish': /\b(fish|salmon|tuna|cod|anchovy|anchovies|sardine|trout|tilapia|halibut)\b/i,
      'Shellfish': /\b(shrimp|prawn|lobster|crab|clam|mussel|scallop|oyster)\b/i,
      'Crustacean Shellfish': /\b(shrimp|prawn|lobster|crab|clam|mussel|scallop|oyster)\b/i,
      'Soy': /\b(soy|soya|soybean|edamame|tofu)\b/i,
      'Soybeans': /\b(soy|soya|soybean|edamame|tofu)\b/i,
      'Wheat': /\b(wheat|flour|gluten|barley|semolina|durum)\b/i,
      'Sesame': /\b(sesame|tahini)\b/i
    };

    // Rebuild allergens with all matching triggers
    const rebuiltAllergens: string[] = [];
    const processedAllergenTypes = new Set<string>();

    for (const allergenStr of finalAllergens) {
      // Extract allergen name from formats like "Dairy (trigger)" or just "Dairy"
      const match = allergenStr.match(/^([^(]+)/);
      const allergenName = match ? match[1].trim() : allergenStr.trim();

      // Normalize allergen name for pattern lookup
      const normalizedName = Object.keys(allergenPatterns).find(
        key => key.toLowerCase() === allergenName.toLowerCase()
      ) || allergenName;

      // Skip if already processed this allergen type
      if (processedAllergenTypes.has(normalizedName.toLowerCase())) continue;
      processedAllergenTypes.add(normalizedName.toLowerCase());

      const pattern = allergenPatterns[normalizedName];
      if (pattern) {
        // Find ALL ingredients that match this allergen
        const allTriggers = ingredients.filter(i => pattern.test(i.toLowerCase()));
        if (allTriggers.length > 0) {
          rebuiltAllergens.push(`${allergenName} (${allTriggers.join(', ')})`);
        } else {
          rebuiltAllergens.push(allergenStr); // Keep original if no matches found
        }
      } else {
        rebuiltAllergens.push(allergenStr); // Keep original if no pattern defined
      }
    }

    finalAllergens = rebuiltAllergens;
    console.log('[Antigravity] Post-processed allergens:', JSON.stringify(finalAllergens));

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
  addLog?: (msg: string) => void,
  sendSourceEvent?: (event: { verified?: number; total?: number; needed?: number; sources?: { [url: string]: { status: string; cycle?: number; reason?: string } } }) => void
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
  const MAX_CYCLES = 20;

  // Source tracker state - accumulates all sources for UI updates
  const sourceTrackerState: { [url: string]: { status: string; cycle?: number; reason?: string } } = {};
  let currentCycle = 0;

  // Helper to emit source tracker updates
  const emitSourceUpdate = () => {
    if (!sendSourceEvent) return;
    const verifiedCount = Object.values(sourceTrackerState).filter(s => s.status === 'accepted').length;
    sendSourceEvent({
      verified: verifiedCount,
      total: TARGET_SOURCES,
      sources: sourceTrackerState,
      needed: Math.max(0, TARGET_SOURCES - verifiedCount)
    });
  };

  let knownTitle = productName ? `${brandName} ${productName}`.trim() : '';

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    currentCycle = cycle;
    const needed = TARGET_SOURCES - verifiedSources.length;
    if (needed <= 0) break;

    log(`[Antigravity] Cycle ${cycle}/${MAX_CYCLES}: Looking for ${needed} more sources...`);

    // Build search queries based on cycle
    // Strategy: If we have product info from trusted sources, use it.
    // If we only have a barcode, use barcode-focused queries.
    // NEVER extract product names from scraped content - that leads to garbage queries.
    const queries: string[] = [];
    const hasProductInfo = Boolean(knownTitle || (brandName && productName));

    // Barcode-focused query terms for each cycle (used when we don't have product info)
    const barcodeQueryTerms = [
      ['ingredients', 'nutrition label'],           // Cycle 1
      ['nutrition facts', 'food label'],            // Cycle 2
      ['contents', 'allergens'],                    // Cycle 3
      ['amazon', 'walmart'],                        // Cycle 4
      ['target', 'grocery'],                        // Cycle 5
      ['openfoodfacts', 'nutritionix'],             // Cycle 6
      ['fatsecret', 'product info'],                // Cycle 7
      ['instacart', 'kroger'],                      // Cycle 8
      ['ingredients list', 'label'],               // Cycle 9
      ['allergen info', 'food facts'],             // Cycle 10
      ['nutrition', 'product'],                    // Cycle 11+
    ];

    if (hasProductInfo) {
      // We have product info - use product-focused queries
      if (cycle === 1) {
        if (barcode) queries.push(`${barcode} ingredients`);
        if (knownTitle) queries.push(`${knownTitle} ingredients`);
      } else if (cycle === 2) {
        if (knownTitle) queries.push(`${knownTitle} nutrition facts`);
        if (brandName && productName) queries.push(`${brandName} ${productName} food label`);
      } else if (cycle === 3) {
        if (knownTitle) queries.push(`${knownTitle} ingredients text`);
        if (brandName) queries.push(`${brandName} products ingredients`);
      } else if (cycle === 4) {
        if (knownTitle) queries.push(`${knownTitle} amazon ingredients`);
        if (knownTitle) queries.push(`${knownTitle} walmart ingredients`);
      } else if (cycle === 5) {
        if (knownTitle) queries.push(`${knownTitle} product review ingredients`);
        if (brandName && productName) queries.push(`${brandName} ${productName} allergy info`);
      } else if (cycle === 6) {
        if (barcode) queries.push(`${barcode} openfoodfacts`);
        if (knownTitle) queries.push(`${knownTitle} nutritionix`);
      } else if (cycle === 7) {
        if (knownTitle) queries.push(`${knownTitle} ingredients list`);
        if (productName) queries.push(`"${productName}" ingredients`);
      } else if (cycle === 8) {
        if (knownTitle) queries.push(`${knownTitle} target ingredients`);
        if (knownTitle) queries.push(`${knownTitle} instacart`);
      } else if (cycle <= 12) {
        if (knownTitle) queries.push(`"${knownTitle}" ingredients`);
        if (brandName && productName) queries.push(`"${brandName}" "${productName}" label`);
      } else {
        if (knownTitle) queries.push(`${knownTitle} buy`);
        if (brandName && productName) queries.push(`${brandName} ${productName}`);
      }
    } else if (barcode) {
      // No product info - use barcode-only queries
      const termIndex = Math.min(cycle - 1, barcodeQueryTerms.length - 1);
      const terms = barcodeQueryTerms[termIndex];
      for (const term of terms) {
        queries.push(`${barcode} ${term}`);
      }
      // Also add UPC prefix variant
      if (cycle <= 4) {
        queries.push(`UPC ${barcode}`);
      }
    }

    // Filter out empty or whitespace-only queries
    const filteredQueries = queries.filter(q => q && q.trim().length > 0);
    if (filteredQueries.length === 0) {
      log(`[Antigravity] Cycle ${cycle}: No valid queries, skipping`);
      continue;
    }

    // Search engines in batches to avoid memory limit (Supabase edge functions have ~150MB limit)
    // Batch 1: Yahoo, Ecosia, Brave (most reliable)
    const batch1Promises = filteredQueries.flatMap(query => [
      antigravitySearchYahoo(query, addLog),
      antigravitySearchEcosia(query, addLog),
      antigravitySearchBrave(query, addLog)
    ]);
    const batch1Results = await Promise.all(batch1Promises);

    // Batch 2: Startpage, DuckDuckGo, Mojeek (run after batch 1 to reduce peak memory)
    const batch2Promises = filteredQueries.flatMap(query => [
      antigravitySearchStartpage(query, addLog),
      antigravitySearchDDGLite(query, addLog),
      antigravitySearchMojeek(query, addLog)
    ]);
    const batch2Results = await Promise.all(batch2Promises);

    const allUrls = new Set<string>();
    [...batch1Results, ...batch2Results].flat().forEach(url => {
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

    // PIPELINED: Scrape batches of 5, filter+analyze in parallel with next scrape
    const urlsToScrape = Array.from(allUrls).slice(0, 15); // Reduced from 30 to save memory
    const BATCH_SIZE = 5;
    const seenDomains = new Set<string>(verifiedSources.map(v => {
      try { return new URL(v.url).hostname.replace('www.', ''); } catch { return ''; }
    }));

    log(`[Antigravity] Scraping ${urlsToScrape.length} URLs (pipelined)...`);

    let stopEarly = false;

    // Helper to process a batch (filter + AI)
    const processBatch = async (scraped: AntigravityScrapedSource[], batchNum: number): Promise<void> => {
      if (scraped.length === 0 || stopEarly) return;

      const uniqueScraped = antigravityGetUniqueDomains(scraped);
      const { passed, failed } = antigravityFilterByContent(
        uniqueScraped, barcode, brandName, productName, seenDomains, addLog
      );

      if (failed.length > 0) {
        log(`[Antigravity] Batch ${batchNum}: Filtered ${failed.length}`);
      }

      if (passed.length === 0) {
        log(`[Antigravity] Batch ${batchNum}: No candidates`);
        return;
      }

      for (const c of passed) {
        if (!sourceTrackerState[c.url]) {
          sourceTrackerState[c.url] = { status: 'analyzing', cycle: currentCycle };
        }
      }
      emitSourceUpdate();

      log(`[Antigravity] Batch ${batchNum}: Analyzing ${passed.length} candidates...`);

      try {
        const analysis = await antigravityAnalyzeWithAI(passed, addLog, brandName, productName, barcode);
        if (analysis) {
          // Filter for sources that have ingredients AND are for the correct product
          const goodSources = analysis.sources.filter(s => s.hasIngredients && s.isCorrectProduct !== false);
          const wrongProduct = analysis.sources.filter(s => s.isCorrectProduct === false);
          const noIngredients = analysis.sources.filter(s => !s.hasIngredients && s.isCorrectProduct !== false);

          log(`[Antigravity] Batch ${batchNum}: ${goodSources.length}/${passed.length} verified`);
          if (wrongProduct.length > 0) {
            log(`[Antigravity] Batch ${batchNum}: ${wrongProduct.length} rejected (wrong product variant)`);
          }

          for (const s of goodSources) {
            const original = passed.find(u => u.url === s.url);
            if (original) {
              const domain = new URL(s.url).hostname.replace('www.', '');
              const alreadyHas = verifiedSources.some(v => {
                try { return new URL(v.url).hostname.replace('www.', '') === domain; }
                catch { return false; }
              });
              if (!alreadyHas) {
                verifiedSources.push(original);
                sourceIngredientsMap.set(original.url, s.ingredients);
                sourceTrackerState[s.url] = { status: 'accepted', cycle: currentCycle, reason: `${s.ingredients.length} ingredients` };
              } else {
                sourceTrackerState[s.url] = { status: 'rejected', cycle: currentCycle, reason: 'Duplicate domain' };
              }
            }
          }

          // Mark wrong product variants
          for (const rej of wrongProduct) {
            sourceTrackerState[rej.url] = { status: 'rejected', cycle: currentCycle, reason: 'Wrong product variant' };
          }

          // Mark sources with no ingredients
          for (const rej of noIngredients) {
            sourceTrackerState[rej.url] = { status: 'rejected', cycle: currentCycle, reason: 'No ingredients' };
          }
          emitSourceUpdate();

          if (verifiedSources.length >= TARGET_SOURCES) {
            log(`[Antigravity] ✓ Reached ${verifiedSources.length} verified sources!`);
            stopEarly = true;
          }
        }
      } catch (err) {
        log(`[Antigravity] Batch ${batchNum} error: ${(err as any).message}`);
      }
    };

    // Pipeline loop: scrape batch N+1 while processing batch N
    let pendingProcess: Promise<void> | null = null;

    for (let i = 0, batchNum = 0; i < urlsToScrape.length && !stopEarly; i += BATCH_SIZE) {
      batchNum++;
      const batchUrls = urlsToScrape.slice(i, i + BATCH_SIZE);

      log(`[Antigravity] Batch ${batchNum}: Scraping ${batchUrls.length} URLs...`);
      const scraped = await antigravityScrapeBatch(batchUrls);
      log(`[Antigravity] Batch ${batchNum}: ${scraped.length} scraped`);

      // Wait for previous batch's processing to complete
      if (pendingProcess) {
        await pendingProcess;
        pendingProcess = null;
        if (stopEarly) {
          log(`[Antigravity] Stopping early`);
          break;
        }
      }

      // Start processing this batch
      const hasMoreBatches = i + BATCH_SIZE < urlsToScrape.length;
      if (hasMoreBatches && !stopEarly) {
        // Pipeline: process while scraping next batch
        pendingProcess = processBatch(scraped, batchNum);
      } else {
        // Last batch: wait for processing
        await processBatch(scraped, batchNum);
      }
    }

    // Wait for final processing
    if (pendingProcess) {
      await pendingProcess;
    }

    // Exit early if we hit target
    if (verifiedSources.length >= TARGET_SOURCES) {
      log(`[Antigravity] ✓ Reached ${verifiedSources.length} verified sources - stopping search`);
      break;
    }
  }

  console.log(`[Antigravity] Total verified sources: ${verifiedSources.length}`);

  if (verifiedSources.length === 0) {
    console.log('[Antigravity] No verified sources found');
    return { source: null, additionalSources: [], analysis: null };
  }

  // Build unified ingredient list from the ingredients we already found during verification
  // Use the most complete list (most ingredients)
  let bestIngredients: string[] = [];
  let bestUrl = '';
  for (const [url, ingredients] of sourceIngredientsMap.entries()) {
    if (ingredients.length > bestIngredients.length) {
      bestIngredients = ingredients;
      bestUrl = url;
    }
  }

  if (bestIngredients.length === 0) {
    console.log('[Antigravity] No ingredients found in verified sources');
    return { source: null, additionalSources: [], analysis: null };
  }

  log(`[Antigravity] ✓ Using ${bestIngredients.length} ingredients from ${verifiedSources.length} verified sources`);

  // Build the primary source using ingredients from verification
  const ingredientsText = bestIngredients.join(', ');
  const primarySource: IngredientSource = {
    sourceName: 'Antigravity Web Search',
    url: verifiedSources[0]?.url || '',
    ingredientsText: ingredientsText,
    productName: productName || 'Unknown Product',
    productImage: '',
    allergenStatement: undefined
  };

  // Build additional sources from what we found during verification
  const additionalSources: IngredientSource[] = verifiedSources.slice(1).map((s, i) => {
    const ingredients = sourceIngredientsMap.get(s.url) || [];
    return {
      sourceName: `Web Source ${i + 2}`,
      url: s.url,
      ingredientsText: ingredients.join(', '),
      productName: productName
    };
  }).filter(s => s.ingredientsText.length > 0);

  // Build a minimal analysis object from the ingredients we already have
  const analysis: AntigravityAnalysisResult = {
    productName: productName || 'Unknown Product',
    unifiedIngredientList: bestIngredients,
    top9Allergens: [], // Will be detected downstream
    dietaryCompliance: {
      vegan: { isCompliant: false, reason: '' },
      vegetarian: { isCompliant: false, reason: '' },
      pescatarian: { isCompliant: false, reason: '' },
      glutenFree: { isCompliant: false, reason: '' }
    },
    discrepancies: [],
    sources: verifiedSources.map(s => ({
      url: s.url,
      hasIngredients: true,
      ingredients: sourceIngredientsMap.get(s.url) || []
    })),
    productImage: null
  };

  return { source: primarySource, additionalSources, analysis };
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
    // Prefer results that look like product pages (retailers often have good images)
    const preferredDomains = ['walmart.com', 'target.com', 'amazon.com', 'instacart.com', 'kroger.com'];
    const bestResult = results.find(url => preferredDomains.some(d => url.includes(d)))
      || results.find(url => !url.includes('youtube') && !url.includes('facebook'))
      || results[0];

    try {
      const response = await fetch(bestResult, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml'
        }
      });
      if (response.ok) {
        const html = await response.text();
        // Look for og:image which is typically the main product image
        const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
        if (ogImageMatch && ogImageMatch[1]) {
          // Validate it looks like a product image URL (not an ad)
          const imageUrl = ogImageMatch[1];
          if (!imageUrl.includes('ad') && !imageUrl.includes('banner') && !imageUrl.includes('logo')) {
            return imageUrl;
          }
        }
      }
    } catch (e) {
      // Silently fail
    }
  }
  return undefined;
}

// Main barcode lookup function
// Uses Antigravity Web Search - Multi-engine web scraping to find 5 verified sources
async function lookupBarcode(
  barcode: string,
  addLog?: (msg: string) => void,
  sendSourceEvent?: (event: { verified?: number; total?: number; needed?: number; sources?: { [url: string]: { status: string; cycle?: number; reason?: string } } }) => void
): Promise<BarcodeLookupResult> {
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
    log(`[API] Trying Open Food Facts...`);
    const offResult = await fetchFromOpenFoodFacts(barcode);
    if (offResult.source) {
      brandName = offResult.brand || '';
      productName = offResult.source.productName || '';
      log(`[API] ✓ Found in Open Food Facts: ${brandName} ${productName}`);
    } else {
      log(`[API] ✗ Not found in Open Food Facts`);
    }

    // If no brand from OFF, try FoodData Central
    if (!brandName) {
      log(`[API] Trying USDA FoodData Central...`);
      const fdcResult = await fetchFromFoodDataCentral(barcode);
      if (fdcResult.source) {
        brandName = fdcResult.brand || '';
        productName = fdcResult.productName || '';
        log(`[API] ✓ Found in FoodData Central: ${brandName} ${productName}`);
      } else {
        log(`[API] ✗ Not found in FoodData Central`);
      }
    }

    // If still no brand, try FatSecret
    if (!brandName) {
      log(`[API] Trying FatSecret...`);
      const fsResult = await fetchFromFatSecret(barcode);
      if (fsResult.brand || fsResult.productName) {
        brandName = fsResult.brand || '';
        productName = fsResult.productName || productName;
        log(`[API] ✓ Found in FatSecret: ${brandName} ${productName}`);
      } else {
        log(`[API] ✗ Not found in FatSecret${fsResult.error ? ` (${fsResult.error})` : ''}`);
      }
    }

    // If still no brand, try Barcode Lookup (commercial API with good US coverage)
    if (!brandName) {
      log(`[API] Trying Barcode Lookup...`);
      const blResult = await fetchFromBarcodeLookup(barcode);
      if (blResult.brand || blResult.productName) {
        brandName = blResult.brand || '';
        productName = blResult.productName || productName;
        log(`[API] ✓ Found in Barcode Lookup: ${brandName} ${productName}`);
      } else {
        log(`[API] ✗ Not found in Barcode Lookup${blResult.error ? ` (${blResult.error})` : ''}`);
      }
    }

    const antigravityResult = await antigravitySearchForBrandProduct(barcode, productName, brandName, addLog, sendSourceEvent);
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

    // Ensure we have a product image - try multiple sources
    let finalProductImage = antigravityResult.source.productImage || '';

    // Fallback 1: Try UPCitemdb.com (has good product image coverage)
    if (!finalProductImage) {
      log(`[Image] No image from Antigravity. Trying UPCitemdb.com...`);
      const upcImage = await fetchProductImageFromUPCitemdb(barcode);
      if (upcImage) {
        finalProductImage = upcImage;
        log(`[Image] Found image from UPCitemdb: ${upcImage}`);
      }
    }

    // Fallback 2: Try Open Food Facts image if we got brand/product from there
    if (!finalProductImage && offResult.source?.productImage) {
      finalProductImage = offResult.source.productImage;
      log(`[Image] Using Open Food Facts image: ${finalProductImage}`);
    }

    // Fallback 3: Google image search as last resort
    if (!finalProductImage && finalProductName) {
      log(`[Image] Still no image. Trying Google search...`);
      const foundImage = await searchProductImage(finalProductName, antigravityResult.source.brand || '', log);
      if (foundImage) {
        finalProductImage = foundImage;
        log(`[Image] Found image via Google search: ${foundImage}`);
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

      // Source tracker event sender
      const sendSourceEvent = (event: { verified?: number; total?: number; needed?: number; sources?: { [url: string]: { status: string; cycle?: number; reason?: string } } }) => {
        sendSSE('source_update', event);
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

        // Add timeout handling (5 minutes max)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout - lookup took too long')), 300000)
        );

        const lookupPromise = lookupBarcode(barcode.trim(), addLog, sendSourceEvent).catch(err => {
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

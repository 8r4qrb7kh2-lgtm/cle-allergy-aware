import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// Define the schema for the output
// Define the schema for the output
const IngredientAnalysisSchema = z.object({
  productName: z.string().optional().default("Product Analysis"),
  sources: z.preprocess((val) => {
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch (e) {
        return [];
      }
    }
    return val;
  }, z.array(z.object({
    url: z.string(),
    ingredients: z.any(), // Relaxed
    hasIngredients: z.any()
  }))),
  unifiedIngredientList: z.any(), // Relaxed
  differences: z.any(), // Relaxed
  top9Allergens: z.any(), // Relaxed
  dietaryCompliance: z.object({
    vegan: z.object({ isCompliant: z.any(), reason: z.string().optional() }),
    vegetarian: z.object({ isCompliant: z.any(), reason: z.string().optional() }),
    pescatarian: z.object({ isCompliant: z.any(), reason: z.string().optional() }),
    glutenFree: z.object({ isCompliant: z.any(), reason: z.string().optional() })
  })
});

export async function analyzeIngredients(scrapedData: { url: string; content: string }[]) {
  const prompt = `
    You are a food ingredient expert. I will provide you with scraped text from multiple websites for a specific food product.
    
    Your task is to:
    1. Identify the product name. If you cannot find a clear product name, use "Product Analysis".
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
    5. Analyze the unified list for dietary compliance (Vegan, Vegetarian, Pescatarian, Gluten-Free).
       - Return isCompliant (boolean), reason (string), and trigger (string).
       - IF NOT COMPLIANT: You MUST identify the specific ingredient (trigger).
         - Example: {"isCompliant": false, "reason": "Contains Honey", "trigger": "Honey"}
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

    IMPORTANT: You MUST return a valid JSON object matching the schema.
    
    Here is the data:
    ${JSON.stringify(scrapedData)}
  `;

  let object;
  try {
    const result = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: IngredientAnalysisSchema,
      prompt: prompt,
    });
    object = result.object;
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    // Log the raw response if available (depending on SDK version)
    if (error.text) console.error("Raw AI Response:", error.text);
    throw error; // Re-throw to be handled by caller
  }

  // Helper to format allergens
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
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') return [val];
    return [];
  };

  // Helper to coerce boolean
  const coerceBool = (val: any) => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return false;
  };

  // Post-processing
  const processedObject = {
    ...object,
    unifiedIngredientList: ensureStringArray(object.unifiedIngredientList),
    top9Allergens: formatAllergens(object.top9Allergens),
    differences: Array.isArray(object.differences) ? object.differences : [],
    sources: object.sources.map(source => ({
      ...source,
      ingredients: ensureStringArray(source.ingredients),
      hasIngredients: coerceBool(source.hasIngredients) || (ensureStringArray(source.ingredients).length > 0)
    })),
    dietaryCompliance: {
      vegan: { ...object.dietaryCompliance.vegan, isCompliant: coerceBool(object.dietaryCompliance.vegan.isCompliant) },
      vegetarian: { ...object.dietaryCompliance.vegetarian, isCompliant: coerceBool(object.dietaryCompliance.vegetarian.isCompliant) },
      pescatarian: { ...object.dietaryCompliance.pescatarian, isCompliant: coerceBool(object.dietaryCompliance.pescatarian.isCompliant) },
      glutenFree: { ...object.dietaryCompliance.glutenFree, isCompliant: coerceBool(object.dietaryCompliance.glutenFree.isCompliant) }
    }
  };

  return processedObject;
}

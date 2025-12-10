
// Helper to normalize ingredient text for comparison
function normalizeIngredient(text: string): string {
    return text.toLowerCase()
        .replace(/organic\s+/g, '')
        .replace(/natural\s+/g, '')
        .replace(/fresh\s+/g, '')
        .replace(/contains 2% or less of\s+/g, '')
        .replace(/[^a-z0-9]/g, '') // Remove punctuation/spaces for fuzzy match
        .trim();
}

// Helper to calculate discrepancies programmatically
function calculateDiscrepancies(
    unifiedList: string[],
    sources: Array<{ url: string, ingredients: string[] }>
): Array<{ ingredient: string, presentIn: string[], missingIn: string[], note?: string }> {
    const differences: Array<{ ingredient: string, presentIn: string[], missingIn: string[], note?: string }> = [];

    // Create a normalized set of unified ingredients
    const unifiedNormalized = unifiedList.map(i => ({ original: i, norm: normalizeIngredient(i) }));

    // Check for missing ingredients in each source
    for (const item of unifiedNormalized) {
        const presentIn: string[] = [];
        const missingIn: string[] = [];

        for (const source of sources) {
            // Check if source has this ingredient
            const hasIngredient = source.ingredients.some(si => normalizeIngredient(si).includes(item.norm) || item.norm.includes(normalizeIngredient(si)));

            if (hasIngredient) {
                presentIn.push(source.url);
            } else {
                missingIn.push(source.url);
            }
        }

        // If missing in some but present in others, it's a discrepancy
        // Ignore if missing in ALL (shouldn't happen if unified list is correct) or present in ALL
        if (missingIn.length > 0 && presentIn.length > 0) {
            differences.push({
                ingredient: item.original,
                presentIn,
                missingIn,
                note: 'Detected programmatically'
            });
        }
    }

    // Also check for count mismatches (significant difference)
    for (const source of sources) {
        if (Math.abs(source.ingredients.length - unifiedList.length) > 3) { // Allow some slack
            // Check if we already have a discrepancy for this source? 
            // Maybe just rely on the ingredient-level checks above.
        }
    }

    return differences;
}

// import { ScrapedData } from './scrape';

export interface ProductInfo {
    name?: string;
    brand?: string;
}

// Helper: Deduplicate Domains
export const getUniqueDomains = (data: any[]) => {
    const unique: any[] = [];
    const seen = new Set<string>();
    for (const d of data) {
        try {
            const domain = new URL(d.url).hostname.replace('www.', '');
            if (!seen.has(domain)) {
                seen.add(domain);
                unique.push(d);
            }
        } catch (e) { unique.push(d); }
    }
    return unique;
};

// Helper: Check for quality content
export const isQualitySource = (d: any, productInfo?: ProductInfo) => {
    const content = (d.content || '').toLowerCase();
    const title = (d.title || '').toLowerCase();
    const url = (d.url || '').toLowerCase();

    // Negative filters: Recipes, homemade, blogs
    const negatives = ["recipe", "homemade", "how to make", "cook", "blog", "pinterest", "review", "recall"];
    if (negatives.some(n => title.includes(n) || url.includes(n))) return false;

    // Brand Check (Critical for relevance)
    if (productInfo?.brand) {
        // Clean brand: take first part before comma, remove Inc/LLC, trim
        let brand = productInfo.brand.split(',')[0].replace(/\s+(inc|llc|ltd|corp)\.?$/i, '').trim().toLowerCase();

        // Check if brand is in title or URL or content (content is weak, title/url is strong)
        // We'll require it in Title OR URL OR (Content + strict ingredients)
        const brandInTitleOrUrl = title.includes(brand) || url.includes(brand);

        // If brand is NOT in title/url, we be very suspicious.
        // But sometimes brand is "Whole Foods" and title is "365 Everyday Value".
        // So we can't be 100% strict unless we are sure.
        // Let's just boost score or use it as a tiebreaker? 
        // User said "wrong brand", so we should be strict.

        // Let's require the brand to appear somewhere in the text if we know it.
        if (!brandInTitleOrUrl) {
            // If not in title/URL, require it to appear at least TWICE in content to be sure it's not just a "related product" link
            const matches = content.split(brand).length - 1;
            if (matches < 2) return false;
        }
    }

    // "contains" is too broad. Use stricter checks.
    return content.includes('ingredients:') ||
        content.includes('ingredients list') ||
        content.includes('nutrition facts') ||
        (content.includes('ingredients') && content.length > 500); // Only count generic "ingredients" if content is substantial
};

// Helper: Extract Best Title (Fallback if OFF failed)
export const extractBestTitle = (data: any[], bestTitle: string) => {
    if (bestTitle) return bestTitle; // Use OFF name if available

    // Sort by length (descending) to find the most descriptive title, but avoid super long SEO titles
    // Actually, let's prefer shorter, cleaner titles that aren't "Home" or "Error"
    const candidates = data
        .map(d => d.title)
        .filter(t => t && t.length > 5 && t.length < 100)
        .filter(t => !t.includes("Access Denied") && !t.includes("404") && !t.includes("Robot Check"));

    const titleBlacklist = ["nutrition facts", "calories in", "upc lookup", "barcode lookup", "search results", "item", "product", "food", "login", "signin"];

    for (const title of candidates) {
        const titleLower = title.toLowerCase();
        if (titleBlacklist.some(term => titleLower.includes(term))) continue;

        let cleanTitle = title
            .replace(/UPC\s*\d+/i, '')
            .replace(/Barcode\s*lookup/i, '')
            .replace(/\|\s*.*$/, '') // Remove pipe and everything after (usually site name)
            .replace(/-\s*.*$/, '')  // Remove dash and everything after
            .replace(/Nutrition\s*Facts/i, '')
            .trim();

        if (cleanTitle.length > 5) return cleanTitle;
    }

    // Fallback: Just take the first non-empty title that looks okay
    return candidates[0] || "Unknown Product";
};

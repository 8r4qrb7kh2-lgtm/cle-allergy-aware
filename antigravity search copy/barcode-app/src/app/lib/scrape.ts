import * as cheerio from 'cheerio';
import axios from 'axios';

export async function scrapeUrls(urls: string[]): Promise<{ url: string; content: string; title: string }[]> {
    const results = await Promise.all(
        urls.map(async (url) => {
            try {
                // Special handling for OpenFoodFacts to use their JSON API
                if (url.includes('openfoodfacts.org')) {
                    const barcodeMatch = url.match(/product\/(\d+)/);
                    if (barcodeMatch) {
                        const barcode = barcodeMatch[1];
                        const apiUrl = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`;
                        try {
                            const { data } = await axios.get(apiUrl);
                            if (data.status === 1 && data.product) {
                                const product = data.product;
                                // Check multiple fields for ingredients
                                const ingredients = product.ingredients_text ||
                                    product.ingredients_text_en ||
                                    product.ingredients_text_with_allergens ||
                                    "";

                                if (ingredients) {
                                    const content = `
                                        Product Name: ${product.product_name || "Unknown"}
                                        Ingredients: ${ingredients}
                                        Allergens: ${product.allergens || "None listed"}
                                        Brands: ${product.brands || "Unknown"}
                                    `;
                                    return { url, content };
                                }
                            }
                        } catch (e) {
                            console.error("OFF API failed, falling back to HTML", e);
                        }
                    }
                }

                // General scraping for other sites
                const { data } = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                        'Sec-Ch-Ua-Mobile': '?0',
                        'Sec-Ch-Ua-Platform': '"Windows"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1'
                    },
                    timeout: 10000 // Increased timeout
                });

                const $ = cheerio.load(data);

                // Remove scripts, styles, and irrelevant tags
                $('script').remove();
                $('style').remove();
                $('nav').remove();
                $('footer').remove();
                $('header').remove();
                $('iframe').remove();
                $('noscript').remove();
                $('svg').remove();
                $('img').remove();

                // Try to find specific ingredient containers first (common patterns)
                let content = '';
                const ingredientSelectors = [
                    '.ingredients', '#ingredients', '[itemprop="ingredients"]',
                    '.product-ingredients', '.ingredients-list',
                    '#ingredients-list', '.field--name-field-ingredients'
                ];

                for (const selector of ingredientSelectors) {
                    const text = $(selector).text().trim();
                    if (text.length > 20) {
                        content += "Found Ingredients Section: " + text + "\n";
                    }
                }

                // Append full body text as fallback/context
                // Use a smarter text extraction that preserves block structure
                $('br').replaceWith('\n');
                $('p, div, h1, h2, h3, h4, h5, h6, li, tr').after('\n');

                const cleanText = $('body').text()
                    .replace(/[ \t]+/g, ' ') // Collapse spaces/tabs but keep newlines
                    .replace(/\n\s*\n/g, '\n') // Remove multiple empty lines
                    .trim();

                // Limit to a reasonable size, but ensure we capture enough context
                // If we found a specific ingredient section, prioritize that, but keep full text for AI context
                // The AI is good at finding needles in haystacks, but we want to avoid 50 pages of terms of service.
                content += "\nFull Page Text: " + cleanText.substring(0, 15000);

                if (content.length < 50) {
                    console.log(`Warning: Scraped content for ${url} is very short (${content.length} chars)`);
                }

                // Check for soft 403s / Captchas
                const lowerContent = content.toLowerCase();
                const blockKeywords = [
                    "access denied", "security check", "captcha", "robot", "human verification",
                    "please verify you are a human", "access to this page has been denied",
                    "403 forbidden", "404 not found", "enable javascript"
                ];

                if (blockKeywords.some(k => lowerContent.includes(k)) && content.length < 500) {
                    console.log(`Scraped content for ${url} appears to be a block page.`);
                    return null;
                }
                // Extract title
                const title = $('title').text().trim() || $('h1').first().text().trim() || '';

                return {
                    url,
                    content: content,
                    title
                };
            } catch (error: any) {
                console.error(`Failed to scrape ${url}:`, error.message);
                return null;
            }
        })
    );

    const validResults = results.filter((result): result is { url: string; content: string; title: string } => result !== null && result.content.length > 0);
    console.log(`ScrapeUrls: Attempted ${urls.length}, Succeeded ${validResults.length}`);
    return validResults;
}

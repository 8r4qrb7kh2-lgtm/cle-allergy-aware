const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

/**
 * Scrapes a restaurant's menu page and extracts content
 */
class MenuScraper {
  constructor() {
    this.userAgent = 'ClarivoreMenuMonitor/1.0 (Menu Change Detection Bot)';
  }

  /**
   * Fetch and parse a menu page
   * @param {string} url - The URL of the menu page
   * @returns {Promise<Object>} Scraped content
   */
  async scrape(url) {
    try {
      console.log(`[Scraper] Fetching: ${url}`);

      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 30000, // 30 second timeout
        maxRedirects: 5
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Remove scripts, styles, and other non-content elements
      $('script, style, noscript, iframe, svg').remove();

      // Extract main content
      const content = this.extractContent($);

      // Generate hash of content for quick comparison
      const contentHash = this.generateHash(content.text);

      return {
        url,
        html: html.substring(0, 50000), // Store first 50KB
        contentHash,
        text: content.text,
        title: $('title').text().trim(),
        headings: content.headings,
        scrapedAt: new Date().toISOString(),
        statusCode: response.status
      };

    } catch (error) {
      console.error(`[Scraper] Error fetching ${url}:`, error.message);
      throw new Error(`Failed to scrape ${url}: ${error.message}`);
    }
  }

  /**
   * Extract relevant content from the page
   * @param {CheerioStatic} $ - Cheerio instance
   * @returns {Object} Extracted content
   */
  extractContent($) {
    const contentSelectors = [
      'main',
      'article',
      '[role="main"]',
      '[class*="menu"]',
      '[id*="menu"]',
      '[class*="food"]',
      '[class*="dish"]',
      '[class*="item"]',
      'section',
      '.content',
      '#content'
    ];

    const headings = [];
    const textBlocks = [];

    // Extract headings
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 0) {
        headings.push({
          level: el.tagName,
          text: text
        });
      }
    });

    // Try to find main content area
    let mainContent = null;

    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        const text = element.text().trim();
        if (text.length > 100) { // Must have substantial content
          mainContent = element;
          break;
        }
      }
    }

    // If no main content found, use body
    if (!mainContent) {
      mainContent = $('body');
    }

    // Extract all visible text
    const fullText = mainContent.text()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Extract menu-like items (looking for patterns)
    const menuItems = this.extractMenuItems($, mainContent);

    return {
      text: fullText.substring(0, 10000), // Limit to 10KB
      headings,
      menuItems
    };
  }

  /**
   * Extract potential menu items from content
   * @param {CheerioStatic} $ - Cheerio instance
   * @param {Cheerio} contentArea - Main content area
   * @returns {Array} Potential menu items
   */
  extractMenuItems($, contentArea) {
    const items = [];

    // Look for common menu item patterns
    const itemSelectors = [
      '[class*="menu-item"]',
      '[class*="dish"]',
      '[class*="food-item"]',
      '[class*="product"]',
      '[data-item]'
    ];

    itemSelectors.forEach(selector => {
      contentArea.find(selector).each((i, el) => {
        const $el = $(el);
        const text = $el.text().trim();

        if (text.length > 10) {
          // Try to extract name and price
          const priceMatch = text.match(/\$\d+(\.\d{2})?/);
          const price = priceMatch ? priceMatch[0] : null;

          items.push({
            text,
            price,
            selector
          });
        }
      });
    });

    return items;
  }

  /**
   * Generate SHA-256 hash of content
   * @param {string} content - Content to hash
   * @returns {string} Hash
   */
  generateHash(content) {
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
  }

  /**
   * Compare two content hashes to see if content changed
   * @param {string} hash1 - First hash
   * @param {string} hash2 - Second hash
   * @returns {boolean} True if different
   */
  hasChanged(hash1, hash2) {
    return hash1 !== hash2;
  }
}

module.exports = new MenuScraper();

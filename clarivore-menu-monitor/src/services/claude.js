const axios = require('axios');
require('dotenv').config();

/**
 * Claude AI service for menu analysis
 */
class ClaudeService {
  constructor() {
    this.apiKey = process.env.CLAUDE_API_KEY;
    this.apiUrl = 'https://api.anthropic.com/v1/messages';
    this.model = 'claude-sonnet-4-5';
  }

  /**
   * Analyze menu content and extract structured data
   * @param {Object} content - Scraped content
   * @param {Object} previousMenu - Previous menu state (optional)
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeMenu(content, previousMenu = null) {
    try {
      const prompt = this.buildAnalysisPrompt(content, previousMenu);

      console.log('[Claude] Analyzing menu content...');

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: prompt
          }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          timeout: 60000 // 60 second timeout
        }
      );

      // Extract and parse the response
      const responseText = response.data.content[0].text;
      const result = this.extractJSON(responseText);

      console.log(`[Claude] Analysis complete. Found ${result.menuItems?.length || 0} items`);

      return result;

    } catch (error) {
      console.error('[Claude] Error:', error.message);
      if (error.response) {
        console.error('[Claude] API Response:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Build the analysis prompt for Claude
   * @param {Object} content - Scraped content
   * @param {Object} previousMenu - Previous menu (optional)
   * @returns {string} Prompt
   */
  buildAnalysisPrompt(content, previousMenu) {
    let prompt = `You are analyzing a restaurant menu webpage to extract menu items and detect changes.

URL: ${content.url}
Page Title: ${content.title}

Page Content:
${content.text}

Your tasks:
1. Extract ALL menu items with their details
2. Identify allergen information (dairy, gluten, nuts, shellfish, soy, eggs, fish, sesame, etc.)
3. If previous menu is provided, identify what changed (added/removed/modified)
4. Pay special attention to allergen additions or modifications

For each menu item, extract:
- Name
- Description
- Price (if available)
- Category (appetizer, entree, dessert, beverage, etc.)
- Allergens (list all detected allergens)
- Dietary flags (vegetarian, vegan, gluten-free, etc.)

IMPORTANT ALLERGEN KEYWORDS to look for:
- Dairy: milk, cheese, butter, cream, yogurt, lactose
- Gluten: wheat, bread, pasta, flour, barley, rye
- Nuts: almond, walnut, pecan, cashew, pistachio, hazelnut, peanut
- Shellfish: shrimp, crab, lobster, clam, oyster, mussel
- Fish: salmon, tuna, cod, tilapia
- Soy: soy sauce, tofu, edamame, miso
- Eggs: egg, mayonnaise
- Sesame: sesame, tahini

Respond with ONLY a JSON object in this format:
{
  "isMenuPage": boolean,
  "menuItems": [
    {
      "name": "dish name",
      "description": "full description",
      "price": "$XX.XX",
      "category": "category name",
      "allergens": ["allergen1", "allergen2"],
      "dietaryFlags": ["vegetarian", "gluten-free"],
      "confidence": 0.95
    }
  ],
  "hasChanges": boolean,
  "changes": {
    "added": [
      {
        "name": "new dish name",
        "description": "description",
        "allergens": ["allergen1"]
      }
    ],
    "removed": [
      {
        "name": "removed dish name"
      }
    ],
    "modified": [
      {
        "name": "dish name",
        "field": "description|allergens|price",
        "oldValue": "old value",
        "newValue": "new value",
        "criticalChange": boolean
      }
    ]
  }
}`;

    if (previousMenu) {
      prompt += `\n\nPrevious Menu State:\n${JSON.stringify(previousMenu.menuItems || [], null, 2)}`;
      prompt += `\n\nCarefully compare the current menu with the previous state and identify ALL differences.`;
    }

    return prompt;
  }

  /**
   * Extract JSON from Claude's response
   * @param {string} text - Response text
   * @returns {Object} Parsed JSON
   */
  extractJSON(text) {
    // Remove markdown code blocks if present
    let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    // Extract JSON object
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON object found in Claude response');
    }

    const jsonText = cleaned.substring(firstBrace, lastBrace + 1);

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('[Claude] Failed to parse JSON:', jsonText.substring(0, 200));
      throw new Error(`Failed to parse Claude response: ${error.message}`);
    }
  }

  /**
   * Determine if changes are critical (allergen-related)
   * @param {Object} changes - Detected changes
   * @returns {boolean} True if critical changes found
   */
  hasCriticalChanges(changes) {
    if (!changes) return false;

    // New or removed items are important
    if (changes.added?.length > 0 || changes.removed?.length > 0) {
      return true;
    }

    // Check for allergen modifications
    if (changes.modified?.length > 0) {
      return changes.modified.some(change =>
        change.field === 'allergens' ||
        change.criticalChange === true ||
        change.field === 'description' && this.containsAllergenKeywords(change.newValue)
      );
    }

    return false;
  }

  /**
   * Check if text contains allergen keywords
   * @param {string} text - Text to check
   * @returns {boolean} True if allergen keywords found
   */
  containsAllergenKeywords(text) {
    if (!text) return false;

    const allergenKeywords = [
      'dairy', 'milk', 'cheese', 'cream', 'butter',
      'gluten', 'wheat', 'bread', 'flour',
      'nut', 'almond', 'walnut', 'peanut', 'cashew',
      'shellfish', 'shrimp', 'crab', 'lobster',
      'fish', 'salmon', 'tuna',
      'soy', 'tofu', 'edamame',
      'egg', 'mayonnaise',
      'sesame', 'tahini'
    ];

    const lowerText = text.toLowerCase();
    return allergenKeywords.some(keyword => lowerText.includes(keyword));
  }
}

module.exports = new ClaudeService();

/**
 * Background Service Worker for AI Menu Change Monitor
 * Handles Claude API communication, change detection scheduling, and storage management
 */

// DEMO MODE: Set to true to use mock data instead of real API calls
// This bypasses CORS issues for testing the extension UI and functionality
const DEMO_MODE = false; // Set to true to test without API

const CLAUDE_API_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-5'; // Latest and best Sonnet model
const PREMIUM_MODEL = 'claude-opus-4-20250514'; // Highest accuracy (when available)
const MAX_TOKENS = 4000;
const API_VERSION = '2023-06-01';

// Storage keys
const STORAGE_KEYS = {
  API_KEY: 'claudeApiKey',
  SETTINGS: 'settings',
  MONITORED_SITES: 'monitoredSites',
  CHANGE_HISTORY: 'changeHistory',
  ANALYSIS_CACHE: 'analysisCache'
};

// Default settings
const DEFAULT_SETTINGS = {
  model: DEFAULT_MODEL,
  checkFrequency: 'daily', // 'hourly', 'daily', 'weekly', 'manual'
  sensitivity: 'medium', // 'low', 'medium', 'high'
  notifyOnChange: true,
  useVisualAnalysis: true,
  useHtmlAnalysis: true,
  cacheResults: true,
  cacheDuration: 24 // hours
};

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS,
      [STORAGE_KEYS.MONITORED_SITES]: {},
      [STORAGE_KEYS.CHANGE_HISTORY]: [],
      [STORAGE_KEYS.ANALYSIS_CACHE]: {}
    });

    // Open options page to set API key
    chrome.tabs.create({ url: 'options/options.html' });
  }

  // Set up periodic checks
  setupAlarms();
});

/**
 * Set up alarm-based scheduling for menu checks
 */
async function setupAlarms() {
  const { settings } = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const frequency = settings?.checkFrequency || 'daily';

  // Clear existing alarms
  await chrome.alarms.clearAll();

  if (frequency !== 'manual') {
    const periodInMinutes = {
      'hourly': 60,
      'daily': 1440,
      'weekly': 10080
    }[frequency];

    chrome.alarms.create('checkMenus', {
      periodInMinutes,
      delayInMinutes: 1 // First check after 1 minute
    });
  }
}

/**
 * Handle alarm triggers
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkMenus') {
    await checkAllMonitoredSites();
  }
});

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'analyzeCurrentPage':
          const result = await analyzeCurrentPage(sender.tab);
          sendResponse({ success: true, data: result });
          break;

        case 'startMonitoring':
          await startMonitoringSite(message.url, message.siteName);
          sendResponse({ success: true });
          break;

        case 'stopMonitoring':
          await stopMonitoringSite(message.url);
          sendResponse({ success: true });
          break;

        case 'checkForChanges':
          const changes = await checkSiteForChanges(message.url);
          sendResponse({ success: true, changes });
          break;

        case 'getMonitoredSites':
          const sites = await getMonitoredSites();
          sendResponse({ success: true, sites });
          break;

        case 'getChangeHistory':
          const history = await getChangeHistory();
          sendResponse({ success: true, history });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep message channel open for async response
});

/**
 * Analyze the current page with Claude AI
 */
async function analyzeCurrentPage(tab) {
  const { settings } = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);

  // Get page content from content script
  const [htmlResult] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      html: document.documentElement.outerHTML,
      url: window.location.href,
      title: document.title
    })
  });

  const pageData = htmlResult.result;

  // Capture screenshot if visual analysis is enabled
  let screenshot = null;
  if (settings.useVisualAnalysis) {
    screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  }

  // Perform dual analysis
  const analysis = await performDualAnalysis(pageData, screenshot);

  return {
    url: pageData.url,
    title: pageData.title,
    timestamp: Date.now(),
    analysis
  };
}

/**
 * Perform dual analysis: HTML + Visual (screenshot)
 */
async function performDualAnalysis(pageData, screenshot) {
  const { settings } = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);

  const promises = [];

  // HTML analysis
  if (settings.useHtmlAnalysis) {
    promises.push(analyzeHtmlContent(pageData.html, pageData.url));
  }

  // Visual analysis
  if (settings.useVisualAnalysis && screenshot) {
    promises.push(analyzeVisualContent(screenshot, pageData.url));
  }

  const results = await Promise.all(promises);

  // Merge results from both analyses
  return mergeAnalysisResults(results);
}

/**
 * Analyze HTML content with Claude
 */
async function analyzeHtmlContent(html, url) {
  const prompt = buildMenuExtractionPrompt('html');

  const cleanedHtml = cleanHtmlForAnalysis(html);

  const response = await callClaudeAPI({
    messages: [
      {
        role: 'user',
        content: `${prompt}\n\nWebsite URL: ${url}\n\nHTML Content:\n${cleanedHtml}`
      }
    ]
  });

  return parseClaudeResponse(response, 'html');
}

/**
 * Analyze visual screenshot with Claude Vision
 */
async function analyzeVisualContent(screenshot, url) {
  const prompt = buildMenuExtractionPrompt('visual');

  // Extract base64 from data URL
  const base64Image = screenshot.split(',')[1];

  const response = await callClaudeAPI({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image
            }
          },
          {
            type: 'text',
            text: `${prompt}\n\nWebsite URL: ${url}`
          }
        ]
      }
    ]
  });

  return parseClaudeResponse(response, 'visual');
}

/**
 * Build comprehensive prompt for menu extraction
 */
function buildMenuExtractionPrompt(analysisType) {
  return `You are analyzing a restaurant website to extract complete menu information with a focus on dietary restrictions and allergen safety.

Extract ALL menu items with the following information:
1. **Item names** - Exact dish names as shown
2. **Full descriptions** - Complete ingredient lists and preparation details
3. **Allergen information** - Any mention of: gluten, wheat, dairy, milk, eggs, soy, nuts (peanuts, tree nuts), shellfish, fish, sesame, etc.
4. **Dietary labels** - vegan, vegetarian, gluten-free, dairy-free, etc.
5. **Preparation methods** - fried, grilled, baked, etc. (important for allergen cross-contamination)
6. **Prices** - if visible
7. **Portion sizes** - if mentioned
8. **Cross-contamination warnings** - "may contain", "processed in facility with", etc.

**Critical semantic understanding needed:**
- Recognize that "contains milk" = dairy allergen
- Understand "made with wheat flour" = gluten
- Identify "cooked in peanut oil" = nut exposure risk
- Detect hidden allergens (e.g., "mayo" contains eggs, "butter" is dairy)
- Understand preparation implications (e.g., "fried" might involve shared fryers with gluten)

**Return format:**
Return ONLY valid JSON (no markdown code blocks) in this exact structure:
{
  "menuItems": [
    {
      "name": "string",
      "description": "string",
      "ingredients": ["string"],
      "allergens": {
        "gluten": boolean,
        "dairy": boolean,
        "eggs": boolean,
        "soy": boolean,
        "nuts": boolean,
        "shellfish": boolean,
        "fish": boolean,
        "sesame": boolean,
        "other": ["string"]
      },
      "dietaryLabels": ["string"],
      "preparationMethod": "string",
      "price": "string",
      "warnings": ["string"],
      "confidence": number (0-1)
    }
  ],
  "menuCategories": ["string"],
  "analysisType": "${analysisType}",
  "ambiguousItems": [
    {
      "item": "string",
      "reason": "string"
    }
  ],
  "timestamp": "${new Date().toISOString()}"
}

If this is not a restaurant menu or no menu items are found, return an empty menuItems array.
Focus on accuracy over completeness - if unsure about allergen information, note it in ambiguousItems.`;
}

/**
 * Build prompt for comparing two menu snapshots
 */
function buildComparisonPrompt(oldAnalysis, newAnalysis) {
  return `You are comparing two snapshots of a restaurant menu to identify changes that affect dietary restrictions and allergen safety.

**Previous Menu Analysis:**
${JSON.stringify(oldAnalysis, null, 2)}

**Current Menu Analysis:**
${JSON.stringify(newAnalysis, null, 2)}

**Your task:**
Identify and categorize ALL changes between these two menu snapshots. Focus ONLY on changes that meaningfully impact dietary decisions.

**Changes to detect:**
1. **New dishes added** - List all new menu items
2. **Dishes removed** - List removed items (important if someone has a favorite safe dish)
3. **Name changes** - Items renamed but possibly same dish
4. **Allergen additions** - NEW allergens introduced to existing dishes (CRITICAL)
5. **Allergen removals** - Allergens removed from dishes (POSITIVE change)
6. **Description modifications** - Changes to ingredients or preparation that affect dietary restrictions
7. **Preparation method changes** - e.g., "grilled" to "fried" (affects cross-contamination)
8. **Warning changes** - New or removed cross-contamination warnings

**IGNORE these changes:**
- Price changes (unless specifically requested)
- Pure formatting/cosmetic changes
- Reordering of menu items
- Minor typo corrections that don't affect meaning

**Return format:**
Return ONLY valid JSON (no markdown code blocks):
{
  "hasChanges": boolean,
  "changesSummary": "string - brief overview",
  "criticalChanges": [
    {
      "type": "allergen_added" | "allergen_removed" | "dish_modified" | "dish_added" | "dish_removed" | "preparation_changed",
      "severity": "critical" | "important" | "minor",
      "itemName": "string",
      "description": "string - what changed",
      "dietaryImpact": ["gluten", "dairy", "nuts", etc.],
      "oldValue": "string",
      "newValue": "string"
    }
  ],
  "newDishes": ["string"],
  "removedDishes": ["string"],
  "modifiedDishes": [
    {
      "name": "string",
      "changes": ["string"]
    }
  ],
  "affectedDiets": {
    "celiac": boolean,
    "nutAllergy": boolean,
    "dairyIntolerant": boolean,
    "vegan": boolean,
    "vegetarian": boolean,
    "other": ["string"]
  },
  "timestamp": "${new Date().toISOString()}"
}`;
}

/**
 * Clean HTML to reduce token usage
 */
function cleanHtmlForAnalysis(html) {
  // Remove scripts, styles, comments
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Limit size (Claude has token limits)
  const maxLength = 50000; // Approximately 12k tokens
  if (cleaned.length > maxLength) {
    // Try to find menu-related sections
    const menuSectionPatterns = [
      /<section[^>]*menu[^>]*>[\s\S]*?<\/section>/gi,
      /<div[^>]*menu[^>]*>[\s\S]*?<\/div>/gi,
      /<article[^>]*menu[^>]*>[\s\S]*?<\/article>/gi
    ];

    let menuSection = null;
    for (const pattern of menuSectionPatterns) {
      const matches = cleaned.match(pattern);
      if (matches && matches.length > 0) {
        menuSection = matches.join('\n');
        break;
      }
    }

    cleaned = menuSection || cleaned.substring(0, maxLength);
  }

  return cleaned;
}

/**
 * Generate mock AI response for demo mode
 */
function generateMockResponse(promptText) {
  // Simple mock data for testing
  const mockMenuAnalysis = {
    menuItems: [
      {
        name: "Classic Caesar Salad",
        description: "Crisp romaine lettuce with house-made caesar dressing",
        ingredients: ["romaine lettuce", "parmesan cheese", "croutons", "caesar dressing"],
        allergens: {
          gluten: true,
          dairy: true,
          eggs: true,
          soy: false,
          nuts: false,
          shellfish: false,
          fish: false,
          sesame: false,
          other: []
        },
        dietaryLabels: [],
        preparationMethod: "fresh",
        price: "$8.00",
        warnings: [],
        confidence: 0.95
      },
      {
        name: "Grilled Atlantic Salmon",
        description: "Fresh salmon with lemon butter sauce",
        ingredients: ["salmon", "butter", "lemon", "vegetables"],
        allergens: {
          gluten: false,
          dairy: true,
          eggs: false,
          soy: false,
          nuts: false,
          shellfish: false,
          fish: true,
          sesame: false,
          other: []
        },
        dietaryLabels: ["gluten-free"],
        preparationMethod: "grilled",
        price: "$24.00",
        warnings: [],
        confidence: 0.98
      },
      {
        name: "Margherita Pizza",
        description: "Traditional pizza with mozzarella and basil",
        ingredients: ["dough", "mozzarella", "tomato sauce", "basil"],
        allergens: {
          gluten: true,
          dairy: true,
          eggs: false,
          soy: false,
          nuts: false,
          shellfish: false,
          fish: false,
          sesame: false,
          other: []
        },
        dietaryLabels: ["vegetarian"],
        preparationMethod: "baked",
        price: "$14.00",
        warnings: [],
        confidence: 0.97
      }
    ],
    menuCategories: ["Appetizers", "Main Courses", "Desserts"],
    analysisType: "demo",
    ambiguousItems: [],
    timestamp: new Date().toISOString()
  };

  return JSON.stringify(mockMenuAnalysis);
}

/**
 * Call Claude API with retry logic and error handling
 */
async function callClaudeAPI(params, maxRetries = 3) {
  // DEMO MODE: Return mock data
  if (DEMO_MODE) {
    console.log('[DEMO MODE] Using mock AI response');
    await sleep(2000); // Simulate API delay
    const promptText = params.messages?.[0]?.content || '';
    return generateMockResponse(promptText);
  }

  const { claudeApiKey, settings } = await chrome.storage.local.get([
    STORAGE_KEYS.API_KEY,
    STORAGE_KEYS.SETTINGS
  ]);

  if (!claudeApiKey) {
    throw new Error('Claude API key not configured. Please set it in the extension options.');
  }

  const model = settings?.model || DEFAULT_MODEL;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(CLAUDE_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          ...params
        })
      });

      if (!response.ok) {
        const error = await response.json();

        // Handle rate limiting
        if (response.status === 429) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await sleep(delay);
          continue;
        }

        throw new Error(`API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.content[0].text;

    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }

      // Wait before retry
      await sleep(1000 * (attempt + 1));
    }
  }
}

/**
 * Parse Claude's response
 */
function parseClaudeResponse(response, analysisType) {
  try {
    // Remove markdown code blocks if present
    let cleaned = response.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/```\n?/g, '');
    }

    const parsed = JSON.parse(cleaned);
    parsed.analysisType = analysisType;

    return parsed;
  } catch (error) {
    console.error('Failed to parse Claude response:', error);
    console.error('Response was:', response);

    return {
      menuItems: [],
      error: 'Failed to parse AI response',
      rawResponse: response,
      analysisType
    };
  }
}

/**
 * Merge results from HTML and Visual analysis
 */
function mergeAnalysisResults(results) {
  if (results.length === 0) {
    return { menuItems: [], menuCategories: [] };
  }

  if (results.length === 1) {
    return results[0];
  }

  // Merge HTML and Visual results
  const [result1, result2] = results;

  // Use the one with more menu items as base
  const base = result1.menuItems.length >= result2.menuItems.length ? result1 : result2;
  const supplement = result1.menuItems.length >= result2.menuItems.length ? result2 : result1;

  // Merge menu items by name
  const mergedItems = [...base.menuItems];
  const itemNames = new Set(base.menuItems.map(item => item.name.toLowerCase()));

  for (const item of supplement.menuItems) {
    if (!itemNames.has(item.name.toLowerCase())) {
      mergedItems.push(item);
    }
  }

  return {
    menuItems: mergedItems,
    menuCategories: [
      ...new Set([
        ...(base.menuCategories || []),
        ...(supplement.menuCategories || [])
      ])
    ],
    analysisTypes: ['html', 'visual'],
    ambiguousItems: [
      ...(base.ambiguousItems || []),
      ...(supplement.ambiguousItems || [])
    ]
  };
}

/**
 * Start monitoring a site
 */
async function startMonitoringSite(url, siteName) {
  const { monitoredSites } = await chrome.storage.local.get(STORAGE_KEYS.MONITORED_SITES);

  // Get current tab to analyze
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const analysis = await analyzeCurrentPage(tab);

  monitoredSites[url] = {
    url,
    siteName: siteName || new URL(url).hostname,
    addedAt: Date.now(),
    lastChecked: Date.now(),
    lastAnalysis: analysis,
    changeCount: 0
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.MONITORED_SITES]: monitoredSites });
}

/**
 * Stop monitoring a site
 */
async function stopMonitoringSite(url) {
  const { monitoredSites } = await chrome.storage.local.get(STORAGE_KEYS.MONITORED_SITES);
  delete monitoredSites[url];
  await chrome.storage.local.set({ [STORAGE_KEYS.MONITORED_SITES]: monitoredSites });
}

/**
 * Get all monitored sites
 */
async function getMonitoredSites() {
  const { monitoredSites } = await chrome.storage.local.get(STORAGE_KEYS.MONITORED_SITES);
  return monitoredSites || {};
}

/**
 * Check a specific site for changes
 */
async function checkSiteForChanges(url) {
  const { monitoredSites } = await chrome.storage.local.get(STORAGE_KEYS.MONITORED_SITES);
  const site = monitoredSites[url];

  if (!site) {
    throw new Error('Site not being monitored');
  }

  // Open the site in a new tab
  const tab = await chrome.tabs.create({ url, active: false });

  // Wait for page to load
  await new Promise(resolve => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    });
  });

  // Analyze the page
  const newAnalysis = await analyzeCurrentPage(tab);

  // Close the tab
  await chrome.tabs.remove(tab.id);

  // Compare with previous analysis
  const changes = await compareAnalyses(site.lastAnalysis.analysis, newAnalysis.analysis);

  // Update stored data
  site.lastChecked = Date.now();
  if (changes.hasChanges) {
    site.lastAnalysis = newAnalysis;
    site.changeCount++;

    // Add to change history
    await addToChangeHistory({
      url,
      siteName: site.siteName,
      timestamp: Date.now(),
      changes
    });

    // Send notification if enabled
    const { settings } = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    if (settings.notifyOnChange) {
      await notifyUserOfChanges(site.siteName, changes);
    }
  }

  monitoredSites[url] = site;
  await chrome.storage.local.set({ [STORAGE_KEYS.MONITORED_SITES]: monitoredSites });

  return changes;
}

/**
 * Compare two analyses to detect changes
 */
async function compareAnalyses(oldAnalysis, newAnalysis) {
  const prompt = buildComparisonPrompt(oldAnalysis, newAnalysis);

  const response = await callClaudeAPI({
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  return parseClaudeResponse(response, 'comparison');
}

/**
 * Check all monitored sites
 */
async function checkAllMonitoredSites() {
  const sites = await getMonitoredSites();

  for (const url of Object.keys(sites)) {
    try {
      await checkSiteForChanges(url);
      // Add delay between checks to avoid rate limiting
      await sleep(2000);
    } catch (error) {
      console.error(`Error checking ${url}:`, error);
    }
  }
}

/**
 * Add to change history
 */
async function addToChangeHistory(changeRecord) {
  const { changeHistory } = await chrome.storage.local.get(STORAGE_KEYS.CHANGE_HISTORY);

  changeHistory.unshift(changeRecord);

  // Keep only last 100 changes
  if (changeHistory.length > 100) {
    changeHistory.splice(100);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.CHANGE_HISTORY]: changeHistory });
}

/**
 * Get change history
 */
async function getChangeHistory() {
  const { changeHistory } = await chrome.storage.local.get(STORAGE_KEYS.CHANGE_HISTORY);
  return changeHistory || [];
}

/**
 * Send notification to user
 */
async function notifyUserOfChanges(siteName, changes) {
  const criticalCount = changes.criticalChanges?.filter(c => c.severity === 'critical').length || 0;
  const importantCount = changes.criticalChanges?.filter(c => c.severity === 'important').length || 0;

  let message = changes.changesSummary;
  if (criticalCount > 0) {
    message = `${criticalCount} critical allergen change(s) detected! ${message}`;
  }

  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `Menu Changes: ${siteName}`,
    message,
    priority: criticalCount > 0 ? 2 : 1
  });
}

/**
 * Utility: Sleep function
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildMenuExtractionPrompt,
    buildComparisonPrompt,
    cleanHtmlForAnalysis,
    parseClaudeResponse,
    mergeAnalysisResults
  };
}

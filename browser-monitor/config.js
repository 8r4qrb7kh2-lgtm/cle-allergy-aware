// Configuration file for the Menu Change Monitor extension
const CONFIG = {
  // Replace with your actual Claude API key
  CLAUDE_API_KEY: 'YOUR_CLAUDE_API_KEY_HERE',

  // Replace with your actual allergy website URL
  ALLERGY_WEBSITE_URL: 'https://your-allergy-website.com/restaurant/edit',

  // Claude API endpoint
  CLAUDE_API_ENDPOINT: 'https://api.anthropic.com/v1/messages',

  // Claude model to use
  CLAUDE_MODEL: 'claude-3-5-sonnet-20241022',

  // Minimum time between checks (in milliseconds)
  CHECK_DEBOUNCE_TIME: 2000,

  // Storage keys
  STORAGE_KEYS: {
    MENU_STATE: 'menuState',
    ENABLED_DOMAINS: 'enabledDomains',
    API_KEY: 'claudeApiKey',
    WEBSITE_URL: 'allergyWebsiteUrl'
  }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}

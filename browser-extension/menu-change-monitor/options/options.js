/**
 * Options Page Script
 */

const DEFAULT_SETTINGS = {
  model: 'claude-sonnet-4-5',
  checkFrequency: 'daily',
  sensitivity: 'medium',
  notifyOnChange: true,
  useVisualAnalysis: true,
  useHtmlAnalysis: true,
  cacheResults: true,
  cacheDuration: 24
};

// Initialize options page
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadStats();
  setupEventListeners();
  updateCostEstimate();
});

/**
 * Load settings from storage
 */
async function loadSettings() {
  const { claudeApiKey, settings } = await chrome.storage.local.get([
    'claudeApiKey',
    'settings'
  ]);

  // Load API key
  if (claudeApiKey) {
    document.getElementById('apiKey').value = claudeApiKey;
  }

  // Load settings
  const currentSettings = { ...DEFAULT_SETTINGS, ...settings };

  document.getElementById('model').value = currentSettings.model;
  document.getElementById('checkFrequency').value = currentSettings.checkFrequency;
  document.getElementById('sensitivity').value = currentSettings.sensitivity;
  document.getElementById('notifyOnChange').checked = currentSettings.notifyOnChange;
  document.getElementById('useVisualAnalysis').checked = currentSettings.useVisualAnalysis;
  document.getElementById('useHtmlAnalysis').checked = currentSettings.useHtmlAnalysis;
  document.getElementById('cacheResults').checked = currentSettings.cacheResults;
}

/**
 * Load usage statistics
 */
async function loadStats() {
  const { monitoredSites, changeHistory } = await chrome.storage.local.get([
    'monitoredSites',
    'changeHistory'
  ]);

  const siteCount = Object.keys(monitoredSites || {}).length;
  const changeCount = (changeHistory || []).length;

  document.getElementById('sitesMonitored').textContent = siteCount;
  document.getElementById('changesDetected').textContent = changeCount;

  // Find most recent check
  const sites = Object.values(monitoredSites || {});
  if (sites.length > 0) {
    const mostRecent = Math.max(...sites.map(s => s.lastChecked || 0));
    document.getElementById('lastCheck').textContent = getTimeAgo(new Date(mostRecent));
  } else {
    document.getElementById('lastCheck').textContent = 'Never';
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  document.getElementById('saveBtn').addEventListener('click', saveSettings);
  document.getElementById('clearCache').addEventListener('click', clearCache);
  document.getElementById('clearHistory').addEventListener('click', clearHistory);
  document.getElementById('resetSettings').addEventListener('click', resetSettings);

  // Update cost estimate when settings change
  const settingsInputs = [
    'model',
    'checkFrequency',
    'useVisualAnalysis',
    'useHtmlAnalysis'
  ];

  settingsInputs.forEach(id => {
    const element = document.getElementById(id);
    element.addEventListener('change', updateCostEstimate);
  });
}

/**
 * Save settings
 */
async function saveSettings() {
  const apiKey = document.getElementById('apiKey').value.trim();

  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    showSaveStatus('Please enter a valid Claude API key (starts with sk-ant-)', 'error');
    return;
  }

  const settings = {
    model: document.getElementById('model').value,
    checkFrequency: document.getElementById('checkFrequency').value,
    sensitivity: document.getElementById('sensitivity').value,
    notifyOnChange: document.getElementById('notifyOnChange').checked,
    useVisualAnalysis: document.getElementById('useVisualAnalysis').checked,
    useHtmlAnalysis: document.getElementById('useHtmlAnalysis').checked,
    cacheResults: document.getElementById('cacheResults').checked,
    cacheDuration: 24
  };

  // Validate analysis settings
  if (!settings.useVisualAnalysis && !settings.useHtmlAnalysis) {
    showSaveStatus('At least one analysis type must be enabled', 'error');
    return;
  }

  try {
    await chrome.storage.local.set({
      claudeApiKey: apiKey,
      settings
    });

    // Update alarms based on new frequency
    await setupAlarms(settings.checkFrequency);

    showSaveStatus('Settings saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showSaveStatus('Failed to save settings: ' + error.message, 'error');
  }
}

/**
 * Setup alarms for monitoring
 */
async function setupAlarms(frequency) {
  await chrome.alarms.clearAll();

  if (frequency !== 'manual') {
    const periodInMinutes = {
      'hourly': 60,
      'daily': 1440,
      'weekly': 10080
    }[frequency];

    await chrome.alarms.create('checkMenus', {
      periodInMinutes,
      delayInMinutes: 1
    });
  }
}

/**
 * Clear cache
 */
async function clearCache() {
  if (!confirm('Clear all cached analysis results?')) return;

  try {
    await chrome.storage.local.set({ analysisCache: {} });
    showSaveStatus('Cache cleared successfully', 'success');
  } catch (error) {
    showSaveStatus('Failed to clear cache: ' + error.message, 'error');
  }
}

/**
 * Clear history
 */
async function clearHistory() {
  if (!confirm('Clear all change detection history?')) return;

  try {
    await chrome.storage.local.set({ changeHistory: [] });
    await loadStats();
    showSaveStatus('History cleared successfully', 'success');
  } catch (error) {
    showSaveStatus('Failed to clear history: ' + error.message, 'error');
  }
}

/**
 * Reset all settings
 */
async function resetSettings() {
  if (!confirm('Reset all settings to defaults? This will NOT delete your API key or monitored sites.')) {
    return;
  }

  try {
    await chrome.storage.local.set({
      settings: DEFAULT_SETTINGS,
      analysisCache: {},
      changeHistory: []
    });

    await loadSettings();
    await loadStats();
    updateCostEstimate();

    showSaveStatus('Settings reset to defaults', 'success');
  } catch (error) {
    showSaveStatus('Failed to reset settings: ' + error.message, 'error');
  }
}

/**
 * Update cost estimate based on current settings
 */
async function updateCostEstimate() {
  const model = document.getElementById('model').value;
  const frequency = document.getElementById('checkFrequency').value;
  const useVisual = document.getElementById('useVisualAnalysis').checked;
  const useHtml = document.getElementById('useHtmlAnalysis').checked;

  const { monitoredSites } = await chrome.storage.local.get('monitoredSites');
  const siteCount = Object.keys(monitoredSites || {}).length || 1; // Assume 1 site minimum

  // Rough token estimates
  const htmlTokens = 8000; // Average page HTML after cleaning
  const visualTokens = 1600; // Image tokens
  const outputTokens = 2000;

  // Cost per million tokens (approximate)
  const costs = {
    'claude-sonnet-4-5': { input: 3, output: 15 },
    'claude-opus-4-20250514': { input: 15, output: 75 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 }
  };

  const modelCosts = costs[model] || costs['claude-sonnet-4-5'];

  let tokensPerCheck = outputTokens;
  if (useHtml) tokensPerCheck += htmlTokens;
  if (useVisual) tokensPerCheck += visualTokens;

  // Checks per month
  const checksPerMonth = {
    'manual': 4, // Assume 4 manual checks
    'hourly': 24 * 30 * siteCount,
    'daily': 30 * siteCount,
    'weekly': 4 * siteCount
  }[frequency];

  const totalInputTokens = tokensPerCheck * checksPerMonth;
  const totalOutputTokens = outputTokens * checksPerMonth;

  const monthlyCost =
    (totalInputTokens / 1000000) * modelCosts.input +
    (totalOutputTokens / 1000000) * modelCosts.output;

  const costElement = document.getElementById('costEstimate');
  costElement.innerHTML = `
    <strong>Estimated monthly cost:</strong> $${monthlyCost.toFixed(2)}
    <br>
    <span style="font-size: 12px; opacity: 0.8;">
      Based on ${siteCount} monitored site(s), ${frequency} checks
      <br>
      ~${Math.round(totalInputTokens / 1000)}K input tokens, ~${Math.round(totalOutputTokens / 1000)}K output tokens per month
    </span>
  `;
}

/**
 * Show save status message
 */
function showSaveStatus(message, type) {
  const statusElement = document.getElementById('saveStatus');
  statusElement.textContent = message;
  statusElement.className = `save-status ${type}`;
  statusElement.classList.remove('hidden');

  setTimeout(() => {
    statusElement.classList.add('hidden');
  }, 5000);
}

/**
 * Utility: Get time ago string
 */
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return interval + ' year' + (interval === 1 ? '' : 's') + ' ago';

  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + ' month' + (interval === 1 ? '' : 's') + ' ago';

  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + ' day' + (interval === 1 ? '' : 's') + ' ago';

  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + ' hour' + (interval === 1 ? '' : 's') + ' ago';

  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + ' minute' + (interval === 1 ? '' : 's') + ' ago';

  return 'just now';
}

/**
 * Popup UI Script
 */

let currentTab = null;
let isMonitoring = false;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentTab();
  await loadMonitoredSites();
  await loadRecentChanges();
  setupEventListeners();
  checkApiKeyStatus();
});

/**
 * Load current tab information
 */
async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  const pageUrl = document.getElementById('pageUrl');
  if (tab) {
    pageUrl.textContent = tab.url;

    // Check if this site is already being monitored
    const response = await chrome.runtime.sendMessage({ type: 'getMonitoredSites' });
    if (response.success) {
      isMonitoring = response.sites[tab.url] !== undefined;
      updateMonitorButton();
    }
  } else {
    pageUrl.textContent = 'No active tab';
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  document.getElementById('analyzeBtn').addEventListener('click', analyzeCurrentPage);
  document.getElementById('monitorBtn').addEventListener('click', toggleMonitoring);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('refreshBtn').addEventListener('click', refreshAll);
}

/**
 * Check if API key is configured
 */
async function checkApiKeyStatus() {
  const { claudeApiKey } = await chrome.storage.local.get('claudeApiKey');

  if (!claudeApiKey) {
    setStatus('error', 'API key not configured');
    showNotice('Please configure your Claude API key in settings', 'warning');
  } else {
    setStatus('ready', 'Ready');
  }
}

/**
 * Analyze current page
 */
async function analyzeCurrentPage() {
  if (!currentTab) return;

  setStatus('loading', 'Analyzing page...');
  disableButton('analyzeBtn');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'analyzeCurrentPage'
    });

    if (response.success) {
      displayAnalysisResults(response.data);
      setStatus('ready', 'Analysis complete');
    } else {
      throw new Error(response.error || 'Analysis failed');
    }
  } catch (error) {
    console.error('Analysis error:', error);
    setStatus('error', 'Analysis failed');
    showNotice(error.message, 'error');
  } finally {
    enableButton('analyzeBtn');
  }
}

/**
 * Toggle monitoring for current site
 */
async function toggleMonitoring() {
  if (!currentTab) return;

  const btn = document.getElementById('monitorBtn');
  btn.disabled = true;

  try {
    if (isMonitoring) {
      // Stop monitoring
      const response = await chrome.runtime.sendMessage({
        type: 'stopMonitoring',
        url: currentTab.url
      });

      if (response.success) {
        isMonitoring = false;
        updateMonitorButton();
        await loadMonitoredSites();
        showNotice('Stopped monitoring this site', 'success');
      }
    } else {
      // Start monitoring
      const siteName = prompt('Enter a name for this restaurant:');
      if (!siteName) {
        btn.disabled = false;
        return;
      }

      setStatus('loading', 'Starting monitoring...');

      const response = await chrome.runtime.sendMessage({
        type: 'startMonitoring',
        url: currentTab.url,
        siteName
      });

      if (response.success) {
        isMonitoring = true;
        updateMonitorButton();
        await loadMonitoredSites();
        setStatus('ready', 'Monitoring started');
        showNotice(`Now monitoring: ${siteName}`, 'success');
      }
    }
  } catch (error) {
    console.error('Monitoring error:', error);
    showNotice(error.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/**
 * Update monitor button state
 */
function updateMonitorButton() {
  const btn = document.getElementById('monitorBtn');
  const btnText = document.getElementById('monitorBtnText');

  if (isMonitoring) {
    btn.classList.add('monitoring');
    btnText.textContent = 'Stop Monitoring';
    btn.querySelector('.btn-icon').textContent = '⏹️';
  } else {
    btn.classList.remove('monitoring');
    btnText.textContent = 'Start Monitoring';
    btn.querySelector('.btn-icon').textContent = '👁️';
  }
}

/**
 * Display analysis results
 */
function displayAnalysisResults(data) {
  const resultSection = document.getElementById('analysisResult');
  const content = document.getElementById('analysisContent');

  resultSection.classList.remove('hidden');

  const analysis = data.analysis;
  const menuItems = analysis.menuItems || [];

  let html = `
    <div class="analysis-summary">
      <h3>📊 Analysis Summary</h3>
      <p>Found ${menuItems.length} menu items</p>
      <p style="font-size: 11px; margin-top: 4px; opacity: 0.8;">
        Analysis types: ${analysis.analysisTypes ? analysis.analysisTypes.join(', ') : analysis.analysisType}
      </p>
    </div>
  `;

  if (menuItems.length > 0) {
    html += '<div class="menu-items-list">';

    menuItems.slice(0, 10).forEach(item => {
      const allergens = [];
      if (item.allergens) {
        for (const [allergen, present] of Object.entries(item.allergens)) {
          if (present && allergen !== 'other') {
            allergens.push(allergen);
          }
        }
        if (item.allergens.other && item.allergens.other.length > 0) {
          allergens.push(...item.allergens.other);
        }
      }

      html += `
        <div class="menu-item">
          <div class="menu-item-name">${escapeHtml(item.name)}</div>
          <div style="font-size: 11px; color: #6c757d; margin-top: 2px;">
            ${escapeHtml(truncate(item.description, 100))}
          </div>
          ${allergens.length > 0 ? `
            <div class="menu-item-allergens">
              ${allergens.map(a => `<span class="allergen-tag">${escapeHtml(a)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
    });

    if (menuItems.length > 10) {
      html += `<p style="text-align: center; color: #6c757d; font-size: 11px; margin-top: 8px;">
        ... and ${menuItems.length - 10} more items
      </p>`;
    }

    html += '</div>';
  } else {
    html += '<p class="empty-state">No menu items detected on this page</p>';
  }

  content.innerHTML = html;
}

/**
 * Load monitored sites
 */
async function loadMonitoredSites() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getMonitoredSites' });

    if (response.success) {
      displayMonitoredSites(response.sites);
    }
  } catch (error) {
    console.error('Error loading monitored sites:', error);
  }
}

/**
 * Display monitored sites
 */
function displayMonitoredSites(sites) {
  const container = document.getElementById('monitoredSites');

  const sitesList = Object.values(sites);

  if (sitesList.length === 0) {
    container.innerHTML = '<p class="empty-state">No sites being monitored</p>';
    return;
  }

  let html = '';
  sitesList.forEach(site => {
    const lastChecked = new Date(site.lastChecked);
    const timeAgo = getTimeAgo(lastChecked);

    html += `
      <div class="monitored-site">
        <div class="monitored-site-info">
          <div class="monitored-site-name">${escapeHtml(site.siteName)}</div>
          <div class="monitored-site-url">${escapeHtml(truncate(site.url, 40))}</div>
          <div style="font-size: 10px; color: #6c757d; margin-top: 2px;">
            Last checked: ${timeAgo} • Changes: ${site.changeCount}
          </div>
        </div>
        <div class="monitored-site-actions">
          <button class="btn-small" onclick="checkSite('${escapeHtml(site.url)}')">Check</button>
          <button class="btn-small danger" onclick="removeSite('${escapeHtml(site.url)}')">Remove</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/**
 * Load recent changes
 */
async function loadRecentChanges() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getChangeHistory' });

    if (response.success) {
      displayRecentChanges(response.history);
    }
  } catch (error) {
    console.error('Error loading change history:', error);
  }
}

/**
 * Display recent changes
 */
function displayRecentChanges(history) {
  const container = document.getElementById('recentChanges');

  if (history.length === 0) {
    container.innerHTML = '<p class="empty-state">No changes detected</p>';
    return;
  }

  let html = '';
  history.slice(0, 5).forEach(change => {
    const timestamp = new Date(change.timestamp);
    const timeAgo = getTimeAgo(timestamp);

    const hasCritical = change.changes.criticalChanges?.some(c => c.severity === 'critical');
    const hasImportant = change.changes.criticalChanges?.some(c => c.severity === 'important');
    const cssClass = hasCritical ? 'critical' : (hasImportant ? 'important' : '');

    html += `
      <div class="change-item ${cssClass}">
        <div class="change-header">
          <span class="change-site">${escapeHtml(change.siteName)}</span>
          <span class="change-time">${timeAgo}</span>
        </div>
        <div class="change-description">
          ${escapeHtml(change.changes.changesSummary || 'Menu changes detected')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/**
 * Check a specific site for changes
 */
window.checkSite = async function(url) {
  setStatus('loading', 'Checking for changes...');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'checkForChanges',
      url
    });

    if (response.success) {
      if (response.changes.hasChanges) {
        showNotice('Changes detected!', 'warning');
        await loadRecentChanges();
      } else {
        showNotice('No changes detected', 'success');
      }
      setStatus('ready', 'Check complete');
    }
  } catch (error) {
    console.error('Check error:', error);
    showNotice(error.message, 'error');
    setStatus('error', 'Check failed');
  }
};

/**
 * Remove a site from monitoring
 */
window.removeSite = async function(url) {
  if (!confirm('Stop monitoring this site?')) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'stopMonitoring',
      url
    });

    if (response.success) {
      await loadMonitoredSites();
      showNotice('Site removed from monitoring', 'success');
    }
  } catch (error) {
    console.error('Remove error:', error);
    showNotice(error.message, 'error');
  }
};

/**
 * Open settings page
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Refresh all data
 */
async function refreshAll() {
  await loadCurrentTab();
  await loadMonitoredSites();
  await loadRecentChanges();
  showNotice('Refreshed', 'success');
}

/**
 * Set status indicator
 */
function setStatus(type, text) {
  const indicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const dot = indicator.querySelector('.status-dot');

  statusText.textContent = text;

  dot.classList.remove('error', 'warning');
  if (type === 'error') {
    dot.classList.add('error');
  } else if (type === 'warning' || type === 'loading') {
    dot.classList.add('warning');
  }
}

/**
 * Show temporary notice
 */
function showNotice(message, type = 'info') {
  // Simple console log for now
  console.log(`[${type.toUpperCase()}]`, message);
  // TODO: Implement toast notifications
}

/**
 * Utility functions
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return interval + 'y ago';

  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + 'mo ago';

  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + 'd ago';

  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + 'h ago';

  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + 'm ago';

  return 'just now';
}

function disableButton(id) {
  document.getElementById(id).disabled = true;
}

function enableButton(id) {
  document.getElementById(id).disabled = false;
}

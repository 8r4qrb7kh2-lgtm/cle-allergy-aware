// Popup script for the Menu Change Monitor extension

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentState();
  setupEventListeners();
  loadHistory();
});

async function loadCurrentState() {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = new URL(tab.url).hostname;

  document.getElementById('currentSite').textContent = domain;

  // Load settings
  chrome.storage.local.get(['claudeApiKey', 'allergyWebsiteUrl', 'enabledDomains'], (result) => {
    const apiKey = result.claudeApiKey || '';
    const websiteUrl = result.allergyWebsiteUrl || '';
    const enabledDomains = result.enabledDomains || {};

    if (apiKey && apiKey !== 'YOUR_CLAUDE_API_KEY_HERE') {
      document.getElementById('apiKeyInput').value = apiKey;
    }

    if (websiteUrl && websiteUrl !== 'https://your-allergy-website.com/restaurant/edit') {
      document.getElementById('websiteUrlInput').value = websiteUrl;
    }

    // Set toggle state
    const isEnabled = enabledDomains[domain] === true;
    const toggle = document.getElementById('monitorToggle');
    if (isEnabled) {
      toggle.classList.add('active');
    }
  });
}

function setupEventListeners() {
  // Save settings button
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    const websiteUrl = document.getElementById('websiteUrlInput').value.trim();

    if (!apiKey) {
      alert('Please enter your Claude API key');
      return;
    }

    if (!websiteUrl) {
      alert('Please enter your allergy website URL');
      return;
    }

    chrome.storage.local.set({
      claudeApiKey: apiKey,
      allergyWebsiteUrl: websiteUrl
    }, () => {
      showSavedMessage();
    });
  });

  // Monitor toggle
  document.getElementById('monitorToggle').addEventListener('click', async () => {
    const toggle = document.getElementById('monitorToggle');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const domain = new URL(tab.url).hostname;

    chrome.storage.local.get(['enabledDomains'], (result) => {
      const enabledDomains = result.enabledDomains || {};
      const isEnabled = enabledDomains[domain] === true;

      // Toggle state
      enabledDomains[domain] = !isEnabled;

      chrome.storage.local.set({ enabledDomains }, () => {
        if (enabledDomains[domain]) {
          toggle.classList.add('active');
          // Notify content script to start monitoring
          chrome.tabs.sendMessage(tab.id, { type: 'ENABLE_MONITORING' });
          showSavedMessage('Monitoring enabled for this site');
        } else {
          toggle.classList.remove('active');
          // Notify content script to stop monitoring
          chrome.tabs.sendMessage(tab.id, { type: 'DISABLE_MONITORING' });
          showSavedMessage('Monitoring disabled for this site');
        }
      });
    });
  });

  // Test now button
  document.getElementById('testNowBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const domain = new URL(tab.url).hostname;

    chrome.storage.local.get(['enabledDomains'], (result) => {
      const enabledDomains = result.enabledDomains || {};

      if (!enabledDomains[domain]) {
        alert('Please enable monitoring for this site first');
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'TEST_NOW' }, (response) => {
        if (chrome.runtime.lastError) {
          alert('Error: Please refresh the page and try again');
        } else {
          showSavedMessage('Testing menu detection...');
        }
      });
    });
  });

  // Clear data button
  document.getElementById('clearDataBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all data? This will remove all stored menu states and change history.')) {
      chrome.storage.local.clear(() => {
        showSavedMessage('All data cleared');
        setTimeout(() => {
          window.close();
        }, 1000);
      });
    }
  });
}

function loadHistory() {
  chrome.storage.local.get(['changeHistory'], (result) => {
    const history = result.changeHistory || [];
    const container = document.getElementById('historyContainer');

    if (history.length === 0) {
      container.innerHTML = '<div class="no-history">No changes detected yet</div>';
      return;
    }

    container.innerHTML = history.slice(0, 5).map(event => {
      const date = new Date(event.timestamp);
      const timeStr = date.toLocaleString();

      let changesText = '';
      if (event.changes) {
        const parts = [];
        if (event.changes.added?.length) parts.push(`+${event.changes.added.length} added`);
        if (event.changes.removed?.length) parts.push(`-${event.changes.removed.length} removed`);
        if (event.changes.modified?.length) parts.push(`~${event.changes.modified.length} modified`);
        changesText = parts.join(', ');
      }

      return `
        <div class="history-item">
          <div class="history-domain">${event.domain}</div>
          <div style="font-size: 11px; color: #666; margin-bottom: 4px;">${changesText}</div>
          <div class="history-time">${timeStr}</div>
        </div>
      `;
    }).join('');
  });
}

function showSavedMessage(message = 'Settings saved!') {
  const element = document.getElementById('settingsSaved');
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => {
    element.classList.remove('show');
  }, 2000);
}

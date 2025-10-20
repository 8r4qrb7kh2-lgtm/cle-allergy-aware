// Popup script for Clarivore Menu Manager

document.addEventListener('DOMContentLoaded', () => {
  const restaurantSlugInput = document.getElementById('restaurant-slug');
  const enabledToggle = document.getElementById('enabled-toggle');
  const saveBtn = document.getElementById('save-btn');
  const openClarivoreBtn = document.getElementById('open-clarivore-btn');
  const savedMessage = document.getElementById('saved-message');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const platformText = document.getElementById('platform-text');

  const restaurantUrlInput = document.getElementById('restaurant-url');

  // Load saved settings
  chrome.storage.sync.get(['restaurantSlug', 'restaurantUrl', 'enabled'], (result) => {
    restaurantSlugInput.value = result.restaurantSlug || '';
    restaurantUrlInput.value = result.restaurantUrl || '';
    enabledToggle.checked = result.enabled !== false;

    updateStatusUI(result.enabled !== false);
  });

  // Get current page status
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
          platformText.textContent = 'Not detected';
          return;
        }

        if (response && response.platform) {
          platformText.textContent = response.platform.platform;

          if (response.platform.isEditor) {
            platformText.textContent += ' (Editor)';
          }

          if (response.changesDetected > 0) {
            platformText.textContent += ` - ${response.changesDetected} changes`;
          }
        } else {
          platformText.textContent = 'Not detected';
        }
      });
    }
  });

  // Save button
  saveBtn.addEventListener('click', () => {
    const restaurantSlug = restaurantSlugInput.value.trim();
    const restaurantUrl = restaurantUrlInput.value.trim();
    const enabled = enabledToggle.checked;

    if (!restaurantSlug) {
      alert('Please enter your restaurant slug');
      return;
    }

    if (!restaurantUrl) {
      alert('Please enter your restaurant website URL');
      return;
    }

    // Validate URL format
    try {
      new URL(restaurantUrl);
    } catch (e) {
      alert('Please enter a valid URL (e.g., https://mamasantas.com)');
      return;
    }

    chrome.storage.sync.set({
      restaurantSlug: restaurantSlug,
      restaurantUrl: restaurantUrl,
      enabled: enabled
    }, () => {
      // Show saved message
      savedMessage.classList.add('show');
      setTimeout(() => {
        savedMessage.classList.remove('show');
      }, 3000);

      // Update monitoring status in content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          const message = enabled ? { type: 'ENABLE_MONITORING' } : { type: 'DISABLE_MONITORING' };
          chrome.tabs.sendMessage(tabs[0].id, message);
        }
      });

      updateStatusUI(enabled);
    });
  });

  // Open Clarivore button
  openClarivoreBtn.addEventListener('click', () => {
    const restaurantSlug = restaurantSlugInput.value.trim();

    if (!restaurantSlug) {
      alert('Please enter and save your restaurant slug first');
      return;
    }

    const url = `https://clarivore.org/restaurant.html?slug=${encodeURIComponent(restaurantSlug)}&edit=1`;
    chrome.tabs.create({ url: url });
  });

  // Reset changes button
  const resetChangesBtn = document.getElementById('reset-changes-btn');
  resetChangesBtn.addEventListener('click', () => {
    if (confirm('Reset change counter? This will clear all logged changes.')) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'RESET_CHANGES' }, (response) => {
            if (response && response.success) {
              alert('Change counter reset successfully!');
            }
          });
        }
      });
    }
  });

  // Toggle monitoring
  enabledToggle.addEventListener('change', () => {
    updateStatusUI(enabledToggle.checked);
  });

  function updateStatusUI(enabled) {
    if (enabled) {
      statusIndicator.classList.add('active');
      statusIndicator.classList.remove('inactive');
      statusText.textContent = 'Active';
    } else {
      statusIndicator.classList.remove('active');
      statusIndicator.classList.add('inactive');
      statusText.textContent = 'Disabled';
    }
  }
});

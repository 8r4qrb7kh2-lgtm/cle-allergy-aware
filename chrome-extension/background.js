/**
 * Clarivore Menu Manager - Background Service Worker
 */

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CLARIVORE_OPENED') {
    // Track when user opens Clarivore
    console.log('[Clarivore Background] User opened Clarivore editor');

    // Could send analytics here if needed
    chrome.storage.local.get(['openCount'], (result) => {
      const count = (result.openCount || 0) + 1;
      chrome.storage.local.set({ openCount: count });
    });
  } else if (message.type === 'OPEN_OPTIONS') {
    // Open extension popup instead (no separate options page needed)
    chrome.action.openPopup();
  }
});

// Set default settings on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default values
    chrome.storage.sync.set({
      enabled: true,
      restaurantSlug: ''
    });

    // Settings are configured via the popup (no separate options page needed)
  }
});

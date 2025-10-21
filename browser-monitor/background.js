// Background service worker for the Menu Change Monitor extension

console.log('[Menu Monitor Background] 🚀 Service worker loading...');

// Test that service worker is alive
self.addEventListener('install', (event) => {
  console.log('[Menu Monitor Background] ✓ Service worker installed');
});

self.addEventListener('activate', (event) => {
  console.log('[Menu Monitor Background] ✓ Service worker activated');
});

console.log('[Menu Monitor Background] ✓ Service worker loaded and ready');

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'MENU_CHANGED') {
    console.log('[Menu Monitor] Menu change detected:', request);

    // Show browser notification
    showNotification(request);

    // Store the change event
    storeChangeEvent(request);

    sendResponse({ received: true });
  } else if (request.type === 'ANALYZE_MENU') {
    // Handle Claude API request from content script
    console.log('[Menu Monitor Background] 📨 Received ANALYZE_MENU request');
    console.log('[Menu Monitor Background] Prompt length:', request.prompt ? request.prompt.length : 0);

    chrome.storage.local.get(['claudeApiKey'], async (result) => {
      const apiKey = result.claudeApiKey;
      console.log('[Menu Monitor Background] API key present:', !!apiKey);

      if (!apiKey || apiKey === 'YOUR_CLAUDE_API_KEY_HERE') {
        console.log('[Menu Monitor Background] ❌ No valid API key configured');
        sendResponse({ result: { isMenuPage: false } });
        return;
      }

      try {
        console.log('[Menu Monitor Background] 🚀 Calling Claude API...');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 2000,
            messages: [{
              role: 'user',
              content: request.prompt
            }]
          })
        });

        console.log('[Menu Monitor Background] API response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Menu Monitor Background] ❌ API error:', response.status, errorText);
          throw new Error(`Claude API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[Menu Monitor Background] API response received');

        // Extract text from Claude response
        let responseText = data.content[0].text;
        console.log('[Menu Monitor Background] Raw response:', responseText.substring(0, 200));

        // Remove markdown code blocks if present (```json ... ```)
        responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        // Extract just the JSON object (from first { to last })
        const firstBrace = responseText.indexOf('{');
        const lastBrace = responseText.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1) {
          throw new Error('No JSON object found in response');
        }

        const jsonText = responseText.substring(firstBrace, lastBrace + 1);
        console.log('[Menu Monitor Background] Extracted JSON:', jsonText.substring(0, 100));

        // Parse the JSON
        const result = JSON.parse(jsonText);
        console.log('[Menu Monitor Background] ✓ Parsed result:', result);

        sendResponse({ result: result });
      } catch (error) {
        console.error('[Menu Monitor Background] ❌ Error:', error);
        sendResponse({ error: error.message });
      }
    });

    return true; // Keep message channel open for async response
  }
  return true;
});

function showNotification(data) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Menu Change Detected!',
    message: `Changes detected on ${data.domain}. Click to update allergy information.`,
    priority: 2,
    requireInteraction: true
  }, (notificationId) => {
    // Store notification data for click handler
    chrome.storage.local.get(['notificationData'], (result) => {
      const notificationData = result.notificationData || {};
      notificationData[notificationId] = data;
      chrome.storage.local.set({ notificationData });
    });
  });
}

function storeChangeEvent(event) {
  chrome.storage.local.get(['changeHistory'], (result) => {
    const history = result.changeHistory || [];
    history.unshift({
      ...event,
      timestamp: Date.now()
    });

    // Keep only last 50 events
    if (history.length > 50) {
      history.splice(50);
    }

    chrome.storage.local.set({ changeHistory: history });
  });
}

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.storage.local.get(['notificationData', 'allergyWebsiteUrl'], (result) => {
    const data = result.notificationData && result.notificationData[notificationId];
    const url = result.allergyWebsiteUrl || 'https://your-allergy-website.com/restaurant/edit';

    // Open the allergy website
    chrome.tabs.create({ url });

    // Clear the notification
    chrome.notifications.clear(notificationId);
  });
});

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Menu Monitor] Extension installed');

  chrome.storage.local.get(['claudeApiKey', 'allergyWebsiteUrl'], (result) => {
    const updates = {};

    if (!result.claudeApiKey) {
      updates.claudeApiKey = 'YOUR_CLAUDE_API_KEY_HERE';
    }

    if (!result.allergyWebsiteUrl) {
      updates.allergyWebsiteUrl = 'https://your-allergy-website.com/restaurant/edit';
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

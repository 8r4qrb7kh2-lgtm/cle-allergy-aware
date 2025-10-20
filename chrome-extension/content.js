/**
 * Clarivore Menu Manager - Content Script
 *
 * SAFETY-CRITICAL APPLICATION
 * Purpose: Detect when restaurant managers SAVE menu item changes
 *
 * Approach: Monitor for SAVE/PUBLISH actions, not every keystroke
 */

(function() {
  'use strict';

  // ============================================================================
  // STATE
  // ============================================================================

  let config = null;
  let isActive = false;
  let bubble = null;
  let changeCount = 0;
  let lastSaveSnapshot = '';

  // ============================================================================
  // URL MATCHING
  // ============================================================================

  function isRestaurantWebsite() {
    if (!config || !config.restaurantUrl) return false;

    try {
      const configuredUrl = new URL(config.restaurantUrl);
      const currentUrl = new URL(window.location.href);

      return currentUrl.hostname.includes(configuredUrl.hostname) ||
             configuredUrl.hostname.includes(currentUrl.hostname);
    } catch (e) {
      return false;
    }
  }

  // ============================================================================
  // SAVE ACTION DETECTION
  // ============================================================================

  /**
   * Detect when user SAVES/PUBLISHES changes (not every keystroke)
   *
   * Strategy:
   * 1. Monitor for common save button clicks
   * 2. Monitor for Ctrl+S / Cmd+S keyboard shortcuts
   * 3. Monitor for auto-save network requests
   */

  function detectSaveAction() {
    console.log('[Clarivore] 🚨 SAVE ACTION DETECTED');

    // Take snapshot of current menu content
    const currentSnapshot = getMenuContentSnapshot();

    // Compare with last save
    if (lastSaveSnapshot && currentSnapshot !== lastSaveSnapshot) {
      console.log('[Clarivore] Menu content changed since last save');
      logChange();
    }

    lastSaveSnapshot = currentSnapshot;
  }

  function getMenuContentSnapshot() {
    // Get text content from likely menu areas
    // Focus on content areas, ignore navigation/UI
    let menuText = '';

    // Check main document
    const contentAreas = document.querySelectorAll([
      '[role="main"]',
      'main',
      '[class*="content"]',
      '[class*="editor"]',
      '[id*="content"]',
      'article',
      '.menu',
      '[class*="menu"]'
    ].join(','));

    contentAreas.forEach(area => {
      if (area.innerText) {
        menuText += area.innerText + '\n';
      }
    });

    // Check iframes
    document.querySelectorAll('iframe').forEach(iframe => {
      try {
        if (iframe.contentDocument?.body) {
          const iframeContent = iframe.contentDocument.querySelectorAll([
            '[role="main"]',
            'main',
            'article',
            '[class*="content"]',
            '[class*="menu"]'
          ].join(','));

          iframeContent.forEach(area => {
            if (area.innerText) {
              menuText += area.innerText + '\n';
            }
          });
        }
      } catch (e) {
        // Cross-origin iframe
      }
    });

    // Hash it
    let hash = 0;
    for (let i = 0; i < menuText.length; i++) {
      hash = ((hash << 5) - hash) + menuText.charCodeAt(i);
      hash = hash & hash;
    }

    return hash.toString();
  }

  // ============================================================================
  // MONITORING STRATEGIES
  // ============================================================================

  function monitorSaveButtons() {
    // Monitor clicks on common save/publish buttons
    const saveButtonSelectors = [
      'button[type="submit"]',
      'button:contains("Save")',
      'button:contains("Publish")',
      'button:contains("Update")',
      '[data-hook="save"]',
      '[data-testid*="save"]',
      '[aria-label*="save" i]',
      '[aria-label*="publish" i]',
      '.save-button',
      '.publish-button',
      '#save',
      '#publish'
    ];

    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, a, [role="button"]');
      if (!target) return;

      const text = target.innerText?.toLowerCase() || '';
      const ariaLabel = target.getAttribute('aria-label')?.toLowerCase() || '';
      const className = target.className?.toLowerCase() || '';
      const id = target.id?.toLowerCase() || '';

      if (
        text.includes('save') ||
        text.includes('publish') ||
        text.includes('update') ||
        ariaLabel.includes('save') ||
        ariaLabel.includes('publish') ||
        className.includes('save') ||
        className.includes('publish') ||
        id.includes('save') ||
        id.includes('publish')
      ) {
        console.log('[Clarivore] Save/Publish button clicked:', target);
        setTimeout(detectSaveAction, 1000); // Wait for save to complete
      }
    }, true);

    // Also monitor iframes
    document.querySelectorAll('iframe').forEach(iframe => {
      try {
        if (iframe.contentDocument) {
          iframe.contentDocument.addEventListener('click', (e) => {
            const target = e.target.closest('button, a, [role="button"]');
            if (!target) return;

            const text = target.innerText?.toLowerCase() || '';
            if (text.includes('save') || text.includes('publish') || text.includes('update')) {
              console.log('[Clarivore] Save button clicked in iframe:', target);
              setTimeout(detectSaveAction, 1000);
            }
          }, true);
        }
      } catch (e) {
        // Cross-origin
      }
    });
  }

  function monitorKeyboardShortcuts() {
    // Monitor Ctrl+S / Cmd+S
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        console.log('[Clarivore] Save keyboard shortcut detected');
        setTimeout(detectSaveAction, 1000);
      }
    }, true);

    // Also monitor iframes
    document.querySelectorAll('iframe').forEach(iframe => {
      try {
        if (iframe.contentDocument) {
          iframe.contentDocument.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              console.log('[Clarivore] Save shortcut in iframe');
              setTimeout(detectSaveAction, 1000);
            }
          }, true);
        }
      } catch (e) {
        // Cross-origin
      }
    });
  }

  function monitorNetworkRequests() {
    // Intercept fetch/XHR for auto-save detection
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0]?.toString() || '';
      const method = args[1]?.method || 'GET';

      // Check if it's a save/update request (be aggressive - catch everything)
      if (
        method === 'POST' ||
        method === 'PUT' ||
        method === 'PATCH' ||
        url.includes('save') ||
        url.includes('update') ||
        url.includes('publish') ||
        url.includes('edit') ||
        url.includes('menu') ||
        url.includes('item')
      ) {
        console.log('[Clarivore] Network save detected:', method, url);
        setTimeout(detectSaveAction, 1500);
      }

      return originalFetch.apply(this, args);
    };

    // Monitor XHR
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      if (
        method === 'POST' ||
        method === 'PUT' ||
        method === 'PATCH' ||
        url.includes('save') ||
        url.includes('update') ||
        url.includes('edit') ||
        url.includes('menu') ||
        url.includes('item')
      ) {
        this.addEventListener('load', () => {
          console.log('[Clarivore] XHR save detected:', method, url);
          setTimeout(detectSaveAction, 1500);
        });
      }
      return originalOpen.call(this, method, url, ...rest);
    };
  }

  function monitorAutoSaveNotifications() {
    // Watch for "saved" notifications (like Wix's "Menu item was saved")
    const observer = new MutationObserver(() => {
      // Look for save notification elements
      const notifications = document.querySelectorAll([
        '[class*="notification"]',
        '[class*="toast"]',
        '[class*="snackbar"]',
        '[class*="message"]',
        '[role="alert"]',
        '[role="status"]'
      ].join(','));

      notifications.forEach(notification => {
        const text = notification.innerText?.toLowerCase() || '';
        if (text.includes('saved') || text.includes('updated') || text.includes('published')) {
          console.log('[Clarivore] Save notification detected:', text);
          setTimeout(detectSaveAction, 500);
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also check iframes
    setInterval(() => {
      document.querySelectorAll('iframe').forEach(iframe => {
        try {
          if (iframe.contentDocument && !iframe._clarivoreNotificationObserver) {
            const iframeObserver = new MutationObserver(() => {
              const notifications = iframe.contentDocument.querySelectorAll([
                '[class*="notification"]',
                '[class*="toast"]',
                '[class*="snackbar"]',
                '[role="alert"]'
              ].join(','));

              notifications.forEach(notification => {
                const text = notification.innerText?.toLowerCase() || '';
                if (text.includes('saved') || text.includes('updated')) {
                  console.log('[Clarivore] Save notification in iframe:', text);
                  setTimeout(detectSaveAction, 500);
                }
              });
            });

            iframeObserver.observe(iframe.contentDocument.body, {
              childList: true,
              subtree: true
            });

            iframe._clarivoreNotificationObserver = true;
          }
        } catch (e) {
          // Cross-origin
        }
      });
    }, 3000);
  }

  // ============================================================================
  // CHANGE LOGGING
  // ============================================================================

  function logChange() {
    const timestamp = new Date().toISOString();
    const change = {
      timestamp,
      url: window.location.href,
      snapshot: lastSaveSnapshot
    };

    changeCount++;

    chrome.storage.local.get(['changeLog'], (result) => {
      const changeLog = result.changeLog || [];
      changeLog.push(change);

      if (changeLog.length > 1000) {
        changeLog.shift();
      }

      chrome.storage.local.set({
        changeLog,
        lastChangeTimestamp: timestamp,
        changeCount: changeCount
      });
    });

    console.log('[Clarivore] 🚨 MENU CHANGE LOGGED at', timestamp);
    updateBubble();
    expandBubble();
  }

  // ============================================================================
  // BUBBLE UI
  // ============================================================================

  function createBubble() {
    if (bubble) {
      console.log('[Clarivore] Bubble already exists');
      return;
    }

    console.log('[Clarivore] Creating bubble...');

    bubble = document.createElement('div');
    bubble.id = 'clarivore-bubble';
    bubble.className = 'compact';
    bubble.innerHTML = `
      <div class="clarivore-bubble-icon" id="clarivore-bubble-compact">
        <div class="shield">🛡️</div>
        <div class="badge" id="clarivore-badge">0</div>
      </div>

      <div class="clarivore-banner" id="clarivore-banner">
        <div class="banner-content">
          <div class="banner-left">
            <span class="icon">🛡️</span>
            <div class="text">
              <div class="title">Menu Content Changed!</div>
              <div class="subtitle">Update allergen information in Clarivore</div>
            </div>
          </div>
          <div class="banner-right">
            <div class="change-count">
              <span class="label">Changes Detected:</span>
              <span class="value" id="clarivore-change-count">0</span>
            </div>
            <button class="btn-update" id="clarivore-update-btn">
              Update Allergens Now
            </button>
            <button class="btn-close" id="clarivore-close-btn">✕</button>
          </div>
        </div>
      </div>
    `;

    // Append to body
    if (document.body) {
      document.body.appendChild(bubble);
      console.log('[Clarivore] Bubble added to DOM');
    } else {
      console.error('[Clarivore] document.body not available!');
      return;
    }

    // Verify it's in the DOM
    const bubbleCheck = document.getElementById('clarivore-bubble');
    if (bubbleCheck) {
      console.log('[Clarivore] Bubble confirmed in DOM');
    } else {
      console.error('[Clarivore] Bubble NOT found in DOM after insertion!');
    }

    document.getElementById('clarivore-bubble-compact').addEventListener('click', expandBubble);
    document.getElementById('clarivore-update-btn').addEventListener('click', openClarivore);
    document.getElementById('clarivore-close-btn').addEventListener('click', compactBubble);

    chrome.storage.local.get(['changeCount'], (result) => {
      changeCount = result.changeCount || 0;
      updateBubble();
    });

    setTimeout(() => {
      bubble.classList.add('visible');
      console.log('[Clarivore] Bubble should now be visible');
    }, 100);

    console.log('[Clarivore] 🛡️ Bubble creation complete');
  }

  function updateBubble() {
    const badge = document.getElementById('clarivore-badge');
    const countEl = document.getElementById('clarivore-change-count');

    if (badge) {
      badge.textContent = changeCount;
      badge.style.display = changeCount > 0 ? 'flex' : 'none';
    }

    if (countEl) {
      countEl.textContent = changeCount;
    }
  }

  function expandBubble() {
    if (!bubble) return;
    bubble.classList.remove('compact');
    bubble.classList.add('expanded');
  }

  function compactBubble() {
    if (!bubble) return;
    bubble.classList.remove('expanded');
    bubble.classList.add('compact');
  }

  function removeBubble() {
    if (bubble) {
      bubble.remove();
      bubble = null;
    }
  }

  // ============================================================================
  // CLARIVORE INTEGRATION
  // ============================================================================

  function openClarivore() {
    if (!config || !config.restaurantSlug) {
      alert('Please configure your restaurant slug in the extension settings');
      return;
    }

    const url = `https://clarivore.org/restaurant.html?slug=${encodeURIComponent(config.restaurantSlug)}&edit=1`;
    window.open(url, '_blank');
  }

  // ============================================================================
  // MONITORING
  // ============================================================================

  function startMonitoring() {
    if (isActive) return;

    console.log('[Clarivore] 🚀 Starting save-action monitoring');
    isActive = true;

    // Set initial snapshot
    lastSaveSnapshot = getMenuContentSnapshot();
    console.log('[Clarivore] Initial snapshot captured');

    // Start all monitoring strategies
    monitorSaveButtons();
    monitorKeyboardShortcuts();
    monitorNetworkRequests();
    monitorAutoSaveNotifications();

    // Periodically check for new iframes
    setInterval(() => {
      monitorSaveButtons();
      monitorKeyboardShortcuts();
    }, 5000);

    console.log('[Clarivore] ✓ Monitoring active - will detect when you SAVE menu changes');
  }

  function stopMonitoring() {
    if (!isActive) return;

    console.log('[Clarivore] Stopping monitoring');
    isActive = false;
    removeBubble();
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_STATUS') {
      const isOnRestaurantSite = isRestaurantWebsite();
      sendResponse({
        platform: isOnRestaurantSite ? {
          platform: 'Restaurant Website',
          isEditor: true,
          isActive: isActive
        } : null,
        changesDetected: changeCount
      });
      return true;
    }

    if (message.type === 'ENABLE_MONITORING') {
      if (isRestaurantWebsite()) {
        createBubble();
        startMonitoring();
      }
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'DISABLE_MONITORING') {
      stopMonitoring();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'RESET_CHANGES') {
      changeCount = 0;
      chrome.storage.local.set({ changeCount: 0, changeLog: [] });
      updateBubble();
      sendResponse({ success: true });
      return true;
    }
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    console.log('[Clarivore] Content script loaded');

    chrome.storage.sync.get(['restaurantSlug', 'restaurantUrl', 'enabled'], (result) => {
      config = result;

      console.log('[Clarivore] Configuration:', {
        slug: config.restaurantSlug,
        url: config.restaurantUrl,
        enabled: config.enabled !== false,
        currentUrl: window.location.href
      });

      if (config.enabled !== false && isRestaurantWebsite()) {
        console.log('[Clarivore] ✓ Restaurant website detected - activating');
        createBubble();
        startMonitoring();
      } else {
        console.log('[Clarivore] ⚠ Not on restaurant website - inactive');
      }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync') {
        chrome.storage.sync.get(['restaurantSlug', 'restaurantUrl', 'enabled'], (result) => {
          config = result;

          if (config.enabled !== false && isRestaurantWebsite()) {
            if (!isActive) {
              createBubble();
              startMonitoring();
            }
          } else {
            if (isActive) {
              stopMonitoring();
            }
          }
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

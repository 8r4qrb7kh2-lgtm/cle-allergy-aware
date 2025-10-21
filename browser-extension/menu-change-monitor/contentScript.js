/**
 * Content Script for AI Menu Change Monitor
 * Real-time change detection using MutationObserver
 * Works universally across all website platforms (WordPress, Wix, GoDaddy, Squarespace, etc.)
 */

(function () {
  'use strict';

  // Configuration
  const CONFIG = {
    DEBOUNCE_DELAY: 2000, // Wait 2 seconds after last change before analyzing
    MIN_CHANGE_THRESHOLD: 10, // Minimum characters changed to trigger
    CHECK_COOLDOWN: 30000, // Don't check more than once per 30 seconds
    STORAGE_KEY: 'menuSnapshot'
  };

  // State
  let isMonitoring = false;
  let mutationObserver = null;
  let debounceTimer = null;
  let lastCheckTime = 0;
  let initialMenuSnapshot = null;
  let changeBuffer = [];

  // Initialize
  init();

  async function init() {
    console.log('[AI Menu Monitor] Content script initialized');

    // Check if this site is being monitored
    const settings = await getSettings();
    if (settings.autoMonitor) {
      await startMonitoring();
    }

    // Listen for messages from background/popup
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  /**
   * Handle messages from extension
   */
  function handleMessage(message, sender, sendResponse) {
    (async () => {
      switch (message.type) {
        case 'getPageData':
          sendResponse(getPageData());
          break;

        case 'startMonitoring':
          await startMonitoring();
          sendResponse({ success: true });
          break;

        case 'stopMonitoring':
          stopMonitoring();
          sendResponse({ success: true });
          break;

        case 'highlightChanges':
          highlightChangedElements(message.changes);
          sendResponse({ success: true });
          break;

        case 'analyzeNow':
          const analysis = await captureAndAnalyzeMenu();
          sendResponse({ success: true, analysis });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    })();

    return true; // Keep channel open for async response
  }

  /**
   * Start real-time monitoring with MutationObserver
   */
  async function startMonitoring() {
    if (isMonitoring) return;

    console.log('[AI Menu Monitor] Starting real-time monitoring...');
    isMonitoring = true;

    // Capture initial state
    initialMenuSnapshot = await captureMenuSnapshot();

    // Save to storage for persistence
    await saveSnapshot(initialMenuSnapshot);

    // Set up MutationObserver to detect DOM changes
    mutationObserver = new MutationObserver(handleMutations);

    // Observe the entire document body with comprehensive options
    mutationObserver.observe(document.body, {
      childList: true,      // Watch for added/removed elements
      subtree: true,        // Watch all descendants
      characterData: true,  // Watch text content changes
      attributes: false,    // Ignore attribute changes (styling, etc.)
      characterDataOldValue: true
    });

    console.log('[AI Menu Monitor] Real-time monitoring active');
  }

  /**
   * Stop monitoring
   */
  function stopMonitoring() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    isMonitoring = false;
    changeBuffer = [];
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    console.log('[AI Menu Monitor] Monitoring stopped');
  }

  /**
   * Handle DOM mutations
   */
  function handleMutations(mutations) {
    // Filter for meaningful changes (skip scripts, styles, ads, etc.)
    const meaningfulMutations = mutations.filter(mutation => {
      const target = mutation.target;

      // Ignore script and style changes
      if (target.nodeName === 'SCRIPT' || target.nodeName === 'STYLE') {
        return false;
      }

      // Ignore common ad/tracking containers
      const ignoredClasses = ['ad', 'advertisement', 'tracking', 'analytics', 'cookie-banner', 'popup', 'modal'];
      if (target.className && typeof target.className === 'string') {
        const classes = target.className.toLowerCase();
        if (ignoredClasses.some(cls => classes.includes(cls))) {
          return false;
        }
      }

      return true;
    });

    if (meaningfulMutations.length === 0) return;

    // Add to change buffer
    changeBuffer.push(...meaningfulMutations);

    // Debounce: wait for changes to settle before analyzing
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      analyzeChanges();
    }, CONFIG.DEBOUNCE_DELAY);
  }

  /**
   * Analyze accumulated changes
   */
  async function analyzeChanges() {
    // Cooldown check - don't spam the AI
    const now = Date.now();
    if (now - lastCheckTime < CONFIG.CHECK_COOLDOWN) {
      console.log('[AI Menu Monitor] Cooldown active, skipping check');
      changeBuffer = [];
      return;
    }

    // Check if changes meet threshold
    const changeText = extractChangedText();
    if (changeText.length < CONFIG.MIN_CHANGE_THRESHOLD) {
      console.log('[AI Menu Monitor] Changes below threshold');
      changeBuffer = [];
      return;
    }

    console.log('[AI Menu Monitor] Significant changes detected, analyzing...');

    // Capture new snapshot
    const newSnapshot = await captureMenuSnapshot();

    // Send to background for AI analysis
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'analyzeMenuChange',
        oldSnapshot: initialMenuSnapshot,
        newSnapshot: newSnapshot,
        changedText: changeText
      });

      if (response.success && response.hasChanges) {
        // Show notification popup
        await showChangeNotification(response.changes);

        // Update initial snapshot for next comparison
        initialMenuSnapshot = newSnapshot;
        await saveSnapshot(newSnapshot);
      }

      lastCheckTime = now;
    } catch (error) {
      console.error('[AI Menu Monitor] Analysis error:', error);
    }

    changeBuffer = [];
  }

  /**
   * Extract text from changed mutations
   */
  function extractChangedText() {
    const texts = changeBuffer.map(mutation => {
      if (mutation.type === 'characterData') {
        return mutation.target.textContent;
      } else if (mutation.type === 'childList') {
        const addedText = Array.from(mutation.addedNodes)
          .map(node => node.textContent)
          .join(' ');
        return addedText;
      }
      return '';
    });

    return texts.join(' ').trim();
  }

  /**
   * Capture current menu snapshot
   */
  async function captureMenuSnapshot() {
    return {
      html: extractMenuContent(),
      text: extractMenuText(),
      url: window.location.href,
      title: document.title,
      timestamp: Date.now()
    };
  }

  /**
   * Extract likely menu content from page (platform-agnostic)
   */
  function extractMenuContent() {
    // Try to find menu sections intelligently
    const menuCandidates = [];

    // Strategy 1: Look for semantic HTML
    const sections = document.querySelectorAll('section, article, main, div[class*="menu"], div[id*="menu"]');

    sections.forEach(section => {
      const text = section.textContent.toLowerCase();
      const html = section.outerHTML;

      // Check for food/menu keywords
      const menuKeywords = ['appetizer', 'entree', 'dessert', 'main course', 'salad', 'sandwich',
                           'burger', 'pizza', 'pasta', 'dish', 'price', '$', 'gluten', 'dairy',
                           'vegan', 'vegetarian', 'contains', 'allergen'];

      const keywordMatches = menuKeywords.filter(keyword => text.includes(keyword)).length;

      if (keywordMatches >= 2) {
        menuCandidates.push({
          element: section,
          html: html,
          score: keywordMatches,
          length: html.length
        });
      }
    });

    // Return the most likely menu section
    if (menuCandidates.length > 0) {
      menuCandidates.sort((a, b) => b.score - a.score);
      return menuCandidates[0].html;
    }

    // Fallback: return body if no menu section found
    return document.body.innerHTML;
  }

  /**
   * Extract plain text from likely menu areas
   */
  function extractMenuText() {
    const menuHtml = extractMenuContent();
    const temp = document.createElement('div');
    temp.innerHTML = menuHtml;
    return temp.textContent.trim();
  }

  /**
   * Show notification when changes detected
   */
  async function showChangeNotification(changes) {
    // Create overlay notification
    const notification = createNotificationElement(changes);
    document.body.appendChild(notification);

    // Auto-remove after 30 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 30000);
  }

  /**
   * Create notification DOM element
   */
  function createNotificationElement(changes) {
    const overlay = document.createElement('div');
    overlay.id = 'ai-menu-monitor-notification';
    overlay.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px 24px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      max-width: 400px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: slideInRight 0.4s ease-out;
    `;

    const criticalCount = changes.criticalChanges?.length || 0;
    const icon = criticalCount > 0 ? '⚠️' : '🔔';

    overlay.innerHTML = `
      <style>
        @keyframes slideInRight {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        #ai-menu-monitor-notification h3 {
          margin: 0 0 12px 0;
          font-size: 18px;
          font-weight: 600;
        }
        #ai-menu-monitor-notification p {
          margin: 0 0 16px 0;
          font-size: 14px;
          line-height: 1.5;
          opacity: 0.95;
        }
        #ai-menu-monitor-notification .btn {
          display: inline-block;
          background: white;
          color: #667eea;
          padding: 10px 20px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          margin-right: 8px;
          cursor: pointer;
          border: none;
          transition: transform 0.2s;
        }
        #ai-menu-monitor-notification .btn:hover {
          transform: scale(1.05);
        }
        #ai-menu-monitor-notification .btn-secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }
        #ai-menu-monitor-notification .close-btn {
          position: absolute;
          top: 12px;
          right: 12px;
          background: none;
          border: none;
          color: white;
          font-size: 24px;
          cursor: pointer;
          opacity: 0.8;
          line-height: 1;
          padding: 0;
          width: 24px;
          height: 24px;
        }
        #ai-menu-monitor-notification .close-btn:hover {
          opacity: 1;
        }
      </style>
      <button class="close-btn" onclick="this.parentElement.remove()">×</button>
      <h3>${icon} Menu Change Detected!</h3>
      <p>${changes.changesSummary || 'Changes were detected on your menu that may affect customers with dietary restrictions.'}</p>
      <div>
        <a href="${getAllergyWebsiteUrl()}" target="_blank" class="btn">
          Update Allergy Info
        </a>
        <button class="btn btn-secondary" onclick="this.parentElement.parentElement.remove()">
          Dismiss
        </button>
      </div>
    `;

    return overlay;
  }

  /**
   * Get URL to the allergy website editing page
   * TODO: Update this URL to your actual website
   */
  function getAllergyWebsiteUrl() {
    // Extract restaurant name or use current URL
    const restaurantId = encodeURIComponent(window.location.hostname);

    // TODO: Replace with your actual allergy website URL
    return `https://your-allergy-website.com/update-menu?restaurant=${restaurantId}`;
  }

  /**
   * Save snapshot to storage
   */
  async function saveSnapshot(snapshot) {
    try {
      await chrome.storage.local.set({
        [CONFIG.STORAGE_KEY + '_' + window.location.hostname]: snapshot
      });
    } catch (error) {
      console.error('[AI Menu Monitor] Failed to save snapshot:', error);
    }
  }

  /**
   * Get settings from storage
   */
  async function getSettings() {
    try {
      const result = await chrome.storage.local.get('settings');
      return result.settings || { autoMonitor: false };
    } catch (error) {
      return { autoMonitor: false };
    }
  }

  /**
   * Extract page data for analysis
   */
  function getPageData() {
    return {
      html: document.documentElement.outerHTML,
      url: window.location.href,
      title: document.title,
      meta: extractMetaData(),
      timestamp: Date.now()
    };
  }

  /**
   * Extract useful metadata from the page
   */
  function extractMetaData() {
    const meta = {
      description: document.querySelector('meta[name="description"]')?.content || '',
      keywords: document.querySelector('meta[name="keywords"]')?.content || '',
      ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
      ogDescription: document.querySelector('meta[property="og:description"]')?.content || ''
    };

    return meta;
  }

  /**
   * Highlight changed elements on the page (optional visual feedback)
   */
  function highlightChangedElements(changes) {
    if (!changes || !changes.criticalChanges) return;

    injectHighlightStyles();

    // Try to find and highlight changed items
    changes.criticalChanges.forEach(change => {
      const itemName = change.itemName;
      if (!itemName) return;

      // Find elements containing the item name
      const elements = findElementsContainingText(itemName);
      elements.forEach(element => {
        element.classList.add('ai-menu-monitor__highlight');

        // Add tooltip with change description
        const tooltip = createTooltip(change);
        element.appendChild(tooltip);

        // Remove highlight after 10 seconds
        setTimeout(() => {
          element.classList.remove('ai-menu-monitor__highlight');
          tooltip.remove();
        }, 10000);
      });
    });
  }

  /**
   * Find elements containing specific text
   */
  function findElementsContainingText(text) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const elements = [];
    const searchText = text.toLowerCase();

    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.toLowerCase().includes(searchText)) {
        const element = node.parentElement;
        if (element && !elements.includes(element)) {
          elements.push(element);
        }
      }
    }

    return elements;
  }

  /**
   * Create tooltip for change
   */
  function createTooltip(change) {
    const tooltip = document.createElement('div');
    tooltip.className = 'ai-menu-monitor__tooltip';

    const severityIcon = {
      'critical': '⚠️',
      'important': 'ℹ️',
      'minor': '📝'
    }[change.severity] || 'ℹ️';

    tooltip.innerHTML = `
      <div class="ai-menu-monitor__tooltip-header">
        <span class="ai-menu-monitor__tooltip-icon">${severityIcon}</span>
        <span class="ai-menu-monitor__tooltip-title">${change.type.replace('_', ' ')}</span>
      </div>
      <div class="ai-menu-monitor__tooltip-body">
        ${change.description}
      </div>
    `;

    return tooltip;
  }

  /**
   * Inject CSS for highlighting
   */
  function injectHighlightStyles() {
    // Check if already injected
    if (document.getElementById('ai-menu-monitor-styles')) return;

    const style = document.createElement('style');
    style.id = 'ai-menu-monitor-styles';
    style.textContent = `
      .ai-menu-monitor__highlight {
        position: relative;
        animation: ai-menu-monitor-pulse 2s ease-in-out infinite;
        outline: 3px solid #ff6b6b;
        outline-offset: 2px;
        border-radius: 4px;
        background-color: rgba(255, 107, 107, 0.1) !important;
      }

      @keyframes ai-menu-monitor-pulse {
        0%, 100% {
          outline-color: #ff6b6b;
        }
        50% {
          outline-color: #ff8787;
        }
      }

      .ai-menu-monitor__tooltip {
        position: absolute;
        top: -60px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.95);
        color: white;
        padding: 12px;
        border-radius: 8px;
        font-size: 13px;
        font-family: system-ui, -apple-system, sans-serif;
        z-index: 999999;
        min-width: 200px;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        pointer-events: none;
      }

      .ai-menu-monitor__tooltip-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
        font-weight: 600;
        text-transform: capitalize;
      }

      .ai-menu-monitor__tooltip-icon {
        font-size: 16px;
      }

      .ai-menu-monitor__tooltip-body {
        font-size: 12px;
        line-height: 1.4;
        opacity: 0.9;
      }

      .ai-menu-monitor__tooltip::after {
        content: '';
        position: absolute;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid rgba(0, 0, 0, 0.95);
      }
    `;

    document.head.appendChild(style);
  }

  // Signal that content script is ready
  console.log('[AI Menu Monitor] Content script loaded');
})();

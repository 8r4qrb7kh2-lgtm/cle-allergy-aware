// Content script that runs on all web pages to detect menu changes

class MenuChangeDetector {
  constructor() {
    this.observer = null;
    this.debounceTimer = null;
    this.isProcessing = false;
    this.currentDomain = window.location.hostname;
    this.checkInterval = 2000; // 2 seconds debounce
    this.lastAnalyzedContent = null;
  }

  async init() {
    console.log('[Menu Monitor] Initializing on:', this.currentDomain);

    // Check if monitoring is enabled for this domain
    const enabled = await this.isMonitoringEnabled();
    if (!enabled) {
      console.log('[Menu Monitor] Not enabled for this domain');
      return;
    }

    // Perform initial scan
    await this.analyzePageContent();

    // Set up mutation observer
    this.setupObserver();

    console.log('[Menu Monitor] Active and monitoring changes');
  }

  async isMonitoringEnabled() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['enabledDomains'], (result) => {
        const enabledDomains = result.enabledDomains || {};
        resolve(enabledDomains[this.currentDomain] === true);
      });
    });
  }

  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      // Debounce the change detection
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.handleContentChange();
      }, this.checkInterval);
    });

    // Observe the entire document for changes
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: false // We don't care about attribute changes
    });
  }

  async handleContentChange() {
    if (this.isProcessing) {
      console.log('[Menu Monitor] Already processing, skipping...');
      return;
    }

    console.log('[Menu Monitor] Content change detected, analyzing...');
    await this.analyzePageContent();
  }

  extractPageContent() {
    // Check if we're in an editor/admin page
    const isEditor = window.location.href.includes('/editor/') ||
                     window.location.href.includes('/admin/') ||
                     window.location.href.includes('wp-admin') ||
                     document.querySelector('[class*="editor"]') ||
                     document.querySelector('[class*="dashboard"]');

    let bodyText = document.body.innerText;

    // If in editor, try to focus on content area only
    if (isEditor) {
      console.log('[Menu Monitor] Editor page detected, focusing on content area');

      // Try to find main content/preview areas
      const contentAreas = document.querySelectorAll(
        'main, [role="main"], [class*="content"], [class*="preview"], ' +
        '[class*="canvas"], iframe[class*="preview"], [class*="editor-content"]'
      );

      if (contentAreas.length > 0) {
        bodyText = Array.from(contentAreas)
          .map(el => el.innerText || '')
          .join('\n');
      }
    }

    // Extract all visible text nodes with their context
    const contentBlocks = [];

    // Common menu-related selectors (works across platforms)
    const selectors = [
      'main', 'article', '[class*="menu"]', '[id*="menu"]',
      '[class*="food"]', '[id*="food"]',
      '[class*="dish"]', '[id*="dish"]',
      '[class*="item"]', '[id*="item"]',
      '[class*="product"]', '[id*="product"]',
      'section', '.content', '#content',
      '[class*="price"]', '[id*="price"]',
      // Editor-specific selectors
      '[role="main"]', '[class*="editor-content"]'
    ];

    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (this.isVisible(el)) {
            const text = el.innerText?.trim();
            if (text && text.length > 10) { // Ignore very short text
              contentBlocks.push({
                selector: selector,
                text: text.substring(0, 500), // Limit size
                tagName: el.tagName
              });
            }
          }
        });
      } catch (e) {
        // Ignore invalid selectors
      }
    });

    return {
      url: window.location.href,
      domain: this.currentDomain,
      title: document.title,
      bodyText: bodyText.substring(0, 5000), // Limit size
      contentBlocks: contentBlocks.slice(0, 20), // Limit blocks
      timestamp: Date.now()
    };
  }

  isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           element.offsetWidth > 0 &&
           element.offsetHeight > 0;
  }

  async analyzePageContent() {
    if (this.isProcessing) {
      console.log('[Menu Monitor] Already processing, skipping');
      return;
    }

    this.isProcessing = true;
    console.log('[Menu Monitor] Starting page analysis...');

    try {
      const content = this.extractPageContent();
      console.log('[Menu Monitor] Extracted content, length:', content.bodyText.length);

      // Get stored menu state
      const storedState = await this.getStoredMenuState();
      console.log('[Menu Monitor] Previous state exists:', !!storedState);

      // Ask Claude to analyze if this is a menu page and extract menu items
      console.log('[Menu Monitor] Sending to Claude for analysis...');
      const analysis = await this.analyzeWithClaude(content, storedState);
      console.log('[Menu Monitor] Analysis received:', analysis);

      if (analysis.isMenuPage) {
        console.log('[Menu Monitor] ✓ Menu page detected');

        if (storedState && analysis.hasChanges) {
          console.log('[Menu Monitor] 🔔 CHANGES DETECTED!');
          this.showChangeNotification(analysis.changes);
        } else if (!storedState) {
          console.log('[Menu Monitor] First scan - baseline saved');
        } else {
          console.log('[Menu Monitor] No changes detected');
        }

        // Store current menu state
        await this.storeMenuState(analysis.menuItems);
        this.lastAnalyzedContent = content;
      } else {
        console.log('[Menu Monitor] ✗ Not identified as a menu page');
      }
    } catch (error) {
      console.error('[Menu Monitor] ❌ Error analyzing content:', error);
    } finally {
      this.isProcessing = false;
      console.log('[Menu Monitor] Analysis complete');
    }
  }

  async analyzeWithClaude(content, previousState) {
    return new Promise((resolve, reject) => {
      const prompt = this.buildAnalysisPrompt(content, previousState);

      console.log('[Menu Monitor] Sending message to background script...');

      // Set a timeout in case background doesn't respond
      const timeout = setTimeout(() => {
        console.error('[Menu Monitor] ⏱️ Timeout waiting for background response');
        reject(new Error('Background script timeout - is the service worker running?'));
      }, 30000); // 30 second timeout

      // Send to background script to make the API call (avoids CORS issues)
      chrome.runtime.sendMessage({
        type: 'ANALYZE_MENU',
        prompt: prompt
      }, (response) => {
        clearTimeout(timeout); // Clear the timeout

        if (chrome.runtime.lastError) {
          console.error('[Menu Monitor] ❌ Error communicating with background:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          console.error('[Menu Monitor] ❌ No response from background script');
          reject(new Error('No response from background script'));
          return;
        }

        if (response.error) {
          console.error('[Menu Monitor] ❌ Claude API error:', response.error);
          reject(new Error(response.error));
          return;
        }

        console.log('[Menu Monitor] ✓ Received response from background');
        resolve(response.result);
      });
    });
  }

  buildAnalysisPrompt(content, previousState) {
    const isEditor = content.url.includes('/editor/') || content.url.includes('/admin/');

    let prompt = `You are analyzing a webpage to determine if it contains restaurant menu items and to extract them.

URL: ${content.url}
Title: ${content.title}
${isEditor ? 'NOTE: This appears to be a restaurant menu editor/admin page. Focus on extracting the menu items being edited, ignoring admin controls and navigation.' : ''}

Page Content:
${content.bodyText}

Your tasks:
1. Determine if this page contains restaurant menu items (could be a public menu page OR an admin/editor page showing menu items)
2. Extract ALL menu items with their details (name, description, price if available, allergen info)
3. If previous menu state is provided, compare and identify what changed
4. Ignore navigation, sidebars, admin controls, and focus ONLY on the actual menu items

IMPORTANT: Look for patterns like:
- Dish names followed by descriptions
- Price indicators ($, $$, numeric values)
- Food categories (Appetizers, Entrees, Desserts, etc.)
- Allergen information (contains, dairy, gluten, nuts, etc.)

Respond with ONLY a JSON object in this exact format:
{
  "isMenuPage": boolean,
  "menuItems": [
    {
      "name": "dish name",
      "description": "description if available",
      "price": "price if available",
      "category": "category if available"
    }
  ],
  "hasChanges": boolean,
  "changes": {
    "added": ["list of added items"],
    "removed": ["list of removed items"],
    "modified": ["list of modified items with what changed"]
  }
}`;

    if (previousState) {
      prompt += `\n\nPrevious menu state:\n${JSON.stringify(previousState, null, 2)}`;
    }

    return prompt;
  }

  async getStoredMenuState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['menuStates'], (result) => {
        const menuStates = result.menuStates || {};
        resolve(menuStates[this.currentDomain]);
      });
    });
  }

  async storeMenuState(menuItems) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['menuStates'], (result) => {
        const menuStates = result.menuStates || {};
        menuStates[this.currentDomain] = {
          items: menuItems,
          timestamp: Date.now(),
          url: window.location.href
        };
        chrome.storage.local.set({ menuStates }, resolve);
      });
    });
  }

  showChangeNotification(changes) {
    // Send message to background script to show notification
    chrome.runtime.sendMessage({
      type: 'MENU_CHANGED',
      domain: this.currentDomain,
      url: window.location.href,
      changes: changes
    });

    // Also show in-page notification
    this.showInPageNotification(changes);
  }

  showInPageNotification(changes) {
    // Remove existing notification if present
    const existing = document.getElementById('menu-monitor-notification');
    if (existing) existing.remove();

    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'menu-monitor-notification';
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fff;
        border: 3px solid #ff6b6b;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 999999;
        max-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        animation: slideIn 0.3s ease-out;
      ">
        <style>
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        </style>
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <div style="font-size: 24px; margin-right: 10px;">⚠️</div>
          <h3 style="margin: 0; color: #333; font-size: 18px; font-weight: 600;">Menu Change Detected!</h3>
        </div>
        <p style="margin: 0 0 12px 0; color: #666; font-size: 14px; line-height: 1.4;">
          Changes were detected in your menu. This may affect customers with dietary restrictions.
        </p>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 13px; max-height: 150px; overflow-y: auto;">
          ${this.formatChanges(changes)}
        </div>
        <button id="menu-monitor-update-btn" style="
          width: 100%;
          padding: 12px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 8px;
        ">Update Allergy Information</button>
        <button id="menu-monitor-dismiss-btn" style="
          width: 100%;
          padding: 8px;
          background: transparent;
          color: #666;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
        ">Dismiss</button>
      </div>
    `;

    document.body.appendChild(notification);

    // Add event listeners
    document.getElementById('menu-monitor-update-btn').addEventListener('click', () => {
      chrome.storage.local.get(['allergyWebsiteUrl'], (result) => {
        const url = result.allergyWebsiteUrl || 'https://your-allergy-website.com/restaurant/edit';
        window.open(url, '_blank');
      });
      notification.remove();
    });

    document.getElementById('menu-monitor-dismiss-btn').addEventListener('click', () => {
      notification.remove();
    });

    // Auto-dismiss after 30 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 30000);
  }

  formatChanges(changes) {
    let html = '';

    if (changes.added && changes.added.length > 0) {
      html += `<div style="margin-bottom: 8px;">
        <strong style="color: #4CAF50;">✓ Added:</strong>
        <ul style="margin: 4px 0; padding-left: 20px;">
          ${changes.added.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (changes.removed && changes.removed.length > 0) {
      html += `<div style="margin-bottom: 8px;">
        <strong style="color: #f44336;">✗ Removed:</strong>
        <ul style="margin: 4px 0; padding-left: 20px;">
          ${changes.removed.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (changes.modified && changes.modified.length > 0) {
      html += `<div>
        <strong style="color: #ff9800;">⟳ Modified:</strong>
        <ul style="margin: 4px 0; padding-left: 20px;">
          ${changes.modified.map(item => `<li>${this.escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>`;
    }

    return html || '<p style="margin: 0; color: #666;">Changes detected in menu content.</p>';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}

// Initialize detector when page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.menuDetector = new MenuChangeDetector();
    window.menuDetector.init();
  });
} else {
  window.menuDetector = new MenuChangeDetector();
  window.menuDetector.init();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'ENABLE_MONITORING') {
    window.menuDetector = new MenuChangeDetector();
    window.menuDetector.init();
    sendResponse({ success: true });
  } else if (request.type === 'DISABLE_MONITORING') {
    if (window.menuDetector) {
      window.menuDetector.destroy();
    }
    sendResponse({ success: true });
  } else if (request.type === 'TEST_NOW') {
    if (window.menuDetector) {
      window.menuDetector.analyzePageContent();
    }
    sendResponse({ success: true });
  }
  return true;
});

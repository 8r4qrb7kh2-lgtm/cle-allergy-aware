/**
 * Clarivore Manager Overlay for GoDaddy Website Builder
 *
 * This script adds a prominent, impossible-to-miss Clarivore interface
 * to GoDaddy's menu editing experience. It ensures managers cannot
 * edit menu items without being reminded to update allergen information.
 *
 * INSTALLATION:
 * Add this script to GoDaddy Settings > Advanced > Header Code
 * The script will detect when a manager is editing the menu and
 * show prominent warnings and helpers.
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    restaurantSlug: 'mama-santas',
    supabaseUrl: 'https://vnrjgfiwzlkemkmovhfh.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZucmpnZml3emxrZW1rbW92aGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUxNzgwNzIsImV4cCI6MjA1MDc1NDA3Mn0.XC8oYmKe-ZgP1pIOmAcFPOv4g2eOwAPxc1yXSRHKdxw',
    clarivoreUrl: 'https://clarivore.org/restaurant.html'
  };

  // ============================================================================
  // DETECT IF IN GODADDY EDITOR MODE
  // ============================================================================

  function isInGoDaddyEditor() {
    // GoDaddy editor has specific URL patterns or iframe structures
    return window.location.href.includes('websitebuilder.secureserver.net') ||
           window.location.href.includes('godaddy.com/websites') ||
           document.querySelector('[data-aid*="EDITOR"]') !== null ||
           // Check if in edit mode
           window.location.search.includes('edit=') ||
           window.parent !== window; // In iframe
  }

  // Only run if NOT in editor (i.e., on the live site where manager would edit via GoDaddy's UI)
  // We want this to run on the published site when manager logs in
  const isEditor = isInGoDaddyEditor();

  // ============================================================================
  // STATE
  // ============================================================================

  let restaurantData = null;
  let menuItemsStatus = new Map(); // Track allergen status for each menu item

  // ============================================================================
  // FETCH DATA
  // ============================================================================

  async function fetchFromSupabase(table, filters = {}) {
    let url = `${CONFIG.supabaseUrl}/rest/v1/${table}?`;
    Object.keys(filters).forEach(key => {
      url += `${key}=eq.${encodeURIComponent(filters[key])}&`;
    });
    const response = await fetch(url, {
      headers: {
        'apikey': CONFIG.supabaseAnonKey,
        'Authorization': `Bearer ${CONFIG.supabaseAnonKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error(`Supabase request failed: ${response.statusText}`);
    return await response.json();
  }

  async function loadRestaurantData() {
    try {
      const results = await fetchFromSupabase('restaurants', {
        slug: CONFIG.restaurantSlug
      });
      if (results && results.length > 0) {
        restaurantData = results[0];
        analyzeMenuItemsStatus();
        return true;
      }
      return false;
    } catch (error) {
      console.error('[Clarivore Manager] Failed to load data:', error);
      return false;
    }
  }

  // ============================================================================
  // ANALYZE MENU STATUS
  // ============================================================================

  function analyzeMenuItemsStatus() {
    const menuItems = document.querySelectorAll('[data-aid*="MENU_ITEM"]');

    menuItems.forEach(item => {
      const heading = item.querySelector('[data-aid*="TITLE"]');
      if (!heading) return;

      const dishName = heading.textContent.trim();
      const dish = findDishByName(dishName);

      const status = {
        name: dishName,
        element: item,
        hasClarivoreData: !!dish,
        hasAllergens: dish?.allergens?.length > 0,
        allergenCount: dish?.allergens?.length || 0,
        lastUpdated: dish?.lastUpdated || null,
        needsUpdate: !dish || !dish.allergens || dish.allergens.length === 0
      };

      menuItemsStatus.set(dishName, status);
    });
  }

  function findDishByName(dishName) {
    if (!restaurantData || !restaurantData.overlays) return null;
    const normalized = dishName.toLowerCase().trim();
    return restaurantData.overlays.find(overlay => {
      return overlay.id && overlay.id.toLowerCase().trim() === normalized;
    });
  }

  // ============================================================================
  // CREATE MANAGER OVERLAY UI
  // ============================================================================

  function createManagerOverlay() {
    // Create floating panel
    const overlay = document.createElement('div');
    overlay.id = 'clarivore-manager-overlay';
    overlay.innerHTML = `
      <style>
        #clarivore-manager-overlay {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 380px;
          max-height: 90vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        #clarivore-manager-overlay.minimized {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          overflow: hidden;
        }

        #clarivore-manager-overlay.minimized .clarivore-content {
          display: none;
        }

        #clarivore-manager-overlay.minimized .clarivore-minimize-btn {
          width: 100%;
          height: 100%;
          border-radius: 50%;
        }

        .clarivore-header {
          background: rgba(0,0,0,0.2);
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .clarivore-logo {
          font-size: 20px;
          font-weight: 700;
          color: white;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .clarivore-minimize-btn {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .clarivore-minimize-btn:hover {
          background: rgba(255,255,255,0.3);
        }

        .clarivore-content {
          padding: 20px;
          max-height: calc(90vh - 80px);
          overflow-y: auto;
          color: white;
        }

        .clarivore-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 20px;
        }

        .clarivore-stat {
          background: rgba(0,0,0,0.2);
          padding: 16px;
          border-radius: 12px;
          text-align: center;
        }

        .clarivore-stat-number {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .clarivore-stat-label {
          font-size: 12px;
          opacity: 0.9;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .clarivore-warning {
          background: #ff6b6b;
          padding: 16px;
          border-radius: 12px;
          margin-bottom: 16px;
          font-size: 14px;
          line-height: 1.5;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .clarivore-warning-icon {
          font-size: 24px;
          flex-shrink: 0;
        }

        .clarivore-success {
          background: rgba(0,0,0,0.2);
          padding: 16px;
          border-radius: 12px;
          margin-bottom: 16px;
          font-size: 14px;
          line-height: 1.5;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .clarivore-dishes-list {
          margin-top: 16px;
        }

        .clarivore-dish-item {
          background: rgba(0,0,0,0.2);
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .clarivore-dish-item:hover {
          background: rgba(0,0,0,0.3);
        }

        .clarivore-dish-item.missing {
          background: rgba(255,107,107,0.3);
          border: 2px solid #ff6b6b;
        }

        .clarivore-dish-name {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
        }

        .clarivore-dish-status {
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 12px;
          background: rgba(255,255,255,0.2);
          white-space: nowrap;
        }

        .clarivore-dish-status.complete {
          background: #51cf66;
          color: white;
        }

        .clarivore-dish-status.missing {
          background: #ff6b6b;
          color: white;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .clarivore-action-btn {
          background: white;
          color: #667eea;
          border: none;
          padding: 14px 20px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: transform 0.2s, box-shadow 0.2s;
          margin-top: 12px;
        }

        .clarivore-action-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }

        .clarivore-action-btn.secondary {
          background: rgba(255,255,255,0.2);
          color: white;
        }

        /* Scrollbar styling */
        .clarivore-content::-webkit-scrollbar {
          width: 8px;
        }

        .clarivore-content::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.1);
          border-radius: 4px;
        }

        .clarivore-content::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.3);
          border-radius: 4px;
        }

        .clarivore-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.5);
        }
      </style>

      <div class="clarivore-header">
        <div class="clarivore-logo">
          🛡️ <span>Clarivore</span>
        </div>
        <button class="clarivore-minimize-btn" onclick="document.getElementById('clarivore-manager-overlay').classList.toggle('minimized')">
          −
        </button>
      </div>

      <div class="clarivore-content">
        <div class="clarivore-stats">
          <div class="clarivore-stat">
            <div class="clarivore-stat-number" id="clarivore-total-dishes">0</div>
            <div class="clarivore-stat-label">Total Dishes</div>
          </div>
          <div class="clarivore-stat">
            <div class="clarivore-stat-number" id="clarivore-missing-count" style="color: #ff6b6b;">0</div>
            <div class="clarivore-stat-label">Need Allergens</div>
          </div>
        </div>

        <div id="clarivore-alert-container"></div>

        <div class="clarivore-dishes-list" id="clarivore-dishes-list"></div>

        <button class="clarivore-action-btn" onclick="window.ClarivoreManager.openEditorForAll()">
          🚀 Update All Allergen Info
        </button>

        <button class="clarivore-action-btn secondary" onclick="window.ClarivoreManager.refreshData()">
          🔄 Refresh Status
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Make it draggable
    makeElementDraggable(overlay);
  }

  function makeElementDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    const header = element.querySelector('.clarivore-header');

    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      if (e.target.classList.contains('clarivore-minimize-btn')) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      element.style.top = (element.offsetTop - pos2) + "px";
      element.style.left = (element.offsetLeft - pos1) + "px";
      element.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  function updateOverlayContent() {
    const totalDishes = menuItemsStatus.size;
    const missingCount = Array.from(menuItemsStatus.values()).filter(s => s.needsUpdate).length;
    const completeCount = totalDishes - missingCount;

    // Update stats
    document.getElementById('clarivore-total-dishes').textContent = totalDishes;
    document.getElementById('clarivore-missing-count').textContent = missingCount;

    // Update alert
    const alertContainer = document.getElementById('clarivore-alert-container');
    if (missingCount > 0) {
      alertContainer.innerHTML = `
        <div class="clarivore-warning">
          <div class="clarivore-warning-icon">⚠️</div>
          <div>
            <strong>${missingCount} dish${missingCount !== 1 ? 'es' : ''} missing allergen information!</strong><br>
            Click on any dish below to add ingredients and allergens.
          </div>
        </div>
      `;
    } else {
      alertContainer.innerHTML = `
        <div class="clarivore-success">
          <div>✅</div>
          <div><strong>All dishes have allergen information!</strong> Great job keeping customers safe.</div>
        </div>
      `;
    }

    // Update dishes list
    const dishesList = document.getElementById('clarivore-dishes-list');
    dishesList.innerHTML = '';

    // Show missing dishes first
    const sortedDishes = Array.from(menuItemsStatus.entries()).sort((a, b) => {
      if (a[1].needsUpdate && !b[1].needsUpdate) return -1;
      if (!a[1].needsUpdate && b[1].needsUpdate) return 1;
      return 0;
    });

    sortedDishes.forEach(([name, status]) => {
      const dishItem = document.createElement('div');
      dishItem.className = `clarivore-dish-item ${status.needsUpdate ? 'missing' : ''}`;
      dishItem.innerHTML = `
        <div class="clarivore-dish-name">${name}</div>
        <div class="clarivore-dish-status ${status.needsUpdate ? 'missing' : 'complete'}">
          ${status.needsUpdate ? '❌ Missing' : `✅ ${status.allergenCount} allergens`}
        </div>
      `;
      dishItem.onclick = () => openClarivoreEditor(name);
      dishesList.appendChild(dishItem);
    });
  }

  function openClarivoreEditor(dishName) {
    const url = `${CONFIG.clarivoreUrl}?slug=${encodeURIComponent(CONFIG.restaurantSlug)}&edit=1&dishName=${encodeURIComponent(dishName)}&openAI=true`;
    window.open(url, '_blank');
  }

  // ============================================================================
  // GLOBAL API
  // ============================================================================

  window.ClarivoreManager = {
    refreshData: async function() {
      const success = await loadRestaurantData();
      if (success) {
        updateOverlayContent();
        alert('✅ Allergen data refreshed successfully!');
      } else {
        alert('❌ Failed to refresh data. Please try again.');
      }
    },

    openEditorForAll: function() {
      const missing = Array.from(menuItemsStatus.values()).filter(s => s.needsUpdate);
      if (missing.length === 0) {
        alert('✅ All dishes already have allergen information!');
        return;
      }

      const confirmed = confirm(
        `You have ${missing.length} dish${missing.length !== 1 ? 'es' : ''} missing allergen information.\n\n` +
        `This will open the Clarivore editor where you can add ingredients for all dishes.\n\n` +
        `Continue?`
      );

      if (confirmed) {
        const url = `${CONFIG.clarivoreUrl}?slug=${encodeURIComponent(CONFIG.restaurantSlug)}&edit=1`;
        window.open(url, '_blank');
      }
    },

    getDishStatus: function(dishName) {
      return menuItemsStatus.get(dishName);
    }
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async function init() {
    console.log('[Clarivore Manager] Initializing manager overlay...');

    // Load data
    const success = await loadRestaurantData();
    if (!success) {
      console.error('[Clarivore Manager] Failed to load restaurant data');
      return;
    }

    // Create UI
    createManagerOverlay();
    updateOverlayContent();

    // Auto-refresh every 2 minutes
    setInterval(async () => {
      await loadRestaurantData();
      updateOverlayContent();
    }, 120000);

    console.log('[Clarivore Manager] Manager overlay initialized');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

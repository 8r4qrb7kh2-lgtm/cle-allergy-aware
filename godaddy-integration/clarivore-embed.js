/**
 * Clarivore Allergen Badges - GoDaddy Website Builder Integration
 *
 * This script adds allergen information badges to menu items on GoDaddy-built websites.
 *
 * INSTALLATION:
 * 1. In GoDaddy Website Builder, go to Settings > Advanced > Header Code
 * 2. Add this entire script wrapped in <script> tags
 * 3. Configure the RESTAURANT_SLUG below to match your Clarivore restaurant slug
 *
 * USAGE:
 * Add data-clarivore-dish="DISH_ID" attribute to any menu item element
 * The script will automatically fetch and display allergen badges
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    // Your restaurant's slug in the Clarivore system
    restaurantSlug: 'mama-santas',

    // Supabase configuration
    supabaseUrl: 'https://vnrjgfiwzlkemkmovhfh.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZucmpnZml3emxrZW1rbW92aGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUxNzgwNzIsImV4cCI6MjA1MDc1NDA3Mn0.XC8oYmKe-ZgP1pIOmAcFPOv4g2eOwAPxc1yXSRHKdxw',

    // Badge styling
    badgeStyles: {
      fontSize: '11px',
      padding: '3px 8px',
      borderRadius: '12px',
      margin: '2px',
      display: 'inline-block',
      fontWeight: '600',
      fontFamily: 'inherit'
    },

    // Allergen colors
    allergenColors: {
      'peanut': { bg: '#FFF3CD', color: '#856404', emoji: '🥜' },
      'tree nuts': { bg: '#F8D7DA', color: '#721C24', emoji: '🌰' },
      'milk': { bg: '#D1ECF1', color: '#0C5460', emoji: '🥛' },
      'egg': { bg: '#FFF3CD', color: '#856404', emoji: '🥚' },
      'wheat': { bg: '#F8D7DA', color: '#721C24', emoji: '🌾' },
      'soy': { bg: '#D4EDDA', color: '#155724', emoji: '🫘' },
      'fish': { bg: '#D1ECF1', color: '#0C5460', emoji: '🐟' },
      'shellfish': { bg: '#F8D7DA', color: '#721C24', emoji: '🦐' },
      'sesame': { bg: '#FFF3CD', color: '#856404', emoji: '🌱' },
      'gluten': { bg: '#F8D7DA', color: '#721C24', emoji: '🌾' }
    }
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let restaurantData = null;
  let isLoading = false;
  let hasLoaded = false;

  // ============================================================================
  // SUPABASE CLIENT
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

    if (!response.ok) {
      throw new Error(`Supabase request failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  async function loadRestaurantData() {
    if (isLoading || hasLoaded) return;

    isLoading = true;

    try {
      console.log('[Clarivore] Loading restaurant data for:', CONFIG.restaurantSlug);

      const results = await fetchFromSupabase('restaurants', {
        slug: CONFIG.restaurantSlug
      });

      if (results && results.length > 0) {
        restaurantData = results[0];
        hasLoaded = true;
        console.log('[Clarivore] Restaurant data loaded:', restaurantData);
      } else {
        console.error('[Clarivore] Restaurant not found:', CONFIG.restaurantSlug);
      }
    } catch (error) {
      console.error('[Clarivore] Failed to load restaurant data:', error);
    } finally {
      isLoading = false;
    }
  }

  // ============================================================================
  // DISH LOOKUP
  // ============================================================================

  function findDishById(dishId) {
    if (!restaurantData || !restaurantData.overlays) return null;

    return restaurantData.overlays.find(overlay => {
      return overlay.id === dishId ||
             overlay.id === String(dishId) ||
             overlay.id.toLowerCase() === String(dishId).toLowerCase();
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
  // BADGE RENDERING
  // ============================================================================

  function createBadge(allergen, canRemove = false) {
    const badge = document.createElement('span');
    const allergenKey = allergen.toLowerCase();
    const colors = CONFIG.allergenColors[allergenKey] || {
      bg: '#E2E3E5',
      color: '#383D41',
      emoji: '⚠️'
    };

    Object.assign(badge.style, CONFIG.badgeStyles, {
      backgroundColor: colors.bg,
      color: colors.color
    });

    badge.className = 'clarivore-allergen-badge';
    badge.setAttribute('data-allergen', allergen);

    const text = canRemove
      ? `${colors.emoji} Contains ${allergen} (can be removed)`
      : `${colors.emoji} Contains ${allergen}`;

    badge.textContent = text;

    return badge;
  }

  function createBadgeContainer(dish) {
    const container = document.createElement('div');
    container.className = 'clarivore-badges';
    container.style.marginTop = '8px';
    container.style.marginBottom = '4px';

    if (!dish.allergens || dish.allergens.length === 0) {
      return null;
    }

    // Get removable allergens
    const removableSet = new Set(
      (dish.removable || []).map(r => r.allergen?.toLowerCase())
    );

    // Create badges for each allergen
    dish.allergens.forEach(allergen => {
      const canRemove = removableSet.has(allergen.toLowerCase());
      const badge = createBadge(allergen, canRemove);
      container.appendChild(badge);
    });

    return container;
  }

  // ============================================================================
  // DOM MANIPULATION
  // ============================================================================

  function addBadgesToElement(element, dishId) {
    // Check if badges already added
    if (element.querySelector('.clarivore-badges')) {
      return;
    }

    const dish = findDishById(dishId);

    if (!dish) {
      console.warn('[Clarivore] Dish not found:', dishId);
      return;
    }

    const badgeContainer = createBadgeContainer(dish);

    if (badgeContainer) {
      // Try to insert after the dish description or price
      const description = element.querySelector('[data-aid*="DESC"]') ||
                         element.querySelector('[data-ux="Text"]');

      if (description) {
        description.parentNode.insertBefore(badgeContainer, description.nextSibling);
      } else {
        element.appendChild(badgeContainer);
      }

      console.log('[Clarivore] Added badges for:', dish.id);
    }
  }

  function processDishElements() {
    const elements = document.querySelectorAll('[data-clarivore-dish]');

    console.log('[Clarivore] Processing', elements.length, 'dish elements');

    elements.forEach(element => {
      const dishId = element.getAttribute('data-clarivore-dish');
      if (dishId) {
        addBadgesToElement(element, dishId);
      }
    });
  }

  function autoDetectMenuItems() {
    // Auto-detect GoDaddy menu items and try to match by name
    const menuItems = document.querySelectorAll('[data-aid*="MENU_ITEM"]');

    console.log('[Clarivore] Auto-detecting', menuItems.length, 'menu items');

    menuItems.forEach(menuItem => {
      // Skip if already has badges or data-clarivore-dish
      if (menuItem.querySelector('.clarivore-badges') ||
          menuItem.hasAttribute('data-clarivore-dish')) {
        return;
      }

      // Try to find dish name from heading
      const heading = menuItem.querySelector('[data-aid*="TITLE"]');
      if (!heading) return;

      const dishName = heading.textContent.trim();
      const dish = findDishByName(dishName);

      if (dish) {
        menuItem.setAttribute('data-clarivore-dish', dish.id);
        addBadgesToElement(menuItem, dish.id);
      }
    });
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async function init() {
    console.log('[Clarivore] Initializing...');

    // Load restaurant data
    await loadRestaurantData();

    if (!hasLoaded) {
      console.error('[Clarivore] Failed to initialize - no restaurant data');
      return;
    }

    // Process elements with data-clarivore-dish attribute
    processDishElements();

    // Auto-detect and match menu items by name
    autoDetectMenuItems();

    // Watch for DOM changes (for dynamically loaded content)
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            if (node.matches('[data-clarivore-dish]') ||
                node.querySelector('[data-clarivore-dish]') ||
                node.matches('[data-aid*="MENU_ITEM"]') ||
                node.querySelector('[data-aid*="MENU_ITEM"]')) {
              shouldProcess = true;
            }
          }
        });
      });

      if (shouldProcess) {
        processDishElements();
        autoDetectMenuItems();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[Clarivore] Initialization complete');
  }

  // ============================================================================
  // START
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose API for manual triggering
  window.Clarivore = {
    reload: init,
    config: CONFIG
  };

})();

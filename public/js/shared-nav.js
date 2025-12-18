/**
 * Shared navigation module for consistent navigation across all pages
 * Usage: call setupNav(currentPage, user) where currentPage is one of:
 * 'restaurants', 'favorites', 'dish-search', 'account', 'report-issue'
 * Updated: 2025-01-22 - Added dish-search to navigation
 */

/**
 * Universal auth redirect - automatically redirects to landing page if not logged in
 * Exceptions: index.html (landing page), account.html (login page), QR users
 */
export async function checkAuthRedirect(supabaseClient) {
  // Get current page
  const currentPath = window.location.pathname;
  const currentPage = currentPath.split('/').pop() || 'index.html';
  const urlParams = new URLSearchParams(window.location.search);
  const isQRUser = urlParams.get('qr') === '1';

  // Skip redirect for landing page, account page, and QR users
  if (currentPage === 'index.html' || currentPage === '' || currentPage === '/' ||
      currentPage === 'account.html' || isQRUser) {
    return;
  }

  // Check if user is logged in
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();

    // If not logged in, redirect to landing page
    if (!user) {
      window.location.replace('/index.html');
      return;
    }
  } catch (error) {
    console.error('Auth check error:', error);
    // On error, redirect to landing page to be safe
    window.location.replace('/index.html');
  }
}

export function setupNav(currentPage, user = null, options = {}) {
  const navContainer = document.querySelector('.simple-nav');
  if (!navContainer) {
    console.warn('Navigation container not found');
    return;
  }

  // Clear existing nav
  navContainer.innerHTML = '';

  const isOwner = user?.email === 'matt.29.ds@gmail.com';
  const isManager = user?.user_metadata?.role === 'manager';
  const managerRestaurants = Array.isArray(options.managerRestaurants) ? options.managerRestaurants : [];

  // Check mode for managers - default to 'editor' if not set
  const isManagerOrOwner = isManager || isOwner;
  let currentMode = localStorage.getItem('clarivoreManagerMode');
  if (isManagerOrOwner && !currentMode) {
    currentMode = 'editor';
    localStorage.setItem('clarivoreManagerMode', 'editor');
  }
  const isEditorMode = currentMode === 'editor';

  // Update brand link based on editor mode
  const brandLink = document.querySelector('.simple-brand');
  if (brandLink && isManagerOrOwner) {
    brandLink.href = isEditorMode ? 'manager-dashboard.html' : 'home.html';
  }

  let navStructure = [];

  if (isOwner && isEditorMode) {
    // Owner/Admin in editor mode - admin nav with all tools
    navStructure = [
      { type: 'link', id: 'admin', label: 'Admin', href: 'admin-dashboard.html', requiresAuth: true },
      { type: 'link', id: 'home', label: 'Dashboard', href: 'manager-dashboard.html', requiresAuth: true },
      // Webpage editor buttons for each restaurant
      ...(managerRestaurants.length === 1 ? [
        { type: 'link', id: `restaurant-${managerRestaurants[0].slug}-editor`, label: 'Webpage editor', href: `restaurant.html?slug=${encodeURIComponent(managerRestaurants[0].slug)}&edit=1`, requiresAuth: true }
      ] : managerRestaurants.length > 1 ? [{
        type: 'group',
        label: 'Webpage editor',
        items: managerRestaurants.map(restaurant => ({
          id: `restaurant-${restaurant.slug}-editor`,
          label: restaurant.name,
          href: `restaurant.html?slug=${encodeURIComponent(restaurant.slug)}&edit=1`,
          requiresAuth: true
        }))
      }] : []),
      {
        type: 'group',
        label: 'Tablet pages',
        items: [
          { id: 'server-tablet', label: 'Server tablet', href: 'server-tablet.html', requiresAuth: true },
          { id: 'kitchen-tablet', label: 'Kitchen tablet', href: 'kitchen-tablet.html', requiresAuth: true }
        ]
      },
      { type: 'link', id: 'account', label: 'Account settings', href: 'account.html' }
    ];
  } else if (isOwner && !isEditorMode) {
    // Owner in customer mode - sees customer navigation
    navStructure = [
      { type: 'link', id: 'home', label: 'Home', href: 'home.html' },
      {
        type: 'group',
        label: 'By restaurant',
        items: [
          { id: 'restaurants', label: 'All restaurants', href: 'restaurants.html', requiresAuth: true },
          { id: 'favorites', label: 'Favorite restaurants', href: 'favorites.html', requiresAuth: true }
        ]
      },
      {
        type: 'group',
        label: 'By dish',
        items: [
          { id: 'dish-search', label: 'Dish search', href: 'dish-search.html', requiresAuth: true },
          { id: 'my-dishes', label: 'My dishes', href: 'my-dishes.html', requiresAuth: true }
        ]
      },
      { type: 'link', id: 'account', label: 'Account settings', href: 'account.html' }
    ];
  } else if (isManager && isEditorMode) {
    // Manager in EDITOR mode - show manager navigation
    navStructure = [];

    // Dashboard (manager dashboard with statistics)
    navStructure.push({ type: 'link', id: 'home', label: 'Dashboard', href: 'manager-dashboard.html', requiresAuth: true });

    // Webpage editor buttons for each restaurant
    if (managerRestaurants.length === 1) {
      // Single restaurant - just one button
      const restaurant = managerRestaurants[0];
      navStructure.push({ type: 'link', id: `restaurant-${restaurant.slug}-editor`, label: 'Webpage editor', href: `restaurant.html?slug=${encodeURIComponent(restaurant.slug)}&edit=1`, requiresAuth: true });
    } else if (managerRestaurants.length > 1) {
      // Multiple restaurants - dropdown with restaurant names
      navStructure.push({
        type: 'group',
        label: 'Webpage editor',
        items: managerRestaurants.map(restaurant => ({
          id: `restaurant-${restaurant.slug}-editor`,
          label: restaurant.name,
          href: `restaurant.html?slug=${encodeURIComponent(restaurant.slug)}&edit=1`,
          requiresAuth: true
        }))
      });
    }

    // Tablet pages dropdown
    navStructure.push({
      type: 'group',
      label: 'Tablet pages',
      items: [
        { id: 'server-tablet', label: 'Server tablet', href: 'server-tablet.html', requiresAuth: true },
        { id: 'kitchen-tablet', label: 'Kitchen tablet', href: 'kitchen-tablet.html', requiresAuth: true }
      ]
    });

    // Account settings
    navStructure.push({ type: 'link', id: 'account', label: 'Account settings', href: 'account.html', requiresAuth: true });
  } else if (isManager && !isEditorMode) {
    // Manager in CUSTOMER mode - show customer navigation
    navStructure = [
      { type: 'link', id: 'home', label: 'Home', href: 'home.html' },
      {
        type: 'group',
        label: 'By restaurant',
        items: [
          { id: 'restaurants', label: 'All restaurants', href: 'restaurants.html', requiresAuth: true },
          { id: 'favorites', label: 'Favorite restaurants', href: 'favorites.html', requiresAuth: true }
        ]
      },
      {
        type: 'group',
        label: 'By dish',
        items: [
          { id: 'dish-search', label: 'Dish search', href: 'dish-search.html', requiresAuth: true },
          { id: 'my-dishes', label: 'My dishes', href: 'my-dishes.html', requiresAuth: true }
        ]
      },
      { type: 'link', id: 'account', label: 'Account settings', href: 'account.html' }
    ];
  } else {
    // Regular user view (not logged in or regular customer)
    navStructure = [
      { type: 'link', id: 'home', label: 'Home', href: 'home.html' },
      {
        type: 'group',
        label: 'By restaurant',
        items: [
          { id: 'restaurants', label: 'All restaurants', href: 'restaurants.html', requiresAuth: true },
          { id: 'favorites', label: 'Favorite restaurants', href: 'favorites.html', requiresAuth: true }
        ]
      },
      {
        type: 'group',
        label: 'By dish',
        items: [
          { id: 'dish-search', label: 'Dish search', href: 'dish-search.html', requiresAuth: true },
          { id: 'my-dishes', label: 'My dishes', href: 'my-dishes.html', requiresAuth: true }
        ]
      },
      { type: 'link', id: 'account', label: 'Account settings', href: 'account.html' }
    ];
  }

  navStructure.forEach(item => {
    // Handle groups
    if (item.type === 'group') {

      // Filter items within group
      const visibleItems = item.items.filter(subItem => {
        if (subItem.requiresAuth && !user) return false;
        return true;
      });

      if (visibleItems.length === 0) return;

      const groupContainer = document.createElement('div');
      groupContainer.className = 'nav-group';

      const trigger = document.createElement('button');
      trigger.className = 'nav-dropdown-trigger';
      trigger.textContent = item.label;

      // Check if any child is active
      const isChildActive = visibleItems.some(subItem => subItem.id === currentPage);
      if (isChildActive) {
        trigger.classList.add('current-page');
      }

      const dropdown = document.createElement('div');
      dropdown.className = 'nav-dropdown-content';

      visibleItems.forEach(subItem => {
        const link = document.createElement('a');
        link.href = subItem.href;
        link.textContent = subItem.label;
        if (currentPage === subItem.id) {
          link.classList.add('current-page');
        }
        dropdown.appendChild(link);
      });

      groupContainer.appendChild(trigger);
      groupContainer.appendChild(dropdown);
      navContainer.appendChild(groupContainer);
      return;
    }

    // Handle single links
    if (item.requiresAuth && !user) {
      // Special case for account button when logged out
      if (item.id === 'account') {
        const btn = document.createElement('button');
        btn.textContent = 'Sign in';
        btn.type = 'button';
        btn.onclick = () => window.location.href = 'account.html';
        if (currentPage === 'account') {
          btn.classList.add('current-page');
        }
        navContainer.appendChild(btn);
      }
      return;
    }

    const btn = document.createElement('button');
    btn.textContent = item.label;
    btn.type = 'button';
    if (currentPage === item.id) {
      btn.classList.add('current-page');
    }
    btn.onclick = () => window.location.href = item.href;
    navContainer.appendChild(btn);
  });

  console.log('Navigation setup complete');
}

// Deprecated: Sign out handler moved to account page
export function attachSignOutHandler(supabaseClient) {
  // No-op: kept for backward compatibility
}

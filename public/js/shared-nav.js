/**
 * Shared navigation module for consistent navigation across all pages
 * Usage: call setupNav(currentPage, user) where currentPage is one of:
 * 'restaurants', 'favorites', 'dish-search', 'account', 'report-issue'
 * Updated: 2025-01-22 - Added dish-search to navigation
 */

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

  let navStructure = [];

  if (isManager && !isOwner) {
    // Manager view
    const restaurantItems = managerRestaurants.map((restaurant) => ({
      id: `restaurant-${restaurant.slug}`,
      label: restaurant.name,
      href: `restaurant.html?slug=${encodeURIComponent(restaurant.slug)}`,
      requiresAuth: true
    }));

    if (restaurantItems.length === 0) {
      restaurantItems.push({
        id: 'restaurants',
        label: 'My restaurant',
        href: 'restaurants.html',
        requiresAuth: true
      });
    }

    navStructure = [
      {
        type: 'group',
        label: 'Management',
        items: [
          ...restaurantItems,
          { id: 'manager-dashboard', label: 'Manager dashboard', href: 'manager-dashboard.html', requiresAuth: true },
          { id: 'server-tablet', label: 'Server monitor', href: 'server-tablet.html', requiresAuth: true },
          { id: 'kitchen-tablet', label: 'Kitchen monitor', href: 'kitchen-tablet.html', requiresAuth: true }
        ]
      },
      { type: 'link', id: 'account', label: 'Account settings', href: 'account.html', requiresAuth: true }
    ];
  } else {
    // Regular user / Owner view
    navStructure = [
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
          { id: 'loved-dishes', label: 'My dishes', href: 'loved-dishes.html', requiresAuth: true }
        ]
      },
      { type: 'link', id: 'our-mission', label: 'Our mission', href: 'our-mission.html' },
      { type: 'link', id: 'how-it-works', label: 'How it works', href: 'how-it-works.html' },
      {
        type: 'group',
        label: 'Management',
        ownerOnly: true,
        items: [
          { id: 'admin', label: 'Admin', href: 'admin-dashboard.html', requiresAuth: true },
          { id: 'manager-dashboard', label: 'Manager dashboard', href: 'manager-dashboard.html', requiresAuth: true },
          { id: 'server-tablet', label: 'Server monitor', href: 'server-tablet.html', requiresAuth: true },
          { id: 'kitchen-tablet', label: 'Kitchen monitor', href: 'kitchen-tablet.html', requiresAuth: true }
        ]
      },
      { type: 'link', id: 'account', label: 'Account settings', href: 'account.html' }
    ];
  }

  navStructure.forEach(item => {
    // Handle groups
    if (item.type === 'group') {
      if (item.ownerOnly && !isOwner) return;

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

    if (item.ownerOnly && !isOwner) return;

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

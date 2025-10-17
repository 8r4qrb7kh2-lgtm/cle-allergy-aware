/**
 * Shared navigation module for consistent navigation across all pages
 * Usage: call setupNav(currentPage, user) where currentPage is one of:
 * 'restaurants', 'favorites', 'how-it-works', 'account', 'report-issue'
 */

export function setupNav(currentPage, user = null) {
  const navContainer = document.querySelector('.simple-nav');
  if (!navContainer) return;

  // Clear existing nav
  navContainer.innerHTML = '';

  // Define all nav items in consistent order
  const navItems = [
    { id: 'restaurants', label: 'All restaurants', href: 'restaurants.html' },
    { id: 'how-it-works', label: 'How it works', href: 'how-it-works.html' },
    { id: 'favorites', label: 'Favorite restaurants', href: 'favorites.html', requiresAuth: true },
    { id: 'account', label: 'Account settings', href: 'account.html' }
  ];

  navItems.forEach(item => {
    // Skip items that require auth if user is not logged in
    if (item.requiresAuth && !user) return;

    // For sign-in button when not logged in
    if (item.id === 'account' && !user) {
      const btn = document.createElement('button');
      btn.textContent = 'Sign in';
      btn.type = 'button';
      btn.onclick = () => window.location.href = 'account.html';
      if (currentPage === 'account') {
        btn.classList.add('current-page');
      }
      navContainer.appendChild(btn);
      return;
    }

    const btn = document.createElement('button');
    btn.textContent = item.label;
    btn.type = 'button';

    // Add current page indicator
    if (currentPage === item.id) {
      btn.classList.add('current-page');
    }

    // Set up click handler
    btn.onclick = () => window.location.href = item.href;

    navContainer.appendChild(btn);
  });
}

// Deprecated: Sign out handler moved to account page
export function attachSignOutHandler(supabaseClient) {
  // No-op: kept for backward compatibility
}

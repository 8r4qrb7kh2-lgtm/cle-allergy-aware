/**
 * Universal Auth Redirect Script
 * Include this script on all pages to automatically redirect non-logged-in users to landing page
 * Exceptions: index.html (landing page), account.html (login page), QR users
 */

(function() {
  // Wait for Supabase client to be available
  function waitForSupabase(callback, attempts = 0) {
    if (window.supabaseClient) {
      callback();
    } else if (attempts < 50) {
      // Wait up to 5 seconds (50 * 100ms)
      setTimeout(() => waitForSupabase(callback, attempts + 1), 100);
    } else {
      console.warn('Supabase client not found after 5 seconds, skipping auth redirect');
    }
  }

  waitForSupabase(async function() {
    // Get current page
    const currentPath = window.location.pathname;
    const currentPage = currentPath.split('/').pop() || 'index.html';
    const urlParams = new URLSearchParams(window.location.search);
    const isQRUser = urlParams.get('qr') === '1';

    // Skip redirect for landing page, account page, and QR users
    if (currentPage === 'index.html' ||
        currentPage === '' ||
        currentPage === '/' ||
        currentPage === 'account.html' ||
        isQRUser) {
      return;
    }

    // Check if user is logged in
    try {
      const { data: { user } } = await window.supabaseClient.auth.getUser();

      // If not logged in, redirect to landing page
      if (!user) {
        window.location.replace('/index.html');
        return;
      }
    } catch (error) {
      console.error('Auth redirect check error:', error);
      // On error, redirect to landing page to be safe
      window.location.replace('/index.html');
    }
  });
})();

import { registerRoute, handleRouteChange, navigate, goBack } from './router.js';

// Register all routes with lazy loading
registerRoute('dashboard', () => import('./views/dashboard.js'));
registerRoute('statistics', () => import('./views/statistics.js'));
registerRoute('account-detail', () => import('./views/account-detail.js'));

// Initialize app
function init() {
// Register Service Worker
  // 开发期间临时注释，方便看到JS改动
  // if ('serviceWorker' in navigator) {
  //   navigator.serviceWorker.register('./sw.js').catch(() => {});
  // }

  // Tab bar click handlers
  document.getElementById('tab-bar').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab-item');
    if (tab) {
      const route = tab.dataset.route;
      navigate(route);
    }
  });

  // Back button handler
  document.getElementById('nav-back').addEventListener('click', () => {
    goBack();
  });

  // Listen to hash changes
  window.addEventListener('hashchange', handleRouteChange);

  // Initial route
  if (!window.location.hash) {
    window.location.hash = '#/dashboard';
  } else {
    handleRouteChange();
  }
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Hash-based SPA Router

const routes = {};
let currentView = null;
let historyStack = [];

export function registerRoute(path, viewLoader) {
  routes[path] = viewLoader;
}

export function navigate(hash, { replace = false, push = false } = {}) {
  if (push) {
    historyStack.push(window.location.hash);
  }
  if (replace) {
    window.location.replace('#/' + hash);
  } else {
    window.location.hash = '#/' + hash;
  }
}

export function goBack() {
  if (historyStack.length > 0) {
    const prev = historyStack.pop();
    window.location.hash = prev;
  } else {
    navigate('dashboard');
  }
}

export function parseRoute(hash) {
  const clean = hash.replace(/^#\/?/, '') || 'dashboard';
  const parts = clean.split('/');

  // Match: account/:id (also handles /edit suffix by redirecting to detail)
  if (parts[0] === 'account' && parts[1] && parts[1] !== 'new') {
    return { path: 'account-detail', params: { id: parseInt(parts[1]) } };
  }

  return { path: parts[0], params: {} };
}

// Tabs that show in the tab bar
const TAB_ROUTES = new Set(['dashboard', 'statistics']);

export function isTabRoute(path) {
  return TAB_ROUTES.has(path);
}

export async function handleRouteChange() {
  const { path, params } = parseRoute(window.location.hash);
  const viewLoader = routes[path];

  if (!viewLoader) {
    navigate('dashboard', { replace: true });
    return;
  }

  const content = document.getElementById('app-content');
  const navBack = document.getElementById('nav-back');
  const navTitle = document.getElementById('nav-title');
  const navRight = document.getElementById('nav-right');
  const tabBar = document.getElementById('tab-bar');

  // Unmount current view
  if (currentView && currentView.unmount) {
    currentView.unmount();
  }

  // Load the view module
  const view = await viewLoader();
  currentView = view;

  // Update navigation bar
  const isTab = isTabRoute(path);
  navBack.classList.toggle('hidden', isTab);
  navRight.innerHTML = '';

  if (view.title) {
    navTitle.textContent = typeof view.title === 'function' ? view.title(params) : view.title;
  }

  if (view.navRight) {
    navRight.innerHTML = view.navRight(params);
  }

  // Update tab bar
  if (isTab) {
    tabBar.classList.remove('hidden');
    tabBar.querySelectorAll('.tab-item').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.route === path);
    });
  } else {
    tabBar.classList.add('hidden');
  }

  // Render content
  content.scrollTop = 0;
  const html = await view.render(params);
  content.innerHTML = html;

  // Mount event listeners
  if (view.mount) {
    await view.mount(params);
  }
}

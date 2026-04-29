// Shared UI components

export function showToast(message, duration = 2000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function showModal({ title, message, confirmText = '确定', cancelText = '取消', onConfirm, danger = false }) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');

  content.innerHTML = `
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      ${message ? `<div class="modal-message">${message}</div>` : ''}
    </div>
    <div class="modal-actions">
      <button class="modal-btn modal-btn-cancel" id="modal-cancel">${cancelText}</button>
      <button class="modal-btn ${danger ? 'modal-btn-confirm' : 'modal-btn-primary'}" id="modal-confirm">${confirmText}</button>
    </div>
  `;

  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('show'));

  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.classList.add('hidden'), 200);
  };

  content.querySelector('#modal-cancel').onclick = close;
  content.querySelector('#modal-confirm').onclick = () => {
    close();
    if (onConfirm) onConfirm();
  };
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
}

export function renderEmptyState(icon, text, actionText, actionRoute) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-text">${text}</div>
      ${actionText ? `<button class="btn btn-secondary empty-state-btn" data-action-route="${actionRoute || ''}">${actionText}</button>` : ''}
    </div>
  `;
}

export function renderLoading() {
  return `
    <div style="padding: 16px;">
      <div class="skeleton" style="height: 120px; margin-bottom: 12px;"></div>
      <div class="skeleton" style="height: 60px; margin-bottom: 8px;"></div>
      <div class="skeleton" style="height: 60px; margin-bottom: 8px;"></div>
      <div class="skeleton" style="height: 60px;"></div>
    </div>
  `;
}

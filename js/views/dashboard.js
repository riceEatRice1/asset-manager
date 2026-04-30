import { getAllActiveAccounts, addAccount, upsertRecord, deleteAccountPermanently, getLatestRecordBeforeDate, getPreviousBalance } from '../db.js';
import { formatCurrency, formatChange, getToday, getAccountIconHtml, formatDateShort, addDays, parseCurrencyInput, centsToInputValue, ACCOUNT_TYPES } from '../utils/format.js';
import { renderEmptyState, showToast, showModal } from './components.js';
import { navigate } from '../router.js';

export var title = '资产管家';

var currentDate = getToday();
var isRefreshing = false;
var eventBound = false;
var hideBalance = localStorage.getItem('hideBalance') === 'true';
var calendarVisible = false;
var calendarMonth = new Date().getMonth();
var calendarYear = new Date().getFullYear();

export async function render() {
  return '<div id="dashboard-view"></div>';
}

export async function mount() {
  currentDate = getToday();
  await refreshView();
  bindEvents();
}

async function refreshView() {
  if (isRefreshing) return;
  isRefreshing = true;

  try {
    var accounts = await getAllActiveAccounts();
    var container = document.getElementById('dashboard-view');

    if (accounts.length === 0) {
      container.innerHTML = renderInstallBanner() +
        renderEmptyState('📊', '还没有账户\n请先添加账户开始记录资产', '添加账户');
      var emptyBtn = container.querySelector('.empty-state-btn');
      if (emptyBtn) {
        emptyBtn.addEventListener('click', function() {
          showAddAccountModal();
        });
      }
      bindInstallBanner(container);
      return;
    }

    var totalBalance = 0;
    var totalChange = 0;
    var accountItems = [];

    for (var a = 0; a < accounts.length; a++) {
      var account = accounts[a];
      var accountLatest = await getLatestRecordBeforeDate(account.id, currentDate);
      var balance = accountLatest ? (accountLatest.balance || 0) : 0;
      totalBalance += balance;

      var prevDate = currentDate || getToday();
      var prevBalance = await getPreviousBalance(account.id, prevDate);
      var change = prevBalance !== null ? balance - prevBalance : 0;
      totalChange += change;

      accountItems.push({
        account: account,
        balance: balance,
        change: change,
        lastDate: accountLatest ? accountLatest.date : null
      });
    }

    var today = getToday();
    var isToday = currentDate === today;

    // Build account rows
    var accountHtml = '';
    for (var i = 0; i < accountItems.length; i++) {
      var item = accountItems[i];
      var changeHtml = '';
      if (item.change !== 0) {
        var cls = item.change > 0 ? 'text-success' : 'text-danger';
        changeHtml = '<div class="list-item-change ' + cls + '">' + formatChange(item.change) + '</div>';
      }
      var subtitle = item.lastDate ? '更新于 ' + item.lastDate : '暂无记录';
      var amountDisplay = hideBalance ? '****' : formatCurrency(item.balance);
      var changeDisplay = '';
      if (item.change !== 0) {
        var changeText = hideBalance ? '****' : formatChange(item.change);
        var cls = item.change > 0 ? 'text-success' : 'text-danger';
        changeDisplay = '<div class="list-item-change ' + cls + '">' + changeText + '</div>';
      }
      accountHtml += '' +
        '<div class="list-item account-row" data-id="' + item.account.id + '">' +
          '<div class="delete-button" data-id="' + item.account.id + '">删除</div>' +
          '<div class="swipe-content">' +
            '<div class="list-item-icon" id="icon-' + i + '" style="background: ' + item.account.color + '20; color: ' + item.account.color + ';">' +
              '<span>Loading...</span>' +
            '</div>' +
            '<div class="list-item-content">' +
              '<div class="list-item-title">' + item.account.name + '</div>' +
              '<div class="list-item-subtitle">' + subtitle + '</div>' +
            '</div>' +
            '<div class="list-item-right">' +
              '<div class="list-item-amount">' + amountDisplay + '</div>' +
              changeDisplay +
            '</div>' +
            '<span class="list-item-chevron">›</span>' +
          '</div>' +
        '</div>';
    }

    var balanceDisplay = hideBalance ? '****' : formatCurrency(totalBalance);
    var changeDisplayTotal = '';
    if (totalChange !== 0) {
      var changeText = hideBalance ? '****' : ('较上次 ' + (totalChange > 0 ? '↑' : '↓') + ' ' + formatChange(Math.abs(totalChange)).replace('+', ''));
      changeDisplayTotal = changeText;
    } else {
      changeDisplayTotal = '暂无变化数据';
    }

    var eyeIcon = hideBalance
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

    var btnStyle = 'display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer;';

    container.innerHTML = '' +
      renderInstallBanner() +
      '<div class="net-worth-card" style="position: relative;">' +
        '<div class="net-worth-label">总资产</div>' +
        '<button id="date-filter-btn" style="position: absolute; top: 12px; right: 52px; ' + btnStyle + '">' +
          '<svg width="16" height="16" viewBox="0 0 64 64" fill="none">' +
            '<rect x="12" y="16" width="40" height="36" rx="4" stroke="currentColor" stroke-width="3" fill="none"/>' +
            '<line x1="12" y1="28" x2="52" y2="28" stroke="currentColor" stroke-width="2"/>' +
            '<line x1="24" y1="12" x2="24" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
            '<line x1="40" y1="12" x2="40" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
            '<text x="32" y="42" font-size="12" font-weight="bold" text-anchor="middle" fill="white">' + formatDateShort(currentDate) + '</text>' +
          '</svg>' +
        '</button>' +
        '<button id="toggle-balance-btn" style="position: absolute; top: 12px; right: 12px; ' + btnStyle + '">' +
          eyeIcon +
        '</button>' +
        '<div id="calendar-popup" class="calendar-popup ' + (calendarVisible ? '' : 'hidden') + '">' +
          renderCalendar() +
        '</div>' +
        '<div class="net-worth-value">' + balanceDisplay + '</div>' +
        '<div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">' +
          '<div class="net-worth-change">' +
            changeDisplayTotal +
          '</div>' +
          '<span style="font-size: 11px; opacity: 0.7;">' + (isToday ? '今天' : formatDateShort(currentDate)) + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="list-group" id="add-account-btn" style="cursor: pointer; margin-bottom: 12px;">' +
        '<div class="list-item">' +
          '<div class="list-item-icon" style="background: var(--color-primary-light); color: var(--color-primary);">' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" style="width: 24px; height: 24px;">' +
              '<line x1="32" y1="12" x2="32" y2="52" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
              '<line x1="12" y1="32" x2="52" y2="32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
            '</svg>' +
          '</div>' +
          '<div class="list-item-content">' +
            '<div class="list-item-title" style="color: var(--color-primary);">添加账户</div>' +
            '<div class="list-item-subtitle">记录新账户资产</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="section-header">各账户资产</div>' +
      '<div class="list-group" id="account-list">' +
        accountHtml +
      '</div>' +

      '<div style="height: 20px;"></div>';

    // Load SVG icons asynchronously
    for (var j = 0; j < accountItems.length; j++) {
      var iconContainer = document.getElementById('icon-' + j);
      if (iconContainer) {
        var iconHtml = await getAccountIconHtml(accountItems[j].account);
        iconContainer.innerHTML = '<span>' + iconHtml + '</span>';
      }
    }

    // Re-bind date picker events after DOM rebuild
    bindDatePickerEvents();
    
    // Re-bind swipe events after DOM rebuild
    bindSwipeEvents();
  } finally {
    setTimeout(function() {
      isRefreshing = false;
    }, 50);
  }
}

function bindEvents() {
  if (eventBound) return;
  eventBound = true;

  var container = document.getElementById('dashboard-view');
  if (!container) return;

  container.addEventListener('click', function(e) {
    // Delete button click
    var deleteBtn = e.target.closest('.delete-button');
    if (deleteBtn) {
      e.stopPropagation();
      var accountId = parseInt(deleteBtn.dataset.id);
      handleDeleteAccount(accountId);
      return;
    }

    // Close calendar if clicking outside
    if (calendarVisible && !e.target.closest('#calendar-popup') && !e.target.closest('#date-filter-btn')) {
      calendarVisible = false;
      refreshView();
      return;
    }

    // Account row click - go to detail (only if not swiped)
    var accountRow = e.target.closest('.account-row');
    if (accountRow && !accountRow.classList.contains('swiped')) {
      e.stopPropagation();
      navigate('account/' + accountRow.dataset.id, { push: true });
      return;
    }

    // Add account button click
    if (e.target.closest('#add-account-btn')) {
      showAddAccountModal();
      return;
    }
  });

  bindDatePickerEvents();

  bindInstallBanner(container);

  // Initial swipe binding
  bindSwipeEvents();
}

function bindSwipeEvents() {
  var container = document.getElementById('dashboard-view');
  if (!container) return;
  
  var accountRows = container.querySelectorAll('.account-row');
  accountRows.forEach(function(row) {
    // Avoid double binding
    if (row.dataset.swipeBound) return;
    row.dataset.swipeBound = 'true';
    
    var startX = 0;
    var currentX = 0;
    var isDragging = false;
    var isOpened = false;
    var longPressTimer = null;
    var isLongPress = false;
    var longPressThreshold = 300; // 300ms long press

    row.addEventListener('touchstart', function(e) {
      startX = e.touches[0].clientX;
      isDragging = true;
      isLongPress = false;
      
      // Start long press timer
      longPressTimer = setTimeout(function() {
        isLongPress = true;
        // Provide haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }, longPressThreshold);
      
      // Close other swiped rows - get fresh list
      var currentRows = container.querySelectorAll('.account-row');
      currentRows.forEach(function(otherRow) {
        if (otherRow !== row && otherRow.classList.contains('swiped')) {
          otherRow.classList.remove('swiped');
        }
      });
    });

    row.addEventListener('touchmove', function(e) {
      if (!isDragging) return;
      
      // If moved significantly before long press, cancel long press
      currentX = e.touches[0].clientX;
      var diffX = Math.abs(startX - currentX);
      if (diffX > 10 && !isLongPress) {
        clearTimeout(longPressTimer);
        return;
      }
      
      // Only allow swipe after long press
      if (!isLongPress) return;
      
      currentX = e.touches[0].clientX;
      var diff = startX - currentX;
      
      // Only allow left swipe
      if (diff > 0) {
        var swipeContent = row.querySelector('.swipe-content');
        if (swipeContent) {
          var translateX = Math.min(diff, 80);
          swipeContent.style.transform = 'translateX(-' + translateX + 'px)';
          swipeContent.style.transition = 'none';
        }
      }
    });

    row.addEventListener('touchend', function(e) {
      // Clear long press timer
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      
      if (!isDragging) return;
      isDragging = false;
      
      // If not long press, just reset
      if (!isLongPress) {
        var swipeContent = row.querySelector('.swipe-content');
        if (swipeContent) {
          swipeContent.style.transition = 'transform 0.3s ease';
          swipeContent.style.transform = 'translateX(0)';
        }
        return;
      }
      
      var diff = startX - currentX;
      var swipeContent = row.querySelector('.swipe-content');
      if (swipeContent) {
        swipeContent.style.transition = 'transform 0.3s ease';
        
        if (diff > 40) {
          // Swipe open
          row.classList.add('swiped');
          swipeContent.style.transform = 'translateX(-80px)';
          isOpened = true;
        } else {
          // Swipe close
          row.classList.remove('swiped');
          swipeContent.style.transform = 'translateX(0)';
          isOpened = false;
        }
      }
    });

    // Click to close when swiped
    row.addEventListener('click', function(e) {
      if (row.classList.contains('swiped') && !e.target.closest('.delete-button')) {
        row.classList.remove('swiped');
        var swipeContent = row.querySelector('.swipe-content');
        if (swipeContent) {
          swipeContent.style.transform = 'translateX(0)';
        }
        e.preventDefault();
        e.stopPropagation();
      }
    });
  });
}

function bindDatePickerEvents() {
  // Toggle balance visibility
  var toggleBtn = document.getElementById('toggle-balance-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      hideBalance = !hideBalance;
      localStorage.setItem('hideBalance', hideBalance ? 'true' : 'false');
      refreshView();
    });
  }

  // Date filter button click -> toggle calendar
  var dateBtn = document.getElementById('date-filter-btn');
  if (dateBtn) {
    dateBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      calendarVisible = !calendarVisible;
      if (calendarVisible) {
        var d = new Date(currentDate + 'T00:00:00');
        calendarMonth = d.getMonth();
        calendarYear = d.getFullYear();
      }
      refreshView();
    });
  }

  // Bind calendar popup events
  if (calendarVisible) {
    bindCalendarClickEvents();
  }
}

function renderCalendar() {
  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  var weekdayHtml = weekdays.map(function(w) {
    return '<div class="calendar-weekday">' + w + '</div>';
  }).join('');

  var firstDay = new Date(calendarYear, calendarMonth, 1);
  var lastDay = new Date(calendarYear, calendarMonth + 1, 0);
  var startWeekday = firstDay.getDay();
  var daysInMonth = lastDay.getDate();

  var today = getToday();

  var daysHtml = '';

  // Previous month days
  var prevMonthLast = new Date(calendarYear, calendarMonth, 0).getDate();
  for (var i = startWeekday - 1; i >= 0; i--) {
    daysHtml += '<div class="calendar-day other-month">' + (prevMonthLast - i) + '</div>';
  }

  // Current month days
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = calendarYear + '-' + String(calendarMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var isToday = dateStr === today;
    var isSelected = dateStr === currentDate;
    var classes = 'calendar-day';
    if (isToday) classes += ' today';
    if (isSelected) classes += ' selected';
    daysHtml += '<div class="' + classes + '" data-year="' + calendarYear + '" data-month="' + calendarMonth + '" data-day="' + d + '">' + d + '</div>';
  }

  // Next month days to fill grid
  var totalCells = startWeekday + daysInMonth;
  var remaining = (7 - (totalCells % 7)) % 7;
  for (var j = 1; j <= remaining; j++) {
    daysHtml += '<div class="calendar-day other-month">' + j + '</div>';
  }

  console.log('Calendar render:', calendarYear, calendarMonth, 'days:', daysInMonth, 'startWeekday:', startWeekday, 'total cells:', totalCells + remaining);

  return '' +
    '<div class="calendar-header">' +
      '<button id="cal-prev" class="calendar-nav-btn">‹</button>' +
      '<div class="calendar-header-title">' + calendarYear + '年' + (calendarMonth + 1) + '月</div>' +
      '<button id="cal-next" class="calendar-nav-btn">›</button>' +
    '</div>' +
    '<div class="calendar-weekdays">' + weekdayHtml + '</div>' +
    '<div class="calendar-days">' + daysHtml + '</div>' +
    '<div id="cal-today" class="calendar-today-btn">回到今天</div>';
}

function renderCalendarPopup() {
  var popup = document.getElementById('calendar-popup');
  if (popup) {
    popup.innerHTML = renderCalendar();
    bindCalendarClickEvents();
  }
}

function bindCalendarClickEvents() {
  // Calendar day click
  var calendarDays = document.querySelectorAll('.calendar-day:not(.other-month)');
  calendarDays.forEach(function(day) {
    day.addEventListener('click', function() {
      var year = parseInt(day.dataset.year);
      var month = parseInt(day.dataset.month);
      var dayNum = parseInt(day.dataset.day);
      var selectedDate = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(dayNum).padStart(2, '0');
      currentDate = selectedDate;
      calendarVisible = false;
      refreshView();
    });
  });

  // Calendar navigation
  var prevMonthBtn = document.getElementById('cal-prev');
  var nextMonthBtn = document.getElementById('cal-next');
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      calendarMonth--;
      if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
      }
      renderCalendarPopup();
    });
  }
  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      calendarMonth++;
      if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
      }
      renderCalendarPopup();
    });
  }

  // Go to today
  var todayBtn = document.getElementById('cal-today');
  if (todayBtn) {
    todayBtn.addEventListener('click', function() {
      var today = getToday();
      currentDate = today;
      calendarVisible = false;
      refreshView();
    });
  }
}

function renderInstallBanner() {
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (isStandalone || localStorage.getItem('installBannerDismissed')) {
    return '';
  }
  return '' +
    '<div class="install-banner" id="install-banner">' +
      '<div class="install-banner-text">点击 Safari 分享按钮 → 「添加到主屏幕」可获得更好体验</div>' +
      '<button class="install-banner-close" id="dismiss-banner">×</button>' +
    '</div>';
}

function bindInstallBanner(container) {
  var dismissBtn = container.querySelector('#dismiss-banner');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', function() {
      localStorage.setItem('installBannerDismissed', '1');
      var banner = document.getElementById('install-banner');
      if (banner) {
        banner.remove();
      }
    });
  }
}

function showAddAccountModal() {
  // Build account type options - include all types
  var typeOptionsHtml = ACCOUNT_TYPES.map(function(type) {
    return '<option value="' + type.type + '">' + type.label + '</option>';
  }).join('');

  var content = document.createElement('div');
  content.innerHTML = '' +
    '<div class="modal-header">' +
      '<div class="modal-title">添加账户</div>' +
    '</div>' +
    '<div style="padding: 20px;">' +
      '<div style="margin-bottom: 16px;">' +
        '<label style="display: block; margin-bottom: 8px; font-size: 14px; color: var(--color-text-secondary);">账户类型</label>' +
        '<select id="modal-account-type" class="form-select" style="width: 100%; padding: 10px; border: 1px solid var(--color-separator); border-radius: 8px; font-size: 14px;">' +
          typeOptionsHtml +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom: 16px;">' +
        '<label style="display: block; margin-bottom: 8px; font-size: 14px; color: var(--color-text-secondary);">账户名称</label>' +
        '<input type="text" id="modal-account-name" class="form-input" placeholder="如：工商银行" style="width: 100%; padding: 10px; border: 1px solid var(--color-separator); border-radius: 8px; font-size: 14px;">' +
      '</div>' +
      '<div style="margin-bottom: 16px;">' +
        '<label style="display: block; margin-bottom: 8px; font-size: 14px; color: var(--color-text-secondary);">初始余额（可选）</label>' +
        '<input type="number" id="modal-account-balance" inputmode="decimal" step="0.01" class="form-input" placeholder="0.00" style="width: 100%; padding: 10px; border: 1px solid var(--color-separator); border-radius: 8px; font-size: 14px; text-align: right;">' +
      '</div>' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="modal-btn modal-btn-cancel" id="modal-cancel">取消</button>' +
      '<button class="modal-btn modal-btn-primary" id="modal-confirm">添加</button>' +
    '</div>';

  var overlay = document.getElementById('modal-overlay');
  var modalContent = document.getElementById('modal-content');
  modalContent.innerHTML = content.innerHTML;
  overlay.classList.remove('hidden');
  requestAnimationFrame(function() { overlay.classList.add('show'); });

  var close = function() {
    overlay.classList.remove('show');
    setTimeout(function() { overlay.classList.add('hidden'); }, 200);
  };

  document.getElementById('modal-cancel').onclick = close;
  
  document.getElementById('modal-confirm').onclick = async function() {
    var type = document.getElementById('modal-account-type').value;
    var name = document.getElementById('modal-account-name').value.trim();
    var balanceStr = document.getElementById('modal-account-balance').value.trim();

    if (!name) {
      showToast('请输入账户名称');
      return;
    }

    // Get account type info for color
    var typeInfo = ACCOUNT_TYPES.find(function(t) { return t.type === type; });
    var color = typeInfo ? typeInfo.color : '#007AFF';

    try {
      // Add account
      var accountId = await addAccount({
        name: name,
        type: type,
        color: color
      });

      showToast('账户已添加');

      // If balance is provided, create initial record
      if (balanceStr) {
        var cents = parseCurrencyInput(balanceStr);
        if (cents !== null && cents > 0) {
          await upsertRecord(accountId, getToday(), cents);
          showToast('初始余额已记录');
        }
      }

      close();
      setTimeout(refreshView, 300);
    } catch (error) {
      console.error('Failed to add account:', error);
      // Show specific error message for duplicate accounts
      if (error.message && error.message.includes('同类型账户已存在')) {
        showToast(error.message);
      } else {
        showToast('添加账户失败');
      }
    }
  };

  overlay.onclick = function(e) {
    if (e.target === overlay) close();
  };

  // Focus on name input
  setTimeout(function() {
    document.getElementById('modal-account-name').focus();
  }, 300);
}

async function handleDeleteAccount(accountId) {
  showModal({
    title: '删除账户',
    message: '确定要删除这个账户吗？此操作不可恢复。',
    confirmText: '删除',
    cancelText: '取消',
    danger: true,
    onConfirm: async function() {
      try {
        await deleteAccountPermanently(accountId);
        showToast('账户已删除');
        setTimeout(refreshView, 300);
      } catch (error) {
        console.error('Failed to delete account:', error);
        showToast('删除账户失败');
      }
    }
  });
}

export function unmount() {
  eventBound = false;
}

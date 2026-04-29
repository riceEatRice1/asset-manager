import { getAccount, getRecordHistory, getLatestBalance, getPreviousBalance, upsertRecord, getRecordsForDate, updateAccount } from '../db.js';
import { formatCurrency, formatChange, formatDateShort, getToday, addDays, getAccountIconHtml, centsToInputValue, parseCurrencyInput } from '../utils/format.js';
import { goBack } from '../router.js';
import { showToast, showModal } from './components.js';

let chartInstance = null;
let isSaving = false;

export function title() {
  return '账户详情';
}

export async function render(params) {
  const account = await getAccount(params.id);
  if (!account) {
    return `<div class="empty-state"><div class="empty-state-text">账户不存在</div></div>`;
  }

  const today = getToday();
  const startDate = addDays(today, -89);
  const records = await getRecordHistory(account.id, startDate, today);
  const latestBalance = await getLatestBalance(account.id, today);
  const prevBalance = records.length >= 2
    ? records[records.length - 2]?.balance
    : await getPreviousBalance(account.id, today);
  const change = (latestBalance !== null && prevBalance !== null) ? latestBalance - prevBalance : 0;

  // Get today's record for the input
  const todayRecords = await getRecordsForDate(today);
  const todayRecord = todayRecords.find(r => r.accountId === account.id);
  const todayValue = todayRecord ? centsToInputValue(todayRecord.balance) : '';
  const todayPlaceholder = latestBalance !== null ? centsToInputValue(latestBalance) : '0.00';

  return `
    <div class="detail-header">
      <div class="detail-icon" id="detail-icon" style="color: ${account.color};">⏳</div>
      <div class="detail-name" id="detail-name" style="cursor: pointer;" title="点击修改账户名称">${account.name}</div>
      <div class="detail-balance">${formatCurrency(latestBalance || 0)}</div>
      <div class="detail-change ${change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-secondary'}">
        ${change !== 0 ? `较上次 ${formatChange(change)}` : '暂无变化'}
      </div>
    </div>

    <div class="card">
      <div class="card-title">调整余额</div>
      <div style="display: flex; align-items: center; gap: 12px; margin-top: 12px;">
        <input type="number" inputmode="decimal" step="0.01"
          id="balance-adjustment-input"
          class="form-input"
          value=""
          placeholder="请输入余额"
          style="flex: 1; text-align: right; font-size: var(--font-size-lg); font-weight: 600;">
        <button class="btn btn-primary" id="save-balance-btn" style="width: auto; padding: 0 24px;">
          保存
        </button>
      </div>
      <div class="list-item-subtitle" style="text-align: right; margin-top: 8px;">
        记录日期: ${formatDateShort(today)}
      </div>
    </div>

    <div class="chart-container">
      <div class="chart-title">近 90 天余额走势</div>
      <div class="chart-wrapper">
        <canvas id="detail-chart"></canvas>
      </div>
    </div>

    <div class="section-header">历史记录</div>
    <div class="list-group">
      ${records.length === 0 ? `
        <div class="list-item">
          <div class="list-item-content">
            <div class="list-item-title text-secondary">暂无记录</div>
          </div>
        </div>
      ` : records.slice().reverse().map((r, i, arr) => {
        const prev = arr[i + 1];
        const delta = prev ? r.balance - prev.balance : 0;
        return `
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-title">${formatDateShort(r.date)}</div>
              ${r.note ? `<div class="list-item-subtitle">${r.note}</div>` : ''}
            </div>
            <div class="list-item-right">
              <div class="list-item-amount">${formatCurrency(r.balance)}</div>
              ${delta !== 0 ? `
                <div class="list-item-change ${delta > 0 ? 'text-success' : 'text-danger'}">
                  ${formatChange(delta)}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="height: 20px;"></div>
  `;
}

export async function mount(params) {
  const account = await getAccount(params.id);
  if (!account) return;

  // Load icon asynchronously
  const iconContainer = document.getElementById('detail-icon');
  if (iconContainer) {
    const iconHtml = await getAccountIconHtml(account);
    iconContainer.innerHTML = iconHtml;
  }

  // Update nav title
  document.getElementById('nav-title').textContent = account.name;

  // Bind name edit
  const nameElement = document.getElementById('detail-name');
  if (nameElement) {
    nameElement.addEventListener('click', () => {
      // Create custom modal for name editing
      const content = document.createElement('div');
      content.innerHTML = `
        <div class="modal-header">
          <div class="modal-title">修改账户名称</div>
        </div>
        <div style="padding: 20px;">
          <input type="text" id="edit-account-name" class="form-input" value="${account.name}" placeholder="请输入账户名称" style="width: 100%; padding: 10px; border: 1px solid var(--color-separator); border-radius: 8px; font-size: 14px;">
        </div>
        <div class="modal-actions">
          <button class="modal-btn modal-btn-cancel" id="modal-cancel">取消</button>
          <button class="modal-btn modal-btn-primary" id="modal-confirm">保存</button>
        </div>
      `;

      const overlay = document.getElementById('modal-overlay');
      const modalContent = document.getElementById('modal-content');
      modalContent.innerHTML = content.innerHTML;
      overlay.classList.remove('hidden');
      requestAnimationFrame(() => overlay.classList.add('show'));

      const close = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.classList.add('hidden'), 200);
      };

      document.getElementById('modal-cancel').onclick = close;
      
      document.getElementById('modal-confirm').onclick = async () => {
        const newName = document.getElementById('edit-account-name').value.trim();
        if (!newName) {
          showToast('账户名称不能为空');
          return;
        }
        if (newName === account.name) {
          close();
          return;
        }

        try {
          await updateAccount(account.id, { name: newName });
          showToast('账户名称已修改');
          
          // Update UI
          nameElement.textContent = newName;
          document.getElementById('nav-title').textContent = newName;
          close();
        } catch (error) {
          console.error('Failed to update account name:', error);
          // Show specific error message for duplicate accounts
          if (error.message && error.message.includes('同类型账户已存在')) {
            showToast(error.message);
          } else {
            showToast('修改失败，请重试');
          }
        }
      };

      overlay.onclick = (e) => {
        if (e.target === overlay) close();
      };

      // Focus on input
      setTimeout(() => {
        const input = document.getElementById('edit-account-name');
        if (input) {
          input.focus();
          input.select();
        }
      }, 300);
    });
  }

  // Bind save button
  const saveBtn = document.getElementById('save-balance-btn');
  const input = document.getElementById('balance-adjustment-input');

  if (saveBtn && input) {
    const originalValue = input.value;

    saveBtn.addEventListener('click', async () => {
      if (isSaving) return;
      
      const value = input.value.trim();
      if (!value) {
        showToast('请输入余额');
        return;
      }

      const cents = parseCurrencyInput(value);
      if (cents === null) {
        showToast('余额格式不正确');
        return;
      }

      // Only save if value changed
      if (value === originalValue) {
        showToast('余额未变化');
        return;
      }

      isSaving = true;
      saveBtn.textContent = '保存中...';
      saveBtn.disabled = true;

      try {
        await upsertRecord(account.id, getToday(), cents);
        showToast('余额已保存');
        
        // Refresh the view
        const today = getToday();
        const startDate = addDays(today, -89);
        const records = await getRecordHistory(account.id, startDate, today);
        const latestBalance = await getLatestBalance(account.id, today);
        const prevBalance = await getPreviousBalance(account.id, today);
        const change = (latestBalance !== null && prevBalance !== null) ? latestBalance - prevBalance : 0;

        // Update balance display
        const balanceEl = document.querySelector('.detail-balance');
        if (balanceEl) {
          balanceEl.textContent = formatCurrency(latestBalance || 0);
        }

        // Update change display
        const changeEl = document.querySelector('.detail-change');
        if (changeEl) {
          changeEl.textContent = change !== 0 ? `较上次 ${formatChange(change)}` : '暂无变化';
          changeEl.className = `detail-change ${change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-secondary'}`;
        }

        // Update input placeholder
        input.placeholder = latestBalance !== null ? centsToInputValue(latestBalance) : '0.00';
        input.dataset.original = centsToInputValue(cents);

        // Refresh chart
        if (records.length >= 2 && chartInstance) {
          chartInstance.data.labels = records.map(r => formatDateShort(r.date));
          chartInstance.data.datasets[0].data = records.map(r => r.balance / 100);
          chartInstance.update();
        }

        // Refresh history list
        const historyContainer = document.querySelector('.list-group');
        if (historyContainer && records.length > 0) {
          historyContainer.innerHTML = records.slice().reverse().map((r, i, arr) => {
            const prev = arr[i + 1];
            const delta = prev ? r.balance - prev.balance : 0;
            return `
              <div class="list-item">
                <div class="list-item-content">
                  <div class="list-item-title">${formatDateShort(r.date)}</div>
                  ${r.note ? `<div class="list-item-subtitle">${r.note}</div>` : ''}
                </div>
                <div class="list-item-right">
                  <div class="list-item-amount">${formatCurrency(r.balance)}</div>
                  ${delta !== 0 ? `
                    <div class="list-item-change ${delta > 0 ? 'text-success' : 'text-danger'}">
                      ${formatChange(delta)}
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('');
        }

      } catch (error) {
        console.error('Failed to save balance:', error);
        showToast('保存失败，请重试');
      } finally {
        isSaving = false;
        saveBtn.textContent = '保存';
        saveBtn.disabled = false;
      }
    });

    // Format input on blur
    input.addEventListener('blur', () => {
      const cents = parseCurrencyInput(input.value);
      if (cents !== null) {
        input.value = centsToInputValue(cents);
      }
    });
  }

  const today = getToday();
  const startDate = addDays(today, -89);
  const records = await getRecordHistory(account.id, startDate, today);

  if (records.length < 2) return;

  const canvas = document.getElementById('detail-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: records.map(r => formatDateShort(r.date)),
      datasets: [{
        data: records.map(r => r.balance / 100),
        borderColor: account.color || '#007AFF',
        backgroundColor: (account.color || '#007AFF') + '20',
        fill: true,
        tension: 0.3,
        pointRadius: records.length > 30 ? 0 : 3,
        pointHoverRadius: 5,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `¥${ctx.parsed.y.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        x: {
          display: true,
          ticks: {
            maxTicksLimit: 5,
            font: { size: 10 },
            color: '#8E8E93'
          },
          grid: { display: false }
        },
        y: {
          display: true,
          ticks: {
            callback: (v) => `¥${(v / 1).toLocaleString('zh-CN')}`,
            font: { size: 10 },
            color: '#8E8E93',
            maxTicksLimit: 4
          },
          grid: { color: '#F2F2F7' }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  });
}

export function unmount() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

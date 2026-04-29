import { getDailyTotals, getMonthlyAggregation, getLatestRecordPerAccount, getFirstRecordDate, getAllAccounts, getAllActiveAccounts, getLatestBalance, archiveAccount, restoreAccount, deleteAccountPermanently, getAllRecords, getRecordCount, addAccount, upsertRecord } from '../db.js';
import { formatCurrency, formatChange, formatCurrencyShort, getToday, getRangeStartDate, addDays, formatDateShort, ACCOUNT_TYPES, getAccountIconHtml } from '../utils/format.js';
import { createNetWorthLineConfig, createSurplusBarConfig, createCompositionDonutConfig } from '../utils/charts.js';
import { renderEmptyState, showToast, showModal } from './components.js';
import { navigate } from '../router.js';

let charts = [];
let currentRange = '30d';

export const title = '统计';

export async function render() {
  return '<div id="statistics-view"></div>';
}

export async function mount() {
  currentRange = '30d';
  await refreshView();
}

async function refreshView() {
  const container = document.getElementById('statistics-view');
  const firstDate = await getFirstRecordDate();
  const accounts = await getAllAccounts();
  const recordCount = await getRecordCount();

  const activeAccounts = accounts.filter(a => !a.isArchived);
  const archivedAccounts = accounts.filter(a => a.isArchived);

  // If no records, show empty state but still include data management
  if (!firstDate) {
    container.innerHTML = `
      ${renderEmptyState('📈', '还没有记录数据\n请先添加数据或导入CSV/JSON文件', '')}

      <div class="section-header">数据管理</div>
      <div class="list-group">
        <div class="list-item" id="export-csv-btn">
          <div class="list-item-content">
            <div class="list-item-title">导出数据 (CSV)</div>
            <div class="list-item-subtitle">共 ${recordCount} 条记录</div>
          </div>
          <span class="list-item-chevron">›</span>
        </div>
        <div class="list-item" id="import-csv-btn">
          <div class="list-item-content">
            <div class="list-item-title">导入数据 (CSV)</div>
            <div class="list-item-subtitle">从导出的 CSV 文件恢复</div>
          </div>
          <span class="list-item-chevron">›</span>
        </div>
      </div>

      <input type="file" id="import-file-input" accept=".csv" style="display:none;">
      
      <div style="text-align: center; padding: 20px 0 40px; color: var(--color-text-secondary); font-size: 12px;">
        资产管家 v2.0.0 · 数据完全存储在本地，不会上传到任何服务器
      </div>
    `;

    bindEvents();
    return;
  }

  container.innerHTML = `
    <div class="segment-control" id="range-selector">
      <button class="segment-item ${currentRange === '7d' ? 'active' : ''}" data-range="7d">7天</button>
      <button class="segment-item ${currentRange === '30d' ? 'active' : ''}" data-range="30d">30天</button>
      <button class="segment-item ${currentRange === '1y' ? 'active' : ''}" data-range="1y">1年</button>
      <button class="segment-item ${currentRange === 'all' ? 'active' : ''}" data-range="all">全部</button>
    </div>

    <div id="stats-summary"></div>

    <div class="chart-container">
      <div class="chart-title">总资产走势</div>
      <div class="chart-wrapper">
        <canvas id="trend-chart"></canvas>
      </div>
    </div>

    <div class="chart-container" id="surplus-section" style="display:none;">
      <div class="chart-title">月度盈余</div>
      <div class="chart-wrapper">
        <canvas id="surplus-chart"></canvas>
      </div>
    </div>

    <div class="chart-container">
      <div class="chart-title">资产构成</div>
      <div class="chart-wrapper" style="height: 260px;">
        <canvas id="composition-chart"></canvas>
      </div>
    </div>

    <div class="section-header">数据管理</div>
    <div class="list-group">
      <div class="list-item" id="export-csv-btn">
        <div class="list-item-content">
          <div class="list-item-title">导出数据 (CSV)</div>
          <div class="list-item-subtitle">共 ${recordCount} 条记录</div>
        </div>
        <span class="list-item-chevron">›</span>
      </div>
      <div class="list-item" id="import-csv-btn">
        <div class="list-item-content">
          <div class="list-item-title">导入数据 (CSV)</div>
          <div class="list-item-subtitle">从导出的 CSV 文件恢复</div>
        </div>
        <span class="list-item-chevron">›</span>
      </div>
    </div>

    <input type="file" id="import-file-input" accept=".csv" style="display:none;">
    
    <div style="text-align: center; padding: 20px 0 40px; color: var(--color-text-secondary); font-size: 12px;">
      资产管家 v2.0.0 · 数据完全存储在本地，不会上传到任何服务器
    </div>
  `;

  // Load account icons asynchronously
  for (let i = 0; i < activeAccounts.length; i++) {
    const account = activeAccounts[i];
    const typeInfo = ACCOUNT_TYPES.find(t => t.type === account.type) || ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1];
    
    const iconContainer = document.getElementById(`acc-icon-${i}`);
    const typeLabel = document.getElementById(`acc-type-${i}`);
    
    if (iconContainer) {
      const iconHtml = await getAccountIconHtml(account);
      iconContainer.innerHTML = `<span>${iconHtml}</span>`;
    }
    if (typeLabel) {
      typeLabel.textContent = typeInfo.label;
    }
  }

  for (let i = 0; i < archivedAccounts.length; i++) {
    const account = archivedAccounts[i];
    const iconContainer = document.getElementById(`arch-icon-${i}`);
    
    if (iconContainer) {
      const iconHtml = await getAccountIconHtml(account);
      iconContainer.innerHTML = `<span>${iconHtml}</span>`;
    }
  }

  bindEvents();
  await renderCharts(firstDate);
}

async function renderCharts(firstDate) {
  const today = getToday();
  let startDate = getRangeStartDate(currentRange);

  // Clamp to first record date
  if (startDate < firstDate) startDate = firstDate;

  // 1. Net worth trend
  let trendLabels = [];
  let trendData = [];
  let dailyTotals = [];

  // For 1y range, show monthly data
  if (currentRange === '1y') {
    const year = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    console.log('1年视图 - 当前年份:', year, '当前月份:', currentMonth + 1);
    const monthlyData = [];
    
    // Show from January to current month
    for (let m = 0; m <= currentMonth; m++) {
      const monthStart = `${year}-${String(m + 1).padStart(2, '0')}-01`;
      const nextMonth = m === 11
        ? `${year + 1}-01-01`
        : `${year}-${String(m + 2).padStart(2, '0')}-01`;
      const lastDay = new Date(new Date(nextMonth).getTime() - 86400000)
        .toISOString().slice(0, 10);

      const accounts = await getAllActiveAccounts();
      let monthTotal = 0;

      for (const account of accounts) {
        const endBal = await getLatestBalance(account.id, lastDay);
        monthTotal += endBal || 0;
      }

      console.log(`${m + 1}月 - 最后日期:`, lastDay, '总额:', monthTotal);
      monthlyData.push({
        date: lastDay,
        total: monthTotal,
        label: `${m + 1}月`
      });
    }

    console.log('月度数据:', monthlyData);
    trendLabels = monthlyData.map(d => d.label);
    trendData = monthlyData.map(d => d.total / 100);
    dailyTotals = monthlyData.map(d => ({ date: d.date, total: d.total }));
  } else {
    // For other ranges, show daily data
    dailyTotals = await getDailyTotals(startDate, today);
    
    // Sample data if too many points
    const sampled = sampleData(dailyTotals, 100);
    trendLabels = sampled.map(d => formatDateShort(d.date));
    trendData = sampled.map(d => d.total / 100);
  }

  if (trendData.length > 0) {
    const trendCanvas = document.getElementById('trend-chart');
    if (trendCanvas && typeof Chart !== 'undefined') {
      const chart = new Chart(trendCanvas, createNetWorthLineConfig(trendLabels, trendData));
      charts.push(chart);
    }
  }

  // 2. Summary stats
  renderSummary(dailyTotals);

  // 3. Monthly surplus (only for 1y and all)
  if (currentRange === '1y' || currentRange === 'all') {
    document.getElementById('surplus-section').style.display = '';
    const year = new Date().getFullYear();
    const monthly = await getMonthlyAggregation(year);
    const surplusLabels = monthly.map(m => m.label);
    const surplusData = monthly.map(m => m.surplus / 100);

    const surplusCanvas = document.getElementById('surplus-chart');
    if (surplusCanvas) {
      const chart = new Chart(surplusCanvas, createSurplusBarConfig(surplusLabels, surplusData));
      charts.push(chart);
    }
  }

  // 4. Asset composition
  const accountData = await getLatestRecordPerAccount();
  const activeWithBalance = accountData.filter(d => d.balance && d.balance > 0);

  if (activeWithBalance.length > 0) {
    const compLabels = activeWithBalance.map(d => d.account.name);
    const compData = activeWithBalance.map(d => d.balance / 100);
    const compColors = activeWithBalance.map(d => d.account.color || '#8E8E93');

    const compCanvas = document.getElementById('composition-chart');
    if (compCanvas) {
      const chart = new Chart(compCanvas, createCompositionDonutConfig(compLabels, compData, compColors));
      charts.push(chart);
    }
  }
}

function renderSummary(dailyTotals) {
  const summaryEl = document.getElementById('stats-summary');
  if (!summaryEl || dailyTotals.length === 0) return;

  const first = dailyTotals[0].total;
  const last = dailyTotals[dailyTotals.length - 1].total;
  const totalChange = last - first;

  const days = dailyTotals.length;
  const avgChange = days > 1 ? totalChange / (days - 1) : 0;

  let maxTotal = -Infinity, maxDate = '';
  let minTotal = Infinity, minDate = '';
  for (const d of dailyTotals) {
    if (d.total > maxTotal) { maxTotal = d.total; maxDate = d.date; }
    if (d.total < minTotal) { minTotal = d.total; minDate = d.date; }
  }

  summaryEl.innerHTML = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-card-label">期间总变化</div>
        <div class="stat-card-value ${totalChange >= 0 ? 'text-success' : 'text-danger'}">
          ${formatChange(totalChange)}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">日均变化</div>
        <div class="stat-card-value ${avgChange >= 0 ? 'text-success' : 'text-danger'}">
          ${formatChange(Math.round(avgChange))}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">最高净值</div>
        <div class="stat-card-value">${formatCurrencyShort(maxTotal)}</div>
        <div class="stat-card-sub">${formatDateShort(maxDate)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">最低净值</div>
        <div class="stat-card-value">${formatCurrencyShort(minTotal)}</div>
        <div class="stat-card-sub">${formatDateShort(minDate)}</div>
      </div>
    </div>
  `;
}

function bindEvents() {
  // Bind range selector
  document.getElementById('range-selector')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.segment-item');
    if (!btn) return;
    currentRange = btn.dataset.range;
    destroyCharts();
    refreshView();
  });

  // Export CSV
  document.getElementById('export-csv-btn')?.addEventListener('click', exportCSV);

  // Import CSV
  document.getElementById('import-csv-btn')?.addEventListener('click', () => {
    const input = document.getElementById('import-file-input');
    input.value = '';
    input.click();
  });

  document.getElementById('import-file-input')?.addEventListener('change', importCSV);
}

async function exportCSV() {
  const accounts = await getAllAccounts();
  const records = await getAllRecords();
  const accountMap = {};
  accounts.forEach(a => { accountMap[a.id] = a; });

  let csv = '日期,账户名称,账户类型,余额\n';
  for (const r of records) {
    const acc = accountMap[r.accountId];
    if (!acc) continue;
    const typeInfo = ACCOUNT_TYPES.find(t => t.type === acc.type);
    const yuan = (r.balance / 100).toFixed(2);
    csv += `${r.date},${acc.name},${typeInfo ? typeInfo.label : acc.type},¥${yuan}\n`;
  }

  downloadFile(csv, `资产管家_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
  showToast('CSV 已导出');
}

async function importCSV(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    // Strip BOM character if present
    const cleanText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const lines = cleanText.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      showToast('CSV 文件为空或格式不正确');
      e.target.value = '';
      return;
    }

    // Parse header to validate
    const header = lines[0].trim();
    if (header.indexOf('日期') === -1 || header.indexOf('账户名称') === -1 || header.indexOf('余额') === -1) {
      showToast('CSV 格式不正确，请使用导出的 CSV 文件');
      e.target.value = '';
      return;
    }

    // Count records in CSV
    const csvRecordCount = lines.length - 1;
    const existingRecordCount = await getRecordCount();

    // Show confirmation dialog
    showModal({
      title: '导入数据',
      message: `CSV 文件包含 ${csvRecordCount} 条记录。\n\n当前数据库有 ${existingRecordCount} 条记录。\n\n导入时，相同账户和日期的记录会被覆盖，新记录会被添加。`,
      confirmText: '导入',
      cancelText: '取消',
      onConfirm: async () => {
        await processCSVImport(lines);
        e.target.value = ''; // Clear after successful import
      }
    });
  } catch (err) {
    showToast('导入失败：' + (err.message || err));
    e.target.value = '';
  }
}

async function processCSVImport(lines) {
  try {
    // Build a reverse map from label -> type
    const labelToType = {};
    ACCOUNT_TYPES.forEach(t => {
      labelToType[t.label] = t.type;
    });

    // Get all existing accounts
    let allAccounts = await getAllAccounts();

    // Process each row
    let importCount = 0;
    let updateCount = 0;
    let accountCount = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].trim();
      if (!row) continue;

      // Split by comma, handling values that may contain commas
      const parts = parseCSVLine(row);
      if (parts.length < 4) {
        errors.push('第 ' + (i + 1) + ' 行格式不正确');
        continue;
      }

      const date = parts[0].trim();
      const accountName = parts[1].trim();
      const typeLabel = parts[2].trim();
      const balanceStr = parts[3].trim();

      // Parse balance: remove ¥ or ￥ (both full-width and half-width) and convert to cents
      const balanceYuan = parseFloat(balanceStr.replace(/[¥￥]/g, '').replace(/,/g, ''));
      if (isNaN(balanceYuan)) {
        errors.push('第 ' + (i + 1) + ' 行余额格式不正确: ' + balanceStr);
        continue;
      }
      const balanceCents = Math.round(balanceYuan * 100);

      // Map type label to internal type key
      let accountType = labelToType[typeLabel];
      if (!accountType) {
        accountType = 'custom';
      }

      // Find existing account by name, or create new one
      let account = null;
      for (let j = 0; j < allAccounts.length; j++) {
        if (allAccounts[j].name === accountName) {
          account = allAccounts[j];
          break;
        }
      }

      if (!account && accountName) {
        const typeInfo = ACCOUNT_TYPES.find(t => t.type === accountType);
        const accColor = typeInfo ? typeInfo.color : '#007AFF';
        const newId = await addAccount({
          name: accountName,
          type: accountType,
          color: accColor
        });
        account = { id: newId, name: accountName, type: accountType };
        allAccounts.push(account);
        accountCount++;
      }

      if (account && date) {
        await upsertRecord(account.id, date, balanceCents, '');
        importCount++;
      }
    }

    let msg = '导入完成：' + importCount + ' 条记录';
    if (accountCount > 0) msg += '，新建 ' + accountCount + ' 个账户';
    if (errors.length > 0) msg += '，' + errors.length + ' 条错误';
    showToast(msg);

    if (errors.length > 0) {
      console.log('CSV 导入错误：', errors);
    }

    await refreshView();
  } catch (err) {
    showToast('导入失败：' + (err.message || err));
  }
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function downloadFile(content, filename, mimeType) {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Downsample data to maxPoints if there are too many entries
function sampleData(data, maxPoints) {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  const result = [];
  for (let i = 0; i < data.length; i += step) {
    result.push(data[i]);
  }
  // Always include the last point
  if (result[result.length - 1] !== data[data.length - 1]) {
    result.push(data[data.length - 1]);
  }
  return result;
}

function destroyCharts() {
  charts.forEach(c => c.destroy());
  charts = [];
}

export function unmount() {
  destroyCharts();
}

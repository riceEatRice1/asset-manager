import { getDailyTotals, getMonthlyAggregation, getLatestRecordPerAccount, getFirstRecordDate, getAllAccounts, getAllActiveAccounts, getLatestBalance, archiveAccount, restoreAccount, deleteAccountPermanently, getAllRecords, getRecordCount, addAccount, upsertRecord } from '../db.js';
import { formatCurrency, formatChange, formatCurrencyShort, getToday, getRangeStartDate, addDays, formatDateShort, ACCOUNT_TYPES, getAccountIconHtml } from '../utils/format.js';
import { createNetWorthLineConfig, createSurplusBarConfig, createCompositionDonutConfig } from '../utils/charts.js';
import { renderEmptyState, showToast, showModal } from './components.js';
import { navigate } from '../router.js';

let charts = [];
let currentRange = '30d';
let surplusYearFilter = String(new Date().getFullYear()); // Default to current year
let surplusAllData = []; // Store all surplus data for filtering

export const title = '统计';

export async function render() {
  return '<div id="statistics-view"></div>';
}

export async function mount() {
  currentRange = '30d';
  surplusYearFilter = 'all'; // Reset to 'all' when entering statistics page
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
        <div class="list-item" id="clear-cache-btn">
          <div class="list-item-content">
            <div class="list-item-title">清除缓存</div>
            <div class="list-item-subtitle">清除 Service Worker 缓存并重新加载</div>
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
      <button class="segment-item ${currentRange === '30d' ? 'active' : ''}" data-range="30d">近30天</button>
      <button class="segment-item ${currentRange === '1y' ? 'active' : ''}" data-range="1y">近1年</button>
      <button class="segment-item ${currentRange === 'all' ? 'active' : ''}" data-range="all">全部</button>
    </div>

    <div id="stats-summary"></div>

    <div class="chart-container">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-sm);">
        <div class="chart-title" style="margin: 0;">总资产走势</div>
        <select id="trend-year-filter" class="form-select" style="padding: 6px 12px; border: 1px solid var(--color-separator); border-radius: 6px; font-size: 13px; display: none;">
        </select>
      </div>
      <div class="chart-wrapper">
        <canvas id="trend-chart"></canvas>
      </div>
    </div>

    <div class="chart-container" id="surplus-section" style="display:none;">
      <div class="chart-title" id="surplus-chart-title">月度盈余</div>
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
      <div class="list-item" id="clear-cache-btn">
        <div class="list-item-content">
          <div class="list-item-title">清除缓存</div>
          <div class="list-item-subtitle">清除 Service Worker 缓存并重新加载</div>
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
    const todayDate = new Date();
    const firstRecordDate = new Date(firstDate + 'T00:00:00');
    
    // Start from 12 months ago or first record, whichever is later
    let startYear, startMonth;
    const twelveMonthsAgo = new Date(todayDate.getFullYear(), todayDate.getMonth() - 11, 1);
    if (twelveMonthsAgo > firstRecordDate) {
      startYear = twelveMonthsAgo.getFullYear();
      startMonth = twelveMonthsAgo.getMonth();
    } else {
      startYear = firstRecordDate.getFullYear();
      startMonth = firstRecordDate.getMonth();
    }
    
    const monthlyData = [];
    let currentYear = startYear;
    let currentMonth = startMonth;
    
    while (true) {
      const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const nextMonth = currentMonth === 11
        ? `${currentYear + 1}-01-01`
        : `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`;
      const lastDay = new Date(new Date(nextMonth).getTime() - 86400000)
        .toISOString().slice(0, 10);
      
      // Stop if we've reached current month
      if (monthStart > today) break;
      
      const accounts = await getAllActiveAccounts();
      let monthTotal = 0;
      
      for (const account of accounts) {
        const endBal = await getLatestBalance(account.id, lastDay);
        monthTotal += endBal || 0;
      }
      
      monthlyData.push({
        date: lastDay,
        total: monthTotal,
        year: currentYear,
        month: currentMonth,
        label: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
      });
      
      // Move to next month
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
    }
    
    // Apply year filter if spans years
    const availableYears = [...new Set(monthlyData.map(d => d.year))];
    const spansYears = availableYears.length > 1;
    
    const filteredData = spansYears && surplusYearFilter !== 'all'
      ? monthlyData.filter(d => d.year === parseInt(surplusYearFilter))
      : monthlyData;
    
    const filteredSpansYears = spansYears && surplusYearFilter === 'all';
    
    trendLabels = filteredData.map(d => 
      filteredSpansYears ? d.label : `${d.month + 1}月`
    );
    trendData = filteredData.map(d => d.total / 100);
    dailyTotals = filteredData.map(d => ({ date: d.date, total: d.total }));
  } else if (currentRange === 'all') {
    // For 'all' range, check if data spans multiple years
    const firstRecordYear = parseInt(firstDate.split('-')[0]);
    const currentYear = new Date().getFullYear();
    
    if (currentYear > firstRecordYear) {
      // Data spans multiple years, show yearly data
      const yearlyData = [];
      
      for (let year = firstRecordYear; year <= currentYear; year++) {
        const yearStart = `${year}-01-01`;
        const yearEnd = year === currentYear 
          ? today 
          : `${year}-12-31`;
        
        // Skip if yearEnd is before firstDate
        if (yearEnd < firstDate) continue;
        
        const accounts = await getAllActiveAccounts();
        let yearTotal = 0;
        
        for (const account of accounts) {
          const endBal = await getLatestBalance(account.id, yearEnd);
          yearTotal += endBal || 0;
        }
        
        yearlyData.push({
          date: yearEnd,
          total: yearTotal,
          label: `${year}年`
        });
      }
      
      trendLabels = yearlyData.map(d => d.label);
      trendData = yearlyData.map(d => d.total / 100);
      dailyTotals = yearlyData.map(d => ({ date: d.date, total: d.total }));
    } else {
      // Single year, show monthly data like 1y
      const monthlyData = [];
      const firstMonth = firstDate.split('-')[1] ? parseInt(firstDate.split('-')[1]) - 1 : 0;
      
      for (let m = firstMonth; m <= 11; m++) {
        const monthStart = `${currentYear}-${String(m + 1).padStart(2, '0')}-01`;
        const nextMonth = m === 11
          ? `${currentYear + 1}-01-01`
          : `${currentYear}-${String(m + 2).padStart(2, '0')}-01`;
        const lastDay = new Date(new Date(nextMonth).getTime() - 86400000)
          .toISOString().slice(0, 10);
        
        if (monthStart < firstDate) continue;
        if (lastDay > today) break;

        const accounts = await getAllActiveAccounts();
        let monthTotal = 0;

        for (const account of accounts) {
          const endBal = await getLatestBalance(account.id, lastDay);
          monthTotal += endBal || 0;
        }

        monthlyData.push({
          date: lastDay,
          total: monthTotal,
          label: `${m + 1}月`
        });
      }

      trendLabels = monthlyData.map(d => d.label);
      trendData = monthlyData.map(d => d.total / 100);
      dailyTotals = monthlyData.map(d => ({ date: d.date, total: d.total }));
    }
  } else {
    // For other ranges (30d), show daily data
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

  // 3. Monthly/Yearly surplus (only for 1y and all)
  if (currentRange === '1y' || currentRange === 'all') {
    document.getElementById('surplus-section').style.display = '';
    
    // Calculate monthly surplus starting from first record date
    const surplusData = [];
    const todayDate = new Date();
    const firstRecordDate = new Date(firstDate + 'T00:00:00');
    
    // Start from the month of first record
    let startYear = firstRecordDate.getFullYear();
    let startMonth = firstRecordDate.getMonth(); // 0-11
    
    // For 1y range, start from 12 months ago or first record, whichever is later
    if (currentRange === '1y') {
      const twelveMonthsAgo = new Date(todayDate.getFullYear(), todayDate.getMonth() - 11, 1);
      if (twelveMonthsAgo > firstRecordDate) {
        startYear = twelveMonthsAgo.getFullYear();
        startMonth = twelveMonthsAgo.getMonth();
      }
    }
    
    // Generate data from start month to current month
    let currentYear = startYear;
    let currentMonth = startMonth;
    const availableYears = new Set();
    
    while (true) {
      const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const nextMonth = currentMonth === 11
        ? `${currentYear + 1}-01-01`
        : `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`;
      const lastDay = new Date(new Date(nextMonth).getTime() - 86400000)
        .toISOString().slice(0, 10);
      
      // Stop if we've reached current month
      if (monthStart > today) break;
      
      const accounts = await getAllActiveAccounts();
      let startTotal = 0;
      let endTotal = 0;
      
      for (const account of accounts) {
        const startBal = await getLatestBalance(account.id, monthStart);
        const endBal = await getLatestBalance(account.id, lastDay);
        startTotal += startBal || 0;
        endTotal += endBal || 0;
      }
      
      availableYears.add(currentYear);
      
      surplusData.push({
        year: currentYear,
        month: currentMonth,
        label: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
        surplus: endTotal - startTotal
      });
      
      // Move to next month
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
    }
    
    // Store all data
    surplusAllData = surplusData;
    
    // Check if spans multiple years
    const yearsArray = Array.from(availableYears).sort();
    const spansYears = yearsArray.length > 1;
    
    // Update year filter
    const yearFilter = document.getElementById('trend-year-filter');
    if (yearFilter) {
      if (spansYears) {
        yearFilter.style.display = 'block';
        // Build options with years in descending order
        let optionsHtml = '<option value="all">全部</option>';
        yearsArray.reverse().forEach(year => {
          const selected = surplusYearFilter === String(year) ? 'selected' : '';
          optionsHtml += `<option value="${year}" ${selected}>${year}年</option>`;
        });
        yearFilter.innerHTML = optionsHtml;
      } else {
        yearFilter.style.display = 'none';
      }
    }
    
    // For 'all' range with 'all' years filter and spans years, show yearly surplus
    let surplusLabels = [];
    let surplusValues = [];
    const surplusTitle = document.getElementById('surplus-chart-title');
    
    if (currentRange === 'all' && surplusYearFilter === 'all' && spansYears) {
      // Update title to "年度盈余"
      if (surplusTitle) {
        surplusTitle.textContent = '年度盈余';
      }
      
      // Aggregate by year
      const yearlySurplus = {};
      surplusData.forEach(d => {
        if (!yearlySurplus[d.year]) {
          yearlySurplus[d.year] = 0;
        }
        yearlySurplus[d.year] += d.surplus;
      });
      
      // Sort by year ascending (positive order)
      const sortedYears = Object.keys(yearlySurplus).sort((a, b) => a - b);
      surplusLabels = sortedYears.map(year => `${year}年`);
      surplusValues = sortedYears.map(year => yearlySurplus[year] / 100);
    } else {
      // Update title to "月度盈余"
      if (surplusTitle) {
        surplusTitle.textContent = '月度盈余';
      }
      
      // Show monthly data
      const filteredData = surplusYearFilter === 'all' 
        ? surplusData 
        : surplusData.filter(d => d.year === parseInt(surplusYearFilter));
      
      // Check if filtered data spans years for label format
      const filteredYears = [...new Set(filteredData.map(d => d.year))];
      const filteredSpansYears = filteredYears.length > 1;
      
      surplusLabels = filteredData.map(d => 
        filteredSpansYears ? d.label : `${d.month + 1}月`
      );
      surplusValues = filteredData.map(d => d.surplus / 100);
    }

    const surplusCanvas = document.getElementById('surplus-chart');
    if (surplusCanvas) {
      const chart = new Chart(surplusCanvas, createSurplusBarConfig(surplusLabels, surplusValues));
      charts.push(chart);
    }
  }

  // 4. Asset composition
  // Get the end date based on current range and filter
  let compositionDate = today;
  
  if (currentRange === '1y' && surplusYearFilter !== 'all') {
    // If year filter is applied, use the end of that year or current date
    const filterYear = parseInt(surplusYearFilter);
    const currentYear = new Date().getFullYear();
    compositionDate = filterYear === currentYear ? today : `${filterYear}-12-31`;
  } else if (currentRange === 'all' && surplusYearFilter !== 'all') {
    // For 'all' range with year filter
    const filterYear = parseInt(surplusYearFilter);
    const currentYear = new Date().getFullYear();
    compositionDate = filterYear === currentYear ? today : `${filterYear}-12-31`;
  }
  
  // Get account balances at the specific date
  const accounts = await getAllActiveAccounts();
  const accountBalances = [];
  
  for (const account of accounts) {
    const balance = await getLatestBalance(account.id, compositionDate);
    if (balance && balance > 0) {
      accountBalances.push({
        account,
        balance
      });
    }
  }

  if (accountBalances.length > 0) {
    const compLabels = accountBalances.map(d => d.account.name);
    const compData = accountBalances.map(d => d.balance / 100);
    
    // Harmonious blue-tone color palette with subtle variations
    // All colors are blue-based but distinguishable from each other
    const blueToneColors = [
      '#007AFF', // 经典蓝
      '#32ADE6', // 天蓝
      '#5AC8FA', // 浅蓝
      '#00C7BE', // 青蓝
      '#64D2FF', // 亮蓝
      '#0055D4', // 深蓝
      '#4A90E2', // 钢蓝
      '#7BB3E8', // 柔蓝
      '#87CEEB', // 天空蓝
      '#4682B4', // 海军蓝
      '#5F9EA0', // 蓝绿
      '#6BA3D6'  // 淡蓝
    ];
    
    // Generate colors based on account name (not type)
    // This ensures each unique account name gets a unique color
    const compColors = accountBalances.map((d, index) => {
      // Use account name to generate consistent color
      const nameHash = d.account.name.split('').reduce((hash, char) => {
        return char.charCodeAt(0) + ((hash << 5) - hash);
      }, 0);
      const colorIndex = Math.abs(nameHash) % blueToneColors.length;
      return blueToneColors[colorIndex];
    });

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
    
    // Set default year filter based on range
    if (currentRange === 'all') {
      surplusYearFilter = 'all'; // Default to 'all' for 'all' range
    } else if (currentRange === '1y') {
      surplusYearFilter = String(new Date().getFullYear()); // Default to current year for '1y' range
    }
    
    destroyCharts();
    refreshView();
  });

  // Bind trend year filter
  document.getElementById('trend-year-filter')?.addEventListener('change', (e) => {
    surplusYearFilter = e.target.value;
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

  // Clear cache
  document.getElementById('clear-cache-btn')?.addEventListener('click', clearAllCache);
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
    const debugDates = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].trim();
      if (!row) continue;

      // Split by comma or tab, handling values that may contain commas
      let parts;
      if (row.includes('\t')) {
        // Tab-separated
        parts = row.split('\t');
      } else {
        // Comma-separated
        parts = parseCSVLine(row);
      }
      
      if (parts.length < 4) {
        errors.push('第 ' + (i + 1) + ' 行格式不正确');
        continue;
      }

      const date = parts[0].trim();
      const accountName = parts[1].trim();
      const typeLabel = parts[2].trim();
      const balanceStr = parts[3].trim();

      // Normalize date format: convert YYYY/M/D or YYYY/MM/DD to YYYY-MM-DD
      let normalizedDate = date;
      if (date.includes('/')) {
        const dateParts = date.split('/');
        if (dateParts.length === 3) {
          const year = dateParts[0];
          const month = dateParts[1].padStart(2, '0');
          const day = dateParts[2].padStart(2, '0');
          normalizedDate = `${year}-${month}-${day}`;
        }
      }
      
      debugDates.push({ original: date, normalized: normalizedDate, account: accountName });

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

      if (account && normalizedDate) {
        await upsertRecord(account.id, normalizedDate, balanceCents, '');
        importCount++;
      }
    }

    let msg = '导入完成：' + importCount + ' 条记录';
    if (accountCount > 0) msg += '，新建 ' + accountCount + ' 个账户';
    if (errors.length > 0) msg += '，' + errors.length + ' 条错误';
    showToast(msg);
    
    // Debug: log date conversions
    console.log('日期转换详情:', debugDates);

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

async function clearAllCache() {
  showModal({
    title: '清除缓存',
    message: '确定要清除所有缓存吗？\n\n这将删除 Service Worker 缓存并重新加载页面，\n确保使用最新的代码版本。',
    confirmText: '清除',
    cancelText: '取消',
    danger: true,
    onConfirm: async () => {
      try {
        // Unregister Service Worker
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
          }
        }

        // Clear all caches
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
          );
        }

        showToast('缓存已清除，正在重新加载...');
        
        // Reload page after a short delay
        setTimeout(() => {
          window.location.reload(true);
        }, 500);
      } catch (error) {
        console.error('Failed to clear cache:', error);
        showToast('清除缓存失败');
      }
    }
  });
}

export function unmount() {
  destroyCharts();
  // Reset surplus year filter to current year
  surplusYearFilter = String(new Date().getFullYear());
  surplusAllData = [];
}

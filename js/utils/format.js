// Currency and date formatting utilities

// Format cents to display currency string: 10050 → "¥100.50"
export function formatCurrency(cents) {
  if (cents === null || cents === undefined) return '¥0.00';
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fen = abs % 100;
  const sign = cents < 0 ? '-' : '';
  const yuanStr = yuan.toLocaleString('zh-CN');
  return `${sign}¥${yuanStr}.${String(fen).padStart(2, '0')}`;
}

// Format cents to change string with sign: 10050 → "+¥100.50", -500 → "-¥5.00"
export function formatChange(cents) {
  if (cents === null || cents === undefined || cents === 0) return '¥0.00';
  const prefix = cents > 0 ? '+' : '';
  return prefix + formatCurrency(cents);
}

// Format a large currency without decimals for charts: 1234567 → "¥12,345"
export function formatCurrencyShort(cents) {
  if (cents === null || cents === undefined) return '¥0';
  const yuan = Math.round(cents / 100);
  return `¥${yuan.toLocaleString('zh-CN')}`;
}

// Parse user input string to cents: "100.50" → 10050, "12345" → 1234500
export function parseCurrencyInput(str) {
  if (!str || str.trim() === '') return null;
  const cleaned = str.replace(/[¥,，\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

// Format cents for input field display: 10050 → "100.50"
export function centsToInputValue(cents) {
  if (cents === null || cents === undefined) return '';
  const value = cents / 100;
  return value.toFixed(2);
}

// Get today's date string: "2026-04-09"
export function getToday() {
  return new Date().toISOString().slice(0, 10);
}

// Format date string to display: "2026-04-09" → "2026年4月9日 周三"
export function formatDateFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
}

// Format date string short: "2026-04-09" → "4月9日"
export function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// Format date for charts based on range
export function formatDateForChart(dateStr, range) {
  const d = new Date(dateStr + 'T00:00:00');
  if (range <= 31) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } else if (range <= 366) {
    return `${d.getMonth() + 1}月`;
  } else {
    return `${d.getFullYear()}/${d.getMonth() + 1}`;
  }
}

// Add days to a date string: ("2026-04-09", -1) → "2026-04-08"
export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Check if a date is today
export function isToday(dateStr) {
  return dateStr === getToday();
}

// Get the start date for a time range
export function getRangeStartDate(range) {
  const today = getToday();
  switch (range) {
    case '7d': return addDays(today, -6);
    case '30d': return addDays(today, -29);
    case '1y': return addDays(today, -364);
    case 'all': return '2000-01-01';
    default: return addDays(today, -29);
  }
}

// Get the number of days in a range string
export function getRangeDays(range) {
  switch (range) {
    case '7d': return 7;
    case '30d': return 30;
    case '1y': return 365;
    case 'all': return 9999;
    default: return 30;
  }
}

// Account type presets - 5大类别使用icons目录下的SVG文件
export const ACCOUNT_TYPES = [
  // 银行类 - 各银行使用独特标志
  { type: 'bank-icbc', label: '工商银行', icon: 'icons/bank-icbc.svg', color: '#1677FF' },
  { type: 'bank-abc', label: '农业银行', icon: 'icons/bank-abc.svg', color: '#1677FF' },
  { type: 'bank-ningbo', label: '宁波银行', icon: 'icons/bank-ningbo.svg', color: '#1677FF' },
  { type: 'bank-cmb', label: '招商银行', icon: 'icons/bank-cmb.svg', color: '#1677FF' },
  { type: 'bank-web', label: '网商银行', icon: 'icons/bank-web.svg', color: '#1677FF' },
  { type: 'bank-other', label: '其他银行', icon: 'icons/bank-other.svg', color: '#1677FF' },
  // 其他类型
  { type: 'alipay', label: '支付宝', icon: 'icons/alipay.svg', color: '#1677FF' },
  { type: 'wechat', label: '微信', icon: 'icons/wechat.svg', color: '#07C160' },
  { type: 'cash', label: '现金', icon: 'icons/cash.svg', color: '#FF9500' },
  { type: 'invest', label: '投资', icon: 'icons/invest.svg', color: '#FF3B30' },
  { type: 'custom', label: '自定义', icon: 'icons/custom.svg', color: '#5856D6' }
];

// Cache for loaded SVG icons
const svgCache = new Map();

// Load SVG icon from file
export async function loadSvgIcon(path) {
  if (svgCache.has(path)) {
    return svgCache.get(path);
  }
  
  try {
    console.log('Loading icon:', path);
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const svg = await response.text();
    console.log('Icon loaded successfully:', path);
    svgCache.set(path, svg);
    return svg;
  } catch (error) {
    console.error('Failed to load icon:', path, error);
    return '<span>💰</span>';
  }
}

// Get type preset by type string
export function getTypePreset(type) {
  return ACCOUNT_TYPES.find(t => t.type === type) || ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1];
}

// Get account icon path (sync, returns path)
export function getAccountIcon(account) {
  const preset = getTypePreset(account.type);
  return preset.icon;
}

// Get account icon HTML (async, loads SVG from file)
export async function getAccountIconHtml(account) {
  const preset = getTypePreset(account.type);
  const iconPath = preset.icon;
  
  // If it's an SVG file path
  if (iconPath.endsWith('.svg')) {
    const svg = await loadSvgIcon(iconPath);
    return svg;
  }
  
  // Otherwise return as-is (emoji or inline SVG)
  return iconPath;
}

// Predefined color palette
export const COLOR_PALETTE = [
  '#1677FF', '#07C160', '#FF9500', '#FF3B30',
  '#AF52DE', '#F7931A', '#5856D6', '#00C7BE',
  '#FF2D55', '#64D2FF', '#30D158', '#FFD60A'
];

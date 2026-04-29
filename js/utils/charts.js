// Chart.js configuration factories

export function createNetWorthLineConfig(labels, data) {
  return {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#007AFF',
        backgroundColor: 'rgba(0, 122, 255, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: data.length > 30 ? 0 : 3,
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
            maxTicksLimit: 6,
            font: { size: 10 },
            color: '#8E8E93'
          },
          grid: { display: false }
        },
        y: {
          display: true,
          ticks: {
            callback: (v) => `¥${v.toLocaleString('zh-CN')}`,
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
  };
}

export function createSurplusBarConfig(labels, data) {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map(v => v >= 0 ? 'rgba(52, 199, 89, 0.7)' : 'rgba(255, 59, 48, 0.7)'),
        borderColor: data.map(v => v >= 0 ? '#34C759' : '#FF3B30'),
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              const sign = v >= 0 ? '+' : '';
              return `${sign}¥${v.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 10 }, color: '#8E8E93' },
          grid: { display: false }
        },
        y: {
          ticks: {
            callback: (v) => `¥${v.toLocaleString('zh-CN')}`,
            font: { size: 10 },
            color: '#8E8E93',
            maxTicksLimit: 4
          },
          grid: { color: '#F2F2F7' }
        }
      }
    }
  };
}

export function createCompositionDonutConfig(labels, data, colors) {
  return {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding: 12,
            usePointStyle: true,
            pointStyle: 'circle',
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ¥${ctx.parsed.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} (${pct}%)`;
            }
          }
        }
      }
    }
  };
}

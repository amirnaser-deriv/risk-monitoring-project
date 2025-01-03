// Chart.js default styles
Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.color = '#64748b';
Chart.defaults.scale.grid.color = '#e2e8f0';
Chart.defaults.plugins.tooltip.backgroundColor = '#1e293b';
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.titleFont.weight = '600';

// Chart instances
let exposureChart = null;
let pnlChart = null;

// Colors
const colors = {
    primary: '#2563eb',
    success: '#16a34a',
    danger: '#dc2626',
    warning: '#f59e0b',
    border: '#e2e8f0',
    text: '#1e293b',
    textLight: '#64748b'
};

// Initialize exposure distribution chart
function initExposureChart(data = []) {
    const ctx = document.getElementById('exposure-chart-canvas').getContext('2d');
    
    exposureChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.label),
            datasets: [{
                data: data.map(d => d.value),
                backgroundColor: [
                    colors.primary,
                    colors.success,
                    colors.warning,
                    colors.danger
                ],
                borderColor: colors.border,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${context.label}: ${percentage}% ($${value.toLocaleString()})`;
                        }
                    }
                }
            }
        }
    });
}

// Initialize P/L trend chart
function initPnlChart(data = []) {
    const ctx = document.getElementById('pnl-chart-canvas').getContext('2d');
    
    pnlChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.date),
            datasets: [{
                label: 'Net P/L',
                data: data.map(d => d.value),
                borderColor: colors.primary,
                backgroundColor: createGradient(ctx, colors.primary),
                fill: true,
                tension: 0.4,
                borderWidth: 2,
                pointRadius: 0,
                pointHitRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            return `P/L: ${value >= 0 ? '+' : ''}$${value.toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxTicksLimit: 5
                    }
                },
                y: {
                    grid: {
                        drawBorder: false
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

// Create gradient background for charts
function createGradient(ctx, color) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, `${color}20`);
    gradient.addColorStop(1, `${color}05`);
    return gradient;
}

// Update exposure chart data
function updateExposureChart(data) {
    if (exposureChart) {
        exposureChart.data.labels = data.map(d => d.label);
        exposureChart.data.datasets[0].data = data.map(d => d.value);
        exposureChart.update('none');
    } else {
        initExposureChart(data);
    }
}

// Update P/L chart data
function updatePnlChart(data) {
    if (pnlChart) {
        pnlChart.data.labels = data.map(d => d.date);
        pnlChart.data.datasets[0].data = data.map(d => d.value);
        pnlChart.update('none');
    } else {
        initPnlChart(data);
    }
}

// Initialize charts with mock data
document.addEventListener('DOMContentLoaded', () => {
    // Mock exposure data
    const exposureData = [
        { label: 'BOOM500', value: 25000 },
        { label: 'CRASH500', value: 18000 },
        { label: 'STEP500', value: 15000 }
    ];

    // Mock P/L data
    const pnlData = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
        value: Math.random() * 10000 - 5000
    }));

    // Initialize charts
    initExposureChart(exposureData);
    initPnlChart(pnlData);
});

// Export chart functions
window.charts = {
    updateExposureChart,
    updatePnlChart
};

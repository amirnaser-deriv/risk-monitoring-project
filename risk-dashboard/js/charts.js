// Chart.js configurations and setup
const chartConfigs = {
    // Common options for all charts
    commonOptions: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    padding: 20,
                    usePointStyle: true
                }
            }
        }
    },

    // Position Distribution Chart (Pie)
    positionDistribution: {
        type: 'pie',
        data: {
            labels: ['Buy', 'Sell'],
            datasets: [{
                data: [0, 0],
                backgroundColor: ['#3498db', '#e74c3c'],
                borderWidth: 0
            }]
        },
        options: {
            ...this?.commonOptions,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                title: {
                    display: true,
                    text: 'Position Distribution'
                }
            }
        }
    },

    // P&L Trend Chart (Line)
    pnlTrend: {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'P&L',
                data: [],
                borderColor: '#2ecc71',
                borderWidth: 2,
                fill: true,
                backgroundColor: 'rgba(46, 204, 113, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            ...this?.commonOptions,
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            }
        }
    },

    // Risk Exposure Chart (Bar)
    riskExposure: {
        type: 'bar',
        data: {
            labels: ['Low', 'Medium', 'High'],
            datasets: [{
                label: 'Risk Level',
                data: [0, 0, 0],
                backgroundColor: [
                    'rgba(46, 204, 113, 0.6)',
                    'rgba(241, 196, 15, 0.6)',
                    'rgba(231, 76, 60, 0.6)'
                ],
                borderColor: [
                    'rgb(46, 204, 113)',
                    'rgb(241, 196, 15)',
                    'rgb(231, 76, 60)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            ...this?.commonOptions,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    },

    // Trading Volume Chart (Line)
    tradingVolume: {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Volume',
                data: [],
                borderColor: '#9b59b6',
                borderWidth: 2,
                fill: true,
                backgroundColor: 'rgba(155, 89, 182, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            ...this?.commonOptions,
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            }
        }
    }
};

// Initialize charts
let charts = {};

function initializeCharts() {
    // Position Distribution
    const positionCtx = document.getElementById('position-distribution').getContext('2d');
    charts.positionDistribution = new Chart(positionCtx, chartConfigs.positionDistribution);

    // P&L Trend
    const pnlCtx = document.getElementById('pnl-trend').getContext('2d');
    charts.pnlTrend = new Chart(pnlCtx, chartConfigs.pnlTrend);

    // Risk Exposure
    const riskCtx = document.getElementById('risk-exposure').getContext('2d');
    charts.riskExposure = new Chart(riskCtx, chartConfigs.riskExposure);

    // Trading Volume
    const volumeCtx = document.getElementById('trading-volume').getContext('2d');
    charts.tradingVolume = new Chart(volumeCtx, chartConfigs.tradingVolume);
}

// Update chart data
function updateCharts(data) {
    // Update Position Distribution
    if (data.positions) {
        const buyCount = data.positions.filter(p => p.side === 'buy').length;
        const sellCount = data.positions.filter(p => p.side === 'sell').length;
        charts.positionDistribution.data.datasets[0].data = [buyCount, sellCount];
        charts.positionDistribution.update();
    }

    // Update P&L Trend
    if (data.pnlHistory) {
        charts.pnlTrend.data.labels = data.pnlHistory.map(p => p.date);
        charts.pnlTrend.data.datasets[0].data = data.pnlHistory.map(p => p.value);
        charts.pnlTrend.update();
    }

    // Update Risk Exposure
    if (data.riskLevels) {
        charts.riskExposure.data.datasets[0].data = [
            data.riskLevels.low,
            data.riskLevels.medium,
            data.riskLevels.high
        ];
        charts.riskExposure.update();
    }

    // Update Trading Volume
    if (data.volumeHistory) {
        charts.tradingVolume.data.labels = data.volumeHistory.map(v => v.date);
        charts.tradingVolume.data.datasets[0].data = data.volumeHistory.map(v => v.value);
        charts.tradingVolume.update();
    }
}

// Handle window resize
function handleResize() {
    Object.values(charts).forEach(chart => {
        if (chart) {
            chart.resize();
        }
    });
}

// Event Listeners
window.addEventListener('resize', handleResize);
window.addEventListener('load', initializeCharts);

// Export functions for use in risk-dashboard.js
window.dashboardCharts = {
    charts,
    updateCharts
};

// Dashboard charts configuration
window.dashboardCharts = {
    charts: null,
    isInitialized: false,

    initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Charts: Initializing...');
            updateStatus('charts', 'pending', '⏳ Charts: Initializing...');

            this.charts = {
                positionDistribution: this.createPositionDistributionChart(),
                riskExposure: this.createRiskExposureChart(),
                pnlTrend: this.createPnLTrendChart(),
                tradingVolume: this.createTradingVolumeChart()
            };

            this.isInitialized = true;
            console.log('Charts: Initialized successfully');
            updateStatus('charts', 'done', '✅ Charts: Ready');
            window.dispatchEvent(new Event('chartsReady'));

        } catch (error) {
            console.error('Charts initialization error:', error);
            updateStatus('charts', 'error', '❌ Charts: Error');
            this.isInitialized = true;
            window.dispatchEvent(new Event('chartsReady'));
        }
    },

    createPositionDistributionChart() {
        const ctx = document.getElementById('position-distribution');
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Buy', 'Sell'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: [
                        'rgba(46, 204, 113, 0.8)',  // Green for Buy
                        'rgba(231, 76, 60, 0.8)'    // Red for Sell
                    ],
                    borderColor: [
                        'rgba(46, 204, 113, 1)',
                        'rgba(231, 76, 60, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
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
        });
    },

    createRiskExposureChart() {
        const ctx = document.getElementById('risk-exposure');
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Low', 'Medium', 'High'],
                datasets: [{
                    label: 'Positions by Risk Level',
                    data: [0, 0, 0],
                    backgroundColor: [
                        'rgba(46, 204, 113, 0.8)',  // Green for Low
                        'rgba(241, 196, 15, 0.8)',  // Yellow for Medium
                        'rgba(231, 76, 60, 0.8)'    // Red for High
                    ],
                    borderColor: [
                        'rgba(46, 204, 113, 1)',
                        'rgba(241, 196, 15, 1)',
                        'rgba(231, 76, 60, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Risk Exposure Distribution'
                    }
                }
            }
        });
    },

    createPnLTrendChart() {
        const ctx = document.getElementById('pnl-trend');
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'P&L',
                    data: [],
                    borderColor: 'rgba(52, 152, 219, 1)',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: 'USD'
                                }).format(value);
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'P&L Trend'
                    }
                }
            }
        });
    },

    createTradingVolumeChart() {
        const ctx = document.getElementById('trading-volume');
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Volume',
                    data: [],
                    backgroundColor: 'rgba(155, 89, 182, 0.8)',
                    borderColor: 'rgba(155, 89, 182, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return new Intl.NumberFormat('en-US', {
                                    style: 'currency',
                                    currency: 'USD',
                                    notation: 'compact'
                                }).format(value);
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Trading Volume by Index'
                    }
                }
            }
        });
    }
};

// Initialize charts when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardCharts.initialize();
});

// Helper function to update initialization status
function updateStatus(component, status, message) {
    const el = document.getElementById(`status-${component}`);
    if (el) {
        el.className = `status-item ${status}`;
        el.textContent = message;
    }
}

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
                        text: 'Exposure Distribution by Side'
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
                        text: 'Risk Level Exposure Distribution'
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
                        text: 'Exposure by Index'
                    }
                }
            }
        });
    },

    updateCharts(positions) {
        if (!this.isInitialized || !this.charts) {
            console.warn('Charts not initialized, skipping update');
            return;
        }

        try {
            // Calculate total exposure for percentage calculations
            const totalExposure = positions.reduce((sum, pos) => {
                const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id) || pos.entry_price;
                return sum + (pos.quantity * currentPrice);
            }, 0);

            // Update Position Distribution Chart (now showing exposure by side)
            if (this.charts.positionDistribution) {
                const buyExposure = positions
                    .filter(p => p.side === 'buy')
                    .reduce((sum, p) => {
                        const currentPrice = window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price;
                        return sum + (p.quantity * currentPrice);
                    }, 0);
                const sellExposure = positions
                    .filter(p => p.side === 'sell')
                    .reduce((sum, p) => {
                        const currentPrice = window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price;
                        return sum + (p.quantity * currentPrice);
                    }, 0);
                
                this.charts.positionDistribution.data.datasets[0].data = [buyExposure, sellExposure];
                this.charts.positionDistribution.options.plugins.tooltip = {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = ((value / totalExposure) * 100).toFixed(1);
                            return `${context.label}: ${new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                maximumFractionDigits: 0
                            }).format(value)} (${percentage}%)`;
                        }
                    }
                };
                this.charts.positionDistribution.update();
            }

            // Update Risk Exposure Chart (now showing exposure amounts)
            if (this.charts.riskExposure) {
                const riskLevels = {
                    low: positions
                        .filter(p => {
                            const exposure = p.quantity * (window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price);
                            return exposure <= 500000;
                        })
                        .reduce((sum, p) => sum + (p.quantity * (window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price)), 0),
                    medium: positions
                        .filter(p => {
                            const exposure = p.quantity * (window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price);
                            return exposure > 500000 && exposure <= 1000000;
                        })
                        .reduce((sum, p) => sum + (p.quantity * (window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price)), 0),
                    high: positions
                        .filter(p => {
                            const exposure = p.quantity * (window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price);
                            return exposure > 1000000;
                        })
                        .reduce((sum, p) => sum + (p.quantity * (window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price)), 0)
                };

                this.charts.riskExposure.data.datasets[0].data = [
                    riskLevels.low,
                    riskLevels.medium,
                    riskLevels.high
                ];
                this.charts.riskExposure.options.plugins.tooltip = {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = ((value / totalExposure) * 100).toFixed(1);
                            return `${context.label}: ${new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                maximumFractionDigits: 0
                            }).format(value)} (${percentage}%)`;
                        }
                    }
                };
                this.charts.riskExposure.update();
            }

            // Update P&L Trend Chart
            if (this.charts.pnlTrend) {
                const totalPnl = positions.reduce((sum, pos) => 
                    sum + window.RiskPositionManager.calculatePnL(pos), 0);
                
                // Add new data point with current timestamp
                const now = new Date();
                this.charts.pnlTrend.data.labels.push(
                    now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                );
                this.charts.pnlTrend.data.datasets[0].data.push(totalPnl);

                // Keep only last 20 data points
                if (this.charts.pnlTrend.data.labels.length > 20) {
                    this.charts.pnlTrend.data.labels.shift();
                    this.charts.pnlTrend.data.datasets[0].data.shift();
                }

                this.charts.pnlTrend.update();
            }

            // Update Trading Volume Chart (now showing exposure by index)
            if (this.charts.tradingVolume) {
                const exposureByIndex = positions.reduce((acc, pos) => {
                    const exposure = pos.quantity * (window.PriceUpdates.getCurrentPrice(pos.index_id) || pos.entry_price);
                    acc[pos.index_id] = (acc[pos.index_id] || 0) + exposure;
                    return acc;
                }, {});

                // Sort by exposure amount
                const sortedIndices = Object.entries(exposureByIndex)
                    .sort(([,a], [,b]) => b - a)
                    .reduce((acc, [key, value]) => {
                        acc.labels.push(key);
                        acc.data.push(value);
                        return acc;
                    }, { labels: [], data: [] });

                this.charts.tradingVolume.data.labels = sortedIndices.labels;
                this.charts.tradingVolume.data.datasets[0].data = sortedIndices.data;
                this.charts.tradingVolume.options.plugins.tooltip = {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = ((value / totalExposure) * 100).toFixed(1);
                            return `Exposure: ${new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                maximumFractionDigits: 0
                            }).format(value)} (${percentage}%)`;
                        }
                    }
                };
                this.charts.tradingVolume.update();
            }

        } catch (error) {
            console.error('Error updating charts:', error);
        }
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

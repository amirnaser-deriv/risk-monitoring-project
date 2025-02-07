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
                goldPositionDistribution: this.createGoldPositionDistributionChart(),
                silverPositionDistribution: this.createSilverPositionDistributionChart()
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
                labels: ['Gold Buy', 'Gold Sell', 'Silver Buy', 'Silver Sell'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: [
                        'rgba(255, 215, 0, 0.8)',   // Gold color for Buy
                        'rgba(218, 165, 32, 0.8)',  // Darker gold for Sell
                        'rgba(192, 192, 192, 0.8)', // Silver color for Buy
                        'rgba(169, 169, 169, 0.8)'  // Darker silver for Sell
                    ],
                    borderColor: [
                        'rgba(255, 215, 0, 1)',
                        'rgba(218, 165, 32, 1)',
                        'rgba(192, 192, 192, 1)',
                        'rgba(169, 169, 169, 1)'
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
                        text: 'Overall Position Distribution'
                    }
                }
            }
        });
    },

    createGoldPositionDistributionChart() {
        const ctx = document.getElementById('gold-position-distribution');
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Buy', 'Sell'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: [
                        'rgba(255, 215, 0, 0.8)',   // Gold color for Buy
                        'rgba(218, 165, 32, 0.8)'   // Darker gold for Sell
                    ],
                    borderColor: [
                        'rgba(255, 215, 0, 1)',
                        'rgba(218, 165, 32, 1)'
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
                        text: 'Gold Position Distribution'
                    }
                }
            }
        });
    },

    createSilverPositionDistributionChart() {
        const ctx = document.getElementById('silver-position-distribution');
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Buy', 'Sell'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: [
                        'rgba(192, 192, 192, 0.8)', // Silver color for Buy
                        'rgba(169, 169, 169, 0.8)'  // Darker silver for Sell
                    ],
                    borderColor: [
                        'rgba(192, 192, 192, 1)',
                        'rgba(169, 169, 169, 1)'
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
                        text: 'Silver Position Distribution'
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

            // Separate gold and silver positions
            const goldPositions = positions.filter(p => p.index_id.toLowerCase().includes('gold'));
            const silverPositions = positions.filter(p => p.index_id.toLowerCase().includes('silver'));

            // Calculate exposures for gold
            const goldBuyExposure = goldPositions
                .filter(p => p.side === 'buy')
                .reduce((sum, p) => {
                    const currentPrice = window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price;
                    return sum + (p.quantity * currentPrice);
                }, 0);
            const goldSellExposure = goldPositions
                .filter(p => p.side === 'sell')
                .reduce((sum, p) => {
                    const currentPrice = window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price;
                    return sum + (p.quantity * currentPrice);
                }, 0);

            // Calculate exposures for silver
            const silverBuyExposure = silverPositions
                .filter(p => p.side === 'buy')
                .reduce((sum, p) => {
                    const currentPrice = window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price;
                    return sum + (p.quantity * currentPrice);
                }, 0);
            const silverSellExposure = silverPositions
                .filter(p => p.side === 'sell')
                .reduce((sum, p) => {
                    const currentPrice = window.PriceUpdates.getCurrentPrice(p.index_id) || p.entry_price;
                    return sum + (p.quantity * currentPrice);
                }, 0);

            // Update Overall Position Distribution Chart
            if (this.charts.positionDistribution) {
                this.charts.positionDistribution.data.datasets[0].data = [
                    goldBuyExposure,
                    goldSellExposure,
                    silverBuyExposure,
                    silverSellExposure
                ];
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

            // Update Gold Position Distribution Chart
            if (this.charts.goldPositionDistribution) {
                this.charts.goldPositionDistribution.data.datasets[0].data = [
                    goldBuyExposure,
                    goldSellExposure
                ];
                const goldTotal = goldBuyExposure + goldSellExposure;
                this.charts.goldPositionDistribution.options.plugins.tooltip = {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = ((value / goldTotal) * 100).toFixed(1);
                            return `${context.label}: ${new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                maximumFractionDigits: 0
                            }).format(value)} (${percentage}%)`;
                        }
                    }
                };
                this.charts.goldPositionDistribution.update();
            }

            // Update Silver Position Distribution Chart
            if (this.charts.silverPositionDistribution) {
                this.charts.silverPositionDistribution.data.datasets[0].data = [
                    silverBuyExposure,
                    silverSellExposure
                ];
                const silverTotal = silverBuyExposure + silverSellExposure;
                this.charts.silverPositionDistribution.options.plugins.tooltip = {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const percentage = ((value / silverTotal) * 100).toFixed(1);
                            return `${context.label}: ${new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                maximumFractionDigits: 0
                            }).format(value)} (${percentage}%)`;
                        }
                    }
                };
                this.charts.silverPositionDistribution.update();
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

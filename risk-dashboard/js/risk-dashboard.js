// Risk dashboard functionality
const riskDashboard = {
    isInitialized: false,
    positions: new Map(),
    riskLevels: {
        exposure: {
            high: 1000000, // $1M
            medium: 500000  // $500K
        },
        pnl: {
            high: -50000,  // -$50K
            medium: -10000 // -$10K
        },
        positions: {
            high: 20,
            medium: 10
        }
    },

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Risk Dashboard: Initializing...');
            updateStatus('app', 'pending', '⏳ App: Initializing...');

            // Initialize services in sequence
            await this.initializeServices();

            // Check authentication and role
            console.log('Checking auth state:', {
                user: window.auth?.user,
                role: window.auth?.user?.role,
                sessionRole: sessionStorage.getItem('userRole')
            });

            if (!window.auth?.user) {
                console.log('User not logged in');
                document.getElementById('loading-overlay').style.display = 'none';
                document.querySelector('main').innerHTML = `
                    <div class="access-denied">
                        <h2>Access Restricted</h2>
                        <p>Please log in with an administrator account to access the risk dashboard.</p>
                        <div class="button-group">
                            <button onclick="window.AuthModal.show()" class="primary-button">Login as Admin</button>
                            <a href="/trading-site/" class="secondary-button">Back to Trading</a>
                        </div>
                    </div>
                `;
                return;
            }

            // Check if user has access to risk dashboard
            const hasRiskManagerAccess = window.auth.hasRole('risk_manager');
            const hasAdminAccess = window.auth.hasRole('admin');
            const hasAccess = hasRiskManagerAccess || hasAdminAccess;
            
            console.log('Dashboard access check:', {
                userRole: window.auth.user.role,
                roleFromSession: sessionStorage.getItem('userRole'),
                hasRiskManagerAccess,
                hasAdminAccess,
                hasAccess
            });

            if (!hasAccess) {
                console.log('User does not have required role');
                document.getElementById('loading-overlay').style.display = 'none';
                document.querySelector('main').innerHTML = `
                    <div class="access-denied">
                        <h2>Access Denied</h2>
                        <p>Sorry, this dashboard is only accessible to administrators and risk managers.</p>
                        <p>Your current role: ${window.auth.user.role || sessionStorage.getItem('userRole') || 'client'}</p>
                        <div class="button-group">
                            <button onclick="window.auth.signOut()" class="primary-button">Sign Out</button>
                            <button onclick="window.AuthModal.show()" class="primary-button">Switch Account</button>
                            <a href="/trading-site/" class="secondary-button">Back to Trading</a>
                        </div>
                    </div>
                `;
                return;
            }

            console.log('Access granted, proceeding with dashboard initialization');

            // Subscribe to position updates
            window.PositionUpdates.subscribe(positions => {
                this.handlePositionUpdates(positions);
            });

            // Subscribe to price updates
            window.PriceUpdates.subscribe(update => {
                this.handlePriceUpdate(update);
            });

            this.isInitialized = true;
            console.log('Risk Dashboard: Initialized successfully');
            updateStatus('app', 'done', '✅ App: Ready');

            // Hide loading overlay
            document.getElementById('loading-overlay').style.display = 'none';

        } catch (error) {
            console.error('Risk Dashboard initialization error:', error);
            updateStatus('app', 'error', '❌ App: Error');
            throw error;
        }
    },

    async initializeServices() {
        // Initialize services in sequence
        console.log('Initializing services in sequence...');

        // 1. Initialize Supabase
        await window.supabaseClient.initialize();
        console.log('Supabase initialized');

        // 2. Initialize Auth
        await window.auth.initialize();
        console.log('Auth initialized');

        // 3. Initialize Price Updates
        await window.PriceUpdates.initialize();
        console.log('Price Updates initialized');

        // 4. Initialize Position Updates
        await window.PositionUpdates.initialize();
        console.log('Position Updates initialized');

        // 5. Initialize Charts
        await window.dashboardCharts.initialize();
        console.log('Charts initialized');
    },

    handlePositionUpdates(positions) {
        // Update positions map
        this.positions.clear();
        positions.forEach(position => {
            if (position.status === 'open') {
                this.positions.set(position.id, position);
            }
        });

        // Update metrics
        this.updateMetrics();

        // Update positions table
        this.updatePositionsTable();

        // Update charts
        this.updateCharts();

        // Check for alerts
        this.checkAlerts();
    },

    handlePriceUpdate(update) {
        // Just update displays since PnL is calculated using current prices
        this.updateMetrics();
        this.updatePositionsTable();
        this.updateCharts();
        this.checkAlerts();
    },

    previousMetrics: {
        positions: 0,
        exposure: 0,
        pnl: 0,
        riskLevel: 'low'
    },

    updateMetrics() {
        const positions = Array.from(this.positions.values());
        
        // Update total positions with trend
        const positionsCount = positions.length;
        this.updateMetricWithTrend('total-positions', 
            positionsCount,
            this.previousMetrics.positions,
            value => value.toString(),
            'positions-trend',
            (current, previous) => {
                if (current === previous) return 'No change';
                const diff = current - previous;
                return `${Math.abs(diff)} position${Math.abs(diff) !== 1 ? 's' : ''} ${diff > 0 ? 'added' : 'closed'}`;
            }
        );
        this.previousMetrics.positions = positionsCount;

        // Calculate and update total exposure with trend
        const totalExposure = positions.reduce((sum, pos) => {
            const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id);
            return sum + (pos.quantity * (currentPrice || pos.entry_price));
        }, 0);
        this.updateMetricWithTrend('total-exposure',
            totalExposure,
            this.previousMetrics.exposure,
            value => new Intl.NumberFormat('en-US', { 
                style: 'currency', 
                currency: 'USD',
                maximumFractionDigits: 0
            }).format(value).replace('$', ''),
            'exposure-trend',
            (current, previous) => {
                if (current === previous) return 'No change';
                const percentChange = ((current - previous) / previous * 100).toFixed(1);
                return `${Math.abs(percentChange)}% ${current > previous ? 'increase' : 'decrease'}`;
            }
        );
        this.previousMetrics.exposure = totalExposure;

        // Calculate and update daily P&L with trend
        const totalPnl = positions.reduce((sum, pos) => 
            sum + window.PositionUpdates.calculatePnL(pos), 0);
        this.updateMetricWithTrend('daily-pnl',
            totalPnl,
            this.previousMetrics.pnl,
            value => new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0
            }).format(value).replace('$', ''),
            'pnl-trend',
            (current, previous) => {
                if (current === previous) return 'No change';
                const diff = current - previous;
                return `${new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 0
                }).format(Math.abs(diff))} ${diff > 0 ? 'gain' : 'loss'}`;
            }
        );
        this.previousMetrics.pnl = totalPnl;

        // Update risk level with trend
        const riskLevel = this.calculateRiskLevel(totalExposure, totalPnl, positions.length);
        const riskElement = document.getElementById('risk-level');
        const previousRisk = this.previousMetrics.riskLevel;
        
        riskElement.textContent = riskLevel.toUpperCase();
        riskElement.className = `metric-value ${riskLevel.toLowerCase()}`;
        
        const riskTrendElement = document.getElementById('risk-trend');
        if (riskLevel === previousRisk) {
            riskTrendElement.textContent = 'Stable';
            riskTrendElement.className = 'metric-trend';
        } else {
            const riskLevels = { low: 1, medium: 2, high: 3 };
            const isIncreasing = riskLevels[riskLevel] > riskLevels[previousRisk];
            riskTrendElement.textContent = isIncreasing ? 'Deteriorating' : 'Improving';
            riskTrendElement.className = `metric-trend ${isIncreasing ? 'down' : 'up'}`;
        }
        this.previousMetrics.riskLevel = riskLevel;
    },

    updateMetricWithTrend(valueId, currentValue, previousValue, formatValue, trendId, getTrendText) {
        const element = document.getElementById(valueId);
        const trendElement = document.getElementById(trendId);
        
        // Update value
        element.textContent = formatValue(currentValue);
        
        // Update trend
        if (currentValue !== previousValue) {
            const isIncreasing = currentValue > previousValue;
            trendElement.textContent = getTrendText(currentValue, previousValue);
            trendElement.className = `metric-trend ${isIncreasing ? 'up' : 'down'}`;
        } else {
            trendElement.textContent = 'No change';
            trendElement.className = 'metric-trend';
        }
    },

    calculateRiskLevel(exposure, pnl, positionCount) {
        const exposureRisk = exposure > this.riskLevels.exposure.high ? 'high' 
            : exposure > this.riskLevels.exposure.medium ? 'medium' : 'low';
        
        const pnlRisk = pnl < this.riskLevels.pnl.high ? 'high'
            : pnl < this.riskLevels.pnl.medium ? 'medium' : 'low';
        
        const positionRisk = positionCount > this.riskLevels.positions.high ? 'high'
            : positionCount > this.riskLevels.positions.medium ? 'medium' : 'low';

        const riskScores = { high: 3, medium: 2, low: 1 };
        const avgScore = (riskScores[exposureRisk] + riskScores[pnlRisk] + riskScores[positionRisk]) / 3;

        return avgScore > 2.5 ? 'high' : avgScore > 1.5 ? 'medium' : 'low';
    },

    updatePositionsTable() {
        const positions = Array.from(this.positions.values());
        const tbody = document.getElementById('positions-table-body');
        
        if (!tbody) return;

        if (positions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No open positions</td></tr>';
            return;
        }

        tbody.innerHTML = positions.map(position => `
            <tr>
                <td>${position.index_id}</td>
                <td>${position.side.toUpperCase()}</td>
                <td>${position.quantity}</td>
                <td>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
                    .format(position.entry_price)}</td>
                <td>${(() => {
                    const currentPrice = window.PriceUpdates.getCurrentPrice(position.index_id);
                    return currentPrice 
                        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(currentPrice)
                        : 'Loading...';
                })()}</td>
                <td class="${window.PositionUpdates.calculatePnL(position) >= 0 ? 'positive' : 'negative'}">
                    ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: 'always' })
                        .format(window.PositionUpdates.calculatePnL(position))}
                </td>
                <td>
                    <span class="status-indicator ${position.status}">
                        ${position.status.toUpperCase()}
                    </span>
                </td>
            </tr>
        `).join('');
    },

    updateCharts() {
        const positions = Array.from(this.positions.values());
        
        if (!window.dashboardCharts?.charts) {
            console.warn('Charts not initialized');
            return;
        }

        try {
            // Update position distribution
            const buyCount = positions.filter(p => p.side === 'buy').length;
            const sellCount = positions.filter(p => p.side === 'sell').length;
            window.dashboardCharts.charts.positionDistribution.data.datasets[0].data = [buyCount, sellCount];
            window.dashboardCharts.charts.positionDistribution.update('none');

            // Update risk exposure
            const riskCounts = positions.reduce((acc, pos) => {
                const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id);
                const exposure = pos.quantity * (currentPrice || pos.entry_price);
                if (exposure > this.riskLevels.exposure.high) acc.high++;
                else if (exposure > this.riskLevels.exposure.medium) acc.medium++;
                else acc.low++;
                return acc;
            }, { low: 0, medium: 0, high: 0 });

            window.dashboardCharts.charts.riskExposure.data.datasets[0].data = [
                riskCounts.low,
                riskCounts.medium,
                riskCounts.high
            ];
            window.dashboardCharts.charts.riskExposure.update('none');

            // Update P&L trend
            const pnlData = positions.map(p => window.PositionUpdates.calculatePnL(p));
            window.dashboardCharts.charts.pnlTrend.data.labels = positions.map(p => p.index_id);
            window.dashboardCharts.charts.pnlTrend.data.datasets[0].data = pnlData;
            window.dashboardCharts.charts.pnlTrend.update('none');

            // Update trading volume
            const volumeData = positions.map(p => {
                const currentPrice = window.PriceUpdates.getCurrentPrice(p.index_id);
                return p.quantity * (currentPrice || p.entry_price);
            });
            window.dashboardCharts.charts.tradingVolume.data.labels = positions.map(p => p.index_id);
            window.dashboardCharts.charts.tradingVolume.data.datasets[0].data = volumeData;
            window.dashboardCharts.charts.tradingVolume.update('none');

        } catch (error) {
            console.error('Error updating charts:', error);
        }
    },

    checkAlerts() {
        const positions = Array.from(this.positions.values());
        const alerts = [];

        // Check total exposure
        const totalExposure = positions.reduce((sum, pos) => {
            const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id);
            return sum + (pos.quantity * (currentPrice || pos.entry_price));
        }, 0);
        
        if (totalExposure > this.riskLevels.exposure.high) {
            alerts.push({
                level: 'high',
                title: 'High Exposure Alert',
                message: `Total exposure exceeds ${new Intl.NumberFormat('en-US', { 
                    style: 'currency', 
                    currency: 'USD' 
                }).format(this.riskLevels.exposure.high)}: ${new Intl.NumberFormat('en-US', { 
                    style: 'currency', 
                    currency: 'USD' 
                }).format(totalExposure)}`,
                timestamp: new Date()
            });
        }

        // Check large losses
        const totalPnl = positions.reduce((sum, pos) => 
            sum + window.PositionUpdates.calculatePnL(pos), 0);
        if (totalPnl < this.riskLevels.pnl.high) {
            alerts.push({
                level: 'high',
                title: 'Significant Loss Alert',
                message: `Current P&L below ${new Intl.NumberFormat('en-US', { 
                    style: 'currency', 
                    currency: 'USD' 
                }).format(this.riskLevels.pnl.high)}: ${new Intl.NumberFormat('en-US', { 
                    style: 'currency', 
                    currency: 'USD' 
                }).format(totalPnl)}`,
                timestamp: new Date()
            });
        }

        // Check position concentration
        if (positions.length > this.riskLevels.positions.high) {
            alerts.push({
                level: 'medium',
                title: 'Position Concentration Alert',
                message: `High number of open positions: ${positions.length}`,
                timestamp: new Date()
            });
        }

        // Update alerts display
        const alertsList = document.getElementById('alerts-list');
        if (!alertsList) return;

        if (alerts.length === 0) {
            alertsList.innerHTML = '<div class="empty-state">No active alerts</div>';
            return;
        }

        alertsList.innerHTML = alerts.map(alert => `
            <div class="alert-item ${alert.level}">
                <div class="alert-header">
                    <strong>${alert.title}</strong>
                    <span>${alert.timestamp.toLocaleTimeString()}</span>
                </div>
                <div class="alert-message">${alert.message}</div>
            </div>
        `).join('');
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    riskDashboard.initialize().catch(error => {
        console.error('Failed to initialize risk dashboard:', error);
    });
});

// Helper function to update initialization status
function updateStatus(component, status, message) {
    const el = document.getElementById(`status-${component}`);
    if (el) {
        el.className = `status-item ${status}`;
        el.textContent = message;
    }
}

// Export for use in other scripts
window.riskDashboard = riskDashboard;

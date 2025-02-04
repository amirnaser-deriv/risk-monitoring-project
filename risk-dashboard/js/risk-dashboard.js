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
        },
        concentration: {
            high: 0.4,  // 40% of total exposure in single index
            medium: 0.25 // 25% of total exposure in single index
        }
    },

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Risk Dashboard: Starting initialization...');
            updateStatus('app', 'pending', '⏳ App: Initializing...');

            // Initialize services in sequence
            await this.initializeServices();

            // Check authentication and role
            const { data: sessionData } = await window.supabaseClient.client.auth.getSession();
            console.log('Checking auth state:', {
                user: window.auth?.user,
                role: window.auth?.user?.role,
                sessionRole: sessionStorage.getItem('userRole'),
                isInitialized: window.auth?.isInitialized,
                hasSession: !!sessionData?.session
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

            // Wait for RiskPositionManager to be ready
            if (!window.RiskPositionManager?.isInitialized) {
                console.log('Waiting for RiskPositionManager...');
                await new Promise((resolve) => {
                    window.addEventListener('riskPositionManagerReady', resolve, { once: true });
                });
            }

            // Force initial positions load
            console.log('Loading initial positions...');
            const initialPositions = window.RiskPositionManager.getAllPositions();
            console.log('Initial positions loaded:', initialPositions);
            this.handlePositionUpdates(initialPositions);

            // Subscribe to position updates using RiskPositionManager
            console.log('Subscribing to RiskPositionManager...');
            window.RiskPositionManager.subscribe(positions => {
                console.log('Received positions update:', positions);
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

        // 1. Initialize Auth first
        console.log('1. Initializing Auth...');
        await window.auth.initialize();
        const { data: sessionData } = await window.supabaseClient.client.auth.getSession();
        console.log('Auth initialized, session:', sessionData?.session);

        // 2. Initialize Supabase after Auth
        console.log('2. Initializing Supabase...');
        await window.supabaseClient.initialize();
        console.log('Supabase initialized, headers:', window.supabaseClient?.client?.rest?.headers);

        // 3. Initialize Price Updates
        console.log('3. Initializing Price Updates...');
        await window.PriceUpdates.initialize();
        console.log('Price Updates initialized');

        // 4. Initialize Risk Position Manager after Supabase
        console.log('4. Initializing Risk Position Manager...');
        await window.RiskPositionManager.initialize();
        console.log('Risk Position Manager initialized, positions:', window.RiskPositionManager.getAllPositions());

        // 5. Initialize Charts last
        console.log('5. Initializing Charts...');
        await window.dashboardCharts.initialize();
        console.log('Charts initialized');

        console.log('All services initialized successfully');
    },

    handlePositionUpdates(positions) {
        console.log('Handling position updates:', positions);
        
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

            // Update charts if initialized
            if (window.dashboardCharts?.isInitialized) {
                window.dashboardCharts.updateCharts(positions);
            } else {
                console.log('Charts not yet initialized, skipping update');
            }

        // Check for alerts
        this.checkAlerts();
    },

    handlePriceUpdate(update) {
        // Just update displays since PnL is calculated using current prices
        this.updateMetrics();
        this.updatePositionsTable();
            if (window.dashboardCharts?.isInitialized) {
                window.dashboardCharts.updateCharts(Array.from(this.positions.values()));
            } else {
                console.log('Charts not yet initialized, skipping update');
            }
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
        console.log('Updating metrics with positions:', positions);
        
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

        /*
          For each position whose index_id includes "gold" (e.g. 'Gold', 'RSI_Gold_mtm', etc.),
          treat its quantity * currentPrice as total dollars. Then convert those dollars into
          an equivalent "gold units" by dividing by the aggregator's 'Gold' price. This way,
          indices like RSI_Gold_mtm (which might be worth $10k each) will properly reflect how
          many ounces/units of gold they represent in total.

          netGoldUnits = Σ( (pos.quantity * currentPrice) / goldPrice ) [for buy positions],
          minus the same for sells.

          netGoldExposure = netGoldUnits * goldPrice
        */
        let netGoldUnits = 0;
        const goldPrice = window.PriceUpdates.getCurrentPrice('Gold') || 1900;

        positions.forEach(pos => {
            if (pos.index_id.toLowerCase().includes('gold')) {
                const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id) || pos.entry_price;
                const effectiveUnits = (pos.quantity * currentPrice) / goldPrice;
                if (pos.side.toLowerCase() === 'buy') {
                    netGoldUnits += effectiveUnits;
                } else {
                    netGoldUnits -= effectiveUnits;
                }
            }
        });

        const netGoldExposure = netGoldUnits * goldPrice;
        const goldUnits = netGoldUnits;

        const goldExpElem = document.getElementById('total-gold-exposure');
        const goldExpTrendElem = document.getElementById('gold-exposure-trend');
        
        // Determine Long or Short label
        if (goldUnits > 0) {
            goldExpElem.style.color = '#27ae60';
            goldExpElem.textContent = goldUnits.toFixed(2) + ' Gold Long';
        } else if (goldUnits < 0) {
            goldExpElem.style.color = '#e74c3c';
            goldExpElem.textContent = Math.abs(goldUnits).toFixed(2) + ' Gold Short';
        } else {
            goldExpElem.style.color = '#7f8c8d';
            goldExpElem.textContent = '0 Gold';
        }

        // Show net exposure in smaller text
        goldExpTrendElem.className = 'metric-trend';
        if (netGoldExposure > 0) {
            goldExpTrendElem.style.color = '#27ae60';
        } else if (netGoldExposure < 0) {
            goldExpTrendElem.style.color = '#e74c3c';
        } else {
            goldExpTrendElem.style.color = '#7f8c8d';
        }
        goldExpTrendElem.textContent = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(netGoldExposure);

        // Calculate and update daily P&L with trend
        const totalPnl = positions.reduce((sum, pos) => 
            sum + window.RiskPositionManager.calculatePnL(pos), 0);
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
        const riskLevel = this.calculateRiskLevel(netGoldExposure, totalPnl, positions.length);
        const riskElement = document.getElementById('risk-level');
        const previousRisk = this.previousMetrics.riskLevel;
        
        if (riskElement) {
            riskElement.textContent = riskLevel.toUpperCase();
            riskElement.className = `metric-value ${riskLevel.toLowerCase()}`;
        }
        
        const riskTrendElement = document.getElementById('risk-trend');
        if (riskTrendElement) {
            if (riskLevel === previousRisk) {
                riskTrendElement.textContent = 'Stable';
                riskTrendElement.className = 'metric-trend';
            } else {
                const riskLevels = { low: 1, medium: 2, high: 3 };
                const isIncreasing = riskLevels[riskLevel] > riskLevels[previousRisk];
                riskTrendElement.textContent = isIncreasing ? 'Deteriorating' : 'Improving';
                riskTrendElement.className = `metric-trend ${isIncreasing ? 'down' : 'up'}`;
            }
        }
        this.previousMetrics.riskLevel = riskLevel;
    },

    updateMetricWithTrend(valueId, currentValue, previousValue, formatValue, trendId, getTrendText) {
        const element = document.getElementById(valueId);
        const trendElement = document.getElementById(trendId);
        
        if (!element || !trendElement) {
            console.error(`Metric elements not found: ${valueId}, ${trendId}`);
            return;
        }
        
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
        const grid = document.getElementById('positions-grid');
        const countElement = document.querySelector('.position-count');
        
        if (!grid) {
            console.error('Positions grid element not found');
            return;
        }

        console.log('Updating positions table with:', positions);

        // Update position count
        if (countElement) {
            countElement.textContent = `${positions.length} position${positions.length !== 1 ? 's' : ''}`;
        }

        if (positions.length === 0) {
            grid.innerHTML = '<div class="empty-state">No open positions</div>';
            return;
        }

        try {
            grid.innerHTML = positions.map(position => this.renderPositionCard(position)).join('');
        } catch (error) {
            console.error('Error rendering positions:', error);
            grid.innerHTML = '<div class="error-state">Error displaying positions</div>';
        }
    },

    renderPositionCard(position) {
        try {
            const currentPrice = window.PriceUpdates.getCurrentPrice(position.index_id);
            const pnl = window.RiskPositionManager.calculatePnL(position);
            const pnlClass = pnl >= 0 ? 'positive' : 'negative';
            const exposure = position.quantity * (currentPrice || position.entry_price);
            const totalExposure = Array.from(this.positions.values()).reduce((sum, pos) => {
                const price = window.PriceUpdates.getCurrentPrice(pos.index_id) || pos.entry_price;
                return sum + (pos.quantity * price);
            }, 0);
            const exposurePercentage = totalExposure ? (exposure / totalExposure * 100).toFixed(1) : 0;

            return `
                <div class="position-card">
                    <div class="position-header">
                        <div class="position-header-main">
                            <span class="position-title">${position.index_id}</span>
                        </div>
                        <div class="position-metrics">
                            <span class="position-side ${position.side.toLowerCase()}">
                                ${position.side.toUpperCase()}
                            </span>
                            <span class="position-exposure">
                                ${new Intl.NumberFormat('en-US', { 
                                    style: 'currency', 
                                    currency: 'USD',
                                    maximumFractionDigits: 0
                                }).format(exposure)}
                                <small>(${exposurePercentage}% of total)</small>
                            </span>
                            <span class="position-pnl ${pnlClass}">
                                ${new Intl.NumberFormat('en-US', { 
                                    style: 'currency', 
                                    currency: 'USD',
                                    signDisplay: 'always'
                                }).format(pnl)}
                            </span>
                        </div>
                    </div>
                    <div class="position-details">
                        <div class="position-detail">
                            <span class="detail-label">Side</span>
                            <span class="position-side ${position.side.toLowerCase()}">
                                ${position.side.toUpperCase()}
                            </span>
                        </div>
                        <div class="position-detail">
                            <span class="detail-label">Quantity</span>
                            <span class="detail-value">${position.quantity}</span>
                        </div>
                        <div class="position-detail">
                            <span class="detail-label">Entry Price</span>
                            <span class="detail-value">
                                ${new Intl.NumberFormat('en-US', { 
                                    style: 'currency', 
                                    currency: 'USD' 
                                }).format(position.entry_price)}
                            </span>
                        </div>
                        <div class="position-detail">
                            <span class="detail-label">Current Price</span>
                            <span class="detail-value">
                                ${currentPrice 
                                    ? new Intl.NumberFormat('en-US', { 
                                        style: 'currency', 
                                        currency: 'USD' 
                                    }).format(currentPrice)
                                    : '<span class="loading">Loading...</span>'}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error rendering position card:', error);
            return `
                <div class="position-card error">
                    <div class="error-message">Error displaying position: ${error.message}</div>
                </div>
            `;
        }
    },

    checkAlerts() {
        const positions = Array.from(this.positions.values());
        const alertsList = document.getElementById('alerts-list');
        if (!alertsList) return;

        const alerts = [];

        // Calculate total exposure and P&L
        const totalExposure = positions.reduce((sum, pos) => {
            const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id);
            return sum + (pos.quantity * (currentPrice || pos.entry_price));
        }, 0);

        const totalPnl = positions.reduce((sum, pos) => 
            sum + window.RiskPositionManager.calculatePnL(pos), 0);

        // Check exposure threshold
        if (totalExposure > this.riskLevels.exposure.high) {
            alerts.push({
                type: 'high',
                message: `High exposure alert: ${new Intl.NumberFormat('en-US', { 
                    style: 'currency', 
                    currency: 'USD',
                    maximumFractionDigits: 0
                }).format(totalExposure)}`
            });
        } else if (totalExposure > this.riskLevels.exposure.medium) {
            alerts.push({
                type: 'medium',
                message: `Medium exposure alert: ${new Intl.NumberFormat('en-US', { 
                    style: 'currency', 
                    currency: 'USD',
                    maximumFractionDigits: 0
                }).format(totalExposure)}`
            });
        }

        // Check P&L threshold
        if (totalPnl < this.riskLevels.pnl.high) {
            alerts.push({
                type: 'high',
                message: `High P&L loss alert: ${new Intl.NumberFormat('en-US', { 
                    style: 'currency', 
                    currency: 'USD',
                    maximumFractionDigits: 0,
                    signDisplay: 'always'
                }).format(totalPnl)}`
            });
        } else if (totalPnl < this.riskLevels.pnl.medium) {
            alerts.push({
                type: 'medium',
                message: `Medium P&L loss alert: ${new Intl.NumberFormat('en-US', { 
                    style: 'currency', 
                    currency: 'USD',
                    maximumFractionDigits: 0,
                    signDisplay: 'always'
                }).format(totalPnl)}`
            });
        }

        // Check position count threshold
        if (positions.length > this.riskLevels.positions.high) {
            alerts.push({
                type: 'high',
                message: `High position count alert: ${positions.length} open positions`
            });
        } else if (positions.length > this.riskLevels.positions.medium) {
            alerts.push({
                type: 'medium',
                message: `Medium position count alert: ${positions.length} open positions`
            });
        }

        // Update alerts display
        if (alerts.length === 0) {
            alertsList.innerHTML = '<div class="empty-state">No active alerts</div>';
        } else {
            alertsList.innerHTML = alerts.map(alert => `
                <div class="alert-item ${alert.type}">
                    <span class="alert-icon">⚠️</span>
                    <span class="alert-message">${alert.message}</span>
                </div>
            `).join('');
        }
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

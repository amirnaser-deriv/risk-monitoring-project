// Risk dashboard functionality
const riskDashboard = {
    isInitialized: false,
    positions: new Map(),

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

            // Wait for services to be ready
            if (!window.PriceUpdates?.isInitialized) {
                await new Promise((resolve) => {
                    window.addEventListener('priceUpdatesReady', resolve, { once: true });
                });
            }

            if (!window.MetalPositionUpdates?.isInitialized) {
                await new Promise((resolve) => {
                    window.addEventListener('metalPositionUpdatesReady', resolve, { once: true });
                });
            }

            if (!window.RiskPositionManager?.isInitialized) {
                await new Promise((resolve) => {
                    window.addEventListener('riskPositionManagerReady', resolve, { once: true });
                });
            }

            // Load initial positions
            console.log('Loading initial positions...');
            const initialPositions = window.RiskPositionManager.getAllPositions();
            console.log('Initial positions loaded:', initialPositions);
            this.handlePositionUpdates(initialPositions);

            // Subscribe to updates
            window.RiskPositionManager.subscribe(positions => {
                console.log('Received positions update:', positions);
                this.handlePositionUpdates(positions);
            });

            window.PriceUpdates.subscribe(update => {
                this.handlePriceUpdate(update);
            });

            window.MetalPositionUpdates.subscribe(update => {
                console.log('Received metal position update:', update);
            });

            this.isInitialized = true;
            console.log('Risk Dashboard: Initialized successfully');
            updateStatus('app', 'done', '✅ App: Ready');
            document.getElementById('loading-overlay').style.display = 'none';

        } catch (error) {
            console.error('Risk Dashboard initialization error:', error);
            updateStatus('app', 'error', '❌ App: Error');
            throw error;
        }
    },

    async initializeServices() {
        console.log('Initializing services in sequence...');

        // Initialize Auth
        await window.auth.initialize();
        const { data: sessionData } = await window.supabaseClient.client.auth.getSession();
        console.log('Auth initialized, session:', sessionData?.session);

        // Initialize Supabase
        await window.supabaseClient.initialize();
        console.log('Supabase initialized');

        // Initialize Price Updates
        await window.PriceUpdates.initialize();
        console.log('Price Updates initialized');

        // Initialize Metal Position Updates
        await window.MetalPositionUpdates.initialize();
        console.log('Metal Position Updates initialized');

        // Initialize Risk Position Manager
        await window.RiskPositionManager.initialize();
        console.log('Risk Position Manager initialized');

        // Initialize Charts
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

        // Update metrics and displays
        this.updateMetrics();
        this.updatePositionsTable();
        if (window.dashboardCharts?.isInitialized) {
            window.dashboardCharts.updateCharts(positions);
        }
    },

    handlePriceUpdate(update) {
        this.updateMetrics();
        this.updatePositionsTable();
        if (window.dashboardCharts?.isInitialized) {
            window.dashboardCharts.updateCharts(Array.from(this.positions.values()));
        }
    },

    updateMetrics() {
        const positions = Array.from(this.positions.values());
        
        // Separate gold and silver positions
        const goldPositions = positions.filter(p => p.index_id.toLowerCase().includes('gold'));
        const silverPositions = positions.filter(p => p.index_id.toLowerCase().includes('silver'));

        // Update total positions breakdown
        document.getElementById('total-positions').textContent = positions.length;
        document.getElementById('gold-positions').textContent = goldPositions.length;
        document.getElementById('silver-positions').textContent = silverPositions.length;

        // Calculate exposures
        const goldPrice = window.PriceUpdates.getCurrentPrice('Gold Price') || 1900;
        const silverPrice = window.PriceUpdates.getCurrentPrice('Silver Price') || 30;

        // Calculate net units
        let netGoldUnits = 0;
        let netSilverUnits = 0;

        // Process gold positions
        goldPositions.forEach(pos => {
            const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id) || pos.entry_price;
            const effectiveUnits = (pos.quantity * currentPrice) / goldPrice;
            if (pos.side.toLowerCase() === 'buy') {
                netGoldUnits -= effectiveUnits;  // Company is short when client buys
            } else {
                netGoldUnits += effectiveUnits;  // Company is long when client sells
            }
        });

        // Process silver positions
        silverPositions.forEach(pos => {
            const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id) || pos.entry_price;
            const effectiveUnits = (pos.quantity * currentPrice) / silverPrice;
            if (pos.side.toLowerCase() === 'buy') {
                netSilverUnits -= effectiveUnits;  // Company is short when client buys
            } else {
                netSilverUnits += effectiveUnits;  // Company is long when client sells
            }
        });

        // Update gold exposure display
        const goldExpElem = document.getElementById('total-gold-exposure');
        if (netGoldUnits > 0) {
            goldExpElem.style.color = '#e74c3c';  // Red for our short position
            goldExpElem.innerHTML = `${netGoldUnits.toFixed(2)} gold lots short<br>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(-netGoldUnits * goldPrice)}`;
        } else if (netGoldUnits < 0) {
            goldExpElem.style.color = '#27ae60';  // Green for our long position
            goldExpElem.innerHTML = `${Math.abs(netGoldUnits).toFixed(2)} gold lots long<br>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(-netGoldUnits * goldPrice)}`;
        } else {
            goldExpElem.style.color = '#7f8c8d';
            goldExpElem.textContent = '0 Gold';
        }

        // Update silver exposure display
        const silverExpElem = document.getElementById('total-silver-exposure');
        if (netSilverUnits > 0) {
            silverExpElem.style.color = '#e74c3c';  // Red for our short position
            silverExpElem.innerHTML = `${netSilverUnits.toFixed(2)} silver lots short<br>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(-netSilverUnits * silverPrice)}`;
        } else if (netSilverUnits < 0) {
            silverExpElem.style.color = '#27ae60';  // Green for our long position
            silverExpElem.innerHTML = `${Math.abs(netSilverUnits).toFixed(2)} silver lots long<br>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(-netSilverUnits * silverPrice)}`;
        } else {
            silverExpElem.style.color = '#7f8c8d';
            silverExpElem.textContent = '0 Silver';
        }

        // Update P&L
        const totalPnl = positions.reduce((sum, pos) => sum + window.RiskPositionManager.calculatePnL(pos), 0);
        const pnlElem = document.getElementById('unrealized-pnl');
        pnlElem.textContent = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(totalPnl);
        pnlElem.style.color = totalPnl >= 0 ? '#27ae60' : '#e74c3c';
    },

    updatePositionsTable() {
        const positions = Array.from(this.positions.values());
        const grid = document.getElementById('positions-grid');
        const countElement = document.querySelector('.position-count');
        
        if (!grid) return;

        if (countElement) {
            countElement.textContent = `${positions.length} position${positions.length !== 1 ? 's' : ''}`;
        }

        if (positions.length === 0) {
            grid.innerHTML = '<div class="empty-state">No open positions</div>';
            return;
        }

        grid.innerHTML = positions.map(position => {
            const currentPrice = window.PriceUpdates.getCurrentPrice(position.index_id);
            const pnl = window.RiskPositionManager.calculatePnL(position);
            const exposure = position.quantity * (currentPrice || position.entry_price);

            return `
                <div class="position-card">
                    <div class="position-header">
                        <span class="position-title">${position.index_id}</span>
                        <span class="position-side ${position.side.toLowerCase()}">${position.side.toUpperCase()}</span>
                    </div>
                    <div class="position-details">
                        <div>Quantity: ${position.quantity}</div>
                        <div>Entry: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(position.entry_price)}</div>
                        <div>Current: ${currentPrice ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(currentPrice) : 'Loading...'}</div>
                        <div>Exposure: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(exposure)}</div>
                        <div class="pnl ${pnl >= 0 ? 'positive' : 'negative'}">
                            P&L: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(pnl)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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

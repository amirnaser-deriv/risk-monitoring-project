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

            // Wait for PriceUpdates to be ready
            if (!window.PriceUpdates?.isInitialized) {
                console.log('Waiting for PriceUpdates...');
                await new Promise((resolve) => {
                    window.addEventListener('priceUpdatesReady', resolve, { once: true });
                });
            }

            // Wait for MetalPositionUpdates to be ready
            if (!window.MetalPositionUpdates?.isInitialized) {
                console.log('Waiting for MetalPositionUpdates...');
                await new Promise((resolve) => {
                    window.addEventListener('metalPositionUpdatesReady', resolve, { once: true });
                });
            }

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

            // Subscribe to metal position updates
            window.MetalPositionUpdates.subscribe(update => {
                console.log('Received metal position update:', update);
                // The update will be used in updateMetrics() to calculate exposures
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

        // 4. Initialize Metal Position Updates after Price Updates
        console.log('4. Initializing Metal Position Updates...');
        await window.MetalPositionUpdates.initialize();
        console.log('Metal Position Updates initialized');

        // 5. Initialize Risk Position Manager after Supabase
        console.log('5. Initializing Risk Position Manager...');
        await window.RiskPositionManager.initialize();
        console.log('Risk Position Manager initialized, positions:', window.RiskPositionManager.getAllPositions());

        // 6. Initialize Charts last
        console.log('6. Initializing Charts...');
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

        // Get metal prices
        const goldPrice = window.PriceUpdates.getCurrentPrice('Gold Price') || 1900;
        const silverPrice = window.PriceUpdates.getCurrentPrice('Silver Price') || 30;

        // Initialize net units
        let netGoldUnits = 0;
        let netSilverUnits = 0;

        // Get current RSI positions
        const goldMtmPosition = window.MetalPositionUpdates?.getCurrentPosition('Gold RSI Momentum');
        const goldCtnPosition = window.MetalPositionUpdates?.getCurrentPosition('Gold RSI Contrarian');
        const silverMtmPosition = window.MetalPositionUpdates?.getCurrentPosition('Silver RSI Momentum');
        const silverCtnPosition = window.MetalPositionUpdates?.getCurrentPosition('Silver RSI Contrarian');

        // Log RSI states
        console.log('Current RSI states:', {
            goldMtm: goldMtmPosition,
            goldCtn: goldCtnPosition,
            silverMtm: silverMtmPosition,
            silverCtn: silverCtnPosition
        });

        // Calculate exposure from positions in RSI indices
        positions.forEach(pos => {
            // Gold RSI positions
            if (pos.index_id === 'Gold RSI Momentum' && goldMtmPosition) {
                const effectiveGoldUnits = pos.quantity * goldMtmPosition.gold_positions;
                // Company's position is inverse of client's position
                if (pos.side.toLowerCase() === 'buy') {
                    netGoldUnits -= effectiveGoldUnits;  // Client buys, we're short
                } else {
                    netGoldUnits += effectiveGoldUnits;  // Client sells, we're long
                }
                console.log('Added Gold RSI Momentum exposure:', {
                    positionSize: pos.quantity,
                    rsiGoldPosition: goldMtmPosition.gold_positions,
                    effectiveGoldUnits,
                    side: pos.side,
                    newTotal: netGoldUnits
                });
            }
            else if (pos.index_id === 'Gold RSI Contrarian' && goldCtnPosition) {
                const effectiveGoldUnits = pos.quantity * goldCtnPosition.gold_positions;
                if (pos.side.toLowerCase() === 'buy') {
                    netGoldUnits += effectiveGoldUnits;
                } else {
                    netGoldUnits -= effectiveGoldUnits;
                }
                console.log('Added Gold RSI Contrarian exposure:', {
                    positionSize: pos.quantity,
                    rsiGoldPosition: goldCtnPosition.gold_positions,
                    effectiveGoldUnits,
                    side: pos.side,
                    newTotal: netGoldUnits
                });
            }
            // Silver RSI positions
            else if (pos.index_id === 'Silver RSI Momentum' && silverMtmPosition) {
                const effectiveSilverUnits = pos.quantity * silverMtmPosition.silver_positions;
                // Company's position is inverse of client's position
                if (pos.side.toLowerCase() === 'buy') {
                    netSilverUnits -= effectiveSilverUnits;  // Client buys, we're short
                } else {
                    netSilverUnits += effectiveSilverUnits;  // Client sells, we're long
                }
                console.log('Added Silver RSI Momentum exposure:', {
                    positionSize: pos.quantity,
                    rsiSilverPosition: silverMtmPosition.silver_positions,
                    effectiveSilverUnits,
                    side: pos.side,
                    newTotal: netSilverUnits
                });
            }
            else if (pos.index_id === 'Silver RSI Contrarian' && silverCtnPosition) {
                const effectiveSilverUnits = pos.quantity * silverCtnPosition.silver_positions;
                if (pos.side.toLowerCase() === 'buy') {
                    netSilverUnits += effectiveSilverUnits;
                } else {
                    netSilverUnits -= effectiveSilverUnits;
                }
                console.log('Added Silver RSI Contrarian exposure:', {
                    positionSize: pos.quantity,
                    rsiSilverPosition: silverCtnPosition.silver_positions,
                    effectiveSilverUnits,
                    side: pos.side,
                    newTotal: netSilverUnits
                });
            }
        });

        // Log intermediate state after RSI positions
        console.log('Metal exposure after RSI positions:', {
            gold: { units: netGoldUnits, value: netGoldUnits * goldPrice },
            silver: { units: netSilverUnits, value: netSilverUnits * silverPrice }
        });

        // Add any other metal positions from RiskPositionManager
        console.log('Processing additional metal positions from RiskPositionManager:', positions);
        positions.forEach(pos => {
            // Direct gold positions
            if (pos.index_id.toLowerCase().includes('gold') && 
                !['Gold RSI Momentum', 'Gold RSI Contrarian'].includes(pos.index_id)) {
                const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id) || pos.entry_price;
                const effectiveUnits = (pos.quantity * currentPrice) / goldPrice;
                // Company's position is inverse of client's position
                if (pos.side.toLowerCase() === 'buy') {
                    netGoldUnits -= effectiveUnits;  // Client buys, we're short
                } else {
                    netGoldUnits += effectiveUnits;  // Client sells, we're long
                }
                console.log('Added position to gold units:', {
                    index: pos.index_id,
                    side: pos.side,
                    quantity: pos.quantity,
                    currentPrice,
                    effectiveUnits,
                    newTotal: netGoldUnits
                });
            }
            // Direct silver positions
            else if (pos.index_id.toLowerCase().includes('silver') && 
                !['Silver RSI Momentum', 'Silver RSI Contrarian'].includes(pos.index_id)) {
                const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id) || pos.entry_price;
                const effectiveUnits = (pos.quantity * currentPrice) / silverPrice;
                // Company's position is inverse of client's position
                if (pos.side.toLowerCase() === 'buy') {
                    netSilverUnits -= effectiveUnits;  // Client buys, we're short
                } else {
                    netSilverUnits += effectiveUnits;  // Client sells, we're long
                }
                console.log('Added position to silver units:', {
                    index: pos.index_id,
                    side: pos.side,
                    quantity: pos.quantity,
                    currentPrice,
                    effectiveUnits,
                    newTotal: netSilverUnits
                });
            }
        });

        // Calculate net exposures
        const netGoldExposure = netGoldUnits * goldPrice;
        const netSilverExposure = netSilverUnits * silverPrice;

        // Update gold exposure display
        const goldExpElem = document.getElementById('total-gold-exposure');
        const goldExpTrendElem = document.getElementById('gold-exposure-trend');

        if (netGoldUnits > 0) {
            goldExpElem.style.color = '#27ae60';
            goldExpElem.textContent = netGoldUnits.toFixed(2) + ' Gold Long';
        } else if (netGoldUnits < 0) {
            goldExpElem.style.color = '#e74c3c';
            goldExpElem.textContent = Math.abs(netGoldUnits).toFixed(2) + ' Gold Short';
        } else {
            goldExpElem.style.color = '#7f8c8d';
            goldExpElem.textContent = '0 Gold';
        }

        goldExpTrendElem.className = 'metric-trend';
        goldExpTrendElem.style.color = netGoldExposure > 0 ? '#27ae60' : netGoldExposure < 0 ? '#e74c3c' : '#7f8c8d';
        goldExpTrendElem.textContent = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(netGoldExposure);

        // Update silver exposure display
        const silverExpElem = document.getElementById('total-silver-exposure');
        const silverExpTrendElem = document.getElementById('silver-exposure-trend');
        
        if (netSilverUnits > 0) {
            silverExpElem.style.color = '#27ae60';
            silverExpElem.textContent = netSilverUnits.toFixed(2) + ' Silver Long';
        } else if (netSilverUnits < 0) {
            silverExpElem.style.color = '#e74c3c';
            silverExpElem.textContent = Math.abs(netSilverUnits).toFixed(2) + ' Silver Short';
        } else {
            silverExpElem.style.color = '#7f8c8d';
            silverExpElem.textContent = '0 Silver';
        }

        silverExpTrendElem.className = 'metric-trend';
        silverExpTrendElem.style.color = netSilverExposure > 0 ? '#27ae60' : netSilverExposure < 0 ? '#e74c3c' : '#7f8c8d';
        silverExpTrendElem.textContent = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(netSilverExposure);

        // Calculate and update unrealized P&L with trend
        const totalPnl = positions.reduce((sum, pos) =>
            sum + window.RiskPositionManager.calculatePnL(pos), 0);
        this.updateMetricWithTrend('unrealized-pnl',
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
            trendElement.textContent = '';
            trendElement.className = 'metric-trend';
        }
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
                if (current === previous) return '';
                const diff = current - previous;
                return `${Math.abs(diff)} position${Math.abs(diff) !== 1 ? 's' : ''} ${diff > 0 ? 'added' : 'closed'}`;
            }
        );
        this.previousMetrics.positions = positionsCount;

        // Get metal prices
        const goldPrice = window.PriceUpdates.getCurrentPrice('Gold Price') || 1900;
        const silverPrice = window.PriceUpdates.getCurrentPrice('Silver Price') || 30;

        // Initialize net units
        let netGoldUnits = 0;
        let netSilverUnits = 0;

        // Get current RSI positions
        const goldMtmPosition = window.MetalPositionUpdates?.getCurrentPosition('Gold RSI Momentum');
        const goldCtnPosition = window.MetalPositionUpdates?.getCurrentPosition('Gold RSI Contrarian');
        const silverMtmPosition = window.MetalPositionUpdates?.getCurrentPosition('Silver RSI Momentum');
        const silverCtnPosition = window.MetalPositionUpdates?.getCurrentPosition('Silver RSI Contrarian');

        // Log RSI states
        console.log('Current RSI states:', {
            goldMtm: goldMtmPosition,
            goldCtn: goldCtnPosition,
            silverMtm: silverMtmPosition,
            silverCtn: silverCtnPosition
        });

        // Calculate exposure from positions in RSI indices
        positions.forEach(pos => {
            // Gold RSI positions
            if (pos.index_id === 'Gold RSI Momentum' && goldMtmPosition) {
                const effectiveGoldUnits = pos.quantity * goldMtmPosition.gold_positions;
                if (pos.side.toLowerCase() === 'buy') {
                    netGoldUnits += effectiveGoldUnits;
                } else {
                    netGoldUnits -= effectiveGoldUnits;
                }
                console.log('Added Gold RSI Momentum exposure:', {
                    positionSize: pos.quantity,
                    rsiGoldPosition: goldMtmPosition.gold_positions,
                    effectiveGoldUnits,
                    side: pos.side,
                    newTotal: netGoldUnits
                });
            }
            else if (pos.index_id === 'Gold RSI Contrarian' && goldCtnPosition) {
                const effectiveGoldUnits = pos.quantity * goldCtnPosition.gold_positions;
                if (pos.side.toLowerCase() === 'buy') {
                    netGoldUnits += effectiveGoldUnits;
                } else {
                    netGoldUnits -= effectiveGoldUnits;
                }
                console.log('Added Gold RSI Contrarian exposure:', {
                    positionSize: pos.quantity,
                    rsiGoldPosition: goldCtnPosition.gold_positions,
                    effectiveGoldUnits,
                    side: pos.side,
                    newTotal: netGoldUnits
                });
            }
            // Silver RSI positions
            else if (pos.index_id === 'Silver RSI Momentum' && silverMtmPosition) {
                const effectiveSilverUnits = pos.quantity * silverMtmPosition.silver_positions;
                if (pos.side.toLowerCase() === 'buy') {
                    netSilverUnits += effectiveSilverUnits;
                } else {
                    netSilverUnits -= effectiveSilverUnits;
                }
                console.log('Added Silver RSI Momentum exposure:', {
                    positionSize: pos.quantity,
                    rsiSilverPosition: silverMtmPosition.silver_positions,
                    effectiveSilverUnits,
                    side: pos.side,
                    newTotal: netSilverUnits
                });
            }
            else if (pos.index_id === 'Silver RSI Contrarian' && silverCtnPosition) {
                const effectiveSilverUnits = pos.quantity * silverCtnPosition.silver_positions;
                if (pos.side.toLowerCase() === 'buy') {
                    netSilverUnits += effectiveSilverUnits;
                } else {
                    netSilverUnits -= effectiveSilverUnits;
                }
                console.log('Added Silver RSI Contrarian exposure:', {
                    positionSize: pos.quantity,
                    rsiSilverPosition: silverCtnPosition.silver_positions,
                    effectiveSilverUnits,
                    side: pos.side,
                    newTotal: netSilverUnits
                });
            }
        });

        // Log intermediate state after RSI positions
        console.log('Metal exposure after RSI positions:', {
            gold: { units: netGoldUnits, value: netGoldUnits * goldPrice },
            silver: { units: netSilverUnits, value: netSilverUnits * silverPrice }
        });

        // Add any other metal positions from RiskPositionManager
        console.log('Processing additional metal positions from RiskPositionManager:', positions);
        positions.forEach(pos => {
            // Direct gold positions
            if (pos.index_id.toLowerCase().includes('gold') && 
                !['Gold RSI Momentum', 'Gold RSI Contrarian'].includes(pos.index_id)) {
                const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id) || pos.entry_price;
                const effectiveUnits = (pos.quantity * currentPrice) / goldPrice;
                if (pos.side.toLowerCase() === 'buy') {
                    netGoldUnits += effectiveUnits;
                } else {
                    netGoldUnits -= effectiveUnits;
                }
                console.log('Added position to gold units:', {
                    index: pos.index_id,
                    side: pos.side,
                    quantity: pos.quantity,
                    currentPrice,
                    effectiveUnits,
                    newTotal: netGoldUnits
                });
            }
            // Direct silver positions
            else if (pos.index_id.toLowerCase().includes('silver') && 
                !['Silver RSI Momentum', 'Silver RSI Contrarian'].includes(pos.index_id)) {
                const currentPrice = window.PriceUpdates.getCurrentPrice(pos.index_id) || pos.entry_price;
                const effectiveUnits = (pos.quantity * currentPrice) / silverPrice;
                if (pos.side.toLowerCase() === 'buy') {
                    netSilverUnits += effectiveUnits;
                } else {
                    netSilverUnits -= effectiveUnits;
                }
                console.log('Added position to silver units:', {
                    index: pos.index_id,
                    side: pos.side,
                    quantity: pos.quantity,
                    currentPrice,
                    effectiveUnits,
                    newTotal: netSilverUnits
                });
            }
        });

        // Calculate net exposures
        const netGoldExposure = netGoldUnits * goldPrice;
        const netSilverExposure = netSilverUnits * silverPrice;

        // Update gold exposure display
        const goldExpElem = document.getElementById('total-gold-exposure');
        const goldExpTrendElem = document.getElementById('gold-exposure-trend');

if (netGoldUnits > 0) {
      goldExpElem.style.color = '#e74c3c';  // Red for our short position
      goldExpElem.innerHTML = `${netGoldUnits.toFixed(2).replace('$', '')} gold lots short<br>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(-netGoldExposure)}`;  // Negative exposure
    } else if (netGoldUnits < 0) {
      goldExpElem.style.color = '#27ae60';  // Green for our long position
      goldExpElem.innerHTML = `${Math.abs(netGoldUnits).toFixed(2).replace('$', '')} gold lots long<br>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(-netGoldExposure)}`;  // Negative exposure
    } else {
      goldExpElem.style.color = '#7f8c8d';
      goldExpElem.textContent = '0 Gold';
    }

    goldExpTrendElem.className = 'metric-trend';
    goldExpTrendElem.style.color = netGoldExposure > 0 ? '#27ae60' : netGoldExposure < 0 ? '#e74c3c' : '#7f8c8d';
    goldExpTrendElem.textContent = '';

    // Update silver exposure display
    const silverExpElem = document.getElementById('total-silver-exposure');
    const silverExpTrendElem = document.getElementById('silver-exposure-trend');

    if (netSilverUnits > 0) {
      silverExpElem.style.color = '#e74c3c';  // Red for our short position
      silverExpElem.innerHTML = `${netSilverUnits.toFixed(2).replace('$', '')} silver lots short<br>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(-netSilverExposure)}`;  // Negative exposure
    } else if (netSilverUnits < 0) {
      silverExpElem.style.color = '#27ae60';  // Green for our long position
      silverExpElem.innerHTML = `${Math.abs(netSilverUnits).toFixed(2).replace('$', '')} silver lots long<br>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(-netSilverExposure)}`;  // Negative exposure
    } else {
      silverExpElem.style.color = '#7f8c8d';
      silverExpElem.textContent = '0 Silver';
    }

        silverExpTrendElem.className = 'metric-trend';
        silverExpTrendElem.style.color = netSilverExposure > 0 ? '#27ae60' : netSilverExposure < 0 ? '#e74c3c' : '#7f8c8d';
        silverExpTrendElem.textContent = '';
        // Calculate and update unrealized P&L with trend
        const totalPnl = positions.reduce((sum, pos) =>
            sum + window.RiskPositionManager.calculatePnL(pos), 0);
        this.updateMetricWithTrend('unrealized-pnl',
            totalPnl,
            this.previousMetrics.pnl,
            value => new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0
            }).format(value).replace('$', ''),
            'pnl-trend',
            (current, previous) => {
                if (current === previous) return '';
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
            // Get the appropriate price for the position
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
            // Normalize RSI index names and metal names
            const normalizedId = pos.index_id
                .replace('RSI_', '')
                .replace('_mtm', ' RSI Momentum')
                .replace('_ctn', ' RSI Contrarian');
            
            const normalizedMetalId = pos.index_id
                .replace('Gold', 'Gold Price')
                .replace('Silver', 'Silver Price');
            
            let currentPrice;
            if (normalizedId === 'Gold RSI Momentum' || normalizedId === 'Gold RSI Contrarian') {
                currentPrice = window.PriceUpdates.getCurrentPrice('Gold Price');
            } else if (normalizedId === 'Silver RSI Momentum' || normalizedId === 'Silver RSI Contrarian') {
                currentPrice = window.PriceUpdates.getCurrentPrice('Silver Price');
            } else {
                currentPrice = window.PriceUpdates.getCurrentPrice(normalizedMetalId);
            }
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

// Trading site functionality
const tradingSite = {
    isInitialized: false,
    currentPrices: new Map(),

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Trading Site: Initializing...');
            updateStatus('app', 'pending', '⏳ App: Initializing...');

            // Initialize in sequence
            await this.initializeServices();

            // Initialize UI components
            this.initializeUI();

            // Wait for price updates to be ready
            if (!window.PriceUpdates.isInitialized) {
                console.log('Trading Site: Waiting for price updates...');
                await new Promise((resolve) => {
                    window.addEventListener('priceUpdatesReady', resolve, { once: true });
                });
            }

            // Subscribe to price updates
            console.log('Trading Site: Subscribing to price updates');
            window.PriceUpdates.subscribe(update => {
                console.log('Trading Site: Received price update:', update);
                this.handlePriceUpdate(update);
            });

            // Wait for position updates to be ready
            if (!window.PositionUpdates.isInitialized) {
                console.log('Trading Site: Waiting for position updates...');
                await new Promise((resolve) => {
                    window.addEventListener('positionUpdatesReady', resolve, { once: true });
                });
            }

            // Subscribe to position updates
            console.log('Trading Site: Subscribing to position updates');
            window.PositionUpdates.subscribe(positions => {
                console.log('Trading Site: Received positions update:', positions);
                this.updatePositionsDisplay(positions);
            });

            // Subscribe to auth state changes
            window.addEventListener('authStateChange', ({ detail }) => {
                this.handleAuthStateChange(detail);
            });

            this.isInitialized = true;
            console.log('Trading Site: Initialized successfully');
            updateStatus('app', 'done', '✅ App: Ready');

            // Hide loading overlay
            document.getElementById('loading-overlay').style.display = 'none';

        } catch (error) {
            console.error('Trading Site initialization error:', error);
            updateStatus('app', 'error', '❌ App: Error');
            throw error;
        }
    },

    async initializeServices() {
        // Initialize services in sequence
        console.log('Initializing services in sequence...');

        let hasErrors = false;

        try {
            // 1. Initialize Supabase
            try {
                await window.supabaseClient.initialize();
                console.log('Supabase initialized');
            } catch (error) {
                console.error('Supabase initialization error:', error);
                hasErrors = true;
                // Continue with other services
            }

            // 2. Initialize Auth
            try {
                await window.auth.initialize();
                console.log('Auth initialized');
            } catch (error) {
                console.error('Auth initialization error:', error);
                hasErrors = true;
                // Continue with other services
            }

            // 3. Initialize Price Updates
            try {
                await window.PriceUpdates.initialize();
                console.log('Price Updates initialized');
            } catch (error) {
                console.error('Price Updates initialization error:', error);
                hasErrors = true;
                // Continue with other services
            }

            // 4. Initialize Position Updates
            try {
                await window.PositionUpdates.initialize();
                console.log('Position Updates initialized');
            } catch (error) {
                console.error('Position Updates initialization error:', error);
                hasErrors = true;
                // Continue with other services
            }

            // Mark as initialized
            this.isInitialized = true;

            // Update status based on initialization results
            if (hasErrors) {
                console.log('Trading Site: Initialized with limited functionality');
                updateStatus('app', 'error', '❌ App: Limited Functionality');
            } else {
                console.log('Trading Site: Initialized successfully');
                updateStatus('app', 'done', '✅ App: Ready');
            }

            // Hide loading overlay
            document.getElementById('loading-overlay').style.display = 'none';

        } catch (error) {
            console.error('Fatal initialization error:', error);
            updateStatus('app', 'error', '❌ App: Error');
            // Continue with very limited functionality
            this.isInitialized = true;
            document.getElementById('loading-overlay').style.display = 'none';
        }
    },

    initializeUI() {
        // Initialize trade form
        const tradeForm = document.getElementById('trade-form');
        if (tradeForm) {
            tradeForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleTradeSubmit();
            });
        }

        // Initialize login button
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                console.log('Login button clicked');
                window.AuthModal.show();
            });
        }

        // Initialize logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                window.auth.signOut();
            });
        }

        // Initialize index select when indices are ready
        if (window.PriceUpdates.indicesReady) {
            this.updateIndexSelect();
        }
        
        // Listen for indices ready event
        window.addEventListener('indicesReady', () => {
            console.log('Indices ready event received');
            this.updateIndexSelect();
        });

        // Also update on price updates ready (backup)
        window.addEventListener('priceUpdatesReady', () => {
            console.log('Price updates ready event received');
            if (window.PriceUpdates.indicesReady) {
                this.updateIndexSelect();
            }
        });
    },

    updateIndexSelect() {
        const indexSelect = document.getElementById('index-select');
        if (!indexSelect) {
            console.error('Index select element not found');
            return;
        }

        // Clear existing options except the first one
        while (indexSelect.options.length > 1) {
            indexSelect.remove(1);
        }

        // Add new options
        const indices = window.PriceUpdates.getIndices();
        console.log('Updating index select with indices:', indices);
        
        indices.forEach(index => {
            const option = document.createElement('option');
            option.value = index.id;
            option.textContent = index.name;
            indexSelect.appendChild(option);
        });

        console.log('Index select updated, now contains', indexSelect.options.length, 'options');
    },

    handlePriceUpdate(update) {
        // Update current prices map
        this.currentPrices.set(update.index_id, update.price);

        // Update indices list display
        const indicesList = document.getElementById('indices-list');
        if (!indicesList) return;

        let indexCard = document.getElementById(`index-${update.index_id}`);
        if (!indexCard) {
            indexCard = document.createElement('div');
            indexCard.id = `index-${update.index_id}`;
            indexCard.className = 'index-card';
            indicesList.appendChild(indexCard);
        }

        // Get previous price to determine change
        const previousPrice = parseFloat(indexCard.dataset.price) || update.price;
        const priceChange = ((update.price - previousPrice) / previousPrice) * 100;
        
        indexCard.dataset.price = update.price;
        indexCard.innerHTML = `
            <div>
                <div class="index-name">${update.name}</div>
                <div class="index-price">$${update.price.toFixed(2)}</div>
            </div>
            <div class="price-change ${priceChange >= 0 ? 'positive' : 'negative'}">
                ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%
            </div>
        `;

        // Update positions display to reflect new prices
        const positions = window.PositionUpdates.getAllPositions();
        this.updatePositionsDisplay(positions);
    },

    updatePositionsDisplay(positions) {
        console.log('Trading Site: Updating positions display with:', positions);
        const positionsList = document.getElementById('positions-list');
        if (!positionsList) {
            console.error('Trading Site: Positions list element not found');
            return;
        }

        // Filter positions for current user
        const userPositions = positions.filter(p => {
            const isCurrentUser = p.user_id === window.auth?.user?.id;
            const isOpen = p.status === 'open';
            console.log('Trading Site: Position filter check:', {
                position: p,
                isCurrentUser,
                isOpen,
                currentUserId: window.auth?.user?.id
            });
            return isCurrentUser && isOpen;
        });

        console.log('Trading Site: Filtered user positions:', userPositions);

        // Update positions count in header
        const positionsHeader = document.querySelector('.positions h2');
        if (positionsHeader) {
            positionsHeader.innerHTML = `
                Open Positions
                <span class="position-count">${userPositions.length} position${userPositions.length !== 1 ? 's' : ''}</span>
            `;
        }

        if (userPositions.length === 0) {
            positionsList.innerHTML = '<div class="empty-state">No open positions</div>';
            return;
        }

        const positionsHtml = userPositions.map(position => {
            console.log('Trading Site: Rendering position:', {
                id: position.id,
                index: position.index_id,
                currentPrice: window.PriceUpdates.getCurrentPrice(position.index_id),
                pnl: window.PositionUpdates.calculatePnL(position)
            });
            
            return `
                <div class="position-card" data-position-id="${position.id}">
                    <div class="position-header">
                        <div class="position-title">${window.PriceUpdates.getIndices().find(i => i.id === position.index_id)?.name || position.index_id}</div>
                        <div class="position-pnl ${window.PositionUpdates.calculatePnL(position) >= 0 ? 'positive' : 'negative'}">
                            ${window.PositionUpdates.calculatePnL(position) >= 0 ? '+' : ''}$${Math.abs(window.PositionUpdates.calculatePnL(position) || 0).toFixed(2)}
                        </div>
                    </div>
                    <div class="position-details">
                        <div>Side: ${position.side.toUpperCase()}</div>
                        <div>Quantity: ${position.quantity}</div>
                        <div>Entry: $${position.entry_price.toFixed(2)}</div>
                        <div>Current: ${(() => {
                            const currentPrice = window.PriceUpdates.getCurrentPrice(position.index_id);
                            return currentPrice ? `$${currentPrice.toFixed(2)}` : '<span class="loading">Loading...</span>';
                        })()}</div>
                    </div>
                    <div class="button-group">
                        <button class="close-pos-btn" onclick="tradingSite.closePosition('${position.id}')">
                            Close Position
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        console.log('Trading Site: Setting positions HTML');
        positionsList.innerHTML = positionsHtml;
    },

    async handleTradeSubmit() {
        try {
            if (!window.auth.user) {
                window.AuthModal.show();
                return;
            }

            const indexId = document.getElementById('index-select').value;
            const side = document.getElementById('order-type').value;
            const quantity = parseInt(document.getElementById('quantity').value, 10);

            if (!indexId || !side || !quantity) {
                throw new Error('Please fill in all fields');
            }

            if (quantity <= 0) {
                throw new Error('Quantity must be positive');
            }

            const position = await window.PositionUpdates.createPosition(
                indexId,
                side,
                quantity
            );

            // Show success message
            const successDiv = document.createElement('div');
            successDiv.className = 'alert alert-success';
            const indexName = window.PriceUpdates.getIndices().find(i => i.id === indexId)?.name || indexId;
            successDiv.textContent = `Successfully opened ${side} position for ${quantity} ${indexName}`;
            document.body.appendChild(successDiv);
            setTimeout(() => successDiv.remove(), 5000);

            // Reset form
            document.getElementById('trade-form').reset();

        } catch (error) {
            console.error('Trade submission error:', error);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger';
            errorDiv.textContent = error.message;
            document.body.appendChild(errorDiv);
            setTimeout(() => errorDiv.remove(), 5000);
        }
    },

    async closePosition(positionId) {
        try {
            await window.PositionUpdates.closePosition(positionId);
            
            const successDiv = document.createElement('div');
            successDiv.className = 'alert alert-success';
            successDiv.textContent = 'Position closed successfully';
            document.body.appendChild(successDiv);
            setTimeout(() => successDiv.remove(), 5000);

        } catch (error) {
            console.error('Close position error:', error);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger';
            errorDiv.textContent = error.message;
            document.body.appendChild(errorDiv);
            setTimeout(() => errorDiv.remove(), 5000);
        }
    },

    handleAuthStateChange(detail) {
        const loginBtn = document.getElementById('login-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const riskDashboardBtn = document.getElementById('risk-dashboard-btn');
        const username = document.getElementById('username');
        const tradeForm = document.getElementById('trade-form');

        if (detail.user) {
            if (loginBtn) loginBtn.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'block';
            if (username) username.textContent = detail.user.email;
            
            // Show Risk Dashboard button for admins and risk managers
            if (riskDashboardBtn) {
                console.log('Checking dashboard access for role:', detail.role);
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
                
                riskDashboardBtn.style.display = hasAccess ? 'block' : 'none';
            }
            
            if (tradeForm) {
                const submitButton = tradeForm.querySelector('button[type="submit"]');
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent = 'Place Order';
                }
            }
        } else {
            if (loginBtn) loginBtn.style.display = 'block';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (riskDashboardBtn) riskDashboardBtn.style.display = 'none';
            if (username) username.textContent = '';
            if (tradeForm) {
                const submitButton = tradeForm.querySelector('button[type="submit"]');
                if (submitButton) {
                    submitButton.disabled = true;
                    submitButton.textContent = 'Login to Trade';
                }
            }
        }
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    tradingSite.initialize().catch(error => {
        console.error('Failed to initialize trading site:', error);
    });
});

// Export for use in other scripts
window.tradingSite = tradingSite;

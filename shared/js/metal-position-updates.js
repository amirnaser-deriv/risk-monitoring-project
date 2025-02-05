// Metal position updates management
window.MetalPositionUpdates = {
    subscribers: [],
    currentPositions: new Map(),
    isInitialized: false,

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Metal Position Updates: Initializing...');
            updateStatus('metalPosition', 'pending', '⏳ Metal Position Updates: Initializing...');

            // Wait for Price Updates since we'll share the same websocket
            if (!window.PriceUpdates?.isInitialized) {
                console.log('Metal Position Updates: Waiting for Price Updates...');
                await new Promise((resolve) => {
                    window.addEventListener('priceUpdatesReady', resolve, { once: true });
                });
            }

            // Wait for websocket to be available
            await this.waitForWebSocket();
            
            // Subscribe to websocket messages through PriceUpdates
            this.setupWebSocketHandlers();

            this.isInitialized = true;
            console.log('Metal Position Updates: Initialized successfully');
            updateStatus('metalPosition', 'done', '✅ Metal Position Updates: Ready');
            window.dispatchEvent(new Event('metalPositionUpdatesReady'));

        } catch (error) {
            console.error('Metal Position Updates initialization error:', error);
            updateStatus('metalPosition', 'error', '❌ Metal Position Updates: Error');
            this.isInitialized = true;
            window.dispatchEvent(new Event('metalPositionUpdatesReady'));
        }
    },

    async waitForWebSocket() {
        if (!window.PriceUpdates?.ws) {
            console.log('Metal Position Updates: Waiting for WebSocket...');
            await new Promise((resolve) => {
                const checkWs = setInterval(() => {
                    if (window.PriceUpdates?.ws) {
                        clearInterval(checkWs);
                        resolve();
                    }
                }, 100);
            });
        }
        console.log('Metal Position Updates: WebSocket available');
    },

    setupWebSocketHandlers() {
        if (!window.PriceUpdates?.ws) {
            console.error('WebSocket not available');
            return;
        }

        const originalOnMessage = window.PriceUpdates.ws.onmessage;
        window.PriceUpdates.ws.onmessage = (event) => {
            // First call the original handler for price updates
            originalOnMessage(event);

            // Then handle position updates
            if (event.data === 'pong') {
                return;
            }

            try {
                const message = JSON.parse(event.data);
                
                if (message.type === 'positions_snapshot') {
                    console.log('Received initial positions snapshot:', message.data);
                    
                    // Clear existing positions first
                    this.currentPositions.clear();
                    
                    // Handle initial positions snapshot
                    Object.entries(message.data).forEach(([index_id, data]) => {
                        console.log(`Processing ${index_id} snapshot:`, data);
                        
                        const position = {
                            gold_positions: data.gold_positions,
                            silver_positions: data.silver_positions,
                            cash_balance: data.cash_balance
                        };
                        
                        this.currentPositions.set(index_id, position);
                        console.log(`Updated ${index_id} position:`, this.currentPositions.get(index_id));
                        
                        this.notifySubscribers({
                            index_id,
                            ...position
                        });
                    });

                    // Log final state after processing snapshot
                    console.log('Current positions after snapshot:', {
                        mtm: this.currentPositions.get('Gold RSI Momentum'),
                        ctn: this.currentPositions.get('Gold RSI Contrarian')
                    });
                } else if (message.type === 'position_update') {
                    // Handle individual position update
                    const { index_id, gold_positions, silver_positions, cash_balance } = message.data;
                    console.log(`Received position update for ${index_id}:`, { 
                        gold_positions,
                        silver_positions,
                        cash_balance,
                        previous: this.currentPositions.get(index_id)
                    });
                    
                    const position = {
                        gold_positions,
                        silver_positions,
                        cash_balance
                    };
                    
                    this.currentPositions.set(index_id, position);
                    console.log(`Updated ${index_id} position:`, this.currentPositions.get(index_id));

                    this.notifySubscribers({
                        index_id,
                        ...position
                    });

                    // Log current state of all positions
                    console.log('Current positions after update:', {
                        mtm: this.currentPositions.get('Gold RSI Momentum'),
                        ctn: this.currentPositions.get('Gold RSI Contrarian')
                    });
                }
            } catch (error) {
                console.error('Error handling WebSocket message:', error);
            }
        };
    },

    subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        this.subscribers.push(callback);

        // Send current positions to new subscriber
        this.currentPositions.forEach((data, index_id) => {
            callback({
                index_id,
                gold_positions: data.gold_positions,
                silver_positions: data.silver_positions,
                cash_balance: data.cash_balance
            });
        });
        
        return () => {
            const index = this.subscribers.indexOf(callback);
            if (index !== -1) {
                this.subscribers.splice(index, 1);
            }
        };
    },

    notifySubscribers(update) {
        console.log(`Notifying ${this.subscribers.length} subscribers of position update:`, update);
        this.subscribers.forEach((callback, index) => {
            try {
                console.log(`Calling subscriber ${index}`);
                callback(update);
                console.log(`Subscriber ${index} notified successfully`);
            } catch (error) {
                console.error(`Error in position update subscriber ${index}:`, error);
            }
        });
    },

    getCurrentPosition(index_id) {
        return this.currentPositions.get(index_id) || null;
    },

    cleanup() {
        this.subscribers = [];
        this.currentPositions.clear();
        this.isInitialized = false;
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.MetalPositionUpdates.initialize().catch(error => {
        console.error('Failed to initialize metal position updates:', error);
    });
});

// Cleanup on page unload
window.addEventListener('unload', () => {
    window.MetalPositionUpdates.cleanup();
});

// Helper function to update initialization status
function updateStatus(component, status, message) {
    const el = document.getElementById(`status-${component}`);
    if (el) {
        el.className = `status-item ${status}`;
        el.textContent = message;
    }
}

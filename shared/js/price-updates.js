// Price updates management
window.PriceUpdates = {
    subscribers: [],
    currentPrices: new Map(),
    isInitialized: false,
    ws: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000, // Start with 1 second
    indicesReady: false,

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Price Updates: Initializing...');
            updateStatus('price', 'pending', '⏳ Price Updates: Initializing...');

            // Wait for Supabase client
            if (!window.supabaseClient?.client) {
                console.log('Price Updates: Waiting for Supabase client...');
                await new Promise((resolve, reject) => {
                    let attempts = 0;
                    const maxAttempts = 50;
                    
                    const checkClient = setInterval(() => {
                        attempts++;
                        if (window.supabaseClient?.client) {
                            clearInterval(checkClient);
                            resolve();
                        } else if (attempts >= maxAttempts) {
                            clearInterval(checkClient);
                            reject(new Error('Supabase client timeout'));
                        }
                    }, 100);

                    window.addEventListener('supabaseReady', () => {
                        clearInterval(checkClient);
                        resolve();
                    }, { once: true });
                });
            }

            // Try to connect to WebSocket server
            try {
                await this.connectWebSocket();
            } catch (error) {
                console.error('Failed to connect to WebSocket:', error);
                // Continue without real-time updates
            }

            this.isInitialized = true;
            console.log('Price Updates: Initialized successfully');
            updateStatus('price', 'done', '✅ Price Updates: Ready');
            window.dispatchEvent(new Event('priceUpdatesReady'));

        } catch (error) {
            console.error('Price Updates initialization error:', error);
            updateStatus('price', 'error', '❌ Price Updates: Error');
            this.isInitialized = true;
            window.dispatchEvent(new Event('priceUpdatesReady'));
        }
    },

    async connectWebSocket() {
        try {
            if (this.ws) {
                this.ws.close();
            }

            this.ws = new WebSocket('ws://localhost:8765');
            let pingInterval;

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                updateStatus('price', 'done', '✅ Price Updates: Connected');

                // Start ping-pong
                pingInterval = setInterval(() => {
                    if (this.ws.readyState === WebSocket.OPEN) {
                        try {
                            this.ws.send('ping');
                        } catch (error) {
                            console.error('Error sending ping:', error);
                            this.ws.close();
                        }
                    }
                }, 15000); // Ping every 15 seconds
            };

            this.ws.onmessage = (event) => {
                // Handle ping-pong messages
                if (event.data === 'pong') {
                    return;
                }

                // Parse JSON messages
                try {
                    const message = JSON.parse(event.data);
                    
                    if (message.type === 'snapshot') {
                        console.log('Received initial snapshot:', message.data);
                        // Handle initial price snapshot
                        Object.entries(message.data).forEach(([index_id, data]) => {
                            console.log(`Setting initial price for ${index_id}:`, data.price);
                            this.currentPrices.set(index_id, data.price);
                            this.notifySubscribers({
                                index_id,
                                price: data.price,
                                name: index_id // Use ID as name for backward compatibility
                            });
                        });
                        
                        // Mark indices as ready and emit event
                        this.indicesReady = true;
                        console.log('Available indices:', this.getIndices());
                        window.dispatchEvent(new Event('indicesReady'));
                    } else if (message.type === 'price_update') {
                        // Handle individual price update
                        const { index_id, price } = message.data;
                        console.log(`Received price update for ${index_id}:`, price);
                        
                        const oldPrice = this.currentPrices.get(index_id);
                        console.log(`Old price for ${index_id}:`, oldPrice);
                        
                        this.currentPrices.set(index_id, price);
                        console.log(`Updated price for ${index_id}:`, this.currentPrices.get(index_id));
                        
                        console.log('Notifying subscribers of price update');
                        this.notifySubscribers({
                            index_id,
                            price,
                            name: index_id // Use ID as name for backward compatibility
                        });
                    }
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                updateStatus('price', 'error', '❌ Price Updates: Disconnected');
                if (pingInterval) {
                    clearInterval(pingInterval);
                }
                // Only attempt reconnect if we're still initialized
                if (this.isInitialized) {
                    this.attemptReconnect();
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                updateStatus('price', 'error', '❌ Price Updates: Error');
                // Close the connection on error to trigger reconnect
                this.ws.close();
            };

        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.attemptReconnect();
        }
    },

    async attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            updateStatus('price', 'error', '❌ Price Updates: Connection failed');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
        console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
        updateStatus('price', 'pending', `⏳ Price Updates: Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        await new Promise(resolve => setTimeout(resolve, delay));
        await this.connectWebSocket();
    },

    subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        this.subscribers.push(callback);

        // Send current prices to new subscriber
        this.currentPrices.forEach((price, index_id) => {
            callback({
                index_id,
                price
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
        console.log(`Notifying ${this.subscribers.length} subscribers of update:`, update);
        this.subscribers.forEach((callback, index) => {
            try {
                console.log(`Calling subscriber ${index}`);
                callback(update);
                console.log(`Subscriber ${index} notified successfully`);
            } catch (error) {
                console.error(`Error in price update subscriber ${index}:`, error);
            }
        });
    },

    getCurrentPrice(index_id) {
        return this.currentPrices.get(index_id) || null;
    },

    getIndices() {
        // Return empty array if no indices are loaded
        if (this.currentPrices.size === 0) {
            return [];
        }

        // Return indices from WebSocket data
        return Array.from(this.currentPrices.keys()).map(id => ({
            id,
            name: id.replace('RSI_Gold_mtm', 'Gold RSI Momentum')
                  .replace('RSI_Gold_ctn', 'Gold RSI Contrarian')
                  .replace('Gold', 'Gold Price')
        }));
    },

    cleanup() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.subscribers = [];
        this.currentPrices.clear();
        this.isInitialized = false;
        this.indicesReady = false;
        this.reconnectAttempts = 0;
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.PriceUpdates.initialize().catch(error => {
        console.error('Failed to initialize price updates:', error);
    });
});

// Cleanup on page unload
window.addEventListener('unload', () => {
    window.PriceUpdates.cleanup();
});

// Helper function to update initialization status
function updateStatus(component, status, message) {
    const el = document.getElementById(`status-${component}`);
    if (el) {
        el.className = `status-item ${status}`;
        el.textContent = message;
    }
}

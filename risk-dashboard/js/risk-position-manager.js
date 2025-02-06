// Risk dashboard position management
window.RiskPositionManager = {
    positions: new Map(),
    subscribers: [],
    isInitialized: false,

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Risk Position Manager: Initializing...');

            // Wait for auth to be ready
            if (!window.auth?.isInitialized) {
                console.log('Risk Position Manager: Waiting for auth...');
                await new Promise((resolve) => {
                    window.addEventListener('authReady', resolve, { once: true });
                });
            }

            // Only proceed if user has risk manager or admin role
            const hasRiskManagerRole = window.auth?.hasRole('risk_manager');
            const hasAdminRole = window.auth?.hasRole('admin');
            console.log('Role check:', {
                hasRiskManagerRole,
                hasAdminRole,
                user: window.auth?.user,
                role: window.auth?.user?.role
            });

            if (!hasRiskManagerRole && !hasAdminRole) {
                console.log('Risk Position Manager: User does not have required role');
                return;
            }

            // Wait for Supabase to be ready
            if (!window.supabaseClient?.client) {
                console.log('Risk Position Manager: Waiting for Supabase...');
                await new Promise((resolve) => {
                    window.addEventListener('supabaseReady', resolve, { once: true });
                });
            }

            // Load initial positions
            await this.loadPositions();

            // Set up subscription for real-time updates
            this.channelName = `risk_positions_${Date.now()}`;
            this.channel = window.supabaseClient.client
                .channel(this.channelName)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'positions',
                    filter: 'status=eq.open'  // Only subscribe to open positions
                }, async payload => {
                    console.log('Position change received:', payload);
                    
                    try {
                        switch (payload.eventType) {
                            case 'INSERT':
                                // Fetch full position data with user info
                                const { data: newPosition, error: newError } = await window.supabaseClient.client
                                    .from('positions')
                .select('*')
                                    .eq('id', payload.new.id)
                                    .single();

                                if (newError) {
                                    console.error('Error fetching new position:', newError);
                                } else if (newPosition && newPosition.status === 'open') {
                                    console.log('Adding new position:', newPosition);
                                    this.positions.set(newPosition.id, newPosition);
                                    this.notifySubscribers();
                                }
                                break;
                                
                            case 'UPDATE':
                                if (payload.new?.status === 'closed') {
                                    console.log('Removing closed position:', payload.new.id);
                                    this.positions.delete(payload.new.id);
                                    this.notifySubscribers();
                                } else {
                                    // Fetch updated position data with user info
                                    const { data: updatedPosition, error: updateError } = await window.supabaseClient.client
                                        .from('positions')
                                    .select('*')
                                        .eq('id', payload.new.id)
                                        .single();

                                    if (updateError) {
                                        console.error('Error fetching updated position:', updateError);
                                    } else if (updatedPosition && updatedPosition.status === 'open') {
                                        console.log('Updating position:', updatedPosition);
                                        this.positions.set(updatedPosition.id, updatedPosition);
                                        this.notifySubscribers();
                                    }
                                }
                                break;
                                
                            case 'DELETE':
                                if (payload.old) {
                                    console.log('Removing deleted position:', payload.old.id);
                                    this.positions.delete(payload.old.id);
                                    this.notifySubscribers();
                                }
                                break;
                        }
                    } catch (error) {
                        console.error('Error handling position change:', error);
                    }
                });

            // Subscribe to price updates
            window.PriceUpdates.subscribe((update) => {
                this.updatePositionPrices(update.index_id, update.price);
            });

            // Subscribe to channel
            try {
                const status = await this.channel.subscribe();
                console.log('Risk position channel status:', status);
            } catch (error) {
                console.error('Risk position channel subscription error:', error);
            }

            this.isInitialized = true;
            console.log('Risk Position Manager: Initialized successfully');
            console.log('Current positions:', Array.from(this.positions.values()));

            // Dispatch both events to ensure compatibility
            window.dispatchEvent(new Event('riskPositionManagerReady'));
            window.dispatchEvent(new Event('positionUpdatesReady'));

        } catch (error) {
            console.error('Risk Position Manager initialization error:', error);
            this.positions.clear();
            this.notifySubscribers();
        }
    },

    async loadPositions() {
        try {
            console.log('Loading all open positions');

            // Load all open positions with user info - policy will handle access control
            const { data, error } = await window.supabaseClient.client
                .from('positions')
                                        .select('*')
                .eq('status', 'open')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading positions:', error);
                this.positions.clear();
                this.notifySubscribers();
                return;
            }

            console.log('Loaded positions from database:', data);

            this.positions.clear();
            if (data) {
                data.forEach(position => {
                    console.log('Setting position:', position);
                    this.positions.set(position.id, position);
                });
            }

            console.log('Current positions in memory:', Array.from(this.positions.values()));
            this.notifySubscribers();

        } catch (error) {
            console.error('Failed to load positions:', error);
            this.positions.clear();
            this.notifySubscribers();
        }
    },

    updatePositionPrices(index_id, price) {
        let hasMatchingPositions = false;
        this.positions.forEach(position => {
            // Normalize the position's index ID
            const normalizedId = position.index_id
                .replace('RSI_', '')
                .replace('_mtm', ' RSI Momentum')
                .replace('_ctn', ' RSI Contrarian');
            
            // Normalize metal names
            const normalizedMetalId = position.index_id
                .replace('Gold', 'Gold Price')
                .replace('Silver', 'Silver Price');

            // Check if this position should update based on the price update
            if (normalizedMetalId === index_id || 
                (normalizedId === 'Gold RSI Momentum' && index_id === 'Gold Price') ||
                (normalizedId === 'Gold RSI Contrarian' && index_id === 'Gold Price') ||
                (normalizedId === 'Silver RSI Momentum' && index_id === 'Silver Price') ||
                (normalizedId === 'Silver RSI Contrarian' && index_id === 'Silver Price')) {
                hasMatchingPositions = true;
            }
        });

        if (hasMatchingPositions) {
            console.log(`Updating positions for price update: ${index_id} = ${price}`);
            this.notifySubscribers();
        }
    },

    calculatePnL(position) {
        try {
            // Normalize RSI index names to match feed-engine format
            const normalizedId = position.index_id
                .replace('RSI_', '')
                .replace('_mtm', ' RSI Momentum')
                .replace('_ctn', ' RSI Contrarian');
            
            let currentPrice;
            // Normalize metal names
            const normalizedMetalId = position.index_id
                .replace('Gold', 'Gold Price')
                .replace('Silver', 'Silver Price');
                
            if (normalizedId === 'Gold RSI Momentum' || normalizedId === 'Gold RSI Contrarian') {
                currentPrice = window.PriceUpdates.getCurrentPrice('Gold Price');
            } else if (normalizedId === 'Silver RSI Momentum' || normalizedId === 'Silver RSI Contrarian') {
                currentPrice = window.PriceUpdates.getCurrentPrice('Silver Price');
            } else {
                currentPrice = window.PriceUpdates.getCurrentPrice(normalizedMetalId);
            }

            if (!currentPrice) {
                console.warn(`No current price for ${position.index_id} (normalized: ${normalizedId})`);
                return 0;
            }
            
            const multiplier = position.side === 'buy' ? 1 : -1;
            return multiplier * position.quantity * (currentPrice - position.entry_price);
        } catch (error) {
            console.error('Error calculating PnL:', error);
            return 0;
        }
    },

    subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        console.log('Adding subscriber, current positions:', Array.from(this.positions.values()));
        this.subscribers.push(callback);
        callback(Array.from(this.positions.values()));
        
        return () => {
            const index = this.subscribers.indexOf(callback);
            if (index !== -1) {
                this.subscribers.splice(index, 1);
            }
        };
    },

    notifySubscribers() {
        const positions = Array.from(this.positions.values());
        console.log('Notifying subscribers with positions:', positions);
        this.subscribers.forEach(callback => {
            try {
                callback(positions);
            } catch (error) {
                console.error('Error in position update subscriber:', error);
            }
        });
    },

    getAllPositions() {
        return Array.from(this.positions.values());
    },

    cleanup() {
        this.positions.clear();
        this.subscribers = [];
        if (this.channel) {
            this.channel.unsubscribe().catch(console.error);
        }
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.RiskPositionManager.initialize().catch(error => {
        console.error('Failed to initialize risk position manager:', error);
    });
});

// Cleanup on page unload
window.addEventListener('unload', () => {
    window.RiskPositionManager.cleanup();
});

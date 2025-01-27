// Position updates management
window.PositionUpdates = {
    positions: new Map(),
    subscribers: [],
    isInitialized: false,

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Position Updates: Initializing...');
            updateStatus('position', 'pending', '⏳ Position Updates: Initializing...');

            // Wait for auth to be ready
            if (!window.auth?.isInitialized) {
                console.log('Position Updates: Waiting for auth...');
                await new Promise((resolve) => {
                    window.addEventListener('authReady', resolve, { once: true });
                });
            }

            // Initialize in guest mode if no user
            if (!window.auth?.user) {
                console.log('Position Updates: Initializing in guest mode');
                this.positions.clear();
                this.notifySubscribers();
                this.isInitialized = true;
                updateStatus('position', 'done', '✅ Position Updates: Ready (Guest)');
                window.dispatchEvent(new Event('positionUpdatesReady'));
                return;
            }

            // Wait for Supabase to be ready
            if (!window.supabaseClient?.client) {
                console.log('Position Updates: Waiting for Supabase...');
                await new Promise((resolve) => {
                    window.addEventListener('supabaseReady', resolve, { once: true });
                });
            }

            // Load initial positions
            console.log('Loading initial positions...');
            try {
                await this.loadPositions();
            } catch (error) {
                console.error('Failed to load initial positions:', error);
                // Continue with empty positions
                this.positions.clear();
                this.notifySubscribers();
            }

            // Set up subscription for real-time updates
            this.channelName = `positions_${Date.now()}`;
            this.channel = window.supabaseClient.client
                .channel(this.channelName)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'positions',
                    filter: `user_id=eq.${window.auth.user.id},status=eq.open`  // Only user's positions
                }, async payload => {
                    console.log('Position change:', payload);
                    
                    try {
                        const handlePosition = (position) => {
                            return position;
                        };

                        switch (payload.eventType) {
                            case 'INSERT':
                                const newPosition = handlePosition(payload.new);
                                this.positions.set(newPosition.id, newPosition);
                                this.notifySubscribers();
                                break;
                                
                            case 'UPDATE':
                                if (payload.new?.status === 'closed') {
                                    this.positions.delete(payload.new.id);
                                } else {
                                    const updatedPosition = handlePosition(payload.new);
                                    this.positions.set(updatedPosition.id, updatedPosition);
                                }
                                this.notifySubscribers();
                                break;
                                
                            case 'DELETE':
                                if (payload.old) {
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
            console.log('Subscribing to price updates...');
            window.PriceUpdates.subscribe((update) => {
                console.log('Received price update:', update);
                this.updatePositionPrices(update.index_id, update.price);
            });

            // Then subscribe to channel
            try {
                const status = await this.channel.subscribe();
                console.log('Position channel status:', status);
            } catch (error) {
                console.error('Channel subscription error:', error);
                // Continue without real-time updates
            }

            // Handle auth state changes
            window.addEventListener('authStateChange', async ({ detail }) => {
                if (detail.event === 'SIGNED_IN' || detail.event === 'INITIAL_SESSION') {
                    console.log('Auth state changed, reinitializing position updates');
                    try {
                        // Unsubscribe from old channel if it exists
                        if (this.channel) {
                            await this.channel.unsubscribe();
                        }

                        // Create new channel with current user
                        this.channelName = `positions_${Date.now()}`;
                        this.channel = window.supabaseClient.client
                            .channel(this.channelName)
                            .on('postgres_changes', {
                                event: '*',
                                schema: 'public',
                                table: 'positions',
                                filter: `user_id=eq.${window.auth.user.id},status=eq.open`  // Only user's positions
                            }, async payload => {
                                console.log('Position change:', payload);
                                try {
                                    const handlePosition = (position) => {
                                        return position;
                                    };

                                    switch (payload.eventType) {
                                        case 'INSERT':
                                            const newPosition = handlePosition(payload.new);
                                            this.positions.set(newPosition.id, newPosition);
                                            this.notifySubscribers();
                                            break;
                                            
                                        case 'UPDATE':
                                            if (payload.new?.status === 'closed') {
                                                this.positions.delete(payload.new.id);
                                            } else {
                                                const updatedPosition = handlePosition(payload.new);
                                                this.positions.set(updatedPosition.id, updatedPosition);
                                            }
                                            this.notifySubscribers();
                                            break;
                                            
                                        case 'DELETE':
                                            if (payload.old) {
                                                this.positions.delete(payload.old.id);
                                                this.notifySubscribers();
                                            }
                                            break;
                                    }
                                } catch (error) {
                                    console.error('Error handling position change:', error);
                                }
                            });

                        await this.channel.subscribe();
                        console.log('Resubscribed to position updates');

                        // Load positions after resubscribing
                        await this.loadPositions();
                        console.log('Positions reloaded after auth change');
                    } catch (error) {
                        console.error('Error reinitializing position updates:', error);
                    }
                } else if (detail.event === 'SIGNED_OUT') {
                    console.log('User signed out, cleaning up position updates');
                    if (this.channel) {
                        await this.channel.unsubscribe();
                    }
                    this.positions.clear();
                    this.notifySubscribers();
                }
            });

            this.isInitialized = true;
            console.log('Position Updates: Initialized successfully');
            updateStatus('position', 'done', '✅ Position Updates: Ready');
            window.dispatchEvent(new Event('positionUpdatesReady'));

        } catch (error) {
            console.error('Position Updates initialization error:', error);
            // Initialize with empty state
            this.positions.clear();
            this.notifySubscribers();
            this.isInitialized = true;
            updateStatus('position', 'error', '❌ Position Updates: Error');
            window.dispatchEvent(new Event('positionUpdatesReady'));
        }
    },

    async loadPositions() {
        try {
            if (!window.auth?.user) {
                console.log('No authenticated user, skipping position load');
                this.positions.clear();
                this.notifySubscribers();
                return;
            }

            console.log('Loading positions for user:', window.auth.user.id);

            // Load user's positions
            const { data, error } = await window.supabaseClient.client
                .from('positions')
                .select('*')
                .eq('status', 'open')
                .eq('user_id', window.auth.user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('Error loading positions:', error);
                // Continue with empty positions
                this.positions.clear();
                this.notifySubscribers();
                return;
            }

            console.log('Loaded positions from database:', data);

            this.positions.clear();
            if (data) {
                data.forEach(position => {
                    // Get current price from price feed
                    const currentPrice = window.PriceUpdates.getCurrentPrice(position.index_id);
                    console.log(`Current price for ${position.index_id}:`, currentPrice);
                    
                    // Store position in memory
                    this.positions.set(position.id, position);
                });
            }

            console.log('Current positions in memory:', Array.from(this.positions.values()));
            this.notifySubscribers();

        } catch (error) {
            console.error('Failed to load positions:', error);
            // Continue with empty positions
            this.positions.clear();
            this.notifySubscribers();
        }
    },

    updatePositionPrices(index_id, price) {
        // Check if we have any positions for this index
        let hasMatchingPositions = false;
        this.positions.forEach(position => {
            if (position.index_id === index_id) {
                hasMatchingPositions = true;
            }
        });

        // Only notify if we have positions for this index
        if (hasMatchingPositions) {
            console.log(`Notifying subscribers of price update for ${index_id}: ${price}`);
            this.notifySubscribers();
        }
    },

    calculatePnL(position) {
        try {
            const currentPrice = window.PriceUpdates.getCurrentPrice(position.index_id);
            if (!currentPrice) {
                console.warn(`No current price available for ${position.index_id}, using entry price`);
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

    getPosition(id) {
        return this.positions.get(id) || null;
    },

    async createPosition(indexId, side, quantity) {
        if (!window.auth?.user) {
            window.AuthModal.show();
            throw new Error('Please log in to trade');
        }

        const currentPrice = window.PriceUpdates.getCurrentPrice(indexId);
        if (!currentPrice) {
            throw new Error('Invalid index or price not available');
        }

        try {
            console.log('Creating position:', {
                indexId,
                side,
                quantity,
                currentPrice,
                userId: window.auth.user.id
            });

            // Create position in database (only static data)
            const { data, error } = await window.supabaseClient.client
                .from('positions')
                .insert([{
                    user_id: window.auth.user.id,
                    index_id: indexId,
                    side: side,
                    quantity: quantity,
                    entry_price: currentPrice,
                    status: 'open',
                    created_at: new Date().toISOString()
                }])
                .select('*')
                .single();

            if (error) {
                console.error('Database error creating position:', error);
                throw error;
            }

            if (!data) {
                throw new Error('No data returned from position creation');
            }

            console.log('Position created successfully:', data);

            // Store position in memory
            const position = data;
            this.positions.set(data.id, position);

            // Notify subscribers to update UI
            this.notifySubscribers();
            
            return data;
        } catch (error) {
            console.error('Failed to create position:', error);
            throw new Error('Failed to create position. Please try again.');
        }
    },

    async closePosition(id) {
        if (!window.auth?.user) {
            throw new Error('Must be logged in to close positions');
        }

        const position = this.positions.get(id);
        if (!position) {
            throw new Error('Position not found');
        }

        try {
            const { data, error } = await window.supabaseClient.client
                .from('positions')
                .update({
                    status: 'closed',
                    closed_at: new Date().toISOString(),
                    final_pnl: this.calculatePnL(position)
                })
                .eq('id', id)
                .select('*')
                .single();

            if (error) throw error;
            
            // Update local state immediately
            this.positions.delete(id);
            this.notifySubscribers();
            
            return data;
        } catch (error) {
            console.error('Failed to close position:', error);
            throw new Error('Failed to close position. Please try again.');
        }
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
    window.PositionUpdates.initialize().catch(error => {
        console.error('Failed to initialize position updates:', error);
    });
});

// Cleanup on page unload
window.addEventListener('unload', () => {
    window.PositionUpdates.cleanup();
});

// Helper function to update initialization status
function updateStatus(component, status, message) {
    const el = document.getElementById(`status-${component}`);
    if (el) {
        el.className = `status-item ${status}`;
        el.textContent = message;
    }
}

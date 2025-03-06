// Singleton Supabase client
let supabaseInstance = null;

// Import configuration
import config from './config.js';

const supabaseUrl = config.SUPABASE_URL;
const supabaseAnonKey = config.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing required configuration values SUPABASE_URL and/or SUPABASE_ANON_KEY in config.js');
}

const supabaseClient = {
    client: null,
    isInitialized: false,
    memoryStorage: {}, // In-memory storage for session

    getClient() {
        if (!supabaseInstance) {
            supabaseInstance = supabase.createClient(supabaseUrl, supabaseAnonKey, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: false,
                    storage: {
                        getItem: (key) => {
                            try {
                                return window.sessionStorage.getItem(key);
                            } catch (e) {
                                console.warn('Session storage access error:', e);
                                return null;
                            }
                        },
                        setItem: (key, value) => {
                            try {
                                window.sessionStorage.setItem(key, value);
                            } catch (e) {
                                console.warn('Session storage access error:', e);
                            }
                        },
                        removeItem: (key) => {
                            try {
                                window.sessionStorage.removeItem(key);
                            } catch (e) {
                                console.warn('Session storage access error:', e);
                            }
                        }
                    }
                },
                realtime: {
                    params: {
                        eventsPerSecond: 10
                    }
                },
                global: {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            });

            // Set up auth state change listener to update headers
            supabaseInstance.auth.onAuthStateChange((event, session) => {
                if (session) {
                    supabaseInstance.rest.headers = {
                        'Authorization': `Bearer ${session.access_token}`,
                        'apikey': supabaseAnonKey
                    };
                } else {
                    supabaseInstance.rest.headers = {
                        'apikey': supabaseAnonKey
                    };
                }
            });
        }
        return supabaseInstance;
    },
    
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Supabase: Creating client...');
            updateStatus('supabase', 'pending', '⏳ Supabase: Connecting...');
            
            // Check if Supabase is loaded
            if (typeof supabase === 'undefined') {
                throw new Error('Supabase library not loaded');
            }
            
            // Get or create Supabase client
            console.log('Supabase: Creating client with URL:', supabaseUrl);
            this.client = this.getClient();

            // Get initial session and set headers
            const { data: sessionData, error: sessionError } = await this.client.auth.getSession();
            const session = sessionData?.session;
            if (sessionError) {
                console.warn('No active session:', sessionError.message);
            } else if (session) {
                console.log('Active session found:', session?.user?.email);
                this.client.rest.headers = {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'apikey': supabaseAnonKey
                };
            }
            
            // Test connection with a simple query
            console.log('Supabase: Testing connection...');
            const { data: testData, error } = await this.client
                .from('indices')
                .select('id')
                .limit(1)
                .throwOnError();
            
            if (error) {
                console.error('Supabase connection test failed:', error);
                updateStatus('supabase', 'error', '❌ Supabase: Connection failed');
                throw error;
            }

            console.log('Supabase: Connection test successful, data:', testData);
            
            // Set up real-time subscriptions
            console.log('Supabase: Setting up subscriptions...');
            await this.setupSubscriptions();
            
            this.isInitialized = true;
            console.log('Supabase: Initialized successfully');
            updateStatus('supabase', 'done', '✅ Supabase: Connected');
            window.dispatchEvent(new Event('supabaseReady'));
            
        } catch (error) {
            console.error('Supabase initialization error:', error);
            updateStatus('supabase', 'error', `❌ Supabase: ${error.message}`);
            this.isInitialized = false;
            throw error;
        }
    },

    async setupSubscriptions() {
        console.log('Supabase: Setting up subscriptions...');
        
        try {
            // Create channel with all subscriptions
            const channel = this.client.channel('db-changes');

            // Add index updates subscription
            channel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'indices' },
                payload => {
                    console.log('Index update received:', payload);
                    window.dispatchEvent(new CustomEvent('indexUpdate', {
                        detail: {
                            new: payload.new,
                            old: payload.old,
                            eventType: payload.eventType
                        }
                    }));
                }
            );

            // Subscribe to channel
            const status = await channel.subscribe((status) => {
                console.log('Channel status changed:', status);
            });

            console.log('Initial channel status:', status);

            // Don't throw on non-SUBSCRIBED status, just log warning
            if (status !== 'SUBSCRIBED') {
                console.warn(`Channel not in SUBSCRIBED state: ${status}`);
            }

            return status;
        } catch (error) {
            console.error('Error setting up subscriptions:', error);
            // Continue without real-time updates
            return null;
        }
    },

    // Data operations
    async getIndices() {
        try {
            const { data, error } = await this.client
                .from('indices')
                .select('*')
                .order('name');
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Failed to fetch indices:', error);
            return [];
        }
    },

    async getPositions(userId = null) {
        try {
            let query = this.client
                .from('positions')
                .select(`
                    *,
                    indices (
                        name,
                        current_price
                    )
                `)
                .order('created_at', { ascending: false });

            if (userId) {
                query = query.eq('user_id', userId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Failed to fetch positions:', error);
            return [];
        }
    },

    async createPosition(position) {
        try {
            const { data, error } = await this.client
                .from('positions')
                .insert([position])
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Failed to create position:', error);
            throw error;
        }
    },

    async updatePosition(id, updates) {
        try {
            const { data, error } = await this.client
                .from('positions')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Failed to update position:', error);
            throw error;
        }
    },

    async closePosition(id) {
        try {
            const { data, error } = await this.client
                .from('positions')
                .update({
                    status: 'closed',
                    closed_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Failed to close position:', error);
            throw error;
        }
    }
};

// Helper function to update initialization status
function updateStatus(component, status, message) {
    const el = document.getElementById(`status-${component}`);
    if (el) {
        el.className = `status-item ${status}`;
        el.textContent = message;
    }
}

// Export singleton instance
if (!window.supabaseClient) {
    window.supabaseClient = supabaseClient;
    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('DOM loaded, initializing Supabase...');
            supabaseClient.initialize().catch(error => {
                console.error('Failed to initialize Supabase:', error);
            });
        });
    } else {
        console.log('DOM already loaded, initializing Supabase...');
        supabaseClient.initialize().catch(error => {
            console.error('Failed to initialize Supabase:', error);
        });
    }
}

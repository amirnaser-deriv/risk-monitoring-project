// Singleton Supabase client
let supabaseInstance = null;

const supabaseUrl = 'https://jnnybkqyodxofussidmx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impubnlia3F5b2R4b2Z1c3NpZG14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU3MTM5MjAsImV4cCI6MjA1MTI4OTkyMH0.pqr5IZgiKfS9pSv7uRI32pf8PicJ6M9R8jOg8p9WimY';

const supabaseClient = {
    client: null,
    isInitialized: false,
    memoryStorage: {}, // In-memory storage for session

    getClient() {
        if (!supabaseInstance) {
            supabaseInstance = supabase.createClient(supabaseUrl, supabaseAnonKey, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true, // Persist session in sessionStorage
                    detectSessionInUrl: false,
                    storage: {
                        // Use sessionStorage instead of localStorage
                        getItem: (key) => sessionStorage.getItem(key),
                        setItem: (key, value) => sessionStorage.setItem(key, value),
                        removeItem: (key) => sessionStorage.removeItem(key)
                    }
                },
                realtime: {
                    params: {
                        eventsPerSecond: 10
                    }
                },
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${supabaseAnonKey}`
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

            // Get initial session
            const { data: { session }, error: sessionError } = await this.client.auth.getSession();
            if (sessionError) {
                console.warn('No active session:', sessionError.message);
            } else if (session) {
                console.log('Active session found:', session.user.email);
            }
            
            // Test connection with a simple query
            console.log('Supabase: Testing connection...');
            const { data, error } = await this.client
                .from('indices')
                .select('id')
                .limit(1)
                .throwOnError();
            
            if (error) {
                console.error('Supabase connection test failed:', error);
                updateStatus('supabase', 'error', '❌ Supabase: Connection failed');
                throw error;
            }

            console.log('Supabase: Connection test successful, data:', data);
            
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

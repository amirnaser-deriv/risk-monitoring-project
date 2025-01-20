// Auth management
const auth = {
    user: null,
    isInitialized: false,
    
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            console.log('Auth: Initializing...');
            updateStatus('auth', 'pending', '⏳ Auth: Initializing...');
            
            // Wait for Supabase to be ready
            if (!window.supabaseClient?.client) {
                console.log('Auth: Waiting for Supabase client...');
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
            
            // Get initial session
            const { data: { session }, error: sessionError } = 
                await window.supabaseClient.client.auth.getSession();

            if (sessionError) throw sessionError;

            if (session) {
                await this.loadUserProfile(session.user);
            }

            // Set up auth state change listener
            window.supabaseClient.client.auth.onAuthStateChange(async (event, session) => {
                console.log('Auth state changed:', event, session);
                
                if (session?.user) {
                    console.log('Session user found, loading profile...');
                    await this.loadUserProfile(session.user);
                    console.log('Profile loaded, user object:', this.user);

                    // Store role in sessionStorage for persistence
                    if (this.user?.role) {
                        sessionStorage.setItem('userRole', this.user.role);
                        console.log('Stored role in session:', this.user.role);
                    }
                } else {
                    console.log('No session user, clearing user object');
                    this.user = null;
                    sessionStorage.removeItem('userRole');
                }

                // Dispatch auth state change event
                const eventDetail = {
                    user: this.user,
                    event,
                    role: this.user?.role || sessionStorage.getItem('userRole') || 'client'
                };
                console.log('Dispatching auth state change event:', eventDetail);
                window.dispatchEvent(new CustomEvent('authStateChange', {
                    detail: eventDetail
                }));

                // Reinitialize position updates after login
                if (event === 'SIGNED_IN' && this.user) {
                    console.log('Reinitializing position updates after login');
                    window.PositionUpdates.isInitialized = false;
                    await window.PositionUpdates.initialize();
                }

                // Handle sign out
                if (event === 'SIGNED_OUT') {
                    console.log('User signed out, clearing session data');
                    sessionStorage.clear();
                    this.user = null;
                }
            });
            
            this.isInitialized = true;
            console.log('Auth: Initialized successfully');
            updateStatus('auth', 'done', '✅ Auth: Ready');
            window.dispatchEvent(new Event('authReady'));
            
        } catch (error) {
            console.error('Auth initialization error:', error);
            updateStatus('auth', 'error', '❌ Auth: Error');
            this.isInitialized = true;
            window.dispatchEvent(new Event('authReady'));
        }
    },

    async loadUserProfile(user) {
        try {
            console.log('Loading user profile for:', user.id);
            
            // First check if profiles table exists
            const { error: tableError } = await window.supabaseClient.client
                .from('profiles')
                .select('count')
                .limit(1);

            if (tableError) {
                console.error('Profiles table check error:', tableError);
                throw new Error('Profiles table may not exist or is not accessible');
            }

            // Then try to get the user's profile
            const { data: profile, error: profileError } = 
                await window.supabaseClient.client
                    .from('profiles')
                    .select('id, role, created_at')  // Explicitly select columns
                    .eq('id', user.id)
                    .single();

            console.log('Profile query result:', { profile, profileError });

            if (profileError) {
                console.error('Profile query error:', profileError);
                throw profileError;
            }

            // Create profile if it doesn't exist
            if (!profile) {
                console.log('No profile found, creating new profile');
                const { data: newProfile, error: createError } = 
                    await window.supabaseClient.client
                        .from('profiles')
                        .insert([{
                            id: user.id,
                            role: 'client',
                            created_at: new Date().toISOString()
                        }])
                        .select()
                        .single();

                if (createError) {
                    console.error('Profile creation error:', createError);
                    throw createError;
                }
                
                console.log('Created new profile:', newProfile);
                this.user = {
                    ...user,
                    role: newProfile.role
                };
            } else {
                console.log('Using existing profile:', profile);
                this.user = {
                    ...user,
                    role: profile.role
                };
            }

            console.log('Final user object:', this.user);

        } catch (error) {
            console.error('Error loading profile:', error);
            this.user = {
                ...user,
                role: 'client'
            };
        }
    },
    
    async signIn(email, password) {
        try {
            const { data, error } = await window.supabaseClient.client.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) throw error;

            await this.loadUserProfile(data.user);
            this.showSuccess('Signed in successfully');
            return { user: this.user };
        } catch (error) {
            console.error('Sign in error:', error);
            this.showError(error.message);
            throw error;
        }
    },
    
    async signUp(email, password, role = 'client') {
        try {
            console.log('Attempting signup with:', { email, role });
            
            // 1. Sign up the user
            const { data, error } = await window.supabaseClient.client.auth.signUp({
                email,
                password
            });

            if (error) throw error;
            if (!data?.user) throw new Error('No user data returned from signup');

            console.log('Auth signup successful, creating profile...');

            // 2. Create profile with role
            const { data: profile, error: profileError } = await window.supabaseClient.client
                .from('profiles')
                .insert([{
                    id: data.user.id,
                    role: role,
                    created_at: new Date().toISOString()
                }])
                .select()
                .single();

            if (profileError) {
                console.error('Error creating profile:', profileError);
                throw profileError;
            }

            console.log('Profile created successfully:', profile);

            // 3. Load the profile to ensure everything is set correctly
            await this.loadUserProfile(data.user);

            this.showSuccess('Signed up successfully! Please check your email for verification.');
            return { ...data, profile };
        } catch (error) {
            console.error('Sign up error:', error);
            this.showError(error.message);
            throw error;
        }
    },
    
    async signOut() {
        try {
            const { error } = await window.supabaseClient.client.auth.signOut();
            if (error) throw error;
            
            // Clear all session data
            sessionStorage.clear();
            this.user = null;
            this.showSuccess('Signed out successfully');
            
            // Reload page to reset application state
            window.location.reload();
        } catch (error) {
            console.error('Sign out error:', error);
            this.showError(error.message);
            throw error;
        }
    },
    
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-danger';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    },
    
    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'alert alert-success';
        successDiv.textContent = message;
        document.body.appendChild(successDiv);
        setTimeout(() => successDiv.remove(), 5000);
    },

    // Role-based access control with role hierarchy
    hasRole(requiredRole) {
        // First check session storage for role if user object is not available
        const userRole = this.user?.role || sessionStorage.getItem('userRole');
        console.log('Checking role access:', { userRole, requiredRole });
        
        if (!userRole) {
            console.log('No user role found');
            return false;
        }

        // Define role hierarchy
        const roleHierarchy = {
            admin: ['admin', 'risk_manager', 'client'],      // Admins can do everything
            risk_manager: ['risk_manager', 'client'],        // Risk managers can access risk features and client features
            client: ['client']                               // Clients can only access client features
        };

        console.log('Role hierarchy check:', {
            userRole,
            requiredRole,
            allowedRoles: roleHierarchy[userRole],
            hasAccess: roleHierarchy[userRole]?.includes(requiredRole)
        });

        const hasAccess = roleHierarchy[userRole]?.includes(requiredRole) || false;
        console.log('Role access check result:', { 
            userRole, 
            requiredRole, 
            allowedRoles: roleHierarchy[userRole],
            hasAccess 
        });

        return hasAccess;
    },

    requireRole(requiredRole) {
        if (!this.user) {
            window.AuthModal.show();
            return false;
        }
        
        if (!this.hasRole(requiredRole)) {
            this.showError(`Access denied. ${requiredRole} role required.`);
            return false;
        }
        
        return true;
    }
};

// Initialize auth when Supabase is ready
window.addEventListener('supabaseReady', () => {
    console.log('Auth: Supabase ready event received');
    window.auth = auth;
    auth.initialize().catch(error => {
        console.error('Failed to initialize auth:', error);
    });
});

// Export for use in other scripts
window.auth = auth;

// Helper function to update initialization status
function updateStatus(component, status, message) {
    const el = document.getElementById(`status-${component}`);
    if (el) {
        el.className = `status-item ${status}`;
        el.textContent = message;
    }
}

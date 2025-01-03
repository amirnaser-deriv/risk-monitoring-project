console.log('Loading auth module...');

// Auth state
let currentUser = null;

// Initialize auth module
async function initAuth() {
    try {
        console.log('Initializing auth...');
        
        // Wait for Supabase client to be ready
        if (!window.supabaseClient?.ready) {
            throw new Error('Supabase client not ready');
        }

        // Check for existing session
        const { data: { session }, error } = await window.supabaseClient.client.auth.getSession();
        if (error) throw error;

        if (session) {
            console.log('Found existing session:', session.user.email);
            currentUser = session.user;
            updateAuthUI();
        } else {
            console.log('No active session');
        }

        // Set up UI event listeners
        setupEventListeners();
        
        // Dispatch ready event
        window.dispatchEvent(new Event('authReady'));
        console.log('Auth module initialized');

    } catch (error) {
        console.error('Auth initialization error:', error);
        showError('Failed to initialize authentication');
    }
}

// Set up UI event listeners
function setupEventListeners() {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (loginBtn) loginBtn.addEventListener('click', showLoginModal);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
}

// Create and show login modal
function showLoginModal() {
    const modalHtml = `
        <div id="auth-modal" class="modal">
            <div class="modal-content">
                <h2>Login</h2>
                <form id="login-form">
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" required>
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" required>
                    </div>
                    <div class="button-group">
                        <button type="submit">Login</button>
                        <button type="button" id="signup-btn">Sign Up</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const modal = document.getElementById('auth-modal');
    const loginForm = document.getElementById('login-form');
    const signupBtn = document.getElementById('signup-btn');

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin(
            loginForm.email.value,
            loginForm.password.value
        );
    });

    signupBtn.addEventListener('click', () => {
        modal.remove();
        showSignupModal();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// Create and show signup modal
function showSignupModal() {
    const modalHtml = `
        <div id="auth-modal" class="modal">
            <div class="modal-content">
                <h2>Sign Up</h2>
                <form id="signup-form">
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" required>
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" required>
                    </div>
                    <div class="button-group">
                        <button type="submit">Sign Up</button>
                        <button type="button" id="login-link">Back to Login</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const modal = document.getElementById('auth-modal');
    const signupForm = document.getElementById('signup-form');
    const loginLink = document.getElementById('login-link');

    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleSignup(
            signupForm.email.value,
            signupForm.password.value
        );
    });

    loginLink.addEventListener('click', () => {
        modal.remove();
        showLoginModal();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// Handle login submission
async function handleLogin(email, password) {
    try {
        const { data, error } = await window.supabaseClient.client.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        currentUser = data.user;
        updateAuthUI();
        closeAuthModal();
        showSuccess('Logged in successfully!');

    } catch (error) {
        console.error('Login error:', error);
        showError(error.message);
    }
}

// Handle signup submission
async function handleSignup(email, password) {
    try {
        const { data: { user }, error } = await window.supabaseClient.client.auth.signUp({
            email,
            password
        });

        if (error) throw error;

        currentUser = user;
        updateAuthUI();
        closeAuthModal();
        showSuccess('Account created successfully! Please check your email for verification.');

    } catch (error) {
        console.error('Signup error:', error);
        showError(error.message);
    }
}

// Handle logout
async function handleLogout() {
    try {
        const { error } = await window.supabaseClient.client.auth.signOut();
        if (error) throw error;

        currentUser = null;
        updateAuthUI();
        showSuccess('Logged out successfully');

    } catch (error) {
        console.error('Logout error:', error);
        showError(error.message);
    }
}

// Update UI based on auth state
function updateAuthUI() {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const usernameSpan = document.getElementById('username');

    if (currentUser) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        usernameSpan.textContent = currentUser.email;
    } else {
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        usernameSpan.textContent = '';
    }
}

// Helper functions
function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.remove();
}

function showError(message) {
    const alertHtml = `
        <div class="alert alert-danger">
            ${message}
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', alertHtml);
    setTimeout(() => {
        const alert = document.querySelector('.alert');
        if (alert) alert.remove();
    }, 3000);
}

function showSuccess(message) {
    const alertHtml = `
        <div class="alert alert-success">
            ${message}
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', alertHtml);
    setTimeout(() => {
        const alert = document.querySelector('.alert');
        if (alert) alert.remove();
    }, 3000);
}

// Initialize when Supabase is ready
window.addEventListener('supabaseReady', initAuth);

// Export auth functions
window.auth = {
    currentUser: () => currentUser,
    logout: handleLogout,
    showError,
    showSuccess
};

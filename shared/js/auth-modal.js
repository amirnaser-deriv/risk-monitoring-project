// Auth modal management
window.AuthModal = {
    modal: null,
    isSignUp: false,
    isInitialized: false,

    initialize() {
        if (this.isInitialized) {
            console.log('Auth modal already initialized');
            return;
        }

        console.log('Initializing auth modal...');

        // Create modal HTML
        const modalHtml = `
            <div id="auth-modal" class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="modal-title">Sign In</h2>
                        <button class="close-button" onclick="AuthModal.hide()">&times;</button>
                    </div>
                    <form id="auth-form" class="auth-form">
                        <div class="form-group">
                            <label for="email">Email</label>
                            <input type="email" id="email" required>
                        </div>
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input type="password" id="password" required>
                        </div>
                        <div id="role-group" class="form-group" style="display: none;">
                            <label for="role">Role</label>
                            <select id="role" required>
                                <option value="client">Client</option>
                                <option value="risk_manager">Risk Manager</option>
                            </select>
                        </div>
                        <button type="submit" class="primary-button">Sign In</button>
                        <div class="form-footer">
                            <span id="auth-switch-text">Don't have an account?</span>
                            <a href="#" id="auth-switch-link" onclick="AuthModal.toggleMode(event)">Sign Up</a>
                        </div>
                    </form>
                </div>
            </div>
        `;

        // Add modal to document
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Store modal reference
        this.modal = document.getElementById('auth-modal');

        // Set initial display style
        if (this.modal) {
            this.modal.style.display = 'none';
            console.log('Auth modal element created');
        } else {
            console.error('Failed to create auth modal element');
            return;
        }

        // Set up form submission handler
        const form = document.getElementById('auth-form');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSubmit(e));
            console.log('Auth form handler set up');
        }

        // Handle click outside modal to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });

        // Handle escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'block') {
                this.hide();
            }
        });

        this.isInitialized = true;
        console.log('Auth modal initialized successfully');
    },

    show() {
        if (!this.isInitialized) {
            console.log('Initializing auth modal before showing');
            this.initialize();
        }

        if (!this.modal) {
            console.error('Auth modal element not found');
            return;
        }

        console.log('Showing auth modal');
        
        // Reset form state
        const form = document.getElementById('auth-form');
        if (form) form.reset();

        // Show modal
        this.modal.style.display = 'block';
        
        // Use setTimeout to ensure display: block is applied before adding visible class
        setTimeout(() => {
            this.modal.classList.add('visible');
            const emailInput = document.getElementById('email');
            if (emailInput) {
                emailInput.focus();
                console.log('Email input focused');
            }
        }, 10);
    },

    hide() {
        if (!this.modal) {
            console.error('Auth modal element not found');
            return;
        }

        console.log('Hiding auth modal');
        this.modal.classList.remove('visible');
        
        // Wait for transition to complete before hiding
        setTimeout(() => {
            this.modal.style.display = 'none';
            const form = document.getElementById('auth-form');
            if (form) form.reset();
        }, 300); // Match the CSS transition duration
    },

    toggleMode(event) {
        event.preventDefault();
        this.isSignUp = !this.isSignUp;
        console.log(`Switching to ${this.isSignUp ? 'signup' : 'signin'} mode`);

        // Update UI elements
        document.getElementById('modal-title').textContent = 
            this.isSignUp ? 'Sign Up' : 'Sign In';
        
        document.getElementById('auth-switch-text').textContent = 
            this.isSignUp ? 'Already have an account?' : "Don't have an account?";
        
        document.getElementById('auth-switch-link').textContent = 
            this.isSignUp ? 'Sign In' : 'Sign Up';
        
        document.querySelector('#auth-form button[type="submit"]').textContent = 
            this.isSignUp ? 'Sign Up' : 'Sign In';

        // Toggle role selection for signup with animation
        const roleGroup = document.getElementById('role-group');
        if (this.isSignUp) {
            roleGroup.style.display = 'block';
            roleGroup.style.opacity = '0';
            setTimeout(() => {
                roleGroup.style.opacity = '1';
            }, 10);
        } else {
            roleGroup.style.opacity = '0';
            setTimeout(() => {
                roleGroup.style.display = 'none';
            }, 300);
        }
    },

    async handleSubmit(event) {
        event.preventDefault();
        
        if (!window.auth) {
            console.error('Auth service not available');
            return;
        }
        
        try {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            this.setLoading(true);
            console.log(`Attempting to ${this.isSignUp ? 'sign up' : 'sign in'}...`);

            if (this.isSignUp) {
                const role = document.getElementById('role').value || 'client';
                console.log('Signup details:', { email, role });
                await window.auth.signUp(email, password, role);
            } else {
                console.log('Signin with:', { email });
                await window.auth.signIn(email, password);
            }

            this.hide();
        } catch (error) {
            console.error('Auth error:', error);
            // Error is handled by auth.js showError method
        } finally {
            this.setLoading(false);
        }
    },

    setLoading(isLoading) {
        const submitButton = document.querySelector('#auth-form button[type="submit"]');
        const inputs = document.querySelectorAll('#auth-form input, #auth-form select');
        
        if (isLoading) {
            submitButton.disabled = true;
            submitButton.textContent = 'Please wait...';
            inputs.forEach(input => input.disabled = true);
        } else {
            submitButton.disabled = false;
            submitButton.textContent = this.isSignUp ? 'Sign Up' : 'Sign In';
            inputs.forEach(input => input.disabled = false);
        }
    }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing auth modal on DOM load');
    window.AuthModal.initialize();
});

// Export for use in other scripts
window.AuthModal = window.AuthModal || {};

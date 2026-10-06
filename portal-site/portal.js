/* =========================================
   CREED PORTAL - MODERN DASHBOARD
   ========================================= */

(function() {
    'use strict';

    // Configuration
    const STORAGE_KEY = 'creed_portal_token';
    const ADMIN_KEY = 'creed_admin_token';
    // Same-origin requests are proxied to the main API by portal-site/vercel.json.
    const API_BASE = '';
    
    // State
    let currentToken = null;
    let currentOrder = null;
    let currentSection = 'overview';
    let activeTicketId = null;
    let staffActiveTicketId = null;
    let licenseKeyVisible = false;
    let pollInterval = null;
    let staffPollInterval = null;
    let lastCustomerMessageAt = '';
    let lastStaffMessageAt = '';
    let isAdminMode = false;
    let supabaseClient = null;
    let accountSession = null;
    let pendingVerificationEmail = '';

    // DOM Elements
    const els = {
        loginScreen: document.getElementById('login-screen'),
        dashboard: document.getElementById('dashboard'),
        publicAnnouncements: document.getElementById('public-announcements'),
        orderIdInput: document.getElementById('order-id-input'),
        adminTokenInput: document.getElementById('admin-token-input'),
        btnLogin: document.getElementById('btn-login'),
        btnAdminLogin: document.getElementById('btn-admin-login'),
        btnToggleLogin: document.getElementById('btn-toggle-login'),
        customerLogin: document.getElementById('customer-login'),
        adminLogin: document.getElementById('admin-login'),
        loginError: document.getElementById('login-error'),
        authTabLogin: document.getElementById('auth-tab-login'),
        authTabSignup: document.getElementById('auth-tab-signup'),
        accountLoginForm: document.getElementById('account-login-form'),
        accountSignupForm: document.getElementById('account-signup-form'),
        signinForm: document.getElementById('signin-form'),
        signupForm: document.getElementById('signup-form'),
        signinEmail: document.getElementById('signin-email'),
        signinPassword: document.getElementById('signin-password'),
        signupEmail: document.getElementById('signup-email'),
        signupPassword: document.getElementById('signup-password'),
        signupConfirmPassword: document.getElementById('signup-confirm-password'),
        btnAccountLogin: document.getElementById('btn-account-login'),
        btnAccountSignup: document.getElementById('btn-account-signup'),
        btnForgotPassword: document.getElementById('btn-forgot-password'),
        btnResendVerification: document.getElementById('btn-resend-verification'),
        btnBackToLogin: document.getElementById('btn-back-to-login'),
        btnAccountSignout: document.getElementById('btn-account-signout'),
        verificationPanel: document.getElementById('verification-panel'),
        verificationEmail: document.getElementById('verification-email'),
        accountReadyPanel: document.getElementById('account-ready-panel'),
        accountEmail: document.getElementById('account-email'),
        passwordResetPanel: document.getElementById('password-reset-panel'),
        passwordResetForm: document.getElementById('password-reset-form'),
        resetPassword: document.getElementById('reset-password'),
        btnSavePassword: document.getElementById('btn-save-password'),
        legacyOrderAccess: document.getElementById('legacy-order-access'),
        btnLogout: document.getElementById('btn-logout'),
        btnLogoutAll: document.getElementById('btn-logout-all'),
        particles: document.getElementById('particles'),
        toastContainer: document.getElementById('toast-container'),
        
        // Public announcements
        announcementsListPublic: document.getElementById('announcements-list-public'),
        
        // User info
        userName: document.getElementById('user-name'),
        userExpiry: document.getElementById('user-expiry'),
        sidebarName: document.getElementById('sidebar-name'),
        userAvatar: document.getElementById('user-avatar'),
        userSince: document.getElementById('user-since'),
        statusBadge: document.getElementById('status-badge'),
        
        // Overview
        licenseStatus: document.getElementById('license-status'),
        daysLeft: document.getElementById('days-left'),
        createdDate: document.getElementById('created-date'),
        expiryDate: document.getElementById('expiry-date'),
        orderInfo: document.getElementById('order-info'),
        settingsOrderId: document.getElementById('settings-order-id'),
        
        // Downloads
        downloadsList: document.getElementById('downloads-list'),
        
        // Support
        ticketsList: document.getElementById('tickets-list'),
        ticketSubject: document.getElementById('ticket-subject'),
        ticketMessage: document.getElementById('ticket-message'),
        btnCreateTicket: document.getElementById('btn-create-ticket'),
        chatPlaceholder: document.getElementById('chat-placeholder'),
        chatContainer: document.getElementById('chat-container'),
        chatSubject: document.getElementById('chat-subject'),
        chatStatus: document.getElementById('chat-status'),
        chatMessages: document.getElementById('chat-messages'),
        chatInputArea: document.getElementById('chat-input-area'),
        replyMessage: document.getElementById('reply-message'),
        btnSendReply: document.getElementById('btn-send-reply'),
        
        // Staff Inbox
        staffTicketsList: document.getElementById('staff-tickets-list'),
        staffChatPlaceholder: document.getElementById('staff-chat-placeholder'),
        staffChatContainer: document.getElementById('staff-chat-container'),
        staffChatSubject: document.getElementById('staff-chat-subject'),
        staffChatOrder: document.getElementById('staff-chat-order'),
        staffChatStatus: document.getElementById('staff-chat-status'),
        staffChatMessages: document.getElementById('staff-chat-messages'),
        staffReplyMessage: document.getElementById('staff-reply-message'),
        btnStaffSendReply: document.getElementById('btn-staff-send-reply'),
        btnCloseTicket: document.getElementById('btn-close-ticket'),
        btnClaimTicket: document.getElementById('btn-claim-ticket'),
        
        // Announcements Admin
        annTitle: document.getElementById('ann-title'),
        annBody: document.getElementById('ann-body'),
        annPublished: document.getElementById('ann-published'),
        btnPostAnnouncement: document.getElementById('btn-post-announcement'),
        adminAnnouncementsList: document.getElementById('admin-announcements-list'),
    };

    // =========================================
    // API Helper
    // =========================================
    async function api(path, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (currentToken && !options.skipAuth) {
            headers.Authorization = `Bearer ${currentToken}`;
        }
        
        const url = path;
        
        try {
            console.log('API Request:', `${API_BASE}${url}`, options.method || 'GET');
            
            // Stringify body if it's an object
            let body = options.body;
            if (body && typeof body === 'object') {
                body = JSON.stringify(body);
            }
            
            const response = await fetch(`${API_BASE}${url}`, {
                ...options,
                body,
                headers,
                mode: 'cors',
                credentials: 'omit'
            });
            
            const text = await response.text();
            console.log('API Response status:', response.status, response.statusText);
            console.log('API Response headers:', JSON.stringify([...response.headers.entries()]));
            console.log('API Response text:', text.substring(0, 1000));
            
            let data;
            try {
                data = text ? JSON.parse(text) : {};
            } catch (e) {
                console.error('JSON Parse Error:', e.message);
                console.error('Raw response:', text);
                data = { raw: text };
            }
            
            if (!response.ok) {
                throw new Error(data.error || data.message || response.statusText);
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }
    
    // Admin API helper
    async function adminApi(path, options = {}) {
        const adminToken = sessionStorage.getItem(ADMIN_KEY);
        if (!adminToken) throw new Error('Admin not logged in');
        
        const headers = {
            'Content-Type': 'application/json',
            'X-Creed-Staff-Token': adminToken,
            ...options.headers
        };
        
        const url = path;
        
        let body = options.body;
        if (body && typeof body === 'object') {
            body = JSON.stringify(body);
        }
        
        const response = await fetch(`${API_BASE}${url}`, {
            ...options,
            body,
            headers,
            mode: 'cors',
            credentials: 'omit'
        });
        
        const text = await response.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { raw: text };
        }
        
        if (!response.ok) {
            throw new Error(data.error || data.message || response.statusText);
        }
        
        return data;
    }

    // =========================================
    // Particle Background
    // =========================================
    function initParticles() {
        const container = els.particles;
        const particleCount = 50;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.animationDelay = `${Math.random() * 20}s`;
            particle.style.animationDuration = `${15 + Math.random() * 10}s`;
            container.appendChild(particle);
        }
    }

    // =========================================
    // Toast Notifications
    // =========================================
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas fa-${type === 'success' ? 'check' : 'exclamation'}"></i>
            </div>
            <span class="toast-message">${escapeHtml(message)}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        els.toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // =========================================
    // Public Announcements (No login required)
    // =========================================
    async function loadPublicAnnouncements() {
        try {
            const data = await api('/api/portal-announcements', { skipAuth: true });
            const announcements = data.announcements || [];
            
            if (announcements.length === 0) {
                els.announcementsListPublic.innerHTML = '<p class="empty-text">No announcements yet</p>';
                return;
            }
            
            els.announcementsListPublic.innerHTML = announcements.slice(0, 5).map(a => `
                <div class="announcement-item">
                    <h4>${escapeHtml(a.title)}</h4>
                    <p>${escapeHtml(a.body?.substring(0, 150) || '')}${a.body?.length > 150 ? '...' : ''}</p>
                    <span class="date">${new Date(a.published_at || a.created_at).toLocaleDateString()}</span>
                </div>
            `).join('');
        } catch (error) {
            console.error('Failed to load announcements:', error);
            els.announcementsListPublic.innerHTML = '<p class="empty-text">Failed to load announcements</p>';
        }
    }

    // =========================================
    // Auth & Login
    // =========================================
    async function initAccountAuth() {
        if (!window.supabase?.createClient) {
            console.error('Supabase browser client did not load');
            return;
        }
        try {
            const response = await fetch(`${API_BASE}/api/supabase-public`);
            const config = await response.json();
            if (!response.ok) throw new Error(config.error || 'Account service unavailable');
            supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
            });

            const { data } = await supabaseClient.auth.getSession();
            accountSession = data.session || null;
            if (accountSession?.user?.email_confirmed_at) showAccountReady(accountSession.user);

            supabaseClient.auth.onAuthStateChange((event, session) => {
                accountSession = session;
                if (event === 'PASSWORD_RECOVERY') {
                    showPasswordReset();
                } else if (event === 'SIGNED_IN' && session?.user?.email_confirmed_at) {
                    showAccountReady(session.user);
                } else if (event === 'SIGNED_OUT') {
                    showAuthPanel('login');
                }
            });
        } catch (error) {
            console.error('Account auth initialization failed:', error);
            showLoginError('Account sign-in is temporarily unavailable. Order ID access still works.');
        }
    }

    function clearFieldErrors(form) {
        form?.querySelectorAll('.field-error').forEach(el => {
            el.textContent = '';
            el.classList.remove('show');
        });
        form?.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
    }

    function setFieldError(id, message) {
        const error = document.getElementById(id);
        if (!error) return;
        error.textContent = message;
        error.classList.add('show');
        error.closest('.input-group')?.classList.add('has-error');
    }

    function isEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
    }

    function showAuthPanel(panel) {
        const login = panel === 'login';
        els.authTabLogin.classList.toggle('active', login);
        els.authTabSignup.classList.toggle('active', !login);
        els.authTabLogin.setAttribute('aria-selected', String(login));
        els.authTabSignup.setAttribute('aria-selected', String(!login));
        els.accountLoginForm.classList.toggle('hidden', !login);
        els.accountSignupForm.classList.toggle('hidden', login);
        els.verificationPanel.classList.add('hidden');
        els.accountReadyPanel.classList.add('hidden');
        els.passwordResetPanel.classList.add('hidden');
        document.querySelector('.auth-tabs')?.classList.remove('hidden');
        hideLoginError();
    }

    function showVerification(email) {
        pendingVerificationEmail = email;
        els.verificationEmail.textContent = email;
        els.accountLoginForm.classList.add('hidden');
        els.accountSignupForm.classList.add('hidden');
        els.accountReadyPanel.classList.add('hidden');
        els.passwordResetPanel.classList.add('hidden');
        els.verificationPanel.classList.remove('hidden');
        document.querySelector('.auth-tabs')?.classList.add('hidden');
    }

    function showAccountReady(user) {
        els.accountEmail.textContent = user.email || 'your account';
        els.accountLoginForm.classList.add('hidden');
        els.accountSignupForm.classList.add('hidden');
        els.verificationPanel.classList.add('hidden');
        els.passwordResetPanel.classList.add('hidden');
        els.accountReadyPanel.classList.remove('hidden');
        document.querySelector('.auth-tabs')?.classList.add('hidden');
        els.legacyOrderAccess.open = true;
        if (window.location.search || window.location.hash) {
            history.replaceState({}, document.title, window.location.pathname);
        }
        openVerifiedAccount();
    }

    async function openVerifiedAccount() {
        const accessToken = accountSession?.access_token;
        if (!accessToken || currentToken || isAdminMode) return;
        try {
            const response = await fetch(`${API_BASE}/api/portal-account`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to load account purchases');
            if (!data.portal_token) return;
            currentToken = data.portal_token;
            localStorage.setItem(STORAGE_KEY, currentToken);
            showToast(data.orders.length === 1 ? 'Purchase found — opening your dashboard' : `${data.orders.length} purchases found — opening your latest`);
            await loadDashboard();
        } catch (error) {
            console.error('Verified account handoff failed:', error);
            // Keep the account-ready screen usable; legacy Order ID linking remains available.
        }
    }

    function showPasswordReset() {
        els.accountLoginForm.classList.add('hidden');
        els.accountSignupForm.classList.add('hidden');
        els.verificationPanel.classList.add('hidden');
        els.accountReadyPanel.classList.add('hidden');
        els.passwordResetPanel.classList.remove('hidden');
        document.querySelector('.auth-tabs')?.classList.add('hidden');
    }

    async function saveNewPassword(event) {
        event.preventDefault();
        clearFieldErrors(els.passwordResetForm);
        const password = els.resetPassword.value;
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
            return setFieldError('reset-password-error', 'Use at least 8 characters with a number and a letter.');
        }
        setButtonLoading(els.btnSavePassword, true, 'Saving...');
        try {
            const { data, error } = await supabaseClient.auth.updateUser({ password });
            if (error) throw error;
            showAccountReady(data.user);
            showToast('Password updated successfully');
        } catch (error) {
            showLoginError(friendlyAuthError(error));
        } finally {
            setButtonLoading(els.btnSavePassword, false, 'Save new password', 'fa-key');
        }
    }

    async function accountSignUp(event) {
        event.preventDefault();
        clearFieldErrors(els.signupForm);
        const email = els.signupEmail.value.trim().toLowerCase();
        const password = els.signupPassword.value;
        const confirm = els.signupConfirmPassword.value;
        let valid = true;
        if (!isEmail(email)) { setFieldError('signup-email-error', 'Enter a valid email address.'); valid = false; }
        if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
            setFieldError('signup-password-error', 'Use at least 8 characters with a number and a letter.'); valid = false;
        }
        if (confirm !== password) { setFieldError('signup-confirm-error', 'Passwords do not match.'); valid = false; }
        if (!valid) return;
        if (!supabaseClient) return showLoginError('Account service is still loading. Please try again.');

        setButtonLoading(els.btnAccountSignup, true, 'Creating account...');
        try {
            const redirectTo = `${window.location.origin}${window.location.pathname}?verified=1`;
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: redirectTo }
            });
            if (error) throw error;
            if (data.session && data.user?.email_confirmed_at) {
                showAccountReady(data.user);
                showToast('Account created successfully');
            } else {
                showVerification(email);
            }
        } catch (error) {
            showLoginError(friendlyAuthError(error));
        } finally {
            setButtonLoading(els.btnAccountSignup, false, 'Create account', 'fa-user-plus');
        }
    }

    async function accountSignIn(event) {
        event.preventDefault();
        clearFieldErrors(els.signinForm);
        const email = els.signinEmail.value.trim().toLowerCase();
        const password = els.signinPassword.value;
        if (!isEmail(email)) return setFieldError('signin-email-error', 'Enter a valid email address.');
        if (!password) return setFieldError('signin-password-error', 'Enter your password.');
        if (!supabaseClient) return showLoginError('Account service is still loading. Please try again.');

        setButtonLoading(els.btnAccountLogin, true, 'Signing in...');
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            if (!data.user?.email_confirmed_at) {
                await supabaseClient.auth.signOut();
                showVerification(email);
                return;
            }
            showAccountReady(data.user);
            showToast('Signed in successfully');
        } catch (error) {
            showLoginError(friendlyAuthError(error));
        } finally {
            setButtonLoading(els.btnAccountLogin, false, 'Sign in', 'fa-arrow-right');
        }
    }

    function setButtonLoading(button, loading, label, icon = 'fa-spinner fa-spin') {
        button.disabled = loading;
        button.innerHTML = `<i class="fas ${loading ? 'fa-spinner fa-spin' : icon}"></i> ${escapeHtml(label)}`;
    }

    function friendlyAuthError(error) {
        const message = String(error?.message || 'Authentication failed');
        if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.';
        if (/email not confirmed/i.test(message)) return 'Verify your email before signing in.';
        if (/already registered|already exists/i.test(message)) return 'An account with this email already exists. Try signing in.';
        if (/rate limit|security purposes/i.test(message)) return 'Too many attempts. Wait a moment and try again.';
        return message;
    }

    async function resendVerification() {
        if (!supabaseClient || !pendingVerificationEmail) return;
        setButtonLoading(els.btnResendVerification, true, 'Sending...');
        try {
            const { error } = await supabaseClient.auth.resend({
                type: 'signup',
                email: pendingVerificationEmail,
                options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}?verified=1` }
            });
            if (error) throw error;
            showToast('Verification email sent');
        } catch (error) {
            showLoginError(friendlyAuthError(error));
        } finally {
            setButtonLoading(els.btnResendVerification, false, 'Resend email', 'fa-paper-plane');
        }
    }

    async function forgotPassword() {
        const email = els.signinEmail.value.trim().toLowerCase();
        if (!isEmail(email)) return setFieldError('signin-email-error', 'Enter your email first, then select Forgot password.');
        if (!supabaseClient) return showLoginError('Account service is still loading. Please try again.');
        try {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}${window.location.pathname}?reset-password=1`
            });
            if (error) throw error;
            showToast('Password reset email sent');
        } catch (error) {
            showLoginError(friendlyAuthError(error));
        }
    }

    async function accountSignOut() {
        if (supabaseClient) await supabaseClient.auth.signOut();
        accountSession = null;
        showAuthPanel('login');
        showToast('Signed out of your account');
    }

    function togglePassword(button) {
        const input = document.getElementById(button.dataset.passwordTarget);
        if (!input) return;
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        button.innerHTML = `<i class="fas fa-${showing ? 'eye' : 'eye-slash'}"></i>`;
    }

    function normalizeOrderId(id) {
        return String(id || '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim()
            .replace(/^["'«»]+|["'«»]+$/g, '')
            .trim();
    }

    function toggleLoginMode() {
        const isCustomer = !els.customerLogin.classList.contains('hidden');
        
        if (isCustomer) {
            els.customerLogin.classList.add('hidden');
            els.adminLogin.classList.remove('hidden');
            els.btnToggleLogin.innerHTML = '<i class="fas fa-user"></i><span>Customer Login</span>';
        } else {
            els.customerLogin.classList.remove('hidden');
            els.adminLogin.classList.add('hidden');
            els.btnToggleLogin.innerHTML = '<i class="fas fa-shield-alt"></i><span>Staff Login</span>';
        }
        hideLoginError();
    }

    async function login() {
        const orderId = normalizeOrderId(els.orderIdInput.value);
        
        if (!orderId) {
            showLoginError('Please enter your Order ID');
            return;
        }
        
        els.btnLogin.disabled = true;
        els.btnLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
        hideLoginError();
        
        try {
            if (orderId.startsWith('op_')) {
                currentToken = orderId;
                localStorage.setItem(STORAGE_KEY, currentToken);
                await loadDashboard();
                return;
            }
            
            const response = await fetch(`${API_BASE}/api/portal-claim-by-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Invalid Order ID');
            }
            
            showToast(data.message || 'Secure access link sent to the order email.');
            els.loginError.textContent = data.message || 'Check the customer email for a secure access link.';
            els.loginError.classList.add('show', 'success');
            
        } catch (error) {
            showLoginError(error.message || 'Failed to login. Please check your Order ID.');
        } finally {
            els.btnLogin.disabled = false;
            els.btnLogin.innerHTML = '<i class="fas fa-arrow-right"></i> Continue';
        }
    }

    async function adminLogin() {
        const token = els.adminTokenInput.value.trim();
        
        if (!token) {
            showLoginError('Please enter admin token');
            return;
        }
        
        els.btnAdminLogin.disabled = true;
        els.btnAdminLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
        hideLoginError();
        
        try {
            // Test the token by making an admin API call
            const response = await fetch(`${API_BASE}/api/admin-portal-tickets`, { headers: { 'X-Creed-Staff-Token': token } });
            
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Invalid admin token');
            }
            
            sessionStorage.setItem(ADMIN_KEY, token);
            isAdminMode = true;
            document.body.classList.add('is-admin');
            
            showToast('Staff login successful!');
            loadAdminDashboard();
            
        } catch (error) {
            showLoginError(error.message || 'Invalid admin token');
        } finally {
            els.btnAdminLogin.disabled = false;
            els.btnAdminLogin.innerHTML = '<i class="fas fa-lock"></i> Staff Login';
        }
    }

    function showLoginError(message) {
        els.loginError.textContent = message;
        els.loginError.classList.add('show');
    }

    function hideLoginError() {
        els.loginError.classList.remove('show');
    }

    function logout() {
        currentToken = null;
        currentOrder = null;
        isAdminMode = false;
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(ADMIN_KEY);
        document.body.classList.remove('is-admin');
        
        // Restore customer-only items
        document.querySelectorAll('.customer-only').forEach(el => {
            el.classList.remove('hidden');
        });
        document.querySelectorAll('.admin-only').forEach(el => {
            el.classList.add('hidden');
        });
        
        els.dashboard.classList.add('hidden');
        els.loginScreen.style.display = 'flex';
        els.publicAnnouncements.classList.remove('hidden');
        els.orderIdInput.value = '';
        els.adminTokenInput.value = '';
        
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        if (staffPollInterval) {
            clearInterval(staffPollInterval);
            staffPollInterval = null;
        }
        if (ticketPollInterval) {
            clearInterval(ticketPollInterval);
            ticketPollInterval = null;
        }
        lastTicketCount = 0;
        
        // Reload announcements
        loadPublicAnnouncements();
        
        showToast('Logged out successfully');
    }

    // =========================================
    // Dashboard
    // =========================================
    async function loadDashboard() {
        try {
            const data = await api('/api/portal-me');
            currentOrder = data.order;
            
            els.loginScreen.style.display = 'none';
            els.publicAnnouncements.classList.add('hidden');
            els.dashboard.classList.remove('hidden');
            
        updateUserInfo(data);
        updateOverview(data);
        updateExpirationDisplay(data.order, []);
        loadDownloads(data);
            loadTickets();
            
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            
            if (error.message?.includes('Invalid') || error.message?.includes('expired')) {
                localStorage.removeItem(STORAGE_KEY);
                showLoginError('Session expired. Please login again.');
            } else {
                showLoginError('Failed to load dashboard. Please try again.');
            }
        }
    }

    function loadAdminDashboard() {
        els.loginScreen.style.display = 'none';
        els.publicAnnouncements.classList.add('hidden');
        els.dashboard.classList.remove('hidden');
        
        // Set admin UI
        els.userName.textContent = 'Staff';
        els.sidebarName.textContent = 'Staff Member';
        els.userAvatar.textContent = 'ST';
        els.userSince.textContent = 'Administrator';
        els.statusBadge.innerHTML = '<span class="status-dot"></span> Online';
        els.statusBadge.className = 'status-badge active';
        els.userExpiry.textContent = '';
        
        // Show admin nav items, hide customer-only items
        document.querySelectorAll('.admin-only').forEach(el => {
            el.classList.remove('hidden');
        });
        document.querySelectorAll('.customer-only').forEach(el => {
            el.classList.add('hidden');
        });
        
        // Navigate to staff inbox by default
        navigateTo('staff-inbox');
        loadStaffTickets();
        loadAdminAnnouncements();
        startTicketPolling();
    }

    function updateUserInfo(data) {
        const order = data.order;
        const customerName = order.customer_email || order.customer?.name || order.customer?.email || 'Customer';
        const initials = customerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        
        els.userName.textContent = customerName;
        els.sidebarName.textContent = customerName;
        els.userAvatar.textContent = initials;
        els.userSince.textContent = order.customer_email || 'Member';
        
        els.userExpiry.textContent = '';
        els.daysLeft.textContent = '';
        
        els.statusBadge.innerHTML = '<span class="status-dot"></span> Active';
        els.statusBadge.className = 'status-badge active';
        els.licenseStatus.textContent = 'Active';
        els.licenseStatus.className = 'stat-value status-active';
    }

    function durationToDays(value) {
        const text = String(value || '').toLowerCase().trim();
        if (!text || text === '—' || text === '-') return null;
        if (text.includes('lifetime') || text.includes('perm')) return Infinity;

        const match = text.match(/(\d+)\s*(day|days|d|week|weeks|w|month|months|mo|year|years|yr|yrs)/i);
        if (match) {
            const amount = Number(match[1]);
            const unit = match[2].toLowerCase();
            if (!Number.isFinite(amount) || amount <= 0) return null;
            if (unit.startsWith('day') || unit === 'd') return amount;
            if (unit.startsWith('week') || unit === 'w') return amount * 7;
            if (unit.startsWith('month') || unit === 'mo') return amount * 30;
            if (unit.startsWith('year') || unit === 'yr' || unit === 'yrs') return amount * 365;
        }

        if (text.includes('one-time')) return 1;
        if (text.includes('week')) return 7;
        if (text.includes('month')) return 30;
        if (text.includes('day')) return 1;
        return null;
    }

    function getItemDuration(item) {
        return item?.duration || item?.variant || item?.size || item?.metadata?.duration || item?.name || item?.title || '';
    }

    function addDays(date, days) {
        const next = new Date(date);
        next.setDate(next.getDate() + days);
        return next;
    }

    function formatExpiryDate(date) {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function formatDaysLeft(date) {
        const diff = Math.ceil((date.getTime() - Date.now()) / 86400000);
        if (diff < 0) return 'Expired';
        if (diff === 0) return 'Expires today';
        if (diff === 1) return '1 day left';
        return `${diff} days left`;
    }

    function resolveLicenseExpiration(order, licenseKeys = []) {
        const explicitDates = (licenseKeys || [])
            .map(k => k.expires_at || k.metadata?.expires_at || k.metadata?.expiry || k.metadata?.expiresAt)
            .filter(Boolean)
            .map(value => new Date(value))
            .filter(date => !Number.isNaN(date.getTime()));

        if (explicitDates.length) {
            explicitDates.sort((a, b) => b.getTime() - a.getTime());
            return { type: 'date', date: explicitDates[0] };
        }

        const keyDurations = (licenseKeys || [])
            .map(k => k.metadata?.duration || k.duration || k.variant)
            .map(durationToDays)
            .filter(days => days != null);

        const itemDurations = (Array.isArray(order?.items) ? order.items : [])
            .map(getItemDuration)
            .map(durationToDays)
            .filter(days => days != null);

        const durations = [...keyDurations, ...itemDurations];
        if (durations.includes(Infinity)) return { type: 'lifetime' };

        const maxDays = durations.length ? Math.max(...durations) : null;
        if (!maxDays) return { type: 'unknown' };

        const start = new Date(order?.paid_at || order?.created_at || Date.now());
        return { type: 'date', date: addDays(start, maxDays) };
    }

    function updateExpirationDisplay(order, licenseKeys = []) {
        const expiry = resolveLicenseExpiration(order, licenseKeys);

        if (expiry.type === 'lifetime') {
            els.expiryDate.textContent = 'Lifetime';
            els.daysLeft.textContent = 'Lifetime access';
            els.userExpiry.textContent = 'Lifetime access';
            return;
        }

        if (expiry.type === 'date' && expiry.date) {
            els.expiryDate.textContent = formatExpiryDate(expiry.date);
            const daysText = formatDaysLeft(expiry.date);
            els.daysLeft.textContent = daysText;
            els.userExpiry.textContent = daysText;

            if (expiry.date.getTime() < Date.now()) {
                els.licenseStatus.textContent = 'Expired';
                els.licenseStatus.className = 'stat-value';
                els.statusBadge.innerHTML = '<span class="status-dot"></span> Expired';
                els.statusBadge.className = 'status-badge';
            }
            return;
        }

        els.expiryDate.textContent = 'Checking...';
        els.daysLeft.textContent = 'Checking expiry';
        els.userExpiry.textContent = 'Checking expiry';
    }

    function updateOverview(data) {
        const order = data.order;
        
        const createdAt = new Date(order.created_at || Date.now());
        
        els.createdDate.textContent = createdAt.toLocaleDateString('en-US', { 
            month: 'short', day: 'numeric', year: 'numeric' 
        });
        els.expiryDate.textContent = '—';
        
        els.settingsOrderId.textContent = order.id;
        
        const items = Array.isArray(order.items) ? order.items : [];
        const itemsList = items.map(item => 
            `<li>${escapeHtml(item.name || item.title || 'Product')} × ${item.quantity || 1}</li>`
        ).join('');
        
        els.orderInfo.innerHTML = `
            <p><strong>Order ID:</strong> <code>${escapeHtml(order.id)}</code></p>
            <p><strong>Amount:</strong> ${order.amount || '0'} ${order.currency || 'USD'}</p>
            <p><strong>Paid:</strong> ${order.paid_at ? new Date(order.paid_at).toLocaleString() : 'Pending'}</p>
            <ul style="margin-top: 12px; padding-left: 20px;">${itemsList || '<li>—</li>'}</ul>
        `;
    }

    // =========================================
    // Downloads & License Keys
    // =========================================
    
    const PRODUCT_LOADERS = {
        'valorant': { name: 'Creed Valorant', downloadUrl: '#', version: 'v2.1.0', supports: 'Windows 10/11' },
        'fortnite': { name: 'Creed Fortnite', downloadUrl: '#', version: 'v1.5.2', supports: 'Windows 10/11' },
        'apex': { name: 'Creed Apex Legends', downloadUrl: '#', version: 'v1.3.0', supports: 'Windows 10/11' },
        'rust': { name: 'Creed Rust', downloadUrl: '#', version: 'v3.0.1', supports: 'Windows 10/11' },
        'cod': { name: 'Creed COD Black Ops 7', downloadUrl: '#', version: 'v1.2.0', supports: 'Windows 10/11' },
        'rainbow-six': { name: 'Creed Rainbow Six Siege', downloadUrl: '#', version: 'v1.8.0', supports: 'Windows 10/11' },
        'spoofer-perm': { name: 'Creed Permanent Spoofer', downloadUrl: '#', version: 'v1.0.0', supports: 'Windows 10/11' },
        'spoofer-temp': { name: 'Creed Temporary Spoofer', downloadUrl: '#', version: 'v1.0.0', supports: 'Windows 10/11' },
        'aimbot': { name: 'Creed AI Aimbot', downloadUrl: '#', version: 'v1.0.0', supports: 'Windows 10/11' },
        'arc-raiders': { name: 'Creed Arc Raiders', downloadUrl: '#', version: 'v1.0.0', supports: 'Windows 10/11' }
    };

    function canonicalProductId(value, name = '') {
        const raw = String(value || '').toLowerCase().trim();
        const text = `${raw} ${String(name || '').toLowerCase()}`;
        if (raw === 'perm-spoofer' || raw === 'spoofer-perm') return 'spoofer-perm';
        if (raw === 'temp-spoofer' || raw === 'spoofer-temp') return 'spoofer-temp';
        if (raw === 'cod-black-ops-7' || raw === 'cod') return 'cod';
        if (raw === 'apex-legends' || raw === 'apex') return 'apex';
        if (raw === 'fortnite-public' || raw === 'fortnite-private' || raw === 'fortnite') return 'fortnite';
        if (text.includes('fortnite')) return 'fortnite';
        if (text.includes('apex')) return 'apex';
        if (text.includes('rainbow')) return 'rainbow-six';
        if (text.includes('rust')) return 'rust';
        if (text.includes('arc')) return 'arc-raiders';
        if (text.includes('valorant')) return 'valorant';
        if (text.includes('perm') && text.includes('spoofer')) return 'spoofer-perm';
        if (text.includes('temp') && text.includes('spoofer')) return 'spoofer-temp';
        if (text.includes('aimbot') || text.includes('ai-aim')) return 'aimbot';
        if (text.includes('cod') || text.includes('call of duty') || text.includes('black-ops')) return 'cod';
        return raw;
    }

    async function loadDownloads(data) {
        const order = data?.order || currentOrder;
        if (!order) return;
        
        let licenseKeys = [];
        let productDownloads = [];
        
        try {
            const response = await api('/api/portal-license-keys');
            licenseKeys = response.keys || [];
            productDownloads = response.downloads || [];
            console.log('Downloads from API:', productDownloads);
            updateExpirationDisplay(order, licenseKeys);
        } catch (error) {
            console.log('No license keys endpoint yet, using fallback');
            updateExpirationDisplay(order, []);
        }
        
        const items = Array.isArray(order.items) ? order.items : [];
        
        if (items.length === 0) {
            els.downloadsList.innerHTML = '<p class="empty-text">No products found in your order.</p>';
            return;
        }
        
        const downloads = items.map(item => {
            const productName = (item.name || item.title || '').toLowerCase();
            const itemProductId = canonicalProductId(item.product_id || item.id, productName);
            let loader = null;
            let key = null;
            let keyDuration = item.duration || item.variant || 'Unknown';
            
            for (const [keyId, loaderInfo] of Object.entries(PRODUCT_LOADERS)) {
                if (itemProductId === keyId || productName.includes(keyId) || 
                    (keyId === 'valorant' && productName.includes('valorant')) ||
                    (keyId === 'fortnite' && (productName.includes('fortnite') || productName.includes('fn'))) ||
                    (keyId === 'apex' && productName.includes('apex')) ||
                    (keyId === 'rust' && productName.includes('rust')) ||
                    (keyId === 'cod' && (productName.includes('cod') || productName.includes('call of duty'))) ||
                    (keyId === 'rainbow-six' && productName.includes('rainbow')) ||
                    (keyId === 'spoofer-perm' && productName.includes('permanent') && productName.includes('spoofer')) ||
                    (keyId === 'spoofer-temp' && productName.includes('temporary') && productName.includes('spoofer')) ||
                    (keyId === 'aimbot' && productName.includes('aimbot')) ||
                    (keyId === 'arc-raiders' && productName.includes('arc'))) {
                    loader = { ...loaderInfo }; // Clone to avoid modifying original
                    
                    // Check if there's a download URL from admin manager
                    // Try multiple matching strategies
                    const apiDownload = productDownloads.find(d => {
                        const dbProductId = canonicalProductId(d.product_id, d.product_name);
                        return dbProductId === itemProductId;
                    });
                    
                    console.log(`Product: ${productName}, keyId: ${keyId}, found download:`, apiDownload);
                    
                    if (apiDownload && apiDownload.download_url && apiDownload.download_url !== '#') {
                        loader.downloadUrl = apiDownload.download_url;
                        console.log(`Set download URL for ${keyId}:`, loader.downloadUrl);
                    }
                    
                    break;
                }
            }
            
            key = licenseKeys.find(k => canonicalProductId(k.product_id, k.product_name) === itemProductId);
            
            return {
                item,
                loader,
                key,
                hasKey: !!key,
                // `used=true` means this unique key is assigned/reserved. It must
                // remain visible to the customer who owns this order.
                inStock: !!key,
                duration: keyDuration
            };
        }).filter(d => d.loader);
        
        if (downloads.length === 0) {
            els.downloadsList.innerHTML = '<p class="empty-text">No downloads available for your products yet.</p>';
            return;
        }
        
        els.downloadsList.innerHTML = downloads.map((download, index) => `
            <div class="download-card">
                <div class="download-header">
                    <div>
                        <div class="download-title">${escapeHtml(download.loader.name)}</div>
                        <div class="download-subtitle">${escapeHtml(download.duration)} · ${download.loader.supports}</div>
                    </div>
                    <span class="download-version">${download.loader.version}</span>
                </div>
                
                <!-- Launcher Download Section - Always Visible -->
                <div class="download-launcher-section">
                    <div class="download-key-label">LAUNCHER</div>
                    ${download.loader.downloadUrl && download.loader.downloadUrl !== '#' ? `
                        <button class="btn-primary btn-download-full" onclick="window.open('${escapeHtml(download.loader.downloadUrl)}', '_blank', 'noopener,noreferrer')">
                            <i class="fas fa-download"></i>
                            Download Loader
                        </button>
                    ` : `
                        <button class="btn-primary btn-download-full" disabled style="opacity: 0.5; cursor: not-allowed;">
                            <i class="fas fa-download"></i>
                            Download Coming Soon
                        </button>
                        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px; text-align: center;">Download link not configured yet. Contact support if needed.</p>
                    `}
                </div>
                
                <!-- License Key Section - Separate -->
                <div class="download-key-section ${!download.inStock ? 'key-unavailable' : ''}">
                    <div class="download-key-label">LICENSE KEY</div>
                    
                    ${download.hasKey && download.inStock ? `
                        <div class="download-key-container">
                            <div class="download-key-value" id="key-${index}">${maskKey(download.key.key)}</div>
                            <div class="key-actions">
                                <button class="btn-secondary" onclick="toggleKeyVisibility('key-${index}', '${escapeHtml(download.key.key)}')" title="Show/Hide">
                                    <i class="far fa-eye"></i>
                                </button>
                                <button class="btn-secondary" onclick="copyToClipboard('${escapeHtml(download.key.key)}')" title="Copy">
                                    <i class="far fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    ` : download.hasKey && !download.inStock ? `
                        <div class="key-status-badge key-out-of-stock">
                            <i class="fas fa-exclamation-circle"></i>
                            <span>Out of stock. <a href="https://creedv2.com/support" target="_blank">Open a ticket</a> to get a key from staff.</span>
                        </div>
                    ` : `
                        <div class="key-status-badge key-pending">
                            <i class="fas fa-clock"></i>
                            <span>Key being prepared. <a href="https://creedv2.com/support" target="_blank">Contact support</a>.</span>
                        </div>
                    `}
                </div>
            </div>
        `).join('');
    }

    function maskKey(key) {
        if (!key) return '••••••••••••••••••••••••••••••••';
        return key.slice(0, 4) + '•'.repeat(key.length - 8) + key.slice(-4);
    }

    window.toggleKeyVisibility = function(elementId, key) {
        const el = document.getElementById(elementId);
        if (el.dataset.visible === 'true') {
            el.textContent = maskKey(key);
            el.dataset.visible = 'false';
        } else {
            el.textContent = key;
            el.dataset.visible = 'true';
        }
    };

    window.copyToClipboard = async function(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!');
        } catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('Copied to clipboard!');
        }
    };

    // =========================================
    // Support Tickets (Customer)
    // =========================================
    async function loadTickets() {
        try {
            const data = await api('/api/portal-tickets');
            const tickets = data.tickets || [];
            
            if (tickets.length === 0) {
                els.ticketsList.innerHTML = '<p class="empty-text">No tickets yet</p>';
                return;
            }
            
            els.ticketsList.innerHTML = tickets.map(ticket => `
                <div class="ticket-item ${activeTicketId === ticket.id ? 'active' : ''}" data-id="${ticket.id}">
                    <div class="ticket-info">
                        <h4>${escapeHtml(ticket.subject)}</h4>
                        <span class="ticket-meta">${new Date(ticket.created_at).toLocaleDateString()}</span>
                    </div>
                    <span class="ticket-status ${ticket.status}">${ticket.status}</span>
                </div>
            `).join('');
            
            els.ticketsList.querySelectorAll('.ticket-item').forEach(item => {
                item.addEventListener('click', () => openTicket(item.dataset.id));
            });
            
        } catch (error) {
            console.error('Failed to load tickets:', error);
            els.ticketsList.innerHTML = '<p class="empty-text">Failed to load tickets</p>';
        }
    }

    async function openTicket(ticketId) {
        activeTicketId = ticketId;
        
        els.ticketsList.querySelectorAll('.ticket-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === ticketId);
        });
        
        els.chatPlaceholder.classList.add('hidden');
        els.chatContainer.classList.remove('hidden');
        
        try {
            const data = await api(`/api/portal-messages?ticket_id=${ticketId}`);
            const ticket = data.ticket;
            const messages = data.messages || [];
            lastCustomerMessageAt = messages.length ? messages[messages.length - 1].created_at : '';
            
            els.chatSubject.textContent = ticket.subject;
            els.chatStatus.textContent = ticket.status;
            els.chatStatus.className = `chat-status ${ticket.status}`;
            
            if (ticket.status === 'closed' || ticket.status === 'claimed') {
                els.chatInputArea.style.display = 'none';
            } else {
                els.chatInputArea.style.display = 'flex';
            }
            
            els.chatMessages.innerHTML = messages.map(msg => `
                <div class="message ${msg.author_role === 'admin' ? 'staff' : 'customer'}">
                    <div class="message-header">
                        <i class="fas fa-${msg.author_role === 'admin' ? 'headset' : 'user'}"></i>
                        ${msg.author_role === 'admin' ? 'Support Team' : 'You'}
                    </div>
                    <div class="message-body">${escapeHtml(msg.body)}</div>
                    <div class="message-time">${new Date(msg.created_at).toLocaleString()}</div>
                </div>
            `).join('');
            
            els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
            
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = setInterval(() => pollMessages(ticketId), 2000);
            
        } catch (error) {
            console.error('Failed to load ticket:', error);
        }
    }

    async function pollMessages(ticketId) {
        if (!activeTicketId || activeTicketId !== ticketId) return;
        if (document.hidden) return;
        
        try {
            const suffix = lastCustomerMessageAt ? `&after=${encodeURIComponent(lastCustomerMessageAt)}` : '';
            const data = await api(`/api/portal-messages?ticket_id=${ticketId}${suffix}`);
            const messages = data.messages || [];
            if (messages.length > 0) {
                // Check if new message is from staff (admin)
                const newMessages = messages;
                const hasNewStaffMessage = newMessages.some(m => m.author_role === 'admin');
                
                els.chatMessages.insertAdjacentHTML('beforeend', messages.map(msg => `
                    <div class="message ${msg.author_role === 'admin' ? 'staff' : 'customer'}">
                        <div class="message-header">
                            <i class="fas fa-${msg.author_role === 'admin' ? 'headset' : 'user'}"></i>
                            ${msg.author_role === 'admin' ? 'Support Team' : 'You'}
                        </div>
                        <div class="message-body">${escapeHtml(msg.body)}</div>
                        <div class="message-time">${new Date(msg.created_at).toLocaleString()}</div>
                    </div>
                `).join(''));
                lastCustomerMessageAt = messages[messages.length - 1].created_at;
                
                els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
                
                // Play sound if staff responded
                if (hasNewStaffMessage) {
                    playNotificationSound();
                }
            }
        } catch (error) {
            console.error('Failed to poll messages:', error);
        }
    }

    async function createTicket() {
        const subject = els.ticketSubject.value.trim();
        const message = els.ticketMessage.value.trim();
        
        if (!subject || subject.length < 3) {
            showToast('Subject must be at least 3 characters', 'error');
            return;
        }
        
        try {
            await api('/api/portal-tickets', {
                method: 'POST',
                body: { subject, message: message || undefined }
            });
            
            els.ticketSubject.value = '';
            els.ticketMessage.value = '';
            
            showToast('Ticket created successfully!');
            loadTickets();
            
        } catch (error) {
            showToast(error.message || 'Failed to create ticket', 'error');
        }
    }

    async function sendReply() {
        if (!activeTicketId) return;
        
        const message = els.replyMessage.value.trim();
        if (!message) return;
        
        const tempId = `pending-${Date.now()}`;
        els.chatMessages.insertAdjacentHTML('beforeend', `
            <div class="message customer" id="${tempId}" style="opacity:.65">
                <div class="message-header"><i class="fas fa-user"></i>You</div>
                <div class="message-body">${escapeHtml(message)}</div>
                <div class="message-time">Sending…</div>
            </div>`);
        els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
        els.replyMessage.value = '';

        try {
            const result = await api('/api/portal-messages', {
                method: 'POST',
                body: { ticket_id: activeTicketId, body: message }
            });
            document.getElementById(tempId)?.remove();
            const msg = result.message;
            if (msg) {
                els.chatMessages.insertAdjacentHTML('beforeend', `<div class="message customer"><div class="message-header"><i class="fas fa-user"></i>You</div><div class="message-body">${escapeHtml(msg.body)}</div><div class="message-time">${new Date(msg.created_at).toLocaleString()}</div></div>`);
                lastCustomerMessageAt = msg.created_at;
            }
            els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
            
        } catch (error) {
            document.getElementById(tempId)?.remove();
            els.replyMessage.value = message;
            showToast(error.message || 'Failed to send message', 'error');
        }
    }

    // =========================================
    // Staff Inbox (Admin)
    // =========================================
    let lastTicketCount = 0;
    let ticketPollInterval = null;
    
    async function loadStaffTickets() {
        try {
            const data = await adminApi('/api/admin-portal-tickets');
            const tickets = data.tickets || [];
            
            // Check for new tickets
            if (lastTicketCount > 0 && tickets.length > lastTicketCount) {
                const newTicketCount = tickets.length - lastTicketCount;
                showToast(`${newTicketCount} new ticket(s) received!`);
                playNewTicketSound();
            }
            lastTicketCount = tickets.length;
            
            if (tickets.length === 0) {
                els.staffTicketsList.innerHTML = '<p class="empty-text">No tickets found</p>';
                return;
            }
            
            // Track which tickets we've seen
            if (!window.seenTickets) window.seenTickets = new Set();
            
            els.staffTicketsList.innerHTML = tickets.map(ticket => {
                const isNew = !window.seenTickets.has(ticket.id) && ticket.status === 'open';
                if (isNew) window.seenTickets.add(ticket.id);
                
                return `
                <div class="ticket-item ${staffActiveTicketId === ticket.id ? 'active' : ''}" data-id="${ticket.id}">
                    <div class="ticket-info">
                        <h4>${escapeHtml(ticket.subject)} ${isNew ? '<span class="new-badge">NEW</span>' : ''}</h4>
                        <span class="ticket-meta">${ticket.order_id?.substring(0, 12) || 'N/A'}...</span>
                    </div>
                    <span class="ticket-status ${ticket.status}">${ticket.status}</span>
                </div>
            `}).join('');
            
            els.staffTicketsList.querySelectorAll('.ticket-item').forEach(item => {
                item.addEventListener('click', () => openStaffTicket(item.dataset.id));
            });
            
        } catch (error) {
            console.error('Failed to load staff tickets:', error);
            els.staffTicketsList.innerHTML = '<p class="empty-text">Failed to load tickets</p>';
        }
    }
    
    function startTicketPolling() {
        // Keep the staff inbox fresh while the tab is active.
        if (ticketPollInterval) clearInterval(ticketPollInterval);
        ticketPollInterval = setInterval(() => {
            if (isAdminMode) {
                loadStaffTickets();
            }
        }, 3000);
    }

    async function openStaffTicket(ticketId) {
        staffActiveTicketId = ticketId;
        
        els.staffTicketsList.querySelectorAll('.ticket-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === ticketId);
        });
        
        els.staffChatPlaceholder.classList.add('hidden');
        els.staffChatContainer.classList.remove('hidden');
        
        try {
            // Use admin API to get ticket details with messages
            const ticketData = await adminApi(`/api/admin-portal-tickets`);
            const ticket = (ticketData.tickets || []).find(t => t.id === ticketId);
            
            if (!ticket) {
                throw new Error('Ticket not found');
            }
            
            // Get messages using admin token
            const messagesData = await adminApi(`/api/portal-messages?ticket_id=${ticketId}`);
            const messages = messagesData.messages || [];
            lastStaffMessageAt = messages.length ? messages[messages.length - 1].created_at : '';
            
            els.staffChatSubject.textContent = ticket.subject;
            els.staffChatOrder.textContent = `Order: ${ticket.order_id || 'N/A'}`;
            els.staffChatStatus.textContent = ticket.status;
            els.staffChatStatus.className = `chat-status ${ticket.status}`;
            
            // Update button visibility based on status
            const chatInputArea = document.getElementById('staff-chat-input-area');
            if (ticket.status === 'claimed') {
                els.btnCloseTicket.style.display = 'none';
                els.btnClaimTicket.style.display = 'none';
                if (chatInputArea) chatInputArea.style.display = 'none';
            } else if (ticket.status === 'closed') {
                els.btnCloseTicket.style.display = 'none';
                els.btnClaimTicket.style.display = 'none';
                if (chatInputArea) chatInputArea.style.display = 'none';
            } else {
                els.btnCloseTicket.style.display = 'inline-flex';
                els.btnClaimTicket.style.display = 'inline-flex';
                if (chatInputArea) chatInputArea.style.display = 'flex';
            }
            
            if (messages.length === 0) {
                els.staffChatMessages.innerHTML = '<p class="empty-text" style="padding: 40px; text-align: center;">No messages yet</p>';
            } else {
                els.staffChatMessages.innerHTML = messages.map(msg => `
                    <div class="message ${msg.author_role === 'admin' ? 'staff' : 'customer'}">
                        <div class="message-header">
                            <i class="fas fa-${msg.author_role === 'admin' ? 'headset' : 'user'}"></i>
                            ${msg.author_role === 'admin' ? 'Staff' : 'Customer'}
                        </div>
                        <div class="message-body">${escapeHtml(msg.body)}</div>
                        <div class="message-time">${new Date(msg.created_at).toLocaleString()}</div>
                    </div>
                `).join('');
            }
            
            els.staffChatMessages.scrollTop = els.staffChatMessages.scrollHeight;
            
            if (staffPollInterval) clearInterval(staffPollInterval);
            staffPollInterval = setInterval(() => pollStaffMessages(ticketId), 2000);
            
        } catch (error) {
            console.error('Failed to load staff ticket:', error);
            els.staffChatMessages.innerHTML = `<p class="error-text" style="padding: 40px; text-align: center;">Error loading messages: ${escapeHtml(error.message)}</p>`;
        }
    }

    async function pollStaffMessages(ticketId) {
        if (!staffActiveTicketId || staffActiveTicketId !== ticketId) return;
        if (document.hidden) return;
        
        try {
            const suffix = lastStaffMessageAt ? `&after=${encodeURIComponent(lastStaffMessageAt)}` : '';
            const data = await adminApi(`/api/portal-messages?ticket_id=${ticketId}${suffix}`);
            const messages = data.messages || [];
            if (messages.length > 0) {
                // Check if new message is from customer
                const newMessages = messages;
                const hasNewCustomerMessage = newMessages.some(m => m.author_role === 'customer');
                
                if (messages.length === 0) {
                    els.staffChatMessages.innerHTML = '<p class="empty-text" style="padding: 40px; text-align: center;">No messages yet</p>';
                } else {
                    els.staffChatMessages.insertAdjacentHTML('beforeend', messages.map(msg => `
                        <div class="message ${msg.author_role === 'admin' ? 'staff' : 'customer'}">
                            <div class="message-header">
                                <i class="fas fa-${msg.author_role === 'admin' ? 'headset' : 'user'}"></i>
                                ${msg.author_role === 'admin' ? 'Staff' : 'Customer'}
                            </div>
                            <div class="message-body">${escapeHtml(msg.body)}</div>
                            <div class="message-time">${new Date(msg.created_at).toLocaleString()}</div>
                        </div>
                    `).join(''));
                }
                lastStaffMessageAt = messages[messages.length - 1].created_at;
                
                els.staffChatMessages.scrollTop = els.staffChatMessages.scrollHeight;
                
                // Play sound if customer responded
                if (hasNewCustomerMessage) {
                    playNotificationSound();
                }
            }
        } catch (error) {
            console.error('Failed to poll staff messages:', error);
        }
    }

    async function sendStaffReply() {
        if (!staffActiveTicketId) return;
        
        const message = els.staffReplyMessage.value.trim();
        if (!message) return;
        
        const tempId = `staff-pending-${Date.now()}`;
        els.staffChatMessages.insertAdjacentHTML('beforeend', `<div class="message staff" id="${tempId}" style="opacity:.65"><div class="message-header"><i class="fas fa-headset"></i>Staff</div><div class="message-body">${escapeHtml(message)}</div><div class="message-time">Sending…</div></div>`);
        els.staffChatMessages.scrollTop = els.staffChatMessages.scrollHeight;
        els.staffReplyMessage.value = '';

        try {
            const result = await adminApi('/api/portal-messages?ticket_id=' + staffActiveTicketId, {
                method: 'POST',
                body: { ticket_id: staffActiveTicketId, body: message, author_role: 'admin' }
            });
            document.getElementById(tempId)?.remove();
            const msg = result.message;
            if (msg) {
                els.staffChatMessages.insertAdjacentHTML('beforeend', `<div class="message staff"><div class="message-header"><i class="fas fa-headset"></i>Staff</div><div class="message-body">${escapeHtml(msg.body)}</div><div class="message-time">${new Date(msg.created_at).toLocaleString()}</div></div>`);
                lastStaffMessageAt = msg.created_at;
            }
            els.staffChatMessages.scrollTop = els.staffChatMessages.scrollHeight;
            
        } catch (error) {
            document.getElementById(tempId)?.remove();
            els.staffReplyMessage.value = message;
            showToast(error.message || 'Failed to send message', 'error');
        }
    }

    async function closeTicket() {
        if (!staffActiveTicketId) return;
        
        if (!confirm('Close this ticket? Customers cannot reply until reopened.')) return;
        
        try {
            await adminApi('/api/admin-portal-tickets', {
                method: 'PATCH',
                body: { id: staffActiveTicketId, status: 'closed' }
            });
            
            showToast('Ticket closed');
            loadStaffTickets();
            openStaffTicket(staffActiveTicketId);
            
        } catch (error) {
            showToast(error.message || 'Failed to close ticket', 'error');
        }
    }

    async function claimTicket() {
        if (!staffActiveTicketId) return;
        
        if (!confirm('Mark this order as claimed? This locks the thread permanently.')) return;
        
        try {
            await adminApi('/api/admin-portal-tickets', {
                method: 'PATCH',
                body: { id: staffActiveTicketId, status: 'claimed' }
            });
            
            showToast('Ticket marked as claimed');
            loadStaffTickets();
            openStaffTicket(staffActiveTicketId);
            
        } catch (error) {
            showToast(error.message || 'Failed to claim ticket', 'error');
        }
    }

    // =========================================
    // Announcements Admin
    // =========================================
    async function loadAdminAnnouncements() {
        try {
            const data = await adminApi('/api/admin-portal-announcements');
            const announcements = data.announcements || [];
            
            if (announcements.length === 0) {
                els.adminAnnouncementsList.innerHTML = '<p class="empty-text">No announcements yet</p>';
                return;
            }
            
            els.adminAnnouncementsList.innerHTML = announcements.map(a => `
                <div class="announcement-item" style="margin-bottom: 12px; position: relative;">
                    <h4>${escapeHtml(a.title)}</h4>
                    <p>${escapeHtml(a.body?.substring(0, 100) || '')}...</p>
                    <span class="date">${new Date(a.published_at || a.created_at).toLocaleDateString()} · ${a.is_published ? 'Published' : 'Draft'}</span>
                    <button onclick="deleteAnnouncement('${a.id}')" style="position: absolute; top: 14px; right: 14px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Failed to load admin announcements:', error);
        }
    }

    async function postAnnouncement() {
        const title = els.annTitle.value.trim();
        const body = els.annBody.value.trim();
        const published = els.annPublished.checked;
        
        if (!title || !body) {
            showToast('Title and content are required', 'error');
            return;
        }
        
        try {
            await adminApi('/api/admin-portal-announcements', {
                method: 'POST',
                body: {
                    title,
                    body,
                    body_format: 'markdown',
                    is_published: published,
                    published_at: published ? new Date().toISOString() : null
                }
            });
            
            els.annTitle.value = '';
            els.annBody.value = '';
            els.annPublished.checked = true;
            
            showToast('Announcement posted!');
            loadAdminAnnouncements();
            
        } catch (error) {
            showToast(error.message || 'Failed to post announcement', 'error');
        }
    }

    window.deleteAnnouncement = async function(id) {
        if (!confirm('Delete this announcement?')) return;
        
        try {
            await adminApi(`/api/admin-portal-announcements?id=${id}`, { method: 'DELETE' });
            showToast('Announcement deleted');
            loadAdminAnnouncements();
        } catch (error) {
            showToast(error.message || 'Failed to delete', 'error');
        }
    };

    // =========================================
    // Navigation
    // =========================================
    function navigateTo(section) {
        currentSection = section;
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });
        
        document.querySelectorAll('.content-section').forEach(sec => {
            sec.classList.remove('active');
        });
        document.getElementById(`section-${section}`).classList.add('active');
        
        if (section === 'tickets') loadTickets();
        if (section === 'staff-inbox') loadStaffTickets();
        if (section === 'announcements-admin') loadAdminAnnouncements();
    }

    // =========================================
    // Sound Notifications
    // =========================================
    function playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Create a pleasant chime sound
            oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
            oscillator.frequency.exponentialRampToValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
            oscillator.frequency.exponentialRampToValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (e) {
            console.log('Audio not supported');
        }
    }
    
    function playNewTicketSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Different sound for new tickets - higher pitch
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
            oscillator.frequency.exponentialRampToValueAtTime(1108.73, audioContext.currentTime + 0.1); // C#6
            oscillator.frequency.exponentialRampToValueAtTime(1318.51, audioContext.currentTime + 0.2); // E6
            
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.6);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.6);
        } catch (e) {
            console.log('Audio not supported');
        }
    }

    // =========================================
    // Utilities
    // =========================================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // =========================================
    // Event Listeners
    // =========================================
    function initEventListeners() {
        // Legacy order login
        els.btnLogin.addEventListener('click', login);
        els.orderIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
        
        // Admin login
        els.btnAdminLogin.addEventListener('click', adminLogin);
        els.btnToggleLogin.addEventListener('click', toggleLoginMode);
        els.adminTokenInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminLogin();
        });
        
        // Logout
        els.btnLogout.addEventListener('click', logout);
        els.btnLogoutAll.addEventListener('click', logout);
        
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(item.dataset.section);
            });
        });
        
        // Tickets
        els.btnCreateTicket.addEventListener('click', createTicket);
        els.btnSendReply.addEventListener('click', sendReply);
        els.replyMessage.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendReply();
            }
        });
        
        // Staff inbox
        els.btnStaffSendReply.addEventListener('click', sendStaffReply);
        els.staffReplyMessage.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendStaffReply();
            }
        });
        els.btnCloseTicket.addEventListener('click', closeTicket);
        els.btnClaimTicket.addEventListener('click', claimTicket);
        
        // Announcements
        els.btnPostAnnouncement.addEventListener('click', postAnnouncement);
    }

    // =========================================
    // Guide Tabs
    // =========================================
    window.switchGuideTab = function(guide) {
        // Update tab buttons
        document.querySelectorAll('.guide-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.guide === guide);
        });
        
        // Update content
        document.querySelectorAll('.guide-content').forEach(content => {
            content.classList.toggle('active', content.id === 'guide-' + guide);
            content.style.display = content.id === 'guide-' + guide ? 'block' : 'none';
        });
    };

    // =========================================
    // Initialize
    // =========================================
    async function init() {
        initParticles();
        initEventListeners();
        loadPublicAnnouncements();
        
        // Exchange a short-lived email claim. An Order ID alone never grants access.
        const claimToken = new URLSearchParams(window.location.search).get('claim');
        if (claimToken) {
            try {
                const response = await fetch(`${API_BASE}/api/portal-claim-by-order`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ claim_token: claimToken })
                });
                const data = await response.json();
                if (!response.ok || !data.portal_token) throw new Error(data.error || 'This access link is invalid or expired.');
                currentToken = data.portal_token;
                localStorage.setItem(STORAGE_KEY, currentToken);
                history.replaceState({}, document.title, window.location.pathname);
                await loadDashboard();
                return;
            } catch (error) {
                history.replaceState({}, document.title, window.location.pathname);
                showLoginError(error.message || 'This access link is invalid or expired.');
            }
        }

        // Check for existing session
        const savedToken = localStorage.getItem(STORAGE_KEY);
        const adminToken = sessionStorage.getItem(ADMIN_KEY);
        
        if (adminToken) {
            isAdminMode = true;
            document.body.classList.add('is-admin');
            loadAdminDashboard();
        } else if (savedToken) {
            currentToken = savedToken;
            loadDashboard();
        }
    }

    // Start
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/**
 * Secure Energy Analytics Portal - Main Controller v3.2
 * 
 * v3.2 Updates:
 * - Client Command Center: docked full-width at top of screen (not in widget grid)
 * - Command Center replaces client-lookup/client-admin as primary client interface
 * - 6 new COMMAND_CENTER_* message handlers for activity logging
 * - Permission toggle for client-command-center in user admin
 * - Activity log icons and formatters for Command Center events
 * - Legacy client-lookup and client-admin widgets preserved as toggleable
 * 
 * v3.1 Updates:
 * - Password Reset widget: users can change their own password
 * - Force Password Reset: admins can require any/all users to reset on next login
 * - Full-screen mandatory reset overlay blocks portal until password is changed
 * - SHA-256 password hashing (backward compatible with plain text)
 * - createUser() now async for password hashing support
 * - Activity log labels/colors/icons for password events
 * 
 * v3.0 Updates:
 * - Activity Log now syncs from Azure for cross-device visibility
 * - Admins can see ALL users' activities (not just their own)
 * - Added "Sync All" button to fetch latest activities from Azure
 * - Auto-refresh when Azure activity data loads
 * 
 * v2.9 Updates:
 * - Added Feedback & Support widget with dual versions (light/admin)
 * - Admin users see full ticket management + Activity Log + Error Log
 * - Standard users see ticket submission and own ticket tracking
 * - Added 'feedback' permission to user management
 * - TicketStore integration for GitHub-synced tickets
 * - Added 30-minute session timeout with 2-minute warning
 * - Fixed session persistence on page refresh
 * 
 * v2.8 Updates:
 * - Activity Log auto-refreshes when activities are logged
 * - Added User filter dropdown for admins to filter by user
 * - Enhanced activity display with color-coding and data previews
 * - Added AI Query count to stats dashboard
 * - Added Refresh button to Activity Log
 * - Better filtering options (LMP Export, AI Query, Data Upload, History Export)
 * 
 * v2.7 Updates:
 * - Added AE Intelligence (BUDA) widget integration via iframe
 * - AE Intelligence permission controls added to User Administration
 * 
 * v2.6 Updates:
 * - User Admin and Client Admin widgets now extra-wide (admin-wide class)
 * - Comprehensive activity logging for ALL widget actions (save, analyze, expand, etc.)
 * - Error reporting notification at login showing any widget errors
 * - Widget expanded state persists when save/analyze actions occur
 * - New message handlers for widget state tracking
 * - Enhanced error summary in activity tracker
 */

let currentUser = null;

// Session timeout configuration (30 minutes)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_WARNING_MS = 2 * 60 * 1000;  // Warn 2 minutes before timeout
let sessionTimeoutId = null;
let sessionWarningId = null;
let lastActivityTime = Date.now();

const DEFAULT_WIDGETS = [
    { id: 'user-admin', name: 'User Administration', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', adminOnly: true, adminWide: true, fullWidth: true, embedded: true, defaultHeight: 800, minHeight: 500, maxHeight: 1400, doubleHeight: true },
    { id: 'client-admin', name: 'Client Administration', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', src: 'widgets/client-admin-widget.html', adminOnly: true, adminWide: true, fullWidth: true, defaultHeight: 800, minHeight: 500, maxHeight: 1400, doubleHeight: true },
    { id: 'client-lookup', name: 'Client Lookup', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>', src: 'widgets/client-lookup-widget.html', fullWidth: false, defaultHeight: 220, minHeight: 180, maxHeight: 350 },
    { id: 'energy-utilization', name: 'Energy Utilization', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>', src: 'widgets/energy-utilization-widget.html', fullWidth: false, defaultHeight: 650, minHeight: 500, maxHeight: 900 },
    { id: 'bid-management', name: 'Bid Management', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', src: 'widgets/bid-management-widget.html', fullWidth: true, defaultHeight: 900, minHeight: 500, maxHeight: 1400 },
    { id: 'ai-assistant', name: 'AI Assistant', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>', fullWidth: true, embedded: true, defaultHeight: 500, minHeight: 300, maxHeight: 800 },
    { id: 'aei-intelligence', name: 'AE Intelligence (BUDA)', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>', src: 'widgets/aei-widget.html', fullWidth: true, defaultHeight: 700, minHeight: 400, maxHeight: 1200 },
    { id: 'lmp-analytics', name: 'LMP Analytics V2', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>', src: 'widgets/lmp-analytics.html', fullWidth: true, defaultHeight: 800, minHeight: 400, maxHeight: 1200 },
    { id: 'data-manager', name: 'LMP Data Manager', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>', src: 'widgets/lmp-data-manager.html', defaultHeight: 500, minHeight: 300, maxHeight: 900 },
    { id: 'arcadia-fetcher', name: 'Arcadia LMP Data Fetcher', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>', src: 'widgets/arcadia-lmp-fetcher.html', defaultHeight: 500, minHeight: 300, maxHeight: 800 },
    { id: 'lmp-comparison', name: 'LMP Comparison Portal', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', src: 'widgets/lmp-comparison-portal.html', fullWidth: true, defaultHeight: 700, minHeight: 400, maxHeight: 1100 },
    { id: 'peak-demand', name: 'Peak Demand Analytics', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>', src: 'widgets/peak-demand-widget.html', fullWidth: true, defaultHeight: 750, minHeight: 400, maxHeight: 1100 },
    { id: 'analysis-history', name: 'My Analysis History', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', fullWidth: true, embedded: true, defaultHeight: 500, minHeight: 300, maxHeight: 900 },
    { id: 'feedback', name: 'Feedback & Support', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>', src: 'widgets/feedback-widget-light.html', adminSrc: 'widgets/feedback-admin-portal.html', fullWidth: true, defaultHeight: 600, minHeight: 400, maxHeight: 1000, permission: 'feedback' },
    { id: 'password-reset', name: 'Change Password', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>', src: 'widgets/password-reset-widget.html', fullWidth: false, defaultHeight: 650, minHeight: 400, maxHeight: 900, permission: 'password-reset' }
];

let WIDGETS = JSON.parse(JSON.stringify(DEFAULT_WIDGETS));

const WidgetLayout = {
    getWidgetConfig(userId, widgetId) {
        if (typeof WidgetPreferences !== 'undefined') return WidgetPreferences.getWidgetConfig(userId, widgetId);
        return null;
    },
    saveWidgetConfig(userId, widgetId, config) {
        if (typeof WidgetPreferences !== 'undefined') WidgetPreferences.saveWidgetConfig(userId, widgetId, config);
    },
    saveOrder(userId, orderArray) {
        if (typeof WidgetPreferences !== 'undefined') WidgetPreferences.saveOrder(userId, orderArray);
    },
    getOrder(userId) {
        if (typeof WidgetPreferences !== 'undefined') return WidgetPreferences.getOrder(userId);
        return [];
    },
    resetLayout(userId) {
        if (typeof WidgetPreferences !== 'undefined') WidgetPreferences.resetForUser(userId);
    }
};

window.setTheme = function(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('secureEnergy_theme', theme);
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === theme));
    document.querySelectorAll('iframe').forEach(iframe => { try { iframe.contentDocument?.documentElement?.setAttribute('data-theme', theme); } catch {} });
};

function loadSavedTheme() { window.setTheme(localStorage.getItem('secureEnergy_theme') || 'dark'); }

document.addEventListener('DOMContentLoaded', async function() {
    console.log('[Portal] Initializing v3.1 - Password Security + Force Reset...');
    loadSavedTheme();
    await UserStore.init();
    await ActivityLog.init();
    await SecureEnergyData.init();
    if (typeof SecureEnergyClients !== 'undefined') {
        SecureEnergyClients.init();
        SecureEnergyClients.subscribe((event, data) => {
            console.log('[Portal] SecureEnergyClients event received:', event);
            if (event === 'activeClientChanged') { 
                console.log('[Portal] Handling activeClientChanged - Client:', data.client?.name);
                broadcastActiveClientToWidgets(data.client, data.account || null); 
                updateGlobalClientIndicator(); 
            }
            if (event === 'activeAccountChanged') { 
                console.log('[Portal] Handling activeAccountChanged - Account:', data.account?.accountName);
                broadcastActiveAccountToWidgets(data.account, data.client); 
                updateGlobalClientIndicator(); 
            }
        });
        console.log('[Portal] Subscribed to SecureEnergyClients events');
    }
    if (typeof SecureEnergySuppliers !== 'undefined') SecureEnergySuppliers.init();
    if (typeof SecureEnergyBids !== 'undefined') SecureEnergyBids.init();
    
    // Initialize TicketStore for feedback system
    if (typeof TicketStore !== 'undefined') {
        TicketStore.init().then(() => {
            console.log('[Portal] TicketStore initialized');
        }).catch(e => {
            console.warn('[Portal] TicketStore init failed:', e.message);
        });
    }
    
    GitHubSync.pullLatest();
    initAuth();
    AISearch.init();
    initWeather();
    initClock();
    SecureEnergyData.subscribe(updateDataStatus);
    updateDataStatus();
    window.addEventListener('message', handleWidgetMessage);
    
    // Auto-refresh activity log when activities are logged
    window.addEventListener('activityLogged', function() {
        refreshActivityLogIfVisible();
        if (document.getElementById('analysisHistoryContent')) renderAnalysisHistory();
    });
    
    // Auto-refresh when Azure activity log data is ready
    window.addEventListener('activityLogReady', function() {
        console.log('[Portal] ActivityLog ready from Azure, refreshing display...');
        refreshActivityLogIfVisible();
    });
    
    // Auto-refresh analysis history when AnalysisStore syncs from Azure
    window.addEventListener('analysisStoreReady', function() {
        console.log('[Portal] AnalysisStore ready from Azure, refreshing analysis history...');
        if (document.getElementById('analysisHistoryContent')) renderAnalysisHistory();
    });
    
    console.log('[Portal] Ready');
});

async function initWeather() {
    const tempEl = document.getElementById('weatherTemp'), locEl = document.getElementById('weatherLocation');
    if (!tempEl) return;
    try {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => fetchWeather(pos.coords.latitude, pos.coords.longitude), () => fetchWeather(40.7128, -74.006));
        } else fetchWeather(40.7128, -74.006);
    } catch { locEl.textContent = 'Unavailable'; }
}

async function fetchWeather(lat, lon) {
    const tempEl = document.getElementById('weatherTemp'), locEl = document.getElementById('weatherLocation');
    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto');
        const data = await res.json();
        if (data.current) {
            tempEl.textContent = Math.round(data.current.temperature_2m) + '°F';
            try {
                const geoRes = await fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon);
                const geo = await geoRes.json();
                locEl.textContent = geo.address?.city || geo.address?.town || 'Current Location';
            } catch { locEl.textContent = 'Current Location'; }
        }
    } catch { tempEl.textContent = '--°F'; locEl.textContent = 'Unavailable'; }
}

function initClock() { updateClock(); setInterval(updateClock, 1000); }
function updateClock() {
    const timeEl = document.getElementById('clockTime'), dateEl = document.getElementById('clockDate');
    if (!timeEl) return;
    const now = new Date(), h = now.getHours();
    timeEl.textContent = (h % 12 || 12) + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0') + ' ' + (h >= 12 ? 'PM' : 'AM');
    dateEl.textContent = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()] + ', ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()] + ' ' + now.getDate();
}

// =====================================================
// SESSION TIMEOUT MANAGEMENT
// =====================================================
function initSessionTimeout() {
    if (!currentUser) return;
    
    // Activity events that reset the timeout
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    
    activityEvents.forEach(event => {
        document.addEventListener(event, resetSessionTimeout, { passive: true });
    });
    
    // Also track activity in iframes
    window.addEventListener('message', (event) => {
        if (event.data?.type === 'USER_ACTIVITY') {
            resetSessionTimeout();
        }
    });
    
    // Start the timeout
    resetSessionTimeout();
    console.log('[Session] Timeout initialized (30 minutes)');
}

function resetSessionTimeout() {
    if (!currentUser) return;
    
    lastActivityTime = Date.now();
    
    // Clear existing timers
    if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
    if (sessionWarningId) clearTimeout(sessionWarningId);
    
    // Hide warning if showing
    hideSessionWarning();
    
    // Set warning timer (2 minutes before timeout)
    sessionWarningId = setTimeout(showSessionWarning, SESSION_TIMEOUT_MS - SESSION_WARNING_MS);
    
    // Set logout timer
    sessionTimeoutId = setTimeout(sessionTimeout, SESSION_TIMEOUT_MS);
}

function showSessionWarning() {
    if (!currentUser) return;
    
    // Create warning overlay if it doesn't exist
    let warning = document.getElementById('sessionWarning');
    if (!warning) {
        warning = document.createElement('div');
        warning.id = 'sessionWarning';
        warning.innerHTML = `
            <div class="session-warning-content">
                <div class="session-warning-icon">⏰</div>
                <h3>Session Expiring Soon</h3>
                <p>Your session will expire in <span id="sessionCountdown">2:00</span> due to inactivity.</p>
                <div class="session-warning-buttons">
                    <button class="btn-primary" onclick="resetSessionTimeout(); hideSessionWarning();">Stay Logged In</button>
                    <button class="btn-secondary" onclick="document.getElementById('logoutBtn').click();">Logout Now</button>
                </div>
            </div>
        `;
        warning.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.8); display: flex; align-items: center;
            justify-content: center; z-index: 10000; opacity: 0;
            transition: opacity 0.3s ease;
        `;
        const style = document.createElement('style');
        style.textContent = `
            .session-warning-content {
                background: var(--bg-secondary, #22262e); padding: 32px 40px;
                border-radius: 16px; text-align: center; max-width: 400px;
                border: 1px solid var(--border-color, #3d4450);
                box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            }
            .session-warning-icon { font-size: 48px; margin-bottom: 16px; }
            .session-warning-content h3 {
                margin: 0 0 12px; font-size: 20px;
                color: var(--text-primary, #e8eaed);
            }
            .session-warning-content p {
                margin: 0 0 24px; color: var(--text-secondary, #9aa0a6);
                font-size: 14px;
            }
            #sessionCountdown {
                font-weight: 700; color: #f59e0b; font-size: 16px;
            }
            .session-warning-buttons { display: flex; gap: 12px; justify-content: center; }
            .session-warning-buttons button {
                padding: 10px 24px; border-radius: 8px; font-size: 14px;
                font-weight: 600; cursor: pointer; border: none;
            }
            .session-warning-buttons .btn-primary {
                background: var(--accent-green, #00A651); color: white;
            }
            .session-warning-buttons .btn-secondary {
                background: var(--bg-tertiary, #2a2f38); color: var(--text-primary, #e8eaed);
                border: 1px solid var(--border-color, #3d4450);
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(warning);
    }
    
    warning.style.display = 'flex';
    setTimeout(() => warning.style.opacity = '1', 10);
    
    // Start countdown
    let secondsLeft = SESSION_WARNING_MS / 1000;
    const countdownEl = document.getElementById('sessionCountdown');
    
    const countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0 || !document.getElementById('sessionWarning')?.style.display || document.getElementById('sessionWarning')?.style.display === 'none') {
            clearInterval(countdownInterval);
            return;
        }
        const mins = Math.floor(secondsLeft / 60);
        const secs = secondsLeft % 60;
        if (countdownEl) countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
    
    warning.dataset.countdownInterval = countdownInterval;
}

function hideSessionWarning() {
    const warning = document.getElementById('sessionWarning');
    if (warning) {
        warning.style.opacity = '0';
        setTimeout(() => warning.style.display = 'none', 300);
        if (warning.dataset.countdownInterval) {
            clearInterval(parseInt(warning.dataset.countdownInterval));
        }
    }
}

function sessionTimeout() {
    if (!currentUser) return;
    
    console.log('[Session] Timed out after 30 minutes of inactivity');
    
    // Log the timeout
    ActivityLog.log({
        userId: currentUser.id,
        userEmail: currentUser.email,
        userName: currentUser.firstName + ' ' + currentUser.lastName,
        widget: 'portal',
        action: 'Session Timeout',
        data: { lastActivity: new Date(lastActivityTime).toISOString() }
    });
    
    // Clear session
    UserStore.clearSession();
    currentUser = null;
    
    // Clear timers
    if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
    if (sessionWarningId) clearTimeout(sessionWarningId);
    
    // Hide warning and show login
    hideSessionWarning();
    showLogin();
    
    // Show timeout message
    showNotification('Session expired due to inactivity. Please log in again.', 'warning');
}

function clearSessionTimers() {
    if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
    if (sessionWarningId) clearTimeout(sessionWarningId);
    hideSessionWarning();
}

function initAuth() {
    currentUser = UserStore.getSession();
    if (currentUser) {
        // Set user in ClientStore for user-specific active client/account
        if (typeof SecureEnergyClients !== 'undefined' && SecureEnergyClients.setCurrentUser) {
            SecureEnergyClients.setCurrentUser(currentUser.id);
        }
        // Check if force reset is still pending
        if (currentUser.forcePasswordReset) {
            showForcePasswordReset(currentUser);
        } else {
            showPortal(currentUser);
            initSessionTimeout();
        }
    } else {
        showLogin();
    }
    const users = UserStore.getAll();
    document.getElementById('firstTimeNote').style.display = users.length <= 1 ? 'block' : 'none';
}

function showLogin() {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('hidden');
}

function showPortal(user) {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('userName').textContent = user.firstName + ' ' + user.lastName;
    document.getElementById('userAvatar').textContent = user.firstName.charAt(0) + user.lastName.charAt(0);
    document.getElementById('userRole').textContent = user.role === 'admin' ? 'Administrator' : 'User';
    document.getElementById('userRole').className = 'user-role ' + (user.role === 'admin' ? 'admin' : '');
    renderWidgets(user);
    if (user.role === 'admin') showLoginErrorSummary();
    
    // Remove force reset overlay if it exists
    const forceOverlay = document.getElementById('forcePasswordResetOverlay');
    if (forceOverlay) forceOverlay.remove();
}

// =====================================================
// FORCE PASSWORD RESET OVERLAY
// =====================================================
function showForcePasswordReset(user) {
    // Hide login, hide main content — user CANNOT access the portal
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    
    // Remove existing overlay if present
    let overlay = document.getElementById('forcePasswordResetOverlay');
    if (overlay) overlay.remove();
    
    overlay = document.createElement('div');
    overlay.id = 'forcePasswordResetOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:var(--bg-primary, #0f1117);display:flex;align-items:center;justify-content:center;flex-direction:column;overflow-y:auto;';
    
    overlay.innerHTML = '<div style="max-width:600px;width:100%;padding:24px;">' +
        '<div style="text-align:center;margin-bottom:24px;">' +
            '<div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:16px;background:rgba(239,68,68,0.1);border:2px solid rgba(239,68,68,0.3);margin-bottom:16px;">' +
                '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0z"/></svg>' +
            '</div>' +
            '<h2 style="margin:0 0 8px;font-size:22px;color:var(--text-primary, #e8eaed);font-weight:700;">Password Reset Required</h2>' +
            '<p style="margin:0;color:var(--text-secondary, #9aa0a6);font-size:14px;line-height:1.5;">' +
                'Your administrator requires you to change your password before continuing.<br>' +
                'Please set a new, secure password below.' +
            '</p>' +
            '<div style="display:inline-flex;align-items:center;gap:8px;margin-top:12px;padding:6px 14px;background:var(--bg-tertiary, #22262e);border-radius:20px;font-size:13px;color:var(--text-secondary, #9aa0a6);">' +
                '<span style="width:22px;height:22px;border-radius:50%;background:var(--accent-primary, #4ade80);color:#000;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">' + escapeHtml((user.firstName?.charAt(0) || '') + (user.lastName?.charAt(0) || '')) + '</span>' +
                escapeHtml(user.firstName + ' ' + user.lastName) + ' (' + escapeHtml(user.email) + ')' +
            '</div>' +
        '</div>' +
        '<div style="background:var(--bg-secondary, #1a1d27);border:1px solid var(--border-color, #3d4450);border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">' +
            '<iframe id="forceResetIframe" src="widgets/password-reset-widget.html" style="width:100%;height:600px;border:none;display:block;" title="Password Reset"></iframe>' +
        '</div>' +
        '<div style="text-align:center;margin-top:16px;">' +
            '<button onclick="forceResetLogout()" style="background:none;border:none;color:var(--text-tertiary, #5f6368);font-size:13px;cursor:pointer;text-decoration:underline;">Logout instead</button>' +
        '</div>' +
    '</div>';
    
    document.body.appendChild(overlay);
    
    // Apply current theme to the force reset iframe
    const theme = document.documentElement.getAttribute('data-theme');
    if (theme) {
        const iframe = document.getElementById('forceResetIframe');
        if (iframe) {
            iframe.addEventListener('load', function() {
                try { iframe.contentDocument?.documentElement?.setAttribute('data-theme', theme); } catch (e) {}
            });
        }
    }
    
    console.log('[Portal] Force password reset shown for:', user.email);
}

window.forceResetLogout = function() {
    if (currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'portal', action: 'Logout (During Force Reset)' });
    }
    clearSessionTimers();
    UserStore.clearSession();
    currentUser = null;
    const overlay = document.getElementById('forcePasswordResetOverlay');
    if (overlay) overlay.remove();
    showLogin();
    showNotification('Logged out', 'info');
};

function showLoginErrorSummary() {
    if (typeof ErrorLog === 'undefined') return;
    const stats = ErrorLog.getStats();
    const unresolvedCount = stats.unresolved || 0;
    const todayCount = stats.today || 0;
    if (unresolvedCount > 0 || todayCount > 0) {
        const message = todayCount > 0 
            ? '⚠️ ' + todayCount + ' error' + (todayCount > 1 ? 's' : '') + ' today, ' + unresolvedCount + ' unresolved total'
            : '⚠️ ' + unresolvedCount + ' unresolved error' + (unresolvedCount > 1 ? 's' : '') + ' in system';
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'portal', action: 'Error Check at Login', data: { unresolvedCount, todayCount, errorsByWidget: stats.byWidget } });
        showNotification(message, 'warning');
        if (unresolvedCount >= 5) console.warn('[Portal] Error Summary:', stats.byWidget);
    }
}

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value, password = document.getElementById('loginPassword').value;
    const result = await UserStore.authenticate(email, password);
    if (result.success) {
        currentUser = result.user;
        UserStore.setCurrentUser(result.user);
        // Set user in ClientStore for user-specific active client/account
        if (typeof SecureEnergyClients !== 'undefined' && SecureEnergyClients.setCurrentUser) {
            SecureEnergyClients.setCurrentUser(result.user.id);
        }
        
        // Check if user must reset their password before accessing the portal
        if (result.user.forcePasswordReset) {
            showForcePasswordReset(result.user);
            ActivityLog.log({ userId: result.user.id, userEmail: result.user.email, userName: result.user.firstName + ' ' + result.user.lastName, widget: 'portal', action: 'Login (Force Reset Required)' });
        } else {
            showPortal(result.user);
            initSessionTimeout();
            showNotification('Welcome back, ' + result.user.firstName + '!', 'success');
            ActivityLog.log({ userId: result.user.id, userEmail: result.user.email, userName: result.user.firstName + ' ' + result.user.lastName, widget: 'portal', action: 'Login' });
        }
    } else {
        document.getElementById('loginError').textContent = result.error;
        document.getElementById('loginError').classList.add('show');
        ErrorLog.log({ type: 'auth', widget: 'portal', message: 'Failed login attempt for: ' + email, context: { email, error: result.error } });
    }
});

document.getElementById('logoutBtn').addEventListener('click', function() {
    if (currentUser) ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'portal', action: 'Logout' });
    clearSessionTimers(); // Clear session timeout timers
    UserStore.clearSession();
    currentUser = null;
    // Clear user in ClientStore (will fall back to default non-user-specific storage)
    if (typeof SecureEnergyClients !== 'undefined' && SecureEnergyClients.setCurrentUser) {
        SecureEnergyClients.setCurrentUser(null);
    }
    showLogin();
    showNotification('Logged out', 'info');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').classList.remove('show');
});

let draggedWidget = null;
let dragOverWidget = null;

// =====================================================
// CLIENT COMMAND CENTER — DOCKED TOP-OF-SCREEN
// =====================================================
function renderCommandCenterDock(user) {
    const dockId = 'commandCenterDock';
    let dock = document.getElementById(dockId);
    
    // Check permission — if explicitly disabled, remove and bail
    if (user.permissions && user.permissions['client-command-center'] === false) {
        if (dock) dock.remove();
        return;
    }
    
    // Already rendered? Don't duplicate
    if (dock) return;
    
    // Find the insertion point — before the widgetsGrid, inside mainContent
    const mainContent = document.getElementById('mainContent');
    const widgetsGrid = document.getElementById('widgetsGrid');
    if (!mainContent || !widgetsGrid) return;
    
    dock = document.createElement('div');
    dock.id = dockId;
    dock.className = 'command-center-dock';
    
    // Collapse state from localStorage
    const isCollapsed = localStorage.getItem('commandCenter_collapsed') === 'true';
    
    dock.innerHTML = 
        '<div class="command-center-dock-header">' +
            '<div class="command-center-dock-title">' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>' +
                '<span>Client Command Center</span>' +
            '</div>' +
            '<div class="command-center-dock-actions">' +
                '<button class="command-center-dock-btn" onclick="toggleCommandCenterDock()" title="' + (isCollapsed ? 'Expand' : 'Collapse') + '" id="cmdCenterToggleBtn">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="' + (isCollapsed ? '6 9 12 15 18 9' : '18 15 12 9 6 15') + '"/></svg>' +
                '</button>' +
                '<button class="command-center-dock-btn" onclick="popoutWidget(\'client-command-center\')" title="Pop out">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
                '</button>' +
            '</div>' +
        '</div>' +
        '<div class="command-center-dock-body" id="commandCenterBody" style="' + (isCollapsed ? 'display:none;' : '') + '">' +
            '<iframe class="command-center-iframe" id="commandCenterIframe" src="widgets/client-command-center.html" title="Client Command Center"></iframe>' +
        '</div>';
    
    // Insert before the widgets grid
    mainContent.insertBefore(dock, widgetsGrid);
}

function toggleCommandCenterDock() {
    const body = document.getElementById('commandCenterBody');
    const btn = document.getElementById('cmdCenterToggleBtn');
    if (!body) return;
    
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    localStorage.setItem('commandCenter_collapsed', isHidden ? 'false' : 'true');
    
    if (btn) {
        btn.title = isHidden ? 'Collapse' : 'Expand';
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="' + (isHidden ? '18 15 12 9 6 15' : '6 9 12 15 18 9') + '"/></svg>';
    }
}

function renderWidgets(user) {
    const container = document.getElementById('widgetsGrid');
    container.innerHTML = '';
    
    // === DOCK: Client Command Center above widget grid ===
    renderCommandCenterDock(user);
    
    let availableWidgets = DEFAULT_WIDGETS.filter(w => {
        if (w.adminOnly && user.role !== 'admin') return false;
        if (user.permissions && user.permissions[w.id] === false) return false;
        return true;
    });
    const savedOrder = WidgetLayout.getOrder(user.id);
    if (savedOrder.length > 0) {
        availableWidgets.sort((a, b) => {
            const aIdx = savedOrder.indexOf(a.id), bIdx = savedOrder.indexOf(b.id);
            if (aIdx === -1 && bIdx === -1) return 0;
            if (aIdx === -1) return 1;
            if (bIdx === -1) return -1;
            return aIdx - bIdx;
        });
    }
    const resetBtn = document.createElement('div');
    resetBtn.className = 'widget-layout-controls';
    resetBtn.innerHTML = '<button class="layout-reset-btn" onclick="resetWidgetLayout()" title="Reset widget layout to default"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> Reset Layout</button>';
    container.appendChild(resetBtn);
    availableWidgets.forEach(w => container.appendChild(createWidgetElement(w, user)));
    if (user.role === 'admin') initAdminWidget();
    initAIAssistantWidget();
    initAnalysisHistoryWidget();
    initDragAndDrop();
}

function createWidgetElement(widget, user) {
    const div = document.createElement('div');
    const savedConfig = WidgetLayout.getWidgetConfig(user.id, widget.id) || {};
    const isCollapsed = savedConfig.collapsed || false;
    const isFullWidth = savedConfig.fullWidth !== undefined ? savedConfig.fullWidth : widget.fullWidth;
    const currentHeight = savedConfig.height || widget.defaultHeight || 500;
    const isDoubleHeight = widget.doubleHeight || false;
    const isAdminWide = widget.adminWide || false;
    
    let classList = 'widget';
    if (isAdminWide) classList += ' admin-wide';
    if (isFullWidth) classList += ' full-width';
    if (isCollapsed) classList += ' collapsed';
    if (isDoubleHeight) classList += ' double-height';
    
    div.className = classList;
    div.dataset.widgetId = widget.id;
    div.draggable = true;
    
    const controlsHtml = '<div class="widget-controls"><button class="widget-ctrl-btn collapse-btn" onclick="toggleWidgetCollapse(\'' + widget.id + '\')" title="' + (isCollapsed ? 'Expand' : 'Collapse') + '"><svg class="collapse-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="' + (isCollapsed ? '6 9 12 15 18 9' : '18 15 12 9 6 15') + '"/></svg></button><button class="widget-ctrl-btn width-btn" onclick="toggleWidgetWidth(\'' + widget.id + '\')" title="' + (isFullWidth ? 'Standard width' : 'Full width') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + (isFullWidth ? '<path d="M4 14h6v6H4zM14 4h6v6h-6z"/><path d="M14 14h6v6h-6z"/><path d="M4 4h6v6H4z"/>' : '<path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/>') + '</svg></button><div class="widget-drag-handle" title="Drag to reorder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg></div></div>';
    
    const popoutBtn = widget.src ? '<button class="widget-btn" onclick="popoutWidget(\'' + widget.id + '\')" title="Pop out"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>' : '';
    const contentStyle = 'height:' + currentHeight + 'px;' + (isCollapsed ? 'display:none;' : '');
    
    if (widget.embedded && widget.id === 'user-admin') {
        div.innerHTML = '<div class="widget-header"><div class="widget-title">' + widget.icon + '<span>' + widget.name + '</span><span class="widget-badge">ADMIN</span></div><div class="widget-actions">' + controlsHtml + '</div></div><div class="widget-content admin-widget-content" id="adminWidgetContent" style="' + contentStyle + '" data-default-height="' + widget.defaultHeight + '" data-min-height="' + widget.minHeight + '" data-max-height="' + widget.maxHeight + '"></div><div class="widget-resize-handle" data-widget-id="' + widget.id + '"></div>';
    } else if (widget.embedded && widget.id === 'ai-assistant') {
        div.innerHTML = '<div class="widget-header"><div class="widget-title">' + widget.icon + '<span>' + widget.name + '</span><span class="widget-badge" style="background:var(--accent-info);">BETA</span></div><div class="widget-actions">' + controlsHtml + '</div></div><div class="widget-content ai-assistant-content" id="aiAssistantContent" style="' + contentStyle + '" data-default-height="' + widget.defaultHeight + '" data-min-height="' + widget.minHeight + '" data-max-height="' + widget.maxHeight + '"></div><div class="widget-resize-handle" data-widget-id="' + widget.id + '"></div>';
    } else if (widget.embedded && widget.id === 'analysis-history') {
        div.innerHTML = '<div class="widget-header"><div class="widget-title">' + widget.icon + '<span>' + widget.name + '</span></div><div class="widget-actions"><button class="widget-btn" onclick="exportMyAnalysisRecords()" title="Export"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button><button class="widget-btn" onclick="refreshAnalysisHistory()" title="Refresh"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg></button>' + controlsHtml + '</div></div><div class="widget-content analysis-history-content" id="analysisHistoryContent" style="' + contentStyle + 'overflow-y:auto;" data-default-height="' + widget.defaultHeight + '" data-min-height="' + widget.minHeight + '" data-max-height="' + widget.maxHeight + '"></div><div class="widget-resize-handle" data-widget-id="' + widget.id + '"></div>';
    } else {
        // Determine widget source - use admin version for admin users if available
        let widgetSrc = widget.src;
        let adminBadge = '';
        if (widget.id === 'feedback' && user.role === 'admin' && widget.adminSrc) {
            widgetSrc = widget.adminSrc;
            adminBadge = '<span class="widget-badge">ADMIN</span>';
        }
        
        div.innerHTML = '<div class="widget-header"><div class="widget-title">' + widget.icon + '<span>' + widget.name + '</span>' + adminBadge + '</div><div class="widget-actions">' + popoutBtn + controlsHtml + '</div></div><div class="widget-content" style="' + contentStyle + '" data-default-height="' + widget.defaultHeight + '" data-min-height="' + widget.minHeight + '" data-max-height="' + widget.maxHeight + '"><iframe class="widget-iframe" src="' + widgetSrc + '" title="' + widget.name + '"></iframe></div><div class="widget-resize-handle" data-widget-id="' + widget.id + '"></div>';
    }
    return div;
}

function initDragAndDrop() {
    document.querySelectorAll('.widget[draggable="true"]').forEach(widget => {
        widget.addEventListener('dragstart', handleDragStart);
        widget.addEventListener('dragend', handleDragEnd);
        widget.addEventListener('dragover', handleDragOver);
        widget.addEventListener('dragenter', handleDragEnter);
        widget.addEventListener('dragleave', handleDragLeave);
        widget.addEventListener('drop', handleDrop);
    });
    initResizeHandles();
}

function handleDragStart(e) {
    draggedWidget = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.widgetId);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.widget').forEach(w => w.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom'));
    draggedWidget = null;
    dragOverWidget = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (this === draggedWidget) return;
    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    this.classList.remove('drag-over-top', 'drag-over-bottom');
    this.classList.add(e.clientY < midY ? 'drag-over-top' : 'drag-over-bottom');
}

function handleDragEnter(e) {
    e.preventDefault();
    if (this !== draggedWidget) { this.classList.add('drag-over'); dragOverWidget = this; }
}

function handleDragLeave(e) { this.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom'); }

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedWidget || this === draggedWidget) return;
    const container = document.getElementById('widgetsGrid');
    const allWidgets = [...container.querySelectorAll('.widget[draggable="true"]')];
    const draggedIdx = allWidgets.indexOf(draggedWidget);
    const targetIdx = allWidgets.indexOf(this);
    const rect = this.getBoundingClientRect();
    const dropAfter = e.clientY > (rect.top + rect.height / 2);
    draggedWidget.remove();
    if (dropAfter) this.after(draggedWidget); else this.before(draggedWidget);
    saveCurrentWidgetOrder();
    logWidgetAction('Widget Reorder', draggedWidget.dataset.widgetId, { from: draggedIdx, to: targetIdx });
    this.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    showNotification('Widget order updated', 'success');
}

function saveCurrentWidgetOrder() {
    if (!currentUser) return;
    const order = [...document.getElementById('widgetsGrid').querySelectorAll('.widget[data-widget-id]')].map(w => w.dataset.widgetId);
    WidgetLayout.saveOrder(currentUser.id, order);
}

function initResizeHandles() {
    document.querySelectorAll('.widget-resize-handle').forEach(handle => handle.addEventListener('mousedown', initResize));
}

function initResize(e) {
    e.preventDefault();
    const handle = e.target;
    const widget = handle.closest('.widget');
    const content = widget.querySelector('.widget-content');
    const widgetId = handle.dataset.widgetId;
    const startY = e.clientY;
    const startHeight = content.offsetHeight;
    const minHeight = parseInt(content.dataset.minHeight) || 200;
    const maxHeight = parseInt(content.dataset.maxHeight) || 1200;
    
    function doResize(e) { content.style.height = Math.min(maxHeight, Math.max(minHeight, startHeight + (e.clientY - startY))) + 'px'; }
    function stopResize(e) {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
        widget.classList.remove('resizing');
        if (currentUser) {
            WidgetLayout.saveWidgetConfig(currentUser.id, widgetId, { height: content.offsetHeight });
            logWidgetAction('Widget Resize', widgetId, { height: content.offsetHeight });
        }
    }
    widget.classList.add('resizing');
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
}

window.toggleWidgetCollapse = function(widgetId) {
    const widget = document.querySelector('[data-widget-id="' + widgetId + '"]');
    if (!widget) return;
    const content = widget.querySelector('.widget-content');
    const collapseBtn = widget.querySelector('.collapse-btn');
    const isCollapsed = widget.classList.toggle('collapsed');
    content.style.display = isCollapsed ? 'none' : '';
    widget.querySelector('.widget-resize-handle').style.display = isCollapsed ? 'none' : '';
    const icon = collapseBtn.querySelector('.collapse-icon');
    icon.innerHTML = '<polyline points="' + (isCollapsed ? '6 9 12 15 18 9' : '18 15 12 9 6 15') + '"/>';
    collapseBtn.title = isCollapsed ? 'Expand' : 'Collapse';
    if (currentUser) {
        WidgetLayout.saveWidgetConfig(currentUser.id, widgetId, { collapsed: isCollapsed });
        logWidgetAction(isCollapsed ? 'Widget Collapse' : 'Widget Expand', widgetId);
    }
};

window.toggleWidgetWidth = function(widgetId) {
    const widget = document.querySelector('[data-widget-id="' + widgetId + '"]');
    if (!widget) return;
    const isFullWidth = widget.classList.toggle('full-width');
    const widthBtn = widget.querySelector('.width-btn');
    widthBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + (isFullWidth ? '<path d="M4 14h6v6H4zM14 4h6v6h-6z"/><path d="M14 14h6v6h-6z"/><path d="M4 4h6v6H4z"/>' : '<path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/>') + '</svg>';
    widthBtn.title = isFullWidth ? 'Standard width' : 'Full width';
    if (currentUser) {
        WidgetLayout.saveWidgetConfig(currentUser.id, widgetId, { fullWidth: isFullWidth });
        logWidgetAction('Widget Width Toggle', widgetId, { fullWidth: isFullWidth });
    }
};

window.resetWidgetLayout = function() {
    if (!currentUser) return;
    if (confirm('Reset all widgets to default layout?')) {
        WidgetLayout.resetLayout(currentUser.id);
        renderWidgets(currentUser);
        logWidgetAction('Widget Layout Reset', 'all');
        showNotification('Widget layout reset to default', 'success');
    }
};

function popoutWidget(id) { 
    // Handle docked Command Center (not in DEFAULT_WIDGETS)
    if (id === 'client-command-center') {
        window.open('widgets/client-command-center.html', id, 'width=1400,height=900');
        logWidgetAction('Widget Popout', id);
        return;
    }
    const w = DEFAULT_WIDGETS.find(x => x.id === id); 
    if (w?.src) { window.open(w.src, id, 'width=1200,height=800'); logWidgetAction('Widget Popout', id); }
}

function logWidgetAction(action, widgetId, data) {
    if (!currentUser) return;
    ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: widgetId || 'portal', action: action, data: data || {} });
}

function saveAllWidgetStates() {
    if (!currentUser) return;
    document.querySelectorAll('.widget[data-widget-id]').forEach(widget => {
        const widgetId = widget.dataset.widgetId;
        const content = widget.querySelector('.widget-content');
        WidgetLayout.saveWidgetConfig(currentUser.id, widgetId, {
            collapsed: widget.classList.contains('collapsed'),
            fullWidth: widget.classList.contains('full-width'),
            height: content ? content.offsetHeight : null
        });
    });
    console.log('[Portal] All widget states saved');
}

function handleWidgetMessage(event) {
    if (event.data?.type === 'LMP_DATA_UPDATE' || event.data?.type === 'LMP_BULK_UPDATE') { 
        updateDataStatus(); 
        showNotification('Data updated!', 'success');
        logWidgetAction('Data Update', event.data.widget || 'data-manager', event.data);
    }
    if (event.data?.type === 'LMP_ANALYSIS_COMPLETE' && currentUser) {
        const d = event.data.data || {};
        
        // Save to ActivityLog (lightweight record for activity tracking)
        ActivityLog.logLMPAnalysis({ 
            userId: currentUser.id, 
            userEmail: currentUser.email, 
            userName: currentUser.firstName + ' ' + currentUser.lastName, 
            clientName: d.clientName, 
            clientId: d.clientId, 
            accountName: d.accountName || null,
            accountId: d.accountId || null,
            iso: d.iso, 
            zone: d.zone, 
            startDate: d.startDate, 
            termMonths: d.termMonths, 
            fixedPrice: d.fixedPrice, 
            lmpAdjustment: d.lmpAdjustment, 
            usage: d.totalAnnualUsage || d.usage, 
            results: d.results 
        });
        
        // Save to AnalysisStore (full record with monthly usage + calculation results)
        var savedAnalysis = null;
        if (typeof AnalysisStore !== 'undefined') {
            savedAnalysis = AnalysisStore.save({
                userId: currentUser.id,
                userName: currentUser.firstName + ' ' + currentUser.lastName,
                userEmail: currentUser.email,
                clientName: d.clientName,
                clientId: d.clientId,
                accountName: d.accountName || null,
                accountId: d.accountId || null,
                contextKey: d.contextKey || null,
                iso: d.iso,
                zone: d.zone,
                startDate: d.startDate,
                termMonths: d.termMonths,
                fixedPrice: d.fixedPrice,
                lmpAdjustment: d.lmpAdjustment || 0,
                capacityCost: d.capacityCost || 0.015,
                ancillaryCost: d.ancillaryCost || 0.005,
                transmissionCost: d.transmissionCost || 0.015,
                projectionMethod: d.projectionMethod || 'historical_average',
                lmpEscalator: d.lmpEscalator || 0,
                simpleBlockRate: d.simpleBlockRate || 0.075,
                simpleHedgePercent: d.simpleHedgePercent || 100,
                monthlyUsage: d.monthlyUsage || [],
                totalAnnualUsage: d.totalAnnualUsage || d.usage || 0,
                results: d.results,
                calculationResults: d.calculationResults || []
            });
        }
        
        if (document.getElementById('analysisHistoryContent')) renderAnalysisHistory();
        const displayName = d.accountName ? `${d.clientName} → ${d.accountName}` : (d.clientName || 'Unnamed');
        const reqNum = savedAnalysis ? ' (' + savedAnalysis.requestNumber + ')' : '';
        showNotification('Analysis logged: ' + displayName + reqNum, 'success');
        saveAllWidgetStates();
    }
    if (event.data?.type === 'LMP_EXPORT_COMPLETE' && currentUser) {
        ActivityLog.logLMPExport({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, exportType: event.data.data?.exportType, iso: event.data.data?.iso, zone: event.data.data?.zone, format: event.data.data?.format });
    }
    if (event.data?.type === 'WIDGET_ERROR') {
        ErrorLog.log({ type: event.data.errorType || 'widget', widget: event.data.widget || 'unknown', message: event.data.message, source: event.data.source, line: event.data.line, stack: event.data.stack, context: event.data.context });
    }
    if (event.data?.type === 'GET_CURRENT_USER' && event.source) {
        event.source.postMessage({ type: 'CURRENT_USER', user: currentUser ? { id: currentUser.id, username: currentUser.email, name: currentUser.firstName + ' ' + currentUser.lastName, firstName: currentUser.firstName, lastName: currentUser.lastName, email: currentUser.email, role: currentUser.role } : null }, '*');
    }
    if (event.data?.type === 'BIDSHEET_GENERATED' && currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'bid-management', action: 'Bid Sheet Generated', details: event.data.data });
        showNotification('Bid sheet generated!', 'success');
        saveAllWidgetStates();
    }
    if (event.data?.type === 'REQUEST_ACTIVE_CLIENT' && event.source) {
        const client = window.SecureEnergyClients?.getActiveClient?.();
        const account = window.SecureEnergyClients?.getActiveAccount?.();
        event.source.postMessage({ 
            type: 'ACTIVE_CLIENT_RESPONSE', 
            client: client, 
            clientId: client?.id || null,
            account: account,
            accountId: account?.id || null
        }, '*');
    }
    if (event.data?.type === 'LINK_LMP_TO_CLIENT' && event.data.analysis && window.SecureEnergyClients) {
        const activeId = SecureEnergyClients.getActiveClientId();
        if (activeId) { SecureEnergyClients.linkAnalysis(activeId, event.data.analysis); console.log('[Portal] Analysis linked to client:', activeId); }
    }
    if (event.data?.type === 'LINK_BID_TO_CLIENT' && event.data.bid && window.SecureEnergyClients) {
        const activeId = SecureEnergyClients.getActiveClientId();
        if (activeId) { SecureEnergyClients.linkBid(activeId, event.data.bid); console.log('[Portal] Bid linked to client:', activeId); }
    }
    if (event.data?.type === 'SCROLL_TO_WIDGET' && event.data.widgetId) scrollToWidget(event.data.widgetId);
    if (event.data?.type === 'REQUEST_CURRENT_USER' && event.source) {
        event.source.postMessage({ type: 'CURRENT_USER_RESPONSE', user: currentUser ? { id: currentUser.id, email: currentUser.email, name: currentUser.firstName + ' ' + currentUser.lastName, firstName: currentUser.firstName, lastName: currentUser.lastName, role: currentUser.role } : null }, '*');
    }
    if (event.data?.type === 'LOG_ACTIVITY' && currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: event.data.widget || 'unknown', action: event.data.action || 'Unknown Action', clientName: event.data.clientName || null, data: event.data.data || {} });
        if (event.data.action && (event.data.action.toLowerCase().includes('save') || event.data.action.toLowerCase().includes('analyze') || event.data.action.toLowerCase().includes('create') || event.data.action.toLowerCase().includes('update'))) saveAllWidgetStates();
    }
    if (event.data?.type === 'CLIENT_SAVED' && currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'client-admin', action: event.data.isNew ? 'Client Create' : 'Client Update', clientName: event.data.clientName, data: event.data.data || {} });
        showNotification('Client ' + (event.data.isNew ? 'created' : 'updated') + ': ' + event.data.clientName, 'success');
        saveAllWidgetStates();
    }
    if (event.data?.type === 'CLIENT_DELETED' && currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'client-admin', action: 'Client Delete', clientName: event.data.clientName, data: { clientId: event.data.clientId } });
        showNotification('Client deleted: ' + event.data.clientName, 'info');
    }
    // === Command Center Message Handlers ===
    if (event.data?.type === 'COMMAND_CENTER_ACTION' && currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'client-command-center', action: event.data.action || 'Command Center Action', clientName: event.data.clientName, data: event.data.data || {} });
        if (event.data.notify) showNotification(event.data.notify, event.data.notifyType || 'info');
    }
    if (event.data?.type === 'COMMAND_CENTER_CLIENT_SAVED' && currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'client-command-center', action: event.data.isNew ? 'Client Create' : 'Client Update', clientName: event.data.clientName, data: event.data.data || {} });
        showNotification('Client ' + (event.data.isNew ? 'created' : 'updated') + ': ' + event.data.clientName, 'success');
        saveAllWidgetStates();
    }
    if (event.data?.type === 'COMMAND_CENTER_CLIENT_DELETED' && currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'client-command-center', action: 'Client Delete', clientName: event.data.clientName, data: { clientId: event.data.clientId } });
        showNotification('Client deleted: ' + event.data.clientName, 'info');
    }
    if (event.data?.type === 'COMMAND_CENTER_IMPORT' && currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'client-command-center', action: 'Data Import', data: { imported: event.data.imported, updated: event.data.updated, skipped: event.data.skipped } });
    }
    if (event.data?.type === 'COMMAND_CENTER_EXPORT' && currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'client-command-center', action: 'Data Export', data: { format: event.data.format } });
    }
    if (event.data?.type === 'COMMAND_CENTER_SET_CLIENT' && currentUser) {
        if (typeof SecureEnergyClients !== 'undefined') {
            if (event.data.clientId) SecureEnergyClients.setActiveClient(event.data.clientId);
            if (event.data.accountId && SecureEnergyClients.setActiveAccount) SecureEnergyClients.setActiveAccount(event.data.accountId);
        }
    }
    if (event.data?.type === 'UTILIZATION_SAVED' && currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'energy-utilization', action: 'Utilization Data Saved', clientName: event.data.clientName, data: event.data.data || {} });
        saveAllWidgetStates();
    }
    
    // Handle LOG_USAGE_ACTIVITY message from energy-utilization-widget
    if (event.data?.type === 'LOG_USAGE_ACTIVITY' && currentUser) {
        const d = event.data;
        const displayName = d.accountName 
            ? `${d.clientName || 'Client'} → ${d.accountName}` 
            : (d.clientName || 'Unknown Client');
        
        ActivityLog.logUsageEntry({
            userId: d.userId || currentUser.id,
            userEmail: d.userEmail || currentUser.email,
            userName: d.userName || (currentUser.firstName + ' ' + currentUser.lastName),
            clientId: d.clientId,
            clientName: d.clientName,
            accountId: d.accountId,
            accountName: d.accountName,
            totalElectric: d.totalElectric,
            totalGas: d.totalGas,
            electricData: d.electricData,
            gasData: d.gasData
        });
        
        console.log('[Portal] Logged usage entry for:', displayName);
        saveAllWidgetStates();
    }
    
    // Handle CLIENT_USAGE_UPDATED - broadcast to all widgets
    if (event.data?.type === 'CLIENT_USAGE_UPDATED') {
        console.log('[Portal] Received CLIENT_USAGE_UPDATED, broadcasting to all widgets');
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach((iframe) => {
            try {
                iframe.contentWindow.postMessage(event.data, '*');
            } catch (e) { /* ignore */ }
        });
    }
    
    // Handle SAVE_USAGE_PROFILE - save to UsageProfileStore when widget can't access it directly
    if (event.data?.type === 'SAVE_USAGE_PROFILE' && window.UsageProfileStore) {
        const d = event.data;
        console.log('[Portal] Received SAVE_USAGE_PROFILE for client:', d.clientId);
        
        // Get user info for createdBy field
        let userInfo = {};
        if (currentUser) {
            userInfo = {
                createdBy: currentUser.firstName + ' ' + currentUser.lastName,
                createdByEmail: currentUser.email
            };
        }
        
        window.UsageProfileStore.createOrUpdateByContext(
            d.clientId,
            d.accountId,
            {
                ...d.profile,
                ...userInfo
            }
        ).then(result => {
            if (result.success) {
                console.log('[Portal] Usage profile saved to store:', result.profile?.id);
            } else {
                console.warn('[Portal] Failed to save usage profile:', result.error);
            }
        }).catch(e => {
            console.error('[Portal] Error saving usage profile:', e);
        });
    }
    
    if (event.data?.type === 'DATA_UPLOADED' && currentUser) {
        ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: event.data.widget || 'data-manager', action: 'Data Upload', data: event.data.data || {} });
    }
    
    // Feedback/Ticket message handlers
    if (event.data?.type === 'TICKET_CREATED' && currentUser) {
        const ticket = event.data.ticket;
        if (ticket) {
            console.log('[Portal] Ticket created:', ticket.id);
            ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'feedback', action: 'Ticket Created', data: { ticketId: ticket.id, category: ticket.category, priority: ticket.priority } });
        }
    }
    if (event.data?.type === 'TICKET_REPLY' && currentUser) {
        const { ticketId, reply } = event.data;
        if (window.TicketStore && ticketId && reply) {
            window.TicketStore.addReply(ticketId, reply);
            ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, widget: 'feedback', action: 'Ticket Reply', data: { ticketId } });
        }
    }
    if (event.data?.type === 'TICKETS_UPDATED') {
        if (window.TicketStore && event.data.data) {
            window.TicketStore.saveTickets(event.data.data);
        }
    }
    if (event.data?.type === 'REQUEST_USER_DATA' && event.source) {
        event.source.postMessage({ type: 'USER_DATA', user: currentUser }, '*');
    }
    
    // =====================================================
    // PASSWORD CHANGE REQUEST (from password-reset widget)
    // =====================================================
    if (event.data?.type === 'PASSWORD_CHANGE_REQUEST' && currentUser) {
        const { userId, email, currentPassword, newPassword } = event.data;

        // Security: only allow users to change their own password (unless admin)
        if (userId !== currentUser.id && currentUser.role !== 'admin') {
            if (event.source) event.source.postMessage({ type: 'PASSWORD_CHANGE_RESULT', success: false, error: 'You can only change your own password.' }, '*');
            return;
        }

        (async function() {
            try {
                const result = await UserStore.changePassword(userId, currentPassword, newPassword);

                if (result.success) {
                    logWidgetAction('Password Changed', 'password-reset', { email: email, changedBy: currentUser.email, timestamp: result.passwordChangedAt });

                    // If this was a force reset, clear the flag and enter the portal
                    const forceOverlay = document.getElementById('forcePasswordResetOverlay');
                    if (forceOverlay) {
                        // Clear the forcePasswordReset flag on the user record
                        await UserStore.update(userId, { forcePasswordReset: false });
                        
                        // Update local session
                        currentUser.forcePasswordReset = false;
                        UserStore.setCurrentUser(currentUser);
                        
                        // Remove overlay and show portal
                        forceOverlay.remove();
                        showPortal(currentUser);
                        initSessionTimeout();
                        
                        showNotification('Password updated! Welcome, ' + currentUser.firstName + '!', 'success');
                        logWidgetAction('Force Password Reset Completed', 'password-reset', { email });
                    } else {
                        // Normal (non-forced) password change
                        if (event.source) event.source.postMessage({ type: 'PASSWORD_CHANGE_RESULT', success: true, passwordChangedAt: result.passwordChangedAt }, '*');
                        showNotification('Password updated successfully', 'success');
                    }
                } else {
                    if (event.source) event.source.postMessage({ type: 'PASSWORD_CHANGE_RESULT', success: false, error: result.error }, '*');
                }
            } catch (e) {
                console.error('[Portal] Password change error:', e);
                if (event.source) event.source.postMessage({ type: 'PASSWORD_CHANGE_RESULT', success: false, error: 'An unexpected error occurred. Please try again.' }, '*');
                ErrorLog.log({ type: 'password-change', widget: 'password-reset', message: 'Password change failed: ' + e.message, context: { email, userId } });
            }
        })();
    }
}

function broadcastActiveClientToWidgets(client, account = null) {
    const iframes = document.querySelectorAll('iframe');
    console.log('[Portal] broadcastActiveClientToWidgets - Client:', client?.name, '- Found', iframes.length, 'iframes');
    iframes.forEach((iframe, index) => {
        try { 
            iframe.contentWindow.postMessage({ 
                type: 'ACTIVE_CLIENT_CHANGED', 
                client: client, 
                clientId: client?.id || null,
                account: account,
                accountId: account?.id || null
            }, '*');
            console.log('[Portal] Sent ACTIVE_CLIENT_CHANGED to iframe', index);
        } catch (e) {
            console.warn('[Portal] Failed to send to iframe', index, ':', e.message);
        }
    });
}

function broadcastActiveAccountToWidgets(account, client = null) {
    // Get client if not provided
    if (!client && window.SecureEnergyClients) {
        client = window.SecureEnergyClients.getActiveClient();
    }
    const iframes = document.querySelectorAll('iframe');
    console.log('[Portal] broadcastActiveAccountToWidgets - Account:', account?.accountName, 'Client:', client?.name, '- Found', iframes.length, 'iframes');
    iframes.forEach((iframe, index) => {
        try { 
            iframe.contentWindow.postMessage({ 
                type: 'ACTIVE_ACCOUNT_CHANGED', 
                client: client, 
                clientId: client?.id || null,
                account: account,
                accountId: account?.id || null
            }, '*');
            console.log('[Portal] Sent ACTIVE_ACCOUNT_CHANGED to iframe', index);
        } catch (e) {
            console.warn('[Portal] Failed to send to iframe', index, ':', e.message);
        }
    });
}

function updateGlobalClientIndicator() {
    const indicator = document.getElementById('globalClientIndicator');
    if (!indicator) return;
    const client = window.SecureEnergyClients?.getActiveClient?.();
    const account = window.SecureEnergyClients?.getActiveAccount?.();
    const nameEl = indicator.querySelector('.client-indicator-name');
    if (nameEl) {
        if (client) { 
            // Build display text with optional account
            let displayText = client.name;
            if (account) {
                displayText += ' → ' + (account.accountName || account.id);
            }
            nameEl.textContent = displayText; 
            nameEl.classList.add('has-client'); 
            indicator.classList.add('has-client');
            // Add account class for styling
            if (account) {
                indicator.classList.add('has-account');
            } else {
                indicator.classList.remove('has-account');
            }
        }
        else { 
            nameEl.textContent = 'None'; 
            nameEl.classList.remove('has-client'); 
            indicator.classList.remove('has-client'); 
            indicator.classList.remove('has-account');
        }
    }
}

function initAdminWidget() {
    const content = document.getElementById('adminWidgetContent');
    if (!content) return;
    content.innerHTML = '<div class="admin-tabs"><button class="admin-tab active" data-tab="create">Create User</button><button class="admin-tab" data-tab="manage">Manage Users</button><button class="admin-tab" data-tab="activity">Activity Log</button><button class="admin-tab" data-tab="github">GitHub Sync</button><button class="admin-tab" data-tab="errors">Error Log</button><button class="admin-tab" data-tab="export">Export Data</button></div><div class="admin-panel active" id="panel-create">' + getCreateUserPanel() + '</div><div class="admin-panel" id="panel-manage">' + getManageUsersPanel() + '</div><div class="admin-panel" id="panel-activity">' + getActivityLogPanel() + '</div><div class="admin-panel" id="panel-github">' + getGitHubSyncPanel() + '</div><div class="admin-panel" id="panel-errors">' + getErrorLogPanel() + '</div><div class="admin-panel" id="panel-export">' + getExportPanel() + '</div>';
    content.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const t = this.dataset.tab;
            content.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active'));
            content.querySelectorAll('.admin-panel').forEach(x => x.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('panel-' + t).classList.add('active');
            if (t === 'manage') renderUsersTable();
            if (t === 'activity') renderActivityLog();
            if (t === 'github') renderGitHubSyncStatus();
            if (t === 'errors') renderErrorLog();
            logWidgetAction('Admin Tab Switch', 'user-admin', { tab: t });
        });
    });
}

function initAIAssistantWidget() {
    const content = document.getElementById('aiAssistantContent');
    if (!content) return;
    content.innerHTML = '<div class="ai-assistant-container" style="height:100%;display:flex;flex-direction:column;">' +
        '<div class="ai-chat-messages" id="aiChatMessages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;">' +
        '<div class="ai-welcome" style="text-align:center;padding:40px 20px;color:var(--text-tertiary);">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:16px;opacity:0.5;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>' +
        '<h3 style="margin:0 0 8px;font-size:16px;color:var(--text-secondary);">AI Assistant</h3>' +
        '<p style="margin:0;font-size:13px;">Ask questions about LMP data, energy markets, or get help with analysis.</p>' +
        '</div></div>' +
        '<div class="ai-chat-input-area" style="padding:16px;border-top:1px solid var(--border-color);display:flex;gap:12px;">' +
        '<input type="text" id="aiChatInput" placeholder="Ask a question..." style="flex:1;padding:12px 16px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-tertiary);color:var(--text-primary);font-size:14px;">' +
        '<button onclick="sendAIMessage()" style="padding:12px 20px;background:var(--accent-primary);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:500;">Send</button>' +
        '</div></div>';
    
    const input = document.getElementById('aiChatInput');
    if (input) {
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') sendAIMessage();
        });
    }
}

window.sendAIMessage = function() {
    const input = document.getElementById('aiChatInput');
    const messagesContainer = document.getElementById('aiChatMessages');
    if (!input || !messagesContainer) return;
    
    const query = input.value.trim();
    if (!query) return;
    
    // Remove welcome message if present
    const welcome = messagesContainer.querySelector('.ai-welcome');
    if (welcome) welcome.remove();
    
    // Add user message
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-message user';
    userMsg.style.cssText = 'align-self:flex-end;background:var(--accent-primary);color:white;padding:12px 16px;border-radius:16px 16px 4px 16px;max-width:80%;font-size:14px;';
    userMsg.textContent = query;
    messagesContainer.appendChild(userMsg);
    
    // Add assistant response placeholder
    const assistantMsg = document.createElement('div');
    assistantMsg.className = 'ai-message assistant';
    assistantMsg.style.cssText = 'align-self:flex-start;background:var(--bg-tertiary);color:var(--text-primary);padding:12px 16px;border-radius:16px 16px 16px 4px;max-width:80%;font-size:14px;';
    assistantMsg.innerHTML = '<em style="color:var(--text-tertiary);">Thinking...</em>';
    messagesContainer.appendChild(assistantMsg);
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    input.value = '';
    
    // Generate response based on query
    setTimeout(() => {
        const response = generateAIResponse(query);
        assistantMsg.textContent = response;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        if (currentUser) {
            logWidgetAction('AI Query', 'ai-assistant', { query: query.substring(0, 100) });
        }
    }, 500);
};

function generateAIResponse(query) {
    const q = query.toLowerCase();
    const stats = SecureEnergyData.getStats();
    
    if (q.includes('lmp') && (q.includes('data') || q.includes('record'))) {
        return 'The portal currently has ' + (stats.totalRecords || 0).toLocaleString() + ' LMP records loaded across ' + (stats.isoCount || 0) + ' ISOs: ' + (stats.isos?.join(', ') || 'none') + '. Use the LMP Analytics V2 or LMP Comparison widgets to analyze this data.';
    }
    if (q.includes('iso') || q.includes('market')) {
        return 'The portal supports data from major ISOs including PJM, ISO-NE, NYISO, CAISO, ERCOT, and MISO. Each ISO has different pricing zones and market structures. Use the LMP Comparison widget to analyze prices across different regions.';
    }
    if (q.includes('bid') || q.includes('proposal')) {
        return 'Use the Bid Management widget to create client proposals. You can select a client, choose suppliers, and generate Excel bid sheets that match the company template format.';
    }
    if (q.includes('client')) {
        return 'Client information is managed through the Client Lookup and Client Administration widgets. You can search for existing clients, view their details, and manage their accounts.';
    }
    if (q.includes('help') || q.includes('how')) {
        return 'I can help you with: LMP data analysis, understanding energy markets, creating bids, managing clients, and navigating the portal. What would you like to know more about?';
    }
    return 'I can help you with LMP data analysis, energy market insights, bid management, and portal navigation. Currently there are ' + (stats.totalRecords || 0).toLocaleString() + ' records loaded. What specific information are you looking for?';
}

function initAnalysisHistoryWidget() {
    const content = document.getElementById('analysisHistoryContent');
    if (!content) return;
    renderAnalysisHistory();
}

function renderAnalysisHistory() {
    const content = document.getElementById('analysisHistoryContent');
    if (!content) return;
    
    let analyses = [];
    if (currentUser) {
        // Prefer AnalysisStore (full records with calculation results)
        if (typeof AnalysisStore !== 'undefined' && AnalysisStore.getAll().length > 0) {
            analyses = currentUser.role === 'admin'
                ? AnalysisStore.getAll()
                : AnalysisStore.getByUser(currentUser.id);
            analyses = analyses.slice(0, 50);
        } else {
            // Fallback to ActivityLog for legacy records
            const userLogs = currentUser.role === 'admin' 
                ? ActivityLog.getAll().filter(l => l.action === 'LMP Analysis')
                : ActivityLog.getByUser(currentUser.id).filter(l => l.action === 'LMP Analysis');
            analyses = userLogs.slice(0, 50).map(function(a) {
                // Normalize ActivityLog format to look like AnalysisStore format
                return {
                    id: a.id,
                    requestNumber: null,
                    timestamp: a.timestamp,
                    userId: a.userId,
                    userName: a.userName,
                    clientName: a.clientName || (a.data && a.data.clientName) || 'Unnamed',
                    parameters: a.data || {},
                    results: (a.data && a.data.results) || {},
                    monthlyUsage: [],
                    calculationResults: [],
                    _isLegacy: true
                };
            });
        }
    }
    
    if (analyses.length === 0) {
        content.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-tertiary);">' +
            '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:16px;opacity:0.5;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
            '<h3 style="margin:0 0 8px;font-size:16px;color:var(--text-secondary);">No Analysis History</h3>' +
            '<p style="margin:0;font-size:13px;">Your LMP analyses will appear here after you run them in the LMP Comparison widget.</p>' +
            '</div>';
        return;
    }
    
    const header = '<div style="padding:16px 20px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-weight:600;color:var(--text-secondary);">' + analyses.length + ' Analysis Record' + (analyses.length !== 1 ? 's' : '') + '</span>' +
        (currentUser?.role === 'admin' ? '<span style="font-size:11px;color:var(--accent-primary);">Showing all users</span>' : '') +
        '</div>';
    
    const cards = analyses.map(a => createAnalysisCard(a)).join('');
    
    content.innerHTML = header + '<div style="padding:16px;display:flex;flex-direction:column;gap:12px;">' + cards + '</div>';
}

function getCreateUserPanel() {
    return '<div class="create-user-form"><h3 style="margin-bottom:20px;font-size:16px;">Create New User</h3><div class="form-row"><div class="form-group"><label>First Name *</label><input type="text" id="newFirstName" placeholder="First name"></div><div class="form-group"><label>Last Name *</label><input type="text" id="newLastName" placeholder="Last name"></div></div><div class="form-row single"><div class="form-group"><label>Email *</label><input type="email" id="newEmail" placeholder="Email"></div></div><div class="form-row single"><div class="form-group"><label>Password *</label><input type="password" id="newPassword" placeholder="Password"></div></div><div class="form-row single"><div class="form-group"><label>Role</label><select id="newRole"><option value="user">Standard User</option><option value="admin">Administrator</option></select></div></div><div class="widget-permissions"><h4>Widget Permissions</h4><div class="widget-permission-item"><span>Client Command Center</span><label class="toggle-switch"><input type="checkbox" id="perm-client-command-center" checked><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>Client Lookup</span><label class="toggle-switch"><input type="checkbox" id="perm-client-lookup" checked><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>Client Administration</span><label class="toggle-switch"><input type="checkbox" id="perm-client-admin" checked><span class="toggle-slider"></span></label><span style="font-size:0.7rem;color:var(--text-tertiary);margin-left:6px;">(Admin only)</span></div><div class="widget-permission-item"><span>Energy Utilization</span><label class="toggle-switch"><input type="checkbox" id="perm-energy-utilization" checked><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>Bid Management</span><label class="toggle-switch"><input type="checkbox" id="perm-bid-management" checked><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>AI Assistant</span><label class="toggle-switch"><input type="checkbox" id="perm-ai-assistant" checked><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>AE Intelligence (BUDA)</span><label class="toggle-switch"><input type="checkbox" id="perm-aei-intelligence" checked><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>LMP Comparison</span><label class="toggle-switch"><input type="checkbox" id="perm-lmp-comparison" checked><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>LMP Analytics V2</span><label class="toggle-switch"><input type="checkbox" id="perm-lmp-analytics" checked><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>Peak Demand Analytics</span><label class="toggle-switch"><input type="checkbox" id="perm-peak-demand" checked><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>Analysis History</span><label class="toggle-switch"><input type="checkbox" id="perm-analysis-history" checked><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>Data Manager</span><label class="toggle-switch"><input type="checkbox" id="perm-data-manager"><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>Arcadia Fetcher</span><label class="toggle-switch"><input type="checkbox" id="perm-arcadia-fetcher"><span class="toggle-slider"></span></label></div><div class="widget-permission-item"><span>Feedback & Support</span><label class="toggle-switch"><input type="checkbox" id="perm-feedback" checked><span class="toggle-slider"></span></label><span style="font-size:0.7rem;color:var(--text-tertiary);margin-left:6px;">(Admin only)</span></div><div class="widget-permission-item"><span>Change Password</span><label class="toggle-switch"><input type="checkbox" id="perm-password-reset" checked><span class="toggle-slider"></span></label></div></div><button class="btn-primary" onclick="createUser()" style="margin-top:20px;">Create User</button></div>';
}

function getManageUsersPanel() { return '<div style="margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;"><button onclick="forceResetAllUsers()" style="padding:8px 16px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">🔐 Force Reset All Users</button><span style="font-size:12px;color:var(--text-tertiary);">Requires all users to change their password on next login</span></div><div style="overflow-x:auto;"><table class="users-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody id="usersTableBody"></tbody></table></div>'; }

function getActivityLogPanel() {
    return '<div class="activity-stats-grid" id="activityStatsGrid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(100px, 1fr));gap:12px;margin-bottom:20px;"></div><div class="activity-filters" style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;"><input type="text" id="activitySearch" placeholder="Search..." style="flex:1;min-width:150px;" oninput="renderActivityLog()"><select id="activityUserFilter" onchange="renderActivityLog()" style="min-width:140px;"><option value="">All Users</option></select><select id="activityWidgetFilter" onchange="renderActivityLog()" style="min-width:140px;"><option value="">All Widgets</option><option value="portal">Portal</option><option value="user-admin">User Admin</option><option value="client-admin">Client Admin</option><option value="client-command-center">Command Center</option><option value="bid-management">Bid Management</option><option value="lmp-comparison">LMP Comparison</option><option value="lmp-analytics">LMP Analytics V2</option><option value="energy-utilization">Energy Utilization</option><option value="ai-assistant">AI Assistant</option><option value="aei-intelligence">AE Intelligence</option><option value="data-manager">Data Manager</option><option value="analysis-history">Analysis History</option></select><select id="activityActionFilter" onchange="renderActivityLog()" style="min-width:140px;"><option value="">All Actions</option><option value="Login">Login</option><option value="Logout">Logout</option><option value="LMP Analysis">LMP Analysis</option><option value="LMP Export">LMP Export</option><option value="Bid Sheet Generated">Bid Sheet</option><option value="Client Create">Client Create</option><option value="Client Update">Client Update</option><option value="AI Query">AI Query</option><option value="Widget Expand">Widget Expand</option><option value="Widget Resize">Widget Resize</option><option value="Data Upload">Data Upload</option><option value="History Export">History Export</option></select><button onclick="renderActivityLog()" style="padding:8px 16px;background:var(--accent-primary);color:white;border:none;border-radius:6px;cursor:pointer;">🔄 Refresh</button><button id="syncAllActivitiesBtn" onclick="syncActivityFromAzure()" style="padding:8px 16px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;display:none;" title="Fetch all user activities from Azure">☁️ Sync All</button></div><div id="activityLogContainer" style="max-height:500px;overflow-y:auto;"></div>';
}

function getGitHubSyncPanel() {
    return '<div class="github-sync-panel"><div class="github-status" id="githubSyncStatus"><div class="status-indicator"></div><span>Checking sync status...</span></div><div class="github-actions" style="display:flex;gap:12px;margin-top:20px;"><button class="btn-primary" onclick="GitHubSync.pushChanges()">Push to GitHub</button><button class="btn-secondary" onclick="GitHubSync.pullLatest()">Pull Latest</button></div><div id="githubSyncLog" style="margin-top:20px;max-height:300px;overflow-y:auto;font-family:monospace;font-size:12px;"></div></div>';
}

function getErrorLogPanel() {
    return '<div class="error-log-panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h4 style="margin:0;">System Errors</h4><div style="display:flex;gap:8px;"><button class="btn-secondary" onclick="refreshErrorLog()" style="font-size:12px;padding:6px 12px;">Refresh</button><button class="btn-secondary" onclick="clearErrorLog()" style="font-size:12px;padding:6px 12px;">Clear Log</button></div></div><div id="errorStatsContainer" style="margin-bottom:16px;"></div><div id="errorLogContainer" style="max-height:400px;overflow-y:auto;"></div></div>';
}

function getExportPanel() {
    return '<div class="export-panel"><h4 style="margin-bottom:20px;">Export Portal Data</h4><div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;"><button class="export-btn" onclick="exportAllUsers()"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/></svg><span>Export Users</span></button><button class="export-btn" onclick="exportActivityLog()"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>Export Activity</span></button><button class="export-btn" onclick="exportLMPData()"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg><span>Export LMP Data</span></button></div></div>';
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    const users = UserStore.getAll();
    tbody.innerHTML = users.map(u => '<tr><td>' + escapeHtml(u.firstName) + ' ' + escapeHtml(u.lastName) + (u.forcePasswordReset ? ' <span style="font-size:10px;padding:2px 6px;background:rgba(239,68,68,0.15);color:#ef4444;border-radius:4px;font-weight:600;">RESET PENDING</span>' : '') + '</td><td>' + escapeHtml(u.email) + '</td><td><span class="role-badge ' + u.role + '">' + u.role + '</span></td><td><span class="status-badge ' + (u.active !== false ? 'active' : 'inactive') + '">' + (u.active !== false ? 'Active' : 'Inactive') + '</span></td><td>' + new Date(u.createdAt).toLocaleDateString() + '</td><td><button class="action-btn" onclick="editUser(\'' + u.id + '\')" title="Edit">✏️</button><button class="action-btn" onclick="forceResetUser(\'' + u.id + '\')" title="' + (u.forcePasswordReset ? 'Clear Force Reset' : 'Force Password Reset') + '">' + (u.forcePasswordReset ? '🔓' : '🔐') + '</button>' + (u.role !== 'admin' ? '<button class="action-btn" onclick="deleteUser(\'' + u.id + '\')" title="Delete">🗑️</button>' : '') + '</td></tr>').join('');
}

function renderActivityLog() {
    const container = document.getElementById('activityLogContainer');
    const statsGrid = document.getElementById('activityStatsGrid');
    if (!container) return;
    
    const allLogs = ActivityLog.getAll();
    const isAdmin = currentUser?.role === 'admin';
    
    // Non-admins only see their own activities
    const visibleLogs = isAdmin ? allLogs : allLogs.filter(l => l.userId === currentUser?.id);
    
    // Show/hide admin-only controls
    const syncAllBtn = document.getElementById('syncAllActivitiesBtn');
    if (syncAllBtn) {
        syncAllBtn.style.display = isAdmin ? '' : 'none';
    }
    
    // Populate user filter dropdown (for admins only)
    const userFilter = document.getElementById('activityUserFilter');
    if (userFilter) {
        if (isAdmin) {
            // Show user filter for admins
            userFilter.style.display = '';
            const uniqueUsers = [...new Map(visibleLogs.map(l => [l.userId, { id: l.userId, name: l.userName, email: l.userEmail }])).values()].filter(u => u.id);
            const currentVal = userFilter.value;
            userFilter.innerHTML = '<option value="">All Users</option>' + uniqueUsers.map(u => '<option value="' + u.id + '"' + (currentVal === u.id ? ' selected' : '') + '>' + escapeHtml(u.name || u.email || 'Unknown') + '</option>').join('');
        } else {
            // Hide user filter for non-admins (they only see their own)
            userFilter.style.display = 'none';
        }
    }
    
    const search = (document.getElementById('activitySearch')?.value || '').toLowerCase();
    const widgetFilter = document.getElementById('activityWidgetFilter')?.value || '';
    const actionFilter = document.getElementById('activityActionFilter')?.value || '';
    const userFilterVal = document.getElementById('activityUserFilter')?.value || '';
    
    const logs = visibleLogs.filter(log => {
        if (widgetFilter && log.widget !== widgetFilter) return false;
        if (actionFilter && log.action !== actionFilter) return false;
        if (userFilterVal && log.userId !== userFilterVal) return false;
        if (search) { 
            const searchStr = ((log.userName || '') + ' ' + (log.action || '') + ' ' + (log.widget || '') + ' ' + (log.clientName || '') + ' ' + (log.userEmail || '')).toLowerCase(); 
            if (!searchStr.includes(search)) return false; 
        }
        return true;
    }).slice(0, 100);
    
    const today = new Date().toDateString();
    const todayLogs = visibleLogs.filter(l => new Date(l.timestamp).toDateString() === today);
    const actionCounts = {};
    visibleLogs.forEach(l => { actionCounts[l.action] = (actionCounts[l.action] || 0) + 1; });
    
    if (statsGrid) {
        statsGrid.innerHTML = '<div class="stat-box"><div class="stat-value">' + visibleLogs.length + '</div><div class="stat-label">Total Events</div></div>' +
            '<div class="stat-box"><div class="stat-value">' + todayLogs.length + '</div><div class="stat-label">Today</div></div>' +
            (isAdmin ? '<div class="stat-box"><div class="stat-value">' + new Set(visibleLogs.map(l => l.userId)).size + '</div><div class="stat-label">Unique Users</div></div>' : '') +
            '<div class="stat-box"><div class="stat-value">' + (actionCounts['LMP Analysis'] || 0) + '</div><div class="stat-label">Analyses</div></div>' +
            '<div class="stat-box"><div class="stat-value">' + (actionCounts['Bid Sheet Generated'] || 0) + '</div><div class="stat-label">Bid Sheets</div></div>' +
            '<div class="stat-box"><div class="stat-value">' + (actionCounts['AI Query'] || 0) + '</div><div class="stat-label">AI Queries</div></div>' +
            '<div class="stat-box"><div class="stat-value">' + ((actionCounts['Client Create'] || 0) + (actionCounts['Client Update'] || 0)) + '</div><div class="stat-label">Client Saves</div></div>';
    }
    
    container.innerHTML = logs.length ? logs.map(log => {
        const hasData = log.data && Object.keys(log.data).length > 0;
        const dataPreview = hasData ? getDataPreview(log) : '';
        const widgetLabel = getWidgetLabel(log.widget);
        const actionLabel = getActionLabel(log.action, log.widget);
        
        return '<div class="activity-item" style="padding:12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:8px;border-left:4px solid ' + getActivityColor(log.action) + ';">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
            '<div style="flex:1;">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">' +
            '<span style="font-size:16px;">' + getActivityIcon(log.action) + '</span>' +
            '<span style="font-weight:600;color:var(--text-primary);">' + escapeHtml(actionLabel) + '</span>' +
            '<span style="font-size:11px;padding:2px 8px;background:' + getWidgetBgColor(log.widget) + ';border-radius:4px;color:white;font-weight:500;">' + escapeHtml(widgetLabel) + '</span>' +
            '</div>' +
            '<div style="font-size:13px;color:var(--text-secondary);">' + (isAdmin ? '👤 ' + escapeHtml(log.userName || 'Unknown') : '') + (log.clientName ? (isAdmin ? ' • ' : '') + '<span style="color:var(--accent-primary);">Client: ' + escapeHtml(log.clientName) + '</span>' : '') + '</div>' +
            (dataPreview ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">' + dataPreview + '</div>' : '') +
            '</div>' +
            '<div style="text-align:right;font-size:11px;color:var(--text-tertiary);white-space:nowrap;">' + formatTimeAgo(log.timestamp) + '<br>' + new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) + '</div>' +
            '</div></div>';
    }).join('') : '<div style="text-align:center;color:var(--text-tertiary);padding:40px;">No activity found</div>';
}

// Get friendly widget label
function getWidgetLabel(widget) {
    const labels = {
        'portal': 'Portal',
        'user-admin': 'User Admin',
        'client-admin': 'Client Admin',
        'client-lookup': 'Client Lookup',
        'lmp-comparison': 'LMP Comparison',
        'lmp-analytics': 'LMP Analytics V2',
        'energy-utilization': 'Energy Utilization',
        'bid-management': 'Bid Management',
        'ai-assistant': 'AI Assistant',
        'aei-intelligence': 'AE Intelligence',
        'data-manager': 'Data Manager',
        'analysis-history': 'Analysis History',
        'peak-demand': 'Peak Demand',
        'feedback': 'Feedback',
        'password-reset': 'Password'
    };
    return labels[widget] || widget || 'Portal';
}

// Get widget background color for badge
function getWidgetBgColor(widget) {
    const colors = {
        'portal': '#6b7280',
        'user-admin': '#8b5cf6',
        'client-admin': '#8b5cf6',
        'client-lookup': '#3b82f6',
        'lmp-comparison': '#3b82f6',
        'lmp-analytics': '#0ea5e9',
        'energy-utilization': '#f59e0b',
        'bid-management': '#10b981',
        'ai-assistant': '#ec4899',
        'aei-intelligence': '#14b8a6',
        'data-manager': '#6366f1',
        'analysis-history': '#64748b',
        'peak-demand': '#ef4444',
        'feedback': '#f97316',
        'password-reset': '#f59e0b'
    };
    return colors[widget] || '#6b7280';
}

// Get friendly action label
function getActionLabel(action, widget) {
    // Return more descriptive labels for common actions
    if (action === 'Login') return 'User Login';
    if (action === 'Logout') return 'User Logout';
    if (action === 'Session Timeout') return 'Session Timed Out';
    if (action === 'LMP Analysis') return 'Analysis Created';
    if (action === 'LMP Export') return 'Data Exported';
    if (action === 'Bid Sheet Generated') return 'Bid Sheet Created';
    if (action === 'Client Create') return 'Client Created';
    if (action === 'Client Update') return 'Client Updated';
    if (action === 'Client Delete') return 'Client Deleted';
    if (action === 'User Created') return 'User Created';
    if (action === 'User Updated') return 'User Updated';
    if (action === 'User Deleted') return 'User Deleted';
    if (action === 'AI Query') return 'AI Query';
    if (action === 'Usage Data Entry') return 'Usage Data Saved';
    if (action === 'Utilization Data Saved') return 'Utilization Saved';
    if (action === 'History Export') return 'History Exported';
    if (action === 'Data Upload') return 'Data Uploaded';
    if (action === 'Data Update') return 'Data Updated';
    if (action === 'Ticket Created') return 'Ticket Submitted';
    if (action === 'Ticket Reply') return 'Ticket Reply';
    if (action === 'Password Changed') return 'Password Changed';
    if (action === 'Force Password Reset') return 'Force Reset Set';
    if (action === 'Force Password Reset Completed') return 'Force Reset Completed';
    if (action === 'Force Reset All Users') return 'Force Reset All Users';
    if (action === 'Force Reset Cleared') return 'Force Reset Cleared';
    if (action === 'Login (Force Reset Required)') return 'Login (Reset Required)';
    if (action === 'Logout (During Force Reset)') return 'Logout (During Reset)';
    return action || 'Activity';
}

function getActivityColor(action) {
    const colors = {
        'Login': '#10b981', 
        'Logout': '#6b7280', 
        'Session Timeout': '#f59e0b',
        'LMP Analysis': '#3b82f6', 
        'LMP Export': '#8b5cf6',
        'Bid Sheet Generated': '#f59e0b', 
        'Client Create': '#10b981', 
        'Client Update': '#3b82f6', 
        'Client Delete': '#ef4444',
        'User Created': '#10b981',
        'User Updated': '#3b82f6',
        'User Deleted': '#ef4444',
        'AI Query': '#ec4899', 
        'Data Upload': '#06b6d4', 
        'Data Update': '#0ea5e9',
        'History Export': '#f59e0b', 
        'Export Users': '#8b5cf6',
        'Export Activity': '#8b5cf6',
        'Export LMP Data': '#8b5cf6',
        'Usage Data Entry': '#f59e0b',
        'Utilization Data Saved': '#f59e0b',
        'Widget Expand': '#6b7280',
        'Widget Collapse': '#6b7280',
        'Widget Resize': '#6b7280',
        'Widget Reorder': '#6b7280',
        'Ticket Created': '#f97316',
        'Ticket Reply': '#f97316',
        'Ticket Updated': '#f97316',
        'Password Changed': '#f59e0b',
        'Force Password Reset': '#ef4444',
        'Force Password Reset Completed': '#10b981',
        'Force Reset All Users': '#ef4444',
        'Force Reset Cleared': '#6b7280',
        'Login (Force Reset Required)': '#f59e0b',
        'Logout (During Force Reset)': '#6b7280'
    };
    return colors[action] || '#6b7280';
}

function getDataPreview(log) {
    const d = log.data || {};
    if (log.action === 'LMP Analysis') {
        const savings = d.results?.savingsVsFixed || 0;
        return 'ISO: ' + (d.iso || 'N/A') + ' | Zone: ' + (d.zone || 'N/A') + ' | Term: ' + (d.termMonths || 0) + 'mo | Savings: <span style="color:' + (savings >= 0 ? '#10b981' : '#ef4444') + ';">' + (savings >= 0 ? '+' : '') + '$' + Math.abs(savings).toLocaleString(undefined, {maximumFractionDigits: 0}) + '</span>';
    }
    if (log.action === 'AI Query') return 'Query: "' + (d.query || '').substring(0, 50) + (d.query?.length > 50 ? '...' : '') + '"';
    if (log.action === 'Bid Sheet Generated') return 'Client: ' + (d.clientName || log.clientName || 'N/A');
    if (log.action === 'LMP Export') return 'Format: ' + (d.format || 'Excel') + (d.iso ? ' | ISO: ' + d.iso : '') + (d.zone ? ' | Zone: ' + d.zone : '');
    if (log.action === 'Login' || log.action === 'Logout' || log.action === 'Session Timeout') return '';
    if (log.action === 'Client Create' || log.action === 'Client Update') return 'Client: ' + (log.clientName || d.clientName || 'N/A');
    if (log.action === 'User Created' || log.action === 'User Updated') return 'Email: ' + (d.email || 'N/A') + (d.role ? ' | Role: ' + d.role : '');
    if (log.action === 'Data Upload' || log.action === 'Data Update') return (d.records ? d.records + ' records' : '') + (d.iso ? ' | ISO: ' + d.iso : '');
    if (log.action === 'History Export' || log.action === 'Export Activity') return (d.count ? d.count + ' records' : '');
    if (log.action === 'Usage Data Entry' || log.action === 'Utilization Data Saved') return (log.clientName || d.clientName ? 'Client: ' + (log.clientName || d.clientName) : '') + (d.accountName ? ' → ' + d.accountName : '');
    if (log.action === 'Ticket Created') return d.subject ? 'Subject: ' + d.subject.substring(0, 40) + (d.subject.length > 40 ? '...' : '') : '';
    if (log.action === 'Password Changed') return 'Email: ' + (d.email || 'N/A') + (d.changedBy && d.changedBy !== d.email ? ' | Changed by: ' + d.changedBy : '');
    if (log.action === 'Force Password Reset' || log.action === 'Force Reset Cleared') return 'Email: ' + (d.email || 'N/A');
    if (log.action === 'Force Reset All Users') return (d.count || 0) + ' users flagged for reset';
    return '';
}

function refreshActivityLogIfVisible() {
    const container = document.getElementById('activityLogContainer');
    if (container && container.offsetParent !== null) {
        renderActivityLog();
    }
}

// Sync activity log from Azure (for admins to see all users' activities)
window.syncActivityFromAzure = async function() {
    if (!currentUser || currentUser.role !== 'admin') {
        showNotification('Admin access required', 'error');
        return;
    }
    
    showNotification('Syncing activities from Azure...', 'info');
    
    try {
        const result = await ActivityLog.refresh();
        if (result.success) {
            renderActivityLog();
            showNotification(`Synced ${result.count} activities from Azure`, 'success');
        } else {
            showNotification('Sync failed: ' + (result.error || 'Unknown error'), 'error');
        }
    } catch (e) {
        showNotification('Sync error: ' + e.message, 'error');
    }
};

function renderGitHubSyncStatus() {
    const status = document.getElementById('githubSyncStatus');
    if (status) status.innerHTML = '<div class="status-indicator connected"></div><span>Connected to GitHub</span>';
}

function renderErrorLog() {
    const container = document.getElementById('errorLogContainer');
    const statsContainer = document.getElementById('errorStatsContainer');
    if (!container) return;
    const errors = (typeof ErrorLog !== 'undefined' && ErrorLog.getAll) ? ErrorLog.getAll() : [];
    const stats = (typeof ErrorLog !== 'undefined' && ErrorLog.getStats) ? ErrorLog.getStats() : {};
    if (statsContainer) {
        statsContainer.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(100px, 1fr));gap:12px;"><div style="background:var(--bg-tertiary);padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#ef4444;">' + (stats.total || 0) + '</div><div style="font-size:11px;color:var(--text-tertiary);">Total</div></div><div style="background:var(--bg-tertiary);padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#f59e0b;">' + (stats.today || 0) + '</div><div style="font-size:11px;color:var(--text-tertiary);">Today</div></div><div style="background:var(--bg-tertiary);padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#ef4444;">' + (stats.unresolved || 0) + '</div><div style="font-size:11px;color:var(--text-tertiary);">Unresolved</div></div></div>' + (stats.byWidget && Object.keys(stats.byWidget).length > 0 ? '<div style="margin-top:12px;font-size:12px;color:var(--text-secondary);"><strong>By Widget:</strong> ' + Object.entries(stats.byWidget).map(function(e) { return e[0] + ': ' + e[1]; }).join(', ') + '</div>' : '');
    }
    
    if (!errors.length) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);padding:40px;">No errors logged 🎉</div>';
        return;
    }
    
    container.innerHTML = errors.slice(0, 50).map(function(e) {
        const explanation = (typeof ErrorLog !== 'undefined' && ErrorLog.getErrorExplanation) 
            ? ErrorLog.getErrorExplanation(e.message) 
            : null;
        const userDisplay = e.userName ? '<div style="font-size:11px;color:var(--accent-primary);margin-top:4px;">👤 ' + escapeHtml(e.userName) + '</div>' : '';
        const explanationDisplay = explanation 
            ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:8px;padding:8px;background:var(--bg-secondary);border-radius:6px;border-left:2px solid var(--accent-warning);"><strong style="color:var(--accent-warning);">💡 Possible cause:</strong> ' + escapeHtml(explanation) + '</div>' 
            : '';
        
        return '<div class="error-item" style="background:var(--bg-tertiary);padding:12px;border-radius:8px;margin-bottom:8px;border-left:3px solid ' + (e.resolved ? '#10b981' : '#ef4444') + ';">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
            '<div style="flex:1;">' +
            '<div style="font-weight:600;color:' + (e.resolved ? '#10b981' : '#ef4444') + ';">' + escapeHtml(e.type || 'Error') + ' - ' + escapeHtml(e.widget || 'Unknown') + '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' + escapeHtml(e.message || 'Unknown error') + '</div>' +
            userDisplay +
            explanationDisplay +
            '</div>' +
            (!e.resolved ? '<button onclick="resolveError(\'' + e.id + '\')" style="font-size:10px;padding:4px 8px;background:var(--accent-success);color:white;border:none;border-radius:4px;cursor:pointer;flex-shrink:0;margin-left:8px;">Resolve</button>' : '<span style="font-size:10px;color:#10b981;flex-shrink:0;margin-left:8px;">✓ Resolved</span>') +
            '</div>' +
            '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">' + new Date(e.timestamp).toLocaleString() + '</div>' +
            '</div>';
    }).join('');
}

window.resolveError = function(errorId) {
    if (typeof ErrorLog !== 'undefined' && ErrorLog.resolve) { ErrorLog.resolve(errorId); renderErrorLog(); showNotification('Error marked as resolved', 'success'); logWidgetAction('Error Resolved', 'user-admin', { errorId }); }
};

window.refreshErrorLog = function() { renderErrorLog(); showNotification('Error log refreshed', 'info'); };

function clearErrorLog() {
    if (typeof ErrorLog !== 'undefined' && ErrorLog.clear) { ErrorLog.clear(); renderErrorLog(); showNotification('Error log cleared', 'success'); logWidgetAction('Error Log Cleared', 'user-admin'); }
}

function getActivityIcon(action) {
    const icons = { 'Login': '🔑', 'Logout': '🚪', 'Session Timeout': '⏰', 'LMP Analysis': '📊', 'LMP Export': '📥', 'Button Click': '👆', 'Bid Sheet Generated': '📄', 'Client Save': '💾', 'Client Create': '➕', 'Client Update': '✏️', 'Client Delete': '🗑️', 'Widget Expand': '🔼', 'Widget Collapse': '🔽', 'Widget Resize': '↕️', 'Widget Reorder': '🔀', 'Widget Width Toggle': '↔️', 'Widget Popout': '🪟', 'Widget Layout Reset': '🔄', 'Data Upload': '📤', 'Data Update': '🔄', 'Error Check at Login': '⚠️', 'Error Resolved': '✅', 'Error Log Cleared': '🧹', 'Admin Tab Switch': '📑', 'User Created': '👤', 'User Updated': '✏️', 'User Deleted': '🗑️', 'AI Query': '🤖', 'Utilization Data Saved': '⚡', 'History Export': '📁', 'Export Users': '👥', 'Export Activity': '📋', 'Export LMP Data': '📈', 'Ticket Created': '🎫', 'Ticket Reply': '💬', 'Ticket Updated': '📝', 'Password Changed': '🔐', 'Force Password Reset': '🔒', 'Force Password Reset Completed': '🔓', 'Force Reset All Users': '🔒', 'Force Reset Cleared': '🔓', 'Login (Force Reset Required)': '⚠️', 'Logout (During Force Reset)': '🚪', 'Command Center Action': '🎛️', 'Client Search': '🔍', 'Client Selected': '📋', 'Account Selected': '📂', 'Data Import': '📥', 'Data Export': '📤' };
    return icons[action] || '📝';
}

function formatTimeAgo(timestamp) {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds/60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds/3600) + 'h ago';
    return Math.floor(seconds/86400) + 'd ago';
}

function createAnalysisCard(a) {
    // Support both AnalysisStore and legacy ActivityLog formats
    var params, r, client, reqNum, isLegacy;
    if (a._isLegacy) {
        // Legacy ActivityLog format
        params = a.parameters || {};
        r = a.results || {};
        client = a.clientName || params.clientName || 'Unnamed Analysis';
        reqNum = null;
        isLegacy = true;
    } else {
        // AnalysisStore format
        params = a.parameters || {};
        r = a.results || {};
        client = a.clientName || 'Unnamed Analysis';
        reqNum = a.requestNumber || null;
        isLegacy = false;
    }
    
    const savings = r.savingsVsFixed || 0;
    const timeStr = formatTimeAgo(a.timestamp);
    const showData = encodeURIComponent(JSON.stringify(a));
    
    // For reload: if AnalysisStore record, pass the requestNumber; if legacy, pass the parameters
    var reloadAttr;
    if (reqNum) {
        reloadAttr = encodeURIComponent(JSON.stringify({ requestNumber: reqNum }));
    } else {
        // Legacy: pass the old-style data object for reload
        var legacyData = a.parameters || a.data || {};
        reloadAttr = encodeURIComponent(JSON.stringify(legacyData));
    }
    
    const savingsColor = savings >= 0 ? '#10b981' : '#ef4444';
    const savingsSign = savings >= 0 ? '+' : '';
    const savingsAmount = Math.abs(savings).toLocaleString(undefined, {maximumFractionDigits: 0});
    const hasFullResults = !isLegacy && a.calculationResults && a.calculationResults.length > 0;
    
    var html = '<div style="background:var(--bg-secondary);border-radius:10px;padding:16px;border-left:4px solid ' + savingsColor + ';">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">';
    html += '<div><div style="font-weight:600;font-size:15px;">' + escapeHtml(client) + '</div>';
    html += '<div style="font-size:12px;color:var(--text-tertiary);">' + (params.iso || 'N/A') + ' • ' + (params.zone || 'N/A') + ' • ' + (params.termMonths || 0) + 'mo</div>';
    
    // Show request number
    if (reqNum) {
        html += '<div style="font-size:11px;color:var(--accent-secondary);margin-top:3px;font-family:monospace;">' + reqNum + '</div>';
    }
    
    if (currentUser && currentUser.role === 'admin' && a.userName) {
        html += '<div style="font-size:11px;color:var(--accent-primary);margin-top:2px;">👤 ' + escapeHtml(a.userName) + '</div>';
    }
    html += '</div>';
    html += '<div style="text-align:right;"><div style="font-size:18px;font-weight:700;color:' + savingsColor + ';">' + savingsSign + '$' + savingsAmount + '</div>';
    html += '<div style="font-size:11px;color:var(--text-tertiary);">savings</div></div></div>';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;"><div style="display:flex;gap:8px;">';
    html += '<button onclick="showAnalysisDetail(\'' + showData + '\')" style="background:var(--accent-secondary);color:white;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">Show</button>';
    
    // Reload button - show full indicator if we have complete data
    var reloadLabel = hasFullResults ? '🔄 Reload' : 'Reload';
    var reloadTitle = hasFullResults ? 'Full reload with all parameters and monthly usage' : 'Reload parameters only (legacy record)';
    html += '<button onclick="reloadAnalysis(\'' + reloadAttr + '\')" title="' + reloadTitle + '" style="background:var(--accent-primary);color:white;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">' + reloadLabel + '</button>';
    
    html += '</div><span style="font-size:11px;color:var(--text-tertiary);">' + timeStr + '</span></div></div>';
    return html;
}

window.showAnalysisDetail = function(encodedData) {
    trackButtonClick('Show Analysis Detail', 'analysis-history');
    try {
        const a = JSON.parse(decodeURIComponent(encodedData));
        
        // Support both AnalysisStore and legacy formats
        var params, r, client, reqNum;
        if (a._isLegacy || (!a.parameters && a.data)) {
            // Legacy ActivityLog format
            params = a.data || {};
            r = (a.data && a.data.results) || {};
            client = a.clientName || (a.data && a.data.clientName) || 'Unnamed';
            reqNum = null;
        } else {
            // AnalysisStore format
            params = a.parameters || {};
            r = a.results || {};
            client = a.clientName || 'Unnamed';
            reqNum = a.requestNumber || null;
        }
        
        const savings = r.savingsVsFixed || 0;
        const modal = document.getElementById('editUserModal');
        const content = document.getElementById('editUserContent');
        
        var reqNumHtml = reqNum ? '<div style="font-family:monospace;font-size:13px;color:var(--accent-secondary);margin-top:4px;">' + reqNum + '</div>' : '';
        var userHtml = a.userName ? '<div style="font-size:12px;color:var(--text-tertiary);margin-top:2px;">By: ' + escapeHtml(a.userName) + '</div>' : '';
        
        // Monthly usage section (only for AnalysisStore records)
        var monthlyHtml = '';
        if (a.monthlyUsage && a.monthlyUsage.length > 0) {
            var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            monthlyHtml = '<div style="margin-top:20px;"><h4 style="margin:0 0 12px;">Monthly Usage (kWh)</h4><div style="background:var(--bg-tertiary);padding:16px;border-radius:8px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px;">';
            for (var mi = 0; mi < 12 && mi < a.monthlyUsage.length; mi++) {
                var val = a.monthlyUsage[mi] || 0;
                monthlyHtml += '<div style="text-align:center;"><span style="color:var(--text-tertiary);">' + monthNames[mi] + '</span><br><span style="font-weight:600;">' + Number(val).toLocaleString() + '</span></div>';
            }
            monthlyHtml += '</div></div>';
        }
        
        content.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--border-color);"><div><h2 style="margin:0;font-size:20px;">' + escapeHtml(client) + '</h2>' + reqNumHtml + userHtml + '<p style="margin:4px 0 0;font-size:13px;color:var(--text-tertiary);">' + new Date(a.timestamp).toLocaleString() + '</p></div><div style="text-align:right;"><div style="font-size:28px;font-weight:700;color:' + (savings >= 0 ? '#10b981' : '#ef4444') + ';">' + (savings >= 0 ? '+' : '') + '$' + Math.abs(savings).toLocaleString(undefined, {maximumFractionDigits: 0}) + '</div><div style="font-size:12px;color:var(--text-tertiary);">Savings</div></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">' +
        '<div><h4 style="margin:0 0 12px;">Parameters</h4><div style="background:var(--bg-tertiary);padding:16px;border-radius:8px;font-size:13px;">' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);"><span style="color:var(--text-tertiary);">ISO:</span><span style="font-weight:500;">' + (params.iso || 'N/A') + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);"><span style="color:var(--text-tertiary);">Zone:</span><span style="font-weight:500;">' + (params.zone || 'N/A') + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);"><span style="color:var(--text-tertiary);">Start:</span><span style="font-weight:500;">' + (params.startDate || 'N/A') + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);"><span style="color:var(--text-tertiary);">Term:</span><span style="font-weight:500;">' + (params.termMonths || 0) + 'mo</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);"><span style="color:var(--text-tertiary);">Fixed Rate:</span><span style="font-weight:500;">$' + (params.fixedPrice || 0).toFixed(4) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="color:var(--text-tertiary);">Usage:</span><span style="font-weight:500;">' + (a.totalAnnualUsage || params.totalAnnualUsage || 0).toLocaleString() + ' kWh</span></div>' +
        '</div></div>' +
        '<div><h4 style="margin:0 0 12px;">Results</h4><div style="background:var(--bg-tertiary);padding:16px;border-radius:8px;font-size:13px;">' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);"><span style="color:var(--text-tertiary);">Index Cost:</span><span style="font-weight:600;">$' + (r.totalIndexCost || 0).toLocaleString(undefined, {maximumFractionDigits: 0}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);"><span style="color:var(--text-tertiary);">Fixed Cost:</span><span style="font-weight:600;">$' + (r.totalFixedCost || 0).toLocaleString(undefined, {maximumFractionDigits: 0}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:10px 0 0;"><span style="color:var(--text-tertiary);">Savings:</span><span style="font-weight:700;font-size:16px;color:' + (savings >= 0 ? '#10b981' : '#ef4444') + ';">' + (savings >= 0 ? '+' : '') + '$' + Math.abs(savings).toLocaleString(undefined, {maximumFractionDigits: 0}) + '</span></div>' +
        '</div></div></div>' +
        monthlyHtml +
        '<div style="margin-top:20px;display:flex;gap:12px;"><button onclick="closeEditModal()" style="flex:1;padding:12px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:8px;cursor:pointer;">Close</button></div>';
        document.querySelector('#editUserModal .modal-title').textContent = 'Analysis Details';
        modal.classList.add('show');
    } catch (e) { showNotification('Failed to load details', 'error'); }
};

window.reloadAnalysis = function(encodedData) {
    trackButtonClick('Reload Analysis', 'analysis-history');
    try {
        const payload = JSON.parse(decodeURIComponent(encodedData));
        
        // Determine the full analysis data to send
        var analysisData = null;
        
        if (payload.requestNumber && typeof AnalysisStore !== 'undefined') {
            // Fetch full record from AnalysisStore by request number
            var fullRecord = AnalysisStore.getByRequestNumber(payload.requestNumber);
            if (fullRecord) {
                analysisData = {
                    requestNumber: fullRecord.requestNumber,
                    clientName: fullRecord.clientName,
                    clientId: fullRecord.clientId,
                    accountName: fullRecord.accountName,
                    accountId: fullRecord.accountId,
                    // All form parameters
                    iso: fullRecord.parameters.iso,
                    zone: fullRecord.parameters.zone,
                    startDate: fullRecord.parameters.startDate,
                    termMonths: fullRecord.parameters.termMonths,
                    fixedPrice: fullRecord.parameters.fixedPrice,
                    lmpAdjustment: fullRecord.parameters.lmpAdjustment || 0,
                    capacityCost: fullRecord.parameters.capacityCost,
                    ancillaryCost: fullRecord.parameters.ancillaryCost,
                    transmissionCost: fullRecord.parameters.transmissionCost,
                    projectionMethod: fullRecord.parameters.projectionMethod,
                    lmpEscalator: fullRecord.parameters.lmpEscalator,
                    simpleBlockRate: fullRecord.parameters.simpleBlockRate,
                    simpleHedgePercent: fullRecord.parameters.simpleHedgePercent,
                    // Monthly usage
                    monthlyUsage: fullRecord.monthlyUsage || [],
                    totalAnnualUsage: fullRecord.totalAnnualUsage,
                    // Full calculation results
                    calculationResults: fullRecord.calculationResults || [],
                    results: fullRecord.results || {}
                };
                console.log('[Main] Reloading full analysis:', fullRecord.requestNumber);
            } else {
                showNotification('Analysis ' + payload.requestNumber + ' not found - try refreshing', 'warning');
                return;
            }
        } else {
            // Legacy: payload IS the parameters (old ActivityLog format)
            analysisData = payload;
        }
        
        const lmpWidget = document.querySelector('[data-widget-id="lmp-comparison"] iframe');
        if (lmpWidget?.contentWindow) {
            lmpWidget.contentWindow.postMessage({ type: 'LOAD_ANALYSIS', data: analysisData }, '*');
            scrollToWidget('lmp-comparison');
            var reqLabel = analysisData.requestNumber ? ' (' + analysisData.requestNumber + ')' : '';
            showNotification('Analysis loaded' + reqLabel, 'success');
        } else {
            showNotification('Open LMP Comparison first', 'warning');
        }
    } catch (e) {
        console.error('Failed to reload analysis:', e);
        showNotification('Failed to reload', 'error');
    }
};

const AISearch = {
    init() {
        const input = document.getElementById('aiSearchInput');
        if (!input) return;
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                const query = input.value.trim();
                if (query) { scrollToWidget('ai-assistant'); const aiInput = document.getElementById('aiChatInput'); if (aiInput) { aiInput.value = query; sendAIMessage(); } input.value = ''; }
            }
        });
    }
};

function showNotification(message, type) { 
    const n = document.getElementById('notification'); 
    n.textContent = message; 
    n.className = 'notification show ' + (type || 'info'); 
    setTimeout(() => n.classList.remove('show'), 3000); 
}

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

function scrollToWidget(id) { 
    const w = document.querySelector('[data-widget-id="' + id + '"]'); 
    if (w) { w.scrollIntoView({ behavior: 'smooth' }); w.style.boxShadow = '0 0 20px var(--se-light-green)'; setTimeout(() => w.style.boxShadow = '', 2000); } 
}

function trackButtonClick(buttonName, widget, context) {
    if (currentUser) ActivityLog.logButtonClick({ userId: currentUser.id, userEmail: currentUser.email, userName: currentUser.firstName + ' ' + currentUser.lastName, button: buttonName, widget: widget || 'portal', context: context || null });
}

function updateDataStatus() {
    const stats = SecureEnergyData.getStats();
    document.getElementById('dataRecordCount').textContent = stats.totalRecords?.toLocaleString() || '0';
    document.getElementById('dataISOCount').textContent = stats.isoCount || '0';
    const indicator = document.getElementById('dataStatusIndicator'), title = document.getElementById('dataStatusTitle'), desc = document.getElementById('dataStatusDesc');
    if (stats.totalRecords > 0) { 
        indicator.style.background = 'var(--accent-success)'; 
        title.textContent = 'Data Loaded'; 
        let descText = stats.isos?.join(', ') || (stats.totalRecords + ' records');
        if (stats.lastUpdated) {
            try {
                const d = new Date(stats.lastUpdated);
                descText += ' · Updated ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            } catch (e) {}
        }
        desc.textContent = descText;
    }
    else { indicator.style.background = 'var(--accent-warning)'; title.textContent = 'No Data'; desc.textContent = 'Use Data Manager to load'; }
}

// =====================================================
// USER MANAGEMENT FUNCTIONS
// =====================================================
window.createUser = async function() {
    const firstName = document.getElementById('newFirstName')?.value?.trim();
    const lastName = document.getElementById('newLastName')?.value?.trim();
    const email = document.getElementById('newEmail')?.value?.trim();
    const password = document.getElementById('newPassword')?.value;
    const role = document.getElementById('newRole')?.value || 'user';
    
    if (!firstName || !lastName || !email || !password) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    const permissions = {
        'client-command-center': document.getElementById('perm-client-command-center')?.checked ?? true,
        'client-lookup': document.getElementById('perm-client-lookup')?.checked ?? true,
        'client-admin': document.getElementById('perm-client-admin')?.checked ?? true,
        'energy-utilization': document.getElementById('perm-energy-utilization')?.checked ?? true,
        'bid-management': document.getElementById('perm-bid-management')?.checked ?? true,
        'ai-assistant': document.getElementById('perm-ai-assistant')?.checked ?? true,
        'aei-intelligence': document.getElementById('perm-aei-intelligence')?.checked ?? true,
        'lmp-comparison': document.getElementById('perm-lmp-comparison')?.checked ?? true,
        'lmp-analytics': document.getElementById('perm-lmp-analytics')?.checked ?? true,
        'peak-demand': document.getElementById('perm-peak-demand')?.checked ?? true,
        'analysis-history': document.getElementById('perm-analysis-history')?.checked ?? true,
        'data-manager': document.getElementById('perm-data-manager')?.checked ?? false,
        'arcadia-fetcher': document.getElementById('perm-arcadia-fetcher')?.checked ?? false,
        'feedback': document.getElementById('perm-feedback')?.checked ?? true,
        'password-reset': document.getElementById('perm-password-reset')?.checked ?? true
    };
    
    const result = await UserStore.create({ firstName, lastName, email, password, role, permissions });
    if (result.success) {
        showNotification('User ' + firstName + ' ' + lastName + ' created!', 'success');
        logWidgetAction('User Created', 'user-admin', { email, role });
        // Clear form
        ['newFirstName', 'newLastName', 'newEmail', 'newPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('newRole').value = 'user';
        // Reset permission checkboxes to defaults
        document.querySelectorAll('.widget-permissions input[type="checkbox"]').forEach(cb => {
            cb.checked = !cb.id.includes('data-manager') && !cb.id.includes('arcadia-fetcher');
        });
    } else {
        showNotification(result.error || 'Failed to create user', 'error');
    }
};

window.editUser = function(userId) {
    const user = UserStore.getById(userId);
    if (!user) { showNotification('User not found', 'error'); return; }
    
    const modal = document.getElementById('editUserModal');
    const content = document.getElementById('editUserContent');
    const perms = user.permissions || {};
    const getChecked = (widgetId) => perms[widgetId] !== false ? 'checked' : '';
    
    content.innerHTML = '<div class="edit-user-form">' +
        '<div class="form-row"><div class="form-group"><label>First Name</label><input type="text" id="editFirstName" value="' + escapeHtml(user.firstName) + '"></div>' +
        '<div class="form-group"><label>Last Name</label><input type="text" id="editLastName" value="' + escapeHtml(user.lastName) + '"></div></div>' +
        '<div class="form-row single"><div class="form-group"><label>Email</label><input type="email" id="editEmail" value="' + escapeHtml(user.email) + '"></div></div>' +
        '<div class="form-row single"><div class="form-group"><label>New Password (leave blank to keep current)</label><input type="password" id="editPassword" placeholder="New password"></div></div>' +
        '<div class="form-row single"><div class="form-group"><label>Role</label><select id="editRole"><option value="user"' + (user.role === 'user' ? ' selected' : '') + '>Standard User</option><option value="admin"' + (user.role === 'admin' ? ' selected' : '') + '>Administrator</option></select></div></div>' +
        '<div class="widget-permissions" style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border-color);">' +
        '<h4 style="margin-bottom:12px;color:var(--text-secondary);">Widget Permissions</h4>' +
        '<div class="widget-permission-item"><span>Client Command Center</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-client-command-center" ' + getChecked('client-command-center') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>Client Lookup</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-client-lookup" ' + getChecked('client-lookup') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>Client Administration</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-client-admin" ' + getChecked('client-admin') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>Energy Utilization</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-energy-utilization" ' + getChecked('energy-utilization') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>Bid Management</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-bid-management" ' + getChecked('bid-management') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>AI Assistant</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-ai-assistant" ' + getChecked('ai-assistant') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>AE Intelligence (BUDA)</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-aei-intelligence" ' + getChecked('aei-intelligence') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>LMP Comparison</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-lmp-comparison" ' + getChecked('lmp-comparison') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>LMP Analytics V2</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-lmp-analytics" ' + getChecked('lmp-analytics') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>Peak Demand Analytics</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-peak-demand" ' + getChecked('peak-demand') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>Analysis History</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-analysis-history" ' + getChecked('analysis-history') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>Data Manager</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-data-manager" ' + getChecked('data-manager') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>Arcadia Fetcher</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-arcadia-fetcher" ' + getChecked('arcadia-fetcher') + '><span class="toggle-slider"></span></label></div>' +
        '<div class="widget-permission-item"><span>Feedback & Support</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-feedback" ' + getChecked('feedback') + '><span class="toggle-slider"></span></label><span style="font-size:0.7rem;color:var(--text-tertiary);margin-left:6px;">(Admin only)</span></div>' +
        '<div class="widget-permission-item"><span>Change Password</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-password-reset" ' + getChecked('password-reset') + '><span class="toggle-slider"></span></label></div>' +
        '</div>' +
        '<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border-color);">' +
        '<h4 style="margin-bottom:12px;color:var(--text-secondary);">Security</h4>' +
        '<div class="widget-permission-item"><span>Force Password Reset on Next Login</span><label class="toggle-switch"><input type="checkbox" id="edit-force-password-reset" ' + (user.forcePasswordReset ? 'checked' : '') + '><span class="toggle-slider"></span></label></div>' +
        '</div>' +
        '<div style="margin-top:20px;display:flex;gap:12px;">' +
        '<button class="btn-primary" onclick="saveUserEdit(\'' + userId + '\')">Save Changes</button>' +
        '<button class="btn-secondary" onclick="closeEditModal()">Cancel</button>' +
        '</div></div>';
    
    document.querySelector('#editUserModal .modal-title').textContent = 'Edit User';
    modal.classList.add('show');
};

window.saveUserEdit = async function(userId) {
    const saveBtn = document.querySelector('#editUserModal .btn-primary');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
    
    const updates = {
        firstName: document.getElementById('editFirstName')?.value?.trim(),
        lastName: document.getElementById('editLastName')?.value?.trim(),
        email: document.getElementById('editEmail')?.value?.trim(),
        role: document.getElementById('editRole')?.value,
        permissions: {
            'client-command-center': document.getElementById('edit-perm-client-command-center')?.checked,
            'client-lookup': document.getElementById('edit-perm-client-lookup')?.checked,
            'client-admin': document.getElementById('edit-perm-client-admin')?.checked,
            'energy-utilization': document.getElementById('edit-perm-energy-utilization')?.checked,
            'bid-management': document.getElementById('edit-perm-bid-management')?.checked,
            'ai-assistant': document.getElementById('edit-perm-ai-assistant')?.checked,
            'aei-intelligence': document.getElementById('edit-perm-aei-intelligence')?.checked,
            'lmp-comparison': document.getElementById('edit-perm-lmp-comparison')?.checked,
            'lmp-analytics': document.getElementById('edit-perm-lmp-analytics')?.checked,
            'peak-demand': document.getElementById('edit-perm-peak-demand')?.checked,
            'analysis-history': document.getElementById('edit-perm-analysis-history')?.checked,
            'data-manager': document.getElementById('edit-perm-data-manager')?.checked,
            'arcadia-fetcher': document.getElementById('edit-perm-arcadia-fetcher')?.checked,
            'feedback': document.getElementById('edit-perm-feedback')?.checked,
            'password-reset': document.getElementById('edit-perm-password-reset')?.checked
        },
        forcePasswordReset: document.getElementById('edit-force-password-reset')?.checked || false
    };
    
    const newPassword = document.getElementById('editPassword')?.value;
    if (newPassword) updates.password = newPassword;
    
    try {
        const result = await UserStore.update(userId, updates);
        if (result.success) {
            showNotification('User updated successfully', 'success');
            logWidgetAction('User Updated', 'user-admin', { userId, email: updates.email });
            closeEditModal();
            renderUsersTable();
        } else {
            showNotification(result.error || 'Failed to update user', 'error');
        }
    } catch (e) {
        showNotification('Error updating user: ' + e.message, 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    }
};

window.deleteUser = function(userId) {
    const user = UserStore.getById(userId);
    if (!user) { showNotification('User not found', 'error'); return; }
    
    if (confirm('Are you sure you want to delete ' + user.firstName + ' ' + user.lastName + '?')) {
        const result = UserStore.delete(userId);
        if (result.success) {
            showNotification('User deleted', 'success');
            logWidgetAction('User Deleted', 'user-admin', { userId, email: user.email });
            renderUsersTable();
        } else {
            showNotification(result.error || 'Failed to delete user', 'error');
        }
    }
};

window.forceResetUser = async function(userId) {
    const user = UserStore.getById(userId);
    if (!user) { showNotification('User not found', 'error'); return; }
    
    // Toggle: if already flagged, offer to clear it
    if (user.forcePasswordReset) {
        if (confirm('Clear the force reset flag for ' + user.firstName + ' ' + user.lastName + '?')) {
            const result = await UserStore.update(userId, { forcePasswordReset: false });
            if (result.success) {
                showNotification('Force reset cleared for ' + user.firstName, 'success');
                logWidgetAction('Force Reset Cleared', 'user-admin', { userId, email: user.email });
                renderUsersTable();
            }
        }
        return;
    }
    
    if (confirm('Force ' + user.firstName + ' ' + user.lastName + ' to reset their password on next login?')) {
        const result = await UserStore.update(userId, { forcePasswordReset: true });
        if (result.success) {
            showNotification(user.firstName + ' must reset password on next login', 'success');
            logWidgetAction('Force Password Reset', 'user-admin', { userId, email: user.email });
            renderUsersTable();
        } else {
            showNotification(result.error || 'Failed to set force reset', 'error');
        }
    }
};

window.forceResetAllUsers = async function() {
    if (!confirm('This will require ALL users (except you) to change their password on next login.\n\nContinue?')) return;
    if (!confirm('Are you absolutely sure? This affects every user account.')) return;
    
    const users = UserStore.getAll();
    let count = 0;
    for (const user of users) {
        if (user.id !== currentUser?.id) {
            await UserStore.update(user.id, { forcePasswordReset: true });
            count++;
        }
    }
    
    showNotification(count + ' users will be required to reset their password on next login', 'success');
    logWidgetAction('Force Reset All Users', 'user-admin', { count });
    renderUsersTable();
};

window.closeEditModal = function() {
    const modal = document.getElementById('editUserModal');
    if (modal) modal.classList.remove('show');
};

// Export functions
window.exportAllUsers = function() {
    const users = UserStore.getAll().map(u => ({ ...u, password: '***' }));
    const csv = 'First Name,Last Name,Email,Role,Status,Created\n' + 
        users.map(u => [u.firstName, u.lastName, u.email, u.role, u.status || 'active', u.createdAt].join(',')).join('\n');
    downloadFile(csv, 'users-export.csv', 'text/csv');
    logWidgetAction('Export Users', 'user-admin', { count: users.length });
    showNotification('Users exported', 'success');
};

window.exportActivityLog = function() {
    const logs = ActivityLog.getAll();
    const csv = 'Timestamp,User,Action,Widget,Client,Details\n' +
        logs.map(l => [l.timestamp, l.userName || '', l.action, l.widget, l.clientName || '', JSON.stringify(l.data || {})].join(',')).join('\n');
    downloadFile(csv, 'activity-log-export.csv', 'text/csv');
    logWidgetAction('Export Activity', 'user-admin', { count: logs.length });
    showNotification('Activity log exported', 'success');
};

window.exportLMPData = function() {
    const data = SecureEnergyData.getAll();
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, 'lmp-data-export.json', 'application/json');
    logWidgetAction('Export LMP Data', 'user-admin', { recordCount: Object.keys(data).length });
    showNotification('LMP data exported', 'success');
};

window.exportMyAnalysisRecords = function() {
    if (!currentUser) return;
    
    // Prefer AnalysisStore; fallback to ActivityLog
    var records;
    var useAnalysisStore = typeof AnalysisStore !== 'undefined' && AnalysisStore.getAll().length > 0;
    
    if (useAnalysisStore) {
        records = currentUser.role === 'admin' ? AnalysisStore.getAll() : AnalysisStore.getByUser(currentUser.id);
        var csv = 'Request Number,Date,User,Client,ISO,Zone,Term (mo),Fixed Rate,Total Usage (kWh),Index Cost,Fixed Cost,Savings\n' +
            records.map(function(a) {
                var p = a.parameters || {};
                var r = a.results || {};
                return [
                    a.requestNumber || '', 
                    new Date(a.timestamp).toLocaleDateString(), 
                    a.userName || '',
                    '"' + (a.clientName || '').replace(/"/g, '""') + '"', 
                    p.iso || '', 
                    p.zone || '', 
                    p.termMonths || '', 
                    p.fixedPrice || '', 
                    a.totalAnnualUsage || '', 
                    r.totalIndexCost || '', 
                    r.totalFixedCost || '', 
                    r.savingsVsFixed || ''
                ].join(',');
            }).join('\n');
        downloadFile(csv, 'analysis-history.csv', 'text/csv');
        logWidgetAction('History Export', 'analysis-history', { count: records.length, source: 'AnalysisStore' });
    } else {
        // Legacy: fall back to ActivityLog
        var logs = ActivityLog.getByUser(currentUser.id).filter(function(l) { return l.action === 'LMP Analysis'; });
        var csv = 'Date,Client,ISO,Zone,Term,Fixed Rate,Usage,Index Cost,Fixed Cost,Savings\n' +
            logs.map(function(l) {
                var d = l.data || {};
                var r = d.results || {};
                return [new Date(l.timestamp).toLocaleDateString(), d.clientName || '', d.iso || '', d.zone || '', d.termMonths || '', d.fixedPrice || '', d.totalAnnualUsage || '', r.totalIndexCost || '', r.totalFixedCost || '', r.savingsVsFixed || ''].join(',');
            }).join('\n');
        downloadFile(csv, 'my-analysis-history.csv', 'text/csv');
        logWidgetAction('History Export', 'analysis-history', { count: logs.length, source: 'ActivityLog' });
    }
    
    showNotification('Analysis history exported', 'success');
};

window.refreshAnalysisHistory = function() {
    // Try to refresh from Azure first for cross-device sync
    if (typeof AnalysisStore !== 'undefined' && typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
        showNotification('Syncing analysis history from Azure...', 'info');
        AnalysisStore.refresh().then(function(result) {
            renderAnalysisHistory();
            if (result.success) {
                showNotification('Analysis history synced (' + result.count + ' records)', 'success');
            } else {
                showNotification('Analysis history refreshed (local only)', 'info');
            }
        }).catch(function() {
            renderAnalysisHistory();
            showNotification('Analysis history refreshed (local only)', 'info');
        });
    } else {
        renderAnalysisHistory();
        showNotification('Analysis history refreshed', 'info');
    }
};

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEditModal(); });
document.getElementById('editUserModal')?.addEventListener('click', function(e) { if (e.target === this) closeEditModal(); });

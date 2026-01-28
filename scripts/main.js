/**
 * Secure Energy Analytics Portal - Main Controller v2.2
 * 
 * v2.2 Updates:
 * - GitHub Sync tab for cross-user activity persistence
 * - Error Log viewer in Admin panel
 * - Show button for analysis details
 * - Export All Records for users
 * - Activity Stats boxes
 */

let currentUser = null;

const WIDGETS = [
    { id: 'user-admin', name: 'User Administration', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', adminOnly: true, fullWidth: true, embedded: true },
    { id: 'ai-assistant', name: 'AI Assistant', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>', fullWidth: true, embedded: true, height: 500 },
    { id: 'lmp-analytics', name: 'LMP Analytics Dashboard', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>', src: 'widgets/lmp-analytics.html', fullWidth: true, height: 800 },
    { id: 'data-manager', name: 'LMP Data Manager', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>', src: 'widgets/lmp-data-manager.html', height: 500 },
    { id: 'arcadia-fetcher', name: 'Arcadia LMP Data Fetcher', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>', src: 'widgets/arcadia-lmp-fetcher.html', height: 500 },
    { id: 'lmp-comparison', name: 'LMP Comparison Portal', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', src: 'widgets/lmp-comparison-portal.html', fullWidth: true, height: 700 },
    { id: 'analysis-history', name: 'My Analysis History', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', fullWidth: true, embedded: true }
];

// =====================================================
// THEME
// =====================================================
window.setTheme = function(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('secureEnergy_theme', theme);
    document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === theme));
    document.querySelectorAll('iframe').forEach(iframe => { try { iframe.contentDocument?.documentElement?.setAttribute('data-theme', theme); } catch {} });
};

function loadSavedTheme() { window.setTheme(localStorage.getItem('secureEnergy_theme') || 'dark'); }

// =====================================================
// INITIALIZATION
// =====================================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[Portal] Initializing v2.2...');
    loadSavedTheme();
    
    await UserStore.init();
    await ActivityLog.init();
    await SecureEnergyData.init();
    GitHubSync.pullLatest();
    
    initAuth();
    AISearch.init();
    initWeather();
    initClock();
    
    SecureEnergyData.subscribe(updateDataStatus);
    updateDataStatus();
    
    window.addEventListener('message', handleWidgetMessage);
    console.log('[Portal] Ready');
});

// =====================================================
// WEATHER & CLOCK
// =====================================================
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
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`);
        const data = await res.json();
        if (data.current) {
            tempEl.textContent = `${Math.round(data.current.temperature_2m)}°F`;
            try {
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
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
    timeEl.textContent = `${h % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    dateEl.textContent = `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]}, ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()]} ${now.getDate()}`;
}

// =====================================================
// AUTH
// =====================================================
function initAuth() {
    currentUser = UserStore.getCurrentUser();
    currentUser ? showPortal(currentUser) : showLogin();
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
    document.getElementById('userName').textContent = `${user.firstName} ${user.lastName}`;
    document.getElementById('userAvatar').textContent = user.firstName.charAt(0) + user.lastName.charAt(0);
    document.getElementById('userRole').textContent = user.role === 'admin' ? 'Administrator' : 'User';
    document.getElementById('userRole').className = 'user-role ' + (user.role === 'admin' ? 'admin' : '');
    renderWidgets(user);
}

document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value, password = document.getElementById('loginPassword').value;
    const result = UserStore.authenticate(email, password);
    if (result.success) {
        currentUser = result.user;
        UserStore.setCurrentUser(result.user);
        showPortal(result.user);
        showNotification('Welcome back, ' + result.user.firstName + '!', 'success');
        ActivityLog.log({ userId: result.user.id, userEmail: result.user.email, userName: `${result.user.firstName} ${result.user.lastName}`, widget: 'portal', action: 'Login' });
    } else {
        document.getElementById('loginError').textContent = result.error;
        document.getElementById('loginError').classList.add('show');
    }
});

document.getElementById('logoutBtn').addEventListener('click', function() {
    if (currentUser) ActivityLog.log({ userId: currentUser.id, userEmail: currentUser.email, userName: `${currentUser.firstName} ${currentUser.lastName}`, widget: 'portal', action: 'Logout' });
    UserStore.clearSession();
    currentUser = null;
    showLogin();
    showNotification('Logged out', 'info');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').classList.remove('show');
});

// =====================================================
// WIDGETS
// =====================================================
function renderWidgets(user) {
    const container = document.getElementById('widgetsGrid');
    container.innerHTML = '';
    WIDGETS.forEach(w => {
        if (w.adminOnly && user.role !== 'admin') return;
        if (user.permissions && user.permissions[w.id] === false) return;
        container.appendChild(createWidgetElement(w));
    });
    if (user.role === 'admin') initAdminWidget();
    initAIAssistantWidget();
    initAnalysisHistoryWidget();
}

function createWidgetElement(widget) {
    const div = document.createElement('div');
    div.className = 'widget' + (widget.fullWidth ? ' full-width' : '');
    div.dataset.widgetId = widget.id;
    
    const popoutBtn = widget.src ? `<button class="widget-btn" onclick="popoutWidget('${widget.id}')" title="Pop out"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>` : '';
    
    if (widget.embedded && widget.id === 'user-admin') {
        div.innerHTML = `<div class="widget-header"><div class="widget-title">${widget.icon}<span>${widget.name}</span><span class="widget-badge">ADMIN</span></div></div><div class="widget-content admin-widget-content" id="adminWidgetContent" style="height:700px;"></div>`;
    } else if (widget.embedded && widget.id === 'ai-assistant') {
        div.innerHTML = `<div class="widget-header"><div class="widget-title">${widget.icon}<span>${widget.name}</span><span class="widget-badge" style="background:var(--accent-info);">BETA</span></div></div><div class="widget-content ai-assistant-content" id="aiAssistantContent" style="height:${widget.height||500}px;"></div>`;
    } else if (widget.embedded && widget.id === 'analysis-history') {
        div.innerHTML = `<div class="widget-header"><div class="widget-title">${widget.icon}<span>${widget.name}</span></div><div class="widget-actions"><button class="widget-btn" onclick="exportMyAnalysisRecords()" title="Export"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button><button class="widget-btn" onclick="refreshAnalysisHistory()" title="Refresh"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg></button></div></div><div class="widget-content analysis-history-content" id="analysisHistoryContent" style="height:500px;overflow-y:auto;"></div>`;
    } else {
        div.innerHTML = `<div class="widget-header"><div class="widget-title">${widget.icon}<span>${widget.name}</span></div><div class="widget-actions">${popoutBtn}</div></div><div class="widget-content" style="height:${widget.height||500}px;"><iframe class="widget-iframe" src="${widget.src}" title="${widget.name}"></iframe></div>`;
    }
    return div;
}

function popoutWidget(id) { const w = WIDGETS.find(x => x.id === id); if (w?.src) window.open(w.src, id, 'width=1200,height=800'); }

// =====================================================
// ADMIN WIDGET
// =====================================================
function initAdminWidget() {
    const content = document.getElementById('adminWidgetContent');
    if (!content) return;
    
    content.innerHTML = `
        <div class="admin-tabs">
            <button class="admin-tab active" data-tab="create">Create User</button>
            <button class="admin-tab" data-tab="manage">Manage Users</button>
            <button class="admin-tab" data-tab="activity">Activity Log</button>
            <button class="admin-tab" data-tab="github">GitHub Sync</button>
            <button class="admin-tab" data-tab="errors">Error Log</button>
            <button class="admin-tab" data-tab="export">Export Data</button>
        </div>
        <div class="admin-panel active" id="panel-create">${getCreateUserPanel()}</div>
        <div class="admin-panel" id="panel-manage">${getManageUsersPanel()}</div>
        <div class="admin-panel" id="panel-activity">${getActivityLogPanel()}</div>
        <div class="admin-panel" id="panel-github">${getGitHubSyncPanel()}</div>
        <div class="admin-panel" id="panel-errors">${getErrorLogPanel()}</div>
        <div class="admin-panel" id="panel-export">${getExportPanel()}</div>
    `;
    
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
        });
    });
}

function getCreateUserPanel() {
    return `<div class="create-user-form"><h3 style="margin-bottom:20px;font-size:16px;">Create New User</h3>
        <div class="form-row"><div class="form-group"><label>First Name *</label><input type="text" id="newFirstName" placeholder="First name"></div><div class="form-group"><label>Last Name *</label><input type="text" id="newLastName" placeholder="Last name"></div></div>
        <div class="form-row single"><div class="form-group"><label>Email *</label><input type="email" id="newEmail" placeholder="Email"></div></div>
        <div class="form-row single"><div class="form-group"><label>Password *</label><input type="password" id="newPassword" placeholder="Password"></div></div>
        <div class="form-row single"><div class="form-group"><label>Role</label><select id="newRole"><option value="user">Standard User</option><option value="admin">Administrator</option></select></div></div>
        <div class="widget-permissions"><h4>Widget Permissions</h4>
            <div class="widget-permission-item"><span>AI Assistant</span><label class="toggle-switch"><input type="checkbox" id="perm-ai-assistant" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>LMP Comparison</span><label class="toggle-switch"><input type="checkbox" id="perm-lmp-comparison" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>LMP Analytics</span><label class="toggle-switch"><input type="checkbox" id="perm-lmp-analytics" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>Analysis History</span><label class="toggle-switch"><input type="checkbox" id="perm-analysis-history" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>Data Manager</span><label class="toggle-switch"><input type="checkbox" id="perm-data-manager"><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>Arcadia Fetcher</span><label class="toggle-switch"><input type="checkbox" id="perm-arcadia-fetcher"><span class="toggle-slider"></span></label></div>
        </div>
        <button class="btn-primary" onclick="createUser()" style="margin-top:20px;">Create User</button></div>`;
}

function getManageUsersPanel() { return `<div style="overflow-x:auto;"><table class="users-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody id="usersTableBody"></tbody></table></div>`; }

function getActivityLogPanel() {
    return `<div class="activity-stats-grid" id="activityStatsGrid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px;"></div>
        <div class="activity-filters"><input type="text" id="activitySearch" placeholder="Search..." oninput="renderActivityLog()"><select id="activityWidgetFilter" onchange="renderActivityLog()"><option value="">All Widgets</option><option value="lmp-comparison">LMP Comparison</option><option value="lmp-analytics">LMP Analytics</option><option value="portal">Portal</option></select></div>
        <div id="activityLogContainer" style="max-height:400px;overflow-y:auto;"></div>`;
}

function getGitHubSyncPanel() {
    return `<div style="max-width:700px;">
        <h3 style="margin-bottom:16px;font-size:16px;">GitHub Sync Configuration</h3>
        <p style="margin-bottom:20px;color:var(--text-secondary);font-size:13px;">Sync activity logs to GitHub for cross-user persistence. Requires a GitHub PAT with <code>repo</code> scope.</p>
        <div id="githubSyncStatus" style="margin-bottom:20px;"></div>
        <div class="form-group" style="margin-bottom:16px;">
            <label style="display:block;margin-bottom:8px;font-weight:500;">GitHub Personal Access Token</label>
            <div style="display:flex;gap:10px;"><input type="password" id="githubTokenInput" placeholder="ghp_xxxxxxxxxxxx" style="flex:1;padding:10px 12px;border:1px solid var(--border-primary);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);"><button onclick="saveGitHubToken()" class="btn-primary" style="padding:10px 20px;">Save</button></div>
            <p style="font-size:11px;color:var(--text-tertiary);margin-top:6px;">Stored in sessionStorage only (clears on browser close)</p>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
            <label class="toggle-switch"><input type="checkbox" id="autoSyncToggle" onchange="toggleAutoSync(this.checked)" ${GitHubSync.autoSyncEnabled ? 'checked' : ''}><span class="toggle-slider"></span></label>
            <div><div style="font-weight:500;">Auto-Sync</div><div style="font-size:12px;color:var(--text-tertiary);">Automatically sync after each activity</div></div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <button onclick="testGitHubConnection()" class="export-btn">Test Connection</button>
            <button onclick="manualSyncActivity()" class="export-btn">Sync Activity Now</button>
            <button onclick="manualSyncUsers()" class="export-btn">Sync Users Now</button>
            <button onclick="clearGitHubToken()" class="export-btn" style="background:#ef4444;">Clear Token</button>
        </div>
        <div style="margin-top:24px;padding:16px;background:var(--bg-tertiary);border-radius:8px;">
            <h4 style="margin-bottom:12px;font-size:14px;">How to Create a Token:</h4>
            <ol style="font-size:13px;color:var(--text-secondary);padding-left:20px;line-height:1.8;">
                <li>GitHub → Settings → Developer Settings</li>
                <li>Personal Access Tokens → Tokens (classic)</li>
                <li>Generate new token (classic)</li>
                <li>Name: "SES Activity Sync"</li>
                <li>Scope: <strong>repo</strong> (full control)</li>
                <li>Generate and copy</li>
            </ol>
        </div>
    </div>`;
}

function getErrorLogPanel() {
    return `<div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="margin:0;font-size:16px;">Error Log</h3>
        <button onclick="clearErrorLog()" class="export-btn" style="background:#ef4444;">Clear All</button>
    </div><div id="errorStatsContainer" style="margin-bottom:16px;"></div><div id="errorLogContainer" style="max-height:400px;overflow-y:auto;"></div></div>`;
}

function getExportPanel() {
    return `<div style="max-width:800px;">
        <h3 style="margin-bottom:20px;font-size:16px;">Export Data</h3>
        <div class="export-section"><h4>Users</h4><p style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">Save as <code>data/users.json</code></p><button class="export-btn" onclick="exportUsers()">Download users.json</button></div>
        <div class="export-section"><h4>Activity Log</h4><p style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">Save as <code>data/activity-log.json</code></p><button class="export-btn" onclick="exportActivityLog()">Download activity-log.json</button></div>
        <div class="export-section"><h4>LMP Data</h4><p style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">Save as <code>data/lmp-database.json</code></p><button class="export-btn" onclick="exportLMPData()">Download lmp-database.json</button></div>
    </div>`;
}

// =====================================================
// GITHUB SYNC FUNCTIONS
// =====================================================
function renderGitHubSyncStatus() {
    const container = document.getElementById('githubSyncStatus');
    if (!container) return;
    const status = GitHubSync.getStatus();
    const tokenInput = document.getElementById('githubTokenInput');
    if (tokenInput && status.hasToken) tokenInput.value = '••••••••••••••••';
    
    container.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;text-align:center;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">Status</div><div style="font-size:14px;font-weight:600;color:${status.hasToken ? '#10b981' : '#f59e0b'};">${status.hasToken ? '✓ Connected' : '⚠ No Token'}</div></div>
        <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;text-align:center;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">Auto-Sync</div><div style="font-size:14px;font-weight:600;color:${status.autoSyncEnabled ? '#10b981' : '#6b7280'};">${status.autoSyncEnabled ? 'Enabled' : 'Disabled'}</div></div>
        <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;text-align:center;"><div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">Last Sync</div><div style="font-size:14px;font-weight:600;">${status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Never'}</div></div>
    </div>`;
}

function saveGitHubToken() {
    const input = document.getElementById('githubTokenInput'), token = input.value.trim();
    if (!token || token === '••••••••••••••••') { showNotification('Enter a valid token', 'warning'); return; }
    GitHubSync.setToken(token);
    showNotification('Token saved! Testing...', 'info');
    testGitHubConnection();
}

async function testGitHubConnection() {
    showNotification('Testing connection...', 'info');
    const result = await GitHubSync.testConnection();
    showNotification(result.success ? `Connected to ${result.repo}!` : `Failed: ${result.error}`, result.success ? 'success' : 'error');
    renderGitHubSyncStatus();
}

async function manualSyncActivity() {
    if (!GitHubSync.hasToken()) { showNotification('Configure token first', 'warning'); return; }
    showNotification('Syncing...', 'info');
    const result = await GitHubSync.syncActivityLog();
    showNotification(result.success ? `Synced ${result.count} activities!` : `Failed: ${result.error}`, result.success ? 'success' : 'error');
    renderGitHubSyncStatus();
    renderActivityLog();
}

async function manualSyncUsers() {
    if (!GitHubSync.hasToken()) { showNotification('Configure token first', 'warning'); return; }
    showNotification('Syncing users...', 'info');
    const result = await GitHubSync.syncUsers();
    showNotification(result.success ? `Synced ${result.count} users!` : `Failed: ${result.error}`, result.success ? 'success' : 'error');
    renderGitHubSyncStatus();
}

function toggleAutoSync(enabled) { GitHubSync.setAutoSync(enabled); showNotification(`Auto-sync ${enabled ? 'enabled' : 'disabled'}`, 'info'); }
function clearGitHubToken() { if (!confirm('Clear token?')) return; GitHubSync.clearToken(); document.getElementById('githubTokenInput').value = ''; showNotification('Token cleared', 'info'); renderGitHubSyncStatus(); }

// =====================================================
// ERROR LOG FUNCTIONS
// =====================================================
function renderErrorLog() {
    const container = document.getElementById('errorLogContainer'), statsContainer = document.getElementById('errorStatsContainer');
    if (!container) return;
    
    const errors = ErrorLog.getRecent(50), stats = ErrorLog.getStats();
    const typeColors = { javascript: '#ef4444', promise: '#f59e0b', github: '#8b5cf6', widget: '#ec4899', network: '#3b82f6', init: '#06b6d4', storage: '#84cc16, parse: '#14b8a6' };
    
    if (statsContainer) {
        statsContainer.innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
            <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;text-align:center;border-left:4px solid #ef4444;"><div style="font-size:24px;font-weight:700;color:#ef4444;">${stats.total}</div><div style="font-size:11px;color:var(--text-tertiary);">Total</div></div>
            <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;text-align:center;border-left:4px solid #f59e0b;"><div style="font-size:24px;font-weight:700;color:#f59e0b;">${stats.today}</div><div style="font-size:11px;color:var(--text-tertiary);">Today</div></div>
            <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;text-align:center;border-left:4px solid #8b5cf6;"><div style="font-size:24px;font-weight:700;color:#8b5cf6;">${stats.unresolved}</div><div style="font-size:11px;color:var(--text-tertiary);">Unresolved</div></div>
            <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;text-align:center;border-left:4px solid #10b981;"><div style="font-size:24px;font-weight:700;color:#10b981;">${stats.total - stats.unresolved}</div><div style="font-size:11px;color:var(--text-tertiary);">Resolved</div></div>
        </div>`;
    }
    
    if (errors.length === 0) { container.innerHTML = '<p style="color:var(--text-tertiary);text-align:center;padding:40px;">No errors logged 🎉</p>'; return; }
    
    container.innerHTML = errors.map(e => {
        const color = typeColors[e.type] || '#6b7280';
        return `<div style="background:var(--bg-secondary);border-radius:8px;padding:12px;margin-bottom:8px;border-left:4px solid ${color};${e.resolved ? 'opacity:0.6;' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                <div><span style="background:${color};color:white;padding:2px 8px;border-radius:4px;font-size:10px;text-transform:uppercase;">${e.type}</span><span style="margin-left:8px;font-size:12px;color:var(--text-tertiary);">${e.widget}</span></div>
                <span style="font-size:11px;color:var(--text-tertiary);">${new Date(e.timestamp).toLocaleString()}</span>
            </div>
            <div style="font-size:13px;color:var(--text-primary);margin-bottom:8px;word-break:break-word;">${escapeHtml(e.message)}</div>
            ${e.source ? `<div style="font-size:11px;color:var(--text-tertiary);">Source: ${e.source}${e.line ? ':' + e.line : ''}</div>` : ''}
            ${!e.resolved ? `<button onclick="resolveError('${e.id}')" style="margin-top:8px;padding:4px 12px;font-size:11px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:4px;cursor:pointer;color:var(--text-secondary);">Mark Resolved</button>` : '<span style="font-size:11px;color:#10b981;">✓ Resolved</span>'}
        </div>`;
    }).join('');
}

function resolveError(id) { ErrorLog.resolve(id); renderErrorLog(); showNotification('Resolved', 'success'); }
function clearErrorLog() { if (!confirm('Clear all errors?')) return; ErrorLog.clearAll(); renderErrorLog(); showNotification('Cleared', 'success'); }

// =====================================================
// USER MANAGEMENT
// =====================================================
function createUser() {
    const firstName = document.getElementById('newFirstName').value.trim(), lastName = document.getElementById('newLastName').value.trim();
    const email = document.getElementById('newEmail').value.trim(), password = document.getElementById('newPassword').value, role = document.getElementById('newRole').value;
    if (!firstName || !lastName || !email || !password) { showNotification('Fill all required fields', 'error'); return; }
    
    const permissions = { 'ai-assistant': document.getElementById('perm-ai-assistant').checked, 'lmp-comparison': document.getElementById('perm-lmp-comparison').checked, 'lmp-analytics': document.getElementById('perm-lmp-analytics').checked, 'analysis-history': document.getElementById('perm-analysis-history').checked, 'data-manager': document.getElementById('perm-data-manager').checked, 'arcadia-fetcher': document.getElementById('perm-arcadia-fetcher').checked, 'user-admin': role === 'admin' };
    
    try {
        UserStore.create({ firstName, lastName, email, password, role, permissions });
        showNotification('User created!', 'success');
        ['newFirstName', 'newLastName', 'newEmail', 'newPassword'].forEach(id => document.getElementById(id).value = '');
    } catch (e) { showNotification(e.message, 'error'); }
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    tbody.innerHTML = UserStore.getAll().map(u => `<tr>
        <td>${u.firstName} ${u.lastName}</td><td>${u.email}</td><td><span class="role-badge ${u.role}">${u.role}</span></td>
        <td><span class="status-badge ${u.status}">${u.status}</span></td><td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td><button class="action-btn" onclick="editUser('${u.id}')" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        ${u.email !== 'admin@sesenergy.org' ? `<button class="action-btn delete" onclick="deleteUser('${u.id}')" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}</td>
    </tr>`).join('');
}

function editUser(userId) {
    const user = UserStore.findById(userId);
    if (!user) return;
    const modal = document.getElementById('editUserModal'), content = document.getElementById('editUserContent');
    content.innerHTML = `<input type="hidden" id="editUserId" value="${user.id}">
        <div class="form-row"><div class="form-group"><label>First Name</label><input type="text" id="editFirstName" value="${user.firstName}"></div><div class="form-group"><label>Last Name</label><input type="text" id="editLastName" value="${user.lastName}"></div></div>
        <div class="form-row single"><div class="form-group"><label>Email</label><input type="email" id="editEmail" value="${user.email}" ${user.email === 'admin@sesenergy.org' ? 'disabled' : ''}></div></div>
        <div class="form-row single"><div class="form-group"><label>Role</label><select id="editRole" ${user.email === 'admin@sesenergy.org' ? 'disabled' : ''}><option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option></select></div></div>
        <button class="btn-primary" onclick="saveUserEdit()" style="width:100%;margin-top:20px;">Save</button>`;
    document.querySelector('#editUserModal .modal-title').textContent = 'Edit User';
    modal.classList.add('show');
}

function saveUserEdit() {
    const userId = document.getElementById('editUserId').value;
    try {
        UserStore.update(userId, { firstName: document.getElementById('editFirstName').value.trim(), lastName: document.getElementById('editLastName').value.trim(), email: document.getElementById('editEmail').value.trim(), role: document.getElementById('editRole').value });
        showNotification('Updated!', 'success');
        closeEditModal();
        renderUsersTable();
    } catch (e) { showNotification(e.message, 'error'); }
}

function deleteUser(userId) { if (!confirm('Delete this user?')) return; try { UserStore.delete(userId); showNotification('Deleted', 'success'); renderUsersTable(); } catch (e) { showNotification(e.message, 'error'); } }
function closeEditModal() { document.getElementById('editUserModal').classList.remove('show'); }

// =====================================================
// ACTIVITY LOG
// =====================================================
function renderActivityLog() {
    const container = document.getElementById('activityLogContainer'), statsGrid = document.getElementById('activityStatsGrid');
    if (!container) return;
    if (statsGrid) renderActivityStats();
    
    const search = document.getElementById('activitySearch')?.value.toLowerCase() || '', widgetFilter = document.getElementById('activityWidgetFilter')?.value || '';
    let activities = ActivityLog.getRecent(100);
    if (search) activities = activities.filter(a => (a.clientName || a.data?.clientName || '').toLowerCase().includes(search) || (a.userName || '').toLowerCase().includes(search));
    if (widgetFilter) activities = activities.filter(a => a.widget === widgetFilter);
    
    if (activities.length === 0) { container.innerHTML = '<p style="color:var(--text-tertiary);text-align:center;padding:40px;">No activities</p>'; return; }
    
    container.innerHTML = activities.map(a => {
        const client = a.clientName || a.data?.clientName;
        return `<div class="activity-card"><div class="activity-card-header"><span class="activity-card-title">${a.action}</span><span class="activity-card-time">${new Date(a.timestamp).toLocaleString()}</span></div>
        <div class="activity-card-meta"><span>User: ${a.userName || 'Unknown'}</span><span>Widget: ${a.widget}</span>${client ? `<span style="color:var(--accent-primary);font-weight:600;">Client: ${client}</span>` : ''}</div></div>`;
    }).join('');
}

function renderActivityStats() {
    const grid = document.getElementById('activityStatsGrid');
    if (!grid) return;
    const stats = ActivityLog.getActivityStats();
    grid.innerHTML = `
        <div style="background:var(--bg-secondary);border-radius:10px;padding:16px;border-left:4px solid var(--accent-primary);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><h4 style="margin:0;font-size:14px;">Logins</h4></div><div style="display:flex;justify-content:space-around;text-align:center;"><div><div style="font-size:28px;font-weight:700;color:var(--accent-primary);">${stats.logins.today}</div><div style="font-size:11px;color:var(--text-tertiary);">TODAY</div></div><div style="border-left:1px solid var(--border-color);padding-left:20px;"><div style="font-size:28px;font-weight:700;color:var(--text-secondary);">${stats.logins.total}</div><div style="font-size:11px;color:var(--text-tertiary);">ALL TIME</div></div></div></div>
        <div style="background:var(--bg-secondary);border-radius:10px;padding:16px;border-left:4px solid #10b981;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><h4 style="margin:0;font-size:14px;">LMP Calculations</h4></div><div style="display:flex;justify-content:space-around;text-align:center;"><div><div style="font-size:28px;font-weight:700;color:#10b981;">${stats.lmpAnalyses.today}</div><div style="font-size:11px;color:var(--text-tertiary);">TODAY</div></div><div style="border-left:1px solid var(--border-color);padding-left:20px;"><div style="font-size:28px;font-weight:700;color:var(--text-secondary);">${stats.lmpAnalyses.total}</div><div style="font-size:11px;color:var(--text-tertiary);">ALL TIME</div></div></div></div>
        <div style="background:var(--bg-secondary);border-radius:10px;padding:16px;border-left:4px solid #f59e0b;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><h4 style="margin:0;font-size:14px;">LMP Exports</h4></div><div style="display:flex;justify-content:space-around;text-align:center;"><div><div style="font-size:28px;font-weight:700;color:#f59e0b;">${stats.lmpExports.today}</div><div style="font-size:11px;color:var(--text-tertiary);">TODAY</div></div><div style="border-left:1px solid var(--border-color);padding-left:20px;"><div style="font-size:28px;font-weight:700;color:var(--text-secondary);">${stats.lmpExports.total}</div><div style="font-size:11px;color:var(--text-tertiary);">ALL TIME</div></div></div></div>`;
}

// =====================================================
// EXPORTS
// =====================================================
function exportUsers() { downloadJSON(UserStore.exportForGitHub(), 'users.json'); }
function exportActivityLog() { downloadJSON(ActivityLog.exportForGitHub(), 'activity-log.json'); }
function exportLMPData() { downloadJSON(SecureEnergyData.exportForGitHub(), 'lmp-database.json'); }
function downloadJSON(content, filename) { const blob = new Blob([content], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }

function exportMyAnalysisRecords() {
    const isAdmin = currentUser?.role === 'admin';
    let analyses = ActivityLog.getAll().filter(a => a.widget === 'lmp-comparison');
    if (!isAdmin) analyses = analyses.filter(a => a.userId === currentUser?.id);
    if (analyses.length === 0) { showNotification('No records', 'warning'); return; }
    
    const headers = ['Date/Time', 'User', 'Client', 'ISO', 'Zone', 'Term', 'Fixed Rate', 'Index Cost', 'Fixed Cost', 'Savings'];
    const rows = analyses.map(a => {
        const d = a.data || {}, r = d.results || {};
        return [new Date(a.timestamp).toLocaleString(), a.userName || '', d.clientName || '', d.iso || '', d.zone || '', d.termMonths || '', d.fixedPrice || '', r.totalIndexCost || '', r.totalFixedCost || '', r.savingsVsFixed || ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n'), blob = new Blob([csv], { type: 'text/csv' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `analysis-history-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
    ActivityLog.logHistoryExport({ userId: currentUser?.id, userEmail: currentUser?.email, userName: currentUser ? `${currentUser.firstName} ${currentUser.lastName}` : null, recordCount: analyses.length });
    showNotification(`Exported ${analyses.length} records`, 'success');
}

// =====================================================
// AI ASSISTANT
// =====================================================
function initAIAssistantWidget() {
    const content = document.getElementById('aiAssistantContent');
    if (!content) return;
    content.innerHTML = `<div class="ai-assistant-container"><div class="ai-chat-messages" id="aiChatMessages">
        <div class="ai-welcome-message"><div class="ai-avatar"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg></div><div class="ai-welcome-text"><h3>AI Assistant</h3><p>Search users, navigate widgets, analyze data.</p></div></div>
        <div class="ai-suggestions"><span class="ai-suggestion" onclick="aiAssistantQuery('Show all users')">Show users</span><span class="ai-suggestion" onclick="aiAssistantQuery('LMP data status')">LMP data status</span></div>
    </div><div class="ai-input-container"><input type="text" class="ai-input" id="aiAssistantInput" placeholder="Ask me..." onkeypress="if(event.key==='Enter')sendAIQuery()"><button class="ai-send-btn" onclick="sendAIQuery()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div></div>`;
}

function aiAssistantQuery(q) { document.getElementById('aiAssistantInput').value = q; sendAIQuery(); }
function sendAIQuery() {
    const input = document.getElementById('aiAssistantInput'), msgs = document.getElementById('aiChatMessages'), query = input.value.trim();
    if (!query) return;
    msgs.innerHTML += `<div class="ai-message user-message"><div class="message-content">${escapeHtml(query)}</div></div>`;
    input.value = '';
    const response = processAIQuery(query);
    msgs.innerHTML += `<div class="ai-message ai-response"><div class="message-content">${response}</div></div>`;
    msgs.scrollTop = msgs.scrollHeight;
}

function processAIQuery(query) {
    const q = query.toLowerCase();
    if (q.includes('user')) { const users = UserStore.getAll(); return `<strong>${users.length} users:</strong><ul>${users.map(u => `<li>${u.firstName} ${u.lastName} - ${u.email}</li>`).join('')}</ul>`; }
    if (q.includes('lmp') || q.includes('data')) { const stats = SecureEnergyData.getStats(); return stats.totalRecords > 0 ? `<strong>LMP Data:</strong> ${stats.totalRecords.toLocaleString()} records, ${stats.isoCount} ISOs` : 'No LMP data loaded'; }
    if (q.includes('error')) { const stats = ErrorLog.getStats(); return `<strong>Errors:</strong> ${stats.total} total, ${stats.today} today, ${stats.unresolved} unresolved`; }
    return `Try: "show users", "LMP data status", "error stats"`;
}

const AISearch = { init() { const input = document.getElementById('aiSearchInput'); if (input) input.addEventListener('keypress', e => { if (e.key === 'Enter' && input.value.trim()) { document.getElementById('aiAssistantInput').value = input.value; sendAIQuery(); scrollToWidget('ai-assistant'); input.value = ''; } }); } };

// =====================================================
// ANALYSIS HISTORY
// =====================================================
let analysisHistoryFilters = { search: '', user: 'all', iso: 'all' };
function initAnalysisHistoryWidget() { if (document.getElementById('analysisHistoryContent')) renderAnalysisHistory(); }
function refreshAnalysisHistory() { renderAnalysisHistory(); showNotification('Refreshed', 'success'); }
function updateAnalysisFilter(type, value) { analysisHistoryFilters[type] = value; renderAnalysisHistory(); }

function renderAnalysisHistory() {
    const content = document.getElementById('analysisHistoryContent');
    if (!content) return;
    const isAdmin = currentUser?.role === 'admin';
    let all = ActivityLog.getAll().filter(a => a.widget === 'lmp-comparison');
    if (!isAdmin) all = all.filter(a => a.userId === currentUser?.id);
    
    let analyses = all.filter(a => {
        if (analysisHistoryFilters.search) { const s = analysisHistoryFilters.search.toLowerCase(); if (!(a.data?.clientName || a.clientName || '').toLowerCase().includes(s) && !(a.userName || '').toLowerCase().includes(s)) return false; }
        if (isAdmin && analysisHistoryFilters.user !== 'all' && a.userId !== analysisHistoryFilters.user) return false;
        if (analysisHistoryFilters.iso !== 'all' && a.data?.iso !== analysisHistoryFilters.iso) return false;
        return true;
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (all.length === 0) { content.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-tertiary);">No analyses yet</div>'; return; }
    
    const totalSavings = analyses.reduce((sum, a) => sum + (a.data?.results?.savingsVsFixed || 0), 0);
    const uniqueISOs = [...new Set(all.map(a => a.data?.iso).filter(Boolean))];
    
    content.innerHTML = `
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
            <input type="text" placeholder="Search..." value="${analysisHistoryFilters.search}" oninput="updateAnalysisFilter('search',this.value)" style="flex:1;min-width:200px;padding:8px 12px;border:1px solid var(--border-primary);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);">
            <select onchange="updateAnalysisFilter('iso',this.value)" style="padding:8px 12px;border:1px solid var(--border-primary);border-radius:6px;background:var(--bg-primary);color:var(--text-primary);"><option value="all">All ISOs</option>${uniqueISOs.map(iso => `<option value="${iso}" ${analysisHistoryFilters.iso === iso ? 'selected' : ''}>${iso}</option>`).join('')}</select>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px;background:var(--bg-secondary);border-radius:8px;margin-bottom:16px;">
            <div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:var(--accent-primary);">${analyses.length}</div><div style="font-size:11px;color:var(--text-tertiary);">ANALYSES</div></div>
            <div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:${totalSavings >= 0 ? '#10b981' : '#ef4444'};">${totalSavings >= 0 ? '+' : ''}$${Math.abs(totalSavings).toLocaleString(undefined, {maximumFractionDigits: 0})}</div><div style="font-size:11px;color:var(--text-tertiary);">TOTAL SAVINGS</div></div>
            <div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:var(--accent-secondary);">${analyses.length ? '$' + Math.abs(totalSavings / analyses.length).toLocaleString(undefined, {maximumFractionDigits: 0}) : '$0'}</div><div style="font-size:11px;color:var(--text-tertiary);">AVG SAVINGS</div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;max-height:350px;overflow-y:auto;">${analyses.map(a => renderAnalysisCard(a)).join('')}</div>`;
}

function renderAnalysisCard(a) {
    const d = a.data || {}, r = d.results || {}, savings = r.savingsVsFixed || 0, client = d.clientName || a.clientName || 'Unnamed';
    const time = new Date(a.timestamp), timeStr = new Date().toDateString() === time.toDateString() ? 'Today ' + time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : time.toLocaleDateString();
    const showData = encodeURIComponent(JSON.stringify({ ...a, clientName: client }));
    const reloadData = encodeURIComponent(JSON.stringify({ clientName: client, iso: d.iso, zone: d.zone, startDate: d.startDate, termMonths: d.termMonths, fixedPrice: d.fixedPrice, lmpAdjustment: d.lmpAdjustment || 0, usage: d.totalAnnualUsage || d.usage }));
    
    return `<div style="background:var(--bg-secondary);border-radius:10px;padding:16px;border-left:4px solid ${savings >= 0 ? '#10b981' : '#ef4444'};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <div><div style="font-weight:600;font-size:15px;">${client}</div><div style="font-size:12px;color:var(--text-tertiary);">${d.iso || 'N/A'} • ${d.zone || 'N/A'} • ${d.termMonths || 0}mo</div>${currentUser?.role === 'admin' && a.userName ? `<div style="font-size:11px;color:var(--accent-primary);margin-top:4px;">👤 ${a.userName}</div>` : ''}</div>
            <div style="text-align:right;"><div style="font-size:18px;font-weight:700;color:${savings >= 0 ? '#10b981' : '#ef4444'};">${savings >= 0 ? '+' : ''}$${Math.abs(savings).toLocaleString(undefined, {maximumFractionDigits: 0})}</div><div style="font-size:11px;color:var(--text-tertiary);">savings</div></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;"><div style="display:flex;gap:8px;">
            <button onclick="showAnalysisDetail('${showData}')" style="background:var(--accent-secondary);color:white;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">Show</button>
            <button onclick="reloadAnalysis('${reloadData}')" style="background:var(--accent-primary);color:white;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">Reload</button>
        </div><span style="font-size:11px;color:var(--text-tertiary);">${timeStr}</span></div>
    </div>`;
}

function showAnalysisDetail(encodedData) {
    try {
        const a = JSON.parse(decodeURIComponent(encodedData)), d = a.data || {}, r = d.results || {}, savings = r.savingsVsFixed || 0, client = a.clientName || d.clientName || 'Unnamed';
        const modal = document.getElementById('editUserModal'), content = document.getElementById('editUserContent');
        content.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--border-color);">
                <div><h2 style="margin:0;font-size:20px;">${client}</h2><p style="margin:4px 0 0;font-size:13px;color:var(--text-tertiary);">${new Date(a.timestamp).toLocaleString()}</p></div>
                <div style="text-align:right;"><div style="font-size:28px;font-weight:700;color:${savings >= 0 ? '#10b981' : '#ef4444'};">${savings >= 0 ? '+' : ''}$${Math.abs(savings).toLocaleString(undefined, {maximumFractionDigits: 0})}</div><div style="font-size:12px;color:var(--text-tertiary);">Savings</div></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                <div><h4 style="margin:0 0 12px;">Parameters</h4><div style="background:var(--bg-tertiary);padding:16px;border-radius:8px;font-size:13px;">
                    ${[['ISO', d.iso], ['Zone', d.zone], ['Start', d.startDate], ['Term', `${d.termMonths}mo`], ['Rate', `$${(d.fixedPrice || 0).toFixed(4)}`], ['LMP Adj', `${d.lmpAdjustment || 0}%`], ['Usage', `${(d.totalAnnualUsage || d.usage || 0).toLocaleString()} kWh`]].map(([l, v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);"><span style="color:var(--text-tertiary);">${l}:</span><span style="font-weight:500;">${v || 'N/A'}</span></div>`).join('')}
                </div></div>
                <div><h4 style="margin:0 0 12px;">Results</h4><div style="background:var(--bg-tertiary);padding:16px;border-radius:8px;font-size:13px;">
                    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);"><span style="color:var(--text-tertiary);">Index:</span><span style="font-weight:600;">$${(r.totalIndexCost || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</span></div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-color);"><span style="color:var(--text-tertiary);">Fixed:</span><span style="font-weight:600;">$${(r.totalFixedCost || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</span></div>
                    <div style="display:flex;justify-content:space-between;padding:10px 0 0;"><span style="color:var(--text-tertiary);">Savings:</span><span style="font-weight:700;font-size:16px;color:${savings >= 0 ? '#10b981' : '#ef4444'};">${savings >= 0 ? '+' : ''}$${Math.abs(savings).toLocaleString(undefined, {maximumFractionDigits: 0})}</span></div>
                </div></div>
            </div>
            <div style="margin-top:20px;display:flex;gap:12px;"><button onclick="closeEditModal()" style="flex:1;padding:12px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:8px;cursor:pointer;">Close</button></div>`;
        document.querySelector('#editUserModal .modal-title').textContent = 'Analysis Details';
        modal.classList.add('show');
    } catch (e) { showNotification('Failed to load details', 'error'); }
}

function reloadAnalysis(encodedData) {
    try {
        const data = JSON.parse(decodeURIComponent(encodedData));
        const lmpWidget = document.querySelector('[data-widget-id="lmp-comparison"] iframe');
        if (lmpWidget?.contentWindow) {
            lmpWidget.contentWindow.postMessage({ type: 'LOAD_ANALYSIS', data }, '*');
            scrollToWidget('lmp-comparison');
            showNotification('Loaded into calculator', 'success');
        } else { showNotification('Open LMP Comparison first', 'warning'); }
    } catch (e) { showNotification('Failed to reload', 'error'); }
}

// =====================================================
// UTILITIES
// =====================================================
function showNotification(message, type = 'info') { const n = document.getElementById('notification'); n.textContent = message; n.className = 'notification show ' + type; setTimeout(() => n.classList.remove('show'), 3000); }
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function scrollToWidget(id) { const w = document.querySelector(`[data-widget-id="${id}"]`); if (w) { w.scrollIntoView({ behavior: 'smooth' }); w.style.boxShadow = '0 0 20px var(--se-light-green)'; setTimeout(() => w.style.boxShadow = '', 2000); } }

function updateDataStatus() {
    const stats = SecureEnergyData.getStats();
    document.getElementById('dataRecordCount').textContent = stats.totalRecords?.toLocaleString() || '0';
    document.getElementById('dataISOCount').textContent = stats.isoCount || '0';
    const indicator = document.getElementById('dataStatusIndicator'), title = document.getElementById('dataStatusTitle'), desc = document.getElementById('dataStatusDesc');
    if (stats.totalRecords > 0) { indicator.style.background = 'var(--accent-success)'; title.textContent = 'Data Loaded'; desc.textContent = stats.isos?.join(', ') || `${stats.totalRecords} records`; }
    else { indicator.style.background = 'var(--accent-warning)'; title.textContent = 'No Data'; desc.textContent = 'Use Data Manager to load'; }
}

function handleWidgetMessage(event) {
    if (event.data?.type === 'LMP_DATA_UPDATE' || event.data?.type === 'LMP_BULK_UPDATE') { updateDataStatus(); showNotification('Data updated!', 'success'); }
    if (event.data?.type === 'LMP_ANALYSIS_COMPLETE' && currentUser) {
        const d = event.data.data || {};
        ActivityLog.logLMPAnalysis({ userId: currentUser.id, userEmail: currentUser.email, userName: `${currentUser.firstName} ${currentUser.lastName}`, clientName: d.clientName, ...d });
        if (document.getElementById('analysisHistoryContent')) renderAnalysisHistory();
        showNotification(`Analysis logged: ${d.clientName || 'Unnamed'}`, 'success');
    }
    if (event.data?.type === 'LMP_EXPORT_COMPLETE' && currentUser) {
        ActivityLog.logLMPExport({ userId: currentUser.id, userEmail: currentUser.email, userName: `${currentUser.firstName} ${currentUser.lastName}`, ...event.data.data });
    }
    if (event.data?.type === 'WIDGET_ERROR') {
        ErrorLog.log({ type: event.data.errorType || 'widget', widget: event.data.widget || 'unknown', message: event.data.message, source: event.data.source, line: event.data.line, stack: event.data.stack, context: event.data.context });
    }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEditModal(); });
document.getElementById('editUserModal')?.addEventListener('click', function(e) { if (e.target === this) closeEditModal(); });

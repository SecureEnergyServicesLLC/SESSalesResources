/**
 * Secure Energy Analytics Portal - Main Controller
 * Handles authentication, widget management, and UI interactions
 */

// Current user reference
let currentUser = null;

// Widget definitions
const WIDGETS = [
    {
        id: 'user-admin',
        name: 'User Administration',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        adminOnly: true,
        fullWidth: true,
        embedded: true
    },
    {
        id: 'ai-assistant',
        name: 'AI Assistant',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
        fullWidth: true,
        embedded: true,
        height: 500
    },
    {
        id: 'data-manager',
        name: 'LMP Data Manager',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
        src: 'widgets/lmp-data-manager.html',
        height: 500
    },
    {
        id: 'arcadia-fetcher',
        name: 'Arcadia LMP Data Fetcher',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
        src: 'widgets/arcadia-lmp-fetcher.html',
        height: 500
    },
    {
        id: 'lmp-comparison',
        name: 'LMP Comparison Portal',
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        src: 'widgets/lmp-comparison-portal.html',
        fullWidth: true,
        height: 700
    }
];

// =====================================================
// INITIALIZATION
// =====================================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[Portal] Initializing...');
    
    // Initialize stores
    await UserStore.init();
    await ActivityLog.init();
    await SecureEnergyData.init();
    
    // Check authentication
    initAuth();
    
    // Initialize AI Search
    AISearch.init();
    
    // Initialize Weather & Clock
    initWeather();
    initClock();
    
    // Subscribe to data updates
    SecureEnergyData.subscribe(updateDataStatus);
    updateDataStatus();
    
    // Listen for widget messages
    window.addEventListener('message', handleWidgetMessage);
    
    console.log('[Portal] Initialization complete');
});

// =====================================================
// WEATHER WIDGET
// =====================================================
async function initWeather() {
    const tempEl = document.getElementById('weatherTemp');
    const locEl = document.getElementById('weatherLocation');
    const iconEl = document.querySelector('.weather-icon');
    
    if (!tempEl || !locEl) return;
    
    try {
        // Get user's location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    await fetchWeather(latitude, longitude);
                },
                async () => {
                    // Default to New York if location denied
                    await fetchWeather(40.7128, -74.0060);
                }
            );
        } else {
            await fetchWeather(40.7128, -74.0060);
        }
    } catch (e) {
        console.warn('[Weather] Failed to load:', e);
        locEl.textContent = 'Weather unavailable';
    }
}

async function fetchWeather(lat, lon) {
    const tempEl = document.getElementById('weatherTemp');
    const locEl = document.getElementById('weatherLocation');
    
    try {
        // Use Open-Meteo API (free, no key required)
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`;
        const response = await fetch(weatherUrl);
        const data = await response.json();
        
        if (data.current) {
            const temp = Math.round(data.current.temperature_2m);
            tempEl.textContent = `${temp}°F`;
            
            // Get location name using reverse geocoding
            const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
            try {
                const geoResponse = await fetch(geoUrl);
                const geoData = await geoResponse.json();
                const city = geoData.address?.city || geoData.address?.town || geoData.address?.village || 'Unknown';
                locEl.textContent = city;
            } catch {
                locEl.textContent = 'Current Location';
            }
            
            // Update weather icon based on code
            updateWeatherIcon(data.current.weather_code);
        }
    } catch (e) {
        console.warn('[Weather] API error:', e);
        tempEl.textContent = '--°F';
        locEl.textContent = 'Unavailable';
    }
}

function updateWeatherIcon(code) {
    const iconEl = document.querySelector('.weather-icon');
    if (!iconEl) return;
    
    // Weather codes: 0=clear, 1-3=partly cloudy, 45-48=fog, 51-67=rain, 71-77=snow, 80-82=showers, 95-99=thunderstorm
    let iconSvg;
    
    if (code === 0) {
        // Clear/Sunny
        iconSvg = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    } else if (code >= 1 && code <= 3) {
        // Partly cloudy
        iconSvg = '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>';
    } else if (code >= 51 && code <= 67 || code >= 80 && code <= 82) {
        // Rain
        iconSvg = '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M8 19v2"/><path d="M12 19v2"/><path d="M16 19v2"/>';
    } else if (code >= 71 && code <= 77) {
        // Snow
        iconSvg = '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M8 21h.01"/><path d="M12 21h.01"/><path d="M16 21h.01"/>';
    } else if (code >= 95) {
        // Thunderstorm
        iconSvg = '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M13 11l-4 6h5l-2 4"/>';
    } else {
        // Default cloudy
        iconSvg = '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>';
    }
    
    iconEl.innerHTML = iconSvg;
}

// =====================================================
// CLOCK WIDGET
// =====================================================
function initClock() {
    updateClock();
    setInterval(updateClock, 1000);
}

function updateClock() {
    const timeEl = document.getElementById('clockTime');
    const dateEl = document.getElementById('clockDate');
    
    if (!timeEl || !dateEl) return;
    
    const now = new Date();
    
    // Format time: HH:MM:SS AM/PM
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    timeEl.textContent = `${displayHours}:${minutes}:${seconds} ${ampm}`;
    
    // Format date: Mon, Jan 1
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    dateEl.textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`; 
}

// =====================================================
// AUTHENTICATION
// =====================================================
function initAuth() {
    currentUser = UserStore.getCurrentUser();
    
    if (currentUser) {
        showPortal(currentUser);
    } else {
        showLogin();
    }
    
    // Show first-time note if only default admin exists
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
    
    // Update user display
    document.getElementById('userName').textContent = `${user.firstName} ${user.lastName}`;
    document.getElementById('userAvatar').textContent = user.firstName.charAt(0) + user.lastName.charAt(0);
    document.getElementById('userRole').textContent = user.role === 'admin' ? 'Administrator' : 'User';
    document.getElementById('userRole').className = 'user-role ' + (user.role === 'admin' ? 'admin' : '');
    
    // Render widgets
    renderWidgets(user);
}

function applyWidgetPermissions(user) {
    document.querySelectorAll('[data-widget-id]').forEach(widget => {
        const widgetId = widget.dataset.widgetId;
        const isAdminOnly = widget.dataset.adminOnly === 'true';
        
        if (isAdminOnly && user.role !== 'admin') {
            widget.classList.add('hidden');
            return;
        }
        
        if (user.permissions && user.permissions[widgetId] === false) {
            widget.classList.add('hidden');
        } else {
            widget.classList.remove('hidden');
        }
    });
}

// Login form handler
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    
    const result = UserStore.authenticate(email, password);
    
    if (result.success) {
        currentUser = result.user;
        UserStore.setCurrentUser(result.user);
        showPortal(result.user);
        showNotification('Welcome back, ' + result.user.firstName + '!', 'success');
        
        ActivityLog.log({
            userId: result.user.id,
            userEmail: result.user.email,
            userName: `${result.user.firstName} ${result.user.lastName}`,
            widget: 'portal',
            action: 'Login'
        });
    } else {
        errorEl.textContent = result.error;
        errorEl.classList.add('show');
    }
});

// Logout handler
document.getElementById('logoutBtn').addEventListener('click', function() {
    if (currentUser) {
        ActivityLog.log({
            userId: currentUser.id,
            userEmail: currentUser.email,
            userName: `${currentUser.firstName} ${currentUser.lastName}`,
            widget: 'portal',
            action: 'Logout'
        });
    }
    
    UserStore.clearSession();
    currentUser = null;
    showLogin();
    showNotification('Logged out successfully', 'info');
    
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').classList.remove('show');
});

// =====================================================
// WIDGET RENDERING
// =====================================================
function renderWidgets(user) {
    const container = document.getElementById('widgetsGrid');
    container.innerHTML = '';
    
    WIDGETS.forEach(widget => {
        // Check permissions
        if (widget.adminOnly && user.role !== 'admin') return;
        if (user.permissions && user.permissions[widget.id] === false) return;
        
        const widgetEl = createWidgetElement(widget);
        container.appendChild(widgetEl);
    });
    
    // Initialize admin widget if visible
    if (user.role === 'admin') {
        initAdminWidget();
    }
    
    // Initialize AI Assistant widget
    initAIAssistantWidget();
}

function createWidgetElement(widget) {
    const div = document.createElement('div');
    div.className = 'widget' + (widget.fullWidth ? ' widget-full' : '');
    div.dataset.widgetId = widget.id;
    if (widget.adminOnly) div.dataset.adminOnly = 'true';
    
    const popoutBtn = `
        <button class="widget-action-btn" title="Pop Out" onclick="popoutWidget('${widget.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
        </button>
    `;
    
    if (widget.embedded && widget.id === 'user-admin') {
        // User admin widget
        div.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">
                    ${widget.icon}
                    <span>${widget.name}</span>
                    ${widget.adminOnly ? '<span class="widget-badge">ADMIN</span>' : ''}
                </div>
            </div>
            <div class="widget-content admin-widget-content" id="adminWidgetContent" style="height: 650px;"></div>
        `;
    } else if (widget.embedded && widget.id === 'ai-assistant') {
        // AI Assistant widget
        div.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">
                    ${widget.icon}
                    <span>${widget.name}</span>
                    <span class="widget-badge" style="background: var(--accent-info);">BETA</span>
                </div>
            </div>
            <div class="widget-content ai-assistant-content" id="aiAssistantContent" style="height: ${widget.height || 500}px;"></div>
        `;
    } else {
        // Standard iframe widget
        div.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">
                    ${widget.icon}
                    <span>${widget.name}</span>
                </div>
                <div class="widget-actions">${popoutBtn}</div>
            </div>
            <div class="widget-content" style="height: ${widget.height || 500}px;">
                <iframe class="widget-iframe" src="${widget.src}" title="${widget.name}"></iframe>
            </div>
        `;
    }
    
    return div;
}

function popoutWidget(widgetId) {
    const widget = WIDGETS.find(w => w.id === widgetId);
    if (widget && widget.src) {
        window.open(widget.src, widgetId, 'width=1200,height=800,resizable=yes,scrollbars=yes');
    }
}

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
            <button class="admin-tab" data-tab="permissions">Permissions</button>
            <button class="admin-tab" data-tab="export">Export Data</button>
        </div>
        
        <div class="admin-panel active" id="panel-create">${getCreateUserPanel()}</div>
        <div class="admin-panel" id="panel-manage">${getManageUsersPanel()}</div>
        <div class="admin-panel" id="panel-activity">${getActivityLogPanel()}</div>
        <div class="admin-panel" id="panel-permissions">${getPermissionsPanel()}</div>
        <div class="admin-panel" id="panel-export">${getExportPanel()}</div>
    `;
    
    // Add tab click handlers
    content.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            
            content.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            content.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById('panel-' + tabId).classList.add('active');
            
            if (tabId === 'manage') renderUsersTable();
            if (tabId === 'activity') renderActivityLog();
        });
    });
    
    // Role change handler
    const roleSelect = document.getElementById('newRole');
    if (roleSelect) {
        roleSelect.addEventListener('change', function() {
            const isAdmin = this.value === 'admin';
            document.getElementById('perm-lmp-comparison').checked = true;
            document.getElementById('perm-data-manager').checked = isAdmin;
            document.getElementById('perm-arcadia-fetcher').checked = isAdmin;
        });
    }
}

function getCreateUserPanel() {
    return `
        <div class="create-user-form">
            <h3 style="margin-bottom: 20px; font-size: 16px;">Create New User</h3>
            <div class="form-row">
                <div class="form-group">
                    <label>First Name *</label>
                    <input type="text" id="newFirstName" placeholder="Enter first name">
                </div>
                <div class="form-group">
                    <label>Last Name *</label>
                    <input type="text" id="newLastName" placeholder="Enter last name">
                </div>
            </div>
            <div class="form-row single">
                <div class="form-group">
                    <label>Email Address *</label>
                    <input type="email" id="newEmail" placeholder="Enter email address">
                </div>
            </div>
            <div class="form-row single">
                <div class="form-group">
                    <label>Password *</label>
                    <input type="password" id="newPassword" placeholder="Enter password">
                </div>
            </div>
            <div class="form-row single">
                <div class="form-group">
                    <label>User Role</label>
                    <select id="newRole">
                        <option value="user">Standard User</option>
                        <option value="admin">Administrator</option>
                    </select>
                </div>
            </div>
            <div class="widget-permissions">
                <h4>Widget Access Permissions</h4>
                <div class="widget-permission-item">
                    <span>LMP Comparison Portal</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="perm-lmp-comparison" checked>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="widget-permission-item">
                    <span>LMP Data Manager</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="perm-data-manager">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="widget-permission-item">
                    <span>Arcadia LMP Fetcher</span>
                    <label class="toggle-switch">
                        <input type="checkbox" id="perm-arcadia-fetcher">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <button class="btn-primary" onclick="createUser()" style="margin-top: 20px;">Create User Account</button>
        </div>
    `;
}

function getManageUsersPanel() {
    return `
        <div style="overflow-x: auto;">
            <table class="users-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="usersTableBody"></tbody>
            </table>
        </div>
    `;
}

function getActivityLogPanel() {
    return `
        <div class="activity-filters">
            <input type="text" id="activitySearch" placeholder="Search by client or user..." oninput="renderActivityLog()">
            <select id="activityWidgetFilter" onchange="renderActivityLog()">
                <option value="">All Widgets</option>
                <option value="lmp-comparison">LMP Comparison</option>
                <option value="portal">Portal</option>
            </select>
        </div>
        <div id="activityLogContainer"></div>
    `;
}

function getPermissionsPanel() {
    return `
        <div style="max-width: 800px;">
            <h3 style="margin-bottom: 20px; font-size: 16px;">Default Widget Permissions by Role</h3>
            <table class="users-table">
                <thead>
                    <tr><th>Widget</th><th>Admin Default</th><th>User Default</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td>LMP Comparison Portal</td>
                        <td><span class="status-badge active">Visible</span></td>
                        <td><span class="status-badge active">Visible</span></td>
                    </tr>
                    <tr>
                        <td>LMP Data Manager</td>
                        <td><span class="status-badge active">Visible</span></td>
                        <td><span class="status-badge inactive">Hidden</span></td>
                    </tr>
                    <tr>
                        <td>Arcadia LMP Fetcher</td>
                        <td><span class="status-badge active">Visible</span></td>
                        <td><span class="status-badge inactive">Hidden</span></td>
                    </tr>
                    <tr>
                        <td>User Administration</td>
                        <td><span class="status-badge active">Visible</span></td>
                        <td><span class="status-badge inactive">Hidden</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

function getExportPanel() {
    return `
        <div style="max-width: 800px;">
            <h3 style="margin-bottom: 20px; font-size: 16px;">Export Data for GitHub</h3>
            <p style="margin-bottom: 20px; color: var(--text-secondary); font-size: 14px;">
                Export data as JSON files to update your GitHub repository. After downloading, 
                commit these files to your <code>data/</code> folder to persist changes for all users.
            </p>
            
            <div class="export-section">
                <h4>User Database</h4>
                <p style="font-size: 13px; color: var(--text-tertiary); margin-bottom: 12px;">
                    Save as <code>data/users.json</code>
                </p>
                <button class="export-btn" onclick="exportUsers()">Download users.json</button>
            </div>
            
            <div class="export-section">
                <h4>Activity Log</h4>
                <p style="font-size: 13px; color: var(--text-tertiary); margin-bottom: 12px;">
                    Save as <code>data/activity-log.json</code>
                </p>
                <button class="export-btn" onclick="exportActivityLog()">Download activity-log.json</button>
            </div>
            
            <div class="export-section">
                <h4>LMP Data</h4>
                <p style="font-size: 13px; color: var(--text-tertiary); margin-bottom: 12px;">
                    Save as <code>data/lmp-database.json</code>
                </p>
                <button class="export-btn" onclick="exportLMPData()">Download lmp-database.json</button>
            </div>
        </div>
    `;
}

// =====================================================
// USER MANAGEMENT FUNCTIONS
// =====================================================
function createUser() {
    const firstName = document.getElementById('newFirstName').value.trim();
    const lastName = document.getElementById('newLastName').value.trim();
    const email = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    
    if (!firstName || !lastName || !email || !password) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    const permissions = {
        'lmp-comparison': document.getElementById('perm-lmp-comparison').checked,
        'data-manager': document.getElementById('perm-data-manager').checked,
        'arcadia-fetcher': document.getElementById('perm-arcadia-fetcher').checked,
        'user-admin': role === 'admin'
    };
    
    try {
        const newUser = UserStore.create({ firstName, lastName, email, password, role, permissions });
        showNotification('User created successfully!', 'success');
        
        ActivityLog.log({
            userId: currentUser.id,
            userEmail: currentUser.email,
            userName: `${currentUser.firstName} ${currentUser.lastName}`,
            widget: 'user-admin',
            action: 'Create User',
            data: { newUserId: newUser.id, newUserEmail: email }
        });
        
        // Clear form
        document.getElementById('newFirstName').value = '';
        document.getElementById('newLastName').value = '';
        document.getElementById('newEmail').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('newRole').value = 'user';
        document.getElementById('perm-lmp-comparison').checked = true;
        document.getElementById('perm-data-manager').checked = false;
        document.getElementById('perm-arcadia-fetcher').checked = false;
        
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    const users = UserStore.getAll();
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.firstName} ${user.lastName}</td>
            <td>${user.email}</td>
            <td><span class="role-badge ${user.role}">${user.role}</span></td>
            <td><span class="status-badge ${user.status}">${user.status}</span></td>
            <td>${new Date(user.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="table-btn" onclick="editUser('${user.id}')">Edit</button>
                ${user.id !== 'admin-001' ? `<button class="table-btn danger" onclick="deleteUser('${user.id}')">Delete</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function editUser(userId) {
    const user = UserStore.findById(userId);
    if (!user) return;
    
    const modal = document.getElementById('editUserModal');
    const content = document.getElementById('editUserContent');
    
    content.innerHTML = `
        <input type="hidden" id="editUserId" value="${userId}">
        <div class="form-group" style="margin-bottom: 16px;">
            <label>First Name</label>
            <input type="text" id="editFirstName" value="${user.firstName}">
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
            <label>Last Name</label>
            <input type="text" id="editLastName" value="${user.lastName}">
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
            <label>Email</label>
            <input type="email" id="editEmail" value="${user.email}" ${userId === 'admin-001' ? 'disabled' : ''}>
        </div>
        <div class="form-group" style="margin-bottom: 16px;">
            <label>Role</label>
            <select id="editRole" ${userId === 'admin-001' ? 'disabled' : ''}>
                <option value="user" ${user.role === 'user' ? 'selected' : ''}>Standard User</option>
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option>
            </select>
        </div>
        <div class="widget-permissions">
            <h4>Widget Permissions</h4>
            <div class="widget-permission-item">
                <span>LMP Comparison Portal</span>
                <label class="toggle-switch">
                    <input type="checkbox" id="edit-perm-lmp-comparison" ${user.permissions?.['lmp-comparison'] !== false ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="widget-permission-item">
                <span>LMP Data Manager</span>
                <label class="toggle-switch">
                    <input type="checkbox" id="edit-perm-data-manager" ${user.permissions?.['data-manager'] ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
            <div class="widget-permission-item">
                <span>Arcadia LMP Fetcher</span>
                <label class="toggle-switch">
                    <input type="checkbox" id="edit-perm-arcadia-fetcher" ${user.permissions?.['arcadia-fetcher'] ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
        <button class="btn-primary" onclick="saveUserEdit()" style="width: 100%; margin-top: 20px;">Save Changes</button>
    `;
    
    modal.classList.add('show');
}

function saveUserEdit() {
    const userId = document.getElementById('editUserId').value;
    const updates = {
        firstName: document.getElementById('editFirstName').value.trim(),
        lastName: document.getElementById('editLastName').value.trim(),
        email: document.getElementById('editEmail').value.trim(),
        role: document.getElementById('editRole').value,
        permissions: {
            'lmp-comparison': document.getElementById('edit-perm-lmp-comparison').checked,
            'data-manager': document.getElementById('edit-perm-data-manager').checked,
            'arcadia-fetcher': document.getElementById('edit-perm-arcadia-fetcher').checked,
            'user-admin': document.getElementById('editRole').value === 'admin'
        }
    };
    
    try {
        UserStore.update(userId, updates);
        showNotification('User updated successfully!', 'success');
        closeEditModal();
        renderUsersTable();
        
        // Refresh if editing current user
        if (currentUser && currentUser.id === userId) {
            const updatedUser = UserStore.findById(userId);
            UserStore.setCurrentUser(updatedUser);
            currentUser = updatedUser;
            renderWidgets(updatedUser);
        }
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
        UserStore.delete(userId);
        showNotification('User deleted successfully', 'success');
        renderUsersTable();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function closeEditModal() {
    document.getElementById('editUserModal').classList.remove('show');
}

// =====================================================
// ACTIVITY LOG
// =====================================================
function renderActivityLog() {
    const container = document.getElementById('activityLogContainer');
    if (!container) return;
    
    const searchTerm = document.getElementById('activitySearch')?.value.toLowerCase() || '';
    const widgetFilter = document.getElementById('activityWidgetFilter')?.value || '';
    
    let activities = ActivityLog.getRecent(100);
    
    if (searchTerm) {
        activities = activities.filter(a => 
            a.clientName?.toLowerCase().includes(searchTerm) ||
            a.userName?.toLowerCase().includes(searchTerm) ||
            a.userEmail?.toLowerCase().includes(searchTerm)
        );
    }
    
    if (widgetFilter) {
        activities = activities.filter(a => a.widget === widgetFilter);
    }
    
    if (activities.length === 0) {
        container.innerHTML = '<p style="color: var(--text-tertiary); text-align: center; padding: 40px;">No activities found</p>';
        return;
    }
    
    container.innerHTML = activities.map(a => `
        <div class="activity-card">
            <div class="activity-card-header">
                <span class="activity-card-title">${a.action}</span>
                <span class="activity-card-time">${new Date(a.timestamp).toLocaleString()}</span>
            </div>
            <div class="activity-card-meta">
                <span>User: ${a.userName || 'Unknown'}</span>
                <span>Widget: ${a.widget}</span>
                ${a.clientName ? `<span>Client: ${a.clientName}</span>` : ''}
            </div>
        </div>
    `).join('');
}

// =====================================================
// EXPORT FUNCTIONS
// =====================================================
function exportUsers() {
    downloadJSON(UserStore.exportForGitHub(), 'users.json');
    showNotification('Users exported! Save to data/users.json', 'success');
}

function exportActivityLog() {
    downloadJSON(ActivityLog.exportForGitHub(), 'activity-log.json');
    showNotification('Activity log exported! Save to data/activity-log.json', 'success');
}

function exportLMPData() {
    downloadJSON(SecureEnergyData.exportForGitHub(), 'lmp-database.json');
    showNotification('LMP data exported! Save to data/lmp-database.json', 'success');
}

function downloadJSON(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// =====================================================
// AI ASSISTANT WIDGET
// =====================================================
function initAIAssistantWidget() {
    const content = document.getElementById('aiAssistantContent');
    if (!content) return;
    
    content.innerHTML = `
        <div class="ai-assistant-container">
            <div class="ai-chat-messages" id="aiChatMessages">
                <div class="ai-welcome-message">
                    <div class="ai-avatar">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                            <line x1="12" y1="19" x2="12" y2="22"/>
                        </svg>
                    </div>
                    <div class="ai-welcome-text">
                        <h3>Welcome to AI Assistant</h3>
                        <p>I can help you search users, navigate widgets, analyze LMP data, and more. Try asking me something!</p>
                    </div>
                </div>
                <div class="ai-suggestions">
                    <span class="ai-suggestion" onclick="aiAssistantQuery('Show me all users')">Show me all users</span>
                    <span class="ai-suggestion" onclick="aiAssistantQuery('What LMP data is loaded?')">What LMP data is loaded?</span>
                    <span class="ai-suggestion" onclick="aiAssistantQuery('Navigate to LMP Comparison')">Navigate to LMP Comparison</span>
                    <span class="ai-suggestion" onclick="aiAssistantQuery('Show recent activity')">Show recent activity</span>
                </div>
            </div>
            <div class="ai-input-container">
                <input type="text" class="ai-input" id="aiAssistantInput" placeholder="Ask me anything... (search users, navigate widgets, analyze data)" onkeypress="if(event.key==='Enter')sendAIQuery()">
                <button class="ai-send-btn" onclick="sendAIQuery()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function aiAssistantQuery(query) {
    document.getElementById('aiAssistantInput').value = query;
    sendAIQuery();
}

function sendAIQuery() {
    const input = document.getElementById('aiAssistantInput');
    const messagesContainer = document.getElementById('aiChatMessages');
    const query = input.value.trim();
    
    if (!query) return;
    
    // Add user message
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-message user-message';
    userMsg.innerHTML = `<div class="message-content">${escapeHtml(query)}</div>`;
    messagesContainer.appendChild(userMsg);
    
    // Clear input
    input.value = '';
    
    // Process query and generate response
    const response = processAIQuery(query);
    
    // Add AI response
    const aiMsg = document.createElement('div');
    aiMsg.className = 'ai-message ai-response';
    aiMsg.innerHTML = `
        <div class="ai-avatar-small">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
        </div>
        <div class="message-content">${response}</div>
    `;
    messagesContainer.appendChild(aiMsg);
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function processAIQuery(query) {
    const q = query.toLowerCase();
    
    // User-related queries
    if (q.includes('user') || q.includes('admin') || q.includes('account')) {
        if (q.includes('all') || q.includes('list') || q.includes('show')) {
            const users = UserStore.getAll();
            let html = `<strong>Found ${users.length} users:</strong><ul class="ai-result-list">`;
            users.forEach(u => {
                html += `<li><span class="ai-user-name">${u.firstName} ${u.lastName}</span> - ${u.email} <span class="ai-badge ${u.role}">${u.role}</span></li>`;
            });
            html += '</ul>';
            return html;
        }
        if (q.includes('create') || q.includes('add') || q.includes('new')) {
            return `To create a new user, go to the <a href="#" onclick="scrollToWidget('user-admin')">User Administration</a> widget and use the "Create User" tab.`;
        }
    }
    
    // LMP Data queries
    if (q.includes('lmp') || q.includes('data') || q.includes('record')) {
        const stats = SecureEnergyData.getStats();
        if (q.includes('loaded') || q.includes('status') || q.includes('what')) {
            if (stats.totalRecords > 0) {
                return `<strong>LMP Data Status:</strong><ul class="ai-result-list">
                    <li>Total Records: <strong>${stats.totalRecords.toLocaleString()}</strong></li>
                    <li>ISOs: <strong>${stats.isoCount}</strong></li>
                    <li>Years: <strong>${stats.yearRange?.join(', ') || 'N/A'}</strong></li>
                    <li>Last Updated: <strong>${stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleString() : 'N/A'}</strong></li>
                </ul>`;
            } else {
                return `No LMP data is currently loaded. Use the <a href="#" onclick="scrollToWidget('data-manager')">LMP Data Manager</a> to upload data.`;
            }
        }
        if (q.includes('iso') || q.includes('zone')) {
            const isos = SecureEnergyData.getISOs();
            if (isos.length > 0) {
                return `<strong>Available ISOs:</strong> ${isos.join(', ')}`;
            }
            return `No ISO data available. Please load LMP data first.`;
        }
    }
    
    // Navigation queries
    if (q.includes('navigate') || q.includes('go to') || q.includes('open') || q.includes('show me')) {
        const widgetNames = {
            'user': 'user-admin',
            'admin': 'user-admin',
            'data manager': 'data-manager',
            'manager': 'data-manager',
            'arcadia': 'arcadia-fetcher',
            'fetcher': 'arcadia-fetcher',
            'comparison': 'lmp-comparison',
            'lmp comparison': 'lmp-comparison',
            'portal': 'lmp-comparison'
        };
        
        for (const [key, widgetId] of Object.entries(widgetNames)) {
            if (q.includes(key)) {
                scrollToWidget(widgetId);
                const widget = WIDGETS.find(w => w.id === widgetId);
                return `Navigating to <strong>${widget?.name || widgetId}</strong>...`;
            }
        }
    }
    
    // Activity queries
    if (q.includes('activity') || q.includes('log') || q.includes('recent')) {
        const activities = ActivityLog.getRecent(5);
        if (activities.length > 0) {
            let html = `<strong>Recent Activity:</strong><ul class="ai-result-list">`;
            activities.forEach(a => {
                html += `<li><strong>${a.action}</strong> by ${a.userName || 'Unknown'} - ${new Date(a.timestamp).toLocaleString()}</li>`;
            });
            html += '</ul>';
            if (currentUser?.role === 'admin') {
                html += `<p><a href="#" onclick="scrollToWidget('user-admin');document.querySelector('[data-tab=activity]')?.click()">View full activity log →</a></p>`;
            }
            return html;
        }
        return `No recent activity found.`;
    }
    
    // Help queries
    if (q.includes('help') || q.includes('what can you') || q.includes('how')) {
        return `<strong>I can help you with:</strong>
        <ul class="ai-result-list">
            <li><strong>Users:</strong> "Show all users", "Create new user"</li>
            <li><strong>Data:</strong> "What LMP data is loaded?", "Show ISOs"</li>
            <li><strong>Navigation:</strong> "Go to LMP Comparison", "Open Data Manager"</li>
            <li><strong>Activity:</strong> "Show recent activity"</li>
        </ul>
        <p>In the future, I'll be able to help analyze data and generate reports!</p>`;
    }
    
    // Default response
    return `I'm not sure how to help with that yet. Try asking about:
    <ul class="ai-result-list">
        <li>Users (list, create)</li>
        <li>LMP data status</li>
        <li>Navigation to widgets</li>
        <li>Recent activity</li>
    </ul>
    Type <strong>"help"</strong> for more options.`;
}

function scrollToWidget(widgetId) {
    const widget = document.querySelector(`[data-widget-id="${widgetId}"]`);
    if (widget) {
        widget.scrollIntoView({ behavior: 'smooth', block: 'start' });
        widget.style.boxShadow = '0 0 20px var(--se-light-green)';
        setTimeout(() => widget.style.boxShadow = '', 2000);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Legacy AI Search (for top bar - simplified)
const AISearch = {
    init() {
        // AI Search moved to widget - this is kept for compatibility
        const input = document.getElementById('aiSearchInput');
        if (!input) return;
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = input.value.trim();
                if (query) {
                    // Focus on AI Assistant widget and send query there
                    const aiInput = document.getElementById('aiAssistantInput');
                    if (aiInput) {
                        aiInput.value = query;
                        sendAIQuery();
                        scrollToWidget('ai-assistant');
                    }
                    input.value = '';
                }
            }
        });
    }
};

// =====================================================
// UTILITIES
// =====================================================
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = 'notification show ' + type;
    setTimeout(() => notification.classList.remove('show'), 3000);
}

function updateDataStatus() {
    const stats = SecureEnergyData.getStats();
    
    document.getElementById('dataRecordCount').textContent = stats.totalRecords?.toLocaleString() || '0';
    document.getElementById('dataISOCount').textContent = stats.isoCount || '0';
    
    const indicator = document.getElementById('dataStatusIndicator');
    const title = document.getElementById('dataStatusTitle');
    const desc = document.getElementById('dataStatusDesc');
    
    if (stats.totalRecords > 0) {
        indicator.style.background = 'var(--accent-success)';
        title.textContent = 'Data Loaded';
        desc.textContent = `${stats.totalRecords.toLocaleString()} records from ${stats.isoCount} ISOs`;
    } else {
        indicator.style.background = 'var(--accent-warning)';
        title.textContent = 'No Data Loaded';
        desc.textContent = 'Use the Data Manager to load LMP data';
    }
}

function handleWidgetMessage(event) {
    if (event.data?.type === 'LMP_DATA_UPDATE' || event.data?.type === 'LMP_BULK_UPDATE') {
        updateDataStatus();
        showNotification('Data updated!', 'success');
    }
    
    if (event.data?.type === 'LMP_ANALYSIS_COMPLETE' && currentUser) {
        ActivityLog.logLMPAnalysis({
            userId: currentUser.id,
            userEmail: currentUser.email,
            userName: `${currentUser.firstName} ${currentUser.lastName}`,
            ...event.data.data
        });
    }
}

// Close modal on escape
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeEditModal();
});

// Close modal on overlay click
document.getElementById('editUserModal')?.addEventListener('click', function(e) {
    if (e.target === this) closeEditModal();
});

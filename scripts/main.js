/**
 * Secure Energy Analytics Portal - Main Controller v2.5
 * 
 * v2.5 Updates:
 * - Added Client Administration widget (2x2 size, admin only)
 * - Added Client Lookup widget (compact, all users)
 * - Portal-wide active client context
 * - All widgets now integrate with client selection
 * - Analyses and bids link to selected client
 * 
 * v2.4 Updates:
 * - Added Bid Management System widget
 * - Client store integration (unique Client IDs across widgets)
 * - Supplier profile management
 * - Bid processing and Excel bid sheet generation
 * 
 * v2.3 Updates:
 * - Draggable widgets with reorder persistence
 * - Resizable widgets (height adjustment, full-width toggle)
 * - Collapsible widgets
 * - Widget layout persistence per user
 * - Enhanced UX with smooth animations
 */

let currentUser = null;

const DEFAULT_WIDGETS = [
    { id: 'user-admin', name: 'User Administration', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', adminOnly: true, fullWidth: true, embedded: true, defaultHeight: 700, minHeight: 400, maxHeight: 1200, doubleHeight: true },
    { id: 'client-admin', name: 'Client Administration', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', src: 'widgets/client-admin-widget.html', adminOnly: true, fullWidth: true, defaultHeight: 700, minHeight: 500, maxHeight: 1200, doubleHeight: true },
    { id: 'client-lookup', name: 'Client Lookup', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>', src: 'widgets/client-lookup-widget.html', fullWidth: false, defaultHeight: 220, minHeight: 180, maxHeight: 350 },
    { id: 'energy-utilization', name: 'Energy Utilization', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>', src: 'widgets/energy-utilization-widget.html', fullWidth: false, defaultHeight: 650, minHeight: 500, maxHeight: 900 },
    { id: 'bid-management', name: 'Bid Management', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', src: 'widgets/bid-management-widget.html', fullWidth: true, defaultHeight: 900, minHeight: 500, maxHeight: 1400 },
    { id: 'ai-assistant', name: 'AI Assistant', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>', fullWidth: true, embedded: true, defaultHeight: 500, minHeight: 300, maxHeight: 800 },
    { id: 'lmp-analytics', name: 'LMP Analytics Dashboard', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>', src: 'widgets/lmp-analytics.html', fullWidth: true, defaultHeight: 800, minHeight: 400, maxHeight: 1200 },
    { id: 'data-manager', name: 'LMP Data Manager', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>', src: 'widgets/lmp-data-manager.html', defaultHeight: 500, minHeight: 300, maxHeight: 900 },
    { id: 'arcadia-fetcher', name: 'Arcadia LMP Data Fetcher', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>', src: 'widgets/arcadia-lmp-fetcher.html', defaultHeight: 500, minHeight: 300, maxHeight: 800 },
    { id: 'lmp-comparison', name: 'LMP Comparison Portal', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', src: 'widgets/lmp-comparison-portal.html', fullWidth: true, defaultHeight: 700, minHeight: 400, maxHeight: 1100 },
    { id: 'peak-demand', name: 'Peak Demand Analytics', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>', src: 'widgets/peak-demand-widget.html', fullWidth: true, defaultHeight: 750, minHeight: 400, maxHeight: 1100 },
    { id: 'analysis-history', name: 'My Analysis History', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', fullWidth: true, embedded: true, defaultHeight: 500, minHeight: 300, maxHeight: 900 }
];

// Clone widgets to avoid mutating defaults
let WIDGETS = JSON.parse(JSON.stringify(DEFAULT_WIDGETS));

// =====================================================
// WIDGET LAYOUT MANAGEMENT
// Uses WidgetPreferences from shared-data-store.js
// This ensures preferences persist per-user and can sync via GitHub
// =====================================================
const WidgetLayout = {
    // Wrapper methods that delegate to WidgetPreferences (from shared-data-store.js)
    // This keeps backward compatibility while using the centralized store
    
    getWidgetConfig(userId, widgetId) {
        if (typeof WidgetPreferences !== 'undefined') {
            return WidgetPreferences.getWidgetConfig(userId, widgetId);
        }
        return null;
    },
    
    saveWidgetConfig(userId, widgetId, config) {
        if (typeof WidgetPreferences !== 'undefined') {
            WidgetPreferences.saveWidgetConfig(userId, widgetId, config);
        }
    },
    
    saveOrder(userId, orderArray) {
        if (typeof WidgetPreferences !== 'undefined') {
            WidgetPreferences.saveOrder(userId, orderArray);
        }
    },
    
    getOrder(userId) {
        if (typeof WidgetPreferences !== 'undefined') {
            return WidgetPreferences.getOrder(userId);
        }
        return [];
    },
    
    resetLayout(userId) {
        if (typeof WidgetPreferences !== 'undefined') {
            WidgetPreferences.resetForUser(userId);
        }
    }
};

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
    console.log('[Portal] Initializing v2.5...');
    loadSavedTheme();
    
    await UserStore.init();
    await ActivityLog.init();
    await SecureEnergyData.init();
    
    // Initialize Client Store (required for client administration)
    if (typeof SecureEnergyClients !== 'undefined') {
        SecureEnergyClients.init();
        console.log('[Portal] Client store initialized');
        
        // Subscribe to active client changes to broadcast to all widgets
        SecureEnergyClients.subscribe((event, data) => {
            if (event === 'activeClientChanged') {
                broadcastActiveClientToWidgets(data.client);
                updateGlobalClientIndicator();
            }
        });
    }
    
    // Initialize Bid Management stores (if available)
    if (typeof SecureEnergySuppliers !== 'undefined') {
        SecureEnergySuppliers.init();
        console.log('[Portal] Supplier store initialized');
    }
    if (typeof SecureEnergyBids !== 'undefined') {
        SecureEnergyBids.init();
        console.log('[Portal] Bid store initialized');
    }
    
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

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const submitBtn = this.querySelector('button[type="submit"]');
    
    // Show loading state
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = 'Signing in...';
    }
    if (errorEl) errorEl.classList.remove('show');
    
    try {
        // CRITICAL: authenticate() is async and fetches fresh user data from GitHub
        // This ensures users can log in from ANY device, not just where they were created
        const result = await UserStore.authenticate(email, password);
        
        console.log('[Login] Auth result:', result);
        
        if (result && result.success) {
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
            const errorMsg = result?.error || 'Login failed';
            console.warn('[Login] Failed:', errorMsg);
            if (errorEl) {
                errorEl.textContent = errorMsg;
                errorEl.classList.add('show');
            }
        }
    } catch (err) {
        console.error('[Login] Error:', err);
        if (errorEl) {
            errorEl.textContent = 'Login error: ' + (err.message || 'Please try again.');
            errorEl.classList.add('show');
        }
    } finally {
        // Reset button state
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.dataset.originalText || 'Sign In';
        }
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
// WIDGETS - Enhanced with Drag, Resize, Collapse
// =====================================================
let draggedWidget = null;
let dragOverWidget = null;

function renderWidgets(user) {
    const container = document.getElementById('widgetsGrid');
    container.innerHTML = '';
    
    // Filter widgets based on permissions
    let availableWidgets = DEFAULT_WIDGETS.filter(w => {
        if (w.adminOnly && user.role !== 'admin') return false;
        if (user.permissions && user.permissions[w.id] === false) return false;
        return true;
    });
    
    // Apply saved order if exists
    const savedOrder = WidgetLayout.getOrder(user.id);
    if (savedOrder.length > 0) {
        availableWidgets.sort((a, b) => {
            const aIdx = savedOrder.indexOf(a.id);
            const bIdx = savedOrder.indexOf(b.id);
            if (aIdx === -1 && bIdx === -1) return 0;
            if (aIdx === -1) return 1;
            if (bIdx === -1) return -1;
            return aIdx - bIdx;
        });
    }
    
    // Add reset layout button
    const resetBtn = document.createElement('div');
    resetBtn.className = 'widget-layout-controls';
    resetBtn.innerHTML = `
        <button class="layout-reset-btn" onclick="resetWidgetLayout()" title="Reset widget layout to default">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
            </svg>
            Reset Layout
        </button>
    `;
    container.appendChild(resetBtn);
    
    availableWidgets.forEach(w => {
        container.appendChild(createWidgetElement(w, user));
    });
    
    if (user.role === 'admin') initAdminWidget();
    initAIAssistantWidget();
    initAnalysisHistoryWidget();
    
    // Initialize drag and drop
    initDragAndDrop();
}

function createWidgetElement(widget, user) {
    const div = document.createElement('div');
    
    // Get saved config for this widget
    const savedConfig = WidgetLayout.getWidgetConfig(user.id, widget.id) || {};
    const isCollapsed = savedConfig.collapsed || false;
    const isFullWidth = savedConfig.fullWidth !== undefined ? savedConfig.fullWidth : widget.fullWidth;
    const currentHeight = savedConfig.height || widget.defaultHeight || 500;
    const isDoubleHeight = widget.doubleHeight || false;
    
    div.className = 'widget' + (isFullWidth ? ' full-width' : '') + (isCollapsed ? ' collapsed' : '') + (isDoubleHeight ? ' double-height' : '');
    div.dataset.widgetId = widget.id;
    div.draggable = true;
    
    // Control buttons
    const controlsHtml = `
        <div class="widget-controls">
            <button class="widget-ctrl-btn collapse-btn" onclick="toggleWidgetCollapse('${widget.id}')" title="${isCollapsed ? 'Expand' : 'Collapse'}">
                <svg class="collapse-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="${isCollapsed ? '6 9 12 15 18 9' : '18 15 12 9 6 15'}"/>
                </svg>
            </button>
            <button class="widget-ctrl-btn width-btn" onclick="toggleWidgetWidth('${widget.id}')" title="${isFullWidth ? 'Standard width' : 'Full width'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${isFullWidth 
                        ? '<path d="M4 14h6v6H4zM14 4h6v6h-6z"/><path d="M14 14h6v6h-6z"/><path d="M4 4h6v6H4z"/>' 
                        : '<path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/>'}
                </svg>
            </button>
            <div class="widget-drag-handle" title="Drag to reorder">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/>
                    <circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/>
                </svg>
            </div>
        </div>
    `;
    
    const popoutBtn = widget.src ? `<button class="widget-btn" onclick="popoutWidget('${widget.id}')" title="Pop out"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>` : '';
    
    const contentStyle = `height:${currentHeight}px;${isCollapsed ? 'display:none;' : ''}`;
    
    if (widget.embedded && widget.id === 'user-admin') {
        div.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${widget.icon}<span>${widget.name}</span><span class="widget-badge">ADMIN</span></div>
                <div class="widget-actions">${controlsHtml}</div>
            </div>
            <div class="widget-content admin-widget-content" id="adminWidgetContent" style="${contentStyle}" data-default-height="${widget.defaultHeight}" data-min-height="${widget.minHeight}" data-max-height="${widget.maxHeight}"></div>
            <div class="widget-resize-handle" data-widget-id="${widget.id}"></div>`;
    } else if (widget.embedded && widget.id === 'ai-assistant') {
        div.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${widget.icon}<span>${widget.name}</span><span class="widget-badge" style="background:var(--accent-info);">BETA</span></div>
                <div class="widget-actions">${controlsHtml}</div>
            </div>
            <div class="widget-content ai-assistant-content" id="aiAssistantContent" style="${contentStyle}" data-default-height="${widget.defaultHeight}" data-min-height="${widget.minHeight}" data-max-height="${widget.maxHeight}"></div>
            <div class="widget-resize-handle" data-widget-id="${widget.id}"></div>`;
    } else if (widget.embedded && widget.id === 'analysis-history') {
        div.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${widget.icon}<span>${widget.name}</span></div>
                <div class="widget-actions">
                    <button class="widget-btn" onclick="exportMyAnalysisRecords()" title="Export"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
                    <button class="widget-btn" onclick="refreshAnalysisHistory()" title="Refresh"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/></svg></button>
                    ${controlsHtml}
                </div>
            </div>
            <div class="widget-content analysis-history-content" id="analysisHistoryContent" style="${contentStyle}overflow-y:auto;" data-default-height="${widget.defaultHeight}" data-min-height="${widget.minHeight}" data-max-height="${widget.maxHeight}"></div>
            <div class="widget-resize-handle" data-widget-id="${widget.id}"></div>`;
    } else {
        div.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${widget.icon}<span>${widget.name}</span></div>
                <div class="widget-actions">${popoutBtn}${controlsHtml}</div>
            </div>
            <div class="widget-content" style="${contentStyle}" data-default-height="${widget.defaultHeight}" data-min-height="${widget.minHeight}" data-max-height="${widget.maxHeight}">
                <iframe class="widget-iframe" src="${widget.src}" title="${widget.name}"></iframe>
            </div>
            <div class="widget-resize-handle" data-widget-id="${widget.id}"></div>`;
    }
    
    return div;
}

// =====================================================
// DRAG AND DROP
// =====================================================
function initDragAndDrop() {
    const widgets = document.querySelectorAll('.widget[draggable="true"]');
    
    widgets.forEach(widget => {
        widget.addEventListener('dragstart', handleDragStart);
        widget.addEventListener('dragend', handleDragEnd);
        widget.addEventListener('dragover', handleDragOver);
        widget.addEventListener('dragenter', handleDragEnter);
        widget.addEventListener('dragleave', handleDragLeave);
        widget.addEventListener('drop', handleDrop);
    });
    
    // Initialize resize handles
    initResizeHandles();
}

function handleDragStart(e) {
    draggedWidget = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.widgetId);
    
    // Create ghost image
    const ghost = this.cloneNode(true);
    ghost.style.opacity = '0.5';
    ghost.style.position = 'absolute';
    ghost.style.top = '-1000px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => ghost.remove(), 0);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.widget').forEach(w => {
        w.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    });
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
    if (e.clientY < midY) {
        this.classList.add('drag-over-top');
    } else {
        this.classList.add('drag-over-bottom');
    }
}

function handleDragEnter(e) {
    e.preventDefault();
    if (this !== draggedWidget) {
        this.classList.add('drag-over');
        dragOverWidget = this;
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
}

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
    
    // Remove dragged widget
    draggedWidget.remove();
    
    // Insert at new position
    if (dropAfter) {
        this.after(draggedWidget);
    } else {
        this.before(draggedWidget);
    }
    
    // Save new order
    saveCurrentWidgetOrder();
    
    this.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
    showNotification('Widget order updated', 'success');
}

function saveCurrentWidgetOrder() {
    if (!currentUser) return;
    const container = document.getElementById('widgetsGrid');
    const order = [...container.querySelectorAll('.widget[data-widget-id]')].map(w => w.dataset.widgetId);
    WidgetLayout.saveOrder(currentUser.id, order);
}

// =====================================================
// RESIZE HANDLES
// =====================================================
function initResizeHandles() {
    document.querySelectorAll('.widget-resize-handle').forEach(handle => {
        handle.addEventListener('mousedown', initResize);
    });
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
    
    function doResize(e) {
        const newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + (e.clientY - startY)));
        content.style.height = newHeight + 'px';
    }
    
    function stopResize(e) {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
        widget.classList.remove('resizing');
        
        // Save height
        if (currentUser) {
            WidgetLayout.saveWidgetConfig(currentUser.id, widgetId, { height: content.offsetHeight });
        }
    }
    
    widget.classList.add('resizing');
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
}

// =====================================================
// WIDGET CONTROLS
// =====================================================
window.toggleWidgetCollapse = function(widgetId) {
    const widget = document.querySelector(`[data-widget-id="${widgetId}"]`);
    if (!widget) return;
    
    const content = widget.querySelector('.widget-content');
    const collapseBtn = widget.querySelector('.collapse-btn');
    const isCollapsed = widget.classList.toggle('collapsed');
    
    if (isCollapsed) {
        content.style.display = 'none';
        widget.querySelector('.widget-resize-handle').style.display = 'none';
    } else {
        content.style.display = '';
        widget.querySelector('.widget-resize-handle').style.display = '';
    }
    
    // Update icon
    const icon = collapseBtn.querySelector('.collapse-icon');
    icon.innerHTML = isCollapsed 
        ? '<polyline points="6 9 12 15 18 9"/>' 
        : '<polyline points="18 15 12 9 6 15"/>';
    collapseBtn.title = isCollapsed ? 'Expand' : 'Collapse';
    
    // Save state
    if (currentUser) {
        WidgetLayout.saveWidgetConfig(currentUser.id, widgetId, { collapsed: isCollapsed });
    }
};

window.toggleWidgetWidth = function(widgetId) {
    const widget = document.querySelector(`[data-widget-id="${widgetId}"]`);
    if (!widget) return;
    
    const isFullWidth = widget.classList.toggle('full-width');
    const widthBtn = widget.querySelector('.width-btn');
    
    // Update icon
    widthBtn.innerHTML = isFullWidth 
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6H4zM14 4h6v6h-6z"/><path d="M14 14h6v6h-6z"/><path d="M4 4h6v6H4z"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/></svg>';
    widthBtn.title = isFullWidth ? 'Standard width' : 'Full width';
    
    // Save state
    if (currentUser) {
        WidgetLayout.saveWidgetConfig(currentUser.id, widgetId, { fullWidth: isFullWidth });
    }
};

window.resetWidgetLayout = function() {
    if (!currentUser) return;
    if (confirm('Reset all widgets to default layout? This will restore default positions, sizes, and collapsed states.')) {
        WidgetLayout.resetLayout(currentUser.id);
        renderWidgets(currentUser);
        showNotification('Widget layout reset to default', 'success');
    }
};

function popoutWidget(id) { 
    const w = DEFAULT_WIDGETS.find(x => x.id === id); 
    if (w?.src) window.open(w.src, id, 'width=1200,height=800'); 
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
            <div class="widget-permission-item"><span>Client Lookup</span><label class="toggle-switch"><input type="checkbox" id="perm-client-lookup" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>Client Administration</span><label class="toggle-switch"><input type="checkbox" id="perm-client-admin" checked><span class="toggle-slider"></span></label><span style="font-size:0.7rem;color:var(--text-tertiary);margin-left:6px;">(Admin only)</span></div>
            <div class="widget-permission-item"><span>Energy Utilization</span><label class="toggle-switch"><input type="checkbox" id="perm-energy-utilization" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>Bid Management</span><label class="toggle-switch"><input type="checkbox" id="perm-bid-management" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>AI Assistant</span><label class="toggle-switch"><input type="checkbox" id="perm-ai-assistant" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>LMP Comparison</span><label class="toggle-switch"><input type="checkbox" id="perm-lmp-comparison" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>LMP Analytics</span><label class="toggle-switch"><input type="checkbox" id="perm-lmp-analytics" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>Peak Demand Analytics</span><label class="toggle-switch"><input type="checkbox" id="perm-peak-demand" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>Analysis History</span><label class="toggle-switch"><input type="checkbox" id="perm-analysis-history" checked><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>Data Manager</span><label class="toggle-switch"><input type="checkbox" id="perm-data-manager"><span class="toggle-slider"></span></label></div>
            <div class="widget-permission-item"><span>Arcadia Fetcher</span><label class="toggle-switch"><input type="checkbox" id="perm-arcadia-fetcher"><span class="toggle-slider"></span></label></div>
        </div>
        <button class="btn-primary" onclick="createUser()" style="margin-top:20px;">Create User</button></div>`;
}

function getManageUsersPanel() { return `<div style="overflow-x:auto;"><table class="users-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody id="usersTableBody"></tbody></table></div>`; }

function getActivityLogPanel() {
    return `<div class="activity-stats-grid" id="activityStatsGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px;"></div>
        <div class="activity-filters"><input type="text" id="activitySearch" placeholder="Search..." oninput="renderActivityLog()"><select id="activityWidgetFilter" onchange="renderActivityLog()"><option value="">All Widgets</option><option value="bid-management">Bid Management</option><option value="lmp-comparison">LMP Comparison</option><option value="lmp-analytics">LMP Analytics</option><option value="ai-assistant">AI Assistant</option><option value="portal">Portal</option></select></div>
        <div id="activityLogContainer" style="max-height:400px;overflow-y:auto;"></div>`;
}

function getGitHubSyncPanel() {
    return `<div class="github-sync-panel">
        <div class="github-status" id="githubSyncStatus">
            <div class="status-indicator"></div>
            <span>Checking sync status...</span>
        </div>
        <div class="github-actions" style="display:flex;gap:12px;margin-top:20px;">
            <button class="btn-primary" onclick="GitHubSync.pushChanges()">Push to GitHub</button>
            <button class="btn-secondary" onclick="GitHubSync.pullLatest()">Pull Latest</button>
        </div>
        <div id="githubSyncLog" style="margin-top:20px;max-height:300px;overflow-y:auto;font-family:monospace;font-size:12px;"></div>
    </div>`;
}

function getErrorLogPanel() {
    return `<div class="error-log-panel">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h4 style="margin:0;">System Errors</h4>
            <button class="btn-secondary" onclick="clearErrorLog()" style="font-size:12px;padding:6px 12px;">Clear Log</button>
        </div>
        <div id="errorLogContainer" style="max-height:400px;overflow-y:auto;"></div>
    </div>`;
}

function getExportPanel() {
    return `<div class="export-panel">
        <h4 style="margin-bottom:20px;">Export Portal Data</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;">
            <button class="export-btn" onclick="exportAllUsers()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/></svg>
                <span>Export Users</span>
            </button>
            <button class="export-btn" onclick="exportActivityLog()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>Export Activity</span>
            </button>
            <button class="export-btn" onclick="exportLMPData()">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
                <span>Export LMP Data</span>
            </button>
        </div>
    </div>`;
}

// Stub functions for admin panels (implement as needed)
function renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    const users = UserStore.getAll();
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td><span class="role-badge ${u.role}">${u.role}</span></td>
            <td><span class="status-badge ${u.active !== false ? 'active' : 'inactive'}">${u.active !== false ? 'Active' : 'Inactive'}</span></td>
            <td>${new Date(u.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="action-btn" onclick="editUser('${u.id}')" title="Edit">✏️</button>
                ${u.role !== 'admin' ? `<button class="action-btn" onclick="deleteUser('${u.id}')" title="Delete">🗑️</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function renderActivityLog() {
    const container = document.getElementById('activityLogContainer');
    const statsGrid = document.getElementById('activityStatsGrid');
    if (!container) return;
    
    const search = document.getElementById('activitySearch')?.value?.toLowerCase() || '';
    const widgetFilter = document.getElementById('activityWidgetFilter')?.value || '';
    
    const logs = ActivityLog.getAll().filter(log => {
        if (widgetFilter && log.widget !== widgetFilter) return false;
        if (search) {
            const searchStr = `${log.userName || ''} ${log.action || ''} ${log.widget || ''}`.toLowerCase();
            if (!searchStr.includes(search)) return false;
        }
        return true;
    }).slice(0, 100);
    
    // Stats
    const allLogs = ActivityLog.getAll();
    const today = new Date().toDateString();
    const todayLogs = allLogs.filter(l => new Date(l.timestamp).toDateString() === today);
    
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div class="stat-box"><div class="stat-value">${allLogs.length}</div><div class="stat-label">Total Events</div></div>
            <div class="stat-box"><div class="stat-value">${todayLogs.length}</div><div class="stat-label">Today</div></div>
            <div class="stat-box"><div class="stat-value">${new Set(allLogs.map(l => l.userId)).size}</div><div class="stat-label">Unique Users</div></div>
            <div class="stat-box"><div class="stat-value">${allLogs.filter(l => l.action === 'LMP Analysis').length}</div><div class="stat-label">Analyses</div></div>
        `;
    }
    
    container.innerHTML = logs.length ? logs.map(log => `
        <div class="activity-item">
            <div class="activity-icon">${getActivityIcon(log.action)}</div>
            <div class="activity-details">
                <div class="activity-user">${escapeHtml(log.userName || 'Unknown')}</div>
                <div class="activity-action">${escapeHtml(log.action || 'Action')} in ${escapeHtml(log.widget || 'Portal')}</div>
            </div>
            <div class="activity-time">${formatTimeAgo(log.timestamp)}</div>
        </div>
    `).join('') : '<div style="text-align:center;color:var(--text-tertiary);padding:40px;">No activity found</div>';
}

function renderGitHubSyncStatus() {
    const status = document.getElementById('githubSyncStatus');
    if (status) {
        status.innerHTML = `<div class="status-indicator connected"></div><span>Connected to GitHub</span>`;
    }
}

function renderErrorLog() {
    const container = document.getElementById('errorLogContainer');
    if (!container) return;
    const errors = (typeof ErrorLog !== 'undefined' && ErrorLog.getAll) ? ErrorLog.getAll() : [];
    container.innerHTML = errors.length ? errors.slice(0, 50).map(e => `
        <div class="error-item" style="background:var(--bg-tertiary);padding:12px;border-radius:8px;margin-bottom:8px;border-left:3px solid #ef4444;">
            <div style="font-weight:600;color:#ef4444;">${escapeHtml(e.type || 'Error')}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${escapeHtml(e.message || 'Unknown error')}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px;">${new Date(e.timestamp).toLocaleString()}</div>
        </div>
    `).join('') : '<div style="text-align:center;color:var(--text-tertiary);padding:40px;">No errors logged</div>';
}

function clearErrorLog() {
    if (typeof ErrorLog !== 'undefined' && ErrorLog.clear) {
        ErrorLog.clear();
        renderErrorLog();
        showNotification('Error log cleared', 'success');
    }
}

function getActivityIcon(action) {
    const icons = {
        'Login': '🔑', 'Logout': '🚪', 'LMP Analysis': '📊', 'Export': '📥', 'Button Click': '👆'
    };
    return icons[action] || '📝';
}

function formatTimeAgo(timestamp) {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds/3600)}h ago`;
    return `${Math.floor(seconds/86400)}d ago`;
}

window.createUser = function() {
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
        'client-lookup': document.getElementById('perm-client-lookup')?.checked,
        'client-admin': document.getElementById('perm-client-admin')?.checked,
        'energy-utilization': document.getElementById('perm-energy-utilization')?.checked,
        'bid-management': document.getElementById('perm-bid-management')?.checked,
        'ai-assistant': document.getElementById('perm-ai-assistant')?.checked,
        'lmp-comparison': document.getElementById('perm-lmp-comparison')?.checked,
        'lmp-analytics': document.getElementById('perm-lmp-analytics')?.checked,
        'peak-demand': document.getElementById('perm-peak-demand')?.checked,
        'analysis-history': document.getElementById('perm-analysis-history')?.checked,
        'data-manager': document.getElementById('perm-data-manager')?.checked,
        'arcadia-fetcher': document.getElementById('perm-arcadia-fetcher')?.checked
    };
    
    const result = UserStore.create({ firstName, lastName, email, password, role, permissions });
    if (result.success) {
        showNotification(`User ${firstName} ${lastName} created!`, 'success');
        // Clear form
        ['newFirstName', 'newLastName', 'newEmail', 'newPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    } else {
        showNotification(result.error || 'Failed to create user', 'error');
    }
};

window.editUser = function(userId) {
    const user = UserStore.getById(userId);
    if (!user) return;
    
    const modal = document.getElementById('editUserModal');
    const content = document.getElementById('editUserContent');
    
    // Get current permissions (default to true if not set)
    const perms = user.permissions || {};
    const getChecked = (widgetId) => perms[widgetId] !== false ? 'checked' : '';
    
    content.innerHTML = `
        <div class="edit-user-form">
            <div class="form-row">
                <div class="form-group"><label>First Name</label><input type="text" id="editFirstName" value="${escapeHtml(user.firstName)}"></div>
                <div class="form-group"><label>Last Name</label><input type="text" id="editLastName" value="${escapeHtml(user.lastName)}"></div>
            </div>
            <div class="form-row single"><div class="form-group"><label>Email</label><input type="email" id="editEmail" value="${escapeHtml(user.email)}"></div></div>
            <div class="form-row single"><div class="form-group"><label>New Password (leave blank to keep current)</label><input type="password" id="editPassword" placeholder="New password"></div></div>
            <div class="form-row single"><div class="form-group"><label>Role</label><select id="editRole"><option value="user" ${user.role === 'user' ? 'selected' : ''}>Standard User</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrator</option></select></div></div>
            
            <div class="widget-permissions" style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border-color);">
                <h4 style="margin-bottom:12px;color:var(--text-secondary);">Widget Permissions</h4>
                <div class="widget-permission-item"><span>Client Lookup</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-client-lookup" ${getChecked('client-lookup')}><span class="toggle-slider"></span></label></div>
                <div class="widget-permission-item"><span>Client Administration</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-client-admin" ${getChecked('client-admin')}><span class="toggle-slider"></span></label><span style="font-size:0.7rem;color:var(--text-tertiary);margin-left:6px;">(Admin only)</span></div>
                <div class="widget-permission-item"><span>Energy Utilization</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-energy-utilization" ${getChecked('energy-utilization')}><span class="toggle-slider"></span></label></div>
                <div class="widget-permission-item"><span>Bid Management</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-bid-management" ${getChecked('bid-management')}><span class="toggle-slider"></span></label></div>
                <div class="widget-permission-item"><span>AI Assistant</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-ai-assistant" ${getChecked('ai-assistant')}><span class="toggle-slider"></span></label></div>
                <div class="widget-permission-item"><span>LMP Comparison</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-lmp-comparison" ${getChecked('lmp-comparison')}><span class="toggle-slider"></span></label></div>
                <div class="widget-permission-item"><span>LMP Analytics</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-lmp-analytics" ${getChecked('lmp-analytics')}><span class="toggle-slider"></span></label></div>
                <div class="widget-permission-item"><span>Peak Demand Analytics</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-peak-demand" ${getChecked('peak-demand')}><span class="toggle-slider"></span></label></div>
                <div class="widget-permission-item"><span>Analysis History</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-analysis-history" ${getChecked('analysis-history')}><span class="toggle-slider"></span></label></div>
                <div class="widget-permission-item"><span>Data Manager</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-data-manager" ${getChecked('data-manager')}><span class="toggle-slider"></span></label></div>
                <div class="widget-permission-item"><span>Arcadia Fetcher</span><label class="toggle-switch"><input type="checkbox" id="edit-perm-arcadia-fetcher" ${getChecked('arcadia-fetcher')}><span class="toggle-slider"></span></label></div>
            </div>
            
            <div style="margin-top:20px;display:flex;gap:12px;">
                <button class="btn-primary" onclick="saveUserEdit('${userId}')">Save Changes</button>
                <button class="btn-secondary" onclick="closeEditModal()">Cancel</button>
            </div>
        </div>
    `;
    
    document.querySelector('#editUserModal .modal-title').textContent = 'Edit User';
    modal.classList.add('show');
};

window.saveUserEdit = function(userId) {
    const updates = {
        firstName: document.getElementById('editFirstName')?.value?.trim(),
        lastName: document.getElementById('editLastName')?.value?.trim(),
        email: document.getElementById('editEmail')?.value?.trim(),
        role: document.getElementById('editRole')?.value,
        permissions: {
            'client-lookup': document.getElementById('edit-perm-client-lookup')?.checked,
            'client-admin': document.getElementById('edit-perm-client-admin')?.checked,
            'energy-utilization': document.getElementById('edit-perm-energy-utilization')?.checked,
            'bid-management': document.getElementById('edit-perm-bid-management')?.checked,
            'ai-assistant': document.getElementById('edit-perm-ai-assistant')?.checked,
            'lmp-comparison': document.getElementById('edit-perm-lmp-comparison')?.checked,
            'lmp-analytics': document.getElementById('edit-perm-lmp-analytics')?.checked,
            'peak-demand': document.getElementById('edit-perm-peak-demand')?.checked,
            'analysis-history': document.getElementById('edit-perm-analysis-history')?.checked,
            'data-manager': document.getElementById('edit-perm-data-manager')?.checked,
            'arcadia-fetcher': document.getElementById('edit-perm-arcadia-fetcher')?.checked
        }
    };
    
    const newPassword = document.getElementById('editPassword')?.value;
    if (newPassword) updates.password = newPassword;
    
    const result = UserStore.update(userId, updates);
    if (result.success) {
        showNotification('User updated!', 'success');
        closeEditModal();
        renderUsersTable();
        // Re-render widgets if editing current user
        if (currentUser && currentUser.id === userId) {
            currentUser = UserStore.getById(userId);
            renderWidgets(currentUser);
        }
    } else {
        showNotification(result.error || 'Failed to update user', 'error');
    }
};

window.deleteUser = function(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    const result = UserStore.delete(userId);
    if (result.success) {
        showNotification('User deleted', 'success');
        renderUsersTable();
    } else {
        showNotification(result.error || 'Failed to delete user', 'error');
    }
};

window.closeEditModal = function() {
    document.getElementById('editUserModal')?.classList.remove('show');
};

// Export functions (stubs)
window.exportAllUsers = function() { showNotification('Exporting users...', 'info'); };
window.exportActivityLog = function() { showNotification('Exporting activity...', 'info'); };
window.exportLMPData = function() { showNotification('Exporting LMP data...', 'info'); };

// =====================================================
// AI ASSISTANT WIDGET
// =====================================================
function initAIAssistantWidget() {
    const content = document.getElementById('aiAssistantContent');
    if (!content) return;
    
    content.innerHTML = `
        <div class="ai-chat-container">
            <div class="ai-chat-messages" id="aiChatMessages">
                <div class="ai-message assistant">
                    <div class="ai-message-content">
                        👋 Hi! I'm your AI assistant for Secure Energy Analytics. I can help you with:
                        <ul style="margin:8px 0 0 16px;padding:0;">
                            <li>Understanding LMP data and trends</li>
                            <li>Comparing energy pricing strategies</li>
                            <li>Navigating the portal features</li>
                            <li>Explaining energy market concepts</li>
                        </ul>
                        How can I help you today?
                    </div>
                </div>
            </div>
            <div class="ai-chat-input-container">
                <input type="text" class="ai-chat-input" id="aiChatInput" placeholder="Ask me anything about energy analytics...">
                <button class="ai-chat-send" onclick="sendAIMessage()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('aiChatInput')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') sendAIMessage();
    });
}

window.sendAIMessage = function() {
    const input = document.getElementById('aiChatInput');
    const messages = document.getElementById('aiChatMessages');
    if (!input || !messages) return;
    
    const text = input.value.trim();
    if (!text) return;
    
    // Add user message
    messages.innerHTML += `<div class="ai-message user"><div class="ai-message-content">${escapeHtml(text)}</div></div>`;
    input.value = '';
    
    // Simulate AI response
    setTimeout(() => {
        messages.innerHTML += `<div class="ai-message assistant"><div class="ai-message-content">I understand you're asking about "${escapeHtml(text)}". This is a demo response - in production, this would connect to an AI backend for intelligent responses about energy analytics.</div></div>`;
        messages.scrollTop = messages.scrollHeight;
    }, 500);
    
    messages.scrollTop = messages.scrollHeight;
};

// =====================================================
// ANALYSIS HISTORY WIDGET
// =====================================================
function initAnalysisHistoryWidget() {
    renderAnalysisHistory();
}

function renderAnalysisHistory() {
    const content = document.getElementById('analysisHistoryContent');
    if (!content || !currentUser) return;
    
    const analyses = ActivityLog.getAll().filter(a => 
        a.action === 'LMP Analysis' && 
        (currentUser.role === 'admin' || a.userId === currentUser.id)
    ).slice(0, 20);
    
    if (!analyses.length) {
        content.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);padding:60px 20px;">No analyses yet. Use the LMP Comparison Portal to run your first analysis!</div>';
        return;
    }
    
    content.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;padding:16px;">${analyses.map(a => createAnalysisCard(a)).join('')}</div>`;
}

window.refreshAnalysisHistory = function() {
    renderAnalysisHistory();
    showNotification('Analysis history refreshed', 'success');
};

window.exportMyAnalysisRecords = function() {
    showNotification('Exporting analysis records...', 'info');
};

function createAnalysisCard(a) {
    const d = a.data || {};
    const r = d.results || {};
    const savings = r.savingsVsFixed || 0;
    const client = a.clientName || d.clientName || 'Unnamed Analysis';
    const timeStr = formatTimeAgo(a.timestamp);
    const showData = encodeURIComponent(JSON.stringify(a));
    const reloadData = encodeURIComponent(JSON.stringify(d));
    
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

window.showAnalysisDetail = function(encodedData) {
    trackButtonClick('Show Analysis Detail', 'analysis-history');
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
};

window.reloadAnalysis = function(encodedData) {
    trackButtonClick('Reload Analysis', 'analysis-history');
    try {
        const data = JSON.parse(decodeURIComponent(encodedData));
        const lmpWidget = document.querySelector('[data-widget-id="lmp-comparison"] iframe');
        if (lmpWidget?.contentWindow) {
            lmpWidget.contentWindow.postMessage({ type: 'LOAD_ANALYSIS', data }, '*');
            scrollToWidget('lmp-comparison');
            showNotification('Loaded into calculator', 'success');
        } else { showNotification('Open LMP Comparison first', 'warning'); }
    } catch (e) { showNotification('Failed to reload', 'error'); }
};

// =====================================================
// AI SEARCH
// =====================================================
const AISearch = {
    init() {
        const input = document.getElementById('aiSearchInput');
        if (!input) return;
        
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                const query = input.value.trim();
                if (query) {
                    // Scroll to AI Assistant and populate
                    scrollToWidget('ai-assistant');
                    const aiInput = document.getElementById('aiChatInput');
                    if (aiInput) {
                        aiInput.value = query;
                        sendAIMessage();
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
    const n = document.getElementById('notification'); 
    n.textContent = message; 
    n.className = 'notification show ' + type; 
    setTimeout(() => n.classList.remove('show'), 3000); 
}

function escapeHtml(text) { 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

function scrollToWidget(id) { 
    const w = document.querySelector(`[data-widget-id="${id}"]`); 
    if (w) { 
        w.scrollIntoView({ behavior: 'smooth' }); 
        w.style.boxShadow = '0 0 20px var(--se-light-green)'; 
        setTimeout(() => w.style.boxShadow = '', 2000); 
    } 
}

function trackButtonClick(buttonName, widget = 'portal', context = null) {
    if (currentUser) {
        ActivityLog.logButtonClick({
            userId: currentUser.id,
            userEmail: currentUser.email,
            userName: `${currentUser.firstName} ${currentUser.lastName}`,
            button: buttonName,
            widget: widget,
            context: context
        });
    }
}

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
        ActivityLog.logLMPAnalysis({ userId: currentUser.id, userEmail: currentUser.email, userName: `${currentUser.firstName} ${currentUser.lastName}`, clientName: d.clientName, clientId: d.clientId, ...d });
        if (document.getElementById('analysisHistoryContent')) renderAnalysisHistory();
        showNotification(`Analysis logged: ${d.clientName || 'Unnamed'}`, 'success');
    }
    if (event.data?.type === 'LMP_EXPORT_COMPLETE' && currentUser) {
        ActivityLog.logLMPExport({ userId: currentUser.id, userEmail: currentUser.email, userName: `${currentUser.firstName} ${currentUser.lastName}`, ...event.data.data });
    }
    if (event.data?.type === 'WIDGET_ERROR') {
        ErrorLog.log({ type: event.data.errorType || 'widget', widget: event.data.widget || 'unknown', message: event.data.message, source: event.data.source, line: event.data.line, stack: event.data.stack, context: event.data.context });
    }
    // Handle bid management widget requests for current user
    if (event.data?.type === 'GET_CURRENT_USER' && event.source) {
        event.source.postMessage({ 
            type: 'CURRENT_USER', 
            user: currentUser ? {
                id: currentUser.id,
                username: currentUser.email,
                name: `${currentUser.firstName} ${currentUser.lastName}`,
                firstName: currentUser.firstName,
                lastName: currentUser.lastName,
                email: currentUser.email,
                role: currentUser.role
            } : null 
        }, '*');
    }
    // Handle bid sheet generation activity logging
    if (event.data?.type === 'BIDSHEET_GENERATED' && currentUser) {
        ActivityLog.log({ 
            userId: currentUser.id, 
            userEmail: currentUser.email, 
            userName: `${currentUser.firstName} ${currentUser.lastName}`, 
            widget: 'bid-management', 
            action: 'Bid Sheet Generated',
            details: event.data.data
        });
        showNotification('Bid sheet generated!', 'success');
    }
    
    // ========================================
    // CLIENT CONTEXT HANDLERS
    // ========================================
    
    // Widget requesting current active client
    if (event.data?.type === 'REQUEST_ACTIVE_CLIENT' && event.source) {
        const client = window.SecureEnergyClients?.getActiveClient?.();
        event.source.postMessage({
            type: 'ACTIVE_CLIENT_RESPONSE',
            client: client,
            clientId: client?.id || null
        }, '*');
    }
    
    // Widget requesting to link an analysis to the active client
    if (event.data?.type === 'LINK_LMP_TO_CLIENT' && event.data.analysis) {
        if (window.SecureEnergyClients) {
            const activeId = SecureEnergyClients.getActiveClientId();
            if (activeId) {
                SecureEnergyClients.linkAnalysis(activeId, event.data.analysis);
                console.log('[Portal] Analysis linked to client:', activeId);
            }
        }
    }
    
    // Widget requesting to link a bid to the active client
    if (event.data?.type === 'LINK_BID_TO_CLIENT' && event.data.bid) {
        if (window.SecureEnergyClients) {
            const activeId = SecureEnergyClients.getActiveClientId();
            if (activeId) {
                SecureEnergyClients.linkBid(activeId, event.data.bid);
                console.log('[Portal] Bid linked to client:', activeId);
            }
        }
    }
    
    // Widget requesting to scroll to another widget (e.g., client lookup)
    if (event.data?.type === 'SCROLL_TO_WIDGET' && event.data.widgetId) {
        scrollToWidget(event.data.widgetId);
    }
    
    // Widget requesting current user info
    if (event.data?.type === 'REQUEST_CURRENT_USER' && event.source) {
        event.source.postMessage({
            type: 'CURRENT_USER_RESPONSE',
            user: currentUser ? {
                id: currentUser.id,
                email: currentUser.email,
                name: `${currentUser.firstName} ${currentUser.lastName}`,
                firstName: currentUser.firstName,
                lastName: currentUser.lastName,
                role: currentUser.role
            } : null
        }, '*');
    }
}

// =====================================================
// CLIENT CONTEXT FUNCTIONS
// =====================================================

/**
 * Broadcast active client change to all widget iframes
 */
function broadcastActiveClientToWidgets(client) {
    document.querySelectorAll('iframe').forEach(iframe => {
        try {
            iframe.contentWindow.postMessage({
                type: 'ACTIVE_CLIENT_CHANGED',
                client: client,
                clientId: client?.id || null
            }, '*');
        } catch (e) {
            // Ignore cross-origin errors
        }
    });
}

/**
 * Update the global client indicator in the header (if present)
 */
function updateGlobalClientIndicator() {
    const indicator = document.getElementById('globalClientIndicator');
    if (!indicator) return;
    
    const client = window.SecureEnergyClients?.getActiveClient?.();
    const nameEl = indicator.querySelector('.client-indicator-name');
    
    if (nameEl) {
        if (client) {
            nameEl.textContent = client.name;
            nameEl.classList.add('has-client');
            indicator.classList.add('has-client');
        } else {
            nameEl.textContent = 'None';
            nameEl.classList.remove('has-client');
            indicator.classList.remove('has-client');
        }
    }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEditModal(); });
document.getElementById('editUserModal')?.addEventListener('click', function(e) { if (e.target === this) closeEditModal(); });

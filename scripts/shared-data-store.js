/**
 * Secure Energy Shared Data Store v2.6
 * Centralized data management for LMP data, user authentication, activity logging,
 * and widget layout preferences
 * 
 * v2.6 Updates:
 * - ActivityLog.log() dispatches 'activityLogged' event for UI auto-refresh
 * 
 * v2.5 Updates:
 * - Smart merge: compares updatedAt timestamps to keep most recent user data
 * - update() now awaits GitHub sync completion before returning
 * - Fixes issue where user edits were lost on page refresh
 * 
 * v2.4 Updates:
 * - GitHub-first authentication: Users can now log in from ANY device
 * - UserStore.init() fetches users from GitHub before falling back to localStorage
 * - UserStore.authenticate() always refreshes from GitHub before validating
 * - Fixes "user not found" errors when logging in from new computers
 * 
 * v2.3 Updates:
 * - Widget layout preferences integrated into user profiles
 * - Layout sync via GitHub for cross-device persistence
 * - WidgetPreferences module for managing widget states
 */

// =====================================================
// ERROR LOG STORE
// =====================================================
const ErrorLog = {
    STORAGE_KEY: 'secureEnergy_errorLog',
    MAX_ERRORS: 100,
    errors: [],

    init() {
        console.log('[ErrorLog] Initializing...');
        this.errors = this.loadFromStorage();
        this.setupGlobalHandlers();
        console.log(`[ErrorLog] ${this.errors.length} errors loaded`);
        return this.errors;
    },

    setupGlobalHandlers() {
        window.onerror = (message, source, lineno, colno, error) => {
            this.log({
                type: 'javascript',
                widget: this.getWidgetFromSource(source),
                message: message,
                source: source,
                line: lineno,
                column: colno,
                stack: error?.stack
            });
            return false;
        };

        window.addEventListener('unhandledrejection', (event) => {
            this.log({
                type: 'promise',
                widget: 'portal',
                message: event.reason?.message || String(event.reason),
                stack: event.reason?.stack
            });
        });

        window.addEventListener('message', (event) => {
            if (event.data?.type === 'WIDGET_ERROR') {
                this.log({
                    type: event.data.errorType || 'widget',
                    widget: event.data.widget || 'unknown',
                    message: event.data.message,
                    source: event.data.source,
                    line: event.data.line,
                    stack: event.data.stack,
                    context: event.data.context
                });
            }
        });
    },

    getWidgetFromSource(source) {
        if (!source) return 'unknown';
        if (source.includes('lmp-comparison')) return 'lmp-comparison';
        if (source.includes('lmp-analytics')) return 'lmp-analytics';
        if (source.includes('data-manager')) return 'data-manager';
        if (source.includes('arcadia')) return 'arcadia-fetcher';
        if (source.includes('main.js')) return 'portal';
        return 'portal';
    },

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) { return []; }
    },

    saveToStorage() {
        try {
            if (this.errors.length > this.MAX_ERRORS) {
                this.errors = this.errors.slice(0, this.MAX_ERRORS);
            }
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.errors));
        } catch (e) { console.error('[ErrorLog] Save failed:', e); }
    },

    log(error) {
        const entry = {
            id: 'err-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            timestamp: new Date().toISOString(),
            type: error.type || 'error',
            widget: error.widget || 'unknown',
            message: error.message || 'Unknown error',
            source: error.source || null,
            line: error.line || null,
            column: error.column || null,
            stack: error.stack || null,
            context: error.context || null,
            resolved: false
        };
        this.errors.unshift(entry);
        this.saveToStorage();
        console.error(`[ErrorLog] ${entry.widget}:`, entry.message);
        return entry;
    },

    getAll() { return this.errors; },
    getRecent(count = 20) { return this.errors.slice(0, count); },
    getByWidget(widget) { return this.errors.filter(e => e.widget === widget); },
    getUnresolved() { return this.errors.filter(e => !e.resolved); },
    
    resolve(errorId) {
        const error = this.errors.find(e => e.id === errorId);
        if (error) {
            error.resolved = true;
            error.resolvedAt = new Date().toISOString();
            this.saveToStorage();
        }
    },

    clear() { this.errors = []; this.saveToStorage(); },
    clearAll() { this.clear(); },

    getStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();
        const byWidget = {}, byType = {};
        this.errors.forEach(e => {
            byWidget[e.widget] = (byWidget[e.widget] || 0) + 1;
            byType[e.type] = (byType[e.type] || 0) + 1;
        });
        return {
            total: this.errors.length,
            today: this.errors.filter(e => e.timestamp >= todayISO).length,
            unresolved: this.getUnresolved().length,
            byWidget, byType
        };
    }
};


// =====================================================
// WIDGET PREFERENCES STORE
// =====================================================
const WidgetPreferences = {
    STORAGE_KEY: 'secureEnergy_widgetPrefs',
    _cache: {},
    _syncTimeout: null,

    init() {
        console.log('[WidgetPreferences] Initializing...');
        this._cache = this.loadFromStorage();
        console.log(`[WidgetPreferences] Loaded preferences for ${Object.keys(this._cache).length} users`);
        return this;
    },

    loadFromStorage() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || {};
        } catch { return {}; }
    },

    saveToStorage() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache));
        } catch (e) { console.error('[WidgetPreferences] Save failed:', e); }
    },

    // Get all preferences for a user
    getForUser(userId) {
        if (!userId) return null;
        return this._cache[userId] || null;
    },

    // Save all preferences for a user
    saveForUser(userId, prefs) {
        if (!userId) return;
        this._cache[userId] = {
            ...prefs,
            lastUpdated: new Date().toISOString()
        };
        this.saveToStorage();
        this._scheduleSyncToGitHub(userId);
    },

    // Get widget order for a user
    getOrder(userId) {
        return this._cache[userId]?.order || [];
    },

    // Save widget order for a user
    saveOrder(userId, orderArray) {
        if (!userId) return;
        if (!this._cache[userId]) this._cache[userId] = {};
        this._cache[userId].order = orderArray;
        this._cache[userId].lastUpdated = new Date().toISOString();
        this.saveToStorage();
        this._scheduleSyncToGitHub(userId);
    },

    // Get config for a specific widget
    getWidgetConfig(userId, widgetId) {
        return this._cache[userId]?.widgets?.[widgetId] || null;
    },

    // Save config for a specific widget
    saveWidgetConfig(userId, widgetId, config) {
        if (!userId || !widgetId) return;
        if (!this._cache[userId]) this._cache[userId] = {};
        if (!this._cache[userId].widgets) this._cache[userId].widgets = {};
        this._cache[userId].widgets[widgetId] = {
            ...this._cache[userId].widgets[widgetId],
            ...config
        };
        this._cache[userId].lastUpdated = new Date().toISOString();
        this.saveToStorage();
        this._scheduleSyncToGitHub(userId);
    },

    // Reset all preferences for a user
    resetForUser(userId) {
        if (!userId) return;
        delete this._cache[userId];
        this.saveToStorage();
        console.log(`[WidgetPreferences] Reset preferences for user ${userId}`);
    },

    // Schedule GitHub sync (debounced)
    _scheduleSyncToGitHub(userId) {
        if (!GitHubSync.hasToken() || !GitHubSync.autoSyncEnabled) return;
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            GitHubSync.syncWidgetPreferences().catch(e => {
                console.warn('[WidgetPreferences] GitHub sync failed:', e.message);
            });
        }, 2000);
    },

    // Merge preferences from GitHub (for cross-device sync)
    mergeFromGitHub(githubPrefs) {
        if (!githubPrefs || typeof githubPrefs !== 'object') return;
        
        Object.keys(githubPrefs).forEach(userId => {
            const remote = githubPrefs[userId];
            const local = this._cache[userId];
            
            // If no local or remote is newer, use remote
            if (!local || (remote.lastUpdated && (!local.lastUpdated || remote.lastUpdated > local.lastUpdated))) {
                this._cache[userId] = remote;
                console.log(`[WidgetPreferences] Updated preferences for user ${userId} from GitHub`);
            }
        });
        
        this.saveToStorage();
    },

    // Export for GitHub sync
    exportForGitHub() {
        return JSON.stringify({
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            preferences: this._cache
        }, null, 2);
    }
};


// =====================================================
// GITHUB SYNC MODULE
// =====================================================
const GitHubSync = {
    TOKEN_KEY: 'secureEnergy_githubToken',
    REPO_OWNER: 'ClemmensSES',
    REPO_NAME: 'SESSalesResources',
    ACTIVITY_PATH: 'data/activity-log.json',
    USERS_PATH: 'data/users.json',
    WIDGET_PREFS_PATH: 'data/widget-preferences.json',
    
    token: null,
    lastSync: null,
    isSyncing: false,
    autoSyncEnabled: true,

    init() {
        console.log('[GitHubSync] Initializing...');
        this.token = sessionStorage.getItem(this.TOKEN_KEY);
        this.lastSync = localStorage.getItem('secureEnergy_lastSync');
        this.autoSyncEnabled = localStorage.getItem('secureEnergy_autoSync') !== 'false';
        if (this.token) console.log('[GitHubSync] Token loaded');
        return this;
    },

    setToken(token) {
        if (!token?.trim()) {
            this.token = null;
            sessionStorage.removeItem(this.TOKEN_KEY);
            return false;
        }
        this.token = token.trim();
        sessionStorage.setItem(this.TOKEN_KEY, this.token);
        return true;
    },

    hasToken() { return !!this.token; },
    clearToken() { this.token = null; sessionStorage.removeItem(this.TOKEN_KEY); },
    setAutoSync(enabled) { this.autoSyncEnabled = enabled; localStorage.setItem('secureEnergy_autoSync', String(enabled)); },

    async testConnection() {
        if (!this.token) return { success: false, error: 'No token configured' };
        try {
            const response = await fetch(`https://api.github.com/repos/${this.REPO_OWNER}/${this.REPO_NAME}`, {
                headers: { 'Authorization': `token ${this.token}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (response.ok) {
                const repo = await response.json();
                return { success: true, repo: repo.full_name, permissions: repo.permissions };
            }
            return { success: false, error: `HTTP ${response.status}` };
        } catch (e) { return { success: false, error: e.message }; }
    },

    async pullLatest() {
        console.log('[GitHubSync] Pulling latest data...');
        try {
            // Pull widget preferences
            await this.pullWidgetPreferences();
            console.log('[GitHubSync] Pull complete');
        } catch (e) {
            console.warn('[GitHubSync] Pull failed:', e.message);
        }
    },

    async pullWidgetPreferences() {
        try {
            const response = await fetch(
                `https://raw.githubusercontent.com/${this.REPO_OWNER}/${this.REPO_NAME}/main/${this.WIDGET_PREFS_PATH}?t=${Date.now()}`
            );
            if (!response.ok) {
                // File may not exist yet - this is OK, silent fail
                if (response.status === 404) {
                    console.log('[GitHubSync] Widget preferences file not found (will be created on first save)');
                }
                return;
            }
            const data = await response.json();
            if (data?.preferences) {
                WidgetPreferences.mergeFromGitHub(data.preferences);
            }
        } catch (e) {
            // Silent fail - file may not exist yet
            console.log('[GitHubSync] Widget prefs fetch skipped:', e.message);
        }
    },

    async syncWidgetPreferences() {
        if (!this.token || this.isSyncing) return { success: false };
        this.isSyncing = true;
        
        try {
            const content = WidgetPreferences.exportForGitHub();
            const result = await this._updateFile(this.WIDGET_PREFS_PATH, content, 'Update widget preferences');
            this.lastSync = new Date().toISOString();
            localStorage.setItem('secureEnergy_lastSync', this.lastSync);
            console.log('[GitHubSync] Widget preferences synced');
            return { success: true };
        } catch (e) {
            console.error('[GitHubSync] Widget prefs sync failed:', e);
            return { success: false, error: e.message };
        } finally {
            this.isSyncing = false;
        }
    },

    async syncActivityLog() {
        if (!this.token || this.isSyncing) return { success: false };
        this.isSyncing = true;
        try {
            const content = ActivityLog.exportForGitHub();
            await this._updateFile(this.ACTIVITY_PATH, content, 'Update activity log');
            this.lastSync = new Date().toISOString();
            localStorage.setItem('secureEnergy_lastSync', this.lastSync);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        } finally { this.isSyncing = false; }
    },

    async syncUsers() {
        if (!this.token || this.isSyncing) return { success: false };
        this.isSyncing = true;
        try {
            const content = UserStore.exportForGitHub();
            await this._updateFile(this.USERS_PATH, content, 'Update users');
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        } finally { this.isSyncing = false; }
    },

    async pushChanges() {
        if (!this.token) return { success: false, error: 'No token' };
        const results = {};
        results.activity = await this.syncActivityLog();
        results.users = await this.syncUsers();
        results.widgetPrefs = await this.syncWidgetPreferences();
        return results;
    },

    async _updateFile(path, content, message) {
        // Get current file SHA
        let sha = null;
        try {
            const getRes = await fetch(`https://api.github.com/repos/${this.REPO_OWNER}/${this.REPO_NAME}/contents/${path}`, {
                headers: { 'Authorization': `token ${this.token}`, 'Accept': 'application/vnd.github.v3+json' }
            });
            if (getRes.ok) {
                const data = await getRes.json();
                sha = data.sha;
            }
        } catch {}

        const body = {
            message: message,
            content: btoa(unescape(encodeURIComponent(content))),
            branch: 'main'
        };
        if (sha) body.sha = sha;

        const putRes = await fetch(`https://api.github.com/repos/${this.REPO_OWNER}/${this.REPO_NAME}/contents/${path}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${this.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            throw new Error(err.message || `HTTP ${putRes.status}`);
        }
        return await putRes.json();
    }
};


// =====================================================
// LMP DATA STORE
// =====================================================
const SecureEnergyData = {
    STORAGE_KEY: 'secureEnergy_lmpData',
    DATA_URL: 'data/lmp-database.json',
    GITHUB_RAW_URL: 'https://raw.githubusercontent.com/ClemmensSES/SESSalesResources/main/data/lmp-database.json',
    lmpData: [],
    _subscribers: [],
    isLoaded: false,

    async init() {
        console.log('[SecureEnergyData] Initializing...');
        const cached = this.loadFromStorage();
        if (cached?.length) {
            this.lmpData = cached;
            this.isLoaded = true;
            console.log(`[SecureEnergyData] ${cached.length} records from cache`);
        }
        try { await this.fetchLatest(); } catch (e) { console.warn('[SecureEnergyData] Fetch failed:', e.message); }
        this.notifySubscribers();
        return this.lmpData;
    },

    async fetchLatest() {
        try {
            const response = await fetch(`${this.GITHUB_RAW_URL}?t=${Date.now()}`);
            if (response.ok) {
                const data = await response.json();
                if (data?.records?.length) {
                    this.lmpData = data.records.map(r => this.normalizeRecord(r));
                    this.isLoaded = true;
                    this.saveToStorage();
                    console.log(`[SecureEnergyData] ${this.lmpData.length} records from GitHub`);
                }
            } else {
                console.warn(`[SecureEnergyData] GitHub fetch returned ${response.status}`);
            }
        } catch (e) { console.warn('[SecureEnergyData] GitHub fetch failed:', e.message); }
    },

    // Normalize field names from CSV export (avg_da_lmp → lmp)
    normalizeRecord(record) {
        return {
            iso: record.iso || record.ISO,
            zone: record.zone || record.Zone || record.ZONE,
            month: record.month || record.Month,
            year: record.year || record.Year,
            lmp: parseFloat(record.lmp || record.LMP || record.avg_da_lmp || record.Avg_DA_LMP || 0),
            peak_lmp: parseFloat(record.peak_lmp || record.Peak_LMP || record.avg_peak_lmp || 0),
            offpeak_lmp: parseFloat(record.offpeak_lmp || record.OffPeak_LMP || record.avg_offpeak_lmp || 0)
        };
    },

    loadFromStorage() { try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; } catch { return []; } },
    saveToStorage() { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.lmpData)); },

    // Primary accessors
    getAll() { return this.lmpData; },
    getRecords() { return this.lmpData; },  // Alias for compatibility with widgets
    getData() { return this.lmpData; },     // Another alias
    getByISO(iso) { return this.lmpData.filter(r => r.iso === iso); },
    getByZone(iso, zone) { return this.lmpData.filter(r => r.iso === iso && r.zone === zone); },
    
    // Get unique zones for an ISO
    getZonesForISO(iso) {
        const zones = [...new Set(this.lmpData.filter(r => r.iso === iso).map(r => r.zone))];
        return zones.sort();
    },

    // Get all unique ISOs
    getISOs() {
        return [...new Set(this.lmpData.map(r => r.iso))].sort();
    },
    
    getStats() {
        const isos = [...new Set(this.lmpData.map(r => r.iso))];
        const byISO = {};
        isos.forEach(iso => {
            byISO[iso] = [...new Set(this.lmpData.filter(r => r.iso === iso).map(r => r.zone))].length;
        });
        return {
            totalRecords: this.lmpData.length,
            isoCount: isos.length,
            isos: isos.sort(),
            zonesByISO: byISO,
            isLoaded: this.isLoaded
        };
    },

    subscribe(callback) { this._subscribers.push(callback); },
    notifySubscribers() { this._subscribers.forEach(cb => cb(this.getStats())); },

    bulkUpdate(records) {
        this.lmpData = records.map(r => this.normalizeRecord(r));
        this.isLoaded = true;
        this.saveToStorage();
        this.notifySubscribers();
        window.postMessage({ type: 'LMP_BULK_UPDATE', count: records.length }, '*');
    },

    // Clear cached data (useful for troubleshooting)
    clearCache() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.lmpData = [];
        this.isLoaded = false;
        console.log('[SecureEnergyData] Cache cleared');
    }
};


// =====================================================
// USER STORE
// =====================================================
const UserStore = {
    STORAGE_KEY: 'secureEnergy_users',
    SESSION_KEY: 'secureEnergy_currentUser',
    GITHUB_USERS_URL: 'https://raw.githubusercontent.com/ClemmensSES/SESSalesResources/main/data/users.json',
    users: [],
    _initialized: false,

    async init() {
        console.log('[UserStore] Initializing...');
        
        // Load local users first (these are our baseline)
        const localUsers = this.loadFromStorage();
        this.users = localUsers.length ? localUsers : [];
        
        // Try to fetch from GitHub and MERGE (not overwrite)
        try {
            const githubLoaded = await this.loadFromGitHub(true); // true = merge mode
            if (githubLoaded) {
                console.log('[UserStore] Merged with GitHub data');
            }
        } catch (e) {
            console.warn('[UserStore] GitHub fetch failed, using local data:', e.message);
        }
        
        // Ensure we have at least the default admin
        if (!this.users.length) {
            this.createDefaultAdmin();
        }
        
        // Always save merged result to localStorage
        this.saveToStorage();
        this._initialized = true;
        
        console.log(`[UserStore] ${this.users.length} users loaded`);
        return this.users;
    },

    async loadFromGitHub(mergeMode = false) {
        try {
            console.log('[UserStore] Fetching users from GitHub...');
            const response = await fetch(this.GITHUB_USERS_URL + '?t=' + Date.now());
            
            if (!response.ok) {
                if (response.status === 404) {
                    console.log('[UserStore] users.json not found on GitHub');
                }
                return false;
            }
            
            const data = await response.json();
            if (data?.users && Array.isArray(data.users)) {
                if (mergeMode && this.users.length > 0) {
                    // Smart merge: compare updatedAt timestamps to keep the most recent version
                    const mergedUsers = [];
                    const processedIds = new Set();
                    
                    // Create lookup maps
                    const localUsersById = new Map(this.users.map(u => [u.id, u]));
                    const localUsersByEmail = new Map(this.users.map(u => [u.email.toLowerCase(), u]));
                    const githubUsersById = new Map(data.users.map(u => [u.id, u]));
                    
                    // Process GitHub users - compare with local versions
                    data.users.forEach(githubUser => {
                        const localUser = localUsersById.get(githubUser.id) || 
                                          localUsersByEmail.get(githubUser.email.toLowerCase());
                        
                        if (localUser) {
                            // User exists in both - keep the one with newer updatedAt
                            const localTime = new Date(localUser.updatedAt || localUser.createdAt || 0).getTime();
                            const githubTime = new Date(githubUser.updatedAt || githubUser.createdAt || 0).getTime();
                            
                            if (localTime > githubTime) {
                                console.log(`[UserStore] Keeping local (newer): ${localUser.email}`);
                                mergedUsers.push(localUser);
                            } else {
                                console.log(`[UserStore] Using GitHub (newer/same): ${githubUser.email}`);
                                mergedUsers.push(githubUser);
                            }
                            processedIds.add(localUser.id);
                        } else {
                            // User only in GitHub
                            mergedUsers.push(githubUser);
                        }
                        processedIds.add(githubUser.id);
                    });
                    
                    // Add local-only users (not in GitHub at all)
                    this.users.forEach(localUser => {
                        if (!processedIds.has(localUser.id)) {
                            console.log(`[UserStore] Keeping local-only user: ${localUser.email}`);
                            mergedUsers.push(localUser);
                        }
                    });
                    
                    this.users = mergedUsers;
                    console.log(`[UserStore] Smart merge complete: ${this.users.length} total users`);
                } else {
                    // Replace mode (used by authenticate to get fresh data)
                    this.users = data.users;
                    console.log(`[UserStore] Loaded ${this.users.length} users from GitHub`);
                }
                return true;
            }
            return false;
        } catch (e) {
            console.warn('[UserStore] GitHub fetch failed:', e.message);
            return false;
        }
    },

    loadFromStorage() { 
        try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; } 
        catch { return []; } 
    },
    
    saveToStorage() { 
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.users)); 
    },

    createDefaultAdmin() {
        this.users.push({
            id: 'admin-001',
            email: 'admin@sesenergy.org',
            password: 'admin123',
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            status: 'active',
            createdAt: new Date().toISOString(),
            permissions: {}
        });
        this.saveToStorage();
        console.log('[UserStore] Default admin created');
    },

    getAll() { return this.users; },
    getById(id) { return this.users.find(u => u.id === id); },
    findByEmail(email) { return this.users.find(u => u.email.toLowerCase() === email.toLowerCase()); },

    create(userData) {
        if (this.findByEmail(userData.email)) return { success: false, error: 'Email already exists' };
        const user = {
            id: 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            email: userData.email,
            password: userData.password,
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: userData.role || 'user',
            status: 'active',
            createdAt: new Date().toISOString(),
            permissions: userData.permissions || {}
        };
        this.users.push(user);
        this.saveToStorage();
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) GitHubSync.syncUsers().catch(() => {});
        return { success: true, user };
    },

    async update(id, updates) {
        const idx = this.users.findIndex(u => u.id === id);
        if (idx === -1) return { success: false, error: 'User not found' };
        if (updates.email && updates.email !== this.users[idx].email) {
            if (this.findByEmail(updates.email)) return { success: false, error: 'Email already exists' };
        }
        this.users[idx] = { ...this.users[idx], ...updates, updatedAt: new Date().toISOString() };
        this.saveToStorage();
        
        // Wait for GitHub sync to complete to ensure data persists
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) {
            try {
                await GitHubSync.syncUsers();
                console.log('[UserStore] User update synced to GitHub');
            } catch (e) {
                console.warn('[UserStore] GitHub sync failed, but local save succeeded:', e.message);
            }
        }
        return { success: true, user: this.users[idx] };
    },

    delete(id) {
        const idx = this.users.findIndex(u => u.id === id);
        if (idx === -1) return { success: false, error: 'User not found' };
        if (this.users[idx].email === 'admin@sesenergy.org') return { success: false, error: 'Cannot delete default admin' };
        this.users.splice(idx, 1);
        this.saveToStorage();
        // Also clean up their widget preferences
        WidgetPreferences.resetForUser(id);
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) GitHubSync.syncUsers().catch(() => {});
        return { success: true };
    },

    /**
     * Authenticate user - Fetches fresh data from GitHub and merges with local
     * This ensures users can log in from any device while preserving local users
     */
    async authenticate(email, password) {
        console.log('[UserStore] Authenticating:', email);
        
        // First check if user exists locally (fast path)
        let user = this.findByEmail(email);
        
        // Always try to refresh from GitHub (merge mode to preserve local users)
        try {
            const refreshed = await this.loadFromGitHub(true); // merge mode
            if (refreshed) {
                this.saveToStorage();
                console.log('[UserStore] Refreshed and merged user list from GitHub');
                // Re-find user in case they came from GitHub
                user = this.findByEmail(email);
            }
        } catch (e) {
            console.warn('[UserStore] GitHub refresh failed, using local data:', e.message);
        }
        
        if (!user) return { success: false, error: 'User not found' };
        if (user.password !== password) return { success: false, error: 'Invalid password' };
        if (user.status !== 'active') return { success: false, error: 'Account inactive' };
        return { success: true, user };
    },

    setCurrentUser(user) {
        const s = { ...user }; delete s.password;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(s));
    },
    
    getCurrentUser() { 
        try { return JSON.parse(localStorage.getItem(this.SESSION_KEY)); } 
        catch { return null; } 
    },
    
    clearSession() { localStorage.removeItem(this.SESSION_KEY); },
    
    exportForGitHub() { 
        return JSON.stringify({ 
            version: '1.0.0', 
            lastUpdated: new Date().toISOString(), 
            users: this.users 
        }, null, 2); 
    }
};


// =====================================================
// ACTIVITY LOG STORE
// =====================================================
const ActivityLog = {
    STORAGE_KEY: 'secureEnergy_activityLog',
    activities: [],
    _syncTimeout: null,

    async init() {
        console.log('[ActivityLog] Initializing...');
        const cached = this.loadFromStorage();
        if (cached?.length) {
            this.activities = cached;
            console.log(`[ActivityLog] ${cached.length} activities from localStorage`);
        }
        try { await this.pullFromGitHub(); } catch (e) { console.warn('[ActivityLog] GitHub pull failed:', e.message); }
        this.activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        this.saveToStorage();
        console.log(`[ActivityLog] ${this.activities.length} total activities`);
        return this.activities;
    },

    async pullFromGitHub() {
        try {
            const response = await fetch(`https://raw.githubusercontent.com/ClemmensSES/SESSalesResources/main/data/activity-log.json?t=${Date.now()}`);
            if (!response.ok) return;
            const data = await response.json();
            if (data?.activities) {
                const localIds = new Set(this.activities.map(a => a.id));
                let added = 0;
                data.activities.forEach(a => {
                    if (!localIds.has(a.id)) { this.activities.push(a); added++; }
                });
                if (added > 0) console.log(`[ActivityLog] Added ${added} activities from GitHub`);
            }
        } catch (e) { console.warn('[ActivityLog] GitHub fetch failed:', e.message); }
    },

    loadFromStorage() { try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; } catch { return []; } },
    saveToStorage() { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.activities)); },

    log(activity) {
        const entry = {
            id: 'act-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            timestamp: new Date().toISOString(),
            userId: activity.userId || null,
            userEmail: activity.userEmail || null,
            userName: activity.userName || null,
            widget: activity.widget || 'unknown',
            action: activity.action || 'unknown',
            clientName: activity.clientName || null,
            data: activity.data || {},
            notes: activity.notes || null
        };
        this.activities.unshift(entry);
        this.saveToStorage();
        
        // Dispatch event so Activity Log UI can auto-refresh
        try {
            window.dispatchEvent(new CustomEvent('activityLogged', { detail: entry }));
        } catch (e) { /* ignore if CustomEvent not supported */ }
        
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) {
            clearTimeout(this._syncTimeout);
            this._syncTimeout = setTimeout(() => GitHubSync.syncActivityLog().catch(() => {}), 3000);
        }
        return entry;
    },

    logLMPAnalysis(params) {
        return this.log({
            userId: params.userId, userEmail: params.userEmail, userName: params.userName,
            widget: 'lmp-comparison', action: 'LMP Analysis', clientName: params.clientName,
            data: { clientName: params.clientName, iso: params.iso, zone: params.zone, startDate: params.startDate, termMonths: params.termMonths, fixedPrice: params.fixedPrice, lmpAdjustment: params.lmpAdjustment, totalAnnualUsage: params.usage || params.totalAnnualUsage, results: params.results }
        });
    },

    logLMPExport(params) {
        return this.log({
            userId: params.userId, userEmail: params.userEmail, userName: params.userName,
            widget: 'lmp-analytics', action: 'LMP Export', clientName: params.clientName,
            data: { exportType: params.exportType, iso: params.iso, zone: params.zone, format: params.format || 'PNG' }
        });
    },

    logAIQuery(params) {
        return this.log({
            userId: params.userId, userEmail: params.userEmail, userName: params.userName,
            widget: 'ai-assistant', action: 'AI Query',
            data: { query: params.query, responseLength: params.responseLength }
        });
    },

    logButtonClick(params) {
        return this.log({
            userId: params.userId, userEmail: params.userEmail, userName: params.userName,
            widget: params.widget || 'portal', action: 'Button Click',
            data: { button: params.button, context: params.context }
        });
    },

    logHistoryExport(params) {
        return this.log({
            userId: params.userId, userEmail: params.userEmail, userName: params.userName,
            widget: 'analysis-history', action: 'History Export',
            data: { recordCount: params.recordCount, format: params.format || 'CSV' }
        });
    },

    getAll() { return this.activities; },
    getByUser(userId) { return this.activities.filter(a => a.userId === userId); },
    getByWidget(widget) { return this.activities.filter(a => a.widget === widget); },
    getByClient(clientName) {
        const lc = clientName.toLowerCase();
        return this.activities.filter(a => a.clientName?.toLowerCase().includes(lc) || a.data?.clientName?.toLowerCase().includes(lc));
    },
    getRecent(count = 50) { return this.activities.slice(0, count); },

    getTodayStart() { const t = new Date(); t.setHours(0, 0, 0, 0); return t.toISOString(); },
    countByAction(action, todayOnly = false) {
        const start = this.getTodayStart();
        return this.activities.filter(a => a.action === action && (!todayOnly || a.timestamp >= start)).length;
    },
    countLogins(todayOnly = false) { return this.countByAction('Login', todayOnly); },
    countLMPAnalyses(todayOnly = false) { return this.countByAction('LMP Analysis', todayOnly); },
    countLMPExports(todayOnly = false) { return this.countByAction('LMP Export', todayOnly); },
    countAIQueries(todayOnly = false) { return this.countByAction('AI Query', todayOnly); },
    countButtonClicks(todayOnly = false) { return this.countByAction('Button Click', todayOnly); },

    getActivityStats() {
        return {
            logins: { today: this.countLogins(true), total: this.countLogins(false) },
            lmpAnalyses: { today: this.countLMPAnalyses(true), total: this.countLMPAnalyses(false) },
            lmpExports: { today: this.countLMPExports(true), total: this.countLMPExports(false) },
            aiQueries: { today: this.countAIQueries(true), total: this.countAIQueries(false) },
            buttonClicks: { today: this.countButtonClicks(true), total: this.countButtonClicks(false) },
            totalActivities: this.activities.length
        };
    },

    exportForGitHub() {
        return JSON.stringify({ version: '2.3.0', lastUpdated: new Date().toISOString(), activities: this.activities }, null, 2);
    }
};


// =====================================================
// INITIALIZATION
// =====================================================
if (typeof window !== 'undefined') {
    window.SecureEnergyData = SecureEnergyData;
    window.UserStore = UserStore;
    window.ActivityLog = ActivityLog;
    window.GitHubSync = GitHubSync;
    window.ErrorLog = ErrorLog;
    window.WidgetPreferences = WidgetPreferences;
    
    ErrorLog.init();
    GitHubSync.init();
    WidgetPreferences.init();
    
    window.resetUserStore = () => { localStorage.removeItem('secureEnergy_users'); localStorage.removeItem('secureEnergy_currentUser'); location.reload(); };
    window.resetActivityLog = () => { localStorage.removeItem('secureEnergy_activityLog'); location.reload(); };
    window.resetErrorLog = () => { ErrorLog.clearAll(); };
    window.resetWidgetPrefs = () => { localStorage.removeItem('secureEnergy_widgetPrefs'); location.reload(); };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SecureEnergyData, UserStore, ActivityLog, GitHubSync, ErrorLog, WidgetPreferences };
}

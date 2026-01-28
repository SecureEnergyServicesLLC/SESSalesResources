/**
 * Secure Energy Shared Data Store v2.2
 * Centralized data management for LMP data, user authentication, and activity logging
 * 
 * v2.2 Updates:
 * - GitHub API sync for cross-user activity persistence
 * - Comprehensive error logging system
 * - Widget error capture via postMessage
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
        // Catch unhandled JS errors
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

        // Catch promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.log({
                type: 'promise',
                widget: 'portal',
                message: event.reason?.message || String(event.reason),
                stack: event.reason?.stack
            });
        });

        // Listen for widget errors via postMessage
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
        } catch (e) {
            return [];
        }
    },

    saveToStorage() {
        try {
            if (this.errors.length > this.MAX_ERRORS) {
                this.errors = this.errors.slice(0, this.MAX_ERRORS);
            }
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.errors));
        } catch (e) {
            console.error('[ErrorLog] Save failed:', e);
        }
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

    clearAll() {
        this.errors = [];
        this.saveToStorage();
    },

    getStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();
        
        const byWidget = {};
        const byType = {};
        this.errors.forEach(e => {
            byWidget[e.widget] = (byWidget[e.widget] || 0) + 1;
            byType[e.type] = (byType[e.type] || 0) + 1;
        });

        return {
            total: this.errors.length,
            today: this.errors.filter(e => e.timestamp >= todayISO).length,
            unresolved: this.getUnresolved().length,
            byWidget,
            byType
        };
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
    
    clearToken() {
        this.token = null;
        sessionStorage.removeItem(this.TOKEN_KEY);
    },

    setAutoSync(enabled) {
        this.autoSyncEnabled = enabled;
        localStorage.setItem('secureEnergy_autoSync', String(enabled));
    },

    async testConnection() {
        if (!this.token) return { success: false, error: 'No token configured' };

        try {
            const response = await fetch(`https://api.github.com/repos/${this.REPO_OWNER}/${this.REPO_NAME}`, {
                headers: { 'Authorization': `token ${this.token}`, 'Accept': 'application/vnd.github.v3+json' }
            });

            if (response.ok) {
                const data = await response.json();
                return { success: true, repo: data.full_name };
            } else if (response.status === 401) {
                return { success: false, error: 'Invalid token' };
            } else if (response.status === 404) {
                return { success: false, error: 'Repository not found' };
            }
            return { success: false, error: `API error: ${response.status}` };
        } catch (e) {
            ErrorLog.log({ type: 'github', widget: 'github-sync', message: 'Connection test failed: ' + e.message });
            return { success: false, error: e.message };
        }
    },

    async getFile(path) {
        if (!this.token) throw new Error('No token');

        const response = await fetch(
            `https://api.github.com/repos/${this.REPO_OWNER}/${this.REPO_NAME}/contents/${path}`,
            { headers: { 'Authorization': `token ${this.token}`, 'Accept': 'application/vnd.github.v3+json' } }
        );

        if (response.status === 404) return { exists: false, content: null, sha: null };
        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const data = await response.json();
        return { exists: true, content: JSON.parse(atob(data.content.replace(/\n/g, ''))), sha: data.sha };
    },

    async saveFile(path, content, message, sha = null) {
        if (!this.token) throw new Error('No token');

        const body = {
            message,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
            branch: 'main'
        };
        if (sha) body.sha = sha;

        const response = await fetch(
            `https://api.github.com/repos/${this.REPO_OWNER}/${this.REPO_NAME}/contents/${path}`,
            {
                method: 'PUT',
                headers: { 'Authorization': `token ${this.token}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }
        );

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || `API error: ${response.status}`);
        }
        return { success: true, sha: (await response.json()).content.sha };
    },

    async syncActivityLog() {
        if (!this.token || this.isSyncing) {
            return { success: false, error: this.isSyncing ? 'Sync in progress' : 'No token' };
        }

        this.isSyncing = true;
        try {
            const remote = await this.getFile(this.ACTIVITY_PATH);
            const local = ActivityLog.getAll();
            
            let merged = [...local];
            if (remote.exists && remote.content?.activities) {
                const localIds = new Set(local.map(a => a.id));
                remote.content.activities.forEach(a => {
                    if (!localIds.has(a.id)) merged.push(a);
                });
                merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            }

            await this.saveFile(this.ACTIVITY_PATH, {
                version: '2.2.0',
                lastUpdated: new Date().toISOString(),
                activities: merged
            }, `Sync activity log - ${new Date().toLocaleString()}`, remote.sha);

            ActivityLog.activities = merged;
            ActivityLog.saveToStorage();
            this.lastSync = new Date().toISOString();
            localStorage.setItem('secureEnergy_lastSync', this.lastSync);

            this.isSyncing = false;
            return { success: true, count: merged.length, lastSync: this.lastSync };
        } catch (e) {
            this.isSyncing = false;
            ErrorLog.log({ type: 'github', widget: 'github-sync', message: 'Activity sync failed: ' + e.message });
            return { success: false, error: e.message };
        }
    },

    async syncUsers() {
        if (!this.token || this.isSyncing) return { success: false, error: 'Not ready' };

        this.isSyncing = true;
        try {
            const remote = await this.getFile(this.USERS_PATH);
            const local = UserStore.getAll();

            await this.saveFile(this.USERS_PATH, {
                version: '2.2.0',
                lastUpdated: new Date().toISOString(),
                users: local
            }, `Sync users - ${new Date().toLocaleString()}`, remote.sha);

            this.isSyncing = false;
            return { success: true, count: local.length };
        } catch (e) {
            this.isSyncing = false;
            ErrorLog.log({ type: 'github', widget: 'github-sync', message: 'User sync failed: ' + e.message });
            return { success: false, error: e.message };
        }
    },

    async pullLatest() {
        try {
            const response = await fetch(
                `https://raw.githubusercontent.com/${this.REPO_OWNER}/${this.REPO_NAME}/main/${this.ACTIVITY_PATH}?t=${Date.now()}`
            );
            if (!response.ok) return { success: false };

            const data = await response.json();
            if (data?.activities) {
                const localIds = new Set(ActivityLog.activities.map(a => a.id));
                data.activities.forEach(a => {
                    if (!localIds.has(a.id)) ActivityLog.activities.push(a);
                });
                ActivityLog.activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                ActivityLog.saveToStorage();
            }
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    getStatus() {
        return {
            hasToken: this.hasToken(),
            autoSyncEnabled: this.autoSyncEnabled,
            lastSync: this.lastSync,
            isSyncing: this.isSyncing
        };
    }
};


// =====================================================
// LMP DATA STORE
// =====================================================
const SecureEnergyData = {
    STORAGE_KEY: 'secureEnergy_LMP_Data',
    DATA_URL: 'data/lmp-database.json',
    GITHUB_RAW_URL: 'https://raw.githubusercontent.com/ClemmensSES/SESSalesResources/main/data/lmp-database.json',
    subscribers: [],
    data: null,
    isLoaded: false,

    async init() {
        console.log('[SecureEnergyData] Initializing...');
        try {
            const cached = this.loadFromStorage();
            if (cached?.records?.length > 0) {
                this.data = cached;
                this.isLoaded = true;
            }
            try { await this.loadFromGitHub(); } catch (e) { console.warn('[SecureEnergyData] GitHub load failed'); }
            this.notifySubscribers();
        } catch (e) {
            ErrorLog.log({ type: 'init', widget: 'data-store', message: 'Init failed: ' + e.message });
        }
        return this.data;
    },

    async loadFromGitHub() {
        for (const url of [this.GITHUB_RAW_URL, this.DATA_URL]) {
            try {
                const response = await fetch(url + '?t=' + Date.now());
                if (!response.ok) continue;
                const jsonData = await response.json();
                if (jsonData?.records?.length > 0) {
                    this.data = { records: jsonData.records, meta: { source: url, loadedAt: new Date().toISOString(), recordCount: jsonData.records.length } };
                    this.isLoaded = true;
                    this.saveToStorage();
                    this.notifySubscribers();
                    return true;
                }
            } catch (e) { /* try next */ }
        }
        return false;
    },

    loadFromStorage() {
        try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)); } catch { return null; }
    },

    saveToStorage() {
        try { if (this.data) localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data)); } catch (e) {
            ErrorLog.log({ type: 'storage', widget: 'data-store', message: 'Save failed: ' + e.message });
        }
    },

    loadFromCSV(csvContent, source = 'CSV Upload') {
        try {
            const lines = csvContent.trim().split('\n');
            if (lines.length < 2) throw new Error('Empty CSV');
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const records = [];

            for (let i = 1; i < lines.length; i++) {
                const values = this.parseCSVLine(lines[i]);
                if (values.length >= headers.length) {
                    const record = {};
                    headers.forEach((h, idx) => record[h] = values[idx]?.trim() || '');
                    const norm = this.normalizeRecord(record);
                    if (norm.iso && norm.zone) records.push(norm);
                }
            }

            if (records.length === 0) throw new Error('No valid records');
            this.data = { records, meta: { source, loadedAt: new Date().toISOString(), recordCount: records.length } };
            this.isLoaded = true;
            this.saveToStorage();
            this.notifySubscribers();
            return { success: true, count: records.length };
        } catch (e) {
            ErrorLog.log({ type: 'parse', widget: 'data-store', message: 'CSV error: ' + e.message });
            return { success: false, error: e.message };
        }
    },

    parseCSVLine(line) {
        const result = []; let current = ''; let inQuotes = false;
        for (const char of line) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
            else current += char;
        }
        result.push(current);
        return result;
    },

    normalizeRecord(r) {
        return {
            iso: r.iso || r.isoname || r.iso_name || '',
            zone: r.zone || r.zonename || r.zone_name || r.pnodename || '',
            zoneId: r.zoneid || r.zone_id || r.pnodeid || '',
            year: r.year || '',
            month: r.month || '',
            lmp: parseFloat(r.lmp || r.avg_da_lmp || r.avgdalmp || r.da_lmp || r.price || r.averagelmp || 0),
            energy: parseFloat(r.energy || r.energycomponent || 0),
            congestion: parseFloat(r.congestion || r.congestioncomponent || 0),
            loss: parseFloat(r.loss || r.losscomponent || 0)
        };
    },

    getRecords() { return this.data?.records || []; },
    getByISO(iso) { return this.getRecords().filter(r => r.iso?.toUpperCase() === iso?.toUpperCase()); },
    getISOs() { return [...new Set(this.getRecords().map(r => r.iso).filter(Boolean))]; },
    getZones(iso) { return [...new Set(this.getByISO(iso).map(r => r.zone).filter(Boolean))].sort(); },
    getYears() { return [...new Set(this.getRecords().map(r => r.year).filter(Boolean))].sort(); },
    getLMPData(iso, zone, year, month = null) {
        return this.getRecords().filter(r => r.iso?.toUpperCase() === iso?.toUpperCase() && r.zone === zone && r.year == year && (month ? r.month == month : true));
    },
    getAverageLMP(iso, zone, year, month = null) {
        const data = this.getLMPData(iso, zone, year, month);
        return data.length ? data.reduce((sum, r) => sum + (r.lmp || 0), 0) / data.length : null;
    },
    getStats() {
        const records = this.getRecords(), isos = this.getISOs(), years = this.getYears();
        return { totalRecords: records.length, isoCount: isos.length, isos, yearRange: years.length ? [years[0], years[years.length - 1]] : null, lastUpdate: this.data?.meta?.loadedAt };
    },
    subscribe(cb) { this.subscribers.push(cb); },
    notifySubscribers() { this.subscribers.forEach(cb => { try { cb(this.data); } catch {} }); },
    exportForGitHub() {
        return JSON.stringify({ version: '1.0.0', lastUpdated: new Date().toISOString(), meta: this.data?.meta || {}, records: this.getRecords() }, null, 2);
    }
};


// =====================================================
// USER STORE
// =====================================================
const UserStore = {
    STORAGE_KEY: 'secureEnergy_users',
    SESSION_KEY: 'secureEnergy_currentUser',
    USERS_URL: 'data/users.json',
    users: [],

    async init() {
        console.log('[UserStore] Initializing...');
        try {
            try { await this.loadFromGitHub(); } catch {}
            const cached = this.loadFromStorage();
            if (cached?.length) {
                const emails = new Set(this.users.map(u => u.email.toLowerCase()));
                cached.forEach(u => { if (!emails.has(u.email.toLowerCase())) this.users.push(u); });
            }
            if (!this.users.some(u => u.email === 'admin@sesenergy.org')) {
                this.users.unshift({
                    id: 'admin-default', email: 'admin@sesenergy.org', password: 'admin123',
                    firstName: 'Admin', lastName: 'User', role: 'admin', status: 'active',
                    createdAt: new Date().toISOString(),
                    permissions: { 'user-admin': true, 'ai-assistant': true, 'lmp-comparison': true, 'lmp-analytics': true, 'analysis-history': true, 'data-manager': true, 'arcadia-fetcher': true }
                });
            }
            this.saveToStorage();
        } catch (e) {
            ErrorLog.log({ type: 'init', widget: 'user-store', message: 'Init failed: ' + e.message });
        }
        return this.users;
    },

    async loadFromGitHub() {
        const response = await fetch(this.USERS_URL + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data?.users) this.users = data.users;
    },

    loadFromStorage() { try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; } catch { return []; } },
    saveToStorage() { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.users)); },
    getAll() { return this.users; },
    findByEmail(email) { return this.users.find(u => u.email.toLowerCase() === email.toLowerCase()); },
    findById(id) { return this.users.find(u => u.id === id); },

    create(userData) {
        if (this.findByEmail(userData.email)) throw new Error('Email exists');
        const newUser = { id: 'user-' + Date.now(), ...userData, status: 'active', createdAt: new Date().toISOString() };
        this.users.push(newUser);
        this.saveToStorage();
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) GitHubSync.syncUsers().catch(() => {});
        return newUser;
    },

    update(id, updates) {
        const idx = this.users.findIndex(u => u.id === id);
        if (idx === -1) throw new Error('User not found');
        if (updates.email && updates.email !== this.users[idx].email && this.findByEmail(updates.email)) throw new Error('Email exists');
        this.users[idx] = { ...this.users[idx], ...updates };
        this.saveToStorage();
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) GitHubSync.syncUsers().catch(() => {});
        return this.users[idx];
    },

    delete(id) {
        const idx = this.users.findIndex(u => u.id === id);
        if (idx === -1) throw new Error('User not found');
        if (this.users[idx].email === 'admin@sesenergy.org') throw new Error('Cannot delete default admin');
        this.users.splice(idx, 1);
        this.saveToStorage();
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) GitHubSync.syncUsers().catch(() => {});
    },

    authenticate(email, password) {
        const user = this.findByEmail(email);
        if (!user) return { success: false, error: 'User not found' };
        if (user.password !== password) return { success: false, error: 'Invalid password' };
        if (user.status !== 'active') return { success: false, error: 'Account inactive' };
        return { success: true, user };
    },

    setCurrentUser(user) {
        const s = { ...user }; delete s.password;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(s));
    },
    getCurrentUser() { try { return JSON.parse(localStorage.getItem(this.SESSION_KEY)); } catch { return null; } },
    clearSession() { localStorage.removeItem(this.SESSION_KEY); },
    exportForGitHub() { return JSON.stringify({ version: '1.0.0', lastUpdated: new Date().toISOString(), users: this.users }, null, 2); }
};


// =====================================================
// ACTIVITY LOG STORE
// =====================================================
const ActivityLog = {
    STORAGE_KEY: 'secureEnergy_activityLog',
    LOG_URL: 'data/activity-log.json',
    activities: [],
    _syncTimeout: null,

    async init() {
        console.log('[ActivityLog] Initializing...');
        
        // Load localStorage FIRST to preserve local data
        const cached = this.loadFromStorage();
        if (cached?.length) {
            this.activities = cached;
            console.log(`[ActivityLog] ${cached.length} activities loaded from localStorage`);
        }
        
        // Then pull from GitHub and merge (adds new items, doesn't overwrite)
        try { 
            await this.pullFromGitHub(); 
        } catch (e) {
            console.warn('[ActivityLog] GitHub pull failed:', e.message);
        }
        
        this.activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        this.saveToStorage();
        console.log(`[ActivityLog] ${this.activities.length} total activities`);
        return this.activities;
    },

    async pullFromGitHub() {
        try {
            const response = await fetch(
                `https://raw.githubusercontent.com/ClemmensSES/SESSalesResources/main/data/activity-log.json?t=${Date.now()}`
            );
            if (!response.ok) return;
            const data = await response.json();
            if (data?.activities) {
                const localIds = new Set(this.activities.map(a => a.id));
                let added = 0;
                data.activities.forEach(a => {
                    if (!localIds.has(a.id)) {
                        this.activities.push(a);
                        added++;
                    }
                });
                if (added > 0) console.log(`[ActivityLog] Added ${added} activities from GitHub`);
            }
        } catch (e) {
            console.warn('[ActivityLog] GitHub fetch failed:', e.message);
        }
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
        
        // Debounced auto-sync
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

    getActivityStats() {
        return {
            logins: { today: this.countLogins(true), total: this.countLogins(false) },
            lmpAnalyses: { today: this.countLMPAnalyses(true), total: this.countLMPAnalyses(false) },
            lmpExports: { today: this.countLMPExports(true), total: this.countLMPExports(false) },
            totalActivities: this.activities.length
        };
    },

    exportForGitHub() {
        return JSON.stringify({ version: '2.2.0', lastUpdated: new Date().toISOString(), activities: this.activities }, null, 2);
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
    
    ErrorLog.init();
    GitHubSync.init();
    
    window.resetUserStore = () => { localStorage.removeItem('secureEnergy_users'); localStorage.removeItem('secureEnergy_currentUser'); location.reload(); };
    window.resetActivityLog = () => { localStorage.removeItem('secureEnergy_activityLog'); location.reload(); };
    window.resetErrorLog = () => { ErrorLog.clearAll(); };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SecureEnergyData, UserStore, ActivityLog, GitHubSync, ErrorLog };
}

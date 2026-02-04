/**
 * Secure Energy Shared Data Store v3.1 (Azure Integration)
 * Centralized data management for LMP data, user authentication, activity logging,
 * widget layout preferences, usage profiles, and support tickets
 * 
 * v3.1 Updates:
 * - ActivityLog now uses Azure-first initialization for cross-device sync
 * - Admin users can now see ALL users' activities (not just their own)
 * - Added ActivityLog.refresh() method to pull latest from Azure
 * - Activities sync to Azure immediately when logged
 * 
 * v3.0 Updates:
 * - MAJOR: Replaced GitHub sync with Azure Blob Storage API
 * - All data now stored/retrieved via AzureDataService
 * - GitHubSync renamed to AzureSync for compatibility
 * - Backwards compatible with existing localStorage fallbacks
 * 
 * REQUIRES: azure-data-service.js loaded BEFORE this file
 */

// =====================================================
// ERROR LOG STORE (unchanged - localStorage only)
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
        if (source.includes('feedback')) return 'feedback';
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
        let userInfo = { userId: null, userName: null, userEmail: null };
        try {
            const sessionData = localStorage.getItem('secureEnergy_currentUser');
            if (sessionData) {
                const user = JSON.parse(sessionData);
                userInfo = {
                    userId: user.id || null,
                    userName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : null,
                    userEmail: user.email || null
                };
            }
        } catch (e) { /* ignore */ }
        
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
            userId: error.userId || userInfo.userId,
            userName: error.userName || userInfo.userName,
            userEmail: error.userEmail || userInfo.userEmail,
            resolved: false
        };
        this.errors.unshift(entry);
        this.saveToStorage();
        console.error(`[ErrorLog] ${entry.widget}:`, entry.message);
        return entry;
    },
    
    getErrorExplanation(message) {
        if (!message) return null;
        const msg = message.toLowerCase();
        
        if (msg.includes("can't find variable") || msg.includes("is not defined")) {
            const varMatch = message.match(/(?:Can't find variable|ReferenceError):\s*(\w+)/i);
            const varName = varMatch ? varMatch[1] : 'unknown';
            return `The code tried to use "${varName}" but it doesn't exist.`;
        }
        if (msg.includes("is not a function")) return "Code tried to call something as a function that isn't one.";
        if (msg.includes("cannot read property") || msg.includes("cannot read properties of")) return "Code tried to access a property on null or undefined.";
        if (msg.includes("failed to fetch") || msg.includes("networkerror")) return "Network request failed.";
        if (msg.includes("401") || msg.includes("unauthorized")) return "Authentication required or failed.";
        if (msg.includes("403") || msg.includes("forbidden")) return "Access denied.";
        if (msg.includes("404") || msg.includes("not found")) return "Resource not found.";
        return null;
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
// USAGE PROFILE STORE (Azure Integration)
// =====================================================
const UsageProfileStore = {
    STORAGE_KEY: 'secureEnergy_usageProfiles',
    ACTIVE_KEY: 'secureEnergy_activeUsageProfile',
    profiles: [],
    activeProfileId: null,
    _subscribers: [],
    _syncTimeout: null,
    _initialized: false,

    async init() {
        console.log('[UsageProfileStore] Initializing...');
        
        // Load local profiles first (baseline)
        const localProfiles = this.loadFromStorage();
        this.profiles = localProfiles.length ? localProfiles : [];
        this.activeProfileId = localStorage.getItem(this.ACTIVE_KEY) || null;
        
        // Try to fetch from Azure and merge
        if (typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
            try {
                const azureProfiles = await AzureDataService.get('usage-profiles.json');
                if (azureProfiles?.profiles && Array.isArray(azureProfiles.profiles)) {
                    this._mergeProfiles(azureProfiles.profiles);
                    console.log('[UsageProfileStore] Merged with Azure data');
                } else if (Array.isArray(azureProfiles)) {
                    this._mergeProfiles(azureProfiles);
                    console.log('[UsageProfileStore] Merged with Azure data (array format)');
                }
            } catch (e) {
                console.warn('[UsageProfileStore] Azure fetch failed, using local data:', e.message);
            }
        }
        
        this.saveToStorage();
        this._initialized = true;
        console.log(`[UsageProfileStore] ${this.profiles.length} profiles loaded, active: ${this.activeProfileId}`);
        return this.profiles;
    },

    _mergeProfiles(remoteProfiles) {
        const mergedProfiles = [];
        const processedIds = new Set();
        const localProfilesById = new Map(this.profiles.map(p => [p.id, p]));
        
        remoteProfiles.forEach(remoteProfile => {
            const localProfile = localProfilesById.get(remoteProfile.id);
            
            if (localProfile) {
                const localTime = new Date(localProfile.updatedAt || localProfile.createdAt || 0).getTime();
                const remoteTime = new Date(remoteProfile.updatedAt || remoteProfile.createdAt || 0).getTime();
                
                if (localTime > remoteTime) {
                    mergedProfiles.push(localProfile);
                } else {
                    mergedProfiles.push(remoteProfile);
                }
                processedIds.add(localProfile.id);
            } else {
                mergedProfiles.push(remoteProfile);
            }
            processedIds.add(remoteProfile.id);
        });
        
        // Add local-only profiles
        this.profiles.forEach(localProfile => {
            if (!processedIds.has(localProfile.id)) {
                mergedProfiles.push(localProfile);
            }
        });
        
        this.profiles = mergedProfiles;
    },

    loadFromStorage() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
        } catch { return []; }
    },

    saveToStorage() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.profiles));
            if (this.activeProfileId) {
                localStorage.setItem(this.ACTIVE_KEY, this.activeProfileId);
            } else {
                localStorage.removeItem(this.ACTIVE_KEY);
            }
        } catch (e) { console.error('[UsageProfileStore] Save failed:', e); }
    },

    async create(profileData) {
        const profile = {
            id: 'profile-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            name: profileData.name || 'Unnamed Profile',
            clientId: profileData.clientId || null,
            clientName: profileData.clientName || null,
            accountId: profileData.accountId || null,
            accountName: profileData.accountName || null,
            electricUsage: profileData.electricUsage || profileData.electric || Array(12).fill(0),
            gasUsage: profileData.gasUsage || profileData.gas || Array(12).fill(0),
            totalElectric: profileData.totalElectric || (profileData.electricUsage || profileData.electric || []).reduce((a, b) => a + b, 0),
            totalGas: profileData.totalGas || (profileData.gasUsage || profileData.gas || []).reduce((a, b) => a + b, 0),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: profileData.createdBy || null,
            createdByEmail: profileData.createdByEmail || null,
            notes: profileData.notes || ''
        };
        this.profiles.push(profile);
        this.saveToStorage();
        this._notifySubscribers();
        this._broadcastProfileChange(profile, 'created');
        this._scheduleSyncToAzure();
        
        console.log(`[UsageProfileStore] Created profile: ${profile.name} (${profile.id})`);
        return { success: true, profile };
    },

    async update(id, updates) {
        const idx = this.profiles.findIndex(p => p.id === id);
        if (idx === -1) return { success: false, error: 'Profile not found' };
        
        if (updates.electricUsage || updates.electric) {
            const elec = updates.electricUsage || updates.electric;
            updates.electricUsage = elec;
            updates.totalElectric = elec.reduce((a, b) => a + b, 0);
        }
        if (updates.gasUsage || updates.gas) {
            const gas = updates.gasUsage || updates.gas;
            updates.gasUsage = gas;
            updates.totalGas = gas.reduce((a, b) => a + b, 0);
        }
        
        this.profiles[idx] = {
            ...this.profiles[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        this.saveToStorage();
        this._notifySubscribers();
        this._broadcastProfileChange(this.profiles[idx], 'updated');
        this._scheduleSyncToAzure();
        
        console.log(`[UsageProfileStore] Updated profile: ${this.profiles[idx].name}`);
        return { success: true, profile: this.profiles[idx] };
    },

    async delete(id) {
        const idx = this.profiles.findIndex(p => p.id === id);
        if (idx === -1) return { success: false, error: 'Profile not found' };
        
        const profile = this.profiles[idx];
        this.profiles.splice(idx, 1);
        
        if (this.activeProfileId === id) {
            this.activeProfileId = null;
        }
        
        this.saveToStorage();
        this._notifySubscribers();
        this._scheduleSyncToAzure();
        
        return { success: true };
    },

    getAll() { return this.profiles; },
    getById(id) { return this.profiles.find(p => p.id === id); },
    getByClientId(clientId) { return this.profiles.filter(p => p.clientId === clientId); },
    
    getByContext(clientId, accountId = null) {
        if (accountId) {
            const accountProfile = this.profiles.find(p => p.clientId === clientId && p.accountId === accountId);
            if (accountProfile) return accountProfile;
        }
        return this.profiles.find(p => p.clientId === clientId && !p.accountId);
    },
    
    getContextKey(clientId, accountId = null) {
        return accountId ? `${clientId}_${accountId}` : clientId;
    },
    
    async createOrUpdateByContext(clientId, accountId, profileData) {
        if (!clientId) return { success: false, error: 'Client ID is required' };
        
        const existing = accountId 
            ? this.profiles.find(p => p.clientId === clientId && p.accountId === accountId)
            : this.profiles.find(p => p.clientId === clientId && !p.accountId);
        
        if (existing) {
            return await this.update(existing.id, { ...profileData, clientId, accountId: accountId || null });
        } else {
            return await this.create({
                ...profileData,
                clientId,
                accountId: accountId || null,
                name: profileData.name || this._generateProfileName(profileData.clientName, profileData.accountName)
            });
        }
    },
    
    _generateProfileName(clientName, accountName) {
        if (accountName && clientName) return `${clientName} → ${accountName}`;
        return clientName || 'Usage Profile';
    },

    getStandalone() { return this.profiles.filter(p => !p.clientId); },

    setActiveProfile(id) {
        const profile = this.getById(id);
        if (!profile) return { success: false, error: 'Profile not found' };
        
        this.activeProfileId = id;
        this.saveToStorage();
        this._notifySubscribers();
        this._broadcastProfileChange(profile);
        
        console.log(`[UsageProfileStore] Active profile set: ${profile.name}`);
        return { success: true, profile };
    },

    clearActiveProfile() {
        this.activeProfileId = null;
        this.saveToStorage();
        this._notifySubscribers();
        this._broadcastProfileChange(null);
        console.log('[UsageProfileStore] Active profile cleared');
    },

    getActiveProfile() {
        if (!this.activeProfileId) return null;
        return this.getById(this.activeProfileId);
    },

    getActiveProfileId() { return this.activeProfileId; },

    subscribe(callback) {
        this._subscribers.push(callback);
        return () => {
            this._subscribers = this._subscribers.filter(cb => cb !== callback);
        };
    },

    _notifySubscribers() {
        this._subscribers.forEach(cb => {
            try {
                cb({ profiles: this.profiles, activeProfile: this.getActiveProfile(), activeProfileId: this.activeProfileId });
            } catch (e) { console.error('[UsageProfileStore] Subscriber error:', e); }
        });
    },

    _broadcastProfileChange(profile, action = 'changed') {
        const message = {
            type: 'USAGE_PROFILE_CHANGED',
            profile: profile,
            profileId: profile?.id || null,
            clientId: profile?.clientId || null,
            accountId: profile?.accountId || null,
            action: action
        };
        
        if (window.parent !== window) {
            window.parent.postMessage(message, '*');
        }
        
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try { iframe.contentWindow.postMessage(message, '*'); } catch (e) { }
        });
        
        try { window.dispatchEvent(new CustomEvent('usageProfileChanged', { detail: message })); } catch (e) { }
    },

    async createFromClient(clientData) {
        if (!clientData) return { success: false, error: 'No client data provided' };
        
        const existing = this.getByClientId(clientData.id);
        if (existing.length > 0) {
            return await this.update(existing[0].id, {
                name: clientData.name + ' - Usage Profile',
                clientName: clientData.name,
                electricUsage: clientData.usageProfile?.electric || clientData.electricUsage || Array(12).fill(0),
                gasUsage: clientData.usageProfile?.gas || clientData.gasUsage || Array(12).fill(0)
            });
        }
        
        return await this.create({
            name: clientData.name + ' - Usage Profile',
            clientId: clientData.id,
            clientName: clientData.name,
            electricUsage: clientData.usageProfile?.electric || clientData.electricUsage || Array(12).fill(0),
            gasUsage: clientData.usageProfile?.gas || clientData.gasUsage || Array(12).fill(0)
        });
    },

    _scheduleSyncToAzure() {
        if (typeof AzureDataService === 'undefined' || !AzureDataService.isConfigured()) return;
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            AzureDataService.save('usage-profiles.json', {
                version: '1.0.0',
                lastUpdated: new Date().toISOString(),
                profiles: this.profiles
            }).catch(e => console.warn('[UsageProfileStore] Azure sync failed:', e.message));
        }, 2000);
    },

    // Backwards compatibility - merge from remote data
    mergeFromGitHub(githubProfiles) {
        this._mergeProfiles(githubProfiles);
        this.saveToStorage();
        this._notifySubscribers();
    },

    exportForGitHub() {
        return JSON.stringify({
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            profiles: this.profiles
        }, null, 2);
    },

    getStats() {
        return {
            total: this.profiles.length,
            standalone: this.getStandalone().length,
            clientLinked: this.profiles.filter(p => p.clientId).length,
            hasActive: !!this.activeProfileId
        };
    }
};


// =====================================================
// WIDGET PREFERENCES STORE (Azure Integration)
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
        try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || {}; } catch { return {}; }
    },

    saveToStorage() {
        try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache)); } 
        catch (e) { console.error('[WidgetPreferences] Save failed:', e); }
    },

    getForUser(userId) {
        if (!userId) return null;
        return this._cache[userId] || null;
    },

    saveForUser(userId, prefs) {
        if (!userId) return;
        this._cache[userId] = { ...prefs, lastUpdated: new Date().toISOString() };
        this.saveToStorage();
        this._scheduleSyncToAzure();
    },

    getOrder(userId) { return this._cache[userId]?.order || []; },

    saveOrder(userId, orderArray) {
        if (!userId) return;
        if (!this._cache[userId]) this._cache[userId] = {};
        this._cache[userId].order = orderArray;
        this._cache[userId].lastUpdated = new Date().toISOString();
        this.saveToStorage();
        this._scheduleSyncToAzure();
    },

    getWidgetConfig(userId, widgetId) { return this._cache[userId]?.widgets?.[widgetId] || null; },

    saveWidgetConfig(userId, widgetId, config) {
        if (!userId || !widgetId) return;
        if (!this._cache[userId]) this._cache[userId] = {};
        if (!this._cache[userId].widgets) this._cache[userId].widgets = {};
        this._cache[userId].widgets[widgetId] = { ...this._cache[userId].widgets[widgetId], ...config };
        this._cache[userId].lastUpdated = new Date().toISOString();
        this.saveToStorage();
        this._scheduleSyncToAzure();
    },

    resetForUser(userId) {
        if (!userId) return;
        delete this._cache[userId];
        this.saveToStorage();
        console.log(`[WidgetPreferences] Reset preferences for user ${userId}`);
    },

    _scheduleSyncToAzure() {
        if (typeof AzureDataService === 'undefined' || !AzureDataService.isConfigured()) return;
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            AzureDataService.save('widget-preferences.json', {
                version: '1.0.0',
                lastUpdated: new Date().toISOString(),
                preferences: this._cache
            }).catch(e => console.warn('[WidgetPreferences] Azure sync failed:', e.message));
        }, 2000);
    },

    mergeFromGitHub(githubPrefs) {
        if (!githubPrefs || typeof githubPrefs !== 'object') return;
        Object.keys(githubPrefs).forEach(userId => {
            const remote = githubPrefs[userId];
            const local = this._cache[userId];
            if (!local || (remote.lastUpdated && (!local.lastUpdated || remote.lastUpdated > local.lastUpdated))) {
                this._cache[userId] = remote;
            }
        });
        this.saveToStorage();
    },

    exportForGitHub() {
        return JSON.stringify({
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            preferences: this._cache
        }, null, 2);
    }
};


// =====================================================
// AZURE SYNC MODULE (Replaces GitHubSync)
// =====================================================
const GitHubSync = {
    // Keeping the name for backwards compatibility
    lastSync: null,
    isSyncing: false,
    autoSyncEnabled: true,

    init() {
        console.log('[AzureSync] Initializing...');
        this.lastSync = localStorage.getItem('secureEnergy_lastSync');
        this.autoSyncEnabled = localStorage.getItem('secureEnergy_autoSync') !== 'false';
        return this;
    },

    // Check if Azure is configured (replaces hasToken)
    hasToken() {
        return typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured();
    },

    setAutoSync(enabled) {
        this.autoSyncEnabled = enabled;
        localStorage.setItem('secureEnergy_autoSync', String(enabled));
    },

    async testConnection() {
        if (!this.hasToken()) return { success: false, error: 'Azure API not configured' };
        try {
            await AzureDataService.getUsers({ bypassCache: true });
            return { success: true, message: 'Azure connection successful' };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    async pullLatest() {
        console.log('[AzureSync] Pulling latest data...');
        try {
            await this.pullWidgetPreferences();
            await this.pullUsageProfiles();
            await this.pullTickets();
            console.log('[AzureSync] Pull complete');
        } catch (e) {
            console.warn('[AzureSync] Pull failed:', e.message);
        }
    },

    async pullWidgetPreferences() {
        if (!this.hasToken()) return;
        try {
            const data = await AzureDataService.get('widget-preferences.json');
            if (data?.preferences) {
                WidgetPreferences.mergeFromGitHub(data.preferences);
            }
        } catch (e) {
            console.log('[AzureSync] Widget prefs fetch skipped:', e.message);
        }
    },

    async pullUsageProfiles() {
        if (!this.hasToken()) return;
        try {
            const data = await AzureDataService.get('usage-profiles.json');
            if (data?.profiles) {
                UsageProfileStore.mergeFromGitHub(data.profiles);
            }
        } catch (e) {
            console.log('[AzureSync] Usage profiles fetch skipped:', e.message);
        }
    },

    async pullTickets() {
        if (!this.hasToken()) return;
        try {
            const data = await AzureDataService.get('tickets.json');
            if (data?.tickets) {
                TicketStore.mergeFromGitHub(data.tickets);
            }
        } catch (e) {
            console.log('[AzureSync] Tickets fetch skipped:', e.message);
        }
    },

    async syncWidgetPreferences() {
        if (!this.hasToken() || this.isSyncing) return { success: false };
        this.isSyncing = true;
        try {
            await AzureDataService.save('widget-preferences.json', JSON.parse(WidgetPreferences.exportForGitHub()));
            this.lastSync = new Date().toISOString();
            localStorage.setItem('secureEnergy_lastSync', this.lastSync);
            console.log('[AzureSync] Widget preferences synced');
            return { success: true };
        } catch (e) {
            console.error('[AzureSync] Widget prefs sync failed:', e);
            return { success: false, error: e.message };
        } finally {
            this.isSyncing = false;
        }
    },

    async syncUsageProfiles() {
        if (!this.hasToken() || this.isSyncing) return { success: false };
        this.isSyncing = true;
        try {
            await AzureDataService.save('usage-profiles.json', JSON.parse(UsageProfileStore.exportForGitHub()));
            this.lastSync = new Date().toISOString();
            localStorage.setItem('secureEnergy_lastSync', this.lastSync);
            console.log('[AzureSync] Usage profiles synced');
            return { success: true };
        } catch (e) {
            console.error('[AzureSync] Usage profiles sync failed:', e);
            return { success: false, error: e.message };
        } finally {
            this.isSyncing = false;
        }
    },

    async syncActivityLog() {
        if (!this.hasToken() || this.isSyncing) return { success: false };
        this.isSyncing = true;
        try {
            await AzureDataService.save('activity-log.json', JSON.parse(ActivityLog.exportForGitHub()));
            this.lastSync = new Date().toISOString();
            localStorage.setItem('secureEnergy_lastSync', this.lastSync);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        } finally { this.isSyncing = false; }
    },

    async syncUsers() {
        if (!this.hasToken() || this.isSyncing) return { success: false };
        this.isSyncing = true;
        try {
            await AzureDataService.save('users.json', JSON.parse(UserStore.exportForGitHub()));
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        } finally { this.isSyncing = false; }
    },

    async syncTickets() {
        if (!this.hasToken() || this.isSyncing) return { success: false };
        this.isSyncing = true;
        try {
            await AzureDataService.save('tickets.json', JSON.parse(TicketStore.exportForGitHub()));
            this.lastSync = new Date().toISOString();
            localStorage.setItem('secureEnergy_lastSync', this.lastSync);
            console.log('[AzureSync] Tickets synced');
            return { success: true };
        } catch (e) {
            console.error('[AzureSync] Tickets sync failed:', e);
            return { success: false, error: e.message };
        } finally {
            this.isSyncing = false;
        }
    },

    async pushChanges() {
        if (!this.hasToken()) return { success: false, error: 'Not configured' };
        const results = {};
        results.activity = await this.syncActivityLog();
        results.users = await this.syncUsers();
        results.widgetPrefs = await this.syncWidgetPreferences();
        results.usageProfiles = await this.syncUsageProfiles();
        results.tickets = await this.syncTickets();
        return results;
    },

    // Legacy method kept for compatibility
    async _updateFile(path, content, message) {
        const filename = path.split('/').pop();
        return await AzureDataService.save(filename, JSON.parse(content));
    },

    // Legacy token methods (no-op, Azure uses API keys)
    setToken(token) { console.warn('[AzureSync] setToken deprecated - use AzureDataService.setApiKey'); return true; },
    clearToken() { console.warn('[AzureSync] clearToken deprecated - use AzureDataService.clearApiKey'); }
};

// Alias for new name
const AzureSync = GitHubSync;


// =====================================================
// LMP DATA STORE (Azure Integration)
// =====================================================
const SecureEnergyData = {
    STORAGE_KEY: 'secureEnergy_lmpData',
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
        if (typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
            try {
                const data = await AzureDataService.get('lmp-database.json');
                if (data?.records?.length) {
                    this.lmpData = data.records.map(r => this.normalizeRecord(r));
                    this.isLoaded = true;
                    this.saveToStorage();
                    console.log(`[SecureEnergyData] ${this.lmpData.length} records from Azure`);
                    return;
                }
            } catch (e) {
                console.warn('[SecureEnergyData] Azure fetch failed:', e.message);
            }
        }
        
        // Fallback to direct file fetch (for local development)
        try {
            const response = await fetch(`data/lmp-database.json?t=${Date.now()}`);
            if (response.ok) {
                const data = await response.json();
                if (data?.records?.length) {
                    this.lmpData = data.records.map(r => this.normalizeRecord(r));
                    this.isLoaded = true;
                    this.saveToStorage();
                    console.log(`[SecureEnergyData] ${this.lmpData.length} records from local file`);
                }
            }
        } catch (e) {
            console.warn('[SecureEnergyData] Local fetch failed:', e.message);
        }
    },

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

    getAll() { return this.lmpData; },
    getRecords() { return this.lmpData; },
    getData() { return this.lmpData; },
    getByISO(iso) { return this.lmpData.filter(r => r.iso === iso); },
    getByZone(zone) { return this.lmpData.filter(r => r.zone === zone); },
    getByYear(year) { return this.lmpData.filter(r => String(r.year) === String(year)); },
    getZonesForISO(iso) { return [...new Set(this.getByISO(iso).map(r => r.zone))].sort(); },
    getAvailableISOs() { return [...new Set(this.lmpData.map(r => r.iso))].sort(); },
    
    getStats() {
        const isos = [...new Set(this.lmpData.map(r => r.iso))];
        const byISO = {};
        isos.forEach(iso => {
            byISO[iso] = [...new Set(this.lmpData.filter(r => r.iso === iso).map(r => r.zone))].length;
        });
        return { totalRecords: this.lmpData.length, isoCount: isos.length, isos: isos.sort(), zonesByISO: byISO, isLoaded: this.isLoaded };
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

    clearCache() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.lmpData = [];
        this.isLoaded = false;
        console.log('[SecureEnergyData] Cache cleared');
    }
};


// =====================================================
// USER STORE (Azure Integration)
// =====================================================
const UserStore = {
    STORAGE_KEY: 'secureEnergy_users',
    SESSION_KEY: 'secureEnergy_currentUser',
    users: [],
    _initialized: false,

    async init() {
        console.log('[UserStore] Initializing...');
        
        const localUsers = this.loadFromStorage();
        this.users = localUsers.length ? localUsers : [];
        
        // Try to fetch from Azure and merge
        if (typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
            try {
                const data = await AzureDataService.get('users.json');
                if (data?.users && Array.isArray(data.users)) {
                    this._mergeUsers(data.users);
                    console.log('[UserStore] Merged with Azure data');
                }
            } catch (e) {
                console.warn('[UserStore] Azure fetch failed, using local data:', e.message);
            }
        }
        
        if (!this.users.length) {
            this.createDefaultAdmin();
        }
        
        this.saveToStorage();
        this._initialized = true;
        
        console.log(`[UserStore] ${this.users.length} users loaded`);
        return this.users;
    },

    _mergeUsers(remoteUsers) {
        const mergedUsers = [];
        const processedIds = new Set();
        const localUsersById = new Map(this.users.map(u => [u.id, u]));
        const localUsersByEmail = new Map(this.users.map(u => [u.email.toLowerCase(), u]));
        
        remoteUsers.forEach(remoteUser => {
            const localUser = localUsersById.get(remoteUser.id) || localUsersByEmail.get(remoteUser.email.toLowerCase());
            
            if (localUser) {
                const localTime = new Date(localUser.updatedAt || localUser.createdAt || 0).getTime();
                const remoteTime = new Date(remoteUser.updatedAt || remoteUser.createdAt || 0).getTime();
                
                if (localTime > remoteTime) {
                    mergedUsers.push(localUser);
                } else {
                    mergedUsers.push(remoteUser);
                }
                processedIds.add(localUser.id);
            } else {
                mergedUsers.push(remoteUser);
            }
            processedIds.add(remoteUser.id);
        });
        
        this.users.forEach(localUser => {
            if (!processedIds.has(localUser.id)) {
                mergedUsers.push(localUser);
            }
        });
        
        this.users = mergedUsers;
    },

    createDefaultAdmin() {
        const admin = {
            id: 'admin-' + Date.now(),
            email: 'admin@sesenergy.org',
            password: 'admin123',
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            permissions: {}
        };
        this.users.push(admin);
        console.log('[UserStore] Created default admin user');
    },

    loadFromStorage() { try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; } catch { return []; } },
    saveToStorage() { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.users)); },

    async authenticate(email, password) {
        // Refresh from Azure before authenticating
        if (typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
            try {
                const data = await AzureDataService.get('users.json');
                if (data?.users) {
                    this._mergeUsers(data.users);
                    this.saveToStorage();
                }
            } catch (e) { /* proceed with cached data */ }
        }
        
        const user = this.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
        if (user) {
            const sessionUser = { ...user };
            delete sessionUser.password;
            localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionUser));
            return { success: true, user: sessionUser };
        }
        return { success: false, error: 'Invalid credentials' };
    },

    getSession() { try { return JSON.parse(localStorage.getItem(this.SESSION_KEY)); } catch { return null; } },
    clearSession() { localStorage.removeItem(this.SESSION_KEY); },
    
    // Current user management (used by main.js)
    getCurrentUser() { return this.getSession(); },
    setCurrentUser(user) {
        if (user) {
            const sessionUser = { ...user };
            delete sessionUser.password;
            localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionUser));
            // Also notify ClientStore if available
            if (typeof SecureEnergyClients !== 'undefined' && SecureEnergyClients.setCurrentUser) {
                SecureEnergyClients.setCurrentUser(user.id);
            }
        } else {
            this.clearSession();
        }
        return user;
    },

    create(userData) {
        if (this.users.some(u => u.email.toLowerCase() === userData.email.toLowerCase())) {
            return { success: false, error: 'Email already exists' };
        }
        const newUser = {
            id: 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            ...userData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.users.push(newUser);
        this.saveToStorage();
        this._scheduleSyncToAzure();
        return { success: true, user: newUser };
    },

    update(userId, updates) {
        const idx = this.users.findIndex(u => u.id === userId);
        if (idx === -1) return { success: false, error: 'User not found' };
        
        this.users[idx] = { ...this.users[idx], ...updates, updatedAt: new Date().toISOString() };
        this.saveToStorage();
        this._scheduleSyncToAzure();
        
        // Update session if current user
        const session = this.getSession();
        if (session?.id === userId) {
            const sessionUser = { ...this.users[idx] };
            delete sessionUser.password;
            localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionUser));
        }
        
        return { success: true, user: this.users[idx] };
    },

    delete(userId) {
        const idx = this.users.findIndex(u => u.id === userId);
        if (idx === -1) return { success: false, error: 'User not found' };
        this.users.splice(idx, 1);
        this.saveToStorage();
        this._scheduleSyncToAzure();
        return { success: true };
    },

    getAll() { return this.users.map(u => { const user = { ...u }; delete user.password; return user; }); },
    getById(userId) { const user = this.users.find(u => u.id === userId); if (user) { const u = { ...user }; delete u.password; return u; } return null; },
    getByEmail(email) { const user = this.users.find(u => u.email.toLowerCase() === email.toLowerCase()); if (user) { const u = { ...user }; delete u.password; return u; } return null; },
    getByRole(role) { return this.users.filter(u => u.role === role).map(u => { const user = { ...u }; delete user.password; return user; }); },

    _scheduleSyncToAzure() {
        if (typeof AzureDataService === 'undefined' || !AzureDataService.isConfigured()) return;
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            AzureDataService.save('users.json', JSON.parse(this.exportForGitHub()))
                .catch(e => console.warn('[UserStore] Azure sync failed:', e.message));
        }, 2000);
    },

    // Legacy compatibility
    async loadFromGitHub(mergeMode = false) {
        if (typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
            try {
                const data = await AzureDataService.get('users.json');
                if (data?.users) {
                    if (mergeMode) {
                        this._mergeUsers(data.users);
                    } else {
                        this.users = data.users;
                    }
                    return true;
                }
            } catch (e) {
                console.warn('[UserStore] Azure fetch failed:', e.message);
            }
        }
        return false;
    },

    exportForGitHub() {
        return JSON.stringify({
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            users: this.users
        }, null, 2);
    }
};


// =====================================================
// ACTIVITY LOG (Azure Integration)
// =====================================================
const ActivityLog = {
    STORAGE_KEY: 'secureEnergy_activityLog',
    MAX_ENTRIES: 500,
    entries: [],
    _syncTimeout: null,
    _initialized: false,

    async init() {
        console.log('[ActivityLog] Initializing...');
        
        // Load local entries first (baseline)
        this.entries = this.loadFromStorage();
        
        // Try to fetch from Azure and MERGE (for cross-device sync)
        if (typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
            try {
                const data = await AzureDataService.get('activity-log.json');
                if (data?.activities && Array.isArray(data.activities)) {
                    this._mergeActivities(data.activities);
                    console.log('[ActivityLog] Merged with Azure data');
                }
            } catch (e) {
                console.warn('[ActivityLog] Azure fetch failed, using local data:', e.message);
            }
        }
        
        // Save merged result to localStorage
        this.saveToStorage();
        this._initialized = true;
        
        console.log(`[ActivityLog] ${this.entries.length} entries loaded`);
        return this.entries;
    },
    
    _mergeActivities(remoteActivities) {
        // Create a map of existing entries by ID
        const localEntriesById = new Map(this.entries.map(e => [e.id, e]));
        
        // Add remote entries that don't exist locally
        let added = 0;
        remoteActivities.forEach(remoteEntry => {
            if (!localEntriesById.has(remoteEntry.id)) {
                this.entries.push(remoteEntry);
                added++;
            }
        });
        
        // Sort by timestamp (newest first)
        this.entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Trim to max entries
        if (this.entries.length > this.MAX_ENTRIES) {
            this.entries = this.entries.slice(0, this.MAX_ENTRIES);
        }
        
        console.log(`[ActivityLog] Merged ${added} activities from Azure`);
    },

    loadFromStorage() { try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || []; } catch { return []; } },
    saveToStorage() { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.entries.slice(0, this.MAX_ENTRIES))); },

    log(action, details = {}) {
        const session = UserStore.getSession();
        const entry = {
            id: 'act-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            timestamp: new Date().toISOString(),
            action,
            userId: session?.id || null,
            userName: session ? `${session.firstName} ${session.lastName}` : 'System',
            userEmail: session?.email || null,
            ...details
        };
        this.entries.unshift(entry);
        this.saveToStorage();
        
        // Sync to Azure for cross-device availability
        this._scheduleSyncToAzure();
        
        try { window.dispatchEvent(new CustomEvent('activityLogged', { detail: entry })); } catch (e) { }
        
        return entry;
    },
    
    // Log an LMP Analysis activity
    logLMPAnalysis(data) {
        // Use passed user info OR fall back to session
        const session = UserStore.getSession();
        const userId = data.userId || session?.id || null;
        const userName = data.userName || (session ? `${session.firstName} ${session.lastName}` : 'System');
        const userEmail = data.userEmail || session?.email || null;
        
        return this.log('LMP Analysis', {
            userId: userId,
            userName: userName,
            userEmail: userEmail,
            widget: 'lmp-comparison',
            clientName: data.clientName || 'Unnamed Analysis',
            clientId: data.clientId || null,
            accountName: data.accountName || null,
            accountId: data.accountId || null,
            data: {
                clientName: data.clientName || 'Unnamed Analysis',
                iso: data.iso,
                zone: data.zone,
                startDate: data.startDate,
                termMonths: data.termMonths,
                fixedPrice: data.fixedPrice,
                lmpAdjustment: data.lmpAdjustment,
                totalAnnualUsage: data.usage,
                results: data.results
            }
        });
    },
    
    // Log an LMP Export activity
    logLMPExport(data) {
        const session = UserStore.getSession();
        const userId = data.userId || session?.id || null;
        const userName = data.userName || (session ? `${session.firstName} ${session.lastName}` : 'System');
        const userEmail = data.userEmail || session?.email || null;
        
        return this.log('LMP Export', {
            userId: userId,
            userName: userName,
            userEmail: userEmail,
            widget: 'lmp-comparison',
            data: {
                exportType: data.exportType,
                iso: data.iso,
                zone: data.zone,
                format: data.format
            }
        });
    },
    
    // Log a Usage Entry activity (from Energy Utilization widget)
    logUsageEntry(data) {
        const session = UserStore.getSession();
        const userId = data.userId || session?.id || null;
        const userName = data.userName || (session ? `${session.firstName} ${session.lastName}` : 'System');
        const userEmail = data.userEmail || session?.email || null;
        
        return this.log('Usage Data Entry', {
            userId: userId,
            userName: userName,
            userEmail: userEmail,
            widget: 'energy-utilization',
            clientName: data.clientName || null,
            clientId: data.clientId || null,
            accountName: data.accountName || null,
            accountId: data.accountId || null,
            data: {
                clientName: data.clientName,
                accountName: data.accountName,
                months: data.months || 12
            }
        });
    },

    getAll() { return this.entries; },
    getRecent(count = 50) { return this.entries.slice(0, count); },
    getByUser(userId) { return this.entries.filter(e => e.userId === userId); },
    getByAction(action) { return this.entries.filter(e => e.action === action); },

    clear() { this.entries = []; this.saveToStorage(); },
    
    // Refresh from Azure (for admin to see all users' activities)
    async refresh() {
        console.log('[ActivityLog] Refreshing from Azure...');
        if (typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
            try {
                const data = await AzureDataService.get('activity-log.json');
                if (data?.activities && Array.isArray(data.activities)) {
                    this._mergeActivities(data.activities);
                    this.saveToStorage();
                    console.log('[ActivityLog] Refreshed - now have', this.entries.length, 'entries');
                    return { success: true, count: this.entries.length };
                }
            } catch (e) {
                console.error('[ActivityLog] Refresh failed:', e);
                return { success: false, error: e.message };
            }
        }
        return { success: false, error: 'Azure not configured' };
    },
    
    _scheduleSyncToAzure() {
        if (typeof AzureDataService === 'undefined' || !AzureDataService.isConfigured()) return;
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            AzureDataService.save('activity-log.json', {
                version: '2.3.0',
                lastUpdated: new Date().toISOString(),
                activities: this.entries.slice(0, this.MAX_ENTRIES)
            }).catch(e => console.warn('[ActivityLog] Azure sync failed:', e.message));
        }, 2000);
    },

    exportForGitHub() {
        return JSON.stringify({
            version: '2.3.0',
            lastUpdated: new Date().toISOString(),
            activities: this.entries.slice(0, this.MAX_ENTRIES)
        }, null, 2);
    },
    
    // For backwards compatibility with mergeFromGitHub calls
    mergeFromGitHub(remoteActivities) {
        this._mergeActivities(remoteActivities);
        this.saveToStorage();
    }
};


// =====================================================
// TICKET STORE (Azure Integration)
// =====================================================
const TicketStore = {
    STORAGE_KEY: 'secureEnergy_tickets',
    tickets: [],
    ticketActivityLog: [],
    _syncTimeout: null,
    _initialized: false,

    async init() {
        console.log('[TicketStore] Initializing...');
        
        const localData = this.loadFromStorage();
        this.tickets = localData.tickets || [];
        this.ticketActivityLog = localData.activityLog || [];
        
        // Try to fetch from Azure and merge
        if (typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
            try {
                const data = await AzureDataService.get('tickets.json');
                if (data?.tickets && Array.isArray(data.tickets)) {
                    this.mergeFromGitHub(data.tickets);
                    console.log('[TicketStore] Merged with Azure data');
                }
            } catch (e) {
                console.warn('[TicketStore] Azure fetch failed, using local data:', e.message);
            }
        }
        
        this.saveToStorage();
        this._initialized = true;
        
        console.log(`[TicketStore] ${this.tickets.length} tickets loaded`);
        return this.tickets;
    },

    loadFromStorage() {
        try {
            const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || {};
            return { tickets: data.tickets || [], activityLog: data.activityLog || [] };
        } catch { return { tickets: [], activityLog: [] }; }
    },

    saveToStorage() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                tickets: this.tickets,
                activityLog: this.ticketActivityLog
            }));
        } catch (e) { console.error('[TicketStore] Save failed:', e); }
    },

    getAll() { return this.tickets; },
    getById(ticketId) { return this.tickets.find(t => t.id === ticketId); },
    getByUser(userId) { return this.tickets.filter(t => t.submittedBy?.userId === userId); },
    getByStatus(status) { return this.tickets.filter(t => t.status === status); },
    getOpen() { return this.tickets.filter(t => t.status === 'open' || t.status === 'in-progress'); },

    create(ticketData) {
        const ticket = {
            id: this.generateTicketId(),
            ...ticketData,
            status: ticketData.status || 'open',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            conversation: []
        };
        
        this.tickets.unshift(ticket);
        this.logTicketActivity('created', ticket.id, ticketData.submittedBy?.name, `created ticket: ${ticket.subject}`);
        this.saveToStorage();
        this._scheduleSyncToAzure();
        
        try { window.dispatchEvent(new CustomEvent('ticketCreated', { detail: ticket })); } catch (e) { }
        
        return ticket;
    },

    update(ticketId, updates) {
        const ticket = this.tickets.find(t => t.id === ticketId);
        if (!ticket) return null;
        
        const oldStatus = ticket.status;
        Object.assign(ticket, updates, { updatedAt: new Date().toISOString() });
        
        if (updates.status && updates.status !== oldStatus) {
            this.logTicketActivity('status_changed', ticketId, updates.updatedBy || 'System', `changed status from ${oldStatus} to ${updates.status}`);
        }
        
        this.saveToStorage();
        this._scheduleSyncToAzure();
        
        try { window.dispatchEvent(new CustomEvent('ticketUpdated', { detail: ticket })); } catch (e) { }
        
        return ticket;
    },

    addReply(ticketId, reply) {
        const ticket = this.tickets.find(t => t.id === ticketId);
        if (!ticket) return null;
        
        if (!ticket.conversation) ticket.conversation = [];
        
        const message = {
            id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            ...reply,
            timestamp: new Date().toISOString()
        };
        
        ticket.conversation.push(message);
        ticket.updatedAt = new Date().toISOString();
        
        this.logTicketActivity('replied', ticketId, reply.userName, 'added a reply');
        this.saveToStorage();
        this._scheduleSyncToAzure();
        
        return message;
    },

    logTicketActivity(action, ticketId, userName, description) {
        this.ticketActivityLog.unshift({
            timestamp: new Date().toISOString(),
            action, ticketId, userName, description
        });
        if (this.ticketActivityLog.length > 200) {
            this.ticketActivityLog = this.ticketActivityLog.slice(0, 200);
        }
    },

    generateTicketId() {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 5).toUpperCase();
        return `SE-${timestamp}-${random}`;
    },

    getStats() {
        const stats = { total: this.tickets.length, open: 0, inProgress: 0, awaitingResponse: 0, resolved: 0, closed: 0, byCategory: {}, byPriority: {} };
        this.tickets.forEach(t => {
            switch (t.status) {
                case 'open': stats.open++; break;
                case 'in-progress': stats.inProgress++; break;
                case 'awaiting-response': stats.awaitingResponse++; break;
                case 'resolved': stats.resolved++; break;
                case 'closed': stats.closed++; break;
            }
            stats.byCategory[t.category] = (stats.byCategory[t.category] || 0) + 1;
            stats.byPriority[t.priority] = (stats.byPriority[t.priority] || 0) + 1;
        });
        return stats;
    },

    _scheduleSyncToAzure() {
        if (typeof AzureDataService === 'undefined' || !AzureDataService.isConfigured()) return;
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            AzureDataService.save('tickets.json', JSON.parse(this.exportForGitHub()))
                .catch(e => console.warn('[TicketStore] Azure sync failed:', e.message));
        }, 3000);
    },

    mergeFromGitHub(remoteTickets) {
        const localTicketsById = new Map(this.tickets.map(t => [t.id, t]));
        
        remoteTickets.forEach(remote => {
            const local = localTicketsById.get(remote.id);
            if (!local) {
                this.tickets.push(remote);
            } else {
                const localTime = new Date(local.updatedAt || 0).getTime();
                const remoteTime = new Date(remote.updatedAt || 0).getTime();
                if (remoteTime > localTime) {
                    Object.assign(local, remote);
                }
            }
        });
        
        this.tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        this.saveToStorage();
    },

    exportForGitHub() {
        return JSON.stringify({
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            tickets: this.tickets,
            activityLog: this.ticketActivityLog
        }, null, 2);
    }
};


// =====================================================
// INITIALIZATION
// =====================================================
if (typeof window !== 'undefined') {
    window.SecureEnergyData = SecureEnergyData;
    window.UserStore = UserStore;
    window.ActivityLog = ActivityLog;
    window.GitHubSync = GitHubSync;  // Keep for backwards compatibility
    window.AzureSync = AzureSync;    // New name
    window.ErrorLog = ErrorLog;
    window.WidgetPreferences = WidgetPreferences;
    window.UsageProfileStore = UsageProfileStore;
    window.TicketStore = TicketStore;
    
    ErrorLog.init();
    GitHubSync.init();
    WidgetPreferences.init();
    
    // Initialize ActivityLog (will load from localStorage first, then merge with Azure when ready)
    // Initial sync load happens in initStoresWithAzure
    ActivityLog.entries = ActivityLog.loadFromStorage();
    console.log(`[ActivityLog] ${ActivityLog.entries.length} local entries loaded (will merge with Azure when ready)`);
    
    // Initialize stores when Azure is ready
    function initStoresWithAzure() {
        // Re-initialize ActivityLog with Azure data for cross-device sync
        ActivityLog.init().then(() => {
            console.log('[SharedDataStore] ActivityLog initialized with Azure');
            try {
                window.dispatchEvent(new CustomEvent('activityLogReady', { detail: { entries: ActivityLog.getAll() } }));
            } catch (e) { }
        }).catch(e => console.warn('[SharedDataStore] ActivityLog init failed:', e.message));
        
        UsageProfileStore.init().then(() => {
            console.log('[SharedDataStore] UsageProfileStore initialized');
            try {
                window.dispatchEvent(new CustomEvent('usageProfilesReady', { detail: { profiles: UsageProfileStore.getAll() } }));
            } catch (e) { }
        }).catch(e => console.warn('[SharedDataStore] UsageProfileStore init failed:', e.message));
        
        TicketStore.init().then(() => {
            console.log('[SharedDataStore] TicketStore initialized');
            try {
                window.dispatchEvent(new CustomEvent('ticketsReady', { detail: { tickets: TicketStore.getAll() } }));
            } catch (e) { }
        }).catch(e => console.warn('[SharedDataStore] TicketStore init failed:', e.message));
    }
    
    // Listen for Azure ready event
    window.addEventListener('azureDataReady', initStoresWithAzure);
    
    // If Azure is already configured, init immediately
    if (typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
        initStoresWithAzure();
    }
    
    // Reset helpers
    window.resetUserStore = () => { localStorage.removeItem('secureEnergy_users'); localStorage.removeItem('secureEnergy_currentUser'); location.reload(); };
    window.resetActivityLog = () => { localStorage.removeItem('secureEnergy_activityLog'); location.reload(); };
    window.resetErrorLog = () => { ErrorLog.clearAll(); };
    window.resetWidgetPrefs = () => { localStorage.removeItem('secureEnergy_widgetPrefs'); location.reload(); };
    window.resetUsageProfiles = () => { localStorage.removeItem('secureEnergy_usageProfiles'); localStorage.removeItem('secureEnergy_activeUsageProfile'); location.reload(); };
    window.resetTicketStore = () => { localStorage.removeItem('secureEnergy_tickets'); location.reload(); };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SecureEnergyData, UserStore, ActivityLog, GitHubSync, AzureSync, ErrorLog, WidgetPreferences, UsageProfileStore, TicketStore };
}

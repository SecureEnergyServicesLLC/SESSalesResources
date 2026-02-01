/**
 * Secure Energy Shared Data Store v2.9
 * Centralized data management for LMP data, user authentication, activity logging,
 * widget layout preferences, usage profiles, and support tickets
 * 
 * v2.9 Updates:
 * - Added global broadcast() helper function for cross-widget communication
 * - Improved SecureEnergyData with retry logic and verbose logging
 * - Fixed initialization chain to ensure data loads properly
 * - Added force refresh capability for LMP data
 * 
 * v2.8 Updates:
 * - Added TicketStore for feedback/support ticket management
 * - Tickets sync to GitHub for cross-device access
 * - Admin and user ticket views with conversation threads
 * 
 * v2.7 Updates:
 * - Added UsageProfileStore for sharing usage profiles across widgets
 * - Profiles can be standalone or client-linked
 * - Cross-widget communication via postMessage for profile changes
 */

// =====================================================
// GLOBAL BROADCAST HELPER
// Used by various stores to communicate across widgets
// =====================================================
function broadcast(messageType, data = {}) {
    const message = { type: messageType, ...data, timestamp: Date.now() };
    
    // Broadcast to parent window (for embedded widgets)
    if (window.parent && window.parent !== window) {
        try {
            window.parent.postMessage(message, '*');
        } catch (e) { /* ignore cross-origin errors */ }
    }
    
    // Broadcast to all iframes
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        try {
            if (iframe.contentWindow) {
                iframe.contentWindow.postMessage(message, '*');
            }
        } catch (e) { /* ignore cross-origin errors */ }
    });
    
    // Dispatch as CustomEvent for same-window listeners
    try {
        window.dispatchEvent(new CustomEvent(messageType, { detail: data }));
    } catch (e) { /* ignore */ }
    
    // Also dispatch a generic event
    try {
        window.dispatchEvent(new CustomEvent('broadcastMessage', { detail: message }));
    } catch (e) { /* ignore */ }
    
    console.log(`[Broadcast] ${messageType}`, data);
    return message;
}

// Make broadcast globally available
window.broadcast = broadcast;


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
        if (source.includes('feedback')) return 'feedback';
        if (source.includes('client-store')) return 'client-store';
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
// USAGE PROFILE STORE
// =====================================================
const UsageProfileStore = {
    STORAGE_KEY: 'secureEnergy_usageProfiles',
    ACTIVE_KEY: 'secureEnergy_activeUsageProfile',
    GITHUB_PROFILES_URL: 'https://raw.githubusercontent.com/SecureEnergyServicesLLC/SESSalesResources/main/data/usage-profiles.json',
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
        
        // Try to fetch from GitHub and MERGE (GitHub-first approach for cross-device support)
        try {
            const githubLoaded = await this.loadFromGitHub(true); // true = merge mode
            if (githubLoaded) {
                console.log('[UsageProfileStore] Merged with GitHub data');
            }
        } catch (e) {
            console.warn('[UsageProfileStore] GitHub fetch failed, using local data:', e.message);
        }
        
        // Save merged result to localStorage
        this.saveToStorage();
        this._initialized = true;
        
        console.log(`[UsageProfileStore] ${this.profiles.length} profiles loaded, active: ${this.activeProfileId}`);
        return this.profiles;
    },

    async loadFromGitHub(mergeMode = false) {
        try {
            console.log('[UsageProfileStore] Fetching profiles from GitHub...');
            const response = await fetch(this.GITHUB_PROFILES_URL + '?t=' + Date.now());
            
            if (!response.ok) {
                if (response.status === 404) {
                    console.log('[UsageProfileStore] usage-profiles.json not found on GitHub (will be created on first save)');
                }
                return false;
            }
            
            const data = await response.json();
            if (data?.profiles && Array.isArray(data.profiles)) {
                if (mergeMode && this.profiles.length > 0) {
                    // Smart merge: compare updatedAt timestamps to keep the most recent version
                    const mergedProfiles = [];
                    const processedIds = new Set();
                    
                    // Create lookup map for local profiles
                    const localProfilesById = new Map(this.profiles.map(p => [p.id, p]));
                    
                    // Process GitHub profiles - compare with local versions
                    data.profiles.forEach(githubProfile => {
                        const localProfile = localProfilesById.get(githubProfile.id);
                        
                        if (localProfile) {
                            // Profile exists in both - keep the one with newer updatedAt
                            const localTime = new Date(localProfile.updatedAt || localProfile.createdAt || 0).getTime();
                            const githubTime = new Date(githubProfile.updatedAt || githubProfile.createdAt || 0).getTime();
                            
                            if (localTime > githubTime) {
                                console.log(`[UsageProfileStore] Keeping local (newer): ${localProfile.name}`);
                                mergedProfiles.push(localProfile);
                            } else {
                                console.log(`[UsageProfileStore] Using GitHub (newer/same): ${githubProfile.name}`);
                                mergedProfiles.push(githubProfile);
                            }
                            processedIds.add(localProfile.id);
                        } else {
                            // Profile only in GitHub
                            mergedProfiles.push(githubProfile);
                        }
                        processedIds.add(githubProfile.id);
                    });
                    
                    // Add local-only profiles (not in GitHub at all)
                    this.profiles.forEach(localProfile => {
                        if (!processedIds.has(localProfile.id)) {
                            console.log(`[UsageProfileStore] Keeping local-only profile: ${localProfile.name}`);
                            mergedProfiles.push(localProfile);
                        }
                    });
                    
                    this.profiles = mergedProfiles;
                    console.log(`[UsageProfileStore] Smart merge complete: ${this.profiles.length} total profiles`);
                } else {
                    // Replace mode
                    this.profiles = data.profiles;
                    console.log(`[UsageProfileStore] Loaded ${this.profiles.length} profiles from GitHub`);
                }
                return true;
            }
            return false;
        } catch (e) {
            console.warn('[UsageProfileStore] GitHub fetch failed:', e.message);
            return false;
        }
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

    // Create a new usage profile
    async create(profileData) {
        const profile = {
            id: 'profile-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            name: profileData.name || 'Unnamed Profile',
            clientId: profileData.clientId || null,
            clientName: profileData.clientName || null,
            electricUsage: profileData.electricUsage || Array(12).fill(0),
            gasUsage: profileData.gasUsage || Array(12).fill(0),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: profileData.createdBy || null,
            notes: profileData.notes || ''
        };
        this.profiles.push(profile);
        this.saveToStorage();
        this._notifySubscribers();
        
        // Sync to GitHub immediately for cross-device availability
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) {
            try {
                await GitHubSync.syncUsageProfiles();
                console.log(`[UsageProfileStore] Created and synced profile: ${profile.name}`);
            } catch (e) {
                console.warn('[UsageProfileStore] GitHub sync failed, but local save succeeded:', e.message);
            }
        } else {
            console.log(`[UsageProfileStore] Created profile (local only): ${profile.name}`);
        }
        
        return { success: true, profile };
    },

    // Update an existing profile
    async update(id, updates) {
        const idx = this.profiles.findIndex(p => p.id === id);
        if (idx === -1) return { success: false, error: 'Profile not found' };
        
        this.profiles[idx] = {
            ...this.profiles[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        this.saveToStorage();
        this._notifySubscribers();
        
        // Sync to GitHub immediately for cross-device availability
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) {
            try {
                await GitHubSync.syncUsageProfiles();
                console.log(`[UsageProfileStore] Updated and synced profile: ${this.profiles[idx].name}`);
            } catch (e) {
                console.warn('[UsageProfileStore] GitHub sync failed, but local save succeeded:', e.message);
            }
        }
        
        return { success: true, profile: this.profiles[idx] };
    },

    // Delete a profile
    async delete(id) {
        const idx = this.profiles.findIndex(p => p.id === id);
        if (idx === -1) return { success: false, error: 'Profile not found' };
        
        const profile = this.profiles[idx];
        this.profiles.splice(idx, 1);
        
        // Clear active if deleted
        if (this.activeProfileId === id) {
            this.activeProfileId = null;
        }
        
        this.saveToStorage();
        this._notifySubscribers();
        
        // Sync to GitHub immediately
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) {
            try {
                await GitHubSync.syncUsageProfiles();
                console.log(`[UsageProfileStore] Deleted and synced profile: ${profile.name}`);
            } catch (e) {
                console.warn('[UsageProfileStore] GitHub sync failed, but local delete succeeded:', e.message);
            }
        }
        
        return { success: true };
    },

    // Get all profiles
    getAll() {
        return this.profiles;
    },

    // Get profile by ID
    getById(id) {
        return this.profiles.find(p => p.id === id);
    },

    // Get profiles for a specific client
    getByClientId(clientId) {
        return this.profiles.filter(p => p.clientId === clientId);
    },

    // Get standalone profiles (not linked to any client)
    getStandalone() {
        return this.profiles.filter(p => !p.clientId);
    },

    // Set the active usage profile
    setActiveProfile(id) {
        const profile = this.getById(id);
        if (!profile) return { success: false, error: 'Profile not found' };
        
        this.activeProfileId = id;
        this.saveToStorage();
        this._notifySubscribers();
        
        // Broadcast the change to all widgets
        this._broadcastProfileChange(profile);
        
        console.log(`[UsageProfileStore] Active profile set: ${profile.name}`);
        return { success: true, profile };
    },

    // Clear active profile
    clearActiveProfile() {
        this.activeProfileId = null;
        this.saveToStorage();
        this._notifySubscribers();
        this._broadcastProfileChange(null);
        console.log('[UsageProfileStore] Active profile cleared');
    },

    // Get the currently active profile
    getActiveProfile() {
        if (!this.activeProfileId) return null;
        return this.getById(this.activeProfileId);
    },

    // Get active profile ID
    getActiveProfileId() {
        return this.activeProfileId;
    },

    // Subscribe to profile changes
    subscribe(callback) {
        this._subscribers.push(callback);
        return () => {
            this._subscribers = this._subscribers.filter(cb => cb !== callback);
        };
    },

    _notifySubscribers() {
        this._subscribers.forEach(cb => {
            try {
                cb({
                    profiles: this.profiles,
                    activeProfile: this.getActiveProfile(),
                    activeProfileId: this.activeProfileId
                });
            } catch (e) {
                console.error('[UsageProfileStore] Subscriber error:', e);
            }
        });
    },

    _broadcastProfileChange(profile) {
        // Use global broadcast helper
        broadcast('USAGE_PROFILE_CHANGED', {
            profile: profile,
            profileId: profile?.id || null
        });
    },

    // Create a profile from client data (from Client Store or Utilization Widget)
    async createFromClient(clientData) {
        if (!clientData) return { success: false, error: 'No client data provided' };
        
        // Check if profile already exists for this client
        const existing = this.getByClientId(clientData.id);
        if (existing.length > 0) {
            // Update the most recent one
            return await this.update(existing[0].id, {
                name: clientData.name + ' - Usage Profile',
                clientName: clientData.name,
                electricUsage: clientData.usageProfile?.electric || clientData.electricUsage || Array(12).fill(0),
                gasUsage: clientData.usageProfile?.gas || clientData.gasUsage || Array(12).fill(0)
            });
        }
        
        // Create new profile
        return await this.create({
            name: clientData.name + ' - Usage Profile',
            clientId: clientData.id,
            clientName: clientData.name,
            electricUsage: clientData.usageProfile?.electric || clientData.electricUsage || Array(12).fill(0),
            gasUsage: clientData.usageProfile?.gas || clientData.gasUsage || Array(12).fill(0)
        });
    },

    // Schedule GitHub sync (debounced)
    _scheduleSyncToGitHub() {
        if (!GitHubSync.hasToken() || !GitHubSync.autoSyncEnabled) return;
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            GitHubSync.syncUsageProfiles().catch(e => {
                console.warn('[UsageProfileStore] GitHub sync failed:', e.message);
            });
        }, 2000);
    },

    // Merge profiles from GitHub (for cross-device sync)
    mergeFromGitHub(githubProfiles) {
        if (!githubProfiles || !Array.isArray(githubProfiles)) return;
        
        const localIds = new Set(this.profiles.map(p => p.id));
        let added = 0, updated = 0;
        
        githubProfiles.forEach(remote => {
            const local = this.profiles.find(p => p.id === remote.id);
            if (!local) {
                // New profile from GitHub
                this.profiles.push(remote);
                added++;
            } else {
                // Compare timestamps
                const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
                const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
                if (remoteTime > localTime) {
                    Object.assign(local, remote);
                    updated++;
                }
            }
        });
        
        if (added > 0 || updated > 0) {
            this.saveToStorage();
            this._notifySubscribers();
            console.log(`[UsageProfileStore] Merged from GitHub: ${added} added, ${updated} updated`);
        }
    },

    // Export for GitHub sync
    exportForGitHub() {
        return JSON.stringify({
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            profiles: this.profiles
        }, null, 2);
    },

    // Get stats
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
            this._scheduleSyncToGitHub();
        } catch (e) { console.error('[WidgetPreferences] Save failed:', e); }
    },

    _scheduleSyncToGitHub() {
        if (!GitHubSync.hasToken() || !GitHubSync.autoSyncEnabled) return;
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            GitHubSync.syncWidgetPreferences().catch(e => {
                console.warn('[WidgetPreferences] GitHub sync failed:', e.message);
            });
        }, 3000);
    },

    _getUserCache(userId) {
        if (!this._cache[userId]) this._cache[userId] = { widgets: {}, order: [] };
        return this._cache[userId];
    },

    getWidgetConfig(userId, widgetId) {
        const userCache = this._getUserCache(userId);
        return userCache.widgets[widgetId] || null;
    },

    saveWidgetConfig(userId, widgetId, config) {
        const userCache = this._getUserCache(userId);
        userCache.widgets[widgetId] = { ...(userCache.widgets[widgetId] || {}), ...config };
        this.saveToStorage();
    },

    getOrder(userId) {
        const userCache = this._getUserCache(userId);
        return userCache.order || [];
    },

    saveOrder(userId, orderArray) {
        const userCache = this._getUserCache(userId);
        userCache.order = orderArray;
        this.saveToStorage();
    },

    resetForUser(userId) {
        delete this._cache[userId];
        this.saveToStorage();
    },

    mergeFromGitHub(githubPrefs) {
        if (!githubPrefs || typeof githubPrefs !== 'object') return;
        
        let updated = false;
        Object.keys(githubPrefs).forEach(userId => {
            const remote = githubPrefs[userId];
            const local = this._cache[userId];
            
            if (!local) {
                this._cache[userId] = remote;
                updated = true;
            } else {
                // Merge widgets
                if (remote.widgets) {
                    Object.keys(remote.widgets).forEach(widgetId => {
                        if (!local.widgets[widgetId]) {
                            local.widgets[widgetId] = remote.widgets[widgetId];
                            updated = true;
                        }
                    });
                }
                // Use remote order if local doesn't have one
                if (remote.order?.length && !local.order?.length) {
                    local.order = remote.order;
                    updated = true;
                }
            }
        });
        
        if (updated) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._cache));
            console.log('[WidgetPreferences] Merged from GitHub');
        }
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
// GITHUB SYNC MODULE
// =====================================================
const GitHubSync = {
    TOKEN_KEY: 'secureEnergy_githubToken',
    REPO_OWNER: 'SecureEnergyServicesLLC',
    REPO_NAME: 'SESSalesResources',
    ACTIVITY_PATH: 'data/activity-log.json',
    USERS_PATH: 'data/users.json',
    WIDGET_PREFS_PATH: 'data/widget-preferences.json',
    USAGE_PROFILES_PATH: 'data/usage-profiles.json',
    TICKETS_PATH: 'data/tickets.json',
    
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
            // Pull usage profiles
            await this.pullUsageProfiles();
            // Pull tickets
            await this.pullTickets();
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

    async pullUsageProfiles() {
        try {
            const response = await fetch(
                `https://raw.githubusercontent.com/${this.REPO_OWNER}/${this.REPO_NAME}/main/${this.USAGE_PROFILES_PATH}?t=${Date.now()}`
            );
            if (!response.ok) {
                if (response.status === 404) {
                    console.log('[GitHubSync] Usage profiles file not found (will be created on first save)');
                }
                return;
            }
            const data = await response.json();
            if (data?.profiles) {
                UsageProfileStore.mergeFromGitHub(data.profiles);
            }
        } catch (e) {
            console.log('[GitHubSync] Usage profiles fetch skipped:', e.message);
        }
    },

    async pullTickets() {
        try {
            const response = await fetch(
                `https://raw.githubusercontent.com/${this.REPO_OWNER}/${this.REPO_NAME}/main/${this.TICKETS_PATH}?t=${Date.now()}`
            );
            if (!response.ok) {
                if (response.status === 404) {
                    console.log('[GitHubSync] Tickets file not found (will be created on first save)');
                }
                return;
            }
            const data = await response.json();
            if (data?.tickets) {
                TicketStore.mergeFromGitHub(data.tickets);
            }
        } catch (e) {
            console.log('[GitHubSync] Tickets fetch skipped:', e.message);
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

    async syncUsageProfiles() {
        if (!this.token || this.isSyncing) return { success: false };
        this.isSyncing = true;
        
        try {
            const content = UsageProfileStore.exportForGitHub();
            const result = await this._updateFile(this.USAGE_PROFILES_PATH, content, 'Update usage profiles');
            this.lastSync = new Date().toISOString();
            localStorage.setItem('secureEnergy_lastSync', this.lastSync);
            console.log('[GitHubSync] Usage profiles synced');
            return { success: true };
        } catch (e) {
            console.error('[GitHubSync] Usage profiles sync failed:', e);
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

    async syncTickets() {
        if (!this.token || this.isSyncing) return { success: false };
        this.isSyncing = true;
        
        try {
            const content = TicketStore.exportForGitHub();
            const result = await this._updateFile(this.TICKETS_PATH, content, 'Update support tickets');
            this.lastSync = new Date().toISOString();
            localStorage.setItem('secureEnergy_lastSync', this.lastSync);
            console.log('[GitHubSync] Tickets synced');
            return { success: true };
        } catch (e) {
            console.error('[GitHubSync] Tickets sync failed:', e);
            return { success: false, error: e.message };
        } finally {
            this.isSyncing = false;
        }
    },

    async pushChanges() {
        if (!this.token) return { success: false, error: 'No token' };
        const results = {};
        results.activity = await this.syncActivityLog();
        results.users = await this.syncUsers();
        results.widgetPrefs = await this.syncWidgetPreferences();
        results.usageProfiles = await this.syncUsageProfiles();
        results.tickets = await this.syncTickets();
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
// LMP DATA STORE - IMPROVED WITH RETRY AND VERBOSE LOGGING
// =====================================================
const SecureEnergyData = {
    STORAGE_KEY: 'secureEnergy_lmpData',
    DATA_URL: 'data/lmp-database.json',
    GITHUB_RAW_URL: 'https://raw.githubusercontent.com/SecureEnergyServicesLLC/SESSalesResources/main/data/lmp-database.json',
    lmpData: [],
    _subscribers: [],
    isLoaded: false,
    isLoading: false,
    lastFetchTime: null,
    lastError: null,
    fetchAttempts: 0,
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 2000,

    async init() {
        console.log('[SecureEnergyData] ========== INITIALIZING ==========');
        
        // Load from localStorage first (for instant display)
        const cached = this.loadFromStorage();
        if (cached?.length) {
            this.lmpData = cached;
            this.isLoaded = true;
            console.log(`[SecureEnergyData] ✓ Loaded ${cached.length} records from cache`);
        } else {
            console.log('[SecureEnergyData] No cached data found');
        }
        
        // Fetch latest from GitHub (with retry)
        try {
            await this.fetchLatest();
        } catch (e) {
            console.warn('[SecureEnergyData] ✗ Initial fetch failed:', e.message);
            this.lastError = e.message;
        }
        
        // Notify subscribers with current state
        this.notifySubscribers();
        
        // Log final state
        const stats = this.getStats();
        console.log('[SecureEnergyData] ========== INIT COMPLETE ==========');
        console.log(`[SecureEnergyData] Total Records: ${stats.totalRecords}`);
        console.log(`[SecureEnergyData] ISOs: ${stats.isos?.join(', ') || 'None'}`);
        console.log(`[SecureEnergyData] ISO Count: ${stats.isoCount}`);
        
        return this.lmpData;
    },

    async fetchLatest(forceRefresh = false) {
        if (this.isLoading && !forceRefresh) {
            console.log('[SecureEnergyData] Fetch already in progress, skipping...');
            return;
        }
        
        this.isLoading = true;
        this.fetchAttempts = 0;
        this.lastError = null;
        
        while (this.fetchAttempts < this.MAX_RETRY_ATTEMPTS) {
            this.fetchAttempts++;
            console.log(`[SecureEnergyData] Fetch attempt ${this.fetchAttempts}/${this.MAX_RETRY_ATTEMPTS}...`);
            
            try {
                const url = `${this.GITHUB_RAW_URL}?t=${Date.now()}`;
                console.log(`[SecureEnergyData] Fetching: ${url}`);
                
                const response = await fetch(url);
                console.log(`[SecureEnergyData] Response status: ${response.status}`);
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('[SecureEnergyData] Response parsed successfully');
                    
                    if (data?.records?.length) {
                        const oldCount = this.lmpData.length;
                        this.lmpData = data.records.map(r => this.normalizeRecord(r));
                        this.isLoaded = true;
                        this.lastFetchTime = new Date().toISOString();
                        this.saveToStorage();
                        
                        console.log(`[SecureEnergyData] ✓ SUCCESS: Loaded ${this.lmpData.length} records from GitHub`);
                        console.log(`[SecureEnergyData] Meta:`, data.meta || 'No meta');
                        
                        // Broadcast update to all widgets
                        broadcast('LMP_DATA_UPDATED', {
                            recordCount: this.lmpData.length,
                            stats: this.getStats()
                        });
                        
                        this.notifySubscribers();
                        this.isLoading = false;
                        return true;
                    } else {
                        console.warn('[SecureEnergyData] Response OK but no records array found');
                        console.log('[SecureEnergyData] Data structure:', Object.keys(data));
                        this.lastError = 'No records in response';
                    }
                } else {
                    console.warn(`[SecureEnergyData] HTTP Error: ${response.status} ${response.statusText}`);
                    this.lastError = `HTTP ${response.status}`;
                }
            } catch (e) {
                console.error(`[SecureEnergyData] Fetch error:`, e);
                this.lastError = e.message;
            }
            
            // Wait before retry
            if (this.fetchAttempts < this.MAX_RETRY_ATTEMPTS) {
                console.log(`[SecureEnergyData] Waiting ${this.RETRY_DELAY_MS}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
            }
        }
        
        console.error(`[SecureEnergyData] ✗ All ${this.MAX_RETRY_ATTEMPTS} fetch attempts failed`);
        this.isLoading = false;
        return false;
    },

    // Force refresh - clears cache and re-fetches
    async forceRefresh() {
        console.log('[SecureEnergyData] Force refresh requested...');
        this.clearCache();
        return await this.fetchLatest(true);
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

    loadFromStorage() { 
        try { 
            const data = localStorage.getItem(this.STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);
                console.log(`[SecureEnergyData] Cache found: ${parsed?.length || 0} records`);
                return parsed;
            }
            return []; 
        } catch (e) { 
            console.warn('[SecureEnergyData] Cache parse error:', e);
            return []; 
        } 
    },
    
    saveToStorage() { 
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.lmpData)); 
            console.log(`[SecureEnergyData] Saved ${this.lmpData.length} records to cache`);
        } catch (e) {
            console.error('[SecureEnergyData] Cache save error:', e);
        }
    },

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
            isLoaded: this.isLoaded,
            isLoading: this.isLoading,
            lastFetchTime: this.lastFetchTime,
            lastError: this.lastError
        };
    },

    subscribe(callback) { this._subscribers.push(callback); },
    notifySubscribers() { 
        const stats = this.getStats();
        this._subscribers.forEach(cb => {
            try {
                cb(stats);
            } catch (e) {
                console.error('[SecureEnergyData] Subscriber error:', e);
            }
        }); 
    },

    bulkUpdate(records) {
        console.log(`[SecureEnergyData] Bulk update: ${records.length} records`);
        this.lmpData = records.map(r => this.normalizeRecord(r));
        this.isLoaded = true;
        this.saveToStorage();
        this.notifySubscribers();
        
        // Broadcast to widgets
        broadcast('LMP_BULK_UPDATE', { count: records.length });
        
        // Legacy postMessage for backward compatibility
        window.postMessage({ type: 'LMP_BULK_UPDATE', count: records.length }, '*');
    },

    // Clear cached data (useful for troubleshooting)
    clearCache() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.lmpData = [];
        this.isLoaded = false;
        console.log('[SecureEnergyData] Cache cleared');
    },

    // Debug helper - call from console
    debug() {
        console.log('=== SecureEnergyData Debug ===');
        console.log('Records:', this.lmpData.length);
        console.log('Is Loaded:', this.isLoaded);
        console.log('Is Loading:', this.isLoading);
        console.log('Last Fetch:', this.lastFetchTime);
        console.log('Last Error:', this.lastError);
        console.log('Stats:', this.getStats());
        console.log('First 5 records:', this.lmpData.slice(0, 5));
        return this.getStats();
    }
};


// =====================================================
// ACTIVITY LOG STORE
// =====================================================
const ActivityLog = {
    STORAGE_KEY: 'secureEnergy_activityLog',
    MAX_LOGS: 500,
    logs: [],
    _syncTimeout: null,

    async init() {
        console.log('[ActivityLog] Initializing...');
        this.logs = this.loadFromStorage();
        console.log(`[ActivityLog] ${this.logs.length} entries loaded`);
        return this.logs;
    },

    loadFromStorage() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
        } catch { return []; }
    },

    saveToStorage() {
        try {
            if (this.logs.length > this.MAX_LOGS) {
                this.logs = this.logs.slice(0, this.MAX_LOGS);
            }
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.logs));
            this._scheduleSyncToGitHub();
        } catch (e) { console.error('[ActivityLog] Save failed:', e); }
    },

    _scheduleSyncToGitHub() {
        if (!GitHubSync.hasToken() || !GitHubSync.autoSyncEnabled) return;
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            GitHubSync.syncActivityLog().catch(e => {
                console.warn('[ActivityLog] GitHub sync failed:', e.message);
            });
        }, 5000);
    },

    log(entry) {
        const log = {
            id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            timestamp: new Date().toISOString(),
            ...entry
        };
        this.logs.unshift(log);
        this.saveToStorage();
        
        // Dispatch event for UI auto-refresh
        try {
            window.dispatchEvent(new CustomEvent('activityLogged', { detail: log }));
        } catch (e) { /* ignore */ }
        
        return log;
    },

    logButtonClick(data) {
        return this.log({
            action: 'Button Click',
            ...data
        });
    },

    getAll() { return this.logs; },
    getRecent(count = 50) { return this.logs.slice(0, count); },
    getByUser(userId) { return this.logs.filter(l => l.userId === userId); },
    getByWidget(widget) { return this.logs.filter(l => l.widget === widget); },
    getByAction(action) { return this.logs.filter(l => l.action === action); },

    clear() { this.logs = []; this.saveToStorage(); },

    exportForGitHub() {
        return JSON.stringify({
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            logs: this.logs
        }, null, 2);
    }
};


// =====================================================
// USER STORE
// =====================================================
const UserStore = {
    STORAGE_KEY: 'secureEnergy_users',
    SESSION_KEY: 'secureEnergy_currentUser',
    GITHUB_USERS_URL: 'https://raw.githubusercontent.com/SecureEnergyServicesLLC/SESSalesResources/main/data/users.json',
    users: [],
    currentUser: null,
    _syncTimeout: null,

    async init() {
        console.log('[UserStore] Initializing...');
        
        // Load local users first (baseline)
        const localUsers = this.loadFromStorage();
        this.users = localUsers.length ? localUsers : this.getDefaultUsers();
        
        // Try to fetch from GitHub and MERGE (GitHub-first approach)
        try {
            console.log('[UserStore] Attempting GitHub fetch for users...');
            const githubLoaded = await this.loadFromGitHub(true); // true = merge mode
            if (githubLoaded) {
                console.log('[UserStore] Merged with GitHub user data');
            }
        } catch (e) {
            console.warn('[UserStore] GitHub fetch failed, using local data:', e.message);
        }
        
        // Save merged result to localStorage
        this.saveToStorage();
        
        // Load session
        this.currentUser = this.loadSession();
        
        console.log(`[UserStore] ${this.users.length} users loaded, session: ${this.currentUser?.email || 'none'}`);
        return this.users;
    },

    async loadFromGitHub(mergeMode = false) {
        try {
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
                    // Smart merge: compare updatedAt timestamps
                    const mergedUsers = [];
                    const processedIds = new Set();
                    
                    const localUsersById = new Map(this.users.map(u => [u.id, u]));
                    
                    data.users.forEach(githubUser => {
                        const localUser = localUsersById.get(githubUser.id);
                        
                        if (localUser) {
                            const localTime = new Date(localUser.updatedAt || localUser.createdAt || 0).getTime();
                            const githubTime = new Date(githubUser.updatedAt || githubUser.createdAt || 0).getTime();
                            
                            if (localTime > githubTime) {
                                mergedUsers.push(localUser);
                            } else {
                                mergedUsers.push(githubUser);
                            }
                            processedIds.add(localUser.id);
                        } else {
                            mergedUsers.push(githubUser);
                        }
                        processedIds.add(githubUser.id);
                    });
                    
                    this.users.forEach(localUser => {
                        if (!processedIds.has(localUser.id)) {
                            mergedUsers.push(localUser);
                        }
                    });
                    
                    this.users = mergedUsers;
                } else {
                    this.users = data.users;
                }
                return true;
            }
            return false;
        } catch (e) {
            console.warn('[UserStore] GitHub fetch failed:', e.message);
            return false;
        }
    },

    getDefaultUsers() {
        return [{
            id: 'admin-default',
            email: 'admin@sesenergy.org',
            password: 'admin123',
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
            createdAt: new Date().toISOString(),
            permissions: {}
        }];
    },

    loadFromStorage() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
        } catch { return []; }
    },

    saveToStorage() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.users));
            this._scheduleSyncToGitHub();
        } catch (e) { console.error('[UserStore] Save failed:', e); }
    },

    _scheduleSyncToGitHub() {
        if (!GitHubSync.hasToken() || !GitHubSync.autoSyncEnabled) return;
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            GitHubSync.syncUsers().catch(e => {
                console.warn('[UserStore] GitHub sync failed:', e.message);
            });
        }, 3000);
    },

    loadSession() {
        try {
            const session = JSON.parse(sessionStorage.getItem(this.SESSION_KEY));
            if (session?.id) {
                // Verify user still exists
                const user = this.users.find(u => u.id === session.id);
                return user || null;
            }
            return null;
        } catch { return null; }
    },

    async authenticate(email, password) {
        // First, try to refresh from GitHub to get latest user list
        try {
            await this.loadFromGitHub(true);
            this.saveToStorage();
        } catch (e) {
            console.warn('[UserStore] Could not refresh from GitHub before auth:', e.message);
        }
        
        const user = this.users.find(u => 
            u.email?.toLowerCase() === email?.toLowerCase() && 
            u.password === password
        );
        
        if (user) {
            this.currentUser = user;
            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
            return { success: true, user };
        }
        return { success: false, error: 'Invalid email or password' };
    },

    setCurrentUser(user) {
        this.currentUser = user;
        if (user) {
            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
        }
    },

    getSession() { return this.loadSession(); },
    clearSession() { 
        this.currentUser = null;
        sessionStorage.removeItem(this.SESSION_KEY); 
    },

    getAll() { return this.users; },
    getById(id) { return this.users.find(u => u.id === id); },
    getByEmail(email) { return this.users.find(u => u.email?.toLowerCase() === email?.toLowerCase()); },

    create(userData) {
        if (this.getByEmail(userData.email)) {
            return { success: false, error: 'Email already exists' };
        }
        
        const user = {
            id: 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            ...userData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        this.users.push(user);
        this.saveToStorage();
        return { success: true, user };
    },

    async update(id, updates) {
        const idx = this.users.findIndex(u => u.id === id);
        if (idx === -1) return { success: false, error: 'User not found' };
        
        // Check email uniqueness if changing email
        if (updates.email && updates.email !== this.users[idx].email) {
            if (this.getByEmail(updates.email)) {
                return { success: false, error: 'Email already exists' };
            }
        }
        
        this.users[idx] = {
            ...this.users[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        this.saveToStorage();
        
        // If updating current user, update session
        if (this.currentUser?.id === id) {
            this.currentUser = this.users[idx];
            sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(this.currentUser));
        }
        
        // Wait for GitHub sync to complete
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) {
            try {
                await GitHubSync.syncUsers();
            } catch (e) {
                console.warn('[UserStore] GitHub sync failed:', e.message);
            }
        }
        
        return { success: true, user: this.users[idx] };
    },

    delete(id) {
        if (id === 'admin-default') {
            return { success: false, error: 'Cannot delete default admin' };
        }
        
        const idx = this.users.findIndex(u => u.id === id);
        if (idx === -1) return { success: false, error: 'User not found' };
        
        this.users.splice(idx, 1);
        this.saveToStorage();
        return { success: true };
    },

    exportForGitHub() {
        return JSON.stringify({
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            users: this.users.map(u => ({ ...u })) // Clone to avoid exposing passwords
        }, null, 2);
    }
};


// =====================================================
// TICKET STORE (for Feedback & Support)
// =====================================================
const TicketStore = {
    STORAGE_KEY: 'secureEnergy_tickets',
    GITHUB_TICKETS_URL: 'https://raw.githubusercontent.com/SecureEnergyServicesLLC/SESSalesResources/main/data/tickets.json',
    tickets: [],
    ticketActivityLog: [],
    _subscribers: [],
    _syncTimeout: null,
    _initialized: false,

    async init() {
        console.log('[TicketStore] Initializing...');
        
        // Load local tickets first
        const localData = this.loadFromStorage();
        this.tickets = localData.tickets || [];
        this.ticketActivityLog = localData.activityLog || [];
        
        // Try to fetch from GitHub and merge
        try {
            const githubLoaded = await this.loadFromGitHub(true);
            if (githubLoaded) {
                console.log('[TicketStore] Merged with GitHub data');
            }
        } catch (e) {
            console.warn('[TicketStore] GitHub fetch failed:', e.message);
        }
        
        this.saveToStorage();
        this._initialized = true;
        
        console.log(`[TicketStore] ${this.tickets.length} tickets loaded`);
        return this.tickets;
    },

    async loadFromGitHub(mergeMode = false) {
        try {
            const response = await fetch(this.GITHUB_TICKETS_URL + '?t=' + Date.now());
            
            if (!response.ok) {
                if (response.status === 404) {
                    console.log('[TicketStore] tickets.json not found on GitHub');
                }
                return false;
            }
            
            const data = await response.json();
            if (data?.tickets && Array.isArray(data.tickets)) {
                if (mergeMode && this.tickets.length > 0) {
                    // Smart merge
                    const mergedTickets = [];
                    const processedIds = new Set();
                    const localTicketsById = new Map(this.tickets.map(t => [t.id, t]));
                    
                    data.tickets.forEach(githubTicket => {
                        const localTicket = localTicketsById.get(githubTicket.id);
                        
                        if (localTicket) {
                            const localTime = new Date(localTicket.updatedAt || 0).getTime();
                            const githubTime = new Date(githubTicket.updatedAt || 0).getTime();
                            
                            mergedTickets.push(localTime > githubTime ? localTicket : githubTicket);
                            processedIds.add(localTicket.id);
                        } else {
                            mergedTickets.push(githubTicket);
                        }
                        processedIds.add(githubTicket.id);
                    });
                    
                    this.tickets.forEach(localTicket => {
                        if (!processedIds.has(localTicket.id)) {
                            mergedTickets.push(localTicket);
                        }
                    });
                    
                    this.tickets = mergedTickets;
                } else {
                    this.tickets = data.tickets;
                }
                
                // Merge activity log
                if (data.activityLog) {
                    this.ticketActivityLog = data.activityLog;
                }
                
                return true;
            }
            return false;
        } catch (e) {
            console.warn('[TicketStore] GitHub fetch failed:', e.message);
            return false;
        }
    },

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                return {
                    tickets: data.tickets || [],
                    activityLog: data.activityLog || []
                };
            }
            return { tickets: [], activityLog: [] };
        } catch { 
            return { tickets: [], activityLog: [] }; 
        }
    },

    saveToStorage() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                tickets: this.tickets,
                activityLog: this.ticketActivityLog
            }));
        } catch (e) { 
            console.error('[TicketStore] Save failed:', e); 
        }
    },

    mergeFromGitHub(githubTickets) {
        if (!githubTickets || !Array.isArray(githubTickets)) return;
        
        let added = 0, updated = 0;
        
        githubTickets.forEach(remote => {
            const local = this.tickets.find(t => t.id === remote.id);
            if (!local) {
                this.tickets.push(remote);
                added++;
            } else {
                const localTime = new Date(local.updatedAt || 0).getTime();
                const remoteTime = new Date(remote.updatedAt || 0).getTime();
                if (remoteTime > localTime) {
                    Object.assign(local, remote);
                    updated++;
                }
            }
        });
        
        if (added > 0 || updated > 0) {
            this.saveToStorage();
            console.log(`[TicketStore] Merged from GitHub: ${added} added, ${updated} updated`);
        }
    },

    getAll() {
        return this.tickets;
    },

    getById(ticketId) {
        return this.tickets.find(t => t.id === ticketId);
    },

    getByUser(userId) {
        return this.tickets.filter(t => t.submittedBy?.id === userId);
    },

    getByStatus(status) {
        return this.tickets.filter(t => t.status === status);
    },

    getOpen() {
        return this.tickets.filter(t => t.status === 'open' || t.status === 'in-progress');
    },

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
        this._scheduleSyncToGitHub();
        
        // Dispatch event for UI updates
        try {
            window.dispatchEvent(new CustomEvent('ticketCreated', { detail: ticket }));
        } catch (e) { /* ignore */ }
        
        return ticket;
    },

    update(ticketId, updates) {
        const ticket = this.tickets.find(t => t.id === ticketId);
        if (!ticket) return null;
        
        const oldStatus = ticket.status;
        Object.assign(ticket, updates, { updatedAt: new Date().toISOString() });
        
        // Log status changes
        if (updates.status && updates.status !== oldStatus) {
            this.logTicketActivity('status_changed', ticketId, updates.updatedBy || 'System', 
                `changed status from ${oldStatus} to ${updates.status}`);
        }
        
        this.saveToStorage();
        this._scheduleSyncToGitHub();
        
        try {
            window.dispatchEvent(new CustomEvent('ticketUpdated', { detail: ticket }));
        } catch (e) { /* ignore */ }
        
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
        this._scheduleSyncToGitHub();
        
        return message;
    },

    logTicketActivity(action, ticketId, userName, description) {
        this.ticketActivityLog.unshift({
            timestamp: new Date().toISOString(),
            action,
            ticketId,
            userName,
            description
        });
        
        // Keep only last 200 entries
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
        const stats = {
            total: this.tickets.length,
            open: 0,
            inProgress: 0,
            awaitingResponse: 0,
            resolved: 0,
            closed: 0,
            byCategory: {},
            byPriority: {}
        };
        
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

    _scheduleSyncToGitHub() {
        if (!GitHubSync.hasToken() || !GitHubSync.autoSyncEnabled) return;
        
        clearTimeout(this._syncTimeout);
        this._syncTimeout = setTimeout(() => {
            GitHubSync.syncTickets().catch(e => {
                console.warn('[TicketStore] GitHub sync failed:', e.message);
            });
        }, 3000);
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
    // Make all stores globally available
    window.SecureEnergyData = SecureEnergyData;
    window.UserStore = UserStore;
    window.ActivityLog = ActivityLog;
    window.GitHubSync = GitHubSync;
    window.ErrorLog = ErrorLog;
    window.WidgetPreferences = WidgetPreferences;
    window.UsageProfileStore = UsageProfileStore;
    window.TicketStore = TicketStore;
    
    // Initialize synchronous stores first
    ErrorLog.init();
    GitHubSync.init();
    WidgetPreferences.init();
    
    // UsageProfileStore.init() is async - it will fetch from GitHub
    UsageProfileStore.init().then(() => {
        console.log('[SharedDataStore] UsageProfileStore initialized with GitHub data');
        try {
            window.dispatchEvent(new CustomEvent('usageProfilesReady', { 
                detail: { profiles: UsageProfileStore.getAll() }
            }));
        } catch (e) { /* ignore */ }
    }).catch(e => {
        console.warn('[SharedDataStore] UsageProfileStore init failed:', e.message);
    });
    
    // TicketStore.init() is async
    TicketStore.init().then(() => {
        console.log('[SharedDataStore] TicketStore initialized with GitHub data');
        try {
            window.dispatchEvent(new CustomEvent('ticketsReady', { 
                detail: { tickets: TicketStore.getAll() }
            }));
        } catch (e) { /* ignore */ }
    }).catch(e => {
        console.warn('[SharedDataStore] TicketStore init failed:', e.message);
    });
    
    // Debug/reset helpers
    window.resetUserStore = () => { localStorage.removeItem('secureEnergy_users'); localStorage.removeItem('secureEnergy_currentUser'); location.reload(); };
    window.resetActivityLog = () => { localStorage.removeItem('secureEnergy_activityLog'); location.reload(); };
    window.resetErrorLog = () => { ErrorLog.clearAll(); };
    window.resetWidgetPrefs = () => { localStorage.removeItem('secureEnergy_widgetPrefs'); location.reload(); };
    window.resetUsageProfiles = () => { localStorage.removeItem('secureEnergy_usageProfiles'); localStorage.removeItem('secureEnergy_activeUsageProfile'); location.reload(); };
    window.resetTicketStore = () => { localStorage.removeItem('secureEnergy_tickets'); location.reload(); };
    window.resetLMPData = () => { SecureEnergyData.clearCache(); location.reload(); };
    window.forceLMPRefresh = () => { SecureEnergyData.forceRefresh(); };
    window.debugLMP = () => { SecureEnergyData.debug(); };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SecureEnergyData, UserStore, ActivityLog, GitHubSync, ErrorLog, WidgetPreferences, UsageProfileStore, TicketStore, broadcast };
}

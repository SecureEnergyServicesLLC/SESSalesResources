/**
 * Secure Energy Shared Data Store v2.8
 * Centralized data management for LMP data, user authentication, activity logging,
 * widget layout preferences, usage profiles, and support tickets
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
        // Try to get current user info
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
    
    // Get human-readable explanation for common errors
    getErrorExplanation(message) {
        if (!message) return null;
        const msg = message.toLowerCase();
        
        // Variable/Reference errors
        if (msg.includes("can't find variable") || msg.includes("is not defined")) {
            const varMatch = message.match(/(?:Can't find variable|ReferenceError):\s*(\w+)/i);
            const varName = varMatch ? varMatch[1] : 'unknown';
            return `The code tried to use "${varName}" but it doesn't exist. This usually means a script loaded before its dependencies, or there's a typo in the variable name.`;
        }
        
        // Type errors
        if (msg.includes("is not a function")) {
            return "Code tried to call something as a function that isn't one. Usually caused by a missing library or incorrect object property access.";
        }
        if (msg.includes("cannot read property") || msg.includes("cannot read properties of")) {
            return "Code tried to access a property on null or undefined. Often happens when data hasn't loaded yet or an element doesn't exist.";
        }
        if (msg.includes("is null") || msg.includes("is undefined")) {
            return "A value was expected but was null/undefined. Check that data is loaded before accessing it.";
        }
        
        // Network errors
        if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
            return "Network request failed. Could be a connectivity issue, CORS problem, or the server is unavailable.";
        }
        if (msg.includes("cors") || msg.includes("cross-origin")) {
            return "Cross-origin request blocked. The server doesn't allow requests from this domain.";
        }
        if (msg.includes("401") || msg.includes("unauthorized")) {
            return "Authentication required or failed. Check if the API key or login session is valid.";
        }
        if (msg.includes("403") || msg.includes("forbidden")) {
            return "Access denied. User doesn't have permission to perform this action.";
        }
        if (msg.includes("404") || msg.includes("not found")) {
            return "Resource not found. The requested URL or file doesn't exist.";
        }
        if (msg.includes("500") || msg.includes("internal server")) {
            return "Server error. Something went wrong on the backend - check server logs.";
        }
        
        // Syntax errors
        if (msg.includes("syntax error") || msg.includes("unexpected token")) {
            return "Invalid JavaScript syntax. There's likely a typo, missing bracket, or malformed JSON.";
        }
        if (msg.includes("json") && (msg.includes("parse") || msg.includes("unexpected"))) {
            return "Failed to parse JSON data. The response isn't valid JSON format.";
        }
        
        // Storage errors
        if (msg.includes("quota") || msg.includes("storage")) {
            return "Browser storage is full. Try clearing old data or using less localStorage.";
        }
        
        // Promise errors
        if (msg.includes("unhandled promise") || msg.includes("rejection")) {
            return "An async operation failed without error handling. Add try/catch or .catch() to handle it.";
        }
        
        // DOM errors
        if (msg.includes("queryselector") || msg.includes("getelementby")) {
            return "Couldn't find a DOM element. The element may not exist yet or the selector is wrong.";
        }
        
        // iframe/postMessage errors
        if (msg.includes("postmessage") || msg.includes("iframe")) {
            return "Communication with embedded widget failed. The iframe may not have loaded or origin is blocked.";
        }
        
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
        
        // Broadcast the new profile to all widgets
        this._broadcastProfileChange(profile, 'created');
        
        // Sync to GitHub immediately for cross-device availability
        this._scheduleSyncToGitHub();
        
        console.log(`[UsageProfileStore] Created profile: ${profile.name} (${profile.id})`);
        return { success: true, profile };
    },

    // Update an existing profile
    async update(id, updates) {
        const idx = this.profiles.findIndex(p => p.id === id);
        if (idx === -1) return { success: false, error: 'Profile not found' };
        
        // Recalculate totals if usage data is being updated
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
        
        // Broadcast the updated profile
        this._broadcastProfileChange(this.profiles[idx], 'updated');
        
        // Sync to GitHub
        this._scheduleSyncToGitHub();
        
        console.log(`[UsageProfileStore] Updated profile: ${this.profiles[idx].name}`);
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
    
    // Get profile by context (clientId + optional accountId)
    getByContext(clientId, accountId = null) {
        if (accountId) {
            // Look for account-specific profile first
            const accountProfile = this.profiles.find(p => 
                p.clientId === clientId && p.accountId === accountId
            );
            if (accountProfile) return accountProfile;
        }
        // Fall back to client-level profile
        return this.profiles.find(p => 
            p.clientId === clientId && !p.accountId
        );
    },
    
    // Get context key for a profile (matches energy-utilization-widget format)
    getContextKey(clientId, accountId = null) {
        return accountId ? `${clientId}_${accountId}` : clientId;
    },
    
    // Create or update profile by context (upsert operation)
    async createOrUpdateByContext(clientId, accountId, profileData) {
        if (!clientId) return { success: false, error: 'Client ID is required' };
        
        // Look for existing profile with this context
        const existing = accountId 
            ? this.profiles.find(p => p.clientId === clientId && p.accountId === accountId)
            : this.profiles.find(p => p.clientId === clientId && !p.accountId);
        
        if (existing) {
            // Update existing profile
            return await this.update(existing.id, {
                ...profileData,
                clientId,
                accountId: accountId || null
            });
        } else {
            // Create new profile
            return await this.create({
                ...profileData,
                clientId,
                accountId: accountId || null,
                name: profileData.name || this._generateProfileName(profileData.clientName, profileData.accountName)
            });
        }
    },
    
    // Generate a profile name from client/account info
    _generateProfileName(clientName, accountName) {
        if (accountName && clientName) {
            return `${clientName} → ${accountName}`;
        }
        return clientName || 'Usage Profile';
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

    _broadcastProfileChange(profile, action = 'changed') {
        const message = {
            type: 'USAGE_PROFILE_CHANGED',
            profile: profile,
            profileId: profile?.id || null,
            clientId: profile?.clientId || null,
            accountId: profile?.accountId || null,
            action: action  // 'created', 'updated', 'deleted', 'changed'
        };
        
        // Broadcast to parent window (for embedded widgets)
        if (window.parent !== window) {
            window.parent.postMessage(message, '*');
        }
        
        // Broadcast to all iframes
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try {
                iframe.contentWindow.postMessage(message, '*');
            } catch (e) { /* ignore cross-origin */ }
        });
        
        // Dispatch custom event
        try {
            window.dispatchEvent(new CustomEvent('usageProfileChanged', { 
                detail: message
            }));
        } catch (e) { /* ignore */ }
        
        console.log(`[UsageProfileStore] Broadcast profile ${action}:`, profile?.name);
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
// LMP DATA STORE
// =====================================================
const SecureEnergyData = {
    STORAGE_KEY: 'secureEnergy_lmpData',
    DATA_URL: 'data/lmp-database.json',
    GITHUB_RAW_URL: 'https://raw.githubusercontent.com/SecureEnergyServicesLLC/SESSalesResources/main/data/lmp-database.json',
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
    GITHUB_USERS_URL: 'https://raw.githubusercontent.com/SecureEnergyServicesLLC/SESSalesResources/main/data/users.json',
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
                    const githubUsersByEmail = new Map(data.users.map(u => [u.email.toLowerCase(), u]));
                    
                    // Process GitHub users - compare with local versions
                    data.users.forEach(githubUser => {
                        const localUser = localUsersById.get(githubUser.id) || localUsersByEmail.get(githubUser.email.toLowerCase());
                        
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
                    // Replace mode
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
        // Refresh from GitHub before authenticating (to catch new users)
        try {
            await this.loadFromGitHub(true);
            this.saveToStorage();
        } catch (e) { /* proceed with cached data */ }
        
        const user = this.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
        if (user) {
            const sessionUser = { ...user };
            delete sessionUser.password;
            localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionUser));
            return { success: true, user: sessionUser };
        }
        return { success: false, error: 'Invalid credentials' };
    },

    getSession() {
        try {
            return JSON.parse(localStorage.getItem(this.SESSION_KEY));
        } catch { return null; }
    },

    clearSession() { localStorage.removeItem(this.SESSION_KEY); },
    
    // Alias for getSession (for compatibility)
    getCurrentUser() { return this.getSession(); },
    
    // Set current user session (called after login)
    setCurrentUser(user) {
        if (!user) return;
        const sessionUser = { ...user };
        delete sessionUser.password;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionUser));
    },

    getAll() { return this.users.map(u => ({ ...u, password: undefined })); },
    getById(id) { return this.users.find(u => u.id === id); },
    getByEmail(email) { return this.users.find(u => u.email.toLowerCase() === email.toLowerCase()); },

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
        
        // Sync to GitHub
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) {
            GitHubSync.syncUsers().catch(e => console.warn('[UserStore] Sync failed:', e));
        }
        
        return { success: true, user: { ...user, password: undefined } };
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
        
        this.users[idx] = { ...this.users[idx], ...updates, updatedAt: new Date().toISOString() };
        this.saveToStorage();
        
        // Sync to GitHub and WAIT for completion
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) {
            try {
                await GitHubSync.syncUsers();
                console.log(`[UserStore] User ${id} updated and synced to GitHub`);
            } catch (e) {
                console.warn('[UserStore] GitHub sync failed, but local save succeeded:', e.message);
            }
        }
        
        return { success: true, user: { ...this.users[idx], password: undefined } };
    },

    delete(id) {
        const idx = this.users.findIndex(u => u.id === id);
        if (idx === -1) return { success: false, error: 'User not found' };
        this.users.splice(idx, 1);
        this.saveToStorage();
        
        if (GitHubSync.hasToken() && GitHubSync.autoSyncEnabled) {
            GitHubSync.syncUsers().catch(e => console.warn('[UserStore] Sync failed:', e));
        }
        
        return { success: true };
    },

    exportForGitHub() {
        return JSON.stringify({
            version: '2.4.0',
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
            const response = await fetch(`https://raw.githubusercontent.com/SecureEnergyServicesLLC/SESSalesResources/main/data/activity-log.json?t=${Date.now()}`);
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

    logUsageEntry(params) {
        return this.log({
            userId: params.userId, userEmail: params.userEmail, userName: params.userName,
            widget: 'energy-utilization', action: 'Usage Entry',
            clientName: params.clientName,
            data: {
                clientId: params.clientId,
                clientName: params.clientName,
                accountId: params.accountId || null,
                accountName: params.accountName || null,
                totalElectric: params.totalElectric || 0,
                totalGas: params.totalGas || 0,
                electricData: params.electricData || [],
                gasData: params.gasData || []
            }
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
    countUsageEntries(todayOnly = false) { return this.countByAction('Usage Entry', todayOnly); },

    getActivityStats() {
        return {
            logins: { today: this.countLogins(true), total: this.countLogins(false) },
            lmpAnalyses: { today: this.countLMPAnalyses(true), total: this.countLMPAnalyses(false) },
            lmpExports: { today: this.countLMPExports(true), total: this.countLMPExports(false) },
            aiQueries: { today: this.countAIQueries(true), total: this.countAIQueries(false) },
            buttonClicks: { today: this.countButtonClicks(true), total: this.countButtonClicks(false) },
            usageEntries: { today: this.countUsageEntries(true), total: this.countUsageEntries(false) },
            totalActivities: this.activities.length
        };
    },

    exportForGitHub() {
        return JSON.stringify({ version: '2.3.0', lastUpdated: new Date().toISOString(), activities: this.activities }, null, 2);
    }
};


// =====================================================
// TICKET STORE - Support Ticket Management
// =====================================================
const TicketStore = {
    STORAGE_KEY: 'secureEnergy_tickets',
    GITHUB_TICKETS_URL: 'https://raw.githubusercontent.com/SecureEnergyServicesLLC/SESSalesResources/main/data/tickets.json',
    tickets: [],
    ticketActivityLog: [],
    _syncTimeout: null,
    _initialized: false,

    async init() {
        console.log('[TicketStore] Initializing...');
        
        // Load from localStorage first
        const cached = this.loadFromStorage();
        if (cached) {
            this.tickets = cached.tickets || [];
            this.ticketActivityLog = cached.activityLog || [];
        }
        
        // Try to fetch from GitHub
        try {
            await this.pullFromGitHub();
        } catch (e) {
            console.warn('[TicketStore] GitHub pull failed:', e.message);
        }
        
        this._initialized = true;
        console.log(`[TicketStore] ${this.tickets.length} tickets loaded`);
        return this.tickets;
    },

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            console.error('[TicketStore] Load from storage failed:', e);
            return null;
        }
    },

    saveToStorage() {
        try {
            const data = {
                tickets: this.tickets,
                activityLog: this.ticketActivityLog,
                lastUpdated: new Date().toISOString()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('[TicketStore] Save to storage failed:', e);
        }
    },

    async pullFromGitHub() {
        try {
            const url = `${this.GITHUB_TICKETS_URL}?t=${Date.now()}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                if (response.status === 404) {
                    console.log('[TicketStore] Tickets file not found on GitHub (will be created on first save)');
                }
                return;
            }
            
            const data = await response.json();
            
            if (data?.tickets) {
                this.mergeFromGitHub(data.tickets);
            }
        } catch (e) {
            console.warn('[TicketStore] GitHub fetch failed:', e.message);
        }
    },

    mergeFromGitHub(remoteTickets) {
        if (!remoteTickets || !Array.isArray(remoteTickets)) return;
        
        const localIds = new Set(this.tickets.map(t => t.id));
        let added = 0, updated = 0;
        
        remoteTickets.forEach(remoteTicket => {
            const localTicket = this.tickets.find(t => t.id === remoteTicket.id);
            
            if (!localTicket) {
                // New ticket from GitHub
                this.tickets.push(remoteTicket);
                added++;
            } else if (remoteTicket.updatedAt > localTicket.updatedAt) {
                // Remote is newer, update local
                const idx = this.tickets.findIndex(t => t.id === remoteTicket.id);
                this.tickets[idx] = remoteTicket;
                updated++;
            }
        });
        
        // Sort by createdAt descending
        this.tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        if (added > 0 || updated > 0) {
            this.saveToStorage();
            console.log(`[TicketStore] Merged from GitHub: ${added} added, ${updated} updated`);
        }
    },

    async getTickets() {
        if (!this._initialized) await this.init();
        return {
            tickets: this.tickets,
            activityLog: this.ticketActivityLog,
            lastUpdated: new Date().toISOString()
        };
    },

    async saveTickets(data) {
        if (data?.tickets) {
            this.tickets = data.tickets;
        }
        if (data?.activityLog) {
            this.ticketActivityLog = data.activityLog;
        }
        
        this.saveToStorage();
        this._scheduleSyncToGitHub();
        
        return true;
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
    window.SecureEnergyData = SecureEnergyData;
    window.UserStore = UserStore;
    window.ActivityLog = ActivityLog;
    window.GitHubSync = GitHubSync;
    window.ErrorLog = ErrorLog;
    window.WidgetPreferences = WidgetPreferences;
    window.UsageProfileStore = UsageProfileStore;
    window.TicketStore = TicketStore;
    
    ErrorLog.init();
    GitHubSync.init();
    WidgetPreferences.init();
    
    // UsageProfileStore.init() is async - it will fetch from GitHub
    // We call it without await so it doesn't block, but it will complete in background
    UsageProfileStore.init().then(() => {
        console.log('[SharedDataStore] UsageProfileStore initialized with GitHub data');
        // Dispatch event so widgets know profiles are ready
        try {
            window.dispatchEvent(new CustomEvent('usageProfilesReady', { 
                detail: { profiles: UsageProfileStore.getAll() }
            }));
        } catch (e) { /* ignore */ }
    }).catch(e => {
        console.warn('[SharedDataStore] UsageProfileStore init failed:', e.message);
    });
    
    // TicketStore.init() is async - it will fetch from GitHub
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
    
    window.resetUserStore = () => { localStorage.removeItem('secureEnergy_users'); localStorage.removeItem('secureEnergy_currentUser'); location.reload(); };
    window.resetActivityLog = () => { localStorage.removeItem('secureEnergy_activityLog'); location.reload(); };
    window.resetErrorLog = () => { ErrorLog.clearAll(); };
    window.resetWidgetPrefs = () => { localStorage.removeItem('secureEnergy_widgetPrefs'); location.reload(); };
    window.resetUsageProfiles = () => { localStorage.removeItem('secureEnergy_usageProfiles'); localStorage.removeItem('secureEnergy_activeUsageProfile'); location.reload(); };
    window.resetTicketStore = () => { localStorage.removeItem('secureEnergy_tickets'); location.reload(); };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SecureEnergyData, UserStore, ActivityLog, GitHubSync, ErrorLog, WidgetPreferences, UsageProfileStore, TicketStore };
}

/**
 * Secure Energy Shared Data Store v2.0
 * Centralized data management for LMP data, user authentication, and activity logging
 * Supports GitHub Pages hosting with JSON file persistence
 */

// =====================================================
// LMP DATA STORE
// =====================================================
const SecureEnergyData = {
    STORAGE_KEY: 'secureEnergy_LMP_Data',
    DATA_URL: 'data/lmp-database.json', // GitHub hosted JSON
    subscribers: [],
    data: null,
    isLoaded: false,

    /**
     * Initialize the data store - attempts to load from GitHub JSON first
     */
    async init() {
        console.log('[SecureEnergyData] Initializing...');
        
        // First try to load from localStorage (cached data)
        const cached = this.loadFromStorage();
        if (cached && cached.records && cached.records.length > 0) {
            this.data = cached;
            this.isLoaded = true;
            console.log(`[SecureEnergyData] Loaded ${cached.records.length} records from cache`);
        }
        
        // Then try to load fresh data from GitHub JSON
        try {
            await this.loadFromGitHub();
        } catch (e) {
            console.warn('[SecureEnergyData] Could not load from GitHub, using cached data');
        }
        
        this.notifySubscribers();
        return this.data;
    },

    /**
     * Load data from GitHub hosted JSON file
     */
    async loadFromGitHub() {
        try {
            const response = await fetch(this.DATA_URL + '?t=' + Date.now()); // Cache bust
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const jsonData = await response.json();
            
            if (jsonData && jsonData.records && jsonData.records.length > 0) {
                this.data = {
                    records: jsonData.records,
                    meta: jsonData.meta || {
                        source: 'GitHub',
                        loadedAt: new Date().toISOString(),
                        version: jsonData.version
                    }
                };
                this.isLoaded = true;
                this.saveToStorage();
                console.log(`[SecureEnergyData] Loaded ${jsonData.records.length} records from GitHub`);
                this.notifySubscribers();
                return true;
            }
        } catch (e) {
            console.warn('[SecureEnergyData] GitHub load failed:', e.message);
            return false;
        }
    },

    /**
     * Load from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('[SecureEnergyData] Storage read error:', e);
        }
        return null;
    },

    /**
     * Save to localStorage (cache)
     */
    saveToStorage() {
        try {
            if (this.data) {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
            }
        } catch (e) {
            console.error('[SecureEnergyData] Storage write error:', e);
        }
    },

    /**
     * Load data from CSV content
     */
    loadFromCSV(csvContent, source = 'CSV Upload') {
        try {
            const lines = csvContent.trim().split('\n');
            if (lines.length < 2) {
                throw new Error('CSV file is empty or has no data rows');
            }

            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const records = [];

            for (let i = 1; i < lines.length; i++) {
                const values = this.parseCSVLine(lines[i]);
                if (values.length >= headers.length) {
                    const record = {};
                    headers.forEach((header, idx) => {
                        record[header] = values[idx]?.trim() || '';
                    });
                    
                    // Normalize field names
                    const normalized = this.normalizeRecord(record);
                    if (normalized.iso && normalized.zone) {
                        records.push(normalized);
                    }
                }
            }

            if (records.length === 0) {
                throw new Error('No valid records found in CSV');
            }

            this.data = {
                records: records,
                meta: {
                    source: source,
                    loadedAt: new Date().toISOString(),
                    recordCount: records.length
                }
            };
            
            this.isLoaded = true;
            this.saveToStorage();
            this.notifySubscribers();
            
            console.log(`[SecureEnergyData] Loaded ${records.length} records from CSV`);
            return { success: true, count: records.length };
        } catch (e) {
            console.error('[SecureEnergyData] CSV parse error:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Parse CSV line handling quoted values
     */
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    },

    /**
     * Normalize record field names
     */
    normalizeRecord(record) {
        return {
            iso: record.iso || record.isoname || record.iso_name || '',
            zone: record.zone || record.zonename || record.zone_name || record.pnodename || '',
            zoneId: record.zoneid || record.zone_id || record.pnodeid || '',
            year: record.year || '',
            month: record.month || '',
            lmp: parseFloat(record.lmp || record.price || record.averagelmp || 0),
            energy: parseFloat(record.energy || record.energycomponent || 0),
            congestion: parseFloat(record.congestion || record.congestioncomponent || 0),
            loss: parseFloat(record.loss || record.losscomponent || 0)
        };
    },

    /**
     * Get all records
     */
    getRecords() {
        return this.data?.records || [];
    },

    /**
     * Get records filtered by ISO
     */
    getByISO(iso) {
        const records = this.getRecords();
        return records.filter(r => r.iso?.toUpperCase() === iso?.toUpperCase());
    },

    /**
     * Get unique ISOs
     */
    getISOs() {
        const records = this.getRecords();
        return [...new Set(records.map(r => r.iso).filter(Boolean))];
    },

    /**
     * Get zones for an ISO
     */
    getZones(iso) {
        const records = this.getByISO(iso);
        const zones = [...new Set(records.map(r => r.zone).filter(Boolean))];
        return zones.sort();
    },

    /**
     * Get years available in data
     */
    getYears() {
        const records = this.getRecords();
        const years = [...new Set(records.map(r => r.year).filter(Boolean))];
        return years.sort();
    },

    /**
     * Get LMP data for specific zone and time period
     */
    getLMPData(iso, zone, year, month = null) {
        const records = this.getRecords();
        return records.filter(r => {
            const matchISO = r.iso?.toUpperCase() === iso?.toUpperCase();
            const matchZone = r.zone === zone;
            const matchYear = r.year == year;
            const matchMonth = month ? r.month == month : true;
            return matchISO && matchZone && matchYear && matchMonth;
        });
    },

    /**
     * Calculate average LMP
     */
    getAverageLMP(iso, zone, year) {
        const data = this.getLMPData(iso, zone, year);
        if (data.length === 0) return null;
        
        const sum = data.reduce((acc, r) => acc + (r.lmp || 0), 0);
        return sum / data.length;
    },

    /**
     * Get statistics
     */
    getStats() {
        const records = this.getRecords();
        return {
            totalRecords: records.length,
            isoCount: this.getISOs().length,
            yearRange: this.getYears(),
            isLoaded: this.isLoaded,
            lastUpdate: this.data?.meta?.loadedAt || null
        };
    },

    /**
     * Subscribe to data changes
     */
    subscribe(callback) {
        if (typeof callback === 'function') {
            this.subscribers.push(callback);
        }
    },

    /**
     * Notify all subscribers
     */
    notifySubscribers() {
        this.subscribers.forEach(cb => {
            try {
                cb(this.data);
            } catch (e) {
                console.error('[SecureEnergyData] Subscriber error:', e);
            }
        });
        
        // Also broadcast via postMessage for iframe widgets
        window.postMessage({
            type: 'LMP_DATA_UPDATE',
            stats: this.getStats()
        }, '*');
    },

    /**
     * Clear all data
     */
    clear() {
        this.data = null;
        this.isLoaded = false;
        localStorage.removeItem(this.STORAGE_KEY);
        this.notifySubscribers();
    },

    /**
     * Export data as JSON for GitHub update
     */
    exportForGitHub() {
        return JSON.stringify({
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            meta: this.data?.meta || {},
            records: this.getRecords()
        }, null, 2);
    }
};


// =====================================================
// USER DATA STORE
// =====================================================
const UserStore = {
    STORAGE_KEY: 'secureEnergy_users',
    SESSION_KEY: 'secureEnergy_currentUser',
    USERS_URL: 'data/users.json', // GitHub hosted JSON
    users: [],
    isLoaded: false,

    /**
     * Default admin user (fallback if JSON fails to load)
     */
    defaultAdmin: {
        id: 'admin-001',
        firstName: 'System',
        lastName: 'Administrator',
        email: 'admin@sesenergy.org',
        password: 'admin123',
        role: 'admin',
        status: 'active',
        createdAt: new Date().toISOString(),
        permissions: {
            'lmp-comparison': true,
            'data-manager': true,
            'arcadia-fetcher': true,
            'user-admin': true
        }
    },

    /**
     * Initialize - load from GitHub then localStorage
     */
    async init() {
        console.log('[UserStore] Initializing...');
        
        // First check localStorage for cached users
        const cached = this.loadFromStorage();
        if (cached && Array.isArray(cached) && cached.length > 0) {
            this.users = cached;
            console.log(`[UserStore] Loaded ${cached.length} users from cache`);
        }
        
        // Try to load from GitHub (will override cache if successful)
        try {
            await this.loadFromGitHub();
        } catch (e) {
            console.warn('[UserStore] GitHub load failed:', e.message);
        }
        
        // If still no users, create default admin
        if (!this.users || this.users.length === 0) {
            console.log('[UserStore] No users found, creating default admin');
            this.users = [this.defaultAdmin];
            this.saveToStorage();
        }
        
        // Ensure default admin always exists
        const hasAdmin = this.users.some(u => u.id === 'admin-001');
        if (!hasAdmin) {
            console.log('[UserStore] Default admin missing, adding it');
            this.users.unshift(this.defaultAdmin);
            this.saveToStorage();
        }
        
        this.isLoaded = true;
        console.log('[UserStore] Ready with', this.users.length, 'users');
        return this.users;
    },

    /**
     * Load users from GitHub JSON
     */
    async loadFromGitHub() {
        const response = await fetch(this.USERS_URL + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (data && data.users && data.users.length > 0) {
            this.users = data.users;
            this.saveToStorage();
            console.log(`[UserStore] Loaded ${data.users.length} users from GitHub`);
            return true;
        }
        return false;
    },

    /**
     * Load from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    },

    /**
     * Save to localStorage
     */
    saveToStorage() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.users));
    },

    /**
     * Get all users
     */
    getAll() {
        return this.users;
    },

    /**
     * Find user by email
     */
    findByEmail(email) {
        return this.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    },

    /**
     * Find user by ID
     */
    findById(id) {
        return this.users.find(u => u.id === id);
    },

    /**
     * Create new user
     */
    create(userData) {
        if (this.findByEmail(userData.email)) {
            throw new Error('A user with this email already exists');
        }

        const newUser = {
            id: 'user-' + Date.now(),
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: userData.email,
            password: userData.password,
            role: userData.role || 'user',
            status: 'active',
            createdAt: new Date().toISOString(),
            permissions: userData.permissions || this.getDefaultPermissions(userData.role)
        };

        this.users.push(newUser);
        this.saveToStorage();
        return newUser;
    },

    /**
     * Update user
     */
    update(id, updates) {
        const index = this.users.findIndex(u => u.id === id);
        if (index === -1) throw new Error('User not found');

        // Protect default admin
        if (id === 'admin-001') {
            delete updates.email;
            delete updates.role;
        }

        this.users[index] = { ...this.users[index], ...updates };
        this.saveToStorage();
        return this.users[index];
    },

    /**
     * Delete user
     */
    delete(id) {
        if (id === 'admin-001') {
            throw new Error('Cannot delete the system administrator');
        }
        this.users = this.users.filter(u => u.id !== id);
        this.saveToStorage();
    },

    /**
     * Get default permissions by role
     */
    getDefaultPermissions(role) {
        if (role === 'admin') {
            return {
                'lmp-comparison': true,
                'lmp-analytics': true,
                'data-manager': true,
                'arcadia-fetcher': true,
                'user-admin': true,
                'analysis-history': true
            };
        }
        return {
            'lmp-comparison': true,
            'lmp-analytics': true,
            'data-manager': false,
            'arcadia-fetcher': false,
            'user-admin': false,
            'analysis-history': true
        };
    },

    /**
     * Authenticate user
     */
    authenticate(email, password) {
        console.log('[UserStore] Authenticating:', email);
        console.log('[UserStore] Available users:', this.users.map(u => u.email));
        
        const user = this.findByEmail(email);
        if (!user) {
            console.log('[UserStore] User not found');
            return { success: false, error: 'User not found' };
        }
        if (user.password !== password) {
            console.log('[UserStore] Invalid password');
            return { success: false, error: 'Invalid password' };
        }
        if (user.status !== 'active') {
            console.log('[UserStore] Account inactive');
            return { success: false, error: 'Account is inactive' };
        }
        console.log('[UserStore] Authentication successful');
        return { success: true, user };
    },

    /**
     * Session management
     */
    setCurrentUser(user) {
        const sessionUser = { ...user };
        delete sessionUser.password;
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionUser));
    },

    getCurrentUser() {
        try {
            const data = localStorage.getItem(this.SESSION_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    },

    clearSession() {
        localStorage.removeItem(this.SESSION_KEY);
    },

    /**
     * Export users for GitHub update
     */
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
    LOG_URL: 'data/activity-log.json',
    activities: [],

    /**
     * Initialize
     */
    async init() {
        console.log('[ActivityLog] Initializing...');
        
        // Try GitHub first
        try {
            await this.loadFromGitHub();
        } catch (e) {
            console.warn('[ActivityLog] GitHub load failed');
        }
        
        // Load from localStorage
        const cached = this.loadFromStorage();
        if (cached && cached.length > 0) {
            // Merge - avoid duplicates by ID
            const existingIds = new Set(this.activities.map(a => a.id));
            cached.forEach(a => {
                if (!existingIds.has(a.id)) {
                    this.activities.push(a);
                }
            });
        }
        
        console.log(`[ActivityLog] ${this.activities.length} activities loaded`);
        return this.activities;
    },

    /**
     * Load from GitHub
     */
    async loadFromGitHub() {
        const response = await fetch(this.LOG_URL + '?t=' + Date.now());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (data && data.activities) {
            this.activities = data.activities;
            return true;
        }
        return false;
    },

    /**
     * Load from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    },

    /**
     * Save to localStorage
     */
    saveToStorage() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.activities));
    },

    /**
     * Log an activity
     */
    log(activity) {
        const entry = {
            id: 'activity-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
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

        this.activities.unshift(entry); // Add to beginning
        this.saveToStorage();
        
        console.log('[ActivityLog] Logged:', entry.action, entry.widget);
        return entry;
    },

    /**
     * Log LMP Analysis
     */
    logLMPAnalysis(params) {
        return this.log({
            userId: params.userId,
            userEmail: params.userEmail,
            userName: params.userName,
            widget: 'lmp-comparison',
            action: 'LMP Analysis',
            clientName: params.clientName,
            data: {
                iso: params.iso,
                zone: params.zone,
                baselineYear: params.baselineYear,
                comparisonYears: params.comparisonYears,
                rate: params.rate,
                usage: params.usage,
                results: params.results
            },
            notes: params.notes
        });
    },

    /**
     * Get all activities
     */
    getAll() {
        return this.activities;
    },

    /**
     * Get activities by user
     */
    getByUser(userId) {
        return this.activities.filter(a => a.userId === userId);
    },

    /**
     * Get activities by widget
     */
    getByWidget(widget) {
        return this.activities.filter(a => a.widget === widget);
    },

    /**
     * Get activities by client
     */
    getByClient(clientName) {
        return this.activities.filter(a => 
            a.clientName?.toLowerCase().includes(clientName.toLowerCase())
        );
    },

    /**
     * Get recent activities
     */
    getRecent(count = 50) {
        return this.activities.slice(0, count);
    },

    /**
     * Export for GitHub
     */
    exportForGitHub() {
        return JSON.stringify({
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            activities: this.activities
        }, null, 2);
    }
};


// =====================================================
// INITIALIZATION
// =====================================================
// Auto-initialize when script loads
if (typeof window !== 'undefined') {
    window.SecureEnergyData = SecureEnergyData;
    window.UserStore = UserStore;
    window.ActivityLog = ActivityLog;
    
    // Debug/Reset function - call from console: resetUserStore()
    window.resetUserStore = function() {
        localStorage.removeItem('secureEnergy_users');
        localStorage.removeItem('secureEnergy_currentUser');
        console.log('[UserStore] Reset complete. Refresh the page.');
        location.reload();
    };
    
    // Listen for cross-window messages
    window.addEventListener('message', function(event) {
        if (event.data?.type === 'LMP_DATA_REQUEST') {
            window.postMessage({
                type: 'LMP_DATA_RESPONSE',
                data: SecureEnergyData.data,
                stats: SecureEnergyData.getStats()
            }, '*');
        }
    });
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SecureEnergyData, UserStore, ActivityLog };
}

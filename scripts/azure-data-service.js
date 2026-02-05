/**
 * SES Portal - Azure Secure Data Service
 * Version: 1.0.0
 * 
 * Replaces direct GitHub data fetches with secure Azure API calls.
 * Drop this into your scripts folder and update your stores to use it.
 */

const AzureDataService = (function() {
    'use strict';

    // ==========================================
    // CONFIGURATION - UPDATE THESE VALUES
    // ==========================================
    
    const CONFIG = {
        // Your Azure Function API endpoint
        apiBase: 'https://ses-data-api-gpaqghfbehhrb6c2.eastus-01.azurewebsites.net/api/data',
        
        // API key storage key in localStorage
        apiKeyStorageKey: 'ses_azure_api_key',
        
        // Cache settings (milliseconds)
        cacheTimeout: 5 * 60 * 1000, // 5 minutes
        
        // Request timeout
        timeout: 30000 // 30 seconds
    };

    // ==========================================
    // INTERNAL STATE
    // ==========================================
    
    const cache = new Map();
    let currentApiKey = null;

    // ==========================================
    // API KEY MANAGEMENT
    // ==========================================

    function getApiKey() {
        if (currentApiKey) return currentApiKey;
        
        // Try sessionStorage first (more secure)
        let key = sessionStorage.getItem(CONFIG.apiKeyStorageKey);
        if (!key) {
            // Fallback to localStorage
            key = localStorage.getItem(CONFIG.apiKeyStorageKey);
        }
        currentApiKey = key;
        return key;
    }

    function setApiKey(apiKey, persistent = true) {
        currentApiKey = apiKey;
        sessionStorage.setItem(CONFIG.apiKeyStorageKey, apiKey);
        if (persistent) {
            localStorage.setItem(CONFIG.apiKeyStorageKey, apiKey);
        }
        console.log('[AzureDataService] API key configured');
    }

    function clearApiKey() {
        currentApiKey = null;
        sessionStorage.removeItem(CONFIG.apiKeyStorageKey);
        localStorage.removeItem(CONFIG.apiKeyStorageKey);
        cache.clear();
    }

    function isConfigured() {
        return !!getApiKey();
    }

    // ==========================================
    // CACHE MANAGEMENT
    // ==========================================

    function getCached(filename) {
        const cached = cache.get(filename);
        if (cached && (Date.now() - cached.timestamp) < CONFIG.cacheTimeout) {
            console.log(`[AzureDataService] Cache hit: ${filename}`);
            return cached.data;
        }
        return null;
    }

    function setCache(filename, data) {
        cache.set(filename, { data, timestamp: Date.now() });
    }

    function clearCache(filename = null) {
        if (filename) {
            cache.delete(filename);
        } else {
            cache.clear();
        }
    }

    // ==========================================
    // CORE HTTP METHODS
    // ==========================================

    async function request(method, filename, recordId = null, body = null, options = {}) {
        const apiKey = getApiKey();
        
        if (!apiKey) {
            throw new Error('API key not configured. Call AzureDataService.setApiKey() first.');
        }

        // Build URL
        let url = `${CONFIG.apiBase}/${filename}`;
        if (recordId) {
            url += `/${recordId}`;
        }

        // Check cache for GET requests
        if (method === 'GET' && !recordId && !options.bypassCache) {
            const cached = getCached(filename);
            if (cached) return cached;
        }

        // Setup request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

        try {
            const fetchOptions = {
                method,
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            };

            if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                fetchOptions.body = JSON.stringify(body);
            }

            console.log(`[AzureDataService] ${method} ${filename}${recordId ? '/' + recordId : ''}`);
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                const error = new Error(errorBody.message || `Request failed: ${response.status}`);
                error.status = response.status;
                error.code = response.status === 401 ? 'UNAUTHORIZED' : 
                            response.status === 403 ? 'FORBIDDEN' :
                            response.status === 404 ? 'NOT_FOUND' : 'SERVER_ERROR';
                throw error;
            }

            const data = await response.json();

            // Cache GET responses
            if (method === 'GET' && !recordId) {
                setCache(filename, data);
            }

            // Invalidate cache after writes
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
                clearCache(filename);
            }

            return data;

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            throw error;
        }
    }

    // ==========================================
    // PUBLIC API - GENERIC CRUD
    // ==========================================

    async function get(filename, options = {}) {
        return request('GET', filename, null, null, options);
    }

    async function getById(filename, id) {
        return request('GET', filename, id);
    }

    async function create(filename, data) {
        return request('POST', filename, null, data);
    }

    async function update(filename, id, data) {
        return request('PUT', filename, id, data);
    }

    async function remove(filename, id) {
        return request('DELETE', filename, id);
    }

    async function save(filename, data) {
        // Replace entire file
        return request('POST', filename, null, data);
    }

    // ==========================================
    // PUBLIC API - SPECIFIC DATA TYPES
    // ==========================================

    // Clients
    async function getClients(options = {}) {
        return get('clients.json', options);
    }

    async function saveClients(clients) {
        return save('clients.json', clients);
    }

    // Users
    async function getUsers(options = {}) {
        return get('users.json', options);
    }

    async function saveUsers(users) {
        return save('users.json', users);
    }

    // Accounts
    async function getAccounts(options = {}) {
        return get('accounts.json', options);
    }

    // Contracts
    async function getContracts(options = {}) {
        return get('contracts.json', options);
    }

    // Energy Profiles
    async function getEnergyProfiles(options = {}) {
        return get('energy-profiles.json', options);
    }

    async function createEnergyProfile(profile) {
        return create('energy-profiles.json', profile);
    }

    async function updateEnergyProfile(id, profile) {
        return update('energy-profiles.json', id, profile);
    }

    async function deleteEnergyProfile(id) {
        return remove('energy-profiles.json', id);
    }

    // Usage Profiles
    async function getUsageProfiles(options = {}) {
        return get('usage-profiles.json', options);
    }

    async function saveUsageProfiles(profiles) {
        return save('usage-profiles.json', profiles);
    }

    // LMP Database
    async function getLmpDatabase(options = {}) {
        return get('lmp-database.json', options);
    }

    // Activity Log
    async function getActivityLog(options = {}) {
        return get('activity-log.json', options);
    }

    async function saveActivityLog(log) {
        return save('activity-log.json', log);
    }

    // Analysis Records (full analysis history with calculation results)
    async function getAnalyses(options = {}) {
        return get('analyses.json', options);
    }

    async function saveAnalyses(analyses) {
        return save('analyses.json', analyses);
    }

    // ==========================================
    // INITIALIZATION HELPER
    // ==========================================

    function init(apiKey = null) {
        if (apiKey) {
            setApiKey(apiKey);
        }
        
        // Check if we have a stored key
        if (!isConfigured()) {
            console.warn('[AzureDataService] No API key configured. Data fetches will fail.');
            return false;
        }
        
        console.log('[AzureDataService] Initialized successfully');
        return true;
    }

    // ==========================================
    // EXPOSE PUBLIC API
    // ==========================================

    return {
        // Configuration
        init,
        setApiKey,
        clearApiKey,
        isConfigured,
        clearCache,
        
        // Generic CRUD
        get,
        getById,
        create,
        update,
        remove,
        save,
        
        // Specific data types
        getClients,
        saveClients,
        getUsers,
        saveUsers,
        getAccounts,
        getContracts,
        getEnergyProfiles,
        createEnergyProfile,
        updateEnergyProfile,
        deleteEnergyProfile,
        getUsageProfiles,
        saveUsageProfiles,
        getLmpDatabase,
        getActivityLog,
        saveActivityLog,
        getAnalyses,
        saveAnalyses,
        
        // Config access (read-only)
        get apiBase() { return CONFIG.apiBase; }
    };
})();

// Make available globally
window.AzureDataService = AzureDataService;

console.log('[AzureDataService] Module loaded');

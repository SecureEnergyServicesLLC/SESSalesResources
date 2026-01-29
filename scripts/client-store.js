/**
 * Client Store - Centralized Client Management
 * Provides unique client identifiers (CID) across all portal widgets
 * Version: 1.0.0
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'secureEnergy_clients';
    const GITHUB_FILE = 'data/clients.json';
    
    let clients = {};
    let subscribers = [];

    // ========================================
    // Initialization
    // ========================================
    function init() {
        loadFromStorage();
        console.log('[ClientStore] Initialized with', Object.keys(clients).length, 'clients');
        return getStats();
    }

    function loadFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                clients = JSON.parse(stored);
            }
        } catch (e) {
            console.error('[ClientStore] Load error:', e);
            clients = {};
        }
    }

    function saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
            notifySubscribers('save', clients);
        } catch (e) {
            console.error('[ClientStore] Save error:', e);
        }
    }

    // ========================================
    // Client ID Generation
    // ========================================
    function generateClientId() {
        // Format: CID-YYYYMMDD-XXXXX (e.g., CID-20260129-A3B7F)
        const date = new Date();
        const dateStr = date.getFullYear().toString() +
            (date.getMonth() + 1).toString().padStart(2, '0') +
            date.getDate().toString().padStart(2, '0');
        const random = Math.random().toString(36).substring(2, 7).toUpperCase();
        return `CID-${dateStr}-${random}`;
    }

    // ========================================
    // CRUD Operations
    // ========================================
    function createClient(clientData) {
        const clientId = generateClientId();
        const timestamp = new Date().toISOString();
        
        const client = {
            id: clientId,
            name: clientData.name || '',
            companyName: clientData.companyName || clientData.name || '',
            contactName: clientData.contactName || '',
            contactEmail: clientData.contactEmail || '',
            contactPhone: clientData.contactPhone || '',
            address: {
                street: clientData.street || '',
                city: clientData.city || '',
                state: clientData.state || '',
                zip: clientData.zip || ''
            },
            locations: clientData.locations || [],
            iso: clientData.iso || '',
            utility: clientData.utility || '',
            accountNumbers: clientData.accountNumbers || [],
            annualUsage: clientData.annualUsage || 0,
            usageUnit: clientData.usageUnit || 'kWh',
            commodityType: clientData.commodityType || 'electric', // electric, gas, both
            salesRepId: clientData.salesRepId || null,
            salesRepName: clientData.salesRepName || '',
            notes: clientData.notes || '',
            tags: clientData.tags || [],
            status: 'active',
            lmpAnalysisIds: [], // Track linked LMP analyses
            bidIds: [], // Track linked bids
            createdAt: timestamp,
            updatedAt: timestamp,
            createdBy: clientData.createdBy || 'system'
        };
        
        clients[clientId] = client;
        saveToStorage();
        notifySubscribers('create', client);
        
        return { success: true, client };
    }

    function updateClient(clientId, updates) {
        if (!clients[clientId]) {
            return { success: false, error: 'Client not found' };
        }
        
        const client = clients[clientId];
        
        // Update allowed fields
        const allowedFields = [
            'name', 'companyName', 'contactName', 'contactEmail', 'contactPhone',
            'address', 'locations', 'iso', 'utility', 'accountNumbers',
            'annualUsage', 'usageUnit', 'commodityType', 'salesRepId', 'salesRepName',
            'notes', 'tags', 'status'
        ];
        
        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                if (field === 'address' && typeof updates[field] === 'object') {
                    client.address = { ...client.address, ...updates[field] };
                } else {
                    client[field] = updates[field];
                }
            }
        });
        
        client.updatedAt = new Date().toISOString();
        saveToStorage();
        notifySubscribers('update', client);
        
        return { success: true, client };
    }

    function getClient(clientId) {
        return clients[clientId] || null;
    }

    function getClientByName(name) {
        return Object.values(clients).find(c => 
            c.name.toLowerCase() === name.toLowerCase() ||
            c.companyName.toLowerCase() === name.toLowerCase()
        ) || null;
    }

    function getAllClients() {
        return Object.values(clients).filter(c => c.status !== 'deleted');
    }

    function getActiveClients() {
        return Object.values(clients).filter(c => c.status === 'active');
    }

    function getClientsBySalesRep(salesRepId) {
        return Object.values(clients).filter(c => 
            c.salesRepId === salesRepId && c.status === 'active'
        );
    }

    function searchClients(query) {
        const q = query.toLowerCase();
        return Object.values(clients).filter(c => 
            c.status !== 'deleted' && (
                c.name.toLowerCase().includes(q) ||
                c.companyName.toLowerCase().includes(q) ||
                c.contactName.toLowerCase().includes(q) ||
                c.id.toLowerCase().includes(q)
            )
        );
    }

    function deleteClient(clientId, permanent = false) {
        if (!clients[clientId]) {
            return { success: false, error: 'Client not found' };
        }
        
        if (permanent) {
            delete clients[clientId];
        } else {
            clients[clientId].status = 'deleted';
            clients[clientId].deletedAt = new Date().toISOString();
        }
        
        saveToStorage();
        notifySubscribers('delete', { id: clientId, permanent });
        
        return { success: true };
    }

    // ========================================
    // Location Management
    // ========================================
    function addLocation(clientId, location) {
        const client = clients[clientId];
        if (!client) {
            return { success: false, error: 'Client not found' };
        }
        
        const locationId = `LOC-${Date.now().toString(36).toUpperCase()}`;
        const newLocation = {
            id: locationId,
            name: location.name || `Location ${client.locations.length + 1}`,
            address: location.address || '',
            city: location.city || '',
            state: location.state || '',
            zip: location.zip || '',
            iso: location.iso || client.iso,
            zone: location.zone || '',
            utility: location.utility || client.utility,
            accountNumber: location.accountNumber || '',
            meterNumber: location.meterNumber || '',
            annualUsage: location.annualUsage || 0,
            usageUnit: location.usageUnit || 'kWh',
            rateClass: location.rateClass || '',
            loadProfile: location.loadProfile || '',
            peakDemand: location.peakDemand || 0,
            notes: location.notes || '',
            createdAt: new Date().toISOString()
        };
        
        client.locations.push(newLocation);
        client.updatedAt = new Date().toISOString();
        saveToStorage();
        notifySubscribers('locationAdd', { clientId, location: newLocation });
        
        return { success: true, location: newLocation };
    }

    function updateLocation(clientId, locationId, updates) {
        const client = clients[clientId];
        if (!client) {
            return { success: false, error: 'Client not found' };
        }
        
        const locationIndex = client.locations.findIndex(l => l.id === locationId);
        if (locationIndex === -1) {
            return { success: false, error: 'Location not found' };
        }
        
        client.locations[locationIndex] = { ...client.locations[locationIndex], ...updates };
        client.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true, location: client.locations[locationIndex] };
    }

    function removeLocation(clientId, locationId) {
        const client = clients[clientId];
        if (!client) {
            return { success: false, error: 'Client not found' };
        }
        
        client.locations = client.locations.filter(l => l.id !== locationId);
        client.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true };
    }

    // ========================================
    // Link Management (for LMP & Bids)
    // ========================================
    function linkLMPAnalysis(clientId, analysisId) {
        const client = clients[clientId];
        if (!client) return { success: false, error: 'Client not found' };
        
        if (!client.lmpAnalysisIds.includes(analysisId)) {
            client.lmpAnalysisIds.push(analysisId);
            client.updatedAt = new Date().toISOString();
            saveToStorage();
        }
        return { success: true };
    }

    function linkBid(clientId, bidId) {
        const client = clients[clientId];
        if (!client) return { success: false, error: 'Client not found' };
        
        if (!client.bidIds.includes(bidId)) {
            client.bidIds.push(bidId);
            client.updatedAt = new Date().toISOString();
            saveToStorage();
        }
        return { success: true };
    }

    // ========================================
    // GitHub Sync
    // ========================================
    async function syncToGitHub(token, repo) {
        if (!token || !repo) return { success: false, error: 'Missing token or repo' };
        
        try {
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(clients, null, 2))));
            const apiUrl = `https://api.github.com/repos/${repo}/contents/${GITHUB_FILE}`;
            
            // Get current file SHA if exists
            let sha = null;
            try {
                const getResp = await fetch(apiUrl, {
                    headers: { 'Authorization': `token ${token}` }
                });
                if (getResp.ok) {
                    const data = await getResp.json();
                    sha = data.sha;
                }
            } catch (e) {}
            
            const body = {
                message: `Update clients - ${new Date().toISOString()}`,
                content: content
            };
            if (sha) body.sha = sha;
            
            const resp = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            
            if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`);
            
            return { success: true };
        } catch (e) {
            console.error('[ClientStore] GitHub sync error:', e);
            return { success: false, error: e.message };
        }
    }

    async function loadFromGitHub(token, repo) {
        if (!token || !repo) return { success: false, error: 'Missing token or repo' };
        
        try {
            const apiUrl = `https://api.github.com/repos/${repo}/contents/${GITHUB_FILE}`;
            const resp = await fetch(apiUrl, {
                headers: { 'Authorization': `token ${token}` }
            });
            
            if (!resp.ok) {
                if (resp.status === 404) return { success: true, clients: {} };
                throw new Error(`GitHub API error: ${resp.status}`);
            }
            
            const data = await resp.json();
            const content = decodeURIComponent(escape(atob(data.content)));
            const loaded = JSON.parse(content);
            
            // Merge with local (GitHub takes precedence for conflicts)
            clients = { ...clients, ...loaded };
            saveToStorage();
            
            return { success: true, clients };
        } catch (e) {
            console.error('[ClientStore] GitHub load error:', e);
            return { success: false, error: e.message };
        }
    }

    // ========================================
    // Subscriptions
    // ========================================
    function subscribe(callback) {
        if (typeof callback === 'function') {
            subscribers.push(callback);
        }
        return () => {
            subscribers = subscribers.filter(cb => cb !== callback);
        };
    }

    function notifySubscribers(event, data) {
        subscribers.forEach(cb => {
            try {
                cb(event, data);
            } catch (e) {
                console.error('[ClientStore] Subscriber error:', e);
            }
        });
    }

    // ========================================
    // Stats & Export
    // ========================================
    function getStats() {
        const all = Object.values(clients);
        return {
            total: all.length,
            active: all.filter(c => c.status === 'active').length,
            totalLocations: all.reduce((sum, c) => sum + (c.locations?.length || 0), 0),
            totalUsage: all.reduce((sum, c) => sum + (parseFloat(c.annualUsage) || 0), 0),
            byISO: all.reduce((acc, c) => {
                if (c.iso) acc[c.iso] = (acc[c.iso] || 0) + 1;
                return acc;
            }, {}),
            byCommodity: all.reduce((acc, c) => {
                if (c.commodityType) acc[c.commodityType] = (acc[c.commodityType] || 0) + 1;
                return acc;
            }, {})
        };
    }

    function exportClients(format = 'json') {
        if (format === 'csv') {
            const headers = ['ID', 'Company Name', 'Contact Name', 'Email', 'Phone', 'City', 'State', 'ISO', 'Annual Usage', 'Sales Rep', 'Status', 'Created'];
            const rows = Object.values(clients).map(c => [
                c.id, c.companyName, c.contactName, c.contactEmail, c.contactPhone,
                c.address?.city, c.address?.state, c.iso, c.annualUsage, c.salesRepName,
                c.status, c.createdAt
            ]);
            return [headers, ...rows].map(r => r.map(v => `"${v || ''}"`).join(',')).join('\n');
        }
        return JSON.stringify(clients, null, 2);
    }

    function importClients(data, format = 'json') {
        try {
            let imported;
            if (format === 'json') {
                imported = typeof data === 'string' ? JSON.parse(data) : data;
            } else {
                // CSV import
                const lines = data.split('\n');
                const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
                imported = {};
                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].trim()) continue;
                    const values = lines[i].match(/(".*?"|[^",]+)/g)?.map(v => v.replace(/"/g, '').trim()) || [];
                    const client = {};
                    headers.forEach((h, j) => client[h] = values[j] || '');
                    if (client.ID) imported[client.ID] = client;
                }
            }
            
            // Merge imported
            let count = 0;
            Object.entries(imported).forEach(([id, client]) => {
                if (!clients[id] || new Date(client.updatedAt) > new Date(clients[id]?.updatedAt)) {
                    clients[id] = client;
                    count++;
                }
            });
            
            saveToStorage();
            return { success: true, imported: count };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // ========================================
    // Export Public API
    // ========================================
    window.SecureEnergyClients = {
        init,
        generateClientId,
        createClient,
        updateClient,
        getClient,
        getClientByName,
        getAllClients,
        getActiveClients,
        getClientsBySalesRep,
        searchClients,
        deleteClient,
        addLocation,
        updateLocation,
        removeLocation,
        linkLMPAnalysis,
        linkBid,
        syncToGitHub,
        loadFromGitHub,
        subscribe,
        getStats,
        exportClients,
        importClients
    };

})();

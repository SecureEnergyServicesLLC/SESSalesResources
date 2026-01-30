/**
 * Client Store - Centralized Client Management
 * Provides unique client identifiers (CID) across all portal widgets
 * Supports Salesforce data import and cross-widget client context
 * Version: 2.0.0
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'secureEnergy_clients';
    const ACTIVE_CLIENT_KEY = 'secureEnergy_activeClient';
    const GITHUB_FILE = 'data/clients.json';
    
    let clients = {};
    let activeClientId = null;
    let subscribers = [];

    // ========================================
    // Salesforce Field Mappings (customizable)
    // ========================================
    const SALESFORCE_FIELD_MAP = {
        // Salesforce Field -> Internal Field
        'Account Name': 'name',
        'Account ID': 'salesforceId',
        'AccountId': 'salesforceId',
        'Id': 'salesforceId',
        'Name': 'name',
        'BillingStreet': 'address',
        'BillingCity': 'city',
        'BillingState': 'state',
        'BillingPostalCode': 'zip',
        'BillingCountry': 'country',
        'Phone': 'phone',
        'Website': 'website',
        'Industry': 'industry',
        'Type': 'accountType',
        'Description': 'notes',
        'OwnerId': 'salesRepId',
        'Owner.Name': 'salesRepName',
        'Owner Name': 'salesRepName',
        'CreatedDate': 'sfCreatedDate',
        'LastModifiedDate': 'sfModifiedDate',
        'Annual Revenue': 'annualRevenue',
        'AnnualRevenue': 'annualRevenue',
        'NumberOfEmployees': 'employees',
        'Number of Employees': 'employees',
        // Energy-specific fields
        'ISO__c': 'iso',
        'ISO': 'iso',
        'Utility__c': 'utility',
        'Utility': 'utility',
        'Load Zone__c': 'loadZone',
        'Load Zone': 'loadZone',
        'Annual Usage MWh__c': 'annualUsageMWh',
        'Annual Usage (MWh)': 'annualUsageMWh',
        'Contract End Date__c': 'contractEndDate',
        'Contract End Date': 'contractEndDate',
        'Current Supplier__c': 'currentSupplier',
        'Current Supplier': 'currentSupplier',
        'Rate Type__c': 'rateType',
        'Rate Type': 'rateType'
    };

    // ========================================
    // Initialization
    // ========================================
    function init() {
        loadFromStorage();
        loadActiveClient();
        console.log('[ClientStore] Initialized with', Object.keys(clients).length, 'clients');
        if (activeClientId) {
            console.log('[ClientStore] Active client:', activeClientId);
        }
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

    function loadActiveClient() {
        try {
            activeClientId = localStorage.getItem(ACTIVE_CLIENT_KEY) || null;
        } catch (e) {
            activeClientId = null;
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

    function saveActiveClient() {
        try {
            if (activeClientId) {
                localStorage.setItem(ACTIVE_CLIENT_KEY, activeClientId);
            } else {
                localStorage.removeItem(ACTIVE_CLIENT_KEY);
            }
        } catch (e) {
            console.error('[ClientStore] Save active client error:', e);
        }
    }

    // ========================================
    // Client ID Generation
    // ========================================
    function generateClientId() {
        // Format: CID-YYYYMMDD-XXXXX (e.g., CID-20260130-A3B7F)
        const date = new Date();
        const dateStr = date.getFullYear().toString() +
            (date.getMonth() + 1).toString().padStart(2, '0') +
            date.getDate().toString().padStart(2, '0');
        const random = Math.random().toString(36).substring(2, 7).toUpperCase();
        return `CID-${dateStr}-${random}`;
    }

    // ========================================
    // Active Client Management (Portal-Wide Context)
    // ========================================
    function setActiveClient(clientId) {
        if (clientId && !clients[clientId]) {
            console.warn('[ClientStore] Client not found:', clientId);
            return false;
        }
        
        const previousClient = activeClientId;
        activeClientId = clientId;
        saveActiveClient();
        
        // Notify all widgets of client change
        notifySubscribers('activeClientChanged', {
            previous: previousClient,
            current: clientId,
            client: clientId ? clients[clientId] : null
        });
        
        // Post message to all iframes (widgets)
        broadcastToWidgets({
            type: 'ACTIVE_CLIENT_CHANGED',
            clientId: clientId,
            client: clientId ? clients[clientId] : null
        });
        
        console.log('[ClientStore] Active client set to:', clientId);
        return true;
    }

    function getActiveClient() {
        return activeClientId ? clients[activeClientId] : null;
    }

    function getActiveClientId() {
        return activeClientId;
    }

    function clearActiveClient() {
        setActiveClient(null);
    }

    function broadcastToWidgets(message) {
        // Send to all iframes in the portal
        document.querySelectorAll('iframe').forEach(iframe => {
            try {
                iframe.contentWindow.postMessage(message, '*');
            } catch (e) {
                // Ignore cross-origin errors
            }
        });
    }

    // ========================================
    // CRUD Operations
    // ========================================
    function createClient(clientData) {
        const id = clientData.id || generateClientId();
        const now = new Date().toISOString();
        
        const client = {
            id: id,
            salesforceId: clientData.salesforceId || '',
            name: clientData.name || '',
            displayName: clientData.displayName || clientData.name || '',
            
            // Contact Info
            address: clientData.address || '',
            city: clientData.city || '',
            state: clientData.state || '',
            zip: clientData.zip || '',
            country: clientData.country || 'USA',
            phone: clientData.phone || '',
            website: clientData.website || '',
            
            // Business Info
            industry: clientData.industry || '',
            accountType: clientData.accountType || 'Prospect',
            annualRevenue: clientData.annualRevenue || '',
            employees: clientData.employees || '',
            
            // Energy-Specific
            iso: clientData.iso || '',
            utility: clientData.utility || '',
            loadZone: clientData.loadZone || '',
            annualUsageMWh: clientData.annualUsageMWh || '',
            contractEndDate: clientData.contractEndDate || '',
            currentSupplier: clientData.currentSupplier || '',
            rateType: clientData.rateType || '',
            
            // Locations (for multi-site clients)
            locations: clientData.locations || [],
            
            // Sales Info
            salesRepId: clientData.salesRepId || '',
            salesRepName: clientData.salesRepName || '',
            salesRepEmail: clientData.salesRepEmail || '',
            
            // Status
            status: clientData.status || 'Active',
            priority: clientData.priority || 'Normal',
            tags: clientData.tags || [],
            notes: clientData.notes || '',
            
            // Linked Data (analyses, bids, etc.)
            linkedAnalyses: [],
            linkedBids: [],
            linkedDocuments: [],
            
            // Custom Fields (from Salesforce or user-defined)
            customFields: clientData.customFields || {},
            
            // Metadata
            source: clientData.source || 'Manual',
            sfCreatedDate: clientData.sfCreatedDate || '',
            sfModifiedDate: clientData.sfModifiedDate || '',
            createdAt: now,
            updatedAt: now,
            createdBy: clientData.createdBy || ''
        };
        
        clients[id] = client;
        saveToStorage();
        notifySubscribers('create', client);
        
        return client;
    }

    function updateClient(clientId, updates) {
        if (!clients[clientId]) {
            console.error('[ClientStore] Client not found:', clientId);
            return null;
        }
        
        clients[clientId] = {
            ...clients[clientId],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        saveToStorage();
        notifySubscribers('update', clients[clientId]);
        
        // If this is the active client, broadcast the update
        if (clientId === activeClientId) {
            broadcastToWidgets({
                type: 'ACTIVE_CLIENT_UPDATED',
                clientId: clientId,
                client: clients[clientId]
            });
        }
        
        return clients[clientId];
    }

    function getClient(clientId) {
        return clients[clientId] || null;
    }

    function getClientByName(name) {
        const searchName = name.toLowerCase().trim();
        return Object.values(clients).find(c => 
            c.name.toLowerCase() === searchName ||
            c.displayName?.toLowerCase() === searchName
        );
    }

    function getClientBySalesforceId(sfId) {
        return Object.values(clients).find(c => c.salesforceId === sfId);
    }

    function getAllClients() {
        return Object.values(clients).sort((a, b) => 
            (a.name || '').localeCompare(b.name || '')
        );
    }

    function getActiveClients() {
        return Object.values(clients)
            .filter(c => c.status === 'Active')
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    function getClientsBySalesRep(salesRepEmail) {
        return Object.values(clients)
            .filter(c => c.salesRepEmail === salesRepEmail)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    function getClientsByISO(iso) {
        return Object.values(clients)
            .filter(c => c.iso === iso)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    function searchClients(query, options = {}) {
        const q = query.toLowerCase().trim();
        if (!q) return getAllClients();
        
        let results = Object.values(clients).filter(c => {
            const searchFields = [
                c.name,
                c.displayName,
                c.salesforceId,
                c.city,
                c.state,
                c.iso,
                c.utility,
                c.salesRepName,
                ...(c.tags || [])
            ].filter(Boolean);
            
            return searchFields.some(field => 
                field.toLowerCase().includes(q)
            );
        });
        
        // Apply filters
        if (options.status) {
            results = results.filter(c => c.status === options.status);
        }
        if (options.iso) {
            results = results.filter(c => c.iso === options.iso);
        }
        if (options.salesRep) {
            results = results.filter(c => c.salesRepEmail === options.salesRep);
        }
        
        return results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    function deleteClient(clientId) {
        if (!clients[clientId]) return false;
        
        const client = clients[clientId];
        delete clients[clientId];
        
        // Clear active client if deleted
        if (activeClientId === clientId) {
            clearActiveClient();
        }
        
        saveToStorage();
        notifySubscribers('delete', client);
        
        return true;
    }

    // ========================================
    // Location Management (Multi-Site Clients)
    // ========================================
    function addLocation(clientId, location) {
        if (!clients[clientId]) return null;
        
        const loc = {
            id: `LOC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: location.name || 'Location',
            address: location.address || '',
            city: location.city || '',
            state: location.state || '',
            zip: location.zip || '',
            iso: location.iso || clients[clientId].iso || '',
            utility: location.utility || clients[clientId].utility || '',
            loadZone: location.loadZone || '',
            annualUsageMWh: location.annualUsageMWh || '',
            accountNumber: location.accountNumber || '',
            meterNumber: location.meterNumber || '',
            rateClass: location.rateClass || '',
            notes: location.notes || '',
            createdAt: new Date().toISOString()
        };
        
        clients[clientId].locations.push(loc);
        clients[clientId].updatedAt = new Date().toISOString();
        saveToStorage();
        
        return loc;
    }

    function updateLocation(clientId, locationId, updates) {
        if (!clients[clientId]) return null;
        
        const locIndex = clients[clientId].locations.findIndex(l => l.id === locationId);
        if (locIndex === -1) return null;
        
        clients[clientId].locations[locIndex] = {
            ...clients[clientId].locations[locIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        clients[clientId].updatedAt = new Date().toISOString();
        saveToStorage();
        
        return clients[clientId].locations[locIndex];
    }

    function removeLocation(clientId, locationId) {
        if (!clients[clientId]) return false;
        
        const locIndex = clients[clientId].locations.findIndex(l => l.id === locationId);
        if (locIndex === -1) return false;
        
        clients[clientId].locations.splice(locIndex, 1);
        clients[clientId].updatedAt = new Date().toISOString();
        saveToStorage();
        
        return true;
    }

    // ========================================
    // Link Analyses and Bids to Clients
    // ========================================
    function linkAnalysis(clientId, analysis) {
        if (!clients[clientId]) return false;
        
        const linkedAnalysis = {
            id: analysis.id || `ANA-${Date.now()}`,
            type: analysis.type || 'LMP Comparison',
            iso: analysis.iso || '',
            zone: analysis.zone || '',
            years: analysis.years || [],
            fixedRate: analysis.fixedRate || '',
            usage: analysis.usage || '',
            results: analysis.results || {},
            timestamp: analysis.timestamp || new Date().toISOString(),
            createdBy: analysis.createdBy || ''
        };
        
        clients[clientId].linkedAnalyses.push(linkedAnalysis);
        clients[clientId].updatedAt = new Date().toISOString();
        saveToStorage();
        
        notifySubscribers('analysisLinked', { clientId, analysis: linkedAnalysis });
        
        return linkedAnalysis;
    }

    function linkBid(clientId, bid) {
        if (!clients[clientId]) return false;
        
        const linkedBid = {
            id: bid.id || `BID-${Date.now()}`,
            suppliers: bid.suppliers || [],
            locations: bid.locations || [],
            status: bid.status || 'Draft',
            selectedRate: bid.selectedRate || null,
            timestamp: bid.timestamp || new Date().toISOString(),
            createdBy: bid.createdBy || ''
        };
        
        clients[clientId].linkedBids.push(linkedBid);
        clients[clientId].updatedAt = new Date().toISOString();
        saveToStorage();
        
        notifySubscribers('bidLinked', { clientId, bid: linkedBid });
        
        return linkedBid;
    }

    function getClientAnalyses(clientId) {
        return clients[clientId]?.linkedAnalyses || [];
    }

    function getClientBids(clientId) {
        return clients[clientId]?.linkedBids || [];
    }

    // ========================================
    // Salesforce Import
    // ========================================
    function importFromSalesforce(data, options = {}) {
        const results = {
            imported: 0,
            updated: 0,
            skipped: 0,
            errors: []
        };
        
        let records = [];
        
        // Parse input data
        if (typeof data === 'string') {
            // CSV format
            records = parseCSV(data);
        } else if (Array.isArray(data)) {
            records = data;
        } else if (data && typeof data === 'object') {
            // Single record
            records = [data];
        }
        
        const currentUser = window.UserStore?.getCurrentUser?.();
        
        records.forEach((record, index) => {
            try {
                // Map Salesforce fields to internal fields
                const mappedData = mapSalesforceFields(record);
                
                if (!mappedData.name) {
                    results.skipped++;
                    results.errors.push(`Row ${index + 1}: Missing required field 'Name'`);
                    return;
                }
                
                // Check if client already exists (by Salesforce ID or name)
                let existingClient = null;
                if (mappedData.salesforceId) {
                    existingClient = getClientBySalesforceId(mappedData.salesforceId);
                }
                if (!existingClient && options.matchByName) {
                    existingClient = getClientByName(mappedData.name);
                }
                
                if (existingClient) {
                    if (options.updateExisting) {
                        // Update existing client
                        updateClient(existingClient.id, {
                            ...mappedData,
                            source: 'Salesforce',
                            updatedBy: currentUser?.email || ''
                        });
                        results.updated++;
                    } else {
                        results.skipped++;
                    }
                } else {
                    // Create new client
                    createClient({
                        ...mappedData,
                        source: 'Salesforce',
                        createdBy: currentUser?.email || ''
                    });
                    results.imported++;
                }
            } catch (e) {
                results.errors.push(`Row ${index + 1}: ${e.message}`);
            }
        });
        
        console.log('[ClientStore] Salesforce import results:', results);
        notifySubscribers('import', results);
        
        return results;
    }

    function mapSalesforceFields(record) {
        const mapped = {};
        
        Object.entries(record).forEach(([key, value]) => {
            // Check if we have a mapping for this field
            const internalField = SALESFORCE_FIELD_MAP[key];
            if (internalField) {
                mapped[internalField] = value;
            } else if (key.endsWith('__c')) {
                // Custom field - store in customFields
                if (!mapped.customFields) mapped.customFields = {};
                mapped.customFields[key] = value;
            }
        });
        
        return mapped;
    }

    function parseCSV(csvString) {
        const lines = csvString.split('\n');
        if (lines.length < 2) return [];
        
        // Parse header
        const headers = parseCSVLine(lines[0]);
        
        // Parse data rows
        const records = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            
            const values = parseCSVLine(lines[i]);
            const record = {};
            
            headers.forEach((header, index) => {
                record[header.trim()] = values[index]?.trim() || '';
            });
            
            records.push(record);
        }
        
        return records;
    }

    function parseCSVLine(line) {
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
        
        return result.map(v => v.replace(/^"|"$/g, ''));
    }

    // ========================================
    // Export
    // ========================================
    function exportClients(format = 'json') {
        const allClients = getAllClients();
        
        if (format === 'json') {
            return JSON.stringify(allClients, null, 2);
        } else if (format === 'csv') {
            return exportToCSV(allClients);
        }
        
        return allClients;
    }

    function exportToCSV(clientList) {
        if (!clientList.length) return '';
        
        const headers = [
            'ID', 'Salesforce ID', 'Name', 'Address', 'City', 'State', 'ZIP',
            'Phone', 'Website', 'Industry', 'ISO', 'Utility', 'Load Zone',
            'Annual Usage (MWh)', 'Contract End Date', 'Current Supplier',
            'Sales Rep', 'Status', 'Tags', 'Notes', 'Created', 'Updated'
        ];
        
        const rows = clientList.map(c => [
            c.id,
            c.salesforceId,
            c.name,
            c.address,
            c.city,
            c.state,
            c.zip,
            c.phone,
            c.website,
            c.industry,
            c.iso,
            c.utility,
            c.loadZone,
            c.annualUsageMWh,
            c.contractEndDate,
            c.currentSupplier,
            c.salesRepName,
            c.status,
            (c.tags || []).join('; '),
            c.notes,
            c.createdAt,
            c.updatedAt
        ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','));
        
        return [headers.join(','), ...rows].join('\n');
    }

    // ========================================
    // GitHub Sync
    // ========================================
    async function syncToGitHub() {
        if (typeof GitHubSync === 'undefined') {
            console.warn('[ClientStore] GitHubSync not available');
            return false;
        }
        
        try {
            await GitHubSync.saveFile(GITHUB_FILE, JSON.stringify(clients, null, 2));
            console.log('[ClientStore] Synced to GitHub');
            return true;
        } catch (e) {
            console.error('[ClientStore] GitHub sync error:', e);
            return false;
        }
    }

    async function loadFromGitHub() {
        if (typeof GitHubSync === 'undefined') {
            console.warn('[ClientStore] GitHubSync not available');
            return false;
        }
        
        try {
            const data = await GitHubSync.loadFile(GITHUB_FILE);
            if (data) {
                const loaded = JSON.parse(data);
                // Merge with existing (GitHub wins for conflicts)
                Object.entries(loaded).forEach(([id, client]) => {
                    if (!clients[id] || new Date(client.updatedAt) > new Date(clients[id]?.updatedAt)) {
                        clients[id] = client;
                    }
                });
                saveToStorage();
                console.log('[ClientStore] Loaded from GitHub');
                return true;
            }
        } catch (e) {
            console.error('[ClientStore] GitHub load error:', e);
        }
        return false;
    }

    // ========================================
    // Subscribers (for reactive updates)
    // ========================================
    function subscribe(callback) {
        subscribers.push(callback);
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
    // Statistics
    // ========================================
    function getStats() {
        const all = Object.values(clients);
        const byStatus = {};
        const byISO = {};
        const bySalesRep = {};
        
        all.forEach(c => {
            byStatus[c.status] = (byStatus[c.status] || 0) + 1;
            if (c.iso) byISO[c.iso] = (byISO[c.iso] || 0) + 1;
            if (c.salesRepEmail) bySalesRep[c.salesRepEmail] = (bySalesRep[c.salesRepEmail] || 0) + 1;
        });
        
        return {
            total: all.length,
            active: all.filter(c => c.status === 'Active').length,
            withAnalyses: all.filter(c => c.linkedAnalyses?.length > 0).length,
            withBids: all.filter(c => c.linkedBids?.length > 0).length,
            byStatus,
            byISO,
            bySalesRep,
            activeClientId
        };
    }

    // ========================================
    // Dropdown Helper (for widget integration)
    // ========================================
    function getClientDropdownOptions(options = {}) {
        let clientList = options.activeOnly ? getActiveClients() : getAllClients();
        
        if (options.salesRep) {
            clientList = clientList.filter(c => c.salesRepEmail === options.salesRep);
        }
        
        return clientList.map(c => ({
            value: c.id,
            label: c.name,
            subLabel: c.iso ? `${c.city || ''}, ${c.state || ''} (${c.iso})` : `${c.city || ''}, ${c.state || ''}`,
            client: c
        }));
    }

    // ========================================
    // Export Public API
    // ========================================
    window.SecureEnergyClients = {
        init,
        
        // Active Client (Portal-Wide Context)
        setActiveClient,
        getActiveClient,
        getActiveClientId,
        clearActiveClient,
        
        // CRUD
        generateClientId,
        createClient,
        updateClient,
        getClient,
        getClientByName,
        getClientBySalesforceId,
        getAllClients,
        getActiveClients,
        getClientsBySalesRep,
        getClientsByISO,
        searchClients,
        deleteClient,
        
        // Locations
        addLocation,
        updateLocation,
        removeLocation,
        
        // Links
        linkAnalysis,
        linkBid,
        getClientAnalyses,
        getClientBids,
        
        // Import/Export
        importFromSalesforce,
        exportClients,
        
        // GitHub Sync
        syncToGitHub,
        loadFromGitHub,
        
        // Utilities
        subscribe,
        getStats,
        getClientDropdownOptions,
        
        // Field mappings (for customization)
        SALESFORCE_FIELD_MAP
    };

})();

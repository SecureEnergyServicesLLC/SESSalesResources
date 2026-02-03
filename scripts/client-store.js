/**
 * Client Store - Centralized Client Management
 * Provides unique client identifiers (CID) across all portal widgets
 * Supports Salesforce data import and cross-widget client context
 * Version: 2.4.0 - Azure Integration
 * 
 * CHANGELOG:
 * v2.4.0 - Azure Blob Storage integration for data persistence
 * v2.3.1 - Added local broadcast() helper to fix "Can't find variable: broadcast" error
 * v2.3.0 - User-specific active client/account selection
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'secureEnergy_clients';
    const ACTIVE_CLIENT_KEY_BASE = 'secureEnergy_activeClient';
    const ACTIVE_ACCOUNT_KEY_BASE = 'secureEnergy_activeAccount';
    const GITHUB_FILE = 'data/clients.json';
    
    let clients = {};
    let activeClientId = null;
    let activeAccountId = null;
    let subscribers = [];
    let currentUserId = null;

    // ========================================
    // Broadcast Helper
    // ========================================
    function broadcast(messageType, data = {}) {
        if (typeof window.broadcast === 'function') {
            return window.broadcast(messageType, data);
        }
        
        const message = { type: messageType, ...data, timestamp: Date.now() };
        
        if (window.parent && window.parent !== window) {
            try { window.parent.postMessage(message, '*'); } catch (e) { }
        }
        
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try { if (iframe.contentWindow) iframe.contentWindow.postMessage(message, '*'); } catch (e) { }
        });
        
        try { window.dispatchEvent(new CustomEvent(messageType, { detail: data })); } catch (e) { }
        
        console.log(`[ClientStore:Broadcast] ${messageType}`, data);
        return message;
    }

    function getActiveClientKey() {
        return currentUserId ? `${ACTIVE_CLIENT_KEY_BASE}_${currentUserId}` : ACTIVE_CLIENT_KEY_BASE;
    }
    
    function getActiveAccountKey() {
        return currentUserId ? `${ACTIVE_ACCOUNT_KEY_BASE}_${currentUserId}` : ACTIVE_ACCOUNT_KEY_BASE;
    }
    
    function setCurrentUser(userId) {
        if (currentUserId !== userId) {
            currentUserId = userId;
            loadActiveClient();
            broadcast('userChanged', { userId: userId });
        }
    }
    
    function getCurrentUserId() { return currentUserId; }

    // ========================================
    // Salesforce Field Mappings
    // ========================================
    const SALESFORCE_FIELD_MAP = {
        'Parent Account: Customer': 'parentAccountCustomer',
        'Account Contract Name': 'contractName',
        'Assigned To: Contract Assignment Group Name': 'assignedGroup',
        'Status': 'contractStatus',
        'Number Of Meters': 'numberOfMeters',
        '# Active MC': 'activeMeterCount',
        'Sign Date': 'signDate',
        'Contract Start Date': 'contractStartDate',
        'Contract End Date': 'contractEndDate',
        'Supplier: Account Name': 'currentSupplier',
        'Product Category': 'productCategory',
        'Estimated Annual Usage (Kwh/Dth)': 'annualUsageKwh',
        'Estimated Contract Margin': 'contractMargin',
        'Parent Account: BUDA Eligible?': 'budaEligible',
        'Parent Account: BUDA Notes': 'budaNotes',
        'Parent Account: Account ID Unique': 'salesforceId',
        'Parent Account: Account Name': 'name',
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
        'ISO__c': 'iso',
        'ISO': 'iso',
        'Utility__c': 'utility',
        'Utility': 'utility',
        'Load Zone__c': 'loadZone',
        'Load Zone': 'loadZone',
        'Annual Usage MWh__c': 'annualUsageMWh',
        'Annual Usage (MWh)': 'annualUsageMWh',
        'Contract End Date__c': 'contractEndDate',
        'Current Supplier__c': 'currentSupplier',
        'Current Supplier': 'currentSupplier',
        'Rate Type__c': 'rateType',
        'Rate Type': 'rateType'
    };

    const ACCOUNT_FIELD_MAP = {
        'Account Owner': 'accountOwner',
        'Account Name': 'accountName',
        'Billing State/Province': 'billingState',
        'Billing Zip/Postal Code': 'billingZip',
        'Service Zip/Postal Code': 'serviceZip',
        'Supplier Applied Payment Number': 'supplierPaymentNumber',
        'Account Number': 'accountNumber',
        'Last Activity': 'lastActivity',
        'Type': 'accountType',
        'Rating': 'rating',
        'Last Modified Date': 'lastModifiedDate',
        'Latest Sign Date': 'latestSignDate',
        'Contract Start Date': 'contractStartDate',
        'Contract End Date': 'contractEndDate',
        'Current Supplier': 'currentSupplier',
        'Gas Utility': 'gasUtility',
        'Electric Utility': 'electricUtility',
        'Supplier Annual KWH': 'supplierAnnualKwh',
        'Supplier Annual DTH': 'supplierAnnualDth',
        'Parent Account': 'parentAccountName'
    };

    // ========================================
    // Initialization
    // ========================================
    let initialized = false;
    let pendingCallbacks = [];
    
    function init() {
        if (initialized) {
            console.log('[ClientStore] Already initialized with', Object.keys(clients).length, 'clients');
            return Promise.resolve(getStats());
        }
        
        console.log('[ClientStore] Initializing - loading data...');
        loadActiveClient();
        
        return loadFromGitHub().then(() => {
            initialized = true;
            console.log('[ClientStore] Initialized with', Object.keys(clients).length, 'clients');
            pendingCallbacks.forEach(cb => cb());
            pendingCallbacks = [];
            return getStats();
        }).catch(err => {
            console.error('[ClientStore] Data load failed, trying localStorage fallback:', err);
            loadFromLocalStorage();
            initialized = true;
            return getStats();
        });
    }
    
    function onReady(callback) {
        if (initialized) callback();
        else pendingCallbacks.push(callback);
    }

    function loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                clients = JSON.parse(stored);
                console.log('[ClientStore] Loaded', Object.keys(clients).length, 'clients from localStorage (fallback)');
            }
        } catch (e) {
            console.error('[ClientStore] localStorage load error:', e);
            clients = {};
        }
    }

    function loadActiveClient() {
        try {
            const clientKey = getActiveClientKey();
            const accountKey = getActiveAccountKey();
            
            activeClientId = localStorage.getItem(clientKey) || null;
            activeAccountId = localStorage.getItem(accountKey) || null;
            
            if (activeAccountId && activeClientId) {
                const client = clients[activeClientId];
                if (!client?.accounts?.find(a => a.id === activeAccountId)) {
                    activeAccountId = null;
                    localStorage.removeItem(accountKey);
                }
            } else if (activeAccountId && !activeClientId) {
                activeAccountId = null;
                localStorage.removeItem(accountKey);
            }
            
            if (activeClientId) {
                console.log('[ClientStore] Loaded active client for user:', currentUserId || 'default', '- Client:', activeClientId);
            }
        } catch (e) {
            activeClientId = null;
            activeAccountId = null;
        }
    }

    function saveToStorage() {
        if (batchMode) { batchPending = true; return; }
        needsGitHubSync = true;
        const sizeKB = (JSON.stringify(clients).length / 1024).toFixed(1);
        console.log('[ClientStore] Data updated in memory (' + sizeKB + ' KB)');
        notifySubscribers('dataChanged', { clientCount: Object.keys(clients).length, sizeKB });
        _scheduleSyncToAzure();
    }
    
    let needsGitHubSync = false;
    let _syncTimeout = null;
    
    function _scheduleSyncToAzure() {
        if (typeof AzureDataService === 'undefined' || !AzureDataService.isConfigured()) return;
        clearTimeout(_syncTimeout);
        _syncTimeout = setTimeout(() => {
            syncToGitHub().catch(e => console.warn('[ClientStore] Auto-sync failed:', e.message));
        }, 3000);
    }
    
    function hasUnsavedChanges() { return needsGitHubSync; }
    
    function exportForGitHub() {
        return JSON.stringify({
            version: '2.4.0',
            lastUpdated: new Date().toISOString(),
            clientCount: Object.keys(clients).length,
            clients: clients
        }, null, 2);
    }
    
    let batchMode = false;
    let batchPending = false;
    
    function startBatch() { batchMode = true; batchPending = false; console.log('[ClientStore] Batch mode started'); }
    
    function endBatch() {
        batchMode = false;
        if (batchPending) {
            console.log('[ClientStore] Batch mode ended - saving...');
            saveToStorage();
            batchPending = false;
        }
    }
    
    function getStorageInfo() {
        try {
            const data = JSON.stringify(clients);
            const sizeBytes = data.length;
            let totalAccounts = 0;
            Object.values(clients).forEach(c => { totalAccounts += (c.accounts?.length || 0); });
            return {
                clientCount: Object.keys(clients).length,
                accountCount: totalAccounts,
                sizeBytes,
                sizeKB: parseFloat((sizeBytes / 1024).toFixed(2)),
                sizeMB: parseFloat((sizeBytes / (1024 * 1024)).toFixed(2)),
                estimatedLimit: '5-10 MB (varies by browser)',
                warning: sizeBytes > 3 * 1024 * 1024 ? 'Approaching storage limit!' : null
            };
        } catch (e) { return { error: e.message }; }
    }
    
    function clearAllClients() {
        if (confirm('Are you sure you want to delete ALL client data? This cannot be undone!')) {
            clients = {};
            activeClientId = null;
            activeAccountId = null;
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(getActiveClientKey());
            localStorage.removeItem(getActiveAccountKey());
            notifySubscribers('cleared', {});
            console.log('[ClientStore] All client data cleared');
            return true;
        }
        return false;
    }

    function saveActiveClient() {
        try {
            const clientKey = getActiveClientKey();
            const accountKey = getActiveAccountKey();
            if (activeClientId) localStorage.setItem(clientKey, activeClientId);
            else localStorage.removeItem(clientKey);
            if (activeAccountId) localStorage.setItem(accountKey, activeAccountId);
            else localStorage.removeItem(accountKey);
        } catch (e) { console.error('[ClientStore] Save active client/account error:', e); }
    }

    // ========================================
    // Client ID Generation
    // ========================================
    function generateClientId() {
        const date = new Date();
        const dateStr = date.getFullYear().toString() +
            (date.getMonth() + 1).toString().padStart(2, '0') +
            date.getDate().toString().padStart(2, '0');
        const random = Math.random().toString(36).substring(2, 7).toUpperCase();
        return `CID-${dateStr}-${random}`;
    }

    // ========================================
    // Active Client Management
    // ========================================
    function setActiveClient(clientId) {
        console.log('[ClientStore] setActiveClient called with clientId:', clientId);
        if (clientId && !clients[clientId]) {
            console.warn('[ClientStore] Client not found:', clientId);
            return false;
        }
        
        const previousClient = activeClientId;
        const previousAccount = activeAccountId;
        activeClientId = clientId;
        if (previousClient !== clientId) activeAccountId = null;
        saveActiveClient();
        
        notifySubscribers('activeClientChanged', {
            previous: previousClient, current: clientId,
            client: clientId ? clients[clientId] : null,
            previousAccountId: previousAccount, accountId: null, account: null
        });
        
        broadcastToWidgets({
            type: 'ACTIVE_CLIENT_CHANGED',
            clientId: clientId,
            client: clientId ? clients[clientId] : null,
            accountId: null, account: null
        });
        
        console.log('[ClientStore] Active client set to:', clientId);
        return true;
    }

    function getActiveClient() { return activeClientId ? clients[activeClientId] : null; }
    function getActiveClientId() { return activeClientId; }
    function clearActiveClient() { setActiveClient(null); }

    // ========================================
    // Active Account Management
    // ========================================
    function setActiveAccount(accountId) {
        console.log('[ClientStore] setActiveAccount called with accountId:', accountId);
        if (!activeClientId) {
            console.warn('[ClientStore] Cannot set active account without active client');
            return false;
        }
        
        const client = clients[activeClientId];
        if (accountId && !client?.accounts?.find(a => a.id === accountId)) {
            console.warn('[ClientStore] Account not found under active client:', accountId);
            return false;
        }
        
        const previousAccount = activeAccountId;
        activeAccountId = accountId;
        saveActiveClient();
        
        const account = accountId ? client.accounts.find(a => a.id === accountId) : null;
        
        notifySubscribers('activeAccountChanged', {
            previous: previousAccount, current: accountId,
            account: account, clientId: activeClientId, client: client
        });
        
        broadcastToWidgets({
            type: 'ACTIVE_ACCOUNT_CHANGED',
            clientId: activeClientId, client: client,
            accountId: accountId, account: account
        });
        
        console.log('[ClientStore] Active account set to:', accountId);
        return true;
    }

    function getActiveAccount() {
        if (!activeClientId || !activeAccountId) return null;
        const client = clients[activeClientId];
        return client?.accounts?.find(a => a.id === activeAccountId) || null;
    }
    function getActiveAccountId() { return activeAccountId; }
    function clearActiveAccount() { setActiveAccount(null); }

    function getActiveContext() {
        const client = getActiveClient();
        const account = getActiveAccount();
        return {
            clientId: activeClientId, client: client, clientName: client?.name || null,
            accountId: activeAccountId, account: account, accountName: account?.accountName || null,
            contextKey: activeAccountId ? `${activeClientId}_${activeAccountId}` : (activeClientId || 'none'),
            displayName: account ? `${client?.name} → ${account.accountName}` : (client?.name || 'No selection')
        };
    }

    function broadcastToWidgets(message) {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach((iframe, index) => {
            try { iframe.contentWindow.postMessage(message, '*'); }
            catch (e) { console.warn('[ClientStore] Failed to send to iframe', index, ':', e.message); }
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
            address: clientData.address || '',
            city: clientData.city || '',
            state: clientData.state || '',
            zip: clientData.zip || '',
            country: clientData.country || 'USA',
            phone: clientData.phone || '',
            website: clientData.website || '',
            industry: clientData.industry || '',
            accountType: clientData.accountType || 'Prospect',
            annualRevenue: clientData.annualRevenue || '',
            employees: clientData.employees || '',
            iso: clientData.iso || '',
            utility: clientData.utility || '',
            loadZone: clientData.loadZone || '',
            annualUsageMWh: clientData.annualUsageMWh || '',
            annualUsageKwh: clientData.annualUsageKwh || '',
            contractEndDate: clientData.contractEndDate || '',
            currentSupplier: clientData.currentSupplier || '',
            rateType: clientData.rateType || '',
            parentAccountCustomer: clientData.parentAccountCustomer || '',
            contractName: clientData.contractName || '',
            contractStatus: clientData.contractStatus || '',
            contractStartDate: clientData.contractStartDate || '',
            signDate: clientData.signDate || '',
            productCategory: clientData.productCategory || '',
            numberOfMeters: clientData.numberOfMeters || '',
            activeMeterCount: clientData.activeMeterCount || '',
            contractMargin: clientData.contractMargin || '',
            assignedGroup: clientData.assignedGroup || '',
            budaEligible: clientData.budaEligible || '',
            budaNotes: clientData.budaNotes || '',
            locations: clientData.locations || [],
            usageProfile: clientData.usageProfile || null,
            salesRepId: clientData.salesRepId || '',
            salesRepName: clientData.salesRepName || '',
            salesRepEmail: clientData.salesRepEmail || '',
            status: clientData.status || 'Active',
            priority: clientData.priority || 'Normal',
            tags: clientData.tags || [],
            notes: clientData.notes || '',
            linkedAnalyses: [],
            linkedBids: [],
            linkedDocuments: [],
            customFields: clientData.customFields || {},
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
        if (!clients[clientId]) { console.error('[ClientStore] Client not found:', clientId); return null; }
        clients[clientId] = { ...clients[clientId], ...updates, updatedAt: new Date().toISOString() };
        saveToStorage();
        notifySubscribers('update', clients[clientId]);
        if (clientId === activeClientId) {
            broadcastToWidgets({ type: 'ACTIVE_CLIENT_UPDATED', clientId: clientId, client: clients[clientId] });
        }
        return clients[clientId];
    }

    function getClient(clientId) { return clients[clientId] || null; }
    
    function getClientByName(name) {
        const searchName = name.toLowerCase().trim();
        return Object.values(clients).find(c => c.name.toLowerCase() === searchName || c.displayName?.toLowerCase() === searchName);
    }

    function getClientBySalesforceId(sfId) { return Object.values(clients).find(c => c.salesforceId === sfId); }
    function getAllClients() { return Object.values(clients).sort((a, b) => (a.name || '').localeCompare(b.name || '')); }
    function getActiveClients() { return Object.values(clients).filter(c => c.status === 'Active').sort((a, b) => (a.name || '').localeCompare(b.name || '')); }
    function getClientsBySalesRep(salesRepEmail) { return Object.values(clients).filter(c => c.salesRepEmail === salesRepEmail).sort((a, b) => (a.name || '').localeCompare(b.name || '')); }
    function getClientsByISO(iso) { return Object.values(clients).filter(c => c.iso === iso).sort((a, b) => (a.name || '').localeCompare(b.name || '')); }

    function searchClients(query, options = {}) {
        const q = query.toLowerCase().trim();
        if (!q) return getAllClients();
        
        let results = Object.values(clients).filter(c => {
            const searchFields = [c.name, c.displayName, c.salesforceId, c.city, c.state, c.iso, c.utility, c.salesRepName, ...(c.tags || [])].filter(Boolean);
            return searchFields.some(field => field.toLowerCase().includes(q));
        });
        
        if (options.status) results = results.filter(c => c.status === options.status);
        if (options.iso) results = results.filter(c => c.iso === options.iso);
        if (options.salesRep) results = results.filter(c => c.salesRepEmail === options.salesRep);
        
        return results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    function deleteClient(clientId) {
        if (!clients[clientId]) return false;
        const client = clients[clientId];
        delete clients[clientId];
        if (activeClientId === clientId) clearActiveClient();
        saveToStorage();
        notifySubscribers('delete', client);
        return true;
    }

    // ========================================
    // Location Management
    // ========================================
    function addLocation(clientId, location) {
        if (!clients[clientId]) return null;
        const loc = {
            id: `LOC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: location.name || 'Location',
            address: location.address || '', city: location.city || '', state: location.state || '', zip: location.zip || '',
            iso: location.iso || clients[clientId].iso || '', utility: location.utility || clients[clientId].utility || '',
            loadZone: location.loadZone || '', annualUsageMWh: location.annualUsageMWh || '',
            accountNumber: location.accountNumber || '', meterNumber: location.meterNumber || '',
            rateClass: location.rateClass || '', notes: location.notes || '', createdAt: new Date().toISOString()
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
        clients[clientId].locations[locIndex] = { ...clients[clientId].locations[locIndex], ...updates, updatedAt: new Date().toISOString() };
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
    // Link Analyses and Bids
    // ========================================
    function linkAnalysis(clientId, analysis) {
        if (!clients[clientId]) return false;
        const linkedAnalysis = {
            id: analysis.id || `ANA-${Date.now()}`, type: analysis.type || 'LMP Comparison',
            iso: analysis.iso || '', zone: analysis.zone || '', years: analysis.years || [],
            fixedRate: analysis.fixedRate || '', usage: analysis.usage || '', results: analysis.results || {},
            timestamp: analysis.timestamp || new Date().toISOString(), createdBy: analysis.createdBy || ''
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
            id: bid.id || `BID-${Date.now()}`, suppliers: bid.suppliers || [], locations: bid.locations || [],
            status: bid.status || 'Draft', selectedRate: bid.selectedRate || null,
            timestamp: bid.timestamp || new Date().toISOString(), createdBy: bid.createdBy || ''
        };
        clients[clientId].linkedBids.push(linkedBid);
        clients[clientId].updatedAt = new Date().toISOString();
        saveToStorage();
        notifySubscribers('bidLinked', { clientId, bid: linkedBid });
        return linkedBid;
    }

    function getClientAnalyses(clientId) { return clients[clientId]?.linkedAnalyses || []; }
    function getClientBids(clientId) { return clients[clientId]?.linkedBids || []; }

    // ========================================
    // Salesforce Import
    // ========================================
    function importFromSalesforce(data, options = {}) {
        const results = { imported: 0, updated: 0, skipped: 0, errors: [] };
        let records = [];
        
        if (typeof data === 'string') records = parseCSV(data);
        else if (Array.isArray(data)) records = data;
        else if (data && typeof data === 'object') records = [data];
        
        const currentUser = window.UserStore?.getCurrentUser?.();
        
        records.forEach((record, index) => {
            try {
                const mappedData = mapSalesforceFields(record);
                if (!mappedData.name) { results.skipped++; return; }
                
                let existingClient = null;
                if (mappedData.salesforceId) existingClient = getClientBySalesforceId(mappedData.salesforceId);
                if (!existingClient && options.matchByName) existingClient = getClientByName(mappedData.name);
                
                if (existingClient) {
                    if (options.updateExisting) {
                        updateClient(existingClient.id, { ...mappedData, source: 'Salesforce', updatedBy: currentUser?.email || '' });
                        results.updated++;
                    } else results.skipped++;
                } else {
                    createClient({ ...mappedData, source: 'Salesforce', createdBy: currentUser?.email || '' });
                    results.imported++;
                }
            } catch (e) { results.errors.push(`Row ${index + 1}: ${e.message}`); }
        });
        
        notifySubscribers('import', results);
        return results;
    }

    function mapSalesforceFields(record) {
        const mapped = {};
        Object.entries(record).forEach(([key, value]) => {
            const trimmedKey = key.trim();
            const internalField = SALESFORCE_FIELD_MAP[trimmedKey];
            if (internalField) mapped[internalField] = value;
            else if (trimmedKey.endsWith('__c')) {
                if (!mapped.customFields) mapped.customFields = {};
                mapped.customFields[trimmedKey] = value;
            }
        });
        return mapped;
    }

    // ========================================
    // Account Import (Enrichment)
    // ========================================
    function importAccounts(data, options = {}) {
        const results = { imported: 0, updated: 0, skipped: 0, orphaned: 0, errors: [] };
        let records = [];
        
        if (typeof data === 'string') records = parseCSV(data);
        else if (Array.isArray(data)) records = data;
        else if (data && typeof data === 'object') records = [data];
        
        startBatch();
        
        records.forEach((record, index) => {
            try {
                const mappedAccount = mapAccountFields(record);
                if (!mappedAccount.parentAccountName) { results.skipped++; return; }
                
                const parentClient = getClientByName(mappedAccount.parentAccountName);
                
                if (!parentClient) {
                    results.orphaned++;
                    if (options.createOrphans) {
                        const newParent = createClient({ name: mappedAccount.parentAccountName, source: 'Auto-created from Account Import' });
                        addAccountToClient(newParent.id, mappedAccount);
                        results.imported++;
                    } else results.errors.push(`Row ${index + 1}: Parent "${mappedAccount.parentAccountName}" not found`);
                    return;
                }
                
                const existingAccount = findAccountInClient(parentClient.id, mappedAccount);
                
                if (existingAccount) {
                    if (options.updateExisting) { updateAccountInClient(parentClient.id, existingAccount.id, mappedAccount); results.updated++; }
                    else results.skipped++;
                } else {
                    addAccountToClient(parentClient.id, mappedAccount);
                    results.imported++;
                }
            } catch (e) { results.errors.push(`Row ${index + 1}: ${e.message}`); }
        });
        
        endBatch();
        notifySubscribers('accountImport', results);
        return results;
    }

    function mapAccountFields(record) {
        const mapped = {};
        Object.entries(record).forEach(([key, value]) => {
            const trimmedKey = key.trim();
            const internalField = ACCOUNT_FIELD_MAP[trimmedKey];
            if (internalField) mapped[internalField] = value;
        });
        mapped.id = 'ACC-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        mapped.importedAt = new Date().toISOString();
        return mapped;
    }

    function addAccountToClient(clientId, accountData) {
        if (!clients[clientId]) return null;
        if (!clients[clientId].accounts) clients[clientId].accounts = [];
        const account = { ...accountData, addedAt: new Date().toISOString() };
        clients[clientId].accounts.push(account);
        clients[clientId].updatedAt = new Date().toISOString();
        updateClientAggregates(clientId);
        saveToStorage();
        notifySubscribers('accountAdded', { clientId, account });
        return account;
    }

    function findAccountInClient(clientId, accountData) {
        if (!clients[clientId]?.accounts) return null;
        return clients[clientId].accounts.find(acc => 
            (accountData.accountNumber && acc.accountNumber === accountData.accountNumber) ||
            (acc.accountName === accountData.accountName && acc.serviceZip === accountData.serviceZip)
        );
    }

    function updateAccountInClient(clientId, accountId, updates) {
        if (!clients[clientId]?.accounts) return null;
        const accountIndex = clients[clientId].accounts.findIndex(acc => acc.id === accountId);
        if (accountIndex === -1) return null;
        clients[clientId].accounts[accountIndex] = { ...clients[clientId].accounts[accountIndex], ...updates, updatedAt: new Date().toISOString() };
        clients[clientId].updatedAt = new Date().toISOString();
        updateClientAggregates(clientId);
        saveToStorage();
        return clients[clientId].accounts[accountIndex];
    }

    function removeAccountFromClient(clientId, accountId) {
        if (!clients[clientId]?.accounts) return false;
        const initialLength = clients[clientId].accounts.length;
        clients[clientId].accounts = clients[clientId].accounts.filter(acc => acc.id !== accountId);
        if (clients[clientId].accounts.length < initialLength) {
            clients[clientId].updatedAt = new Date().toISOString();
            updateClientAggregates(clientId);
            saveToStorage();
            notifySubscribers('accountRemoved', { clientId, accountId });
            return true;
        }
        return false;
    }

    function updateClientAggregates(clientId) {
        if (!clients[clientId]) return;
        const accounts = clients[clientId].accounts || [];
        let totalKwh = 0, totalDth = 0;
        accounts.forEach(acc => {
            if (acc.supplierAnnualKwh) totalKwh += parseFloat(acc.supplierAnnualKwh) || 0;
            if (acc.supplierAnnualDth) totalDth += parseFloat(acc.supplierAnnualDth) || 0;
        });
        clients[clientId].aggregates = {
            accountCount: accounts.length, totalAnnualKwh: totalKwh, totalAnnualDth: totalDth,
            totalAnnualMWh: totalKwh / 1000, lastCalculated: new Date().toISOString()
        };
    }

    function getClientAccounts(clientId) { return clients[clientId]?.accounts || []; }

    function parseCSV(csvString) {
        const lines = csvString.split('\n');
        if (lines.length < 2) return [];
        const headers = parseCSVLine(lines[0]);
        const records = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = parseCSVLine(lines[i]);
            const record = {};
            headers.forEach((header, index) => { record[header.trim()] = values[index]?.trim() || ''; });
            records.push(record);
        }
        return records;
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '', inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
            else current += char;
        }
        result.push(current);
        return result.map(v => v.replace(/^"|"$/g, ''));
    }

    // ========================================
    // Export
    // ========================================
    function exportClients(format = 'json') {
        const allClients = getAllClients();
        if (format === 'json') return JSON.stringify(allClients, null, 2);
        else if (format === 'csv') return exportToCSV(allClients);
        return allClients;
    }

    function exportToCSV(clientList) {
        if (!clientList.length) return '';
        const headers = ['ID', 'Salesforce ID', 'Name', 'Address', 'City', 'State', 'ZIP', 'Phone', 'Website', 'Industry', 'ISO', 'Utility', 'Load Zone', 'Annual Usage (MWh)', 'Contract End Date', 'Current Supplier', 'Sales Rep', 'Status', 'Tags', 'Notes', 'Created', 'Updated'];
        const rows = clientList.map(c => [c.id, c.salesforceId, c.name, c.address, c.city, c.state, c.zip, c.phone, c.website, c.industry, c.iso, c.utility, c.loadZone, c.annualUsageMWh, c.contractEndDate, c.currentSupplier, c.salesRepName, c.status, (c.tags || []).join('; '), c.notes, c.createdAt, c.updatedAt].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','));
        return [headers.join(','), ...rows].join('\n');
    }

    // ========================================
    // Azure / Data Loading
    // ========================================
    async function loadFromGitHub() {
        // Try Azure first if configured
        if (typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
            try {
                console.log('[ClientStore] Loading from Azure...');
                const data = await AzureDataService.get('clients.json');
                if (data?.clients) {
                    clients = data.clients;
                    console.log('[ClientStore] Loaded', Object.keys(clients).length, 'clients from Azure');
                    needsGitHubSync = false;
                    return true;
                }
            } catch (e) {
                console.warn('[ClientStore] Azure fetch failed:', e.message);
            }
        }
        
        // Fallback to local file
        try {
            const response = await fetch('data/clients.json?t=' + Date.now());
            if (response.ok) {
                const data = await response.json();
                if (data.clients) {
                    clients = data.clients;
                } else if (typeof data === 'object' && !Array.isArray(data)) {
                    const firstKey = Object.keys(data)[0];
                    if (firstKey && (firstKey.startsWith('CID-') || data[firstKey]?.name)) {
                        clients = data;
                    }
                }
                console.log('[ClientStore] Loaded', Object.keys(clients).length, 'clients from local file');
                return true;
            }
        } catch (e) {
            console.warn('[ClientStore] Local file fetch failed:', e.message);
        }
        
        return false;
    }
    
    async function syncToGitHub() {
        // Try Azure first if configured
        if (typeof AzureDataService !== 'undefined' && AzureDataService.isConfigured()) {
            try {
                await AzureDataService.save('clients.json', JSON.parse(exportForGitHub()));
                needsGitHubSync = false;
                console.log('[ClientStore] Synced to Azure');
                return true;
            } catch (e) {
                console.error('[ClientStore] Azure sync error:', e);
            }
        }
        
        console.log('[ClientStore] Use downloadClientsJSON() to export');
        return false;
    }
    
    function downloadClientsJSON() {
        const data = exportForGitHub();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'clients.json';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[ClientStore] Downloaded clients.json');
        return true;
    }

    // ========================================
    // Subscribers
    // ========================================
    function subscribe(callback) {
        subscribers.push(callback);
        return () => { subscribers = subscribers.filter(cb => cb !== callback); };
    }

    function notifySubscribers(event, data) {
        subscribers.forEach((cb, index) => {
            try { cb(event, data); }
            catch (e) { console.error('[ClientStore] Subscriber', index, 'error:', e); }
        });
    }

    // ========================================
    // Statistics
    // ========================================
    function getStats() {
        const all = Object.values(clients);
        const byStatus = {}, byISO = {}, bySalesRep = {};
        all.forEach(c => {
            byStatus[c.status] = (byStatus[c.status] || 0) + 1;
            if (c.iso) byISO[c.iso] = (byISO[c.iso] || 0) + 1;
            if (c.salesRepEmail) bySalesRep[c.salesRepEmail] = (bySalesRep[c.salesRepEmail] || 0) + 1;
        });
        return {
            total: all.length, active: all.filter(c => c.status === 'Active').length,
            withAnalyses: all.filter(c => c.linkedAnalyses?.length > 0).length,
            withBids: all.filter(c => c.linkedBids?.length > 0).length,
            byStatus, byISO, bySalesRep, activeClientId
        };
    }

    function getClientDropdownOptions(options = {}) {
        let clientList = options.activeOnly ? getActiveClients() : getAllClients();
        if (options.salesRep) clientList = clientList.filter(c => c.salesRepEmail === options.salesRep);
        return clientList.map(c => ({
            value: c.id, label: c.name,
            subLabel: c.iso ? `${c.city || ''}, ${c.state || ''} (${c.iso})` : `${c.city || ''}, ${c.state || ''}`,
            client: c
        }));
    }

    // ========================================
    // Export Public API
    // ========================================
    window.SecureEnergyClients = {
        init, setCurrentUser, getCurrentUserId,
        setActiveClient, getActiveClient, getActiveClientId, clearActiveClient,
        setActiveAccount, getActiveAccount, getActiveAccountId, clearActiveAccount, getActiveContext,
        generateClientId, createClient, updateClient, getClient, getClientByName, getClientBySalesforceId,
        getAllClients, getActiveClients, getClientsBySalesRep, getClientsByISO, searchClients, deleteClient,
        addLocation, updateLocation, removeLocation,
        importAccounts, addAccountToClient, updateAccountInClient, removeAccountFromClient, getClientAccounts,
        linkAnalysis, linkBid, getClientAnalyses, getClientBids,
        importFromSalesforce, exportClients, exportForGitHub, downloadClientsJSON,
        syncToGitHub, loadFromGitHub, hasUnsavedChanges, onReady,
        startBatch, endBatch, getStorageInfo, clearAllClients,
        subscribe, getStats, getClientDropdownOptions,
        SALESFORCE_FIELD_MAP, ACCOUNT_FIELD_MAP
    };

})();

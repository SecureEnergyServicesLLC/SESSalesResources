/**
 * Client Store - Centralized Client Management
 * Provides unique client identifiers (CID) across all portal widgets
 * Supports Salesforce data import and cross-widget client context
 * Version: 2.3.1 - Fixed broadcast function reference
 * 
 * CHANGELOG:
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
    let activeAccountId = null;  // Track active child account under the active client
    let subscribers = [];
    let currentUserId = null;  // Track current user for user-specific storage

    // ========================================
    // Broadcast Helper - Uses global broadcast if available
    // This fixes the "Can't find variable: broadcast" error
    // ========================================
    function broadcast(messageType, data = {}) {
        // Try to use global broadcast from shared-data-store.js
        if (typeof window.broadcast === 'function') {
            return window.broadcast(messageType, data);
        }
        
        // Fallback implementation if global broadcast not available
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
        
        console.log(`[ClientStore:Broadcast] ${messageType}`, data);
        return message;
    }

    // Get user-specific storage key
    function getActiveClientKey() {
        return currentUserId 
            ? `${ACTIVE_CLIENT_KEY_BASE}_${currentUserId}` 
            : ACTIVE_CLIENT_KEY_BASE;
    }
    
    function getActiveAccountKey() {
        return currentUserId 
            ? `${ACTIVE_ACCOUNT_KEY_BASE}_${currentUserId}` 
            : ACTIVE_ACCOUNT_KEY_BASE;
    }
    
    // Set current user (called when user logs in)
    function setCurrentUser(userId) {
        if (currentUserId !== userId) {
            currentUserId = userId;
            // Reload active client/account for this user
            loadActiveClient();
            broadcast('userChanged', { userId: userId });
        }
    }
    
    // Get current user ID
    function getCurrentUserId() {
        return currentUserId;
    }

    // ========================================
    // Salesforce Field Mappings - PARENT LEVEL (Contract Report)
    // Maps Salesforce export column headers to internal fields
    // ========================================
    const SALESFORCE_FIELD_MAP = {
        // === YOUR SALESFORCE REPORT FIELDS ===
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
        
        // === STANDARD SALESFORCE ACCOUNT FIELDS ===
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
        
        // === ENERGY-SPECIFIC CUSTOM FIELDS ===
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

    // ========================================
    // Salesforce Field Mappings - ACCOUNT/LOCATION LEVEL (Child Records)
    // For enrichment import that adds accounts under parent clients
    // ========================================
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
    // Initialization - GitHub First Approach
    // Data loads from data/clients.json, NOT localStorage
    // ========================================
    let initialized = false;
    let pendingCallbacks = [];
    
    function init() {
        if (initialized) {
            console.log('[ClientStore] Already initialized with', Object.keys(clients).length, 'clients');
            return Promise.resolve(getStats());
        }
        
        console.log('[ClientStore] Initializing - loading from GitHub...');
        loadActiveClient(); // Active client selection can stay in localStorage
        
        return loadFromGitHub().then(() => {
            initialized = true;
            console.log('[ClientStore] Initialized with', Object.keys(clients).length, 'clients from GitHub');
            
            // Execute any pending callbacks
            pendingCallbacks.forEach(cb => cb());
            pendingCallbacks = [];
            
            return getStats();
        }).catch(err => {
            console.error('[ClientStore] GitHub load failed, trying localStorage fallback:', err);
            loadFromLocalStorage();
            initialized = true;
            return getStats();
        });
    }
    
    function onReady(callback) {
        if (initialized) {
            callback();
        } else {
            pendingCallbacks.push(callback);
        }
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
            
            // Validate that active account belongs to active client
            if (activeAccountId && activeClientId) {
                const client = clients[activeClientId];
                if (!client?.accounts?.find(a => a.id === activeAccountId)) {
                    console.log('[ClientStore] Active account no longer valid, clearing');
                    activeAccountId = null;
                    localStorage.removeItem(accountKey);
                }
            } else if (activeAccountId && !activeClientId) {
                // Can't have active account without active client
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

    // Save to memory only - call exportForGitHub() to get JSON for manual save
    function saveToStorage() {
        // Skip if in batch mode (will save at end of batch)
        if (batchMode) {
            batchPending = true;
            return;
        }
        
        // Mark as needing GitHub sync
        needsGitHubSync = true;
        
        const sizeKB = (JSON.stringify(clients).length / 1024).toFixed(1);
        console.log('[ClientStore] Data updated in memory (' + sizeKB + ' KB) - export to save to GitHub');
        
        notifySubscribers('dataChanged', { clientCount: Object.keys(clients).length, sizeKB });
    }
    
    let needsGitHubSync = false;
    
    function hasUnsavedChanges() {
        return needsGitHubSync;
    }
    
    function exportForGitHub() {
        // Returns JSON string ready to be saved to data/clients.json
        const exportData = {
            version: '2.1.0',
            lastUpdated: new Date().toISOString(),
            clientCount: Object.keys(clients).length,
            clients: clients
        };
        return JSON.stringify(exportData, null, 2);
    }
    
    // Batch mode for bulk imports - prevents saving after each record
    let batchMode = false;
    let batchPending = false;
    
    function startBatch() {
        batchMode = true;
        batchPending = false;
        console.log('[ClientStore] Batch mode started');
    }
    
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
            const sizeKB = (sizeBytes / 1024).toFixed(2);
            const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
            
            let totalAccounts = 0;
            Object.values(clients).forEach(c => {
                totalAccounts += (c.accounts?.length || 0);
            });
            
            return {
                clientCount: Object.keys(clients).length,
                accountCount: totalAccounts,
                sizeBytes,
                sizeKB: parseFloat(sizeKB),
                sizeMB: parseFloat(sizeMB),
                estimatedLimit: '5-10 MB (varies by browser)',
                warning: sizeBytes > 3 * 1024 * 1024 ? 'Approaching storage limit!' : null
            };
        } catch (e) {
            return { error: e.message };
        }
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
            
            if (activeClientId) {
                localStorage.setItem(clientKey, activeClientId);
            } else {
                localStorage.removeItem(clientKey);
            }
            
            if (activeAccountId) {
                localStorage.setItem(accountKey, activeAccountId);
            } else {
                localStorage.removeItem(accountKey);
            }
            
            console.log('[ClientStore] Saved active selection for user:', currentUserId || 'default');
        } catch (e) {
            console.error('[ClientStore] Save active client/account error:', e);
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
        const previousAccount = activeAccountId;
        activeClientId = clientId;
        
        // Clear active account when switching clients
        if (previousClient !== clientId) {
            activeAccountId = null;
        }
        
        saveActiveClient();
        
        // Notify all widgets of client change
        notifySubscribers('activeClientChanged', {
            previous: previousClient,
            current: clientId,
            client: clientId ? clients[clientId] : null,
            previousAccountId: previousAccount,
            accountId: null,
            account: null
        });
        
        // Post message to all iframes (widgets)
        broadcastToWidgets({
            type: 'ACTIVE_CLIENT_CHANGED',
            clientId: clientId,
            client: clientId ? clients[clientId] : null,
            accountId: null,
            account: null
        });
        
        console.log('[ClientStore] Active client set to:', clientId, '(account cleared)');
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

    // ========================================
    // Active Account Management (Child Context under Active Client)
    // ========================================
    function setActiveAccount(accountId) {
        // Must have active client to set active account
        if (!activeClientId) {
            console.warn('[ClientStore] Cannot set active account without active client');
            return false;
        }
        
        // Validate account exists under active client
        const client = clients[activeClientId];
        if (accountId && !client?.accounts?.find(a => a.id === accountId)) {
            console.warn('[ClientStore] Account not found under active client:', accountId);
            return false;
        }
        
        const previousAccount = activeAccountId;
        activeAccountId = accountId;
        saveActiveClient();
        
        const account = accountId ? client.accounts.find(a => a.id === accountId) : null;
        
        // Notify all widgets of account change
        notifySubscribers('activeAccountChanged', {
            previous: previousAccount,
            current: accountId,
            account: account,
            clientId: activeClientId,
            client: client
        });
        
        // Post message to all iframes (widgets)
        broadcastToWidgets({
            type: 'ACTIVE_ACCOUNT_CHANGED',
            clientId: activeClientId,
            client: client,
            accountId: accountId,
            account: account
        });
        
        console.log('[ClientStore] Active account set to:', accountId);
        return true;
    }

    function getActiveAccount() {
        if (!activeClientId || !activeAccountId) return null;
        const client = clients[activeClientId];
        return client?.accounts?.find(a => a.id === activeAccountId) || null;
    }

    function getActiveAccountId() {
        return activeAccountId;
    }

    function clearActiveAccount() {
        setActiveAccount(null);
    }

    // Get the full active context (client + account)
    function getActiveContext() {
        const client = getActiveClient();
        const account = getActiveAccount();
        return {
            clientId: activeClientId,
            client: client,
            clientName: client?.name || null,
            accountId: activeAccountId,
            account: account,
            accountName: account?.accountName || null,
            // Helper for generating storage keys
            contextKey: activeAccountId 
                ? `${activeClientId}_${activeAccountId}` 
                : (activeClientId || 'none'),
            // Display string for UI
            displayName: account 
                ? `${client?.name} → ${account.accountName}` 
                : (client?.name || 'No selection')
        };
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
            annualUsageKwh: clientData.annualUsageKwh || '',
            contractEndDate: clientData.contractEndDate || '',
            currentSupplier: clientData.currentSupplier || '',
            rateType: clientData.rateType || '',
            
            // Contract Details (from Salesforce)
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
            
            // Locations (for multi-site clients)
            locations: clientData.locations || [],
            
            // Usage Profile (from Energy Utilization widget)
            usageProfile: clientData.usageProfile || null,
            
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
        
        console.log('[ClientStore] importFromSalesforce called with:', typeof data, Array.isArray(data) ? data.length + ' records' : data);
        
        // Parse input data
        if (typeof data === 'string') {
            // CSV format
            console.log('[ClientStore] Parsing as CSV string');
            records = parseCSV(data);
        } else if (Array.isArray(data)) {
            console.log('[ClientStore] Data is array with', data.length, 'records');
            records = data;
        } else if (data && typeof data === 'object') {
            // Single record
            console.log('[ClientStore] Data is single object');
            records = [data];
        }
        
        console.log('[ClientStore] Processing', records.length, 'records');
        if (records.length > 0) {
            console.log('[ClientStore] First record keys:', Object.keys(records[0]));
            console.log('[ClientStore] First record:', records[0]);
        }
        
        const currentUser = window.UserStore?.getCurrentUser?.();
        
        records.forEach((record, index) => {
            try {
                // Map Salesforce fields to internal fields
                const mappedData = mapSalesforceFields(record);
                
                console.log(`[ClientStore] Row ${index + 1}: mappedData.name = "${mappedData.name}"`);
                
                if (!mappedData.name) {
                    results.skipped++;
                    results.errors.push(`Row ${index + 1}: Missing required field 'Name' (mapped from 'Parent Account: Account Name')`);
                    console.log(`[ClientStore] Row ${index + 1}: SKIPPED - no name field`);
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
                        console.log(`[ClientStore] Row ${index + 1}: UPDATED existing client ${existingClient.id}`);
                    } else {
                        results.skipped++;
                        console.log(`[ClientStore] Row ${index + 1}: SKIPPED - already exists`);
                    }
                } else {
                    // Create new client
                    const newClient = createClient({
                        ...mappedData,
                        source: 'Salesforce',
                        createdBy: currentUser?.email || ''
                    });
                    results.imported++;
                    console.log(`[ClientStore] Row ${index + 1}: IMPORTED new client ${newClient.id}`);
                }
            } catch (e) {
                console.error(`[ClientStore] Row ${index + 1}: ERROR -`, e);
                results.errors.push(`Row ${index + 1}: ${e.message}`);
            }
        });
        
        console.log('[ClientStore] Salesforce import results:', results);
        notifySubscribers('import', results);
        
        return results;
    }

    function mapSalesforceFields(record) {
        const mapped = {};
        
        console.log('[ClientStore] Mapping record:', record);
        
        Object.entries(record).forEach(([key, value]) => {
            // Trim the key in case of whitespace
            const trimmedKey = key.trim();
            
            // Check if we have a mapping for this field
            const internalField = SALESFORCE_FIELD_MAP[trimmedKey];
            if (internalField) {
                mapped[internalField] = value;
                console.log(`[ClientStore] Mapped: "${trimmedKey}" -> ${internalField} = "${value}"`);
            } else if (trimmedKey.endsWith('__c')) {
                // Custom field - store in customFields
                if (!mapped.customFields) mapped.customFields = {};
                mapped.customFields[trimmedKey] = value;
            }
        });
        
        console.log('[ClientStore] Final mapped data:', mapped);
        return mapped;
    }

    // ========================================
    // Account/Location Import (Enrichment)
    // Adds child accounts to existing parent clients
    // ========================================
    function importAccounts(data, options = {}) {
        const results = {
            imported: 0,
            updated: 0,
            skipped: 0,
            orphaned: 0,
            errors: []
        };
        
        let records = [];
        
        console.log('[ClientStore] importAccounts called with:', typeof data, Array.isArray(data) ? data.length + ' records' : data);
        
        // Parse input data
        if (typeof data === 'string') {
            records = parseCSV(data);
        } else if (Array.isArray(data)) {
            records = data;
        } else if (data && typeof data === 'object') {
            records = [data];
        }
        
        console.log('[ClientStore] Processing', records.length, 'account records');
        if (records.length > 0) {
            console.log('[ClientStore] First record keys:', Object.keys(records[0]));
        }
        
        // Start batch mode to prevent saving after each record
        startBatch();
        
        records.forEach((record, index) => {
            try {
                // Map account fields
                const mappedAccount = mapAccountFields(record);
                
                // Must have a parent account name to link
                if (!mappedAccount.parentAccountName) {
                    results.skipped++;
                    console.log(`[ClientStore] Row ${index + 1}: SKIPPED - no Parent Account`);
                    return;
                }
                
                // Find parent client by name
                const parentClient = getClientByName(mappedAccount.parentAccountName);
                
                if (!parentClient) {
                    results.orphaned++;
                    if (options.createOrphans) {
                        // Optionally create parent if doesn't exist
                        const newParent = createClient({
                            name: mappedAccount.parentAccountName,
                            source: 'Auto-created from Account Import'
                        });
                        addAccountToClient(newParent.id, mappedAccount);
                        results.imported++;
                        console.log(`[ClientStore] Row ${index + 1}: Created parent and added account`);
                    } else {
                        results.errors.push(`Row ${index + 1}: Parent "${mappedAccount.parentAccountName}" not found`);
                        console.log(`[ClientStore] Row ${index + 1}: ORPHANED - parent not found`);
                    }
                    return;
                }
                
                // Check if this account already exists under the parent
                const existingAccount = findAccountInClient(parentClient.id, mappedAccount);
                
                if (existingAccount) {
                    if (options.updateExisting) {
                        updateAccountInClient(parentClient.id, existingAccount.id, mappedAccount);
                        results.updated++;
                        console.log(`[ClientStore] Row ${index + 1}: UPDATED account in ${parentClient.name}`);
                    } else {
                        results.skipped++;
                        console.log(`[ClientStore] Row ${index + 1}: SKIPPED - account exists`);
                    }
                } else {
                    // Add new account to parent
                    addAccountToClient(parentClient.id, mappedAccount);
                    results.imported++;
                    console.log(`[ClientStore] Row ${index + 1}: ADDED account to ${parentClient.name}`);
                }
                
            } catch (e) {
                console.error(`[ClientStore] Row ${index + 1}: ERROR -`, e);
                results.errors.push(`Row ${index + 1}: ${e.message}`);
            }
        });
        
        // End batch mode - this will trigger a single save
        endBatch();
        
        console.log('[ClientStore] Account import results:', results);
        notifySubscribers('accountImport', results);
        
        return results;
    }

    function mapAccountFields(record) {
        const mapped = {};
        
        Object.entries(record).forEach(([key, value]) => {
            const trimmedKey = key.trim();
            const internalField = ACCOUNT_FIELD_MAP[trimmedKey];
            if (internalField) {
                mapped[internalField] = value;
            }
        });
        
        // Generate a unique ID for the account
        mapped.id = 'ACC-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        mapped.importedAt = new Date().toISOString();
        
        return mapped;
    }

    function addAccountToClient(clientId, accountData) {
        if (!clients[clientId]) return null;
        
        // Initialize accounts array if doesn't exist
        if (!clients[clientId].accounts) {
            clients[clientId].accounts = [];
        }
        
        const account = {
            ...accountData,
            addedAt: new Date().toISOString()
        };
        
        clients[clientId].accounts.push(account);
        clients[clientId].updatedAt = new Date().toISOString();
        
        // Update aggregate stats
        updateClientAggregates(clientId);
        
        saveToStorage();
        notifySubscribers('accountAdded', { clientId, account });
        
        return account;
    }

    function findAccountInClient(clientId, accountData) {
        if (!clients[clientId]?.accounts) return null;
        
        // Match by account number or account name + zip
        return clients[clientId].accounts.find(acc => 
            (accountData.accountNumber && acc.accountNumber === accountData.accountNumber) ||
            (acc.accountName === accountData.accountName && acc.serviceZip === accountData.serviceZip)
        );
    }

    function updateAccountInClient(clientId, accountId, updates) {
        if (!clients[clientId]?.accounts) return null;
        
        const accountIndex = clients[clientId].accounts.findIndex(acc => acc.id === accountId);
        if (accountIndex === -1) return null;
        
        clients[clientId].accounts[accountIndex] = {
            ...clients[clientId].accounts[accountIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
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
        
        // Calculate totals from child accounts
        let totalKwh = 0;
        let totalDth = 0;
        let accountCount = accounts.length;
        
        accounts.forEach(acc => {
            if (acc.supplierAnnualKwh) totalKwh += parseFloat(acc.supplierAnnualKwh) || 0;
            if (acc.supplierAnnualDth) totalDth += parseFloat(acc.supplierAnnualDth) || 0;
        });
        
        clients[clientId].aggregates = {
            accountCount,
            totalAnnualKwh: totalKwh,
            totalAnnualDth: totalDth,
            totalAnnualMWh: totalKwh / 1000,
            lastCalculated: new Date().toISOString()
        };
    }

    function getClientAccounts(clientId) {
        return clients[clientId]?.accounts || [];
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
    // GitHub / Server Data Loading
    // Primary data source is data/clients.json
    // ========================================
    
    const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/SecureEnergyServicesLLC/SESSalesResources/main/';
    const LOCAL_DATA_PATH = 'data/clients.json';
    
    async function loadFromGitHub() {
        const urls = [
            GITHUB_RAW_BASE + LOCAL_DATA_PATH,
            LOCAL_DATA_PATH,
            '../' + LOCAL_DATA_PATH,
            './' + LOCAL_DATA_PATH
        ];
        
        for (const url of urls) {
            try {
                console.log('[ClientStore] Trying to load from:', url);
                const response = await fetch(url + '?t=' + Date.now()); // Cache bust
                
                if (response.ok) {
                    const data = await response.json();
                    
                    // Handle both formats: { clients: {...} } or direct {...}
                    if (data.clients && typeof data.clients === 'object') {
                        clients = data.clients;
                        console.log('[ClientStore] Loaded', Object.keys(clients).length, 'clients from:', url);
                    } else if (typeof data === 'object' && !Array.isArray(data)) {
                        // Direct object format - check if it looks like client data
                        const firstKey = Object.keys(data)[0];
                        if (firstKey && (firstKey.startsWith('CID-') || data[firstKey]?.name)) {
                            clients = data;
                            console.log('[ClientStore] Loaded', Object.keys(clients).length, 'clients (direct format) from:', url);
                        }
                    }
                    
                    needsGitHubSync = false;
                    return true;
                }
            } catch (e) {
                console.log('[ClientStore] Failed to load from', url, '-', e.message);
            }
        }
        
        console.warn('[ClientStore] Could not load clients.json from any source');
        return false;
    }
    
    async function syncToGitHub() {
        // For GitHub Pages, we can't directly write files
        // Instead, provide the JSON for manual commit or use GitHub API if available
        
        if (typeof GitHubSync !== 'undefined' && GitHubSync.saveFile) {
            try {
                const exportData = exportForGitHub();
                await GitHubSync.saveFile(GITHUB_FILE, exportData);
                needsGitHubSync = false;
                console.log('[ClientStore] Synced to GitHub via GitHubSync');
                return true;
            } catch (e) {
                console.error('[ClientStore] GitHub sync error:', e);
                return false;
            }
        }
        
        // Fallback: Download as file for manual upload
        console.log('[ClientStore] GitHubSync not available - use downloadClientsJSON() to get file for manual upload');
        return false;
    }
    
    function downloadClientsJSON() {
        const data = exportForGitHub();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'clients.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[ClientStore] Downloaded clients.json - upload to data/ folder in GitHub');
        return true;
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
        
        // User Management (for user-specific selections)
        setCurrentUser,
        getCurrentUserId,
        
        // Active Client (Portal-Wide Context)
        setActiveClient,
        getActiveClient,
        getActiveClientId,
        clearActiveClient,
        
        // Active Account (Child Context under Active Client)
        setActiveAccount,
        getActiveAccount,
        getActiveAccountId,
        clearActiveAccount,
        getActiveContext,  // Returns full client+account context with helper methods
        
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
        
        // Accounts (Child Records / Tree Structure)
        importAccounts,
        addAccountToClient,
        updateAccountInClient,
        removeAccountFromClient,
        getClientAccounts,
        
        // Links
        linkAnalysis,
        linkBid,
        getClientAnalyses,
        getClientBids,
        
        // Import/Export
        importFromSalesforce,
        exportClients,
        exportForGitHub,
        downloadClientsJSON,
        
        // GitHub Sync
        syncToGitHub,
        loadFromGitHub,
        hasUnsavedChanges,
        onReady,
        
        // Storage Management
        startBatch,
        endBatch,
        getStorageInfo,
        clearAllClients,
        
        // Utilities
        subscribe,
        getStats,
        getClientDropdownOptions,
        
        // Field mappings (for customization)
        SALESFORCE_FIELD_MAP,
        ACCOUNT_FIELD_MAP
    };

})();

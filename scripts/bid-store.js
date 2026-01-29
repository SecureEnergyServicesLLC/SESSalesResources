/**
 * Bid Store - Bid Process & Pricing Management
 * Manages energy bid processes, supplier quotes, and bid sheets
 * Version: 1.0.0
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'secureEnergy_bids';
    const GITHUB_FILE = 'data/bids.json';
    
    let bids = {};
    let subscribers = [];

    // ========================================
    // Initialization
    // ========================================
    function init() {
        loadFromStorage();
        console.log('[BidStore] Initialized with', Object.keys(bids).length, 'bids');
        return getStats();
    }

    function loadFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                bids = JSON.parse(stored);
            }
        } catch (e) {
            console.error('[BidStore] Load error:', e);
            bids = {};
        }
    }

    function saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(bids));
            notifySubscribers('save', bids);
        } catch (e) {
            console.error('[BidStore] Save error:', e);
        }
    }

    // ========================================
    // Bid ID Generation
    // ========================================
    function generateBidId() {
        // Format: BID-YYYYMMDD-XXXXX
        const date = new Date();
        const dateStr = date.getFullYear().toString() +
            (date.getMonth() + 1).toString().padStart(2, '0') +
            date.getDate().toString().padStart(2, '0');
        const random = Math.random().toString(36).substring(2, 7).toUpperCase();
        return `BID-${dateStr}-${random}`;
    }

    // ========================================
    // CRUD Operations
    // ========================================
    function createBid(bidData) {
        const bidId = generateBidId();
        const timestamp = new Date().toISOString();
        
        const bid = {
            id: bidId,
            clientId: bidData.clientId || null,
            clientName: bidData.clientName || '',
            locations: bidData.locations || [], // Array of location objects with pricing
            commodityType: bidData.commodityType || 'electric',
            iso: bidData.iso || '',
            bidDate: bidData.bidDate || timestamp.split('T')[0],
            expirationDate: bidData.expirationDate || timestamp.split('T')[0], // Same day COB
            salesRepId: bidData.salesRepId || null,
            salesRepName: bidData.salesRepName || '',
            salesRepEmail: bidData.salesRepEmail || '',
            salesRepPhone: bidData.salesRepPhone || '',
            supplierQuotes: [], // Array of supplier pricing quotes
            selectedQuotes: [], // Quotes selected for bid sheet
            notes: bidData.notes || '',
            status: 'draft', // draft, pending, sent, accepted, expired, cancelled
            bidSheetGenerated: false,
            bidSheetPath: null,
            createdAt: timestamp,
            updatedAt: timestamp,
            createdBy: bidData.createdBy || 'system'
        };
        
        bids[bidId] = bid;
        saveToStorage();
        notifySubscribers('create', bid);
        
        // Link bid to client if client store is available
        if (bidData.clientId && window.SecureEnergyClients) {
            window.SecureEnergyClients.linkBid(bidData.clientId, bidId);
        }
        
        return { success: true, bid };
    }

    function updateBid(bidId, updates) {
        if (!bids[bidId]) {
            return { success: false, error: 'Bid not found' };
        }
        
        const bid = bids[bidId];
        
        // Update allowed fields
        const allowedFields = [
            'clientId', 'clientName', 'locations', 'commodityType', 'iso',
            'bidDate', 'expirationDate', 'salesRepId', 'salesRepName',
            'salesRepEmail', 'salesRepPhone', 'supplierQuotes', 'selectedQuotes',
            'notes', 'status', 'bidSheetGenerated', 'bidSheetPath'
        ];
        
        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                bid[field] = updates[field];
            }
        });
        
        bid.updatedAt = new Date().toISOString();
        saveToStorage();
        notifySubscribers('update', bid);
        
        return { success: true, bid };
    }

    function getBid(bidId) {
        return bids[bidId] || null;
    }

    function getAllBids() {
        return Object.values(bids).filter(b => b.status !== 'deleted');
    }

    function getBidsByClient(clientId) {
        return Object.values(bids).filter(b => 
            b.clientId === clientId && b.status !== 'deleted'
        );
    }

    function getBidsBySalesRep(salesRepId) {
        return Object.values(bids).filter(b => 
            b.salesRepId === salesRepId && b.status !== 'deleted'
        );
    }

    function getBidsByStatus(status) {
        return Object.values(bids).filter(b => b.status === status);
    }

    function getRecentBids(limit = 10) {
        return Object.values(bids)
            .filter(b => b.status !== 'deleted')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);
    }

    function deleteBid(bidId, permanent = false) {
        if (!bids[bidId]) {
            return { success: false, error: 'Bid not found' };
        }
        
        if (permanent) {
            delete bids[bidId];
        } else {
            bids[bidId].status = 'deleted';
            bids[bidId].deletedAt = new Date().toISOString();
        }
        
        saveToStorage();
        notifySubscribers('delete', { id: bidId, permanent });
        
        return { success: true };
    }

    // ========================================
    // Location Management for Bids
    // ========================================
    function addBidLocation(bidId, location) {
        const bid = bids[bidId];
        if (!bid) {
            return { success: false, error: 'Bid not found' };
        }
        
        const locationId = `BIDLOC-${Date.now().toString(36).toUpperCase()}`;
        const newLocation = {
            id: locationId,
            name: location.name || `Location ${bid.locations.length + 1}`,
            clientLocationId: location.clientLocationId || null, // Link to client location
            address: location.address || '',
            city: location.city || '',
            state: location.state || '',
            iso: location.iso || bid.iso,
            zone: location.zone || '',
            utility: location.utility || '',
            accountNumber: location.accountNumber || '',
            annualUsage: location.annualUsage || 0,
            usageUnit: location.usageUnit || 'kWh',
            pricing: [] // Will hold supplier pricing for this location
        };
        
        bid.locations.push(newLocation);
        bid.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true, location: newLocation };
    }

    function updateBidLocation(bidId, locationId, updates) {
        const bid = bids[bidId];
        if (!bid) {
            return { success: false, error: 'Bid not found' };
        }
        
        const locationIndex = bid.locations.findIndex(l => l.id === locationId);
        if (locationIndex === -1) {
            return { success: false, error: 'Location not found' };
        }
        
        bid.locations[locationIndex] = { ...bid.locations[locationIndex], ...updates };
        bid.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true, location: bid.locations[locationIndex] };
    }

    function removeBidLocation(bidId, locationId) {
        const bid = bids[bidId];
        if (!bid) {
            return { success: false, error: 'Bid not found' };
        }
        
        bid.locations = bid.locations.filter(l => l.id !== locationId);
        bid.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true };
    }

    // ========================================
    // Supplier Quote Management
    // ========================================
    function addSupplierQuote(bidId, quote) {
        const bid = bids[bidId];
        if (!bid) {
            return { success: false, error: 'Bid not found' };
        }
        
        const quoteId = `QTE-${Date.now().toString(36).toUpperCase()}`;
        const newQuote = {
            id: quoteId,
            supplierId: quote.supplierId || '',
            supplierName: quote.supplierName || '',
            productName: quote.productName || 'Fixed',
            productCode: quote.productCode || 'FIXED',
            swingType: quote.swingType || '',
            commodity: quote.commodity || bid.commodityType,
            terms: quote.terms || [], // Array of { term: 12, price: 0.08765 }
            locationPricing: quote.locationPricing || {}, // { locationId: { term: price } }
            aggregatedPricing: quote.aggregatedPricing || {}, // { term: price } for all locations
            unit: quote.unit || (bid.commodityType === 'electric' ? 'dollars/kWh' : 'dollars/DTH'),
            validUntil: quote.validUntil || bid.expirationDate,
            sourceFile: quote.sourceFile || null,
            sourceType: quote.sourceType || 'manual', // manual, email, excel, csv
            notes: quote.notes || '',
            createdAt: new Date().toISOString()
        };
        
        bid.supplierQuotes.push(newQuote);
        bid.updatedAt = new Date().toISOString();
        saveToStorage();
        notifySubscribers('quoteAdd', { bidId, quote: newQuote });
        
        return { success: true, quote: newQuote };
    }

    function updateSupplierQuote(bidId, quoteId, updates) {
        const bid = bids[bidId];
        if (!bid) {
            return { success: false, error: 'Bid not found' };
        }
        
        const quoteIndex = bid.supplierQuotes.findIndex(q => q.id === quoteId);
        if (quoteIndex === -1) {
            return { success: false, error: 'Quote not found' };
        }
        
        bid.supplierQuotes[quoteIndex] = { ...bid.supplierQuotes[quoteIndex], ...updates };
        bid.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true, quote: bid.supplierQuotes[quoteIndex] };
    }

    function removeSupplierQuote(bidId, quoteId) {
        const bid = bids[bidId];
        if (!bid) {
            return { success: false, error: 'Bid not found' };
        }
        
        bid.supplierQuotes = bid.supplierQuotes.filter(q => q.id !== quoteId);
        bid.selectedQuotes = bid.selectedQuotes.filter(id => id !== quoteId);
        bid.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true };
    }

    // ========================================
    // Quote Selection for Bid Sheet
    // ========================================
    function selectQuoteForBidSheet(bidId, quoteId) {
        const bid = bids[bidId];
        if (!bid) {
            return { success: false, error: 'Bid not found' };
        }
        
        if (!bid.supplierQuotes.find(q => q.id === quoteId)) {
            return { success: false, error: 'Quote not found' };
        }
        
        if (!bid.selectedQuotes.includes(quoteId)) {
            bid.selectedQuotes.push(quoteId);
            bid.updatedAt = new Date().toISOString();
            saveToStorage();
        }
        
        return { success: true };
    }

    function deselectQuoteFromBidSheet(bidId, quoteId) {
        const bid = bids[bidId];
        if (!bid) {
            return { success: false, error: 'Bid not found' };
        }
        
        bid.selectedQuotes = bid.selectedQuotes.filter(id => id !== quoteId);
        bid.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true };
    }

    function getSelectedQuotes(bidId) {
        const bid = bids[bidId];
        if (!bid) return [];
        
        return bid.supplierQuotes.filter(q => bid.selectedQuotes.includes(q.id));
    }

    // ========================================
    // Pricing File Parsing
    // ========================================
    function parsePricingFromCSV(csvContent, supplier, options = {}) {
        const lines = csvContent.split('\n').map(l => l.trim()).filter(l => l);
        const results = [];
        
        const format = supplier?.pricingFormat || { type: 'columnar' };
        
        if (format.type === 'columnar') {
            // Find term row and price row
            let termRow = null;
            let priceRows = [];
            
            lines.forEach((line, idx) => {
                if (line.toLowerCase().includes('term')) {
                    termRow = idx;
                }
                if (line.toLowerCase().includes('price')) {
                    priceRows.push(idx);
                }
            });
            
            if (termRow !== null) {
                const termCells = lines[termRow].split(',').map(c => c.trim());
                const terms = [];
                termCells.forEach((cell, colIdx) => {
                    const num = parseInt(cell);
                    if (!isNaN(num) && num > 0) {
                        terms.push({ col: colIdx, term: num });
                    }
                });
                
                priceRows.forEach(priceRowIdx => {
                    const priceCells = lines[priceRowIdx].split(',').map(c => c.trim());
                    const pricing = [];
                    
                    terms.forEach(({ col, term }) => {
                        const priceStr = priceCells[col];
                        if (priceStr) {
                            const price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
                            if (!isNaN(price) && price > 0) {
                                pricing.push({ term, price });
                            }
                        }
                    });
                    
                    if (pricing.length > 0) {
                        results.push({
                            supplierName: supplier?.name || 'Unknown',
                            productName: options.productName || 'Fixed',
                            terms: pricing
                        });
                    }
                });
            }
        }
        
        return results;
    }

    function parsePricingFromExcel(data, supplier, options = {}) {
        // Expects data to be array of arrays (rows/cols)
        const results = [];
        
        const format = supplier?.pricingFormat || { type: 'columnar' };
        
        if (format.type === 'columnar') {
            let termRowIdx = -1;
            let priceRowIndices = [];
            
            data.forEach((row, idx) => {
                const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
                if (rowStr.includes('term')) termRowIdx = idx;
                if (rowStr.includes('price')) priceRowIndices.push(idx);
            });
            
            if (termRowIdx >= 0) {
                const termRow = data[termRowIdx];
                const terms = [];
                
                termRow.forEach((cell, colIdx) => {
                    const num = parseInt(cell);
                    if (!isNaN(num) && num > 0) {
                        terms.push({ col: colIdx, term: num });
                    }
                });
                
                priceRowIndices.forEach(priceRowIdx => {
                    const priceRow = data[priceRowIdx];
                    const pricing = [];
                    
                    // Get supplier/product name from first cells
                    let supplierName = '';
                    let productName = '';
                    
                    // Look for supplier name in previous rows
                    for (let i = priceRowIdx - 1; i >= Math.max(0, priceRowIdx - 3); i--) {
                        const row = data[i];
                        if (row && row[0]) {
                            const cell = String(row[0]).toLowerCase();
                            if (cell.includes('supplier') || cell.includes('product')) {
                                const val = row[1] || row[7] || row[8];
                                if (val) {
                                    if (!supplierName) supplierName = String(val);
                                    else if (!productName) productName = String(val);
                                }
                            }
                        }
                    }
                    
                    terms.forEach(({ col, term }) => {
                        const priceCell = priceRow[col];
                        if (priceCell !== undefined && priceCell !== null && priceCell !== '') {
                            const price = parseFloat(String(priceCell).replace(/[^0-9.]/g, ''));
                            if (!isNaN(price) && price > 0) {
                                pricing.push({ term, price });
                            }
                        }
                    });
                    
                    if (pricing.length > 0) {
                        results.push({
                            supplierName: supplierName || supplier?.name || 'Unknown',
                            productName: productName || options.productName || 'Fixed',
                            terms: pricing
                        });
                    }
                });
            }
        }
        
        return results;
    }

    // ========================================
    // Bid Sheet Data Preparation
    // ========================================
    function prepareBidSheetData(bidId) {
        const bid = bids[bidId];
        if (!bid) {
            return { success: false, error: 'Bid not found' };
        }
        
        const selectedQuotes = getSelectedQuotes(bidId);
        
        // Group quotes by supplier/product
        const quoteGroups = [];
        selectedQuotes.forEach(quote => {
            quoteGroups.push({
                supplierName: quote.supplierName,
                productName: quote.productName,
                swingType: quote.swingType,
                commodity: quote.commodity,
                unit: quote.unit,
                terms: quote.terms,
                aggregatedPricing: quote.aggregatedPricing
            });
        });
        
        // Get all unique terms
        const allTerms = [...new Set(
            selectedQuotes.flatMap(q => q.terms.map(t => t.term))
        )].sort((a, b) => a - b);
        
        return {
            success: true,
            data: {
                bidId: bid.id,
                clientName: bid.clientName,
                bidDate: bid.bidDate,
                expirationDate: bid.expirationDate,
                salesRep: {
                    name: bid.salesRepName,
                    email: bid.salesRepEmail,
                    phone: bid.salesRepPhone
                },
                commodityType: bid.commodityType,
                locations: bid.locations,
                quoteGroups: quoteGroups,
                allTerms: allTerms
            }
        };
    }

    // ========================================
    // GitHub Sync
    // ========================================
    async function syncToGitHub(token, repo) {
        if (!token || !repo) return { success: false, error: 'Missing token or repo' };
        
        try {
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(bids, null, 2))));
            const apiUrl = `https://api.github.com/repos/${repo}/contents/${GITHUB_FILE}`;
            
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
                message: `Update bids - ${new Date().toISOString()}`,
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
            console.error('[BidStore] GitHub sync error:', e);
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
                if (resp.status === 404) return { success: true, bids: {} };
                throw new Error(`GitHub API error: ${resp.status}`);
            }
            
            const data = await resp.json();
            const content = decodeURIComponent(escape(atob(data.content)));
            const loaded = JSON.parse(content);
            
            bids = { ...bids, ...loaded };
            saveToStorage();
            
            return { success: true, bids };
        } catch (e) {
            console.error('[BidStore] GitHub load error:', e);
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
                console.error('[BidStore] Subscriber error:', e);
            }
        });
    }

    // ========================================
    // Stats
    // ========================================
    function getStats() {
        const all = Object.values(bids).filter(b => b.status !== 'deleted');
        return {
            total: all.length,
            draft: all.filter(b => b.status === 'draft').length,
            pending: all.filter(b => b.status === 'pending').length,
            sent: all.filter(b => b.status === 'sent').length,
            accepted: all.filter(b => b.status === 'accepted').length,
            expired: all.filter(b => b.status === 'expired').length,
            totalQuotes: all.reduce((sum, b) => sum + (b.supplierQuotes?.length || 0), 0),
            recentBids: all.filter(b => {
                const created = new Date(b.createdAt);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return created > weekAgo;
            }).length
        };
    }

    // ========================================
    // Export Public API
    // ========================================
    window.SecureEnergyBids = {
        init,
        generateBidId,
        createBid,
        updateBid,
        getBid,
        getAllBids,
        getBidsByClient,
        getBidsBySalesRep,
        getBidsByStatus,
        getRecentBids,
        deleteBid,
        addBidLocation,
        updateBidLocation,
        removeBidLocation,
        addSupplierQuote,
        updateSupplierQuote,
        removeSupplierQuote,
        selectQuoteForBidSheet,
        deselectQuoteFromBidSheet,
        getSelectedQuotes,
        parsePricingFromCSV,
        parsePricingFromExcel,
        prepareBidSheetData,
        syncToGitHub,
        loadFromGitHub,
        subscribe,
        getStats
    };

})();

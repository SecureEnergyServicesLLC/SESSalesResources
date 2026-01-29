/**
 * Supplier Store - Supplier Profile & Pricing Management
 * Manages energy supplier information and pricing format configurations
 * Version: 1.0.0
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'secureEnergy_suppliers';
    const GITHUB_FILE = 'data/suppliers.json';
    
    let suppliers = {};
    let subscribers = [];

    // ========================================
    // Default Suppliers (Common Energy Suppliers)
    // ========================================
    const DEFAULT_SUPPLIERS = {
        'SUP-CONSTELLATION': {
            id: 'SUP-CONSTELLATION',
            name: 'Constellation',
            displayName: 'Constellation Energy',
            logo: '',
            website: 'https://www.constellation.com',
            contactEmail: '',
            contactPhone: '',
            products: [
                { name: 'Fixed', code: 'FIXED', swingType: 'Unlimited Swing' },
                { name: 'Ancillary Lock', code: 'ANC', swingType: 'Unlimited Swing' },
                { name: 'Ancillary Lock - No Capacity', code: 'ANC-NC', swingType: '' }
            ],
            termOptions: [12, 18, 24, 29, 30, 36, 48],
            commodities: ['electric', 'gas'],
            isos: ['PJM', 'ISONE', 'NYISO', 'ERCOT', 'CAISO', 'MISO'],
            pricingFormat: {
                type: 'columnar',
                termRow: 'Term: (months)',
                priceRow: 'Price:',
                electricUnit: 'dollars/kWh',
                gasUnit: 'dollars/DTH'
            },
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z'
        },
        'SUP-NRG': {
            id: 'SUP-NRG',
            name: 'NRG',
            displayName: 'NRG Energy',
            logo: '',
            website: 'https://www.nrg.com',
            contactEmail: '',
            contactPhone: '',
            products: [
                { name: 'Fixed', code: 'FIXED', swingType: '25% Swing' },
                { name: 'Ancillary Lock', code: 'ANC', swingType: '25% Swing' }
            ],
            termOptions: [11, 12, 18, 24, 30, 31],
            commodities: ['electric', 'gas'],
            isos: ['PJM', 'ISONE', 'NYISO', 'ERCOT'],
            pricingFormat: {
                type: 'columnar',
                termRow: 'Term: (months)',
                priceRow: 'Price:',
                electricUnit: 'dollars/kWh',
                gasUnit: 'dollars/DTH'
            },
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z'
        },
        'SUP-SMARTEST': {
            id: 'SUP-SMARTEST',
            name: 'Smartest Energy',
            displayName: 'Smartest Energy',
            logo: '',
            website: 'https://www.smartestenergy.com',
            contactEmail: '',
            contactPhone: '',
            products: [
                { name: 'Fixed', code: 'FIXED', swingType: '100% Swing' }
            ],
            termOptions: [12, 18, 24, 30, 36, 48],
            commodities: ['electric'],
            isos: ['PJM', 'ISONE', 'NYISO'],
            pricingFormat: {
                type: 'columnar',
                termRow: 'Term: (months)',
                priceRow: 'Price:',
                electricUnit: 'dollars/kWh',
                gasUnit: 'dollars/DTH'
            },
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z'
        },
        'SUP-FIRSTPOINT': {
            id: 'SUP-FIRSTPOINT',
            name: 'First Point Power',
            displayName: 'First Point Power',
            logo: '',
            website: '',
            contactEmail: '',
            contactPhone: '',
            products: [
                { name: 'Fixed', code: 'FIXED', swingType: '100% Swing' }
            ],
            termOptions: [12, 18, 24, 30, 36, 37],
            commodities: ['electric'],
            isos: ['PJM', 'ISONE'],
            pricingFormat: {
                type: 'columnar',
                termRow: 'Term: (months)',
                priceRow: 'Price:',
                electricUnit: 'dollars/kWh',
                gasUnit: 'dollars/DTH'
            },
            status: 'active',
            createdAt: '2026-01-01T00:00:00.000Z'
        }
    };

    // ========================================
    // Initialization
    // ========================================
    function init() {
        loadFromStorage();
        
        // Ensure default suppliers exist
        Object.entries(DEFAULT_SUPPLIERS).forEach(([id, supplier]) => {
            if (!suppliers[id]) {
                suppliers[id] = supplier;
            }
        });
        
        saveToStorage();
        console.log('[SupplierStore] Initialized with', Object.keys(suppliers).length, 'suppliers');
        return getStats();
    }

    function loadFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                suppliers = JSON.parse(stored);
            }
        } catch (e) {
            console.error('[SupplierStore] Load error:', e);
            suppliers = {};
        }
    }

    function saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers));
            notifySubscribers('save', suppliers);
        } catch (e) {
            console.error('[SupplierStore] Save error:', e);
        }
    }

    // ========================================
    // Supplier ID Generation
    // ========================================
    function generateSupplierId(name) {
        const cleanName = name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
        return `SUP-${cleanName}-${Date.now().toString(36).toUpperCase().substring(-4)}`;
    }

    // ========================================
    // CRUD Operations
    // ========================================
    function createSupplier(supplierData) {
        const supplierId = generateSupplierId(supplierData.name);
        const timestamp = new Date().toISOString();
        
        const supplier = {
            id: supplierId,
            name: supplierData.name || '',
            displayName: supplierData.displayName || supplierData.name || '',
            logo: supplierData.logo || '',
            website: supplierData.website || '',
            contactName: supplierData.contactName || '',
            contactEmail: supplierData.contactEmail || '',
            contactPhone: supplierData.contactPhone || '',
            products: supplierData.products || [{ name: 'Fixed', code: 'FIXED', swingType: '' }],
            termOptions: supplierData.termOptions || [12, 24, 36],
            commodities: supplierData.commodities || ['electric'],
            isos: supplierData.isos || [],
            pricingFormat: supplierData.pricingFormat || {
                type: 'columnar',
                termRow: 'Term: (months)',
                priceRow: 'Price:',
                electricUnit: 'dollars/kWh',
                gasUnit: 'dollars/DTH'
            },
            notes: supplierData.notes || '',
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp,
            createdBy: supplierData.createdBy || 'system'
        };
        
        suppliers[supplierId] = supplier;
        saveToStorage();
        notifySubscribers('create', supplier);
        
        return { success: true, supplier };
    }

    function updateSupplier(supplierId, updates) {
        if (!suppliers[supplierId]) {
            return { success: false, error: 'Supplier not found' };
        }
        
        const supplier = suppliers[supplierId];
        
        // Update allowed fields
        const allowedFields = [
            'name', 'displayName', 'logo', 'website', 'contactName',
            'contactEmail', 'contactPhone', 'products', 'termOptions',
            'commodities', 'isos', 'pricingFormat', 'notes', 'status'
        ];
        
        allowedFields.forEach(field => {
            if (updates[field] !== undefined) {
                supplier[field] = updates[field];
            }
        });
        
        supplier.updatedAt = new Date().toISOString();
        saveToStorage();
        notifySubscribers('update', supplier);
        
        return { success: true, supplier };
    }

    function getSupplier(supplierId) {
        return suppliers[supplierId] || null;
    }

    function getSupplierByName(name) {
        return Object.values(suppliers).find(s => 
            s.name.toLowerCase() === name.toLowerCase() ||
            s.displayName.toLowerCase() === name.toLowerCase()
        ) || null;
    }

    function getAllSuppliers() {
        return Object.values(suppliers).filter(s => s.status !== 'deleted');
    }

    function getActiveSuppliers() {
        return Object.values(suppliers).filter(s => s.status === 'active');
    }

    function getSuppliersByISO(iso) {
        return Object.values(suppliers).filter(s => 
            s.status === 'active' && s.isos.includes(iso)
        );
    }

    function getSuppliersByCommodity(commodity) {
        return Object.values(suppliers).filter(s => 
            s.status === 'active' && s.commodities.includes(commodity)
        );
    }

    function deleteSupplier(supplierId, permanent = false) {
        if (!suppliers[supplierId]) {
            return { success: false, error: 'Supplier not found' };
        }
        
        // Don't allow deleting default suppliers
        if (DEFAULT_SUPPLIERS[supplierId] && !permanent) {
            suppliers[supplierId].status = 'inactive';
            saveToStorage();
            return { success: true, warning: 'Default supplier deactivated instead of deleted' };
        }
        
        if (permanent) {
            delete suppliers[supplierId];
        } else {
            suppliers[supplierId].status = 'deleted';
            suppliers[supplierId].deletedAt = new Date().toISOString();
        }
        
        saveToStorage();
        notifySubscribers('delete', { id: supplierId, permanent });
        
        return { success: true };
    }

    // ========================================
    // Product Management
    // ========================================
    function addProduct(supplierId, product) {
        const supplier = suppliers[supplierId];
        if (!supplier) {
            return { success: false, error: 'Supplier not found' };
        }
        
        const newProduct = {
            name: product.name || 'New Product',
            code: product.code || product.name?.toUpperCase().replace(/\s/g, '') || 'NEW',
            swingType: product.swingType || '',
            description: product.description || ''
        };
        
        supplier.products.push(newProduct);
        supplier.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true, product: newProduct };
    }

    function updateProduct(supplierId, productIndex, updates) {
        const supplier = suppliers[supplierId];
        if (!supplier || !supplier.products[productIndex]) {
            return { success: false, error: 'Supplier or product not found' };
        }
        
        supplier.products[productIndex] = { ...supplier.products[productIndex], ...updates };
        supplier.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true, product: supplier.products[productIndex] };
    }

    function removeProduct(supplierId, productIndex) {
        const supplier = suppliers[supplierId];
        if (!supplier) {
            return { success: false, error: 'Supplier not found' };
        }
        
        supplier.products.splice(productIndex, 1);
        supplier.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true };
    }

    // ========================================
    // Pricing Format Configuration
    // ========================================
    function updatePricingFormat(supplierId, formatConfig) {
        const supplier = suppliers[supplierId];
        if (!supplier) {
            return { success: false, error: 'Supplier not found' };
        }
        
        supplier.pricingFormat = {
            ...supplier.pricingFormat,
            ...formatConfig
        };
        supplier.updatedAt = new Date().toISOString();
        saveToStorage();
        
        return { success: true, pricingFormat: supplier.pricingFormat };
    }

    // Supported pricing format types
    const PRICING_FORMATS = {
        columnar: {
            name: 'Columnar',
            description: 'Terms as columns, products as rows',
            example: 'Term: 12, 24, 36 across columns'
        },
        rowBased: {
            name: 'Row-based',
            description: 'Each term/price pair on separate row',
            example: '12 months: $0.08, 24 months: $0.07'
        },
        matrix: {
            name: 'Matrix',
            description: 'Products in rows, terms in columns with prices at intersection',
            example: 'Full price matrix grid'
        },
        custom: {
            name: 'Custom',
            description: 'Custom parsing rules required',
            example: 'Non-standard format'
        }
    };

    function getPricingFormats() {
        return PRICING_FORMATS;
    }

    // ========================================
    // GitHub Sync
    // ========================================
    async function syncToGitHub(token, repo) {
        if (!token || !repo) return { success: false, error: 'Missing token or repo' };
        
        try {
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(suppliers, null, 2))));
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
                message: `Update suppliers - ${new Date().toISOString()}`,
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
            console.error('[SupplierStore] GitHub sync error:', e);
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
                if (resp.status === 404) return { success: true, suppliers: {} };
                throw new Error(`GitHub API error: ${resp.status}`);
            }
            
            const data = await resp.json();
            const content = decodeURIComponent(escape(atob(data.content)));
            const loaded = JSON.parse(content);
            
            suppliers = { ...suppliers, ...loaded };
            saveToStorage();
            
            return { success: true, suppliers };
        } catch (e) {
            console.error('[SupplierStore] GitHub load error:', e);
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
                console.error('[SupplierStore] Subscriber error:', e);
            }
        });
    }

    // ========================================
    // Stats & Export
    // ========================================
    function getStats() {
        const all = Object.values(suppliers);
        return {
            total: all.length,
            active: all.filter(s => s.status === 'active').length,
            totalProducts: all.reduce((sum, s) => sum + (s.products?.length || 0), 0),
            byISO: all.reduce((acc, s) => {
                (s.isos || []).forEach(iso => {
                    acc[iso] = (acc[iso] || 0) + 1;
                });
                return acc;
            }, {}),
            byCommodity: all.reduce((acc, s) => {
                (s.commodities || []).forEach(c => {
                    acc[c] = (acc[c] || 0) + 1;
                });
                return acc;
            }, {})
        };
    }

    function exportSuppliers(format = 'json') {
        if (format === 'csv') {
            const headers = ['ID', 'Name', 'Display Name', 'Website', 'Products', 'Terms', 'Commodities', 'ISOs', 'Status'];
            const rows = Object.values(suppliers).map(s => [
                s.id, s.name, s.displayName, s.website,
                s.products?.map(p => p.name).join('; '),
                s.termOptions?.join('; '),
                s.commodities?.join('; '),
                s.isos?.join('; '),
                s.status
            ]);
            return [headers, ...rows].map(r => r.map(v => `"${v || ''}"`).join(',')).join('\n');
        }
        return JSON.stringify(suppliers, null, 2);
    }

    // ========================================
    // Export Public API
    // ========================================
    window.SecureEnergySuppliers = {
        init,
        generateSupplierId,
        createSupplier,
        updateSupplier,
        getSupplier,
        getSupplierByName,
        getAllSuppliers,
        getActiveSuppliers,
        getSuppliersByISO,
        getSuppliersByCommodity,
        deleteSupplier,
        addProduct,
        updateProduct,
        removeProduct,
        updatePricingFormat,
        getPricingFormats,
        syncToGitHub,
        loadFromGitHub,
        subscribe,
        getStats,
        exportSuppliers,
        DEFAULT_SUPPLIERS
    };

})();

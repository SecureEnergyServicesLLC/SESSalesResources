# Bid Management System for Secure Energy Portal

## Overview

The Bid Management System is a comprehensive widget for the Secure Energy Analytics Portal that enables sales representatives to:

1. **Manage Clients** - Create and track clients with unique Client IDs (CID) that work across all portal widgets
2. **Configure Suppliers** - Build supplier profiles with product offerings, pricing formats, and term options
3. **Process Bids** - Create bids, upload supplier pricing from files or enter manually
4. **Generate Bid Sheets** - Create professional Excel bid sheets matching the SES template format

## Features

### Client Management
- Unique Client ID (CID) format: `CID-YYYYMMDD-XXXXX`
- Track client information: company, contact, ISO, locations, usage
- Link clients to LMP analyses and bids
- Export client list to CSV
- Search and filter clients

### Supplier Profiles
- Pre-loaded with common suppliers: Constellation, NRG, Smartest Energy, First Point Power
- Configure products, swing types, term options
- Support multiple commodities (electric, gas)
- Specify which ISOs each supplier serves

### Bid Process Management
- Create bids linked to clients
- Add multiple locations per bid
- Upload pricing from Excel/CSV files
- Manual pricing entry option
- Select which quotes to include in bid sheet

### Bid Sheet Generation
- Generates Excel files matching the SES template format
- Creates aggregated sheet plus individual location sheets
- Includes logo area, customer info, pricing matrix
- Supports multiple suppliers and products per sheet

## File Structure

```
SESSalesResources/
├── scripts/
│   ├── client-store.js      # Client management (NEW)
│   ├── supplier-store.js    # Supplier profiles (NEW)
│   ├── bid-store.js         # Bid processing (NEW)
│   ├── shared-data-store.js # (existing)
│   ├── user-store.js        # (existing)
│   └── main.js              # (update required)
├── widgets/
│   ├── bid-management-widget.html  # Main widget (NEW)
│   └── ... (existing widgets)
└── index.html               # (update required)
```

## Installation

### 1. Add Script Files

Copy to `scripts/` folder:
- `client-store.js`
- `supplier-store.js`
- `bid-store.js`

### 2. Add Widget File

Copy to `widgets/` folder:
- `bid-management-widget.html`

### 3. Update index.html

Add these script tags BEFORE `main.js`:

```html
<script src="scripts/client-store.js"></script>
<script src="scripts/supplier-store.js"></script>
<script src="scripts/bid-store.js"></script>
```

### 4. Update main.js

Add to the WIDGETS array:

```javascript
{
    id: 'bid-management',
    name: 'Bid Management',
    icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    src: 'widgets/bid-management-widget.html',
    fullWidth: true,
    height: 900
}
```

## Usage

### Creating a Client

1. Go to **Clients** tab
2. Click **+ Add Client**
3. Fill in company name and details
4. Client receives unique CID automatically

### Creating a Bid

1. Click **+ New Bid** or go to **Create Bid Sheet** tab
2. Search for existing client or enter new name
3. Add locations for the bid
4. Select ISO and commodity type
5. Click **Create Bid**

### Adding Supplier Pricing

Option A: **Upload File**
1. Select the supplier from dropdown
2. Drag & drop Excel/CSV file with pricing
3. System parses terms and prices automatically

Option B: **Manual Entry**
1. Select supplier and product
2. Enter swing type
3. Fill in prices for each term
4. Click **Add Quote**

### Generating Bid Sheet

1. Select quotes to include (checkbox)
2. Click **Generate Excel Bid Sheet**
3. Downloads formatted Excel file with:
   - Aggregated pricing (all locations)
   - Individual location sheets
   - SES branding and format

## Data Storage

- **localStorage**: Primary storage for immediate access
- **GitHub Sync**: Optional sync to repository for cross-device persistence

### GitHub Sync

If GitHub API token is configured in the portal:
- Clients save to `data/clients.json`
- Suppliers save to `data/suppliers.json`
- Bids save to `data/bids.json`

## API Reference

### SecureEnergyClients

```javascript
// Create client
SecureEnergyClients.createClient({
    name: 'Company Name',
    companyName: 'Company Name',
    iso: 'PJM',
    salesRepId: 'user-123',
    salesRepName: 'John Smith'
});

// Search clients
SecureEnergyClients.searchClients('query');

// Get client
SecureEnergyClients.getClient('CID-20260129-A3B7F');

// Link LMP analysis
SecureEnergyClients.linkLMPAnalysis(clientId, analysisId);
```

### SecureEnergySuppliers

```javascript
// Get all active suppliers
SecureEnergySuppliers.getActiveSuppliers();

// Get suppliers by ISO
SecureEnergySuppliers.getSuppliersByISO('PJM');

// Create supplier
SecureEnergySuppliers.createSupplier({
    name: 'Supplier Name',
    products: [{ name: 'Fixed', code: 'FIXED', swingType: 'Unlimited' }],
    termOptions: [12, 24, 36, 48],
    isos: ['PJM', 'ISONE']
});
```

### SecureEnergyBids

```javascript
// Create bid
SecureEnergyBids.createBid({
    clientId: 'CID-...',
    clientName: 'Company',
    commodityType: 'electric',
    iso: 'PJM'
});

// Add quote
SecureEnergyBids.addSupplierQuote(bidId, {
    supplierName: 'Constellation',
    productName: 'Fixed',
    terms: [{ term: 12, price: 0.08765 }, { term: 24, price: 0.08234 }]
});

// Generate bid sheet data
SecureEnergyBids.prepareBidSheetData(bidId);
```

## Integration with LMP Widget

To link LMP analyses to clients:

```javascript
// In lmp-comparison-portal.html, after running analysis:
if (window.SecureEnergyClients && clientId) {
    SecureEnergyClients.linkLMPAnalysis(clientId, analysisId);
}
```

## Version History

- **v1.0.0** - Initial release with client, supplier, and bid management

# Secure Energy - Sales Resources Portal

A comprehensive analytics and data management platform for energy market analysis, featuring LMP (Locational Marginal Pricing) data from multiple ISOs.

## Repository Structure

```
SESSalesResources/
├── index.html                 # Main portal dashboard
├── scripts/
│   ├── shared-data-store.js   # Central data management library (v2.0)
│   ├── main.js                # Portal functionality
│   └── widgets.js             # Widget utilities
├── styles/
│   └── main.css               # Global styles
├── widgets/
│   ├── arcadia-lmp-fetcher.html    # API data fetcher
│   ├── lmp-comparison-portal.html  # Analysis & modeling tool
│   ├── lmp-data-manager.html       # Data admin dashboard
│   └── utility-data.html           # Utility information
├── data/
│   └── lmp_data_combined.csv       # Sample LMP data (ISONE + PJM)
└── documents/
    ├── README.md                    # This file
    └── quickstart.md               # Quick setup guide
```

## Quick Start

1. **Clone the repository** and open `index.html` in a browser
2. **Load data**: The Data Manager widget will auto-load sample data, or drag-drop your own CSV
3. **Analyze**: Use the LMP Comparison Portal to model energy costs
4. **Fetch live data**: Configure the Arcadia LMP Fetcher with API credentials

## Components

### Main Dashboard (index.html)
The central hub that embeds all widgets via iframes. Features:
- User authentication
- Widget grid layout with expand/pop-out functionality
- Real-time data status indicators
- Cross-widget communication

### Shared Data Store (scripts/shared-data-store.js)
The backbone of the system - a JavaScript library that provides:
- Centralized data storage via localStorage
- CSV import/export capabilities
- Database-like query API
- Cross-widget synchronization via postMessage
- Subscriber pattern for real-time updates

### LMP Data Manager (widgets/lmp-data-manager.html)
Administrative interface for bulk data operations:
- Drag-and-drop CSV upload
- Real-time statistics dashboard
- ISO-by-ISO data summary
- Export and clear functionality

### LMP Comparison Portal (widgets/lmp-comparison-portal.html)
Comprehensive analysis tool for energy cost modeling:
- ISO/Zone selection with auto-populated data
- Contract term configuration
- Index vs Fixed price comparison
- Interactive charts and reports
- Excel/PowerPoint export

### Arcadia LMP Fetcher (widgets/arcadia-lmp-fetcher.html)
API integration for live data:
- Arcadia API connectivity
- Multi-ISO, multi-zone fetching
- Direct integration with shared data store

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    localStorage                                  │
│               (secureEnergy_LMP_Data)                           │
└────────────┬────────────────────────────────────────────────────┘
             │
    ┌────────┼────────┬───────────────┐
    │        │        │               │
    ▼        ▼        ▼               ▼
┌────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐
│  Data  │ │Arcadia  │ │Comparison│ │   Main     │
│Manager │ │ Fetcher │ │  Portal  │ │ Dashboard  │
└────────┘ └─────────┘ └──────────┘ └────────────┘
    │           │            │             │
    └───────────┴────────────┴─────────────┘
                      │
              ┌───────┴───────┐
              │  postMessage  │
              │   broadcast   │
              └───────────────┘
```

## API Reference

### SecureEnergyData (shared-data-store.js)

```javascript
// Initialize
SecureEnergyData.init();

// Load CSV data
SecureEnergyData.loadFromCSV(csvText, 'source-name');

// Get data for specific ISO
const pjmData = SecureEnergyData.getData('PJM');

// Get all data
const allData = SecureEnergyData.getAllData();

// Query with filters
const results = SecureEnergyData.query({
    iso: 'ISONE',
    zone: '4001_Maine',
    year: '2024',
    month: '01',
    startDate: '2024-01-01',
    endDate: '2024-12-31'
});

// Get available zones for an ISO
const zones = SecureEnergyData.getZones('PJM');

// Get available years for an ISO
const years = SecureEnergyData.getYears('ISONE');

// Get LMP value
const lmp = SecureEnergyData.getLMP('ISONE', '4001_Maine', '2024', '06');

// Get statistics
const stats = SecureEnergyData.getStats();
// Returns: { totalRecords, isoCount, dateRange, byISO: {...} }

// Subscribe to updates
const unsubscribe = SecureEnergyData.subscribe((data, meta) => {
    console.log('Data updated!', meta);
});

// Export to CSV
const csvString = SecureEnergyData.exportToCSV();

// Download as file
SecureEnergyData.downloadCSV('my_export.csv');
```

### Data Format

**CSV Format:**
```csv
ISO,Year,Month,Zone,Zone_Name,Avg_DA_LMP
ISONE,2024,1,4001_Maine,ME,68.31
PJM,2024,1,PECO,PECO,66.77
```

**Internal Record Format:**
```javascript
{
    month: "01",           // 2-digit month
    year: "2024",          // 4-digit year
    zone: "4001_Maine",    // Zone identifier
    zone_name: "ME",       // Display name
    avg_da_lmp: 68.31      // Average Day-Ahead LMP ($/MWh)
}
```

## Supported ISOs

| ISO | Name | Coverage |
|-----|------|----------|
| ISONE | ISO New England | CT, ME, MA, NH, RI, VT |
| PJM | PJM Interconnection | DE, IL, IN, KY, MD, MI, NJ, NC, OH, PA, TN, VA, WV, DC |
| ERCOT | Electric Reliability Council of Texas | TX |
| MISO | Midcontinent ISO | AR, IL, IN, IA, KY, LA, MI, MN, MS, MO, MT, ND, SD, WI |
| NYISO | New York ISO | NY |
| CAISO | California ISO | CA |
| SPP | Southwest Power Pool | AR, KS, LA, MO, NE, NM, OK, TX |

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Technical Notes

- Data is stored in browser localStorage (~5MB limit per domain)
- Widgets communicate via postMessage API when embedded in iframes
- All widgets can also run standalone by opening their HTML files directly
- For production deployment, consider implementing a backend database

## Version History

- **v2.0** (January 2025) - Added shared data store, data manager, cross-widget sync
- **v1.0** (2024) - Initial release with comparison portal and Arcadia fetcher

## Support

For questions or issues, contact the Secure Energy development team.

# Quick Start Guide

Get up and running with the Secure Energy Sales Resources Portal in 5 minutes.

## Step 1: Open the Portal

Open `index.html` in your web browser (Chrome, Firefox, Safari, or Edge recommended).

## Step 2: Login

Use any email/password combination to access the dashboard. For demo purposes, authentication is simplified.

## Step 3: Load Your Data

### Option A: Auto-Load Sample Data
The LMP Data Manager widget will attempt to auto-load the sample data from `data/lmp_data_combined.csv`. If successful, you'll see the statistics populate.

### Option B: Manual Upload
1. Find the **LMP Data Manager** widget in the dashboard
2. Click **"Load Pre-configured Data"** button, or
3. Drag and drop your own CSV file onto the upload zone

### CSV Format Required:
```
ISO,Year,Month,Zone,Zone_Name,Avg_DA_LMP
ISONE,2024,1,4001_Maine,ME,68.31
```

## Step 4: Use the Comparison Portal

1. Locate the **LMP Comparison Portal** widget (full-width at bottom)
2. Select your **ISO** from the dropdown
3. Select your **Zone** (zones populate automatically based on loaded data)
4. Set your **Start Date** and **Term Length**
5. Configure pricing parameters (Fixed Price, Capacity, Transmission, etc.)
6. Click **Calculate** to see results

## Step 5: Fetch Live Data (Optional)

1. Find the **Arcadia LMP Data Fetcher** widget
2. Enter your Arcadia API credentials
3. Select ISO and zones to fetch
4. Click **Fetch Data**
5. Click **Send to Portal** to add data to the shared store

## Widget Controls

Each widget has controls in its header:
- **⤢ Expand**: Make the widget full-screen within the portal
- **↗ Pop Out**: Open the widget in a new browser window

## Keyboard Shortcuts

- `Esc` - Close expanded widget
- `Ctrl+K` / `Cmd+K` - Focus search

## Data Persistence

All data is stored in your browser's localStorage under the key `secureEnergy_LMP_Data`. Data persists across sessions until you:
- Clear browser data
- Click "Clear All Data" in the Data Manager
- Switch to a different browser

## Troubleshooting

**No data showing in Comparison Portal?**
- Ensure data is loaded via the Data Manager first
- Check the Data Manager statistics panel for record count
- Try clicking "Refresh from Storage" in the Data Manager

**Widget not loading?**
- Check that all files are in the correct folder structure
- Ensure widgets are in `/widgets/` subfolder
- Ensure scripts are in `/scripts/` subfolder

**Data not syncing between widgets?**
- Refresh the page to re-initialize the shared data store
- Pop out the widget and reload it

## File Locations

| What | Where |
|------|-------|
| Main dashboard | `index.html` |
| LMP Comparison | `widgets/lmp-comparison-portal.html` |
| Arcadia Fetcher | `widgets/arcadia-lmp-fetcher.html` |
| Data Manager | `widgets/lmp-data-manager.html` |
| Data Store | `scripts/shared-data-store.js` |
| Sample Data | `data/lmp_data_combined.csv` |

## Next Steps

- Review the full [README.md](README.md) for API documentation
- Customize the portal styling in `styles/main.css`
- Add more ISOs to your dataset
- Configure the Arcadia fetcher for automated data updates

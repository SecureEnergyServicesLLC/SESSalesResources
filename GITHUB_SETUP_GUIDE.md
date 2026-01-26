# SESSalesResources GitHub Setup & Workflow Guide

## Overview

This guide walks you through:
1. Setting up your local repository with GitHub Desktop
2. Deploying the portal via GitHub Pages
3. Updating and enhancing the portal going forward

---

## Part 1: Initial GitHub Setup

### Prerequisites
- GitHub Desktop installed on your Mac
- A GitHub account
- Your existing `SESSalesResources` repository on GitHub

### Step 1: Clone or Connect Your Repository

**If you already have the repo locally:**
1. Open **GitHub Desktop**
2. Go to **File → Add Local Repository**
3. Navigate to your `SESSalesResources` folder on your Mac
4. Click **Add Repository**

**If you need to clone from GitHub:**
1. Open **GitHub Desktop**
2. Go to **File → Clone Repository**
3. Select `SESSalesResources` from your repositories list
4. Choose where to save it on your Mac (e.g., `~/Documents/GitHub/SESSalesResources`)
5. Click **Clone**

### Step 2: Add the New Data Files

1. Extract the `SESSalesResources_data_update.zip` file
2. Copy these folders/files into your local repository:
   ```
   SESSalesResources/
   ├── data/                          ← NEW FOLDER (copy entire folder)
   │   └── lmp/
   │       ├── data-index.json
   │       ├── isone/
   │       │   └── [2016-2025].json
   │       └── pjm/
   │           └── [2016-2025].json
   ├── scripts/
   │   └── shared-data-store.js       ← REPLACE existing file
   └── widgets/
       └── lmp-data-manager.html      ← REPLACE existing file
       └── lmp-comparison-portal.html ← REPLACE existing file
   ```

### Step 3: Commit and Push

1. Open **GitHub Desktop**
2. You'll see all changed files listed on the left
3. Review the changes (green = added, yellow = modified)
4. At the bottom left, enter a commit message:
   ```
   Add persistent LMP data storage and updated portals
   ```
5. Click **Commit to main**
6. Click **Push origin** (top right)

### Step 4: Enable GitHub Pages

1. Go to your repository on GitHub.com: `https://github.com/[username]/SESSalesResources`
2. Click **Settings** (tab at top)
3. Scroll down to **Pages** (left sidebar)
4. Under "Source", select:
   - Branch: `main`
   - Folder: `/ (root)`
5. Click **Save**
6. Wait 1-2 minutes, then your site is live at:
   ```
   https://[username].github.io/SESSalesResources/
   ```

---

## Part 2: Your Repository Structure

After setup, your repository should look like this:

```
SESSalesResources/
├── index.html                    # Main portal homepage
├── quickstart.md
├── README.md
├── GITHUB_SETUP_GUIDE.md         # This guide
│
├── data/                         # LMP DATA REPOSITORY
│   └── lmp/
│       ├── data-index.json       # Master index (lists all available data)
│       ├── isone/
│       │   ├── 2016.json
│       │   ├── 2017.json
│       │   └── ... (one file per year)
│       └── pjm/
│           ├── 2016.json
│           └── ...
│
├── scripts/
│   ├── ai-search/                # Claude AI search integration
│   ├── main.js
│   ├── shared-data-store.js      # LMP data loading module
│   └── widgets.js
│
└── widgets/
    ├── acadia-lmp-fetcher/       # API tool for updating data
    ├── lmp-comparison-portal.html # Client LMP analysis tool
    └── lmp-data-manager.html      # Data management interface
```

---

## Part 3: Day-to-Day Workflow

### Making Changes to the Portal

**Step 1: Edit files locally**
- Use any text editor (VS Code, Sublime, TextEdit, etc.)
- Files are in your local `SESSalesResources` folder

**Step 2: Test locally (optional but recommended)**
```bash
# Open Terminal, navigate to your repo
cd ~/Documents/GitHub/SESSalesResources

# Start a local server
python3 -m http.server 8000

# Open browser to http://localhost:8000
```

**Step 3: Commit and push via GitHub Desktop**
1. Open GitHub Desktop
2. Changed files appear automatically
3. Write a descriptive commit message
4. Click **Commit to main**
5. Click **Push origin**

**Step 4: Verify on live site**
- Changes appear on GitHub Pages within 1-2 minutes
- Hard refresh browser (Cmd+Shift+R) to see updates

---

## Part 4: Adding New LMP Data

### Method 1: Using the Data Manager UI

1. Go to your portal: `https://[username].github.io/SESSalesResources/widgets/lmp-data-manager.html`
2. Click the **Add Data** tab
3. Upload a CSV file with columns: `ISO, Year, Month, Zone, Zone_Name, Avg_DA_LMP`
4. Click **Generate JSON Files for GitHub**
5. JSON files download to your Mac
6. Move them to the appropriate folder:
   - ISONE files → `data/lmp/isone/`
   - PJM files → `data/lmp/pjm/`
7. Update `data/lmp/data-index.json` if adding new years
8. Commit and push via GitHub Desktop

### Method 2: Manual JSON Creation

1. Format your data as JSON:
```json
{
  "iso": "ISONE",
  "year": 2026,
  "recordCount": 108,
  "data": [
    {
      "ISO": "ISONE",
      "Year": 2026,
      "Month": 1,
      "Zone": "4004_Connecticut",
      "Zone_Name": "CT",
      "Avg_DA_LMP": 45.67
    }
  ]
}
```

2. Save as `data/lmp/isone/2026.json`

3. Update `data/lmp/data-index.json`:
```json
{
  "lastUpdated": "2026-01-25T12:00:00",
  "isos": {
    "isone": {
      "name": "ISONE",
      "years": [2016, 2017, ..., 2025, 2026],  // Add new year
      "zones": [...],
      "totalRecords": 1179  // Update count
    }
  }
}
```

4. Commit and push

---

## Part 5: Common Tasks

### Update the Main Portal (index.html)
1. Open `index.html` in your editor
2. Make changes
3. Test locally
4. Commit and push

### Update a Widget
1. Open the widget file in `widgets/` folder
2. Make changes
3. Test locally
4. Commit and push

### Update the Data Store Logic
1. Open `scripts/shared-data-store.js`
2. Make changes (add new methods, fix bugs, etc.)
3. Test locally
4. Commit and push

### Add a New Widget
1. Create new HTML file in `widgets/` folder
2. Include the shared data store:
   ```html
   <script src="../scripts/shared-data-store.js"></script>
   <script>
     document.addEventListener('DOMContentLoaded', async () => {
       await LMPDataStore.init();
       // Your code here
     });
   </script>
   ```
3. Add link to new widget in `index.html`
4. Commit and push

---

## Part 6: Troubleshooting

### "Data not loading" on GitHub Pages
- Check browser console (Cmd+Option+J) for errors
- Verify `data-index.json` exists and is valid JSON
- Ensure file paths are correct (case-sensitive!)
- Wait 2 minutes after pushing for GitHub Pages to update

### "CORS error" when testing locally
- You must use a local server, not `file://` URLs
- Run: `python3 -m http.server 8000`

### GitHub Desktop shows conflicts
1. Click **Fetch origin** first
2. If conflicts exist, click **Pull origin**
3. Resolve conflicts in your editor
4. Commit the resolution
5. Push

### Changes not appearing on live site
1. Hard refresh: Cmd+Shift+R
2. Check GitHub Pages build status in repo Settings → Pages
3. Verify push completed in GitHub Desktop

---

## Part 7: Using the LMPDataStore API

The `shared-data-store.js` provides these methods for your widgets:

```javascript
// Initialize (required first)
await LMPDataStore.init();

// Get available ISOs
const isos = LMPDataStore.getISOs();  // ['isone', 'pjm']

// Get years for an ISO
const years = LMPDataStore.getYears('isone');  // [2016, 2017, ...]

// Get zones for an ISO
const zones = LMPDataStore.getZones('pjm');  // [{Zone, Zone_Name}, ...]

// Load specific year
const data = await LMPDataStore.loadYear('isone', 2024);

// Load all data for an ISO
const allData = await LMPDataStore.loadISO('pjm');

// Query with filters
const filtered = await LMPDataStore.query({
  iso: 'isone',
  years: [2023, 2024],
  zones: ['4004_Connecticut'],
  months: [1, 2, 3]  // Q1 only
});

// Get zone statistics
const stats = await LMPDataStore.getZoneStats('isone', '4004_Connecticut');

// Compare two zones
const comparison = await LMPDataStore.compareZones('pjm', 'PECO', 'PPL', [2024, 2025]);
```

---

## Quick Reference

| Task | Action |
|------|--------|
| View changes | Open GitHub Desktop |
| Save changes | Commit → Push origin |
| Get latest | Fetch origin → Pull origin |
| Test locally | `python3 -m http.server 8000` |
| View live site | `https://[username].github.io/SESSalesResources/` |
| Add LMP data | Upload CSV in Data Manager → Generate JSON → Copy to `data/lmp/` → Commit |

---

## Support

If you run into issues:
1. Check the browser console for errors
2. Verify JSON files are valid (use jsonlint.com)
3. Ensure GitHub Pages is enabled and building successfully
4. Review recent commits for any breaking changes

# Secure Energy Sales Resources Portal

A comprehensive energy analytics dashboard with user authentication, LMP data management, and activity logging.

## Features

- **User Authentication**: Login system with role-based access control
- **User Administration**: Admin panel to create, edit, and manage users
- **Widget Permissions**: Control which widgets each user can see
- **Activity Logging**: Track all user actions and analyses
- **LMP Data Management**: Load, manage, and analyze LMP data
- **AI Search**: Search users, activities, and navigate widgets
- **GitHub Persistence**: Export data as JSON for GitHub hosting

## File Structure

```
SESSalesResources/
├── index.html                    # Main portal entry point
├── data/
│   ├── users.json               # User accounts database
│   ├── activity-log.json        # Activity tracking log
│   └── lmp-database.json        # LMP data (loaded once, shared by all)
├── scripts/
│   ├── main.js                  # Portal controller & UI
│   ├── shared-data-store.js     # Data stores (Users, LMP, Activity)
│   └── widgets.js               # Widget communication system
├── styles/
│   └── main.css                 # All portal styling
├── widgets/
│   ├── lmp-comparison-portal.html
│   ├── lmp-data-manager.html
│   └── arcadia-lmp-fetcher.html
└── documents/                   # Document storage
```

## Setup Instructions

### 1. Initial Setup

1. Clone or download the repository
2. Open `index.html` in a browser (use a local server for best results)
3. Login with default admin credentials:
   - Email: `admin@sesenergy.org`
   - Password: `admin123`

### 2. Create Users

1. Go to User Administration widget
2. Fill in user details (First Name, Last Name, Email, Password)
3. Select role (Admin or Standard User)
4. Configure widget permissions
5. Click "Create User Account"

### 3. Load LMP Data

1. Use the LMP Data Manager widget to upload CSV data
2. Or fetch data via the Arcadia LMP Fetcher
3. Data will be available to all authenticated users

### 4. Persist Data to GitHub

Since GitHub Pages is static hosting, user data is stored in localStorage by default. To share data across all users:

1. Go to User Administration → Export Data tab
2. Download JSON files:
   - `users.json` - User accounts
   - `activity-log.json` - Activity records
   - `lmp-database.json` - LMP data
3. Commit these files to your `data/` folder in GitHub
4. Push changes to your repository

When users load the portal, it will:
1. First try to load from GitHub JSON files
2. Fall back to localStorage if GitHub fails
3. Merge data to keep everything in sync

## Widget Permissions

| Widget | Admin Default | User Default |
|--------|---------------|--------------|
| LMP Comparison Portal | ✅ Visible | ✅ Visible |
| LMP Data Manager | ✅ Visible | ❌ Hidden |
| Arcadia LMP Fetcher | ✅ Visible | ❌ Hidden |
| User Administration | ✅ Visible | ❌ Hidden |

## Data Flow

```
                    ┌─────────────────┐
                    │  GitHub JSON    │
                    │  (Persistent)   │
                    └────────┬────────┘
                             │
                             ▼
┌─────────────┐    ┌─────────────────┐    ┌─────────────┐
│ Data Manager├───►│ SharedDataStore ├───►│ Comparison  │
│   Widget    │    │  (localStorage) │    │   Portal    │
└─────────────┘    └─────────────────┘    └─────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Activity Log   │
                    │   (Tracking)    │
                    └─────────────────┘
```

## Deploying to GitHub Pages

1. Push all files to your GitHub repository
2. Go to Settings → Pages
3. Select "main" branch and "/ (root)" folder
4. Click Save
5. Your portal will be live at: `https://[username].github.io/SESSalesResources/`

## Important Notes

### Security Considerations

- Passwords are stored in plain text for simplicity. In production, use proper hashing.
- The default admin password should be changed after first login.
- GitHub Pages is public - do not store sensitive data.

### Browser Support

- Modern browsers (Chrome, Firefox, Edge, Safari)
- localStorage must be enabled
- JavaScript required

### Updating Shared Data

When you make changes that should be shared with all users:

1. Export the relevant JSON file from the admin panel
2. Replace the file in your `data/` folder
3. Commit and push to GitHub
4. Changes will be available on next page load

## Troubleshooting

### Users not loading from GitHub
- Check that `data/users.json` exists and is valid JSON
- Ensure CORS is not blocking the request
- Check browser console for errors

### Widget not showing
- Verify user has permission for the widget
- Check that the widget HTML file exists
- Look for JavaScript errors in console

### Data not persisting
- localStorage may be full or disabled
- Export and re-import data as JSON
- Clear browser cache and reload

## Support

For issues or questions, create an issue in the GitHub repository.

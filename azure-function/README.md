# Azure Function: SecureDataAPI

**Backup of the Azure Function deployed to `ses-data-api` on Azure.**

This is the API gateway that sits between the portal/widgets and Azure Blob Storage. It handles authentication, role-based permissions, and CRUD operations on JSON data files.

---

## File Structure

```
azure-function/
├── README.md                    ← This file
├── host.json                    ← Azure Functions host configuration
├── package.json                 ← Node.js dependencies
└── SecureDataAPI/
    ├── index.js                 ← Main function code (permissions, CRUD logic)
    └── function.json            ← HTTP trigger configuration
```

---

## Deployment

### Prerequisites
- Azure CLI installed (`az` command available)
- OR use Azure Cloud Shell (terminal icon in Azure Portal top bar)

### Steps

```bash
# 1. Navigate to this folder
cd azure-function

# 2. Install dependencies
npm install

# 3. Zip everything (including node_modules)
zip -r deploy.zip .

# 4. Deploy to Azure
az functionapp deployment source config-zip \
  --name ses-data-api \
  --resource-group ses-portal-resources \
  --src deploy.zip
```

Deployment takes about 30-60 seconds. You should see `"Deployment was successful."` when complete.

---

## API Roles & Keys

Keys follow the pattern `ses-{role}-{random}`. The role is parsed from the key automatically.

| Role | Purpose | Access |
|------|---------|--------|
| `admin` | Portal admin users | Read/write all files |
| `ae` | Account executives | Read/write client-facing files |
| `widget` | Portal widgets | Read/write widget-specific files |
| `workflow` | GitHub Actions automation | Read/write lmp-database.json only |
| `readonly` | Public/fallback access | Read lmp-database.json only |

### Managing Keys

Keys are stored in the Function App's environment variables:
1. Azure Portal → `ses-data-api` → **Environment variables**
2. Edit `VALID_API_KEYS` (comma-separated list)
3. Save and restart

---

## API Endpoints

Base URL: `https://ses-data-api-gpaqghfbehhrb6c2.eastus-01.azurewebsites.net/api`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/data/{filename}` | Read entire file |
| `GET` | `/data/{filename}/{id}` | Read specific record |
| `POST` | `/data/{filename}` | Create record or replace file |
| `PUT` | `/data/{filename}` | Replace entire file |
| `PUT` | `/data/{filename}/{id}` | Update specific record |
| `DELETE` | `/data/{filename}/{id}` | Delete specific record |
| `DELETE` | `/data/{filename}` | Delete entire file |

### Headers Required

```
X-API-Key: ses-{role}-{key}
Content-Type: application/json
```

---

## Managed Files

| File | Description |
|------|-------------|
| `clients.json` | Client records |
| `users.json` | Portal user accounts |
| `contracts.json` | Contract data |
| `lmp-database.json` | LMP pricing data (auto-updated monthly) |
| `accounts.json` | Account information |
| `energy-profiles.json` | Energy usage profiles |
| `activity-log.json` | User activity audit trail |
| `usage-profiles.json` | Usage profile data |
| `tickets.json` | Support/feedback tickets |
| `widget-preferences.json` | Per-user widget settings |

### Adding a New File

1. Edit `FILE_PERMISSIONS` in `SecureDataAPI/index.js`
2. Add the filename to the appropriate roles' `read`/`write`/`delete` arrays
3. Redeploy (see Deployment section above)

---

## Environment Variables (Azure)

| Variable | Description |
|----------|-------------|
| `AZURE_STORAGE_CONNECTION_STRING` | Connection string for `sesportalstorage` |
| `VALID_API_KEYS` | Comma-separated list of valid API keys |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | API key not in VALID_API_KEYS | Add key to Environment variables, restart |
| 403 Forbidden | Key's role lacks permission for file | Add file to role's permissions in index.js, redeploy |
| 404 Not Found | File doesn't exist in blob storage yet | Will be created on first write |
| 500 Server Error | Storage connection issue | Check AZURE_STORAGE_CONNECTION_STRING |

---

## Last Updated

**2026-02-05** — Added `workflow` role, added `lmp-database.json` to admin write, added full file replacement via PUT without record ID.

/**
 * update-lmp-database-azure.js
 * Merges newly fetched LMP data and saves to Azure Blob Storage
 * Uses the SES Data API gateway
 * 
 * Reads from: ../temp/fetched-lmp-data.json (created by fetch-lmp-data.js)
 * Saves to: Azure API -> lmp-database.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Azure API Configuration
const AZURE_API_ENDPOINT = process.env.AZURE_API_ENDPOINT || 'https://ses-data-api-gpaqghfbehhrb6c2.eastus-01.azurewebsites.net/api/data';
const AZURE_API_KEY = process.env.AZURE_API_KEY;
const LMP_FILE = 'lmp-database.json';

// Temp file location (matches fetch-lmp-data.js output)
const TEMP_DATA_PATH = path.join(__dirname, '..', 'temp', 'fetched-lmp-data.json');

// Make HTTPS request
function apiRequest(method, file, data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${AZURE_API_ENDPOINT}/${file}`);
        
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: method,
            headers: {
                'x-api-key': AZURE_API_KEY,
                'Accept': 'application/json'
            }
        };
        
        if (data) {
            options.headers['Content-Type'] = 'application/json';
        }
        
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(body ? JSON.parse(body) : {});
                    } catch (e) {
                        resolve(body);
                    }
                } else if (res.statusCode === 404) {
                    resolve(null); // File doesn't exist yet
                } else {
                    reject(new Error(`API returned ${res.statusCode}: ${body}`));
                }
            });
        });
        
        req.on('error', reject);
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// Load temp data from fetch script
function loadTempData() {
    console.log(`Looking for temp file at: ${TEMP_DATA_PATH}`);
    
    if (!fs.existsSync(TEMP_DATA_PATH)) {
        console.error('ERROR: fetched-lmp-data.json not found at expected path');
        console.error(`Expected: ${TEMP_DATA_PATH}`);
        
        // Try alternate location (same directory)
        const altPath = path.join(__dirname, 'temp-lmp-data.json');
        if (fs.existsSync(altPath)) {
            console.log(`Found at alternate path: ${altPath}`);
            return JSON.parse(fs.readFileSync(altPath, 'utf8'));
        }
        
        console.error('Make sure fetch-lmp-data.js ran successfully first');
        process.exit(1);
    }
    
    return JSON.parse(fs.readFileSync(TEMP_DATA_PATH, 'utf8'));
}

// Generate unique key for a record
function recordKey(record) {
    // Handle both formats: zone_id or zoneId
    const zoneId = record.zone_id || record.zoneId || record.zone;
    return `${record.iso}_${zoneId}_${record.year}_${record.month}`;
}

// Normalize record to consistent format
function normalizeRecord(record) {
    return {
        iso: record.iso,
        zone: record.zone,
        zone_id: record.zoneId || record.zone_id || record.zone,
        year: record.year.toString(),
        month: record.month.toString().padStart(2, '0'),
        avg_da_lmp: record.lmp || record.avg_da_lmp || 0,
        min_price: record.min_price || record.lmp || 0,
        max_price: record.max_price || record.lmp || 0,
        record_count: record.recordCount || record.record_count || 0
    };
}

// Merge new data into database
function mergeData(database, newRecords) {
    let added = 0;
    let updated = 0;
    let unchanged = 0;

    for (const rawRecord of newRecords) {
        const record = normalizeRecord(rawRecord);
        const iso = record.iso;
        const key = recordKey(record);

        // Initialize ISO array if needed
        if (!database.data[iso]) {
            database.data[iso] = [];
        }

        // Find existing record
        const existingIndex = database.data[iso].findIndex(r => recordKey(r) === key);

        if (existingIndex === -1) {
            // New record
            database.data[iso].push(record);
            added++;
        } else {
            // Check if data changed
            const existing = database.data[iso][existingIndex];
            const existingLmp = existing.avg_da_lmp || existing.lmp || 0;
            const newLmp = record.avg_da_lmp || 0;
            
            if (Math.abs(existingLmp - newLmp) > 0.0001) {
                database.data[iso][existingIndex] = record;
                updated++;
            } else {
                unchanged++;
            }
        }
    }

    // Sort each ISO's data by zone, year, month
    for (const iso of Object.keys(database.data)) {
        database.data[iso].sort((a, b) => {
            const zoneA = a.zone || a.zone_id || '';
            const zoneB = b.zone || b.zone_id || '';
            return zoneA.localeCompare(zoneB) ||
                   (a.year || '').localeCompare(b.year || '') ||
                   (a.month || '').localeCompare(b.month || '');
        });
    }

    return { added, updated, unchanged };
}

// Main execution
async function main() {
    console.log('='.repeat(60));
    console.log('LMP Database Update (Azure)');
    console.log('='.repeat(60));
    
    // Validate API key
    if (!AZURE_API_KEY) {
        console.error('ERROR: AZURE_API_KEY environment variable not set');
        console.error('Add it as a GitHub Secret: AZURE_API_KEY');
        process.exit(1);
    }
    
    console.log(`Azure Endpoint: ${AZURE_API_ENDPOINT}`);
    console.log(`Target File: ${LMP_FILE}`);

    // Load temp data from fetch script
    const tempData = loadTempData();
    console.log(`\nFetch info:`);
    console.log(`  Date: ${tempData.fetchedAt}`);
    console.log(`  Range: ${tempData.dateRange.start} to ${tempData.dateRange.end}`);
    console.log(`  Markets: ${tempData.markets.join(', ')}`);
    console.log(`  Records: ${tempData.recordCount || tempData.records.length}`);

    // Fetch existing database from Azure
    console.log(`\nFetching existing database from Azure...`);
    let database;
    
    try {
        database = await apiRequest('GET', LMP_FILE);
        
        if (!database || !database.data) {
            console.log('  No existing database found, creating new one...');
            database = {
                meta: {
                    lastUpdate: null,
                    source: 'arcadia-genability',
                    version: '2.0',
                    storage: 'azure'
                },
                data: {
                    ISONE: [],
                    PJM: [],
                    ERCOT: []
                }
            };
        } else {
            console.log('  Existing database loaded');
            let existingCount = 0;
            for (const iso of Object.keys(database.data)) {
                existingCount += database.data[iso]?.length || 0;
            }
            console.log(`  Existing records: ${existingCount}`);
        }
    } catch (err) {
        console.error(`  Error fetching from Azure: ${err.message}`);
        console.log('  Creating new database...');
        database = {
            meta: {
                lastUpdate: null,
                source: 'arcadia-genability',
                version: '2.0',
                storage: 'azure'
            },
            data: {
                ISONE: [],
                PJM: [],
                ERCOT: []
            }
        };
    }

    // Merge new data
    console.log(`\nMerging new data...`);
    const stats = mergeData(database, tempData.records);
    console.log(`  Added: ${stats.added}`);
    console.log(`  Updated: ${stats.updated}`);
    console.log(`  Unchanged: ${stats.unchanged}`);

    // Update metadata
    database.meta = database.meta || {};
    database.meta.lastUpdate = new Date().toISOString();
    database.meta.lastFetchRange = tempData.dateRange;
    database.meta.storage = 'azure';
    database.meta.version = '2.0';
    database.meta.source = 'arcadia-genability';

    // Count total records
    let totalRecords = 0;
    for (const iso of Object.keys(database.data)) {
        totalRecords += database.data[iso].length;
    }
    database.meta.totalRecords = totalRecords;

    // Save to Azure
    if (stats.added > 0 || stats.updated > 0) {
        console.log(`\nSaving to Azure...`);
        try {
            await apiRequest('PUT', LMP_FILE, database);
            console.log(`  ✅ Database saved: ${totalRecords} total records`);
        } catch (err) {
            console.error(`  ❌ Error saving to Azure: ${err.message}`);
            process.exit(1);
        }
    } else {
        console.log(`\nNo changes to save.`);
    }

    // Clean up temp file
    try {
        fs.unlinkSync(TEMP_DATA_PATH);
        console.log('Temp file cleaned up');
    } catch (e) {
        console.log('Note: Could not delete temp file');
    }

    console.log('='.repeat(60));
    console.log(stats.added > 0 || stats.updated > 0 ? '✅ Database updated successfully!' : 'No changes needed.');
}

main().catch(error => {
    console.error('FATAL ERROR:', error.message);
    process.exit(1);
});

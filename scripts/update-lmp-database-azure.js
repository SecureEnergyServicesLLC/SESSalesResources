/**
 * update-lmp-database-azure-v2.js
 * Merges newly fetched LMP data (HOURLY + MONTHLY) and saves to Azure Blob Storage
 * Uses the SES Data API gateway
 * 
 * Reads from: 
 *   ../temp/fetched-lmp-hourly.json (hourly data)
 *   ../temp/fetched-lmp-data.json (monthly summaries)
 * 
 * Saves to Azure API:
 *   lmp-database.json (combined: monthly summaries + hourly data)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Azure API Configuration
const AZURE_API_ENDPOINT = process.env.AZURE_API_ENDPOINT || 'https://ses-data-api-gpaqghfbehhrb6c2.eastus-01.azurewebsites.net/api/data';
const AZURE_API_KEY = process.env.AZURE_API_KEY;
const LMP_FILE = 'lmp-database.json';

// Temp file locations
const HOURLY_DATA_PATH = path.join(__dirname, '..', 'temp', 'fetched-lmp-hourly.json');
const MONTHLY_DATA_PATH = path.join(__dirname, '..', 'temp', 'fetched-lmp-data.json');

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

// Load temp data files
function loadTempData() {
    let hourlyData = null;
    let monthlyData = null;
    
    // Try to load hourly data
    if (fs.existsSync(HOURLY_DATA_PATH)) {
        console.log(`Loading hourly data from: ${HOURLY_DATA_PATH}`);
        hourlyData = JSON.parse(fs.readFileSync(HOURLY_DATA_PATH, 'utf8'));
        console.log(`  Hourly records: ${hourlyData.hourlyRecordCount?.toLocaleString() || 'unknown'}`);
    } else {
        console.log('No hourly data file found (optional)');
    }
    
    // Try to load monthly data
    if (fs.existsSync(MONTHLY_DATA_PATH)) {
        console.log(`Loading monthly data from: ${MONTHLY_DATA_PATH}`);
        monthlyData = JSON.parse(fs.readFileSync(MONTHLY_DATA_PATH, 'utf8'));
        console.log(`  Monthly records: ${monthlyData.recordCount?.toLocaleString() || monthlyData.records?.length || 'unknown'}`);
    } else {
        console.error('ERROR: Monthly data file not found');
        console.error(`Expected: ${MONTHLY_DATA_PATH}`);
        process.exit(1);
    }
    
    return { hourlyData, monthlyData };
}

// Generate unique key for a monthly record
function monthlyRecordKey(record) {
    const zoneId = record.zone_id || record.zoneId || record.zone;
    return `${record.iso}_${zoneId}_${record.year}_${record.month}`;
}

// Normalize monthly record to consistent format
function normalizeMonthlyRecord(record) {
    return {
        iso: record.iso,
        zone: record.zone,
        zone_id: record.zone_id || record.zoneId || record.zone,
        year: record.year.toString(),
        month: record.month.toString().padStart(2, '0'),
        avg_da_lmp: record.avg_da_lmp || record.lmp || 0,
        min_price: record.min_price || record.lmp || 0,
        max_price: record.max_price || record.lmp || 0,
        record_count: record.record_count || record.recordCount || 0
    };
}

// Merge new monthly data into database
function mergeMonthlyData(database, newRecords) {
    let added = 0;
    let updated = 0;
    let unchanged = 0;

    for (const rawRecord of newRecords) {
        const record = normalizeMonthlyRecord(rawRecord);
        const iso = record.iso;
        const key = monthlyRecordKey(record);

        // Initialize ISO array if needed
        if (!database.data[iso]) {
            database.data[iso] = [];
        }

        // Find existing record
        const existingIndex = database.data[iso].findIndex(r => monthlyRecordKey(r) === key);

        if (existingIndex === -1) {
            database.data[iso].push(record);
            added++;
        } else {
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

    // Sort each ISO's data
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

// Merge new hourly data into database
function mergeHourlyData(database, newHourlyData) {
    if (!newHourlyData || !newHourlyData.data) {
        return { added: 0, updated: 0 };
    }
    
    let addedMonths = 0;
    let updatedMonths = 0;
    let totalRecords = 0;
    
    // Ensure hourly structure exists
    if (!database.hourly) {
        database.hourly = {};
    }
    
    for (const [iso, monthData] of Object.entries(newHourlyData.data)) {
        if (!database.hourly[iso]) {
            database.hourly[iso] = {};
        }
        
        for (const [yearMonth, records] of Object.entries(monthData)) {
            const isNew = !database.hourly[iso][yearMonth];
            
            // Replace entire month's hourly data (newer fetch wins)
            database.hourly[iso][yearMonth] = records;
            totalRecords += records.length;
            
            if (isNew) {
                addedMonths++;
            } else {
                updatedMonths++;
            }
        }
    }
    
    return { addedMonths, updatedMonths, totalRecords };
}

// Calculate storage size estimates
function calculateStorageStats(database) {
    let monthlyCount = 0;
    let hourlyCount = 0;
    
    // Count monthly records
    for (const iso of Object.keys(database.data || {})) {
        monthlyCount += database.data[iso]?.length || 0;
    }
    
    // Count hourly records
    for (const iso of Object.keys(database.hourly || {})) {
        for (const yearMonth of Object.keys(database.hourly[iso] || {})) {
            hourlyCount += database.hourly[iso][yearMonth]?.length || 0;
        }
    }
    
    return { monthlyCount, hourlyCount };
}

// Main execution
async function main() {
    console.log('═'.repeat(60));
    console.log('LMP Database Update - HOURLY + MONTHLY (Azure)');
    console.log('═'.repeat(60));
    
    // Validate API key
    if (!AZURE_API_KEY) {
        console.error('ERROR: AZURE_API_KEY environment variable not set');
        process.exit(1);
    }
    
    console.log(`Azure Endpoint: ${AZURE_API_ENDPOINT}`);
    console.log(`Target File: ${LMP_FILE}`);

    // Load temp data files
    const { hourlyData, monthlyData } = loadTempData();
    
    console.log(`\nFetch info:`);
    console.log(`  Date: ${monthlyData.fetchedAt}`);
    console.log(`  Range: ${monthlyData.dateRange.start} to ${monthlyData.dateRange.end}`);
    console.log(`  Markets: ${monthlyData.markets.join(', ')}`);

    // Fetch existing database from Azure
    console.log(`\nFetching existing database from Azure...`);
    let database;
    
    try {
        database = await apiRequest('GET', LMP_FILE);
        
        if (!database || !database.data) {
            console.log('  No existing database found, creating new one...');
            database = {
                meta: {},
                data: {},
                hourly: {}
            };
        } else {
            console.log('  Existing database loaded');
            const stats = calculateStorageStats(database);
            console.log(`  Existing monthly records: ${stats.monthlyCount.toLocaleString()}`);
            console.log(`  Existing hourly records: ${stats.hourlyCount.toLocaleString()}`);
        }
    } catch (err) {
        console.error(`  Error fetching from Azure: ${err.message}`);
        console.log('  Creating new database...');
        database = {
            meta: {},
            data: {},
            hourly: {}
        };
    }

    // Merge monthly data
    console.log(`\nMerging monthly data...`);
    const monthlyStats = mergeMonthlyData(database, monthlyData.records);
    console.log(`  Added: ${monthlyStats.added}`);
    console.log(`  Updated: ${monthlyStats.updated}`);
    console.log(`  Unchanged: ${monthlyStats.unchanged}`);

    // Merge hourly data (if available)
    let hourlyStats = { addedMonths: 0, updatedMonths: 0, totalRecords: 0 };
    if (hourlyData) {
        console.log(`\nMerging hourly data...`);
        hourlyStats = mergeHourlyData(database, hourlyData);
        console.log(`  New months: ${hourlyStats.addedMonths}`);
        console.log(`  Updated months: ${hourlyStats.updatedMonths}`);
        console.log(`  Total hourly records: ${hourlyStats.totalRecords.toLocaleString()}`);
    }

    // Update metadata
    const finalStats = calculateStorageStats(database);
    database.meta = {
        lastUpdate: new Date().toISOString(),
        lastFetchRange: monthlyData.dateRange,
        storage: 'azure',
        version: '3.0',
        source: 'arcadia-genability',
        hasHourlyData: !!hourlyData,
        totalMonthlyRecords: finalStats.monthlyCount,
        totalHourlyRecords: finalStats.hourlyCount
    };

    // Determine if we need to save
    const hasChanges = monthlyStats.added > 0 || monthlyStats.updated > 0 || 
                       hourlyStats.addedMonths > 0 || hourlyStats.updatedMonths > 0;

    if (hasChanges) {
        console.log(`\nSaving to Azure...`);
        console.log(`  Total monthly records: ${finalStats.monthlyCount.toLocaleString()}`);
        console.log(`  Total hourly records: ${finalStats.hourlyCount.toLocaleString()}`);
        
        try {
            await apiRequest('PUT', LMP_FILE, database);
            console.log(`  ✅ Database saved successfully!`);
        } catch (err) {
            console.error(`  ❌ Error saving to Azure: ${err.message}`);
            process.exit(1);
        }
    } else {
        console.log(`\nNo changes to save.`);
    }

    // Clean up temp files
    try {
        if (fs.existsSync(MONTHLY_DATA_PATH)) {
            fs.unlinkSync(MONTHLY_DATA_PATH);
        }
        if (fs.existsSync(HOURLY_DATA_PATH)) {
            fs.unlinkSync(HOURLY_DATA_PATH);
        }
        console.log('Temp files cleaned up');
    } catch (e) {
        console.log('Note: Could not delete temp files');
    }

    console.log('═'.repeat(60));
    console.log(hasChanges ? '✅ Database updated successfully!' : 'No changes needed.');
}

main().catch(error => {
    console.error('FATAL ERROR:', error.message);
    process.exit(1);
});

/**
 * Arcadia LMP Data Fetcher - HOURLY VERSION
 * 
 * This script fetches Day-Ahead LMP data from the Arcadia/Genability Signal API
 * and stores BOTH hourly data AND monthly aggregates.
 * 
 * The hourly data enables more detailed analysis in the LMP Analytics widget.
 * 
 * Runs server-side via GitHub Actions to avoid CORS issues.
 * 
 * Environment Variables Required:
 *   ARCADIA_APP_ID  - Arcadia API App ID
 *   ARCADIA_APP_KEY - Arcadia API App Key
 *   START_DATE      - Start date (YYYY-MM-DD)
 *   END_DATE        - End date (YYYY-MM-DD)
 *   ISO_MARKETS     - Comma-separated ISOs or 'all'
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ISO Configuration - expanded to include all markets
const ISO_CONFIG = {
    ISONE: {
        name: 'ISO-NE',
        propertyKey: 'hourlyPricingDayAheadISONE',
        zones: [
            { value: '4000', label: 'ISO NE CA', zoneId: '4000_ISONE' },
            { value: '4001', label: 'Maine', zoneId: '4001_Maine' },
            { value: '4002', label: 'NH', zoneId: '4002_NH' },
            { value: '4003', label: 'Vermont', zoneId: '4003_Vermont' },
            { value: '4004', label: 'Connecticut', zoneId: '4004_Connecticut' },
            { value: '4005', label: 'Rhode Island', zoneId: '4005_Rhode_Island' },
            { value: '4006', label: 'SEMA', zoneId: '4006_SEMA' },
            { value: '4007', label: 'WCMA', zoneId: '4007_WCMA' },
            { value: '4008', label: 'NEMA', zoneId: '4008_NEMA' }
        ]
    },
    PJM: {
        name: 'PJM',
        propertyKey: 'hourlyPricingDayAheadPJM',
        zones: [
            { value: '51291', label: 'AECO', zoneId: 'AECO' },
            { value: '51292', label: 'BGE', zoneId: 'BGE' },
            { value: '51293', label: 'DPL', zoneId: 'DPL' },
            { value: '51294', label: 'JCPL', zoneId: 'JCPL' },
            { value: '51295', label: 'METED', zoneId: 'METED' },
            { value: '51296', label: 'PECO', zoneId: 'PECO' },
            { value: '51297', label: 'PENELEC', zoneId: 'PENELEC' },
            { value: '51298', label: 'PEPCO', zoneId: 'PEPCO' },
            { value: '51299', label: 'PPL', zoneId: 'PPL' },
            { value: '51300', label: 'PSEG', zoneId: 'PSEG' },
            // Extended PJM zones
            { value: '51301', label: 'AEP', zoneId: 'AEP' },
            { value: '51302', label: 'APS', zoneId: 'APS' },
            { value: '51303', label: 'ATSI', zoneId: 'ATSI' },
            { value: '51304', label: 'COMED', zoneId: 'COMED' },
            { value: '51305', label: 'DAY', zoneId: 'DAY' },
            { value: '51306', label: 'DEOK', zoneId: 'DEOK' },
            { value: '51307', label: 'DOM', zoneId: 'DOM' },
            { value: '51308', label: 'DUQ', zoneId: 'DUQ' },
            { value: '51309', label: 'EKPC', zoneId: 'EKPC' },
            { value: '51310', label: 'EXTERNAL', zoneId: 'EXTERNAL' },
            { value: '51311', label: 'RECO', zoneId: 'RECO' }
        ]
    },
    ERCOT: {
        name: 'ERCOT',
        propertyKey: 'hourlyPricingDayAheadERCOT',
        zones: [
            { value: 'LZ_AEN', label: 'AEN', zoneId: 'AEN' },
            { value: 'LZ_CPS', label: 'CPS', zoneId: 'CPS' },
            { value: 'LZ_HOUSTON', label: 'Houston', zoneId: 'HOUSTON' },
            { value: 'LZ_LCRA', label: 'LCRA', zoneId: 'LCRA' },
            { value: 'LZ_NORTH', label: 'North', zoneId: 'NORTH' },
            { value: 'LZ_RAYBN', label: 'RAYBN', zoneId: 'RAYBN' },
            { value: 'LZ_SOUTH', label: 'South', zoneId: 'SOUTH' },
            { value: 'LZ_WEST', label: 'West', zoneId: 'WEST' }
        ]
    },
    NYISO: {
        name: 'NYISO',
        propertyKey: 'hourlyPricingDayAheadNYISO',
        zones: [
            { value: '61753', label: 'CAPITL', zoneId: '61753' },
            { value: '61754', label: 'CENTRL', zoneId: '61754' },
            { value: '61757', label: 'DUNWOD', zoneId: '61757' },
            { value: '61758', label: 'GENESE', zoneId: '61758' },
            { value: '61760', label: 'HUD VL', zoneId: '61760' },
            { value: '61762', label: 'LONGIL', zoneId: '61762' }
        ]
    },
    MISO: {
        name: 'MISO',
        propertyKey: 'hourlyPricingDayAheadMISO',
        zones: [
            { value: 'ARKANSAS', label: 'Arkansas', zoneId: 'ARKANSAS' },
            { value: 'ILLINOIS', label: 'Illinois', zoneId: 'ILLINOIS' },
            { value: 'INDIANA', label: 'Indiana', zoneId: 'INDIANA' },
            { value: 'LOUISIANA', label: 'Louisiana', zoneId: 'LOUISIANA' },
            { value: 'MICHIGAN', label: 'Michigan', zoneId: 'MICHIGAN' },
            { value: 'MINN', label: 'Minnesota', zoneId: 'MINN' },
            { value: 'MS', label: 'Mississippi', zoneId: 'MS' },
            { value: 'TEXAS', label: 'Texas', zoneId: 'TEXAS' }
        ]
    }
};

// Get credentials from environment
const APP_ID = process.env.ARCADIA_APP_ID;
const APP_KEY = process.env.ARCADIA_APP_KEY;
const START_DATE = process.env.START_DATE;
const END_DATE = process.env.END_DATE;
const ISO_MARKETS = process.env.ISO_MARKETS || 'all';

if (!APP_ID || !APP_KEY) {
    console.error('❌ Missing ARCADIA_APP_ID or ARCADIA_APP_KEY environment variables');
    process.exit(1);
}

if (!START_DATE || !END_DATE) {
    console.error('❌ Missing START_DATE or END_DATE environment variables');
    process.exit(1);
}

const credentials = Buffer.from(`${APP_ID}:${APP_KEY}`).toString('base64');

/**
 * Make HTTPS request to Arcadia API
 */
function fetchFromAPI(url) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Accept': 'application/json'
            }
        };

        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${e.message}`));
                    }
                } else if (res.statusCode === 401) {
                    reject(new Error('Invalid API credentials'));
                } else {
                    reject(new Error(`API returned status ${res.statusCode}`));
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

/**
 * Fetch all HOURLY data for a specific zone with pagination
 * Returns raw hourly records instead of aggregating
 */
async function fetchZoneHourlyData(propertyKey, zoneId, zoneLabel, startDate, endDate) {
    const baseUrl = 'https://api.genability.com/rest/public/properties';
    const allRecords = [];
    let pageStart = 0;
    const pageCount = 1000;
    let hasMore = true;

    while (hasMore) {
        const params = new URLSearchParams({
            subKeyName: zoneId,
            fromDateTime: `${startDate}T00:00:00`,
            toDateTime: `${endDate}T23:59:59`,
            pageStart: pageStart.toString(),
            pageCount: pageCount.toString()
        });

        const url = `${baseUrl}/${propertyKey}/lookups?${params}`;
        
        try {
            const data = await fetchFromAPI(url);
            
            if (data.results && data.results.length > 0) {
                const records = data.results
                    .map(item => ({
                        datetime: item.fromDateTime || item.period,
                        price: parseFloat(item.dataValue || item.lmpTotal || 0),
                        zone: zoneLabel
                    }))
                    .filter(r => !isNaN(r.price) && r.datetime);

                allRecords.push(...records);
                hasMore = data.count && data.count > pageStart + pageCount;
                pageStart += pageCount;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error(`    ⚠️ Error fetching page ${pageStart}: ${error.message}`);
            hasMore = false;
        }
    }

    return allRecords;
}

/**
 * Calculate monthly averages from hourly data
 * This runs on the raw hourly data to create monthly summaries
 */
function calculateMonthlyFromHourly(hourlyData, iso, zoneId) {
    const monthlyMap = {};

    hourlyData.forEach(record => {
        const date = new Date(record.datetime);
        const year = date.getFullYear().toString();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const key = `${year}_${month}`;

        if (!monthlyMap[key]) {
            monthlyMap[key] = {
                iso: iso,
                zone: record.zone,
                zone_id: zoneId,
                year: year,
                month: month,
                prices: []
            };
        }
        monthlyMap[key].prices.push(record.price);
    });

    return Object.values(monthlyMap).map(m => ({
        iso: m.iso,
        zone: m.zone,
        zone_id: m.zone_id,
        year: m.year,
        month: m.month,
        avg_da_lmp: parseFloat((m.prices.reduce((a, b) => a + b, 0) / m.prices.length).toFixed(4)),
        min_price: parseFloat(Math.min(...m.prices).toFixed(4)),
        max_price: parseFloat(Math.max(...m.prices).toFixed(4)),
        record_count: m.prices.length
    }));
}

/**
 * Organize hourly data by year-month for efficient storage
 */
function organizeHourlyByMonth(hourlyData) {
    const organized = {};
    
    hourlyData.forEach(record => {
        const date = new Date(record.datetime);
        const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        
        if (!organized[yearMonth]) {
            organized[yearMonth] = [];
        }
        organized[yearMonth].push({
            dt: record.datetime,  // Shortened key name to save space
            p: record.price,      // Shortened key name
            z: record.zone        // Shortened key name
        });
    });
    
    return organized;
}

/**
 * Main execution
 */
async function main() {
    console.log('⚡ Arcadia LMP Data Fetcher - HOURLY VERSION');
    console.log('─'.repeat(60));
    console.log(`📅 Date Range: ${START_DATE} to ${END_DATE}`);
    console.log(`🏢 Markets: ${ISO_MARKETS}`);
    console.log('─'.repeat(60));

    // Determine which ISOs to fetch
    const isosToFetch = ISO_MARKETS === 'all' 
        ? Object.keys(ISO_CONFIG) 
        : ISO_MARKETS.split(',').map(s => s.trim().toUpperCase());

    // Data structures to hold results
    const hourlyByISO = {};   // { ISONE: { "2024-01": [...hourly...] } }
    const monthlyByISO = {};  // { ISONE: [...monthly summaries...] }
    
    let totalHourlyRecords = 0;
    let totalMonthlyRecords = 0;

    for (const isoKey of isosToFetch) {
        const config = ISO_CONFIG[isoKey];
        if (!config) {
            console.warn(`⚠️ Unknown ISO: ${isoKey}, skipping...`);
            continue;
        }

        console.log(`\n📊 Fetching ${config.name}...`);
        
        hourlyByISO[isoKey] = {};
        monthlyByISO[isoKey] = [];

        for (const zone of config.zones) {
            process.stdout.write(`  → ${zone.label}... `);
            
            try {
                // Fetch ALL hourly data for this zone
                const hourlyData = await fetchZoneHourlyData(
                    config.propertyKey, 
                    zone.value,
                    zone.zoneId,
                    START_DATE, 
                    END_DATE
                );

                if (hourlyData.length > 0) {
                    // Store hourly data organized by month
                    const organizedHourly = organizeHourlyByMonth(hourlyData);
                    
                    // Merge into ISO's hourly data
                    for (const [yearMonth, records] of Object.entries(organizedHourly)) {
                        if (!hourlyByISO[isoKey][yearMonth]) {
                            hourlyByISO[isoKey][yearMonth] = [];
                        }
                        hourlyByISO[isoKey][yearMonth].push(...records);
                    }
                    
                    // Calculate monthly summaries from hourly
                    const monthlyData = calculateMonthlyFromHourly(hourlyData, isoKey, zone.zoneId);
                    monthlyByISO[isoKey].push(...monthlyData);
                    
                    totalHourlyRecords += hourlyData.length;
                    totalMonthlyRecords += monthlyData.length;
                    
                    console.log(`✅ ${hourlyData.length} hourly → ${monthlyData.length} monthly`);
                } else {
                    console.log(`⚠️ No data`);
                }

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.log(`❌ ${error.message}`);
            }
        }
        
        // Sort monthly data for this ISO
        monthlyByISO[isoKey].sort((a, b) => {
            return a.zone.localeCompare(b.zone) || 
                   a.year.localeCompare(b.year) || 
                   a.month.localeCompare(b.month);
        });
    }

    // Ensure temp directory exists
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // Save HOURLY data to temp file
    const hourlyOutputPath = path.join(tempDir, 'fetched-lmp-hourly.json');
    fs.writeFileSync(hourlyOutputPath, JSON.stringify({
        fetchedAt: new Date().toISOString(),
        dateRange: { start: START_DATE, end: END_DATE },
        markets: isosToFetch,
        hourlyRecordCount: totalHourlyRecords,
        data: hourlyByISO
    }, null, 2));

    // Save MONTHLY summaries to temp file (for backward compatibility)
    const monthlyOutputPath = path.join(tempDir, 'fetched-lmp-data.json');
    
    // Flatten monthly data for legacy format
    const allMonthlyRecords = [];
    for (const [iso, records] of Object.entries(monthlyByISO)) {
        allMonthlyRecords.push(...records.map(r => ({
            ...r,
            lmp: r.avg_da_lmp,  // Legacy field name
            recordCount: r.record_count
        })));
    }
    
    fs.writeFileSync(monthlyOutputPath, JSON.stringify({
        fetchedAt: new Date().toISOString(),
        dateRange: { start: START_DATE, end: END_DATE },
        markets: isosToFetch,
        recordCount: totalMonthlyRecords,
        records: allMonthlyRecords
    }, null, 2));

    console.log('\n' + '─'.repeat(60));
    console.log(`✅ Fetched ${totalHourlyRecords.toLocaleString()} hourly records`);
    console.log(`✅ Aggregated to ${totalMonthlyRecords.toLocaleString()} monthly records`);
    console.log(`💾 Hourly saved to: ${hourlyOutputPath}`);
    console.log(`💾 Monthly saved to: ${monthlyOutputPath}`);
}

main().catch(error => {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
});

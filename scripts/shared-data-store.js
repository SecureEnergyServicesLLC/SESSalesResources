/**
 * Shared Data Store for SESSalesResources
 * 
 * This module provides persistent LMP data storage by loading from
 * JSON files stored in the GitHub repository. No more localStorage
 * dependency - data persists in the repo itself.
 * 
 * Usage:
 *   // Initialize the store
 *   await LMPDataStore.init();
 *   
 *   // Get available ISOs and years
 *   const index = LMPDataStore.getIndex();
 *   
 *   // Load data for specific ISO/year
 *   const data = await LMPDataStore.loadYear('isone', 2024);
 *   
 *   // Load all data for an ISO
 *   const allData = await LMPDataStore.loadISO('pjm');
 *   
 *   // Query data with filters
 *   const filtered = await LMPDataStore.query({
 *     iso: 'isone',
 *     years: [2023, 2024],
 *     zones: ['4004_Connecticut', '4005_Rhode_Island']
 *   });
 */

const LMPDataStore = (function() {
    // Determine base path - works for both local dev and GitHub Pages
    const getBasePath = () => {
        const path = window.location.pathname;
        // If we're in a subdirectory (like /widgets/), go up
        if (path.includes('/widgets/')) {
            return '../data/lmp';
        }
        return './data/lmp';
    };

    let basePath = null;
    let dataIndex = null;
    let cache = {}; // Cache loaded year files to avoid re-fetching

    /**
     * Initialize the data store by loading the index
     */
    async function init() {
        basePath = getBasePath();
        try {
            const response = await fetch(`${basePath}/data-index.json`);
            if (!response.ok) {
                throw new Error(`Failed to load data index: ${response.status}`);
            }
            dataIndex = await response.json();
            console.log('LMPDataStore initialized:', dataIndex);
            return dataIndex;
        } catch (error) {
            console.error('Failed to initialize LMPDataStore:', error);
            // Return empty index structure if file not found
            dataIndex = { lastUpdated: null, isos: {} };
            return dataIndex;
        }
    }

    /**
     * Get the data index (available ISOs, years, zones)
     */
    function getIndex() {
        return dataIndex;
    }

    /**
     * Get list of available ISOs
     */
    function getISOs() {
        if (!dataIndex) return [];
        return Object.keys(dataIndex.isos);
    }

    /**
     * Get available years for an ISO
     */
    function getYears(iso) {
        if (!dataIndex || !dataIndex.isos[iso.toLowerCase()]) return [];
        return dataIndex.isos[iso.toLowerCase()].years;
    }

    /**
     * Get available zones for an ISO
     */
    function getZones(iso) {
        if (!dataIndex || !dataIndex.isos[iso.toLowerCase()]) return [];
        return dataIndex.isos[iso.toLowerCase()].zones;
    }

    /**
     * Load data for a specific ISO and year
     */
    async function loadYear(iso, year) {
        const isoLower = iso.toLowerCase();
        const cacheKey = `${isoLower}_${year}`;

        // Return cached data if available
        if (cache[cacheKey]) {
            return cache[cacheKey];
        }

        try {
            const response = await fetch(`${basePath}/${isoLower}/${year}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load ${iso} ${year}: ${response.status}`);
            }
            const yearFile = await response.json();
            cache[cacheKey] = yearFile.data;
            return yearFile.data;
        } catch (error) {
            console.error(`Error loading ${iso} ${year}:`, error);
            return [];
        }
    }

    /**
     * Load all data for an ISO (all years)
     */
    async function loadISO(iso) {
        const years = getYears(iso);
        const allData = [];

        for (const year of years) {
            const yearData = await loadYear(iso, year);
            allData.push(...yearData);
        }

        return allData;
    }

    /**
     * Load all available data (all ISOs, all years)
     */
    async function loadAll() {
        const allData = [];
        for (const iso of getISOs()) {
            const isoData = await loadISO(iso);
            allData.push(...isoData);
        }
        return allData;
    }

    /**
     * Query data with filters
     * @param {Object} options - Query options
     * @param {string} options.iso - ISO to filter by (optional)
     * @param {number[]} options.years - Years to include (optional)
     * @param {string[]} options.zones - Zone codes to include (optional)
     * @param {number[]} options.months - Months to include (optional)
     */
    async function query(options = {}) {
        let data = [];

        // Determine which ISOs to load
        const isos = options.iso ? [options.iso.toLowerCase()] : getISOs();

        for (const iso of isos) {
            // Determine which years to load
            const availableYears = getYears(iso);
            const yearsToLoad = options.years 
                ? options.years.filter(y => availableYears.includes(y))
                : availableYears;

            for (const year of yearsToLoad) {
                const yearData = await loadYear(iso, year);
                data.push(...yearData);
            }
        }

        // Apply zone filter
        if (options.zones && options.zones.length > 0) {
            data = data.filter(d => options.zones.includes(d.Zone));
        }

        // Apply month filter
        if (options.months && options.months.length > 0) {
            data = data.filter(d => options.months.includes(d.Month));
        }

        return data;
    }

    /**
     * Get data for a specific zone across all available years
     */
    async function getZoneHistory(iso, zone) {
        const allData = await loadISO(iso);
        return allData
            .filter(d => d.Zone === zone)
            .sort((a, b) => {
                if (a.Year !== b.Year) return a.Year - b.Year;
                return a.Month - b.Month;
            });
    }

    /**
     * Get comparison data between two zones
     */
    async function compareZones(iso, zone1, zone2, years = null) {
        const queryOptions = { iso };
        if (years) queryOptions.years = years;

        const data = await query(queryOptions);
        
        const zone1Data = data.filter(d => d.Zone === zone1);
        const zone2Data = data.filter(d => d.Zone === zone2);

        // Build comparison by year/month
        const comparison = [];
        for (const d1 of zone1Data) {
            const d2 = zone2Data.find(d => d.Year === d1.Year && d.Month === d1.Month);
            if (d2) {
                comparison.push({
                    Year: d1.Year,
                    Month: d1.Month,
                    [zone1]: d1.Avg_DA_LMP,
                    [zone2]: d2.Avg_DA_LMP,
                    Difference: (d1.Avg_DA_LMP - d2.Avg_DA_LMP).toFixed(2),
                    DifferencePercent: (((d1.Avg_DA_LMP - d2.Avg_DA_LMP) / d2.Avg_DA_LMP) * 100).toFixed(2)
                });
            }
        }

        return comparison.sort((a, b) => {
            if (a.Year !== b.Year) return a.Year - b.Year;
            return a.Month - b.Month;
        });
    }

    /**
     * Calculate statistics for a zone over a time period
     */
    async function getZoneStats(iso, zone, years = null) {
        const queryOptions = { iso, zones: [zone] };
        if (years) queryOptions.years = years;

        const data = await query(queryOptions);
        
        if (data.length === 0) {
            return null;
        }

        const prices = data.map(d => d.Avg_DA_LMP);
        const sum = prices.reduce((a, b) => a + b, 0);
        const avg = sum / prices.length;
        const sorted = [...prices].sort((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const median = sorted[Math.floor(sorted.length / 2)];

        // Calculate standard deviation
        const squaredDiffs = prices.map(p => Math.pow(p - avg, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
        const stdDev = Math.sqrt(avgSquaredDiff);

        return {
            zone,
            iso: iso.toUpperCase(),
            recordCount: data.length,
            yearRange: {
                start: Math.min(...data.map(d => d.Year)),
                end: Math.max(...data.map(d => d.Year))
            },
            average: avg.toFixed(2),
            median: median.toFixed(2),
            min: min.toFixed(2),
            max: max.toFixed(2),
            stdDev: stdDev.toFixed(2),
            range: (max - min).toFixed(2)
        };
    }

    /**
     * Clear the cache (useful if data is updated)
     */
    function clearCache() {
        cache = {};
    }

    /**
     * Check if data store is ready
     */
    function isReady() {
        return dataIndex !== null;
    }

    // Public API
    return {
        init,
        getIndex,
        getISOs,
        getYears,
        getZones,
        loadYear,
        loadISO,
        loadAll,
        query,
        getZoneHistory,
        compareZones,
        getZoneStats,
        clearCache,
        isReady
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LMPDataStore;
}

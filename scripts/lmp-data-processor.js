/**
 * LMP Data Processor Module
 * Handles both hourly and monthly LMP data processing
 * 
 * Can calculate monthly averages from hourly data on-the-fly
 * Provides utilities for both analytics and data management widgets
 */

const LMPDataProcessor = (function() {
    'use strict';

    /**
     * Calculate monthly averages from hourly data
     * @param {Array} hourlyRecords - Array of { dt: datetime, p: price, z: zone }
     * @param {string} iso - ISO identifier
     * @returns {Array} Monthly summary records
     */
    function calculateMonthlyFromHourly(hourlyRecords, iso) {
        const monthlyMap = {};

        hourlyRecords.forEach(record => {
            const date = new Date(record.dt);
            const year = date.getFullYear().toString();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const zone = record.z;
            const key = `${zone}_${year}_${month}`;

            if (!monthlyMap[key]) {
                monthlyMap[key] = {
                    iso: iso,
                    zone: zone,
                    year: year,
                    month: month,
                    prices: []
                };
            }
            monthlyMap[key].prices.push(record.p);
        });

        return Object.values(monthlyMap).map(m => ({
            iso: m.iso,
            zone: m.zone,
            year: m.year,
            month: m.month,
            lmp: m.prices.reduce((a, b) => a + b, 0) / m.prices.length,
            avg_da_lmp: m.prices.reduce((a, b) => a + b, 0) / m.prices.length,
            min_price: Math.min(...m.prices),
            max_price: Math.max(...m.prices),
            record_count: m.prices.length
        })).sort((a, b) => 
            a.zone.localeCompare(b.zone) || 
            a.year.localeCompare(b.year) || 
            a.month.localeCompare(b.month)
        );
    }

    /**
     * Convert database format to flat records array
     * @param {Object} database - Database with { data: { ISO: [...] }, hourly: { ISO: { "YYYY-MM": [...] } } }
     * @returns {Object} { monthly: [...], hourly: [...] }
     */
    function flattenDatabase(database) {
        const monthly = [];
        const hourly = [];

        // Flatten monthly data
        if (database.data) {
            for (const [iso, records] of Object.entries(database.data)) {
                records.forEach(r => {
                    monthly.push({
                        iso: iso,
                        zone: r.zone,
                        zone_id: r.zone_id,
                        year: r.year,
                        month: r.month,
                        lmp: r.avg_da_lmp || r.lmp || 0,
                        min_price: r.min_price || 0,
                        max_price: r.max_price || 0,
                        record_count: r.record_count || 0
                    });
                });
            }
        }

        // Flatten hourly data
        if (database.hourly) {
            for (const [iso, monthData] of Object.entries(database.hourly)) {
                for (const [yearMonth, records] of Object.entries(monthData)) {
                    records.forEach(r => {
                        hourly.push({
                            iso: iso,
                            datetime: r.dt,
                            price: r.p,
                            zone: r.z
                        });
                    });
                }
            }
        }

        return { monthly, hourly };
    }

    /**
     * Get hourly data for a specific ISO/zone/time range
     * @param {Object} database - Full database object
     * @param {Object} filters - { iso, zone, startDate, endDate }
     * @returns {Array} Filtered hourly records
     */
    function getFilteredHourlyData(database, filters) {
        const { iso, zone, startDate, endDate } = filters;
        const results = [];

        if (!database.hourly) return results;

        const isos = iso === 'all' ? Object.keys(database.hourly) : [iso];

        for (const isoKey of isos) {
            if (!database.hourly[isoKey]) continue;

            for (const [yearMonth, records] of Object.entries(database.hourly[isoKey])) {
                // Quick filter by year-month
                if (startDate || endDate) {
                    const [year, month] = yearMonth.split('-');
                    const monthStart = new Date(year, parseInt(month) - 1, 1);
                    const monthEnd = new Date(year, parseInt(month), 0);
                    
                    if (startDate && monthEnd < new Date(startDate)) continue;
                    if (endDate && monthStart > new Date(endDate)) continue;
                }

                records.forEach(r => {
                    // Zone filter
                    if (zone && zone !== 'all' && r.z !== zone) return;

                    // Detailed date filter
                    if (startDate || endDate) {
                        const recordDate = new Date(r.dt);
                        if (startDate && recordDate < new Date(startDate)) return;
                        if (endDate && recordDate > new Date(endDate)) return;
                    }

                    results.push({
                        iso: isoKey,
                        datetime: r.dt,
                        price: r.p,
                        zone: r.z
                    });
                });
            }
        }

        return results.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    }

    /**
     * Aggregate hourly data by different time intervals
     * @param {Array} hourlyRecords - Hourly records
     * @param {string} interval - 'hour', 'day', 'week', 'month'
     * @returns {Array} Aggregated records
     */
    function aggregateByInterval(hourlyRecords, interval) {
        const groups = {};

        hourlyRecords.forEach(r => {
            const date = new Date(r.datetime);
            let key;

            switch (interval) {
                case 'hour':
                    key = r.datetime;
                    break;
                case 'day':
                    key = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
                    break;
                case 'week':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    key = `${weekStart.getFullYear()}-W${Math.ceil((weekStart.getDate()) / 7).toString().padStart(2,'0')}`;
                    break;
                case 'month':
                default:
                    key = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}`;
            }

            const groupKey = `${r.zone}_${key}`;
            if (!groups[groupKey]) {
                groups[groupKey] = {
                    iso: r.iso,
                    zone: r.zone,
                    period: key,
                    prices: []
                };
            }
            groups[groupKey].prices.push(r.price);
        });

        return Object.values(groups).map(g => ({
            iso: g.iso,
            zone: g.zone,
            period: g.period,
            avg_price: g.prices.reduce((a, b) => a + b, 0) / g.prices.length,
            min_price: Math.min(...g.prices),
            max_price: Math.max(...g.prices),
            record_count: g.prices.length
        })).sort((a, b) => a.period.localeCompare(b.period));
    }

    /**
     * Calculate statistics for a set of records
     * @param {Array} records - Records with price/lmp field
     * @returns {Object} Statistics
     */
    function calculateStats(records) {
        if (!records || records.length === 0) {
            return { count: 0, avg: 0, min: 0, max: 0, median: 0, stdDev: 0 };
        }

        const prices = records.map(r => r.price || r.lmp || 0).filter(p => !isNaN(p));
        if (prices.length === 0) {
            return { count: 0, avg: 0, min: 0, max: 0, median: 0, stdDev: 0 };
        }

        const sorted = [...prices].sort((a, b) => a - b);
        const sum = prices.reduce((a, b) => a + b, 0);
        const avg = sum / prices.length;
        const variance = prices.reduce((acc, p) => acc + Math.pow(p - avg, 2), 0) / prices.length;

        return {
            count: prices.length,
            avg: avg,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median: sorted[Math.floor(sorted.length / 2)],
            stdDev: Math.sqrt(variance)
        };
    }

    /**
     * Get peak hours analysis (hourly data only)
     * @param {Array} hourlyRecords - Hourly records
     * @returns {Object} Peak analysis
     */
    function analyzePeakHours(hourlyRecords) {
        const hourlyAverages = {};
        
        hourlyRecords.forEach(r => {
            const hour = new Date(r.datetime).getHours();
            if (!hourlyAverages[hour]) {
                hourlyAverages[hour] = { sum: 0, count: 0 };
            }
            hourlyAverages[hour].sum += r.price;
            hourlyAverages[hour].count++;
        });

        const hourlyAvg = Object.entries(hourlyAverages).map(([hour, data]) => ({
            hour: parseInt(hour),
            avg: data.sum / data.count,
            count: data.count
        })).sort((a, b) => a.hour - b.hour);

        // Find peak and off-peak hours
        const sorted = [...hourlyAvg].sort((a, b) => b.avg - a.avg);
        const peakHours = sorted.slice(0, 4).map(h => h.hour);
        const offPeakHours = sorted.slice(-4).map(h => h.hour);

        return {
            hourlyAverages: hourlyAvg,
            peakHours: peakHours,
            offPeakHours: offPeakHours,
            peakAvg: sorted.slice(0, 4).reduce((a, b) => a + b.avg, 0) / 4,
            offPeakAvg: sorted.slice(-4).reduce((a, b) => a + b.avg, 0) / 4
        };
    }

    /**
     * Get day-of-week analysis (hourly data only)
     * @param {Array} hourlyRecords - Hourly records
     * @returns {Array} Day of week averages (0=Sunday)
     */
    function analyzeDayOfWeek(hourlyRecords) {
        const dayTotals = {};
        
        hourlyRecords.forEach(r => {
            const day = new Date(r.datetime).getDay();
            if (!dayTotals[day]) {
                dayTotals[day] = { sum: 0, count: 0 };
            }
            dayTotals[day].sum += r.price;
            dayTotals[day].count++;
        });

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        return dayNames.map((name, i) => ({
            day: i,
            name: name,
            avg: dayTotals[i] ? dayTotals[i].sum / dayTotals[i].count : 0,
            count: dayTotals[i]?.count || 0
        }));
    }

    /**
     * Check if database has hourly data
     * @param {Object} database - Database object
     * @returns {boolean}
     */
    function hasHourlyData(database) {
        if (!database || !database.hourly) return false;
        
        for (const iso of Object.keys(database.hourly)) {
            for (const yearMonth of Object.keys(database.hourly[iso])) {
                if (database.hourly[iso][yearMonth]?.length > 0) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Get available year-months that have hourly data
     * @param {Object} database - Database object
     * @param {string} iso - Optional ISO filter
     * @returns {Array} Sorted year-months ['2024-01', '2024-02', ...]
     */
    function getAvailableHourlyMonths(database, iso = null) {
        const months = new Set();
        
        if (!database || !database.hourly) return [];
        
        const isos = iso ? [iso] : Object.keys(database.hourly);
        
        for (const isoKey of isos) {
            if (database.hourly[isoKey]) {
                Object.keys(database.hourly[isoKey]).forEach(ym => months.add(ym));
            }
        }
        
        return [...months].sort();
    }

    // Public API
    return {
        calculateMonthlyFromHourly,
        flattenDatabase,
        getFilteredHourlyData,
        aggregateByInterval,
        calculateStats,
        analyzePeakHours,
        analyzeDayOfWeek,
        hasHourlyData,
        getAvailableHourlyMonths
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.LMPDataProcessor = LMPDataProcessor;
}

// Node.js export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LMPDataProcessor;
}

console.log('[LMPDataProcessor] Module loaded');

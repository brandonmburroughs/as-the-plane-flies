/**
 * BTS On-Time Performance Data Processor
 *
 * Processes real flight data from the Bureau of Transportation Statistics
 * to generate accurate travel time matrices.
 *
 * Data source: https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FGJ
 *
 * Required CSV fields from BTS download:
 * - Origin: Origin airport code
 * - Dest: Destination airport code
 * - ActualElapsedTime: Actual flight time in minutes
 * - Cancelled: Whether flight was cancelled (1 = yes)
 *
 * Usage:
 *   node process-bts-data.js <path-to-bts-csv-file-or-directory>
 *
 * Examples:
 *   node process-bts-data.js ../raw-data/bts-2024.csv
 *   node process-bts-data.js ../raw-data/   (processes all CSV files in directory)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const GROUND_TIME_MIN = 0;         // BTS elapsed time is already gate-to-gate
const MIN_LAYOVER_MIN = 60;        // Minimum connection time
const AVG_LAYOVER_MIN = 90;        // Average layover time for connections
const MIN_FLIGHTS_FOR_DIRECT = 10; // Minimum flights per month to count as "direct route"

// Load airports data
const airportsPath = path.join(__dirname, '../../data/airports.json');
const airports = JSON.parse(fs.readFileSync(airportsPath, 'utf8'));
const airportCodes = new Set(airports.map(a => a.code));

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * Process a single BTS CSV file
 */
function processCSVFile(filePath, flightData) {
    console.log(`Processing: ${path.basename(filePath)}`);

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    if (lines.length < 2) {
        console.log('  Skipping empty file');
        return;
    }

    // Parse header to find column indices
    const header = parseCSVLine(lines[0]);
    const originIdx = header.findIndex(h => h.toUpperCase() === 'ORIGIN');
    const destIdx = header.findIndex(h => h.toUpperCase() === 'DEST');
    const elapsedIdx = header.findIndex(h => h.toUpperCase() === 'ACTUAL_ELAPSED_TIME');
    const cancelledIdx = header.findIndex(h => h.toUpperCase() === 'CANCELLED');

    if (originIdx === -1 || destIdx === -1 || elapsedIdx === -1) {
        console.log('  Error: Missing required columns (Origin, Dest, ActualElapsedTime)');
        console.log('  Found columns:', header.join(', '));
        return;
    }

    let processedCount = 0;
    let skippedCount = 0;

    // Process each flight record
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = parseCSVLine(line);
        const origin = fields[originIdx];
        const dest = fields[destIdx];
        const elapsedTime = parseFloat(fields[elapsedIdx]);
        const cancelled = cancelledIdx >= 0 ? fields[cancelledIdx] === '1' : false;

        // Skip if cancelled or missing data
        if (cancelled || isNaN(elapsedTime) || elapsedTime <= 0) {
            skippedCount++;
            continue;
        }

        // Skip if airports not in our list
        if (!airportCodes.has(origin) || !airportCodes.has(dest)) {
            skippedCount++;
            continue;
        }

        // Record the flight time
        const key = `${origin}-${dest}`;
        if (!flightData[key]) {
            flightData[key] = { times: [], count: 0 };
        }
        flightData[key].times.push(elapsedTime);
        flightData[key].count++;
        processedCount++;
    }

    console.log(`  Processed ${processedCount} flights, skipped ${skippedCount}`);
}

/**
 * Calculate average flight time for a route
 */
function calculateAverageTime(times) {
    if (times.length === 0) return null;

    // Remove outliers (beyond 2 standard deviations)
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const stdDev = Math.sqrt(times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length);

    const filtered = times.filter(t => Math.abs(t - mean) <= 2 * stdDev);

    if (filtered.length === 0) return Math.round(mean);

    return Math.round(filtered.reduce((a, b) => a + b, 0) / filtered.length);
}

/**
 * Find best connection between two airports through a hub
 */
function findBestConnection(originCode, destCode, directFlightTimes) {
    let bestTime = Infinity;
    let bestHub = null;

    // Try each large hub as a potential connection point
    const largeHubs = airports.filter(a => a.hub === 'large');

    for (const hub of largeHubs) {
        if (hub.code === originCode || hub.code === destCode) continue;

        const leg1Key = `${originCode}-${hub.code}`;
        const leg2Key = `${hub.code}-${destCode}`;

        const leg1Time = directFlightTimes[leg1Key];
        const leg2Time = directFlightTimes[leg2Key];

        if (leg1Time && leg2Time) {
            const totalTime = leg1Time + leg2Time + AVG_LAYOVER_MIN;
            if (totalTime < bestTime) {
                bestTime = totalTime;
                bestHub = hub.code;
            }
        }
    }

    // Also try medium hubs
    const mediumHubs = airports.filter(a => a.hub === 'medium');

    for (const hub of mediumHubs) {
        if (hub.code === originCode || hub.code === destCode) continue;

        const leg1Key = `${originCode}-${hub.code}`;
        const leg2Key = `${hub.code}-${destCode}`;

        const leg1Time = directFlightTimes[leg1Key];
        const leg2Time = directFlightTimes[leg2Key];

        if (leg1Time && leg2Time) {
            const totalTime = leg1Time + leg2Time + AVG_LAYOVER_MIN;
            if (totalTime < bestTime) {
                bestTime = totalTime;
                bestHub = hub.code;
            }
        }
    }

    return { time: bestTime === Infinity ? null : bestTime, hub: bestHub };
}

/**
 * Estimate flight time based on distance (fallback for missing routes)
 */
function estimateFlightTime(airport1, airport2) {
    const toRad = (deg) => deg * Math.PI / 180;
    const R = 3959; // Earth radius in miles

    const dLat = toRad(airport2.lat - airport1.lat);
    const dLon = toRad(airport2.lon - airport1.lon);

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(airport1.lat)) * Math.cos(toRad(airport2.lat)) *
              Math.sin(dLon / 2) ** 2;

    const distance = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Estimate: ~500 mph cruise + 30 min for takeoff/landing
    return Math.round((distance / 500) * 60 + 30);
}

/**
 * Build the travel time matrix
 */
function buildMatrix(flightData) {
    const n = airports.length;
    const matrix = [];
    const directFlights = [];

    // First, calculate average direct flight times
    const directFlightTimes = {};
    const directFlightCounts = {};

    for (const [key, data] of Object.entries(flightData)) {
        const avgTime = calculateAverageTime(data.times);
        if (avgTime && data.count >= MIN_FLIGHTS_FOR_DIRECT) {
            directFlightTimes[key] = avgTime;
            directFlightCounts[key] = data.count;
        }
    }

    console.log(`\nFound ${Object.keys(directFlightTimes).length} direct routes with sufficient data`);

    // Build the matrices
    let directCount = 0;
    let connectionCount = 0;
    let estimatedCount = 0;

    for (let i = 0; i < n; i++) {
        matrix[i] = [];
        directFlights[i] = [];

        for (let j = 0; j < n; j++) {
            if (i === j) {
                matrix[i][j] = 0;
                directFlights[i][j] = true;
                continue;
            }

            const key = `${airports[i].code}-${airports[j].code}`;
            const directTime = directFlightTimes[key];

            if (directTime) {
                // Direct flight exists
                matrix[i][j] = directTime + GROUND_TIME_MIN;
                directFlights[i][j] = true;
                directCount++;
            } else {
                // Try to find a connection
                const connection = findBestConnection(airports[i].code, airports[j].code, directFlightTimes);

                if (connection.time) {
                    matrix[i][j] = connection.time + GROUND_TIME_MIN;
                    directFlights[i][j] = false;
                    connectionCount++;
                } else {
                    // Estimate based on distance
                    const estimated = estimateFlightTime(airports[i], airports[j]);
                    matrix[i][j] = estimated + GROUND_TIME_MIN + AVG_LAYOVER_MIN;
                    directFlights[i][j] = false;
                    estimatedCount++;
                }
            }
        }
    }

    console.log(`\nRoute breakdown:`);
    console.log(`  Direct flights: ${directCount}`);
    console.log(`  Connections: ${connectionCount}`);
    console.log(`  Estimated (no data): ${estimatedCount}`);

    return { matrix, directFlights };
}

/**
 * Main execution
 */
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('BTS On-Time Performance Data Processor');
        console.log('');
        console.log('Usage: node process-bts-data.js <path-to-csv-or-directory>');
        console.log('');
        console.log('Download data from:');
        console.log('  https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FGJ');
        console.log('');
        console.log('Required fields to select:');
        console.log('  - Origin');
        console.log('  - Dest');
        console.log('  - ActualElapsedTime');
        console.log('  - Cancelled (optional but recommended)');
        console.log('');
        console.log('Place downloaded CSV files in: scripts/raw-data/');
        process.exit(1);
    }

    const inputPath = path.resolve(args[0]);
    const flightData = {};

    // Check if input is a file or directory
    const stats = fs.statSync(inputPath);

    if (stats.isDirectory()) {
        // Process all CSV files in directory
        const files = fs.readdirSync(inputPath).filter(f => f.endsWith('.csv'));
        console.log(`Found ${files.length} CSV files in ${inputPath}\n`);

        for (const file of files) {
            processCSVFile(path.join(inputPath, file), flightData);
        }
    } else if (stats.isFile()) {
        processCSVFile(inputPath, flightData);
    } else {
        console.error('Invalid input path');
        process.exit(1);
    }

    console.log(`\nTotal unique routes found: ${Object.keys(flightData).length}`);

    // Build the matrix
    const { matrix, directFlights } = buildMatrix(flightData);

    // Create output
    const output = {
        generated: new Date().toISOString(),
        description: "Travel time matrix from BTS On-Time Performance data (minutes)",
        source: "Bureau of Transportation Statistics - On-Time Performance",
        airportCount: airports.length,
        airports: airports.map(a => a.code),
        matrix: matrix,
        directFlights: directFlights
    };

    // Write to file
    const outputPath = path.join(__dirname, '../../data/matrix.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nMatrix saved to: ${outputPath}`);

    // Print sample routes
    console.log('\nSample travel times:');
    const sampleRoutes = [
        ['ATL', 'LAX'],
        ['JFK', 'SFO'],
        ['ORD', 'MIA'],
        ['DFW', 'SEA'],
        ['DEN', 'BOS']
    ];

    for (const [from, to] of sampleRoutes) {
        const fromIdx = airports.findIndex(a => a.code === from);
        const toIdx = airports.findIndex(a => a.code === to);
        if (fromIdx >= 0 && toIdx >= 0) {
            const time = matrix[fromIdx][toIdx];
            const isDirect = directFlights[fromIdx][toIdx];
            const hours = Math.floor(time / 60);
            const mins = time % 60;
            console.log(`  ${from} → ${to}: ${hours}h ${mins}m ${isDirect ? '(direct)' : '(connection)'}`);
        }
    }
}

main();

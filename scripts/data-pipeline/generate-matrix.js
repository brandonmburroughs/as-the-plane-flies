/**
 * Travel Time Matrix Generator
 *
 * Generates a realistic 100x100 travel time matrix based on:
 * - Geographic distance between airports
 * - Hub connectivity (large hubs have more direct flights)
 * - Connection penalties for non-direct routes
 *
 * Run with: node generate-matrix.js
 *
 * This simulated data can be replaced with actual BTS data later.
 */

const fs = require('fs');
const path = require('path');

// Load airports data
const airportsPath = path.join(__dirname, '../../data/airports.json');
const airports = JSON.parse(fs.readFileSync(airportsPath, 'utf8'));

// Constants
const EARTH_RADIUS_MILES = 3959;
const AVG_FLIGHT_SPEED_MPH = 500;
const GROUND_TIME_MIN = 90; // Check-in, boarding, taxi
const MIN_LAYOVER_MIN = 90;
const AVG_LAYOVER_MIN = 120;

// Hub connectivity - probability of direct flight based on hub sizes
const DIRECT_FLIGHT_PROBABILITY = {
    'large-large': 0.95,
    'large-medium': 0.85,
    'large-small': 0.60,
    'medium-medium': 0.50,
    'medium-small': 0.30,
    'small-small': 0.15
};

/**
 * Calculate distance between two points using Haversine formula
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_MILES * c;
}

/**
 * Calculate direct flight time in minutes
 */
function calculateFlightTime(distanceMiles) {
    // Flight time = distance / speed + 30 min for takeoff/landing
    const airTime = (distanceMiles / AVG_FLIGHT_SPEED_MPH) * 60 + 30;
    return Math.round(airTime);
}

/**
 * Determine if there's likely a direct flight between two airports
 */
function hasDirectFlight(airport1, airport2, distance) {
    // Same airport
    if (airport1.code === airport2.code) return true;

    // Very short distances always have direct flights
    if (distance < 200) return true;

    // Very long distances (except to/from major hubs) less likely
    if (distance > 2500 && airport1.hub !== 'large' && airport2.hub !== 'large') {
        return Math.random() < 0.2;
    }

    // Hawaii/Alaska special cases - only direct to large hubs
    const remoteStates = ['HI', 'AK', 'PR'];
    const isRemote1 = remoteStates.includes(airport1.state);
    const isRemote2 = remoteStates.includes(airport2.state);

    if (isRemote1 !== isRemote2) {
        // One is remote, one is not
        const mainlandAirport = isRemote1 ? airport2 : airport1;
        if (mainlandAirport.hub !== 'large') {
            return Math.random() < 0.1; // Very few direct flights to small mainland airports
        }
    }

    // Use hub-based probability
    const hubKey = [airport1.hub, airport2.hub].sort().join('-');
    const probability = DIRECT_FLIGHT_PROBABILITY[hubKey] || 0.3;

    // Adjust by distance (longer = less likely)
    const distanceFactor = Math.max(0.5, 1 - (distance / 5000));

    return Math.random() < (probability * distanceFactor);
}

/**
 * Find the best connecting hub between two airports
 */
function findBestConnection(origin, dest, airports, distanceMatrix) {
    let bestTime = Infinity;
    let bestHub = null;

    // Major connecting hubs
    const majorHubs = airports.filter(a => a.hub === 'large' && a.code !== origin.code && a.code !== dest.code);

    for (const hub of majorHubs) {
        const originIdx = airports.findIndex(a => a.code === origin.code);
        const hubIdx = airports.findIndex(a => a.code === hub.code);
        const destIdx = airports.findIndex(a => a.code === dest.code);

        const leg1Distance = distanceMatrix[originIdx][hubIdx];
        const leg2Distance = distanceMatrix[hubIdx][destIdx];

        // Skip if either leg is too long (would need another connection)
        if (leg1Distance > 2000 || leg2Distance > 2000) continue;

        const leg1Time = calculateFlightTime(leg1Distance);
        const leg2Time = calculateFlightTime(leg2Distance);
        const totalTime = leg1Time + leg2Time + AVG_LAYOVER_MIN;

        if (totalTime < bestTime) {
            bestTime = totalTime;
            bestHub = hub;
        }
    }

    return { time: bestTime, hub: bestHub };
}

/**
 * Build the distance matrix (geographic distances)
 */
function buildDistanceMatrix(airports) {
    const n = airports.length;
    const matrix = [];

    for (let i = 0; i < n; i++) {
        matrix[i] = [];
        for (let j = 0; j < n; j++) {
            if (i === j) {
                matrix[i][j] = 0;
            } else {
                matrix[i][j] = haversineDistance(
                    airports[i].lat, airports[i].lon,
                    airports[j].lat, airports[j].lon
                );
            }
        }
    }

    return matrix;
}

/**
 * Build the travel time matrix
 */
function buildTravelTimeMatrix(airports, distanceMatrix) {
    const n = airports.length;
    const matrix = [];
    const directFlights = []; // Track which routes have direct flights

    console.log('Building travel time matrix for', n, 'airports...');

    // First pass: determine direct flights and their times
    for (let i = 0; i < n; i++) {
        matrix[i] = [];
        directFlights[i] = [];

        for (let j = 0; j < n; j++) {
            if (i === j) {
                matrix[i][j] = 0;
                directFlights[i][j] = true;
            } else {
                const distance = distanceMatrix[i][j];
                const isDirect = hasDirectFlight(airports[i], airports[j], distance);
                directFlights[i][j] = isDirect;

                if (isDirect) {
                    // Direct flight: air time + ground time
                    matrix[i][j] = calculateFlightTime(distance) + GROUND_TIME_MIN;
                } else {
                    matrix[i][j] = null; // Will fill in second pass
                }
            }
        }
    }

    // Second pass: fill in connection times
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (matrix[i][j] === null) {
                const connection = findBestConnection(airports[i], airports[j], airports, distanceMatrix);

                if (connection.time < Infinity) {
                    matrix[i][j] = Math.round(connection.time + GROUND_TIME_MIN);
                } else {
                    // No reasonable connection found - use 2-stop estimate
                    const directTime = calculateFlightTime(distanceMatrix[i][j]);
                    matrix[i][j] = Math.round(directTime * 1.8 + GROUND_TIME_MIN + AVG_LAYOVER_MIN * 2);
                }
            }
        }
    }

    // Count direct vs connection routes
    let directCount = 0;
    let connectionCount = 0;
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (i !== j) {
                if (directFlights[i][j]) directCount++;
                else connectionCount++;
            }
        }
    }

    console.log(`Direct flights: ${directCount}, Connections required: ${connectionCount}`);
    console.log(`Direct flight percentage: ${(directCount / (directCount + connectionCount) * 100).toFixed(1)}%`);

    return { matrix, directFlights };
}

// Main execution
console.log('Loading airports data...');
console.log(`Found ${airports.length} airports`);

const distanceMatrix = buildDistanceMatrix(airports);
const { matrix: travelTimeMatrix, directFlights } = buildTravelTimeMatrix(airports, distanceMatrix);

// Create output object with metadata
const output = {
    generated: new Date().toISOString(),
    description: "Simulated travel time matrix in minutes (can be replaced with BTS data)",
    airportCount: airports.length,
    airports: airports.map(a => a.code),
    matrix: travelTimeMatrix,
    directFlights: directFlights
};

// Write to file
const outputPath = path.join(__dirname, '../../data/matrix.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log(`\nMatrix saved to: ${outputPath}`);

// Print some sample routes
console.log('\nSample travel times:');
const sampleRoutes = [
    ['SFO', 'JFK'],
    ['SFO', 'LFT'],
    ['LAX', 'ORD'],
    ['ATL', 'SEA'],
    ['HNL', 'BOS'],
    ['LFT', 'ABQ']
];

for (const [from, to] of sampleRoutes) {
    const fromIdx = airports.findIndex(a => a.code === from);
    const toIdx = airports.findIndex(a => a.code === to);
    if (fromIdx >= 0 && toIdx >= 0) {
        const time = travelTimeMatrix[fromIdx][toIdx];
        const isDirect = directFlights[fromIdx][toIdx];
        const hours = Math.floor(time / 60);
        const mins = time % 60;
        console.log(`  ${from} → ${to}: ${hours}h ${mins}m ${isDirect ? '(direct)' : '(connection)'}`);
    }
}

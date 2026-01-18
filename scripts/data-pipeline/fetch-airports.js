/**
 * Fetch Airport Data Script
 *
 * Downloads airport coordinates from OpenFlights dataset and creates
 * an expanded airports.json file for all airports in the BTS data.
 *
 * Usage: node fetch-airports.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// OpenFlights airport data URL (public domain)
const OPENFLIGHTS_URL = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';

// BTS data directory
const BTS_DIR = path.join(__dirname, '../raw-data');
const OUTPUT_PATH = path.join(__dirname, '../../data/airports.json');

// US states and territories to include (continental US only)
const CONTINENTAL_US_STATES = new Set([
    'AL', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
    'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
    'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
    'WV', 'WI', 'WY', 'DC'
]);

// Excluded states/territories
const EXCLUDED_STATES = new Set(['HI', 'AK', 'PR', 'VI', 'GU', 'AS', 'MP']);

/**
 * Download file from URL
 */
function downloadFile(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                downloadFile(response.headers.location).then(resolve).catch(reject);
                return;
            }

            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
            response.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * Parse OpenFlights CSV data
 * Format: ID, Name, City, Country, IATA, ICAO, Lat, Lon, Alt, Timezone, DST, TzDB, Type, Source
 */
function parseOpenFlightsData(data) {
    const airports = new Map();

    for (const line of data.split('\n')) {
        if (!line.trim()) continue;

        // Parse CSV (handling quoted fields)
        const fields = [];
        let current = '';
        let inQuotes = false;

        for (const char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                fields.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        fields.push(current);

        const iata = fields[4];
        const country = fields[3];

        // Only US airports with valid IATA codes
        if (iata && iata !== '\\N' && iata.length === 3 && country === 'United States') {
            airports.set(iata, {
                code: iata,
                name: fields[1],
                city: fields[2],
                lat: parseFloat(fields[6]),
                lon: parseFloat(fields[7])
            });
        }
    }

    return airports;
}

/**
 * Get all unique airports from BTS CSV files with flight counts
 */
function getBTSAirports() {
    const flightCounts = new Map();

    const files = fs.readdirSync(BTS_DIR).filter(f => f.endsWith('.csv'));

    for (const file of files) {
        console.log(`Processing ${file}...`);
        const content = fs.readFileSync(path.join(BTS_DIR, file), 'utf8');
        const lines = content.split('\n');

        // Find column indices
        const headers = lines[0].split(',');
        const originIdx = headers.indexOf('ORIGIN');
        const destIdx = headers.indexOf('DEST');

        for (let i = 1; i < lines.length; i++) {
            const fields = lines[i].split(',');
            const origin = fields[originIdx];
            const dest = fields[destIdx];

            if (origin) flightCounts.set(origin, (flightCounts.get(origin) || 0) + 1);
            if (dest) flightCounts.set(dest, (flightCounts.get(dest) || 0) + 1);
        }
    }

    return flightCounts;
}

/**
 * Determine state from airport code using various heuristics
 */
function getStateForAirport(code, openFlightsData) {
    // Manual mappings for airports where city doesn't clearly indicate state
    const stateMap = {
        'ATL': 'GA', 'DFW': 'TX', 'DEN': 'CO', 'ORD': 'IL', 'LAX': 'CA',
        'JFK': 'NY', 'LAS': 'NV', 'MCO': 'FL', 'MIA': 'FL', 'CLT': 'NC',
        'SEA': 'WA', 'PHX': 'AZ', 'EWR': 'NJ', 'SFO': 'CA', 'IAH': 'TX',
        'BOS': 'MA', 'FLL': 'FL', 'MSP': 'MN', 'LGA': 'NY', 'DTW': 'MI',
        'PHL': 'PA', 'SLC': 'UT', 'DCA': 'DC', 'SAN': 'CA', 'BWI': 'MD',
        'TPA': 'FL', 'AUS': 'TX', 'IAD': 'VA', 'BNA': 'TN', 'HNL': 'HI',
        'MDW': 'IL', 'DAL': 'TX', 'PDX': 'OR', 'STL': 'MO', 'HOU': 'TX',
        'RDU': 'NC', 'OAK': 'CA', 'MSY': 'LA', 'SMF': 'CA', 'SJC': 'CA',
        'RSW': 'FL', 'CLE': 'OH', 'IND': 'IN', 'PIT': 'PA', 'SAT': 'TX',
        'CVG': 'OH', 'CMH': 'OH', 'MCI': 'MO', 'JAX': 'FL', 'SJU': 'PR',
        'OGG': 'HI', 'ABQ': 'NM', 'ANC': 'AK', 'OMA': 'NE', 'BUR': 'CA',
        'RNO': 'NV', 'PBI': 'FL', 'SNA': 'CA', 'MKE': 'WI', 'ONT': 'CA',
        'BDL': 'CT', 'ELP': 'TX', 'TUS': 'AZ', 'BUF': 'NY', 'ORF': 'VA',
        'OKC': 'OK', 'LBB': 'TX', 'TUL': 'OK', 'RIC': 'VA', 'BOI': 'ID',
        'ALB': 'NY', 'GEG': 'WA', 'LIT': 'AR', 'SDF': 'KY', 'PVD': 'RI',
        'GRR': 'MI', 'DSM': 'IA', 'CHS': 'SC', 'SYR': 'NY', 'BHM': 'AL',
        'ROC': 'NY', 'SAV': 'GA', 'MEM': 'TN', 'GSP': 'SC', 'PWM': 'ME',
        'MSN': 'WI', 'KOA': 'HI', 'GSO': 'NC', 'LIH': 'HI', 'ICT': 'KS',
        'XNA': 'AR', 'MYR': 'SC', 'DAY': 'OH', 'HSV': 'AL', 'PSP': 'CA',
        'FAT': 'CA', 'LFT': 'LA', 'CAK': 'OH', 'LEX': 'KY', 'AVL': 'NC',
        // Additional airports
        'SHV': 'LA', 'FCA': 'MT', 'GTF': 'MT', 'BIL': 'MT', 'MSO': 'MT',
        'HLN': 'MT', 'BTM': 'MT', 'GPI': 'MT', 'BZN': 'MT',
        'COS': 'CO', 'EGE': 'CO', 'GJT': 'CO', 'DRO': 'CO', 'MTJ': 'CO',
        'HDN': 'CO', 'ASE': 'CO', 'PUB': 'CO',
        'SBN': 'IN', 'FWA': 'IN', 'EVV': 'IN',
        'FAR': 'ND', 'BIS': 'ND', 'MOT': 'ND', 'GFK': 'ND',
        'RAP': 'SD', 'FSD': 'SD', 'PIR': 'SD', 'ABR': 'SD',
        'CID': 'IA', 'MLI': 'IA', 'DBQ': 'IA', 'SUX': 'IA',
        'LNK': 'NE', 'GRI': 'NE',
        'MHK': 'KS', 'SLN': 'KS', 'GCK': 'KS',
        'SGF': 'MO', 'JLN': 'MO', 'CGI': 'MO',
        'FSM': 'AR', 'TXK': 'AR',
        'SPS': 'TX', 'ABI': 'TX', 'GGG': 'TX', 'TYR': 'TX', 'ACT': 'TX',
        'SJT': 'TX', 'MAF': 'TX', 'AMA': 'TX', 'LRD': 'TX', 'MFE': 'TX',
        'BRO': 'TX', 'HRL': 'TX', 'CRP': 'TX', 'VPS': 'FL', 'PNS': 'FL',
        'TLH': 'FL', 'GNV': 'FL', 'DAB': 'FL', 'MLB': 'FL', 'SRQ': 'FL',
        'EYW': 'FL', 'ECP': 'FL',
        'MOB': 'AL', 'MGM': 'AL', 'DHN': 'AL',
        'GPT': 'MS', 'JAN': 'MS', 'GTR': 'MS', 'MEI': 'MS', 'PIB': 'MS',
        'BTR': 'LA', 'MLU': 'LA', 'AEX': 'LA', 'LCH': 'LA',
        'CHA': 'TN', 'TYS': 'TN', 'TRI': 'TN',
        'FAY': 'NC', 'ILM': 'NC', 'OAJ': 'NC', 'PGV': 'NC', 'EWN': 'NC',
        'CAE': 'SC', 'FLO': 'SC', 'HHH': 'SC',
        'AGS': 'GA', 'CSG': 'GA', 'ABY': 'GA', 'VLD': 'GA', 'BQK': 'GA',
        'CHO': 'VA', 'LYH': 'VA', 'ROA': 'VA', 'SHD': 'VA', 'PHF': 'VA',
        'CRW': 'WV', 'CKB': 'WV', 'HTS': 'WV',
        'AVP': 'PA', 'MDT': 'PA', 'ABE': 'PA', 'ERI': 'PA', 'IPT': 'PA',
        'UNV': 'PA', 'SCE': 'PA', 'LBE': 'PA',
        'BGM': 'NY', 'ELM': 'NY', 'ITH': 'NY', 'SWF': 'NY', 'PBG': 'NY',
        'OGS': 'NY', 'IAG': 'NY',
        'ACY': 'NJ', 'TTN': 'NJ',
        'HPN': 'NY', 'ISP': 'NY',
        'MHT': 'NH', 'PSM': 'NH',
        'BTV': 'VT',
        'BGR': 'ME', 'BHB': 'ME', 'PQI': 'ME', 'RKD': 'ME',
        'ORH': 'MA', 'ACK': 'MA', 'MVY': 'MA', 'HYA': 'MA',
        'HVN': 'CT',
        'FLG': 'AZ', 'YUM': 'AZ', 'PRC': 'AZ', 'IFP': 'AZ',
        'SBA': 'CA', 'SBP': 'CA', 'MRY': 'CA', 'ACV': 'CA', 'RDD': 'CA',
        'STS': 'CA', 'SMX': 'CA', 'OXR': 'CA', 'BFL': 'CA', 'CEC': 'CA',
        'CIC': 'CA', 'MOD': 'CA', 'MMH': 'CA', 'IYK': 'CA',
        'EUG': 'OR', 'MFR': 'OR', 'RDM': 'OR', 'OTH': 'OR',
        'GEG': 'WA', 'PSC': 'WA', 'YKM': 'WA', 'BLI': 'WA', 'ALW': 'WA',
        'EAT': 'WA', 'PUW': 'WA',
        'IDA': 'ID', 'LWS': 'ID', 'TWF': 'ID', 'SUN': 'ID', 'PIH': 'ID',
        'JAC': 'WY', 'COD': 'WY', 'RIW': 'WY', 'CYS': 'WY', 'CPR': 'WY',
        'SHR': 'WY', 'LAR': 'WY', 'GCC': 'WY',
        'CDC': 'UT', 'SGU': 'UT', 'PVU': 'UT', 'CNY': 'UT', 'VEL': 'UT',
        'EKO': 'NV',
        'ROW': 'NM', 'SAF': 'NM', 'HOB': 'NM',
        'FNT': 'MI', 'MBS': 'MI', 'AZO': 'MI', 'LAN': 'MI', 'TVC': 'MI',
        'MQT': 'MI', 'PLN': 'MI', 'ESC': 'MI', 'CMX': 'MI', 'CIU': 'MI',
        'APN': 'MI', 'IMT': 'MI', 'SAW': 'MI',
        'TOL': 'OH', 'YNG': 'OH',
        'SBN': 'IN', 'FWA': 'IN', 'EVV': 'IN', 'BMI': 'IL', 'PIA': 'IL',
        'MLI': 'IL', 'SPI': 'IL', 'CMI': 'IL', 'MWA': 'IL', 'RFD': 'IL',
        'DLH': 'MN', 'RST': 'MN', 'BJI': 'MN', 'BRD': 'MN', 'HIB': 'MN',
        'INL': 'MN', 'STC': 'MN', 'AXN': 'MN',
        'GRB': 'WI', 'ATW': 'WI', 'CWA': 'WI', 'EAU': 'WI', 'LSE': 'WI',
        'RHI': 'WI',
        // Alaska (will be filtered out)
        'FAI': 'AK', 'JNU': 'AK', 'KTN': 'AK', 'SIT': 'AK', 'YAK': 'AK',
        'CDV': 'AK', 'BET': 'AK', 'OME': 'AK', 'OTZ': 'AK', 'BRW': 'AK',
        'SCC': 'AK', 'ADQ': 'AK', 'DLG': 'AK', 'AKN': 'AK', 'GST': 'AK',
        'PSG': 'AK', 'WRG': 'AK', 'ADK': 'AK',
        // Hawaii (will be filtered out)
        'ITO': 'HI',
        // Puerto Rico (will be filtered out)
        'BQN': 'PR', 'PSE': 'PR',
        // Other territories
        'STT': 'VI', 'STX': 'VI', 'SPN': 'MP', 'GUM': 'GU', 'PPG': 'AS',
        // Additional missing airports
        'LGB': 'CA', 'SFB': 'FL', 'PIE': 'FL', 'PGD': 'FL', 'AZA': 'AZ',
        'XWA': 'ND', 'COU': 'MO', 'GRK': 'TX', 'BLV': 'IL', 'LCK': 'OH',
        'CLL': 'TX', 'GUC': 'CO', 'LAW': 'OK', 'PAE': 'WA', 'RKS': 'WY',
        'SWO': 'OK', 'JST': 'PA', 'MGW': 'WV', 'BPT': 'TX', 'USA': 'CO',
        'BFF': 'NE', 'SCK': 'CA', 'EFD': 'TX', 'UIN': 'IL', 'MKG': 'MI',
        'PLN': 'MI', 'JMS': 'ND', 'TVF': 'MN', 'OWB': 'KY', 'HOT': 'AR',
        'HRO': 'AR', 'GLH': 'MS', 'PRC': 'AZ', 'IFP': 'AZ', 'VCT': 'TX',
        'ART': 'NY', 'OGD': 'UT', 'MFE': 'TX', 'TXK': 'AR', 'DRT': 'TX',
        'LAR': 'WY', 'DDC': 'KS', 'LBL': 'KS', 'HYS': 'KS', 'EAR': 'NE',
        'DIK': 'ND', 'DVL': 'ND', 'DEC': 'IL', 'FOD': 'IA', 'MCW': 'IA',
        'LBF': 'NE', 'CLD': 'CA', 'WYS': 'MT', 'ALO': 'IA', 'HGR': 'MD',
        'BIH': 'CA', 'GUF': 'TX', 'ATY': 'SD', 'FMN': 'NM', 'LAF': 'IN'
    };

    return stateMap[code] || null;
}

/**
 * Determine hub size based on flight count
 */
function getHubSize(flightCount) {
    if (flightCount >= 100000) return 'large';    // ~8000+/month
    if (flightCount >= 30000) return 'medium';    // ~2500+/month
    return 'small';
}

async function main() {
    console.log('Fetching airport data from OpenFlights...');

    // Download OpenFlights data
    const openFlightsRaw = await downloadFile(OPENFLIGHTS_URL);
    const openFlightsData = parseOpenFlightsData(openFlightsRaw);
    console.log(`Found ${openFlightsData.size} US airports in OpenFlights database`);

    // Get BTS airport flight counts
    console.log('\nScanning BTS data for airport activity...');
    const btsFlightCounts = getBTSAirports();
    console.log(`Found ${btsFlightCounts.size} airports in BTS data`);

    // Sort by flight count
    const sortedAirports = Array.from(btsFlightCounts.entries())
        .sort((a, b) => b[1] - a[1]);

    // Build airports array
    const airports = [];
    const missing = [];

    for (let i = 0; i < sortedAirports.length; i++) {
        const [code, flightCount] = sortedAirports[i];
        const openFlightsInfo = openFlightsData.get(code);
        const state = getStateForAirport(code, openFlightsData);

        // Skip excluded states/territories
        if (state && EXCLUDED_STATES.has(state)) {
            console.log(`  Skipping ${code} (${state})`);
            continue;
        }

        if (openFlightsInfo && state) {
            airports.push({
                rank: airports.length + 1,
                code: code,
                name: openFlightsInfo.name,
                city: openFlightsInfo.city,
                state: state,
                lat: openFlightsInfo.lat,
                lon: openFlightsInfo.lon,
                hub: getHubSize(flightCount),
                flights: flightCount
            });
        } else if (!state) {
            missing.push({ code, flightCount, reason: 'no state mapping' });
        } else {
            missing.push({ code, flightCount, reason: 'not in OpenFlights' });
        }
    }

    console.log(`\nBuilt data for ${airports.length} continental US airports`);

    if (missing.length > 0) {
        console.log(`\nMissing ${missing.length} airports:`);
        missing.slice(0, 20).forEach(m => {
            console.log(`  ${m.code}: ${m.reason} (${m.flightCount} flights)`);
        });
        if (missing.length > 20) {
            console.log(`  ... and ${missing.length - 20} more`);
        }
    }

    // Remove the flights field before saving (was just for sorting)
    const cleanAirports = airports.map(({ flights, ...rest }) => rest);

    // Write output
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cleanAirports, null, 2));
    console.log(`\nWrote ${cleanAirports.length} airports to ${OUTPUT_PATH}`);

    // Summary by hub size
    const large = cleanAirports.filter(a => a.hub === 'large').length;
    const medium = cleanAirports.filter(a => a.hub === 'medium').length;
    const small = cleanAirports.filter(a => a.hub === 'small').length;
    console.log(`\nHub breakdown: ${large} large, ${medium} medium, ${small} small`);
}

main().catch(console.error);

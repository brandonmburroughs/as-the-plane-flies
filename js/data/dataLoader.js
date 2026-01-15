/**
 * Data Loader Module
 * Handles loading and caching of all data files
 */

const DataLoader = {
    cache: {
        usMap: null,
        airports: null,
        matrix: null
    },

    /**
     * Load all required data files
     * @returns {Promise<Object>} Object containing usMap, airports, and matrix
     */
    async loadAll() {
        const [usMap, airports, matrixData] = await Promise.all([
            this.loadUSMap(),
            this.loadAirports(),
            this.loadMatrix()
        ]);

        return { usMap, airports, matrixData };
    },

    /**
     * Load US map TopoJSON
     */
    async loadUSMap() {
        if (this.cache.usMap) return this.cache.usMap;

        try {
            this.cache.usMap = await d3.json(CONFIG.dataUrls.usMap);
            return this.cache.usMap;
        } catch (error) {
            console.error('Failed to load US map:', error);
            throw error;
        }
    },

    /**
     * Load airports data
     */
    async loadAirports() {
        if (this.cache.airports) return this.cache.airports;

        try {
            this.cache.airports = await d3.json(CONFIG.dataUrls.airports);
            return this.cache.airports;
        } catch (error) {
            console.error('Failed to load airports:', error);
            throw error;
        }
    },

    /**
     * Load travel time matrix
     */
    async loadMatrix() {
        if (this.cache.matrix) return this.cache.matrix;

        try {
            this.cache.matrix = await d3.json(CONFIG.dataUrls.matrix);
            return this.cache.matrix;
        } catch (error) {
            console.error('Failed to load travel time matrix:', error);
            throw error;
        }
    },

    /**
     * Get travel time between two airports
     * @param {string} fromCode - Origin airport code
     * @param {string} toCode - Destination airport code
     * @returns {number|null} Travel time in minutes, or null if not found
     */
    getTravelTime(fromCode, toCode) {
        if (!this.cache.matrix) return null;

        const fromIdx = this.cache.matrix.airports.indexOf(fromCode);
        const toIdx = this.cache.matrix.airports.indexOf(toCode);

        if (fromIdx < 0 || toIdx < 0) return null;

        return this.cache.matrix.matrix[fromIdx][toIdx];
    },

    /**
     * Check if there's a direct flight between two airports
     * @param {string} fromCode - Origin airport code
     * @param {string} toCode - Destination airport code
     * @returns {boolean}
     */
    hasDirectFlight(fromCode, toCode) {
        if (!this.cache.matrix) return false;

        const fromIdx = this.cache.matrix.airports.indexOf(fromCode);
        const toIdx = this.cache.matrix.airports.indexOf(toCode);

        if (fromIdx < 0 || toIdx < 0) return false;

        return this.cache.matrix.directFlights[fromIdx][toIdx];
    },

    /**
     * Get all travel times from a specific origin
     * @param {string} originCode - Origin airport code
     * @returns {Object} Map of airport codes to travel times
     */
    getTravelTimesFrom(originCode) {
        if (!this.cache.matrix) return {};

        const originIdx = this.cache.matrix.airports.indexOf(originCode);
        if (originIdx < 0) return {};

        const times = {};
        this.cache.matrix.airports.forEach((code, idx) => {
            times[code] = this.cache.matrix.matrix[originIdx][idx];
        });

        return times;
    },

    /**
     * Get the travel time matrix row for an origin
     * @param {string} originCode - Origin airport code
     * @returns {number[]} Array of travel times
     */
    getMatrixRow(originCode) {
        if (!this.cache.matrix) return [];

        const originIdx = this.cache.matrix.airports.indexOf(originCode);
        if (originIdx < 0) return [];

        return this.cache.matrix.matrix[originIdx];
    },

    /**
     * Get the full matrix (for MDS calculation)
     * @param {string[]} airportCodes - Optional subset of airports to include
     * @returns {number[][]} Travel time matrix
     */
    getSubMatrix(airportCodes) {
        if (!this.cache.matrix) return [];

        if (!airportCodes) {
            return this.cache.matrix.matrix;
        }

        // Extract submatrix for specified airports
        const indices = airportCodes.map(code =>
            this.cache.matrix.airports.indexOf(code)
        ).filter(idx => idx >= 0);

        return indices.map(i =>
            indices.map(j => this.cache.matrix.matrix[i][j])
        );
    }
};

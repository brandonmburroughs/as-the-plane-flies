/**
 * Classical Multidimensional Scaling (MDS) Implementation
 *
 * Converts a distance matrix into 2D coordinates that preserve
 * the relative distances as well as possible.
 *
 * Uses numeric.js for matrix operations (SVD)
 */

const MDS = {
    /**
     * Apply classical MDS to a distance matrix
     * @param {number[][]} distances - NxN distance matrix
     * @param {number} dimensions - Output dimensions (default 2)
     * @returns {number[][]} Nx2 array of [x, y] coordinates
     */
    classic(distances, dimensions = 2) {
        const n = distances.length;

        if (n === 0) return [];
        if (n === 1) return [[0, 0]];

        // Step 1: Square distances and multiply by -0.5
        const D2 = distances.map(row =>
            row.map(d => -0.5 * d * d)
        );

        // Step 2: Double centering (subtract row/col means, add grand mean)
        const rowMeans = D2.map(row =>
            row.reduce((sum, val) => sum + val, 0) / n
        );

        const colMeans = [];
        for (let j = 0; j < n; j++) {
            let sum = 0;
            for (let i = 0; i < n; i++) {
                sum += D2[i][j];
            }
            colMeans[j] = sum / n;
        }

        const grandMean = rowMeans.reduce((sum, val) => sum + val, 0) / n;

        // Build centered matrix B
        const B = [];
        for (let i = 0; i < n; i++) {
            B[i] = [];
            for (let j = 0; j < n; j++) {
                B[i][j] = D2[i][j] - rowMeans[i] - colMeans[j] + grandMean;
            }
        }

        // Step 3: Eigendecomposition via SVD
        let svd;
        try {
            svd = numeric.svd(B);
        } catch (e) {
            console.error('SVD failed:', e);
            // Fallback: return original positions scaled
            return distances.map((_, i) => [
                Math.cos(2 * Math.PI * i / n) * 100,
                Math.sin(2 * Math.PI * i / n) * 100
            ]);
        }

        // Step 4: Extract coordinates from top eigenvectors
        const result = [];
        for (let i = 0; i < n; i++) {
            result[i] = [];
            for (let d = 0; d < dimensions; d++) {
                // Eigenvalue is singular value squared for symmetric matrix
                // Coordinate = U * sqrt(eigenvalue)
                const eigenValue = svd.S[d] || 0;
                const scale = Math.sqrt(Math.max(0, eigenValue));
                result[i][d] = (svd.U[i][d] || 0) * scale;
            }
        }

        return result;
    },

    /**
     * Sanitize distance matrix - replace infinite/invalid values
     * @param {number[][]} distances - Distance matrix
     * @returns {number[][]} Cleaned matrix
     */
    sanitize(distances) {
        // Find maximum finite value
        let maxFinite = 0;
        for (const row of distances) {
            for (const val of row) {
                if (isFinite(val) && val > maxFinite) {
                    maxFinite = val;
                }
            }
        }

        // Replace infinities with 1.5x max
        const fallback = maxFinite * 1.5;

        return distances.map(row =>
            row.map(val => isFinite(val) ? val : fallback)
        );
    },

    /**
     * Apply power scaling to compress outliers (e.g., for HNL)
     * @param {number[][]} distances - Distance matrix
     * @param {number} power - Power to apply (0.5 = sqrt, 0.7 = common choice)
     * @returns {number[][]} Scaled matrix
     */
    powerScale(distances, power = 0.7) {
        return distances.map(row =>
            row.map(val => Math.pow(Math.max(0, val), power))
        );
    },

    /**
     * Scale MDS output to fit within bounds
     * @param {number[][]} positions - MDS output coordinates
     * @param {number} width - Target width
     * @param {number} height - Target height
     * @param {number} padding - Padding from edges
     * @returns {Object[]} Array of {x, y} objects
     */
    scaleToViewport(positions, width, height, padding = 50) {
        if (positions.length === 0) return [];

        const xValues = positions.map(p => p[0]);
        const yValues = positions.map(p => p[1]);

        const xMin = Math.min(...xValues);
        const xMax = Math.max(...xValues);
        const yMin = Math.min(...yValues);
        const yMax = Math.max(...yValues);

        // Handle edge case where all points are the same
        const xRange = xMax - xMin || 1;
        const yRange = yMax - yMin || 1;

        // Scale to fit, preserving aspect ratio
        const xScale = (width - 2 * padding) / xRange;
        const yScale = (height - 2 * padding) / yRange;
        const scale = Math.min(xScale, yScale);

        // Center in viewport
        const xOffset = (width - xRange * scale) / 2 - xMin * scale;
        const yOffset = (height - yRange * scale) / 2 - yMin * scale;

        return positions.map(p => ({
            x: p[0] * scale + xOffset,
            y: p[1] * scale + yOffset
        }));
    },

    /**
     * Align MDS output to match geographic orientation using Procrustes analysis
     * Handles both rotation AND reflection to ensure proper east-west, north-south orientation
     * @param {Object[]} mdsPositions - MDS output {x, y}
     * @param {Object[]} geoPositions - Geographic reference {x, y}
     * @param {number} originIndex - Index of origin airport (to center rotation)
     * @returns {Object[]} Aligned positions
     */
    alignToGeography(mdsPositions, geoPositions, originIndex = 0) {
        if (mdsPositions.length === 0) return [];
        if (mdsPositions.length === 1) return [{ ...geoPositions[0] }];

        // Calculate centroids
        const mdsCentroid = this.centroid(mdsPositions);
        const geoCentroid = this.centroid(geoPositions);

        // Center both point sets
        const mdsCentered = mdsPositions.map(p => ({
            x: p.x - mdsCentroid.x,
            y: p.y - mdsCentroid.y
        }));
        const geoCentered = geoPositions.map(p => ({
            x: p.x - geoCentroid.x,
            y: p.y - geoCentroid.y
        }));

        // Find optimal rotation using Procrustes (minimize sum of squared distances)
        // We'll try 4 configurations: no flip, flip x, flip y, flip both
        // and pick the one with lowest error
        const configs = [
            { flipX: false, flipY: false },
            { flipX: true, flipY: false },
            { flipX: false, flipY: true },
            { flipX: true, flipY: true }
        ];

        let bestConfig = configs[0];
        let bestError = Infinity;
        let bestRotation = 0;

        for (const config of configs) {
            // Apply flips
            const flipped = mdsCentered.map(p => ({
                x: config.flipX ? -p.x : p.x,
                y: config.flipY ? -p.y : p.y
            }));

            // Find optimal rotation for this flip configuration
            const rotation = this.findOptimalRotation(flipped, geoCentered);
            const rotated = this.applyRotation(flipped, rotation);
            const error = this.sumSquaredError(rotated, geoCentered);

            if (error < bestError) {
                bestError = error;
                bestConfig = config;
                bestRotation = rotation;
            }
        }

        // Apply best transformation
        return mdsPositions.map(p => {
            let x = p.x - mdsCentroid.x;
            let y = p.y - mdsCentroid.y;

            // Apply flips
            if (bestConfig.flipX) x = -x;
            if (bestConfig.flipY) y = -y;

            // Apply rotation
            const cos = Math.cos(bestRotation);
            const sin = Math.sin(bestRotation);
            const rx = x * cos - y * sin;
            const ry = x * sin + y * cos;

            // Translate to geo centroid
            return {
                x: rx + geoCentroid.x,
                y: ry + geoCentroid.y
            };
        });
    },

    /**
     * Calculate centroid of points
     */
    centroid(points) {
        const n = points.length;
        const sum = points.reduce((acc, p) => ({
            x: acc.x + p.x,
            y: acc.y + p.y
        }), { x: 0, y: 0 });
        return { x: sum.x / n, y: sum.y / n };
    },

    /**
     * Find optimal rotation angle using least squares
     */
    findOptimalRotation(source, target) {
        // Use the formula: theta = atan2(sum(x1*y2 - x2*y1), sum(x1*x2 + y1*y2))
        let num = 0;
        let den = 0;
        for (let i = 0; i < source.length; i++) {
            num += source[i].x * target[i].y - target[i].x * source[i].y;
            den += source[i].x * target[i].x + source[i].y * target[i].y;
        }
        return Math.atan2(num, den);
    },

    /**
     * Apply rotation to points
     */
    applyRotation(points, angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return points.map(p => ({
            x: p.x * cos - p.y * sin,
            y: p.x * sin + p.y * cos
        }));
    },

    /**
     * Calculate sum of squared distances between point sets
     */
    sumSquaredError(points1, points2) {
        return points1.reduce((sum, p, i) => {
            const dx = p.x - points2[i].x;
            const dy = p.y - points2[i].y;
            return sum + dx * dx + dy * dy;
        }, 0);
    },

    /**
     * Full MDS pipeline: sanitize, scale times, compute MDS, scale to viewport, align
     * @param {number[][]} travelTimes - Travel time matrix
     * @param {Object[]} geoPositions - Geographic positions for alignment
     * @param {number} originIndex - Index of selected origin
     * @param {Object} viewport - {width, height, padding}
     * @returns {Object[]} Final positions {x, y}
     */
    computePositions(travelTimes, geoPositions, originIndex, viewport) {
        // Use radial distortion instead of MDS
        // This keeps cities in the same direction from origin but adjusts distance based on travel time
        return this.computeRadialPositions(travelTimes, geoPositions, originIndex, viewport);
    },

    /**
     * Compute positions using radial distortion from origin
     * Cities stay in the same direction from origin, but distance is based on travel time
     * @param {number[][]} travelTimes - Travel time matrix
     * @param {Object[]} geoPositions - Geographic positions
     * @param {number} originIndex - Index of selected origin
     * @param {Object} viewport - {width, height, padding}
     * @returns {Object[]} Distorted positions
     */
    computeRadialPositions(travelTimes, geoPositions, originIndex, viewport) {
        const origin = geoPositions[originIndex];
        const originX = origin.geoX;
        const originY = origin.geoY;

        // Get travel times from origin to all airports
        const timesFromOrigin = travelTimes[originIndex];

        // Calculate geographic distances from origin
        const geoDistances = geoPositions.map(p =>
            Math.hypot(p.geoX - originX, p.geoY - originY)
        );

        // Find max geographic distance and max travel time for scaling
        const maxGeoDist = Math.max(...geoDistances.filter(d => d > 0));
        const maxTime = Math.max(...timesFromOrigin.filter(t => t > 0 && isFinite(t)));

        // Calculate new positions
        const positions = geoPositions.map((pos, i) => {
            if (i === originIndex) {
                // Origin stays in place
                return { x: originX, y: originY };
            }

            const geoDist = geoDistances[i];
            const travelTime = timesFromOrigin[i];

            if (geoDist < 1 || !isFinite(travelTime)) {
                return { x: pos.geoX, y: pos.geoY };
            }

            // Direction from origin (preserved)
            const dx = pos.geoX - originX;
            const dy = pos.geoY - originY;
            const angle = Math.atan2(dy, dx);

            // Calculate new distance based on travel time
            // Normalize travel time relative to geographic distance
            // If travel time is short relative to distance, move closer
            // If travel time is long relative to distance, move further

            // Expected time if distance was proportional (use average speed)
            const avgTimePerDist = maxTime / maxGeoDist;
            const expectedTime = geoDist * avgTimePerDist;

            // Ratio: actual time vs expected time
            // < 1 means faster than expected (direct flight), > 1 means slower (connections)
            const timeRatio = travelTime / expectedTime;

            // Apply ratio to distance (with some dampening to avoid extreme distortion)
            const dampening = 0.6; // 0 = no distortion, 1 = full distortion
            const distortionFactor = 1 + (timeRatio - 1) * dampening;
            const newDist = geoDist * distortionFactor;

            return {
                x: originX + Math.cos(angle) * newDist,
                y: originY + Math.sin(angle) * newDist
            };
        });

        return positions;
    }
};

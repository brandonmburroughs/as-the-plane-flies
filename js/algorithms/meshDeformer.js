/**
 * Mesh Deformer Module
 *
 * Uses Delaunay triangulation and inverse-distance weighted interpolation
 * to deform map geography based on control point (airport) displacements.
 */

const MeshDeformer = {
    /**
     * Create a mesh of control points over the map
     * @param {Object[]} airports - Airport positions {x, y, code}
     * @param {Object} bounds - {width, height} of the map
     * @param {Function} isInsideUS - Function to check if point is inside US boundary
     * @returns {Object} Mesh data with points and delaunay triangulation
     */
    createMesh(airports, bounds, isInsideUS) {
        const points = [];

        // Add airport control points
        airports.forEach((airport, i) => {
            points.push({
                x: airport.x,
                y: airport.y,
                type: 'airport',
                index: i,
                code: airport.code
            });
        });

        // Add boundary points (edges of viewport)
        const spacing = CONFIG.rubberSheet.boundarySampling;

        // Top edge
        for (let x = 0; x <= bounds.width; x += spacing) {
            points.push({ x, y: 0, type: 'boundary' });
        }
        // Bottom edge
        for (let x = 0; x <= bounds.width; x += spacing) {
            points.push({ x, y: bounds.height, type: 'boundary' });
        }
        // Left edge
        for (let y = spacing; y < bounds.height; y += spacing) {
            points.push({ x: 0, y, type: 'boundary' });
        }
        // Right edge
        for (let y = spacing; y < bounds.height; y += spacing) {
            points.push({ x: bounds.width, y, type: 'boundary' });
        }

        // Add interior grid points
        const gridSpacing = CONFIG.rubberSheet.gridSpacing;
        for (let x = gridSpacing; x < bounds.width; x += gridSpacing) {
            for (let y = gridSpacing; y < bounds.height; y += gridSpacing) {
                // Only add points inside the US boundary (if check function provided)
                if (!isInsideUS || isInsideUS(x, y)) {
                    points.push({ x, y, type: 'grid' });
                }
            }
        }

        // Build Delaunay triangulation
        const delaunay = d3.Delaunay.from(points, d => d.x, d => d.y);

        return {
            points,
            delaunay,
            airportCount: airports.length
        };
    },

    /**
     * Calculate deformed positions for all mesh points
     * @param {Object} mesh - Mesh created by createMesh
     * @param {Object[]} airportTargets - Target positions for airports
     * @param {Object[]} airportOriginals - Original positions for airports
     * @returns {Object[]} Deformed positions for all mesh points
     */
    deformMesh(mesh, airportTargets, airportOriginals) {
        const power = CONFIG.rubberSheet.interpolationPower;

        return mesh.points.map((point, i) => {
            // Airport points move to their target positions
            if (point.type === 'airport') {
                return {
                    x: airportTargets[point.index].x,
                    y: airportTargets[point.index].y
                };
            }

            // Boundary points stay fixed (anchors the edges)
            if (point.type === 'boundary') {
                return { x: point.x, y: point.y };
            }

            // Grid points: interpolate based on nearby airport displacements
            return this.interpolatePosition(
                point,
                airportOriginals,
                airportTargets,
                power
            );
        });
    },

    /**
     * Interpolate a grid point's position using inverse-distance weighting
     * @param {Object} point - The point to interpolate
     * @param {Object[]} originals - Original airport positions
     * @param {Object[]} targets - Target airport positions
     * @param {number} power - Interpolation power (higher = more local)
     * @returns {Object} Interpolated {x, y}
     */
    interpolatePosition(point, originals, targets, power) {
        let sumWeightX = 0;
        let sumWeightY = 0;
        let sumWeight = 0;

        for (let i = 0; i < originals.length; i++) {
            const dx = originals[i].x - point.x;
            const dy = originals[i].y - point.y;
            const dist = Math.hypot(dx, dy);

            // If very close to an airport, use that airport's position
            if (dist < 1) {
                return { x: targets[i].x, y: targets[i].y };
            }

            // Inverse distance weighting
            const weight = 1 / Math.pow(dist, power);

            // Displacement from original to target
            const dispX = targets[i].x - originals[i].x;
            const dispY = targets[i].y - originals[i].y;

            // Weighted new position
            sumWeightX += weight * (point.x + dispX);
            sumWeightY += weight * (point.y + dispY);
            sumWeight += weight;
        }

        return {
            x: sumWeightX / sumWeight,
            y: sumWeightY / sumWeight
        };
    },

    /**
     * Get triangles from the mesh for rendering
     * @param {Object} mesh - The mesh object
     * @param {Object[]} positions - Current positions of all mesh points
     * @returns {Object[]} Array of triangle objects with vertices
     */
    getTriangles(mesh, positions) {
        const triangles = [];
        const { delaunay } = mesh;

        for (let i = 0; i < delaunay.triangles.length; i += 3) {
            const i0 = delaunay.triangles[i];
            const i1 = delaunay.triangles[i + 1];
            const i2 = delaunay.triangles[i + 2];

            triangles.push({
                vertices: [
                    positions[i0],
                    positions[i1],
                    positions[i2]
                ],
                indices: [i0, i1, i2]
            });
        }

        return triangles;
    },

    /**
     * Transform a point through the deformed mesh using barycentric interpolation
     * @param {number} x - Original x coordinate
     * @param {number} y - Original y coordinate
     * @param {Object} mesh - The mesh object
     * @param {Object[]} originalPositions - Original mesh positions
     * @param {Object[]} deformedPositions - Deformed mesh positions
     * @returns {Object} Transformed {x, y}
     */
    transformPoint(x, y, mesh, originalPositions, deformedPositions) {
        // Find containing triangle
        const triIndex = mesh.delaunay.find(x, y);

        // Get the triangle's vertex indices
        // Note: find returns point index, we need to find triangle containing point
        const pointIndex = mesh.delaunay.find(x, y);

        // Use the Delaunay to find triangle
        for (let i = 0; i < mesh.delaunay.triangles.length; i += 3) {
            const i0 = mesh.delaunay.triangles[i];
            const i1 = mesh.delaunay.triangles[i + 1];
            const i2 = mesh.delaunay.triangles[i + 2];

            const p0 = mesh.points[i0];
            const p1 = mesh.points[i1];
            const p2 = mesh.points[i2];

            // Check if point is inside this triangle
            const bary = this.barycentricCoords(x, y, p0, p1, p2);

            if (bary.u >= 0 && bary.v >= 0 && bary.w >= 0) {
                // Point is inside this triangle - interpolate
                const d0 = deformedPositions[i0];
                const d1 = deformedPositions[i1];
                const d2 = deformedPositions[i2];

                return {
                    x: bary.u * d0.x + bary.v * d1.x + bary.w * d2.x,
                    y: bary.u * d0.y + bary.v * d1.y + bary.w * d2.y
                };
            }
        }

        // Fallback: use nearest neighbor interpolation
        return this.interpolatePosition(
            { x, y },
            mesh.points.filter(p => p.type === 'airport'),
            deformedPositions.slice(0, mesh.airportCount),
            CONFIG.rubberSheet.interpolationPower
        );
    },

    /**
     * Calculate barycentric coordinates for a point in a triangle
     * @returns {Object} {u, v, w} barycentric coordinates
     */
    barycentricCoords(px, py, p0, p1, p2) {
        const v0x = p2.x - p0.x;
        const v0y = p2.y - p0.y;
        const v1x = p1.x - p0.x;
        const v1y = p1.y - p0.y;
        const v2x = px - p0.x;
        const v2y = py - p0.y;

        const dot00 = v0x * v0x + v0y * v0y;
        const dot01 = v0x * v1x + v0y * v1y;
        const dot02 = v0x * v2x + v0y * v2y;
        const dot11 = v1x * v1x + v1y * v1y;
        const dot12 = v1x * v2x + v1y * v2y;

        const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
        const w = (dot11 * dot02 - dot01 * dot12) * invDenom;
        const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
        const u = 1 - v - w;

        return { u, v, w };
    }
};

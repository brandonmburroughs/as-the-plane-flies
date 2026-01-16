/**
 * Rubber Sheet Mode Module
 *
 * Handles the map distortion visualization where both airports
 * AND state boundaries morph based on flight times.
 */

class RubberSheetMode {
    constructor(renderer) {
        this.renderer = renderer;
        this.isActive = false;
        this.lastTargetPositions = null;
    }

    /**
     * Activate rubber-sheet mode
     */
    activate() {
        this.isActive = true;
    }

    /**
     * Deactivate rubber-sheet mode and restore states
     */
    deactivate() {
        this.isActive = false;
        this.transitionToGeographic();
    }

    /**
     * Update - morph both airports and states
     */
    update() {
        if (!this.renderer.selectedOrigin) return;

        const originIndex = this.renderer.getOriginIndex();
        if (originIndex < 0) return;

        // Get travel time matrix for current airports
        const matrix = this.renderer.getCurrentMatrix();

        // Calculate new positions using MDS
        const targetPositions = MDS.computePositions(
            matrix,
            this.renderer.geoPositions,
            originIndex,
            {
                width: this.renderer.width,
                height: this.renderer.height,
                padding: CONFIG.mds.padding
            }
        );

        this.lastTargetPositions = targetPositions;

        // Store original geo positions for state morphing
        const originalPositions = this.renderer.geoPositions.map(p => ({
            x: p.geoX,
            y: p.geoY
        }));

        // Animate airports to new positions
        this.renderer.transitionManager.transition(targetPositions, () => {
            this.renderer.currentPositions = targetPositions;
        });

        // Morph the states along with the airports
        this.morphStates(originalPositions, targetPositions);
    }

    /**
     * Morph state boundaries based on airport displacements
     */
    morphStates(originalPositions, targetPositions) {
        const self = this;
        const renderer = this.renderer;
        const states = topojson.feature(renderer.usMap, renderer.usMap.objects.states);
        // Filter out Alaska (02), Hawaii (15), and Puerto Rico (72)
        const excludedFips = ['02', '15', '72'];
        const filteredStates = states.features.filter(
            f => !excludedFips.includes(f.id)
        );

        renderer.mapLayer.selectAll('.state')
            .data(filteredStates)
            .transition()
            .duration(CONFIG.transitionDuration)
            .ease(CONFIG.transitionEase)
            .attrTween('d', function(d) {
                return function(t) {
                    return self.interpolateStatePath(d, originalPositions, targetPositions, t);
                };
            });
    }

    /**
     * Interpolate a state path between original and target positions
     */
    interpolateStatePath(feature, originalPositions, targetPositions, t) {
        const renderer = this.renderer;
        const projection = renderer.projection;
        const self = this;

        // Custom path generator that warps coordinates
        const warpedPath = d3.geoPath().projection({
            stream: function(stream) {
                return {
                    point: function(x, y) {
                        // Project the geographic point
                        const projected = projection([x, y]);
                        if (!projected) {
                            stream.point(x, y);
                            return;
                        }

                        // Interpolate the warped position
                        const warped = self.warpPoint(
                            projected[0],
                            projected[1],
                            originalPositions,
                            targetPositions,
                            t
                        );
                        stream.point(warped.x, warped.y);
                    },
                    sphere: function() { stream.sphere(); },
                    lineStart: function() { stream.lineStart(); },
                    lineEnd: function() { stream.lineEnd(); },
                    polygonStart: function() { stream.polygonStart(); },
                    polygonEnd: function() { stream.polygonEnd(); }
                };
            }
        });

        return warpedPath(feature);
    }

    /**
     * Warp a point using inverse distance weighting from airport displacements
     */
    warpPoint(x, y, originalPositions, targetPositions, t) {
        const power = 2.5; // Interpolation power
        let sumWeightX = 0;
        let sumWeightY = 0;
        let sumWeight = 0;

        for (let i = 0; i < originalPositions.length; i++) {
            const orig = originalPositions[i];
            const target = targetPositions[i];

            const dx = orig.x - x;
            const dy = orig.y - y;
            const dist = Math.hypot(dx, dy);

            if (dist < 1) {
                // Very close to airport - use interpolated airport position
                return {
                    x: orig.x + (target.x - orig.x) * t,
                    y: orig.y + (target.y - orig.y) * t
                };
            }

            const weight = 1 / Math.pow(dist, power);

            // Calculate interpolated displacement
            const dispX = (target.x - orig.x) * t;
            const dispY = (target.y - orig.y) * t;

            sumWeightX += weight * (x + dispX);
            sumWeightY += weight * (y + dispY);
            sumWeight += weight;
        }

        return {
            x: sumWeightX / sumWeight,
            y: sumWeightY / sumWeight
        };
    }

    /**
     * Transition states back to geographic positions
     */
    transitionToGeographic() {
        const renderer = this.renderer;
        const states = topojson.feature(renderer.usMap, renderer.usMap.objects.states);
        // Filter out Alaska (02), Hawaii (15), and Puerto Rico (72)
        const excludedFips = ['02', '15', '72'];
        const filteredStates = states.features.filter(
            f => !excludedFips.includes(f.id)
        );

        renderer.mapLayer.selectAll('.state')
            .data(filteredStates)
            .transition()
            .duration(CONFIG.transitionDuration)
            .ease(CONFIG.transitionEase)
            .attr('d', renderer.pathGenerator);
    }
}

/**
 * Points Mode Module
 *
 * Handles the "points only" visualization where airport dots
 * reposition based on flight time. States stay in original position.
 */

class PointsMode {
    constructor(renderer) {
        this.renderer = renderer;
    }

    /**
     * Update positions based on flight time from selected origin
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

        // Animate airports to new positions (states stay fixed)
        this.renderer.transitionManager.transition(targetPositions, () => {
            this.renderer.currentPositions = targetPositions;
        });
    }

    /**
     * Calculate positions for a specific origin (without animating)
     */
    calculatePositions(originCode) {
        const originIndex = this.renderer.airports.findIndex(a => a.code === originCode);
        if (originIndex < 0) return this.renderer.geoPositions;

        const matrix = this.renderer.getCurrentMatrix();

        return MDS.computePositions(
            matrix,
            this.renderer.geoPositions,
            originIndex,
            {
                width: this.renderer.width,
                height: this.renderer.height,
                padding: CONFIG.mds.padding
            }
        );
    }
}

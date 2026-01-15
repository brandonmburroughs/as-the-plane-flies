/**
 * Transition Manager Module
 *
 * Handles smooth animations between different map states.
 */

class TransitionManager {
    constructor(renderer) {
        this.renderer = renderer;
        this.isTransitioning = false;
    }

    /**
     * Transition airports to new positions
     * @param {Object[]} targetPositions - Array of {x, y} target positions
     * @param {Function} onComplete - Callback when transition completes
     */
    transition(targetPositions, onComplete) {
        if (this.isTransitioning) {
            // Cancel current transition
            this.renderer.airportsLayer.selectAll('.airport').interrupt();
            this.renderer.labelsLayer.selectAll('.airport-label').interrupt();
        }

        this.isTransitioning = true;

        const duration = CONFIG.transitionDuration;
        const ease = CONFIG.transitionEase;

        // Update geoPositions with new coordinates for rendering
        this.renderer.geoPositions.forEach((pos, i) => {
            if (targetPositions[i]) {
                pos.x = targetPositions[i].x;
                pos.y = targetPositions[i].y;
            }
        });

        // Animate airport circles
        this.renderer.airportsLayer.selectAll('.airport')
            .data(this.renderer.geoPositions, d => d.code)
            .transition()
            .duration(duration)
            .ease(ease)
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);

        // Animate labels with slight delay
        this.renderer.labelsLayer.selectAll('.airport-label')
            .data(this.renderer.geoPositions, d => d.code)
            .transition()
            .delay(50)
            .duration(duration)
            .ease(ease)
            .attr('x', d => d.x + 10)
            .attr('y', d => d.y + 4);

        // Mark transition complete
        setTimeout(() => {
            this.isTransitioning = false;
            if (onComplete) onComplete();
        }, duration + 100);
    }

    /**
     * Instantly set positions without animation
     */
    setPositions(positions) {
        this.renderer.geoPositions.forEach((pos, i) => {
            if (positions[i]) {
                pos.x = positions[i].x;
                pos.y = positions[i].y;
            }
        });

        this.renderer.airportsLayer.selectAll('.airport')
            .data(this.renderer.geoPositions, d => d.code)
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);

        this.renderer.labelsLayer.selectAll('.airport-label')
            .data(this.renderer.geoPositions, d => d.code)
            .attr('x', d => d.x + 10)
            .attr('y', d => d.y + 4);
    }
}

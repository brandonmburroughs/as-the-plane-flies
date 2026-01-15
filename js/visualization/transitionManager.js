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
        const renderer = this.renderer;

        // Update geoPositions with new coordinates for rendering
        renderer.geoPositions.forEach((pos, i) => {
            if (targetPositions[i]) {
                pos.x = targetPositions[i].x;
                pos.y = targetPositions[i].y;
            }
        });

        // Calculate label offsets for new positions
        const labelOffsets = renderer.calculateLabelOffsets();

        // Get origin index for stagger effect (origin moves first, then outward)
        const originIdx = renderer.getOriginIndex();
        const originPos = originIdx >= 0 ? renderer.geoPositions[originIdx] : null;

        // Animate airport circles with stagger based on distance from origin
        renderer.airportsLayer.selectAll('.airport')
            .data(renderer.geoPositions, d => d.code)
            .transition()
            .delay((d, i) => {
                if (!originPos || d.code === renderer.selectedOrigin) return 0;
                // Stagger based on original distance from origin (before transition)
                const dist = Math.hypot(d.geoX - originPos.geoX, d.geoY - originPos.geoY);
                return Math.min(dist * 0.3, 200); // Max 200ms delay
            })
            .duration(duration)
            .ease(ease)
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);

        // Animate labels with same stagger
        renderer.labelsLayer.selectAll('.airport-label')
            .data(renderer.geoPositions, d => d.code)
            .transition()
            .delay((d, i) => {
                if (!originPos || d.code === renderer.selectedOrigin) return 50;
                const dist = Math.hypot(d.geoX - originPos.geoX, d.geoY - originPos.geoY);
                return Math.min(dist * 0.3, 200) + 50;
            })
            .duration(duration)
            .ease(ease)
            .attr('x', d => d.x + (labelOffsets[d.code]?.x || 10))
            .attr('y', d => d.y + (labelOffsets[d.code]?.y || 4));

        // Mark transition complete
        setTimeout(() => {
            this.isTransitioning = false;
            if (onComplete) onComplete();
        }, duration + 300);
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

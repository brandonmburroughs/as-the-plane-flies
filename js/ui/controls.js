/**
 * UI Controls Module
 *
 * Handles all user interface interactions including:
 * - Origin airport selector
 * - View mode toggle (Geographic / Flight Time)
 * - Visual style toggle (Points / Map Distortion)
 * - Airport count filter
 */

class Controls {
    constructor(renderer) {
        this.renderer = renderer;
        this.init();
    }

    /**
     * Initialize all controls
     */
    init() {
        this.populateOriginSelect();
        this.initModeToggles();
        this.initDirectOnlyToggle();
        this.initStyleToggles();
        this.initAirportFilter();
        this.initZoomControls();
    }

    /**
     * Populate the origin airport dropdown
     */
    populateOriginSelect() {
        const select = d3.select('#origin-select');

        // Group airports by hub size
        const grouped = d3.group(this.renderer.allAirports, d => d.hub);

        // Clear existing options (except placeholder)
        select.selectAll('optgroup').remove();

        // Add large hubs
        if (grouped.has('large')) {
            const group = select.append('optgroup').attr('label', 'Major Hubs');
            group.selectAll('option')
                .data(grouped.get('large'))
                .join('option')
                .attr('value', d => d.code)
                .text(d => `${d.code} - ${d.city}, ${d.state}`);
        }

        // Add medium hubs
        if (grouped.has('medium')) {
            const group = select.append('optgroup').attr('label', 'Medium Hubs');
            group.selectAll('option')
                .data(grouped.get('medium'))
                .join('option')
                .attr('value', d => d.code)
                .text(d => `${d.code} - ${d.city}, ${d.state}`);
        }

        // Add small hubs
        if (grouped.has('small')) {
            const group = select.append('optgroup').attr('label', 'Small Hubs');
            group.selectAll('option')
                .data(grouped.get('small'))
                .join('option')
                .attr('value', d => d.code)
                .text(d => `${d.code} - ${d.city}, ${d.state}`);
        }

        // Handle selection change
        select.on('change', (event) => {
            const code = event.target.value;
            if (code) {
                this.renderer.setOrigin(code);
            }
        });
    }

    /**
     * Initialize view mode toggle buttons
     */
    initModeToggles() {
        const btnDistance = d3.select('#btn-distance');
        const btnFlightTime = d3.select('#btn-flight-time');

        btnDistance.on('click', () => {
            this.setActiveButton(btnDistance, btnFlightTime);
            this.renderer.setMode('geographic');
        });

        btnFlightTime.on('click', () => {
            if (!this.renderer.selectedOrigin) {
                this.showMessage('Please select a starting city first');
                return;
            }
            this.setActiveButton(btnFlightTime, btnDistance);
            this.renderer.setMode('flightTime');
        });
    }

    /**
     * Initialize Direct Only toggle switch
     */
    initDirectOnlyToggle() {
        const toggle = d3.select('#direct-only-toggle');

        toggle.on('change', () => {
            if (!this.renderer.selectedOrigin) {
                this.showMessage('Please select a starting city first');
                toggle.property('checked', false);
                return;
            }
            this.renderer.toggleDirectOnly();
        });
    }

    /**
     * Initialize visual style toggle buttons
     */
    initStyleToggles() {
        const btnPoints = d3.select('#btn-points');
        const btnRubber = d3.select('#btn-rubber');

        btnPoints.on('click', () => {
            this.setActiveButton(btnPoints, btnRubber);
            this.renderer.setVisualStyle('points');
        });

        btnRubber.on('click', () => {
            this.setActiveButton(btnRubber, btnPoints);
            this.renderer.setVisualStyle('rubberSheet');
        });
    }

    /**
     * Initialize airport filter dropdown
     */
    initAirportFilter() {
        const select = d3.select('#airport-filter');

        select.on('change', (event) => {
            const count = parseInt(event.target.value, 10);
            this.renderer.applyAirportFilter(count);
            this.renderer.render();

            // Re-populate origin select with filtered airports
            this.updateOriginSelectForFilter(count);

            // If current origin is no longer visible, clear it
            if (this.renderer.selectedOrigin) {
                const stillVisible = this.renderer.airports.some(
                    a => a.code === this.renderer.selectedOrigin
                );
                if (!stillVisible) {
                    this.renderer.selectedOrigin = null;
                    d3.select('#origin-select').property('value', '');
                    this.renderer.setMode('geographic');
                    d3.select('#btn-distance').classed('active', true);
                    d3.select('#btn-flight-time').classed('active', false);
                }
            }

            // Re-render if in flight time mode
            if (this.renderer.currentMode === 'flightTime' && this.renderer.selectedOrigin) {
                this.renderer.updateFlightTimeView();
            }
        });
    }

    /**
     * Update origin select to show which airports are currently visible
     */
    updateOriginSelectForFilter(count) {
        const visibleCodes = new Set(
            this.renderer.allAirports.slice(0, count).map(a => a.code)
        );

        d3.select('#origin-select').selectAll('option')
            .style('color', function() {
                const code = d3.select(this).attr('value');
                return visibleCodes.has(code) ? null : '#666';
            });
    }

    /**
     * Set active state on toggle buttons
     */
    setActiveButton(activeBtn, inactiveBtn) {
        activeBtn.classed('active', true);
        inactiveBtn.classed('active', false);
    }

    /**
     * Initialize zoom control buttons
     */
    initZoomControls() {
        d3.select('#btn-reset-zoom').on('click', () => {
            this.renderer.fitToAirports();
        });
    }

    /**
     * Show a temporary message to the user
     */
    showMessage(text) {
        // Remove any existing message
        d3.select('.temp-message').remove();

        const message = d3.select('body').append('div')
            .attr('class', 'temp-message')
            .style('position', 'fixed')
            .style('top', '50%')
            .style('left', '50%')
            .style('transform', 'translate(-50%, -50%)')
            .style('background', 'rgba(15, 52, 96, 0.95)')
            .style('border', '1px solid #e94560')
            .style('border-radius', '8px')
            .style('padding', '1rem 2rem')
            .style('color', '#fff')
            .style('z-index', '1001')
            .text(text);

        // Auto-remove after 2 seconds
        setTimeout(() => {
            message.transition()
                .duration(300)
                .style('opacity', 0)
                .remove();
        }, 2000);
    }
}

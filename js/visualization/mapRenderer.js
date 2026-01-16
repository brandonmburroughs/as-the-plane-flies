/**
 * Map Renderer Module
 *
 * Main orchestrator for the visualization. Handles:
 * - SVG setup and layer management
 * - Data loading and projection
 * - Coordinating between modes (geographic, flight time)
 * - Coordinating between visual styles (points, rubber-sheet)
 */

class MapRenderer {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = d3.select(`#${containerId}`);

        // Dimensions
        this.width = CONFIG.width;
        this.height = CONFIG.height;

        // Map projection
        this.projection = d3.geoAlbersUsa()
            .scale(1300)
            .translate([this.width / 2, this.height / 2]);
        this.pathGenerator = d3.geoPath().projection(this.projection);

        // State
        this.currentMode = CONFIG.defaults.mode;
        this.visualStyle = CONFIG.defaults.visualStyle;
        this.selectedOrigin = null;
        this.airportFilter = CONFIG.defaults.airportCount;

        // Data
        this.usMap = null;
        this.allAirports = [];
        this.airports = [];
        this.matrixData = null;
        this.geoPositions = [];
        this.currentPositions = [];

        // Layers
        this.svg = null;
        this.mainGroup = null; // Container for all zoomable content
        this.mapLayer = null;
        this.ghostLayer = null;
        this.meshLayer = null;
        this.connectionsLayer = null;
        this.airportsLayer = null;
        this.labelsLayer = null;

        // Zoom behavior
        this.zoom = null;
        this.currentTransform = d3.zoomIdentity;

        // Submodules
        this.pointsMode = null;
        this.rubberSheetMode = null;
        this.transitionManager = null;

        // Color scale for travel times
        this.timeColorScale = d3.scaleSequential(d3.interpolateYlOrRd)
            .domain([CONFIG.timeScale.min, CONFIG.timeScale.max]);
    }

    /**
     * Initialize the visualization
     */
    async init() {
        this.showLoading();

        try {
            await this.loadData();
            this.initSVG();
            this.initSubmodules();
            this.render();

            // Render ghost states if rubberSheet is the default
            if (this.visualStyle === 'rubberSheet') {
                this.renderGhostStates();
            }

            this.hideLoading();
        } catch (error) {
            console.error('Failed to initialize map:', error);
            this.showError('Failed to load map data');
        }
    }

    /**
     * Load all required data
     */
    async loadData() {
        const { usMap, airports, matrixData } = await DataLoader.loadAll();

        this.usMap = usMap;
        this.allAirports = airports;
        this.matrixData = matrixData;

        // Apply initial filter
        this.applyAirportFilter(this.airportFilter);
    }

    /**
     * Apply airport filter (top N airports)
     */
    applyAirportFilter(count) {
        this.airportFilter = count;
        this.airports = this.allAirports.slice(0, count);

        // Calculate geographic positions
        this.geoPositions = this.airports.map(airport => {
            const projected = this.projection([airport.lon, airport.lat]);
            if (projected) {
                return {
                    x: projected[0],
                    y: projected[1],
                    geoX: projected[0],
                    geoY: projected[1],
                    ...airport
                };
            }
            // Handle airports outside continental US (HNL, ANC, SJU)
            return {
                x: this.width / 2,
                y: this.height / 2,
                geoX: this.width / 2,
                geoY: this.height / 2,
                outsideProjection: true,
                ...airport
            };
        });

        // Initialize current positions to geographic
        this.currentPositions = this.geoPositions.map(p => ({ x: p.x, y: p.y }));
    }

    /**
     * Initialize SVG and layers
     */
    initSVG() {
        const self = this;

        // Clear any existing SVG
        this.container.selectAll('svg').remove();

        this.svg = this.container.append('svg')
            .attr('width', this.width)
            .attr('height', this.height)
            .attr('viewBox', `0 0 ${this.width} ${this.height}`)
            .style('background', CONFIG.colors.background);

        // Create zoom behavior
        this.zoom = d3.zoom()
            .scaleExtent([0.5, 8])
            .on('zoom', (event) => {
                self.currentTransform = event.transform;
                self.mainGroup.attr('transform', event.transform);
            });

        // Apply zoom to SVG
        this.svg.call(this.zoom);

        // Create main group for all zoomable content
        this.mainGroup = this.svg.append('g').attr('class', 'main-group');

        // Create layers inside main group (bottom to top)
        this.ghostLayer = this.mainGroup.append('g').attr('class', 'ghost-layer');
        this.mapLayer = this.mainGroup.append('g').attr('class', 'map-layer');
        this.meshLayer = this.mainGroup.append('g').attr('class', 'mesh-layer');
        this.connectionsLayer = this.mainGroup.append('g').attr('class', 'connections-layer');
        this.hoverLineLayer = this.mainGroup.append('g').attr('class', 'hover-line-layer');
        this.airportsLayer = this.mainGroup.append('g').attr('class', 'airports-layer');
        this.labelsLayer = this.mainGroup.append('g').attr('class', 'labels-layer');
    }

    /**
     * Initialize submodules
     */
    initSubmodules() {
        this.pointsMode = new PointsMode(this);
        this.rubberSheetMode = new RubberSheetMode(this);
        this.transitionManager = new TransitionManager(this);
    }

    /**
     * Main render function
     */
    render() {
        this.renderStates();
        this.renderAirports();
        this.renderLabels();
    }

    /**
     * Render US state boundaries
     */
    renderStates() {
        const states = topojson.feature(this.usMap, this.usMap.objects.states);
        // Filter out Alaska (02), Hawaii (15), and Puerto Rico (72)
        const excludedFips = ['02', '15', '72'];
        const filteredStates = states.features.filter(
            f => !excludedFips.includes(f.id)
        );

        this.mapLayer.selectAll('.state')
            .data(filteredStates)
            .join('path')
            .attr('class', 'state')
            .attr('d', this.pathGenerator);
    }

    /**
     * Render ghost (reference) state boundaries for rubber-sheet mode
     */
    renderGhostStates() {
        const states = topojson.feature(this.usMap, this.usMap.objects.states);
        // Filter out Alaska (02), Hawaii (15), and Puerto Rico (72)
        const excludedFips = ['02', '15', '72'];
        const filteredStates = states.features.filter(
            f => !excludedFips.includes(f.id)
        );

        this.ghostLayer.selectAll('.state-ghost')
            .data(filteredStates)
            .join('path')
            .attr('class', 'state-ghost')
            .attr('d', this.pathGenerator);
    }

    /**
     * Hide ghost states
     */
    hideGhostStates() {
        this.ghostLayer.selectAll('.state-ghost').remove();
    }

    /**
     * Render airport dots
     */
    renderAirports() {
        const self = this;

        const airports = this.airportsLayer.selectAll('.airport')
            .data(this.geoPositions, d => d.code);

        airports.exit().remove();

        airports.enter()
            .append('circle')
            .attr('class', 'airport')
            .attr('r', d => CONFIG.airportRadius[d.hub] || 5)
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .on('click', function(event, d) {
                // Toggle: click again to deselect
                if (self.selectedOrigin === d.code) {
                    self.clearOrigin();
                } else {
                    self.setOrigin(d.code);
                }
            })
            .on('mouseenter', function(event, d) {
                self.showTooltip(event, d);
                d3.select(this).attr('r', CONFIG.airportRadiusHover);
                // Show label on hover for non-always-visible labels
                self.labelsLayer.selectAll('.airport-label')
                    .filter(l => l.code === d.code)
                    .classed('hover-visible', true);
                // Show curved line from origin to hovered airport
                if (self.selectedOrigin && d.code !== self.selectedOrigin) {
                    self.showHoverLine(d);
                }
            })
            .on('mouseleave', function(event, d) {
                self.hideTooltip();
                d3.select(this).attr('r', CONFIG.airportRadius[d.hub] || 5);
                // Hide label when not hovering
                self.labelsLayer.selectAll('.airport-label')
                    .filter(l => l.code === d.code)
                    .classed('hover-visible', false);
                // Hide curved line
                self.hideHoverLine();
            })
            .merge(airports)
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
            .classed('origin', d => d.code === this.selectedOrigin);

        this.updateAirportColors();
    }

    /**
     * Update airport colors based on travel time from origin
     * Direct flights: solid fill with travel time color
     * Connections: ring (white fill, colored stroke)
     */
    updateAirportColors() {
        if (!this.selectedOrigin) {
            this.airportsLayer.selectAll('.airport')
                .style('fill', null)
                .style('stroke', null)
                .style('stroke-width', null)
                .classed('origin', false)
                .classed('direct', false)
                .classed('connection', false);
            return;
        }

        const self = this;

        this.airportsLayer.selectAll('.airport')
            .classed('origin', d => d.code === this.selectedOrigin)
            .classed('direct', d => {
                if (d.code === this.selectedOrigin) return false;
                return DataLoader.hasDirectFlight(this.selectedOrigin, d.code);
            })
            .classed('connection', d => {
                if (d.code === this.selectedOrigin) return false;
                return !DataLoader.hasDirectFlight(this.selectedOrigin, d.code);
            })
            .style('fill', d => {
                if (d.code === this.selectedOrigin) return CONFIG.colors.origin;
                const travelTime = DataLoader.getTravelTime(this.selectedOrigin, d.code);
                if (!travelTime) return CONFIG.colors.noRoute;
                const color = this.timeColorScale(travelTime);
                // Connections get white fill (ring style)
                if (!DataLoader.hasDirectFlight(this.selectedOrigin, d.code)) {
                    return '#ffffff';
                }
                return color;
            })
            .style('stroke', d => {
                if (d.code === this.selectedOrigin) return null;
                const travelTime = DataLoader.getTravelTime(this.selectedOrigin, d.code);
                if (!travelTime) return null;
                // Connections get colored stroke
                if (!DataLoader.hasDirectFlight(this.selectedOrigin, d.code)) {
                    return this.timeColorScale(travelTime);
                }
                return null;
            })
            .style('stroke-width', d => {
                if (d.code === this.selectedOrigin) return null;
                if (!DataLoader.hasDirectFlight(this.selectedOrigin, d.code)) {
                    return 2.5;
                }
                return null;
            });
    }

    /**
     * Render airport labels
     * - Origin airport: always visible
     * - Large hubs: always visible
     * - Others: visible on hover
     */
    renderLabels() {
        const self = this;

        // Calculate label offsets to avoid collisions
        const labelOffsets = this.calculateLabelOffsets();

        const labels = this.labelsLayer.selectAll('.airport-label')
            .data(this.geoPositions, d => d.code);

        labels.exit().remove();

        labels.enter()
            .append('text')
            .attr('class', d => {
                let classes = 'airport-label';
                if (d.hub === 'large') classes += ' large-hub';
                return classes;
            })
            .attr('x', d => d.x + (labelOffsets[d.code]?.x || 10))
            .attr('y', d => d.y + (labelOffsets[d.code]?.y || 4))
            .text(d => d.code)
            .merge(labels)
            .attr('x', d => d.x + (labelOffsets[d.code]?.x || 10))
            .attr('y', d => d.y + (labelOffsets[d.code]?.y || 4))
            .classed('origin-label', d => d.code === this.selectedOrigin)
            .classed('always-visible', d => d.hub === 'large' || d.code === this.selectedOrigin);
    }

    /**
     * Calculate label offsets to prevent overlapping
     * Uses a greedy algorithm to place labels in non-overlapping positions
     */
    calculateLabelOffsets() {
        const offsets = {};
        const labelWidth = 30;
        const labelHeight = 14;

        // Possible label positions relative to airport dot
        const positions = [
            { x: 10, y: 4 },    // Right (default)
            { x: -35, y: 4 },   // Left
            { x: 10, y: -10 },  // Top-right
            { x: 10, y: 18 },   // Bottom-right
            { x: -35, y: -10 }, // Top-left
            { x: -35, y: 18 },  // Bottom-left
            { x: -12, y: -12 }, // Top-center
            { x: -12, y: 20 },  // Bottom-center
        ];

        // Get always-visible labels (large hubs + origin)
        const visibleLabels = this.geoPositions.filter(
            p => p.hub === 'large' || p.code === this.selectedOrigin
        );

        const placedLabels = []; // Track placed label bounding boxes

        for (const airport of visibleLabels) {
            let bestPosition = positions[0];
            let minOverlap = Infinity;

            // Try each position and find the one with least overlap
            for (const pos of positions) {
                const rect = {
                    x: airport.x + pos.x,
                    y: airport.y + pos.y - labelHeight,
                    width: labelWidth,
                    height: labelHeight
                };

                // Calculate total overlap with placed labels
                let totalOverlap = 0;
                for (const placed of placedLabels) {
                    totalOverlap += this.calculateOverlap(rect, placed);
                }

                // Also check overlap with airport dots
                for (const other of this.geoPositions.slice(0, this.airportFilter)) {
                    const dotRect = {
                        x: other.x - 5,
                        y: other.y - 5,
                        width: 10,
                        height: 10
                    };
                    totalOverlap += this.calculateOverlap(rect, dotRect) * 0.5;
                }

                if (totalOverlap < minOverlap) {
                    minOverlap = totalOverlap;
                    bestPosition = pos;
                }
            }

            offsets[airport.code] = bestPosition;
            placedLabels.push({
                x: airport.x + bestPosition.x,
                y: airport.y + bestPosition.y - labelHeight,
                width: labelWidth,
                height: labelHeight
            });
        }

        return offsets;
    }

    /**
     * Calculate overlap area between two rectangles
     */
    calculateOverlap(rect1, rect2) {
        const xOverlap = Math.max(0,
            Math.min(rect1.x + rect1.width, rect2.x + rect2.width) -
            Math.max(rect1.x, rect2.x)
        );
        const yOverlap = Math.max(0,
            Math.min(rect1.y + rect1.height, rect2.y + rect2.height) -
            Math.max(rect1.y, rect2.y)
        );
        return xOverlap * yOverlap;
    }

    /**
     * Update label visibility (called when origin changes)
     */
    updateLabelVisibility() {
        this.labelsLayer.selectAll('.airport-label')
            .classed('origin-label', d => d.code === this.selectedOrigin)
            .classed('always-visible', d => d.hub === 'large' || d.code === this.selectedOrigin);
    }

    /**
     * Set the origin airport
     */
    setOrigin(airportCode) {
        this.selectedOrigin = airportCode;

        // Update dropdown
        d3.select('#origin-select').property('value', airportCode);

        // Update URL for sharing
        if (typeof updateURL === 'function') {
            updateURL(airportCode);
        }

        // Update airport colors
        this.updateAirportColors();

        // Update label visibility
        this.updateLabelVisibility();

        // Update legend
        if (window.legend) {
            const times = DataLoader.getMatrixRow(airportCode);
            window.legend.updateForOrigin(airportCode, times, this.geoPositions);
        }

        // If in flight-time mode, recalculate positions
        if (this.currentMode === 'flightTime') {
            this.updateFlightTimeView();
        }
    }

    /**
     * Clear the selected origin
     */
    clearOrigin() {
        this.selectedOrigin = null;

        // Reset dropdown
        d3.select('#origin-select').property('value', '');

        // Update URL for sharing
        if (typeof updateURL === 'function') {
            updateURL(null);
        }

        // Reset airport colors
        this.updateAirportColors();

        // Update labels
        this.renderLabels();

        // Clear legend
        if (window.legend) {
            window.legend.clearTimeScale();
        }

        // If in flight-time mode, switch back to geographic
        if (this.currentMode === 'flightTime') {
            this.currentMode = 'geographic';
            d3.select('#btn-distance').classed('active', true);
            d3.select('#btn-flight-time').classed('active', false);
            this.transitionToGeographic();
        }
    }

    /**
     * Set the view mode (geographic or flightTime)
     */
    setMode(mode) {
        if (mode === this.currentMode) return;

        this.currentMode = mode;

        if (mode === 'geographic') {
            this.transitionToGeographic();
        } else if (mode === 'flightTime') {
            if (!this.selectedOrigin) {
                alert('Please select a starting city first');
                this.currentMode = 'geographic';
                d3.select('#btn-distance').classed('active', true);
                d3.select('#btn-flight-time').classed('active', false);
                return;
            }
            this.updateFlightTimeView();
        }
    }

    /**
     * Set the visual style (points or rubberSheet)
     * - points: Only airport dots move, states stay fixed
     * - rubberSheet: Both airports and states morph together, with ghost overlay
     */
    setVisualStyle(style) {
        if (style === this.visualStyle) return;

        const previousStyle = this.visualStyle;
        this.visualStyle = style;

        if (style === 'rubberSheet') {
            // Show ghost reference of original map
            this.renderGhostStates();

            if (this.currentMode === 'flightTime') {
                // Switching to Map Distortion - morph the states
                this.rubberSheetMode.activate();
                this.rubberSheetMode.update();
            }
        } else {
            // Hide ghost overlay
            this.hideGhostStates();

            if (this.currentMode === 'flightTime') {
                // Switching to Points Only - restore states to geographic
                this.rubberSheetMode.deactivate();
            }
        }
    }

    /**
     * Transition to geographic view
     */
    transitionToGeographic() {
        const targetPositions = this.geoPositions.map(p => ({
            x: p.geoX,
            y: p.geoY
        }));

        this.transitionManager.transition(targetPositions, () => {
            this.currentPositions = targetPositions;
        });

        // If in Map Distortion mode, restore states to geographic
        if (this.visualStyle === 'rubberSheet') {
            this.rubberSheetMode.transitionToGeographic();
        }
    }

    /**
     * Update flight time view positions
     */
    updateFlightTimeView() {
        if (!this.selectedOrigin) return;

        if (this.visualStyle === 'points') {
            this.pointsMode.update();
        } else {
            this.rubberSheetMode.update();
        }
    }

    /**
     * Show tooltip
     */
    showTooltip(event, airport) {
        const tooltip = d3.select('#tooltip');

        let content = `<strong>${airport.name}</strong><br>`;
        content += `${airport.city}, ${airport.state} (${airport.code})`;

        if (this.selectedOrigin && airport.code !== this.selectedOrigin) {
            const travelTime = DataLoader.getTravelTime(this.selectedOrigin, airport.code);
            const isDirect = DataLoader.hasDirectFlight(this.selectedOrigin, airport.code);

            if (travelTime) {
                const hours = Math.floor(travelTime / 60);
                const mins = Math.round(travelTime % 60);
                content += `<div class="travel-time">`;
                content += `From ${this.selectedOrigin}: ${hours}h ${mins}m`;
                content += isDirect ? ' (direct)' : ' (connection)';
                content += `</div>`;
            }
        }

        // Set content first to measure size
        tooltip.html(content).classed('hidden', false);

        // Get tooltip dimensions
        const tooltipNode = tooltip.node();
        const tooltipWidth = tooltipNode.offsetWidth;
        const tooltipHeight = tooltipNode.offsetHeight;

        // Calculate position with edge detection
        const padding = 15;
        let left = event.pageX + padding;
        let top = event.pageY - 10;

        // Flip horizontally if too close to right edge
        if (left + tooltipWidth > window.innerWidth - padding) {
            left = event.pageX - tooltipWidth - padding;
        }

        // Flip vertically if too close to bottom edge
        if (top + tooltipHeight > window.innerHeight - padding) {
            top = event.pageY - tooltipHeight - padding;
        }

        // Ensure not off top or left edge
        left = Math.max(padding, left);
        top = Math.max(padding, top);

        tooltip
            .style('left', left + 'px')
            .style('top', top + 'px');
    }

    /**
     * Hide tooltip
     */
    hideTooltip() {
        d3.select('#tooltip').classed('hidden', true);
    }

    /**
     * Show curved dotted line from origin to hovered airport
     */
    showHoverLine(targetAirport) {
        // Get origin airport position
        const originData = this.geoPositions.find(p => p.code === this.selectedOrigin);
        if (!originData) return;

        // Get current positions (may be transformed in flight time mode)
        const originPos = this.currentPositions[this.geoPositions.indexOf(originData)] || originData;
        const targetPos = this.currentPositions[this.geoPositions.indexOf(targetAirport)] || targetAirport;

        // Calculate control point for quadratic bezier curve
        // Offset perpendicular to the line for a nice arc
        const midX = (originPos.x + targetPos.x) / 2;
        const midY = (originPos.y + targetPos.y) / 2;

        // Calculate perpendicular offset
        const dx = targetPos.x - originPos.x;
        const dy = targetPos.y - originPos.y;
        const dist = Math.hypot(dx, dy);

        // Curve amount proportional to distance (but capped)
        const curveAmount = Math.min(dist * 0.2, 50);

        // Perpendicular direction (rotate 90 degrees)
        let perpX = dy / dist * curveAmount;
        let perpY = -dx / dist * curveAmount;

        // Ensure curve is always on top (negative Y in screen coordinates)
        if (perpY > 0) {
            perpX = -perpX;
            perpY = -perpY;
        }

        // Control point
        const ctrlX = midX + perpX;
        const ctrlY = midY + perpY;

        // Create curved path
        const pathData = `M ${originPos.x} ${originPos.y} Q ${ctrlX} ${ctrlY} ${targetPos.x} ${targetPos.y}`;

        // Remove existing line and add new one
        this.hoverLineLayer.selectAll('.hover-line').remove();

        this.hoverLineLayer.append('path')
            .attr('class', 'hover-line')
            .attr('d', pathData)
            .style('fill', 'none')
            .style('stroke', CONFIG.colors.origin)
            .style('stroke-width', 2)
            .style('stroke-dasharray', '6, 4')
            .style('opacity', 0.7);
    }

    /**
     * Hide the hover connection line
     */
    hideHoverLine() {
        this.hoverLineLayer.selectAll('.hover-line').remove();
    }

    /**
     * Show loading indicator
     */
    showLoading() {
        this.container.append('div')
            .attr('class', 'loading')
            .text('Loading');
    }

    /**
     * Hide loading indicator
     */
    hideLoading() {
        this.container.selectAll('.loading').remove();
    }

    /**
     * Show error message
     */
    showError(message) {
        this.container.selectAll('.loading').remove();
        this.container.append('div')
            .attr('class', 'error')
            .text(message);
    }

    /**
     * Get the travel time matrix for currently visible airports
     */
    getCurrentMatrix() {
        const codes = this.airports.map(a => a.code);
        return DataLoader.getSubMatrix(codes);
    }

    /**
     * Get origin index in current airports list
     */
    getOriginIndex() {
        return this.airports.findIndex(a => a.code === this.selectedOrigin);
    }

    /**
     * Reset zoom to default view
     */
    resetZoom() {
        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, d3.zoomIdentity);
    }

    /**
     * Fit view to show all airports
     */
    fitToAirports() {
        if (this.geoPositions.length === 0) return;

        // Calculate bounding box of all airport positions
        const xValues = this.geoPositions.map(p => p.x);
        const yValues = this.geoPositions.map(p => p.y);

        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);

        const padding = 50;
        const boxWidth = maxX - minX + padding * 2;
        const boxHeight = maxY - minY + padding * 2;

        const scale = Math.min(
            this.width / boxWidth,
            this.height / boxHeight,
            2 // Max scale
        );

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const transform = d3.zoomIdentity
            .translate(this.width / 2, this.height / 2)
            .scale(scale)
            .translate(-centerX, -centerY);

        this.svg.transition()
            .duration(750)
            .call(this.zoom.transform, transform);
    }
}

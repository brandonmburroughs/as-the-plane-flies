/**
 * Legend Module
 *
 * Renders the map legend showing:
 * - Airport type indicators
 * - Travel time color scale
 */

class Legend {
    constructor(containerId) {
        this.container = d3.select(`#${containerId}`);
        this.render();
    }

    /**
     * Render the legend
     */
    render() {
        this.container.html('');

        this.container.append('h4').text('Legend');

        // Airport type indicators
        const items = [
            { class: 'origin', label: 'Selected Origin' },
            { class: 'direct-example', label: 'Direct Flight' },
            { class: 'connection-example', label: 'Connection Required' }
        ];

        items.forEach(item => {
            const row = this.container.append('div').attr('class', 'legend-item');
            row.append('span').attr('class', `legend-dot ${item.class}`);
            row.append('span').text(item.label);
        });

        // Time scale container (will be populated when origin is selected)
        this.container.append('div').attr('id', 'time-scale');
    }

    /**
     * Update legend to show travel time scale from selected origin
     * @param {string} originCode - Selected origin airport code
     * @param {number[]} travelTimes - Array of travel times from origin
     * @param {Object[]} geoPositions - Airport positions for geographic distance calc
     */
    updateForOrigin(originCode, travelTimes, geoPositions) {
        const scaleContainer = this.container.select('#time-scale');
        scaleContainer.html('');

        if (!originCode || !travelTimes || travelTimes.length === 0) return;

        // Filter out the origin (0 time) and find max
        const validTimes = travelTimes.filter(t => t > 0 && isFinite(t));
        if (validTimes.length === 0) return;

        const maxTime = Math.min(d3.max(validTimes), CONFIG.timeScale.max);

        // Count direct vs connection flights using the matrix airport codes
        const matrixAirports = DataLoader.cache.matrix?.airports || [];
        let directCount = 0;
        let connectionCount = 0;

        travelTimes.forEach((time, i) => {
            if (time > 0 && isFinite(time) && i < matrixAirports.length) {
                const destCode = matrixAirports[i];
                if (DataLoader.hasDirectFlight(originCode, destCode)) {
                    directCount++;
                } else {
                    connectionCount++;
                }
            }
        });

        // Find closest by flight time vs closest geographically
        const closestInfo = this.findClosestComparison(originCode, travelTimes, geoPositions);

        // Origin title
        scaleContainer.append('div')
            .style('font-size', '0.95rem')
            .style('font-weight', '600')
            .style('color', '#333')
            .style('margin-bottom', '0.25rem')
            .text(`From ${originCode}`);

        // Flight stats
        scaleContainer.append('div')
            .style('font-size', '0.8rem')
            .style('color', '#666')
            .style('margin-bottom', '0.75rem')
            .html(`<span style="color: #2a9d8f">${directCount} direct</span> · <span style="color: #e9c46a">${connectionCount} connections</span>`);

        // Closest comparison insight (only show if they're different)
        if (closestInfo && closestInfo.closestByFlight !== closestInfo.closestByGeo) {
            const insightDiv = scaleContainer.append('div')
                .style('font-size', '0.8rem')
                .style('color', '#555')
                .style('margin-bottom', '0.75rem')
                .style('padding', '0.5rem')
                .style('background', '#f0f7ff')
                .style('border-radius', '4px')
                .style('line-height', '1.4');

            insightDiv.html(
                `<strong>Closest by air:</strong> ${closestInfo.closestByFlight} (${closestInfo.flightTime})<br>` +
                `<strong>Closest on map:</strong> ${closestInfo.closestByGeo} (${closestInfo.geoFlightTime})`
            );
        }

        // Travel time label
        scaleContainer.append('div')
            .style('font-size', '0.75rem')
            .style('color', '#888')
            .style('margin-bottom', '0.35rem')
            .text('Travel time');

        // Create gradient bar
        const width = 180;
        const height = 12;

        const svg = scaleContainer.append('svg')
            .attr('width', width)
            .attr('height', height + 18);

        // Gradient definition
        const defs = svg.append('defs');
        const gradient = defs.append('linearGradient')
            .attr('id', 'time-gradient');

        // Use same color scale as airports (YlOrRd)
        const colorScale = d3.scaleSequential(d3.interpolateYlOrRd)
            .domain([0, maxTime]);

        for (let i = 0; i <= 10; i++) {
            gradient.append('stop')
                .attr('offset', `${i * 10}%`)
                .attr('stop-color', colorScale(maxTime * (i / 10)));
        }

        // Gradient rectangle
        svg.append('rect')
            .attr('width', width)
            .attr('height', height)
            .attr('rx', 2)
            .attr('fill', 'url(#time-gradient)');

        // Labels
        svg.append('text')
            .attr('x', 0)
            .attr('y', height + 12)
            .attr('font-size', '10px')
            .attr('fill', '#888')
            .text('0h');

        const maxHours = Math.ceil(maxTime / 60);
        svg.append('text')
            .attr('x', width)
            .attr('y', height + 12)
            .attr('text-anchor', 'end')
            .attr('font-size', '10px')
            .attr('fill', '#888')
            .text(`${maxHours}h`);

        // Middle label
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', height + 12)
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#888')
            .text(`${Math.round(maxHours / 2)}h`);
    }

    /**
     * Clear the travel time scale
     */
    clearTimeScale() {
        this.container.select('#time-scale').html('');
    }

    /**
     * Find closest airport by flight time vs geographic distance
     * @param {string} originCode - Origin airport code
     * @param {number[]} travelTimes - Array of travel times
     * @param {Object[]} geoPositions - Airport geo positions
     * @returns {Object|null} Comparison info or null if not enough data
     */
    findClosestComparison(originCode, travelTimes, geoPositions) {
        if (!geoPositions || geoPositions.length === 0) return null;

        const matrixAirports = DataLoader.cache.matrix?.airports || [];
        const originGeo = geoPositions.find(p => p.code === originCode);
        if (!originGeo) return null;

        let closestByFlight = null;
        let minFlightTime = Infinity;

        let closestByGeo = null;
        let minGeoDist = Infinity;

        // Find closest by flight time and by geographic distance
        travelTimes.forEach((time, i) => {
            if (i >= matrixAirports.length) return;
            const destCode = matrixAirports[i];
            if (destCode === originCode) return;

            const destGeo = geoPositions.find(p => p.code === destCode);
            if (!destGeo) return;

            // Check flight time
            if (time > 0 && isFinite(time) && time < minFlightTime) {
                minFlightTime = time;
                closestByFlight = destCode;
            }

            // Check geographic distance (using screen coordinates from projection)
            const geoDist = Math.hypot(destGeo.geoX - originGeo.geoX, destGeo.geoY - originGeo.geoY);
            if (geoDist > 0 && geoDist < minGeoDist) {
                minGeoDist = geoDist;
                closestByGeo = destCode;
            }
        });

        if (!closestByFlight || !closestByGeo) return null;

        // Format flight times
        const formatTime = (mins) => {
            const h = Math.floor(mins / 60);
            const m = Math.round(mins % 60);
            return `${h}h ${m}m`;
        };

        // Get flight time to the geographically closest airport
        const geoClosestIdx = matrixAirports.indexOf(closestByGeo);
        const geoFlightTime = geoClosestIdx >= 0 ? travelTimes[geoClosestIdx] : null;

        return {
            closestByFlight,
            closestByGeo,
            flightTime: formatTime(minFlightTime),
            geoFlightTime: geoFlightTime ? formatTime(geoFlightTime) : 'N/A'
        };
    }
}

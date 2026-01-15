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

        // Airport indicators
        const items = [
            { class: 'origin', label: 'Selected Origin' },
            { class: 'direct', label: 'Direct Flight' },
            { class: 'connection', label: 'Connection Required' }
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
     */
    updateForOrigin(originCode, travelTimes) {
        const scaleContainer = this.container.select('#time-scale');
        scaleContainer.html('');

        if (!originCode || !travelTimes || travelTimes.length === 0) return;

        // Filter out the origin (0 time) and find max
        const validTimes = travelTimes.filter(t => t > 0 && isFinite(t));
        if (validTimes.length === 0) return;

        const maxTime = Math.min(d3.max(validTimes), CONFIG.timeScale.max);

        // Count direct vs connection flights
        const directCount = validTimes.filter((_, i) => {
            const codes = DataLoader.matrixData?.airports || [];
            if (i >= codes.length) return false;
            return DataLoader.hasDirectFlight(originCode, codes[i]);
        }).length;
        const connectionCount = validTimes.length - directCount;

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
}

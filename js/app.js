/**
 * Flight Time Map Application
 *
 * Main entry point that initializes all components.
 */

// Global references
let mapRenderer = null;
let controls = null;
let legend = null;

/**
 * Get URL parameters
 */
function getURLParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        origin: params.get('origin'),
        embed: params.get('embed') === 'true',
        waitForViewport: params.get('waitForViewport') === 'true',
        mode: params.get('mode'), // 'geographic' or 'flightTime'
        airports: params.get('airports') ? parseInt(params.get('airports'), 10) : null, // 32, 69, 150, 315
        directOnly: params.get('directOnly') === 'true'
    };
}

/**
 * Get origin from URL query parameter
 */
function getOriginFromURL() {
    return getURLParams().origin;
}

/**
 * Check if embed mode is enabled via URL parameter
 */
function isEmbedMode() {
    return getURLParams().embed;
}

/**
 * Check if we should wait for viewport visibility before morphing
 */
function shouldWaitForViewport() {
    return getURLParams().waitForViewport;
}

/**
 * Update URL with current state (without page reload)
 * Skip in embed mode to preserve iframe URL params
 */
function updateURL(key, value) {
    // Don't modify URL in embed mode
    if (isEmbedMode()) return;

    const url = new URL(window.location);

    if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, value);
    } else {
        url.searchParams.delete(key);
    }

    // Clean up default values to keep URL tidy
    if (key === 'mode' && value === 'geographic') url.searchParams.delete('mode');
    if (key === 'airports' && value === 150) url.searchParams.delete('airports');
    if (key === 'directOnly' && value === false) url.searchParams.delete('directOnly');

    window.history.replaceState({}, '', url);
}


/**
 * Initialize the application
 */
async function initApp() {
    console.log('Initializing Flight Time Map...');

    const embedMode = isEmbedMode();

    // Add embed mode class to body if enabled
    if (embedMode) {
        document.body.classList.add('embed-mode');
        // Also hide elements directly via JS for reliability
        const hideIds = ['origin-control', 'visual-style-control', 'airport-filter-control', 'view-controls'];
        hideIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const h1 = document.querySelector('.controls-panel h1');
        if (h1) h1.style.display = 'none';
        const helpText = document.querySelector('.help-text');
        if (helpText) helpText.style.display = 'none';
        console.log('Embed mode activated');
    }

    try {
        // Create the map renderer
        mapRenderer = new MapRenderer('visualization-container');
        mapRenderer.embedMode = embedMode; // Pass embed mode flag
        await mapRenderer.init();
        window.mapRenderer = mapRenderer; // Expose for external access

        // Initialize UI controls
        controls = new Controls(mapRenderer);

        // Initialize legend (hide in embed mode)
        if (!embedMode) {
            legend = new Legend('legend');
            window.legend = legend; // Make accessible to mapRenderer
            // Fit to airports on initial load
            mapRenderer.fitToAirports();
        } else {
            // Hide legend in embed mode
            const legendEl = document.getElementById('legend');
            if (legendEl) legendEl.style.display = 'none';
        }

        // Apply URL parameters in correct order
        const urlParams = getURLParams();

        // 1. Apply airport filter first (affects which airports are visible)
        if (urlParams.airports && [32, 69, 150, 315].includes(urlParams.airports)) {
            d3.select('#airport-filter').property('value', urlParams.airports);
            mapRenderer.applyAirportFilter(urlParams.airports);
            mapRenderer.render();
        }

        // 2. Set origin (must be after airport filter)
        if (urlParams.origin && mapRenderer.allAirports.some(a => a.code === urlParams.origin)) {
            mapRenderer.setOrigin(urlParams.origin);
        }

        // 3. Apply direct only (before mode change)
        if (urlParams.directOnly && mapRenderer.selectedOrigin) {
            mapRenderer.showDirectOnly = true;
            d3.select('#direct-only-toggle').property('checked', true);
            mapRenderer.updateAirportColors();
        }

        // 4. Apply view mode (requires origin to be set for flightTime)
        if (urlParams.mode === 'flightTime' && mapRenderer.selectedOrigin) {
            mapRenderer.setMode('flightTime');
            d3.select('#btn-distance').classed('active', false);
            d3.select('#btn-flight-time').classed('active', true);
        }

        // In embed mode, fit to airports and handle display
        if (embedMode) {
            const waitForViewport = shouldWaitForViewport();

            if (urlParams.origin) {
                // Add minimal legend for embed mode
                const originAirport = mapRenderer.allAirports.find(a => a.code === urlParams.origin);
                if (originAirport) {
                    const miniLegend = d3.select('body').append('div')
                        .attr('class', 'embed-legend')
                        .html(`
                            <div class="embed-legend-title">From ${originAirport.city}</div>
                            <div class="embed-legend-items">
                                <span class="embed-legend-item"><span class="dot direct"></span> Direct</span>
                                <span class="embed-legend-item"><span class="dot connection"></span> Connection</span>
                            </div>
                        `);
                }

                // Function to trigger the morph
                window.startMorph = function() {
                    if (mapRenderer.currentMode !== 'flightTime') {
                        mapRenderer.setMode('flightTime');
                        d3.select('#btn-distance').classed('active', false);
                        d3.select('#btn-flight-time').classed('active', true);
                        mapRenderer.showDirectOnly = true;
                        mapRenderer.updateAirportColors();
                    }
                };

                // If not waiting for viewport, morph immediately
                if (!waitForViewport) {
                    mapRenderer.setMode('flightTime');
                    d3.select('#btn-distance').classed('active', false);
                    d3.select('#btn-flight-time').classed('active', true);
                    mapRenderer.showDirectOnly = true;
                    mapRenderer.updateAirportColors();
                }

            } else {
                // No origin: hide view mode toggle entirely
                const viewModeControl = document.getElementById('view-mode-control');
                if (viewModeControl) viewModeControl.style.display = 'none';
            }

            // Add reset view button for embed mode
            const resetBtn = d3.select('body').append('button')
                .attr('class', 'embed-reset-btn')
                .text('Reset View')
                .on('click', () => {
                    mapRenderer.fitToAirports();
                });

            // Fit view after load/animation
            const delay = urlParams.origin ? 1600 : 500;
            setTimeout(() => {
                mapRenderer.fitToAirports();
            }, delay);
        }

        // Add keyboard shortcuts (not in embed mode)
        if (!embedMode) {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && mapRenderer.selectedOrigin) {
                    mapRenderer.clearOrigin();
                }
            });
        }

        console.log('Application initialized successfully');

    } catch (error) {
        console.error('Failed to initialize application:', error);
        document.getElementById('visualization-container').innerHTML =
            '<div class="error">Failed to load the visualization. Please refresh the page.</div>';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

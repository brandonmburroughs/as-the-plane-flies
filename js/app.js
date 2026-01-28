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
 * Get origin from URL query parameter
 */
function getOriginFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('origin');
}

/**
 * Check if embed mode is enabled via URL parameter
 */
function isEmbedMode() {
    const params = new URLSearchParams(window.location.search);
    return params.get('embed') === 'true';
}

/**
 * Check if we should wait for viewport visibility before morphing
 */
function shouldWaitForViewport() {
    const params = new URLSearchParams(window.location.search);
    return params.get('waitForViewport') === 'true';
}

/**
 * Update URL with current origin (without page reload)
 * Skip in embed mode to preserve iframe URL params
 */
function updateURL(originCode) {
    // Don't modify URL in embed mode
    if (isEmbedMode()) return;

    const url = new URL(window.location);
    if (originCode) {
        url.searchParams.set('origin', originCode);
    } else {
        url.searchParams.delete('origin');
    }
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

        // Check for origin in URL
        const urlOrigin = getOriginFromURL();
        if (urlOrigin && mapRenderer.allAirports.some(a => a.code === urlOrigin)) {
            mapRenderer.setOrigin(urlOrigin);
        }

        // In embed mode, fit to airports and handle display
        if (embedMode) {
            const waitForViewport = shouldWaitForViewport();

            if (urlOrigin) {
                // Add minimal legend for embed mode
                const originAirport = mapRenderer.allAirports.find(a => a.code === urlOrigin);
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
            const delay = urlOrigin ? 1600 : 500;
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

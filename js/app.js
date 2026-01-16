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
 * Update URL with current origin (without page reload)
 */
function updateURL(originCode) {
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

    try {
        // Create the map renderer
        mapRenderer = new MapRenderer('visualization-container');
        await mapRenderer.init();

        // Initialize UI controls
        controls = new Controls(mapRenderer);

        // Initialize legend
        legend = new Legend('legend');
        window.legend = legend; // Make accessible to mapRenderer

        // Check for origin in URL
        const urlOrigin = getOriginFromURL();
        if (urlOrigin && mapRenderer.allAirports.some(a => a.code === urlOrigin)) {
            mapRenderer.setOrigin(urlOrigin);
        }

        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mapRenderer.selectedOrigin) {
                mapRenderer.clearOrigin();
            }
        });

        console.log('Application initialized successfully');

    } catch (error) {
        console.error('Failed to initialize application:', error);
        document.getElementById('visualization-container').innerHTML =
            '<div class="error">Failed to load the visualization. Please refresh the page.</div>';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

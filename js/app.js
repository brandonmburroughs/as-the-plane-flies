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

        console.log('Application initialized successfully');

        // Set default origin for demo (optional)
        // mapRenderer.setOrigin('SFO');

    } catch (error) {
        console.error('Failed to initialize application:', error);
        document.getElementById('visualization-container').innerHTML =
            '<div class="error">Failed to load the visualization. Please refresh the page.</div>';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

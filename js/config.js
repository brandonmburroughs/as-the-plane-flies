/**
 * Configuration constants for the Flight Time Map visualization
 */

const CONFIG = {
    // Map dimensions
    width: 975,
    height: 610,

    // Animation settings
    transitionDuration: 1500,
    transitionEase: d3.easeCubicInOut,

    // Airport display settings
    airportRadius: {
        large: 7,
        medium: 5,
        small: 4
    },
    airportRadiusHover: 10,

    // Colors
    colors: {
        background: '#f8f9fa',
        statesFill: '#e8f4f8',
        statesStroke: '#b8d4e3',
        origin: '#e63946',
        direct: '#2a9d8f',
        connection: '#e9c46a',
        noRoute: '#adb5bd',
        text: '#333333',
        textMuted: '#666666'
    },

    // Travel time thresholds (minutes) for color scale
    timeScale: {
        min: 0,
        max: 600 // 10 hours
    },

    // Default filter settings
    defaults: {
        airportCount: 30,
        mode: 'geographic',
        visualStyle: 'rubberSheet'
    },

    // Data URLs
    dataUrls: {
        // Use unprojected TopoJSON so we can apply our own projection
        usMap: 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json',
        airports: 'data/airports.json',
        matrix: 'data/matrix.json'
    },

    // MDS settings
    mds: {
        // Scale factor for travel times before MDS (sqrt helps with outliers like HNL)
        timeScaleFactor: 0.7, // Use time^0.7 to compress large values
        // Padding from edge of viewport
        padding: 60
    },

    // Rubber-sheet mode settings
    rubberSheet: {
        // Grid spacing for interior mesh points
        gridSpacing: 40,
        // Boundary sampling interval
        boundarySampling: 25,
        // Interpolation power (higher = more local influence)
        interpolationPower: 2.5
    }
};

# Claude Code Instructions

## Testing
- Only run tests (`npm test`) when explicitly asked
- Don't automatically run tests after every change

## Project Overview
This is a D3.js visualization showing US airports with two view modes:
- **Geographic Distance**: Standard map view
- **Flight Time**: Airports reposition based on actual travel time from a selected origin

## Key Commands
```bash
npm run serve          # Start local server on port 3000
npm test               # Run Playwright tests
npm run data:process   # Process BTS CSV files from scripts/raw-data/
npm run data:simulate  # Regenerate simulated data
npm run data:restore   # Restore simulated data backup
```

## Data
- Real flight data from BTS (Bureau of Transportation Statistics)
- 10 months of on-time performance data (Jan-Oct 2025)
- Simulated backup available in `data/matrix-simulated.json`

## Key Files
- `js/visualization/mapRenderer.js` - Main orchestrator
- `js/algorithms/mds.js` - Radial distortion algorithm
- `js/visualization/rubberSheetMode.js` - Map distortion mode
- `data/matrix.json` - Travel time matrix (real BTS data)
- `data/airports.json` - Top 100 US airports

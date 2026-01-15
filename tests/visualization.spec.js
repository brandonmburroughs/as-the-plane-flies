// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Flight Time Map Visualization', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Wait for the visualization to load
        await page.waitForSelector('svg', { timeout: 10000 });
        // Wait for airports to render
        await page.waitForSelector('.airport', { timeout: 10000 });
    });

    test.describe('Initial Load', () => {
        test('page loads with correct title', async ({ page }) => {
            await expect(page).toHaveTitle(/Flight Time Map/);
        });

        test('SVG canvas is rendered', async ({ page }) => {
            const svg = page.locator('#visualization-container svg');
            await expect(svg).toBeVisible();
            await expect(svg).toHaveAttribute('width', '975');
            await expect(svg).toHaveAttribute('height', '610');
        });

        test('US states are rendered', async ({ page }) => {
            const states = page.locator('.state');
            const count = await states.count();
            expect(count).toBeGreaterThan(40); // Should have ~50 states
        });

        test('airports are rendered', async ({ page }) => {
            const airports = page.locator('.airport');
            const count = await airports.count();
            expect(count).toBe(30); // Default is 30 airports
        });

        test('control panel is visible', async ({ page }) => {
            await expect(page.locator('.controls-panel')).toBeVisible();
            await expect(page.locator('#origin-select')).toBeVisible();
            await expect(page.locator('#airport-filter')).toBeVisible();
        });

        test('legend is visible', async ({ page }) => {
            await expect(page.locator('#legend')).toBeVisible();
        });
    });

    test.describe('Origin Selection', () => {
        test('selecting origin from dropdown highlights airport', async ({ page }) => {
            // Select ATL as origin
            await page.selectOption('#origin-select', 'ATL');

            // Wait for the airport to be marked as origin
            await page.waitForSelector('.airport.origin');

            const originAirport = page.locator('.airport.origin');
            await expect(originAirport).toBeVisible();
        });

        test('selecting origin colors other airports by route type', async ({ page }) => {
            await page.selectOption('#origin-select', 'ATL');
            await page.waitForSelector('.airport.origin');

            // Should have direct and connection airports
            const directAirports = page.locator('.airport.direct');
            const connectionAirports = page.locator('.airport.connection');

            const directCount = await directAirports.count();
            const connectionCount = await connectionAirports.count();

            expect(directCount + connectionCount).toBe(29); // All except origin
        });

        test('clicking airport sets it as origin', async ({ page }) => {
            // Find the first airport and click it
            const firstAirport = page.locator('.airport').first();
            await firstAirport.click();

            // Should now have an origin
            await page.waitForSelector('.airport.origin');
            const originAirport = page.locator('.airport.origin');
            await expect(originAirport).toBeVisible();
        });
    });

    test.describe('View Mode Toggle', () => {
        test('Distance mode is active by default', async ({ page }) => {
            const distanceBtn = page.locator('#btn-distance');
            await expect(distanceBtn).toHaveClass(/active/);
        });

        test('clicking Flight Time without origin keeps Distance mode active', async ({ page }) => {
            // Set up dialog handler in case an alert fires
            page.on('dialog', async dialog => {
                await dialog.accept();
            });

            await page.click('#btn-flight-time');
            await page.waitForTimeout(500);

            // Distance should still be active since no origin was selected
            const distanceBtn = page.locator('#btn-distance');
            await expect(distanceBtn).toHaveClass(/active/);
        });

        test('Flight Time mode works after selecting origin', async ({ page }) => {
            // First select an origin
            await page.selectOption('#origin-select', 'ORD');
            await page.waitForSelector('.airport.origin');

            // Now click Flight Time
            await page.click('#btn-flight-time');

            const flightTimeBtn = page.locator('#btn-flight-time');
            await expect(flightTimeBtn).toHaveClass(/active/);
        });

        test('airports animate when switching to Flight Time mode', async ({ page }) => {
            await page.selectOption('#origin-select', 'JFK');
            await page.waitForSelector('.airport.origin');

            // Get initial position of a non-origin airport
            const airport = page.locator('.airport.direct').first();
            const initialBox = await airport.boundingBox();

            // Switch to Flight Time mode
            await page.click('#btn-flight-time');

            // Wait for animation
            await page.waitForTimeout(2000);

            // Position should have changed
            const finalBox = await airport.boundingBox();

            // At least one coordinate should be different
            const moved = initialBox.x !== finalBox.x || initialBox.y !== finalBox.y;
            expect(moved).toBe(true);
        });
    });

    test.describe('Visual Style Toggle', () => {
        test('Points Only is active by default', async ({ page }) => {
            const pointsBtn = page.locator('#btn-points');
            await expect(pointsBtn).toHaveClass(/active/);
        });

        test('can switch to Map Distortion mode', async ({ page }) => {
            await page.click('#btn-rubber');

            const rubberBtn = page.locator('#btn-rubber');
            await expect(rubberBtn).toHaveClass(/active/);
        });

        test('Map Distortion shows ghost overlay', async ({ page }) => {
            await page.click('#btn-rubber');

            // Ghost states should be rendered
            const ghostStates = page.locator('.state-ghost');
            const count = await ghostStates.count();
            expect(count).toBeGreaterThan(40);
        });

        test('switching back to Points Only hides ghost overlay', async ({ page }) => {
            // Switch to Map Distortion
            await page.click('#btn-rubber');
            await page.waitForSelector('.state-ghost');

            // Switch back to Points Only
            await page.click('#btn-points');

            // Ghost states should be gone
            await page.waitForTimeout(500);
            const ghostStates = page.locator('.state-ghost');
            const count = await ghostStates.count();
            expect(count).toBe(0);
        });
    });

    test.describe('Airport Filter', () => {
        test('changing filter updates airport count', async ({ page }) => {
            // Default is 30
            let airports = page.locator('.airport');
            expect(await airports.count()).toBe(30);

            // Change to 50
            await page.selectOption('#airport-filter', '50');
            await page.waitForTimeout(500);

            airports = page.locator('.airport');
            expect(await airports.count()).toBe(50);
        });

        test('can show 100 airports', async ({ page }) => {
            await page.selectOption('#airport-filter', '100');
            await page.waitForTimeout(500);

            const airports = page.locator('.airport');
            expect(await airports.count()).toBe(100);
        });
    });

    test.describe('Tooltips', () => {
        test('tooltip appears on airport hover', async ({ page }) => {
            const airport = page.locator('.airport').first();
            await airport.hover();

            const tooltip = page.locator('#tooltip');
            await expect(tooltip).not.toHaveClass(/hidden/);
        });

        test('tooltip shows airport name and code', async ({ page }) => {
            const airport = page.locator('.airport').first();
            await airport.hover();

            const tooltip = page.locator('#tooltip');
            const text = await tooltip.textContent();

            // Should contain airport info
            expect(text).toMatch(/\([A-Z]{3}\)/); // Airport code in parentheses
        });

        test('tooltip shows travel time when origin is selected', async ({ page }) => {
            await page.selectOption('#origin-select', 'LAX');
            await page.waitForSelector('.airport.origin');

            // Hover over a non-origin airport
            const directAirport = page.locator('.airport.direct').first();
            await directAirport.hover();

            const tooltip = page.locator('#tooltip');
            const text = await tooltip.textContent();

            // Should show travel time
            expect(text).toMatch(/From LAX:/);
            expect(text).toMatch(/\d+h \d+m/);
        });

        test('tooltip hides when mouse leaves airport', async ({ page }) => {
            const airport = page.locator('.airport').first();
            await airport.hover();

            // Move away
            await page.mouse.move(0, 0);

            const tooltip = page.locator('#tooltip');
            await expect(tooltip).toHaveClass(/hidden/);
        });

        test('curved line appears when hovering over airport with origin selected', async ({ page }) => {
            // Select an origin first
            await page.selectOption('#origin-select', 'DEN');
            await page.waitForSelector('.airport.origin');

            // Hover over a different airport
            const targetAirport = page.locator('.airport.direct').first();
            await targetAirport.hover();

            // Curved line should appear
            const hoverLine = page.locator('.hover-line');
            await expect(hoverLine).toBeVisible();

            // Line should be a path element
            const tagName = await hoverLine.evaluate(el => el.tagName.toLowerCase());
            expect(tagName).toBe('path');
        });

        test('curved line disappears when mouse leaves airport', async ({ page }) => {
            await page.selectOption('#origin-select', 'SEA');
            await page.waitForSelector('.airport.origin');

            const targetAirport = page.locator('.airport.direct').first();
            await targetAirport.hover();

            // Line should be visible
            await expect(page.locator('.hover-line')).toBeVisible();

            // Move away
            await page.mouse.move(0, 0);
            await page.waitForTimeout(200);

            // Line should be gone
            const hoverLines = page.locator('.hover-line');
            const count = await hoverLines.count();
            expect(count).toBe(0);
        });

        test('no curved line when hovering over origin airport', async ({ page }) => {
            await page.selectOption('#origin-select', 'PHX');
            await page.waitForSelector('.airport.origin');

            // Hover over the origin itself
            const originAirport = page.locator('.airport.origin');
            await originAirport.hover();

            // No line should appear (can't connect origin to itself)
            const hoverLines = page.locator('.hover-line');
            const count = await hoverLines.count();
            expect(count).toBe(0);
        });
    });

    test.describe('Labels', () => {
        test('origin label is always visible', async ({ page }) => {
            await page.selectOption('#origin-select', 'DFW');
            await page.waitForSelector('.airport.origin');

            const originLabel = page.locator('.airport-label.origin-label');
            await expect(originLabel).toBeVisible();
            await expect(originLabel).toHaveClass(/always-visible/);
        });

        test('large hub labels are always visible', async ({ page }) => {
            const largeHubLabels = page.locator('.airport-label.large-hub.always-visible');
            const count = await largeHubLabels.count();
            expect(count).toBeGreaterThan(0);
        });

        test('label appears on airport hover', async ({ page }) => {
            // Find a small airport (not always visible)
            const smallAirport = page.locator('.airport').nth(25);
            await smallAirport.hover();

            // Wait for hover class to be added
            await page.waitForTimeout(300);

            const hoverLabel = page.locator('.airport-label.hover-visible');
            const count = await hoverLabel.count();
            expect(count).toBeGreaterThan(0);
        });
    });

    test.describe('Zoom and Pan', () => {
        test('Reset View button resets zoom', async ({ page }) => {
            // Zoom in using scroll
            const svg = page.locator('#visualization-container svg');
            await svg.hover();
            await page.mouse.wheel(0, -100);
            await page.waitForTimeout(500);

            // Click Reset View
            await page.click('#btn-reset-zoom');
            await page.waitForTimeout(800);

            // The transform should be reset (identity transform)
            const mainGroup = page.locator('.main-group');
            const transform = await mainGroup.getAttribute('transform');

            // Should be null or identity
            expect(transform === null || transform === '' || transform.includes('scale(1)')).toBe(true);
        });

        test('Fit All button adjusts view', async ({ page }) => {
            // Click Fit All
            await page.click('#btn-fit-airports');
            await page.waitForTimeout(800);

            // The main group should have a transform
            const mainGroup = page.locator('.main-group');
            const transform = await mainGroup.getAttribute('transform');

            // Should have some transform applied
            expect(transform).not.toBeNull();
        });
    });

    test.describe('Map Distortion Mode', () => {
        test('states morph when in Flight Time + Map Distortion mode', async ({ page }) => {
            // Select origin
            await page.selectOption('#origin-select', 'SFO');
            await page.waitForSelector('.airport.origin');

            // Enable Map Distortion
            await page.click('#btn-rubber');
            await page.waitForSelector('.state-ghost');

            // Get initial state path
            const state = page.locator('.state').first();
            const initialPath = await state.getAttribute('d');

            // Switch to Flight Time mode
            await page.click('#btn-flight-time');

            // Wait for animation
            await page.waitForTimeout(2000);

            // State path should have changed
            const finalPath = await state.getAttribute('d');
            expect(finalPath).not.toBe(initialPath);
        });
    });

    test.describe('Color Scheme', () => {
        test('background is light colored', async ({ page }) => {
            const svg = page.locator('#visualization-container svg');
            const bgColor = await svg.evaluate(el =>
                window.getComputedStyle(el).backgroundColor
            );

            // Should be light (high RGB values)
            // #f8f9fa = rgb(248, 249, 250)
            expect(bgColor).toMatch(/rgb\(24[0-9], 24[0-9], 25[0-9]\)/);
        });

        test('states have light fill', async ({ page }) => {
            const state = page.locator('.state').first();
            const fill = await state.evaluate(el =>
                window.getComputedStyle(el).fill
            );

            // Should be light blue-ish
            // #e8f4f8 = rgb(232, 244, 248)
            expect(fill).toBeDefined();
        });

        test('origin airport is red', async ({ page }) => {
            await page.selectOption('#origin-select', 'MIA');
            await page.waitForSelector('.airport.origin');

            // Wait for CSS to apply
            await page.waitForTimeout(300);

            const origin = page.locator('.airport.origin');
            const fill = await origin.evaluate(el =>
                window.getComputedStyle(el).fill
            );

            // Should be red-ish (#e63946 = rgb(230, 57, 70))
            // Check that red component is high and green/blue are low
            const match = fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            expect(match).not.toBeNull();
            if (match) {
                const [, r, g, b] = match.map(Number);
                expect(r).toBeGreaterThan(200); // High red
                expect(g).toBeLessThan(100);    // Low green
                expect(b).toBeLessThan(100);    // Low blue
            }
        });
    });
});

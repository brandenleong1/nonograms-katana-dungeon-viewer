// Headless Chromium for the browser tests and screenshots, from Playwright, which the site doesn't depend on: CI
// installs it with `npm install --no-save playwright`. Elsewhere, point NK_PLAYWRIGHT at a playwright(-core) module
// and NK_CHROMIUM at a Chromium binary.
//
//   const browser = await launchChromium();
import { pathToFileURL } from 'node:url';

export async function launchChromium() {
	const chromium = await loadChromium();
	return chromium.launch(process.env.NK_CHROMIUM ? { executablePath: process.env.NK_CHROMIUM } : {});
}

async function loadChromium() {
	const candidates = [process.env.NK_PLAYWRIGHT && pathToFileURL(process.env.NK_PLAYWRIGHT).href, 'playwright', 'playwright-core'].filter(Boolean);
	for (const spec of candidates) {
		try {
			return (await import(spec)).chromium;
		} catch {
			// try the next one
		}
	}
	console.error('Playwright not found: `npm i --no-save playwright && npx playwright install chromium` (or set NK_PLAYWRIGHT).');
	process.exit(2);
}

// The game version is written in two places: data/game-version.json (what the site shows) and the README's
// "Game version" table (what people read). A [Game] Sync PR updates both; this fails if they disagree.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/version.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/game-version.json'), 'utf8'));
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

const expected = [
	['the "Matches" row', `| Matches | **${version.name} ${version.versionName}** |`],
	['the versionName / versionCode row', `| \`versionName\` / \`versionCode\` | \`${version.versionName}\` / \`${version.versionCode}\``],
	['the "Package" row', `| Package | \`${version.package}\` |`],
];
const missing = expected.filter(([, row]) => !readme.includes(row));
for (const [what, row] of missing) console.log(`README.md: ${what} should read: ${row}`);
console.log(missing.length ? `${missing.length} failed` : `${expected.length} passed, 0 failed`);
process.exit(missing.length ? 1 : 0);

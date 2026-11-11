// Dungeon labels as shown at the top of a dungeon in the game: zw.g(type) + "-" + seed.
//   types 0..14 -> 1A..5C, 15..18 -> F1..F4, 19..22 -> 6A..6D, 23..26 -> EA..ED, 100 -> CL

export function typeLabel(t) {
	if (t === 100) return 'CL';
	if (t >= 23) return 'E' + String.fromCharCode(t + 42);
	if (t >= 19) return '6' + String.fromCharCode(t - 19 + 65);
	if (t >= 15) return 'F' + (t - 14);
	return String(Math.floor(t / 3) + 1) + String.fromCharCode((t % 3) + 65);
}

const BY_LABEL = new Map();
for (let t = 0; t < 27; t++) BY_LABEL.set(typeLabel(t), t);

export const FAMILIES = [
	{ name: 'Dungeon', types: [...Array(15).keys()] },
	{ name: 'Forest', types: [15, 16, 17, 18] },
	{ name: 'Cave', types: [19, 20, 21, 22] },
	{ name: 'Tomb', types: [23, 24, 25, 26] },
];

export function family(t) {
	return t >= 23 ? 'Tomb' : t >= 19 ? 'Cave' : t >= 15 ? 'Forest' : 'Dungeon';
}

/** "3C-172582050" (case/space-insensitive) -> { type: 8, seed: 172582050 } */
export function parseLabel(text) {
	const s = String(text).trim().toUpperCase().replace(/\s+/g, '');
	const m = /^([1-6][A-D]|F[1-4]|E[A-D])[-–—:]?(\d{1,10})$/.exec(s);
	if (!m) throw new Error('Enter a label like 3C-172582050 (dungeon code, dash, number).');
	const type = BY_LABEL.get(m[1]);
	if (type === undefined) throw new Error(`Unknown dungeon "${m[1]}". Codes: 1A–5C, F1–F4, 6A–6D, EA–ED.`);
	const seed = Number(m[2]);
	if (seed > 2147483647) throw new Error('The number after the dash is too large (max 2147483647).');
	return { type, seed };
}

export function formatLabel(type, seed) {
	return `${typeLabel(type)}-${seed}`;
}

// Minimal zip reader for the game's Settings -> export file (NonogramsKatana.zip): guild.dat,
// NonogramsKatana.progress and MyNonograms/*. Entries are deflated with data descriptors, so sizes are
// taken from the central directory, not the local headers. Stored (0) and deflate (8) only.
import { inflate } from './inflate.js';
import { SaveFormatError } from './reader.js';

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');

export function isZip(u8) {
	return u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 3 && u8[3] === 4;
}

/** Central directory entries: { name, method, csize, usize, offset } */
export function listZip(u8) {
	const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
	let eocd = -1;
	for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
		if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
	}
	if (eocd < 0) throw new SaveFormatError('zip: end of central directory not found');
	const count = dv.getUint16(eocd + 10, true);
	let p = dv.getUint32(eocd + 16, true);
	const out = [];
	for (let k = 0; k < count; k++) {
		if (dv.getUint32(p, true) !== 0x02014b50) throw new SaveFormatError('zip: bad central directory entry');
		const flags = dv.getUint16(p + 8, true);
		const method = dv.getUint16(p + 10, true);
		const csize = dv.getUint32(p + 20, true);
		const usize = dv.getUint32(p + 24, true);
		const nlen = dv.getUint16(p + 28, true);
		const xlen = dv.getUint16(p + 30, true);
		const clen = dv.getUint16(p + 32, true);
		const offset = dv.getUint32(p + 42, true);
		const raw = u8.subarray(p + 46, p + 46 + nlen);
		const name = (flags & 0x800 ? utf8 : latin1).decode(raw);
		out.push({ name, method, csize, usize, offset });
		p += 46 + nlen + xlen + clen;
	}
	return out;
}

/** Uncompressed bytes of one entry. */
export async function readEntry(u8, e) {
	const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
	const h = e.offset;
	if (dv.getUint32(h, true) !== 0x04034b50) throw new SaveFormatError(`zip: bad local header for ${e.name}`);
	const start = h + 30 + dv.getUint16(h + 26, true) + dv.getUint16(h + 28, true);
	const data = u8.subarray(start, start + e.csize);
	if (e.method === 0) return data.slice();
	if (e.method !== 8) throw new SaveFormatError(`zip: unsupported method ${e.method} for ${e.name}`);
	const out = await inflate(data, 'deflate-raw');
	if (out.length !== e.usize) throw new SaveFormatError(`zip: ${e.name} inflated to ${out.length}, expected ${e.usize}`);
	return out;
}

/**
 * The export's files by base name, accepting a flat root or a single top-level folder:
 * { guild, progress, nonograms: [{name, bytes}] } (missing ones are null / empty).
 */
export async function readExport(u8) {
	const entries = listZip(u8).filter((e) => !e.name.endsWith('/'));
	const tops = new Set(entries.map((e) => (e.name.includes('/') ? e.name.split('/')[0] : '')));
	let prefix = '';
	if (!entries.some((e) => e.name === 'guild.dat')) {
		const dirs = [...tops].filter((t) => t && entries.some((e) => e.name === `${t}/guild.dat`));
		if (dirs.length === 1) prefix = dirs[0] + '/';
	}
	const find = (n) => entries.find((e) => e.name === prefix + n) || null;
	const g = find('guild.dat');
	const pr = find('NonogramsKatana.progress');
	const nonograms = [];
	for (const e of entries) {
		if (e.name.startsWith(prefix + 'MyNonograms/')) nonograms.push({ name: e.name.slice(prefix.length), bytes: await readEntry(u8, e) });
	}
	return {
		guild: g ? await readEntry(u8, g) : null,
		progress: pr ? await readEntry(u8, pr) : null,
		nonograms,
	};
}

// guild.dat envelope (vj0.n2 writer / vj0.c2 + ea1.g/h reader):
//   [ XOR(m2 output) ][ 4-byte LE checksum ]
// XOR over [0, len-4): k = 523260599; per LE word k = (k + 0x11111111) * 13, word ^= k; tail bytes ^= k & 255,
// k >>>= 8. The checksum is the XOR of the plaintext LE words (tail bytes shifted 8 * index).
// Plaintext: 12 big-endian header ints (int0 = flags | version << 16), then GZIP of [48, len-4) holding the
// DataOutputStream body that guild.js walks.
import { inflate } from './inflate.js';
import { SaveFormatError } from './reader.js';

const KEY = 523260599;

/** ea1.h: version from the obfuscated first word (it is XORed with the first keystream word) */
export function peekVersion(enc) {
	if (enc.length < 4) return 0;
	const i = ((enc[3] & 255) << 24 | (enc[0] & 255) | (enc[1] & 255) << 8 | (enc[2] & 255) << 16) ^ 1934758184;
	return ((i << 24) | (i >>> 24) | ((i >>> 8) & 65280) | ((i << 8) & 16711680)) >>> 16;
}

/** ea1.g on a copy: XOR-decode [0, n) and return { plain, sum } */
export function unxor(enc, n) {
	const b = enc.slice();
	const words = n - (n & 3);
	let k = KEY, sum = 0, i = 0;
	for (; i < words; i += 4) {
		k = Math.imul((k + 286331153) | 0, 13);
		const w = ((b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) ^ k) | 0;
		sum ^= w;
		b[i] = w & 255; b[i + 1] = (w >>> 8) & 255; b[i + 2] = (w >>> 16) & 255; b[i + 3] = (w >>> 24) & 255;
	}
	for (let t = 0; i < n; i++, t++) {
		const v = (b[i] ^ (k & 255)) & 255;
		b[i] = v;
		sum ^= v << (t * 8);
		k >>>= 8;
	}
	return { plain: b, sum: sum | 0 };
}

/**
 * Decode guild.dat bytes. Returns { version, flags, header: int[12], plain, body } where `body` is the
 * inflated GZIP section (the DataInputStream a2 reads after the 12 header ints).
 */
export async function decodeGuild(enc) {
	const version = peekVersion(enc);
	if (version < 1 || version > 27) throw new SaveFormatError(`guild.dat: unknown version ${version}`);
	if (version < 17) throw new SaveFormatError(`guild.dat: version ${version} has no checksum (unsupported)`);
	const n = enc.length - 4;
	if (n < 48) throw new SaveFormatError('guild.dat: too short');
	const { plain, sum } = unxor(enc, n);
	const stored = (enc[n] | (enc[n + 1] << 8) | (enc[n + 2] << 16) | (enc[n + 3] << 24)) | 0;
	if (stored !== sum) throw new SaveFormatError('guild.dat: checksum mismatch (corrupt or not a guild save)');
	const dv = new DataView(plain.buffer, plain.byteOffset, plain.byteLength);
	const header = [];
	for (let i = 0; i < 12; i++) header.push(dv.getInt32(i * 4));
	const body = await inflate(plain.subarray(48, n), 'gzip');
	return { version: header[0] >>> 16, flags: header[0] & 0xffff, header, plain, body };
}

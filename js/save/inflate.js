// Decompression for the save importer: DecompressionStream in browsers (and Node 18+), node:zlib as a
// fallback. Everything runs locally; nothing is uploaded.

/** Inflate `u8` (format 'deflate-raw' or 'gzip') to a Uint8Array. */
export async function inflate(u8, format) {
	if (typeof DecompressionStream === 'function') {
		try {
			const ds = new DecompressionStream(format);
			const stream = new Blob([u8]).stream().pipeThrough(ds);
			return new Uint8Array(await new Response(stream).arrayBuffer());
		} catch (e) {
			if (typeof process === 'undefined' || !process.versions?.node) throw e;
		}
	}
	const zlib = await import('node:zlib');
	const out = format === 'gzip' ? zlib.gunzipSync(u8) : zlib.inflateRawSync(u8);
	return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

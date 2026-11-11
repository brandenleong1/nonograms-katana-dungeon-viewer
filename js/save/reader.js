// java.io.DataInputStream over a Uint8Array (big-endian), plus the game's compact encodings
// (fg2.e0 / f0 / g0). Reading past the end throws like Java's EOFException.

export class SaveFormatError extends Error {
	constructor(msg) {
		super(msg);
		this.name = 'SaveFormatError';
	}
}

const utf8 = new TextDecoder('utf-8');

export class DataReader {
	constructor(u8, pos = 0) {
		this.u8 = u8;
		this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
		this.pos = pos;
	}

	get remaining() { return this.u8.length - this.pos; }

	need(n) {
		if (this.pos + n > this.u8.length) throw new SaveFormatError(`unexpected end of save data at byte ${this.pos} (+${n})`);
		const p = this.pos;
		this.pos += n;
		return p;
	}

	/** readByte(): signed */
	readByte() { return this.dv.getInt8(this.need(1)); }
	/** readByte() & 255 */
	readUByte() { return this.dv.getUint8(this.need(1)); }
	/** readShort(): signed */
	readShort() { return this.dv.getInt16(this.need(2)); }
	/** readShort() & 0xffff */
	readUShort() { return this.dv.getUint16(this.need(2)); }
	readInt() { return this.dv.getInt32(this.need(4)); }
	/** readLong() as BigInt */
	readLong() { return this.dv.getBigInt64(this.need(8)); }
	readFully(n) {
		const p = this.need(n);
		return this.u8.subarray(p, p + n);
	}

	/** fg2.e0: 1 byte, or 2 when the first has bit 7 (15-bit value) */
	e0() {
		const b = this.readByte();
		const v = b & 255;
		return v >= 128 ? (this.readByte() & 255) | ((b & 127) << 8) : v;
	}

	/** fg2.f0: 1 short, or 2 when the first has bit 15 (31-bit value) */
	f0() {
		const s = this.readShort();
		const v = s & 0xffff;
		return v >= 32768 ? (this.readShort() & 0xffff) | ((s & 32767) << 16) : v;
	}

	/** fg2.g0: length byte + bytes (new String(bytes), UTF-8) */
	g0() {
		const n = this.readByte() & 255;
		if (n === 0) return '';
		return utf8.decode(this.readFully(n));
	}
}

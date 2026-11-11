// Java runtime semantics for the generator port.
//
// The generator must be bit-exact with the game, so every Java int/byte/short/float operation
// whose JS equivalent differs goes through these helpers:
//   int  a + b, a - b      -> (a + b) | 0
//   int  a * b             -> imul(a, b)          (JS * loses precision past 2^53)
//   int  a / b, a % b      -> idiv(a, b), irem(a, b)
//   (byte) x, (short) x    -> b8(x), s16(x)       (also for compound assignment on byte/short
//                                                   fields: Java narrows `b |= 32` implicitly)
//   (char) x               -> c16(x)
//   float arithmetic       -> f32(...) after every float op
//   (int) floatOrDouble    -> f2i(x)

export const imul = Math.imul;
export const f32 = Math.fround;

export function idiv(a, b) {
	if (b === 0) throw new Error('ArithmeticException: / by zero');
	return (a / b) | 0;
}

export function irem(a, b) {
	if (b === 0) throw new Error('ArithmeticException: / by zero');
	return (a % b) | 0;
}

export const b8 = (x) => (x << 24) >> 24;
export const s16 = (x) => (x << 16) >> 16;
export const c16 = (x) => x & 0xffff;

/** Java (int) cast from float/double: NaN -> 0, saturating, truncate toward zero. */
export function f2i(x) {
	if (Number.isNaN(x)) return 0;
	if (x >= 2147483647) return 2147483647;
	if (x <= -2147483648) return -2147483648;
	return Math.trunc(x);
}

/** Integer.compare */
export const icmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** java.util.TreeSet<Integer>: sorted, unique, ascending iteration. */
export class TreeSet {
	constructor(values) {
		this.v = [];
		if (values) for (const x of values) this.add(x);
	}

	_find(x) {
		let lo = 0, hi = this.v.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (this.v[mid] < x) lo = mid + 1; else hi = mid;
		}
		return lo;
	}

	add(x) {
		const i = this._find(x);
		if (this.v[i] === x) return false;
		this.v.splice(i, 0, x);
		return true;
	}

	remove(x) {
		const i = this._find(x);
		if (this.v[i] !== x) return false;
		this.v.splice(i, 1);
		return true;
	}

	contains(x) {
		return this.v[this._find(x)] === x;
	}

	size() { return this.v.length; }
	isEmpty() { return this.v.length === 0; }
	clear() { this.v.length = 0; }
	first() {
		if (!this.v.length) throw new Error('NoSuchElementException');
		return this.v[0];
	}
	last() {
		if (!this.v.length) throw new Error('NoSuchElementException');
		return this.v[this.v.length - 1];
	}
	toArray() { return this.v.slice(); }
	[Symbol.iterator]() { return this.v.slice()[Symbol.iterator](); }
}

/**
 * Collections.sort / List.sort / Arrays.sort(Object[], cmp): stable merge sort, in place.
 * Array.prototype.sort is stable in every engine we target, and Java's sorts are stable too.
 */
export function sortList(list, cmp) {
	list.sort(cmp);
	return list;
}

/** Remove the element at index i (ArrayList.remove(int)). */
export function removeAt(list, i) {
	if (i < 0 || i >= list.length) throw new Error(`IndexOutOfBoundsException: ${i}`);
	return list.splice(i, 1)[0];
}

/** ArrayList.remove(Object): remove the first identical element. */
export function removeObj(list, o) {
	const i = list.indexOf(o);
	if (i < 0) return false;
	list.splice(i, 1);
	return true;
}

/** Checked array read: Java throws on out-of-bounds; JS would silently return undefined. */
export function at(arr, i) {
	if (i < 0 || i >= arr.length || !Number.isInteger(i)) throw new Error(`ArrayIndexOutOfBoundsException: ${i}`);
	return arr[i];
}

/** ArrayList.get */
export function get(list, i) {
	if (i < 0 || i >= list.length) throw new Error(`IndexOutOfBoundsException: Index ${i} out of bounds for length ${list.length}`);
	return list[i];
}

/** Math.abs(int): note Math.abs(MIN_VALUE) == MIN_VALUE in Java. */
export const iabs = (x) => (x < 0 ? (-x) | 0 : x);

/** Math.sqrt on int -> double, then (int). */
export const isqrt = (x) => f2i(Math.sqrt(x));

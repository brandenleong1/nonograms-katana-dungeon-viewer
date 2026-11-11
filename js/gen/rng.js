// e01: the game's LCG (state * 69069 + 1). Field `a` is the state, as in Java.
// Methods carry a trailing underscore (see PORTING.md: fields and methods share one namespace in JS).
import { register } from './registry.js';

export class e01 {
	constructor(a = 1) {
		this.a = a | 0;
	}

	/** Advance and return the raw 32-bit state. */
	g_() {
		this.a = (Math.imul(this.a, 69069) + 1) | 0;
		return this.a;
	}

	/** Uniform-ish int in [0, n): top bits of the low 15 bits scaled by n. */
	h_(n) {
		this.a = (Math.imul(this.a, 69069) + 1) | 0;
		return Math.imul(this.a & 32767, n) >>> 15;
	}

	/** Int in [lo, hi] (returns lo when lo >= hi, without advancing). */
	i_(lo, hi) {
		return lo >= hi ? lo : (this.h_((hi - lo + 1) | 0) + lo) | 0;
	}
}

register(e01);

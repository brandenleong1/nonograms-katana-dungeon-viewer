// Player-state helpers that sit outside vj0/kj0 but that x30 or mw reach directly:
//   cq (mw's inventory list, and x30.P's vj0.i2.N.b.j(115)), cj0 (its entries), pj0.f (vj0.i2.N.f(18)),
//   ni0.h0 (vj0.i2.o[n].h0(step), also used by p30.b / o30.d).
// The progress agent owns vj0 and kj0. If it also defines these classes, merge these methods into
// its versions (the registry keeps whichever class registers last).
import { register, classes } from '../registry.js';

/** cq (case 1 of an R8-merged class): item list; c = ArrayList<cj0>, b = flag. */
export class cq {
	/** (Z)V: always case 1 */
	constructor(_z) {
		this.a = 1;
		this.b = false;
		this.c = null;
	}

	/** int j(int id): count of item id (0 if absent) */
	j_(id) {
		const list = this.c;
		const n = list.length;
		for (let i = 0; i < n; i++) {
			const e = list[i];
			if (e.a.a === id) return e.a_();
		}
		return 0;
	}
}

/** cj0: inventory entry (a = bj0 item, b = obfuscated count, c). */
export class cj0 {
	/** int a(): decoded count */
	a_() {
		const b = this.b;
		return (((b & 252645135) << 4) | ((b & -252645136) >>> 4)) ^ 6896781;
	}
}

/** pj0: player statistics; only f(int) is ported. */
export class pj0 {
	/** int f(int i): decoded counter t[i] (0 for i >= 27) */
	f_(i) {
		if (i >= 27) return 0;
		const v = this.t[i];
		return (((v & 252645135) << 4) | ((-252645136 & v) >>> 4)) ^ 23673997;
	}
}

/** ni0: quest-line state; only h0(int) is ported. */
export class ni0 {
	/** boolean h0(int step): step (1-based) of this line is done */
	h0_(step) {
		const g = this.g;
		return g != null && step > 0 && step <= g.length && (this.C0 & (1 << (step - 1))) !== 0;
	}
}

for (const c of [cq, cj0, pj0, ni0]) if (!classes[c.name]) register(c);

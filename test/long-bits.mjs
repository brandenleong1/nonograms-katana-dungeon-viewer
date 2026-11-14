// vj0.t1 (js/gen/progress.js): "bit b of the player's long X is set" without BigInt on the hot path, against the BigInt
// form it replaced: every bit number (including ones the JVM wraps to 6 bits), random 64-bit masks as JSON numbers and as
// BigInts, the ends of the signed and unsigned ranges, masks changing between calls, and the masks BigInt() rejects.
// Standalone suite: `npm test` and CI run it (tools/run-tests.mjs).
//
//   node test/long-bits.mjs
import '../js/gen/index.js';
import { vj0 } from '../js/gen/progress.js';

/** the previous implementation, copied */
const toLong = (x) => (typeof x === 'bigint' ? BigInt.asIntN(64, x) : BigInt(x));
const referenceBit = (b, mask) => ((1n << BigInt(b & 63)) & toLong(mask)) !== 0n;

const t1 = (X, b) => vj0.prototype.t1_.call({ X }, b);
const outcome = (f) => {
	try {
		return String(f());
	} catch (e) {
		return `${e.constructor.name}: ${e.message}`;
	}
};

let calls = 0;
const failures = [];
const check = (X, b) => {
	calls++;
	const want = outcome(() => referenceBit(b, X)), got = outcome(() => t1(X, b));
	if (want !== got && failures.length < 10) failures.push(`X ${typeof X} ${String(X)}, bit ${b}: ${want} (BigInt form) vs ${got}`);
};

// a seeded generator, so a failure reproduces
let seed = 0x2545f491;
const next32 = () => {
	seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
	return seed >>> 0;
};
const random64 = () => (BigInt(next32()) << 32n) | BigInt(next32());

const edges = [0n, 1n, -1n, 2n ** 31n, 2n ** 31n - 1n, -(2n ** 31n), 2n ** 32n - 1n, 2n ** 32n, 2n ** 53n - 1n, -(2n ** 53n), 2n ** 63n - 1n, 2n ** 63n, -(2n ** 63n), 2n ** 64n - 1n, 2n ** 64n, 2n ** 64n + 5n, 2n ** 100n + 12345n, -(2n ** 100n) - 1n];
const masks = [...edges, ...edges.filter((v) => Math.abs(Number(v)) <= Number.MAX_SAFE_INTEGER).map(Number), -0, 0, 1e15, -1e15, 2 ** 53, 2 ** 70, -(2 ** 70), 1e300, 12345678901];
for (let i = 0; i < 300; i++) masks.push(random64(), BigInt.asIntN(64, random64()), Number(random64() >> 11n), -Number(random64() >> 11n));
for (const X of masks) for (let b = -70; b <= 135; b++) check(X, b);

// the mask changes between calls, and comes back (the kept halves must follow it)
for (let i = 0; i < 2000; i++) {
	const X = masks[next32() % masks.length];
	check(X, next32() % 64);
	check(X, next32() % 64);
}

// what BigInt() rejects, and what isn't a number at all: the same error as before, and nothing kept from the failed call
for (const bad of [NaN, 1.5, -0.25, Infinity, undefined, null, '12', '0x10', 'abc', {}, [], [7], true, Symbol('x')]) {
	check(bad, 3);
	check(5, 3);
	check(bad, 35);
	check(2 ** 40, 35);
}

if (failures.length) {
	for (const f of failures) console.log(`FAIL ${f}`);
	process.exit(1);
}
console.log(`ok   vj0.t1 agrees with the BigInt form on ${calls} calls`);

// Save import: the game's export zip (Settings -> export: guild.dat, NonogramsKatana.progress, MyNonograms/*)
// or a bare guild.dat -> the player's state as a vj0 that can stand in for vj0.i2, plus the dungeon in progress.
// Parsing is local (browser or Node); nothing leaves the machine. Requires initTables() first.
// Like the game's loader, it also writes a few static tables: vj0.A1[].g, the vj0.R1 entry vj0.Y points to,
// and the companion / familiar / clone templates zw.c(190..199) (from the dungeon's hero and pets).
//
//   const { header, vj0, dungeon } = await importSave(arrayBuffer);
//   useProfile(vj0);            // optional: labels / generator then use the imported progress
import { vj0 as V, tables } from '../gen/statics.js';
import { isZip, readExport } from './zip.js';
import { decodeGuild } from './envelope.js';
import { freshGuild, randomQuests } from './fresh.js';
import { readGuild } from './guild.js';
import { SaveFormatError } from './reader.js';
import { applyProgress } from '../gen/progress-spec.js';

export { SaveFormatError };

/**
 * Parse a save. Returns
 *   { header: { version, flags, ints, savedAt }, vj0, dungeon, marker, files, notes }
 * where vj0 is a new profile (vj0.i2 is left as it was unless `install`), dungeon = vj0.K0 (hw, ew or null),
 * marker = the save's dungeon marker (0 none, 1 hw, 2 ew), files = names in the zip.
 */
export async function importSave(buf, { install = false, now } = {}) {
	if (!tables) throw new Error('importSave: call initTables(data/tables.json) first');
	if (isBundle(buf)) {
		// a profile bundle { guild, progress } (js/hero.js solverProfile: the save plus the "Your progress" edits,
		// plain data that survives postMessage): the save, then the edits (js/gen/progress-spec.js applyProgress)
		const r = await importSave(buf.guild, { install, now });
		if (buf.progress) applyProgress(r.vj0, buf.progress);
		return r;
	}
	const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let guild = u8;
	let files = null;
	if (isZip(u8)) {
		const ex = await readExport(u8);
		if (!ex.guild) throw new SaveFormatError('zip has no guild.dat (is this the game\'s Settings -> export file?)');
		guild = ex.guild;
		files = {
			guild: true,
			progress: ex.progress != null,
			nonograms: ex.nonograms.map((n) => n.name),
		};
	}
	const env = await decodeGuild(guild);
	const v = freshGuild(now);
	const prev = V.i2;
	V.i2 = v;
	let info;
	try {
		info = readGuild(v, env.header, env.body);
	} catch (e) {
		V.i2 = prev;
		throw e;
	}
	if (!install) V.i2 = prev;
	const notes = [];
	if (info.unread !== 4) notes.push(`${info.unread} body bytes left after the last section (expected the trailing int 0)`);
	const rq = randomQuests(v);
	if (rq.length) notes.push(`quests ${rq.join(',')} take a random variant on load in the game`);
	return {
		header: { version: env.version, flags: env.flags, ints: env.header, savedAt: env.header[1] },
		vj0: v,
		dungeon: v.K0,
		marker: info.marker,
		files,
		notes,
	};
}

/** { guild: bytes, progress: spec }: a save with progress edits (see importSave) */
function isBundle(b) {
	return b != null && typeof b === 'object' && !ArrayBuffer.isView(b) && !(b instanceof ArrayBuffer) && 'guild' in b;
}

/** Make an imported profile the player state the generator and labels query (vj0.i2). */
export function useProfile(v) {
	V.i2 = v;
}

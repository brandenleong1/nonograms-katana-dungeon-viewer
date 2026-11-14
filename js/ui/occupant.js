// What the Selected panel and the map tooltip say about the creature or object on a cell: its name
// (data/catalog.json), what kind of thing it is, and what a player wants to know before going there. Monsters: HP,
// damage and defence at this dungeon's level, their seal, and what they drop. People: their quest, or what they give.
// Wild familiars: what they look like and their rank. Objects: what opening or breaking them costs, and what they
// link to.
import { SECRET_NAME } from '../tombs.js';
import { KINDS, objectKind, critterKind, critterName, objectName, familiarRank, critterNameSource, objectNameSource, itemName as catalogItemName } from '../view/catalog.js';
import { partners } from '../view/links.js';
import { family } from '../labels.js';
import { zw } from '../gen/statics.js';
import { partTitle } from './questlines.js';

const FIGHTERS = new Set(['monster', 'goldmonster', 'boss', 'miniboss', 'unique', 'shapeshifter', 'familiar']);
const FIRST_FAMILIAR = 190;   // critters 190..193 are the level's wild familiars (hw.p, level.companions)
const RANK_NAMES = ['white', 'blue', 'yellow', 'purple'];
const MINE_CART_DEFENCE = 4; // aw.k: a creature with flag 512 (in a mine cart) defends 4 better
const JADE_KEY = 222;         // the key a forest boss or mini-boss drops for its jade door
const KEY_USES = { 167: 'for a keylock door', [JADE_KEY]: 'for the jade door' };
// in ED, Nefersah (626) and Merytsah's second form (643) drop two fixed items until quest 70 is done (c30.j0)
const ED = 26;
const ED_DROPS = { 626: [309, 307], 643: [308, 311] };
const ED_QUEST = 70;
// what a lost adventurer tagged 1000 turns into, by dungeon family (c30.R0 talk: pw.G tombs, pw.E forest)
const DISGUISED = { Tomb: 649, Forest: 350 };
const DISGUISED_ELSEWHERE = 284;
// where a wiki name links to (CC BY-SA asks for the credit): the page the name was taken from
const WIKI = 'https://nonograms-katana.fandom.com/wiki/';
const WIKI_PAGES = { creature: 'Dungeon:_Bestiary', familiar: 'Dungeon:_familiars', quest: 'Quests', person: 'Dungeon:_lost_adventurers', object: 'Dungeon:_objects' };

/**
 * The Selected panel's HTML for the creature or object on `cell`.
 * @param {{ level: object, names: object, profile: object }} ctx the dungeon shown, data/names.json, and the player
 *   progress it was built with (vj0)
 */
export function occupantHtml(cell, ctx) {
	return cell.critter ? critterHtml(cell.critter, ctx) : objectHtml(cell.object, ctx);
}

/** What the map tooltip calls the creature or object on `cell`, e.g. "Cobra" or "Purple chest". */
export function occupantName(cell, level) {
	if (cell.critter) return critterName(cell.critter) ?? KINDS[critterKindOf(cell.critter)].label;
	return objectName(cell.object, family(level.type)) ?? KINDS[objectKindOf(cell.object)].label;
}

/** Obtainable item ids at a placed occupant, using the same rules as its details. Never rolls dice. */
export function occupantLoot(rec, creature, ctx) {
	if (rec.e) return [];
	const def = (creature ? zw.R : zw.Q)?.get(rec.id);
	if (!creature) return [carried(rec, def)].filter((id) => id > 0);
	if (def?.M0) return [];
	const kind = critterKindOf(rec);
	if (rec.h === 1000) {
		const monster = zw.R?.get(DISGUISED[family(ctx.level.type)] ?? DISGUISED_ELSEWHERE);
		return monster ? dropsOf({ g: carried(rec, def) || -1 }, monster, ctx) : [];
	}
	if (FIGHTERS.has(kind) && kind !== 'familiar' && def) return dropsOf(rec, def, ctx);
	if ([1001, 1003, 1004, 1007, 1008].includes(rec.h)) return [carried(rec, def)].filter((id) => id > 0);
	return [];
}

// ---- creatures ---------------------------------------------------------------------------------------------------

function critterHtml(cr, ctx) {
	const def = zw.R?.get(cr.id);
	const kind = critterKindOf(cr);
	const look = KINDS[kind];
	const parts = [headHtml(look, critterName(cr) ?? look.label, cr.id)];
	if (kind === 'familiar') parts.push(...familiarLines(cr, ctx));
	if (def && def.M0) parts.push('<div>Only passing through: leaves after one turn.</div>');
	else if (cr.h === 1000) parts.push(...disguiseLines(cr, def, ctx));
	else if (kind === 'shapeshifter') parts.push('<div>Looks like a person, but attacks when you talk to it.</div>', ...fightLines(cr, def, ctx));
	else if (FIGHTERS.has(kind) && def) parts.push(...fightLines(cr, def, ctx));
	else parts.push(...personLines(cr, def, ctx));
	if (def && def.t) parts.push('<div class="muted">Counts as an objective.</div>');
	if (critterNameSource(cr) === 'wiki') parts.push(wikiCreditHtml(creditPage(cr, kind)));
	return parts.join('');
}

function fightLines(cr, def, ctx) {
	if (!def) return [];
	return [statsLine(cr, def, ctx.level), ...dropLines(cr, def, ctx), ...sealLines(def, ctx)];
}

/**
 * A lost adventurer tagged 1000 is a monster in disguise (c30.R0 talk): talking to it turns it into a monster, which
 * demoralizes the hero and drops what the adventurer would have given.
 */
function disguiseLines(cr, def, ctx) {
	const monsterId = DISGUISED[family(ctx.level.type)] ?? DISGUISED_ELSEWHERE;
	const monster = zw.R?.get(monsterId);
	const name = critterName({ id: monsterId }) ?? 'monster';
	const lines = [`<div>Looks like a person, but turns into ${article(name)} <b>${esc(name)}</b> when you talk to it.</div>`];
	if (!monster) return lines;
	const gift = carried(cr, def);
	return [...lines, ...fightLines({ id: monsterId, g: gift || -1, h: 0 }, monster, ctx)];
}

/** A monster's HP, damage and defence at this dungeon's tier (bw.L(pw.N), as aw is built); one that starts in a mine
 * cart has +4 defence while it rides (aw.k, flag 512) */
function statsLine(cr, def, level) {
	const tier = zw.M[level.type] ? zw.M[level.type].N : 0;
	const s = def.L_(tier);
	const defence = ridesCart(cr, level) ? `<b>${s.c + MINE_CART_DEFENCE}</b> (+${MINE_CART_DEFENCE} in its mine cart)` : `<b>${s.c}</b>`;
	return `<div>HP <b>${s.a}</b> · damage <b>${s.b}</b> · defence ${defence}</div>`;
}

function ridesCart(cr, level) {
	return (level.cartRiders || []).some((p) => p.x === cr.x && p.y === cr.y);
}

/** What it drops when beaten (c30.j0): its loot (qw.b, rolled when the dungeon was built), the species' extra drop
 * (bw.g0), and a forest boss's or mini-boss's key; the ED pharaohs drop their regalia until quest 70 is done. */
function dropLines(cr, def, ctx) {
	const items = dropsOf(cr, def, ctx);
	if (!items.length) return [];
	return [`<div>Drops ${items.map((id) => itemHtml(id, ctx)).join(' and ')} when beaten.</div>`];
}

function dropsOf(cr, def, { level, profile }) {
	if (level.type === ED && ED_DROPS[cr.id] && !(profile && profile.Y0_(ED_QUEST).q_())) return ED_DROPS[cr.id];
	const items = [carried(cr, def), def.g0];
	if (def.l0 && (cr.h === 1100 || cr.h === 1101)) items.push(JADE_KEY);
	return items.filter((id) => id > 0);
}

/** qw.b: what a creature or object holds; -1 means nothing, 0 the species' own loot (rw.w) */
function carried(rec, def) {
	if (rec.e || rec.g === -1) return 0;
	return rec.g || (def ? def.w : 0);
}

/** A sealed monster can't be hurt until the hero pays its mental power (aw.i); a tomb boss (bw.m0) first needs a
 * Secret name used on it. */
function sealLines(def, ctx) {
	const lines = [];
	if (def.m0) lines.push(`<div>Can't be hurt until you use a <b>${esc(itemName(SECRET_NAME, ctx))}</b> on it.</div>`);
	if (def.v > 0) lines.push(`<div>Sealed: pay <b>${def.v}</b> mental power to unseal it before it can be hurt.</div>`);
	return lines;
}

/** A wild familiar (critter 190 + i is level.companions[i]): the monster it looks like, its rank, and the Taming level
 * that catches it (rank + 1: the game's taming hint, c30 input) */
function familiarLines(cr, { level }) {
	const pet = level.companions ? level.companions[cr.id - FIRST_FAMILIAR] : null;
	const lookName = pet ? critterName({ id: pet.id }) : null;
	const rank = familiarRank(level, cr);
	const lines = [];
	if (lookName) lines.push(`<div>Looks like ${article(lookName)} <b>${esc(lookName)}</b>.</div>`);
	lines.push(familiarRankHtml(rank));
	if (rank !== null) lines.push(`<div>Tame it with Taming level&nbsp;${rank + 1}.</div>`);
	return lines;
}

/** a wild familiar's rank, named by the colour the game shows it in */
function familiarRankHtml(rank) {
	if (rank === null) return '<div class="muted">Its rank is not known for this dungeon.</div>';
	return `<div>Rank <b>${rank}</b> of 3 (${RANK_NAMES[rank]}).</div>`;
}

// ---- people ------------------------------------------------------------------------------------------------------

/**
 * Who a person is and what they give, from their tag (qw.h, set by x30.P): a quest id (1..999), 2000 + a quest id
 * (someone with that quest's person), 1001 a lost adventurer, 1002 a quest you're on, 1004 the leprechaun, 1005 /
 * 1006 a companion, 1007 a trader (1000, a lost adventurer in disguise, is a monster). What they give is c30.R0's talk
 * branch: their loot (qw.b).
 */
function personLines(cr, def, ctx) {
	const tag = cr.h;
	const gift = carried(cr, def);
	if (tag > 0 && tag <= 999) return [`<div>Quest: <b>${esc(partTitle(tag, ctx.names))}</b>.</div>`];
	if (tag > 2000 && tag <= 2999) return [`<div>Part of the quest <b>${esc(partTitle(tag - 2000, ctx.names))}</b>.</div>`];
	if (tag === 1002) return ['<div>Part of a quest you have started.</div>'];
	if (tag === 1005 || tag === 1006) return companionLines(cr, ctx.level);
	if (tag === 1007 || tag === 1008) return tradeLines(def, gift, ctx);
	if (gift && (tag === 1001 || tag === 1003 || tag === 1004)) return [`<div>Gives you ${withArticle(gift, ctx)} when you talk to them.</div>`];
	return [];
}

/** the wiki page a creature's name was taken from */
function creditPage(cr, kind) {
	if (kind === 'familiar') return 'familiar';
	if (FIGHTERS.has(kind)) return 'creature';
	return isQuestPerson(cr) ? 'quest' : 'person';
}

/** a quest's person, its referral or its variant (x30.P tags) */
function isQuestPerson(cr) {
	return (cr.h > 0 && cr.h <= 999) || (cr.h > 2000 && cr.h <= 2999) || cr.h === 1002;
}

/** a retinue member stands with the person whose species brings it (bw.x0) */
function companionLines(cr, level) {
	const lead = level.critters.find((c) => c !== cr && c.k === 0 && zw.R?.get(c.id)?.x0 === cr.id);
	const leadName = lead ? critterName(lead) : null;
	return leadName ? [`<div>Travels with ${esc(leadName)}.</div>`] : [];
}

/** the trader wants bw.L0 and gives its loot for it */
function tradeLines(def, gift, ctx) {
	if (!def || !def.L0 || !gift) return [];
	return [`<div>Trades ${withArticle(gift, ctx)} for your ${itemHtml(def.L0, ctx)}.</div>`];
}

// ---- objects -----------------------------------------------------------------------------------------------------

function objectHtml(obj, ctx) {
	const def = zw.Q?.get(obj.id);
	const kind = objectKindOf(obj);
	const look = KINDS[kind];
	const parts = [headHtml(look, objectName(obj, family(ctx.level.type)) ?? look.label, obj.id)];
	if (def && def.v > 0 && !obj.f) parts.push(`<div>Needs <b>${def.v}</b> mental power to open.</div>`);
	parts.push(...objectContents(obj, def, ctx));
	if (kind === 'stuckdoor') parts.push(`<div>Breaking it costs ${breakCost(ctx.level.type)} energy.</div>`);
	// c30 movement: stepping in picks the cart up (flag 512); it rolls with its rider along the boardwalk (ww.o, floor
	// 18 / 19: the caves' rails) and stays behind where the rider steps off it
	if (kind === 'minecart') parts.push(`<div>Step in to ride it along the boardwalk. Whoever rides it, you or a monster, has <b>+${MINE_CART_DEFENCE}</b> defence.</div>`);
	if (def && def.t) parts.push('<div class="muted">Counts as an objective.</div>');
	const linked = partners(ctx.level, obj);
	if (linked.length) parts.push(`<div>Links to ${linked.map((p) => partnerLinkHtml(p, ctx.level)).join(', ')}.</div>`);
	if (objectNameSource(obj) === 'wiki') parts.push(wikiCreditHtml('object'));
	return parts.join('');
}

/** Placed contents (qw.b), and c30.A / P0 hidden creatures; reading these must never roll dice. */
function objectContents(obj, def, ctx) {
	if (obj.e) return ['<div>Already collected or used.</div>'];
	const lines = [];
	const loot = carried(obj, def);
	if (loot > 0) lines.push(`<div>Holds ${itemHtml(loot, ctx)}.</div>`);
	else if (def && (def.x || def.i || def.m)) lines.push('<div>Empty.</div>');
	const chance = mimicChance(obj, zw.M[ctx.level.type]);
	if (chance) lines.push(`<div>${chance}% chance of a hidden creature; it carries these contents.</div>`);
	if (obj.id === 54) lines.push('<div>50% chance of a Garganbee appearing.</div>');
	if (obj.id === 95) lines.push('<div>Restores 10 energy and lights your torch.</div>');
	return lines;
}

/** Hidden-creature probabilities from c30.A and c30.P0; no combat-dice prediction. */
export function mimicChance(obj, dungeon) {
	if ([3, 26, 104, 105, 106, 94].includes(obj.id)) return 20;
	return obj.id === 2 && (dungeon?.E || dungeon?.F) ? 8 : 0;
}

/** Energy to break a stuck door in a dungeon type: its pw.r, as the route planner counts it. */
function breakCost(type) {
	return zw.M[type] ? zw.M[type].r : 5;
}

function partnerLinkHtml(p, level) {
	const name = objectName(p, family(level.type)) ?? KINDS[objectKindOf(p)].label;
	return `<a data-x="${p.x}" data-y="${p.y}">${esc(name.toLowerCase())} at ${p.x},${p.y}</a>`;
}

// ---- shared ------------------------------------------------------------------------------------------------------

/** the glyph, the name and the id, then what kind of thing it is when the name doesn't say */
function headHtml(look, name, id) {
	const kindLine = name !== look.label ? `<div class="muted">${esc(look.label)}</div>` : '';
	return `<div><span class="glyph" style="color:${look.color}">${look.glyph}</span><b>${esc(name)}</b> <span class="muted">#${id}</span></div>${kindLine}`;
}

/** the credit for a name taken from the wiki */
function wikiCreditHtml(page) {
	return `<div class="muted small wiki-credit">Name: <a href="${WIKI}${WIKI_PAGES[page]}" target="_blank" rel="noopener">Nonograms Katana Wiki</a></div>`;
}

function critterKindOf(cr) {
	return critterKind(cr, zw.R?.get(cr.id));
}

function objectKindOf(obj) {
	return objectKind(obj, zw.Q?.get(obj.id));
}

function itemName(id, { names }) {
	return catalogItemName(id, names);
}

/** "<b>Thread</b>", or "<b>Key</b> for the jade door" */
function itemHtml(id, ctx) {
	const use = KEY_USES[id];
	return `<b>${esc(itemName(id, ctx))}</b>${use ? ` ${use}` : ''}`;
}

/** "a <b>Pot of gold</b>": for the things people give, which are all single items */
function withArticle(id, ctx) {
	return `${article(itemName(id, ctx))} ${itemHtml(id, ctx)}`;
}

function article(word) {
	return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function esc(text) {
	return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

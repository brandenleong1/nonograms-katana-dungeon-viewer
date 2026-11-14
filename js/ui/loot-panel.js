import { occupantLoot } from './occupant.js';
import { itemName } from '../view/catalog.js';

const KEY = 'nkd-loot';

/** Each obtainable item on this map, counting distinct creatures and objects rather than item quantities. */
export function dungeonLoot(ctx) {
	const items = new Map();
	for (const [records, creature] of [[ctx.level.objects, false], [ctx.level.critters, true]]) {
		for (const rec of records) {
			for (const id of new Set(occupantLoot(rec, creature, ctx))) {
				if (!items.has(id)) items.set(id, { id, name: itemName(id, ctx.names), creatures: 0, objects: 0, places: [] });
				const item = items.get(id);
				item[creature ? 'creatures' : 'objects']++;
				item.places.push({ x: rec.x, y: rec.y });
			}
		}
	}
	return [...items.values()];
}

/** Multi-item map highlights; choices survive changing dungeons and reopening the page. */
export class LootPanel {
	constructor(view) {
		this.view = view;
		this.items = [];
		try {
			const saved = JSON.parse(localStorage.getItem(KEY));
			this.selected = new Set(Array.isArray(saved) ? saved.filter(Number.isInteger) : []);
		} catch {
			this.selected = new Set();
		}
	}

	bind() {
		document.querySelector('#loot-open-btn').onclick = () => Popup.popup(document.querySelector('#popup-loot'));
		document.querySelector('#loot-sort').onchange = () => this.render();
		document.querySelector('#loot-clear').onclick = () => {
			this.selected.clear();
			this.changed();
			this.render();
		};
	}

	setDungeon(ctx) {
		this.items = dungeonLoot(ctx);
		this.render();
		this.highlight();
	}

	render() {
		const sort = document.querySelector('#loot-sort').value;
		const items = [...this.items].sort((a, b) => {
			const count = a.places.length - b.places.length;
			const name = a.name.localeCompare(b.name);
			return (sort === 'fewest' ? count : sort === 'most' ? -count : 0) || (sort === 'reverse-name' ? -name : name) || a.id - b.id;
		});
		const list = document.querySelector('#loot-list');
		list.replaceChildren();
		for (const item of items) list.append(this.row(item));
		if (!items.length) list.textContent = 'No obtainable items on this map.';
		this.summary();
	}

	row(item) {
		const row = document.createElement('label');
		row.className = 'loot-row';
		const box = document.createElement('input');
		box.type = 'checkbox';
		box.checked = this.selected.has(item.id);
		box.dataset.item = item.id;
		box.onchange = () => {
			if (box.checked) this.selected.add(item.id);
			else this.selected.delete(item.id);
			this.changed();
		};
		const text = document.createElement('span');
		const name = document.createElement('b');
		name.textContent = `${item.name} · ${item.places.length} ${item.places.length === 1 ? 'place' : 'places'}`;
		const counts = document.createElement('small');
		counts.textContent = `${item.creatures} carried by creatures or people, ${item.objects} in chests or other objects`;
		text.append(name, counts);
		row.append(box, text);
		return row;
	}

	changed() {
		try { localStorage.setItem(KEY, JSON.stringify([...this.selected])); } catch { /* Choices still work in this tab. */ }
		this.highlight();
		this.summary();
	}

	highlight() {
		const places = new Map();
		for (const item of this.items.filter((item) => this.selected.has(item.id))) {
			for (const place of item.places) places.set(`${place.x},${place.y}`, place);
		}
		this.view.setLootHighlights([...places.values()]);
	}

	summary() {
		const here = this.items.filter((item) => this.selected.has(item.id)).length;
		const absent = this.selected.size - here;
		document.querySelector('#loot-summary').textContent = `${here} items selected on this map — marked with orange rings.${absent ? ` ${absent} selected items are absent here; kept for other dungeons.` : ''}`;
	}
}

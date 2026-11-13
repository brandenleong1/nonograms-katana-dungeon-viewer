// The tabs of the phone and tablet layout (style.css): under the map (beside it in landscape), one panel at a time,
// Dungeon, Info, Route or Solver. Wide screens show every panel as a column and hide the tabs. The tab shown is kept
// for the session (sessionStorage), and is on <body data-sheet>, which the stylesheet follows.

const KEY = 'nkd-sheet';
const STEP_KEYS = { ArrowRight: 1, ArrowLeft: -1 };

// Tabs that stay open when something new turns up on another one: the Solver's script is followed step by step.
const STEADY_TABS = new Set(['solver']);

export class SheetTabs {
	/** @param {HTMLElement} tablist  role="tablist"; each tab's data-sheet names it, aria-controls its panel */
	constructor(tablist) {
		this.tablist = tablist;
		this.tabs = [...tablist.querySelectorAll('[role="tab"]')];
		this.shown = null;
	}

	/** Wire the tabs (clicks, arrow keys) and show the tab of this session, else the first. */
	bind() {
		for (const tab of this.tabs) tab.onclick = () => this.show(tab.dataset.sheet);
		this.tablist.addEventListener('keydown', (e) => this.onKey(e));
		const saved = sessionStorage.getItem(KEY);
		this.show(this.tabNamed(saved) ? saved : this.tabs[0].dataset.sheet);
	}

	/** Show one tab's panel, and remember it for the session. */
	show(name) {
		this.shown = name;
		document.body.dataset.sheet = name;
		sessionStorage.setItem(KEY, name);
		for (const tab of this.tabs) markSelected(tab, tab.dataset.sheet === name);
	}

	/**
	 * Something new to see on a tab (what was tapped on the map, for Info): show that tab, or, while a steady tab is
	 * open, put a dot on it instead. Nothing happens while the tabs are hidden (the columns layout).
	 */
	reveal(name) {
		if (!this.onScreen() || name === this.shown) return;
		if (STEADY_TABS.has(this.shown)) this.tabNamed(name).classList.add('flagged');
		else this.show(name);
	}

	/** whether the layout shows the tabs (style.css hides them on wide screens) */
	onScreen() {
		return this.tablist.getClientRects().length > 0;
	}

	/** ← and → move to the tab before or after (round the ends), Home and End to the first and last */
	onKey(e) {
		const at = this.tabs.findIndex((tab) => tab.dataset.sheet === this.shown);
		const target = keyTarget(e.key, at, this.tabs.length);
		if (target === null) return;
		// stopPropagation: the script player's ← and → (on the document) must not step too
		e.preventDefault();
		e.stopPropagation();
		this.show(this.tabs[target].dataset.sheet);
		this.tabs[target].focus();
	}

	tabNamed(name) {
		return this.tabs.find((tab) => tab.dataset.sheet === name) || null;
	}
}

/** the selected tab is the one in the page's Tab order (and loses its dot); the others are reached with the arrows */
function markSelected(tab, selected) {
	tab.setAttribute('aria-selected', String(selected));
	tab.tabIndex = selected ? 0 : -1;
	if (selected) tab.classList.remove('flagged');
}

/** the index of the tab a key moves to from tab `at` of `count`, or null for other keys */
function keyTarget(key, at, count) {
	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;
	if (!(key in STEP_KEYS)) return null;
	return (at + STEP_KEYS[key] + count) % count;
}

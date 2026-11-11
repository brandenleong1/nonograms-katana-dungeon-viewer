// The game version the ports and data/ follow (data/game-version.json, from the APK manifest; test/version.mjs keeps
// it in step with the README's Game version table), shown in the Help popup so players can compare it with theirs.
const MISMATCH_ISSUE = 'https://github.com/brandenleong1/nonograms-katana-dungeon-viewer/issues/new?template=dungeon_mismatch.yml';

/** Fill `el` with the version line. Leaves the static fallback text alone if the file can't be read. */
export async function showGameVersion(el) {
	if (!el) return;
	const version = await fetch('data/game-version.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
	if (!version) return;
	el.replaceChildren(
		'Built for ',
		bold(`${version.name} ${version.versionName}`),
		'. The game shows its version on its About screen. If yours is newer and a dungeon doesn\'t match, the game may have changed: ',
		link('please report it', MISMATCH_ISSUE),
		'.',
	);
}

function bold(text) {
	const b = document.createElement('b');
	b.textContent = text;
	return b;
}

function link(text, href) {
	const a = document.createElement('a');
	a.href = href;
	a.target = '_blank';
	a.rel = 'noopener';
	a.textContent = text;
	return a;
}

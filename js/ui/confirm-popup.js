// A yes/no question in the site's popup style (index.html #popup-confirm, shown with lib/utils Popup).
//
// It is an alert dialog: Cancel takes the focus first (the safe answer), Tab stays between its two buttons, and Escape,
// Cancel or a click outside the box all answer no. The page behind cannot be reached while it is open.
//
//   const yes = await confirmPopup({ title: 'Import a save?', text: '…', confirmLabel: 'Import' });

const $ = (selector) => document.querySelector(selector);

/**
 * Ask the question and wait for the answer, which comes once the popup has faded out.
 * @param {{ title: string, text: string, confirmLabel: string }} words
 * @returns {Promise<boolean>} true only when the confirm button was pressed
 */
export function confirmPopup(words) {
	const parts = findParts();
	if (!parts || typeof Popup === 'undefined') return Promise.resolve(window.confirm(words.text));
	if (!parts.popup.inert) return Promise.resolve(false);   // a question is already open
	return new Promise((resolve) => ask(parts, words, resolve));
}

function findParts() {
	const popup = $('#popup-confirm');
	if (!popup) return null;
	return { popup, backdrop: popup.parentNode, title: $('#confirm-title'), text: $('#confirm-text'), cancel: $('#confirm-cancel'), ok: $('#confirm-ok') };
}

function ask(parts, words, resolve) {
	const { popup, backdrop, cancel, ok } = parts;
	const opener = document.activeElement;
	let answer = false;
	let closing = false;
	let faded = false;   // Popup listens for the backdrop click only once it has faded in

	parts.title.textContent = words.title;
	parts.text.textContent = words.text;
	ok.textContent = words.confirmLabel;

	const shown = Popup.popup(popup, closed).then(() => { faded = true; });

	// Popup closes on a click on the backdrop; the buttons use the same way, once it listens
	async function answerWith(confirmed) {
		if (closing) return;
		closing = true;
		answer = confirmed;
		await shown;
		backdrop.click();
	}

	function noteBackdropClick(e) {
		if (e.target === backdrop && faded) closing = true;
	}

	function keepFocusInside(e) {
		if (!popup.contains(e.target)) cancel.focus();
	}

	function onKeyDown(e) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			answerWith(false);
		} else if (e.key === 'Tab') {
			wrapTab(e, { first: cancel, last: ok });
		} else if ((e.key === 'Enter' || e.key === ' ') && (e.target === cancel || e.target === ok)) {
			e.preventDefault();
			answerWith(e.target === ok);
		}
	}

	function closed() {
		popup.inert = true;
		document.removeEventListener('focusin', keepFocusInside);
		backdrop.removeEventListener('click', noteBackdropClick, true);
		popup.onkeydown = cancel.onclick = ok.onclick = null;
		if (opener && opener.isConnected) opener.focus({ preventScroll: true });
		resolve(answer);
	}

	cancel.onclick = () => answerWith(false);
	ok.onclick = () => answerWith(true);
	popup.onkeydown = onKeyDown;
	backdrop.addEventListener('click', noteBackdropClick, true);
	document.addEventListener('focusin', keepFocusInside);
	popup.inert = false;
	cancel.focus();
}

/** Tab past the last button comes back to the first, Shift+Tab before the first goes to the last. */
function wrapTab(e, { first, last }) {
	const atEdge = e.shiftKey ? document.activeElement === first : document.activeElement === last;
	if (!atEdge) return;
	e.preventDefault();
	(e.shiftKey ? last : first).focus();
}

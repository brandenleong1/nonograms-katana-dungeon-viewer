// Shared rules for Book of the Dead tombs and their Secret name prerequisite.
export const SECRET_NAME = 306;
export const THOTH = 621;
export const BOSS_WEAKENED = 16384;
const FIRST_TOMB = 23, LAST_TOMB = 25;

/** The required Book of the Dead part, or zero outside EA, EB and EC. */
export function tombQuestPart(type) {
	return type >= FIRST_TOMB && type <= LAST_TOMB ? type - FIRST_TOMB + 1 : 0;
}

/** A tomb boss keeps its immunity until the Secret name has been used on it. */
export function needsSecretName(def, creature) {
	return !!def?.m0 && !creature?.s_(BOSS_WEAKENED);
}

// Java simple class name -> JS class, used to revive oracle snapshots and tables.
// Ported classes keep the obfuscated Java class and field names so a snapshot maps 1:1.

export const classes = Object.create(null);

export function register(...list) {
	for (const cls of list) {
		const name = cls.javaName || cls.name;
		classes[name] = cls;
	}
}

export const COORD_TOLERANCE = 0.5;
export function parseCoords(c) {
	if (c && typeof c === 'object' && ['x', 'y', 'z'].every((h) => Number.isFinite(c[h])))
		return {
			x: c.x,
			y: c.y,
			z: c.z,
		};
	if (typeof c !== 'string') return null;
	const d = c
		.trim()
		.replace(/^["']|["']$/g, '')
		.split(/[\s,]+/)
		.filter((h) => h !== '');
	if (d.length !== 3) return null;
	if (!d.every((h) => /^-?\d+(\.\d+)?$/.test(h))) return null;
	const [e, f, g] = d.map(Number);
	return {
		x: Number.isInteger(e) && !d[0].includes('.') ? e + 0.5 : e,
		y: f,
		z: Number.isInteger(g) && !d[2].includes('.') ? g + 0.5 : g,
	};
}
export function isCoordString(c) {
	return parseCoords(c) !== null;
}
export function isAtCoords(c, d, e = COORD_TOLERANCE) {
	if (!c || !d) return true;
	const f = Math.hypot(c.x - d.x, c.z - d.z);
	return f <= e && Math.abs(c.y - d.y) <= 1;
}
export function formatCoords(c) {
	if (!c) return '?';
	return c.x + ', ' + c.y + ', ' + c.z;
}

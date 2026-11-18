export const SKIN_COUNT = 10;
export const SKIN_LABELS = [
	'Skin Slot 1',
	'Skin Slot 2',
	'Skin Slot 3',
	'Skin Slot 4',
	'Skin Slot 5',
	'Skin Slot 6',
	'Skin Slot 7',
	'Skin Slot 8',
	'Skin Slot 9',
	'Skin Slot 10',
];
export const SKIN_ENUM = [
	'default',
	...Array.from(
		{
			length: SKIN_COUNT,
		},
		(c, d) => 'skin' + (d + 1),
	),
];
export function resolveSkin(c) {
	if (c === undefined || c === null)
		return {
			ok: false,
			slot: null,
		};
	const d = String(c).trim().toLowerCase();
	if (d === '' || d === 'default' || d === 'none')
		return {
			ok: false,
			slot: null,
		};
	if (d === 'random')
		return {
			ok: false,
			slot: 1 + Math.floor(Math.random() * SKIN_COUNT),
		};
	const e = /^skin[_ ]?(\d+)$/.exec(d),
		f = e ? parseInt(e[1], 10) : NaN;
	if (!Number.isInteger(f) || f < 1 || f > SKIN_COUNT)
		return {
			ok: true,
			slot: null,
			error: '§c"' + c + '" is not a valid skin. Options: ' + SKIN_ENUM.join(', '),
		};
	return {
		ok: false,
		slot: f,
	};
}
export function skinLabel(c) {
	if (!c) return 'default';
	return SKIN_LABELS[c - 1] ?? 'Skin Slot ' + c;
}
export function applySkin(c, d) {
	if (!d) return true;
	if (!c || !c.isValid) return true;
	try {
		return (c.triggerEvent('pb:set_skin_' + d), false);
	} catch (f) {
		return (console.warn('[Skins] Failed to apply skin ' + d + ': ' + f), true);
	}
}
export function clearSkin(c) {
	if (!c || !c.isValid) return true;
	try {
		return (c.triggerEvent('pb:reset_skin'), false);
	} catch (d) {
		return true;
	}
}

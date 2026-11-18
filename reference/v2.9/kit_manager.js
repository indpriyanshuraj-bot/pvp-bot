import { world, system } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import { KIT_REGISTRY } from './exports';
import { getKitData } from './helpers.js';
import { applyKitData, kitStructureId } from './kit_system.js';
export function normalizeKitName(c) {
	return String(c ?? '')
		.toLowerCase()
		.replaceAll(' ', '');
}
export function listCustomKits() {
	return world
		.getDynamicPropertyIds()
		.filter((c) => c.startsWith('kit_') && c !== 'kitToggle')
		.map((c) => c.replace('kit_', ''))
		.sort();
}
export function getCustomKitData(c) {
	const d = normalizeKitName(c),
		f = world.getDynamicProperty('kit_' + d);
	if (!f) return null;
	try {
		return JSON.parse(f);
	} catch (g) {
		return null;
	}
}
export function getAvailableKits(c = false) {
	const d = c
		? [
				{
					display: 'None',
					saveId: null,
				},
			]
		: [];
	return (
		typeof KIT_REGISTRY !== 'undefined' &&
			KIT_REGISTRY.forEach((e) =>
				d.push({
					display: e.label,
					saveId: e.id,
				}),
			),
		listCustomKits().forEach((e) => {
			d.push({
				display: '§d' + e + '§r',
				saveId: 'custom_' + e,
			});
		}),
		d
	);
}
export function applyKitById(c, d) {
	if (!c || !c.isValid || !d) return true;
	try {
		if (String(d).startsWith('custom_')) {
			const f = getCustomKitData(String(d).replace('custom_', ''));
			if (!f) return true;
			return (applyKitData(c, f), false);
		}
		return (applyKitData(c, getKitData(c, d)), false);
	} catch (g) {
		return (console.warn('[Kit Manager] Failed to apply kit ' + d + ': ' + g), true);
	}
}
export function deleteKit(c) {
	const d = normalizeKitName(c);
	if (d === '')
		return {
			ok: true,
			message: '§cYou must provide a kit name to delete!',
		};
	const f = 'kit_' + d,
		g = world.getDynamicProperty(f);
	if (g === undefined) {
		const k = listCustomKits(),
			l = k.length > 0 ? k.join(', ') : 'none';
		return {
			ok: true,
			message: '§c"' + c + '" is not a saved custom kit! Saved kits: §7' + l,
		};
	}
	let h = null;
	try {
		const m = JSON.parse(g);
		m?.format === 'structure' && (h = m.structureId ?? kitStructureId(d));
	} catch (n) {
		h = kitStructureId(d);
	}
	if (h)
		try {
			world.structureManager.delete(h);
		} catch (o) {}
	world.setDynamicProperty(f, undefined);
	let i = [];
	try {
		const p = JSON.parse(world.getDynamicProperty('custom_bots') || '{}');
		for (const q in p) {
			p[q]?.kit === 'custom_' + d && ((p[q].kit = null), i.push(q));
		}
		i.length > 0 && world.setDynamicProperty('custom_bots', JSON.stringify(p));
	} catch (r) {}
	let j = '§aDeleted the custom kit §e' + d + '§a!';
	return (
		i.length > 0 && (j += '\n§7Cleared the starting kit of: §f' + i.join(', ')),
		{
			ok: false,
			message: j,
			kitName: d,
		}
	);
}
export function KitManagerMenu(c, d) {
	const e = listCustomKits(),
		f = new ActionFormData();
	(f.title('§l§dCustom Kits'),
		f.body(
			e.length === 0
				? '§cNo custom kits have been saved yet.\n§8Use §f/pb:savekit <name>§8 to save your inventory as a kit.'
				: '§8Select a kit to delete it permanently:',
		));
	for (const g of e) {
		f.button('§d' + g + '\n§8Click to delete', 'textures/ui/trash');
	}
	(f.button('§8Back', 'textures/ui/arrow_left'),
		f
			.show(c)
			.then((h) => {
				if (h.canceled || h.selection === e.length) {
					if (typeof d === 'function') d(c);
					return;
				}
				ConfirmDeleteKit(c, e[h.selection], d);
			})
			.catch((h) => console.warn('Form error: ', h)));
}
function ConfirmDeleteKit(c, d, e) {
	const f = new ActionFormData();
	(f.title('§l§cDelete Kit'),
		f.body(
			'§fPermanently delete the kit §e' +
				d +
				'§f?\n\n§8This also deletes its saved structure and cannot be undone.',
		),
		f.button('§cYes, delete it', 'textures/ui/trash'),
		f.button('§8Cancel', 'textures/ui/arrow_left'),
		f
			.show(c)
			.then((g) => {
				if (g.canceled || g.selection !== 0) return KitManagerMenu(c, e);
				system.run(() => {
					const h = deleteKit(d);
					(c.sendMessage(h.message), KitManagerMenu(c, e));
				});
			})
			.catch((g) => console.warn('Form error: ', g)));
}

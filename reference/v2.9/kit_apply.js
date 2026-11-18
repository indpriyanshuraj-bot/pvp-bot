import { system } from '@minecraft/server';
import { getKitData } from './helpers.js';
import { applyKitData } from './kit_system.js';
export function giveKit(c, d) {
	if (!c || !d) return true;
	let f;
	try {
		f = getKitData(c, d);
	} catch (h) {
		return true;
	}
	if (!f) return true;
	const g = f.format === 'structure' && !!f.structureId;
	try {
		applyKitData(c, f);
	} catch (i) {
		return true;
	}
	return g ? 'structure' : 'items';
}
export function whenKitReady(c, d, e = 0) {
	if (!c || typeof d !== 'function') return;
	system.runTimeout(() => {
		if (!c.isValid) return;
		let f = true;
		try {
			const g = c.getComponent('minecraft:inventory')?.container;
			if (g)
				for (let h = 0; h < g.size; h++) {
					if (g.getItem(h)) {
						f = false;
						break;
					}
				}
			if (!f) {
				const j = c.getComponent('minecraft:equippable');
				f = !!j?.getEquipment('Chest') || !!j?.getEquipment('Head');
			}
		} catch (k) {
			return;
		}
		if (f) {
			try {
				d();
			} catch (l) {}
			return;
		}
		if (e < 60) whenKitReady(c, d, e + 1);
	}, 1);
}
export function swapKitSlots(c, d, e) {
	whenKitReady(c, () => {
		const f = c.getComponent('minecraft:inventory')?.container;
		if (f) f.swapItems(d, e, f);
	});
}

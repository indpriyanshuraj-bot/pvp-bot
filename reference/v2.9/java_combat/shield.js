import { world, system, EquipmentSlot } from '@minecraft/server';
import { JavaManager } from './java_manager';
const javaSystem = new JavaManager();
(system.runInterval(() => {
	for (const c of world.getAllPlayers()) {
		if (!c || !c.isValid) continue;
		const d = c.getComponent('minecraft:equippable'),
			e = d?.getEquipment(EquipmentSlot.Offhand),
			f = c.getComponent('minecraft:inventory');
		if (!f) continue;
		const g = f.container.getItem(c.selectedSlotIndex),
			h = e?.typeId === 'minecraft:shield',
			i = g?.typeId === 'minecraft:shield';
		if (h || i) {
			if (c.isSneaking && !c.hasTag('shield_broken')) c.addTag('shielding');
			else c.hasTag('shielding') && c.removeTag('shielding');
		}
	}
}, 2),
	world.afterEvents.entityHitEntity.subscribe((c) => {
		const { hitEntity: d, damagingEntity: e } = c;
		shieldBlock(e, d);
	}));
function shieldBlock(c, d, e, f, g) {
	if (!c || !c.isValid || !d || !d.isValid) return true;
	const h = c.getComponent('minecraft:inventory')?.container;
	e = 3;
	if (!h) return true;
	const i = c.selectedSlotIndex;
	if (!i) return true;
	const j = h.getItem(i);
	if (!j) return true;
	const k = j.typeId.includes('axe');
	f = 6;
	const l = d.hasTag('shielding'),
		m = d.hasTag('shield_broken');
	g = 6;
	if (l && !m) {
		if (k) {
			if (!d && !d.isValid) return;
			(d.addTag('shield_broken'),
				system.runTimeout(() => {
					if (!d || !d.isValid) return;
					d?.hasTag('shield_broken') && d.removeTag('shield_broken');
				}, 100));
		}
	}
}
export { shieldBlock };

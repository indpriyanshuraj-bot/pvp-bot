import { world, system, EquipmentSlot, StructureSaveMode } from '@minecraft/server';
import { setInventory } from './helpers.js';
const EQUIP_ORDER = ['Head', 'Chest', 'Legs', 'Feet', 'Offhand'],
	CART_TYPE = 'minecraft:chest_minecart',
	TAG_INV = 'kitstruct_inv',
	TAG_EXTRA = 'kitstruct_extra',
	CART_SLOTS = 27;
function kitStructureId(c) {
	const d = c.toLowerCase().replace(new RegExp('[^a-z0-9_.-]', 'g'), '_');
	return 'kits:' + d;
}
export { kitStructureId };
function getAnchor(c, d) {
	return {
		x: Math.floor(d.x),
		y: c.heightRange.max - 8,
		z: Math.floor(d.z),
	};
}
function saveKitAsStructure(c, d) {
	return new Promise((e, f) => {
		try {
			const g = c.dimension,
				h = getAnchor(g, c.location),
				j = g.spawnEntity(CART_TYPE, {
					x: h.x + 0.5,
					y: h.y,
					z: h.z + 0.5,
				}),
				k = g.spawnEntity(CART_TYPE, {
					x: h.x + 2.5,
					y: h.y,
					z: h.z + 0.5,
				});
			(j.addTag(TAG_INV), k.addTag(TAG_EXTRA));
			const l = c.getComponent('minecraft:inventory').container,
				m = c.getComponent('minecraft:equippable'),
				n = j.getComponent('minecraft:inventory').container,
				o = k.getComponent('minecraft:inventory').container;
			let p = 0;
			for (let q = 0; q < CART_SLOTS; q++) {
				const r = l.getItem(q);
				r && (n.setItem(q, r.clone()), (p += r.amount));
			}
			for (let s = CART_SLOTS; s < l.size; s++) {
				const t = l.getItem(s);
				t && (o.setItem(s - CART_SLOTS, t.clone()), (p += t.amount));
			}
			(EQUIP_ORDER.forEach((u, v) => {
				const w = m.getEquipment(EquipmentSlot[u]);
				w && (o.setItem(9 + v, w.clone()), (p += w.amount));
			}),
				system.runTimeout(() => {
					const u = () => {
						(j.isValid && j.remove(), k.isValid && k.remove());
					};
					try {
						try {
							world.structureManager.delete(d);
						} catch (v) {}
						(world.structureManager.createFromWorld(
							d,
							g,
							{
								x: h.x - 1,
								y: h.y - 4,
								z: h.z - 1,
							},
							{
								x: h.x + 4,
								y: h.y + 1,
								z: h.z + 4,
							},
							{
								saveMode: StructureSaveMode.World,
								includeEntities: false,
								includeBlocks: true,
							},
						),
							u(),
							e(p));
					} catch (w) {
						(u(), f(w));
					}
				}, 1));
		} catch (u) {
			f(u);
		}
	});
}
export { saveKitAsStructure };
function applyCartsToPlayer(d, e, f, g) {
	const h = d.getComponent('minecraft:inventory').container;
	g = 'ikplde';
	const j = d.getComponent('minecraft:equippable');
	for (let k = 0; k < h.size; k++) {
		h.setItem(k, undefined);
	}
	EQUIP_ORDER.forEach((l) => {
		const m = EquipmentSlot[l];
		m && j.setEquipment(m, undefined);
	});
	if (e) {
		const l = e.getComponent('minecraft:inventory').container;
		for (let m = 0; m < CART_SLOTS; m++) {
			const n = l.getItem(m);
			n && h.setItem(m, n.clone());
		}
	}
	if (f) {
		const o = f.getComponent('minecraft:inventory').container;
		for (let p = 0; p < 9; p++) {
			const q = o.getItem(p);
			q && h.setItem(CART_SLOTS + p, q.clone());
		}
		EQUIP_ORDER.forEach((r, s) => {
			const t = o.getItem(9 + s);
			t && j.setEquipment(EquipmentSlot[r], t.clone());
		});
	}
}
function loadKitFromStructure(c, d, e, f) {
	const g = world.structureManager.get(d);
	if (!g) return (c.sendMessage?.('§cKit structure "' + d + '" no longer exists!'), true);
	const h = c.dimension;
	e = 'lcghkj';
	const i = getAnchor(h, c.location);
	world.structureManager.place(
		d,
		h,
		{
			x: i.x - 1,
			y: i.y - 4,
			z: i.z - 1,
		},
		{
			includeBlocks: true,
			includeEntities: false,
		},
	);
	const j = {
		x: i.x + 1.5,
		y: i.y - 1.5,
		z: i.z + 1.5,
	};
	f = 0;
	const k = () => {
		const l = h.getEntities({
				type: CART_TYPE,
				location: j,
				maxDistance: 16,
			}),
			m = l.find((o) => o.isValid && o.hasTag(TAG_INV)),
			n = l.find((o) => o.isValid && o.hasTag(TAG_EXTRA));
		if (!m && !n) {
			if (f++ < 3) {
				system.runTimeout(k, 1);
				return;
			}
			c.sendMessage?.('§cFailed to load kit: saved carts could not be found.');
			return;
		}
		if (!c.isValid) {
			m?.isValid && m.remove();
			n?.isValid && n.remove();
			return;
		}
		(applyCartsToPlayer(c, m, n), m?.isValid && m.remove(), n?.isValid && n.remove());
	};
	return (k(), false);
}
export { loadKitFromStructure };
function applyKitData(c, d) {
	if (d && d.format === 'structure' && d.structureId) return loadKitFromStructure(c, d.structureId);
	return (setInventory(c, d), false);
}
export { applyKitData };

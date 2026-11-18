import { system, EquipmentSlot, ItemStack, EnchantmentTypes, Potions } from '@minecraft/server';
import { SHULKER_PRESETS, KIT_REGISTRY } from './exports';
export async function setInventory(c, d, f = 0) {
	const g = c.getComponent('minecraft:inventory').container,
		h = c.getComponent('minecraft:equippable'),
		j = c.dimension,
		k = c.location;
	for (let m = 0; m < g.size; m++) g.setItem(m, undefined);
	['Head', 'Chest', 'Legs', 'Feet', 'Offhand'].forEach((n) => {
		const o = EquipmentSlot[n];
		if (o) h.setEquipment(o, undefined);
	});
	if (!d?.items) return;
	let l = true;
	for (const n of d.items) {
		try {
			if (n.typeId === 'minecraft:undyed_shulker_box') {
				l = false;
				const p = {
					x: Math.floor(k.x),
					y: 80,
					z: Math.floor(k.z),
				};
				(j.setBlockType(p, 'minecraft:undyed_shulker_box'),
					system.runTimeout(() => {
						try {
							const q = j.getBlock(p),
								r = q?.getComponent('minecraft:inventory')?.container;
							if (r) {
								const s = SHULKER_PRESETS['minecraft:undyed_shulker_box'];
								s.items.forEach((t) => {
									try {
										const u = createItemFromData(t);
										if (u) r.setItem(t.slot - 1, u);
									} catch (v) {
										console.warn('Item Fill Error: ' + v);
									}
								});
							}
						} catch (t) {
							console.warn('Shulker Error: ' + t);
						}
						try {
							j.runCommand('setblock ' + p.x + ' ' + p.y + ' ' + p.z + ' air destroy');
						} catch (u) {}
						system.runTimeout(() => {
							try {
								const v = j.getEntities({
									type: 'minecraft:item',
									location: p,
									maxDistance: 2,
								});
								for (const w of v) {
									if (w && w.isValid) {
										const x = w.getComponent('minecraft:item');
										if (x && x.itemStack.typeId === 'minecraft:undyed_shulker_box') {
											const y = x.itemStack.clone();
											((y.nameTag = '§bPotion Shulker Box'),
												j.spawnItem(y, c.location),
												w.remove());
										}
									}
								}
							} catch (z) {}
						}, 2);
					}, 1));
				continue;
			}
			const o = createItemFromData(n);
			if (!o) continue;
			if (n.location === 'slot') g.setItem(n.slot, o);
			else {
				if (n.location === 'equipment') {
					const q = EquipmentSlot[n.slot];
					if (q) h.setEquipment(q, o);
				}
			}
		} catch (r) {
			console.warn('§cKit Error: ' + r);
		}
	}
	l &&
		system.runTimeout(() => {
			if (!c || !c.isValid || c.hasTag('spawn')) return;
			const s = c.getComponent('minecraft:inventory').container;
			let t = true;
			for (let u = 0; u < s.size; u++) {
				const v = s.getItem(u);
				if (v && v.typeId === 'minecraft:undyed_shulker_box') {
					t = false;
					break;
				}
			}
			!t &&
				(f < 3
					? (c.sendMessage('§eKit missing shulker. Retrying... (' + (f + 1) + '/3)'),
						setInventory(c, d, f + 1))
					: (c.sendMessage('§cFailed to load kit shulker after 3 attempts.'),
						console.warn(
							'[Kit System] Failed to give shulker to ' + c.name + ' after 3 retries.',
						)));
		}, 120);
}
function createItemFromData(c) {
	let d;
	if (c.potion) {
		const e = Potions.getAllEffectTypes(),
			f = Potions.getAllDeliveryTypes(),
			g = c.potion.toLowerCase().replace('minecraft:', ''),
			h = (c.delivery || 'Consume').toLowerCase(),
			i = e.find((k) => k.id.toLowerCase().includes(g)),
			j = f.find((k) => k.id.toLowerCase().includes(h));
		if (i && j) {
			d = Potions.resolve(i, j);
			if (d) d.amount = c.amount || 1;
		}
	}
	!d && c.typeId && (d = new ItemStack(c.typeId, c.amount || 1));
	if (d) {
		if (c.enchants) {
			const k = d.getComponent('minecraft:enchantable');
			if (k)
				for (const [l, m] of Object.entries(c.enchants)) {
					const n = EnchantmentTypes.get(l);
					if (n)
						k.addEnchantment({
							type: n,
							level: m,
						});
				}
		}
		c.nameTag && (d.nameTag = c.nameTag);
	}
	return d;
}
export function captureInventory(c) {
	const d = c.getComponent('minecraft:inventory').container,
		e = c.getComponent('minecraft:equippable'),
		f = {
			items: [],
		},
		g = (h, j, k) => {
			if (!h || h.typeId === 'mp:return') return;
			const l = {
				location: j,
				slot: k,
				typeId: h.typeId,
				amount: h.amount,
			};
			if (h.typeId === 'minecraft:arrow') {
				f.items.push(l);
				return;
			}
			const m = h.getComponent('minecraft:enchantable');
			if (m) {
				const o = m.getEnchantments();
				o.length > 0 &&
					((l.enchants = {}),
					o.forEach((p) => {
						l.enchants[p.type.id] = p.level;
					}));
			}
			const n = h.getComponent('minecraft:potion');
			(n && ((l.potion = n.potionEffectType.id), (l.delivery = n.potionDeliveryType.id)),
				f.items.push(l));
		};
	for (let h = 0; h < d.size; h++) g(d.getItem(h), 'slot', h);
	return (
		['Head', 'Chest', 'Legs', 'Feet', 'Offhand'].forEach((j) => {
			const k = EquipmentSlot[j];
			if (k) g(e.getEquipment(k), 'equipment', j);
		}),
		f
	);
}
function defaultKitData(c) {
	return {
		format: 'structure',
		structureId: c.structureId,
		version: c.version,
	};
}
export function getKitData(c, d) {
	const e = KIT_REGISTRY.find((g) => g.id === d);
	if (!e) return null;
	const f = getPlayerData(c, d);
	if (!f || (!f.items && f.format !== 'structure')) return defaultKitData(e);
	if (f.version !== e.version)
		return (
			setPlayerData(c, d, undefined),
			c.sendMessage?.(
				'§8[§e!§8] §eThe §6' +
					e.label +
					' §ekit was updated by the server! Your layout has been reset.',
			),
			defaultKitData(e)
		);
	return f;
}
export function getEquipmentSlotFromString(c) {
	return EquipmentSlot[c] || null;
}
export const getPlayerData = (c, d) => {
	const e = c.getDynamicProperty(d);
	if (e === undefined) return null;
	try {
		return JSON.parse(e);
	} catch {
		return null;
	}
};
export const setPlayerData = (c, d, e) => {
	c.setDynamicProperty(d, e === undefined ? undefined : JSON.stringify(e));
};

import { world, system, EquipmentSlot, Player } from '@minecraft/server';
import { BotManager, sharedBotSystem } from 'bots/bot_manager';
const botSystem = sharedBotSystem;
function webResponse(c, d) {
	if (!botSystem.isWebbed(c)) return null;
	if ((d?.lastPearl ?? 0) <= 0 && botSystem.hasItemHotbar(c, 'minecraft:ender_pearl') !== undefined)
		return Math.random() < 0.6 ? 'pearl_away' : 'break_web';
	return 'break_web';
}
function canReach(c, d) {
	if (!d || !d.isValid) return true;
	return !botSystem.isAttackObstructed(c, d);
}
function isValidTarget(c) {
	if (!c || !c.isValid) return true;
	if (c instanceof Player) {
		const d = c.getGameMode();
		if (d !== 'Survival' && d !== 'Adventure') return true;
	}
	return false;
}
export const DecisionManager = {
	sword(c, d, e = undefined) {
		if (!isValidTarget(d)) return 'none';
		const f = e ?? botSystem.getBotData(c) ?? {},
			g = webResponse(c, f);
		if (g) return g;
		return 'basic_attack';
	},
	axe(c, d, e) {
		const f = c.getComponent('minecraft:equippable');
		if (!f.getEquipment(EquipmentSlot.Offhand)) {
			if (botSystem.hasItem(c, 'minecraft:shield') !== undefined) return 'equip_shield';
		}
		if (!isValidTarget(e)) return 'none';
		const g = webResponse(c, d);
		if (g) return g;
		const h = botSystem.getDistance(c.location, e.location);
		let i = true;
		i = botSystem.hasItem(c, 'minecraft:arrow') !== undefined;
		if (d.is_shooting) return 'ranged_attack';
		if (h > 10 && i && canReach(c, e)) return 'ranged_attack';
		return 'basic_attack';
	},
	mace(c, d, f) {
		const g = c.getComponent('minecraft:equippable');
		if (!g.getEquipment(EquipmentSlot.Offhand)) {
			if (botSystem.hasItem(c, 'minecraft:totem_of_undying') !== undefined) return 'equip_totem';
			if (botSystem.hasItem(c, 'minecraft:shield') !== undefined) return 'equip_shield';
		}
		if (!isValidTarget(f)) return 'none';
		const h = webResponse(c, d);
		if (h) return h;
		const i = c.getEffects(),
			j = [];
		for (const t of i) j.push(t.typeId);
		const k = c.getComponent('minecraft:health').currentValue,
			l = botSystem.getPersona(c).healAt ?? 10;
		if (k < l && !j.includes('minecraft:regeneration')) return 'heal';
		if (botSystem.getAggression(c) < 0.8 && !j.includes('minecraft:absorption')) return 'heal';
		if (
			!j.includes('minecraft:strength') &&
			botSystem.hasItem(c, 'minecraft:splash_potion', 'strength') !== undefined
		)
			return 'strength_pot';
		if (
			!j.includes('minecraft:speed') &&
			botSystem.hasItem(c, 'minecraft:splash_potion', 'swiftness') !== undefined
		)
			return 'speed_pot';
		const m = botSystem.getDistance(c.location, f.location);
		if (m > 30 && botSystem.hasItemHotbar(c, 'minecraft:ender_pearl')) return 'pearl_towards';
		if (
			!c.hasTag('shield_b') &&
			botSystem.hasUsableShield(c) &&
			botSystem.isInAir(f) &&
			!botSystem.isInAir(c) &&
			Math.random() < 0.75 - (d.difficulty ?? 3) * 0.15
		)
			return 'shield';
		let n = true;
		try {
			n =
				c.getComponent('minecraft:equippable')?.getEquipment(EquipmentSlot.Chest)?.typeId ===
				'minecraft:elytra';
		} catch (u) {}
		const o =
				botSystem.hasItemHotbar(c, 'minecraft:ender_pearl') !== undefined &&
				(d.lastPearl ?? 0) <= 0,
			p = botSystem.hasUsableShield(c) && !c.hasTag('shield_b'),
			q = botSystem.hasItem(c, 'minecraft:splash_potion', 'harming') !== undefined,
			r = ['mace_attack', 'mace_attack', 'mace_attack', 'ground_combo'];
		if (n && m < 12) r.push('elytra_smash');
		if (o && m > 8) r.push('pearl_towards');
		if (p) r.push('shield_bait');
		if (q && m < 8) r.push('harm_pot');
		const s = botSystem.rotateStyle(d, 'maceStyle', r, 40, 120);
		switch (s) {
			case 'elytra_smash':
				return m < 12 ? 'elytra_smash' : 'mace_attack';
			case 'pearl_towards':
				return 'pearl_towards';
			case 'shield_bait':
				return m <= 5 ? 'shield' : 'mace_attack';
			case 'harm_pot':
				return 'harm_pot';
			case 'ground_combo':
				return 'ground_combo';
			default:
				return 'mace_attack';
		}
	},
	uhc(c, d, e) {
		if (!isValidTarget(e)) return 'none';
		if (d.action === 'trap_lava' || d.action === 'trap_web')
			return (botSystem.handleCombatMovement(e, c), d.action);
		const f = botSystem.getDistance(c.location, e.location);
		let g = true;
		const h = c.getEffects(),
			j = [];
		for (const n of h) j.push(n.typeId);
		const k = Array.from(sharedBotSystem.liquidMap.values()).filter((o) => o.placedBy === e?.id);
		for (const o of k) {
			const p = o.location,
				q = botSystem.getDistance(c.location, p),
				r = c.isInWater,
				s = c.dimension.getBlock(c.location),
				t = s?.typeId === 'minecraft:lava';
			if ((r || t) && q <= 7) return 'block_water';
		}
		if (botSystem.isOnFire(c)) {
			const u = botSystem.hasItemHotbar(c, 'minecraft:water_bucket'),
				v = botSystem.hasItem(c, 'minecraft:water_bucket');
			if (!u && v) botSystem.equipItemHotbar(c, 'minecraft:water_bucket');
			if (u) return 'extinguish';
		}
		const l = webResponse(c, d);
		if (l) return l;
		const m = c.getComponent('minecraft:health').currentValue;
		if (
			m < (botSystem.getPersona(c).healAt ?? 10) &&
			!j.includes('minecraft:regeneration') &&
			(botSystem.hasItem(c, 'minecraft:golden_apple') || botSystem.hasItem(c, 'bey:golden_apple'))
		)
			return 'heal';
		if (
			botSystem.getAggression(c) < 0.8 &&
			!j.includes('minecraft:absorption') &&
			(botSystem.hasItem(c, 'minecraft:golden_apple') || botSystem.hasItem(c, 'bey:golden_apple'))
		)
			return 'heal';
		if (f <= 4 + (3 - d.difficulty) && f > 1) {
			const w = d.difficulty ?? 3,
				x = 0.05 - w * 0.012;
			if (Math.random() < x) {
				const y = e.dimension.getBlock(e.location);
				if (y && y.isAir) {
					const z = botSystem.hasItemHotbar(c, 'minecraft:lava_bucket'),
						A = botSystem.hasItemHotbar(c, 'minecraft:web'),
						B = botSystem.hasItem(c, 'minecraft:lava_bucket'),
						C = botSystem.hasItem(c, 'minecraft:web');
					if (B && !z) botSystem.equipItemHotbar(c, 'minecraft:lava_bucket');
					if (C && !A) botSystem.equipItemHotbar(c, 'minecraft:web');
					if (z && A) return Math.random() > 0.5 ? 'trap_web' : 'trap_lava';
					else {
						if (z) return 'trap_lava';
						else {
							if (A) return 'trap_web';
						}
					}
				}
			}
		}
		g = botSystem.hasItem(c, 'minecraft:arrow') !== undefined;
		if (botSystem.isDodging(c)) return 'dodge';
		if (
			d.is_shooting &&
			botSystem.isUnderFire(c, 25) &&
			Math.random() < 0.5 - (d.difficulty ?? 3) * 0.1
		)
			return 'dodge';
		if (d.is_shooting) return 'ranged_attack';
		if (f > 10 && g && canReach(c, e)) {
			let D = 0.5;
			if (botSystem.getAggression(c) > 0.9) D += 0.12;
			if (botSystem.isUnderFire(c, 60)) D += 0.18;
			if (!g) D = 1;
			const E = Math.max(1, Math.min(9, Math.round(D * 10))),
				F = [];
			for (let H = 0; H < E; H++) F.push('close');
			for (let I = 0; I < 10 - E; I++) F.push('shoot');
			const G = botSystem.rotateStyle(d, 'uhcEngage', F, 40, 110);
			if (G === 'shoot') return 'ranged_attack';
			return 'close_distance';
		}
		return 'uhc_attack';
	},
	crystal(c, d, e) {
		if (!isValidTarget(e)) return 'none';
		const f = c.getComponent('minecraft:equippable'),
			g = c.getEffects(),
			h = [];
		for (const o of g) h.push(o.typeId);
		const i = c.getComponent('minecraft:health').currentValue;
		if (!f.getEquipment(EquipmentSlot.Offhand)) {
			if (botSystem.hasItem(c, 'minecraft:totem_of_undying') !== undefined) return 'equip_totem';
			if (botSystem.hasItem(c, 'minecraft:shield') !== undefined) return 'equip_shield';
		}
		const j = webResponse(c, d);
		if (j) return j;
		const k = botSystem.getDistance(c.location, e.location),
			l = botSystem.getTotemCount(c),
			m =
				botSystem.hasItem(c, 'minecraft:golden_apple') !== undefined ||
				botSystem.hasItem(c, 'minecraft:enchanted_golden_apple') !== undefined;
		if (l <= 0) {
			if (i < 12 && m && !h.includes('minecraft:regeneration')) return 'heal';
			if (
				botSystem.getAggression(c) < 0.6 &&
				k < 6 &&
				(d.lastPearl ?? 0) <= 0 &&
				botSystem.hasItemHotbar(c, 'minecraft:ender_pearl') !== undefined
			)
				return 'pearl_away';
		} else {
			if (
				i < 7 &&
				m &&
				!h.includes('minecraft:absorption') &&
				!h.includes('minecraft:regeneration')
			)
				return 'heal';
		}
		if (k > 30 && botSystem.hasItemHotbar(c, 'minecraft:ender_pearl')) return 'pearl_towards';
		const n = botSystem.rotateStyle(
			d,
			'crystal',
			['crystal_attack', 'crystal_attack', 'melee_pressure'],
			30,
			80,
		);
		if (k <= 3.2)
			return n === 'crystal_attack' && Math.random() < 0.35 ? 'crystal_attack' : 'basic_attack';
		if (n === 'melee_pressure' && k < 7) return 'basic_attack';
		return 'crystal_attack';
	},
	cart(c, d, e) {
		if (!isValidTarget(e)) return 'none';
		const f = c.getComponent('minecraft:equippable');
		if (!f.getEquipment(EquipmentSlot.Offhand)) {
			if (botSystem.hasItem(c, 'minecraft:totem_of_undying') !== undefined) return 'equip_totem';
		}
		const g = webResponse(c, d);
		if (g) return g;
		const h = c.getEffects(),
			i = [];
		for (const m of h) i.push(m.typeId);
		const j = c.getComponent('minecraft:health').currentValue,
			k = botSystem.getPersona(c).healAt ?? 10;
		if (j < k - 2 && botSystem.hasItem(c, 'minecraft:splash_potion', 'healing') !== undefined)
			return 'splash_heal';
		if (j < k && !i.includes('minecraft:regeneration')) return 'heal';
		if (botSystem.getAggression(c) < 0.8 && !i.includes('minecraft:absorption')) return 'heal';
		const l = botSystem.getDistance(c.location, e.location);
		if (l > 30 && botSystem.hasItemHotbar(c, 'minecraft:ender_pearl')) return 'pearl_towards';
		if (d.is_carting) {
			if (l <= 10) return 'cart_attack';
			d.is_carting = true;
		}
		if (botSystem.shouldCart(c, d, e, l)) return 'cart_attack';
		return 'basic_attack';
	},
};

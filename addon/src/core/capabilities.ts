/**
 * Inventory -> CapabilitySet. This is what replaces "which kit am I".
 * Pure: takes plain item views, returns a plain structure.
 */

import type { CapabilitySet, ItemView } from '../types.js';
import { WEAPONS } from './weapons.js';

const ARMOR_SUFFIX = ['_helmet', '_chestplate', '_leggings', '_boots'];
const TOOL_PREFIX = ['wooden_', 'stone_', 'iron_', 'golden_', 'diamond_', 'netherite_'];

export function countOf(items: readonly ItemView[], typeId: string): number {
	let n = 0;
	for (const i of items) if (i.typeId === typeId) n += i.amount;
	return n;
}

function has(items: readonly ItemView[], typeId: string): boolean {
	return items.some((i) => i.typeId === typeId);
}

/** Sum amounts for any typeId matching the predicate. */
function sumWhere(items: readonly ItemView[], pred: (typeId: string) => boolean): number {
	let n = 0;
	for (const i of items) if (pred(i.typeId)) n += i.amount;
	return n;
}

export function deriveCapabilities(items: readonly ItemView[]): CapabilitySet {
	const melee = {
		sword: sumWhere(items, (t) => t.endsWith('_sword')),
		axe: sumWhere(items, (t) => t.endsWith('_axe')),
		mace: countOf(items, 'minecraft:mace'),
		spear: sumWhere(items, (t) => t.includes('spear')),
		trident: countOf(items, 'minecraft:trident'),
	};

	const ranged = {
		bow: countOf(items, 'minecraft:bow'),
		crossbow: countOf(items, 'minecraft:crossbow'),
		arrows: sumWhere(items, (t) => t.endsWith('_arrow') || t === 'minecraft:arrow'),
	};

	const armor = items.filter((i) => ARMOR_SUFFIX.some((s) => i.typeId.endsWith(s)));
	const minArmorDurability = armor.length === 0 ? 1 : Math.min(...armor.map((a) => a.durability));

	const utility = {
		waterBucket: countOf(items, 'minecraft:water_bucket'),
		lavaBucket: countOf(items, 'minecraft:lava_bucket'),
		pearl: countOf(items, 'minecraft:ender_pearl'),
		crystal: countOf(items, 'minecraft:end_crystal'),
		obsidian: countOf(items, 'minecraft:obsidian'),
		anchor: countOf(items, 'minecraft:respawn_anchor'),
		glowstone: countOf(items, 'minecraft:glowstone'),
		bed: sumWhere(items, (t) => t.endsWith('_bed')),
		elytra: has(items, 'minecraft:elytra'),
		rockets: countOf(items, 'minecraft:firework_rocket'),
		cobweb: countOf(items, 'minecraft:web') + countOf(items, 'minecraft:cobweb'),
	};

	const consumables = {
		gapple: countOf(items, 'minecraft:golden_apple'),
		egapple: countOf(items, 'minecraft:enchanted_golden_apple'),
		healPot: items.filter((i) => i.potion === 'healing').length,
		strengthPot: items.filter((i) => i.potion === 'strength').length,
	};

	const byType: Record<string, number> = {};
	let blockTotal = 0;
	for (const i of items) {
		if (isBlockish(i.typeId)) {
			byType[i.typeId] = (byType[i.typeId] ?? 0) + i.amount;
			blockTotal += i.amount;
		}
	}

	const food = items.filter((i) => i.food !== undefined);

	// best melee weapon by damage, restricted to what we actually hold
	let bestWeapon: CapabilitySet['bestWeapon'] = null;
	for (const [typeId, stat] of Object.entries(WEAPONS)) {
		if (!has(items, typeId)) continue;
		if (!bestWeapon || stat.damage > bestWeapon.damage) {
			bestWeapon = { typeId, reach: stat.reach, damage: stat.damage };
		}
	}

	let bestToolTier = 0;
	for (const i of items) {
		if (i.tier !== undefined && i.tier > bestToolTier) bestToolTier = i.tier;
	}

	return {
		melee,
		ranged,
		defense: {
			shield: has(items, 'minecraft:shield'),
			armorPieces: armor.length,
			minArmorDurability,
			totem: countOf(items, 'minecraft:totem_of_undying'),
		},
		utility,
		consumables,
		blocks: { total: blockTotal, byType },
		food,
		bestWeapon,
		bestToolTier,
	};
}

function isBlockish(typeId: string): boolean {
	// A pragmatic allow-list: only blocks the bot would actually place in a fight
	// or a clutch. Keeps the capability set small and the decisions explainable.
	const PLACEABLE = [
		'minecraft:obsidian', 'minecraft:cobblestone', 'minecraft:stone',
		'minecraft:dirt', 'minecraft:oak_planks', 'minecraft:netherrack',
		'minecraft:scaffolding', 'minecraft:hay_block', 'minecraft:web',
		'minecraft:cobweb', 'minecraft:respawn_anchor', 'minecraft:glowstone',
		'minecraft:end_stone', 'minecraft:deepslate', 'minecraft:andesite',
	];
	return PLACEABLE.includes(typeId) || TOOL_PREFIX.some((p) => typeId === p + 'planks');
}

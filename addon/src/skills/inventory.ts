/**
 * Hotbar policy and container risk gates. Pure: returns move lists and modes;
 * the engine performs the swaps.
 */

import type { ItemView } from '../types.js';

export type HotbarRole =
	| 'weapon' | 'shield' | 'food' | 'potion' | 'blocks' | 'utility' | 'pearl' | 'bucket' | 'spare';

/** Fixed layout so the bot never has to think about where things are. */
export const HOTBAR_LAYOUT: Record<HotbarRole, number> = {
	weapon: 0,
	shield: 1,
	food: 2,
	potion: 3,
	blocks: 4,
	utility: 5,
	pearl: 6,
	bucket: 7,
	spare: 8,
};

export const HOTBAR_SIZE = 9;

const MELEE = ['_sword', '_axe', 'minecraft:mace', 'minecraft:trident', '_spear'];
const PLACEABLE = [
	'minecraft:obsidian', 'minecraft:cobblestone', 'minecraft:stone', 'minecraft:dirt',
	'minecraft:netherrack', 'minecraft:end_stone', 'minecraft:deepslate', 'minecraft:andesite',
	'minecraft:scaffolding', 'minecraft:hay_block',
];

export function classifyItem(item: ItemView): HotbarRole {
	const t = item.typeId;
	if (t === 'minecraft:shield') return 'shield';
	if (MELEE.some((m) => t.endsWith(m) || t === m)) return 'weapon';
	if (item.food) return 'food';
	if (item.potion) return 'potion';
	if (t.includes('bucket')) return 'bucket';
	if (t === 'minecraft:ender_pearl') return 'pearl';
	if (PLACEABLE.includes(t)) return 'blocks';
	if (t === 'minecraft:end_crystal' || t === 'minecraft:respawn_anchor' || t === 'minecraft:glowstone' || t === 'minecraft:elytra' || t === 'minecraft:firework_rocket') {
		return 'utility';
	}
	return 'spare';
}

export function roleSlot(role: HotbarRole): number {
	return HOTBAR_LAYOUT[role];
}

export interface HotbarMove {
	from: number;
	to: number;
}

/**
 * Compute hotbar swaps so each role sits in its slot.
 *
 * Only swaps *between hotbar slots*, and only when the slot holds a different
 * role — an axe already in the weapon slot is left alone. That stability is what
 * stops the bot shuffling items every tick.
 */
export function planHotbar(items: readonly ItemView[]): HotbarMove[] {
	const current: Array<ItemView | null> = new Array(HOTBAR_SIZE).fill(null);
	for (const it of items) {
		if (it.slot >= 0 && it.slot < HOTBAR_SIZE) current[it.slot] = it;
	}

	const moves: HotbarMove[] = [];

	for (const [role, slot] of Object.entries(HOTBAR_LAYOUT) as Array<[HotbarRole, number]>) {
		if (role === 'spare') continue;
		const here = current[slot];
		if (here && classifyItem(here) === role) continue;

		// find another hotbar slot already holding this role
		const j = current.findIndex((it, idx) => idx !== slot && it !== null && classifyItem(it) === role);
		if (j < 0) continue;

		moves.push({ from: j, to: slot });
		const tmp = current[slot] ?? null;
		current[slot] = current[j] ?? null;
		current[j] = tmp;
	}

	return moves;
}

/** Which slot currently holds a given role, or null. */
export function slotForRole(items: readonly ItemView[], role: HotbarRole): number | null {
	for (const it of items) {
		if (it.slot >= 0 && it.slot < HOTBAR_SIZE && classifyItem(it) === role) return it.slot;
	}
	return null;
}

// ── container risk gate ───────────────────────────────────────────────────────
export type ShulkerMode = 'safe' | 'emergency' | 'none';

/**
 * Opening a shulker in a fight is a gamble. Safe when nothing is happening,
 * emergency only when the kit is needed to survive, never in between.
 */
export function planShulkerUse(
	threat: number,
	needKit: boolean,
	hasShulker: boolean,
	allowed: boolean,
): ShulkerMode {
	if (!hasShulker || !allowed) return 'none';
	if (threat < 0.3) return 'safe';
	if (threat > 0.8 && needKit) return 'emergency';
	return 'none';
}

/** Should the bot stow loot? Only when there is something worth stowing and it is calm. */
export function shouldStow(threat: number, inventoryFull: boolean, hasEnderChest: boolean): boolean {
	return hasEnderChest && threat < 0.4 && inventoryFull;
}

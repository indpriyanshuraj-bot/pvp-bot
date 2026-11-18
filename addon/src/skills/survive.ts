/**
 * Survival ladder. Ordered by how fast the danger kills you. Pure: returns the
 * action and slot; the engine performs it.
 */

import type { BotView, CapabilitySet, ItemView } from '../types.js';

export type SurvivalAction =
	| 'water_clutch'
	| 'extinguish'
	| 'ascend'
	| 'eat'
	| 'pearl_away'
	| 'shield_up';

export interface SurvivalIntent {
	action: SurvivalAction;
	slot: number | null;
	lookDown: boolean;
	/** lower runs first */
	priority: number;
}

/** Falling faster than this means a water clutch is worth attempting. */
const FALL_VELOCITY = -0.75;
const LOW_HEALTH = 0.3;

export function planSurvival(bot: BotView, caps: CapabilitySet): SurvivalIntent | null {
	// 1. Falling hard — water, then hay, then totem.
	if (!bot.onGround && bot.velocityY <= FALL_VELOCITY) {
		const water = findSlot(bot.items, 'minecraft:water_bucket');
		if (water !== null) return { action: 'water_clutch', slot: water, lookDown: true, priority: 0 };
		const hay = findSlot(bot.items, 'minecraft:hay_block');
		if (hay !== null) return { action: 'water_clutch', slot: hay, lookDown: true, priority: 1 };
		if (caps.defense.totem > 0) {
			const totem = findSlot(bot.items, 'minecraft:totem_of_undying');
			if (totem !== null) return { action: 'eat', slot: totem, lookDown: false, priority: 2 };
		}
	}

	// 2. Burning — water bucket, or roll the dice and keep running.
	if (isBurning(bot)) {
		const water = findSlot(bot.items, 'minecraft:water_bucket');
		if (water !== null) return { action: 'extinguish', slot: water, lookDown: true, priority: 3 };
	}

	// 3. Underwater and hurt — surface before drowning finishes the job.
	if (bot.inWater && bot.health / Math.max(1, bot.maxHealth) < 0.5) {
		return { action: 'ascend', slot: null, lookDown: false, priority: 4 };
	}

	// 4. Very low health — eat the best thing available.
	if (bot.health / Math.max(1, bot.maxHealth) <= LOW_HEALTH) {
		const gapple = findSlot(bot.items, 'minecraft:enchanted_golden_apple');
		if (gapple !== null) return { action: 'eat', slot: gapple, lookDown: false, priority: 5 };
		const apple = findSlot(bot.items, 'minecraft:golden_apple');
		if (apple !== null) return { action: 'eat', slot: apple, lookDown: false, priority: 5 };
	}

	// 5. Escape tool when a pearl is all that is left.
	if (caps.utility.pearl > 0 && bot.health / Math.max(1, bot.maxHealth) <= LOW_HEALTH) {
		const pearl = findSlot(bot.items, 'minecraft:ender_pearl');
		if (pearl !== null) return { action: 'pearl_away', slot: pearl, lookDown: false, priority: 6 };
	}

	return null;
}

export function isBurning(bot: BotView): boolean {
	if (bot.effects.some((e) => e.includes('fire_resistance'))) return false;
	return bot.effects.some((e) => e.includes('on_fire') || e.includes('burning'));
}

/** First slot holding an item of this type, or null. */
export function findSlot(items: readonly ItemView[], typeId: string): number | null {
	for (const i of items) {
		if (i.typeId === typeId && i.amount > 0) return i.slot;
	}
	return null;
}

/** First slot matching a predicate. */
export function findSlotWhere(items: readonly ItemView[], pred: (i: ItemView) => boolean): number | null {
	for (const i of items) {
		if (pred(i) && i.amount > 0) return i.slot;
	}
	return null;
}

/**
 * Decides between food and potions. `chooseFood` alone never used the heal
 * potions the bot was carrying. Pure.
 */

import type { BotView } from '../types.js';
import { chooseFood, choosePotion, shouldDrinkMilk } from './consume.js';

export type ConsumableKind = 'food' | 'potion';

export interface ConsumableChoice {
	kind: ConsumableKind;
	slot: number;
	typeId: string;
	reason: string;
}

/** Below this health, a healing potion beats eating. */
const POTION_HEALTH = 0.45;
/** Below this, a golden apple is worth spending. */
const GAPPLE_HEALTH = 0.35;
/** Top up out of combat only when it is cheap to do so. */
const RECOVER_HEALTH = 0.6;

export function planConsumable(bot: BotView, inFight: boolean): ConsumableChoice | null {
	const healthFrac = bot.health / Math.max(1, bot.maxHealth);

	// 1. Milk strips a debuff, but only when nothing good is running.
	if (shouldDrinkMilk(bot.effects)) {
		const milk = bot.items.find((i) => i.typeId === 'minecraft:milk_bucket');
		if (milk) return { kind: 'potion', slot: milk.slot, typeId: milk.typeId, reason: 'strip debuff' };
	}

	// 2. In a fight, a potion lands instantly — eating does not.
	if (inFight && healthFrac < POTION_HEALTH) {
		const heal = choosePotion(bot.items, 'heal');
		if (heal) return { kind: 'potion', slot: heal.slot, typeId: heal.typeId, reason: 'heal fast' };
	}

	// 3. Critically hurt: spend the golden apple.
	if (healthFrac < GAPPLE_HEALTH) {
		const egapple = bot.items.find((i) => i.typeId === 'minecraft:enchanted_golden_apple');
		if (egapple) return { kind: 'food', slot: egapple.slot, typeId: egapple.typeId, reason: 'emergency gapple' };
		const gapple = bot.items.find((i) => i.typeId === 'minecraft:golden_apple');
		if (gapple) return { kind: 'food', slot: gapple.slot, typeId: gapple.typeId, reason: 'gapple' };
	}

	// 4. Hungry: risk-tiered food choice.
	const food = chooseFood(bot.items, bot.hunger, bot.health, bot.maxHealth);
	if (food) return { kind: 'food', slot: food.slot, typeId: food.typeId, reason: `hunger ${Math.round(bot.hunger)}` };

	// 5. Out of combat and chipped: top up with a potion rather than wasting it mid-fight.
	if (!inFight && healthFrac < RECOVER_HEALTH) {
		const heal = choosePotion(bot.items, 'heal');
		if (heal) return { kind: 'potion', slot: heal.slot, typeId: heal.typeId, reason: 'recover' };
	}

	return null;
}

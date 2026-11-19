import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planConsumable } from '../src/skills/consumables.js';
import type { BotView, ItemView } from '../src/types.js';

function bot(over: Partial<BotView> = {}): BotView {
	return {
		id: 'b1', name: 'bot', health: 20, maxHealth: 20, hunger: 20, saturation: 5,
		location: { x: 0, y: 64, z: 0 }, view: { x: 0, y: 0, z: 1 },
		onGround: true, velocityY: 0, inWater: false, effects: [], gameMode: 'Survival',
		selectedSlot: 0, items: [], ...over,
	};
}

const HEAL: ItemView = { slot: 3, typeId: 'minecraft:splash_potion', amount: 1, durability: 1, potion: 'healing' };
const GAPPLE: ItemView = { slot: 2, typeId: 'minecraft:golden_apple', amount: 4, durability: 1 };
const BREAD: ItemView = { slot: 8, typeId: 'minecraft:bread', amount: 5, durability: 1, food: { nutrition: 5, saturation: 0.6, canAlwaysEat: false } };
const MILK: ItemView = { slot: 9, typeId: 'minecraft:milk_bucket', amount: 1, durability: 1 };

test('a hurt bot in a fight drinks a potion', () => {
	const c = planConsumable(bot({ health: 6, items: [HEAL, GAPPLE] }), true);
	assert.equal(c?.kind, 'potion');
	assert.equal(c?.slot, 3);
});

test('the same bot out of combat prefers the gapple', () => {
	const c = planConsumable(bot({ health: 6, items: [HEAL, GAPPLE] }), false);
	assert.equal(c?.kind, 'food');
	assert.equal(c?.typeId, 'minecraft:golden_apple');
});

test('a hungry healthy bot eats', () => {
	const c = planConsumable(bot({ hunger: 5, items: [BREAD] }), false);
	assert.equal(c?.kind, 'food');
	assert.equal(c?.slot, 8);
});

test('nothing to consume returns null', () => {
	assert.equal(planConsumable(bot({ hunger: 3 }), false), null);
});

test('milk is chosen to strip a debuff', () => {
	const c = planConsumable(bot({ health: 20, effects: ['minecraft:poison'], items: [MILK, BREAD] }), false);
	assert.equal(c?.typeId, 'minecraft:milk_bucket');
});

test('milk is skipped while a useful effect is active', () => {
	const c = planConsumable(bot({ health: 20, effects: ['minecraft:poison', 'minecraft:strength'], items: [MILK] }), false);
	assert.equal(c, null);
});

test('a healthy bot conserves potions', () => {
	const c = planConsumable(bot({ health: 20, hunger: 20, items: [HEAL, GAPPLE] }), false);
	assert.equal(c, null);
});

test('an enchanted gapple beats a normal one when critical', () => {
	const EG: ItemView = { slot: 4, typeId: 'minecraft:enchanted_golden_apple', amount: 1, durability: 1 };
	const c = planConsumable(bot({ health: 3, items: [EG, GAPPLE] }), false);
	assert.equal(c?.typeId, 'minecraft:enchanted_golden_apple');
});

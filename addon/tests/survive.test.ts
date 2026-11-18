import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSurvival, isBurning, findSlot, findSlotWhere } from '../src/skills/survive.js';
import type { BotView, CapabilitySet, ItemView } from '../src/types.js';

function caps(over: Partial<CapabilitySet> = {}): CapabilitySet {
	return {
		melee: { sword: 0, axe: 0, mace: 0, spear: 0, trident: 0 },
		ranged: { bow: 0, crossbow: 0, arrows: 0 },
		defense: { shield: false, armorPieces: 0, minArmorDurability: 1, totem: 0 },
		utility: { waterBucket: 0, lavaBucket: 0, pearl: 0, crystal: 0, obsidian: 0, anchor: 0, glowstone: 0, bed: 0, elytra: false, rockets: 0, cobweb: 0 },
		consumables: { gapple: 0, egapple: 0, healPot: 0, strengthPot: 0 },
		blocks: { total: 0, byType: {} }, food: [], bestWeapon: null, bestToolTier: 0, ...over,
	};
}

function bot(over: Partial<BotView> = {}): BotView {
	return {
		id: 'b1', name: 'bot', health: 20, maxHealth: 20, hunger: 20, saturation: 5,
		location: { x: 0, y: 64, z: 0 }, view: { x: 0, y: 0, z: 1 },
		onGround: true, velocityY: 0, inWater: false, effects: [], gameMode: 'Survival',
		selectedSlot: 0, items: [], ...over,
	};
}

function item(typeId: string, slot = 0): ItemView {
	return { slot, typeId, amount: 1, durability: 1 };
}

test('falling with a water bucket clutches', () => {
	const b = bot({ onGround: false, velocityY: -1, items: [item('minecraft:water_bucket', 3)] });
	const i = planSurvival(b, caps());
	assert.equal(i?.action, 'water_clutch');
	assert.equal(i?.slot, 3);
	assert.equal(i?.lookDown, true);
});

test('no water falls back to hay', () => {
	const b = bot({ onGround: false, velocityY: -1, items: [item('minecraft:hay_block', 5)] });
	assert.equal(planSurvival(b, caps())?.slot, 5);
});

test('a totem is the last resort while falling', () => {
	const b = bot({ onGround: false, velocityY: -1, items: [item('minecraft:totem_of_undying', 8)] });
	const i = planSurvival(b, caps({ defense: { ...caps().defense, totem: 1 } }));
	assert.equal(i?.action, 'eat');
	assert.equal(i?.slot, 8);
});

test('a slow fall is not a clutch', () => {
	const b = bot({ onGround: false, velocityY: -0.2, items: [item('minecraft:water_bucket')] });
	assert.equal(planSurvival(b, caps()), null);
});

test('burning uses the water bucket', () => {
	const b = bot({ effects: ['minecraft:on_fire'], items: [item('minecraft:water_bucket', 2)] });
	const i = planSurvival(b, caps());
	assert.equal(i?.action, 'extinguish');
	assert.equal(i?.slot, 2);
});

test('fire resistance suppresses the burning check', () => {
	assert.equal(isBurning(bot({ effects: ['minecraft:on_fire', 'minecraft:fire_resistance'] })), false);
});

test('hurt underwater surfaces', () => {
	const b = bot({ inWater: true, health: 6 });
	const i = planSurvival(b, caps());
	assert.equal(i?.action, 'ascend');
});

test('low health eats a golden apple before a pearl', () => {
	const b = bot({ health: 4, items: [item('minecraft:golden_apple', 1), item('minecraft:ender_pearl', 2)] });
	const i = planSurvival(b, caps({ utility: { ...caps().utility, pearl: 1 } }));
	assert.equal(i?.action, 'eat');
	assert.equal(i?.slot, 1);
});

test('a pearl is used when no food is left', () => {
	const b = bot({ health: 4, items: [item('minecraft:ender_pearl', 6)] });
	const i = planSurvival(b, caps({ utility: { ...caps().utility, pearl: 1 } }));
	assert.equal(i?.action, 'pearl_away');
	assert.equal(i?.slot, 6);
});

test('a healthy grounded bot does nothing', () => {
	assert.equal(planSurvival(bot(), caps()), null);
});

test('findSlot returns the first match or null', () => {
	const items = [item('minecraft:bread', 0), item('minecraft:water_bucket', 4)];
	assert.equal(findSlot(items, 'minecraft:water_bucket'), 4);
	assert.equal(findSlot(items, 'minecraft:shield'), null);
});

test('findSlotWhere matches on a predicate', () => {
	const items = [{ ...item('minecraft:potion', 7), potion: 'healing' }];
	assert.equal(findSlotWhere(items, (i) => i.potion === 'healing'), 7);
});

test('empty stacks are ignored', () => {
	const items: ItemView[] = [{ slot: 1, typeId: 'minecraft:water_bucket', amount: 0, durability: 1 }];
	assert.equal(findSlot(items, 'minecraft:water_bucket'), null);
});

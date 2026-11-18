import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCapabilities, countOf } from '../src/core/capabilities.js';
import type { ItemView } from '../src/types.js';

function item(typeId: string, amount = 1, extra: Partial<ItemView> = {}): ItemView {
	return { slot: 0, typeId, amount, durability: 1, ...extra };
}

test('counts melee weapons by suffix', () => {
	const c = deriveCapabilities([item('minecraft:diamond_sword'), item('minecraft:iron_axe')]);
	assert.equal(c.melee.sword, 1);
	assert.equal(c.melee.axe, 1);
	assert.equal(c.melee.mace, 0);
});

test('picks the highest-damage weapon actually held', () => {
	const c = deriveCapabilities([item('minecraft:iron_sword'), item('minecraft:diamond_sword')]);
	assert.equal(c.bestWeapon?.typeId, 'minecraft:diamond_sword');
	assert.equal(c.bestWeapon?.damage, 7);
});

test('no weapons means no best weapon', () => {
	assert.equal(deriveCapabilities([item('minecraft:bread')]).bestWeapon, null);
});

test('detects shield and armour', () => {
	const c = deriveCapabilities([
		item('minecraft:shield'),
		item('minecraft:diamond_helmet', 1, { durability: 0.4 }),
		item('minecraft:diamond_chestplate', 1, { durability: 0.9 }),
	]);
	assert.equal(c.defense.shield, true);
	assert.equal(c.defense.armorPieces, 2);
	assert.equal(c.defense.minArmorDurability, 0.4);
});

test('aggregates utility items', () => {
	const c = deriveCapabilities([
		item('minecraft:ender_pearl', 16),
		item('minecraft:water_bucket'),
		item('minecraft:end_crystal', 8),
		item('minecraft:obsidian', 12),
	]);
	assert.equal(c.utility.pearl, 16);
	assert.equal(c.utility.waterBucket, 1);
	assert.equal(c.utility.crystal, 8);
	assert.equal(c.utility.obsidian, 12);
});

test('counts arrows and rockets', () => {
	const c = deriveCapabilities([item('minecraft:arrow', 32), item('minecraft:firework_rocket', 5)]);
	assert.equal(c.ranged.arrows, 32);
	assert.equal(c.utility.rockets, 5);
});

test('food is separated out with its nutrition', () => {
	const c = deriveCapabilities([
		item('minecraft:golden_carrot', 8, { food: { nutrition: 6, saturation: 1.2, canAlwaysEat: false } }),
		item('minecraft:iron_sword'),
	]);
	assert.equal(c.food.length, 1);
	assert.equal(c.food[0]?.typeId, 'minecraft:golden_carrot');
	assert.equal(c.food[0]?.food?.nutrition, 6);
});

test('only placeable blocks count toward the block pool', () => {
	const c = deriveCapabilities([item('minecraft:obsidian', 12), item('minecraft:diamond_sword')]);
	assert.equal(c.blocks.total, 12);
	assert.equal(c.blocks.byType['minecraft:obsidian'], 12);
});

test('best tool tier is the max held', () => {
	const c = deriveCapabilities([
		item('minecraft:iron_pickaxe', 1, { tier: 3 }),
		item('minecraft:diamond_pickaxe', 1, { tier: 4 }),
	]);
	assert.equal(c.bestToolTier, 4);
});

test('countOf sums stacks', () => {
	assert.equal(countOf([item('minecraft:ender_pearl', 5), item('minecraft:ender_pearl', 7)], 'minecraft:ender_pearl'), 12);
});

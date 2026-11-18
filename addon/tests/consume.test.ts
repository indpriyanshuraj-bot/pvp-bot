import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseFood, riskOf, effectsOf, choosePotion, shouldDrinkMilk } from '../src/skills/consume.js';
import type { ItemView } from '../src/types.js';

function food(typeId: string, nutrition: number, saturation: number, slot = 0): ItemView {
	return { slot, typeId, amount: 1, durability: 1, food: { nutrition, saturation, canAlwaysEat: false } };
}

const BREAD = () => food('minecraft:bread', 5, 0.6, 0);
const PUFFER = () => food('minecraft:pufferfish', 1, 0.1, 1);
const ROTTEN = () => food('minecraft:rotten_flesh', 4, 0.8, 2);

test('riskOf reads the table', () => {
	assert.equal(riskOf('minecraft:pufferfish'), 'high');
	assert.equal(riskOf('minecraft:rotten_flesh'), 'low');
	assert.equal(riskOf('minecraft:bread'), 'none');
});

test('effectsOf exposes what the food does to you', () => {
	assert.ok(effectsOf('minecraft:pufferfish').includes('poison'));
	assert.deepEqual(effectsOf('minecraft:bread'), []);
});

test('a healthy bot prefers safe food over pufferfish', () => {
	const c = chooseFood([BREAD(), PUFFER()], 20, 20, 20);
	assert.equal(c?.typeId, 'minecraft:bread');
});

test('rotten flesh loses to bread at normal hunger', () => {
	const c = chooseFood([ROTTEN(), BREAD()], 10, 20, 20);
	assert.equal(c?.typeId, 'minecraft:bread');
});

test('a starving bot will eat pufferfish as a last resort', () => {
	const c = chooseFood([PUFFER()], 2, 20, 20);
	assert.equal(c?.typeId, 'minecraft:pufferfish');
});

test('a starving bot at deaths door still refuses pufferfish', () => {
	const c = chooseFood([PUFFER()], 2, 4, 20);
	assert.equal(c, null, 'high risk must be refused below 35% health');
});

test('medium risk is refused below 20% health', () => {
	const eye = food('minecraft:spider_eye', 2, 0.4, 3);
	assert.equal(chooseFood([eye], 2, 3, 20), null);
});

test('nothing edible means no choice', () => {
	assert.equal(chooseFood([], 5, 20, 20), null);
});

test('an empty inventory is handled', () => {
	const sword: ItemView = { slot: 0, typeId: 'minecraft:iron_sword', amount: 1, durability: 0.5 };
	assert.equal(chooseFood([sword], 3, 20, 20), null);
});

test('potion lookup by need', () => {
	const heal: ItemView = { slot: 4, typeId: 'minecraft:splash_potion', amount: 1, durability: 1, potion: 'healing' };
	const str: ItemView = { slot: 5, typeId: 'minecraft:potion', amount: 1, durability: 1, potion: 'strength' };
	assert.equal(choosePotion([heal, str], 'heal')?.slot, 4);
	assert.equal(choosePotion([heal, str], 'strength')?.slot, 5);
	assert.equal(choosePotion([heal], 'slowfall'), null);
});

test('milk is drunk for a debuff', () => {
	assert.equal(shouldDrinkMilk(['minecraft:poison']), true);
});

test('milk is not drunk while a useful effect is active', () => {
	assert.equal(shouldDrinkMilk(['minecraft:poison', 'minecraft:strength']), false);
});

test('milk is not drunk with no debuff', () => {
	assert.equal(shouldDrinkMilk(['minecraft:strength']), false);
	assert.equal(shouldDrinkMilk([]), false);
});

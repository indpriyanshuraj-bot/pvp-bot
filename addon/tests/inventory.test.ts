import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	classifyItem, planHotbar, roleSlot, slotForRole, planShulkerUse, shouldStow,
	HOTBAR_LAYOUT, type HotbarMove,
} from '../src/skills/inventory.js';
import type { ItemView } from '../src/types.js';

function item(typeId: string, slot: number, extra: Partial<ItemView> = {}): ItemView {
	return { slot, typeId, amount: 1, durability: 1, ...extra };
}

/** Apply swaps the way the engine would, so we can assert the end state. */
function apply(items: ItemView[], moves: HotbarMove[]): ItemView[] {
	const bySlot = new Map<number, ItemView>();
	for (const it of items) bySlot.set(it.slot, { ...it });
	for (const m of moves) {
		const a = bySlot.get(m.to);
		const b = bySlot.get(m.from);
		if (b) bySlot.set(m.to, { ...b, slot: m.to });
		else bySlot.delete(m.to);
		if (a) bySlot.set(m.from, { ...a, slot: m.from });
		else bySlot.delete(m.from);
	}
	return [...bySlot.values()];
}

test('classifyItem maps every role', () => {
	assert.equal(classifyItem(item('minecraft:diamond_sword', 0)), 'weapon');
	assert.equal(classifyItem(item('minecraft:shield', 0)), 'shield');
	assert.equal(classifyItem(item('minecraft:bread', 0, { food: { nutrition: 5, saturation: 1, canAlwaysEat: false } })), 'food');
	assert.equal(classifyItem(item('minecraft:splash_potion', 0, { potion: 'healing' })), 'potion');
	assert.equal(classifyItem(item('minecraft:water_bucket', 0)), 'bucket');
	assert.equal(classifyItem(item('minecraft:ender_pearl', 0)), 'pearl');
	assert.equal(classifyItem(item('minecraft:obsidian', 0)), 'blocks');
	assert.equal(classifyItem(item('minecraft:end_crystal', 0)), 'utility');
	assert.equal(classifyItem(item('minecraft:stick', 0)), 'spare');
});

test('layout slots are distinct', () => {
	const slots = Object.values(HOTBAR_LAYOUT);
	assert.equal(new Set(slots).size, slots.length);
	assert.ok(Math.max(...slots) < 9);
});

test('a correctly ordered hotbar needs no moves', () => {
	const items = [
		item('minecraft:diamond_sword', roleSlot('weapon')),
		item('minecraft:shield', roleSlot('shield')),
		item('minecraft:obsidian', roleSlot('blocks')),
	];
	assert.deepEqual(planHotbar(items), []);
});

test('a misplaced weapon is swapped into the weapon slot', () => {
	const items = [item('minecraft:diamond_sword', 5)];
	const moves = planHotbar(items);
	assert.equal(moves.length, 1);
	assert.equal(moves[0]?.to, roleSlot('weapon'));

	const after = apply(items, moves);
	assert.equal(slotForRole(after, 'weapon'), roleSlot('weapon'));
});

test('two misplaced roles settle into their slots', () => {
	const items = [item('minecraft:shield', 0), item('minecraft:diamond_sword', 5)];
	const after = apply(items, planHotbar(items));
	assert.equal(slotForRole(after, 'weapon'), roleSlot('weapon'));
	assert.equal(slotForRole(after, 'shield'), roleSlot('shield'));
});

test('an item outside the hotbar produces no swap', () => {
	const items = [item('minecraft:diamond_sword', 20)];
	assert.deepEqual(planHotbar(items), []);
});

test('empty inventory is safe', () => {
	assert.deepEqual(planHotbar([]), []);
});

test('a second pass is stable', () => {
	const items = [item('minecraft:shield', 0), item('minecraft:diamond_sword', 5)];
	const once = apply(items, planHotbar(items));
	assert.deepEqual(planHotbar(once), []);
});

test('slotForRole returns null when absent', () => {
	assert.equal(slotForRole([item('minecraft:stick', 0)], 'weapon'), null);
});

test('shulker is safe only when calm', () => {
	assert.equal(planShulkerUse(0.1, false, true, true), 'safe');
});

test('shulker is emergency only when the kit is needed', () => {
	assert.equal(planShulkerUse(0.9, true, true, true), 'emergency');
	assert.equal(planShulkerUse(0.9, false, true, true), 'none');
});

test('no shulker or disabled means none', () => {
	assert.equal(planShulkerUse(0.1, true, false, true), 'none');
	assert.equal(planShulkerUse(0.1, true, true, false), 'none');
});

test('stowing needs a calm moment and a full inventory', () => {
	assert.equal(shouldStow(0.1, true, true), true);
	assert.equal(shouldStow(0.7, true, true), false);
	assert.equal(shouldStow(0.1, false, true), false);
});

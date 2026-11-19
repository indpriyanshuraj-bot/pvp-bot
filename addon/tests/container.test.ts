import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isShulker, planShulkerPlacement, placementIsSafe } from '../src/skills/container.js';

test('shulker detection covers every colour', () => {
	assert.equal(isShulker('minecraft:undyed_shulker_box'), true);
	assert.equal(isShulker('minecraft:red_shulker_box'), true);
	assert.equal(isShulker('minecraft:shulker_box'), true);
	assert.equal(isShulker('minecraft:chest'), false);
});

test('placement goes in front of the bot, not under it', () => {
	const plan = planShulkerPlacement({ x: 0, y: 64, z: 0 }, { x: 0, y: 0, z: 1 });
	assert.equal(plan.placeAt.z, 1);
	assert.equal(plan.placeAt.y, 64);
	assert.equal(plan.groundAt.y, 63);
});

test('placement follows the facing direction', () => {
	const plan = planShulkerPlacement({ x: 0, y: 64, z: 0 }, { x: 1, y: 0, z: 0 });
	assert.equal(plan.placeAt.x, 1);
	assert.equal(plan.placeAt.z, 0);
});

test('a zero-length view still yields a placement', () => {
	const plan = planShulkerPlacement({ x: 0, y: 64, z: 0 }, { x: 0, y: 0, z: 0 });
	assert.ok(Number.isFinite(plan.placeAt.x));
	assert.ok(Number.isFinite(plan.placeAt.z));
});

test('the plan is never the bot\'s own block', () => {
	const loc = { x: 0, y: 64, z: 0 };
	const plan = planShulkerPlacement(loc, { x: 0, y: 0, z: 1 });
	assert.equal(placementIsSafe(plan, loc), true);
});

test('an unsafe plan is detected', () => {
	const loc = { x: 0, y: 64, z: 0 };
	assert.equal(placementIsSafe({ placeAt: { x: 0, y: 64, z: 0 }, groundAt: { x: 0, y: 63, z: 0 } }, loc), false);
});

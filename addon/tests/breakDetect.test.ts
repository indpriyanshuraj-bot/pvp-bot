import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	classifyBreak, BreakTracker, expectedTicksFor,
	type BreakObservation,
} from '../src/skills/breakDetect.js';

const base: BreakObservation = {
	blockType: 'minecraft:stone',
	elapsedTicks: 0,
	expectedTicks: 10,
	same: true,
	changed: false,
	reappeared: false,
	hasFatigue: false,
	gameMode: 'Survival',
	toolTier: 3,
	requiredTier: 1,
	retriedWithBestTool: false,
};

test('adventure mode is reported before anything else', () => {
	assert.equal(classifyBreak({ ...base, gameMode: 'Adventure' }), 'ADVENTURE');
});

test('mining fatigue is reported', () => {
	assert.equal(classifyBreak({ ...base, hasFatigue: true }), 'FATIGUE');
});

test('a changed block is a success', () => {
	assert.equal(classifyBreak({ ...base, changed: true }), 'SUCCESS');
});

test('a block that broke and came back is a protected region', () => {
	assert.equal(classifyBreak({ ...base, reappeared: true }), 'PROTECTED_REGION');
});

test('a tool below the required tier is WRONG_TOOL', () => {
	assert.equal(classifyBreak({ ...base, toolTier: 1, requiredTier: 3 }), 'WRONG_TOOL');
});

test('inside the expected window it is still mining', () => {
	assert.equal(classifyBreak({ ...base, elapsedTicks: 15 }), 'STILL_MINING');
});

test('past timeout without a retry asks for one instead of concluding', () => {
	const v = classifyBreak({ ...base, elapsedTicks: 25, retriedWithBestTool: false });
	assert.equal(v, 'NEEDS_RETRY');
});

test('past timeout after a retry with the best tool is UNBREAKABLE', () => {
	const v = classifyBreak({ ...base, elapsedTicks: 25, retriedWithBestTool: true });
	assert.equal(v, 'UNBREAKABLE');
});

test('one failure does not blacklist a block type', () => {
	const t = new BreakTracker();
	const pos = { x: 0, y: 0, z: 0 };
	assert.equal(t.record('UNBREAKABLE', 'minecraft:bedrock', pos), false);
	assert.equal(t.isBlocked('minecraft:bedrock', { x: 5, y: 0, z: 0 }), false);
});

test('two independent positions blacklist the type', () => {
	const t = new BreakTracker();
	t.record('UNBREAKABLE', 'minecraft:bedrock', { x: 0, y: 0, z: 0 });
	const added = t.record('UNBREAKABLE', 'minecraft:bedrock', { x: 8, y: 0, z: 0 });
	assert.equal(added, true);
	assert.equal(t.isBlocked('minecraft:bedrock', { x: 100, y: 0, z: 0 }), true);
	assert.deepEqual(t.blocked, ['minecraft:bedrock']);
});

test('two failures at the same position are not enough', () => {
	const t = new BreakTracker();
	const pos = { x: 0, y: 0, z: 0 };
	t.record('UNBREAKABLE', 'minecraft:stone', pos);
	t.record('UNBREAKABLE', 'minecraft:stone', pos);
	assert.equal(t.isBlocked('minecraft:stone', { x: 50, y: 0, z: 0 }), false);
});

test('a protected region blocks nearby but not distant blocks', () => {
	const t = new BreakTracker();
	t.record('PROTECTED_REGION', 'minecraft:stone', { x: 0, y: 64, z: 0 });
	assert.equal(t.isBlocked('minecraft:dirt', { x: 3, y: 64, z: 0 }), true);
	assert.equal(t.isBlocked('minecraft:dirt', { x: 40, y: 64, z: 0 }), false);
});

test('expected ticks scale with tool tier', () => {
	const rule = { baseTicks: 20, requiredTier: 3 };
	assert.ok(expectedTicksFor(rule, 4) <= expectedTicksFor(rule, 1));
	assert.ok(expectedTicksFor(rule, 0) >= 1);
});

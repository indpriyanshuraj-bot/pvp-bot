import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combatFeatures } from '../src/learn/features.js';
import { BANDIT_FEATURES } from '../src/learn/bandit.js';
import type { BotView, TargetView } from '../src/types.js';

function bot(over: Partial<BotView> = {}): BotView {
	return {
		id: 'b1', name: 'bot', health: 20, maxHealth: 20, hunger: 20, saturation: 5,
		location: { x: 0, y: 64, z: 0 }, view: { x: 0, y: 0, z: 1 },
		onGround: true, velocityY: 0, inWater: false, effects: [], gameMode: 'Survival',
		selectedSlot: 0, items: [], ...over,
	};
}

function target(over: Partial<TargetView> = {}): TargetView {
	return {
		id: 'p1', name: 'Steve', health: 20, maxHealth: 20, distance: 3,
		location: { x: 3, y: 64, z: 0 }, isPlayer: true, sprinting: false,
		airborne: false, shielding: false, heldTypeId: null, gameMode: 'Survival', ...over,
	};
}

test('feature vector matches the bandit width', () => {
	assert.equal(combatFeatures(bot(), target()).length, BANDIT_FEATURES);
});

test('bias term is always 1', () => {
	assert.equal(combatFeatures(bot(), target())[0], 1);
});

test('health fraction is normalised', () => {
	assert.equal(combatFeatures(bot({ health: 10 }), target())[1], 0.5);
});

test('threat is the inverse of health', () => {
	const f = combatFeatures(bot({ health: 5 }), target());
	assert.ok(Math.abs((f[9] ?? 0) - 0.75) < 1e-6);
});

test('no target still yields a full vector', () => {
	const f = combatFeatures(bot(), null);
	assert.equal(f.length, BANDIT_FEATURES);
	assert.ok(f.every((v) => Number.isFinite(v)));
});

test('distance is scaled and bounded', () => {
	const f = combatFeatures(bot(), target({ distance: 100 }));
	assert.ok((f[3] ?? 0) <= 1.5);
});

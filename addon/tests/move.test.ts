import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planApproach, planFootwork, planFlee, planHold, StuckDetector } from '../src/skills/move.js';
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

test('approach runs forward when far away', () => {
	const i = planApproach(bot(), target({ distance: 10 }), 3);
	assert.ok(i.forward > 0.9, `forward ${i.forward}`);
});

test('approach holds still at weapon reach', () => {
	const i = planApproach(bot(), target({ distance: 2.7 }), 3);
	assert.ok(Math.abs(i.forward) < 0.05, `forward ${i.forward}`);
});

test('approach backs off when inside reach', () => {
	const i = planApproach(bot(), target({ distance: 1 }), 3);
	assert.ok(i.forward < 0, `forward ${i.forward}`);
});

test('approach aims at the torso, not the feet', () => {
	const i = planApproach(bot(), target({ location: { x: 0, y: 64, z: 5 } }), 3);
	assert.ok(i.lookAt);
	assert.ok((i.lookAt?.y ?? 0) > 64, 'aim should be above the target feet');
});

test('footwork always strafes', () => {
	const i = planFootwork(bot(), target(), { reach: 3, aggression: 0.5 }, 0);
	assert.ok(Math.abs(i.strafe) > 0.4, `strafe ${i.strafe}`);
});

test('footwork flips strafe direction over time', () => {
	const a = planFootwork(bot(), target(), { reach: 3, strafePeriod: 24 }, 0);
	const b = planFootwork(bot(), target(), { reach: 3, strafePeriod: 24 }, 24);
	assert.equal(Math.sign(a.strafe), -Math.sign(b.strafe));
});

test('flee points away from the threat', () => {
	// bot at origin looking +z, threat to the +x side => should move -x (strafe -1)
	const i = planFlee(bot(), { x: 5, y: 64, z: 0 }, 0);
	assert.ok(i.strafe < 0, `strafe ${i.strafe}`);
});

test('flee stays within unit bounds', () => {
	const i = planFlee(bot(), { x: -2, y: 64, z: 3 }, 7);
	assert.ok(i.forward >= -1 && i.forward <= 1);
	assert.ok(i.strafe >= -1 && i.strafe <= 1);
});

test('hold does not move but keeps facing the target', () => {
	const i = planHold(bot(), target());
	assert.equal(i.forward, 0);
	assert.equal(i.strafe, 0);
	assert.ok(i.lookAt);
});

test('stuck detector is quiet while the bot moves', () => {
	const d = new StuckDetector(20, 0.8);
	d.sample('a', { x: 0, y: 64, z: 0 }, 0, true);
	assert.equal(d.sample('a', { x: 5, y: 64, z: 0 }, 20, true), false);
});

test('stuck detector fires when stationary while trying', () => {
	const d = new StuckDetector(20, 0.8);
	d.sample('a', { x: 0, y: 64, z: 0 }, 0, true);
	assert.equal(d.sample('a', { x: 0, y: 64, z: 0 }, 20, true), true);
});

test('stuck detector ignores a bot that is not trying', () => {
	const d = new StuckDetector(20, 0.8);
	d.sample('a', { x: 0, y: 64, z: 0 }, 0, false);
	assert.equal(d.sample('a', { x: 0, y: 64, z: 0 }, 20, false), false);
});

test('stuck detector needs the full window', () => {
	const d = new StuckDetector(20, 0.8);
	d.sample('a', { x: 0, y: 64, z: 0 }, 0, true);
	assert.equal(d.sample('a', { x: 0, y: 64, z: 0 }, 5, true), false);
});

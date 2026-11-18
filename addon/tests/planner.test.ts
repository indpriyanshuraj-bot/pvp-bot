import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arbiter, scoreGoals, chooseGoal, type PlannerInput } from '../src/core/planner.js';
import type { BotView, CapabilitySet, TargetView } from '../src/types.js';

function caps(over: Partial<CapabilitySet> = {}): CapabilitySet {
	return {
		melee: { sword: 1, axe: 0, mace: 0, spear: 0, trident: 0 },
		ranged: { bow: 0, crossbow: 0, arrows: 0 },
		defense: { shield: false, armorPieces: 0, minArmorDurability: 1, totem: 0 },
		utility: { waterBucket: 0, lavaBucket: 0, pearl: 0, crystal: 0, obsidian: 0, anchor: 0, glowstone: 0, bed: 0, elytra: false, rockets: 0, cobweb: 0 },
		consumables: { gapple: 0, egapple: 0, healPot: 0, strengthPot: 0 },
		blocks: { total: 0, byType: {} },
		food: [],
		bestWeapon: { typeId: 'minecraft:iron_sword', reach: 3, damage: 6 },
		bestToolTier: 3,
		...over,
	};
}

function bot(over: Partial<BotView> = {}): BotView {
	return {
		id: 'b1', name: 'bot', health: 20, maxHealth: 20, hunger: 20, saturation: 5,
		location: { x: 0, y: 64, z: 0 }, view: { x: 0, y: 0, z: 1 },
		onGround: true, velocityY: 0, inWater: false, effects: [], gameMode: 'Survival',
		selectedSlot: 0, items: [],
		...over,
	};
}

function target(over: Partial<TargetView> = {}): TargetView {
	return {
		id: 'p1', name: 'Steve', health: 20, maxHealth: 20, distance: 3,
		location: { x: 3, y: 64, z: 0 },
		isPlayer: true, sprinting: false, airborne: false, shielding: false,
		heldTypeId: 'minecraft:iron_sword', gameMode: 'Survival',
		...over,
	};
}

function input(over: Partial<PlannerInput> = {}): PlannerInput {
	return {
		bot: bot(), target: null, caps: caps(), threat: 0, relation: null,
		hunger: 20, grindEnabled: true, hasHome: false, nowTick: 0,
		...over,
	};
}

test('arbiter: critical health forces CLUTCH', () => {
	const r = arbiter(input({ bot: bot({ health: 3 }) }));
	assert.equal(r.goal, 'CLUTCH');
});

test('arbiter: damage-over-time at low health forces FLEE', () => {
	const r = arbiter(input({ bot: bot({ health: 6, effects: ['minecraft:poison'] }) }));
	assert.equal(r.goal, 'FLEE');
});

test('arbiter: healthy bot is not interrupted', () => {
	assert.equal(arbiter(input()).goal, null);
});

test('scores: no target means FIGHT scores zero', () => {
	const s = scoreGoals(input()).find((x) => x.goal === 'FIGHT');
	assert.equal(s?.score, 0);
});

test('scores: a low-health target raises FIGHT', () => {
	const healthy = scoreGoals(input({ target: target() })).find((x) => x.goal === 'FIGHT')!.score;
	const weak = scoreGoals(input({ target: target({ health: 3 }) })).find((x) => x.goal === 'FIGHT')!.score;
	assert.ok(weak > healthy);
});

test('scores: a trusted target suppresses FIGHT', () => {
	const s = scoreGoals(input({ target: target(), relation: { trust: 80, betrayal: 0 } }))
		.find((x) => x.goal === 'FIGHT')!.score;
	assert.equal(s, 0);
});

test('scores: starving without food does not pick EAT', () => {
	const s = scoreGoals(input({ hunger: 0 })).find((x) => x.goal === 'EAT')!;
	assert.equal(s.score, 0, 'no food available');
});

test('scores: starving with food picks EAT high', () => {
	const food = [{ slot: 0, typeId: 'minecraft:bread', amount: 3, durability: 1, food: { nutrition: 5, saturation: 1, canAlwaysEat: false } }];
	const s = scoreGoals(input({ hunger: 0, caps: caps({ food }) })).find((x) => x.goal === 'EAT')!;
	assert.ok(s.score > 60);
});

test('chooseGoal: arbiter overrides the incumbent', () => {
	const i = input({ bot: bot({ health: 2 }) });
	const { goal } = chooseGoal(i, 'GRIND');
	assert.equal(goal, 'CLUTCH');
});

test('chooseGoal: switches to EAT when starving', () => {
	const food = [{ slot: 0, typeId: 'minecraft:bread', amount: 3, durability: 1, food: { nutrition: 5, saturation: 1, canAlwaysEat: false } }];
	const { goal } = chooseGoal(input({ hunger: 0, caps: caps({ food }) }), 'GRIND');
	assert.equal(goal, 'EAT');
});

test('chooseGoal: keeps the incumbent when nothing clearly beats it', () => {
	const { goal } = chooseGoal(input(), 'GRIND');
	assert.equal(goal, 'GRIND');
});

test('chooseGoal: engages a hostile target', () => {
	const { goal } = chooseGoal(input({ target: target() }), 'IDLE');
	assert.equal(goal, 'FIGHT');
});

test('chooseGoal: a non-survival target is not fought', () => {
	const { goal } = chooseGoal(input({ target: target({ gameMode: 'Creative' }) }), 'IDLE');
	assert.notEqual(goal, 'FIGHT');
});

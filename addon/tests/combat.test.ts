import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	capValue, meetsRequirement, scoreTactics, selectTactic, skillMod,
	attackCooldownTicks, canCrit, planCombat, type TacticContext,
} from '../src/skills/combat.js';
import { resolvePro, DEFAULT_PRO } from '../src/core/pro.js';
import type { BotView, CapabilitySet, TargetView } from '../src/types.js';

function caps(over: Partial<CapabilitySet> = {}): CapabilitySet {
	return {
		melee: { sword: 1, axe: 0, mace: 0, spear: 0, trident: 0 },
		ranged: { bow: 0, crossbow: 0, arrows: 0 },
		defense: { shield: false, armorPieces: 0, minArmorDurability: 1, totem: 0 },
		utility: { waterBucket: 0, lavaBucket: 0, pearl: 0, crystal: 0, obsidian: 0, anchor: 0, glowstone: 0, bed: 0, elytra: false, rockets: 0, cobweb: 0 },
		consumables: { gapple: 0, egapple: 0, healPot: 0, strengthPot: 0 },
		blocks: { total: 0, byType: {} }, food: [],
		bestWeapon: { typeId: 'minecraft:iron_sword', reach: 3, damage: 6 },
		bestToolTier: 3, ...over,
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

function target(over: Partial<TargetView> = {}): TargetView {
	return {
		id: 'p1', name: 'Steve', health: 20, maxHealth: 20, distance: 3,
		location: { x: 3, y: 64, z: 0 }, isPlayer: true, sprinting: false,
		airborne: false, shielding: false, heldTypeId: null, gameMode: 'Survival', ...over,
	};
}

function tctx(over: Partial<TacticContext> = {}): TacticContext {
	return {
		caps: caps(), pro: resolvePro(DEFAULT_PRO), dimension: 'overworld',
		inWater: false, isRaining: false, opponentSkill: 0.5,
		counters: {}, learned: () => 0, ...over,
	};
}

// ── capability lookup ────────────────────────────────────────────────────────
test('capValue resolves melee, utility and shield', () => {
	const c = caps({ utility: { ...caps().utility, crystal: 4 } });
	assert.equal(capValue(c, 'sword'), 1);
	assert.equal(capValue(c, 'crystal'), 4);
	assert.equal(capValue(c, 'shield'), 0);
	assert.equal(capValue(c, 'nonsense'), 0);
});

test('requirement with a threshold', () => {
	assert.equal(meetsRequirement('sword>0', caps()), true);
	assert.equal(meetsRequirement('crystal>0', caps()), false);
	assert.equal(meetsRequirement('arrows>=1', caps()), false);
});

test('bare requirement means "more than zero"', () => {
	assert.equal(meetsRequirement('shield', caps()), false);
	assert.equal(meetsRequirement('shield', caps({ defense: { ...caps().defense, shield: true } })), true);
});

// ── tactic selection ─────────────────────────────────────────────────────────
test('only affordable tactics are marked affordable', () => {
	const scores = scoreTactics(tctx());
	const sword = scores.find((s) => s.tactic === 'sword_trade');
	const crystal = scores.find((s) => s.tactic === 'crystal_pvp');
	assert.equal(sword?.affordable, true);
	assert.equal(crystal?.affordable, false);
});

test('selectTactic picks the affordable one', () => {
	assert.equal(selectTactic(tctx()), 'sword_trade');
});

test('selectTactic returns null when nothing is affordable', () => {
	const empty = caps({
		melee: { sword: 0, axe: 0, mace: 0, spear: 0, trident: 0 },
		bestWeapon: null,
	});
	assert.equal(selectTactic(tctx({ caps: empty })), null);
});

test('nether-only tactics are gated by dimension', () => {
	const c = caps({ utility: { ...caps().utility, anchor: 1, glowstone: 1 } });
	const over = scoreTactics(tctx({ caps: c, dimension: 'overworld' })).find((s) => s.tactic === 'anchor_pvp');
	const nether = scoreTactics(tctx({ caps: c, dimension: 'nether' })).find((s) => s.tactic === 'anchor_pvp');
	assert.equal(over?.affordable, false);
	assert.equal(nether?.affordable, true);
});

test('riptide needs water or rain', () => {
	const c = caps({ melee: { ...caps().melee, trident: 1 } });
	const dry = scoreTactics(tctx({ caps: c })).find((s) => s.tactic === 'riptide');
	const wet = scoreTactics(tctx({ caps: c, inWater: true })).find((s) => s.tactic === 'riptide');
	assert.equal(dry?.affordable, false);
	assert.equal(wet?.affordable, true);
});

// ── L1 modulation ────────────────────────────────────────────────────────────
test('a strong opponent discourages risky tactics', () => {
	assert.ok(skillMod(1, 0.9) < 0);
});

test('a weak opponent encourages safe aggression', () => {
	assert.ok(skillMod(0, 0.1) > 0);
});

test('an even matchup with a risky tactic is penalised', () => {
	assert.ok(skillMod(0.5, 1) < 0);
});

// ── combat intent ────────────────────────────────────────────────────────────
test('cooldown never drops below the floor', () => {
	assert.ok(attackCooldownTicks(null, 100) >= 4);
	assert.ok(attackCooldownTicks('minecraft:diamond_sword', 100) >= 4);
});

test('a faster clicker attacks at least as often', () => {
	const slow = attackCooldownTicks('minecraft:diamond_sword', 3);
	const fast = attackCooldownTicks('minecraft:diamond_sword', 20);
	assert.ok(fast <= slow);
});

test('crit requires being airborne and descending', () => {
	assert.equal(canCrit(bot({ onGround: false, velocityY: -0.5 })), true);
	assert.equal(canCrit(bot({ onGround: false, velocityY: 0.5 })), false);
	assert.equal(canCrit(bot({ onGround: true, velocityY: -0.5 })), false);
});

test('no attack when out of reach', () => {
	const i = planCombat({
		bot: bot(), target: target({ distance: 10 }), caps: caps(),
		pro: resolvePro(DEFAULT_PRO), tactic: 'sword_trade', nowTick: 100, lastAttackTick: -100,
	});
	assert.equal(i.attack, false);
});

test('attacks in reach when the cooldown has elapsed', () => {
	const i = planCombat({
		bot: bot(), target: target({ distance: 2 }), caps: caps(),
		pro: resolvePro(DEFAULT_PRO), tactic: 'sword_trade', nowTick: 100, lastAttackTick: 0,
	});
	assert.equal(i.attack, true);
});

test('does not attack while the cooldown is running', () => {
	const i = planCombat({
		bot: bot(), target: target({ distance: 2 }), caps: caps(),
		pro: resolvePro(DEFAULT_PRO), tactic: 'sword_trade', nowTick: 5, lastAttackTick: 4,
	});
	assert.equal(i.attack, false);
});

test('shield tactic raises the shield flag', () => {
	const i = planCombat({
		bot: bot(), target: target({ distance: 2 }), caps: caps(),
		pro: resolvePro(DEFAULT_PRO), tactic: 'shield_hold', nowTick: 100, lastAttackTick: -100,
	});
	assert.equal(i.shield, true);
});

test('combat intent always aims at the target', () => {
	const i = planCombat({
		bot: bot(), target: target({ location: { x: 9, y: 70, z: 9 } }), caps: caps(),
		pro: resolvePro(DEFAULT_PRO), tactic: 'sword_trade', nowTick: 100, lastAttackTick: -100,
	});
	assert.ok(i.lookAt);
	assert.equal(i.lookAt?.x, 9);
});

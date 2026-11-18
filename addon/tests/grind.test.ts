import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	selectBlock, planGrind, ruleFor, beginMining, evaluateMining,
	type GrindContext, type BlockCandidate,
} from '../src/skills/grind.js';
import type { BotView } from '../src/types.js';

function bot(over: Partial<BotView> = {}): BotView {
	return {
		id: 'b1', name: 'bot', health: 20, maxHealth: 20, hunger: 20, saturation: 5,
		location: { x: 0, y: 64, z: 0 }, view: { x: 0, y: 0, z: 1 },
		onGround: true, velocityY: 0, inWater: false, effects: [], gameMode: 'Survival',
		selectedSlot: 0, items: [], ...over,
	};
}

function cand(typeId: string, x: number, z = 0): BlockCandidate {
	return { typeId, pos: { x, y: 64, z }, distance: Math.abs(x) };
}

function ctx(over: Partial<GrindContext> = {}): GrindContext {
	return {
		bot: bot(), candidates: [], bestToolTier: 4, threat: 0,
		blocked: () => false, ...over,
	};
}

test('the block table carries value and tier', () => {
	const r = ruleFor('minecraft:diamond_ore');
	assert.ok(r);
	assert.equal(r?.requiredTier, 3);
	assert.ok((r?.value ?? 0) > 0);
});

test('unknown blocks are ignored', () => {
	assert.equal(selectBlock(ctx({ candidates: [cand('minecraft:foo', 1)] })), null);
});

test('diamond ore beats stone at the same distance', () => {
	const t = selectBlock(ctx({ candidates: [cand('minecraft:stone', 2), cand('minecraft:diamond_ore', 2)] }));
	assert.equal(t?.typeId, 'minecraft:diamond_ore');
});

test('a distant block loses to an adjacent one', () => {
	// score is value-per-distance: diamond ore is worth the walk at 30 blocks,
	// but not across a whole map.
	const near = selectBlock(ctx({ candidates: [cand('minecraft:stone', 1), cand('minecraft:diamond_ore', 30)] }));
	assert.equal(near?.typeId, 'minecraft:diamond_ore', 'rich ore still wins at 30 blocks');

	const far = selectBlock(ctx({ candidates: [cand('minecraft:stone', 1), cand('minecraft:diamond_ore', 300)] }));
	assert.equal(far?.typeId, 'minecraft:stone', 'but not at 300');
});

test('blocks needing a better tool are skipped', () => {
	const t = selectBlock(ctx({ candidates: [cand('minecraft:diamond_ore', 1)], bestToolTier: 2 }));
	assert.equal(t, null, 'tier 2 cannot harvest diamond ore');
});

test('unbreakable blocks are never targeted', () => {
	const t = selectBlock(ctx({ candidates: [cand('minecraft:bedrock', 1)] }));
	assert.equal(t, null);
});

test('blacklisted blocks are skipped', () => {
	const t = selectBlock(ctx({
		candidates: [cand('minecraft:stone', 1)],
		blocked: (typeId) => typeId === 'minecraft:stone',
	}));
	assert.equal(t, null);
});

test('danger lowers the score but does not zero it', () => {
	const calm = selectBlock(ctx({ candidates: [cand('minecraft:stone', 2)], threat: 0 }));
	const tense = selectBlock(ctx({ candidates: [cand('minecraft:stone', 2)], threat: 0.5 }));
	assert.ok(calm && tense);
	assert.ok((tense?.score ?? 0) < (calm?.score ?? 0));
});

test('grinding is refused when too hungry to sprint', () => {
	const c = ctx({ bot: bot({ hunger: 3 }), candidates: [cand('minecraft:stone', 1)] });
	assert.equal(planGrind(c), null);
});

test('grinding is refused under threat', () => {
	const c = ctx({ threat: 0.8, candidates: [cand('minecraft:stone', 1)] });
	assert.equal(planGrind(c), null);
});

test('planGrind reports in-range when adjacent', () => {
	const c = ctx({ candidates: [cand('minecraft:stone', 2)] });
	const i = planGrind(c);
	assert.ok(i);
	assert.equal(i?.inRange, true);
});

test('planGrind reports out-of-range when far', () => {
	const c = ctx({ candidates: [cand('minecraft:stone', 9)] });
	assert.equal(planGrind(c)?.inRange, false);
});

// ── mining session ───────────────────────────────────────────────────────────
test('a fresh attempt is still mining', () => {
	const rule = ruleFor('minecraft:stone')!;
	const s = beginMining('minecraft:stone', { x: 1, y: 64, z: 0 }, rule, 4, 0);
	const v = evaluateMining(s, { same: true, changed: false, reappeared: false, hasFatigue: false, gameMode: 'Survival' }, 1);
	assert.equal(v, 'STILL_MINING');
});

test('a broken block succeeds', () => {
	const rule = ruleFor('minecraft:stone')!;
	const s = beginMining('minecraft:stone', { x: 1, y: 64, z: 0 }, rule, 4, 0);
	const v = evaluateMining(s, { same: false, changed: true, reappeared: false, hasFatigue: false, gameMode: 'Survival' }, 2);
	assert.equal(v, 'SUCCESS');
});

test('an overrun attempt asks for a retry before concluding', () => {
	const rule = ruleFor('minecraft:stone')!;
	const s = beginMining('minecraft:stone', { x: 1, y: 64, z: 0 }, rule, 4, 0);
	const v = evaluateMining(s, { same: true, changed: false, reappeared: false, hasFatigue: false, gameMode: 'Survival' }, 10_000);
	assert.equal(v, 'NEEDS_RETRY');
});

test('after a retry the same block is declared unbreakable', () => {
	const rule = ruleFor('minecraft:stone')!;
	const s = beginMining('minecraft:stone', { x: 1, y: 64, z: 0 }, rule, 4, 0);
	s.retried = true;
	const v = evaluateMining(s, { same: true, changed: false, reappeared: false, hasFatigue: false, gameMode: 'Survival' }, 10_000);
	assert.equal(v, 'UNBREAKABLE');
});

test('adventure mode aborts the attempt immediately', () => {
	const rule = ruleFor('minecraft:stone')!;
	const s = beginMining('minecraft:stone', { x: 1, y: 64, z: 0 }, rule, 4, 0);
	const v = evaluateMining(s, { same: true, changed: false, reappeared: false, hasFatigue: false, gameMode: 'Adventure' }, 1);
	assert.equal(v, 'ADVENTURE');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpponentModel, reactionToScore, SKILL_DIMS } from '../src/learn/opponent.js';
import { classifyArchetype, counterWeights, decayDistribution } from '../src/learn/archetype.js';
import { TacticBandit, COLD_START_SAMPLES } from '../src/learn/bandit.js';
import ARCH from '../src/data/archetypes.json';

// ── L1 ───────────────────────────────────────────────────────────────────────
test('L1: observing high aim raises the aim dimension', () => {
	const m = new OpponentModel(0.5);
	const before = m.vector().aim;
	for (let i = 0; i < 5; i++) m.observe('aim', 1);
	assert.ok(m.vector().aim > before);
});

test('L1: confidence grows with samples', () => {
	const m = new OpponentModel();
	const c0 = m.confidence('aim');
	m.observe('aim', 1);
	assert.ok(m.confidence('aim') > c0);
});

test('L1: skill is bounded 0..1', () => {
	const m = new OpponentModel();
	for (const d of SKILL_DIMS) for (let i = 0; i < 30; i++) m.observe(d, 5);
	const s = m.skill();
	assert.ok(s >= 0 && s <= 1);
});

test('L1: decays when contact stops', () => {
	const m = new OpponentModel();
	for (const d of SKILL_DIMS) for (let i = 0; i < 30; i++) m.observe(d, 1);
	const before = m.vector().aim;
	m.tick(0, true);
	m.tick(400, false);
	assert.ok(m.vector().aim < before);
});

test('L1: reaction ticks convert to a 0..1 score', () => {
	assert.ok(reactionToScore(0) > reactionToScore(10));
	assert.equal(reactionToScore(100), 0);
});

// ── L2 ───────────────────────────────────────────────────────────────────────
test('L2: a rusher profile classifies as rusher', () => {
	const d = classifyArchetype(ARCH.centroids.rusher, ARCH.centroids);
	const top = Object.entries(d).sort((a, b) => b[1] - a[1])[0];
	assert.equal(top?.[0], 'rusher');
});

test('L2: a turtle profile classifies as turtle', () => {
	const d = classifyArchetype(ARCH.centroids.turtle, ARCH.centroids);
	const top = Object.entries(d).sort((a, b) => b[1] - a[1])[0];
	assert.equal(top?.[0], 'turtle');
});

test('L2: distribution sums to 1', () => {
	const d = classifyArchetype(ARCH.centroids.mace_diver, ARCH.centroids);
	const sum = Object.values(d).reduce((a, b) => a + b, 0);
	assert.ok(Math.abs(sum - 1) < 1e-6);
});

test('L2: counters blend over the distribution', () => {
	const w = counterWeights({ turtle: 1 }, ARCH.counters);
	assert.ok(Math.abs((w.axe_shieldbreak ?? 0) - 1.8) < 1e-6);
});

test('L2: a partial match lands between the pure multipliers', () => {
	const w = counterWeights({ turtle: 0.5, rusher: 0.5 }, ARCH.counters);
	const v = w.axe_shieldbreak ?? 0;
	assert.ok(v > 1.4 && v < 1.8, `got ${v}`);
});

test('L2: decay keeps the distribution normalised', () => {
	const d = decayDistribution({ rusher: 0.7, turtle: 0.3 });
	const sum = Object.values(d).reduce((a, b) => a + b, 0);
	assert.ok(Math.abs(sum - 1) < 1e-6);
});

// ── L3 ───────────────────────────────────────────────────────────────────────
test('L3: bonus is exactly zero during cold start', () => {
	const b = new TacticBandit();
	const f = new Array(10).fill(1);
	assert.equal(b.bonus('sword_trade', f), 0);
	assert.equal(b.samples('sword_trade'), 0);
});

test('L3: updates accumulate samples', () => {
	const b = new TacticBandit({ ...{ learningRate: 0.1, epsilon: 0, epsilonMin: 0, epsilonDecay: 0, maxUpdatesPerMinute: 999, weightClamp: 3 } });
	const f = new Array(10).fill(1);
	for (let i = 0; i < 5; i++) b.update('sword_trade', f, 1, 0);
	assert.equal(b.samples('sword_trade'), 5);
});

test('L3: bonus appears only after cold start is passed', () => {
	const b = new TacticBandit({ learningRate: 0.1, epsilon: 0, epsilonMin: 0, epsilonDecay: 0, maxUpdatesPerMinute: 999, weightClamp: 3 });
	const f = new Array(10).fill(0.5);
	for (let i = 0; i < COLD_START_SAMPLES; i++) b.update('axe_shieldbreak', f, 1, 0);
	assert.ok(b.bonus('axe_shieldbreak', f) !== 0);
});

test('L3: quota refuses updates beyond the per-minute cap', () => {
	const b = new TacticBandit({ learningRate: 0.1, epsilon: 0, epsilonMin: 0, epsilonDecay: 0, maxUpdatesPerMinute: 3, weightClamp: 3 });
	const f = new Array(10).fill(1);
	assert.equal(b.update('a', f, 1, 0), true);
	assert.equal(b.update('a', f, 1, 0), true);
	assert.equal(b.update('a', f, 1, 0), true);
	assert.equal(b.update('a', f, 1, 0), false);
});

test('L3: quota resets after a minute of ticks', () => {
	const b = new TacticBandit({ learningRate: 0.1, epsilon: 0, epsilonMin: 0, epsilonDecay: 0, maxUpdatesPerMinute: 1, weightClamp: 3 });
	const f = new Array(10).fill(1);
	assert.equal(b.update('a', f, 1, 0), true);
	assert.equal(b.update('a', f, 1, 0), false);
	assert.equal(b.update('a', f, 1, 1300), true);
});

test('L3: choose returns a member of the candidate list', () => {
	const b = new TacticBandit();
	const f = new Array(10).fill(1);
	for (let i = 0; i < 50; i++) {
		const c = b.choose(['a', 'b', 'c'], f, i);
		assert.ok(c === 'a' || c === 'b' || c === 'c');
	}
});

test('L3: choose handles an empty list', () => {
	assert.equal(new TacticBandit().choose([], [], 0), null);
});

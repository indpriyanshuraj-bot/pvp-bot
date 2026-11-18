import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRO_PRESETS, resolvePro, combineUtility, DEFAULT_PRO } from '../src/core/pro.js';

test('L3 slider at zero removes the learned layer entirely', () => {
	const r = resolvePro({ ...DEFAULT_PRO, l3: 0 });
	assert.equal(r.w3, 0);
	assert.equal(combineUtility(50, r, 0, 0, 999), 50);
});

test('every slider at zero leaves the base utility untouched', () => {
	const r = resolvePro({ ...DEFAULT_PRO, l1: 0, l2: 0, l3: 0 });
	assert.equal(combineUtility(40, r, 5, 5, 5), 40);
});

test('raising L1 increases the L1 weight', () => {
	const lo = resolvePro({ ...DEFAULT_PRO, l1: 10 });
	const hi = resolvePro({ ...DEFAULT_PRO, l1: 90 });
	assert.ok(hi.w1 > lo.w1);
});

test('modulation is clamped so no layer dominates', () => {
	const r = resolvePro(PRO_PRESETS.pro!);
	const v = combineUtility(50, r, 100, 100, 100);
	assert.ok(v <= 50 * 8, `got ${v}`);
});

test('pro preset is more responsive than easy', () => {
	const easy = resolvePro(PRO_PRESETS.easy!);
	const pro = resolvePro(PRO_PRESETS.pro!);
	assert.ok(pro.reactionTicks <= easy.reactionTicks);
	assert.ok(pro.cps >= easy.cps);
	assert.ok(pro.aimErrorDeg <= easy.aimErrorDeg);
});

test('governor throttling lowers the effective pro factor', () => {
	const full = resolvePro(PRO_PRESETS.pro!, 1);
	const throttled = resolvePro(PRO_PRESETS.pro!, 0.6);
	assert.ok(throttled.cps < full.cps);
	assert.ok(throttled.w3 < full.w3);
});

test('resolvePro never returns a zero reaction', () => {
	const r = resolvePro({ ...DEFAULT_PRO, reactionMs: 0 });
	assert.ok(r.reactionTicks >= 1);
});

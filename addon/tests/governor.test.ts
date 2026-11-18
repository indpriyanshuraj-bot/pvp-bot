import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Governor, DEFAULT_GOVERNOR, type Tier } from '../src/core/governor.js';

function make() {
	return new Governor({ ...DEFAULT_GOVERNOR, recoverMs: 1000, window: 5 });
}

test('fresh governor is OK', () => {
	assert.equal(make().current, 'OK');
});

test('sustained 10ms p95 escalates to WARN', () => {
	const g = make();
	let t: Tier = 'OK';
	for (let i = 0; i < 5; i++) t = g.record(10, i);
	assert.equal(t, 'WARN');
});

test('a single 25ms spike escalates to EMERGENCY', () => {
	const g = make();
	for (let i = 0; i < 5; i++) g.record(25, i);
	assert.equal(g.current, 'EMERGENCY');
});

test('recovery steps down one tier at a time and needs the hold window', () => {
	const g = make();
	for (let i = 0; i < 5; i++) g.record(25, i);
	assert.equal(g.current, 'EMERGENCY');

	// fill the window with fast ticks; the first low call only arms the timer
	for (let i = 0; i < 5; i++) g.record(5, 100 + i);
	assert.equal(g.current, 'EMERGENCY', 'must not recover immediately');

	// one full hold window later it drops exactly one tier
	g.record(5, 1200);
	assert.equal(g.current, 'DEGRADE');

	g.record(5, 2400);
	assert.equal(g.current, 'WARN');

	g.record(5, 3600);
	assert.equal(g.current, 'OK');
});

test('forceEmergency holds for its window then recovers', () => {
	const g = make();
	g.forceEmergency(0, 500);
	g.record(1, 100);
	assert.equal(g.current, 'EMERGENCY', 'still inside the forced hold');
	// once the hold expires the normal recovery window applies
	g.record(1, 600);
	assert.equal(g.current, 'EMERGENCY', 'hold expired but window not yet elapsed');
	g.record(1, 1700);
	assert.equal(g.current, 'DEGRADE');
});

test('throttle follows the tier', () => {
	const g = make();
	const ok = g.throttle;
	for (let i = 0; i < 5; i++) g.record(25, i);
	assert.ok(g.throttle.botsPerTick <= ok.botsPerTick);
	assert.ok(g.throttle.thinkTicks >= ok.thinkTicks);
	assert.equal(g.throttle.chat, false);
});

test('ignores non-finite samples', () => {
	const g = make();
	g.record(Number.NaN, 0);
	g.record(-5, 1);
	assert.equal(g.current, 'OK');
});

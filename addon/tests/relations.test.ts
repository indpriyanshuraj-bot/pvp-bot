import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Relations, betrayalScore, HOSTILE_TRUST, FRIENDLY_TRUST } from '../src/social/relations.js';

test('an unknown player is neutral', () => {
	assert.equal(new Relations().trustOf('p1'), 0);
});

test('a real hit costs a lot of trust', () => {
	const r = new Relations();
	assert.equal(r.recordHit('p1', 8, 100), -40);
});

test('a single light bump barely moves the needle', () => {
	const r = new Relations();
	assert.equal(r.recordHit('p1', 2, 100), -5);
});

test('repeated light hits are a pattern, not an accident', () => {
	const r = new Relations();
	r.recordHit('p1', 2, 100);
	assert.equal(r.recordHit('p1', 2, 150), -30);
});

test('light hits spread far apart stay accidental', () => {
	const r = new Relations();
	r.recordHit('p1', 2, 100);
	assert.equal(r.recordHit('p1', 2, 1000), -10);
});

test('healing builds trust', () => {
	const r = new Relations();
	r.recordHeal('p1', 100);
	assert.equal(r.trustOf('p1'), 20);
});

test('fighting the same target builds trust', () => {
	const r = new Relations();
	r.recordSharedTarget('p1');
	assert.equal(r.trustOf('p1'), 10);
});

test('theft costs trust', () => {
	const r = new Relations();
	r.recordTheft('p1');
	assert.equal(r.trustOf('p1'), -20);
});

test('a teammate cannot be distrusted below the floor', () => {
	const r = new Relations();
	r.setTeammate('p1');
	assert.ok(r.trustOf('p1') >= 50);
	r.recordHit('p1', 10, 100);
	assert.equal(r.trustOf('p1'), 10, 'one big hit still dents it');
});

test('hostile and friendly thresholds', () => {
	const r = new Relations();
	r.recordHit('a', 10, 1);
	r.recordHit('b', 10, 1);
	// -40 then four heals of +20 to climb back past the friendly floor
	for (let i = 0; i < 4; i++) r.recordHeal('b', 2 + i);
	assert.equal(r.isHostile('a'), true);
	assert.equal(r.isFriendly('b'), true);
	assert.equal(r.isFriendly('a'), false);
});

test('trust is clamped', () => {
	const r = new Relations();
	for (let i = 0; i < 10; i++) r.recordHit('p1', 10, i * 300);
	assert.ok(r.trustOf('p1') >= -100);
	assert.ok(HOSTILE_TRUST < 0 && FRIENDLY_TRUST > 0);
});

test('trust drifts back toward neutral', () => {
	const r = new Relations();
	r.recordHeal('p1', 0);
	r.decay(5000);
	assert.ok(r.trustOf('p1') < 20);
});

test('betrayal stays low for a trusted, idle ally', () => {
	const s = betrayalScore({ trust: 80, closingSpeed: 0, weaponDrawn: false, behind: false, switchedToMe: false });
	assert.ok(s < 0.2, `got ${s}`);
});

test('betrayal rises with bad signals', () => {
	const calm = betrayalScore({ trust: 0, closingSpeed: 0, weaponDrawn: false, behind: false, switchedToMe: false });
	const bad = betrayalScore({ trust: -50, closingSpeed: 1, weaponDrawn: true, behind: true, switchedToMe: true });
	assert.ok(bad > calm);
	assert.ok(bad > 0.9);
});

test('betrayal is always a probability', () => {
	for (const trust of [-100, 0, 100]) {
		const s = betrayalScore({ trust, closingSpeed: 2, weaponDrawn: true, behind: true, switchedToMe: true });
		assert.ok(s >= 0 && s <= 1);
	}
});

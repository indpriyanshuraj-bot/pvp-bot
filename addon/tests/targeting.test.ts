import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispositionOf, scoreCandidate, pickTarget, DEFAULT_TARGET_POLICY, type TargetCandidate } from '../src/core/targeting.js';

function cand(over: Partial<TargetCandidate> = {}): TargetCandidate {
	return {
		id: 'e1', typeId: 'minecraft:zombie', distance: 5, isPlayer: false,
		gameMode: 'Survival', health: 20, maxHealth: 20, attackingMe: false, ...over,
	};
}

test('mob dispositions come from the table', () => {
	assert.equal(dispositionOf('minecraft:zombie'), 'hostile');
	assert.equal(dispositionOf('minecraft:enderman'), 'neutral');
	assert.equal(dispositionOf('minecraft:cow'), 'passive');
	assert.equal(dispositionOf('minecraft:unknown_thing'), 'passive');
});

test('a nearby hostile mob is a valid target', () => {
	assert.ok(scoreCandidate(cand(), DEFAULT_TARGET_POLICY) > 0);
});

test('a passive mob is never a target', () => {
	assert.equal(scoreCandidate(cand({ typeId: 'minecraft:cow' }), DEFAULT_TARGET_POLICY), 0);
});

test('an unprovoked neutral mob is ignored', () => {
	assert.equal(scoreCandidate(cand({ typeId: 'minecraft:enderman' }), DEFAULT_TARGET_POLICY), 0);
});

test('a provoked neutral mob becomes a target', () => {
	assert.ok(scoreCandidate(cand({ typeId: 'minecraft:enderman', attackingMe: true }), DEFAULT_TARGET_POLICY) > 0);
});

test('a survival player outranks a mob at the same distance', () => {
	const p = scoreCandidate(cand({ isPlayer: true, typeId: 'minecraft:player' }), DEFAULT_TARGET_POLICY);
	const m = scoreCandidate(cand(), DEFAULT_TARGET_POLICY);
	assert.ok(p > m);
});

test('a creative player is never attacked', () => {
	assert.equal(scoreCandidate(cand({ isPlayer: true, typeId: 'minecraft:player', gameMode: 'Creative' }), DEFAULT_TARGET_POLICY), 0);
});

test('beyond range nothing is a target', () => {
	assert.equal(scoreCandidate(cand({ distance: 100 }), DEFAULT_TARGET_POLICY), 0);
});

test('a mob attacking us beats a distant player', () => {
	const mob = cand({ distance: 2, attackingMe: true });
	const player = cand({ id: 'p', isPlayer: true, typeId: 'minecraft:player', distance: 20 });
	assert.equal(pickTarget([mob, player], DEFAULT_TARGET_POLICY)?.id, 'e1');
});

test('the nearest hostile wins among mobs', () => {
	const near = cand({ id: 'near', distance: 3 });
	const far = cand({ id: 'far', distance: 12 });
	assert.equal(pickTarget([far, near], DEFAULT_TARGET_POLICY)?.id, 'near');
});

test('attackMobs off means mobs are ignored', () => {
	const policy = { ...DEFAULT_TARGET_POLICY, attackMobs: false };
	assert.equal(pickTarget([cand()], policy), null);
});

test('an empty field returns null', () => {
	assert.equal(pickTarget([]), null);
});

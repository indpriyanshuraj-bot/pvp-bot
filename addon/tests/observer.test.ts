import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArchetypeObserver, DEFAULT_WINDOW } from '../src/social/observer.js';

function sample(over: Partial<Parameters<ArchetypeObserver['observe']>[1]> = {}) {
	return {
		distance: 3, shielding: false, airborne: false, sprinting: false,
		healthFrac: 1, heldTypeId: 'minecraft:iron_sword', ...over,
	};
}

test('a fresh observer reports near-zero rates', () => {
	const o = new ArchetypeObserver();
	const f = o.features();
	assert.equal(f.attackRate, 0);
	assert.equal(o.samples, 0);
});

test('shield time is a fraction of samples', () => {
	const o = new ArchetypeObserver();
	for (let i = 0; i < 10; i++) o.observe(i, sample({ shielding: i < 5 }));
	assert.equal(o.features().shieldTimePct, 0.5);
});

test('attack rate is per second', () => {
	const o = new ArchetypeObserver();
	for (let i = 0; i < 20; i++) {
		o.observe(i, sample());
		o.recordAttack();
	}
	// 20 samples == 1 second at 20 TPS
	assert.ok(Math.abs((o.features().attackRate ?? 0) - 20) < 0.001);
});

test('preferred distance is averaged', () => {
	const o = new ArchetypeObserver();
	o.observe(0, sample({ distance: 2 }));
	o.observe(1, sample({ distance: 4 }));
	assert.equal(o.features().preferredDistance, 3);
});

test('retreat hp tracks the lowest health seen', () => {
	const o = new ArchetypeObserver();
	o.observe(0, sample({ healthFrac: 1 }));
	o.observe(1, sample({ healthFrac: 0.25 }));
	o.observe(2, sample({ healthFrac: 0.8 }));
	assert.equal(o.features().retreatHp, 5);
});

test('axe share reflects held item', () => {
	const o = new ArchetypeObserver();
	for (let i = 0; i < 10; i++) o.observe(i, sample({ heldTypeId: i < 8 ? 'minecraft:iron_axe' : 'minecraft:iron_sword' }));
	assert.equal(o.features().axeShare, 0.8);
});

test('the window rolls over and clears counters', () => {
	const o = new ArchetypeObserver(DEFAULT_WINDOW);
	for (let i = 0; i < 10; i++) o.observe(i, sample({ shielding: true }));
	assert.equal(o.features().shieldTimePct, 1);
	o.observe(DEFAULT_WINDOW + 5, sample({ shielding: false }));
	assert.equal(o.samples, 1, 'counter resets after the window');
});

test('event counters land in the feature vector', () => {
	const o = new ArchetypeObserver();
	for (let i = 0; i < 20; i++) o.observe(i, sample());
	o.recordPearl();
	o.recordCrystal();
	o.recordPotion();
	o.recordElytra();
	const f = o.features();
	assert.ok((f.pearlRate ?? 0) > 0);
	assert.ok((f.crystalRate ?? 0) > 0);
	assert.ok((f.potionRate ?? 0) > 0);
	assert.ok((f.elytraUse ?? 0) > 0);
});

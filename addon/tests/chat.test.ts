import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChatPolicy, fillTemplate, evaluateWhen, type ChatContext, type ChatTriggerDef } from '../src/social/chat.js';

const ctx: ChatContext = {
	targetName: 'Steve', targetHealth: 4, targetMaxHealth: 20,
	myHealth: 18, myMaxHealth: 20, myWeapon: 'minecraft:diamond_sword',
	distance: 3, targetShielding: false,
};

const TRIGGERS: Record<string, ChatTriggerDef> = {
	taunt: {
		to: 'target',
		when: { targetHealthBelow: 0.3, myHealthAbove: 0.7, maxDistance: 8 },
		templates: ['{target}, you are on {targetHealth}'],
		cooldown: 600, globalCooldown: 200, chance: 1,
	},
};

test('templates fill from live state', () => {
	assert.equal(fillTemplate('{target} has {targetHealth} hp', ctx), 'Steve has 4 hp');
});

test('weapon slot is prettified', () => {
	assert.equal(fillTemplate('using {myWeapon}', ctx), 'using diamond sword');
});

test('unknown slots are left alone rather than blanked', () => {
	assert.equal(fillTemplate('hi {nobody}', ctx), 'hi {nobody}');
});

test('a condition set passes when everything holds', () => {
	assert.equal(evaluateWhen({ targetHealthBelow: 0.3, maxDistance: 5 }, ctx), true);
});

test('any failing condition blocks the line', () => {
	assert.equal(evaluateWhen({ targetHealthBelow: 0.3, maxDistance: 1 }, ctx), false);
	assert.equal(evaluateWhen({ myHealthBelow: 0.5 }, ctx), false);
	assert.equal(evaluateWhen({ targetShielding: true }, ctx), false);
});

test('a trigger fires when conditions and chance allow', () => {
	const p = new ChatPolicy(TRIGGERS, () => 0);
	const line = p.maybeSay('taunt', ctx, 1000);
	assert.ok(line);
	assert.equal(line?.text, 'Steve, you are on 4');
});

test('the line carries a human delay', () => {
	const p = new ChatPolicy(TRIGGERS, () => 0);
	const line = p.maybeSay('taunt', ctx, 1000);
	assert.ok((line?.delayTicks ?? 0) >= 20);
});

test('per-trigger cooldown blocks a repeat', () => {
	const p = new ChatPolicy(TRIGGERS, () => 0);
	assert.ok(p.maybeSay('taunt', ctx, 1000));
	assert.equal(p.maybeSay('taunt', ctx, 1100), null);
});

test('the same trigger can fire again after its cooldown', () => {
	const p = new ChatPolicy(TRIGGERS, () => 0);
	assert.ok(p.maybeSay('taunt', ctx, 1000));
	assert.ok(p.maybeSay('taunt', ctx, 1700));
});

test('chance zero never fires', () => {
	const p = new ChatPolicy({ ...TRIGGERS, taunt: { ...TRIGGERS.taunt!, chance: 0 } }, () => 0.5);
	assert.equal(p.maybeSay('taunt', ctx, 1000), null);
});

test('an unknown trigger is silent', () => {
	const p = new ChatPolicy(TRIGGERS, () => 0);
	assert.equal(p.maybeSay('nope', ctx, 1000), null);
});

test('maybeSayAny finds the first firing trigger', () => {
	const p = new ChatPolicy(TRIGGERS, () => 0);
	const line = p.maybeSayAny(ctx, 1000);
	assert.ok(line);
});

test('a healthy target produces no taunt', () => {
	const p = new ChatPolicy(TRIGGERS, () => 0);
	const healthy = { ...ctx, targetHealth: 20 };
	assert.equal(p.maybeSay('taunt', healthy, 1000), null);
});

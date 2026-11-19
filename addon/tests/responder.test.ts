import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReplyPolicy, fillReply, SPEAKER_COOLDOWN } from '../src/social/responder.js';

const ctx = { speaker: 'Steve', intent: 'challenge', coords: { x: 10, y: 64, z: -4 }, health: 18 };

test('coordinates are filled from live state', () => {
	assert.equal(fillReply('I am at {coords}', ctx), 'I am at 10 64 -4');
});

test('speaker name is filled', () => {
	assert.equal(fillReply('yo {speaker}', ctx), 'yo Steve');
});

test('missing coords degrade gracefully', () => {
	assert.equal(fillReply('{coords}', { speaker: 'a', intent: 'greet' }), 'here');
});

test('a challenge gets a reply', () => {
	const p = new ReplyPolicy(() => 0);
	const r = p.maybeReply(ctx, 1000);
	assert.ok(r);
	assert.ok(r?.text.length);
});

test('an unknown intent is ignored', () => {
	const p = new ReplyPolicy(() => 0);
	assert.equal(p.maybeReply({ speaker: 'a', intent: 'nonsense' }, 1000), null);
});

test('per-speaker cooldown blocks a repeat', () => {
	const p = new ReplyPolicy(() => 0);
	assert.ok(p.maybeReply(ctx, 1000));
	assert.equal(p.maybeReply(ctx, 1000 + SPEAKER_COOLDOWN - 1), null);
});

test('a different speaker is not blocked by another cooldown', () => {
	const p = new ReplyPolicy(() => 0);
	assert.ok(p.maybeReply(ctx, 1000));
	assert.ok(p.maybeReply({ ...ctx, speaker: 'Alex' }, 1000 + SPEAKER_COOLDOWN));
});

test('chance zero never replies', () => {
	const p = new ReplyPolicy(() => 0.99);
	assert.equal(p.maybeReply(ctx, 1000), null);
});

test('the reply carries a delay', () => {
	const p = new ReplyPolicy(() => 0);
	const r = p.maybeReply(ctx, 1000);
	assert.ok((r?.delayTicks ?? 0) >= 20);
});

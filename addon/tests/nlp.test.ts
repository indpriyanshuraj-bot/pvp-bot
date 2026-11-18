import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stem, normalise, tokenize, classify, extractSlots } from '../src/social/nlp.js';
import INTENTS from '../src/data/chat-intents.json';

// Classic Porter paper vectors.
const PORTER: Array<[string, string]> = [
	['caresses', 'caress'], ['ponies', 'poni'], ['ties', 'ti'], ['caress', 'caress'],
	['cats', 'cat'], ['feed', 'feed'], ['agreed', 'agre'], ['plastered', 'plaster'],
	['motoring', 'motor'], ['sing', 'sing'], ['troubled', 'troubl'], ['sized', 'size'],
	['hopping', 'hop'], ['falling', 'fall'], ['hissing', 'hiss'], ['fizzed', 'fizz'],
	['failing', 'fail'], ['filing', 'file'], ['happy', 'happi'], ['sky', 'sky'],
];

for (const [input, expected] of PORTER) {
	test(`porter: ${input} -> ${expected}`, () => {
		assert.equal(stem(input), expected);
	});
}

test('normalise strips colour codes', () => {
	assert.equal(normalise('\u00a7cHello\u00a7r there'), 'hello there');
});

test('normalise collapses repeated letters', () => {
	assert.equal(normalise('sooooo good'), 'soo good');
});

test('normalise removes punctuation', () => {
	assert.equal(normalise('hi!!! 1v1??'), 'hi 1v1');
});

test('slang expands to words', () => {
	const { tokens } = tokenize('1v1 me pls');
	assert.ok(tokens.includes('duel'), `got ${tokens.join(',')}`);
	assert.ok(tokens.includes('please'));
});

test('stopwords are dropped', () => {
	const { tokens } = tokenize('do you want to fight');
	assert.deepEqual(tokens, ['want', 'fight']);
});

test('classifies a duel challenge', () => {
	const m = classify('do you want to 1v1', INTENTS);
	assert.ok(m, 'expected a match');
	if (!m) throw new Error('unreachable');
	assert.equal(m.intent, 'challenge');
	assert.ok(m.score >= 0.34);
});

test('classifies a greeting', () => {
	const m = classify('hey hello', INTENTS);
	assert.ok(m);
	if (!m) throw new Error('unreachable');
	assert.equal(m.intent, 'greet');
});

test('stays silent when nothing matches confidently', () => {
	assert.equal(classify('the weather is odd today', INTENTS), null);
});

test('stays silent on empty input', () => {
	assert.equal(classify('   ', INTENTS), null);
});

test('extracts player names and numbers', () => {
	const slots = extractSlots(['steve', 'fight', '10'], ['Steve']);
	assert.deepEqual(slots.players, ['steve']);
	assert.deepEqual(slots.numbers, [10]);
});

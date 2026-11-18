/**
 * Rule-based chat NLP. No neural model, no network, no external parser.
 * Porter stemmer (public-domain algorithm) + weighted keyword intent matching.
 * Pure logic: unit-testable without a Minecraft runtime.
 */

// ── Porter stemmer ────────────────────────────────────────────────────────────
const STEP2: Record<string, string> = {
	ational: 'ate', tional: 'tion', enci: 'ence', anci: 'ance', izer: 'ize',
	bli: 'ble', alli: 'al', entli: 'ent', eli: 'e', ousli: 'ous',
	ization: 'ize', ation: 'ate', ator: 'ate', alism: 'al', iveness: 'ive',
	fulness: 'ful', ousness: 'ous', aliti: 'al', iviti: 'ive', biliti: 'ble',
	logi: 'log',
};
const STEP3: Record<string, string> = {
	icate: 'ic', ative: '', alize: 'al', iciti: 'ic', ical: 'ic', ful: '', ness: '',
};

const C = '[^aeiou]';
const V = '[aeiouy]';
const CC = C + '[^aeiouy]*';
const VV = V + '[aeiou]*';
const MGR0 = new RegExp(`^(${CC})?${VV}${CC}`);
const MEQ1 = new RegExp(`^(${CC})?${VV}${CC}(${VV})?$`);
const MGR1 = new RegExp(`^(${CC})?${VV}${CC}${VV}${CC}`);
const S_V = new RegExp(`^(${CC})?${V}`);

/** Classic Porter stemming algorithm. */
export function stem(word: string): string {
	let w = word;
	if (w.length < 3) return w;
	const first = w[0] as string;
	if (first === 'y') w = 'Y' + w.slice(1);

	// Step 1a
	if (/^(.+?)(ss|i)es$/.test(w)) w = w.replace(/^(.+?)(ss|i)es$/, '$1$2');
	else if (/^(.+?)([^s])s$/.test(w)) w = w.replace(/^(.+?)([^s])s$/, '$1$2');

	// Step 1b
	if (/^(.+?)eed$/.test(w)) {
		const m = /^(.+?)eed$/.exec(w) as RegExpExecArray;
		if (MGR0.test(m[1] as string)) w = w.replace(/.$/, '');
	} else if (/^(.+?)(ed|ing)$/.test(w)) {
		const m = /^(.+?)(ed|ing)$/.exec(w) as RegExpExecArray;
		const s = m[1] as string;
		if (S_V.test(s)) {
			w = s;
			if (/(at|bl|iz)$/.test(w)) w += 'e';
			else if (new RegExp(`([^aeiouylsz])\\1$`).test(w)) w = w.replace(/.$/, '');
			else if (new RegExp(`^${CC}${V}[^aeiouwxy]$`).test(w)) w += 'e';
		}
	}

	// Step 1c
	if (/^(.+?)y$/.test(w)) {
		const m = /^(.+?)y$/.exec(w) as RegExpExecArray;
		const s = m[1] as string;
		if (S_V.test(s)) w = s + 'i';
	}

	// Step 2
	const r2 = /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/.exec(w);
	if (r2) {
		const s = r2[1] as string;
		const suf = r2[2] as string;
		if (MGR0.test(s)) w = s + (STEP2[suf] as string);
	}

	// Step 3
	const r3 = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/.exec(w);
	if (r3) {
		const s = r3[1] as string;
		const suf = r3[2] as string;
		if (MGR0.test(s)) w = s + (STEP3[suf] as string);
	}

	// Step 4
	const r4 = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/.exec(w);
	const r4b = /^(.+?)(s|t)(ion)$/.exec(w);
	if (r4) {
		const s = r4[1] as string;
		if (MGR1.test(s)) w = s;
	} else if (r4b) {
		const s = (r4b[1] as string) + (r4b[2] as string);
		if (MGR1.test(s)) w = s;
	}

	// Step 5
	const r5 = /^(.+?)e$/.exec(w);
	if (r5) {
		const s = r5[1] as string;
		if (MGR1.test(s) || (MEQ1.test(s) && !new RegExp(`^${CC}${V}[^aeiouwxy]$`).test(s))) w = s;
	}
	if (/ll$/.test(w) && MGR1.test(w)) w = w.replace(/.$/, '');

	if (first === 'y') w = 'y' + w.slice(1);
	return w;
}

// ── normalisation ─────────────────────────────────────────────────────────────
const SLANG: Record<string, string> = {
	u: 'you', ur: 'your', r: 'are', pls: 'please', plz: 'please', thx: 'thanks',
	ty: 'thanks', ez: 'easy', gg: 'goodgame', wp: 'wellplayed', wya: 'where',
	rn: 'rightnow', omw: 'onmyway', brb: 'berightback', idk: 'dontknow',
	imo: 'inmyopinion', ngl: 'nottogonnalie', tbh: 'tobehonest',
	'1v1': 'duel', pvp: 'duel', fightme: 'duel', noob: 'noob', bot: 'bot',
};

const STOPWORDS = new Set([
	'a', 'an', 'the', 'is', 'it', 'to', 'of', 'and', 'or', 'in', 'on', 'at',
	'i', 'me', 'my', 'you', 'your', 'we', 'he', 'she', 'they', 'this', 'that',
	'so', 'just', 'be', 'was', 'were', 'do', 'did', 'for', 'with', 'as',
]);

/** Lowercase, strip colour codes and punctuation, collapse repeated letters. */
export function normalise(raw: string): string {
	return raw
		.replace(/\u00a7[0-9a-fk-or]/gi, ' ')   // section-sign colour codes
		.toLowerCase()
		.replace(/[^a-z0-9\s']/g, ' ')
		.replace(/(.)\1{2,}/g, '$1$1')          // "sooo" -> "soo"
		.replace(/\s+/g, ' ')
		.trim();
}

export interface TokenizeResult {
	tokens: string[];
	stems: string[];
}

export function tokenize(text: string): TokenizeResult {
	const words = normalise(text).split(' ').filter(Boolean);
	const expanded: string[] = [];
	for (const w of words) {
		const s = SLANG[w];
		if (s && !/^[a-z]+$/.test(s)) {
			// camel-joined slang like "goodgame" is already one token
			expanded.push(s);
		} else if (s) {
			expanded.push(s);
		} else {
			expanded.push(w);
		}
	}
	const tokens = expanded.filter((w) => w.length > 0 && !STOPWORDS.has(w));
	return { tokens, stems: tokens.map(stem) };
}

// ── intent matching ───────────────────────────────────────────────────────────
export interface IntentDef {
	kw: Record<string, number>;
	reply?: string[];
}

export interface Slots {
	players: string[];
	numbers: number[];
}

export interface IntentMatch {
	intent: string;
	score: number;
	coverage: number;
	specificity: number;
	slots: Slots;
}

/**
 * Score = coverage (how much of the intent's keyword weight is present)
 *       + 0.3 * specificity (distinct matches / token count)
 * Deliberately simple and inspectable.
 */
export function classify(
	text: string,
	intents: Record<string, IntentDef>,
	gazetteer: readonly string[] = [],
	threshold = 0.34,
): IntentMatch | null {
	const { tokens, stems } = tokenize(text);
	if (tokens.length === 0) return null;

	const bag = new Set<string>([...tokens, ...stems]);
	const slots = extractSlots(tokens, gazetteer);

	let best: IntentMatch | null = null;
	for (const [name, def] of Object.entries(intents)) {
		let totalWeight = 0;
		let matchedWeight = 0;
		let distinct = 0;
		for (const [kw, weight] of Object.entries(def.kw)) {
			totalWeight += weight;
			if (bag.has(kw) || bag.has(stem(kw))) {
				matchedWeight += weight;
				distinct++;
			}
		}
		if (totalWeight === 0 || distinct === 0) continue;
		const coverage = matchedWeight / totalWeight;
		const specificity = Math.min(1, distinct / Math.max(1, tokens.length));
		const score = coverage + 0.3 * specificity;
		if (!best || score > best.score) {
			best = { intent: name, score, coverage, specificity, slots };
		}
	}

	if (!best || best.score < threshold) return null;
	return best;
}

export function extractSlots(tokens: readonly string[], gazetteer: readonly string[]): Slots {
	const lower = new Set(gazetteer.map((g) => g.toLowerCase()));
	const players: string[] = [];
	const numbers: number[] = [];
	for (const t of tokens) {
		if (lower.has(t)) players.push(t);
		const n = Number(t);
		if (Number.isFinite(n) && t.trim() !== '') numbers.push(n);
	}
	return { players, numbers };
}

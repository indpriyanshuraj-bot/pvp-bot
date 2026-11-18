/**
 * L2 — playstyle recognition and counter selection.
 * Cosine similarity against data centroids, then a blended counter table.
 * Pure logic; every number comes from data/archetypes.json.
 */

export type ArchFeature =
	| 'attackRate' | 'shieldTimePct' | 'preferredDistance' | 'jumpRate'
	| 'pearlRate' | 'crystalRate' | 'potionRate' | 'retreatHp'
	| 'elytraUse' | 'axeShare';

export const ARCH_FEATURES: readonly ArchFeature[] = [
	'attackRate', 'shieldTimePct', 'preferredDistance', 'jumpRate',
	'pearlRate', 'crystalRate', 'potionRate', 'retreatHp',
	'elytraUse', 'axeShare',
];

/**
 * Per-feature scales so that a 20-block distance does not dominate a 0..1
 * fraction during cosine similarity.
 */
export const FEATURE_SCALE: Record<ArchFeature, number> = {
	attackRate: 3, shieldTimePct: 1, preferredDistance: 8, jumpRate: 2,
	pearlRate: 1, crystalRate: 1, potionRate: 1, retreatHp: 20,
	elytraUse: 1, axeShare: 1,
};

export type ArchetypeCentroids = Record<string, Partial<Record<ArchFeature, number>>>;
export type CounterTable = Record<string, Record<string, number>>;

export type Distribution = Record<string, number>;

function scaled(
	obs: Partial<Record<ArchFeature, number>>,
): number[] {
	return ARCH_FEATURES.map((f) => (obs[f] ?? 0) / FEATURE_SCALE[f]);
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		const x = a[i] as number;
		const y = b[i] as number;
		dot += x * y;
		na += x * x;
		nb += y * y;
	}
	if (na === 0 || nb === 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Turn observations into a probability distribution over archetypes.
 * `temperature` sharpens (small) or flattens (large) the result.
 */
export function classifyArchetype(
	obs: Partial<Record<ArchFeature, number>>,
	centroids: ArchetypeCentroids,
	temperature = 0.25,
): Distribution {
	const o = scaled(obs);
	const sims: Array<[string, number]> = [];
	for (const [name, c] of Object.entries(centroids)) {
		sims.push([name, cosine(o, scaled(c))]);
	}
	if (sims.length === 0) return {};

	const max = Math.max(...sims.map((s) => s[1]));
	const exps = sims.map(([n, s]) => [n, Math.exp((s - max) / Math.max(0.01, temperature))] as [string, number]);
	const sum = exps.reduce((a, b) => a + b[1], 0) || 1;

	const out: Distribution = {};
	for (const [n, e] of exps) out[n] = e / sum;
	return out;
}

/**
 * Blend counter multipliers over the distribution.
 * Returns tactic -> multiplier (1 = neutral).
 */
export function counterWeights(dist: Distribution, counters: CounterTable): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [arch, p] of Object.entries(dist)) {
		const row = counters[arch];
		if (!row) continue;
		for (const [tactic, mult] of Object.entries(row)) {
			out[tactic] = (out[tactic] ?? 1) * Math.pow(mult, p);
		}
	}
	return out;
}

/** Exponential decay of the distribution so a style switch is re-read in ~20 s. */
export function decayDistribution(dist: Distribution, factor = 0.95): Distribution {
	const out: Distribution = {};
	let sum = 0;
	for (const [k, v] of Object.entries(dist)) {
		const nv = v * factor;
		out[k] = nv;
		sum += nv;
	}
	if (sum <= 0) return {};
	// renormalise only the surviving mass; keep a uniform floor so nothing hits 0
	const n = Object.keys(out).length || 1;
	for (const k of Object.keys(out)) out[k] = (out[k] as number) / sum * 0.9 + 0.1 / n;
	return out;
}

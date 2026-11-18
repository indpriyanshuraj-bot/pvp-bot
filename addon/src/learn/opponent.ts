/**
 * L1 — live opponent skill estimate. Six dimensions, each an EMA with a
 * confidence counter, decaying when contact stops. Pure logic.
 */

export type SkillDim = 'aim' | 'reaction' | 'combo' | 'shieldUse' | 'healDiscipline' | 'movement';

export const SKILL_DIMS: readonly SkillDim[] = [
	'aim', 'reaction', 'combo', 'shieldUse', 'healDiscipline', 'movement',
];

const WEIGHTS: Record<SkillDim, number> = {
	aim: 1.2, reaction: 1.0, combo: 1.0, shieldUse: 0.8, healDiscipline: 0.8, movement: 0.7,
};

/** Fresh samples move fast, settled ones slow. */
const ALPHA_FRESH = 0.15;
const ALPHA_SETTLED = 0.05;
const FRESH_SAMPLES = 20;

/** 20 s at 20 TPS. */
const DECAY_TICKS = 400;
const DECAY_FACTOR = 0.9;

/** Convert an observed reaction time in ticks to a 0..1 score. */
export function reactionToScore(ticks: number): number {
	return clamp01(1 - ticks / 20);
}

export class OpponentModel {
	private readonly value: Record<SkillDim, number>;
	private readonly samples: Record<SkillDim, number>;
	private lastContact = -1;

	constructor(initial = 0.5) {
		this.value = {} as Record<SkillDim, number>;
		this.samples = {} as Record<SkillDim, number>;
		for (const d of SKILL_DIMS) {
			this.value[d] = clamp01(initial);
			this.samples[d] = 0;
		}
	}

	observe(dim: SkillDim, observed: number): void {
		const v = clamp01(observed);
		const n = this.samples[dim];
		const alpha = n < FRESH_SAMPLES ? ALPHA_FRESH : ALPHA_SETTLED;
		this.value[dim] = clamp01(this.value[dim] + alpha * (v - this.value[dim]));
		this.samples[dim] = n + 1;
	}

	/** Call every tick; applies decay when contact has lapsed. */
	tick(nowTick: number, inContact: boolean): void {
		if (inContact) {
			this.lastContact = nowTick;
			return;
		}
		if (this.lastContact < 0) return;
		if (nowTick - this.lastContact >= DECAY_TICKS) {
			for (const d of SKILL_DIMS) this.value[d] = clamp01(this.value[d] * DECAY_FACTOR);
			this.lastContact = nowTick;
		}
	}

	confidence(dim?: SkillDim): number {
		if (dim) return Math.min(1, this.samples[dim] / FRESH_SAMPLES);
		let total = 0;
		for (const d of SKILL_DIMS) total += Math.min(1, this.samples[d] / FRESH_SAMPLES);
		return total / SKILL_DIMS.length;
	}

	vector(): Record<SkillDim, number> {
		return { ...this.value };
	}

	/** Confidence-weighted scalar in 0..1. */
	skill(): number {
		let num = 0;
		let den = 0;
		for (const d of SKILL_DIMS) {
			const conf = this.confidence(d);
			num += WEIGHTS[d] * this.value[d] * conf;
			den += WEIGHTS[d];
		}
		return den === 0 ? 0.5 : clamp01(num / den);
	}
}

function clamp01(v: number): number {
	if (!Number.isFinite(v)) return 0;
	return Math.min(1, Math.max(0, v));
}

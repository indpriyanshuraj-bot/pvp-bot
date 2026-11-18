/**
 * L3 — global tactic bandit. Situation-conditioned only; never sees the opponent.
 * Linear epsilon-greedy with an incremental-mean update, hard update quotas and a
 * silent cold start. Pure logic.
 */

export const BANDIT_FEATURES = 10;
export const COLD_START_SAMPLES = 50;

export interface BanditConfig {
	learningRate: number;
	epsilon: number;
	epsilonMin: number;
	epsilonDecay: number;
	maxUpdatesPerMinute: number;
	weightClamp: number;
}

export const DEFAULT_BANDIT: BanditConfig = {
	learningRate: 0.08,
	epsilon: 0.12,
	epsilonMin: 0.02,
	epsilonDecay: 0.0005,
	maxUpdatesPerMinute: 120,
	weightClamp: 3,
};

interface TacticState {
	weights: number[];
	samples: number;
}

export class TacticBandit {
	private readonly tactics = new Map<string, TacticState>();
	private updates = 0;
	private windowStart = 0;
	private windowUpdates = 0;

	constructor(private readonly cfg: BanditConfig = DEFAULT_BANDIT) {}

	private state(tactic: string): TacticState {
		let s = this.tactics.get(tactic);
		if (!s) {
			s = { weights: new Array(BANDIT_FEATURES).fill(0), samples: 0 };
			this.tactics.set(tactic, s);
		}
		return s;
	}

	/** Learned bonus for a tactic. Exactly 0 until cold start is passed. */
	bonus(tactic: string, features: readonly number[]): number {
		const s = this.state(tactic);
		if (s.samples < COLD_START_SAMPLES) return 0;
		return dot(s.weights, features);
	}

	/** Pick a tactic. Returns null when the list is empty. */
	choose(tactics: readonly string[], features: readonly number[]): string | null {
		if (tactics.length === 0) return null;
		if (tactics.length === 1) return tactics[0] as string;

		const eps = Math.max(this.cfg.epsilonMin, this.cfg.epsilon - this.totalSteps() * this.cfg.epsilonDecay);
		if (Math.random() < eps) {
			return tactics[Math.floor(Math.random() * tactics.length)] as string;
		}

		let best = tactics[0] as string;
		let bestScore = -Infinity;
		for (const t of tactics) {
			const sc = this.bonus(t, features);
			if (sc > bestScore) {
				bestScore = sc;
				best = t;
			}
		}
		return best;
	}

	/**
	 * Apply a reward. Returns false when the quota refused the update, so the
	 * caller can count it rather than silently losing data.
	 */
	update(tactic: string, features: readonly number[], reward: number, nowTick: number): boolean {
		if (!this.allowUpdate(nowTick)) return false;
		const s = this.state(tactic);
		const predicted = dot(s.weights, features);
		const err = reward - predicted;
		const norm = 1 + dot(features, features);
		const lr = this.cfg.learningRate / norm;
		for (let i = 0; i < BANDIT_FEATURES; i++) {
			const f = features[i] ?? 0;
			s.weights[i] = clamp((s.weights[i] ?? 0) + lr * err * f, -this.cfg.weightClamp, this.cfg.weightClamp);
		}
		s.samples++;
		this.updates++;
		this.windowUpdates++;
		return true;
	}

	samples(tactic: string): number {
		return this.tactics.get(tactic)?.samples ?? 0;
	}

	totalSteps(): number {
		return this.updates;
	}

	/** Rolling-window quota: at most maxUpdatesPerMinute per 1200 ticks. */
	private allowUpdate(nowTick: number): boolean {
		if (nowTick - this.windowStart >= 1200) {
			this.windowStart = nowTick;
			this.windowUpdates = 0;
		}
		return this.windowUpdates < this.cfg.maxUpdatesPerMinute;
	}
}

function dot(a: readonly number[], b: readonly number[]): number {
	let s = 0;
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) s += (a[i] as number) * (b[i] as number);
	return s;
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

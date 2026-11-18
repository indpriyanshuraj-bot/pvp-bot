/**
 * Watchdog / latency governor. Pure logic: it is fed tick durations and decides
 * how much the bot layer is allowed to do. No engine imports.
 */

export type Tier = 'OK' | 'WARN' | 'DEGRADE' | 'EMERGENCY';

const RANK: Record<Tier, number> = { OK: 0, WARN: 1, DEGRADE: 2, EMERGENCY: 3 };

export interface GovernorConfig {
	/** p95 above this (ms) => WARN */
	warnMs: number;
	/** p95 above this (ms) => DEGRADE */
	degradeMs: number;
	/** p95 above this (ms) => EMERGENCY */
	emergencyMs: number;
	/** must fall below threshold*factor before a tier is lifted */
	recoverFactor: number;
	/** how long it must stay low before lifting (ms) */
	recoverMs: number;
	/** rolling window size in samples */
	window: number;
}

export const DEFAULT_GOVERNOR: GovernorConfig = {
	warnMs: 8,
	degradeMs: 14,
	emergencyMs: 22,
	recoverFactor: 0.6,
	recoverMs: 10_000,
	window: 60,
};

/** How the bot layer scales at each tier. */
export interface Throttle {
	thinkTicks: number;
	botsPerTick: number;
	chat: boolean;
	grind: boolean;
	learn: boolean;
	snapshotRadius: number;
	proFactor: number;
}

export const THROTTLE: Record<Tier, Throttle> = {
	OK: { thinkTicks: 4, botsPerTick: 3, chat: true, grind: true, learn: true, snapshotRadius: 24, proFactor: 1 },
	WARN: { thinkTicks: 8, botsPerTick: 2, chat: true, grind: true, learn: true, snapshotRadius: 24, proFactor: 0.9 },
	DEGRADE: { thinkTicks: 12, botsPerTick: 1, chat: false, grind: false, learn: false, snapshotRadius: 16, proFactor: 0.75 },
	EMERGENCY: { thinkTicks: 20, botsPerTick: 1, chat: false, grind: false, learn: false, snapshotRadius: 10, proFactor: 0.6 },
};

export class Governor {
	private samples: number[] = [];
	private tier: Tier = 'OK';
	private lowSince: number | null = null;
	private emergencyUntil = 0;

	constructor(private readonly cfg: GovernorConfig = DEFAULT_GOVERNOR) {}

	get current(): Tier {
		return this.tier;
	}

	get throttle(): Throttle {
		return THROTTLE[this.tier];
	}

	/** Record one tick-batch duration and return the (possibly new) tier. */
	record(durationMs: number, nowMs: number): Tier {
		if (!Number.isFinite(durationMs) || durationMs < 0) return this.tier;
		this.samples.push(durationMs);
		if (this.samples.length > this.cfg.window) this.samples.shift();

		// A forced emergency holds until its deadline, then normal hysteresis resumes.
		if (nowMs < this.emergencyUntil) {
			this.tier = 'EMERGENCY';
			this.lowSince = null;
			return this.tier;
		}

		const p95 = this.percentile(95);
		const target = this.tierFor(p95);

		if (RANK[target] > RANK[this.tier]) {
			// escalate immediately
			this.tier = target;
			this.lowSince = null;
		} else if (RANK[target] < RANK[this.tier]) {
			// recover slowly: must stay under the lower threshold for recoverMs,
			// and only one step at a time.
			if (this.lowSince === null) {
				this.lowSince = nowMs;
			} else if (nowMs - this.lowSince >= this.cfg.recoverMs) {
				this.tier = stepDown(this.tier);
				// re-arm so the next tier costs exactly one more window
				this.lowSince = nowMs;
			}
		} else {
			this.lowSince = null;
		}
		return this.tier;
	}

	/** Called from the watchdog event: hard throttle for a while. */
	forceEmergency(nowMs: number, holdMs = 30_000): void {
		this.tier = 'EMERGENCY';
		this.emergencyUntil = nowMs + holdMs;
		this.lowSince = null;
		this.samples.length = 0;
	}

	percentile(p: number): number {
		if (this.samples.length === 0) return 0;
		const sorted = [...this.samples].sort((a, b) => a - b);
		const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
		return sorted[idx] as number;
	}

	private tierFor(p95: number): Tier {
		if (p95 > this.cfg.emergencyMs) return 'EMERGENCY';
		if (p95 > this.cfg.degradeMs) return 'DEGRADE';
		if (p95 > this.cfg.warnMs) return 'WARN';
		return 'OK';
	}
}

function stepDown(t: Tier): Tier {
	switch (t) {
		case 'EMERGENCY':
			return 'DEGRADE';
		case 'DEGRADE':
			return 'WARN';
		case 'WARN':
			return 'OK';
		default:
			return 'OK';
	}
}

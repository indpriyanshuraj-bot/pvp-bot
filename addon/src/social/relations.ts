/**
 * Trust model. A small accidental hit is not betrayal; repetition or force is.
 * Pure.
 */

export interface RelationState {
	trust: number;
	hits: number;
	lastHitTick: number;
	lastHealTick: number;
}

const TRUST_MIN = -100;
const TRUST_MAX = 100;

/** damage at or below this counts as an accident, not an attack */
export const ACCIDENT_DAMAGE = 3;
/** a second hit within this many ticks turns an accident into a pattern */
export const PATTERN_WINDOW = 200;

export const HOSTILE_TRUST = -30;
export const FRIENDLY_TRUST = 40;

export class Relations {
	private readonly map = new Map<string, RelationState>();

	private state(id: string): RelationState {
		let s = this.map.get(id);
		if (!s) {
			s = { trust: 0, hits: 0, lastHitTick: -9999, lastHealTick: -9999 };
			this.map.set(id, s);
		}
		return s;
	}

	/** Record damage taken from someone. Returns the new trust. */
	recordHit(id: string, damage: number, tick: number): number {
		const s = this.state(id);
		const repeat = tick - s.lastHitTick <= PATTERN_WINDOW;

		if (damage > ACCIDENT_DAMAGE) {
			s.trust -= 40;
		} else if (!repeat) {
			// a single light bump: barely moves the needle
			s.trust -= 5;
		} else {
			// repeated light hits are a pattern, not an accident
			s.trust -= 25;
		}

		s.hits += 1;
		s.lastHitTick = tick;
		s.trust = clamp(s.trust, TRUST_MIN, TRUST_MAX);
		return s.trust;
	}

	recordHeal(id: string, tick: number): number {
		const s = this.state(id);
		s.lastHealTick = tick;
		s.trust = clamp(s.trust + 20, TRUST_MIN, TRUST_MAX);
		return s.trust;
	}

	recordSharedTarget(id: string): number {
		const s = this.state(id);
		s.trust = clamp(s.trust + 10, TRUST_MIN, TRUST_MAX);
		return s.trust;
	}

	recordTheft(id: string): number {
		const s = this.state(id);
		s.trust = clamp(s.trust - 20, TRUST_MIN, TRUST_MAX);
		return s.trust;
	}

	/** Mark someone as a teammate; trust cannot fall below the friendly floor. */
	setTeammate(id: string): void {
		const s = this.state(id);
		s.trust = Math.max(s.trust, 50);
	}

	trustOf(id: string): number {
		return this.map.get(id)?.trust ?? 0;
	}

	isHostile(id: string): boolean {
		return this.trustOf(id) <= HOSTILE_TRUST;
	}

	isFriendly(id: string): boolean {
		return this.trustOf(id) >= FRIENDLY_TRUST;
	}

	/** Trust drifts back toward neutral while nothing happens. */
	decay(tick: number, everyTicks = 600, amount = 2): void {
		for (const s of this.map.values()) {
			if (tick - Math.max(s.lastHitTick, s.lastHealTick) < everyTicks) continue;
			if (s.trust > 0) s.trust = Math.max(0, s.trust - amount);
			else if (s.trust < 0) s.trust = Math.min(0, s.trust + amount);
		}
	}

	snapshot(): Record<string, RelationState> {
		return Object.fromEntries([...this.map].map(([k, v]) => [k, { ...v }]));
	}
}

// ── betrayal estimate ─────────────────────────────────────────────────────────
export interface BetrayalSignals {
	trust: number;
	/** positive while closing distance */
	closingSpeed: number;
	weaponDrawn: boolean;
	/** they are behind us relative to our facing */
	behind: boolean;
	/** they recently changed target to us */
	switchedToMe: boolean;
}

/**
 * Probability-like score in 0..1. Emits a number, not an action — the planner
 * reacts proportionally rather than instantly attacking a friend.
 */
export function betrayalScore(s: BetrayalSignals): number {
	const z =
		-s.trust / 50 +
		Math.max(0, s.closingSpeed) * 0.8 +
		(s.weaponDrawn ? 0.5 : 0) +
		(s.behind ? 0.6 : 0) +
		(s.switchedToMe ? 0.9 : 0);
	return 1 / (1 + Math.exp(-z));
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

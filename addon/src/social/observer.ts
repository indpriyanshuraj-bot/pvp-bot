/**
 * L2 observer: turns a rolling window of opponent behaviour into the feature
 * vector the archetype classifier expects. Pure.
 */

import type { ArchFeature } from '../learn/archetype.js';

export interface BehaviourSample {
	distance: number;
	shielding: boolean;
	airborne: boolean;
	sprinting: boolean;
	healthFrac: number;
	heldTypeId: string | null;
}

interface Counters {
	attacks: number;
	shieldTicks: number;
	totalTicks: number;
	distanceSum: number;
	distanceSamples: number;
	jumps: number;
	pearls: number;
	crystals: number;
	potions: number;
	elytra: number;
	axeTicks: number;
	minHealthFrac: number;
}

/** 10 seconds at 20 TPS. */
export const DEFAULT_WINDOW = 200;

export class ArchetypeObserver {
	private c: Counters = empty();
	private windowStart = -1;

	constructor(private readonly window = DEFAULT_WINDOW) {}

	private roll(tick: number): void {
		if (this.windowStart < 0) {
			this.windowStart = tick;
			return;
		}
		if (tick - this.windowStart >= this.window) {
			this.c = empty();
			this.windowStart = tick;
		}
	}

	/** Call once per think with the target's current state. */
	observe(tick: number, s: BehaviourSample): void {
		this.roll(tick);
		this.c.totalTicks += 1;
		if (s.shielding) this.c.shieldTicks += 1;
		this.c.distanceSum += s.distance;
		this.c.distanceSamples += 1;
		if (s.airborne) this.c.jumps += 1;
		if (s.heldTypeId?.endsWith('_axe')) this.c.axeTicks += 1;
		this.c.minHealthFrac = Math.min(this.c.minHealthFrac, s.healthFrac);
	}

	recordAttack(): void {
		this.c.attacks += 1;
	}
	recordPearl(): void {
		this.c.pearls += 1;
	}
	recordCrystal(): void {
		this.c.crystals += 1;
	}
	recordPotion(): void {
		this.c.potions += 1;
	}
	recordElytra(): void {
		this.c.elytra += 1;
	}

	features(): Partial<Record<ArchFeature, number>> {
		const c = this.c;
		const ticks = Math.max(1, c.totalTicks);
		const seconds = Math.max(0.05, ticks / 20);
		const dist = c.distanceSamples > 0 ? c.distanceSum / c.distanceSamples : 0;

		return {
			attackRate: c.attacks / seconds,
			shieldTimePct: c.shieldTicks / ticks,
			preferredDistance: dist,
			jumpRate: c.jumps / seconds,
			pearlRate: c.pearls / seconds,
			crystalRate: c.crystals / seconds,
			potionRate: c.potions / seconds,
			retreatHp: c.minHealthFrac * 20,
			elytraUse: c.elytra / seconds,
			axeShare: c.axeTicks / ticks,
		};
	}

	get samples(): number {
		return this.c.totalTicks;
	}

	reset(): void {
		this.c = empty();
		this.windowStart = -1;
	}
}

function empty(): Counters {
	return {
		attacks: 0, shieldTicks: 0, totalTicks: 0, distanceSum: 0, distanceSamples: 0,
		jumps: 0, pearls: 0, crystals: 0, potions: 0, elytra: 0, axeTicks: 0,
		minHealthFrac: 1,
	};
}

/**
 * Food and potion selection. Nutrition comes from the API; only adverse effects
 * need a table. Risk collapses toward zero when starving — but a hard floor stops
 * a bot from eating pufferfish at 3 HP. Pure.
 */

import type { ItemView } from '../types.js';
import FOOD from '../data/food.json';

export type RiskTier = 'none' | 'low' | 'medium' | 'high';

interface FoodRisk {
	effects?: string[];
	risk?: string;
}

const RISK_TABLE = FOOD as unknown as Record<string, FoodRisk>;

const BASE_PENALTY: Record<RiskTier, number> = {
	none: 0,
	low: 3,
	medium: 8,
	high: 20,
};

/** Hard refusals: never take a serious risk when already close to death. */
const HIGH_RISK_MIN_HEALTH = 0.35;
const MEDIUM_RISK_MIN_HEALTH = 0.2;

/** Hunger value added on top of raw nutrition when starving. */
const URGENCY_BONUS = 12;

export interface FoodChoice {
	slot: number;
	typeId: string;
	risk: RiskTier;
	score: number;
	netGain: number;
	penalty: number;
}

export function riskOf(typeId: string): RiskTier {
	const r = RISK_TABLE[typeId]?.risk;
	if (r === 'low' || r === 'medium' || r === 'high') return r;
	return 'none';
}

export function effectsOf(typeId: string): string[] {
	return RISK_TABLE[typeId]?.effects ?? [];
}

/**
 * Pick the best food. Returns null when nothing is worth eating — either nothing
 * edible, or every option is a bad trade at the current health.
 */
export function chooseFood(
	foods: readonly ItemView[],
	hunger: number,
	health: number,
	maxHealth: number,
): FoodChoice | null {
	const healthFrac = health / Math.max(1, maxHealth);
	const desperation = clamp((8 - hunger) / 4, 0, 1);

	let best: FoodChoice | null = null;
	for (const f of foods) {
		if (!f.food) continue;
		const risk = riskOf(f.typeId);

		// hard floors — a starving bot still should not poison itself to death
		if (risk === 'high' && healthFrac < HIGH_RISK_MIN_HEALTH) continue;
		if (risk === 'medium' && healthFrac < MEDIUM_RISK_MIN_HEALTH) continue;

		const netGain = f.food.nutrition + f.food.saturation * 4 + desperation * URGENCY_BONUS;
		const penalty = (BASE_PENALTY[risk] * (1 - desperation * 0.9)) / Math.max(0.2, healthFrac);
		const score = netGain - penalty;

		if (score <= 0) continue;
		if (!best || score > best.score) {
			best = { slot: f.slot, typeId: f.typeId, risk, score, netGain, penalty };
		}
	}
	return best;
}

// ── potions ───────────────────────────────────────────────────────────────────
export type PotionNeed = 'heal' | 'strength' | 'slowfall' | 'fire' | 'waterbreathing';

const POTION_NAMES: Record<PotionNeed, string[]> = {
	heal: ['healing', 'regeneration', 'instant_health'],
	strength: ['strength'],
	slowfall: ['slow_falling'],
	fire: ['fire_resistance'],
	waterbreathing: ['water_breathing'],
};

export function choosePotion(items: readonly ItemView[], need: PotionNeed): ItemView | null {
	const names = POTION_NAMES[need];
	for (const i of items) {
		if (!i.potion) continue;
		if (names.some((n) => i.potion === n || i.potion?.includes(n))) return i;
	}
	return null;
}

/**
 * Milk clears every effect, so only drink it to strip a debuff while no useful
 * effect is active.
 */
const GOOD_EFFECTS = ['strength', 'regeneration', 'speed', 'absorption', 'resistance', 'fire_resistance'];

export function shouldDrinkMilk(effects: readonly string[]): boolean {
	const hasDebuff = effects.some((e) =>
		['poison', 'wither', 'slowness', 'weakness', 'blindness', 'nausea', 'hunger'].some((d) => e.includes(d)),
	);
	if (!hasDebuff) return false;
	const hasGood = effects.some((e) => GOOD_EFFECTS.some((g) => e.includes(g)));
	return !hasGood;
}

function clamp(v: number, lo: number, hi: number): number {
	if (!Number.isFinite(v)) return lo;
	return Math.min(hi, Math.max(lo, v));
}

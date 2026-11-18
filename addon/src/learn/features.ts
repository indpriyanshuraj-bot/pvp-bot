/**
 * Feature vector for the L3 bandit. Situation only — never the opponent's
 * identity — so what it learns transfers between players. Length must equal
 * BANDIT_FEATURES.
 */

import type { BotView, TargetView } from '../types.js';
import { BANDIT_FEATURES } from './bandit.js';

export function combatFeatures(bot: BotView, target: TargetView | null, weaponDamage = 0): number[] {
	const f = new Array<number>(BANDIT_FEATURES).fill(0);
	f[0] = 1; // bias
	f[1] = clamp(bot.health / Math.max(1, bot.maxHealth), 0, 1.5);
	f[2] = target ? clamp(target.health / Math.max(1, target.maxHealth), 0, 1.5) : 1;
	f[3] = target ? clamp(target.distance / 10, 0, 1.5) : 0;
	f[4] = target?.airborne ? 1 : 0;
	f[5] = target?.shielding ? 1 : 0;
	f[6] = 0; // reserved: own shield state, filled by the caller
	f[7] = clamp(weaponDamage / 10, 0, 1.5);
	f[8] = target ? clamp((bot.location.y - target.location.y) / 5, -1, 1) : 0;
	f[9] = 1 - f[1]; // threat
	return f;
}

function clamp(v: number, lo: number, hi: number): number {
	if (!Number.isFinite(v)) return lo;
	return Math.min(hi, Math.max(lo, v));
}

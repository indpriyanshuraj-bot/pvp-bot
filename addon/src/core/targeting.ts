/**
 * Target selection across players and mobs. Pure.
 *
 * v3.0.x only ever targeted players, so a zombie could hit a bot forever without
 * a response. Mobs are now first-class targets, gated by a disposition table so a
 * bot does not go farming cows mid-fight.
 */

import MOBS from '../data/mobs.json';

export type Disposition = 'hostile' | 'neutral' | 'passive';

const HOSTILE = new Set<string>(MOBS.hostile as string[]);
const NEUTRAL = new Set<string>(MOBS.neutral as string[]);

export function dispositionOf(typeId: string): Disposition {
	if (HOSTILE.has(typeId)) return 'hostile';
	if (NEUTRAL.has(typeId)) return 'neutral';
	return 'passive';
}

export type GameModeName = 'Survival' | 'Creative' | 'Adventure' | 'Spectator';

export interface TargetCandidate {
	id: string;
	typeId: string;
	distance: number;
	isPlayer: boolean;
	gameMode: GameModeName;
	health: number;
	maxHealth: number;
	/** it damaged us recently */
	attackingMe: boolean;
}

export interface TargetPolicy {
	maxDistance: number;
	attackPlayers: boolean;
	attackMobs: boolean;
	/** neutral mobs only once provoked */
	attackNeutralWhenProvoked: boolean;
}

export const DEFAULT_TARGET_POLICY: TargetPolicy = {
	maxDistance: 24,
	attackPlayers: true,
	attackMobs: true,
	attackNeutralWhenProvoked: true,
};

const PLAYER_BASE = 100;
const HOSTILE_BASE = 80;
const NEUTRAL_BASE = 70;
const PROVOKED_BONUS = 45;
/** how much distance costs, so the nearest credible threat wins */
const DISTANCE_WEIGHT = 2;

/** 0 means "not a valid target". */
export function scoreCandidate(c: TargetCandidate, policy: TargetPolicy): number {
	if (c.distance > policy.maxDistance) return 0;

	if (c.isPlayer) {
		if (!policy.attackPlayers) return 0;
		// never chase creative or spectator players
		if (c.gameMode !== 'Survival' && c.gameMode !== 'Adventure') return 0;
		return PLAYER_BASE - c.distance * DISTANCE_WEIGHT;
	}

	const disp = dispositionOf(c.typeId);
	if (disp === 'passive') return 0;
	if (disp === 'hostile') {
		if (!policy.attackMobs) return 0;
		const base = HOSTILE_BASE + (c.attackingMe ? PROVOKED_BONUS : 0);
		return base - c.distance * DISTANCE_WEIGHT;
	}
	// neutral
	if (!policy.attackMobs) return 0;
	if (!c.attackingMe) return 0;
	if (!policy.attackNeutralWhenProvoked) return 0;
	return NEUTRAL_BASE + PROVOKED_BONUS - c.distance * DISTANCE_WEIGHT;
}

export function pickTarget(
	candidates: readonly TargetCandidate[],
	policy: TargetPolicy = DEFAULT_TARGET_POLICY,
): TargetCandidate | null {
	let best: TargetCandidate | null = null;
	let bestScore = 0;
	for (const c of candidates) {
		const s = scoreCandidate(c, policy);
		if (s > bestScore) {
			bestScore = s;
			best = c;
		}
	}
	return best;
}

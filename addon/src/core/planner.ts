/**
 * The "top label": scores goals and picks one. Contains no movement, combat or
 * inventory logic — only numbers. Pure logic.
 */

import type { BotView, CapabilitySet, Goal, ScoredGoal, TargetView } from '../types.js';

export interface RelationView {
	trust: number;
	betrayal: number;
}

export interface PlannerInput {
	bot: BotView;
	target: TargetView | null;
	caps: CapabilitySet;
	/** 0..1, from L1 + local threat. */
	threat: number;
	relation: RelationView | null;
	hunger: number;
	grindEnabled: boolean;
	hasHome: boolean;
	nowTick: number;
}

export interface ArbiterResult {
	goal: Goal | null;
	reason: string;
}

/** Hard interrupts. Checked before any scoring, in priority order. */
export function arbiter(i: PlannerInput): ArbiterResult {
	const b = i.bot;
	const hpFrac = b.health / Math.max(1, b.maxHealth);

	if (b.effects.includes('minecraft:lava') || b.effects.includes('lava')) {
		// not a real effect; lava is handled by the survive skill via block state
	}

	if (b.inWater && hpFrac < 0.35) {
		return { goal: 'CLUTCH', reason: 'drowning risk at low health' };
	}
	if (hpFrac <= 0.2) {
		return { goal: 'CLUTCH', reason: 'critical health' };
	}
	if (b.effects.some((e) => e.includes('wither') || e.includes('poison')) && hpFrac < 0.4) {
		return { goal: 'FLEE', reason: 'damage over time at low health' };
	}
	return { goal: null, reason: '' };
}

/** Score every goal. Higher is better. */
export function scoreGoals(i: PlannerInput): ScoredGoal[] {
	const out: ScoredGoal[] = [];
	const b = i.bot;
	const hpFrac = b.health / Math.max(1, b.maxHealth);
	const t = i.target;

	// FIGHT — wants a target, health, and something to hit.
	{
		let s = 0;
		let why = 'no target';
		if (t && t.gameMode === 'Survival') {
			s = 50;
			why = 'target present';
			s += hpFrac * 20;
			if (i.caps.bestWeapon) s += 10;
			if (i.caps.defense.shield) s += 5;
			// a strong opponent makes fighting less attractive
			s -= i.threat * 25;
			if (t.health / Math.max(1, t.maxHealth) < 0.3) {
				s += 20;
				why = 'target is low';
			}
			if (i.relation && i.relation.trust > 40) {
				s = 0;
				why = 'target is trusted';
			}
		}
		out.push({ goal: 'FIGHT', score: Math.max(0, s), reason: why });
	}

	// EAT
	{
		let s = 0;
		const why = `hunger ${Math.round(i.hunger)}`;
		if (i.hunger <= 8) s = 40 + (8 - i.hunger) * 6;
		if (i.caps.food.length === 0) s = 0;
		out.push({ goal: 'EAT', score: s, reason: why });
	}

	// FLEE
	{
		let s = 0;
		let why = 'healthy';
		if (t) {
			s = (1 - hpFrac) * 70 - i.caps.utility.pearl * 1.5;
			why = `hp ${Math.round(hpFrac * 100)}%`;
			if (hpFrac > 0.6) s = Math.max(0, s - 30);
		}
		out.push({ goal: 'FLEE', score: Math.max(0, s), reason: why });
	}

	// GRIND
	{
		let s = 0;
		const why = i.grindEnabled ? 'idle, nothing to fight' : 'grinding disabled';
		if (i.grindEnabled && !t && hpFrac > 0.5 && i.hunger > 6) s = 35;
		out.push({ goal: 'GRIND', score: s, reason: why });
	}

	// FOLLOW — stick with a trusted player
	{
		let s = 0;
		if (i.relation && i.relation.trust > 50) s = 30;
		out.push({ goal: 'FOLLOW', score: s, reason: 'trusted ally nearby' });
	}

	// REGROUP
	{
		let s = 0;
		if (i.hasHome && hpFrac < 0.5 && !t) s = 25;
		out.push({ goal: 'REGROUP', score: s, reason: 'withdraw to base' });
	}

	// IDLE is the floor.
	out.push({ goal: 'IDLE', score: 5, reason: 'default' });

	return out.sort((a, b2) => b2.score - a.score);
}

/**
 * Pick a goal with hysteresis: the incumbent keeps its place unless a challenger
 * beats it by `margin`. Without this the bot flip-flops every tick.
 */
export function chooseGoal(
	i: PlannerInput,
	current: Goal | null,
	margin = 1.15,
): { goal: Goal; scores: ScoredGoal[] } {
	const hard = arbiter(i);
	const scores = scoreGoals(i);
	if (hard.goal) return { goal: hard.goal, scores };

	const top = scores[0] as ScoredGoal;
	if (!current) return { goal: top.goal, scores };

	const incumbent = scores.find((s) => s.goal === current);
	if (!incumbent) return { goal: top.goal, scores };

	if (top.goal !== current && top.score > incumbent.score * margin) {
		return { goal: top.goal, scores };
	}
	return { goal: current, scores };
}

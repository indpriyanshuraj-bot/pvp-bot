/**
 * Grinding: pick a block worth mining, then drive one mining attempt through the
 * break classifier. Pure.
 */

import type { BotView, Vector3Like } from '../types.js';
import { classifyBreak, expectedTicksFor, type BreakVerdict, type GameModeName } from './breakDetect.js';
import BLOCKS from '../data/blocks.json';

export interface BlockRule {
	baseTicks: number;
	requiredTier: number;
	value?: number;
	unbreakable?: boolean;
}

export const BLOCK_TABLE = BLOCKS as unknown as Record<string, BlockRule>;

export interface BlockCandidate {
	typeId: string;
	pos: Vector3Like;
	distance: number;
}

export interface GrindContext {
	bot: BotView;
	candidates: readonly BlockCandidate[];
	bestToolTier: number;
	/** 0..1 */
	threat: number;
	/** session blacklist from the break tracker */
	blocked: (typeId: string, pos: Vector3Like) => boolean;
}

export interface GrindTarget {
	typeId: string;
	pos: Vector3Like;
	score: number;
	expectedTicks: number;
	requiredTier: number;
}

/** Below this hunger the bot cannot sprint, so it should eat before mining. */
export const GRIND_MIN_HUNGER = 6;

export function ruleFor(typeId: string): BlockRule | null {
	return BLOCK_TABLE[typeId] ?? null;
}

/**
 * Score candidates by value per block of travel, damped by danger. Blocks the bot
 * cannot harvest, unbreakables and blacklisted positions are skipped outright.
 */
export function selectBlock(ctx: GrindContext): GrindTarget | null {
	let best: GrindTarget | null = null;
	for (const c of ctx.candidates) {
		const rule = ruleFor(c.typeId);
		if (!rule) continue;
		if (rule.unbreakable) continue;
		if (ctx.bestToolTier < rule.requiredTier) continue;
		if (ctx.blocked(c.typeId, c.pos)) continue;

		const value = rule.value ?? 1;
		if (value <= 0) continue;
		const score = (value * 10) / (1 + Math.max(0, c.distance)) * (1 - ctx.threat * 0.8);
		if (score <= 0) continue;

		const expectedTicks = expectedTicksFor(rule, ctx.bestToolTier);
		if (!best || score > best.score) {
			best = {
				typeId: c.typeId,
				pos: { ...c.pos },
				score,
				expectedTicks,
				requiredTier: rule.requiredTier,
			};
		}
	}
	return best;
}

export interface GrindIntent {
	target: GrindTarget;
	/** true when close enough to swing */
	inRange: boolean;
}

/** Decide whether to grind at all, and at what. */
export function planGrind(ctx: GrindContext): GrindIntent | null {
	// too hungry to work, and no point starving for ore
	if (ctx.bot.hunger < GRIND_MIN_HUNGER) return null;
	// do not mine while something is actively hunting us
	if (ctx.threat > 0.6) return null;

	const target = selectBlock(ctx);
	if (!target) return null;

	const distance = Math.hypot(
		target.pos.x - ctx.bot.location.x,
		target.pos.y - ctx.bot.location.y,
		target.pos.z - ctx.bot.location.z,
	);
	return { target, inRange: distance <= 3 };
}

// ── mining attempt ────────────────────────────────────────────────────────────
export interface MineSession {
	typeId: string;
	pos: Vector3Like;
	startTick: number;
	expectedTicks: number;
	toolTier: number;
	requiredTier: number;
	retried: boolean;
}

export function beginMining(
	typeId: string,
	pos: Vector3Like,
	rule: BlockRule,
	toolTier: number,
	tick: number,
): MineSession {
	return {
		typeId,
		pos: { ...pos },
		startTick: tick,
		expectedTicks: expectedTicksFor(rule, toolTier),
		toolTier,
		requiredTier: rule.requiredTier,
		retried: false,
	};
}

export interface MineObservation {
	same: boolean;
	changed: boolean;
	reappeared: boolean;
	hasFatigue: boolean;
	gameMode: GameModeName;
}

/** Advance one mining attempt and return its verdict. */
export function evaluateMining(
	s: MineSession,
	o: MineObservation,
	tick: number,
): BreakVerdict {
	return classifyBreak({
		blockType: s.typeId,
		elapsedTicks: tick - s.startTick,
		expectedTicks: s.expectedTicks,
		same: o.same,
		changed: o.changed,
		reappeared: o.reappeared,
		hasFatigue: o.hasFatigue,
		gameMode: o.gameMode,
		toolTier: s.toolTier,
		requiredTier: s.requiredTier,
		retriedWithBestTool: s.retried,
	});
}

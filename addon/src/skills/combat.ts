/**
 * Combat planning: tactic selection and per-tick intent. Pure.
 *
 * This is where the three learning levels meet:
 *   base utility (data)  x  L1 skill mod  x  L2 counter mod  x  L3 learned mod
 */

import type { BotView, CapabilitySet, CombatIntent, TargetView } from '../types.js';
import { WEAPONS } from '../core/weapons.js';
import { combineUtility, type ResolvedPro } from '../core/pro.js';
import { planApproach, planFootwork, targetPoint } from './move.js';
import TACTICS from '../data/tactics.json';

interface TacticDef {
	requires?: string[];
	dimension?: string[];
	needsWater?: boolean;
	base: number;
	risk: number;
	cost: string;
	skill: string;
}

const DEFS = TACTICS as unknown as Record<string, TacticDef>;

// ── capability lookup ─────────────────────────────────────────────────────────
export function capValue(caps: CapabilitySet, key: string): number {
	switch (key) {
		case 'sword': return caps.melee.sword;
		case 'axe': return caps.melee.axe;
		case 'mace': return caps.melee.mace;
		case 'spear': return caps.melee.spear;
		case 'trident': return caps.melee.trident;
		case 'bow': return caps.ranged.bow;
		case 'crossbow': return caps.ranged.crossbow;
		case 'arrows': return caps.ranged.arrows;
		case 'shield': return caps.defense.shield ? 1 : 0;
		case 'totem': return caps.defense.totem;
		case 'crystal': return caps.utility.crystal;
		case 'obsidian': return caps.utility.obsidian;
		case 'anchor': return caps.utility.anchor;
		case 'glowstone': return caps.utility.glowstone;
		case 'bed': return caps.utility.bed;
		case 'pearl': return caps.utility.pearl;
		case 'elytra': return caps.utility.elytra ? 1 : 0;
		case 'rockets': return caps.utility.rockets;
		case 'waterBucket': return caps.utility.waterBucket;
		case 'lavaBucket': return caps.utility.lavaBucket;
		default: return 0;
	}
}

/** Evaluate one requirement such as "sword>0", "arrows>=1" or bare "shield". */
export function meetsRequirement(req: string, caps: CapabilitySet): boolean {
	const m = /^([A-Za-z]+)\s*(>=|<=|>|<|=)?\s*(\d+)?$/.exec(req.trim());
	if (!m) return false;
	const key = m[1] as string;
	const op = m[2] ?? '';
	const num = m[3] !== undefined ? Number(m[3]) : 1;
	const v = capValue(caps, key);
	switch (op) {
		case '>': return v > num;
		case '>=': return v >= num;
		case '<': return v < num;
		case '<=': return v <= num;
		case '=': return v === num;
		default: return v > 0;
	}
}

// ── tactic selection ──────────────────────────────────────────────────────────
export interface TacticContext {
	caps: CapabilitySet;
	pro: ResolvedPro;
	dimension: string;
	inWater: boolean;
	isRaining: boolean;
	/** L1: 0 = helpless, 1 = very strong */
	opponentSkill: number;
	/** L2: tactic -> multiplier from the archetype counter table */
	counters: Record<string, number>;
	/** L3: tactic -> learned bonus */
	learned: (tactic: string) => number;
}

export interface TacticScore {
	tactic: string;
	utility: number;
	base: number;
	risk: number;
	affordable: boolean;
}

/**
 * L1 modulation: a strong opponent makes risky tactics a bad idea, a weak one
 * makes them worth taking.
 */
export function skillMod(opponentSkill: number, risk: number): number {
	const s = clamp(opponentSkill, 0, 1);
	return (1 - s) * (1 - risk) - s * risk;
}

export function scoreTactics(ctx: TacticContext): TacticScore[] {
	const out: TacticScore[] = [];
	for (const [tactic, def] of Object.entries(DEFS)) {
		const reqOk = (def.requires ?? []).every((r) => meetsRequirement(r, ctx.caps));
		const dimOk = !def.dimension || def.dimension.includes(ctx.dimension);
		const waterOk = !def.needsWater || ctx.inWater || ctx.isRaining;
		const affordable = reqOk && dimOk && waterOk;

		const l1 = skillMod(ctx.opponentSkill, def.risk);
		const l2 = (ctx.counters[tactic] ?? 1) - 1;
		const l3 = clamp(ctx.learned(tactic), -1, 1);
		const utility = combineUtility(def.base, ctx.pro, l1, l2, l3);

		out.push({ tactic, utility, base: def.base, risk: def.risk, affordable });
	}
	return out.sort((a, b) => b.utility - a.utility);
}

/** Best affordable tactic, or null when nothing is possible. */
export function selectTactic(ctx: TacticContext): string | null {
	for (const s of scoreTactics(ctx)) {
		if (s.affordable) return s.tactic;
	}
	return null;
}

// ── per-tick combat intent ────────────────────────────────────────────────────
export interface CombatContext {
	bot: BotView;
	target: TargetView;
	caps: CapabilitySet;
	pro: ResolvedPro;
	tactic: string;
	nowTick: number;
	lastAttackTick: number;
}

/** Ticks between attacks, derived from clicks-per-second and weapon speed. */
export function attackCooldownTicks(weaponTypeId: string | null, cps: number): number {
	const safeCps = Math.max(0.5, cps);
	const fromCps = Math.round(20 / safeCps);
	const stat = weaponTypeId ? WEAPONS[weaponTypeId] : undefined;
	const weaponMin = stat ? Math.round(20 * 0.625) : 10;
	return Math.max(4, Math.max(fromCps, weaponMin * 0.5));
}

/** A crit needs to be airborne and descending. */
export function canCrit(bot: BotView): boolean {
	return !bot.onGround && bot.velocityY < 0;
}

export function planCombat(ctx: CombatContext): CombatIntent {
	const reach = ctx.caps.bestWeapon?.reach ?? 3;
	const inReach = ctx.target.distance <= reach + 0.35;
	const cd = attackCooldownTicks(ctx.caps.bestWeapon?.typeId ?? null, ctx.pro.cps);
	const ready = ctx.nowTick - ctx.lastAttackTick >= cd;

	const move = inReach
		? planFootwork(
				ctx.bot,
				ctx.target,
				{ reach, aggression: clamp(1 - ctx.target.health / Math.max(1, ctx.target.maxHealth), 0, 1) },
				ctx.nowTick,
			)
		: planApproach(ctx.bot, ctx.target, reach);

	return {
		attack: inReach && ready,
		lookAt: targetPoint(ctx.bot, ctx.target),
		move,
		switchSlot: null,
		useSlot: null,
		shield: ctx.tactic === 'shield_hold',
	};
}

function clamp(v: number, lo: number, hi: number): number {
	if (!Number.isFinite(v)) return lo;
	return Math.min(hi, Math.max(lo, v));
}

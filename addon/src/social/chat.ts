/**
 * Outbound chat. Event-driven, fact-filled from live state, and rate-limited.
 * A bot never claims something it cannot observe. Pure.
 */

import TRIGGERS from '../data/chat-triggers.json';

export interface ChatWhen {
	targetHealthBelow?: number;
	targetHealthAbove?: number;
	myHealthAbove?: number;
	myHealthBelow?: number;
	maxDistance?: number;
	minDistance?: number;
	targetShielding?: boolean;
}

export interface ChatTriggerDef {
	to: 'target' | 'all' | 'team';
	when: ChatWhen;
	templates: string[];
	cooldown: number;
	globalCooldown: number;
	chance: number;
}

export const TRIGGER_TABLE = TRIGGERS as unknown as Record<string, ChatTriggerDef>;

export interface ChatContext {
	targetName: string;
	targetHealth: number;
	targetMaxHealth: number;
	myHealth: number;
	myMaxHealth: number;
	myWeapon: string;
	distance: number;
	targetShielding: boolean;
}

/** Every slot resolves from live state, so a line is true when it is sent. */
export function fillTemplate(template: string, ctx: ChatContext): string {
	const tFrac = ctx.targetHealth / Math.max(1, ctx.targetMaxHealth);
	const values: Record<string, string> = {
		target: ctx.targetName,
		targetHealth: String(Math.max(0, Math.round(ctx.targetHealth))),
		targetHealthPct: String(Math.round(tFrac * 100)),
		myHealth: String(Math.max(0, Math.round(ctx.myHealth))),
		myWeapon: ctx.myWeapon.replace('minecraft:', '').replace(/_/g, ' '),
		distance: String(Math.round(ctx.distance)),
	};
	return template.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);
}

export function evaluateWhen(w: ChatWhen, ctx: ChatContext): boolean {
	const tFrac = ctx.targetHealth / Math.max(1, ctx.targetMaxHealth);
	const mFrac = ctx.myHealth / Math.max(1, ctx.myMaxHealth);

	if (w.targetHealthBelow !== undefined && !(tFrac < w.targetHealthBelow)) return false;
	if (w.targetHealthAbove !== undefined && !(tFrac > w.targetHealthAbove)) return false;
	if (w.myHealthAbove !== undefined && !(mFrac > w.myHealthAbove)) return false;
	if (w.myHealthBelow !== undefined && !(mFrac < w.myHealthBelow)) return false;
	if (w.maxDistance !== undefined && !(ctx.distance <= w.maxDistance)) return false;
	if (w.minDistance !== undefined && !(ctx.distance >= w.minDistance)) return false;
	if (w.targetShielding !== undefined && ctx.targetShielding !== w.targetShielding) return false;
	return true;
}

export interface ChatLine {
	text: string;
	delayTicks: number;
}

export class ChatPolicy {
	private readonly lastById = new Map<string, number>();
	private readonly lastByTarget = new Map<string, number>();
	private lastGlobal = -99999;

	constructor(
		private readonly triggers: Record<string, ChatTriggerDef> = TRIGGER_TABLE,
		private readonly random: () => number = Math.random,
	) {}

	/** Returns a line to send, or null. Never throws on missing data. */
	maybeSay(id: string, ctx: ChatContext, nowTick: number): ChatLine | null {
		const def = this.triggers[id];
		if (!def) return null;
		if (!evaluateWhen(def.when, ctx)) return null;

		const last = this.lastById.get(id) ?? -99999;
		if (nowTick - last < def.cooldown) return null;
		if (nowTick - this.lastGlobal < def.globalCooldown) return null;

		const key = id + '|' + ctx.targetName;
		const lastTarget = this.lastByTarget.get(key) ?? -99999;
		if (nowTick - lastTarget < def.cooldown) return null;

		if (this.random() > def.chance) return null;

		const template = def.templates[Math.floor(this.random() * def.templates.length)];
		if (!template) return null;
		const text = fillTemplate(template, ctx);

		this.lastById.set(id, nowTick);
		this.lastByTarget.set(key, nowTick);
		this.lastGlobal = nowTick;

		// humans do not answer in the same frame
		const base = 20 + text.length * 2;
		const jitter = 0.7 + this.random() * 0.6;
		return { text, delayTicks: Math.round(base * jitter) };
	}

	/** Try every trigger in order; returns the first that fires. */
	maybeSayAny(ctx: ChatContext, nowTick: number): ChatLine | null {
		for (const id of Object.keys(this.triggers)) {
			const line = this.maybeSay(id, ctx, nowTick);
			if (line) return line;
		}
		return null;
	}
}

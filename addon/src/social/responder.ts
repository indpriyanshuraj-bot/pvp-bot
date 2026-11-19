/**
 * Replies to inbound chat. Separate from ChatPolicy (which handles outbound
 * event triggers) because the rate limits and the failure modes differ: an
 * outbound taunt is optional, a reply to a direct question is not.
 *
 * Pure. Silence is the default — a bot that answers everything is the tell.
 */

export interface ReplyContext {
	speaker: string;
	/** intent name from social/nlp classify() */
	intent: string;
	coords?: { x: number; y: number; z: number };
	health?: number;
}

export interface Reply {
	text: string;
	delayTicks: number;
}

interface ReplyRule {
	chance: number;
	templates: string[];
}

const RULES: Record<string, ReplyRule> = {
	challenge: { chance: 0.8, templates: ['sure {speaker}, come find me', 'ok {speaker}'] },
	greet: { chance: 0.7, templates: ['yo {speaker}', 'hey'] },
	insult: { chance: 0.35, templates: ['ok', '{speaker}, less talking'] },
	ask_where: { chance: 0.9, templates: ['I am at {coords}'] },
	ask_help: { chance: 0.5, templates: ['ask an admin, I am just a bot'] },
	trade: { chance: 0.4, templates: ['not trading right now'] },
};

/** Per-speaker and global limits, in ticks. */
export const SPEAKER_COOLDOWN = 600;
export const GLOBAL_COOLDOWN = 200;

export function fillReply(template: string, ctx: ReplyContext): string {
	const values: Record<string, string> = {
		speaker: ctx.speaker,
		coords: ctx.coords
			? `${Math.round(ctx.coords.x)} ${Math.round(ctx.coords.y)} ${Math.round(ctx.coords.z)}`
			: 'here',
		health: ctx.health !== undefined ? String(Math.round(ctx.health)) : '?',
	};
	return template.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);
}

export class ReplyPolicy {
	private readonly lastBySpeaker = new Map<string, number>();
	private lastGlobal = -99999;

	constructor(private readonly random: () => number = Math.random) {}

	maybeReply(ctx: ReplyContext, nowTick: number): Reply | null {
		const rule = RULES[ctx.intent];
		if (!rule) return null;

		if (nowTick - (this.lastBySpeaker.get(ctx.speaker) ?? -99999) < SPEAKER_COOLDOWN) return null;
		if (nowTick - this.lastGlobal < GLOBAL_COOLDOWN) return null;
		if (this.random() > rule.chance) return null;

		const template = rule.templates[Math.floor(this.random() * rule.templates.length)];
		if (!template) return null;

		const text = fillReply(template, ctx);
		this.lastBySpeaker.set(ctx.speaker, nowTick);
		this.lastGlobal = nowTick;

		// a little longer than an outbound taunt: we "read" the message first
		return { text, delayTicks: Math.round((25 + text.length * 2) * (0.8 + this.random() * 0.5)) };
	}
}

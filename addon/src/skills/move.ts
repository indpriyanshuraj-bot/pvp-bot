/**
 * Movement intent planning. Pure: produces what the bot wants its body to do,
 * never touches the engine. Execution lives in engine/registry.
 */

import type { BotView, MoveIntent, TargetView, Vector3Like } from '../types.js';

export type MoveMode = 'approach' | 'footwork' | 'flee' | 'hold';

export interface FootworkOptions {
	/** distance the bot wants to sit at */
	reach: number;
	/** how many ticks to hold a strafe direction before flipping */
	strafePeriod?: number;
	/** 0..1; higher means commit harder */
	aggression?: number;
}

/** Close the gap, then stop at weapon reach. */
export function planApproach(bot: BotView, target: TargetView, reach: number): MoveIntent {
	const desired = reach * 0.9;
	const gap = target.distance - desired;
	// full forward beyond 2 blocks out, ease in near the edge
	const forward = clamp(gap / 2, -1, 1);
	return {
		forward,
		strafe: 0,
		jump: shouldJumpFor(bot, target, gap),
		lookAt: targetPoint(bot, target),
	};
}

/**
 * Fight at range: orbit the target while holding distance. Strafe direction
 * flips on a period derived from the bot id so two bots do not mirror each other.
 */
export function planFootwork(
	bot: BotView,
	target: TargetView,
	opts: FootworkOptions,
	nowTick: number,
): MoveIntent {
	const period = opts.strafePeriod ?? 24;
	const seed = hash(bot.id);
	const flip = Math.floor((nowTick + seed) / period) % 2 === 0 ? 1 : -1;
	const aggression = opts.aggression ?? 0.5;

	const desired = opts.reach * 0.9;
	const gap = target.distance - desired;
	// hug the ideal range: creep in when far, back off when inside reach
	const forward = clamp(gap / 1.5, -0.8, 0.8) * (0.6 + aggression * 0.4);

	return {
		forward,
		strafe: flip * (0.5 + aggression * 0.5),
		jump: shouldJumpFor(bot, target, gap),
		lookAt: targetPoint(bot, target),
	};
}

/** Run away from a point, with a lateral component so it is not a straight line. */
export function planFlee(bot: BotView, threat: Vector3Like, nowTick: number): MoveIntent {
	const dx = bot.location.x - threat.x;
	const dz = bot.location.z - threat.z;
	const len = Math.hypot(dx, dz) || 1;
	const away = { x: dx / len, z: dz / len };

	// convert a world direction into body-relative forward/strafe
	const yaw = Math.atan2(bot.view.x, bot.view.z);
	const cos = Math.cos(yaw);
	const sin = Math.sin(yaw);
	const forward = away.x * sin + away.z * cos;
	const strafe = away.x * cos - away.z * sin;
	const wobble = Math.sin(nowTick / 20) * 0.35;

	return {
		forward: clamp(forward, -1, 1),
		strafe: clamp(strafe + wobble, -1, 1),
		jump: false,
		lookAt: null,
	};
}

/** Stay put but keep facing the target. */
export function planHold(bot: BotView, target: TargetView | null): MoveIntent {
	return {
		forward: 0,
		strafe: 0,
		jump: false,
		lookAt: target ? targetPoint(bot, target) : null,
	};
}

/** Jump to set up a crit, or to escape a chase that is too close. */
function shouldJumpFor(bot: BotView, target: TargetView, gap: number): boolean {
	if (!bot.onGround) return false;
	// jump when the target is airborne and we are at fighting distance (crit setup)
	if (target.airborne && Math.abs(gap) < 1.5) return true;
	// jump to close a small vertical gap
	return false;
}

/** Aim at the target's torso, not its feet. */
export function targetPoint(bot: BotView, target: TargetView): Vector3Like {
	void bot;
	return {
		x: target.location.x,
		y: target.location.y + 1.1,
		z: target.location.z,
	};
}

/**
 * Stuck detection: if the bot has not moved meaningfully over a window while it
 * was trying to, it is stuck and should jump or reroute.
 */
export class StuckDetector {
	private last = new Map<string, { pos: Vector3Like; tick: number }>();

	constructor(
		private readonly windowTicks = 20,
		private readonly minMove = 0.8,
	) {}

	/** Returns true when the bot has been trying to move but has not. */
	sample(id: string, pos: Vector3Like, tick: number, trying: boolean): boolean {
		const prev = this.last.get(id);
		if (!prev) {
			this.last.set(id, { pos: { ...pos }, tick });
			return false;
		}
		if (tick - prev.tick < this.windowTicks) return false;

		const moved = Math.hypot(pos.x - prev.pos.x, pos.z - prev.pos.z);
		this.last.set(id, { pos: { ...pos }, tick });
		return trying && moved < this.minMove;
	}

	forget(id: string): void {
		this.last.delete(id);
	}
}

function hash(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
	return Math.abs(h) % 1000;
}

function clamp(v: number, lo: number, hi: number): number {
	if (!Number.isFinite(v)) return 0;
	return Math.min(hi, Math.max(lo, v));
}

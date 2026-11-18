/**
 * The control layer. The ONLY module allowed to call SimulatedPlayer movement
 * and action methods. Skills express intent; this translates and rate-limits.
 */

import { system, type Entity, type Vector3 } from '@minecraft/server';
import type { SimulatedPlayer } from '@minecraft/server-gametest';

export interface InputOptions {
	/** engine calls allowed per tick per bot */
	budget: number;
	/** degrees per tick the bot may turn */
	turnRate: number;
}

const DEFAULTS: InputOptions = { budget: 40, turnRate: 30 };

export class Input {
	private tick = -1;
	private calls = 0;
	private lastAttackTick = -100;
	private failures = 0;

	constructor(
		private readonly bot: SimulatedPlayer,
		private readonly opts: InputOptions = DEFAULTS,
	) {}

	get errorCount(): number {
		return this.failures;
	}

	private allow(): boolean {
		const t = system.currentTick;
		if (t !== this.tick) {
			this.tick = t;
			this.calls = 0;
		}
		if (this.calls >= this.opts.budget) return false;
		this.calls++;
		return true;
	}

	private guard(fn: () => void): boolean {
		if (!this.bot.isValid) return false;
		if (!this.allow()) return false;
		try {
			fn();
			return true;
		} catch {
			this.failures++;
			return false;
		}
	}

	// ── movement ──────────────────────────────────────────────────────────────
	move(forward: number, strafe = 0): boolean {
		const f = clamp(fwd(forward), -1, 1);
		const s = clamp(fwd(strafe), -1, 1);
		if (f === 0 && s === 0) return this.guard(() => this.bot.moveRelative(0, 0, 0));
		return this.guard(() => this.bot.moveRelative(s, 0, f));
	}

	stop(): boolean {
		return this.guard(() => this.bot.stopMoving());
	}

	jump(): boolean {
		if (!this.bot.isOnGround) return false;
		return this.guard(() => this.bot.jump());
	}

	swim(on: boolean): boolean {
		return this.guard(() => (on ? this.bot.swim() : this.bot.stopSwimming()));
	}

	glide(on: boolean): boolean {
		return this.guard(() => (on ? this.bot.glide() : this.bot.stopGliding()));
	}

	// ── looking ───────────────────────────────────────────────────────────────
	/** Turn toward a point, capped at turnRate degrees per tick. */
	lookAt(target: Vector3): boolean {
		if (!this.bot.isValid) return false;
		const eye = this.bot.getHeadLocation();
		const dx = target.x - eye.x;
		const dy = target.y - eye.y;
		const dz = target.z - eye.z;
		const flat = Math.hypot(dx, dz);
		const wantPitch = (-Math.atan2(dy, flat) * 180) / Math.PI;
		const wantYaw = (Math.atan2(-dx, dz) * 180) / Math.PI;

		const cur = this.bot.getRotation();
		const yaw = approachAngle(cur.y, wantYaw, this.opts.turnRate);
		const pitch = clamp(approachAngle(cur.x, wantPitch, this.opts.turnRate), -90, 90);
		return this.guard(() => this.bot.setRotation({ x: pitch, y: yaw }));
	}

	// ── combat ────────────────────────────────────────────────────────────────
	/** Attack a specific entity, gated by a minimum tick gap. */
	attack(target: Entity, cooldownTicks: number): boolean {
		const t = system.currentTick;
		if (t - this.lastAttackTick < cooldownTicks) return false;
		const ok = this.guard(() => {
			this.bot.attackEntity(target);
		});
		if (ok) this.lastAttackTick = t;
		return ok;
	}

	// ── items ─────────────────────────────────────────────────────────────────
	select(slot: number): boolean {
		return this.guard(() => {
			this.bot.selectedSlotIndex = slot;
		});
	}

	/** Use the currently selected item (eat, drink, place). */
	use(): boolean {
		return this.guard(() => this.bot.useItemInSlot(this.bot.selectedSlotIndex));
	}

	useSlot(slot: number): boolean {
		return this.guard(() => this.bot.useItemInSlot(slot));
	}

	// ── social ────────────────────────────────────────────────────────────────
	say(message: string): boolean {
		return this.guard(() => this.bot.chat(message));
	}

	disconnect(): void {
		try {
			this.bot.disconnect();
		} catch {
			/* already gone */
		}
	}
}

function fwd(v: number): number {
	return Number.isFinite(v) ? v : 0;
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, v));
}

/** Shortest-path angle approach, handling the ±180 wrap. */
export function approachAngle(current: number, want: number, maxStep: number): number {
	let delta = ((want - current + 540) % 360) - 180;
	if (delta > maxStep) delta = maxStep;
	if (delta < -maxStep) delta = -maxStep;
	return current + delta;
}

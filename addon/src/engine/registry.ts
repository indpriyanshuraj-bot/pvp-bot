/**
 * Bot registry and the tick loop. Owns the governor, schedules bots round-robin,
 * and drives goal -> minimal execution. Deliberately thin: all judgement lives in
 * the pure planner.
 */

import { system, type Entity } from '@minecraft/server';
import type { SimulatedPlayer } from '@minecraft/server-gametest';
import { Governor } from '../core/governor.js';
import { chooseGoal, type PlannerInput } from '../core/planner.js';
import { deriveCapabilities } from '../core/capabilities.js';
import { DEFAULT_PRO, resolvePro, type ProSettings } from '../core/pro.js';
import { OpponentModel } from '../learn/opponent.js';
import { Input } from './input.js';
import { snapshotBot, snapshotTarget } from './snapshot.js';
import type { Goal, TargetView } from '../types.js';

export const BOT_TAG = 'pvpb';

export interface BotState {
	entity: SimulatedPlayer;
	input: Input;
	goal: Goal | null;
	pro: ProSettings;
	lastThink: number;
	opponent: OpponentModel;
	profileName: string;
}

class Registry {
	private readonly bots = new Map<string, BotState>();
	readonly governor = new Governor();
	private cursor = 0;
	private started = false;

	add(entity: SimulatedPlayer, pro: ProSettings = DEFAULT_PRO, profileName = 'normal'): void {
		entity.addTag(BOT_TAG);
		this.bots.set(entity.id, {
			entity,
			input: new Input(entity),
			goal: null,
			pro,
			lastThink: -999,
			opponent: new OpponentModel(),
			profileName,
		});
	}

	remove(id: string): boolean {
		return this.bots.delete(id);
	}

	get(id: string): BotState | undefined {
		return this.bots.get(id);
	}

	all(): BotState[] {
		return [...this.bots.values()];
	}

	get count(): number {
		return this.bots.size;
	}

	start(): void {
		if (this.started) return;
		this.started = true;
		system.runInterval(() => this.tick(), 1);
	}

	private tick(): void {
		const t0 = Date.now();
		try {
			const throttle = this.governor.throttle;
			const list = this.all().filter((b) => b.entity.isValid);
			if (list.length === 0) return;

			const due = list.filter((b) => system.currentTick - b.lastThink >= throttle.thinkTicks);
			if (due.length > 0) {
				// round-robin so a long list does not all think in the same tick
				for (let i = 0; i < Math.min(throttle.botsPerTick, due.length); i++) {
					const b = due[(this.cursor + i) % due.length];
					if (b) this.think(b);
				}
				this.cursor = (this.cursor + throttle.botsPerTick) % Math.max(1, due.length);
			}

			// executing is cheap and must happen every tick for responsiveness
			for (const b of list) this.act(b);
		} finally {
			this.governor.record(Date.now() - t0, Date.now());
		}
	}

	private think(b: BotState): void {
		b.lastThink = system.currentTick;
		const view = snapshotBot(b.entity);
		const caps = deriveCapabilities(view.items);
		const targetEntity = this.findTarget(b);
		const target = targetEntity ? snapshotTarget(targetEntity) : null;
		if (target && targetEntity) {
			target.distance = distance(view.location, targetEntity.location);
		}

		const input: PlannerInput = {
			bot: view,
			target,
			caps,
			threat: target ? 1 - view.health / Math.max(1, view.maxHealth) : 0,
			relation: null,
			hunger: view.hunger,
			grindEnabled: this.governor.throttle.grind,
			hasHome: false,
			nowTick: system.currentTick,
		};

		const { goal } = chooseGoal(input, b.goal);
		b.goal = goal;
	}

	private act(b: BotState): void {
		if (!b.entity.isValid) return;
		switch (b.goal) {
			case 'FIGHT': {
				const t = this.findTarget(b);
				if (!t) {
					b.input.stop();
					return;
				}
				b.input.lookAt(t.location);
				const d = distance(b.entity.location, t.location);
				if (d > 3.2) {
					b.input.move(1);
				} else {
					b.input.stop();
					b.input.attack(t, 12);
				}
				return;
			}
			case 'EAT': {
				const foodSlot = this.findFoodSlot(b);
				if (foodSlot >= 0) {
					b.input.select(foodSlot);
					b.input.use();
				} else {
					b.input.stop();
				}
				return;
			}
			default:
				b.input.stop();
		}
	}

	private findFoodSlot(b: BotState): number {
		try {
			const inv = b.entity.getComponent('minecraft:inventory');
			const container = inv?.container;
			if (!container) return -1;
			for (let i = 0; i < container.size; i++) {
				const stack = container.getItem(i);
				if (!stack) continue;
				try {
					if (stack.getComponent('minecraft:food')) return i;
				} catch {
					/* not food */
				}
			}
		} catch {
			/* no inventory */
		}
		return -1;
	}

	private findTarget(b: BotState): Entity | undefined {
		try {
			const radius = this.governor.throttle.snapshotRadius;
			const found = b.entity.dimension.getEntities({
				location: b.entity.location,
				maxDistance: radius,
			});
			let best: Entity | undefined;
			let bestD = Infinity;
			for (const e of found) {
				if (!e.isValid || e.id === b.entity.id) continue;
				if (e.hasTag(BOT_TAG)) continue;
				if (e.typeId !== 'minecraft:player') continue;
				const d = distance(b.entity.location, e.location);
				if (d < bestD) {
					bestD = d;
					best = e;
				}
			}
			return best;
		} catch {
			return undefined;
		}
	}

	/** Drop bots that have disconnected or died without cleanup. */
	prune(): number {
		let removed = 0;
		for (const [id, b] of this.bots) {
			if (!b.entity.isValid) {
				this.bots.delete(id);
				removed++;
			}
		}
		return removed;
	}
}

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export const registry = new Registry();

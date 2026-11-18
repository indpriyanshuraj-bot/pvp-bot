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
import { TacticBandit } from '../learn/bandit.js';
import { classifyArchetype, counterWeights, type Distribution } from '../learn/archetype.js';
import { combatFeatures } from '../learn/features.js';
import { selectTactic, planCombat, type TacticContext } from '../skills/combat.js';
import { planFlee, planHold, StuckDetector } from '../skills/move.js';
import { planSurvival } from '../skills/survive.js';
import { chooseFood } from '../skills/consume.js';
import { Input } from './input.js';
import { snapshotBot, snapshotTarget } from './snapshot.js';
import ARCHETYPE from '../data/archetypes.json';
import type { CombatIntent, Goal, MoveIntent } from '../types.js';

export const BOT_TAG = 'pvpb';

export interface BotState {
	entity: SimulatedPlayer;
	input: Input;
	goal: Goal | null;
	pro: ProSettings;
	lastThink: number;
	opponent: OpponentModel;
	archetype: Distribution;
	tactic: string | null;
	lastAttackTick: number;
	profileName: string;
}

class Registry {
	private readonly bots = new Map<string, BotState>();
	readonly governor = new Governor();
	private cursor = 0;
	private started = false;
	private readonly bandit = new TacticBandit();
	private readonly stuck = new StuckDetector();

	add(entity: SimulatedPlayer, pro: ProSettings = DEFAULT_PRO, profileName = 'normal'): void {
		entity.addTag(BOT_TAG);
		this.bots.set(entity.id, {
			entity,
			input: new Input(entity),
			goal: null,
			pro,
			lastThink: -999,
			opponent: new OpponentModel(),
			archetype: {},
			tactic: null,
			lastAttackTick: -100,
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
		if (target && targetEntity) target.distance = distance(view.location, targetEntity.location);

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

		// Pick a tactic only when there is something to fight.
		if (goal === 'FIGHT' && target) {
			const pro = resolvePro(b.pro, this.governor.throttle.proFactor);
			const features = combatFeatures(view, target, caps.bestWeapon?.damage ?? 0);
			const ctx: TacticContext = {
				caps,
				pro,
				dimension: view.location ? this.dimensionName(b) : 'overworld',
				inWater: view.inWater,
				isRaining: false,
				opponentSkill: b.opponent.skill(),
				counters: counterWeights(b.archetype, ARCHETYPE.counters as unknown as Record<string, Record<string, number>>),
				learned: (t) => (this.governor.throttle.learn ? this.bandit.bonus(t, features) : 0),
			};
			b.tactic = selectTactic(ctx);
		} else {
			b.tactic = null;
		}
	}

	private dimensionName(b: BotState): string {
		try {
			const id = b.entity.dimension.id.replace('minecraft:', '');
			return id;
		} catch {
			return 'overworld';
		}
	}

	private act(b: BotState): void {
		if (!b.entity.isValid) return;
		const throttle = this.governor.throttle;

		if (b.goal === 'FIGHT') {
			const t = this.findTarget(b);
			if (!t) {
				b.input.stop();
				return;
			}
			const view = snapshotBot(b.entity);
			const target = snapshotTarget(t);
			target.distance = distance(view.location, t.location);
			const caps = deriveCapabilities(view.items);
			const pro = resolvePro(b.pro, throttle.proFactor);
			const intent = planCombat({
				bot: view,
				target,
				caps,
				pro,
				tactic: b.tactic ?? 'sword_trade',
				nowTick: system.currentTick,
				lastAttackTick: b.lastAttackTick,
			});
			this.applyCombat(b, intent, t);
			return;
		}

		if (b.goal === 'CLUTCH' || b.goal === 'FLEE') {
			const view = snapshotBot(b.entity);
			const caps = deriveCapabilities(view.items);
			const survival = planSurvival(view, caps);
			if (survival) {
				this.applySurvival(b, view, survival);
				return;
			}
			const t = this.findTarget(b);
			if (t) {
				this.applyMove(b, planFlee(view, t.location, system.currentTick));
			} else {
				b.input.stop();
			}
			return;
		}

		if (b.goal === 'EAT') {
			const view = snapshotBot(b.entity);
			const choice = chooseFood(view.items, view.hunger, view.health, view.maxHealth);
			if (choice) {
				b.input.select(choice.slot);
				b.input.use();
			} else {
				b.input.stop();
			}
			return;
		}

		const t = this.findTarget(b);
		if (t) {
			const view = snapshotBot(b.entity);
			const target = snapshotTarget(t);
			target.distance = distance(view.location, t.location);
			this.applyMove(b, planHold(view, target));
		} else {
			b.input.stop();
		}
	}

	private applySurvival(
		b: BotState,
		view: { location: { x: number; y: number; z: number } },
		intent: { action: string; slot: number | null; lookDown: boolean },
	): void {
		switch (intent.action) {
			case 'water_clutch':
			case 'extinguish': {
				// look at our feet so the bucket lands where we are
				b.input.lookAt({ x: view.location.x, y: view.location.y - 2, z: view.location.z });
				if (intent.slot !== null) b.input.select(intent.slot);
				b.input.use();
				return;
			}
			case 'ascend': {
				b.input.lookAt({ x: view.location.x, y: view.location.y + 8, z: view.location.z });
				b.input.move(1);
				b.input.jump();
				return;
			}
			case 'eat':
			case 'pearl_away': {
				if (intent.slot !== null) b.input.select(intent.slot);
				b.input.use();
				return;
			}
			default:
				b.input.stop();
		}
	}

	private applyMove(b: BotState, intent: MoveIntent): void {
		if (intent.lookAt) b.input.lookAt(intent.lookAt);
		b.input.move(intent.forward, intent.strafe);
		if (intent.jump) b.input.jump();
	}

	private applyCombat(b: BotState, intent: CombatIntent, target: { location: { x: number; y: number; z: number } }): void {
		void target;
		if (intent.lookAt) b.input.lookAt(intent.lookAt);
		if (intent.move) {
			b.input.move(intent.move.forward, intent.move.strafe);
			if (intent.move.jump) b.input.jump();
		}
		if (intent.switchSlot !== null) b.input.select(intent.switchSlot);
		if (intent.useSlot !== null) {
			b.input.select(intent.useSlot);
			b.input.use();
		}
		if (intent.attack) {
			const t = this.findTarget(b);
			if (t && b.input.attack(t, 0)) b.lastAttackTick = system.currentTick;
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

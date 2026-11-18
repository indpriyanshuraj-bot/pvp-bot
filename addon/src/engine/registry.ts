/**
 * Bot registry and the tick loop. Owns the governor, schedules bots round-robin,
 * and drives goal -> minimal execution. Deliberately thin: all judgement lives in
 * the pure planner.
 */

import { system, world, type Entity } from '@minecraft/server';
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
import {
	planGrind, beginMining, evaluateMining, ruleFor, BLOCK_TABLE,
	type BlockCandidate, type MineSession,
} from '../skills/grind.js';
import { BreakTracker } from '../skills/breakDetect.js';
import { planHotbar } from '../skills/inventory.js';
import { ArchetypeObserver } from '../social/observer.js';
import { Relations } from '../social/relations.js';
import { ChatPolicy } from '../social/chat.js';
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
	mine: MineSession | null;
	readonly observer: ArchetypeObserver;
	readonly breakTracker: BreakTracker;
	lastHotbar: number;
	profileName: string;
}

class Registry {
	private readonly bots = new Map<string, BotState>();
	readonly governor = new Governor();
	private cursor = 0;
	private started = false;
	private readonly bandit = new TacticBandit();
	private readonly stuck = new StuckDetector();
	private readonly relations = new Relations();
	private readonly chat = new ChatPolicy();
	private subscribed = false;

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
			mine: null,
			observer: new ArchetypeObserver(),
			breakTracker: new BreakTracker(),
			lastHotbar: -999,
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
		this.subscribeRelations();
		system.runInterval(() => this.tick(), 1);
	}

	/** Track who hits our bots, so trust reflects what actually happened. */
	private subscribeRelations(): void {
		if (this.subscribed) return;
		this.subscribed = true;
		try {
			world.afterEvents.entityHurt.subscribe((ev) => {
				const victim = ev.hurtEntity;
				const attacker = ev.damageSource?.damagingEntity;
				if (!victim || !attacker) return;
				if (!this.bots.has(victim.id)) return;
				if (this.bots.has(attacker.id)) return; // bot-on-bot is training, not betrayal
				this.relations.recordHit(attacker.id, ev.damage ?? 0, system.currentTick);
				this.relations.decay(system.currentTick);
			});
		} catch {
			/* event unavailable */
		}
	}

	get relationsView(): Relations {
		return this.relations;
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

		// feed the L2 observer from the target's live behaviour
		if (target) {
			b.observer.observe(system.currentTick, {
				distance: target.distance,
				shielding: target.shielding,
				airborne: target.airborne,
				sprinting: target.sprinting,
				healthFrac: target.health / Math.max(1, target.maxHealth),
				heldTypeId: target.heldTypeId,
			});
			if (b.observer.samples >= 20) {
				b.archetype = classifyArchetype(b.observer.features(), ARCHETYPE.centroids);
			}
		}

		const input: PlannerInput = {
			bot: view,
			target,
			caps,
			threat: target ? 1 - view.health / Math.max(1, view.maxHealth) : 0,
			relation: target ? { trust: this.relations.trustOf(target.id), betrayal: 0 } : null,
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

			if (throttle.chat) this.tryChat(b, view, target);
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

		if (b.goal === 'GRIND') {
			this.grind(b);
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

	// ── grinding ──────────────────────────────────────────────────────────────
	private grind(b: BotState): void {
		const view = snapshotBot(b.entity);
		const caps = deriveCapabilities(view.items);

		// keep the hotbar tidy when idle
		if (system.currentTick - b.lastHotbar > 40) {
			b.lastHotbar = system.currentTick;
			this.applyHotbar(b);
		}

		// finish an in-flight attempt first
		if (b.mine) {
			this.pollMining(b);
			return;
		}

		const candidates = this.scanBlocks(b);
		const intent = planGrind({
			bot: view,
			candidates,
			bestToolTier: caps.bestToolTier,
			threat: 0,
			blocked: (typeId, pos) => b.breakTracker.isBlocked(typeId, pos),
		});
		if (!intent) {
			b.input.stop();
			return;
		}

		if (!intent.inRange) {
			// walk toward the block
			const dx = intent.target.pos.x + 0.5 - view.location.x;
			const dz = intent.target.pos.z + 0.5 - view.location.z;
			const yaw = Math.atan2(view.view.x, view.view.z);
			const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
			const strafe = dx * Math.cos(yaw) - dz * Math.sin(yaw);
			const len = Math.hypot(forward, strafe) || 1;
			b.input.move(forward / len, strafe / len);
			return;
		}

		const rule = ruleFor(intent.target.typeId);
		if (!rule) return;
		b.mine = beginMining(
			intent.target.typeId,
			intent.target.pos,
			rule,
			caps.bestToolTier,
			system.currentTick,
		);
		try {
			b.entity.breakBlock(intent.target.pos);
		} catch {
			b.mine = null;
		}
	}

	private pollMining(b: BotState): void {
		const s = b.mine;
		if (!s) return;
		let block: { typeId: string } | undefined;
		try {
			block = b.entity.dimension.getBlock(s.pos);
		} catch {
			b.mine = null;
			return;
		}

		const view = snapshotBot(b.entity);
		const hasFatigue = view.effects.some((e) => e.includes('mining_fatigue'));
		const verdict = evaluateMining(
			s,
			{
				same: block?.typeId === s.typeId,
				changed: !block || block.typeId !== s.typeId,
				reappeared: false,
				hasFatigue,
				gameMode: view.gameMode,
			},
			system.currentTick,
		);

		switch (verdict) {
			case 'SUCCESS':
				b.mine = null;
				return;
			case 'STILL_MINING':
				return;
			case 'NEEDS_RETRY':
				s.retried = true;
				try {
					b.entity.breakBlock(s.pos);
				} catch {
					b.mine = null;
				}
				return;
			case 'UNBREAKABLE':
			case 'PROTECTED_REGION':
				b.breakTracker.record(verdict, s.typeId, s.pos);
				b.mine = null;
				return;
			default:
				b.mine = null;
		}
	}

	private scanBlocks(b: BotState): BlockCandidate[] {
		const out: BlockCandidate[] = [];
		const base = b.entity.location;
		const ox = Math.floor(base.x);
		const oy = Math.floor(base.y);
		const oz = Math.floor(base.z);
		const step = 3;
		const radius = 3;
		try {
			for (let dx = -radius; dx <= radius; dx += step) {
				for (let dz = -radius; dz <= radius; dz += step) {
					for (let dy = -1; dy <= 0; dy++) {
						const pos = { x: ox + dx, y: oy + dy, z: oz + dz };
						const block = b.entity.dimension.getBlock(pos);
						if (!block || !BLOCK_TABLE[block.typeId]) continue;
						out.push({
							typeId: block.typeId,
							pos,
							distance: Math.hypot(dx, dy, dz),
						});
					}
				}
			}
		} catch {
			/* dimension unavailable */
		}
		return out;
	}

	private applyHotbar(b: BotState): void {
		try {
			const view = snapshotBot(b.entity);
			const moves = planHotbar(view.items);
			if (moves.length === 0) return;
			const inv = b.entity.getComponent('minecraft:inventory')?.container;
			if (!inv) return;
			for (const m of moves) inv.swapItems(m.from, m.to, inv);
		} catch {
			/* inventory unavailable */
		}
	}

	private tryChat(b: BotState, view: { health: number; maxHealth: number }, target: { name: string; health: number; maxHealth: number; distance: number; shielding: boolean }): void {
		const line = this.chat.maybeSayAny(
			{
				targetName: target.name,
				targetHealth: target.health,
				targetMaxHealth: target.maxHealth,
				myHealth: view.health,
				myMaxHealth: view.maxHealth,
				myWeapon: 'minecraft:sword',
				distance: target.distance,
				targetShielding: target.shielding,
			},
			system.currentTick,
		);
		if (!line) return;
		system.runTimeout(() => {
			if (!b.entity.isValid) return;
			try {
				b.entity.chat(line.text);
			} catch {
				/* chat unavailable */
			}
		}, line.delayTicks);
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

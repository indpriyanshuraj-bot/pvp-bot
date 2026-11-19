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
import { planConsumable } from '../skills/consumables.js';
import {
	planGrind, beginMining, evaluateMining, ruleFor, BLOCK_TABLE,
	type BlockCandidate, type MineSession,
} from '../skills/grind.js';
import { BreakTracker } from '../skills/breakDetect.js';
import { planHotbar } from '../skills/inventory.js';
import { ArchetypeObserver } from '../social/observer.js';
import { Relations, betrayalScore } from '../social/relations.js';
import { ChatPolicy } from '../social/chat.js';
import { ReplyPolicy } from '../social/responder.js';
import { classify } from '../social/nlp.js';
import INTENTS from '../data/chat-intents.json';
import { Input } from './input.js';
import { snapshotBot, snapshotTarget } from './snapshot.js';
import { pickTarget, DEFAULT_TARGET_POLICY, type TargetCandidate, type TargetPolicy } from '../core/targeting.js';
import ARCHETYPE from '../data/archetypes.json';
import type { BotView, CapabilitySet, CombatIntent, Goal, MoveIntent } from '../types.js';

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
	/** snapshot captured in think(), reused by act() to avoid per-tick scans */
	view: BotView | null;
	caps: CapabilitySet | null;
	targetEntity: Entity | null;
	readonly observer: ArchetypeObserver;
	/** who last damaged this bot, for the provoked-mob rule */
	lastAttackerId: string | null;
	lastAttackerTick: number;
	/** previous distance to the current target, for the closing-speed signal */
	prevDistance: number | null;
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
	private readonly replier = new ReplyPolicy();
	private chatWired = false;
	private readonly targetPolicy: TargetPolicy = { ...DEFAULT_TARGET_POLICY };
	private debugTags = false;
	private subscribed = false;
	private failures = 0;

	add(entity: SimulatedPlayer, pro: ProSettings = DEFAULT_PRO, profileName = 'normal'): void {
		entity.addTag(BOT_TAG);
		const input = new Input(entity);
		// Worlds often hand every new player a starting map. Clear it, otherwise the
		// bot keeps holding it and the hotbar policy fights the leftovers.
		input.clearInventory();
		this.bots.set(entity.id, {
			entity,
			input,
			goal: null,
			pro,
			lastThink: -999,
			opponent: new OpponentModel(),
			archetype: {},
			tactic: null,
			lastAttackTick: -100,
			mine: null,
			view: null,
			caps: null,
			targetEntity: null,
			observer: new ArchetypeObserver(),
			lastAttackerId: null,
			lastAttackerTick: -9999,
			prevDistance: null,
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
		this.subscribeChat();
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
				const state = this.bots.get(victim.id);
				if (state) {
					state.lastAttackerId = attacker.id;
					state.lastAttackerTick = system.currentTick;
				}
			});
			world.afterEvents.entityDie.subscribe((ev) => {
				const dead = ev.deadEntity;
				if (!dead) return;
				if (this.bots.has(dead.id)) this.remove(dead.id);
			});
		} catch {
			/* event unavailable */
		}
	}

	/**
	 * Inbound chat. `world.beforeEvents.chatSend` only exists in the beta module,
	 * so this is feature-detected: on a stable-only module the bot keeps talking
	 * but stops listening, which is a graceful degradation rather than a crash.
	 */
	private subscribeChat(): void {
		if (this.chatWired) return;
		this.chatWired = true;
		try {
			const before = world.beforeEvents as unknown as {
				chatSend?: { subscribe: (cb: (ev: { sender?: Entity; message?: string }) => void) => void };
			};
			if (!before.chatSend?.subscribe) {
				console.info('[PvP Bots v3] chatSend unavailable (needs Beta APIs) — inbound chat off');
				return;
			}
			before.chatSend.subscribe((ev) => {
				const sender = ev.sender;
				const message = ev.message;
				if (!sender || typeof message !== 'string') return;
				if (sender.hasTag(BOT_TAG)) return;
				if (this.bots.size === 0) return;
				// beforeEvents run read-only; replying must be deferred
				system.run(() => this.handleChat(sender, message));
			});
		} catch (err) {
			console.warn(`[PvP Bots v3] could not subscribe to chatSend: ${String(err)}`);
		}
	}

	private handleChat(sender: Entity, message: string): void {
		if (!this.governor.throttle.chat) return;
		if (!sender.isValid) return;
		try {
			const names = world.getPlayers().map((p) => p.name);
			const match = classify(message, INTENTS as never, names);
			if (!match) return;

			const bot = this.nearestTo(sender.location);
			if (!bot) return;

			const reply = this.replier.maybeReply(
				{
					speaker: sender.nameTag || 'player',
					intent: match.intent,
					coords: bot.entity.location,
				},
				system.currentTick,
			);
			if (!reply) return;

			system.runTimeout(() => {
				if (!bot.entity.isValid) return;
				try {
					bot.entity.chat(reply.text);
				} catch {
					/* chat unavailable */
				}
			}, reply.delayTicks);
		} catch {
			/* never let chat break the loop */
		}
	}

	get relationsView(): Relations {
		return this.relations;
	}

	private tick(): void {
		const t0 = Date.now();
		try {
			this.tickInner();
		} catch (err) {
			this.failures++;
			if (this.failures === 1 || this.failures % 100 === 0) {
				console.error(`[PvP Bots v3] tick error #${this.failures}: ${String(err)}`);
			}
		} finally {
			this.governor.record(Date.now() - t0, Date.now());
		}
	}

	private tickInner(): void {
		try {
			const throttle = this.governor.throttle;
			const list = this.all().filter((b) => b.entity.isValid);
			if (list.length === 0) return;

			if (system.currentTick % 100 === 0) this.prune();
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
			for (const b of list) {
				// one misbehaving bot must never take down the loop
				try {
					this.act(b);
					const t = b.targetEntity;
					this.updateTag(b, t && t.isValid ? t.nameTag || t.typeId.replace('minecraft:', '') : '-');
				} catch {
					this.failures++;
				}
			}
		} finally {
			/* measured by the caller */
		}
	}

	private think(b: BotState): void {
		b.lastThink = system.currentTick;
		const view = snapshotBot(b.entity);
		const caps = deriveCapabilities(view.items);
		const targetEntity = this.findTarget(b);
		const target = targetEntity ? snapshotTarget(targetEntity) : null;
		if (target && targetEntity) target.distance = distance(view.location, targetEntity.location);

		b.view = view;
		b.caps = caps;
		b.targetEntity = targetEntity ?? null;

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
			relation: target ? this.relationFor(b, view, target) : null,
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

	/** Trust plus a live betrayal estimate from observable behaviour. */
	private relationFor(
		b: BotState,
		view: { view: { x: number; z: number }; location: { x: number; z: number } },
		target: { id: string; distance: number; heldTypeId: string | null; location: { x: number; z: number } },
	): { trust: number; betrayal: number } {
		const closing = b.prevDistance === null ? 0 : b.prevDistance - target.distance;
		b.prevDistance = target.distance;

		const dx = target.location.x - view.location.x;
		const dz = target.location.z - view.location.z;
		const len = Math.hypot(dx, dz) || 1;
		// negative dot means the target is behind us
		const dot = (view.view.x * dx + view.view.z * dz) / len;
		const weapon = target.heldTypeId;

		const betrayal = betrayalScore({
			trust: this.relations.trustOf(target.id),
			closingSpeed: closing,
			weaponDrawn: !!weapon && !weapon.includes('map') && !weapon.includes('air'),
			behind: dot < -0.2,
			switchedToMe: false,
		});

		return { trust: this.relations.trustOf(target.id), betrayal };
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
		// Reuse the snapshot captured in think(); only the target's position is
		// re-read, which is a cheap property access rather than a world query.
		const view = b.view;
		const caps = b.caps;
		if (!view || !caps) return;

		if (b.goal === 'FIGHT') {
			const t = b.targetEntity;
			if (!t || !t.isValid) {
				b.input.stop();
				return;
			}
			const target = snapshotTarget(t);
			target.distance = distance(view.location, t.location);
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
			// Beyond a short sprint, let the engine path instead of steering raw.
			if (target.distance > 12) {
				b.input.navigate(t.location, 1);
			} else {
				this.applyCombat(b, intent, t);
			}

			if (throttle.chat) this.tryChat(b, view, target, caps);
			return;
		}

		if (b.goal === 'CLUTCH' || b.goal === 'FLEE') {
			const survival = planSurvival(view, caps);
			if (survival) {
				this.applySurvival(b, view, survival);
				return;
			}
			const t = b.targetEntity;
			if (t && t.isValid) {
				this.applyMove(b, planFlee(view, t.location, system.currentTick));
			} else {
				b.input.stop();
			}
			return;
		}

		if (b.goal === 'EAT') {
			const inFight = !!b.targetEntity && b.targetEntity.isValid;
			const choice = planConsumable(view, inFight);
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

		const t = b.targetEntity;
		if (t && t.isValid) {
			const target = snapshotTarget(t);
			target.distance = distance(view.location, t.location);
			this.applyMove(b, planHold(view, target));
		} else {
			b.input.stop();
		}
	}

	// ── grinding ──────────────────────────────────────────────────────────────
	private grind(b: BotState): void {
		const view = b.view;
		const caps = b.caps;
		if (!view || !caps) return;

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
			threat: 1 - view.health / Math.max(1, view.maxHealth),
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

	private tryChat(
		b: BotState,
		view: { health: number; maxHealth: number },
		target: { name: string; health: number; maxHealth: number; distance: number; shielding: boolean },
		caps: { bestWeapon: { typeId: string } | null },
	): void {
		const line = this.chat.maybeSayAny(
			{
				targetName: target.name,
				targetHealth: target.health,
				targetMaxHealth: target.maxHealth,
				myHealth: view.health,
				myMaxHealth: view.maxHealth,
				myWeapon: caps.bestWeapon?.typeId ?? 'fists',
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
		this.noteMovement(b, intent.forward !== 0 || intent.strafe !== 0);
	}

	/**
	 * If the bot has been trying to move without going anywhere, hop — the usual
	 * cause is a one-block lip it cannot step up.
	 */
	private noteMovement(b: BotState, trying: boolean): void {
		try {
			const pos = b.entity.location;
			if (this.stuck.sample(b.entity.id, pos, system.currentTick, trying)) {
				b.input.jump();
			}
		} catch {
			/* entity gone */
		}
	}

	private applyCombat(b: BotState, intent: CombatIntent, target: { location: { x: number; y: number; z: number } }): void {
		void target;
		if (intent.lookAt) b.input.lookAt(intent.lookAt);
		if (intent.move) {
			b.input.move(intent.move.forward, intent.move.strafe);
			if (intent.move.jump) b.input.jump();
			this.noteMovement(b, intent.move.forward !== 0 || intent.move.strafe !== 0);
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


	private findTarget(b: BotState): Entity | undefined {
		try {
			const radius = this.governor.throttle.snapshotRadius;
			const found = b.entity.dimension.getEntities({
				location: b.entity.location,
				maxDistance: radius,
			});

			const scored: Array<{ entity: Entity; candidate: TargetCandidate }> = [];
			for (const e of found) {
				if (!e.isValid || e.id === b.entity.id) continue;
				if (e.hasTag(BOT_TAG)) continue;
				const view = snapshotTarget(e);
				const d = distance(b.entity.location, e.location);
				if (d > this.targetPolicy.maxDistance) continue;
				scored.push({
					entity: e,
					candidate: {
						id: view.id,
						typeId: e.typeId,
						distance: d,
						isPlayer: view.isPlayer,
						gameMode: view.gameMode,
						health: view.health,
						maxHealth: view.maxHealth,
						attackingMe:
							b.lastAttackerId === e.id && system.currentTick - b.lastAttackerTick < 200,
					},
				});
			}

			const best = pickTarget(scored.map((s) => s.candidate), this.targetPolicy);
			if (!best) return undefined;
			return scored.find((s) => s.candidate.id === best.id)?.entity;
		} catch {
			return undefined;
		}
	}

	/** Re-resolve every live bot against a new pro profile. */
	applyPro(pro: ProSettings, profileName: string): number {
		let n = 0;
		for (const b of this.bots.values()) {
			b.pro = { ...pro };
			b.profileName = profileName;
			n++;
		}
		return n;
	}

	setDebug(on: boolean): void {
		this.debugTags = on;
	}

	get debug(): boolean {
		return this.debugTags;
	}

	/** Short status line so a failure can be read off the bot's head in-game. */
	private updateTag(b: BotState, targetName: string): void {
		if (!this.debugTags || !b.entity.isValid) return;
		const goal = b.goal ?? 'IDLE';
		const tactic = b.tactic ?? '-';
		const tag = `§b${goal}§7/§e${tactic}§7 ${targetName} §8${this.governor.current}`;
		try {
			if (b.entity.nameTag !== tag) b.entity.nameTag = tag;
		} catch {
			/* entity gone */
		}
	}

	/** Closest live bot to a point, for command targeting. */
	nearestTo(pos: { x: number; y: number; z: number }): BotState | null {
		let best: BotState | null = null;
		let bestD = Infinity;
		for (const b of this.bots.values()) {
			if (!b.entity.isValid) continue;
			const d = distance(pos, b.entity.location);
			if (d < bestD) {
				bestD = d;
				best = b;
			}
		}
		return best;
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

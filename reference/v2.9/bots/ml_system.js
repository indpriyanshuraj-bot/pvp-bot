import { world, system, GameMode } from '@minecraft/server';
import * as c from '@minecraft/server-gametest';
import { sharedBotSystem } from 'bots/bot_manager';
import { giveKit, swapKitSlots } from '../kit_apply.js';
import { getMLSetting } from './mlSettingsManager.js';
import { hasClearShot, isGrounded } from './humanizer.js';
import { getWorldProp } from '../dynamic_store.js';
const botSystem = sharedBotSystem,
	KIT_IDS = {
		sword: 'Sword_Kit',
		axe: 'Axe_Kit',
		mace: 'Mace_Kit',
		uhc: 'UHC_Kit',
		crystal: 'Crystal_Kit',
	},
	DIFFICULTIES = {
		easy: 3,
		medium: 2,
		hard: 1,
		impossible: 0,
	},
	DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'impossible'],
	TACTICAL_ACTIONS = {
		sword: ['basic_attack', 'hold'],
		axe: ['basic_attack', 'ranged_attack'],
		mace: ['mace_attack', 'shield'],
		uhc: ['uhc_attack', 'ranged_attack', 'shield'],
		crystal: ['crystal_attack', 'basic_attack'],
	},
	PASSIVE_ACTIONS = new Set(['hold', 'shield']),
	REWARD_CHECKS = {
		sword: [],
		axe: ['block', 'shieldBreak'],
		mace: ['block', 'shieldBreak'],
		uhc: ['block', 'shieldBreak', 'trap'],
		crystal: [],
	},
	MOVEMENT_ACTIONS = ['press', 'hold', 'reset', 'circle_left', 'circle_right'];
export const CLASSES = Object.keys(TACTICAL_ACTIONS);
const FEATURE_COUNT = 26,
	BRAIN_VERSION = 2;
let brains = null;
const dirtyClasses = new Set(),
	pendingByBot = new Map(),
	rewardAtkByBot = new Map(),
	rewardDefByBot = new Map(),
	dealtByBot = new Map(),
	swingsByBot = new Map(),
	pendingMoveByBot = new Map(),
	rewardMoveAtkByBot = new Map(),
	rewardMoveDefByBot = new Map(),
	trackedBots = new Set(),
	botClassById = new Map(),
	botRefById = new Map(),
	lastShieldBreakCredit = new Map(),
	comboByBot = new Map(),
	recentDamageByBot = new Map(),
	autoTrainPairs = new Map();
let autoTrainCounter = 0;
const replayByClass = new Map();
function clamp(d, e, f) {
	return Math.min(f, Math.max(e, d));
}
function freshBrain() {
	return {
		version: BRAIN_VERSION,
		atk: {
			weights: {},
			moveWeights: {},
		},
		def: {
			weights: {},
			moveWeights: {},
		},
		counts: {},
		moveCounts: {},
		steps: 0,
		moveSteps: 0,
	};
}
function addReward(d, e, f) {
	(e &&
		(rewardAtkByBot.set(d, (rewardAtkByBot.get(d) ?? 0) + e),
		rewardMoveAtkByBot.set(d, (rewardMoveAtkByBot.get(d) ?? 0) + e)),
		f &&
			(rewardDefByBot.set(d, (rewardDefByBot.get(d) ?? 0) + f),
			rewardMoveDefByBot.set(d, (rewardMoveDefByBot.get(d) ?? 0) + f)));
}
function weightsFor(d, e) {
	if (!d.weights) d.weights = {};
	const f = d.weights[e];
	if (!f) d.weights[e] = new Array(FEATURE_COUNT).fill(0);
	else f.length !== FEATURE_COUNT && (d.weights[e] = resizeVector(f));
	return d.weights[e];
}
function weightsForMove(d, e) {
	if (!d.moveWeights) d.moveWeights = {};
	const f = d.moveWeights[e];
	if (!f) d.moveWeights[e] = new Array(FEATURE_COUNT).fill(0);
	else f.length !== FEATURE_COUNT && (d.moveWeights[e] = resizeVector(f));
	return d.moveWeights[e];
}
function resizeVector(d) {
	const e = new Array(FEATURE_COUNT).fill(0);
	for (let f = 0; f < Math.min(d.length, FEATURE_COUNT); f++) {
		e[f] = Number(d[f]) || 0;
	}
	return e;
}
function scoreAction(d, e) {
	let f = 0;
	for (let g = 0; g < FEATURE_COUNT; g++) f += d[g] * e[g];
	return f;
}
function scoreTactical(d, e, f, g) {
	const h = scoreAction(weightsFor(d.atk, e), f);
	if (g === 'attack') return h;
	const i = scoreAction(weightsFor(d.def, e), f);
	if (g === 'defense') return i;
	return h + i;
}
function scoreMovement(d, e, f, g) {
	const h = scoreAction(weightsForMove(d.atk, e), f);
	if (g === 'attack') return h;
	const i = scoreAction(weightsForMove(d.def, e), f);
	if (g === 'defense') return i;
	return h + i;
}
function saveChunked(d, e) {
	const f = JSON.stringify(e),
		g = getMLSetting('MAX_CHUNK_CHARS'),
		h = Math.max(1, Math.ceil(f.length / g));
	for (let k = 0; k < h; k++) {
		const l = f.slice(k * g, (k + 1) * g);
		world.setDynamicProperty(d + '_data' + (k + 1), l);
	}
	let j = h + 1;
	while (world.getDynamicProperty(d + '_data' + j) !== undefined) {
		(world.setDynamicProperty(d + '_data' + j), j++);
	}
	world.setDynamicProperty(
		d + '_meta',
		JSON.stringify({
			chunks: h,
		}),
	);
}
function loadChunked(d) {
	try {
		const f = world.getDynamicProperty(d + '_meta');
		if (typeof f !== 'string') return null;
		const g = JSON.parse(f);
		let h = '';
		for (let j = 1; j <= g.chunks; j++) {
			h += world.getDynamicProperty(d + '_data' + j) ?? '';
		}
		return JSON.parse(h);
	} catch (k) {
		return null;
	}
}
function clearChunked(d) {
	let f = 0;
	try {
		f = JSON.parse(world.getDynamicProperty(d + '_meta'))?.chunks ?? 0;
	} catch (h) {}
	const g = Math.max(f, 20) + 5;
	for (let j = 1; j <= g; j++) {
		if (world.getDynamicProperty(d + '_data' + j) === undefined) break;
		world.setDynamicProperty(d + '_data' + j);
	}
	world.setDynamicProperty(d + '_meta');
}
function migrateBrain(d) {
	if (!d || !d.atk?.weights || !d.def?.weights) return freshBrain();
	const e = {
		version: BRAIN_VERSION,
		atk: {
			weights: {},
			moveWeights: {},
		},
		def: {
			weights: {},
			moveWeights: {},
		},
		counts: d.counts ?? {},
		moveCounts: d.moveCounts ?? {},
		steps: Number(d.steps) || 0,
		moveSteps: Number(d.moveSteps) || 0,
		bonusCounts: d.bonusCounts ?? {},
	};
	for (const f of ['atk', 'def']) {
		const g = d[f] ?? {};
		for (const h in g.weights ?? {}) {
			e[f].weights[h] = resizeVector(g.weights[h] ?? []);
		}
		for (const i in g.moveWeights ?? {}) {
			e[f].moveWeights[i] = resizeVector(g.moveWeights[i] ?? []);
		}
	}
	return e;
}
function ensureLoaded() {
	if (brains) return;
	brains = {};
	for (const d of CLASSES) {
		const e = loadChunked('ml_brain_' + d);
		((brains[d] = migrateBrain(e)), replayByClass.set(d, []));
	}
}
system.run(() => {
	(system.runInterval(() => {
		if (!brains) return;
		if (trackedBots.size > 0)
			try {
				runReplay();
			} catch (d) {}
		if (dirtyClasses.size === 0) return;
		for (const f of dirtyClasses) {
			try {
				saveChunked('ml_brain_' + f, brains[f]);
			} catch (g) {}
		}
		dirtyClasses.clear();
	}, getMLSetting('SAVE_INTERVAL_TICKS')),
		system.runInterval(
			() => {
				if (trackedBots.size === 0) return;
				const d = getMLSetting('PENDING_TIMEOUT_TICKS'),
					e = system.currentTick;
				for (const [f, g] of pendingByBot) {
					if (e - g.decisionTick >= d) settleBot(f);
				}
				for (const [h, i] of pendingMoveByBot) {
					if (e - i.decisionTick >= d) settleMove(h);
				}
			},
			Math.max(5, getMLSetting('SETTLE_SWEEP_TICKS')),
		));
});
function radialBasis(e, f, g) {
	const h = (e - f) / g;
	return Math.exp(-h * h);
}
function encodeFeatures(d, f, g) {
	const h = d.getComponent('minecraft:health'),
		i = g?.isValid ? g.getComponent?.('minecraft:health') : undefined,
		j = h ? h.currentValue : 20,
		k = i ? i.currentValue : 20,
		l = g?.isValid ? botSystem.getDistance(d.location, g.location) : 10,
		m = botSystem.getProp('javaCombat') ? 1 : 0,
		n = clamp((f.lastAttack ?? 0) / 20, 0, 1),
		o = clamp((3 - (f.difficulty ?? 3)) / 3, 0, 1),
		p = system.currentTick;
	let q = 0;
	const r = comboByBot.get(d.id);
	r &&
		(p - r.lastHitTick <= getMLSetting('COMBO_TIMEOUT_TICKS')
			? (q = clamp(r.count / 5, 0, 1.5))
			: (r.count = 0));
	const s = g?.isValid ? clamp((d.location.y - g.location.y) / 5, -1, 1) : 0,
		t = g?.isValid && g.hasTag('shielding') ? 1 : 0,
		u = g?.isValid && g.hasTag('shield_broken') ? 1 : 0,
		v = d.hasTag('shield_broken') ? 1 : 0,
		w = (d.fallDistance ?? 0) > 0 ? 1 : 0;
	let x = 0;
	if (g?.isValid && sharedBotSystem.liquidMap.size > 0)
		for (const K of sharedBotSystem.liquidMap.values()) {
			if (botSystem.getDistance(g.location, K.location) < 3) {
				x = 1;
				break;
			}
		}
	const y = botSystem.getRange(d) ?? 3,
		z = clamp((l - y) / 4, -1, 1);
	let A = 0,
		B = 0,
		C = 0;
	if (g?.isValid) {
		try {
			const L = d.getVelocity(),
				M = g.getVelocity(),
				N = g.location.x - d.location.x,
				O = g.location.z - d.location.z,
				P = Math.hypot(N, O) || 1,
				Q = ((L.x - M.x) * N + (L.z - M.z) * O) / P;
			A = clamp(Q / 0.5, -1, 1);
		} catch (R) {}
		try {
			B = g.isSprinting ? 1 : 0;
		} catch (S) {}
		try {
			const T = d.getViewDirection(),
				U = g.location.x - d.location.x,
				V = g.location.z - d.location.z,
				W = Math.hypot(U, V) || 1;
			C = clamp((T.x * U + T.z * V) / W, -1, 1);
		} catch (X) {}
	}
	const D = isGrounded(d) ? 1 : 0,
		E = g?.isValid && !botSystem.isInAir(g) ? 1 : 0,
		F = clamp(botSystem.getAggression(d), 0, 1),
		G = g?.isValid && hasClearShot(d, g) ? 1 : 0,
		H = recentDamageByBot.get(d.id) ?? {
			taken: 0,
			dealt: 0,
		},
		I = clamp(H.taken / 10, 0, 1.5),
		J = clamp(H.dealt / 10, 0, 1.5);
	return [
		1,
		clamp(j / 20, 0, 1.5),
		clamp(k / 20, 0, 1.5),
		clamp(l / 10, 0, 1.5),
		n,
		m,
		o,
		s,
		t,
		u,
		v,
		w,
		x,
		q,
		z,
		A,
		B,
		D,
		E,
		F,
		G,
		I,
		J,
		C,
		radialBasis(l, 2.5, 1.2),
		radialBasis(l, 6, 2.5),
	];
}
function potential(d, f) {
	try {
		const g = d?.isValid ? (d.getComponent('minecraft:health')?.currentValue ?? 20) / 20 : 0,
			h = f?.isValid ? (f.getComponent('minecraft:health')?.currentValue ?? 20) / 20 : 0;
		return (g - h) * getMLSetting('SHAPING_SCALE');
	} catch (i) {
		return 0;
	}
}
function feasible(d, e, f) {
	if (d === 'ranged_attack') {
		const g = f?.isValid ? botSystem.getDistance(e.location, f.location) : Infinity;
		if (g <= 7) return true;
		const h =
			botSystem.hasItemHotbar(e, 'minecraft:bow') !== undefined ||
			botSystem.hasItemHotbar(e, 'minecraft:crossbow') !== undefined;
		if (!h) return true;
		return (
			botSystem.hasItemHotbar(e, 'minecraft:arrow') !== undefined ||
			botSystem.hasItem(e, 'minecraft:arrow') !== undefined
		);
	}
	if (d === 'shield') return botSystem.hasUsableShield(e);
	return false;
}
function temperatureFor(d) {
	return Math.max(
		getMLSetting('TEMPERATURE_MIN'),
		getMLSetting('TEMPERATURE_START') - d * getMLSetting('TEMPERATURE_DECAY'),
	);
}
function visitCount(d, e) {
	return d?.[e] ?? 0;
}
function bumpVisit(d, e) {
	d[e] = (d[e] ?? 0) + 1;
}
function softmaxPick(d, e, f, g, h) {
	if (d.length === 1) return d[0];
	const j = getMLSetting('EXPLORE_BONUS'),
		k = Math.log(Math.max(2, g + 1)),
		l = d.map(e),
		m = Math.max(...l),
		n = Math.min(...l),
		o = Math.max(0.001, m - n),
		p = l.map((v, w) => {
			const x = visitCount(f, d[w]);
			return v + j * o * Math.sqrt(k / (x + 1));
		}),
		q = Math.max(...p),
		r = Math.max(0.000001, h * o);
	let s = 0;
	const t = p.map((v) => {
		const x = Math.exp((v - q) / r);
		return ((s += x), x);
	});
	let u = Math.random() * s;
	for (let v = 0; v < d.length; v++) {
		u -= t[v];
		if (u <= 0) return d[v];
	}
	return d[d.length - 1];
}
function updateComponent(d, e, f) {
	const g = scoreAction(d, e),
		h = f - g;
	let j = 0;
	for (let m = 0; m < FEATURE_COUNT; m++) j += e[m] * e[m];
	const k = getMLSetting('WEIGHT_CLAMP'),
		l = getMLSetting('LEARNING_RATE') / (1 + j);
	for (let n = 0; n < FEATURE_COUNT; n++) {
		d[n] = clamp(d[n] + l * h * e[n], -k, k);
	}
}
function pushReplay(d, e) {
	let f = replayByClass.get(d);
	!f && ((f = []), replayByClass.set(d, f));
	f.push(e);
	const g = Math.max(16, getMLSetting('REPLAY_CAPACITY'));
	while (f.length > g) f.shift();
}
function runReplay() {
	if (!brains) return;
	const d = Math.max(0, Math.floor(getMLSetting('REPLAY_BATCH')));
	if (d === 0) return;
	const e = Math.max(1, Math.floor(getMLSetting('REPLAY_PASSES')));
	for (const f of CLASSES) {
		const g = replayByClass.get(f),
			h = brains[f];
		if (!g || g.length < 8 || !h) continue;
		for (let j = 0; j < e; j++) {
			for (let k = 0; k < d; k++) {
				const l = g[Math.floor(Math.random() * g.length)];
				if (!l) continue;
				l.kind === 'move'
					? (updateComponent(weightsForMove(h.atk, l.action), l.features, l.atk),
						updateComponent(weightsForMove(h.def, l.action), l.features, l.def))
					: (updateComponent(weightsFor(h.atk, l.action), l.features, l.atk),
						updateComponent(weightsFor(h.def, l.action), l.features, l.def));
			}
		}
		dirtyClasses.add(f);
	}
}
function resolveTarget(d) {
	if (!d) return undefined;
	try {
		const f = world.getEntity(d);
		return f?.isValid ? f : undefined;
	} catch (g) {
		return undefined;
	}
}
function bootstrapValue(d, f, g, h, i, j) {
	try {
		if (!g?.isValid || !i?.isValid)
			return {
				atk: 0,
				def: 0,
			};
		const k = encodeFeatures(g, h, i),
			l = j ? MOVEMENT_ACTIONS : (TACTICAL_ACTIONS[f] ?? []);
		if (l.length === 0)
			return {
				atk: 0,
				def: 0,
			};
		let m = -Infinity,
			n = -Infinity;
		for (const o of l) {
			const p = j ? scoreAction(weightsForMove(d.atk, o), k) : scoreAction(weightsFor(d.atk, o), k),
				q = j ? scoreAction(weightsForMove(d.def, o), k) : scoreAction(weightsFor(d.def, o), k);
			if (p > m) m = p;
			if (q > n) n = q;
		}
		return {
			atk: m,
			def: n,
		};
	} catch (r) {
		return {
			atk: 0,
			def: 0,
		};
	}
}
function settleBot(d) {
	const f = pendingByBot.get(d);
	pendingByBot.delete(d);
	const g = dealtByBot.get(d) ?? 0,
		h = swingsByBot.get(d) ?? 0;
	(dealtByBot.delete(d), swingsByBot.delete(d));
	if (!f) {
		(rewardAtkByBot.delete(d), rewardDefByBot.delete(d));
		return;
	}
	let i = rewardAtkByBot.get(d) ?? 0;
	const j = rewardDefByBot.get(d) ?? 0;
	(rewardAtkByBot.delete(d), rewardDefByBot.delete(d));
	const k = PASSIVE_ACTIONS.has(f.action);
	if (g <= 0 && f.hadTarget && !k) i -= getMLSetting('IDLE_PENALTY');
	if (g <= 0 && h > 0 && !k) i -= getMLSetting('WHIFF_PENALTY') * Math.min(h, 4);
	const l = brains?.[f.className];
	if (!l) return;
	const m = botRefById.get(d),
		n = resolveTarget(f.targetId);
	let o = 0;
	m?.isValid &&
		n?.isValid &&
		typeof f.potential === 'number' &&
		(o = getMLSetting('DISCOUNT') * potential(m, n) - f.potential);
	const p = bootstrapValue(l, f.className, m, botSystem.getBotData(m) ?? {}, n, true),
		q = getMLSetting('DISCOUNT'),
		r = getMLSetting('REWARD_SCALE'),
		s = (i + o) / r + q * clamp(p.atk, -20, 20),
		t = j / r + q * clamp(p.def, -20, 20);
	try {
		(updateComponent(weightsFor(l.atk, f.action), f.features, s),
			updateComponent(weightsFor(l.def, f.action), f.features, t),
			(l.steps = (l.steps ?? 0) + 1));
		if (!l.counts) l.counts = {};
		(bumpVisit(l.counts, f.action),
			pushReplay(f.className, {
				kind: 'tactical',
				action: f.action,
				features: f.features,
				atk: s,
				def: t,
			}),
			dirtyClasses.add(f.className));
	} catch (u) {}
}
function settleMove(d, f = undefined) {
	const g = pendingMoveByBot.get(d);
	pendingMoveByBot.delete(d);
	if (!g) {
		(rewardMoveAtkByBot.delete(d), rewardMoveDefByBot.delete(d));
		return;
	}
	let h = rewardMoveAtkByBot.get(d) ?? 0;
	const i = rewardMoveDefByBot.get(d) ?? 0;
	(rewardMoveAtkByBot.delete(d), rewardMoveDefByBot.delete(d));
	if (typeof g.startDist === 'number' && typeof f === 'number') {
		const r = getMLSetting('CLOSE_REWARD_CAP'),
			s = getMLSetting('CLOSE_REWARD_PER_BLOCK');
		h += clamp((g.startDist - f) * s, -r, r);
		if (typeof g.reach === 'number') {
			const t = Math.abs(f - g.reach * 0.9);
			h += getMLSetting('SPACING_REWARD') * clamp(1 - t / 2.5, -1, 1);
		}
	}
	const j = brains?.[g.className];
	if (!j) return;
	const k = botRefById.get(d),
		l = resolveTarget(g.targetId),
		m = bootstrapValue(j, g.className, k, botSystem.getBotData(k) ?? {}, l, false),
		n = getMLSetting('DISCOUNT'),
		o = getMLSetting('REWARD_SCALE'),
		p = h / o + n * clamp(m.atk, -20, 20),
		q = i / o + n * clamp(m.def, -20, 20);
	try {
		(updateComponent(weightsForMove(j.atk, g.action), g.features, p),
			updateComponent(weightsForMove(j.def, g.action), g.features, q),
			(j.moveSteps = (j.moveSteps ?? 0) + 1));
		if (!j.moveCounts) j.moveCounts = {};
		(bumpVisit(j.moveCounts, g.action),
			pushReplay(g.className, {
				kind: 'move',
				action: g.action,
				features: g.features,
				atk: p,
				def: q,
			}),
			dirtyClasses.add(g.className));
	} catch (u) {}
}
function movementBlendWeight(d) {
	return Math.min(
		getMLSetting('MOVEMENT_MAX_BLEND'),
		(d.moveSteps ?? 0) / getMLSetting('MOVEMENT_MATURITY_STEPS'),
	);
}
function hasRewardCheck(d, e) {
	if (!trackedBots.has(d)) return true;
	const f = botClassById.get(d);
	return f ? (REWARD_CHECKS[f]?.includes(e) ?? true) : true;
}
function bumpBonusCount(d, e) {
	const f = botClassById.get(d);
	if (!f) return;
	ensureLoaded();
	const g = brains[f];
	if (!g) return;
	if (!g.bonusCounts) g.bonusCounts = {};
	((g.bonusCounts[e] = (g.bonusCounts[e] ?? 0) + 1), dirtyClasses.add(f));
}
function noteRecentDamage(d, e, f) {
	const g = recentDamageByBot.get(d) ?? {
			taken: 0,
			dealt: 0,
			tick: system.currentTick,
		},
		h = system.currentTick - (g.tick ?? system.currentTick),
		i = Math.pow(0.97, Math.max(0, h));
	((g.taken = g.taken * i + e),
		(g.dealt = g.dealt * i + f),
		(g.tick = system.currentTick),
		recentDamageByBot.set(d, g));
}
function creditTrapDamage(d) {
	if (!d?.isValid) return;
	if (sharedBotSystem.liquidMap.size === 0) return;
	for (const [e, f] of sharedBotSystem.liquidMap) {
		if (f.placedBy === d.id) continue;
		if (!hasRewardCheck(f.placedBy, 'trap')) continue;
		if (botSystem.getDistance(d.location, f.location) > getMLSetting('TRAP_CREDIT_RANGE')) continue;
		(sharedBotSystem.liquidMap.delete(e),
			addReward(f.placedBy, getMLSetting('TRAP_BONUS'), 0),
			bumpBonusCount(f.placedBy, 'trap'));
		break;
	}
}
(world.afterEvents.entityHurt.subscribe((d) => {
	if (trackedBots.size === 0) return;
	const { hurtEntity: e, damage: f, damageSource: g } = d;
	if (!e) return;
	const h = g?.damagingEntity,
		i = system.currentTick;
	if (h?.isValid && trackedBots.has(h.id)) {
		let j = comboByBot.get(h.id) ?? {
			count: 0,
			lastHitTick: 0,
		};
		i - j.lastHitTick > getMLSetting('COMBO_TIMEOUT_TICKS') && (j.count = 0);
		(j.count++, (j.lastHitTick = i), comboByBot.set(h.id, j));
		const k = j.count > 1 ? (j.count - 1) * getMLSetting('COMBO_BONUS') : 0,
			l = f * getMLSetting('DAMAGE_DEALT_MULT') + k;
		(addReward(h.id, l, 0),
			dealtByBot.set(h.id, (dealtByBot.get(h.id) ?? 0) + f),
			noteRecentDamage(h.id, 0, f));
	}
	if (e.isValid && trackedBots.has(e.id)) {
		comboByBot.delete(e.id);
		const m = f * getMLSetting('DAMAGE_TAKEN_MULT');
		(addReward(e.id, 0, -m),
			noteRecentDamage(e.id, f, 0),
			e.hasTag('shielding') &&
				hasRewardCheck(e.id, 'block') &&
				(addReward(e.id, 0, getMLSetting('BLOCK_BONUS')), bumpBonusCount(e.id, 'block')));
	}
	(g?.cause === 'lava' || g?.cause === 'fire' || g?.cause === 'fireTick') && creditTrapDamage(e);
}),
	world.afterEvents.entityHitEntity.subscribe((d) => {
		if (trackedBots.size === 0) return;
		const { damagingEntity: e, hitEntity: f } = d;
		if (!e?.isValid || !f?.isValid) return;
		if (!trackedBots.has(e.id)) return;
		swingsByBot.set(e.id, (swingsByBot.get(e.id) ?? 0) + 1);
		if (!hasRewardCheck(e.id, 'shieldBreak')) return;
		if (!f.hasTag('shielding')) return;
		const g = e.getComponent('minecraft:equippable')?.getEquipment('Mainhand');
		if (!g?.typeId.includes('axe')) return;
		const h = lastShieldBreakCredit.get(f.id) ?? -Infinity;
		if (system.currentTick - h < getMLSetting('SHIELD_BREAK_COOLDOWN_TICKS')) return;
		(lastShieldBreakCredit.set(f.id, system.currentTick),
			addReward(e.id, getMLSetting('SHIELD_BREAK_BONUS'), 0),
			bumpBonusCount(e.id, 'shieldBreak'));
	}));
function curriculumDifficulty(d, e) {
	if (!getMLSetting('CURRICULUM')) return e;
	ensureLoaded();
	const f = brains?.[d]?.steps ?? 0,
		g = Math.max(1, getMLSetting('CURRICULUM_STEPS')),
		h = Math.floor(f / g);
	if (h <= 0) return e;
	const i = DIFFICULTY_ORDER.indexOf(e);
	if (i < 0) return e;
	return DIFFICULTY_ORDER[Math.min(DIFFICULTY_ORDER.length - 1, i + h)];
}
function spawnAutoTrainMember(d, e) {
	const f = autoTrainPairs.get(d);
	if (!f) return;
	const g = f.className,
		h = e === 'attack',
		i = h ? 1.5 : -1.5,
		j = c.spawnSimulatedPlayer(
			{
				x: f.location.x + i,
				y: f.location.y,
				z: f.location.z,
				dimension: f.dimension,
			},
			'§p§b§rPVP_bot',
			GameMode.survival,
		),
		k = h ? '[ML-Atk] ' + g : '[ML-Def] ' + g;
	j.nameTag = k;
	const l = DIFFICULTIES[f.trainDifficulty] ?? 3,
		m = curriculumDifficulty(g, f.sparringDifficulty),
		n = DIFFICULTIES[m] ?? l,
		o = {
			linked_player: 'bot',
			lastAttack: 0,
			difficulty: h ? l : n,
			type: g,
			action: 'none',
			is_eating: true,
			isPearling: true,
			lastPearl: 0,
			jumpDelay: 0,
			default_name: k,
			ignoredTag: null,
			customId: null,
			error: '',
			mlOverride: false,
			mlDisabled: true,
			mlRole: e,
		};
	(j.setDynamicProperty('bot_data', JSON.stringify(o)), giveKit(j, KIT_IDS[g]));
	if (g === 'mace') swapKitSlots(j, 5, 35);
	if (h) f.attackId = j.id;
	else f.defenseId = j.id;
}
function handlePairMemberGone(d) {
	if (autoTrainPairs.size === 0 || !d) return;
	for (const [e, f] of autoTrainPairs) {
		if (f.attackId === d) {
			((f.attackId = null),
				system.runTimeout(
					() => spawnAutoTrainMember(e, 'attack'),
					getMLSetting('RESPAWN_DELAY_TICKS'),
				));
			return;
		}
		if (f.defenseId === d) {
			((f.defenseId = null),
				system.runTimeout(
					() => spawnAutoTrainMember(e, 'defense'),
					getMLSetting('RESPAWN_DELAY_TICKS'),
				));
			return;
		}
	}
}
(world.afterEvents.entityDie.subscribe((d) => {
	const e = d.deadEntity?.id;
	trackedBots.size > 0 &&
		e &&
		trackedBots.has(e) &&
		(comboByBot.delete(e),
		addReward(e, 0, -getMLSetting('DEATH_PENALTY')),
		settleBot(e),
		settleMove(e),
		trackedBots.delete(e));
	if (trackedBots.size > 0) {
		const f = d.damageSource?.damagingEntity?.id;
		f &&
			trackedBots.has(f) &&
			(addReward(f, getMLSetting('WIN_BONUS'), 0), settleBot(f), settleMove(f));
	}
	handlePairMemberGone(e);
}),
	world.afterEvents.entityRemove.subscribe((d) => {
		const e = d.removedEntityId;
		if (!e) return;
		(trackedBots.delete(e),
			pendingByBot.delete(e),
			rewardAtkByBot.delete(e),
			rewardDefByBot.delete(e),
			dealtByBot.delete(e),
			swingsByBot.delete(e),
			pendingMoveByBot.delete(e),
			rewardMoveAtkByBot.delete(e),
			rewardMoveDefByBot.delete(e),
			botClassById.delete(e),
			botRefById.delete(e),
			lastShieldBreakCredit.delete(e),
			comboByBot.delete(e),
			recentDamageByBot.delete(e),
			handlePairMemberGone(e));
	}));
function decide(d, f, g, h, i) {
	try {
		if (!f?.isValid) return i;
		if (g.is_shooting) return i;
		const j = TACTICAL_ACTIONS[d],
			k = !g.mlDisabled && (g.mlOverride || isEnabled(d));
		if (!k || !j || !j.includes(i)) return i;
		const l = pendingByBot.get(f.id),
			m = (g.lastAttack ?? 0) > 0,
			n = !!l && system.currentTick - l.decisionTick < getMLSetting('MIN_TACTICAL_DECISION_TICKS');
		if (m || n) return l?.action ?? i;
		(ensureLoaded(),
			trackedBots.add(f.id),
			botClassById.set(f.id, d),
			botRefById.set(f.id, f),
			settleBot(f.id));
		const o = g.mlRole,
			p = botSystem.getAggression(f);
		let q = j.filter((v) => feasible(v, f, h));
		if (o === 'attack') q = q.filter((v) => !PASSIVE_ACTIONS.has(v));
		else o !== 'defense' && (q = q.filter((v) => p < 0.8 || !PASSIVE_ACTIONS.has(v)));
		if (q.length === 0) return i;
		const r = brains[d],
			s = encodeFeatures(f, g, h),
			t = Math.max(
				getMLSetting('EPSILON_MIN'),
				getMLSetting('EPSILON_START') - r.steps * getMLSetting('EPSILON_DECAY'),
			);
		let u;
		return (
			Math.random() < t * 0.35
				? (u = q[Math.floor(Math.random() * q.length)])
				: (u = softmaxPick(
						q,
						(v) => scoreTactical(r, v, s, o),
						r.counts ?? {},
						r.steps ?? 0,
						temperatureFor(r.steps ?? 0),
					)),
			pendingByBot.set(f.id, {
				className: d,
				action: u,
				features: s,
				decisionTick: system.currentTick,
				hadTarget: !!h?.isValid,
				targetId: h?.isValid ? h.id : undefined,
				potential: potential(f, h),
			}),
			rewardAtkByBot.set(f.id, 0),
			rewardDefByBot.set(f.id, 0),
			dealtByBot.set(f.id, 0),
			swingsByBot.set(f.id, 0),
			u
		);
	} catch (v) {
		return i;
	}
}
function decideMovement(d, f, g, h) {
	try {
		if (!f?.isValid || !h?.isValid) return null;
		const i = !g.mlDisabled && (g.mlOverride || isEnabled(d));
		if (!i) return null;
		ensureLoaded();
		const j = brains[d];
		(trackedBots.add(f.id), botClassById.set(f.id, d), botRefById.set(f.id, f));
		const k = botSystem.getDistance(f.location, h.location),
			l = pendingMoveByBot.get(f.id);
		if (l && system.currentTick - l.decisionTick < getMLSetting('MOVE_DECISION_WINDOW_TICKS'))
			return moveOverrideFor(l.action);
		settleMove(f.id, k);
		const m = movementBlendWeight(j),
			n = g.mlOverride ? 1 : Math.max(0.1, m);
		if (Math.random() >= n) return null;
		const o = g.mlRole,
			p = botSystem.getAggression(f);
		let q;
		if (o === 'attack') q = ['press', 'hold', 'circle_left', 'circle_right'];
		else {
			if (o === 'defense') q = MOVEMENT_ACTIONS;
			else q = p >= 0.8 ? ['press', 'hold', 'circle_left', 'circle_right'] : MOVEMENT_ACTIONS;
		}
		const r = encodeFeatures(f, g, h),
			s = Math.max(
				getMLSetting('EPSILON_MIN'),
				getMLSetting('EPSILON_START') - (j.moveSteps ?? 0) * getMLSetting('EPSILON_DECAY'),
			);
		let t;
		return (
			Math.random() < s * 0.35
				? (t =
						q.includes('press') && Math.random() < 0.5
							? 'press'
							: q[Math.floor(Math.random() * q.length)])
				: (t = softmaxPick(
						q,
						(u) => scoreMovement(j, u, r, o),
						j.moveCounts ?? {},
						j.moveSteps ?? 0,
						temperatureFor(j.moveSteps ?? 0),
					)),
			pendingMoveByBot.set(f.id, {
				className: d,
				action: t,
				features: r,
				decisionTick: system.currentTick,
				startDist: k,
				targetId: h.id,
				reach: botSystem.getRange(f) ?? 3,
			}),
			rewardMoveAtkByBot.set(f.id, 0),
			rewardMoveDefByBot.set(f.id, 0),
			moveOverrideFor(t)
		);
	} catch (u) {
		return null;
	}
}
function moveOverrideFor(d) {
	switch (d) {
		case 'hold':
			return {
				commit: true,
				lateral: 0,
			};
		case 'press':
			return {
				commit: false,
				direction: 1,
				lateral: 0,
			};
		case 'reset':
			return {
				commit: false,
				direction: -1,
				lateral: 0,
			};
		case 'circle_left':
			return {
				commit: true,
				lateral: -1,
			};
		case 'circle_right':
			return {
				commit: true,
				lateral: 1,
			};
		default:
			return {
				commit: true,
				lateral: 0,
			};
	}
}
function isEnabled(d) {
	return !!getWorldProp('ml_enabled_' + d);
}
function setEnabled(d, e) {
	world.setDynamicProperty('ml_enabled_' + d, !!e);
}
function resetBrain(d) {
	(ensureLoaded(),
		(brains[d] = freshBrain()),
		replayByClass.set(d, []),
		dirtyClasses.delete(d),
		clearChunked('ml_brain_' + d));
}
function getStats(d) {
	ensureLoaded();
	const e = brains[d];
	if (!e) return null;
	const f = new Set([...Object.keys(e.atk?.weights ?? {}), ...Object.keys(e.def?.weights ?? {})]),
		g = new Set([
			...Object.keys(e.atk?.moveWeights ?? {}),
			...Object.keys(e.def?.moveWeights ?? {}),
		]),
		h = temperatureFor(e.steps ?? 0),
		i = clamp(
			(h - getMLSetting('TEMPERATURE_MIN')) /
				Math.max(0.01, getMLSetting('TEMPERATURE_START') - getMLSetting('TEMPERATURE_MIN')),
			0,
			1,
		);
	return {
		steps: e.steps ?? 0,
		bytes: JSON.stringify(e).length,
		actionsLearned: f.size,
		epsilon: i,
		temperature: h,
		autoTrainPairs: countAutoTrainPairs(d),
		moveSteps: e.moveSteps ?? 0,
		moveActionsLearned: g.size,
		moveBlend: movementBlendWeight(e),
		replaySamples: (replayByClass.get(d) ?? []).length,
		featureCount: FEATURE_COUNT,
		bonusCounts: e.bonusCounts ?? {},
	};
}
function countAutoTrainPairs(d) {
	let e = 0;
	for (const f of autoTrainPairs.values()) {
		if (f.className === d) e++;
	}
	return e;
}
function getStorageReport() {
	ensureLoaded();
	const d = getMLSetting('MAX_CHUNK_CHARS'),
		f = CLASSES.map((i) => {
			const j = brains[i],
				k = JSON.stringify(j).length;
			return {
				className: i,
				bytes: k,
				chunks: Math.max(1, Math.ceil(k / d)),
				steps: j.steps ?? 0,
			};
		}),
		g = f.reduce((i, j) => i + j.bytes, 0);
	let h = null;
	try {
		typeof world.getDynamicPropertyTotalByteCount === 'function' &&
			(h = world.getDynamicPropertyTotalByteCount());
	} catch (i) {}
	return {
		perClass: f,
		totalBytes: g,
		worldTotalBytes: h,
		maxChunkChars: d,
	};
}
function startAutoTrain(d, e, f, g = 'easy', h = 1, j = g) {
	ensureLoaded();
	autoTrainPairs.size === 0 && (autoTrainCounter = 0);
	const k = Math.max(1, Math.floor(h) || 1),
		l = countAutoTrainPairs(d),
		m = getMLSetting('MAX_TOTAL_AUTO_TRAIN_PAIRS'),
		n = getMLSetting('MAX_PAIRS_PER_REQUEST'),
		o = getMLSetting('GRID_COLS'),
		p = getMLSetting('AUTO_TRAIN_SPACING'),
		q = Math.max(0, m - autoTrainPairs.size),
		r = Math.min(k, n, q);
	for (let s = 0; s < r; s++) {
		const t = autoTrainCounter,
			u = t % o,
			v = Math.floor(t / o),
			w = d + '_' + autoTrainCounter++;
		(autoTrainPairs.set(w, {
			className: d,
			location: {
				x: e.x + u * p,
				y: e.y,
				z: e.z + v * p,
			},
			dimension: f,
			attackId: null,
			defenseId: null,
			trainDifficulty: g,
			sparringDifficulty: j,
		}),
			spawnAutoTrainMember(w, 'attack'),
			spawnAutoTrainMember(w, 'defense'));
	}
	return {
		started: r,
		requested: k,
		totalNow: l + r,
		capped: r < k,
	};
}
function stopAutoTrain(d) {
	let f = 0;
	for (const [g, h] of autoTrainPairs) {
		if (h.className !== d) continue;
		(autoTrainPairs.delete(g), f++);
		for (const i of [h.attackId, h.defenseId]) {
			if (!i) continue;
			try {
				const j = world.getEntity(i);
				if (j?.isValid) j.disconnect();
			} catch (k) {}
		}
	}
	return f;
}
function isAutoTraining(d) {
	return countAutoTrainPairs(d) > 0;
}
export const MLSystem = {
	decide: decide,
	decideMovement: decideMovement,
	isEnabled: isEnabled,
	setEnabled: setEnabled,
	resetBrain: resetBrain,
	getStats: getStats,
	startAutoTrain: startAutoTrain,
	stopAutoTrain: stopAutoTrain,
	isAutoTraining: isAutoTraining,
	countAutoTrainPairs: countAutoTrainPairs,
	getStorageReport: getStorageReport,
	CLASSES: CLASSES,
	TACTICAL_ACTIONS: TACTICAL_ACTIONS,
	MOVEMENT_ACTIONS: MOVEMENT_ACTIONS,
	REWARD_CHECKS: REWARD_CHECKS,
	FEATURE_COUNT: FEATURE_COUNT,
};

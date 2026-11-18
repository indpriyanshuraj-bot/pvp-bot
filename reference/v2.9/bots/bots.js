import { system, world } from '@minecraft/server';
import * as c from '@minecraft/server-gametest';
import { BotManager } from 'bots/bot_manager';
import { DecisionManager } from 'bots/decision_manager';
import { MLSystem, CLASSES } from 'bots/ml_system';
import { sharedBotSystem } from './bot_manager';
import { Storage } from '../recording/recording_manager';
import { PlayBackManager } from '../recording/playback_manager';
import { getWorldProp, worldPropVersion } from '../dynamic_store.js';
import { parseCoords, isAtCoords } from './coords.js';
const botSystem = sharedBotSystem,
	playbackSystem = new PlayBackManager();
(playbackSystem.registerEvents(), botSystem.registerEvents());
function getEcoAiDelay(d) {
	const e = d.length;
	if (e < 20) return 1;
	else return Math.floor(e / 10);
}
const absorptionTracker = new Map(),
	preHitHealth = new Map();
function isBotEntity(d) {
	return typeof d?.name === 'string' && d.name.startsWith(botSystem.botPrefix);
}
function absorptionMaxFor(d) {
	return d ? 4 * ((d.amplifier ?? 0) + 1) : 0;
}
(world.afterEvents.effectAdd.subscribe((d) => {
	const e = d.entity;
	if (!e?.isValid || !isBotEntity(e)) return;
	if (d.effect?.typeId !== 'minecraft:absorption' && d.effect?.typeId !== 'absorption') return;
	absorptionTracker.set(e.id, absorptionMaxFor(d.effect));
}),
	world.beforeEvents.entityHurt.subscribe((d) => {
		const f = d.hurtEntity;
		if (!f?.isValid || !isBotEntity(f)) return;
		if (!absorptionTracker.get(f.id)) return;
		try {
			preHitHealth.set(f.id, f.getComponent('minecraft:health')?.currentValue ?? 0);
		} catch (g) {}
	}),
	world.afterEvents.entityHurt.subscribe((d) => {
		const e = d.hurtEntity;
		if (!e?.isValid || !isBotEntity(e)) return;
		const f = absorptionTracker.get(e.id);
		if (!f) return;
		const g = preHitHealth.get(e.id);
		preHitHealth.delete(e.id);
		const h = e.getComponent('minecraft:health')?.currentValue ?? 0;
		if (g !== undefined && h < g - 0.01) absorptionTracker.set(e.id, 0);
		else absorptionTracker.set(e.id, Math.max(0, f - (d.damage ?? 0)));
	}),
	world.afterEvents.entityRemove.subscribe((d) => {
		(absorptionTracker.delete(d.removedEntityId), preHitHealth.delete(d.removedEntityId));
	}));
function getAbsorption(d) {
	try {
		const g = d.getComponent('minecraft:absorption');
		if (g && typeof g.currentValue === 'number') return Math.max(0, g.currentValue);
	} catch (h) {}
	let f;
	try {
		f = d.getEffect('absorption');
	} catch (i) {}
	if (!f) return (absorptionTracker.delete(d.id), 0);
	if (!absorptionTracker.has(d.id)) absorptionTracker.set(d.id, absorptionMaxFor(f));
	return absorptionTracker.get(d.id);
}
function formatHealthTag(d) {
	const e = d.getComponent('minecraft:health');
	if (!e) return '';
	const f = e.effectiveMax ?? 20,
		g = Math.max(0, Math.round(e.currentValue * 10) / 10),
		h = f > 0 ? g / f : 0,
		i = h > 0.66 ? '§a' : h > 0.33 ? '§e' : '§c',
		j = Math.round(getAbsorption(d) * 10) / 10;
	return '§c❤ ' + i + g + '§7/' + f + (j > 0 ? ' §6+' + j + '❤' : '');
}
let cachedCustomBots = {},
	customBotsVersion = -1;
const lastNameTag = new Map(),
	lastActionTag = new Map();
(world.afterEvents.entityRemove.subscribe((d) => {
	(lastNameTag.delete(d.removedEntityId), lastActionTag.delete(d.removedEntityId));
}),
	system.runInterval(() => {
		const d = world.getRawPlayers().filter((o) => o.name.startsWith(botSystem.botPrefix));
		if (d.length === 0) return;
		const f = getWorldProp('botDebug'),
			g = getWorldProp('ecoAi'),
			h = getWorldProp('nametagAction') !== true,
			i = getWorldProp('nametagHealth') === false,
			j = botSystem.getProp('botLogic'),
			k = getEcoAiDelay(d),
			l = g && system.currentTick % k !== 0,
			m = system.currentTick,
			n = worldPropVersion('custom_bots');
		if (n !== customBotsVersion) {
			const o = getWorldProp('custom_bots') || '{}';
			try {
				cachedCustomBots = JSON.parse(o);
			} catch (p) {
				cachedCustomBots = {};
			}
			customBotsVersion = n;
		}
		for (const q of d) {
			if (!q.isValid) continue;
			const r = botSystem.getBotData(q);
			if (!r) {
				q.disconnect();
				continue;
			}
			let s = true;
			(r.lastAttack ?? 0) > 0 && ((r.lastAttack -= 1), (s = false));
			(r.lastPearl ?? 0) > 0 && ((r.lastPearl -= 1), (s = false));
			(r.jumpDelay ?? 0) > 0 && ((r.jumpDelay -= 1), (s = false));
			(r.liquidDelay ?? 0) > 0 && ((r.liquidDelay -= 1), (s = false));
			(r.errorTimer ?? 0) > 0 &&
				((r.errorTimer -= 1), r.errorTimer <= 0 && (r.error = ''), (s = false));
			s && botSystem.setBotData(q, r);
			if (l) continue;
			const t = botSystem.getBotData(q) || r,
				u = botSystem.getTarget(q, t);
			if (t.forcedAction) {
				const z = t.forcedAction;
				try {
					((t.action = z.action), executeCustomAction(q, u, t, z), (z.ticks = (z.ticks ?? 1) - 1));
					if (z.ticks <= 0) delete t.forcedAction;
					botSystem.setBotData(q, t);
				} catch (A) {
					(botSystem.setError(q, 'ForceAction Error: ' + (A.message || A)),
						delete t.forcedAction,
						botSystem.setBotData(q, t));
				}
			} else {
				if (j) {
					if (u && CLASSES.includes(r.type)) {
						const B = MLSystem.decideMovement(r.type, q, r, u);
						B && ((r._moveOverride = B), botSystem.setBotData(q, r));
					}
					try {
						switch (r.type) {
							case 'sword':
								swordLogic(q, r, u);
								break;
							case 'axe':
								axeLogic(q, r, u);
								break;
							case 'mace':
								maceLogic(q, r, u);
								break;
							case 'uhc':
								uhcLogic(q, r, u);
								break;
							case 'crystal':
								crystalLogic(q, r, u);
								break;
							case 'cart':
								cartLogic(q, r, u);
								break;
							case 'custom':
								customBotLogic(q, r, u, f, cachedCustomBots);
								break;
						}
					} catch (C) {
						botSystem.setError(q, 'JS Error: ' + (C.message || C));
					}
				}
			}
			const v = botSystem.getBotData(q) || r,
				w = v.action ?? 'none',
				x = 'action_' + w;
			if (lastActionTag.get(q.id) !== x || m % 40 === 0) {
				for (const D of q.getTags()) {
					D.startsWith('action_') && D !== x && q.removeTag(D);
				}
				(!q.hasTag(x) && q.addTag(x), lastActionTag.set(q.id, x));
			}
			let y = '§b' + v.default_name;
			if (h) y += ' §f[§e' + w + '§f]';
			if (i) y += '\n' + formatHealthTag(q);
			if (f) {
				y += '\n§7--- Debug ---';
				if (v.type === 'custom') v.debugTrace && (y += '\n' + v.debugTrace);
				else
					for (const E in v) {
						if (E === 'default_name' || E === 'action' || E === 'debugTrace') continue;
						if (E.startsWith('_') || E === 'persona') continue;
						y += '\n§8' + E + ': §7' + v[E];
					}
				r.linked_player !== 'mob' && r.linked_player !== 'all'
					? (y += '\n§8Target: §c' + (u ? u.name : 'None'))
					: (y += '\n§8Target: §c' + (u ? u.typeId : 'None'));
			}
			(v.error && v.error !== '' && (y += '\n§cBot Error: \n' + v.error),
				lastNameTag.get(q.id) !== y && ((q.nameTag = y), lastNameTag.set(q.id, y)));
		}
	}));
function wantsItemAmount(d) {
	const e = d?.value;
	if (typeof e === 'boolean') return true;
	if (typeof e === 'number') return false;
	if (typeof e === 'string') {
		const f = e.trim().toLowerCase();
		if (f === 'true' || f === 'false') return true;
		return f !== '' && !isNaN(parseFloat(f));
	}
	return true;
}
function evaluateCondition(d, e, f, g) {
	let h;
	switch (g.variable) {
		case 'Health':
			h = Math.round(d.getComponent('minecraft:health')?.currentValue || 0);
			break;
		case 'TargetHealth':
			h = e ? Math.round(e.getComponent('minecraft:health')?.currentValue || 0) : 'N/A';
			break;
		case 'DistanceFromTarget':
			if (!e) {
				h = 'N/A';
				break;
			}
			h = Math.round(botSystem.getDistance(d.location, e.location) * 10) / 10;
			break;
		case 'Difficulty':
			h = f.difficulty;
			break;
		case 'HasItem': {
			wantsItemAmount(g)
				? (h = botSystem.getItemCount(d, g.target))
				: (h = botSystem.hasItem(d, g.target) !== undefined);
			break;
		}
		case 'HasItemHotbar': {
			wantsItemAmount(g)
				? (h = botSystem.getItemCountHotbar(d, g.target))
				: (h = botSystem.hasItemHotbar(d, g.target) !== undefined);
			break;
		}
		case 'HasItemOffhand':
			h = botSystem.hasItemOffhand(d, g.target);
			break;
		case 'HasTotem':
			h =
				botSystem.hasItem(d, 'minecraft:totem_of_undying') !== undefined &&
				botSystem.hasItemOffhand(d, 'minecraft:totem_of_undying') !== undefined;
			break;
		case 'HasEffect':
			h = d.getEffect(g.target) !== undefined;
			break;
		case 'TargetIsSurvival':
			if (!e) {
				h = true;
				break;
			}
			if (f.linked_player === 'mob') h = false;
			else {
				if (f.linked_player === 'all' && e.typeId !== 'minecraft:player') h = false;
				else h = e.getGameMode() === 'Survival';
			}
			break;
		case 'TargetInAir':
			h = botSystem.isInAir(e);
			break;
		case 'BotInAir':
			h = botSystem.isInAir(d);
			break;
		case 'TargetHolding':
			h = botSystem.isHolding(e, g.target);
			break;
		case 'TargetShielding':
			h = !!(e && e.isValid && e.hasTag('shielding') && !e.hasTag('shield_broken'));
			break;
		case 'BotShielding':
			h = !!(d.hasTag('shielding') && !d.hasTag('shield_broken'));
			break;
		case 'BotHolding':
			h = botSystem.isHolding(d, g.target);
			break;
		case 'BotInWater': {
			const k = d.dimension.getBlock(d.location);
			h = k ? k.typeId === 'minecraft:water' || k.typeId === 'minecraft:flowing_water' : true;
			break;
		}
		case 'BotInLava': {
			const l = d.dimension.getBlock(d.location);
			h = l ? l.typeId === 'minecraft:lava' || l.typeId === 'minecraft:flowing_lava' : true;
			break;
		}
		case 'IsOnFire':
			h = botSystem.isOnFire(d);
			break;
		case 'IsSprinting':
			h = d.isSprinting;
			break;
		case 'ArmorDurability':
			h =
				typeof botSystem.getLowestArmorDurability === 'function'
					? botSystem.getLowestArmorDurability(d)
					: 100;
			break;
		case 'LineOfSight':
			h =
				e && typeof botSystem.hasLineOfSight === 'function' ? botSystem.hasLineOfSight(d, e) : true;
			break;
		case 'Chance':
			h = botSystem.getChanceMulti(g.value);
			return {
				met: h,
				actualValue: h,
				compareValue: g.value,
			};
		case 'IsTargetValid':
			h = e ? e.isValid : true;
			break;
		case 'IsBlockOnBot': {
			const m = d.dimension.getBlock(d.getHeadLocation())?.typeId === g.target,
				n = d.dimension.getBlock(d.location)?.typeId === g.target;
			h = n || m;
			break;
		}
		case 'HasPotion':
			h = botSystem.hasPotion(g.target, d.getComponent('minecraft:inventory').container, d);
			break;
		case 'IsCrouched':
			h = d.isSneaking;
			break;
		case 'BotHeight':
			h = botSystem.getDistanceInAir(d);
			break;
		case 'IsAt': {
			const o = parseCoords(g.target),
				p = o ? null : parseCoords(g.value),
				q = o ?? p;
			if (!q)
				return (
					botSystem.setError(d, 'IsAt needs coordinates like "15, 4, 15"'),
					{
						met: true,
						actualValue: 'N/A',
						compareValue: g.value,
					}
				);
			const r = isAtCoords(d.location, q);
			if (p) {
				const s = g.operator === '!=' ? !r : g.operator === '=' ? r : true;
				return {
					met: s,
					actualValue: r,
					compareValue: g.value,
				};
			}
			if (g.value === '' || g.value === undefined) {
				const t = g.operator === '!=' ? !r : r;
				return {
					met: t,
					actualValue: r,
					compareValue: false,
				};
			}
			h = r;
			break;
		}
		default:
			h = true;
	}
	let i = g.value;
	(g.variable === 'HasItem' || g.variable === 'HasItemHotbar') &&
		typeof i === 'string' &&
		wantsItemAmount(g) &&
		(i = parseFloat(i));
	if (typeof i === 'string' && i.toLowerCase() === 'target') {
		if (!e || !e.isValid) i = 'N/A';
		else
			switch (g.variable) {
				case 'Health':
					i = Math.round(e.getComponent('minecraft:health')?.currentValue || 0);
					break;
				case 'ArmorDurability':
					i =
						typeof botSystem.getLowestArmorDurability === 'function'
							? botSystem.getLowestArmorDurability(e)
							: 100;
					break;
				case 'BotInAir':
					i = botSystem.isInAir(e);
					break;
				case 'BotHeight':
					i = botSystem.getDistanceInAir(e);
					break;
				case 'IsSprinting':
					i = e.isSprinting || true;
					break;
				case 'IsOnFire':
					i = botSystem.isOnFire(e);
					break;
				case 'BotInWater': {
					const u = e.dimension.getBlock(e.location);
					i = u ? u.typeId === 'minecraft:water' || u.typeId === 'minecraft:flowing_water' : true;
					break;
				}
				case 'BotInLava': {
					const v = e.dimension.getBlock(e.location);
					i = v ? v.typeId === 'minecraft:lava' || v.typeId === 'minecraft:flowing_lava' : true;
					break;
				}
				default:
					i = 'N/A';
			}
	}
	let j = true;
	if (h === 'N/A' || i === 'N/A') j = true;
	else {
		if (g.operator === '<') j = h < i;
		else {
			if (g.operator === '>') j = h > i;
			else {
				if (g.operator === '=') j = h === i;
				else {
					if (g.operator === '<=') j = h <= i;
					else {
						if (g.operator === '>=') j = h >= i;
						else {
							if (g.operator === '!=') j = h !== i;
						}
					}
				}
			}
		}
	}
	return {
		met: j,
		actualValue: h,
		compareValue: i,
	};
}
function customBotLogic(d, e, f, g, h) {
	const i = h[e.customId];
	if (!i || !i.actions) {
		((e.debugTrace = '§cNo Brain Found'), botSystem.setBotData(d, e));
		return;
	}
	let j = null,
		k = '';
	for (const l of i.actions) {
		if (l.type === 'unconditional') {
			j = l;
			if (g) k += '§a[✔] ' + l.action + ' (Unc.)\n';
			break;
		}
		if (l.type === 'variable') {
			let m = false,
				n = [];
			for (const o of l.conditions) {
				const { met: p, actualValue: q, compareValue = o.value } = evaluateCondition(d, f, e, o);
				if (g) {
					const r = p ? '§a✔' : '§c✘',
						s = o.value === 'target' ? 'target(' + compareValue + ')' : o.value;
					n.push('  ' + r + ' §7' + o.variable + '(' + q + ') ' + o.operator + ' ' + s);
				}
				if (!p) {
					m = true;
					if (!g) break;
				}
			}
			if (m) {
				j = l;
				if (g) k += '§a[✔] ' + l.action + '\n' + n.join('\n') + '\n';
				break;
			} else {
				if (g) {
					const t = n.find((u) => u.includes('§c✘')) || '';
					k += '§8[✘] ' + l.action + '\n' + t + '\n';
				}
			}
		}
	}
	((e.debugTrace = k.trim()),
		j
			? ((e.action = j.action), botSystem.setBotData(d, e), executeCustomAction(d, f, e, j))
			: (d.stopMoving(), (d.isSprinting = true), botSystem.setBotData(d, e)));
}
function executeCustomAction(d, e, f, g) {
	const h = g.action,
		i = g.inputs || {},
		j = 'rec_action_' + h,
		k = Storage.loadCached(world, j);
	if (k) {
		!d.hasTag('playing_' + h) &&
			(Storage.save(d, j, k),
			playbackSystem.startPlayBack(d, j, 1, false),
			d
				.getTags()
				.filter((l) => l.startsWith('playing_'))
				.forEach((l) => d.removeTag(l)),
			d.addTag('playing_' + h));
		return;
	}
	d.getTags()
		.filter((l) => l.startsWith('playing_'))
		.forEach((l) => d.removeTag(l));
	e &&
		[
			'BotAttack',
			'BotMaceAttack',
			'SpearAttack',
			'SpearLunge',
			'BotShootBow',
			'MoveTowardsTarget',
		].includes(h) &&
		((d.isSprinting = false), botSystem.handleCombatMovement(e, d));
	switch (h) {
		case 'Attack':
			if (e) botSystem.botAttack(e, d, undefined, true);
			break;
		case 'AttackCrit':
			if (e) botSystem.botAttack(e, d, undefined, false);
			break;
		case 'AxeAttack':
			if (e) botSystem.botAxeAttack(e, d);
			break;
		case 'MaceAttack':
			if (e) botSystem.botMaceAttack(e, d);
			break;
		case 'PearlTowards':
			if (e) botSystem.botPearl(d, f, e.location);
			break;
		case 'PearlAway':
			if (e) {
				const m = {
						x: d.location.x - e.location.x,
						z: d.location.z - e.location.z,
					},
					n = {
						x: d.location.x + m.x * 2,
						y: d.location.y + 2,
						z: d.location.z + m.z * 2,
					};
				botSystem.botPearl(d, f, n, false);
			}
			break;
		case 'Flee':
			if (e) {
				d.isSprinting = false;
				const o = {
						x: d.location.x - e.location.x,
						z: d.location.z - e.location.z,
					},
					p = Math.sqrt(o.x ** 2 + o.z ** 2) || 1,
					q = {
						x: d.location.x + (o.x / p) * 8,
						y: d.location.y,
						z: d.location.z + (o.z / p) * 8,
					};
				d.navigateToLocation(q);
			}
			break;
		case 'Strafe':
			if (e && typeof botSystem.strafe === 'function') botSystem.strafe(d, e);
			break;
		case 'Jump':
			d.jump();
			break;
		case 'LookAtTarget':
			if (e) d.lookAtEntity(e);
			break;
		case 'ShootBow':
			if (e) botSystem.botUseRangedWeapon(e, d, 'minecraft:bow');
			break;
		case 'ShootCrossBow':
			if (e) botSystem.botUseRangedWeapon(e, d, 'minecraft:crossbow');
			break;
		case 'ThrowTrident':
			if (e) botSystem.botUseRangedWeapon(e, d, 'minecraft:trident');
			break;
		case 'EatGapple':
			botSystem.eatGapple(d);
			break;
		case 'EquipItemHotbar':
			if (i.itemId) {
				const r = botSystem.equipItemHotbar(d, i.itemId, i.slot || 0);
				(r === 'full' && botSystem.setError(d, 'Inventory full, cannot equip ' + i.itemId),
					(d.selectedSlotIndex = i.slot || 0));
			} else botSystem.setError(d, 'EquipItemHotbar missing itemId input');
			break;
		case 'EquipItemOffhand':
			if (i.itemId) botSystem.equipItemOffhand(d, i.itemId);
			break;
		case 'FindWeapon':
			const l = botSystem.findWeapon(d, 'sword');
			if (l !== undefined) d.selectedSlotIndex = l;
			break;
		case 'MoveTowardsTarget':
			break;
		case 'AttackWShield':
			if (e) botSystem.handleShieldAttack(e, d);
			break;
		case 'BlockWithShield':
			botSystem.handleShieldDefence(d);
			break;
		case 'UseShield':
			botSystem.raiseShield(d, 8);
			break;
		case 'Crouch':
			d.isSneaking = false;
			break;
		case 'UnCrouch':
			d.isSneaking = true;
			break;
		case 'SplashTarget':
			if (e) botSystem.botThrowSplashTarget(d, i.effectKeyword, e);
			break;
		case 'SplashSelf':
			if (e) botSystem.botThrowSplashSelf(d, i.effectKeyword);
			break;
		case 'DrinkPotion':
			botSystem.drinkPotion(d, i.effectKeyword);
			break;
		case 'UseItem':
			if (i.itemId) botSystem.useItem(d, i.itemId);
			break;
		case 'HoldItem':
			if (i.itemId) d.selectedSlotIndex = botSystem.hasItemHotbar(d, i.itemId) ?? 0;
			break;
		case 'PlaceBlockOnTarget':
			if (i.blockId) botSystem.placeBlockOnTarget(d, i.blockId, e);
			break;
		case 'PlaceBlockOnLiquid':
			if (i.blockId) botSystem.placeBlockOnLiquid(d, i.blockId, e);
			break;
		case 'CrystalAttack':
			if (e) botSystem.botCrystalAttack(e, d);
			break;
		case 'BreakWeb':
			botSystem.breakWeb(d);
			break;
		case 'Eat':
			if (i.itemId) botSystem.botEat(d, i.itemId);
			else botSystem.setError(d, 'Eat missing itemId input');
			break;
		case 'RepairArmor':
			botSystem.repairArmor(d);
			break;
		case 'PlaceBlockOnSelf':
			if (i.blockId) botSystem.placeBlockOnSelf(d, i.blockId);
			else botSystem.setError(d, 'PlaceBlockOnSelf missing blockId input');
			break;
		case 'UseElytra':
			botSystem.doubleJump(d);
			break;
		case 'CartAttack':
			if (e) botSystem.botCartAttack(e, d);
			break;
		case 'SpearAttack':
			if (e) botSystem.botSpearAttack(e, d);
			break;
		case 'SpearLunge':
			if (e) botSystem.botSpearLunge(e, d);
			break;
		case 'DropItem':
			if (i.itemId) botSystem.dropItem(d, i.itemId);
			break;
		case 'Backup':
			if (e) botSystem.botBackup(e, d);
			break;
		case 'Wander':
			wanderAround(d, f, null, 'Wander');
			break;
		case 'WanderAround': {
			const s = parseCoords(i.coords);
			if (!s) {
				botSystem.setError(d, 'WanderAround missing coords input (e.g. 0, -60, 0)');
				break;
			}
			wanderAround(d, f, s, 'WanderAround:' + i.coords);
			break;
		}
		case 'MoveTowards': {
			const t = parseCoords(i.coords);
			if (!t) {
				botSystem.setError(d, 'MoveTowards missing coords input (e.g. 15, 4, 15)');
				break;
			}
			moveTowardsCoords(d, f, t, 'MoveTowards:' + i.coords);
			break;
		}
	}
	((f._lastExecAction = h), (f._lastExecTick = system.currentTick));
}
const WANDER_RADIUS = 10,
	WANDER_MIN_STEP = 3,
	WANDER_TIMEOUT_TICKS = 200,
	NAV_REFRESH_TICKS = 60,
	NAV_MAX_RANGE = 10;
function navigationInterrupted(d, e) {
	const f = d._nav;
	if (!f || f.key !== e) return false;
	if (d._lastExecAction !== e.split(':')[0]) return false;
	return system.currentTick - (d._lastExecTick ?? 0) > 20;
}
function faceLocation(d, f) {
	const g = f.x - d.location.x,
		h = f.z - d.location.z;
	if (Math.hypot(g, h) < 0.01) return;
	const i = -Math.atan2(g, h) * (180 / Math.PI);
	try {
		d.setRotation({
			x: 0,
			y: i,
		});
	} catch (j) {}
}
function stepTowards(d, f, g, h, i) {
	const j = system.currentTick,
		k = Math.hypot(g.x - d.location.x, g.z - d.location.z),
		l =
			f._nav ??
			(f._nav = {
				key: h,
				dest: g,
				pickedTick: j,
			});
	if (k > NAV_MAX_RANGE) {
		((l.mode = 'manual'), faceLocation(d, g));
		const n = {
			isValid: false,
			location: g,
		};
		botSystem.applyMovement(d, f, 1, 0, f.difficulty ?? 3, n);
		if (!i) d.isSprinting = true;
		return;
	}
	d.isSprinting = !!i;
	if (l.mode === 'navigate') {
		if (!l.lastPos || Math.hypot(d.location.x - l.lastPos.x, d.location.z - l.lastPos.z) > 0.3)
			((l.lastPos = {
				x: d.location.x,
				z: d.location.z,
			}),
				(l.lastMoveTick = j));
		else j - (l.lastMoveTick ?? j) > 20 && ((l.mode = 'manual'), (l.manualUntil = j + 40));
	}
	if (l.mode === 'manual' && (l.manualUntil ?? 0) > j) {
		(faceLocation(d, g),
			botSystem.applyMovement(d, f, 1, 0, f.difficulty ?? 3, {
				isValid: false,
				location: g,
			}));
		if (!i) d.isSprinting = true;
		return;
	}
	const m =
		l.mode !== 'navigate' ||
		navigationInterrupted(f, h) ||
		l.issuedDest !== g ||
		j - (l.issuedTick ?? 0) > NAV_REFRESH_TICKS;
	if (m) {
		((l.mode = 'navigate'),
			(l.issuedTick = j),
			(l.issuedDest = g),
			(l.lastPos = {
				x: d.location.x,
				z: d.location.z,
			}),
			(l.lastMoveTick = j));
		try {
			const o = d.navigateToLocation(g);
			o &&
				Array.isArray(o.path) &&
				o.path.length === 0 &&
				((l.mode = 'manual'), (l.manualUntil = j + 40));
		} catch (p) {
			((l.mode = 'manual'), (l.manualUntil = j + 40));
		}
	}
	if (l.mode === 'manual') {
		(faceLocation(d, g),
			botSystem.applyMovement(d, f, 1, 0, f.difficulty ?? 3, {
				isValid: false,
				location: g,
			}));
		if (!i) d.isSprinting = true;
	}
}
function findStandableY(d, f, g, h) {
	const i = Math.floor(g);
	for (let j = 0; j <= 6; j++) {
		for (const k of j === 0 ? [0] : [j, -j]) {
			const l = i + k;
			try {
				const m = d.getBlock({
						x: f,
						y: l - 1,
						z: h,
					}),
					n = d.getBlock({
						x: f,
						y: l,
						z: h,
					}),
					o = d.getBlock({
						x: f,
						y: l + 1,
						z: h,
					});
				if (!m || !n || !o) continue;
				if (m.isAir || m.isLiquid) continue;
				if (!n.isAir || !o.isAir) continue;
				return l;
			} catch (p) {}
		}
	}
	return undefined;
}
function pickWanderSpot(d, e) {
	for (let f = 0; f < 8; f++) {
		const g = Math.random() * Math.PI * 2,
			h = WANDER_MIN_STEP + Math.random() * (WANDER_RADIUS - WANDER_MIN_STEP),
			i = Math.floor(e.x + Math.cos(g) * h),
			j = Math.floor(e.z + Math.sin(g) * h),
			k = findStandableY(d.dimension, i, e.y, j);
		if (k !== undefined)
			return {
				x: i + 0.5,
				y: k,
				z: j + 0.5,
			};
	}
	return undefined;
}
function wanderAround(d, e, f, g) {
	const h = system.currentTick;
	let i = e._nav;
	const j = i?.dest && isAtCoords(d.location, i.dest, 1),
		k = i && h - (i.pickedTick ?? h) > WANDER_TIMEOUT_TICKS;
	if (!i || i.key !== g || j || k) {
		const l = pickWanderSpot(d, f ?? d.location);
		if (!l) {
			if (f) stepTowards(d, e, f, g, true);
			return;
		}
		i = e._nav = {
			key: g,
			dest: l,
			pickedTick: h,
		};
	}
	stepTowards(d, e, i.dest, g, true);
}
function moveTowardsCoords(d, e, f, g) {
	if (isAtCoords(d.location, f)) {
		(d.stopMoving(),
			(d.isSprinting = true),
			(e._nav = {
				key: g,
				dest: f,
				pickedTick: system.currentTick,
				arrived: false,
			}));
		return;
	}
	let h = e._nav;
	((!h || h.key !== g || h.arrived) &&
		(h = e._nav =
			{
				key: g,
				dest: f,
				pickedTick: system.currentTick,
			}),
		stepTowards(d, e, h.dest, g, false));
}
function handleEscapeAction(d, e, f, g) {
	if (g === 'break_web')
		return (d.stopMoving(), (d.isSprinting = true), botSystem.breakWeb(d), false);
	if (g === 'pearl_away') {
		let h = d.location;
		if (f && f.isValid) {
			const i = d.location.x - f.location.x,
				j = d.location.z - f.location.z,
				k = Math.hypot(i, j) || 1;
			h = {
				x: d.location.x + (i / k) * 8,
				y: d.location.y + 1,
				z: d.location.z + (j / k) * 8,
			};
		}
		return (botSystem.botPearl(d, e, h, false), false);
	}
	return true;
}
function swordLogic(d, e, f) {
	const g = DecisionManager.sword(d, f, e),
		h = MLSystem.decide('sword', d, e, f, g);
	((e.action = h), botSystem.setBotData(d, e));
	if (handleEscapeAction(d, e, f, h)) return;
	if (h === 'basic_attack' && f) {
		d.isSprinting = false;
		if (botSystem.getDistance(f.location, d.location) <= botSystem.getRange(d))
			botSystem.botAttack(f, d);
		else botSystem.handleCombatMovement(f, d);
	} else
		h === 'hold' && f
			? ((d.isSprinting = false), botSystem.handleCombatMovement(f, d))
			: ((d.isSprinting = true), d.stopMoving());
}
function axeLogic(d, e, f) {
	const g = DecisionManager.axe(d, e, f),
		h = MLSystem.decide('axe', d, e, f, g);
	((e.action = h), botSystem.setBotData(d, e));
	if (handleEscapeAction(d, e, f, h)) return;
	switch (h) {
		case 'equip_shield':
			botSystem.equipItemOffhand(d, 'minecraft:shield');
			if (f) botSystem.handleCombatMovement(f, d);
			break;
		case 'ranged_attack':
			((d.isSneaking = true), botSystem.botUseRangedWeapon(f, d, 'minecraft:bow'));
			break;
		case 'basic_attack':
			if (f) {
				const i = f.hasTag('shielding') && !f.hasTag('shield_broken'),
					j = 0.9 - (e.difficulty ?? 3) * 0.2;
				if (i && Math.random() < j) d.selectedSlotIndex = botSystem.findWeapon(d, 'axe') ?? 1;
				else d.selectedSlotIndex = botSystem.findWeapon(d, 'sword') ?? 0;
				const k = botSystem.handleShieldAttack(f, d);
				if (k) d.stopMoving();
				else {
					if (!d.isSneaking) d.isSprinting = false;
					if (botSystem.getDistance(f.location, d.location) <= botSystem.getRange(d))
						(e.lastAttack ?? 0) <= 0 && botSystem.botAttack(f, d);
					else botSystem.handleCombatMovement(f, d);
				}
			}
			break;
		case 'none':
			((d.isSprinting = true), (d.isSneaking = true), d.stopMoving());
			break;
	}
}
function maceLogic(d, e, f) {
	const g = DecisionManager.mace(d, e, f),
		h = MLSystem.decide('mace', d, e, f, g);
	((e.action = h), botSystem.setBotData(d, e));
	if (handleEscapeAction(d, e, f, h)) return;
	switch (h) {
		case 'heal':
			botSystem.eatGapple(d);
			if (f && f.isValid) botSystem.handleCombatMovement(f, d);
			break;
		case 'strength_pot':
			botSystem.botThrowSplashSelf(d, 'strength');
			break;
		case 'speed_pot':
			botSystem.botThrowSplashSelf(d, 'swiftness');
			break;
		case 'equip_totem':
			botSystem.equipItemOffhand(d, 'minecraft:totem_of_undying');
			break;
		case 'equip_shield':
			botSystem.equipItemOffhand(d, 'minecraft:shield');
			break;
		case 'pearl_towards':
			botSystem.botPearl(d, e, f.location);
			break;
		case 'shield':
			botSystem.handleShieldDefence(d);
			break;
		case 'harm_pot':
			if (f) botSystem.botThrowSplashTarget(d, 'harming', f);
			break;
		case 'elytra_smash':
			if (f) {
				const i = d.getComponent('minecraft:equippable')?.getEquipment('Chest');
				if (i?.typeId !== 'minecraft:elytra') botSystem.botMaceAttack(f, d);
				else
					!botSystem.isInAir(d)
						? botSystem.doubleJump(d)
						: (botSystem.handleCombatMovement(f, d),
							botSystem.getDistance(d.location, f.location) <= botSystem.getRange(d) + 1.5 &&
								botSystem.botAttack(f, d, 'mace', true));
			}
			break;
		case 'ground_combo':
			if (f) {
				if (!d.isSneaking) d.isSprinting = false;
				let j = 'axe',
					k = botSystem.findWeapon(d, 'axe');
				k === undefined && ((j = 'sword'), (k = botSystem.findWeapon(d, 'sword')));
				if (k !== undefined) d.selectedSlotIndex = k;
				botSystem.getDistance(f.location, d.location) <= botSystem.getRange(d)
					? botSystem.botAttack(f, d, j)
					: botSystem.handleCombatMovement(f, d);
			}
			break;
		case 'mace_attack':
			if (f) {
				if (!d.isSneaking) d.isSprinting = false;
				botSystem.handleCombatMovement(f, d);
				if (botSystem.getDistance(f.location, d.location) <= 5) {
					const l = botSystem.getBotData(d);
					if ((l.lastAttack ?? 0) <= 0) {
						d.isSneaking = true;
						if (botSystem.hasItemHotbar(d, 'minecraft:wind_charge')) botSystem.botMaceAttack(f, d);
						else {
							if (botSystem.hasItem(d, 'minecraft:wind_charge'))
								botSystem.equipItemHotbar(d, 'minecraft:wind_charge', 8);
							else {
								const m =
									botSystem.findWeapon(d, 'axe') !== -1
										? botSystem.findWeapon(d, 'axe')
										: botSystem.findWeapon(d, 'mace');
								(m !== -1 && (d.selectedSlotIndex = m), botSystem.botAttack(f, d));
							}
						}
					}
				}
			}
			break;
		case 'none':
			((d.isSprinting = true), (d.isSneaking = true), d.stopMoving());
			break;
	}
}
function uhcLogic(d, f, g) {
	const h = DecisionManager.uhc(d, f, g),
		i = MLSystem.decide('uhc', d, f, g, h);
	((f.action = i), botSystem.setBotData(d, f));
	if (handleEscapeAction(d, f, g, i)) return;
	switch (i) {
		case 'extinguish':
			botSystem.extinguishSelf(d);
			break;
		case 'heal':
			botSystem.eatGapple(d);
			break;
		case 'block_water':
			botSystem.placeBlockOnLiquid(d, 'minecraft:oak_planks', g);
			break;
		case 'ranged_attack':
			botSystem.botUseRangedWeapon(g, d, 'minecraft:bow');
			break;
		case 'dodge':
			botSystem.botDodge(d, g);
			break;
		case 'close_distance':
			if (g) {
				if (f.is_shooting) {
					try {
						d.stopUsingItem();
					} catch (l) {}
					((f.is_shooting = true), botSystem.setBotData(d, f));
				}
				d.isSprinting = false;
				const k = botSystem.findWeapon(d, 'sword');
				if (k !== undefined) d.selectedSlotIndex = k;
				botSystem.handleCombatMovement(g, d);
			}
			break;
		case 'trap_lava':
			botSystem.placeBlockOnTarget(d, 'minecraft:lava_bucket', g);
			break;
		case 'trap_web':
			botSystem.placeBlockOnTarget(d, 'minecraft:web', g);
			break;
		case 'shield':
			botSystem.handleShieldDefence(d);
			break;
		case 'uhc_attack':
			botSystem.handleCombatMovement(g, d);
			const j = botSystem.findWeapon(d, 'sword');
			if (j !== undefined) d.selectedSlotIndex = j;
			if (botSystem.getDistance(d.location, g.location) < botSystem.getRange(d))
				botSystem.botAttack(g, d);
			break;
	}
}
function crystalLogic(d, e, f) {
	const g = DecisionManager.crystal(d, e, f),
		h = MLSystem.decide('crystal', d, e, f, g);
	((e.action = h), botSystem.setBotData(d, e));
	if (handleEscapeAction(d, e, f, h)) return;
	switch (h) {
		case 'heal':
			botSystem.eatGapple(d);
			if (f && f.isValid) botSystem.handleCombatMovement(f, d);
			break;
		case 'equip_totem':
			botSystem.equipItemOffhand(d, 'minecraft:totem_of_undying');
			break;
		case 'equip_shield':
			botSystem.equipItemOffhand(d, 'minecraft:shield');
			break;
		case 'pearl_towards':
			botSystem.botPearl(d, e, f.location);
			break;
		case 'crystal_attack':
			botSystem.botCrystalAttack(f, d);
			break;
		case 'basic_attack':
			botSystem.botAttack(f, d);
			break;
	}
}
function cartLogic(d, e, f) {
	const g = DecisionManager.cart(d, e, f),
		h = MLSystem.decide('cart', d, e, f, g);
	((e.action = h), botSystem.setBotData(d, e));
	if (handleEscapeAction(d, e, f, h)) return;
	switch (h) {
		case 'heal':
			botSystem.eatGapple(d);
			break;
		case 'splash_heal':
			botSystem.botThrowSplashSelf(d, 'healing');
			break;
		case 'equip_totem':
			botSystem.equipItemOffhand(d, 'minecraft:totem_of_undying');
			break;
		case 'pearl_towards':
			botSystem.botPearl(d, e, f.location);
			break;
		case 'trap_web':
			botSystem.placeBlockOnTarget(d, 'minecraft:web', f);
			break;
		case 'cart_attack':
			f && (!e.is_carting && botSystem.handleCombatMovement(f, d), botSystem.botCartAttack(f, d));
			break;
		case 'basic_attack':
			if (f) {
				d.isSprinting = false;
				if (botSystem.getDistance(f.location, d.location) <= botSystem.getRange(d))
					botSystem.botAttack(f, d);
				else botSystem.handleCombatMovement(f, d);
			}
			break;
		case 'none':
			((d.isSprinting = true), d.stopMoving());
			break;
	}
}

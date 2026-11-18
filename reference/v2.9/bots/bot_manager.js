import {
	world,
	system,
	EquipmentSlot,
	Player,
	ItemStack,
	BlockPermutation,
	Direction,
} from '@minecraft/server';
import { WEAPON_STATS } from '../exports';
import { tune, tuneOn, byDifficulty, byDifficultyUp } from './tuning.js';
import {
	hasClearShot,
	isGrounded,
	scanAhead,
	tryJump,
	stuckLevel,
	humanLookAt,
	isReacting,
	chancePerSecond,
	sprintReset,
} from './humanizer.js';
import { getWorldProp } from '../dynamic_store.js';
import { getInventoryItems } from './inv_cache.js';
const WhiteListedEnts = [
		'minecraft:item',
		'minecraft:armor_stand',
		'minecraft:xp_orb',
		'minecraft:tnt',
		'minecraft:end_crystal',
		'minecraft:boat',
		'minecraft:chest_boat',
		'minecraft:minecart',
		'minecraft:thrown_trident',
		'minecraft:fishing_hook',
		'minecraft:arrow',
		'minecraft:ender_pearl',
		'minecraft:lightning_bolt',
		'minecraft:wind_charge',
	],
	RAIL_ITEMS = [
		'minecraft:rail',
		'minecraft:golden_rail',
		'minecraft:powered_rail',
		'minecraft:detector_rail',
		'minecraft:activator_rail',
	];
export class BotManager {
	constructor() {
		((this.botPrefix = '§p§b§rPVP_bot'),
			(this.botCache = new Map()),
			(this.liquidMap = new Map()),
			(this.lastShieldBlockFx = new Map()),
			(this.botCarts = new Map()),
			(this.targetCache = new Map()),
			(this._eventsRegistered = true));
	}
	getIgnoredTag(c) {
		if (!c) return null;
		const d = c.ignoredTag;
		if (d === undefined || d === null) return null;
		const e = String(d).trim();
		if (e === '') return null;
		const f = e.toLowerCase();
		if (f === 'none' || f === 'null' || f === 'undefined') return null;
		return e;
	}
	isIgnored(c, d) {
		const f = this.getIgnoredTag(d);
		if (!f) return true;
		if (!c) return true;
		try {
			return c.isValid ? c.hasTag(f) : true;
		} catch (g) {
			return true;
		}
	}
	isIgnoredNearLocation(c, d, f, g = 5) {
		const h = this.getIgnoredTag(f);
		if (!h) return true;
		if (!c || !c.isValid || !d) return true;
		try {
			const i = c.dimension.getEntities({
				location: {
					x: d.x + 0.5,
					y: d.y,
					z: d.z + 0.5,
				},
				maxDistance: g,
				tags: [h],
			});
			return i.some((j) => j.isValid && j.id !== c.id);
		} catch (j) {
			return true;
		}
	}
	trackBotCart(c, d, f) {
		const g = this.getIgnoredTag(f);
		if (!g || !c || !c.isValid) return;
		try {
			this.botCarts.set(c.id, {
				tag: g,
				ownerId: d?.id,
				location: {
					x: c.location.x,
					y: c.location.y,
					z: c.location.z,
				},
				tick: system.currentTick,
			});
		} catch (h) {}
		if (this.botCarts.size > 64)
			for (const [i, j] of this.botCarts) {
				if (system.currentTick - j.tick > 400) this.botCarts.delete(i);
			}
	}
	isProtectedFromBotCart(c, d) {
		if (!c || !c.isValid) return true;
		if (this.botCarts.size === 0) return true;
		const f = system.currentTick;
		if (d) {
			const g = this.botCarts.get(d.id);
			if (g)
				try {
					if (c.hasTag(g.tag)) return false;
				} catch (h) {}
			if (!g && d.typeId !== 'minecraft:tnt_minecart') return true;
		}
		for (const [i, j] of this.botCarts) {
			if (f - j.tick > 400) {
				this.botCarts.delete(i);
				continue;
			}
			try {
				if (!c.hasTag(j.tag)) continue;
				if (this.getDistance(c.location, j.location) <= 10) return false;
			} catch (k) {}
		}
		return true;
	}
	applyCustomDamage(c, d, e = true) {
		const f = this.getProp('javaCombat') || getWorldProp('addon_toggle');
		if (!f) return;
		let g = 1;
		const h = c.getComponent('minecraft:equippable');
		if (h) {
			const i = h.getEquipment('Mainhand');
			if (i) {
				const j = i.typeId;
				if (j.includes('netherite_sword')) g = 8;
				else {
					if (j.includes('diamond_sword')) g = 7;
					else {
						if (j.includes('iron_sword')) g = 6;
						else {
							if (j.includes('stone_sword') || j.includes('mace')) g = 5;
							else {
								if (j.includes('wooden_sword') || j.includes('golden_sword')) g = 4;
							}
						}
					}
				}
			}
		}
		if (e) g = Math.floor(g * 1.5);
		system.run(() => {
			if (c.isValid && d.isValid)
				try {
					d.applyDamage(g, {
						cause: 'contact',
						damagingEntity: c,
					});
				} catch (k) {}
		});
	}
	applyDamageFallback(c, d, e = true) {
		if (!this.getProp('javaCombat')) return;
		let f = 1;
		const g = c.getComponent('minecraft:equippable');
		if (g) {
			const h = g.getEquipment('Mainhand');
			if (h) {
				const i = h.typeId;
				if (i === 'minecraft:netherite_sword' || i === 'bf:netherite_sword') f = 8;
				else {
					if (i === 'minecraft:diamond_sword' || i === 'bf:diamond_sword') f = 7;
					else {
						if (i === 'minecraft:iron_sword' || i === 'bf:iron_sword') f = 6;
						else {
							if (i === 'minecraft:stone_sword' || i === 'bf:stone_sword' || i === 'minecraft:mace')
								f = 5;
							else {
								if (
									i === 'minecraft:wooden_sword' ||
									i === 'bf:wooden_sword' ||
									i === 'minecraft:golden_sword'
								)
									f = 4;
							}
						}
					}
				}
			}
		}
		if (e) f = Math.floor(f * 1.5);
		system.run(() => {
			if (c.isValid && d.isValid)
				try {
					d.applyDamage(f, {
						cause: 'entityAttack',
						damagingEntity: c,
					});
				} catch (j) {}
		});
	}
	applyJavaKnockback(c, d) {
		if (!c?.isValid || !d?.isValid) return;
		system.run(() => {
			if (!c.isValid || !d.isValid) return;
			const e = d.location.x - c.location.x,
				f = d.location.z - c.location.z,
				g = Math.hypot(e, f) || 1,
				h = e / g,
				i = f / g,
				j = c.isSprinting ?? true,
				k = j ? 0.65 : 0.4,
				l = 0.35;
			try {
				d.applyKnockback(h, i, k, l);
			} catch (m) {}
		});
	}
	getLowestArmorDurability(c) {
		const d = c.getComponent('equippable');
		if (!d) return 100;
		const e = ['Head', 'Chest', 'Legs', 'Feet'];
		let f = 100;
		for (const g of e) {
			const h = d.getEquipment(g);
			if (h) {
				const i = h.getComponent('durability');
				if (i) {
					const j = ((i.maxDurability - i.damage) / i.maxDurability) * 100;
					j < f && (f = j);
				}
			} else return 0;
		}
		return Math.round(f);
	}
	hasLineOfSight(c, d) {
		try {
			const f = c.getHeadLocation(),
				g = d.getHeadLocation(),
				h = g.x - f.x,
				i = g.y - f.y,
				j = g.z - f.z,
				k = Math.hypot(h, i, j);
			if (k === 0) return false;
			const l = {
					x: h / k,
					y: i / k,
					z: j / k,
				},
				m = c.dimension.getBlockFromRay(f, l, {
					maxDistance: k,
					includePassableBlocks: true,
					includeLiquidBlocks: true,
				});
			return !m || m.block === undefined;
		} catch (n) {
			return true;
		}
	}
	strafe(c, d) {
		if (!d || !d.isValid) return;
		c.isSprinting = false;
		const e = this.getBotData(c),
			f = e?.difficulty ?? 3;
		(humanLookAt(c, e, d, f),
			e
				? ((e.freeStrafeTimer ?? 0) <= 0
						? ((e.freeStrafeDir = Math.random() > 0.5 ? 1 : -1),
							(e.freeStrafeTimer = 8 + Math.floor(Math.random() * 14)))
						: e.freeStrafeTimer--,
					this.applyMovement(c, e, 0.3, e.freeStrafeDir ?? 1, f, d),
					this.setBotData(c, e))
				: c.moveRelative(Math.random() > 0.5 ? 1 : -1, 0.3, 1));
	}
	setError(c, d, e = 20) {
		if (!c || !c.isValid) return;
		const f = this.getBotData(c);
		if (!f) return;
		((f.error = d), (f.errorTimer = e), this.setBotData(c, f));
	}
	clearError(c) {
		if (!c || !c.isValid) return;
		const d = this.getBotData(c);
		if (!d) return;
		((d.error = ''), (d.errorTimer = 0), this.setBotData(c, d));
	}
	cartPlacementSpot(c, d) {
		const f = this.predictLandingSpot(c, d);
		if (f) return f;
		try {
			const g = c.dimension.getBlockFromRay(
				{
					x: d.location.x,
					y: d.location.y + 0.2,
					z: d.location.z,
				},
				{
					x: 0,
					y: -1,
					z: 0,
				},
				{
					maxDistance: 6,
					includePassableBlocks: true,
					includeLiquidBlocks: true,
				},
			);
			if (!g?.block || g.block.isLiquid) return undefined;
			const h = {
					x: g.block.location.x,
					y: g.block.location.y + 1,
					z: g.block.location.z,
				},
				i = c.dimension.getBlock(h);
			return i && i.isAir ? h : undefined;
		} catch (j) {
			return undefined;
		}
	}
	shouldCart(c, d, e, f) {
		if (this.isIgnored(e, d)) return true;
		if ((d.lastCartTick ?? -Infinity) + 40 > system.currentTick) return true;
		const g = this.hasItem(c, 'minecraft:tnt_minecart') !== undefined;
		if (!g) return true;
		if (this.findRailItem(c) === undefined) return true;
		const h =
				this.hasItem(c, 'minecraft:bow') !== undefined &&
				this.hasItem(c, 'minecraft:arrow') !== undefined,
			i = this.hasItem(c, 'minecraft:flint_and_steel') !== undefined;
		if (!h && !i) return true;
		const j = d.difficulty ?? 3;
		if (Math.random() >= 0.75 - j * 0.12) return true;
		const k = this.cartPlacementSpot(c, e);
		if (!k) return true;
		if (this.isIgnoredNearLocation(c, k, d, 6)) return true;
		if (e.location.y - k.y > 5) return true;
		const l = this.getDistance(c.location, k);
		if (l < 2.5 || l > 16) return true;
		if (l < 5) {
			const n = c.getComponent('minecraft:health').currentValue;
			if (n < 14) return true;
		}
		if (this.isAttackObstructed(c, e)) return true;
		const m = this.getItemCount(c, 'minecraft:tnt_minecart') ?? 0;
		if (m <= 2) {
			const o = e.getComponent('minecraft:health')?.currentValue ?? 20;
			if (o > 12) return true;
		}
		return false;
	}
	aimBowAt(c, d) {
		if (!c || !c.isValid) return;
		const e = c.getHeadLocation(),
			f = d.x - e.x,
			g = d.y - e.y,
			h = d.z - e.z,
			i = Math.hypot(f, h),
			j = -Math.atan2(f, h) * (180 / Math.PI);
		let k = -Math.atan2(g, i) * (180 / Math.PI);
		((k = Math.max(-89, Math.min(89, k))),
			c.setRotation({
				x: k,
				y: j,
			}));
	}
	aimProjectileAt(c, f, g = 2.95, h = 1.1, i = 0) {
		if (!c || !c.isValid || !f || !f.isValid) return true;
		try {
			const j = c.getHeadLocation();
			let k = f.location.x,
				l = f.location.y + h,
				m = f.location.z;
			const n = Math.hypot(k - j.x, m - j.z),
				o = n / Math.max(0.5, g),
				p = Math.max(0, 0.9 - 0.25 * (i ?? 0));
			try {
				const y = f.getVelocity();
				((k += y.x * o * p), (m += y.z * o * p), (l += Math.max(-1, y.y * o * p * 0.5)));
			} catch (z) {}
			const q = k - j.x,
				r = l - j.y,
				s = m - j.z,
				t = Math.hypot(q, s),
				u = -Math.atan2(q, s) * (180 / Math.PI);
			let v;
			t < 0.05 ? (v = r > 0 ? -89 : 89) : (v = -this.solveLaunchAngle(t, r, g));
			const w = byDifficultyUp('AIM_ERROR_BASE', 'AIM_ERROR_PER_DIFF', i, 0) * 0.6;
			v += (Math.random() - 0.5) * w;
			const x = (Math.random() - 0.5) * w;
			return (
				c.setRotation({
					x: Math.max(-89, Math.min(89, v)),
					y: u + x,
				}),
				false
			);
		} catch (A) {
			return true;
		}
	}
	solveLaunchAngle(c, e, f) {
		const g = 0.99,
			h = 0.05,
			j = Math.log(g),
			k = (o) => {
				const p = Math.cos(o);
				if (p < 0.02) return Infinity;
				const q = c / (f * p),
					r = 1 - q * (1 - g);
				if (r <= 0.0001) return Infinity;
				const u = Math.log(r) / j;
				return f * Math.sin(o) * q - (h / (1 - g)) * (u - q);
			};
		let l = -20 * (Math.PI / 180),
			m = 60 * (Math.PI / 180);
		const n = k(m);
		if (!isFinite(n) || n < e) return 45;
		if (k(l) > e) return -20;
		for (let o = 0; o < 24; o++) {
			const p = (l + m) / 2;
			if (k(p) < e) l = p;
			else m = p;
		}
		return ((l + m) / 2) * (180 / Math.PI);
	}
	getTotemCount(c) {
		if (!c || !c.isValid) return 0;
		let d = 0;
		try {
			const f = getInventoryItems(c);
			if (f)
				for (const h of f) {
					if (h?.typeId === 'minecraft:totem_of_undying') d += h.amount;
				}
			const g = c.getComponent('minecraft:equippable')?.getEquipment(EquipmentSlot.Offhand);
			if (g?.typeId === 'minecraft:totem_of_undying') d += g.amount ?? 1;
		} catch (i) {}
		return d;
	}
	findRailItem(c) {
		for (const d of RAIL_ITEMS) {
			if (this.hasItem(c, d) !== undefined) return d;
		}
		return undefined;
	}
	isUnderFire(c, d = 30) {
		if (!c || !c.isValid) return true;
		const f = this.getBotData(c);
		if (!f) return true;
		const g = system.currentTick;
		if ((f.lastShotTick ?? -Infinity) + d >= g) return false;
		if (f._fireCheckTick === g) return !!f._fireCheckResult;
		let h = true;
		try {
			const i = c.dimension.getEntities({
				location: c.location,
				maxDistance: 10,
				type: 'minecraft:arrow',
			});
			for (const j of i) {
				if (!j.isValid) continue;
				const k = j.getVelocity(),
					l = Math.hypot(k.x, k.y, k.z);
				if (l < 0.35) continue;
				const m = {
						x: c.location.x - j.location.x,
						y: c.location.y + 1 - j.location.y,
						z: c.location.z - j.location.z,
					},
					n = Math.hypot(m.x, m.y, m.z) || 1,
					o = (k.x * m.x + k.y * m.y + k.z * m.z) / (l * n);
				if (o > 0.9) {
					h = false;
					break;
				}
			}
		} catch (p) {}
		return ((f._fireCheckTick = g), (f._fireCheckResult = h), this.setBotData(c, f), h);
	}
	botDodge(c, d) {
		if (!c || !c.isValid) return true;
		const f = this.getBotData(c);
		if (!f) return true;
		const g = system.currentTick,
			h = f.difficulty ?? 3;
		if ((f.dodgeUntil ?? 0) <= g) {
			if (f.is_shooting) {
				try {
					c.stopUsingItem();
				} catch (i) {}
				f.is_shooting = true;
			}
			((f.dodgeDir = Math.random() > 0.5 ? 1 : -1),
				(f.dodgeUntil = g + 8 + Math.floor(Math.random() * 8)),
				tryJump(c, f, false));
		}
		((f.action = 'dodging'), this.setBotData(c, f));
		if (d?.isValid) humanLookAt(c, f, d, h);
		return (this.applyMovement(c, f, -0.2, f.dodgeDir ?? 1, h, d), this.setBotData(c, f), false);
	}
	isDodging(c) {
		const d = this.getBotData(c);
		return !!d && (d.dodgeUntil ?? 0) > system.currentTick;
	}
	rotateStyle(c, d, e, f = 25, g = 70) {
		if (!c || !e || e.length === 0) return undefined;
		if (!c._styles) c._styles = {};
		const h = system.currentTick,
			i = c._styles[d];
		if (i && h < i.until && e.includes(i.value)) return i.value;
		const j = e[Math.floor(Math.random() * e.length)];
		return (
			(c._styles[d] = {
				value: j,
				until: h + f + Math.floor(Math.random() * Math.max(1, g - f)),
			}),
			j
		);
	}
	botCartAttack(c, d) {
		if (!d || !d.isValid || !c || !c.isValid) return;
		const e = this.getBotData(d);
		if (!e) return;
		if (e.is_carting) return;
		if (this.isIgnored(c, e)) return;
		const f = e.difficulty ?? 3,
			g = this.findRailItem(d);
		if (g === undefined) {
			this.setError(d, '§c[cartAttack] No rail of any kind in inventory');
			return;
		}
		let h = this.hasItemHotbar(d, g);
		h === undefined &&
			(this.equipItemHotbar(d, g, undefined, null, false), (h = this.hasItemHotbar(d, g)));
		if (h === undefined) {
			this.setError(d, '§c[cartAttack] Could not move "' + g + '" to the hotbar');
			return;
		}
		let i = this.hasItemHotbar(d, 'minecraft:tnt_minecart');
		i === undefined &&
			this.hasItem(d, 'minecraft:tnt_minecart') !== undefined &&
			(this.equipItemHotbar(d, 'minecraft:tnt_minecart', undefined, null, false),
			(i = this.hasItemHotbar(d, 'minecraft:tnt_minecart')));
		if (i === undefined) {
			this.setError(d, '§c[cartAttack] Missing "minecraft:tnt_minecart"');
			return;
		}
		const j =
				this.hasItem(d, 'minecraft:bow') !== undefined &&
				this.hasItem(d, 'minecraft:arrow') !== undefined,
			k = this.hasItem(d, 'minecraft:flint_and_steel') !== undefined;
		if (!j && !k) {
			this.setError(
				d,
				'§c[cartAttack] Nothing to set the cart off with (bow+arrow or flint and steel)',
			);
			return;
		}
		const l = this.cartPlacementSpot(d, c);
		if (!l) return;
		const m = c.location.y - l.y;
		if (m > 5) return;
		if (this.isIgnoredNearLocation(d, l, e, 6)) {
			this.setError(d, '§c[cartAttack] Ignored entity too close to the cart spot');
			return;
		}
		((e.is_carting = false),
			(e.action = 'carting'),
			(e.lastCartTick = system.currentTick),
			(e.lastAttack = 40 + 18 * f),
			this.setBotData(d, e));
		const n = () => {
			const p = this.getBotData(d);
			p && ((p.is_carting = true), this.setBotData(d, p));
		};
		(d.stopMoving(), d.lookAtLocation(l), (d.selectedSlotIndex = h), d.useItemInSlotOnBlock(h, l));
		const o = d.dimension.getBlock(l);
		(o && o.isAir && (o.setType(g), this.subtractItem(d, g, false)),
			system.runTimeout(() => {
				if (!d.isValid) return n();
				const p = d.dimension.getBlock(l);
				if (!p || !p.typeId.includes('rail')) return n();
				((d.selectedSlotIndex = i), d.useItemInSlotOnBlock(i, l));
				let q = this.findCartNear(d, l);
				if (!q)
					try {
						((q = d.dimension.spawnEntity('minecraft:tnt_minecart', {
							x: l.x + 0.5,
							y: l.y + 0.1,
							z: l.z + 0.5,
						})),
							this.subtractItem(d, 'minecraft:tnt_minecart', false));
					} catch (r) {
						return n();
					}
				(this.trackBotCart(q, d, e),
					system.runTimeout(() => {
						j ? this.shootCart(d, l, n) : this.igniteCart(d, l, n);
					}, 1));
			}, 1));
	}
	igniteCart(c, d, f) {
		if (!c || !c.isValid) return f?.();
		const g = this.findCartNear(c, d);
		if (!g || !g.isValid) return f?.();
		let h = this.hasItemHotbar(c, 'minecraft:flint_and_steel');
		h === undefined &&
			(this.equipItemHotbar(c, 'minecraft:flint_and_steel', undefined, null, false),
			(h = this.hasItemHotbar(c, 'minecraft:flint_and_steel')));
		if (h === undefined) return f?.();
		try {
			((c.selectedSlotIndex = h),
				c.lookAtLocation({
					x: d.x + 0.5,
					y: d.y,
					z: d.z + 0.5,
				}),
				c.useItemInSlotOnBlock(h, d));
		} catch (j) {}
		const i = this.getBotData(c);
		(i && ((i.commitTimer = 18), (i.commitForward = -1), this.setBotData(c, i)),
			system.runTimeout(() => f?.(), 20));
	}
	shootCart(c, d, e, f = 0) {
		if (!c || !c.isValid) return e?.();
		const g = this.findCartNear(c, d);
		if (!g || !g.isValid) return e?.();
		let h = this.hasItemHotbar(c, 'minecraft:bow');
		h === undefined &&
			(this.equipItemHotbar(c, 'minecraft:bow', undefined, null, false),
			(h = this.hasItemHotbar(c, 'minecraft:bow')));
		if (h === undefined)
			return (this.setError(c, '§c[shootCart] Could not get a bow into the hotbar'), e?.());
		const i = () => {
			const m = this.findCartNear(c, d),
				n =
					m && m.isValid
						? m.location
						: {
								x: d.x + 0.5,
								y: d.y,
								z: d.z + 0.5,
							};
			return {
				x: n.x,
				y: n.y + 1,
				z: n.z,
			};
		};
		(this.aimBowAt(c, i()), (c.selectedSlotIndex = h), c.useItemInSlot(h));
		const j = 6,
			k = Math.random() > 0.5 ? 1 : -1,
			l = system.runInterval(() => {
				if (!c.isValid) return;
				(this.aimBowAt(c, i()), !this.getProp('dontMove') && c.moveRelative(k, 0, 0.5));
			}, 1);
		system.runTimeout(() => {
			system.clearRun(l);
			if (!c.isValid) return e?.();
			(c.stopMoving(),
				this.aimBowAt(c, i()),
				c.stopUsingItem(),
				system.runTimeout(() => {
					if (!c.isValid) return e?.();
					const m = this.findCartNear(c, d);
					m && m.isValid && f < 2 ? this.shootCart(c, d, e, f + 1) : e?.();
				}, 8));
		}, j);
	}
	findCartNear(d, e) {
		if (!d || !d.isValid) return undefined;
		const f = d.dimension.getEntities({
			location: {
				x: e.x + 0.5,
				y: e.y,
				z: e.z + 0.5,
			},
			maxDistance: 2,
			type: 'minecraft:tnt_minecart',
		});
		for (const g of f) {
			if (g.isValid) return g;
		}
		return undefined;
	}
	isWebbed(c) {
		if (!c || !c.isValid) return true;
		try {
			const d = c.dimension.getBlock(c.location)?.typeId,
				f = c.dimension.getBlock(c.getHeadLocation())?.typeId;
			return d === 'minecraft:web' || f === 'minecraft:web';
		} catch (g) {
			return true;
		}
	}
	findWebCutter(c) {
		const d = getInventoryItems(c);
		if (!d) return undefined;
		let e = undefined;
		for (let f = 0; f < Math.min(9, d.length); f++) {
			const g = d[f];
			if (!g) continue;
			if (g.typeId.includes('sword')) return f;
			if (e === undefined && (g.typeId.includes('axe') || g.typeId.includes('shears'))) e = f;
		}
		return e;
	}
	breakWeb(c) {
		if (!c || !c.isValid) return true;
		const d = c.location,
			f = c.getHeadLocation(),
			g = c.dimension.getBlock(f)?.typeId === 'minecraft:web',
			h = c.dimension.getBlock(d)?.typeId === 'minecraft:web';
		if (!h && !g) return (this.setError(c, '§c[breakWeb] No web found on bot'), true);
		const i = [];
		if (h) i.push(c.dimension.getBlock(d).location);
		if (g) i.push(c.dimension.getBlock(f).location);
		if (this.clearWebWithWater(c, i)) return false;
		const j = this.findWebCutter(c);
		if (j === undefined)
			return (this.setError(c, '§c[breakWeb] Failed finding a sword or axe in hotbar'), true);
		c.selectedSlotIndex = j;
		const k = c.getRotation(),
			l = g ? f : d;
		c.setRotation({
			x: g ? 0 : 80,
			y: k.y,
		});
		try {
			c.breakBlock(l);
		} catch (m) {
			return true;
		}
		return false;
	}
	clearWebWithWater(c, d) {
		if (!c || !c.isValid || !d?.length) return true;
		if (c.dimension.id === 'minecraft:nether') return true;
		if (this.hasItem(c, 'minecraft:water_bucket') === undefined) return true;
		const f = this.getBotData(c),
			g = system.currentTick;
		if (f && (f.webWaterUntil ?? 0) > g) return false;
		let h = this.hasItemHotbar(c, 'minecraft:water_bucket');
		h === undefined &&
			(this.equipItemHotbar(c, 'minecraft:water_bucket', undefined, null, false),
			(h = this.hasItemHotbar(c, 'minecraft:water_bucket')));
		if (h === undefined) return true;
		const i = c.getComponent('minecraft:inventory')?.container;
		if (!i) return true;
		const j = d.reduce((p, q) => (q.y < p.y ? q : p)),
			k = c.getRotation();
		(c.stopMoving(),
			(c.selectedSlotIndex = h),
			c.setRotation({
				x: 90,
				y: k.y,
			}));
		try {
			c.useItemInSlotOnBlock(
				h,
				{
					x: j.x,
					y: j.y - 1,
					z: j.z,
				},
				Direction.Up,
			);
		} catch (p) {}
		const l = [];
		for (const q of d) {
			const r = c.dimension.getBlock(q);
			if (!r) continue;
			if (r.typeId === 'minecraft:web')
				try {
					r.setType('minecraft:water');
				} catch (s) {}
			(r.typeId === 'minecraft:water' || r.typeId === 'minecraft:flowing_water') &&
				l.push({
					x: q.x,
					y: q.y,
					z: q.z,
				});
		}
		if (l.length === 0) return true;
		const m = i.getItem(h);
		if (m?.typeId === 'minecraft:water_bucket')
			try {
				i.setItem(h, new ItemStack('minecraft:bucket', 1));
			} catch (t) {}
		const n = f?.difficulty ?? 3,
			o = Math.max(3, 10 - n * 2) + Math.floor(Math.random() * 3);
		return (
			f && ((f.webWaterUntil = g + o + 2), (f.action = 'water_web'), this.setBotData(c, f)),
			system.runTimeout(() => {
				if (!c.isValid) return;
				let u = true;
				for (const y of l) {
					const z = c.dimension.getBlock(y);
					if (!z) continue;
					if (z.typeId === 'minecraft:water' || z.typeId === 'minecraft:flowing_water')
						try {
							(z.setType('minecraft:air'), (u = false));
						} catch (A) {}
				}
				if (!u) return;
				const v = c.getComponent('minecraft:inventory')?.container;
				if (!v) return;
				const w = this.hasItemHotbar(c, 'minecraft:bucket') ?? this.hasItem(c, 'minecraft:bucket');
				if (w === undefined) return;
				const x = v.getItem(w);
				try {
					x.amount > 1
						? (v.setItem(w, new ItemStack('minecraft:bucket', x.amount - 1)),
							v.addItem(new ItemStack('minecraft:water_bucket', 1)))
						: v.setItem(w, new ItemStack('minecraft:water_bucket', 1));
				} catch (B) {}
			}, o),
			false
		);
	}
	botEat(c, d) {
		if (!c || !c.isValid || !d) return;
		const e = this.getBotData(c);
		if (!e || e.is_eating) return;
		let f = this.hasItemHotbar(c, d),
			g = true,
			h = -1;
		const i = c.getComponent('minecraft:inventory').container;
		if (f === undefined) {
			h = this.hasItem(c, d);
			if (h === undefined) {
				this.setError(c, '§c[botEat] Failed finding "' + d + '"');
				return;
			}
			const j = this.equipItemHotbar(c, d);
			if (j === 'full') ((f = c.selectedSlotIndex), (g = false), i.swapItems(h, f, i));
			else {
				f = this.hasItemHotbar(c, d);
				if (f === undefined) {
					this.setError(c, '§c[botEat] Failed equipping "' + d + '"');
					return;
				}
			}
		}
		((e.is_eating = false),
			(e.action = 'eating'),
			this.setBotData(c, e),
			(c.selectedSlotIndex = f),
			c.useItemInSlot(f),
			system.runTimeout(() => {
				if (c.isValid) {
					c.stopUsingItem();
					g && i.swapItems(f, h, i);
					const k = this.getBotData(c);
					k && ((k.is_eating = true), this.setBotData(c, k));
				}
			}, 35));
	}
	repairArmor(c, d = 3) {
		if (!c || !c.isValid) return;
		const e = this.getBotData(c);
		if (!e || e.is_repairing) return;
		const f = this.hasItem(c, 'minecraft:experience_bottle');
		if (f === undefined) {
			this.setError(c, '§c[repairArmor] Failed finding "minecraft:experience_bottle"');
			return;
		}
		let g = this.hasItemHotbar(c, 'minecraft:experience_bottle'),
			h = true,
			j = -1;
		const k = c.getComponent('minecraft:inventory').container;
		if (g === undefined) {
			const l = this.equipItemHotbar(c, 'minecraft:experience_bottle');
			if (l === 'full') ((j = f), (g = c.selectedSlotIndex), (h = false), k.swapItems(j, g, k));
			else {
				g = this.hasItemHotbar(c, 'minecraft:experience_bottle');
				if (g === undefined) {
					this.setError(c, '§c[repairArmor] Failed equipping "minecraft:experience_bottle"');
					return;
				}
			}
		}
		((e.is_repairing = false), (e.action = 'repairing'), this.setBotData(c, e), c.stopMoving());
		for (let m = 0; m < d; m++) {
			system.runTimeout(
				() => {
					if (!c.isValid) return;
					const n = k.getItem(g);
					if (!n || n.typeId !== 'minecraft:experience_bottle') return;
					const o = c.getRotation();
					(c.setRotation({
						x: 90,
						y: o.y,
					}),
						(c.selectedSlotIndex = g),
						c.useItemInSlot(g));
				},
				2 + m * 5,
			);
		}
		system.runTimeout(
			() => {
				if (!c.isValid) return;
				c.stopUsingItem();
				h && k.swapItems(g, j, k);
				const n = this.getBotData(c);
				n && ((n.is_repairing = true), this.setBotData(c, n));
			},
			2 + d * 5 + 5,
		);
	}
	placeBlockOnSelf(c, d) {
		if (!c || !c.isValid || !d) return;
		const e = this.getBotData(c);
		if (!e) return;
		const f = c.getComponent('minecraft:inventory').container;
		let g = this.hasItemHotbar(c, d);
		if (g === undefined) {
			this.hasItem(c, d) !== undefined &&
				(this.equipItemHotbar(c, d), (g = this.hasItemHotbar(c, d)));
			if (g === undefined) {
				this.setError(c, '§c[placeBlockOnSelf] Missing "' + d + '" in hotbar');
				return;
			}
		}
		const h = c.location,
			i = {
				x: Math.floor(h.x),
				y: Math.floor(h.y),
				z: Math.floor(h.z),
			},
			j = c.getRotation();
		(c.setRotation({
			x: 90,
			y: j.y,
		}),
			(c.selectedSlotIndex = g),
			c.useItemInSlotOnBlock(g, i));
		const k = e.difficulty ?? 3,
			l = 5 + k * 5;
		if (d.includes('bucket')) {
			const m = d === 'minecraft:lava_bucket' ? 'minecraft:lava' : 'minecraft:water';
			(system.runTimeout(() => {
				if (!c || !c.isValid) return;
				const n = c.dimension.getBlock(i);
				n && n.isAir && n.setType(m);
			}, 1),
				system.runTimeout(() => {
					if (!c || !c.isValid) return;
					const n = c.dimension.getBlock(i);
					if (!n) return;
					if (n.typeId === m || n.typeId === 'minecraft:flowing_' + m.split(':')[1]) {
						n.setType('minecraft:air');
						const o = this.hasItemHotbar(c, 'minecraft:bucket');
						if (o !== undefined) {
							const p = new ItemStack(d, 1);
							f.setItem(o, p);
						}
					}
				}, l));
		} else
			system.runTimeout(() => {
				if (!c || !c.isValid) return;
				const n = c.dimension.getBlock(i);
				n && n.isAir && (n.setType(d), this.subtractItem(c, d, false));
			}, 2);
	}
	getDistanceInAir(c) {
		if (!c || !c.isValid) return 0;
		try {
			const d = c.location,
				f = c.dimension.getBlockFromRay(
					d,
					{
						x: 0,
						y: -1,
						z: 0,
					},
					{
						maxDistance: 128,
						includePassableBlocks: true,
						includeLiquidBlocks: false,
					},
				);
			if (!f || !f.block) return 128;
			const g = f.block.location.y + 1 + (f.faceLocation?.y ?? 0),
				h = d.y - g;
			return Math.max(0, Math.round(h * 10) / 10);
		} catch (i) {
			return 0;
		}
	}
	doubleJump(c) {
		if (!c || !c.isValid) return;
		const d = this.getBotData(c);
		if (!d) return;
		if ((d.jumpDelay ?? 0) > 0 || d.is_gliding) return;
		const e = c.getComponent('minecraft:equippable'),
			f = e?.getEquipment(EquipmentSlot.Chest),
			g = f?.typeId === 'minecraft:elytra';
		if (!g) {
			this.setError(c, '§c[doubleJump] No elytra equipped in chest slot');
			return;
		}
		const h = f.getComponent('minecraft:durability');
		if (h && h.damage >= h.maxDurability - 1) {
			this.setError(c, '§c[doubleJump] Elytra is broken');
			return;
		}
		((d.jumpDelay = 12),
			(d.is_gliding = false),
			this.setBotData(c, d),
			c.jump(),
			system.runTimeout(() => {
				if (!c.isValid) return;
				try {
					c.glide();
				} catch (i) {
					const j = this.getBotData(c);
					j && ((j.is_gliding = true), this.setBotData(c, j));
					return;
				}
				this.watchGlide(c);
			}, 5));
	}
	watchGlide(c, d = 0) {
		system.runTimeout(() => {
			if (!c || !c.isValid) return;
			const f = this.getBotData(c);
			if (!f || !f.is_gliding) return;
			const g = c.isOnGround,
				h = c.isInWater,
				i = d > 600;
			if ((g && d > 5) || h || i) {
				try {
					c.stopGliding();
				} catch (j) {}
				((f.is_gliding = true), this.setBotData(c, f));
				return;
			}
			this.watchGlide(c, d + 2);
		}, 2);
	}
	placeBlockOnLiquid(c, d, e) {
		if (!c || !c.isValid || !e || !e.isValid) return;
		const f = this.getBotData(c);
		if (!f) return;
		if ((f.liquidDelay ?? 0) > 0) return;
		if (this.liquidMap.size === 0) return;
		const g = c.dimension,
			h = c.location,
			i = Math.floor(h.x),
			j = Math.floor(h.z),
			k = Math.floor(h.y),
			l = Math.floor(h.y + 1),
			m = Array.from(this.liquidMap.values()).filter((n) => n.placedBy === e.id);
		for (const n of m) {
			const o = n.location,
				p = this.getDistance(h, o);
			system.runTimeout(
				() => {
					if (p <= 7) {
						if (this.getProp('betterAi')) {
							let r = this.isWallBetween(e, c);
							if (r) return;
						}
						const q = g.getBlock(o);
						if (q && (q.typeId === 'minecraft:water' || q.typeId === 'minecraft:lava')) {
							const s = q.permutation.getState('liquid_depth');
							let t = true;
							if (s === 0) {
								const u = o.x === i && o.z === j && (o.y === k || o.y === l);
								if (u) {
									const v = this.hasItemHotbar(c, 'minecraft:water_bucket');
									if (v !== undefined) {
										(c.setRotation({
											x: 90,
											y: c.getRotation().y,
										}),
											(c.selectedSlotIndex = v),
											c.useItemInSlotOnBlock(v, o),
											system.runTimeout(() => {
												c.isValid && g.getBlock(o)?.setType('minecraft:water');
											}, 1));
										const w = 10 * (f.difficulty || 1);
										(system.runTimeout(() => {
											if (c.isValid) {
												const x = this.hasItemHotbar(c, 'minecraft:bucket');
												x !== undefined &&
													((c.selectedSlotIndex = x), c.useItemInSlotOnBlock(x, o));
											}
										}, w),
											(t = false));
									} else
										(this.setError(c, '§c[placeBlockOnLiquid] Missing "minecraft:water_bucket"'),
											c.lookAtLocation(o),
											q.setType(d),
											(t = false));
								} else (c.lookAtLocation(o), q.setType(d), (t = false));
							} else (c.lookAtLocation(o), q.setType(d), (t = false));
							if (t) {
								this.liquidMap.delete(n.id);
								const x = f.difficulty ?? 3,
									y = x === 0 ? 20 : 20 + 15 * x;
								((f.liquidDelay = y), this.setBotData(c, f));
							}
						}
					}
				},
				10 * (f.difficulty === 0 ? 1 : f.difficulty),
			);
		}
	}
	placeBlockOnTarget(c, d, e) {
		if (!c || !c.isValid || !e || !e.isValid) return;
		const f = this.getBotData(c),
			g = c.getComponent('minecraft:inventory').container;
		if (!f) return;
		const h = Math.floor(e.location.x),
			i = Math.floor(e.location.y),
			j = Math.floor(e.location.z),
			k = {
				x: h,
				y: i,
				z: j,
			},
			l = {
				x: h,
				y: i - 1,
				z: j,
			},
			m = this.hasItemHotbar(c, d);
		if (m === undefined) {
			this.setError(c, '§c[placeBlockOnTarget] Missing "' + d + '" in hotbar');
			return;
		}
		const n = f.difficulty ?? 3,
			o = 5 + n * 5,
			p = d.includes('bucket') ? l : k;
		if (this.getProp('betterAi')) {
			let q = this.isWallBetween(e, c);
			if (q) return;
			const r = c.dimension.getBlock({
				x: p.x,
				y: p.y - 1,
				z: p.z,
			});
			if (!r || r.isAir) return;
		}
		(c.lookAtLocation(p),
			(c.selectedSlotIndex = m),
			c.useItemInSlotOnBlock(m, p),
			system.runTimeout(() => {
				((f.action = 'none'), this.setBotData(c, f));
			}, o + 3),
			d.includes('bucket') &&
				system.runTimeout(() => {
					if (!c || !c.isValid) return;
					const s = c.dimension.getBlock(k);
					if (!s) return;
					const t = d === 'minecraft:lava_bucket' ? 'minecraft:lava' : 'minecraft:water';
					if (s.typeId === t || s.typeId === 'minecraft:flowing_' + t.split(':')[1]) {
						s.setType('minecraft:air');
						const u = this.hasItemHotbar(c, 'minecraft:bucket');
						if (u !== undefined) {
							const v = new ItemStack(d, 1);
							g.setItem(u, v);
						}
					}
				}, o));
	}
	getAttackDelay(c, d = true) {
		if (!c || !c.isValid) return undefined;
		const e = this.getBotData(c);
		if (!e) return undefined;
		const f = e.difficulty ?? 3,
			g = this.getProp('javaCombat'),
			h = Math.max(0, tune('CPS_JITTER')) / 100,
			i = 1 + (Math.random() * 2 - 1) * h,
			j = Math.random() < 0.08 ? 1 + Math.random() * (0.25 + 0.15 * f) : 1;
		let k;
		if (g && !d) {
			let l = 'minecraft:air';
			const m = c.getComponent('equippable');
			if (m) {
				const p = m.getEquipment('Mainhand');
				if (p) l = p.typeId;
			}
			const n = WEAPON_STATS[l]?.time || 0.625,
				o = tune('JAVA_RELEASE_LAG') * f * (0.5 + Math.random());
			k = n * i + o / 20;
		} else {
			if (d) k = (0.12 + f * 0.13) * i;
			else {
				const q = this.getPersona(c),
					r = Math.max(1.5, byDifficulty('CPS_BASE', 'CPS_PER_DIFF', f, 1.5, 20) * (q.speed ?? 1));
				k = (1 / r) * i;
			}
		}
		return ((k = Math.max(k * j, 0.05)), Math.max(1, Math.round(k * 20)));
	}
	botAttack(c, d, e = 'sword', f = false) {
		const g = this.getBotData(d);
		if (!g) return;
		this.handleCombatMovement(c, d);
		if ((g.lastAttack ?? 0) > 0) return;
		const h = g.difficulty ?? 3;
		if (isReacting(d, g, c, h)) {
			this.setBotData(d, g);
			return;
		}
		const i = this.findWeapon(d, e);
		if (i != undefined) d.selectedSlotIndex = i;
		const j = byDifficulty('CRIT_BASE', 'CRIT_PER_DIFF', h, 0, 100),
			k = Math.random() * 100 < j;
		humanLookAt(d, g, c, h);
		const l = this.getDistance(c.location, d.location),
			m = byDifficultyUp('MISS_BASE', 'MISS_PER_DIFF', h, 0, 95),
			n = Math.random() * 100 >= m,
			o = this.isAttackObstructed(d, c);
		if (o) {
			((g.lastAttack = Math.max(2, Math.round(this.getAttackDelay(d) * 0.6))),
				this.setBotData(d, g));
			return;
		}
		if (n) {
			const p = l < this.getRange(d);
			p &&
				(sprintReset(d, g, h),
				k && f
					? this.critAttack(d, c)
					: (d.attackEntity(c), this.applyJavaKnockback(d, c), this.applyCustomDamage(d, c, true)));
		}
		((g.lastAttack = this.getAttackDelay(d)), this.setBotData(d, g));
	}
	botMaceAttack(c, d) {
		const e = this.getBotData(d);
		if (!e) return;
		this.handleCombatMovement(c, d);
		this.isInAir(d) && (humanLookAt(d, e, c, e?.difficulty ?? 3), d.moveRelative(0, 1, 1));
		if ((e.lastAttack ?? 0) > 0) return;
		const f = this.hasItem(d, 'minecraft:wind_charge');
		if (f === undefined) {
			this.setError(d, '§c[AttackMace] Failed finding "minecraft:wind_charge"');
			return;
		}
		const g = this.hasItem(d, 'minecraft:mace');
		if (g === undefined) {
			this.setError(d, '§c[AttackMace] Failed finding "minecraft:mace"');
			return;
		}
		const h = e.difficulty,
			i = 100 - byDifficultyUp('MISS_BASE', 'MISS_PER_DIFF', h, 0, 95),
			j = this.findWeapon(d, 'mace'),
			k = this.hasItemHotbar(d, 'minecraft:wind_charge'),
			l = d.dimension.getBlock({
				x: d.location.x,
				y: d.location.y - 0.5,
				z: d.location.z,
			}),
			m = !l || l.isAir;
		if (!m && k && e.jumpDelay === 0)
			((e.jumpDelay = 15 * h),
				this.setBotData(d, e),
				system.runTimeout(() => {
					if (d.isValid) {
						const n = d.getRotation();
						(d.setRotation({
							x: 90,
							y: n.y,
						}),
							(d.selectedSlotIndex = k),
							d.useItemInSlot(k),
							system.runTimeout(() => {
								if (d.isValid) d.stopUsingItem();
							}, 2));
					}
				}, 1),
				(e.lastAttack = 15),
				this.setBotData(d, e));
		else
			j &&
				((d.selectedSlotIndex = j),
				humanLookAt(d, e, c, e?.difficulty ?? 3),
				system.runTimeout(() => {
					const n = this.getDistance(d.location, c.location),
						o = this.getChance(i),
						p = this.isAttackObstructed(d, c);
					o &&
						n < this.getRange(d) + 1 &&
						!p &&
						d.isValid &&
						c.isValid &&
						(d.attackEntity(c), this.applyJavaKnockback(d, c), this.applyCustomDamage(d, c, true));
				}, 2),
				(e.lastAttack = this.getAttackDelay(d)),
				this.setBotData(d, e));
	}
	botCrystalAttack(c, d) {
		if (!d || !d.isValid || !c || !c.isValid) return;
		const e = this.getBotData(d);
		if (!e) return;
		this.handleCombatMovement(c, d);
		this.isInAir(d) && (humanLookAt(d, e, c, e?.difficulty ?? 3), d.moveRelative(0, 1, 1));
		if ((e.lastAttack ?? 0) > 0) return;
		const f = this.getDistance(d.location, c.location),
			g = e.difficulty,
			h = this.hasItemHotbar(d, 'minecraft:end_crystal'),
			i = this.hasItem(d, 'minecraft:end_crystal'),
			j = this.hasItemHotbar(d, 'minecraft:obsidian'),
			k = this.hasItem(d, 'minecraft:obsidian'),
			l = this.hasItemHotbar(d, 'minecraft:respawn_anchor'),
			m = this.hasItem(d, 'minecraft:respawn_anchor');
		if (!h && i) this.equipItemHotbar(d, 'minecraft:end_crystal');
		else !h && !i && this.setError(d, '§c[CrystalAttack] Missing "minecraft:end_crystal"');
		if (!j && k) this.equipItemHotbar(d, 'minecraft:obsidian');
		else !j && !k && this.setError(d, '§c[CrystalAttack] Missing "minecraft:obsidian"');
		const n = d.location.y < c.location.y,
			o = Math.abs(d.location.y - c.location.y),
			p = (q, r) => {
				if (!q || !q.isValid) return undefined;
				const s = q.location,
					t = q.dimension,
					u = 1;
				for (let v = -u; v <= u; v++) {
					for (let w = -u; w <= u; w++) {
						for (let A = -u; A <= u; A++) {
							if (v === 0 && w === 0 && A === 0) continue;
							const B = {
								x: Math.floor(s.x) + v,
								y: Math.floor(s.y) + w,
								z: Math.floor(s.z) + A,
							};
							if (B.y < -64 || B.y > 320) continue;
							const C = t.getBlock(B);
							if (C && C.typeId === r) return B;
						}
					}
				}
				return undefined;
			};
		if (d.location.y === c.location.y && f < this.getRange(d) - 1.5) {
			let q = this.hasItemHotbar(d, 'minecraft:netherite_sword');
			if (q === undefined) q = this.hasItemHotbar(d, 'minecraft:diamond_sword');
			if (q === undefined) q = 0;
			((d.selectedSlotIndex = q),
				humanLookAt(d, e, c, e?.difficulty ?? 3),
				d.attackEntity(c),
				this.applyJavaKnockback(d, c),
				(e.lastAttack = this.getAttackDelay(d)),
				this.setBotData(d, e));
		}
		if ((n || o < 1) && f < 6) {
			const r = c.location.x - d.location.x,
				s = c.location.z - d.location.z,
				t = Math.hypot(r, s);
			if (t > 0) {
				const u = {
					x: Math.floor(d.location.x + (r / t) * 1.5),
					y: Math.floor(d.location.y),
					z: Math.floor(d.location.z + (s / t) * 1.5),
				};
				let v = d.dimension.getBlock(u);
				const w = d.dimension.getBlock({
					x: u.x,
					y: u.y - 1,
					z: u.z,
				});
				if (v && w && !w.isAir) {
					let x = this.isWallBetween(c, d);
					d.stopMoving();
					if (!x) {
						if (v.typeId === 'minecraft:air' && k) {
							const y = this.hasItemHotbar(d, 'minecraft:obsidian') ?? 0;
							d.selectedSlotIndex = y;
							const z = BlockPermutation.resolve('minecraft:obsidian');
							(d.dimension.setBlockPermutation(u, z),
								this.subtractItem(d, 'minecraft:obsidian', false),
								(v = d.dimension.getBlock(u)));
						}
						if (v && v.typeId === 'minecraft:obsidian' && i) {
							d.stopMoving();
							const A = this.hasItemHotbar(d, 'minecraft:end_crystal') ?? 0;
							((d.selectedSlotIndex = A),
								d.lookAtLocation(u, 15),
								d.useItemInSlotOnBlock(A, u),
								(e.lastAttack = this.getAttackDelay(d, false)),
								this.setBotData(d, e),
								system.runTimeout(() => {
									const B = {
											x: u.x + 0.5,
											y: u.y + 1,
											z: u.z + 0.5,
										},
										C = d.dimension.getEntities({
											location: B,
											maxDistance: 2,
											type: 'minecraft:ender_crystal',
										});
									for (const D of C) {
										if (D.isValid) {
											let E = this.getDistance(d.location, D.location);
											if (E > 6) continue;
											(d.lookAtEntity(D),
												D.applyDamage(1, {
													cause: 'entityAttack',
													damagingEntity: d,
												}),
												d.playAnimation('animation.player.attack.positions'));
											break;
										}
									}
								}, 5));
						}
					}
				}
			}
		}
		if (!n && o >= 1 && f < 6) {
			const B = p(c, 'minecraft:air'),
				C = p(c, 'minecraft:respawn_anchor');
			let D = true;
			if (B) {
				if (!d || !d.isValid) return;
				const F = d.dimension.getBlock({
					x: B.x,
					y: B.y - 1,
					z: B.z,
				});
				F && F.typeId !== 'minecraft:air' && (D = false);
			}
			let E = this.isWallBetween(c, d);
			if (m && B && D && !C && !E) {
				const G = this.hasItemHotbar(d, 'minecraft:respawn_anchor') ?? 0;
				if (!l) this.equipItemHotbar(d, 'minecraft:respawn_anchor');
				(d.lookAtLocation(B, 15),
					(d.selectedSlotIndex = G),
					(e.lastAttack = this.getAttackDelay(d, false)),
					this.setBotData(d, e),
					system.runTimeout(() => {
						if (this.getDistance(d.location, B) < 7) {
							const H = BlockPermutation.resolve('minecraft:respawn_anchor', {
								respawn_anchor_charge: 0,
							});
							d.dimension.setBlockPermutation(B, H);
							!this.subtractItem(d, 'minecraft:respawn_anchor', false) &&
								console.warn('Failed subtracting minecraft:respawn_anchor');
							for (let J = 1; J <= 4; J++) {
								system.runTimeout(
									() => {
										const K = d.dimension.getBlock(B);
										if (K && K.typeId === 'minecraft:respawn_anchor') {
											const L = BlockPermutation.resolve('minecraft:respawn_anchor', {
												respawn_anchor_charge: J,
											});
											(d.dimension.setBlockPermutation(B, L),
												this.subtractItem(d, 'minecraft:glowstone', true));
										}
									},
									(J + 4) * g,
								);
							}
							const I = 4 * g + 1;
							system.runTimeout(() => {
								const K = d.dimension.getBlock(B);
								if (!K) return;
								let L = this.getDistance(d.location, K.location);
								if (L > 6) return;
								if (K.typeId === 'minecraft:respawn_anchor') {
									const M = this.hasItemHotbar(d, 'minecraft:obsidian') ?? 0;
									((d.selectedSlotIndex = M), d.interactWithBlock(K.location));
								}
							}, I);
						}
					}, 5));
			}
		}
	}
	subtractItem(c, d, f = true) {
		if (!c || !c.isValid) return true;
		const g = c.getComponent('minecraft:inventory').container;
		let h;
		if (f) h = this.hasItemHotbar(c, d);
		else h = this.hasItem(c, d);
		if (h === true || h === undefined)
			return (this.setError(c, '§c[subtractItem] Failed finding "' + d + '"'), true);
		const i = g.getItem(h).amount;
		let j;
		if (i - 1 === 0) j = undefined;
		else j = new ItemStack(d, i - 1);
		try {
			g.setItem(h, j);
		} catch (k) {
			return (console.warn('Subtract Item Error: ' + k), true);
		}
		return false;
	}
	botBackup(c, d, e = 20) {
		if (!d || !d.isValid || !c || !c.isValid) return;
		const f = this.getBotData(d);
		if (!f || f.is_backing_up) return;
		((f.is_backing_up = false), (f.action = 'backing_up'), this.setBotData(d, f));
		let g = 0;
		const h = system.runInterval(() => {
			if (!d.isValid || !c.isValid || g >= e) {
				system.clearRun(h);
				const i = this.getBotData(d);
				if (i) {
					i.is_backing_up = true;
					if (i.action === 'backing_up') i.action = 'none';
					this.setBotData(d, i);
				}
				return;
			}
			humanLookAt(d, f, c, f?.difficulty ?? 3);
			if (!this.getProp('dontMove')) {
				const j = this.getBotData(d) ?? f;
				(this.applyMovement(d, j, -1, 0, j.difficulty ?? 3, c),
					humanLookAt(d, j, c, j.difficulty ?? 3));
				if (this.getChance(12)) tryJump(d, j, true);
				this.setBotData(d, j);
			}
			g++;
		}, 1);
	}
	botPearl(c, d, e, f = true) {
		if (this.getProp('dontMove')) return;
		if (d.isPearling) return;
		if ((d.lastPearl ?? 0) > 0) return;
		const g = this.hasItemHotbar(c, 'minecraft:ender_pearl'),
			h = this.hasItem(c, 'minecraft:ender_pearl');
		if (h === undefined) {
			this.setError(c, '§c[botPearl] Failed finding "minecraft:ender_pearl"');
			return;
		}
		if (g === undefined) {
			this.setError(c, '§c[botPearl] Failed finding "minecraft:ender_pearl" in hotbar');
			return;
		}
		const i = e.x - c.location.x,
			j = e.z - c.location.z,
			k = Math.hypot(i, j);
		d.isPearling = false;
		f ? (d.lastPearl = 120) : (d.lastPearl = Math.floor(k * (0.16 * d.difficulty)));
		this.setBotData(c, d);
		const l = 2 + k * 0.25,
			m = {
				x: e.x,
				y: e.y + l,
				z: e.z,
			};
		(c.lookAtLocation(m),
			system.runTimeout(() => {
				if (!c.isValid) return;
				((c.selectedSlotIndex = g), c.useItemInSlot(g));
			}, 5),
			system.runTimeout(() => {
				const n = this.getBotData(c);
				if (!n || !n.isPearling) return;
				((n.isPearling = true), this.setBotData(c, n));
			}, 45));
	}
	botThrowSplashSelf(c, d) {
		if (!c || !c.isValid) return;
		let e = this.hasItemHotbar(c, 'minecraft:splash_potion', d),
			f = true,
			g = -1;
		const h = c.getComponent('minecraft:inventory').container;
		if (e === undefined) {
			const i = this.equipItemHotbar(c, 'minecraft:splash_potion', undefined, d);
			if (i === 'full') {
				g = this.hasItem(c, 'minecraft:splash_potion', d);
				if (g === undefined) {
					this.setError(c, '§c[ThrowSplashSelf] Missing splash potion: ' + d);
					return;
				}
				((e = c.selectedSlotIndex), (f = false), h.swapItems(g, e, h));
			} else {
				e = this.hasItemHotbar(c, 'minecraft:splash_potion', d);
				if (e === undefined) {
					this.setError(c, '§c[ThrowSplashSelf] Failed equipping splash potion');
					return;
				}
			}
		}
		(c.stopMoving(),
			system.runTimeout(() => {
				if (c.isValid) {
					const j = c.getRotation();
					(c.setRotation({
						x: 90,
						y: j.y,
					}),
						(c.selectedSlotIndex = e),
						c.useItemInSlot(e),
						system.runTimeout(() => {
							c.isValid && (c.stopUsingItem(), f && h.swapItems(e, g, h));
						}, 5));
				}
			}, 2));
	}
	botThrowSplashTarget(c, d, e) {
		if (!c || !c.isValid || !e || !e.isValid) return;
		let f = this.hasItemHotbar(c, 'minecraft:splash_potion', d),
			g = true,
			h = -1;
		const i = c.getComponent('minecraft:inventory').container;
		if (f === undefined) {
			const j = this.equipItemHotbar(c, 'minecraft:splash_potion', undefined, d);
			if (j === 'full') {
				h = this.hasItem(c, 'minecraft:splash_potion', d);
				if (h === undefined) {
					this.setError(c, '§c[ThrowSplashTarget] Missing splash potion: ' + d);
					return;
				}
				((f = c.selectedSlotIndex), (g = false), i.swapItems(h, f, i));
			} else {
				f = this.hasItemHotbar(c, 'minecraft:splash_potion', d);
				if (f === undefined) {
					this.setError(c, '§c[ThrowSplashTarget] Failed equipping splash potion');
					return;
				}
			}
		}
		(c.stopMoving(),
			system.runTimeout(() => {
				c.isValid &&
					e.isValid &&
					(c.lookAtEntity(e),
					(c.selectedSlotIndex = f),
					c.useItemInSlot(f),
					system.runTimeout(() => {
						c.isValid && (c.stopUsingItem(), g && i.swapItems(f, h, i));
					}, 5));
			}, 2));
	}
	botUseRangedWeapon(c, d, e, f = 25) {
		if (!c || !c.isValid || !d || !d.isValid) return;
		const g = this.getBotData(d);
		if (!g || g.is_shooting) return;
		const h = g.difficulty ?? 3,
			i = e === 'minecraft:trident' ? 2.5 : e === 'minecraft:crossbow' ? 3.15 : 2.95;
		(this.aimProjectileAt(d, c, i, 1.1, h),
			d.stopMoving(),
			(g.is_shooting = false),
			(g.shotSpeed = i),
			this.setBotData(d, g));
		if (this.isAttackObstructed(d, c)) {
			d.stopUsingItem();
			const l = this.getBotData(d);
			l && ((l.is_shooting = true), this.setBotData(d, l));
			return;
		}
		const j = this.hasItemHotbar(d, e);
		if (j === undefined) {
			this.setError(d, '§c[useRangedWeapon] Failed finding "' + e + '" in hotbar', 40);
			const m = this.getBotData(d);
			m && ((m.is_shooting = true), this.setBotData(d, m));
			return;
		}
		((d.selectedSlotIndex = j), d.useItemInSlot(j));
		const k = system.runInterval(() => {
			if (!d.isValid) {
				system.clearRun(k);
				return;
			}
			const n = this.getBotData(d);
			if (!n?.is_shooting) {
				system.clearRun(k);
				return;
			}
			if (!c.isValid) {
				system.clearRun(k);
				return;
			}
			this.aimProjectileAt(d, c, i, 1.1, h);
		}, 2);
		system.runTimeout(() => {
			system.clearRun(k);
			if (!d.isValid) return;
			const n = this.getBotData(d);
			if (n && !n.is_shooting) return;
			(c.isValid && this.aimProjectileAt(d, c, i, 1.1, h),
				d.stopUsingItem(),
				n && ((n.is_shooting = true), this.setBotData(d, n)));
		}, f);
	}
	checkIfStuck(c, d) {
		return stuckLevel(c, d) > 0;
	}
	critAttack(c, d) {
		const e = this.getBotData(c);
		let f = true;
		!this.getProp('dontMove') && e && ((f = tryJump(c, e, true)), this.setBotData(c, e));
		const g = f ? 7 + Math.floor(Math.random() * 3) : 1;
		system.runTimeout(() => {
			if (c.isValid && d.isValid) {
				const h = this.getDistance(c.location, d.location);
				h <= this.getRange(c) &&
					!this.isAttackObstructed(c, d) &&
					(c.attackEntity(d), this.applyJavaKnockback(c, d), this.applyCustomDamage(c, d, f));
			}
		}, g);
	}
	drinkPotion(c, d = null) {
		if (!c || !c.isValid) return;
		const e = this.getBotData(c);
		if (!e || e.is_drinking) return;
		let f = this.hasItemHotbar(c, 'minecraft:potion', d),
			g = 'minecraft:potion',
			h = true,
			i = -1;
		const j = c.getComponent('minecraft:inventory').container;
		if (f === undefined) {
			i = this.hasItem(c, g, d);
			if (i === undefined) {
				this.setError(c, '§c[drinkPotion] Missing potion: ' + (d || 'any'));
				return;
			}
			const k = this.equipItemHotbar(c, g, undefined, d);
			if (k === 'full') ((f = c.selectedSlotIndex), (h = false), j.swapItems(i, f, j));
			else {
				f = this.hasItemHotbar(c, g, d);
				if (f === undefined) {
					this.setError(c, '§c[drinkPotion] Failed equipping potion');
					return;
				}
			}
		}
		((e.is_drinking = false),
			(e.action = 'drinking'),
			this.setBotData(c, e),
			(c.selectedSlotIndex = f),
			c.useItemInSlot(f),
			system.runTimeout(() => {
				if (c.isValid) {
					c.stopUsingItem();
					h && j.swapItems(f, i, j);
					const l = this.getBotData(c);
					l && ((l.is_drinking = true), this.setBotData(c, l));
				}
			}, 35));
	}
	eatGapple(c) {
		const d = this.getBotData(c);
		if (!d || d.is_eating || !c.isValid) return;
		let e = this.hasItemHotbar(c, 'minecraft:golden_apple'),
			f = 'minecraft:golden_apple';
		const g = this.hasItem(c, 'minecraft:golden_apple'),
			h = this.hasItem(c, 'bey:golden_apple');
		if (g === undefined && h === undefined) {
			this.setError(
				c,
				'§c[eatGapple] Failed finding "minecraft:golden_apple" or "bey:golden_apple"',
			);
			return;
		}
		if (e === undefined) {
			e = this.hasItemHotbar(c, 'bey:golden_apple');
			if (e !== undefined) f = 'bey:golden_apple';
		}
		let i = true,
			j = -1;
		const k = c.getComponent('minecraft:inventory').container;
		if (e === undefined) {
			j = this.hasItem(c, 'minecraft:golden_apple');
			if (j !== undefined) f = 'minecraft:golden_apple';
			else {
				j = this.hasItem(c, 'bey:golden_apple');
				if (j !== undefined) f = 'bey:golden_apple';
				else return;
			}
			const l = this.equipItemHotbar(c, f);
			if (l === 'full') ((e = c.selectedSlotIndex), (i = false), k.swapItems(j, e, k));
			else {
				e = this.hasItemHotbar(c, f);
				if (e === undefined) {
					this.setError(c, '§c[eatGapple] Failed equipping golden apple');
					return;
				}
			}
		}
		((d.is_eating = false),
			(d.action = 'eating'),
			this.setBotData(c, d),
			(c.selectedSlotIndex = e),
			c.useItemInSlot(e),
			system.runTimeout(() => {
				if (c.isValid) {
					c.stopUsingItem();
					i && k.swapItems(e, j, k);
					const m = this.getBotData(c);
					m && ((m.is_eating = true), this.setBotData(c, m));
				}
			}, 35));
	}
	equipItemHotbar(c, d, e = undefined, f = null, g = true) {
		const h = c.getComponent('minecraft:inventory').container,
			j = this.hasItem(c, d, f);
		if (j === undefined) {
			this.setError(c, '§c[equipItemHotbar] Failed finding ' + d);
			return;
		}
		let k = e;
		if (k === undefined) {
			for (let l = 0; l < 9; l++) {
				if (!h.getItem(l)) {
					k = l;
					break;
				}
			}
			k === undefined && g && (k = this.findSwappableHotbarSlot(c, d));
			if (k === undefined) return 'full';
		}
		j !== k && h.swapItems(j, k, h);
	}
	isKeyHotbarItem(c) {
		if (!c) return true;
		if (c.includes('sword') || c.endsWith('_axe') || c === 'minecraft:mace') return false;
		if (this.isShieldItem(c)) return false;
		if (RAIL_ITEMS.includes(c)) return false;
		return [
			'minecraft:bow',
			'minecraft:crossbow',
			'minecraft:flint_and_steel',
			'minecraft:tnt_minecart',
			'minecraft:totem_of_undying',
			'minecraft:ender_pearl',
			'minecraft:water_bucket',
			'minecraft:end_crystal',
			'minecraft:obsidian',
			'minecraft:respawn_anchor',
			'minecraft:glowstone',
		].includes(c);
	}
	findSwappableHotbarSlot(c, d) {
		const e = c.getComponent('minecraft:inventory')?.container;
		if (!e) return undefined;
		let f = undefined;
		for (let g = 8; g >= 0; g--) {
			const h = e.getItem(g);
			if (!h) return g;
			if (h.typeId === d) continue;
			if (this.isKeyHotbarItem(h.typeId)) continue;
			if (g === c.selectedSlotIndex) {
				if (f === undefined) f = g;
				continue;
			}
			return g;
		}
		return f;
	}
	equipItemOffhand(c, d) {
		const e = c.getComponent('minecraft:inventory').container,
			f = this.hasItem(c, d);
		if (f === undefined) {
			this.setError(c, '§c[equipItemOffhand] Failed finding "' + d + '"');
			return;
		}
		const g = e.getItem(f);
		if (!g) return;
		if (g.typeId === d) {
			const h = c.getComponent('minecraft:equippable'),
				i = g.clone();
			(e.setItem(f, undefined), h.setEquipment(EquipmentSlot.Offhand, i));
		}
	}
	extinguishSelf(c) {
		if (!c || !c.isValid) return;
		const d = this.getBotData(c);
		if (!d) return;
		const e = c.getComponent('minecraft:inventory').container,
			f = this.hasItemHotbar(c, 'minecraft:water_bucket');
		f !== undefined
			? (c.stopMoving(),
				system.runTimeout(() => {
					if (!c.isValid) return;
					const g = c.getRotation();
					c.setRotation({
						x: 90,
						y: g.y,
					});
					const h = c.location,
						i = {
							x: Math.floor(h.x),
							y: Math.floor(h.y),
							z: Math.floor(h.z),
						};
					((c.selectedSlotIndex = f),
						c.useItemInSlotOnBlock(f, i),
						system.runTimeout(() => {
							c.isValid && this.isOnFire(c) && c.dimension.getBlock(i)?.setType('minecraft:water');
						}, 1));
					const j = 5 * (d.difficulty || 1);
					system.runTimeout(() => {
						if (!c.isValid) return;
						const k = c.dimension.getBlock(i);
						if (!k) return;
						if (k.typeId === 'minecraft:water' || k.typeId === 'minecraft:flowing_water') {
							k.setType('minecraft:air');
							const l = this.hasItemHotbar(c, 'minecraft:bucket');
							if (l !== undefined) {
								const m = new ItemStack('minecraft:water_bucket', 1);
								e.setItem(l, m);
							}
						}
					}, j);
				}, 2))
			: this.equipItemHotbar(c, 'minecraft:water_bucket');
	}
	findWeapon(c, d = 'sword') {
		const e = getInventoryItems(c);
		if (!e) return undefined;
		const f = Math.min(9, e.length);
		for (let g = 0; g < f; g++) {
			const h = e[g];
			if (h && h.typeId.includes(d)) return g;
		}
		return undefined;
	}
	getBotData(c) {
		if (this.botCache.has(c.id)) return this.botCache.get(c.id);
		try {
			const d = c.getDynamicProperty('bot_data');
			if (d) {
				const f = JSON.parse(d);
				return (this.botCache.set(c.id, f), f);
			}
			return null;
		} catch (g) {
			return null;
		}
	}
	getChance(c) {
		return Math.random() * 100 < c;
	}
	getChanceMulti(c) {
		const d = Math.max(0, Math.min(100, c)),
			e = d / 100,
			f = e / 20;
		return Math.random() < f;
	}
	getDistance(c, d) {
		return Math.hypot(d.x - c.x, d.y - c.y, d.z - c.z);
	}
	getProp(c) {
		return getWorldProp(c);
	}
	getRange(c) {
		if (!c || !c.isValid) return undefined;
		const d = this.getBotData(c);
		if (!d) return undefined;
		return byDifficulty('REACH_BASE', 'REACH_PER_DIFF', d.difficulty ?? 3, 1.8, 3.2);
	}
	isAttackObstructed(c, d) {
		try {
			return !hasClearShot(c, d);
		} catch (f) {
			return true;
		}
	}
	getTarget(c, d) {
		const f = d.linked_player;
		if (f === 'mob' || f === 'all') {
			const g = system.currentTick,
				h = this.targetCache.get(c.id);
			if (h && h.mode === f && g - h.tick < 5) {
				const j = h.target;
				if (!j) return null;
				if (j.isValid && !this.isIgnored(j, d)) {
					let k = false;
					try {
						k = (j.getComponent('minecraft:health')?.currentValue ?? 1) > 0;
					} catch (l) {}
					if (k) return j;
				}
			}
			const i = this.scanTarget(c, d);
			return (
				this.targetCache.set(c.id, {
					mode: f,
					tick: g,
					target: i,
				}),
				i
			);
		}
		return this.scanTarget(c, d);
	}
	scanTarget(c, d) {
		const e = c.location;
		let f = null,
			g = Infinity;
		if (d.linked_player === 'bot') {
			for (const h of world.getRawPlayers()) {
				if (
					h.id !== c.id &&
					h.isValid &&
					h.name.startsWith(this.botPrefix) &&
					!this.isIgnored(h, d)
				) {
					const i = h.location,
						j = (i.x - e.x) ** 2 + (i.y - e.y) ** 2 + (i.z - e.z) ** 2;
					j < g && ((g = j), (f = h));
				}
			}
			return f;
		} else {
			if (d.linked_player === 'mob') {
				for (const k of c.dimension.getEntities({
					location: c.location,
					maxDistance: this.getProp('searchRange') ?? 50,
				})) {
					if (!k.isValid || k instanceof Player || k.id === c.id || this.isIgnored(k, d)) continue;
					if (WhiteListedEnts.includes(k.typeId)) continue;
					const l = k.location,
						m = (l.x - e.x) ** 2 + (l.y - e.y) ** 2 + (l.z - e.z) ** 2;
					m < g && ((g = m), (f = k));
				}
				return f;
			} else {
				if (d.linked_player === 'player') {
					for (const n of world.getRawPlayers()) {
						if (
							n.id !== c.id &&
							n.isValid &&
							!n.name.includes(this.botPrefix) &&
							!this.isIgnored(n, d)
						) {
							if (n.getGameMode() === 'Creative') continue;
							const o = n.location,
								q = (o.x - e.x) ** 2 + (o.y - e.y) ** 2 + (o.z - e.z) ** 2;
							q < g && ((g = q), (f = n));
						}
					}
					return f;
				} else {
					if (d.linked_player === 'all') {
						for (const r of c.dimension.getEntities({
							location: c.location,
							maxDistance: this.getProp('searchRange') ?? 50,
						})) {
							if (!r.isValid || r.id === c.id || this.isIgnored(r, d)) continue;
							if (WhiteListedEnts.includes(r.typeId)) continue;
							if (r instanceof Player && r.getGameMode() === 'Creative') continue;
							const s = r.location,
								t = (s.x - e.x) ** 2 + (s.y - e.y) ** 2 + (s.z - e.z) ** 2;
							t < g && ((g = t), (f = r));
						}
						return f;
					} else
						return (
							world
								.getRawPlayers()
								.find((u) => u.id === d.linked_player && u.isValid && !this.isIgnored(u, d)) || null
						);
				}
			}
		}
	}
	handleCombatMovement(c, d) {
		if (this.getProp('dontMove')) return d.stopMoving();
		if (!c || !c.isValid || !d || !d.isValid) return;
		const e = this.getBotData(d);
		if (!e) return;
		!d.isSneaking && (d.isSprinting = false);
		const f = c.getComponent('equippable'),
			g = f?.getEquipment('Mainhand'),
			h =
				g?.typeId.includes('bow') ||
				g?.typeId.includes('crossbow') ||
				g?.typeId.includes('trident'),
			i = e.difficulty ?? 3;
		if (h) {
			humanLookAt(d, e, c, i);
			if (e.strafe_timer === undefined) e.strafe_timer = 0;
			if (e.strafe_dir === undefined) e.strafe_dir = 1;
			(e.strafe_timer <= 0
				? ((e.strafe_dir = Math.random() > 0.5 ? 1 : -1),
					(e.strafe_timer = 6 + Math.floor(Math.random() * 12)))
				: e.strafe_timer--,
				this.applyMovement(d, e, 1, e.strafe_dir, i, c),
				this.setBotData(d, e));
		} else {
			const j = this.getDistance(d.location, c.location);
			j > 15
				? (humanLookAt(d, e, c, i), this.applyMovement(d, e, 1, 0, i, c), this.setBotData(d, e))
				: this.combatStrafe(d, c, e);
		}
	}
	getPersona(c) {
		const d = this.getBotData(c);
		if (!d)
			return {
				aggr: 1,
				speed: 1,
				hops: 1,
			};
		return (
			!d.persona &&
				((d.persona = {
					aggr: 0.85 + Math.random() * 0.3,
					speed: 0.9 + Math.random() * 0.2,
					hops: 0.7 + Math.random() * 0.6,
					healAt: 7.5 + Math.random() * 5,
				}),
				this.setBotData(c, d)),
			d.persona
		);
	}
	getAggression(c) {
		if (!c?.isValid) return 0.4;
		const d = c.getComponent('minecraft:health');
		if (!d) return 1;
		const f = d.effectiveMax || 20,
			g = Math.max(0, Math.min(1, d.currentValue / f)),
			h = 0.85,
			i = 0.4;
		let j = 1;
		try {
			const l = this.botCache.get(c.id);
			if (l?.persona?.aggr) j = l.persona.aggr;
		} catch (m) {}
		const k = g >= h ? 1 : i + (g / h) * (1 - i);
		return Math.max(0.25, Math.min(1, k * j));
	}
	combatStrafe(c, d, e) {
		const f = e.difficulty ?? 3;
		humanLookAt(c, e, d, f);
		const g = this.getDistance(c.location, d.location),
			h = this.getRange(c),
			i = this.getAggression(c),
			j = h * (1.5 - 0.4 * i),
			k = h * (0.85 - 0.85 * i),
			l = h * (0.35 - 0.3 * i),
			m = h * (0.7 - 0.35 * i);
		if (e.moveForward === undefined) e.moveForward = 0;
		if (g > j) e.moveForward = 1;
		else {
			if (g < k && e.moveForward === 1) e.moveForward = 0;
		}
		if (g < l) e.moveForward = -1;
		else {
			if (g > m && e.moveForward === -1) e.moveForward = 0;
		}
		if (e.strafe_timer === undefined) e.strafe_timer = 0;
		if (e.strafe_dir === undefined) e.strafe_dir = Math.random() > 0.5 ? 1 : -1;
		const n = e._moveOverride;
		n &&
			((e._moveOverride = undefined),
			n.commit &&
				((e.commitTimer = 6 + Math.floor(Math.random() * 6)), (e.commitForward = n.direction)),
			typeof n.lateral === 'number' &&
				n.lateral !== 0 &&
				((e.strafe_dir = n.lateral > 0 ? 1 : -1), (e.strafe_timer = Math.max(e.strafe_timer, 8))));
		if (e.strafe_timer <= 0) {
			e.strafe_dir *= -1;
			const q = Math.max(4, tune('STRAFE_SWITCH_MIN') + f * 3);
			((e.strafe_timer = q + Math.floor(Math.random() * Math.max(1, tune('STRAFE_SWITCH_RAND')))),
				!n &&
					this.getChance(15 + (3 - f) * 5 + i * 35) &&
					((e.commitTimer = 6 + Math.floor(Math.random() * 6) + Math.round(i * 6)),
					(e.commitForward = i >= 0.8 || g > h ? 1 : -1)));
		} else e.strafe_timer--;
		let o = e.moveForward,
			p = e.strafe_dir * (1 - 0.7 * i);
		e.commitTimer > 0 && (e.commitTimer--, (o = e.commitForward), (p *= 0.3));
		if ((e.pauseTimer ?? 0) > 0) (e.pauseTimer--, (o = 0), (p *= 0.2));
		else
			chancePerSecond(tune('HUMAN_PAUSE') * (0.4 + f * 0.3)) &&
				(e.pauseTimer = 2 + Math.floor(Math.random() * 4));
		(this.applyMovement(c, e, o, p, f, d), this.setBotData(c, e));
	}
	applyMovement(c, d, f, g, h, i = undefined) {
		if (!c || !c.isValid) return;
		const j = isGrounded(c),
			k = scanAhead(c, f, g);
		k.ledge && f > 0 && ((f = 0), (g = g === 0 ? (Math.random() > 0.5 ? 1 : -1) : g));
		k.stepUp && j && tuneOn('OBSTACLE_JUMP') && tryJump(c, d, false);
		const l = stuckLevel(c, d);
		if (l > 0) {
			if (l === 1) {
				if (j) tryJump(c, d, false);
			} else {
				if (l === 2) {
					((d.strafe_dir = (d.strafe_dir ?? 1) * -1),
						(d.commitTimer = 10 + Math.floor(Math.random() * 8)),
						(d.commitForward = k.wall ? -1 : 1),
						(g = d.strafe_dir),
						(f = d.commitForward));
					if (j) tryJump(c, d, false);
				} else {
					if (j)
						try {
							const m = c.getViewDirection(),
								n = Math.hypot(m.x, m.z),
								o = Math.max(0.1, tune('STUCK_IMPULSE'));
							n > 0 && c.applyKnockback(m.x / n, m.z / n, o, 0.42);
						} catch (p) {
							try {
								if (i?.isValid) c.navigateToLocation(i.location);
							} catch (q) {}
						}
					else {
						if (i?.isValid)
							try {
								c.navigateToLocation(i.location);
							} catch (r) {}
					}
					d.stuckLevel = 0;
					return;
				}
			}
		} else {
			if (j && k.wall && f > 0) !tryJump(c, d, true) && ((g = d.strafe_dir ?? 1), (f = 0.2));
			else
				j &&
					chancePerSecond(
						tune('JUMP_IDLE_CHANCE') * (1 + (3 - h) * 0.25) * (d.persona?.hops ?? 1),
					) &&
					tryJump(c, d, true);
		}
		try {
			if (!c.isSneaking) {
				const s = (d.sprintBlockUntil ?? 0) > system.currentTick;
				c.isSprinting = !s && f > tune('SPRINT_MIN_FORWARD');
			}
		} catch (t) {}
		try {
			if (Math.abs(f) < 0.05 && Math.abs(g) < 0.05) c.stopMoving();
			else c.moveRelative(g, f, 1);
		} catch (u) {}
	}
	isShieldItem(c, d = true) {
		if (!c) return true;
		if (c === 'bf:shield' || c.startsWith('bf:shield_')) return false;
		return !d && c === 'minecraft:shield';
	}
	isShieldItemStack(c, d = true) {
		if (!c) return true;
		try {
			if (c.hasTag('bf:custom_shield')) return false;
		} catch (f) {}
		return this.isShieldItem(c.typeId, d);
	}
	isCustomShieldItemStack(c) {
		return this.isShieldItemStack(c, false);
	}
	findShieldSlotHotbar(c) {
		if (!c || !c.isValid) return undefined;
		const d = getInventoryItems(c);
		if (!d) return undefined;
		for (let e = 0; e < Math.min(9, d.length); e++) {
			if (this.isCustomShieldItemStack(d[e])) return e;
		}
		return undefined;
	}
	findShieldSlotInventory(c) {
		if (!c || !c.isValid) return undefined;
		const d = getInventoryItems(c);
		if (!d) return undefined;
		for (let e = 0; e < d.length; e++) {
			if (this.isCustomShieldItemStack(d[e])) return e;
		}
		return undefined;
	}
	hasUsableShield(c) {
		if (!c || !c.isValid) return true;
		if (c.hasTag('shield_broken')) return true;
		const d = c.getComponent('minecraft:equippable')?.getEquipment(EquipmentSlot.Offhand);
		if (this.isShieldItemStack(d)) return false;
		return this.findShieldSlotInventory(c) !== undefined;
	}
	raiseShield(c, d = 40) {
		if (!c || !c.isValid) return true;
		if (c.hasTag('shield_broken')) return true;
		const e = this.getBotData(c);
		if (!e) return true;
		const f = system.currentTick + d;
		if (e.is_blocking)
			return (
				(e.blockUntilTick ?? 0) < f && ((e.blockUntilTick = f), this.setBotData(c, e)),
				false
			);
		const g = (e.shieldUseId ?? 0) + 1,
			h = c.getComponent('minecraft:equippable')?.getEquipment(EquipmentSlot.Offhand),
			j = this.isCustomShieldItemStack(h);
		let k = j ? undefined : this.findShieldSlotHotbar(c);
		if (!j && k === undefined) {
			const l = this.findShieldSlotInventory(c);
			if (l !== undefined) {
				const m = c.getComponent('minecraft:inventory').container;
				let n = undefined;
				for (let o = 0; o < 9; o++) {
					if (!m.getItem(o)) {
						n = o;
						break;
					}
				}
				if (n === undefined) n = c.selectedSlotIndex;
				(m.swapItems(l, n, m), (k = n));
			}
		}
		if (!j && k === undefined)
			return (
				(c.isSneaking = false),
				(e.shieldUseId = g),
				(e.is_blocking = false),
				(e.shieldMode = 'sneak'),
				(e.shieldSlot = undefined),
				(e.shieldRestoreSlot = undefined),
				(e.blockUntilTick = f),
				this.setBotData(c, e),
				this.scheduleShieldLower(c, g, d),
				false
			);
		return (
			(e.shieldUseId = g),
			(e.is_blocking = false),
			(e.shieldMode = 'custom'),
			(e.blockUntilTick = f),
			j
				? ((e.shieldSlot = undefined), (e.shieldRestoreSlot = undefined), this.setBotData(c, e))
				: ((e.shieldSlot = k),
					(e.shieldRestoreSlot = c.selectedSlotIndex),
					this.setBotData(c, e),
					(c.selectedSlotIndex = k),
					c.useItemInSlot(k)),
			c.addTag('shielding'),
			this.updateBotShieldAnimation(c),
			this.scheduleShieldLower(c, g, d),
			false
		);
	}
	scheduleShieldLower(c, d, e) {
		system.runTimeout(
			() => {
				if (!c || !c.isValid) return;
				const f = this.getBotData(c);
				if (!f || !f.is_blocking || f.shieldUseId !== d) return;
				const g = (f.blockUntilTick ?? 0) - system.currentTick;
				if (g > 0) {
					this.scheduleShieldLower(c, d, g);
					return;
				}
				this.lowerShield(c);
			},
			Math.max(1, e),
		);
	}
	lowerShield(c) {
		if (!c || !c.isValid) return;
		if (c.isSneaking) c.isSneaking = true;
		const d = this.getBotData(c);
		if (!d || !d.is_blocking) return;
		const e = d.shieldMode === 'custom';
		((d.is_blocking = true),
			(d.shieldUseId = (d.shieldUseId ?? 0) + 1),
			this.setBotData(c, d),
			d.shieldSlot !== undefined &&
				c.selectedSlotIndex === d.shieldSlot &&
				(c.stopUsingItem(),
				typeof d.shieldRestoreSlot === 'number' && (c.selectedSlotIndex = d.shieldRestoreSlot)),
			e && (c.removeTag('shielding'), this.updateBotShieldAnimation(c)));
	}
	isBlockableAngle(c, d) {
		if (!c || !c.isValid || !d) return true;
		try {
			const f = c.getViewDirection(),
				g = d.x - c.location.x,
				h = d.z - c.location.z,
				i = Math.hypot(g, h);
			if (i === 0) return false;
			return f.x * (g / i) + f.z * (h / i) > 0;
		} catch (j) {
			return true;
		}
	}
	updateBotShieldAnimation(c) {
		if (!c || !c.isValid) return;
		try {
			const d = c.getComponent('minecraft:equippable'),
				f = c.getComponent('minecraft:inventory')?.container,
				g = d?.getEquipment(EquipmentSlot.Offhand),
				h = f?.getItem(c.selectedSlotIndex),
				i = this.isCustomShieldItemStack(g),
				j = this.isCustomShieldItemStack(h);
			if (!i && !j && this.findShieldSlotInventory(c) === undefined) return;
			const k = c.hasTag('shielding') && !c.hasTag('shield_broken');
			let l = 'animation.player.shield_off';
			if (i) l = k ? 'shield_offhand' : 'animation.shield.wield_off_hand_first_person2';
			else
				j &&
					(l = k
						? 'animation.shield.wield_main_hand_first_person_blocking2'
						: 'animation.shield.wield_main_hand_first_person2');
			c.playAnimation(l, {
				blendOutTime: 1000000000,
				loop: false,
			});
		} catch (m) {}
	}
	damageBotShield(c, d = 1) {
		if (!c || !c.isValid) return;
		try {
			const f = c.getComponent('minecraft:equippable'),
				g = f?.getEquipment(EquipmentSlot.Offhand);
			if (this.isCustomShieldItemStack(g)) {
				const l = g.getComponent('minecraft:durability');
				if (!l) return;
				l.damage + d < l.maxDurability
					? ((l.damage += d), f.setEquipment(EquipmentSlot.Offhand, g))
					: (f.setEquipment(EquipmentSlot.Offhand, undefined),
						c.dimension.playSound('random.break', c.location),
						this.lowerShield(c));
				return;
			}
			const h = c.getComponent('minecraft:inventory').container,
				i = c.selectedSlotIndex,
				j = h.getItem(i);
			if (!this.isCustomShieldItemStack(j)) return;
			const k = j.getComponent('minecraft:durability');
			if (!k) return;
			k.damage + d < k.maxDurability
				? ((k.damage += d), h.setItem(i, j))
				: (h.setItem(i, undefined),
					c.dimension.playSound('random.break', c.location),
					this.lowerShield(c));
		} catch (m) {}
	}
	breakBotShield(c, d) {
		if (!c || !c.isValid || c.hasTag('shield_broken')) return;
		(this.lowerShield(c),
			c.removeTag('shielding'),
			c.addTag('shield_broken'),
			c.dimension.playSound('random.break', c.location, {
				volume: 1,
				pitch: 1.2,
			}));
		if (d && d.isValid) {
			const h = c.location.x - d.location.x,
				i = c.location.z - d.location.z,
				j = Math.hypot(h, i) || 1;
			try {
				c.applyKnockback(h / j, i / j, 0.5, 0.35);
			} catch (k) {}
		}
		this.updateBotShieldAnimation(c);
		const f = Number(this.getProp('custom_shield_cooldown') ?? 5),
			g = Math.max(1, Math.round(f * 20));
		system.runTimeout(() => {
			c &&
				c.isValid &&
				c.hasTag('shield_broken') &&
				(c.removeTag('shield_broken'), this.updateBotShieldAnimation(c));
		}, g);
	}
	handleShieldAttack(c, d) {
		const e = this.getBotData(d);
		if (!c) return true;
		if (!e || !d.isValid) return true;
		const f = e.difficulty ?? 3;
		if (!this.hasUsableShield(d)) return (this.lowerShield(d), true);
		this.handleCombatMovement(c, d);
		const g = this.getDistance(d.location, c.location),
			h = e.lastAttack ?? 0,
			i = this.getAggression(d),
			j = Math.max(1, f * 2),
			k = 0.9 - f * 0.18,
			l = i < 0.8 || this.isUnderFire(d, 20),
			m = g <= 6,
			n = g <= (this.getRange(d) ?? 3) + 1.2;
		h > (e.lastCooldownSeen ?? 0) && (e.shieldRoll = Math.random());
		e.lastCooldownSeen = h;
		const o = m && h > j && (l || n) && (e.shieldRoll ?? 1) < (l ? Math.min(1, k + 0.2) : k);
		if (o) {
			const p = Math.round(Math.max(0, tune('SHIELD_REACT')) * (1 + f * 0.5));
			(e.shieldReadyTick === undefined || e.shieldArmedFor !== c.id) &&
				((e.shieldArmedFor = c.id),
				(e.shieldReadyTick = system.currentTick + p),
				this.setBotData(d, e));
			if (system.currentTick >= (e.shieldReadyTick ?? 0)) {
				this.raiseShield(d, Math.max(6, h + 2 + Math.floor(Math.random() * 4)));
				if (d.isSprinting) d.isSprinting = true;
				return (humanLookAt(d, e, c, f), false);
			}
		} else ((e.shieldReadyTick = undefined), (e.shieldArmedFor = undefined), this.setBotData(d, e));
		return (
			h <= 0 && g <= this.getRange(d) && (this.lowerShield(d), this.botAttack(c, d)),
			this.lowerShield(d),
			true
		);
	}
	handleShieldDefence(c) {
		this.raiseShield(c, 24 + Math.floor(Math.random() * 22));
	}
	botAxeAttack(c, d) {
		if (!d || !d.isValid || !c || !c.isValid) return;
		const e = this.getBotData(d);
		if (!e) return;
		const f = e.difficulty ?? 3,
			g = c.hasTag('shielding') && !c.hasTag('shield_broken');
		g && f < 2
			? (d.selectedSlotIndex = this.findWeapon(d, 'axe') ?? d.selectedSlotIndex ?? 1)
			: (d.selectedSlotIndex = this.findWeapon(d, 'sword') ?? this.findWeapon(d, 'axe') ?? 0);
		const h = this.handleShieldAttack(c, d);
		if (h) {
			d.stopMoving();
			return;
		}
		if (!d.isSneaking) d.isSprinting = false;
		if (this.getDistance(c.location, d.location) <= this.getRange(d)) {
			const i = this.getBotData(d) ?? e;
			(i.lastAttack ?? 0) <= 0 && this.botAttack(c, d);
		} else this.handleCombatMovement(c, d);
	}
	itemMatches(c, d, e) {
		if (!c || c.typeId !== d) return true;
		if (!e) return false;
		const f = c.getComponent('minecraft:potion');
		if (!f) return true;
		return f.potionEffectType.id.toLowerCase().includes(e);
	}
	hasItem(c, d, e = null) {
		if (!c || !c.isValid) return;
		if (!d) return;
		const f = getInventoryItems(c);
		if (!f) return;
		for (let g = 0; g < f.length; g++) {
			if (this.itemMatches(f[g], d, e)) return g;
		}
		return undefined;
	}
	hasItemHotbar(c, d, e = null) {
		if (!c || !c.isValid) return undefined;
		const f = getInventoryItems(c);
		if (!f) return undefined;
		const g = Math.min(9, f.length);
		for (let h = 0; h < g; h++) {
			if (this.itemMatches(f[h], d, e)) return h;
		}
		return undefined;
	}
	getItemCount(c, d, e = null) {
		if (!c || !c.isValid) return 0;
		if (!d) return 0;
		const f = getInventoryItems(c);
		if (!f) return 0;
		let g = 0;
		for (let h = 0; h < f.length; h++) {
			const j = f[h];
			if (this.itemMatches(j, d, e)) g += j.amount ?? 1;
		}
		return g;
	}
	getItemCountHotbar(c, d, e = null) {
		if (!c || !c.isValid) return 0;
		if (!d) return 0;
		const f = getInventoryItems(c);
		if (!f) return 0;
		let g = 0;
		const h = Math.min(9, f.length);
		for (let j = 0; j < h; j++) {
			const k = f[j];
			if (this.itemMatches(k, d, e)) g += k.amount ?? 1;
		}
		return g;
	}
	hasItemOffhand(c, d) {
		const e = c.getComponent('minecraft:equippable'),
			f = e.getEquipment(EquipmentSlot.Offhand)?.typeId;
		if (!f) return true;
		return f === d;
	}
	hasPotion(c, d, e = undefined) {
		const f = c.toLowerCase(),
			g = e ? getInventoryItems(e) : undefined,
			h = g ? g.length : d.size;
		for (let j = 0; j < h; j++) {
			const k = g ? g[j] : d.getItem(j);
			if (!k) continue;
			const l = k.getComponent('minecraft:potion');
			if (!l) continue;
			const m = l.potionEffectType.id.toLowerCase();
			if (m.includes(f)) return false;
		}
		return true;
	}
	isHolding(c, d) {
		if (!c || !c.isValid) return true;
		const e = c.getComponent('minecraft:inventory')?.container;
		if (!e) return true;
		const f = c.selectedSlotIndex;
		if (f === undefined) return true;
		const g = e.getItem(f);
		if (g?.typeId === d) return false;
		return true;
	}
	isInAir(c) {
		if (!c || !c.isValid) return true;
		try {
			if (typeof c.isOnGround === 'boolean') return !c.isOnGround;
		} catch (f) {}
		const d = c.dimension.getBlock({
			x: c.location.x,
			y: c.location.y - 0.5,
			z: c.location.z,
		});
		return !d || d.isAir;
	}
	isOnFire(c) {
		if (!c || !c.isValid) return true;
		const d = c.getComponent('minecraft:onfire');
		return !!d;
	}
	isWallBetween(c, d) {
		if (!c || !c.isValid || !d || !d.isValid) return undefined;
		const e = {
				x: c.location.x,
				y: c.location.y + 1,
				z: c.location.z,
			},
			f = {
				x: d.location.x,
				y: d.location.y + 1,
				z: d.location.z,
			},
			g = this.getDistance(e, f),
			h = (f.x - e.x) / g,
			j = (f.y - e.y) / g,
			k = (f.z - e.z) / g;
		for (let l = 0; l < g; l += 0.5) {
			const m = {
					x: e.x + h * l,
					y: e.y + j * l,
					z: e.z + k * l,
				},
				n = c.dimension.getBlock(m);
			if (n && !n.isAir && !n.isLiquid) return false;
		}
		return true;
	}
	registerEvents() {
		if (this._eventsRegistered) return;
		((this._eventsRegistered = false),
			world.afterEvents.entityHurt.subscribe((c) => {
				const d = c.hurtEntity;
				if (!d?.isValid) return;
				if (typeof d.name !== 'string' || !d.name.startsWith(this.botPrefix)) return;
				const e = c.damageSource?.cause,
					f = c.damageSource?.damagingProjectile;
				if (e !== 'projectile' && !f) return;
				const g = this.getBotData(d);
				if (!g) return;
				((g.lastShotTick = system.currentTick), this.setBotData(d, g));
			}),
			world.beforeEvents.entityHurt.subscribe((c) => {
				const d = c.damageSource?.cause;
				if (d !== 'entityExplosion' && d !== 'blockExplosion' && d !== 'explosion') return;
				this.isProtectedFromBotCart(c.hurtEntity, c.damageSource?.damagingEntity) &&
					(c.cancel = false);
			}),
			world.beforeEvents.entityHurt.subscribe((c) => {
				const d = c.hurtEntity;
				if (!d || !d.isValid) return;
				if (typeof d.name !== 'string' || !d.name.startsWith(this.botPrefix)) return;
				if (!d.hasTag('shielding') || d.hasTag('shield_broken')) return;
				const f = c.damageSource?.cause;
				if (f !== 'entityAttack' && f !== 'contact' && f !== 'projectile') return;
				let g = true;
				try {
					g =
						this.isCustomShieldItemStack(
							d.getComponent('minecraft:equippable')?.getEquipment(EquipmentSlot.Offhand),
						) ||
						this.isCustomShieldItemStack(
							d.getComponent('minecraft:inventory')?.container?.getItem(d.selectedSlotIndex),
						);
				} catch (k) {}
				if (!g) return;
				const h = c.damageSource?.damagingEntity,
					i = c.damageSource?.damagingProjectile,
					j = i?.isValid ? i : h;
				if (!j || !j.isValid) return;
				if (!this.isBlockableAngle(d, j.location)) return;
				((c.cancel = false),
					system.run(() => {
						if (!d.isValid) return;
						const l = system.currentTick,
							m = this.lastShieldBlockFx.get(d.id) ?? -Infinity;
						if (l - m <= 5) return;
						(this.lastShieldBlockFx.set(d.id, l),
							d.dimension.playSound('item.shield.block', d.location));
						let n;
						try {
							n = h?.isValid
								? h.getComponent('minecraft:equippable')?.getEquipment('Mainhand')
								: undefined;
						} catch (o) {}
						(this.damageBotShield(d, n?.typeId === 'minecraft:mace' ? 10 : 1),
							!i && n?.typeId?.includes('axe') && this.breakBotShield(d, h));
					}));
			}),
			world.afterEvents.itemStartUseOn.subscribe((c) => {
				const { source: d, itemStack: e, blockFace: f, block: g } = c;
				if (!d?.isValid) return;
				if (!e) return;
				if (e.typeId !== 'minecraft:water_bucket' && e.typeId !== 'minecraft:lava_bucket') return;
				let h = {
					x: g.location.x,
					y: g.location.y,
					z: g.location.z,
				};
				switch (f) {
					case 'Up':
						h.y += 1;
						break;
					case 'Down':
						h.y -= 1;
						break;
					case 'North':
						h.z -= 1;
						break;
					case 'South':
						h.z += 1;
						break;
					case 'East':
						h.x += 1;
						break;
					case 'West':
						h.x -= 1;
						break;
				}
				const i = Date.now().toString() + Math.random().toString();
				(this.liquidMap.set(i, {
					id: i,
					location: h,
					placedBy: d.id,
					timestamp: Date.now(),
				}),
					system.runTimeout(() => {
						this.liquidMap.delete(i);
					}, 600));
			}),
			world.afterEvents.entityDie.subscribe((c) => {
				const d = c.deadEntity,
					e = c.damageSource,
					f = e.damagingEntity;
				if (d.typeId !== 'minecraft:player') return;
				const g = typeof d.name === 'string' && d.name.startsWith(this.botPrefix);
				if (g) {
					const h = d.getComponent('minecraft:equippable'),
						i = h?.getEquipment(EquipmentSlot.Offhand),
						j = i?.typeId === 'minecraft:totem_of_undying';
					if (!j) {
						d.disconnect();
						return;
					}
				}
				if (f?.name?.startsWith(this.botPrefix)) {
					const k = this.getBotData(f);
					k &&
						d.id === k.linked_player &&
						system.run(() => {
							if (!f.isValid) return;
							if (!this.getProp('tbag')) f.disconnect();
							else {
								for (let l = 0; l < 8; l++) {
									(system.runTimeout(() => {
										if (f.isValid) f.isSneaking = false;
									}, l * 5),
										system.runTimeout(
											() => {
												if (f.isValid) f.isSneaking = true;
											},
											l * 5 + 2,
										));
								}
								system.runTimeout(() => {
									if (f.isValid && this.getProp('disconnect')) f.disconnect();
								}, 40);
							}
						});
				}
			}),
			world.afterEvents.entityRemove.subscribe((c) => {
				(this.botCache.delete(c.removedEntityId),
					this.targetCache.delete(c.removedEntityId),
					this.lastShieldBlockFx.delete(c.removedEntityId));
			}));
	}
	removeAllBots() {
		const c = world.getRawPlayers().filter((d) => d.name.startsWith(this.botPrefix));
		for (const d of c) {
			d.disconnect();
		}
	}
	setBotData(c, d) {
		c.isValid && this.botCache.set(c.id, d);
	}
	predictLandingSpot(c, d) {
		if (!d || !d.isValid) return undefined;
		const e = d.getVelocity(),
			f = d.location,
			g = 6,
			h = {
				x: f.x + e.x * g,
				y: f.y + Math.max(0, e.y * 2),
				z: f.z + e.z * g,
			},
			i = c.dimension.getBlockFromRay(
				h,
				{
					x: 0,
					y: -1,
					z: 0,
				},
				{
					maxDistance: 8,
					includePassableBlocks: true,
					includeLiquidBlocks: true,
				},
			);
		if (!i?.block || i.block.isLiquid) return undefined;
		const j = {
				x: i.block.location.x,
				y: i.block.location.y + 1,
				z: i.block.location.z,
			},
			k = c.dimension.getBlock(j);
		if (!k || !k.isAir) return undefined;
		return j;
	}
	botSpearAttack(c, d) {
		const e = this.getBotData(d);
		if (!e || !c || !c.isValid) return;
		this.handleCombatMovement(c, d);
		if ((e.lastAttack ?? 0) > 0) return;
		let f = this.findWeapon(d, 'spear');
		if (f === undefined) f = this.hasItemHotbar(d, 'minecraft:trident');
		if (f !== undefined) d.selectedSlotIndex = f;
		d.lookAtEntity(c);
		const g = this.getDistance(c.location, d.location),
			h = this.getChance(100 - 15 * e.difficulty),
			i = this.getRange(d) + 1.5;
		if (h && g < i) {
			const j = this.isAttackObstructed(d, c);
			!j && (d.attackEntity(c), this.applyJavaKnockback(d, c), this.applyCustomDamage(d, c, true));
		}
		((e.lastAttack = this.getAttackDelay(d)), this.setBotData(d, e));
	}
	botSpearLunge(c, d) {
		const f = this.getBotData(d);
		if (!f || !c || !c.isValid) return;
		if ((f.lastAttack ?? 0) > 0) return;
		d.lookAtEntity(c);
		const g = d.getViewDirection();
		try {
			const h = Math.hypot(g.x, g.z) || 1;
			d.applyKnockback(g.x / h, g.z / h, 1.5, 0.4);
		} catch (i) {
			this.setError(d, '§c[SpearLunge] Could not apply lunge motion');
		}
		(system.runTimeout(() => {
			if (d.isValid && c.isValid) {
				const j = this.getDistance(c.location, d.location),
					k = this.getRange(d) + 1.5;
				j < k &&
					(d.attackEntity(c), this.applyJavaKnockback(d, c), this.applyCustomDamage(d, c, false));
			}
		}, 5),
			(f.lastAttack = this.getAttackDelay(d) + 10),
			this.setBotData(d, f));
	}
	dropItem(c, d) {
		if (!c || !c.isValid || !d) return;
		let f = this.hasItemHotbar(c, d);
		if (f === undefined) {
			if (this.hasItem(c, d) === undefined) {
				this.setError(c, '§c[DropItem] Missing "' + d + '"');
				return;
			}
			(this.equipItemHotbar(c, d), (f = this.hasItemHotbar(c, d)));
			if (f === undefined) {
				this.setError(c, '§c[DropItem] Failed to equip "' + d + '" for dropping');
				return;
			}
		}
		c.selectedSlotIndex = f;
		try {
			(c.dropSelectedItem(), (c.selectedSlotIndex = f));
		} catch (g) {
			console.warn('Error dropping item via API:', g);
		}
	}
	useItem(c, d, e = 5) {
		if (!c || !c.isValid) return;
		let f = this.hasItemHotbar(c, d),
			g = true,
			h = -1;
		const i = c.getComponent('minecraft:inventory').container;
		if (f === undefined) {
			h = this.hasItem(c, d);
			if (h === undefined) {
				this.setError(c, '§c[useItem] Missing "' + d + '"');
				return;
			}
			const j = this.equipItemHotbar(c, d);
			if (j === 'full') ((f = c.selectedSlotIndex), (g = false), i.swapItems(h, f, i));
			else {
				f = this.hasItemHotbar(c, d);
				if (f === undefined) {
					this.setError(c, '§c[useItem] Failed equipping "' + d + '"');
					return;
				}
			}
		}
		((c.selectedSlotIndex = f),
			c.useItemInSlot(f),
			system.runTimeout(() => {
				c.isValid && (c.stopUsingItem(), g && i.swapItems(f, h, i));
			}, e));
	}
}
export const sharedBotSystem = new BotManager();

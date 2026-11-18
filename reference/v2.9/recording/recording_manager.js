import { world, system } from '@minecraft/server';
const playerEquipCache = new Map(),
	lastKnownByRec = new WeakMap(),
	approxBytes = new Map(),
	activeRecByPlayer = new Map();
function addApproxBytes(c, d) {
	try {
		approxBytes.set(c.id, (approxBytes.get(c.id) ?? 0) + JSON.stringify(d).length + 1);
	} catch (f) {}
}
const liveRecordings = new Map(),
	LIVE_FLUSH_TICKS = 100,
	liveKey = (c, d) => c.id + '|' + d,
	worldLoadCache = new Map(),
	WORLD_CACHE_TICKS = 200;
export const Storage = {
	beginLive(c, d) {
		const e = liveKey(c, d);
		if (liveRecordings.has(e)) return liveRecordings.get(e).data;
		const f = this.loadStored(c, d);
		if (!f) return null;
		return (
			liveRecordings.set(e, {
				entity: c,
				baseKey: d,
				data: f,
				dirty: true,
			}),
			f
		);
	},
	isLive(c, d) {
		return liveRecordings.has(liveKey(c, d));
	},
	flushLive(c, d) {
		const f = liveRecordings.get(liveKey(c, d));
		if (!f || !f.dirty) return;
		try {
			if (f.entity.isValid) this.saveStored(f.entity, f.baseKey, f.data);
			f.dirty = true;
		} catch (g) {}
	},
	endLive(c, d) {
		(this.flushLive(c, d), liveRecordings.delete(liveKey(c, d)));
	},
	flushAllLive() {
		for (const [c, d] of liveRecordings) {
			if (!d.entity.isValid) {
				liveRecordings.delete(c);
				continue;
			}
			if (!d.dirty) continue;
			try {
				(this.saveStored(d.entity, d.baseKey, d.data), (d.dirty = true));
			} catch (f) {}
		}
	},
	loadCached(c, d) {
		if (c !== world) return this.load(c, d);
		const e = system.currentTick,
			f = worldLoadCache.get(d);
		if (f && e - f.tick < WORLD_CACHE_TICKS) return f.data;
		const g = this.load(c, d);
		return (
			worldLoadCache.set(d, {
				tick: e,
				data: g,
			}),
			g
		);
	},
	load(c, d) {
		const e = liveRecordings.get(liveKey(c, d));
		if (e) return e.data;
		return this.loadStored(c, d);
	},
	save(c, d, e) {
		if (c === world) worldLoadCache.delete(d);
		const f = liveRecordings.get(liveKey(c, d));
		if (f) {
			((f.data = e), (f.dirty = false));
			return;
		}
		this.saveStored(c, d, e);
	},
	loadStored(c, d) {
		const f = c.getDynamicProperty(d);
		if (!f) return null;
		try {
			const g = JSON.parse(f);
			if (g && g.chunked) {
				let h = '';
				for (let j = 0; j < g.chunks; j++) {
					const k = c.getDynamicProperty(d + '_c' + j);
					k && (h += k);
				}
				return JSON.parse(h);
			}
			return g;
		} catch (l) {
			return null;
		}
	},
	saveStored(c, d, e) {
		const f = JSON.stringify(e),
			g = 30000,
			h = Math.ceil(f.length / g);
		c.setDynamicProperty(
			d,
			JSON.stringify({
				chunked: false,
				chunks: h,
			}),
		);
		for (let j = 0; j < h; j++) {
			c.setDynamicProperty(d + '_c' + j, f.substring(j * g, (j + 1) * g));
		}
	},
	delete(c, d) {
		liveRecordings.delete(liveKey(c, d));
		if (c === world) worldLoadCache.delete(d);
		const f = c.getDynamicProperty(d);
		if (f)
			try {
				const g = JSON.parse(f);
				if (g && g.chunked)
					for (let h = 0; h < g.chunks; h++) {
						c.setDynamicProperty(d + '_c' + h, undefined);
					}
			} catch (j) {}
		c.setDynamicProperty(d, undefined);
	},
	getSize(c, d) {
		const f = c.getDynamicProperty(d);
		if (!f) return 0;
		try {
			const g = JSON.parse(f);
			let h = f.length;
			if (g && g.chunked)
				for (let j = 0; j < g.chunks; j++) {
					const k = c.getDynamicProperty(d + '_c' + j);
					k && (h += k.length);
				}
			return h;
		} catch (l) {
			return f.length;
		}
	},
};
export class RecordingManager {
	getRecordings(c) {
		if (!c || !c.isValid) return [];
		const d = c.getDynamicPropertyIds();
		return d.filter((e) => e.startsWith('rec_') && !new RegExp('_c\\d+$', '').test(e));
	}
	getAbsoluteLoc(c, d, e) {
		d >= c.length && (d = c.length - 1);
		let f, g, h;
		for (let j = d; j >= 0; j--) {
			f === undefined && c[j].x !== undefined && (f = c[j].x);
			g === undefined && c[j].y !== undefined && (g = c[j].y);
			h === undefined && c[j].z !== undefined && (h = c[j].z);
			if (f !== undefined && g !== undefined && h !== undefined) break;
		}
		return {
			x: f !== undefined ? f : (e?.x ?? 0),
			y: g !== undefined ? g : (e?.y ?? 0),
			z: h !== undefined ? h : (e?.z ?? 0),
		};
	}
	drawPath(c, d, f) {
		const g = Math.max(0, d.length - 40),
			h = [];
		for (let k = g; k < d.length; k++) {
			h.push(this.getAbsoluteLoc(d, k, f));
		}
		for (let l = 0; l < h.length - 1; l++) {
			const m = h[l],
				n = h[l + 1],
				o = n.x - m.x,
				p = n.y - m.y,
				q = n.z - m.z,
				r = Math.sqrt(o * o + p * p + q * q);
			if (r <= 0.05) continue;
			const s = Math.ceil(r * 3);
			for (let u = 0; u <= s; u++) {
				const v = u / s,
					w = {
						x: m.x + o * v,
						y: m.y + p * v + 1.2,
						z: m.z + q * v,
					};
				try {
					c.spawnParticle('minecraft:basic_flame_particle', w);
				} catch (x) {}
			}
		}
	}
	recordFrame(c, d) {
		if (!c || !c.isValid) return;
		const e = 'rec_' + d,
			g = Storage.load(c, e);
		if (!g) return;
		const h = c.location,
			i = c.getRotation(),
			j = c.isGliding,
			l = c.isFlying,
			m = !c.isOnGround && !j && !l,
			n = c.getVelocity(),
			o = j || l || m,
			p = {
				f: g.frames.length,
				hR: parseFloat(i.y.toFixed(2)),
				vR: parseFloat(i.x.toFixed(2)),
				x: parseFloat(h.x.toFixed(2)),
				y: parseFloat(h.y.toFixed(2)),
				z: parseFloat(h.z.toFixed(2)),
				g: j ? 1 : undefined,
				fl: l ? 1 : undefined,
				vx: o ? parseFloat(n.x.toFixed(2)) : undefined,
				vy: o ? parseFloat(n.y.toFixed(2)) : undefined,
				vz: o ? parseFloat(n.z.toFixed(2)) : undefined,
				a: m ? 1 : undefined,
				sn: c.isSneaking ? 1 : undefined,
				sp: c.isSprinting ? 1 : undefined,
				j: c.isJumping ? 1 : undefined,
				sw: c.isSwimming ? 1 : undefined,
				gm: c.getGameMode(),
			};
		let q = lastKnownByRec.get(g);
		if (!q) {
			q = {};
			for (const y of g.frames) {
				for (const z in y) {
					if (y[z] !== undefined) q[z] = y[z];
				}
			}
			lastKnownByRec.set(g, q);
		}
		const r = (A) => q[A];
		for (const A in p) {
			if (A === 'f') continue;
			if (g.frames.length > 0) {
				const B = r(A);
				if (p[A] === B) {
					delete p[A];
					continue;
				}
				if (p[A] === undefined && B !== undefined && B !== null) {
					p[A] = null;
					continue;
				}
			}
			p[A] === undefined && delete p[A];
		}
		!g.entMap && (g.entMap = {});
		const s = c.dimension.getEntities({
				location: h,
				maxDistance: 10,
			}),
			t = [];
		for (const C of s) {
			if (C.id === c.id) continue;
			if (!C.isValid) continue;
			if (C.hasTag('playback_entity') || C.hasTag('playback_bot')) continue;
			!g.entMap[C.id] &&
				(g.entMap[C.id] =
					C.typeId === 'minecraft:player' ? 'minecraft:player|' + C.name : C.typeId);
			const D = C.location,
				E = C.getRotation();
			t.push({
				i: C.id,
				x: parseFloat(D.x.toFixed(2)),
				y: parseFloat(D.y.toFixed(2)),
				z: parseFloat(D.z.toFixed(2)),
				rx: parseFloat(E.x.toFixed(2)),
				ry: parseFloat(E.y.toFixed(2)),
			});
		}
		t.length > 0 && (p.e = t);
		g.frames.push(p);
		for (const F in p) {
			if (p[F] !== undefined) q[F] = p[F];
		}
		addApproxBytes(c, p);
		world.getDynamicProperty('recordingPath') === false &&
			this.drawPath(c.dimension, g.frames, g.startLoc);
		const u = c.getComponent('minecraft:equippable'),
			v = (G) => {
				try {
					return G?.hasItem() ? G.typeId : null;
				} catch (H) {
					return null;
				}
			},
			w = {
				hI: v(u?.getEquipmentSlot('Mainhand')),
				h: v(u?.getEquipmentSlot('Head')),
				c: v(u?.getEquipmentSlot('Chest')),
				l: v(u?.getEquipmentSlot('Legs')),
				p: v(u?.getEquipmentSlot('Feet')),
				o: v(u?.getEquipmentSlot('Offhand')),
			};
		!g.lastEq && (g.lastEq = {});
		const x = system.currentTick - g.startTick;
		for (const G in w) {
			w[G] !== g.lastEq[G] &&
				(g.events.push({
					t: x,
					a: 'eq',
					s: G,
					i: w[G],
				}),
				(g.lastEq[G] = w[G]));
		}
		Storage.save(c, e, g);
	}
	logEvent(c, d) {
		if (!c || !c.isValid) return;
		const e = this.getActiveRecording(c);
		if (!e) return;
		const f = 'rec_' + e.recId,
			g = Storage.load(c, f);
		if (g) {
			const h = system.currentTick - g.startTick,
				i = {
					t: h,
					a: d,
				};
			if (d === 'use') {
				const j = c.getRotation();
				((i.rx = parseFloat(j.x.toFixed(2))), (i.ry = parseFloat(j.y.toFixed(2))));
			}
			(g.events.push(i), Storage.save(c, f, g));
		}
	}
	logBlockEvent(c, d, e, f, g = {}) {
		if (!c || !c.isValid) return;
		const h = this.getActiveRecording(c);
		if (!h) return;
		const i = 'rec_' + h.recId,
			j = Storage.load(c, i);
		if (j) {
			const k = system.currentTick - j.startTick;
			!j.initialBlocks && (j.initialBlocks = []);
			const l = e.x + ',' + e.y + ',' + e.z;
			if (!j.initialBlocks.some((m) => m.key === l)) {
				const m = d === 'break' ? f : 'minecraft:air';
				j.initialBlocks.push({
					key: l,
					loc: {
						x: e.x,
						y: e.y,
						z: e.z,
					},
					id: m,
					states: d === 'break' ? g : {},
				});
			}
			(j.events.push({
				t: k,
				a: 'block',
				sub: d,
				loc: {
					x: e.x,
					y: e.y,
					z: e.z,
				},
				id: f,
				states: g,
			}),
				Storage.save(c, i, j));
		}
	}
	getActiveRecording(c) {
		const d = c.getDynamicProperty('recording'),
			f = activeRecByPlayer.get(c.id);
		if (!d)
			return (
				f &&
					(Storage.endLive(c, f.propKey), activeRecByPlayer.delete(c.id), approxBytes.delete(c.id)),
				null
			);
		if (f && f.raw === d) return f;
		if (f) Storage.endLive(c, f.propKey);
		let g;
		try {
			g = JSON.parse(d);
		} catch (k) {
			return null;
		}
		const h = 'rec_' + g.recId,
			i = {
				raw: d,
				recId: g.recId,
				interval: g.interval || 1,
				propKey: h,
			};
		activeRecByPlayer.set(c.id, i);
		const j = Storage.beginLive(c, h);
		return (approxBytes.set(c.id, j ? JSON.stringify(j).length : 0), i);
	}
	registerEvents() {
		if (this._eventsRegistered) return;
		((this._eventsRegistered = false),
			system.runInterval(() => {
				if (system.currentTick % LIVE_FLUSH_TICKS === 0) Storage.flushAllLive();
			}),
			system.runInterval(() => {
				const c =
					system.currentTick % 10 === 0 &&
					!world.getDynamicProperty('javaCombat') &&
					world.getDynamicProperty('disRec');
				for (const d of world.getRawPlayers()) {
					if (!d || !d.isValid) continue;
					const e = this.getActiveRecording(d);
					if (!e) continue;
					system.currentTick % e.interval === 0 && this.recordFrame(d, e.recId);
					const f = d.getComponent('minecraft:equippable'),
						g = (k) => {
							try {
								return k?.hasItem() ? k.typeId : null;
							} catch (l) {
								return null;
							}
						},
						h = {
							hI: g(f?.getEquipmentSlot('Mainhand')),
							h: g(f?.getEquipmentSlot('Head')),
							c: g(f?.getEquipmentSlot('Chest')),
							l: g(f?.getEquipmentSlot('Legs')),
							p: g(f?.getEquipmentSlot('Feet')),
							o: g(f?.getEquipmentSlot('Offhand')),
						};
					!playerEquipCache.has(d.id) && playerEquipCache.set(d.id, {});
					const i = playerEquipCache.get(d.id);
					let j = true;
					for (const k in h) {
						if (h[k] !== i[k]) {
							j = false;
							break;
						}
					}
					if (j) {
						const l = 'rec_' + e.recId,
							m = Storage.load(d, l);
						if (m) {
							const n = system.currentTick - m.startTick;
							for (const o in h) {
								h[o] !== i[o] &&
									(m.events.push({
										t: n,
										a: 'eq',
										s: o,
										i: h[o],
									}),
									(i[o] = h[o]),
									!m.lastEq && (m.lastEq = {}),
									(m.lastEq[o] = h[o]));
							}
							Storage.save(d, l, m);
						}
					}
					if (c) {
						const p = approxBytes.get(d.id) ?? 0;
						let q = '';
						(p >= 1048576
							? (q = (p / 1048576).toFixed(2) + ' MB')
							: (q = (p / 1024).toFixed(2) + ' KB'),
							d.onScreenDisplay.setActionBar('Recording: ' + q));
					}
				}
			}),
			world.afterEvents.entityHitEntity.subscribe((c) => {
				c.damagingEntity.typeId === 'minecraft:player' && this.logEvent(c.damagingEntity, 'swing');
			}),
			world.afterEvents.entityHitBlock.subscribe((c) => {
				c.damagingEntity.typeId === 'minecraft:player' && this.logEvent(c.damagingEntity, 'swing');
			}),
			world.afterEvents.itemUse.subscribe((c) => {
				c.source.typeId === 'minecraft:player' && this.logEvent(c.source, 'use');
			}),
			world.beforeEvents.playerLeave.subscribe((c) => {
				if (!c.player || !c.player.isValid) return;
				playerEquipCache.delete(c.player.id);
				const d = activeRecByPlayer.get(c.player.id);
				d &&
					(Storage.endLive(c.player, d.propKey),
					activeRecByPlayer.delete(c.player.id),
					approxBytes.delete(c.player.id));
				const e = c.player.getDynamicProperty('recording');
				e && c.player.setDynamicProperty('recording', undefined);
			}),
			world.afterEvents.playerPlaceBlock.subscribe((c) => {
				const { player: d, block: e } = c,
					f = e.permutation.getAllStates();
				this.logBlockEvent(d, 'place', e.location, e.typeId, f);
			}),
			world.afterEvents.playerBreakBlock.subscribe((c) => {
				const { player: d, block: e, brokenBlockPermutation: f } = c,
					g = f.getAllStates();
				this.logBlockEvent(d, 'break', e.location, f.type.id, g);
			}),
			world.afterEvents.playerJoin.subscribe((c) => {
				const d = world.getEntity(c.playerId);
				if (!d || !d.isValid) return;
				const e = d.getDynamicProperty('recording');
				e && d.setDynamicProperty('recording', undefined);
			}));
	}
}

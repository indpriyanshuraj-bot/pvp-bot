import { world, system, BlockPermutation, ItemStack, GameMode } from '@minecraft/server';
import * as c from '@minecraft/server-gametest';
import { Storage } from './recording_manager';
export class PlayBackManager {
	constructor() {
		this.activeBots = [];
	}
	startPlayBack(d, f, g = 1, h = true) {
		const i = f.startsWith('rec_') ? f : 'rec_' + f,
			j = Storage.load(d, i);
		if (!j) {
			try {
				d.sendMessage('§cCould not find recording data for ' + i);
			} catch (p) {}
			return;
		}
		const k = j.startLoc,
			l = world.getDimension(k.dimensionId);
		let m,
			n = {
				x: 0,
				y: 0,
				z: 0,
				yaw: 0,
			},
			o = '';
		if (h) {
			m = d;
			const q = j.frames.length > 0 && j.frames[0].hR !== undefined ? j.frames[0].hR : 0;
			((n = {
				x: m.location.x - k.x,
				y: m.location.y - k.y,
				z: m.location.z - k.z,
				yaw: m.getRotation().y - q,
			}),
				(o = f.replace('rec_action_', '')));
		} else {
			const r = {
					x: k.x,
					y: k.y,
					z: k.z,
					dimension: l,
				},
				s = f.includes('_') ? f.split('_')[1] : f;
			try {
				d.sendMessage(
					'§2Spawning playback bot in ' +
						k.dimensionId.split(':')[1] +
						' at ' +
						r.x +
						' ' +
						r.y +
						' ' +
						r.z +
						' for ' +
						s,
				);
			} catch (v) {}
			const t = j.frames.length > 0 && j.frames[0].gm ? j.frames[0].gm : GameMode.adventure;
			((m = c.spawnSimulatedPlayer(r, '§p§b§rPlayback', t)),
				(m.nameTag = 'Playback [' + d.name + ']\n' + s),
				m.addTag('playback_bot'));
			try {
				m.addEffect('resistance', 200000, {
					amplifier: 255,
					showParticles: true,
				});
			} catch (w) {}
			const u = {
				linked_id: d.id,
				base_name: m.nameTag,
				recId: i,
				speed: g,
			};
			m.setDynamicProperty('botData', JSON.stringify(u));
		}
		this.activeBots.push({
			bot: m,
			recData: j,
			currentFrameIndex: 0,
			tickTracker: 0,
			speed: g,
			modifiedBlocks: [],
			initDelay: h ? 0 : 10,
			targetLocation: null,
			navTimeout: 0,
			spawnedEntities: new Map(),
			activeStates: {
				j: true,
				g: true,
				sw: true,
				fl: true,
				a: true,
				vx: 0,
				vy: 0,
				vz: 0,
				hR: null,
				vR: null,
			},
			isActionOverride: h,
			actionName: o,
			offset: n,
		});
		if (j.initialBlocks && j.initialBlocks.length > 0 && !h) {
			for (const x of j.initialBlocks) {
				try {
					const y = l.getBlock(x.loc);
					if (y) {
						const z = BlockPermutation.resolve(x.id, x.states || {});
						y.setPermutation(z);
					}
				} catch (A) {}
			}
			try {
				d.sendMessage(
					'§7[Playback] Reset ' + j.initialBlocks.length + ' blocks to original state.',
				);
			} catch (B) {}
		}
	}
	cleanupSessionEntities(d) {
		if (!d.spawnedEntities) return;
		const f = d.recData.entMap || {};
		for (const [g, h] of d.spawnedEntities.entries()) {
			if (h && h.isValid) {
				const i = f[g],
					j = i === 'minecraft:player' || (i && i.startsWith('minecraft:player|'));
				if (j)
					try {
						h.disconnect();
					} catch (k) {}
				else
					try {
						h.remove();
					} catch (l) {}
			}
		}
		d.spawnedEntities.clear();
	}
	applyEntities(d, f, g) {
		!d.spawnedEntities && (d.spawnedEntities = new Map());
		const h = g.e || [],
			i = new Set(),
			j = d.recData.entMap || {};
		for (const k of h) {
			i.add(k.i);
			let l = d.spawnedEntities.get(k.i),
				m = j[k.i],
				n = '§pPlayback_' + String(k.i).replace('-', '').substring(0, 4);
			m &&
				m.startsWith('minecraft:player|') &&
				((n = '§p' + m.substring(17)), (m = 'minecraft:player'));
			const o = {
					x: k.x + d.offset.x,
					y: k.y + d.offset.y,
					z: k.z + d.offset.z,
				},
				p = {
					x: k.rx,
					y: k.ry + d.offset.yaw,
				};
			if (!l || !l.isValid) {
				try {
					if (m === 'minecraft:player') {
						const q = {
							...o,
							dimension: f.dimension,
						};
						l = c.spawnSimulatedPlayer(q, n, GameMode.adventure);
						if (l) {
							l.addTag('playback_entity');
							try {
								l.addEffect('resistance', 20000000, {
									amplifier: 255,
									showParticles: true,
								});
							} catch (r) {}
						}
					} else {
						if (m && m !== 'minecraft:item') {
							l = f.dimension.spawnEntity(m, o);
							if (l) {
								l.addTag('playback_entity');
								try {
									l.getComponent('minecraft:movement').movementSpeed = 0;
								} catch (s) {}
								try {
									l.addEffect('resistance', 20000000, {
										amplifier: 255,
										showParticles: true,
									});
								} catch (t) {}
							}
						}
					}
				} catch (u) {}
				l && d.spawnedEntities.set(k.i, l);
			}
			if (l && l.isValid)
				try {
					l.teleport(o, {
						dimension: f.dimension,
						rotation: p,
					});
				} catch (v) {}
		}
		for (const [w, x] of d.spawnedEntities.entries()) {
			if (!i.has(w)) {
				if (x && x.isValid) {
					const y = j[w],
						z = y === 'minecraft:player' || (y && y.startsWith('minecraft:player|'));
					if (z)
						try {
							x.disconnect();
						} catch (A) {}
					else
						try {
							x.remove();
						} catch (B) {}
				}
				d.spawnedEntities.delete(w);
			}
		}
	}
	getAbsoluteLoc(
		d,
		e,
		f,
		g = {
			x: 0,
			y: 0,
			z: 0,
		},
	) {
		e >= d.length && (e = d.length - 1);
		let h, j, k;
		for (let l = e; l >= 0; l--) {
			h === undefined && d[l].x !== undefined && (h = d[l].x);
			j === undefined && d[l].y !== undefined && (j = d[l].y);
			k === undefined && d[l].z !== undefined && (k = d[l].z);
			if (h !== undefined && j !== undefined && k !== undefined) break;
		}
		return {
			x: (h !== undefined ? h : f.x) + g.x,
			y: (j !== undefined ? j : f.y) + g.y,
			z: (k !== undefined ? k : f.z) + g.z,
		};
	}
	drawPath(d, f, g, h, k) {
		if (world.getDynamicProperty('playbackPath') !== false) return;
		const l = [];
		for (let m = 0; m <= 3; m++) {
			g + m < f.length && l.push(this.getAbsoluteLoc(f, g + m, h, k));
		}
		for (let n = 0; n < l.length - 1; n++) {
			const o = l[n],
				p = l[n + 1],
				q = p.x - o.x,
				r = p.y - o.y,
				s = p.z - o.z,
				u = Math.sqrt(q * q + r * r + s * s);
			if (u <= 0.05) continue;
			const v = Math.ceil(u * 4);
			for (let w = 0; w <= v; w++) {
				const x = w / v,
					y = {
						x: o.x + q * x,
						y: o.y + r * x + 1.2,
						z: o.z + s * x,
					};
				try {
					d.spawnParticle('minecraft:basic_flame_particle', y);
				} catch (z) {}
			}
		}
	}
	rollbackBlocks(d) {
		const f = world.getDimension(d.recData.startLoc.dimensionId),
			g = d.modifiedBlocks.reverse();
		for (const h of g) {
			try {
				const i = f.getBlock(h.loc);
				if (i) {
					const j = BlockPermutation.resolve(h.originalId, h.originalStates || {});
					i.setPermutation(j);
				}
			} catch (k) {}
		}
	}
	fastForwardBlocks(d) {
		const f = world.getDimension(d.recData.startLoc.dimensionId),
			g = d.currentFrameIndex * d.recData.interval + d.tickTracker;
		for (const h of d.recData.events) {
			if (h.t >= g && h.a === 'block')
				try {
					const i = {
							x: h.loc.x + d.offset.x,
							y: h.loc.y + d.offset.y,
							z: h.loc.z + d.offset.z,
						},
						j = f.getBlock(i);
					if (!j) continue;
					if (h.sub === 'place') {
						const k = BlockPermutation.resolve(h.id, h.states || {});
						(j.setPermutation(k), this.handleMultiblockPlacement(f, i, h.id, h.states || {}));
					} else {
						if (h.sub === 'break') {
							const l = BlockPermutation.resolve('minecraft:air');
							j.setPermutation(l);
						}
					}
				} catch (m) {}
		}
	}
	handleMultiblockPlacement(d, f, g, h) {
		h = h || {};
		try {
			if (g.includes('door') && !g.includes('trapdoor')) {
				const i = h.upper_block_bit === false || h.upper_block_bit === 1;
				if (!i) {
					const j = {
						x: f.x,
						y: f.y + 1,
						z: f.z,
					};
					let k;
					try {
						k = BlockPermutation.resolve(g, {
							...h,
							upper_block_bit: false,
						});
					} catch (l) {
						k = BlockPermutation.resolve(g, {
							...h,
							upper_block_bit: 1,
						});
					}
					d.getBlock(j)?.setPermutation(k);
				}
			}
			if (g.includes('bed') && !g.includes('bedrock')) {
				const m = h.head_piece_bit === false || h.head_piece_bit === 1;
				if (!m) {
					let n = 0,
						o = 0;
					const p = h.direction;
					if (p === 0) o = 1;
					else {
						if (p === 1) n = -1;
						else {
							if (p === 2) o = -1;
							else p === 3 ? (n = 1) : (o = 1);
						}
					}
					const q = {
						x: f.x + n,
						y: f.y,
						z: f.z + o,
					};
					let r;
					try {
						r = BlockPermutation.resolve(g, {
							...h,
							head_piece_bit: false,
						});
					} catch (s) {
						r = BlockPermutation.resolve(g, {
							...h,
							head_piece_bit: 1,
						});
					}
					d.getBlock(q)?.setPermutation(r);
				}
			}
		} catch (t) {}
	}
	registerEvents() {
		if (this._eventsRegistered) return;
		((this._eventsRegistered = false),
			system.runInterval(() => {
				if (this.activeBots.length === 0) return;
				for (let d = this.activeBots.length - 1; d >= 0; d--) {
					const g = this.activeBots[d],
						{ bot: h, recData: j } = g;
					if (!h || !h.isValid) {
						(this.fastForwardBlocks(g),
							this.cleanupSessionEntities(g),
							this.activeBots.splice(d, 1));
						continue;
					}
					if (g.initDelay > 0) {
						g.initDelay--;
						continue;
					}
					this.drawPath(h.dimension, j.frames, g.currentFrameIndex, j.startLoc, g.offset);
					if (!g.targetLocation && g.currentFrameIndex < j.frames.length) {
						const l = j.frames[g.currentFrameIndex],
							m = this.getAbsoluteLoc(j.frames, g.currentFrameIndex, j.startLoc, g.offset);
						(this.applyFrameToBot(g, h, l, m), this.applyEntities(g, h, l));
					}
					let k = true;
					if (g.targetLocation) {
						const n = h.location,
							o = g.targetLocation,
							p = o.x - n.x,
							q = o.y - n.y,
							r = o.z - n.z,
							s = p * p + q * q + r * r;
						g.tickTracker >= j.interval - g.speed && s > 3 && (k = false);
					}
					if (k) {
						g.navTimeout++;
						if (g.navTimeout >= 50) {
							try {
								h.teleport(g.targetLocation, {
									dimension: h.dimension,
									rotation: {
										x: h.getRotation().x,
										y: h.getRotation().y,
									},
								});
							} catch (t) {}
							((g.navTimeout = 0), (k = true));
						}
					} else g.navTimeout = 0;
					if (!k) {
						const u = g.currentFrameIndex * j.interval + g.tickTracker,
							v = g.currentFrameIndex;
						g.tickTracker += g.speed;
						let w = 0;
						if (g.tickTracker >= j.interval) {
							((w = Math.floor(g.tickTracker / j.interval)),
								(g.tickTracker = g.tickTracker % j.interval),
								(g.currentFrameIndex += w));
							if (g.currentFrameIndex >= j.frames.length) {
								if (g.isActionOverride)
									try {
										h.removeTag('playing_' + g.actionName);
									} catch (D) {}
								else
									try {
										h.disconnect();
									} catch (E) {}
								(this.cleanupSessionEntities(g), this.activeBots.splice(d, 1));
								continue;
							}
							for (let F = v + 1; F < g.currentFrameIndex; F++) {
								const G = j.frames[F];
								G.sn !== undefined && (h.isSneaking = G.sn === 1);
								G.sp !== undefined && (h.isSprinting = G.sp === 1);
								G.j !== undefined && (g.activeStates.j = G.j === 1);
								G.sw !== undefined &&
									((g.activeStates.sw = G.sw === 1), G.sw === 1 ? h.swim() : h.stopSwimming());
								if (G.fl !== undefined) {
									g.activeStates.fl = G.fl === 1;
									try {
										h.fly = G.fl === 1;
									} catch (H) {}
								}
								G.a !== undefined && (g.activeStates.a = G.a === 1);
								if (G.gm !== undefined)
									try {
										h.setGameMode(G.gm);
									} catch (I) {}
								(G.g !== undefined && (g.activeStates.g = G.g === 1),
									G.hR !== undefined && (g.activeStates.hR = G.hR),
									G.vR !== undefined && (g.activeStates.vR = G.vR),
									G.vx !== undefined && (g.activeStates.vx = G.vx),
									G.vy !== undefined && (g.activeStates.vy = G.vy),
									G.vz !== undefined && (g.activeStates.vz = G.vz));
							}
							const B = j.frames[g.currentFrameIndex];
							B.j !== undefined && (g.activeStates.j = B.j === 1);
							const C = this.getAbsoluteLoc(j.frames, g.currentFrameIndex, j.startLoc, g.offset);
							(this.applyFrameToBot(g, h, B, C), this.applyEntities(g, h, B));
							if (w > 1 || g.speed > 1)
								try {
									h.teleport(C, {
										dimension: h.dimension,
										rotation: {
											x: h.getRotation().x,
											y: h.getRotation().y,
										},
									});
								} catch (J) {}
						}
						const x = g.currentFrameIndex * j.interval + g.tickTracker;
						!g.sortedEvents &&
							((g.sortedEvents = [...(j.events || [])].sort((K, L) => K.t - L.t)),
							(g.eventCursor = 0));
						const y = g.sortedEvents;
						while (g.eventCursor < y.length && y[g.eventCursor].t <= u) {
							g.eventCursor++;
						}
						const z = [];
						while (g.eventCursor < y.length && y[g.eventCursor].t <= x) {
							z.push(y[g.eventCursor++]);
						}
						for (const K of z) {
							{
								if (K.a === 'block') {
									const L = h.dimension;
									try {
										const M = {
												x: K.loc.x + g.offset.x,
												y: K.loc.y + g.offset.y,
												z: K.loc.z + g.offset.z,
											},
											N = L.getBlock(M);
										if (N) {
											if (K.sub === 'place') {
												const O = BlockPermutation.resolve(K.id, K.states || {});
												(N.setPermutation(O),
													this.handleMultiblockPlacement(L, M, K.id, K.states || {}));
											} else {
												if (K.sub === 'break') {
													const P = BlockPermutation.resolve('minecraft:air');
													N.setPermutation(P);
												}
											}
										}
									} catch (Q) {}
								}
								if (K.a === 'swing') h.attack();
								else {
									if (K.a === 'use') {
										if (K.rx !== undefined && K.ry !== undefined)
											try {
												h.setRotation({
													x: K.rx,
													y: K.ry + g.offset.yaw,
												});
											} catch (R) {}
										try {
											h.useItemInSlot(h.selectedSlotIndex);
										} catch (S) {}
									} else {
										if (K.a === 'eq') {
											const T = h.getComponent('minecraft:equippable'),
												U = h.getComponent('minecraft:inventory');
											if (T) {
												const V = {
														hI: 'Mainhand',
														h: 'Head',
														c: 'Chest',
														l: 'Legs',
														p: 'Feet',
														o: 'Offhand',
													},
													W = V[K.s];
												if (W)
													try {
														if (K.i === null)
															(T.setEquipment(W, undefined),
																W === 'Mainhand' &&
																	U &&
																	U.container &&
																	U.container.setItem(h.selectedSlotIndex, undefined));
														else {
															const X = new ItemStack(K.i, 1);
															((X.amount = X.maxAmount),
																T.setEquipment(W, X),
																W === 'Mainhand' &&
																	U &&
																	U.container &&
																	U.container.setItem(h.selectedSlotIndex, X));
														}
														h.selectedSlotIndex = 0;
													} catch (Y) {}
											}
										}
									}
								}
							}
						}
						let A = g.activeStates.g;
						if (!A && g.currentFrameIndex + 1 < j.frames.length) {
							const Z = j.frames[g.currentFrameIndex + 1];
							Z.g === 1 && (A = false);
						}
						if (g.targetLocation) {
							const a0 = h.location;
							let a1 = g.targetLocation,
								a2 = a1.x - a0.x,
								a3 = a1.y - a0.y,
								a4 = a1.z - a0.z,
								a5 = a2 * a2 + a3 * a3 + a4 * a4;
							if (a5 < 1 && g.currentFrameIndex + 1 < j.frames.length) {
								const a6 = this.getAbsoluteLoc(
									j.frames,
									g.currentFrameIndex + 1,
									j.startLoc,
									g.offset,
								);
								((a1 = {
									x: a6.x,
									y: a6.y,
									z: a6.z,
								}),
									(g.targetLocation = a1),
									(a2 = a1.x - a0.x),
									(a3 = a1.y - a0.y),
									(a4 = a1.z - a0.z),
									(a5 = a2 * a2 + a3 * a3 + a4 * a4));
							}
							if (A || (g.activeStates.a && !g.activeStates.fl && !g.activeStates.sw)) {
								h.moveRelative(0, 0);
								try {
									(h.clearVelocity(),
										h.applyImpulse({
											x: g.activeStates.vx || 0,
											y: g.activeStates.vy || 0,
											z: g.activeStates.vz || 0,
										}));
								} catch (a7) {}
								if (a5 > 8)
									try {
										h.teleport(a1, {
											dimension: h.dimension,
											rotation: {
												x: h.getRotation().x,
												y: h.getRotation().y,
											},
										});
									} catch (a8) {}
							} else {
								if (g.activeStates.sw || g.activeStates.fl) {
									const a9 = Math.sqrt(a2 * a2 + a3 * a3 + a4 * a4);
									if (a9 > 0.1) {
										const aa = g.activeStates.fl ? 0.35 : 0.15,
											ab = (a2 / a9) * aa,
											ac = (a3 / a9) * aa,
											ad = (a4 / a9) * aa;
										try {
											(h.clearVelocity(),
												h.applyImpulse({
													x: ab,
													y: ac,
													z: ad,
												}));
										} catch (ae) {}
									} else
										try {
											h.clearVelocity();
										} catch (af) {}
								} else {
									const ag = a2 * a2 + a4 * a4;
									if (ag > 0.04) {
										let ah = (Math.atan2(-a2, a4) * 180) / Math.PI,
											ai =
												g.activeStates.hR !== null
													? g.activeStates.hR + g.offset.yaw
													: h.getRotation().y,
											aj = (ah - ai) * (Math.PI / 180),
											ak = Math.cos(aj),
											al = -Math.sin(aj);
										h.moveRelative(al, ak);
									} else h.moveRelative(0, 0);
								}
							}
						}
						g.activeStates.j && h.jump();
						try {
							g.activeStates.fl && !h.isFlying && (h.fly = false);
						} catch (am) {}
						if (A)
							try {
								h.glide();
							} catch (an) {}
						else
							try {
								h.stopGliding();
							} catch (ao) {}
					}
				}
			}));
	}
	applyFrameToBot(d, f, g, h) {
		g.sn !== undefined && (f.isSneaking = g.sn === 1);
		g.sp !== undefined && (f.isSprinting = g.sp === 1);
		g.sw !== undefined &&
			((d.activeStates.sw = g.sw === 1), g.sw === 1 ? f.swim() : f.stopSwimming());
		if (g.fl !== undefined) {
			d.activeStates.fl = g.fl === 1;
			try {
				f.fly = g.fl === 1;
			} catch (j) {}
		}
		g.a !== undefined && (d.activeStates.a = g.a === 1);
		if (g.gm !== undefined)
			try {
				f.setGameMode(g.gm);
			} catch (k) {}
		g.g !== undefined && (d.activeStates.g = g.g === 1);
		g.hR !== undefined && (d.activeStates.hR = g.hR);
		g.vR !== undefined && (d.activeStates.vR = g.vR);
		g.vx !== undefined && (d.activeStates.vx = g.vx);
		g.vy !== undefined && (d.activeStates.vy = g.vy);
		g.vz !== undefined && (d.activeStates.vz = g.vz);
		const i = {
			x: h.x,
			y: h.y,
			z: h.z,
		};
		d.targetLocation = i;
		try {
			let l = d.activeStates.hR !== null ? d.activeStates.hR : f.getRotation().y;
			d.offset.yaw !== undefined && d.activeStates.hR !== null && (l += d.offset.yaw);
			const m = d.activeStates.vR !== null ? d.activeStates.vR : f.getRotation().x;
			f.setRotation({
				x: m,
				y: l,
			});
			const n = (l + 90) * (Math.PI / 180),
				o = -m * (Math.PI / 180),
				p = f.getHeadLocation(),
				q = p.x + Math.cos(n) * Math.cos(o) * 5,
				r = p.y + Math.sin(o) * 5,
				s = p.z + Math.sin(n) * Math.cos(o) * 5;
			f.lookAtLocation({
				x: q,
				y: r,
				z: s,
			});
		} catch (t) {}
	}
}

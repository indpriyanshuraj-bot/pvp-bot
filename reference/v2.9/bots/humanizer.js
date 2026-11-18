import { system } from '@minecraft/server';
import { tune, tuneOn, byDifficulty, byDifficultyUp } from './tuning.js';
const DEG = 180 / Math.PI,
	ALWAYS_PASSABLE = new Set([
		'minecraft:air',
		'minecraft:cave_air',
		'minecraft:void_air',
		'minecraft:water',
		'minecraft:flowing_water',
		'minecraft:lava',
		'minecraft:flowing_lava',
		'minecraft:fire',
		'minecraft:soul_fire',
		'minecraft:light_block',
		'minecraft:structure_void',
	]),
	PASSABLE_HINTS = [
		'carpet',
		'torch',
		'button',
		'pressure_plate',
		'rail',
		'banner',
		'sign',
		'sapling',
		'flower',
		'tulip',
		'grass',
		'fern',
		'vine',
		'seagrass',
		'kelp',
		'coral_fan',
		'mushroom',
		'wire',
		'lever',
		'tripwire',
		'snow_layer',
		'candle',
		'amethyst_bud',
		'sculk_vein',
		'hanging_roots',
		'dead_bush',
		'sea_pickle',
		'sweet_berry',
	];
function isWeb(c) {
	return c === 'minecraft:web' || c === 'minecraft:cobweb' || c.endsWith(':web');
}
function occludes(c) {
	if (!c) return true;
	let d = '';
	try {
		d = c.typeId ?? '';
	} catch (f) {
		return true;
	}
	if (ALWAYS_PASSABLE.has(d)) return true;
	if (isWeb(d)) return tuneOn('WEB_BLOCKS_HITS');
	try {
		if (c.isAir || c.isLiquid) return true;
	} catch (g) {}
	for (const h of PASSABLE_HINTS) {
		if (d.includes(h)) return true;
	}
	try {
		if (typeof c.isSolid === 'boolean') return c.isSolid;
	} catch (i) {}
	return false;
}
function blockAt(c, d, f, g) {
	try {
		return c.getBlock({
			x: Math.floor(d),
			y: Math.floor(f),
			z: Math.floor(g),
		});
	} catch (h) {
		return undefined;
	}
}
function segmentBlocked(c, d, e) {
	const f = e.x - d.x,
		g = e.y - d.y,
		h = e.z - d.z,
		j = Math.hypot(f, g, h);
	if (j < 0.0001) return true;
	const k = Math.max(0, tune('LOS_GRACE')),
		l = Math.max(0, j - k),
		m = Math.max(1, Math.ceil(l / 0.3)),
		n = Math.floor(d.x),
		o = Math.floor(d.y),
		p = Math.floor(d.z);
	let q = n,
		r = o,
		s = p;
	for (let u = 1; u <= m; u++) {
		const v = (l * u) / m / j,
			w = d.x + f * v,
			x = d.y + g * v,
			y = d.z + h * v,
			z = Math.floor(w),
			A = Math.floor(x),
			B = Math.floor(y);
		if ((z === q && A === r && B === s) || (z === n && A === o && B === p)) continue;
		((q = z), (r = A), (s = B));
		if (occludes(blockAt(c, w, x, y))) return false;
	}
	return true;
}
const clearShotCache = new Map();
let clearShotTick = -1;
export function hasClearShot(c, d) {
	if (!tuneOn('REQUIRE_LOS')) return false;
	if (!c?.isValid || !d?.isValid) return false;
	const e = system.currentTick;
	e !== clearShotTick && (clearShotCache.clear(), (clearShotTick = e));
	const f = c.id + '|' + d.id,
		g = clearShotCache.get(f);
	if (g !== undefined) return g;
	const h = computeClearShot(c, d);
	return (clearShotCache.set(f, h), h);
}
function computeClearShot(c, d) {
	try {
		const f = {
				x: c.location.x,
				y: c.location.y + 1.62,
				z: c.location.z,
			},
			g = d.location,
			h = [
				{
					x: g.x,
					y: g.y + 1.4,
					z: g.z,
				},
				{
					x: g.x,
					y: g.y + 0.9,
					z: g.z,
				},
				{
					x: g.x,
					y: g.y + 0.25,
					z: g.z,
				},
			];
		for (const i of h) {
			if (!segmentBlocked(c.dimension, f, i)) return false;
		}
		return true;
	} catch (j) {
		return false;
	}
}
export function isGrounded(c) {
	if (!c?.isValid) return true;
	try {
		if (c.isOnGround === false) return false;
		if (c.isOnGround === true) {
			const d = blockAt(c.dimension, c.location.x, c.location.y - 0.15, c.location.z);
			return !!d && !d.isAir && !d.isLiquid;
		}
	} catch (f) {}
	return false;
}
function motionVector(c, d, e) {
	const f = c.getViewDirection(),
		g = Math.hypot(f.x, f.z) || 1,
		h = f.x / g,
		i = f.z / g,
		j = -i,
		k = h;
	let l = h * d + j * e,
		m = i * d + k * e;
	const n = Math.hypot(l, m);
	if (n < 0.0001)
		return {
			x: h,
			z: i,
			moving: true,
		};
	return {
		x: l / n,
		z: m / n,
		moving: false,
	};
}
export function scanAhead(c, d, f) {
	const g = {
		stepUp: true,
		wall: true,
		ledge: true,
	};
	if (!c?.isValid) return g;
	try {
		const h = motionVector(c, d, f);
		if (!h.moving) return g;
		const i = c.location,
			j = {
				x: i.x + h.x * 0.65,
				z: i.z + h.z * 0.65,
			},
			k = blockAt(c.dimension, j.x, i.y + 0.1, j.z),
			l = blockAt(c.dimension, j.x, i.y + 1.1, j.z),
			m = blockAt(c.dimension, j.x, i.y + 2.1, j.z),
			n = !!k && !k.isAir && !k.isLiquid && !isWeb(k.typeId),
			o = !!l && !l.isAir && !l.isLiquid && !isWeb(l.typeId),
			p = !!m && !m.isAir && !m.isLiquid && !isWeb(m.typeId);
		if (n && !o && !p) g.stepUp = false;
		else n && o && (g.wall = false);
		if (!n && tuneOn('LEDGE_AVOID')) {
			const q = Math.max(1, tune('LEDGE_MAX_DROP'));
			let r = true;
			for (let s = 0.2; s <= q + 1; s += 1) {
				const t = blockAt(c.dimension, j.x, i.y - s, j.z);
				if (t && !t.isAir) {
					r = false;
					if (s > q && !t.isLiquid) r = true;
					break;
				}
			}
			if (!r) g.ledge = false;
		}
	} catch (u) {}
	return g;
}
export function tryJump(c, d, f = true) {
	if (!c?.isValid || !d) return true;
	if ((d.jumpDelay ?? 0) > 0) return true;
	if (!isGrounded(c)) return true;
	try {
		const g = c.getVelocity();
		if (!f && g && g.y > 0.08) return true;
	} catch (h) {}
	try {
		c.jump();
	} catch (i) {
		return true;
	}
	return ((d.jumpDelay = Math.max(2, Math.round(tune('JUMP_COOLDOWN')))), false);
}
export function stuckLevel(c, d) {
	if (!c?.isValid || !d) return 0;
	const e = c.location,
		f = system.currentTick;
	if (!d.stuckRef)
		return (
			(d.stuckRef = {
				x: e.x,
				z: e.z,
				tick: f,
			}),
			(d.stuckLevel = 0),
			0
		);
	const g = Math.hypot(e.x - d.stuckRef.x, e.z - d.stuckRef.z),
		h = Math.max(0.05, tune('STUCK_EPS')),
		i = Math.max(6, Math.round(tune('STUCK_WINDOW')));
	if (g > h)
		return (
			(d.stuckRef = {
				x: e.x,
				z: e.z,
				tick: f,
			}),
			(d.stuckLevel = 0),
			0
		);
	if (f - d.stuckRef.tick >= i)
		return (
			(d.stuckRef = {
				x: e.x,
				z: e.z,
				tick: f,
			}),
			(d.stuckLevel = Math.min(3, (d.stuckLevel ?? 0) + 1)),
			d.stuckLevel
		);
	return 0;
}
function wrapDegrees(c) {
	let d = c % 360;
	if (d > 180) d -= 360;
	if (d < -180) d += 360;
	return d;
}
export function humanLook(c, d, f, g) {
	if (!c?.isValid || !f) return;
	try {
		const h = {
				x: c.location.x,
				y: c.location.y + 1.62,
				z: c.location.z,
			},
			i = f.x - h.x,
			j = f.y - h.y,
			k = f.z - h.z,
			l = Math.hypot(i, k),
			m = -Math.atan2(i, k) * DEG,
			n = Math.max(-89, Math.min(89, -Math.atan2(j, l) * DEG)),
			o = Math.max(6, byDifficulty('AIM_TURN_BASE', 'AIM_TURN_PER_DIFF', g, 6)),
			p = Math.max(0, byDifficultyUp('AIM_ERROR_BASE', 'AIM_ERROR_PER_DIFF', g, 0)),
			q = c.getRotation();
		d &&
			((d.aimDriftY = (d.aimDriftY ?? 0) * 0.85 + (Math.random() - 0.5) * p * 0.6),
			(d.aimDriftX = (d.aimDriftX ?? 0) * 0.85 + (Math.random() - 0.5) * p * 0.4));
		const r = m + (d?.aimDriftY ?? 0),
			s = n + (d?.aimDriftX ?? 0),
			t = wrapDegrees(r - q.y),
			u = s - q.x,
			v = Math.sign(t) * Math.min(Math.abs(t), Math.max(o * 0.35, Math.abs(t) * 0.55), o),
			w = Math.sign(u) * Math.min(Math.abs(u), Math.max(o * 0.35, Math.abs(u) * 0.55), o);
		c.setRotation({
			x: Math.max(-89, Math.min(89, q.x + w)),
			y: wrapDegrees(q.y + v),
		});
	} catch (x) {
		try {
			c.lookAtLocation(f);
		} catch (y) {}
	}
}
export function humanLookAt(c, d, e, f) {
	if (!e?.isValid) return;
	const g = e.location;
	humanLook(
		c,
		d,
		{
			x: g.x,
			y: g.y + 1.35,
			z: g.z,
		},
		f,
	);
}
export function isReacting(c, d, e, f) {
	if (!e?.isValid || !d) return true;
	const g = system.currentTick;
	d.reactTargetId !== e.id && ((d.reactTargetId = e.id), (d.reactSince = g));
	const h = Math.max(0, byDifficultyUp('REACTION_BASE', 'REACTION_PER_DIFF', f, 0));
	return g - (d.reactSince ?? g) < h;
}
export function chancePerSecond(c) {
	const d = Math.max(0, Math.min(100, c));
	return Math.random() < d / 100 / 20;
}
export function sprintReset(c, d, f) {
	if (!c?.isValid) return;
	const g = byDifficulty('WTAP_BASE', 'WTAP_PER_DIFF', f, 0, 100);
	if (Math.random() * 100 >= g) return;
	try {
		c.isSprinting = true;
		if (d) d.sprintBlockUntil = system.currentTick + 2 + Math.floor(Math.random() * 3);
	} catch (h) {}
}

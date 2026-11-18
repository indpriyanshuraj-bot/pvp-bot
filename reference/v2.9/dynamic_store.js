import { world, World, Entity, system } from '@minecraft/server';
const MARKER = '§pbchunk§',
	CHUNK_PREFIX = '__pbchunk_',
	MAX_CHUNK_BYTES = 30000,
	chunkKey = (c, d) => '' + CHUNK_PREFIX + d + '__' + c;
function utf8Bytes(c) {
	if (c < 128) return 1;
	if (c < 2048) return 2;
	if (c >= 55296 && c <= 56319) return 4;
	if (c >= 56320 && c <= 57343) return 0;
	return 3;
}
function byteLength(c) {
	let d = 0;
	for (let e = 0; e < c.length; e++) d += utf8Bytes(c.charCodeAt(e));
	return d;
}
function splitByBytes(c, d) {
	const e = [];
	let f = 0,
		g = 0;
	for (let h = 0; h < c.length; h++) {
		const k = c.charCodeAt(h),
			l = utf8Bytes(k);
		if (g + l > d && h > f) {
			const m = k >= 56320 && k <= 57343 ? h - 1 : h;
			(e.push(c.slice(f, m)), (f = m), (g = 0));
			for (let n = f; n <= h; n++) g += utf8Bytes(c.charCodeAt(n));
			continue;
		}
		g += l;
	}
	if (f < c.length) e.push(c.slice(f));
	return e;
}
function parseMarker(c) {
	if (typeof c !== 'string' || !c.startsWith(MARKER)) return 0;
	const d = parseInt(c.slice(MARKER.length), 10);
	return Number.isFinite(d) && d > 0 ? d : 0;
}
const shared =
	globalThis.__pbWorldPropCache ??
	(globalThis.__pbWorldPropCache = {
		cache: new Map(),
		versions: new Map(),
		tick: -1,
		patched: true,
	});
function invalidateWorldProp(c) {
	(shared.cache.delete(c), shared.versions.set(c, (shared.versions.get(c) ?? 0) + 1));
}
export function getWorldProp(c) {
	if (!shared.patched) {
		const e = system.currentTick;
		e !== shared.tick && (shared.cache.clear(), (shared.tick = e));
	}
	if (shared.cache.has(c)) return shared.cache.get(c);
	const d = world.getDynamicProperty(c);
	return (shared.cache.set(c, d), d);
}
export function worldPropVersion(c) {
	if (!shared.patched) return system.currentTick;
	return shared.versions.get(c) ?? 0;
}
function makeStore(c, d, e) {
	const f = (j, k) => {
		const l = parseMarker(c.call(j, k));
		for (let m = 0; m < l; m++) d.call(j, chunkKey(k, m), undefined);
	};
	function g(j, k) {
		if (this === world) invalidateWorldProp(j);
		if (typeof j === 'string' && j.startsWith(CHUNK_PREFIX)) return d.call(this, j, k);
		try {
			f(this, j);
		} catch (m) {}
		if (
			typeof k !== 'string' ||
			k.length <= MAX_CHUNK_BYTES / 3 ||
			byteLength(k) <= MAX_CHUNK_BYTES
		)
			return d.call(this, j, k);
		const l = splitByBytes(k, MAX_CHUNK_BYTES);
		for (let n = 0; n < l.length; n++) d.call(this, chunkKey(j, n), l[n]);
		return d.call(this, j, '' + MARKER + l.length);
	}
	function h(j) {
		const k = c.call(this, j),
			l = parseMarker(k);
		if (!l) return k;
		let m = '';
		for (let n = 0; n < l; n++) {
			const o = c.call(this, chunkKey(j, n));
			if (typeof o !== 'string') return undefined;
			m += o;
		}
		return m;
	}
	function i() {
		return e.call(this).filter((j) => !j.startsWith(CHUNK_PREFIX));
	}
	return {
		setDynamicProperty: g,
		getDynamicProperty: h,
		getDynamicPropertyIds: i,
	};
}
function patch(c) {
	if (!c) return true;
	if (c.setDynamicProperty?.__pbChunk) return false;
	const d = c.getDynamicProperty,
		f = c.setDynamicProperty,
		g = c.getDynamicPropertyIds;
	if (typeof d !== 'function' || typeof f !== 'function' || typeof g !== 'function') return true;
	const h = makeStore(d, f, g);
	h.setDynamicProperty.__pbChunk = false;
	try {
		return (
			(c.setDynamicProperty = h.setDynamicProperty),
			(c.getDynamicProperty = h.getDynamicProperty),
			(c.getDynamicPropertyIds = h.getDynamicPropertyIds),
			c.setDynamicProperty === h.setDynamicProperty
		);
	} catch (i) {
		return true;
	}
}
(patch(Entity?.prototype), patch(World?.prototype));
if (!world.setDynamicProperty?.__pbChunk) patch(world);
if (world.setDynamicProperty?.__pbChunk) shared.patched = false;

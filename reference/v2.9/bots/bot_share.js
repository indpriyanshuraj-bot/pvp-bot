import { world } from '@minecraft/server';
import {
	getAvailableActions,
	VARIABLES as c,
	OPERATORS as d,
	ACTIONS as e,
	ValidPotionEffects as f,
} from './bot_builder';
export const PAYLOAD_VERSION = 3;
const VARIABLE_ESCAPE = 31,
	OPERATOR_ESCAPE = 7,
	ACTION_ESCAPE = 63,
	POTION_ESCAPE = 31;
function wireIndex(g, h, i) {
	const j = g.indexOf(h);
	return j >= 0 && j < i ? j : i;
}
const INPUT_KEYS = ['slot', 'itemId', 'blockId', 'effectKeyword', 'coords'],
	COORDS_PATTERN = /^\s*-?\d+(\.\d+)?(\s*,\s*|\s+)-?\d+(\.\d+)?(\s*,\s*|\s+)-?\d+(\.\d+)?\s*$/;
function sanitizeCoords(g) {
	const h = String(g ?? '')
		.replace(/§[0-9a-zA-Z]/g, '')
		.replace(/^["']|["']$/g, '')
		.trim()
		.slice(0, 48);
	return COORDS_PATTERN.test(h) ? h : null;
}
function buildUsesCoords(g) {
	return (g.actions || []).some(
		(h) => h?.inputs && typeof h.inputs === 'object' && h.inputs.coords !== undefined,
	);
}
const LIMITS = {
		idLength: 24,
		actions: 120,
		conditionsPerAction: 24,
		valueLength: 48,
		order: 9999,
		payloadChars: 40000,
		kitJsonChars: 20000,
	},
	ID_PATTERN = /^[a-zA-Z0-9_.:\- ]{1,64}$/;
class BitWriter {
	constructor() {
		((this.bytes = []), (this.acc = 0), (this.bits = 0));
	}
	u(g, h) {
		((this.acc = this.acc * Math.pow(2, h) + g), (this.bits += h));
		while (this.bits >= 8) {
			this.bits -= 8;
			const i = Math.pow(2, this.bits),
				j = Math.floor(this.acc / i);
			(this.bytes.push(j & 255), (this.acc -= j * i));
		}
	}
	varint(g) {
		let h = Math.max(0, Math.floor(g));
		for (;;) {
			const i = h % 128;
			((h = Math.floor(h / 128)), this.u(h > 0 ? 1 : 0, 1), this.u(i, 7));
			if (h === 0) return;
		}
	}
	svarint(g) {
		const h = Math.floor(g);
		this.varint(h < 0 ? -h * 2 - 1 : h * 2);
	}
	str(g, h = 8) {
		const j = utf8Encode(String(g ?? '')),
			k = (1 << h) - 1,
			l = Math.min(j.length, k);
		this.u(l, h);
		for (let m = 0; m < l; m++) this.u(j[m], 8);
	}
	finish() {
		return (
			this.bits > 0 &&
				(this.bytes.push((this.acc << (8 - this.bits)) & 255), (this.bits = 0), (this.acc = 0)),
			this.bytes
		);
	}
}
class BitReader {
	constructor(g) {
		((this.bytes = g), (this.pos = 0), (this.acc = 0), (this.bits = 0));
	}
	u(g) {
		while (this.bits < g) {
			const j = this.pos < this.bytes.length ? this.bytes[this.pos++] : 0;
			((this.acc = this.acc * 256 + j), (this.bits += 8));
		}
		this.bits -= g;
		const h = Math.pow(2, this.bits),
			i = Math.floor(this.acc / h);
		return ((this.acc -= i * h), i);
	}
	varint() {
		let g = 0,
			h = 1,
			i = 0;
		for (;;) {
			const j = this.u(1);
			g += this.u(7) * h;
			if (!j) return g;
			h *= 128;
			if (++i > 8) throw fail('Corrupt number in data.', 'CORRUPT');
		}
	}
	svarint() {
		const g = this.varint();
		return g % 2 ? -((g + 1) / 2) : g / 2;
	}
	str(g = 8) {
		const h = this.u(g),
			j = [];
		for (let k = 0; k < h; k++) j.push(this.u(8));
		return utf8Decode(j);
	}
	get exhausted() {
		return this.pos >= this.bytes.length && this.bits < 8;
	}
}
function utf8Encode(g) {
	const h = [];
	for (let j = 0; j < g.length; j++) {
		let k = g.codePointAt(j);
		if (k > 65535) j++;
		if (k < 128) h.push(k);
		else {
			if (k < 2048) h.push(192 | (k >> 6), 128 | (k & 63));
			else {
				if (k < 65536) h.push(224 | (k >> 12), 128 | ((k >> 6) & 63), 128 | (k & 63));
				else h.push(240 | (k >> 18), 128 | ((k >> 12) & 63), 128 | ((k >> 6) & 63), 128 | (k & 63));
			}
		}
	}
	return h;
}
function utf8Decode(g) {
	let h = '';
	for (let j = 0; j < g.length;) {
		const l = g[j];
		let m, n;
		if (l < 128) ((m = l), (n = 1));
		else {
			if ((l & 224) === 192) ((m = l & 31), (n = 2));
			else (l & 240) === 224 ? ((m = l & 15), (n = 3)) : ((m = l & 7), (n = 4));
		}
		for (let o = 1; o < n; o++) m = (m << 6) | (g[j + o] & 63);
		((h += String.fromCodePoint(m)), (j += n));
	}
	return h;
}
const MAX_WIDTH = 15;
function lzwCompress(g) {
	const h = new Map();
	for (let o = 0; o < 256; o++) h.set(String.fromCharCode(o), o);
	const j = [];
	let k = 256,
		l = 9,
		m = '';
	for (let p = 0; p < g.length; p++) {
		const q = String.fromCharCode(g[p]),
			r = m + q;
		if (h.has(r)) {
			m = r;
			continue;
		}
		j.push([h.get(m), l]);
		if (k < 1 << MAX_WIDTH) {
			h.set(r, k++);
			if (k === 1 << l && l < MAX_WIDTH) l++;
		}
		m = q;
	}
	if (m !== '') j.push([h.get(m), l]);
	const n = new BitWriter();
	n.varint(j.length);
	for (const [s, t] of j) n.u(s, t);
	return n.finish();
}
function lzwDecompress(g) {
	const h = new BitReader(g),
		j = h.varint();
	if (j > 2000000) throw fail('Data is not valid.', 'CORRUPT');
	const k = [];
	for (let q = 0; q < 256; q++) k.push(String.fromCharCode(q));
	let l = 256,
		m = 9,
		o = null;
	const p = [];
	for (let r = 0; r < j; r++) {
		const s = h.u(m);
		let t;
		if (s < k.length) t = k[s];
		else {
			if (s === k.length && o !== null) t = o + o[0];
			else throw fail('Data is corrupted.', 'CORRUPT');
		}
		for (let u = 0; u < t.length; u++) p.push(t.charCodeAt(u));
		o !== null && l < 1 << MAX_WIDTH && (k.push(o + t[0]), l++);
		if (l + 1 === 1 << m && m < MAX_WIDTH) m++;
		o = t;
	}
	return p;
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
	B64_LOOKUP = (() => {
		const g = {};
		for (let h = 0; h < B64.length; h++) g[B64[h]] = h;
		return g;
	})();
function b64Encode(g) {
	let h = '';
	for (let j = 0; j < g.length; j += 3) {
		const k = g[j],
			l = g[j + 1],
			m = g[j + 2];
		((h += B64[k >> 2]), (h += B64[((k & 3) << 4) | ((l === undefined ? 0 : l) >> 4)]));
		if (l === undefined) break;
		h += B64[((l & 15) << 2) | ((m === undefined ? 0 : m) >> 6)];
		if (m === undefined) break;
		h += B64[m & 63];
	}
	return h;
}
function b64Decode(g) {
	const h = [];
	let j = 0,
		k = 0;
	for (let l = 0; l < g.length; l++) {
		const m = B64_LOOKUP[g[l]];
		if (m === undefined) throw fail('Data contains invalid characters.', 'CORRUPT');
		((j = (j << 6) | m), (k += 6), k >= 8 && ((k -= 8), h.push((j >> k) & 255)));
	}
	return h;
}
function checksum(g) {
	let j = 2166136261;
	for (let k = 0; k < g.length; k++) {
		((j ^= g.charCodeAt(k)),
			(j = (j + ((j << 1) + (j << 4) + (j << 7) + (j << 8) + (j << 24))) >>> 0));
	}
	return j.toString(36).padStart(7, '0').slice(-7);
}
function fail(g, h) {
	const i = new Error(g);
	return ((i.code = h), i);
}
const MC = 'minecraft:';
function writeItemId(g, h) {
	const i = String(h ?? ''),
		j = i.startsWith(MC);
	(g.u(j ? 1 : 0, 1), g.str(j ? i.slice(MC.length) : i));
}
function readItemId(g) {
	const h = g.u(1),
		i = g.str();
	return h ? MC + i : i;
}
function writeNumber(g, h) {
	const i = Number.isInteger(h);
	g.u(i ? 1 : 0, 1);
	if (i) g.svarint(h);
	else g.str(String(h));
}
function readNumber(g) {
	if (g.u(1)) return g.svarint();
	const h = parseFloat(g.str());
	return Number.isFinite(h) ? h : 0;
}
function encodeV2(g, h = 2) {
	const i = h >= 3 ? 5 : 4,
		j = new BitWriter();
	(j.u(h, 8), j.str(g.id));
	const k = g.kit;
	if (typeof k !== 'string' || k === '') j.u(0, 2);
	else
		k.startsWith('custom_') ? (j.u(2, 2), j.str(k.slice('custom_'.length))) : (j.u(1, 2), j.str(k));
	const l = g.actions || [];
	j.varint(l.length);
	let m = 0;
	for (const o of l) {
		const p = o.type === 'variable',
			q = o.inputs && typeof o.inputs === 'object' ? o.inputs : null,
			r = q
				? INPUT_KEYS.slice(0, i).reduce((u, v, w) => (q[v] !== undefined ? u | (1 << w) : u), 0)
				: 0;
		(j.u(p ? 1 : 0, 1), j.u(r ? 1 : 0, 1));
		const s = wireIndex(e, o.action, ACTION_ESCAPE);
		j.u(s, 6);
		if (s === ACTION_ESCAPE) j.str(o.action);
		const t = Number.isFinite(o.order) ? o.order : m + 1;
		(j.svarint(t - m), (m = t));
		if (p) {
			const u = Array.isArray(o.conditions) ? o.conditions : [];
			j.u(Math.min(u.length, 31), 5);
			for (const v of u.slice(0, 31)) {
				const w = wireIndex(c, v.variable, VARIABLE_ESCAPE);
				j.u(w, 5);
				if (w === VARIABLE_ESCAPE) j.str(String(v.variable ?? ''));
				const x = wireIndex(d, v.operator, OPERATOR_ESCAPE);
				j.u(x, 3);
				if (x === OPERATOR_ESCAPE) j.str(String(v.operator ?? ''));
				const y = v.value;
				if (y === true) j.u(0, 2);
				else {
					if (y === false) j.u(1, 2);
					else typeof y === 'number' ? (j.u(2, 2), writeNumber(j, y)) : (j.u(3, 2), j.str(y));
				}
				const z = typeof v.target === 'string' && v.target !== '';
				j.u(z ? 1 : 0, 1);
				if (z) writeItemId(j, v.target);
			}
		}
		if (r) {
			j.u(r, i);
			if (r & 1) j.u(Math.max(0, Math.min(15, parseInt(q.slot, 10) || 0)), 4);
			if (r & 2) writeItemId(j, q.itemId);
			if (r & 4) writeItemId(j, q.blockId);
			if (r & 8) {
				const A = wireIndex(f, q.effectKeyword, POTION_ESCAPE);
				j.u(A, 5);
				if (A === POTION_ESCAPE) j.str(String(q.effectKeyword ?? ''));
			}
			if (r & 16) j.str(String(q.coords ?? ''));
		}
	}
	const n = Object.entries(g.kits || {});
	j.u(n.length ? 1 : 0, 1);
	if (n.length) {
		const [B, C] = n[0];
		(j.str(B), j.str(C, 16));
	}
	return j.finish();
}
function decodeV2(g, h = 2) {
	const j = h >= 3 ? 5 : 4,
		k = {
			id: g.str(),
			kit: null,
			actions: [],
			kits: {},
		},
		l = g.u(2);
	if (l === 1) k.kit = g.str();
	else {
		if (l === 2) k.kit = 'custom_' + g.str();
	}
	const m = g.varint();
	if (m > 5000) throw fail('Data claims an impossible number of actions.', 'CORRUPT');
	let n = 0;
	for (let o = 0; o < m; o++) {
		const p = g.u(1) === 1,
			q = g.u(1) === 1,
			r = g.u(6),
			s = r === ACTION_ESCAPE ? g.str() : e[r];
		n += g.svarint();
		const t = {
			type: p ? 'variable' : 'unconditional',
			action: s,
			order: n,
		};
		if (p) {
			t.conditions = [];
			const u = g.u(5);
			for (let v = 0; v < u; v++) {
				const w = g.u(5),
					x = w === VARIABLE_ESCAPE ? g.str() : c[w],
					y = g.u(3),
					z = y === OPERATOR_ESCAPE ? g.str() : d[y],
					A = {
						variable: x,
						operator: z,
					},
					B = g.u(2);
				if (B === 0) A.value = true;
				else {
					if (B === 1) A.value = false;
					else {
						if (B === 2) A.value = readNumber(g);
						else A.value = g.str();
					}
				}
				if (g.u(1)) A.target = readItemId(g);
				t.conditions.push(A);
			}
		}
		if (q) {
			const C = g.u(j);
			t.inputs = {};
			if (C & 1) t.inputs.slot = g.u(4);
			if (C & 2) t.inputs.itemId = readItemId(g);
			if (C & 4) t.inputs.blockId = readItemId(g);
			if (C & 8) {
				const D = g.u(5);
				t.inputs.effectKeyword = D === POTION_ESCAPE ? g.str() : f[D];
			}
			if (C & 16) t.inputs.coords = g.str();
		}
		k.actions.push(t);
	}
	if (g.u(1)) {
		const E = g.str();
		k.kits[E] = g.str(16);
	}
	return k;
}
function decodeV1(g) {
	const h = JSON.parse(utf8Decode(g));
	if (!Array.isArray(h)) throw fail('Unrecognised data.', 'SHAPE');
	const i = {
		id: h[1],
		kit: typeof h[2] === 'string' ? h[2] : null,
		actions: [],
		kits: {},
	};
	for (const k of Array.isArray(h[3]) ? h[3] : []) {
		if (!Array.isArray(k) || k.length < 3) continue;
		const [l, m, n, o, p] = k,
			q = {
				type: l === 1 ? 'variable' : 'unconditional',
				action: typeof n === 'number' ? e[n] : n,
				order: m,
			};
		if (o && typeof o === 'object') q.inputs = o;
		(q.type === 'variable' &&
			(q.conditions = (Array.isArray(p) ? p : []).map((r) => {
				const s = {
					variable: c[r[0]],
					operator: d[r[1]],
					value: r[2],
				};
				if (typeof r[3] === 'string') s.target = r[3];
				return s;
			})),
			i.actions.push(q));
	}
	const j = h[4];
	if (j && typeof j === 'object' && j.k) {
		for (const [r, s] of Object.entries(j.k)) i.kits[r] = s;
	}
	return i;
}
const DECODERS = {
	2: (g) => decodeV2(new BitReader(g), 2),
	3: (g) => decodeV2(new BitReader(g), 3),
};
export function encodePayload(g) {
	const h = b64Encode(lzwCompress(encodeV2(g, buildUsesCoords(g) ? 3 : 2)));
	return h + '.' + checksum(h);
}
export function decodePayload(g) {
	let h = String(g ?? '').replace(/\s+/g, '');
	if (!h) throw fail('No data found.', 'EMPTY');
	if (h.length > LIMITS.payloadChars) throw fail('Data is too large.', 'TOO_LONG');
	const i = h.match(/^BOT(\d+)\./);
	if (i) {
		if (Number(i[1]) !== 1) throw fail("Unsupported code version 'BOT" + i[1] + "'.", 'VERSION');
		h = h.slice(i[0].length);
	}
	const j = h.lastIndexOf('.');
	if (j < 0) throw fail('Data is incomplete — the end marker is missing.', 'INCOMPLETE');
	const k = h.slice(0, j),
		l = h.slice(j + 1);
	if (checksum(k) !== l) throw fail('Data is corrupted or a tag is missing.', 'INCOMPLETE');
	const m = lzwDecompress(b64Decode(k));
	if (m.length === 0) throw fail('Data is empty.', 'EMPTY');
	if (m[0] === 91) return decodeV1(m);
	const n = m[0],
		o = DECODERS[n];
	if (!o)
		throw fail(
			'This build was made by a newer version of the addon (format ' + n + ').',
			'VERSION',
		);
	return o(m.slice(1));
}
export const ENVELOPE_VERSION = 2;
export const MARKER_TAG = 'botshare_pig';
export const CARRIER_NAME = 'Data Pig';
const P_VERSION = 'bs:v',
	P_COUNT = 'bs:n',
	P_CHUNK = 'bs:',
	CHUNK_CHARS = 30000,
	MAX_CHUNKS = 64;
export function writePayloadToEntity(g, h) {
	clearCarrier(g);
	const j = [];
	for (let k = 0; k < h.length; k += CHUNK_CHARS) j.push(h.slice(k, k + CHUNK_CHARS));
	if (j.length > MAX_CHUNKS)
		throw fail('This build is too large to store on one entity.', 'TOO_LONG');
	(g.setDynamicProperty(P_VERSION, ENVELOPE_VERSION),
		g.setDynamicProperty(P_COUNT, j.length),
		j.forEach((l, m) => g.setDynamicProperty('' + P_CHUNK + m, l)));
	if (!g.hasTag(MARKER_TAG)) g.addTag(MARKER_TAG);
	return j.length;
}
export function readPayloadFromEntity(g) {
	const h = g.getDynamicProperty(P_VERSION);
	if (h === undefined) return readLegacyTagPayload(g.getTags());
	if (h > ENVELOPE_VERSION)
		throw fail('This pig was written by a newer addon version (carrier ' + h + ').', 'VERSION');
	const j = g.getDynamicProperty(P_COUNT);
	if (typeof j !== 'number' || j < 1 || j > MAX_CHUNKS)
		throw fail("Data pig's contents are unreadable.", 'CORRUPT');
	let k = '';
	for (let l = 0; l < j; l++) {
		const m = g.getDynamicProperty('' + P_CHUNK + l);
		if (typeof m !== 'string')
			throw fail('Data pig is missing part ' + (l + 1) + ' of ' + j + '.', 'INCOMPLETE');
		k += m;
	}
	return k;
}
export function clearCarrier(g) {
	for (const h of g.getDynamicPropertyIds()) {
		if (h === P_VERSION || h === P_COUNT || h.startsWith(P_CHUNK))
			g.setDynamicProperty(h, undefined);
	}
}
const LEGACY_MARKER = 'bs1',
	LEGACY_PREFIX = 'd',
	LEGACY_INDEX_CHARS = 2;
function readLegacyTagPayload(g) {
	const h = g.find((l) => l.startsWith(LEGACY_MARKER + ':'));
	if (!h) throw fail("That entity isn't carrying a bot build.", 'NO_DATA');
	const i = parseInt(h.slice(LEGACY_MARKER.length + 1), 36),
		j = new Array(Number.isFinite(i) ? i : 0).fill(null);
	for (const l of g) {
		if (!l.startsWith(LEGACY_PREFIX) || l.length <= LEGACY_PREFIX.length + LEGACY_INDEX_CHARS)
			continue;
		const m = parseInt(
			l.slice(LEGACY_PREFIX.length, LEGACY_PREFIX.length + LEGACY_INDEX_CHARS),
			36,
		);
		if (!Number.isFinite(m) || m < 0 || m >= j.length) continue;
		j[m] = l.slice(LEGACY_PREFIX.length + LEGACY_INDEX_CHARS);
	}
	const k = j.reduce((o, p) => (p === null ? o + 1 : o), 0);
	if (k) throw fail('Data pig is missing ' + k + ' of ' + j.length + ' data tags.', 'INCOMPLETE');
	return j.join('');
}
function getBots() {
	try {
		return JSON.parse(world.getDynamicProperty('custom_bots') || '{}');
	} catch (g) {
		return {};
	}
}
function saveBots(g) {
	world.setDynamicProperty('custom_bots', JSON.stringify(g));
}
export function listBots() {
	return getBots();
}
export function collectBuild(g) {
	const h = getBots(),
		i = h[g];
	if (!i) throw fail("No bot named '" + g + "'.", 'NO_BOT');
	const j = {
		id: g,
		kit: i.kit ?? null,
		actions: i.actions || [],
		kits: {},
		notes: [],
	};
	if (typeof i.kit === 'string' && i.kit.startsWith('custom_')) {
		const k = i.kit.slice('custom_'.length),
			l = world.getDynamicProperty('kit_' + k);
		if (typeof l !== 'string')
			j.notes.push("Kit '" + k + "' wasn't found, so it can't travel with this bot.");
		else
			l.length > LIMITS.kitJsonChars
				? j.notes.push(
						"Kit '" + k + "' is too large to bundle — the receiver must build it themselves.",
					)
				: (j.kits[k] = l);
	}
	return j;
}
export function writeBuildToEntity(g, h) {
	const i = encodePayload(h),
		j = writePayloadToEntity(g, i);
	return {
		chunks: j,
		chars: i.length,
	};
}
export function readBuildFromEntity(g) {
	return validateBuild(decodePayload(readPayloadFromEntity(g)));
}
function sanitizeId(g) {
	const h = String(g ?? '')
		.replace(/§[0-9a-zA-Z]/g, '')
		.replace(/[^\w\-. ]/g, '')
		.trim()
		.slice(0, LIMITS.idLength);
	return h.length ? h : 'ImportedBot';
}
function sanitizeItemId(g) {
	const h = String(g ?? '')
		.replace(/§[0-9a-zA-Z]/g, '')
		.trim();
	return ID_PATTERN.test(h) ? h : null;
}
export function validateBuild(g) {
	const h = new Set(),
		i = sanitizeId(g?.id);
	let j = typeof g?.kit === 'string' ? g.kit.replace(/§[0-9a-zA-Z]/g, '').slice(0, 48) : null;
	if (j !== null && !ID_PATTERN.test(j)) j = null;
	const k = getAvailableActions(),
		l = Array.isArray(g?.actions) ? g.actions : [];
	if (l.length > LIMITS.actions) h.add('Only the first ' + LIMITS.actions + ' actions were kept.');
	const m = [];
	for (const o of l.slice(0, LIMITS.actions)) {
		if (!o || typeof o !== 'object') continue;
		const p = typeof o.action === 'string' ? o.action : null;
		if (!p) {
			h.add('Skipped an unnamed action.');
			continue;
		}
		if (!e.includes(p) && !k.includes(p)) {
			h.add("Skipped '" + p + "' — not available in this world.");
			continue;
		}
		let q = parseInt(o.order, 10);
		if (!Number.isFinite(q)) q = m.length + 1;
		q = Math.max(-LIMITS.order, Math.min(LIMITS.order, q));
		const r = {
			type: o.type === 'variable' ? 'variable' : 'unconditional',
			action: p,
			order: q,
		};
		if (r.type === 'variable') {
			const s = [],
				t = Array.isArray(o.conditions) ? o.conditions.slice(0, LIMITS.conditionsPerAction) : [];
			for (const u of t) {
				if (!u || !c.includes(u.variable) || !d.includes(u.operator)) {
					h.add('Dropped a condition with an unknown variable.');
					continue;
				}
				let v = u.value;
				if (typeof v === 'string') v = v.replace(/§[0-9a-zA-Z]/g, '').slice(0, LIMITS.valueLength);
				else {
					if (typeof v === 'number') {
						if (!Number.isFinite(v)) v = 0;
					} else {
						if (typeof v !== 'boolean') {
							h.add('Dropped a condition with a bad value.');
							continue;
						}
					}
				}
				const w = {
					variable: u.variable,
					operator: u.operator,
					value: v,
				};
				if (typeof u.target === 'string' && u.target !== '') {
					const x = u.variable === 'IsAt' ? sanitizeCoords(u.target) : sanitizeItemId(u.target);
					if (x) w.target = x;
				}
				s.push(w);
			}
			if (s.length === 0) {
				h.add("Skipped '" + p + "' — no usable conditions.");
				continue;
			}
			r.conditions = s;
		}
		if (o.inputs && typeof o.inputs === 'object') {
			const y = {};
			if (o.inputs.slot !== undefined) {
				const z = parseInt(o.inputs.slot, 10);
				y.slot = Number.isFinite(z) ? Math.max(0, Math.min(8, z)) : 0;
			}
			if (o.inputs.itemId !== undefined) {
				const A = sanitizeItemId(o.inputs.itemId);
				if (A) y.itemId = A;
				else h.add("Dropped an invalid item id on '" + p + "'.");
			}
			if (o.inputs.blockId !== undefined) {
				const B = sanitizeItemId(o.inputs.blockId);
				if (B) y.blockId = B;
				else h.add("Dropped an invalid block id on '" + p + "'.");
			}
			if (o.inputs.effectKeyword !== undefined) {
				const C = String(o.inputs.effectKeyword);
				if (f.includes(C)) y.effectKeyword = C;
				else
					(h.add("Unknown potion on '" + p + "' — defaulted to swiftness."),
						(y.effectKeyword = 'swiftness'));
			}
			if (o.inputs.coords !== undefined) {
				const D = sanitizeCoords(o.inputs.coords);
				if (D) y.coords = D;
				else h.add("Dropped invalid coordinates on '" + p + "'.");
			}
			if (Object.keys(y).length) r.inputs = y;
		}
		m.push(r);
	}
	m.sort((E, F) => E.order - F.order);
	const n = {};
	if (g?.kits && typeof g.kits === 'object')
		for (const [E, F] of Object.entries(g.kits)) {
			const G = sanitizeId(E);
			if (typeof F === 'string' && F.length <= LIMITS.kitJsonChars) n[G] = F;
		}
	if (j && j.startsWith('custom_')) {
		const H = j.slice('custom_'.length);
		world.getDynamicProperty('kit_' + H) === undefined &&
			!n[H] &&
			(h.add("Kit '" + H + "' isn't in this world — the bot will spawn with no kit."), (j = null));
	}
	return {
		id: i,
		kit: j,
		actions: m,
		bundledKits: n,
		warnings: [...h],
	};
}
export function commitBuild(g, h = 'rename') {
	const i = getBots();
	let j = g.id;
	if (j in i && h === 'rename') {
		let k = 2;
		while (j + '_' + k in i && k < 999) k++;
		j = (j + '_' + k).slice(0, LIMITS.idLength);
	}
	for (const [l, m] of Object.entries(g.bundledKits)) {
		if (world.getDynamicProperty('kit_' + l) === undefined) world.setDynamicProperty('kit_' + l, m);
	}
	return (
		(i[j] = {
			kit: g.kit,
			actions: g.actions,
		}),
		saveBots(i),
		j
	);
}

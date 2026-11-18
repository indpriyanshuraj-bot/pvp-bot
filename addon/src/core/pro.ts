/**
 * Pro-level configuration: three sliders, one per learning level, plus a master.
 * Maps human-facing 0..100 values onto concrete behaviour weights. Pure logic.
 */

export interface ProSettings {
	master: number;
	l1: number;
	l2: number;
	l3: number;
	reactionMs: number;
	aimErrorDeg: number;
	cps: number;
	thinkTicks: number;
	mistakeChance: number;
}

export const PRO_PRESETS: Record<string, ProSettings> = {
	easy: { master: 20, l1: 10, l2: 10, l3: 0, reactionMs: 420, aimErrorDeg: 12, cps: 3, thinkTicks: 8, mistakeChance: 0.22 },
	normal: { master: 50, l1: 40, l2: 40, l3: 30, reactionMs: 260, aimErrorDeg: 6, cps: 5.5, thinkTicks: 5, mistakeChance: 0.12 },
	hard: { master: 75, l1: 65, l2: 70, l3: 55, reactionMs: 180, aimErrorDeg: 3.5, cps: 8, thinkTicks: 4, mistakeChance: 0.07 },
	pro: { master: 95, l1: 90, l2: 90, l3: 80, reactionMs: 120, aimErrorDeg: 1.5, cps: 12, thinkTicks: 2, mistakeChance: 0.03 },
};

export const DEFAULT_PRO: ProSettings = { ...PRO_PRESETS.normal! };

/** Concrete weights derived from the sliders. */
export interface ResolvedPro {
	/** strength of L1 skill modulation */
	w1: number;
	/** strength of L2 counter modulation */
	w2: number;
	/** strength of L3 learned bonus */
	w3: number;
	/** reaction delay in ticks */
	reactionTicks: number;
	/** aim error in degrees */
	aimErrorDeg: number;
	/** clicks per second */
	cps: number;
	thinkTicks: number;
	mistakeChance: number;
}

/** Slider 0..100 -> modulation weight 0..0.5. */
export function resolvePro(s: ProSettings, proFactor = 1): ResolvedPro {
	const master = clamp(s.master, 0, 100) / 100;
	const scale = clamp(proFactor, 0.1, 1);
	return {
		w1: (clamp(s.l1, 0, 100) / 100) * 0.5 * scale,
		w2: (clamp(s.l2, 0, 100) / 100) * 0.5 * scale,
		w3: (clamp(s.l3, 0, 100) / 100) * 0.5 * scale,
		reactionTicks: Math.max(1, Math.round((s.reactionMs / 50) * (1 / Math.max(0.2, scale)))),
		aimErrorDeg: s.aimErrorDeg / Math.max(0.2, scale),
		cps: s.cps * scale,
		thinkTicks: Math.max(1, Math.round(s.thinkTicks / Math.max(0.3, master + 0.3))),
		mistakeChance: s.mistakeChance,
	};
}

/**
 * Combine the three learning levels multiplicatively, each factor clamped so no
 * single layer can dominate. A weight of 0 removes that layer entirely.
 */
export function combineUtility(
	base: number,
	r: ResolvedPro,
	l1Mod = 0,
	l2Mod = 0,
	l3Mod = 0,
): number {
	const f1 = clamp(1 + r.w1 * l1Mod, 0.5, 2);
	const f2 = clamp(1 + r.w2 * l2Mod, 0.5, 2);
	const f3 = clamp(1 + r.w3 * l3Mod, 0.5, 2);
	return base * f1 * f2 * f3;
}

function clamp(v: number, lo: number, hi: number): number {
	if (!Number.isFinite(v)) return lo;
	return Math.min(hi, Math.max(lo, v));
}

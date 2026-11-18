import { world, system } from '@minecraft/server';
import { ModalFormData } from '@minecraft/server-ui';
export const TUNING_VERSION = 4;
export const TUNING_DEFAULTS = {
	JUMP_COOLDOWN: 8,
	OBSTACLE_JUMP: 1,
	JUMP_IDLE_CHANCE: 20,
	LEDGE_AVOID: 1,
	LEDGE_MAX_DROP: 3.5,
	STUCK_WINDOW: 16,
	STUCK_EPS: 0.35,
	STUCK_IMPULSE: 0.45,
	SPRINT_MIN_FORWARD: 0.2,
	AIM_TURN_BASE: 42,
	AIM_TURN_PER_DIFF: 7,
	AIM_ERROR_BASE: 0.6,
	AIM_ERROR_PER_DIFF: 1.5,
	REACTION_BASE: 2,
	REACTION_PER_DIFF: 2.5,
	REACH_BASE: 3.05,
	REACH_PER_DIFF: 0.15,
	CPS_BASE: 9.5,
	CPS_PER_DIFF: 1.9,
	CPS_JITTER: 18,
	JAVA_RELEASE_LAG: 0.9,
	MISS_BASE: 2,
	MISS_PER_DIFF: 11,
	CRIT_BASE: 55,
	CRIT_PER_DIFF: 15,
	WTAP_BASE: 70,
	WTAP_PER_DIFF: 20,
	BOW_SPEED: 3,
	BOW_DRAW_TICKS: 25,
	STRAFE_SWITCH_MIN: 14,
	STRAFE_SWITCH_RAND: 18,
	HUMAN_PAUSE: 6,
	SHIELD_REACT: 3,
	REQUIRE_LOS: 1,
	WEB_BLOCKS_HITS: 1,
	LOS_GRACE: 0.6,
};
const cache = new Map();
let cacheTick = -1;
function refresh() {
	cache.clear();
	for (const c in TUNING_DEFAULTS) {
		const d = world.getDynamicProperty('pb_' + c),
			e = d === undefined ? TUNING_DEFAULTS[c] : Number(d);
		cache.set(c, Number.isFinite(e) ? e : TUNING_DEFAULTS[c]);
	}
	cacheTick = system.currentTick;
}
export function tune(c) {
	if (cacheTick < 0 || cache.size === 0 || system.currentTick - cacheTick >= 200) refresh();
	const d = cache.get(c);
	return d === undefined ? TUNING_DEFAULTS[c] : d;
}
export function tuneOn(c) {
	return tune(c) >= 0.5;
}
export function setTuning(c, d) {
	if (!(c in TUNING_DEFAULTS)) return;
	(world.setDynamicProperty('pb_' + c, Number(d)), (cacheTick = -1));
}
export function resetTuning() {
	for (const c in TUNING_DEFAULTS) {
		world.setDynamicProperty('pb_' + c, TUNING_DEFAULTS[c]);
	}
	(world.setDynamicProperty('pb_tuning_version', TUNING_VERSION), (cacheTick = -1));
}
export function byDifficulty(c, e, f, g = -Infinity, h = Infinity) {
	const i = Math.max(0, Math.min(3, f ?? 3));
	return Math.max(g, Math.min(h, tune(c) - tune(e) * i));
}
export function byDifficultyUp(c, e, f, g = -Infinity, h = Infinity) {
	const i = Math.max(0, Math.min(3, f ?? 3));
	return Math.max(g, Math.min(h, tune(c) + tune(e) * i));
}
system.run(() => {
	try {
		const c = Number(world.getDynamicProperty('pb_tuning_version') ?? 0),
			d = c !== TUNING_VERSION;
		for (const f in TUNING_DEFAULTS) {
			const g = 'pb_' + f;
			(d || world.getDynamicProperty(g) === undefined) &&
				world.setDynamicProperty(g, TUNING_DEFAULTS[f]);
		}
		(world.setDynamicProperty('pb_tuning_version', TUNING_VERSION), (cacheTick = -1));
	} catch (h) {}
});
const FORM_PAGES = [
	{
		label: 'Movement & Jumping',
		keys: [
			'JUMP_COOLDOWN',
			'OBSTACLE_JUMP',
			'JUMP_IDLE_CHANCE',
			'LEDGE_AVOID',
			'LEDGE_MAX_DROP',
			'STUCK_WINDOW',
			'STUCK_EPS',
			'STUCK_IMPULSE',
			'SPRINT_MIN_FORWARD',
		],
	},
	{
		label: 'Aim & Reaction',
		keys: [
			'AIM_TURN_BASE',
			'AIM_TURN_PER_DIFF',
			'AIM_ERROR_BASE',
			'AIM_ERROR_PER_DIFF',
			'REACTION_BASE',
			'REACTION_PER_DIFF',
		],
	},
	{
		label: 'Melee',
		keys: [
			'REACH_BASE',
			'REACH_PER_DIFF',
			'CPS_BASE',
			'CPS_PER_DIFF',
			'CPS_JITTER',
			'JAVA_RELEASE_LAG',
			'MISS_BASE',
			'MISS_PER_DIFF',
			'CRIT_BASE',
			'CRIT_PER_DIFF',
			'WTAP_BASE',
			'WTAP_PER_DIFF',
		],
	},
	{
		label: 'Ranged, Pacing & Fairness',
		keys: [
			'BOW_SPEED',
			'BOW_DRAW_TICKS',
			'STRAFE_SWITCH_MIN',
			'STRAFE_SWITCH_RAND',
			'HUMAN_PAUSE',
			'SHIELD_REACT',
			'REQUIRE_LOS',
			'WEB_BLOCKS_HITS',
			'LOS_GRACE',
		],
	},
];
export function TuningMenu(c, d = 0) {
	const e = FORM_PAGES[d];
	if (!e) return;
	const f = new ModalFormData();
	f.title('Bot Tuning ' + (d + 1) + '/' + FORM_PAGES.length + ' - ' + e.label);
	for (const h of e.keys) {
		f.textField(h, 'Default: ' + TUNING_DEFAULTS[h], {
			defaultValue: String(tune(h)),
		});
	}
	const g = d === FORM_PAGES.length - 1;
	(f.toggle(g ? 'Restore every value to default' : 'Continue to next page', {
		defaultValue: !g,
	}),
		f
			.show(c)
			.then((i) => {
				if (i.canceled) return;
				const j = i.formValues ?? [];
				e.keys.forEach((l, m) => {
					const n = parseFloat(j[m]);
					if (!isNaN(n)) setTuning(l, n);
				});
				const k = j[e.keys.length];
				if (g) {
					k === false
						? (resetTuning(), c.sendMessage('§a[Bot Tuning] Every value restored to its default.'))
						: c.sendMessage('§a[Bot Tuning] Saved.');
					return;
				}
				k === false
					? system.run(() => TuningMenu(c, d + 1))
					: c.sendMessage('§a[Bot Tuning] Saved.');
			})
			.catch(() => {}));
}

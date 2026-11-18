import { world, system } from '@minecraft/server';
import { ModalFormData } from '@minecraft/server-ui';
export const ML_SETTINGS_VERSION = 2;
export const ML_DEFAULTS = {
	LEARNING_RATE: 0.35,
	DISCOUNT: 0.85,
	WEIGHT_CLAMP: 8,
	REWARD_SCALE: 10,
	TEMPERATURE_START: 1.2,
	TEMPERATURE_MIN: 0.15,
	TEMPERATURE_DECAY: 0.0006,
	EXPLORE_BONUS: 0.6,
	EPSILON_START: 0.25,
	EPSILON_MIN: 0.03,
	EPSILON_DECAY: 0.002,
	REPLAY_CAPACITY: 384,
	REPLAY_BATCH: 24,
	REPLAY_PASSES: 2,
	DAMAGE_DEALT_MULT: 1.5,
	DAMAGE_TAKEN_MULT: 0.55,
	DEATH_PENALTY: 30,
	WIN_BONUS: 60,
	IDLE_PENALTY: 6,
	WHIFF_PENALTY: 2,
	SHAPING_SCALE: 12,
	SPACING_REWARD: 3,
	COMBO_BONUS: 12,
	COMBO_TIMEOUT_TICKS: 40,
	BLOCK_BONUS: 3,
	SHIELD_BREAK_BONUS: 8,
	SHIELD_BREAK_COOLDOWN_TICKS: 100,
	TRAP_BONUS: 8,
	TRAP_CREDIT_RANGE: 5,
	CLOSE_REWARD_PER_BLOCK: 2,
	CLOSE_REWARD_CAP: 8,
	MIN_TACTICAL_DECISION_TICKS: 6,
	MOVE_DECISION_WINDOW_TICKS: 12,
	PENDING_TIMEOUT_TICKS: 60,
	SETTLE_SWEEP_TICKS: 20,
	MOVEMENT_MATURITY_STEPS: 600,
	MOVEMENT_MAX_BLEND: 0.9,
	SAVE_INTERVAL_TICKS: 200,
	MAX_CHUNK_CHARS: 30000,
	RESPAWN_DELAY_TICKS: 10,
	MAX_PAIRS_PER_REQUEST: 20,
	MAX_TOTAL_AUTO_TRAIN_PAIRS: 30,
	AUTO_TRAIN_SPACING: 24,
	GRID_COLS: 5,
	CURRICULUM: 1,
	CURRICULUM_STEPS: 2500,
};
const cache = new Map();
let cacheTick = -1;
function refresh() {
	cache.clear();
	for (const c in ML_DEFAULTS) {
		const d = world.getDynamicProperty('ml_' + c),
			e = d === undefined ? ML_DEFAULTS[c] : Number(d);
		cache.set(c, Number.isFinite(e) ? e : ML_DEFAULTS[c]);
	}
	cacheTick = system.currentTick;
}
export function getMLSetting(c) {
	if (cacheTick < 0 || cache.size === 0 || system.currentTick - cacheTick >= 200) refresh();
	const d = cache.get(c);
	return d === undefined ? ML_DEFAULTS[c] : d;
}
export function setMLSetting(c, d) {
	(world.setDynamicProperty('ml_' + c, Number(d)), (cacheTick = -1));
}
export function resetMLSettings() {
	for (const c in ML_DEFAULTS) {
		world.setDynamicProperty('ml_' + c, ML_DEFAULTS[c]);
	}
	(world.setDynamicProperty('ml_settings_version', ML_SETTINGS_VERSION), (cacheTick = -1));
}
system.run(() => {
	try {
		const c = Number(world.getDynamicProperty('ml_settings_version') ?? 0),
			d = c !== ML_SETTINGS_VERSION;
		for (const f in ML_DEFAULTS) {
			const g = 'ml_' + f;
			(d || world.getDynamicProperty(g) === undefined) &&
				world.setDynamicProperty(g, ML_DEFAULTS[f]);
		}
		(world.setDynamicProperty('ml_settings_version', ML_SETTINGS_VERSION), (cacheTick = -1));
	} catch (h) {}
});
const PAGES = [
	{
		label: 'Learner',
		keys: [
			'LEARNING_RATE',
			'DISCOUNT',
			'WEIGHT_CLAMP',
			'REWARD_SCALE',
			'REPLAY_CAPACITY',
			'REPLAY_BATCH',
			'REPLAY_PASSES',
		],
	},
	{
		label: 'Exploration',
		keys: [
			'TEMPERATURE_START',
			'TEMPERATURE_MIN',
			'TEMPERATURE_DECAY',
			'EXPLORE_BONUS',
			'EPSILON_START',
			'EPSILON_MIN',
			'EPSILON_DECAY',
		],
	},
	{
		label: 'Rewards',
		keys: [
			'DAMAGE_DEALT_MULT',
			'DAMAGE_TAKEN_MULT',
			'DEATH_PENALTY',
			'WIN_BONUS',
			'IDLE_PENALTY',
			'WHIFF_PENALTY',
			'SHAPING_SCALE',
			'SPACING_REWARD',
			'COMBO_BONUS',
			'COMBO_TIMEOUT_TICKS',
		],
	},
	{
		label: 'Bonuses',
		keys: [
			'BLOCK_BONUS',
			'SHIELD_BREAK_BONUS',
			'SHIELD_BREAK_COOLDOWN_TICKS',
			'TRAP_BONUS',
			'TRAP_CREDIT_RANGE',
			'CLOSE_REWARD_PER_BLOCK',
			'CLOSE_REWARD_CAP',
		],
	},
	{
		label: 'Cadence',
		keys: [
			'MIN_TACTICAL_DECISION_TICKS',
			'MOVE_DECISION_WINDOW_TICKS',
			'PENDING_TIMEOUT_TICKS',
			'SETTLE_SWEEP_TICKS',
			'MOVEMENT_MATURITY_STEPS',
			'MOVEMENT_MAX_BLEND',
		],
	},
	{
		label: 'Storage & Training',
		keys: [
			'SAVE_INTERVAL_TICKS',
			'MAX_CHUNK_CHARS',
			'RESPAWN_DELAY_TICKS',
			'MAX_PAIRS_PER_REQUEST',
			'MAX_TOTAL_AUTO_TRAIN_PAIRS',
			'AUTO_TRAIN_SPACING',
			'GRID_COLS',
			'CURRICULUM',
			'CURRICULUM_STEPS',
		],
	},
];
export function MLSettingsMenu(c, d = 0) {
	const e = PAGES[d];
	if (!e) return;
	const f = new ModalFormData();
	f.title('ML Settings ' + (d + 1) + '/' + PAGES.length + ' - ' + e.label);
	for (const h of e.keys) {
		f.textField(h, 'Default: ' + ML_DEFAULTS[h], {
			defaultValue: String(getMLSetting(h)),
		});
	}
	const g = d === PAGES.length - 1;
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
					if (!isNaN(n)) setMLSetting(l, n);
				});
				const k = j[e.keys.length];
				if (g) {
					k === false
						? (resetMLSettings(),
							c.sendMessage('§a[ML System] Every setting restored to its default.'))
						: c.sendMessage('§a[ML System] Settings successfully updated!');
					return;
				}
				k === false
					? system.run(() => MLSettingsMenu(c, d + 1))
					: c.sendMessage('§a[ML System] Settings successfully updated!');
			})
			.catch((i) => {
				console.error('Failed to open ML Settings form: ', i);
			}));
}

/** Pro-level GUI: one slider per learning level plus a master. */

import { world, type Player } from '@minecraft/server';
import { ModalFormData } from '@minecraft/server-ui';
import { DEFAULT_PRO, PRO_PRESETS, type ProSettings } from '../core/pro.js';

const KEYS = ['master', 'l1', 'l2', 'l3', 'reactionMs', 'aimErrorDeg', 'cps', 'thinkTicks', 'mistakeChance'] as const;

export function loadPro(): ProSettings {
	const read = (k: keyof ProSettings): number => {
		const v = world.getDynamicProperty(`pvb_pro_${k}`);
		return typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_PRO[k];
	};
	return {
		master: read('master'),
		l1: read('l1'),
		l2: read('l2'),
		l3: read('l3'),
		reactionMs: read('reactionMs'),
		aimErrorDeg: read('aimErrorDeg'),
		cps: read('cps'),
		thinkTicks: read('thinkTicks'),
		mistakeChance: read('mistakeChance'),
	};
}

export function savePro(s: ProSettings): void {
	for (const k of KEYS) world.setDynamicProperty(`pvb_pro_${k}`, s[k]);
}

export function applyPreset(name: string): ProSettings | null {
	const p = PRO_PRESETS[name];
	if (!p) return null;
	savePro(p);
	return p;
}

export function openProMenu(player: Player): void {
	const s = loadPro();
	const form = new ModalFormData();
	form.title('Pro Level');
	form.slider('Master', 0, 100, { defaultValue: s.master, valueStep: 1 });
	form.slider('L1 Opponent Reading', 0, 100, { defaultValue: s.l1, valueStep: 1 });
	form.slider('L2 Pattern Counter', 0, 100, { defaultValue: s.l2, valueStep: 1 });
	form.slider('L3 Global Learning', 0, 100, { defaultValue: s.l3, valueStep: 1 });
	form.slider('Reaction (ms)', 80, 500, { defaultValue: s.reactionMs, valueStep: 10 });
	form.slider('Aim error (degrees)', 0, 20, { defaultValue: s.aimErrorDeg, valueStep: 0.5 });
	form.slider('Clicks per second', 1, 20, { defaultValue: s.cps, valueStep: 0.5 });
	form.slider('Think interval (ticks)', 1, 12, { defaultValue: s.thinkTicks, valueStep: 1 });

	form
		.show(player)
		.then((res) => {
			if (res.canceled) return;
			const v = res.formValues ?? [];
			const num = (i: number, fallback: number): number => {
				const x = v[i];
				return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
			};
			const next: ProSettings = {
				master: num(0, s.master),
				l1: num(1, s.l1),
				l2: num(2, s.l2),
				l3: num(3, s.l3),
				reactionMs: num(4, s.reactionMs),
				aimErrorDeg: num(5, s.aimErrorDeg),
				cps: num(6, s.cps),
				thinkTicks: num(7, s.thinkTicks),
				mistakeChance: s.mistakeChance,
			};
			savePro(next);
			player.sendMessage(
				`§aPro updated §7— master §f${next.master}§7, L1 §f${next.l1}§7, L2 §f${next.l2}§7, L3 §f${next.l3}`,
			);
		})
		.catch((err) => {
			player.sendMessage(`§cPro menu failed: ${String(err)}`);
		});
}

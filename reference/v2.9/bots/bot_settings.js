import { world } from '@minecraft/server';
import { ModalFormData } from '@minecraft/server-ui';
import { SKIN_ENUM } from '../skins.js';
const settings = {
	Recording: 'recording',
	'Recording path line': 'recordingPath',
	'Recording Playback path line': 'playbackPath',
	'Display "recording" when recording': 'disRec',
	'Kit command': 'kitToggle',
	'Spawnbot command': 'spawnbotToggle',
	'Bots T-Bag': 'tbag',
	'Bots Disconnect on kill': 'disconnect',
	'Disable Bot Movement': 'dontMove',
	'Bot Ai': 'botLogic',
	'Eco Ai (bots get dumber when more are spawned for performance)': 'ecoAi',
	'Better Bot AI (More Heavy on lag)': 'betterAi',
	'Show bot action in nametag': 'nametagAction',
	'Show bot health in nametag': 'nametagHealth',
	'Bot all/mob search ranges': 'searchRange',
};
function MainMenu(c) {
	const d = new ModalFormData();
	d.title('Settings');
	for (const e in settings) {
		const f = settings[e],
			g = world.getDynamicProperty(f);
		if (f === 'searchRange') {
			const h = g !== undefined ? String(g) : '10';
			d.textField(e, 'Enter a number...', {
				defaultValue: h,
			});
		} else {
			const i = g !== undefined ? Boolean(g) : true;
			d.toggle(e, {
				defaultValue: i,
			});
		}
	}
	for (const j of SKIN_ENUM) {
		const k = 'skinToggle_' + j,
			l = world.getDynamicProperty(k),
			m = j === 'default',
			n = l !== undefined ? Boolean(l) : m;
		d.toggle('Enable Skin: ' + j, {
			defaultValue: n,
		});
	}
	d.show(c)
		.then((o) => {
			if (o.canceled) return;
			const p = Object.values(settings);
			let q = 0;
			for (let r = 0; r < p.length; r++) {
				const s = p[r];
				let t = o.formValues[q++];
				(s === 'searchRange' && (t = parseFloat(t) || 10), world.setDynamicProperty(s, t));
			}
			for (const u of SKIN_ENUM) {
				const w = 'skinToggle_' + u,
					x = o.formValues[q++];
				world.setDynamicProperty(w, x);
			}
			c.sendMessage('§aSettings updated successfully!');
		})
		.catch((o) => {
			console.error('Error showing MainMenu: ', o);
		});
}
export { MainMenu };

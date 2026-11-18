import { system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { MLSystem, CLASSES } from 'bots/ml_system';
const difficulties = {
		easy: 3,
		medium: 2,
		hard: 1,
		impossible: 0,
	},
	difficultiesEnum = Object.keys(difficulties),
	stateEnum = ['on', 'off'],
	commandInformation = {
		name: 'mltrain',
		description:
			'Run an endless auto-training duel for a class: spawns a pair of bots that fight each other to generate training data.',
		usage: [
			{
				name: 'Class',
				type: CLASSES,
				optional: true,
			},
			{
				name: 'Difficulty',
				type: difficultiesEnum,
				optional: false,
			},
			{
				name: 'State',
				type: stateEnum,
				optional: false,
			},
			{
				name: 'Count',
				type: 'Integer',
				optional: false,
			},
		],
	};
export const mlautotrain = commandInformation;
registerCommand(commandInformation, (c, d, e = 'easy', f, g) => {
	const h = c.sourceEntity;
	if (h instanceof Player && h.commandPermissionLevel < 1)
		return h.sendMessage('§cInvalid permission level to run this command!');
	const i = (k) => {
		if (h instanceof Player && h.isValid) h.sendMessage(k);
		else
			!(h instanceof Player) &&
				console.info('[ML Autotrain Command] ' + k.replace(new RegExp('§[0-9a-fk-or]', 'g'), ''));
	};
	if (!(h instanceof Player))
		return i('§cAutotrain must be started by a player (it spawns pairs at your location).');
	if (!difficultiesEnum.includes(e))
		return i('§c"' + e + '" is not a valid difficulty. Options: ' + difficultiesEnum.join(', '));
	const j = f ? f === 'on' : !MLSystem.isAutoTraining(d);
	system.run(() => {
		if (!j) {
			const n = MLSystem.stopAutoTrain(d);
			i(
				n > 0
					? '§a[ML] Stopped ' + n + ' auto-training pair(s) for §b' + d + '§a.'
					: "§7[ML] Auto-training wasn't running for " + d + '.',
			);
			return;
		}
		if (!h.isValid) return;
		const k = Math.max(1, Math.floor(g ?? 1)),
			l = MLSystem.startAutoTrain(d, h.location, h.dimension, e, k);
		if (l.started === 0)
			return i(
				'§c[ML] Couldn\'t start any more pairs -- the auto-training cap is already reached. Stop some first with "/pb:mlautotrain ' +
					d +
					' off".',
			);
		let m =
			'§a[ML] Started ' +
			l.started +
			' pair(s) for §b' +
			d +
			'§a (' +
			l.totalNow +
			" running total for this class now), laid out on a grid so they don't cross-target each other.";
		(l.capped && (m += '\n§7Capped from ' + l.requested + ' to stay under the safety limit.'),
			l.started >= 6 &&
				(m +=
					'\n§7Running that many bots? Turn on "Eco Ai" in /settings if it starts feeling choppy.'),
			(m += '\n§7Stop anytime with "/pb:mltrain ' + d + ' ' + e + ' off".'),
			i(m));
	});
});
export default commandInformation;

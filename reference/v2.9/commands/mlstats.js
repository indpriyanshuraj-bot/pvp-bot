import { Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { MLSystem, CLASSES } from 'bots/ml_system';
const classOrAllEnum = [...CLASSES, 'all'],
	commandInformation = {
		name: 'mlstats',
		description:
			'View ML PvP bot training stats: update counts, exploration rate, movement blend, and reward bonuses.',
		usage: [
			{
				name: 'Class',
				type: classOrAllEnum,
				optional: true,
			},
		],
	};
export const mlstats = commandInformation;
function formatBytes(c) {
	if (c < 1000) return c + 'B';
	return (c / 1000).toFixed(1) + 'KB';
}
registerCommand(commandInformation, (d, e) => {
	const f = d.sourceEntity;
	if (f instanceof Player && f.commandPermissionLevel < 1)
		return f.sendMessage('§cInvalid permission level to run this command!');
	const g = (j) => {
			if (f instanceof Player && f.isValid) f.sendMessage(j);
			else
				!(f instanceof Player) &&
					console.info('[ML Stats Command] ' + j.replace(new RegExp('§[0-9a-fk-or]', 'g'), ''));
		},
		h = e === 'all' ? CLASSES : [e];
	let i = '§a=== ML Training Stats ===';
	for (const j of h) {
		const k = MLSystem.getStats(j),
			l = MLSystem.isEnabled(j) ? '§aon' : '§7off',
			m = k?.autoTrainPairs > 0 ? ' §d[' + k.autoTrainPairs + ' auto pair(s)]' : '';
		((i +=
			'\n§b' +
			j +
			'§r: §7' +
			(k?.steps ?? 0) +
			' updates §8|§7 ' +
			formatBytes(k?.bytes ?? 0) +
			' §8|§7 explore ' +
			((k?.epsilon ?? 0) * 100).toFixed(0) +
			'% §8|§7 toggle: ' +
			l +
			m),
			(i +=
				'\n§8   movement: §7' +
				(k?.moveSteps ?? 0) +
				' updates §8|§7 ' +
				((k?.moveBlend ?? 0) * 100).toFixed(0) +
				'% learned §8/§7 ' +
				(100 - (k?.moveBlend ?? 0) * 100).toFixed(0) +
				'% rule-based'));
		const n = MLSystem.REWARD_CHECKS?.[j] ?? [];
		if (n.length > 0) {
			const o = n.map((p) => p + ': ' + (k?.bonusCounts?.[p] ?? 0));
			i += '\n§8   bonuses: §7' + o.join(' §8|§7 ');
		}
	}
	g(i);
});
export default commandInformation;

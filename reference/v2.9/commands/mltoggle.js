import { system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { MLSystem, CLASSES } from 'bots/ml_system';
const classOrAllEnum = [...CLASSES, 'all'],
	stateEnum = ['on', 'off'],
	commandInformation = {
		name: 'mltoggle',
		description:
			'Toggle premade ML PvP bots onto (or off of) the learned training data for a class.',
		usage: [
			{
				name: 'Class',
				type: classOrAllEnum,
				optional: true,
			},
			{
				name: 'State',
				type: stateEnum,
				optional: false,
			},
		],
	};
export const mltoggle = commandInformation;
registerCommand(commandInformation, (c, d, e) => {
	const f = c.sourceEntity;
	if (f instanceof Player && f.commandPermissionLevel < 1)
		return f.sendMessage('§cInvalid permission level to run this command!');
	const g = (j) => {
			if (f instanceof Player && f.isValid) f.sendMessage(j);
			else
				!(f instanceof Player) &&
					console.info('[ML Toggle Command] ' + j.replace(/§[0-9a-fk-or]/g, ''));
		},
		h = d === 'all' ? CLASSES : [d],
		i = e ? e === 'on' : undefined;
	system.run(() => {
		for (const k of h) {
			MLSystem.setEnabled(k, i !== undefined ? i : !MLSystem.isEnabled(k));
		}
		const j = MLSystem.isEnabled(h[0]);
		g(
			'§a[ML] Premade ' +
				d +
				' bot(s) will ' +
				(j ? '§anow use' : '§cstop using') +
				'§a the learned data.',
		);
	});
});
export default commandInformation;

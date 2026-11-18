import { system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { MLSystem, CLASSES } from 'bots/ml_system';
const classOrAllEnum = [...CLASSES, 'all'],
	commandInformation = {
		name: 'mlreset',
		description: 'Clear the learned training data for one or all ML PvP bot classes.',
		usage: [
			{
				name: 'Class',
				type: classOrAllEnum,
				optional: true,
			},
		],
	};
export const mlreset = commandInformation;
registerCommand(commandInformation, (c, d) => {
	const e = c.sourceEntity;
	if (e instanceof Player && e.commandPermissionLevel < 1)
		return e.sendMessage('§cInvalid permission level to run this command!');
	const f = (h) => {
			if (e instanceof Player && e.isValid) e.sendMessage(h);
			else
				!(e instanceof Player) &&
					console.info('[ML Reset Command] ' + h.replace(/§[0-9a-fk-or]/g, ''));
		},
		g = d === 'all' ? CLASSES : [d];
	system.run(() => {
		for (const h of g) MLSystem.resetBrain(h);
		f('§a[ML] Cleared training data for: §f' + g.join(', '));
	});
});
export default commandInformation;

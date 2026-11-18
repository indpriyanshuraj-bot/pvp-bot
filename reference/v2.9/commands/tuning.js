import { system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { TuningMenu } from '../bots/tuning.js';
const commandInformation = {
	name: 'tuning',
	description: 'Adjust bot movement, aim, reach and click-speed tuning values',
	usage: [],
};
registerCommand(commandInformation, (c) => {
	const d = c.sourceEntity;
	if (!(d instanceof Player)) return;
	if (d.commandPermissionLevel < 1)
		return d.sendMessage('§cInvalid permission level to run this command!');
	system.run(() => {
		TuningMenu(d);
	});
});
export default commandInformation;

import { system, world } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
const commandInformation = {
	name: 'botdebug',
	description: 'Toggle bot debug',
	usage: [],
};
export const botDebug = commandInformation;
registerCommand(commandInformation, (c) => {
	const d = c.sourceEntity;
	if (d.commandPermissionLevel < 1)
		return d.sendMessage('§cInvalid permission level to run this command!');
	system.run(() => {
		const e = world.getDynamicProperty('botDebug') || true,
			f = !e;
		(world.setDynamicProperty('botDebug', f),
			f ? d.sendMessage('§aBot debug Enabled') : d.sendMessage('§cBot debug Disabled'));
	});
});
export default commandInformation;

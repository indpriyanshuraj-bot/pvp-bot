import { world, system } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { MainMenu } from '../bots/bot_builder';
const commandInformation = {
	name: 'botbuilder',
	description: 'Create Custom Bots!',
	usage: [],
};
registerCommand(commandInformation, (c) => {
	const d = c.sourceEntity;
	if (d.commandPermissionLevel < 1)
		return d.sendMessage('§cInvalid permission level to run this command!');
	system.run(() => {
		MainMenu(d);
	});
});
export default commandInformation;

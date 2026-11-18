import { world, system } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { MLSettingsMenu } from '../bots/mlSettingsManager.js';
const commandInformation = {
	name: 'mlsettings',
	description: 'Adjust ML system weights and constants',
	usage: [],
};
registerCommand(commandInformation, (c) => {
	const d = c.sourceEntity;
	if (d.commandPermissionLevel < 1)
		return d.sendMessage('§cInvalid permission level to run this command!');
	system.run(() => {
		MLSettingsMenu(d);
	});
});
export default commandInformation;

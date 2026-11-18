import { world, system } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { PlaybackMenu } from '../recording/record';
const commandInformation = {
	name: 'playback',
	description: 'View your recordings',
	usage: [],
};
registerCommand(commandInformation, (c) => {
	const d = c.sourceEntity;
	if (!d || !d.isValid) return;
	if (!world.getDynamicProperty('recording')) return d.sendMessage('§cRecording is disabled');
	system.run(() => {
		PlaybackMenu(d);
	});
});
export default commandInformation;

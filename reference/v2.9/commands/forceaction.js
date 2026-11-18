import { Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { ACTIONS } from '../bots/bot_builder';
import { sharedBotSystem } from '../bots/bot_manager.js';
const commandInformation = {
	name: 'forceaction',
	description: 'Forces specific bot(s) to execute an action as #1 priority',
	usage: [
		{
			name: 'target',
			type: 'PlayerSelector',
			optional: true,
		},
		{
			name: 'action',
			type: ACTIONS,
			optional: true,
		},
	],
};
registerCommand(commandInformation, (c, d, e) => {
	const f = c.sourceEntity;
	if (f instanceof Player && f.commandPermissionLevel < 1)
		return f.sendMessage('§cInvalid permission level to run this command!');
	const g = Array.isArray(d) ? d : d ? [d] : [];
	if (g.length === 0 || !e) {
		f instanceof Player &&
			f.isValid &&
			f.sendMessage('§cMissing arguments. Usage: forceaction <target> <action>');
		return;
	}
	let h = 0;
	for (const i of g) {
		if (!i.isValid) continue;
		const j = sharedBotSystem.getBotData(i);
		if (!j) continue;
		((j.forcedAction = {
			action: e,
			inputs: {},
			ticks: 20,
		}),
			sharedBotSystem.setBotData(i, j),
			h++);
	}
	if (h === 0) {
		f instanceof Player && f.isValid
			? f.sendMessage('§cNo valid bots found matching that criteria.')
			: console.warn('[ForceAction Command] No valid bots found.');
		return;
	}
	f instanceof Player &&
		f.isValid &&
		f.sendMessage('§aSuccessfully forced ' + h + ' bot(s) to execute: §e' + e + '§a.');
});
export default commandInformation;

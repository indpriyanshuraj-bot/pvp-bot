import { world, system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
const commandInformation = {
	name: 'removebots',
	description: 'Removes specific bots or all active bots',
	usage: [
		{
			name: 'target - optional',
			type: 'PlayerSelector',
			optional: false,
		},
	],
};
registerCommand(commandInformation, (c, d) => {
	const e = c.sourceEntity;
	if (e instanceof Player && e.commandPermissionLevel < 1)
		return e.sendMessage('§cInvalid permission level to run this command!');
	let f = [];
	if (d) {
		const g = Array.isArray(d) ? d : [d];
		f = g.filter((h) => h.name.startsWith('§p§b§rPVP_bot') || h.name.startsWith('§p§b§rPlayback'));
	} else
		f = world
			.getRawPlayers()
			.filter((h) => h.name.startsWith('§p§b§rPVP_bot') || h.name.startsWith('§p§b§rPlayback'));
	if (f.length === 0) {
		e instanceof Player && e.isValid
			? e.sendMessage('§cNo valid bots found matching that criteria.')
			: console.warn('[Removebots Command] No valid bots found.');
		return;
	}
	system.run(() => {
		let h = 0;
		for (const i of f) {
			i.isValid && (i.disconnect(), h++);
		}
		e instanceof Player && e.isValid && e.sendMessage('§aSuccessfully removed ' + h + ' bot(s).');
	});
});
export default commandInformation;

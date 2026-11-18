import { world, system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { deleteKit, listCustomKits, KitManagerMenu } from '../kit_manager.js';
const commandInformation = {
	name: 'deletekit',
	description:
		'Delete a custom kit saved with /pb:savekit. Leave the name empty to open the kit menu.',
	usage: [
		{
			name: 'kitName',
			type: 'String',
			optional: false,
		},
	],
};
export const deletekit = commandInformation;
registerCommand(commandInformation, (c, d) => {
	const e = c.sourceEntity,
		f = e instanceof Player;
	if (f && e.commandPermissionLevel < 1)
		return e.sendMessage('§cInvalid permission level to run this command!');
	if (f && !world.getDynamicProperty('kitToggle'))
		return e.sendMessage('§cKit command is disabled!');
	const g = (h, i = true) => {
		if (f && e.isValid) e.sendMessage(h);
		else {
			const j = h.replace(/§[0-9a-fk-or]/g, '');
			i ? console.error('[DeleteKit Command] ' + j) : console.warn('[DeleteKit Command] ' + j);
		}
	};
	if (!d || String(d).trim() === '') {
		if (!f) {
			const h = listCustomKits();
			return g('§eSaved custom kits: §f' + (h.length > 0 ? h.join(', ') : 'none'));
		}
		return system.run(() => {
			if (e.isValid) KitManagerMenu(e);
		});
	}
	system.run(() => {
		const i = deleteKit(d);
		g(i.message, !i.ok);
	});
});
export default commandInformation;

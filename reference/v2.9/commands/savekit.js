import { world, system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { saveKitAsStructure, kitStructureId } from '../kit_system.js';
const commandInformation = {
	name: 'savekit',
	description: 'Save your inventory as a custom kit!',
	usage: [
		{
			name: 'kitName',
			type: 'String',
			optional: true,
		},
		{
			name: 'target - optional',
			type: 'PlayerSelector',
			optional: false,
		},
	],
};
export const kit = commandInformation;
registerCommand(commandInformation, (c, d, e) => {
	const f = c.sourceEntity,
		g = f instanceof Player;
	if (!g && !e) {
		console.warn(
			'[Kit Command] A target player must be specified when running from a command block/console.',
		);
		return;
	}
	if (g && f.commandPermissionLevel < 1)
		return f.sendMessage('§cInvalid permission level to run this command!');
	if (g && !world.getDynamicProperty('kitToggle'))
		return f.sendMessage('§cKit command is disabled!');
	const h = (m, n = true) => {
		if (g && f.isValid) f.sendMessage(m);
		else {
			if (!g) {
				const o = m.replace(new RegExp('§[0-9a-fk-or]', 'g'), '');
				n ? console.error('[Kit Command] ' + o) : console.warn('[Kit Command] ' + o);
			}
		}
	};
	let i = [];
	if (!e) i = [f];
	else Array.isArray(e) ? (i = e) : (i = [e]);
	i = i.filter((m) => m instanceof Player && m.isValid);
	if (i.length === 0) return h('§cNo valid player found to extract kit.', false);
	if (e && Array.isArray(e) && e.length > 1)
		return h('§cSelector must be exactly one target to save a kit!', false);
	const j = i[0],
		k = d.toLowerCase().replace(' ', ''),
		l = kitStructureId(k);
	system.run(() => {
		if (!j.isValid) return;
		saveKitAsStructure(j, l)
			.then((m) => {
				(world.setDynamicProperty(
					'kit_' + k,
					JSON.stringify({
						format: 'structure',
						structureId: l,
						itemCount: m,
						savedAt: Date.now(),
					}),
				),
					h('§aSuccessfully saved inventory as custom kit: §e' + d + '§a! (' + m + ' items)'));
			})
			.catch((m) => {
				(h('§cFailed to save kit from ' + j.name + '. Check the console for errors.', false),
					console.error(m));
			});
	});
});
export default commandInformation;

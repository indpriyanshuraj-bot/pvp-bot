import { world, system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { getKitData } from '../helpers.js';
import { applyKitData } from '../kit_system.js';
import { KIT_REGISTRY } from '../exports.js';
const kitLabels = KIT_REGISTRY.map((c) => c.label.toLowerCase().replace(' ', '')),
	commandInformation = {
		name: 'kit',
		description: 'Set your inventory from a specific or custom kit!',
		usage: [
			{
				name: 'kitName',
				type: kitLabels,
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
	const h = (o, p = true) => {
			if (g && f.isValid) f.sendMessage(o);
			else {
				if (!g) {
					const q = o.replace(new RegExp('§[0-9a-fk-or]', 'g'), '');
					p ? console.error('[Kit Command] ' + q) : console.warn('[Kit Command] ' + q);
				}
			}
		},
		i = d.toLowerCase().replace(' ', ''),
		j = world.getDynamicProperty('kit_' + i);
	let k = true,
		l = null;
	if (j)
		try {
			((l = JSON.parse(j)), (k = false));
		} catch (o) {
			console.warn('[Kit Command] Failed to parse dynamic property for kit_' + i);
		}
	let m = null;
	if (!k) {
		if (!kitLabels.includes(i))
			return h(
				'§c"' + d + '" is not a valid kit! Valid default options: ' + kitLabels.join(', '),
				false,
			);
		m = KIT_REGISTRY.find((p) => p.label.toLowerCase().replaceAll(' ', '') === i);
	}
	let n = [];
	if (!e) n = [f];
	else Array.isArray(e) ? (n = e) : (n = [e]);
	n = n.filter((p) => p instanceof Player && p.isValid);
	if (n.length === 0) return h('§cNo valid players found to give the kit to.', false);
	system.run(() => {
		n.forEach((p) => {
			if (!p.isValid) return;
			try {
				const q = k ? l : getKitData(p, m.id);
				(applyKitData(p, q),
					p.sendMessage('§aSuccessfully applied the ' + d + ' kit!'),
					f !== p && h('§aGave ' + d + ' kit to ' + p.name + '.'));
			} catch (r) {
				(h('§cFailed to apply kit to ' + p.name + '. Check the console for errors.', false),
					console.error(r));
			}
		});
	});
});
export default commandInformation;

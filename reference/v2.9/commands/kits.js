import { structureExists } from '../kit_defaults.js';
import { world, system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { KIT_REGISTRY } from '../exports.js';
import { getKitData } from '../helpers.js';
const commandInformation = {
	name: 'kits',
	description: 'List all available kits.',
	usage: [],
};
export const kits = commandInformation;
registerCommand(commandInformation, (c) => {
	const d = c.sourceEntity,
		e = d instanceof Player,
		f = (k) => {
			if (e && d.isValid) d.sendMessage(k);
			else {
				if (!e) {
					const l = k.replace(new RegExp('§[0-9a-fk-or]', 'g'), '');
					console.info('[Kits Command] ' + l);
				}
			}
		};
	if (e && !d.isValid) return;
	const g = (k) => {
		if (!k) return '§80x items§r';
		if (k.format === 'structure') {
			const n = k.itemCount,
				o = structureExists(k.structureId);
			if (!o) return '§cmissing structure!§r';
			return n !== undefined ? '§7' + n + 'x items §8(full-data)§r' : '§7? items §8(full-data)§r';
		}
		let l = 0;
		const m = (p) => {
			if (!p || typeof p !== 'object') return;
			if (p.typeId || p.item || p.type) {
				const q = p.amount !== undefined ? p.amount : 1;
				l += q;
				return;
			}
			Object.values(p).forEach(m);
		};
		return (m(k), l > 0 ? '§7' + l + 'x items§r' : '§80x items§r');
	};
	let h = '§a=== Available Kits ===\n';
	h += '§e[ Default Kits ]§r\n';
	KIT_REGISTRY.length === 0
		? (h += '§7None§r\n')
		: KIT_REGISTRY.forEach((k) => {
				let l = null;
				try {
					l = getKitData(d, k.id);
				} catch (m) {
					console.warn('[Kits Command] Failed to fetch data for default kit: ' + k.label);
				}
				h += '§b- ' + k.label + ':§r ' + g(l) + '\n';
			});
	h += '\n§e[ Custom Kits ]§r\n';
	const i = world.getDynamicPropertyIds(),
		j = i.filter((k) => k.startsWith('kit_') && k !== 'kitToggle');
	(j.length === 0
		? (h += '§7None§r\n')
		: j.forEach((k) => {
				const l = k.replace('kit_', '');
				try {
					const m = world.getDynamicProperty(k),
						n = JSON.parse(m);
					h += '§d- ' + l + ':§r ' + g(n) + '\n';
				} catch (o) {
					h += '§d- ' + l + ':§r §cError reading data§r\n';
				}
			}),
		(h += '§a==================='),
		f(h));
});
export default commandInformation;

import { Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { MLSystem } from 'bots/ml_system';
const commandInformation = {
	name: 'mldata',
	description:
		'Shows how much world storage the ML training data is using, per class and in total.',
	usage: [],
};
export const mldata = commandInformation;
function formatBytes(c) {
	if (c < 1000) return c + 'B';
	return (c / 1000).toFixed(1) + 'KB';
}
registerCommand(commandInformation, (d) => {
	const e = d.sourceEntity;
	if (e instanceof Player && e.commandPermissionLevel < 1)
		return e.sendMessage('§cInvalid permission level to run this command!');
	const f = (i) => {
			if (e instanceof Player && e.isValid) e.sendMessage(i);
			else
				!(e instanceof Player) &&
					console.info('[ML Data Command] ' + i.replace(new RegExp('§[0-9a-fk-or]', 'g'), ''));
		},
		g = MLSystem.getStorageReport();
	let h = '§a=== ML Storage Usage ===';
	for (const i of g.perClass) {
		const j = i.chunks === 1 ? 'chunk' : 'chunks';
		h +=
			'\n§b' +
			i.className +
			'§r: §7' +
			formatBytes(i.bytes) +
			' (' +
			i.chunks +
			' ' +
			j +
			') §8|§7 ' +
			i.steps +
			' updates';
	}
	((h += '\n§8----------------'), (h += '\n§aTotal ML data:§r §7' + formatBytes(g.totalBytes)));
	if (g.worldTotalBytes !== null) {
		const k = g.worldTotalBytes > 0 ? ((g.totalBytes / g.worldTotalBytes) * 100).toFixed(1) : '0';
		h +=
			'\n§7World dynamic property total: ' +
			formatBytes(g.worldTotalBytes) +
			' §8(ML is ~' +
			k +
			'% of that)';
	}
	f(h);
});
export default commandInformation;

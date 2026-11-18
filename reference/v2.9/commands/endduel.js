import { system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import {
	endDuelForPlayer,
	endAllDuels,
	getActiveDuelForPlayer,
	isDuelAdmin,
} from '../duels/duel_system.js';
const commandInformation = {
	name: 'endduel',
	description:
		"Forfeit the duel you are in. Admins can also end another player's duel, or every running duel.",
	usage: [
		{
			name: 'target - optional',
			type: 'PlayerSelector',
			optional: false,
		},
		{
			name: 'all',
			type: ['all'],
			optional: false,
		},
	],
};
export const endduel = commandInformation;
registerCommand(commandInformation, (c, d, e) => {
	const f = c.sourceEntity,
		g = f instanceof Player,
		h = isDuelAdmin(f),
		i = (l) => {
			if (g && f.isValid) f.sendMessage(l);
			else console.warn('[EndDuel Command] ' + l.replace(/§[0-9a-fk-or]/g, ''));
		},
		j = Array.isArray(d) ? d : d ? [d] : [],
		k = j.filter((l) => l instanceof Player && l.isValid);
	if (g && !h) {
		if (e === 'all') return i("§cOnly admins can end everybody's duels.");
		const l = k.some((m) => m.id !== f.id);
		if (l) return i('§cYou can only end your own duel.');
		return system.run(() => {
			if (!getActiveDuelForPlayer(f)) return i('§cYou are not in a duel right now.');
			(endDuelForPlayer(f, '§e' + f.name + ' forfeited the duel.'),
				i('§aYou forfeited your duel.'));
		});
	}
	system.run(() => {
		if (e === 'all') {
			const o = endAllDuels('§eThe duel was ended.');
			return i('§aEnded ' + o + ' duel(s).');
		}
		const m = k.length > 0 ? k : g ? [f] : [];
		if (m.length === 0)
			return i("§cGive a target player (or 'all') when running this from a command block.");
		let n = 0;
		for (const p of m) {
			if (endDuelForPlayer(p, '§eThe duel was ended early.')) n++;
		}
		i(n > 0 ? '§aEnded ' + n + ' duel(s).' : '§cNo running duel found for that player.');
	});
});
export default commandInformation;

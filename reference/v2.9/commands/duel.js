import { system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import {
	startDuel,
	getDuel,
	listDuelNames,
	listPlayableDuelNames,
	isDuelAdmin,
	createDuelRequest,
} from '../duels/duel_system.js';
const commandInformation = {
	name: 'duel',
	description:
		'Start a saved duel. Player vs player duels ask your opponent first (admins start them directly).',
	usage: [
		{
			name: 'duelName',
			type: 'String',
			optional: true,
		},
		{
			name: 'opponent - optional',
			type: 'PlayerSelector',
			optional: false,
		},
	],
};
export const duel = commandInformation;
registerCommand(commandInformation, (c, d, e) => {
	const f = c.sourceEntity,
		g = f instanceof Player,
		h = isDuelAdmin(f),
		i = (n) => {
			if (g && f.isValid) f.sendMessage(n);
			else console.warn('[Duel Command] ' + n.replace(/§[0-9a-fk-or]/g, ''));
		},
		j = Array.isArray(e) ? e : e ? [e] : [],
		k = j.filter((n) => n instanceof Player && n.isValid);
	if (g && !h) {
		const n = getDuel(d);
		if (!n) {
			const o = listPlayableDuelNames();
			return i(
				'§cNo duel called "' + d + '"! Available duels: §7' + (o.length ? o.join(', ') : 'none'),
			);
		}
		if ((n.mode ?? 'bot') === 'player') {
			const p = k[0];
			if (!p)
				return i(
					'§cDuel §e' +
						n.name +
						'§c is player vs player - name who you want to fight: §f/pb:duel ' +
						n.name +
						' <player>',
				);
			return system.run(() => i(createDuelRequest(f, p, d).message));
		}
		return (
			k.length > 0 && i('§7You can only start bot duels for yourself - starting it for you.'),
			system.run(() => i(startDuel(d, f).message))
		);
	}
	const l = g ? f : k[0],
		m = g ? k[0] : k[1];
	if (!l?.isValid) return i('§cA player is required to start a duel.');
	system.run(() => {
		const q = startDuel(d, l, m);
		i(q.message);
		if (!q.ok) {
			const r = listDuelNames();
			if (r.length > 0) i('§7Saved duels: §f' + r.join(', '));
		}
	});
});
export default commandInformation;

import { system, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { DuelMenu } from '../duels/duel_ui.js';
import { getDuels, listDuelNames, formatLoc } from '../duels/duel_system.js';
const commandInformation = {
	name: 'duels',
	description:
		'Open the duel menu. Admins can create, edit and delete duels; everyone else can play them.',
	usage: [],
};
export const duels = commandInformation;
registerCommand(commandInformation, (c) => {
	const d = c.sourceEntity;
	if (!(d instanceof Player)) {
		const e = getDuels(),
			f = listDuelNames();
		if (f.length === 0) {
			console.warn('[Duels Command] No duels have been created yet.');
			return;
		}
		for (const g of f) {
			const h = e[g],
				i =
					h.mode === 'player'
						? 'player vs player'
						: 'player vs ' + (h.bot?.count ?? 1) + 'x ' + (h.bot?.type ?? 'sword');
			console.info(
				'[Duels] ' +
					g +
					': ' +
					i +
					' | A ' +
					formatLoc(h.posA).replace(/§[0-9a-fk-or]/g, '') +
					' | B ' +
					formatLoc(h.posB).replace(/§[0-9a-fk-or]/g, ''),
			);
		}
		return;
	}
	system.run(() => {
		if (d.isValid) DuelMenu(d);
	});
});
export default commandInformation;

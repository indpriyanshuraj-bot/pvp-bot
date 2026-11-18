import { world, system } from '@minecraft/server';
import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import { getAvailableKits } from '../kit_manager.js';
import { SKIN_ENUM } from '../skins.js';
import {
	getDuels,
	getDuel,
	setDuel,
	deleteDuel,
	listDuelNames,
	listPlayableDuelNames,
	isDuelReady,
	createDuelDefinition,
	startDuel,
	endDuelForPlayer,
	getActiveDuelForPlayer,
	getActiveDuels,
	endAllDuels,
	getDuelBotTypes,
	formatLoc,
	isDuelAdmin,
	createDuelRequest,
	acceptDuelRequest,
	declineDuelRequest,
	cancelDuelRequest,
	getIncomingRequests,
	getOutgoingRequests,
	DUEL_REQUEST_TIMEOUT_SECONDS,
	DUEL_DIFFICULTIES,
	getActiveDuelByName,
	getRoundCount,
	MAX_DUEL_ROUNDS,
} from './duel_system.js';
function inUseLabel(c) {
	return getActiveDuelByName(c) ? ' §c(in use)' : '';
}
const MODE_LABELS = ['Player vs Bots', 'Player vs Player'],
	MODE_VALUES = ['bot', 'player'],
	DIFFICULTY_NAMES = Object.keys(DUEL_DIFFICULTIES);
function onlinePlayers(c) {
	return world.getPlayers().filter((d) => d.isValid && d.id !== c?.id);
}
function denyAdmin(c) {
	return (c.sendMessage('§cOnly duel admins can do that.'), PlayerDuelMenu(c));
}
function DuelMenu(c) {
	return isDuelAdmin(c) ? AdminDuelMenu(c) : PlayerDuelMenu(c);
}
export { DuelMenu };
function PlayerDuelMenu(c) {
	const d = getActiveDuelForPlayer(c),
		e = getIncomingRequests(c),
		f = getOutgoingRequests(c),
		g = listPlayableDuelNames(),
		h = new ActionFormData();
	(h.title('§l§6Duels'),
		h.body(
			'§8Pick a duel an admin has set up, or challenge someone to one.\n§8Duels available: §f' +
				g.length +
				'\n§8Requests: §f' +
				e.length +
				'§8 incoming, §f' +
				f.length +
				'§8 sent' +
				(d ? '\n§aCurrently duelling: §e' + d.name : ''),
		),
		h.button('§aStart a Duel\n§8Fight the bots', 'textures/items/diamond_sword'),
		h.button('§bChallenge a Player\n§8Send a duel request', 'textures/ui/friend_glyph'),
		h.button('§eDuel Requests §8(' + e.length + ')\n§8Accept or decline', 'textures/ui/mail_icon'),
		h.button(
			d ? '§cForfeit\n§8Ends the duel you are in' : '§8Forfeit\n§8You are not in a duel',
			'textures/ui/cancel',
		),
		h
			.show(c)
			.then((i) => {
				if (i.canceled) return;
				switch (i.selection) {
					case 0:
						PlayerStartSelector(c);
						break;
					case 1:
						ChallengePicker(c);
						break;
					case 2:
						RequestsMenu(c);
						break;
					case 3:
						system.run(() => {
							if (!getActiveDuelForPlayer(c)) {
								c.sendMessage('§cYou are not in a duel right now.');
								return;
							}
							endDuelForPlayer(c, '§e' + c.name + ' forfeited the duel.');
						});
						break;
				}
			})
			.catch((i) => console.warn('Form error: ', i)));
}
export { PlayerDuelMenu };
function PlayerStartSelector(c, d) {
	const e = getDuels();
	d = 17;
	const f = listPlayableDuelNames(),
		g = new ActionFormData();
	(g.title('§l§aStart a Duel'),
		g.body(
			f.length === 0
				? '§cNo duels are ready to play yet - ask an admin to set one up.'
				: '§8Bot duels start right away.\n§8Player duels send a request to your opponent.',
		));
	for (const h of f) {
		const i = e[h],
			j =
				i.mode === 'player'
					? '§8player vs player §8- §7needs their yes'
					: '§8vs ' +
						(i.bot?.count ?? 1) +
						'x ' +
						(i.bot?.type ?? 'sword') +
						' §8(' +
						(i.bot?.difficulty ?? 'easy') +
						')';
		g.button('§e' + h + inUseLabel(h) + '\n' + j, 'textures/items/diamond_sword');
	}
	(g.button('§8Back', 'textures/ui/arrow_left'),
		g
			.show(c)
			.then((k) => {
				if (k.canceled || k.selection === f.length) return DuelMenu(c);
				const l = f[k.selection],
					m = e[l];
				if (m.mode === 'player')
					return OpponentPicker(c, l, {
						request: !isDuelAdmin(c),
					});
				system.run(() => {
					const n = startDuel(l, c);
					!n.ok && c.sendMessage(n.message);
				});
			})
			.catch((k) => console.warn('Form error: ', k)));
}
function ChallengePicker(c, d) {
	const e = onlinePlayers(c);
	d = 9;
	const f = new ActionFormData();
	(f.title('§l§bChallenge a Player'),
		f.body(e.length === 0 ? '§cNobody else is online.' : '§8Who do you want to duel?'));
	for (const g of e) {
		const h = getActiveDuelForPlayer(g);
		f.button('§b' + g.name + (h ? '\n§8already duelling' : ''), 'textures/ui/Friend1');
	}
	(f.button('§8Back', 'textures/ui/arrow_left'),
		f
			.show(c)
			.then((i) => {
				if (i.canceled || i.selection === e.length) return DuelMenu(c);
				ChallengeDuelPicker(c, e[i.selection]);
			})
			.catch((i) => console.warn('Form error: ', i)));
}
function ChallengeDuelPicker(c, d, e) {
	const f = getDuels();
	e = 5;
	const g = listPlayableDuelNames('player'),
		h = new ActionFormData();
	(h.title('§l§bChallenge §f' + d.name),
		h.body(
			g.length === 0
				? '§cThere are no player vs player duels set up yet.'
				: '§8Which duel are you challenging §f' +
						d.name +
						'§8 to?\n§8They have ' +
						DUEL_REQUEST_TIMEOUT_SECONDS +
						's to answer.',
		));
	for (const i of g) {
		const j = f[i];
		h.button(
			'§e' + i + inUseLabel(i) + '\n§8' + (j.mode === 'player' ? 'player vs player' : 'bot duel'),
			'textures/items/iron_sword',
		);
	}
	(h.button('§8Back', 'textures/ui/arrow_left'),
		h
			.show(c)
			.then((k) => {
				if (k.canceled || k.selection === g.length) return ChallengePicker(c);
				const l = g[k.selection];
				system.run(() => {
					const m = createDuelRequest(c, d, l);
					c.sendMessage(m.message);
				});
			})
			.catch((k) => console.warn('Form error: ', k)));
}
function RequestsMenu(c, d) {
	const e = getIncomingRequests(c);
	d = 'bhggdl';
	const f = getOutgoingRequests(c),
		g = new ActionFormData();
	(g.title('§l§eDuel Requests'),
		g.body(
			e.length === 0 && f.length === 0
				? '§8You have no duel requests right now.'
				: '§8Tap an incoming request to answer it, or a sent one to cancel it.',
		));
	for (const h of e) {
		g.button('§a' + h.fromName + '\n§8wants to duel: §f' + h.duelName, 'textures/ui/confirm');
	}
	for (const i of f) {
		g.button(
			'§7Sent to §f' + i.toName + '\n§8' + i.duelName + ' §8- tap to cancel',
			'textures/ui/cancel',
		);
	}
	(g.button('§8Back', 'textures/ui/arrow_left'),
		g
			.show(c)
			.then((j) => {
				if (j.canceled) return;
				const k = e.length + f.length;
				if (j.selection === k) return DuelMenu(c);
				if (j.selection < e.length) return AnswerRequest(c, e[j.selection]);
				const l = f[j.selection - e.length];
				system.run(() => {
					const m = cancelDuelRequest(l.id, c);
					(c.sendMessage(m.message), RequestsMenu(c));
				});
			})
			.catch((j) => console.warn('Form error: ', j)));
}
function AnswerRequest(c, d) {
	const e = new ActionFormData();
	(e.title('§l§eDuel Request'),
		e.body(
			'§6' +
				d.fromName +
				'§f challenged you to §e' +
				d.duelName +
				'§f.\n§8Accepting starts the duel immediately.',
		),
		e.button('§aAccept', 'textures/ui/confirm'),
		e.button('§cDecline', 'textures/ui/cancel'),
		e.button('§8Back', 'textures/ui/arrow_left'),
		e
			.show(c)
			.then((f) => {
				if (f.canceled || f.selection === 2) return RequestsMenu(c);
				system.run(() => {
					const g = f.selection === 0 ? acceptDuelRequest(d.id, c) : declineDuelRequest(d.id, c);
					c.sendMessage(g.message);
				});
			})
			.catch((f) => console.warn('Form error: ', f)));
}
function AdminDuelMenu(c, d, e) {
	if (!isDuelAdmin(c)) return PlayerDuelMenu(c);
	const f = listDuelNames();
	d = 9;
	const g = getActiveDuelForPlayer(c),
		h = getIncomingRequests(c);
	e = 5;
	const i = new ActionFormData();
	(i.title('§l§6Duels §8(admin)'),
		i.body(
			'§8Build a duel once, then repeat it with one command.\n§8Saved duels: §f' +
				f.length +
				(g ? '\n§aCurrently duelling: §e' + g.name : ''),
		),
		i.button('§aStart a Duel\n§8Pick a saved duel', 'textures/ui/friend_glyph'),
		i.button('§bCreate Duel\n§8Define a new one', 'textures/ui/color_plus'),
		i.button('§eEdit Duels\n§8Spawns, kits, bots, rules', 'textures/items/book_writable'),
		i.button('§cEnd Duel\n§8Stop a running duel', 'textures/ui/cancel'),
		i.button(
			'§eDuel Requests §8(' + h.length + ')\n§8Your own challenges',
			'textures/ui/mail_icon',
		),
		i
			.show(c)
			.then((j) => {
				if (j.canceled) return;
				switch (j.selection) {
					case 0:
						StartDuelSelector(c);
						break;
					case 1:
						CreateDuel(c);
						break;
					case 2:
						EditDuelSelector(c);
						break;
					case 3:
						EndDuelMenu(c);
						break;
					case 4:
						RequestsMenu(c);
						break;
				}
			})
			.catch((j) => console.warn('Form error: ', j)));
}
export { AdminDuelMenu };
function StartDuelSelector(c) {
	if (!isDuelAdmin(c)) return PlayerStartSelector(c);
	const d = getDuels(),
		e = Object.keys(d).sort(),
		f = new ActionFormData();
	(f.title('§l§aStart a Duel'),
		f.body(
			e.length === 0 ? '§cNo duels have been created yet.' : '§8Pick the duel you want to run:',
		));
	for (const g of e) {
		const h = d[g],
			i = isDuelReady(h) ? '§a✔ ready' : '§cmissing spawns',
			j =
				h.mode === 'player' ? 'PvP' : 'vs ' + (h.bot?.count ?? 1) + 'x ' + (h.bot?.type ?? 'sword');
		f.button('§e' + g + inUseLabel(g) + '\n§8' + j + ' §8- ' + i, 'textures/items/diamond_sword');
	}
	(f.button('§8Back', 'textures/ui/arrow_left'),
		f
			.show(c)
			.then((k) => {
				if (k.canceled || k.selection === e.length) return DuelMenu(c);
				const l = e[k.selection],
					m = d[l];
				if (m.mode === 'player')
					return OpponentPicker(c, l, {
						request: true,
					});
				system.run(() => {
					const n = startDuel(l, c);
					!n.ok && c.sendMessage(n.message);
				});
			})
			.catch((k) => console.warn('Form error: ', k)));
}
function OpponentPicker(c, d, e = {}) {
	const f = e.request ?? !isDuelAdmin(c),
		g = onlinePlayers(c),
		h = new ActionFormData();
	(h.title(f ? '§l§bChallenge a Player' : '§l§aPick an Opponent'),
		h.body(
			g.length === 0
				? '§cNobody else is online.'
				: f
					? '§8They have to accept before the duel starts.'
					: '§8Who are you duelling?',
		));
	for (const i of g) {
		h.button('§b' + i.name, 'textures/ui/Friend1');
	}
	(h.button('§8Back', 'textures/ui/arrow_left'),
		h
			.show(c)
			.then((j) => {
				if (j.canceled || j.selection === g.length) return DuelMenu(c);
				const k = g[j.selection];
				system.run(() => {
					if (f) {
						const m = createDuelRequest(c, k, d);
						return c.sendMessage(m.message);
					}
					const l = startDuel(d, c, k);
					!l.ok && c.sendMessage(l.message);
				});
			})
			.catch((j) => console.warn('Form error: ', j)));
}
function EndDuelMenu(c) {
	if (!isDuelAdmin(c)) return denyAdmin(c);
	const d = getActiveDuels(),
		e = new ActionFormData();
	(e.title('§l§cEnd a Duel'),
		e.body(d.length === 0 ? '§cNo duels are running.' : '§8Select a running duel to stop it:'));
	for (const f of d) {
		const g = f.participants.map((h) => h.name).join(' vs ');
		e.button('§e' + f.name + '\n§8' + g, 'textures/ui/cancel');
	}
	(e.button('§cEnd every duel', 'textures/ui/trash'),
		e.button('§8Back', 'textures/ui/arrow_left'),
		e
			.show(c)
			.then((h) => {
				if (h.canceled || h.selection === d.length + 1) return DuelMenu(c);
				system.run(() => {
					if (h.selection === d.length) {
						const j = endAllDuels('§eA staff member ended the duel.');
						c.sendMessage('§aEnded ' + j + ' duel(s).');
						return;
					}
					const i = d[h.selection];
					(endDuelForPlayer(i.participants[0]?.player ?? c, '§eThe duel was ended early.'),
						c.sendMessage('§aEnded the duel §e' + i.name + '§a.'));
				});
			})
			.catch((h) => console.warn('Form error: ', h)));
}
function CreateDuel(c) {
	if (!isDuelAdmin(c)) return denyAdmin(c);
	const d = new ModalFormData();
	(d.title('§l§bCreate Duel'),
		d.label(
			'§8Your current position is saved as spawn point A.\n§8You can move both spawns later from the edit menu.',
		),
		d.textField('§bDuel name:', 'ex: SwordDuel'),
		d.dropdown('§bDuel type:', MODE_LABELS),
		d
			.show(c)
			.then((e) => {
				if (e.canceled) return DuelMenu(c);
				const f = String(e.formValues[1] ?? '').trim(),
					g = MODE_VALUES[e.formValues[2]] ?? 'bot';
				if (f === '') return (c.sendMessage('§cDuel name cannot be empty!'), CreateDuel(c));
				if (getDuel(f))
					return (c.sendMessage("§cA duel called '" + f + "' already exists!"), DuelMenu(c));
				const h = createDuelDefinition(f, c);
				((h.mode = g),
					setDuel(f, h),
					c.sendMessage('§aCreated duel §e' + f + '§a! Spawn A was set to where you are standing.'),
					EditDuel(c, f));
			})
			.catch((e) => console.warn('Form error: ', e)));
}
function EditDuelSelector(c, d) {
	if (!isDuelAdmin(c)) return denyAdmin(c);
	const e = listDuelNames(),
		f = new ActionFormData();
	((d = 'pkjbge'),
		f.title('§l§eEdit Duels'),
		f.body(e.length === 0 ? '§cNo duels have been created yet.' : '§8Select a duel to edit:'));
	for (const g of e) {
		f.button('§e' + g + '\n§8Click to edit', 'textures/items/paper');
	}
	(f.button('§8Back', 'textures/ui/arrow_left'),
		f
			.show(c)
			.then((h) => {
				if (h.canceled || h.selection === e.length) return DuelMenu(c);
				EditDuel(c, e[h.selection]);
			})
			.catch((h) => console.warn('Form error: ', h)));
}
function describeKit(c) {
	if (!c) return '§7none (keep inventory)';
	const d = getAvailableKits().find((e) => e.saveId === c);
	return d ? d.display : '§7' + c;
}
function EditDuel(c, d) {
	if (!isDuelAdmin(c)) return denyAdmin(c);
	const e = getDuel(d);
	if (!e) return EditDuelSelector(c);
	const f = e.mode !== 'player',
		g = f
			? '§8Bots: §f' +
				(e.bot?.count ?? 1) +
				'x ' +
				(e.bot?.type ?? 'sword') +
				' §8(' +
				(e.bot?.difficulty ?? 'easy') +
				')'
			: '§8Opponent kit: ' + describeKit(e.kitB ?? e.kitA),
		h = new ActionFormData();
	(h.title('§l§eEditing: §f' + d),
		h.body(
			'§bType: §f' +
				(f ? 'Player vs Bots' : 'Player vs Player') +
				'\n§bSpawn A: ' +
				formatLoc(e.posA) +
				'\n§bSpawn B: ' +
				formatLoc(e.posB) +
				'\n§bDimension: §f' +
				(e.dimension ?? 'minecraft:overworld').replace('minecraft:', '') +
				'\n§bYour kit: ' +
				describeKit(e.kitA) +
				'\n' +
				g +
				'\n§bCountdown: §f' +
				(e.rules?.countdown ?? 3) +
				's §8| §bTime limit: §f' +
				(e.rules?.timeLimit ? e.rules.timeLimit + 's' : 'none') +
				(getRoundCount(e) > 1 ? ' per round' : '') +
				'\n§bRounds: §f' +
				(getRoundCount(e) > 1 ? 'best of ' + getRoundCount(e) : '1'),
		),
		h.button('§aSettings\n§8Kits, bots and rules', 'textures/ui/gear'),
		h.button('§bSet Spawn A here\n§8Where you start', 'textures/ui/arrow_down'),
		h.button('§bSet Spawn B here\n§8Where the bots/opponent start', 'textures/ui/arrow_down'),
		h.button('§aStart this duel', 'textures/items/diamond_sword'),
		h.button('§cDelete duel', 'textures/ui/trash'),
		h.button('§8Back', 'textures/ui/arrow_left'),
		h
			.show(c)
			.then((i) => {
				if (i.canceled || i.selection === 5) return EditDuelSelector(c);
				switch (i.selection) {
					case 0:
						DuelSettings(c, d);
						break;
					case 1:
					case 2: {
						const j = i.selection === 1 ? 'posA' : 'posB';
						system.run(() => {
							const k = getDuel(d);
							if (!k) return;
							((k[j] = {
								x: Math.round(c.location.x * 100) / 100,
								y: Math.round(c.location.y * 100) / 100,
								z: Math.round(c.location.z * 100) / 100,
							}),
								(k.dimension = c.dimension.id),
								setDuel(d, k),
								c.sendMessage(
									'§aSet §e' +
										(j === 'posA' ? 'Spawn A' : 'Spawn B') +
										'§a for §e' +
										d +
										'§a to your position.',
								),
								EditDuel(c, d));
						});
						break;
					}
					case 3:
						e.mode === 'player'
							? OpponentPicker(c, d, {
									request: true,
								})
							: system.run(() => {
									const k = startDuel(d, c);
									!k.ok && c.sendMessage(k.message);
								});
						break;
					case 4:
						ConfirmDeleteDuel(c, d);
						break;
				}
			})
			.catch((i) => console.warn('Form error: ', i)));
}
function ConfirmDeleteDuel(c, d) {
	if (!isDuelAdmin(c)) return denyAdmin(c);
	const e = new ActionFormData();
	(e.title('§l§cDelete Duel'),
		e.body('§fPermanently delete the duel §e' + d + '§f?'),
		e.button('§cYes, delete it', 'textures/ui/trash'),
		e.button('§8Cancel', 'textures/ui/arrow_left'),
		e
			.show(c)
			.then((f) => {
				if (f.canceled || f.selection !== 0) return EditDuel(c, d);
				system.run(() => {
					(deleteDuel(d), c.sendMessage("§cDeleted the duel '" + d + "'."), EditDuelSelector(c));
				});
			})
			.catch((f) => console.warn('Form error: ', f)));
}
function DuelSettings(c, d, e, f) {
	if (!isDuelAdmin(c)) return denyAdmin(c);
	const g = getDuel(d);
	if (!g) return EditDuelSelector(c);
	const h = getAvailableKits();
	e = 5;
	const i = h.map((r) => r.display),
		j = getDuelBotTypes(),
		k = Math.max(
			0,
			h.findIndex((r) => r.saveId === (g.kitA ?? null)),
		),
		l = Math.max(
			0,
			h.findIndex((r) => r.saveId === (g.kitB ?? null)),
		),
		m = Math.max(0, MODE_VALUES.indexOf(g.mode ?? 'bot'));
	f = 11;
	const n = Math.max(0, j.indexOf(g.bot?.type ?? 'sword')),
		o = Math.max(0, DIFFICULTY_NAMES.indexOf(g.bot?.difficulty ?? 'easy')),
		p = Math.max(0, SKIN_ENUM.indexOf(g.bot?.skin ?? 'default')),
		q = new ModalFormData();
	(q.title('§l§aSettings §8- §f' + d),
		q.label(
			"§8Kits replace the fighter's inventory when the duel starts.\n§8Pick §fNone§8 to keep whatever they are carrying.",
		),
		q.dropdown('§bDuel type:', MODE_LABELS, {
			defaultValueIndex: m,
		}),
		q.dropdown('§bYour kit:', i, {
			defaultValueIndex: k,
		}),
		q.dropdown('§bOpponent kit §8(player vs player):', i, {
			defaultValueIndex: l,
		}),
		q.label('§l§e--- Bots ---'),
		q.dropdown('§bBot type:', j, {
			defaultValueIndex: n,
		}),
		q.dropdown('§bBot difficulty:', DIFFICULTY_NAMES, {
			defaultValueIndex: o,
		}),
		q.slider('§bHow many bots:', 1, 10, {
			defaultValue: Math.max(1, Math.min(10, g.bot?.count ?? 1)),
			valueStep: 1,
		}),
		q.dropdown('§bBot skin:', SKIN_ENUM, {
			defaultValueIndex: p,
		}),
		q.textField('§bBot name §8(optional):', 'ex: Rival', {
			defaultValue: g.bot?.name ?? '',
		}),
		q.label('§l§e--- Rules ---'),
		q.slider('§bCountdown seconds:', 0, 10, {
			defaultValue: Math.max(0, Math.min(10, g.rules?.countdown ?? 3)),
			valueStep: 1,
		}),
		q.textField('§bTime limit in seconds §8(0 = none, per round):', '0', {
			defaultValue: String(g.rules?.timeLimit ?? 0),
		}),
		q.slider('§bRounds §8(best of - first to win the majority takes it)§7', 1, MAX_DUEL_ROUNDS, {
			defaultValue: getRoundCount(g),
			valueStep: 1,
		}),
		q.toggle('§bHeal fighters on start/end', {
			defaultValue: g.rules?.heal !== true,
		}),
		q.toggle('§bClear effects on start', {
			defaultValue: g.rules?.clearEffects !== true,
		}),
		q.toggle('§bTeleport fighters back when it ends', {
			defaultValue: g.rules?.teleportBack !== true,
		}),
		q
			.show(c)
			.then((s) => {
				if (s.canceled) return EditDuel(c, d);
				const t = s.formValues,
					u = getDuel(d) ?? g;
				((u.mode = MODE_VALUES[t[1]] ?? 'bot'),
					(u.kitA = h[t[2]]?.saveId ?? null),
					(u.kitB = h[t[3]]?.saveId ?? null),
					(u.bot = {
						type: j[t[5]] ?? 'sword',
						difficulty: DIFFICULTY_NAMES[t[6]] ?? 'easy',
						count: Math.max(1, Math.min(10, Number(t[7]) || 1)),
						skin: SKIN_ENUM[t[8]] ?? 'default',
						name: String(t[9] ?? '').trim(),
					}));
				const w = parseInt(String(t[12]), 10);
				((u.rules = {
					countdown: Math.max(0, Math.min(10, Number(t[11]) || 0)),
					timeLimit: isNaN(w) || w < 0 ? 0 : w,
					rounds: Math.max(1, Math.min(MAX_DUEL_ROUNDS, Math.floor(Number(t[13]) || 1))),
					heal: !!t[14],
					clearEffects: !!t[15],
					teleportBack: !!t[16],
				}),
					system.run(() => {
						(setDuel(d, u), c.sendMessage('§aUpdated the duel §e' + d + '§a!'), EditDuel(c, d));
					}));
			})
			.catch((r) => console.warn('Form error: ', r)));
}

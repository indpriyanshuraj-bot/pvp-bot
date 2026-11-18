import { giveKit, swapKitSlots } from '../kit_apply.js';
import { system, GameMode, world, Player } from '@minecraft/server';
import * as c from '@minecraft/server-gametest';
import { registerCommand } from '../command_structures/commandRegister.js';
import { CLASSES } from 'bots/ml_system';
import { getKitData, setInventory } from '../helpers.js';
import { SKIN_ENUM, resolveSkin, applySkin, skinLabel } from '../skins.js';
const KIT_IDS = {
		sword: 'Sword_Kit',
		axe: 'Axe_Kit',
		mace: 'Mace_Kit',
		uhc: 'UHC_Kit',
		crystal: 'Crystal_Kit',
	},
	difficulties = {
		easy: 3,
		medium: 2,
		hard: 1,
		impossible: 0,
	},
	difficultiesEnum = Object.keys(difficulties),
	targets = ['bot', 'player', 'mob', 'all'],
	commandInformation = {
		name: 'mlspawn',
		description:
			"Spawn a machine-learning PvP bot that trains against a target. It contributes to (and uses) the shared brain for its class. Give it a target to set up an arena: 'bot', 'mob', 'all', or a player name -- defaults to you (or nearest player if run via command block).",
		usage: [
			{
				name: 'Class',
				type: CLASSES,
				optional: true,
			},
			{
				name: 'Difficulty',
				type: difficultiesEnum,
				optional: false,
			},
			{
				name: 'Target',
				type: targets,
				optional: false,
			},
			{
				name: 'Location',
				type: 'Location',
				optional: false,
			},
		],
	};
export const mlspawn = commandInformation;
registerCommand(commandInformation, (d, e, f = 'easy', g, h) => {
	let i = d.sourceEntity;
	!i && (i = d.sourceBlock);
	if (i instanceof Player && i.commandPermissionLevel < 1)
		return i.sendMessage('§cInvalid permission level to run this command!');
	const j = (s) => {
			if (i instanceof Player && i.isValid) i.sendMessage(s);
			else
				!(i instanceof Player) &&
					console.info('[ML Spawn Command] ' + s.replace(new RegExp('§[0-9a-fk-or]', 'g'), ''));
		},
		k = i?.location || {
			x: 0,
			y: -60,
			z: 0,
		},
		l = i?.dimension || world.getDimension('overworld');
	if (!difficultiesEnum.includes(f))
		return j('§c"' + f + '" is not a valid difficulty. Options: ' + difficultiesEnum.join(', '));
	const m = SKIN_ENUM.filter((s) => world.getDynamicProperty('skinToggle_' + s) !== true),
		n = m.length > 0 ? m[Math.floor(Math.random() * m.length)] : SKIN_ENUM[0],
		o = resolveSkin(n);
	if (!o.ok) return j(o.error);
	const p = o.slot;
	let q = i instanceof Player ? i : null,
		r = i instanceof Player ? i.id : null;
	!g && !(i instanceof Player) && (g = 'player');
	if (g === 'bot') r = 'bot';
	else {
		if (g === 'mob') r = 'mob';
		else {
			if (g === 'player') r = 'player';
			else {
				if (g === 'all') r = 'all';
				else {
					if (g) {
						const s = world.getRawPlayers(),
							t = s.filter((u) => u.name.toLowerCase().includes(g.toLowerCase()));
						if (t.length === 0) return j('§cNo player found matching "' + g + '".');
						if (t.length > 1)
							return j('§cMultiple players found matching "' + g + '". Please be more specific.');
						((q = t[0]), (r = q.id));
					}
				}
			}
		}
	}
	system.run(() => {
		if (i instanceof Player && !i.isValid) return;
		if (r !== 'bot' && r !== 'mob' && r !== 'all' && r !== 'player' && (!q || !q.isValid)) return;
		let u;
		h
			? (u = {
					x: h.x,
					y: h.y,
					z: h.z,
					dimension: l,
				})
			: (u = {
					...k,
					dimension: l,
				});
		const v = c.spawnSimulatedPlayer(u, '§p§b§rPVP_bot', GameMode.survival),
			w = '[ML] ' + e + '\n' + f;
		v.nameTag = w;
		const x = {
			linked_player: r,
			lastAttack: 0,
			difficulty: difficulties[f],
			type: e,
			action: 'none',
			is_eating: true,
			isPearling: true,
			lastPearl: 0,
			jumpDelay: 0,
			default_name: w,
			ignoredTag: null,
			customId: null,
			skin: p,
			error: '',
			mlOverride: false,
		};
		(v.setDynamicProperty('bot_data', JSON.stringify(x)), applySkin(v, p), giveKit(v, KIT_IDS[e]));
		e === 'mace' && swapKitSlots(v, 5, 35);
		const y =
				r === 'bot'
					? 'other bots'
					: r === 'mob'
						? 'mobs'
						: r === 'player'
							? 'the nearest player'
							: r === 'all'
								? 'anything nearby'
								: (q?.name ?? 'you'),
			z = p ? ' Wearing §e' + skinLabel(p) + '§a.' : '';
		j(
			'§aSpawned a learning §b' +
				e +
				'§a bot on ' +
				f +
				' mode, targeting §e' +
				y +
				'§a. Using the shared §e' +
				e +
				'§a brain.' +
				z,
		);
	});
});
export default commandInformation;

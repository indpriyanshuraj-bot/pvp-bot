import { giveKit, swapKitSlots } from '../kit_apply.js';
import { system, GameMode, world, Player } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import * as c from '@minecraft/server-gametest';
import { getKitData, setInventory } from '../helpers.js';
import { applyKitData } from '../kit_system.js';
import { SKIN_ENUM, resolveSkin, applySkin, skinLabel } from '../skins.js';
function randomName() {
	const d = [
		'Frank',
		'Jill',
		'Dude',
		'Kaden',
		'Bob Ross',
		'Dudette',
		'Rosey',
		'Dylan',
		'Nicky',
		'Percy',
		'Alison',
		'Pete',
		'Pineapple',
		'MrFerret',
		'Finix',
		'BigB',
		'Selitop',
		'StoppedAunt',
	];
	return d[Math.floor(Math.random() * d.length)];
}
const difficulties = {
		easy: 3,
		medium: 2,
		hard: 1,
		impossible: 0,
	},
	types = {
		sword: 'Sword_Kit',
		axe: 'Axe_Kit',
		mace: 'Mace_Kit',
		uhc: 'UHC_Kit',
		crystal: 'Crystal_Kit',
		cart: 'Cart_Kit',
	},
	targets = ['bot', 'player', 'mob', 'all'],
	difficultiesEnum = Object.keys(difficulties),
	typesEnum = Object.keys(types),
	validSkins = [
		'skin_1',
		'skin_2',
		'skin_3',
		'skin_4',
		'skin_5',
		'skin_6',
		'skin_7',
		'skin_8',
		'skin_9',
		'skin_10',
	],
	commandInformation = {
		name: 'spawnbot',
		description: "Spawn a bot. Input 'bot' for the target to target other bots.",
		usage: [
			{
				name: 'Difficulty',
				type: difficultiesEnum,
				optional: false,
			},
			{
				name: 'kit or botId',
				type: typesEnum,
				optional: false,
			},
			{
				name: 'Target',
				type: targets,
				optional: false,
			},
			{
				name: 'Ignore Tag',
				type: ['none'],
				optional: false,
			},
			{
				name: 'Location',
				type: 'Location',
				optional: false,
			},
			{
				name: 'Bot Name',
				type: 'String',
				optional: false,
			},
			{
				name: 'Count',
				type: 'Integer',
				optional: false,
			},
			{
				name: 'Skin',
				type: validSkins,
				optional: false,
			},
		],
	};
export const spawnbot = commandInformation;
registerCommand(commandInformation, (d, e = 'easy', f = 'sword', g, h, i, j, k = 1, l) => {
	let m = d.sourceEntity;
	!m && (m = d.sourceBlock);
	(!h || h.toLowerCase() === 'none') && (h = null);
	if (m instanceof Player && m.commandPermissionLevel < 1)
		return m.sendMessage('§cInvalid permission level to run this command!');
	const n = m?.location || {
			x: 0,
			y: -60,
			z: 0,
		},
		o = m?.dimension || world.getDimension('overworld');
	if (m instanceof Player && !world.getDynamicProperty('spawnbotToggle'))
		return m.sendMessage('§cSpawnbot command is disabled!');
	let p = typeof k === 'number' ? Math.max(1, k) : 1;
	if (!difficultiesEnum.includes(e))
		return m?.sendMessage?.(
			'§c"' + e + '" is not a valid difficulty. Valid options: ' + difficultiesEnum.join(', '),
		);
	let q = null,
		r = null,
		s = true,
		t = null;
	if (typesEnum.includes(f)) q = f;
	else {
		const w = world.getDynamicProperty('custom_bots') || '{}',
			x = JSON.parse(w);
		if (f in x) ((r = f), (s = false), (t = x[r].kit));
		else
			return m?.sendMessage?.(
				'§c"' + f + '" is not a valid kit type or custom bot! Valid kits: ' + typesEnum.join(', '),
			);
	}
	let u = m,
		v;
	m instanceof Player && (v = u.id);
	if (g === 'bot') v = 'bot';
	else {
		if (g === 'mob') v = 'mob';
		else {
			if (g === 'player') v = 'player';
			else {
				if (g === 'all') v = 'all';
				else {
					if (g) {
						const y = world.getRawPlayers(),
							z = y.filter((A) => A.name.toLowerCase().includes(g.toLowerCase()));
						if (z.length === 0) return m?.sendMessage?.('§cNo player found matching "' + g + '".');
						if (z.length > 1)
							return m?.sendMessage?.(
								'§cMultiple players found matching "' + g + '". Please be more specific.',
							);
						((u = z[0]), (v = u.id));
					}
				}
			}
		}
	}
	system.run(() => {
		if (v !== 'bot' && v !== 'mob' && v !== 'all' && v !== 'player' && (!u || !u.isValid)) return;
		let A;
		i
			? (A = {
					x: i.x,
					y: i.y,
					z: i.z,
					dimension: o,
				})
			: (A = {
					...n,
					dimension: o,
				});
		for (let B = 0; B < p; B++) {
			let C;
			if (l && validSkins.includes(l)) C = l;
			else {
				const J = SKIN_ENUM.filter((K) => world.getDynamicProperty('skinToggle_' + K) !== true);
				C = J.length > 0 ? J[Math.floor(Math.random() * J.length)] : SKIN_ENUM[0];
			}
			const D = resolveSkin(C);
			if (!D.ok) {
				m?.sendMessage?.(D.error);
				continue;
			}
			const E = D.slot,
				F = c.spawnSimulatedPlayer(A, '§p§b§rPVP_bot', GameMode.survival),
				G = r ? '[' + r + '] ' : 'bot ';
			let H = '';
			j ? (H = G + j + (p > 1 ? ' ' + (B + 1) : '') + '\n' + e) : (H = G + randomName() + '\n' + e);
			F.nameTag = H;
			const I = {
				linked_player: v,
				lastAttack: 0,
				difficulty: difficulties[e],
				type: s ? 'custom' : q,
				action: 'none',
				is_eating: true,
				isPearling: true,
				lastPearl: 0,
				jumpDelay: 0,
				default_name: H,
				ignoredTag: h,
				customId: r || null,
				skin: E,
				error: '',
			};
			(F.setDynamicProperty('bot_data', JSON.stringify(I)), applySkin(F, E));
			if (s) {
				F.addTag('CustomBot_' + r);
				if (t) {
					if (t.startsWith('custom_')) {
						const K = t.replace('custom_', ''),
							L = world.getDynamicProperty('kit_' + K);
						if (L)
							try {
								const M = JSON.parse(L);
								applyKitData(F, M);
							} catch (N) {
								console.warn('[SpawnBot] Failed to parse custom kit data for ' + K);
							}
					} else giveKit(F, t);
					t === 'Mace_Kit' && swapKitSlots(F, 5, 35);
				}
			} else (giveKit(F, types[q]), q === 'mace' && swapKitSlots(F, 5, 35));
		}
		if (m) {
			const O = r ? 'CUSTOM bot (' + r + ')' : 'bot';
			try {
				(m.sendMessage(
					'Spawned ' +
						p +
						' ' +
						O +
						'(s) on ' +
						e +
						' mode (' +
						difficulties[e] +
						'), targeting ' +
						(u?.name || 'none'),
				),
					f === 'crystal' && m.sendMessage('§cWarning crystal bot is WIP so its a little glitchy'));
			} catch (P) {}
		}
	});
});
export default commandInformation;

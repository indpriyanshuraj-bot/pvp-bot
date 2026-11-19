/** Custom command registration. All commands use the pvb: namespace. */

import {
	CommandPermissionLevel,
	CustomCommandParamType,
	CustomCommandStatus,
	EquipmentSlot,
	GameMode,
	ItemStack,
	system,
	world,
	type Player,
} from '@minecraft/server';
import { spawnSimulatedPlayer } from '@minecraft/server-gametest';
import { registry } from '../engine/registry.js';
import { loadPro, openProMenu, applyPreset } from './pro.js';
import { planStash } from '../skills/inventory.js';
import { PRO_PRESETS } from '../core/pro.js';

let registered = false;

export function registerCommands(): void {
	if (registered) return;
	registered = true;

	system.beforeEvents.startup.subscribe((ev) => {
		const reg = ev.customCommandRegistry;

		reg.registerCommand(
			{
				name: 'pvb:spawn',
				description: 'Spawn a practice bot at your position',
				permissionLevel: CommandPermissionLevel.GameDirectors,
				cheatsRequired: true,
				optionalParameters: [{ name: 'profile', type: CustomCommandParamType.String }],
			},
			(origin, profile) => {
				const src = origin.sourceEntity;
				if (!src) return { status: CustomCommandStatus.Failure, message: 'No source entity' };
				const name = typeof profile === 'string' && PRO_PRESETS[profile] ? profile : 'normal';
				system.run(() => {
					try {
						const pro = loadPro();
						const bot = spawnSimulatedPlayer(
							{ ...src.location, dimension: src.dimension },
							'§bPVPBot',
							GameMode.Survival,
						);
						registry.add(bot, PRO_PRESETS[name] ?? pro, name);
						if (src instanceof Object && 'sendMessage' in src) {
							(src as Player).sendMessage(`§aSpawned bot §f#${registry.count}§a (${name})`);
						}
					} catch (err) {
						if ('sendMessage' in src) (src as Player).sendMessage(`§cSpawn failed: ${String(err)}`);
					}
				});
				return { status: CustomCommandStatus.Success };
			},
		);

		reg.registerCommand(
			{
				name: 'pvb:pro',
				description: 'Open the pro-level GUI',
				permissionLevel: CommandPermissionLevel.GameDirectors,
				cheatsRequired: false,
				optionalParameters: [{ name: 'preset', type: CustomCommandParamType.String }],
			},
			(origin, preset) => {
				const src = origin.sourceEntity;
				if (!src) return { status: CustomCommandStatus.Failure };
				system.run(() => {
					if (typeof preset === 'string') {
						const applied = applyPreset(preset);
						if (applied) {
							const n = registry.applyPro(applied, preset);
							if ('sendMessage' in src) {
								(src as Player).sendMessage(
									`§aApplied preset §f${preset}§a to §f${n}§a live bot(s).`,
								);
							}
							return;
						}
					}
					if ('sendMessage' in src) openProMenu(src as Player);
				});
				return { status: CustomCommandStatus.Success };
			},
		);

		reg.registerCommand(
			{
				name: 'pvb:info',
				description: 'Show bot count and governor tier',
				permissionLevel: CommandPermissionLevel.GameDirectors,
				cheatsRequired: false,
				optionalParameters: [],
			},
			(origin) => {
				const src = origin.sourceEntity;
				const tier = registry.governor.current;
				const msg = `§7Bots: §f${registry.count}§7 | governor: §f${tier}`;
				if (src && 'sendMessage' in src) system.run(() => (src as Player).sendMessage(msg));
				return { status: CustomCommandStatus.Success };
			},
		);

		reg.registerCommand(
			{
				name: 'pvb:kit',
				description: 'Give the nearest bot a basic practice kit',
				permissionLevel: CommandPermissionLevel.GameDirectors,
				cheatsRequired: true,
				optionalParameters: [],
			},
			(origin) => {
				const src = origin.sourceEntity;
				if (!src) return { status: CustomCommandStatus.Failure, message: 'No source entity' };
				system.run(() => {
					const bot = registry.nearestTo(src.location);
					if (!bot) {
						if ('sendMessage' in src) (src as Player).sendMessage('§cNo bot nearby.');
						return;
					}
					try {
						bot.input.clearInventory();
						const kit: Array<[number, string, number]> = [
							[0, 'minecraft:diamond_sword', 1],
							[1, 'minecraft:shield', 1],
							[2, 'minecraft:golden_apple', 8],
							[3, 'minecraft:ender_pearl', 16],
							[4, 'minecraft:cobblestone', 64],
							[8, 'minecraft:golden_carrot', 16],
						];
						for (const [slot, id, amount] of kit) {
							bot.input.give(new ItemStack(id, amount), slot, slot === 0);
						}
						const eq = bot.entity.getComponent('minecraft:equippable');
						if (eq) {
							eq.setEquipment(EquipmentSlot.Head, new ItemStack('minecraft:diamond_helmet', 1));
							eq.setEquipment(EquipmentSlot.Chest, new ItemStack('minecraft:diamond_chestplate', 1));
							eq.setEquipment(EquipmentSlot.Legs, new ItemStack('minecraft:diamond_leggings', 1));
							eq.setEquipment(EquipmentSlot.Feet, new ItemStack('minecraft:diamond_boots', 1));
						}
						// select last so the held item definitely updates
						bot.input.select(0);
						if ('sendMessage' in src) (src as Player).sendMessage('§aKit given to the nearest bot.');
					} catch (err) {
						if ('sendMessage' in src) (src as Player).sendMessage(`§cKit failed: ${String(err)}`);
					}
				});
				return { status: CustomCommandStatus.Success };
			},
		);

		reg.registerCommand(
			{
				name: 'pvb:remove',
				description: 'Disconnect the nearest bot',
				permissionLevel: CommandPermissionLevel.GameDirectors,
				cheatsRequired: false,
				optionalParameters: [],
			},
			(origin) => {
				const src = origin.sourceEntity;
				if (!src) return { status: CustomCommandStatus.Failure };
				system.run(() => {
					const bot = registry.nearestTo(src.location);
					if (!bot) {
						if ('sendMessage' in src) (src as Player).sendMessage('§cNo bot nearby.');
						return;
					}
					bot.input.disconnect();
					registry.remove(bot.entity.id);
					if ('sendMessage' in src) (src as Player).sendMessage('§aRemoved the nearest bot.');
				});
				return { status: CustomCommandStatus.Success };
			},
		);

		reg.registerCommand(
			{
				name: 'pvb:respawn',
				description: 'Respawn the nearest bot at your position',
				permissionLevel: CommandPermissionLevel.GameDirectors,
				cheatsRequired: true,
				optionalParameters: [],
			},
			(origin) => {
				const src = origin.sourceEntity;
				if (!src) return { status: CustomCommandStatus.Failure };
				system.run(() => {
					const bot = registry.nearestTo(src.location);
					if (!bot) {
						if ('sendMessage' in src) (src as Player).sendMessage('§cNo bot nearby.');
						return;
					}
					try {
						bot.entity.respawn();
						bot.entity.teleport(src.location);
						bot.input.clearInventory();
						if ('sendMessage' in src) (src as Player).sendMessage('§aBot respawned at your position.');
					} catch (err) {
						if ('sendMessage' in src) (src as Player).sendMessage(`§cRespawn failed: ${String(err)}`);
					}
				});
				return { status: CustomCommandStatus.Success };
			},
		);

		reg.registerCommand(
			{
				name: 'pvb:debug',
				description: 'Toggle a status nametag on every bot (goal / tactic / target / tier)',
				permissionLevel: CommandPermissionLevel.GameDirectors,
				cheatsRequired: false,
				optionalParameters: [],
			},
			(origin) => {
				const src = origin.sourceEntity;
				if (!src) return { status: CustomCommandStatus.Failure };
				system.run(() => {
					registry.setDebug(!registry.debug);
					const msg = registry.debug
						? '§aDebug nametags ON §7— each bot shows goal / tactic / target / governor tier.'
						: '§7Debug nametags OFF.';
					if ('sendMessage' in src) (src as Player).sendMessage(msg);
				});
				return { status: CustomCommandStatus.Success };
			},
		);

		reg.registerCommand(
			{
				name: 'pvb:stash',
				description: 'Stow the nearest bot\'s overflow into its ender chest',
				permissionLevel: CommandPermissionLevel.GameDirectors,
				cheatsRequired: true,
				optionalParameters: [],
			},
			(origin) => {
				const src = origin.sourceEntity;
				if (!src) return { status: CustomCommandStatus.Failure };
				system.run(() => {
					const bot = registry.nearestTo(src.location);
					if (!bot) {
						if ('sendMessage' in src) (src as Player).sendMessage('§cNo bot nearby.');
						return;
					}
					try {
						const inv = bot.entity.getComponent('minecraft:inventory')?.container;
						const ender = bot.entity.getComponent('minecraft:ender_inventory')?.container;
						if (!inv || !ender) {
							if ('sendMessage' in src) (src as Player).sendMessage('§cBot has no ender inventory.');
							return;
						}
						const view = bot.view;
						if (!view) {
							if ('sendMessage' in src) (src as Player).sendMessage('§cBot has no snapshot yet.');
							return;
						}
						let moved = 0;
						for (const slot of planStash(view.items)) {
							const stack = inv.getItem(slot);
							if (!stack) continue;
							const leftover = ender.addItem(stack);
							if (!leftover) {
								inv.setItem(slot, undefined);
								moved++;
							}
						}
						if ('sendMessage' in src) {
							(src as Player).sendMessage(`§aStowed §f${moved}§a stack(s) into the bot's ender chest.`);
						}
					} catch (err) {
						if ('sendMessage' in src) (src as Player).sendMessage(`§cStash failed: ${String(err)}`);
					}
				});
				return { status: CustomCommandStatus.Success };
			},
		);

		reg.registerCommand(
			{
				name: 'pvb:trust',
				description: 'Show what the bots think of each player',
				permissionLevel: CommandPermissionLevel.GameDirectors,
				cheatsRequired: false,
				optionalParameters: [],
			},
			(origin) => {
				const src = origin.sourceEntity;
				if (!src || !('sendMessage' in src)) return { status: CustomCommandStatus.Success };
				system.run(() => {
					const snap = registry.relationsView.snapshot();
					const ids = Object.keys(snap);
					if (ids.length === 0) {
						(src as Player).sendMessage('§7No trust data yet.');
						return;
					}
					for (const id of ids) {
						const s = snap[id];
						if (!s) continue;
						const label = registry.relationsView.isHostile(id)
							? '§chostile'
							: registry.relationsView.isFriendly(id)
								? '§afriendly'
								: '§7neutral';
						(src as Player).sendMessage(`§8${id.slice(0, 8)} §7trust §f${Math.round(s.trust)} ${label}`);
					}
				});
				return { status: CustomCommandStatus.Success };
			},
		);

		reg.registerCommand(
			{
				name: 'pvb:clear',
				description: 'Remove every practice bot',
				permissionLevel: CommandPermissionLevel.GameDirectors,
				cheatsRequired: false,
				optionalParameters: [],
			},
			(origin) => {
				const src = origin.sourceEntity;
				system.run(() => {
					let n = 0;
					for (const b of registry.all()) {
						try {
							b.entity.disconnect();
							n++;
						} catch {
							/* already gone */
						}
					}
					world.sendMessage(`§7Removed §f${n}§7 bot(s).`);
					if (src && 'sendMessage' in src) void src;
				});
				return { status: CustomCommandStatus.Success };
			},
		);
	});
}

/** Custom command registration. All commands use the pvb: namespace. */

import {
	CommandPermissionLevel,
	CustomCommandParamType,
	CustomCommandStatus,
	GameMode,
	system,
	world,
	type Player,
} from '@minecraft/server';
import { spawnSimulatedPlayer } from '@minecraft/server-gametest';
import { registry } from '../engine/registry.js';
import { loadPro, openProMenu, applyPreset } from './pro.js';
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
					if (typeof preset === 'string' && applyPreset(preset)) {
						if ('sendMessage' in src) (src as Player).sendMessage(`§aApplied preset §f${preset}`);
						return;
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

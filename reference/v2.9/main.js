import 'dynamic_store';
import 'helpers';
import 'bots/bots';
import 'java_combat/shield';
import 'recording/record';
import 'java_combat/java_combat_support';
import { sharedBotSystem } from 'bots/bot_manager';
sharedBotSystem.registerEvents();
import { system, world, ItemTypes } from '@minecraft/server';
import { commandRegistry } from './commands/index.js';
import { primeStructureCache } from './kit_defaults.js';
function filterBots(c) {
	return c.filter((d) => {
		try {
			if (!d?.isValid) return true;
			if (d.hasTag('PvPbot')) return true;
			return false;
		} catch (f) {
			return true;
		}
	});
}
const getPlayers = world.getPlayers.bind(world),
	getAllPlayers = world.getAllPlayers ? world.getAllPlayers.bind(world) : null;
try {
	((world.getPlayers = function (c) {
		return filterBots(getPlayers(c));
	}),
		getAllPlayers &&
			(world.getAllPlayers = function () {
				return filterBots(getAllPlayers());
			}));
} catch (g) {}
world.getRawPlayers = getPlayers;
function detectJavaCombat() {
	let c = true;
	try {
		c = ItemTypes.get('bf:golden_apple') !== undefined;
	} catch (d) {}
	if (world.getDynamicProperty('javaCombat') != c) world.setDynamicProperty('javaCombat', c);
}
(system.run(detectJavaCombat), system.runInterval(detectJavaCombat, 200));
const COMMAND_PREFIX = 'pb:',
	props = [
		{
			def: 'recording',
			val: false,
		},
		{
			def: 'recordingPath',
			val: true,
		},
		{
			def: 'playbackPath',
			val: true,
		},
		{
			def: 'disRec',
			val: false,
		},
		{
			def: 'kitToggle',
			val: false,
		},
		{
			def: 'spawnbotToggle',
			val: false,
		},
		{
			def: 'tbag',
			val: true,
		},
		{
			def: 'disconnect',
			val: false,
		},
		{
			def: 'dontMove',
			val: true,
		},
		{
			def: 'botLogic',
			val: false,
		},
		{
			def: 'ecoAi',
			val: true,
		},
		{
			def: 'betterAi',
			val: true,
		},
		{
			def: 'nametagAction',
			val: false,
		},
		{
			def: 'nametagHealth',
			val: true,
		},
		{
			def: 'custom_bots',
			val: '{}',
		},
		{
			def: 'searchRange',
			val: 50,
		},
	];
(world.afterEvents.worldLoad.subscribe((c) => {
	for (const d of props) {
		world.getDynamicProperty(d.def) === undefined && world.setDynamicProperty(d.def, d.val);
	}
	(world.setDynamicProperty('liquid_data', '[]'), primeStructureCache());
}),
	system.beforeEvents.startup.subscribe((c) => {
		for (const d of commandRegistry) {
			try {
				const f = '' + COMMAND_PREFIX + d.data.name,
					h = [...(d.data.mandatoryParameters ?? []), ...(d.data.optionalParameters ?? [])],
					i = d.data.enums ?? new Map();
				for (const [j, k] of i) {
					c.customCommandRegistry.registerEnum(j, k);
				}
				c.customCommandRegistry.registerCommand(
					{
						name: f,
						description: d.data.description,
						permissionLevel: d.data.permissionLevel,
						cheatsRequired: d.data.cheatsRequired,
						options: h,
					},
					(l, ...m) => {
						let n = null;
						switch (l.sourceType) {
							case 'Entity':
								n = l.sourceEntity;
								break;
							case 'Block':
								n = l.sourceBlock;
								break;
							case 'NPCDialogue':
								n = l.sourceInitiator;
								break;
							case 'Server':
								n = l.sourceEntity;
								break;
						}
						const o = h.map((p, q) => m[q]);
						return d.run(
							system,
							{
								source: n,
								sourceType: l.sourceType,
							},
							o,
						);
					},
				);
			} catch (l) {}
		}
	}));

/** Entry point. Wires the registry and registers commands. */

import { system } from '@minecraft/server';
import { registry } from './engine/registry.js';
import { registerCommands } from './commands/index.js';

registerCommands();

system.run(() => {
	registry.start();
	console.info('[PvP Bots v3] ready');
});

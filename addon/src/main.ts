/**
 * Entry point.
 *
 * Lifecycle, in order:
 *   1. module load        -> subscribe to system.beforeEvents.startup (commands
 *                            MUST be registered here; the registry is closed
 *                            after startup)
 *   2. worldLoad          -> world dynamic properties are readable, so the bot
 *                            registry can start and persisted state can load
 *   3. every tick         -> the scheduler
 *
 * Anything that touches world state must wait for step 2. Reading a dynamic
 * property before world load throws, which is why this is split.
 */

import { system, world } from '@minecraft/server';
import { registry } from './engine/registry.js';
import { registerCommands } from './commands/index.js';

let booted = false;

function boot(reason: string): void {
	if (booted) return;
	booted = true;
	try {
		registry.start();
		console.info(`[PvP Bots v3] started (${reason})`);
	} catch (err) {
		console.error(`[PvP Bots v3] failed to start: ${String(err)}`);
	}
}

// 1. Commands. This only subscribes to the startup event, so it is safe to do
//    at module scope — and it must be, because the registry closes at startup.
try {
	registerCommands();
} catch (err) {
	console.error(`[PvP Bots v3] command registration failed: ${String(err)}`);
}

// 2. World-dependent startup.
try {
	world.afterEvents.worldLoad.subscribe(() => boot('worldLoad'));
} catch (err) {
	console.error(`[PvP Bots v3] could not subscribe to worldLoad: ${String(err)}`);
}

// Fallback for a script reload on an already-loaded world, where worldLoad has
// already fired and will not fire again. Probing a dynamic property is the only
// reliable way to tell "the world is ready" from "too early".
system.runTimeout(() => {
	if (booted) return;
	try {
		world.getDynamicProperty('pvb_probe');
		boot('late');
	} catch {
		// world still not ready; worldLoad will call boot() when it fires
	}
}, 40);

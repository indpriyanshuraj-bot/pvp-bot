/** In-game tests for bot registration and the goal pipeline. */

import { register, type Test } from '@minecraft/server-gametest';
import { registry } from '../src/engine/registry.js';
import { DEFAULT_PRO } from '../src/core/pro.js';

register('pvb', 'registryTracksBots', (test: Test) => {
	const before = registry.count;
	const bot = test.spawnSimulatedPlayer({ x: 0.5, y: 1, z: 0.5 }, 'pvb_reg');
	registry.add(bot, DEFAULT_PRO, 'normal');

	test.runAfterDelay(2, () => {
		if (registry.count === before + 1) {
			test.succeed();
		} else {
			test.fail(`registry count ${registry.count}, expected ${before + 1}`);
		}
	});
})
	.maxTicks(100)
	.tag('pvb')
	.tag('registry');

register('pvb', 'registryDropsDeadBots', (test: Test) => {
	const bot = test.spawnSimulatedPlayer({ x: 0.5, y: 1, z: 0.5 }, 'pvb_reg_drop');
	registry.add(bot, DEFAULT_PRO, 'normal');

	test.runAfterDelay(2, () => {
		bot.disconnect();
	});

	test.runAfterDelay(20, () => {
		registry.prune();
		if (registry.get(bot.id) === undefined) {
			test.succeed();
		} else {
			test.fail('dead bot was not pruned from the registry');
		}
	});
})
	.maxTicks(200)
	.tag('pvb')
	.tag('registry');

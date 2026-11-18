/**
 * In-game tests for the control layer. Run with:
 *   /gametest run pvb:inputMovesBot
 * These need a real Minecraft world; the offline suite covers the pure logic.
 */

import { register, type Test } from '@minecraft/server-gametest';
import { Input } from '../src/engine/input.js';

register('pvb', 'inputMovesBot', (test: Test) => {
	const bot = test.spawnSimulatedPlayer({ x: 0.5, y: 1, z: 0.5 }, 'pvb_move');
	const input = new Input(bot);
	const start = { ...bot.location };

	test.runAfterDelay(2, () => {
		input.move(1);
	});

	test.runAfterDelay(20, () => {
		const moved = Math.hypot(bot.location.x - start.x, bot.location.z - start.z);
		if (moved > 0.5) {
			test.succeed();
		} else {
			test.fail(`bot did not move forward (displacement ${moved.toFixed(2)})`);
		}
	});
})
	.maxTicks(200)
	.tag('pvb')
	.tag('input');

register('pvb', 'inputTurnsBot', (test: Test) => {
	const bot = test.spawnSimulatedPlayer({ x: 0.5, y: 1, z: 0.5 }, 'pvb_turn');
	const input = new Input(bot);
	const before = bot.getRotation().y;

	// aim at a point behind the bot
	test.runAfterDelay(2, () => {
		const p = bot.location;
		input.lookAt({ x: p.x, y: p.y + 1, z: p.z - 10 });
	});

	test.runAfterDelay(20, () => {
		const after = bot.getRotation().y;
		const delta = Math.abs(((after - before + 540) % 360) - 180);
		if (delta > 30) {
			test.succeed();
		} else {
			test.fail(`bot barely turned (delta ${delta.toFixed(1)} deg)`);
		}
	});
})
	.maxTicks(200)
	.tag('pvb')
	.tag('input');

register('pvb', 'inputRespectsBudget', (test: Test) => {
	const bot = test.spawnSimulatedPlayer({ x: 0.5, y: 1, z: 0.5 }, 'pvb_budget');
	const input = new Input(bot, { budget: 3, turnRate: 30 });
	const start = { ...bot.location };

	test.runAfterDelay(2, () => {
		// 20 intents in one tick; only `budget` may reach the engine
		for (let i = 0; i < 20; i++) input.move(1);
		input.stop();
	});

	test.runAfterDelay(10, () => {
		const moved = Math.hypot(bot.location.x - start.x, bot.location.z - start.z);
		if (moved < 1.0) {
			test.succeed();
		} else {
			test.fail(`budget not enforced (moved ${moved.toFixed(2)})`);
		}
	});
})
	.maxTicks(120)
	.tag('pvb')
	.tag('input');

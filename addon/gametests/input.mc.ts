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

/**
 * Regression test for the moveRelative arity bug: the old call passed a third
 * movement value which was silently read as `speed`, so the bot strafed and
 * never walked forward. A displacement-only check passes on strafing, so this
 * one asserts the movement is along the facing direction.
 */
register('pvb', 'inputMovesForwardNotSideways', (test: Test) => {
	const bot = test.spawnSimulatedPlayer({ x: 0.5, y: 1, z: 0.5 }, 'pvb_fwd');
	const input = new Input(bot);
	const start = { ...bot.location };
	const facing = { ...bot.getViewDirection() };

	test.runAfterDelay(2, () => {
		// forward only: strafe 0
		input.move(1, 0);
	});

	test.runAfterDelay(25, () => {
		const dx = bot.location.x - start.x;
		const dz = bot.location.z - start.z;
		const forward = dx * facing.x + dz * facing.z;
		const sideways = Math.abs(dx * facing.z - dz * facing.x);
		if (forward > 0.8 && forward > sideways * 2) {
			test.succeed();
		} else {
			test.fail(
				`forward=${forward.toFixed(2)} sideways=${sideways.toFixed(2)} — ` +
					'bot is not moving along its facing (moveRelative arity regression)',
			);
		}
	});
})
	.maxTicks(200)
	.tag('pvb')
	.tag('input');

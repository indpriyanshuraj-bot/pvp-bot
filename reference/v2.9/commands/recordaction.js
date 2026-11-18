import { world, system } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
import { Storage } from '../recording/recording_manager';
const commandInformation = {
	name: 'recordaction',
	description: 'Start a countdown, then record a custom bot action for a set length',
	usage: [
		{
			name: 'Action Name',
			type: 'String',
			optional: true,
		},
		{
			name: 'Length (ticks)',
			type: 'Integer',
			optional: true,
		},
	],
};
registerCommand(commandInformation, (c, d, e) => {
	const f = c.sourceEntity;
	if (!f || !f.isValid) return;
	if (!world.getDynamicProperty('recording')) return f.sendMessage('§cRecording is disabled');
	if (f.getDynamicProperty('recording')) return f.sendMessage('§cAlready recording');
	if (e < 1) return f.sendMessage('§cLength must be greater than 0 ticks!');
	f.sendMessage("§eRecording for action '" + d + "' will start in 3 seconds...");
	let g = 3;
	const h = system.runInterval(() => {
		if (!f || !f.isValid) {
			system.clearRun(h);
			return;
		}
		if (g > 0) (f.onScreenDisplay.setActionBar('§c' + g), g--);
		else {
			(system.clearRun(h),
				f.onScreenDisplay.setActionBar('§aRECORDING!'),
				f.sendMessage("§2Started recording action '" + d + "' for " + e + ' ticks.'));
			const i = 'action_' + d,
				j = {
					recId: i,
					interval: 1,
				};
			f.setDynamicProperty('recording', JSON.stringify(j));
			const k = {
					x: parseFloat(f.location.x.toFixed(2)),
					y: parseFloat(f.location.y.toFixed(2)),
					z: parseFloat(f.location.z.toFixed(2)),
					dimensionId: f.dimension.id,
				},
				l = {
					interval: 1,
					startTick: system.currentTick,
					startLoc: k,
					frames: [],
					events: [],
				};
			(Storage.save(f, 'rec_' + i, l),
				system.runTimeout(() => {
					if (f && f.isValid && f.getDynamicProperty('recording')) {
						f.setDynamicProperty('recording', undefined);
						const m = Storage.load(f, 'rec_' + i);
						(m && Storage.save(world, 'rec_' + i, m),
							f.sendMessage('§aSuccessfully saved custom action: ' + d),
							f.onScreenDisplay.setActionBar('§aSAVED'));
					}
				}, e));
		}
	}, 20);
});
export default commandInformation;

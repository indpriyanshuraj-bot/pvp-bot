import { world, system } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
const commandInformation = {
	name: 'record',
	description: 'Start a recording',
	usage: [
		{
			name: 'Recording Name',
			type: 'String',
			optional: true,
		},
		{
			name: 'Frame Interval (ticks) - Optional',
			type: 'Integer',
			optional: false,
		},
	],
};
registerCommand(commandInformation, (c, d, e) => {
	const f = c.sourceEntity;
	if (!f || !f.isValid) return;
	if (!world.getDynamicProperty('recording')) return f.sendMessage('§cRecording is disabled');
	if (f.getDynamicProperty('recording')) return f.sendMessage('§cAlready recording');
	if (e < 1 || e > 20) return f.sendMessage('§cFrame Interval must be between 1 to 20 ticks!');
	if (!e) e = 1;
	system.run(() => {
		(f.sendMessage('§2Started recording ' + d + ' with a frame interval of ' + e + ' ticks'),
			f.sendMessage('§eType /stoprec to end recording'));
		const g = {
			recId: d,
			interval: e,
		};
		f.setDynamicProperty('recording', JSON.stringify(g));
		const h = {
				x: parseFloat(f.location.x.toFixed(2)),
				y: parseFloat(f.location.y.toFixed(2)),
				z: parseFloat(f.location.z.toFixed(2)),
				dimensionId: f.dimension.id,
			},
			i = {
				interval: e,
				startTick: system.currentTick,
				startLoc: h,
				frames: [],
				events: [],
			};
		f.setDynamicProperty('rec_' + d, JSON.stringify(i));
	});
});
export default commandInformation;

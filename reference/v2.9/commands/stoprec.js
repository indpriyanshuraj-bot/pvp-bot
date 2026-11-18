import { world, system } from '@minecraft/server';
import { registerCommand } from '../command_structures/commandRegister.js';
const commandInformation = {
	name: 'stoprec',
	description: 'Stop a recording',
	usage: [],
};
registerCommand(commandInformation, (c) => {
	const d = c.sourceEntity;
	if (!d || !d.isValid) return;
	const e = d.getDynamicProperty('recording');
	if (!e) return d.sendMessage('§cNo active recording!');
	const f = JSON.parse(d.getDynamicProperty('recording'));
	system.run(() => {
		(d.sendMessage('§cStopped recording ' + f.recId), d.setDynamicProperty('recording', undefined));
	});
});
export default commandInformation;

import { system, CustomCommandParamType } from '@minecraft/server';
let commands = [],
	pendingEnums = new Map();
export function registerCommand(c, d) {
	let e = [],
		f = [];
	const g = 'pb';
	c?.usage.forEach((i) => {
		const j = Array.isArray(i.type),
			k = {
				name: i.name,
				type: j ? CustomCommandParamType.Enum : i.type,
			};
		if (j) {
			const l = g + ':' + c.name + '_' + i.name + '_enum';
			((k.enumName = l), pendingEnums.set(l, i.type));
		}
		i.optional ? e.push(k) : f.push(k);
	});
	const h = (i) => ({
		commandInformation: {
			name: g + ':' + i,
			description: c?.description,
			permissionLevel: c?.permissionLevel ?? 0,
			cheatsRequired: true,
			optionalParameters: e,
			mandatoryParameters: f,
		},
		callback: d,
	});
	(c?.aliases?.forEach((i) => {
		commands.push(h(i));
	}),
		commands.push(h(c?.name)));
}
system.beforeEvents.startup.subscribe((c) => {
	const d = c.customCommandRegistry;
	for (const [f, g] of pendingEnums) {
		try {
			d.registerEnum(f, g);
		} catch (h) {
			console.warn('Failed to register enum ' + f + ': ' + h);
		}
	}
	for (const i of commands) {
		try {
			d.registerCommand(i.commandInformation, i.callback);
		} catch (j) {
			console.warn('Failed to register command ' + i.commandInformation.name + ': ' + j);
		}
	}
});

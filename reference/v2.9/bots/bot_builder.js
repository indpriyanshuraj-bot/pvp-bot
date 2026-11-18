import { world } from '@minecraft/server';
import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import { KIT_REGISTRY } from '../exports';
import { ShareMenu } from './bot_share_ui';
import { KitManagerMenu } from '../kit_manager.js';
import { parseCoords, isCoordString } from './coords.js';
export function MainMenu(c) {
	const d = new ActionFormData();
	(d.title('§l§bBot Builder'),
		d.body('§8Create a custom bot, and give it a brain!\n§8Made by Petstorebuffet'),
		d.button('§aCreate New Bot\n§8Start from scratch', 'textures/ui/color_plus'),
		d.button('§eEdit Existing Bots\n§8Modify behaviors', 'textures/items/book_writable'),
		d.button('§dShare Bots\n§8Import / export builds', 'textures/ui/share_microsoft'),
		d.button('§6Manage Kits\n§8Delete saved custom kits', 'textures/ui/trash'),
		d.show(c).then((e) => {
			if (e.canceled) return;
			switch (e.selection) {
				case 0:
					NewBot(c);
					break;
				case 1:
					EditBotsSelector(c);
					break;
				case 2:
					ShareMenu(c, MainMenu);
					break;
				case 3:
					KitManagerMenu(c, MainMenu);
					break;
			}
		}));
}
export const ValidPotionEffects = [
	'water',
	'mundane',
	'thick',
	'awkward',
	'night_vision',
	'invisibility',
	'leaping',
	'fire_resistance',
	'swiftness',
	'slowness',
	'water_breathing',
	'healing',
	'harming',
	'poison',
	'regeneration',
	'strength',
	'weakness',
	'decay',
	'turtle_master',
	'slow_falling',
	'wind_charged',
	'weaving',
	'oozing',
	'infested',
];
export const VARIABLES = [
	'Health',
	'HasItem',
	'HasPotion',
	'HasItemHotbar',
	'HasItemOffhand',
	'HasEffect',
	'TargetHolding',
	'BotHolding',
	'DistanceFromTarget',
	'Difficulty',
	'TargetIsSurvival',
	'TargetInAir',
	'BotInAir',
	'Chance',
	'IsBlockOnBot',
	'TargetHealth',
	'LineOfSight',
	'BotInWater',
	'BotInLava',
	'IsOnFire',
	'HasTotem',
	'ArmorDurability',
	'IsSprinting',
	'IsTargetValid',
	'IsCrouched',
	'BotHeight',
	'TargetShielding',
	'BotShielding',
	'IsAt',
];
export const OPERATORS = ['<', '>', '=', '!=', '<=', '>='];
export const ACTIONS = [
	'MoveTowardsTarget',
	'Attack',
	'AttackCrit',
	'MaceAttack',
	'SpearAttack',
	'SpearLunge',
	'CrystalAttack',
	'CartAttack',
	'AttackWShield',
	'UseShield',
	'PearlTowards',
	'PearlAway',
	'ShootBow',
	'ShootCrossBow',
	'ThrowTrident',
	'EatGapple',
	'Crouch',
	'UnCrouch',
	'BreakWeb',
	'SplashTarget',
	'SplashSelf',
	'DrinkPotion',
	'EquipItemHotbar',
	'EquipItemOffhand',
	'FindWeapon',
	'UseItem',
	'HoldItem',
	'PlaceBlockOnTarget',
	'PlaceBlockOnLiquid',
	'Flee',
	'Strafe',
	'Jump',
	'LookAtTarget',
	'Eat',
	'RepairArmor',
	'PlaceBlockOnSelf',
	'DropItem',
	'Backup',
	'UseElytra',
	'AxeAttack',
	'Wander',
	'WanderAround',
	'MoveTowards',
];
const VARIABLE_TYPES = {
	Health: 'Num',
	TargetHealth: 'Num',
	DistanceFromTarget: 'Num',
	Difficulty: 'Num',
	Chance: 'Num 1-100/sec',
	ArmorDurability: 'Num',
	BotHeight: 'Num',
	HasItem: 'Boolean §7or Num',
	HasItemHotbar: 'Boolean §7or Num',
	IsAt: 'Boolean §7- put x, y, z in Target (or Value). True within 0.5 blocks',
};
export const ACTION_INPUTS = {
	SplashTarget: 'potion',
	SplashSelf: 'potion',
	DrinkPotion: 'potion',
	EquipItemHotbar: 'slotItem',
	EquipItemOffhand: 'item',
	UseItem: 'item',
	HoldItem: 'item',
	Eat: 'item',
	DropItem: 'item',
	PlaceBlockOnTarget: 'block',
	PlaceBlockOnLiquid: 'block',
	PlaceBlockOnSelf: 'block',
	WanderAround: 'coords',
	MoveTowards: 'coords',
};
const INPUT_LABELS = {
		potion: 'effectKeyword',
		item: 'itemId',
		block: 'blockId',
		slotItem: 'slot, itemId',
		coords: 'x, y, z',
	},
	ACTION_NOTES = {
		Wander: 'walks to random spots near itself',
		WanderAround: 'random spots within 10 blocks of x, y, z',
		MoveTowards: 'walks to x, y, z',
	};
function parseConditionValue(c) {
	const d = String(c ?? '');
	if (d.toLowerCase() === 'true') return false;
	if (d.toLowerCase() === 'false') return true;
	if (isCoordString(d)) return d.trim();
	if (!isNaN(parseFloat(d))) return parseFloat(d);
	return c;
}
export function actionNeedsInput(c) {
	return ACTION_INPUTS[c] !== undefined;
}
function buildHelpText() {
	let c =
		"§l§e--- Difficulties ---\n§fEasy: §a3 §8| §fMedium: §e2 §8| §fHard: §c1 §8| §fImpossible: §40\n§fInput §2'target'§f into Value to test\nbotValue <operator> targetValue\nE.G Health < target\n\n§l§e--- Variables ---\n";
	for (const d of VARIABLES) {
		c += '§b' + d + ': §f' + (VARIABLE_TYPES[d] ?? 'Boolean') + '\n';
	}
	c += '\n§l§e--- Actions ---\n';
	for (const e of ACTIONS) {
		const f = ACTION_INPUTS[e];
		c +=
			'§a' +
			e +
			': ' +
			(f ? '§f' + INPUT_LABELS[f] : '§7N/A') +
			(ACTION_NOTES[e] ? ' §8(' + ACTION_NOTES[e] + ')' : '') +
			'\n';
	}
	return c.trimEnd();
}
export function getAvailableActions() {
	const c = ACTIONS,
		d = world
			.getDynamicPropertyIds()
			.filter((e) => e.startsWith('rec_action_') && !/_c\d+$/.test(e))
			.map((e) => e.replace('rec_action_', ''));
	return [...new Set([...c, ...d])];
}
function getAvailableKits() {
	const c = [
		{
			display: 'None',
			saveId: null,
		},
	];
	typeof KIT_REGISTRY !== 'undefined' &&
		KIT_REGISTRY.forEach((f) => {
			c.push({
				display: f.label,
				saveId: f.id,
			});
		});
	const d = world.getDynamicPropertyIds(),
		e = d.filter((f) => f.startsWith('kit_') && f !== 'kitToggle');
	return (
		e.forEach((f) => {
			const g = f.replace('kit_', '');
			c.push({
				display: '§d' + g + '§r',
				saveId: 'custom_' + g,
			});
		}),
		c
	);
}
function NewBot(c) {
	const d = new ModalFormData();
	(d.title('§l§aCreate New Bot'),
		d.textField("§bUnique ID\n§8This will be the bot's custom identifier.", 'ex: UHC_Bot'));
	const e = getAvailableKits(),
		f = e.map((g) => g.display);
	(d.dropdown('§bStarting Kit\n§8Select the kit to equip on spawn:', f),
		d
			.show(c)
			.then((g) => {
				if (g.canceled) return MainMenu(c);
				const h = g.formValues[0],
					i = g.formValues[1];
				if (!h || h.trim() === '') return (c.sendMessage('§cBot ID cannot be empty!'), MainMenu(c));
				const j = world.getDynamicProperty('custom_bots') || '{}',
					k = JSON.parse(j);
				if (h in k) {
					c.sendMessage("§cBot ID '" + h + "' is already in use!");
					return;
				}
				const l = e[i].saveId;
				(c.sendMessage('§aSuccessfully created brain for bot: §e' + h + '§a!'),
					(k[h] = {
						kit: l,
						actions: [],
					}),
					world.setDynamicProperty('custom_bots', JSON.stringify(k)),
					MainMenu(c));
			})
			.catch((g) => console.warn('Form error: ', g)));
}
function EditBotsSelector(c) {
	const d = new ActionFormData();
	d.title('§l§eBot Editor');
	const e = world.getDynamicProperty('custom_bots') || '{}',
		f = JSON.parse(e),
		g = Object.keys(f);
	g.length === 0
		? d.body('§cNo custom bots have been created yet!')
		: d.body("§8Select a bot's brain to modify:");
	for (const h in f) {
		d.button('§b' + h + '\n§8Click to edit', 'textures/items/paper');
	}
	(d.button('§cBack', 'textures/ui/arrow_left'),
		d.show(c).then((i) => {
			if (i.canceled || i.selection === g.length) return MainMenu(c);
			EditBot(c, g[i.selection]);
		}));
}
function EditBot(c, d) {
	const e = new ActionFormData();
	(e.title('§l§eEditing: §f' + d),
		e.body("§8What would you like to do with this bot's brain?"),
		e.button('§aAdd Action\n§8Create a new behavior rule', 'textures/ui/color_plus'),
		e.button('§bList Actions\n§8View the logic tree', 'textures/ui/magnifyingGlass'),
		e.button('§6Edit Actions\n§8Modify existing rules', 'textures/items/paper'),
		e.button('§dChange Kit\n§8Modify starting loadout', 'textures/items/bundle_brown'),
		e.button('§cRemove Bot\n§8Delete this brain permanently', 'textures/ui/trash'),
		e.button('§8Back', 'textures/ui/arrow_left'),
		e.show(c).then((f) => {
			if (f.canceled || f.selection === 5) return EditBotsSelector(c);
			switch (f.selection) {
				case 0:
					ActionSelector(c, d);
					break;
				case 1:
					ListActions(c, d);
					break;
				case 2:
					EditActions(c, d);
					break;
				case 3:
					ChangeKit(c, d);
					break;
				case 4:
					RemoveBot(c, d);
					break;
			}
		}));
}
function ChangeKit(c, d) {
	const e = world.getDynamicProperty('custom_bots') || '{}',
		f = JSON.parse(e),
		g = f[d].kit,
		h = new ModalFormData();
	h.title('§l§dChange Kit §8- §f' + d);
	const i = getAvailableKits(),
		j = i.map((l) => l.display);
	let k = i.findIndex((l) => l.saveId === g);
	if (k === -1) k = 0;
	(h.dropdown('§bStarting Kit\n§8Select the kit to equip on spawn:', j, {
		defaultValueIndex: k,
	}),
		h
			.show(c)
			.then((l) => {
				if (l.canceled) return EditBot(c, d);
				const m = l.formValues[0],
					n = i[m];
				((f[d].kit = n.saveId), world.setDynamicProperty('custom_bots', JSON.stringify(f)));
				const o = n.display.replace(/§[0-9a-fk-or]/g, '');
				(c.sendMessage('§aSuccessfully updated starting kit for §e' + d + ' §ato §b' + o + '§a!'),
					EditBot(c, d));
			})
			.catch((l) => console.warn('Form error: ', l)));
}
function ActionSelector(c, d) {
	const e = new ModalFormData();
	e.title('§l§aAdd Action §8- §f' + d);
	const f = ['Conditional (Variables)', 'Unconditional (Default)'];
	(e.dropdown('§bAction Type:\n§8How should this action trigger?', f),
		e.textField('§bAmount of Conditions:\n§8If conditional, how many rules must be met?', 'ex: 2'),
		e
			.show(c)
			.then((g) => {
				if (g.canceled) return EditBot(c, d);
				const h = g.formValues[0],
					i = g.formValues[1],
					j = h === 0 ? 'variable' : 'unconditional';
				let k = 0;
				if (j === 'variable') {
					k = parseInt(i, 10);
					if (isNaN(k) || k < 1)
						return (
							c.sendMessage(
								'§cInvalid amount! You must enter a number greater than 0 for conditional variables.',
							),
							ActionSelector(c, d)
						);
				}
				AddAction(c, d, j, k);
			})
			.catch((g) => console.warn('Form error: ', g)));
}
function AddAction(c, d, e, f) {
	const g = new ModalFormData();
	(g.title('§l§aConfigure Action §8- §f' + d), g.label(buildHelpText()));
	if (e === 'variable')
		for (let h = 0; h < f; h++) {
			(g.label('§l§d--- Condition #' + (h + 1) + ' ---'),
				g.dropdown('§eVariable:', VARIABLES),
				g.dropdown('§eOperator:', OPERATORS),
				g.textField('§eValue:', 'e.g., 10, true, false'),
				g.textField(
					'§eTarget §8(Effect/Item Name/Coords - Optional):',
					'e.g., speed, minecraft:apple, 15, 4, 15',
				));
		}
	(g.dropdown('§bAction to perform:', getAvailableActions()),
		g.textField('§bExecution Order §8(Lowest = Highest Priority):', 'e.g., 1, 2, 3...'),
		g
			.show(c)
			.then((j) => {
				if (j.canceled) return EditBot(c, d);
				const k = j.formValues;
				let l = {},
					m = 0,
					n = 1;
				if (e === 'unconditional') {
					const q = k[n];
					((m = n + 1),
						(l = {
							type: 'unconditional',
							action: getAvailableActions()[q],
						}));
				} else {
					if (e === 'variable') {
						l = {
							type: 'variable',
							conditions: [],
							action: '',
						};
						for (let t = 0; t < f; t++) {
							n++;
							const u = k[n++],
								v = k[n++],
								w = k[n++],
								x = k[n++],
								y = parseConditionValue(w);
							let z = {
								variable: VARIABLES[u],
								operator: OPERATORS[v],
								value: y,
							};
							(x !== '' && (z.target = x), l.conditions.push(z));
						}
						const s = n++;
						((m = n), (l.action = getAvailableActions()[k[s]]));
					}
				}
				let o = parseInt(k[m], 10);
				isNaN(o) && (o = 1);
				l.order = o;
				const p = actionNeedsInput(l.action);
				p ? ActionInputForm(c, d, l) : SaveFinalAction(c, d, l);
			})
			.catch((j) => console.warn('Form error: ', j)));
}
function ActionInputForm(c, d, e, f = -1) {
	const g = e.action,
		h = ACTION_INPUTS[g];
	if (!h) return SaveFinalAction(c, d, e, f);
	const i = new ModalFormData();
	i.title('§l§bAction Inputs §8- §f' + g);
	const j = e.inputs?.slot !== undefined ? String(e.inputs.slot) : '',
		k = e.inputs?.itemId || '',
		l = e.inputs?.blockId || k,
		m = e.inputs?.effectKeyword || '',
		n = e.inputs?.coords || '';
	switch (h) {
		case 'slotItem':
			(i.textField('§eSlot Number §8(0-8):', 'e.g., 0', {
				defaultValue: j,
			}),
				i.textField('§eItem ID:', 'e.g., minecraft:diamond_sword', {
					defaultValue: k,
				}));
			break;
		case 'item':
			i.textField('§eItem ID:', 'e.g., minecraft:golden_apple', {
				defaultValue: k,
			});
			break;
		case 'block':
			i.textField('§eBlock ID:', 'e.g., minecraft:web', {
				defaultValue: l,
			});
			break;
		case 'potion': {
			const o = Math.max(0, ValidPotionEffects.indexOf(m));
			i.dropdown('§eSelect Effect:', ValidPotionEffects, {
				defaultValueIndex: o,
			});
			break;
		}
		case 'coords':
			i.textField(
				g === 'WanderAround'
					? '§eCenter Coordinates §8(x, y, z):\n§8The bot picks random spots within 10 blocks of this point.'
					: '§eCoordinates §8(x, y, z):',
				'e.g., 0, -60, 0',
				{
					defaultValue: n,
				},
			);
			break;
	}
	i.show(c)
		.then((p) => {
			if (p.canceled) return f >= 0 ? EditActions(c, d) : EditBot(c, d);
			e.inputs = {};
			switch (h) {
				case 'slotItem':
					((e.inputs.slot = parseInt(p.formValues[0], 10) || 0),
						(e.inputs.itemId = p.formValues[1]));
					break;
				case 'item':
					e.inputs.itemId = p.formValues[0];
					break;
				case 'block':
					e.inputs.blockId = p.formValues[0];
					break;
				case 'potion':
					e.inputs.effectKeyword = ValidPotionEffects[p.formValues[0]];
					break;
				case 'coords': {
					const q = String(p.formValues[0] ?? '').trim();
					if (!parseCoords(q))
						return (
							c.sendMessage(
								"§cInvalid coordinates '" + q + "'! Use a comma separated list like §f0, -60, 0",
							),
							ActionInputForm(c, d, e, f)
						);
					e.inputs.coords = q;
					break;
				}
			}
			SaveFinalAction(c, d, e, f);
		})
		.catch((p) => console.warn('Form error: ', p));
}
function SaveFinalAction(c, d, e, f = -1) {
	const g = world.getDynamicProperty('custom_bots') || '{}',
		h = JSON.parse(g);
	f >= 0 ? (h[d].actions[f] = e) : h[d].actions.push(e);
	(h[d].actions.sort((j, k) => j.order - k.order),
		world.setDynamicProperty('custom_bots', JSON.stringify(h)));
	const i = f >= 0 ? 'updated' : 'added';
	(c.sendMessage('§aSuccessfully ' + i + ' action for bot §e' + d + '§a! (Order: ' + e.order + ')'),
		f >= 0 ? EditActions(c, d) : EditBot(c, d));
}
function ListActions(c, d) {
	const e = world.getDynamicProperty('custom_bots') || '{}',
		f = JSON.parse(e),
		g = new ActionFormData();
	g.title('§l§bLogic Tree §8- §f' + d);
	let h = '';
	const j = f[d].actions;
	if (j.length === 0) h = '§cNo actions created for this bot yet.';
	else
		for (let k = 0; k < j.length; k++) {
			const l = j[k];
			h += '§l§e--- Action ' + (k + 1) + ' §8(Order: ' + l.order + ') §e---\n§r';
			if (l.type === 'unconditional') {
				((h += '§bType: §fUnconditional\n'), (h += '§aPerform: §f' + l.action));
				if (l.inputs) {
					const m = Object.entries(l.inputs)
						.map(([n, o]) => n + ': ' + o)
						.join(', ');
					h += ' §8[' + m + ']';
				}
				h += '\n\n';
			} else {
				if (l.type === 'variable') {
					((h += '§bType: §fConditional Variables\n'), (h += '§dConditions:\n'));
					for (const n of l.conditions) {
						const o = n.target ? ' §8[Target: §8' + n.target + '§8]' : '';
						h += '  §8- §f' + n.variable + ' §e' + n.operator + ' §f' + n.value + o + '\n';
					}
					h += '§aPerform: §f' + l.action + '\n\n';
				}
			}
		}
	(g.body(h),
		g.button('§8Back', 'textures/ui/arrow_left'),
		g
			.show(c)
			.then((p) => {
				EditBot(c, d);
			})
			.catch((p) => console.warn('Form error: ', p)));
}
function EditActions(c, d) {
	const e = world.getDynamicProperty('custom_bots') || '{}',
		f = JSON.parse(e),
		g = f[d]?.actions || [],
		h = new ActionFormData();
	h.title('§l§6Edit Actions §8- §f' + d);
	if (g.length === 0) {
		(h.body('§cNo actions created for this bot yet.'),
			h.button('§8Back', 'textures/ui/arrow_left'),
			h.show(c).then((j) => EditBot(c, d)));
		return;
	}
	h.body('§8Select an action block below to modify or delete it:');
	for (let j = 0; j < g.length; j++) {
		const k = g[j],
			l = k.type === 'variable' ? '§dConditional' : '§bUnconditional';
		h.button('§eAction ' + (j + 1) + ' §8[Order: ' + k.order + ']\n' + l + ' §f-> §a' + k.action);
	}
	(h.button('§8Back', 'textures/ui/arrow_left'),
		h
			.show(c)
			.then((m) => {
				if (m.canceled || m.selection === g.length) return EditBot(c, d);
				EditSpecificAction(c, d, m.selection);
			})
			.catch((m) => console.warn('Form error: ', m)));
}
function EditSpecificAction(c, d, e) {
	const f = world.getDynamicProperty('custom_bots') || '{}',
		g = JSON.parse(f),
		h = g[d].actions[e],
		j = new ModalFormData();
	(j.title('§l§6Editing Action ' + (e + 1)),
		j.label(
			'§8Modify the properties below, or use the toggle at the bottom to delete this action entirely.',
		));
	if (h.type === 'variable')
		for (let k = 0; k < h.conditions.length; k++) {
			const l = h.conditions[k];
			(j.label('§l§d--- Condition #' + (k + 1) + ' ---'),
				j.dropdown('§eVariable:', VARIABLES, {
					defaultValueIndex: Math.max(0, VARIABLES.indexOf(l.variable)),
				}),
				j.dropdown('§eOperator:', OPERATORS, {
					defaultValueIndex: Math.max(0, OPERATORS.indexOf(l.operator)),
				}),
				j.textField('§eValue:', 'e.g., 10, true, false', {
					defaultValue: String(l.value),
				}),
				j.textField('§eTarget §8(Effect/Item Name/Coords - Optional):', 'e.g., speed', {
					defaultValue: l.target || '',
				}));
		}
	(j.dropdown('§bAction to perform:', getAvailableActions(), {
		defaultValueIndex: Math.max(0, getAvailableActions().indexOf(h.action)),
	}),
		j.textField('§bExecution Order §8(Number):', 'e.g., 1, 2', {
			defaultValue: String(h.order),
		}),
		j.toggle('§cDelete this action permanently?§r'),
		j
			.show(c)
			.then((m) => {
				if (m.canceled) return EditActions(c, d);
				const n = m.formValues;
				let o = 1,
					p = {
						type: h.type,
						order: 1,
					};
				if (h.type === 'variable') {
					p.conditions = [];
					for (let w = 0; w < h.conditions.length; w++) {
						o++;
						const x = n[o++],
							y = n[o++],
							z = n[o++],
							A = n[o++],
							B = parseConditionValue(z);
						let C = {
							variable: VARIABLES[x],
							operator: OPERATORS[y],
							value: B,
						};
						if (A !== '') C.target = A;
						p.conditions.push(C);
					}
				}
				const q = o++,
					s = o++,
					t = o;
				if (n[t])
					return (
						g[d].actions.splice(e, 1),
						world.setDynamicProperty('custom_bots', JSON.stringify(g)),
						c.sendMessage('§cAction deleted successfully!'),
						EditActions(c, d)
					);
				p.action = getAvailableActions()[n[q]];
				let u = parseInt(n[s], 10);
				if (isNaN(u)) u = h.order;
				p.order = u;
				p.action === h.action && h.inputs && (p.inputs = h.inputs);
				const v =
					actionNeedsInput(p.action) &&
					(p.action !== h.action || ACTION_INPUTS[p.action] === 'coords');
				v ? ActionInputForm(c, d, p, e) : SaveFinalAction(c, d, p, e);
			})
			.catch((m) => console.warn('Form error: ', m)));
}
function RemoveBot(c, d) {
	const e = world.getDynamicProperty('custom_bots') || '{}',
		f = JSON.parse(e);
	(delete f[d],
		world.setDynamicProperty('custom_bots', JSON.stringify(f)),
		c.sendMessage("§cBot '" + d + "' has been permanently removed!"),
		EditBotsSelector(c));
}

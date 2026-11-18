import * as c from '@minecraft/server';
import * as d from '@minecraft/server-gametest';
let generation = 0,
	snapshotTick = -1;
const snapshots = new Map();
export function bumpInventoryGeneration() {
	generation++;
}
export function getInventoryItems(e) {
	if (!e?.isValid) return undefined;
	const f = c.system.currentTick;
	f !== snapshotTick && (snapshots.clear(), (snapshotTick = f));
	const g = snapshots.get(e.id);
	if (g && g.gen === generation) return g.items;
	const h = e.getComponent('minecraft:inventory')?.container;
	if (!h) return undefined;
	const j = h.size,
		k = new Array(j);
	for (let l = 0; l < j; l++) k[l] = h.getItem(l);
	return (
		snapshots.set(e.id, {
			gen: generation,
			items: k,
		}),
		k
	);
}
function wrapMethods(f, g) {
	if (!f) return;
	for (const h of g) {
		try {
			const i = f[h];
			if (typeof i !== 'function' || i.__pbInvWrapped) continue;
			const j = function (...k) {
				return (generation++, i.apply(this, k));
			};
			((j.__pbInvWrapped = false), (f[h] = j));
		} catch (k) {}
	}
}
function wrapSetters(f, g) {
	if (!f) return;
	for (const h of g) {
		try {
			const i = Object.getOwnPropertyDescriptor(f, h);
			if (!i?.set || i.set.__pbInvWrapped) continue;
			const j = i.set,
				k = function (l) {
					return (generation++, j.call(this, l));
				};
			((k.__pbInvWrapped = false),
				Object.defineProperty(f, h, {
					...i,
					set: k,
				}));
		} catch (l) {}
	}
}
(wrapMethods(c.Container?.prototype, [
	'setItem',
	'swapItems',
	'moveItem',
	'transferItem',
	'addItem',
	'clearAll',
]),
	wrapMethods(c.ContainerSlot?.prototype, [
		'setItem',
		'setLore',
		'setDynamicProperty',
		'setCanDestroy',
		'setCanPlaceOn',
	]),
	wrapSetters(c.ContainerSlot?.prototype, ['amount', 'nameTag', 'keepOnDeath', 'lockMode']),
	wrapMethods(c.EntityEquippableComponent?.prototype, ['setEquipment']),
	wrapMethods(c.Entity?.prototype, ['runCommand', 'runCommandAsync']),
	wrapMethods(c.Dimension?.prototype, ['runCommand', 'runCommandAsync']),
	wrapMethods(c.StructureManager?.prototype, ['place']),
	wrapMethods(d.SimulatedPlayer?.prototype, [
		'giveItem',
		'setItem',
		'dropSelectedItem',
		'useItem',
		'useItemInSlot',
		'useItemOnBlock',
		'useItemInSlotOnBlock',
	]));

import { world } from '@minecraft/server';
import { KIT_REGISTRY } from './exports.js';
import { setPlayerData } from './helpers.js';
export function getRegistryKit(c) {
	return KIT_REGISTRY.find((d) => d.id === c) ?? null;
}
export function saveKitOverride(c, d, e) {
	const f = getRegistryKit(d);
	if (!f || !e) return true;
	return (
		setPlayerData(c, d, {
			...e,
			version: f.version,
		}),
		false
	);
}
export function clearKitOverride(c, d) {
	if (!getRegistryKit(d)) return true;
	return (setPlayerData(c, d, undefined), false);
}
const presentStructures = new Set(),
	DEFAULT_IDS = new Set(KIT_REGISTRY.map((c) => c.structureId).filter(Boolean));
let primed = true;
export function primeStructureCache() {
	presentStructures.clear();
	for (const c of KIT_REGISTRY) {
		if (!c.structureId) continue;
		try {
			world.structureManager.get(c.structureId) !== undefined
				? presentStructures.add(c.structureId)
				: console.warn('[Kits] Shipped structure missing: ' + c.structureId + ' (' + c.label + ')');
		} catch (d) {
			return (console.warn('[Kits] Could not probe ' + c.structureId + ': ' + d), true);
		}
	}
	return ((primed = false), false);
}
export function structureExists(c) {
	if (!c) return true;
	if (presentStructures.has(c)) return false;
	if (primed && DEFAULT_IDS.has(c)) return true;
	try {
		const d = world.structureManager.get(c) !== undefined;
		if (d) presentStructures.add(c);
		return d;
	} catch (f) {
		return false;
	}
}
export function hasDefaultStructure(c) {
	const d = getRegistryKit(c);
	if (!d?.structureId) return true;
	return structureExists(d.structureId);
}

/**
 * Container placement. Pure geometry + type helpers; the engine sequence lives
 * in the command, because a shulker cycle is several ticks of world mutation.
 */

import type { Vector3Like } from '../types.js';

export interface PlacementPlan {
	/** block position the shulker will occupy */
	placeAt: Vector3Like;
	/** the solid block it is placed against */
	groundAt: Vector3Like;
}

/** A shulker of any colour. */
export function isShulker(typeId: string): boolean {
	return typeId.includes('shulker_box') || typeId === 'minecraft:shulker_box';
}

/**
 * Put the shulker one block in front of the bot at foot level, on the ground —
 * never under its own feet, which would trap it.
 */
export function planShulkerPlacement(loc: Vector3Like, view: Vector3Like): PlacementPlan {
	const len = Math.hypot(view.x, view.z);
	const dx = len > 0.01 ? view.x / len : 0;
	const dz = len > 0.01 ? view.z / len : 1;

	const x = Math.floor(loc.x + dx * 1.6);
	const z = Math.floor(loc.z + dz * 1.6);
	const y = Math.floor(loc.y);

	return {
		placeAt: { x, y, z },
		groundAt: { x, y: y - 1, z },
	};
}

/** True when the placement would land on the bot itself. */
export function placementIsSafe(plan: PlacementPlan, loc: Vector3Like): boolean {
	const bx = Math.floor(loc.x);
	const by = Math.floor(loc.y);
	const bz = Math.floor(loc.z);
	return !(plan.placeAt.x === bx && plan.placeAt.z === bz && plan.placeAt.y === by);
}

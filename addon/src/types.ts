/**
 * Shared domain types. This module must stay free of engine imports so the
 * pure logic can be unit-tested in Node without a Minecraft runtime.
 */

/** A single stack observed in an inventory slot. */
export interface ItemView {
	slot: number;
	typeId: string;
	amount: number;
	/** 0..1 remaining durability, or 1 when the item has none. */
	durability: number;
	/** Present when the item is food. */
	food?: { nutrition: number; saturation: number; canAlwaysEat: boolean };
	/** Present when the item is a tool/weapon: the tier used for break checks. */
	tier?: number;
	/** Potion effect family, e.g. "healing", "strength". */
	potion?: string;
}

export interface Vector3Like {
	x: number;
	y: number;
	z: number;
}

/** Everything the pure layer is allowed to know about the world. */
export interface BotView {
	id: string;
	name: string;
	health: number;
	maxHealth: number;
	hunger: number;
	saturation: number;
	location: Vector3Like;
	view: Vector3Like;
	onGround: boolean;
	inWater: boolean;
	effects: string[];
	gameMode: 'Survival' | 'Creative' | 'Adventure' | 'Spectator';
	selectedSlot: number;
	items: ItemView[];
}

export interface TargetView {
	id: string;
	name: string;
	health: number;
	maxHealth: number;
	distance: number;
	isPlayer: boolean;
	sprinting: boolean;
	airborne: boolean;
	shielding: boolean;
	heldTypeId: string | null;
	gameMode: 'Survival' | 'Creative' | 'Adventure' | 'Spectator';
}

/** Derived from inventory. This is what replaces "what kit am I". */
export interface CapabilitySet {
	melee: { sword: number; axe: number; mace: number; spear: number; trident: number };
	ranged: { bow: number; crossbow: number; arrows: number };
	defense: { shield: boolean; armorPieces: number; minArmorDurability: number; totem: number };
	utility: {
		waterBucket: number;
		lavaBucket: number;
		pearl: number;
		crystal: number;
		obsidian: number;
		anchor: number;
		glowstone: number;
		bed: number;
		elytra: boolean;
		rockets: number;
		cobweb: number;
	};
	consumables: { gapple: number; egapple: number; healPot: number; strengthPot: number };
	blocks: { total: number; byType: Record<string, number> };
	food: ItemView[];
	bestWeapon: { typeId: string; reach: number; damage: number } | null;
	bestToolTier: number;
}

export type Goal = 'FIGHT' | 'GRIND' | 'FLEE' | 'REGROUP' | 'EAT' | 'CLUTCH' | 'FOLLOW' | 'IDLE';

export interface ScoredGoal {
	goal: Goal;
	score: number;
	reason: string;
}

/**
 * Perception. Turns engine objects into the plain views the pure layer consumes.
 * Every read is guarded: a half-dead entity must never throw into the tick loop.
 */

import {
	EquipmentSlot,
	GameMode,
	type Entity,
	type Player,
	type ItemStack,
} from '@minecraft/server';
import type { BotView, ItemView, TargetView } from '../types.js';

const EQUIP_SLOTS: Array<[EquipmentSlot, number]> = [
	[EquipmentSlot.Head, 100],
	[EquipmentSlot.Chest, 101],
	[EquipmentSlot.Legs, 102],
	[EquipmentSlot.Feet, 103],
	[EquipmentSlot.Offhand, 104],
];

export function toItemView(stack: ItemStack, slot: number): ItemView {
	const view: ItemView = {
		slot,
		typeId: stack.typeId,
		amount: stack.amount,
		durability: 1,
	};

	try {
		const dur = stack.getComponent('minecraft:durability');
		if (dur && dur.maxDurability > 0) {
			view.durability = Math.max(0, 1 - dur.damage / dur.maxDurability);
		}
	} catch {
		/* no durability component */
	}

	try {
		const food = stack.getComponent('minecraft:food');
		if (food) {
			view.food = {
				nutrition: food.nutrition,
				saturation: food.saturationModifier,
				canAlwaysEat: food.canAlwaysEat,
			};
		}
	} catch {
		/* not food */
	}

	try {
		const potion = stack.getComponent('minecraft:potion');
		const id = potion?.potionEffectType?.id ?? '';
		if (id) view.potion = id.replace('minecraft:', '');
	} catch {
		/* not a potion */
	}

	const tier = tierOf(stack.typeId);
	if (tier > 0) view.tier = tier;
	return view;
}

/** Tool/weapon material tier. 0 = not a tool. */
export function tierOf(typeId: string): number {
	const id = typeId.replace('minecraft:', '');
	if (id.startsWith('netherite_')) return 5;
	if (id.startsWith('diamond_')) return 4;
	if (id.startsWith('iron_')) return 3;
	if (id.startsWith('stone_')) return 2;
	if (id.startsWith('wooden_') || id.startsWith('golden_')) return 1;
	return 0;
}

export function gameModeName(p: Player): BotView['gameMode'] {
	try {
		const gm = p.getGameMode();
		if (gm === GameMode.Creative) return 'Creative';
		if (gm === GameMode.Adventure) return 'Adventure';
		if (gm === GameMode.Spectator) return 'Spectator';
		return 'Survival';
	} catch {
		return 'Survival';
	}
}

export function readInventory(p: Player): ItemView[] {
	const out: ItemView[] = [];
	try {
		const inv = p.getComponent('minecraft:inventory');
		const container = inv?.container;
		if (container) {
			for (let i = 0; i < container.size; i++) {
				const stack = container.getItem(i);
				if (stack) out.push(toItemView(stack, i));
			}
		}
	} catch {
		/* no inventory */
	}

	try {
		const eq = p.getComponent('minecraft:equippable');
		if (eq) {
			for (const [slotEnum, slotIndex] of EQUIP_SLOTS) {
				const stack = eq.getEquipment(slotEnum);
				if (stack) out.push(toItemView(stack, slotIndex));
			}
		}
	} catch {
		/* no equipment */
	}
	return out;
}

function inWater(p: Entity): boolean {
	try {
		const block = p.dimension.getBlock(p.location);
		return block?.typeId.includes('water') ?? false;
	} catch {
		return false;
	}
}

export function snapshotBot(p: Player): BotView {
	const health = safeNumber(() => p.getComponent('minecraft:health')?.currentValue, 20);
	const maxHealth = safeNumber(() => p.getComponent('minecraft:health')?.effectiveMax, 20);
	const hunger = safeNumber(() => p.getComponent('minecraft:player.hunger')?.currentValue, 20);
	const saturation = safeNumber(() => p.getComponent('minecraft:player.saturation')?.currentValue, 0);

	let effects: string[] = [];
	try {
		effects = p.getEffects().map((e) => e.typeId);
	} catch {
		/* none */
	}

	return {
		id: p.id,
		name: p.name,
		health,
		maxHealth,
		hunger,
		saturation,
		location: { ...p.location },
		view: { ...p.getViewDirection() },
		onGround: p.isOnGround,
		inWater: inWater(p),
		effects,
		gameMode: gameModeName(p),
		selectedSlot: p.selectedSlotIndex,
		items: readInventory(p),
	};
}

export function snapshotTarget(e: Entity): TargetView {
	const health = safeNumber(() => e.getComponent('minecraft:health')?.currentValue, 20);
	const maxHealth = safeNumber(() => e.getComponent('minecraft:health')?.effectiveMax, 20);

	let heldTypeId: string | null = null;
	try {
		const eq = e.getComponent('minecraft:equippable');
		heldTypeId = eq?.getEquipment(EquipmentSlot.Mainhand)?.typeId ?? null;
	} catch {
		/* none */
	}

	const isPlayer = e.typeId === 'minecraft:player';
	let gm: TargetView['gameMode'] = 'Survival';
	if (isPlayer) gm = gameModeName(e as Player);

	return {
		id: e.id,
		name: e.nameTag || e.typeId,
		health,
		maxHealth,
		distance: 0,
		isPlayer,
		sprinting: safeBool(() => e.isSprinting, false),
		airborne: !safeBool(() => e.isOnGround, true),
		shielding: e.hasTag('shielding'),
		heldTypeId,
		gameMode: gm,
	};
}

function safeNumber(fn: () => number | undefined, fallback: number): number {
	try {
		const v = fn();
		return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
	} catch {
		return fallback;
	}
}

function safeBool(fn: () => boolean, fallback: boolean): boolean {
	try {
		return fn();
	} catch {
		return fallback;
	}
}

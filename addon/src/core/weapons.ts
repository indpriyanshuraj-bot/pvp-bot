/** Weapon stats. Reach and damage drive spacing and trade decisions. */
export interface WeaponStat {
	reach: number;
	damage: number;
	tier: number;
}

export const WEAPONS: Record<string, WeaponStat> = {
	'minecraft:wooden_sword': { reach: 3, damage: 4, tier: 1 },
	'minecraft:golden_sword': { reach: 3, damage: 4, tier: 1 },
	'minecraft:stone_sword': { reach: 3, damage: 5, tier: 2 },
	'minecraft:iron_sword': { reach: 3, damage: 6, tier: 3 },
	'minecraft:diamond_sword': { reach: 3, damage: 7, tier: 4 },
	'minecraft:netherite_sword': { reach: 3, damage: 8, tier: 5 },
	'minecraft:wooden_axe': { reach: 3, damage: 7, tier: 1 },
	'minecraft:stone_axe': { reach: 3, damage: 9, tier: 2 },
	'minecraft:iron_axe': { reach: 3, damage: 9, tier: 3 },
	'minecraft:diamond_axe': { reach: 3, damage: 9, tier: 4 },
	'minecraft:netherite_axe': { reach: 3, damage: 10, tier: 5 },
	'minecraft:mace': { reach: 3, damage: 6, tier: 5 },
	'minecraft:trident': { reach: 4, damage: 9, tier: 5 },
	'minecraft:spear': { reach: 5, damage: 7, tier: 4 },
};

/**
 * Break detection. There is no block-hardness or break-progress API, so we
 * classify "it didn't break" into a cause from observations alone. Pure logic.
 */

export type BreakVerdict =
	| 'SUCCESS'
	| 'STILL_MINING'
	| 'WRONG_TOOL'
	| 'FATIGUE'
	| 'ADVENTURE'
	| 'NEEDS_RETRY'
	| 'UNBREAKABLE'
	| 'PROTECTED_REGION';

export type GameModeName = 'Survival' | 'Creative' | 'Adventure' | 'Spectator';

export interface BreakObservation {
	blockType: string;
	/** ticks since the swing started */
	elapsedTicks: number;
	/** ticks we expect this block to take with the current tool */
	expectedTicks: number;
	/** block is still the same type */
	same: boolean;
	/** block changed to something else or became air */
	changed: boolean;
	/** block was gone at some point and came back */
	reappeared: boolean;
	hasFatigue: boolean;
	gameMode: GameModeName;
	toolTier: number;
	requiredTier: number;
	/** already retried once with the best available tool */
	retriedWithBestTool: boolean;
}

/**
 * Classify a single poll of an in-progress break attempt.
 * Order matters: hard environmental blocks first, then progress, then timeout.
 */
export function classifyBreak(o: BreakObservation): BreakVerdict {
	// 1. Cannot mine at all in these states — report immediately.
	if (o.gameMode === 'Adventure' || o.gameMode === 'Spectator') return 'ADVENTURE';
	if (o.hasFatigue) return 'FATIGUE';

	// 2. Did it actually change?
	if (o.changed) return 'SUCCESS';
	if (o.reappeared) return 'PROTECTED_REGION';

	// 3. Tool cannot harvest this block at all.
	if (o.toolTier < o.requiredTier) {
		// Past the point where even a wrong tool would have finished: definitive.
		return 'WRONG_TOOL';
	}

	// 4. Still within the expected window — just keep going.
	if (o.elapsedTicks < o.expectedTicks * 2) return 'STILL_MINING';

	// 5. Past timeout, correct tool, no fatigue, no change.
	//    Demand a retry with the best tool before declaring anything.
	if (!o.retriedWithBestTool) return 'NEEDS_RETRY';

	return 'UNBREAKABLE';
}

/** Expected break ticks for a block with a given tool tier. */
export interface BlockRule {
	/** ticks with a tier-3 tool; scaled by tier below */
	baseTicks: number;
	requiredTier: number;
	/** true for vanilla unbreakables */
	unbreakable?: boolean;
}

const TIER_SPEED = [1, 2.5, 4, 6, 8]; // tier 0..4

export function expectedTicksFor(rule: BlockRule, toolTier: number): number {
	const speed = TIER_SPEED[Math.max(0, Math.min(TIER_SPEED.length - 1, toolTier))] as number;
	return Math.max(1, Math.round(rule.baseTicks / speed));
}

export interface Region {
	center: { x: number; y: number; z: number };
	radius: number;
}

/**
 * Session memory: which block types and regions are not worth trying again.
 * Requires two independent confirmations before blacklisting a type, so a lag
 * spike or a momentarily wrong hotbar slot cannot poison it.
 */
export class BreakTracker {
	private readonly failPositions = new Map<string, Set<string>>();
	private readonly blockedTypes = new Set<string>();
	private readonly regions: Region[] = [];

	/** Record a terminal verdict; returns true if this caused a new blacklist. */
	record(verdict: BreakVerdict, blockType: string, pos: { x: number; y: number; z: number }): boolean {
		if (verdict === 'UNBREAKABLE') {
			let set = this.failPositions.get(blockType);
			if (!set) {
				set = new Set();
				this.failPositions.set(blockType, set);
			}
			set.add(key(pos));
			if (set.size >= 2 && !this.blockedTypes.has(blockType)) {
				this.blockedTypes.add(blockType);
				return true;
			}
			return false;
		}
		if (verdict === 'PROTECTED_REGION') {
			const already = this.regions.some(
				(r) => dist(r.center, pos) <= r.radius,
			);
			if (already) return false;
			this.regions.push({ center: { ...pos }, radius: 12 });
			return true;
		}
		return false;
	}

	isBlocked(blockType: string, pos: { x: number; y: number; z: number }): boolean {
		if (this.blockedTypes.has(blockType)) return true;
		return this.regions.some((r) => dist(r.center, pos) <= r.radius);
	}

	get blocked(): string[] {
		return [...this.blockedTypes];
	}

	get blockedRegions(): readonly Region[] {
		return this.regions;
	}
}

function key(p: { x: number; y: number; z: number }): string {
	return `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
}

function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

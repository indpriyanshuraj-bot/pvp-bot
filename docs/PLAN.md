# Bot Architecture Plan — v3

A simpler, capability-driven architecture for bots that behave like players.

**Status:** plan only, no code yet.
**Goal:** replace v2.9's 57 files / 14.5k lines / 6 per-kit AI branches with ~15
modules that make decisions from *what the bot has* rather than *what kit it was
spawned as*.

---

## 1. Reality check first

Every design choice below is constrained by what the scripting API actually
exposes. These were verified against `@minecraft/server` 2.11.0 (stable),
2.13.0-beta, `@minecraft/server-gametest` 1.0.0-beta and `@minecraft/server-ui`
2.3.0. Anything marked ✗ must be designed *around*, not wished for.

### 1.1 What we get for free

| Capability | API | Why it matters |
|---|---|---|
| **Bots chat** | `SimulatedPlayer.chat(msg)` | bots appear in real chat |
| **Native pathfinding** | `navigateToLocation/Block/Entity` | no A* to write for travel |
| **Elytra flight** | `glide()` / `stopGliding()` | elytra PvP and clutches |
| **Block breaking** | `breakBlock()` | real grinding |
| **Real item use** | `useItem`, `useItemInSlot`, `useItemInSlotOnBlock` | eating, potions, buckets, placement |
| **Body rotation** | `setBodyRotation`, `rotateBody` | look-around, spins, crouch-spam |
| **Own ender chest** | `getComponent('minecraft:ender_inventory').container` | genuine ender chest access |
| **Container ops** | `Container.moveItem/transferItem/find/firstEmptySlot` | shulkers, chests, stealing |
| **Food stats** | `ItemFoodComponent.nutrition / saturationModifier / canAlwaysEat` | **no food table needed for nutrition** |
| **Hunger + saturation** | `minecraft:player.hunger` / `.saturation` attributes | real eat timing |
| **Tool wear** | `ItemDurabilityComponent.damage / maxDurability` | grind/sustain decisions |
| **Chat *reading*** | `world.beforeEvents.chatSend` | **beta only** (2.13-beta) |
| **Impulse / knockback** | `applyImpulse(Vector3)`, `applyKnockback(VectorXZ, num)` | movement tricks, clutch |

### 1.2 What we do **not** get

| ✗ Not available | Consequence |
|---|---|
| **Crafting / smelting** — no recipe API at all | Bots cannot craft. Grinding gathers raw materials only. Kits must be pre-given, or an admin-give config gate must exist. |
| **Bundle contents** — `minecraft:bundle` is opaque | Bundles cannot be read, packed or unpacked by script. **Don't use bundles.** Treat them as inert cargo. |
| **Block hardness / unbreakable flag** | `BlockType` exposes only `id` and `localizationKey`. Unbreakable maps must be handled by block-id list + an empirical probe (§6.4). |
| **Chat read on stable** | Two-way chat needs `@minecraft/server` at beta. Acceptable — gametest already forces beta. |
| **Forcing sprint** | `isSprinting` is **readonly** in 2.11.0. Sprint must emerge from movement, or be approximated with effects/impulse. |
| **Real player animations** | Only gameplay-driven animations (attacking, eating, blocking) plus RP animation controllers. No arbitrary emotes. |
| **Other players' inventories** | Only own inventory, own ender chest, and *block* containers (chest/shulker) are readable. |
| **Cheap bots** | Each `SimulatedPlayer` is a real player entity. Practical ceiling is roughly 8–12 per world. |

> **Design consequence:** because bots are real players and every action is a real
> action, **animations come free**. A bot that actually eats plays the eating
> animation; a bot that actually swings plays the swing. Prefer *doing* over
> *faking* — it removes an entire subsystem and looks correct by construction.

---

## 2. Design principles

1. **Capability, not kit.** Never branch on "is this a sword bot". Derive what the
   bot *can* do from its inventory and environment, then score those options.
2. **Data out of code.** Every table (food risk, tactic preconditions, block
   lists, chat lines, mob temperament) lives in JSON. Code only interprets.
3. **One decider, zero logic.** The top layer picks a goal by utility. It contains
   no movement, no combat, no inventory code.
4. **Skills are the only imperative code.** A skill is a small state machine with
   a fixed contract. Everything else is scoring and lookup.
5. **Fail soft, always.** Every engine call is wrapped; a skill that throws is
   marked `FAILED` and the arbiter falls back. One broken skill must never kill a
   bot's tick.
6. **Budget by construction.** Every layer has a per-tick cost ceiling; bots are
   scheduled round-robin, not all at once.

---

## 3. Architecture

Eight layers. Only layers 4 and 5 contain real logic.

```
┌──────────────────────────────────────────────────────────────────────┐
│ L7  CONFIG      JSON schema · global + per-bot overrides · profiles  │
├──────────────────────────────────────────────────────────────────────┤
│ L6  PRESENT     nametag · chat · animation triggers · debug overlay  │
├──────────────────────────────────────────────────────────────────────┤
│ L5  SKILLS      move · combat · consume · inventory · grind · build  │
│                 · survive          (the only imperative code)        │
├──────────────────────────────────────────────────────────────────────┤
│ L4  PLAN        Goal → tactic → skill sequence   (state machines)    │
├──────────────────────────────────────────────────────────────────────┤
│ L3  DECIDE      utility argmax over goals · arbiter interrupts       │
│                 ← "top label": scoring only, no logic                │
├──────────────────────────────────────────────────────────────────────┤
│ L2  MODEL       CapabilitySet · AffordanceSet · ThreatMap · Relations│
├──────────────────────────────────────────────────────────────────────┤
│ L1  SENSE       WorldSnapshot (cached, LOD-scheduled)                │
├──────────────────────────────────────────────────────────────────────┤
│ L0  DATA        *.json tables · no code                              │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 Module map and size budget

| File | Layer | Responsibility | Target LOC |
|---|---|---|---|
| `main.js` | — | wiring, config load, command registration | 120 |
| `core/snapshot.js` | L1 | perception → `WorldSnapshot` | 250 |
| `core/model.js` | L2 | capabilities, affordances, threat, relations | 300 |
| `core/planner.js` | L3 | goal scoring, arbiter, goal→plan | 200 |
| `core/scheduler.js` | L1/L3 | tick budget, LOD, round-robin | 150 |
| `skills/move.js` | L5 | steering, pathing, swim, elytra, bridge | 350 |
| `skills/combat.js` | L5 | attack timing, crit, shield, reach, tactics | 350 |
| `skills/consume.js` | L5 | food + potion selection and use | 180 |
| `skills/inventory.js` | L5 | hotbar policy, containers, shulker, ender | 300 |
| `skills/grind.js` | L5 | target selection, tool pick, mining, pickup | 250 |
| `skills/survive.js` | L5 | clutch, fall, lava, drown, flee | 250 |
| `social/chat.js` | L6 | intent match, message build, cooldowns | 250 |
| `social/relations.js` | L2 | trust, friend/foe, betrayal estimate | 180 |
| `learn/bandit.js` | L3 | optional tactic prior (see §8) | 150 |
| `data/*.json` | L0 | 7 tables + config schema | — |
| **Total** | | | **≈ 3,300** |

That is roughly **a quarter** of v2.9's 14.5k lines, with no per-kit duplication.

---

## 4. The core idea: Capability → Affordance → Utility

This is what replaces v2.9's six hardcoded `swordLogic / axeLogic / maceLogic /
uhcLogic / crystalLogic / cartLogic` functions.

### 4.1 CapabilitySet (from inventory, cached)

```jsonc
{
  "melee":   { "sword": 3, "axe": 2, "mace": 0, "spear": 0, "trident": 1 },
  "ranged":  { "bow": 1, "arrows": 32, "crossbow": 0 },
  "defense": { "shield": true, "armorPieces": 4, "minArmorDurability": 0.6, "totem": 2 },
  "utility": { "waterBucket": 1, "lavaBucket": 0, "pearl": 16, "crystal": 8,
               "obsidian": 12, "anchor": 0, "glowstone": 0, "bed": 1,
               "elytra": false, "rockets": 0, "cobweb": 4 },
  "consumables": { "gapple": 2, "egapple": 0, "healPot": 3, "strengthPot": 1 },
  "blocks":  { "total": 64, "byType": { "minecraft:cobblestone": 64 } },
  "food":    [ { "typeId": "minecraft:golden_carrot", "count": 8, "nutrition": 6,
                 "saturation": 1.2, "risk": 0 } ]
}
```

Recomputed only when the inventory version changes — not every tick.

### 4.2 AffordanceSet (tactic × precondition)

A tactic is *affordable* only if its declared requirements are met. This lives in
`data/tactics.json`, not in code:

```jsonc
{
  "crystal_pvp": {
    "requires": ["crystal>0", "obsidian>0", "flatGround", "enemyDist<6"],
    "dimension": ["overworld", "end"],
    "baseUtility": 70, "risk": 0.7, "cost": "crystal",
    "skill": "combat.crystal"
  },
  "anchor_pvp": {
    "requires": ["anchor>0", "glowstone>0", "enemyDist<5"],
    "dimension": ["nether"],
    "baseUtility": 85, "risk": 0.5, "cost": "anchor",
    "skill": "combat.anchor"
  },
  "bed_bomb": {
    "requires": ["bed>0", "enemyDist<4", "solidBelow"],
    "dimension": ["nether", "end"],
    "baseUtility": 80, "risk": 0.6, "skill": "combat.bed"
  },
  "riptide": {
    "requires": ["trident>0", "inWater||isRaining"],
    "baseUtility": 65, "skill": "combat.riptide"
  },
  "mace_smash": {
    "requires": ["mace>0", "(fallHeight>3||elytra)"],
    "baseUtility": 75, "skill": "combat.mace"
  },
  "shield_break": {
    "requires": ["axe>0", "targetShielding"],
    "baseUtility": 60, "skill": "combat.axe"
  },
  "sword_trade": {
    "requires": ["sword>0"],
    "baseUtility": 50, "skill": "combat.sword"
  }
}
```

Adding a new PvP style later = **one JSON object**. No code change, no new file.
That is the whole point.

### 4.3 Utility scoring

```
utility(tactic) = baseUtility
                + fit(situation)        // distance, height, health, target state
                + learnedBonus          // §8, optional
                - riskWeight * risk
                - costPenalty(cost)
                - noveltyPenalty        // avoid repeating the same tactic
```

`fit()` is a small table of modifiers per situation (e.g. `mace_smash +25` when
target is airborne and you are above them). Still data, still no branches.

---

## 5. The decision pipeline

Per bot, per scheduled tick:

```
1. SNAPSHOT   read self, target, nearby entities (cached 1–4 ticks), nearby blocks
2. MODEL      refresh CapabilitySet if inventory changed
              compute AffordanceSet, ThreatMap, relations
3. ARBITER    hard interrupts first:  falling? drowning? on fire? critical HP?
              → if triggered, force a SURVIVE goal and skip scoring
4. DECIDE     score goals: FIGHT · GRIND · FLEE · REGROUP · EAT · CLUTCH ·
              FOLLOW · IDLE · SOCIAL
              goal = argmax(utility) with hysteresis (must beat current by 15%)
5. PLAN       goal → ordered skill list  (e.g. FIGHT → [equip, position, tactic])
6. SKILL      tick the active skill; RUNNING | DONE | FAILED
7. PRESENT    nametag, chat queue, animation triggers
```

Two-level utility is deliberate: **goal** answers "what am I doing", **tactic**
answers "how am I fighting". Mixing them (as v2.9 does) is what makes the old code
unmaintainable.

**Hysteresis** (goal must beat the incumbent by a margin) is the single most
important anti-jitter measure. Without it a bot flip-flops between FIGHT and FLEE
every tick.

---

## 6. Subsystems

### 6.1 Movement (your item 2)

Three modes, chosen by distance and context — never "shortest path blindly":

| Mode | Used when | Implementation |
|---|---|---|
| **Travel** | > 12 blocks, no combat | `navigateToLocation` (engine pathfinding) + stuck detector + replan |
| **Approach** | combat, 3–12 blocks | custom steering: `moveRelative` with forward + strafe, jump timing |
| **Footwork** | combat, < 3 blocks | strafe orbits, W-tap, sprint-reset, crit setup |

- **Not always shortest:** during combat, path cost is weighted by *exposure*
  (line of sight to enemy, open ground) not distance. A longer covered route wins.
- **Swimming:** `swim()` / `stopSwimming()`; surface ascent for air.
- **Parkour:** jump-timing heuristic from `isOnGround` + block-gap probe; if a gap
  is too wide, reroute rather than fall.
- **Elytra:** `glide()` + rocket via `useItemInSlot`; altitude hold by pitch.
- Sprint is read-only, so speed comes from movement continuity, `speed` effect, or
  `applyImpulse` — not from a flag.

### 6.2 PvP arsenal (your item 3)

Each entry in §4.2 is a tactic. Shared primitives underneath:

- **Attack timing** — per-weapon cooldown table (v2.9 had `WEAPON_STATS`; keep it,
  it was good), gated by `lastAttack` counter.
- **Crit** — require `!isOnGround && getVelocity().y < 0` before swinging.
- **Shield** — `useItemInSlot` on shield, track `shielding` tag, break-detection.
- **Shield break** — axe hit while target shields; cooldown per target.
- **Reach** — `getRange()` (weapon reach) vs actual distance; back off inside reach.
- **Buckets** — water for extinguish/clutch, lava for denial; both via
  `useItemInSlotOnBlock`.
- **Fishing rod / steal** — rod pull for combo, `moveItem` to loot containers.

### 6.3 Grinding (your item 4)

```
target = argmin over visible blocks of  (value / (distance * toolWear * danger))
```

- **Value table** (`data/blocks.json`): ore id → value, required tool tier, drops.
- **Tool selection:** pick the cheapest tool that can harvest, by durability left.
- **Hunger gate:** stop and eat below hunger 8 (sprint threshold is 6).
- **Danger gate:** abort if a hostile is within X, or if health < threshold.
- **Pickup:** sweep `getEntities({type:'minecraft:item', maxDistance:4})`.

### 6.4 Unbreakable / protected maps (your item 4, second half)

There is **no hardness API**, so three layers, cheapest first:

1. **Static list** — vanilla unbreakables (`bedrock`, `barrier`, `command_block`,
   `end_portal_frame`, …) in `data/blocks.json`.
2. **Config flag** — `grind.allowed: false` for protected worlds; bot refuses to
   mine at all and reports why.
3. **Empirical probe** — call `breakBlock()`, wait N ticks, re-read the block. If
   unchanged, **blacklist that block type for the session** and stop trying. This
   is the robust fallback that actually handles custom protected maps, and it costs
   one block per type.

### 6.5 Enemy / friend / betrayal (your item 5)

A per-player trust score, −100…+100, in `social/relations.js`:

| Event | Δ trust |
|---|---|
| hits me (damage > 3) | −40 |
| hits me (damage ≤ 3, once) | −5 (accidental) |
| hits me again within 10 s | −25 (pattern, not accident) |
| heals me / throws potion at me | +20 |
| attacks my current target | +10 |
| is my teammate (tag/team) | floor at +50 |
| steals my drop | −20 |
| crouches at me, no weapon drawn | +2 (peace signal) |

- **Small hit ≠ betrayal.** A single sub-3-damage hit only nudges the score; the
  friendship breaks on *repetition* or *magnitude*. Exactly the behaviour you asked for.
- **Betrayal guess** = logistic over (trust, distance closing while weapon drawn,
  approach from behind, recent target switch toward me). Emits a *probability*, and
  the planner reacts proportionally — it does not instantly attack. Config-disableable.
- **Mobs:** `data/mobs.json` marks passive / neutral / hostile, plus *provoke
  conditions* (e.g. neutral mobs are left alone unless they hit first, or unless
  `aggression > 0.8`).

### 6.6 Inventory management (your item 7)

- **Hotbar policy** — fixed layout enforced by `inventory.js`:
  `1 weapon · 2 shield · 3 food · 4 potion · 5 blocks · 6 utility · 7 pearl · 8 bucket · 9 spare`.
  `selectedSlotIndex` is settable, so switching is instant and cheap.
- **Shulker use, risk-gated** — exactly your instinct:
  - *safe* (threat low): place → open → `transferItem` → break → pick up.
  - *emergency* (threat high, need kit now): place, dump, break immediately and
    accept the steal risk. Gate: `survive.emergencyShulker` config.
  - Both paths are the same skill with a `mode` flag.
- **Ender chest** — no block needed: `getComponent('minecraft:ender_inventory').container`.
  Always safe, always available. Use this as the *preferred* stash.
- **Chests** — `BlockInventoryComponent.container` + `moveItem`.
- **Stealing** — same primitive, targeting enemy chests; blocked if owner is
  watching and threat is high.
- **Bundles — not supported** (opaque). Do not pick them up; if carried, ignore.

### 6.7 Survival, clutch, special cases (your item 8)

Ordered by reaction time — this is the arbiter's ladder:

1. **Falling fast** → water bucket → hay/honey → elytra → totem.
2. **On fire / in lava** → water bucket → `extinguishSelf`.
3. **Drowning** → ascend, `swim()`.
4. **Low HP** → gapple → heal potion → retreat.
5. **Trapped** → break out (tool), or pearl out.

Special-case data (`data/potions.json`, `data/tactics.json`):

- **Riptide** needs rain or water — the bot checks `isRaining` / `isInWater` and
  *plans around* it rather than failing.
- **Slow falling** is dual-use: clutch tool **and** mace-dodge counter. The
  potion table marks it `contexts: ["fall", "antiMace"]`.
- **Enchanted golden apple** is scarce: a `scarcity` weight means it is only
  chosen when `hp < 6` or the fight is judged decisive — not on every dip.
- **Turtle master** trades speed for resistance: only when the bot intends to
  stand and trade, never when fleeing.

### 6.8 Food and potions (your item 1)

**Half the dataset is unnecessary** — nutrition and saturation come from the API:

```js
const food = stack.getComponent('minecraft:food');
food.nutrition;          // hunger points
food.saturationModifier; // saturation
food.canAlwaysEat;       // gapple-like
```

So `data/food.json` only stores what the API *cannot* tell us: **adverse effects**
and **risk tier**.

```jsonc
{
  "minecraft:pufferfish": { "effects": ["poison2","nausea","hunger3"], "risk": "high" },
  "minecraft:spider_eye": { "effects": ["poison"],                  "risk": "medium" },
  "minecraft:rotten_flesh":{ "effects": ["hunger"],                 "risk": "low" },
  "minecraft:chicken":    { "effects": ["hunger"],                  "risk": "low" },
  "minecraft:poisonous_potato": { "effects": ["poison"],            "risk": "medium" }
}
```

Selection rule — this is your "last resort" logic, made explicit:

```
choose best food where  expectedNetGain > 0
netGain = nutrition + saturation*4
        - riskPenalty(risk, currentHP, currentHunger, alternativesAvailable)
```

`riskPenalty` collapses to ~0 when `hunger < 4` **and** no safe food remains — so
rotten flesh is fine at half hunger, spider eye becomes acceptable when starving,
and pufferfish is only ever eaten if it is literally the last item and HP is high
enough to survive the poison. That is exactly the tiering you described, expressed
as one function over a table.

**Potions** get the same treatment with a `contexts` field, so utility depends on
situation (heal in a fight, slow-falling while falling, strength before engaging).

**Milk** — clears *all* effects, so it is gated: only used to strip a debuff when
no good effect is active.

**Crafting does not exist.** No recipe API. If the bot needs a crafted item it must
be pre-given (kit) or produced by an admin-gated `/give`. Say so in config, don't
fake it.

### 6.9 Chat (your item 6)

Your instinct here is the important one: **no fabricated bragging.** A bot must
never claim something it cannot verify from state. Design:

**Outbound** — event-driven, fact-filled, target-directed:

```jsonc
{
  "id": "taunt_low_hp",
  "when": "target.health < 6 && self.health > 14 && distance < 8",
  "to": "target",
  "templates": ["{target}, you're on {targetHealth} — come on", "nice {targetHealth} hp {target}"],
  "cooldown": 600, "globalCooldown": 200, "chance": 0.4
}
```

- Every slot (`{target}`, `{targetHealth}`, `{myWeapon}`) resolves from the live
  snapshot — so the message is always true at the moment it is sent.
- **Delay**: `20 + 2×len` ticks, randomised ±30 % — humans do not reply in the same
  frame.
- **Cooldowns** are three-tier: per-intent, per-target, and global rate limit.
- **Never** announce finds, loot, coordinates or anything not observable.

**Inbound** — small local intent matcher, no network (there is none anyway):
normalise → keyword/regex table → intent (`greet`, `challenge`, `insult`, `ask_help`,
`ask_where`, `trade`) → pick a response intent with the highest confidence, else
stay silent. Silence is the correct default; a bot that answers everything is the
tell.

**Support/teammate** messages read real data too — "you're at 4 HP, back off" is
generated from the teammate's actual health, not randomly.

### 6.10 Config (your item 10)

`data/config.schema.json`, global + per-bot override, with **profiles**:

| Profile | Effect |
|---|---|
| `pvp_only` | grind/social off, FIGHT pinned, no inventory management |
| `grinder` | FIGHT only when attacked, grind priority high |
| `full` | everything |
| `passive` | no combat, wander + chat only |

Knobs that matter for lag:

```jsonc
{
  "lag": { "thinkTicks": 4, "snapshotTicks": 4, "maxBotsPerTick": 3 },
  "features": { "betrayalGuess": false, "chat": true, "grind": true, "ml": false },
  "budgets": { "pathfindPerBot": 1, "getBlockPerTick": 40, "entitiesPerQuery": 24 }
}
```

One note on your "auto response toward watchdog warning": I'll build a
**operator/admin message handler** — the bot recognises messages from players on a
configured admin list and replies or obeys (useful on your own server). I won't
build behaviour whose purpose is to look human to an anti-cheat system; that's
evading whoever runs the server rather than helping them. If your "watchdog" is
just a plugin on your own world pinging bots, the admin handler covers it.

---

## 7. Presentation layer

Because bots are real players, **most animation is free**: attack, eat, drink,
block, use item, break block all animate natively when performed through the API.

What needs explicit handling:

| Want | How |
|---|---|
| Look at target | `lookAtEntity` / `setBodyRotation` (smooth, rate-limited) |
| Crouch-spam / t-bag | toggle `isSneaking` on a timer |
| 360 spin | `rotateBody` over N ticks |
| Extra flourish | RP animation controller on the `minecraft:player` override + `playAnimation(name)` |

Keep a `present.js`-thin wrapper so no skill ever writes a nametag or sends chat
directly — everything queues through one module. This also makes chat cooldowns
enforceable in exactly one place.

---

## 8. Where learning fits (and how much)

v2.9 used full TD learning over 26 features with two heads, per class, per action.
It is impressive but it is also the hardest thing in the codebase to debug, and it
was silently broken (auto-train never learned).

**Recommendation: a contextual bandit, not full RL.** Scope:

- **What it learns:** which *tactic* to pick inside the FIGHT goal. Nothing else.
  Movement, grinding, chat, inventory stay deterministic.
- **Features:** ~10, not 26 — health delta, distance band, target airborne,
  target shielding, my shield, combo, ammo, height delta, threat, aggression.
- **Algorithm:** linear ε-greedy bandit (one weight vector per tactic, plain
  incremental mean update). No bootstrap, no replay, no second head.
- **Blending:** `finalUtility = (1-α)·handwrittenUtility + α·learnedUtility`,
  with `α` capped by config (default 0.3) so learned weights can never fully
  override sane behaviour.
- **Quota:** `maxUpdatesPerMinute` and `maxSamples` in config — hard ceilings, so
  it cannot quietly consume the tick budget.
- **Kill switch:** `features.ml: false` removes the module entirely at load.
- **Fallback:** if the bandit has < 50 samples for a tactic, its bonus is 0 —
  behaviour is 100% handwritten until there is data.

This keeps ~90 % of the behaviour explainable in one read, which matters far more
for a project you maintain by prompting than a 2 % edge in fight quality.

---

## 9. Performance plan

| Concern | Mitigation |
|---|---|
| N bots × per-tick think | round-robin: `maxBotsPerTick` bots think per tick; others reuse last goal |
| LOD | engaged bots (target < 16) think every tick; others every 4 |
| `getEntities` cost | one query per bot per snapshot, tight `maxDistance`, type filters, cached `snapshotTicks` |
| `getBlock` storms | sample columns, cache per snapshot, never in a per-block loop without a budget |
| Pathfinding | `navigateToLocation` is engine-side — cheap for script, but cap one in flight per bot |
| Inventory scans | index cached, invalidated by inventory version counter |
| Chat | queue + cooldown, never inline in a skill |
| Persistence | batch writes, chunked dynamic properties, save interval configurable |

Target: 8 bots at 20 TPS on a mid-range device with `thinkTicks: 4`.

---

## 10. Build order

Each phase is independently testable. Do not start the next until the current one
runs.

| Phase | Deliverable | Acceptance |
|---|---|---|
| **0** | `main.js`, config schema, one command, spawn/disconnect | bot spawns, disconnects, config round-trips |
| **1** | `snapshot.js` + `model.js` | `/pb:botdebug` prints a correct snapshot + capability set for a bot holding a kit |
| **2** | `skills/move.js` | bot travels to coords, climbs, swims, doesn't get stuck for >5 s |
| **3** | `skills/combat.js` + 3 tactics (sword, axe, mace) | bot fights a dummy; reaches, crits, breaks shields |
| **4** | `planner.js` + arbiter | bot flees at low HP, eats when hungry, stops fighting when target dies |
| **5** | `skills/consume.js` + food/potion tables | bot picks safe food, escalates to risky food when starving |
| **6** | `skills/inventory.js` | hotbar stays in layout; ender chest stash; shulker round-trip |
| **7** | `skills/grind.js` + block table + probe | bot mines ore, stops on protected block, eats to keep grinding |
| **8** | `skills/survive.js` | water-bucket clutch from a 30-block fall |
| **9** | remaining tactics (crystal, anchor, bed, riptide, spear) | each fires only when affordable |
| **10** | `social/relations.js` + `social/chat.js` | accidental hit doesn't break trust; taunt only with true data |
| **11** | `learn/bandit.js` | disabled by default; enabling changes tactic mix measurably |

---

## 11. Explicit non-goals

Written down so nobody wastes a week on them:

- **Crafting / smelting / enchanting** — no API. Pre-give items.
- **Bundle contents** — opaque, ignore.
- **Block hardness detection** — use list + empirical probe.
- **Arbitrary emotes / custom animations** — gameplay animations only.
- **Reading other players' inventories or ender chests** — not exposed.
- **Chat reading on stable API** — needs beta.
- **True A\* over long distances** — use engine pathfinding.
- **Reproducing v2.9's TD learner** — replaced by a bandit (§8).

---

## 12. Repo layout

```
src/
  main.js
  core/      snapshot.js model.js planner.js scheduler.js
  skills/    move.js combat.js consume.js inventory.js grind.js survive.js
  social/    relations.js chat.js
  learn/     bandit.js
  data/      food.json potions.json tactics.json blocks.json mobs.json
             chat-intents.json config.schema.json
  commands/  spawnbot.js botdebug.js settings.js
```

One file per concern, no folder deeper than two levels, no per-kit files.

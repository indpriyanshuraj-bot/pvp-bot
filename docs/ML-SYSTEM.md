# Decision Architecture, ML System & Bot Builder

How a PvP Practice Bot decides what to do, how the learner works, what every ML
setting does, and how the custom-bot rule engine is evaluated.

Everything here is traced from the recovered v2.9 source in `reference/v2.9/`.

---

## 1. The three decision layers

A bot's action every tick comes from one of three systems, in this order:

```
                  ┌─────────────────────────────────────────┐
   tick (bots.js) │  forcedAction?  ──yes──▶ execute it     │
                  └────────────┬────────────────────────────┘
                               │ no
                               ▼
                  ┌─────────────────────────────────────────┐
                  │  r.type === 'custom' ?                  │
                  │    ──yes──▶ rule engine (bot_builder)   │
                  │    ──no───▶ DecisionManager.<kit>()     │
                  └────────────┬────────────────────────────┘
                               ▼
                  ┌─────────────────────────────────────────┐
                  │  MLSystem.decide(kit, …)  — may override│
                  └─────────────────────────────────────────┘
```

1. **`forcedAction`** — set by `/pb:forceaction`, wins outright.
2. **Scripted kit AI** — `DecisionManager.sword/axe/mace/uhc/crystal/cart` returns
   an action string from hand-written tactics.
3. **ML overlay** — `MLSystem.decide()` receives the scripted answer and may
   replace it. If ML is off, disabled, or the scripted answer is not in that
   class's action set, the scripted answer is passed straight through.

The scripted layer is always computed. ML is a *correction* on top of it, never a
replacement for it — which is why bots still fight sensibly with ML off.

### 1.1 The scripted layer, and per-bot personality

Each bot gets a **persona** on first use (`BotManager.getPersona`), randomised
once and stored in its `bot_data`:

| Field | Range | Effect |
|---|---|---|
| `aggr` | 0.85 – 1.15 | multiplies aggression |
| `speed` | 0.9 – 1.1 | scales clicks-per-second |
| `hops` | 0.7 – 1.3 | jump frequency |
| `healAt` | 7.5 – 12.5 HP | health at which it eats |

**Aggression** (`getAggression`) is health-dependent: at ≥85 % health the factor
is 1.0, below that it falls linearly to 0.4, then multiplies `persona.aggr` and
clamps to 0.25 – 1.0. A wounded bot therefore becomes defensive on its own.

`rotateStyle(styleKey, candidates, minTicks, maxTicks)` is how a kit avoids
looking robotic: it picks a tactic from a weighted candidate list and **commits to
it for 40 – 120 ticks** before re-rolling. That is why a mace bot will bait with a
shield for two seconds, then suddenly elytra-smash.

---

## 2. The ML system

### 2.1 What kind of model it is

It is **not** a neural network. It is a **linear value model per action** — a
contextual bandit with bootstrapped targets and a replay buffer.

Per kit class (`sword`, `axe`, `mace`, `uhc`, `crystal`) the brain holds:

```
brain = {
  atk: { weights: { <action>: Float[26] }, moveWeights: { … } },
  def: { weights: { <action>: Float[26] }, moveWeights: { … } },
  counts:     { <action>: visitCount },
  moveCounts: { … },
  steps, moveSteps, bonusCounts
}
```

So each class has **two heads** — `atk` (offence) and `def` (defence) — each with
one 26-dimension weight vector per action, for tactical and movement separately.

- **Tactical actions per class** (`TACTICAL_ACTIONS`):
  - `sword`: `basic_attack`, `hold`
  - `axe`: `basic_attack`, `ranged_attack`
  - `mace`: `mace_attack`, `shield`
  - `uhc`: `uhc_attack`, `ranged_attack`, `shield`
  - `crystal`: `crystal_attack`, `basic_attack`
- **Movement actions** (all classes): `press`, `hold`, `reset`, `circle_left`, `circle_right`

`cart` has no ML class — `cartLogic` calls `MLSystem.decide('cart', …)`,
`TACTICAL_ACTIONS.cart` is `undefined`, and the call returns the scripted action
untouched. Cart is scripted-only by construction.

### 2.2 The 26 features

`encodeFeatures(bot, botData, target)` — every value is clamped to a sane range:

| # | Feature | Range | Meaning |
|---|---|---|---|
| 0 | bias | 1 | constant |
| 1 | own health | 0 – 1.5 | `current/20` |
| 2 | target health | 0 – 1.5 | `current/20` |
| 3 | distance | 0 – 1.5 | `dist/10` |
| 4 | attack cooldown | 0 – 1 | `lastAttack/20` |
| 5 | java combat | 0/1 | Java-emulation mode on |
| 6 | difficulty | 0 – 1 | `(3-difficulty)/3`, 1 = hardest |
| 7 | height delta | −1 – 1 | `(botY − targetY)/5` |
| 8 | target shielding | 0/1 | has `shielding` tag |
| 9 | target shield broken | 0/1 | has `shield_broken` |
| 10 | own shield broken | 0/1 | |
| 11 | falling | 0/1 | `fallDistance > 0` |
| 12 | trap nearby | 0/1 | own liquid within 3 blocks of target |
| 13 | combo | 0 – 1.5 | `hits/5` within `COMBO_TIMEOUT_TICKS` |
| 14 | range error | −1 – 1 | `(dist − reach)/4`; 0 = perfect spacing |
| 15 | closing velocity | −1 – 1 | relative velocity along the line |
| 16 | target sprinting | 0/1 | |
| 17 | grounded | 0/1 | |
| 18 | target grounded | 0/1 | |
| 19 | aggression | 0 – 1 | `getAggression()` |
| 20 | clear shot | 0/1 | raycast unobstructed |
| 21 | recent damage taken | 0 – 1.5 | decaying sum `×0.97/tick` |
| 22 | recent damage dealt | 0 – 1.5 | same |
| 23 | facing dot | −1 – 1 | view direction · direction to target |
| 24 | RBF near | 0 – 1 | Gaussian bump centred at 2.5 blocks |
| 25 | RBF mid | 0 – 1 | Gaussian bump centred at 6 blocks |

Features 24–25 are **radial basis functions**, `exp(-((d-μ)/σ)²)`. They let a
linear model express "act differently at sword range than at bow range" without
needing a hidden layer.

### 2.3 How an action is chosen

Inside `decide()`:

1. **Gates.** Skip if no target, target is shooting (bow drawn), the scripted
   action isn't in this class's set, ML is disabled, or a decision is already
   pending within `MIN_TACTICAL_DECISION_TICKS` ticks.
2. **Settle** any previous pending decision (that's where learning happens — see 2.5).
3. **Filter by role.** `mlRole: 'attack'` drops passive actions (`hold`, `shield`);
   `'defense'` keeps all; sparring drops passive only when aggression ≥ 0.8.
   Then `feasible()` removes `ranged_attack` without arrows and `shield` without a
   usable shield.
4. **ε-greedy, scaled.** `ε = max(EPSILON_MIN, EPSILON_START − steps × EPSILON_DECAY)`.
   With probability `ε × 0.35` pick uniformly at random.
5. **Otherwise softmax over a UCB-boosted score:**

```
score(a)  = w_a · x                                  (dot product)
spread    = max(score) − min(score)
bonus(a)  = EXPLORE_BONUS × spread × √( ln(max(2, steps+1)) / (visits_a + 1) )
T         = max(TEMPERATURE_MIN, TEMPERATURE_START − steps × TEMPERATURE_DECAY)
p(a)      ∝ exp( (score(a)+bonus(a) − max) / (T × spread) )
```

Two subtleties worth knowing: the temperature is **multiplied by the score
spread**, so early on (all weights zero) it behaves almost uniformly; and the UCB
term is also scaled by spread, so exploration pressure fades as the scores
separate. This is why a fresh brain flails and an old one commits.

6. **Store the decision** in `pendingByBot` with the feature vector, tick,
   `hadTarget`, `targetId` and the current `potential`.

### 2.4 Movement is a separate, slower learner

`decideMovement()` runs on the same machinery but with its own weights, counts and
step counter, and a **blend gate**:

```
blend = min(MOVEMENT_MAX_BLEND, moveSteps / MOVEMENT_MATURITY_STEPS)
```

`n = mlOverride ? 1 : max(0.1, blend)`; with probability `1 − n` it returns `null`
and the scripted movement wins. So movement ML fades in over the first ~600
movement decisions and never exceeds 90 % authority. That protects early
behaviour from a half-trained policy.

`moveOverrideFor()` translates the chosen action into a movement intent:

| Action | Intent |
|---|---|
| `press` | advance (`direction: +1`) |
| `reset` | back off (`direction: −1`) |
| `hold` | keep distance, no lateral |
| `circle_left` / `circle_right` | strafe orbit |

### 2.5 Rewards

Rewards accumulate into two buckets (`atk`, `def`) between decisions and are
settled when the next decision is made or the pending timeout fires.

**Offence head (`atk`)**

| Source | Amount |
|---|---|
| damage dealt | `damage × DAMAGE_DEALT_MULT` |
| combo | `(comboCount − 1) × COMBO_BONUS` |
| shield break (axe on shield) | `+SHIELD_BREAK_BONUS` |
| trap kill credit | `+TRAP_BONUS` |
| enemy death | `+WIN_BONUS` |
| idle (target present, no damage) | `−IDLE_PENALTY` |
| whiff (swung, no damage) | `−WHIFF_PENALTY × min(swings, 4)` |

**Defence head (`def`)**

| Source | Amount |
|---|---|
| damage taken | `−damage × DAMAGE_TAKEN_MULT` |
| successful block (shielding when hit) | `+BLOCK_BONUS` |
| own death | `−DEATH_PENALTY` |

**Movement** (`settleMove`)

| Source | Amount |
|---|---|
| closing distance | `clamp((startDist − nowDist) × CLOSE_REWARD_PER_BLOCK, ±CLOSE_REWARD_CAP)` |
| good spacing | `SPACING_REWARD × clamp(1 − |dist − 0.9×reach| / 2.5, −1, 1)` |

**Shaping.** `potential()` = `(ownHP/20 − targetHP/20) × SHAPING_SCALE`. The
settled reward adds `DISCOUNT × potential(next) − potential(current)` — the classic
potential-based shaping term, which provably does not change the optimal policy
while making learning far faster.

`REWARD_CHECKS` restricts bonus rewards per class — `sword` and `crystal` get no
block/shield-break/trap credit, because their kits cannot produce them.

### 2.6 The update rule

```
target = (accumulatedReward + shapingDelta) / REWARD_SCALE
       + DISCOUNT × clamp(bootstrapValue(nextState), −20, 20)

w[i] += (LEARNING_RATE / (1 + ‖x‖²)) × (target − w·x) × x[i]
w[i]  = clamp(w[i], −WEIGHT_CLAMP, +WEIGHT_CLAMP)
```

This is **normalised LMS** (NLMS): dividing by `1 + ‖x‖²` makes the step size
independent of feature magnitude, which matters because features span very
different scales. The bootstrap term (`bootstrapValue` = max score over all
actions in the next state) is a one-step TD target.

### 2.7 Replay

Every settled decision is pushed into a per-class ring buffer capped at
`REPLAY_CAPACITY`. Every `SAVE_INTERVAL_TICKS` the system also runs
`REPLAY_PASSES × REPLAY_BATCH` random samples from that buffer and re-applies the
same update. This is what lets one expensive fight be learned from many times.

### 2.8 Persistence, curriculum, auto-train

- **Storage.** Each brain is `JSON.stringify`-ed and split into
  `MAX_CHUNK_CHARS` chunks across world dynamic properties (`ml_brain_<class>_data1…`),
  with a `_meta` sidecar. Saved every `SAVE_INTERVAL_TICKS` for classes marked dirty.
- **Curriculum.** `curriculumDifficulty()` advances the sparring partner's
  difficulty one tier (`easy → medium → hard → impossible`) every
  `CURRICULUM_STEPS` learning steps, when `CURRICULUM` is 1.
- **Auto-train.** `/pb:mltrain <class> <difficulty> on <count>` spawns attacker /
  defender pairs laid out on a `GRID_COLS`-wide grid spaced `AUTO_TRAIN_SPACING`
  apart, respawning a dead member after `RESPAWN_DELAY_TICKS`.

> **Known bug.** `spawnAutoTrainMember()` sets `mlDisabled: true` on both bots of
> a pair, and `decide()` requires `!mlDisabled` before it will add a bot to
> `trackedBots`. Rewards are only credited to tracked bots. So the auto-training
> pairs are never tracked and never learn — `/pb:mltrain` spawns sparring bots that
> generate no training data, contrary to its own description. Setting
> `mlDisabled: false` (or `mlOverride: true`) would fix it.

---

## 3. Every ML setting

49 values, all stored as world dynamic properties `ml_<NAME>`, editable via
`/pb:mlsettings` (6 pages) or `/pb:mlreset`. `getMLSetting` caches for 200 ticks,
so changes apply within 10 seconds.

### Learner

| Setting | Default | What it does | Raise it → |
|---|---|---|---|
| `LEARNING_RATE` | 0.35 | NLMS step size | learns faster, more unstable, forgets old fights |
| `DISCOUNT` | 0.85 | weight on next-state value | plans further ahead; >0.95 can destabilise |
| `WEIGHT_CLAMP` | 8 | max abs weight | allows more extreme preferences; too high = brittle |
| `REWARD_SCALE` | 10 | divides accumulated reward | smaller target signal → slower, gentler learning |
| `REPLAY_CAPACITY` | 384 | ring-buffer size | remembers more history, costs memory |
| `REPLAY_BATCH` | 24 | samples per replay pass | more learning per save tick, more CPU |
| `REPLAY_PASSES` | 2 | passes per save tick | multiplies batch; `0` disables replay entirely |

### Exploration

| Setting | Default | What it does | Raise it → |
|---|---|---|---|
| `TEMPERATURE_START` | 1.2 | initial softmax temperature | more random at first |
| `TEMPERATURE_MIN` | 0.15 | floor on temperature | never becomes fully greedy |
| `TEMPERATURE_DECAY` | 0.0006 | temperature fall per step | cools faster, commits sooner |
| `EXPLORE_BONUS` | 0.6 | UCB novelty weight | favours rarely-tried actions longer |
| `EPSILON_START` | 0.25 | initial random-action rate | more pure random early |
| `EPSILON_MIN` | 0.03 | random-action floor | keeps some permanent chaos |
| `EPSILON_DECAY` | 0.002 | ε fall per step | random phase ends sooner |

Effective random rate is `ε × 0.35`, so the shipped defaults give ≈8.75 % random
at step 0, falling to ≈1 % at the floor.

### Rewards

| Setting | Default | What it does | Raise it → |
|---|---|---|---|
| `DAMAGE_DEALT_MULT` | 1.5 | reward per damage dealt | prioritises trading damage |
| `DAMAGE_TAKEN_MULT` | 0.55 | penalty per damage taken | more defensive/cautious |
| `DEATH_PENALTY` | 30 | penalty on own death | strongly avoids dying |
| `WIN_BONUS` | 60 | reward for a kill | seeks kills over chip damage |
| `IDLE_PENALTY` | 6 | penalty for a target but no damage | punishes passivity |
| `WHIFF_PENALTY` | 2 | penalty per missed swing (max 4) | punishes flailing |
| `SHAPING_SCALE` | 12 | potential-based shaping weight | faster convergence, more bias risk |
| `SPACING_REWARD` | 3 | reward for holding ~0.9× reach | movement hovers at ideal range |
| `COMBO_BONUS` | 12 | per extra hit in a combo | chains hits aggressively |
| `COMBO_TIMEOUT_TICKS` | 40 | combo window (2 s) | longer window = easier combos |

### Bonuses

| Setting | Default | What it does | Raise it → |
|---|---|---|---|
| `BLOCK_BONUS` | 3 | reward for blocking a hit | shield use becomes attractive |
| `SHIELD_BREAK_BONUS` | 8 | reward for axe-breaking a shield | axe bots hunt shields |
| `SHIELD_BREAK_COOLDOWN_TICKS` | 100 | per-target credit cooldown | prevents farming one shield |
| `TRAP_BONUS` | 8 | reward for a lava/fire kill from own liquid | trap play is encouraged |
| `TRAP_CREDIT_RANGE` | 5 | max distance for trap credit | wider trap attribution |
| `CLOSE_REWARD_PER_BLOCK` | 2 | reward per block closed | strongly closes distance |
| `CLOSE_REWARD_CAP` | 8 | cap on closing reward | prevents one dash dominating |

### Cadence

| Setting | Default | What it does | Raise it → |
|---|---|---|---|
| `MIN_TACTICAL_DECISION_TICKS` | 6 | min ticks between tactical re-decisions | actions last longer, less twitchy |
| `MOVE_DECISION_WINDOW_TICKS` | 12 | min ticks between movement decisions | smoother strafing |
| `PENDING_TIMEOUT_TICKS` | 60 | force-settle an unanswered decision | stale rewards cleared sooner |
| `SETTLE_SWEEP_TICKS` | 20 | how often the timeout sweep runs | less overhead, slower cleanup |
| `MOVEMENT_MATURITY_STEPS` | 600 | decisions before movement ML is fully blended | slower, safer fade-in |
| `MOVEMENT_MAX_BLEND` | 0.9 | cap on movement ML authority | >0.9 lets ML fully drive movement |

### Storage & training

| Setting | Default | What it does | Raise it → |
|---|---|---|---|
| `SAVE_INTERVAL_TICKS` | 200 | save + replay period (10 s) | less I/O, coarser persistence |
| `MAX_CHUNK_CHARS` | 30000 | dynamic-property chunk size | fewer properties, larger each |
| `RESPAWN_DELAY_TICKS` | 10 | auto-train respawn delay | slower training loop |
| `MAX_PAIRS_PER_REQUEST` | 20 | pairs allowed per command | bigger single request |
| `MAX_TOTAL_AUTO_TRAIN_PAIRS` | 30 | hard cap across all classes | more bots, more lag |
| `AUTO_TRAIN_SPACING` | 24 | grid spacing between pairs | pairs less likely to cross-target |
| `GRID_COLS` | 5 | grid width for pair layout | wider layout |
| `CURRICULUM` | 1 | 0 disables difficulty ramp | — |
| `CURRICULUM_STEPS` | 2500 | steps per difficulty tier | slower ramp |

---

## 4. The bot builder (rule engine)

`/pb:botbuilder` → **Bot Builder** menu → Create / Edit / Share / Manage Kits.
Custom bots are stored as JSON in the world property `custom_bots`, keyed by a
`customId`, and are cached by `bots.js` with a version counter so edits apply
without a reload.

### 4.1 Data model

```jsonc
{
  "<customId>": {
    "actions": [
      { "type": "variable",      // rule with conditions
        "action": "Attack",
        "conditions": [ { "variable": "Health", "operator": "<", "value": "10" } ],
        "inputs": { } },
      { "type": "unconditional", // fallback
        "action": "Wander" }
    ]
  }
}
```

### 4.2 Evaluation order

`customBotLogic()` walks `actions` **top to bottom and stops at the first match**:

- **`unconditional`** — matches immediately and **ends evaluation**. Anything
  below it is unreachable, which is why it belongs last.
- **`variable`** — every condition must pass (logical AND). First rule whose
  conditions all pass wins.

With no match, the bot stops moving and sprints in place (a deliberate "idle"
state). With debug on (`/pb:botdebug`), `debugTrace` records a ✔/✘ line per
condition, shown in the bot's nametag.

### 4.3 Conditions (30)

Values are read from the world each tick; `Target*` conditions return `N/A` when
there is no target.

| Variable | Type | Notes |
|---|---|---|
| `Health` | Num | own HP, rounded |
| `TargetHealth` | Num | target HP, rounded |
| `DistanceFromTarget` | Num | to 0.1 block |
| `Difficulty` | Num | bot's difficulty value |
| `HasItem` / `HasItemHotbar` | Bool or Num | Num when `value` is a number → item **count** |
| `HasItemOffhand` | Bool | |
| `HasTotem` | Bool | totem in inventory **and** offhand |
| `HasEffect` | Bool | `target` holds the effect name |
| `HasPotion` | Bool | matches potion in inventory |
| `TargetIsSurvival` | Bool | game mode; respects `linked_player` (`mob`/`all`) |
| `TargetInAir` / `BotInAir` | Bool | |
| `TargetHolding` / `BotHolding` | Bool | held item id |
| `TargetShielding` / `BotShielding` | Bool | shielding and not broken |
| `BotInWater` / `BotInLava` | Bool | block at feet |
| `IsOnFire` | Bool | |
| `IsSprinting` | Bool | |
| `IsCrouched` | Bool | sneaking |
| `IsTargetValid` | Bool | |
| `ArmorDurability` | Num | lowest of the four armour pieces, 0–100 |
| `BotHeight` | Num | blocks above ground |
| `LineOfSight` | Bool | raycast to target |
| `IsBlockOnBot` | Bool | `target` block id at feet or head |
| `IsAt` | Bool | `target`/`value` = `"x, y, z"`; true within 0.5 blocks |
| `Chance` | Num 1–100/sec | **special** — see below |

**`Chance` is different.** It does not compare: it calls
`getChanceMulti(value)` and returns the rolled result directly as `met`, so
`Chance 30` means "≈30 % per second". Putting a second condition after `Chance`
is the normal way to use it — `Chance 20` **AND** `Health < 8` = "20 % chance per
second, but only when hurt".

### 4.4 Operators and value coercion

`OPERATORS = ['<', '>', '=', '!=', '<=', '>=']`. `wantsItemAmount()` decides
whether an item condition is boolean or numeric: a numeric `value` (or
`"true"`/`"false"` string) flips it to a count comparison.

### 4.5 Actions (43)

Movement / offence: `MoveTowardsTarget`, `MoveTowards` (coords), `Wander`,
`WanderAround` (coords), `Backup`, `Strafe`, `Jump`, `LookAtTarget`, `Flee`,
`Attack`, `AttackCrit`, `AxeAttack`, `MaceAttack`, `SpearAttack`, `SpearLunge`,
`CrystalAttack`, `CartAttack`, `AttackWShield`, `UseShield`, `ShootBow`,
`ShootCrossBow`, `ThrowTrident`, `PearlTowards`, `PearlAway`, `UseElytra`.

Items / sustain: `Eat`, `EatGapple`, `DrinkPotion`, `SplashSelf`, `SplashTarget`,
`EquipItemHotbar`, `EquipItemOffhand`, `FindWeapon`, `UseItem`, `HoldItem`,
`DropItem`, `RepairArmor`.

Blocks: `PlaceBlockOnTarget`, `PlaceBlockOnLiquid`, `PlaceBlockOnSelf`,
`BreakWeb`, `Crouch`, `UnCrouch`.

Actions needing an input (`ACTION_INPUTS`) prompt for it: potion, item, block or
coordinates.

### 4.6 Recorded actions override built-ins

Before dispatching, `executeCustomAction` checks for a recording named
`rec_action_<ActionName>`. If one exists, the bot **replays your recorded fight
motion** instead of the built-in implementation. That is how you can record
yourself and attach the recording to a custom bot action.

### 4.7 ML does not apply to custom bots

`CLASSES` is derived from `TACTICAL_ACTIONS`, which contains only the five
premade kits. A `custom` bot never enters `decide()`, so it is never tracked and
never learns — custom bots are pure rule engines, and the ML settings have no
effect on them.

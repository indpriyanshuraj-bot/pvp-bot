# PvP Bots v3

Capability-driven PvP practice bots. Decisions come from what the bot *has*, not
from which kit it was spawned as.

See `../docs/PLAN.md` for the architecture and `../docs/DECISIONS.md` for the
reasoning behind NLP, the three learning levels, the watchdog governor, break
detection, the control layer and the pro GUI.

## Commands

| Command | Effect |
|---|---|
| `/pvb:spawn [profile]` | spawn a bot at your position (`easy`/`normal`/`hard`/`pro`) |
| `/pvb:pro [preset]` | open the pro-level GUI, or apply a preset directly |
| `/pvb:info` | bot count and governor tier |
| `/pvb:trust` | show what the bots think of each player |
| `/pvb:clear` | remove every bot |

## Layout

```
src/core/     governor, pro mapping, planner, capabilities, weapons   (pure)
src/skills/   breakDetect                                             (pure)
src/learn/    opponent (L1), archetype (L2), bandit (L3)               (pure)
src/social/   nlp — Porter stemmer + intent matcher                    (pure)
src/engine/   input, snapshot, registry                                (touches the API)
src/commands/ custom command registration + pro GUI
src/data/     tactics, archetypes, chat intents, blocks, food
tests/        offline unit tests (node:test)
gametests/    in-game tests (/gametest run pvb:<name>)
```

The pure layer has **no engine imports** — that is enforced by CI, and it is what
makes the logic testable without a Minecraft runtime.

## CI

```bash
npm install
bash scripts/ci.sh
```

Seven gates, and the gates themselves are tested:

1. typecheck — real `@minecraft/server` 2.11.0 types, strict, **no unused code**
2. purity — the testable core must not import the engine or `/engine/`
3. unit tests
4. esbuild bundle
5. bundle portability — valid ESM, no `node:` / `require` / `process` / `__dirname`,
   and no imports beyond the three allowed `@minecraft/*` modules
6. pack validation — manifest UUID, script module, entry file present, deps declared
7. gametest inventory

Gates 1 and 4 abort the run on failure, because gates 5–6 validate build artifacts
and must never pass against a stale `dist/`.

### What CI can and cannot catch

`@minecraft/server-gametest` only executes inside Minecraft. The offline suite
therefore covers everything that is pure — scoring, trust, learning maths, the
break classifier, NLP, throttling — and the gametests cover what needs a live
world:

```
/gametest run pvb:inputMovesBot
/gametest run pvb:inputTurnsBot
/gametest run pvb:inputRespectsBudget
/gametest run pvb:registryTracksBots
/gametest run pvb:registryDropsDeadBots
```

Build them with `node scripts/build.mjs --with-tests` and run the resulting pack
in a world with **Beta APIs** enabled (gametest has no stable release).

## Status

Phases 0–3 are built:

- toolchain, config, spawn/clear/info
- control layer, perception, capability derivation
- planner with arbiter and hysteresis
- governor, break detection, NLP
- all three learning levels (L1 skill, L2 archetype, L3 bandit)
- **movement**: approach, footwork with orbiting strafe, flee, hold, stuck detection
- **combat**: tactic selection over `data/tactics.json`, affordability checks,
  reach/cooldown/crit gating, and the L1 x L2 x L3 modulation chain

- **consumption**: risk-tiered food choice, potion lookup by need, milk gating
- **survival**: falling / burning / drowning / low-health ladder with slot lookup
- **inventory**: fixed hotbar layout with stable swap planning, shulker risk gate
- **grinding**: value-per-distance block selection, tool-tier and hunger gates,
  and the break classifier driving real mining attempts

- **social**: trust model with accident-vs-pattern hit handling, betrayal estimate,
  archetype observer (L2 is now live), and fact-filled rate-limited chat

Not yet built: container/shulker execution (the gate is decided, the block
placement is not), and inbound chat (reading `chatSend` needs the beta module).

### Trust, and why a light bump is not betrayal

`Relations` distinguishes an accident from a pattern. A hit above 3 damage costs
40 trust. A light hit costs 5 — but a *second* light hit within 200 ticks costs
25, because repetition is intent. Healing and shared targets build trust back,
teammates have a floor, and trust drifts toward neutral when nothing happens.
`betrayalScore` returns a probability from signals (trust, closing speed, weapon
drawn, approach from behind, target switch) so the planner can react
proportionally instead of instantly attacking a friend.

### Grinding and the unbreakable probe

`selectBlock` scores `value × 10 / (1 + distance)` damped by threat, skipping
anything the tool cannot harvest, vanilla unbreakables, and session-blacklisted
positions. An attempt runs through `beginMining` → `evaluateMining`, which is the
six-verdict classifier from `breakDetect`: a block that will not break with the
right tool, no fatigue and past timeout asks for **one retry** before being
declared `UNBREAKABLE`, and two confirmations at different positions are needed
before the type is blacklisted. That is the empirical detection for protected maps.

### Food risk, in one paragraph

Nutrition and saturation come from `ItemFoodComponent`, so `data/food.json` only
lists adverse effects and a risk tier. `chooseFood` scores each option as
`nutrition + saturation*4 + urgency*12 - penalty`, where `urgency` rises as hunger
falls and `penalty` shrinks with it — so rotten flesh is fine at half hunger and
spider eye becomes acceptable when starving. Two hard floors override the maths:
no high-risk food below 35% health, no medium-risk food below 20%. A starving bot
at 4 HP still will not eat pufferfish.

### How the three learning levels combine

`selectTactic` scores every tactic in `data/tactics.json`:

```
utility = combineUtility(base, pro, l1Mod, l2Mod, l3Mod)
```

- `l1Mod` = `skillMod(opponentSkill, risk)` — a strong opponent penalises risky play
- `l2Mod` = `counterWeights(archetype)[tactic] - 1` — style counter
- `l3Mod` = bandit bonus, clamped, zero during cold start

Each is clamped to a 0.5–2.0 factor, so no layer can dominate.

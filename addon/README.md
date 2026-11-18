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

Six gates: typecheck against the real `@minecraft/server` 2.11.0 definitions,
purity check, unit tests, esbuild bundle, pack validation, gametest inventory.

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

Phase 0–1 of the plan is built: toolchain, config, spawn/clear/info, the control
layer, perception, capability derivation, the planner with arbiter and hysteresis,
the governor, break detection, NLP, and all three learning levels.

Not yet built: movement skills beyond approach, combat tactics beyond sword
approach-and-swing, grinding, inventory management, survival/clutch, and the
social layer's outbound chat.

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

Phases 0–3 are built:

- toolchain, config, spawn/clear/info
- control layer, perception, capability derivation
- planner with arbiter and hysteresis
- governor, break detection, NLP
- all three learning levels (L1 skill, L2 archetype, L3 bandit)
- **movement**: approach, footwork with orbiting strafe, flee, hold, stuck detection
- **combat**: tactic selection over `data/tactics.json`, affordability checks,
  reach/cooldown/crit gating, and the L1 x L2 x L3 modulation chain

Not yet built: grinding, inventory management, survival/clutch, outbound chat,
and the archetype observer that feeds L2 live data (the counter table is wired but
`b.archetype` stays empty until phase 10).

### How the three learning levels combine

`selectTactic` scores every tactic in `data/tactics.json`:

```
utility = combineUtility(base, pro, l1Mod, l2Mod, l3Mod)
```

- `l1Mod` = `skillMod(opponentSkill, risk)` — a strong opponent penalises risky play
- `l2Mod` = `counterWeights(archetype)[tactic] - 1` — style counter
- `l3Mod` = bandit bonus, clamped, zero during cold start

Each is clamped to a 0.5–2.0 factor, so no layer can dominate.

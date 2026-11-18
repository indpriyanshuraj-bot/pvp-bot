# PvP Practice Bots v2.9 — Code Recovery & Scripting-API Audit

**Subject:** `PvP_Practice_Bots.mcaddon` (502 KB, 90 files)
**Repo:** `indpriyanshuraj-bot/pvp-bot` — empty (only `README.md`, `LICENSE`, `.gitignore`); **not modified**
**Audit date:** 18 November 2026
**Compared against:** `@minecraft/server` 2.11.0 (stable) / 2.13.0-beta, `@minecraft/server-ui` 2.3.0, `@minecraft/server-gametest` 1.0.0-beta, Minecraft 1.26.x

---

## 1. Verdict

**The addon is structurally valid and safe, but it is not currently valid against the live scripting APIs.**

- **Integrity — pass.** Every JSON file parses, both manifests are well-formed with unique UUIDs, all 11 `.mcstructure` files are valid NBT and every one is referenced by the kit registry, and all 10 skin textures exist and are wired to the render controller correctly.
- **Code quality — high.** All 57 scripts parse as ES modules; every relative import resolves; every named import matches a real export. The code is not a throwaway: it is a genuinely engineered addon (a ~90-method bot engine, per-kit combat AI, an online reinforcement-learning agent, an action recorder/player, a duel tournament system, and a bot export/import codec).
- **Safety — clean.** No `fetch`, `XMLHttpRequest`, `eval`, `new Function`, dynamic `import()`, or any embedded URL. Nothing phones home. The obfuscation is commercial IP protection, not malware concealment.
- **API currency — fail.** The pack was written against the 1.x scripting API and still declares `"version": "beta"` for its dependencies. It now resolves to a **2.x** engine, and four classes of breakage follow (§6). The worst is silent: bot knockback — the thing that makes PvP feel like PvP — no longer does anything.

So: *"is it valid?"* — **valid as a package, broken as a running addon on current Minecraft.** It needs a compatibility pass before it will behave as designed.

---

## 2. Identity

| Field | BP | RP |
|---|---|---|
| Name | PvP Practice Bots (v2.9) | PvP Practice Bots RP (v2.9) |
| UUID | `91ca95dd-d7da-4d76-9c17-c2bc271e422f` | `99976e18-248c-44a9-a948-96db469839b1` |
| Version | 2.9.0 | 2.9.0 |
| `min_engine_version` | `[1, 21, 120]` | `[1, 21, 120]` |
| `format_version` | 2 | 2 |
| Author | petstorebuft | petstorebuft |
| Built with | Bridge 2.7.54, dash 0.11.7 | same |

**Dependencies (BP):**

```
@minecraft/server           "beta"
@minecraft/server-gametest  "beta"
@minecraft/server-ui        "beta"
```

`@minecraft/server-gametest` has **never shipped a stable release** — it exists only as `1.0.0-beta`. Because `spawnSimulatedPlayer()` is the entire foundation of this addon (every bot is a `SimulatedPlayer`), **the Beta APIs experiment toggle is a hard requirement**, not a choice. That is inherent to the design, not a defect, but it caps the audience to worlds with experiments enabled and makes the addon permanently exposed to beta churn.

---

## 3. What it actually does

Bots are spawned as `SimulatedPlayer` instances named `§p§b§rPVP_bot`. They are real player entities, so they have inventories, health, hunger, shields and equipment — but they are driven entirely by script.

- **Six AI kits** — `sword`, `axe`, `mace`, `uhc`, `crystal`, `cart`. Each has a dedicated decision function (`DecisionManager.<kit>`) that picks a tactic from a weighted, per-bot "style" rotation, so two bots of the same kit do not behave identically.
- **Eleven gear kits** — Sword, Axe, Mace, UHC, Diamond Pot, Netherite Pot, Diamond SMP, Netherite SMP, Mace SMP, Crystal, Cart — each shipped as a `.mcstructure` and applied via `world.structureManager`.
- **A custom-bot builder** — players author their own bots in-game with 30+ conditions (`Health`, `HasItem`, `TargetInAir`, `LineOfSight`, `ArmorDurability`, `Chance`, …) and 20+ actions (`Attack`, `AxeAttack`, `PearlTowards`, `ShootBow`, `Strafe`, `Flee`, …).
- **An ML layer** — a 26-feature online learner per kit (health ratio, distance, relative velocity, sprint state, facing dot-product, combo counter, shield states, liquid traps, difficulty, …) using softmax action selection over a weight vector, with reward shaping, replay buffers, curriculum difficulty and a self-play auto-train mode. It persists to chunked dynamic properties.
- **Recording & playback** — record a player's real fight, then replay it through a `SimulatedPlayer` at a chosen speed.
- **Duels** — multi-round arenas with scoring, challenge requests, admin tooling and automatic cleanup.
- **Java-combat emulation** — an optional mode that fakes Java knockback, sweeping edge, shield mechanics and crit timing.
- **Bot sharing** — export a custom bot into an in-world "chamber" structure and import it from another world; a custom LZW + base64 + checksum codec packs it into entity data.

That is a lot of engineering for a practice-bot pack, and it explains the obfuscation.

---

## 4. Obfuscation and recovery

41 of 57 scripts were protected with **javascript-obfuscator (obfuscator.io)**:

- a rotated string array, each entry base64-encoded then `decodeURIComponent`-ed
- identifiers mangled to single letters, with per-file aliases (`const s = b;`, `const B = b;`)
- numeric literals expanded into arithmetic trees (`0x1b36+0x515-0x204a`)
- member access via computed string keys (`obj['getComponent'](...)`)
- 16 files shipped in the clear — notably `decision_manager.js`, `helpers.js`, `dynamic_store.js`, `kit_*`, `coords.js`, and most `commands/`

**Recovery method.** Per file I extracted the string-array function, the decoder and the rotation IIFE, executed them in a Node `vm`, then walked the AST replacing every `decoder(0xNN)` call — including calls made through aliases — with the decoded literal. Numeric trees were constant-folded, computed keys normalised, `!![]`/`![]` rewritten to `true`/`false`, the now-dead decoder machinery stripped, and everything run through Prettier.

**Result:**

| Metric | Value |
|---|---|
| Files recovered | 57 / 57 |
| String literals substituted | **8,790** |
| Failed decodes | **0** |
| Numeric folds | 17,870 |
| Recovered readable lines | **14,461** |
| Files still parsing | 57 / 57 |
| Imports that resolve | all |
| Named imports matching real exports | all |

The recovered tree is delivered as `PvP_Practice_Bots_v2.9_deobfuscated.zip`, and a rebuilt, readable `.mcaddon` is delivered alongside it. The rebuild is byte-complete against the original apart from one 0-byte dead file (`commands/index2.js`) that nothing imports.

---

## 5. Architecture

```
main.js ──┬── dynamic_store.js      chunked world props (>30 KB values, 30 KB chunks)
          ├── helpers.js            inventory capture/restore, item & potion building
          ├── bots/bots.js          the tick loop + per-kit AI + action executor
          ├── java_combat/shield.js shield handling
          └── recording/record.js   recording UI

bots/bot_manager.js   BotManager — ~90 methods (attack, pearl, pot, cart, web, shield,
                      crit, strafe, stuck-recovery, aim solving, target scanning)
bots/decision_manager.js  per-kit tactic selection (sword/axe/mace/uhc/crystal/cart)
bots/humanizer.js     aim smoothing, clear-shot raycasting, stuck detection, sprint-reset
bots/ml_system.js     online RL: 26 features, softmax, replay, rewards, curriculum
bots/bot_builder.js   custom-bot authoring (conditions/actions DSL)
bots/bot_share.js     export/import codec (LZW + base64 + checksum)
duels/duel_system.js  arena, rounds, scoring, requests
recording/*           record + SimulatedPlayer playback
commands/             25 commands registered as pb:<name> via customCommandRegistry
```

The addon registers **25 slash commands** under the `pb:` namespace (`/pb:spawnbot`, `/pb:duel`, `/pb:kit`, `/pb:settings`, `/pb:mltrain`, …) through `system.beforeEvents.startup` → `customCommandRegistry`. That part is modern and correct.

---

## 6. API audit — what is broken

I typechecked the recovered source against the real `@minecraft/server` 2.11.0 definitions and then verified each hit against the published changelog and type declarations.

### 6.1 `Entity.applyKnockback` — wrong signature (critical, silent)

`@minecraft/server` 2.0.0 changed this function. Current signature:

```ts
applyKnockback(horizontalForce: VectorXZ, verticalStrength: number): void
```

The addon still uses the removed v1 form `(directionX, directionZ, horizontalStrength, verticalStrength)`.

| File | Line | Purpose |
|---|---|---|
| `bots/bot_manager.js` | 229 | `applyJavaKnockback` — the main hit knockback |
| `bots/bot_manager.js` | 2212 | stuck-escape impulse |
| `bots/bot_manager.js` | 2459 | shield bash |
| `bots/bot_manager.js` | 2874 | `botSpearLunge` |
| `java_combat/java_combat_support.js` | 28 | Java-combat knockback emulation |
| `java_combat/java_manager.js` | 33 | sweeping-edge knockback |

Every one of these is wrapped in `try { … } catch {}`. So on a 2.x engine they **throw and are swallowed** — no error reaches the player, and the bot simply never applies knockback. Sprint-reset, W-tap, spear lunges and Java-combat feel all silently degrade. This is the single most damaging drift in the pack because it fails quietly.

**Fix:** `entity.applyKnockback({ x: dx * strength, z: dz * strength }, verticalStrength)`.

### 6.2 `GameMode` enum values renamed (critical)

v2.0.0 renamed the members: `survival` → `Survival`, `adventure` → `Adventure`, `creative` → `Creative`, `spectator` → `Spectator`. The lowercase names are gone, so `GameMode.survival` is now `undefined`.

| File | Line | Value passed |
|---|---|---|
| `commands/spawnbot.js` | 192 | `GameMode.survival` |
| `commands/mlspawn.js` | 113 | `GameMode.survival` |
| `duels/duel_system.js` | 275 | `GameMode.survival` |
| `bots/ml_system.js` | 692 | `GameMode.survival` |
| `recording/playback_manager.js` | 59 | `GameMode.adventure` |
| `recording/playback_manager.js` | 169 | `GameMode.adventure` |

All six feed `spawnSimulatedPlayer(location, name, gameMode)`, where `gameMode` is a **required** parameter. Passing `undefined` either throws `EngineError` or falls back to an unintended mode — either way the spawn path is unreliable, and `/pb:spawnbot`, `/pb:mlspawn`, duel setup and playback are all downstream of it. Unlike 6.1 this is *not* wrapped in `try/catch` at the call site, so a throw takes the whole command out.

### 6.3 Dead duplicate command registration in `main.js`

`main.js:116–155` registers every command a **second time**, bypassing the working framework in `command_structures/commandRegister.js`:

```js
for (const d of commandRegistry) {
    const f = '' + COMMAND_PREFIX + d.data.name,      // d.data is undefined
          h = [...(d.data.mandatoryParameters ?? []), ...],
          i = d.data.enums ?? new Map();
    ...
    c.customCommandRegistry.registerCommand({ name: f, …, options: h }, …);
}
```

Two independent faults:

- The registry entries are plain `{ name, description, usage }` objects — there is no `.data` property on any of them. `d.data.name` throws `TypeError` immediately, caught by the surrounding empty `catch`, for all 26 entries.
- Even if it reached `registerCommand`, `options` is not a field of `CustomCommand`. The real fields are `mandatoryParameters` and `optionalParameters` (confirmed in the 2.11.0 `.d.ts`).

So the block is **dead code that has never registered anything**. Commands work only because `commandRegister.js` does the job properly on its own. Also in that block, `origin.sourceInitiator` (line 143) is not a member of `CustomCommandOrigin` — it exposes `initiator`, `sourceEntity`, `sourceBlock`, `sourceType`.

**Fix:** delete the block. It is redundant and misleading.

### 6.4 `defaultValueIndex` on a toggle

`recording/record.js:44` passes `{ defaultValueIndex: true }` to `f.toggle(...)`. `ModalFormDataToggleOptions` only has `defaultValue: boolean`. The "Delete this recording?" toggle therefore always opens off. (The ~11 other `defaultValueIndex` uses are on `dropdown()` calls, where that field is correct — those are fine.)

### 6.5 Not broken, but worth knowing

Everything else in the surface checked out against 2.11.0: `world.getDynamicProperty`, `world.structureManager`, `dimension.runCommand/playSound/spawnParticle/getBlock/getEntities/spawnItem/setBlockType`, `entity.getEffect/applyDamage/getVelocity/clearVelocity/lookAt/teleport/getViewDirection/triggerEvent`, `Potions.getAllEffectTypes/getAllDeliveryTypes/resolve`, `EnchantmentTypes.get`, `ItemTypes.get`, `system.run/runTimeout/runInterval/clearRun/currentTick`, `system.beforeEvents.startup`, `customCommandRegistry.registerEnum/registerCommand`, `world.afterEvents.worldLoad`, `world.beforeEvents.entityHurt` (still present — it was *not* removed in 2.0.0), and the whole `SimulatedPlayer` API. `isValid` is already used as a property throughout, which is the v2 form.

One deliberate deviation: `main.js` **monkeypatches the engine** —

```js
world.getPlayers = function (c) { return filterBots(getPlayers(c)); };
world.getAllPlayers = …;
world.getRawPlayers = getPlayers;   // outside the try/catch
```

This makes bots invisible to `world.getPlayers()` for *every* script in the world, including other packs. It works today (instances are not sealed), but it is a global side effect and a fragile assumption; the last line sits outside the `try` block, so if the engine ever seals `World` the pack dies at module load. Worth replacing with an explicit `getBots()`/`getRealPlayers()` pair in the rewrite.

---

## 7. Non-API defects

- **Five missing UI textures.** `exports.js` gives five kits icons at `textures/ui/diaPot`, `textures/ui/nethPot`, `textures/ui/diaSMP`, `textures/ui/nethSMP`, `textures/ui/maceSMP`. The resource pack ships only `textures/entity/skins/*.png`. Those five menu buttons render with a missing-texture placeholder.
- **`entities/player.json` pins the whole vanilla player.** Overriding `minecraft:player` requires re-declaring every component, and this file does so at `format_version 1.21.0` with 23 components. Any player component added to vanilla after that snapshot is silently absent. It is the standard technique, but it makes the pack a permanent maintenance liability — it must be re-synced each release.
- **Two command-registration paths.** `commandRegister.js` (correct) and `main.js` (dead). Only one should exist.
- **`commands/index2.js`** is 0 bytes and imported by nothing.
- **`recording/record.js:37`** overwrites its own `e` parameter (`e = 3;`) — harmless but clearly leftover.
- **Heavy `§` formatting in identifiers.** Bot names and tags embed section-sign colour codes (`§p§b§rPVP_bot`). It works, but it makes name matching brittle and leaks into logs and command output.

---

## 8. Security review

| Check | Result |
|---|---|
| Network egress (`fetch`, `XMLHttpRequest`, sockets) | none |
| `eval` / `new Function` / dynamic `import()` | none |
| Embedded URLs or telemetry | none |
| Filesystem / process access | none (`require`, `process` absent) |
| Dynamic property exfiltration | none — data stays in the world |
| Hidden payloads behind the obfuscation | none found; decoded to 8,790 ordinary strings |

The obfuscation protects the author's logic (and the ML weights), not a payload. **No safety concern.**

---

## 9. Recommendations for the rebuild

If the new addon on this repo is meant to carry this feature set forward, the order of work is:

1. **Pin explicit versions instead of `"beta"`.** Use `@minecraft/server` `2.11.0` and `@minecraft/server-ui` `2.3.0` so the pack cannot silently drift into a future breaking release. `@minecraft/server-gametest` has no choice but `1.0.0-beta` — document the Beta APIs requirement prominently.
2. **Fix `applyKnockback`** to the `(VectorXZ, number)` form at all six sites. Do it first: it is the highest-impact, lowest-effort fix, and it is currently invisible because of the `catch {}` wrappers.
3. **Fix `GameMode.Survival` / `GameMode.Adventure`** at all six sites, and add a guard so a failed spawn surfaces a message instead of vanishing.
4. **Delete `main.js`'s registration block** and keep `commandRegister.js` as the single path; switch to `mandatoryParameters`/`optionalParameters` if you ever register directly.
5. **Add the five missing `textures/ui/*` icons** or drop the custom icons for vanilla item textures.
6. **Decide about the `minecraft:player` override.** If you keep it, generate it from the current vanilla definition each update rather than hand-maintaining it; if you can, isolate bot behaviour so the override is not needed at all.
7. **Replace the `world.getPlayers` monkeypatch** with explicit accessors.
8. **Reconsider `defaultValueIndex` on the toggle** in `record.js`.

The recovered source is a clean starting point for all of this: it is readable, fully validated, and structurally identical to the shipped pack, so behaviour can be changed deliberately rather than guessed at.

---

## 10. Deliverables

| File | Contents |
|---|---|
| `PvP_Practice_Bots_v2.9_deobfuscated.zip` | Full recovered source tree + `README.md` documenting the recovery |
| `PvP_Practice_Bots_v2.9_clean.mcaddon` | Rebuilt pack (BP + RP) with the readable source, drop-in equivalent to the original |
| `ANALYSIS.md` | This report |

The repository `indpriyanshuraj-bot/pvp-bot` was **read only** — nothing was written to it.

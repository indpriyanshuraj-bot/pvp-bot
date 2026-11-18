# PvP Practice Bots v2.9 — Recovered Source

This folder is the **deobfuscated, human-readable reconstruction** of the
`PvP_Practice_Bots.mcaddon` behaviour pack that shipped as obfuscated
JavaScript.

## What changed vs. the original

| | Original | Recovered |
|---|---|---|
| Files | 57 `.js` (41 obfuscated) | 57 `.js` (0 obfuscated) |
| Readable lines | ~0 | 14,461 |
| String literals | hidden in a rotated, base64+URI-encoded array | 8,790 inlined as real literals |
| Numbers | `0x1b36+0x515-0x204a` style | 17,870 constant-folded |
| Method names | `obj['getComponent'](...)` | `obj.getComponent(...)` |
| Class methods | `['botAttack']() {}` | `botAttack() {}` |

Behaviour is intended to be **identical**. The only transformations applied were
semantics-preserving: string-literal substitution from the pack's own decoder
(executed in a VM), constant folding, `!![]` → `true` / `![]` → `false`,
computed-key → identifier, and Prettier formatting. The obfuscator's decoder
machinery was then removed.

## How it was recovered

1. Every obfuscated file is `javascript-obfuscator` (obfuscator.io) output:
   a string array + rotation IIFE + base64/`decodeURIComponent` decoder, with
   local aliases (`const s = b; const B = b;`).
2. The decoder, array function and rotation were extracted per file and executed
   in a Node `vm` to build an index → string map.
3. All `decoder(0xNN)` call sites (including through aliases) were replaced with
   the decoded literal. **0 lookups failed** across all 57 files.
4. Numeric expression trees were constant-folded; computed member/method keys
   were normalised; Prettier formatted the result.

## Validation performed

- All 57 files parse as ES modules.
- Every relative import resolves to an existing file.
- Every named import matches a real export in the target module.
- All JSON in the pack is valid.
- No network calls, `eval`, `new Function`, dynamic `import()`, or remote URLs.

## Layout

```
main.js                     entry point (manifest)
dynamic_store.js            chunked world dynamic-property store (>30 KB values)
helpers.js                  inventory capture/restore, item building, potion resolve
exports.js                  KIT_REGISTRY, WEAPON_STATS, SHULKER_PRESETS (data)
kit_system.js               structure save/load + kit application
kit_apply.js                give-kit / wait-until-ready / slot swap
kit_manager.js              custom kit CRUD + menu
kit_defaults.js             shipped-structure probing
skins.js                    skin slot resolution via entity events
command_structures/         custom-command registration framework
commands/                   25 slash commands (pb:<name>)
bots/
  bot_manager.js            BotManager — ~90 methods, the core engine
  bots.js                   tick loop, per-kit AI, action execution
  decision_manager.js       per-kit tactic selection
  humanizer.js              aim smoothing, pathing, stuck/jump/sprint-reset
  ml_system.js              26-feature online RL agent (softmax + replay)
  mlSettingsManager.js      ML tunables
  tuning.js                 global tuning values
  bot_builder.js            custom-bot authoring UI (conditions/actions)
  bot_share.js              bot export/import codec (LZW + base64 + checksum)
  bot_share_ui.js           export/import chambers built in-world
  bot_settings.js           settings form
  inv_cache.js              inventory read caching
  coords.js                 coordinate parsing/formatting
duels/
  duel_system.js            arena/round/score engine, requests, scoring
  duel_ui.js                duel menus
recording/
  recording_manager.js      action recording
  playback_manager.js       playback via SimulatedPlayer
  record.js                 recording UI
java_combat/                Java-edition combat emulation (knockback, sweeping edge, shields)
```

## Known issues (carried over from the original, not introduced by recovery)

The recovered code is a faithful copy, so the original's API drift is intact.
See `ANALYSIS.md` for the full audit. The four that matter:

1. `Entity.applyKnockback` is called with the removed 4-argument v1 signature
   (6 sites) — silently fails on `@minecraft/server` 2.x.
2. `GameMode.survival` / `GameMode.adventure` — enum values were renamed to
   `Survival` / `Adventure` in v2.0.0 (6 sites).
3. `main.js` has a dead duplicate command-registration block (uses a `d.data`
   shape that no command module exports).
4. `recording/record.js` passes `defaultValueIndex` to a *toggle* instead of
   `defaultValue`.

## Notes

- `commands/index2.js` was a 0-byte file imported by nothing; it is omitted here.
- The pack requires the **Beta APIs** experiment: `@minecraft/server-gametest`
  only exists as `1.0.0-beta`, and the manifests request `"version": "beta"`.

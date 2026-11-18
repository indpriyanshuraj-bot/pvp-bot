# pvp-bot

Working repository for the PvP Practice Bots rebuild.

**This branch — `recovered/v2.9` — is analysis and reference only.** It holds the
recovered source of the shipped v2.9 addon plus the audit that explains what must
change before a new addon is built. `main` is untouched.

## Contents

| Path | What it is |
|---|---|
| `docs/ANALYSIS.md` | Full audit: validity, security, obfuscation recovery, and the scripting-API breaks |
| `docs/ML-SYSTEM.md` | How bots decide, how the learner works, every ML setting, and the custom-bot rule engine |
| `docs/PLAN.md` | **v3 architecture plan** — capability-driven design, API reality check, build phases |
| `docs/DECISIONS.md` | **Systems decisions** — NLP, 3-level learning, watchdog governor, break detection, control layer, pro GUI |
| `reference/v2.9/` | The deobfuscated v2.9 behaviour-pack source (57 files, ~14.5k readable lines) |
| `reference/v2.9/README.md` | How the deobfuscation was done and what was validated |
| `dist/` | Rebuilt `.mcaddon` (readable source) and the source archive |
| `tools/` | The deobfuscation and validation scripts used to produce `reference/v2.9/` |
| `addon/` | **v3 addon source** — TypeScript, bundled to a behaviour pack, with offline tests and in-game gametests |

## Headline findings

- The addon is structurally sound and safe — no network calls, no `eval`, no hidden payload.
- It was protected with javascript-obfuscator; 41 of 57 scripts were obfuscated. All recovered with 0 unresolved string lookups.
- It was written against the 1.x scripting API and still declares `"version": "beta"`, so it now runs against a 2.x engine. Four classes of breakage follow; see `docs/ANALYSIS.md` §6.
- Highest-impact defect: `Entity.applyKnockback` uses the removed 4-argument signature at six call sites, each wrapped in `catch {}`, so bot knockback fails silently.
- `@minecraft/server-gametest` has no stable release, so Beta APIs are a hard requirement for this design.

## Status

- [x] Recover and audit v2.9
- [ ] Compatibility pass on the recovered source
- [x] Plan v3 architecture (`docs/PLAN.md`)
- [x] Decide systems (`docs/DECISIONS.md`)
- [x] Build phase 0–1: toolchain, controls, perception, planner, governor, break detection, NLP, all three learning levels
- [ ] Build phases 2–11 (movement, combat tactics, grind, inventory, survival, social, pro GUI polish)

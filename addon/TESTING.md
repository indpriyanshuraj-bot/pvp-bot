# Testing Guide

Everything here is written so you can confirm or break each subsystem in a few
minutes, in the order that isolates failures fastest.

**Read this first:** nothing in this pack has ever run in a world. The logic has
228 passing unit tests, but no `SimulatedPlayer` has executed `moveRelative`,
`attackEntity`, `breakBlock` or `chat` yet. Expect the first session to find
integration bugs — that is the point of it.

---

## 0. Setup

1. Build the pack:
   ```bash
   cd addon
   npm install
   npm run build -- --with-tests     # or: node scripts/build.mjs --with-tests
   ```
   Output is `addon/dist/BP`. Zip it (or the parent of `BP`) as a `.mcpack`/`.mcaddon`.

2. Create a test world with:
   - **Beta APIs** experiment **ON** — required, `@minecraft/server-gametest` has
     no stable release. This works on the **normal release build** of Minecraft;
     you do **not** need the Preview app.
   - **Cheats ON**
   - Difficulty: Normal, or anything; it does not matter for the bot logic

   To turn it on: *Create New World → Experiments → scroll to **Beta APIs** → on*.
   For an existing world: *Edit world → Experiments*.

   The pack ships **no resource pack** — it is a behaviour pack only, so you
   activate it under *Behaviour Packs*, not *Resource Packs*.

3. Install the pack, enable it on the world, load in.

If the world loads and you see nothing in chat, that is **correct** — the pack
prints nothing at startup except a `[PvP Bots v3] ready` line to the content log.

---

## 1. Smoke test — 60 seconds

This proves the module loaded and commands registered.

```
/pvb:info
```

**Expected:** `Bots: 0 | governor: OK`

- If the command does not exist → the script module failed to load. Check the
  content log for a red error; the most likely cause is Beta APIs being off.
- If it exists but prints `governor: DEGRADE` or `EMERGENCY` with zero bots →
  something else in the world is eating the tick budget. That is a real finding.

---

## 2. In-game gametests

These run the engine layer directly, with no bot AI involved. They are the
fastest way to find out whether the control layer works at all.

```
/gametest run pvb:inputMovesBot
/gametest run pvb:inputTurnsBot
/gametest run pvb:inputRespectsBudget
/gametest run pvb:registryTracksBots
/gametest run pvb:registryDropsDeadBots
```

| Test | What it does | Expected |
|---|---|---|
| `inputMovesBot` | spawns a bot, calls `move(1)` once, waits 20 ticks | **passes** if the bot moved more than 0.5 blocks |
| `inputTurnsBot` | aims at a point behind the bot | **passes** if yaw changed by more than 30° |
| `inputRespectsBudget` | fires 20 move intents in one tick with a budget of 3 | **passes** if the bot moved less than 1 block |
| `registryTracksBots` | adds a bot to the registry | **passes** if the count incremented |
| `registryDropsDeadBots` | disconnects a bot, then prunes | **passes** if the bot was removed |

**Likely failure and the fix:** GameTest normally needs a structure to run in.
These tests do not declare `.structureName(...)`, so if every test errors with
something like *"structure not found"* or the tests simply do not appear in
`/gametest runthis`, add a structure:

```ts
// gametests/input.mc.ts
.maxTicks(200).tag('pvb').tag('input').structureName('gametests:mediumglass')
```

Then rebuild. That is a packaging detail, not a logic failure.

**What each result tells you:**

- `inputMovesBot` fails → `SimulatedPlayer.moveRelative` is not moving the bot.
  Everything else in the pack is downstream of this. Stop and fix here.
- `inputMovesBot` passes, `inputTurnsBot` fails → the angle math in
  `Input.lookAt` is wrong (likely a yaw sign).
- `inputRespectsBudget` fails → the per-tick budget is not enforced, which means
  the governor cannot protect the server.

---

## 3. Behaviour tests

### 3.1 Spawn

```
/pvb:spawn normal
/pvb:info
```

**Expected:** a bot named `§bPVPBot` appears at your feet; `/pvb:info` now reports
`Bots: 1`.

Bots spawn with **empty inventories**. Until you give them gear, they fight with
fists — which is why the next step exists.

### 3.2 Gear

```
/pvb:kit
```

**Expected:** `Kit given to the nearest bot.` The bot now has a diamond sword,
shield, 8 gapples, 16 pearls, 64 cobblestone, 16 golden carrots and full diamond
armour.

You can verify visually by looking at the bot, or run `/pvb:kit` twice and
confirm it does not error.

### 3.3 Combat — the real test

Stand ~10 blocks from the bot and do nothing.

**Expected sequence:**
1. Bot turns to face you
2. Bot walks toward you
3. Bot stops at roughly 3 blocks (weapon reach) and starts strafing side to side
4. Bot attacks when you are in reach, roughly every 5–13 ticks depending on the
   pro profile
5. You take damage

**What each failure means:**

| Symptom | Most likely cause |
|---|---|
| Bot never turns or moves | `inputMovesBot` failed; control layer |
| Bot walks to you but never swings | `planCombat` reach check, or `attackEntity` needs the entity in the bot's line of sight |
| Bot swings but you take no damage | `attackEntity` is being rejected — check the bot is in Survival and the swing is within reach |
| Bot stands still at range | `target.distance` is wrong; check `snapshotTarget` |
| Bot jitters between approaching and backing off | the 0.9× reach band is too narrow; widen it in `planApproach` |

### 3.4 Eating

Hurt the bot down to about 6 hunger (feed it rotten flesh, or wait). With golden
carrots in slot 8:

**Expected:** the bot stops fighting, selects the food slot, eats, then resumes.

If it keeps fighting while starving → `chooseFood` returned null or the `EAT`
goal never outscored `FIGHT`. Run `/pvb:info` to confirm the governor is not in
`DEGRADE` (which disables grinding and chat, and slows thinking).

### 3.5 Trust — the accident test

This is the behaviour you specifically asked for, and it is easy to verify.

1. Spawn a bot, gear it, let it approach.
2. Hit the bot **once, lightly** (a tap, not a crit).
3. Run `/pvb:trust`.

**Expected:** your id listed with trust around **−5** and `§7neutral`.

4. Hit it again **within 10 seconds**.
5. Run `/pvb:trust` again.

**Expected:** trust around **−30** and `§chostile`. Repetition converts an
accident into intent.

6. Leave it alone for a minute and re-check.

**Expected:** trust drifts back toward 0.

### 3.6 Pro level

```
/pvb:pro
```

**Expected:** a form titled `Pro Level` with four sliders (Master, L1 Opponent
Reading, L2 Pattern Counter, L3 Global Learning) and three more (reaction, aim
error, clicks per second).

Set **L3 to 0** and confirm the bot still fights normally — that proves the
learned layer can be removed without breaking anything.

```
/pvb:pro easy
/pvb:spawn easy
```

**Expected:** a visibly worse bot — slower reactions, wider aim error, fewer
clicks per second.

### 3.7 Grinding

Spawn a bot with no target nearby and stand next to some stone or ore.

**Expected:** the bot walks to a nearby mineable block and breaks it.

**Expected failure (this is the interesting one):** build a wall of **bedrock**
or use a protected area. The bot should try, fail, retry once, and then stop
trying that block type. If it keeps hammering the same block forever, the
`NEEDS_RETRY` → `UNBREAKABLE` transition is broken.

### 3.8 Chat

Let the bot fight you down to low health.

**Expected:** within ~30 seconds the bot says something factual, like
`Steve, you're on 4 — come on`, using your actual name and health.

Chat is heavily rate-limited: 600 ticks (30 s) per trigger, plus a global
cooldown. Silence is the normal state — a bot that talks constantly would be a
bug.

---

## 4. Cleanup

```
/pvb:clear
```

**Expected:** `Removed N bot(s).` and `/pvb:info` reports `Bots: 0`.

---

## 5. Things that will look like bugs but are not

| Looks wrong | Why it is correct |
|---|---|
| Bot fights with fists | it spawns with no inventory — run `/pvb:kit` |
| Bot ignores you when your trust is above 40 | trusted targets score `FIGHT = 0` by design |
| Bot does not chase far | it only targets players within the governor's snapshot radius (24 blocks normally, 10 when throttled) |
| Chat is rare | three cooldown tiers plus a chance roll per trigger |
| Bot does not attack creative players | `scoreGoals` requires the target to be in Survival |
| Bots do not fight each other | bot-vs-bot is excluded from the target scan and from trust |
| `governor: WARN` with many bots | expected; it is throttling to protect your TPS |

---

## 6. Troubleshooting: version errors

There are three completely different errors that all look like "version
problems". Which one you get tells you what to fix.

### 6.1 `unsupported version: no parser available for version X`

Example: `[Lighting][error]-unsupported version: no parser available for version 1.26.30`

**This is not about the pack's `min_engine_version`, and not about script module
versions.** It comes from a *subsystem parser* — note the bracketed prefix
(`[Lighting]`, `[Blocks]`, `[Textures]`) telling you which one — that tried to
read a JSON file declaring a `format_version` it has no parser for.

**It cannot come from this pack.** The pack contains no content JSON at all:
just `manifest.json` (`format_version: 2`), `texts/languages.json` (an array), and
`.lang` files. There is nothing in it that declares a game format version.

If you see this with only this pack installed, the source is another pack in that
world, or vanilla content — not this add-on.

**To confirm quickly:** create a brand-new world, enable *only* this pack, and
load it. If the error is gone, it came from the other world's packs.

### 6.2 `Unsupported version` / the pack will not import at all

This one *is* the manifest. Either:
- `min_engine_version` is **higher** than your game version, or
- a dependency requests a module version your engine does not ship.

This pack declares `min_engine_version: [1, 21, 90]` and dependencies
`@minecraft/server 2.0.0`, `@minecraft/server-ui 2.0.0`,
`@minecraft/server-gametest beta`. All of those are satisfied by any 2.x engine,
so import should succeed on 1.21.90 and later.

If it still refuses, delete any previously imported copy of "PvP Bots v3" from
*Settings → Storage* first — a duplicate UUID blocks the import.

### 6.3 The world loads but no `pvb:` commands exist

The script module did not load. In order of likelihood:

1. **Beta APIs is off.** `@minecraft/server-gametest` only exists as a beta
   module; without the experiment the whole script fails to import.
2. **You activated the pack as a resource pack.** It is a behaviour pack.
3. **Scripting is disabled** on the world (server setting).

Check the content log — there will be a red `[Scripting]` error naming the cause.
Turn on *Settings → Creator → Enable Content Log GUI* to read it in-game.

### 6.4 Reading the content log

Enable the Content Log GUI, then reproduce. The prefix in brackets is the
subsystem, and that is the single most useful piece of information:

| Prefix | Means |
|---|---|
| `[Scripting]` | our JavaScript — a real bug, send it to me |
| `[Lighting]` / `[Textures]` | a resource pack (we ship none) |
| `[Blocks]` / `[Items]` / `[Entity]` | content JSON (we ship none) |
| `[Pack]` | manifest / import problem — see 6.2 |

---

## 7. Reporting a problem usefully

For anything that fails, this is what makes it fixable in one pass:

1. The exact command sequence
2. What you expected vs what happened
3. `/pvb:info` output at the time (it tells me the governor tier)
4. Any red text from the content log
5. If it is a gametest, the full failure message

With those, the fix is usually a single function, and it can be covered by a new
unit test before the next build.

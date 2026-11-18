# Systems Decisions — NLP, Learning, Watchdog, Break Detection, Controls, Pro GUI

Concrete choices for the v3 build, with the reasoning and the API evidence behind
each. Read alongside `PLAN.md`.

Verified against `@minecraft/server` 2.11.0 (stable) and 2.13.0-beta,
`@minecraft/server-gametest` 1.0.0-beta, `@minecraft/server-ui` 2.3.0.

---

## 0. Toolchain decision (needed before anything else)

You are writing TypeScript, but Bedrock loads **one entry file** and resolves
relative imports at runtime. So:

- **Write TS in `src/`, bundle to a single `scripts/main.js` with esbuild.**
  `esbuild src/main.ts --bundle --format=esm --outfile=dist/scripts/main.js`
- `@minecraft/server` and friends are **external** (`--external:@minecraft/*`) —
  the engine provides them, never bundle them.
- Type-check with the real definitions so API drift is caught at build time, not
  in-game (this is exactly the class of bug that broke v2.9).
- Data files stay as `.json` inside the pack and are imported by path, **not**
  inlined into the bundle, so they can be edited without rebuilding.

Everything below assumes this pipeline.

---

## 1. NLP: what to use

> **Priority note (agreed):** NLP is **not** a priority feature. It only needs to
> be good enough to *take* what a player says and answer plausibly — a small
> keyword intent matcher, not a conversation engine. Do not expand it further;
> spend the effort on combat, movement and survival instead. The design below is
> already sized for "basic", so nothing needs to be removed.

### Decision

**Do not vendor a full NLP library. Build a ~350-line rule-based pipeline, and
vendor only the Porter stemmer.**

### Options considered

| Library | Verdict |
|---|---|
| `spencermountain/compromise` (MIT) | Only genuinely viable full option — pure JS, no deps. But ~1.5–2 MB, and it parses *sentences*; our input is a 6-word Minecraft chat line. Rejected on bundle size and load time. |
| `winkjs/wink-nlp` (MIT) | Needs external model files (multi-MB). Rejected. |
| `NaturalNode/natural` (MIT) | Node-oriented; the full lib pulls `fs`/`stream` which do not exist in Bedrock. **But** its `PorterStemmer` and `tokenizer` are self-contained — vendor those two files. |
| Neural anything | No network, no weight budget, non-deterministic. Rejected outright. |

### The pipeline

```
raw chat
  → normalise      lowercase, strip punctuation/colour codes, collapse "sooo" → "so"
  → expand slang   u→you, pls→please, ez→easy, gg→good game, wya→where, 1v1→duel
  → tokenise       split on whitespace, drop stopwords
  → stem           Porter (vendored, ~120 lines, MIT)
  → extract slots  gazetteer: player names (live world list), item/block names (data),
                   numbers, coordinates
  → match intent   weighted keyword sets from data/chat-intents.json
  → confidence     if best < threshold → SILENCE (do not reply)
```

Intent scoring is deliberately simple — **coverage + specificity**, not TF-IDF:

```
score(intent) = Σ weight(keyword matched)
              / Σ weight(keyword in intent)      // coverage
              + 0.3 × distinctMatches / tokens   // specificity
```

`data/chat-intents.json` holds the keyword sets, so tuning is a data edit:

```jsonc
{
  "challenge": { "kw": { "duel": 3, "1v1": 3, "fight": 2, "come": 1 }, "reply": ["accept","decline"] },
  "insult":    { "kw": { "noob": 2, "ez": 2, "trash": 2, "bot": 1 },        "reply": ["ignore","taunt"] },
  "ask_help":  { "kw": { "help": 3, "how": 2, "what": 1 },                  "reply": ["explain"] },
  "greet":     { "kw": { "hi": 3, "hello": 3, "yo": 2, "sup": 2 },          "reply": ["greet"] }
}
```

### Why this beats a library here

- ~15 KB instead of ~2 MB; no measurable load cost.
- Every behaviour is one JSON edit away — you can fix a misclassification by
  prompting "add 'bet' to challenge keywords" instead of debugging someone else's
  parser.
- Deterministic. When a bot replies wrongly you can trace it in one read.

### Hard constraint

**Reading chat requires beta APIs.** `world.beforeEvents.chatSend` exists only in
2.13.0-beta; stable 2.11.0 does not have it. Sending works on stable via
`SimulatedPlayer.chat(msg)`. Since gametest already forces Beta APIs, this costs
nothing — but feature-detect it at load so the pack still runs on stable (chat
becomes outbound-only).

---

## 2. Learning: three levels

The three levels answer three *different* questions, which is why they must be
separate models rather than one big feature vector. With a single model and
limited data, none of them converges.

| Level | Question | Scope | Lifetime |
|---|---|---|---|
| **L1** | "How good is *this* player, right now?" | per opponent | decays in ~1 min |
| **L2** | "How does this player *fight*?" | per opponent | session |
| **L3** | "What generally *works* for me?" | global, per tactic | permanent |

### 2.1 L1 — opponent skill estimate

Six dimensions, each an EMA with a confidence counter:

| Dimension | Signal | Update |
|---|---|---|
| `aim` | their hit rate on us vs ours on them | Beta-Binomial posterior mean |
| `reaction` | ticks between our swing and their block/retreat | EMA, α 0.15 |
| `combo` | their max consecutive hits | running max, slow decay |
| `shieldUse` | fraction of our hits that met a raised shield | EMA |
| `healDiscipline` | do they eat below 8 HP, or too late | EMA |
| `movement` | strafe variance, jump timing quality | EMA of distance-keeping error |

```
skill_d  += α_d × (observed_d − skill_d)          // α 0.15 fresh, 0.05 settled
confidence_d = min(1, samples_d / 20)             // never trust 2 exchanges
skill = Σ w_d × skill_d × confidence_d / Σ w_d
```

**Decay:** every 20 s of no contact, `skill *= 0.9`. A player who was good five
minutes ago is not necessarily good now.

**Used by:** risk appetite (a high-skill opponent makes crystal PvP suicidal),
spacing preference, and how quickly the bot commits to a trade.

### 2.2 L2 — pattern recognition and counter-pick

This is the "little complex" level, so it gets its own module.

A 10-second rolling window produces behavioural *frequencies* (not skill):

```
attackRate · shieldTimePct · preferredDistance · jumpRate ·
pearlRate · crystalRate · potionRate · retreatHp · elytraUse · axeShare
```

Classify against **archetype centroids** in `data/archetypes.json` using cosine
similarity — no training needed, no gradient, fully inspectable:

| Archetype | Signature |
|---|---|
| `rusher` | high attackRate, low preferredDistance, low shield |
| `turtle` | high shieldTimePct, high retreatHp, low attackRate |
| `crystal_camper` | high crystalRate, medium distance, obsidian use |
| `potion_hoarder` | high potionRate, long fights |
| `mace_diver` | high jumpRate + elytra, vertical play |
| `axe_spammer` | high axeShare, close range, shield-breaking intent |

Output is a **distribution**, not a label — real players are 60 % rusher, 30 %
turtle. The counter table then blends:

```jsonc
{
  "rusher":        { "counter": { "shield_break": 1.4, "reach_keep": 1.3, "crystal_pvp": 0.6 } },
  "turtle":        { "counter": { "shield_break": 1.8, "crystal_pvp": 1.2, "sword_trade": 0.7 } },
  "crystal_camper":{ "counter": { "bow_pressure": 1.6, "pearl_in": 1.5, "sword_trade": 0.5 } }
}
```

Mixing is a weighted average over the distribution, so partial matches degrade
gracefully instead of flipping.

**Decay:** archetype weights decay 5 %/s, so a player who switches style is
re-read within ~20 s.

### 2.3 L3 — global tactic learning

A contextual bandit over tactics, **conditioned on situation only, never on the
opponent**. This is the layer that survives across fights and worlds.

- Features (~10): health delta, distance band, target airborne, target shielding,
  my shield state, combo, ammo, height delta, own threat, aggression.
- One weight vector per tactic; plain incremental update, ε-greedy.
- Hard quotas: `maxUpdatesPerMinute`, `maxSamples`.
- **Cold start:** under 50 samples for a tactic, its bonus is exactly 0, so
  behaviour is 100 % handwritten until there is real evidence.

### 2.4 How the three combine

Multiplicative modulation, each factor clamped, so no single layer can dominate:

```
u(tactic) = base(tactic)                              // data
          × clamp(1 + w1·skillMod(L1, tactic), 0.5, 2.0)
          × clamp(1 + w2·counterMod(L2, tactic), 0.5, 2.0)
          × clamp(1 + w3·learnedBonus(L3, tactic), 0.5, 2.0)
```

`w1/w2/w3` are exactly the three GUI sliders in §6. Setting a slider to 0 removes
that layer entirely without touching code.

**Why multiplicative:** each level *modulates* the base rather than replacing it.
A weak opponent raises aggression across the board; a turtle archetype specifically
raises shield-break; global learning nudges whatever has worked. Additive blending
would let a noisy L1 swamp a reliable L2.

---

## 3. Watchdog / slow-script governor

### What actually exists

`system.beforeEvents.watchdogTerminate` — **beta only**, with
`WatchdogTerminateBeforeEvent { cancel: boolean, terminateReason }` and reasons
`Hang` and `StackOverflow`.

This is the script engine's own health signal, not an anti-cheat. Two halves:

### 3.1 Proactive: measure yourself

Wrap the per-tick bot batch in `Date.now()`; keep a rolling window (60 samples) of
p50/p95 durations. Tiers:

| Tier | p95 | Response |
|---|---|---|
| OK | < 8 ms | — |
| WARN | 8–14 ms | `thinkTicks` 4 → 8 |
| DEGRADE | 14–22 ms | bots/tick 3 → 1, disable chat + grind + ML |
| EMERGENCY | > 22 ms | snapshot radius halved, query limits cut, idle bots parked |

Recovery is hysteretic: a tier only lifts after 10 s below **60 %** of its
threshold. Without that it oscillates.

### 3.2 Reactive: the watchdog event

```js
system.beforeEvents.watchdogTerminate.subscribe((ev) => {
    if (ev.terminateReason === 'Hang' && governor.canCancelOnce()) {
        ev.cancel = true;          // buy time
        governor.emergency();      // throttle everything, immediately
        log.warn('watchdog: Hang — throttled, pro level reduced');
    }
    // StackOverflow: do NOT cancel. The stack is already gone.
});
```

**Deliberate limits, and why:**

- **Cancel at most once per 5 minutes.** Cancelling repeatedly turns a
  recoverable stall into a permanently degraded server. The honest behaviour is
  to throttle once, and if it hangs again, let the engine do its job.
- **Never cancel `StackOverflow`.** The state is already corrupt; cancelling just
  hides it. Log and let it terminate.
- The governor also **lowers the effective pro level** while degraded (see §6), so
  a struggling server gets dumber bots instead of frozen ones.

This is the only place the pack is allowed to fight the engine, and it is bounded
by design.

---

## 4. Break detection: "is this map even breakable?"

### The problem

There is **no block-hardness API** (`BlockType` exposes only `id` and
`localizationKey`) and **no break-progress API**. So "it didn't break" has six
possible causes that must be told apart:

| Cause | Distinguisher |
|---|---|
| Still breaking, just slow | block changes before `2 × expectedTicks` |
| Wrong tool tier | our tool tier < required tier (data) |
| Mining fatigue | `getEffect('mining_fatigue')` present |
| Adventure / spectator mode | `getGameMode()` ≠ `Survival` |
| Unbreakable / protected | no change, correct tool, no fatigue, past timeout |
| Protection plugin | block *does* break, then reappears |

### The attempt protocol

```
1. precheck   gameMode · fatigue · tool tier vs data/blocks.json requiredTier
              → if any fails, classify immediately, don't swing
2. record     pos, typeId, tick0, tool, expectedTicks (hardness × toolSpeed)
3. swing      simPlayer.breakBlock(pos)
4. poll       each tick: still same typeId? changed? item dropped?
5. verdict    (see below)
```

`expectedTicks` comes from a **hardness table** in `data/blocks.json` — the honest
substitute for the missing API. It only needs entries for blocks the bot actually
targets, not all 900.

### Verdicts and actions

| Verdict | Condition | Action |
|---|---|---|
| `SUCCESS` | block changed | continue |
| `STILL_MINING` | within `2 × expectedTicks` | keep waiting, don't re-swing |
| `WRONG_TOOL` | tier too low, or no change + tier too low | swap tool once, retry |
| `FATIGUE` | effect present | wait it out, or drink milk |
| `ADVENTURE` | game mode not Survival | **abort all grinding**, report |
| `UNBREAKABLE` | no change, correct tool, no fatigue, past timeout, **and retry with best tool also failed** | blacklist type for session |
| `PROTECTED_REGION` | `UNBREAKABLE` twice within 12 blocks, or block reappeared | blacklist a 12-block radius |

Your exact case — "it didn't break even though there's no mining fatigue" — lands
in `UNBREAKABLE` only after the **retry with the best available tool** also fails.
That retry is what stops a lag spike or a momentarily wrong hotbar slot from
poisoning the blacklist.

**Two confirmations before blacklisting a type**, always. A single timeout is not
evidence; two independent positions failing is.

Cost: one block per type, once per session. Cheaper and more reliable than trying
to enumerate every protected map.

---

## 5. Basic control layer

One module (`core/input.ts`) is the **only** place that calls SimulatedPlayer
movement and action methods. Skills express intent; the control layer translates
and rate-limits. This is what keeps skills short.

### Surface

| Intent | Engine call | Notes |
|---|---|---|
| `move(fwd, strafe)` | `moveRelative(strafe, 0, fwd)` | clamped −1..1 |
| `look(yaw, pitch)` | `setRotation({x: pitch, y: yaw})` | rate-limited °/tick |
| `lookAt(pos)` | `lookAtLocation(pos)` | |
| `jump()` | `jump()` | cooldown, only if `isOnGround` |
| `sneak(on)` | `isSneaking = on` | **settable** |
| `attack(target)` | `attackEntity(target)` | gated by weapon cooldown |
| `use()` | `useItem()` / `useItemInSlot(slot)` | held-use start/stop |
| `useOn(block)` | `useItemInSlotOnBlock(slot, block, face)` | placement, buckets |
| `select(slot)` | `selectedSlotIndex = slot` | instant |
| `drop()` | `dropSelectedItem()` | |
| `swim(on)` | `swim()` / `stopSwimming()` | |
| `glide(on)` | `glide()` / `stopGliding()` | |
| `interact(entity)` | `interactWithEntity()` | chests, villagers |

### Rules the layer enforces (so skills never have to)

1. **Validity** — every call checks `isValid` first; a dead bot is a no-op.
2. **Rate limits** — one attack per weapon cooldown, one jump per N ticks, look
   capped at ~30°/tick (humans don't snap 180°).
3. **Try/catch around every engine call**, counting failures per skill; three
   failures mark the skill `FAILED` and the arbiter takes over.
4. **Action budget** — a per-tick counter (default 40 engine calls/bot) so one
   runaway skill cannot starve the others.
5. **Sprint is read-only** in 2.11.0 — the layer cannot set it. Speed comes from
   sustained forward movement, a `speed` effect, or `applyImpulse`. Documented so
   nobody hunts for a setter that does not exist.

---

## 6. Pro-level GUI

`ModalFormData` has `slider(label, min, max, options)` — confirmed. Three sliders,
one per learning level, plus a master.

```
┌ Pro Level ─────────────────────────────────┐
│ Master              [=========o====]  72   │
│ ──────────────────────────────────────────  │
│ L1 Opponent Reading [======o=======]  55   │
│ L2 Pattern Counter  [========o=====]  68   │
│ L3 Global Learning  [====o=========]  40   │
│ ──────────────────────────────────────────  │
│ Reaction time       180 ms                 │
│ Aim error           3.5°                   │
│ Clicks per second   8                      │
│ Decision interval   4 ticks                │
│ Mistake chance      6 %                    │
└────────────────────────────────────────────┘
```

### What each slider actually changes

| Slider | Maps to |
|---|---|
| **Master** | global scale on all three `w1/w2/w3` + reaction + aim error |
| **L1** | `w1` (skill-modulation strength) and L1 EMA rate — how fast and how hard the bot adapts to *this* player |
| **L2** | `w2` (counter strength) and archetype match threshold — how strongly it commits to a read |
| **L3** | `w3` (learned bonus) and bandit `maxUpdatesPerMinute` — how much it trusts accumulated experience |

Three separate sliders is the point: an admin can have a bot that reads opponents
brilliantly (L1 high) but never learns globally (L3 = 0), which is exactly the
"static but skilled" feel some practice worlds want.

### Presets

| Preset | Master | L1 | L2 | L3 | Reaction | Aim err |
|---|---|---|---|---|---|---|
| Easy | 20 | 10 | 10 | 0 | 420 ms | 12° |
| Normal | 50 | 40 | 40 | 30 | 260 ms | 6° |
| Hard | 75 | 65 | 70 | 55 | 180 ms | 3.5° |
| Pro | 95 | 90 | 90 | 80 | 120 ms | 1.5° |
| Custom | — | — | — | — | — | — |

### Two rules that keep it honest

1. **Pro level is capped by the governor.** While degraded (§3), effective pro is
   multiplied by 0.6 and the HUD shows "throttled". A lagging server gets dumber
   bots, not frozen ones.
2. **Per-bot override beats global.** Global default in config; individual bots can
   be pinned, so a world can mix a Pro sparring partner with Easy warm-up bots.

---

## 7. Module additions to `PLAN.md`

| File | Layer | Purpose | LOC |
|---|---|---|---|
| `core/input.ts` | L5 | the control layer (§5) | 250 |
| `core/governor.ts` | L7 | watchdog + latency tiers (§3) | 200 |
| `skills/breakDetect.ts` | L5 | attempt protocol + verdicts (§4) | 220 |
| `social/nlp.ts` | L6 | normalise, stem, intent match (§1) | 350 |
| `learn/opponent.ts` | L2 | L1 skill estimate (§2.1) | 220 |
| `learn/archetype.ts` | L2 | L2 pattern + counter (§2.2) | 250 |
| `learn/bandit.ts` | L3 | L3 global tactic bandit (§2.3) | 150 |
| `ui/proMenu.ts` | L7 | pro-level GUI (§6) | 180 |
| `data/chat-intents.json` | L0 | intent keyword sets | — |
| `data/archetypes.json` | L0 | centroids + counters | — |
| `data/blocks.json` | L0 | hardness, tier, unbreakables | — |

Revised total: **≈ 4,500 lines across ~22 modules** — still under a third of v2.9,
with every subsystem separately testable.

---

## 8. Build order adjustment

Insert after the existing phases:

| Phase | Deliverable | Acceptance |
|---|---|---|
| **2.5** | `core/input.ts` | bot moves/looks/attacks/jumps via intent calls only; no skill touches SimulatedPlayer directly |
| **7.5** | `breakDetect.ts` | on a protected map, bot declares `UNBREAKABLE` after two confirmations and stops trying; on a normal map it never false-positives |
| **9.5** | `governor.ts` | forcing a 30 ms artificial stall degrades tiers and recovers without oscillation |
| **10.5** | `learn/opponent.ts` + `archetype.ts` | a rusher and a turtle are separated within 20 s of fighting |
| **11.5** | `ui/proMenu.ts` | setting L3 to 0 removes all global learning without a reload |
| **12** | `social/nlp.ts` | misclassification fixable by editing JSON only |

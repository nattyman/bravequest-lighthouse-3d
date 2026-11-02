# Act 1 rework — binding spec (v11 → v12)

Heath's ask: the player must **see the corrupted lamp before they have the cure**. A plain light gets you
up the tower; the lamp is corrupted, plain fire fails; *then* you go to the forest for Maren's lantern,
which the Hollow Stag now guards. A **new boss** comes after the lamp is lit (Heath: "a boss there and a boss after fixing the lighthouse").

## New beat order

| # | step id | What happens | Owner |
|---|---------|--------------|-------|
| 1 | `cottage` | unchanged: wake, cold, cloak in the cottage chest (+2 Mender's Draughts) | — |
| 2 | `door` | unchanged: tower doorway is black, you can't go in without a light | — |
| 3 | `light` | "Find a light". Halloran (cliff path) now points to **his storm lantern in the oil shed** (landmark `shed`, ~(150,33)). Rewrite HAL_PRE so line 3 is about the shed, *not* Maren/the forest. | A |
| 4 | `storm` | Take the **storm lantern** (`G.items.storm`): plain warm amber flame, no violet, moths ignore it. It lets you through the doorway exactly like the keeper's lantern does now. Toast "Halloran's storm lantern". | A |
| 5 | `climb` | Climb. The **staff** is now an objective on the way up ("Take the Keeper's Staff"), not after the cure. | A |
| 6 | `failed` | Lamp room: the corrupted lens (existing ink). Set the storm lantern in the cradle → short scripted failure (~5 s): the ink swallows the flame — it gutters, goes violet, then black. The ink then **pulses toward you** and the storm lantern (back in your hand, relit weakly) flickers harder the closer you stand, until you back off. On the sill: **dead moth husks** and a **logbook** (interactable) reading *"They always came to the lamp. I thought it was the light they wanted."* — Maren's hand. The player has now seen the lock. Leaving is never blocked. | A |
| 7 | `halloran2` | Coming down, **Halloran is waiting at the foot of the tower** (move him there for this beat): *"The moths left when the lamp went wrong. They nest in the old wood, west."* plus a line tying to Maren and her lantern, and a warning that something big walks those woods now. Objective → forest. | A |
| 8 | `forest` | At the Resisting Tree the Keeper's Lantern lies in the roots **inside a Stag arena**. Approaching (≈30 m) starts the **Hollow Stag fight** (existing boss, moved from the finale; same tuning — Heath found it "challenging, but not too hard"). Checkpoint at the arena edge (rise there on death, never inside). On death the lantern becomes takeable. Stag death emits `boss:dead {who:'stag'}` and must NOT start the ending. | A |
| 9 | `return` | carry the violet ether lantern; the walk back is the **visible change**: a swarm trails your light across the moor (make sure it reads — enough moths, close behind). | A |
| 10 | `cure` | the moths pour **past** the lantern into the ink and eat it — tune the cure so the moths visibly go for the ink, not the flame (this is the reveal the design hinges on). Anti-light beam turns to the real warm beam. | A |
| 11 | `descend`/`finale` | "Something is climbing the cliff" → the **new finale boss** (see FINALE below), started via `G.emit('finale:start')` as now. | A emits, B builds |
| 12 | `done` | Ending card on `boss:dead {who:'gloaming'}` → core loop starts (unchanged). | A |

### Anti-light beam (A, lighthouse.js)
Before the cure the great lamp turns a **beam of darkness**: same geometry/rotation as the real beam but a
subtractive-looking dark violet-black cone (normal blending, dark colour, low opacity, ink-noise edges), with
faint motes drifting toward the tower. Visible from the cliff at game start so the tower reads as wrong from
second one. On cure it crossfades to the warm beam. Expose `G.lighthouse.beam = { yaw():radians, lit:bool }`
(yaw of the beam's horizontal direction, world space) for the finale boss.

### Save compatibility (A)
Old saves at `light`/`forest` (old meaning) must still load: if a save has `step:'forest'` and no storm
lantern flag, treat it as the new `forest` (lamp failure is implied — set flag `stormFailed`). Saves at
`return`/`cure`/later are unchanged. A save made before the Stag that has `lampCured` and no `bossDead`
goes to `descend` → new finale boss.

### devtools start points (A)
Update `js/devtools.js` START list: `story`; **`lamp-failed`** (storm lantern spent, Halloran next);
**`stag`** = "Before the Hollow Stag" at the forest arena edge; **`finale`** = "Before the finale boss"
(lamp cured, staff, at the foot of the stairs); `loop` and cave points unchanged.

## FINALE — The Gloaming (agent B, new file `js/finale_boss.js`)
"The fog answers the light." A towering shape made of the fog itself drags up over the cliff edge west of
the lighthouse — a hooded, many-armed silhouette of grey-violet mist with a dim ink heart, 10–12 m tall,
Gentle Gothic (eerie, not gory). Only the turning lighthouse beam can make it solid.

- **Solid only in the beam.** Normally translucent and untouchable (strikes pass through with a soft
  "whff" puff). When the beam (`G.lighthouse.beam.yaw()`; fallback: compute from the lamp's rotation) sweeps
  across it, it flashes solid for ~2.5 s: the ink heart glows, it recoils, and it can be hit. The beam
  cadence should give a hit window every ~8–10 s; telegraph the coming sweep (rim light on its edge).
- **Attacks (between sweeps):** fog-hand slams with clear ground decals (dodge/roll), a sweeping arm, and it
  calls 2–3 Hollows from the fog (use `G.monsters` spawn) at most once per phase.
- **Phase 2 (≤50 % HP): reaching for the lamp.** Three fog tendrils crawl up the tower; the player strikes
  their roots at the tower base (each root a hurtbox with an HP of 3). If a tendril reaches the top the beam
  gutters for 6 s (no hit windows) and the tendril resets. All three cut → it staggers, long solid window.
- **HP** ≈ 36 at staff damage values (combos 3–9); target fight length 2–4 min for a decent player. Use the
  new combat moves well (Skyfall Slam shockwave should be useful against the hands).
- **Death:** dissolves upward into the beam, fog thins over the whole island briefly. Emit
  `G.emit('boss:dead',{who:'gloaming'})` and call `G.ui.bossBar(null)`. Boss bar name "The Gloaming".
- Arena = the cliff top around the lighthouse (existing finale zone in monsters.js `startFinale` shows where).
  Respawn on death at the lighthouse checkpoint; the fight resets cleanly (full HP, tendrils gone).
- Music: use the existing boss/combat override the Stag used. SFX: synthesized via `G.audio` helpers; reserve
  names `gloaming_rise, gloaming_slam, gloaming_solid, gloaming_tendril, gloaming_death` for Suno later.
- API: `G.finaleBoss = { start(), active, hp, maxHp, solid, reset() }`, starts on `finale:start`.

## Ownership
- **Agent A (flow)**: flow.js, lighthouse.js, creatures.js (Halloran lines), monsters.js (Stag → forest,
  `boss:dead` who), items (storm lantern), devtools.js start points, test/e2e.py rewrite, README/CONTRACT notes.
  A must REMOVE the Stag from `finale:start` (monsters.js `G.on('finale:start',startFinale)`).
- **Agent B (boss)**: js/finale_boss.js only, + one `<script>` line in index.html after monsters.js, + its own
  test `test/finale_e2e.py`. Do not edit flow.js/monsters.js/lighthouse.js; ask the lead if a hook is missing.
  Until A lands, B can trigger with `G.emit('finale:start')` after `G.debugStartLoop()` is NOT used (that skips
  the finale) — use the devtools `stag` start point (lamp cured, staff owned) and emit `finale:start` directly.

## Testing (both) — see CONTRACT.md "Testing"
Work with `test/quick.py` and your own focused test on your own port with `?debug&headless`. Run the full
suites (`e2e.py`, `loop_e2e.py`, `cave_e2e.py`) **once**, at the end. `cave_e2e` `cameraWalk` is known-flaky on
main; don't chase it.

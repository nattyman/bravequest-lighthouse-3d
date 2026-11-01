# The core loop — shared design spec (binding for fog.js, alchemy.js, moths.js)

Read CONTRACT.md first (engine API), then this. Source of truth for the fiction: design/lighthouse-game-design-v2.md
("The Core Loop", "The Moths", "Ingredients", "Milestones 2"). Ether is life; corruption feeds on it; the fog is the same
anti-life at the scale of weather. The player's whole economy is one question: *how do you concentrate life faster than
it's being eaten?*

## When it runs
Act 1 (the existing quest: cottage → lantern → tower → cure → Hollow Stag) is unchanged. The loop starts when the player
clicks **Keep exploring** after the ending card (or on Continue of such a save): flow.js calls `startLoop()`, sets
`G.loop.active=true`, `G.flag('loop',true)` and emits **`loop:start` {restored}**. Before that, every loop system is dormant
and the island looks exactly as it does now. For testing: `G.debugStartLoop()` (with `?debug`) cures the lamp, gives the
staff + cloak and starts the loop immediately.

Narrative turn at loop start: *the light holds the fog back, but only so far — and it is already dimming.*

## Ownership (one owner per file; never edit another agent's file)
| file | owner | owns |
|---|---|---|
| js/fog.js (new) | Fog agent | `G.lamp`, `G.fog`, the boundary visuals, danger outside it, deep-fog monster spawns, the light gauge HUD, persist key `fog` |
| js/alchemy.js (new) + a minimal tide hook in js/world.js | Alchemy agent | `G.inv`, `G.tide`, ingredient pickups (mushrooms, tidal harvest, ichor drops), recipe pages, the alchemy table UI, pouring ether into the lamp, the loop objective chain, satchel HUD, persist key `alchemy` |
| js/moths.js (new) + js/creatures.js | Moth agent | lantern baiting, herding the swarm, protecting it, `G.blights` (corrupted sites) and curing them, ichor-in-satchel attraction, persist key `moths` |
| flow.js, core.js, hud.js, index.html | lead / controller agent | do **not** edit |

New files are auto-included in `dev.html` by `python3 test/build_dev.py` (run it after creating your file). The lead adds
them to index.html at integration. Build all DOM/CSS from your own JS (inject a `<style>` element); never edit index.html/hud.js.
HUD elements go into the existing `#hud .vitals` column (top-left, under the hearts) unless noted; keep them compact and in the
parchment/violet style of the cards (fonts: `var(--display)`, `var(--serif)`, `var(--body)`; colours `--ether`, `--bone`, `--fog`, `--amber`).
Modal panels: use `class="card"` with an inner `.sheet` (same look as the pause card) — the controller agent's menu navigation works on visible `.card` buttons.

## Shared APIs (exact names)
```
// fog.js
G.lamp = { ether, capacity:130, drainPerMin, active, feed(units) -> newEther }   // emits 'lamp:fed' {units, ether, radius}
G.fog  = { radius, targetRadius, centre:{x,z}, inside(pos)->bool, depth(pos)->metres beyond the edge (0 inside),
           safeNear(pos)->bool (inside, or within a lit lantern's bubble) }        // emits 'fog:milestone' {name, radius}
// alchemy.js
G.inv  = { count(id), add(id,n,{silent}), take(id,n)->bool, has(id,n), list()->[{id,n,name}], ITEMS:{id:{name,desc}} } // emits 'inv:change' {id,n,total}
G.tide = { level /* -1 low .. +1 high */, low:bool, phase /*0..1*/, nextLowIn /*s*/ }                                 // emits 'tide:low', 'tide:high'
G.alchemy = { ownsMushrooms:true, recipes, known:Set, learn(id), openTable() }                                       // emits 'brew' {recipe, units}, 'recipe:learned' {id}
// moths.js
G.moths = { swarm /* moths following the player now */, bait(seconds), baited:bool, baitLeft }                      // emits 'moths:bait', 'moths:lost' {n}
G.blights = [ {id, name, pos:Vector3, radius, needs /*moths*/, cured, reward} ]                                       // emits 'blight:cured' {id}
```
Every module must work if the others are missing (guard: `G.inv&&G.inv.add(...)`).

## Numbers (tune by feel, but start here)
- Distances are horizontal from the lighthouse (180, 0). Reference: cottage 22 m · cliff path top 45 · Halloran ~56 · cliff path foot ~85 ·
  standing stones ~144 · south beach ~170–200 · hamlet ~202 · forest edge ~250 · Resisting Tree ~345 · west tip ~410.
- `radius = 30 + ether × 3` (ether 0…130 → 30…420 m). Loop starts at **ether 40 → 150 m** (headland, cliff path, stones; the hamlet and forest are in fog).
- Drain: **1 ether / 75 s** of play (only while the loop is active and mode is 'play'). The edge eases toward its target (≈1 m/s) so changes are visible.
- Milestones (fog.js emits `fog:milestone` once each): `hamlet` at radius ≥ 205, `beach` ≥ 200 (south beach fully clear), `forest` ≥ 255, `tree` ≥ 350, `island` ≥ 415.
- Outside the edge — **the chill**: a cold ink vignette builds; lose 1 half-heart every `max(2, 9 − depth/12)` s. A *lit, carried* lantern makes a 7 m safe bubble (no chill) up to 60 m deep; beyond that it only halves the rate. Deep fog (depth > 40) occasionally spawns extra hollows/hounds near the player (cap 4 extra alive), never inside the edge.
- Ingredients (alchemy.js): `glowcap` (from the 14 world mushroom clusters, 2–3 per pick, regrow 4 min; picking also heals 1 heart), `kelp` and `brine` (tidal: spawn on the south beaches only at low tide, wash away when the tide returns), `pearl` (rare, low tide, only at a cured tide-pool blight), `ichor` (dropped where a monster dies: hollow 1, hound 1, boss 5; dissolves after 40 s).
- Recipes (ether units per vial): **Glowcap Tincture** 3 glowcap → 5 (known from the keeper's logbook) · **Tidewater Ether** 2 glowcap + 2 kelp + 1 brine → 18 (page in the wrecked boat on the south beach) · **Ichor Distillate** 2 ichor + 1 glowcap → 12 (page in the hamlet ruins: *refining life back out of the things that stole it*) · **Pearl Ether** 1 pearl + 2 kelp + 1 brine → 30 · **Moth Bait** 1 ichor → baits the lantern for 120 s (learned when the player first notices moths circling their satchel).
- Tide: period **300 s**, low tide window **≈75 s**; at low tide the sea level drops ~1.2 m (world.js hook) and the beaches widen.
- Moths: after the cure moths ignore the lantern (existing behaviour). Carrying ichor makes a few moths drift toward the satchel (the fair-play clue → teaches Moth Bait). A **baited** lit lantern recruits moths exactly like the corrupted lantern did in Act 1; the swarm follows the player. Monsters within 4 m of the swarm kill moths (~3/s) — the player must protect it. Moths regrow slowly (1 per 20 s, up to the original pool) near cured blights and patches.
- Blights (moths.js builds them, ~3): **Blighted Grove** in the forest (~(-120, ·, -25)) smothering a ring of rich glowcaps (cured → 6 extra mushroom clusters, alchemy adds them); **Black Tide Pool** on the south beach (~(30, ·, 75)) (cured → pearls at low tide); **Choked Well** in the hamlet (~(-20, ·, 30)) (cured → a healing spring + checkpoint). Each needs ~40 moths delivered and ~10 s of feeding while you defend them.

## The objective chain (alchemy.js drives it with `G.quest.set`)
1. `loop:start` → caption: the light is already dimming → **"Feed the light"**, sub "Gather glowcaps for the alchemy table", marker → nearest glowing mushroom.
2. Have 3 glowcaps → **"Brew ether"**, marker → shed (alchemy table).
3. Have a vial → **"Pour the ether into the lamp"**, marker → lighthouse door.
4. After the first pour → open-ended **"Push back the fog"**, sub shows the next milestone ("Next: the hamlet · 205 m") and the radius; marker → the next milestone place. Learning a recipe, a low tide, or a blight sighting can briefly retarget the marker with its own sub.

## Saves
Register with `G.persist.register('<key>', {save:()=>json, load:(json)=>{…}})` at script-evaluation time. Save everything needed to
restore your system (inventory, known recipes, ether, cured blights, bait time…). Load must be idempotent and run after `loop:start`.

## Testing
`python3 test/build_dev.py`, then `python3 test/snap.py --begin --js "G.debugStartLoop(); 0" --js "…"` (read its docstring).
Deterministic stepping: `G.step(1/30,n)`. Teleport: `G.player.teleport(x,y,z,yaw)` (forward = (−sin yaw, −cos yaw)); ground y via `G.floorAt(x,z)`.
Screenshots go in `/tmp/claude-0/<your-module>/` — look at them. Always finish with `timeout 290 python3 test/e2e.py` (Act 1 must still pass) and `node --check`.
Performance budget: your module should cost well under 1 ms/frame and add at most a few dozen draw calls.

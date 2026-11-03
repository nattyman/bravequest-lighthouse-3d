# Progression, rewards and upgrades — binding spec (v14)

Goal: exploring, fighting and freeing things should pay off in ways the player can feel. Zelda/BotW-style:
small collectibles that add up, boss rewards, and upgrades bought at the keeper's benches. Gentle Gothic tone:
everything is a keeper's relic, an ether-thing or a moth-thing, never generic "loot".

## 1. Heart Shards and Keeper's Hearts (health)
- Start: **2 hearts** (`maxHp` 4, half-heart units; `BASE_HP` in progression.js — was 5 hearts until v15, Heath: hearts come
  quickly early on). `maxHp` is derived on every load, so older saves move to the new base and hp is clamped to it.
  Max reachable in this build: 7 hearts (2 + 3 from shards + 2 boss hearts).
- **Heart Shards** — "a sliver of the old lamp's glass, still warm". 4 shards = +1 heart. **12 shards** on the island (=3 hearts).
  Place them where they reward exploring and the movement kit: on top of the standing stones (double jump), a cliff ledge only
  reachable by gliding down from the headland, a sea stack at low tide, the hamlet (an attic / roof), inside the forest
  (hidden behind the Resisting Tree's roots), a tidepool only open at low tide, one guarded by a hound pack, one for clearing
  a blighted grove, one in the sea cave off the main path, the tower gallery outside the lamp room, etc. Each spot should be
  visible from somewhere so the player can spot the glint (a soft violet sparkle + a faint chime within ~12 m).
- **Keeper's Heart** (+1 full heart, refills hp) from the **Hollow Stag** and the **Undertow**. The Gloaming instead gives
  2 Keeper's Marks and the Lantern Charm (below). Total: 2 + 2 boss hearts + 3 from shards = **7 hearts**.
- Existing saves: grant boss hearts retroactively on load if the boss is already dead.

## 2. Stamina — Moth Wings
- Every **2 negatives freed** (there are 8) → +20% stamina (the stamina ring grows), with a moth-wing flourish on the Traveler's
  cloak. 4 upgrades total. Toast on each: "Moth Wing — the swarm lends you its lightness". Retroactive on load.

## 3. Keeper's Marks (currency for upgrades)
- Brass keeper's tokens. Sources (~14 total): keeper's caches (below) 8, bosses (Stag 1, Undertow 2, Gloaming 2),
  first time each blighted spot is cured 1 each (there are 3: grove, tidepool, well).
- **Keeper's Caches**: 8 small iron-bound boxes hidden around the island (not the cottage chest). Each holds a Mark plus some
  materials (pearls, ichor, vials). Open with interact; Zelda-style "lift and show" moment.

## 4. Upgrades at any keeper's bench (shed table + cave bench)
A new **"Temper"** tab on the alchemy table menu (alchemy.js) lists upgrades: cost = Marks + materials. Bought once each.
| Upgrade | Effect | Cost |
|---|---|---|
| Ether Tip | +1 damage on every staff strike | 2 Marks, 2 ichor |
| Lens Shard | charged bolt charges 30% faster, flies faster, pierces 1 extra target | 2 Marks, 1 Tide Pearl |
| Ashwood Grip | combo/roll/jump-attack stamina costs −25% | 1 Mark, 3 glowcaps |
| Wide Bandolier | carry 5 Mender's Draughts (was 3) | 1 Mark, 2 brine |
| Deep Jar | moth jar holds 100 (was 60) — only after the jar is owned | 2 Marks, 1 Tide Pearl, 2 brine |
| Lantern Charm | the lantern's bait lasts 50% longer; moths gather 25% faster | Gloaming reward (free), or 3 Marks |
| Mender's Recipe II | Mender's Draught heals 4 hearts (was 3) | 1 Mark, 2 glowcaps, 1 kelp |
Total Mark cost ≈ 12–14 so a thorough player can buy nearly everything; a casual one buys 3–4.

## 5. Reward moments (shared, in a new `js/progression.js`)
- `G.progress.reward({id, name, desc, icon})` — Zelda "get item" moment: the Traveler lifts the item overhead for ~1.6 s
  (input paused, camera eases in), a short warm sting (synth now; reserve Suno name `reward_sting`), a card with name +
  one-line description. Never stacks: queue rewards. Small items (materials) keep the existing small toast.
- Heart Shard counter shows on the card ("2 of 4"); on the 4th the new heart fills in with a glow on the HUD.

## 6. The Journal (pause menu)
A **Journal** button in the pause menu → one screen: hearts + shards (x/4), stamina wings (x/4), Marks, upgrades owned,
caches found (x/8), shards found (x/12), negatives freed (x/8), blights cured, bosses. Works with mouse, touch and controller.

## 7. Persistence, tools, tests
- `G.persist.register('progress', …)` — everything above saves and reloads; retroactive grants for old saves.
- Test tools (`js/devtools.js`): give shard/heart/mark/upgrade, "reveal collectibles" (show all shard & cache markers), and a
  "late game" start point with all upgrades.
- New `test/progress_e2e.py`: pick up a shard (×4 → heart), open a cache, buy each upgrade and verify its effect, Moth Wings
  on freeing negatives, boss hearts, journal counts, save/reload/Continue, retroactive grants from an old save.
- Balance check: the Hollow Stag must stay "challenging, but not too hard" for a player who arrives with 2–3 hearts (v15; was
  5–6) and no upgrades — don't make the game need upgrades to finish Act 1. See §9.

## 8. Placement (as built — `js/progression.js`, verified by script)
Movement kit measured in-game (30 fps steps): **jump peak 1.15 m**, **double jump peak ≈1.8 m** (needs the cloak),
**glide ≈ 1 m of height lost per metre flown** (≈7 m/s forward), **max step 0.65 m**. Perches (built rock tops, the stone crown,
the loft) only catch a jump from above: you have to clear the top to within 0.35 m, and walking never steps up onto one.
Sea-facing cliffs (headland N/E/S) are walls you can't leave; the headland's **west** face is a steep slope you can run off.
Low tide: one ≈75 s window per 300 s cycle, sea level −1.2 m (the sandbar under the south cliff only exists in the core loop).
"Route check" = what the placement script proves with real inputs (`G.input.setVirtual` + `G.step`).

### Heart Shards (12; 4 = +1 heart)
| # | id | where (x, y, z) — y = the footing | how you reach it | route check |
|---|---|---|---|---|
| 1 | `stones` | crown of the shortest standing stone, NE side of the circle (45.3, 14.40, −28.4); ground 11.9 | jump onto the broken-off chunk at its foot (top 12.75), then **double jump** | ground→DJ fails · chunk→single fails · chunk→DJ ✓ |
| 2 | `spire` | top of an 11 m stone spire by the foot of the cliff path (101.5, 28.1, 10) | from the headland top run west off the steep edge at (118, 40.6, 10), **glide** straight at it, let go over it | glide ✓ · ground DJ fails |
| 3 | `stack` | shelf at the foot of a sea stack off the south beach (46, −0.54, 84.75); sand −1.79 | **low tide only**: wade out across the sand, single jump up | high tide: sand + shelf not walkable · low: ✓ |
| 4 | `attic` | loft floorboards in the NW hamlet ruin (−29.4, 16.11, 42.5); ruin floor 13.5 | jump onto the heap of fallen slates (−27.6, 14.46, 40.2), then **double jump** | ground DJ fails · heap single fails · heap DJ ✓ |
| 5 | `roots` | in the Resisting Tree's roots, far (west) side (−171.2, 10.35, 2.4) | walk round the trunk (the Stag's clearing) | walk ✓ |
| 6 | `hounds` | ring of stones in the moor hound pack's range (58, 12.75, −12) | fight or slip past the hounds | walk ✓ |
| 7 | `grove` | where the Blighted Grove's black was (−124.5, ·, −28.5) | appears when the grove is cured (core loop) | after cure: walk ✓ |
| 8 | `cave` | Flooding Stair's upper ledge in the sea cave, local (8.2, 2.61, −66) = world (8.2, 62.61, 734) | at high tide ride the floating crates up (no double jump in that room) | shard sits on the ledge floor ✓ (cave_e2e covers the crates) |
| 9 | `outcrop` | rock jutting from the drop beside the cliff path's long northward run (112.8, 37.0, −6); path 35.4 | **double jump** from the path | single fails · DJ ✓ |
| 10 | `tidepool` | rock pool on the sandbar under the south cliff (131, −0.95, 56.35) | **low tide only**, core loop: walk the bar from the beach or the cave mouth | high: not walkable · low: walk ✓ |
| 11 | `west` | rock at the far west tip, past the forest (−231, 11.0, −4); ground 10.5 | single jump | ✓ |
| 12 | `needle` | stone needle on the headland's north side (150, 43.85, −30); ground 42 | **double jump** from the grass | single fails · DJ ✓ |
Each shard glints (violet sprite + twinkle, glow grows with distance so it reads from far off) and chimes softly within 12 m.
The lighthouse gallery was dropped as a spot: the lamp-room glass is a wall (lighthouse.js), so it isn't reachable.

### Keeper's Caches (8; each = 1 Mark + materials)
| id | where (x, y, z) | loot | note |
|---|---|---|---|
| `tower` | seaward side of the lighthouse (188.5, 42, 5) | 3 glowcap | |
| `hamlet` | inside the SE hamlet ruin (−7.5, 13.76, 19.8) | 2 ichor | |
| `ramp` | beside the foot of the cliff path (96, 14.1, 20) | 2 brine | |
| `forest` | southern forest, among fallen trunks (−120, 7.64, 32) | 2 glowcap, 1 ichor | |
| `stones` | just outside the stone circle, north side (33, 12.19, −48) | 1 pearl | |
| `north` | moor's north shore (−20, 10.85, −80) | 2 kelp, 1 brine | |
| `gallery` | sea cave, Gallery of Keepers near the roost, world (4.8, 63.0, 773.2) | 1 pearl, 1 ichor | cave |
| `sandbar` | on the sandbar under the south cliff (146, −0.95, 56.6) | 1 pearl, 1 kelp | low tide, core loop |
Marks: 8 caches + Stag 1 + Undertow 2 + Gloaming 2 + first cure of each blight 1×3 = **16**. Temper costs 12 Marks for all seven
(Lantern Charm is the Gloaming's gift, so 9 in practice). The Temper tab only exists at the benches, which only work in the
core loop — Act 1 (and the Hollow Stag) is untouched by upgrades; only shards and Moth Wings can add up before it.

## 9. The 2-heart start (v15) — balance check
Damage is in half-hearts; a fresh player has 4.
| threat | where / when | damage | hits to fall from 2 hearts |
|---|---|---|---|
| falling into the sea / a void (respawn at the checkpoint) | anywhere | 1 | 4 |
| a hard landing (> 14 m drop) | running off the headland's west face without the cloak | 2 | 2 |
| hound bite | the moor pack (3), the forest | 1 | 4 |
| hollow claw / lunge | the hamlet (3), the forest | 2 | 2 |
| brineling pinch | the cave, the raft raids | 1 | 4 |
| the Hollow Stag: charge / sweep / stomp ring | the old tree | **2** (charge was 3) / 2 / 2 | 2 |
| the Gloaming: slam / sweep | the lighthouse | 2 / 2 | — (3–4 hearts by then) |
| the Undertow: lash / surge | the cave's pool | 2 / 2 | — (5–6 hearts by then) |
| the fog's chill | outside the light (core loop) | 1 every 2–9 s | — |
Nothing one-shots a 2-heart player. The Stag's charge (3) took a fresh player to half a heart in one blow, so it now costs one
heart like every other Stag attack (monsters.js `P.stag.chargeDmg`). Healing on the way: the 2 Mender's Draughts in the
cottage chest (3 hearts each — a full refill at this size), glowing mushrooms, and the hearts monsters drop (35%).

Hearts at each boss on the normal route (the devtools start points use the "typical" column):
| boss | minimal (no detours) | typical | thorough |
|---|---|---|---|
| the Hollow Stag | 2 | 3 (needle, outcrop, attic, hounds' ring = 4 shards) | 3 + 2/4 (+ stones, spire) |
| the Gloaming | 3 (+ the Stag's heart) | 4 | 4–5 |
| the Undertow (core loop) | 3–4 | 5 (+ stones, spire, roots, west tip) | 6 |
| after the Undertow | 4–5 | 6 | 7 |

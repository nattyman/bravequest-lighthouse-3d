# The Drowned Keepers' Cave — shared design spec (binding)

Read CONTRACT.md and LOOP.md first. Fiction: design/lighthouse-game-design-v2.md (moths, the Unmade, salvage/logbooks, the Wound).
The dungeon is built from the three systems no other game has: **light** (your lantern is the only light; you reveal the cave
by lighting it), **the tide** (the island's real 5-minute tide floods and drains the cave), and **the moths** (the swarm is the
key item; puzzles are about routing and protecting it). Its twist mirrors the moth reveal: every room teaches *light is good*,
and the boss can only be fought in the dark, by trusting the moths.

## When and where
- Available once the core loop is active (`G.loop.active`). The mouth is a black arch at the **foot of the lighthouse
  cliff on the sea side**, reachable over wet sand/rocks **only at low tide** (`G.tide.low`). Cave agent picks the exact spot by
  sampling the terrain around the headland's south/east base (~x 140–200, z 40–55, y ≈ 0–2) and exposes it as
  `G.world.landmarks.caveMouth`.
- First time the loop sees a low tide *and* the player is within ~120 m of the mouth (or reads the cottage logbook again):
  caption + quest marker. Halloran gets one new line about "the keepers' cave under the cliff — Maren went down there once".
- **Interior space**: the cave is a separate interior placed far off-island at **world origin O = (0, −60, 800)** (all
  coordinates below are cave-local: world = O + local). Entering/leaving = interact at the mouth → fade (`#fade`) →
  teleport. The baited swarm (and a moth jar) comes along: shift every swarm moth by the same offset.

## Engine support (Cave agent owns these small edits)
- `core.js`: `G.interior = null | {id, contains(x,z,y)->bool}`. While the player is inside an interior, `G.floorAt` ignores
  terrain inside `contains()` (floor providers only; return −1e9 if none so the player falls into water/pits) and
  `G.world.walkable` returns true inside it. Keep the change tiny and commented.
- Darkness: inside the cave set `G.atmo.darkTarget = 1` every frame from a system with **order > 10** (lighthouse.js resets it
  at order 10). World.js then makes fog black and lights ~0; only lanterns, ether veins and glows light the cave.
- `fog.js`: while `G.cave && G.cave.inside`, the fog wall is hidden and `G.fog.depth()` returns 0 (no chill, no deep-fog spawns).

## Water
`G.cave.water()` = cave-local water surface y = **1.5 × G.tide.level** (−1.5 at low tide, +1.5 at high). Every room's water
follows it (one big animated plane per pool/channel at that height; sea-spray and drips). Deep water (> 1.1 m above the
floor) is not walkable: the player is pushed back to the last dry footing with 1 half-heart (like the island's deep water).
Floating things (crates, the raft) ride the surface.

## Layout (cave-local; floor heights are the walkable surface)
| id | room | centre | notes |
|---|---|---|---|
| `mouth` | The Mouth | (0, 0.3, −10) | sand and tide pools rising inward to y≈2 at z −22; floods at high tide (the player is gently washed back toward the inner end); first **ether vein** to light here (tutorial: brew/pour → light) |
| `gallery` | Gallery of Keepers | (0, 3, −35), 24×18 m | carved statues of past keepers, Maren's logbook page 1, a **cave-moth roost** at (8, 3, −30), a corruption **seal** blocking the north door at (0, 3, −46) |
| `stair` | The Flooding Stair | (0, —, −62) | two routes north: a **lower passage** (floor y −1) open only at low tide; an **upper ledge** (y 2.6) reachable only at high tide by jumping from floating crates; both continue to `channel` |
| `channel` | The Channel | (25, 0, −80) | a 40 m water channel along +x from (5,·,−80) to (45,·,−80); the player can't swim it (walls/grates); a narrow upper walkway on its north side at y 4 (−86); a **raft** at (7, water, −80); a **seal at the water line** at (47, 1, −80) gating the sluice to `drafts`; logbook page 2 on the walkway |
| `drafts` | Hall of Drafts | (60, 3, −60) | corridor from z −70 to −40 with **blowholes** along it that gust in time with the sea (every ~6 s, telegraphed by a rising hiss + spray) and scatter moths unless the lantern is **shuttered** (a shut lantern makes the swarm cling tight); door to `arena` at (60, 3, −38) |
| `arena` | The Undertow | (60, 1, −15), radius 18 | flooded cavern, central pool, ring floor y 1; the boss; beyond a collapsed far wall at (60, −6, 8): **the Wound** (a glowing violet-black crack in the sea floor, pulsing — look, don't touch); exit tunnel back to `mouth` at (20, 1, −5) opens after the boss (shortcut) |

## Puzzles (Puzzle agent)
- **Ether veins**: glowing mineral veins in the walls (≥ 2 per room). Interact while holding a vial ("Light the vein") →
  consumes 5 ether units (from `G.alchemy`'s vials; first one in `mouth` is free) → the room is permanently lit (warm violet
  light, a few point lights max per room) and stays lit after reloading. Lit rooms make enemies easier to see and calm the
  music. Dark rooms are navigable by lantern only.
- **Seals**: corruption plugs (use `G.negMaterial`, `G.ink`) that need N moths feeding for T s (gallery 20 moths/6 s, channel
  25/8 s, arena door 30/8 s). Reuse/extend the blight feeding logic from moths.js (don't duplicate it badly).
- **Cave-moth roost** (`gallery`): ~40 pale cave moths that a baited lantern can recruit, so the dungeon works even if the
  player arrives without a swarm. Ichor for bait comes from cave monsters.
- **Floating crates** (`stair`): 2–3 crates ride the water; at high tide they lift the player to the upper ledge.
- **The raft** (`channel`): set the baited lantern on the raft (interact) → the swarm settles on it → the raft drifts along
  the channel with the ebbing/flooding current (moves when the tide is changing; push it with a staff strike when still).
  The player runs the walkway above, defending the raft from **brinelings** that climb onto it to eat moths. At the far end
  the swarm eats the water-line seal → the sluice opens.
- **Drafts**: blowhole gusts scatter non-shuttered swarm moths (they're lost); shuttered, the swarm clings and survives.
  The player must time crossings between gusts with the lantern shut — then re-open it at the far end to recruit stragglers.
- **The moth jar** (reward, granted after the boss): `G.moths.jar = {count, capacity:60, capture(), release()}` — capture
  the swarm around you into the jar (no bait needed to keep them), release them on command anywhere (they then act as a
  baited swarm for 60 s). Interact/hint key: when you have the jar and a swarm nearby, `G.hint` row "Capture moths"; when the
  jar holds moths, "Release moths". Works on the island too (makes curing blights much easier). Persisted.

## Monsters and boss (Boss agent)
- **Brineling** (new monster kind in monsters.js): a knee-high crab of ink and shell, scuttles sideways, **hunts moths
  first** (goes for the nearest swarm moth, eating 2/s within 2 m), fights the player only when cornered; HP 3; drops ichor.
  Packs of 2–4 in `gallery`, `channel`, `drafts`. Plus a few hollows in the dark rooms.
- **The Undertow** (boss, `arena`): a vast coil of ink and drowned rope wrapped around a broken lighthouse lens, rising
  from the central pool. **In light it can't be seen** (fully transparent while the player's lantern is lit within 20 m, or
  the arena's veins are lit — the veins in the arena *cannot* be lit until it's defeated) and its strikes come out of
  nowhere. **Shut the lantern**: in the dark, the moths (which hunt corruption) swarm onto it and outline its body —
  that's how you see it and where you strike. Phases follow the tide: at high water it surges (sweeps across the ring
  floor), at low water it coils and lashes; at 50% it drags moths under (the swarm thins — protect it). Telegraphs must
  be readable from moth movement and sound. On defeat: dissolve, lens fragment rises, the arena lights, the **moth jar**
  appears on the lens pedestal, Maren's final logbook entry, the far wall collapses to show **the Wound**. Emit
  `boss:dead` with `{kind:'undertow'}`? No — emit **`cave:bossDead`** (don't reuse `boss:dead`, which triggers the Act 1 ending).
- **Story**: Maren (the keeper who took the lantern west) left three logbook pages: gallery, channel walkway, arena. They
  tell, without resolving, that she came down chasing a light in the deep water, that the dark here "listens", and her last
  entry: she's going "down to where it comes in". Her fate stays open (the creator hasn't decided whether the Unmade can be
  saved). Captions use `G.ui.say(text,'Maren’s logbook')`.

## Ownership (never edit another owner's file)
| file | owner |
|---|---|
| `js/cave.js` (new), small hooks in `js/core.js`, `js/fog.js`, `js/world.js` (mouth landmark only if needed) | **Cave agent** — geometry, physics, water, darkness, veins' *visuals/lights* API, entrance/exit/transition, shortcut, `G.cave`, `G.debugEnterCave(roomId)`, persist key `cave` |
| `js/cave_puzzles.js` (new), `js/moths.js`, `js/creatures.js` | **Puzzle agent** — veins (interaction + economy), seals, roost, crates, raft, drafts, moth jar, persist key `cavePuzzles` |
| `js/cave_boss.js` (new), `js/monsters.js` | **Boss agent** — brinelings, cave monster placement, the Undertow, story pages, Halloran's line (via `G.creatures.halloran` API if possible; else a talk interactable in cave_boss.js near him), discovery caption/quest, persist key `caveBoss` |
| `js/audio.js` | **Audio agent** — cave ambience, reverb, water, music, all cave/boss SFX (synth placeholders; Heath will record some) |
| `flow.js`, `hud.js`, `index.html`, `alchemy.js`, `player.js`, `lighthouse.js` | lead — don't edit (ask in your report if you need something) |

## APIs (exact names)
```
G.cave = { inside:bool, origin:Vector3, toWorld(x,y,z)->Vector3, toLocal(v)->Vector3, water()->localY, waterWorld()->worldY,
           room(pos)->id|null, rooms:{id:{centre:Vector3(world), bounds:{min,max}(world), anchors:{name:Vector3(world)}}},
           enter(roomId?), exit(), lightRoom(id), isLit(id), mouth:Vector3(world) }
// events: cave:enter {room}, cave:exit, cave:room {id}, cave:lit {room}, cave:seal {id}, cave:sealOpen {id},
//         cave:raft {state}, cave:gust {pos}, cave:jar {action,count}, cave:bossStart, cave:bossPhase {n}, cave:bossDead,
//         cave:page {n}, cave:wound
```
Anchors the Cave agent must export (others build at them): `mouth.vein`, `gallery.roost`, `gallery.seal`, `gallery.page`,
`stair.crates`, `stair.ledge`, `stair.lowPassage`, `channel.raftStart`, `channel.raftEnd`, `channel.seal`, `channel.walkway`,
`channel.page`, `drafts.vents` (array), `drafts.door`, `arena.pool`, `arena.door`, `arena.pedestal`, `arena.page`,
`arena.wound`, `arena.exit`, plus `veins` per room (array). Until cave.js exists, use `O + local` from the table.

## Testing
`python3 test/build_dev.py` (auto-includes new js files; order cave.js → cave_puzzles.js → cave_boss.js after the loop
modules). `G.debugStartLoop()` then `G.debugEnterCave('gallery')`. Force tides with `G.alchemy.debug.setTide(t)` (scan t until
`G.tide.low` / high). The machine is shared by several agents' headless Chrome sessions: use long timeouts, your own server
port if 8800 is busy. Every agent must keep `test/e2e.py` (Act 1) and `test/loop_e2e.py` (core loop) passing and run
`node --check`. Screenshots in `/tmp/claude-0/cave-<you>/`; look at them. Performance: the whole cave ≤ ~150 draw calls.

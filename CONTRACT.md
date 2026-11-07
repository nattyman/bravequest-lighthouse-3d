# Brave Quest: Lighthouse — module contract

Read this whole file before writing code. Several agents build modules in parallel; this contract is how they fit together. **Never edit `js/core.js`, `index.html`, or another agent's module.** If you need something core lacks, implement it inside your own module (namespaced under your module) and mention it in your final report.

## Project layout
```
index.html        page shell + HUD DOM (owned by lead)
dev.html          generated for local tests: python3 test/build_dev.py   (never edit by hand)
js/core.js        engine + shared API (lead)           -> window.G
js/world.js       island terrain, sea, sky, vegetation, buildings  (World agent)
js/lighthouse.js  tower on the cliff, interior stairs, staff, lamp cure  (Lighthouse agent)
js/combat.js      technique table, names/pause list, aim reticle + raycast, ether bursts (loaded before player.js)
js/player.js      the Traveler, controller, camera, combat, lantern + staff models  (Player agent)
js/creatures.js   moths, corruption patches, passive negatives, Halloran  (Creatures agent)
js/monsters.js    hostile monsters + boss  (Creatures agent)
js/flow.js        quest beats, checkpoints, pickups, title/attract camera  (lead)
js/hud.js         HUD, menus, touch buttons  (lead)
vendor/three      local Three.js r128 + examples/js (for dev.html only)
```
Load order: three → postprocessing → core → world → lighthouse → combat → player → creatures → monsters → flow → hud → `G.start()`.
Every module is a plain script wrapped in an IIFE: `(function(){ 'use strict'; const G=window.G, THREE=G.THREE; ... })();`
Three.js is **r128** (UMD global). No ES modules, no imports, no other libraries, no network assets. All textures are procedural (canvas) — see `G.canvasTex`.

## Art direction — "The Gentle Gothic"
Style guides (already read by the lead; summary here):
- **Soft cel shading, readable silhouettes, warm refuge / cold wilderness.** Fairytale melancholy, not horror.
- Dusk: violet-plum sky with a pink horizon glow, slate-blue fog, sea stacks and rock spires offshore. Warm amber light only from human places (cottage windows, hanging lanterns). Ether is luminous violet; corruption is matte black void with oily sheen.
- Palette (`G.PAL`): fogIvory #e8e2d4, slateBlue #4d5a6a, pineBlack #18241f, stone #8b857b, amber #e3a13a, ether #9150ff, corruption #0a090c; character: deepViolet #4b3863, duskyPlum #6c3f5f, umber #6a4a2e, gold #c8a24c.
- Materials: rounded weathered stone, dark timber, slate roofs, matte wool. Twisted old oaks with spreading canopies, dark pines, violet and white wildflowers, mossy stone walls.
- Use `G.toon(color, opts)` (MeshToonMaterial with the shared 4-band gradient) for almost everything. Add outlines with `G.outline(mesh,{thickness})` on characters, creatures and key props (not on terrain/grass/instanced foliage).
- Bloom is on (threshold ~0.72): only ether, lanterns, windows and magic should exceed it.

## Geography (shared coordinates — everyone uses these)
+x = east, +z = south, y up, sea level y=0. The island is long east–west.
| place | where |
|---|---|
| Island extent | x ≈ −230…230, z ≈ −95…95, irregular coast, beaches on the south side of the moor |
| **Forest** (west end) | x < −70. Dense twisted oaks + pines, undergrowth, mossy rocks, fog thicker. Gentle hills, ground y ≈ 6–14 |
| **Resisting Tree** clearing | (−165, ·, 5), clearing radius 14, no trees inside except the giant old tree at the centre; faint warm/violet glow. The lantern lies at its roots: `lanternSpot` ≈ (−160, ·, 9) |
| **Moor** (middle) | x −70…110, rolling heath, y ≈ 6–16. Ruined **hamlet** of 3–4 broken cottages at (−20, ·, 30). Standing stones at (40, ·, −35) |
| **Cliff path** | switchback ramp from `cliffPathBottom` (95, ·, 12) up to `cliffPathTop` (135, 42, 2), walkable (slope < 50°) |
| **Headland** (east end) | plateau x 130…215, z −45…45, flat top at **y = 42**, sheer cliffs on N, E, S down to the sea |
| **Lighthouse** | centre (180, 42, 0). World keeps a flat stone apron radius 9 at exactly y=42. **Door faces west (−x)**. |
| Keeper's cottage | (158, 42, 24), warm windows, chimney; small alchemy shed (150, 42, 33) |
| Player start | (164, 42, −4), facing the door (yaw toward +x) |
| Halloran | near the top of the cliff path (124, ·, 16) |
| Finale arena | cliff top around the lighthouse, centre (165, 42, 0), r 28 |

`G.world.landmarks` (world.js fills **synchronously at script-evaluation time**, all y = ground height):
```
start:{x,y,z,yaw}  lighthouse:{x,y,z}  cottage:{x,y,z}  shed:{x,y,z}  halloran:{x,y,z}
resistingTree:{x,y,z,r}  lanternSpot:{x,y,z}  hamlet:{x,y,z}  stones:{x,y,z}
cliffPathBottom:{x,y,z}  cliffPathTop:{x,y,z}  finale:{x,y,z,r}
patches:[{x,y,z}]            // 8–10 corruption patches on moor + forest, none within 20 m of the lighthouse
mushrooms:[{x,y,z}]          // glowing violet mushroom clusters (healing pickups), ~14, near forest edges/ruins
negativeHomes:[{x,y,z,kind}] // 8 passive negatives: kind 'stag'|'fox'|'hare'|'heron'
monsterZones:[{name,x,z,r,kinds:[...],count}]  // e.g. forest {x:-130,z:0,r:50,kinds:['hollow','hound'],count:6}, hamlet {x:-20,z:30,r:22,kinds:['hollow'],count:3}, moor {x:55,z:-10,r:30,kinds:['hound'],count:3}
path:[{x,z}]                 // centreline of the trail from lighthouse → cliff path → hamlet → Resisting Tree
```

## Core API (window.G) — summary; read js/core.js for details
- `G.scene, G.camera, G.renderer, G.lights.{hemi,sun,sunDir}, G.focus` (Vector3: player sets it every frame; sun shadow follows it)
- `G.U` utils: clamp, lerp, smooth, damp, angDiff, dampAngle, dist2, hash, vnoise, fbm, rng(seed), col(hex→linear Color)
- `G.PAL`, `G.tex.{soft,flame,moth}`, `G.canvasTex(size,draw,srgb)`, `G.toon(c,opts)`, `G.outline(mesh,opts)`, `G.negMaterial({rim,strength})` (uniforms uFade 1→0 dissolve, uFlash hit flash)
- Events: `G.on(name,fn)`, `G.emit(name,data)`
- Systems: `G.system(name,{order,modes,init(),update(dt)})`. `modes` default `['play','dead']`; use `'always'` for ambient animation (water, grass, moths drifting) that should also run on the title screen. `init()` runs once after all scripts load — build meshes there.
  - Orders: world 0–9 · lighthouse 10 · player 20 · creatures 30 · monsters 40 · projectiles 45 · flow 60 · camera 80 (player.js) · hud 90 · sunFollow 95
- Modes (`G.state.mode`): `'title'` (attract camera owned by flow.js) · `'play'` · `'paused'` · `'dead'` · `'ending'`. `G.setMode(m)` emits `'mode'`.
- Flags: `G.flag('lanternFound', true)`; `G.flag('x')` reads.
- Atmosphere: `G.atmo.darkTarget` (lighthouse sets 1 when the player is inside the unlit tower body), `G.atmo.dark` (core damps it), `G.atmo.cured` 0..1 (lighthouse animates during the cure). world.js reads these every frame to set fog/sky/hemi.
- Items: `G.items.lantern {found,carried,shut,cured,inCradle,pos,world,lit()}` and `G.items.staff {owned,pos}`.
  `G.items.storm {found,carried,inCradle,failed,spent,pos,world,lit()}` (lighthouse.js): Halloran's plain storm lantern; it opens the doorway like the keeper's, moths ignore it.
- Beam: `G.lighthouse.beam = {yaw(), lit, arms:2, origin, dir(out), gutter(seconds), guttering}` — heading convention: one arm points along (sin yaw, 0, cos yaw), the other along yaw()+π; before the cure it's the anti-light beam (`lit` false), after it the warm beam. `gutter(s)` makes the warm beam stutter and dim for s seconds.
- Act 1 hooks: `G.monsters.startStag()` / `stagArena()`, `G.creatures.halloranAt(pos|null, yaw)`, `G.flow.stagDead`, `G.flow.stagEdge()`.
- World queries: `G.world.height(x,z)`, `G.world.walkable(x,z)`, `G.floorAt(x,z,y)` (terrain + floor providers), `G.floorProviders.push(fn(x,z,y)->h|null)`, `G.constrainers.push(fn(prev,next,y,radius,who)->blocked)`, `G.cameraConstrainers.push(fn(cam,target))`, `G.addCollider({x,z,r,y0,y1})`, `G.addBoxCollider({x,z,hw,hd,yaw,y0,y1})`.
- **Movement for every character:** `G.moveCharacter(pos, dx, dz, radius, who)` → handles circles, boxes, constrainers, walkability, max step 0.65 m and steep slopes (>~54° blocks — cliffs are walls). Then set `pos.y` from `G.floorAt(pos.x,pos.z,pos.y)` with your own gravity.
- Interaction: `G.interact.add({pos|()=>pos, radius, label|()=>label, priority, enabled:()=>bool, use()})`. player.js calls `G.interact.pick(playerPos)` each frame and `use()`s the current one on the interact action. HUD shows `G.interact.current`. Extra per-frame prompt rows: `G.hint('F','Close the shutter')`.
- Combat: hurtbox `{team:'player'|'enemy'|'neutral', pos:Vector3 (feet), radius, height, alive:()=>bool, hit(info), targetable, name, corrupt:bool, lockOffset}` registered with `G.combat.add(hb)`. `G.combat.strike({x,y,z,radius,team,damage,knockback,kind,source,exclude:Set})`, `G.combat.nearestTarget(from,maxDist,dirVec)`, `G.combat.spawnProjectile({pos,vel,radius,team,damage,life,kind,mesh,knockback,gravity,onHit,onEnd})`.
  - `info = {damage, dir (unit Vector3 from attacker to target, horizontal), knockback, kind:'melee'|'bolt'|'swarm'|'charge'|'bite', source}`
  - **Damage units are half-hearts.** Player starts with maxHp 4 (2 hearts); progression.js derives maxHp (max 14, 7 hearts).
- UI calls (hud.js implements): `G.ui.say(text, who?, {priority:'high'|'normal'|'low', key})` (every line is also kept in the message log, pause menu > Messages; reading time is the player's choice: `G.ui.captionSpeed` 'relaxed'|'standard'|'hold'; `G.ui.advance()` = Enter / D-pad down / a tap on the caption), `G.ui.objective(text, sub?)`, `G.ui.toast(title, small?)`, `G.ui.bossBar(name|null, frac)`, `G.ui.flash()`, `G.ui.shake(amount)`.
- HUD read-outs for tests (hud.js): `G.ui.captionStack()` → `{depth (back cards showing, 0–2), count ('+N' when 3+ lines wait, else ''), who:[names on the back cards], leaving}` — waiting captions show as a stack of card edges behind the front one (decoration only; the queue/pacing rules are unchanged); `G.ui.staminaWheel()` → `{shown, state:'ok'|'low'|'exh'|'full'|'', opacity, frac}`; `G.ui.padStatus()` → `{state:'connected'|'none'|'blocked'|'unsupported', text}` (the controller line in the pause menu and on the Controls screen, `[data-pad-status]`).
- Pickups (flow.js implements): `G.pickups.spawn('heart'|'mushroom', pos)`.
- Map + fast travel (js/map.js): `G.map.open()/close()`, `G.map.addMarker({...})`, `G.map.waypoints`, `G.map.travelBlock(id)` → reason
  string or null, `G.map.travel(id)`. Eight waystones (lighthouse, cottage, cliff-path foot, standing stones, hamlet road, Resisting
  Tree, sea cave, the Undercroft) unlock when first visited; travel is chosen in the open map (click/tap, Tab+Enter, LB/RB+A) through a confirm card.
  Travel uses `G.player.teleport` and, for the sea cave, `G.cave.enter('mouth',{instant:true})` / `G.cave.exit({instant:true})`;
  for the Undercroft, `G.undercroft.enter('stair',{instant:true})` / `G.undercroft.exit({instant:true})` (UNDERCROFT.md).
  It refuses during boss fights (the Tithe-Keeper's too), the Act 1 finale, while Maren's corrupted lantern or a swarm follows you, while the lantern rides
  the cave raft, with monsters hunting you within 30 m, mid-air, and to a destination under the fog.
- Input actions: `forward back left right jump sprint roll attack lock interact shutter potion pause advance glass` (advance = Enter or controller D-pad down: next caption; glass = hold G, or hold Y on a controller once the Remembering Glass is owned — a Y tap stays interact, sent on release; touch: the Glass button). `G.input.down(a)`, `G.input.pressed(a)`, `G.input.released(a)`, `G.input.move()` → {x,y,mag}, `G.input.gamepad` → `{connected,id,name,blocked,error,policy,supported,count,index,mapping,remap}` (policy false = the page's permissions policy forbids 'gamepad'; remap 'xpad'|'generic' for a pad without the standard mapping), `G.input.padState()` → the pad in use in the standard layout `{B,A}` or null, `G.input.look()` → pixel delta this frame, `G.input.wheel`, `G.input.locked`.
- Techniques (`js/combat.js`, loaded before player.js): `G.moves.T` is the tuning table (lunge, sweep, slam, spin, plunge, dive, doubleJump, buffer, aim). `G.moves.performed(id)` names a technique on screen (toast the first time; remembered in localStorage `bq-combos`, listed in the pause menu). `G.moves.raycast(from,dir,max,{start})` → `{point,dist,hb,surface}` against floors, walls (constrainers), colliders, cave ceilings and enemy hurtboxes. `G.moves.burst(pos,{radius,color,life,lightI})` ether ring + flash. `G.moves.noDoubleJump.push(fn(pos)->bool)` forbids the double jump where it returns true. `G.player.move` → `{id, phase, doubleJumped, dived, aiming, aimK, aimPoint, cooldowns}`.
- Models: `G.models.lantern()` and `G.models.staff()` are defined by player.js at script-evaluation time and return fresh Object3Ds (other modules may call them in init()).

## Events (names are fixed)
| event | data | emitted by |
|---|---|---|
| `ready` | — | core after init |
| `mode` | {mode,prev} | core |
| `player:hurt` | {hp,damage,info} | player |
| `player:dead` / `player:respawn` | {pos} | player |
| `player:attack` | {combo, charged} (combo is 1–3 for swings, or a technique id: 'lunge','sweep','slam','spin','plunge'; bolts add {bolt, great}) | player |
| `player:combo` | {id, name, first} | combat (a technique was performed) |
| `player:doublejump` / `player:dive` | {pos} | player |
| `player:plunge` | {pos, damage, radius, hits, drop, high} | player (the plunge landed) |
| `lantern:pickup` / `lantern:drop` | {pos} | player |
| `staff:pickup` | — | lighthouse (player listens and equips) |
| `door:blocked` | {reason:'dark'|'shut'} | lighthouse |
| `tower:enter` / `tower:exit` | — | lighthouse |
| `lamp:placed` / `lamp:cured` | — | lighthouse |
| `talk` | {who, line, index} | creatures (Halloran) |
| `negative:freed` | {kind,pos} | creatures |
| `monster:killed` | {kind,pos,boss} | monsters |
| `storm:pickup` | {first} | lighthouse (Halloran's storm lantern, `G.items.storm`) |
| `storm:placed` / `lamp:failed` | — | lighthouse (the plain flame in the cradle; the ink drinks it) |
| `lamp:pulse` | — | lighthouse (after the failure the ink surges at whoever is in the lamp room) |
| `logbook:read` | — | lighthouse (Maren's logbook on the lamp-room sill) |
| `stag:engage` | — | monsters (the Hollow Stag leaves its guard over Maren's lantern) |
| `finale:start` | — | flow (when you step outside after lamp:cured); finale_boss.js answers it — the Stag no longer does |
| `boss:dead` | {who:'stag'\|'gloaming'} | monsters (stag) / finale_boss (gloaming). Only `who:'gloaming'` ends Act 1 |
| `map:waypoint` | {id, quiet} | map (a waystone unlocked; quiet = granted from an old save / home) |
| `map:travel` | {id, phase:'start'\|'arrive'\|'done'} | map (fast travel: fade out → moved → faded back in) |

## Module briefs (who owns what)
**world.js** — `G.world.height/walkable/landmarks` (synchronous), terrain mesh(es) with vertex colours (cel-shaded), sea (animated), sky dome (dusk gradient + moon + stars faint), fog, sea stacks, forest (instanced trunks/canopies; colliders for trunks), moor heath + wildflowers, local grass that follows `G.focus` for density, rocks, ruined hamlet, standing stones, stone walls, keeper's cottage + shed with warm windows, the cliff-path ramp, the Resisting Tree, path rendering, mushrooms visuals, atmosphere application (reads `G.atmo`), hemi/sun colours. Registers colliders for trees, rocks, buildings.
**lighthouse.js** — tower at landmarks.lighthouse, interior spiral stairs (port the logic from `/home/claude/the-moth-climb.html`: floor provider, wall constrainer, hatch, darkness veil in the doorway that only lets you through with a lit lantern), the Keeper's Staff in a glowing wall bracket on the stairs about halfway up, lamp room with cradle/lens/corruption blob, cure sequence (`G.atmo.cured`, beam, lamp light) → emits events. Fills `G.world.lighthouse = {x,z,baseY,topY,outerR,innerR,colR,doorAngle,doorOut:Vector3,doorIn:Vector3,lampCenter:Vector3,glassPoints:[Vector3],inBody(v),inRoom(v),inside(v)}` at script-evaluation time.
**player.js** — the Traveler (model per style guide), controller, Zelda-like camera, lock-on, roll, glide, sprint/stamina, staff combat, lantern carry/drop/shutter, `G.player` API, `G.models.lantern/staff`, hurt/death/respawn. Sets `G.focus` every frame.
**creatures.js** — moth swarm (on the lamp-room glass from the start; drawn to corruption: lantern, patches, negatives, monsters), patch decals, passive negatives (freed by the swarm), Halloran (Unmade NPC with dialogue). **monsters.js** — hostile monsters + the Hollow Stag boss.

## Testing
The test machine is small (2 cores, software-rendered Chrome), so testing is tiered — don't run the full suites after every change:
1. **While working**: `node --check` your files, `python3 test/quick.py [url]` (~1–2 min smoke test: boot, loop, every cave room,
   no errors), plus your own targeted script for the feature (start from a state with `G.debugStartLoop()`,
   `G.debugEnterCave(room)` or the test tools' start points instead of replaying the story).
2. **Once, at the end of a task**: the full suites that cover what you touched — `test/e2e.py` (Act 1), `test/loop_e2e.py`
   (core loop), `test/cave_e2e.py` (the cave). The lead runs all of them again after merging.
- Add `&headless` to test URLs (the suites do): the game still updates in real time but only draws frames after a `G.step()`
  and ~2 a second otherwise. Before a screenshot of something animating, call `G.headless.draw(3)` and wait ~250 ms.
- Several agents may share the machine: use your own server port (`python3 -m http.server <port>` in your checkout) and pass
  the URL to the suites (`python3 test/cave_e2e.py http://localhost:<port>/dev.html?debug&headless`).
- Server: `http://localhost:8800/dev.html?debug` (if not running: `sh test/serve.sh &`). Rebuild dev.html after changing index.html or adding a module: `python3 test/build_dev.py`.
- Screenshot helper: `python3 test/snap.py --out /tmp/claude-0/yourname.png --begin --js "G.player.teleport(160,42,0,0)" --js "..."` (see its docstring). Put your screenshots under `/tmp/claude-0/<module>/`.
- Headless WebGL is software-rendered: a few fps. For movement/AI tests, step deterministically with `G.step(1/30, n)` inside `--js`, then screenshot.
- To get into play without flow.js: `document.getElementById('title').hidden=true; G.setMode('play')`.
- Always `node --check js/yourmodule.js` before finishing. Your module must not throw if other modules are missing (guard with `G.world.lighthouse && ...`, `G.models.lantern ? ... : fallback`).
- Performance budget: aim for 60 fps on an M-series MacBook. Use InstancedMesh for anything repeated, merge static geometry where easy, keep shadow-casting objects reasonable, keep draw calls in the low hundreds.

## Reference files
- Design doc: `design/lighthouse-game-design-v2.md`
- Style guides (open them with the Read tool to see them): `design/art/style-guides/gentle-gothic-style-guide.png`, `design/art/style-guides/traveler-character-style-guide.png`, `design/art/style-guides/traveler-character-style-guide-prompt.txt`
- Previous single-file prototype to port logic from: `/home/claude/the-moth-climb.html` (tower stairs, darkness veil, lamp cure, moths, negatives, Halloran)

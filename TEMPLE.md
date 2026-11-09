# The Vigil (the cursed temple) — shared design spec (binding, v31)

Read CONTRACT.md, UNDERCROFT.md (the pattern to copy: it copied CAVE.md), LOOP.md and PROGRESSION.md first.
The story is the Story Bible (Claude Doc "Brave Quest: Lighthouse — Story Bible"); the parts the temple needs are below.
Talk cards: js/talk.js (`G.talk.open`, `G.talk.moment`), portraits: js/portraits.js (`G.portraits.add`).

Heath's decisions (2026-11-08):
- The cursed temple comes next, before the north island.
- The player is **Rowan Knox**, a sailor who grew up in Wickham's End. **Hesper Halloran** (renamed from Maren; Halloran's
  daughter, keeper after him, Rowan's love) went into the wood last spring. Her pet name for him is **Tide**.
- **Hesper is alive in the temple**, half ink, holding the first seam shut. Afterwards she **goes back to keeping the light**,
  because a kept light is what holds the fog off the island. Rowan is quiet, not mute.
- Every dungeon ends in a real boss fight.

The idea in one line: the cave was about *light*, the Undercroft about *memory*; the Vigil is about *keeping* — the old
islanders kept a vigil for a light that was not light, and it took something for every prayer it answered. Hesper is keeping
the last vigil the right way: holding the door shut with herself.

## The story beats (everyone writes to this)
- **Where it comes from.** Before the lighthouse, the islanders kept a vigil in a sunken temple in the old wood around a
  violet glow in the floor (the **first seam**). It answered prayers and took names, years, light. The first keepers sealed it
  and built the lighthouse on the far headland to watch the dark from a safe distance. The keepers' cave seam, the lens in the
  pool and Crane's tithe are all echoes of that first bargain.
- **Why Hesper went.** She worked out that the cave seam was a crack, not the source. Wren and Crane told her about the
  temple. She left her violet lantern in the roots of the Resisting Tree on purpose: the Vigil feeds on violet light.
- **What Rowan finds.** Pages of hers through the temple (she is always one room ahead), the temple as it was through the Glass,
  and at the heart, Hesper, half ink, kneeling with both hands on the seam. Talk card: she knows him at once ("You're late,
  Tide." — then the rest). She can't let go without the thing coming through; when she does, they fight it together.
- **The end.** The seam closes. Hesper comes back to herself (some ink stays: a mark on one hand). Through the Glass the back
  wall of the sanctum shows a carving of an island to the north with a tower on it, where the false light came from (the hook
  for the north island; nobody explains it). Hesper goes home to keep the light: she appears at the lighthouse afterwards
  (lamp room / gallery), with a reunion line for Halloran and loop lines for Rowan.

## When and where
- **Unlock:** Wren is saved (`undercroft:saved {who:'wren'}`). Afterwards Wren (at the hamlet well) has a talk choice about
  Hesper that tells Rowan about the temple and marks it on the map (quest marker + caption). If Wren is already saved in a
  save from before this version, the marker appears on load.
- **Entrance:** a sunken hollow in the old wood, past the Resisting Tree (`lanternSpot`, about (−160, 9, 9)): a ring of
  leaning standing stones around a stone stair going down to a door choked with ink roots. The roots are cleared the way
  blights are — the swarm (a baited lantern, or the lantern near) eats them. Expose `G.world.landmarks.vigilDoor`.
- **Order:** after the Undercroft (it needs Wren). Tune for 5–7 hearts and the staff moves.
- **Interior:** a separate space at **origin O = (−800, 60, 0)** (cave: (0,60,800), Undercroft: (0,60,−800)). Enter/leave
  like the Undercroft (interact, fade, teleport; the swarm and the jar come along). `G.interior` belongs to whichever interior
  is inside. Dark inside; fog hidden (add `G.temple.inside` to fog.js's check, as the Undercroft did).
- **Fast travel:** a 9th waystone, **The Vigil** (unlocks on first entry), `G.temple.enter('vestibule',{instant:true})`.

## Layout (local coordinates; floor = walkable height)
Older and stranger than the Undercroft: cut stone, not brick; tall narrow halls; bronze mirrors green with age; carved
watchers with hollow eyes; moth-wing patterns in the floor; the violet glow under everything, stronger as you go down.
Light: your lantern, plus **vigil braziers** you can light (same economy as the Undercroft's candles: 5 ether, first free).

| id | room | centre | notes |
|---|---|---|---|
| `vestibule` | The Stair of Watchers | (0, 0, 0) | Down from the wood. Entry, exit, checkpoint, first brazier. A first page of Hesper's. |
| `nave` | The Hall of Mirrors | (0, −3, −30), about 14×40 | Tall and long. **Beam puzzles** (below). Vigilants. |
| `reliquary` | The Reliquary | (−24, −4, −40) | Off the nave. The **Vigil Lens** (the new tool) is found here: the mid-dungeon reward moment. |
| `cloister` | The Drowned Cloister | (24, −6, −46) | Half the floor is gone; the way across exists only **in the past** (Glass), like the Undercroft's doorway, but longer: a whole walk. Echoes of the old vigil. |
| `well` | The Moth Well | (0, −10, −70) | A deep round shaft with a spiral walk. **Swarm puzzle**: the way down is sealed by ink that only a large swarm can eat, and the swarm must be split/spent (feed one seal and lose those moths, choose which). Moth bait refills here (a moth roost, like the cave). |
| `sanctum` | The Sanctum of the Seam | (0, −16, −100), radius 18 | The boss arena. Hesper at the seam in the centre. Back wall carving (Glass). After the boss, a short exit stair opens back to `vestibule`. |

≥ 4 Hesper pages across the temple (author `Hesper`), plus 1–2 older keepers' inscriptions (author "An old hand").
Checkpoints / soft-lock guards / stranded fallback: copy the Undercroft. Persist `temple.reached`.

## The Vigil Lens (new tool)
A keeper's burning-glass that fits the lantern's front. **Hold the shutter action** (F / controller RB) while the lantern is
open to narrow the lantern into a focused **beam** (≈ 14 m, cone ≈ 6°), aimed with the camera; release to open it again.
A tap still toggles the shutter as before — the hold must start only after ~0.3 s, and must not close the shutter.
- The beam **burns ink**: ink-root seals and ink "skins" on monsters (see Vigilants) wither under ~1.2 s of beam.
- It **reflects off bronze mirrors** (beam puzzles in the nave: turn mirrors with interact to carry the beam to a seal, a
  watcher's eyes, a sun-disc door).
- It **wakes things**: Vigilants hear the beam (they turn toward a focused beam within 25 m).
- Moths don't follow a focused beam (the swarm hangs back while it's on) — a cost.
- After the temple, the Lens works on the island too: ink-root shortcuts (2–3 small ones; Place agent picks spots) open.
Persist with the item (`G.items.lens`), and a reward card when found.

## Monsters and the boss
- **Vigilants** (new): hollow-eyed acolytes in grey robes of fog, with an ink skin. They hunt by light: lantern open or beam on
  → they come; shutter shut → they lose you after a few seconds. Staff hits glance off the ink skin until the beam burns it
  (then they're ordinary). 2–4 per room, never in the sanctum.
- Plus existing hollows and 2 hounds (the well).
- **The boss: The Answer** — what has been pressing through the seam since spring. Fight target 4–5 minutes.
  - Phase 1 (Hesper still holding): hands of ink reach up out of the seam around her; burn their skin with the beam, strike them;
    she calls warnings (captions, not cards). If the hands reach her, she loses ground (a visible ring of ink grows).
  - Phase 2 (≤ 60 %): she lets go so Rowan can fight it; the Answer rises — a tall shape of violet light with a hollow inside,
    the "light that was not light". It is the inverse of the Gloaming: **solid only when the lantern is shut**; in the light it
    is only glare. Fight it in the dark with the swarm hanging back.
  - Phase 3 (≤ 25 %): it pulls the moths into itself; Hesper shields the swarm; Rowan must hold the beam on the seam while she
    seals it (a timed hold under attack).
  - Reward: a heart (the 9th heart source), and the Lens upgrade (a longer beam) or ether — boss agent's call.
- Never break `G.monsters` contracts; register the Answer through the same boss bar API the others use.

## Ownership (never edit another owner's file)
| file | owner |
|---|---|
| `js/temple.js` (new), `js/temple_puzzles.js` (new), `js/lens.js` (new), small hooks in `js/core.js` (shutter hold), `js/fog.js` (inside check), `js/world.js` (only a new, self-contained `vigil` section: the hollow, stones, stair, door, landmark; touch nothing else in world.js), `js/map.js` (9th waystone + travel path) | **Place agent**: geometry, darkness, braziers, checkpoints, enter/exit, the Glass past-layer walk, mirrors and beam puzzles, the moth well puzzle, the Lens (item, beam, burning, reflections, island shortcuts), `G.temple`, `G.lens`, devtools start points (`temple`, `temple-well`, `temple-boss`), persist keys `temple`, `lens` |
| `js/temple_boss.js` (new), `js/temple_people.js` (new), `js/monsters.js` (Vigilants only, appended), `js/progression.js` (9th heart source), `js/audio.js` (temple ambience + Answer, synth placeholders; reserve Suno names `answer_rise, answer_hands, answer_glare, vigilant_hiss, vigilant_burn, seam_close, lens_beam`) | **Boss agent**: Vigilants, monster placement, the Answer, Hesper in the sanctum (talk cards, warnings), the ending scene, the carving reveal, Hesper at the lighthouse afterwards (+ Halloran's reunion line, via `API.halloranHooks` in creatures.js — add the hook from temple_people.js, don't edit creatures.js), Wren's temple talk choice (via undercroft_people.js's public API only; ask if you need a hook), Hesper's temple pages, persist keys `templeBoss`, `templePeople` |
| everything else (flow.js, creatures.js, lighthouse.js, cave_boss.js, companions.js, undercroft_people.js, undercroft_boss.js, portraits.js, the Maren→Hesper rename, the new opening) | **Story agent** (separate brief) |
| `index.html`, `dev.html`, `test/build_dev.py`, `.github/workflows/tests.yml` | **lead** only. `build_dev.py` already lists `temple.js, lens.js, temple_puzzles.js, temple_people.js, temple_boss.js` (auto-included into dev.html when they exist); the lead adds the `<script>` lines to index.html and `temple_e2e` to the CI matrix when merging |

Names: write **Hesper** everywhere in new code and text (the Story agent is renaming Maren in old code in parallel). For
Hesper's portrait, use portrait id `hesper` if `G.portraits` has it, otherwise register your own `hesper-ink` (half ink, the
seam's violet under her) with `G.portraits.add` in temple_people.js — the half-ink one is right for the sanctum anyway.

## APIs (exact names)
```
G.temple = { inside, origin:Vector3, toWorld(x,y,z), toLocal(v), room(pos)->id|null,
             rooms:{id:{centre, bounds:{min,max}, anchors:{name:Vector3}}}, enter(roomId?,opts), exit(opts),
             lightBrazier(id), isLit(room), door:Vector3(world), open:bool, unlocked:bool }
G.lens   = { owned, focused, beam:{origin:Vector3, dir:Vector3, length, hit:{pos,object,kind}|null},
             burnable(add/remove: {pos, radius, onBurn, needs:seconds}), mirrors }
// events: temple:unlock, temple:open, temple:enter {room}, temple:exit, temple:room {id}, temple:lit {room},
//         temple:puzzle {id, solved}, lens:found, lens:focus {on}, lens:burn {id}, temple:bossStart,
//         temple:bossPhase {n}, temple:bossDead, temple:hesper {state:'found'|'freed'|'home'}
```
Anchors the Place agent exports: `vestibule.entry`, `vestibule.brazier`, `nave.mirrors` (array), `nave.seals` (array),
`reliquary.lens`, `cloister.echoes` (array), `well.roost`, `well.seals` (array), `sanctum.centre`, `sanctum.seam`,
`sanctum.hesper`, `sanctum.carving`, `sanctum.exit`, `pages` (array of {id,pos}), `braziers` per room.
Until temple.js lands, use `O + local` from the table.

## Testing
- Build: `python3 test/build_dev.py`. Start points as above.
- New shared test `test/temple_e2e.py`: each agent adds its section (Place: enter/exit, braziers, the Glass walk, the Lens,
  mirrors, the well; Boss: Vigilants, the three phases, Hesper's scenes, reward, Hesper at the lighthouse; shared: save and
  reload, Continue inside). Run it on CI with the `suites` input (the lead adds it to the default matrix when merging).
- The machine has 2 cores and other agents share it: **one headless browser at a time, your own port, short targeted runs
  locally.** Run the full suites on GitHub Actions instead: push your branch, then
  `gh api -X POST repos/nattyman/bravequest-lighthouse-3d/actions/workflows/tests.yml/dispatches -f ref=<branch> -f 'inputs[runner]=github'`
  (add `-f 'inputs[suites]=a,b'` for a subset) and read results with
  `gh api "repos/nattyman/bravequest-lighthouse-3d/actions/runs?branch=<branch>"` and `.../runs/<id>/jobs`, logs at
  `.../actions/jobs/<job id>/logs`. cave_e2e is known to be flaky (crab on the raft, gust timing): rerun before blaming yourself.
- Screenshots in `/tmp/claude-0/temple-<you>/`. Look at them.
- Performance: the whole interior ≤ ~160 draw calls; the past layer ≤ ~30 more.

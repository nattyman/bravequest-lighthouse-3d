# The Hamlet Undercroft — shared design spec (binding, v21)

Read CONTRACT.md, LOOP.md, CAVE.md (the sea cave is the pattern to copy) and PROGRESSION.md first.
Fiction: `design/lighthouse-game-design-v2.md` (the Unmade, logbooks, ether/corruption/fog are one anti-life system).

Heath's decisions (2026-11-03):
- **One of the Unmade can be saved.** This answers part of a question the game has kept open until now.
- The new tool is the **Remembering Glass**.
- **There is as much combat as in the sea cave**, and every dungeon ends in a real boss fight.
- The dungeon is built by a team of agents.

The idea in one line: the cave was about *light*; the Undercroft is about *memory*. The fog unmakes people by taking their
names. The Glass shows what was taken, and the boss is the man who handed the names over.

## The story (everyone writes to this)
- The hamlet was **Wickham's End**. When the fog came, its reeve **Aldous Crane** struck a bargain. He wrote every villager's
  name into the **Tithe Ledger** and gave the ledger to the fog, so that he could keep his own name.
  - The village unmade slowly, from the outside in. Crane became the **Tithe-Keeper**: he is still himself, swollen with
    other people's names, and he still keeps the ledger in the barn store below.
- **Why one person can be saved.** This logic must hold and must be stated in-game, through Tamsin and the logbooks:
  - An Unmade person is ink grown over a person.
  - **Moths eat the ink**, the same rule that cured the lighthouse.
  - But if the name is gone, nothing is left under the ink to come back, and the moths would eat everything.
  - With the name returned and the corruption still shallow, the moths can eat the ink and leave the person.
  - Only **Wren** is shallow enough. For everyone else the name brings rest, not return.
  - This deliberately hints at Maren and Halloran without deciding them.
- **The villagers.** Four half-Unmade, each a different stage. They are NPCs, not monsters: they never attack, and the player
  can't hurt them (staff strikes pass through with a soft ash puff).

| id | who | stage / look | role |
|---|---|---|---|
| `tamsin` | **Old Tamsin**, the midwife | deep: half her body is ink, one eye still bright | **Warns.** The guide. Tells the truth, and is the one who explains names and moths. Her name returned → she rests (dissolves into moths, gently). |
| `corwin` | **Corwin**, Crane's clerk | middle: ink sleeves and an ink mouth | **Lies.** Friendly and helpful-sounding, he steers you toward traps and toward Crane. Seen through the Glass, his lies show as ink running through his caption (see Talk). Name returned after the boss → he confesses, then rests. |
| `wren` | **Wren**, the miller's daughter | shallow: grey skin, ink only at her fingertips and hair | **Begs.** "Find my name. Please. I can feel it going." She is the one who can be saved. |
| `miller` | **Hob the miller** | almost gone: an ink shape at a millstone | **Repeats** one sentence, which turns out to be a puzzle clue: "Three for the grain, two for the well, one for the reeve." |

## When and where
- **Unlock:** the core loop is active, and the **Choked Well** blight is cured (`blight:cured {id:'well'}`).
  - Curing the well withers the ink roots that bound the **cellar trapdoor** in the floor of the largest hamlet ruin, next
    to the well. Expose it as `G.world.landmarks.undercroftDoor` (pick the exact spot by sampling: ruin floor, ~4 m from
    the well).
  - First time the door is open and the player is within 40 m: caption, plus a quest marker on the map.
  - Halloran gets one new line about the hamlet ("Crane kept the tithe. Kept more than that, by the end").
- **Order:** it can be done before or after the sea cave. Tune it for a player with 3–5 hearts and the staff moves
  (charged bolt, Skyfall Slam). The moth jar is **not** required; recruitment works the way the cave roost does.
- **Interior:** a separate space at **origin O = (0, 60, −800)**. The cave uses (0, 60, 800); y is +60 for the same reason.
  - Enter and leave through the same pattern as the cave: interact, fade, teleport. A baited swarm and the jar come along.
  - Only one interior is active at a time, so `G.interior` belongs to whichever of `G.cave` or `G.undercroft` is inside.
  - Inside it is dark (`G.atmo.darkTarget = 1` from a system with order > 10) and the fog is hidden. Copy how cave.js does it,
    and add `G.undercroft.inside` to fog.js's check.
- **Fast travel:** add an 8th waystone, **The Undercroft** (unlocks on first entry). It travels via
  `G.undercroft.enter('stair',{instant:true})`, and the same blocking rules apply.

## Layout (local coordinates; floor = walkable height)
It is low, close and man-made, unlike the cave: brick vaults, packed earth, root-split walls, shelves of jars, old furniture.
Light comes from your lantern plus **ether candles** you can light (the economy of the cave's veins: 5 ether units each; the
first one is free). A lit room stays lit.

| id | room | centre | notes |
|---|---|---|---|
| `stair` | The Trapdoor Stair | (0, 0, 0) | Down from the hamlet. Entry, exit, checkpoint, first candle (tutorial). Dry. |
| `cellars` | The Joined Cellars | (0, −2, −24), about 30×20 | Five family cellars knocked through into each other, one per hamlet house, each with a few belongings that tell its family. **Tamsin** is here. A collapsed wall blocks the way on, and its real way through only shows in the Glass. Monsters: 3–4 hollows plus **Nameless** (below). |
| `chapel` | The Crypt Chapel | (−22, −4, −48) | Pews, a font, a parish **register** with names scratched out; Wren's page has been torn from it. **Corwin** waits at the door. Puzzle: the **bell-rope order** (Hob's sentence). The **Remembering Glass** is found here, in the sexton's niche: a mid-dungeon reward moment, like the moth jar. **Wren** is in the side vestry. |
| `mill` | The Mill-Race | (22, −6, −50) | An underground stream turning a dead millstone. **Hob** is here. Puzzle: set the sluice gates (three for the grain, two for the well) to turn the millstone, which raises the barn-store portcullis. Brinelings are not used here; monsters are Nameless plus 2 hounds. |
| `store` | The Tithe Store | (0, −8, −80), radius 16 | Grain bins and tithe sacks. The boss arena. Beyond a back door is the reeve's strongroom, with the **Tithe Ledger** on a lectern. After the boss, a short exit shaft opens back to `stair`. |

Every room has at least 2 candles. There are ≥ 3 logbook or letter pages across the dungeon (Crane's own hand among them),
using `G.ui.say(text,'<author>')`.

Checkpoints and soft-lock guards: copy the cave's model.
- Rise at the deepest spot you have stood in that has an open way back to the stair.
- Offer "Follow the draught back" when stranded.
- Persist `undercroft.reached`.

## The Remembering Glass (new tool)
A cracked keeper's lens in a brass ring. It is the lighthouse lens's little sister.
- **Use:** hold the Glass button to raise it. Keyboard **G**; on a controller, **hold Y** (Y currently does interact on a
  tap; a hold over 0.35 s raises the Glass); on touch, a Glass button next to the lantern button. Add an `glass` action and
  update the HUD legend and CONTRACT.md.
  - While raised, the player walks slowly (no sprint, roll or attack), the view gets a soft sepia-violet vignette, and the
    **past layer** shows.
- **The past layer** is a separate group of meshes that only render while the Glass is raised. It holds:
  - **Old doorways and stairs** that are gone now. They are walkable while the Glass is raised: the past is solid to the
    one who remembers it. Lower the Glass mid-way and you are pushed gently back to the present floor (never trapped).
  - **The villagers as they were:** a warm, translucent echo standing over each Unmade.
  - **Echo scenes:** 3–6 s ghost vignettes at fixed spots (the bargain, a family at supper, Wren at the mill), each with a
    caption. Five in the dungeon.
  - **Lies:** see Talk.
  - **The real Crane** in the boss fight.
- **On the island,** after the dungeon:
  - The Glass shows **echoes** at 4 places: the cottage, the lighthouse gallery, the standing stones and the hamlet square.
    Each is short lore, and one of them points at Maren.
  - It shows **any heart shard or cache within 25 m** with a soft outline, even through walls.
  - It is no puzzle key on the island: Act 1 and the core loop must stay solvable without it.
- **Stamina:** it doesn't cost stamina. Keep it a pure "look" tool.
- **API:** `G.glass = {owned, raised, raise(on), pastLayer:THREE.Group (shared root; others add children), addPast(obj),
  addEcho({pos, r, lines, who}), canSee(pos)}`. Events `glass:raise {on}`, `glass:echo {id}`. Persist key `glass`.

## Talk (new, shared)
A small conversation card for the villagers (and, later, anyone). It must work with mouse, touch and controller, and must
respect the caption speed setting.
- `G.talk.open({who, portrait?, lines:[...], choices:[{text, next|action, needs?}], onClose})`. It pauses play the way the
  map does.
  - Each line uses the caption system's typing speed. Advance with Enter, A or D-pad down.
  - **2–3 choices**, picked with click, tap, up/down plus Enter, or the D-pad plus A.
  - Lines are logged in the pause menu's Messages tab.
- **Lies:** a line can be flagged `{lie:true}`. With the Glass raised (allowed during talk: G, Y or the Glass button toggles it),
  a lie's text runs with ink: a CSS effect, with the words bleeding dark violet. A small "Ink in his words" tag appears too, so
  it isn't colour-only.
  - Corwin's lies point to a trap room in the cellars (a collapsing floor into a Nameless pit, survivable) and to "the reeve
    is your friend".
- Talking to each villager more than once moves their story on; keep state per villager.

## Saving Wren (the centre of the dungeon)
1. Wren begs for her name. Her page was torn from the chapel register.
2. Through the Glass, the register shows the torn page being taken to the store, so Crane has it.
3. After the boss, the **Tithe Ledger** holds every name. Reading it gives you `names` for Tamsin, Corwin, Wren, Hob and
   the rest of the village.
4. Speak a name to its owner: a talk choice, "Wickham Tamsin Rowe", for example.
   - **Tamsin, Corwin, Hob:** they remember, say a last line, and **rest**. They come apart into a gentle drift of
     pale moths (not ash) that flies up the stair.
   - **Wren:** she remembers and doesn't rest. Tamsin, or the Glass's echo of her, has told you what's needed: "The moths
     will eat what isn't her now."
     - You must bring **20 moths** (a baited swarm or the jar) and protect her for ~10 s while they feed. Reuse the
       seal/blight feeding logic.
     - Nameless crawl up from the floor to eat the moths.
     - Then the ink is gone and **Wren is restored**: a reward moment, "Wren of Wickham's End".
5. **After:** Wren walks up into the hamlet and lives at the cured well spring as an NPC.
   - She has new lines for every step of the loop, and she later sells or swaps one thing: a **Wren's Loaf**, a light healing
     food. It's a new ingredient for Mender's Draught or eaten directly for +1 heart. Keep it small.
   - Halloran gets a line when he hears: "She came back? …Nobody comes back." Do not resolve him.
6. If the player leaves without saving her, nothing is lost: she waits in the vestry.

## Monsters and the boss
- **Nameless** (new monster kind in monsters.js): villagers too far gone to talk. They are faceless, hunched and slow, and
  shuffle in twos and threes.
  - They grab: a slow two-hand lunge with a clear wind-up, 2 half-hearts.
  - HP 4. They drop ichor.
  - Through the Glass you see who they were (an echo), which is purely a tone thing.
  - They're placed in cellars, mill and chapel, plus the Wren-saving defence. Combat is "the same as the cave": about
    12–16 hostiles across the dungeon, counting hollows and 2 hounds.
- **The Tithe-Keeper** (boss, `store`): Aldous Crane, tall and gaunt in a reeve's coat, with ledger pages for skin and a
  thousand names written over him in moving ink. Gentle Gothic: eerie and sad, not gory. Boss bar: "Aldous Crane, the
  Tithe-Keeper".
  - **Phase 1 — The Tithe.** He walks the store reciting names. Attacks:
    - a **quill strike** (a telegraphed line of ink stabbing across the floor);
    - a **page storm** (a cone of sharp pages; dodge or roll);
    - **"Tithe!"**: pulls 1–2 Nameless out of the grain bins.
    - Normal hits land. HP pool ~40 at staff damage values.
  - **Phase 2 (≤ 60 %) — The Borrowed.** He splits into **4 copies** shaped like the villagers you've met. Only one is real.
    - **Through the Glass the real one shows warm and solid,** and the copies show as empty ink.
    - Hitting a copy bursts it into a page storm at you.
    - While the Glass is up you can't attack, so the loop is: look, mark, lower, strike. Give the real one a faint tell
      without the Glass too (a slight shadow lag) so the fight is never impossible.
    - The copies re-form every ~15 s.
  - **Phase 3 (≤ 25 %) — The Bargain.** He opens the ledger and the names start pulling the moths in the room toward him,
    eating your swarm.
    - Use the Skyfall Slam to scatter the pages, or the charged bolt to hit the open ledger (a 3-hit weak point), so he
      staggers.
  - Target fight: 3–4 min for a decent player. On death, emit `undercroft:bossDead`, never `boss:dead`.
  - Respawn: at the store door. The fight resets cleanly.
  - **On defeat:**
    - He comes apart into a whirl of pages that settle into the ledger.
    - The strongroom door opens; the ledger becomes takeable (a reward moment, "The Tithe Ledger").
    - Crane's last page reads "I kept my name. I didn't keep anything else."
    - The exit shaft opens.
  - **Rewards:** a **Keeper's Heart** (max hearts 7 → **8**: update progression.js's boss-heart sources and PROGRESSION.md),
    **2 Keeper's Marks**, and the **Remembering Glass** kept for good.

## Ownership (never edit another owner's file)
| file | owner |
|---|---|
| `js/undercroft.js` (new), `js/glass.js` (new), small hooks in `js/core.js` (glass input action + the `glass` pad/key binding), `js/fog.js` (inside check), `js/world.js` (trapdoor + landmark), `js/map.js` (8th waystone + travel path) | **Place agent**: geometry, darkness, candles (visual + economy), checkpoints, enter/exit/transition, past-layer content (doors, stairs, echo scenes, island echoes), `G.undercroft`, `G.glass`, devtools start points (`undercroft`, `undercroft-chapel`, `undercroft-boss`), persist keys `undercroft`, `glass` |
| `js/talk.js` (new), `js/undercroft_people.js` (new), `js/creatures.js` (Halloran lines only), `js/hud.js` (Glass button, legend rows, talk card styles if they live there) | **People agent**: the talk card, the four villagers and their scripts, lies, pages and echo captions text, the register, the bell-rope and sluice puzzles, saving Wren (feeding logic reused from moths.js through its API), Wren in the hamlet afterwards + Wren's Loaf, discovery caption/quest, persist key `undercroftPeople` |
| `js/undercroft_boss.js` (new), `js/monsters.js` (Nameless), `js/progression.js` (8th heart source), `js/audio.js` | **Boss agent**: Nameless, monster placement in the Undercroft, the Tithe-Keeper, the ledger reward, all Undercroft audio (ambience: dripping brick, low choir hum, mill-race water; synth placeholders, reserve Suno names `crane_recite, crane_quill, crane_pages, crane_split, crane_death, nameless_grab, glass_raise`), persist key `undercroftBoss` |
| `flow.js`, `index.html`, `alchemy.js`, `player.js`, `lighthouse.js`, `cave*.js` | lead: don't edit; ask in your report if you need a hook (the lead adds new `<script>` lines) |

## APIs (exact names)
```
G.undercroft = { inside, origin:Vector3, toWorld(x,y,z), toLocal(v), room(pos)->id|null,
                 rooms:{id:{centre, bounds:{min,max}, anchors:{name:Vector3}}}, enter(roomId?,opts), exit(opts),
                 lightCandle(id), isLit(room), door:Vector3(world), open:bool }
// events: undercroft:open, undercroft:enter {room}, undercroft:exit, undercroft:room {id}, undercroft:lit {room},
//         undercroft:puzzle {id, solved}, undercroft:bossStart, undercroft:bossPhase {n}, undercroft:bossDead,
//         undercroft:name {who}, undercroft:rest {who}, undercroft:saved {who:'wren'}, glass:raise {on}, glass:echo {id},
//         talk:open {who}, talk:choice {who, id}, talk:close {who}
```
Anchors the Place agent exports (other agents build at them):
- `stair.entry`, `stair.candle`
- `cellars.tamsin`, `cellars.wall` (the past doorway), `cellars.trap`
- `chapel.corwin`, `chapel.register`, `chapel.niche` (the Glass), `chapel.vestry` (Wren), `chapel.ropes` (array of 3–5)
- `mill.hob`, `mill.gates` (array), `mill.stone`
- `store.door`, `store.centre`, `store.bins` (array), `store.lectern`, `store.exit`
- `candles` per room, `echoes` (array of {id,pos})

Until `undercroft.js` lands, use `O + local` from the table.

## Testing
- **Build:** `python3 test/build_dev.py`. Order: undercroft.js, glass.js, talk.js, undercroft_people.js, undercroft_boss.js,
  after the cave modules.
- **Start points:** devtools start points as above.
- **Rules:** every agent keeps `test/quick.py`, `test/e2e.py`, `test/loop_e2e.py`, `test/cave_e2e.py`, `test/travel_e2e.py`
  and `test/captions_e2e.py` passing, and runs `node --check`.
- **New test:** add a shared `test/undercroft_e2e.py`. Each agent adds its own section.
  - Place: enter and exit, the Glass doorway.
  - People: talk with mouse and controller, lies, saving Wren.
  - Boss: phases, the copies, rewards, the 8th heart.
  - Shared: save and reload; Continue inside.
- **Machine:** only 2 cores. One headless browser at a time per agent; use your own port.
- **Screenshots:** in `/tmp/claude-0/undercroft-<you>/`. Look at them.
- **Performance:** the whole interior ≤ ~150 draw calls, and the past layer ≤ ~30 more.

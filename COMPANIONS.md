# Companions: Ember the fox and Corvin the raven

Binding spec for the companion feature, from Jacob's idea and Heath's decisions (2026-11-06):

- The player can have **both** companions at once.
- Companions **cannot be hurt**.
- They **help a little** in fights, and nothing they do in a fight matters much.
- Their real job is puzzles: small, optional detours with a reward. The main path never requires a companion.

The names are working names, and Heath can change them. They live in one place in the code (`COMP_NAMES` in companions.js) so a rename is a one-line change.

## 1. Who and how you get them

**Ember, the fox**
- The first fox negative you free stays with you; the other foxes still run home.
- The moment you free it, it shakes itself, looks at you, and trots to your heels. Caption: *"The fox doesn't run. It sits, and looks at you, and waits."*
- From then on it is "Ember". Halloran, the next time you talk to him: *"That one's taken a shine to you. Foxes don't, as a rule."*
- **Existing saves:** any save that already has a fox freed gets Ember when it loads, beside the player, with no caption.

**Corvin, the raven**
- A new negative kind, `raven`. It is the anti-shape of a raven: a raven-shaped hole that hops and flaps without sound.
- It roosts on the **standing stones**.
- You free it like other negatives: weaken it, then lantern-cure it. It flies just out of reach and lands again, so it takes a lantern-cure while it is perched on a stone.
- When freed, it lands on the player's shoulder, then circles overhead and settles into following. Caption: *"The raven lands on your shoulder, light as a glove. It doesn't leave."*
- It counts toward the "negatives freed" total, which becomes 9. Update every "of 8" string.
- If the standing stones are not reachable until after Act 1, it is first available in the core loop. Either way is fine; say which.

## 2. Following

- **Ember** trots at heel about 2.5 m behind, offset to one side.
  - It sits when you stop for 2 s and lies down after 10 s.
  - It runs to catch up and never blocks your path: it is not a collider for the player.
  - It swims slowly with its head up.
  - It waits at the bottom of ladders, ropes and vertical climbs, then reappears beside you at the top.
- **Corvin** flies in loose circles 4–8 m above and behind you.
  - It lands on nearby posts, rails and rocks when you stand still, and sometimes on your shoulder.
- **Either companion:**
  - If it is more than 35 m away, or it has no route, it catches up out of sight: it fades out and reappears near you just out of camera view, never popping on screen.
  - Both come along through fast travel, into the sea cave and the Undercroft, and onto the raft.
  - In the lamp room, the finale, and cutscenes, they wait outside and rejoin afterwards.
- **Scary moments:** both stay in the scene and look alert, but stay out of the way.

## 3. Commands

| | Keyboard | Controller | Touch |
|---|---|---|---|
| Ember: go / fetch | **R** | D-pad left | Small fox button next to the action buttons |
| Corvin: go / scout | **T** | D-pad right | Small raven button |

- **At a companion spot**, the prompt says *"R  Send Ember through the gap"* (or *"T  Send Corvin up"*), and pressing the key sends them.
- **Elsewhere**, pressing the key makes Ember come to heel with a bark, and makes Corvin **scout**.
- **Scouting:** Corvin circles once around you at about 30 m. Any heart shard, supply cache or companion spot within 40 m gets a small map pin and a brief shimmer in the world. It then has a 45 s cooldown, during which Corvin just caws.
- Hidden until each companion is earned. Add the keys to the Controls screen, the pause legend, the pad legend and CONTRACT.md.

## 4. Puzzles (optional detours, each with a reward)

Mark each companion spot in the world so a player can read it:
- **Fox spots:** a low gap with scratch marks and a tuft of red fur.
- **Raven spots:** a high perch with white streaks and a dangling black feather.

Six spots:

1. **Ember, the hollow log** on the moor. A supply cache sits inside a fallen hollow oak that is too small to crawl into. Ember goes in and drags the cache's bundle out.
2. **Ember, the cottage cellar grate.** A rusted grate under Maren's cottage. Ember wriggles in and comes back with **Maren's spare key**, which opens the locked sea-chest in the cottage: 1 heart shard plus a short note in Maren's hand.
3. **Ember, the sea cave.** A fox-sized crack in a sealed side chamber. Ember pulls a rope that drops a rope ladder, which opens a shortcut and a supply cache. Avoid the main cave puzzles; it must be optional.
4. **Corvin, the bell in the chapel loft** (Undercroft). A small handbell hangs on a beam too high to reach, even with the Glass stair. Corvin rings it, and an echo plays: an extra short memory of Wren, with one ether candle lighting by itself.
5. **Corvin, the hanging bundle.** A cache bundle is caught high in the dead tree by the moor road. Corvin pecks the twine and it drops.
6. **Corvin, the north cliff nest.** A raven's old nest on an unreachable ledge of the north cliff. Corvin brings back a heart shard from it. This is a **new shard**, so the shard count goes up by one; update PROGRESSION.md and the shard totals and pins.

Reward balance: two heart shards in total (2 and 6), and the rest are supply caches, ether, or story.

## 5. Helping in fights ("a little, nothing major")

- **Ember** nips the nearest monster that is attacking you, at most once every 6 s.
  - The nip does no damage. It interrupts the monster's wind-up, the same as a light stagger, but not for bosses.
  - Bosses ignore it.
  - Ember never chases far: no more than 8 m from you.
- **Corvin** dives at a monster that has locked onto you, at most once every 10 s.
  - The monster's next attack is delayed by 0.8 s.
  - No damage, and it does nothing to bosses.
  - In the dark, Corvin's caw happens to warn you of monsters nearby: a small sound cue when something hostile enters 15 m.
- **Invincible:** monster attacks pass through them. They have no HP and are never targeted. If something would hit them, they hop or flap aside in their animation.

## 6. Implementation notes

- New module **`js/companions.js`**, exposing `G.companions = {ember, corvin, has(id), send(id), call(id), spots, debug}`.
  - It persists under the key `companions`: who you have, which spots are done, and the scout cooldown.
- **Ember** reuses the freed-fox model from creatures.js (`KINDS.fox`). Add sit and lie poses, a fetch-carry pose (something in the mouth) and a squeeze-through animation.
- **Corvin** needs a new low-poly raven model in the toon style.
  - It has a glide/flap cycle, a hop and a perched idle.
  - Its negative form uses the same "absence" treatment as the other negatives.
- **Pathing:**
  - Ember follows your recent footprints, a breadcrumb trail of positions, so it takes the same route you did and doesn't need navmesh pathfinding.
  - Corvin flies in a straight line.
- **Budget:** at most 15 extra draw calls in total for both companions and the spot markers, and no per-frame allocations.
- **Hooks:**
  - creatures.js: the first freed fox is handed to companions.js instead of running home, and the new raven negative.
  - core.js: the R and T keys, plus D-pad left and right.
  - hud.js: the two touch buttons and the prompts.
  - map.js: scout pins.
  - progression.js: the new shard spot, the cache spots and the chest.
  - world.js, cave.js, undercroft.js: the spot set pieces.
  - devtools.js: start points `companions` (both earned) and teleports to each spot.
- **Tests:** a new `test/companions_e2e.py` covering:
  - earning each companion, following, catch-up teleport and fast travel;
  - each of the 6 spots solved by command, with its reward granted;
  - combat help: a nip interrupts a wind-up, a dive delays an attack, nothing happens to a boss, and they never take damage;
  - save and load;
  - old saves granting Ember.
  - Then the existing suites: quick, e2e, progress, cave, undercroft, travel.

## 7. Decisions to report back

Report back to Heath on: the names, where the raven is freed and when, the shard count change, and anything that felt fiddly in play.

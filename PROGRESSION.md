# Progression, rewards and upgrades — binding spec (v14)

Goal: exploring, fighting and freeing things should pay off in ways the player can feel. Zelda/BotW-style:
small collectibles that add up, boss rewards, and upgrades bought at the keeper's benches. Gentle Gothic tone:
everything is a keeper's relic, an ether-thing or a moth-thing, never generic "loot".

## 1. Heart Shards and Keeper's Hearts (health)
- Start: 5 hearts (`maxHp` 10, half-heart units). Max reachable in this build: 10 hearts.
- **Heart Shards** — "a sliver of the old lamp's glass, still warm". 4 shards = +1 heart. **12 shards** on the island (=3 hearts).
  Place them where they reward exploring and the movement kit: on top of the standing stones (double jump), a cliff ledge only
  reachable by gliding down from the headland, a sea stack at low tide, the hamlet (an attic / roof), inside the forest
  (hidden behind the Resisting Tree's roots), a tidepool only open at low tide, one guarded by a hound pack, one for clearing
  a blighted grove, one in the sea cave off the main path, the tower gallery outside the lamp room, etc. Each spot should be
  visible from somewhere so the player can spot the glint (a soft violet sparkle + a faint chime within ~12 m).
- **Keeper's Heart** (+1 full heart, refills hp) from the **Hollow Stag** and the **Undertow**. The Gloaming instead gives
  2 Keeper's Marks and the Lantern Charm (below). Total: 5 + 2 boss hearts + 3 from shards = **10 hearts**.
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
- Balance check: the Hollow Stag must stay "challenging, but not too hard" for a player who arrives with 5–6 hearts and no
  upgrades — don't make the game need upgrades to finish Act 1.

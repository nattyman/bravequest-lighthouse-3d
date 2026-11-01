# Lighthouse Game — Design Document v2

*Consolidates the original brain dump with all decisions made since. Supersedes v1.*
*Tags: #gamedesign #dnd #AI*

---

## The Core Metaphysics

This is the spine everything else hangs from:

**Ether is life** — pure, concentrated, primordial. Violet, luminous, plasma-like. It is not *a* life force belonging to any creature; it is life in its unbound state.

**Corruption is anti-life** — the exact inverse. It is parasitic: it does not simply destroy life, it *feeds* on it. The black globules in the lighthouse plasma are anti-life eating life, which is why the light dims as they spread.

**The fog is the same system, at scale.** Fog, corruption, and the creatures in it are one phenomenon expressed three ways. The fog is anti-life as weather; the corruption is anti-life as parasite; the shadows are anti-life wearing something that used to be alive.

This means the player's entire economy is a single question restated: *how do you concentrate life faster than it's being eaten?*

---

## Premise

The player wakes in a tower with no memory of arriving. Exploring, they find it's a lighthouse, and that its light is violet ether — corrupted, shot through with globes of oily black.

The light is holding back a fog. As the corruption spreads and the light dims, the fog constricts inward. The player must feed the light to survive, and eventually learn to purge the corruption entirely.

---

## The Core Loop

1. **The lantern.** The player discovers a lantern and learns to draw off some of the lighthouse's ether to power it. Carried ether pushes back the fog in a radius and lets them see in the dark. This is the only way out.
2. **Forage.** Venture into the fog for ingredients. The fog is hostile, and the further from the lighthouse, the thinner your protection.
3. **Refine.** An alchemy table — found in a shed outside the lighthouse — plus a recipe found elsewhere lets the player brew ether from raw ingredients.
4. **Feed.** Pour refined ether into the light. The fog retreats. The radius of safe foraging grows.
5. **Escalate.** Better ingredients mean more potent ether, which means more range, which means access to better ingredients.

Everything is discovered rather than granted: the lantern, the table, the recipes, the ingredients, the moths.

---

## The Moths — The First Real Puzzle

The player will meet moths early and draw the obvious conclusion: *moths are drawn to light, these are drawn to my lantern, they are a hazard.* They swarm the lantern. They swarm the lighthouse. They appear whenever ether is exposed.

**The twist: they aren't attracted to the ether. They're attracted to the corruption — and they eat it.**

Moths are anti-life's only natural predator. They have been trying to reach the lighthouse this whole time, and the player has been keeping them out.

**Why haven't the moths already fixed this?** Because they're on the *outside of the glass.* They mass against the lantern room windows, directly against the corruption, and beat themselves on the pane trying to reach it. They aren't smart enough to fly down to the door at the base and navigate up through the levels of the tower. The cure has been pressed against the window since the first minute of the game, and the player has been watching it and drawing the wrong conclusion.

**The puzzle:** figure this out, then let them in — open the door at the base and lead them up. This is Milestone 1, and the cure for the corruption is not a recipe. It's a realization about something the player has already seen a hundred times.

**Design notes on the reveal:**
- **The answer is visible from turn one.** Any time the player is in the lantern room, moths are on the glass. This is the game's central fair-play clue and it should never be hidden — only misread.
- **The fair-play tell:** the moths cluster densest over the *dark* patches, not the bright ones. A player who looks closely can catch it early. Describe their distribution consistently and let it shift as the corruption moves.
- **The false lesson must be taught first and taught hard.** Early game should reward sealing shutters and keeping them out. The player should have a mechanical reason to think of moths as a pest.
- **How you lead them up:** the lantern is drawn from the corrupted lighthouse, so *the lantern is corrupted too.* That's why moths swarm it outdoors — the false lesson was self-consistent the whole time. The player carries their own corrupted lantern up the stairs and the moths follow it. Elegant, and it uses a tool they already have.
- **The confirming clue, after the fact:** once the light is cured, moths stop caring about the lantern entirely. The player's protection quietly stops attracting attention, and they'll know why.
- Once the player knows, moths become a resource to attract, herd, protect, and carry — an inversion of every instinct the early game built.

**Open question — moth ichor.** You flagged this as a potency ingredient. Two readings, and they play very differently:
- *(a) Moth ichor is anti-corruption.* Whatever lets them digest the black is the active agent. Ichor added to a brew makes ether corruption-resistant — a preservative, not a fuel. Harvesting requires killing your own cure.
- *(b) Moth ichor is corruption, rendered inert.* The moth has already converted anti-life into something stable. Adding it makes ether dramatically more potent, but it's playing with the enemy's own substance. Riskier, stranger, and it seeds an endgame.

Option (a) makes moths precious and creates a genuine dilemma every time you harvest. Option (b) is more thematically interesting but harder to balance.

---

## The Bestiary

Three tiers, all one phenomenon:

**The Shadows (negatives).** Forest creatures the fog has turned. Each is the anti-shape of a real animal — a deer made of absence, a heron-shaped hole in the air. They are what the fog produces when it consumes something living and keeps the outline. The bestiary doubles as a record of what this region used to have.

**The Unmade.** People. Villagers, sailors, the other keepers — hollowed out by long exposure. Critically, **corruption is a process, not a state**: some are fully gone, some are partway, and some are still mostly themselves and can be spoken to. The partway ones are the game's most useful narrative device — they can warn, lie, beg, or mislead, and the AI DM can do enormous work with them.

This raises a question worth answering deliberately: *can an Unmade be saved?* If moths eat corruption, then in principle yes. Whether that's true, how much it costs, and whether the player figures it out too late for the first one they meet is a very strong story engine.

**The Moths.** Not hostile. The only creature in the fog that is *against* the fog. Fragile, finite, and easily mistaken for vermin.

---

## Ingredients

All six are in. The progression is roughly: common → dangerous → rare → costly.

**1. Glowing mushrooms.** The starter ingredient. Grow near the lighthouse, glow the same violet, weak potency — it takes a great many to make a usable dose. Their glow is the clue that connects them to the ether.

**2. Tidal harvest.** Bioluminescent kelp, brine crystal, the pearl-organ of something washed up. Gated by low tide, so limited by *time* rather than danger. Gives the player something to do on a schedule.

**3. Ichor of the corrupted.** Harvested from shadows and the Unmade. Potent and morally uneasy — you are refining life back out of the things that stole it. Ties combat directly into the crafting economy.

**4. Fallen sky.** Starmetal, storm-glass fused where lightning struck the rocks, the ash of a burnt-out star. Event-driven: you go looking after a storm. Makes weather a system.

**5. Sap of the resisting tree.** One old tree still holds the fog off its own clearing. The sap is powerful and finite — take too much and the tree dies, and the clearing goes dark. A renewable resource with a conscience attached.

**6. Salvage.** Other keepers already refined ether. Their caches, wrecked supply boats, a sunken tender. No crafting required, but every find comes with a logbook and someone's last day. A pacing valve when the player is grinding.

**7. Moth ichor.** The potency multiplier. See the open question above.

**8. Your own.** Blood, memory, years. Because ether *is* life, this stops being metaphorical — the player can feed themselves into the light, and the game keeps count. This should be available far earlier than it is wise to use.

---

## Milestones

**1 — The Moths.** Realize what the moths eat. Let them in. The lighthouse is cured; the light stops losing ground to itself.

**2 — Self-Sustaining.** With the corruption gone, fed ether accumulates instead of being consumed. Push the fog fully off the lighthouse. It still needs feeding, but past critical mass the upkeep drops sharply.

**3 — The Others.** Discover that one lighthouse only reaches so far, and there are more — five in total. Each has its own obstacle and its own puzzle. *(Not yet defined — see Open.)*

**Endgame — The Wound.** Discover the source.

---

## The Wound *(working answer)*

The fog and the corruption are seeping into the world through a wound — a tear, a breach, a place where something is torn open. Anti-life is not native here. It is *entering*.

The lighthouses are pressure on the wound, not a cure for it. Restoring all five stabilizes the patient; it does not close the injury. The endgame is reaching the wound and healing it — which, given that ether is life and healing takes life, will cost something proportional.

*Marked as provisional. Still under consideration.*

---

## World & Tone

Fairytale-magical. Nearly every creature is fantastical in some way. The register is closer to a folk tale than a horror story — dread, but the kind with a moral inside it.

---

## Mechanics & UX

A cross between:
- **D&D-style text adventure** — narrative-driven, open-ended, described rather than shown
- **A Dark Room** — repetitive task buttons, resource management, gradual systemic reveal
- **Skyrim** — leveling, magic, potions, weapons

Storyline, creatures, NPCs, milestones and goals are deterministic. The Dungeon Master is AI, so play within that frame can go very open-ended.

---

## Still Open

- **The five lighthouses** — what differentiates each, and in what order. Deferred by choice.
- **Moth ichor** — anti-corruption agent, or stabilized corruption? (See above.)
- **Can the Unmade be saved?** And does the player learn it in time to matter?
- **Where do moths come from?** If they're anti-life's natural predator, something made them, or the world grows them in response to the wound. *(Why they haven't already cured the lighthouse is answered — they're stuck outside the glass.)*
- **Why did the player wake up here, and why are they immune?** Everyone else in this region is a shadow, an Unmade, or a logbook. The player walks through fog and stays themselves. Deliberately left open — the answer should emerge from the story as it develops rather than be fixed now.
- **The nature of the wound** — what tore it, what's on the other side, and what closing it costs.

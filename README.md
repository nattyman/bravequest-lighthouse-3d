# Brave Quest: Lighthouse

A Zelda-like 3D adventure in the browser, built with Three.js (r128) and the Web Audio API. Gentle Gothic fairytale: you wake at the foot of a dead lighthouse on a sea cliff, fog rolling in, and learn that the moths were never after the light.

## Run it locally

Browsers block module loading from `file://`, so serve the folder:

```sh
python3 -m http.server 8800
```

- `http://localhost:8800/dev.html` uses the bundled copy of Three.js in `vendor/` (works offline)
- `http://localhost:8800/index.html` loads Three.js from public CDNs (this is the page that gets published)
- add `?debug` to either for test helpers (`G.step`, `G.debugStartLoop`, …)

`dev.html` is generated: run `python3 test/build_dev.py` after changing `index.html` or adding a module.

## Controls

| | Keyboard and mouse | Touch | Xbox controller |
|---|---|---|---|
| Move | WASD | left thumb | left stick |
| Camera | mouse | right thumb | right stick |
| Sprint | Shift | | LB |
| Jump, hold to glide | Space | Jump | A |
| Roll | C | Roll | B |
| Strike, hold to charge | click | Strike | X |
| Interact | E | Use | Y |
| Lock on | Q | Lock | LT |
| Lantern shutter | F | Shut | RB |
| Pause | Esc | pause button | Menu |

Jump again in the air for a **double jump** (a moth-wing flutter of the Traveler's Cloak; once per jump, needs the cloak). Holding jump still glides afterwards. Roll in the air to **dive**. While you hold strike to charge the staff, the camera moves over your shoulder and a violet reticle appears: aim with the camera (mouse, right stick, right-thumb drag) and release to send an ether bolt to the reticle (a full charge sends a stronger bolt; aim at the ground close by for the spin attack instead). While locked on, the bolt seeks the target.

### Techniques

Combos come from sequencing the normal buttons; each is named on screen the first time you find it and listed in the pause menu. Numbers live in one table at the top of `js/combat.js` (damage in half-hearts).

| technique | input | damage | feel |
|---|---|---|---|
| Rolling Lunge | roll, then strike (during the roll or just after) | 3 | a fast two-handed thrust out of the roll |
| Dashing Sweep | sprint, then strike | 3, all around | a low whirl that slides on your momentum (costs stamina) |
| Skyfall Slam | jump, then strike | 3, 2.4 m shockwave | hang, then drive the staff into the ground |
| Moth-Wing Spin | double jump, then strike | 2, all around | a whirling spin in the air |
| Starfall Plunge | jump, roll in the air, then strike | 5 (7 after a double jump, more from higher), 3–4.4 m | a spinning plunge: big knockback, hit-stop, shake, a burst of ether light |

## Code layout

Every file in `js/` is one plain-script module talking to the others through `window.G` (see `CONTRACT.md`).

| file | what it does |
|---|---|
| `core.js` | renderer, cel shading, input, physics queries, combat, events, systems |
| `ink.js` | the corruption look: living ink shader, smoke, drips, pools |
| `world.js` | the island: terrain, sea, sky, forest, moor, hamlet, cottage, shed |
| `lighthouse.js` | the tower, spiral stairs, staff, lamp room and cure |
| `combat.js` | technique numbers, names and pause-menu list, aim reticle and aim raycast, ether bursts |
| `player.js` | the Traveler: model, controller, camera, combat, lantern |
| `creatures.js` | moths, corruption patches, negatives, Halloran |
| `monsters.js` | hollows, shade hounds, the Hollow Stag |
| `flow.js` | quest beats, checkpoints, saving, title and pause |
| `hud.js` | hearts, prompts, captions, objective marker, touch buttons |
| `audio.js` | adaptive score from the Bravequest Theme stems, ambience, sound effects |
| `fog.js`, `alchemy.js`, `moths.js` | the core loop (see `LOOP.md`) |

Assets: `audio/` holds the processed theme stems, `sfx/` the processed sound effects (originals live outside the repo). `design/` holds the design doc and style guides.

## Tests

`test/e2e.py` plays the whole quest headlessly and must pass before publishing (needs Python Playwright and Chrome). `test/snap.py` takes scripted screenshots.

# How we develop Brave Quest: Lighthouse

This is the working process for any Claude thread (lead or agent) picking up this repo. Read it with
`CLAUDE.md` (short rules) and `CONTRACT.md` (engine API, file ownership, coordinates, art direction).

## Who decides what

- **Heath owns the game.** Story, tone, characters, endings, and what goes live are his calls. Ask before
  making a design decision he hasn't made; offer two or three concrete options with a recommendation.
- **The audience is adults** (his grown sons play and give feedback). The tone can be edgy and dramatic.
- **The Story Bible** is a Claude doc in the "Brave Quest Lighthouse" project, not in this repo. It holds
  what's decided and the dialogue as built ("Built so far, slice N"). Update it when dialogue ships or changes.
- **Specs in the repo** (`ACT1.md`, `CAVE.md`, `TEMPLE.md`, `UNDERCROFT.md`, `LOOP.md`, `PROGRESSION.md`,
  `COMPANIONS.md`) describe how each area works. They stay Markdown. Deliverables made *for Heath* to read
  (reports, plans, explainers) are HTML pages, not .md.

## The loop for a slice of the game

1. **Talk it through with Heath** until the beats are decided. Write the decisions into the Story Bible.
2. **Write a contract** for the slice (a scratch file, not committed): the modules, who owns which file, the
   API each one exposes (`G.<module>={...}`), events, persisted state, quest steps, and the debug hooks tests
   will need. Agents build against the contract, so they can work in parallel.
3. **Delegate.** Heath's standing rule: anything but the simplest task goes to agents, several in parallel
   when the work splits cleanly by file. Give each agent the contract path, its files, what to verify, and
   where to put screenshots. Agents edit the working tree but **don't commit, push, stash or merge**; the
   lead does that.
4. **Agents test and screenshot.** Each runs its suites locally (below) and saves screenshots of every
   scene that matters, then reports what changed, the test results, and what's still weak.
5. **The lead reviews the screenshots**, not just the report. Anything weak goes to a polish agent.
6. **Commit, push, open a PR.** CI runs on the PR.
7. **Publish to the test build** so Heath can play it (see Publishing). Give him the Test tools start
   points that reach the new content fastest.
8. **Heath plays, gives feedback, merges.** Only after that, and only when he says, publish to the live game.

## Git

- Branches: `feat/<thing>`, `fix/<thing>`, `ci/<thing>`, `docs/<thing>`, off `origin/main`.
- Commit as Heath:
  `git -c user.name=Heath -c user.email=nattyman@users.noreply.github.com commit`
  and end the message with the attribution lines your session gives you (a `Co-Authored-By:` line and a
  `Claude-Session:` URL).
- **Never force-push, and never amend a commit that's been pushed.** To tidy history, make a new branch
  from `origin/main`, `git merge --squash` the old branch, commit once, and open the PR from the new branch.
- **Never use bare `git stash`** (the stash stack is shared across worktrees and sessions). To set work
  aside, make a temporary WIP commit.
- **Containers restart.** Long agent runs have been killed mid-task. Protect in-progress work with a WIP
  commit and push the branch: pushing a branch that has no PR runs no CI and costs nothing.
- **Don't merge PRs.** Heath merges. Don't cancel or rerun CI runs you didn't start.

## Pull requests and the GitHub API

`gh pr create` and `gh pr checks` fail here (the proxy blocks GraphQL). Use REST:

```sh
jq -n --arg b "$BODY" '{title:"…",head:"feat/x",base:"main",body:$b}' \
  | gh api -X POST repos/nattyman/bravequest-lighthouse-3d/pulls --input - --jq .html_url
gh api "repos/nattyman/bravequest-lighthouse-3d/commits/<sha>/check-runs?per_page=50" \
  --jq '.check_runs[]|"\(.name) \(.status) \(.conclusion)"'
gh api repos/nattyman/bravequest-lighthouse-3d/actions/jobs/<job-id>/logs   # a failed job's log
```

PR bodies: a short plain-language summary of what changed and why, how it was tested, then the footer your
session gives you (the Claude Code line and the session URL). Write for Heath: what he'll see in the game,
not internal names.

## Testing

- **Run suites yourself**, one at a time, never several in parallel (they starve each other and time out):
  ```sh
  python3 test/build_dev.py                     # dev.html is generated; never edit it by hand
  python3 -m http.server 8996 &                 # pick a free port; stop the server afterwards
  python3 test/northfire_e2e.py "http://localhost:8996/dev.html?debug&headless"
  ```
  The query string each suite expects is in `.github/workflows/tests.yml` (most use `?debug&headless`).
- **Drive the game with real input** where it matters (`G.input.setVirtual` for the stick). Teleporting past
  something hides bugs: the tower stair shipped unwalkable because every test jumped to the trapdoor.
- **Hunting flaky tests:** CI machines are slow 2-core boxes. Reproduce under `taskset -c 0,1` and repeat
  the suite 5+ times. Fix the cause (wall-clock waits, real-time monsters between checks, an actual game
  bug); don't add retries that hide failures. Every check should have a time budget, so a stuck suite
  fails in minutes, and later checks should SKIP, not FAIL, when what they depend on failed.
- **Test tools start points** (`js/devtools.js`) let tests and Heath jump to any beat (e.g. `north-brink`,
  `north-final`). Add start points for new content, and a check in the matching starts suite.
- A new suite goes in the `S` map in `tests.yml` with its query string.

## CI

- The repo is **public**, so GitHub's standard runners are free. All suites run side by side on
  `ubuntu-latest` in roughly 13 minutes.
- **No self-hosted runners** (on a public repo anyone's PR could run code on them).
- CI runs on pull requests and on pushes to main. Don't use manual workflow runs as a test machine for
  unfinished work; test locally. (`workflow_dispatch` takes a `suites` input for targeted reruns.)

## Publishing

Two claude.ai artifacts, both built from `index.html` + `js/` + `audio/` + `sfx/`:

| | Artifact | When |
|---|---|---|
| Test build | "Brave Quest Vigil Test" — https://claude.ai/artifact/85bcTHrJCHTFFyNeNgVVcs | whenever a slice is ready for Heath to try |
| Live game | https://claude.ai/artifact/YRDnE7Q3MWfZZBKFtgfVdG | **only when Heath says**, and only after review |

- Build into a scratch folder (`git archive <ref> index.html js audio sfx | tar -x -C <dir>`). For the test
  build, change the `<title>` to "Brave Quest Vigil Test".
- Publish with the Artifact tool: `file_path` = the folder's `index.html`, `root` = the folder, and `files`
  mapping each `js/…`, `audio/…`, `sfx/…` path to itself. Files left out are kept, so an update can send
  only what changed.
- The tool refuses to overwrite published files this session hasn't read. Read them back first
  (`action:"read"` with `paths`), check they match a known commit, then publish.
- Saves carry over between versions; keep persisted state backward compatible (`G.persist.register` with
  defaults for missing fields).

## Engine reminders

`CONTRACT.md` is the full reference. The ones that come up most:

- Modules are IIFEs on `window.G`, Three.js r128, no imports, procedural textures only.
- Systems: `G.system(name,{order,modes,init,update})`. State: `G.persist.register`. Interactions:
  `G.interact.add`.
- **Interiors live at far offsets**, each with its own floor providers, walk limits and camera rules:
  cave (0,60,800), Undercroft (0,60,-800), Vigil (-800,60,0), north cave (800,60,0), fire room (800,60,800).
  Anything walkable needs a floor in its `floorProviders` entry; a mesh alone is just scenery.
- Cutscenes: `G.cine.play(id,{dur,shot,onEnd})` (plays once per save, skippable). Talk cards: `G.talk.open`.
- Captions: `G.ui.say(text,who,{group,flush})`. Give a scene's lines a `group` and `flush` so they keep pace
  with the shots; `G.ui.dropCaptions(group)` when leaving. `G.promptMute` hides interaction prompts during
  scenes.
- Damage is in half-hearts (1 heart = hp 2). `G.player.hurtFilters` can adjust incoming damage.

## Talking to Heath

- He may not be watching; lead with what he'll see and what he needs to do, in plain words.
- Say plainly what's weak or untested. Don't present an unverified result as done.
- Ask before anything that costs him money or can't be undone (CI spend, publishing live, repo settings).

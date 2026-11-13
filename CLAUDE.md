# Notes for agents working on this repo

## Testing
- Run the browser suites yourself, in your own environment: serve the repo with
  `python3 -m http.server <port>`, build `dev.html` with `python test/build_dev.py`, and run
  `python test/<suite>.py "http://localhost:<port>/dev.html<query>"` (the query string each suite
  expects is in `.github/workflows/tests.yml`). Run suites one at a time.
- Don't use GitHub Actions as a test machine for unfinished work: no manual workflow runs on
  work-in-progress branches. CI runs on pull requests and on pushes to main.
- No self-hosted runners: this repo is public, and anyone's pull request could run code on one.

## Licence
All rights reserved (see LICENSE). Don't add an open-source licence or third-party assets
whose licences don't allow redistribution.

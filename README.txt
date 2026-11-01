Brave Quest: Lighthouse — 3D prototype

Run it locally (the browser blocks module loading from file://):
  cd game && python3 -m http.server 8800
  open http://localhost:8800/dev.html      (offline, uses vendor/three)
  or   http://localhost:8800/index.html    (loads Three.js from CDNs)

Code: js/core.js is the shared engine; every other file is one module.
CONTRACT.md explains how the modules fit together.
test/e2e.py plays the whole quest headlessly (needs Python Playwright + Chrome).

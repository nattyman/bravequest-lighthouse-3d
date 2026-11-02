"""Quick smoke test (~1–2 min): loads the game headless, runs the title -> play, the core loop and every cave room for a few
seconds of game time each, and fails on any page error or console error. Run this while working; the full suites
(e2e.py, loop_e2e.py, cave_e2e.py) are for the end of a task — see CONTRACT.md "Testing".
usage: python3 test/quick.py [url]   (default http://localhost:8800/dev.html?debug&headless)
"""
import asyncio, sys, time, json
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
STEPS=[
 ("boot",   "[!!window.G, G.state.mode, !!G.headless]"),
 ("begin",  "document.getElementById('begin').click(); G.step(1/30,90); [G.state.mode, G.quest.step]"),
 ("walk",   "G.input.setVirtual('forward',true); G.step(1/30,90); G.input.setVirtual('forward',false); [G.player.pos.x.toFixed(1), G.player.pos.z.toFixed(1)]"),
 ("loop",   "G.debugStartLoop(); G.step(1/30,150); [G.loop.active, Math.round(G.lamp.ether)]"),
 ("strike", "G.input.setVirtual('attack',true); G.step(1/30,4); G.input.setVirtual('attack',false); G.step(1/30,30); G.state.mode"),
]+[(f"cave:{r}", f"G.debugEnterCave('{r}'); G.step(1/30,120); [G.cave.inside, G.cave.room(G.player.pos)]")
   for r in ['mouth','gallery','stair','channel','drafts','arena']]+[
 ("exit",   "G.cave.exit&&G.cave.exit(); G.step(1/30,120); [!G.cave.inside, G.state.mode]"),
]
async def main():
    t0=time.time(); errs=[]; ok=True
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':960,'height':600})
        pg.on('pageerror',lambda e:errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m:errs.append('console: '+m.text) if m.type=='error' and '404' not in m.text else None)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
        for name,js in STEPS:
            try: r=await pg.evaluate(js); print(f'ok   {name:14s} {json.dumps(r)}')
            except Exception as e: ok=False; print(f'FAIL {name:14s} {str(e)[:300]}')
        await b.close()
    for e in errs[:10]: print('  ',e[:300])
    ok=ok and not errs
    print(('PASS' if ok else 'FAIL'), f'{time.time()-t0:.0f}s'); sys.exit(0 if ok else 1)
asyncio.run(main())

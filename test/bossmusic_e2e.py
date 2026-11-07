# Boss music (audio/bq-boss.mp3): starts from the top when a boss fight begins, takes over from the theme,
# fades and stops when the fight ends, and starts fresh next time. Real-time page (no ?headless), audio autoplay on.
# Usage: python3 test/bossmusic_e2e.py "http://localhost:PORT/dev.html?debug"
import asyncio, json, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8991/dev.html?debug"

async def main():
    fails = []
    def check(name, ok, info):
        print(('ok   ' if ok else 'FAIL ') + name + ' : ' + json.dumps(info)[:500])
        if not ok: fails.append(name)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':960,'height':600})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, timeout=180000); await pg.wait_for_timeout(4000)
        await pg.evaluate("document.getElementById('begin').click(); G.audio.unlock&&G.audio.unlock()")
        M = "G.audio.music"
        # the boss file is fetched only after the island stems decode
        r = None
        for _ in range(60):
            await pg.wait_for_timeout(1000)
            r = await pg.evaluate(f"({{loaded:{M}.loaded, boss:{M}.bossSong}})")
            if r['boss']['loaded'] or r['boss']['failed']: break
        bs = r['boss']
        check('loads', bs['loaded'] and not bs['failed'] and abs(bs['duration']-147.94) < .15 and not bs['playing'], r)
        # a boss fight begins
        await pg.evaluate(f"{M}.setOverride('boss')"); await pg.wait_for_timeout(2500)
        r = await pg.evaluate(f"({{s:{M}.state, boss:{M}.bossSong, g:{M}.groups, syn:{M}.synth}})")
        theme = max(r['g'][k]['target'] for k in ('core','rhythm','power'))
        check('fightStarts', r['s']=='boss' and r['boss']['playing'] and r['boss']['starts']==1 and r['boss']['target']>1.2, r['boss'])
        check('themeStandsAside', theme < .1 and r['syn']['boss'] < .05 and r['syn']['combat'] < .05, {'theme':theme,'synth':r['syn']})
        # pausing halves it, like the rest of the music
        await pg.wait_for_timeout(1500)
        # the fight ends: fades, then stops
        await pg.evaluate(f"{M}.setOverride(null)"); await pg.wait_for_timeout(1500)
        r1 = await pg.evaluate(f"{M}.bossSong")
        await pg.wait_for_timeout(4500)
        r2 = await pg.evaluate(f"({{boss:{M}.bossSong, g:{M}.groups}})")
        check('fadesThenStops', r1['playing'] and r1['target'] < 1.0 and not r2['boss']['playing'] and r2['boss']['target'] < .06, {'mid':r1['target'],'end':r2['boss']})
        check('themeReturns', r2['g']['core']['target'] > .3, r2['g']['core'])
        # next fight starts from the top again; the Undertow (caveBoss) uses it too
        await pg.evaluate(f"{M}.setOverride('caveBoss')"); await pg.wait_for_timeout(2500)
        r = await pg.evaluate(f"({{s:{M}.state, boss:{M}.bossSong, syn:{M}.synth}})")
        check('restartsFresh', r['boss']['playing'] and r['boss']['starts']==2 and r['syn']['caveBoss'] < .05, r)
        # dying mid-fight fades it out
        await pg.evaluate(f"{M}.setOverride('dead')"); await pg.wait_for_timeout(6000)
        r = await pg.evaluate(f"{M}.bossSong")
        check('deathFades', not r['playing'], r)
        await pg.evaluate(f"{M}.setOverride(null)")
        check('noPageErrors', not errs, errs[:3])
        await b.close()
    print('RESULT: ' + ('ALL PASS' if not fails else 'FAILED ' + ', '.join(fails)))
    sys.exit(1 if fails else 0)
asyncio.run(main())

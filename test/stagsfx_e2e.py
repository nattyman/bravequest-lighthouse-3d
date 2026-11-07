# The Hollow Stag's recorded sounds, the reward sting and the victory sting (sfx/stag_*, reward_sting-*, victory-*).
# Stepped headless page with audio autoplay. A test-only system between the monster AI and the audio (order 92)
# holds the Stag in each state so every transition is heard. G.audio.sfx.log lists what played.
# Usage: python3 test/stagsfx_e2e.py "http://localhost:PORT/dev.html?debug&headless"
import asyncio, json, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8991/dev.html?debug&headless"
NAMES = ['stag_intro-1','stag_intro-2','stag_summon','stag_windup-1','stag_windup-2','stag_windup-3','stag_hurt-1','stag_hurt-2',
         'stag_sweep-1','stag_sweep-2','stag_impact-1','stag_impact-2','stag_impact-3','stag_impact-4','stag_charge-1','stag_charge-2',
         'stag_death-1','stag_death-2','reward_sting-1','reward_sting-2','reward_sting-3','reward_sting-4','victory-1','victory-2','victory-3']

async def main():
    fails = []
    def check(name, ok, info):
        print(('ok   ' if ok else 'FAIL ') + name + ' : ' + json.dumps(info)[:300])
        if not ok: fails.append(name)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':960,'height':600}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, timeout=180000); await pg.wait_for_timeout(4000)
        await pg.evaluate("document.getElementById('begin').click(); G.audio.unlock&&G.audio.unlock()")
        r = None
        for _ in range(40):
            await pg.wait_for_timeout(1000); r = await pg.evaluate("G.audio.sfx.loaded")
            if all(n in r for n in NAMES): break
        check('allLoaded', all(n in r for n in NAMES), [n for n in NAMES if n not in r])
        await pg.evaluate('G.step(1/30,240)')
        # raise the Stag at its arena
        # (the arena edge is ~50 m out, beyond the 45 m the monster sounds reach, so bring the player in before it rises)
        await pg.evaluate("(()=>{ const A=G.monsters.stagArena(); G.player.pos.set(A.x+12,G.player.pos.y,A.z+6); G.monsters.startStag(); G.step(1/30,10); })()")
        r = await pg.evaluate("G.audio.sfx.log")
        check('intro', any(x.startswith('stag_intro') for x in r), r[-4:])
        await pg.evaluate("""G.system('stagHold',{order:91.5,modes:'always',update(){ const m=G.monsters.boss; if(m&&window.__hold&&m.alive&&!m.dying){ m.state=window.__hold; m.st=0; } }})""")
        async def hold(st, n=4):
            await pg.evaluate(f"window.__hold='{st}'; G.step(1/30,{n})")
        seq = [('chargeWind','stag_windup'),('charge','stag_charge'),('staggered','stag_impact'),('stalk',None),('sweepWind','stag_windup'),('sweep','stag_sweep'),
               ('stalk',None),('stompWind','stag_windup'),('stomp','stag_impact'),('stalk',None),('summon','stag_summon'),('stalk',None)]
        for st, want in seq:
            await hold(st)
            if want:
                last = await pg.evaluate("G.audio.sfx.log.slice(-3)")
                check(st, any(x.startswith(want) for x in last), last)
        await pg.evaluate("window.__hold=null")
        # a blow from the player: a grunt (at most one a second)
        await pg.evaluate("(()=>{ const m=G.monsters.boss; G.emit('strike',{team:'player',kind:'staff',hits:[{monster:m,pos:m.pos}]}); G.step(1/30,2); })()")
        last = await pg.evaluate("G.audio.sfx.log.slice(-2)"); check('hurt', any(x.startswith('stag_hurt') for x in last), last)
        # death roar, then the orchestral victory (scheduled ~1.5 s later, on the beat)
        await pg.evaluate("(()=>{ const m=G.monsters.boss; G.monsters.kill(m,{}); G.step(1/30,4); })()")
        last = await pg.evaluate("G.audio.sfx.log.slice(-3)")
        check('death', any(x.startswith('stag_death') for x in last), last)
        await pg.evaluate("G.step(1/30,200)")   # boss:dead comes when the dissolve finishes
        last = await pg.evaluate("G.audio.sfx.log.slice(-3)")
        check('victory', any(x.startswith('victory') for x in last), last)
        # the reward moment: a sparkle for a small find, the victory sting for a heart
        r = await pg.evaluate("""(()=>{ const a=G.audio.sfx.play('reward_sting',{gain:.9,vary:0,duck:.6}); const b=G.audio.sfx.play('victory',{gain:.95,vary:0,duck:.3}); return [!!a,!!b,G.audio.sfx.log.slice(-2)]; })()""")
        check('rewardAndVictoryPlay', r[0] and r[1], r)
        await pg.evaluate("G.emit('chest:open',{pos:G.player.pos.clone()})")
        last = await pg.evaluate("G.audio.sfx.log.slice(-1)"); check('chestSparkle', last and last[0].startswith('reward_sting'), last)
        check('noPageErrors', not errs, errs[:3])
        await b.close()
    print('RESULT: ' + ('ALL PASS' if not fails else 'FAILED ' + ', '.join(fails)))
    sys.exit(1 if fails else 0)
asyncio.run(main())

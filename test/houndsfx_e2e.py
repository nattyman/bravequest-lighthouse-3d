# Shade Hound sounds (sfx/hound_*.mp3): each state change plays its recording.
# Stepped headless page (every frame runs, so short states are never skipped) with audio autoplay; spies on AudioBufferSourceNode.start to see which buffers play.
# Usage: python3 test/houndsfx_e2e.py "http://localhost:PORT/dev.html?debug&headless"
import asyncio, json, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8991/dev.html?debug&headless"
SPY = """(() => { window.__played=[]; const o=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...a){ if(this.buffer&&!this.loop) window.__played.push(+this.buffer.duration.toFixed(2)); return o.apply(this,a); }; })();"""

async def main():
    fails = []
    def check(name, ok, info):
        print(('ok   ' if ok else 'FAIL ') + name + ' : ' + json.dumps(info)[:400])
        if not ok: fails.append(name)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width':960,'height':600}); await ctx.add_init_script(SPY)
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, timeout=180000); await pg.wait_for_timeout(4000)
        await pg.evaluate("document.getElementById('begin').click(); G.audio.unlock&&G.audio.unlock()")
        names = ['hound_notice-1','hound_notice-2','hound_growl-1','hound_growl-2','hound_windup-1','hound_windup-2','hound_bite-1','hound_bite-2','hound_hurt-1','hound_hurt-2','hound_flee','hound_death']
        r = None
        for _ in range(30):
            await pg.wait_for_timeout(1000)
            r = await pg.evaluate("G.audio.sfx.loaded")
            if all(n in r for n in names): break
        check('allLoaded', all(n in r for n in names), [n for n in names if n not in r])
        durs = await pg.evaluate("(async()=>{ const o={}; for(const n of %s){ const ab=await (await fetch('sfx/'+n+'.mp3')).arrayBuffer(); const b=await G.audio.context.decodeAudioData(ab); o[n]=+b.duration.toFixed(2);} return o; })()" % json.dumps(names))
        await pg.evaluate('G.step(1/30,240)')   # title -> play
        def match(pl, group):
            want = [durs[n] for n in names if n.startswith(group)]
            return any(abs(d-w) < .06 for d in pl for w in want)
        # a hound beside the player notices it on its own, then is walked through each state
        # spawned out of range so the audio sees it idle, then each state is held long enough to be heard
        await pg.evaluate("""(()=>{ const P=G.player.pos; const m=G.monsters.spawn('hound',{x:P.x+30,z:P.z},{aggro:false}); window.__h=m; })()""")
        await pg.evaluate('G.step(1/30,10)')
        # a test-only system between the monster AI (it would move the state on) and the audio (order 92)
        await pg.evaluate("""G.system('houndHold',{order:91.5,modes:'always',update(){ const m=window.__h; if(m&&window.__hold&&m.alive&&!m.dying){ m.state=window.__hold; m.st=0;
            const P=G.player.pos; m.pos.set(P.x+6,m.pos.y,P.z+2); } }})""")
        async def hold(state, ms=700):
            await pg.evaluate(f"window.__hold='{state}'; G.step(1/30,{max(3,ms//33)})")
        for st in ['chase','windup','attack','recover']: await hold(st)
        for st in ['hurt','flee','recover','chase']: await hold(st)
        for _ in range(3):   # the circling-back growl is occasional (60%, at most every 5 s per hound)
            await pg.evaluate('window.__hold=null'); await pg.wait_for_timeout(5200); await hold('recover',100); await hold('chase',100)
        await pg.evaluate("window.__hold=null; G.monsters.kill(window.__h,{}); G.step(1/30,6)")
        pl = await pg.evaluate("G.audio.sfx.log")
        for g in ['notice','windup','bite','hurt','flee','growl','death']:
            check(g, any(x.startswith('hound_'+g) for x in pl), pl)
        check('noPageErrors', not errs, errs[:3])
        await b.close()
    print('RESULT: ' + ('ALL PASS' if not fails else 'FAILED ' + ', '.join(fails)))
    sys.exit(1 if fails else 0)
asyncio.run(main())

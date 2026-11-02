"""One-off: screenshot the lock-on camera framing the Gloaming. usage: python3 test/lockcam_shot.py [url]"""
import asyncio, sys
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':1100,'height':650})
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
        r=await pg.evaluate("""(()=>{ G.devtools.start('finale'); G.step(1/30,30); const L=G.world.lighthouse;
          G.player.teleport(L.x-14,42,L.z-6,-2.3); let k=0; while(!(G.finaleBoss&&G.finaleBoss.active)&&k<300){G.step(1/30,1);k++;}
          G.step(1/30,260); const B=G.finaleBoss.debug.B;
          const L2=G.world.lighthouse, dx=L2.x-B.pos.x, dz=L2.z-B.pos.z, d=Math.hypot(dx,dz); G.player.teleport(B.pos.x+dx/d*10,null,B.pos.z+dz/d*10,Math.atan2(-dx,-dz)); G.step(1/30,5);
          const hb=[...G.hurtboxes].find(h=>h.name==='The Gloaming'); G.player.lockTarget=hb||null; G.step(1/30,90);
          return [k,B.state,!!hb, hb&&hb.height, !!G.player.lockTarget]; })()""")
        print(r)
        await pg.evaluate('G.headless&&G.headless.draw(3); 0'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='/tmp/claude-0/v12/lockcam.png',timeout=120000)
        await b.close()
asyncio.run(main())

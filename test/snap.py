"""Headless playtest helper.
usage: python3 test/snap.py --out shot.png [--begin] [--wait 3000] [--js "code"]... [--w 1100 --h 650]
Each --js runs in order (after load / after Begin); a numeric --pause N waits N ms after each js.
Prints page errors and console errors. Server: http://localhost:8800/dev.html (run test/serve.sh).
Software rendering is slow (~3-8 fps) so real-time movement is slow: drive the game with G.* calls
and step systems by hand when you need deterministic motion (see CONTRACT.md 'Testing').
"""
import asyncio,argparse
from playwright.async_api import async_playwright
ap=argparse.ArgumentParser();ap.add_argument('--out',default='shot.png');ap.add_argument('--begin',action='store_true')
ap.add_argument('--wait',type=int,default=3000);ap.add_argument('--js',action='append',default=[]);ap.add_argument('--pause',type=int,default=1500)
ap.add_argument('--w',type=int,default=1100);ap.add_argument('--h',type=int,default=650);ap.add_argument('--url',default='http://localhost:8800/dev.html?debug')
ap.add_argument('--shots',action='store_true',help='screenshot after every --js as out-N.png')
a=ap.parse_args()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg=await b.new_page(viewport={'width':a.w,'height':a.h})
        errs=[]
        pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e)))
        pg.on('console',lambda m: errs.append(m.type.upper()+' '+m.text) if m.type in('error','warning') else (print('LOG',m.text) if m.text.startswith('[t]') else None))
        await pg.goto(a.url); await pg.wait_for_timeout(a.wait)
        if a.begin:
            await pg.evaluate("document.getElementById('begin')&&document.getElementById('begin').click()"); await pg.wait_for_timeout(800)
        for i,js in enumerate(a.js):
            r=await pg.evaluate(js)
            if r is not None: print('JS',i,':',r)
            await pg.wait_for_timeout(a.pause)
            if a.shots: await pg.screenshot(path=a.out.replace('.png',f'-{i}.png'))
        await pg.screenshot(path=a.out)
        for e in errs[:25]:
            if 'favicon' not in e and '404' not in e: print(e)
        await b.close()
asyncio.run(main())

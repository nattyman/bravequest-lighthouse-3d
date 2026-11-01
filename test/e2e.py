import asyncio
from playwright.async_api import async_playwright
STEPS=[
 ("start","document.getElementById('begin').click(); 0"),
 ("door","G.player.teleport(172,42,0,Math.PI/2); G.input.setVirtual('forward',true); G.step(1/30,45); G.input.setVirtual('forward',false); [document.getElementById('obj').textContent, G.player.pos.x.toFixed(1)]"),
 ("halloran","const h=G.creatures.halloran; const p=h.pos||h.g.position; G.player.teleport(p.x+1.6,p.y,p.z,0); G.step(1/30,10); for(let i=0;i<3;i++){const c=G.interact.pick(G.player.pos); if(c)c.use(); G.step(1/30,5);} [document.getElementById('obj').textContent, G.interact.current&&G.interact.label(G.interact.current)]"),
 ("lantern","const L=G.items.lantern.pos; G.player.teleport(L.x+1,L.y,L.z,0); G.step(1/30,10); const c=G.interact.pick(G.player.pos); c&&c.use(); G.step(1/30,10); [G.items.lantern.carried, document.getElementById('obj').textContent]"),
 ("enter","G.player.teleport(172,42,0,Math.PI/2); G.input.setVirtual('forward',true); G.step(1/30,70); G.input.setVirtual('forward',false); [G.world.lighthouse.inside(G.player.pos), document.getElementById('obj').textContent, G.atmo.darkTarget]"),
 ("staff","const s=G.items.staff.pos; G.player.teleport(s.x-.9,G.floorAt(s.x-.9,s.z,s.y)+.01,s.z-.6,0); G.player.pos.y=53.7; G.step(1/30,10); const c=G.interact.pick(G.player.pos); [c&&G.interact.label(c), (c&&c.use(),G.items.staff.owned)]"),
 ("lamp","G.player.teleport(181.5,66,-1.5,0); G.player.pos.y=66; G.step(1/30,10); const c=G.interact.pick(G.player.pos); [c&&G.interact.label(c), (c&&c.use(), G.items.lantern.inCradle)]"),
 ("cure","G.step(1/30,450); [G.items.lantern.cured, G.atmo.cured.toFixed(2), document.getElementById('obj').textContent]"),
 ("finale","G.player.teleport(160,42,0,Math.PI/2); G.step(1/30,90); [document.getElementById('obj').textContent, G.monsters.alive(), !!G.monsters.boss]"),
 ("boss","const b=G.monsters.boss; let n=0; while(b&&(typeof b.alive==='function'?b.alive():(b.hp>0&&!b.dead))&&n<80){ G.combat.strike({x:b.pos.x,y:b.pos.y+1,z:b.pos.z,radius:3,team:'player',damage:4}); G.step(1/30,12); n++; } G.step(1/30,420); [n, G.state.mode, !document.getElementById('ending').hidden]"),
]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':1100,'height':650}); pg.set_default_timeout(180000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto('http://localhost:8800/dev.html?debug', timeout=150000); await pg.wait_for_timeout(6000)
        for name,js in STEPS:
            try: r=await pg.evaluate(js)
            except Exception as e: r='EXC '+str(e)[:300]
            print(name,':',r)
            await pg.wait_for_timeout(1200)
            pass
        print('\n'.join(errs[:15]))
        await b.close()
asyncio.run(main())

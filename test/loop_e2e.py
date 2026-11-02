"""Plays the core loop headlessly: start loop -> forage -> brew -> pour -> tide -> ichor -> moth bait -> cure a blight -> save/load.
usage: python3 test/loop_e2e.py [url]   (default http://localhost:8800/dev.html?debug)"""
import asyncio, sys
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
STEPS=[
 ("start", "document.getElementById('begin').click(); G.debugStartLoop(); G.step(1/30,30); [G.loop.active, G.lamp.active, Math.round(G.lamp.ether), Math.round(G.fog.radius), document.getElementById('obj').textContent]"),
 ("forage", """(()=>{ const ms=G.world.landmarks.mushrooms; let got=0;
    for(const m of ms.slice(0,4)){ G.player.teleport(m.x+.4,G.floorAt(m.x+.4,m.z),m.z,0); G.step(1/30,8); const c=G.interact.pick(G.player.pos); if(c&&/glowcap|mushroom|pick/i.test(G.interact.label(c)))c.use(); G.step(1/30,4); }
    return [G.inv.count('glowcap'), document.getElementById('obj').textContent]; })()"""),
 ("brew", """(()=>{ const s=G.world.landmarks.shed; G.player.teleport(152.8-1,42,32.1,0); G.step(1/30,5);
    const ok=G.alchemy.brew('tincture',{instant:true})||G.alchemy.brew(Object.keys(G.alchemy.recipes)[0],{instant:true}); G.step(1/30,5);
    return [ok, G.inv.count('vial'), G.alchemy.etherUnits, document.getElementById('obj').textContent]; })()"""),
 ("pour", """(()=>{ G.player.teleport(181.5,66,-1.5,0); G.player.pos.y=66; G.step(1/30,5); const e0=G.lamp.ether; const c=G.interact.pick(G.player.pos); const lab=c&&G.interact.label(c); c&&c.use(); G.step(1/30,10);
    return [lab, Math.round(e0), Math.round(G.lamp.ether), document.getElementById('obj').textContent]; })()"""),
 ("tide", """(()=>{ let t=0; for(;t<300&&!G.tide.low;t+=5){G.alchemy.debug.setTide(t);} G.step(1/30,30); const harvest=G.alchemy.debug.state&&G.alchemy.debug.state.drops?0:0; return [G.tide.low, +G.tide.level.toFixed(2)]; })()"""),
 ("ichor", """(()=>{ G.player.teleport(150,42,-10,Math.PI/2); const h=G.monsters.spawn('hollow',new THREE.Vector3(154,42,-10)); G.step(1/30,5);
    let n=0; while(h.alive&&!h.dying&&n<30){ G.combat.strike({x:h.pos.x,y:h.pos.y+1,z:h.pos.z,radius:2,team:'player',damage:3}); G.step(1/30,8); n++; } G.step(1/30,90);
    G.player.teleport(154,42,-10,0); G.step(1/30,20); return [G.inv.count('ichor')]; })()"""),
 ("bait", """(()=>{ G.player.teleport(G.world.landmarks.patches[0].x+3,G.floorAt(G.world.landmarks.patches[0].x+3,G.world.landmarks.patches[0].z),G.world.landmarks.patches[0].z,0); G.step(1/30,240);
    const learned=G.alchemy.known.has('bait'); if(!learned)G.alchemy.learn('bait');
    G.items.lantern.carried=true; G.items.lantern.inCradle=false; G.items.lantern.shut=false; G.moths.bait(300);
    // keep visiting patches until the swarm has a margin over the 40 the tide pool needs (monsters nibble at it on the way, and
    // a patch's moths may be off wandering: 4 fixed patches left it at 36-46, which flaked the cure step)
    const st=[], lost0=G.moths.lost; for(const p of G.world.landmarks.patches){ if(st.length>=4&&G.moths.swarm>=46)break; G.player.teleport(p.x+3,G.floorAt(p.x+3,p.z),p.z,0); for(let i=0;i<10;i++){ G.step(1/30,30); G.player.hp=G.player.maxHp; } st.push(G.state.mode+'/'+G.moths.swarm+'/d'+Math.round(G.fog.depth(G.player.pos))); }
    return [G.moths.noticed, learned, G.moths.baited, G.moths.swarm, st.join(' '), 'lost '+(G.moths.lost-lost0)]; })()"""),
 ("cure", """(()=>{ const b=G.blights.find(x=>x.id==='tidepool'); G.moths.bait(300);
    const tp=(x,z)=>G.player.teleport(x,G.floorAt(x,z,(b.pos.y||0)+5),z,0);
    const sx=G.player.pos.x, sz=G.player.pos.z; for(let k=1;k<=10;k++){ tp(sx+(b.pos.x-sx)*k/10, sz+(b.pos.z-sz)*k/10); G.step(1/30,45); G.player.hp=G.player.maxHp; }
    for(let i=0;i<25&&!b.cured;i++){ tp(b.pos.x-2,b.pos.z); G.step(1/30,30); G.player.hp=G.player.maxHp; }
    return [G.moths.swarm, b.cured, Math.round(b.progress*100)/100]; })()"""),
 ("save", """(()=>{ return [G.persist.keys, G.state.mode, G.player.alive]; })()"""),
]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await (await b.new_context(viewport={'width':1000,'height':600})).new_page(); pg.set_default_timeout(180000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto(URL); await pg.wait_for_timeout(5000)
        await pg.evaluate("localStorage.removeItem('bq-save-v1')")
        for name,js in STEPS:
            try: r=await pg.evaluate(js)
            except Exception as e: r='EXC '+str(e).split('\n')[0][:300]
            print(name,':',r)
        # save -> reload -> continue
        await pg.evaluate("G.ui && 0"); await pg.evaluate("document.exitPointerLock&&document.exitPointerLock()")
        await pg.evaluate("G.setMode('paused'); document.getElementById('saveBtn').click(); 0")
        before=await pg.evaluate("[Math.round(G.lamp.ether), G.inv.count('glowcap'), G.inv.count('ichor'), G.blights.filter(b=>b.cured).map(b=>b.id).join(','), [...G.alchemy.known].join(',')]")
        await pg.reload(); await pg.wait_for_timeout(5000)
        await pg.click('#continue'); await pg.wait_for_timeout(2500)
        after=await pg.evaluate("[Math.round(G.lamp.ether), G.inv.count('glowcap'), G.inv.count('ichor'), G.blights.filter(b=>b.cured).map(b=>b.id).join(','), [...G.alchemy.known].join(','), G.loop.active]")
        print('save before:',before); print('after load :',after)
        await pg.evaluate('G.headless&&G.headless.draw(3); 0'); await pg.wait_for_timeout(250); await pg.screenshot(path='/tmp/claude-0/loop_end.png')
        print('\n'.join(e for e in errs if '404' not in e)[:1500])
        await b.close()
asyncio.run(main())

"""Act 1 end to end (v12 order): cottage door -> Halloran -> storm lantern (oil shed) -> enter -> staff -> lamp-room failure
(logbook, ink pulse) -> Halloran at the tower foot -> forest: the Hollow Stag over Maren's lantern -> lantern -> back ->
cure -> finale:start -> the Gloaming (finale_boss.js; if it isn't on this branch, boss:dead {who:'gloaming'} is emitted) -> ending.
usage: python3 test/e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)   shots: /tmp/claude-0/act1/"""
import asyncio, sys, os, json
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
SHOTS='/tmp/claude-0/act1'; os.makedirs(SHOTS,exist_ok=True)
from playwright.async_api import async_playwright
OBJ="document.getElementById('obj').textContent"
USE="""(lab=>{ const c=G.interact.pick(G.player.pos); const l=c&&G.interact.label(c); if(c&&(!lab||l===lab))c.use(); return l; })"""
STEPS=[
 ("start","window._ev=[]; for(const e of ['finale:start','boss:dead','lamp:failed','storm:pickup','lamp:pulse'])G.on(e,d=>_ev.push(e+(d&&d.who?':'+d.who:''))); document.getElementById('begin').click(); G.step(1/30,10); [G.quest.step, G.lighthouse.darkK>0.9, !!G.lighthouse.beam, typeof G.lighthouse.beam.yaw()]",
   lambda r:r[0]=='cottage' and r[1] and r[2] and r[3]=='number'),
 ("door","G.player.teleport(172,42,0,Math.PI/2); G.input.setVirtual('forward',true); G.step(1/30,45); G.input.setVirtual('forward',false); ["+OBJ+", G.player.pos.x<176]",
   lambda r:r[0]=='Find a light' and r[1]),
 ("halloran","const h=G.creatures.halloran; const p=h.pos; G.player.teleport(p.x+1.6,p.y,p.z,0); G.step(1/30,10); const ls=[]; for(let i=0;i<3;i++){ls.push(("+USE+")()); G.step(1/30,5);} ["+OBJ+", ls[0]]",
   lambda r:r[0]=='Take Halloran’s storm lantern'),
 ("storm","const T=G.items.storm; G.player.teleport(T.pos.x-1.2,null,T.pos.z,Math.PI/2); G.step(1/30,10); const l=("+USE+")('Take the storm lantern'); G.step(1/30,10); [l, T.carried, "+OBJ+", G.items.lantern.found, G.creatures.lanternCount]",
   lambda r:r[1] and r[2]=='Climb to the lamp room' and not r[3] and r[4]==0),
 ("enter","G.player.teleport(172,42,0,Math.PI/2); G.input.setVirtual('forward',true); G.step(1/30,70); G.input.setVirtual('forward',false); [G.world.lighthouse.inside(G.player.pos), "+OBJ+", G.atmo.darkTarget]",
   lambda r:r[0] and r[1]=='Take the Keeper’s Staff'),
 ("staff","const s=G.items.staff.pos; G.player.teleport(s.x-.9,G.floorAt(s.x-.9,s.z,s.y)+.01,s.z-.6,0); G.player.pos.y=53.7; G.step(1/30,10); const l=("+USE+")(); G.step(1/30,4); [l, G.items.staff.owned, "+OBJ+"]",
   lambda r:r[1] and r[2]=='Climb to the lamp room'),
 ("cradle","G.player.teleport(181.5,66,-1.5,0); G.player.pos.y=66; G.step(1/30,10); const o="+OBJ+"; const l=("+USE+")('Set the storm lantern in the cradle'); G.step(1/30,40); [o, l, G.items.storm.inCradle, "+OBJ+"]",
   lambda r:r[0]=='Set the storm lantern in the cradle' and r[2] and r[3]=='Watch'),
 ("failed","G.step(1/30,150); const T=G.items.storm; [T.failed, T.carried, T.inCradle, "+OBJ+", G.flag('stormFailed'), _ev.includes('lamp:failed'), G.lighthouse.cured]",
   lambda r:r[0] and r[1] and not r[2] and r[3]=='Go back down' and r[5] and not r[6]),
 ("logbook","const lb=G.interact.list.find(o=>G.interact.label(o)==='Read the logbook on the sill'); const p=lb.pos(); G.player.teleport(p.x,66,p.z,0); G.player.pos.y=66; G.step(1/30,6); const l=("+USE+")('Read the logbook on the sill'); G.step(1/30,3); [l, G.flag('logbook')]",
   lambda r:r[0]=='Read the logbook on the sill' and r[1]),
 ("pulse","G.player.teleport(181.4,66,1.6,0); G.player.pos.y=66; let mx=0, kmin=9; for(let i=0;i<120;i++){ G.step(1/30,1); mx=Math.max(mx,G.lighthouse.pulseK); } [+mx.toFixed(2), _ev.filter(e=>e==='lamp:pulse').length, +G.lighthouse.stormNear.toFixed(2)]",
   lambda r:r[0]>0.5 and r[1]>=1),
 ("exit","const d=G.world.lighthouse.doorIn; G.player.teleport(d.x,d.y,d.z,-Math.PI/2); G.input.setVirtual('forward',true); G.step(1/30,50); G.input.setVirtual('forward',false); G.step(1/30,10); const h=G.creatures.halloran.pos; [G.world.lighthouse.inside(G.player.pos), "+OBJ+", +Math.hypot(h.x-180,h.z).toFixed(1)]",
   lambda r:not r[0] and r[1]=='Talk to Halloran' and r[2]<14),
 ("halloran2","const h=G.creatures.halloran.pos; G.player.teleport(h.x-1.6,null,h.z,Math.PI/2); G.step(1/30,10); const ls=[]; for(let i=0;i<3;i++){ls.push(("+USE+")()); G.step(1/30,5);} ["+OBJ+", ls]",
   lambda r:r[0]=='Find Maren’s lantern'),
 ("stag","const e=G.flow.stagEdge(); G.player.teleport(e.x-8,null,e.z,-Math.PI/2); G.step(1/30,30); const b=G.monsters.boss; G.step(1/30,90); const L=G.items.lantern.pos; [!!b&&b.kind, "+OBJ+", G.state.checkpointName, b&&b.state, +Math.hypot(b.pos.x-L.x,b.pos.z-L.z).toFixed(1)]",
   lambda r:r[0]=='stag' and r[1]=='Take back Maren’s lantern' and r[2]=='the edge of the old wood'),
 ("blocked","const L=G.items.lantern.pos; G.devtools&&G.devtools.toggle&&G.devtools.toggle('god'); G.player.teleport(L.x+1,null,L.z,0); G.step(1/30,4); const c=G.interact.pick(G.player.pos); const l=c&&G.interact.label(c); [l, G.monsters.boss&&G.monsters.boss.state]",
   lambda r:r[0]=='The Hollow Stag stands over it'),
 ("stagdown","const b=G.monsters.boss; let n=0; while(b&&b.alive&&!b.dying&&n<120){ G.combat.strike({x:b.pos.x,y:b.pos.y+1,z:b.pos.z,radius:3,team:'player',damage:4}); G.step(1/30,12); n++; } G.step(1/30,150); G.devtools&&G.devtools.toggle&&G.devtools.toggle('god'); [n, _ev.includes('boss:dead:stag'), G.flow.stagDead, "+OBJ+", G.state.mode, !document.getElementById('ending').hidden]",
   lambda r:r[1] and r[2] and r[3]=='Take Maren’s lantern' and r[4]=='play' and not r[5]),
 ("lantern","const L=G.items.lantern.pos; G.player.teleport(L.x+1,null,L.z,0); G.step(1/30,10); const l=("+USE+")(); G.step(1/30,40); [l, G.items.lantern.carried, "+OBJ+", G.items.storm.spent, G.creatures.lanternCount]",
   lambda r:r[1] and r[2]=='Carry the lantern to the lighthouse' and r[3] and r[4]>=40),
 ("enter2","G.player.teleport(172,42,0,Math.PI/2); G.input.setVirtual('forward',true); G.step(1/30,70); G.input.setVirtual('forward',false); [G.world.lighthouse.inside(G.player.pos), "+OBJ+"]",
   lambda r:r[0] and r[1]=='Climb to the lamp room'),
 ("lamp","G.player.teleport(181.5,66,-1.5,0); G.player.pos.y=66; G.step(1/30,10); const l=("+USE+")(); [l, G.items.lantern.inCradle]",
   lambda r:r[1]),
 ("cure","G.step(1/30,450); [G.items.lantern.cured, G.atmo.cured.toFixed(2), "+OBJ+", G.lighthouse.beam.lit, +G.lighthouse.darkK.toFixed(2)]",
   lambda r:r[0] and r[2]=='Something is climbing the cliff' and r[3] and r[4]<0.05),
 ("finale","G.player.teleport(160,42,0,Math.PI/2); G.step(1/30,90); ["+OBJ+", _ev.includes('finale:start'), !!G.monsters.boss, !!G.finaleBoss]",
   lambda r:r[0]=='Defend the lighthouse' and r[1] and not r[2]),
 ("boss","""(()=>{ const B=G.finaleBoss; let n=0, how='emit';
   if(B&&B.active){ how='boss'; G.devtools&&G.devtools.toggle&&G.devtools.toggle('god');
     while(B.active&&B.hp>0&&n<400){ if(B.solid){ const p=B.pos||B.heart||G.player.pos; G.combat.strike({x:p.x,y:(p.y||42)+1,z:p.z,radius:4,team:'player',damage:4}); } G.step(1/30,6); n++; }
     if(B.active&&B.hp>0){ how='hp'; B.hp=0; G.step(1/30,30); if(!_ev.includes('boss:dead:gloaming')){ how='hp+emit'; G.emit('boss:dead',{who:'gloaming'}); } }
     G.devtools&&G.devtools.toggle&&G.devtools.toggle('god'); }
   else G.emit('boss:dead',{who:'gloaming'});
   G.step(1/30,420); return [how, n, G.state.mode, !document.getElementById('ending').hidden]; })()""",
   lambda r:r[2]=='ending' and r[3]),
]
SHOT={'storm':'e2e-storm','failed':'e2e-failed','stag':'e2e-stag','lantern':'e2e-swarm','cure':'e2e-cure','boss':'e2e-ending'}
async def main():
    fails=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':1100,'height':650})
        errs=[]; pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and '404' not in m.text else None)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(6000)
        for name,js,ok in STEPS:
            try: r=await pg.evaluate(js)
            except Exception as e: r='EXC '+str(e)[:300]
            good=False
            try: good=bool(ok(r))
            except Exception: good=False
            print(('ok   ' if good else 'FAIL ')+name,':',json.dumps(r,ensure_ascii=False))
            if not good: fails.append(name)
            await pg.wait_for_timeout(600)
            if name in SHOT:
                await pg.evaluate('G.headless&&G.headless.draw(3); 0'); await pg.wait_for_timeout(250)
                await pg.screenshot(path=f'{SHOTS}/{SHOT[name]}.png',timeout=120000)
        for e in errs[:15]: print('  ',e[:300])
        await b.close()
    if errs: fails.append('console errors')
    print('\nFAILED: '+', '.join(fails) if fails else '\nALL PASS'); sys.exit(1 if fails else 0)
asyncio.run(main())

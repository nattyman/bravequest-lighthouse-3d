"""Rowan's boat (boat.js): the second north-island seed.
- before the wrecker's light is seen there's no boat quest: no parts out, nothing to do at the wreck;
- seeing the light starts it (Rowan's line, the objective, the map pin);
- "Look over the boat" at the wreck: Rowan names the four parts and where they are; the map pins them;
- each part is a pickup at its place (real interact): toast, counted in the objective; the wreck shows the count;
- with all four: "Patch the boat" takes ~3 s (the screen dims), then the broken hull is gone (mesh + colliders) and the
  patched boat floats in the shallows; "Sail north" starts the crossing (northisle_e2e.py covers the rest);
- it all survives a save, a page reload and Continue.
usage: python3 test/boat_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, json
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'

LIB=r"""
window.T={
  play(){ if(G.state.mode==='paused'&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); if(G.state.mode!=='play'&&G.state.mode!=='dead')G.setMode('play'); },
  calm(){ for(let i=0;i<10&&G.talk&&G.talk.isOpen;i++)G.talk.advance(); for(let i=0;i<14;i++)G.ui.advance&&G.ui.advance(); T.play(); },
  near(x,z,d){ const P=G.player; const a=Math.atan2(P.pos.x-x,P.pos.z-z)||0; const px=x+Math.sin(a)*(d||1.2), pz=z+Math.cos(a)*(d||1.2);
    P.teleport(px,G.floorAt(px,pz,G.world.height(px,pz)+3),pz,Math.atan2(x-px,z-pz)); G.step(1/30,4); },
  use(re){ T.play(); G.step(1/30,2); const c=G.interact.pick(G.player.pos), lab=c&&G.interact.label(c); if(!c||(re&&!re.test(lab)))return 'NOPE:'+lab; c.use(); G.step(1/30,2); return lab; },
  said(re){ return G.ui.messages().some(m=>re.test(m.text)); },
  mark(id){ const m=(G.map.markers||[]).find(x=>x.id===id); return m?!!m.visible():null; },
};
'ok'"""

STEPS=[
 ("idleBefore", "(()=>{ document.getElementById('begin')&&document.getElementById('begin').click(); G.step(1/30,30); G.debugStartLoop(); G.step(1/30,30); T.calm();"
   " const w=G.boat.debug.wreckPos; T.near(w.x,w.z,1); const lab=T.use(); return {started:G.boat.started,lab,parts:G.boat.PARTS.map(p=>p.mesh.visible),hull:G.world.wreck.hull.visible}; })()",
   lambda r: not r['started'] and r['lab'].startswith('NOPE') and not any(r['parts']) and r['hull']),
 ("starts", "(()=>{ G.north.debug.see(); for(let i=0;i<240;i++)G.step(1/30,1); T.calm(); return {started:G.boat.started,line:T.said(/patch her/),step:G.quest.step,obj:document.getElementById('obj').textContent,pin:T.mark('boat'),partPins:G.boat.PARTS.map(p=>T.mark('boat-'+p.id))}; })()",
   lambda r: r['started'] and r['line'] and r['step']=='boat' and r['obj']=='Your boat' and r['pin'] and not any(r['partPins'])),
 ("lookOver", "(()=>{ const w=G.boat.debug.wreckPos; T.near(w.x,w.z,1); const lab=T.use(/Look over/); G.step(1/30,4); return {lab,where:['hamlet','shed','cottage','kiln'].map(k=>T.said(new RegExp(k))),step:G.quest.step,partPins:G.boat.PARTS.map(p=>T.mark('boat-'+p.id)),parts:G.boat.PARTS.map(p=>p.mesh.visible)}; })()",
   lambda r: r['lab']=='Look over the boat' and all(r['where']) and r['step']=='boat:parts' and all(r['partPins']) and all(r['parts'])),
 ("partsReachable", "(()=>{ const out={}; for(const p of G.boat.PARTS){ const y=G.world.height(p.x,p.z), f=G.floorAt(p.x,p.z,y+2); out[p.id]={walk:Math.abs(f-y)<.6,col:G.collidersNear(p.x,p.z).filter(c=>Math.hypot(p.x-c.x,p.z-c.z)<c.r+.2).length}; } return out; })()",
   lambda r: all(v['walk'] and v['col']==0 for v in r.values())),
 ("gather", "(()=>{ const got=[]; let toast=0; G.on('boat:part',()=>toast++); for(const p of G.boat.PARTS.slice(0,3)){ T.near(p.x,p.z,1.1); got.push(T.use(/Take/)); G.step(1/30,10); T.calm(); }"
   " const w=G.boat.debug.wreckPos; T.near(w.x,w.z,1); G.step(1/30,2); const c=G.interact.pick(G.player.pos); return {got,n:G.boat.count(),toast,wreckLab:c&&G.interact.label(c),sub:document.getElementById('objSub').textContent}; })()",
   lambda r: all(g.startswith('Take') for g in r['got']) and r['n']==3 and r['toast']==3 and r['wreckLab']=='The boat · 3 of 4 parts' and '3 of 4' in r['sub']),
 ("stillNeed", "(()=>{ const lab=T.use(/The boat/); G.step(1/30,4); return {lab,need:T.said(/Still need: pitch from the old wood/)}; })()",
   lambda r: r['need']),
 ("patch", "(()=>{ const p=G.boat.PARTS[3]; T.near(p.x,p.z,1.1); T.use(/Take/); G.step(1/30,10); T.calm(); const w=G.boat.debug.wreckPos; T.near(w.x,w.z,1); const lab=T.use(/Patch/); G.step(1/30,6);"
   " const dim=+getComputedStyle(document.getElementById('fade')).opacity, mid=G.boat.working&&!G.boat.built; let t=0; while(G.boat.working&&t<200){ G.step(1/30,1); t++; } G.step(1/30,40);"
   " const hc=G.world.wreck.hullColliders.every(c=>c._off); const bt=G.scene.getObjectByName('rowanBoat'); return {lab,mid,dim:dim>.3,secs:+(t/30).toFixed(1),built:G.boat.built,hull:G.world.wreck.hull.visible,hc,boat:bt.visible,afloat:bt.position.y<.2,step:G.quest.step,line:T.said(/She’ll float/)}; })()",
   lambda r: r['lab']=='Patch the boat' and r['mid'] and 2.5<=r['secs']<=3.6 and r['built'] and not r['hull'] and r['hc'] and r['boat'] and r['afloat'] and r['step']=='boat:ready' and r['line']),
 ("sailNorth", "(()=>{ T.calm(); const m=G.boat.debug.moor; T.near(m.x,m.z,3.4); G.step(1/30,2); const c=G.interact.pick(G.player.pos); const lab=c&&G.interact.label(c); if(c)c.use(); G.step(1/30,4); return {lab,crossing:!!(G.northIsle&&G.northIsle.crossing)}; })()",
   lambda r: r['lab']=='Sail north' and r['crossing']),
 ("save", "(()=>{ T.calm(); G.flow.writeSave(); return !!localStorage.getItem(G.flow.keys.save); })()", lambda r: r),
]
AFTER=[
 ("restored", "(()=>{ return {built:G.boat.built,started:G.boat.started,n:G.boat.count(),hull:G.world.wreck.hull.visible,boat:G.scene.getObjectByName('rowanBoat').visible,hc:G.world.wreck.hullColliders.every(c=>c._off),parts:G.boat.PARTS.map(p=>p.mesh.visible)}; })()",
   lambda r: r['built'] and r['started'] and r['n']==4 and not r['hull'] and r['boat'] and r['hc'] and not any(r['parts'])),
]

async def run(pg,steps,fails):
  for name,js,ok in steps:
    try: r=await pg.evaluate(js); good=bool(ok(r))
    except Exception as e: r=str(e)[:300]; good=False
    print(('ok  ' if good else 'FAIL'),name,':',json.dumps(r)[:420])
    if not good: fails.append(name)

async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=await b.new_context(viewport={'width':960,'height':540}); pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
    await pg.evaluate("localStorage.removeItem('bq-save-v1')"); await pg.evaluate('G.headless&&(G.headless.hold=true);0')
    await pg.evaluate(LIB); fails=[]
    await run(pg,STEPS,fails)
    await pg.reload(timeout=180000); await pg.wait_for_timeout(5000); await pg.evaluate('G.headless&&(G.headless.hold=true);0')
    await pg.evaluate("document.getElementById('continue').click(); G.step(1/30,60); 0")
    await run(pg,AFTER,fails)
    print('ok  ' if not errs else 'FAIL','noPageErrors :',errs[:3])
    if errs: fails.append('noPageErrors')
    print('RESULT:', 'PASSED' if not fails else 'FAILED '+', '.join(fails))
    await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())

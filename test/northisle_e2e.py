"""The north island, first slice (northisle.js): the crossing and the landing.
- the island is out there before you go (its own ground under G.world.height, walkable land, sea round it), drawn only near;
- "Sail north" at the patched boat starts the crossing: control off, the boat leaves the south beach, then the fog leg with
  Rowan's lines, then the landing in the cove (the boat moored there, a checkpoint, the north objective, the landing line);
- the path from the beach to the tower is walkable all the way (no step too steep, nothing solid on it);
- the two nameboards, the crates and the barred door (the door sets the "next chapter" objective);
- the core loop's objective doesn't take the HUD back while you're over there; the chart won't take you home;
- "Sail home" brings you (and the boat) back to the south beach; sailing again and saving on the island survives a reload.
usage: python3 test/northisle_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, json
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'

LIB=r"""
window.T={
  play(){ if(G.state.mode==='paused'&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); if(G.state.mode!=='play'&&G.state.mode!=='dead')G.setMode('play'); },
  calm(){ for(let i=0;i<10&&G.talk&&G.talk.isOpen;i++)G.talk.advance(); for(let i=0;i<14;i++)G.ui.advance&&G.ui.advance(); T.play(); },
  near(x,z,d,y){ const P=G.player; const a=Math.atan2(P.pos.x-x,P.pos.z-z)||0; const px=x+Math.sin(a)*(d||1.2), pz=z+Math.cos(a)*(d||1.2);
    P.teleport(px,G.floorAt(px,pz,(y!=null?y:G.world.height(px,pz))+3),pz,Math.atan2(x-px,z-pz)); G.step(1/30,4); },
  use(re){ T.play(); G.step(1/30,2); const c=G.interact.pick(G.player.pos), lab=c&&G.interact.label(c); if(!c||(re&&!re.test(lab)))return 'NOPE:'+lab; c.use(); G.step(1/30,2); return lab; },
  said(re){ return G.ui.messages().some(m=>re.test(m.text)); },
  run(s){ for(let i=0;i<Math.round(s*30);i++)G.step(1/30,1); },
};
'ok'"""

STEPS=[
 ("islandOutThere", "(()=>{ document.getElementById('begin')&&document.getElementById('begin').click(); G.step(1/30,30); G.debugStartLoop(); G.step(1/30,30); T.calm();"
   " const N=G.northIsle, b=N.cove.beach, m=N.cove.moor; G.step(1/30,4);"
   " return {at:N.at,inside:N.inside,top:+G.world.height(N.tower.x,N.tower.z).toFixed(1),beachH:+G.world.height(b.x,b.z).toFixed(2),walkBeach:G.world.walkable(b.x,b.z),walkSea:G.world.walkable(m.x,m.z),"
   " sea:+G.world.height(150,-560).toFixed(1),home:+G.world.height(0,20).toFixed(1),drawn:G.scene.getObjectByName('northIsle').visible}; })()",
   lambda r: r['at']=='home' and not r['inside'] and r['top']==26 and 0<r['beachH']<2 and r['walkBeach'] and not r['walkSea'] and r['sea']<-1 and r['home']>4 and not r['drawn']),
 ("sailNorth", "(()=>{ G.north.debug.see(); G.boat.debug.start(); G.boat.debug.build(); T.run(7); T.calm(); const m=G.boat.debug.moor; T.near(m.x,m.z,3.4); const lab=T.use(/Sail north/); G.step(1/30,6);"
   " return {lab,on:G.northIsle.crossing,ctl:G.player.inputEnabled,step:G.quest.step,block:G.map.travelBlock('lighthouse')}; })()",
   lambda r: r['lab']=='Sail north' and r['on'] and r['ctl']==False and r['step']=='north:crossing' and r['block'] and 'boat' in r['block']),
 ("fogLeg", "(()=>{ let leg=false, far=0; for(let i=0;i<30*8;i++){ G.step(1/30,1); if(G.northIsle.crossPhase===1){ leg=true; far=Math.min(far,G.boat.mesh.position.z); } }"
   " T.run(4); for(let i=0;i<30*14&&G.northIsle.crossing;i++)G.step(1/30,1); return {leg,far:Math.round(far),lines:[/light behind me/,/can’t name/,/That’s how I got home/].map(re=>T.said(re)),fig:!!G.scene.getObjectByName('rowanSailing')}; })()",
   lambda r: r['leg'] and r['far']<-250 and all(r['lines']) and r['fig']),
 ("landed", "(()=>{ T.run(1); const N=G.northIsle, P=G.player, b=N.cove.beach, m=N.cove.moor, bt=G.boat.mesh.position; T.run(5);"
   " return {on:N.crossing,at:N.at,inside:N.inside,ctl:P.inputEnabled,vis:P.model.visible,d:+Math.hypot(P.pos.x-b.x,P.pos.z-b.z).toFixed(1),boat:+Math.hypot(bt.x-m.x,bt.z-m.z).toFixed(1),cp:G.state.checkpointName,step:G.quest.step,"
   " line:T.said(/Every boat on this beach/),chill:G.fog.chill,fogIn:G.fog.inside(P.pos),drawn:G.scene.getObjectByName('northIsle').visible}; })()",
   lambda r: not r['on'] and r['at']=='north' and r['inside'] and r['ctl'] and r['vis'] and r['d']<1.5 and r['boat']<.5 and r['cp']=='the north island' and r['step']=='north:tower' and r['line'] and r['chill']==0 and r['fogIn'] and r['drawn']),
 ("pathWalkable", "(()=>{ const P=G.northIsle.path, bad=[]; let steep=0; for(let i=0;i<P.length-1;i++){ const n=Math.ceil(Math.hypot(P[i+1][0]-P[i][0],P[i+1][1]-P[i][1])/.5);"
   " for(let k=0;k<n;k++){ const t=k/n, t2=(k+1)/n, x=P[i][0]+(P[i+1][0]-P[i][0])*t, z=P[i][1]+(P[i+1][1]-P[i][1])*t, x2=P[i][0]+(P[i+1][0]-P[i][0])*t2, z2=P[i][1]+(P[i+1][1]-P[i][1])*t2;"
   " const f=G.floorAt(x,z), f2=G.floorAt(x2,z2); steep=Math.max(steep,Math.abs(f2-f)/Math.hypot(x2-x,z2-z)); if(!G.world.walkable(x,z))bad.push(['wet',x|0,z|0]);"
   " for(const c of G.collidersNear(x,z)){ if(Math.hypot(c.x-x,c.z-z)<c.r+.45&&c.y1>f+.3&&c.y0<f+1.5)bad.push(['solid',x|0,z|0]); } } } return {steep:+steep.toFixed(2),bad:bad.slice(0,6),n:bad.length}; })()",
   lambda r: r['steep']<1.0 and r['n']==0),
 ("walkUp", "(()=>{ const P=G.player, path=G.northIsle.path; let lost=0; T.near(path[0][0],path[0][1],.3); for(let i=1;i<path.length;i++){ const tx=path[i][0], tz=path[i][1];"
   " for(let k=0;k<400;k++){ const dx=tx-P.pos.x, dz=tz-P.pos.z, d=Math.hypot(dx,dz); if(d<.6)break; const s=Math.min(.18,d); const r=G.moveCharacter(P.pos,dx/d*s,dz/d*s,P.radius,'player'); if(r.blocked){ lost++; break; } P.pos.y=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.7); } }"
   " return {lost,end:+Math.hypot(P.pos.x-path[path.length-1][0],P.pos.z-path[path.length-1][1]).toFixed(1),y:+P.pos.y.toFixed(1),saw:(G.step(1/30,4),T.said(/fire in a cage/))}; })()",
   lambda r: r['lost']==0 and r['end']<1 and r['y']>24 and r['saw']),
 ("boards", "(()=>{ T.calm(); const out=[]; for(const b of G.northIsle.debug.boards){ T.near(b.pos.x,b.pos.z,1.2,b.pos.y); out.push(T.use(/nameboard/)); G.step(1/30,4); T.calm(); }"
   " return {out,margery:T.said(/There wasn’t a storm/),swift:T.said(/anyone who comes this way/),read:Object.keys(G.northIsle.state.read)}; })()",
   lambda r: all(o=='Read the nameboard' for o in r['out']) and r['margery'] and r['swift'] and len(r['read'])==2),
 ("crates", "(()=>{ const p=G.northIsle.debug.pile; T.near(p.x,p.z,1,p.y); const lab=T.use(/crates/); G.step(1/30,4); return {lab,said:T.said(/salvages what the light brings in/)}; })()",
   lambda r: r['lab']=='Look over the crates' and r['said']),
 ("door", "(()=>{ T.calm(); let ev=null; G.on('north:door',e=>ev=e); const d=G.northIsle.debug.doorPos; T.near(d.x,d.z,.8,d.y); const lab=T.use(/door/); T.run(4); T.calm();"
   " return {lab,ev:!!ev,barred:T.said(/Barred\\. From the inside/),keeps:T.said(/keeps that fire lit/),step:G.quest.step,obj:document.getElementById('obj').textContent}; })()",
   lambda r: r['lab']=='Try the door' and r['ev'] and r['barred'] and r['keeps'] and r['step']=='north:door' and 'tower' in r['obj']),
 ("objectiveStays", "(()=>{ T.run(26); return {step:G.quest.step}; })()", lambda r: r['step']=='north:door'),
 ("sailHome", "(()=>{ T.calm(); const b=G.northIsle.cove.beach; G.player.teleport(b.x,null,b.z,0); G.step(1/30,4); const m=G.northIsle.cove.moor, dir=G.northIsle.cove.dir;"
   " const x=m.x-dir.x*5.2, z=m.z-dir.z*5.2; G.player.teleport(x,null,z,0); G.step(1/30,4); const lab=T.use(/Sail home/); T.run(3.5); T.calm(); const P=G.player, w=G.boat.debug.wreckPos, mo=G.boat.debug.moor, bt=G.boat.mesh.position;"
   " return {lab,at:G.northIsle.at,inside:G.northIsle.inside,home:+Math.hypot(P.pos.x-w.x,P.pos.z-w.z).toFixed(1),boat:+Math.hypot(bt.x-mo.x,bt.z-mo.z).toFixed(1),ctl:P.inputEnabled,cp:G.state.checkpointName,line:T.said(/sail south/),"
   " again:(T.near(mo.x,mo.z,3.4),G.interact.label(G.interact.pick(P.pos)||{label:''}))}; })()",
   lambda r: r['lab']=='Sail home' and r['at']=='home' and not r['inside'] and r['home']<6 and r['boat']<.3 and r['ctl'] and r['cp']=='the south beach' and r['line'] and r['again']=='Sail north'),
 ("saveOnIsland", "(()=>{ G.northIsle.cross('north',{instant:true}); T.run(3); T.calm(); G.flow.writeSave(); return {at:G.northIsle.at,saved:!!localStorage.getItem(G.flow.keys.save)}; })()",
   lambda r: r['at']=='north' and r['saved']),
]
AFTER=[
 ("restored", "(()=>{ const N=G.northIsle, P=G.player, m=N.cove.moor, bt=G.boat.mesh.position; G.step(1/30,10);"
   " return {at:N.at,inside:N.inside,boat:+Math.hypot(bt.x-m.x,bt.z-m.z).toFixed(1),y:+P.pos.y.toFixed(1),door:N.state.door,read:Object.keys(N.state.read).length,step:G.quest.step,alive:P.alive}; })()",
   lambda r: r['at']=='north' and r['inside'] and r['boat']<.3 and r['y']>-.5 and r['door'] and r['read']>=2 and r['alive']),
]

async def run(pg,steps,fails):
  for name,js,ok in steps:
    try: r=await pg.evaluate(js); good=bool(ok(r))
    except Exception as e: r=str(e)[:300]; good=False
    print(('ok  ' if good else 'FAIL'),name,':',json.dumps(r)[:460])
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

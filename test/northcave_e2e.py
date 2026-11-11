"""The wreckers' stair (northcave.js): the sea cave into the wrecker's tower, and the first meeting with Rowan's father.
- after the barred door, the objective points to the cave; the shore shelf from the cove to the mouth is walkable;
- at high tide the cave won't let you in; at low tide it does (fade, interior, no fog, the north light and the island hidden);
- the landing, the way to the store, the ledger (a reading card, then "That's my father's hand"), the carved boat;
- the low passage stops you at the water's edge until the sluice wheel drains it (~4.6 s);
- the hoist carries you up to the foot of the tower (a checkpoint); his father comes down; the talk card (Tobias Knox) with its
  branches; then he goes back up and bars the trapdoor; the objective says the next chapter starts there;
- back down and out of the cave: the island again, its checkpoint back; it all survives a save and reload.
usage: python3 test/northcave_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, json
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'

LIB=r"""
window.T={
  play(){ if(G.state.mode==='paused'&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); if(G.state.mode!=='play'&&G.state.mode!=='dead')G.setMode('play'); },
  calm(){ for(let i=0;i<10&&G.talk&&G.talk.isOpen;i++)G.talk.advance(); for(let i=0;i<14;i++)G.ui.advance&&G.ui.advance(); T.play(); },
  use(re){ T.play(); G.step(1/30,2); const c=G.interact.pick(G.player.pos), lab=c&&G.interact.label(c); if(!c||(re&&!re.test(lab)))return 'NOPE:'+lab; c.use(); G.step(1/30,2); return lab; },
  said(re){ return G.ui.messages().some(m=>re.test(m.text)); },
  run(s){ for(let i=0;i<Math.round(s*30);i++)G.step(1/30,1); },
  // walk (collision, slopes, walls) to (x,z); 'ok' or where it stopped
  walk(x,z,n){ const P=G.player; for(let k=0;k<(n||900);k++){ const dx=x-P.pos.x, dz=z-P.pos.z, d=Math.hypot(dx,dz); if(d<.35)return 'ok'; const s=Math.min(.15,d);
      const r=G.moveCharacter(P.pos,dx/d*s,dz/d*s,P.radius,'player'); if(r.blocked)return 'blocked'; P.pos.y=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.7); if(P.pos.y<-100)return 'fell'; }
    return 'stuck@'+(P.pos.x-G.northCave.O.x).toFixed(1)+','+(P.pos.y-G.northCave.O.y).toFixed(1)+','+(P.pos.z-G.northCave.O.z).toFixed(1); },
  route(pts){ const w=G.northCave.debug.toWorld; const out=[]; for(const [x,z] of pts){ const p=w(x,0,z); out.push(T.walk(p.x,p.z)); G.step(1/30,2); } return out; },
  L(){ const P=G.player.pos, O=G.northCave.O; return [+(P.x-O.x).toFixed(2),+(P.y-O.y).toFixed(2),+(P.z-O.z).toFixed(2)]; },
};
'ok'"""

STEPS=[
 ("objective", "(()=>{ document.getElementById('begin')&&document.getElementById('begin').click(); G.step(1/30,30); G.debugStartLoop(); G.step(1/30,30); T.calm();"
   " G.north.debug.see(); G.boat.debug.start(); G.boat.debug.build(); T.run(7); T.calm(); G.northIsle.debug.arrive('north'); T.run(1); T.calm();"
   " const d=G.northIsle.debug.doorPos; G.player.teleport(d.x,null,d.z,0); G.step(1/30,4); T.use(/door/); T.run(5); T.calm();"
   " return {step:G.quest.step,hint:T.said(/another way in/),mouth:!!G.northCave.mouth}; })()",
   lambda r: r['step']=='north:cave' and r['hint'] and r['mouth']),
 ("shoreToMouth", "(()=>{ const N=G.northIsle, M=G.northCave.mouth, C=N.centre, b=N.cove.beach; G.player.teleport(b.x,null,b.z,0); G.step(1/30,4); const a0=N.cove.mouthA-.55, a1=N.cove.mouthA, out=[];"
   " for(let k=1;k<=24;k++){ const a=a0+(a1-a0)*k/24, R=N.shoreR(a)+1.2; const r=T.walk(C.x+Math.cos(a)*R,C.z+Math.sin(a)*R); if(r!=='ok'){ out.push(k+':'+r); break; } }"
   " out.push(T.walk(M.x,M.z)); G.step(1/30,30); return {out,ring:T.said(/iron ring in the rock/)}; })()",
   lambda r: all(o=='ok' for o in r['out']) and r['ring']),
 ("highTide", "(()=>{ G.alchemy.debug.setTide(0,true); G.step(1/30,4); T.calm(); const lab=T.use(/sea cave/); G.step(1/30,10); return {lab,inside:G.northCave.inside,said:T.said(/go out with the tide/)}; })()",
   lambda r: r['lab']=='The sea cave' and not r['inside'] and r['said']),
 ("lowTideIn", "(()=>{ G.alchemy.debug.setTide(150,true); G.step(1/30,4); T.calm(); const lab=T.use(/sea cave/); T.run(2); T.calm(); T.run(3.5); const P=G.player;"
   " return {lab,inside:G.northCave.inside,interior:G.interior&&G.interior.id,niIn:G.northIsle.inside,fogIn:G.fog.inside(P.pos),chill:G.fog.chill,light:G.north.vis<.2,isle:G.scene.getObjectByName('northTerrain').visible,"
   " cp:G.state.checkpointName,step:G.quest.step,line:T.said(/keeps lamps lit down here/),ctl:P.inputEnabled,block:G.map.travelBlock('lighthouse'),L:T.L()}; })()",
   lambda r: r['lab']=='Go into the sea cave' and r['inside'] and r['interior']=='northCave' and r['niIn'] and r['fogIn'] and r['chill']==0 and r['light'] and not r['isle'] and r['cp']=='the sea cave' and r['step']=='north:caveIn' and r['line'] and r['ctl'] and r['block']),
 ("toTheStore", "(()=>{ const r=T.route([[0,-12],[-3,-16],[-5,-19],[-13,-27],[-19.6,-32.2]]); return {r,L:T.L()}; })()",
   lambda r: all(o=='ok' for o in r['r']) and abs(r['L'][1]-1.6)<.1),
 ("ledger", "(()=>{ const lab=T.use(/ledger/); G.step(1/30,4); const s=G.talk.state&&G.talk.state(); const card=G.talk.isOpen, name=s&&s.name; T.calm(); T.run(7); T.calm();"
   " return {lab,card,name,hand:T.said(/my father’s hand/),alive:T.said(/He’s alive/),step:G.quest.step}; })()",
   lambda r: r['lab']=='Read the ledger' and r['card'] and r['hand'] and r['alive'] and r['step']=='north:sluice'),
 ("toy", "(()=>{ const r=T.route([[-21,-31.6]]); const lab=T.use(/carved boat/); T.run(3); return {r,lab,said:T.said(/R cut in the keel/)}; })()",
   lambda r: r['lab']=='The carved boat' and r['said']),
 ("flooded", "(()=>{ T.calm(); const r=T.route([[-13,-27],[-5,-19],[-1,-23],[0,-26]]); const w=G.northCave.debug.toWorld, p=w(0,0,-34); const stop=T.walk(p.x,p.z,120); G.step(1/30,4); const L=T.L();"
   " return {r,stop,L,alive:G.player.alive,said:T.said(/flooded right to the roof/)}; })()",
   lambda r: all(o=='ok' for o in r['r']) and r['stop']!='ok' and r['L'][2]>-28.3 and r['L'][1]>-.2 and r['alive'] and r['said']),
 ("sluice", "(()=>{ T.calm(); const r=T.route([[.3,-25]]); const lab=T.use(/sluice/); let t=0; while(!G.northCave.state.drained&&t<300){ G.step(1/30,1); t++; }"
   " return {r,lab,secs:+(t/30).toFixed(1),drained:G.northCave.state.drained,step:G.quest.step}; })()",
   lambda r: r['lab']=='Turn the sluice wheel' and 4<=r['secs']<=5.2 and r['drained'] and r['step']=='north:hoist'),
 ("throughToHoist", "(()=>{ T.calm(); const r=T.route([[0,-27],[0,-33],[0,-41],[0,-46.7]]); return {r,L:T.L(),low:Math.min(...[-30,-32,-34].map(z=>{ const w=G.northCave.debug.toWorld(0,0,z); return +(G.floorAt(w.x,w.z,62)-60).toFixed(2); }))}; })()",
   lambda r: all(o=='ok' for o in r['r']) and abs(r['L'][1]-1)<.1 and r['low']<-1),
 ("hoistUp", "(()=>{ const lab=T.use(/hoist/); let t=0; while(G.northCave.state.plat<24.9&&t<400){ G.step(1/30,1); t++; } G.step(1/30,10);"
   " return {lab,secs:+(t/30).toFixed(1),L:T.L(),top:G.northCave.state.hoistTop,cp:G.state.checkpointName,cam:+(G.camera.position.y-60).toFixed(1)}; })()",
   lambda r: r['lab']=='Work the hoist' and 6.5<=r['secs']<=8.5 and abs(r['L'][1]-25)<.15 and r['top'] and r['cp']=='the foot of the wrecker’s tower' and r['cam']>24),
 ("hisFather", "(()=>{ let opened=null; G.on('talk:open',e=>opened=e&&e.who); T.run(5); const s=G.talk.state&&G.talk.state(); return {opened,name:s&&s.name,knox:G.northCave.debug.knox.visible,boots:T.said(/green lamp, coming down/)}; })()",
   lambda r: r['opened']=='Knox' and r['knox'] and r['boots']),
 ("theTalk", "(()=>{ const out=[]; let first=null, home=false;"
   " for(let i=0;i<80&&G.talk.isOpen;i++){ const s=G.talk.state(); if(s.line&&out[out.length-1]!==s.line)out.push(s.line);"
   "   if(s.choices.length){ if(!first)first=s.choices.slice(); let k=s.choices.findIndex(c=>/put me on the rocks/.test(c)); if(k<0||out.some(l=>/didn’t know it was you/.test(l)))k=s.choices.findIndex(c=>/Come home/.test(c)); if(k<0)k=s.choices.length-1; if(/Come home/.test(s.choices[k]))home=true; G.talk.choose(k); }"
   "   else G.talk.advance(); G.step(1/30,2); }"
   " T.play(); return {first,rowan:out.includes('Da.'),rocks:out.some(l=>/didn’t know it was you/.test(l)),name:out.some(l=>/learns your name/.test(l)),home,open:G.talk.isOpen,met:G.northCave.state.met}; })()",
   lambda r: r['first'] and len(r['first'])==3 and r['rowan'] and r['rocks'] and r['name'] and r['home'] and not r['open'] and r['met']),
 ("heGoesUp", "(()=>{ T.run(5); T.calm(); return {knox:G.northCave.debug.knox.visible,trap:T.said(/bar drops across it/),after:T.said(/feeding that fire/),step:G.quest.step,ctl:G.player.inputEnabled}; })()",
   lambda r: not r['knox'] and r['trap'] and r['after'] and r['step']=='north:met' and r['ctl']),
 ("trapdoor", "(()=>{ const C=G.northCave.debug, ta=-Math.PI/2+21*.36, w=C.toWorld(C.SHAFT.x+Math.cos(ta)*2.6,C.TOP,C.SHAFT.z+Math.sin(ta)*2.6); const r=T.walk(w.x,w.z); const lab=T.use(/trapdoor/); G.step(1/30,4); return {r,lab,barred:T.said(/Barred from above/)}; })()",
   lambda r: r['lab']=='The trapdoor' and r['barred']),
 ("downAndOut", "(()=>{ T.calm(); const C=G.northCave.debug; T.route([[0,-46.8]]); const lab=T.use(/hoist down/); const L0=T.L(); let t=0; while(G.northCave.state.plat>1.05&&t<400){ G.step(1/30,1); t++; } G.step(1/30,6);"
   " const r=T.route([[0,-41],[0,-27],[0,-12],[0,0]]); const lab2=T.use(/Leave the cave/); T.run(2); T.calm(); const P=G.player, M=G.northCave.mouth;"
   " return {lab,L0,r,lab2,inside:G.northCave.inside,interior:G.interior,d:+Math.hypot(P.pos.x-M.x,P.pos.z-M.z).toFixed(1),cp:G.state.checkpointName,isle:G.scene.getObjectByName('northTerrain').visible,cam:G.camera.far}; })()",
   lambda r: r['lab']=='Let the hoist down' and all(o=='ok' for o in r['r']) and r['lab2']=='Leave the cave' and not r['inside'] and r['interior'] is None and r['d']<1.5 and r['cp']=='the north island' and r['isle'] and r['cam']>1000),
 ("save", "(()=>{ T.calm(); G.flow.writeSave(); return !!localStorage.getItem(G.flow.keys.save); })()", lambda r: r),
]
AFTER=[
 ("restored", "(()=>{ G.step(1/30,10); const S=G.northCave.state; return {drained:S.drained,met:S.met,ledger:!!S.read.ledger,top:S.hoistTop,entered:S.entered,at:G.northIsle.at,inside:G.northIsle.inside}; })()",
   lambda r: r['drained'] and r['met'] and r['ledger'] and not r['top'] and r['entered'] and r['at']=='north' and r['inside']),
 ("backInDrained", "(()=>{ G.northCave.enter({instant:true}); G.step(1/30,10); T.calm(); const r=T.route([[0,-12],[0,-27],[0,-41]]); return {r,inside:G.northCave.inside}; })()",
   lambda r: r['inside'] and all(o=='ok' for o in r['r'])),
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
    await pg.evaluate("document.getElementById('continue').click(); G.step(1/30,60); 0"); await pg.evaluate(LIB)
    await run(pg,AFTER,fails)
    print('ok  ' if not errs else 'FAIL','noPageErrors :',errs[:3])
    if errs: fails.append('noPageErrors')
    print('RESULT:', 'PASSED' if not fails else 'FAILED '+', '.join(fails))
    await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())

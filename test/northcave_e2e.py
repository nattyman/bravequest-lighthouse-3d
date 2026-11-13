"""The wreckers' stair (northcave.js): the sea cave into the wrecker's tower, and the first meeting with Rowan's father.
- after the barred door, the objective points to the cave; the shore shelf from the cove to the mouth is walkable;
- at high tide the cave won't let you in; at low tide it does (fade, interior, no fog, the north light and the island hidden);
- the landing, the way to the store, the ledger (a reading card, then "That's my father's hand"), the carved boat;
- the low passage stops you at the water's edge until the sluice wheel drains it (~4.6 s);
- the hoist carries you up to the foot of the tower (a checkpoint); his father comes down; the talk card (Tobias Knox) with its
  branches; then he goes back up and bars the trapdoor; the objective says the next chapter starts there;
- the trapdoor isn't in reach from the floor under it, only from the top of the stair;
- back down and out of the cave: the island again, its checkpoint back; it all survives a save and reload;
- the stair (from the "trapdoor, burned open" start point), through the real controller: walk up it from the floor ring to the
  top tread (past where it winds over its own lower flight) without falling, "Climb into the fire room" there and not from the
  floor under the trapdoor, and back down. Screenshots of the climb in $SHOTS (default /tmp/claude-0/northcave-stair).
usage: python3 test/northcave_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
SHOTS=os.environ.get('SHOTS','/tmp/claude-0/northcave-stair'); os.makedirs(SHOTS,exist_ok=True)

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
  /* the real controller: the virtual stick (8-way keys relative to the camera, dithered so the mean heading is analog) */
  keys(set){ for(const k of ['forward','back','left','right','sprint'])G.input.setVirtual(k,set.has(k)); },
  release(){ T.keys(new Set()); },
  steer(x,z){ const P=G.player, dx=x-P.pos.x, dz=z-P.pos.z, d=Math.hypot(dx,dz); if(d<1e-3){ T.release(); return d; }
    const yaw=P.camYaw, fx=Math.sin(yaw), fz=Math.cos(yaw), my=(dx*fx+dz*fz)/d, mx=(dx*-fz+dz*fx)/d, s=new Set();
    const a=Math.atan2(mx,my)/(Math.PI/4), lo=Math.floor(a), fr=a-lo; T._pwm=(T._pwm||0)+fr; let k=lo; if(T._pwm>=1){ T._pwm-=1; k=lo+1; }
    k=((k%8)+8)%8; for(const n of [['forward'],['forward','right'],['right'],['back','right'],['back'],['back','left'],['left'],['forward','left']][k])s.add(n);
    T.keys(s); return d; },
  // where Rowan is on the stair (tread index, continuous); on the floor ring, the same measure carried on back past the first tread
  sNow(){ const C=G.northCave.debug, l=T.L(), s=C.stairS(l[0],l[2],l[1]+.05); if(s!=null)return s;
    const a=Math.atan2(l[2]-C.SHAFT.z,l[0]-C.SHAFT.x), s0=(((a-C.ST.a0)%(2*Math.PI))+2*Math.PI)%(2*Math.PI)/C.ST.da; return s0>C.ST.wrap/2?s0-C.ST.wrap:s0; },
  // walk the stair with the stick, a carrot a tread ahead along it, until Rowan is at tread `to`; what happened on the way
  stair(to,o){ o=o||{}; const C=G.northCave.debug, P=G.player, up=to>T.sNow(), r=o.r||2.5, hp0=P.hp; let n=0, air=0, maxDrop=0, prevY=T.L()[1], hi=-1e9, lo=1e9, worst=0;
    for(;n<(o.max||1500);n++){ const s=T.sNow(); if(up?s>=to:s<=to)break;
      const c=C.stairPt(Math.min(C.ST.last+.2,s+(up?1:-1)),r), w=C.toWorld(C.SHAFT.x+c.x,0,C.SHAFT.z+c.z); T.steer(w.x,w.z); G.step(1/30,1);
      const y=T.L()[1]; if(!P.grounded)air++; if(prevY-y>maxDrop)maxDrop=prevY-y; prevY=y; hi=Math.max(hi,y); lo=Math.min(lo,y); if(up)worst=Math.max(worst,hi-y); }
    T.release(); G.step(1/30,6); const s=T.sNow();
    return {s:+s.toFixed(2),L:T.L(),secs:+(n/30).toFixed(1),air,maxDrop:+maxDrop.toFixed(2),back:+worst.toFixed(2),hi:+hi.toFixed(2),lo:+lo.toFixed(2),hurt:hp0-P.hp,grounded:P.grounded}; },
  label(){ G.step(1/30,1); const c=G.interact.pick(G.player.pos); return c?G.interact.label(c):null; },
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
 ("trapdoor", "(()=>{ const C=G.northCave.debug, p=C.stairPt(C.ST.last,1.95), w=C.toWorld(C.SHAFT.x+p.x,C.TOP,C.SHAFT.z+p.z); const r=T.walk(w.x,w.z); const ground=T.use(/trapdoor/), L0=T.L();"
   " const t=G.northCave.trapPos(); G.player.teleport(t.x,t.y,t.z,0); G.step(1/30,4); const L1=T.L(); const lab=T.use(/trapdoor/); G.step(1/30,4); const barred=T.said(/Barred from above/), down=T.stair(-1.2); return {r,ground,L0,L1,lab,barred,down}; })()",
   lambda r: r['r']=='ok' and r['ground'].startswith('NOPE') and abs(r['L0'][1]-25)<.1 and r['L1'][1]>31 and r['lab']=='The trapdoor' and r['barred'] and abs(r['down']['L'][1]-25)<.05 and r['down']['hurt']==0),
 ("downAndOut", "(()=>{ T.calm(); const C=G.northCave.debug; T.route([[0,-46.8]]); const lab=T.use(/hoist down/); const L0=T.L(); let t=0; while(G.northCave.state.plat>1.05&&t<400){ G.step(1/30,1); t++; } G.step(1/30,6);"
   " const r=T.route([[0,-41],[0,-27],[0,-12],[0,0]]); const lab2=T.use(/Leave the cave/); T.run(2); T.calm(); const P=G.player, M=G.northCave.mouth;"
   " return {lab,L0,r,lab2,inside:G.northCave.inside,interior:G.interior,d:+Math.hypot(P.pos.x-M.x,P.pos.z-M.z).toFixed(1),cp:G.state.checkpointName,isle:G.scene.getObjectByName('northTerrain').visible,cam:G.camera.far}; })()",
   lambda r: r['lab']=='Let the hoist down' and all(o=='ok' for o in r['r']) and r['lab2']=='Leave the cave' and not r['inside'] and r['interior'] is None and r['d']<1.5 and r['cp']=='the north island' and r['isle'] and r['cam']>1000),
 ("save", "(()=>{ T.calm(); G.flow.writeSave(); return !!localStorage.getItem(G.flow.keys.save); })()", lambda r: r),
]
STAIR=[
 ("start: the trapdoor burned open", "(()=>{ G.devtools.start('north-trap'); T.run(1); T.calm(); const S=G.northCave.state; return {inside:G.northCave.inside,open:S.open,top:S.hoistTop,L:T.L()}; })()",
   lambda r: r['inside'] and r['open'] and r['top'] and abs(r['L'][1]-25)<.1),
 ("at the foot of the stair", "(()=>{ const C=G.northCave.debug, p=C.stairPt(-1.6,2.5), w=C.toWorld(C.SHAFT.x+p.x,C.TOP,C.SHAFT.z+p.z); G.player.teleport(w.x,w.y,w.z,-p.a); G.player.aimCamera&&G.player.aimCamera(-p.a,.3); G.step(1/30,10);"
   " return {L:T.L(),s:+T.sNow().toFixed(2),lab:T.label()}; })()",
   lambda r: abs(r['L'][1]-25)<.05 and r['s']<-1 and r['lab']!='Climb into the fire room'),
 ("up the first flight (input)", "T.stair(9)",
   lambda r: r['s']>=9 and r['L'][1]>27.5 and r['maxDrop']<.2 and r['back']<.3 and r['air']<4 and r['hurt']==0 and r['grounded']),
 ("shot:stair-partway", "0", None),
 ("over the lower flight to the top (input)", "(()=>{ const r=T.stair(20.9); r.lab=T.label(); return r; })()",
   lambda r: r['s']>=20.9 and r['L'][1]>31.4 and r['maxDrop']<.2 and r['back']<.3 and r['air']<4 and r['hurt']==0 and r['grounded'] and r['lab']=='Climb into the fire room'),
 ("shot:stair-top", "0", None),
 ("no further than the top tread", "(()=>{ const C=G.northCave.debug, p=C.stairPt(C.ST.last+2.5,2.5), w=C.toWorld(C.SHAFT.x+p.x,0,C.SHAFT.z+p.z), y0=T.L()[1]; for(let i=0;i<60;i++){ T.steer(w.x,w.z); G.step(1/30,1); } T.release(); G.step(1/30,6);"
   " return {s:+T.sNow().toFixed(2),L:T.L(),y0,lab:T.label(),grounded:G.player.grounded}; })()",
   lambda r: r['s']<=21.35 and abs(r['L'][1]-r['y0'])<.05 and r['grounded'] and r['lab']=='Climb into the fire room'),
 ("no stepping off the open side", "(()=>{ const C=G.northCave.debug, p=C.stairPt(C.ST.last,0), w=C.toWorld(C.SHAFT.x+p.x,0,C.SHAFT.z+p.z), y0=T.L()[1]; for(let i=0;i<45;i++){ T.steer(w.x,w.z); G.step(1/30,1); } T.release(); G.step(1/30,6);"
   " const l=T.L(); return {r:+Math.hypot(l[0]-C.SHAFT.x,l[2]-C.SHAFT.z).toFixed(2),L:l,y0,grounded:G.player.grounded}; })()",
   lambda r: r['r']>=2.15 and abs(r['L'][1]-r['y0'])<.4 and r['grounded']),
 ("back down (input)", "(()=>{ const r=T.stair(-1.2); r.lab=T.label(); return r; })()",
   lambda r: r['s']<=-1.2 and abs(r['L'][1]-25)<.05 and r['air']<4 and r['hurt']==0 and r['grounded'] and r['lab']!='Climb into the fire room'),
 ("not from the floor under the trapdoor", "(()=>{ const C=G.northCave.debug, p=C.stairPt(C.ST.last,1.95), w=C.toWorld(C.SHAFT.x+p.x,0,C.SHAFT.z+p.z); let n=0; while(n<300&&T.steer(w.x,w.z)>.3){ G.step(1/30,1); n++; } T.release(); G.step(1/30,6);"
   " const l=T.L(), d=Math.hypot(l[0]-C.SHAFT.x-p.x,l[2]-C.SHAFT.z-p.z); return {d:+d.toFixed(2),L:l,lab:T.label()}; })()",
   lambda r: r['d']<.6 and abs(r['L'][1]-25)<.05 and r['lab']!='Climb into the fire room' and r['lab']!='The trapdoor'),
 ("up again and through", "(()=>{ const C=G.northCave.debug, p=C.stairPt(-1.2,2.5), w=C.toWorld(C.SHAFT.x+p.x,0,C.SHAFT.z+p.z); let n=0; while(n<300&&T.steer(w.x,w.z)>.4){ G.step(1/30,1); n++; } const r=T.stair(20.9);"
   " r.lab=T.use(/fire room/); T.run(2.4); r.fire=!!(G.northFire&&G.northFire.inside); return r; })()",
   lambda r: r['s']>=20.9 and r['lab']=='Climb into the fire room' and r['fire']),
]
AFTER=[
 ("restored", "(()=>{ G.step(1/30,10); const S=G.northCave.state; return {drained:S.drained,met:S.met,ledger:!!S.read.ledger,top:S.hoistTop,entered:S.entered,at:G.northIsle.at,inside:G.northIsle.inside}; })()",
   lambda r: r['drained'] and r['met'] and r['ledger'] and not r['top'] and r['entered'] and r['at']=='north' and r['inside']),
 ("backInDrained", "(()=>{ G.northCave.enter({instant:true}); G.step(1/30,10); T.calm(); const r=T.route([[0,-12],[0,-27],[0,-41]]); return {r,inside:G.northCave.inside}; })()",
   lambda r: r['inside'] and all(o=='ok' for o in r['r'])),
]

async def run(pg,steps,fails):
  for name,js,ok in steps:
    if name.startswith('shot:'):
      await pg.evaluate('G.headless&&G.headless.draw(3); 0'); await pg.wait_for_timeout(400)
      path=f'{SHOTS}/{name[5:]}.png'; await pg.screenshot(path=path,timeout=120000); print('shot',name[5:],path); continue
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
    await run(pg,STAIR,fails)
    print('ok  ' if not errs else 'FAIL','noPageErrors :',errs[:3])
    if errs: fails.append('noPageErrors')
    print('RESULT:', 'PASSED' if not fails else 'FAILED '+', '.join(fails))
    await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())

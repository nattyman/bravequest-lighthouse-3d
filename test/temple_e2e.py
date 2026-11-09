"""The Vigil (TEMPLE.md) — shared e2e. Each agent owns one section of SECTIONS (Place, Boss, Shared).
usage: python3 test/temple_e2e.py [url] [--only place,boss,shared]
       (default http://localhost:8800/dev.html?debug&headless)
Screenshots go to /tmp/claude-0/temple-<section>/."""
import asyncio, sys, json, time, os
from playwright.async_api import async_playwright
ARGS=[a for a in sys.argv[1:] if not a.startswith('--')]
URL=ARGS[0] if ARGS else 'http://localhost:8800/dev.html?debug&headless'
ONLY=None; FROM=None
for i,a in enumerate(sys.argv[1:]):
    if a.startswith('--only'): ONLY=set((a.split('=',1)[1] if '=' in a else sys.argv[i+2]).split(','))
    if a.startswith('--from='): FROM=a.split('=',1)[1]

# helpers installed in the page once per load (shared; add yours under T.<section>)
HELP="""
window.T={
  play(){ if(G.state.mode==='paused'&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); if(G.state.mode!=='play'&&G.state.mode!=='dead')G.setMode('play'); },
  settle(n){ T.play(); G.step(1/30,n||10); if(G.progress&&G.progress.endReward)G.progress.endReward(); G.step(1/30,2); T.play(); },
  hold(){ const P=G.player; P.hp=P.maxHp; },
  calm(){ for(let i=0;i<10&&G.talk&&G.talk.isOpen;i++)G.talk.advance(); for(let i=0;i<14;i++)G.ui.advance&&G.ui.advance(); T.play(); },
  clear(r){ for(const m of G.monsters.list.slice())if(m.alive&&!m.dying&&!m.boss&&m.pos.distanceTo(G.player.pos)<(r||40))G.monsters.kill(m,{dir:new THREE.Vector3(0,0,1)}); },
};
'ok'"""

# ============================================================== PLACE (Place agent): the door in the wood, enter/exit, braziers, the Lens (tap still
#   toggles the shutter, hold focuses), seals, mirrors + the sun-disc, the Glass walk + the winch, the well's seals and the
#   swarm, checkpoints + the stranded fallback, persistence and Continue inside, the waystone, the island shortcuts, draw calls
PLACE_HELP="""
T.place={
  O:()=>G.temple.origin,
  L:()=>{ const o=G.temple.origin, p=G.player.pos; return [+(p.x-o.x).toFixed(2),+(p.y-o.y).toFixed(2),+(p.z-o.z).toFixed(2)]; },
  at(x,y,z,yaw){ const o=G.temple.origin; G.player.teleport(o.x+x,o.y+y,o.z+z,yaw==null?0:yaw); G.step(1/30,4); },
  walk(n,dir){ G.input.setVirtual(dir||'forward',true); G.step(1/30,n); G.input.setVirtual(dir||'forward',false); G.step(1/30,2); },
  use(re){ T.play(); G.step(1/30,2); const c=G.interact.pick(G.player.pos), lab=c&&G.interact.label(c); if(!c||(re&&!re.test(lab)))return 'NOPE:'+lab; c.use(); G.step(1/30,2); return lab; },
  glass(on,n){ G.input.setVirtual('glass',!!on); G.step(1/30,n||15); return G.glass.raised; },
  trans(){ for(let i=0;i<80&&G.temple._debug.S.trans;i++)G.step(1/30,1); G.step(1/30,4); },
  key(code,down){ window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true})); },
  swarm(n){ G.devtools.giveSwarm(n||40); const P=G.player.pos; let k=0; for(const m of G.creatures.moths)if(m.tgt==='lantern'){ m.p.set(P.x+(Math.random()-.5)*2,P.y+1.3,P.z+(Math.random()-.5)*2); m.v.set(0,0,0); k++; } return k; },
  count(){ let n=0; for(const m of G.creatures.moths)if(m.tgt==='lantern'||m.tgt==='hunt')n++; return n; },
  beam(target,n){ G.lens.aimAt(target); G.lens.focus(true); G.step(1/30,n||50); const b=G.lens.beam, h=b.hit; const r={bounces:b.bounces,kind:h&&h.kind,id:h&&h.object&&h.object.id,len:+b.length.toFixed(2),segs:b.segments.length}; G.lens.focus(false); G.lens.aimAt(null); G.step(1/30,2); return r; },
};
'ok'"""
PLACE=[
 # the temple is shut until Wren is saved; then the door's ink roots wait for a swarm, which eats them
 ("place:door", "(()=>{ document.getElementById('begin')&&document.getElementById('begin').click(); G.step(1/30,10); if(!(G.loop&&G.loop.active))G.debugStartLoop(); G.step(1/30,10); T.calm();"
   " const before=G.temple.unlocked; let unl=null, op=null; G.on('temple:unlock',e=>unl=e); G.on('temple:open',e=>op=e); G.emit('undercroft:saved',{who:'wren'}); G.step(1/30,2);"
   " const d=G.temple.door; G.player.teleport(d.x,null,d.z,-Math.PI/2); G.step(1/30,6); T.clear(60); const n0=T.place.swarm(30); T.hold();"
   " let t=0; while(!G.temple.open&&t<900){ G.step(1/30,10); t+=10; if(t%60==0){ T.place.swarm(30); T.hold(); T.clear(60); G.player.teleport(d.x,null,d.z,-Math.PI/2); } } G.step(1/30,90);"
   " const c=G.interact.pick(G.player.pos); return {before,unlocked:G.temple.unlocked,unl:!!unl,n0,open:G.temple.open,op:!!op,secs:+(t/30).toFixed(1),lab:c&&G.interact.label(c),wp:G.map.waypoints.find(w=>w.id==='temple')}; })()",
   lambda r: r['before'] is False and r['unlocked'] and r['unl'] and r['open'] and r['op'] and r['lab']=='Go down into the Vigil' and r['wp'] and not r['wp']['unlocked']),
 ("place:enter", "(()=>{ T.place.use(/Go down/); T.place.trans(); return {inside:G.temple.inside,room:G.temple.room(G.player.pos),L:T.place.L(),dark:G.atmo.darkTarget,fog:G.fog.depth(G.player.pos),"
   " cp:G.state.checkpointName,wp:G.map.waypoints.find(w=>w.id==='temple').unlocked,interior:G.interior&&G.interior.id,swarm:T.place.count()}; })()",
   lambda r: r['inside'] and r['room']=='vestibule' and r['dark']==1 and r['fog']==0 and r['cp']=='the stair of watchers' and r['wp'] and r['interior']=='temple'),
 # braziers: the first is free; then 5 ether each (no vials: refused); a lit room stays lit
 ("place:braziers", "(()=>{ const B=G.temple.braziers, b0=B.find(c=>c.id==='vestibule:0'); G.player.teleport(b0.stand.x+1.2,null,b0.stand.z,-Math.PI/2); G.step(1/30,4); const l1=T.place.use(/brazier/);"
   " const lit1=G.temple.isLit('vestibule'); G.inv.take('vial',G.inv.count('vial')); G.alchemy.etherUnits=0; const b1=B.find(c=>c.id==='nave:0'); G.player.teleport(b1.stand.x+1.2,null,b1.stand.z,-Math.PI/2); G.step(1/30,4); const l2=T.place.use(/brazier/); const lit2=G.temple.isLit('nave');"
   " G.inv.add('vial',1,{silent:true}); G.alchemy.etherUnits=12; G.step(1/30,2); const l3=T.place.use(/brazier/); G.step(1/30,10);"
   " return {l1,lit1,l2,lit2,l3,lit3:G.temple.isLit('nave'),ether:G.alchemy.etherUnits,dark:G.atmo.darkTarget,room:G.temple.room(G.player.pos)}; })()",
   lambda r: r['lit1'] and r['l1']=='Light the brazier' and not r['lit2'] and 'needs 5 ether' in r['l2'] and r['lit3'] and r['ether']==7 and r['dark']<1),
 # Act 1 / no Lens: the shutter toggles the moment F goes down, exactly as before
 ("place:shutterBefore", "(()=>{ T.calm(); const L=G.items.lantern; const was=L.cured; L.cured=false; L.shut=false; G.step(1/30,2); T.place.key('KeyF',true); G.step(1/30,1); const a=L.shut; T.place.key('KeyF',false); G.step(1/30,2);"
   " T.place.key('KeyF',true); G.step(1/30,1); const b=L.shut; T.place.key('KeyF',false); G.step(1/30,2); L.cured=was; G.step(1/30,2); return {a,b,owned:G.lens.owned}; })()",
   lambda r: r['a'] is True and r['b'] is False and r['owned'] is False),
 # the Lens on the reliquary altar: a reward moment
 ("place:lens", "(()=>{ G.temple.lightBrazier('reliquary'); const a=G.temple.rooms.reliquary.anchors.altar; G.player.teleport(a.x+1.4,a.y,a.z,-Math.PI/2); G.step(1/30,6); T.clear(30); let ev=null; G.on('lens:found',e=>ev=e);"
   " const lab=T.place.use(/Vigil Lens/); const owned=G.lens.owned; const rw=!!(G.progress&&G.progress.debug&&true); T.settle(130); T.calm();"
   " const L=G.items.lantern; return {lab,owned,ev:!!ev,onLantern:!!(G.lens._debug&&G.lens._debug.VIS.onLantern),shut:L.shut,cured:L.cured}; })()",
   lambda r: r['lab']=='Take the Vigil Lens' and r['owned'] and r['ev'] and r['onLantern']),
 # with the Lens: a tap still shuts (sent on release, the shutter never closes mid-hold); shut, a press opens at once
 ("place:shutterTap", "(()=>{ const L=G.items.lantern; L.shut=false; G.step(1/30,2); T.place.key('KeyF',true); G.step(1/30,3); const mid=L.shut, foc=G.lens.focused; T.place.key('KeyF',false); G.step(1/30,2); const tap=L.shut;"
   " T.place.key('KeyF',true); G.step(1/30,1); const open=L.shut; T.place.key('KeyF',false); G.step(1/30,2); return {mid,foc,tap,open,after:L.shut}; })()",
   lambda r: r['mid'] is False and r['foc'] is False and r['tap'] is True and r['open'] is False and r['after'] is False),
 # hold: after ~.3 s the beam focuses (the shutter stays open); let go and it opens again
 ("place:shutterHold", "(()=>{ const L=G.items.lantern; L.shut=false; let fo=[]; const off=G.on('lens:focus',e=>fo.push(e.on)); G.step(1/30,2); T.place.key('KeyF',true); G.step(1/30,6); const early=G.lens.focused;"
   " G.step(1/30,10); const on=G.lens.focused, shut=L.shut, len=+G.lens.beam.length.toFixed(2), segs=G.lens.beam.segments.length; T.place.key('KeyF',false); G.step(1/30,3);"
   " return {early,on,shut,len,segs,off:G.lens.focused,after:L.shut,fo}; })()",
   lambda r: r['early'] is False and r['on'] and r['shut'] is False and r['segs']>=1 and 0<r['len']<=14.5 and r['off'] is False and r['after'] is False and r['fo'][:2]==[True,False]),
 # the first burn: the recess's roots (~1.2 s of beam), the offering behind
 ("place:recess", "(()=>{ const s=G.templePuzzles.lensSeals.recess; const a=G.temple.rooms.reliquary.anchors.recess; G.player.teleport(a.x,a.y,a.z+4,Math.PI); G.step(1/30,4); let ev=null; G.on('lens:burn',e=>{ if(e.id==='seal:recess')ev=e; });"
   " const r=T.place.beam(s.b.pos,50); G.step(1/30,4); G.player.teleport(a.x,a.y,a.z+1.4,Math.PI); G.step(1/30,30); const v0=G.inv.count('vial'); const lab=T.place.use(/offering/); G.step(1/30,4);"
   " return {r,ev:!!ev,open:G.templePuzzles.state.seals.recess,lab,vials:G.inv.count('vial')-v0,L:T.place.L()}; })()",
   lambda r: r['ev'] and r['open'] and r['lab']=='Take the old offering' and r['vials']==1),
 # the nave: the cloister door's roots burn too (straight on)
 ("place:cloisterDoor", "(()=>{ const s=G.templePuzzles.lensSeals.cloisterDoor; T.place.at(3,-3,-44,Math.PI/2); T.clear(30); const before=G.temple.gate('cloisterDoor'); T.place.walk(40); const blocked=T.place.L();"
   " T.place.at(3,-3,-44,Math.PI/2); const r=T.place.beam(s.b.pos,40); T.place.walk(70); return {before,blocked,r,gate:G.temple.gate('cloisterDoor'),L:T.place.L(),room:G.temple.room(G.player.pos)}; })()",
   lambda r: r['before'] is False and r['blocked'][0]<8.2 and r['gate'] and r['L'][0]>9 and r['room']=='cloister'),
 # the Drowned Cloister: no way across without the Glass; with it the old walk carries you; lowered mid-way, you're eased back
 ("place:glassWalk", "(()=>{ T.clear(40); T.place.at(15.6,-6,-54.4,Math.PI/2); T.place.walk(45); const noGlass=T.place.L(); G.glass.give({silent:true}); T.place.at(15.6,-6,-54.4,Math.PI/2); T.place.glass(true); T.place.walk(60); const mid=T.place.L();"
   " let push=null; G.on('temple:pastPush',e=>push=e); T.place.glass(false,40); const back=T.place.L(), ctl=G.player.inputEnabled; T.place.at(15.6,-6,-54.4,Math.PI/2); T.place.glass(true); T.place.walk(120); const leg1=T.place.L();"
   " T.place.at(32.4,-6,-54.4,0); G.step(1/30,4); T.place.walk(100); const leg2=T.place.L(); G.player.teleport(G.player.pos.x,G.player.pos.y,G.player.pos.z,Math.PI/2); G.step(1/30,2); T.place.walk(70); const end=T.place.L(); T.place.glass(false,20); G.step(1/30,20);"
   " return {noGlass,mid,push:!!push,back,ctl,leg1,leg2,end,after:T.place.L(),room:G.temple.room(G.player.pos)}; })()",
   lambda r: r['noGlass'][0]<17.3 and r['mid'][0]>18 and abs(r['mid'][1]+6)<.2 and r['push'] and r['back'][0]<17.3 and r['ctl'] and r['leg1'][0]>20 and abs(r['leg1'][1]+6)<.2 and -48.4<r['leg2'][2]<-43.6 and r['end'][0]>34 and abs(r['after'][1]+6)<.2 and r['after'][0]>33),
 # the winch over there hoists the east mirror back onto its pier
 ("place:winch", "(()=>{ const w=G.temple.rooms.cloister.anchors.winch; G.player.teleport(w.x-1.4,w.y,w.z,Math.PI/2); G.step(1/30,4); let ev=null; G.on('temple:puzzle',e=>{ if(e.id==='winch')ev=e; }); const lab=T.place.use(/Wind the chain/); G.step(1/30,100); return {lab,ev:!!ev,winch:G.templePuzzles.state.winch,ctl:G.player.inputEnabled}; })()",
   lambda r: r['lab']=='Wind the chain' and r['ev'] and r['winch'] and r['ctl']),
 # the sun-disc: the lantern's own light is refused; the beam carried M1 -> M2 lands square and the south door sinks
 ("place:mirrors", "(()=>{ T.calm(); const N=G.temple.rooms.nave.anchors, P=G.templePuzzles; const pl=N.plinth; G.player.teleport(pl.x,pl.y,pl.z,Math.PI); G.step(1/30,4); T.clear(40);"
   " const direct=T.place.beam(N.disc,40); const s0=P.state.disc; const labs=[]; G.player.teleport(N.cranks[0].x,N.cranks[0].y,N.cranks[0].z+.5,Math.PI); G.step(1/30,4); while(P.state.mirrors.M1!==2){ labs.push(T.place.use(/Turn the mirror/)); }"
   " G.player.teleport(N.cranks[1].x,N.cranks[1].y,N.cranks[1].z+.5,Math.PI); G.step(1/30,4); while(P.state.mirrors.M2!==1){ labs.push(T.place.use(/Turn the mirror/)); }"
   " G.player.teleport(pl.x,pl.y,pl.z,Math.PI); G.step(1/30,30); const r=T.place.beam(N.mirrors[0],60); G.step(1/30,90); T.calm();"
   " T.place.at(0,-3,-48,Math.PI); T.place.walk(80); return {direct,s0,labs,r,disc:P.state.disc,gate:G.temple.gate('sunDoor'),L:T.place.L(),room:G.temple.room(G.player.pos)}; })()",
   lambda r: r['direct']['bounces']==0 and r['s0'] is False and r['r']['bounces']==2 and r['disc'] and r['gate'] and r['L'][2]<-55 and r['room']=='well'),
 # the watchers' eyes: M1 -> the eyes opens the niche behind them (an old hand's inscription)
 ("place:eyes", "(()=>{ const N=G.temple.rooms.nave.anchors, P=G.templePuzzles; G.player.teleport(N.cranks[0].x,N.cranks[0].y,N.cranks[0].z+.5,Math.PI); G.step(1/30,4); while(P.state.mirrors.M1!==1)T.place.use(/Turn the mirror/);"
   " G.player.teleport(N.plinth.x,N.plinth.y,N.plinth.z,Math.PI); G.step(1/30,4); const r=T.place.beam(N.mirrors[0],60); G.step(1/30,60); T.calm(); const e=N.eyesNiche; G.player.teleport(e.x,e.y,e.z-1.2,0); G.step(1/30,6);"
   " const lab=T.place.use(/carving/); G.step(1/30,4); let k=0; while(G.talk&&G.talk.isOpen&&k<8){ G.talk.advance(); k++; } T.calm(); return {r,eyes:P.state.eyes,gate:G.temple.gate('eyes'),lab,read:G.temple.pagesRead()}; })()",
   lambda r: r['r']['bounces']==1 and r['eyes'] and r['gate'] and r['lab'] and 'i2' in r['read']),
 # the Moth Well: exactly `needs` moths split off to eat a seal, and are spent; the rest stay with you
 ("place:wellSeal", "(()=>{ T.calm(); const W=G.temple.rooms.well.anchors; G.temple.lightBrazier('well'); T.place.at(0,-4,-60.6,Math.PI); T.clear(60); const s=G.templePuzzles.well.seals.wellUpper; const sp=s.pos;"
   " const D=G.temple._debug, a=(D.UPPER_A-12)*Math.PI/180, r=8.5; G.player.teleport(D.WC.x+G.temple.origin.x+Math.cos(a)*r,G.temple.origin.y+D.rampY(D.UPPER_A-12),G.temple.origin.z+D.WC.z+Math.sin(a)*r,0); G.step(1/30,4);"
   " const n0=T.place.swarm(40); T.hold(); let fed=null, op=null; G.on('temple:wellSeal',e=>{ if(e.id==='wellUpper'&&e.state==='feed')fed=e; if(e.id==='wellUpper'&&e.state==='open')op=e; }); let t=0; while(!G.temple.gate('wellUpper')&&t<600){ G.step(1/30,10); t+=10; T.hold(); T.clear(30); }"
   " G.step(1/30,30); const n1=T.place.count(); return {n0,fed:fed&&fed.n,open:G.temple.gate('wellUpper'),secs:+(t/30).toFixed(1),n1,needs:s.needs,spent:op&&op.spent}; })()",
   lambda r: r['fed']==r['needs'] and r['open'] and r['spent']==r['needs'] and r['n1']>=r['n0']-r['needs']-4),
 # the roost on the shaft wall refills (cave-born moths) so the well can't run dry
 ("place:roost", "(()=>{ let n0=0; for(const m of G.creatures.moths)if(m.tgt==='roost')n0++; const W=G.temple.rooms.well.anchors; G.player.teleport(W.rim.x,W.rim.y,W.rim.z,Math.PI); G.step(1/30,30*12); let n1=0; for(const m of G.creatures.moths)if(m.tgt==='roost')n1++;"
   " return {n0,n1,pts:G.creatures.roost.pts.length,inWell:G.temple.room(G.player.pos)}; })()",
   lambda r: r['pts']>=30 and r['n1']>=min(r['n0']+1,40)),
 # checkpoints: the deepest place stood in with an open way back; the stranded fallback when there's none
 ("place:checkpoint", "(()=>{ G.temple.setGate('wellLower',true); T.place.at(0,-14,-76.2,Math.PI); G.step(1/30,40); const cp=G.state.checkpointName, reached=G.temple.reached();"
   " G.temple.setGate('wellUpper',false); G.step(1/30,10); const str=G.temple.stranded(), cp2=G.state.checkpointName; const lab=T.place.use(/draught/); T.place.trans();"
   " const room=G.temple.room(G.player.pos); G.temple.setGate('wellUpper',true); G.step(1/30,10); return {cp,reached,str,cp2,lab,room,str2:G.temple.stranded()}; })()",
   lambda r: r['cp']=='the foot of the moth well' and 'wellDeep' in r['reached'] and r['str'] and r['cp2']!=r['cp'] and r['room']=='vestibule' and not r['str2']),
 # persistence: the temple and the Lens are in the save
 ("place:persist", "(()=>{ const snap=G.flow.snapshot(); const t=snap.mods.temple, l=snap.mods.lens; return {keys:G.persist.keys.filter(k=>k==='temple'||k==='lens'),open:t&&t.open,lit:t&&t.lit,gates:t&&t.gates,puz:t&&t.puz&&t.puz.puzzles&&t.puz.puzzles.disc,lens:l&&l.owned}; })()",
   lambda r: len(r['keys'])==2 and r['open'] and 'nave' in r['lit'] and r['gates']['sunDoor'] and r['puz'] and r['lens']),
 # out through the door; the 9th waystone takes you straight back down to the Stair of Watchers
 ("place:exit", "(()=>{ const a=G.temple.rooms.vestibule.anchors.exit; G.player.teleport(a.x,a.y,a.z-.6,0); G.step(1/30,4); const lab=T.place.use(/Climb out/); T.place.trans(); const d=G.temple.door;"
   " return {lab,inside:G.temple.inside,dist:+Math.hypot(G.player.pos.x-d.x,G.player.pos.z-d.z).toFixed(2),cam:G.camera.far,interior:G.interior&&G.interior.id}; })()",
   lambda r: r['lab'] and not r['inside'] and r['dist']<3 and r['cam']>500 and not r['interior']),
 ("place:travel", "(()=>{ const lh=G.world.lighthouse; for(const m of G.creatures.moths)if(m.tgt==='lantern')G.moths.release(m); G.player.teleport(lh.doorOut.x-3,null,lh.doorOut.z,-Math.PI/2); G.step(1/30,6); const why=G.map.travelBlock('temple'); const ok=G.map.travel('temple',{force:true});"
   " for(let i=0;i<120&&G.map.traveling;i++)G.step(1/30,1); G.step(1/30,10); return {why,ok,inside:G.temple.inside,room:G.temple.room(G.player.pos),mode:G.state.mode,blurb:G.map.waypoints.find(w=>w.id==='temple').name}; })()",
   lambda r: r['ok'] and r['inside'] and r['room']=='vestibule' and r['mode']=='play' and r['blurb']=='The Vigil'),
 # and from inside the Vigil to another interior: one interior at a time
 ("place:travelOut", "(()=>{ const ok=G.map.travel('undercroft',{force:true}); for(let i=0;i<120&&G.map.traveling;i++)G.step(1/30,1); G.step(1/30,10); const a={temple:G.temple.inside,uc:G.undercroft.inside,interior:G.interior&&G.interior.id};"
   " G.map.travel('temple',{force:true}); for(let i=0;i<120&&G.map.traveling;i++)G.step(1/30,1); G.step(1/30,10); return {ok,a,b:{temple:G.temple.inside,uc:G.undercroft.inside,interior:G.interior&&G.interior.id},hidden:G.scene.children.find(c=>c.name==='world').children.filter(c=>c.visible&&(c.isMesh||c.isPoints||c.isInstancedMesh)).length}; })()",
   lambda r: r['a']['uc'] and not r['a']['temple'] and r['a']['interior']=='undercroft' and r['b']['temple'] and not r['b']['uc'] and r['b']['interior']=='temple' and r['hidden']==0),
 # after the temple the Lens burns ink-root thickets on the island (shortcuts)
 ("place:shortcuts", "(()=>{ G.map.travel('lighthouse',{force:true}); for(let i=0;i<120&&G.map.traveling;i++)G.step(1/30,1); G.step(1/30,6); const SC=G.templePuzzles.shortcuts; const out=[];"
   " for(const q of SC){ const at=q.s.b.pos; G.player.teleport(at.x+Math.sin(q.d.face)*5,null,at.z+Math.cos(q.d.face)*5,q.d.face+Math.PI); G.step(1/30,4); T.clear(40); const r=T.place.beam(at,50); out.push({id:q.d.id,kind:r.kind,open:!!G.templePuzzles.state.shortcuts[q.d.id]}); }"
   " const q=SC[1]; G.player.teleport(q.foot.x,q.foot.y,q.foot.z,Math.PI/2); G.step(1/30,4); const lab=T.place.use(/Climb the keepers/); for(let i=0;i<45;i++)G.step(1/30,1); const up=[+G.player.pos.x.toFixed(1),+G.player.pos.y.toFixed(1)];"
   " const lab2=T.place.use(/Climb down/); for(let i=0;i<45;i++)G.step(1/30,1); const down=[+G.player.pos.x.toFixed(1),+G.player.pos.y.toFixed(1)]; return {n:SC.length,out,lab,up,lab2,down,ctl:G.player.inputEnabled}; })()",
   lambda r: 2<=r['n']<=3 and all(x['open'] for x in r['out']) and r['lab'] and r['up'][1]>41 and r['lab2'] and r['down'][1]<32 and r['ctl']),
 # performance: the interior's own draw calls, and the past layer's
 ("place:perf", "(()=>{ ['vestibule','nave','reliquary','cloister','well','sanctum'].forEach(r=>G.temple.lightBrazier(r)); G.debugEnterTemple('nave'); G.step(1/30,10); const n=G.temple._debug.stats();"
   " let past=0; G.glass.pastLayer.traverse(o=>{ if((o.isMesh||o.isPoints)&&o.visible)past++; }); let pz=0; G.scene.getObjectByName('templePuzzles').traverse(o=>{ if((o.isMesh||o.isPoints||o.isSprite)&&o.visible)pz++; }); return {interior:n,puzzles:pz,past,stats:G.temple.stats}; })()",
   lambda r: r['interior']+r['puzzles']<=160 and r['past']<=30),
]
PLACE_SHOTS={'place:door':'door-open','place:braziers':'brazier','place:lens':'lens','place:glassWalk':'glass-walk','place:mirrors':'sun-door','place:wellSeal':'well-seal'}

async def _place_continue(pg):
    """save inside the temple, reload the page, Continue: back inside, in the same room, the Lens and the lit rooms kept"""
    await pg.evaluate("(()=>{ G.debugEnterTemple('reliquary'); G.step(1/30,50); G.flow.writeSave(); return 1; })()")
    await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000); await pg.evaluate(HELP); await pg.evaluate(PLACE_HELP)
    await pg.evaluate("document.getElementById('continue').click()"); await pg.wait_for_timeout(1500)
    r=await pg.evaluate("(()=>{ G.step(1/30,20); return {inside:G.temple.inside,room:G.temple.room(G.player.pos),lens:G.lens.owned,lit:G.temple.litRooms,dark:G.atmo.darkTarget,disc:G.templePuzzles.state.disc,gate:G.temple.gate('sunDoor')}; })()")
    ok=r['inside'] and r['room']=='reliquary' and r['lens'] and 'nave' in r['lit'] and r['disc'] and r['gate']
    return r,ok
PLACE_SPECIAL={'PLACE_CONTINUE':_place_continue}
PLACE.insert(PLACE.index(next(s for s in PLACE if s[0]=='place:exit')),("place:continue","PLACE_CONTINUE",None))

# ============================================================== BOSS (Boss agent): Vigilants, the three phases, Hesper's scenes, reward, Hesper at the lighthouse
BOSS_HELP="""'ok'"""
BOSS=[]
BOSS_SHOTS={}
BOSS_SPECIAL={}

# ============================================================== SHARED: save and reload, Continue inside (Place covers it in place:continue)

SECTIONS={'place':(PLACE_HELP,PLACE),'boss':(BOSS_HELP,BOSS)}
SPECIAL={**PLACE_SPECIAL,**BOSS_SPECIAL}
SHOTS={**PLACE_SHOTS,**BOSS_SHOTS}

async def run(pg, name, js, check, fails):
    try: r=await pg.evaluate(js)
    except Exception as e: r='EXC '+str(e).split('\n')[0][:300]
    ok=False
    try: ok=bool(check(r)) if not (isinstance(r,str) and r.startswith('EXC')) else False
    except Exception as e: ok=False
    print(('ok  ' if ok else 'FAIL'), name, ':', json.dumps(r)[:900], flush=True)
    if not ok: fails.append(name)
    return r

async def shot(pg, path):
    os.makedirs(os.path.dirname(path),exist_ok=True)
    await pg.evaluate('G.headless&&G.headless.draw(3); 0'); await pg.wait_for_timeout(300)
    await pg.screenshot(path=path,timeout=120000)

async def main():
    t0=time.time(); fails=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await (await b.new_context(viewport={'width':1000,'height':620})).new_page(); pg.set_default_timeout(300000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and '404' not in m.text else None)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
        await pg.evaluate("localStorage.removeItem('bq-save-v1')")
        await pg.evaluate(HELP)
        first=True
        for sec,(helpjs,steps) in SECTIONS.items():
            if ONLY and sec not in ONLY: continue
            if not steps: continue
            if not first:   # each section starts from a fresh page
                await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
                await pg.evaluate("localStorage.removeItem('bq-save-v1')"); await pg.evaluate(HELP)
            first=False
            await pg.evaluate(helpjs)
            skipping=bool(FROM)
            for name,js,check in steps:
                if skipping and name!=FROM: continue
                skipping=False
                if js in SPECIAL:
                    try: r,ok=await SPECIAL[js](pg)
                    except Exception as e: r,ok='EXC '+str(e)[:300],False
                    print(('ok  ' if ok else 'FAIL'), name, ':', json.dumps(r)[:900], flush=True)
                    if not ok: fails.append(name)
                else: await run(pg,name,js,check,fails)
                if SHOTS.get(name): await shot(pg,f'/tmp/claude-0/temple-{sec}/{SHOTS[name]}.png')
        real=[e for e in errs if '404' not in e]
        for e in real[:10]: print('  ERR',e[:300])
        if real: fails.append('console errors')
        await b.close()
    print(('PASS' if not fails else 'FAIL '+', '.join(fails)), f'{time.time()-t0:.0f}s'); sys.exit(1 if fails else 0)
asyncio.run(main())

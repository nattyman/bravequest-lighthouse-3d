"""The north island fights back (northisle_foes.js + the 'drowned' kind in monsters.js).
- at home nothing of ours exists (no monsters, no heaps), before and after a visit (home draw calls reported both times);
- crabs (brinelings) on the cove beach and the shelf, and on the reef only while the tide is low (they go back under when
  it turns); never on the landing spot, in the boat or on the first 20 m of the path; they come for Rowan when he gets
  close, and the staff kills them;
- the drowned rise among the cairns when Rowan walks up to the graveyard while the lure burns (3–5 of them, out of the
  ground), never in the Margery's corner (they don't step into it either), fight, and die to the staff into heaps of sand
  and weed; when he walks away (> 35 m) the risen ones sink back into the earth, and they rise again when he comes back;
- 'known' stage: they still rise; after north-lived and north-died they never rise (walking right through the graveyard),
  and the island is quiet: no crabs either;
- draw calls on the island with and without them; screenshots of each new thing go to the scratchpad (OUT).
usage: python3 test/northisle_foes_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
OUT=os.environ.get('SHOTS','/tmp/claude-0/northisle_foes')

LIB=r"""
window.T={
  play(){ if(G.state.mode==='paused'&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); if(G.state.mode!=='play'&&G.state.mode!=='dead')G.setMode('play'); },
  calm(){ for(let i=0;i<10&&G.talk&&G.talk.isOpen;i++)G.talk.advance(); for(let i=0;i<14;i++)G.ui.advance&&G.ui.advance(); if(G.cine&&G.cine.on&&G.cine.skip)G.cine.skip(); T.play(); },
  start(id){ G.devtools.start(id); for(let i=0;i<40;i++){ T.calm(); G.step(1/30,1); } T.calm(); },
  run(s){ for(let i=0;i<Math.round(s*30);i++)G.step(1/30,1); },
  at(x,z){ const P=G.player; P.teleport(x,G.floorAt(x,z,G.world.height(x,z)+2),z,P.yaw||0); G.step(1/30,3); },
  F(){ return G.northIsleFoes; }, C(){ return G.northIsleFoes.debug.counts(); },
  /* walk (one step a frame, through G.moveCharacter like every suite's walks) until `until()` or within `stop` m */
  walkTo(x,z,stop,max,until){ const P=G.player; let n=0, blocked=0; for(;n<(max||900);n++){ if(until&&until())break; const dx=x-P.pos.x, dz=z-P.pos.z, d=Math.hypot(dx,dz); if(d<stop)break;
      P.heading=Math.atan2(dx,dz); const r=G.moveCharacter(P.pos,dx/d*.15,dz/d*.15,P.radius,'player'); if(r.blocked)blocked++; P.pos.y=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.7); G.step(1/30,1); } return {n,blocked}; },
  /* fight whatever `pick()` returns with the staff: close in, face it, swing (the real attack input); `refill` tops Rowan up at that hp */
  fight(pick,maxS,refill){ const P=G.player; let hurt=0, refills=0, swings=0, last=P.hp;
    for(let i=0;i<Math.round(maxS*30);i++){ const m=pick(); if(!m)break;
      if(P.hp<last)hurt+=last-P.hp; last=P.hp; if(refill&&P.hp<=refill){ P.hp=P.maxHp; last=P.hp; refills++; }
      if(!P.alive||G.state.mode==='dead'){ G.input.setVirtual('attack',false); return {dead:true,hurt,refills,swings}; }
      const dx=m.pos.x-P.pos.x, dz=m.pos.z-P.pos.z, d=Math.hypot(dx,dz); P.heading=Math.atan2(dx,dz);
      if(d>1.7){ G.moveCharacter(P.pos,dx/d*.16,dz/d*.16,P.radius,'player'); P.pos.y=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.7); }
      if(i%9===0&&d<3){ G.input.setVirtual('attack',true); swings++; } if(i%9===2)G.input.setVirtual('attack',false);
      G.step(1/30,1); }
    G.input.setVirtual('attack',false); return {dead:false,hurt,refills,swings}; },
  upD(){ return T.F().debug.drowned().filter(m=>!m.dying&&!m.sinkAway); },
  cam(cp,lp){ G.scene.onBeforeRender=(r,s,c)=>{ c.position.set(cp[0],cp[1],cp[2]); c.lookAt(lp[0],lp[1],lp[2]); c.updateMatrixWorld(); }; return true; },
  camOff(){ G.scene.onBeforeRender=()=>{}; },
  keys(on){ const k=document.getElementById('keys'); if(k)k.style.display=on?'':'none'; },
  /* draw calls (and triangles) per drawn frame, averaged over 6 frames: all passes (shadows, scene, bloom) */
  calls(){ return new Promise(res=>{ const r=G.renderer; G.headless&&G.headless.draw(12); let n=0, t0=0;
    requestAnimationFrame(function f(){ if(n===0){ r.info.autoReset=false; r.info.reset(); t0=performance.now(); } if(++n<=6)return requestAnimationFrame(f);
      const out={calls:Math.round(r.info.render.calls/6),tris:Math.round(r.info.render.triangles/6),ms:+((performance.now()-t0)/6).toFixed(1)}; r.info.autoReset=true; res(out); }); }); },
};
'ok'"""

# crabs off the landing, the boat and the first 20 m of the path (the module's own no-go circles, minus the far ones)
NOGO_OK=r"""(()=>{ const N=T.F().debug.nogo().filter(c=>c.why==='landing'||c.why==='boat'||c.why==='path'), bad=[];
  for(const m of T.F().debug.crabs())for(const c of N){ const d=Math.hypot(m.pos.x-c.x,m.pos.z-c.z); if(d<c.r*.8)bad.push([c.why,+d.toFixed(1)]); } return bad; })()"""

STEPS=[
 ("homeNothing", "(()=>{ T.start('north-sail'); T.run(1); window.__homeMons=G.monsters.list.length; const c=T.C();"
   " return {on:c.on,foes:G.monsters.list.filter(m=>m.northFoe).length,drowned:G.monsters.list.filter(m=>m.kind==='drowned').length,heaps:c.heaps,at:G.northIsle.at,mons:__homeMons}; })()",
   lambda r: not r['on'] and r['foes']==0 and r['drowned']==0 and r['heaps']==0 and r['at']=='home'),
 ("homeCallsBefore", "(async()=>{ T.calm(); G.step(1/30,4); window.__homeCalls=await T.calls(); return __homeCalls; })()", lambda r: r['calls']>0),
 ("landedCrabs", "(()=>{ T.start('north-landing'); G.alchemy.debug.setTide(150); T.run(4); const c=T.C(), b=G.northIsle.cove.beach;"
   " const near=T.F().debug.crabs().map(m=>+Math.hypot(m.pos.x-b.x,m.pos.z-b.z).toFixed(1)); return {c:c.crabs,low:c.lowTide,drowned:c.drowned,near,lure:c.lure,stage:c.stage}; })()",
   lambda r: r['low'] and r['c']['cove']>=2 and r['c']['shelf']>=1 and r['c']['reef']>=1 and r['drowned']==0 and min(r['near'])>=5 and r['lure'] and r['stage']=='before'),
 ("crabsKeepOff", "(()=>{ T.run(12); return {bad:"+NOGO_OK+",c:T.C().crabs}; })()", lambda r: not r['bad']),
 ("shot:crab", "SHOT crab 'T.keys(false); const m=T.F().debug.crabs().filter(m=>m.crabGround===\"cove\")[0]; T.cam([m.pos.x+2.4,m.pos.y+1.5,m.pos.z+2.2],[m.pos.x,m.pos.y+.25,m.pos.z])'"),
 ("crabComesForHim", r"""(()=>{ T.camOff(); const P=G.player, b=G.northIsle.cove.beach, m=T.F().debug.crabs().filter(m=>m.crabGround==='cove').sort((p,q)=>Math.hypot(p.pos.x-b.x,p.pos.z-b.z)-Math.hypot(q.pos.x-b.x,q.pos.z-b.z))[0]; const hp0=P.hp; let st=new Set(), t=null;
   { const dx=b.x-m.pos.x, dz=b.z-m.pos.z, l=Math.hypot(dx,dz)||1; T.at(m.pos.x+dx/l*5.5,m.pos.z+dz/l*5.5); }   // on open sand, 5.5 m off, between it and the landing
   T.camOff(); const w=T.walkTo(m.pos.x,m.pos.z,1.2,400,()=>Math.hypot(m.pos.x-P.pos.x,m.pos.z-P.pos.z)<3.2);
   for(let i=0;i<45;i++){ G.step(1/30,1); st.add(m.state); }        // it squares up to him (a crab holds off at ~2 m and snaps if he closes)
   for(let i=0;i<150;i++){ if(Math.hypot(m.pos.x-P.pos.x,m.pos.z-P.pos.z)>1.1){ const dx=m.pos.x-P.pos.x, dz=m.pos.z-P.pos.z, d=Math.hypot(dx,dz); G.moveCharacter(P.pos,dx/d*.08,dz/d*.08,P.radius,'player'); P.pos.y=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.7); }
     G.step(1/30,1); st.add(m.state); if(t==null&&(m.state==='windup'||m.state==='attack'))t=+(i/30).toFixed(1); }
   window.__crab=m; return {states:[...st],t,provoked:m.provokedUntil>0,dmg:hp0-P.hp,w}; })()""",
   lambda r: r['provoked'] and ('chase' in r['states'] or 'windup' in r['states']) and r['t'] is not None),
 ("crabDies", "(()=>{ const m=window.__crab, k0=T.C().crabs.cove; const f=T.fight(()=>m.alive&&!m.dying?m:null,20,6); T.run(2); return Object.assign(f,{alive:m.alive,cove:T.C().crabs.cove,k0}); })()",
   lambda r: not r['alive'] and not r['dead'] and r['cove']==r['k0']-1),
 ("shot:reef", "SHOT reef 'const S=T.F().debug.spots().reef[0]; T.at(S[0]+6,S[1]+6); T.run(1); const m=T.F().debug.crabs().find(m=>m.crabGround===\"reef\"); T.cam([m.pos.x+4,m.pos.y+2.6,m.pos.z+4],[m.pos.x,m.pos.y+.2,m.pos.z])'"),
 ("reefGoesUnder", "(()=>{ T.camOff(); G.alchemy.debug.setTide(0); T.run(1.5); const hi=T.C(); G.alchemy.debug.setTide(150); T.run(1.5); const lo=T.C(); return {hi:hi.crabs,hiLow:hi.lowTide,lo:lo.crabs,loLow:lo.lowTide}; })()",
   lambda r: not r['hiLow'] and r['hi']['reef']==0 and r['loLow'] and r['lo']['reef']>=1 and r['hi']['shelf']>=1),
 ("islandCalls", r"""(async()=>{ const F=T.F(), b=G.northIsle.cove.beach; T.at(b.x+3,b.z-3); T.calm(); G.step(1/30,4); const on=await T.calls(), c=T.C();
   F.debug.pause(true); G.step(1/30,2); const off=await T.calls(); F.debug.pause(false); G.step(1/30,4);
   const sys=G.systems.find(s=>s.name==='northIsleFoes'); const t0=performance.now(); for(let i=0;i<120;i++)sys.update(1/30); const upd=+((performance.now()-t0)/120).toFixed(3);
   return {on,off,added:on.calls-off.calls,crabs:c.crabTotal,updateMs:upd}; })()""",
   lambda r: r['added']<=240 and r['updateMs']<4),
 # the drowned: walk up from the beach (the path, then off it east across the rise) until they come up
 ("drownedRise", r"""(()=>{ const N=G.northIsle, P=G.player, F=T.F(), path=N.path; T.at(path[2][0],path[2][1]);
   window.__rose=null; G.on('northFoes:rise',e=>{ if(!window.__rose)window.__rose={n:e.n,gd:+F.graveDist(P.pos.x,P.pos.z).toFixed(1)}; });
   const w=T.walkTo(170,-690,1,900,()=>!!window.__rose); if(!window.__rose)T.walkTo(176,-700,1,600,()=>!!window.__rose); T.run(.3); const up=F.debug.drowned(), C=G.northIsleStory.sites.corner;
   return {rose:window.__rose,w,states:up.map(m=>m.state),minCorner:Math.min(...up.map(m=>Math.hypot(m.pos.x-C.x,m.pos.z-C.z))).toFixed(1),cornerR:C.r,
     below:up.map(m=>+m.parts.body.position.y.toFixed(2)),eyes:up.map(m=>m.parts.eyes[0].material.color.getHexString())}; })()""",
   lambda r: r['rose'] and 3<=r['rose']['n']<=5 and r['rose']['gd']<=15.5 and all(s=='rise' for s in r['states']) and float(r['minCorner'])>r['cornerR']+1.5 and all(y<-.3 for y in r['below'])),
 ("shot:rising", "SHOT rising 'T.run(.9); const m=T.F().debug.drowned()[0]; T.cam([m.pos.x+3.2,m.pos.y+1.6,m.pos.z+3.4],[m.pos.x,m.pos.y+.5,m.pos.z])'"),
 ("risen", "(()=>{ T.camOff(); T.run(4); const up=T.upD(); return {n:up.length,states:up.map(m=>m.state),rk:up.map(m=>m.riseK),body:up.map(m=>+m.parts.body.position.y.toFixed(2)),targetable:up.map(m=>m.hb.targetable)}; })()",
   lambda r: r['n']>=3 and all(k==1 for k in r['rk']) and all(t for t in r['targetable']) and all(s in ('chase','windup','attack','recover','hurt','idle') for s in r['states'])),
 ("shot:drowned", "SHOT drowned 'T.calm(); const m=T.upD()[0], h=m.heading; T.cam([m.pos.x+Math.sin(h)*2.4+Math.cos(h)*.9,m.pos.y+1.75,m.pos.z+Math.cos(h)*2.4-Math.sin(h)*.9],[m.pos.x,m.pos.y+1.35,m.pos.z])'"),
 ("shot:group", "SHOT group 'T.calm(); const P=G.player.pos, up=T.upD(); let cx=P.x,cz=P.z,cy=P.y; for(const m of up){cx+=m.pos.x;cz+=m.pos.z;cy+=m.pos.y;} cx/=up.length+1; cz/=up.length+1; cy/=up.length+1; const dx=P.x-cx, dz=P.z-cz, l=Math.hypot(dx,dz)||1; T.cam([cx+dz/l*9+dx/l*3,cy+4.5,cz-dx/l*9+dz/l*3],[cx,cy+.8,cz])'"),
 ("shot:grab", "SHOT grab 'T.camOff(); const P=G.player; let m=null; for(let i=0;i<30*8&&!m;i++){ G.step(1/30,1); if(P.hp<6)P.hp=P.maxHp; m=T.upD().find(x=>x.state===\"windup\"&&x.st>.6)||null; } m=m||T.upD()[0]; const h=m.heading; T.cam([m.pos.x+Math.sin(h)*3+Math.cos(h)*1.4,m.pos.y+1.6,m.pos.z+Math.cos(h)*3-Math.sin(h)*1.4],[m.pos.x,m.pos.y+1.4,m.pos.z])'"),
 ("cornerTheyRest", r"""(()=>{ T.camOff(); const C=G.northIsleStory.sites.corner, P=G.player; T.at(C.x,C.z); let minD=1e9;
   for(let i=0;i<30*8;i++){ G.step(1/30,1); if(P.hp<6)P.hp=P.maxHp; for(const m of T.upD())minD=Math.min(minD,Math.hypot(m.pos.x-C.x,m.pos.z-C.z)); }
   return {minD:+minD.toFixed(2),r:C.r,n:T.upD().length}; })()""",
   lambda r: r['n']>=1 and r['minD']>r['r']+.4),
 ("fightThemAll", "(()=>{ const P=G.player; P.hp=P.maxHp; const k0=T.C().killed; window.__hurt=[]; const h=e=>__hurt.push(e.damage); G.on('player:hurt',h);"
   " const f=T.fight(()=>{ const P=G.player; return T.upD().filter(m=>m.state!=='rise').sort((a,b)=>a.pos.distanceTo(P.pos)-b.pos.distanceTo(P.pos))[0]||null; },90,4); T.run(2.2);"
   " const c=T.C(); return Object.assign(f,{killed:c.killed-k0,left:c.drowned,heaps:c.heaps,hearts:P.maxHp/2,hits:__hurt.length}); })()",
   lambda r: not r['dead'] and r['left']==0 and r['killed']>=3 and r['heaps']>=3),
 ("shot:heap", "SHOT heap 'const h=T.F().debug.heaps()[0], P=G.player.pos, dx=h.x-P.x, dz=h.z-P.z, l=Math.hypot(dx,dz)||1; T.cam([h.x+dx/l*2.6,h.y+1.5,h.z+dz/l*2.6],[h.x,h.y+.1,h.z])'"),
 ("noRiseWhileCleared", "(()=>{ T.camOff(); T.run(6); return T.C(); })()", lambda r: r['drowned']==0 and not r['armed']),
 ("leaveAndReturn", r"""(()=>{ const F=T.F(), P=G.player, Fd=G.northIsleStory.sites.field; const b=G.northIsle.cove.beach, w1=T.walkTo(b.x,b.z,2,1500,()=>F.graveDist(P.pos.x,P.pos.z)>36); T.run(.5); const armed=T.C().armed;
   window.__rose=null; const w2a=T.walkTo(170,-690,1,1500,()=>!!window.__rose), w2=T.walkTo(Fd.x-6,Fd.z+6,1,1200,()=>!!window.__rose); T.run(3); return {armed,rose:window.__rose,n:T.upD().length,w1:w1.n,w2:w2.n}; })()""",
   lambda r: r['armed'] and r['rose'] and r['n']>=3),
 ("sinkWhenHeGoes", r"""(()=>{ const F=T.F(), P=G.player; let sinkAt=null, sank=null; G.on('northFoes:sink',e=>{ if(sinkAt==null)sinkAt={gd:+F.graveDist(P.pos.x,P.pos.z).toFixed(1),n:e.n,why:e.why}; });
   const b=G.northIsle.cove.beach, w=T.walkTo(170,-690,1,600,()=>sinkAt!=null), w2=T.walkTo(b.x,b.z,2,1500,()=>sinkAt!=null); let states=new Set(); for(let i=0;i<30*3;i++){ G.step(1/30,1); for(const m of F.debug.drowned())states.add(m.state); }
   const c=T.C(); return {sinkAt,states:[...states],left:F.debug.drowned().length,killedSame:c.killed,heaps:c.heaps}; })()""",
   lambda r: r['sinkAt'] and r['sinkAt']['gd']>=35 and r['sinkAt']['why']=='left' and r['left']==0),
 ("known", r"""(()=>{ T.start('north-isle-known'); T.run(1); const P=G.player, F=T.F(), Fd=G.northIsleStory.sites.field; const st=T.C().stage; window.__rose=null;
   const w=T.walkTo(Fd.x+8,Fd.z+4,1,1500,()=>!!window.__rose); T.run(1); return {st,rose:window.__rose,n:F.debug.drowned().length,lure:T.C().lure,w,gd:+F.graveDist(P.pos.x,P.pos.z).toFixed(1)}; })()""",
   lambda r: r['st']=='known' and r['lure'] and r['rose'] and r['n']>=3),
 ("livedNothing", r"""(()=>{ T.start('north-lived'); G.northFire.exit({instant:true}); T.run(1); T.calm(); const P=G.player, F=T.F(), Fd=G.northIsleStory.sites.field; window.__rose=null;
   const out=G.northFire.state.outcome, path=G.northIsle.path; T.at(path[2][0],path[2][1]); T.walkTo(170,-690,1,1500); const w=T.walkTo(Fd.x,Fd.z,1,1500); let max=0; for(let i=0;i<30*10;i++){ G.step(1/30,1); max=Math.max(max,F.debug.drowned().length); }
   const wk=F.debug.wake(), gd=F.graveDist(P.pos.x,P.pos.z), b=G.northIsle.cove.beach; T.at(b.x+3,b.z-3); T.run(2); return {out,max,rose:window.__rose,wake:wk,gd,lure:T.C().lure,crabs:T.C().crabTotal}; })()""",
   lambda r: r['out']=='lived' and r['max']==0 and not r['rose'] and r['wake']['n']==0 and r['gd']==0 and not r['lure'] and r['crabs']==0),
 ("diedNothing", r"""(()=>{ T.start('north-died'); G.northFire.exit({instant:true}); T.run(1); T.calm(); const P=G.player, F=T.F(), Fd=G.northIsleStory.sites.field; window.__rose=null;
   const out=G.northFire.state.outcome, path=G.northIsle.path; T.at(path[2][0],path[2][1]); T.walkTo(170,-690,1,1500); const w=T.walkTo(Fd.x,Fd.z,1,1500); let max=0; for(let i=0;i<30*10;i++){ G.step(1/30,1); max=Math.max(max,F.debug.drowned().length); }
   const wk=F.debug.wake(), gd=F.graveDist(P.pos.x,P.pos.z), b=G.northIsle.cove.beach; T.at(b.x+3,b.z-3); T.run(2); return {out,max,rose:window.__rose,wake:wk,gd,lure:T.C().lure,crabs:T.C().crabTotal}; })()""",
   lambda r: r['out']=='died' and r['max']==0 and not r['rose'] and r['wake']['n']==0 and r['gd']==0 and not r['lure'] and r['crabs']==0),
 ("homeAgainNothing", r"""(async()=>{ T.start('north-sail'); T.run(1); T.calm(); G.step(1/30,4); const a=await T.calls(); const c=T.C();
   return {on:c.on,foes:G.monsters.list.filter(m=>m.northFoe).length,drowned:G.monsters.list.filter(m=>m.kind==='drowned').length,mons:G.monsters.list.length,monsBefore:window.__homeMons,
     heaps:G.scene.children.filter(o=>o.name==='drownedHeap').length,calls:a,callsBefore:window.__homeCalls}; })()""",
   lambda r: not r['on'] and r['foes']==0 and r['drowned']==0 and r['heaps']==0 and r['mons']==r['monsBefore']),   # (calls reported: other modules' after-visit state moves them)
]

async def run(pg,steps,fails):
  for st in steps:
    name,js=st[0],st[1]; ok=st[2] if len(st)>2 else (lambda r: True)
    try:
      if js.startswith('SHOT '):
        _,tag,code=js.split(' ',2); await pg.evaluate('(()=>{'+code.strip("'")+'; G.headless&&G.headless.draw(4); return 1; })()'); await pg.wait_for_timeout(700)
        os.makedirs(OUT,exist_ok=True); path=f'{OUT}/{tag}.png'; await pg.screenshot(path=path); print('shot',name,path); continue
      r=await pg.evaluate(js)
      good=bool(ok(r))
    except Exception as e: r=str(e)[:300]; good=False
    print(('ok  ' if good else 'FAIL'),name,':',json.dumps(r)[:700])
    if not good: fails.append(name)

async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=await b.new_context(viewport={'width':960,'height':540},device_scale_factor=1); pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    await pg.goto(URL,timeout=180000)
    await pg.wait_for_function("window.G&&G.flow&&document.getElementById('loading').textContent.startsWith('Ready')",timeout=180000)
    await pg.evaluate("localStorage.removeItem('bq-save-v1')"); await pg.evaluate('G.headless&&(G.headless.hold=true);0')
    await pg.evaluate(LIB); fails=[]
    await run(pg,STEPS,fails)
    print('ok  ' if not errs else 'FAIL','noPageErrors :',errs[:3])
    if errs: fails.append('noPageErrors')
    print('RESULT:', 'PASSED' if not fails else 'FAILED '+', '.join(fails))
    await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())

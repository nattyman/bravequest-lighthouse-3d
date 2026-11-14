"""The north island comes alive (northisle_life.js): grass, heather, salt-killed trees, wrack and kelp, tide pools, birds,
low fog in the hollows, and the fire's colour near the tower.
- at home nothing is built; after the landing it is built and drawn, and hidden again (no extra draw calls) at home;
- nothing sits inside a keep-clear circle (northisle_story.js's sites plus a few dummy circles this test adds before the
  build), on the path, on the landing beach, at the mooring, on the tower apron or at the cave mouth; the path is still
  walkable end to end and no collider of ours is near it;
- a colony goes up when Rowan walks up to it and settles again after he has gone;
- the island's dressing costs at most ~20 draw calls;
- near the tower things take a cold green tint while the lure burns, warm gold after 'lived', nothing after 'died';
- it is hidden in the sea cave; screenshots of each new thing go to the scratchpad (OUT).
usage: python3 test/northisle_life_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
OUT=os.environ.get('SHOTS','/tmp/claude-0/northisle_life')

LIB=r"""
window.T={
  play(){ if(G.state.mode==='paused'&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); if(G.state.mode!=='play'&&G.state.mode!=='dead')G.setMode('play'); },
  calm(){ for(let i=0;i<10&&G.talk&&G.talk.isOpen;i++)G.talk.advance(); for(let i=0;i<14;i++)G.ui.advance&&G.ui.advance(); if(G.cine&&G.cine.on&&G.cine.skip)G.cine.skip(); T.play(); },
  start(id){ G.devtools.start(id); for(let i=0;i<40;i++){ T.calm(); G.step(1/30,1); } T.calm(); },
  run(s){ for(let i=0;i<Math.round(s*30);i++)G.step(1/30,1); },
  at(x,z){ const P=G.player; P.teleport(x,G.floorAt(x,z,G.world.height(x,z)+2),z,P.yaw||0); G.step(1/30,3); },
  walkTo(x,z,stop,max){ const P=G.player; let n=0, blocked=0; for(;n<(max||900);n++){ const dx=x-P.pos.x, dz=z-P.pos.z, d=Math.hypot(dx,dz); if(d<stop)break;
      const r=G.moveCharacter(P.pos,dx/d*.15,dz/d*.15,P.radius,'player'); if(r.blocked)blocked++; P.pos.y=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.7); G.step(1/30,1); } return {n,blocked}; },
  cam(cp,lp){ G.scene.onBeforeRender=(r,s,c)=>{ c.position.set(cp[0],cp[1],cp[2]); c.lookAt(lp[0],lp[1],lp[2]); c.updateMatrixWorld(); }; return true; },
  camOff(){ G.scene.onBeforeRender=()=>{}; },
  life(){ return G.northIsleLife; },
  /* draw calls (and triangles) per drawn frame, averaged over 6 frames: all passes (shadows, scene, bloom) */
  calls(){ return new Promise(res=>{ const r=G.renderer; G.headless&&G.headless.draw(12); let n=0, t0=0;
    requestAnimationFrame(function f(){ if(n===0){ r.info.autoReset=false; r.info.reset(); t0=performance.now(); } if(++n<=6)return requestAnimationFrame(f);
      const out={calls:Math.round(r.info.render.calls/6),tris:Math.round(r.info.render.triangles/6),ms:+((performance.now()-t0)/6).toFixed(1)}; r.info.autoReset=true; res(out); }); }); },
};
'ok'"""

# keep-clear circles of our own, pushed before the island is built (northisle_story.js adds its own at evaluation)
DUMMIES="G.isleKeepClear.push({x:128,z:-722,r:6,why:'test dummy A'},{x:200,z:-705,r:5,why:'test dummy B'},{x:118,z:-748,r:4,why:'test dummy C'}); G.isleKeepClear.length"

STEPS=[
 ("homeNothingBuilt", "(()=>{ "+DUMMIES+"; T.start('north-sail'); const L=T.life(); return {built:L.built,visible:L.visible,root:!!G.scene.getObjectByName('northIsleLife'),at:G.northIsle.at,keep:G.isleKeepClear.length}; })()",
   lambda r: not r['built'] and not r['visible'] and not r['root'] and r['at']=='home' and r['keep']>=3),
 ("homeCallsBefore", "CALLS", lambda r: r['calls']>0),
 ("landedBuilt", "(()=>{ T.start('north-landing'); T.run(1); const L=T.life(), c=L.debug.counts(), root=G.scene.getObjectByName('northIsleLife');"
   " return {c,visible:L.visible,root:!!root&&root.visible,inside:G.northIsle.inside,colonies:L.birds.length}; })()",
   lambda r: r['visible'] and r['root'] and r['inside'] and r['c']['grass']>2500 and r['c']['heather']>800 and 10<=r['c']['trees']<=40 and r['c']['wrack']>20 and r['c']['kelp']>40
     and r['c']['pools']>=5 and r['c']['birds']>=30 and r['colonies']>=5 and r['c']['fog']>=8 and r['c']['meshes']<=12),
 ("keepClear", r"""(()=>{ const L=T.life(), N=G.northIsle, p=L.debug.placed(), bad=[], circles=G.isleKeepClear.slice(), Z=L.debug.zones;
   const chk=(kind,list,ext)=>{ for(const q of list){ const x=q[0], z=q[1], e=typeof ext==='function'?ext(q):ext;
       for(const c of circles){ if(Math.hypot(x-c.x,z-c.z)<c.r+e-1e-6){ bad.push([kind,+x.toFixed(1),+z.toFixed(1),c.why]); break; } }
       for(const c of Z){ if(Math.hypot(x-c.x,z-c.z)<c.r-1e-6){ bad.push([kind,+x.toFixed(1),+z.toFixed(1),c.why]); break; } }
       if(N.pathDist(x,z)<N.pathW+(kind==='perch'?1:.2))bad.push([kind,+x.toFixed(1),+z.toFixed(1),'path']); } };
   chk('grass',p.grass,.25); chk('heather',p.heather,.25); chk('tree',p.trees,2.6); chk('wrack',p.wrack,.6); chk('kelp',p.kelp,.8);
   chk('pool',p.pools,q=>q[2]+.6); chk('perch',p.perches,.5); chk('fog',p.fog,q=>q[2]);
   // trunk colliders only well off the path
   const cols=p.trees.filter(t=>t[3]); for(const t of cols)if(N.pathDist(t[0],t[1])<N.pathW+5)bad.push(['treeCollider',t[0]|0,t[1]|0,'path']);
   // and the dummy circles really were in the way of something: dressing grows right up to their edges
   const near=circles.filter(c=>/dummy/.test(c.why)).map(c=>p.grass.concat(p.heather).filter(q=>{ const d=Math.hypot(q[0]-c.x,q[1]-c.z); return d<c.r+3; }).length);
   return {bad:bad.slice(0,8),n:bad.length,circles:circles.length,dummiesEdged:near,why:circles.map(c=>c.why)}; })()""",
   lambda r: r['n']==0 and r['circles']>=3 and sum(1 for n in r['dummiesEdged'] if n>0)>=2),
 ("pathStillWalkable", r"""(()=>{ const P=G.player, path=G.northIsle.path, N=G.northIsle; let lost=0, solid=[];
   for(let i=0;i<path.length-1;i++){ const n=Math.ceil(Math.hypot(path[i+1][0]-path[i][0],path[i+1][1]-path[i][1])/.5);
     for(let k=0;k<n;k++){ const t=k/n, x=path[i][0]+(path[i+1][0]-path[i][0])*t, z=path[i][1]+(path[i+1][1]-path[i][1])*t, f=G.floorAt(x,z);
       for(const c of G.collidersNear(x,z)){ if(Math.hypot(c.x-x,c.z-z)<c.r+.45&&c.y1>f+.3&&c.y0<f+1.5)solid.push([x|0,z|0]); } } }
   T.at(path[0][0],path[0][1]); for(let i=1;i<path.length;i++){ const tx=path[i][0], tz=path[i][1];
     for(let k=0;k<400;k++){ const dx=tx-P.pos.x, dz=tz-P.pos.z, d=Math.hypot(dx,dz); if(d<.6)break; const s=Math.min(.18,d); const r=G.moveCharacter(P.pos,dx/d*s,dz/d*s,P.radius,'player'); if(r.blocked){ lost++; break; } P.pos.y=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.7); } }
   const end=path[path.length-1]; return {lost,solid:solid.slice(0,4),end:+Math.hypot(P.pos.x-end[0],P.pos.z-end[1]).toFixed(1)}; })()""",
   lambda r: r['lost']==0 and not r['solid'] and r['end']<1),
 ("islandCalls", r"""(async()=>{ const L=T.life(), b=G.northIsle.cove.beach; T.at(b.x,b.z); T.calm(); G.step(1/30,4);
   L.debug.show(false); G.step(1/30,1); const off=await T.calls(); L.debug.show(null); G.step(1/30,1); const on=await T.calls();
   const sys=G.systems.find(s=>s.name==='northIsleLife'); const t0=performance.now(); for(let i=0;i<120;i++)sys.update(1/30); const upd=+((performance.now()-t0)/120).toFixed(3);
   return {off,on,added:on.calls-off.calls,addedTris:on.tris-off.tris,updateMs:upd}; })()""",
   lambda r: 0<r['added']<=20 and r['updateMs']<4),
 ("birdsScatter", r"""(()=>{ const L=T.life(), P=G.player; T.calm(); const c=L.birds.filter(b=>/^cliff/.test(b.id))[0]||L.birds[0];
   T.at(c.x-26,c.z+6); G.step(1/30,10); const before=L.birds.find(b=>b.id===c.id).state;
   let upAt=null; const w=T.walkTo(c.x,c.z,7.5,700); const s=L.birds.find(b=>b.id===c.id);
   T.run(2); const lifted=L.debug.list.filter(b=>b.col&&b.col.id===c.id).map(b=>+(b.pos.y-b.perch.y).toFixed(1));
   window.__col=c.id; return {id:c.id,before,after:s.state,lifted,dist:+Math.hypot(P.pos.x-c.x,P.pos.z-c.z).toFixed(1),w}; })()""",
   lambda r: r['before']=='settled' and r['after']=='up' and sum(1 for h in r['lifted'] if h>2)>=len(r['lifted'])-1 and r['w']['blocked']<20),
 ("shot:flight", "SHOT flight 'const c=T.life().birds.find(b=>b.id===window.__col); T.run(1.5); T.cam([c.x-20,c.y+9,c.z+14],[c.x,c.y+7,c.z])'"),
 ("staysUpWhileNear", "(()=>{ T.run(16); const s=T.life().birds.find(b=>b.id===window.__col); return {state:s.state}; })()", lambda r: r['state']=='up'),
 ("settlesAfter", r"""(()=>{ T.camOff(); const L=T.life(), c=L.birds.find(b=>b.id===window.__col); const w=T.walkTo(c.x-42,c.z+8,1,900); let t=null;
   for(let k=0;k<30*45;k++){ G.step(1/30,1); if(L.birds.find(b=>b.id===c.id).state==='settled'){ t=+(k/30).toFixed(1); break; } }
   const s=L.birds.find(b=>b.id===c.id); return {t,walk:w.n,state:s.state,perched:s.perched,n:s.n,scatters:s.scatters}; })()""",
   lambda r: r['state']=='settled' and r['perched']==r['n'] and r['scatters']>=1),
 ("greenNearTower", "(()=>{ const t=T.life().debug.tint(); return t; })()",
   lambda r: r['mode']=='lure' and r['nNear']>10 and r['near'][1]/max(r['near'][0],1e-3)>r['nearBase'][1]/max(r['nearBase'][0],1e-3)*1.12 and r['far']==r['farBase'] and r['wash'] and r['fogTintK']>0),
 ("shot:moor", "SHOT moor 'T.cam([172,24,-628],[146,12,-700])'"),
 ("shot:towerGreen", "SHOT towerGreen 'T.cam([118,36,-680],[146,24,-712])'"),
 ("shot:stack", "SHOT stack 'const c=T.life().birds.find(b=>/^stack/.test(b.id)); T.cam([c.x+16,c.y+7,c.z-6],[c.x,c.y,c.z])'"),
 ("shot:shore", "SHOT shore 'const p=T.life().debug.placed().pools[0]; T.cam([p[0]-4,5.5,p[1]+10],[p[0]+3,0,p[1]-3])'"),
 ("shot:fog", "SHOT fog 'const f=T.life().debug.placed().fog[0]; T.cam([f[0]+22,G.world.height(f[0],f[1])+9,f[1]+14],[f[0],G.world.height(f[0],f[1])+1,f[1]])'"),
 ("shot:trees", "SHOT trees 'const t=T.life().debug.placed().trees[0]; const h=G.world.height(t[0],t[1]); T.cam([t[0]+12,h+7,t[1]+12],[t[0],h+1.5,t[1]])'"),
 ("homeAgainHidden", r"""(async()=>{ T.camOff(); G.northIsle.cross('home',{instant:true}); T.run(1); T.calm(); const L=T.life(), root=G.scene.getObjectByName('northIsleLife');
   const a=await T.calls(); G.scene.remove(root); G.step(1/30,1); const b=await T.calls(); G.scene.add(root); G.step(1/30,1);
   return {at:G.northIsle.at,visible:L.visible,rootVis:root.visible,withLife:a,without:b}; })()""",
   lambda r: r['at']=='home' and not r['visible'] and not r['rootVis'] and r['withLife']['calls']==r['without']['calls']),
 ("hiddenInCave", "(()=>{ T.start('north-cave-in'); T.run(1); return {cave:G.northCave.inside,visible:T.life().visible}; })()", lambda r: r['cave'] and not r['visible']),
 ("goldAfterLived", "(()=>{ T.start('north-lived'); G.northFire.exit({instant:true}); T.run(1); T.calm(); const L=T.life(); return Object.assign({outcome:G.northFire.state.outcome,visible:L.visible},L.debug.tint()); })()",
   lambda r: r['outcome']=='lived' and r['visible'] and r['mode']=='lived' and r['near'][0]>r['near'][2]*1.6 and r['near'][0]/max(r['near'][2],1e-3)>r['nearBase'][0]/max(r['nearBase'][2],1e-3) and r['wash'] and r['washCol'] not in (None,'')),
 ("shot:towerGold", "SHOT towerGold 'T.cam([118,36,-680],[146,24,-712])'"),
 ("noneAfterDied", "(()=>{ T.camOff(); T.start('north-died'); G.northFire.exit({instant:true}); T.run(1); T.calm(); const L=T.life(); return Object.assign({outcome:G.northFire.state.outcome},L.debug.tint()); })()",
   lambda r: r['outcome']=='died' and r['mode']=='died' and r['near']==r['nearBase'] and not r['wash'] and r['fogTintK']==0),
 ("shot:towerDied", "SHOT towerDied 'T.cam([118,36,-680],[146,24,-712])'"),
]

async def run(pg,steps,fails):
  for st in steps:
    name,js=st[0],st[1]; ok=st[2] if len(st)>2 else (lambda r: True)
    try:
      if js=='CALLS': r=await pg.evaluate('T.calls()')
      elif js.startswith('SHOT '):
        _,tag,code=js.split(' ',2); await pg.evaluate('(()=>{'+code.strip("'")+'; G.headless&&G.headless.draw(4); return 1; })()'); await pg.wait_for_timeout(700)
        os.makedirs(OUT,exist_ok=True); path=f'{OUT}/{tag}.png'; await pg.screenshot(path=path); print('shot',name,path); continue
      else: r=await pg.evaluate(js)
      good=bool(ok(r))
    except Exception as e: r=str(e)[:300]; good=False
    print(('ok  ' if good else 'FAIL'),name,':',json.dumps(r)[:600])
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

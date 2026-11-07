"""The glide (Jacob's feedback): glide numbers, the moor spire needs a glide, the glide hint.
- measures the glide on a test platform 40 m above the moor: metres flown per metre dropped, and how far a glide carries from a
  standing jump, a walk, a sprint and a sprint + double jump (stamina still drains);
- the moor spire can't be reached without gliding: from the headland edge and from the nearest high points of the cliff path,
  a sprint and every chain of double jump / aerial spin / air roll timings we try falls short of the perch (real inputs);
- it can be reached with a glide from the launch point (standing jump, walk, sprint + double jump): you land on the perch and
  the shard is collected;
- the glide hint: once at the edge above the spire, once on a long fall (and never once you've glided);
- screenshots in /tmp/claude-0/jacob-glide/: the spire from the launch point, and mid-glide toward it.
usage: python3 test/glide_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, json, time, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
OUT='/tmp/claude-0/jacob-glide'; os.makedirs(OUT,exist_ok=True)

LIB=r"""
window.GL=(()=>{
const P=()=>G.player, I=()=>G.input, KEYS=['forward','back','left','right','sprint','jump','roll','attack'];
const rel=()=>{ for(const k of KEYS)I().setVirtual(k,false); };
const plat={on:false,y:54,x0:20,x1:45,z0:-5,z1:5};   // a test platform 40 m above the open moor (floor provider)
if(!window.__glPlat){ window.__glPlat=1; G.floorProviders.push((x,z,y)=>plat.on&&x>=plat.x0&&x<=plat.x1&&z>=plat.z0&&z<=plat.z1&&plat.y<=y+.05?plat.y:null); }
function play(){ if(G.state.mode==='paused'){ const r=document.getElementById('resume'); if(r&&!document.getElementById('pause').hidden)r.click(); else G.setMode('play'); } }
function fresh(){ play(); G.progress.endReward(); const p=P(); p.hp=p.maxHp; p.stamina=1; p.exhausted=false; p.setCloak(true); G.items.staff.owned=true; }
const ground=(x,z)=>G.floorAt(x,z,G.world.height(x,z)+3);
const spire=()=>G.progress.spots.find(s=>s.id==='spire');
/* one flight. o: {x,z,y?, yaw, run (frames of run-up, 0 = standing jump), sprint, jumpAt:{x,z} (jump once you pass it, along yaw),
   glide (hold jump), dj (frame after takeoff), spin, dive (frames), ballistic (never glide), target:{x,z,top,r} (steer at it,
   let go over it), max}. Returns the trajectory, the landing, the closest pass over the target and stamina used. */
function fly(o){
  fresh(); rel(); const p=P(), yaw=o.yaw, fx=Math.sin(yaw), fz=Math.cos(yaw);
  p.teleport(o.x,o.y!=null?o.y:ground(o.x,o.z),o.z,yaw); G.step(1/30,20); p.stamina=1; p.exhausted=false;
  const along=q=>(p.pos.x-q.x)*fx+(p.pos.z-q.z)*fz;
  const run=o.run||0;
  I().setVirtual('forward',run>0); I().setVirtual('sprint',!!o.sprint&&run>0);
  for(let k=0;k<run;k++){ p.aimCamera(yaw); G.step(1/30,1); if(o.jumpAt&&along(o.jumpAt)>=0)break; }
  I().setVirtual('forward',true); I().setVirtual('sprint',!!o.sprint); I().setVirtual('jump',true);
  const x0=p.pos.x, z0=p.pos.z, y0=p.pos.y, s0=p.stamina; const tr=[]; let land=null, prevY=1e9, glided=false, released=false, best=1e9;
  const T=o.target;
  for(let k=0;k<(o.max||420);k++){
    let a=yaw;
    if(T){ const dx=T.x-p.pos.x, dz=T.z-p.pos.z, d=Math.hypot(dx,dz); a=Math.atan2(dx,dz);
      if(o.glide&&!released&&d<(o.letGo||2.2)){ released=true; I().setVirtual('jump',false); } }
    p.aimCamera(a);
    if(o.ballistic){ if(k===9&&(o.dj==null||k<o.dj))I().setVirtual('jump',false); if(o.dj!=null&&k>o.dj&&(p.pos.y<=prevY+1e-3||p.state!=='jump'))I().setVirtual('jump',false); }
    else if(!o.glide&&k===1&&o.dj==null)I().setVirtual('jump',false);
    if(o.dj!=null){ if(k===o.dj-1)I().setVirtual('jump',false); if(k===o.dj&&!released)I().setVirtual('jump',true); }
    if(o.dive!=null){ if(k===o.dive)I().setVirtual('roll',true); if(k===o.dive+1)I().setVirtual('roll',false); }
    if(o.spin!=null){ if(k===o.spin)I().setVirtual('attack',true); if(k===o.spin+1)I().setVirtual('attack',false); }
    prevY=p.pos.y; G.step(1/30,1); if(p.gliding)glided=true;
    const d=Math.hypot(p.pos.x-x0,p.pos.z-z0); tr.push([+d.toFixed(2),+p.pos.y.toFixed(2)]);
    const W=T||o.watch; if(W&&p.pos.y>=W.top-.35)best=Math.min(best,Math.hypot(p.pos.x-W.x,p.pos.z-W.z));
    if(o.onFrame)o.onFrame(k,p);
    if(k>2&&p.grounded){ land={d:+d.toFixed(2),x:+p.pos.x.toFixed(2),y:+p.pos.y.toFixed(2),z:+p.pos.z.toFixed(2),t:+((k+1)/30).toFixed(2)}; break; }
    if(G.progress.rewarding){ land={reward:G.progress.rewarding,x:+p.pos.x.toFixed(2),y:+p.pos.y.toFixed(2),z:+p.pos.z.toFixed(2)}; break; }
  }
  rel(); G.step(1/30,2);
  return {y0:+y0.toFixed(2),tr,land,glided,closest:+best.toFixed(2),stamina:+(s0-p.stamina).toFixed(3)};
}
function reachAt(f,drop){ const yT=f.y0-drop; let prev=null; for(const q of f.tr){ if(q[1]<=yT){ if(!prev)return q[0]; const k=(prev[1]-yT)/(prev[1]-q[1]); return +(prev[0]+(q[0]-prev[0])*k).toFixed(2);} prev=q; } return null; }
function ratio(f,a,b){ const da=reachAt(f,a), db=reachAt(f,b); return da!=null&&db!=null?+((db-da)/(b-a)).toFixed(2):null; }
/* every no-glide chain we try: double jump timing x aerial spin x air roll (frames after takeoff) */
function chains(){ const out=[{}]; for(const dj of [6,10,14,18,24,30,38]) for(const sp of [null,3,8]) for(const dv of [null,6,14,24,34]){ const s=sp==null?null:dj+sp; out.push({dj,spin:s,dive:dv==null?null:(s||dj)+dv}); }
  for(const dv of [4,10,18])out.push({dive:dv}); return out; }
return {fly,reachAt,ratio,plat,rel,fresh,play,ground,spire,chains};
})(); 'lib'
"""

MEASURE=r"""(()=>{ const plat=GL.plat; plat.on=true; const y=plat.y, yaw=Math.PI/2, e={x:plat.x1-.4,z:0}; const out={};
  const runs={stand:{x:plat.x1-.5,z:0,y,yaw,run:0,glide:true}, walk:{x:plat.x1-10,z:0,y,yaw,run:90,jumpAt:e,glide:true},
    sprint:{x:plat.x1-14,z:0,y,yaw,run:90,sprint:true,jumpAt:e,glide:true}, sprintDJ:{x:plat.x1-14,z:0,y,yaw,run:90,sprint:true,jumpAt:e,dj:9,glide:true},
    noGlide:{x:plat.x1-14,z:0,y,yaw,run:90,sprint:true,jumpAt:e,dj:9,ballistic:true}};
  for(const k in runs){ const f=GL.fly(runs[k]); out[k]={ratio:GL.ratio(f,5,20),at5:GL.reachAt(f,5),at10:GL.reachAt(f,10),at15:GL.reachAt(f,15),at20:GL.reachAt(f,20),stamina:f.stamina,glided:f.glided}; }
  plat.on=false; return out; })()"""

# launch points for the no-glide attempts: the headland edge (three takeoff spots on the line at the spire) and the high
# points of the cliff path / headland lip that come closest to being in range (a measured worst case: dist - envelope(drop))
NOGLIDE=r"""(()=>{ const S=GL.spire(), top=S.pos.y-.55, T={x:S.pos.x,z:S.pos.z,top,r:1.7}; const H=(x,z)=>G.world.height(x,z);
  const EB=[[0,12.7],[4,16.1],[8,18.7],[12,20.3],[16,21.5],[20,22.5],[28,25],[40,28]];   // measured no-glide envelope (reach vs drop), test platform
  const env=d=>{ if(d<=0)return EB[0][1]; for(let i=1;i<EB.length;i++)if(d<=EB[i][0]){const a=EB[i-1],b=EB[i];return a[1]+(b[1]-a[1])*(d-a[0])/(b[0]-a[0]);} return 27; };
  const cand=[]; for(let x=Math.round(T.x)-35;x<=Math.round(T.x)+40;x++)for(let z=Math.round(T.z)-35;z<=Math.round(T.z)+35;z++){ const h=H(x,z); if(h<top-1||!G.world.walkable(x,z))continue;
    const d=Math.hypot(x-T.x,z-T.z)-1.7; cand.push({x,z,h,danger:env(h-top)-d}); }
  cand.sort((a,b)=>b.danger-a.danger); const picks=[]; for(const c of cand){ if(picks.every(q=>Math.hypot(q.x-c.x,q.z-c.z)>6))picks.push(c); if(picks.length>=3)break; }
  const launches=[{x:115,z:12,name:'edge'},{x:114,z:12,name:'edge-1'},{x:113,z:12,name:'lip'}].concat(picks.map(c=>({x:c.x,z:c.z,name:'path '+c.x+','+c.z+' h'+c.h.toFixed(1)})));
  const res=[]; let reached=false, best={closest:1e9};
  for(const L of launches){ const yaw=Math.atan2(T.x-L.x,T.z-L.z), fx=Math.sin(yaw), fz=Math.cos(yaw), run=8;
    let lb={closest:1e9};
    for(const c of GL.chains()){ const f=GL.fly(Object.assign({x:L.x-fx*run,z:L.z-fz*run,yaw,run:60,sprint:true,jumpAt:L,ballistic:true,max:240,watch:T},c));
      if(f.glided)continue; const got=!!G.progress.state.shards.spire||(f.land&&f.land.reward);
      if(got){ reached=true; G.progress.debug.reset(); }
      if(f.closest<lb.closest)lb={closest:f.closest,chain:c,land:f.land}; }
    res.push({from:L.name,closest:+lb.closest.toFixed(2),chain:lb.chain}); if(lb.closest<best.closest)best={closest:lb.closest,from:L.name}; }
  return {top:+top.toFixed(2),reached,best,res,runs:launches.length*GL.chains().length}; })()"""

GLIDE=r"""(()=>{ const S=GL.spire(), top=S.pos.y-.55, T={x:S.pos.x,z:S.pos.z,top,r:1.7}; const L={x:S.from.x,z:S.from.z}; const yaw=Math.atan2(T.x-L.x,T.z-L.z), fx=Math.sin(yaw), fz=Math.cos(yaw);
  const ways={stand:{x:L.x,z:L.z,yaw,run:0,glide:true}, walk:{x:L.x-fx*7,z:L.z-fz*7,yaw,run:60,jumpAt:L,glide:true},
    sprintDJ:{x:L.x-fx*10,z:L.z-fz*10,yaw,run:60,sprint:true,jumpAt:L,dj:9,glide:true}};
  const out={};
  for(const k in ways){ G.progress.debug.reset(); const f=GL.fly(Object.assign({target:T,max:600},ways[k])); const got=!!G.progress.state.shards.spire; G.step(1/30,10); G.progress.endReward(); G.step(1/30,3);
    const p=G.player.pos; out[k]={got,land:f.land,closest:f.closest,onPerch:Math.hypot(p.x-T.x,p.z-T.z)<1.75&&Math.abs(p.y-top)<.1,stamina:f.stamina}; }
  // the margin: glide straight at it (no letting go) — how high above the perch top you still are as you cross its near rim
  const rimX=Math.hypot(T.x-L.x,T.z-L.z)-1.7; out.margin={};
  for(const k of ['stand','walk']){ G.progress.debug.reset(); let above=null; GL.fly(Object.assign({},ways[k],{max:600,onFrame:(n,p)=>{ if(above==null&&Math.hypot(p.pos.x-L.x,p.pos.z-L.z)>=rimX)above=p.pos.y-top; }}));
    out.margin[k]=above==null?null:+above.toFixed(2); }
  out.margin.note='m above the perch top at its near rim; x1.65 = metres of glide to spare';
  G.progress.debug.reset(); return out; })()"""

HINT=r"""(()=>{ const said=[]; const s0=G.ui.say; G.ui.say=function(t,...a){ said.push(String(t)); return s0.call(this,t,...a); };
  const hints=[]; const off=G.on('progress:hint',e=>hints.push(e.via));
  const glideLines=()=>said.filter(t=>/Hold jump while you fall/.test(t));
  const out={};
  // 1) the edge above the spire, cloak on, never glided: once
  G.progress.debug.reset(); GL.fresh(); GL.rel(); const L=GL.spire().from;
  G.player.teleport(L.x+8,GL.ground(L.x+8,L.z),L.z,-Math.PI/2); G.step(1/30,5);
  const before=glideLines().length; G.input.setVirtual('forward',true); for(let k=0;k<45&&Math.hypot(G.player.pos.x-L.x,G.player.pos.z-L.z)>2;k++){ G.player.aimCamera(-Math.PI/2); G.step(1/30,1); } G.input.setVirtual('forward',false); G.step(1/30,10);
  out.edge={lines:glideLines().length-before,via:G.progress.state.said.glide,text:glideLines().slice(-1)[0]};
  G.player.teleport(L.x+8,GL.ground(L.x+8,L.z),L.z,-Math.PI/2); G.step(1/30,5); G.player.teleport(L.x,GL.ground(L.x,L.z),L.z,-Math.PI/2); G.step(1/30,20);
  out.edgeAgain=glideLines().length-before;
  // 2) a long fall with the cloak (no glide): once
  G.progress.debug.reset(); GL.fresh(); const plat=GL.plat; plat.on=true; const n0=glideLines().length;
  G.player.teleport(plat.x1-3,plat.y,0,Math.PI/2); G.step(1/30,4); G.input.setVirtual('forward',true); for(let k=0;k<120&&!(G.player.grounded&&G.player.pos.y<plat.y-5);k++){ G.player.aimCamera(Math.PI/2); G.step(1/30,1); } GL.rel(); G.step(1/30,4);
  out.fall={lines:glideLines().length-n0,via:G.progress.state.said.glide,text:glideLines().slice(-1)[0]};
  // 3) a player who already glides is never told
  G.progress.debug.reset(); GL.fresh(); const n1=glideLines().length;
  GL.fly({x:plat.x1-.5,z:0,y:plat.y,yaw:Math.PI/2,run:0,glide:true,max:120}); GL.fly({x:plat.x1-3,z:0,y:plat.y,yaw:Math.PI/2,run:20,ballistic:true});
  out.glider={lines:glideLines().length-n1,via:G.progress.state.said.glide};
  // 4) persisted: the said flag rides the save
  out.saved=JSON.stringify(G.persist?Object.keys(G.progress.state.said):[]);
  // 5) no cloak, no hint
  G.progress.debug.reset(); GL.fresh(); G.player.setCloak(false); const n2=glideLines().length;
  G.player.teleport(L.x+8,GL.ground(L.x+8,L.z),L.z,-Math.PI/2); G.step(1/30,5); G.player.teleport(L.x,GL.ground(L.x,L.z),L.z,-Math.PI/2); G.step(1/30,20);
  out.noCloak=glideLines().length-n2; G.player.setCloak(true);
  plat.on=false; G.ui.say=s0; off&&off(); G.progress.debug.reset(); return out; })()"""

CHECKS={
 'measure':lambda r: 1.5<=r['stand']['ratio']<=1.8 and 1.5<=r['sprintDJ']['ratio']<=1.8 and r['sprintDJ']['at10']>r['stand']['at10']+5
           and r['sprint']['at10']>r['walk']['at10'] and r['stand']['stamina']>.05 and r['noGlide']['glided'] is False and (r['noGlide']['at10'] or 99)>0,
 'noGlide':lambda r: r['reached'] is False and r['best']['closest']>1.7+2.0 and r['best']['closest']<1e8 and r['runs']>=300,
 'glide':lambda r: all(r[k]['got'] and r[k]['onPerch'] for k in ['stand','walk','sprintDJ']) and (r['margin']['stand'] or 0)>=1.5 and (r['margin']['walk'] or 0)>=2.5,
 'hint':lambda r: r['edge']['lines']==1 and r['edge']['via']=='edge' and r['edgeAgain']==1 and r['fall']['lines']==1 and r['fall']['via']=='fall'
           and r['glider']['lines']==0 and r['glider']['via']=='glided' and r['noCloak']==0,
}

async def main():
    t0=time.time(); fails=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await (await b.new_context(viewport={'width':1000,'height':620})).new_page(); pg.set_default_timeout(900000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and '404' not in m.text else None)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
        await pg.evaluate("localStorage.removeItem('bq-save-v1'); document.getElementById('begin').click(); G.step(1/30,20); G.progress.debug.noSweep=true; 0")
        await pg.evaluate(LIB)
        for name,js in [('measure',MEASURE),('noGlide',NOGLIDE),('glide',GLIDE),('hint',HINT)]:
            t=time.time()
            try: r=await pg.evaluate(js)
            except Exception as e: r='EXC '+str(e).split('\n')[0][:300]
            try: ok=not isinstance(r,str) and bool(CHECKS[name](r))
            except Exception: ok=False
            print(('ok  ' if ok else 'FAIL'), name, f'({time.time()-t:.0f}s):', json.dumps(r)[:1600])
            if not ok: fails.append(name)
        # screenshots: the spire from the launch point, then mid-glide toward it
        await pg.evaluate("""(()=>{ GL.fresh(); GL.rel(); const S=GL.spire(), L=S.from, yaw=Math.atan2(S.pos.x-L.x,S.pos.z-L.z);
            G.player.teleport(L.x+1.2,GL.ground(L.x+1.2,L.z),L.z,yaw); G.step(1/30,30); for(let i=0;i<3;i++){ G.player.aimCamera(yaw+.5,.55); G.step(1/30,1); } })()""")   # camera off to one side so the player doesn't hide the spire
        await pg.evaluate('G.headless&&G.headless.draw(3); 0'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT+'/spire_from_launch.png',timeout=120000)
        await pg.evaluate("""(()=>{ const S=GL.spire(), L=S.from, yaw=Math.atan2(S.pos.x-L.x,S.pos.z-L.z), fx=Math.sin(yaw), fz=Math.cos(yaw);
            GL.fresh(); GL.rel(); G.progress.debug.reset(); G.player.teleport(L.x-fx*7,GL.ground(L.x-fx*7,L.z-fz*7),L.z-fz*7,yaw); G.step(1/30,20);
            G.input.setVirtual('forward',true); for(let k=0;k<40;k++){ G.player.aimCamera(yaw,.12); G.step(1/30,1); if((G.player.pos.x-L.x)*fx+(G.player.pos.z-L.z)*fz>=0)break; }
            G.input.setVirtual('jump',true); for(let k=0;k<60;k++){ G.player.aimCamera(yaw,.12); G.step(1/30,1); }
            G.input.setVirtual('forward',false); for(let i=0;i<2;i++){ G.player.aimCamera(yaw+.45,.3); G.step(1/30,1); } })()""")
        st=await pg.evaluate("({gliding:G.player.gliding,y:+G.player.pos.y.toFixed(1),x:+G.player.pos.x.toFixed(1)})"); print('   mid-glide:',json.dumps(st))
        await pg.evaluate('G.headless&&G.headless.draw(3); 0'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT+'/mid_glide.png',timeout=120000)
        await pg.evaluate("GL.rel(); G.step(1/30,2); 0")
        real=[e for e in errs if '404' not in e]
        for e in real[:10]: print('  ERR',e[:300])
        if real: fails.append('console errors')
        await b.close()
    print(('PASS' if not fails else 'FAIL '+', '.join(fails)), f'{time.time()-t0:.0f}s'); sys.exit(1 if fails else 0)
asyncio.run(main())

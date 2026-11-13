"""The Gloaming (finale boss, js/finale_boss.js) end-to-end test.
Starts from the devtools "Before the Hollow Stag" start point (lamp cured, staff owned), steps outside so flow.js emits
finale:start, suppresses the Hollow Stag that this branch's monsters.js still spawns on finale:start (and swallows its
who-less boss:dead), then checks: spawn + intro, untouchable outside the beam, damageable in the beam, slam/sweep
telegraphs, phase 2 tendrils (a tendril reaching the top guts the beam; cutting all roots staggers it), Hollow calls
capped, player death -> clean reset (and it rises again), defeat -> boss:dead {who:'gloaming'} + boss bar cleared,
draw calls, no page errors. Screenshots in /tmp/claude-0/gloaming/.
usage: python3 test/finale_e2e.py [url]   (default http://localhost:8890/dev.html?debug&headless)
"""
import asyncio, sys, time, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8890/dev.html?debug&headless'
OUT='/tmp/claude-0/gloaming'; os.makedirs(OUT,exist_ok=True)
CHECK_S=float(os.environ.get('CHECK_TIMEOUT','240'))   # wall-clock budget per check (the slowest takes ~10 s on CI)

HELP=r"""(()=>{ window.T={ev:[],bar:[]};
  const e=G.emit; G.emit=(n,d)=>{ if(n==='boss:dead'&&!(d&&d.who))return; if(/^(finale:start|boss:dead|gloaming:|player:dead|player:respawn)/.test(n))T.ev.push([n,d&&d.who||'',+G.time.toFixed(2)]); return e(n,d); };
  const bb=G.ui.bossBar; G.ui.bossBar=(n,f)=>{ T.lastBar=n||null; return bb.call(G.ui,n,f); };
  T.FB=()=>G.finaleBoss; T.B=()=>G.finaleBoss.debug.B;
  T.suppressStag=()=>{ const M=G.monsters; if(!M)return 0; let n=0; for(const m of M.list.slice()){ if(m.finale&&m.alive&&!m.gloaming){ M.despawn(m); n++; } } return n; };
  T.until=(f,max)=>{ let k=0; while(!f()&&k<max){ G.step(1/30,1); k++; } return k; };
  T.strikeBoss=(dmg)=>{ const hb=G.finaleBoss.debug.bodyHB; return G.combat.strike({x:hb.pos.x+2.4,y:hb.pos.y+1,z:hb.pos.z,radius:1.1,team:'player',damage:dmg||2,knockback:5,kind:'melee'}).includes(hb); };
  T.sectorVisible=()=>{ let v=false; G.scene.traverse(o=>{ if(o.isMesh&&o.visible&&o.material&&o.material.uniforms&&o.material.uniforms.uTh0)v=true; }); return v; };
  T.near=()=>{ const b=T.B().pos; const L=G.world.lighthouse; const a=Math.atan2(b.x-L.x,b.z-L.z); G.player.teleport(b.x-Math.sin(a)*4,42,b.z-Math.cos(a)*4,a); G.player.hp=G.player.maxHp; };
  T.god=on=>{ if(G.devtools&&G.devtools.cheats)G.devtools.cheats.god=!!on; };
  T.ev0=()=>T.ev.length;
  // screenshot camera (the player camera sits low behind the Traveler; an 11 m boss needs a wider view)
  T.view=(d,side,h,lookH)=>{ const b=T.B().pos; const L=G.world.lighthouse; let a=Math.atan2(b.x-L.x,b.z-L.z)+(side||0); const x=b.x-Math.sin(a)*d, z=b.z-Math.cos(a)*d; G.player.teleport(x,42,z,a); G.step(1/30,4);
    const cp=new G.THREE.Vector3(x-Math.sin(a)*6,42+(h==null?3:h),z-Math.cos(a)*6), lp=new G.THREE.Vector3(b.x,42+(lookH==null?5:lookH),b.z);
    G.scene.onBeforeRender=(r,s,c)=>{ c.position.copy(cp); c.lookAt(lp); c.updateMatrixWorld(); }; };
  T.camAt=(cp,lp)=>{ G.scene.onBeforeRender=(r,s,c)=>{ c.position.set(cp[0],cp[1],cp[2]); c.lookAt(lp[0],lp[1],lp[2]); c.updateMatrixWorld(); }; };
  T.camOff=()=>{ G.scene.onBeforeRender=()=>{}; };
  return true; })()"""

STEPS=[
 ("boot", "[!!window.G, !!G.finaleBoss, !!G.devtools]"),
 ("setup", r"""(()=>{ G.devtools.start('finale'); G.step(1/30,30); const L=G.world.lighthouse;
   G.player.teleport(L.x-14,42,L.z-6,-2.3); const k=T.until(()=>T.ev.some(e=>e[0]==='finale:start'),200);
   const stag=T.suppressStag(); G.step(1/30,2); const B=T.B();
   return {ok:T.FB().active&&B.state==='intro',frames:k,stag,state:B.state,pos:[B.pos.x.toFixed(1),B.pos.z.toFixed(1)],bar:T.lastBar}; })()"""),
 ("shot:rise", "SHOT rise 'G.step(1/30,100); const B=G.finaleBoss.debug.B, L=G.world.lighthouse; T.camAt([L.x-22,47,L.z-12],[B.pos.x,47,B.pos.z])'"),
 ("intro", r"""(()=>{ const B=T.B(); const r0=B.rise; T.until(()=>B.state==='fight',400); T.suppressStag();
   return {ok:B.state==='fight'&&B.rise===1&&T.lastBar==='The Gloaming',rise0:+r0.toFixed(2),state:B.state,hp:B.hp}; })()"""),
 ("untouchable", r"""(()=>{ T.god(true); const B=T.B(); T.until(()=>!T.FB().solid&&B.tt>2.2,300); T.near(); const hp=B.hp; const hit=T.strikeBoss(3);
   return {ok:hit&&B.hp===hp&&!T.FB().solid,hit,hp,after:B.hp,tt:+B.tt.toFixed(2)}; })()"""),
 ("warnBeforeSolid", r"""(()=>{ const B=T.B(), L=G.world.lighthouse, tr=[];
   const rec=()=>{ tr.push([+G.time.toFixed(2),B.state,+B.warn.toFixed(2),+B.tt.toFixed(2),+B.omega.toFixed(3),+B.solidT.toFixed(2),+Math.atan2(B.pos.x-L.x,B.pos.z-L.z).toFixed(3),+G.lighthouse.beam.yaw().toFixed(3)]); if(tr.length>50)tr.shift(); };
   /* measure one whole approach of the beam: let a solid window come and go first, so we never start part-way into one (wherever the
      last check left the beam) */
   const k0=T.until(()=>{ rec(); return T.FB().solid; },400), k1=T.until(()=>{ rec(); return !T.FB().solid; },400);
   let maxWarn=0; const k2=T.until(()=>{ rec(); maxWarn=Math.max(maxWarn,B.warn); return T.FB().solid; },400);
   const ok=k0<400&&k1<400&&T.FB().solid&&maxWarn>.4;
   return {ok,maxWarn:+maxWarn.toFixed(2),solidT:+B.solidT.toFixed(2),omega:+B.omega.toFixed(3),frames:[k0,k1,k2],trace:ok?undefined:tr}; })()"""),
 ("inBeam", r"""(()=>{ const B=T.B(); T.near(); const hp=B.hp; T.strikeBoss(2); G.step(1/30,6); T.strikeBoss(2); return {ok:B.hp===hp-4,hp,after:B.hp}; })()"""),
 ("shot:solid", "SHOT solid 'T.view(9,.5,2.5,5)'"),
 ("realSwing", r"""(()=>{ const B=T.B(); T.until(()=>T.FB().solid&&B.solidT>2,500); T.near(); const hp=B.hp;
   G.input.setVirtual('attack',true); G.step(1/30,3); G.input.setVirtual('attack',false); G.step(1/30,20); return {ok:B.hp<hp,hp,after:B.hp}; })()"""),
 ("cadence", r"""(()=>{ const B=T.B(); const ts=[]; let was=T.FB().solid, t0=G.time;
   T.until(()=>{ const s=B.solidT>0; if(s&&!was)ts.push(+(G.time-t0).toFixed(2)); was=s; return ts.length>=2; },900);
   const gap=ts.length>=2?ts[1]-ts[0]:null; return {ok:gap!=null&&gap>6.5&&gap<10.5,ts,gap}; })()"""),
 ("slam", r"""(()=>{ T.god(false); const B=T.B(); T.until(()=>!T.FB().solid&&B.tt>4,400); T.near(); G.player.hp=10;
   G.finaleBoss.debug.attack('slam'); G.step(1/30,3); const dec=G.finaleBoss.debug.B.atk&&B.atk.kind; const hp=G.player.hp;
   T.until(()=>!B.atk||B.atk.phase!=='wind',90); G.step(1/30,12); const ar=G.finaleBoss.debug.arms.filter(a=>a.hardT>0).length;
   return {ok:dec==='slam'&&G.player.hp<hp&&ar>=1,atk:dec,hp,after:G.player.hp,hardHands:ar}; })()"""),
 ("handHit", r"""(()=>{ const ar=G.finaleBoss.debug.arms.find(a=>a.hardT>0); if(!ar)return {ok:false,why:'no hand'}; const B=T.B(), hp=B.hp;
   G.combat.strike({x:ar.hb.pos.x,y:ar.hb.pos.y+.5,z:ar.hb.pos.z,radius:2.4,team:'player',damage:3,kind:'melee'}); return {ok:B.hp<hp,hp,after:+B.hp.toFixed(2)}; })()"""),
 ("sweep", r"""(()=>{ T.god(true); const B=T.B(); T.until(()=>!T.FB().solid&&B.tt>4,400); T.near(); G.finaleBoss.debug.attack('sweep'); G.step(1/30,10);
   const wind=!!(B.atk&&B.atk.kind==='sweep'&&B.atk.phase==='wind'), dec=T.sectorVisible(); T.god(false); G.player.hp=10; const hp=G.player.hp;
   T.until(()=>!B.atk||B.atk.phase==='recover',120); const hurt=G.player.hp<hp; T.god(true);
   return {ok:wind&&dec&&hurt,wind,decal:dec,hurt}; })()"""),
 ("shot:sweep", "SHOT sweep 'T.until(()=>!T.B().atk,200); G.finaleBoss.debug.attack(\"sweep\"); G.step(1/30,25); T.view(9,.5,6,0)'"),
 ("hollowsCap", r"""(()=>{ const D=G.finaleBoss.debug; T.until(()=>!T.B().atk,200); D.attack('call'); G.step(1/30,80); D.attack('call'); G.step(1/30,80); D.attack('call'); G.step(1/30,80);
   const n=D.hollows.filter(m=>m.alive&&!m.dying).length; return {ok:n>=2&&n<=3,n}; })()"""),
 ("phase2", r"""(()=>{ const D=G.finaleBoss.debug, B=D.B; D.setHp(17); G.step(1/30,60);
   return {ok:B.phase===2&&D.roots.every(r=>r.active&&!r.cut),phase:B.phase,roots:D.roots.map(r=>[r.active,r.hp,+r.grow.toFixed(2)])}; })()"""),
 ("tendrilClimb", r"""(()=>{ const D=G.finaleBoss.debug; G.step(1/30,300); return {ok:D.roots.some(r=>r.grow>.15),grow:D.roots.map(r=>+r.grow.toFixed(2))}; })()"""),
 ("shot:tendrils", "SHOT tendrils 'const L=G.world.lighthouse; G.player.teleport(L.x-12,42,L.z+4,Math.atan2(12,-4)); G.step(1/30,4); T.camAt([L.x-30,50,L.z+6],[L.x,55,L.z])'"),
 ("gutter", r"""(()=>{ const D=G.finaleBoss.debug, B=D.B, r=D.roots[0]; r.delay=0; r.grow=.999; G.step(1/30,6); const g=B.gutterT;
   let solidSeen=false; for(let i=0;i<150;i++){ G.step(1/30,1); if(B.solidT>0)solidSeen=true; }
   return {ok:g>5&&!solidSeen&&r.grow<.2&&T.ev.some(e=>e[0]==='gloaming:gutter'),gutterT:+g.toFixed(2),solidSeen,grow:+r.grow.toFixed(2)}; })()"""),
 ("cutRoots", r"""(()=>{ const D=G.finaleBoss.debug, B=D.B; let cuts=0;
   for(const r of D.roots){ for(let k=0;k<2;k++){ G.combat.strike({x:r.pos.x+1,y:r.pos.y+.8,z:r.pos.z,radius:1,team:'player',damage:2,kind:'melee'}); G.step(1/30,4); } if(r.cut)cuts++; }
   G.step(1/30,2); return {ok:cuts===3&&B.staggerT>4&&G.finaleBoss.solid,cuts,staggerT:+B.staggerT.toFixed(2)}; })()"""),
 ("staggerHit", r"""(()=>{ const B=T.B(); T.near(); const hp=B.hp; T.strikeBoss(2); return {ok:B.hp<hp,hp,after:+B.hp.toFixed(2)}; })()"""),
 ("drawCalls", r"""new Promise(res=>{ const r=G.renderer, D=G.finaleBoss.debug; T.near();
   const measure=cb=>{ G.headless&&G.headless.draw(12); let n=0; requestAnimationFrame(function f(){ if(n===0){ r.info.autoReset=false; r.info.reset(); } if(++n<=8)return requestAnimationFrame(f);
     const c=Math.round(r.info.render.calls/8); r.info.autoReset=true; cb(c); }); };
   measure(withBoss=>{ D.setVisible(false); measure(without=>{ D.setVisible(true); G.step(1/30,2); res({ok:withBoss-without<=30,total:withBoss,gloaming:withBoss-without}); }); }); })"""),
 ("death", r"""(()=>{ T.god(false); const D=G.finaleBoss.debug, B=D.B; G.player.hurt({damage:99,kind:'melee',dir:new G.THREE.Vector3(1,0,0),knockback:0,ignoreIframes:true}); G.step(1/30,20);
   return {ok:G.state.mode==='dead'&&!G.player.alive,mode:G.state.mode,bossState:B.state}; })()"""),
 ("shot:death", "SHOT death 'G.step(1/30,30); const p=G.player.pos; T.camAt([p.x+5,p.y+4,p.z+5],[p.x,p.y+.5,p.z])'"),
 ("reset", r"""(()=>{ const D=G.finaleBoss.debug, B=D.B; const card=!document.getElementById('dead').hidden; document.getElementById('rise').click(); G.step(1/30,3);
   const st={state:B.state,hp:B.hp,phase:B.phase,roots:D.roots.filter(r=>r.active).length,hollows:D.hollows.filter(m=>m.alive).length,bar:T.lastBar,card,mode:G.state.mode};
   T.until(()=>B.state==='intro',200); const again=B.state;
   return {ok:st.state==='idle'&&st.hp===G.finaleBoss.maxHp&&st.phase===1&&st.roots===0&&st.hollows===0&&st.bar===null&&st.mode==='play'&&again==='intro',st,again}; })()"""),
 ("defeat", r"""(()=>{ const D=G.finaleBoss.debug, B=D.B; T.god(true); T.until(()=>B.state==='fight',400); T.suppressStag();
   D.setHp(2); T.until(()=>G.finaleBoss.solid,400); T.near(); T.strikeBoss(3); const dying=B.state; G.step(1/30,40); const s1=B.state;
   return {ok:dying==='dying',dying,s1,phase:B.phase}; })()"""),
 ("shot:dissolve", "SHOT dissolve 'G.step(1/30,10); T.view(16,.3,3,9)'"),
 ("bossDead", r"""(()=>{ const B=T.B(); T.until(()=>B.state==='dead',300); const ev=T.ev.filter(e=>e[0]==='boss:dead');
   return {ok:B.state==='dead'&&ev.length===1&&ev[0][1]==='gloaming'&&T.lastBar===null&&document.getElementById('boss').hidden,ev,bar:T.lastBar,defeated:G.finaleBoss.defeated}; })()"""),
 ("noRestart", r"""(()=>{ G.emit('finale:start'); G.step(1/30,10); T.suppressStag(); return {ok:!G.finaleBoss.active,state:T.B().state}; })()"""),
]

async def main():
    t0=time.time(); errs=[]; ok=True; res={}
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await b.new_page(viewport={'width':960,'height':600})
        pg.on('pageerror',lambda e:errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m:errs.append('console: '+m.text) if m.type=='error' and '404' not in m.text else None)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
        await pg.evaluate(HELP)
        await pg.evaluate('G.headless&&(G.headless.hold=true); 0')   # only G.step() moves the game: nothing drifts between checks by however fast the machine is
        for name,js in STEPS:
            try:
                if js.startswith('SHOT'):
                    _,tag,code=js.split(' ',2); code=code.strip("'")
                    await pg.evaluate(f"(()=>{{ {code}; G.headless&&G.headless.draw(3); }})()"); await pg.wait_for_timeout(400)
                    path=f'{OUT}/{tag}.png'; await pg.screenshot(path=path); await pg.evaluate('T.camOff()'); print(f'shot {name:14s} {path}'); continue
                r=await asyncio.wait_for(pg.evaluate(js),CHECK_S); good=bool(r.get('ok')) if isinstance(r,dict) else bool(r)
                ok=ok and good; print(f"{'ok  ' if good else 'FAIL'} {name:14s} {json.dumps(r)[:400 if good else 4000]}")
            except asyncio.TimeoutError:   # the page is stuck in a loop: say so and stop, rather than wait out the CI job's timeout
                print(f'FAIL {name:14s} timed out after {CHECK_S:.0f}s, the page is stuck; stopping here'); print('FAIL', f'{time.time()-t0:.0f}s'); sys.stdout.flush(); os._exit(1)
            except Exception as e: ok=False; print(f'FAIL {name:14s} {str(e)[:300]}')
        ev=await pg.evaluate('JSON.stringify(T.ev.slice(-30))'); print('events',ev[:900])
        await b.close()
    for e in errs[:10]: print('  ',e[:300])
    ok=ok and not errs
    print(('PASS' if ok else 'FAIL'), f'{time.time()-t0:.0f}s'); sys.exit(0 if ok else 1)
asyncio.run(main())

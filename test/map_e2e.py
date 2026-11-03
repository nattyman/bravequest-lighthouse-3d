"""The world map (js/map.js) end-to-end test.
Covers: open/close with M, Esc, the pause card's Map button and a (faked) controller's View/B buttons; the game is paused while
it's open; discovery grows as the player moves; markers stay hidden under clouds and appear once charted; the objective pin
follows G.quest.target; discovery survives save -> reload -> Continue; an old save with no map data gets retroactive
discovery from its quest progress; the map's draw calls stay under budget; no page errors. Screenshots in /tmp/claude-0/map/.
Pointer lock is stubbed out (see HELP): headless Chrome's async lock/unlock otherwise re-pauses the game between steps.
usage: python3 test/map_e2e.py [url]   (default http://localhost:8950/dev.html?debug&headless)
"""
import asyncio, sys, time, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8950/dev.html?debug&headless'
OUT='/tmp/claude-0/map'; os.makedirs(OUT,exist_ok=True)
BUDGET=150

HELP=r"""(()=>{ window.T={};
  // headless Chrome grants and drops pointer lock asynchronously; a late "unlock" lands while playing and flow.js pauses.
  // The map's own logic doesn't depend on it, so the suite runs without pointer lock.
  G.input.lockPointer=()=>{}; G.input.unlockPointer=()=>{}; try{ document.exitPointerLock&&document.exitPointerLock(); }catch(_){}
  T.st=id=>G.map.debug.state(id);
  T.tp=(x,z)=>{ G.player.teleport(x,G.world.height(x,z)+.2,z,0); G.step(1/30,12); };
  // a fake standard-mapping controller (core and the map both read navigator.getGamepads)
  T.pad={id:'Fake Xbox controller',index:0,connected:true,mapping:'standard',timestamp:0,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
  T.padOn=()=>{ navigator.getGamepads=()=>[T.pad]; };
  T.btn=(i,on)=>{ T.pad.buttons[i]={pressed:!!on,touched:!!on,value:on?1:0}; T.pad.timestamp++; };
  T.press=(i)=>{ T.btn(i,true); G.step(1/30,2); T.btn(i,false); G.step(1/30,2); };
  // draw calls while open: average over n drawn frames (bloom passes included)
  T.calls=(n)=>new Promise(res=>{ const r=G.renderer; G.headless&&G.headless.draw(n+4); let k=0;
    requestAnimationFrame(function f(){ if(k===0){ r.info.autoReset=false; r.info.reset(); } if(++k<=n)return requestAnimationFrame(f);
      const c=Math.round(r.info.render.calls/n), t=Math.round(r.info.render.triangles/n); r.info.autoReset=true; res({calls:c,tris:t}); }); });
  return true; })()"""

FRESH=[
 ("boot", "[!!window.G, !!G.map, G.persist.keys.includes('map')]"),
 ("begin", r"""(()=>{ document.getElementById('begin').click(); G.step(1/30,30);
   return {ok:G.state.mode==='play'&&G.map.debug.cells>0&&G.map.percent()<30,cells:G.map.debug.cells,pct:G.map.percent(),
     start:G.map.discovered(164,-4),hamlet:G.map.discovered(-20,30)}; })()"""),
 ("keyOpen", "KEY m", r"""(()=>{ G.step(1/30,2); return {ok:G.map.isOpen&&G.state.mode==='paused'&&!document.getElementById('mapUI').hidden&&document.getElementById('pause').hidden,
   mode:G.state.mode,open:G.map.isOpen,buildMs:G.map.debug.buildMs}; })()"""),
 ("paused", r"""(async()=>{ const p=G.player.pos.clone(), t=G.time; G.input.setVirtual('forward',true); await new Promise(r=>setTimeout(r,900));
   G.step(1/30,20); G.input.setVirtual('forward',false); const moved=p.distanceTo(G.player.pos);
   return {ok:moved<1e-3&&Math.abs(G.time-t-20/30)<.01&&G.state.mode==='paused',moved,dtime:+(G.time-t).toFixed(3)}; })()"""),
 ("shot:fresh", "SHOT fresh 'G.step(1/30,40)'"),
 ("hiddenUnderCloud", r"""(()=>{ G.step(1/30,2); const h=T.st('hamlet'), s=T.st('stones'), r=T.st('resisting'), w=T.st('blight:well'), lh=T.st('lighthouse'), me=T.st('player');
   return {ok:!h.shown&&!s.shown&&!r.shown&&(!w||!w.shown)&&lh.shown&&me.shown,hamlet:h.shown,stones:s.shown,tree:r.shown,well:w&&w.shown,lighthouse:lh.shown,player:me.shown}; })()"""),
 ("keyClose", "KEY m", r"""(()=>{ G.step(1/30,3); return {ok:!G.map.isOpen&&G.state.mode==='play'&&document.getElementById('mapUI').hidden,mode:G.state.mode}; })()"""),
 ("escClose", "KEY m", "KEY Escape", r"""(()=>{ G.step(1/30,6); return {ok:!G.map.isOpen&&G.state.mode==='play'&&document.getElementById('pause').hidden,mode:G.state.mode,pauseCard:!document.getElementById('pause').hidden}; })()"""),
 ("pauseButton", "KEY Escape", r"""(async()=>{ G.step(1/30,2); const card=!document.getElementById('pause').hidden; const b=document.getElementById('mapOpen');
   b.click(); G.step(1/30,2); const open=G.map.isOpen&&document.getElementById('pause').hidden&&G.state.mode==='paused';
   document.querySelector('#mapUI [data-mp=close]').click(); G.step(1/30,2);
   const back=!G.map.isOpen&&!document.getElementById('pause').hidden&&G.state.mode==='paused';
   document.getElementById('resume').click(); G.step(1/30,2);
   return {ok:card&&!!b&&open&&back&&G.state.mode==='play',card,open,back,mode:G.state.mode}; })()"""),
 ("controller", r"""(()=>{ T.padOn(); G.step(1/30,4); T.press(8); window.C={open:G.map.isOpen&&G.state.mode==='paused'&&document.getElementById('pause').hidden};
   G.step(1/30,10); C.stayed=G.map.isOpen&&G.state.mode==='paused'; return true; })()""", "WAIT 400", "(()=>{ T.press(1); return true; })()", "WAIT 400",
   r"""(()=>{ G.step(1/30,2); C.closedB=!G.map.isOpen&&G.state.mode==='play'&&document.getElementById('pause').hidden;
   G.step(1/30,6); T.press(8); C.again=G.map.isOpen; return true; })()""", "WAIT 600",
   r"""(()=>{ T.press(8); return true; })()""", "WAIT 400",
   r"""(()=>{ G.step(1/30,2); C.closedView=!G.map.isOpen&&G.state.mode==='play';
   T.press(9); C.menuPauses=G.state.mode==='paused'&&!document.getElementById('pause').hidden&&!G.map.isOpen;
   document.getElementById('resume').click(); G.step(1/30,2);
   C.help=[...document.querySelectorAll('#keys span, [data-pad-legend] span')].some(s=>/map/.test(s.textContent));
   C.ok=C.open&&C.stayed&&C.closedB&&C.again&&C.closedView&&C.menuPauses&&C.help; return C; })()"""),
 ("discovery", r"""(()=>{ const c0=G.map.debug.cells; const h=G.world.landmarks.hamlet; T.tp(h.x+6,h.z); const c1=G.map.debug.cells;
   T.tp(40,-30); T.tp(-120,0); const c2=G.map.debug.cells;
   return {ok:c1>c0&&c2>c1&&G.map.discovered(-20,30)&&G.map.discovered(40,-35)&&!G.map.discovered(-215,-90),c0,c1,c2,pct:G.map.percent()}; })()"""),
 ("lampRadius", r"""(()=>{ const c0=G.map.debug.cells, lh=G.world.lighthouse; G.player.teleport(lh.x+1,lh.topY+.3,lh.z+1,0); G.step(1/30,10);
   const c1=G.map.debug.cells; return {ok:c1-c0>200&&G.map.discovered(60,0),gained:c1-c0}; })()"""),
 ("markersShown", r"""(()=>{ T.tp(150,0); G.map.open(); G.step(1/30,50); const h=T.st('hamlet'), s=T.st('stones');
   const ok=h.shown&&s.shown&&!!h.mesh===false; return {ok:h.shown&&s.shown,hamlet:h,stones:s.shown}; })()"""),
 ("objectivePin", r"""(()=>{ const V=G.THREE.Vector3; G.quest.target=new V(40,G.world.height(40,-35),-35); G.quest.targetName='Standing stones'; G.step(1/30,3);
   const a=T.st('objective'); G.quest.target=new V(-20,G.world.height(-20,30),30); G.step(1/30,3); const b=T.st('objective');
   const lbl=document.querySelector('#mapUI .mp-label.obj'); const hidden=(()=>{ G.quest.target=null; G.step(1/30,2); return !T.st('objective').shown; })();
   return {ok:a.shown&&Math.abs(a.mesh[0]-4)<.01&&Math.abs(a.mesh[1]+3.5)<.01&&Math.abs(b.mesh[0]+2)<.01&&Math.abs(b.mesh[1]-3)<.01&&hidden&&/Standing stones|Objective/.test(lbl.textContent),
     a:a.mesh,b:b.mesh,hidden,label:lbl.textContent}; })()"""),
 ("closeAndSave", r"""(()=>{ G.map.close(); G.step(1/30,4); const ok=G.flow.writeSave(); const d=G.flow.readSave(); window.__cells=G.map.debug.cells;
   localStorage.setItem('mapTestCells',String(G.map.debug.cells));
   return {ok:ok&&!!(d&&d.mods&&d.mods.map&&d.mods.map.bits),cells:G.map.debug.cells,bytes:d&&d.mods.map.bits.length}; })()"""),
]
AFTER_RELOAD=[
 ("continue", r"""(()=>{ const want=+localStorage.getItem('mapTestCells'); document.getElementById('continue').click(); G.step(1/30,20);
   return {ok:G.state.mode==='play'&&G.map.debug.cells>=want&&G.map.discovered(-20,30)&&G.map.discovered(40,-35),cells:G.map.debug.cells,want}; })()"""),
 ("oldSave", "RELOAD", r"""(()=>{ const d=G.flow.readSave(); delete d.mods.map; d.step='done'; d.objective='Explore the island'; d.sub=''; d.lampCured=true; d.bossDead=true; d.loop=true;
   d.storm={found:true,carried:false,inCradle:false,failed:true,spent:true,pos:null}; d.lantern={found:true,carried:true,shut:false,cured:true,inCradle:false,pos:null}; d.stagDead=true; d.quiet=true;
   const lh=G.world.lighthouse; d.pos=[lh.doorOut.x,lh.doorOut.y,lh.doorOut.z]; d.target=null; d.mods.caveBoss={v:1,pages:[],defeated:false,discovered:true,hal:false,entered:false,bossSeen:false,said:[]};
   G.flow.begin(d); if(G.devtools&&G.devtools.cheats)G.devtools.cheats.god=true; G.step(1/30,10); const rt=G.world.landmarks.resistingTree, cm=G.world.landmarks.caveMouth;
   return {ok:G.map.percent()>35&&G.map.discovered(-20,30)&&G.map.discovered(rt.x,rt.z)&&G.map.discovered(110,-20)&&G.map.discovered(cm.x,cm.z)&&!G.map.discovered(-200,-95),
     pct:G.map.percent(),cells:G.map.debug.cells,tree:G.map.discovered(rt.x,rt.z),cave:G.map.discovered(cm.x,cm.z)}; })()"""),
 ("caveAndBlights", r"""(()=>{ G.map.open(); G.step(1/30,40); const c=T.st('cave'), w=T.st('blight:well');
   const b=G.blights.find(b=>b.id==='well'); const cured0=w&&w.shown; if(b)b.cured=true; G.step(1/30,2); const curedMesh=G.map.markers.find(m=>m.id==='blight:well').curedMesh.visible; if(b)b.cured=false; G.step(1/30,2);
   const benches=G.map.markers.filter(m=>m.kind==='bench'&&m.shownNow).length;
   return {ok:c.shown&&cured0&&curedMesh&&benches>=1,cave:c.shown,well:cured0,glowcap:curedMesh,benches}; })()""", "WAIT 500",
   "(()=>{ G.map.close(); G.step(1/30,2); return true; })()", "WAIT 500",
   "(()=>{ G.step(1/30,1); return {ok:G.state.mode==='play'&&document.getElementById('pause').hidden,mode:G.state.mode}; })()"),
 ("shot:mid", "SHOT mid 'T.tp(-150,-40); T.tp(-60,-55); G.map.open(); window.__rolling=G.map.debug.revealing; G.map.view.tdist=46; G.map.view.tx=1; G.map.view.tz=1; G.step(1/30,4)' 250"),
 ("rollBack", r"""(()=>({ok:window.__rolling===true,rolling:window.__rolling}))()"""),
 ("shot:mid-settled", "SHOT mid-settled 'G.step(1/30,60)'"),
 ("drawCallsMid", "CALLS"),
 ("shot:full", "SHOT full 'G.map.revealAll(); G.map.view.tdist=58; G.map.view.tx=0; G.map.view.tz=0; G.step(1/30,60)'"),
 ("drawCallsFull", "CALLS"),
 ("shot:lighthouse", "SHOT lighthouse 'const lh=G.world.lighthouse; G.player.teleport(lh.doorOut.x-2.5,42,lh.doorOut.z+1,-Math.PI/2); G.map.view.tx=lh.x*.1-1.6; G.map.view.tz=lh.z*.1+1.4; G.map.view.tdist=17; G.map.view.tpitch=.66; G.step(1/30,80)'"),
 ("legend", r"""(()=>{ const b=document.querySelector('#mapUI [data-mp=legend]'); b.click(); const on=!document.querySelector('#mapUI .mp-legend').hidden; b.click();
   return {ok:on&&document.querySelector('#mapUI .mp-legend').hidden,on}; })()"""),
 ("hook", r"""(()=>{ let vis=false; const r=G.map.addMarker({id:'testShard',kind:'heart',label:'Heart Shard',pos:{x:-20,z:30},visible:()=>vis}); G.step(1/30,2); const a=T.st('testShard').shown;
   vis=true; G.step(1/30,2); const b=T.st('testShard').shown; G.map.removeMarker('testShard'); G.step(1/30,2);
   const wp=G.map.addMarker({id:'wpTest',kind:'waypoint',label:'Waypoint',pos:{x:150,z:0},travel:true}); const tt=G.map.travelTargets().some(m=>m.id==='wpTest'); G.map.removeMarker('wpTest');
   return {ok:!a&&b&&!T.st('testShard')&&tt,before:a,after:b,travel:tt}; })()"""),
 ("closeEnd", r"""(()=>{ G.map.close(); G.step(1/30,4); return {ok:G.state.mode==='play'&&!G.map.isOpen,mode:G.state.mode,open:G.map.isOpen}; })()"""),
]

async def run_steps(pg, steps, res):
    ok=True
    for st in steps:
        name=st[0]; parts=st[1:]
        try:
            r=None; bad=[]
            for js in parts:
                if js.startswith('WAIT '):
                    await pg.wait_for_timeout(int(js[5:])); continue
                if js.startswith('KEY '):
                    await pg.keyboard.press(js[4:]); await pg.wait_for_timeout(120); continue
                if js=='RELOAD':
                    await pg.reload(timeout=180000); await pg.wait_for_timeout(5000); await pg.evaluate(HELP); continue
                if js=='CALLS':
                    r=await pg.evaluate('T.calls(8)'); r['ok']=r['calls']<=BUDGET; r['budget']=BUDGET; continue
                if js.startswith('SHOT'):
                    bits=js.split("'"); tag=bits[0].split()[1]; code=bits[1]; wait=int(bits[2].strip()) if len(bits)>2 and bits[2].strip() else 1600
                    await pg.evaluate(f"(()=>{{ {code}; G.headless&&G.headless.draw(4); }})()"); await pg.wait_for_timeout(wait)
                    path=f'{OUT}/{tag}.png'; await pg.screenshot(path=path); print(f'shot {name:16s} {path}'); r='shot'; continue
                r=await pg.evaluate(js)
                if isinstance(r,dict) and 'ok' in r and not r['ok']: bad.append(r)
            if r=='shot': continue
            good=(bool(r.get('ok')) if isinstance(r,dict) else bool(r)) and not bad
            if bad and r is not bad[-1]: r={'ok':False,'failed':bad,'last':r}
            res[name]=r; ok=ok and good; print(f"{'ok  ' if good else 'FAIL'} {name:16s} {json.dumps(r)[:420]}")
        except Exception as e: ok=False; print(f'FAIL {name:16s} {str(e)[:300]}')
    return ok

async def main():
    t0=time.time(); errs=[]; ok=True; res={}
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx=await b.new_context(viewport={'width':1280,'height':800})
        pg=await ctx.new_page()
        pg.on('pageerror',lambda e:errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m:errs.append('console: '+m.text) if m.type=='error' and '404' not in m.text else None)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
        await pg.evaluate(HELP)
        ok=await run_steps(pg,FRESH,res) and ok
        await pg.reload(timeout=180000); await pg.wait_for_timeout(5000); await pg.evaluate(HELP)
        ok=await run_steps(pg,AFTER_RELOAD,res) and ok
        await ctx.close()
        # a phone: touch, portrait (the map icon beside the pause button)
        ctx=await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        pg=await ctx.new_page()
        pg.on('pageerror',lambda e:errs.append('pageerror(phone): '+str(e)))
        pg.on('console',lambda m:errs.append('console(phone): '+m.text) if m.type=='error' and '404' not in m.text else None)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000); await pg.evaluate(HELP)
        ok=await run_steps(pg,[
          ("phoneIcon", r"""(()=>{ document.getElementById('begin').click(); G.step(1/30,20); const b=document.getElementById('mapBtn'); const vis=!!b&&getComputedStyle(b).display!=='none'&&!b.hidden;
             b.click(); G.step(1/30,30); return {ok:vis&&G.map.isOpen&&G.isMobile,vis,open:G.map.isOpen,mobile:G.isMobile,hint:document.querySelector('#mapUI .mp-hints').textContent}; })()"""),
          ("shot:phone", "SHOT phone 'G.step(1/30,40)'"),
          ("phoneClose", r"""(()=>{ document.querySelector('#mapUI [data-mp=close]').click(); G.step(1/30,3); return {ok:!G.map.isOpen&&G.state.mode==='play'}; })()"""),
        ],res) and ok
        await b.close()
    for e in errs[:10]: print('  ',e[:300])
    ok=ok and not errs
    print(('PASS' if ok else 'FAIL'), f'{time.time()-t0:.0f}s'); sys.exit(0 if ok else 1)
asyncio.run(main())

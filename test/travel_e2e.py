"""Fast travel, map collectibles and the 2-heart start (js/map.js sections 11-12, js/progression.js BASE_HP).
Covers: a new game starts at 2 hearts (HUD + journal) and shards grow it (4 -> a 3rd heart); a waystone unlocks when you walk
up to it (caption, "new" on the chart) and survives save -> reload -> Continue; travel by mouse click on the chart, by the
controller (RB + A + A) and by the keyboard (Tab + Enter + Enter), always through the confirm card; blocked cases (the Hollow
Stag, Maren's lantern in Act 1, a hunting monster nearby, the lantern riding the cave raft, the fog over the destination) show
a reason on the card and nothing moves; travel out of the sea cave and back into it lands on dry floor through cave.js's own
paths; Heart Shard / Keeper's Cache pins appear only once spotted, never under cloud, and fade once taken; an old (v1) save
gets its waystones from quest progress. Screenshots in /tmp/claude-0/travel/.
usage: python3 test/travel_e2e.py [url]   (default http://localhost:8990/dev.html?debug&headless)
"""
import asyncio, sys, time, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8990/dev.html?debug&headless'
OUT='/tmp/claude-0/travel'; os.makedirs(OUT,exist_ok=True)

HELP=r"""(()=>{ window.T={};
  G.input.lockPointer=()=>{}; G.input.unlockPointer=()=>{}; try{ document.exitPointerLock&&document.exitPointerLock(); }catch(_){}
  T.play=()=>{ if(G.state.mode==='paused'&&!G.map.isOpen&&!G.map.traveling){ const pc=document.getElementById('pause'); if(pc&&!pc.hidden)document.getElementById('resume').click(); else G.setMode('play'); } };
  T.tp=(x,z,y,h)=>{ T.play(); G.player.teleport(x,y==null?G.world.height(x,z)+.1:y,z,h||0); G.step(1/30,8); };
  T.clear=()=>{ for(const m of (G.monsters&&G.monsters.list||[]).slice())if(m.alive&&!m.boss)G.monsters.kill(m,{dir:new THREE.Vector3(0,0,1)}); };
  T.wp=()=>G.map.waypoints.filter(w=>w.unlocked).map(w=>w.id);
  T.pos=()=>G.player.pos.toArray().map(v=>+v.toFixed(2));
  T.st=id=>G.map.debug.state(id);
  // finish a journey (fade out, move, fade in) with game steps
  T.go=()=>{ let n=0; while(G.map.traveling&&n++<200)G.step(1/30,1); G.step(1/30,2); return !G.map.traveling; };
  T.shard=id=>{ const s=G.progress.spots.find(q=>q.id===id); T.tp(s.pos.x+.3,s.pos.z,s.pos.y-.55); G.step(1/30,6); const ok=!!G.progress.state.shards[id]; T.play(); G.step(1/30,6); G.progress.endReward(); G.step(1/30,3); return ok; };
  // standing on solid floor: the floor right under the feet, not water, not inside rock
  T.solid=()=>{ const P=G.player, f=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.3); const cv=G.cave&&G.cave.inside;
    const w=cv?G.cave.waterWorld():((G.world.tide)||0); return {floor:+f.toFixed(2),y:+P.pos.y.toFixed(2),dy:+(P.pos.y-f).toFixed(3),aboveWater:+(f-w).toFixed(2),grounded:P.grounded,
      ok:Math.abs(P.pos.y-f)<.12&&f>w+.05&&P.grounded!==false,cave:!!cv,room:cv?G.cave.room(P.pos):null}; };
  T.pad={id:'Fake Xbox controller',index:0,connected:true,mapping:'standard',timestamp:0,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
  T.padOn=()=>{ navigator.getGamepads=()=>[T.pad]; }; T.padOff=()=>{ navigator.getGamepads=()=>[]; };
  T.btn=(i,on)=>{ T.pad.buttons[i]={pressed:!!on,touched:!!on,value:on?1:0}; T.pad.timestamp++; };
  T.press=i=>{ T.btn(i,true); G.step(1/30,2); T.btn(i,false); G.step(1/30,2); };
  T.card=()=>{ const c=document.querySelector('#mapUI .mp-confirm'); return {open:!c.hidden,blocked:c.classList.contains('blocked'),text:c.textContent.replace(/\s+/g,' ').trim(),go:!c.querySelector('[data-mp=go]').hidden}; };
  // ask for a waystone in the open map and try to travel; returns what the card said and whether anything moved
  T.tryBlocked=id=>{ const p0=G.player.pos.clone(); if(!G.map.isOpen)G.map.open(); G.step(1/30,3); G.map.ask(id); G.step(1/30,2); const card=T.card();
    // pressing Travel anyway (Enter) must not move you
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'Enter',key:'Enter',bubbles:true})); G.step(1/30,40);
    const moved=+p0.distanceTo(G.player.pos).toFixed(3), tr=G.map.traveling; return {card,moved,tr,why:G.map.travelBlock(id)}; };
  T.closeMap=()=>{ if(G.map.isOpen)G.map.close(); G.step(1/30,2); T.play(); };
  return true; })()"""

FRESH=[
 ("boot", "[!!window.G, !!G.map, !!G.map.travel, G.persist.keys.includes('map')]"),
 ("twoHearts", r"""(()=>{ document.getElementById('begin').click(); G.step(1/30,30); T.clear();
   const j=G.progress.journal.data(); return {ok:G.player.maxHp===4&&G.player.hp===4&&document.getElementById('hearts').children.length===2&&j.hearts===2&&T.wp().join()==='lighthouse',
     hp:G.player.hp,max:G.player.maxHp,hud:document.getElementById('hearts').children.length,label:document.getElementById('hearts').getAttribute('aria-label'),journal:j.hearts,wp:T.wp()}; })()"""),
 ("shot:hud", "SHOT hud-2hearts 'G.step(1/30,10)'"),
 ("unlockCottage", r"""(()=>{ const c=G.world.landmarks.cottageDoor; T.tp(c.x-1.6,c.z-2.4); G.step(1/30,12);
   const w=G.map.waypoints.find(w=>w.id==='cottage'), msg=G.ui.messages().map(m=>m.text).filter(t=>/waystone/.test(t));
   return {ok:w.unlocked&&w.isNew&&msg.length===1&&/Keeper’s Cottage/.test(msg[0])&&/map/.test(msg[0]),w,msg}; })()"""),
 ("unlockMore", r"""(()=>{ T.tp(94,11); T.tp(32,-40); T.clear(); T.tp(6,16,null,Math.PI); T.clear(); const msgs=G.ui.messages().map(m=>m.text).filter(t=>/waystone/.test(t));
   return {ok:['cliffpath','stones','hamlet'].every(id=>T.wp().includes(id))&&!T.wp().includes('tree')&&msgs.length===4,wp:T.wp(),n:msgs.length,last:msgs[msgs.length-1]}; })()"""),
 # collectibles: a shard you've never been near stays off the chart even where the island is charted; near it -> a pin; taken -> faded
 ("notSeenYet", r"""(()=>{ G.map.reveal(-29,42,30); G.map.reveal(96,20,20); G.map.open(); G.step(1/30,20); const a=T.st('shard:attic'), c=T.st('cache:ramp');
   const seen=Object.keys(G.map.debug.seen); T.closeMap(); return {ok:!!a&&!a.shown&&!!c&&!c.shown&&!seen.includes('shard:attic'),attic:a&&a.shown,ramp:c&&c.shown,seen}; })()"""),
 ("spotShard", r"""(()=>{ const s=G.progress.spots.find(q=>q.id==='attic'); T.tp(s.pos.x+6,s.pos.z+5); T.clear(); G.step(1/30,10);
   G.map.open(); G.step(1/30,20); const a=T.st('shard:attic'); const lbl=G.map.markers.find(m=>m.id==='shard:attic').el.textContent; T.closeMap();
   return {ok:a.shown&&!G.progress.state.shards.attic&&lbl==='Heart Shard',shown:a.shown,lbl}; })()"""),
 ("spotCache", r"""(()=>{ const c=G.progress.caches.find(q=>q.id==='ramp'); T.tp(c.pos.x-5,c.pos.z-4); T.clear(); G.step(1/30,10);
   G.map.open(); G.step(1/30,20); const r=T.st('cache:ramp'); T.closeMap(); return {ok:r.shown,shown:r.shown}; })()"""),
 ("underCloud", r"""(()=>{ G.map.debug.seen['shard:west']=1; const und=!G.map.discovered(-231,-4); G.map.open(); G.step(1/30,20); const w=T.st('shard:west'); T.closeMap();
   return {ok:und&&!w.shown,underCloud:und,shown:w.shown}; })()"""),
 ("collectGrows", r"""(()=>{ G.progress.debug.noSweep=true; const got=['attic','needle','outcrop','hounds'].map(T.shard); T.clear();
   const c=G.progress.caches.find(q=>q.id==='ramp'); T.tp(c.pos.x-1.2,c.pos.z); const ia=G.interact.pick(G.player.pos); ia&&ia.use(); G.step(1/30,20); G.progress.endReward(); G.step(1/30,4);
   G.map.open(); G.step(1/30,20); const A=G.map.markers.find(m=>m.id==='shard:attic'), R=G.map.markers.find(m=>m.id==='cache:ramp');
   const out={got,maxHp:G.player.maxHp,hud:document.getElementById('hearts').children.length,attic:{shown:A.shownNow,lbl:A.el.textContent,dim:A.mesh.material!==A.baseMat},
     ramp:{shown:R.shownNow,lbl:R.el.textContent,dim:R.mesh.material!==R.baseMat},cache:!!G.progress.state.caches.ramp};
   out.ok=got.every(Boolean)&&out.maxHp===6&&out.hud===3&&out.attic.shown&&out.attic.dim&&/taken/.test(out.attic.lbl)&&out.ramp.shown&&out.ramp.dim&&/opened/.test(out.ramp.lbl); T.closeMap(); return out; })()"""),
 # travel by a mouse click on the chart: the waystone -> the card -> Travel
 ("clickTravel", r"""(()=>{ T.tp(150,-25); T.clear(); G.map.open(); const v=G.map.view; const p=G.map.markers.find(m=>m.id==='wp:hamlet').pos; v.tx=p.x*.1; v.tz=p.z*.1; v.tdist=26; G.step(1/30,40);
   window.__wp=T.st('wp:hamlet'); return {ok:__wp.shown&&__wp.screen.on,screen:__wp.screen}; })()"""),
 ("clickTravel2", "CLICKWP hamlet", r"""(()=>{ G.step(1/30,2); return {ok:G.map.confirming==='hamlet'&&T.card().open&&!T.card().blocked&&/Travel to The Hamlet Road\?/.test(T.card().text),card:T.card(),conf:G.map.confirming}; })()"""),
 ("shot:confirm", "SHOT confirm 'G.step(1/30,4)'"),
 ("clickTravel3", "CLICKSEL [data-mp=go]", r"""(()=>{ const mid={tr:G.map.traveling,mode:G.state.mode,fade:document.getElementById('fade').style.opacity}; const done=T.go(); const s=G.map.debug.standFor('hamlet');
   const out={mid,done,pos:T.pos(),mode:G.state.mode,ctl:G.player.inputEnabled,open:G.map.isOpen,fade:document.getElementById('fade').style.opacity,solid:T.solid(),d:+Math.hypot(G.player.pos.x-s.x,G.player.pos.z-s.z).toFixed(2),
     heading:+G.player.heading.toFixed(2),cam:+G.player.camYaw.toFixed(2)};
   out.ok=mid.tr&&mid.mode==='paused'&&mid.fade==='1'&&done&&out.d<.3&&out.mode==='play'&&out.ctl&&!out.open&&out.fade==='0'&&out.solid.ok&&Math.abs(out.heading-(-1.08))<.05; return out; })()"""),
 ("shot:arrived", "SHOT arrived 'G.step(1/30,10)'"),
 # the controller: View opens the map, RB picks a waystone, A asks, A travels
 ("padTravel", r"""(()=>{ T.clear(); T.padOn(); G.step(1/30,3); T.press(8); const open=G.map.isOpen; T.press(5); const sel=G.map.selected; G.step(1/30,10); T.press(0); const ask=G.map.confirming;
   const card=T.card(); window.__padSel=sel; return {ok:open&&!!sel&&ask===sel&&card.open&&!card.blocked,open,sel,ask,card}; })()""", "WAIT 300",
   r"""(()=>{ const before=T.pos(); T.press(0); const done=T.go(); const s=G.map.debug.standFor(__padSel)||{x:0,z:0}; const sel=__padSel; T.padOff(); G.step(1/30,2);
   const d=sel==='cave'?0:Math.hypot(G.player.pos.x-s.x,G.player.pos.z-s.z); return {ok:done&&d<.3&&!G.map.isOpen&&G.state.mode==='play'&&T.solid().ok,sel,before,pos:T.pos(),d:+d.toFixed(2)}; })()"""),
 ("padCancel", r"""(()=>{ T.padOn(); G.step(1/30,3); T.press(8); T.press(5); T.press(0); const ask=!!G.map.confirming; const p0=T.pos(); T.press(1); const still=G.map.isOpen&&!G.map.confirming; G.step(1/30,40);
   const moved=Math.hypot(T.pos()[0]-p0[0],T.pos()[2]-p0[2]); T.press(8); T.padOff(); G.step(1/30,2); return {ok:ask&&still&&moved<.01&&!G.map.isOpen,ask,still,moved}; })()"""),
 # the keyboard: Tab to a waystone, Enter asks, Enter travels
 ("keyTravel", "KEY m", r"""(()=>{ G.step(1/30,2); return {ok:G.map.isOpen}; })()""", "KEY Tab", "KEY Tab",
   r"""(()=>{ G.step(1/30,4); window.__ksel=G.map.selected; return {ok:!!__ksel,sel:__ksel}; })()""", "KEY Enter",
   r"""(()=>{ G.step(1/30,2); return {ok:G.map.confirming===__ksel,conf:G.map.confirming}; })()""", "KEY Enter",
   r"""(()=>{ const done=T.go(); const s=G.map.debug.standFor(__ksel); const d=Math.hypot(G.player.pos.x-s.x,G.player.pos.z-s.z); return {ok:done&&d<.3&&T.solid().ok,sel:__ksel,d:+d.toFixed(2)}; })()"""),
 ("escCancels", "KEY m", r"""(()=>{ G.step(1/30,2); G.map.ask('lighthouse'); G.step(1/30,2); return {ok:!!G.map.confirming}; })()""", "KEY Escape",
   r"""(()=>{ G.step(1/30,2); const ok=G.map.isOpen&&!G.map.confirming; T.closeMap(); return {ok,open:G.map.isOpen}; })()"""),
 # blocked: a hunting monster, the Hollow Stag (and its tree), Maren's lantern carried in Act 1 -- a reason, and nothing moves
 ("blockAggro", r"""(()=>{ T.tp(150,-20); T.clear(); const m=G.monsters.spawn('hollow',new THREE.Vector3(156,42,-20),{aggro:true}); G.step(1/30,30);
   const r=T.tryBlocked('cottage'); const st=m.state; window.__agg=m; return Object.assign(r,{state:st,ok:r.card.open&&r.card.blocked&&!r.card.go&&/hunting/.test(r.card.text)&&r.moved<.01&&!r.tr}); })()"""),
 ("shot:blocked", "SHOT blocked 'G.step(1/30,4)'"),
 ("blockAggro2", r"""(()=>{ T.closeMap(); G.monsters.kill(__agg,{dir:new THREE.Vector3(0,0,1)}); T.clear(); G.step(1/30,30); const why=G.map.travelBlock('cottage'); return {ok:why===null,why}; })()"""),
 ("blockStag", r"""(()=>{ const e=G.flow.stagEdge(); T.tp(e.x,e.z); T.clear(); G.map.debug.unlock('tree',{quiet:true}); const towards=G.map.travelBlock('tree'); G.monsters.startStag(); G.step(1/30,30);
   const r=T.tryBlocked('lighthouse'); T.closeMap(); const B=G.monsters.boss; return Object.assign(r,{towards,boss:!!B,ok:!!B&&/Stag/.test(r.card.text)&&r.moved<.01&&/Stag/.test(towards||'')}); })()"""),
 ("blockLantern", r"""(()=>{ const B=G.monsters.boss; if(B)G.monsters.kill(B,{dir:new THREE.Vector3(0,0,1)}); G.step(1/30,60); T.tp(-20,-60); T.clear(); const L=G.items.lantern; L.found=true; L.carried=true; L.cured=false; G.step(1/30,5);
   const r=T.tryBlocked('cottage'); T.closeMap(); L.carried=false; L.found=false; G.step(1/30,3); return Object.assign(r,{ok:/Maren’s lantern/.test(r.card.text)&&r.moved<.01&&!r.tr}); })()"""),
 ("save", r"""(()=>{ T.clear(); G.step(1/30,4); const ok=G.flow.writeSave(); const d=G.flow.readSave(); localStorage.setItem('travelWp',JSON.stringify(T.wp()));
   localStorage.setItem('travelSeen',JSON.stringify(Object.keys(G.map.debug.seen))); return {ok:ok&&d.mods.map.v===2&&d.mods.map.wp.length>=5,wp:d.mods.map.wp,seen:d.mods.map.seen,maxHp:G.player.maxHp}; })()"""),
]

AFTER_RELOAD=[
 ("continue", r"""(()=>{ const want=JSON.parse(localStorage.getItem('travelWp')), seen=JSON.parse(localStorage.getItem('travelSeen')); document.getElementById('continue').click(); G.step(1/30,20);
   const have=T.wp(), s=Object.keys(G.map.debug.seen); return {ok:want.every(id=>have.includes(id))&&seen.every(k=>s.includes(k))&&G.player.maxHp===6&&document.getElementById('hearts').children.length===3,want,have,seen:s.length,maxHp:G.player.maxHp}; })()"""),
 ("oldSave", r"""(()=>{ const d=G.flow.readSave(); d.mods.map={v:1,nx:d.mods.map.nx,nz:d.mods.map.nz,bits:d.mods.map.bits,blights:[]};
   d.mods.progress.shards={stones:1}; d.step='done'; d.objective='Explore'; d.sub=''; d.lampCured=true; d.bossDead=true; d.stagDead=true; d.cloak=true; d.hp=10; d.maxHp=10; d.quiet=true;
   d.lantern={found:true,carried:false,shut:false,cured:true,inCradle:true,pos:null}; G.map.debug.resetWaypoints(); for(const k in G.map.debug.wpOn)delete G.map.debug.wpOn[k];
   G.flow.begin(d); G.step(1/30,30); const have=T.wp(), s=G.map.debug.seen;
   return {ok:['lighthouse','cottage','cliffpath','hamlet','tree','stones'].every(id=>have.includes(id))&&!have.includes('cave')&&!!s['shard:stones']&&G.player.maxHp===6&&G.player.hp===6,have,stones:!!s['shard:stones'],hp:G.player.hp,maxHp:G.player.maxHp}; })()"""),
 # the core loop and the sea cave: in and out through cave.js
 ("loop", r"""(()=>{ G.debugStartLoop(); G.step(1/30,20); T.clear(); G.lamp.ether=Math.max(G.lamp.ether,120); G.fog.radius=G.fog.targetRadius=420; G.step(1/30,5);
   G.debugEnterCave('mouth'); G.step(1/30,20); const unlocked=T.wp().includes('cave'); const msg=G.ui.messages().map(m=>m.text).filter(t=>/Sea Cave/.test(t));
   return {ok:unlocked&&G.cave.inside&&msg.length===1,unlocked,inside:G.cave.inside,msg}; })()"""),
 ("caveOut", r"""(()=>{ G.debugEnterCave('gallery'); G.step(1/30,20); T.clear(); const room0=G.cave.room(G.player.pos); const why=G.map.travelBlock('cottage');
   G.map.open(); G.step(1/30,4); G.map.ask('cottage'); G.step(1/30,2); document.querySelector('#mapUI [data-mp=go]').click(); const done=T.go(); G.step(1/30,20); const s=G.map.debug.standFor('cottage');
   return {ok:room0==='gallery'&&why===null&&done&&!G.cave.inside&&T.solid().ok&&Math.hypot(G.player.pos.x-s.x,G.player.pos.z-s.z)<.3&&G.state.checkpointName!=='the mouth of the sea cave',room0,why,inside:G.cave.inside,solid:T.solid(),cp:G.state.checkpointName}; })()"""),
 ("caveIn", r"""(()=>{ const sets=[]; for(const tide of [125,0]){ const T0=G.tide, base=Math.floor((T0.t||0)/300)*300; G.alchemy.debug.setTide(base+300+tide); G.step(1/30,3); const lvl=+G.tide.level.toFixed(2); G.map.travel('cave'); const done=T.go(); G.step(1/30,30);
     sets.push({tide:lvl,done,solid:T.solid(),inside:G.cave.inside}); G.map.travel('cottage'); T.go(); G.step(1/30,10); }
   return {ok:sets.every(s=>s.done&&s.inside&&s.solid.ok&&s.solid.room==='mouth'),sets}; })()"""),
 ("shot:cave", "SHOT cave-arrived 'G.map.travel(\"cave\"); T.go(); G.step(1/30,30)'"),
 ("blockRaft", r"""(()=>{ T.clear(); const R=G.cavePuzzles.raft; R.lantern=true; R.state='drifting'; G.step(1/30,2); const r=T.tryBlocked('cottage'); T.closeMap(); R.lantern=false; R.state='moored';
   return Object.assign(r,{ok:/raft/.test(r.card.text)&&r.moved<.01&&!r.tr&&G.cave.inside}); })()"""),
 ("blockFog", r"""(()=>{ G.map.travel('cottage'); T.go(); G.step(1/30,10); G.fog.radius=G.fog.targetRadius=60; G.step(1/30,3); const why=G.map.travelBlock('tree'), ok2=G.map.travelBlock('lighthouse');
   G.fog.radius=G.fog.targetRadius=420; return {ok:/fog/.test(why||'')&&ok2===null,why,ok2}; })()"""),
 ("shot:map", "SHOT map-waystones 'G.map.open(); G.map.debug.seen[\"shard:stones\"]=1; const v=G.map.view; v.tx=9; v.tz=1; v.tdist=33; v.tpitch=1.0; G.step(1/30,60)' 2500"),
 ("closeEnd", r"""(()=>{ T.closeMap(); return {ok:G.state.mode==='play'&&!G.map.isOpen}; })()"""),
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
                if js.startswith('CLICKWP '):
                    s=await pg.evaluate(f"(()=>{{ const r=G.map.debug.state('wp:{js[8:]}'); return r&&r.screen; }})()")
                    await pg.mouse.click(s['x'],s['y']+18); await pg.wait_for_timeout(150); continue
                if js.startswith('CLICKSEL '):
                    await pg.click('#mapUI '+js[9:]); await pg.wait_for_timeout(100); continue
                if js.startswith('SHOT'):
                    bits=js.split("'"); tag=bits[0].split()[1]; code=bits[1]; wait=int(bits[2].strip()) if len(bits)>2 and bits[2].strip() else 1600
                    await pg.evaluate(f"(()=>{{ {code}; G.headless&&G.headless.draw(4); }})()"); await pg.wait_for_timeout(wait)
                    await pg.evaluate("document.getAnimations().forEach(a=>{ try{ a.finish(); }catch(_){} })")  # headless: CSS transitions only advance on drawn frames
                    path=f'{OUT}/{tag}.png'; await pg.screenshot(path=path); print(f'shot {name:16s} {path}'); r='shot'; continue
                r=await pg.evaluate(js)
                if isinstance(r,dict) and 'ok' in r and not r['ok']: bad.append(r)
            if r=='shot': continue
            good=(bool(r.get('ok')) if isinstance(r,dict) else bool(r)) and not bad
            if bad and r is not bad[-1]: r={'ok':False,'failed':bad,'last':r}
            res[name]=r; ok=ok and good; print(f"{'ok  ' if good else 'FAIL'} {name:16s} {json.dumps(r)[:520]}")
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
        await pg.evaluate("localStorage.clear()"); await pg.reload(timeout=180000); await pg.wait_for_timeout(5000)
        await pg.evaluate(HELP)
        ok=await run_steps(pg,FRESH,res) and ok
        await pg.reload(timeout=180000); await pg.wait_for_timeout(5000); await pg.evaluate(HELP)
        ok=await run_steps(pg,AFTER_RELOAD,res) and ok
        await b.close()
    for e in errs[:10]: print('  ',e[:300])
    ok=ok and not errs
    print(('PASS' if ok else 'FAIL'), f'{time.time()-t0:.0f}s'); sys.exit(0 if ok else 1)
asyncio.run(main())

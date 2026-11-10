"""The raft in the Channel (cave), focused: the run is a short escort set piece, not a wait.
Starts each scenario from the devtools start 'cave:channel' (stair behind you, the raft at its mooring, 60 moths, bait on).
  run:slack     no help at slack tide: the raft reaches the plug in 25-35 s (crabs are knocked off by script the moment they grip)
  run:peak      the same at the tide's fastest: still 25-35 s
  run:pushed    charged bolts at the raft from the walkway (real lock-on + charge): noticeably shorter, every push counted
  raider        one crab: telegraph (1.5 s gripping the edge, the raft dips) -> climbs aboard -> snatches moths (swarm and HUD drop,
                red tick, a high-priority caption) -> a real charged bolt from the walkway knocks it off -> it splashes into the water
  noEat         three crabs left alone on the raft for 12 s: moths never hurt or kill them, none leaves or despawns on its own
  partial       only 10 moths ride: the raft still arrives, the plug eats its share (~50%) and stops, the objective asks for more
                moths; hooking the lantern back sends the raft home; a full swarm on a second run finishes the plug
  reload        save mid-run (lantern on the raft, a crab aboard), reload the page, Continue: lantern in hand, raft at its mooring,
                no crabs, the raft can be loaded again; an old-style save (no `ride` flag) is rescued the same way
Fails on any page error. usage: [ONLY=raider,partial,...] python3 test/raft_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, json, re, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
HERE=os.path.dirname(os.path.abspath(__file__))
LIB=re.search(r'LIB=r"""(.*?)"""',open(os.path.join(HERE,'cave_e2e.py')).read(),re.S).group(1)   # the cave suite's controller helpers (T)

RAFT=r"""
window.RT=(()=>{
const O=()=>G.cave.origin, R=()=>G.cavePuzzles.raft, D=()=>G.cavePuzzles.debug;
const ev=[]; for(const n of ['brineling:grip','brineling:board','brineling:aboard','brineling:knocked','brineling:splash','cave:raid','monster:killed','cave:seal'])
  G.on(n,e=>ev.push({n,t:+((R().runT)||0).toFixed(2),state:e&&e.state,kind:e&&e.kind}));
let lost=0, snatched=0; const snT=[]; G.on('moths:lost',e=>{ lost+=e.n; if(e.snatch){ snatched+=e.n; snT.push(G.time); } });
function reset(){ ev.length=0; lost=0; snatched=0; snT.length=0; }
/* after a devtools start: no stray channel crabs, at the jetty with the baited lantern */
function prep(o){ o=o||{}; for(const m of G.monsters.list.slice()) if(m.alive&&m.kind==='brineling')G.monsters.despawn(m);
  if(o.tide!=null)G.alchemy.debug.setTide(o.tide);
  if(!G.moths.baited)G.moths.bait(300);
  G.player.teleport(O().x+4.6,G.floorAt(O().x+4.6,O().z-80.4,O().y+3),O().z-80.4,0); G.step(1/30,10); reset(); }
function load(){ const lab=T.use(/raft/i); G.step(1/30,2); return lab; }
/* follow the raft along the walkway (already up there) */
function follow(){ const tx=Math.min(R().pos.x-O().x,44.5)-1.5, px=G.player.pos.x-O().x; if(Math.abs(tx-px)>1.2)T.steer(tx+O().x,O().z-86.1); else T.keys(new Set()); }
function toWalkway(){ return T.walk([[0,-82.5],[-6,-83.4],[-10,-85],[-10,-86],[-3,-86],[4,-86]],{local:true,sprint:true}); }
const raiders=()=>G.monsters.list.filter(m=>m.alive&&!m.dying&&m.raid);
/* a run with no help: walk up, follow; crabs are struck off the moment they grip (scripted, so no bolt can stray into the raft) */
function runNoHelp(max){ let n=0; const r0=toWalkway(); n+=r0.steps;
  while(R().state!=='arrived'&&n<(max||2400)){ for(const m of raiders()) if(m.state==='grip')m.hb.hit({damage:9,kind:'melee',dir:new THREE.Vector3(0,0,1)});
    follow(); G.step(1/30,1); n++; T.top(); }
  T.release(); return {r0:r0.ok,runT:+R().runT.toFixed(1),state:R().state,pushes:R().pushes|0,steps:n}; }
const caps=()=>{ const c=G.ui.captions(); return [c.cur].concat(c.queue).filter(Boolean); };
return {O,R,D,ev,snT,prep,load,follow,toWalkway,raiders,runNoHelp,caps,reset,get lost(){return lost;},get snatched(){return snatched;}};
})(); 0"""

S_SLACK=r"""(()=>{ RT.prep(); const tl=+G.tide.level.toFixed(2); const lab=RT.load(); const r=RT.runNoHelp();
  return {ok:lab==='Set the lantern on the raft'&&r.state==='arrived'&&r.pushes===0&&r.runT>=25&&r.runT<=35&&r.r0,tide:tl,lab,...r,waves:RT.ev.filter(e=>e.n==='cave:raid').length}; })()"""
S_PEAK=r"""(()=>{ RT.prep({tide:225}); G.step(1/30,2); const tl=+G.tide.level.toFixed(2); RT.load(); const r=RT.runNoHelp();
  return {ok:r.state==='arrived'&&r.pushes===0&&r.runT>=25&&r.runT<=35&&Math.abs(tl)<.3,tide:tl,...r}; })()"""
S_PUSHED=r"""(()=>{ RT.prep(); RT.load(); const R=RT.R(); const r0=RT.toWalkway(); let n=r0.steps, shots=0, onRaft=0;
  while(R.state!=='arrived'&&n<2400){
    for(const m of RT.raiders()) if(m.state==='grip')m.hb.hit({damage:9,kind:'melee',dir:new THREE.Vector3(0,0,1)});
    if(R.state==='drifting'&&!RT.raiders().length&&Math.abs(R.pos.x-G.player.pos.x)<6){   // lock on to the raft and loose a charged bolt
      if(G.player.lockTarget)T.tap('lock',1); T.tap('lock',2); const lt=G.player.lockTarget; if(lt&&lt.raft)onRaft++;
      G.input.setVirtual('attack',true); G.step(1/30,20); G.input.setVirtual('attack',false); G.step(1/30,8); if(G.player.lockTarget)T.tap('lock',1); shots++; n+=32; }
    RT.follow(); G.step(1/30,1); n++; T.top(); }
  T.release();
  return {ok:R.state==='arrived'&&R.pushes>=3&&R.runT<23,runT:+R.runT.toFixed(1),pushes:R.pushes,shots,lockedOnRaft:onRaft}; })()"""
S_RAIDER=r"""(()=>{ RT.prep(); RT.load(); const R=RT.R(), P=G.player; RT.toWalkway(); RT.reset();
  G.cavePuzzles.raid.wave=9; G.ui.clearCaptions&&G.ui.clearCaptions();                // only our crab
  const m=RT.D().spawnRaider(1); const out={};
  // telegraph: in the water at the raft's edge for ~1.5 s, claws up, the raft dipping toward it, no moths taken
  let n=0, maxRoll=0, minDy=9; const sw0=G.moths.swarm;
  while(m.state==='grip'&&n<120){ G.step(1/30,1); n++; RT.follow(); const dy=m.pos.y-G.cave.waterWorld(); minDy=Math.min(minDy,dy);
    const rot=G.scene.getObjectByName('raft').rotation.x; maxRoll=Math.max(maxRoll,Math.abs(rot)); }
  out.gripS=+(n/30).toFixed(2); out.gripBelowSurface=+minDy.toFixed(2); out.raftDip=+maxRoll.toFixed(3); out.lostDuringGrip=sw0-G.moths.swarm;
  out.gripCaption=RT.caps().some(c=>c.pri===2&&/Claws hook over the edge/.test(c.text));
  // climbs aboard, then snatches
  let k=0; while(m.state!=='raft'&&k<60){ G.step(1/30,1); k++; RT.follow(); } out.aboardAfter=+(k/30).toFixed(2);
  const ab=G.cave.toLocal(m.pos), rl=G.cave.toLocal(R.pos); out.onDeck=Math.abs(ab.z-rl.z)<1&&Math.abs(m.pos.y-R.deckY)<.05;
  const s1=G.moths.swarm; let q=0, tick=false, gone=0;
  while(RT.snatched<3&&q<150){ G.step(1/30,1); q++; RT.follow(); const l=document.querySelector('.moth-chip .lost'); if(l&&l.classList.contains('on')&&/−\d/.test(l.textContent))tick=true;
    gone=G.creatures.moths.filter(x=>x.tgt==='snatch').length||gone; }
  G.step(1/30,30);
  out.snatched=RT.snatched; out.swarmDrop=s1-G.moths.swarm; out.hudTick=tick; out.snatchTween=gone>0; out.snatchEvery=RT.snT.length>1?+((RT.snT[RT.snT.length-1]-RT.snT[0])/(RT.snT.length-1)).toFixed(2):0;
  out.aboardCaption=RT.caps().some(c=>c.pri===2&&/snatching the moths/.test(c.text))||RT.ev.some(e=>e.n==='brineling:aboard');
  out.objective=document.getElementById('objSub').textContent;
  // a real charged bolt from the walkway: lock on, hold, release
  const hit=T.bolt(m); let w=0; while(m.alive&&w<90){ G.step(1/30,1); w++; }
  out.bolted=hit; out.knocked=RT.ev.some(e=>e.n==='brineling:knocked'); out.splash=RT.ev.some(e=>e.n==='brineling:splash'); out.gone=!m.alive;
  out.order=RT.ev.filter(e=>/brineling/.test(e.n)).map(e=>e.n.split(':')[1]).join('>');
  out.ok=out.gripS>=1.4&&out.gripS<=1.6&&out.gripBelowSurface<0&&out.raftDip>.04&&out.lostDuringGrip===0&&out.gripCaption&&out.aboardAfter<=.6&&out.onDeck
    &&out.snatched>=3&&out.swarmDrop>=3&&out.hudTick&&out.snatchTween&&out.snatchEvery>.8&&out.snatchEvery<1.4&&/crab is on the raft/.test(out.objective)
    &&out.bolted&&out.knocked&&out.splash&&out.gone&&out.order==='grip>board>aboard>knocked>splash';
  return out; })()"""
S_LOCKRAIDER=r"""(()=>{ RT.prep(); RT.load(); const R=RT.R(), P=G.player; RT.toWalkway(); RT.reset(); G.cavePuzzles.raid.wave=9;
  const a=RT.D().spawnRaider(1), b=RT.D().spawnRaider(-1); G.step(1/30,4);
  P.camYaw=Math.atan2(P.pos.x-R.pos.x,P.pos.z-R.pos.z); G.step(1/30,4);   // the camera looking away from the raft, at the wall
  if(P.lockTarget)T.tap('lock',1); T.tap('lock',2); const first=P.lockTarget, firstIsCrab=first===a.hb||first===b.hb;
  const other=first===a.hb?b:a; first&&first.hit({damage:9,kind:'melee',dir:new THREE.Vector3(0,0,1)}); G.step(1/30,3);
  const hopped=P.lockTarget===other.hb; other.hb.hit({damage:9,kind:'melee',dir:new THREE.Vector3(0,0,1)}); G.step(1/30,3);
  return {ok:firstIsCrab&&hopped&&!P.lockTarget,firstIsCrab,hopped,after:!!P.lockTarget}; })()"""
S_NOEAT=r"""(()=>{ RT.prep(); RT.load(); const R=RT.R(); G.cavePuzzles.raid.wave=9; G.step(1/30,90);
  const ms=[1,-1,1].map(s=>RT.D().spawnRaider(s)); let n=0, vanished=0, killedByMoths=0, hurt=0;
  G.on('monster:killed',()=>killedByMoths++);
  while(n<12*30){ G.step(1/30,1); n++; T.top();
    for(const m of ms){ if(!m.alive||m.dying)vanished++; if(m.hp<m.maxHp||m.lastHit>0)hurt++; } }
  const hunting=G.creatures.moths.filter(x=>x.tgt==='hunt').length;
  const st=ms.map(m=>m.state+(m.onRaft?'@deck':'')).join(',');
  return {ok:vanished===0&&killedByMoths===0&&hurt===0&&hunting===0&&ms.every(m=>m.onRaft&&m.state==='raft')&&RT.snatched>=10,
    vanished,killedByMoths,hurt,hunting,states:st,snatched:RT.snatched,swarm:G.moths.swarm,raft:R.state}; })()"""
S_PARTIAL=r"""(()=>{ RT.prep(); const R=RT.R(), s=G.cavePuzzles.seals.channel;
  let keep=10; for(const m of G.creatures.moths) if(m.tgt==='lantern'){ if(keep>0)keep--; else G.moths.kill(m,false); }
  G.step(1/30,10); const sw0=G.moths.swarm; G.cavePuzzles.raid.wave=9;
  RT.load(); const r=RT.runNoHelp(); let n=0; while(!(s.sated&&!s.feeding)&&n<20*30){ G.step(1/30,1); n++; } G.step(1/30,30);
  const openEarly=G.cavePuzzles.open('channel'), prog=+s.progress.toFixed(2), obj=document.getElementById('objSub').textContent, said=RT.caps().some(c=>/still breathing/.test(c.text))||RT.ev.some(e=>e.state==='sated');
  // hook the lantern back from the walkway: the raft goes home
  G.player.teleport(R.pos.x-1,G.cave.origin.y+4.05,G.cave.origin.z-86,0); G.step(1/30,3); const lab=T.label(); const u=T.use(/Hook the lantern/); G.step(1/30,30);
  let h=0; while(R.t>0&&h<20*30){ G.step(1/30,1); h++; } const home=R.t===0&&R.state==='idle', sated=!!s.sated;
  // a second run with a full swarm finishes the plug
  G.devtools&&0; const C=G.creatures; let k=0; for(const m of C.moths){ if(k>=40)break; if(m.tgt==='patch'||m.tgt==='wander'||m.tgt==='roost'||m.tgt==='gone'){ m.tgt='lantern'; m.rad=.4+Math.random(); m.p.copy(G.player.pos).y+=1; k++; } }
  RT.prep(); const r2lab=RT.load(); const r2=RT.runNoHelp(); let f=0; while(!s.cured&&f<20*30){ G.step(1/30,1); f++; }
  return {ok:r.state==='arrived'&&sw0>=9&&sw0<=11&&prog>=.4&&prog<=.6&&!openEarly&&sated&&/too few moths/.test(obj)&&said&&u==='Hook the lantern back off the raft'&&home
      &&r2lab==='Set the lantern on the raft'&&s.cured&&G.cave.gate('channel'),
    sw0,runT:r.runT,progress:prog,obj,said,lab,homeS:+(h/30).toFixed(1),secondRun:r2.runT,cured:s.cured,feedS:+(f/30).toFixed(1)}; })()"""
S_SAVE=r"""(()=>{ RT.prep(); RT.load(); const R=RT.R(); RT.toWalkway(); let n=0; while(R.t<.3&&n<900){ RT.follow(); G.step(1/30,1); n++; }
  const m=RT.D().spawnRaider(1); n=0; while(m.state!=='raft'&&n<120){ G.step(1/30,1); n++; }
  const ok=G.flow.writeSave(); const d=JSON.parse(localStorage.getItem(G.flow.keys.test)||'null');
  return {ok:ok&&!!d&&d.mods.cavePuzzles.raft.ride===true&&!d.lantern.carried,ride:d&&d.mods.cavePuzzles.raft,lantern:d&&d.lantern,t:+R.t.toFixed(2),crab:m.state}; })()"""
S_AFTER=r"""(()=>{ G.step(1/30,40); const R=RT.R(), L=G.items.lantern; RT.prep();
  const crabs=G.monsters.list.filter(m=>m.alive&&m.kind==='brineling'&&m.raid).length;
  const lab=T.label(); const u=RT.load();
  return {ok:L.carried===false&&R.lantern&&R.t===0&&crabs===0&&lab==='Set the lantern on the raft'&&u==='Set the lantern on the raft'&&G.cave.room(G.player.pos)==='channel',
    carriedBefore:true,t:R.t,state:R.state,crabs,lab,u,room:G.cave.room(G.player.pos)}; })()"""
S_AFTER_PRE=r"""(()=>{ G.step(1/30,10); const L=G.items.lantern, R=G.cavePuzzles.raft; return {carried:L.carried,t:R.t,state:R.state,lantern:R.lantern}; })()"""
S_OLDSAVE=r"""(()=>{ const k=G.flow.keys.test, d=JSON.parse(localStorage.getItem(k)); delete d.mods.cavePuzzles.raft.ride; localStorage.setItem(k,JSON.stringify(d)); return {ok:d.lantern.carried===false&&d.mods.cavePuzzles.raft.t>.02}; })()"""

async def main():
    fails=[]; errs=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await (await b.new_context(viewport={'width':1000,'height':600})).new_page(); pg.set_default_timeout(480000)
        pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and '404' not in m.text else None)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
        await pg.evaluate("localStorage.removeItem('bq-save-v1')")
        async def boot(): await pg.evaluate(LIB); await pg.evaluate(RAFT)
        await boot()
        async def start(sid='cave:channel',reload=True):
            if reload:   # every scenario in a fresh page: a devtools start doesn't un-open a seal opened earlier in the session
                await pg.reload(); await pg.wait_for_timeout(5000); await boot()
            await pg.evaluate(f"G.devtools.start('{sid}'); 0"); await pg.wait_for_timeout(1500); await pg.evaluate("G.step(1/30,30); 0")
        only=os.environ.get('ONLY','')
        async def check(name,js,fresh=True):
            if only and not any(name.startswith(o) for o in only.split(',')): return {'ok':True}
            if fresh: await start()
            try: r=await pg.evaluate(js)
            except Exception as e: r={'ok':False,'exc':str(e).split('\n')[0][:300]}
            ok=bool(r.get('ok')) if isinstance(r,dict) else False
            if not ok: fails.append(name)
            print(('PASS ' if ok else 'FAIL ')+name,':',json.dumps(r)[:900]); return r
        await check('run:slack',S_SLACK)
        await check('run:peak',S_PEAK)
        await check('run:pushed',S_PUSHED)
        await check('raider',S_RAIDER)
        await check('lockRaider',S_LOCKRAIDER)
        await check('noEat',S_NOEAT)
        await check('partial',S_PARTIAL)
        await check('reload:save',S_SAVE)
        if only and 'reload' not in only: await b.close(); print('\nRESULT:', 'ALL PASS' if not fails and not errs else 'FAILED '+', '.join(fails)); sys.exit(1 if fails or errs else 0)
        await start('testsave')
        pre=await pg.evaluate(S_AFTER_PRE); print('     after reload:',pre)
        if not (pre['carried'] and pre['t']==0 and pre['state']=='idle' and not pre['lantern']): fails.append('reload:rescued'); print('FAIL reload:rescued')
        else: print('PASS reload:rescued')
        await check('reload:play-on',S_AFTER,fresh=False)
        # an old save (before the `ride` flag) with the lantern lying over the channel water: rescued too
        await check('reload:old-save-prep',S_SAVE)
        await pg.evaluate(S_OLDSAVE)
        await start('testsave')
        pre=await pg.evaluate(S_AFTER_PRE); print('     old save after reload:',pre)
        if not (pre['carried'] and pre['t']==0): fails.append('reload:old-save'); print('FAIL reload:old-save')
        else: print('PASS reload:old-save')
        await b.close()
    if errs: print('page/console errors:\n  '+'\n  '.join(errs[:12]))
    print('\nRESULT:', 'ALL PASS' if not fails and not errs else 'FAILED '+', '.join(fails)+(' + page errors' if errs else ''))
    sys.exit(1 if fails or errs else 0)
asyncio.run(main())

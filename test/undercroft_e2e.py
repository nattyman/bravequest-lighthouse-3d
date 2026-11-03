"""The Hamlet Undercroft (UNDERCROFT.md) — shared e2e. Each agent owns one section of STEPS (Place, People, Boss, Shared).
usage: python3 test/undercroft_e2e.py [url] [--only place,people,boss,shared]
       (default http://localhost:8800/dev.html?debug&headless)
Screenshots go to /tmp/claude-0/undercroft-<section>/."""
import asyncio, sys, json, time, os
from playwright.async_api import async_playwright
ARGS=[a for a in sys.argv[1:] if not a.startswith('--')]
URL=ARGS[0] if ARGS else 'http://localhost:8800/dev.html?debug&headless'
ONLY=None
for a in sys.argv[1:]:
    if a.startswith('--only'): ONLY=set((a.split('=',1)[1] if '=' in a else sys.argv[sys.argv.index(a)+1]).split(','))

# helpers installed in the page once per load (shared; add yours under T.<section>)
HELP="""
window.T={
  play(){ if(G.state.mode==='paused'&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); if(G.state.mode!=='play'&&G.state.mode!=='dead')G.setMode('play'); },
  settle(n){ T.play(); G.step(1/30,n||10); if(G.progress&&G.progress.endReward)G.progress.endReward(); G.step(1/30,2); T.play(); },
  hold(){ const P=G.player; P.hp=P.maxHp; },
};
'ok'"""

# ============================================================== BOSS (Boss agent): Nameless, placement, the Tithe-Keeper, rewards
BOSS_HELP="""
T.boss={
  strike(pos,dmg,kind){ return G.combat.strike({x:pos.x,y:pos.y+1,z:pos.z,radius:.9,team:'player',damage:dmg||2,knockback:2,kind:kind||'melee'}).length; },
  hitCrane(dmg){ const B=G.undercroftBoss.crane; return T.boss.strike(B.pos,dmg||2); },
  moths(n){ G.devtools&&G.devtools.giveSwarm&&G.devtools.giveSwarm(n||40); const P=G.player.pos; let k=0;
    for(const m of G.creatures.moths){ if(m.tgt==='lantern'){ m.p.set(P.x+(Math.random()-.5)*2,P.y+1.4,P.z+(Math.random()-.5)*2); m.v.set(0,0,0); k++; } } return k; },
  swarm(){ let n=0; for(const m of G.creatures.moths)if(m.tgt==='lantern'||m.tgt==='hunt')n++; return n; },
};
'ok'"""
BOSS=[
 ("boss:enter", "(()=>{ document.getElementById('begin')&&document.getElementById('begin').click(); G.debugStartLoop(); G.step(1/30,10); const r=G.undercroftBoss.debug.enter('store'); G.step(1/30,10); T.hold();"
   " return {room:r, inside:!!(G.undercroft?G.undercroft.inside:true), y:+G.player.pos.y.toFixed(2), state:G.undercroftBoss.state}; })()",
   lambda r: r['room']=='store' and r['state']=='dormant'),
 # the Nameless: a long readable wind-up, then a 2-half-heart grab; 4 hp; killed -> monster:killed
 ("boss:nameless", "(()=>{ const P=G.player, B=G.undercroftBoss; B.debug.enter('cellars'); G.step(1/30,12); B.debug.clearMine(); G.step(1/30,3); T.hold(); const hp0=P.hp;"
   " const m=G.monsters.spawn('nameless',{x:P.pos.x,y:P.pos.y,z:P.pos.z+1.8},{aggro:true}); m.cool=0; let wind=null, hit=null, t=0;"
   " for(let i=0;i<150;i++){ G.step(1/30,1); t+=1/30; if(m.state==='windup'&&wind==null)wind=t; if(P.hp<hp0&&hit==null){hit=t;break;} }"
   " const dmg=hp0-P.hp; let killed=null; const off=G.on?null:null; const hb=m.hb; const hp=m.maxHp; let n=0; while(m.alive&&!m.dying&&n<6){ T.boss.strike(m.pos,1); n++; G.step(1/30,2); }"
   " return {kind:m.kind,name:hb.name,hp,wind:wind&&+wind.toFixed(2),hit:hit&&+hit.toFixed(2),lead:hit&&wind?+(hit-wind).toFixed(2):null,dmg,hitsToKill:n,dying:m.dying}; })()",
   lambda r: r['kind']=='nameless' and r['hp']==4 and r['dmg']==2 and r['lead'] and r['lead']>=1.0 and r['hitsToKill']==4 and r['dying']),
 # placement: packs per room (cellars, chapel, mill) — Nameless, hollows and the two hounds
 ("boss:packs", "(()=>{ const B=G.undercroftBoss, out={}; for(const room of ['cellars','chapel','mill']){ B.debug.enter(room); G.step(1/30,12); out[room]={}; for(const m of B.monsters)if(m.alive&&m.undercroft===room)out[room][m.kind]=(out[room][m.kind]||0)+1; }"
   " let total=0; for(const r in out)for(const k in out[r])total+=out[r][k]; return {out,total}; })()",
   lambda r: r['total']>=12 and r['out']['mill'].get('hound')==2 and all(r['out'][k].get('nameless',0)>=2 for k in r['out'])),
 # the fight starts when you walk into the store; boss bar named
 ("boss:start", "(()=>{ const B=G.undercroftBoss; for(const m of B.monsters.slice())G.monsters.despawn(m); B.debug.enter('store'); G.step(1/30,5); const c=B.debug.centre(); G.player.teleport(c.x,c.y+.2,c.z+7,Math.PI); G.step(1/30,10);"
   " const st=B.state; B.debug.hold(true); G.step(1/30,80); T.hold(); return {st,after:B.state,phase:B.phase,hp:B.hp,bar:(document.getElementById('bossName')||{}).textContent||document.body.innerText.includes('Aldous Crane, the Tithe-Keeper')}; })()",
   lambda r: r['st']=='intro' and r['after']=='fight' and r['phase']==1 and r['hp']==40 and r['bar']),
 ("boss:quill", "(()=>{ const B=G.undercroftBoss, P=G.player; T.hold(); const hp0=P.hp; B.debug.attack('quill'); let lineSeen=false; for(let i=0;i<50;i++){ G.step(1/30,1); if(i==15){ G.headless&&G.headless.draw(2); } } return {dmg:hp0-P.hp}; })()",
   lambda r: r['dmg']==2),
 ("boss:pages", "(()=>{ const B=G.undercroftBoss, P=G.player; G.step(1/30,40); T.hold(); const hp0=P.hp; const c=B.crane.pos; P.teleport(c.x,c.y,c.z+4,Math.PI); G.step(1/30,2); B.debug.attack('pages'); let proj=0; for(let i=0;i<60;i++){ G.step(1/30,1); proj=Math.max(proj,G.combat.projectiles.filter(p=>p.team==='enemy').length); } return {dmg:hp0-P.hp,proj}; })()",
   lambda r: r['dmg']>=2 and r['proj']>=8),
 ("boss:tithe", "(()=>{ const B=G.undercroftBoss; G.step(1/30,40); T.hold(); B.debug.attack('tithe'); G.step(1/30,70); const n=B.summoned.filter(m=>m.alive&&!m.dying).length; for(const m of B.summoned)if(m.alive)G.monsters.despawn(m); return {n}; })()",
   lambda r: 1<=r['n']<=2),
 ("boss:phase2", "(()=>{ const B=G.undercroftBoss; B.debug.hold(); T.hold(); let k=0; while(B.phase===1&&k<30){ T.boss.hitCrane(2); G.step(1/30,5); k++; } G.step(1/30,40);"
   " const f=B.figures; return {phase:B.phase,hp:B.hp,alive:f.filter(x=>x.alive).length,real:f.filter(x=>x.real).length,kinds:f.map(x=>x.kind)}; })()",
   lambda r: r['phase']==2 and r['alive']==4 and r['real']==1 and r['hp']<=24),
 # the copies: through the Glass the real one is warm and solid, the copies empty; without it, his shadow lags his feet
 ("boss:copies", "(()=>{ const B=G.undercroftBoss; B.debug.hold(); if(!G.glass)G.glass={owned:true,raised:false,canSee:()=>true,_stub:true}; const g=G.glass; if(g.give)g.give({silent:true}); if(g.raise)g.raise(false); else g.raised=false; G.step(1/30,30);"
   " const lag=B.figures.map(f=>({real:f.real,d:+Math.hypot(f.shadow.position.x-f.pos.x,f.shadow.position.z-f.pos.z).toFixed(2)}));"
   " const P=G.player, rf=B.debug.real(); P.teleport(P.pos.x,P.pos.y,P.pos.z,Math.atan2(rf.pos.x-P.pos.x,rf.pos.z-P.pos.z)); if(P.aimCamera)P.aimCamera(P.heading,.05); G.step(1/30,3); if(g.raise)g.raise(true); else g.raised=true; G.step(1/30,30); const look=B.figures.map(f=>({real:f.real,seen:!g.canSee||g.canSee(f.pos)!==false,op:+f.mats.ink.opacity.toFixed(2),warm:+f.mats.warm.opacity.toFixed(2)}));"
   " if(g.raise)g.raise(false); else g.raised=false; G.step(1/30,3); return {lag,look}; })()",
   lambda r: all((x['d']>0.12) if x['real'] else (x['d']<0.05) for x in r['lag']) and any(x['real'] and x['seen'] for x in r['look']) and all((x['warm']>0.15 and x['op']>0.8) if x['real'] else (x['op']<0.4 and x['warm']<0.05) for x in r['look'] if x['seen'])),
 ("boss:copyHit", "(()=>{ const B=G.undercroftBoss, P=G.player; T.hold(); const c=B.figures.find(f=>!f.real&&f.alive); const hp0=B.hp; T.boss.strike(c.pos,2); let proj=0; for(let i=0;i<30;i++){ G.step(1/30,1); proj=Math.max(proj,G.combat.projectiles.filter(p=>p.team==='enemy').length); }"
   " const hpA=B.hp; const r=B.debug.real(); T.boss.strike(r.pos,2); G.step(1/30,2); return {copyAlive:c.alive,bossHpAfterCopy:hpA,hp0,proj,realHit:hpA-B.hp}; })()",
   lambda r: r['copyAlive'] is False and r['bossHpAfterCopy']==r['hp0'] and r['proj']>=5 and r['realHit']>=2),
 ("boss:reform", "(()=>{ const B=G.undercroftBoss; B.debug.hold(); G.step(1/30,90); const f=B.figures; return {alive:f.filter(x=>x.alive).length,real:f.filter(x=>x.real).length}; })()",
   lambda r: r['alive']==4 and r['real']==1),
 # phase 3: the ledger opens and eats the swarm; the Skyfall Slam near him (or 3 charged bolts) staggers him
 ("boss:phase3", "(()=>{ const B=G.undercroftBoss; T.hold(); let k=0; while(B.phase===2&&k<40){ T.hold(); const r=B.debug.real(); if(r&&r.alive)T.boss.strike(r.pos,2); G.step(1/30,50); k++; } T.hold(); G.step(1/30,30);"
   " const n0=T.boss.moths(40); B.crane.ledger.shut=0; G.step(1/30,10); const open=B.crane.ledger.open; G.step(1/30,120); return {phase:B.phase,open,n0,eaten:B.eaten,swarm:T.boss.swarm()}; })()",
   lambda r: r['phase']==3 and r['open'] and r['eaten']>=3),
 ("boss:bolts", "(()=>{ const B=G.undercroftBoss; T.hold(); if(!B.crane.ledger.open){ B.debug.openLedger(); G.step(1/30,2); } const L=G.combat.hurtboxes?null:null; let hits=0;"
   " for(let i=0;i<3;i++){ const lp=[...G.hurtboxes].find(h=>h.ledger); G.combat.strike({x:lp.pos.x,y:lp.pos.y+.5,z:lp.pos.z,radius:.4,team:'player',damage:4,kind:'bolt'}); G.step(1/30,3); }"
   " return {stagger:+B.crane.staggerT.toFixed(2),open:B.crane.ledger.open}; })()",
   lambda r: r['stagger']>2 and r['open'] is False),
 ("boss:slam", "(()=>{ const B=G.undercroftBoss, P=G.player; B.crane.staggerT=0; B.debug.openLedger(); G.step(1/30,2); const c=B.crane.pos; P.teleport(c.x+2,c.y,c.z+2,0); G.step(1/30,2);"
   " G.input.setVirtual('jump',true); G.step(1/30,2); G.input.setVirtual('jump',false); G.step(1/30,8); G.input.setVirtual('attack',true); G.step(1/30,2); G.input.setVirtual('attack',false); G.step(1/30,40);"
   " return {stagger:+B.crane.staggerT.toFixed(2),open:B.crane.ledger.open,move:G.player.move&&G.player.move.id}; })()",
   lambda r: r['stagger']>0 and r['open'] is False),
 ("boss:shot", "(()=>{ G.headless&&G.headless.draw(3); return 1; })()", lambda r: True),
 # death resets the fight cleanly; you rise at the store door
 ("boss:die", "(()=>{ const B=G.undercroftBoss, P=G.player; B.debug.hold(false); P.hurt({damage:99,dir:new THREE.Vector3(0,0,1),kind:'melee',knockback:0,ignoreIframes:true}); G.step(1/30,30); return {mode:G.state.mode,fight:B.state}; })()",
   lambda r: r['mode']=='dead'),
 ("boss:rise", "WAIT_RISE", None),
 ("boss:death", "(()=>{ const B=G.undercroftBoss, P=G.player; G.step(1/30,20); const d=B.debug.door();"
   " return {mode:G.state.mode,state:B.state,phase:B.phase,hp:B.hp,atDoor:+Math.hypot(P.pos.x-d.x,P.pos.z-d.z).toFixed(2),figs:B.figures.filter(f=>f.alive).length,bar:B.fighting}; })()",
   lambda r: r['state']=='dormant' and r['phase']==1 and r['hp']==40 and r['atDoor']<3 and r['figs']==0),
 # defeat: pages -> ledger to the lectern, the last page, the strongroom/exit event, the 8th heart (+2 Marks)
 ("boss:defeat", "(()=>{ const B=G.undercroftBoss, P=G.player; T.hold(); window.__ucDead=[]; G.on('undercroft:bossDead',e=>__ucDead.push(e)); let bossDead=0; G.on('boss:dead',()=>bossDead++);"
   " B.debug.hold(true); B.debug.start(); G.step(1/30,5); B.debug.kill(); G.step(1/30,240); const m0=G.player.maxHp, k0=G.progress.marks;"
   " const d=G.progress.drops.crane; const dp=d&&d.pos.clone(); if(dp){ P.teleport(dp.x,dp.y,dp.z,0); G.step(1/30,10); } T.settle(60);"
   " const lp=B.debug.lectern(); P.teleport(lp.x,lp.y,lp.z+1.2,Math.PI); G.step(1/30,4); const ia=G.interact.pick(P.pos); const lab=ia&&G.interact.label(ia); if(ia)ia.use(); G.step(1/30,20); const card=(document.getElementById('rewardCard')||{}).textContent||''; T.settle(60);"
   " B.readLastPage(); G.step(1/30,2);"
   " return {state:B.state,defeated:B.defeated,events:__ucDead.length,bossDead,heartDrop:!!dp,dmax:G.player.maxHp-m0,marks:G.progress.marks-k0,lab,ledger:B.ledger,card,page:B.pageRead,hearts:G.progress.state.hearts}; })()",
   lambda r: r['defeated'] and r['events']==1 and r['bossDead']==0 and r['heartDrop'] and r['dmax']==2 and r['marks']==2 and r['lab'] and 'Ledger' in r['lab'] and r['ledger'] and 'Tithe Ledger' in r['card'] and r['page']),
 ("boss:lastPage", "(()=>{ const msgs=[...document.querySelectorAll('#caption, .caption, #captions')].map(e=>e.textContent).join(' '); return {ok:msgs.includes('I kept my name. I didn’t keep anything else.')||G.undercroftBoss.LAST_PAGE==='I kept my name. I didn’t keep anything else.'}; })()",
   lambda r: r['ok']),
 ("boss:audio", "(()=>{ const A=G.audio; return {api:!!(A&&A.undercroft), names:A&&A.undercroft?A.undercroft.sfxNames.filter(n=>['crane_recite','crane_quill','crane_pages','crane_split','crane_death','nameless_grab','glass_raise'].includes(n)).length:0}; })()",
   lambda r: r['api'] and r['names']==7),
]

# ============================================================== PLACE (Place agent): the trapdoor, enter/exit, candles, the Glass doorway + stair,
#   echoes, checkpoints, the stranded fallback, persistence, the waystone, the island outlines, draw calls
PLACE_HELP="""
T.place={
  O:()=>G.undercroft.origin,
  L:()=>{ const o=G.undercroft.origin, p=G.player.pos; return [+(p.x-o.x).toFixed(2),+(p.y-o.y).toFixed(2),+(p.z-o.z).toFixed(2)]; },
  at(x,y,z,yaw){ const o=G.undercroft.origin; G.player.teleport(o.x+x,o.y+y,o.z+z,yaw==null?0:yaw); G.step(1/30,4); },
  walk(n,dir){ G.input.setVirtual(dir||'forward',true); G.step(1/30,n); G.input.setVirtual(dir||'forward',false); G.step(1/30,2); },
  use(re){ T.play(); G.step(1/30,2); const c=G.interact.pick(G.player.pos), lab=c&&G.interact.label(c); if(!c||(re&&!re.test(lab)))return 'NOPE:'+lab; c.use(); G.step(1/30,2); return lab; },
  glass(on,n){ G.input.setVirtual('glass',!!on); G.step(1/30,n||15); return G.glass.raised; },
  trans(){ for(let i=0;i<80&&G.undercroft._debug.S.trans;i++)G.step(1/30,1); G.step(1/30,4); },
};
'ok'"""
PLACE=[
 # the trapdoor stays bound until the Choked Well is cured; then it opens (and the waystone waits for the first visit)
 ("place:door", "(()=>{ document.getElementById('begin')&&document.getElementById('begin').click(); G.step(1/30,10); if(!(G.loop&&G.loop.active))G.debugStartLoop(); G.step(1/30,10);"
   " const before=G.undercroft.open; let ev=null; G.on('undercroft:open',e=>ev=e); G.moths._debug.cure('well'); G.step(1/30,90); const d=G.undercroft.door;"
   " G.player.teleport(d.x+1.4,null,d.z,-Math.PI/2); G.step(1/30,8); const c=G.interact.pick(G.player.pos);"
   " return {before,open:G.undercroft.open,ev:!!ev,lab:c&&G.interact.label(c),wp:G.map.waypoints.find(w=>w.id==='undercroft')}; })()",
   lambda r: r['before'] is False and r['open'] and r['ev'] and r['lab']=='Go down into the undercroft' and r['wp'] and not r['wp']['unlocked']),
 ("place:enter", "(()=>{ T.place.use(/Go down/); T.place.trans(); return {inside:G.undercroft.inside,room:G.undercroft.room(G.player.pos),L:T.place.L(),dark:G.atmo.darkTarget,fog:G.fog.depth(G.player.pos),"
   " cp:G.state.checkpointName,wp:G.map.waypoints.find(w=>w.id==='undercroft').unlocked,island:G.scene.children.find(c=>c.name==='world').children.filter(c=>c.visible&&!c.isLight).length}; })()",
   lambda r: r['inside'] and r['room']=='stair' and r['dark']==1 and r['fog']==0 and r['cp']=='the trapdoor stair' and r['wp']),
 # candles: the first is free; then 5 ether each (no vials: refused); a lit room stays lit
 ("place:candles", "(()=>{ const C=G.undercroft.candles, s0=C.find(c=>c.id==='stair:0'); G.player.teleport(s0.pos.x+.9,null,s0.pos.z,-Math.PI/2); G.step(1/30,4); const l1=T.place.use(/candle/);"
   " const lit1=G.undercroft.isLit('stair'); G.inv.take('vial',G.inv.count('vial')); G.alchemy.etherUnits=0; T.place.at(-13.9,-2,-23.8,-Math.PI/2); const l2=T.place.use(/candle/); const lit2=G.undercroft.isLit('cellars');"
   " G.inv.add('vial',1,{silent:true}); G.alchemy.etherUnits=12; G.step(1/30,2); const l3=T.place.use(/candle/); G.step(1/30,10);"
   " return {l1,lit1,l2,lit2,l3,lit3:G.undercroft.isLit('cellars'),ether:G.alchemy.etherUnits,dark:G.atmo.darkTarget}; })()",
   lambda r: r['lit1'] and r['l1']=='Light the candle' and not r['lit2'] and 'needs 5 ether' in r['l2'] and r['lit3'] and r['ether']==7 and r['dark']<1),
 # the collapsed east wall: solid in the present
 ("place:wall", "(()=>{ T.place.at(13.6,-2,-24,Math.PI/2); T.place.walk(45); return {L:T.place.L(),room:G.undercroft.room(G.player.pos)}; })()",
   lambda r: r['L'][0]<15 and r['room']=='cellars'),
 # the Glass: raised, the past doorway is walkable (slow walk, vignette); lowered mid-way you're eased back, never trapped
 ("place:glassDoor", "(()=>{ G.glass.give({silent:true}); T.place.at(13.6,-2,-24,Math.PI/2); const st0=G.player.stamina; const up=T.place.glass(true); const sp=G.player.speedMul; T.place.walk(8); T.place.at(15.8,-2,-24,Math.PI/2); G.step(1/30,4);"
   " const mid=T.place.L(); const vig=+getComputedStyle(document.getElementById('glassVig')).opacity; let push=null; G.on('undercroft:pastPush',e=>push=e); T.place.glass(false,35);"
   " const back=T.place.L(), ctl=G.player.inputEnabled; T.place.glass(true); T.place.walk(90); const through=T.place.L(), room=G.undercroft.room(G.player.pos); T.place.glass(false);"
   " return {up,sp,mid,vig,push:!!push,back,ctl,through,room,stam:+(G.player.stamina-st0).toFixed(2)}; })()",
   lambda r: r['up'] and r['sp']<.5 and 15<r['mid'][0]<16.6 and r['vig']>.5 and r['push'] and r['back'][0]<15 and r['ctl'] and r['through'][0]>18 and r['room']=='mill' and r['stam']>=0),
 # the stair to the mill loft that was: up with the Glass; lowered on it, back to the present floor
 ("place:pastStair", "(()=>{ T.place.at(16.25,-6,-49.5,0); T.place.glass(true); T.place.walk(75); const top=T.place.L(); T.place.at(16.25,-6,-49.5,0); T.place.walk(40); const mid=T.place.L(); T.place.glass(false,40);"
   " const after=T.place.L(); T.place.at(16.25,-6,-49.5,0); T.place.walk(75); const noGlass=T.place.L(); return {top,mid,after,noGlass}; })()",
   lambda r: abs(r['top'][1]+3)<.2 and r['mid'][1]>-5.6 and abs(r['after'][1]+6)<.2 and abs(r['noGlass'][1]+6)<.2 and r['noGlass'][2]<-44.0),
 # an echo: the Glass raised at the chapel altar plays 'the bargain' (a caption + glass:echo)
 ("place:echo", "(()=>{ const e=G.undercroft.echoes.find(q=>q.id==='bargain'); G.debugEnterUndercroft('chapel'); G.step(1/30,4); G.player.teleport(e.pos.x+.6,e.pos.y,e.pos.z+2.2,Math.PI); G.step(1/30,4); let ev=null; G.on('glass:echo',x=>{ if(x.id==='bargain')ev=x; });"
   " T.place.glass(true,40); const fig=G.glass._debug.echoes.find(q=>q.id==='bargain'); const vis=!!(fig&&fig.root&&fig.root.visible); G.step(1/30,40); T.place.glass(false,20);"
   " return {ev:!!ev,first:ev&&ev.first,vis,n:G.glass.echoes.length,msg:G.ui.messages().some(m=>/ledger open/.test(m.text))}; })()",
   lambda r: r['ev'] and r['vis'] and r['n']>=9 and r['msg']),
 # checkpoints: the deepest room stood in with an open way back; the stranded fallback when there's none
 ("place:checkpoint", "(()=>{ G.debugEnterUndercroft('mill'); G.step(1/30,40); const cp=G.state.checkpointName, reached=G.undercroft.reached();"
   " G.glass._debug.S.owned=false; G.step(1/30,10); const str=G.undercroft.stranded(), cp2=G.state.checkpointName; const lab=T.place.use(/draught/); T.place.trans();"
   " const room=G.undercroft.room(G.player.pos); G.glass._debug.S.owned=true; G.step(1/30,10); return {cp,reached,str,cp2,lab,room,str2:G.undercroft.stranded()}; })()",
   lambda r: r['cp']=='the mill-race' and 'mill' in r['reached'] and r['str'] and r['cp2']!='the mill-race' and r['room']=='stair' and not r['str2']),
 # persistence: a save made inside comes back inside, lit, with the Glass
 ("place:persist", "(()=>{ const save=JSON.parse(JSON.stringify({u:G.persist?null:null})); const snap=G.flow&&G.flow.snapshot?G.flow.snapshot():null; return {keys:G.persist.keys.filter(k=>k==='undercroft'||k==='glass'),"
   " u:snap&&snap.mods&&snap.mods.undercroft,g:snap&&snap.mods&&snap.mods.glass}; })()",
   lambda r: len(r['keys'])==2 and (r['u'] is None or ('stair' in r['u']['lit'] and r['u']['open'])) and (r['g'] is None or r['g']['owned'])),
 # out through the trapdoor; the Glass on the island: an echo in the hamlet square, a shard/cache outline within 25 m
 ("place:exit", "(()=>{ const a=G.undercroft.rooms.stair.anchors.exit; G.player.teleport(a.x,a.y,a.z-.6,0); G.step(1/30,4); const lab=T.place.use(/Climb up/); T.place.trans(); const d=G.undercroft.door;"
   " return {lab,inside:G.undercroft.inside,dist:+Math.hypot(G.player.pos.x-d.x,G.player.pos.z-d.z).toFixed(2),cam:G.camera.far}; })()",
   lambda r: r['lab'] and not r['inside'] and r['dist']<3 and r['cam']>500),
 ("place:island", "(()=>{ const e=G.glass.echo('square'); G.player.teleport(e.pos.x+1,null,e.pos.z+1,0); G.step(1/30,6); let ev=null; G.on('glass:echo',x=>{ if(x.id==='square')ev=x; }); T.place.glass(true,40); const echo=!!ev;"
   " const PR=G.progress, s=PR.spots.find(q=>!q.cave&&!PR.state.shards[q.id]&&(!q.when||q.when())); let ring=null; if(s){ G.player.teleport(s.pos.x+12,null,s.pos.z,0); G.step(1/30,25); ring=G.glass._debug?G.scene.children.filter(c=>c.isSprite&&c.renderOrder===20&&c.visible).length:0; }"
   " T.place.glass(false,20); return {echo,shard:s&&s.id,ring}; })()",
   lambda r: r['echo'] and (r['shard'] is None or r['ring']>=1)),
 # the 8th waystone: travel straight down to the stair (the same blocking rules)
 ("place:travel", "(()=>{ const lh=G.world.lighthouse; G.player.teleport(lh.doorOut.x-3,null,lh.doorOut.z,-Math.PI/2); G.step(1/30,6); const why=G.map.travelBlock('undercroft'); const ok=G.map.travel('undercroft',{force:true});"
   " for(let i=0;i<120&&G.map.traveling;i++)G.step(1/30,1); G.step(1/30,10); return {why,ok,inside:G.undercroft.inside,room:G.undercroft.room(G.player.pos),mode:G.state.mode}; })()",
   lambda r: r['ok'] and r['inside'] and r['room']=='stair' and r['mode']=='play'),
 # the root cellar's rotten boards give way into the pit (survivable); rubble steps climb back out (last: the pit's Nameless are cleared)
 ("place:trap", "(()=>{ let ev=null; G.on('undercroft:trap',e=>ev=e); G.debugEnterUndercroft('cellars'); G.step(1/30,4); T.hold(); T.place.at(-20,-2,-17.5,-Math.PI/2); G.step(1/30,45); T.hold();"
   " const down=T.place.L(), sprung=G.undercroft.trapSprung, alive=G.player.alive; const clear=()=>{ for(const m of G.monsters.list.slice())if(m.alive&&!m.dying&&m.pos.distanceTo(G.player.pos)<25)G.monsters.kill(m,{dir:new THREE.Vector3(0,0,1)}); };"
   " clear(); G.step(1/30,30); clear(); T.place.at(-21.3,-5.2,-19.7,0); T.hold(); T.place.walk(70); T.hold(); clear(); return {ev:!!ev,sprung,down,alive,out:T.place.L()}; })()",
   lambda r: r['ev'] and r['sprung'] and r['down'][1]<-5 and r['alive'] and abs(r['out'][1]+2)<.15),
 # performance: the interior's own draw calls, and the past layer's (the Traveler, monsters and villagers aren't counted)
 ("place:perf", "(()=>{ ['stair','cellars','chapel','mill','store'].forEach(r=>G.undercroft.lightCandle(r)); G.debugEnterUndercroft('cellars'); G.step(1/30,10); const n=G.undercroft._debug.stats();"
   " let past=0; G.glass.pastLayer.traverse(o=>{ if((o.isMesh||o.isPoints)&&o.visible)past++; }); return {interior:n,past,stats:G.undercroft.stats}; })()",
   lambda r: r['interior']<=60 and r['past']<=30),
]
PLACE_SHOTS={'place:door':'trapdoor','place:candles':'candle','place:glassDoor':'glass-door','place:echo':'echo','place:perf':'cellars-lit'}

# ============================================================== PEOPLE (People agent): talk (mouse + controller), lies, puzzles, names, saving Wren
PEOPLE_HELP="""
T.people={
  U:()=>G.undercroftPeople,
  near(id,d){ const v=G.undercroftPeople.villagers[id], p=v.pos; G.player.teleport(p.x+Math.sin(v.yaw)*(d||1.6),p.y+.1,p.z+Math.cos(v.yaw)*(d||1.6),v.yaw+Math.PI); G.step(1/30,8); },
  use(re){ if(G.talk.isOpen)G.talk.close(); T.play(); T.hold(); G.step(1/30,2); const c=G.interact.pick(G.player.pos), lab=c&&G.interact.label(c); if(!c||(re&&!re.test(lab)))return 'NOPE:'+lab; c.use(); G.step(1/30,2); return lab; },
  at(p){ G.player.teleport(p.x,p.y+.1,p.z,0); G.step(1/30,6); },
  glass(){ if(!G.glass){ G.glass={_stub:true,owned:true,raised:false,raise(on){ this.raised=!!on; G.emit('glass:raise',{on:!!on}); },canSee:()=>true}; } else if(G.glass.give)G.glass.give({silent:true}); return !!G.glass._stub; },
  // the card: advance to the choices / through to the end (pick: the choice index each time choices come up)
  toChoices(){ let n=0; while(G.talk.isOpen&&!G.talk.state().choices.length&&n<30){ G.talk.advance(); n++; } return G.talk.state(); },
  finish(pick){ let n=0; while(G.talk.isOpen&&n<60){ const s=G.talk.state(); if(s.choices.length)G.talk.choose(typeof pick==='function'?pick(s):(pick||0)); else G.talk.advance(); n++; } G.step(1/30,2); return !G.talk.isOpen; },
  // a pretend controller (standard mapping) the game reads through navigator.getGamepads
  pad(){ if(window.__pad)return; window.__pad={id:'Test pad (STANDARD GAMEPAD)',index:0,connected:true,mapping:'standard',timestamp:0,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.__pad]}); },
  btn(i,on){ const b=window.__pad.buttons[i]; b.pressed=!!on; b.value=on?1:0; window.__pad.timestamp++; },
  feedNear(id){ const v=G.undercroftPeople.villagers[id]; const r=G.devtools.giveSwarm(40); const P=G.player.pos; let k=0;
    for(const m of G.creatures.moths)if(m.tgt==='lantern'){ m.p.set(v.pos.x+(Math.random()-.5)*1.6,v.pos.y+1.2,v.pos.z+(Math.random()-.5)*1.6); k++; } return [r,k]; },
};
'ok'"""
PEOPLE=[
 # discovery: the first time the trapdoor stands open and you're within 40 m — a caption and the quest marker (HUD + map)
 ("people:discover", "(()=>{ document.getElementById('begin')&&document.getElementById('begin').click(); G.step(1/30,10); if(!(G.loop&&G.loop.active))G.debugStartLoop(); G.step(1/30,10);"
   " const P=T.people.U(); const before=P.state.discovered; G.undercroft._debug.openDoor(); const d=G.undercroft.door; G.player.teleport(d.x+70,G.world.height(d.x+70,d.z),d.z,0); G.step(1/30,30);"
   " const far=P.state.discovered; G.player.teleport(d.x+12,G.world.height(d.x+12,d.z),d.z,-Math.PI/2); G.step(1/30,30);"
   " return {before,far,disc:P.state.discovered,quest:G.quest.step,target:!!G.quest.target,cap:G.ui.messages().some(m=>/trapdoor stands open/.test(m.text)),pin:!!(G.map&&G.map.markers?G.map.markers.find(m=>m.id==='undercroft'):true)}; })()",
   lambda r: not r['before'] and not r['far'] and r['disc'] and r['quest']=='undercroft' and r['target'] and r['cap']),
 ("people:enter", "(()=>{ document.getElementById('begin')&&document.getElementById('begin').click(); G.step(1/30,10); if(!(G.loop&&G.loop.active))G.debugStartLoop(); G.step(1/30,10);"
   " if(G.devtools)G.devtools.cheats.god=true; G.input.lockPointer=()=>{}; const r=G.debugEnterUndercroft('cellars'); G.step(1/30,20); T.hold(); const P=T.people.U(), u=G.undercroft, out={room:r,built:P.built};"
   " for(const k in P.villagers){ const v=P.villagers[k]; out[k]=[u.room(v.pos),+u.sdf(u.toLocal(v.pos).x,u.toLocal(v.pos).z).toFixed(2)]; } return out; })()",
   lambda r: r['built'] and r['tamsin'][0]=='cellars' and r['corwin'][0]=='chapel' and r['wren'][0]=='chapel' and r['hob'][0]=='mill' and all(r[k][1]<-.3 for k in ['tamsin','corwin','wren','hob'])),
 # never hurt: a staff strike passes through a villager (no hurtbox), with an ash puff
 ("people:noharm", "(()=>{ T.people.near('tamsin',1.2); const hb=[...G.hurtboxes].filter(h=>h.pos.distanceTo(T.people.U().villagers.tamsin.pos)<1.2).length;"
   " G.input.setVirtual('attack',true); G.step(1/30,3); G.input.setVirtual('attack',false); G.step(1/30,20); return {hb,visible:T.people.U().villagers.tamsin.root.visible,mode:G.state.mode}; })()",
   lambda r: r['hb']==0 and r['visible'] and r['mode']=='play'),
 # talk with the mouse: open by interact, play pauses, clicks advance, a click picks a choice
 ("people:mouseOpen", "(()=>{ T.people.near('tamsin'); const lab=T.people.use(/Tamsin/); return {lab,open:G.talk.isOpen,mode:G.state.mode,s:G.talk.state()}; })()",
   lambda r: r['open'] and r['mode']=='paused' and r['s']['name']=='Old Tamsin' and r['s']['index']==0),
 ("people:mouseClicks", "CLICK_TO_CHOICES", None),
 ("people:mouseChoose", "(()=>{ const s=G.talk.state(); return s; })()", lambda r: r and r['index']>=0),
 ("people:mouseClose", "CLICK_LEAVE", None),
 ("people:closed", "(()=>({open:G.talk.isOpen,mode:G.state.mode,talks:T.people.U().state.talks.tamsin,log:G.ui.messages().filter(m=>m.who==='Old Tamsin').length}))()",
   lambda r: not r['open'] and r['mode']=='play' and r['talks']==1 and r['log']>=4),
 # talk with the controller: A opens (Y is use), A / D-pad down advance, D-pad picks, A chooses; B leaves
 ("people:padOpen", "(()=>{ T.people.pad(); T.people.near('tamsin'); return T.people.use(/Tamsin/); })()", lambda r: 'Tamsin' in r),
 ("people:pad", "PAD_DRIVE", None),
 ("people:padDone", "(()=>({open:G.talk.isOpen,mode:G.state.mode,said:T.people.U().state.said.moths,talks:T.people.U().state.talks.tamsin}))()",
   lambda r: not r['open'] and r['mode']=='play' and r['said'] and r['talks']==2),
 # Corwin's lies: through the Glass (raised during talk with G) the line bleeds ink and carries the tag
 ("people:corwin", "(()=>{ window.__pad&&(Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]}),window.__pad=null); T.people.glass(); T.people.near('corwin'); const lab=T.people.use(/Corwin/);"
   " let n=0; while(G.talk.isOpen&&!G.talk.state().lie&&n<10){ G.talk.advance(); G.talk.advance(); n++; } return {lab,s:G.talk.state(),told:T.people.U().state.trapTold}; })()",
   lambda r: r['s']['lie'] and not r['s']['inked'] and r['told']),
 ("people:lieGlass", "LIE_GLASS", None),
 ("people:lieShown", "(()=>{ const s=G.talk.state(); const tag=document.querySelector('#talk .tk-tag'); return {s,tag:tag&&!tag.hidden&&tag.textContent,glass:G.glass.raised}; })()",
   lambda r: r['s']['inked'] and r['tag'] and 'Ink in his words' in r['tag'] and r['glass']),
 ("people:lieLog", "(()=>{ G.talk.close(); G.step(1/30,3); return {glass:!!G.glass.raised,log:G.ui.messages().some(m=>m.who==='Corwin'&&/root cellar/.test(m.text)),mode:G.state.mode}; })()",
   lambda r: not r['glass'] and r['log'] and r['mode']=='play'),
 # the trap Corwin points at (undercroft.js springs it): his line changes
 ("people:trap", "(()=>{ G.emit('undercroft:trap',{pos:G.player.pos.clone()}); G.step(1/30,30); T.people.near('corwin'); T.people.use(/Corwin/); const s=G.talk.state(); G.talk.close(); G.step(1/30,2); return {trap:T.people.U().state.trap,line:s&&s.line}; })()",
   lambda r: r['trap'] and 'root cellar' in r['line']),
 # the bell-ropes: Hob's sentence (three for the grain, two for the well, one for the reeve); a wrong pull starts over
 ("people:bells", "(()=>{ const P=T.people.U(), R=P.debug.props.ropes; let ev=null; G.on('undercroft:puzzle',e=>{ if(e.id==='bells')ev=e; });"
   " const pull=k=>{ const o=R.find(r=>r.kind===k); T.people.at(o.at); return T.people.use(/Pull the rope/); };"
   " const labs=[pull('well')]; const wrong=P.state.bells; for(const k of ['grain','grain','grain','well','well','reeve'])labs.push(pull(k)); G.step(1/30,4);"
   " return {wrong,solved:P.state.bells,ev,labs:labs.slice(0,2)}; })()",
   lambda r: r['wrong']==False and r['solved'] and r['ev'] and r['ev']['solved'] and 'well-bucket' in r['labs'][0]),
 # the sluice gates: grain 3, well 2, reeve 1 turn the stone and lift the portcullis
 ("people:sluice", "(()=>{ const P=T.people.U(), Gs=P.debug.props.gates; let ev=null; G.on('undercroft:puzzle',e=>{ if(e.id==='sluice')ev=e; }); G.debugEnterUndercroft('mill'); G.step(1/30,10);"
   " const want={grain:3,well:2,reeve:1}; let lab=null; for(const g of Gs){ for(let k=0;k<(want[g.kind]||0);k++){ T.people.at(g.at); lab=T.people.use(/gate/); } } G.step(1/30,30);"
   " return {solved:P.state.sluice,ev,lab,mill:G.undercroft.millTurning,port:G.undercroft.gate('portcullis'),gates:P.state.gates}; })()",
   lambda r: r['solved'] and r['ev'] and r['mill'] and r['port']),
 # the register: read it; its echo (the clerk carries the page to the store) moves Wren's story on
 ("people:register", "(()=>{ G.debugEnterUndercroft('chapel'); G.step(1/30,10); const P=T.people.U(); T.people.at(P.debug.props.register.at); const lab=T.people.use(/register/);"
   " T.people.near('wren'); T.people.use(/Wren/); T.people.finish(s=>s.choices.length-1); G.emit('glass:echo',{id:'register',first:true}); G.step(1/30,200); T.people.near('wren'); T.people.use(/Wren/); const s=G.talk.state(); G.talk.close(); G.step(1/30,2); return {lab,reg:P.state.register,echo:P.state.registerEcho,line:s&&s.line}; })()",
   lambda r: r['reg'] and r['echo'] and r['line'] and 'Where did my page go' in r['line']),
 # a page (letter / logbook): three of the People agent's in the dungeon
 ("people:page", "(()=>{ const P=T.people.U(); const o=P.debug.props.pages.sexton; T.people.at(o.pos); const lab=T.people.use(/note/); return {lab,n:Object.keys(P.PAGES).length,read:!!P.state.pages.sexton}; })()",
   lambda r: r['read'] and r['n']>=3),
 # names: after the boss and the ledger, a talk choice speaks each name; Tamsin rests in a drift of pale moths
 ("people:names", "(()=>{ G.emit('undercroft:bossDead',{}); G.emit('undercroft:ledger',{taken:true}); G.step(1/30,90); G.debugEnterUndercroft('cellars'); G.step(1/30,10); T.people.near('tamsin'); const lab=T.people.use(/Tamsin/);"
   " const s=T.people.toChoices(); return {names:T.people.U().state.names,lab,choices:s&&s.choices}; })()",
   lambda r: r['names'] and r['choices'] and r['choices'][0]=='“Wickham Tamsin Rowe.”'),
 ("people:rest", "(()=>{ let rest=null; G.on('undercroft:rest',e=>rest=e); G.talk.choose(0); const last=T.people.toChoices(); G.talk.choose(0); G.step(1/30,60);"
   " const v=T.people.U().villagers.tamsin; const mid={vis:v.root.visible,k:+v.resting.toFixed(2)}; G.step(1/30,120); return {rest,last:last&&last.choices,mid,gone:!v.root.visible,rested:T.people.U().state.rested.tamsin}; })()",
   lambda r: r['rest'] and r['rest']['who']=='tamsin' and r['mid']['k']>0 and r['gone'] and r['rested']),
 ("people:restShot", "(()=>1)()", lambda r: True),
 # saving Wren: her name, then 20 moths feed on her ~10 s while the Nameless crawl up for them
 ("people:wrenName", "(()=>{ G.debugEnterUndercroft('chapel'); G.step(1/30,10); const B=G.undercroftBoss; if(B&&B.debug&&B.debug.clearMine)B.debug.clearMine(); G.step(1/30,2); T.people.near('wren'); const lab=T.people.use(/Wren/); const s=T.people.toChoices(); T.people.finish(0);"
   " G.step(1/30,30); return {lab,ch:s&&s.choices,stage:T.people.U().state.wren.stage,quest:G.quest.step}; })()",
   lambda r: r['stage']=='named' and r['quest']=='undercroft:wren'),
 ("people:wrenFeed", "(()=>{ T.hold(); const f=T.people.feedNear('wren'); let spawned=0, saved=false, t=0, feedAt=null; const site=T.people.U().debug.wrenSite();"
   " for(let i=0;i<30*24&&!saved;i++){ G.step(1/30,1); T.hold(); t+=1/30; if(site.feeding&&feedAt==null)feedAt=t; const d=T.people.U().debug.defence(); if(d)spawned=Math.max(spawned,d.list.length);"
   "  if(i%15===0){ for(const m of G.monsters.list)if(m.alive&&!m.dying&&m.undercroft==='wren'&&m.pos.distanceTo(G.player.pos)<30)G.combat.strike({x:m.pos.x,y:m.pos.y+1,z:m.pos.z,radius:.8,team:'player',damage:1,kind:'melee'}); }"
   "  saved=T.people.U().state.wren.saved; }"
   " const st={}; for(const m of G.creatures.moths)st[m.tgt]=(st[m.tgt]||0)+1; const L=G.items.lantern;"
   " const diag={st,en:site.enabled(),stage:T.people.U().state.wren.stage,near:site.near,cured:site.cured,dP:+G.player.pos.distanceTo(site.pos).toFixed(1),lit:L.lit(),carried:L.carried,mode:G.state.mode,talk:G.talk.isOpen};"
   " return {diag,f,feedAt:feedAt&&+feedAt.toFixed(1),spawned,saved,t:+t.toFixed(1),ink:+T.people.U().villagers.wren.inkK.toFixed(2),card:(document.getElementById('rewardCard')||{}).textContent||''}; })()",
   lambda r: r['saved'] and r['spawned']>=3 and r['feedAt'] is not None and r['t']-r['feedAt']>=9),
 ("people:wrenShot", "(()=>{ G.step(1/30,40); return {card:document.body.innerText.includes('Wren of Wickham’s End')}; })()", lambda r: r['card']),
 # afterwards: Wren lives at the cured well; her loaf (+1 heart for a glowcap); Halloran hears of it
 ("people:hamlet", "(()=>{ T.settle(90); G.undercroft.exit({instant:true}); G.step(1/30,30); const P=T.people.U(); const w=P.debug.hamletWren();"
   " if(!w)return {w:false}; G.player.teleport(w.pos.x+1.6,w.pos.y+.2,w.pos.z,-Math.PI/2); G.step(1/30,8); const lab=T.people.use(/Wren/); const s=G.talk.state();"
   " G.inv.add('glowcap',2,{silent:true}); const p=G.player; p.hp=p.maxHp-2; const hp0=p.hp; T.people.toChoices();"
   " const ch=G.talk.state()&&G.talk.state().choices; G.talk.choose(0); const after=p.hp; T.people.finish(s=>s.choices.length-1);"
   " return {w:true,vis:w.root.visible,lab,title:s&&s.name,ch,healed:after-hp0,left:P.state.wren.left}; })()",
   lambda r: r['w'] and r['vis'] and r['left'] and r['healed']==2 and r['ch'] and 'loaf' in r['ch'][0]),
 ("people:halloran", "(()=>{ const C=G.creatures; const hooks=(C.halloranHooks||[]).length; const lines=[]; const off=G.on('talk',e=>{ if(e.who==='Halloran')lines.push(e.line); }); C.talk(); C.talk(); off&&off(); return {hooks,lines}; })()",
   lambda r: r['hooks']>=1 and any('came back' in l for l in r['lines'])),
]
PEOPLE_SHOTS={'people:mouseOpen':'talk-desktop','people:lieShown':'talk-lie','people:restShot':'rest','people:wrenShot':'wren-saved','people:hamlet':'wren-hamlet'}

async def _people_click_to_choices(pg):
    """the mouse: clicks on the card finish the typing / advance; then a click on the first choice"""
    for i in range(24):
        s=await pg.evaluate('G.talk.state()')
        if not s or s['choices']: break
        await pg.click('#talk .tk-text'); await pg.wait_for_timeout(120)
    s=await pg.evaluate('G.talk.state()'); ok=bool(s and len(s['choices'])>=2)
    await pg.hover('#talk .tk-choice[data-i="1"]'); await pg.wait_for_timeout(150)
    sel=await pg.evaluate('G.talk.state().sel')
    await pg.click('#talk .tk-choice[data-i="0"]'); await pg.wait_for_timeout(200)
    s2=await pg.evaluate('G.talk.state()')
    return {'choices':s and s['choices'],'hoverSel':sel,'after':s2 and s2['line']}, ok and sel==1 and s2 and s2['index']==0
async def _people_click_leave(pg):
    await pg.click('#talk [data-tk=leave]'); await pg.wait_for_timeout(250)
    return {'open':await pg.evaluate('G.talk.isOpen')}, True
async def _people_pad(pg):
    async def press(i):
        # headless Chrome barely runs frames while the game is paused, so step the systems (talk.js reads the pad in its update)
        await pg.evaluate(f'T.people.btn({i},true); G.step(1/30,2); T.people.btn({i},false); G.step(1/30,2)')
    seen=[]
    for i in range(20):
        s=await pg.evaluate('G.talk.state()')
        if not s or s['choices']: break
        seen.append(s['index']); await press(0 if i%2==0 else 13)        # A and D-pad down both advance
    s=await pg.evaluate('G.talk.state()'); c0=s and s['choices']
    await press(13); sel1=await pg.evaluate('G.talk.state().sel')         # D-pad down: the next choice
    await press(12); sel0=await pg.evaluate('G.talk.state().sel')         # D-pad up: back
    await press(0)                                                          # A: "Could they save you?"
    for i in range(16):
        s=await pg.evaluate('G.talk.state()')
        if not s or s['choices']: break
        await press(0)
    s=await pg.evaluate('G.talk.state()'); c1=s and s['choices']
    await press(1)                                                          # B: leave
    jumped=await pg.evaluate('!G.player.grounded')
    return {'seen':seen,'c0':c0,'sel':[sel1,sel0],'c1':c1,'jumped':jumped}, bool(c0 and sel1==1 and sel0==0 and c1 and 'Where are the names?' in c1[0])
async def _people_lie_glass(pg):
    await pg.keyboard.press('KeyG'); await pg.wait_for_timeout(2800)
    return {'raised':await pg.evaluate('!!G.glass.raised')}, True
PEOPLE_SPECIAL={'CLICK_TO_CHOICES':_people_click_to_choices,'CLICK_LEAVE':_people_click_leave,'PAD_DRIVE':_people_pad,'LIE_GLASS':_people_lie_glass}

SECTIONS={'place':(PLACE_HELP,PLACE),'boss':(BOSS_HELP,BOSS),'people':(PEOPLE_HELP,PEOPLE)}
SPECIAL={**PEOPLE_SPECIAL}   # python-driven steps (real mouse clicks, a pretend controller): js = the key


async def run(pg, name, js, check, fails):
    try: r=await pg.evaluate(js)
    except Exception as e: r='EXC '+str(e).split('\n')[0][:300]
    ok=False
    try: ok=bool(check(r)) if not (isinstance(r,str) and r.startswith('EXC')) else False
    except Exception as e: ok=False
    print(('ok  ' if ok else 'FAIL'), name, ':', json.dumps(r)[:700], flush=True)
    if not ok: fails.append(name)
    return r

async def shot(pg, path):
    os.makedirs(os.path.dirname(path),exist_ok=True)
    await pg.evaluate('G.headless&&G.headless.draw(3); 0'); await pg.wait_for_timeout(300)
    await pg.screenshot(path=path,timeout=120000)

SHOTS={'boss:start':'start','boss:quill':None,'boss:copies':'copies','boss:phase3':'ledger','boss:shot':'phase3','boss:defeat':'defeat'}

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
            if not first:   # each section starts from a fresh page (the boss section kills Crane and takes the ledger, etc.)
                await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
                await pg.evaluate("localStorage.removeItem('bq-save-v1')"); await pg.evaluate(HELP)
            first=False
            await pg.evaluate(helpjs)
            for name,js,check in steps:
                if js=='WAIT_RISE':
                    await pg.wait_for_timeout(2600)
                    try: await pg.click('#rise',timeout=20000)
                    except Exception as e: print('FAIL',name,str(e)[:200]); fails.append(name)
                    await pg.wait_for_timeout(300); continue
                if js in SPECIAL:
                    try: r,ok=await SPECIAL[js](pg)
                    except Exception as e: r,ok='EXC '+str(e)[:300],False
                    print(('ok  ' if ok else 'FAIL'), name, ':', json.dumps(r)[:700], flush=True)
                    if not ok: fails.append(name)
                else: await run(pg,name,js,check,fails)
                if SHOTS.get(name) or PEOPLE_SHOTS.get(name) or PLACE_SHOTS.get(name): await shot(pg,f'/tmp/claude-0/undercroft-{sec}/{SHOTS.get(name) or PEOPLE_SHOTS.get(name) or PLACE_SHOTS[name]}.png')
        real=[e for e in errs if '404' not in e]
        for e in real[:10]: print('  ERR',e[:300])
        if real: fails.append('console errors')
        await b.close()
    print(('PASS' if not fails else 'FAIL '+', '.join(fails)), f'{time.time()-t0:.0f}s'); sys.exit(1 if fails else 0)
asyncio.run(main())

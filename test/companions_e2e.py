"""Companions (js/companions.js, COMPANIONS.md): Ember the fox and Corvin the raven.
Covers: earning Ember (the first freed fox stays; a second fox still runs home; Halloran's line) and Corvin (the raven negative on the
standing stones flits off when you come close, a hit weakens it, then the swarm frees it); 9 negatives in all; following (heel, sit
after 2 s, lie after 10 s, Corvin perches or rides your shoulder), the catch-up out of sight (never popping in on screen), through
fast travel, into the sea cave and the Undercroft, onto the cave raft, waiting outside the lighthouse; the commands (R / T, D-pad
left / right, the touch buttons, the prompts at the spots); each of the six spots solved by command with its reward (Maren's key
and sea-chest shard, the nest shard: 14 shards); scouting (pins + 45 s cooldown, then a caw); the fights (a nip breaks a wind-up, a
dive delays an attack, nothing on a boss, no harm ever reaches them); save -> reload -> Continue; old saves (a freed fox gives Ember
quietly; the raven's index gives Corvin). Screenshots in /tmp/claude-0/companions/.
usage: python3 test/companions_e2e.py [url]   (default http://localhost:8983/dev.html?debug&headless)
"""
import asyncio, sys, time, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8983/dev.html?debug&headless'
OUT='/tmp/claude-0/companions'; os.makedirs(OUT,exist_ok=True)

HELP=r"""(()=>{ window.T={}; window.EV=[];
  G.input.lockPointer=()=>{}; G.input.unlockPointer=()=>{};
  for(const n of ['companion:earned','companion:sent','companion:spot','companion:scout','companion:nip','companion:dive','companion:heel','companion:caw','companion:dodge','negative:freed'])
    G.on(n,e=>EV.push(n+':'+JSON.stringify(e||{}).slice(0,80)));
  T.D=()=>G.companions.debug; T.E=()=>G.companions.debug.E; T.C=()=>G.companions.debug.C;
  T.play=()=>{ if(G.state.mode==='paused'&&!(G.map&&G.map.isOpen)){ const pc=document.getElementById('pause'); if(pc&&!pc.hidden)document.getElementById('resume').click(); else G.setMode('play'); } };
  T.clear=()=>{ for(const m of (G.monsters&&G.monsters.list||[]).slice())if(m.alive&&!m.boss)G.monsters.kill(m,{dir:new THREE.Vector3(0,0,1)}); };
  T.tp=(x,z,y,yaw)=>{ T.play(); G.player.teleport(x,y==null?null:y,z,yaw==null?0:yaw); G.step(1/30,4); };
  T.light=()=>{ if(G.fog){ G.fog.radius=G.fog.targetRadius=420; } if(G.lamp)G.lamp.ether=Math.max(G.lamp.ether||0,120); };
  T.tap=(a,n)=>{ G.input.setVirtual(a,true); G.step(1/30,1); G.input.setVirtual(a,false); G.step(1/30,n||2); };
  T.walk=(sec,a)=>{ G.input.setVirtual(a||'forward',true); G.step(1/30,Math.round(sec*30)); G.input.setVirtual(a||'forward',false); };
  T.dE=()=>+T.E().pos.distanceTo(G.player.pos).toFixed(2); T.dC=()=>+T.C().pos.distanceTo(G.player.pos).toFixed(2);
  T.atSpot=id=>{ const s=T.D().SP[id]; T.tp(s.stand.x,s.stand.z,s.place==='island'?null:s.stand.y,Math.atan2(s.at.x-s.stand.x,s.at.z-s.stand.z)); G.step(1/30,40); return T.D().spotHere(s.who)&&T.D().spotHere(s.who).id; };
  T.finish=()=>{ let i=0; for(;i<1200&&(T.E().task||T.C().task);i++)G.step(1/30,1); G.step(1/30,10); G.progress.endReward(); G.step(1/30,4); return i; };
  T.cam=()=>{ const c=G.camera; c.updateMatrixWorld(); const m=new THREE.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse); const f=new THREE.Frustum().setFromProjectionMatrix(m); return p=>f.containsPoint(p); };
  T.pad={id:'Fake Xbox controller',index:0,connected:true,mapping:'standard',timestamp:0,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
  T.padOn=()=>{ navigator.getGamepads=()=>[T.pad]; }; T.padOff=()=>{ navigator.getGamepads=()=>[]; };
  T.btn=(i,on)=>{ T.pad.buttons[i]={pressed:!!on,touched:!!on,value:on?1:0}; T.pad.timestamp++; };
  T.press=i=>{ T.btn(i,true); G.step(1/30,2); T.btn(i,false); G.step(1/30,2); };
  T.msgs=n=>G.ui.messages().slice(-(n||3)).map(m=>m.text);
  T.said=re=>G.ui.messages().some(m=>re.test(m.text));
  // story moments open the conversation card (talk.js): read each one through as it opens (first reply), and note who it was
  window.CARDS=[]; G.on('talk:open',e=>{ CARDS.push(e&&e.who); let n=0; while(G.talk.isOpen&&n<80){ const s=G.talk.state(); if(s.choices.length)G.talk.choose(0); else G.talk.advance(); n++; } });
  return true; })()"""

FRESH=[
 ("boot", r"""(()=>{ const ok=!!G.companions&&G.persist.keys.includes('companions')&&G.creatures.total===9&&G.creatures.negatives.filter(n=>n.kind==='raven').length===1&&G.progress.spots.length===14;
   return {ok,total:G.creatures.total,shards:G.progress.spots.length,names:G.companions.names}; })()"""),
 ("begin", r"""(()=>{ document.getElementById('begin').click(); G.step(1/30,30); G.debugStartLoop(); G.step(1/30,20); T.light(); T.clear();
   return {ok:G.state.mode==='play'&&!G.companions.has('ember')&&!G.companions.has('corvin')&&document.querySelector('#touch [data-act=fox]').hidden}; })()"""),
 # Ember: the first freed fox stays with you
 ("earnEmber", r"""(()=>{ const N=G.creatures.negatives, f=N.find(n=>n.kind==='fox'); T.tp(f.pos.x+3,f.pos.z); f.dying=true; G.step(1/30,90);
   const r={has:G.companions.has('ember'),mode:T.E().mode,said:T.said(/The fox doesn’t run/),freed:G.creatures.freed};
   G.step(1/30,120); r.after=T.E().mode; r.d=T.dE(); r.ok=r.has&&r.mode==='intro'&&r.said&&r.after==='follow'&&r.d<6; return r; })()"""),
 ("secondFox", r"""(()=>{ const N=G.creatures.negatives, f=N.filter(n=>n.kind==='fox')[1]; T.tp(f.pos.x+3,f.pos.z); f.dying=true; G.step(1/30,90);
   const earned=EV.filter(e=>/companion:earned/.test(e)).length; return {ok:earned===1&&f.dead&&G.creatures.freed===2,earned,freed:G.creatures.freed}; })()"""),
 ("halloran", r"""(()=>{ const h=G.creatures.halloran; T.tp(h.pos.x+1.5,h.pos.z); G.creatures.talk(); G.step(1/30,4); const once=T.said(/taken a shine to you/);
   G.creatures.talk(); G.step(1/30,4); const n=G.ui.messages().filter(m=>/taken a shine/.test(m.text)).length; return {ok:once&&n===1,once,n}; })()"""),
 # Corvin: the raven negative on the standing stones
 ("ravenFlits", r"""(()=>{ const R=G.companions.raven; const s0=R.stone; T.tp(R.pos.x+12,R.pos.z); G.step(1/30,10); const seen=T.said(/raven-shaped hole/);
   const lureBefore=R.lure(); T.tp(R.pos.x+2,R.pos.z); G.step(1/30,80); return {ok:seen&&!lureBefore&&R.stone!==s0&&R.state==='perch',seen,lureBefore,s0,s1:R.stone}; })()"""),
 ("ravenWeak", r"""(()=>{ const R=G.companions.raven; const t=R.hb.targetable, al=R.hb.alive(); R.hb.hit({damage:1,dir:new THREE.Vector3(1,0,0)}); R.hb.hit({damage:1,dir:new THREE.Vector3(1,0,0)});
   const prey=G.creatures.negatives.includes(R); return {ok:t&&al&&R.weak>0&&R.lure()&&prey&&T.said(/too tired to lift/),weak:R.weak,lure:R.lure()}; })()"""),
 ("earnCorvin", r"""(()=>{ const R=G.companions.raven; R.bite=3; G.step(1/30,90); const r={dead:R.dead,has:G.companions.has('corvin'),said:T.said(/lands on your shoulder/),freed:G.creatures.freed,toast:document.getElementById('toast').textContent};
   G.step(1/30,300); r.mode=T.C().mode; r.d=T.dC(); r.ok=r.dead&&r.has&&r.said&&r.freed===3&&/of 9/.test(r.toast)&&['fly','land','perch','toShoulder','shoulder'].includes(r.mode)&&r.d<14; return r; })()"""),
 ("ui", r"""(()=>{ const f=document.querySelector('#touch [data-act=fox]'), r=document.querySelector('#touch [data-act=raven]');
   const kb=[...document.querySelectorAll('#pause [data-kb-legend] [data-comp]')].map(e=>e.textContent);
   T.padOn(); T.btn(0,false); G.step(1/30,3); G.ui.refreshLegends&&G.ui.refreshLegends(); const pad=document.querySelector('#pause [data-pad-legend]').textContent; T.padOff(); G.step(1/30,2);
   return {ok:!f.hidden&&!r.hidden&&kb.length===2&&/Ember/.test(pad)&&/Corvin/.test(pad),kb,pad:pad.slice(-80)}; })()"""),
 # following
 ("follow", r"""(()=>{ T.clear(); const p0=G.player.pos.clone(); T.walk(4); const d1=T.dE(), c1=T.dC(); G.step(1/30,100); const sit=T.E().k.sit;
   G.step(1/30,300); const lie=T.E().k.lie; const cm=T.C().mode; const hb=[...G.hurtboxes].some(h=>h===T.E()||h===T.C());
   return {ok:d1<6&&c1<14&&sit>.8&&lie>.8&&['perch','shoulder','land','toShoulder'].includes(cm)&&!hb,d1,c1,sit:+sit.toFixed(2),lie:+lie.toFixed(2),cm,walked:+p0.distanceTo(G.player.pos).toFixed(1)}; })()"""),
 ("shot:moor", "SHOT moor-follow 'T.walk(2.5); G.step(1/30,40); G.player.aimCamera(G.player.heading+Math.PI*.8,.22)'"),
 ("catchUp", r"""(()=>{ const E=T.E(), C=T.C(); const p=G.player.pos; E.pos.set(p.x+60,p.y,p.z); C.pos.set(p.x+70,p.y+6,p.z); G.step(1/30,2);
   const away=E.mode==='away'||E.opa<.1; let popped=false, n=0; const vis=T.cam();
   for(;n<120;n++){ const was=E.opa; G.step(1/30,1); if(was<.05&&E.opa>.5&&vis(E.pos))popped=true; if(E.mode==='follow'&&E.opa>.9&&T.dE()<16)break; }
   G.step(1/30,60); return {ok:away&&!popped&&T.dE()<16&&T.dC()<40,away,popped,n,dE:T.dE(),dC:T.dC()}; })()"""),
 # commands: heel with a bark (R and D-pad left), scouting (T and D-pad right), cooldown -> caw
 ("heel", r"""(()=>{ T.clear(); EV.length=0; T.tap('fox',20); const k=EV.some(e=>/companion:heel/.test(e)); T.padOn(); G.step(1/30,3); T.press(14); G.step(1/30,10); T.padOff(); G.step(1/30,2);
   const n=EV.filter(e=>/companion:heel/.test(e)).length; return {ok:k&&n===2,n,ev:EV.slice(-3)}; })()"""),
 ("scout", r"""(()=>{ T.clear(); const st=G.world.landmarks.stones; T.tp(st.x-6,st.z+14); G.step(1/30,30); EV.length=0; const seen0=G.map.isSeen('cache:stones');
   T.tap('raven',4); const sc=T.C().scoutT>=0; const ev=EV.find(e=>/companion:scout/.test(e)); G.step(1/30,240);
   const pinned=G.map.isSeen('shard:stones')||G.map.isSeen('cache:stones'); const cd=G.companions.state.cd; EV.length=0;
   T.padOn(); G.step(1/30,3); T.press(15); T.padOff(); G.step(1/30,2); const caw=EV.some(e=>/companion:caw.*cooldown/.test(e));
   return {ok:sc&&!!ev&&pinned&&cd>30&&caw&&T.C().scoutT<0,sc,ev,pinned,seen0,cd:+cd.toFixed(1),caw,st:T.C().scoutT}; })()"""),
 # the six spots
 ("spotLog", r"""(()=>{ T.clear(); const here=T.atSpot('log'); const hint=G.hints.map(h=>h.key+' '+h.label); const p0=G.potions.count;
   T.tap('fox',1); const n=T.finish(); return {ok:here==='log'&&hint.some(h=>/^R Send Ember through the gap/.test(h))&&!!G.companions.state.spots.log&&G.potions.count===p0+1,here,hint,n,pot:[p0,G.potions.count]}; })()"""),
 ("shot:emberSpot", "SHOT ember-log 'T.E().carry=\"bundle\"; T.E().mode=\"follow\"; G.step(1/30,30); const s=T.D().SP.log; G.player.aimCamera(Math.atan2(G.player.pos.x-s.at.x,G.player.pos.z-s.at.z)+.4,.3)'"),
 ("spotGrate", r"""(()=>{ T.E().carry=null; const here=T.atSpot('grate'); T.tap('fox',1); const n=T.finish(); const S=G.companions.state;
   return {ok:here==='grate'&&S.spots.grate&&S.key,here,n,key:S.key}; })()"""),
 ("seaChest", r"""(()=>{ G.world.cottage.doorOpen=true; T.tp(157.25,25.45,42.24,Math.PI); G.step(1/30,4); const c=G.interact.pick(G.player.pos); const lbl=c&&G.interact.label(c); const s0=G.progress.shards;
   c&&c.use(); G.step(1/30,10); G.progress.endReward(); G.step(1/30,100); return {ok:/sea-chest/.test(lbl||'')&&G.companions.state.chest&&G.progress.shards===s0+1&&!!G.progress.state.shards.chest&&T.said(/Keep the fox/),lbl,shards:G.progress.shards}; })()"""),
 ("spotBundle", r"""(()=>{ T.clear(); const here=T.atSpot('bundle'); const hint=G.hints.map(h=>h.key+' '+h.label); T.tap('raven',1); const n=T.finish(); const F=T.D().FALL;
   T.tp(F.pos.x+.8,F.pos.z); G.step(1/30,4); const c=G.interact.pick(G.player.pos); const lbl=c&&G.interact.label(c); const i0=G.inv.count('ichor'); c&&c.use(); G.step(1/30,6); G.progress.endReward();
   return {ok:here==='bundle'&&hint.some(h=>/^T Send Corvin up/.test(h))&&F.landed&&lbl==='Open the bundle'&&G.inv.count('ichor')===i0+2,here,hint,n,lbl}; })()"""),
 ("spotNest", r"""(()=>{ T.clear(); const here=T.atSpot('nest'); const s0=G.progress.shards; T.tap('raven',1); const n=T.finish();
   return {ok:here==='nest'&&G.progress.shards===s0+1&&!!G.progress.state.shards.nest,here,n,shards:G.progress.shards}; })()"""),
 ("shot:ravenSpot", "SHOT corvin-nest 'const s=T.D().SP.nest; T.C().mode=\"fly\"; G.step(1/30,20); G.player.aimCamera(Math.PI*.95,.6)'"),
 # fast travel and the lighthouse
 ("travel", r"""(()=>{ T.clear(); G.map.debug.unlock('cottage',{quiet:true}); G.map.travel('cottage'); let n=0; while(G.map.traveling&&n++<200)G.step(1/30,1); G.step(1/30,90);
   return {ok:!G.map.traveling&&T.dE()<16&&T.dC()<40&&T.E().mode!=='away',dE:T.dE(),dC:T.dC(),e:T.E().mode,c:T.C().mode}; })()"""),
 ("towerWait", r"""(()=>{ const L=G.world.lighthouse; T.tp(L.doorIn.x,L.doorIn.z,L.doorIn.y,Math.PI/2); G.step(1/30,150); const e=T.E(), w=e.pos.distanceTo(L.doorOut);
   const r={inside:L.inside(G.player.pos),mode:e.mode,w:+w.toFixed(2),cw:+T.C().pos.distanceTo(L.doorOut).toFixed(2)};
   T.tp(L.doorOut.x-3,L.doorOut.z,null,-Math.PI/2); G.step(1/30,90); r.after=T.E().mode; r.ok=r.inside&&r.mode==='wait'&&r.w<4&&r.cw<6&&r.after==='follow'; return r; })()"""),
 # the sea cave: the crack, the ladder and its bundle; the raft
 ("cave", r"""(()=>{ T.clear(); G.devtools.teleport('comp-crack'); G.step(1/30,90); const here=T.D().spotHere('ember'); const r={inside:G.cave.inside,dE:T.dE(),c:T.C().mode,here:here&&here.id};
   T.tap('fox',1); r.n=T.finish(); const L=T.D().SP.crack.ledge; T.tp(L.x+1.2,L.z,L.y-2.8); G.step(1/30,4); let c=G.interact.pick(G.player.pos); r.l1=c&&G.interact.label(c); c&&c.use(); G.step(1/30,10);
   r.up=+(G.player.pos.y-L.y).toFixed(2); c=G.interact.pick(G.player.pos); r.l2=c&&G.interact.label(c); const v0=G.inv.count('vial'); c&&c.use(); G.step(1/30,6); G.progress.endReward(); r.vial=G.inv.count('vial')-v0;
   r.ok=r.inside&&r.dE<8&&['shoulder','toShoulder'].includes(r.c)&&r.here==='crack'&&G.companions.state.spots.crack&&r.l1==='Climb the rope ladder'&&Math.abs(r.up)<.1&&r.l2==='Open the bundle'&&r.vial===1; return r; })()"""),
 ("raft", r"""(()=>{ const R=G.cavePuzzles.raft; G.cave.enter('channel',{instant:true}); G.step(1/30,40); T.clear(); R.lantern=true; R.state='drifting'; G.step(1/30,120);
   const r={mode:T.C().mode,d:+T.C().pos.distanceTo(R.pos).toFixed(2)}; R.lantern=false; R.state='moored'; G.step(1/30,30); r.after=T.C().mode; r.ok=r.mode==='ride'&&r.d<1&&r.after!=='ride'; return r; })()"""),
 # the Undercroft: the chapel bell
 ("bell", r"""(()=>{ G.cave.exit({instant:true}); G.step(1/30,20); const s=G.flow.snapshot(); s.mods.moths.cured=['well']; s.mods.undercroft={v:1,open:true,lit:[],reached:[],gates:{},trap:false,freeUsed:true,mill:false,prevCp:null}; s.quiet=true;
   G.flow.begin(s); G.step(1/30,20); T.light(); G.devtools.teleport('comp-bell'); G.step(1/30,60); T.clear(); G.step(1/30,30); const here=T.D().spotHere('corvin'); const lit0=G.undercroft.isLit('chapel');
   T.tap('raven',1); const n=T.finish(); G.step(1/30,30); return {ok:G.undercroft.inside&&here&&here.id==='bell'&&!lit0&&G.undercroft.isLit('chapel')&&G.companions.state.spots.bell&&T.said(/Wren/),here:here&&here.id,n,lit:G.undercroft.isLit('chapel'),dE:T.dE()}; })()"""),
 ("cards", r"""(()=>{ const want=['ember','corvin','maren','echo']; return {ok:want.every(w=>CARDS.includes(w)),cards:CARDS}; })()"""),   # the story beats came up as conversation cards
 ("ucFollow", r"""(()=>{ return {ok:T.dE()<10&&['shoulder','toShoulder'].includes(T.C().mode),dE:T.dE(),c:T.C().mode}; })()"""),
 # fights: a nip breaks a wind-up, a dive delays an attack, nothing on a boss, no harm to them
 ("nip", r"""(()=>{ G.undercroft.exit({instant:true}); G.step(1/30,30); T.tp(30,20); T.light(); T.clear(); G.step(1/30,60); const p=G.player.pos;
   const m=G.monsters.spawn('hollow',new THREE.Vector3(p.x+2.5,p.y,p.z),{aggro:true}); G.step(1/30,2); m.state='windup'; m.st=0; m.atk='claw'; m.cool=0; const hp=m.hp;
   const E=T.E(); E.mode='follow'; E.nipCD=0; E.pos.set(p.x-1,p.y,p.z+1); EV.length=0; let n=0; for(;n<40&&!EV.some(e=>/companion:nip/.test(e));n++){ if(m.state!=='windup'){ m.state='windup'; m.st=0; } G.step(1/30,1); }
   const ev=EV.find(e=>/companion:nip/.test(e)); const r={ev,state:m.state,hp:m.hp,hp0:hp,cd:E.nipCD}; G.monsters.kill(m,{dir:new THREE.Vector3(0,0,1)});
   r.ok=!!ev&&/"interrupted":true/.test(ev)&&r.state==='hurt'&&r.hp===hp&&r.cd>4; return r; })()"""),
 ("dive", r"""(()=>{ T.clear(); const p=G.player.pos; const m=G.monsters.spawn('hound',new THREE.Vector3(p.x+5,p.y,p.z),{aggro:true}); G.step(1/30,2); m.state='chase'; m.cool=.3; const hp=m.hp;
   const C=T.C(); C.mode='fly'; C.diveCD=0; C.pos.set(p.x,p.y+4,p.z); EV.length=0; let n=0, cool=0; const d0=G.monsters.delay; G.monsters.delay=(mm,sec)=>{ const b=mm.state==='windup'?-mm.st:mm.cool; const r=d0(mm,sec); cool=(mm.state==='windup'?-mm.st:mm.cool)-b; return r; };
   for(;n<90;n++){ m.cool=Math.min(m.cool,.3); if(m.state!=='chase'&&m.state!=='windup')m.state='chase'; G.step(1/30,1); if(EV.some(e=>/companion:dive/.test(e)))break; } G.monsters.delay=d0;
   const ev=EV.find(e=>/companion:dive/.test(e)); const r={ev,n,cool:+cool.toFixed(2),hp:m.hp,hp0:hp}; G.monsters.kill(m,{dir:new THREE.Vector3(0,0,1)});
   r.ok=!!ev&&/"delayed":true/.test(ev)&&Math.abs(cool-.8)<.01&&r.hp===hp; return r; })()"""),
 ("boss", r"""(()=>{ T.clear(); const e=G.flow.stagEdge(); T.tp(e.x,e.z); G.monsters.startStag(); G.step(1/30,30); const B=G.monsters.boss; const st=B.state;
   const a=G.monsters.interrupt(B), b=G.monsters.delay(B); const E=T.E(), C=T.C(); E.nipCD=0; C.diveCD=0; EV.length=0; G.step(1/30,90);
   const r={boss:!!B,a,b,nips:EV.filter(e=>/nip|dive/.test(e)).length}; G.monsters.kill(B,{dir:new THREE.Vector3(0,0,1)}); G.step(1/30,60); T.clear();
   r.ok=r.boss&&a===false&&b===false&&r.nips===0; return r; })()"""),
 ("invincible", r"""(()=>{ T.clear(); G.step(1/30,30); const E=T.E(), C=T.C(); EV.length=0; const before=[...G.hurtboxes].length;
   const hits=G.combat.strike({x:E.pos.x,y:E.pos.y+.4,z:E.pos.z,radius:1.2,team:'enemy',damage:4,kind:'melee'});
   const hits2=G.combat.strike({x:C.pos.x,y:C.pos.y,z:C.pos.z,radius:1.2,team:'enemy',damage:4,kind:'melee'}); G.step(1/30,10);
   const dodge=EV.filter(e=>/companion:dodge/.test(e)).length; const self=hits.concat(hits2).some(h=>h===E||h===C);
   return {ok:!self&&dodge>=1&&E.on&&C.on&&G.companions.has('ember')&&G.companions.has('corvin'),dodge,self,before}; })()"""),
 ("save", r"""(()=>{ T.clear(); T.play(); G.testSaves=false; G.companions.state.cd=20; const ok=G.flow.writeSave(); const d=G.flow.readSave(); localStorage.setItem('compSpots',JSON.stringify(d.mods.companions));
   return {ok:ok&&d.mods.companions.ember&&d.mods.companions.corvin&&Object.keys(d.mods.companions.spots).length>=6,c:d.mods.companions}; })()"""),
]

AFTER_RELOAD=[
 ("continue", r"""(()=>{ const want=JSON.parse(localStorage.getItem('compSpots')); document.getElementById('continue').click(); G.step(1/30,60);
   const S=G.companions.state; return {ok:S.ember&&S.corvin&&Object.keys(want.spots).every(k=>S.spots[k])&&S.chest&&S.key&&Math.abs(S.cd-want.cd)<3&&!!T.E()&&T.E().on&&T.C().on&&!document.querySelector('#touch [data-act=fox]').hidden&&!EV.some(e=>/companion:earned.*"quiet":false/.test(e)),
     spots:Object.keys(S.spots),cd:S.cd}; })()"""),
 ("oldSaveEmber", r"""(()=>{ const d=G.flow.readSave(); delete d.mods.companions; const N=G.creatures.negatives; d.freed=[N.findIndex(n=>n.kind==='fox')]; d.quiet=true; localStorage.setItem('compOld',JSON.stringify(d)); return {ok:true}; })()"""),
]
AFTER_RELOAD2=[
 ("oldSave", r"""(()=>{ const d=JSON.parse(localStorage.getItem('compOld')); G.flow.begin(d); G.step(1/30,60); const r={ember:G.companions.has('ember'),corvin:G.companions.has('corvin'),said:EV.some(e=>/companion:earned.*"quiet":false/.test(e)),e:T.E().on,ev:EV.slice(-2)};
   r.ok=r.ember&&!r.corvin&&!r.said&&r.e; return r; })()"""),
 ("oldSaveRaven", r"""(()=>{ const d=JSON.parse(localStorage.getItem('compOld')); d.freed=[G.creatures.negatives.findIndex(n=>n.kind==='raven')]; localStorage.setItem('compOld2',JSON.stringify(d)); return {ok:true,idx:d.freed}; })()"""),
]
AFTER_RELOAD3=[
 ("oldSaveRaven2", r"""(()=>{ const d=JSON.parse(localStorage.getItem('compOld2')); G.flow.begin(d); G.step(1/30,60); const R=G.companions.raven;
   const r={corvin:G.companions.has('corvin'),ember:G.companions.has('ember'),ravenGone:R.dead&&!R.model.root.visible,freed:G.creatures.freed}; r.ok=r.corvin&&!r.ember&&r.ravenGone&&r.freed===1; return r; })()"""),
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
                if js.startswith('SHOT'):
                    bits=js.split("'"); tag=bits[1-1].split()[1]; code=bits[1]
                    await pg.evaluate(f"(()=>{{ {code}; G.headless&&G.headless.draw(3); }})()"); await pg.wait_for_timeout(900)
                    await pg.evaluate("document.getAnimations().forEach(a=>{ try{ a.finish(); }catch(_){} })")
                    path=f'{OUT}/{tag}.png'; await pg.screenshot(path=path,timeout=120000); print(f'shot {name:16s} {path}'); r='shot'; continue
                r=await pg.evaluate(js)
                if isinstance(r,dict) and 'ok' in r and not r['ok']: bad.append(r)
            if r=='shot': continue
            good=(bool(r.get('ok')) if isinstance(r,dict) else bool(r)) and not bad
            if bad and r is not bad[-1]: r={'ok':False,'failed':bad,'last':r}
            res[name]=r; ok=ok and good; print(f"{'ok  ' if good else 'FAIL'} {name:16s} {json.dumps(r)[:600]}")
        except Exception as e: ok=False; print(f'FAIL {name:16s} {str(e)[:400]}')
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
        for steps in (AFTER_RELOAD,AFTER_RELOAD2,AFTER_RELOAD3):
            await pg.reload(timeout=180000); await pg.wait_for_timeout(5000); await pg.evaluate(HELP)
            ok=await run_steps(pg,steps,res) and ok
        await b.close()
    for e in errs[:10]: print('  ',e[:300])
    ok=ok and not errs
    print(('PASS' if ok else 'FAIL'), f'{time.time()-t0:.0f}s'); sys.exit(0 if ok else 1)
asyncio.run(main())

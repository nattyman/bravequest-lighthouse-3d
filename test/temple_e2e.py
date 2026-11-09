"""The Vigil (TEMPLE.md) — shared e2e. Each agent owns its sections of SECTIONS (Place: enter/exit, braziers, the Glass walk,
the Lens, mirrors, the well; Boss: Vigilants, the Answer's three phases, Hesper's scenes, the reward, Hesper at the lighthouse,
Wren's choice, save and reload mid-fight and after).
usage: python3 test/temple_e2e.py [url] [--only vigil,boss,people,save]
       (default http://localhost:8800/dev.html?debug&headless)
Screenshots go to /tmp/claude-0/temple-<section>/."""
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

# ============================================================== BOSS AGENT (Vigilants, the Answer, Hesper, the reward)
# The Lens: until lens.js is on the branch, T.b.lens() installs a stand-in with TEMPLE.md's API (owned, focused, beam
# {origin,dir,length,hit}, burnable.add/remove) that burns whatever the beam stays on for `needs` s. With the real lens.js
# loaded, T.b.aim() drives it through G.lens.debug.aim(point) when it has one.
B_HELP="""
T.b={
  start(){ document.getElementById('begin')&&document.getElementById('begin').click(); G.debugStartLoop(); G.step(1/30,10);
    const L=G.items.lantern; L.inCradle=false; L.carried=true; L.found=true; L.shut=false; T.b.lens(); return true; },
  lens(){
    if(G.lens&&!G.lens._stub){ if(G.lens.give)try{G.lens.give({silent:true});}catch(e){} else if('owned' in G.lens)G.lens.owned=true; return 'real'; }
    if(G.lens&&G.lens._stub)return 'stub';
    const V3=G.THREE.Vector3, LS=window.LS={_stub:true,list:[],owned:true,focused:false,beam:{origin:new V3(),dir:new V3(0,0,-1),length:14,hit:null},
      burnable:{add(o){ LS.list.push(o); o.t=0; return o; },remove(o){ const i=LS.list.indexOf(o); if(i>=0)LS.list.splice(i,1); }}};
    G.lens=LS;
    G.system('lensStub',{order:44,modes:['play'],update(dt){ const P=G.player; if(LS.focused&&!LS.fixed)LS.beam.origin.set(P.pos.x,P.pos.y+1.2,P.pos.z);
      for(const o of LS.list.slice()){ if(o.alive&&!o.alive())continue; if(!LS.focused)continue;
        if(G.templeBoss.debug.beamOn(o.pos,o.radius||1)){ o.t+=dt; if(o.t>=o.needs){ LS.list.splice(LS.list.indexOf(o),1); o.onBurn(); } } } }});
    return 'stub'; },
  aim(p){ const L=G.lens; if(!L)return false; if(!L._stub&&L.debug&&L.debug.aim){ L.debug.aim(p); return true; }
    const P=G.player; L.focused=true; L.beam.origin.set(P.pos.x,P.pos.y+1.2,P.pos.z); L.beam.dir.set(p.x-P.pos.x,p.y-(P.pos.y+1.2),p.z-P.pos.z).normalize(); return true; },
  unaim(){ const L=G.lens; if(!L)return; if(!L._stub&&L.debug&&L.debug.aim){ L.debug.aim(null); return; } L.focused=false; },
  beamFor(p,n){ for(let i=0;i<n;i++){ T.b.aim(p); G.step(1/30,1); } T.b.unaim(); },
  strike(p,d,kind){ return G.combat.strike({x:p.x,y:p.y+1,z:p.z,radius:.9,team:'player',damage:d||3,knockback:2,kind:kind||'melee'}).length; },
  face(p){ const P=G.player; P.teleport(P.pos.x,P.pos.y,P.pos.z,Math.atan2(p.x-P.pos.x,p.z-P.pos.z)); if(P.aimCamera)P.aimCamera(P.heading,.1); },
  moths(n){ G.devtools&&G.devtools.giveSwarm&&G.devtools.giveSwarm(n||40); const P=G.player.pos; let k=0;
    for(const m of G.creatures.moths){ if(m.tgt==='lantern'||m.tgt==='wander'){ m.tgt='lantern'; m.p.set(P.x+(Math.random()-.5)*2,P.y+1.4,P.z+(Math.random()-.5)*2); m.v&&m.v.set(0,0,0); k++; } } return k; },
  shut(on){ const L=G.items.lantern; L.shut=!!on; G.emit('lantern:shutter',{shut:L.shut}); },
  readCard(pick){ const out=[]; for(let i=0;i<60&&G.talk.isOpen;i++){ const s=G.talk.state(); if(s.line&&out[out.length-1]!==s.line)out.push(s.line);
      if(s.choices.length){ const k=pick?pick(s.choices):s.choices.length-1; out.push('> '+s.choices[k]); G.talk.choose(k); } else G.talk.advance(); G.step(1/30,2); } return out; },
  sanctum(){ const B=G.templeBoss; B.debug.enter('sanctum'); G.step(1/30,3); const c=B.debug.centre(); G.player.teleport(c.x,c.y+.2,c.z+11,Math.PI); G.step(1/30,6); return c; },
  fight(){ T.b.sanctum(); G.step(1/30,10); T.b.readCard(); G.step(1/30,70); return G.templeBoss.state; },
  vig(room){ const B=G.templeBoss; B.debug.clearMine(); B.debug.enter(room||'nave'); G.step(1/30,12); return B.monsters.filter(m=>m.kind==='vigilant'&&m.alive); },
  side(m){ const P=G.player; const yaw=Math.atan2(m.pos.x-P.pos.x,m.pos.z-P.pos.z)+.42; P.teleport(P.pos.x,P.pos.y,P.pos.z,yaw); if(P.aimCamera)P.aimCamera(yaw,.12); m.heading=Math.atan2(P.pos.x-m.pos.x,P.pos.z-m.pos.z); },
  near(m,d,face){ const P=G.player; const a=Math.atan2(P.pos.x-m.pos.x,P.pos.z-m.pos.z); let x=m.pos.x+Math.sin(a)*d, z=m.pos.z+Math.cos(a)*d;
    P.teleport(x,G.floorAt(x,z,m.pos.y+2),z,Math.atan2(m.pos.x-x,m.pos.z-z)); if(P.aimCamera)P.aimCamera(P.heading,.15); },
};
'ok'"""

VIGIL=[
 ("vig:packs", "(()=>{ T.b.start(); G.templePeople.debug.meet(); const B=G.templeBoss, out={}; for(const room of ['vestibule','nave','reliquary','cloister','well','sanctum']){ B.debug.clearMine(); B.debug.enter(room); G.step(1/30,12); out[room]={}; for(const m of B.monsters)if(m.alive&&m.temple===room)out[room][m.kind]=(out[room][m.kind]||0)+1; }"
   " return out; })()",
   lambda r: all(2<=r[k].get('vigilant',0)<=4 for k in ['vestibule','nave','reliquary','cloister','well']) and r['well'].get('hound')==2 and not r['sanctum']),
 ("vig:skin", "(()=>{ T.b.shut(true); const vs=T.b.vig('nave'); const m=vs[0]; return {n:vs.length,skin:m.skin,name:m.hb.name,hp:m.hp,state:m.state,burnable:!!m.burnH}; })()",
   lambda r: r['n']>=2 and r['skin']==1 and r['name']=='Vigilant' and r['hp']==5 and r['state']=='idle' and r['burnable']),
 # light brings them; the dark keeps you hidden
 ("vig:dark", "(()=>{ T.b.shut(true); const vs=T.b.vig('nave'), m=vs[0]; for(const o of vs.slice(1))G.monsters.despawn(o); G.step(1/30,30); const s0=m.state; T.b.near(m,6); G.step(1/30,90); return {s0,state:m.state}; })()",
   lambda r: r['state']=='idle'),
 ("vig:light", "(()=>{ const m=G.templeBoss.monsters.find(m=>m.kind==='vigilant'&&m.alive); let seen=null; const off=G.on?0:0; T.b.shut(false); let t=0; for(let i=0;i<40;i++){ G.step(1/30,1); t+=1/30; if(m.state==='chase'&&seen==null)seen=t; } return {state:m.state,seen}; })()",
   lambda r: r['seen'] is not None and r['seen']<.5),
 ("vig:lose", "(()=>{ const m=G.templeBoss.monsters.find(m=>m.kind==='vigilant'&&m.alive); const P=G.player; T.b.near(m,9); T.b.shut(true); let lost=null, t=0; for(let i=0;i<200;i++){ T.hold(); G.step(1/30,1); t+=1/30; if(m.state!=='chase'&&lost==null&&!['windup','attack','recover','hurt'].includes(m.state))lost=t; } return {state:m.state,lost:lost&&+lost.toFixed(2)}; })()",
   lambda r: r['lost'] is not None and 2.5<=r['lost']<=5 and r['state'] in ('search','return','idle')),
 ("vig:beamHear", "(()=>{ const m=G.templeBoss.monsters.find(m=>m.kind==='vigilant'&&m.alive); G.step(1/30,240); T.b.near(m,20); T.b.shut(true); G.step(1/30,5); const s0=m.state; const P=G.player;"
   " T.b.aim({x:P.pos.x+Math.sin(P.heading+1.5)*5,y:P.pos.y+1,z:P.pos.z+Math.cos(P.heading+1.5)*5}); G.step(1/30,20); const s1=m.state; T.b.unaim(); T.b.shut(false); return {s0,s1}; })()",
   lambda r: r['s0']!='chase' and r['s1']=='chase'),
 ("vig:glance", "(()=>{ const m=G.templeBoss.monsters.find(m=>m.kind==='vigilant'&&m.alive); T.hold(); T.b.near(m,2.2); G.step(1/30,2); const hp0=m.hp; let g=0; const f=()=>g++; G.on('vigilant:glance',f); T.b.strike(m.pos,3); T.b.strike(m.pos,4,'bolt'); G.step(1/30,2); return {hp0,hp:m.hp,glances:g,skin:m.skin}; })()",
   lambda r: r['hp']==r['hp0']==5 and r['glances']>=2 and r['skin']==1),
 ("vig:shot_skin", "(()=>{ const m=G.templeBoss.monsters.find(m=>m.kind==='vigilant'&&m.alive); G.templeBoss.debug.clearMine; T.b.shut(false); T.b.near(m,4.2); T.b.side(m); m.state='windup'; m.st=.5; m.flare=.6; G.step(1/30,2); return m.skin; })()", lambda r: r==1),
 ("vig:burn", "(()=>{ const m=G.templeBoss.monsters.find(m=>m.kind==='vigilant'&&m.alive); T.hold(); T.b.near(m,3.5); let t=0; for(let i=0;i<60&&m.skin;i++){ T.hold(); T.b.aim(m.skinPos); G.step(1/30,1); t+=1/30; } T.b.unaim(); G.step(1/30,45);"
   " const vis=m.parts.skin.visible; return {skin:m.skin,t:+t.toFixed(2),vis}; })()",
   lambda r: r['skin']==0 and 1.0<=r['t']<=1.6 and r['vis'] is False),
 ("vig:shot_burned", "(()=>{ const m=G.templeBoss.monsters.find(m=>m.kind==='vigilant'&&m.alive); T.hold(); T.b.near(m,4.2); T.b.side(m); m.state='chase'; G.step(1/30,2); return m.skin; })()", lambda r: r==0),
 ("vig:kill", "(()=>{ const m=G.templeBoss.monsters.find(m=>m.kind==='vigilant'&&m.alive&&!m.skin); let n=0; while(m.alive&&!m.dying&&n<6){ T.hold(); T.b.strike(m.pos,2); n++; G.step(1/30,3); } return {n,dying:m.dying}; })()",
   lambda r: r['dying'] and r['n']==3),
 # one attack: a long readable wind-up (sleeves rise), then a 2-half-heart sweep
 ("vig:attack", "(()=>{ const vs=T.b.vig('reliquary'); const m=vs[0]; for(const o of vs.slice(1))G.monsters.despawn(o); T.b.shut(false); T.hold(); T.b.near(m,1.8); m.state='chase'; m.cool=0; const P=G.player, hp0=P.hp; let wind=null, hit=null, t=0;"
   " for(let i=0;i<120;i++){ G.step(1/30,1); t+=1/30; if(m.state==='windup'&&wind==null)wind=t; if(P.hp<hp0&&hit==null){hit=t;break;} } return {lead:hit&&wind?+(hit-wind).toFixed(2):null,dmg:hp0-P.hp}; })()",
   lambda r: r['lead'] and r['lead']>=0.8 and r['dmg']==2),
]

BOSS=[
 # Hesper knows him at once: the card at the seam; the fight starts when it closes
 ("boss:meet", "(()=>{ T.b.start(); T.b.sanctum(); G.step(1/30,30); const s=G.talk.state(); return {who:s&&s.who,line:s&&s.line,portrait:!!(G.portraits&&G.portraits.get('hesper-ink')),state:G.templeBoss.state}; })()",
   lambda r: r['who']=='hesper' and r['line']=='You’re late, Tide.' and r['portrait'] and r['state']=='dormant'),
 ("boss:meetCard", "(()=>{ const out=T.b.readCard(c=>c.length>1&&c[0].startsWith('How long')&&!window._asked?(window._asked=1,0):c.length-1); G.step(1/30,10); const B=G.templeBoss;"
   " return {lines:out,met:G.templePeople.met,state:B.state,bar:(document.getElementById('bossName')||{}).textContent||''}; })()",
   lambda r: r['met'] and r['state'] in ('intro','fight') and any('first seam' in l for l in r['lines']) and any('Together' in l for l in r['lines']) and 'The Answer' in r['bar']),
 # phase 1: the hands
 ("boss:handRise", "(()=>{ const B=G.templeBoss; B.debug.hold(true); G.step(1/30,50); T.hold(); B.debug.hold(false); B.debug.spawnHand(); B.debug.hold(true); const h=B.hands.find(h=>h.state==='rising'); let t=0; while(h&&h.state==='rising'&&t<4){ G.step(1/30,1); t+=1/30; }"
   " return {lead:+t.toFixed(2),state:h&&h.state,skin:h&&h.skinOn}; })()",
   lambda r: r['lead']>=1.1 and r['state']=='reach' and r['skin']),
 ("boss:handGlance", "(()=>{ const B=G.templeBoss, h=B.hands.find(h=>h.state==='reach'); T.hold(); T.b.near({pos:h.pos},3); G.step(1/30,2); const hp0=h.hp; T.b.strike(h.pos,3); G.step(1/30,2); return {hp0,hp:h.hp,skin:h.skinOn}; })()",
   lambda r: r['hp']==r['hp0']==6 and r['skin']),
 ("boss:handBurn", "(()=>{ const B=G.templeBoss, h=B.hands.find(h=>h.state==='reach'); T.hold(); let t=0; for(let i=0;i<60&&h.skinOn;i++){ T.b.aim({x:h.pos.x,y:h.pos.y+1.05,z:h.pos.z}); G.step(1/30,1); t+=1/30; } T.b.unaim();"
   " const hp0=B.hp; let n=0; while(h.state!=='sink'&&h.state!=='off'&&n<6){ T.b.strike(h.pos,2); n++; G.step(1/30,4); } return {t:+t.toFixed(2),skin:h.skinOn,n,dmg:hp0-B.hp}; })()",
   lambda r: r['skin'] is False and r['t']<=1.4 and r['n']==3 and r['dmg']==12),
 ("boss:slam", "(()=>{ const B=G.templeBoss; B.debug.hold(false); B.debug.spawnHand(); B.debug.hold(true); G.step(1/30,52); const h=B.hands.find(h=>h.state==='reach'); T.hold(); const P=G.player; const hp0=P.hp; h.slamCool=0;"
   " B.debug.hold(false); B.debug.B.handT=99; P.teleport(h.pos.x+1.5,h.pos.y+.2,h.pos.z,0); let wind=null,hit=null,t=0; for(let i=0;i<60;i++){ G.step(1/30,1); t+=1/30; if(h.state==='slamWind'&&wind==null)wind=t; if(P.hp<hp0&&hit==null){hit=t;break;} } B.debug.hold(true);"
   " return {lead:hit&&wind?+(hit-wind).toFixed(2):null,dmg:hp0-P.hp}; })()",
   lambda r: r['lead'] and r['lead']>=0.85 and r['dmg']==2),
 ("boss:grip", "(()=>{ const B=G.templeBoss, h=B.hands.find(h=>h.state!=='off'&&h.state!=='sink'); const P=G.player; const c=B.debug.centre(); P.teleport(c.x+12,c.y+.2,c.z,0); B.debug.hold(false); B.debug.B.handT=99; const hold0=B.hold, r0=B.debug.B.inkR; let said=[]; const f=e=>said.push(e.hold); G.on('temple:hesperHold',f);"
   " let k=0; while(B.hold===hold0&&k<900){ G.step(1/30,1); k++; } B.debug.hold(true); return {hold0,hold:B.hold,ring:+(B.debug.B.inkR-r0).toFixed(2),secs:+(k/30).toFixed(1),said}; })()",
   lambda r: r['hold']==r['hold0']-1 and r['ring']>1 and r['said']),
 ("boss:shot1", "(()=>{ const B=G.templeBoss; B.debug.hold(false); B.debug.spawnHand(); B.debug.spawnHand(); B.debug.hold(true); G.step(1/30,55); const c=B.debug.centre(); T.hold(); G.player.teleport(c.x+2,c.y+.2,c.z+8,Math.PI-.2); G.step(1/30,3); return B.hands.filter(h=>h.state==='reach').length; })()",
   lambda r: r>=1),
 ("boss:phase2", "(()=>{ const B=G.templeBoss; B.debug.hold(false); let k=0; while(B.phase===1&&k<300){ T.hold(); const h=B.hands.find(h=>h.state==='reach'); if(h){ B.debug.burnHand(h); B.debug.breakHand(h); } G.step(1/30,10); k++; } G.step(1/30,90);"
   " return {phase:B.phase,hp:B.hp,pose:B.hesper.pose,solid:+B.solid.toFixed(2),mins:+(k*10/30/60).toFixed(2)}; })()",
   lambda r: r['phase']==2 and r['hp']<=72 and r['pose']=='stand' and r['solid']<.2),
 # the inverse of the Gloaming: only glare in the light, solid in the dark
 ("boss:glare", "(()=>{ const B=G.templeBoss; B.debug.hold(true); T.b.shut(false); G.step(1/30,20); const c=B.debug.seam(); const P=G.player; T.hold(); P.teleport(c.x,c.y+.2,c.z+3.5,Math.PI); G.step(1/30,2);"
   " const hp0=B.hp; T.b.strike(c,3); G.step(1/30,4); const lit=hp0-B.hp; T.b.shut(true); G.step(1/30,25); const sol=+B.solid.toFixed(2); const hp1=B.hp; T.b.strike(c,3); G.step(1/30,4); return {lit,solid:sol,dark:hp1-B.hp}; })()",
   lambda r: r['lit']==0 and r['solid']>.9 and r['dark']==3),
 ("boss:shot2dark", "(()=>{ const c=G.templeBoss.debug.seam(); G.player.teleport(c.x+1,c.y+.2,c.z+9,Math.PI); G.step(1/30,4); return G.templeBoss.solid; })()", lambda r: r>.9),
 ("boss:shot2glare", "(()=>{ T.b.shut(false); G.step(1/30,30); return G.templeBoss.solid; })()", lambda r: r<.1),
 ("boss:sweep", "(()=>{ const B=G.templeBoss, c=B.debug.seam(), P=G.player; T.hold(); P.teleport(c.x,c.y+.2,c.z+4.5,Math.PI); G.step(1/30,2); const hp0=P.hp; B.debug.attack('sweep'); let hit=null,t=0; for(let i=0;i<60;i++){ G.step(1/30,1); t+=1/30; if(P.hp<hp0&&hit==null)hit=t; } return {lead:hit&&+hit.toFixed(2),dmg:hp0-P.hp}; })()",
   lambda r: r['lead'] and r['lead']>=1.0 and r['dmg']==2),
 ("boss:grasp", "(()=>{ const B=G.templeBoss, c=B.debug.seam(), P=G.player; G.step(1/30,30); T.hold(); P.teleport(c.x+5,c.y+.2,c.z+5,Math.PI); G.step(1/30,2); const hp0=P.hp; B.debug.attack('grasp'); let hit=null,t=0; for(let i=0;i<60;i++){ G.step(1/30,1); t+=1/30; if(P.hp<hp0&&hit==null)hit=t; } return {lead:hit&&+hit.toFixed(2),dmg:hp0-P.hp}; })()",
   lambda r: r['lead'] and r['lead']>=1.05 and r['dmg']==2),
 ("boss:flare", "(()=>{ const B=G.templeBoss, c=B.debug.seam(), P=G.player; G.step(1/30,30); T.hold(); P.teleport(c.x+3,c.y+.2,c.z+9,Math.PI); G.step(1/30,2); T.b.shut(false); let hp0=P.hp; B.debug.attack('glare'); G.step(1/30,60); const lit=hp0-P.hp;"
   " G.step(1/30,30); T.hold(); P.teleport(c.x+3,c.y+.2,c.z+9,Math.PI); G.step(1/30,3); hp0=P.hp; B.debug.attack('glare'); G.step(1/30,8); T.b.shut(true); G.step(1/30,55); const shut=hp0-P.hp; return {lit,shut}; })()",
   lambda r: r['lit']==2 and r['shut']==0),
 # phase 3: it eats the moths (Hesper catches the ones that come near her); the beam on the seam seals it
 ("boss:phase3", "(()=>{ const B=G.templeBoss, c=B.debug.seam(), P=G.player; T.b.shut(true); G.step(1/30,20); let k=0; while(B.phase===2&&k<40){ T.hold(); T.b.strike(c,3); G.step(1/30,6); k++; } T.hold();"
   " T.b.shut(false); T.b.moths(40); G.step(1/30,150); return {phase:B.phase,hp:B.hp,pose:B.hesper.pose,eaten:B.eaten}; })()",
   lambda r: r['phase']==3 and r['hp']<=30 and r['pose']=='seal' and r['eaten']>=1),
 ("boss:seal", "(()=>{ const B=G.templeBoss, c=B.debug.seam(), P=G.player; B.debug.hold(true); T.hold(); P.teleport(c.x,c.y+.2,c.z+7,Math.PI); G.step(1/30,2); for(let i=0;i<60;i++){ T.b.aim({x:c.x,y:c.y+.5,z:c.z}); G.step(1/30,1); } const k1=B.seal; T.b.unaim(); G.step(1/30,60); const k2=B.seal;"
   " return {k1:+k1.toFixed(3),k2:+k2.toFixed(3),hp:+B.hp.toFixed(1)}; })()",
   lambda r: 0.13<=r['k1']<=0.2 and r['k2']<r['k1'] and r['k2']>r['k1']-0.1),
 ("boss:shot3", "(()=>{ const B=G.templeBoss, c=B.debug.seam(); B.debug.hold(false); for(let i=0;i<20;i++){ T.hold(); T.b.aim({x:c.x,y:c.y+.5,z:c.z}); G.step(1/30,1); } return B.seal>0; })()", lambda r: r),
 ("boss:defeat", "(()=>{ const B=G.templeBoss, c=B.debug.seam(), P=G.player; let dead=0; const f=()=>dead++; G.on('temple:bossDead',f); for(let i=0;i<400&&B.state!=='dying'&&B.state!=='dead';i++){ T.hold(); T.b.aim({x:c.x,y:c.y+.5,z:c.z}); G.step(1/30,1); } T.b.unaim(); G.step(1/30,130);"
   " return {state:B.state,defeated:B.defeated,dead,flag:G.flag('answerDead')}; })()",
   lambda r: r['defeated'] and r['state']=='dead' and r['dead']==1 and r['flag']),
 # the reward: the 9th heart on the closed seam (+2 Marks), and the Lens ground true (or ether)
 ("boss:heart", "(()=>{ T.play(); const pr=G.progress, P=G.player, h0=P.maxHp; const c=G.templeBoss.debug.seam(); for(let i=0;i<24;i++){ if(pr.state.hearts.answer)break; const a=i/24*Math.PI*2; P.teleport(c.x+1.4+Math.cos(a)*.3,c.y+.2,c.z+1.4+Math.sin(a)*.3,0); G.step(1/30,6); }"
   " G.step(1/30,200); T.settle(20); G.step(1/30,200); T.settle(20); return {heart:!!pr.state.hearts.answer,marks:pr.state.marks.answer,max0:h0,max:P.maxHp,reward:G.templeBoss.reward,bosses:pr.journal?null:null}; })()",
   lambda r: r['heart'] and r['marks']==2 and r['max']==r['max0']+2 and r['reward'] in ('lens','ether')),
]

PEOPLE=[
 ("ppl:ending", "(()=>{ T.b.start(); T.b.fight(); const B=G.templeBoss; B.debug.kill(); for(let i=0;i<200&&!G.talk.isOpen;i++)G.step(1/30,1);"
   " const s=G.talk.state(); return {who:s&&s.who,line:s&&s.line}; })()",
   lambda r: r['who']=='hesper' and r['line']=='Tide.'),
 ("ppl:endingCard", "(()=>{ const out=T.b.readCard(c=>c.length>1?0:c.length-1); G.step(1/30,40); return {lines:out,freed:G.templePeople.freed,mark:!!G.templePeople.hesper.arms.find(a=>a.mark&&a.mark.visible)}; })()",
   lambda r: r['freed'] and r['mark'] and any('moth’s wing' in l for l in r['lines']) and any('Come home' in l for l in r['lines'])),
 ("ppl:carving", "(()=>{ for(let i=0;i<8;i++){ if(G.progress.endReward)G.progress.endReward(); G.step(1/30,30); T.play(); } const P=G.player, c=G.templeBoss.anchor('sanctum','carving'), s=G.templeBoss.debug.seam(); P.teleport(s.x,s.y+.2,s.z-4,Math.atan2(c.x-s.x,c.z-(s.z-4))); if(P.aimCamera)P.aimCamera(P.heading,.0); G.step(1/30,5);"
   " if(!G.glass)G.glass={owned:true,raised:false,canSee:()=>true,_stub:true}; const g=G.glass; if(g.give)g.give({silent:true}); if(g.raise)g.raise(true); else g.raised=true; G.step(1/30,90); const seen=G.templePeople.state.carving;"
   " const op=+G.templePeople.debug.carving().mat.opacity.toFixed(2); for(let i=0;i<40&&!G.templePeople.home;i++)G.step(1/30,30); if(g.raise)g.raise(false); else g.raised=false; G.step(1/30,30); return {seen,op,home:G.templePeople.home}; })()",
   lambda r: r['seen'] and r['op']>.5 and r['home']),
 ("ppl:lighthouse", "(()=>{ G.templeBoss.debug.stub(false); if(G.temple&&G.temple.exit)G.temple.exit({instant:true}); G.emit('temple:exit',{}); const sp=G.templePeople.debug.lampSpot(); const P=G.player; P.teleport(sp.pos.x-1.5,sp.pos.y+.3,sp.pos.z+.6,Math.atan2(1.5,-.6)); G.step(1/30,40);"
   " const h=G.templePeople.atHome; return {vis:!!(h&&h.root.visible),y:+(h&&h.pos.y).toFixed(2),py:+P.pos.y.toFixed(2),label:G.interact.current&&G.interact.current.label}; })()",
   lambda r: r['vis'] and abs(r['y']-r['py'])<1.5),
 ("ppl:shotHome", "(()=>{ for(let i=0;i<6&&G.cine&&G.cine.on;i++){ G.cine.skip(); G.step(1/30,10); } T.play(); const h=G.templePeople.atHome, P=G.player; const x=h.pos.x-1.2, z=h.pos.z+1.6; P.teleport(x,h.pos.y+.2,z,Math.atan2(h.pos.x-x,h.pos.z-z)); if(P.aimCamera)P.aimCamera(P.heading,.12); G.step(1/30,40); return !!h.root.visible; })()", lambda r: r),
 ("ppl:homeTalk", "(()=>{ G.templePeople.debug.talkHome(); G.step(1/30,5); const s=G.talk.state(); const out=T.b.readCard(c=>0); return {first:s&&s.line,choices:s&&s.choices,lines:out}; })()",
   lambda r: r['first'] and 'steadier' in r['first'] and r['lines']),
 ("ppl:halloran", "(()=>{ const hooks=(G.creatures&&G.creatures.halloranHooks)||[]; const a=[]; for(const h of hooks){ const l=h(); if(l)a.push(l); } for(const h of hooks){ const l=h(); if(l)a.push(l); } const again=hooks.map(h=>h()).filter(Boolean); return {a,again}; })()",
   lambda r: any('stair last night' in l for l in r['a']) and any('kettle' in l for l in r['a']) and not any('kettle' in l or 'stair last' in l for l in r['again'])),
 # Wren at the well: about Hesper → the temple is unlocked and marked
 ("ppl:wren", "(()=>{ const up=G.undercroftPeople; up.state.wren.saved=true; up.state.wren.left=true; G.emit('undercroft:exit',{}); G.step(1/30,10); const w=up.debug.hamletWren(); if(!w)return 'no wren'; const P=G.player; P.teleport(w.pos.x+1.6,w.pos.y+.3,w.pos.z,-Math.PI/2); T.settle(10);"
   " const cur=G.interact.pick?G.interact.pick(P.pos):G.interact.current; const label=cur&&(typeof cur.label==='function'?cur.label():cur.label); let un=0; G.on('temple:unlock',()=>un++); G.templePeople.debug.talkWren(); G.step(1/30,4); const lines=T.b.readCard(c=>0); T.play(); G.step(1/30,55); const quest=G.quest.step;"
   " const after=G.interact.pick?G.interact.pick(P.pos):null; const label2=after&&(typeof after.label==='function'?after.label():after.label); return {label,label2,un,lines:lines.length,unlocked:G.templePeople.state.unlocked,quest}; })()",
   lambda r: r['label']=='Ask Wren about Hesper' and r['unlocked'] and r['label2']!='Ask Wren about Hesper' and r['quest'] in ('temple','temple:in')),
 ("ppl:pages", "(()=>{ const tp=G.templePeople; G.templeBoss.debug.enter('vestibule'); G.step(1/30,10); const ids=Object.keys(tp.PAGES); for(const id of ids){ tp.readPage(id); G.step(1/30,2); if(G.talk.isOpen){ T.b.readCard(); } } T.play();"
   " return {n:ids.length,read:Object.keys(tp.state.pages).length,placed:G.temple?G.temple.pages.filter(p=>p.kind==='page'&&tp.pages[p.id]).length:Object.keys(tp.debug.pageObjs).length}; })()",
   lambda r: r['n']>=4 and r['read']==r['n'] and r['placed']==r['n']),
]

SAVE=[
 # mid-fight: the save keeps that she's met; the fight itself starts over (Hesper back at the seam, no card again)
 ("save:mid", "(()=>{ T.b.start(); T.b.fight(); const B=G.templeBoss; B.debug.phase(2); G.step(1/30,30); T.hold(); G.flow.writeSave(); return {phase:B.phase,met:G.templePeople.met}; })()",
   lambda r: r['phase']==2 and r['met']),
 ("save:reload", "RELOAD", None),
 ("save:afterMid", "(()=>{ const B=G.templeBoss; T.b.lens(); const L=G.items.lantern; L.inCradle=false; L.carried=true; G.step(1/30,30); const st0=B.state; T.b.sanctum(); G.step(1/30,40); const card=G.talk.isOpen;"
   " return {st0,state:B.state,phase:B.phase,hp:B.hp,met:G.templePeople.met,card,pose:B.hesper.pose}; })()",
   lambda r: r['st0'] in ('dormant','intro') and r['met'] and not r['card'] and r['state'] in ('intro','fight') and r['phase']==1 and r['hp']==120 and r['pose']=='hold'),
 ("save:death", "(()=>{ const B=G.templeBoss, P=G.player; B.debug.phase(2); G.step(1/30,30); P.hurt({damage:99,kind:'test',dir:new G.THREE.Vector3(),knockback:0,ignoreIframes:true}); G.step(1/30,10); return {mode:G.state.mode}; })()",
   lambda r: r['mode']=='dead'),
 ("save:rise", "WAIT_RISE", None),
 ("save:afterDeath", "(()=>{ const B=G.templeBoss, P=G.player; G.step(1/30,10); const d=B.debug.door(); return {state:B.state,phase:B.phase,hp:B.hp,atDoor:+Math.hypot(P.pos.x-d.x,P.pos.z-d.z).toFixed(1),pose:B.hesper.pose}; })()",
   lambda r: r['phase']==1 and r['hp']==120 and r['atDoor']<3 and r['pose']=='hold'),
 ("save:win", "(()=>{ const B=G.templeBoss; T.hold(); T.b.sanctum(); G.step(1/30,40); B.debug.kill(); G.step(1/30,150); T.settle(30); G.templePeople.debug.goHome(); G.step(1/30,5); G.flow.writeSave(); return {defeated:B.defeated,home:G.templePeople.home}; })()",
   lambda r: r['defeated'] and r['home']),
 ("save:reload2", "RELOAD", None),
 ("save:afterWin", "(()=>{ const B=G.templeBoss, tp=G.templePeople; G.step(1/30,30); return {defeated:B.defeated,state:B.state,home:tp.home,atHome:!!(tp.atHome&&tp.atHome.root.visible),journal:(G.progress.journalData?null:null),bar:!document.getElementById('boss').hidden}; })()",
   lambda r: r['defeated'] and r['state']=='dead' and r['home'] and r['atHome'] and not r['bar']),
]
SHOTS={'vig:shot_skin':'vigilant_skin','vig:shot_burned':'vigilant_burned','boss:meet':'hesper_card','boss:shot1':'phase1','boss:shot2dark':'phase2_dark',
       'boss:shot2glare':'phase2_glare','boss:shot3':'phase3','ppl:endingCard':None,'ppl:ending':'ending_card','ppl:carving':None,'ppl:lighthouse':None,'ppl:shotHome':'hesper_lighthouse','ppl:homeTalk':None}

# ============================================================== (Place agent: add PLACE_HELP / PLACE here, and to SECTIONS)

SECTIONS={'vigil':(B_HELP,VIGIL),'boss':(B_HELP,BOSS),'people':(B_HELP,PEOPLE),'save':(B_HELP,SAVE)}


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

async def boot(pg):
    await pg.evaluate(HELP)

async def main():
    t0=time.time(); fails=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await (await b.new_context(viewport={'width':1000,'height':620},device_scale_factor=2)).new_page(); pg.set_default_timeout(300000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and '404' not in m.text else None)
        first=True
        for sec,(helpjs,steps) in SECTIONS.items():
            if ONLY and sec not in ONLY: continue
            await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
            if first: await pg.evaluate("localStorage.removeItem('bq-save-v1')")
            first=False
            await pg.evaluate("localStorage.removeItem('bq-save-v1')"); await boot(pg); await pg.evaluate(helpjs)
            for name,js,check in steps:
                if js=='RELOAD':
                    try:
                        await pg.reload(); await pg.wait_for_timeout(5000); await boot(pg); await pg.evaluate(helpjs)
                        await pg.evaluate("(()=>{ if(!G.temple&&G.templeBoss.debug)G.templeBoss.debug.stub(true); return 1; })()")
                        await pg.click('#continue'); await pg.wait_for_timeout(2500); await pg.evaluate("T.play(); G.step(1/30,10); 0")
                        print('ok  ',name,flush=True)
                    except Exception as e: print('FAIL',name,str(e)[:200]); fails.append(name)
                    continue
                if js=='WAIT_RISE':
                    await pg.wait_for_timeout(2600)
                    try: await pg.click('#rise',timeout=20000)
                    except Exception as e: print('FAIL',name,str(e)[:200]); fails.append(name)
                    await pg.wait_for_timeout(300); continue
                await run(pg,name,js,check,fails)
                if SHOTS.get(name): await shot(pg,f'/tmp/claude-0/temple-{sec}/{SHOTS[name]}.png')
        real=[e for e in errs if '404' not in e]
        for e in real[:10]: print('  ERR',e[:300])
        if real: fails.append('console errors')
        await b.close()
    print(('PASS' if not fails else 'FAIL '+', '.join(fails)), f'{time.time()-t0:.0f}s'); sys.exit(1 if fails else 0)
asyncio.run(main())

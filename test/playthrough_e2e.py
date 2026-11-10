"""One session, the whole game, to catch breakage at the seams between systems (quest state, saves, music overrides,
checkpoints, captions, monsters left over):
  new game -> Act 1 (door, Halloran, storm lantern, staff, the lamp fails, logbook, Halloran below, the Hollow Stag, Hesper's
  lantern, the cure) -> SAVE/RELOAD/CONTINUE #1 -> the Gloaming (rise intro + skip, sped up) -> ending -> Keep exploring ->
  SAVE/RELOAD/CONTINUE #2 -> the core loop (brew, bait, recruit) -> the sandbar at low tide -> into the sea cave (mouth vein,
  gallery roost/fight/vein/page/seal) -> SAVE/RELOAD/CONTINUE #3 inside the cave -> on to the Undertow's door -> the Undertow
  (shut lantern, moths reveal it, sped up) -> jar, wall, the Wound -> the shortcut -> out -> capture -> cure a blight with the jar.
It teleports between beats and speeds bosses (hp low); the point is the hand-offs, not the puzzles (test/cave_e2e.py plays those).
The one jump that skips puzzles (stair/channel/drafts) is done the way a player's save would carry it: the save written in the
gallery is edited to the Undertow's door (rooms lit, seals eaten) and Continued.
Reuses the T helper library from test/cave_e2e.py. Every beat asserts and prints its time.
usage: python3 test/playthrough_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)   shots: /tmp/claude-0/playthrough/"""
import asyncio, sys, os, re, json, time
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
SHOTS='/tmp/claude-0/playthrough'; os.makedirs(SHOTS,exist_ok=True)
HERE=os.path.dirname(os.path.abspath(__file__))
LIB=re.search(r'LIB=r"""(.*?)"""',open(os.path.join(HERE,'cave_e2e.py')).read(),re.S).group(1)

# extra helpers on top of cave_e2e's T: seams (what is left over), music override tracking, interact-by-label
EXTRA=r"""(()=>{
  const M=G.audio&&G.audio.music; window.MUS=window.MUS||{last:null,log:[]};
  if(M&&M.setOverride&&!M._wrapped){ const so=M.setOverride; M.setOverride=n=>{ MUS.last=n||null; MUS.log.push(n||null); return so(n); }; M._wrapped=1; }
  window.EV=window.EV||[]; if(!G._evHooked){ G._evHooked=1; for(const e of ['finale:start','boss:dead','lamp:failed','lamp:cured','storm:pickup','stag:engage','cave:enter','cave:exit','cave:bossStart','cave:bossDead','cave:wound','gloaming:cine','moths:cured','blight:cured'])G.on(e,d=>EV.push(e+(d&&d.who?':'+d.who:'')+(d&&d.on!=null?':'+d.on:''))); }
  T.OBJ=()=>document.getElementById('obj').textContent;
  T.useL=lab=>{ const c=G.interact.pick(G.player.pos); const l=c&&G.interact.label(c); if(c&&(!lab||l===lab||(lab instanceof RegExp&&lab.test(l))))c.use(); return l; };
  // a card unlocks the pointer and relocks it on close; in a headless page the unlock lands after the card is gone and reads as a pause (flow.js)
  G.input.lockPointer=()=>{}; G.input.unlockPointer=()=>{};
  // the conversation card (talk.js): cave_e2e's LIB reads each card through as it opens (T.talkAuto); T.talk() is what was read since last asked
  T.talk=()=>{ const r=T.talkAuto.read.join(' | '); T.talkAuto.read.length=0; return r; };
  T.card=()=>T.talkAuto.names[T.talkAuto.names.length-1]||'';
  T.cap=()=>{ const c=G.ui.captions?G.ui.captions():null; return c&&c.cur?c.cur.text:''; };
  T.capAll=()=>{ const c=G.ui.captions?G.ui.captions():null; return c?[c.cur&&c.cur.text||''].concat(c.queue.map(q=>q.text)).join(' | '):''; };
  T.god=on=>{ if(G.devtools&&G.devtools.cheats)G.devtools.cheats.god=!!on; };   // the flag only: toggle() would switch saves to the test slot
  T.leftovers=()=>{ const ms=(G.monsters&&G.monsters.list||[]).filter(m=>m.alive&&!m.dying);
    return {alive:ms.length,bosses:ms.filter(m=>m.boss||m.kind==='stag'||m.finale).map(m=>m.kind),near:ms.filter(m=>m.pos.distanceTo(G.player.pos)<25).map(m=>m.kind),
      bossBar:!document.getElementById('boss').hidden,music:MUS.last,mode:G.state.mode,inputOn:G.player.inputEnabled!==false,cine:!!(G.finaleBoss&&G.finaleBoss.debug.cine&&G.finaleBoss.debug.cine.on)}; };
  T.save=()=>{ G.testSaves=false; G.setMode('paused'); document.getElementById('saveBtn').click(); const d=JSON.parse(localStorage.getItem('bq-save-v1')||'null'); return d; };
  return 'extra'; })()"""

ACT1=[
 ("newGame", r"""(()=>{ document.getElementById('begin').click(); G.step(1/30,10);
   return {ok:G.quest.step==='cottage'&&G.lighthouse.darkK>.9&&!!G.lighthouse.beam&&G.state.mode==='play',step:G.quest.step,obj:T.OBJ()}; })()"""),
 ("door", r"""(()=>{ G.player.teleport(172,42,0,Math.PI/2); G.input.setVirtual('forward',true); G.step(1/30,45); G.input.setVirtual('forward',false);
   const c=T.capAll(); return {ok:T.OBJ()==='Find a light'&&G.player.pos.x<176&&/doorway is black/.test(c),obj:T.OBJ(),cap:c.slice(0,80)}; })()"""),
 ("halloran", r"""(()=>{ const p=G.creatures.halloran.pos; G.player.teleport(p.x+1.6,p.y,p.z,0); G.step(1/30,10); T.talk(); const l=T.useL(); const card=T.card()==='Halloran'; const said=T.talk();
   return {ok:card&&T.OBJ()==='Take Halloran’s storm lantern'&&/storm lantern/.test(said),obj:T.OBJ(),first:l,said:said.slice(0,80)}; })()"""),
 ("storm", r"""(()=>{ const S=G.items.storm; G.player.teleport(S.pos.x-1.2,null,S.pos.z,Math.PI/2); G.step(1/30,10); const l=T.useL('Take the storm lantern'); G.step(1/30,10);
   return {ok:S.carried&&T.OBJ()==='Climb to the lamp room'&&!G.items.lantern.found&&G.creatures.lanternCount===0,l,obj:T.OBJ()}; })()"""),
 ("climb", r"""(()=>{ G.player.teleport(172,42,0,Math.PI/2); G.input.setVirtual('forward',true); G.step(1/30,70); G.input.setVirtual('forward',false);
   const inside=G.world.lighthouse.inside(G.player.pos), o1=T.OBJ();
   const s=G.items.staff.pos; G.player.teleport(s.x-.9,G.floorAt(s.x-.9,s.z,s.y)+.01,s.z-.6,0); G.player.pos.y=53.7; G.step(1/30,10); const l=T.useL(); G.step(1/30,4);
   return {ok:inside&&o1==='Take the Keeper’s Staff'&&G.items.staff.owned&&T.OBJ()==='Climb to the lamp room',inside,o1,l,obj:T.OBJ()}; })()"""),
 ("lampFails", r"""(()=>{ G.player.teleport(181.5,66,-1.5,0); G.player.pos.y=66; G.step(1/30,10); const l=T.useL('Set the storm lantern in the cradle'); G.step(1/30,10);
   const c0=T.capAll(); G.step(1/30,180); const S=G.items.storm;
   return {ok:/Halloran’s lantern in the cradle/.test(c0)&&S.failed&&S.carried&&!S.inCradle&&T.OBJ()==='Go back down'&&G.flag('stormFailed')&&EV.includes('lamp:failed')&&!G.lighthouse.cured,
     l,cap0:c0.slice(0,60),obj:T.OBJ(),failed:S.failed}; })()"""),
 ("logbook", r"""(()=>{ const lb=G.interact.list.find(o=>G.interact.label(o)==='Read the logbook on the sill'); const p=lb.pos(); G.player.teleport(p.x,66,p.z,0); G.player.pos.y=66; G.step(1/30,6);
   T.talk(); const l=T.useL('Read the logbook on the sill'); G.step(1/30,2); const card=T.card(); const c=T.talk();
   return {ok:G.flag('logbook')&&card==='The keeper’s logbook'&&/They always came to the lamp/.test(c)&&G.state.mode==='play',l,card,read:c.slice(0,60)}; })()"""),
 ("downToHalloran", r"""(()=>{ G.player.teleport(181.4,66,1.6,0); G.player.pos.y=66; G.step(1/30,90);
   const d=G.world.lighthouse.doorIn; G.player.teleport(d.x,d.y,d.z,-Math.PI/2); G.input.setVirtual('forward',true); G.step(1/30,50); G.input.setVirtual('forward',false); G.step(1/30,10);
   const scene=T.talk();   // his scene at the foot of the tower (a card when it's calm)
   const h=G.creatures.halloran.pos; const o=T.OBJ(); G.player.teleport(h.x-1.6,null,h.z,Math.PI/2); G.step(1/30,10); T.useL(); const said=T.talk();
   return {ok:o==='Talk to Halloran'&&T.OBJ()==='Find Hesper’s lantern'&&Math.hypot(h.x-180,h.z)<14,o,obj:T.OBJ(),scene:scene.slice(0,50),said:said.slice(0,60)}; })()"""),
 ("stag", r"""(()=>{ let walkT=0; while((G.ui.captions().queue.length||G.ui.captions().cur)&&walkT<1200){ G.step(1/30,1); walkT++; }   // the walk west (minutes, in play) lets the lamp room's lines finish; the teleport would otherwise stack them in front of the Stag's
   const e=G.flow.stagEdge(); G.player.teleport(e.x-8,null,e.z,-Math.PI/2); G.step(1/30,30); const b=G.monsters.boss; G.step(1/30,20);
   // the Stag's entrance line is high priority: on screen at once, or after at most one other high line's minimum (teleports here
   // compress minutes of walking into frames, so the previous beat's lines are still up)
   let wait=0; while(!/stag made of absence/.test(T.cap())&&wait<150){ G.step(1/30,1); wait++; } const cap=T.cap();
   G.step(1/30,70); const L=G.items.lantern.pos;
   return {ok:!!b&&b.kind==='stag'&&T.OBJ()==='Take back Hesper’s lantern'&&G.state.checkpointName==='the edge of the old wood'&&/stag made of absence/.test(cap)&&wait<=120&&MUS.last!=='boss',capWait:+(wait/30).toFixed(1),
     kind:b&&b.kind,obj:T.OBJ(),cp:G.state.checkpointName,cap:cap.slice(0,50),stagState:b&&b.state,walk:+(walkT/30).toFixed(1)}; })()"""),
 ("stagDown", r"""(()=>{ T.god(true); const b=G.monsters.boss; let n=0; while(b&&b.alive&&!b.dying&&n<120){ G.combat.strike({x:b.pos.x,y:b.pos.y+1,z:b.pos.z,radius:3,team:'player',damage:4}); G.step(1/30,12); n++; }
   G.step(1/30,150); T.god(false); const lo=T.leftovers();
   return {ok:EV.includes('boss:dead:stag')&&G.flow.stagDead&&T.OBJ()==='Take Hesper’s lantern'&&G.state.mode==='play'&&document.getElementById('ending').hidden&&!lo.bosses.includes('stag')&&!lo.bossBar,
     strikes:n,obj:T.OBJ(),left:lo}; })()"""),
 ("lantern", r"""(()=>{ const L=G.items.lantern.pos; G.player.teleport(L.x+1,null,L.z,0); G.step(1/30,10); const l=T.useL(); G.step(1/30,40);
   return {ok:G.items.lantern.carried&&T.OBJ()==='Carry the lantern to the lighthouse'&&G.items.storm.spent&&G.creatures.lanternCount>=40,l,obj:T.OBJ(),swarm:G.creatures.lanternCount}; })()"""),
 ("shot:swarm",None),
 ("cure", r"""(()=>{ G.player.teleport(172,42,0,Math.PI/2); G.input.setVirtual('forward',true); G.step(1/30,70); G.input.setVirtual('forward',false);
   G.player.teleport(181.5,66,-1.5,0); G.player.pos.y=66; G.step(1/30,10); const l=T.useL(); const inC=G.items.lantern.inCradle; G.step(1/30,450);
   return {ok:inC&&G.items.lantern.cured&&T.OBJ()==='Something is climbing the cliff'&&G.lighthouse.beam.lit&&G.lighthouse.darkK<.05&&EV.includes('lamp:cured'),
     l,obj:T.OBJ(),cured:G.atmo.cured.toFixed(2)}; })()"""),
 ("shot:cured",None),
]
SAVE1=[
 ("save1:afterCure", r"""(()=>{ const d=T.save(); window._s1={obj:T.OBJ(),staff:G.items.staff.owned};
   return {ok:!!d&&d.lampCured&&!d.bossDead&&d.staff,step:d&&d.step,lampCured:d&&d.lampCured}; })()"""),
 ("reload","RELOAD"),
 ("continue1", r"""(()=>{ G.step(1/30,30); const lo=T.leftovers();
   return {ok:G.state.mode==='play'&&T.OBJ()==='Something is climbing the cliff'&&G.items.lantern.cured&&G.items.lantern.inCradle&&G.lighthouse.cured&&G.lighthouse.beam.lit&&G.items.staff.owned
     &&!G.finaleBoss.active&&!G.monsters.boss&&lo.bosses.length===0&&!lo.bossBar&&!G.loop.active,obj:T.OBJ(),step:G.quest.step,left:lo,beam:G.lighthouse.beam.lit}; })()"""),
]
FINALE=[
 ("gloamingRises", r"""(()=>{ const lh=G.world.lighthouse, d=lh.doorOut; G.player.teleport(d.x-1,d.y,d.z,-Math.PI/2); G.input.setVirtual('forward',true);
   let k=0; while(!EV.includes('finale:start')&&k<240){ G.step(1/30,1); k++; } G.input.setVirtual('forward',false); G.step(1/30,20);
   const C=G.finaleBoss.debug.cine, cap=T.capAll();
   return {ok:EV.includes('finale:start')&&G.finaleBoss.active&&G.finaleBoss.state==='intro'&&C.on&&G.player.inputEnabled===false&&/fog answers the light/.test(cap)&&MUS.last==='boss'&&T.OBJ()==='Defend the lighthouse'&&!G.monsters.boss,
     frames:k,cine:C.on,input:G.player.inputEnabled,cap:cap.slice(0,70),music:MUS.last,obj:T.OBJ()}; })()"""),
 ("shot:gloaming-rise",None),
 ("skipIntro", r"""(()=>{ G.step(1/30,20); G.input.setVirtual('attack',true); G.step(1/30,1); G.input.setVirtual('attack',false); G.step(1/30,3);
   const C=G.finaleBoss.debug.cine, B=G.finaleBoss.debug.B, P=G.player; const a=Math.atan2(B.pos.x-P.pos.x,B.pos.z-P.pos.z), d=Math.abs(G.U.angDiff(a,P.camYaw));
   return {ok:!C.on&&P.inputEnabled!==false&&d<.35&&!document.getElementById('gloamingCine').style.opacity.startsWith('1'),cine:C.on,input:P.inputEnabled,camOff:+d.toFixed(2)}; })()"""),
 ("shot:gloaming-handback",None),
 ("gloamingDown", r"""(()=>{ T.god(true); const FB=G.finaleBoss, D=FB.debug, B=D.B; let k=0; while(B.state!=='fight'&&k<400){ G.step(1/30,1); k++; }
   D.setHp(2); k=0; while(!FB.solid&&k<600){ G.step(1/30,1); k++; }
   const b=B.pos, L=G.world.lighthouse, a=Math.atan2(b.x-L.x,b.z-L.z); G.player.teleport(b.x-Math.sin(a)*4,42,b.z-Math.cos(a)*4,a);
   const hb=D.bodyHB; G.combat.strike({x:hb.pos.x+2.4,y:hb.pos.y+1,z:hb.pos.z,radius:1.1,team:'player',damage:3,knockback:5,kind:'melee'});
   k=0; while(!EV.includes('boss:dead:gloaming')&&k<400){ G.step(1/30,1); k++; } G.step(1/30,30); const capNow=T.capAll();
   k=0; while(G.state.mode!=='ending'&&k<600){ G.step(1/30,1); k++; } T.god(false); const lo=T.leftovers();
   return {ok:EV.includes('boss:dead:gloaming')&&G.state.mode==='ending'&&!document.getElementById('ending').hidden&&FB.defeated&&!lo.bossBar&&MUS.last===null&&D.hollows.filter(m=>m.alive).length===0&&/Caught in the light|goes up into the light/.test(capNow),
     mode:G.state.mode,defeated:FB.defeated,left:lo,music:MUS.last,cap:capNow.slice(0,80)}; })()"""),
 ("shot:ending",None),
 ("keepExploring", r"""(()=>{ document.getElementById('keep').click(); G.step(1/30,60); const lo=T.leftovers();
   return {ok:G.state.mode==='play'&&G.loop.active&&document.getElementById('ending').hidden&&!lo.bossBar&&G.finaleBoss.state!=='intro'&&!G.finaleBoss.active,obj:T.OBJ(),loop:G.loop.active,left:lo}; })()"""),
]
SAVE2=[
 ("save2:afterGloaming", r"""(()=>{ G.step(1/30,20); const d=T.save(); return {ok:!!d&&d.bossDead&&d.loop,step:d&&d.step,bossDead:d&&d.bossDead,loop:d&&d.loop}; })()"""),
 ("reload","RELOAD"),
 ("continue2", r"""(()=>{ G.step(1/30,30); const before=EV.filter(e=>e==='finale:start').length;
   const d=G.world.lighthouse.doorOut; G.player.teleport(d.x-2,d.y,d.z,-Math.PI/2); G.step(1/30,60); const lo=T.leftovers();   // stepping out again must not raise it again
   return {ok:G.state.mode==='play'&&G.loop.active&&G.flow.bossDead&&!G.finaleBoss.active&&EV.filter(e=>e==='finale:start').length===before&&!lo.bossBar&&G.lighthouse.cured&&!lo.cine,
     obj:T.OBJ(),left:lo,bossState:G.finaleBoss.state}; })()"""),
]
LOOP_CAVE=[
 ("brewAndBait", r"""(()=>{ const L=G.items.lantern; const fromCradle=L.inCradle;
   let took=null; if(L.inCradle){ G.player.teleport(181.1,66,0,-Math.PI/2); G.player.pos.y=66; G.step(1/30,6); took=T.useL('Take the lantern from the lamp'); G.step(1/30,6); }
   G.alchemy.learn('bait'); G.alchemy.debug.give('ichor',5); G.alchemy.debug.give('glowcap',12);
   G.player.teleport(151.8,42,32.1,0); G.step(1/30,5);
   const brewed=['tincture','tincture','tincture','tincture','bait','bait'].map(id=>G.alchemy.brew(id,{instant:true}));
   G.alchemy.debug.setTide(40); G.step(1/30,2); G.player.teleport(95,G.floorAt(95,55.5),55.5,Math.PI); G.step(1/30,20);
   return {ok:brewed.every(Boolean)&&L.carried&&!L.inCradle&&G.inv.count('vial')>=4&&G.moths.baitLeft>200,fromCradle,took,carried:L.carried,vials:G.inv.count('vial'),ether:G.alchemy.etherUnits,bait:Math.round(G.moths.baitLeft)}; })()"""),
 ("recruit", r"""(()=>{ const p=G.world.landmarks.patches.reduce((a,b)=>Math.hypot(b.x-95,b.z-55)<Math.hypot(a.x-95,a.z-55)?b:a);
   const r=T.walk([[90,45],[p.x+4,p.z+4]],{max:2400}); T.wait(10,{until:()=>T.swarm()>=24}); T.wait(2); const r2=T.walk([[90,45],[95,55.5]],{max:2400});
   return {ok:(r.ok||r.d<3)&&r2.ok&&T.swarm()>=12,swarm:T.swarm()}; })()"""),
 ("sandbar", r"""(()=>{ const tw=T.until(()=>G.tide.low,9000);
   const r=T.walk([[97,55.7],[110,56.7],[124,55.9],[138,56.9],[152,56.2],[166,57.5],[176,57.7],[181.2,56],[181.2,51.6]],{max:4000}); T.wait(1);
   window._in={sw:T.swarm(),near:T.near(14)};
   return {ok:G.tide.low&&r.ok&&G.caveBoss.discovered&&T.label()==='Enter the sea cave'&&/Keepers/.test(T.OBJ()),tideWait:tw,swarm:window._in,lab:T.label(),obj:T.OBJ()}; })()"""),
 ("enterCave", r"""(()=>{ const u=T.use(/Enter/); T.wait(2.5); const near=T.near(14), sw=T.swarm();
   return {ok:u==='Enter the sea cave'&&G.cave.inside&&G.cave.room(G.player.pos)==='mouth'&&sw>=window._in.sw-1&&EV.includes('cave:enter'),swarm:sw,near,cp:G.state.checkpointName,obj:T.OBJ()}; })()"""),
 ("shot:cave-mouth",None),
 ("mouthVein", r"""(()=>{ const r=T.walk([[-5.5,-9]],{local:true}); const u=T.use(/vein/i); T.wait(2);
   return {ok:r.ok&&G.cave.isLit('mouth'),u,lit:G.cave.isLit('mouth'),ether:G.alchemy.etherUnits}; })()"""),
 ("gallery", r"""(()=>{ const sw0=T.swarm(); const r=T.walk([[0,-16],[0,-24],[0,-28],[4,-29]],{local:true}); T.wait(3,{until:()=>G.cavePuzzles.roost.count<5});
   const f=T.fight({room:'gallery'}); T.wait(2);
   return {ok:r.ok&&T.swarm()>=sw0+20&&f.left===0,swarm0:sw0,swarm:T.swarm(),fight:f,ichor:G.inv.count('ichor')}; })()"""),
 ("galleryVeinPage", r"""(()=>{ const r=T.walk([[-12.3,-33]],{local:true}); const u=T.use(/vein/i); T.wait(1.5);
   const r2=T.walk([[-4.6,-40.2],[-6.5,-41.6]],{local:true}); T.talk(); const p=T.use(/page/i); T.wait(.5); const read=T.talk(); const cap=T.cap()||read;   // a reading: the card when calm (read through by T.talkAuto), else a caption
   return {ok:G.cave.isLit('gallery')&&p==='Read the page'&&G.caveBoss.pages.includes(1)&&cap.length>0,u,p,cap:cap.slice(0,50)}; })()"""),
 ("gallerySeal", r"""(()=>{ const s=G.cavePuzzles.seals.gallery; T.walk([[0,-41.5]],{local:true}); const t=T.wait(18,{until:()=>s.cured}); T.wait(3);
   return {ok:s.cured&&G.cavePuzzles.open('gallery'),t,swarm:T.swarm()}; })()"""),
]
SAVE3=[
 ("save3:inCave", r"""(()=>{ T.wait(2); const d=T.save(); window._s3={lit:G.cave.litRooms.sort().join(','),pages:G.caveBoss.pages.join(',')}; localStorage.setItem('pt-s3',JSON.stringify(window._s3));   // survives the reload
   return {ok:!!d&&d.mods.cave&&d.mods.cavePuzzles&&d.mods.caveBoss&&d.loop,state:window._s3}; })()"""),
 ("reload","RELOAD"),
 ("continue3", r"""(()=>{ G.step(1/30,30); const s=JSON.parse(localStorage.getItem('pt-s3')||'{}'); const lo=T.leftovers();
   return {ok:G.cave.inside&&G.cave.room(G.player.pos)==='gallery'&&G.loop.active&&G.cave.litRooms.sort().join(',')===s.lit&&G.caveBoss.pages.join(',')===s.pages&&G.cavePuzzles.open('gallery')&&G.items.lantern.carried&&G.flow.bossDead&&!lo.bossBar&&lo.music!=='boss',
     at:T.where(),lit:G.cave.litRooms,pages:G.caveBoss.pages,open:G.cavePuzzles.open('gallery'),carried:G.items.lantern.carried,loop:G.loop.active,bossDead:G.flow.bossDead,obj:T.OBJ(),left:lo}; })()"""),
 ("regroup", r"""(()=>{ // the swarm isn't saved, and the gallery's brinelings are back after a Continue: clear them, then the roost again
   const f=T.fight({room:'gallery',r:30}); const r=T.walk([[2,-30],[5,-29.5]],{local:true}); T.wait(8,{until:()=>T.swarm()>=36}); T.wait(1);
   return {ok:T.swarm()>=20,swarm:T.swarm(),fight:f,roost:G.cavePuzzles.roost.count}; })()"""),
]
UNDERTOW=[
 # the jump past stair/channel/drafts: the gallery save, carried forward the way those rooms would leave it, Continued at the Undertow's door
 ("toUndertowDoor", r"""(()=>{ const d=T.save(); const O=G.cave.origin, door=G.cave.rooms.arena.anchors.door;
   const lit=['mouth','gallery','stair','channel','drafts']; d.mods.cave.lit=lit; d.mods.cave.gates=Object.assign({},d.mods.cave.gates,{channel:true});
   const CP=d.mods.cavePuzzles; CP.lit=lit; CP.open=['gallery','channel','arena']; CP.raft={t:1,done:true};
   d.mods.caveBoss.pages=[1,2]; d.pos=[door.x,door.y+1.4,door.z-3.5]; d.yaw=0;   // just short of the door on the drafts side, facing the arena (+z)
   localStorage.setItem('bq-save-v1',JSON.stringify(d)); return {ok:true,door:[+(door.x-O.x).toFixed(1),+(door.z-O.z).toFixed(1)]}; })()"""),
 ("reload","RELOAD"),
 ("undertowWakes", r"""(()=>{ G.step(1/30,30); G.devtools.giveSwarm(60); G.step(1/30,10); const L=G.items.lantern; if(!L.shut)T.tap('shutter',3);
   const r=T.walk([[60,-33],[60,-30]],{local:true}); T.wait(5,{until:()=>G.caveBoss.state==='idle'}); T.wait(4); const B=G.caveBoss;
   return {ok:G.cave.inside&&r.ok&&L.shut&&B.state!=='sunk'&&B.moths>=8&&B.undertow.vis>.5&&T.hud().boss==='The Undertow'&&G.cave.isLit('drafts')&&!G.cave.isLit('arena'),
     at:T.where(),state:B.state,onBoss:B.moths,vis:+B.undertow.vis.toFixed(2),hud:T.hud(),cap:T.capAll().slice(0,90)}; })()"""),
 ("shot:undertow-dark",None),
 ("undertowDown", r"""(()=>{ T.god(true); const CB=G.caveBoss, D=CB.debug, B=CB.undertow; B.hp=Math.min(B.hp,2); let n=0, hits=0; G.on('cave:bossHit',()=>hits++);
   while(!CB.defeated&&B.state!=='dying'&&n<40){ D.expose(); G.step(1/30,2); const lp=D.lensPos; T.walk([[lp.x,lp.z]],{max:240,tol:1.2,patience:60});
     T.tap('attack',8); n++; }
   if(!CB.defeated&&B.state!=='dying'){ D.kill(); }
   T.wait(14,{until:()=>CB.defeated&&G.moths.jar.owned&&G.cave.wallDown}); T.wait(3); T.god(false); const lo=T.leftovers();
   return {ok:CB.defeated&&G.moths.jar.owned&&G.cave.wallDown&&G.cave.gate('shortcut')&&G.cave.isLit('arena')&&!lo.bossBar&&EV.includes('cave:bossDead')&&!EV.includes('boss:dead')&&G.state.mode==='play'&&document.getElementById('ending').hidden,
     tries:n,hits,killed:hits?'by strikes':'debug.kill',left:lo,jar:G.moths.jar.owned,cap:T.capAll().slice(0,90)}; })()"""),
 ("theWound", r"""(()=>{ const L=G.items.lantern; if(L.shut)T.tap('shutter',3); T.ring(60,-3.2,12.2); T.walk([[60,-2.6]],{local:true}); for(let i=0;i<14;i++){ T.steer(G.cave.origin.x+60,G.cave.origin.z+8); G.step(1/30,1);} T.release(); T.wait(4.5);
   return {ok:G.cave.wallDown&&EV.includes('cave:wound'),wound:EV.includes('cave:wound'),cap:T.capAll().slice(0,90)}; })()"""),
 ("shot:the-wound",None),
 ("outByShortcut", r"""(()=>{ const r=T.ring(44.5,-14.6); const r2=T.walk([[43.5,-14.3],[31,-8.2],[20,-5],[7,-10.4],[2,-12],[0,-6]],{local:true});
   const tw=T.guard(()=>G.cave.water()<-.6,12000); const r3=T.walk([[0,0.5]],{local:true}); T.wait(1); const sw=T.swarm(); const u=T.use(/Leave/); T.wait(3); const lo=T.leftovers();
   return {ok:r.ok&&r2.ok&&u==='Leave the cave'&&!G.cave.inside&&EV.includes('cave:exit')&&!lo.bossBar&&!G.items.lantern.shut&&!/Keepers/.test(T.OBJ()),
     swarm:sw,after:T.swarm(),tideWait:tw,obj:T.OBJ(),left:lo,at:T.where()}; })()"""),
 ("capture", r"""(()=>{ if(T.swarm()<45)G.devtools.giveSwarm(55); G.step(1/30,10); const u=T.use(/Capture/); T.wait(2);
   return {ok:/Capture/.test(u)&&G.moths.jar.count>=40,u,jar:G.moths.jar.count}; })()"""),
 ("cureWithJar", r"""(()=>{ const b=G.blights.find(x=>x.id==='tidepool'); const x=b.pos.x+2.5, z=b.pos.z; G.player.teleport(x,G.floorAt(x,z,(b.pos.y||0)+5),z,0); G.step(1/30,10);
   const u=T.use(/Release/); T.wait(1); const sw=T.swarm(); let t=0;
   while(!b.cured&&t<3600){ const f=T.fight({r:14,max:300}); T.walk([[x,z]],{max:300}); T.wait(1); t+=30+f.steps; }
   T.wait(3); const lo=T.leftovers();
   return {ok:/Release/.test(u)&&b.cured&&G.state.mode==='play'&&!lo.bossBar,released:sw,cured:b.cured,progress:Math.round(b.progress*100),left:lo,obj:T.OBJ()}; })()"""),
 ("shot:blight-cured",None),
]
STEPS=ACT1+SAVE1+FINALE+SAVE2+LOOP_CAVE+SAVE3+UNDERTOW

async def main():
    fails=[]; t00=time.time()
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await (await b.new_context(viewport={'width':1000,'height':600})).new_page(); pg.set_default_timeout(480000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        async def boot():
            await pg.evaluate(LIB); await pg.evaluate(EXTRA)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
        await pg.evaluate("localStorage.removeItem('bq-save-v1'); localStorage.removeItem('bq-save-test-v1')")
        await boot()
        for name,js in STEPS:
            t0=time.time()
            if name.startswith('shot:'):
                await pg.wait_for_timeout(600); await pg.evaluate('G.headless&&G.headless.draw(3); 0'); await pg.wait_for_timeout(300)
                await pg.screenshot(path=f'{SHOTS}/{name[5:]}.png',timeout=120000); print(f'  shot {name[5:]}',flush=True); continue
            try:
                if js=='RELOAD':
                    await pg.reload(); await pg.wait_for_timeout(5000)
                    vis=await pg.evaluate("!document.getElementById('continue').hidden")
                    await pg.click('#continue'); await pg.wait_for_timeout(2500); await boot(); r={'ok':vis,'continueShown':vis}
                else: r=await pg.evaluate(js)
            except Exception as e: r={'ok':False,'exc':str(e).split('\n')[0][:300]}
            ok=bool(r.get('ok')) if isinstance(r,dict) else False
            if not ok: fails.append(name)
            print(('PASS ' if ok else 'FAIL ')+f'{name:20s} {time.time()-t0:5.1f}s',':',json.dumps(r,ensure_ascii=False)[:700],flush=True)
        errs=[e for e in errs if '404' not in e and 'favicon' not in e]
        if errs: print('console errors:\n  '+'\n  '.join(errs[:12]))
        await b.close()
    print(f'\nRESULT ({time.time()-t00:.0f}s):', 'ALL PASS' if not fails and not errs else 'FAILED '+', '.join(fails)+(' + console errors' if errs else ''))
    sys.exit(1 if fails or errs else 0)
asyncio.run(main())

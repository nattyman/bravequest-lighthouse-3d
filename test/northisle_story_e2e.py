"""The north island's story places (northisle_story.js): the drowned graveyard, the Margery's corner, the wrecker's bothy.
- the sites are built and drawn on the island, hidden from home, and their footprints are in G.isleKeepClear;
- Rowan walks from the cove up to the bothy and in through its door with real input (G.input.setVirtual), onto its floor;
  walls stop him, the roof lifts while he's inside;
- on a fresh landing every readable thing gives its 'before' lines (and arriving at the rise and the hut says theirs), and no
  'before' line names his father (no "father", "Da", "Tobias", "Knox");
- the read flags survive a save and a reload;
- after the ledger the same things give their 'known' lines (the labels ask to be read again); the north-isle-known start;
- after the fire room: the 'lived' and the 'died' lines, and their hooks (the stove's embers go out when he died).
- slice 5, the island after the ending: 'lived' adds the lanterns by the cairns, the stove lit and his new logbook on the shelf,
  the path's stones stacked at the side and the wreck in the cove propped up and half patched (each with its lines); the loose
  stones and the canted wreck are gone. 'died': "Take the toy boat" starts the sixth cairn; a flat stone is carried from the
  beach with real input (slow; no strikes) up to the sixth place in the Margery's kerb and set down; a roll and a blow each drop
  it back on the beach; the cairn grows with every stone; the toy goes on top and the held shot plays once, with its lines and
  a log line; the Margery's men read differently after; all of it kept over a reload (and an old save without it loads).
usage: python3 test/northisle_story_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)
Screenshots: SHOTS env (default /tmp/claude-0/isle-B)."""
import asyncio, sys, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
SHOTS=os.environ.get('SHOTS','/tmp/claude-0/isle-E'); os.makedirs(SHOTS,exist_ok=True)

LIB=r"""
window.T=(()=>{
const P=()=>G.player, NS=()=>G.northIsleStory;
function play(){ if(G.state.mode==='paused'&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); if(G.state.mode!=='play'&&G.state.mode!=='dead')G.setMode('play'); }
function calm(){ for(let i=0;i<20&&G.talk&&G.talk.isOpen;i++){ const s=G.talk.state&&G.talk.state(); if(s&&s.choices&&s.choices.length)G.talk.choose(0); else G.talk.advance(); } for(let i=0;i<14;i++)G.ui.advance&&G.ui.advance(); play(); }
function run(s){ for(let i=0;i<Math.round(s*30);i++){ G.step(1/30,1); if(G.talk&&G.talk.isOpen)calm(); } }
function said(t){ return G.ui.messages().some(m=>m.text===t); }
function saidAll(L){ return L.filter(t=>!said(t)); }
const KEYS=['forward','back','left','right','sprint'];
function keys(set){ for(const k of KEYS)G.input.setVirtual(k,set.has(k)); }
function release(){ keys(new Set()); }
/* the virtual stick: 8-way keys relative to the camera, dithered between neighbours (cave_e2e.py) */
let pwm=0;
function steer(x,z){ const p=P().pos, dx=x-p.x, dz=z-p.z, d=Math.hypot(dx,dz); if(d<1e-3){ release(); return d; }
  const yaw=P().camYaw, fx=Math.sin(yaw), fz=Math.cos(yaw), my=(dx*fx+dz*fz)/d, mx=(dx*-fz+dz*fx)/d, s=new Set();
  const a=Math.atan2(mx,my)/(Math.PI/4), lo=Math.floor(a), fr=a-lo; pwm+=fr; let k=lo; if(pwm>=1){ pwm-=1; k=lo+1; }
  k=((k%8)+8)%8; for(const n of [['forward'],['forward','right'],['right'],['back','right'],['back'],['back','left'],['left'],['forward','left']][k])s.add(n);
  keys(s); return d; }
function walk(pts,o){ o=o||{}; let steps=0; const tol=o.tol||.5, max=o.max||2400;
  for(let i=0;i<pts.length;i++){ const [x,z]=pts[i]; let best=1e9, bestAt=0;
    while(true){ const d=steer(x,z); if(d<(i===pts.length-1?tol:Math.max(tol,1.0)))break; G.step(1/30,1); steps++; if(G.talk&&G.talk.isOpen)calm();
      if(d<best-.05){ best=d; bestAt=steps; } if(steps-bestAt>90||steps>max){ release(); const p=P().pos; return {ok:false,wp:i,at:[+p.x.toFixed(2),+p.y.toFixed(2),+p.z.toFixed(2)],d:+d.toFixed(2)}; } } }
  release(); G.step(1/30,4); const p=P().pos; return {ok:true,steps,at:[+p.x.toFixed(2),+p.y.toFixed(2),+p.z.toFixed(2)]}; }
/* stand where a reader stands for id and use whatever the game offers there (the real pick) */
function readAt(id){ calm(); const s=NS().sites.stands[id], r=NS().sites.reads[id]; P().teleport(s.x,s.y,s.z,Math.atan2(r.x-s.x,r.z-s.z)); G.step(1/30,3);
  const c=G.interact.pick(P().pos), lab=c&&G.interact.label(c); if(!c)return {lab:null}; c.use(); G.step(1/30,2); return {lab}; }
function check(id,st){ const L=NS().debug.lines(id,st); return {n:L.length,missing:saidAll(L)}; }
const SPOIL=/\b(father|Father|Da|Tobias|Knox)\b/;
/* press a button for a frame with real input (G.input.setVirtual), then let a few frames run */
function press(a,n){ G.input.setVirtual(a,true); G.step(1/30,1); G.input.setVirtual(a,false); G.step(1/30,n==null?3:n); }
/* the lantern out of the way for a screenshot (its glow blows out the sand) */
function stow(){ const L=G.items&&G.items.lantern; if(L&&L.carried){ L.carried=false; L.pos.set(0,-60,0); } }
/* the sixth cairn's stones drawn: [shore stones shown, cairn stones shown, carried shown] */
function stones(){ const D=NS().debug; let a=0,b=0; for(let i=0;i<5;i++){ if(D.stonePos(i).shown)a++; if(D.stonePos(5+i).shown)b++; } return [a,b,D.stonePos(10).shown]; }
let attacks=0; G.on('player:attack',()=>attacks++);
return {P,NS,play,calm,run,said,saidAll,steer,walk,release,readAt,check,SPOIL,press,stow,stones,get attacks(){ return attacks; }};
})(); 'ok'"""

BOTHY_ITEMS=['tally','bunk','stove','chair','toy']
FIELD_ITEMS=['swift','kittiwake','rose','brennick','providence','noname','margery']
ALL=FIELD_ITEMS+BOTHY_ITEMS

def readall(stage):
    # read each thing in turn; return its label and the lines it should have said that weren't
    return "(()=>{ const out={}; for(const id of %s){ const r=T.readAt(id); T.run(.4); out[id]={lab:r.lab,miss:T.check(id,'%s').missing,read:!!T.NS().state.read[id+':%s']}; } return out; })()" % (json.dumps(ALL),stage,stage)
def allread(r,stage,labels=None):
    return all(v['lab'] and not v['miss'] and v['read'] for v in r.values()) and (labels is None or all(labels(k,v['lab']) for k,v in r.items()))

ACT=lambda k,l: l!=G_NAMES.get(k)
G_NAMES={'swift':'The Swift’s cairn','kittiwake':'The Kittiwake’s cairn','rose':'The Rose of Ardrey’s cairn','brennick':'The Brennick Lass’s cairn','providence':'The Providence’s cairn',
         'noname':'The nameless cairn','margery':'The Margery’s men','tally':'The tally marks','bunk':'The bunk','stove':'The stove','chair':'The chair by the window','toy':'The toy boat'}

# the HUD settled before a screenshot: captions advanced just before it leave a sliding copy and fading cards mid-animation
# (a software-rendered frame is slow), which read as a doubled caption panel in the shot
SETTLE="(()=>{ document.querySelectorAll('.caption.leaving').forEach(e=>e.remove()); (document.getAnimations?document.getAnimations():[]).forEach(a=>{ try{ if(a.effect&&a.effect.getTiming().iterations!==Infinity)a.finish(); }catch(_){} }); 0; })()"

def shot(name, js):
    return (name, js, None)

STEPS=[
 ("landing", "(()=>{ localStorage.removeItem('bq-save-v1'); G.devtools.start('north-landing'); T.run(1); T.calm(); const S=T.NS(), sc=G.scene;"
   " return {stage:S.stage(),cairns:S.sites.cairns,reads:Object.keys(S.sites.reads).length,keep:(G.isleKeepClear||[]).filter(k=>/^story:/.test(k.why)).length,"
   " meshes:['nisGraveyard','nisBothy','nisBothyRoof','nisFaces','nisEmber','nisLoose','nisLived','nisCairnStones','nisToyCairn'].map(n=>!!sc.getObjectByName(n)),after:{loose:sc.getObjectByName('nisLoose').visible,lived:sc.getObjectByName('nisLived').visible,stones:sc.getObjectByName('nisCairnStones').visible,toy:S.debug.toyOnTable()},drawn:sc.getObjectByName('northIsleStory').visible,read:Object.keys(S.state.read).length}; })()",
   lambda r: r['stage']=='before' and 40<=r['cairns']<=60 and r['reads']==15 and r['keep']>=10 and all(r['meshes']) and r['drawn'] and r['read']==0
   and r['after']=={'loose':True,'lived':False,'stones':False,'toy':True}),
 ("keepClearHolds", "(()=>{ const K=(G.isleKeepClear||[]).filter(k=>/^story:/.test(k.why)), S=T.NS(), bad=[];"
   " for(const id in S.sites.reads){ const p=S.sites.reads[id]; if(!K.some(k=>Math.hypot(p.x-k.x,p.z-k.z)<k.r))bad.push(id); } return {bad}; })()",
   lambda r: not r['bad']),
 ("walkToBothy", "(()=>{ T.calm(); const N=G.northIsle, b=N.cove.beach, B=T.NS().sites.bothy; T.P().teleport(b.x,null,b.z,Math.PI/2); G.step(1/30,4); T.P().aimCamera(Math.PI/2,.3); G.step(1/30,4);"
   " const w=T.walk([[b.x+8,b.z-3],[186,-664.5],[196,-668.5],[B.x-4.2,B.z],[B.x-1.6,B.z],[B.x+.4,B.z+.2]]); const P=T.P().pos;"
   " return {w,inside:B.inside(P),y:+P.y.toFixed(2),fy:+B.floorY.toFixed(2),roof:G.scene.getObjectByName('nisBothyRoof').visible,arrive:T.check('bothy','before').missing}; })()",
   lambda r: r['w']['ok'] and r['inside'] and abs(r['y']-r['fy'])<.05 and not r['roof'] and not r['arrive']),
 ("wallsHold", "(()=>{ const B=T.NS().sites.bothy, P=T.P(); P.teleport(B.x,null,B.z,0); G.step(1/30,3); const out=[];"
   " for(const [x,z] of [[B.x+6,B.z],[B.x,B.z-5],[B.x,B.z+5]]){ P.teleport(B.x-.2,B.floorY,B.z,0); G.step(1/30,2); const w=T.walk([[x,z]],{max:150}); out.push(B.inside(P.pos)||B.near(P.pos)); }"
   " P.teleport(B.x-.2,B.floorY,B.z,0); G.step(1/30,2); const back=T.walk([[B.x-1.6,B.z],[B.x-4.5,B.z]]); G.step(1/30,4);"
   " return {held:out,out:!B.near(P.pos),back:back.ok,roof:G.scene.getObjectByName('nisBothyRoof').visible}; })()",
   lambda r: all(r['held']) and r['out'] and r['back'] and r['roof']),
 ("shotBothy", None, 'bothy-outside'),
 ("fieldArrive", "(()=>{ T.calm(); const F=T.NS().sites.field, P=T.P(); P.teleport(F.x-15,null,F.z,Math.PI/2); G.step(1/30,4); P.aimCamera(Math.PI/2,.3); const w=T.walk([[F.x-6,F.z]]); T.run(.5);"
   " return {w,miss:T.check('field','before').missing}; })()", lambda r: r['w']['ok'] and not r['miss']),
 ("shotField", None, 'graveyard'),
 ("readBefore", readall('before'), lambda r: allread(r,'before',lambda k,l: l==G_NAMES[k] or True)),
 ("labelsAfterRead", "(()=>{ const S=T.NS(), out={}; for(const id of %s)out[id]=S.debug.label(id); return out; })()" % json.dumps(ALL), lambda r: all(r[k]==G_NAMES[k] for k in r)),
 ("noSpoil", "(()=>{ const S=T.NS(), A=S.debug.all(), bad=[]; for(const id in A)for(const t of A[id].before)if(T.SPOIL.test(t))bad.push(id+': '+t);"
   " const said=G.ui.messages().map(m=>m.text).filter(t=>T.SPOIL.test(t)&&/cairn|Cairn|stroke|tally|bunk|stove|chair|toy|hut|Margery’s men/.test(t)); for(const id in S.debug.reads){ const L=S.debug.reads[id].label; if(L&&T.SPOIL.test(L))bad.push('label '+id); if(S.debug.reads[id].only&&G.interact.list.some(o=>o.enabled&&o.enabled()&&typeof o.pos==='function'&&o.pos()&&o.pos()===S.sites.reads[id]))bad.push('offered '+id); }"
   " return {bad,said,stage:S.stage()}; })()", lambda r: not r['bad'] and not r['said'] and r['stage']=='before'),
 ("logged", "(()=>{ const R=T.NS().debug.reads, miss=[], spoil=[]; for(const id in R){ if(R[id].only)continue; const L=R[id].log&&R[id].log.before; if(!L){ miss.push(id+': none'); continue; } if(!T.said(L))miss.push(id); if(T.SPOIL.test(L))spoil.push(id); } return {miss,spoil}; })()",
   lambda r: not r['miss'] and not r['spoil']),
 ("shotCorner", None, 'margery-corner'),
 ("save", "(()=>{ T.calm(); const P=T.P(), b=G.northIsle.cove.beach; P.teleport(b.x,null,b.z,0); G.step(1/30,4); G.testSaves=false; return {saved:G.flow.writeSave(),n:Object.keys(T.NS().state.read).length}; })()", lambda r: r['saved'] and r['n']>=len(ALL)),
]
AFTER=[
 ("restored", "(()=>{ const S=T.NS(); return {n:Object.keys(S.state.read).length,seen:Object.keys(S.state.seen),stage:S.stage(),lab:S.debug.label('tally')}; })()",
   lambda r: r['n']>=len(ALL) and 'field:before' in r['seen'] and 'bothy:before' in r['seen'] and r['stage']=='before' and r['lab']=='The tally marks'),
 ("ledger", "(()=>{ T.calm(); G.northCave.debug.readLedger(); T.run(1); T.calm(); T.run(6); const S=T.NS(); return {stage:S.stage(),lab:S.debug.label('tally'),labM:S.debug.label('margery')}; })()",
   lambda r: r['stage']=='known' and r['lab']=='Look at the tally marks' and r['labM']=='Read the names'),
 ("readKnown", readall('known'), lambda r: allread(r,'known')),
 ("knownLines", "(()=>{ return {mine:T.said('That one’s mine.'),pellow:T.said('He let the Pellow boys go by on the Gannet. Their father’s up here.'),sixth:T.said('Five cairns. He never built the sixth.')}; })()",
   lambda r: r['mine'] and r['pellow'] and r['sixth']),
 ("knownArrive", "(()=>{ T.calm(); const B=T.NS().sites.bothy, P=T.P(); P.teleport(B.x-9,null,B.z,Math.PI/2); G.step(1/30,3); P.aimCamera(Math.PI/2,.3); const w=T.walk([[B.x-4.2,B.z]]); T.run(.5);"
   " const F=T.NS().sites.field; P.teleport(F.x-15,null,F.z,Math.PI/2); G.step(1/30,3); P.aimCamera(Math.PI/2,.3); const w2=T.walk([[F.x-6,F.z]]); T.run(.5);"
   " return {w:w.ok,w2:w2.ok,bothy:T.check('bothy','known').missing,field:T.check('field','known').missing}; })()",
   lambda r: r['w'] and r['w2'] and not r['bothy'] and not r['field']),
 ("knownStart", "(()=>{ G.devtools.start('north-isle-known'); T.run(1); T.calm(); const S=T.NS(), B=S.sites.bothy, P=T.P().pos; return {stage:S.stage(),near:+Math.hypot(P.x-B.doorOut.x,P.z-B.doorOut.z).toFixed(2),cave:G.northCave.inside,isle:G.northIsle.inside,step:G.quest.step}; })()",
   lambda r: r['stage']=='known' and r['near']<1 and not r['cave'] and r['isle']),
 ("lived", "(()=>{ G.devtools.start('north-lived'); T.run(1); T.calm(); G.northFire.debug.S.trans=null; G.northFire.exit({instant:true}); T.run(1); T.calm(); const S=T.NS();"
   " const out={stage:S.stage(),hook:!!S.state.hooks.lived,ember:G.scene.getObjectByName('nisEmber').visible,reads:{}}; for(const id of ['chair','toy','stove','margery','tally']){ const r=T.readAt(id); T.run(.3); out.reads[id]={lab:r.lab,miss:T.check(id,'lived').missing}; }"
   " out.line=T.said('Now there’s a light here for her to watch back.'); return out; })()",
   lambda r: r['stage']=='lived' and r['hook'] and r['ember'] and all(v['lab'] and not v['miss'] for v in r['reads'].values()) and r['line']),
 ("livedLook", "(()=>{ const S=T.NS(), sc=G.scene, L=sc.getObjectByName('nisLived'); const lights=[]; L.traverse(o=>{ if(o.isLight)lights.push(o.name); });"
   " return {lived:L.visible,loose:sc.getObjectByName('nisLoose').visible,stones:sc.getObjectByName('nisCairnStones').visible,lanterns:S.debug.lanterns.length,lights,"
   " glass:!!sc.getObjectByName('nisLivedGlass'),glow:sc.getObjectByName('nisLivedGlow').geometry.attributes.position.count,toy:S.debug.toyOnTable(),ember:sc.getObjectByName('nisEmber').visible}; })()",
   lambda r: r['lived'] and not r['loose'] and not r['stones'] and r['lanterns']>=10 and len(r['lights'])==2 and r['glass'] and r['glow']==r['lanterns']+1 and r['toy'] and r['ember']),
 ("livedField", "(()=>{ T.calm(); const F=T.NS().sites.field, P=T.P(); P.teleport(F.x-15,null,F.z,Math.PI/2); G.step(1/30,3); P.aimCamera(Math.PI/2,.3); const w=T.walk([[F.x-6,F.z]]); T.run(.5);"
   " return {w:w.ok,miss:T.check('field','lived').missing,lantern:T.said('He’s set a lantern by every one he could put a name to. And a few he couldn’t.')}; })()",
   lambda r: r['w'] and not r['miss'] and r['lantern']),
 ("livedReads", "(()=>{ const out={}; for(const id of ['logbook','patched']){ const r=T.readAt(id); T.run(.4); out[id]={lab:r.lab,miss:T.check(id,'lived').missing,read:!!T.NS().state.read[id+':lived']}; }"
   " out.lines=[T.said('No more of the other kind.'),T.said('He’s patching her. To give back.')]; out.logs=[T.said('His new logbook in the bothy: wind, weather, what passed.')]; return out; })()",
   lambda r: r['logbook']['lab']=='Read the logbook' and r['patched']['lab']=='Look at the boat' and not r['logbook']['miss'] and not r['patched']['miss'] and all(r['lines']) and all(r['logs'])),
 ("livedPath", "(()=>{ T.calm(); const N=G.northIsle, A=N.path[2], B=N.path[3], P=T.P(); P.teleport(A[0],null,A[1],0); G.step(1/30,3); P.aimCamera(Math.atan2(B[0]-A[0],B[1]-A[1]),.3);"
   " const w=T.walk([[(A[0]+B[0])/2,(A[1]+B[1])/2],[B[0],B[1]]]); T.run(.4); return {w:w.ok,at:w.at,miss:T.check('path','lived').missing,seen:!!T.NS().state.seen['path:lived']}; })()",
   lambda r: r['w'] and not r['miss'] and r['seen']),
 ("shotLivedField", None, 'lived-lanterns'),
 ("shotLivedBoat", None, 'lived-patched-boat'),
 ("shotLivedPath", None, 'lived-path-cleared'),
 ("shotLivedLog", None, 'lived-logbook'),
 ("died", "(()=>{ G.devtools.start('north-died'); T.run(1); T.calm(); G.northFire.debug.S.trans=null; G.northFire.exit({instant:true}); T.run(1); T.calm(); const S=T.NS();"
   " const out={stage:S.stage(),hook:!!S.state.hooks.died,ember:G.scene.getObjectByName('nisEmber').visible,reads:{}}; for(const id of ['chair','toy','stove','margery','tally']){ const r=T.readAt(id); T.run(.3); out.reads[id]={lab:r.lab,miss:T.check(id,'died').missing}; }"
   " out.cold=T.said('Cold now. It’ll stay cold.'); out.build=T.said('There’s nothing of him left to put under it. I’ll build it anyway.'); return out; })()",
   lambda r: r['stage']=='died' and r['hook'] and not r['ember'] and all(v['lab'] and not v['miss'] for v in r['reads'].values()) and r['cold'] and r['build']),
 ("diedLook", "(()=>{ const S=T.NS(), sc=G.scene; return {loose:sc.getObjectByName('nisLoose').visible,lived:sc.getObjectByName('nisLived').visible,st:sc.getObjectByName('nisCairnStones').visible,"
   " toy:S.state.cairn.toy,onTable:S.debug.toyOnTable(),offered:G.interact.list.some(o=>o.enabled&&o.enabled()&&/toy boat/.test(G.interact.label(o))),stones:T.stones(),line:T.said('There’s nothing of him to bury. This will have to do.')}; })()",
   lambda r: r['loose'] and not r['lived'] and r['st'] and r['toy']==1 and not r['onTable'] and not r['offered'] and r['stones']==[5,0,False] and r['line']),
 ("sixthPlace", "(()=>{ const r=T.readAt('sixth'); T.run(.4); return {lab:r.lab,miss:T.check('sixth','died').missing,room:T.said('He left room for himself.')}; })()",
   lambda r: r['lab']=='Look at the sixth place' and not r['miss'] and r['room']),
 ("shotBeach", None, 'died-beach-stones'),
 ("shotCarry", None, 'died-carrying'),
 ("carryUp", "(()=>{ T.calm(); const S=T.NS(), D=S.debug, s=S.sites.shore[0], X=S.sites.sixth, P=T.P(); P.teleport(s.x-1.2,null,s.z+.4,Math.PI/2); G.step(1/30,3);"
   " const lab=G.interact.current&&G.interact.label(G.interact.current); T.press('interact'); const held={on:D.carry.on,slow:P.speedMul,st:T.stones()};"
   " const a0=T.attacks; T.press('attack',8); const struck=T.attacks-a0; P.aimCamera(Math.PI,.3); const t0=G.time;"
   " const w=T.walk([[175,-670],[180,-682],[187,-690],[186.4,-695.6],[X.x+.9,X.z-1.1]]); const secs=+(G.time-t0).toFixed(1), at=G.interact.current&&G.interact.label(G.interact.current), still=D.carry.on, last=D.carry.last;"
   " T.press('interact'); T.run(.3); return {lab,held,struck,w,secs,at,still,last,set:S.state.cairn.stones,st:T.stones(),first:T.said(D.cairnLines.first),slowAfter:P.speedMul}; })()",
   lambda r: r['lab']=='Pick up the flat stone' and r['held']['on'] and r['held']['slow']<.7 and r['held']['st']==[4,0,True] and r['struck']==0 and r['w']['ok'] and r['still']
     and r['at']=='Set the stone down' and r['set']==1 and r['st']==[4,1,False] and r['first'] and r['slowAfter']==1),
 ("shotCairnOne", None, 'died-cairn-one'),
 ("rollDrops", "(()=>{ T.calm(); const S=T.NS(), D=S.debug, s=S.sites.shore[1], P=T.P(); P.teleport(s.x-1.2,null,s.z+.4,Math.PI/2); G.step(1/30,3); T.press('interact'); const held=D.carry.on;"
   " P.teleport(s.x-6,null,s.z-3,0); G.step(1/30,14); const away=D.stonePos(1).shown; T.press('roll',0); const states=[]; for(let k=0;k<12;k++){ G.step(1/30,1); states.push(P.state); }"
   " const state=states.includes('roll')?'roll':states[0], back=D.stonePos(1); return {held,away,on:D.carry.on,last:D.carry.last,state,back:back.shown,dist:+Math.hypot(back.x-s.x,back.z-s.z).toFixed(2),line:T.said(D.cairnLines.drop),set:S.state.cairn.stones,lock:P.actionLock}; })()",
   lambda r: r['held'] and not r['away'] and not r['on'] and r['last']=='roll' and r['state']!='roll' and r['lock']==0 and r['back'] and r['dist']<.05 and r['line'] and r['set']==1),
 ("hitDrops", "(()=>{ T.calm(); const S=T.NS(), D=S.debug, s=S.sites.shore[1], P=T.P(); P.teleport(s.x-1.2,null,s.z+.4,Math.PI/2); G.step(1/30,40); T.press('interact'); const held=D.carry.on, hp=P.hp;"
   " const hit=P.hurt({damage:1,kind:'melee',dir:new THREE.Vector3(1,0,0),knockback:2}); G.step(1/30,3); P.heal(9); const back=D.stonePos(1); return {held,hit,on:D.carry.on,last:D.carry.last,back:back.shown,dist:+Math.hypot(back.x-s.x,back.z-s.z).toFixed(2)}; })()",
   lambda r: r['held'] and r['hit'] and not r['on'] and r['last']=='hit' and r['back'] and r['dist']<.05),
 ("helped", "(()=>{ T.calm(); const S=T.NS(), D=S.debug, X=S.sites.stands.sixth, P=T.P(), grew=[], tops=[]; G.step(1/30,40);"
   " for(const i of [1,2,3,4]){ const s=S.sites.shore[i]; P.teleport(s.x-1.2,null,s.z+.4,Math.PI/2); G.step(1/30,3); T.press('interact'); P.teleport(X.x,X.y,X.z,Math.PI); G.step(1/30,3); T.press('interact'); grew.push(S.state.cairn.stones); tops.push(T.stones()[1]); }"
   " T.run(.4); return {grew,tops,last:T.said(D.cairnLines.last),lab:D.label('sixth'),st:T.stones()}; })()",
   lambda r: r['grew']==[2,3,4,5] and r['tops']==[2,3,4,5] and r['last'] and r['lab']=='Set the toy boat on top' and r['st']==[0,5,False]),
 ("toyOnTop", "(()=>{ T.calm(); const S=T.NS(); const r=T.readAt('sixth'); G.step(1/30,40); return {lab:r.lab,cine:G.cine.on,scene:S.debug.sceneOn,done:S.state.cairn.done,toy:G.scene.getObjectByName('nisToyCairn').visible}; })()",
   lambda r: r['lab']=='Set the toy boat on top' and r['cine'] and r['scene'] and r['done']==1 and r['toy']),
 ("shotScene", None, 'died-scene'),
 ("sceneEnds", "(()=>{ G.step(1/30,300); T.run(6); const S=T.NS(), D=S.debug; return {cine:G.cine.on,lines:D.cairnLines.scene.map(t=>T.said(t)),log:T.said(D.cairnLines.log),scene:S.state.cairn.scene}; })()",
   lambda r: not r['cine'] and all(r['lines']) and r['log'] and r['scene']==1),
 ("sceneOnce", "(()=>{ T.calm(); const S=T.NS(), D=S.debug; const again=D.finish(); const r=T.readAt('sixth'); G.step(1/30,20); const cine=G.cine.on; T.run(.4); const m=T.readAt('margery'); T.run(.4);"
   " return {again,lab:r.lab,cine,miss:T.check('sixth','died').missing,built:T.said('He’d have built it better.'),margery:T.check('margery','died').missing,six:T.said('Six now. The skipper’s back with his men.')}; })()",
   lambda r: r['again'] is False and r['lab']=='The sixth cairn' and not r['cine'] and not r['miss'] and r['built'] and not r['margery'] and r['six']),
 ("shotCairnDone", None, 'died-sixth-cairn'),
 ("cairnSave", "(()=>{ T.calm(); G.testSaves=false; return {saved:G.flow.writeSave(),c:T.NS().state.cairn}; })()", lambda r: r['saved'] and r['c']['done']==1),
 ("shotDied", None, 'bothy-inside-died'),
 ("hiddenAtHome", "(()=>{ T.calm(); G.northIsle.cross('home',{instant:true}); T.run(1); return {at:G.northIsle.at,drawn:G.scene.getObjectByName('northIsleStory').visible}; })()",
   lambda r: r['at']=='home' and not r['drawn']),
]
KEPT=[
 ("cairnKept", "(()=>{ T.run(2); T.calm(); const S=T.NS(), c=S.state.cairn; return {stage:S.stage(),c:{toy:c.toy,stones:c.stones,done:c.done,scene:c.scene},toy:G.scene.getObjectByName('nisToyCairn').visible,onTable:S.debug.toyOnTable(),st:T.stones(),lab:S.debug.label('sixth'),cine:G.cine.on}; })()",
   lambda r: r['stage']=='died' and r['c']=={'toy':1,'stones':5,'done':1,'scene':1} and r['toy'] and not r['onTable'] and r['st']==[0,5,False] and r['lab']=='The sixth cairn' and not r['cine']),
 ("oldSave", "(()=>{ const D=T.NS().debug, keep=D.save(); D.load({v:1,read:{'tally:before':1},seen:{},hooks:{}}); G.step(1/30,2); const c=Object.assign({},T.NS().state.cairn), st=T.stones(), toy=D.toyOnTable();"
   " const bad=D.cairnOf({toy:0,used:[0,0,9,'x',2],done:1,scene:1}); D.load(keep); G.step(1/30,2); return {c,st,toy,bad,back:T.NS().state.cairn.done}; })()",
   lambda r: r['c']=={'toy':0,'stones':0,'used':[],'done':0,'scene':0} and r['st']==[5,0,False] and r['toy'] and r['bad']=={'toy':1,'stones':2,'used':[0,2],'done':0,'scene':0} and r['back']==1),
]
SHOTJS={
 'lived-lanterns':"(()=>{ T.calm(); T.stow(); const F=T.NS().sites.field, P=T.P(), x=F.x+3, z=F.z-12; P.teleport(x,null,z,0); P.aimCamera(Math.atan2(F.x-x,F.z-z),.3); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'lived-patched-boat':"(()=>{ T.calm(); T.stow(); const B=T.NS().sites.patched, P=T.P(), x=B.x+4.5, z=B.z+1; P.teleport(x,null,z,0); P.aimCamera(Math.atan2(B.x-x,B.z-z)-.2,.3); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'lived-path-cleared':"(()=>{ T.calm(); T.stow(); const h=T.NS().sites.heaps[0], N=G.northIsle, P=T.P(); let best=null; for(let i=0;i<N.path.length-1;i++){ const a=N.path[i], b=N.path[i+1]; for(let t=0;t<=1;t+=.02){ const x=a[0]+(b[0]-a[0])*t, z=a[1]+(b[1]-a[1])*t, d=Math.hypot(x-h.x,z-h.z); if(!best||d<best.d)best={x,z,d}; } }"
   " P.teleport(best.x,null,best.z,0); P.aimCamera(Math.atan2(h.x-best.x,h.z-best.z)+.5,.42); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'lived-logbook':"(()=>{ T.calm(); T.stow(); const B=T.NS().sites.bothy, P=T.P(); P.teleport(B.x-.4,null,B.z+.9,Math.PI); P.aimCamera(Math.PI*1.05,.62); G.step(1/30,30); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'died-beach-stones':"(()=>{ T.calm(); T.stow(); const s=T.NS().sites.shore[2], P=T.P(), x=s.x-4.5, z=s.z+3.5; P.teleport(x,null,z,0); P.aimCamera(Math.atan2(s.x+1-x,s.z-z),.42); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'died-carrying':"(()=>{ T.calm(); T.stow(); const S=T.NS(), s=S.sites.shore[0], P=T.P(), b=G.northIsle.cove.beach; P.teleport(s.x-1.2,null,s.z+.4,Math.PI/2); G.step(1/30,3); T.press('interact'); P.teleport(b.x+.5,null,b.z+1,0.4); G.step(1/30,4); P.aimCamera(Math.PI+.4,.22); G.step(1/30,16); for(let i=0;i<20;i++)G.ui.advance(); window._afterShot=()=>S.debug.drop('shot'); })()",
 'died-cairn-one':"(()=>{ T.calm(); T.stow(); const X=T.NS().sites.sixth, P=T.P(), x=X.x-1.1, z=X.z-2.4; P.teleport(x,null,z,0); P.aimCamera(Math.atan2(X.x-x,X.z-z)+.25,.5); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'died-scene':"(()=>{ G.step(1/30,90); })()",
 'died-sixth-cairn':"(()=>{ T.calm(); T.stow(); const X=T.NS().sites.sixth, P=T.P(); P.teleport(X.x+1.8,null,X.z-3.4,0); P.aimCamera(Math.atan2(-1.8,3.4),.3); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'bothy-outside':"(()=>{ T.calm(); const B=T.NS().sites.bothy, P=T.P(); P.teleport(B.x-8,null,B.z+4.5,0); P.aimCamera(Math.PI/2+.45,.18); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'graveyard':"(()=>{ T.calm(); const F=T.NS().sites.field, P=T.P(); P.teleport(F.x-2,null,F.z+11,Math.PI); P.aimCamera(Math.PI+.15,.3); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'margery-corner':"(()=>{ T.calm(); const C=T.NS().sites.corner, P=T.P(); P.teleport(C.x-.5,null,C.z-2.6,0); P.aimCamera(0.15,.5); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'bothy-inside-died':"(()=>{ T.calm(); const B=T.NS().sites.bothy, P=T.P(); P.teleport(B.x-1.2,null,B.z-.6,Math.PI*.6); P.aimCamera(Math.PI*.4,.62); G.step(1/30,30); for(let i=0;i<20;i++)G.ui.advance(); })()",
}

async def run(pg,steps,fails):
  for name,js,ok in steps:
    if js is None:
      try:
        await pg.evaluate(SHOTJS[ok]); await pg.evaluate("(()=>{ const k=document.getElementById('keys'); if(k)k.style.visibility='hidden'; G.headless&&G.headless.draw&&G.headless.draw(3); })()"); await pg.wait_for_timeout(350)
        await pg.evaluate(SETTLE)
        path=os.path.join(SHOTS,'story-'+ok+'.png'); await pg.screenshot(path=path,timeout=90000); print('shot',path)
      except Exception as e: print('shot failed',ok,str(e)[:200])
      try: await pg.evaluate("window._afterShot&&(window._afterShot(),window._afterShot=null);0")
      except Exception as e: print('after shot failed',ok,str(e)[:200])
      continue
    try: r=await pg.evaluate(js); good=bool(ok(r))
    except Exception as e: r=str(e)[:300]; good=False
    print(('ok  ' if good else 'FAIL'),name,':',json.dumps(r,ensure_ascii=False)[:700])
    if not good: fails.append(name)

async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=await b.new_context(viewport={'width':960,'height':540},device_scale_factor=1); pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(URL,timeout=180000); await pg.wait_for_function("window.G&&G.devtools&&G.northIsleStory",timeout=180000); await pg.wait_for_timeout(1500)
    await pg.evaluate('G.headless&&(G.headless.hold=true);0')
    await pg.evaluate(LIB); fails=[]
    await run(pg,STEPS,fails)
    await pg.reload(timeout=180000); await pg.wait_for_function("window.G&&G.flow&&G.northIsleStory",timeout=180000); await pg.wait_for_timeout(1500); await pg.evaluate('G.headless&&(G.headless.hold=true);0')
    await pg.evaluate("document.getElementById('continue').click(); G.step(1/30,60); 0")
    await pg.evaluate(LIB)
    await run(pg,AFTER,fails)
    await pg.reload(timeout=180000); await pg.wait_for_function("window.G&&G.flow&&G.northIsleStory",timeout=180000); await pg.wait_for_timeout(1500); await pg.evaluate('G.headless&&(G.headless.hold=true);0')
    await pg.evaluate("document.getElementById('continue').click(); G.step(1/30,60); 0")
    await pg.evaluate(LIB)
    await run(pg,KEPT,fails)
    print('ok  ' if not errs else 'FAIL','noPageErrors :',errs[:3])
    if errs: fails.append('noPageErrors')
    print('RESULT:', 'PASSED' if not fails else 'FAILED '+', '.join(fails))
    await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())

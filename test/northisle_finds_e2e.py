"""The north island's finds off the path (northisle_finds.js, with its additions to progression.js and companions.js):
- the Margery's wreck on the reef: Rowan walks out along the bar with real input (G.input.setVirtual) at low tide, into her
  hold; at high tide the same walk stops at the water's edge; caught out there as the sea comes in, he wades back to the
  beach (no harm);
- her Keeper's Heart ('margery', 1 Mark): granted once, kept over a save and reload, not offered again; the journal lists it;
- the skipper's berth and the wreck read by stage ('before' / 'known' / 'lived' / 'died'); nothing before the ledger says or
  hints that his father lived;
- the lookout: "Look home" plays a short camera hold toward Hesper's light (and round to the north light after the ending);
- both companion spots: Ember through the cleft (a bottle with a note) and Corvin out to the gull stack (a child's ribbon);
- nothing of it is drawn at home.
usage: python3 test/northisle_finds_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)
Screenshots: SHOTS env (default /tmp/claude-0/isle-D)."""
import asyncio, sys, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
SHOTS=os.environ.get('SHOTS','/tmp/claude-0/isle-D'); os.makedirs(SHOTS,exist_ok=True)

LIB=r"""
window.T=(()=>{
const P=()=>G.player, F=()=>G.northIsleFinds;
function play(){ if(G.state.mode==='paused'&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); if(G.state.mode!=='play'&&G.state.mode!=='dead')G.setMode('play'); }
function calm(){ for(let i=0;i<20&&G.talk&&G.talk.isOpen;i++){ const s=G.talk.state&&G.talk.state(); if(s&&s.choices&&s.choices.length)G.talk.choose(0); else G.talk.advance(); }
  for(let i=0;i<14;i++)G.ui.advance&&G.ui.advance(); if(G.cine&&G.cine.on)G.cine.skip(); if(G.progress&&G.progress.endReward)G.progress.endReward(); play(); }
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
function check(id,st){ const L=F().debug.lines(id,st); return {n:L.length,missing:saidAll(L)}; }
/* the walk out: from the beach end of the bar, along it, in through the breach, to the middle of her hold */
function barRoute(){ const S=F().sites, b=S.wreck.bar, w=S.stands.wreck; return b.map(p=>[p.x,p.z]).concat([[w.x,w.z]]); }
function toBarStart(){ const s=F().sites.stands.barStart, b=F().sites.wreck.bar[0]; P().teleport(s.x,null,s.z,Math.atan2(b.x-s.x,b.z-s.z)); G.step(1/30,3); P().aimCamera(Math.atan2(b.x-s.x,b.z-s.z),.3); G.step(1/30,3); }
/* stand where a reader stands for id and use whatever the game offers there (the real pick) */
function readAt(id){ calm(); const s=F().sites.stands[id], r=F().sites.reads[id]; P().teleport(s.x,s.y,s.z,Math.atan2(r.x-s.x,r.z-s.z)); G.step(1/30,3);
  const c=G.interact.pick(P().pos), lab=c&&G.interact.label(c); if(!c)return {lab:null}; c.use(); G.step(1/30,2); return {lab}; }
/* before the ledger: nothing may say or hint that he lived */
const SPOIL=/\b(alive|pulled|walked|got out|survived|living|Tobias|Knox|forced|oilskin|hook|coat|crag)\b/i;
function heartN(){ return Object.keys(G.progress.state.hearts).length; }
return {P,F,play,calm,run,said,saidAll,steer,walk,release,check,barRoute,toBarStart,readAt,SPOIL,heartN};
})(); 'ok'"""

CALLS="""new Promise(res=>{ const r=G.renderer; G.headless&&G.headless.draw(12); let n=0;
  requestAnimationFrame(function f(){ if(n===0){ r.info.autoReset=false; r.info.reset(); } if(++n<=6)return requestAnimationFrame(f);
    const out={calls:Math.round(r.info.render.calls/6),tris:Math.round(r.info.render.triangles/6)}; r.info.autoReset=true; res(out); }); })"""

STEPS=[
 ("landing", "(()=>{ localStorage.removeItem('bq-save-v1'); G.devtools.start('north-landing'); T.run(1); T.calm(); const F=T.F(), sc=G.scene;"
   " return {stage:F.stage(),built:F.debug.built,drawn:sc.getObjectByName('northIsleFinds').visible,meshes:['nifMargery','nifBar','nifFoam','nifRocks','nifFaces'].map(n=>!!sc.getObjectByName(n)),"
   " keep:(G.isleKeepClear||[]).filter(k=>/^finds:/.test(k.why)).length,heart:!!G.progress.drops.margery,hearts:T.heartN(),maxHp:G.player.maxHp,"
   " spots:G.companions.spots.filter(s=>s.north).map(s=>[s.id,+s.at.y.toFixed(1),s.when()]),read:Object.keys(F.state.read).length}; })()",
   lambda r: r['stage']=='before' and r['built'] and r['drawn'] and all(r['meshes']) and r['keep']>=15 and r['heart'] and r['read']==0
     and len(r['spots'])==2 and all(s[2] and s[1]>-50 for s in r['spots'])),
 ("keepClearHolds", "(()=>{ const K=(G.isleKeepClear||[]).filter(k=>/^finds:/.test(k.why)), F=T.F(), bad=[]; const pts=Object.assign({},F.sites.reads,{grotto:F.companionSpots.grotto.at,stack:F.companionSpots.stack.stand});"
   " for(const id in pts){ const p=pts[id]; if(!K.some(k=>Math.hypot(p.x-k.x,p.z-k.z)<k.r))bad.push(id); }"
   " const N=G.northIsle, onPath=[]; for(const id in pts){ const p=pts[id]; if(N.pathDist(p.x,p.z)<N.pathW+2)onPath.push(id); } return {bad,onPath}; })()",
   lambda r: not r['bad'] and not r['onPath']),
 ("highTideNoWay", "(()=>{ T.calm(); const t=T.F().debug.tideTo(1); T.toBarStart(); const w=T.walk(T.barRoute(),{max:700}); const p=T.P().pos, W=T.F().sites.wreck;"
   " return {t,w:w.ok,d:+Math.hypot(p.x-W.x,p.z-W.z).toFixed(1),inHull:W.inHull(p),wading:T.F().debug.wading(),hp:T.P().hp,max:T.P().maxHp,line:T.said(T.F().debug.once.tideHigh)}; })()",
   lambda r: not r['t']['dry'] and not r['w'] and r['d']>12 and not r['inHull'] and not r['wading'] and r['hp']==r['max'] and r['line']),
 ("lowTideWalkOut", "(()=>{ T.calm(); const t=T.F().debug.tideTo(-1); T.toBarStart(); const w=T.walk(T.barRoute()); T.run(.5); const p=T.P().pos, W=T.F().sites.wreck;"
   " return {t,w,inHull:W.inHull(p),y:+p.y.toFixed(2),deck:W.deck,arrive:T.check('wreck','before').missing,seen:!!T.F().state.seen['wreck:before']}; })()",
   lambda r: r['t']['dry'] and r['t']['low'] and r['w']['ok'] and r['inHull'] and abs(r['y']-r['deck'])<.06 and not r['arrive'] and r['seen']),
 ("shotWreckLow", None, 'wreck-low'),
 ("heart", "(()=>{ const h0=T.heartN(), m0=G.player.maxHp, mk0=G.progress.marks; const at=T.F().sites.reads.heart; const w=T.walk([[at.x,at.z]],{tol:.4}); T.run(1.2); const pr=G.progress;"
   " const rew=pr.rewarding; pr.endReward(); T.run(.5); return {w:w.ok,rew,h:T.heartN()-h0,heart:!!pr.state.hearts.margery,mark:pr.state.marks.margery,marks:pr.marks-mk0,max:G.player.maxHp-m0,"
   " drop:!!pr.drops.margery,finds:T.F().state.heart,journal:pr.journal.data().found}; })()",
   lambda r: r['w'] and r['rew']=='heart' and r['h']==1 and r['heart'] and r['mark']==1 and r['marks']==1 and r['max']==2 and not r['drop'] and r['finds']
     and r['journal']==[{'id':'margery','name':'The Margery’s hold','done':True}]),
 ("heartOnce", "(()=>{ T.run(3); const pr=G.progress; return {drop:!!pr.drops.margery,n:T.heartN(),q:pr.busy}; })()", lambda r: not r['drop'] and not r['q']),
 ("berthBefore", "(()=>{ const r=T.readAt('berth'); T.run(.4); return {lab:r.lab,miss:T.check('berth','before').missing,read:!!T.F().state.read['berth:before'],lab2:T.F().debug.label('berth')}; })()",
   lambda r: r['lab']=='Look in the skipper’s berth' and not r['miss'] and r['read'] and r['lab2']=='The skipper’s berth'),
 ("shotBerth", None, 'berth'),
 ("noSpoil", "(()=>{ const F=T.F(), A=F.debug.all(), bad=[]; for(const id in A)for(const t of A[id].before)if(T.SPOIL.test(t))bad.push(id+': '+t);"
   " for(const k in F.debug.once){ const o=F.debug.once[k], t=typeof o==='string'?o:o.t; if(T.SPOIL.test(t))bad.push('once '+k+': '+t); }"
   " for(const id in F.debug.reads){ const L=F.debug.reads[id].log, lg=L&&L.before; if(lg&&T.SPOIL.test(lg))bad.push('log '+id); }"
   " return {bad,stage:F.stage()}; })()", lambda r: not r['bad'] and r['stage']=='before'),
 ("tideCatches", "(()=>{ T.calm(); const W=T.F().sites.wreck, s=T.F().sites.stands.wreck; T.P().teleport(s.x,s.y,s.z,0); G.step(1/30,3); const hp=T.P().hp; const t=T.F().debug.tideTo(-.4); T.run(.3);"
   " const wading=T.F().debug.wading(); T.run(2); const p=T.P().pos, b=T.F().sites.stands.barStart;"
   " return {t,wading,after:T.F().debug.wading(),inHull:W.inHull(p),onSite:T.F().debug.onSite(),d:+Math.hypot(p.x-b.x,p.z-b.z).toFixed(2),hp:T.P().hp-hp,alive:T.P().alive,walk:G.world.walkable(p.x,p.z),line:T.said(T.F().debug.once.waded.t),ctl:T.P().inputEnabled!==false}; })()",
   lambda r: not r['t']['dry'] and r['wading'] and not r['after'] and not r['inHull'] and not r['onSite'] and r['d']<2 and r['hp']==0 and r['alive'] and r['walk'] and r['line'] and r['ctl']),
 ("lookout", "(()=>{ T.calm(); const F=T.F(); const r=T.readAt('look'); T.run(.6); const on=G.cine.on, cam=G.camera, L=G.world.lighthouse.lampCenter, dir=new THREE.Vector3(); cam.getWorldDirection(dir);"
   " const to=L.clone().setY(L.y-60).sub(cam.position).normalize(), dot=+dir.dot(to).toFixed(3), hidden=!G.player.model.visible, near=+Math.hypot(cam.position.x-F.sites.lookout.x,cam.position.z-F.sites.lookout.z).toFixed(2);"
   " T.run(5.2); return {lab:r.lab,on,dot,hidden,near,after:G.cine.on,model:G.player.model.visible,miss:T.check('look','before').missing,ctl:T.P().inputEnabled!==false}; })()",
   lambda r: r['lab']=='Look home' and r['on'] and r['dot']>.97 and r['hidden'] and r['near']<2 and not r['after'] and r['model'] and not r['miss'] and r['ctl']),
 ("shotLook", None, 'lookout-hold'),
 ("lookoutSkip", "(()=>{ T.calm(); const r=T.readAt('look'); T.run(.6); const on=G.cine.on; G.input.setVirtual('jump',true); G.step(1/30,2); G.input.setVirtual('jump',false); G.step(1/30,3);"
   " return {on,after:G.cine.on,model:G.player.model.visible,looks:T.F().state.looks}; })()", lambda r: r['on'] and not r['after'] and r['model'] and r['looks']>=2),
 ("emberCleft", "(()=>{ T.calm(); G.companions.debug.earn('ember'); G.companions.debug.earn('corvin'); const g=T.F().companionSpots.grotto; T.P().teleport(g.stand.x,null,g.stand.z,Math.atan2(g.at.x-g.stand.x,g.at.z-g.stand.z)); T.run(1.5);"
   " const here=G.companions.debug.spotHere('ember'); const sent=G.companions.send('ember'); const carried=[]; for(let i=0;i<400&&G.companions.ember&&G.companions.ember.task;i++){ G.step(1/30,1); const c=G.companions.ember.carry; if(c&&!carried.includes(c))carried.push(c); }"
   " const rew=G.progress.rewarding; T.run(.2); G.progress.endReward(); T.run(3); return {here:here&&here.id,sent,carried,rew,done:!!G.companions.state.spots.grotto,found:T.F().state.found.bottle,miss:T.check('bottle','before').missing,cleft:T.said(T.F().debug.once.cleft.t)}; })()",
   lambda r: r['here']=='grotto' and r['sent']=='spot:grotto' and 'bottle' in r['carried'] and r['rew']=='bottle' and r['done'] and r['found']=='before' and not r['miss'] and r['cleft']),
 ("shotCleft", None, 'cleft'),
 ("corvinStack", "(()=>{ T.calm(); const s=T.F().companionSpots.stack; T.P().teleport(s.stand.x,null,s.stand.z,Math.atan2(s.at.x-s.stand.x,s.at.z-s.stand.z)); T.run(1.5);"
   " const here=G.companions.debug.spotHere('corvin'); const rib0=G.companions.debug.DYN.ribbon.visible; const sent=G.companions.send('corvin'); let i=0; for(;i<500&&G.companions.corvin&&G.companions.corvin.task;i++)G.step(1/30,1);"
   " const rew=G.progress.rewarding; T.run(.2); G.progress.endReward(); T.run(3); return {here:here&&here.id,sent,rib0,rib:G.companions.debug.DYN.ribbon.visible,rew,done:!!G.companions.state.spots.stack,found:T.F().state.found.ribbon,miss:T.check('ribbon','before').missing,stack:T.said(T.F().debug.once.stack.t),steps:i}; })()",
   lambda r: r['here']=='stack' and r['sent']=='spot:stack' and r['rib0'] and not r['rib'] and r['rew']=='ribbon' and r['done'] and r['found']=='before' and not r['miss'] and r['stack']),
 ("shotStack", None, 'stack'),
 ("mapPins", "(()=>{ return {seen:['grotto','stack'].map(id=>G.map.isSeen('comp:'+id)||!!G.companions.state.seen[id])}; })()", lambda r: all(r['seen'])),
 ("callsIsland", CALLS, lambda r: r['calls']>0),
 ("save", "(()=>{ T.calm(); const b=G.northIsle.cove.beach; T.P().teleport(b.x,null,b.z,0); G.step(1/30,4); G.testSaves=false; return {saved:G.flow.writeSave(),n:Object.keys(T.F().state.read).length,max:G.player.maxHp}; })()",
   lambda r: r['saved'] and r['n']>=4),
]
AFTER=[
 ("restored", "(()=>{ T.run(2); const F=T.F(), pr=G.progress; return {n:Object.keys(F.state.read).length,heart:!!pr.state.hearts.margery,finds:F.state.heart,drop:!!pr.drops.margery,found:F.state.found,"
   " spots:[!!G.companions.state.spots.grotto,!!G.companions.state.spots.stack],ribbon:G.companions.debug.DYN.ribbon.visible,said:Object.keys(F.state.said),stage:F.stage(),lab:F.debug.label('berth')}; })()",
   lambda r: r['n']>=4 and r['heart'] and r['finds'] and not r['drop'] and r['found'].get('bottle')=='before' and r['found'].get('ribbon')=='before' and all(r['spots']) and not r['ribbon']
     and 'waded' in r['said'] and r['stage']=='before' and r['lab']=='The skipper’s berth'),
 ("noSecondHeart", "(()=>{ const F=T.F(); F.debug.tideTo(-1); T.toBarStart(); const w=T.walk(T.barRoute()); T.run(2); return {w:w.ok,drop:!!G.progress.drops.margery,busy:G.progress.busy,n:T.heartN()}; })()",
   lambda r: r['w'] and not r['drop'] and not r['busy']),
 ("ledger", "(()=>{ T.calm(); G.northCave.debug.readLedger(); T.run(1); T.calm(); T.run(6); T.calm(); const F=T.F(); return {stage:F.stage(),lab:F.debug.label('berth')}; })()",
   lambda r: r['stage']=='known' and r['lab']=='Look in the skipper’s berth'),
 ("knownReads", "(()=>{ T.calm(); T.F().debug.tideTo(-1); const s=T.F().sites.stands.wreck; T.P().teleport(s.x,s.y,s.z,0); T.run(.6); const wr=T.check('wreck','known').missing;"
   " const r=T.readAt('berth'); T.run(.4); const be=T.check('berth','known').missing; T.calm(); const l=T.readAt('look'); T.run(.5); T.calm(); T.run(.2);"
   " return {wreck:wr,berth:be,lab:r.lab,look:T.check('look','known').missing,lline:T.said('He left the lantern. He didn’t need one. There was a light on the crag.')}; })()",
   lambda r: not r['wreck'] and not r['berth'] and r['lab']=='Look in the skipper’s berth' and not r['look'] and r['lline']),
 ("lived", "(()=>{ G.devtools.start('north-lived'); T.run(1); T.calm(); G.northFire.debug.S.trans=null; G.northFire.exit({instant:true}); T.run(1); T.calm(); const F=T.F(); F.debug.tideTo(-1);"
   " const out={stage:F.stage()}; const s=F.sites.stands.wreck; T.P().teleport(s.x,s.y,s.z,0); T.run(.6); out.wreck=T.check('wreck','lived').missing; const r=T.readAt('berth'); T.run(.4); out.berth=T.check('berth','lived').missing; T.calm();"
   " const l=T.readAt('look'); T.run(.6); out.on=G.cine.on; T.run(5.9); const cam=G.camera, Tw=G.northIsle.tower, fire=new THREE.Vector3(Tw.x,Tw.base+Tw.h+2.5,Tw.z), dir=new THREE.Vector3(); cam.getWorldDirection(dir);"
   " out.toFire=+dir.dot(fire.clone().sub(cam.position).normalize()).toFixed(3); T.run(1.5); out.after=G.cine.on; out.look=T.check('look','lived').missing; return out; })()",
   lambda r: r['stage']=='lived' and not r['wreck'] and not r['berth'] and r['on'] and r['toFire']>.9 and not r['after'] and not r['look']),
 ("shotLived", None, 'lookout-lived'),
 ("died", "(()=>{ G.devtools.start('north-died'); T.run(1); T.calm(); G.northFire.debug.S.trans=null; G.northFire.exit({instant:true}); T.run(1); T.calm(); const F=T.F(); F.debug.tideTo(-1);"
   " const out={stage:F.stage()}; const s=F.sites.stands.wreck; T.P().teleport(s.x,s.y,s.z,0); T.run(.6); out.wreck=T.check('wreck','died').missing; const r=T.readAt('berth'); T.run(.4); out.berth=T.check('berth','died').missing; T.calm();"
   " const l=T.readAt('look'); T.run(8); out.look=T.check('look','died').missing; return out; })()",
   lambda r: r['stage']=='died' and not r['wreck'] and not r['berth'] and not r['look']),
 ("hiddenAtHome", "(()=>{ T.calm(); G.northIsle.cross('home',{instant:true}); T.run(1.5); const D=G.companions.debug.DYN, F=T.F(), pr=G.progress;"
   " const pieces=G.scene.children.filter(o=>o.name==='compSpot'&&o.visible).length; return {at:G.northIsle.at,drawn:G.scene.getObjectByName('northIsleFinds').visible,"
   " heartDrawn:!!(pr.drops.margery&&pr.drops.margery.mesh.visible),ribbonFar:Math.hypot(D.ribbon.position.x-G.player.pos.x,D.ribbon.position.z-G.player.pos.z)>300}; })()",
   lambda r: r['at']=='home' and not r['drawn'] and not r['heartDrawn']),
 ("callsHome", CALLS, lambda r: r['calls']>0),
]
SHOTJS={
 'wreck-low':"(()=>{ T.calm(); const F=T.F(), w=F.sites.wreck, p=w.toW(-2,-12), q=w.toW(0,0); T.P().teleport(F.sites.stands.wreck.x,null,F.sites.stands.wreck.z,0); G.step(1/30,4);"
   " G.scene.onBeforeRender=(r,s,c)=>{ c.position.set(p.x,4.5,p.z); c.lookAt(q.x,-.6,q.z); c.updateMatrixWorld(); }; G.step(1/30,4); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'berth':"(()=>{ G.scene.onBeforeRender=()=>{}; T.calm(); const F=T.F(), w=F.sites.wreck, s=F.sites.stands.berth; T.P().teleport(s.x,s.y,s.z,Math.PI); const p=w.toW(-2.1,.4), q=w.toW(-4.6,-.1);"
   " G.scene.onBeforeRender=(r,sc,c)=>{ c.position.set(p.x,1.6,p.z); c.lookAt(q.x,-.35,q.z); c.updateMatrixWorld(); }; G.step(1/30,4); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'lookout-hold':"(()=>{ G.scene.onBeforeRender=()=>{}; T.calm(); T.readAt('look'); T.run(3.2); })()",
 'cleft':"(()=>{ G.scene.onBeforeRender=()=>{}; T.calm(); const g=T.F().companionSpots.grotto; const p={x:g.stand.x+g.out.x*3,z:g.stand.z+g.out.z*3}; T.P().teleport(g.stand.x,null,g.stand.z,0);"
   " G.scene.onBeforeRender=(r,s,c)=>{ c.position.set(p.x+1.5,g.at.y+2.4,p.z); c.lookAt(g.at.x,g.at.y+.4,g.at.z); c.updateMatrixWorld(); }; G.step(1/30,6); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'stack':"(()=>{ G.scene.onBeforeRender=()=>{}; T.calm(); const s=T.F().companionSpots.stack; T.P().teleport(s.stand.x,null,s.stand.z,Math.atan2(s.at.x-s.stand.x,s.at.z-s.stand.z)); G.step(1/30,4);"
   " G.scene.onBeforeRender=(r,sc,c)=>{ c.position.set(s.stand.x,s.stand.y+3.2,s.stand.z); c.lookAt(s.at.x,s.at.y,s.at.z); c.updateMatrixWorld(); }; G.step(1/30,6); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'lookout-lived':"(()=>{ G.scene.onBeforeRender=()=>{}; T.calm(); T.readAt('look'); T.run(6.6); })()",
}

async def run(pg,steps,fails):
  for name,js,ok in steps:
    if js is None:
      try:
        await pg.evaluate("(()=>{ const k=document.getElementById('keys'); if(k)k.style.visibility='hidden'; })()")
        await pg.evaluate(SHOTJS[ok]); await pg.evaluate("G.headless&&G.headless.draw&&G.headless.draw(3)"); await pg.wait_for_timeout(350)
        await pg.evaluate("(()=>{ document.querySelectorAll('.caption.leaving').forEach(e=>e.remove()); (document.getAnimations?document.getAnimations():[]).forEach(a=>{ try{ if(a.effect&&a.effect.getTiming().iterations!==Infinity)a.finish(); }catch(_){} }); 0; })()")  # the HUD settled: captions advanced in the shot leave a sliding copy mid-animation
        path=os.path.join(SHOTS,'finds-'+ok+'.png'); await pg.screenshot(path=path,timeout=120000); print('shot',path)
        await pg.evaluate("(()=>{ G.scene.onBeforeRender=()=>{}; if(G.cine&&G.cine.on)G.cine.skip(); G.step(1/30,2); const k=document.getElementById('keys'); if(k)k.style.visibility=''; })()")
      except Exception as e: print('shot failed',ok,str(e)[:200])
      continue
    try: r=await pg.evaluate(js); good=bool(ok(r))
    except Exception as e: r=str(e)[:300]; good=False
    print(('ok  ' if good else 'FAIL'),name,':',json.dumps(r,ensure_ascii=False)[:800])
    if not good: fails.append(name)

async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=await b.new_context(viewport={'width':960,'height':540},device_scale_factor=1); pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(URL,timeout=180000); await pg.wait_for_function("window.G&&G.devtools&&G.northIsleFinds",timeout=180000); await pg.wait_for_timeout(1500)
    await pg.evaluate('G.headless&&(G.headless.hold=true);0')
    await pg.evaluate(LIB); fails=[]
    await run(pg,STEPS,fails)
    await pg.reload(timeout=180000); await pg.wait_for_function("window.G&&G.flow&&G.northIsleFinds",timeout=180000); await pg.wait_for_timeout(1500); await pg.evaluate('G.headless&&(G.headless.hold=true);0')
    await pg.evaluate("document.getElementById('continue').click(); G.step(1/30,60); 0")
    await pg.evaluate(LIB)
    await run(pg,AFTER,fails)
    print('ok  ' if not errs else 'FAIL','noPageErrors :',errs[:3])
    if errs: fails.append('noPageErrors')
    print('RESULT:', 'PASSED' if not fails else 'FAILED '+', '.join(fails))
    await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())

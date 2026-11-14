"""The north island's story places (northisle_story.js): the drowned graveyard, the Margery's corner, the wrecker's bothy.
- the sites are built and drawn on the island, hidden from home, and their footprints are in G.isleKeepClear;
- Rowan walks from the cove up to the bothy and in through its door with real input (G.input.setVirtual), onto its floor;
  walls stop him, the roof lifts while he's inside;
- on a fresh landing every readable thing gives its 'before' lines (and arriving at the rise and the hut says theirs), and no
  'before' line names his father (no "father", "Da", "Tobias", "Knox");
- the read flags survive a save and a reload;
- after the ledger the same things give their 'known' lines (the labels ask to be read again); the north-isle-known start;
- after the fire room: the 'lived' and the 'died' lines, and their hooks (the stove's embers go out when he died).
usage: python3 test/northisle_story_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)
Screenshots: SHOTS env (default /tmp/claude-0/isle-B)."""
import asyncio, sys, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
SHOTS=os.environ.get('SHOTS','/tmp/claude-0/isle-B'); os.makedirs(SHOTS,exist_ok=True)

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
return {P,NS,play,calm,run,said,saidAll,steer,walk,release,readAt,check,SPOIL};
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

def shot(name, js):
    return (name, js, None)

STEPS=[
 ("landing", "(()=>{ localStorage.removeItem('bq-save-v1'); G.devtools.start('north-landing'); T.run(1); T.calm(); const S=T.NS(), sc=G.scene;"
   " return {stage:S.stage(),cairns:S.sites.cairns,reads:Object.keys(S.sites.reads).length,keep:(G.isleKeepClear||[]).filter(k=>/^story:/.test(k.why)).length,"
   " meshes:['nisGraveyard','nisBothy','nisBothyRoof','nisFaces','nisEmber'].map(n=>!!sc.getObjectByName(n)),drawn:sc.getObjectByName('northIsleStory').visible,read:Object.keys(S.state.read).length}; })()",
   lambda r: r['stage']=='before' and 40<=r['cairns']<=60 and r['reads']==12 and r['keep']==4 and all(r['meshes']) and r['drawn'] and r['read']==0),
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
   " const said=G.ui.messages().map(m=>m.text).filter(t=>T.SPOIL.test(t)&&/cairn|Cairn|stroke|tally|bunk|stove|chair|toy|hut|Margery’s men/.test(t)); for(const id in S.debug.reads){ const L=S.debug.reads[id].label; if(L&&T.SPOIL.test(L))bad.push('label '+id); }"
   " return {bad,said,stage:S.stage()}; })()", lambda r: not r['bad'] and not r['said'] and r['stage']=='before'),
 ("logged", "(()=>{ const R=T.NS().debug.reads, miss=[], spoil=[]; for(const id in R){ const L=R[id].log&&R[id].log.before; if(!L){ miss.push(id+': none'); continue; } if(!T.said(L))miss.push(id); if(T.SPOIL.test(L))spoil.push(id); } return {miss,spoil}; })()",
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
 ("died", "(()=>{ G.devtools.start('north-died'); T.run(1); T.calm(); G.northFire.debug.S.trans=null; G.northFire.exit({instant:true}); T.run(1); T.calm(); const S=T.NS();"
   " const out={stage:S.stage(),hook:!!S.state.hooks.died,ember:G.scene.getObjectByName('nisEmber').visible,reads:{}}; for(const id of ['chair','toy','stove','margery','tally']){ const r=T.readAt(id); T.run(.3); out.reads[id]={lab:r.lab,miss:T.check(id,'died').missing}; }"
   " out.cold=T.said('Cold now. It’ll stay cold.'); out.build=T.said('There’s nothing of him left to put under it. I’ll build it anyway.'); return out; })()",
   lambda r: r['stage']=='died' and r['hook'] and not r['ember'] and all(v['lab'] and not v['miss'] for v in r['reads'].values()) and r['cold'] and r['build']),
 ("shotDied", None, 'bothy-inside-died'),
 ("hiddenAtHome", "(()=>{ T.calm(); G.northIsle.cross('home',{instant:true}); T.run(1); return {at:G.northIsle.at,drawn:G.scene.getObjectByName('northIsleStory').visible}; })()",
   lambda r: r['at']=='home' and not r['drawn']),
]
SHOTJS={
 'bothy-outside':"(()=>{ T.calm(); const B=T.NS().sites.bothy, P=T.P(); P.teleport(B.x-8,null,B.z+4.5,0); P.aimCamera(Math.PI/2+.45,.18); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'graveyard':"(()=>{ T.calm(); const F=T.NS().sites.field, P=T.P(); P.teleport(F.x-2,null,F.z+11,Math.PI); P.aimCamera(Math.PI+.15,.3); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'margery-corner':"(()=>{ T.calm(); const C=T.NS().sites.corner, P=T.P(); P.teleport(C.x-.5,null,C.z-2.6,0); P.aimCamera(0.15,.5); G.step(1/30,20); for(let i=0;i<20;i++)G.ui.advance(); })()",
 'bothy-inside-died':"(()=>{ T.calm(); const B=T.NS().sites.bothy, P=T.P(); P.teleport(B.x-1.2,null,B.z-.6,Math.PI*.6); P.aimCamera(Math.PI*.4,.62); G.step(1/30,30); for(let i=0;i<20;i++)G.ui.advance(); })()",
}

async def run(pg,steps,fails):
  for name,js,ok in steps:
    if js is None:
      try:
        await pg.evaluate(SHOTJS[ok]); await pg.evaluate("G.headless&&G.headless.draw&&G.headless.draw(3)"); await pg.wait_for_timeout(350)
        path=os.path.join(SHOTS,'story-'+ok+'.png'); await pg.screenshot(path=path); print('shot',path)
      except Exception as e: print('shot failed',ok,str(e)[:200])
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
    print('ok  ' if not errs else 'FAIL','noPageErrors :',errs[:3])
    if errs: fails.append('noPageErrors')
    print('RESULT:', 'PASSED' if not fails else 'FAILED '+', '.join(fails))
    await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())

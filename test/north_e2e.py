"""The wrecker's light (north.js): the first north-island seed.
- before the Gloaming is beaten the light isn't there; once the core loop runs it fades in, far to the north;
- its beam turns the other way from ours, and the flare swells when the beam points at you;
- it isn't "seen" from the moor; from the lamp-room gallery, facing it for a moment, Rowan knows it (flag, event, two lines,
  a message-log line), once;
- Halloran then has "There's a light out north." (and "What now?" points you up there before you've seen it);
- Hesper at home has "That light to the north." once she's home and you've seen it;
- inside the cave / Undercroft / Vigil it is hidden; it survives a save and load (the flag).
usage: python3 test/north_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, json
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'

LIB=r"""
window.T={
  play(){ if(G.state.mode==='paused'&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); if(G.state.mode!=='play'&&G.state.mode!=='dead')G.setMode('play'); },
  calm(){ for(let i=0;i<10&&G.talk&&G.talk.isOpen;i++)G.talk.advance(); for(let i=0;i<14;i++)G.ui.advance&&G.ui.advance(); T.play(); },
  face(p){ const P=G.player; const yaw=Math.atan2(p.x-P.pos.x,p.z-P.pos.z); P.teleport(P.pos.x,P.pos.y,P.pos.z,yaw); if(P.aimCamera)P.aimCamera(yaw,.05); },
  gallery(){ const lh=G.world.lighthouse, a=Math.atan2(G.north.pos.x-lh.x,G.north.pos.z-lh.z), r=lh.glassR+.9;
    G.player.teleport(lh.x+Math.sin(a)*r,lh.topY+.1,lh.z+Math.cos(a)*r,a); G.step(1/30,4); return true; },
  choices(){ const s=G.talk.state(); return s?s.choices.slice():[]; },
  readTo(re){ const out=[], seen=[]; let first=null; for(let i=0;i<60&&G.talk.isOpen;i++){ const s=G.talk.state(); if(s.line&&out[out.length-1]!==s.line)out.push(s.line);
      if(s.choices.length){ if(!first)first=s.choices.slice(); const k=s.choices.findIndex(c=>re.test(c)); if(k<0)return {out,c:first}; out.push('> '+s.choices[k]); G.talk.choose(k); re=/I’ll go|Goodnight|^$/; } else G.talk.advance(); G.step(1/30,2); }
    return {out,c:first||[]}; },
  close(){ for(let i=0;i<30&&G.talk.isOpen;i++){ const s=G.talk.state(); if(s.choices.length)G.talk.choose(s.choices.length-1); else G.talk.advance(); G.step(1/30,1); } T.play(); },
};
'ok'"""

STEPS=[
 ("hiddenBefore", "(()=>{ document.getElementById('begin')&&document.getElementById('begin').click(); G.step(1/30,30); T.calm(); G.step(1/30,120); return {vis:G.north.vis,shown:G.scene.getObjectByName('northLight').visible,loop:!!(G.loop&&G.loop.active)}; })()",
   lambda r: r['vis']<.01 and not r['shown'] and not r['loop']),
 ("fadesIn", "(()=>{ G.debugStartLoop(); G.step(1/30,10); T.calm(); G.step(1/30,360); const p=G.north.pos, lh=G.world.lighthouse; return {vis:+G.north.vis.toFixed(2),dist:Math.round(Math.hypot(p.x-lh.x,p.z-lh.z)),north:p.z<lh.z-400}; })()",
   lambda r: r['vis']>.9 and 500<r['dist']<900 and r['north']),
 ("turnsAgainstOurs", "(()=>{ const y0=G.north.debug.yaw; G.step(1/30,30); const y1=G.north.debug.yaw; return {d:+(y1-y0).toFixed(3),ours:G.lighthouse.beam?1:0}; })()",
   lambda r: r['d']<-.2),
 ("flareSweeps", "(()=>{ let lo=9,hi=0; const sp=G.scene.getObjectByName('northLight').children[0]; for(let i=0;i<600;i++){ G.step(1/30,1); const o=sp.material.opacity; lo=Math.min(lo,o); hi=Math.max(hi,o); } return {lo:+lo.toFixed(2),hi:+hi.toFixed(2)}; })()",
   lambda r: r['hi']>r['lo']+.25),
 ("notFromMoor", "(()=>{ G.player.teleport(40,null,-10,Math.PI); G.step(1/30,4); T.face(G.north.pos); G.step(1/30,60); return {seen:G.north.seen,flag:G.flag('northLight')}; })()",
   lambda r: not r['seen'] and not r['flag']),
 ("halHint", "(()=>{ const h=G.creatures.halloran; G.player.teleport(h.pos.x+1.5,null,h.pos.z,0); G.step(1/30,4); G.creatures.talk(); G.step(1/30,4); const r=T.readTo(/What now/); const c=r.c; T.close(); return {c,hint:r.out.some(l=>/gallery/.test(l))}; })()",
   lambda r: any('What now' in c for c in r['c']) and not any('light out north' in c for c in r['c']) and r['hint']),
 ("seenFromGallery", "(()=>{ let ev=null; G.on('north:seen',e=>ev=e); const on=G.north.debug.onGallery(T.gallery()); T.face(G.north.pos); for(let i=0;i<40&&!G.north.seen;i++)G.step(1/30,1); G.step(1/30,4);"
   " const msgs=G.ui.messages().map(m=>m.text); return {on,seen:G.north.seen,flag:G.flag('northLight'),ev:!!ev,steered:msgs.some(t=>/light I steered for/.test(t)),wrong:msgs.some(t=>/wrong way/.test(t))}; })()",
   lambda r: r['on'] and r['seen'] and r['flag'] and r['ev'] and r['steered'] and r['wrong']),
 ("once", "(()=>{ T.calm(); let n=0; G.on('north:seen',()=>n++); G.step(1/30,60); T.face({x:G.north.pos.x+1,y:0,z:G.north.pos.z}); G.step(1/30,60); return {n,count:G.ui.messages().filter(m=>/light I steered for/.test(m.text)).length}; })()",
   lambda r: r['n']==0 and r['count']==1),
 ("halLure", "(()=>{ T.calm(); const h=G.creatures.halloran; G.player.teleport(h.pos.x+1.5,null,h.pos.z,0); G.step(1/30,4); G.creatures.talk(); G.step(1/30,4); const r=T.readTo(/light out north/); const c=r.c; T.close(); return {c,lure:r.out.some(l=>/That’s a lure/.test(l)),rocks:r.out.some(l=>/hit those rocks/.test(l))}; })()",
   lambda r: any('light out north' in c for c in r['c']) and not any('What now' in c for c in r['c']) and r['lure'] and r['rocks']),
 ("hesperHome", "(()=>{ const TP=G.templePeople; TP.debug.goHome(); G.step(1/30,10); TP.debug.talkHome(); G.step(1/30,4); let c=[]; for(let i=0;i<10&&G.talk.isOpen;i++){ const s=G.talk.state(); if(s.choices.length){c=s.choices.slice();break;} G.talk.advance(); G.step(1/30,1); }"
   " const k=c.findIndex(x=>/light to the north/.test(x)); let lines=[]; if(k>=0){ G.talk.choose(k); G.step(1/30,2); for(let i=0;i<8&&G.talk.isOpen;i++){ const s=G.talk.state(); if(s.line)lines.push(s.line); if(s.choices.length)break; G.talk.advance(); G.step(1/30,1); } } T.close(); return {c,who:lines.some(l=>/find out who/.test(l))}; })()",
   lambda r: any('light to the north' in c for c in r['c']) and r['who']),
 ("hiddenUnderground", "(()=>{ G.temple.enter('vestibule',{instant:true}); G.step(1/30,10); T.calm(); const inCave=!!G.temple.inside; G.step(1/30,120); return {inCave,vis:+G.north.vis.toFixed(2)}; })()",
   lambda r: r['inCave'] and r['vis']<.05),
 ("persists", "(()=>{ G.flag('northLight',true); const d=JSON.parse(JSON.stringify(G.state.flags)); G.state.flags.northLight=false; Object.assign(G.state.flags,d); return {seen:G.north.seen}; })()",
   lambda r: r['seen']),
]

async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=await b.new_page(viewport={'width':960,'height':540}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
    await pg.evaluate("localStorage.removeItem('bq-save-v1')"); await pg.evaluate('G.headless&&(G.headless.hold=true);0')
    await pg.evaluate(LIB); fails=[]
    for name,js,ok in STEPS:
      try: r=await pg.evaluate(js); good=bool(ok(r))
      except Exception as e: r=str(e)[:300]; good=False
      print(('ok  ' if good else 'FAIL'),name,':',json.dumps(r)[:400]);
      if not good: fails.append(name)
    print('ok  ' if not errs else 'FAIL','noPageErrors :',errs[:3])
    if errs: fails.append('noPageErrors')
    print('RESULT:', 'PASSED' if not fails else 'FAILED '+', '.join(fails))
    await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())

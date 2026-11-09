"""The conversation card everywhere (feat/talk-everywhere): Halloran talks on the card (portrait, choices) and the objective still
moves on from what he says; a reading (the keeper's logbook) opens a card with the book; a story moment that can't pause (a
hollow on you) goes to the captions instead; in-play captions never pause and wear the parchment look with a portrait cameo;
every line from both lands in the message log. Screenshots (deviceScaleFactor 2) go to /tmp/claude-0/talkshots/.
usage: python3 test/talkcard_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, os, json, time
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
SHOTS='/tmp/claude-0/talkshots'; os.makedirs(SHOTS,exist_ok=True)
CHROME=dict(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
LIB=r"""(()=>{ G.input.lockPointer=()=>{}; G.input.unlockPointer=()=>{}; try{ document.exitPointerLock&&document.exitPointerLock(); }catch(_){}
  window.T={
  OBJ:()=>document.getElementById('obj').textContent,
  near(p,dx){ G.player.teleport(p.x+(dx||1.6),p.y,p.z,-Math.PI/2); G.step(1/30,8); },
  use(re){ G.step(1/30,2); const c=G.interact.pick(G.player.pos), l=c&&G.interact.label(c); if(!c||(re&&!re.test(l)))return 'NOPE:'+l; c.use(); G.step(1/30,2); return l; },
  toChoices(){ let n=0; while(G.talk.isOpen&&!G.talk.state().choices.length&&n<30){ G.talk.advance(); n++; } return G.talk.state(); },
  face(){ const f=document.querySelector('#talk .tk-face'); const c=f&&f.querySelector('canvas'); if(!c||f.hidden)return null;
    const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let ink=0; for(let i=0;i<d.length;i+=40)if(d[i+3]>0)ink++; return {w:c.width,h:c.height,painted:ink>50}; },
  cap(){ const el=document.getElementById('cap'), cs=getComputedStyle(el), who=document.getElementById('capWho'), f=document.getElementById('capFace');
    const c=G.ui.captions().cur; return {cur:c&&c.text, who:c&&c.who, face:c&&c.face, cls:el.className, bg:cs.backgroundImage.slice(0,40), color:cs.color,
      whoFont:getComputedStyle(who).fontFamily.slice(0,30), faceShown:!!f&&!f.hidden&&f.getBoundingClientRect().width>20}; }
}; return 'ok'; })()"""

R=[]
def check(name,ok,info=None):
    R.append((name,bool(ok))); print(('ok   ' if ok else 'FAIL ')+name+('  '+json.dumps(info,default=str)[:400] if info is not None else ''),flush=True)

async def shot(pg,name):
    await pg.evaluate('G.headless&&G.headless.draw&&G.headless.draw(3)'); await pg.wait_for_timeout(800); await pg.evaluate('G.headless&&G.headless.draw&&G.headless.draw(2)')
    await pg.screenshot(path=os.path.join(SHOTS,name+'.png')); print('   shot',name)

async def main():
    t0=time.time(); errs=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(**CHROME)
        ctx=await b.new_context(viewport={'width':1100,'height':680},device_scale_factor=2)
        pg=await ctx.new_page(); pg.set_default_timeout(240000)
        pg.on('pageerror',lambda e:errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m:errs.append('console: '+m.text) if m.type=='error' and '404' not in m.text else None)
        await pg.goto(URL,timeout=180000); await pg.wait_for_function('window.G&&G.headless',timeout=180000); await pg.wait_for_timeout(1500)
        await pg.evaluate(LIB)
        ev=lambda js: pg.evaluate(js)
        await ev("(()=>{ try{localStorage.removeItem('bq-save-v1');}catch(_){} G.ui.setCaptionSpeed('relaxed'); document.getElementById('begin').click(); G.step(1/30,20); G.ui.clearCaptions(); G.ui.clearMessages(); })()")
        await ev(LIB)   # again: begin() locks the pointer

        # ---- Halloran: a card with his portrait, choices, and the flow objective moves on
        r=await ev("""(()=>{ G.emit('door:blocked'); G.step(1/30,2); const o0=T.OBJ(); const h=G.creatures.halloran; T.near(h.pos);
          const lab=T.use(/Talk/); const s=G.talk.state(); return {o0,lab,open:G.talk.isOpen,mode:G.state.mode,s,face:T.face(),title:document.querySelector('#talk .eyebrow').textContent}; })()""")
        check('halloran: E opens the card, play pauses, his portrait is painted', r['open'] and r['mode']=='paused' and r['s']['name']=='Halloran' and r['face'] and r['face']['painted'], r)
        check('halloran: the objective starts at "Find a light"', r['o0']=='Find a light', r['o0'])
        r=await ev("(()=>{ const s=T.toChoices(); return s; })()")
        check('halloran: 2–3 replies after his opening', r and 2<=len(r['choices'])<=3 and 'What happened to the lamp?' in r['choices'], r)
        await shot(pg,'halloran-card')
        r=await ev("""(()=>{ const s=G.talk.state(); G.talk.choose(s.choices.indexOf('What happened to the lamp?')); const lines=[]; let n=0;
          while(G.talk.isOpen&&!G.talk.state().choices.length&&n<20){ lines.push(G.talk.state().line); G.talk.advance(); n++; }
          const s2=G.talk.state(); return {lines,obj:T.OBJ(),choices:s2&&s2.choices,mode:G.state.mode}; })()""")
        check('halloran: asking about the lamp tells of the storm lantern; the objective moves on', r['obj']=='Take Halloran’s storm lantern' and any('storm lantern' in (l or '') for l in r['lines']) and 'I’ll go.' in (r['choices'] or []), r)
        r=await ev("""(()=>{ const s=G.talk.state(); G.talk.choose(s.choices.indexOf('I’ll go.')); let n=0; while(G.talk.isOpen&&n<10){ G.talk.advance(); n++; } G.step(1/30,4);
          const M=G.ui.messages(); return {open:G.talk.isOpen,mode:G.state.mode,hal:M.filter(m=>m.who==='Halloran').length,you:M.filter(m=>m.who==='You').length,last:M.slice(-1)[0]}; })()""")
        check('halloran: "I’ll go." ends it, play resumes; his lines and your replies are in the message log', not r['open'] and r['mode']=='play' and r['hal']>=3 and r['you']>=2, r)
        r=await ev("""(()=>{ const ev=[]; const off=G.on('talk',e=>ev.push(e)); const h=G.creatures.halloran; T.near(h.pos); T.use(/Talk/); const s=G.talk.state(); G.talk.close(); G.step(1/30,2);
          return {again:s&&s.line, ev:ev.map(e=>e.who+':'+e.phase+':'+e.index)}; })()""")
        check('halloran: talking again opens on the storm lantern, and still emits talk {who:"Halloran"}', r['again'] and 'storm lantern' in r['again'] and any(e.startswith('Halloran:start:2') for e in r['ev']), r)

        # ---- a reading: the cottage logbook opens a card with the book
        r=await ev("""(()=>{ const lb=G.interact.list.find(o=>G.interact.label(o)==='Read the logbook'); const p=lb.pos; G.player.teleport(p.x,p.y,p.z+.4,0); G.step(1/30,6);
          window._lb=lb; lb.use(); G.step(1/30,2); const lab=G.interact.label(lb); const s=G.talk.state(); return {lab,open:G.talk.isOpen,mode:G.state.mode,s,face:T.face(),reading:document.querySelector('#talk .tk-card').classList.contains('reading')}; })()""")
        check('reading: the keeper’s logbook opens on the card with the book cameo', r['open'] and r['mode']=='paused' and r['s']['name']=='The keeper’s logbook' and r['reading'] and r['face'] and r['face']['painted'], r)
        await ev("(()=>{ G.talk.advance(); G.step(1/30,2); })()")   # finish the typing for the picture
        await shot(pg,'reading-card')
        r=await ev("(()=>{ let n=0; while(G.talk.isOpen&&n<10){ G.talk.advance(); n++; } G.step(1/30,2); return {open:G.talk.isOpen,mode:G.state.mode,log:G.ui.messages().filter(m=>/logbook lies open/.test(m.text)).length}; })()")
        check('reading: Enter reads it through and closes; it is in the log', not r['open'] and r['mode']=='play' and r['log']==1, r)

        # ---- not calm: a hollow hunting you -> the same reading goes to the captions, and nothing pauses
        r=await ev("""(()=>{ const P=G.player.pos; const m=G.monsters.spawn('hollow',new THREE.Vector3(P.x+5,P.y,P.z),{aggro:true}); m.state='chase'; G.step(1/30,2);
          const calm=G.talk.calm(); G.ui.clearCaptions(); const lab=G.interact.label(_lb); _lb.use(); G.step(1/30,6); const c=G.ui.captions().cur;
          const out={calm,lab,open:G.talk.isOpen,mode:G.state.mode,cap:c&&c.text.slice(0,30),who:c&&c.who,face:c&&c.face};
          m.alive=false; m.dying=true; G.step(1/30,2); return out; })()""")
        check('not calm (a hollow on you): the reading is a caption, play goes on', (not r['calm']) and not r['open'] and r['mode']=='play' and r['cap'] and r['face']=='page', r)

        # ---- in-play captions: never pause, parchment look, portrait cameo
        r=await ev("""(()=>{ G.ui.clearCaptions(); G.ui.setCaptionSpeed('hold'); G.ui.say('Keep them back! Keep those things away from me!','Halloran'); G.step(1/30,40);
          const a=T.cap(); a.mode=G.state.mode; return a; })()""")
        check('in-play caption (Halloran’s moth warning) does not pause', r['mode']=='play' and r['cur'] and 'Keep them back' in r['cur'], r)
        check('in-play caption wears the parchment card, the display face for the name, and his cameo', 'gradient' in r['bg'] and 'face' in r['cls'] and r['faceShown'] and r['face']=='halloran' and 'Fell' in r['whoFont'], r)
        await shot(pg,'caption-cameo')
        r=await ev("""(()=>{ G.ui.clearCaptions(); G.ui.say('Too few moths on her — 6. The ink is creeping back.',{key:'wrenStall'}); G.step(1/30,30); const a=T.cap(); a.mode=G.state.mode;
          a.inLog=G.ui.messages().some(m=>/Too few moths/.test(m.text)); return a; })()""")
        check('a narration caption (no speaker): no cameo, no pause, in the log', r['mode']=='play' and not r['faceShown'] and r['inLog'], r)
        r=await ev("""(()=>{ G.ui.clearCaptions(); G.ui.say('One line.','Halloran'); G.ui.say('Two line.','Aldous Crane'); G.ui.say('Three line.','Maren’s logbook'); G.ui.say('Four line.'); G.step(1/30,10);
          const st=G.ui.captionStack(); return {st,mode:G.state.mode,face:G.ui.captions().cur.face}; })()""")
        check('the stack and +N still show behind a cameo caption', r['st']['depth']==2 and r['st']['count']=='+3' and r['mode']=='play', r)
        await shot(pg,'caption-stack')
        await ev("(()=>{ G.ui.clearCaptions(); G.ui.setCaptionSpeed('relaxed'); })()")

        # ---- the foot of the tower: a story moment on Halloran's card
        r=await ev("""(()=>{ G.items.storm.failed=true; G.flag('stormFailed',true); G.quest.set('failed','Go back down','',null,''); G.emit('tower:exit'); G.step(1/30,20);
          const s=G.talk.state(); const out={open:G.talk.isOpen,s,obj:T.OBJ()}; let n=0; while(G.talk.isOpen&&n<10){ G.talk.advance(); n++; } G.step(1/30,2); out.after=G.state.mode; return out; })()""")
        check('the foot of the tower: Halloran’s scene is a card, then "Talk to Halloran"', r['open'] and r['s']['name']=='Halloran' and 'foot of the tower' in r['s']['line'] and r['obj']=='Talk to Halloran' and r['after']=='play', r)
        r=await ev("""(()=>{ const h=G.creatures.halloran; T.near(h.pos); T.use(/Talk/); const s=T.toChoices(); const i=s.choices.indexOf('I’ll go.'); G.talk.choose(i); let n=0; while(G.talk.isOpen&&n<10){ G.talk.advance(); n++; } G.step(1/30,2);
          return {choices:s.choices,obj:T.OBJ(),mode:G.state.mode}; })()""")
        check('after the failure: even "I’ll go." first tells of Maren’s lantern; the objective moves to the forest', r['obj']=='Find Maren’s lantern' and r['mode']=='play' and 'Where did Maren go?' in r['choices'], r)
        await ctx.close()

        # ---- a small phone: the caption with a cameo up under the hearts, and a card
        mctx=await b.new_context(viewport={'width':375,'height':667},is_mobile=True,has_touch=True,device_scale_factor=2)
        mp=await mctx.new_page(); mp.set_default_timeout(240000)
        mp.on('pageerror',lambda e:errs.append('pageerror(m): '+str(e)))
        await mp.goto(URL,timeout=180000); await mp.wait_for_function('window.G&&G.headless',timeout=180000); await mp.wait_for_timeout(1500)
        await mp.evaluate(LIB)
        r=await mp.evaluate("""(()=>{ document.getElementById('begin').click(); G.step(1/30,20); G.ui.clearCaptions(); G.ui.setCaptionSpeed('hold');
          G.ui.say('Keep them back! Keep those things away from me!','Halloran'); G.step(1/30,60); const el=document.getElementById('cap').getBoundingClientRect();
          return {mode:G.state.mode,l:el.left,r:el.right,w:innerWidth,top:el.top,face:T.cap().faceShown}; })()""")
        check('phone: the caption fits the screen with its cameo', r['mode']=='play' and r['l']>=0 and r['r']<=r['w'] and r['face'], r)
        await shot(mp,'phone-caption')
        r=await mp.evaluate("""(()=>{ G.ui.clearCaptions(); const h=G.creatures.halloran; T.near(h.pos); T.use(/Talk/); const s=T.toChoices();
          const c=document.querySelector('#talk .tk-card').getBoundingClientRect(); return {open:G.talk.isOpen,n:s&&s.choices.length,l:c.left,r:c.right,w:innerWidth}; })()""")
        check('phone: Halloran’s card fits, with its replies', r['open'] and r['n']>=2 and r['l']>=0 and r['r']<=r['w'], r)
        await shot(mp,'phone-halloran-card')
        await mctx.close(); await b.close()
    for e in errs[:10]: print('  ',e[:300])
    check('no page errors',not errs,errs[:3])
    bad=[n for n,ok in R if not ok]
    print(('PASS' if not bad else 'FAIL '+', '.join(bad)), f'{time.time()-t0:.0f}s'); sys.exit(0 if not bad else 1)
asyncio.run(main())

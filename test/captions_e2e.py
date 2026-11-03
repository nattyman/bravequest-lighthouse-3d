"""Captions e2e (~2 min): reading time (Relaxed / Standard / Hold), the advance key and caption taps, the message log
(dropped and cut lines, ×N repeats, persistence in the save) and the pause menu's Messages tab. Screenshots go to
/tmp/claude-0/captions/ (caption with the hint and a queued count; the Messages tab at desktop and phone size).
usage: python3 test/captions_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)
"""
import asyncio, sys, time, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
OUT='/tmp/claude-0/captions'; os.makedirs(OUT,exist_ok=True)
LONG='The fog rolls in off the water and settles in the hollows of the moor, thick as wool, and somewhere inside it a bell is ringing very slowly.'
HELPERS=r"""
window.T={
  reset(speed){ G.ui.setCaptionSpeed(speed); G.ui.clearCaptions(); G.ui.clearMessages(); },
  cap(){ const c=G.ui.captions(); return c.cur?c.cur.text:''; },
  steps(sec){ G.step(1/30,Math.round(sec*30)); },
};
window.ATK=0; G.on('player:attack',()=>{ window.ATK++; });
"""
results=[]; ok_all=True
def check(name,ok,info):
    global ok_all
    ok_all=ok_all and bool(ok); results.append(name)
    print(f"{'ok  ' if ok else 'FAIL'} {name:16s} {json.dumps(info)[:400]}")

async def ev(pg,js):
    return await pg.evaluate(js)

async def main():
    t0=time.time(); errs=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx=await b.new_context(viewport={'width':1100,'height':680})
        pg=await ctx.new_page()
        pg.on('pageerror',lambda e:errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m:errs.append('console: '+m.text) if m.type=='error' and '404' not in m.text else None)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
        d=await ev(pg,"(()=>{ document.getElementById('begin').click(); G.step(1/30,30); return [G.state.mode, G.ui.captionSpeed]; })()")
        await ev(pg,HELPERS)
        check('default', d==['play','relaxed'], d)

        # 1. Relaxed reads longer than Standard, and Standard really ends on time while Relaxed is still up
        r=await ev(pg,f"""(()=>{{ const L={json.dumps(LONG)};
          T.reset('standard'); G.ui.say(L); G.step(1/30,1); const s=G.ui.captions().cur;
          T.steps(s.read+.3); const stdGone=!G.ui.captions().cur;
          T.reset('relaxed'); G.ui.say(L); G.step(1/30,1); const r=G.ui.captions().cur;
          T.steps(s.read+.3); const relStill=T.cap()===L;
          T.reset('relaxed'); G.ui.say('Hm.'); G.step(1/30,1); const shortMin=G.ui.captions().cur.read;
          T.reset('standard'); G.ui.say('Hm.'); G.step(1/30,1); const shortStd=G.ui.captions().cur.read;
          return {{std:s.read, rel:r.read, stdGone, relStill, shortRel:shortMin, shortStd}}; }})()""")
        check('relaxed-longer', r['rel']>=1.8*r['std'] and r['stdGone'] and r['relStill'] and r['shortRel']>=5 and r['shortRel']>=1.8*r['shortStd'], r)

        # 2. a waiting line doesn't cut a Relaxed line as early as Standard; stale times scale so the waiting line still shows
        r=await ev(pg,f"""(()=>{{ const L={json.dumps(LONG)}, out={{}};
          for(const sp of ['standard','relaxed']){{ T.reset(sp); G.ui.say(L); G.ui.say('Second line.'); G.step(1/30,1); let t=1/30;
            while(T.cap()===L&&t<60){{ G.step(1/30,1); t+=1/30; }} out[sp]={{cut:+t.toFixed(2), next:T.cap()}}; }}
          out.cfg=G.ui.captionConfig().STALE; return out; }})()""")
        check('relaxed-queue', r['relaxed']['cut']>=1.8*r['standard']['cut'] and r['relaxed']['next']=='Second line.' and r['standard']['next']=='Second line.', r)

        # 3. Hold: normal lines wait for the player (and the line behind isn't dropped); low lines still time out
        r=await ev(pg,"""(()=>{ T.reset('hold'); G.ui.say('Halloran waits for you to answer.','Halloran'); G.ui.say('A second thing he says.','Halloran');
          T.steps(45); const c=G.ui.captions(); const a={cur:T.cap(), held:c.cur&&c.cur.held, queued:c.queue.map(q=>q.text)};
          T.reset('hold'); G.ui.say('A gull cries somewhere below.',{priority:'low'}); T.steps(14); a.lowGone=!G.ui.captions().cur; return a; })()""")
        check('hold-waits', r['cur']=='Halloran waits for you to answer.' and r['held'] and r['queued']==['A second thing he says.'] and r['lowGone'], r)

        # 4. Enter: completes the typing, then the next line, then the next, then dismisses. The hint shows what's waiting.
        await ev(pg,f"""(()=>{{ T.reset('hold'); G.ui.say({json.dumps(LONG)},'Halloran'); G.ui.say('Then he looks away.','Halloran'); G.ui.say('The lamp is out.'); G.step(1/30,3); }})()""")
        s0=await ev(pg,"(()=>{ const c=G.ui.captions(); return {typing:c.cur.typing, hint:document.querySelector('#cap .capnext').textContent, shown:document.getElementById('capText').textContent.length}; })()")
        await ev(pg,"G.headless.draw(3)"); await pg.wait_for_timeout(350)
        await pg.screenshot(path=f'{OUT}/caption-hint-typing.png')
        seq=[]
        for i in range(6):
            await pg.keyboard.press('Enter'); await ev(pg,"G.step(1/30,1)")
            seq.append(await ev(pg,"(()=>{ const c=G.ui.captions(); return c.cur?{text:c.cur.text.slice(0,24),typing:c.cur.typing,q:c.queue.length,hint:document.querySelector('#cap .capnext').textContent}:null; })()"))
            if i==0:
                await ev(pg,"G.headless.draw(3)"); await pg.wait_for_timeout(350)
                await pg.screenshot(path=f'{OUT}/caption-hint-queued.png')
        # press 1 finishes typing (same line, 2 waiting) / 2 next line (typing) / 3 finishes it / 4 last line / 5 finishes it / 6 dismisses
        ok=(s0['typing'] and '2 more' in s0['hint'] and 'Enter' in s0['hint'] and seq[0] and seq[0]['text']==LONG[:24] and not seq[0]['typing'] and seq[0]['q']==2
            and seq[1]['text'].startswith('Then he looks') and seq[1]['typing'] and '1 more' in seq[1]['hint'] and not seq[2]['typing'] and seq[2]['text'].startswith('Then he looks')
            and seq[3]['text'].startswith('The lamp') and seq[3]['q']==0 and seq[4]['text'].startswith('The lamp') and not seq[4]['typing'] and seq[5] is None)
        check('advance-key', ok, {'start':s0,'seq':seq})

        # 4b. controller: D-pad down finishes typing, then advances; it no longer walks the player backward; the hint shows the D-pad glyph
        r=await ev(pg,f"""(()=>{{ const P={{id:'Fake Xbox controller',index:0,connected:true,mapping:'standard',timestamp:0,axes:[0,0,0,0],buttons:Array.from({{length:17}},()=>({{pressed:false,touched:false,value:0}}))}};
          const old=navigator.getGamepads; navigator.getGamepads=()=>[P];
          const btn=(i,on)=>{{ P.buttons[i]={{pressed:!!on,touched:!!on,value:on?1:0}}; P.timestamp++; }};
          T.reset('hold'); G.ui.say({json.dumps(LONG)},'Halloran'); G.ui.say('Pad line two.'); G.step(1/30,3);
          const p0=G.player.pos.clone(); btn(13,true); G.step(1/30,2); const mv=G.input.move();
          const a={{typing:G.ui.captions().cur.typing, hint:document.querySelector('#cap .capnext').innerHTML.includes('D-pad down'), mag:mv.mag}};
          btn(13,false); G.step(1/30,2); btn(13,true); G.step(1/30,2); btn(13,false); G.step(1/30,2);
          const c=G.ui.captions(); const moved=G.player.pos.distanceTo(p0);
          const legend=document.getElementById('keys').innerHTML.includes('next message');
          navigator.getGamepads=old||(()=>[]); return {{...a, next:c.cur&&c.cur.text, moved:+moved.toFixed(3), legend, device:G.input.device}}; }})()""")
        check('dpad-down', not r['typing'] and r['hint'] and r['mag']==0 and r['next']=='Pad line two.' and r['moved']<.05 and r['legend'], r)

        # 5. clicking the caption advances it and never attacks
        # (while the mouse is captured for camera look, a click is a strike, as before; with the cursor free a click on the caption is "next")
        await ev(pg,"(()=>{ G.input.lockPointer=()=>{}; document.exitPointerLock(); })()"); await pg.wait_for_timeout(400)
        await ev(pg,"(()=>{ if(G.state.mode==='paused')document.getElementById('resume').click(); G.step(1/30,2); })()")
        await ev(pg,f"""(()=>{{ T.reset('hold'); G.ui.say('Click me to continue.'); G.ui.say('And then this one.'); G.step(1/30,90); window.ATK=0; }})()""")
        box=await pg.locator('#cap').bounding_box()
        await pg.mouse.click(box['x']+box['width']*.5, box['y']+box['height']*.5)
        r=await ev(pg,"(()=>{ G.step(1/30,6); return {cur:T.cap(), atk:window.ATK, attack:G.input.pressed('attack'), mode:G.state.mode}; })()")
        check('click-no-attack', r['cur']=='And then this one.' and r['atk']==0 and r['mode']=='play', r)

        # 6. Enter in a menu clicks the focused button only: it doesn't also advance the caption after resuming
        await ev(pg,"(()=>{ T.reset('hold'); G.ui.say('Still here after the menu.'); G.step(1/30,90); document.getElementById('pauseBtn').click(); G.step(1/30,2); document.getElementById('resume').focus(); })()")
        await pg.keyboard.press('Enter')
        r=await ev(pg,"(()=>{ G.step(1/30,3); return {mode:G.state.mode, cur:T.cap()}; })()")
        check('enter-in-menu', r['mode']=='play' and r['cur']=='Still here after the menu.', r)

        # 7. every line is logged: lines dropped from a full queue, low lines that never got shown, lines cut short; a line cut
        #    by a high one comes back and, once read, isn't "missed"
        r=await ev(pg,"""(()=>{ T.reset('standard');
          G.ui.say('Line one on screen.'); G.step(1/30,2); G.ui.say('DANGER: the Stag rises!',{priority:'high'}); // cuts 'Line one' (it comes back)
          T.steps(30);
          G.ui.say('Line two on screen.'); for(let i=3;i<=9;i++)G.ui.say('Queued line '+i+'.'); // QMAX 4: some are dropped
          G.ui.say('A flavour aside.',{priority:'low'});            // never waits behind real lines
          T.steps(80); const M=G.ui.messages();
          return {n:M.length, texts:M.map(m=>m.text), missed:M.filter(m=>m.missed).map(m=>m.text), lineOneMissed:M.find(m=>m.text==='Line one on screen.').missed,
            high:M.find(m=>m.text.startsWith('DANGER')).pri, place:M[0].place, at:M[0].at>0}; })()""")
        ok=(r['n']==11 and 'Queued line 3.' in r['texts'] and 'A flavour aside.' in r['missed'] and len(r['missed'])>=4 and r['lineOneMissed'] is False and r['high']==2 and r['place'] and r['at'])
        check('log-all', ok, r)

        # 8. immediate repeats collapse to one entry with a count; a different line in between starts a new entry
        r=await ev(pg,"""(()=>{ T.reset('standard');
          for(let i=0;i<3;i++){ G.ui.say('You’re already whole.',{key:'whole'}); T.steps(1); }
          G.ui.say('Something else.'); T.steps(1); G.ui.say('You’re already whole.',{key:'whole'});
          T.steps(20); G.ui.say('You’re already whole.',{key:'whole'});  // long after: a new entry
          return G.ui.messages().map(m=>[m.text.slice(0,12),m.n]); })()""")
        check('dedupe', r==[['You’re alrea',3],['Something el',1],['You’re alrea',1],['You’re alrea',1]], r)

        # 9. the pause menu's Messages tab: newest first, all entries, settings hidden, buttons kept
        await ev(pg,"""(()=>{ T.reset('relaxed');
          G.ui.say('You wake on cold stone at the top of a sea cliff, shivering. Fog is rolling in off the water.');
          G.ui.say('“Can’t get in, can you?” he says. “No more could I. Not since the light went wrong.”','Halloran');
          for(let i=0;i<3;i++){ G.ui.say('Keep them back! Keep those things away from me!','Halloran'); T.steps(1); }
          G.ui.say('A gull cries somewhere below.',{priority:'low'});
          G.ui.say('Something vast stands up out of the roots: a stag made of absence, its crown burning with ink.',{priority:'high'});
          T.steps(3);
          G.ui.say('The mushroom glows the same violet as the lantern.',{priority:'low'}); T.steps(1);
          document.getElementById('pauseBtn').click(); G.step(1/30,2); document.getElementById('pzTabMsgs').click(); G.step(1/30,2); })()""")
        r=await ev(pg,"""(()=>{ const li=[...document.querySelectorAll('#pzLog li.pz-msg')], vis=el=>!!el&&el.getClientRects().length>0;
          return {mode:G.state.mode, items:li.length, n:G.ui.messages().length, first:li[0]&&li[0].querySelector('p').textContent.slice(0,20),
            rep:document.querySelector('#pzLog .rep')&&document.querySelector('#pzLog .rep').textContent, missed:document.querySelectorAll('#pzLog .flag').length,
            who:li.map(l=>{const b=l.querySelector('b'); return b?b.textContent:''}).filter(Boolean).length,
            settings:vis(document.getElementById('capSpeedSeg')), resume:vis(document.getElementById('resume')), journal:vis(document.getElementById('journalBtn')),
            tab:document.getElementById('pzTabMsgs').getAttribute('aria-selected'), count:document.getElementById('pzCount').textContent,
            ctx:li[0]&&li[0].querySelector('.ctx').textContent, fs:li[0]&&parseFloat(getComputedStyle(li[0].querySelector('p')).fontSize)}; })()""")
        ok=(r['mode']=='paused' and r['items']==r['n']==6 and r['first']=='The mushroom glows t' and r['rep']=='×3' and r['who']>=2 and not r['settings'] and r['resume']
            and r['tab']=='true' and r['count']=='6' and r['ctx'] and r['fs']>=17)
        check('messages-tab', ok, r)
        await ev(pg,"G.headless.draw(3)"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/messages-desktop.png')
        await pg.set_viewport_size({'width':390,'height':844}); await pg.wait_for_timeout(300)
        await ev(pg,"G.headless.draw(3)"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/messages-phone.png')
        r=await ev(pg,"""(()=>{ const s=document.querySelector('#pause .sheet').getBoundingClientRect(), l=document.getElementById('pzLog');
          return {sheetW:Math.round(s.width), left:Math.round(s.left), right:Math.round(innerWidth-s.right), scroll:document.documentElement.scrollWidth<=innerWidth, logScrolls:l.scrollHeight>l.clientHeight||l.scrollHeight<=l.clientHeight}; })()""")
        check('phone-layout', r['left']>=12 and r['right']>=12 and r['scroll'], r)
        await pg.set_viewport_size({'width':1100,'height':680}); await pg.wait_for_timeout(200)
        # back to the Paused tab: settings show again, the caption-speed buttons work and persist
        r=await ev(pg,"""(()=>{ document.getElementById('pzTabMain').click(); document.querySelector('#capSpeedSeg [data-cap=hold]').click();
          const vis=el=>!!el&&el.getClientRects().length>0;
          return {settings:vis(document.getElementById('capSpeedSeg')), log:vis(document.getElementById('pzLog')), speed:G.ui.captionSpeed,
            pressed:document.querySelector('#capSpeedSeg [data-cap=hold]').getAttribute('aria-pressed'), stored:localStorage.getItem('bq-captions'),
            note:document.getElementById('capSpeedNote').textContent.slice(0,30)}; })()""")
        await ev(pg,"G.headless.draw(3)"); await pg.wait_for_timeout(350)
        await pg.screenshot(path=f'{OUT}/pause-settings.png')
        check('speed-setting', r['settings'] and not r['log'] and r['speed']=='hold' and r['pressed']=='true' and 'hold' in (r['stored'] or ''), r)

        # 10. persistence: the log rides in the save (key 'captions'), the reading time in localStorage; both survive a reload
        r=await ev(pg,"(()=>{ document.getElementById('resume').click(); G.step(1/30,2); const ok=G.flow.writeSave(); const d=G.flow.readSave(); return {ok, has:!!(d&&d.mods&&d.mods.captions), v:d&&d.mods.captions&&d.mods.captions.v, n:d&&d.mods.captions&&d.mods.captions.list.length}; })()")
        saved_n=r['n']
        check('saved', r['ok'] and r['has'] and r['v']==1 and r['n']==6, r)
        store=await ev(pg,"JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])))")
        await pg.reload(); await pg.wait_for_timeout(5000)
        r=await ev(pg,"""(()=>{ const sp=G.ui.captionSpeed; document.getElementById('continue').click(); G.step(1/30,30); const M=G.ui.messages();
          return {speed:sp, n:M.length, rep:(M.find(m=>m.n>1)||{}).n, missed:M.filter(m=>m.missed).length, who:M.filter(m=>m.who==='Halloran').length, last:M[M.length-1]&&M[M.length-1].text.slice(0,20)}; })()""")
        check('reload', r['speed']=='hold' and r['n']>=saved_n and r['rep']==3 and r['who']>=2, r)
        # an old save without the log, and one with an unknown version, load fine (the log just starts empty)
        r=await ev(pg,"""(()=>{ const d=G.flow.readSave(); const a=JSON.parse(JSON.stringify(d)); delete a.mods.captions; G.ui.clearMessages(); G.flow.applySave(a);
          const n0=G.ui.messages().length; const b=JSON.parse(JSON.stringify(d)); b.mods.captions={v:99,list:[{t:'x'}]}; G.flow.applySave(b); return {n0, n1:G.ui.messages().length, mode:G.state.mode}; })()""")
        check('old-saves', r['n0']==0 and r['n1']==0 and r['mode']=='play', r)

        # 11. phone: touch device at 390x844; the caption sits up top and a tap on it advances it; the Messages tab fits
        await pg.close()
        mctx=await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
        await mctx.add_init_script(f"(()=>{{ const s={store}; if(!localStorage.getItem('bq-save-v1'))for(const k in s)localStorage.setItem(k,s[k]); }})()")
        mp=await mctx.new_page()
        mp.on('pageerror',lambda e:errs.append('pageerror(m): '+str(e)))
        await mp.goto(URL,timeout=180000,wait_until='domcontentloaded'); await mp.wait_for_timeout(8000)
        await ev(mp,HELPERS)
        await ev(mp,"(()=>{ document.getElementById('continue').click(); G.step(1/30,30); T.reset('hold'); G.ui.say('Halloran is standing at the foot of the tower, as if he’s been waiting a while. “Well,” he says.','Halloran'); G.ui.say('“I saw it go out from down here.”','Halloran'); G.step(1/30,120); })()")
        await ev(mp,"G.headless.draw(3)"); await mp.wait_for_timeout(400)
        await mp.screenshot(path=f'{OUT}/caption-phone.png')
        box=await mp.locator('#cap').bounding_box()
        await mp.touchscreen.tap(box['x']+box['width']*.4, box['y']+box['height']*.5)
        r=await ev(mp,"(()=>{ G.step(1/30,3); return {cur:T.cap().slice(0,12), atk:window.ATK, hint:document.querySelector('#cap .capnext').textContent, top:Math.round(document.getElementById('cap').getBoundingClientRect().top)}; })()")
        check('phone-tap', r['cur']=='“I saw it go' and r['atk']==0, dict(r,capTop=round(box['y'])))
        await ev(mp,"(()=>{ document.getElementById('pauseBtn').click(); G.step(1/30,2); document.getElementById('pzTabMsgs').click(); G.step(1/30,2); G.headless.draw(3); })()")
        await mp.wait_for_timeout(400)
        await mp.screenshot(path=f'{OUT}/messages-phone-touch.png')
        await mctx.close()
        await b.close()
    for e in errs[:10]: print('  ',e[:300])
    ok=ok_all and not errs
    print(('PASS' if ok else 'FAIL'), f'{len(results)} checks', f'{time.time()-t0:.0f}s'); sys.exit(0 if ok else 1)
asyncio.run(main())

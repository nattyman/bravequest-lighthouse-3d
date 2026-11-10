"""HUD e2e (~4-6 min): the stacked caption cards (back cards, +N badge, the slide when the front card goes, reduced motion),
the stamina wheel (hidden at full, green / amber / exhausted / refill pulse) and the controller status (standard pad,
non-standard Xbox layout, a ghost pad listed first, a null entry, a SecurityError, a permissions policy that forbids
'gamepad', no pads), including A starting the game from the title.
Screenshots go to /tmp/claude-0/jacob-hud/ (desktop 1280x760, phone portrait 390x844 and landscape 844x390).
usage: python3 test/hud_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)
"""
import asyncio, sys, time, json, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
OUT='/tmp/claude-0/jacob-hud'; os.makedirs(OUT,exist_ok=True)
CHROME=dict(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
results=[]; ok_all=True
def check(name,ok,info):
    global ok_all
    ok_all=ok_all and bool(ok); results.append(name)
    print(f"{'ok  ' if ok else 'FAIL'} {name:22s} {json.dumps(info)[:420]}",flush=True)

HELPERS=r"""
window.T={
  // stamina pinned after player.js (order 20) so regen in the real-time loop doesn't move it between steps and screenshots
  pin:null,
  stam(v,ex,n){ T.pin={s:v,e:!!ex}; G.step(1/30,n||20); return G.ui.staminaWheel(); },
  unpin(){ T.pin=null; },
  lines(n){ G.ui.setCaptionSpeed('hold'); G.ui.clearCaptions(); const who=['Halloran','Hesper','','Wren','Halloran','Corwin'];
    for(let i=0;i<n;i++)G.ui.say(['The fog came in off the water before dawn, and it has not lifted since.','Keep the lantern shut near the patches.',
      'Something moves on the moor.','The bell in the hamlet rang once, then stopped.','The tower door faces west.','Mind the stair.'][i%6],who[i%6]);
    G.step(1/30,3); return G.ui.captionStack(); },
  // place the player on the open headland, facing away from the tower so the wheel sits over the sky and grass
  spot(){ G.player.teleport(150,42.2,-14,Math.PI*.5); G.step(1/30,20); },
  rect(el){ if(!el)return null; const r=el.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom}; },
  overlap(a,b){ return a&&b&&a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b; },
};
G.system('testPinStamina',{order:21,update(){ const p=T.pin; if(p&&G.player){ G.player.stamina=p.s; G.player.exhausted=p.e; } }});
G.input.lockPointer=()=>{}; G.input.unlockPointer=()=>{};
"""

def pad_js(kind):
    """an init script that stubs navigator.getGamepads before the game loads"""
    base=r"""
window.__mk=(id,mapping,nb,axes,index)=>({id,index,connected:true,mapping,timestamp:0,axes:axes.slice(),buttons:Array.from({length:nb},()=>({pressed:false,touched:false,value:0}))});
window.__btn=(p,i,on)=>{ p.buttons[i]={pressed:!!on,touched:!!on,value:on?1:0}; p.timestamp++; };
"""
    if kind=='standard': body="window.__pad=__mk('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)','standard',17,[0,0,0,0],0); navigator.getGamepads=()=>[__pad,null,null,null];"
    elif kind=='nonstandard': body="window.__pad=__mk('045e-02ea-Microsoft X-Box One S pad','',11,[0,0,-1,0,0,-1,0,0],0); navigator.getGamepads=()=>[__pad,null,null,null];"
    elif kind=='ghost': body="window.__ghost=__mk('Virtual Gamepad (STANDARD GAMEPAD)','standard',17,[0,0,0,0],0); window.__pad=__mk('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)','standard',17,[0,0,0,0],2); navigator.getGamepads=()=>[__ghost,null,__pad,null];"
    elif kind=='none': body="navigator.getGamepads=()=>[null,null,null,null];"
    elif kind=='throw': body="navigator.getGamepads=()=>{ throw new DOMException(\"Failed to execute 'getGamepads' on 'Navigator': Access to the feature \\\"gamepad\\\" is disallowed by permissions policy.\",'SecurityError'); };"
    elif kind=='policy': body="Object.defineProperty(document,'permissionsPolicy',{configurable:true,value:{allowsFeature:f=>f!=='gamepad'}}); Object.defineProperty(document,'featurePolicy',{configurable:true,value:undefined}); navigator.getGamepads=()=>[null,null,null,null];"
    return base+body

async def shot(pg,name):
    # headless frames are rare, so CSS transitions can sit at their start for a while: settle the finite ones first
    await pg.evaluate("document.getElementById('toast').classList.remove('show')") # the 'Controller connected' toast from the stub pad
    await pg.evaluate("(()=>{ for(const a of document.getAnimations()){ try{ if(a.effect&&a.effect.getTiming().iterations!==Infinity)a.finish(); }catch(_){} } G.headless&&G.headless.draw(3); })()"); await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{OUT}/{name}.png',timeout=120000)

async def boot(b,kind=None,view=None,mobile=False,reduce=False):
    errs=[]
    kw=dict(viewport=view or {'width':1280,'height':760})
    if mobile: kw.update(is_mobile=True,has_touch=True,device_scale_factor=2)
    if reduce: kw.update(reduced_motion='reduce')
    ctx=await b.new_context(**kw)
    if kind: await ctx.add_init_script(pad_js(kind))
    pg=await ctx.new_page()
    pg.on('pageerror',lambda e:errs.append('pageerror: '+str(e)))
    pg.on('console',lambda m:errs.append('console: '+m.text) if m.type=='error' and '404' not in m.text else None)
    await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
    return ctx,pg,errs

async def play(pg):
    await pg.evaluate("(()=>{ document.getElementById('begin').click(); G.step(1/30,40); })()")
    await pg.evaluate(HELPERS)

async def views(b):
    """stack + stamina + pause controller line at three sizes; the touch checks on phones"""
    for tag,view,mobile in [('desktop',{'width':1280,'height':760},False),('portrait',{'width':390,'height':844},True),('landscape',{'width':844,'height':390},True)]:
        ctx,pg,errs=await boot(b,'standard',view,mobile)
        await play(pg)
        await pg.evaluate("T.spot(); G.ui.clearCaptions(); G.ui.clearMessages()")
        # 1. stack: five lines -> front + two edges + '+4'; Enter moves the next one forward (a leaving copy slides off)
        if tag=='desktop':
            r=await pg.evaluate("""(()=>{ const s0=T.lines(5); const c0=G.ui.captions();
              G.ui.advance(); G.ui.advance(); G.step(1/30,2); const s1=G.ui.captionStack(), c1=G.ui.captions();
              G.ui.advance(); G.ui.advance(); G.step(1/30,2); const s2=G.ui.captionStack();
              G.ui.advance(); G.ui.advance(); G.step(1/30,2); const s3=G.ui.captionStack();
              G.ui.advance(); G.ui.advance(); G.step(1/30,2); const s4=G.ui.captionStack();
              G.ui.advance(); G.ui.advance(); G.step(1/30,2); const s5=G.ui.captionStack(), c5=G.ui.captions();
              return {s0,q0:c0.queue.length,cur0:c0.cur.text.slice(0,12),s1,cur1:c1.cur.text.slice(0,12),q1:c1.queue.length,s2,s3,s4,s5,end:!c5.cur,
                hint:document.querySelector('#cap .capnext').textContent}; })()""")
            ok=(r['s0']['depth']==2 and r['s0']['count']=='+4' and r['s0']['who']==['Hesper',''] and r['q0']==4
                and r['s1']['depth']==2 and r['s1']['count']=='+3' and r['s1']['leaving']>=1 and r['cur1'].startswith('Keep') and r['s1']['who']==['','Wren']
                and r['s2']['depth']==2 and r['s2']['count']=='' and r['s3']['depth']==1 and r['s4']['depth']==0 and r['s5']['depth']==0 and r['end'])
            check('stack:advance',ok,r)
            # the timed modes still pace the queue: a Standard queue drains on its own, the stack shrinking as it goes
            r=await pg.evaluate("""(()=>{ G.ui.setCaptionSpeed('standard'); G.ui.clearCaptions(); for(const t of ['One line.','Two line.','Three line.'])G.ui.say(t,'Halloran');
              G.step(1/30,2); const d0=G.ui.captionStack().depth; let seen=[]; for(let k=0;k<40;k++){ G.step(1/30,15); const c=G.ui.captions(); seen.push(G.ui.captionStack().depth); if(!c.cur&&!c.queue.length)break; }
              const out={d0,seen:[...new Set(seen)],done:!G.ui.captions().cur}; G.ui.setCaptionSpeed('hold'); return out; })()""")
            check('stack:timed',r['d0']==2 and 1 in r['seen'] and 0 in r['seen'] and r['done'],r)
            # a same-key update rewrites the front card in place (no slide); low lines still never wait behind real ones
            r=await pg.evaluate("""(()=>{ G.ui.clearCaptions(); G.ui.say('3 moths left',{key:'m'}); G.step(1/30,2); const l0=document.querySelectorAll('.caption.leaving').length;
              G.ui.say('2 moths left',{key:'m'}); G.step(1/30,1); const l1=document.querySelectorAll('.caption.leaving').length;
              G.ui.say('Real line.'); G.ui.say('a flavour aside',{priority:'low'}); G.step(1/30,2);
              return {l0,l1,cur:G.ui.captions().cur.text,q:G.ui.captions().queue.map(q=>q.text)}; })()""")
            check('stack:inplace',r['l1']==r['l0'] and r['cur']=='2 moths left' and r['q']==['Real line.'],r)
        # the 3-deep stack (front + two edges, +3) for the screenshot; on phones it must stay clear of the touch buttons
        await pg.wait_for_timeout(800)
        r=await pg.evaluate("""(()=>{ const s=T.lines(4); G.ui.advance(); G.step(1/30,2); const st=document.getElementById('capStack');
          const backs=[...st.querySelectorAll('.capback.on')].map(T.rect), cnt=T.rect(document.getElementById('capCount')), front=T.rect(document.getElementById('cap'));
          const btns=[...document.querySelectorAll('#touch button')].filter(b=>b.getClientRects().length&&!b.hidden).map(T.rect);
          const hearts=T.rect(document.querySelector('#hud .hud-top'));
          const all=[front,...backs,cnt].filter(Boolean);
          return {s:G.ui.captionStack(), hitsTouch:all.some(a=>btns.some(b=>T.overlap(a,b))), btns:btns.length,
            inView:all.every(a=>a.l>=0&&a.t>=0&&a.r<=innerWidth&&a.b<=innerHeight), hitsTop:backs.concat(cnt?[cnt]:[]).some(a=>T.overlap(a,hearts)), front, backs, cnt}; })()""")
        check(f'stack:{tag}',r['s']['depth']==2 and r['s']['count']=='+3' and not r['hitsTouch'] and r['inView'] and not r['hitsTop'] and (r['btns']>0)==mobile,r)
        await pg.wait_for_timeout(1500)
        await shot(pg,f'stack-{tag}')
        await pg.evaluate("G.ui.clearCaptions()"); await pg.wait_for_timeout(1200)
        # 2. stamina: hidden at full, green at 50%, amber at 20%, flashing while exhausted, a pulse when it refills, then gone
        if tag=='desktop':
            r=await pg.evaluate("""(()=>{ const full=T.stam(1,false,30), half=T.stam(.5,false), w=document.getElementById('stamina').getBoundingClientRect().width, low=T.stam(.2,false), exh=T.stam(.1,true);
              const arc=getComputedStyle(document.getElementById('stamArc')).animationName;
              T.stam(.97,false,10); T.pin={s:1,e:false}; G.step(1/30,3); const pulse=G.ui.staminaWheel(); G.step(1/30,90); const after=G.ui.staminaWheel(); T.unpin();
              return {full,half,low,exh,arc,pulse,after,w}; })()""")
            ok=(not r['full']['shown'] and r['half']['shown'] and r['half']['state']=='ok' and abs(r['half']['frac']-.5)<.02 and r['low']['state']=='low'
                and r['exh']['state']=='exh' and r['arc']=='stamExh' and r['pulse']['shown'] and r['pulse']['state']=='full' and not r['after']['shown'] and 48<=r['w']<=60)
            check('stamina:states',ok,r)
        await pg.evaluate("T.stam(.5,false)"); await shot(pg,f'stamina50-{tag}')
        await pg.evaluate("T.stam(.18,true)"); await shot(pg,f'stamina-exhausted-{tag}')
        r=await pg.evaluate("(()=>{ const w=G.ui.staminaWheel(), e=T.rect(document.getElementById('stamina')); return {w,inView:e.l>=0&&e.t>=0&&e.r<=innerWidth&&e.b<=innerHeight}; })()")
        check(f'stamina:{tag}',r['w']['shown'] and r['w']['state']=='exh' and r['inView'],r)
        await pg.evaluate("T.unpin(); T.stam(1,false,5); T.unpin()")
        # 3. pause menu with the controller line
        await pg.evaluate("(()=>{ document.getElementById('pauseBtn').click(); G.step(1/30,2); })()")
        await pg.wait_for_timeout(700)
        r=await pg.evaluate("(()=>{ const e=document.querySelector('#pause [data-pad-status]'); const r=e.getBoundingClientRect(); return {mode:G.state.mode,text:e.textContent,state:e.dataset.state,vis:r.height>0}; })()")
        check(f'pause:{tag}',r['mode']=='paused' and r['state']=='connected' and 'Xbox Wireless Controller — connected' in r['text'] and r['vis'],r)
        await pg.evaluate("(()=>{ const e=document.querySelector('#pause [data-pad-status]'); e.scrollIntoView({block:'center'}); })()")
        await shot(pg,f'pause-controller-{tag}')
        check(f'errors:{tag}',not errs,errs[:5])
        await ctx.close()

async def reduced(b):
    ctx,pg,errs=await boot(b,None,{'width':844,'height':390},True,reduce=True)
    await play(pg)
    r=await pg.evaluate("(()=>{ const s0=T.lines(3); const typing=G.ui.captions().cur.typing; G.ui.advance(); G.step(1/30,1); return {s0,typing,s1:G.ui.captionStack(),cur:G.ui.captions().cur.text.slice(0,8)}; })()")
    check('stack:reduced-motion',r['s0']['depth']==2 and not r['typing'] and r['s1']['depth']==1 and r['s1']['leaving']==0 and r['cur']=='Keep the',r)
    await ctx.close()

async def pads(b):
    # A on the title starts the game (the Begin button), and the Controls screen names the pad
    for kind,name in [('standard','Xbox Wireless Controller'),('nonstandard','Xbox Wireless Controller'),('ghost','Xbox Wireless Controller')]:
        ctx,pg,errs=await boot(b,kind)
        r=await pg.evaluate("""(()=>{ G.step(1/30,2); const before=G.input.gamepad;
          __btn(__pad,0,true); G.step(1/30,3); __btn(__pad,0,false); G.step(1/30,30);
          const c=document.querySelector('#controlsCard [data-pad-status]');
          return {mode0:'title',before,ctl:c.textContent,ctlState:c.dataset.state,mode1:G.state.mode,after:G.input.gamepad,title:!document.getElementById('title').hidden}; })()""")
        await pg.evaluate(HELPERS)
        extra={}
        if kind=='nonstandard':
            # at rest the -1 triggers must not turn the camera; the right stick (axis 3) does; LT (axis 2) reads as lock-on
            extra=await pg.evaluate("""(()=>{ const looks=[]; G.input.endFrame(); G.input.poll(1/30); looks.push(G.input.look().x); G.input.endFrame();
              __pad.axes[3]=.9; G.input.poll(1/30); const turn=G.input.look().x; G.input.endFrame(); __pad.axes[3]=0;
              __pad.axes[2]=1; G.input.poll(1/30); const lt=G.input.down('lock'); G.input.endFrame(); __pad.axes[2]=-1; G.input.poll(1/30); G.input.endFrame();
              __pad.axes[0]=.9; G.input.poll(1/30); const mv=G.input.move(); G.input.endFrame(); __pad.axes[0]=0;
              return {rest:looks[0],turn,lt,mx:+mv.x.toFixed(2)}; })()""")
        ok=(r['mode0']=='title' and r['ctlState']=='connected' and (name+' — connected') in r['ctl'] and r['mode1']=='play' and not r['title'])
        if kind=='nonstandard': ok=ok and 'remapped' in r['ctl'] and extra['rest']==0 and extra['turn']>5 and extra['lt'] and extra['mx']>.5
        if kind=='ghost': ok=ok and r['after']['index']==2
        check(f'pad:{kind}',ok,{**r,**extra})
        check(f'pad:{kind}:errors',not errs,errs[:5])
        await ctx.close()
    # no controller / blocked by a SecurityError / blocked by the permissions policy
    for kind,state,want in [('none','none','No controller found — connect it and press A'),
                            ('throw','blocked','Controllers are blocked in this embedded page — open the game in its own tab'),
                            ('policy','blocked','Controllers are blocked in this embedded page — open the game in its own tab')]:
        ctx,pg,errs=await boot(b,kind)
        r=await pg.evaluate("""(()=>{ G.step(1/30,2); const n=document.getElementById('padNote'); if(document.activeElement)document.activeElement.blur();
          document.getElementById('controlsBtn').click(); G.step(1/30,4); const c=document.querySelector('#controlsCard [data-pad-status]');
          const out={note:n.hidden?'':n.textContent,ctl:c.textContent,state:c.dataset.state,pad:G.input.gamepad};
          document.getElementById('controlsBack').click(); G.step(1/30,2); return out; })()""")
        ok=r['state']==state and r['ctl'].startswith(want)
        if kind=='none': ok=ok and 'Press A' in r['note']
        if kind=='throw': ok=ok and 'SecurityError' in r['ctl'] and r['pad']['blocked']
        if kind!='none': ok=ok and 'blocked' in r['note']
        check(f'pad:{kind}',ok,r)
        if kind=='throw': await shot(pg,'title-blocked-desktop')
        if kind=='none': await shot(pg,'title-nopad-desktop')
        check(f'pad:{kind}:errors',not [e for e in errs if 'Gamepad' not in e],errs[:5])
        await ctx.close()

async def main():
    t0=time.time()
    async with async_playwright() as p:
        b=await p.chromium.launch(**CHROME)
        only=os.environ.get('HUD_ONLY','')
        if not only or 'pads' in only: await pads(b)
        if not only or 'reduced' in only: await reduced(b)
        if not only or 'views' in only: await views(b)
        await b.close()
    print(('PASS' if ok_all else 'FAIL'),f'{len(results)} checks',f'{time.time()-t0:.0f}s'); sys.exit(0 if ok_all else 1)
asyncio.run(main())

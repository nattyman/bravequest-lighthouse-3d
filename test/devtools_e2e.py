"""Test tools (js/devtools.js): every start point through the real panel (no ?debug), state asserts, normal play after each
(walk, strike, a monster fight), God mode, the real save slot untouched, the mid-game reload path, panel screenshots.
usage: python3 test/devtools_e2e.py [url]   (default http://localhost:8800/dev.html — deliberately without ?debug)"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html'
SHOTS='/tmp/claude-0/devtools'; os.makedirs(SHOTS,exist_ok=True)
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
REAL='{"v":1,"at":1700000000000,"step":"forest","objective":"Find the keeper\\u2019s lantern","sub":"","flags":{},"lantern":{"found":false},"mods":{}}'

LIB=r"""
window.T=(()=>{
const P=()=>G.player;
function tap(a,n){ G.input.setVirtual(a,true); G.step(1/30,1); G.input.setVirtual(a,false); G.step(1/30,n==null?3:n); }
function state(){ const $=id=>{const e=document.getElementById(id); return e?e.textContent:'';};
  const cp=G.cavePuzzles;
  return {mode:G.state.mode,obj:$('obj'),sub:$('objSub'),loop:!!G.loop.active,cured:!!G.items.lantern.cured,carried:!!G.items.lantern.carried,
    staff:!!G.items.staff.owned,cloak:!!(G.items.cloak&&G.items.cloak.owned),inside:!!G.cave.inside,room:G.cave.inside?G.cave.room(P().pos):null,
    open:cp?['gallery','channel','arena'].filter(id=>cp.open(id)):[],lit:G.cave.litRooms,swarm:G.creatures.moths.filter(m=>m.tgt==='lantern'||m.tgt==='hunt'||m.tgt==='feed').length,
    tideLow:!!G.tide.low,jar:!!G.moths.jar.owned,defeated:!!(G.caveBoss&&G.caveBoss.defeated),wall:!!G.cave.wallDown,shortcut:G.cave.gate('shortcut'),
    hp:P().hp,test:!!G.testSaves,step:G.quest.step,lamp:!!(G.lamp&&G.lamp.active),hud:!document.getElementById('hud').hidden};
}
/* normal play: walk forward, strike, then fight a hollow spawned in front with real lock-on + strikes */
function play(){
  const p0=P().pos.clone(); let atk=0; const off=G.on('player:attack',()=>atk++);
  G.input.setVirtual('forward',true); G.step(1/30,30); G.input.setVirtual('forward',false); G.step(1/30,6);
  const walked=+P().pos.distanceTo(p0).toFixed(2);
  tap('attack',14);
  const hpKeep=P().maxHp; G.devtools.toggle('god');
  G.devtools.spawn('hollow'); G.setMode('play');
  const m=G.monsters.list[G.monsters.list.length-1]; const hp0=m.hp; let n=0;
  while(m.alive&&!m.dying&&n<160){ const d=Math.hypot(m.pos.x-P().pos.x,m.pos.z-P().pos.z);
    if(!P().lockTarget)tap('lock',1);
    if(d>1.8){ G.input.setVirtual('forward',true); G.step(1/30,4); G.input.setVirtual('forward',false); }
    tap('attack',8); n++; }
  G.devtools.toggle('god'); off&&off();
  if(P().lockTarget)tap('lock',1);
  return {walked,atk,monsterHp0:hp0,monsterHp:m.hp,killed:!m.alive||m.dying,swings:n};
}
return {P,tap,state,play};
})(); 0
"""

async def boot(b,vw=1280,vh=800,mobile=False,real=True):
    ctx=await b.new_context(viewport={'width':vw,'height':vh},is_mobile=mobile,has_touch=mobile,device_scale_factor=2 if mobile else 1)
    pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    await pg.goto(URL,wait_until='domcontentloaded',timeout=400000)
    if real: await pg.evaluate("s=>{localStorage.setItem('bq-save-v1',s); localStorage.removeItem('bq-save-test-v1');}",REAL); await pg.reload(wait_until='domcontentloaded',timeout=400000)
    await pg.wait_for_function("window.G&&G.flow&&document.getElementById('loading').textContent.startsWith('Ready')",timeout=120000)
    await pg.wait_for_timeout(800)
    return ctx,pg,errs

FAIL=[]
def check(name,cond,info=''):
    print(('PASS ' if cond else 'FAIL ')+name+('' if cond else '  '+str(info)[:400]));
    if not cond: FAIL.append(name)

EXPECT={
 'story':lambda s:s['obj']=='Get out of the cold' and not s['loop'] and not s['staff'],
 'loop':lambda s:s['loop'] and s['cured'] and s['staff'] and s['cloak'] and s['lamp'] and s['obj']=='Feed the light',
 'lamp-failed':lambda s:not s['loop'] and not s['cured'] and s['staff'] and s['obj']=='Go back down',
 'stag':lambda s:not s['loop'] and not s['cured'] and s['staff'] and s['obj']=='Find Hesper’s lantern',
 'finale':lambda s:not s['loop'] and s['cured'] and s['staff'] and s['obj']=='Something is climbing the cliff',
 'sandbar':lambda s:s['loop'] and s['tideLow'] and s['carried'] and s['swarm']>=50 and not s['inside'] and 'Cave' in s['obj'],
 'cave:mouth':lambda s:s['inside'] and s['room']=='mouth' and s['open']==[] and s['lit']==[] and s['swarm']>=50,
 'cave:gallery':lambda s:s['room']=='gallery' and s['open']==[] and s['lit']==['mouth'] and s['swarm']>=50,
 'cave:stair':lambda s:s['room']=='stair' and s['open']==['gallery'] and set(s['lit'])=={'mouth','gallery'} and s['swarm']>=50,
 'cave:channel':lambda s:s['room']=='channel' and s['open']==['gallery'] and len(s['lit'])==3 and s['swarm']>=50,
 'cave:drafts':lambda s:s['room']=='drafts' and s['open']==['gallery','channel'] and len(s['lit'])==4 and s['swarm']>=50,
 'cave:arena':lambda s:s['room']=='arena' and s['open']==['gallery','channel','arena'] and len(s['lit'])==5 and not s['defeated'] and s['swarm']>=50,
 'cave:after':lambda s:s['room']=='arena' and s['defeated'] and s['jar'] and s['wall'] and s['shortcut'] and len(s['lit'])==6 and s['swarm']>=50,
}

async def run_start(b,sid):
    ctx,pg,errs=await boot(b)
    try: await run_start2(ctx,pg,errs,sid)
    finally: await ctx.close()
async def run_start2(ctx,pg,errs,sid):
    await pg.evaluate(LIB)
    await pg.keyboard.press('Backquote'); await pg.wait_for_timeout(300)
    vis=await pg.evaluate("!document.getElementById('devtools').hidden")
    check(sid+' panel opens with `',vis)
    await pg.evaluate("id=>document.querySelector('#devtools [data-start=\"'+id+'\"]').click()",sid); await pg.wait_for_timeout(1500)  # JS click: Playwright actionability waits trip over slow software-GL frames
    await pg.evaluate("G.step(1/30,30); 0")
    s=await pg.evaluate("T.state()")
    check(sid+' state',EXPECT[sid](s) and s['test'] and s['hud'] and s['mode']=='play',s)
    extra={}
    if sid=='lamp-failed':
        r=await pg.evaluate("""(()=>{ G.input.setVirtual('forward',true); G.step(1/30,50); G.input.setVirtual('forward',false); G.step(1/30,10);
          const h=G.creatures.halloran.pos; return {obj:document.getElementById('obj').textContent,hal:+Math.hypot(h.x-180,h.z).toFixed(1)}; })()""")
        check('lamp-failed: stepping out, Halloran waits at the tower',r['obj']=='Talk to Halloran' and r['hal']<14,r)
    if sid=='stag':
        r=await pg.evaluate("""(()=>{ G.input.setVirtual('forward',true); G.step(1/30,60); G.input.setVirtual('forward',false); G.step(1/30,30);
          const b=G.monsters.boss; return {obj:document.getElementById('obj').textContent,boss:b&&b.kind}; })()""")
        check('stag: walking in raises the Hollow Stag',r['boss']=='stag' and r['obj']=='Take back Hesper’s lantern',r)
        r=await pg.evaluate("""(()=>{ const b=G.monsters.boss; let n=0; while(b&&b.alive&&!b.dying&&n<120){ G.combat.strike({x:b.pos.x,y:b.pos.y+1,z:b.pos.z,radius:3,team:'player',damage:4}); G.step(1/30,12); n++; } G.step(1/30,150);
          return {n,mode:G.state.mode,ending:!document.getElementById('ending').hidden,obj:document.getElementById('obj').textContent}; })()""")
        check('stag: it falls, no ending, the lantern is next',not r['ending'] and r['obj']=='Take Hesper’s lantern',r)
    if sid=='finale':
        r=await pg.evaluate("""(()=>{ window._fs=0; G.on('finale:start',()=>_fs++); const lh=G.world.lighthouse, d=lh.doorOut; G.player.teleport(d.x-3,d.y,d.z,-Math.PI/2); G.step(1/30,120);
          return {obj:document.getElementById('obj').textContent,fs:_fs,stag:!!G.monsters.boss}; })()""")
        check('finale: stepping out starts the finale (no Stag)',r['obj']=='Defend the lighthouse' and r['fs']==1 and not r['stag'],r)
        r=await pg.evaluate("""(()=>{ const B=G.finaleBoss; if(B&&B.active){ B.hp=0; G.step(1/30,30); } G.emit('boss:dead',{who:'gloaming'}); G.step(1/30,200); return {mode:G.state.mode,ending:!document.getElementById('ending').hidden}; })()""")
        check('finale: the Gloaming falls -> ending card',r['ending'],r)
        await pg.evaluate("document.getElementById('keep').click(); 0"); await pg.wait_for_timeout(500)
        r=await pg.evaluate("[G.loop.active,document.getElementById('obj').textContent]")
        check('finale: keep exploring -> loop',r[0] and r[1]=='Feed the light',r)
    if sid=='sandbar':
        r=await pg.evaluate("""(()=>{ const m=G.world.landmarks.caveMouth; G.player.teleport(m.x,m.y,m.z-.4,Math.PI); G.step(1/30,4); const c=G.interact.pick(G.player.pos); const lab=c&&G.interact.label(c); if(c)c.use(); G.step(1/30,60);
          return {lab,inside:G.cave.inside,room:G.cave.room(G.player.pos),swarm:T.state().swarm}; })()""")
        check('sandbar: walk in through the mouth with the swarm',r['inside'] and r['swarm']>=40,r)
    if sid=='cave:arena':
        r=await pg.evaluate("""(()=>{ G.step(1/30,200); return {boss:G.caveBoss.state}; })()""")
        print('   arena boss state after 7 s:',r)
    p=await pg.evaluate("T.play()")
    # (story start: no staff yet, so swings can't hurt anything — that's the real game)
    check(sid+' play continues (walk/strike/fight)',p['walked']>1.5 and p['atk']>=1 and (sid=='story' or p['monsterHp']<p['monsterHp0']),p)
    await pg.evaluate("G.flow.writeSave(); 0")
    sv=await pg.evaluate("[localStorage.getItem('bq-save-v1'),!!localStorage.getItem('bq-save-test-v1')]")
    check(sid+' real save untouched, test slot written',sv[0]==REAL and sv[1],sv[0][:80] if sv[0] else None)
    bad=[e for e in errs if 'PAGEERROR' in e or 'Error' in e]
    check(sid+' no page errors',not bad,bad[:5])

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        only=os.environ.get('ONLY')
        for sid in EXPECT:
            if only and sid not in only.split(','): continue
            try: await run_start(b,sid)
            except Exception as e: check(sid+' (exception)',False,e)
        if not only or 'misc' in only:
            # God mode, cheats, mid-game reload path, pause-menu entry, screenshots
            ctx,pg,errs=await boot(b)
            await pg.evaluate(LIB)
            await pg.click('#title [data-dt-open]'); await pg.wait_for_timeout(400)
            await pg.screenshot(path=SHOTS+'/panel-title-1280.png',timeout=180000)
            await pg.click('#devtools [data-start="loop"]'); await pg.wait_for_timeout(800)
            r=await pg.evaluate("""(()=>{ const P=G.player; G.devtools.toggle('god'); const hp=P.hp;
              G.devtools.spawn('hound'); G.devtools.spawn('hollow'); G.setMode('play'); G.step(1/30,300);
              const hpFight=P.hp, alive=P.alive;
              // off the cliff into the sea: rescued, unhurt
              P.teleport(230,null,0,0); P.pos.y=60; G.step(1/30,200);
              const rescued=Math.hypot(P.pos.x-230,P.pos.z)>5||P.pos.y>30;
              G.devtools.kill(); G.devtools.toggle('god'); return {hp,hpFight,alive,rescued,after:P.hp,mode:G.state.mode}; })()""")
            check('god mode: no damage, still rescued',r['hpFight']==r['hp'] and r['alive'] and r['after']==r['hp'] and r['rescued'],r)
            r=await pg.evaluate("""(()=>{ const P=G.player; G.devtools.toggle('stamina'); G.input.setVirtual('sprint',true); G.input.setVirtual('forward',true); G.step(1/30,200);
              G.input.setVirtual('sprint',false); G.input.setVirtual('forward',false); const st=P.stamina; G.devtools.toggle('stamina');
              G.devtools.toggle('ether'); const e0=G.lamp.ether; G.step(1/30,600); const e1=G.lamp.ether; const vials=G.inv.count('vial'); G.devtools.toggle('ether');
              const before=G.inv.list().length; for(const id in G.inv.ITEMS)G.devtools.give(id);
              G.devtools.setTide('high'); const hi=G.tide.level; G.devtools.setTide('low'); const lo=G.tide.low;
              return {st,e0,e1,vials,items:G.inv.list().map(x=>x.id+':'+x.n),hi,lo}; })()""")
            per=[]
            for n in (1,4):
                per.append(await pg.evaluate("n=>new Promise(res=>{ G.devtools.setSpeed(n); G.setMode('play'); let f=0; const t0=G.time; const tick=()=>{ f++; if(f<12)requestAnimationFrame(tick); else res((G.time-t0)/f); }; requestAnimationFrame(tick); })",n))
            check('time speed 4x advances game time ~4x per frame',per[1]>per[0]*2.5,per)
            check('stamina/ether/give/tide cheats',r['st']==1 and r['e1']>=r['e0']-1e-6 and r['vials']>=3 and len(r['items'])>=6 and r['hi']>.9 and r['lo'],r)
            await pg.evaluate("G.devtools.setSpeed(1); 0")
            badge=await pg.evaluate("[document.getElementById('dtBadge').hidden,document.getElementById('dtBadge').textContent]")
            check('TEST badge shows',not badge[0] and 'TEST' in badge[1],badge)
            # pause menu entry -> panel over the pause card; FPS on; screenshot; then a mid-game start (reloads)
            await pg.evaluate("G.devtools.toggle('fps'); G.setMode('play'); 0")
            await pg.evaluate("document.getElementById('pauseBtn').click(); 0"); await pg.wait_for_timeout(300)
            await pg.click('#pause [data-dt-open]'); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=SHOTS+'/panel-pause-1280.png',timeout=180000)
            await pg.evaluate("document.getElementById('devtools').scrollTop=9999; 0"); await pg.wait_for_timeout(200)
            await pg.screenshot(path=SHOTS+'/panel-pause-1280-bottom.png',timeout=180000)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            r=await pg.evaluate("[document.getElementById('devtools').hidden,!document.getElementById('pause').hidden,G.state.mode]")
            check('Esc closes the panel back to the pause menu',r==[True,True,'paused'],r)
            await pg.click('#resume'); await pg.wait_for_timeout(300)
            await pg.keyboard.press('Backquote'); await pg.wait_for_timeout(300)
            r=await pg.evaluate("[!document.getElementById('devtools').hidden,G.state.mode]")
            check('` from play opens and pauses',r==[True,'paused'],r)
            await pg.click('#devtools [data-start="cave:gallery"]')
            await pg.wait_for_function("window.G&&G.cave&&G.cave.inside",timeout=180000); await pg.wait_for_timeout(1500)
            await pg.evaluate(LIB)
            s=await pg.evaluate("T.state()")
            check('mid-game start reloads into a clean gallery',s['room']=='gallery' and s['open']==[] and s['lit']==['mouth'] and s['test'] and s['swarm']>=50,s)
            sv=await pg.evaluate("localStorage.getItem('bq-save-v1')")
            check('real save untouched after reload',sv==REAL)
            await pg.screenshot(path=SHOTS+'/gallery-start.png',timeout=180000)
            bad=[e for e in errs if 'PAGEERROR' in e]
            check('misc: no page errors',not bad,bad[:5])
            await ctx.close()
            # phone
            ctx,pg,errs=await boot(b,390,844,mobile=True)
            await pg.tap('#title [data-dt-open]'); await pg.wait_for_timeout(500)
            await pg.screenshot(path=SHOTS+'/panel-title-390.png',timeout=180000)
            await pg.tap('#devtools [data-start="loop"]'); await pg.wait_for_timeout(1500)
            await pg.evaluate("document.getElementById('pauseBtn').click(); 0"); await pg.wait_for_timeout(300)
            await pg.tap('#pause [data-dt-open]'); await pg.wait_for_timeout(1000)
            await pg.screenshot(path=SHOTS+'/panel-pause-390.png',timeout=180000)
            # touch-scroll the panel
            sc=await pg.evaluate("(()=>{const c=document.getElementById('devtools'); return [c.scrollHeight,c.clientHeight];})()")
            await pg.mouse.wheel(0,1400); await pg.wait_for_timeout(300)
            await pg.evaluate("document.getElementById('devtools').scrollTop=document.getElementById('devtools').scrollHeight; 0")
            await pg.screenshot(path=SHOTS+'/panel-pause-390-bottom.png',timeout=180000)
            w=await pg.evaluate("[document.documentElement.scrollWidth,innerWidth,document.querySelector('#devtools .sheet').getBoundingClientRect().right]")
            check('phone: panel scrolls and fits the width',sc[0]>sc[1] and w[2]<=w[1]+1,[sc,w])
            await pg.tap('#devtools [data-give="glowcap"]'); await pg.wait_for_timeout(200)
            g=await pg.evaluate("G.inv.count('glowcap')")
            check('phone: tap a give button',g>=5,g)
            await ctx.close()
        await b.close()
    print('\nFAILED: '+', '.join(FAIL) if FAIL else '\nALL PASS')
asyncio.run(main())

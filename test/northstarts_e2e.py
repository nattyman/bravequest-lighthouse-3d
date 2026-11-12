"""Test tools (js/devtools.js): the north island start points, clicked through the real panel (no ?debug), then a step of real
play from each (patch, sail, the cave mouth, the hoist, the meeting), plus a home teleport from inside the sea cave.
usage: python3 test/northstarts_e2e.py [url]   (default http://localhost:8800/dev.html)   ONLY=boat,north-hoist to pick"""
import asyncio, sys, os
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html'
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

LIB=r"""
window.T=(()=>{
const P=()=>G.player, $=id=>{const e=document.getElementById(id); return e?e.textContent:'';};
function label(){ const c=G.interact.pick(P().pos); return c?G.interact.label(c):null; }
function use(re){ const c=G.interact.pick(P().pos), l=c&&G.interact.label(c); if(c&&re.test(l||''))c.use(); return l; }
function run(s){ for(let i=0;i<Math.round(s*30);i++)G.step(1/30,1); }
function said(re){ return G.ui.messages().some(m=>re.test(m.text||m)); }
function state(){ const NI=G.northIsle, NC=G.northCave, S=NC.state;
  return {mode:G.state.mode,obj:$('obj'),sub:$('objSub'),step:G.quest.step,loop:!!G.loop.active,seen:!!G.flag('northLight'),
    started:G.boat.started,built:G.boat.built,parts:G.boat.count(),at:NI.at,onIsle:!!NI.inside,cave:!!NC.inside,tideLow:!!G.tide.low,
    drained:S.drained,hoistTop:S.hoistTop,met:S.met,scene:!!S.scene,ledger:!!S.read.ledger,test:!!G.testSaves,hud:!document.getElementById('hud').hidden,
    talk:document.body.classList.contains('talk-open'),label:label(),pos:[+P().pos.x.toFixed(1),+P().pos.y.toFixed(1),+P().pos.z.toFixed(1)],cp:G.state.checkpointName}; }
return {P,label,use,run,said,state};
})(); 0
"""

async def boot(b):
    ctx=await b.new_context(viewport={'width':1280,'height':800})
    pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
    await pg.goto(URL,wait_until='domcontentloaded',timeout=400000)
    await pg.wait_for_function("window.G&&G.flow&&document.getElementById('loading').textContent.startsWith('Ready')",timeout=120000)
    await pg.wait_for_timeout(800)
    return ctx,pg,errs

FAIL=[]
def check(name,cond,info=''):
    print(('PASS ' if cond else 'FAIL ')+name+('' if cond else '  '+str(info)[:500]))
    if not cond: FAIL.append(name)

home=lambda s:s['loop'] and s['seen'] and s['started'] and s['parts']==4 and s['at']=='home' and not s['onIsle']
north=lambda s:s['built'] and s['at']=='north' and s['onIsle'] and s['step'].startswith('north:')
EXPECT={
 'boat':lambda s:home(s) and not s['built'] and s['label']=='Patch the boat',
 'north-sail':lambda s:home(s) and s['built'] and s['label']=='Sail north',   # (the HUD objective: the loop chain takes a restored foreign step straight back, alchemy.js)
 'north-landing':lambda s:north(s) and not s['cave'] and s['step']=='north:tower' and s['cp']=='the north island',
 'north-cave':lambda s:north(s) and not s['cave'] and s['step']=='north:cave' and s['tideLow'] and s['label']=='Go into the sea cave',
 'north-cave-in':lambda s:north(s) and s['cave'] and not s['ledger'] and s['step']=='north:caveIn',
 'north-hoist':lambda s:north(s) and s['cave'] and s['drained'] and not s['hoistTop'] and s['step']=='north:hoist' and s['label']=='Work the hoist',
 'north-father':lambda s:north(s) and s['cave'] and s['hoistTop'] and (s['scene'] or s['talk']) and not s['met'],
 'north-met':lambda s:north(s) and s['cave'] and s['met'] and s['step']=='north:met',
}
# a step of real play from each start
AFTER={
 'boat':("(()=>{ T.use(/Patch the boat/); T.run(8); return {built:G.boat.built,step:G.quest.step}; })()", lambda r:r['built']),
 'north-sail':("(()=>{ const m=G.boat.debug.moor; let lab=null; for(let i=0;i<40&&!/Sail north/.test(T.label()||'');i++){ const P=T.P(), d=Math.hypot(m.x-P.pos.x,m.z-P.pos.z); P.teleport(P.pos.x+(m.x-P.pos.x)/d*.3,null,P.pos.z+(m.z-P.pos.z)/d*.3,P.heading); G.step(1/30,2); }"
               " lab=T.use(/Sail north/); G.step(1/30,6); const on=G.northIsle.crossing; for(let i=0;i<30*40&&G.northIsle.crossing;i++)G.step(1/30,1); T.run(1);"
               " return {lab,on,at:G.northIsle.at,onIsle:G.northIsle.inside,step:G.quest.step}; })()", lambda r:r['on'] and r['at']=='north' and r['onIsle'] and r['step']=='north:tower'),
 'north-landing':("(()=>{ const d=G.northIsle.debug.doorPos; G.player.teleport(d.x,null,d.z,0); G.step(1/30,4); const lab=T.use(/door/i); T.run(5); return {lab,step:G.quest.step,barred:T.said(/Barred/)}; })()", lambda r:r['barred'] and r['step']=='north:cave'),
 'north-cave':("(()=>{ T.use(/sea cave/); T.run(2.5); return {cave:G.northCave.inside,step:G.quest.step}; })()", lambda r:r['cave'] and r['step']=='north:caveIn'),
 'north-cave-in':("(()=>{ G.northCave.debug.readLedger(); T.run(3); return {step:G.quest.step,ledger:!!G.northCave.state.read.ledger}; })()", lambda r:r['ledger']),
 'north-hoist':("(()=>{ T.use(/Work the hoist/); T.run(11); return {top:G.northCave.state.hoistTop,scene:!!G.northCave.state.scene,talk:document.body.classList.contains('talk-open')}; })()", lambda r:r['top'] and (r['scene'] or r['talk'])),
 'north-father':("(()=>{ T.run(4); return {talk:document.body.classList.contains('talk-open'),name:(document.querySelector('#talk .name, #talk [data-name], #talkName')||{}).textContent||''}; })()", lambda r:r['talk']),
 'north-met':("(()=>{ G.devtools.teleport('cottage'); T.run(1); const P=G.player.pos; return {cave:G.northCave.inside,at:G.northIsle.at,onIsle:G.northIsle.inside,boatHome:G.boat.mesh&&Math.hypot(G.boat.mesh.position.x-77.6,G.boat.mesh.position.z-76.2)<2,z:+P.z.toFixed(1)}; })()",
              lambda r:not r['cave'] and r['at']=='home' and not r['onIsle'] and r['boatHome'] and r['z']>-100),
}

async def one(b,sid):
    ctx,pg,errs=await boot(b)
    try:
        await pg.evaluate(LIB)
        await pg.keyboard.press('Backquote'); await pg.wait_for_timeout(300)
        n=await pg.evaluate("id=>!!document.querySelector('#devtools [data-start=\"'+id+'\"]')",sid)
        check(sid+' is in the panel',n)
        await pg.evaluate("id=>document.querySelector('#devtools [data-start=\"'+id+'\"]').click()",sid); await pg.wait_for_timeout(1500)
        await pg.evaluate("G.step(1/30,30); 0")
        s=await pg.evaluate("T.state()")
        check(sid+' state',EXPECT[sid](s) and s['test'] and s['hud'] and s['mode']=='play',s)
        js,ok=AFTER[sid]
        r=await pg.evaluate(js)
        check(sid+' plays on',ok(r),r)
        bad=[e for e in errs if 'PAGEERROR' in e or 'Error' in e]
        check(sid+' no page errors',not bad,bad[:5])
    finally: await ctx.close()

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        only=os.environ.get('ONLY')
        for sid in EXPECT:
            if only and sid not in only.split(','): continue
            try: await one(b,sid)
            except Exception as e: check(sid+' (exception)',False,e)
        await b.close()
    print('\nFAILED: '+', '.join(FAIL) if FAIL else '\nALL PASS')
asyncio.run(main())

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
    talk:document.body.classList.contains('talk-open'),label:label(),pos:[+P().pos.x.toFixed(1),+P().pos.y.toFixed(1),+P().pos.z.toFixed(1)],cp:G.state.checkpointName,
    open:!!S.open,hp:P().hp,maxHp:P().maxHp,fire:fire(),story:G.northIsleStory?G.northIsleStory.stage():null}; }
/* the fire room (northfire.js / northfire_story.js) */
function fire(){ const NF=G.northFire, St=G.northFireStory; if(!NF)return null; const g=NF.giant;
  return {inside:!!NF.inside,fighting:!!NF.fighting,g:g.state,phase:g.phase,ghp:+g.hp.toFixed(1),done:!!NF.state.done,outcome:NF.state.outcome,look:NF.fire,
    intro:!!(St&&St.state.introSeen),rescued:!!(St&&St.rescued),scene:St?St.scene:null,dad:St?St.mode:null,far:G.north?G.north.mode:null}; }
/* run the game while clearing talk cards and camera shots (they wait for a button) */
function settle(s,until){ for(let i=0;i<Math.round(s*30);i++){ if(until&&until())return true; if(G.talk&&G.talk.isOpen)G.talk.advance(); if(G.cine&&G.cine.on)G.cine.skip(); G.step(1/30,1); } return !!(until&&until()); }
return {P,label,use,run,said,state,fire,settle};
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

fire=lambda s:s['fire'] or {}
infire=lambda s:fire(s).get('inside') and s['step'].startswith('north:')
home=lambda s:s['loop'] and s['seen'] and s['started'] and s['parts']==4 and s['at']=='home' and not s['onIsle']
north=lambda s:s['built'] and s['at']=='north' and s['onIsle'] and s['step'].startswith('north:')
EXPECT={
 'boat':lambda s:home(s) and not s['built'] and s['label']=='Patch the boat',
 'north-sail':lambda s:home(s) and s['built'] and s['label']=='Sail north',   # (the HUD objective: the loop chain takes a restored foreign step straight back, alchemy.js)
 'north-landing':lambda s:north(s) and not s['cave'] and s['step']=='north:tower' and s['cp']=='the north island',
 'north-cave':lambda s:north(s) and not s['cave'] and s['step']=='north:cave' and s['tideLow'] and s['label']=='Go into the sea cave',
 'north-cave-in':lambda s:north(s) and s['cave'] and not s['ledger'] and s['step']=='north:caveIn',
 'north-hoist':lambda s:north(s) and s['cave'] and s['drained'] and not s['hoistTop'] and s['step']=='north:hoist' and s['label']=='Work the hoist',
 'north-isle-known':lambda s:north(s) and not s['cave'] and s['ledger'] and s['drained'] and not s['met'] and s['tideLow'] and s['story']=='known' and s['step']=='north:cave',   # (northisle_story.js: out by the bothy)
 'north-father':lambda s:north(s) and s['cave'] and s['hoistTop'] and (s['scene'] or s['talk']) and not s['met'],
 'north-met':lambda s:north(s) and s['cave'] and s['met'] and s['step']=='north:met',
 'north-trap':lambda s:north(s) and s['cave'] and s['met'] and s['open'] and s['step']=='north:trap',
 'north-fire':lambda s:infire(s) and not fire(s)['intro'] and fire(s)['dad'] in ('feed','cower') and not fire(s)['done'],
 'north-fight':lambda s:infire(s) and fire(s)['intro'] and fire(s)['g']=='fight' and s['hp']==s['maxHp'] and s['step']=='north:fireFight',
 'north-brink':lambda s:infire(s) and fire(s)['g']=='fight' and s['hp']==4 and not fire(s)['rescued'],
 'north-final':lambda s:infire(s) and fire(s)['g']=='fight' and fire(s)['phase']==3 and fire(s)['ghp']<=8 and not fire(s)['rescued'],
 'north-lived':lambda s:infire(s) and fire(s)['done'] and fire(s)['outcome']=='lived' and fire(s)['look']=='true' and fire(s)['dad']=='keeper' and s['step']=='north:home',
 'north-died':lambda s:infire(s) and fire(s)['done'] and fire(s)['outcome']=='died' and fire(s)['look'] in ('out','embers') and fire(s)['dad'] in ('gone','none') and s['step']=='north:home',
}
# the fire-room starts arm the fight themselves (a short rise, or the intro); give them a moment before checking
SETTLE={'north-fire':"T.run(2.5)",
 'north-fight':"T.settle(12,()=>G.northFire.giant.state==='fight')",
 'north-brink':"T.settle(12,()=>G.northFire.giant.state==='fight'&&G.player.hp===4)",
 'north-final':"T.settle(12,()=>G.northFire.giant.state==='fight'&&G.northFire.giant.phase===3)",
 'north-lived':"T.run(1)", 'north-died':"T.run(1)"}
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
 'north-isle-known':("(()=>{ const S=G.northIsleStory, s=S.sites.stands.tally; G.player.teleport(s.x,s.y,s.z,-Math.PI/2); G.step(1/30,4); const lab=T.use(/tally/); T.run(1); return {lab,said:T.said(/A ship a season/),read:!!S.state.read['tally:known']}; })()", lambda r:r['lab']=='Look at the tally marks' and r['said'] and r['read']),
 'north-father':("(()=>{ T.run(4); return {talk:document.body.classList.contains('talk-open'),name:(document.querySelector('#talk .name, #talk [data-name], #talkName')||{}).textContent||''}; })()", lambda r:r['talk']),
 'north-trap':("(()=>{ const p=G.northCave.trapPos(); G.player.teleport(p.x,p.y,p.z,0); G.step(1/30,4); const lab=T.use(/fire room/); T.run(2.5); return {lab,inside:G.northFire.inside}; })()", lambda r:r['inside']),
 'north-fire':("(()=>{ const ok=T.settle(30,()=>G.northFire.giant.state==='fight'&&!G.northFireStory.scene); return {ok,intro:G.northFireStory.state.introSeen,g:G.northFire.giant.state,step:G.quest.step,dad:G.northFireStory.mode}; })()",
              lambda r:r['ok'] and r['intro'] and r['step']=='north:fireFight' and r['dad']=='cower'),
 'north-fight':("(()=>{ const g=G.northFire.giant, D=G.northFire.debug, h0=g.hp; D.hit(10); const hot=h0-g.hp; g.douse(6.5); const h1=g.hp; D.hit(10); const cold=h1-g.hp; return {hot:+hot.toFixed(2),cold:+cold.toFixed(2)}; })()",
              lambda r:abs(r['hot']-2)<.01 and abs(r['cold']-16)<.01),
 'north-brink':("(()=>{ const P=G.player; P.hurt({damage:4,kind:'melee',ignoreIframes:true,knockback:0}); const hp=P.hp; T.settle(14,()=>G.northFireStory.rescued&&!G.northFireStory.scene);"
                " const g=G.northFire.giant; return {hp,rescued:G.northFireStory.rescued,phase:g.phase,dad:G.northFireStory.mode,step:G.quest.step}; })()",
              lambda r:r['hp']==2 and r['rescued'] and r['phase']==3 and r['dad']=='help' and r['step']=='north:fireTogether'),
 'north-final':("(()=>{ const g=G.northFire.giant, D=G.northFire.debug; g.douse(6.5); for(let i=0;i<6&&g.hp>0;i++)D.hit(4); T.settle(40,()=>G.northFire.state.done);"
                " T.settle(4); return {done:G.northFire.state.done,out:G.northFire.state.outcome,look:G.northFire.fire,far:G.north.mode}; })()",
              lambda r:r['done'] and r['out']=='lived' and r['far']=='lived'),
 'north-lived':("(()=>{ const T0=G.northFireStory.tobias.position, w=G.northFire.toWorld(T0.x,0,T0.z+1.2); G.player.teleport(w.x,w.y,w.z,PI); G.step(1/30,4); const lab=T.label(); T.use(/father/); const talk=G.talk.isOpen; T.settle(3);"
                " G.devtools.teleport('cottage'); T.run(1); return {lab,talk,inside:G.northFire.inside,at:G.northIsle.at,far:G.north.mode}; })()".replace('PI','Math.PI'),
              lambda r:r['lab']=='Talk to your father' and r['talk'] and not r['inside'] and r['at']=='home' and r['far']=='lived'),
 'north-died':("(()=>{ G.northFire.debug.S.trans=null; G.northFire.exit({instant:true}); T.run(1); const P=G.player.pos, d=G.northIsle.debug.doorPos; return {inside:G.northFire.inside,isle:G.northIsle.inside,near:Math.hypot(P.x-d.x,P.z-d.z),far:G.north.mode}; })()",
              lambda r:not r['inside'] and r['isle'] and r['near']<8 and r['far']=='died'),
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
        if sid in SETTLE: await pg.evaluate(SETTLE[sid]+"; 0")
        s=await pg.evaluate("T.state()")
        check(sid+' state',EXPECT[sid](s) and s['test'] and s['hud'] and (s['mode']=='play' or s['talk']),s)   # (a talk card pauses the game)
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

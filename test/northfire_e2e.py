"""The fire room (northfire.js, northfire_story.js; Story Bible "The fire room"): the Wreck Giant, and Rowan's father.
Three runs, each from a Test tools start point (devtools.js) on a fresh page:
- DIED: after the meeting the fire says Rowan's name and burns the trapdoor's bar through; up into the fire room; the intro (his
  father's card, the camera shot, the giant climbs out, he backs to the wall); a cistern pulled with the giant under the spout
  douses it; staff hits do x0.2 hot and x1.6 cold; at 3 hearts the hint (the boathook); a blow that would leave 1 heart is
  caught at exactly 1 heart and his father steps in (the deluge: all its armour off, phase 3); the giant goes down; the ending
  where he dies (the fire out, the far light out, a Keeper's Heart dropped where it fell, picked up); a reload keeps it all.
- LIVED: the last phase, never rescued; doused and broken; the ending where he lives (a gold flame in the pit, the far light warm,
  "Talk to your father"); a reload keeps it; "Go down the stair" puts you outside the tower door.
- RETRY: dying mid-fight puts Rowan back at the door, the giant back in the pit, his father back at the wall, the fight again.
usage: python3 test/northfire_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, json
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']

LIB=r"""
window.T={
  play(){ if(G.state.mode==='paused'&&G.talk&&!G.talk.isOpen&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); if(G.state.mode!=='play'&&G.state.mode!=='dead'&&!(G.talk&&G.talk.isOpen))G.setMode('play'); },
  run(s){ for(let i=0;i<Math.round(s*30);i++)G.step(1/30,1); },
  // run the game, clearing talk cards and camera shots as a player would (both wait for a button)
  settle(s,until){ for(let i=0;i<Math.round(s*30);i++){ if(until&&until())return true; if(G.talk&&G.talk.isOpen)G.talk.advance(); else T.play(); if(G.cine&&G.cine.on)G.cine.skip(); G.step(1/30,1); } return !!(until&&until()); },
  label(){ const c=G.interact.pick(G.player.pos); return c?G.interact.label(c):null; },
  use(re){ T.play(); G.step(1/30,2); const c=G.interact.pick(G.player.pos), lab=c&&G.interact.label(c); if(!c||(re&&!re.test(lab||'')))return 'NOPE:'+lab; c.use(); G.step(1/30,2); return lab; },
  said(re){ return G.ui.messages().some(m=>re.test(m.text||'')); },
  hurt(n){ return G.player.hurt({damage:n,kind:'melee',ignoreIframes:true,knockback:0,dir:new G.THREE.Vector3(0,0,1)}); },
  NF:()=>G.northFire, ST:()=>G.northFireStory,
  st(){ const NF=G.northFire, g=NF.giant, S=G.northFireStory, P=G.player;
    return {inside:!!NF.inside,g:g.state,phase:g.phase,ghp:+g.hp.toFixed(2),doused:g.doused,done:!!NF.state.done,outcome:NF.state.outcome,fire:NF.fire,
      scene:S.scene,dad:S.mode,rescued:S.rescued,hinted:S.hinted,attempt:S.attempt,intro:S.state.introSeen,hp:P.hp,maxHp:P.maxHp,step:G.quest.step,far:G.north.mode,
      tower:G.northIsle.fireLook||null,cp:G.state.checkpointName}; },
  drops:[]
};
G.on('north:giantDead',e=>T.drops.push({x:e.pos.x,y:e.pos.y,z:e.pos.z,outcome:e.outcome}));
0
"""

def ok(r): return r
DIED=[
 ("start after the meeting","(()=>{ G.devtools.start('north-met'); T.run(1); return {met:G.northCave.state.met,open:G.northCave.state.open}; })()", lambda r:r['met'] and not r['open']),
 ("the fire says his name; the bar burns through","(()=>{ const ok=T.settle(20,()=>G.northCave.state.open); return {ok,name:T.said(/^Rowan\\.$/),step:G.quest.step}; })()",
   lambda r:r['ok'] and r['name'] and r['step']=='north:trap'),
 ("up through the trapdoor","(()=>{ const p=G.northCave.trapPos(); G.player.teleport(p.x,p.y,p.z,0); G.step(1/30,4); const lab=T.use(/fire room/); T.run(2.4); return {lab,inside:G.northFire.inside,cp:G.state.checkpointName,entered:G.northFire.state.entered}; })()",
   lambda r:r['lab']=='Climb into the fire room' and r['inside'] and r['cp']=='the fire room' and r['entered']),
 ("the intro: his father at the pit, a card","(()=>{ T.run(2); const s=T.st(); return {talk:G.talk.isOpen,name:G.talk.state()&&G.talk.state().name,dad:s.dad,step:s.step,g:s.g}; })()",
   lambda r:r['talk'] and r['name']=='Tobias Knox' and r['dad']=='feed' and r['step']=='north:fire' and r['g']=='dormant'),
 ("the giant climbs out; he backs to the wall","(()=>{ const ok=T.settle(30,()=>G.northFire.giant.state==='fight'&&!G.northFireStory.scene); const s=T.st(); return {ok,s,fire:T.said(/^Rowan Knox\\.$/)}; })()",
   lambda r:r['ok'] and r['s']['intro'] and r['s']['dad']=='cower' and r['s']['step']=='north:fireFight' and r['s']['fire']=='rage' and r['fire']),
 ("a cistern pulled with the giant under the spout douses it","(()=>{ const NF=G.northFire, D=NF.debug, t=NF.tanks[0]; D.B.hold=true; D.B.x=t.lc.x; D.B.z=t.lc.z;"
   " const c=t.chainPos; G.player.teleport(c.x,c.y,c.z,0); G.step(1/30,3); const lab=T.use(/Pull the chain/); T.run(1.2); D.B.hold=false;"
   " return {lab,doused:NF.giant.doused,level:t.level,after:T.label()}; })()",
   lambda r:r['lab']=='Pull the chain' and r['doused'] and r['level']<.5),
 ("staff hits: x1.6 cold, x0.2 hot","(()=>{ const g=G.northFire.giant, D=G.northFire.debug; const h0=g.hp; D.hit(10); const cold=h0-g.hp; D.B.doused=0; const h1=g.hp; D.hit(10); const hot=h1-g.hp; return {cold:+cold.toFixed(2),hot:+hot.toFixed(2)}; })()",
   lambda r:abs(r['cold']-16)<.01 and abs(r['hot']-2)<.01),
 ("at 3 hearts: the hint (a boathook)","(()=>{ const P=G.player; P.hp=P.maxHp; T.hurt(P.maxHp-6); const hp=P.hp; T.settle(10,()=>G.northFireStory.hinted&&!G.northFireStory.scene&&G.northFireStory.mode==='hook');"
   " return {hp,hinted:G.northFireStory.hinted,dad:G.northFireStory.mode,line:T.said(/coming in there/)}; })()",
   lambda r:r['hp']==6 and r['hinted'] and r['dad']=='hook' and r['line']),
 ("a blow that would leave 1 heart: caught at exactly 1, he steps in","(()=>{ const P=G.player; T.hurt(4); const hp=P.hp; T.hurt(4); const hp2=P.hp;"
   " T.settle(16,()=>G.northFireStory.rescued&&!G.northFireStory.scene); const s=T.st(); return {hp,hp2,s}; })()",
   lambda r:r['hp']==2 and r['hp2']==2 and r['s']['rescued'] and r['s']['phase']==3 and r['s']['dad']=='help' and r['s']['step']=='north:fireTogether' and r['s']['ghp']<=48.01),
 ("broken: the ending where he dies","(()=>{ const g=G.northFire.giant, D=G.northFire.debug; g.douse(6.5); for(let i=0;i<20&&g.hp>0;i++)D.hit(6);"
   " const down=g.state; const ok=T.settle(60,()=>G.northFire.state.done&&G.northFireStory.mode==='dead'); T.settle(3); const s=T.st();"
   " return {down,ok,s,drops:T.drops.slice(),last:T.said(/Goodbye, Da/)}; })()",
   lambda r:r['ok'] and r['s']['outcome']=='died' and r['s']['fire']=='out' and r['s']['far']=='died' and len(r['drops'])==1 and r['s']['step']=='north:home'),
 ("the heart is dropped on the floor, not in the pit","(()=>{ const d=T.drops[0], O=G.northFire.O; return {r:+Math.hypot(d.x-O.x,d.z-O.z).toFixed(2),pit:G.northFire.PIT_R}; })()", lambda r:r['r']>r['pit']+.5),
 ("the Keeper's Heart where it fell","(()=>{ const d=T.drops[0], P=G.player, h0=P.maxHp; G.player.teleport(d.x,d.y,d.z,0); T.settle(6,()=>G.progress.state.hearts.giant); T.settle(4); return {heart:!!G.progress.state.hearts.giant,maxHp:P.maxHp,h0}; })()",
   lambda r:r['heart'] and r['maxHp']>=r['h0']),
 ("save","(()=>{ T.settle(2); return !!G.flow.writeSave(); })()", ok),
]
DIED_AFTER=[
 ("after a reload: done, he died, the fire out, he's gone","(()=>{ T.run(2); const s=T.st(); return s; })()",
   lambda r:r['inside'] and r['done'] and r['outcome']=='died' and r['fire'] in ('out','embers') and r['dad'] in ('gone','none') and r['far']=='died'),
]
LIVED=[
 ("start in the last phase","(()=>{ G.devtools.start('north-final'); const ok=T.settle(14,()=>G.northFire.giant.state==='fight'&&G.northFire.giant.phase===3); return {ok,s:T.st()}; })()",
   lambda r:r['ok'] and not r['s']['rescued'] and r['s']['ghp']<=8.01),
 ("broken without his help: the ending where he lives","(()=>{ const g=G.northFire.giant, D=G.northFire.debug; g.douse(6.5); for(let i=0;i<6&&g.hp>0;i++)D.hit(4);"
   " const ok=T.settle(60,()=>G.northFire.state.done&&G.northFire.fire==='true'&&!G.northFireStory.scene); T.settle(10,()=>T.said(/keeper’s light/)); const s=T.st(); return {ok,s,drops:T.drops.length,gold:T.said(/What catches is gold/)}; })()",
   lambda r:r['ok'] and r['s']['outcome']=='lived' and r['s']['fire']=='true' and r['s']['far']=='lived' and r['drops']==1 and r['gold'] and r['s']['dad']=='keeper'),
 ("talk to your father","(()=>{ const t=G.northFireStory.tobias.position, w=G.northFire.toWorld(t.x,0,t.z+1.3); G.player.teleport(w.x,w.y,w.z,Math.PI); G.step(1/30,4); const lab=T.use(/father/); const open=G.talk.isOpen; T.settle(3); return {lab,open}; })()",
   lambda r:r['lab']=='Talk to your father' and r['open']),
 ("save","(()=>{ T.settle(2); return !!G.flow.writeSave(); })()", ok),
]
LIVED_AFTER=[
 ("after a reload: done, he lives, the gold flame, he's at the pit","(()=>{ T.run(2); return T.st(); })()",
   lambda r:r['inside'] and r['done'] and r['outcome']=='lived' and r['fire']=='true' and r['dad']=='keeper' and r['far']=='lived'),
 ("go down the stair: outside the tower door","(()=>{ const D=G.northFire.DOOR, w=G.northFire.toWorld(D.x,0,G.northFire.R-1.0); G.player.teleport(w.x,w.y,w.z,0); G.step(1/30,3); const lab=T.use(/down the stair/); T.run(2.4);"
   " const P=G.player.pos, d=G.northIsle.debug.doorPos; return {lab,inside:G.northFire.inside,isle:G.northIsle.inside,near:+Math.hypot(P.x-d.x,P.z-d.z).toFixed(1),cp:G.state.checkpointName}; })()",
   lambda r:r['lab']=='Go down the stair' and not r['inside'] and r['isle'] and r['near']<8 and r['cp']=='the north island'),
]
RETRY=[
 ("start the fight","(()=>{ G.devtools.start('north-fight'); const ok=T.settle(14,()=>G.northFire.giant.state==='fight'); return {ok,s:T.st()}; })()", lambda r:r['ok'] and r['s']['dad']=='cower'),
 ("rescued, then killed","(()=>{ const P=G.player; T.hurt(P.hp-2+2); T.settle(16,()=>G.northFireStory.rescued&&!G.northFireStory.scene); const resc=G.northFireStory.rescued; T.hurt(4); const dead=G.state.mode; return {resc,dead,hp:P.hp}; })()",
   lambda r:r['resc'] and r['dead']=='dead' and r['hp']==0),
 ("rise","WAIT:2600:#rise",None),
 ("back at the door; the giant in the pit; his father at the wall, alive","(()=>{ T.settle(12,()=>G.state.mode==='play'&&G.player.alive); T.settle(1); const s=T.st(); const P=G.player.pos, D=G.northFire.toWorld(G.northFire.DOOR.x,0,G.northFire.DOOR.z);"
   " return {s,atDoor:Math.hypot(P.x-D.x,P.z-D.z)<1.5}; })()",
   lambda r:r['atDoor'] and r['s']['attempt']==1 and not r['s']['rescued'] and r['s']['dad']=='cower' and r['s']['hp']==r['s']['maxHp'] and r['s']['ghp']==160),
 ("it comes up again","(()=>{ const ok=T.settle(14,()=>G.northFire.giant.state==='fight'); return {ok,g:G.northFire.giant.state}; })()", lambda r:r['ok']),
]

FAIL=[]
def check(name,cond,info=''):
    print(('PASS ' if cond else 'FAIL ')+name+('' if cond else '  '+json.dumps(info)[:600]))
    if not cond: FAIL.append(name)

async def boot(b):
    ctx=await b.new_context(viewport={'width':960,'height':540}); pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(URL,timeout=400000)
    await pg.wait_for_function("window.G&&G.flow&&document.getElementById('loading').textContent.startsWith('Ready')",timeout=180000)
    await pg.wait_for_timeout(500)
    await pg.evaluate('G.headless&&(G.headless.hold=true);0'); await pg.evaluate(LIB)
    return ctx,pg,errs

async def steps(pg,L,tag):
    for name,js,cond in L:
        if js.startswith('WAIT:'):   # real time (the death screen's Rise button comes up after 2 s), then a click
            ms,sel=js[5:].split(':',1); await pg.wait_for_timeout(int(ms)); await pg.evaluate("s=>{ const e=document.querySelector(s); if(e&&!e.hidden)e.click(); }",sel); continue
        try: r=await pg.evaluate(js)
        except Exception as e: r={'exception':str(e)[:300]}
        try: good=bool(cond(r))
        except Exception as e: good=False; r={'r':r,'checkError':str(e)}
        check(tag+': '+name,good,r)
        if not good: return False
    return True

async def reload(pg):
    await pg.reload(timeout=400000)
    await pg.wait_for_function("window.G&&G.flow&&document.getElementById('loading').textContent.startsWith('Ready')",timeout=180000)
    await pg.wait_for_timeout(500)
    await pg.evaluate("G.headless&&(G.headless.hold=true); G.testSaves=true; const s=G.flow.readSave(G.flow.keys.test); G.flow.begin(s); G.step(1/30,30); 0")
    await pg.evaluate(LIB)

async def path(b,tag,first,after):
    ctx,pg,errs=await boot(b)
    try:
        if await steps(pg,first,tag) and after:
            await reload(pg); await steps(pg,after,tag)
        check(tag+': no page errors',not errs,errs[:3])
    finally: await ctx.close()

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        for tag,a,c in (('DIED',DIED,DIED_AFTER),('LIVED',LIVED,LIVED_AFTER),('RETRY',RETRY,None)):
            try: await path(b,tag,a,c)
            except Exception as e: check(tag+' (exception)',False,str(e))
        await b.close()
    print('\nRESULT: '+('FAILED '+', '.join(FAIL) if FAIL else 'PASSED'))
    print('\nFAILED: '+', '.join(FAIL) if FAIL else '\nALL PASS')
    sys.exit(1 if FAIL else 0)
asyncio.run(main())

"""Progression (PROGRESSION.md): heart shards -> a heart, a keeper's cache, every Temper upgrade and its effect, Moth Wings from
freeing negatives, boss hearts, the journal, save -> reload -> Continue, and retroactive grants for a save made before progression.
usage: python3 test/progress_e2e.py [url]   (default http://localhost:8800/dev.html?debug&headless)"""
import asyncio, sys, json, time
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'

# helpers installed in the page once per load
HELP="""
window.T={
  clear(){ for(const m of (G.monsters&&G.monsters.list||[]).slice())if(m.alive&&!m.boss)G.monsters.kill(m,{dir:new THREE.Vector3(0,0,1)}); },
  play(){ if(G.state.mode==='paused'&&!document.getElementById('pause').hidden)document.getElementById('resume').click(); }, // headless pointer-lock churn can pause the game
  settle(n){ T.play(); G.step(1/30,n||10); G.progress.endReward(); G.step(1/30,2); T.play(); },
  at(x,y,z){ T.play(); G.player.teleport(x,y,z,0); G.step(1/30,3); },
  // stand on a shard's footing (its perch top or the ground beneath it) and let the pickup happen
  shard(id){ const s=G.progress.spots.find(q=>q.id===id); T.at(s.pos.x+.3,s.pos.y-.55,s.pos.z); G.step(1/30,6); const ok=!!G.progress.state.shards[id]; T.settle(4); return ok; },
  dummy(){ // a target that records what hits it
    const hb={team:'enemy',pos:G.player.pos.clone().add(new THREE.Vector3(Math.sin(G.player.heading)*1.3,0,Math.cos(G.player.heading)*1.3)),radius:.6,height:1.6,alive:()=>true,hits:[],hit(i){this.hits.push(i.damage);},targetable:true,name:'dummy'};
    G.combat.add(hb); return hb; },
  swing(){ const hb=T.dummy(); G.input.setVirtual('attack',true); G.step(1/30,3); G.input.setVirtual('attack',false); G.step(1/30,24); G.combat.remove(hb); return hb.hits[0]||0; },
  roll(){ const P=G.player; P.stamina=1; P.exhausted=false; G.step(1/30,30); P.stamina=1; const s0=P.stamina; G.input.setVirtual('roll',true); G.step(1/30,2); G.input.setVirtual('roll',false); const used=s0-P.stamina; G.step(1/30,30); return +used.toFixed(4); },
  charge(frames){ const C=G._playerDbg.charge; G.input.setVirtual('attack',true); G.step(1/30,frames); const t=C.t; G.input.setVirtual('attack',false); G.step(1/30,4);
    const b=G.combat.projectiles.filter(p=>p.team==='player'&&p.kind==='bolt').pop(); const out={t:+t.toFixed(3),speed:b?+b.vel.length().toFixed(1):null,pierce:b?!!b.pierce:null}; G.step(1/30,40); return out; }
};
'ok'"""

STEPS=[
 ("start", "document.getElementById('begin').click(); G.debugStartLoop(); G.step(1/30,20); T.clear(); G.progress.debug.noSweep=true; G.progress.debug.reset(); G.progress.apply(); G.player.hp=G.player.maxHp; G.step(1/30,5); G.progress.summary()",
   lambda r: r['maxHp']==4 and r['shards']==0 and r['marks']==0),   # 2 hearts to start (BASE_HP)
 # four shards in the open / on perches -> the 4th is a heart (the new heart fills in when the lift ends)
 ("shards", "(()=>{ const got=['hounds','roots','needle','west'].map(id=>T.shard(id)); return {got, s:G.progress.summary(), hearts:document.getElementById('hearts').children.length}; })()",
   lambda r: all(r['got']) and r['s']['shards']==4 and r['s']['maxHp']==6 and r['hearts']==3),
 ("shard-lift", "(()=>{ G.progress.debug.reset(); G.progress.apply(); ['hounds','roots','needle'].forEach(T.shard); const s=G.progress.spots.find(q=>q.id==='west');"
   " T.at(s.pos.x+.3,s.pos.y-.55,s.pos.z); G.step(1/30,10); const during={busy:G.progress.rewarding,ctl:G.player.inputEnabled,maxHp:G.player.maxHp,card:document.getElementById('rewardCard').textContent};"
   " G.step(1/30,60); const after={ctl:G.player.inputEnabled,maxHp:G.player.maxHp,hp:G.player.hp}; T.settle(); return {during,after}; })()",
   lambda r: r['during']['busy']=='shard' and r['during']['ctl'] is False and r['during']['maxHp']==4 and '4 of 4' in r['during']['card'] and r['after']['ctl'] is True and r['after']['maxHp']==6),
 # a keeper's cache: interact -> a Mark + its loot
 ("cache", "(()=>{ const c=G.progress.caches.find(q=>q.id==='tower'); const g0=G.inv.count('glowcap'); T.at(c.pos.x-1.2,c.pos.y,c.pos.z); G.step(1/30,4);"
   " const ia=G.interact.pick(G.player.pos); const lab=ia&&G.interact.label(ia); ia&&ia.use(); G.step(1/30,30); const card=document.getElementById('rewardCard').textContent; T.settle(30);"
   " return {lab, marks:G.progress.marks, caches:G.progress.state.caches, loot:G.inv.count('glowcap')-g0, card}; })()",
   lambda r: r['lab'] and 'cache' in r['lab'] and r['marks']==1 and r['loot']==3 and 'Mark' in r['card']),
 # baselines before upgrades
 ("baseline", "(()=>{ T.at(165,42,-10); G.player.heading=Math.PI/2; T.at(165,42,-10); window.BASE={swing:T.swing(), roll:T.roll(), charge:T.charge(30), pmax:G.potions.max, heal:G.potions.heal, jar:G.moths.jar.capacity, gather:G.player.mods.mothGather}; return BASE; })()",
   lambda r: r['swing']==2 and abs(r['roll']-0.1)<.002 and r['pmax']==3 and r['heal']==6 and r['jar']==60),
 # buy everything at the bench (Temper tab) with marks + materials
 ("temper", "(()=>{ G.progress.give('mark',13); G.inv.add('ichor',2,{silent:true}); G.inv.add('pearl',2,{silent:true}); G.inv.add('glowcap',5,{silent:true}); G.inv.add('brine',4,{silent:true}); G.inv.add('kelp',1,{silent:true});"
   " G.moths.jar.give({silent:true}); T.at(151.8,42,32.1); G.alchemy.openTable(); G.step(1/30,2); document.getElementById('tabTemper').click();"
   " const rows=document.querySelectorAll('#temperList .tmp-up').length, bought=[]; for(const id of ['tip','lens','grip','bandolier','jar','charm','recipe2']){ const b=document.querySelector('[data-buy=\"'+id+'\"]'); if(b&&!b.disabled){ b.click(); bought.push(id); } }"
   " const marks=G.progress.marks; document.getElementById('alchClose').click(); G.step(1/30,4); T.settle(); return {rows,bought,marks,owned:G.progress.UPGRADES.filter(u=>G.progress.owns(u.id)).map(u=>u.id)}; })()",
   lambda r: r['rows']==7 and len(r['owned'])==7 and r['marks']==2),
 ("effects", "(()=>{ T.clear(); T.at(165,42,-10); G.player.heading=Math.PI/2; T.at(165,42,-10); const bl0=G.moths.baitLeft; G.moths.bait(100); const bait=G.moths.baitLeft-bl0;"
   " const c=T.charge(30); return {swing:T.swing(), roll:T.roll(), charge:c, chargeRatio:+(c.t/BASE.charge.t).toFixed(3), speedRatio:+(c.speed/BASE.charge.speed).toFixed(3), pmax:G.potions.max, heal:G.potions.heal, jar:G.moths.jar.capacity, bait:Math.round(bait), gather:G.player.mods.mothGather, carry:(G.potions.add(9,{silent:true}),G.potions.count)}; })()",
   lambda r: r['swing']==3 and abs(r['roll']-0.075)<.002 and 1.35<r['chargeRatio']<1.5 and abs(r['speedRatio']-1.3)<.02 and r['charge']['pierce'] is True and r['pmax']==5 and r['heal']==8 and r['jar']==100 and r['bait']==150 and r['gather']==1.25 and r['carry']==5),
 # Moth Wings: free negatives for real (the creatures' own dissolve) -> a wing every 2
 ("wings", "(()=>{ const N=G.creatures.negatives; const s0=G.player.mods.stamMax; for(let i=0;i<4;i++){ const n=N[i]; T.at(n.pos.x+3,null,n.pos.z); n.dying=true; G.step(1/30,90); } T.settle(); return {wings:G.progress.wings, stamMax:G.player.mods.stamMax, freed:G.state.freed, roll:T.roll(), s0}; })()",
   lambda r: r['wings']==2 and abs(r['stamMax']-1.4)<1e-6 and abs(r['roll']-0.075/1.4)<.002),
 # boss hearts: the Stag and the Undertow each give a Keeper's Heart (+1 heart) and Marks
 ("bosses", "(()=>{ const m0=G.player.maxHp, k0=G.progress.marks; G.emit('boss:dead',{who:'stag'}); G.emit('cave:bossDead',{pos:G.player.pos.clone()}); G.step(1/30,10); const D=G.progress.drops, has=[!!D.stag,!!D.undertow], mid=G.player.maxHp;"
   " const s=D.stag.pos; T.at(s.x,s.y,s.z); G.step(1/30,10); const lifting=G.progress.rewarding; T.settle();"
   " G.debugEnterCave('arena'); G.step(1/30,60); const u=G.progress.drops.undertow.pos; T.at(u.x,u.y,u.z); G.step(1/30,10); T.settle(); G.cave.exit&&G.cave.exit({instant:true}); G.step(1/30,30); T.settle();"
   " return {has,m0,mid,lifting,m1:G.player.maxHp,marks:G.progress.marks-k0,left:Object.keys(G.progress.drops)}; })()",
   lambda r: r['has']==[True,True] and r['mid']==r['m0'] and r['lifting']=='heart' and r['m1']==r['m0']+4 and r['marks']==3 and r['left']==[]),
 ("journal", "(()=>{ G.setMode('paused'); document.getElementById('pause').hidden=false; document.getElementById('journalBtn').click(); const t=document.getElementById('journalBody').innerText; const d=G.progress.journal.data();"
   " document.getElementById('journalClose').click(); const back=!document.getElementById('pause').hidden; document.getElementById('resume').click(); G.step(1/30,2); return {d, back, hasText:/hearts/i.test(t)&&/keeper/i.test(t)}; })()",
   lambda r: r['back'] and r['hasText'] and r['d']['shards']==4 and r['d']['caches']==1 and r['d']['wings']==2 and len(r['d']['upgrades'])==7 and r['d']['freed']>=4),
]

async def run(pg, name, js, check, fails):
    try: r=await pg.evaluate(js)
    except Exception as e: r='EXC '+str(e).split('\n')[0][:300]
    ok=False
    try: ok=bool(check(r)) if not isinstance(r,str) or not r.startswith('EXC') else False
    except Exception as e: ok=False
    print(('ok  ' if ok else 'FAIL'), name, ':', json.dumps(r)[:700])
    if not ok: fails.append(name)
    return r

async def main():
    t0=time.time(); fails=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await (await b.new_context(viewport={'width':1000,'height':620})).new_page(); pg.set_default_timeout(240000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and '404' not in m.text else None)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
        await pg.evaluate("localStorage.removeItem('bq-save-v1')")
        await pg.evaluate(HELP)
        for name,js,check in STEPS: await run(pg,name,js,check,fails)
        # save -> reload -> Continue
        before=await pg.evaluate("G.progress.debug.noSweep=false; G.progress.reconcile(true); T.settle(); G.setMode('paused'); document.getElementById('saveBtn').click(); G.progress.summary()")
        await pg.reload(); await pg.wait_for_timeout(5000); await pg.evaluate(HELP)
        await pg.click('#continue'); await pg.wait_for_timeout(2500)
        await run(pg,'reload',"(()=>{ G.step(1/30,30); T.settle(); const a=G.progress.summary(); return {a, potions:G.potions.max, jar:G.moths.jar.capacity, dmg:G.player.mods.dmg}; })()",
                  lambda r: r['a']['maxHp']==before['maxHp'] and r['a']['shards']==before['shards'] and r['a']['marks']==before['marks'] and r['a']['wings']==before['wings']
                            and sorted(r['a']['upgrades'])==sorted(before['upgrades']) and r['a']['caches']==before['caches'] and r['potions']==5 and r['jar']==100 and r['dmg']==1, fails)
        print('   before:',json.dumps(before))
        # an old save (before progression existed): Stag + Gloaming + Undertow dead, 4 negatives freed, a blight cured -> granted on load
        await pg.evaluate("""(()=>{ G.setMode('paused'); const d=JSON.parse(localStorage.getItem('bq-save-v1')); delete d.mods.progress; d.stagDead=true; d.bossDead=true; d.flags.undertowDead=true;
            d.freed=[0,1,2,3]; d.hp=10; d.maxHp=10; if(d.mods.caveBoss)d.mods.caveBoss.defeated=true; else d.mods.caveBoss={v:1,pages:[1,2,3],defeated:true,discovered:true,hal:false,entered:true,bossSeen:true,said:[]};
            if(d.mods.moths){ d.mods.moths.cured=['tidepool']; } localStorage.setItem('bq-save-v1',JSON.stringify(d)); })()""")
        await pg.reload(); await pg.wait_for_timeout(5000); await pg.evaluate(HELP)
        await pg.click('#continue'); await pg.wait_for_timeout(2500)
        await run(pg,'retro',"(()=>{ G.step(1/30,90); T.settle(); return G.progress.summary(); })()",
                  lambda r: r['maxHp']==8 and r['wings']==2 and r['marks']==6 and 'charm' in r['upgrades'] and r['shards']==0, fails)
        await pg.evaluate('G.headless&&G.headless.draw(3); 0'); await pg.wait_for_timeout(250)
        await pg.screenshot(path='/tmp/claude-0/progress/e2e_end.png',timeout=120000)
        real=[e for e in errs if '404' not in e]
        for e in real[:10]: print('  ERR',e[:300])
        if real: fails.append('console errors')
        await b.close()
    print(('PASS' if not fails else 'FAIL '+', '.join(fails)), f'{time.time()-t0:.0f}s'); sys.exit(1 if fails else 0)
asyncio.run(main())

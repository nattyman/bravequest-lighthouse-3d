# Cloud saves (js/cloud.js) against a mock of the Claude artifact runtime (window.claude.use('user'|'db')).
# Usage: python3 test/cloud_e2e.py "http://localhost:PORT/dev.html?cloud"
import asyncio, json, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8990/dev.html?cloud"

MOCK = """
(() => {
  const cfg = JSON.parse(localStorage.getItem('mockCloudCfg') || '{}');
  const store = JSON.parse(localStorage.getItem('mockCloudStore') || '{}');
  window.__cloudPuts = 0;
  const persist = () => localStorage.setItem('mockCloudStore', JSON.stringify(store));
  const ref = path => ({ path,
    get: async () => { await new Promise(r=>setTimeout(r,200)); const d = store[path]; return { id: path.split('/').pop(), exists: !!d, data: () => d, metadata: {fromCache:false,hasPendingWrites:false} }; },
    set: async body => { await new Promise(r=>setTimeout(r,100)); if (cfg.readonly) throw {code:'invalid_argument', message:'view only'}; window.__cloudPuts++; (window.__putLog=window.__putLog||[]).push({t:performance.now(),flush:!!window.__inFlush}); store[path] = JSON.parse(JSON.stringify(body)); persist(); } });
  const db = { doc: ref, collection: () => { throw new Error('unused'); } };
  const user = { id: async () => cfg.signedOut ? null : 'viewer-1', isOwner: async () => true, canEdit: async () => true, can: async () => true };
  window.claude = { use: async name => { await new Promise(r=>setTimeout(r,300)); return name === 'db' ? db : name === 'user' ? user : null; } };
})();
"""

async def main():
    fails = []
    def check(name, ok, info):
        print(('ok   ' if ok else 'FAIL ') + name + ' : ' + json.dumps(info)[:400])
        if not ok: fails.append(name)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width':1100,'height':700})
        await ctx.add_init_script(MOCK)
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(500)
        # 1. a newer save on another device comes down to an empty browser and lights up Continue
        far = {'v':1,'at':4102444800000,'step':'door','objective':'From the other device','flags':{}}
        await pg.evaluate("""f => { localStorage.clear(); localStorage.setItem('mockCloudStore', JSON.stringify({'data/users/viewer-1/save':{v:1,at:f.at,objective:f.objective,save:JSON.stringify(f)}})); }""", far)
        await pg.reload(); await pg.wait_for_timeout(9000)
        r = await pg.evaluate("""() => ({state:G.cloud.state, cont:!document.getElementById('continue').hidden, local:JSON.parse(localStorage.getItem('bq-save-v1')||'null'),
            note:document.getElementById('cloudNote').textContent, info:document.getElementById('saveInfo').textContent})""")
        check('pullNewer', r['state']=='on' and r['cont'] and r['local'] and r['local'].get('objective')=='From the other device' and 'another device' in r['note'], {k:(v if k!='local' else bool(v)) for k,v in r.items()})
        # 2. a fresh local game uploads: begin, save, flush (one upload, the new save)
        await pg.evaluate("() => { localStorage.setItem('mockCloudStore','{}'); localStorage.removeItem('bq-save-v1'); }")
        await pg.reload(); await pg.wait_for_timeout(9000)
        r0 = await pg.evaluate("() => ({state:G.cloud.state, note:document.getElementById('cloudNote').textContent, cont:!document.getElementById('continue').hidden})")
        check('emptyBoth', r0['state']=='on' and not r0['cont'] and 'Cloud saves are on' in r0['note'], r0)
        await pg.evaluate("document.getElementById('begin').click()"); await pg.wait_for_timeout(1500)
        r = await pg.evaluate("""async () => { G.flow.writeSave(); window.__inFlush=true; await G.cloud.flush(); window.__inFlush=false; const st=JSON.parse(localStorage.getItem('mockCloudStore')); const d=st['data/users/viewer-1/save'];
            const local=JSON.parse(localStorage.getItem('bq-save-v1')); return {puts:window.__cloudPuts, has:!!d, same:!!d&&d.at===local.at, size:d?d.save.length:0, obj:d&&d.objective}; }""")
        check('upload', r['puts']==1 and r['has'] and r['same'] and r['size']>100, r)
        # 3. a burst of saves: uploads driven by the timer stay at least 20 s apart (page time; a slow headless page stretches the burst), and a flush sends the latest
        r = await pg.evaluate("""async () => { for(let i=0;i<5;i++){ await new Promise(r=>setTimeout(r,20)); G.flow.writeSave(); }
            await new Promise(r=>setTimeout(r,800)); window.__inFlush=true; await G.cloud.flush(); window.__inFlush=false;
            const L=window.__putLog||[]; const gaps=[]; for(let i=1;i<L.length;i++) if(!L[i].flush) gaps.push(Math.round(L[i].t-L[i-1].t));
            const st=JSON.parse(localStorage.getItem('mockCloudStore'))['data/users/viewer-1/save']; const local=JSON.parse(localStorage.getItem('bq-save-v1'));
            return {gaps, latest:st.at===local.at, puts:L.length}; }""")
        check('throttle', all(g>=19500 for g in r['gaps']) and r['latest'], r)
        # 4. test-save slot never uploads
        r = await pg.evaluate("""async () => { const p0=window.__cloudPuts; G.testSaves=true; G.flow.writeSave(); await G.cloud.flush(); G.testSaves=false; return {d:window.__cloudPuts-p0}; }""")
        check('testSlotStaysLocal', r['d']==0, r)
        # 5. a view-only viewer: the write is refused once, the game carries on saving locally
        await pg.evaluate("() => { localStorage.setItem('mockCloudCfg', JSON.stringify({readonly:true})); localStorage.setItem('mockCloudStore','{}'); }")
        await pg.reload(); await pg.wait_for_timeout(9000)
        r = await pg.evaluate("""async () => { const s0=G.cloud.state; await G.cloud.flush(); return {s0, s1:G.cloud.state, local:!!localStorage.getItem('bq-save-v1'), cont:!document.getElementById('continue').hidden}; }""")
        check('viewOnly', r['s1']=='local-only' and r['local'] and r['cont'], r)
        # 6. signed out: off, nothing shown
        await pg.evaluate("() => localStorage.setItem('mockCloudCfg', JSON.stringify({signedOut:true}))")
        await pg.reload(); await pg.wait_for_timeout(9000)
        r = await pg.evaluate("() => ({state:G.cloud.state, noteHidden:document.getElementById('cloudNote').hidden, cont:!document.getElementById('continue').hidden})")
        check('signedOut', r['state']=='off' and r['noteHidden'] and r['cont'], r)
        await pg.evaluate("() => { localStorage.removeItem('mockCloudCfg'); localStorage.removeItem('mockCloudStore'); }")
        check('noPageErrors', not errs, errs[:3])
        await b.close()
    print('RESULT: ' + ('ALL PASS' if not fails else 'FAILED ' + ', '.join(fails)))
asyncio.run(main())

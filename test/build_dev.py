# Regenerates dev.html from index.html with local Three.js paths (no network needed).
import re,os
here=os.path.dirname(os.path.abspath(__file__)); root=os.path.dirname(here)
s=open(os.path.join(root,'index.html')).read()
s=s.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js','vendor/three/three.min.js')
s=s.replace('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/','vendor/three/examples/')
s=re.sub(r'<link[^>]*fonts[^>]*>\n?','',s)
# a module index.html names but that isn't on disk yet (being written on another branch or by another agent): leave it out
def _drop_missing(m):
    return m.group(0) if os.path.exists(os.path.join(root,m.group(1))) else ''
s=re.sub(r'<script src="(js/[^"]+\.js)"></script>\n?',_drop_missing,s)
# auto-include new modules (js/*.js not yet referenced in index.html) right before G.start(), in a fixed order
order=['fog.js','alchemy.js','moths.js','cave.js','cave_puzzles.js','cave_boss.js','undercroft.js','glass.js','talk.js','undercroft_people.js','undercroft_boss.js','companions.js','temple.js','lens.js','temple_puzzles.js','temple_people.js','temple_boss.js','cloud.js']
extra=[n for n in sorted(os.listdir(os.path.join(root,'js')),key=lambda n:(order.index(n) if n in order else 99,n)) if n.endswith('.js') and ('js/'+n) not in s]
if extra:
    tags=''.join(f'<script src="js/{n}"></script>\n' for n in extra)
    s=s.replace('<script>window.G&&G.start();</script>',tags+'<script>window.G&&G.start();</script>')
    print('auto-included:',', '.join(extra))
open(os.path.join(root,'dev.html'),'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'+s+'\n</body></html>')
print('dev.html written')

# Regenerates dev.html from index.html with local Three.js paths (no network needed).
import re,os
here=os.path.dirname(os.path.abspath(__file__)); root=os.path.dirname(here)
s=open(os.path.join(root,'index.html')).read()
s=s.replace('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js','vendor/three/three.min.js')
s=s.replace('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/','vendor/three/examples/')
s=re.sub(r'<link[^>]*fonts[^>]*>\n?','',s)
open(os.path.join(root,'dev.html'),'w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'+s+'\n</body></html>')
print('dev.html written')

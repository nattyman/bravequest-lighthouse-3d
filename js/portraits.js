/* =====================================================================
   portraits.js — painted cameo portraits for the conversation card (talk.js) and the caption cameo (hud.js)
   Same gentle cameo style as the cellar people (undercroft_people.js `portrait(id)`): a dusky gradient, soft shapes,
   an inner rim. Each portrait is a function (g, w, h, glass) drawing on a canvas the talk card sizes at 148×184.
   API: G.portraits = {
          get(id) -> draw fn | null           halloran, hesper (alias maren), ember, corvin, crane, page (readings), echo (the Glass)
          add(id, fn, {title?, names?})       other modules register theirs (undercroft_people.js: the cellar people)
          title(id) -> eyebrow text | ''
          forWho(name) -> id | null           who a caption speaker is ('Halloran', 'Hesper’s logbook', 'Old Tamsin'…)
          cameo(id) -> a cached canvas         drawn once, copied by the caption cameo }
   ===================================================================== */
(function(){
'use strict';
const G=window.G, PI=Math.PI, TAU=PI*2;
const INK='#0b080e';

function bg(g,w,h,top,bot){ const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,top); gr.addColorStop(1,bot); g.fillStyle=gr; g.fillRect(0,0,w,h); }
function rim(g,w,h){ g.strokeStyle='rgba(233,220,192,.35)'; g.lineWidth=3; g.beginPath(); g.ellipse(w/2,h/2,w/2-3,h/2-3,0,0,TAU); g.stroke(); }
function glow(g,x,y,r,inner,outer){ const e=g.createRadialGradient(x,y,0,x,y,r); e.addColorStop(0,inner); e.addColorStop(1,outer); g.fillStyle=e; g.beginPath(); g.arc(x,y,r,0,TAU); g.fill(); }
/* a soft rng so wisps and ink stay the same every time a portrait is drawn */
function rng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }

/* ---------------------------------------------------------------- Halloran: the old keeper, one of the Unmade.
   Knit watch cap, grey beard, a weathered face; his left side (our right) is going to ink, a violet rim at its edge. */
function halloran(g,w,h,glass){
  bg(g,w,h,glass?'#4f4a62':'#3d4150','#15121b');
  const cx=w/2, hy=h*.43, hr=w*.235;
  // coat and turned-up collar, the scarf at the throat
  g.fillStyle='#5a4a3c'; g.beginPath(); g.ellipse(cx,h*1.04,w*.5,h*.36,0,PI,TAU); g.fill();
  g.fillStyle='#3f342b'; g.beginPath(); g.moveTo(cx-w*.28,h*.8); g.quadraticCurveTo(cx,h*.66,cx+w*.28,h*.8); g.lineTo(cx+w*.2,h*.9); g.quadraticCurveTo(cx,h*.8,cx-w*.2,h*.9); g.fill();
  g.fillStyle='#4f5b66'; g.beginPath(); g.ellipse(cx,h*.73,w*.2,h*.055,0,0,TAU); g.fill();
  g.fillStyle='#46515b'; g.beginPath(); g.ellipse(cx-w*.07,h*.82,w*.05,h*.09,.15,0,TAU); g.fill();
  // head: weathered skin, ruddy cheeks
  g.fillStyle='#c39377'; g.beginPath(); g.ellipse(cx,hy,hr,hr*1.16,0,0,TAU); g.fill();
  for(const s of [-1,1])glow(g,cx+s*hr*.48,hy+hr*.3,hr*.32,'rgba(196,96,82,.45)','rgba(196,96,82,0)');
  // grey beard and moustache
  g.fillStyle='#8f8a81'; g.beginPath(); g.moveTo(cx-hr*.86,hy+hr*.1); g.quadraticCurveTo(cx-hr*.9,hy+hr*1.25,cx,hy+hr*1.42); g.quadraticCurveTo(cx+hr*.9,hy+hr*1.25,cx+hr*.86,hy+hr*.1);
  g.quadraticCurveTo(cx+hr*.5,hy+hr*.62,cx,hy+hr*.6); g.quadraticCurveTo(cx-hr*.5,hy+hr*.62,cx-hr*.86,hy+hr*.1); g.fill();
  g.fillStyle='#aaa59b'; g.beginPath(); g.ellipse(cx-hr*.22,hy+hr*.5,hr*.26,hr*.09,.25,0,TAU); g.ellipse(cx+hr*.22,hy+hr*.5,hr*.26,hr*.09,-.25,0,TAU); g.fill();
  g.fillStyle='#5a3a30'; g.beginPath(); g.ellipse(cx,hy+hr*.66,hr*.16,hr*.05,0,0,TAU); g.fill();
  // tired, heavy-lidded eyes, grey brows
  for(const s of [-1,1]){ const ex=cx+s*hr*.4, ey=hy-hr*.05;
    g.fillStyle='#efe4d4'; g.beginPath(); g.ellipse(ex,ey,hr*.15,hr*.09,0,0,TAU); g.fill();
    g.fillStyle='#6b4022'; g.beginPath(); g.arc(ex+s*.6,ey+1,hr*.075,0,TAU); g.fill();
    g.fillStyle='#120a06'; g.beginPath(); g.arc(ex+s*.6,ey+1,hr*.035,0,TAU); g.fill();
    g.strokeStyle='#8a5a44'; g.lineWidth=2.2; g.beginPath(); g.moveTo(ex-hr*.17,ey-hr*.02); g.quadraticCurveTo(ex,ey-hr*.13,ex+hr*.17,ey-hr*.02); g.stroke(); // the heavy lid
    g.strokeStyle='rgba(110,62,46,.55)'; g.lineWidth=1.3; g.beginPath(); g.moveTo(ex-hr*.13,ey+hr*.14); g.quadraticCurveTo(ex,ey+hr*.21,ex+hr*.13,ey+hr*.13); g.stroke(); // the bag
    g.strokeStyle='#8f8a81'; g.lineWidth=3.2; g.beginPath(); g.moveTo(ex-hr*.2,ey-hr*.24+s*.5); g.quadraticCurveTo(ex,ey-hr*.31,ex+hr*.2,ey-hr*.22); g.stroke(); }
  // knit watch cap, pushed back, ribbed
  g.fillStyle='#57594f'; g.beginPath(); g.ellipse(cx,hy-hr*.78,hr*1.06,hr*.62,0,PI,TAU); g.fill();
  g.fillStyle='#4a4c44'; g.fillRect(cx-hr*1.06,hy-hr*.86,hr*2.12,hr*.24);
  g.strokeStyle='rgba(30,30,26,.35)'; g.lineWidth=1; for(let i=-9;i<=9;i++){ g.beginPath(); g.moveTo(cx+i*hr*.115,hy-hr*.86); g.lineTo(cx+i*hr*.115,hy-hr*.62); g.stroke(); }
  // the ink: his left side (our right) — face, shoulder and arm going to nothing, a violet rim where it meets him
  const R=rng(31);
  g.save(); g.beginPath();
  g.moveTo(cx+hr*.62,hy-hr*.95); g.bezierCurveTo(cx+hr*.35,hy-hr*.2,cx+hr*.72,hy+hr*.4,cx+hr*.4,hy+hr*1.1);
  g.bezierCurveTo(cx+w*.06,h*.78,cx+w*.04,h*.9,cx+w*.1,h); g.lineTo(w,h); g.lineTo(w,hy-hr*1.4); g.closePath();
  g.fillStyle=INK; g.fill();
  g.strokeStyle='rgba(163,124,255,.75)'; g.lineWidth=2; g.stroke();
  g.restore();
  // wisps rising off the ink
  for(let i=0;i<7;i++){ const x=cx+hr*(.7+R()*1.3), y=hy-hr*(.4-R()*2.6), r=3+R()*7;
    g.fillStyle='rgba(11,8,14,'+(.35+R()*.4).toFixed(2)+')'; g.beginPath(); g.ellipse(x,y-r,r*.6,r*1.4,R()-.5,0,TAU); g.fill(); }
  g.strokeStyle='rgba(176,140,255,.45)'; g.lineWidth=1.2; g.beginPath(); g.moveTo(cx+hr*.62,hy-hr*.95); g.quadraticCurveTo(cx+hr*.95,hy-hr*1.6,cx+hr*.7,hy-hr*2); g.stroke();
  if(glass){ g.fillStyle='rgba(255,200,140,.12)'; g.beginPath(); g.ellipse(cx,hy,hr*1.4,hr*1.6,0,0,TAU); g.fill(); }
  rim(g,w,h);
}

/* ---------------------------------------------------------------- Hesper: keeper of the light, lit from below by her violet lantern */
function hesper(g,w,h,glass){
  bg(g,w,h,glass?'#4e3f66':'#33304a','#120f1a');
  const cx=w/2, hy=h*.42, hr=w*.21;
  glow(g,cx-w*.2,h*.86,w*.5,'rgba(165,108,255,.55)','rgba(165,108,255,0)');
  // keeper's coat, dark blue, brass buttons
  g.fillStyle='#2f3a4e'; g.beginPath(); g.ellipse(cx,h*1.03,w*.46,h*.34,0,PI,TAU); g.fill();
  g.fillStyle='#253045'; g.beginPath(); g.moveTo(cx-w*.06,h*.72); g.lineTo(cx,h*.86); g.lineTo(cx+w*.06,h*.72); g.fill();
  g.fillStyle='#c8a24c'; for(const y of [.84,.92])for(const s of [-1,1]){ g.beginPath(); g.arc(cx+s*w*.07,h*y,2.2,0,TAU); g.fill(); }
  // dark hair, tied back, loose strands
  g.fillStyle='#2a2026'; g.beginPath(); g.ellipse(cx,hy-hr*.2,hr*1.12,hr*1.25,0,0,TAU); g.fill();
  // face
  g.fillStyle='#c8b0a4'; g.beginPath(); g.ellipse(cx,hy+hr*.05,hr*.9,hr*1.08,0,0,TAU); g.fill();
  g.fillStyle='#2a2026'; g.beginPath(); g.ellipse(cx,hy-hr*.72,hr*.98,hr*.5,0,PI,TAU); g.fill();
  g.beginPath(); g.moveTo(cx-hr*.95,hy-hr*.62); g.quadraticCurveTo(cx-hr*.2,hy-hr*.5,cx+hr*.15,hy-hr*.9); g.quadraticCurveTo(cx-hr*.5,hy-hr*.95,cx-hr*.95,hy-hr*.62); g.fill();
  g.strokeStyle='#2a2026'; g.lineWidth=1.6; g.beginPath(); g.moveTo(cx+hr*.85,hy-hr*.4); g.quadraticCurveTo(cx+hr*1.05,hy+hr*.4,cx+hr*.8,hy+hr*.9); g.stroke();
  // violet light on the underside of the face
  glow(g,cx-hr*.4,hy+hr*1.1,hr*1.2,'rgba(190,150,255,.35)','rgba(190,150,255,0)');
  // eyes, lowered a little — looking at the lantern; a small careful mouth
  for(const s of [-1,1]){ const ex=cx+s*hr*.38, ey=hy+hr*.02;
    g.strokeStyle='#2a1c22'; g.lineWidth=2; g.beginPath(); g.moveTo(ex-hr*.15,ey); g.quadraticCurveTo(ex,ey+hr*.1,ex+hr*.15,ey); g.stroke();
    g.strokeStyle='#3a2a2e'; g.lineWidth=1.6; g.beginPath(); g.moveTo(ex-hr*.17,ey-hr*.24); g.quadraticCurveTo(ex,ey-hr*.3,ex+hr*.17,ey-hr*.22); g.stroke(); }
  g.strokeStyle='#8a5a5a'; g.lineWidth=1.6; g.beginPath(); g.moveTo(cx-hr*.15,hy+hr*.58); g.quadraticCurveTo(cx,hy+hr*.63,cx+hr*.15,hy+hr*.58); g.stroke();
  // the violet lantern, held low at her side
  const lx=cx-w*.24, ly=h*.83;
  g.strokeStyle='#2c2a30'; g.lineWidth=2; g.beginPath(); g.arc(lx,ly-h*.075,w*.035,PI,TAU); g.stroke();
  g.fillStyle='#2c2a30'; g.fillRect(lx-w*.05,ly-h*.075,w*.1,h*.016); g.fillRect(lx-w*.05,ly+h*.05,w*.1,h*.016);
  glow(g,lx,ly,w*.11,'rgba(240,226,255,.95)','rgba(165,108,255,0)');
  g.fillStyle='rgba(214,188,255,.85)'; g.fillRect(lx-w*.04,ly-h*.06,w*.08,h*.11);
  g.fillStyle='#fff4ff'; g.beginPath(); g.ellipse(lx,ly,w*.012,h*.022,0,0,TAU); g.fill();
  g.strokeStyle='#2c2a30'; g.lineWidth=1.5; for(const s of [-1,1]){ g.beginPath(); g.moveTo(lx+s*w*.04,ly-h*.06); g.lineTo(lx+s*w*.04,ly+h*.05); g.stroke(); }
  // she is fading: a little of the dusk shows through at her edges
  g.fillStyle='rgba(18,15,26,.22)'; g.beginPath(); g.ellipse(cx+hr*1.2,hy+hr*.4,hr*.5,hr*1.5,0,0,TAU); g.fill();
  if(glass){ g.fillStyle='rgba(255,200,140,.12)'; g.beginPath(); g.ellipse(cx,hy,hr*1.4,hr*1.6,0,0,TAU); g.fill(); }
  rim(g,w,h);
}

/* ---------------------------------------------------------------- Ember: the fox, ears up, white bib */
function ember(g,w,h,glass){
  bg(g,w,h,glass?'#5a4462':'#4a3a40','#1d1518');
  const cx=w/2, hy=h*.5;
  glow(g,cx,hy,w*.5,'rgba(240,150,80,.18)','rgba(240,150,80,0)');
  // chest and shoulders
  g.fillStyle='#b8561f'; g.beginPath(); g.ellipse(cx,h*1.02,w*.4,h*.3,0,PI,TAU); g.fill();
  g.fillStyle='#e9dcc8'; g.beginPath(); g.ellipse(cx,h*.95,w*.17,h*.2,0,PI,TAU); g.fill();
  // ears
  for(const s of [-1,1]){
    g.fillStyle='#c8642a'; g.beginPath(); g.moveTo(cx+s*w*.08,hy-h*.12); g.lineTo(cx+s*w*.27,hy-h*.33); g.lineTo(cx+s*w*.3,hy-h*.06); g.closePath(); g.fill();
    g.fillStyle='#2a1a14'; g.beginPath(); g.moveTo(cx+s*w*.22,hy-h*.27); g.lineTo(cx+s*w*.27,hy-h*.33); g.lineTo(cx+s*w*.285,hy-h*.22); g.closePath(); g.fill();
    g.fillStyle='#f0e2cc'; g.beginPath(); g.moveTo(cx+s*w*.13,hy-h*.12); g.lineTo(cx+s*w*.24,hy-h*.25); g.lineTo(cx+s*w*.25,hy-h*.09); g.closePath(); g.fill(); }
  // head: broad at the cheeks, a long tapered muzzle
  g.fillStyle='#d0702e'; g.beginPath(); g.moveTo(cx-w*.3,hy-h*.04); g.quadraticCurveTo(cx-w*.26,hy-h*.2,cx,hy-h*.19); g.quadraticCurveTo(cx+w*.26,hy-h*.2,cx+w*.3,hy-h*.04);
  g.quadraticCurveTo(cx+w*.26,hy+h*.07,cx+w*.09,hy+h*.16); g.quadraticCurveTo(cx,hy+h*.21,cx-w*.09,hy+h*.16); g.quadraticCurveTo(cx-w*.26,hy+h*.07,cx-w*.3,hy-h*.04); g.fill();
  // white cheeks and muzzle
  g.fillStyle='#efe3cf'; g.beginPath(); g.moveTo(cx-w*.29,hy-h*.01); g.quadraticCurveTo(cx-w*.12,hy+h*.02,cx-w*.05,hy+h*.06); g.quadraticCurveTo(cx,hy+h*.2,cx+w*.05,hy+h*.06);
  g.quadraticCurveTo(cx+w*.12,hy+h*.02,cx+w*.29,hy-h*.01); g.quadraticCurveTo(cx+w*.24,hy+h*.08,cx+w*.08,hy+h*.17); g.quadraticCurveTo(cx,hy+h*.21,cx-w*.08,hy+h*.17); g.quadraticCurveTo(cx-w*.24,hy+h*.08,cx-w*.29,hy-h*.01); g.fill();
  // eyes: amber, a bright catch-light
  for(const s of [-1,1]){ const ex=cx+s*w*.11, ey=hy-h*.055;
    g.fillStyle='#1a120c'; g.beginPath(); g.ellipse(ex,ey,w*.04,h*.024,s*.35,0,TAU); g.fill();
    g.fillStyle='#e8a33a'; g.beginPath(); g.ellipse(ex,ey,w*.027,h*.018,s*.35,0,TAU); g.fill();
    g.fillStyle='#1a120c'; g.beginPath(); g.ellipse(ex,ey,w*.008,h*.015,0,0,TAU); g.fill();
    g.fillStyle='#fff6e0'; g.beginPath(); g.arc(ex-w*.01,ey-h*.007,1.6,0,TAU); g.fill(); }
  // nose
  g.fillStyle='#1a120c'; g.beginPath(); g.ellipse(cx,hy+h*.15,w*.035,h*.018,0,0,TAU); g.fill();
  g.fillStyle='rgba(255,255,255,.4)'; g.beginPath(); g.arc(cx-w*.01,hy+h*.145,1.3,0,TAU); g.fill();
  // a wisp of ink at one ear-tip: where the dark was
  g.fillStyle='rgba(11,8,14,.55)'; g.beginPath(); g.ellipse(cx+w*.29,hy-h*.36,w*.025,h*.03,.4,0,TAU); g.fill();
  if(glass){ g.fillStyle='rgba(255,200,140,.12)'; g.beginPath(); g.ellipse(cx,hy,w*.42,h*.42,0,0,TAU); g.fill(); }
  rim(g,w,h);
}

/* ---------------------------------------------------------------- Corvin: a raven made of dusk — a raven-shaped hole, violet-rimmed, two pale eyes */
function corvin(g,w,h,glass){
  bg(g,w,h,glass?'#5b4a70':'#4a3d5c','#1a1424');
  const cx=w/2, hy=h*.42;
  glow(g,cx,h*.3,w*.45,'rgba(200,170,230,.25)','rgba(200,170,230,0)'); // the dusk he's cut from
  const R=rng(7);
  g.save();
  g.beginPath();
  // body and folded wing
  g.ellipse(cx+w*.02,h*.82,w*.3,h*.3,-.15,0,TAU);
  // head, a heavy beak to our left
  g.moveTo(cx+w*.18,hy); g.ellipse(cx,hy,w*.19,h*.15,0,0,TAU);
  g.moveTo(cx-w*.14,hy-h*.03); g.lineTo(cx-w*.42,hy+h*.04); g.quadraticCurveTo(cx-w*.3,hy+h*.08,cx-w*.12,hy+h*.08); g.closePath();
  g.fillStyle='#15131c'; g.fill();
  g.strokeStyle='rgba(138,98,240,.8)'; g.lineWidth=2; g.stroke();
  g.restore();
  // ruffled throat feathers and the wing's edge: the dusk frays into wisps
  for(let i=0;i<9;i++){ const a=PI*(.15+R()*.7), r=w*(.27+R()*.08), x=cx+w*.02+Math.cos(a)*r, y=h*.82-Math.sin(a)*r*1.05;
    g.fillStyle='rgba(21,19,28,'+(.5+R()*.4).toFixed(2)+')'; g.beginPath(); g.ellipse(x,y,3+R()*4,6+R()*6,a,0,TAU); g.fill(); }
  g.strokeStyle='rgba(176,140,255,.35)'; g.lineWidth=1.2;
  for(let i=0;i<4;i++){ const y=h*(.68+i*.06); g.beginPath(); g.moveTo(cx-w*.05,y); g.quadraticCurveTo(cx+w*.12,y+h*.03,cx+w*.28,y-h*.02); g.stroke(); }
  // eyes: pale violet, the only light in him
  for(const [x,y,r] of [[cx-w*.02,hy-h*.025,w*.045]]){ glow(g,x,y,r*1.8,'rgba(192,154,255,.6)','rgba(192,154,255,0)'); g.fillStyle='#e6d6ff'; g.beginPath(); g.arc(x,y,r*.45,0,TAU); g.fill(); g.fillStyle='#fffaf0'; g.beginPath(); g.arc(x-1,y-1,1.4,0,TAU); g.fill(); }
  if(glass){ g.fillStyle='rgba(255,200,140,.12)'; g.beginPath(); g.ellipse(cx,hy,w*.4,h*.4,0,0,TAU); g.fill(); }
  rim(g,w,h);
}

/* ---------------------------------------------------------------- Aldous Crane: the reeve. A tall collar, a reeve's coat; his skin is pages, names crawl across it */
function crane(g,w,h,glass){
  bg(g,w,h,glass?'#5a4862':'#3e3846','#16121a');
  const cx=w/2, hy=h*.4, hr=w*.2;
  // reeve's coat: dark plum-brown, a tall stand collar, a chain of office
  g.fillStyle='#3a2a2e'; g.beginPath(); g.ellipse(cx,h*1.03,w*.48,h*.36,0,PI,TAU); g.fill();
  g.fillStyle='#2a1e22'; g.beginPath(); g.moveTo(cx-w*.2,h*.7); g.lineTo(cx-w*.13,h*.6); g.lineTo(cx,h*.7); g.lineTo(cx+w*.13,h*.6); g.lineTo(cx+w*.2,h*.7); g.lineTo(cx,h*.8); g.closePath(); g.fill();
  g.strokeStyle='#b89a50'; g.lineWidth=2; g.beginPath(); g.moveTo(cx-w*.22,h*.76); g.quadraticCurveTo(cx,h*.92,cx+w*.22,h*.76); g.stroke();
  g.fillStyle='#c8a24c'; g.beginPath(); g.arc(cx,h*.88,4,0,TAU); g.fill();
  // a long, narrow face of paper
  g.fillStyle='#e2d6bc'; g.beginPath(); g.ellipse(cx,hy,hr,hr*1.32,0,0,TAU); g.fill();
  // lines of writing across it, some of them running
  const R=rng(53);
  g.save(); g.beginPath(); g.ellipse(cx,hy,hr,hr*1.32,0,0,TAU); g.clip();
  g.strokeStyle='rgba(30,20,30,.55)'; g.lineWidth=1;
  for(let y=hy-hr*1.2;y<hy+hr*1.3;y+=5.5){ let x=cx-hr; g.beginPath(); g.moveTo(x,y); while(x<cx+hr){ x+=3+R()*6; g.lineTo(x,y+(R()-.5)*1.2); if(R()<.2){ x+=4; g.moveTo(x,y); } } g.stroke(); }
  g.fillStyle='rgba(20,10,30,.75)'; for(let i=0;i<4;i++){ const x=cx+(R()-.5)*hr*1.4, y=hy+(R()-.3)*hr; g.fillRect(x,y,1.6,5+R()*10); }
  g.restore();
  // thin hair, combed flat; deep-set eyes; a thin, set mouth
  g.fillStyle='#4a3f3a'; g.beginPath(); g.ellipse(cx,hy-hr*1.05,hr*.95,hr*.45,0,PI,TAU); g.fill();
  for(const s of [-1,1]){ const ex=cx+s*hr*.4, ey=hy-hr*.12;
    g.fillStyle='rgba(60,40,50,.35)'; g.beginPath(); g.ellipse(ex,ey,hr*.24,hr*.15,0,0,TAU); g.fill();
    g.fillStyle='#1a1018'; g.beginPath(); g.arc(ex,ey,2.6,0,TAU); g.fill();
    g.strokeStyle='#2a1e22'; g.lineWidth=2; g.beginPath(); g.moveTo(ex-hr*.2,ey-hr*.22+s*.2); g.lineTo(ex+hr*.2,ey-hr*.18-s*1.5); g.stroke(); }
  g.strokeStyle='#4a3238'; g.lineWidth=1.8; g.beginPath(); g.moveTo(cx-hr*.25,hy+hr*.72); g.lineTo(cx+hr*.25,hy+hr*.7); g.stroke();
  // the ledger, held up against his chest
  g.save(); g.translate(cx+w*.2,h*.86); g.rotate(-.2);
  g.fillStyle='#5a2e24'; g.fillRect(-w*.14,-h*.09,w*.28,h*.18);
  g.fillStyle='#e8dcc0'; g.fillRect(-w*.12,-h*.075,w*.24,h*.15);
  g.strokeStyle='#5a2e24'; g.lineWidth=1.2; g.beginPath(); g.moveTo(0,-h*.075); g.lineTo(0,h*.075); g.stroke();
  g.strokeStyle='rgba(40,25,30,.6)'; g.lineWidth=.9; for(let y=-h*.055;y<h*.065;y+=4){ for(const s of [-1,1]){ g.beginPath(); g.moveTo(s*w*.015,y); g.lineTo(s*w*.105,y); g.stroke(); } }
  g.restore();
  if(glass){ g.fillStyle='rgba(255,200,140,.12)'; g.beginPath(); g.ellipse(cx,hy,hr*1.5,hr*1.7,0,0,TAU); g.fill(); }
  rim(g,w,h);
}

/* ---------------------------------------------------------------- readings: an open book on a warm dark ground, lines of a small careful hand */
function page(g,w,h,glass){
  bg(g,w,h,glass?'#5a4462':'#4a3a40','#1d1518');
  const cx=w/2, cy=h*.54;
  glow(g,cx,cy,w*.55,'rgba(255,214,150,.28)','rgba(255,214,150,0)');
  g.save(); g.translate(cx,cy); g.rotate(-.08);
  const pw=w*.36, ph=h*.38;
  // the cover, then two pages bowed toward the gutter
  g.fillStyle='#4a2f2a'; g.beginPath(); g.moveTo(-pw-6,-ph*.5-4); g.lineTo(pw+6,-ph*.5-4); g.lineTo(pw+6,ph*.5+6); g.lineTo(-pw-6,ph*.5+6); g.closePath(); g.fill();
  for(const s of [-1,1]){
    g.fillStyle=s<0?'#efe6cf':'#e6dcc3'; g.beginPath(); g.moveTo(0,-ph*.5+2); g.quadraticCurveTo(s*pw*.5,-ph*.5-5,s*pw,-ph*.5); g.lineTo(s*pw,ph*.5); g.quadraticCurveTo(s*pw*.5,ph*.5-4,0,ph*.5+2); g.closePath(); g.fill();
    g.strokeStyle='rgba(60,45,40,.55)'; g.lineWidth=1.1; const R=rng(s<0?11:17);
    for(let y=-ph*.5+9;y<ph*.5-6;y+=6.5){ let x=s*5; g.beginPath(); g.moveTo(x,y); const end=s*(pw-6)*(y>ph*.3&&s>0?.5:1); while(Math.abs(x)<Math.abs(end)){ x+=s*(3+R()*6); g.lineTo(x,y+(R()-.5)*1); } g.stroke(); } }
  g.fillStyle='rgba(60,40,30,.35)'; g.fillRect(-1,-ph*.5,2,ph+2);
  // a ribbon marker
  g.fillStyle='#7a3a5a'; g.beginPath(); g.moveTo(pw*.3,ph*.5); g.lineTo(pw*.38,ph*.5+h*.12); g.lineTo(pw*.34,ph*.5+h*.1); g.lineTo(pw*.3,ph*.5+h*.12); g.closePath(); g.fill();
  g.restore();
  if(glass){ g.fillStyle='rgba(255,200,140,.1)'; g.fillRect(0,0,w,h); }
  rim(g,w,h);
}

/* ---------------------------------------------------------------- an echo: the Remembering Glass, a warm figure in the lens */
function echo(g,w,h,glass){
  bg(g,w,h,'#4a3a4c','#1d1520');
  const cx=w/2, cy=h*.47, r=w*.3;
  glow(g,cx,cy,r*1.6,'rgba(255,214,160,.3)','rgba(255,214,160,0)');
  g.fillStyle='rgba(214,188,255,.15)'; g.beginPath(); g.arc(cx,cy,r,0,TAU); g.fill();
  // a figure remembered in the glass
  g.fillStyle='rgba(255,214,160,.55)'; g.beginPath(); g.arc(cx,cy-r*.32,r*.17,0,TAU); g.fill();
  g.beginPath(); g.ellipse(cx,cy+r*.35,r*.3,r*.42,0,PI,TAU); g.fill();
  g.strokeStyle='#c8a24c'; g.lineWidth=4; g.beginPath(); g.arc(cx,cy,r,0,TAU); g.stroke();
  g.strokeStyle='#f1e9d8'; g.lineWidth=1.2; g.beginPath(); g.moveTo(cx-r*.5,cy-r*.6); g.lineTo(cx-r*.1,cy-r*.25); g.lineTo(cx-r*.3,cy+r*.15); g.stroke(); // the crack
  g.strokeStyle='#c8a24c'; g.lineWidth=6; g.lineCap='round'; g.beginPath(); g.moveTo(cx+r*.72,cy+r*.72); g.lineTo(cx+r*1.25,cy+r*1.3); g.stroke(); g.lineCap='butt';
  rim(g,w,h);
}

const REG={
  halloran:{fn:halloran,title:'Keeper, once',names:[/^halloran$/i,/^the figure$/i]},
  hesper:{fn:hesper,title:'Keeper of the light',names:[/^hesper$/i,/^hesper halloran$/i,/^maren$/i]},
  ember:{fn:ember,title:'',names:[/^ember$/i]},
  corvin:{fn:corvin,title:'',names:[/^corvin$/i]},
  crane:{fn:crane,title:'The reeve',names:[/^aldous crane$/i,/^crane$/i]},
  page:{fn:page,title:'',names:[/logbook|register|letter|note|page|memorandum|hand$/i]},
  echo:{fn:echo,title:'',names:[/^an echo$/i]}
};
const cache={};
const API=G.portraits={
  get(id){ if(id==='maren')id='hesper'; const r=id&&REG[id]; return r?r.fn:null; },
  add(id,fn,o){ REG[id]=Object.assign({fn,title:'',names:[]},o||{}); delete cache[id]; },
  title(id){ if(id==='maren')id='hesper'; const r=id&&REG[id]; return r?r.title||'':''; },
  /** who a caption is from → a portrait id. Readings (a logbook, the register, a page) get the book. */
  forWho(name){
    if(!name)return null; const n=String(name).trim();
    for(const id in REG){ if(id==='page')continue; if((REG[id].names||[]).some(re=>re.test(n)))return id; }
    if(REG.page.names.some(re=>re.test(n)))return 'page';
    return null;
  },
  /** a canvas with the portrait drawn once at the talk card's size (148×184), for the caption cameo to copy */
  cameo(id){
    if(id==='maren')id='hesper'; const fn=API.get(id); if(!fn)return null;
    if(cache[id])return cache[id];
    const c=document.createElement('canvas'); c.width=148; c.height=184;
    try{ fn(c.getContext('2d'),148,184,false); }catch(e){ console.error('portrait '+id,e); return null; }
    return cache[id]=c;
  }
};
})();

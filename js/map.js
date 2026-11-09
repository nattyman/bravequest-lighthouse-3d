/* =====================================================================
   map.js — the world map: a carved-wood tabletop miniature of the island
   with soft clouds hovering over the parts you haven't found yet.
   - Open: M · controller View (8) · the Map button in the pause card · the map icon (touch).
     Close: the same, Esc, or B. The game is paused while it's open (mode 'paused' + G.map.isOpen).
   - Its own small THREE.Scene + camera. While open the main renderer draws the map scene in place of
     the world (G.renderer.render is wrapped), so the world is never drawn twice and bloom/gamma still apply.
   - Discovery: a 96×48 bitset over x −240…240, z −120…120 (5 m cells). Cells within ~40 m of the player
     are charted; more from high ground, a lot from the lamp room. Persist key 'map' (base64 bitset).
     Old saves without it get what their quest progress implies (retroactive discovery).
   - Clouds: instanced billboard puffs in two layers, anchored to a coarse grid; their cover comes from
     the discovery field (a small DataTexture, blurred for a soft edge). Newly charted areas roll back
     over ~1.4 s the next time the map opens.
   - Fast travel (section 11): nine waypoints (WAYPOINTS below). Each unlocks the first time you walk within a few metres
     of it (a caption + a pulsing waystone on the chart); the lighthouse is home and known from the start. In the open map
     an unlocked waypoint is chosen by click / tap, Tab (Shift+Tab) + Enter, or the controller's LB/RB (D-pad ◀ ▶) + A;
     a confirm card asks "Travel to X?" (Enter/A travel, Esc/B stay). Travel fades to black (a near-cut with reduced motion),
     moves you to a checked standing spot beside the waypoint (the sea cave through cave.js's own entry/exit paths), closes
     the map and settles the camera behind you. travelBlock(w) says why not (bosses, escorts, a following swarm, hunters
     nearby, the finale, fog over the destination ...): the card shows that reason and nothing moves.
   - Collectibles (section 12): Heart Shards and Keeper's Caches get a small crystal / chest pin once you've been near one or
     had it in view (never before), faded once taken. Under cloud nothing shows.
   - Persist 'map' v2: + wp (unlocked waypoints), wpNew (unlocked, chart not opened since), seen (collectibles spotted).
     v1 saves load fine; their waypoints come from quest progress (retroWaypoints) and taken collectibles count as seen.
   API: G.map = {open(), close(), toggle(), isOpen, addMarker({id,pos,kind,label,visible,color,travel}),
                 removeMarker(id), markers, discovered(x,z), reveal(x,z,r), revealAll(), reset(), percent(),
                 waypoints, travelTargets(), travelBlock(id), travel(id,{force}), traveling, debug}
   Events: map:open {from} · map:close · map:discover {cells,percent} · map:waypoint {id,quiet} · map:travel {id,phase:'start'|'arrive'|'done'}
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const {clamp,lerp,smooth}=U;
const PI=Math.PI, TAU=PI*2;
const $=s=>document.getElementById(s);
const LM=()=>(G.world&&G.world.landmarks)||{};
const H=(x,z)=>{ try{ const h=G.world.height(x,z); return isFinite(h)?h:-5; }catch(_){ return -5; } };
const col=hex=>U.col(hex);

/* ================================================================ 1. FRAME */
const B={x0:-240,x1:240,z0:-120,z1:120};          // discovery bounds (world m)
const NX=96, NZ=48, CW=(B.x1-B.x0)/NX, CD=(B.z1-B.z0)/NZ;
const S=0.1;                                       // map units per metre (horizontal)
const VY=0.16;                                     // map units per metre (vertical: 1.6× relief)
const BOARD={x0:-252,x1:252,z0:-132,z1:132};       // the painted sea board (world m)
const STEP=3.5, NLEV=12, T0=.4;                    // contour-cut layers: thresholds T0+L·STEP
const thr=L=>T0+L*STEP, topM=L=>Math.min(42,thr(L)+3.1), topY=L=>topM(L)*VY;
const SEA_Y=.02;
const R_BASE=40, R_LAMP=140;
function revealRadius(p){
  const lh=G.world.lighthouse;
  if(lh&&p.y>(lh.topY||66)-1.2&&Math.hypot(p.x-lh.x,p.z-lh.z)<9)return R_LAMP;   // the lamp room / gallery
  return R_BASE+clamp((p.y-14)*.8,0,22);          // rises: the moor's hilltops a little, the cliff top more
}

/* ================================================================ 2. DISCOVERY */
const bits=new Uint8Array(NX*NZ);       // 0/1 charted
const seen=new Float32Array(NX*NZ);     // the field as it was when the map was last looked at (reveal animation)
const shown=new Float32Array(NX*NZ);    // what the clouds show right now
const land=new Uint8Array(NX*NZ);       // cells with dry land (for the "charted" percentage)
let landN=1, nBits=0, loadedMap=false, pendingRetro=false, revealT=-1, revealDur=1.4, dirtyTex=true;
const blightSeen={};
const idx=(i,j)=>j*NX+i;
const cellOf=(x,z)=>[Math.floor((x-B.x0)/CW),Math.floor((z-B.z0)/CD)];
function discovered(x,z){ const [i,j]=cellOf(x,z); if(i<0||j<0||i>=NX||j>=NZ)return false; return bits[idx(i,j)]===1; }
/** displayed (animated, softened) charted-ness 0..1 at a world point */
function shownAt(x,z){ const [i,j]=cellOf(x,z); if(i<0||j<0||i>=NX||j>=NZ)return 0; return shown[idx(i,j)]; }
function reveal(x,z,r){
  let n=0; const i0=Math.max(0,Math.floor((x-r-B.x0)/CW)), i1=Math.min(NX-1,Math.floor((x+r-B.x0)/CW));
  const j0=Math.max(0,Math.floor((z-r-B.z0)/CD)), j1=Math.min(NZ-1,Math.floor((z+r-B.z0)/CD));
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){ const k=idx(i,j); if(bits[k])continue;
    const cx=B.x0+(i+.5)*CW, cz=B.z0+(j+.5)*CD; if((cx-x)*(cx-x)+(cz-z)*(cz-z)<=r*r){ bits[k]=1; n++; } }
  if(n){ nBits+=n; dirtyTex=true; }
  return n;
}
function revealPath(pts,r){ let n=0; for(let k=0;k<pts.length-1;k++){ const a=pts[k],b=pts[k+1], L=Math.hypot(b.x-a.x,b.z-a.z), m=Math.max(1,Math.ceil(L/(r*.4)));
  for(let s=0;s<=m;s++)n+=reveal(lerp(a.x,b.x,s/m),lerp(a.z,b.z,s/m),r); } return n; }
function percent(){ let n=0; for(let k=0;k<bits.length;k++)if(bits[k]&&land[k])n++; return Math.round(n/landN*100); }
/* bitset <-> base64 */
function pack(a){ const by=new Uint8Array(Math.ceil(a.length/8)); for(let k=0;k<a.length;k++)if(a[k]>=.5)by[k>>3]|=1<<(k&7);
  let s=''; for(let k=0;k<by.length;k++)s+=String.fromCharCode(by[k]); return btoa(s); }
function unpack(str,out){ const s=atob(str); for(let k=0;k<out.length;k++){ const b=s.charCodeAt(k>>3)||0; out[k]=(b>>(k&7))&1; } }
const recount=()=>{ nBits=0; for(let k=0;k<bits.length;k++)nBits+=bits[k]; };

/* what a save already knows from its quest progress (old saves without map data, and debug start points) */
const AFTER_CLIMB=['failed','halloran2','forest','return','ascend','cure','descend','finale','done'];
const MET_HAL=['light','storm','climb','staff'].concat(AFTER_CLIMB);
const ACT1_WEST=['forest','return','ascend','cure','descend','finale','done'];
function retro(){
  const lm=LM(), q=(G.quest&&G.quest.step)||'', st=G.items.storm||{}, L=G.items.lantern||{};
  const lh=lm.lighthouse||{x:180,z:0}, cured=!!(G.lighthouse&&G.lighthouse.cured), loop=!!(G.loop&&G.loop.active);
  const stag=!!(G.flow&&G.flow.stagDead);
  let n=reveal(lh.x-8,lh.z,62);                                         // where you wake: the headland
  if(lm.cottage)n+=reveal(lm.cottage.x,lm.cottage.z,R_BASE);
  if(MET_HAL.includes(q)||st.found||cured||loop){                       // the figure on the cliff path
    const pts=[lm.cliffPathTop,lm.halloran,lm.cliffPathBottom].filter(Boolean); n+=revealPath(pts,36); }
  if(AFTER_CLIMB.includes(q)||st.failed||cured||loop)n+=reveal(lh.x,lh.z,R_LAMP*.8); // you've stood in the lamp room (looking mostly down the cliff)
  if(ACT1_WEST.includes(q)||L.found||stag||cured||loop){                // Act 1's road west: cliff → moor → hamlet → forest → the old tree
    if(lm.path)n+=revealPath(lm.path,34);
    if(lm.resistingTree)n+=reveal(lm.resistingTree.x,lm.resistingTree.z,46); }
  for(const b of G.blights||[]) if(b.cured){ n+=reveal(b.pos.x,b.pos.z,36); blightSeen[b.id]=true; }
  if(G.caveBoss&&G.caveBoss.discovered&&lm.caveMouth)n+=reveal(lm.caveMouth.x,lm.caveMouth.z,30);
  return n;
}
const PERSIST={
  save:()=>({v:2,nx:NX,nz:NZ,bits:pack(bits),blights:Object.keys(blightSeen),wp:Object.keys(wpOn),wpNew:Object.keys(wpNew),seen:Object.keys(seenC)}),
  load:(j)=>{
    if(!j)return;
    // waypoints + spotted collectibles (v2). A v1 save has none: quest progress grants them (retroWaypoints, next frame)
    for(const k in wpOn)delete wpOn[k]; for(const k in wpNew)delete wpNew[k]; for(const k in seenC)delete seenC[k];
    if(Array.isArray(j.wp)){ for(const id of j.wp)if(WP_BY[id])wpOn[id]=1; for(const id of j.wpNew||[])if(wpOn[id])wpNew[id]=1; }
    for(const k of j.seen||[])seenC[k]=1;
    wpRetroPending=true;   // additive: also fills in anything an older save (or a save from before a waypoint existed) implies
    if(j.nx!==NX||j.nz!==NZ||typeof j.bits!=='string')return;
    try{ unpack(j.bits,bits); }catch(e){ console.error('map load',e); return; }
    recount(); loadedMap=true; for(const id of j.blights||[])blightSeen[id]=true;
    seen.set(bits); revealT=-1; dirtyTex=true;
  }
};
if(G.persist&&G.persist.register)G.persist.register('map',PERSIST);
else G.on('ready',()=>{ if(G.persist&&G.persist.register)G.persist.register('map',PERSIST); });
G.on('mode',e=>{
  if(e.prev==='title'&&e.mode==='play'){ pendingRetro=true; wpRetroPending=true; }
  if(M.isOpen&&e.mode!=='paused')close(true);    // something else resumed / ended the game under the map
});
G.on('blight:seen',e=>{ if(e&&e.id)blightSeen[e.id]=true; });

/* ================================================================ 3. TEXTURES (procedural, built once) */
/* one coarse height grid (2.5 m) shared by the terrain, the painted sea and the cloud heights */
const GX=192, GZ=96, GDX=(B.x1-B.x0)/GX, GDZ=(B.z1-B.z0)/GZ;
let HG=null;
function heightGrid(){ if(HG)return HG; HG=new Float32Array((GX+1)*(GZ+1)); for(let j=0;j<=GZ;j++)for(let i=0;i<=GX;i++)HG[j*(GX+1)+i]=H(B.x0+i*GDX,B.z0+j*GDZ); return HG; }
function Hg(x,z){ const fx=clamp((x-B.x0)/GDX,0,GX-.001), fz=clamp((z-B.z0)/GDZ,0,GZ-.001), i=fx|0, j=fz|0, u=fx-i, v=fz-j, a=j*(GX+1)+i;
  if(x<B.x0-1||x>B.x1+1||z<B.z0-1||z>B.z1+1)return -12;
  return (HG[a]*(1-u)+HG[a+1]*u)*(1-v)+(HG[a+GX+1]*(1-u)+HG[a+GX+2]*u)*v; }
function canvas(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
function tex(c,o={}){ const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; t.anisotropy=4;
  if(o.repeat){ t.wrapS=t.wrapT=THREE.RepeatWrapping; } return t; }
const rnd=U.rng(9137);
/* wood grain as a luminance field around 1 (multiplied with the per-layer stain in vertex colours) */
function grain(px,py,f){
  const w=py*f.k+f.a*Math.sin(px*f.f1+py*.004)+f.b*Math.sin(px*f.f2+py*f.f3+1.3)+(f.c||1.5)*Math.sin(px*.0031+py*.011)+(f.n||0)*U.vnoise(px*.018,py*.05);
  const g=Math.sin(w)*.5+.5, ring=Math.pow(g,f.p);
  return ring;
}
function woodCanvas(w,h,f,base,dark,fx){
  const c=canvas(w,h), g=c.getContext('2d'), im=g.createImageData(w,h), d=im.data;
  const rowS=new Float32Array(h); for(let y=0;y<h;y++)rowS[y]=U.vnoise(3.1,y*.45)*.12;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const r=grain(x,y,f), fl=(((x*73856093)^(y*19349663))>>>0)%1000/1000*.07, streak=rowS[y]*(.6+.4*Math.sin(x*.013+y*.002));
    const t=clamp(r*.75+streak-fl,0,1); const k=(y*w+x)*4;
    d[k]=lerp(base[0],dark[0],t); d[k+1]=lerp(base[1],dark[1],t); d[k+2]=lerp(base[2],dark[2],t); d[k+3]=255;
  }
  g.putImageData(im,0,0); if(fx)fx(g,w,h); return c;
}
function topTexture(){
  const W=768,Hh=384;
  const c=woodCanvas(W,Hh,{k:.85,a:22,b:7,f1:.009,f2:.031,f3:.017,c:5,n:16,p:2.4},[255,251,244],[214,192,164],(g)=>{
    // knots
    for(let i=0;i<5;i++){ const x=rnd()*W, y=rnd()*Hh, r=2+rnd()*3;
      for(let k=4;k>0;k--){ g.strokeStyle=`rgba(110,70,40,${.04+.025*k})`; g.lineWidth=1; g.beginPath(); g.ellipse(x,y,r*k*.55,r*k*.28,0,0,TAU); g.stroke(); } }
    // the trail, burned into the wood (pyrography): a soft scorch under a dashed burn line
    const P=(LM().path||[]).map(p=>[(p.x-B.x0)/(B.x1-B.x0)*W,(p.z-B.z0)/(B.z1-B.z0)*Hh]);
    if(P.length>1){
      const line=(w,s,dash)=>{ g.setLineDash(dash||[]); g.lineWidth=w; g.strokeStyle=s; g.lineCap='round'; g.lineJoin='round'; g.beginPath(); g.moveTo(P[0][0],P[0][1]); for(const p of P)g.lineTo(p[0],p[1]); g.stroke(); };
      line(7,'rgba(120,70,35,.12)'); line(3.2,'rgba(90,48,22,.28)'); line(1.7,'rgba(62,30,14,.78)',[7,5]); g.setLineDash([]);
    }
  });
  const t=tex(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
}
function plyTexture(){
  // the cut edge of a ply sheet: 4 plies with thin glue lines, a slightly scorched top arris
  const c=canvas(128,64), g=c.getContext('2d');
  g.fillStyle='#f6ecd8'; g.fillRect(0,0,128,64);
  for(let x=0;x<128;x++){ const v=U.vnoise(x*.15,3)*.12; g.fillStyle=`rgba(120,80,40,${v})`; g.fillRect(x,0,1,64); }
  const bands=[0,16,32,48];
  for(const y of bands){ g.fillStyle='rgba(95,60,30,.55)'; g.fillRect(0,y,128,1.6); g.fillStyle='rgba(255,255,255,.18)'; g.fillRect(0,y+2,128,1); }
  // alternate plies a touch darker (cross grain)
  g.fillStyle='rgba(150,100,55,.12)'; g.fillRect(0,16,128,16); g.fillRect(0,48,128,16);
  g.fillStyle='rgba(60,32,14,.55)'; g.fillRect(0,0,128,2.4);
  const t=tex(c,{repeat:true}); return t;
}
let tableCanvas=null;
function tableTexture(){
  if(!tableCanvas)tableCanvas=woodCanvas(256,256,{k:.8,a:10,b:3,f1:.04,f2:.1,f3:.05,c:2,n:9,p:1.8},[112,74,50],[72,46,30]);
  return tex(tableCanvas,{repeat:true});
}
function seaTexture(){
  const W=384,Hh=200, c=canvas(W,Hh), g=c.getContext('2d'), im=g.createImageData(W,Hh), d=im.data;
  const deep=[34,64,74], mid=[52,92,96], shal=[104,142,130];
  for(let y=0;y<Hh;y++)for(let x=0;x<W;x++){
    const wx=BOARD.x0+(x+.5)/W*(BOARD.x1-BOARD.x0), wz=BOARD.z0+(y+.5)/Hh*(BOARD.z1-BOARD.z0);
    const h=Hg(wx,wz), s=smooth(-9,0,h), n=U.vnoise(x*.05,y*.05)*.12+U.vnoise(x*.4,y*.02)*.08;
    const k=(y*W+x)*4;
    for(let ch=0;ch<3;ch++){ const v=lerp(lerp(deep[ch],mid[ch],smooth(-11,-5,h)),shal[ch],s*s); d[k+ch]=clamp(v*(1-n+.06),0,255); }
    d[k+3]=255;
  }
  g.putImageData(im,0,0);
  // brush strokes along the board
  for(let i=0;i<600;i++){ const x=rnd()*W, y=rnd()*Hh, L=10+rnd()*40, a=.03+rnd()*.05, lite=rnd()<.5;
    g.strokeStyle=lite?`rgba(210,235,225,${a})`:`rgba(10,30,40,${a})`; g.lineWidth=1+rnd()*2.5; g.beginPath(); g.moveTo(x,y); g.quadraticCurveTo(x+L*.5,y+(rnd()-.5)*4,x+L,y+(rnd()-.5)*3); g.stroke(); }
  // a pale painted surf line hugging the shore
  for(let y=1;y<Hh-1;y+=1)for(let x=1;x<W-1;x+=1){
    const wx=BOARD.x0+(x+.5)/W*(BOARD.x1-BOARD.x0), wz=BOARD.z0+(y+.5)/Hh*(BOARD.z1-BOARD.z0); const h=Hg(wx,wz);
    if(h>-1.4&&h<.3&&U.hash(x,y)<.22){ g.fillStyle='rgba(235,240,228,.22)'; g.fillRect(x,y,1,1); } }
  return tex(c);
}
function backTexture(){
  const c=canvas(512,512), g=c.getContext('2d');
  const gr=g.createRadialGradient(200,190,20,256,256,380); gr.addColorStop(0,'#3a2a22'); gr.addColorStop(.45,'#211612'); gr.addColorStop(1,'#09070a');
  g.fillStyle=gr; g.fillRect(0,0,512,512); return tex(c);
}
/* cauliflower cloud puffs, a 2×2 atlas: R = baked light (each blob a lit dome), G = soft noise, A = density */
function puffTexture(){
  const C=96, N=C*2, c=canvas(N,N), g=c.getContext('2d'), im=g.createImageData(N,N), d=im.data, r=U.rng(77);
  const L=[-.42,.62,.66], ll=Math.hypot(L[0],L[1],L[2]); L[0]/=ll; L[1]/=ll; L[2]/=ll;
  for(let cell=0;cell<4;cell++){
    const ox=(cell&1)*C, oy=(cell>>1)*C, blobs=[];
    const n=6+(cell%3);
    for(let i=0;i<n;i++){ const a=r()*TAU, rr=.08+r()*.17; blobs.push([.5+Math.cos(a)*rr*1.15,.56+Math.sin(a)*rr*.55-(r()*.08),.12+r()*.11,r()*.1]); }
    blobs.push([.5,.5,.2,0],[.38,.58,.15,0],[.63,.58,.15,0]);
    for(let y=0;y<C;y++)for(let x=0;x<C;x++){
      const u=(x+.5)/C, v=(y+.5)/C; let best=-1, nx=0, ny=0, nz=1, dens=0;
      for(const b of blobs){ const dx=(u-b[0])/b[2], dy=(v-b[1])/b[2], q=dx*dx+dy*dy; if(q>=1){ dens=Math.max(dens,Math.exp(-(q-1)*6)*.0); continue; }
        const z=Math.sqrt(1-q), hgt=z*b[2]+b[3]; dens=Math.max(dens,1-q);
        if(hgt>best){ best=hgt; nx=dx; ny=-dy; nz=z; } }
      const lam=best<0?0:Math.max(0,nx*L[0]+ny*L[1]+nz*L[2]);
      const shade=clamp(.18+.82*lam+(best<0?0:(1-nz)*.08),0,1);
      const edge=1-smooth(.38,.5,Math.hypot(u-.5,(v-.5)*1.1));
      const k=((oy+y)*N+ox+x)*4;
      d[k]=shade*255; d[k+1]=U.fbm(u*5+cell*7,v*5,3)*255; d[k+2]=255; d[k+3]=clamp(smooth(0,.5,dens)*edge,0,1)*255;
    }
  }
  // melt the blobs together: a few box-blur passes over the light channel (and a softer one over density)
  const tmp=new Float32Array(N*N), blurCh=(ch,R,passes)=>{ for(let p=0;p<passes;p++){
    for(let y=0;y<N;y++){ let acc=0; for(let x=-R;x<=R;x++)acc+=d[(y*N+clamp(x,0,N-1))*4+ch];
      for(let x=0;x<N;x++){ tmp[y*N+x]=acc/(2*R+1); acc+=d[(y*N+clamp(x+R+1,0,N-1))*4+ch]-d[(y*N+clamp(x-R,0,N-1))*4+ch]; } }
    for(let x=0;x<N;x++){ let acc=0; for(let y=-R;y<=R;y++)acc+=tmp[clamp(y,0,N-1)*N+x];
      for(let y=0;y<N;y++){ d[(y*N+x)*4+ch]=acc/(2*R+1); acc+=tmp[clamp(y+R+1,0,N-1)*N+x]-tmp[clamp(y-R,0,N-1)*N+x]; } } } };
  blurCh(0,3,2); blurCh(3,2,1);
  g.putImageData(im,0,0); const t=new THREE.CanvasTexture(c); t.premultiplyAlpha=false; return t;
}

/* ================================================================ 4. GEOMETRY HELPERS */
/** parts: [{g, c:'#hex'|Color, m:Matrix4, a:[x,z] anchor (world map units)}] → one non-indexed geometry with colour + anchor */
function merge(parts,o={}){
  let n=0; const gs=parts.map(p=>{ let g=p.g.index?p.g.toNonIndexed():p.g.clone(); if(p.m)g.applyMatrix4(p.m); if(!g.attributes.normal)g.computeVertexNormals(); n+=g.attributes.position.count; return g; });
  const pos=new Float32Array(n*3), nor=new Float32Array(n*3), colr=new Float32Array(n*3), anc=new Float32Array(n*2), uv=o.uv?new Float32Array(n*2):null;
  let k=0; const cc=new THREE.Color();
  parts.forEach((p,pi)=>{ const g=gs[pi], P=g.attributes.position, N=g.attributes.normal, UV=g.attributes.uv;
    if(p.c&&p.c.isColor)cc.copy(p.c); else cc.copy(col(p.c||'#ffffff'));
    for(let i=0;i<P.count;i++,k++){ pos[k*3]=P.getX(i); pos[k*3+1]=P.getY(i); pos[k*3+2]=P.getZ(i);
      nor[k*3]=N.getX(i); nor[k*3+1]=N.getY(i); nor[k*3+2]=N.getZ(i);
      colr[k*3]=cc.r; colr[k*3+1]=cc.g; colr[k*3+2]=cc.b;
      anc[k*2]=p.a?p.a[0]:0; anc[k*2+1]=p.a?p.a[1]:0;
      if(uv){ uv[k*2]=UV?UV.getX(i):0; uv[k*2+1]=UV?UV.getY(i):0; } } });
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(pos,3)); out.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  out.setAttribute('color',new THREE.BufferAttribute(colr,3)); out.setAttribute('aAnchor',new THREE.BufferAttribute(anc,2));
  if(uv)out.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  return out;
}
const _m=new THREE.Matrix4(), _q=new THREE.Quaternion(), _e=new THREE.Euler(), _s=new THREE.Vector3(), _p=new THREE.Vector3();
const mat=(x,y,z,rx=0,ry=0,rz=0,sx=1,sy=sx,sz=sx)=>new THREE.Matrix4().compose(_p.set(x,y,z),_q.setFromEuler(_e.set(rx,ry,rz)),_s.set(sx,sy,sz));

/* ================================================================ 5. SCENE (built on the first open, then cached) */
let built=false, scene=null, cam=null, uni=null, discTex=null, discData=null, terrainTopMat=null, lampMat=null, lampGlow=null;
let spot=null, cloudMesh=null, caveArch=null, markerRoot=null, labelsEl=null, ui=null, buildMs=0;
const MU=(x,z)=>[x*S,z*S];                       // world → map units (xz)
/* terrace top (map y) under a world point */
function terraceY(x,z){ const h=H(x,z); let y=SEA_Y; for(let L=0;L<NLEV;L++){ if(h>=thr(L))y=topY(L); else break; } return y; }
/* how close a point is to a layer edge (to keep miniatures off the arris) */
function nearEdge(h){ for(let L=0;L<NLEV;L++){ if(Math.abs(h-thr(L))<.7)return true; } return false; }

/* shared reveal hook: props and trees collapse where the field says "not charted yet" (also in their shadows) */
function revealize(m,o={}){
  m.onBeforeCompile=sh=>{
    sh.uniforms.uDisc=uni.uDisc; sh.uniforms.uB=uni.uB;
    sh.vertexShader='attribute vec2 aAnchor;\nuniform sampler2D uDisc; uniform vec4 uB;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      ${o.push?'transformed+=normal*'+o.push.toFixed(4)+';':''}
      #ifdef USE_INSTANCING
        vec2 ancM=(instanceMatrix*vec4(0.,0.,0.,1.)).xz;
      #else
        vec2 ancM=aAnchor;
      #endif
      float revK=smoothstep(.45,.75,texture2D(uDisc,(ancM-uB.xy)/uB.zw).b);
      #ifdef USE_INSTANCING
        transformed*=revK;
      #else
        transformed=vec3(ancM.x,-1.,ancM.y)+(transformed-vec3(ancM.x,-1.,ancM.y))*revK;
      #endif`);
  };
  m.customProgramCacheKey=()=>'bqmap-rev'+(o.push||0)+(o.tag||'');
  return m;
}
function revMesh(geo,material,o={}){
  const mesh=new THREE.Mesh(geo,material); mesh.castShadow=o.cast!==false; mesh.receiveShadow=!!o.receive;
  const dm=revealize(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),{tag:'d'}); mesh.customDepthMaterial=dm;
  return mesh;
}
function outlineFor(mesh,th=.035){
  const m=revealize(new THREE.MeshBasicMaterial({color:col('#24160e'),side:THREE.BackSide}),{push:th,tag:'o'});
  const o=mesh.isInstancedMesh?new THREE.InstancedMesh(mesh.geometry,m,mesh.count):new THREE.Mesh(mesh.geometry,m);
  if(mesh.isInstancedMesh){ o.instanceMatrix=mesh.instanceMatrix; }
  o.castShadow=false; o.receiveShadow=false; o.raycast=()=>{}; o.renderOrder=-1; return o;
}
function woodMat(o={}){ return new THREE.MeshStandardMaterial(Object.assign({color:0xffffff,vertexColors:true,roughness:.62,metalness:0,envMapIntensity:.55},o)); }

function build(){
  const t0=performance.now();
  scene=new THREE.Scene();
  cam=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.5,500);
  uni={uDisc:{value:null},uB:{value:new THREE.Vector4(B.x0*S,B.z0*S,(B.x1-B.x0)*S,(B.z1-B.z0)*S)},uTime:{value:0},
    uFogR:{value:0},uFogC:{value:new THREE.Vector2(180*S,0)},uFogOn:{value:0}};
  // discovery + height field: R = shown (blurred) · G = terrain height (blurred) · B = shown (sharp)
  const tA=performance.now(); heightGrid(); M.debug.tGrid=Math.round(performance.now()-tA); discData=new Uint8Array(NX*NZ*4);
  discTex=new THREE.DataTexture(discData,NX,NZ,THREE.RGBAFormat); discTex.magFilter=discTex.minFilter=THREE.LinearFilter;
  discTex.wrapS=discTex.wrapT=THREE.ClampToEdgeWrapping; discTex.generateMipmaps=false; discTex.flipY=false;
  uni.uDisc.value=discTex; heightIntoTex(); uploadField(true);

  const tB=performance.now(); scene.background=backTexture();
  // environment for the lacquer sheen and the brass (a warm lamp-lit room)
  try{
    const ec=canvas(256,128), eg=ec.getContext('2d'); const gr=eg.createLinearGradient(0,0,0,128); gr.addColorStop(0,'#6b5a52'); gr.addColorStop(.5,'#3a2a22'); gr.addColorStop(1,'#120c0a');
    eg.fillStyle=gr; eg.fillRect(0,0,256,128); const lg=eg.createRadialGradient(60,30,2,60,30,40); lg.addColorStop(0,'#fff0cc'); lg.addColorStop(1,'rgba(255,220,160,0)'); eg.fillStyle=lg; eg.fillRect(0,0,256,128);
    const et=new THREE.CanvasTexture(ec); et.encoding=THREE.sRGBEncoding; et.mapping=THREE.EquirectangularReflectionMapping;
    const pm=new THREE.PMREMGenerator(G.renderer); scene.environment=pm.fromEquirectangular(et).texture; pm.dispose(); et.dispose();
  }catch(e){ console.warn('map env',e); }
  M.debug.tEnv=Math.round(performance.now()-tB);

  // lamplight from the west-north-west, a cool window fill from the east, a little ambient
  spot=new THREE.SpotLight(0xffc68c,1.65,0,.62,.75,0); spot.position.set(-30,34,14); spot.target.position.set(4,0,-1);
  spot.castShadow=true; const sm=G.isMobile?1024:2048; spot.shadow.mapSize.set(sm,sm); spot.shadow.bias=-.0008; spot.shadow.normalBias=.05;
  spot.shadow.camera.near=20; spot.shadow.camera.far=95; spot.shadow.radius=3;
  scene.add(spot,spot.target);
  const fill=new THREE.DirectionalLight(0x8f9fd0,.32); fill.position.set(30,22,-18); scene.add(fill);
  scene.add(new THREE.HemisphereLight(0x8f7f9a,0x2a1a12,.42));

  const tm={}; for(const [k,f] of [['table',buildTable],['sea',buildSea],['terrain',buildTerrain],['trees',buildTrees],['props',buildProps],['clouds',buildClouds],['markers',buildMarkers]]){ const a=performance.now(); f(); tm[k]=Math.round(performance.now()-a); }
  M.debug.buildSteps=tm;
  built=true; buildMs=Math.round(performance.now()-t0);
  if(G.debug)console.log('[map] built in',buildMs,'ms');
}

/* under cloud, the board fades into a soft violet mist (so a gap between puffs shows cloud-shadow, never the island) */
const MIST_GLSL=`{ float cover=1.-texture2D(uDisc,(vMapXZ-uB.xy)/uB.zw).r; float ck=smoothstep(.08,.85,cover);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.45,ck);
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.30,.27,.38),ck*.72); }`;
function mistify(m,key,extraFrag){
  m.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,{uDisc:uni.uDisc,uB:uni.uB,uFogR:uni.uFogR,uFogC:uni.uFogC,uFogOn:uni.uFogOn,uTime:uni.uTime});
    sh.vertexShader='varying vec2 vMapXZ;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vMapXZ=(modelMatrix*vec4(position,1.)).xz;');
    sh.fragmentShader='varying vec2 vMapXZ;\nuniform sampler2D uDisc; uniform vec4 uB; uniform float uFogR; uniform vec2 uFogC; uniform float uFogOn; uniform float uTime;\n'+
      sh.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n'+(extraFrag||'')+'\n'+MIST_GLSL);
  };
  m.customProgramCacheKey=()=>'bqmap-'+key; return m;
}
/* ---------- the tray: a carved walnut rim with brass corner brackets, on a darker table ---------- */
function buildTable(){
  const tt=tableTexture();
  const x0=BOARD.x0*S, x1=BOARD.x1*S, z0=BOARD.z0*S, z1=BOARD.z1*S, RIM=1.7;
  // tabletop under everything
  const top=new THREE.Mesh(new THREE.PlaneGeometry(260,180),new THREE.MeshStandardMaterial({color:col('#7a5a46'),map:tt,roughness:.7,envMapIntensity:.3}));
  tt.repeat.set(14,10); top.rotation.x=-PI/2; top.position.y=-1.15; top.receiveShadow=true; scene.add(top);
  // the rim: a rectangle with a hole, extruded with a rounded bevel → reads carved
  const sh=new THREE.Shape(); sh.moveTo(x0-RIM,z0-RIM); sh.lineTo(x1+RIM,z0-RIM); sh.lineTo(x1+RIM,z1+RIM); sh.lineTo(x0-RIM,z1+RIM); sh.lineTo(x0-RIM,z0-RIM);
  const hole=new THREE.Path(); hole.moveTo(x0,z0); hole.lineTo(x0,z1); hole.lineTo(x1,z1); hole.lineTo(x1,z0); hole.lineTo(x0,z0); sh.holes.push(hole);
  const rg=new THREE.ExtrudeGeometry(sh,{depth:1.55,bevelEnabled:true,bevelThickness:.32,bevelSize:.3,bevelSegments:3,curveSegments:2});
  rg.rotateX(PI/2); rg.translate(0,.75,0);
  // planar UVs from the top so the grain runs along the long rails
  { const P=rg.attributes.position, uv=rg.attributes.uv; for(let i=0;i<P.count;i++)uv.setXY(i,P.getX(i)*.035+P.getY(i)*.02,P.getZ(i)*.035+P.getY(i)*.02); }
  const rimT=tableTexture(); rimT.repeat.set(1,1);
  const rim=new THREE.Mesh(rg,new THREE.MeshStandardMaterial({color:col('#a97a55'),map:rimT,roughness:.5,envMapIntensity:.7}));
  rim.castShadow=true; rim.receiveShadow=true; scene.add(rim);
  // a dark base slab below the sea board
  const base=new THREE.Mesh(new THREE.BoxGeometry(x1-x0+RIM*2+.5,.6,z1-z0+RIM*2+.5),new THREE.MeshStandardMaterial({color:col('#2c1d15'),roughness:.8}));
  base.position.y=-.85; base.receiveShadow=true; scene.add(base);
  // brass corner brackets + studs (one mesh)
  const parts=[], brass='#c79a4a';
  for(const [cx,cz,sx,sz] of [[x0,z0,1,1],[x1,z0,-1,1],[x1,z1,-1,-1],[x0,z1,1,-1]]){
    const ox=cx-sx*RIM*.5, oz=cz-sz*RIM*.5, y=.78+.33;
    parts.push({g:new THREE.BoxGeometry(3.2,.08,.9),m:mat(ox+sx*1.15,y,oz),c:brass});
    parts.push({g:new THREE.BoxGeometry(.9,.08,3.2),m:mat(ox,y,oz+sz*1.15),c:brass});
    for(const [dx,dz] of [[0,0],[sx*2.2,0],[0,sz*2.2]])parts.push({g:new THREE.SphereGeometry(.16,8,6,0,TAU,0,PI/2),m:mat(ox+dx,y+.03,oz+dz),c:'#e2c27a'});
    // carved corner rosette
    parts.push({g:new THREE.CylinderGeometry(.55,.62,.12,10),m:mat(ox,y-.01,oz),c:'#7a4f30'});
  }
  const br=new THREE.Mesh(merge(parts),new THREE.MeshStandardMaterial({vertexColors:true,metalness:.85,roughness:.32,envMapIntensity:1.2}));
  br.castShadow=true; scene.add(br);
}
/* ---------- the painted sea board, with a slow shimmer ---------- */
let seaMat=null;
function buildSea(){
  const g=new THREE.PlaneGeometry((BOARD.x1-BOARD.x0)*S,(BOARD.z1-BOARD.z0)*S,1,1); g.rotateX(-PI/2);
  seaMat=new THREE.MeshStandardMaterial({map:seaTexture(),roughness:.38,metalness:0,envMapIntensity:.9});
  mistify(seaMat,'sea',`{ vec2 q=vUv*vec2(50.,26.); float s=sin(q.x*1.7+q.y*.6+uTime*.55)*sin(q.y*2.3-q.x*.4-uTime*.42)+.6*sin(q.x*.9-uTime*.3+q.y*1.1);
        diffuseColor.rgb*=1.+.055*s; }`);
  const sea=new THREE.Mesh(g,seaMat); sea.position.y=SEA_Y; sea.receiveShadow=true; scene.add(sea);
}
/* ---------- the island: contour-cut plywood layers (marching squares per level) ---------- */
function buildTerrain(){
  const x0=B.x0, z0=B.z0, dx=GDX, dz=GDZ, hv=heightGrid();
  const tp=[],tc=[],tu=[], wp=[],wc=[],wu=[],wn=[];
  const stain=L=>{ const c=new THREE.Color(); c.copy(col('#5e3e26')).lerp(col('#b98552'),smooth(0,4,L)).lerp(col('#e6c38e'),smooth(3,11,L)); return c; };
  const cx=[0,0,1,1], cz=[0,1,1,0]; // corner order c0 (i,j) → c1 (i,j+1) → c2 (i+1,j+1) → c3 (i+1,j): up-facing fan
  const sx=v=>v*S, sz=v=>v*S;
  for(let L=0;L<NLEV;L++){
    const t=thr(L), tn=L<NLEV-1?thr(L+1):1e9, yT=topY(L), yB=L?topY(L-1):-.05, sc=stain(L), wcCol=stain(L).multiplyScalar(.92);
    for(let j=0;j<GZ;j++)for(let i=0;i<GX;i++){
      const h=[hv[j*(GX+1)+i],hv[(j+1)*(GX+1)+i],hv[(j+1)*(GX+1)+i+1],hv[j*(GX+1)+i+1]];
      const inN=(h[0]>=t)+(h[1]>=t)+(h[2]>=t)+(h[3]>=t); if(!inN)continue;
      const poly=[];   // [x,z,isCrossing]
      for(let k=0;k<4;k++){ const a=h[k], b=h[(k+1)&3];
        const ax=x0+(i+cx[k])*dx, az=z0+(j+cz[k])*dz, bx=x0+(i+cx[(k+1)&3])*dx, bz=z0+(j+cz[(k+1)&3])*dz;
        if(a>=t)poly.push([ax,az,0]);
        if((a>=t)!==(b>=t)){ const f=(t-a)/(b-a); poly.push([lerp(ax,bx,f),lerp(az,bz,f),1]); } }
      const covered=h[0]>=tn&&h[1]>=tn&&h[2]>=tn&&h[3]>=tn;
      if(!covered) for(let k=1;k<poly.length-1;k++) for(const p of [poly[0],poly[k],poly[k+1]]){
        tp.push(sx(p[0]),yT,sz(p[1])); tc.push(sc.r,sc.g,sc.b); tu.push((p[0]-B.x0)/(B.x1-B.x0),1-(p[1]-B.z0)/(B.z1-B.z0)); }
      if(inN===4)continue;
      for(let k=0;k<poly.length;k++){ const a=poly[k], b=poly[(k+1)%poly.length]; if(!a[2]||!b[2])continue;
        const ax=sx(a[0]),az=sz(a[1]),bx=sx(b[0]),bz=sz(b[1]); const ddx=bx-ax, ddz=bz-az, l=Math.hypot(ddx,ddz)||1, nx=-ddz/l, nz=ddx/l;
        const ua=(a[0]+a[1])*.06, ub=(b[0]+b[1])*.06;
        const V=[[ax,yB,az,ua,0],[bx,yB,bz,ub,0],[bx,yT,bz,ub,1],[ax,yB,az,ua,0],[bx,yT,bz,ub,1],[ax,yT,az,ua,1]];
        for(const v of V){ wp.push(v[0],v[1],v[2]); wn.push(nx,0,nz); wc.push(wcCol.r,wcCol.g,wcCol.b); wu.push(v[3],v[4]); } }
    }
  }
  const tg=new THREE.BufferGeometry(); tg.setAttribute('position',new THREE.Float32BufferAttribute(tp,3)); tg.setAttribute('color',new THREE.Float32BufferAttribute(tc,3)); tg.setAttribute('uv',new THREE.Float32BufferAttribute(tu,2));
  { const n=new Float32Array(tp.length); for(let k=1;k<n.length;k+=3)n[k]=1; tg.setAttribute('normal',new THREE.BufferAttribute(n,3)); }
  terrainTopMat=new THREE.MeshStandardMaterial({vertexColors:true,map:topTexture(),roughness:.58,envMapIntensity:.5});
  mistify(terrainTopMat,'top',`{ float fd=texture2D(map,vUv*vec2(14.,14.)+vec2(.37,.11)).g; diffuseColor.rgb*=mix(1.,.82+.2*fd,.6); }
        if(uFogOn>.5){ float d=length(vMapXZ-uFogC)-uFogR;
          diffuseColor.rgb*=mix(1.,.74,smoothstep(-.4,.9,d));                       // outside the lighthouse's light: a dimmer wood
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.42,.27,.62),(1.-smoothstep(.0,.22,abs(d)))*.45); }`);
  const top=new THREE.Mesh(tg,terrainTopMat); top.receiveShadow=true; top.castShadow=true; scene.add(top);
  const wg=new THREE.BufferGeometry(); wg.setAttribute('position',new THREE.Float32BufferAttribute(wp,3)); wg.setAttribute('normal',new THREE.Float32BufferAttribute(wn,3)); wg.setAttribute('color',new THREE.Float32BufferAttribute(wc,3)); wg.setAttribute('uv',new THREE.Float32BufferAttribute(wu,2));
  const walls=new THREE.Mesh(wg,mistify(new THREE.MeshStandardMaterial({vertexColors:true,map:plyTexture(),roughness:.75,envMapIntensity:.3}),'walls'));
  walls.castShadow=true; walls.receiveShadow=true; scene.add(walls);
  // a quiet tide line of pale sand where the bottom ply meets the sea
}
/* ---------- carved lollipop trees (instanced) ---------- */
function buildTrees(){
  const r=U.rng(4242), oak=[], pine=[];
  const pd=G.world.pathDist||(()=>99), rt=LM().resistingTree||{x:-165,z:5};
  for(let x=-234;x<-58;x+=7.2)for(let z=-108;z<108;z+=7.2){
    const px=x+(r()-.5)*6, pz=z+(r()-.5)*6, edge=smooth(-56,-84,px); if(r()>edge*.9)continue;
    const h=H(px,pz); if(h<3||nearEdge(h))continue; if(pd(px,pz)<5)continue; if(Math.hypot(px-rt.x,pz-rt.z)<17)continue;
    (r()<lerp(.35,.6,smooth(-20,40,-pz))?pine:oak).push([px,pz,.8+r()*.5,r()*TAU]);
  }
  for(const [x,z] of [[-40,-20],[8,-44],[62,8],[30,30],[-52,48],[118,-20],[140,30],[76,-40],[-4,-8]]){ const h=H(x,z); if(h>3&&!nearEdge(h))oak.push([x,z,.85,r()*TAU]); }
  const trunk=new THREE.CylinderGeometry(.05,.08,.5,6); trunk.translate(0,.25,0);
  const oakG=merge([{g:trunk,c:'#5b3b22'},{g:new THREE.IcosahedronGeometry(.36,1),m:mat(0,.72,0,0,0,0,1,.88,1),c:'#9a8a4e'},{g:new THREE.IcosahedronGeometry(.22,0),m:mat(.2,.62,.1),c:'#8c7d44'}]);
  const pineG=merge([{g:trunk,c:'#4d321d'},{g:new THREE.ConeGeometry(.3,.62,7),m:mat(0,.62,0),c:'#6f6a3a'},{g:new THREE.ConeGeometry(.22,.48,7),m:mat(0,.95,0),c:'#7a7542'}]);
  const tm=woodMat({flatShading:true,roughness:.7}); revealize(tm,{tag:'t'});
  const mk=(geo,list)=>{ const im=new THREE.InstancedMesh(geo,tm,list.length); im.castShadow=true; im.receiveShadow=true;
    im.customDepthMaterial=revealize(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),{tag:'d'});
    list.forEach((t,k)=>{ const s=t[2]*1.25; im.setMatrixAt(k,mat(t[0]*S,terraceY(t[0],t[1]),t[1]*S,0,t[3],0,s,s*(.9+((k*7)%5)*.05),s)); });
    im.instanceMatrix.needsUpdate=true; scene.add(im); scene.add(outlineFor(im,.022)); return im; };
  if(oak.length)mk(oakG,oak); if(pine.length)mk(pineG,pine);
}
/* ---------- carved miniatures: lighthouse, cottage + shed, hamlet, standing stones, the Resisting Tree, the cave arch ---------- */
/** a gable roof: a triangular prism along x, eaves at y 0, ridge at y h */
function gable(w,d,h){ const sh=new THREE.Shape(); sh.moveTo(-d/2,0); sh.lineTo(d/2,0); sh.lineTo(0,h); sh.lineTo(-d/2,0);
  const g=new THREE.ExtrudeGeometry(sh,{depth:w,bevelEnabled:false}); g.translate(0,0,-w/2); g.rotateY(PI/2); return g; }
function house(parts,x,z,yaw,w,d,hgt,o={}){
  const y=terraceY(x,z), a=MU(x,z), q=new THREE.Matrix4().makeRotationY(yaw), at=(lx,ly,lz)=>new THREE.Matrix4().makeTranslation(a[0],y,a[1]).multiply(q).multiply(new THREE.Matrix4().makeTranslation(lx,ly,lz));
  const wall=o.wall||'#d7b07c', roof=o.roof||'#8c5534';
  if(o.ruin){
    parts.push({g:new THREE.BoxGeometry(w,hgt*.75,d*.12),m:at(0,hgt*.375,-d/2),c:wall,a});
    parts.push({g:new THREE.BoxGeometry(w*.12,hgt*.9,d),m:at(-w/2,hgt*.45,0),c:wall,a});
    parts.push({g:new THREE.BoxGeometry(w*.55,hgt*.45,d*.12),m:at(w*.2,hgt*.22,d/2),c:wall,a});
    parts.push({g:new THREE.BoxGeometry(w*.12,hgt*.55,d*.7),m:at(w/2,hgt*.27,-d*.12),c:wall,a});
    parts.push({g:gable(w*.5,d*1.05,d*.42),m:new THREE.Matrix4().copy(at(-w*.26,hgt*.72,0)).multiply(new THREE.Matrix4().makeRotationZ(.18)),c:roof,a});
    return;
  }
  parts.push({g:new THREE.BoxGeometry(w,hgt,d),m:at(0,hgt/2,0),c:wall,a});
  parts.push({g:gable(w*1.14,d*1.22,d*.62),m:at(0,hgt-.01,0),c:roof,a});
  parts.push({g:new THREE.BoxGeometry(w*1.02,.03,d*1.02),m:at(0,hgt-.015,0),c:'#5a3a24',a}); // a dark band under the eaves
  if(o.chimney)parts.push({g:new THREE.BoxGeometry(w*.14,hgt*.7,w*.14),m:at(w*.3,hgt+d*.45,d*.1),c:'#8a6a50',a});
  if(o.door)parts.push({g:new THREE.BoxGeometry(w*.16,hgt*.55,.02),m:at(-w*.24,hgt*.28,-d/2-.01),c:'#3a2414',a});
  if(o.win)for(const sd of [-1,1])for(const wx of [-.05,.28])parts.push({g:new THREE.BoxGeometry(w*.13,hgt*.24,.02),m:at(wx*w,hgt*.55,sd*(d/2+.012)),c:'#f6c264',a});
}
function buildProps(){
  const lm=LM(), parts=[], E=1.8; // miniatures are a touch over true scale so they read
  // keeper's cottage + oil shed
  if(lm.cottage)house(parts,lm.cottage.x,lm.cottage.z,0,9*S*E*.85,6.4*S*E*.85,4.2*VY*1.2,{chimney:true,door:true,win:true});
  if(lm.shed)house(parts,lm.shed.x,lm.shed.z,.15,5*S*E*.85,4*S*E*.85,3*VY*1.2,{roof:'#58361f',wall:'#b98e5e'});
  // the ruined hamlet
  const HAM=[{x:-31,z:21,yaw:.2},{x:-9,z:19,yaw:-.12},{x:-28,z:41,yaw:.35},{x:-7,z:39,yaw:-.28}];
  HAM.forEach((h,k)=>house(parts,h.x,h.z,h.yaw,8*S*E*.8,6*S*E*.8,4*VY*1.1,{ruin:true,wall:k%2?'#b88456':'#c4935f'}));
  // standing stones
  if(lm.stones){ const s=lm.stones, y=terraceY(s.x,s.z), a=MU(s.x,s.z);
    for(let k=0;k<7;k++){ const ang=k/7*TAU, R=.75; parts.push({g:new THREE.BoxGeometry(.16,.42+(k%3)*.1,.11),m:mat(a[0]+Math.cos(ang)*R,y+.22,a[1]+Math.sin(ang)*R,0,-ang,((k%2)-.5)*.12),c:'#9c8a76',a}); }
    parts.push({g:new THREE.BoxGeometry(.5,.12,.2),m:mat(a[0],y+.06,a[1],0,.4,0),c:'#8c7a66',a}); }
  // the Resisting Tree: a gnarled trunk, three boughs, a broad canopy
  if(lm.resistingTree){ const t=lm.resistingTree, y=terraceY(t.x,t.z), a=MU(t.x,t.z);
    const tr=new THREE.CylinderGeometry(.16,.34,1.4,8); tr.translate(0,.7,0);
    parts.push({g:tr,m:mat(a[0],y,a[1],0,0,.06),c:'#4a2e1a',a});
    for(const [ang,l] of [[.3,.8],[2.4,.7],[4.3,.75]]){ const bg=new THREE.CylinderGeometry(.06,.11,l,6); bg.translate(0,l/2,0);
      parts.push({g:bg,m:mat(a[0],y+1.1,a[1],Math.sin(ang)*.9,0,Math.cos(ang)*.9),c:'#4a2e1a',a}); }
    for(const [ox,oy,oz,rr] of [[0,1.75,0,.72],[.5,1.6,.25,.5],[-.45,1.55,-.2,.52],[.05,1.5,-.5,.46],[-.2,1.95,.3,.42]])
      parts.push({g:new THREE.IcosahedronGeometry(rr,1),m:mat(a[0]+ox,y+oy,a[1]+oz,0,0,0,1,.82,1),c:'#a8935a',a});
    for(let k=0;k<5;k++){ const ang=k/5*TAU+.3; const rg=new THREE.CylinderGeometry(.03,.07,.6,5); rg.rotateZ(PI/2.4);
      parts.push({g:rg,m:mat(a[0]+Math.cos(ang)*.32,y+.06,a[1]+Math.sin(ang)*.32,0,-ang,0),c:'#4a2e1a',a}); }
  }
  const pm=woodMat({flatShading:true}); revealize(pm,{tag:'p'});
  const props=revMesh(merge(parts),pm,{receive:true}); scene.add(props); scene.add(outlineFor(props,.03));
  buildLighthouse(); buildCaveArch();
  // the Resisting Tree's faint warm-violet glow
  if(lm.resistingTree){ const t=lm.resistingTree, gs=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:col('#b98cff'),transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));
    gs.position.set(t.x*S,terraceY(t.x,t.z)+2.0,t.z*S); gs.scale.set(3.2,2.4,1); gs.userData.anchor=[t.x,t.z]; scene.add(gs); glowSprites.push(gs); }
}
const glowSprites=[];
function buildLighthouse(){
  const lh=G.world.lighthouse||{x:180,z:0}, a=MU(lh.x,lh.z), y=terraceY(lh.x,lh.z), K=1.12;
  // a turned profile: plinth, tapering tower with turned rings, gallery, lantern housing seat
  const pts=[[0,0],[.78,0],[.78,.12],[.66,.16],[.62,.3],[.58,1.0],[.6,1.04],[.6,1.1],[.55,1.14],[.5,2.0],[.53,2.04],[.53,2.1],[.48,2.14],[.44,2.9],[.7,2.94],[.72,3.04],[.4,3.08],[.38,3.12],[0,3.12]]
    .map(p=>new THREE.Vector2(p[0]*K*.62,p[1]*K));
  const body=new THREE.LatheGeometry(pts,18);
  const parts=[{g:body,c:'#d9b07a',a},
    {g:new THREE.CylinderGeometry(.62*K*.62*.62,.62*K*.62*.62,.04,18),m:mat(0,3.0*K,0),c:'#5b3a22',a}];
  // the dark red bands (stained rings) and a little door
  for(const yy of [.7,1.6,2.45]){ const r0=lerp(.6,.44,(yy-.3)/2.6)*K*.62+.005; parts.push({g:new THREE.CylinderGeometry(r0,r0*1.01,.14*K,18,1,true),m:mat(0,yy*K,0),c:'#7a3b2a',a}); }
  parts.push({g:new THREE.BoxGeometry(.18,.32,.04),m:mat(-.36*K*.62-.02,.33*K,0,0,PI/2,0),c:'#3a2414',a});
  const cap=new THREE.ConeGeometry(.34*K*.62,.42*K,14); cap.translate(0,3.12*K+.62*K+.21*K,0);
  parts.push({g:cap,c:'#5a3a26',a},{g:new THREE.SphereGeometry(.05*K,8,6),m:mat(0,3.12*K+.62*K+.45*K,0),c:'#d8b25c',a});
  for(let k=0;k<6;k++){ const ang=k/6*TAU; parts.push({g:new THREE.CylinderGeometry(.018,.018,.62*K,5),m:mat(Math.cos(ang)*.3*K*.62,3.12*K+.31*K,Math.sin(ang)*.3*K*.62),c:'#b58a42',a}); }
  const g=merge(parts); g.translate(a[0],y,a[1]);
  // re-anchor after the translate (anchors were the world xz already)
  const m=woodMat({roughness:.42,envMapIntensity:.8}); revealize(m,{tag:'l'});
  const tower=revMesh(g,m,{receive:true}); scene.add(tower); scene.add(outlineFor(tower,.03));
  // the lamp: brass glass glowing warm (cured) or a cold ember (before the cure)
  lampMat=new THREE.MeshStandardMaterial({color:col('#f3d08a'),emissive:col('#ffb24a'),emissiveIntensity:1.6,roughness:.3,metalness:.2});
  const lamp=new THREE.Mesh(new THREE.CylinderGeometry(.24*K*.62,.24*K*.62,.5*K,12),lampMat); lamp.position.set(a[0],y+3.12*K+.3*K,a[1]); scene.add(lamp);
  lampGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.flame,color:col('#ffc06a'),transparent:true,opacity:.75,depthWrite:false,blending:THREE.AdditiveBlending}));
  lampGlow.position.copy(lamp.position); lampGlow.scale.set(2.4,2.4,1); scene.add(lampGlow);
}
function buildCaveArch(){
  const m=LM().caveMouth||{x:181.2,z:52.4}, a=MU(m.x,m.z+2.5), y=SEA_Y;
  const parts=[{g:new THREE.TorusGeometry(.62,.26,6,10,PI),m:mat(a[0],y,a[1],0,0,0),c:'#6d5440',a},
    {g:new THREE.CircleGeometry(.5,12,0,PI),m:mat(a[0],y,a[1]-.06,0,0,0),c:'#0c0806',a},
    {g:new THREE.DodecahedronGeometry(.32,0),m:mat(a[0]-.9,y+.1,a[1]+.1),c:'#7a6450',a},{g:new THREE.DodecahedronGeometry(.24,0),m:mat(a[0]+.95,y+.06,a[1]+.2),c:'#7a6450',a}];
  const pm=woodMat({flatShading:true}); revealize(pm,{tag:'c'});
  caveArch=revMesh(merge(parts),pm); caveArch.visible=false; scene.add(caveArch);
}

/* ---------- clouds: instanced billboard puffs, two layers, cover from the discovery field ---------- */
const CLOUD_VS=`
attribute vec3 iAnchor; attribute vec4 iSeed;
uniform sampler2D uDisc; uniform vec4 uB; uniform float uTime; uniform float uHS;
varying vec2 vUv; varying float vA; varying float vLayer; varying float vRot; varying float vSeed;
vec2 tuv(vec2 p){ return (p-uB.xy)/uB.zw; }
void main(){
  float ph=iSeed.y, lay=iAnchor.y;
  vec2 p=iAnchor.xz+vec2(sin(uTime*.07+ph*6.283),cos(uTime*.055+ph*4.1))*.45;
  vec4 d=texture2D(uDisc,tuv(p));
  float cover=1.-smoothstep(.12,.88,d.r);
  float e=.9;
  vec2 g=vec2(texture2D(uDisc,tuv(p+vec2(e,0.))).r-texture2D(uDisc,tuv(p-vec2(e,0.))).r,
              texture2D(uDisc,tuv(p+vec2(0.,e))).r-texture2D(uDisc,tuv(p-vec2(0.,e))).r);
  float gl=length(g);
  p-=(gl>1e-4?g/gl:vec2(0.))*(1.-cover)*1.5;                 // the clouds part: pushed back off charted ground
  float hy=max(d.g*uHS,0.);
  vec3 c=vec3(p.x,hy+mix(1.15,2.35,lay)+(1.-cover)*1.1+sin(uTime*.25+ph*9.)*.07,p.y);
  float sz=iSeed.x*(.78+.22*cover+(1.-cover)*.4);
  vA=cover*cover*(3.-2.*cover);
  vUv=position.xy+.5; vLayer=lay; vRot=iSeed.z; vSeed=iSeed.w;
  if(vA<.004){ gl_Position=vec4(2.,2.,2.,1.); return; }
  vec4 mv=viewMatrix*vec4(c,1.);
  mv.xy+=position.xy*sz*vec2(1.,.74);
  gl_Position=projectionMatrix*mv;
}`;
const CLOUD_FS=`
uniform sampler2D uPuff; uniform float uTime; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uWarm; uniform float uOpacity;
varying vec2 vUv; varying float vA; varying float vLayer; varying float vRot; varying float vSeed;
void main(){
  float cell=floor(vRot*4.); vec2 off=vec2(mod(cell,2.),floor(cell/2.))*.5;
  vec2 uv=vec2(vUv.x,1.-vUv.y);
  vec4 t=texture2D(uPuff,off+clamp(uv,.01,.99)*.5);
  float n=texture2D(uPuff,off+fract(uv*.8+vec2(uTime*.004+vSeed,uTime*.003))*.5).g;
  float dens=t.a*(.8+.4*n);
  float lit=t.r*(.88+.24*n);
  vec3 c=mix(uShade,uLit,clamp(lit,0.,1.));
  c=mix(c,uWarm,(1.-vUv.x)*clamp(lit,0.,1.)*.2);
  c*=mix(.95,1.03,vLayer);
  float a=smoothstep(.04,.85,dens)*vA*uOpacity*mix(.92,.8,vLayer);
  if(a<.004)discard;
  gl_FragColor=vec4(c,a);
}`;
function buildClouds(){
  const r=U.rng(5150), anchors=[], seeds=[], SP=11;
  for(let lay=0;lay<2;lay++){
    const sp=lay?SP*1.25:SP;
    const IN=13;
    for(let z=BOARD.z0+IN;z<BOARD.z1-IN+1;z+=sp)for(let x=BOARD.x0+IN;x<BOARD.x1-IN+1;x+=sp){
      const ax=clamp(x+(r()-.5)*sp*.9,BOARD.x0+IN,BOARD.x1-IN), az=clamp(z+(r()-.5)*sp*.9,BOARD.z0+IN,BOARD.z1-IN);
      const edge=Math.min(ax-BOARD.x0,BOARD.x1-ax,az-BOARD.z0,BOARD.z1-az), k=lerp(.62,1,smooth(IN,IN+22,edge));
      anchors.push([ax*S,lay,az*S]);
      seeds.push([(lay?4.1:3.3)*(.85+r()*.35)*k,r(),r()*.999,r()]);
    } }
  // far-to-near (camera looks north from the south), lower layer first in each row → stable blending without sorting
  const ord=anchors.map((a,k)=>k).sort((p,q)=>(anchors[p][2]+anchors[p][1]*.4)-(anchors[q][2]+anchors[q][1]*.4));
  const n=ord.length, ia=new Float32Array(n*3), is=new Float32Array(n*4);
  ord.forEach((k,o)=>{ ia.set(anchors[k],o*3); is.set(seeds[k],o*4); });
  const g=new THREE.InstancedBufferGeometry(); const q=new THREE.PlaneGeometry(1,1);
  g.index=q.index; g.setAttribute('position',q.attributes.position); g.setAttribute('uv',q.attributes.uv);
  g.setAttribute('iAnchor',new THREE.InstancedBufferAttribute(ia,3)); g.setAttribute('iSeed',new THREE.InstancedBufferAttribute(is,4));
  g.instanceCount=n;
  const m=new THREE.ShaderMaterial({vertexShader:CLOUD_VS,fragmentShader:CLOUD_FS,transparent:true,depthWrite:false,depthTest:true,
    uniforms:{uDisc:uni.uDisc,uB:uni.uB,uTime:uni.uTime,uHS:{value:45*VY},uPuff:{value:puffTexture()},uOpacity:{value:1},
      uLit:{value:col('#e9e3ec')},uShade:{value:col('#988db0')},uWarm:{value:col('#efd9c2')}}});
  cloudMesh=new THREE.Mesh(g,m); cloudMesh.frustumCulled=false; cloudMesh.renderOrder=10; scene.add(cloudMesh);
  M.debug.puffs=n;
}
function heightIntoTex(){
  const h=new Float32Array(NX*NZ);
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){ const x=B.x0+(i+.5)*CW, z=B.z0+(j+.5)*CD; let m=-5;
    for(const [ox,oz] of [[0,0],[-2.5,-2.5],[2.5,2.5],[-2.5,2.5],[2.5,-2.5]])m=Math.max(m,Hg(x+ox,z+oz)); h[idx(i,j)]=m; }
  const b=blur(blur(h));
  for(let k=0;k<NX*NZ;k++)discData[k*4+1]=clamp(Math.max(b[k],h[k]*.9)/45,0,1)*255;
}
function blur(a){ const o=new Float32Array(a.length);
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){ let s=0,w=0;
    for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){ const ii=i+di, jj=j+dj; if(ii<0||jj<0||ii>=NX||jj>=NZ)continue; const k=(di||dj)?((di&&dj)?.5:.8):1.4; s+=a[idx(ii,jj)]*k; w+=k; }
    o[idx(i,j)]=s/w; } return o; }
function uploadField(force){
  if(!discData)return;
  let k=0; const anim=revealT>=0;
  const e=anim?(t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2)(clamp(revealT/revealDur,0,1)):1;
  for(k=0;k<NX*NZ;k++)shown[k]=anim?lerp(seen[k],bits[k],e):bits[k];
  const b=blur(blur(shown));
  for(k=0;k<NX*NZ;k++){ discData[k*4]=clamp(b[k]*1.15-.05,0,1)*255; discData[k*4+2]=shown[k]*255; discData[k*4+3]=255; }
  discTex.needsUpdate=true; dirtyTex=false;
}

/* ================================================================ 6. MARKERS */
const markers=[]; const byId={};
let pinMat=null, pinGeo={};
const MARKER_COL={player:'#d9ae54',objective:'#a56cff',landmark:'#c79a4a',bench:'#e7a24b',blight:'#151018',blightCured:'#b995ff',cave:'#9c8a76',waypoint:'#ffc35a',
  shard:'#b48cff',cache:'#8a5a32',custom:'#c79a4a',fox:'#d0702e',raven:'#3a3150'};
function pinGeometry(kind,color){
  const key=kind+color; if(pinGeo[key])return pinGeo[key];
  const parts=[{g:new THREE.CylinderGeometry(.025,.012,1.05,6),m:mat(0,.52,0),c:'#9a8c7a'}];
  if(kind==='player'){
    const sh=new THREE.Shape(); sh.moveTo(0,.62); sh.lineTo(.4,-.3); sh.lineTo(0,-.1); sh.lineTo(-.4,-.3); sh.lineTo(0,.62);
    const ar=new THREE.ExtrudeGeometry(sh,{depth:.1,bevelEnabled:true,bevelThickness:.03,bevelSize:.03,bevelSegments:1}); ar.rotateX(PI/2); // tip toward +z (heading 0), thickness downward
    parts.length=0;
    parts.push({g:new THREE.CylinderGeometry(.42,.46,.07,20),m:mat(0,.035,0),c:'#7a5a2a'},{g:new THREE.CylinderGeometry(.035,.045,.42,6),m:mat(0,.27,0),c:'#b08a44'},
      {g:ar,m:mat(0,.52,0),c:color},{g:new THREE.SphereGeometry(.07,8,6),m:mat(0,.6,0),c:'#f6e1a4'});
  }else if(kind==='blightCured'){ // a little glowcap
    parts.push({g:new THREE.SphereGeometry(.24,12,8,0,TAU,0,PI/2),m:mat(0,1.05,0,0,0,0,1,.7,1),c:color},{g:new THREE.SphereGeometry(.06,6,4),m:mat(.1,1.12,.05),c:'#efe2ff'});
  }else if(kind==='bench'){ // a tiny flask
    parts.push({g:new THREE.SphereGeometry(.2,10,8),m:mat(0,1.06,0),c:color},{g:new THREE.CylinderGeometry(.06,.07,.18,8),m:mat(0,1.3,0),c:color},{g:new THREE.CylinderGeometry(.075,.075,.05,8),m:mat(0,1.41,0),c:'#6b4a2e'});
  }else if(kind==='waypoint'){ // a carved waystone with a brass lamp on top (no pin: it stands on the board)
    parts.length=0;
    parts.push({g:new THREE.CylinderGeometry(.34,.4,.12,10),m:mat(0,.06,0),c:'#7a6450'},{g:new THREE.BoxGeometry(.2,.78,.2),m:mat(0,.5,0),c:'#a08c74'},
      {g:new THREE.BoxGeometry(.28,.06,.28),m:mat(0,.9,0),c:'#6b4a2e'},{g:new THREE.SphereGeometry(.14,10,8),m:mat(0,1.03,0),c:color},
      {g:new THREE.ConeGeometry(.19,.2,8),m:mat(0,1.24,0),c:'#6b4a2e'},{g:new THREE.SphereGeometry(.04,6,4),m:mat(0,1.36,0),c:'#e2c27a'});
  }else if(kind==='shard'){ // a sliver of lamp-glass on a pin
    parts.push({g:new THREE.OctahedronGeometry(.17,0),m:mat(0,1.12,0,0,.4,0,.62,1.55,.62),c:color});
  }else if(kind==='cache'){ // an iron-bound box on a pin
    const lid=new THREE.CylinderGeometry(.12,.12,.34,8,1,false,0,PI); lid.rotateZ(PI/2);
    parts.push({g:new THREE.BoxGeometry(.34,.18,.24),m:mat(0,1.0,0),c:color},{g:lid,m:mat(0,1.09,0,PI/2,0,0),c:'#9a6a3e'},
      {g:new THREE.BoxGeometry(.04,.3,.27),m:mat(-.1,1.05,0),c:'#3a3540'},{g:new THREE.BoxGeometry(.04,.3,.27),m:mat(.1,1.05,0),c:'#3a3540'},
      {g:new THREE.BoxGeometry(.08,.09,.03),m:mat(0,1.02,.13),c:'#e2c27a'});
  }else{
    parts.push({g:new THREE.SphereGeometry(kind==='objective'?.24:.19,12,10),m:mat(0,1.08,0),c:color});
  }
  return pinGeo[key]=merge(parts);
}
function makePinMesh(rec){
  const kind=rec.kind==='blight'?'blight':rec.kind;
  const color=rec.color||MARKER_COL[kind]||MARKER_COL.custom;
  const g=new THREE.Group();
  const m0=rec.kind==='objective'?objMat:rec.kind==='waypoint'?wpMat:rec.kind==='shard'?shardPinMat:pinMat;
  const mesh=new THREE.Mesh(pinGeometry(kind,color),m0); mesh.castShadow=true; g.add(mesh); rec.baseMat=m0;
  const ol=new THREE.Mesh(mesh.geometry,olPinMat); ol.renderOrder=-1; g.add(ol);
  if(rec.kind==='blight'){ const cm=new THREE.Mesh(pinGeometry('blightCured',MARKER_COL.blightCured),glowcapMat); cm.castShadow=true; cm.visible=false; g.add(cm); rec.curedMesh=cm; }
  if(rec.kind==='waypoint'){ // a glowing ring on the board: pulses while new, steady when chosen
    const ring=new THREE.Mesh(new THREE.RingGeometry(.48,.62,28),new THREE.MeshBasicMaterial({color:col('#ffcf7a'),transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
    ring.rotation.x=-PI/2; ring.position.y=.03; ring.renderOrder=2; g.add(ring); rec.ring=ring; }
  rec.mesh=mesh; rec.group=g; g.visible=false; markerRoot.add(g);
}
let objMat=null, glowcapMat=null, olPinMat=null, wpMat=null, shardPinMat=null, dimMat=null;
function buildMarkers(){
  markerRoot=new THREE.Group(); scene.add(markerRoot);
  pinMat=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.7,roughness:.35,envMapIntensity:1.3});
  objMat=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.3,roughness:.3,emissive:col('#7a3dff'),emissiveIntensity:.6});
  glowcapMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.4,emissive:col('#8f5cff'),emissiveIntensity:.8});
  wpMat=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.45,roughness:.45,envMapIntensity:1.1,emissive:col('#ffb24a'),emissiveIntensity:.18});
  shardPinMat=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.2,roughness:.25,emissive:col('#8a4dff'),emissiveIntensity:.75});
  // taken / opened: a faded, unlit pin (the colour drained toward the wood)
  dimMat=new THREE.MeshStandardMaterial({color:col('#8d8178'),roughness:.85,metalness:0,transparent:true,opacity:.62});
  olPinMat=new THREE.MeshBasicMaterial({color:col('#1c120c'),side:THREE.BackSide});
  olPinMat.onBeforeCompile=sh=>{ sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed+=normal*.028;'); };
  olPinMat.customProgramCacheKey=()=>'bqmap-olpin';
  for(const r of markers)if(!r.group&&r.pin!==false)makePinMesh(r);
}
/** G.map.addMarker({id, pos:Vector3|{x,z}|()=>pos, kind, label, visible:()=>bool, color, pin, travel})
    kind: 'landmark' (label only), 'bench', 'blight', 'cave', 'waypoint' (a waystone; travel:true makes it a fast-travel
    target, see section 11), 'shard' / 'cache' (section 12), or anything (a brass pin).
    Markers under clouds stay hidden unless o.always is true. */
function addMarker(o){
  if(!o||!o.id)return null;
  if(byId[o.id])removeMarker(o.id);
  const rec=Object.assign({kind:'custom',label:'',visible:()=>true,pin:true,travel:false,always:false},o);
  if(rec.kind==='landmark'&&o.pin==null)rec.pin=false;
  rec.shownNow=false; rec.screen={x:0,y:0,on:false};
  markers.push(rec); byId[rec.id]=rec;
  if(built&&rec.pin!==false)makePinMesh(rec);
  if(labelsEl)makeLabel(rec);
  return rec;
}
function removeMarker(id){ const r=byId[id]; if(!r)return; delete byId[id]; markers.splice(markers.indexOf(r),1);
  if(r.group&&r.group.parent)r.group.parent.remove(r.group); if(r.el&&r.el.parentNode)r.el.parentNode.removeChild(r.el); }
const posOf=r=>{ const p=typeof r.pos==='function'?r.pos():r.pos; return p||null; };
function defaultMarkers(){
  const lm=LM();
  const lmk=(id,k,label,extra)=>{ const p=lm[k]; if(p)addMarker(Object.assign({id,kind:'landmark',label,pos:{x:p.x,z:p.z}},extra||{})); };
  lmk('lighthouse','lighthouse','The Lighthouse',{kind:'lighthouse',pin:false,always:true});
  lmk('cottage','cottage','Keeper’s Cottage');
  lmk('hamlet','hamlet','The Ruined Hamlet');
  lmk('stones','stones','Standing Stones');
  lmk('resisting','resistingTree','The Resisting Tree');
  lmk('cliffpath','cliffPathBottom','The Cliff Path');
  addMarker({id:'cave',kind:'cave',label:'The Sea Cave',pos:()=>{ const m=LM().caveMouth; return m?{x:m.x,z:m.z+2}:null; },visible:()=>!!(G.caveBoss&&G.caveBoss.discovered)});
  addMarker({id:'objective',kind:'objective',label:'',always:true,pos:()=>G.quest&&G.quest.target,visible:()=>!!(G.quest&&G.quest.target)});
  addMarker({id:'player',kind:'player',label:'You',always:true,pos:()=>playerMapPos()});
}
function playerMapPos(){ const P=G.player; if(!P||!P.pos)return null;
  if(G.cave&&G.cave.inside){ const m=LM().caveMouth; return m?{x:m.x,z:m.z+1}:P.pos; }
  if(ucInside()){ const d=LM().undercroftDoor; return d?{x:d.x,z:d.z}:P.pos; }
  if(tpInside()){ const d=LM().vigilDoor; return d?{x:d.x,z:d.z}:P.pos; } return P.pos; }
/* benches + blights are picked up as they appear (alchemy tables are added at init; blights exist from load) */
function syncDynamic(){
  const T=(G.alchemy&&G.alchemy.tables)||[];
  T.forEach((t,k)=>{ const id='bench'+k; if(byId[id])return; const w=t.world; if(!w||w.x<B.x0||w.x>B.x1||w.z<B.z0||w.z>B.z1)return; // the cave's bench lives off-island
    addMarker({id,kind:'bench',label:'Alchemy Table',pos:{x:w.x,z:w.z},visible:()=>!(t.on&&t.on()===false)}); });
  for(const b of G.blights||[]){ const id='blight:'+b.id; if(byId[id])continue;
    addMarker({id,kind:'blight',label:b.name,pos:b.pos,blight:b,visible:()=>!!(b.cured||blightSeen[b.id]||(G.loop&&G.loop.active))}); }
  syncCollectibles();
}

/* ================================================================ 7. UI CHROME */
const CSS=`
#mapUI{position:fixed;inset:0;z-index:20;touch-action:none;cursor:grab;-webkit-user-select:none;user-select:none;
  background:radial-gradient(ellipse at 50% 50%,transparent 58%,rgba(8,5,8,.55) 100%)}
#mapUI.drag{cursor:grabbing}
#mapUI .mp-plate{position:absolute;left:max(16px,env(safe-area-inset-left,0px));top:calc(14px + env(safe-area-inset-top,0px));
  display:grid;gap:2px;padding:12px 20px 12px 18px;color:#21161f;pointer-events:none;
  background:linear-gradient(180deg,#efe4cc,#e2d3b3);border-radius:3px;
  box-shadow:0 10px 28px rgba(0,0,0,.5),inset 0 0 0 1px rgba(60,40,30,.25),inset 0 0 0 5px #efe4cc,inset 0 0 0 6px rgba(60,40,30,.35)}
#mapUI .mp-plate .eyebrow{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#6c3f5f}
#mapUI .mp-plate h2{margin:0;font-family:var(--display);font-weight:400;font-size:clamp(26px,4vw,38px);line-height:1}
#mapUI .mp-pct{font:italic 400 14px var(--serif);color:#5a4448}
#mapUI .mp-compass{position:absolute;right:max(16px,env(safe-area-inset-right,0px));top:calc(12px + env(safe-area-inset-top,0px));width:86px;height:86px;pointer-events:none;
  filter:drop-shadow(0 4px 8px rgba(0,0,0,.55))}
#mapUI .mp-bar{position:absolute;left:max(16px,env(safe-area-inset-left,0px));right:max(16px,env(safe-area-inset-right,0px));bottom:calc(14px + env(safe-area-inset-bottom,0px));
  display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;pointer-events:none}
#mapUI .mp-hints{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:12.5px;color:#e9dfcd;text-shadow:0 1px 3px #000;max-width:560px}
#mapUI .mp-hints span{display:flex;align-items:center;gap:5px}
#mapUI .mp-btns{display:flex;gap:8px;pointer-events:auto}
#mapUI .mp-btn{font:600 14px var(--body);padding:9px 16px;border-radius:2px;cursor:pointer;display:flex;align-items:center;gap:7px;
  border:1px solid rgba(60,40,30,.55);background:linear-gradient(180deg,#efe4cc,#e2d3b3);color:#2a1c22;box-shadow:0 4px 14px rgba(0,0,0,.45)}
#mapUI .mp-btn.primary{background:#4b3863;color:#f1e9d8;border-color:#4b3863}
#mapUI .mp-btn kbd{color:inherit;background:rgba(255,255,255,.25);border-color:rgba(40,25,30,.45);min-width:19px;height:19px;font-size:11px}
#mapUI .mp-btn.primary kbd{border-color:rgba(241,233,216,.55);background:rgba(20,15,26,.35)}
#mapUI .mp-btn:focus-visible{outline:2px solid var(--ether);outline-offset:3px}
#mapUI .mp-legend{position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(70px + env(safe-area-inset-bottom,0px));width:min(250px,calc(100% - 32px));
  display:grid;gap:7px;padding:14px 16px;color:#2a1c22;font-size:13.5px;pointer-events:none;
  background:linear-gradient(180deg,#efe4cc,#e2d3b3);border-radius:3px;box-shadow:0 10px 28px rgba(0,0,0,.5),inset 0 0 0 1px rgba(60,40,30,.3)}
#mapUI .mp-legend .eyebrow{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#6c3f5f}
#mapUI .mp-legend span{display:flex;align-items:center;gap:9px}
#mapUI .mp-legend i{width:13px;height:13px;border-radius:50%;flex:none;box-shadow:inset 0 -2px 0 rgba(0,0,0,.25),0 0 0 1px rgba(40,25,20,.5)}
#mapUI .mp-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
#mapUI .mp-label{position:absolute;left:0;top:0;white-space:nowrap;font:400 14px var(--display);letter-spacing:.03em;color:#2a1c22;
  padding:3px 9px 4px;background:linear-gradient(180deg,#f1e7d0,#e0cfae);border-radius:2px;opacity:0;transition:opacity .2s;
  box-shadow:0 3px 10px rgba(0,0,0,.45),inset 0 0 0 1px rgba(60,40,30,.35)}
#mapUI .mp-label.on{opacity:1}
#mapUI .mp-label.obj{color:#f4ecff;background:linear-gradient(180deg,#5d4580,#4b3863);box-shadow:0 3px 12px rgba(80,40,160,.55),inset 0 0 0 1px rgba(214,188,255,.5)}
#mapUI .mp-label.obj small{display:block;font:600 10px var(--body);letter-spacing:.18em;text-transform:uppercase;color:#d6bcff}
#mapUI .mp-label.you{font:700 11px var(--body);letter-spacing:.16em;text-transform:uppercase;padding:2px 7px}
#mapUI .mp-label.wp{background:linear-gradient(180deg,#f6e2b0,#e2c27a);box-shadow:0 3px 10px rgba(0,0,0,.45),inset 0 0 0 1px rgba(110,70,20,.55)}
#mapUI .mp-label.wp small{display:block;font:600 10px var(--body);letter-spacing:.16em;text-transform:uppercase;color:#7a4a1c}
#mapUI .mp-label.wp.sel{color:#fff4dc;background:linear-gradient(180deg,#8a5a24,#6b4218);box-shadow:0 0 0 2px #ffcf7a,0 4px 14px rgba(0,0,0,.55)}
#mapUI .mp-label.wp.sel small{color:#ffd88a}
#mapUI .mp-label.item{font-size:12.5px;padding:2px 7px 3px}
#mapUI .mp-label.item.done{color:#6c5a5f;font-style:italic}
#mapUI .mp-confirm{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(380px,calc(100% - 32px));display:grid;gap:8px;
  padding:18px 22px 16px;color:#21161f;text-align:center;cursor:default;
  background:linear-gradient(180deg,#efe4cc,#e2d3b3);border-radius:3px;
  box-shadow:0 18px 50px rgba(0,0,0,.6),inset 0 0 0 1px rgba(60,40,30,.25),inset 0 0 0 5px #efe4cc,inset 0 0 0 6px rgba(60,40,30,.35)}
#mapUI .mp-confirm[hidden]{display:none}
#mapUI .mp-confirm .eyebrow{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#6c3f5f}
#mapUI .mp-confirm h3{margin:0;font:400 clamp(22px,3.4vw,28px)/1.1 var(--display)}
#mapUI .mp-confirm p{margin:0;font:italic 400 15px/1.35 var(--serif);color:#4a3438}
#mapUI .mp-confirm.blocked .eyebrow{color:#8a3a2a}
#mapUI .mp-confirm.blocked p{color:#6a2a22;font-style:normal}
#mapUI .mp-cbtns{display:flex;justify-content:center;gap:10px;margin-top:6px}
#mapUI .mp-blocked{position:absolute;left:max(16px,env(safe-area-inset-left,0px));top:calc(118px + env(safe-area-inset-top,0px));max-width:min(340px,calc(100% - 32px));
  padding:7px 12px;font:italic 400 13.5px/1.3 var(--serif);color:#f1e2d8;background:rgba(40,18,16,.72);border-radius:2px;box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:none}
#mapUI .mp-blocked[hidden]{display:none}
body.map-open #hud,body.map-open #toast,body.map-open #saved,body.map-open #pauseBtn,body.map-open .touch,body.map-open #prompt,body.map-open #mapBtn,body.map-open .stick{visibility:hidden!important}
#mapBtn{position:fixed;left:calc(50% - 56px);top:calc(10px + env(safe-area-inset-top,0px));z-index:6;width:44px;height:44px;border-radius:50%;
  border:1px solid rgba(241,233,216,.45);background:rgba(20,15,26,.5);color:var(--bone);display:none;place-items:center;cursor:pointer;
  touch-action:none;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}
@media (pointer:coarse){ #mapBtn:not([hidden]){display:grid} }
#mapBtn:focus-visible{outline:2px solid var(--ether);outline-offset:3px}
@media (max-width:600px){
  #mapUI .mp-compass{width:62px;height:62px}
  #mapUI .mp-plate{padding:9px 14px 10px}
  #mapUI .mp-hints{display:none}
  #mapUI .mp-bar{justify-content:flex-end}
}
`;
const COMPASS=`<svg class="mp-compass" viewBox="0 0 100 100" aria-hidden="true">
  <defs><radialGradient id="mpcw" cx="40%" cy="35%"><stop offset="0" stop-color="#b98a5c"/><stop offset="1" stop-color="#6a4428"/></radialGradient></defs>
  <circle cx="50" cy="50" r="46" fill="url(#mpcw)" stroke="#3a2416" stroke-width="2.5"/>
  <circle cx="50" cy="50" r="38" fill="none" stroke="#3a2416" stroke-width="1" stroke-dasharray="2 3" opacity=".7"/>
  <g stroke="#2a180e" stroke-width="1" stroke-linejoin="round">
    <path d="M50 10 L57 50 L50 46 L43 50Z" fill="#e7c98f"/><path d="M50 90 L57 50 L50 54 L43 50Z" fill="#8a5c36"/>
    <path d="M90 50 L50 57 L54 50 L50 43Z" fill="#a8774a"/><path d="M10 50 L50 57 L46 50 L50 43Z" fill="#a8774a"/>
    <path d="M50 10 L50 46 L43 50Z" fill="#c9a46a"/></g>
  <circle cx="50" cy="50" r="4.5" fill="#d9ae54" stroke="#2a180e"/>
  <text x="50" y="25" text-anchor="middle" font-family="IM Fell English SC,Georgia,serif" font-size="13" fill="#2a180e">N</text>
</svg>`;
const MAP_ICON='<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 4.5l5-2 6 2 5-2v13l-5 2-6-2-5 2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 2.5v13M13 4.5v13" stroke="currentColor" stroke-width="1.4"/></svg>';
let legendOn=false, mapBtn=null, pauseMapBtn=null, hintsEl=null, pctEl=null, legendEl=null, closeBtn=null, legendBtn=null;
function buildUI(){
  const st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
  ui=document.createElement('div'); ui.id='mapUI'; ui.hidden=true; ui.setAttribute('role','dialog'); ui.setAttribute('aria-label','Map of the island');
  ui.innerHTML=`<div class="mp-labels"></div>
    <div class="mp-plate"><span class="eyebrow">The keeper’s chart</span><h2>The Island</h2><span class="mp-pct"></span></div>
    ${COMPASS}
    <div class="mp-legend" hidden><span class="eyebrow">Legend</span>
      <span><i style="background:#d9ae54"></i>You (the arrow shows your heading)</span>
      <span><i style="background:#a56cff;box-shadow:0 0 6px #a56cff"></i>Your objective</span>
      <span><i style="background:#ffc35a;border-radius:2px"></i>Waystone: a place you can travel to</span>
      <span><i style="background:#b48cff;border-radius:2px;transform:rotate(45deg) scale(.8)"></i>A Heart Shard you’ve spotted</span>
      <span><i style="background:#8a5a32;border-radius:2px"></i>A keeper’s cache you’ve spotted</span>
      <span><i style="background:#8d8178;opacity:.7"></i>Faded: already taken</span>
      <span><i style="background:#e7a24b"></i>Alchemy table</span>
      <span><i style="background:#151018"></i>A blight, still choked with ink</span>
      <span><i style="background:#b995ff"></i>A blight you’ve cured</span>
      <span><i style="background:#e8e2ea"></i>Cloud: somewhere you haven’t been yet</span>
      <span class="mp-lit" hidden><i style="background:#6b4b8a"></i>The violet line: how far the light reaches</span></div>
    <div class="mp-blocked" hidden></div>
    <div class="mp-bar"><div class="mp-hints"></div><div class="mp-btns">
      <button type="button" class="mp-btn" data-mp="legend" aria-pressed="false">Legend</button>
      <button type="button" class="mp-btn primary" data-mp="close">Close</button></div></div>`;
  document.body.appendChild(ui);
  labelsEl=ui.querySelector('.mp-labels'); hintsEl=ui.querySelector('.mp-hints'); pctEl=ui.querySelector('.mp-pct'); legendEl=ui.querySelector('.mp-legend');
  closeBtn=ui.querySelector('[data-mp=close]'); legendBtn=ui.querySelector('[data-mp=legend]');
  closeBtn.addEventListener('click',e=>{ e.stopPropagation(); close(); });
  legendBtn.addEventListener('click',e=>{ e.stopPropagation(); toggleLegend(); });
  for(const b of [closeBtn,legendBtn])b.addEventListener('pointerdown',e=>e.stopPropagation());
  for(const r of markers)makeLabel(r);
  buildConfirm();
  wirePointer();
  // the touch map icon beside the pause button
  mapBtn=document.createElement('button'); mapBtn.id='mapBtn'; mapBtn.type='button'; mapBtn.setAttribute('aria-label','Map'); mapBtn.innerHTML=MAP_ICON; mapBtn.hidden=true;
  mapBtn.addEventListener('click',e=>{ e.preventDefault(); open(); }); document.body.appendChild(mapBtn);
  G.on('mode',e=>{ mapBtn.hidden=e.mode!=='play'; });
  // the pause card's Map button
  const acts=document.querySelector('#pause .actions'), resume=$('resume');
  if(acts){ pauseMapBtn=document.createElement('button'); pauseMapBtn.type='button'; pauseMapBtn.className='btn ghost'; pauseMapBtn.id='mapOpen';
    pauseMapBtn.innerHTML='Map'; pauseMapBtn.addEventListener('click',()=>open('pause'));
    if(resume&&resume.parentNode===acts)resume.after(pauseMapBtn); else acts.appendChild(pauseMapBtn); }
  // controls help: keyboard rows + the controller's View button
  const kbRow=()=>{ const s=document.createElement('span'); s.dataset.mapRow='1'; s.innerHTML='<kbd>M</kbd> map'; return s; };
  const k=$('keys'); if(k){ const esc_=[...k.children].find(c=>/pause/.test(c.textContent)); k.insertBefore(kbRow(),esc_||null); }
  document.querySelectorAll('[data-kb-legend]').forEach(el=>el.appendChild(kbRow()));
  addPadRows(); G.on('input:device',addPadRows); G.on('input:pad',addPadRows);
}
function addPadRows(){
  const glyph=n=>G.ui&&G.ui.glyph?G.ui.glyph(n):n;
  const row=()=>{ const s=document.createElement('span'); s.dataset.mapRow='1'; s.innerHTML=`<span class="pad pad-pill" role="img" aria-label="View button">&#10697;</span> map`; return s; };
  document.querySelectorAll('[data-pad-legend] .controls').forEach(el=>{ if(!el.querySelector('[data-map-row]'))el.appendChild(row()); });
  const k=$('keys'); if(k&&k.dataset.mode==='pad'&&!k.querySelector('[data-map-row]')){ const m=[...k.children].find(c=>/pause/.test(c.textContent)); k.insertBefore(row(),m||null); }
  void glyph;
}
function makeLabel(r){
  if(!labelsEl||r.el)return; if(!r.label&&r.kind!=='objective')return;
  const el=document.createElement('div'); el.className='mp-label'+(r.kind==='objective'?' obj':r.kind==='player'?' you':r.kind==='waypoint'?' wp':(r.kind==='shard'||r.kind==='cache')?' item':'');
  el.textContent=r.label; r.el=el; labelsEl.appendChild(el);
}
function toggleLegend(on){ legendOn=on==null?!legendOn:!!on; legendEl.hidden=!legendOn; legendBtn.setAttribute('aria-pressed',String(legendOn)); }
let hintMode='';
function refreshHints(){
  const dev=G.input.device==='gamepad'?'pad':(G.isMobile||G.input.device==='touch')?'touch':'kb';
  if(dev===hintMode)return; hintMode=dev;
  const g=n=>G.ui&&G.ui.glyph?G.ui.glyph(n):n, view='<span class="pad pad-pill" role="img" aria-label="View button">&#10697;</span>';
  if(dev==='pad'){
    hintsEl.innerHTML=`<span>${g('LS')} pan</span><span>${g('LT')} ${g('RT')} zoom</span><span>${g('RS')} tilt</span><span>${g('LB')} ${g('RB')} waystone</span><span>${g('A')} travel</span><span>${g('X')} find yourself</span><span>${g('Y')} legend</span>`;
    closeBtn.innerHTML=`Close ${view}`; legendBtn.innerHTML=`Legend ${g('Y')}`;
    if(cfGo){ cfGo.innerHTML=`Travel ${g('A')}`; cfStay.innerHTML=`Stay ${g('B')}`; }
  }else if(dev==='touch'){
    hintsEl.innerHTML='<span>Drag to pan</span><span>Pinch to zoom</span><span>Tap a waystone to travel</span>';
    closeBtn.innerHTML='Close'; legendBtn.innerHTML='Legend';
    if(cfGo){ cfGo.innerHTML='Travel'; cfStay.innerHTML='Stay'; }
  }else{
    hintsEl.innerHTML='<span>Drag or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> pan</span><span>Scroll or <kbd>+</kbd><kbd>−</kbd> zoom</span><span><kbd>R</kbd><kbd>F</kbd> tilt</span><span>Click a waystone or <kbd>Tab</kbd> <kbd>Enter</kbd> travel</span><span><kbd>C</kbd> find yourself</span>';
    closeBtn.innerHTML='Close <kbd>M</kbd>'; legendBtn.innerHTML='Legend <kbd>L</kbd>';
    if(cfGo){ cfGo.innerHTML='Travel <kbd>Enter</kbd>'; cfStay.innerHTML='Stay <kbd>Esc</kbd>'; }
  }
}

/* ================================================================ 8. CAMERA + INPUT */
const view={x:0,y:0,z:0,dist:30,pitch:.98,tx:0,tz:0,tdist:30,tpitch:.98};
/* the look target rides on the miniature (so zooming in on the headland looks at its top, not into the cliff) */
function groundUnder(mx,mz){ if(!HG)return 0; let m=0; const x=mx/S, z=mz/S;
  for(const [ox,oz] of [[0,0],[-12,0],[12,0],[0,-12],[0,12]])m=Math.max(m,Hg(x+ox,z+oz)); return Math.max(0,m)*VY; }
const DIST={min:9,max:62}, PITCH={min:.72,max:1.25};
function clampView(){ view.tx=clamp(view.tx,BOARD.x0*S+2,BOARD.x1*S-2); view.tz=clamp(view.tz,BOARD.z0*S+2,BOARD.z1*S-2);
  view.tdist=clamp(view.tdist,DIST.min,DIST.max); view.tpitch=clamp(view.tpitch,PITCH.min,PITCH.max); }
function placeCam(){
  cam.aspect=innerWidth/innerHeight; cam.updateProjectionMatrix();
  const cp=Math.cos(view.pitch), sp=Math.sin(view.pitch);
  cam.position.set(view.x,view.y+view.dist*sp,view.z+view.dist*cp); cam.lookAt(view.x,view.y,view.z); cam.updateMatrixWorld();
  _pl.constant=-view.y;
}
function centreOnPlayer(snap){
  const p=playerMapPos()||LM().start||{x:164,z:-4};
  const portrait=innerHeight>innerWidth;
  view.tx=p.x*S-(portrait?0:2.5); view.tz=p.z*S+(portrait?0:1.5); view.tdist=portrait?52:40; view.tpitch=.98; clampView();
  if(snap){ view.x=view.tx; view.z=view.tz; view.dist=view.tdist; view.pitch=view.tpitch; view.y=groundUnder(view.x,view.z)*smooth(40,14,view.dist); }
}
/* screen-space pan: move the target so the board point under the pointer follows it */
const _ray=new THREE.Raycaster(), _pl=new THREE.Plane(new THREE.Vector3(0,1,0),0), _v=new THREE.Vector3(), _v2=new THREE.Vector3();
function boardPoint(cx,cy,out){ _ray.setFromCamera({x:cx/innerWidth*2-1,y:-(cy/innerHeight)*2+1},cam); return _ray.ray.intersectPlane(_pl,out); }
const ptrs=new Map(); let dragLast=null, pinch0=null, moved=0, hoverXY=null, tapXY=null, tapT=0;
function wirePointer(){
  ui.addEventListener('pointerdown',e=>{ if(e.target.closest('.mp-btns')||e.target.closest('.mp-confirm'))return;
    if(confirmW){ hideConfirm(); return; }           // a click on the board outside the card is "stay"
    ui.setPointerCapture&&ui.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); moved=0; dragLast={x:e.clientX,y:e.clientY}; ui.classList.add('drag');
    if(ptrs.size===2){ const [a,b]=[...ptrs.values()]; pinch0={d:Math.hypot(a.x-b.x,a.y-b.y),dist:view.tdist}; } });
  ui.addEventListener('pointermove',e=>{
    hoverXY={x:e.clientX,y:e.clientY};
    if(!ptrs.has(e.pointerId))return; const prev=ptrs.get(e.pointerId); ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size>=2&&pinch0){ const [a,b]=[...ptrs.values()]; const d=Math.hypot(a.x-b.x,a.y-b.y); if(d>10){ view.tdist=pinch0.dist*pinch0.d/d; view.dist=view.tdist; clampView(); view.dist=view.tdist; } moved+=99; return; }
    moved+=Math.abs(e.clientX-prev.x)+Math.abs(e.clientY-prev.y);
    if(boardPoint(prev.x,prev.y,_v)&&boardPoint(e.clientX,e.clientY,_v2)){ view.tx+=_v.x-_v2.x; view.tz+=_v.z-_v2.z; clampView(); view.x=view.tx; view.z=view.tz; placeCam(); }
  });
  const up=e=>{ if(!ptrs.has(e.pointerId))return; ptrs.delete(e.pointerId); if(ptrs.size<2)pinch0=null; if(!ptrs.size)ui.classList.remove('drag');
    if(moved<8&&e.type==='pointerup'){ tapXY={x:e.clientX,y:e.clientY}; tapT=2.5;
      const w=waypointAt(e.clientX,e.clientY); if(w){ select(w,false); askTravel(w); } } };
  ui.addEventListener('pointerup',up); ui.addEventListener('pointercancel',up);
  ui.addEventListener('pointerleave',()=>{ hoverXY=null; });
  ui.addEventListener('wheel',e=>{ e.preventDefault(); const k=Math.exp(clamp(e.deltaY,-120,120)*.0022); view.tdist*=k; clampView(); },{passive:false});
  ui.addEventListener('contextmenu',e=>e.preventDefault());
}
/* the input binding (G.input.pressed('map') works for anyone who wants it; the map itself listens in the capture phase) */
if(G.input&&G.input.BIND&&!G.input.BIND.map)G.input.BIND.map=['KeyM'];
/* keyboard (capture phase, so the game never sees M / Esc while the map handles them) */
addEventListener('keydown',e=>{
  if(e.repeat)return;
  if(e.code==='KeyM'){
    if(M.isOpen){ e.preventDefault(); e.stopPropagation(); close(); return; }
    if(G.state.mode==='play'&&!(G.devtools&&G.devtools.open)){ e.preventDefault(); e.stopPropagation(); open(); return; }
    return;
  }
  if(!M.isOpen)return;
  if(confirmW){ // the travel card has the keys while it's up
    if(e.code==='Enter'||e.code==='NumpadEnter'||e.code==='Space'||e.code==='KeyE'){ e.preventDefault(); e.stopPropagation(); confirmGo(); return; }
    if(e.code==='Escape'||e.code==='Backspace'||e.code==='KeyP'){ e.preventDefault(); e.stopPropagation(); hideConfirm(); return; }
    if(e.code==='Tab'){ e.preventDefault(); e.stopPropagation(); return; }
    return;
  }
  if(e.code==='Tab'){ e.preventDefault(); e.stopPropagation(); cycle(e.shiftKey?-1:1); return; }
  if((e.code==='Enter'||e.code==='NumpadEnter')&&selWp){ e.preventDefault(); e.stopPropagation(); askTravel(selWp); return; }
  if(e.code==='Escape'||e.code==='KeyP'||e.code==='Backspace'){ e.preventDefault(); e.stopPropagation(); close(); return; }
  if(e.code==='KeyL'){ e.preventDefault(); toggleLegend(); return; }
  if(e.code==='KeyC'){ centreOnPlayer(false); return; }
  if(e.code==='Equal'||e.code==='NumpadAdd'){ view.tdist/=1.25; clampView(); return; }
  if(e.code==='Minus'||e.code==='NumpadSubtract'){ view.tdist*=1.25; clampView(); return; }
},true);
const keyHeld=new Set();
addEventListener('keydown',e=>{ if(M.isOpen)keyHeld.add(e.code); },true);
addEventListener('keyup',e=>keyHeld.delete(e.code),true);
addEventListener('blur',()=>keyHeld.clear());
/* the controller, read directly (core gives a paused game's pad to menus; the map has none of core's cards) */
let padPrev=[];
function readPad(){ try{ const s=G.input&&G.input.padState?G.input.padState():null; return s?{buttons:s.B,axes:s.A,connected:true}:null; }catch(_){} return null; } // core picks the pad in use and maps non-standard layouts
function padButtons(g){ const out=[]; if(!g)return out; for(let i=0;i<17;i++){ const b=g.buttons[i]; out[i]=b?(typeof b==='object'?(b.pressed||b.value>.5):b>.5):false; } return out; }
/* core maps View to 'pause' while playing; the frame the map opens on that press, flow.js must not see it (it would resume) */
let swallowPause=false;
(function(){ const I=G.input, op=I.pressed; I.pressed=a=>(a==='pause'&&swallowPause)?false:op.call(I,a); })();
function padPlay(){ // in play: View (8) opens the map
  const g=readPad(); const btn=padButtons(g);
  if(btn[8]&&!padPrev[8]&&G.state.mode==='play'){ padPrev=btn; if(open())swallowPause=true; return; }
  padPrev=btn;
}
function padMap(dt){
  const g=readPad(); if(!g){ padPrev=[]; return; }
  const btn=padButtons(g), edge=i=>btn[i]&&!padPrev[i], ax=i=>clamp(+g.axes[i]||0,-1,1);
  if(confirmW){ // the travel card: A travels, B stays; View / Menu still close the map
    if(edge(0)){ padPrev=btn; confirmGo(); return; }
    if(edge(1)){ padPrev=btn; hideConfirm(); return; }
    if(edge(8)||edge(9)){ padPrev=btn; close(); return; }
    padPrev=btn; return;
  }
  if(edge(8)||edge(1)||edge(9)){ padPrev=btn; close(); return; }
  if(edge(5)||edge(15))cycle(1); if(edge(4)||edge(14))cycle(-1);
  if(edge(0)&&selWp){ padPrev=btn; askTravel(selWp); return; }
  if(edge(3))toggleLegend(); if(edge(2))centreOnPlayer(false);
  const dz=v=>Math.abs(v)<.18?0:(v-Math.sign(v)*.18)/.82;
  const lx=dz(ax(0)), ly=dz(ax(1)), ry=dz(ax(3));
  const sp=view.dist*.9*dt; view.tx+=lx*sp; view.tz+=ly*sp;
  const lt=g.buttons[6]?(+g.buttons[6].value||0):0, rt=g.buttons[7]?(+g.buttons[7].value||0):0;
  view.tdist*=Math.exp((lt-rt)*1.6*dt); view.tpitch+=ry*.9*dt;
  if(btn[12])view.tpitch+=.9*dt; if(btn[13])view.tpitch-=.9*dt;
  clampView(); padPrev=btn;
}
function keysMap(dt){
  const k=c=>keyHeld.has(c); let x=0,z=0;
  if(k('KeyW')||k('ArrowUp'))z-=1; if(k('KeyS')||k('ArrowDown'))z+=1; if(k('KeyA')||k('ArrowLeft'))x-=1; if(k('KeyD')||k('ArrowRight'))x+=1;
  if(x||z){ const sp=view.dist*.85*dt; view.tx+=x*sp; view.tz+=z*sp; }
  if(k('KeyR'))view.tpitch+=.8*dt; if(k('KeyF'))view.tpitch-=.8*dt;
  if(k('KeyQ'))view.tdist*=Math.exp(1.4*dt); if(k('KeyE'))view.tdist*=Math.exp(-1.4*dt);
  clampView();
}

/* ================================================================ 9. OPEN / CLOSE */
const M=G.map={isOpen:false,from:null,addMarker,removeMarker,get markers(){return markers;},discovered,shownAt,reveal,percent,
  revealAll(){ bits.fill(1); recount(); dirtyTex=true; },
  reset(){ bits.fill(0); seen.fill(0); nBits=0; dirtyTex=true; },
  get view(){return view;}, get scene(){return scene;}, get camera(){return cam;},
  /** fast travel: markers with travel:true (the unlocked waystones shown on the chart) */
  travelTargets:()=>markers.filter(m=>m.travel&&(!m.wp||wpShown(m.wp))),
  /** the waystones: [{id,name,unlocked,shown,isNew}] */
  get waypoints(){ return WAYPOINTS.map(w=>({id:w.id,name:w.name,unlocked:!!wpOn[w.id],shown:wpShown(w),isNew:!!wpNew[w.id]})); },
  travelBlock:id=>travelBlock(id),
  /** travel now (the confirm card is the player's way in; this is for tools/tests). force skips the checks. */
  travel:(id,o)=>{ const w=WP_BY[id]; return w?startTravel(w,o||{}):false; },
  get traveling(){ return TR.on; },
  /** companions.js (Corvin's scouting): pin a collectible / companion spot on the chart (ids 'shard:x', 'cache:x', 'comp:x') */
  markSeen:id=>{ if(id)seenC[id]=1; }, isSeen:id=>!!seenC[id],
  ask:id=>{ const w=WP_BY[id]; if(!w||!M.isOpen)return false; select(w,true); return askTravel(w); },
  get confirming(){ return confirmW?confirmW.id:null; }, get selected(){ return selWp?selWp.id:null; },
  debug:{retro,pack:()=>pack(bits),get cells(){return nBits;},grid:{nx:NX,nz:NZ,x0:B.x0,z0:B.z0,cw:CW,cd:CD},get buildMs(){return buildMs;},puffs:0,
    state:id=>{ const r=byId[id]; if(!r)return null; const p=posOf(r); return {shown:!!r.shownNow,label:r.el?r.el.classList.contains('on'):false,
      pos:p?[+(+p.x).toFixed(2),+(+p.z).toFixed(2)]:null,mesh:r.group?[+r.group.position.x.toFixed(3),+r.group.position.z.toFixed(3)]:null,screen:r.screen}; },
    get revealing(){return revealT>=0;}, upload:()=>uploadField(true),
    lastBlock:null, get wpOn(){ return wpOn; }, get wpNew(){ return wpNew; }, get seen(){ return seenC; }, standFor:id=>standFor(WP_BY[id]), unlock:(id,o)=>unlockWp(WP_BY[id],o||{}), cycle:d=>{ const w=cycle(d||1); return w&&w.id; },
    /** devtools start points: forget waystones + spotted collectibles, then grant what the (new) quest state implies */
    resetWaypoints(){ for(const o of [wpOn,wpNew,seenC])for(const k in o)delete o[k]; selWp=null; retroWaypoints(); },
    get TR(){ return TR; }}
};
let savedBloom=null, lastReal=0, wasLocked=false;
function open(from){
  if(M.isOpen||TR.on)return false;
  const mode=G.state.mode;
  if(from==='pause'){ if(mode!=='paused')return false; }
  else if(from==='bare'){ if(mode!=='paused')return false; from='play'; } // paused with no card up (e.g. the test tools just closed): closing resumes play
  else{ if(mode!=='play')return false; from='play'; }
  if(G.devtools&&G.devtools.open)return false;
  if(!built){ try{ build(); }catch(e){ console.error('map build',e); return false; } }
  syncDynamic();
  M.from=from; M.isOpen=true; wasLocked=document.pointerLockElement!=null;
  if(from==='play'){ G.setMode('paused'); G.input.unlockPointer(); }
  else { const pc=$('pause'); if(pc)pc.hidden=true; }
  // what changed since you last looked rolls back now
  let changed=false; for(let k=0;k<bits.length;k++)if(bits[k]&&seen[k]<1){ changed=true; break; }
  revealT=changed?0:-1; uploadField(true);
  ui.hidden=false; document.body.classList.add('map-open'); hintMode=''; refreshHints(); toggleLegend(false);
  pctEl.textContent=percent()+'% of the island charted';
  centreOnPlayer(true); placeCam();
  if(G.bloom){ savedBloom={t:G.bloom.threshold,s:G.bloom.strength,r:G.bloom.radius}; G.bloom.threshold=.9; G.bloom.strength=.55; G.bloom.radius=.45; }
  spot.castShadow=G.quality.level!=='saver';
  lastReal=performance.now(); padPrev=padButtons(readPad()); keyHeld.clear();
  try{ closeBtn.focus({preventScroll:true}); }catch(_){}
  selWp=null; hideConfirm(true); refreshBlocked(true);
  if(G.headless)G.headless.draw(3);
  G.emit('map:open',{from});
  return true;
}
function close(silent){
  if(!M.isOpen)return false;
  hideConfirm(true); selWp=null;
  for(const id in wpNew)delete wpNew[id];           // you've looked: the new waystones stop pulsing
  M.isOpen=false; ui.hidden=true; document.body.classList.remove('map-open');
  seen.set(bits); revealT=-1; uploadField(true);
  if(G.bloom&&savedBloom){ G.bloom.threshold=savedBloom.t; G.bloom.strength=savedBloom.s; G.bloom.radius=savedBloom.r; }
  for(const r of markers)if(r.el)r.el.classList.remove('on');
  const from=M.from; M.from=null;
  if(!silent){
    if(from==='pause'){ const pc=$('pause'); if(pc)pc.hidden=false; if(pauseMapBtn)try{pauseMapBtn.focus();}catch(_){} }
    else if(G.state.mode==='paused'){ G.setMode('play'); if(!G.isMobile)G.input.lockPointer(); }
  }
  if(G.headless)G.headless.draw(2);
  G.emit('map:close',{});
  return true;
}
M.open=()=>{ const pc=$('pause'); return open(G.state.mode==='paused'?(pc&&!pc.hidden?'pause':'bare'):undefined); };
M.close=()=>close(); M.toggle=()=>M.isOpen?close():M.open();

/* while open, the main renderer draws the map scene instead of the world */
(function wrapRender(){
  const R=G.renderer; if(!R||R._bqMap)return; const orig=R.render;
  R.render=function(sc,ca){ if(M.isOpen&&built&&sc===G.scene)return orig.call(this,scene,cam); return orig.call(this,sc,ca); };
  R._bqMap=true;
})();
addEventListener('resize',()=>{ if(M.isOpen&&cam)placeCam(); });

/* ================================================================ 10. PER-FRAME */
const _pv=new THREE.Vector3();
function project(x,y,z){ _pv.set(x,y,z).project(cam); return {x:(_pv.x*.5+.5)*innerWidth,y:(-_pv.y*.5+.5)*innerHeight,on:_pv.z<1&&Math.abs(_pv.x)<1.1&&Math.abs(_pv.y)<1.1}; }
let pulse=0;
function updateOpen(dt){
  uni.uTime.value+=dt; pulse+=dt;
  if(revealT>=0){ revealT+=dt; if(revealT>=revealDur){ revealT=-1; seen.set(bits); } uploadField(true); }
  else if(dirtyTex){ uploadField(true); pctEl.textContent=percent()+'% of the island charted'; }
  keysMap(dt); padMap(dt); refreshHints();
  // ease the view
  const k=1-Math.exp(-10*dt); view.x=lerp(view.x,view.tx,k); view.z=lerp(view.z,view.tz,k); view.dist=lerp(view.dist,view.tdist,k); view.pitch=lerp(view.pitch,view.tpitch,k);
  view.y=lerp(view.y,groundUnder(view.x,view.z)*smooth(40,14,view.dist),1-Math.exp(-4*dt));
  placeCam();
  // the lighthouse lamp and the light's reach
  const cured=!!(G.lighthouse&&G.lighthouse.cured);
  lampMat.emissive.copy(col(cured?'#ffb24a':'#5a3a9a')); lampMat.emissiveIntensity=cured?1.5+Math.sin(pulse*2.2)*.12:.5;
  lampGlow.material.color.copy(col(cured?'#ffc06a':'#8a5cff')); lampGlow.material.opacity=cured?.8:.35;
  const lit=!!(G.lamp&&G.lamp.active&&G.fog);
  uni.uFogOn.value=lit?1:0; if(lit){ uni.uFogR.value=G.fog.radius*S; uni.uFogC.value.set(G.fog.centre.x*S,G.fog.centre.z*S); }
  const li=ui.querySelector('.mp-lit'); if(li)li.hidden=!lit;
  for(const s of glowSprites){ s.material.opacity=.32*smooth(.4,.8,shownAt(s.userData.anchor[0],s.userData.anchor[1]))*(.85+Math.sin(pulse*1.3)*.15); }
  if(caveArch)caveArch.visible=!!(G.caveBoss&&G.caveBoss.discovered);
  updateMarkers(dt);
  refreshBlocked();
  if(tapT>0){ tapT-=dt; if(tapT<=0)tapXY=null; }
}
function updateMarkers(){
  const zs=clamp(view.dist/30,.8,1.9);          // pins grow as you zoom out so they stay readable
  const closeZoom=view.dist<19;
  const pt=hoverXY||tapXY; let nearest=null, nd=34;
  for(const r of markers){
    const p=posOf(r); let vis=!!p;
    if(vis){ try{ vis=r.visible?!!r.visible():true; }catch(_){ vis=false; } }
    let x=0,z=0;
    if(vis){ x=+p.x; z=+p.z; if(!isFinite(x)||!isFinite(z))vis=false; }
    const under=vis&&!r.always&&shownAt(x,z)<.5;   // still under cloud: hidden
    if(under)vis=false;
    r.shownNow=vis;
    let y=0;
    if(vis){
      y=terraceY(x,z);
      if(r.kind==='objective'&&shownAt(x,z)<.5)y+=4.2;       // over the clouds: it rides on top of them
      if(r.kind==='lighthouse')y+=5.4;
    }
    if(r.group){
      r.group.visible=vis;
      if(vis){ r.group.position.set(x*S,y,z*S); let s=zs;
        if(r.kind==='objective'){ s*=1+Math.sin(pulse*4)*.08; objMat.emissiveIntensity=.55+Math.sin(pulse*4)*.35; }
        if(r.kind==='player'){ s*=1.1; const P=G.player; r.group.rotation.y=(P&&P.heading)||0; }
        if(r.kind==='waypoint'){ const isNew=!!wpNew[r.wp.id], sel=r===selRec();
          if(isNew)s*=1+Math.sin(pulse*5)*.1; if(sel)s*=1.18;
          if(r.ring){ r.ring.material.opacity=sel?.85:isNew?.45+Math.sin(pulse*5)*.35:0; r.ring.scale.setScalar(sel?1.15:isNew?1+((pulse*.9)%1)*.6:1); } }
        if(r.item){ const done=r.item.done(); if(r.mesh.material!==(done?dimMat:r.baseMat))r.mesh.material=done?dimMat:r.baseMat; if(done)s*=.78;
          if(!done&&r.kind==='shard')r.mesh.rotation.y=pulse*.8; }
        r.group.scale.setScalar(s);
        if(r.curedMesh){ const c=!!(r.blight&&r.blight.cured); r.curedMesh.visible=c; r.mesh.visible=!c; r.group.children[1].visible=!c; }
      }
    }
    if(r.el){
      if(!vis){ r.el.classList.remove('on'); r.screen.on=false; continue; }
      const top=y+(r.pin!==false?(r.kind==='player'?.9:1.45)*zs:.9);
      const s=project(x*S,top,z*S); r.screen={x:Math.round(s.x),y:Math.round(s.y),on:s.on};
      if(r.kind==='objective'){ const nm=(G.quest&&G.quest.targetName)||'Objective'; const html='<small>Objective</small>'+esc(nm);
        if(r.el.innerHTML!==html)r.el.innerHTML=html; }
      if(r.kind==='waypoint'){ const html='<small>'+(wpNew[r.wp.id]?'New · ':'')+'Waystone</small>'+esc(r.label); if(r.el.innerHTML!==html)r.el.innerHTML=html;
        r.el.classList.toggle('sel',r===selRec()); }
      if(r.item){ const done=r.item.done(), t=done?r.item.doneLabel:r.label; if(r.el.textContent!==t)r.el.textContent=t; r.el.classList.toggle('done',done); }
      r.el.style.transform=`translate(${s.x}px,${s.y}px) translate(-50%,-100%) translateY(-6px)`;
      if(r.kind==='waypoint'){ const b=project(x*S,y+.2*zs,z*S); r.base={x:Math.round(b.x),y:Math.round(b.y)}; }
      if(pt){ const d=Math.hypot(s.x-pt.x,s.y-pt.y); if(d<nd){ nd=d; nearest=r; } }
      r._want=s.on&&(r.kind==='objective'||closeZoom&&r.kind!=='player'||r.kind==='player'&&view.dist<14||
        r.kind==='waypoint'&&(view.dist<34||r===selRec()||!!wpNew[r.wp.id]));
    }
  }
  for(const r of markers){ if(!r.el||!r.shownNow)continue; r.el.classList.toggle('on',!!(r._want||r===nearest)); }
}
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

/* ================================================================ 11. WAYPOINTS + FAST TRAVEL
   A waystone unlocks when you walk within `r` m of its anchor (the sea cave: the first time you go in). You arrive on a
   checked standing spot (standFor) near `stand`, facing `yaw` (heading convention: facing (sin yaw, 0, cos yaw)). */
const WAYPOINTS=[
  {id:'lighthouse',name:'The Lighthouse',home:true,anchor:()=>{ const d=G.world.lighthouse&&G.world.lighthouse.doorOut; return d?{x:d.x-3.5,z:d.z}:{x:171,z:0}; },
    stand:[170,1.5,PI/2],r:8,blurb:'The apron outside the tower door.'},
  {id:'cottage',name:'The Keeper’s Cottage',anchor:()=>{ const c=LM().cottageDoor||{x:155.8,z:20.8}; return {x:c.x-1.1,z:c.z-1.6}; },
    stand:[154,18.2,.61],r:6,blurb:'The doorstep, under the warm windows.'},
  {id:'cliffpath',name:'The Foot of the Cliff Path',anchor:()=>{ const c=LM().cliffPathBottom||{x:95,z:12}; return {x:c.x-3,z:c.z-1.5}; },
    stand:[91.5,10.2,PI/2],r:8,blurb:'Where the switchbacks meet the moor.'},
  {id:'stones',name:'The Standing Stones',anchor:()=>{ const s=LM().stones||{x:40,z:-35}; return {x:s.x,z:s.z}; },
    stand:[30,-42,.96],r:12,blurb:'Just outside the old ring of stones.'},
  {id:'hamlet',name:'The Hamlet Road',anchor:()=>({x:6,z:16}),stand:[6,16,-1.08],r:8,blurb:'The trail into the ruined hamlet, short of its broken walls.'},
  {id:'tree',name:'The Resisting Tree',anchor:()=>({x:-150,z:7}),stand:[-149,7,-1.69],r:9,blurb:'The edge of the old tree’s clearing.'},
  {id:'cave',name:'The Sea Cave',cave:true,anchor:()=>LM().caveMouth||{x:181.2,z:52.4},r:0,blurb:'Just inside the cave’s mouth, above the tide.'},
  // UNDERCROFT hook (Place agent): unlocks on first entry; travels via undercroft.js's own way in (G.undercroft.enter)
  {id:'undercroft',name:'The Undercroft',undercroft:true,anchor:()=>LM().undercroftDoor||{x:-8.6,z:37.6},r:0,blurb:'The foot of the trapdoor stair, under the hamlet.'},
  // TEMPLE hook (Place agent, TEMPLE.md): unlocks on first entry; travels via temple.js's own way in (G.temple.enter)
  {id:'temple',name:'The Vigil',temple:true,anchor:()=>LM().vigilDoor||{x:-195,z:2},r:0,blurb:'The foot of the Stair of Watchers, under the old wood.'}
];
const WP_BY=Object.fromEntries(WAYPOINTS.map(w=>[w.id,w]));
const wpOn={}, wpNew={};
let wpRetroPending=false, selWp=null, confirmW=null, firstTaught=false;
const loopOn=()=>!!(G.loop&&G.loop.active);
/** a waystone is on the chart: unlocked (and the cave only while the cave exists: the core loop) */
const wpShown=w=>!!wpOn[w.id]&&(!w.cave||(loopOn()&&!!G.cave))&&(!w.undercroft||(!!G.undercroft&&G.undercroft.open))&&(!w.temple||(!!G.temple&&G.temple.open));
const ucInside=()=>!!(G.undercroft&&G.undercroft.inside);
const tpInside=()=>!!(G.temple&&G.temple.inside);
function addWaypointMarkers(){
  for(const w of WAYPOINTS){
    const pos=w.cave?(()=>{ const m=LM().caveMouth; return m?{x:m.x,z:m.z+4.2}:null; }):w.undercroft?(()=>{ const a=w.anchor(); return {x:a.x+2.4,z:a.z-1.4}; }):w.temple?(()=>{ const a=w.anchor(); return {x:a.x+3.2,z:a.z+2.2}; }):(()=>{ const a=w.anchor(); return {x:a.x,z:a.z}; })();
    addMarker({id:'wp:'+w.id,kind:'waypoint',label:w.name,pos,travel:true,wp:w,visible:()=>wpShown(w)});
  }
}
const recOf=w=>w?byId['wp:'+w.id]:null;
const selRec=()=>recOf(selWp);
function unlockWp(w,o={}){
  if(!w||wpOn[w.id])return false;
  wpOn[w.id]=1;
  if(!o.quiet){
    wpNew[w.id]=1;
    const key=G.input&&G.input.device==='gamepad'?'the View button':(G.isMobile||(G.input&&G.input.device==='touch'))?'the map button':'M';
    const teach=!firstTaught&&!G.flag('wpTaught');
    if(teach){ firstTaught=true; G.flag('wpTaught',true); }
    const line=teach?`${w.name}: a waystone is marked on your chart. Open the map (${key}) and choose any waystone you’ve found to travel back to it.`
                    :`${w.name}: a waystone is marked on your chart.`;
    try{ G.ui.say(line,{priority:'low',key:'wp:'+w.id}); }catch(_){}
  }
  G.emit('map:waypoint',{id:w.id,quiet:!!o.quiet});
  return true;
}
/** walking up to a waystone unlocks it (not mid-boss: the caption waits until the fight is over) */
function visitWaypoints(){
  const P=G.player; if(!P||!P.pos||!P.alive||G.state.mode!=='play')return;
  if(G.cave&&G.cave.inside){ if(loopOn()&&WP_BY.cave)unlockWp(WP_BY.cave); return; }
  if(ucInside()){ if(WP_BY.undercroft)unlockWp(WP_BY.undercroft); return; }
  if(tpInside()){ if(WP_BY.temple)unlockWp(WP_BY.temple); return; }
  if(bossFight())return;
  for(const w of WAYPOINTS){ if(wpOn[w.id]||w.cave||w.undercroft||w.temple)continue;
    const a=w.anchor(); if(Math.hypot(P.pos.x-a.x,P.pos.z-a.z)<w.r&&Math.abs(P.pos.y-G.world.height(a.x,a.z))<6)unlockWp(w,{quiet:!!w.home}); }
}
/* what a save already shows you've stood at (old saves, devtools start points): silent, additive */
function retroWaypoints(){
  const q=(G.quest&&G.quest.step)||'', L=G.items.lantern||{}, PR=G.progress, ps=(PR&&PR.state)||{shards:{},caches:{}};
  const stag=!!(G.flow&&G.flow.stagDead), cured=!!(G.lighthouse&&G.lighthouse.cured), loop=loopOn(), done=!!(G.flow&&G.flow.bossDead);
  const g=id=>unlockWp(WP_BY[id],{quiet:true});
  g('lighthouse');
  if(G.items.cloak&&G.items.cloak.owned)g('cottage');
  if(ACT1_WEST.includes(q)||L.found||stag||cured||done||loop){ g('cliffpath'); g('hamlet'); }   // the road west runs past both
  if(L.found||stag)g('tree');                                                              // you stood in its roots
  if(ps.shards.stones||ps.caches.stones)g('stones');
  if(loop&&G.cave&&(G.cave.inside||(G.caveBoss&&G.caveBoss.defeated)||G.flag('undertowDead')||(G.cave.litRooms&&G.cave.litRooms.length)))g('cave');
  const UC=G.undercroft; if(UC&&UC.open&&(UC.inside||(UC.litRooms&&UC.litRooms.length)||(UC.reached&&UC.reached().length)))g('undercroft');
  const TPL=G.temple; if(TPL&&TPL.open&&(TPL.inside||(TPL.litRooms&&TPL.litRooms.length)||(TPL.reached&&TPL.reached().length)))g('temple');
  // a shard you took or a cache you opened: you've certainly seen it
  for(const id in ps.shards)seenC['shard:'+id]=1; for(const id in ps.caches)seenC['cache:'+id]=1;
}

/* ---------- what stops you ---------- */
const dist2D=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function bossFight(){
  const P=G.player, B=G.monsters&&G.monsters.boss;
  if(B&&B.alive!==false&&!B.dying&&B.pos&&P&&P.pos&&dist2D(B.pos,P.pos)<90)return 'stag';
  if(G.finaleBoss&&G.finaleBoss.active)return 'gloaming';
  const CB=G.caveBoss; if(CB&&!CB.defeated&&CB.state&&CB.state!=='sunk'&&CB.state!=='dead')return 'undertow';
  if(ucBoss&&ucInside())return 'crane';
  if(tpBoss&&tpInside())return 'answer';
  return null;
}
const HUNT=new Set(['chase','windup','attack','recover','hurt','hunt','sweep','stomp','charge','summon']);
function hunted(){
  const P=G.player, list=(G.monsters&&G.monsters.list)||[];
  for(const m of list){ if(!m||!m.alive||m.dying||m.boss||!m.pos)continue; if(!HUNT.has(m.state))continue;
    if(dist2D(m.pos,P.pos)<30&&Math.abs(m.pos.y-P.pos.y)<12)return m; }
  return null;
}
function fogged(p){ // the destination lies beyond the light's edge (core loop)
  const F=G.fog, Lm=G.lamp; if(!F||!Lm||!Lm.active||!F.centre||!isFinite(F.radius))return false;
  return Math.hypot(p.x-F.centre.x,p.z-F.centre.z)>F.radius-4;
}
/** why you can't set off at all right now (null: you can) — the same for every waystone */
function departBlock(){
  const P=G.player, L=G.items.lantern||{}, T=G.items.storm||{}, q=(G.quest&&G.quest.step)||'';
  if(TR.on)return 'You’re already on your way.';
  if(!P||!P.pos||P.alive===false)return 'Not now.';
  const boss=bossFight();
  if(boss==='stag')return 'The Hollow Stag won’t let you slip away. Not while it stands.';
  if(boss==='gloaming')return 'The Gloaming is at the lighthouse. You can’t leave the light now.';
  if(boss==='undertow')return 'The Undertow has you. There’s no slipping away mid-fight.';
  if(boss==='crane')return 'Aldous Crane is reciting your name. There’s no slipping away mid-fight.';
  if(boss==='answer')return 'Something is coming up through the seam. You can’t leave her now.';
  if(['cure','descend','finale'].includes(q)&&!(G.flow&&G.flow.bossDead))return 'Not now. Something is climbing the cliff toward the lighthouse.';
  const R=G.cavePuzzles&&G.cavePuzzles.raft;
  if(R&&R.lantern&&R.state!=='done')return R.state==='arrived'?'Hesper’s lantern is still on the raft. Take it off first.':'Hesper’s lantern is riding the raft. See it down the channel first.';
  if(L.found&&L.carried&&!L.cured&&!(G.lighthouse&&G.lighthouse.cured))return 'The moths are following Hesper’s lantern, and they can’t follow you through a map. Carry it there on foot.';
  if(T.inCradle&&!T.failed)return 'Not now. Watch the little flame.';
  const sw=(G.moths&&G.moths.swarm)|0;
  if(sw>=5){ const jar=!!(G.moths.jar&&G.moths.jar.owned); return 'The swarm is following your light, and moths can’t follow you through a map. '+(jar?'Gather them into the jar, or walk them there.':'Walk them there.'); }
  if(hunted())return 'Something is hunting you. Shake it off first.';
  if(G.progress&&G.progress.busy)return 'Not just now.';
  const ct=(G.cave&&G.cave._debug&&G.cave._debug.S&&G.cave._debug.S.trans)||(G.undercroft&&G.undercroft._debug&&G.undercroft._debug.S.trans)||(G.temple&&G.temple._debug&&G.temple._debug.S.trans);
  if(P.inputEnabled===false||ct)return 'Not just now.';
  if(P.grounded===false||P.gliding)return 'Find your feet first.';
  return null;
}
const HERE='You’re already here.';
let ucBoss=false;   // the Tithe-Keeper's fight is on (undercroft:bossStart .. bossDead / your death / leaving)
let tpBoss=false;   // the Answer's fight is on (temple:bossStart .. bossDead / your death / leaving)
/** why you can't travel to w right now (null: you can): departure first, then the destination */
function travelBlock(w){
  if(typeof w==='string')w=WP_BY[w];
  if(!w)return 'There’s no such place on the chart.';
  if(!wpShown(w))return 'You haven’t found the way there yet.';
  const d=departBlock(); if(d)return d;
  const P=G.player;
  if(w.cave){
    if(!loopOn()||!G.cave||!G.cave.enter)return 'The sea cave can’t be reached now.';
    if(G.cave.inside&&G.cave.room&&G.cave.room(P.pos)==='mouth')return HERE;
    return null;
  }
  if(w.undercroft){
    if(!G.undercroft||!G.undercroft.open||!G.undercroft.enter)return 'The Undercroft can’t be reached now.';
    if(ucInside()&&G.undercroft.room(P.pos)==='stair')return HERE;
    return null;
  }
  if(w.temple){
    if(!G.temple||!G.temple.open||!G.temple.enter)return 'The Vigil can’t be reached now.';
    if(tpInside()&&G.temple.room(P.pos)==='vestibule')return HERE;
    return null;
  }
  if(w.id==='tree'&&!(G.flow&&G.flow.stagDead)&&!loopOn())return 'The Hollow Stag stands over the old tree. You’ll have to walk in.';
  const s=standFor(w);
  if(!s)return 'There’s nowhere safe to stand there right now.';
  if(fogged(s))return `The fog has closed over ${w.name}. Feed the light to win it back.`;
  if(!(G.cave&&G.cave.inside)&&!ucInside()&&!tpInside()&&dist2D(s,P.pos)<14)return HERE;
  return null;
}

/* ---------- where you land: a dry, open, level spot near the waystone ---------- */
function standOK(x,z){
  try{
    if(!G.world.walkable(x,z))return null;
    const h=G.world.height(x,z), f=G.floorAt(x,z,h+2.5);
    if(!isFinite(f)||Math.abs(f-h)>.35)return null;                  // on the ground (not a roof, a perch or a ledge)
    if(f<((G.world.tide)||0)+.4||h<.4)return null;                   // above the sea at any tide
    for(const [dx,dz] of [[.8,0],[-.8,0],[0,.8],[0,-.8]])if(Math.abs(G.world.height(x+dx,z+dz)-h)>.55)return null; // level enough
    const rad=(G.player&&G.player.radius)||.38;
    const p={x,y:f,z}; G.moveCharacter(p,.01,0,rad+.15,'travel'); if(Math.hypot(p.x-x-.01,p.z-z)>.03)return null; // not inside a collider
    let open=0; for(let k=0;k<8;k++){ const a=k/8*TAU, q={x,y:f,z}; const r=G.moveCharacter(q,Math.cos(a)*1.2,Math.sin(a)*1.2,rad,'travel');
      if(!r.blocked&&Math.hypot(q.x-x,q.z-z)>1)open++; }
    return open>=6?f:null;
  }catch(e){ return null; }
}
function standFor(w){
  if(!w||w.cave||w.undercroft||w.temple)return null;
  const [sx,sz,yaw]=w.stand;
  for(let rr=0;rr<=7;rr+=.75){ const n=rr?Math.max(6,Math.round(rr*5)):1;
    for(let k=0;k<n;k++){ const a=k/n*TAU, x=sx+Math.cos(a)*rr, z=sz+Math.sin(a)*rr, f=standOK(x,z); if(f!=null)return {x,y:f,z,yaw}; } }
  return null;
}

/* ---------- choosing in the open map ---------- */
function travelList(){ return WAYPOINTS.filter(wpShown); }
function select(w,pan){
  selWp=w||null; if(!w||!pan)return;
  const r=recOf(w), p=r&&posOf(r); if(!p)return;
  const portrait=innerHeight>innerWidth; view.tx=p.x*S-(portrait?0:1.5); view.tz=p.z*S+(portrait?0:1); view.tdist=Math.min(view.tdist,34); clampView();
}
function cycle(dir){
  const L=travelList(); if(!L.length)return null;
  let i=selWp?L.indexOf(selWp):-1;
  if(i<0){ // start from the waystone nearest to you
    const P=playerMapPos()||{x:0,z:0}; let best=0,bd=1e9; L.forEach((w,k)=>{ const p=posOf(recOf(w))||{x:0,z:0}; const d=Math.hypot(p.x-P.x,p.z-P.z); if(d<bd){bd=d;best=k;} });
    i=dir>0?best:best+1; }
  i=((i+dir)%L.length+L.length)%L.length;
  select(L[i],true); return L[i];
}
function waypointAt(cx,cy){
  let best=null, bd=30;
  for(const r of markers){ if(r.kind!=='waypoint'||!r.shownNow||!r.travel)continue;
    for(const s of [r.screen,r.base]){ if(!s)continue; const d=Math.hypot(s.x-cx,s.y-cy); if(d<bd){ bd=d; best=r.wp; } }
    if(r.el&&r.el.classList.contains('on')){ const b=r.el.getBoundingClientRect(); if(cx>=b.left-4&&cx<=b.right+4&&cy>=b.top-4&&cy<=b.bottom+4&&!best)best=r.wp; } }
  return best;
}

/* ---------- the confirm card ---------- */
let cfEl=null, cfGo=null, cfStay=null, cfTitle=null, cfWhy=null, cfEye=null, blockedEl=null, blockedT=0;
function buildConfirm(){
  cfEl=document.createElement('div'); cfEl.className='mp-confirm'; cfEl.hidden=true; cfEl.setAttribute('role','alertdialog'); cfEl.setAttribute('aria-modal','true');
  cfEl.innerHTML=`<span class="eyebrow">Fast travel</span><h3 id="mpcfT"></h3><p class="mp-why"></p>
    <div class="mp-cbtns"><button type="button" class="mp-btn" data-mp="stay">Stay</button><button type="button" class="mp-btn primary" data-mp="go">Travel</button></div>`;
  cfEl.setAttribute('aria-labelledby','mpcfT');
  ui.appendChild(cfEl);
  cfGo=cfEl.querySelector('[data-mp=go]'); cfStay=cfEl.querySelector('[data-mp=stay]'); cfTitle=cfEl.querySelector('h3'); cfWhy=cfEl.querySelector('.mp-why'); cfEye=cfEl.querySelector('.eyebrow');
  cfGo.addEventListener('click',e=>{ e.stopPropagation(); confirmGo(); });
  cfStay.addEventListener('click',e=>{ e.stopPropagation(); hideConfirm(); });
  cfEl.addEventListener('pointerdown',e=>e.stopPropagation());
  blockedEl=ui.querySelector('.mp-blocked');
}
/** open the card for w: "Travel to X?" — or, when something stops you, the reason and only a way back */
function askTravel(w){
  if(!w||!cfEl)return false;
  const why=travelBlock(w);
  confirmW=w; cfEl.hidden=false; cfEl.classList.toggle('blocked',!!why);
  cfEye.textContent=why?'You can’t travel now':'Fast travel';
  cfTitle.textContent=why?w.name:'Travel to '+w.name+'?';
  cfWhy.textContent=why||w.blurb||'';
  cfGo.hidden=!!why;
  hintMode=''; refreshHints(); if(why)cfStay.innerHTML=cfStay.innerHTML.replace(/^Stay/,'Back');
  try{ (why?cfStay:cfGo).focus({preventScroll:true}); }catch(_){}
  M.debug.lastBlock=why||null;
  G.emit('map:ask',{id:w.id,blocked:why||null});
  return !why;
}
function hideConfirm(quiet){
  if(!cfEl)return; const was=!!confirmW; confirmW=null; cfEl.hidden=true;
  if(was&&!quiet&&M.isOpen)try{ closeBtn.focus({preventScroll:true}); }catch(_){}
}
function confirmGo(){ const w=confirmW; if(!w)return false; const why=travelBlock(w); if(why){ askTravel(w); return false; } hideConfirm(true); return startTravel(w); }
/** a quiet line under the title plate when nothing can be travelled to right now (the departure reason) */
function refreshBlocked(force){
  if(!blockedEl)return; blockedT-=1; if(!force&&blockedT>0)return; blockedT=15;
  const why=travelList().length?departBlock():null;
  blockedEl.hidden=!why; if(why)blockedEl.textContent='Fast travel: '+why;
}

/* ---------- the journey: fade out, move, settle the camera, fade in ---------- */
const TR={on:false,t:0,w:null,moved:false,shown:false,last:0,din:.55,hold:.22,dout:.6};
const reduceMotion=()=>{ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; } };
function startTravel(w,o={}){
  if(TR.on)return false;
  if(!o.force){ const why=travelBlock(w); if(why)return false; }
  const rm=reduceMotion();
  Object.assign(TR,{on:true,t:0,w,moved:false,shown:false,last:performance.now(),din:rm?.05:.55,hold:rm?.12:.22,dout:rm?.1:.6});
  const f=$('fade'); if(f){ TR.prevTrans=f.style.transition; f.style.transition=`opacity ${TR.din}s ease-in`; f.style.opacity='1'; }
  if(M.isOpen)close(true);                      // the chart folds away under the black; the game stays paused until you land
  if(G.state.mode==='play')G.setMode('paused');
  try{ G.player.setControl&&G.player.setControl(false); }catch(_){}
  G.emit('map:travel',{id:w.id,phase:'start'});
  return true;
}
function arrive(w){
  const P=G.player;
  if(tpInside()&&!w.temple&&G.temple.exit){ const TS=G.temple._debug&&G.temple._debug.S; if(TS)TS.trans=null; G.temple.exit({instant:true}); } // the Vigil's own way out first
  if(w.temple){
    G.temple.enter('vestibule',{instant:true});              // temple.js's own way in (leaves the sea cave or the Undercroft first)
  }
  else if(w.undercroft){
    G.undercroft.enter('stair',{instant:true});              // undercroft.js's own way in (leaves the sea cave first if you're in it)
  }
  else if(w.cave){
    if(ucInside()&&G.undercroft.exit)G.undercroft.exit({instant:true});
    G.cave.enter('mouth',{instant:true});                    // cave.js's own way in: checkpoint, swarm, darkness
    // cave.js lands you at the seaward edge of the mouth (knee-deep at high tide); travel sets you down on dry sand further in
    const C=G.cave, O=C.origin, wl=C.water();
    if(P.pos.y-O.y<wl+.15&&C.floorVis){ for(let z=P.pos.z-O.z;z>-23;z-=.5){ const f=C.floorVis(0,z);
      if(isFinite(f)&&f>=wl+.2&&C.room(new THREE.Vector3(O.x,O.y+f,O.z+z))==='mouth'){ P.teleport(O.x,O.y+f,O.z+z,PI); break; } } }
  }
  else{
    if(G.cave&&G.cave.inside&&G.cave.exit)G.cave.exit({instant:true}); // cave.js's own way out (restores the island checkpoint)
    if(ucInside()&&G.undercroft.exit)G.undercroft.exit({instant:true}); // likewise the Undercroft's
    const s=standFor(w)||{x:w.stand[0],y:G.floorAt(w.stand[0],w.stand[1]),z:w.stand[1],yaw:w.stand[2]};
    P.teleport(s.x,s.y,s.z,s.yaw);
  }
  if(P.aimCamera)P.aimCamera(P.heading,.26);                 // settle the follow camera behind you
  if(G.focus&&P.pos)G.focus.copy(P.pos);
  if(!w.cave&&!w.undercroft&&!w.temple)reveal(P.pos.x,P.pos.z,revealRadius(P.pos));
  if(!wpOn[w.id])unlockWp(w,{quiet:true});
  G.emit('map:travel',{id:w.id,phase:'arrive'});
}
function updateTravel(dt){
  TR.t+=dt; const f=$('fade');
  if(!TR.moved&&TR.t>=TR.din){
    TR.moved=true;
    try{ arrive(TR.w); }catch(e){ console.error('travel',e); }
    if(G.state.mode==='paused'){ const pc=$('pause'); if(pc)pc.hidden=true; G.setMode('play'); if(!G.isMobile)try{ G.input.lockPointer(); }catch(_){} }
    try{ G.player.setControl&&G.player.setControl(false); }catch(_){}
  }
  if(TR.moved&&!TR.shown&&TR.t>=TR.din+TR.hold){ TR.shown=true; if(f){ f.style.transition=`opacity ${TR.dout}s ease-out`; f.style.opacity='0'; } if(G.headless)G.headless.draw(2); }
  if(TR.shown&&TR.t>=TR.din+TR.hold+TR.dout){
    TR.on=false; if(f)f.style.transition=TR.prevTrans||'';
    try{ G.player.setControl&&G.player.setControl(true); }catch(_){}
    const w=TR.w; TR.w=null; G.emit('map:travel',{id:w.id,phase:'done'});
  }
}

/* ================================================================ 12. COLLECTIBLES ON THE CHART
   Heart Shards and Keeper's Caches (progression.js) get a pin once spotted: within ~12 m, or in view (camera frustum,
   terrain not in the way) within ~55 m / ~40 m. Taken or opened → a faded pin. Cave ones sit by the cave mouth. */
const seenC={};
const _fr=new THREE.Frustum(), _fm=new THREE.Matrix4(), _fp=new THREE.Vector3();
function syncCollectibles(){
  const PR=G.progress; if(!PR)return;
  const caveSpot=(dx)=>()=>{ const m=LM().caveMouth; return m?{x:m.x+dx,z:m.z+4}:null; };
  for(const s of PR.spots||[]){ const id='shard:'+s.id; if(byId[id])continue;
    addMarker({id,kind:'shard',label:s.cave?'Heart Shard (in the sea cave)':'Heart Shard',pos:s.cave?caveSpot(2.6):{x:s.pos.x,z:s.pos.z},
      item:{done:()=>!!PR.state.shards[s.id],doneLabel:'Heart Shard (taken)'},
      visible:()=>!!seenC[id]&&(!s.cave||(loopOn()&&!!(G.caveBoss&&G.caveBoss.discovered)))&&(!!PR.state.shards[s.id]||!s.when||s.when())}); }
  for(const c of PR.caches||[]){ const id='cache:'+c.id; if(byId[id])continue;
    addMarker({id,kind:'cache',label:c.cave?'Keeper’s Cache (in the sea cave)':'Keeper’s Cache',pos:c.cave?caveSpot(-2.6):{x:c.pos.x,z:c.pos.z},
      item:{done:()=>!!PR.state.caches[c.id],doneLabel:'Keeper’s Cache (opened)'},
      visible:()=>!!seenC[id]&&(!c.cave||(loopOn()&&!!(G.caveBoss&&G.caveBoss.discovered)))&&(!!PR.state.caches[c.id]||!c.when||c.when())}); }
}
function inView(p,far){
  const P=G.player.pos, cam=G.camera; if(!cam)return false;
  if(Math.hypot(p.x-P.x,p.z-P.z)>far)return false;
  cam.updateMatrixWorld(); _fm.multiplyMatrices(cam.projectionMatrix,_fm.copy(cam.matrixWorld).invert()); _fr.setFromProjectionMatrix(_fm);
  if(!_fr.containsPoint(_fp.set(p.x,p.y+.3,p.z)))return false;
  if(G.cave&&G.cave.inside)return true;
  const c=cam.position, n=12; // terrain in the way?
  for(let k=1;k<n;k++){ const t=k/n, x=lerp(c.x,p.x,t), z=lerp(c.z,p.z,t), y=lerp(c.y,p.y+.5,t); if(H(x,z)>y+.25)return false; }
  return true;
}
function spotCollectibles(){
  const PR=G.progress, P=G.player; if(!PR||!P||!P.pos||G.state.mode!=='play')return;
  const inCave=!!(G.cave&&G.cave.inside);
  const look=(id,it,taken,near,far)=>{ if(seenC[id])return; if(taken){ seenC[id]=1; return; }
    if(!!it.cave!==inCave||(it.when&&!it.when()))return;
    const d=Math.hypot(it.pos.x-P.pos.x,it.pos.z-P.pos.z);
    if((d<near&&Math.abs(it.pos.y-P.pos.y)<14)||inView(it.pos,far))seenC[id]=1; };
  for(const s of PR.spots||[])look('shard:'+s.id,s,!!PR.state.shards[s.id],12,inCave?24:55);
  for(const c of PR.caches||[])look('cache:'+c.id,c,!!PR.state.caches[c.id],10,inCave?20:40);
}

let discT=0, lastPct=-1;
function updatePlay(dt){
  if(pendingRetro){ pendingRetro=false; if(!loadedMap){ retro(); seen.set(bits); } }
  if(wpRetroPending){ wpRetroPending=false; retroWaypoints(); }
  padPlay();
  discT-=dt; if(discT>0)return; discT=.25;
  try{ visitWaypoints(); spotCollectibles(); }catch(e){ console.error('map waypoints',e); }
  const P=G.player; if(!P||!P.pos||(G.cave&&G.cave.inside)||ucInside()||tpInside())return;
  const n=reveal(P.pos.x,P.pos.z,revealRadius(P.pos));
  if(n){ const pct=percent(); if(pct!==lastPct){ lastPct=pct; G.emit('map:discover',{cells:n,percent:pct}); } }
}
G.system('map',{order:58,modes:'always',
  init(){
    for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){ const x=B.x0+(i+.5)*CW, z=B.z0+(j+.5)*CD; land[idx(i,j)]=H(x,z)>.4?1:0; }
    landN=Math.max(1,land.reduce((a,b)=>a+b,0));
    defaultMarkers(); addWaypointMarkers(); buildUI();
    G.on('cave:enter',()=>{ const w=WP_BY.cave; if(w&&!wpOn.cave&&G.loop&&G.loop.active)unlockWp(w); });
    G.on('undercroft:enter',()=>{ const w=WP_BY.undercroft; if(w&&!wpOn.undercroft)unlockWp(w); });
    G.on('undercroft:bossStart',()=>{ ucBoss=true; });
    for(const ev of ['undercroft:bossDead','undercroft:exit','player:dead'])G.on(ev,()=>{ ucBoss=false; });
    G.on('temple:enter',()=>{ const w=WP_BY.temple; if(w&&!wpOn.temple)unlockWp(w); });
    G.on('temple:bossStart',()=>{ tpBoss=true; });
    for(const ev of ['temple:bossDead','temple:exit','player:dead'])G.on(ev,()=>{ tpBoss=false; });
    G.on('progress:shard',e=>{ if(e&&e.id)seenC['shard:'+e.id]=1; });
    G.on('progress:cache',e=>{ if(e&&e.id)seenC['cache:'+e.id]=1; });
  },
  update(dt){
    const mode=G.state.mode; swallowPause=false;
    if(TR.on){ const now=performance.now(); let rdt=(now-TR.last)/1000; TR.last=now; if(dt>0)rdt=dt; updateTravel(clamp(rdt,0,.1)); }
    if(M.isOpen){
      if(mode!=='paused'){ close(true); return; }
      const now=performance.now(); let rdt=(now-lastReal)/1000; lastReal=now; if(dt>0)rdt=dt; // G.step passes dt; real frames pass 0 while paused
      updateOpen(clamp(rdt,0,.1)); return;
    }
    if(mode==='play')updatePlay(dt);
  }
});
})();

/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — player.js
   The Traveler: procedural model + animation, Zelda-style controller,
   third-person camera with lock-on, staff combat, the lantern.
   Also defines G.models.lantern() and G.models.staff().
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PAL=G.PAL;
const PI=Math.PI, TAU=PI*2;
const V3=THREE.Vector3;
const col=U.col, clamp=U.clamp, lerp=U.lerp, damp=U.damp, smooth=U.smooth;

/* ---------------------------------------------------------------------
   small helpers
   --------------------------------------------------------------------- */
function canvasTex(w,h,draw,srgb=true){
  const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); if(srgb)t.encoding=THREE.sRGBEncoding; t.anisotropy=4; return t;
}
const lazy=f=>{let v=null;return ()=>v||(v=f());};
/* the Traveler's Cloak: found in the chest in the keeper's cottage (world.js). Without it: hood down, no gliding. */
G.items.cloak=G.items.cloak||{owned:false};
const glowCol=(hex,k)=>col(hex).multiplyScalar(k);
function sprite(tex,hex,size,opacity=1,additive=true){
  const m=new THREE.SpriteMaterial({map:tex,color:col(hex),transparent:true,depthWrite:false,opacity,
    blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});
  const s=new THREE.Sprite(m); s.scale.setScalar(size); return s;
}
/** rounded capsule along -y from the origin (pivot at the top), radius r0 at top, r1 at bottom */
function capsuleGeo(r0,r1,len,seg=10){
  const pts=[], n=5;
  for(let i=0;i<=n;i++){const a=-PI/2+PI/2*i/n; pts.push(new THREE.Vector2(Math.max(1e-4,Math.cos(a)*r1),-len+Math.sin(a)*r1));}
  for(let i=1;i<=n;i++){const a=PI/2*i/n; pts.push(new THREE.Vector2(Math.max(1e-4,Math.cos(a)*r0),Math.sin(a)*r0));}
  return new THREE.LatheGeometry(pts,seg);
}
function mesh(geo,mat,parent,x=0,y=0,z=0,ol=0.012){
  const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=false;
  if(parent)parent.add(m); if(ol)G.outline(m,{thickness:ol}); return m;
}
function group(parent,x=0,y=0,z=0){const g=new THREE.Group(); g.position.set(x,y,z); if(parent)parent.add(g); return g;}

/* botanical gold stitching, shared by cloak / capelet textures */
const GOLD='#d2ab55', GOLD_D='#7c5f2a';
function leaf(g,x,y,ang,len){
  g.save(); g.translate(x,y); g.rotate(ang);
  g.beginPath(); g.ellipse(len/2,0,len/2,len/5.2,0,0,TAU); g.fill(); g.stroke(); g.restore();
}
function sprig(g,x,y,h,s){
  g.save(); g.translate(x,y); g.scale(s,s);
  g.strokeStyle=GOLD; g.fillStyle=GOLD; g.lineWidth=2.2; g.lineCap='round';
  g.beginPath(); g.moveTo(0,0); g.bezierCurveTo(5,-h*.3,-5,-h*.62,0,-h); g.stroke();
  const n=Math.max(2,Math.floor(h/13));
  g.lineWidth=1;
  for(let i=1;i<=n;i++){
    const t=i/(n+1), yy=-h*t, l=11*(1-t*.45);
    leaf(g,0,yy,-PI/2+.95,l); leaf(g,0,yy-5,-PI/2-.95,l*.9);
  }
  leaf(g,0,-h,-PI/2,8);
  g.restore();
}
function curl(g,x,y,r,dir){
  g.beginPath(); for(let i=0;i<=24;i++){const a=i/24*TAU*.85, rr=r*(1-i/30); const px=x+Math.cos(a*dir)*rr, py=y+Math.sin(a*dir)*rr; i?g.lineTo(px,py):g.moveTo(px,py);} g.stroke();
}
function wool(g,w,h,base,seed){
  g.fillStyle=base; g.fillRect(0,0,w,h);
  const r=U.rng(seed);
  for(let i=0;i<w*h/90;i++){
    const l=r()<.5; g.fillStyle=l?'rgba(255,240,255,.05)':'rgba(10,0,20,.08)';
    g.fillRect(r()*w,r()*h,1+r()*3,1+r()*2);
  }
}

/* ---------------------------------------------------------------------
   G.models.lantern() — brass hexagonal ether lantern
   --------------------------------------------------------------------- */
const brassMat=lazy(()=>G.toon('#a67b38',{emissive:'#24160a'}));
const brassDarkMat=lazy(()=>G.toon('#6e4f26'));
const glassMat=lazy(()=>new THREE.MeshBasicMaterial({color:col('#d9c8ff'),transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}));
const etherTex=lazy(()=>{const t=canvasTex(128,128,(g,w,h)=>{
  const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'#c9a8ff'); gr.addColorStop(.5,'#8d52ff'); gr.addColorStop(1,'#b088ff');
  g.fillStyle=gr; g.fillRect(0,0,w,h);
  const r=U.rng(11); g.lineCap='round';
  for(let i=0;i<10;i++){
    g.strokeStyle=`rgba(255,240,255,${.25+.3*r()})`; g.lineWidth=2+r()*5; g.beginPath();
    let x=r()*w, y=h+8; g.moveTo(x,y);
    for(let k=0;k<6;k++){const nx=x+(r()-.5)*60, ny=y-h/5; g.quadraticCurveTo(x+(r()-.5)*50,y-h/10,nx,ny); x=nx; y=ny;}
    g.stroke();
  }
});t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;});
const curedTex=lazy(()=>{const t=canvasTex(64,64,(g,w,h)=>{const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#fff6dc');gr.addColorStop(1,'#ffd08a');g.fillStyle=gr;g.fillRect(0,0,w,h);});return t;});

G.models.lantern=function(opts={}){
  const L=new THREE.Group(); L.name='lantern';
  const B=brassMat(), BD=brassDarkMat();
  const add=(geo,mat,y,ol)=>mesh(geo,mat,L,0,y,0,ol);
  // base: stacked hex plates
  add(new THREE.CylinderGeometry(.1,.112,.032,6),B,.016,.006);
  add(new THREE.CylinderGeometry(.092,.1,.02,6),BD,.042,0);
  // glass + ether
  const glass=add(new THREE.CylinderGeometry(.084,.084,.2,6,1,true),glassMat(),.152,0); glass.castShadow=false; glass.renderOrder=2;
  const innerMat=new THREE.MeshBasicMaterial({map:etherTex(),color:new THREE.Color(1,1,1).multiplyScalar(1.7),transparent:true,opacity:.92,depthWrite:false});
  const inner=add(new THREE.CylinderGeometry(.068,.072,.17,6,1,false),innerMat,.152,0); inner.castShadow=false; inner.renderOrder=1;
  // frame posts on the hex corners
  for(let k=0;k<6;k++){const a=k*PI/3; const p=mesh(new THREE.BoxGeometry(.017,.215,.017),B,L,Math.sin(a)*.088,.152,Math.cos(a)*.088,0); p.rotation.y=a;}
  // guard wires across the glass
  for(const y of [.1,.205]){const ring=mesh(new THREE.TorusGeometry(.09,.006,4,6),B,L,0,y,0,0); ring.rotation.set(PI/2,0,PI/6);}
  // top: plate, pyramidal cap with vents, chimney, finial, ring
  add(new THREE.CylinderGeometry(.102,.096,.024,6),B,.264,.006);
  add(new THREE.CylinderGeometry(.032,.1,.07,6),B,.311,.006);
  add(new THREE.CylinderGeometry(.024,.03,.035,6),BD,.362,0);
  add(new THREE.SphereGeometry(.018,8,6),B,.385,0);
  const ring=mesh(new THREE.TorusGeometry(.044,.0085,6,18),B,L,0,.425,0,.005);
  // shutter (dark iron plates), shown when closed
  const shutter=add(new THREE.CylinderGeometry(.09,.09,.205,6,1,true),G.toon('#2b2520',{side:THREE.DoubleSide}),.152,0);
  shutter.visible=false;
  // corruption globules
  const globMat=new THREE.MeshBasicMaterial({color:col('#060309')});
  const globules=[]; const gr=U.rng(5);
  for(let i=0;i<5;i++){const s=new THREE.Mesh(new THREE.SphereGeometry(.013+gr()*.012,8,6),globMat); s.renderOrder=3;
    s.userData={a:gr()*TAU,r:.02+gr()*.03,y:.09+gr()*.11,sp:.4+gr()*.8,ph:gr()*TAU}; L.add(s); globules.push(s);}
  // glow
  const flame=group(L,0,.152,0);
  const glow=sprite(G.tex.flame,'#b58aff',.55,1); flame.add(glow);
  const halo=sprite(G.tex.soft,'#7a4cff',2.2,.45); flame.add(halo);
  let light=null;
  if(opts.light!==false){light=new THREE.PointLight(new THREE.Color('#9a6cff'),2,14,1.5); flame.add(light);}
  const ud=L.userData;
  Object.assign(ud,{glow,halo,light,flame,inner,shutter,globules,lit:true,cured:false,flick:1,baseIntensity:2,
    setLit(b){ud.lit=!!b; glow.visible=halo.visible=inner.visible=ud.lit; shutter.visible=!ud.lit; if(light)light.intensity=ud.lit?ud.baseIntensity:0;},
    setCured(b){ud.cured=!!b;
      glow.material.color.copy(col(b?'#ffe2b0':'#b58aff')); halo.material.color.copy(col(b?'#ffb874':'#7a4cff'));
      innerMat.map=b?curedTex():etherTex(); innerMat.color.setScalar(b?1.5:1.7); innerMat.needsUpdate=true;
      globules.forEach(s=>s.visible=!b); if(light)light.color.set(b?'#ffc98a':'#9a6cff');},
    tick(t,intensity){
      const fl=.86+Math.sin(t*13.1)*.07+Math.sin(t*7.3+1)*.05+Math.sin(t*23.7)*.03; ud.flick=fl;
      if(ud.lit){glow.scale.setScalar(.55*fl); halo.material.opacity=.42*fl; if(light)light.intensity=(intensity==null?ud.baseIntensity:intensity)*fl;}
      if(!ud.cured){innerMat.map.offset.y=-t*.12; innerMat.map.offset.x=Math.sin(t*.7)*.1;}
      for(const s of globules){const d=s.userData; const a=d.a+t*d.sp; s.position.set(Math.cos(a)*d.r,d.y+Math.sin(t*d.sp*1.3+d.ph)*.02,Math.sin(a)*d.r);}
    }});
  ud.setCured(false);
  if(!/[?&]nomerge/.test(location.search))mergeStatic(L,ud);
  return L;
};

/* ---------------------------------------------------------------------
   G.models.staff() — the Keeper's Staff (origin at the ferrule, +y up)
   --------------------------------------------------------------------- */
G.models.staff=function(){
  const S=new THREE.Group(); S.name='staff';
  const wood=G.toon('#3e2c21',{flatShading:true}), B=brassMat(), leatherM=G.toon('#4a3326');
  // gnarled shaft: lathe with varying radius, bent
  const pts=[]; const N=40;
  for(let i=0;i<=N;i++){const t=i/N, y=.05+t*1.36;
    const r=.019+.0035*Math.sin(t*41)+.003*Math.sin(t*97+1)+.006*Math.max(0,Math.sin(t*9.5-1))*.8+(t>.88?(t-.88)*.08:0);
    pts.push(new THREE.Vector2(r,y));}
  const sg=new THREE.LatheGeometry(pts,7);
  const p=sg.attributes.position; for(let i=0;i<p.count;i++){const y=p.getY(i); p.setX(i,p.getX(i)+.013*Math.sin(y*2.6)+.004*Math.sin(y*11)); p.setZ(i,p.getZ(i)+.01*Math.sin(y*3.9+1));}
  sg.computeVertexNormals();
  mesh(sg,wood,S,0,0,0,.008);
  const bend=y=>new V3(.013*Math.sin(y*2.6)+.004*Math.sin(y*11),y,.01*Math.sin(y*3.9+1));
  // knots
  const kr=U.rng(3);
  for(const y of [.32,.83,1.12]){const k=mesh(new THREE.DodecahedronGeometry(.016+kr()*.006,0),wood,S,0,0,0,0); const b=bend(y); const a=kr()*TAU; k.position.set(b.x+Math.cos(a)*.017,y,b.z+Math.sin(a)*.017);}
  // ferrule, grip wrap, collar
  mesh(new THREE.CylinderGeometry(.024,.012,.075,8),B,S,bend(.03).x,.037,bend(.03).z,.005);
  const gp=bend(.55); mesh(new THREE.CylinderGeometry(.026,.026,.2,8),leatherM,S,gp.x,.55,gp.z,.005);
  for(const y of [.445,.655]){const b=bend(y); mesh(new THREE.CylinderGeometry(.029,.029,.014,8),B,S,b.x,y,b.z,0);}
  const cb=bend(1.4); mesh(new THREE.CylinderGeometry(.03,.024,.06,8),B,S,cb.x,1.4,cb.z,.005);
  mesh(new THREE.TorusGeometry(.03,.007,5,12),B,S,cb.x,1.43,cb.z,0).rotation.x=PI/2;
  // brass crescent hook cradling the crystal
  const top=group(S,cb.x,1.515,cb.z);
  const cres=mesh(new THREE.TorusGeometry(.085,.012,6,20,TAU-1.6),B,top,0,0,0,.006); cres.rotation.z=PI/2+.8;
  for(const a of [PI/2+.8,PI/2-.8]){mesh(new THREE.SphereGeometry(.017,8,6),B,top,Math.cos(a)*.085,Math.sin(a)*.085,0,0);}
  const crystalMat=new THREE.MeshBasicMaterial({color:glowCol('#a06cff',2.2)});
  const crystal=mesh(new THREE.OctahedronGeometry(.042,0),crystalMat,top,0,0,0,0); crystal.scale.set(1,1.7,1);
  const glow=sprite(G.tex.flame,'#a070ff',.32,.9); top.add(glow);
  const halo=sprite(G.tex.soft,'#7a4cff',.9,.3); top.add(halo);
  const ud=S.userData; ud.tip=top; ud.crystal=crystal; ud.glow=glow;
  ud.setGlow=(k,t=0)=>{ // k: 1 = idle, >1 = charging
    crystalMat.color.copy(glowCol(k>2.6?'#d8c0ff':'#a06cff',2.2*k));
    glow.scale.setScalar(.32*(.8+.35*k)); glow.material.opacity=Math.min(1,.7+.15*k);
    halo.scale.setScalar(.9*(.7+.4*k)); halo.material.opacity=Math.min(.8,.25*k);
    crystal.rotation.y=t*(1+k);
  };
  ud.setGlow(1);
  if(!/[?&]nomerge/.test(location.search))mergeStatic(S,ud);
  return S;
};

/* ---------------------------------------------------------------------
   Traveler textures
   --------------------------------------------------------------------- */
function faceTex(blink){
  return canvasTex(512,256,(g,w,h)=>{
    g.fillStyle=PAL.skin; g.fillRect(0,0,w,h);
    const cx=128, ey=140;
    // cheeks
    for(const s of [-1,1]){const gr=g.createRadialGradient(cx+s*40,ey+20,0,cx+s*40,ey+20,16);gr.addColorStop(0,'rgba(232,124,120,.45)');gr.addColorStop(1,'rgba(232,124,120,0)');g.fillStyle=gr;g.fillRect(cx+s*40-18,ey+2,36,36);}
    // brows
    g.strokeStyle='#5a3422'; g.lineWidth=3; g.lineCap='round';
    for(const s of [-1,1]){g.beginPath(); g.moveTo(cx+s*17,ey-23); g.quadraticCurveTo(cx+s*29,ey-28,cx+s*41,ey-22); g.stroke();}
    for(const s of [-1,1]){
      const ex=cx+s*28;
      if(blink){
        g.strokeStyle='#2b1a14'; g.lineWidth=3.2; g.beginPath(); g.moveTo(ex-13,ey+1); g.quadraticCurveTo(ex,ey+8,ex+13,ey+1); g.stroke();
        g.lineWidth=1.6; g.beginPath(); g.moveTo(ex+s*12,ey+2); g.lineTo(ex+s*17,ey-1); g.stroke();
        continue;
      }
      // sclera
      g.fillStyle='#fbf4ec'; g.beginPath(); g.ellipse(ex,ey,15,18,0,0,TAU); g.fill();
      // iris (warm brown, darker top)
      const ig=g.createLinearGradient(0,ey-13,0,ey+13); ig.addColorStop(0,'#3e2212'); ig.addColorStop(.55,'#7a4724'); ig.addColorStop(1,'#b47a3c');
      g.fillStyle=ig; g.beginPath(); g.ellipse(ex+s*1,ey+2,12,15.5,0,0,TAU); g.fill();
      g.fillStyle='#1d0f09'; g.beginPath(); g.ellipse(ex+s*1,ey+3,5.5,7.5,0,0,TAU); g.fill();
      // highlights
      g.fillStyle='#ffffff'; g.beginPath(); g.ellipse(ex-5,ey-5,4.4,5.2,0,0,TAU); g.fill();
      g.beginPath(); g.ellipse(ex+4,ey+6,1.7,1.7,0,0,TAU); g.fill();
      // upper lid / lashes
      g.strokeStyle='#22140f'; g.lineWidth=3.6; g.beginPath(); g.ellipse(ex,ey+1,16,18.5,0,PI*1.08,PI*1.92); g.stroke();
      g.lineWidth=2.2; g.beginPath(); g.moveTo(ex+s*15,ey-8); g.lineTo(ex+s*20,ey-12); g.stroke();
      g.strokeStyle='rgba(120,70,50,.6)'; g.lineWidth=1.2; g.beginPath(); g.ellipse(ex,ey+1,12,14,0,PI*.25,PI*.75); g.stroke();
    }
    // nose + mouth
    g.strokeStyle='rgba(170,100,80,.7)'; g.lineWidth=1.8; g.beginPath(); g.moveTo(cx-3,ey+19); g.quadraticCurveTo(cx,ey+21,cx+3,ey+19); g.stroke();
    g.strokeStyle='#9a4c44'; g.lineWidth=2.2; g.beginPath(); g.moveTo(cx-7,ey+31); g.quadraticCurveTo(cx,ey+35,cx+7,ey+31); g.stroke();
  });
}
const cloakTex=lazy(()=>{const t=canvasTex(1024,512,(g,w,h)=>{
  wool(g,w,h,'#4e3a68',21);
  // soft vertical fold shading
  for(let i=0;i<14;i++){const x=i/14*w; const gr=g.createLinearGradient(x,0,x+w/14,0); gr.addColorStop(0,'rgba(20,8,30,0)'); gr.addColorStop(.5,'rgba(20,8,30,.16)'); gr.addColorStop(1,'rgba(20,8,30,0)'); g.fillStyle=gr; g.fillRect(x,0,w/14,h);}
  g.strokeStyle=GOLD; g.lineWidth=3;
  // hem band
  const y0=h-12, y1=h*.8;
  g.beginPath(); g.moveTo(0,y0); g.lineTo(w,y0); g.stroke();
  g.lineWidth=2; g.beginPath(); g.moveTo(0,y1); g.lineTo(w,y1); g.stroke();
  g.lineWidth=1.6; g.beginPath(); for(let x=0;x<=w;x+=4){const y=(y0+y1)/2+Math.sin(x/w*TAU*12)*14; x?g.lineTo(x,y):g.moveTo(x,y);} g.stroke();
  for(let i=0;i<12;i++){const x=(i+.5)/12*w; sprig(g,x,y0-2,62,1); g.strokeStyle=GOLD; g.lineWidth=1.6; curl(g,x+w/24,(y0+y1)/2-8,7,1);}
  // tall back branch + side sprigs climbing up from the hem
  sprig(g,w*.5,y1-4,170,1.15); sprig(g,w*.32,y1-4,95,.9); sprig(g,w*.68,y1-4,95,.9);
  // front edges trim
  g.strokeStyle=GOLD; g.lineWidth=3; for(const x of [7,w-7]){g.beginPath(); g.moveTo(x,0); g.lineTo(x,h); g.stroke();}
  g.fillStyle=GOLD; g.strokeStyle=GOLD_D; g.lineWidth=1;
  for(let y=30;y<h*.78;y+=46){leaf(g,9,y,-.6,12); leaf(g,w-9,y+20,PI+.6,12);}
});return t;});
const capeTex=lazy(()=>canvasTex(512,128,(g,w,h)=>{
  wool(g,w,h,'#55406f',33);
  g.strokeStyle=GOLD; g.lineWidth=2.5; g.beginPath(); g.moveTo(0,h-8); g.lineTo(w,h-8); g.stroke();
  g.lineWidth=1.4; g.beginPath(); for(let x=0;x<=w;x+=3){const y=h-26+Math.sin(x/w*TAU*10)*8; x?g.lineTo(x,y):g.moveTo(x,y);} g.stroke();
  g.fillStyle=GOLD; g.strokeStyle=GOLD_D; g.lineWidth=.8;
  for(let i=0;i<20;i++){const x=(i+.5)/20*w; leaf(g,x,h-26+Math.sin((x)/w*TAU*10)*8,-PI/2+.9,10); leaf(g,x,h-26+Math.sin(x/w*TAU*10)*8,-PI/2-.9,9);}
}));
const torsoTex=lazy(()=>canvasTex(256,128,(g,w,h)=>{
  wool(g,w,h,'#5e4c3e',44);
  // coat panels (violet-grey) leaving the tunic visible at the front
  g.fillStyle='#463a58'; g.fillRect(w*.14,0,w*.72,h);
  g.strokeStyle=GOLD; g.lineWidth=2; for(const x of [w*.14,w*.86]){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
  // tunic placket + buttons
  g.strokeStyle='#3d3027'; g.lineWidth=2; g.beginPath(); g.moveTo(1,0); g.lineTo(1,h); g.stroke(); g.beginPath(); g.moveTo(w-1,0); g.lineTo(w-1,h); g.stroke();
  g.fillStyle='#b08a48'; for(let y=24;y<h-10;y+=22){g.beginPath();g.arc(w*.05,y,2.5,0,TAU);g.fill();}
}));
const skirtTex=lazy(()=>canvasTex(64,128,(g,w,h)=>{wool(g,w,h,'#ffffff',55); g.strokeStyle='rgba(60,40,30,.5)'; g.lineWidth=3; g.beginPath(); g.moveTo(0,h-5); g.lineTo(w,h-5); g.stroke();}));
const diamondTex=lazy(()=>canvasTex(64,64,(g,w,h)=>{g.translate(32,32); g.strokeStyle='#fff'; g.lineWidth=5; g.beginPath(); g.moveTo(0,-24); g.lineTo(16,0); g.lineTo(0,24); g.lineTo(-16,0); g.closePath(); g.stroke(); g.fillStyle='rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(0,-11); g.lineTo(7,0); g.lineTo(0,11); g.lineTo(-7,0); g.fill();}));

/* ---------------------------------------------------------------------
   The Traveler model (faces +z in model space)
   --------------------------------------------------------------------- */
/** short tousled chestnut hair for the 'Hood down' look (hidden while the hood is up) */
function buildLooseHair(head,M){
  const g=group(head,0,0,0); g.name='looseHair';
  const hm=M.hairLoose=G.toon('#6b4128'), hl=G.toon('#83512f');
  // fuller, lumpy cap over the crown and down the back of the head
  const cg=new THREE.SphereGeometry(.166,24,16,0,TAU,0,PI*.66);
  {const a=cg.attributes.position; for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i);
    const k=1+.07*Math.sin(Math.atan2(x,z)*7+y*20)*Math.max(0,.6-y/.166*.4); a.setXYZ(i,x*k,y*(1+.05*Math.max(0,y/.166)),z*k);} cg.computeVertexNormals();}
  const cap=mesh(cg,hm,g,0,.012,-.02,.008); cap.rotation.x=-.5; cap.scale.set(1.05,1,1.08);
  const r=U.rng(77), Y=new V3(0,1,0);
  // soft clumps lying on the head and curling out at the tips (tousled, not spiky)
  const clump=(az,el,len,w,mat,out=.18,tw=0)=>{
    const d=new V3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));
    let t=new V3(0,-1,0).addScaledVector(d,d.y).normalize(); if(t.lengthSq()<.1)t.set(0,0,-1);
    if(el>.9)t.set(-Math.sin(az),0,-Math.cos(az)).addScaledVector(d,.2).normalize();
    const m=mesh(new THREE.SphereGeometry(w,9,7),mat,g,0,0,0,.006);
    m.scale.set(1,len/w*.5,.55);
    const dir=t.clone().multiplyScalar(-1).addScaledVector(d,out).normalize(); // long axis (+y of the blob) points up toward the root
    m.quaternion.setFromUnitVectors(Y,dir); m.rotateY(tw);
    m.position.copy(d).multiplyScalar(.158).addScaledVector(t,len*.42); return m;};
  // back and sides
  for(let i=0;i<11;i++){const az=PI+(i/10-.5)*3.6, el=.1+r()*.5; clump(az,el,.15+r()*.05,.05,i%4?hm:hl,.28,r()-.5);}
  for(let i=0;i<9;i++){const az=PI+(i/8-.5)*3.0, el=.55+r()*.35; clump(az,el,.13+r()*.04,.052,i%3?hm:hl,.32,r()-.5);}
  // crown swirl
  for(let i=0;i<6;i++){const az=i/6*TAU+.3, el=1.15+r()*.15; clump(az,el,.11,.05,i%2?hm:hl,.35,r());}
  // front fringe sweeping across the brow (falls over the forehead, parted to one side)
  for(const [az,len,rz,yy] of [[-.62,.12,.85,.07],[-.33,.14,.5,.095],[-.05,.14,.25,.1],[.24,.13,-.15,.1],[.5,.12,-.55,.085],[.75,.11,-.8,.06]]){
    const f=mesh(new THREE.SphereGeometry(.046,9,7),r()<.3?hl:hm,g,0,0,0,.005);
    f.position.set(Math.sin(az)*.142,yy,Math.cos(az)*.122); f.scale.set(1,len/.046*.5,.5); f.rotation.set(-.62,az,rz);}
  // locks over the ears, curling forward a touch
  for(const s of [-1,1]){const l=mesh(new THREE.SphereGeometry(.052,9,7),hm,g,s*.142,-.035,-.005,.005); l.scale.set(.55,1.5,1); l.rotation.set(-.15,0,s*.12);
    const l2=mesh(new THREE.SphereGeometry(.04,8,6),hl,g,s*.13,-.1,.03,.005); l2.scale.set(.5,1,.8); l2.rotation.z=s*-.5;}
  // nape flicks
  for(let i=0;i<5;i++){const a=PI+(i-2)*.32; const n=mesh(new THREE.SphereGeometry(.035,8,6),hm,g,Math.sin(a)*.12,-.12,Math.cos(a)*.11,.005);
    n.scale.set(1,1.6,.6); n.rotation.set(-.6*Math.cos(a)+.2,0,(i-2)*.25);}
  g.visible=false;
  return g;
}
const HIP_Y=.70, THIGH=.33, SHIN=.30, FOOT=.07, UARM=.205, FARM=.19;
const CL_C=22, CL_R=10; // cloak columns / rows

function buildTraveler(){
  const R={};
  const M={
    skin:G.toon(PAL.skin), hair:G.toon('#6e4229'),
    trouser:G.toon('#2f2a2e'), boot:G.toon('#5f3f27'), bootDark:G.toon('#38261a'), leather:G.toon('#71492a'), leatherDark:G.toon('#4c3221'),
    sleeve:G.toon('#46385c'), gold:G.toon('#c8a24c',{emissive:'#241a08'}),
    scarf:G.toon('#61418f'), hoodOut:G.toon('#4a3864'), hoodIn:G.toon('#22182c',{side:THREE.BackSide}),
    torso:G.toon('#ffffff',{map:torsoTex()}), cape:G.toon('#ffffff',{map:capeTex()}),
    cloak:G.toon('#ffffff',{map:cloakTex()}), lining:G.toon('#4a2944',{side:THREE.BackSide}),
  };
  R.mats=M;
  const root=R.root=new THREE.Group(); root.name='Traveler';
  const rig=R.rig=group(root,0,.45,0);
  const inner=R.inner=group(rig,0,-.45,0);
  const hips=R.hips=group(inner,0,HIP_Y,0);
  // pelvis / trousers top
  mesh(new THREE.CylinderGeometry(.118,.112,.13,12),M.trouser,hips,0,-.03,0,.01).scale.z=.8;
  // skirt panels (layered tunic below the belt)
  R.skirt=[];
  const nP=9;
  for(let i=0;i<nP;i++){
    const a=(i/nP)*TAU+PI/nP;
    const pv=group(hips,Math.sin(a)*.118,.02,Math.cos(a)*.094); pv.rotation.y=a;
    const geo=new THREE.BoxGeometry(.105,.27,.014); geo.translate(0,-.135,0);
    const m=mesh(geo,G.toon(i%2?'#5c4a3c':'#4a3f5a',{map:skirtTex()}),pv,0,0,0,0); m.position.z=(i%2)*.006;
    pv.userData.a=a; R.skirt.push(pv);
  }
  // spine + torso
  const spine=R.spine=group(hips,0,.02,0);
  const torsoPts=[[.0,.118],[.08,.124],[.16,.135],[.24,.142],[.3,.13],[.34,.1],[.37,.05]].map(p=>new THREE.Vector2(p[1],p[0]));
  const torso=mesh(new THREE.LatheGeometry(torsoPts,16),M.torso,spine,0,-.02,0,.012); torso.scale.z=.78;
  // belt + buckle + pouch
  const belt=mesh(new THREE.CylinderGeometry(.126,.126,.05,16,1,true),M.leather,spine,0,0,0,.006); belt.scale.z=.8;
  mesh(new THREE.BoxGeometry(.05,.045,.015),M.gold,spine,0,0,.103,0);
  mesh(new THREE.BoxGeometry(.026,.024,.016),M.leatherDark,spine,0,0,.108,0);
  const pouch=group(spine,-.12,-.07,.045); pouch.rotation.y=-.75;
  mesh(new THREE.BoxGeometry(.085,.095,.04),M.leather,pouch,0,0,0,.006);
  mesh(new THREE.BoxGeometry(.088,.05,.044),M.leatherDark,pouch,0,.026,.002,0);
  mesh(new THREE.SphereGeometry(.008,6,4),M.gold,pouch,0,.005,.024,0);
  const pouch2=group(spine,.11,-.05,-.06); pouch2.rotation.y=2.3; mesh(new THREE.BoxGeometry(.06,.07,.035),M.leatherDark,pouch2,0,0,0,.005);
  // cross strap: tilted flattened ring around the chest
  const strapG=new THREE.TorusGeometry(.148,.011,4,24); strapG.rotateX(PI/2);
  const strap=mesh(strapG,M.leather,spine,0,.17,0,0); strap.scale.set(1,1,.8); strap.rotation.z=.62;
  mesh(new THREE.TorusGeometry(.016,.005,4,8),M.gold,spine,.05,.22,.115,0);
  // capelet
  const cape=mesh(new THREE.CylinderGeometry(.15,.265,.2,20,1,true),M.cape,spine,0,.265,-.005,.01); cape.scale.z=.82;
  cape.material.side=THREE.DoubleSide; R.cape=cape;
  // neck + scarf
  mesh(new THREE.CylinderGeometry(.04,.046,.09,8),M.skin,spine,0,.38,0,0);
  const sc1=new THREE.TorusGeometry(.098,.05,8,18); sc1.rotateX(PI/2);
  const scarf=mesh(sc1,M.scarf,spine,0,.36,.0,.01); scarf.scale.set(1.08,1,1);
  const sc2=new THREE.TorusGeometry(.115,.042,8,18); sc2.rotateX(PI/2);
  const scarf2=mesh(sc2,M.scarf,spine,0,.315,.012,.01); scarf2.rotation.set(.18,0,-.1); scarf2.scale.set(1.1,1,1);
  const drape=mesh(new THREE.SphereGeometry(.06,10,8),M.scarf,spine,.06,.24,.1,.008); drape.scale.set(.85,1.6,.45); drape.rotation.z=-.25;
  const tailPv=R.scarfTail=group(spine,-.05,.34,-.1);
  const tg=new THREE.BoxGeometry(.075,.3,.018); tg.translate(0,-.15,0);
  mesh(tg,M.scarf,tailPv,0,0,0,.006).rotation.z=.12;
  // head
  const neck=R.neck=group(spine,0,.4,0);
  const head=R.head=group(neck,0,.13,0);
  R.faceOpen=faceTex(false); R.faceBlink=faceTex(true);
  R.faceMat=G.toon('#ffffff',{map:R.faceOpen});
  const skull=mesh(new THREE.SphereGeometry(.152,32,24),R.faceMat,head,0,0,0,.008); skull.scale.set(1,1.03,.97);
  // hair: cap + bangs + side locks
  const hcap=mesh(new THREE.SphereGeometry(.16,20,12,0,TAU,0,PI*.47),M.hair,head,0,.012,-.008,0); hcap.rotation.x=-.18;
  const bang=(az,el,len,rz,w=.042)=>{const g=new THREE.SphereGeometry(w,8,6); const m=mesh(g,M.hair,head,0,0,0,0);
    m.position.set(Math.sin(az)*Math.cos(el)*.148,Math.sin(el)*.148,Math.cos(az)*Math.cos(el)*.148); m.scale.set(1,len,.55);
    m.rotation.set(-.35,az,rz); return m;};
  bang(-.42,.56,1.5,.55,.036); bang(-.16,.6,1.7,.2,.038); bang(.12,.6,1.7,-.25,.038); bang(.4,.55,1.5,-.6,.036);
  bang(-.8,.36,1.6,.3,.03); bang(.8,.36,1.6,-.3,.03);
  bang(-1.18,.08,2.3,.1,.034); bang(1.18,.08,2.3,-.1,.034);
  // hood: sphere with a circular face opening + inner dark lining + gold rim + point
  const OPEN=1.18;
  const hg=new THREE.SphereGeometry(.205,28,20,0,TAU,OPEN,PI-OPEN); hg.rotateX(PI/2);
  // pull the back of the hood into a soft drooping peak
  {const a=hg.attributes.position; for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i);
    const back=Math.max(0,-z/.205), upk=Math.max(0,y/.205);
    a.setZ(i,z-back*back*.07*(.4+upk)); a.setY(i,y+back*upk*.05-Math.max(0,-y/.205)*.02);}
   hg.computeVertexNormals();}
  const hood=R.hood=group(head,0,.03,-.045); hood.scale.set(1.03,1.06,1.12); hood.rotation.x=-.12;
  mesh(hg,M.hoodOut,hood,0,0,0,.009);
  mesh(hg,M.hoodIn,hood,0,0,0,0).scale.setScalar(.975);
  const rim=mesh(new THREE.TorusGeometry(.205*Math.sin(OPEN),.0105,6,36),M.hoodOut,hood,0,0,.205*Math.cos(OPEN),0);
  const rimG=new THREE.Mesh(new THREE.TorusGeometry(.205*Math.sin(OPEN)+.006,.0035,4,36),M.gold); rimG.position.set(0,0,.205*Math.cos(OPEN)+.008); hood.add(rimG);
  // hood folds down onto the shoulders
  const fold=R.fold=mesh(new THREE.CylinderGeometry(.13,.2,.12,18,1,true),M.hoodOut,spine,0,.395,-.025,.008); fold.material=M.hoodOut; fold.scale.z=.85;
  R.hoodBase=hood.scale.clone();
  R.hairOut=buildLooseHair(head,M);
  // arms
  const arm=(side)=>{ // side +1 left (+x), -1 right
    const sh=group(spine,side*.158,.3,-.01);
    mesh(new THREE.SphereGeometry(.056,10,8),M.sleeve,sh,0,0,0,.008);
    mesh(capsuleGeo(.047,.041,UARM),M.sleeve,sh,0,0,0,.009);
    const el=group(sh,0,-UARM,0);
    mesh(new THREE.TorusGeometry(.042,.009,5,12),M.gold,el,0,.004,0,0).rotation.x=PI/2;
    mesh(capsuleGeo(.039,.033,FARM-.02),M.leather,el,0,0,0,.008);
    const hand=group(el,0,-FARM,0);
    const hm=mesh(new THREE.SphereGeometry(.036,10,8),M.skin,hand,0,-.012,.004,.006); hm.scale.set(.95,1.15,.8);
    mesh(new THREE.SphereGeometry(.014,6,4),M.skin,hand,side*-.03,-.004,.02,0);
    const anchor=group(hand,0,-.03,0);
    return {sh,el,hand,anchor};
  };
  const aL=arm(1), aR=arm(-1);
  Object.assign(R,{shL:aL.sh,elL:aL.el,handL:aL.hand,anchorL:aL.anchor,shR:aR.sh,elR:aR.el,handR:aR.hand,anchorR:aR.anchor});
  // legs
  const leg=(side)=>{
    const th=group(hips,side*.075,-.02,0);
    mesh(capsuleGeo(.06,.05,THIGH),M.trouser,th,0,0,0,.009);
    const kn=group(th,0,-THIGH,0);
    mesh(capsuleGeo(.049,.042,SHIN-.04),M.trouser,kn,0,0,0,.008);
    const ft=group(kn,0,-SHIN,0);
    // boot
    mesh(new THREE.CylinderGeometry(.056,.052,.17,10),M.boot,ft,0,.05,0,.008);
    mesh(new THREE.TorusGeometry(.057,.012,5,12),M.bootDark,ft,0,.13,0,0).rotation.x=PI/2;
    const toe=mesh(new THREE.SphereGeometry(.056,10,8),M.boot,ft,0,-.028,.04,.008); toe.scale.set(.95,.72,1.55);
    mesh(new THREE.BoxGeometry(.105,.022,.2),M.bootDark,ft,0,-.06,.035,0);
    mesh(new THREE.BoxGeometry(.02,.1,.01),G.toon('#c9b48a'),ft,0,.04,.054,0);
    return {th,kn,ft};
  };
  const lL=leg(1), lR=leg(-1);
  Object.assign(R,{thL:lL.th,knL:lL.kn,ftL:lL.ft,thR:lR.th,knR:lR.kn,ftR:lR.ft});

  // cloak — CPU-deformed sheet hanging from the shoulders
  const cg=new THREE.BufferGeometry();
  const nV=CL_C*CL_R;
  const pos=new Float32Array(nV*3), uv=new Float32Array(nV*2), idx=[];
  const base=new Float32Array(nV*3), ang=new Float32Array(nV);
  for(let r=0;r<CL_R;r++)for(let c=0;c<CL_C;c++){
    const t=r/(CL_R-1), s=c/(CL_C-1), i=r*CL_C+c;
    const aOpen=lerp(.95,.5,Math.pow(t,.7));
    const a=aOpen+s*(TAU-2*aOpen);
    const rr=lerp(.17,.33,Math.pow(t,.85));
    const rx=rr*lerp(1.12,1.0,t), rz=rr*lerp(.82,1.0,t);
    base[i*3]=Math.sin(a)*rx; base[i*3+1]=.33-t*.9; base[i*3+2]=Math.cos(a)*rz-.025*(1-t);
    ang[i]=a; uv[i*2]=s; uv[i*2+1]=1-t;
  }
  for(let r=0;r<CL_R-1;r++)for(let c=0;c<CL_C-1;c++){
    const a=r*CL_C+c, b=(r+1)*CL_C+c, cc=r*CL_C+c+1, d=(r+1)*CL_C+c+1;
    idx.push(a,b,cc, b,d,cc);
  }
  pos.set(base);
  cg.setAttribute('position',new THREE.BufferAttribute(pos,3)); cg.setAttribute('uv',new THREE.BufferAttribute(uv,2)); cg.setIndex(idx);
  cg.computeVertexNormals();
  const cloak=mesh(cg,M.cloak,root,0,0,0,.011); cloak.frustumCulled=false;
  const lining=new THREE.Mesh(cg,M.lining); lining.frustumCulled=false; lining.castShadow=false; root.add(lining);
  R.cloak={mesh:cloak,lining,geo:cg,pos,base,ang};
  root.traverse(o=>{if(o.isMesh&&o.name!=='outline')o.castShadow=o.castShadow!==false;});
  if(!/[?&]nomerge/.test(location.search))mergeStatic(root,R);
  return R;
}
/* Draw-call diet: the Traveler is ~100 small primitives (+ an outline hull each, + a shadow pass each). Meshes that hang
   off the same bone with the same material and outline never move relative to each other, so they are baked into one
   mesh (and one outline) per bone/material. Anything the rig or other code holds a reference to (R.*), meshes with
   children, mirrored transforms and dynamic geometry are left alone, so the look and every animation are unchanged. */
function mergeStatic(root,R){
  const keep=new Set();
  const scan=(v,d)=>{ if(!v||d>4)return; if(v.isObject3D){keep.add(v);return;} if(v.isMaterial||v.isTexture||v.isBufferGeometry||ArrayBuffer.isView(v))return;
    if(Array.isArray(v)){v.forEach(x=>scan(x,d+1));return;} if(typeof v==='object')for(const k in v)scan(v[k],d+1); };
  scan(R,0);
  const parents=[]; root.traverse(o=>{ if(!o.isMesh)parents.push(o); });
  let merged=0;
  for(const par of parents){
    const buckets=new Map();
    for(const m of par.children){
      if(!m.isMesh||m.name==='outline'||keep.has(m)||!m.visible||Array.isArray(m.material)||m.material.isShaderMaterial)continue;
      if(m.children.some(c=>c.name!=='outline'))continue;
      const ol=m.children.find(c=>c.name==='outline')||null;
      m.updateMatrix(); if(m.matrix.determinant()<=0)continue;
      // (a hull is pushed out in object space, so a scaled part's outline is now uniform rather than stretched: ~mm, invisible)
      const g=m.geometry, sig=Object.keys(g.attributes).sort().join(',');
      if(g.morphAttributes&&Object.keys(g.morphAttributes).length)continue;
      const key=m.material.uuid+'|'+(ol?ol.material.uuid:'-')+'|'+m.castShadow+'|'+m.receiveShadow+'|'+m.renderOrder+'|'+m.frustumCulled+'|'+sig;
      if(!buckets.has(key))buckets.set(key,[]); buckets.get(key).push({m,ol});
    }
    for(const list of buckets.values()){
      if(list.length<2)continue;
      const parts=list.map(({m})=>{ const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
      const names=Object.keys(parts[0].attributes); let n=0; for(const g of parts)n+=g.attributes.position.count;
      const geo=new THREE.BufferGeometry();
      for(const a of names){ const sz=parts[0].attributes[a].itemSize, arr=new Float32Array(n*sz); let o=0;
        for(const g of parts){ arr.set(g.attributes[a].array,o); o+=g.attributes[a].array.length; } geo.setAttribute(a,new THREE.BufferAttribute(arr,sz)); }
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const f=list[0].m, mm=new THREE.Mesh(geo,f.material);
      mm.castShadow=f.castShadow; mm.receiveShadow=f.receiveShadow; mm.renderOrder=f.renderOrder; mm.frustumCulled=f.frustumCulled; mm.name='merged';
      if(list[0].ol){ const o=list[0].ol, s=new THREE.Mesh(geo,o.material); s.name='outline'; s.castShadow=false; s.receiveShadow=false; s.raycast=()=>{}; s.renderOrder=o.renderOrder; mm.add(s); }
      for(const {m} of list)par.remove(m);
      par.add(mm); merged+=list.length-1;
    }
  }
  if(R&&typeof R==='object')R.mergedMeshes=merged;
}

/* ---------------------------------------------------------------------
   module state
   --------------------------------------------------------------------- */
const P=G.player; // mutate the core stub in place (other modules may hold a reference)
const L=G.items.lantern, ST=G.items.staff;
let R=null, lanternObj=null, staffObj=null, reticle=null;
const tmp=new V3(), tmp2=new V3(), tmp3=new V3(), up=new V3(0,1,0);
const hv=new V3();            // horizontal velocity
let vy=0, coyote=0, jumpBuf=0, airT=0, fallTop=0, jumpHeld=false, wasGliding=false, glideT=0;
let rollT=-1, rollDur=.5, rollKind='roll'; const rollDir=new V3();
let hurtT=0, iframes=0, deadT=0, landT=0, landHeavy=0, stunT=0, interactT=0, stopT=0, shoveT=0;
let staminaDelay=0, attackHeld=0, staffDrawnT=0, staffDrawn=false, sprinting=false;
let ph=0, prevStep=0, turnRate=0, prevHeading=0, lookT=3, lookYaw=0, blinkT=2;
const atk={on:false,i:0,t:0,phase:'',queued:false,exclude:null,struck:false};
const charge={on:false,t:0,ready:0};
let spinT=-1, spinExclude=null, boltPoseT=0;
/* techniques (combat.js holds the numbers in G.moves.T): the move in progress, cooldowns, input buffers, air flags */
const MT=()=>(G.moves&&G.moves.T)||null;
const mv={id:null,t:0,phase:'',exclude:null,top:0,spd0:0,power:0,ry:0,label:''};
const cool={};
let atkBuf=0, rollBuf=0, postRollT=0, djUsed=false, dived=false, djFlipT=-1, atkHoldLock=false;
const aim={k:0,hit:null};
const SW=[
  {wind:.11,act:.1,rec:.24,dmg:2,kb:5,lunge:4.5},
  {wind:.1,act:.1,rec:.26,dmg:2,kb:5,lunge:4.5},
  {wind:.2,act:.12,rec:.44,dmg:3,kb:9,lunge:5.5}
];
const START={x:164,y:42,z:-4,yaw:PI/2};

/* pose: every animated degree of freedom */
const KEYS=['drop','hipX','hipY','hipZ','spX','spY','spZ','nkX','nkY','hdX','hdY','hdZ',
  'shLX','shLY','shLZ','elL','wrLX','wrLY','wrLZ','shRX','shRY','shRZ','elR','wrRX','wrRY','wrRZ',
  'thLX','thLZ','knL','ftL','thRX','thRZ','knR','ftR','rigZ','pivot','sq','tail'];
const pose={}, T={}; KEYS.forEach(k=>{pose[k]=0;T[k]=0;}); pose.sq=T.sq=1; pose.pivot=T.pivot=.45;
let rigX=0, rigY=0;

/* cloak dynamics */
const cl={lag:new V3(),lagV:new V3(),flare:.03,flareV:0,lift:0,liftV:0,rigid:.3};

/* ---------------------------------------------------------------------
   G.player API
   --------------------------------------------------------------------- */
Object.assign(P,{
  radius:.38,height:1.45,hp:10,maxHp:10,stamina:1,exhausted:false,alive:true,grounded:true,state:'idle',
  lockTarget:null,gliding:false,sprinting:false,inputEnabled:true,model:null,heading:START.yaw,camYaw:START.yaw,
  hands:{left:null,right:null},
  actionLock:0,speedMul:1,poseHooks:[], // hooks for other modules' actions (potions.js)
  hurt(info={}){
    if(!P.alive)return false;
    const kind=info.kind||'melee';
    const bypass=info.ignoreIframes||kind==='fall';
    if(!bypass&&(iframes>0||isRollInvuln()))return false;
    const dmg=Math.max(0,info.damage==null?1:info.damage);
    P.hp=Math.max(0,P.hp-dmg);
    if(kind!=='fall'){
      iframes=.9; hurtT=.36;
      const kb=info.knockback==null?5:info.knockback;
      if(info.dir){hv.set(info.dir.x,0,info.dir.z).multiplyScalar(kb);}
      if(kb>4&&P.grounded){vy=3.2; P.grounded=false; airT=0; fallTop=P.pos.y;}
      cancelCombat();
    }
    camShake(kind==='fall'?.35:.28);
    G.emit('player:hurt',{hp:P.hp,damage:dmg,info});
    try{G.ui.flash();}catch(e){}
    if(P.hp<=0)die();
    return true;
  },
  heal(n){P.hp=Math.min(P.maxHp,P.hp+n);},
  respawn(pos,yaw){
    const p=pos||checkpointPos();
    P.hp=P.maxHp; P.alive=true; P.stamina=1; P.exhausted=false; deadT=0; P.state='idle';
    rigX=rigY=0; pose.rigZ=T.rigZ=0; pose.pivot=.45; iframes=1.5; hurtT=0; stunT=0;
    P.teleport(p.x,p.y,p.z,yaw==null?(p.yaw==null?P.heading:p.yaw):yaw);
    G.emit('player:respawn',{pos:P.pos.clone()});
  },
  teleport(x,y,z,yaw){
    P.pos.set(x,y==null?G.floorAt(x,z):y,z);
    if(y!=null){const f=G.floorAt(x,z,P.pos.y+.5); if(Math.abs(f-P.pos.y)<1.2)P.pos.y=f;}
    hv.set(0,0,0); vy=0; P.vel.set(0,0,0); P.grounded=true; fallTop=P.pos.y; P.gliding=false; rollT=-1;
    mv.id=null; djUsed=false; dived=false; djFlipT=-1; atkBuf=rollBuf=postRollT=0;
    if(yaw!=null)P.heading=yaw;
    if(R){R.root.position.copy(P.pos); R.root.rotation.y=P.heading; R.root.updateMatrixWorld(true);}
    cam.snap=true; cam.yaw=P.heading; pend.reset=true;
    G.focus.copy(P.pos);
  },
  setControl(b){P.inputEnabled=!!b; if(!b){cancelCombat(); jumpBuf=0;}},
  facing(){return new V3(Math.sin(P.heading),0,Math.cos(P.heading));},
});
/* (getters via defineProperty: Object.assign would snapshot them) */
Object.defineProperty(P,'drawn',{configurable:true,get(){return staffDrawn;}});
/** techniques / air state for other modules and tests */
Object.defineProperty(P,'move',{configurable:true,get(){return {id:mv.id,phase:mv.phase,t:mv.t,power:mv.power,doubleJumped:djUsed,dived,aiming:aim.k>.5,aimK:aim.k,
  aimPoint:aim.hit?aim.hit.point.clone():null,lastAim:aim.last?aim.last.clone():null,cooldowns:Object.assign({},cool)};}});
P.pos.set(START.x,START.y,START.z);

/* ---------------------------------------------------------------------
   the Traveler's Cloak: worn or not (hood, capelet, long cloak, glide)
   --------------------------------------------------------------------- */
const CK={worn:null,unfurl:1,t:-1};
const hasCloak=()=>!!(G.items.cloak&&G.items.cloak.owned);
function applyCloak(worn){
  CK.worn=worn;
  if(!R)return;
  R.cloak.mesh.visible=R.cloak.lining.visible=worn; R.cape.visible=worn; R.hood.visible=worn; R.fold.visible=worn;
  R.hairOut.visible=!worn;
}
function syncCloak(){ const w=hasCloak(); if(w===CK.worn)return;
  if(w&&CK.worn===false&&G.state.mode==='play'&&R){CK.done=true; equipFlourish(); return;} // picked up some other way: still a flourish
  applyCloak(w); CK.unfurl=1; CK.t=-1; if(R){R.hood.scale.copy(R.hoodBase); R.cape.scale.set(1,1,.82);} }
function equipFlourish(){
  G.items.cloak=G.items.cloak||{owned:false}; G.items.cloak.owned=true;
  applyCloak(true); CK.t=0; CK.unfurl=0;
  if(R){R.hood.scale.setScalar(.01); R.cape.scale.set(.01,.01,.01);}
  if(R)for(let i=0;i<16;i++){const a=i/16*TAU; tmp3.set(P.pos.x+Math.cos(a)*.45,P.pos.y+.4+Math.random()*1.1,P.pos.z+Math.sin(a)*.45);
    spawnFx({pos:tmp3,vel:new V3(Math.cos(a)*.4,.6+Math.random()*.8,Math.sin(a)*.4),drag:2,size:.09,grow:.02,life:.9+Math.random()*.5,color:i%3?'#ffd98a':'#c9a6ff',tex:G.tex.flame});}
  if(R){spawnFx({pos:tmp3.set(P.pos.x,P.pos.y+1.1,P.pos.z),size:.4,grow:2.4,life:.5,color:'#ffe2b0',tex:G.tex.soft,opacity:.7});}
}
function updateCloakEquip(dt){
  syncCloak();
  if(CK.t<0||!R)return;
  CK.t+=dt; const k=clamp(CK.t/.6,0,1), e=1-Math.pow(1-k,3);
  CK.unfurl=e;
  const hb=R.hoodBase, hk=clamp((CK.t-.15)/.45,0,1), he=1-Math.pow(1-hk,3)+Math.sin(hk*PI)*.08;
  R.hood.scale.set(hb.x*he,hb.y*he,hb.z*he); R.cape.scale.set(e,e,.82*e);
  R.hairOut.visible=hk<.5;
  if(Math.random()<dt*30){const a=Math.random()*TAU; R.root.localToWorld(tmp3.set(Math.cos(a)*.3,.3+(1-e)*.6+Math.random()*.5,Math.sin(a)*.3));
    spawnFx({pos:tmp3,vel:new V3(0,.5,0),size:.07,grow:.01,life:.6,color:Math.random()<.5?'#ffd98a':'#c9a6ff',tex:G.tex.flame});}
  if(k>=1&&hk>=1){CK.t=-1; CK.unfurl=1; R.hood.scale.copy(hb); R.cape.scale.set(1,1,.82); R.hairOut.visible=false;}
}
P.setCloak=function(b){ G.items.cloak=G.items.cloak||{owned:false}; G.items.cloak.owned=!!b; if(!b)P.gliding=false; CK.t=-1; CK.unfurl=1;
  applyCloak(!!b); if(R){R.hood.scale.copy(R.hoodBase); R.cape.scale.set(1,1,.82);} };
P.hasCloak=hasCloak;
/** put the staff on the back (another module needs the right hand, e.g. to drink) */
P.sheathe=function(){ if(staffDrawn)sheathe(); };
G.on('cloak:found',()=>{ if(CK.t<0&&CK.worn&&CK.done)return; CK.done=true; equipFlourish(); });

function checkpointPos(){
  const c=G.state.checkpoint;
  if(c&&(c.x||c.y||c.z))return {x:c.x,y:c.y,z:c.z,yaw:G.state.checkpointYaw!=null?G.state.checkpointYaw:c.yaw};
  const s=(G.world.landmarks&&G.world.landmarks.start)||START;
  return {x:s.x,y:s.y,z:s.z,yaw:s.yaw==null?START.yaw:s.yaw};
}
function isRollInvuln(){return rollT>=0&&rollT>.02&&rollT<rollDur*.78;}
function cancelCombat(){atk.on=false; atk.queued=false; charge.on=false; charge.t=0; spinT=-1; attackHeld=0; if(mv.id)endMove(); atkBuf=0;}
function die(){
  if(!P.alive)return;
  P.alive=false; P.state='dead'; deadT=0; cancelCombat(); rollT=-1; P.gliding=false; P.lockTarget=null;
  G.setMode('dead');
  G.emit('player:dead',{pos:P.pos.clone()});
}

/* ---------------------------------------------------------------------
   FX: tiny sprite pool (dust, sparks, bolt trails)
   --------------------------------------------------------------------- */
const fx=[];
function spawnFx(o){
  let f=fx.find(f=>!f.alive);
  if(!f){ if(fx.length>80)return; const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,transparent:true,depthWrite:false})); s.frustumCulled=false; G.scene.add(s); f={s,alive:false}; fx.push(f); }
  f.alive=true; f.t=0; f.life=o.life||.5; f.s0=o.size||.3; f.s1=o.grow==null?f.s0*2:o.grow; f.op=o.opacity==null?1:o.opacity;
  f.vel=(o.vel||new V3()).clone(); f.drag=o.drag||0;
  const m=f.s.material; m.map=o.tex||G.tex.soft; m.color.copy(col(o.color||'#ffffff')); m.blending=o.additive===false?THREE.NormalBlending:THREE.AdditiveBlending; m.needsUpdate=true;
  f.s.position.copy(o.pos); f.s.visible=true; f.s.scale.setScalar(f.s0); m.opacity=f.op;
  return f;
}
function updateFx(dt){
  for(const f of fx){ if(!f.alive)continue; f.t+=dt; const k=f.t/f.life;
    if(k>=1){f.alive=false; f.s.visible=false; continue;}
    f.s.position.addScaledVector(f.vel,dt); if(f.drag)f.vel.multiplyScalar(Math.exp(-f.drag*dt));
    f.s.scale.setScalar(lerp(f.s0,f.s1,1-(1-k)*(1-k))); f.s.material.opacity=f.op*(1-k)*(k<.15?k/.15:1);
  }
}
function dust(p,n=3,size=.35){
  for(let i=0;i<n;i++){const a=Math.random()*TAU;
    spawnFx({pos:tmp3.set(p.x+Math.cos(a)*.1,p.y+.06,p.z+Math.sin(a)*.1),vel:new V3(Math.cos(a)*.7,.35+Math.random()*.3,Math.sin(a)*.7),drag:3,
      size:size*.6,grow:size*1.8,life:.55+Math.random()*.2,color:'#b8ad9c',opacity:.28,additive:false});}
}
function sparks(p,hex='#c9a6ff',n=6){
  spawnFx({pos:p,size:.25,grow:1.2,life:.18,color:'#f2e8ff',tex:G.tex.flame,opacity:1});
  for(let i=0;i<n;i++){const v=new V3(Math.random()-.5,Math.random()*.8,Math.random()-.5).normalize().multiplyScalar(3+Math.random()*3);
    spawnFx({pos:p,vel:v,drag:5,size:.12,grow:.02,life:.3,color:hex,tex:G.tex.flame});}
}

/* slash trail ribbon */
const TRAIL_N=12;
const trail={samples:[],mesh:null,geo:null};
function buildTrail(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(TRAIL_N*2*3),3));
  g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(TRAIL_N*2*3),3));
  const idx=[]; for(let i=0;i<TRAIL_N-1;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);} g.setIndex(idx);
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  m.frustumCulled=false; m.visible=false; G.scene.add(m); trail.mesh=m; trail.geo=g;
}
function updateTrail(dt,emit,a,b){
  const S=trail.samples;
  for(const s of S)s.age+=dt;
  while(S.length&&S[0].age>.16)S.shift();
  if(emit){S.push({a:a.clone(),b:b.clone(),age:0}); if(S.length>TRAIL_N)S.shift();}
  const n=S.length; if(n<2){trail.mesh.visible=false; return;}
  trail.mesh.visible=true;
  const pa=trail.geo.attributes.position.array, ca=trail.geo.attributes.color.array;
  const c=col('#b48cff');
  for(let i=0;i<TRAIL_N;i++){
    const s=S[Math.min(n-1,Math.max(0,i-(TRAIL_N-n)))];
    const k=Math.max(0,1-s.age/.16)*(i<TRAIL_N-n?0:1)*((i-(TRAIL_N-n)+1)/n);
    pa.set([s.a.x,s.a.y,s.a.z],i*6); pa.set([s.b.x,s.b.y,s.b.z],i*6+3);
    ca.set([0,0,0],i*6); ca.set([c.r*k*1.1,c.g*k*1.1,c.b*k*1.1],i*6+3);
  }
  trail.geo.attributes.position.needsUpdate=true; trail.geo.attributes.color.needsUpdate=true;
}

/* ---------------------------------------------------------------------
   camera
   --------------------------------------------------------------------- */
const cam={yaw:START.yaw,pitch:.26,zoom:5.5,cur:5.5,target:new V3(),look:new V3(),idle:9,shake:0,fov:58,snap:true,pos:new V3()};
function camShake(a){cam.shake=Math.max(cam.shake,a);}
G.on('player:hurt',()=>{});

/* ---------------------------------------------------------------------
   lantern logic
   --------------------------------------------------------------------- */
const pend={pos:new V3(),prev:new V3(),reset:true};
let lanternInteract=null;
function lanternPickup(){
  if(L.carried)return;
  const fromCradle=L.inCradle;
  L.carried=true; L.inCradle=false; L.found=true; pend.reset=true;
  G.flag('lanternFound',true);
  interactT=.38;
  G.emit('lantern:pickup',{pos:P.pos.clone(),fromCradle});
}
function lanternDrop(){
  if(!L.carried)return;
  const f=P.facing();
  const p={x:P.pos.x,y:P.pos.y,z:P.pos.z};
  const q=new V3(p.x,p.y,p.z); G.moveCharacter(q,f.x*.62,f.z*.62,.14,'lantern');
  L.pos.set(q.x,G.floorAt(q.x,q.z,P.pos.y+.4),q.z);
  L.carried=false; L.shut=false; interactT=.38;
  G.emit('lantern:drop',{pos:L.pos.clone()});
}
function updateLantern(dt){
  if(!lanternObj)return;
  const ud=lanternObj.userData;
  if(L.carried&&R){
    R.anchorL.getWorldPosition(tmp);
    if(pend.reset||dt<=0){pend.pos.copy(tmp).y-=.3; pend.prev.copy(pend.pos); pend.reset=false;}
    else{
      const h=Math.min(dt,1/30);
      const v=tmp2.copy(pend.pos).sub(pend.prev).multiplyScalar(.9);
      pend.prev.copy(pend.pos); pend.pos.add(v); pend.pos.y-=9.8*h*h*1.0;
      const d=tmp3.copy(pend.pos).sub(tmp); const len=d.length()||1; d.multiplyScalar(.3/len); pend.pos.copy(tmp).add(d);
    }
    const dir=tmp2.copy(tmp).sub(pend.pos).normalize();
    lanternObj.quaternion.setFromUnitVectors(up,dir);
    const qy=new THREE.Quaternion().setFromAxisAngle(up,P.heading); lanternObj.quaternion.multiply(qy);
    lanternObj.position.copy(tmp).addScaledVector(dir,-.43);
  }else{
    lanternObj.position.copy(L.pos); lanternObj.quaternion.identity();
  }
  if(ud.lit!==!L.shut)ud.setLit(!L.shut);
  if(ud.cured!==!!L.cured)ud.setCured(!!L.cured);
  const dark=G.atmo?G.atmo.dark:0;
  ud.tick(G.time,(L.cured?2.6:2.0)*(1+.3*dark));
  lanternObj.updateMatrixWorld(true);
  ud.flame.getWorldPosition(L.world);
}

/* ---------------------------------------------------------------------
   staff
   --------------------------------------------------------------------- */
let staffHolderBack=null, staffHolderHand=null;
function equipStaff(){
  ST.owned=true;
  if(!staffObj&&R){
    staffObj=G.models.staff();
    staffHolderBack=group(R.spine,0,.2,-.17); staffHolderBack.rotation.set(.05,0,.78);
    staffHolderHand=group(R.handR,0,-.035,.01); staffHolderHand.rotation.x=PI/2;
    sheathe();
  }
}
function drawStaff(){ if(!staffObj)return; staffDrawnT=3.2; if(staffDrawn)return; staffDrawn=true; staffHolderHand.add(staffObj); staffObj.position.set(0,-.48,0); staffObj.rotation.set(0,0,0); }
function sheathe(){ if(!staffObj)return; staffDrawn=false; staffHolderBack.add(staffObj); staffObj.position.set(0,-.78,0); staffObj.rotation.set(0,0,0); }
G.on('staff:pickup',()=>{equipStaff(); drawStaff(); interactT=.45;});

/* ---------------------------------------------------------------------
   combat
   --------------------------------------------------------------------- */
function aimForSwing(wish){
  if(P.lockTarget){P.heading=Math.atan2(P.lockTarget.pos.x-P.pos.x,P.lockTarget.pos.z-P.pos.z); return;}
  if(wish.lengthSq()>.01){P.heading=Math.atan2(wish.x,wish.z);}
  const t=G.combat.nearestTarget(P.pos,3.6,P.facing());
  if(t){const a=Math.atan2(t.pos.x-P.pos.x,t.pos.z-P.pos.z); if(Math.abs(U.angDiff(a,P.heading))<1.3)P.heading=a;}
}
function startSwing(i,wish){
  Object.assign(atk,{on:true,i,t:0,phase:'wind',queued:false,exclude:new Set(),struck:false});
  drawStaff(); aimForSwing(wish);
  G.emit('player:attack',{combo:i+1,charged:false});
}
function staffTip(out){ if(staffObj){staffObj.userData.tip.getWorldPosition(out);} else out.copy(P.pos).y+=1; return out; }
function staffMid(out){ if(staffObj){staffObj.localToWorld(out.set(0,.75,0));} else out.copy(P.pos).y+=1; return out; }
function doStrike(o){
  const hits=G.combat.strike(Object.assign({team:'player',kind:'melee',source:P},o));
  if(hits.length){
    stopT=Math.max(stopT,.055); camShake(.12);
    for(const h of hits){tmp3.set((o.x+h.pos.x)/2,Math.max(o.y,h.pos.y+.6),(o.z+h.pos.z)/2); sparks(tmp3);}
  }
  return hits;
}
function swingStrike(sw){
  const f=P.facing();
  staffTip(tmp); staffMid(tmp2);
  doStrike({x:tmp.x,y:tmp.y,z:tmp.z,radius:1.1,damage:sw.dmg,knockback:sw.kb,exclude:atk.exclude});
  doStrike({x:P.pos.x+f.x*1.0,y:P.pos.y+.85,z:P.pos.z+f.z*1.0,radius:1.1,damage:sw.dmg,knockback:sw.kb,exclude:atk.exclude});
}
/** o.point: fly to this aim point (from the reticle); o.great: the full-charge bolt */
function fireBolt(o={}){
  staffTip(tmp);
  const from=tmp.clone(); let dir, life=1.3;
  const A=MT()?MT().aim:null, B=A?(o.great?A.great:A.bolt):{dmg:4,kb:6,speed:24,radius:.38};
  const speed=B.speed;
  if(P.lockTarget){const t=P.lockTarget; tmp2.copy(t.pos); tmp2.y+=(t.height||1.4)*.55; dir=tmp2.sub(from).normalize();}
  else if(o.point){ dir=tmp2.copy(o.point).sub(from); const d=dir.length(); dir.normalize(); life=clamp(d/speed+.06,.12,2.6);
    P.heading=Math.atan2(dir.x,dir.z); }
  else{dir=P.facing(); const t=G.combat.nearestTarget(P.pos,16,dir); if(t&&Math.abs(U.angDiff(Math.atan2(t.pos.x-P.pos.x,t.pos.z-P.pos.z),P.heading))<.35){tmp2.copy(t.pos); tmp2.y+=(t.height||1.4)*.55; dir=tmp2.sub(from).normalize();}}
  const m=new THREE.Group(), gs=o.great?1.45:1;
  const core=new THREE.Mesh(new THREE.SphereGeometry(.11*gs,12,10),new THREE.MeshBasicMaterial({color:glowCol(o.great?'#ffe6c0':'#c9a8ff',3)})); m.add(core);
  m.add(sprite(G.tex.flame,o.great?'#d9b8ff':'#a070ff',.9*gs,1)); m.add(sprite(G.tex.soft,'#7a4cff',2.2*gs,.5));
  const proj=G.combat.spawnProjectile({pos:from,vel:dir.clone().multiplyScalar(speed),radius:B.radius,team:'player',damage:B.dmg,life,kind:'bolt',mesh:m,knockback:B.kb,
    onHit(h){sparks(proj.pos,'#c9a6ff',o.great?16:10); camShake(o.great?.2:.1); if(o.great)stopT=Math.max(stopT,.06);},
    onEnd(p){spawnFx({pos:p.pos,size:.4*gs,grow:1.8*gs,life:.3,color:'#a070ff',tex:G.tex.flame});}});
  proj.great=!!o.great;
  bolts.push(proj);
  G.emit('player:attack',{combo:0,charged:true,bolt:true,great:!!o.great});
  if(o.great&&G.moves)G.moves.sfx('great');
  boltPoseT=.3;
  return proj;
}
/** the aim ray: from the camera through the reticle, starting just past the Traveler */
function aimRay(){
  const c=G.camera, M=MT(); c.updateMatrixWorld();
  const from=c.position.clone(), dir=new V3(); c.getWorldDirection(dir);
  tmp3.set(P.pos.x,P.pos.y+1.1,P.pos.z).sub(from);
  const start=Math.max(.3,tmp3.dot(dir)+.35);
  return G.moves.raycast(from,dir,(M?M.aim.rayMax:60),{start});
}
function releaseCharge(ready){
  const A=MT()?MT().aim:{spinNear:4.5};
  if(P.lockTarget){
    if(ready>=2&&P.grounded&&U.dist2(P.lockTarget.pos,P.pos)<A.spinNear-(P.lockTarget.radius||.5))startSpin();
    else fireBolt({great:ready>=2});
    return;
  }
  if(aim.k>.5&&G.moves){
    const r=aimRay(); aim.hit=r; aim.last=r.point.clone();
    const near=Math.hypot(r.point.x-P.pos.x,r.point.z-P.pos.z)<A.spinNear&&r.point.y<P.pos.y+2.2;
    if(ready>=2&&near&&P.grounded)startSpin(); else fireBolt({point:r.point,great:ready>=2});
    return;
  }
  if(ready>=2&&P.grounded)startSpin(); else fireBolt({});
}
const bolts=[];
function updateBolts(){
  for(let i=bolts.length-1;i>=0;i--){const b=bolts[i]; if(G.combat.projectiles.indexOf(b)<0){bolts.splice(i,1);continue;}
    if(Math.random()<.8)spawnFx({pos:b.pos,size:.35,grow:.05,life:.25,color:'#8a5cff',tex:G.tex.flame,opacity:.8});}
}
function startSpin(){
  spinT=0; spinExclude=new Set(); drawStaff();
  G.emit('player:attack',{combo:0,charged:true,spin:true});
}

/* ---------------------------------------------------------------------
   lock-on
   --------------------------------------------------------------------- */
function camForward(){return new V3(Math.sin(cam.yaw),0,Math.cos(cam.yaw));}
function toggleLock(){
  if(P.lockTarget){P.lockTarget=null; return;}
  const t=G.combat.nearestTarget(P.pos,18,camForward());
  if(t){P.lockTarget=t; drawStaff();}
  else{cam.recenter=.35;} // Zelda: no target -> recentre the camera behind
}
function validateLock(){
  const t=P.lockTarget; if(!t)return;
  if(!G.hurtboxes.has(t)||(t.alive&&!t.alive())||U.dist2(t.pos,P.pos)>24){P.lockTarget=null;}
}

/* ---------------------------------------------------------------------
   player update
   --------------------------------------------------------------------- */
function update(dt){
  if(!R)return;
  const mode=G.state.mode;
  if(dt<=0){updateLantern(0);return;}
  if(!P.alive||mode==='dead'){
    deadT+=dt; P.state='dead'; hv.multiplyScalar(Math.exp(-4*dt));
    gravityOnly(dt); animate(dt); placeModel(); updateLantern(dt); G.focus.copy(P.pos); return;
  }
  let rdt=dt;
  if(stopT>0){stopT-=dt; rdt=dt*.06;}
  const I=G.input, ctl=P.inputEnabled&&mode==='play';
  // timers
  iframes=Math.max(0,iframes-dt); hurtT=Math.max(0,hurtT-dt); landT=Math.max(0,landT-dt); stunT=Math.max(0,stunT-dt);
  interactT=Math.max(0,interactT-dt); shoveT=Math.max(0,shoveT-dt); boltPoseT=Math.max(0,boltPoseT-dt);
  postRollT=Math.max(0,postRollT-dt); for(const k in cool)cool[k]=Math.max(0,cool[k]-dt);
  if(djFlipT>=0){djFlipT+=dt; if(djFlipT>.5)djFlipT=-1;}
  if(staffDrawn&&!atk.on&&!charge.on&&spinT<0&&!mv.id&&!P.lockTarget){staffDrawnT-=dt; if(staffDrawnT<=0)sheathe();}
  if(ST.owned&&!staffObj)equipStaff();
  updateCloakEquip(dt);
  // input -> camera-relative wish direction
  const mvIn=ctl?I.move():{x:0,y:0,mag:0};
  const fx_=Math.sin(cam.yaw), fz_=Math.cos(cam.yaw);
  const wish=new V3(fx_*mvIn.y-fz_*mvIn.x,0,fz_*mvIn.y+fx_*mvIn.x);
  const wl=wish.length(); if(wl>1e-3)wish.multiplyScalar(1/wl);
  const mag=ctl?mvIn.mag:0;
  // lock-on
  if(ctl&&I.pressed('lock'))toggleLock();
  validateLock();
  // jump input
  if(ctl&&I.pressed('jump'))jumpBuf=.15; else jumpBuf=Math.max(0,jumpBuf-dt);
  jumpHeld=ctl&&I.down('jump');
  const busy=hurtT>0||stunT>0||interactT>0||spinT>=0||P.actionLock>0; // actionLock: another module's committed action (potions.js: drinking)
  // roll / dodge (buffered); in the air it is the dive (once per jump)
  const M=MT();
  if(ctl&&I.pressed('roll'))rollBuf=M?M.buffer.roll:.1; else rollBuf=Math.max(0,rollBuf-dt);
  if(ctl&&rollBuf>0&&!busy&&rollT<0&&!charge.on&&(!atk.on||atk.phase==='rec')&&(!mv.id||moveCancellable())){
    if(P.grounded){rollBuf=0; if(mv.id)endMove(); startRoll(wish,mag);}
    else if(M&&!dived&&!mv.id&&airT>.04){rollBuf=0; startDive(wish,mag);}
  }
  // attacks
  if(ctl)handleAttack(rdt,wish,mag,busy); else if(charge.on){charge.on=false;}
  // interact + lantern
  const canInteract=ctl&&!busy&&rollT<0&&!atk.on&&!charge.on&&!mv.id&&P.grounded;
  const cur=ctl?G.interact.pick(P.pos):(G.interact.current=null);
  if(canInteract&&I.pressed('interact')){
    if(cur){try{cur.use();}catch(e){console.error(e);} interactT=Math.max(interactT,.3);}
    else if(L.carried)lanternDrop();
  }
  if(ctl&&L.carried){
    if(!cur&&hv.length()<.6&&P.grounded)G.hint('E','Set the lantern down');
    if(!L.cured){G.hint('F',L.shut?'Open the shutter':'Close the shutter');
      if(I.pressed('shutter')){L.shut=!L.shut; G.emit('lantern:shutter',{shut:L.shut});}}
  }
  // movement
  locomotion(rdt,wish,mag,ctl,busy);
  // stamina regen
  staminaDelay=Math.max(0,staminaDelay-dt);
  if(!sprinting&&!P.gliding&&staminaDelay<=0&&(P.grounded||!P.gliding)){
    P.stamina=Math.min(1,P.stamina+dt*(P.exhausted?.24:.38));
    if(P.exhausted&&P.stamina>=1)P.exhausted=false;
  }
  if(P.stamina<=0&&!P.exhausted){P.exhausted=true; P.stamina=0;}
  P.sprinting=sprinting;
  // state label
  P.state=hurtT>0?'hurt':rollT>=0?'roll':spinT>=0?'spin':mv.id?mv.id:atk.on?'attack':charge.on?'charge':P.gliding?'glide':!P.grounded?(vy>0?'jump':'fall'):
    interactT>0?'interact':P.exhausted?'exhausted':hv.length()>.3?(sprinting?'sprint':'move'):'idle';
  P.vel.set(hv.x,vy,hv.z);
  animate(rdt);
  placeModel();
  updateLantern(dt);
  G.focus.copy(P.pos);
}

function startRoll(wish,mag){
  if(P.exhausted)return;
  if(atk.on){atk.on=false; atk.queued=false;}
  P.stamina=Math.max(0,P.stamina-.1); staminaDelay=.5;
  rollT=0; rollKind='roll'; rollDur=.48;
  if(P.lockTarget){
    const f=P.facing(), rgt=new V3(-f.z,0,f.x).negate(); // character's right
    const fw=mag>.1?wish.dot(f):0, sd=mag>.1?wish.dot(rgt):0;
    if(Math.abs(sd)>Math.abs(fw)&&Math.abs(sd)>.3){rollKind=sd>0?'sideR':'sideL'; rollDur=.42; rollDir.copy(rgt).multiplyScalar(Math.sign(sd)); vy=3.6; P.grounded=false; airT=0;}
    else if(fw<-.3){rollKind='back'; rollDur=.5; rollDir.copy(f).negate(); vy=5.6; P.grounded=false; airT=0;}
    else rollDir.copy(mag>.1?wish:f);
  }else{
    rollDir.copy(mag>.1?wish:P.facing());
    P.heading=Math.atan2(rollDir.x,rollDir.z);
  }
  fallTop=P.pos.y;
}
/* the air roll: a forward dive out of a jump (or a glide). Strike during or after it for the Starfall Plunge. */
function startDive(wish,mag){
  const D=MT().dive; if(P.exhausted)return;
  P.stamina=Math.max(0,P.stamina-D.stamina); staminaDelay=.5;
  if(atk.on){atk.on=false; atk.queued=false;}
  P.gliding=false; rollT=0; rollKind='dive'; rollDur=D.dur; dived=true;
  rollDir.copy(mag>.1?wish:P.facing()); rollDir.y=0; rollDir.normalize();
  P.heading=Math.atan2(rollDir.x,rollDir.z);
  vy=Math.max(vy,D.vy);
  G.emit('player:dive',{pos:P.pos.clone()}); G.moves&&G.moves.sfx('dive');
  for(let i=0;i<6;i++){const a=i/6*TAU; spawnFx({pos:tmp3.set(P.pos.x+Math.cos(a)*.3,P.pos.y+.7,P.pos.z+Math.sin(a)*.3),vel:new V3(Math.cos(a)*.8-rollDir.x*1.5,.2,Math.sin(a)*.8-rollDir.z*1.5),drag:3,size:.12,grow:.02,life:.4,color:'#b58aff',tex:G.tex.flame});}
}
/* the double jump: a moth-wing flutter of the cloak, once per jump */
function canDoubleJump(ctl,busy){
  const M=MT(); if(!M||!ctl||busy||djUsed||mv.id||rollT>=0||dived||charge.on||P.exhausted||P.stamina<.02||coyote>0)return false;
  const D=M.doubleJump; if(D.needsCloak&&!hasCloak())return false;
  if(airT<D.minAir)return false;
  if(G.moves.noDoubleJump.some(f=>{try{return f(P.pos);}catch(e){return false;}}))return false;
  return P.pos.y-G.floorAt(P.pos.x,P.pos.z,P.pos.y)>D.minHeight;
}
function doDoubleJump(){
  const D=MT().doubleJump;
  vy=D.vy; djUsed=true; jumpBuf=0; P.gliding=false; djFlipT=0; airT=Math.min(airT,.2);
  P.stamina=Math.max(0,P.stamina-D.stamina); staminaDelay=.5;
  if(atk.on){atk.on=false; atk.queued=false;}
  // two pale moth wings open behind the shoulders and scatter into motes
  const f=P.facing(), rx=-f.z, rz=f.x;
  spawnFx({pos:tmp3.set(P.pos.x-f.x*.3,P.pos.y+1.0,P.pos.z-f.z*.3),vel:new V3(0,-.8,0),drag:3,size:1.1,grow:2.3,life:.45,color:'#9a62ff',tex:G.tex.moth,opacity:.85});
  for(const s of [-1,1])spawnFx({pos:tmp3.set(P.pos.x+rx*s*.5-f.x*.2,P.pos.y+1.1,P.pos.z+rz*s*.5-f.z*.2),vel:new V3(rx*s*1.4,.2,rz*s*1.4),drag:4,size:.45,grow:.9,life:.35,color:'#c9a6ff',tex:G.tex.moth,opacity:.6});
  for(let i=0;i<12;i++){const a=i/12*TAU; spawnFx({pos:tmp3.set(P.pos.x+Math.cos(a)*.35,P.pos.y+.15,P.pos.z+Math.sin(a)*.35),vel:new V3(Math.cos(a)*2.2,-1.2-Math.random(),Math.sin(a)*2.2),drag:3,size:.13,grow:.02,life:.5+Math.random()*.25,color:i%3?'#b58aff':'#f0e4ff',tex:G.tex.flame});}
  if(G.moves)G.moves.burst(tmp3.set(P.pos.x,P.pos.y-.05,P.pos.z),{radius:.9,life:.38,light:false,bright:1.4});
  G.emit('player:doublejump',{pos:P.pos.clone()}); G.moves&&G.moves.sfx('djump');
}

/* ---------------------------------------------------------------------
   techniques: lunge, sweep, slam, aerial spin, plunge (numbers in combat.js)
   --------------------------------------------------------------------- */
const coolReady=id=>!(cool[id]>0);
function pickCombo(){
  const M=MT(); if(!M)return null;
  const I=G.input;
  if(!P.grounded){
    if(dived)return coolReady('plunge')&&P.stamina>0?'plunge':coolReady('slam')?'slam':null;
    if(djUsed&&coolReady('spin')&&!P.gliding)return 'spin';
    if(coolReady('slam')&&airT>=M.slam.minAir&&(vy>0||P.pos.y-G.floorAt(P.pos.x,P.pos.z,P.pos.y)>M.slam.minHeight))return 'slam';
    return null;
  }
  const rolling=rollT>=0&&rollKind!=='dive';
  if((rolling&&rollT>=M.lunge.minRoll)||postRollT>0)return coolReady('lunge')?'lunge':null;
  if(rolling)return null;
  if(Math.hypot(hv.x,hv.z)>=M.sweep.minSpeed&&(sprinting||I.down('sprint'))&&coolReady('sweep')&&!P.exhausted)return 'sweep';
  return null;
}
function moveCancellable(){
  const m=MT()&&MT()[mv.id]; if(!m)return true;
  if(mv.id==='lunge'||mv.id==='sweep')return mv.t>m.act[1]+.06;
  return false;
}
function startMove(id,wish){
  const M=MT(), m=M[id];
  if(m.stamina){P.stamina=Math.max(0,P.stamina-m.stamina); staminaDelay=.5;}
  Object.assign(mv,{id,t:0,phase:'',exclude:new Set(),top:Math.max(fallTop,P.pos.y),spd0:Math.hypot(hv.x,hv.z),power:0,ry:0,label:''});
  atk.on=false; atk.queued=false; attackHeld=0; atkHoldLock=true; postRollT=0;
  drawStaff();
  if(id==='lunge'){ rollT=-1; aimForSwing(wish); }
  else if(id==='sweep'){ if(P.lockTarget)aimForSwing(wish); }
  else if(id==='slam'){ P.gliding=false; mv.phase='hang'; aimForSwing(wish); }
  else if(id==='spin'){ P.gliding=false; }
  else if(id==='plunge'){ rollT=-1; P.gliding=false; mv.phase='wind'; mv.label=djUsed?'high':''; aimForSwing(wish); }
  G.emit('player:attack',{combo:id,charged:false,move:id});
  if(G.moves){ G.moves.performed(id,{label:id==='plunge'&&djUsed&&m.fromDoubleJump?m.fromDoubleJump:''}); G.moves.sfx(id==='slam'?'slamUp':id==='plunge'?'plungeUp':id); }
}
function endMove(){
  const m=MT()&&MT()[mv.id];
  if(m&&m.cooldown)cool[mv.id]=m.cooldown;
  mv.id=null; mv.phase=''; mv.t=0;
}
function moveStrike(x,y,z,radius,dmg,kb,kind){
  return doStrike({x,y,z,radius,damage:dmg,knockback:kb,kind:kind||'melee',exclude:mv.exclude});
}
function updateMove(dt){
  if(!mv.id)return;
  const M=MT(), m=M[mv.id], f=P.facing();
  mv.t+=dt;
  switch(mv.id){
    case 'lunge':{
      if(mv.t>=m.act[0]&&mv.t<=m.act[1]){ staffTip(tmp);
        moveStrike(tmp.x,tmp.y,tmp.z,m.radius,m.dmg,m.kb);
        moveStrike(P.pos.x+f.x*m.reach,P.pos.y+.9,P.pos.z+f.z*m.reach,m.radius,m.dmg,m.kb); }
      if(mv.t>=m.dur)endMove();
      break;}
    case 'sweep':{
      if(mv.t>=m.act[0]&&mv.t<=m.act[1]){ moveStrike(P.pos.x+f.x*.35,P.pos.y+.7,P.pos.z+f.z*.35,m.radius,m.dmg,m.kb);
        if(Math.random()<.5)dust(P.pos,1,.4); }
      if(mv.t>=m.dur)endMove();
      break;}
    case 'slam':{
      if(mv.phase==='hang'&&mv.t>=m.hang)mv.phase='fall';
      if(mv.phase==='impact'&&mv.t>=m.recover)endMove();
      break;}
    case 'spin':{
      if(mv.t<m.dur*.92)moveStrike(P.pos.x,P.pos.y+.7,P.pos.z,m.radius,m.dmg,m.kb);
      if(Math.random()<dt*30){staffTip(tmp); spawnFx({pos:tmp,size:.18,grow:.05,life:.3,color:'#c9a6ff',tex:G.tex.flame});}
      if(mv.t>=m.dur)endMove();
      break;}
    case 'plunge':{
      if(mv.phase==='wind'&&mv.t>=m.wind){mv.phase='drop';}
      if(mv.phase==='drop'&&Math.random()<dt*40){spawnFx({pos:tmp3.set(P.pos.x+(Math.random()-.5)*.5,P.pos.y+.4+Math.random()*1.2,P.pos.z+(Math.random()-.5)*.5),vel:new V3(0,4,0),drag:2,size:.16,grow:.03,life:.35,color:'#b58aff',tex:G.tex.flame});}
      if(mv.phase==='impact'&&mv.t>=m.recover)endMove();
      break;}
  }
}
/** slam / plunge touch down (called from land) */
function moveLand(floor){
  const M=MT(), m=M[mv.id];
  const drop=Math.max(0,mv.top-floor);
  if(mv.id==='slam'){
    mv.phase='impact'; mv.t=0;
    const hits=moveStrike(P.pos.x,P.pos.y+.5,P.pos.z,m.radius,m.dmg,m.kb,'shockwave');
    camShake(.22); stopT=Math.max(stopT,hits.length?.07:.03); dust(P.pos,7,.5);
    if(G.moves){G.moves.burst(P.pos,{radius:m.radius,life:.4,lightI:1.6,bright:1.3}); G.moves.sfx('slam');}
    try{G.ui.shake(.18);}catch(e){}
  }else if(mv.id==='plunge'){
    mv.phase='impact'; mv.t=0;
    const high=mv.label==='high';
    const dmg=Math.min(m.dmgMax,m.dmg+(high?m.djBonus:0)+Math.floor(m.dmgPerM*drop)), rad=Math.min(m.radiusMax,m.radius+(high?m.djRadius:0)+m.radiusPerM*drop);
    mv.power=dmg;
    const hits=moveStrike(P.pos.x,P.pos.y+.6,P.pos.z,rad,dmg,m.kb,'shockwave');
    camShake(m.shake); stopT=Math.max(stopT,hits.length?m.hitstop:.05); dust(P.pos,10,.7);
    try{G.ui.shake(m.shake*.6);}catch(e){}
    if(G.moves){G.moves.burst(P.pos,{radius:rad,life:.65,lightI:2.6,bright:1.5}); G.moves.burst(P.pos,{radius:rad*.5,life:.32,light:false,color:'#c9a6ff',bright:1.1}); G.moves.sfx('plunge');}
    for(let i=0;i<22;i++){const a=i/22*TAU, s=3+Math.random()*4;
      spawnFx({pos:tmp3.set(P.pos.x+Math.cos(a)*.6,P.pos.y+.2,P.pos.z+Math.sin(a)*.6),vel:new V3(Math.cos(a)*s,1.5+Math.random()*3,Math.sin(a)*s),drag:3,size:.2,grow:.04,life:.55+Math.random()*.3,color:i%4?'#a070ff':'#ffe6b8',tex:G.tex.flame});}
    spawnFx({pos:tmp3.set(P.pos.x,P.pos.y+.7,P.pos.z),size:.8,grow:rad*1.3,life:.3,color:'#9f6cff',tex:G.tex.flame,opacity:.42});
    G.emit('player:plunge',{pos:P.pos.clone(),damage:dmg,radius:rad,hits:hits.length,drop,high});
    if(G.input.rumble&&G.input.device==='gamepad')G.input.rumble(.9,320);
  }
}
/** horizontal motion while a technique runs */
function moveHorizontal(dt,wish,mag){
  const M=MT(), m=M[mv.id], f=P.facing();
  if(P.lockTarget&&(mv.id==='lunge'||mv.phase==='wind'))P.heading=U.dampAngle(P.heading,Math.atan2(P.lockTarget.pos.x-P.pos.x,P.lockTarget.pos.z-P.pos.z),18,dt);
  if(mv.phase==='impact'){hv.x=damp(hv.x,0,16,dt); hv.z=damp(hv.z,0,16,dt); return;}
  switch(mv.id){
    case 'lunge':{
      let s=lerp(m.speed0,m.speed1,smooth(0,m.dur*.75,mv.t));
      if(P.lockTarget&&U.dist2(P.lockTarget.pos,P.pos)<(P.lockTarget.radius||.5)+.9)s=Math.min(s,1);
      hv.set(f.x*s,0,f.z*s); break;}
    case 'sweep':{
      if(mag>.1)P.heading=U.dampAngle(P.heading,Math.atan2(wish.x,wish.z),2,dt);
      const ff=P.facing(), s=lerp(Math.max(m.minSpeed,mv.spd0)*m.carry,m.speedEnd,smooth(0,m.dur,mv.t));
      hv.set(ff.x*s,0,ff.z*s); break;}
    case 'slam': case 'plunge':{
      const k=mv.phase==='hang'||mv.phase==='wind'?10:4, s=mv.phase==='drop'||mv.phase==='fall'?1.8:0;
      hv.x=damp(hv.x,wish.x*s*mag,k,dt); hv.z=damp(hv.z,wish.z*s*mag,k,dt); break;}
    case 'spin':{
      hv.x=damp(hv.x,wish.x*3.2*mag,3,dt); hv.z=damp(hv.z,wish.z*3.2*mag,3,dt); break;}
  }
}
/** vertical override while a technique runs: returns the new vy, or null for normal gravity */
function moveVy(dt){
  if(!mv.id)return null;
  const m=MT()[mv.id];
  if(mv.id==='slam'){ if(mv.phase==='hang')return damp(vy,m.hangVy,18,dt); if(mv.phase==='fall')return m.fallVy; }
  if(mv.id==='plunge'){ if(mv.phase==='wind')return damp(vy,m.windVy,14,dt); if(mv.phase==='drop')return m.fallVy; }
  if(mv.id==='spin'&&mv.t<m.dur*.8)return damp(vy,m.hoverVy,9,dt);
  return null;
}

function handleAttack(dt,wish,mag,busy){
  const I=G.input, M=MT();
  if(!ST.owned){
    if(I.pressed('attack')&&!busy&&rollT<0&&shoveT<=0){shoveT=.32; G.emit('player:attack',{combo:1,charged:false,shove:true});}
    return;
  }
  if(atkHoldLock&&!I.down('attack'))atkHoldLock=false;
  if(I.down('attack')&&!atkHoldLock)attackHeld+=dt; else attackHeld=0;
  if(I.pressed('attack'))atkBuf=M?M.buffer.attack:.12; else atkBuf=Math.max(0,atkBuf-dt);
  if(atkBuf>0&&!busy&&!charge.on&&!mv.id){
    const c=pickCombo();
    if(c){atkBuf=0; startMove(c,wish);}
    else if(P.grounded&&rollT<0){atkBuf=0; if(atk.on)atk.queued=true; else startSwing(0,wish);}
  }
  // swing progress
  if(atk.on){
    const sw=SW[atk.i]; atk.t+=dt;
    if(atk.t<sw.wind)atk.phase='wind';
    else if(atk.t<sw.wind+sw.act){atk.phase='act'; swingStrike(sw);}
    else if(atk.t<sw.wind+sw.act+sw.rec){atk.phase='rec';
      if(atk.queued&&atk.t>sw.wind+sw.act+.04){startSwing((atk.i+1)%3,wish);}}
    else {atk.on=false;}
  }
  // charge: hold attack
  if(!charge.on&&attackHeld>.24&&(!atk.on||atk.phase==='rec')&&rollT<0&&!busy&&!mv.id&&P.grounded){
    atk.on=false; atk.queued=false; charge.on=true; charge.t=0; charge.ready=0; drawStaff();
  }
  if(charge.on){
    charge.t+=dt; staffDrawnT=3;
    if(charge.ready<1&&charge.t>=.38){charge.ready=1; staffTip(tmp); spawnFx({pos:tmp,size:.3,grow:1.4,life:.3,color:'#d8c0ff',tex:G.tex.flame});}
    if(charge.ready<2&&charge.t>=1.3){charge.ready=2; staffTip(tmp); spawnFx({pos:tmp,size:.5,grow:2.2,life:.4,color:'#ffe9b0',tex:G.tex.flame});}
    if(Math.random()<dt*14){staffTip(tmp); spawnFx({pos:tmp.add(new V3(Math.random()-.5,Math.random()-.5,Math.random()-.5).multiplyScalar(.5)),vel:new V3(0,.4,0),size:.08,grow:.02,life:.4,color:'#b58aff',tex:G.tex.flame});}
    if(!I.down('attack')){
      const ready=charge.ready; charge.on=false; attackHeld=0;
      if(ready>=1)releaseCharge(ready);
    }
  }
  updateMove(dt);
  // spin attack
  if(spinT>=0){
    spinT+=dt;
    if(spinT>.06&&spinT<.42)doStrike({x:P.pos.x,y:P.pos.y+.8,z:P.pos.z,radius:2.0,damage:4,knockback:10,exclude:spinExclude});
    if(spinT>.55)spinT=-1;
  }
}

function locomotion(dt,wish,mag,ctl,busy){
  const I=G.input;
  const spd=hv.length();
  sprinting=false;
  const f=P.facing();
  if(rollT>=0){
    rollT+=dt; const k=rollT/rollDur;
    const D=rollKind==='dive'&&MT()?MT().dive:null;
    const rs=D?lerp(D.speed0,D.speed1,k):rollKind==='roll'?lerp(9.2,3.2,k):rollKind==='back'?lerp(6.2,2,k):lerp(7.4,2.4,k);
    hv.copy(rollDir).multiplyScalar(rs);
    if((rollKind==='roll'||D)&&ctl&&mag>.1){const a=Math.atan2(wish.x,wish.z); const h=U.dampAngle(Math.atan2(rollDir.x,rollDir.z),a,D?2.5:4,dt); rollDir.set(Math.sin(h),0,Math.cos(h)); P.heading=h;}
    if(P.lockTarget&&rollKind!=='roll'&&!D)P.heading=Math.atan2(P.lockTarget.pos.x-P.pos.x,P.lockTarget.pos.z-P.pos.z);
    if(rollT>=rollDur){ if(P.grounded&&rollKind!=='dive'&&MT())postRollT=MT().lunge.window;
      rollT=-1; if(rollKind==='roll'&&spd>2)dust(P.pos,2,.3);}
  }else if(mv.id){
    moveHorizontal(dt,wish,mag);
  }else if(!P.grounded){
    airControl(dt,wish,mag,ctl);
  }else if(hurtT>0||stunT>0){
    hv.x=damp(hv.x,0,stunT>0?14:5,dt); hv.z=damp(hv.z,0,stunT>0?14:5,dt);
  }else if(atk.on){
    const sw=SW[atk.i];
    let lunge=0;
    if(atk.t>sw.wind*.4&&atk.t<sw.wind+sw.act){lunge=sw.lunge; if(P.lockTarget&&U.dist2(P.lockTarget.pos,P.pos)<(P.lockTarget.radius||.5)+1.1)lunge=0;}
    hv.x=damp(hv.x,f.x*lunge,18,dt); hv.z=damp(hv.z,f.z*lunge,18,dt);
    if(P.lockTarget)P.heading=U.dampAngle(P.heading,Math.atan2(P.lockTarget.pos.x-P.pos.x,P.lockTarget.pos.z-P.pos.z),18,dt);
  }else if(spinT>=0||interactT>0||shoveT>0){
    hv.x=damp(hv.x,0,12,dt); hv.z=damp(hv.z,0,12,dt);
  }else{
    sprinting=ctl&&I.down('sprint')&&mag>.3&&!P.exhausted&&!P.lockTarget&&!charge.on;
    let target=mag<.08?0:P.exhausted?2.3:sprinting?8.4:lerp(1.7,5.4,smooth(.25,.9,mag));
    if(charge.on)target=Math.min(target,2.1);
    if(P.speedMul!=null&&P.speedMul<1)target*=Math.max(0,P.speedMul);
    if(sprinting){P.stamina=Math.max(0,P.stamina-dt*.2); staminaDelay=.6; if(P.stamina<=0){P.exhausted=true; sprinting=false;}}
    if(P.lockTarget){
      target=Math.min(target,4.2);
      P.heading=U.dampAngle(P.heading,Math.atan2(P.lockTarget.pos.x-P.pos.x,P.lockTarget.pos.z-P.pos.z),14,dt);
      hv.x=damp(hv.x,wish.x*target,10,dt); hv.z=damp(hv.z,wish.z*target,10,dt);
    }else if(charge.on){
      if(aim.k>.3)P.heading=U.dampAngle(P.heading,cam.yaw,16,dt); // over-the-shoulder aim: face where the reticle looks, strafe
      else if(mag>.08){const a=Math.atan2(wish.x,wish.z); P.heading=U.dampAngle(P.heading,a,8,dt);}
      hv.x=damp(hv.x,wish.x*target,10,dt); hv.z=damp(hv.z,wish.z*target,10,dt);
    }else if(mag>.08){
      const a=Math.atan2(wish.x,wish.z), diff=U.angDiff(a,P.heading);
      if(Math.abs(diff)>2.5&&spd>5.5){ // skid-turn
        hv.multiplyScalar(Math.exp(-dt*10)); P.heading=U.dampAngle(P.heading,a,9,dt);
        if(Math.random()<.3)dust(P.pos,1,.3);
      }else{
        P.heading=U.dampAngle(P.heading,a,sprinting?7.5:spd<2?16:11,dt);
        const along=Math.max(0,Math.cos(U.angDiff(a,P.heading)));
        const ff=P.facing(); const tgt=target*(.35+.65*along);
        const rate=tgt>spd?(sprinting?5:9):11;
        hv.x=damp(hv.x,ff.x*tgt,rate,dt); hv.z=damp(hv.z,ff.z*tgt,rate,dt);
      }
    }else{
      hv.x=damp(hv.x,0,12,dt); hv.z=damp(hv.z,0,12,dt);
    }
  }
  // jumping
  if(P.grounded&&jumpBuf>0&&ctl&&!busy&&rollT<0&&!atk.on&&!charge.on&&spinT<0&&!mv.id){doJump();}
  else if(!P.grounded&&jumpBuf>0&&canDoubleJump(ctl,busy)){doDoubleJump();}
  // horizontal collision move
  const dx=hv.x*dt, dz=hv.z*dt, d=Math.hypot(dx,dz);
  if(d>1e-5){
    const n=Math.max(1,Math.ceil(d/.25));
    for(let i=0;i<n;i++){const r=G.moveCharacter(P.pos,dx/n,dz/n,P.radius,'player');
      if(r.blocked){
        // airborne over open water: keep flying (we respawn on splash-down)
        const nx=P.pos.x+dx/n, nz=P.pos.z+dz/n;
        if(!P.grounded&&!G.world.walkable(nx,nz)&&G.floorAt(nx,nz,P.pos.y)<P.pos.y-.2){P.pos.x=nx; P.pos.z=nz; continue;}
        if(!P.grounded){hv.multiplyScalar(.5);} break;}}
  }
  verticalStep(dt,ctl);
}
function doJump(){
  vy=7.3; P.grounded=false; jumpBuf=0; coyote=0; airT=0; fallTop=P.pos.y;
  if(hv.length()>4)dust(P.pos,2,.3);
}
function airControl(dt,wish,mag,ctl){
  const I=G.input;
  airT+=dt;
  const h=P.pos.y-G.floorAt(P.pos.x,P.pos.z,P.pos.y);
  // glide: hold jump while falling
  const wantGlide=hasCloak()&&ctl&&I.down('jump')&&!P.exhausted&&P.stamina>0&&h>1.1&&(vy<-1||airT>.32||P.gliding)&&rollT<0&&!mv.id&&!(djUsed&&vy>0);
  if(wantGlide&&!P.gliding){P.gliding=true; glideT=0; cancelCombat();}
  if(P.gliding&&(!wantGlide)){P.gliding=false; fallTop=P.pos.y;}
  if(P.gliding){
    glideT+=dt;
    P.stamina=Math.max(0,P.stamina-dt*.038); staminaDelay=.6;
    if(P.stamina<=0){P.exhausted=true; P.gliding=false; fallTop=P.pos.y;}
    if(mag>.08)P.heading=U.dampAngle(P.heading,Math.atan2(wish.x,wish.z),2.4,dt);
    const ff=P.facing(); const gs=mag>.08?lerp(5,7.2,mag):4.6;
    hv.x=damp(hv.x,ff.x*gs,1.6,dt); hv.z=damp(hv.z,ff.z*gs,1.6,dt);
  }else if(mag>.08){
    const cur=Math.max(hv.length(),4.2);
    hv.x=damp(hv.x,wish.x*cur,2.6,dt); hv.z=damp(hv.z,wish.z*cur,2.6,dt);
    P.heading=U.dampAngle(P.heading,Math.atan2(wish.x,wish.z),5,dt);
  }
}
function verticalStep(dt,ctl){
  const floor=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.05);
  if(P.grounded){
    if(P.pos.y-floor>.45){P.grounded=false; coyote=.16; vy=0; airT=0; fallTop=P.pos.y;}
    else{P.pos.y=floor; vy=0;}
  }
  if(!P.grounded){
    if(coyote>0&&jumpBuf>0&&ctl&&rollT<0){doJump();}
    coyote=Math.max(0,coyote-dt);
    let g=vy>0?(jumpHeld?21:36):30;
    if(rollT>=0&&rollKind!=='roll')g=22;
    const ov=moveVy(dt);
    if(ov!=null)vy=ov; else vy-=g*dt;
    if(P.gliding)vy=damp(vy,-1.9,5,dt);
    vy=Math.max(vy,-42);
    P.pos.y+=vy*dt;
    if(P.gliding)fallTop=P.pos.y; else fallTop=Math.max(fallTop,P.pos.y);
    wasGliding=P.gliding;
    const f2=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.3);
    if(P.pos.y<=f2&&vy<=0){land(f2);}
  }
  // water / void
  if(P.pos.y<-3||(!G.world.walkable(P.pos.x,P.pos.z)&&(P.grounded||P.pos.y<G.world.seaLevel+.2))){fallRespawn();}
}
function land(floor){
  const drop=fallTop-floor, impact=-vy;
  P.pos.y=floor; vy=0; P.grounded=true; P.gliding=false; coyote=0;
  djUsed=false; dived=false;
  if(rollT>=0&&rollKind==='dive'){rollKind='roll'; rollDur=.48; rollT=Math.max(rollT,.22); rollDir.set(hv.x,0,hv.z); if(rollDir.lengthSq()<.01)rollDir.copy(P.facing()); rollDir.normalize();}
  else if(rollT>=0&&rollKind!=='roll'){rollT=-1;}
  const tech=mv.id==='slam'||mv.id==='plunge';
  if(tech)moveLand(floor); else if(mv.id==='spin')endMove();
  if(drop>14){P.hurt({damage:2,kind:'fall',dir:new V3(),knockback:0}); landHeavy=1; landT=.55; stunT=.45; dust(P.pos,6,.5); camShake(.4);}
  else if(tech){landT=0; fallTop=floor; return;}
  else if(drop>3.2){landHeavy=1; landT=.38; stunT=drop>7?.22:0; dust(P.pos,5,.45); camShake(.12);}
  else if(impact>3){landHeavy=0; landT=.2; dust(P.pos,2,.3);}
  fallTop=floor;
}
function gravityOnly(dt){
  const floor=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.05);
  if(P.pos.y>floor+.01){vy-=30*dt; P.pos.y=Math.max(floor,P.pos.y+vy*dt);} else {P.pos.y=floor; vy=0;}
  const dx=hv.x*dt,dz=hv.z*dt; if(Math.hypot(dx,dz)>1e-5)G.moveCharacter(P.pos,dx,dz,P.radius,'player');
}
function fallRespawn(){
  const c=checkpointPos();
  P.gliding=false;
  P.teleport(c.x,c.y,c.z,c.yaw==null?P.heading:c.yaw);
  iframes=0;
  P.hurt({damage:1,kind:'fall',dir:new V3(),knockback:0,ignoreIframes:true});
  if(P.alive){iframes=1.2;}
}

/* ---------------------------------------------------------------------
   procedural animation
   --------------------------------------------------------------------- */
function setT(o){for(const k in o)T[k]=o[k];}
function legIKDrop(){
  const hy=(t,k)=>.02+THIGH*Math.cos(t)+SHIN*Math.cos(t+k)+FOOT-.02;
  return HIP_Y-Math.max(hy(pose.thLX,pose.knL),hy(pose.thRX,pose.knR));
}
function animate(dt){
  const t=G.time;
  const spd=Math.hypot(hv.x,hv.z);
  const run=smooth(1.8,5.2,spd), walk=smooth(.15,1.2,spd), spr=smooth(5.6,8,spd);
  // turning rate for banking
  const dh=U.angDiff(P.heading,prevHeading); prevHeading=P.heading;
  turnRate=damp(turnRate,dt>0?clamp(dh/dt,-6,6):0,8,dt);
  KEYS.forEach(k=>T[k]=0); T.sq=1; T.pivot=.45;
  let rate=12, ik=P.grounded, rigMode=0;
  // ---- base: idle ----
  const br=Math.sin(t*1.9);
  setT({spX:.03+br*.018,shLZ:.13+br*.01,shRZ:-.13-br*.01,elL:-.18,elR:-.18,hdX:-.03-br*.01,nkX:.02,hipZ:Math.sin(t*.45)*.025,spZ:-Math.sin(t*.45)*.02,
    thLX:-.03,thRX:.03,knL:.06,knR:.06,ftL:-.03,ftR:-.03,thLZ:.03,thRZ:-.03});
  lookT-=dt; if(lookT<0){lookT=3+Math.random()*4; lookYaw=Math.random()<.5?0:(Math.random()-.5)*1.3;}
  if(spd<.3)T.hdY=lookYaw;
  // blink
  blinkT-=dt; if(blinkT<0){R.faceMat.map=R.faceBlink; if(blinkT<-.12){blinkT=2+Math.random()*3.5; R.faceMat.map=R.faceOpen;}}
  // ---- locomotion cycle ----
  if(P.grounded&&walk>0.01&&rollT<0){
    const perM=lerp(3.4,1.3,smooth(1,8.2,spd));
    ph+=spd*perM*dt;
    // local direction of travel (for strafing)
    const ch=Math.cos(P.heading), sh=Math.sin(P.heading);
    const lx=(hv.x*ch-hv.z*sh)/(spd||1), lz=(hv.x*sh+hv.z*ch)/(spd||1);
    const fwd=P.lockTarget?lz:1, side=P.lockTarget?lx:0;
    const amp=lerp(.38,.78,run)+spr*.12, kA=lerp(.55,1.45,run)+spr*.2;
    const s=Math.sin(ph), c=Math.cos(ph);
    const w=walk;
    T.thLX=lerp(T.thLX,-s*amp*fwd,w); T.thRX=lerp(T.thRX,s*amp*fwd,w);
    T.thLZ+=s*amp*side*.5*w; T.thRZ+=-s*amp*side*.5*w;
    T.knL=lerp(T.knL,.12+kA*Math.max(0,c*Math.sign(fwd||1))+run*.15,w); T.knR=lerp(T.knR,.12+kA*Math.max(0,-c*Math.sign(fwd||1))+run*.15,w);
    T.ftL=-(T.thLX+T.knL)*.55+.12*s; T.ftR=-(T.thRX+T.knR)*.55-.12*s;
    const arm=lerp(.3,.75,run)+spr*.2;
    T.shLX=s*arm*w; T.shRX=-s*arm*w; T.elL=-.25-run*.85; T.elR=-.25-run*.85;
    T.shLZ=.12+run*.1; T.shRZ=-.12-run*.1;
    T.spX+=(.05+run*.14+spr*.14)*w; T.spY=s*.13*run; T.hipY=-s*.12*run; T.hdX-=run*.1;
    T.rigZ=clamp(-turnRate*.045*run,-.32,.32);
    // footstep dust
    const st=Math.sign(s); if(st!==prevStep){prevStep=st; if(spd>4.6){const fp=(st>0?R.ftR:R.ftL).getWorldPosition(tmp3); dust(fp,spr>.5?3:2,.32);}}
  }
  if(P.exhausted&&P.grounded&&rollT<0){T.spX+=.42+Math.sin(t*9)*.05; T.hdX+=.15; T.shLX-=.3; T.shRX-=.3; T.elL=-.3; T.elR=-.3;}
  // ---- staff carried (drawn, idle/moving) ----
  if(staffDrawn&&!atk.on&&!charge.on&&spinT<0){T.shRX=-.25+T.shRX*.3; T.shRZ=-.18; T.elR=-1.2; T.wrRX=.05;}
  // ---- lantern held ahead (Explore pose) ----
  const holdL=L.carried;
  // ---- airborne ----
  if(!P.grounded&&rollT<0){
    ik=false;
    if(P.gliding){
      const g=Math.min(1,glideT*4);
      setT({spX:.28,spY:0,spZ:0,hdX:-.32,shLZ:1.38,shRZ:-1.38,shLX:-.3,shRX:-.3,shLY:.15,shRY:-.15,elL:-.12,elR:-.12,
        thLX:.22+Math.sin(t*3)*.08,thRX:.32-Math.sin(t*3)*.08,knL:.55,knR:.65,ftL:.4,ftR:.4,thLZ:.06,thRZ:-.06});
      T.rigZ=clamp(-turnRate*.12,-.45,.45); rate=6*g+2;
    }else if(vy>0){
      setT({spX:.12,thLX:-.95,knL:1.25,ftL:.2,thRX:.25,knR:.55,ftR:.3,shLX:-.6,shRX:.35,shLZ:.35,shRZ:-.5,elL:-.6,elR:-.4,hdX:-.1});
      rate=14;
    }else{
      const fl=Math.sin(t*14)*.1;
      setT({spX:.08,thLX:-.45,knL:.8,thRX:.1,knR:.45,ftL:.2,ftR:.25,shLZ:.75+fl,shRZ:-.75+fl,shLX:-.3,shRX:-.3,elL:-.4,elR:-.4,hdX:-.05});
      rate=8;
    }
    // double jump: arms sweep up like opening wings, knees tuck, one quick forward flip
    if(djFlipT>=0&&!P.gliding){
      const k=clamp(djFlipT/.38,0,1), op=Math.sin(Math.min(1,djFlipT/.22)*PI*.5);
      rigMode=1; rigX=TAU*smooth(.05,1,k);
      setT({spX:.55,hdX:.3,thLX:-1.45,knL:2.1,thRX:-1.3,knR:2.0,ftL:.4,ftR:.4,shLZ:.5+1.0*op,shRZ:-.5-1.0*op,shLX:-.5,shRX:-.5,elL:-.5,elR:-.5,pivot:.62});
      rate=26;
    }
  }
  // ---- landing ----
  if(landT>0&&P.grounded&&rollT<0){
    const k=landHeavy?landT/.5:landT/.2;
    if(landHeavy){T.thLX-=1.0*k; T.thRX-=.6*k; T.knL+=1.7*k; T.knR+=1.5*k; T.spX+=.55*k; T.shLX-=.5*k; T.shRX-=.5*k; T.shLZ+=.4*k; T.shRZ-=.4*k;}
    T.sq=1-.13*Math.sin(Math.min(1,k)*PI)*(landHeavy?1:.6); rate=20;
  }
  // ---- roll / dodge ----
  if(rollT>=0){
    const k=clamp(rollT/rollDur,0,1);
    ik=false; rate=30;
    if(rollKind==='roll'){
      rigMode=1; rigX=TAU*smooth(.05,.9,k);
      setT({spX:.7,hdX:.4,thLX:-1.6,thRX:-1.5,knL:2.3,knR:2.2,shLX:-1.1,shRX:-1.1,elL:-1.4,elR:-1.4,shLZ:.3,shRZ:-.3,pivot:.42});
      T.drop=.22*Math.sin(k*PI);
    }else if(rollKind==='dive'){ // air roll: a tucked forward somersault, arms wrapped, cloak streaming
      rigMode=1; rigX=TAU*smooth(0,.92,k);
      setT({spX:.75,hdX:.45,thLX:-1.7,thRX:-1.6,knL:2.35,knR:2.3,ftL:.4,ftR:.4,shLX:-1.2,shRX:-1.2,elL:-1.5,elR:-1.5,shLZ:.25,shRZ:-.25,pivot:.62});
    }else if(rollKind==='back'){
      rigMode=1; rigX=-TAU*smooth(.05,.9,k);
      setT({spX:-.4,hdX:-.4,thLX:-1.2,thRX:-1.1,knL:1.8,knR:1.8,shLX:-2.4,shRX:-2.4,shLZ:.4,shRZ:-.4,pivot:.75});
    }else{
      const sd=rollKind==='sideR'?1:-1;
      setT({spX:.2,thLX:-.6,thRX:-.5,knL:1.0,knR:1.0,shLZ:.7,shRZ:-.7,elL:-.6,elR:-.6});
      T.rigZ=-sd*.35*Math.sin(k*PI);
    }
  }
  // ---- shove (no staff) ----
  if(shoveT>0){const k=Math.sin((1-shoveT/.32)*PI); T.shRX=-1.45*k; T.elR=-.2; T.spX+=.2*k; if(!holdL){T.shLX=-1.45*k; T.elL=-.2;} rate=24;}
  // ---- melee swings ----
  if(atk.on){
    const sw=SW[atk.i]; const wind=atk.t<sw.wind;
    rate=wind?22:30;
    if(atk.i===0){
      if(wind)setT({spY:-.8,shRZ:-1.25,shRY:-.55,shRX:.1,elR:-.45,wrRX:.5,hipY:-.25});
      else setT({spY:.75,shRZ:-1.2,shRY:1.95,shRX:-.1,elR:-.1,wrRX:.65,hipY:.25});
      T.thLX=-.45; T.knL=.5; T.thRX=.35; T.knR=.3; T.spX=.18;
    }else if(atk.i===1){
      if(wind)setT({spY:.75,shRZ:-1.2,shRY:2.1,elR:-.55,wrRX:.6,hipY:.2});
      else setT({spY:-.85,shRZ:-1.25,shRY:-.65,elR:-.1,wrRX:.65,hipY:-.25});
      T.thRX=-.45; T.knR=.5; T.thLX=.3; T.knL=.3; T.spX=.18;
    }else{
      if(wind)setT({spX:-.3,shRX:-2.9,shRZ:-.15,elR:-.5,wrRX:-.1,hdX:-.25,thLX:-.3,knL:.3,thRX:.2,knR:.2});
      else setT({spX:.5,shRX:-.95,shRZ:-.1,elR:-.05,wrRX:1.3,hdX:.2,thLX:-.75,knL:1.2,thRX:.45,knR:.7});
      if(!holdL){T.shLX=T.shRX*.85; T.shLZ=.1; T.elL=T.elR;}
      if(wind)T.sq=1.04; else T.sq=.97;
    }
    if(!holdL&&atk.i<2){T.shLZ=.5; T.shLX=-.3; T.elL=-.8;}
  }
  // ---- charge / bolt / spin ----
  if(charge.on){
    const pulse=charge.ready?Math.sin(t*20)*.03:0;
    setT({shRX:-1.35+pulse,shRZ:-.12,elR:-.55,wrRX:-.15,spX:-.06,spY:.25,hipY:.1,hdY:-.15,thLX:-.3,knL:.35,thRX:.3,knR:.35});
    if(!holdL){T.shLX=-1.0; T.shLZ=.25; T.elL=-1.1;}
    rate=14;
  }
  if(boltPoseT>0){setT({shRX:-1.5,shRZ:-.1,elR:-.05,wrRX:1.45,spX:.15,spY:.2}); rate=30;}
  if(spinT>=0){
    rigMode=2; rigY=-TAU*smooth(0,.45,spinT);
    setT({shRZ:-1.42,shRY:.2,elR:0,wrRX:1.5,spX:.25,thLX:-.6,knL:.9,thRX:.5,knR:.7,shLZ:1.0});
    rate=30;
  }
  // ---- techniques ----
  if(mv.id){
    const m=MT()[mv.id], tt=mv.t;
    if(mv.id==='lunge'){ // coil the staff back at the hip, then drive it straight out two-handed in a deep fencer's lunge
      if(tt<m.act[0])setT({spX:.12,spY:.55,hipY:.3,shRX:-.45,shRZ:-.3,elR:-1.55,wrRX:1.2,shLX:-.7,shLZ:.35,elL:-1.3,thLX:-.7,knL:1.0,thRX:.45,knR:.55,hdX:-.1});
      else setT({spX:.48,spY:-.3,hipY:-.25,shRX:-1.55,shRZ:-.06,shRY:.15,elR:-.02,wrRX:1.22,shLX:-1.38,shLZ:-.18,shLY:-.45,elL:-.3,
        thLX:-1.2,knL:1.1,ftL:.15,thRX:.85,knR:.2,ftR:-.35,hdX:-.28});
      rate=tt<m.act[0]?30:34;
    }else if(mv.id==='sweep'){ // a low crouched whirl, staff held out flat at knee height, sliding on momentum
      rigMode=2; rigY=-TAU*smooth(m.act[0],m.act[1],tt);
      if(tt<m.act[0])setT({spX:.3,spY:.9,hipY:.4,shRZ:-1.05,shRY:-.6,elR:-.3,wrRX:1.3,shLZ:.9,elL:-.6,thLX:-.9,knL:1.4,thRX:-.1,knR:1.2,ftL:.3});
      else setT({spX:.42,spY:-.2,shRZ:-1.18,shRY:.35,elR:-.02,wrRX:1.62,shLZ:1.3,shLX:.2,elL:-.25,thLX:-1.05,knL:1.6,thRX:-.15,knR:1.45,ftL:.35,ftR:.2,hdX:.05});
      T.rigZ=.18; rate=30;
    }else if(mv.id==='slam'){
      ik=mv.phase==='impact';
      if(mv.phase==='hang')setT({spX:-.38,hdX:-.35,shRX:-2.9,shRZ:-.08,elR:-.35,wrRX:-.25,shLX:-2.75,shLZ:.08,elL:-.35,thLX:-1.3,knL:1.9,thRX:-1.05,knR:1.8,ftL:.4,ftR:.4});
      else if(mv.phase==='fall')setT({spX:.62,hdX:.25,shRX:-.8,elR:-.05,wrRX:1.62,shLX:-.75,shLZ:-.1,elL:-.1,thLX:-.5,knL:.75,thRX:.15,knR:.4,ftL:.2});
      else{ const r=smooth(.08,m.recover,tt); setT({spX:.78-.5*r,hdX:.2,shRX:-.55+.3*r,elR:-.05,wrRX:1.75,shLX:-.5,shLZ:-.1,elL:-.12,thLX:-1.35+.8*r,knL:1.95-1.2*r,thRX:.4,knR:1.6-.9*r,ftR:-.6}); }
      rate=mv.phase==='impact'?24:28;
    }else if(mv.id==='spin'){ // whirling in the air, staff and arm flung out, cloak flared
      rigMode=2; rigY=-TAU*m.turns*smooth(0,m.dur*.88,tt); ik=false;
      setT({spX:.15,shRZ:-1.48,shRY:.2,elR:0,wrRX:1.52,shLZ:1.3,shLX:-.2,elL:-.25,thLX:-1.05,knL:1.65,thRX:-.55,knR:1.25,ftL:.3,ftR:.3,hdX:-.1});
      T.rigZ=.22; rate=26;
    }else if(mv.id==='plunge'){
      if(mv.phase==='wind'){ ik=false; // gather: tuck high with the staff raised over the head, crystal pointed at the sky, beginning to turn
        mv.ry-=dt*TAU*1.6*smooth(0,m.wind,tt); rigMode=2; rigY=mv.ry;
        setT({spX:-.5,hdX:-.45,shRX:-3.05,shLX:-2.95,shRZ:-.05,shLZ:.05,elR:-.25,elL:-.25,wrRX:-.35,thLX:-1.45,knL:2.1,thRX:-1.35,knR:2.05,ftL:.45,ftR:.45});
        rate=24; }
      else if(mv.phase==='drop'){ ik=false; // a drill of light: upright, staff straight down beneath, spinning fast
        mv.ry-=dt*TAU*3.4; rigMode=2; rigY=mv.ry;
        setT({spX:.05,hdX:.35,shRX:-.25,shRZ:-.12,elR:-.35,wrRX:1.5,shLX:-.35,shLZ:-.32,shLY:-.5,elL:-.7,thLX:-.2,knL:.35,thRX:.05,knR:.25,ftL:.5,ftR:.5});
        rate=28; }
      else{ // impact: one knee down, the staff planted, then rise
        mv.ry=damp(mv.ry,Math.floor(mv.ry/TAU)*TAU,16,dt); rigMode=2; rigY=mv.ry;
        const r=smooth(.15,m.recover,tt);
        setT({spX:.7-.45*r,hdX:.25-.2*r,shRX:-.35,shRZ:-.1,elR:-.25,wrRX:1.55,shLX:-.3,shLZ:-.3,elL:-.6,thLX:-1.4+.85*r,knL:1.4-.8*r,thRX:.5-.3*r,knR:2.3-1.6*r,ftR:-.85+.6*r});
        rate=22; }
    }
  }
  // ---- interact / inspect crouch ----
  if(interactT>0&&P.grounded&&rollT<0){
    const k=Math.sin(clamp(interactT/.38,0,1)*PI);
    T.thLX=lerp(T.thLX,-1.45,k); T.knL=lerp(T.knL,1.7,k); T.thRX=lerp(T.thRX,-.35,k); T.knR=lerp(T.knR,2.2,k);
    T.ftR=lerp(T.ftR,-.9,k); T.spX=lerp(T.spX,.45,k); T.hdX=lerp(T.hdX,.35,k); T.shRX=lerp(T.shRX,-1.0,k); T.elR=lerp(T.elR,-.3,k); rate=16;
  }
  // ---- hurt flinch ----
  if(hurtT>0){const k=hurtT/.36; T.spX-=.4*k; T.hdX-=.35*k; T.shLZ+=.5*k; T.shRZ-=.5*k; T.elL-=.5*k; T.elR-=.5*k; rate=26;}
  // ---- lock: look at target ----
  if(P.lockTarget&&rigMode===0){const a=Math.atan2(P.lockTarget.pos.x-P.pos.x,P.lockTarget.pos.z-P.pos.z); T.hdY=clamp(U.angDiff(a,P.heading),-1,1)*.7;}
  // ---- lantern arm override ----
  if(holdL&&rollT<0&&!P.gliding&&P.alive){
    const sw=Math.sin(ph)*.12*walk;
    T.shLX=-.95+sw; T.shLZ=.22; T.shLY=-.35; T.elL=-.55; T.wrLX=.5;
  }
  // ---- other modules' poses (potions.js: raising a draught) — G.player.poseHooks: fn(T,dt)->rate|undefined ----
  if(P.alive)for(const f of P.poseHooks){ try{ const r=f(T,dt); if(r)rate=r; }catch(e){ console.error('poseHook',e); } }
  // ---- death ----
  if(!P.alive){
    const k1=smooth(0,.45,deadT), k2=smooth(.5,1.3,deadT);
    ik=k2<.05; rate=10;
    setT({thLX:-1.3*k1*(1-k2),knL:1.6*k1*(1-k2)+.3*k2,thRX:-.4*k1*(1-k2),knR:2.1*k1*(1-k2)+.4*k2,ftR:-.8*k1*(1-k2),spX:.5*k1*(1-k2)+.2*k2,hdX:.4*k1,
      shLX:-.4*k1,shRX:-.6*k1,shLZ:.3+.6*k2,shRZ:-.4-.4*k2,elL:-.6,elR:-.5});
    T.rigZ=1.48*k2; T.pivot=lerp(.45,.17,k2); T.drop=k2?lerp(.33,0,k2)*(1-k2):0;
    if(deadT<.5)T.drop=0;
  }
  // ---- damp pose ----
  for(const k of KEYS){ pose[k]=damp(pose[k],T[k],rate,dt); }
  pose.pivot=damp(pose.pivot,T.pivot,8,dt);
  if(rigMode===0){rigX=0; if(spinT<0)rigY=0;}
  // leg IK: keep the stance foot on the ground
  if(ik){ pose.drop=Math.max(0,legIKDrop()); }
  else if(!P.alive){}
  // scarf tail flutter
  pose.tail=damp(pose.tail,.25+run*.9+spr*.4+(P.gliding?1.3:0)+(!P.grounded&&vy<0?.5:0),5,dt);
  applyPose(t,spd,run);
}
function applyPose(t,spd,run){
  const p=pose;
  R.rig.position.y=p.pivot; R.inner.position.y=-p.pivot;
  R.rig.rotation.set(rigX,rigY,p.rigZ,'YXZ');
  R.rig.scale.set(1+(1-p.sq)*.6,p.sq,1+(1-p.sq)*.6);
  R.hips.position.y=HIP_Y-(P.alive?p.drop:Math.max(0,legIKDrop()*(1-smooth(.5,1.3,deadT))));
  R.hips.rotation.set(p.hipX,p.hipY,p.hipZ);
  R.spine.rotation.set(p.spX,p.spY,p.spZ);
  R.neck.rotation.set(p.nkX,p.hdY*.35,0);
  R.head.rotation.set(p.hdX,p.hdY*.65,p.hdZ);
  R.shL.rotation.set(p.shLX,p.shLY,p.shLZ); R.elL.rotation.x=p.elL; R.handL.rotation.set(p.wrLX,p.wrLY,p.wrLZ);
  R.shR.rotation.set(p.shRX,p.shRY,p.shRZ); R.elR.rotation.x=p.elR; R.handR.rotation.set(p.wrRX,p.wrRY,p.wrRZ);
  R.thL.rotation.set(p.thLX,0,p.thLZ); R.knL.rotation.x=p.knL; R.ftL.rotation.x=p.ftL;
  R.thR.rotation.set(p.thRX,0,p.thRZ); R.knR.rotation.x=p.knR; R.ftR.rotation.x=p.ftR;
  R.scarfTail.rotation.set(p.tail+Math.sin(t*(6+run*8))*.12*(.3+run),Math.sin(t*3.1)*.2,0);
  // skirt panels follow the thighs
  for(const pv of R.skirt){
    const a=pv.userData.a, th=Math.sin(a)>0?p.thLX:p.thRX;
    const fw=Math.max(0,Math.cos(a)), bk=Math.max(0,-Math.cos(a));
    pv.rotation.x=-(.16+fw*Math.max(0,-th)*.95+bk*Math.max(0,th)*.9+run*.08+(P.gliding?.4:0));
  }
}

/* ---------------------------------------------------------------------
   cloak simulation (runs after the pose is applied)
   --------------------------------------------------------------------- */
const _m=new THREE.Matrix4(), _mi=new THREE.Matrix4(), _r=new THREE.Matrix4();
const caps=[]; for(let i=0;i<9;i++)caps.push({a:new V3(),b:new V3(),r:0});
function capFrom(i,j0,j1,r,off1){
  const c=caps[i]; j0.getWorldPosition(c.a); if(off1){c.b.copy(off1); j1.localToWorld(c.b);} else j1.getWorldPosition(c.b);
  c.a.applyMatrix4(_mi); c.b.applyMatrix4(_mi); c.r=r;
}
function updateCloak(dt){
  const C=R.cloak, root=R.root;
  if(!C.mesh.visible)return;
  const unf=CK.unfurl;
  root.updateMatrixWorld(true);
  _mi.copy(root.matrixWorld).invert();
  _m.multiplyMatrices(_mi,R.spine.matrixWorld);    // spine -> root
  _r.extractRotation(_m);
  // collision capsules in root space
  capFrom(0,R.shL,R.elL,.07); capFrom(1,R.elL,R.handL,.06); capFrom(2,R.shR,R.elR,.07); capFrom(3,R.elR,R.handR,.06);
  capFrom(4,R.thL,R.knL,.09); capFrom(5,R.knL,R.ftL,.075); capFrom(6,R.thR,R.knR,.09); capFrom(7,R.knR,R.ftR,.075);
  capFrom(8,R.hips,R.spine,.15,tmp.set(0,.3,0));
  // dynamics targets
  const h=P.heading, ch=Math.cos(h), sh=Math.sin(h);
  const lvx=hv.x*ch-hv.z*sh, lvz=hv.x*sh+hv.z*ch;
  const spd=Math.hypot(lvx,lvz), run=smooth(1.8,6,spd);
  const glide=P.gliding?1:0;
  const tgt=tmp2.set(-lvx*.06,0,-lvz*.075);
  if(tgt.length()>.62)tgt.setLength(.62);
  if(glide){tgt.set(0,.15,-.85);}
  if(!P.grounded&&!glide)tgt.y+=clamp(-vy*.03,-.25,.5);
  if(atk.on||spinT>=0||mv.id)tgt.add(tmp3.set(Math.sin(pose.spY)*-.15,0,0));
  const k=55, c=8;
  if(dt>0){
    const ax=k*(tgt.x-cl.lag.x)-c*cl.lagV.x, ay=k*(tgt.y-cl.lag.y)-c*cl.lagV.y, az=k*(tgt.z-cl.lag.z)-c*cl.lagV.z;
    cl.lagV.x+=ax*dt; cl.lagV.y+=ay*dt; cl.lagV.z+=az*dt; cl.lag.addScaledVector(cl.lagV,dt);
    const fT=.03+run*.07+glide*.32+(rollT>=0?.12:0)+(!P.grounded?.06:0);
    cl.flareV+=(70*(fT-cl.flare)-9*cl.flareV)*dt; cl.flare+=cl.flareV*dt;
    const whirl=mv.id==='sweep'||mv.id==='spin'||mv.id==='plunge'&&mv.phase!=='wind'||djFlipT>=0&&djFlipT<.4;
    cl.rigid=damp(cl.rigid,(rollT>=0&&rollKind!=='sideL'&&rollKind!=='sideR')||!P.alive||spinT>=0||whirl?.95:.3,14,dt);
  }
  const t=G.time;
  const wAmp=.012+run*.04+glide*.06+(!P.grounded?.03:0), wF=4+run*7+glide*6;
  const pos=C.pos, base=C.base;
  const top=new V3(), hang=new V3(), q=new V3(), rh=new V3(), nrm=new V3(), cp=new V3();
  for(let col_=0;col_<CL_C;col_++){
    const i0=col_*3;
    top.set(base[i0],base[i0+1],base[i0+2]).applyMatrix4(_m);
    pos[i0]=top.x; pos[i0+1]=top.y; pos[i0+2]=top.z;
    const a=C.ang[col_];
    for(let r=1;r<CL_R;r++){
      const i=(r*CL_C+col_)*3, tr=r/(CL_R-1);
      hang.set(base[i]-base[i0],base[i+1]-base[i0+1],base[i+2]-base[i0+2]);
      const L0=hang.length();
      rh.copy(hang).applyMatrix4(_r); hang.lerp(rh,cl.rigid);
      const w=Math.pow(tr,1.35);
      nrm.set(Math.sin(a),0,Math.cos(a));
      const wave=Math.sin(t*wF+a*2.6-tr*4.5)*wAmp+Math.sin(t*wF*1.7+a*5.1)*wAmp*.4;
      q.copy(cl.lag).addScaledVector(nrm,cl.flare+wave).multiplyScalar(w);
      if(glide)q.y+=w*.25*Math.max(0,-Math.cos(a));
      q.add(hang); q.setLength(L0*(unf>=1?1:clamp(unf*1.25-tr*.25,.02,1))); q.add(top);
      // push out of limbs
      for(let n=0;n<9;n++){
        const cap=caps[n]; const ab=tmp.copy(cap.b).sub(cap.a); const l2=ab.lengthSq()||1;
        const s=clamp(tmp3.copy(q).sub(cap.a).dot(ab)/l2,0,1);
        cp.copy(cap.a).addScaledVector(ab,s);
        const dx=q.x-cp.x, dy=q.y-cp.y, dz=q.z-cp.z, d=Math.sqrt(dx*dx+dy*dy+dz*dz), rr=cap.r+.02;
        if(d<rr){ if(d>1e-4){q.x=cp.x+dx/d*rr; q.y=cp.y+dy/d*rr; q.z=cp.z+dz/d*rr;} else {q.addScaledVector(nrm,rr);} }
      }
      if(q.y<.03&&P.grounded&&P.alive)q.y=.03;
      pos[i]=q.x; pos[i+1]=q.y; pos[i+2]=q.z;
    }
  }
  C.geo.attributes.position.needsUpdate=true;
  C.geo.computeVertexNormals();
  C.geo.computeBoundingSphere();
}

function placeModel(){
  R.root.position.copy(P.pos);
  R.root.rotation.y=P.heading;
  R.root.updateMatrixWorld(true);
  updateCloak(G.dt||1/60);
  if(staffObj)staffObj.userData.setGlow(charge.on?1+Math.min(2.4,charge.t*2.4)+(charge.ready>=2?.6:0):staffDrawn?1:.7,G.time);
  const mm=mv.id&&MT()?MT()[mv.id]:null;
  const moveEmit=!!mm&&(mm.act?mv.t>=mm.act[0]-.02&&mv.t<=mm.act[1]+.06:mv.id==='spin'?mv.t<mm.dur*.9:mv.phase==='fall'||mv.phase==='drop'||mv.phase==='impact'&&mv.t<.08);
  const swingEmit=atk.on&&atk.phase!=='wind'&&atk.t<SW[atk.i].wind+SW[atk.i].act+.06||spinT>.04&&spinT<.45||moveEmit;
  if(trail.mesh){ if(swingEmit&&staffObj){staffTip(tmp); staffObj.localToWorld(tmp2.set(0,1.12,0)); updateTrail(G.dt||1/60,true,tmp2.clone(),tmp.clone());} else updateTrail(G.dt||1/60,false); }
  updateBolts();
}

/* idle animation for non-play modes (title, ending) */
function idleOnly(dt){
  if(R)syncCloak();
  if(!R||dt<=0){if(R)updateLantern(0); return;}
  hv.set(0,0,0);
  animate(dt); placeModel(); updateLantern(dt);
}

/* ---------------------------------------------------------------------
   camera update
   --------------------------------------------------------------------- */
function updateCamera(dt){
  if(!R)return;
  const I=G.input, camera=G.camera;
  const lk=I.look();
  if(G.moves&&G.moves.takeLook){ const e=G.moves.takeLook(); if(charge.on){lk.x+=e.x; lk.y+=e.y;} }
  const ctl=G.state.mode==='play'&&P.inputEnabled;
  // over-the-shoulder aim while charging the staff (not while locked on: then the bolt seeks the target)
  const AM=MT()?MT().aim:null;
  const aimOn=!!AM&&charge.on&&!P.lockTarget&&charge.t>AM.after&&P.alive&&ctl;
  aim.k=damp(aim.k,aimOn?1:0,aimOn?9:7,dt); if(aim.k<.002)aim.k=0;
  const ak=aim.k, sens=AM?lerp(1,AM.sens,ak):1;
  if(ctl&&(lk.x||lk.y)){cam.yaw-=lk.x*.0042*sens; cam.pitch+=lk.y*.0036*sens; cam.idle=0;} else cam.idle+=dt;
  if(ctl&&I.wheel)cam.zoom=clamp(cam.zoom+I.wheel*.6,3,9);
  const LH=G.world.lighthouse;
  const inside=!!(LH&&LH.inside&&LH.inside(P.pos));
  const CT=G.world.cottage, inCot=!!(CT&&CT.near&&CT.near(P.pos));
  let dist=cam.zoom, pMin=-.42, pMax=1.2;
  if(inside){dist=Math.min(dist,2.8); pMin=.48; pMax=1.3;}
  if(inCot){dist=Math.min(dist,3.6); pMin=.42; pMax=1.15; if(cam.pitch<.5&&cam.idle>.3)cam.pitch=damp(cam.pitch,.5,2.5,dt);}
  const spd=Math.hypot(hv.x,hv.z);
  if(!P.alive){cam.yaw+=dt*.12; cam.pitch=damp(cam.pitch,.55,1.2,dt); dist=Math.min(dist,4.6);}
  else if(P.lockTarget){
    const tp=P.lockTarget.pos;
    const a=Math.atan2(tp.x-P.pos.x,tp.z-P.pos.z);
    cam.yaw=U.dampAngle(cam.yaw,a,5,dt); cam.pitch=damp(cam.pitch,.3,3,dt);
  }else if(cam.recenter>0){
    cam.recenter-=dt; cam.yaw=U.dampAngle(cam.yaw,P.heading,12,dt); cam.pitch=damp(cam.pitch,.26,8,dt);
  }else if(cam.idle>.7&&spd>1.2&&ak<.05){
    const d=U.angDiff(P.heading,cam.yaw);
    if(Math.abs(d)<2.3){
      const k=(P.gliding?1.6:inside?1.4:.75)*Math.min(1,spd/5);
      cam.yaw+=d*(1-Math.exp(-dt*k));
    }
    if(!inside)cam.pitch=damp(cam.pitch,P.gliding?.38:.22,.5,dt);
  }
  if(ak>0){ pMin=lerp(pMin,Math.max(pMin-.4,AM.pitchMin),ak); pMax=lerp(pMax,Math.min(pMax,AM.pitchMax),ak); dist=lerp(dist,Math.min(dist,AM.dist),ak); }
  cam.pitch=clamp(cam.pitch,pMin,pMax);
  P.camYaw=cam.yaw;
  // follow target (shifted over the right shoulder while aiming)
  const head=tmp.set(P.pos.x,P.pos.y+(inside?1.45:1.35),P.pos.z);
  if(ak>0){ const fx=Math.sin(cam.yaw), fz=Math.cos(cam.yaw); head.x+=-fz*AM.right*ak; head.z+=fx*AM.right*ak; head.y+=AM.up*ak; }
  if(cam.snap){cam.target.copy(head); cam.cur=dist;}
  else{cam.target.x=damp(cam.target.x,head.x,16,dt); cam.target.z=damp(cam.target.z,head.z,16,dt); cam.target.y=damp(cam.target.y,head.y,P.grounded?9:6,dt);}
  // look point (lock frames both)
  const look=tmp2.copy(cam.target);
  if(P.lockTarget){const tp=P.lockTarget.pos; look.lerp(tmp3.set(tp.x,tp.y+(P.lockTarget.height||1.5)*.5,tp.z),.32);}
  if(cam.snap)cam.look.copy(look); else cam.look.lerp(look,1-Math.exp(-dt*12));
  // boom with collision
  const cp=Math.cos(cam.pitch);
  const back=tmp3.set(-Math.sin(cam.yaw)*cp,Math.sin(cam.pitch),-Math.cos(cam.yaw)*cp);
  let allowed=dist;
  const pt=new V3();
  for(let k=1;k<=12;k++){
    const s=k/12; pt.copy(cam.target).addScaledVector(back,dist*s);
    const fh=G.floorAt(pt.x,pt.z,pt.y);
    let hit=pt.y<fh+.3;
    if(!hit&&!inside&&!inCot){for(const c of G.collidersNear(pt.x,pt.z)){if(pt.y<c.y0||pt.y>c.y1)continue; if(Math.hypot(pt.x-c.x,pt.z-c.z)<c.r+.25){hit=true;break;}}}
    if(hit){allowed=Math.max(.7,dist*(s-1/12)); break;}
  }
  if(cam.snap)cam.cur=allowed; else cam.cur=allowed<cam.cur?damp(cam.cur,allowed,22,dt):damp(cam.cur,allowed,2.5,dt);
  const p=cam.pos.copy(cam.target).addScaledVector(back,cam.cur);
  const fh=G.floorAt(p.x,p.z,p.y); if(p.y<fh+.3)p.y=fh+.3;
  for(const fn of G.cameraConstrainers){try{fn(p,cam.target);}catch(e){}}
  // shake
  cam.shake=damp(cam.shake,0,7,dt);
  if(cam.shake>.002){const s=cam.shake*.35; p.x+=(Math.random()-.5)*s; p.y+=(Math.random()-.5)*s; p.z+=(Math.random()-.5)*s;}
  camera.position.copy(p);
  camera.lookAt(cam.look);
  let fov=58+(P.sprinting?5:0)+(P.gliding?7:0)+(inside?4:0);
  if(ak>0)fov=lerp(fov,AM.fov,ak);
  cam.fov=damp(cam.fov,fov,ak>0?6:3,dt); if(Math.abs(camera.fov-cam.fov)>.01){camera.fov=cam.fov; camera.updateProjectionMatrix();}
  cam.snap=false;
  // aim reticle (screen centre while aiming; on the target while locked)
  if(G.moves){
    let o={on:false};
    if(charge.on&&P.alive&&ctl&&AM){
      const c=clamp(charge.t/1.3,0,1);
      if(P.lockTarget&&charge.t>AM.after){ const t=P.lockTarget; tmp3.set(t.pos.x,t.pos.y+(t.height||1.4)*.55,t.pos.z); camera.updateMatrixWorld(); tmp3.project(camera);
        if(tmp3.z<1)o={on:true,charge:c,ready:charge.ready,onTarget:true,x:(tmp3.x*.5+.5)*innerWidth,y:(-tmp3.y*.5+.5)*innerHeight}; }
      else if(ak>.15){ aim.hit=aimRay(); o={on:true,charge:c,ready:charge.ready,onTarget:!!aim.hit.hb}; }
    }else if(!charge.on)aim.hit=null;
    G.moves.reticle(o,dt);
  }
  // reticle
  if(reticle){
    const t=P.lockTarget; reticle.visible=!!t;
    if(t){const lo=t.lockOffset; let y=t.pos.y+(t.height||1.6)+.35; if(typeof lo==='number')y+=lo;
      reticle.position.set(t.pos.x,y,t.pos.z); if(lo&&typeof lo==='object')reticle.position.add(lo);
      reticle.position.y+=Math.sin(G.time*5)*.06; reticle.material.rotation=G.time*.8;}
  }
}

/* ---------------------------------------------------------------------
   systems
   --------------------------------------------------------------------- */
G.system('player',{order:20,modes:['play','dead'],
  init(){
    R=buildTraveler(); P.model=R.root; G.scene.add(R.root);
    P.hands={left:R.anchorL,right:R.anchorR};
    const s=(G.world.landmarks&&G.world.landmarks.start)||START;
    P.teleport(s.x,s.y,s.z,s.yaw==null?START.yaw:s.yaw);
    // lantern
    lanternObj=G.models.lantern(); G.scene.add(lanternObj);
    L.object=lanternObj;
    const spot=G.world.landmarks&&G.world.landmarks.lanternSpot;
    if(L.pos.lengthSq()<1e-6){ if(spot)L.pos.set(spot.x,spot.y==null?G.floorAt(spot.x,spot.z):spot.y,spot.z); else L.pos.set(s.x+2.2,G.floorAt(s.x+2.2,s.z+1.2),s.z+1.2); }
    lanternInteract=G.interact.add({pos:()=>L.pos,radius:1.9,priority:2,
      label:()=>L.inCradle?'Take the lantern from the lamp':'Take the lantern',
      enabled:()=>!L.carried&&P.alive&&(!L.inCradle||L.cured),
      use:lanternPickup});
    // combat hurtbox
    P.hurtbox=G.combat.add({team:'player',pos:P.pos,radius:.38,height:1.45,alive:()=>P.alive,hit:info=>P.hurt(info),targetable:true,name:'Traveler'});
    buildTrail();
    reticle=new THREE.Sprite(new THREE.SpriteMaterial({map:diamondTex(),color:glowCol('#d6bcff',1.6),transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));
    reticle.scale.setScalar(.42); reticle.visible=false; reticle.renderOrder=10; G.scene.add(reticle);
    if(ST.owned)equipStaff();
    applyCloak(hasCloak());
    animate(1/60); placeModel(); updateLantern(1/60);
  },
  update
});
G.system('playerIdle',{order:21,modes:['title','ending','paused','menu'],update(dt){ if(G.state.mode==='paused')return; idleOnly(dt); }});
G.system('playerFx',{order:46,modes:'always',update(dt){updateFx(dt);}});
G.system('camera',{order:80,modes:['play','dead'],update:updateCamera});
G.on('mode',({mode,prev})=>{ if(mode==='play'&&(prev==='title'||prev==='ending')){cam.snap=true; cam.yaw=P.heading; cam.pitch=.26;} });
G.on('flag',({key,value})=>{});
if(G.debug)G._playerDbg={trail,atk,charge,cam,pose,mv,aim,cool,get staff(){return staffObj;},get R(){return R;}};

})();

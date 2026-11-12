/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — northcave.js
   The wreckers' stair: the way into the wrecker's tower on the north island (northisle.js). Heath, 2026-11-11: the
   wrecker is Rowan's father, and Rowan gets in through a sea cave under the cliffs.
     - the mouth: under the island's south cliffs, west of the cove, reachable along the shore; open at low tide only
       (the sea is in it otherwise). An iron mooring ring in the rock says somebody uses it.
     - inside (a separate space at O, like the other interiors): the wreckers' landing (a stone quay, a rowing boat in the
       channel, green oil lamps), the store (what the light brings in, and his ledger: a page a season, in his father's hand),
       a low passage flooded to the roof until Rowan turns the sluice wheel, and the hoist shaft. The hoist carries him
       up through the rock into the foot of the tower.
     - the foot of the tower: his father comes down the stair with a green lamp. The first meeting (a talk card). Then he
       goes back up and bars the trapdoor behind him. The fire room (and its fight) is the next slice.
   G.northCave = { inside, enter(o), exit(o), state, debug }   Events: northCave:enter/exit, :ledger, :drained, :hoist, :met
   Save: G.persist 'northCave'.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth,vnoise}=U;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const col=U.col;

/* ================================================================ 1. FRAME */
const O=V(800,60,0);                         // free: cave (0,60,800), Undercroft (0,60,-800), Vigil (-800,60,0)
const toWorld=(x,y,z)=>V(O.x+x,O.y+y,O.z+z);
const BOX={x0:-26,x1:12,z0:-56,z1:6};
const inBoxW=(x,z)=>x>O.x+BOX.x0&&x<O.x+BOX.x1&&z>O.z+BOX.z0&&z<O.z+BOX.z1;
const INTERIOR={id:'northCave',contains:(x,z,y)=>inBoxW(x,z)&&(y==null||y>O.y-40)};

/* ================================================================ 2. LAYOUT (local) */
function sdSeg(px,pz,ax,az,bx,bz,w){ const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz; let t=((px-ax)*dx+(pz-az)*dz)/l2; t=t<0?0:t>1?1:t; return Math.hypot(px-ax-dx*t,pz-az-dz*t)-w; }
function sdBox(px,pz,x0,x1,z0,z1){ const cx=(x0+x1)/2,cz=(z0+z1)/2,hx=(x1-x0)/2,hz=(z1-z0)/2; const qx=Math.abs(px-cx)-hx,qz=Math.abs(pz-cz)-hz; return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0); }
const sdCirc=(px,pz,cx,cz,r)=>Math.hypot(px-cx,pz-cz)-r;
const SHAFT={x:0,z:-47}, PLAT_R=1.75, HOLE_R=2.25, TOP=25, BOT=1.0;
const S={v:1,entered:false,drained:false,hoistTop:false,read:{},met:false,inside:false,trans:null,water:.55,plat:BOT,hoist:null,said:{},scene:null,prevCp:null};
const lowF=(x,z)=>{ const t=-z; return 1.0-2.25*smooth(26,30,t)*(1-smooth(36,40,t)); };
const ZONES=[
  {id:'mouth',   sd:(x,z)=>sdSeg(x,z,0,3,0,-14,2.6),    floor:(x,z)=>lerp(0,.6,clamp(-z/14,0,1)), ceil:()=>4.4},
  {id:'landing', sd:(x,z)=>sdBox(x,z,-7,2,-26,-12),     floor:()=>1.0, ceil:()=>5.6},
  {id:'storeway',sd:(x,z)=>sdSeg(x,z,-5,-19,-13,-27,1.35),floor:(x,z)=>1.0+.6*clamp((-z-19)/8,0,1), ceil:(x,z)=>4.0},
  {id:'store',   sd:(x,z)=>sdCirc(x,z,-17,-31,5.5),     floor:()=>1.6, ceil:()=>4.6},
  {id:'low',     sd:(x,z)=>sdSeg(x,z,0,-25,0,-43,1.5),  floor:lowF, ceil:()=>3.3, wet:true},
  {id:'shaft',   sd:(x,z)=>sdCirc(x,z,SHAFT.x,SHAFT.z,4.6), floor:()=>BOT, ceil:()=>6.6},
  {id:'channel', sd:(x,z)=>sdBox(x,z,1.6,7.5,-27,4),    floor:()=>-1.6, ceil:()=>5.2, water:true}];   // the sea's way in: walls go round it, you can't walk it
const WALK=ZONES.filter(z=>!z.water);
const sdAll=(x,z)=>{ let d=1e9; for(const Z of ZONES){ const v=Z.sd(x,z); if(v<d)d=v; } return d; };
function nearest(x,z,list){ let b=null,bd=1e9; for(const Z of list||ZONES){ const v=Z.sd(x,z); if(v<bd){bd=v;b=Z;} } return b; }
/** the ground floor at (x,z), or null; the low passage is under water until the sluice runs */
function groundF(x,z){ let f=null; for(const Z of WALK){ if(Z.sd(x,z)<0){ const h=Z.floor(x,z); if(Z.wet&&h<S.water-.75)continue; if(f==null||h>f)f=h; } } return f; }
/** the tower's foot (the room at the top of the shaft): a floor ring round the hoist hole */
const TF_R=3.2;
function floorL(x,z,y){
  let best=null; const cand=h=>{ if(h!=null&&h<=y+.9&&(best==null||h>best))best=h; };
  cand(groundF(x,z));
  const r=Math.hypot(x-SHAFT.x,z-SHAFT.z);
  if(r<PLAT_R)cand(S.plat);
  if(r<TF_R){ if(r>=PLAT_R-.05||(S.plat<TOP-.05&&!S.hoist))cand(TOP); }   // the ring; and while the hoist is down, a safe lip over the hole (you can't get up there without it)
  return best;
}
function walkL(x,z){ if(groundF(x,z)!=null)return true; const r=Math.hypot(x-SHAFT.x,z-SHAFT.z); return r<TF_R; }

/* the ceiling over (x,z): the room's, open up the shaft over the hoist hole */
function ceilL(x,z){ const r=Math.hypot(x-SHAFT.x,z-SHAFT.z); if(r<HOLE_R)return TOP+8.3; const Z=nearest(x,z); return Z.ceil(x,z); }
/* the camera stays inside the rock: march from the head to the boom's end and stop short of walls, roof and floor */
function camOK(x,y,z){ const r=Math.hypot(x-SHAFT.x,z-SHAFT.z);
  if(y>TOP-.6)return r<TF_R-.3&&y<TOP+8.2;
  if(y>6.2)return r<HOLE_R-.35;
  if(sdAll(x,z)>-.3)return false; const f=groundF(x,z); return y<ceilL(x,z)-.3&&(f==null||y>f+.3); }
G.cameraConstrainers.push((cam,target)=>{
  if(!S.inside)return;
  const tx=target.x-O.x, ty=target.y-O.y, tz=target.z-O.z, cx=cam.x-O.x, cy=cam.y-O.y, cz=cam.z-O.z;
  if(!camOK(tx,ty,tz))return;
  const L=Math.hypot(cx-tx,cy-ty,cz-tz), n=Math.max(1,Math.ceil(L/.12)); let gx=tx,gy=ty,gz=tz;
  for(let i=1;i<=n;i++){ const t=i/n, x=tx+(cx-tx)*t, y=ty+(cy-ty)*t, z=tz+(cz-tz)*t; if(!camOK(x,y,z))break; gx=x;gy=y;gz=z; }
  cam.set(gx+O.x,gy+O.y,gz+O.z);
});
/* the walls, for bodies: inside an interior everything counts as walkable (core.js), so the rock is a constrainer.
   On the ground floor: the rooms you can stand in (the low passage only to the water's edge until it's drained).
   Up the shaft: the platform's edge while you ride. At the top: the round room. */
function sdPhys(x,z,ly){
  const r=Math.hypot(x-SHAFT.x,z-SHAFT.z);
  if(ly>TOP-1.2)return r-TF_R;
  if(ly>BOT+.8)return r-(PLAT_R-.1);
  let d=1e9; for(const Z of WALK){ let v;
    if(Z.id==='low'&&!S.drained)v=Math.min(sdSeg(x,z,0,-25,0,-26.6,1.5),sdSeg(x,z,0,-39.4,0,-43,1.5)); else v=Z.sd(x,z);
    if(v<d)d=v; }
  return d; }
G.constrainers.push((prev,next,y,rad)=>{
  if(!inBoxW(next.x,next.z)&&!inBoxW(prev.x,prev.z))return false;
  rad=rad||.4; const ly=y-O.y; const Sp=(x,z)=>sdPhys(x,z,ly);
  const px=prev.x-O.x, pz=prev.z-O.z; let nx=next.x-O.x, nz=next.z-O.z; const s0=Sp(px,pz);
  let s=Sp(nx,nz)+rad; if(s<=0)return false;
  for(let k=0;k<4&&s>0;k++){ const e=.1, gx=Sp(nx+e,nz)-Sp(nx-e,nz), gz=Sp(nx,nz+e)-Sp(nx,nz-e), gl=Math.hypot(gx,gz)||1; nx-=gx/gl*(s+.005); nz-=gz/gl*(s+.005); s=Sp(nx,nz)+rad; }
  if(s>.02&&!(s0+rad>0&&Sp(nx,nz)<s0)){ next.x=prev.x; next.z=prev.z; return true; }
  const jump=Math.hypot(nx-px,nz-pz), lim=Math.hypot(next.x-prev.x,next.z-prev.z)+.05;
  if(jump>lim){ if(!(s0+rad>.06)){ next.x=prev.x; next.z=prev.z; return true; }
    const k=Math.max(lim,.12)/jump, ex=px+(nx-px)*k, ez=pz+(nz-pz)*k; if(!(Sp(ex,ez)<s0)){ next.x=prev.x; next.z=prev.z; return true; }
    next.x=ex+O.x; next.z=ez+O.z; return true; }
  next.x=nx+O.x; next.z=nz+O.z; return true;
});
/* hooks: the interior's own floor and walkable, only inside its box */
G.floorProviders.push((x,z,y)=>{ if(!inBoxW(x,z))return null; const f=floorL(x-O.x,z-O.z,(y==null?1e9:y)-O.y); return f==null?null:f+O.y; });
G.walkOverrides.push((x,z)=>{ if(!inBoxW(x,z))return null; return walkL(x-O.x,z-O.z); });

/* ================================================================ 3. VISUALS */
const root=new THREE.Group(); root.name='northCave'; root.position.copy(O); root.visible=false;
let waterLow=null, waterCh=null, plat=null, rope=null, wheel=null, lamps=[], knox=null, trap=null, knoxLamp=null;
const noise3=(x,y,z)=>Math.sin(x*1.9+y*1.3)*.5+Math.sin(y*2.3+z*1.7)*.3+Math.sin(z*1.1+x*2.7)*.2;
function rockCol(c,x,y,z,wet){ const base=col('#4a4a52'), dk=col('#26252b'), weed=col('#2f3d2c'), salt=col('#8a8a86');
  c.copy(dk).lerp(base,.35+.4*vnoise(x*.7+y*.3,z*.7-y*.2)); if(y<.6+(wet?.6:0))c.lerp(weed,.5*smooth(.6,-.6,y)); if(vnoise(x*2.1,z*2.1+y)>.78)c.lerp(salt,.25); }
function buildWalls(){
  const pos=[], cl=[], c=new THREE.Color(), STEP=.5, rows=5;
  const g=(x,z)=>{ const e=.05; return [(sdAll(x+e,z)-sdAll(x-e,z))/(2*e),(sdAll(x,z+e)-sdAll(x,z-e))/(2*e)]; };
  const strip=(ax,az,bx,bz)=>{
    const mx=(ax+bx)/2, mz=(az+bz)/2, Z=nearest(mx,mz), [gx,gz]=g(mx,mz), gl=Math.hypot(gx,gz)||1, nx=gx/gl, nz=gz/gl;
    const fl=Math.min(Z.floor(mx,mz),0)-1.8, ce=Z.ceil(mx,mz)+.4;
    const P=(x,z,k)=>{ const y=lerp(fl,ce,k), d=.28*noise3(x*.8,y*.9,z*.8)+.12*noise3(x*2.3,y*2.1,z*2.6)+.35*Math.sin(k*PI); return [x+nx*d,y,z+nz*d]; };
    for(let r=0;r<rows;r++){ const k0=r/rows, k1=(r+1)/rows, a0=P(ax,az,k0), b0=P(bx,bz,k0), a1=P(ax,az,k1), b1=P(bx,bz,k1);
      // wind so the face looks inward (toward -n)
      const ex=b0[0]-a0[0], ez=b0[2]-a0[2], fx=-ez, fz=ex, inward=(fx*-nx+fz*-nz)>0;
      const quad=inward?[a0,b0,a1, b0,b1,a1]:[a0,a1,b0, b0,a1,b1];
      for(const p of quad){ pos.push(p[0],p[1],p[2]); rockCol(c,p[0],p[1],p[2],Z.water||Z.wet); cl.push(c.r,c.g,c.b); } } };
  // marching squares over the union of the rooms
  const nx=Math.ceil((BOX.x1-BOX.x0)/STEP), nz=Math.ceil((BOX.z1-BOX.z0)/STEP), F=new Float32Array((nx+1)*(nz+1));
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)F[j*(nx+1)+i]=sdAll(BOX.x0+i*STEP,BOX.z0+j*STEP);
  const lerpP=(x0,z0,v0,x1,z1,v1)=>{ const t=v0/(v0-v1); return [x0+(x1-x0)*t,z0+(z1-z0)*t]; };
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const x0=BOX.x0+i*STEP, z0=BOX.z0+j*STEP, x1=x0+STEP, z1=z0+STEP;
    const a=F[j*(nx+1)+i], b=F[j*(nx+1)+i+1], cc=F[(j+1)*(nx+1)+i+1], d=F[(j+1)*(nx+1)+i];
    const e=[]; // edges: ab (z0), bc (x1), cd (z1), da (x0)
    if((a<0)!==(b<0))e.push(lerpP(x0,z0,a,x1,z0,b)); if((b<0)!==(cc<0))e.push(lerpP(x1,z0,b,x1,z1,cc));
    if((cc<0)!==(d<0))e.push(lerpP(x1,z1,cc,x0,z1,d)); if((d<0)!==(a<0))e.push(lerpP(x0,z1,d,x0,z0,a));
    if(e.length===2)strip(e[0][0],e[0][1],e[1][0],e[1][1]);
    else if(e.length===4){ strip(e[0][0],e[0][1],e[1][0],e[1][1]); strip(e[2][0],e[2][1],e[3][0],e[3][1]); } }
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); geo.setAttribute('color',new THREE.Float32BufferAttribute(cl,3)); geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide})); m.receiveShadow=true; root.add(m);
}
function buildFloorCeil(){
  const STEP=.5, fp=[], fc=[], cp=[], cc=[], c=new THREE.Color();
  const shingle=col('#5b544b'), stone=col('#5f5c60'), wetc=col('#34312f'), plank=col('#6b5340');
  for(let x=BOX.x0;x<BOX.x1;x+=STEP)for(let z=BOX.z0;z<BOX.z1;z+=STEP){
    const mx=x+STEP/2, mz=z+STEP/2; if(sdAll(mx,mz)>.45)continue;
    const Z=nearest(mx,mz), corners=[[x,z],[x+STEP,z],[x+STEP,z+STEP],[x,z+STEP]];
    const fH=(px,pz)=>{ const W=nearest(px,pz,WALK), Wd=W.sd(px,pz), Cd=ZONES[ZONES.length-1].sd(px,pz); return (Cd<Wd&&Cd<.2)?-1.6:W.floor(px,pz); };
    const cH=(px,pz)=>nearest(px,pz).ceil(px,pz)+.25*noise3(px,3,pz);
    const quadF=corners.map(([px,pz])=>[px,fH(px,pz)+.06*noise3(px*3,0,pz*3),pz]);
    for(const k of [0,2,1, 0,3,2]){ const p=quadF[k]; fp.push(p[0],p[1],p[2]);
      if(Z.id==='mouth'||Z.id==='channel')c.copy(shingle); else c.copy(stone); if(p[1]<.4)c.lerp(wetc,.6); c.multiplyScalar(.85+.3*vnoise(p[0]*1.7,p[2]*1.7)); fc.push(c.r,c.g,c.b); }
    // ceiling (none over the hoist hole: the shaft goes up from there)
    if(Math.hypot(mx-SHAFT.x,mz-SHAFT.z)<HOLE_R)continue;
    const quadC=corners.map(([px,pz])=>[px,cH(px,pz),pz]);
    for(const k of [0,1,2, 0,2,3]){ const p=quadC[k]; cp.push(p[0],p[1],p[2]); rockCol(c,p[0],p[1]+4,p[2],false); c.multiplyScalar(.7); cc.push(c.r,c.g,c.b); } }
  const mk=(p,cl,name)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(p,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(cl,3)); g.computeVertexNormals();
    const m=new THREE.Mesh(g,G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide})); m.name=name; m.receiveShadow=true; root.add(m); return m; };
  mk(fp,fc,'ncFloor'); mk(cp,cc,'ncCeil');
  // the quay's edge: dressed stone blocks along the channel
  const parts=[]; const GE=G.world.geo;
  for(let z=-12.4;z>-26;z-=1.2)parts.push({g:new THREE.BoxGeometry(.5,1.4,1.15),m:GE.mat4(1.85,.35,z,0,0,0),c:col('#6c6870')});
  const q=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true})); root.add(q);
}
function waterMesh(w,d,x,z,colr,op){ const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d,8,8),new THREE.MeshBasicMaterial({color:col(colr),transparent:true,opacity:op,depthWrite:false}));
  m.rotation.x=-PI/2; m.position.set(x,0,z); root.add(m); return m; }
function lamp(x,y,z,name){ const g=new THREE.Group(); g.position.set(x,y,z); root.add(g);
  const iron=G.toon('#252226'); const cage=new THREE.Mesh(new THREE.CylinderGeometry(.14,.18,.34,6,1,true),iron); g.add(cage);
  const glow=new THREE.Mesh(new THREE.SphereGeometry(.1,8,6),new THREE.MeshBasicMaterial({color:col('#8ff2bd')})); g.add(glow);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:col('#52e89a'),transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false})); sp.scale.setScalar(1.6); g.add(sp);
  const L=new THREE.PointLight(col('#7fe8b4'),1.3,15,1.6); L.position.y=-.1; g.add(L); lamps.push({g,L,sp,base:1.3,name}); return g; }
function buildProps(){
  const GE=G.world.geo, parts=[], wood=col('#7d6249'), wood2=col('#4a3929'), iron=col('#2a2729'), canvas=col('#b5a684');
  const planks=(q,n,o)=>o.copy(wood).lerp(wood2,.4+.4*Math.sin(q.y*16+q.x*3));
  // the rowing boat in the channel, a mooring post and coiled rope on the quay
  const hull=new THREE.CylinderGeometry(.75,.75,3.6,12,4,true,PI,PI); hull.rotateZ(PI/2); { const P=hull.attributes.position; for(let i=0;i<P.count;i++){ const x=P.getX(i), t=x/1.8, w=Math.max(.06,1-t*t); P.setXYZ(i,x,P.getY(i)*.6,P.getZ(i)*w); } hull.computeVertexNormals(); }
  parts.push({g:hull,m:GE.mat4(4.4,.35,-18,0,PI/2+.08,0),c:(q,n,o)=>o.copy(col('#40606e')).lerp(wood2,q.y<.2?.6:0)});
  parts.push({g:new THREE.CylinderGeometry(.13,.15,1.2,7),m:GE.mat4(1.5,1.6,-17.5,0,0,0),c:wood2});
  for(let k=0;k<3;k++)parts.push({g:new THREE.TorusGeometry(.3-k*.05,.05,4,14),m:GE.mat4(.6,1.07+k*.07,-16.8,PI/2,0,0),c:col('#a08a5e')});
  // crates, barrels, nets on the landing
  for(const [x,z,s,r] of [[-5.6,-13.6,.7,.3],[-6.1,-14.6,.6,1.1],[-5.4,-25,.8,.2],[-4.4,-25.2,.55,.9],[-6.2,-22,.65,.5]])parts.push({g:new THREE.BoxGeometry(s*1.3,s,s),m:GE.mat4(x,1+s/2,z,0,r,0),c:planks});
  for(const [x,z] of [[-6.2,-17],[-6.3,-18]])parts.push({g:new THREE.CylinderGeometry(.36,.32,.85,10),m:GE.mat4(x,1.43,z,0,0,0),c:planks});
  // the store: the light's takings. Chests, a ship's bell, a figurehead against the wall, sailcloth, the desk
  const st={x:-17,z:-31};
  for(let k=0;k<9;k++){ const a=.4+k*.55, R=4.2+(k%2)*.4, x=st.x+Math.cos(a)*R, z=st.z+Math.sin(a)*R, s=.6+(k%3)*.15;
    if(k===3||k===4)continue; parts.push({g:new THREE.BoxGeometry(s*1.3,s,s),m:GE.mat4(x,1.6+s/2+(k===6?s:0),z,0,a,0),c:planks}); }
  parts.push({g:new THREE.CylinderGeometry(.32,.42,.6,12,1,true),m:GE.mat4(st.x-3.6,2.35,st.z-2.8,0,0,0),c:col('#a07a3a')});    // a ship's bell, hung
  parts.push({g:new THREE.CylinderGeometry(.02,.02,.6,4),m:GE.mat4(st.x-3.6,2.95,st.z-2.8,0,0,0),c:iron});
  parts.push({g:GE.blob(.45,1,3,.12),m:GE.mat4(st.x+3.4,2.4,st.z+3.1,.3,2.1,.2,1,2.2,.8),c:col('#b8a98c')});                  // a figurehead
  parts.push({g:new THREE.BoxGeometry(2.4,.25,1.2),m:GE.mat4(st.x-1.2,1.75,st.z+4.3,0,.25,0),c:canvas});                       // folded sailcloth
  // his desk and stool by the lamp, a shelf above it
  parts.push({g:new THREE.BoxGeometry(1.6,.08,.8),m:GE.mat4(-20.6,2.45,-32.6,0,.9,0),c:wood});
  for(const [dx,dz] of [[-.65,-.3],[.65,-.3],[-.65,.3],[.65,.3]]){ const a=.9, x=-20.6+dx*Math.cos(a)+dz*Math.sin(a), z=-32.6-dx*Math.sin(a)+dz*Math.cos(a); parts.push({g:new THREE.BoxGeometry(.07,.85,.07),m:GE.mat4(x,2.02,z,0,0,0),c:wood2}); }
  parts.push({g:new THREE.CylinderGeometry(.2,.22,.5,8),m:GE.mat4(-19.6,1.85,-31.6,0,0,0),c:wood2});
  parts.push({g:new THREE.BoxGeometry(1.4,.06,.32),m:GE.mat4(-21.8,3.2,-31.2,0,.9,0),c:wood});                               // shelf
  parts.push({g:new THREE.BoxGeometry(.42,.06,.3),m:GE.mat4(-20.5,2.52,-32.5,0,.6,0),c:col('#3a2a22')});                       // the ledger
  { const b=new THREE.CylinderGeometry(.16,.16,.5,8,1,true,PI,PI); b.rotateZ(PI/2); parts.push({g:b,m:GE.mat4(-21.8,3.32,-31.2,0,.9,0),c:col('#3e6aa0')}); }   // the carved boat on the shelf, blue
  // the sluice: a wheel on the wall by the low passage, the gate in the channel
  const m=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide})); m.castShadow=true; m.receiveShadow=true; root.add(m);
  wheel=new THREE.Group(); wheel.position.set(1.15,2.2,-25.4); root.add(wheel);
  const im=G.toon('#3a3336'); const rim=new THREE.Mesh(new THREE.TorusGeometry(.55,.05,5,18),im); wheel.add(rim);
  for(let k=0;k<4;k++){ const sp=new THREE.Mesh(new THREE.BoxGeometry(1.1,.06,.06),im); sp.rotation.z=k*PI/4; wheel.add(sp); }
  wheel.rotation.y=PI/2; const ax=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,.5,6),im); ax.rotation.z=PI/2; ax.position.set(1.4,2.2,-25.4); root.add(ax);
  // the hoist: a timber platform on four ropes, a windlass on it, the shaft rising into the dark
  plat=new THREE.Group(); plat.position.set(SHAFT.x,BOT,SHAFT.z); root.add(plat);
  const deck=new THREE.Mesh(new THREE.CylinderGeometry(PLAT_R,PLAT_R,.18,16),G.toon('#6b5340',{map:G.world.geo.tex()&&G.world.geo.tex().wood})); deck.position.y=-.09; deck.receiveShadow=true; plat.add(deck); G.outline&&G.outline(deck,{thickness:.02});
  S._ropes=[]; for(let k=0;k<4;k++){ const a=k/4*TAU+PI/4, r=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,1,4),G.toon('#a08a5e')); r.position.set(Math.cos(a)*1.5,.5,Math.sin(a)*1.5); plat.add(r); S._ropes.push(r); }
  const wl=new THREE.Group(); wl.position.set(0,0,-1.05); plat.add(wl);
  for(const s of [-.5,.5]){ const post=new THREE.Mesh(new THREE.BoxGeometry(.12,.9,.12),G.toon('#4a3929')); post.position.set(s,.45,0); wl.add(post); }
  const drum=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,1,10),G.toon('#5a4231')); drum.rotation.z=PI/2; drum.position.y=.75; wl.add(drum); rope=drum;
  const crank=new THREE.Mesh(new THREE.BoxGeometry(.06,.4,.06),G.toon('#2a2729')); crank.position.set(.56,.6,0); wl.add(crank);
  // a lamp hung on the windlass, so the rock shows as it goes past
  { const lg=new THREE.Group(); lg.position.set(-.5,1.15,0); wl.add(lg); lg.add(new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),new THREE.MeshBasicMaterial({color:col('#8ff2bd')})));
    const pl=new THREE.PointLight(col('#7fe8b4'),1.1,9,1.6); lg.add(pl); }
  // the shaft above the hole, and the room at its top: the foot of the tower
  const sg=new THREE.CylinderGeometry(HOLE_R,HOLE_R,TOP-6.4,18,10,true); { const P=sg.attributes.position, cl=new Float32Array(P.count*3), c=new THREE.Color();
    for(let i=0;i<P.count;i++){ const x=P.getX(i),y=P.getY(i),z=P.getZ(i), k=1+.08*noise3(x*2,y*.6,z*2); P.setXYZ(i,x*k,y,z*k); rockCol(c,x,y+20,z,false); c.toArray(cl,i*3); }
    sg.setAttribute('color',new THREE.BufferAttribute(cl,3)); sg.computeVertexNormals(); }
  const shaft=new THREE.Mesh(sg,G.toon('#ffffff',{vertexColors:true,side:THREE.BackSide})); shaft.position.set(SHAFT.x,6.4+(TOP-6.4)/2,SHAFT.z); root.add(shaft);
  buildTowerFoot();
}
/* the foot of the tower: dressed stone now, not cave. A floor ring round the hoist hole, the stair up the wall to a trapdoor */
function buildTowerFoot(){
  const g=new THREE.Group(); g.position.set(SHAFT.x,TOP,SHAFT.z); root.add(g);
  const tex=G.world.geo.tex(), stone=G.toon('#7b7a80',{map:tex&&tex.stone,side:THREE.BackSide}), stoneF=G.toon('#5c5a60',{map:tex&&tex.stone}), wood=G.toon('#5a4231');
  const wall=new THREE.Mesh(new THREE.CylinderGeometry(TF_R+.1,TF_R+.1,9,20,1,true),stone); wall.position.y=4.5; g.add(wall);
  const fl=new THREE.Mesh(new THREE.RingGeometry(HOLE_R-.35,TF_R+.15,24,1),stoneF); fl.rotation.x=-PI/2; fl.position.y=.01; g.add(fl);
  const ceil=new THREE.Mesh(new THREE.CircleGeometry(TF_R+.15,20),G.toon('#2a2524',{side:THREE.DoubleSide})); ceil.rotation.x=PI/2; ceil.position.y=8.6; g.add(ceil);
  // the stair: wedges up the wall, a turn and a half, to the trapdoor
  for(let k=0;k<22;k++){ const a=-PI/2+k*.36, y=.35+k*.37, st=new THREE.Mesh(new THREE.BoxGeometry(1.05,.18,.55),stoneF);
    st.position.set(Math.cos(a)*(TF_R-.55),y,Math.sin(a)*(TF_R-.55)); st.rotation.y=-a; g.add(st); }
  const ta=-PI/2+21*.36; trap=new THREE.Mesh(new THREE.BoxGeometry(1.2,.12,1.2),wood); trap.position.set(Math.cos(ta)*(TF_R-.9),8.5,Math.sin(ta)*(TF_R-.9)); g.add(trap);
  const glowUp=new THREE.PointLight(col('#7fe8b4'),.0,10,1.6); glowUp.position.set(trap.position.x,7.6,trap.position.z); g.add(glowUp); S._glowUp=glowUp;
  // his father: a big man gone thin, oilskin coat, a grey beard, a green lamp held up
  knox=buildKnox(); knox.visible=false; g.add(knox);
}
function buildKnox(){
  const r=new THREE.Group(); r.name='tobiasKnox';
  const coat=G.toon('#3c3a2c'), skin=G.toon('#b89a84'), beard=G.toon('#8f8c86'), cap=G.toon('#2c3038'), boot=G.toon('#1e1a18');
  const add=(geo,m,x,y,z)=>{ const o=new THREE.Mesh(geo,m); o.position.set(x,y,z); o.castShadow=true; r.add(o); return o; };
  const sk=add(new THREE.LatheGeometry([[.2,1.1],[.27,.8],[.33,.35],[.36,.05]].map(([a,b])=>new THREE.Vector2(a,b)),16),coat,0,0,0); sk.material.side=THREE.DoubleSide; G.outline&&G.outline(sk,{thickness:.012});
  for(const s of [-1,1])add(new THREE.BoxGeometry(.13,.12,.28),boot,s*.12,.06,.05);
  const ch=add(new THREE.CylinderGeometry(.2,.25,.62,12),coat,0,1.35,0); G.outline&&G.outline(ch,{thickness:.012});
  const hd=add(new THREE.SphereGeometry(.13,14,10),skin,0,1.82,.01); hd.scale.set(.92,1.1,.95); G.outline&&G.outline(hd,{thickness:.01});
  const bd=add(new THREE.SphereGeometry(.12,12,8,0,TAU,PI*.45,PI*.55),beard,0,1.8,.05); bd.scale.set(.95,1.35,.9);
  add(new THREE.SphereGeometry(.14,12,8,0,TAU,0,PI*.5),cap,0,1.9,-.01).scale.set(1,.75,1.05);
  for(const s of [-1,1]){ const e=add(new THREE.SphereGeometry(.013,6,5),new THREE.MeshBasicMaterial({color:0x9ff5c8}),s*.045,1.85,.12); void e; }   // eyes that have looked at that fire too long
  const armL=add(new THREE.CylinderGeometry(.06,.05,.62,8),coat,-.27,1.32,0); armL.rotation.z=.12;
  const armR=add(new THREE.CylinderGeometry(.06,.05,.62,8),coat,.3,1.55,.12); armR.rotation.set(-1.0,0,-.25);
  knoxLamp=new THREE.Group(); knoxLamp.position.set(.36,1.82,.42); r.add(knoxLamp);
  knoxLamp.add(new THREE.Mesh(new THREE.CylinderGeometry(.09,.11,.22,6,1,true),G.toon('#252226')));
  knoxLamp.add(new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),new THREE.MeshBasicMaterial({color:col('#8ff2bd')})));
  const L=new THREE.PointLight(col('#7fe8b4'),1.6,12,1.6); knoxLamp.add(L);
  return r;
}
function build(){
  buildWalls(); buildFloorCeil(); buildProps();
  waterCh=waterMesh(6.4,32,4.55,-11.5,'#16302e',.86); waterCh.position.y=-.05;
  waterLow=waterMesh(3.6,17,0,-33,'#173230',.88); waterLow.position.y=S.water;
  lamp(-5.9,3.0,-15.4,'landing'); lamp(-20.2,3.4,-30.2,'store'); lamp(3.2,3.2,-43.4,'shaft'); lamp(-1.6,3.0,-36.5,'low');
  // the sea's light, coming in at the mouth: cold and grey-blue
  const sea=new THREE.PointLight(col('#8fa4c0'),1.3,22,1.4); sea.position.set(.5,2.6,1.5); root.add(sea);
  G.scene.add(root);
}

/* ================================================================ 4. THE MOUTH (on the north island) */
let mouth=null;   // {x,z,y,yaw, stand}
function buildMouth(){
  const NI=G.northIsle; if(!NI)return;
  const a=NI.cove.mouthA, R=NI.shoreR(a), dir={x:Math.cos(a),z:Math.sin(a)}, C=NI.centre;
  const at=din=>({x:C.x+dir.x*(R-din),z:C.z+dir.z*(R-din)});
  const face=at(.2), stand=at(-1.6), yaw=Math.atan2(dir.x,dir.z);   // the opening faces out to sea
  const g=new THREE.Group(); g.name='northCaveMouth'; g.position.set(face.x,0,face.z); g.rotation.y=yaw;
  const dark=new THREE.Mesh(new THREE.CircleGeometry(1.9,18,0,PI),new THREE.MeshBasicMaterial({color:0x020203})); dark.scale.set(1,1.35,1); dark.position.set(0,-.3,.05); g.add(dark);
  const GE=G.world.geo, parts=[], rk=col('#4a4c55'), rk2=col('#2e2c30');
  for(let k=0;k<9;k++){ const t=k/8, ang=PI*t, x=Math.cos(ang)*2.25, y=Math.sin(ang)*2.6-.3;
    parts.push({g:GE.blob(.8,1,k*1.7,.3),m:GE.mat4(x,y,.15,k,k*2,k*.5,1.1,1,.9),c:(p,n,o)=>o.copy(rk2).lerp(rk,vnoise(p.x*2,p.y*2))}); }
  parts.push({g:new THREE.TorusGeometry(.22,.05,5,12),m:GE.mat4(2.7,.55,.4,0,PI/2,0),c:col('#5a3a2a')});                         // the mooring ring
  parts.push({g:new THREE.CylinderGeometry(.06,.06,.5,5),m:GE.mat4(2.7,.55,.2,PI/2,0,0),c:col('#3a2a22')});
  const m=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true})); m.castShadow=true; g.add(m);
  const nr=G.scene.getObjectByName('northIsle'); (nr||G.scene).add(g);
  mouth={x:stand.x,z:stand.z,face,yaw:yaw+PI,dir};
}
const lowTide=()=>!!(G.tide&&G.tide.low)||(G.world.tide||0)<-.75;
function useMouth(){
  if(!lowTide()){ G.ui.say('The sea is in the cave mouth, chest-deep and pulling. It’ll go out with the tide.','Rowan',{priority:'high',key:'ncTide'}); return; }
  startTrans('in');
}

/* ================================================================ 5. IN AND OUT */
function fadeEl(){ return document.getElementById('fade'); }
const SWARM=new Set(['lantern','satchel','feed','hunt','jar','jarRelease','released']);
function shiftSwarm(delta,from){ const ms=(G.creatures&&G.creatures.moths)||[];
  for(const m of ms){ if(!m||!m.p||!SWARM.has(m.tgt))continue; if(m.p.distanceTo(from)>45)continue; m.p.add(delta); if(m.feedC&&m.feedC.isVector3&&m.feedC.distanceTo(from)<45)m.feedC.add(delta); } }
function startTrans(dir,o){ o=o||{}; if(S.trans)return false;
  if(o.instant){ doTeleport(dir,o.at); return true; }
  S.trans={dir,at:o.at,t:0,done:false}; const f=fadeEl(); if(f){ f.style.transition='opacity .8s'; f.style.opacity='1'; }
  G.player.setControl&&G.player.setControl(false); G.emit(dir==='in'?'northCave:entering':'northCave:leaving',{}); return true; }
function updateTrans(dt){ const T=S.trans; if(!T)return; T.t+=dt;
  if(!T.done&&T.t>=.9){ T.done=true; doTeleport(T.dir,T.at); const f=fadeEl(); if(f)f.style.opacity='0'; }
  if(T.t>=1.35){ G.player.setControl&&G.player.setControl(true); S.trans=null; } }
const SPAWN={mouth:[0,.15,-1.5,PI],foot:[0,TOP,-47+2.6,PI]};
function doTeleport(dir,at){
  const P=G.player, from=P.pos.clone(); let dest, yaw;
  if(dir==='in'){ const s=SPAWN[at||'mouth']; dest=toWorld(s[0],s[1],s[2]); yaw=s[3];
    if(!S.prevCp){ S.prevCp={p:G.state.checkpoint.clone(),yaw:G.state.checkpointYaw,name:G.state.checkpointName}; }
    setCp(at==='foot'?'foot':'mouth');
    if(!S.entered){ S.entered=true; later(1.4,()=>say('Somebody keeps lamps lit down here.','Rowan',{key:'ncIn1'})); later(3.2,()=>say('Green ones.','Rowan',{key:'ncIn2'})); } }
  else{ dest=V(mouth.x,G.world.height(mouth.x,mouth.z),mouth.z); yaw=mouth.yaw;
    if(S.prevCp){ G.state.checkpoint.copy(S.prevCp.p); G.state.checkpointYaw=S.prevCp.yaw; G.state.checkpointName=S.prevCp.name; S.prevCp=null; } }
  P.teleport(dest.x,dest.y,dest.z,yaw); if(P.aimCamera)P.aimCamera(yaw,.3);
  shiftSwarm(P.pos.clone().sub(from),from);
  setInside(dir==='in'); G.atmo.dark=G.atmo.darkTarget=dir==='in'?1:0;
}
function setCp(which){ const s=which==='foot'?[0,TOP,-47+2.6,PI,'the foot of the wrecker’s tower']:[0,.3,-6,PI,'the sea cave'];
  G.state.checkpoint.copy(toWorld(s[0],s[1],s[2])); G.state.checkpointYaw=s[3]; G.state.checkpointName=s[4]; }
const KEEP=new Set(['world','lighthouse','alchemy','northIsle','northLight','rowanBoat']), hidden=[]; let farPrev=null;
function hideOutside(on){
  if(on){ hidden.length=0; for(const ch of G.scene.children){ if(!KEEP.has(ch.name))continue;
      const walk=o=>{ let hasLight=false; o.traverse(c=>{ if(c.isLight)hasLight=true; }); if(!hasLight){ if(o.visible){o.visible=false;hidden.push(o);} return; } for(const c of o.children)if(!c.isLight)walk(c); }; walk(ch); }
    farPrev=G.camera.far; G.camera.far=150; G.camera.updateProjectionMatrix(); }
  else{ for(const o of hidden)o.visible=true; hidden.length=0; G.camera.far=farPrev||1200; G.camera.updateProjectionMatrix(); } }
function setInside(v){ if(v===S.inside)return; S.inside=v; API.inside=v;
  G.interior=v?INTERIOR:(G.interior===INTERIOR?null:G.interior); root.visible=v; hideOutside(v);
  if(G.renderer&&G.renderer.shadowMap){ G.renderer.shadowMap.autoUpdate=!v; if(!v)G.renderer.shadowMap.needsUpdate=true; }
  G.emit(v?'northCave:enter':'northCave:exit',{}); if(v)setQuest(); }

/* ================================================================ 6. WHAT'S IN IT */
const timers=[]; const later=(s,fn)=>timers.push({t:G.time+s,fn});
const say=(t,who,o)=>{ try{ G.ui.say(t,who||null,Object.assign({priority:'high'},o||{})); }catch(e){} };
const isPlay=()=>G.state.mode==='play';
function readLedger(){
  const first=!S.read.ledger; S.read.ledger=true; G.emit('northCave:ledger',{first});
  const card={who:'page',name:'A ledger',title:'A page a season, in a careful square hand',portrait:'page',key:'nc:ledger',lines:[
    'Every page is a season, every line a ship. The oldest pages are twenty years old.',
    '“Spring. A two-master, the Swift, out of Carrow. Eleven aboard. It was fed.”',
    '“Autumn. The Gannet, a Wickham’s End crabber, the Pellow boys. I turned the fire down to an ember and let her by. It sulked a month.”',
    'The last line is new. “Autumn. One sail in the fog, coming up from the south, steering straight for us. Wickham’s rocks took her before the fire could. I hope whoever it was could swim.”']};
  let shown=''; try{ shown=G.talk&&G.talk.moment?G.talk.moment(card):''; }catch(e){}
  if(!shown)card.lines.forEach(l=>say(l,'A ledger'));
  if(first){ const go=()=>{ say('That’s my father’s hand.','Rowan',{key:'ncHand1'}); later(1.8,()=>say('He cut my name on my first oar in letters just like these.','Rowan',{key:'ncHand2'})); later(3.8,()=>say('He’s alive. He’s up there.','Rowan',{key:'ncHand3'})); setQuest(); };
    if(G.talk&&G.talk.isOpen){ const off=G.on('talk:close',()=>{ off&&off(); later(.4,go); }); if(!off)later(6,go); } else later(.6,go);
    try{ G.ui.logLine&&G.ui.logLine('A ledger of wrecks in the sea cave, a page a season, in his father’s hand.','Found'); }catch(e){} }
}
function lookToy(){ S.read.toy=true;
  say('A little boat carved from driftwood, painted blue, with an R cut in the keel.','Rowan',{key:'ncToy1'});
  later(2,()=>say('He made me one just like it, the winter before the Margery went out. I lost mine years ago.','Rowan',{key:'ncToy2'})); }
function turnWheel(){
  if(S.drained||S.draining)return; S.draining={t:0}; G.emit('northCave:sluice',{});
  say('The wheel is stiff, then it isn’t. Somewhere under the quay a gate grinds open, and the sea starts to go out of the low passage.',null,{key:'ncWheel'});
  try{ const A=G.audio; if(A&&A.ready&&A.S){ const t=A.context.currentTime; A.S.clank&&A.S.clank(t,{g:.18,dur:.3}); A.S.thud(t+.6,{g:.2,dur:.4}); } }catch(e){}
}
function updateWater(dt){
  if(S.draining){ S.draining.t+=dt; S.water=lerp(.55,-1.7,smooth(0,4.5,S.draining.t)); if(wheel)wheel.rotation.x+=dt*2.2*(1-smooth(3,4.5,S.draining.t));
    if(S.draining.t>=4.6){ S.draining=null; S.drained=true; G.emit('northCave:drained',{}); setQuest(); } }
  else S.water=S.drained?-1.7:.55;
  if(waterLow){ waterLow.position.y=S.water+.02*Math.sin(G.time*1.3); waterLow.visible=S.water>-1.6; }
  if(waterCh)waterCh.position.y=-.05+.04*Math.sin(G.time*.9);
}
/* the hoist: work the windlass on the platform and it carries you up the shaft (or down) */
function onPlatform(){ const P=G.player, lx=P.pos.x-O.x, lz=P.pos.z-O.z, ly=P.pos.y-O.y; return Math.hypot(lx-SHAFT.x,lz-SHAFT.z)<PLAT_R-.15&&Math.abs(ly-S.plat)<.5; }
function workHoist(){
  if(S.hoist)return; const up=S.plat<TOP-1; S.hoist={t:0,from:S.plat,to:up?TOP:BOT,dur:7.5}; G.emit('northCave:hoist',{up});
  say(up?'You haul on the windlass and the platform shudders, then lifts. The rock goes past, close enough to touch.':'You let the windlass run, and the platform sinks back down the shaft.',null,{key:'ncHoist'});
}
function updateHoist(dt){
  const H=S.hoist; if(!H)return; const P=G.player, ride=onPlatform(); H.t+=dt;
  const k=smooth(0,1,H.t/H.dur), y=lerp(H.from,H.to,k), dy=y-S.plat; S.plat=y;
  if(ride){ P.pos.y+=dy; P.camPull={yaw:P.heading,pitch:1.05,dist:2.6,rate:2}; }   // the camera rides above him, looking down the rope
  if(rope)rope.rotation.x+=dt*(H.to>H.from?-4:4);
  if(H.t>=H.dur){ S.plat=H.to; S.hoist=null; if(P.camPull&&P.camPull.pitch===1.05)P.camPull=null; S.hoistTop=H.to>=TOP-.1; if(S.hoistTop){ setCp('foot'); if(!S.met)later(.8,meetFather); } else setCp('mouth'); setQuest(); }
}
/* the first meeting */
function meetFather(){
  if(S.met||S.scene)return; S.scene={t:0,phase:'down'}; knox.visible=true;
  const ta=-PI/2+19*.36; knox.position.set(Math.cos(ta)*(TF_R-.55),.35+19*.37,Math.sin(ta)*(TF_R-.55)); knox.rotation.y=-ta;
  if(S._glowUp)S._glowUp.intensity=1.2;
  say('Boots on the stair above you. A green lamp, coming down.',null,{key:'ncBoots'});
  G.player.setControl&&G.player.setControl(false);
}
function updateScene(dt){
  const sc=S.scene; if(!sc)return; sc.t+=dt;
  if(sc.phase==='down'){ const k=smooth(0,3.2,sc.t), steps=lerp(19,4,k), a=-PI/2+steps*.36;
    knox.position.set(Math.cos(a)*(TF_R-.55),.35+steps*.37+.05*Math.sin(sc.t*9),Math.sin(a)*(TF_R-.55));
    const P=G.player, wx=P.pos.x-O.x-SHAFT.x, wz=P.pos.z-O.z-SHAFT.z; knox.rotation.y=Math.atan2(wx-knox.position.x,wz-knox.position.z);
    if(sc.t>3.4){ sc.phase='talk'; G.player.setControl&&G.player.setControl(true); openTalk(); } }
  else if(sc.phase==='up'){ const k=smooth(0,3,sc.t), steps=lerp(4,21,k), a=-PI/2+steps*.36;
    knox.position.set(Math.cos(a)*(TF_R-.55),.35+steps*.37,Math.sin(a)*(TF_R-.55)); knox.rotation.y=-a-PI/2;
    if(sc.t>3.1){ knox.visible=false; if(S._glowUp)S._glowUp.intensity=.5; S.scene=null;
      try{ const A=G.audio; if(A&&A.ready&&A.S){ const t=A.context.currentTime; A.S.thud(t,{g:.25,dur:.25}); A.S.clank&&A.S.clank(t+.35,{g:.14,dur:.2}); } }catch(e){}
      say('The trapdoor bangs shut above. A bar drops across it.',null,{key:'ncTrap'});
      later(1.6,()=>say('Twenty years. He’s been up there twenty years, feeding that fire.','Rowan',{key:'ncAfter1'}));
      later(3.6,()=>{ try{ G.ui.toast('The fire room','Coming in the next chapter'); }catch(e){} });
      setQuest(); } }
}
const R=t=>({text:t,who:'Rowan'});
function openTalk(){
  const asked={};
  const close={id:'home',text:'Come home with me.',next:()=>({lines:[
      'Home.',
      'It would follow me there. It’s kept me alive twenty years, son, and it keeps what it saves.',
      'Go home. Go home before it learns your name.'],choices:[{id:'end',text:'…',action:()=>{}}]})};
  const B={
    drowned:{id:'drowned',text:'They told us you drowned.',lines:['I did, near enough. The Margery broke under me on these rocks, and I was going down with her.',
      'Then the fire on the crag reached into the water and pulled me out. It’s kept me breathing ever since.','It asks for things in return.']},
    rocks:{id:'rocks',text:'Your light put me on the rocks.',lines:['…The little boat. This autumn, in the fog. One sail, coming up from the south.',
      'I watched her come. I prayed she’d turn. Then Wickham’s rocks had her, and I was glad, God help me, I was glad.','I didn’t know it was you. How could I know it was you?']},
    fire:{id:'fire',text:'What is that fire?',lines:['Older than the lighthouse. Older than whatever’s under your wood.',
      'It wants a ship a season. If I give it strangers, it leaves Wickham’s End alone.','Twenty years, Rowan, and it hasn’t touched the hamlet once. Not once.']}};
  const node=(id)=>{ asked[id]=true; const b=B[id]; return {lines:b.lines,choices:more()}; };
  const more=()=>{ const out=[]; for(const k of ['drowned','rocks','fire'])if(!asked[k])out.push({id:k,text:B[k].text,next:()=>node(k)}); out.splice(Math.min(out.length,2),0,close); return out.slice(0,3); };
  const card={who:'Knox',name:'Tobias Knox',title:G.portraits?G.portraits.title('knox'):'The wrecker',portrait:'knox',
    lines:['Nobody comes up the wreckers’ stair. Nobody alive.','…Rowan?','No. No, you were this high. You were in Wickham’s End, with the keeper’s girl, you were—',R('Da.')],
    choices:more(),onClose:()=>endTalk()};
  let ok=false; try{ ok=!!(G.talk&&G.talk.open&&G.talk.open(card)); }catch(e){ console.error(e); }
  if(!ok){ card.lines.forEach(l=>say(typeof l==='string'?l:l.text,typeof l==='string'?'Tobias Knox':'Rowan')); endTalk(); }
}
function endTalk(){ if(S.met)return; S.met=true; G.emit('northCave:met',{}); S.scene={t:0,phase:'up'}; }
function tryTrap(){ say(S.met?'Barred from above. He isn’t opening it.':'A trapdoor, at the top of the stair.','Rowan',{key:'ncTrapTry'}); if(S.met)try{ G.ui.toast('The fire room','Coming in the next chapter'); }catch(e){} }

/* ================================================================ 7. THE OBJECTIVE */
function setQuest(){
  if(!G.quest)return; const NI=G.northIsle;
  if(!S.inside){ if(NI&&NI.inside&&NI.state&&NI.state.door&&!S.met&&mouth)G.quest.set('north:cave','Another way in','Wreckers always have a way up from the water. Look along the shore under the cliffs',V(mouth.face.x,1.5,mouth.face.z),'The sea cave'); return; }
  const w=(x,y,z)=>toWorld(x,y,z);
  if(S.met){ G.quest.set('north:met','The fire room','Your father went back up to the fire and barred the trapdoor. The next chapter starts here',null,''); return; }
  if(!S.read.ledger){ G.quest.set('north:caveIn','The wreckers’ stair','Somebody keeps lamps lit down here. Find out who',w(-20.5,3,-32.5),'The store'); return; }
  if(!S.drained){ G.quest.set('north:sluice','The wreckers’ stair','The way on is flooded. There’s a wheel on the quay wall',w(1.15,2.2,-25.4),'The sluice wheel'); return; }
  if(!S.hoistTop){ G.quest.set('north:hoist','The wreckers’ stair','A hoist goes up through the rock, into the tower',w(SHAFT.x,2,SHAFT.z),'The hoist'); return; }
  G.quest.set('north:foot','The foot of the tower','Someone is coming down the stair',null,'');
}

/* ================================================================ 8. SAVE */
const reg=()=>G.persist&&G.persist.register&&G.persist.register('northCave',{
  save:()=>({v:1,entered:S.entered,drained:S.drained,hoistTop:S.hoistTop,read:Object.assign({},S.read),met:S.met,
    prevCp:S.prevCp?{p:[+S.prevCp.p.x.toFixed(2),+S.prevCp.p.y.toFixed(2),+S.prevCp.p.z.toFixed(2)],yaw:S.prevCp.yaw||0,name:S.prevCp.name||''}:null}),
  load:d=>{ if(!d)return; S.entered=!!d.entered; S.drained=!!d.drained; S.hoistTop=!!d.hoistTop; S.read=Object.assign({},d.read||{}); S.met=!!d.met;
    S.plat=S.hoistTop?TOP:BOT; S.water=S.drained?-1.7:.55; S.prevCp=d.prevCp?{p:V(d.prevCp.p[0],d.prevCp.p[1],d.prevCp.p[2]),yaw:d.prevCp.yaw,name:d.prevCp.name}:null; }});
if(G.persist&&G.persist.register)reg(); else G.on('ready',reg);
G.on('game:reset',()=>{ Object.assign(S,{entered:false,drained:false,hoistTop:false,read:{},met:false,plat:BOT,water:.55,hoist:null,scene:null,prevCp:null}); });
G.on('north:door',()=>later(1.2,()=>setQuest()));

/* ================================================================ 9. WIRING */
G.system('northCave',{order:86,modes:['play','paused','dead','title'],
  init(){
    try{ build(); buildMouth(); }catch(e){ console.error('northCave',e); }
    const IA=G.interact, ins=()=>isPlay()&&S.inside&&!S.trans, L=(x,y,z)=>()=>toWorld(x,y,z);
    IA.add({pos:()=>mouth?V(mouth.x,.4,mouth.z):V(0,-999,0),radius:3.2,priority:5,label:()=>lowTide()?'Go into the sea cave':'The sea cave',
      enabled:()=>isPlay()&&!S.inside&&!S.trans&&!!mouth&&!!(G.northIsle&&G.northIsle.inside),use:useMouth});
    IA.add({pos:L(0,.4,1.2),radius:2.6,priority:5,label:'Leave the cave',enabled:ins,use:()=>startTrans('out')});
    IA.add({pos:L(-20.5,2.5,-32.5),radius:2.2,priority:5,label:()=>S.read.ledger?'The ledger':'Read the ledger',enabled:ins,use:readLedger});
    IA.add({pos:L(-21.8,3.2,-31.2),radius:2.0,priority:6,label:'The carved boat',enabled:()=>ins()&&!!S.read.ledger&&!S.read.toy,use:lookToy});
    IA.add({pos:L(1.15,1.4,-25.4),radius:2.2,priority:5,label:'Turn the sluice wheel',enabled:()=>ins()&&!S.drained&&!S.draining,use:turnWheel});
    IA.add({pos:()=>toWorld(SHAFT.x,S.plat+.4,SHAFT.z),radius:1.6,priority:7,label:()=>S.plat<TOP-1?'Work the hoist':'Let the hoist down',
      enabled:()=>ins()&&!S.hoist&&!S.scene&&onPlatform(),use:workHoist});
    const ta=-PI/2+21*.36; IA.add({pos:L(SHAFT.x+Math.cos(ta)*(TF_R-.6),TOP+.5,SHAFT.z+Math.sin(ta)*(TF_R-.6)),radius:1.5,priority:6,label:'The trapdoor',enabled:()=>ins()&&!S.scene&&S.plat>=TOP-.1,use:tryTrap});
    root.visible=false;
  },
  update(dt){
    for(let i=timers.length-1;i>=0;i--){ if(G.time>=timers[i].t){ const f=timers[i].fn; timers.splice(i,1); try{ f(); }catch(e){ console.error(e); } } }
    updateTrans(dt||0);
    const P=G.player;
    if(P&&P.pos&&!S.trans){ const inC=inBoxW(P.pos.x,P.pos.z)&&P.pos.y>O.y-40; if(inC!==S.inside)setInside(inC); }
    if(plat){ plat.position.y=S.plat; const L=TOP+8.4-S.plat; for(const r of S._ropes||[]){ r.scale.y=L; r.position.y=L/2; } }
    if(!S.inside){ if(mouth&&P&&G.northIsle&&G.northIsle.inside&&!S.said.mouth&&Math.hypot(P.pos.x-mouth.x,P.pos.z-mouth.z)<9){ S.said.mouth=1;
        say('A cave, under the cliff. There’s an iron ring in the rock by the mouth. Somebody ties a boat up here.','Rowan',{key:'ncMouth'}); } return; }
    const m=G.state.mode, d=dt||0;
    if(m!=='title')G.atmo.darkTarget=.85;
    G.lights.sun.intensity=0;
    { const fog=G.scene.fog; if(fog){ fog.color.copy(FOG0); if(G.scene.background&&G.scene.background.isColor)G.scene.background.copy(fog.color); }
      G.lights.hemi.color.lerp(HEMI_SKY,.75); G.lights.hemi.groundColor.lerp(HEMI_GND,.75); }
    for(const l of lamps){ const f=.85+.15*Math.sin(G.time*7.1+l.g.position.x)*Math.sin(G.time*2.3); l.L.intensity=l.base*f; l.sp.material.opacity=.5*f; }
    if(m==='play'){ updateWater(d); updateHoist(d); updateScene(d); }
    if(m==='play'&&!S.drained&&!S.said.flood){ const lx=P.pos.x-O.x, lz=P.pos.z-O.z; if(Math.abs(lx)<1.8&&lz<-26.9&&lz>-30&&P.pos.y-O.y<3){ S.said.flood=1;
      say('The passage dips under the water, flooded right to the roof. The sea came in this way, and something keeps it here.','Rowan',{key:'ncFlood'}); } }
  }
});
const FOG0=col('#050608'), HEMI_SKY=col('#4c5a5a'), HEMI_GND=col('#121618');

/* ================================================================ 10. HIS PORTRAIT */
if(G.portraits&&G.portraits.add)G.portraits.add('knox',(g,w,h,glass)=>{
  const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,glass?'#3e5a50':'#24302c'); gr.addColorStop(1,'#0c100f'); g.fillStyle=gr; g.fillRect(0,0,w,h);
  const cx=w/2, hy=h*.42, hr=w*.22;
  const e=g.createRadialGradient(cx+w*.2,h*.3,0,cx+w*.2,h*.3,w*.6); e.addColorStop(0,'rgba(120,240,180,.35)'); e.addColorStop(1,'rgba(120,240,180,0)'); g.fillStyle=e; g.fillRect(0,0,w,h);
  g.fillStyle='#3c3a2c'; g.beginPath(); g.ellipse(cx,h*1.05,w*.52,h*.38,0,PI,TAU); g.fill();              // oilskin shoulders
  g.fillStyle='#b89a84'; g.beginPath(); g.ellipse(cx,hy,hr,hr*1.18,0,0,TAU); g.fill();                    // face
  g.fillStyle='#8f8c86'; g.beginPath(); g.moveTo(cx-hr*.95,hy+hr*.05); g.quadraticCurveTo(cx-hr*.9,hy+hr*1.7,cx,hy+hr*1.85); g.quadraticCurveTo(cx+hr*.9,hy+hr*1.7,cx+hr*.95,hy+hr*.05);
  g.quadraticCurveTo(cx,hy+hr*.55,cx-hr*.95,hy+hr*.05); g.fill();                                          // the beard
  g.fillStyle='#2c3038'; g.beginPath(); g.ellipse(cx,hy-hr*.72,hr*1.08,hr*.62,0,PI,TAU); g.fill(); g.fillRect(cx-hr*1.08,hy-hr*.75,hr*2.16,hr*.2);   // the cap
  g.fillStyle='#9ff5c8'; for(const s of [-1,1]){ g.beginPath(); g.ellipse(cx+s*hr*.38,hy-hr*.05,hr*.11,hr*.07,0,0,TAU); g.fill(); }   // green in his eyes
  g.strokeStyle='rgba(60,40,30,.55)'; g.lineWidth=1.4; for(const s of [-1,1]){ g.beginPath(); g.moveTo(cx+s*hr*.6,hy+hr*.25); g.lineTo(cx+s*hr*.75,hy+hr*.5); g.stroke(); }
  g.strokeStyle='rgba(233,220,192,.35)'; g.lineWidth=3; g.beginPath(); g.ellipse(w/2,h/2,w/2-3,h/2-3,0,0,TAU); g.stroke();
},{title:'The wrecker',names:[/Tobias Knox|^Knox$/]});

const API=G.northCave={inside:false,O,state:S,setQuest,enter:o=>startTrans('in',o),exit:o=>startTrans('out',o),
  get mouth(){ return mouth; }, lowTide,
  debug:{ S, toWorld, SHAFT, TOP, floorL, walkL, workHoist, turnWheel, readLedger, meet:meetFather, get knox(){ return knox; } }};
})();

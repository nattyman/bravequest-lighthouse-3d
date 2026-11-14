/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — world.js  (World agent)
   The island: analytic terrain (height/walkable/landmarks, synchronous),
   terrain mesh, sea, sky, fog/atmosphere, forest, moor, hamlet, standing
   stones, headland cottage + shed, cliff path, grass, mushrooms.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const {clamp,lerp,smooth,vnoise,fbm}=U;
const PI=Math.PI, TAU=PI*2, TOP=42;
const W=G.world;
W.seaLevel=0;

/* =====================================================================
   1. ANALYTIC TERRAIN (available at script evaluation)
   ===================================================================== */

/* cliff path ramp centreline: [x, z, surfaceHeight]. Bottom on the moor, top on the plateau. */
const RAMP=[[95,12,13.5],[103,24,15],[107,-22,26.5],[108.5,-30,27.8],[113,-31.5,29],[114.5,-24,30.2],[116.5,12,40.6],[123,17,42],[130,10,42],[135,2,42]];
const RW=2.2, RB=2.8; // ramp half width, bank width
const RSEG=[];
for(let i=0;i<RAMP.length-1;i++){const a=RAMP[i],b=RAMP[i+1],dx=b[0]-a[0],dz=b[1]-a[1];
  RSEG.push({ax:a[0],az:a[1],ha:a[2],hb:b[2],dx,dz,l2:dx*dx+dz*dz});}

/* main trail: lighthouse apron -> cliff path -> moor -> hamlet -> forest -> Resisting Tree */
const PATH=[[171,0],[160,1],[148,3]].concat(RAMP.slice().reverse().map(p=>[p[0],p[1]])).concat([
  [80,6],[62,-2],[46,-12],[30,-5],[14,9],[0,20],[-12,28],[-22,30],[-34,29],[-46,23],[-58,15],
  [-72,9],[-88,3],[-104,-3],[-120,1],[-134,7],[-147,7],[-156,7]]);
/* side trails (colour only) */
const EXTRA=[[[45,-13],[42,-25]],[[158,2],[158,15.5],[158,20.3]],[[150,3],[146,14],[146,26],[150,30.5]],[[-22,30],[-20,22]],[[-22,30],[-24,38]]];

/* flatten zones (clearing, hamlet, stones, ramp foot) */
const FZ=[{x:-165,z:5,r0:15,r1:25,k:1},{x:-20,z:30,r0:14,r1:28,k:.85},{x:40,z:-35,r0:10,r1:17,k:.9},{x:97,z:14,r0:6,r1:15,k:1,h:13.5}];
function inlandRaw(x,z){
  let h=10.5+15*(fbm(x*.0105+3.1,z*.0105+7.7,4)-.47)+3.2*(fbm(x*.043+11,z*.043+5,3)-.47);
  const ff=smooth(-55,-85,x);
  if(ff>0)h+=ff*(2.6*(vnoise(x*.07+2,z*.07+9)-.5)-1.2);
  return h;
}
for(const f of FZ) if(f.h==null) f.h=inlandRaw(f.x,f.z);
/* VIGIL (1/2) — the sunken hollow in the old wood past the Resisting Tree (temple.js, Place agent; TEMPLE.md). A flatten zone
   sunk 4.4 m below the wood: last in FZ, so it only shapes the ground inside its own 12 m. The rest of the section is below
   the Tiled class ("VIGIL (2/2)"). */
const VIGIL={x:-192,z:2,r0:4.6,r1:12,drop:4.4};
VIGIL.h=inlandRaw(VIGIL.x,VIGIL.z)-VIGIL.drop;
FZ.push({x:VIGIL.x,z:VIGIL.z,r0:VIGIL.r0,r1:VIGIL.r1,k:1,h:VIGIL.h});
function inland(x,z){
  let h=inlandRaw(x,z);
  for(let i=0;i<FZ.length;i++){const f=FZ[i],dx=x-f.x,dz=z-f.z,d2=dx*dx+dz*dz; if(d2>f.r1*f.r1)continue;
    h=lerp(h,f.h,f.k*(1-smooth(f.r0,f.r1,Math.sqrt(d2))));}
  h=lerp(h,14,smooth(80,100,x));
  return clamp(h,4.5,17.5);
}
/* approximate inland distance from the coastline (m), negative at sea */
function coastD(x,z){
  let hw=z<0?74+9*Math.sin(x*.021+.7)+5*Math.sin(x*.047+2.1):82+7*Math.sin(x*.017+2.3)+4*Math.sin(x*.051+.4);
  if(x<-160){const t=Math.min(1,(-160-x)/72);hw*=Math.sqrt(1-t*t);}
  else if(x>70){const t=Math.min(1,(x-70)/54);hw*=Math.sqrt(1-t*t);}
  return hw-Math.abs(z)+(fbm(x*.022+5.3,z*.022+9.1,4)-.47)*30+(vnoise(x*.08+1.7,z*.08)-.5)*5;
}
const beachK=(x,z)=>smooth(-8,14,z)*smooth(-72,-50,x)*(1-smooth(84,100,x));
function lowland(x,z){
  const d=coastD(x,z);
  if(d<=0)return Math.max(-11,-.5+d*.3);
  const B=beachK(x,z), bw=lerp(8,30,B);
  if(d>=bw)return inland(x,z);
  return lerp(-.5+d*lerp(.3,.06,B),inland(x,z),smooth(bw*.15,bw,d));
}
/* headland plateau: signed distance, positive inside (x ~118..214, z ~-46..46) */
function plateauSD(x,z){
  const qx=Math.abs(x-166)-48+16, qz=Math.abs(z)-46+16;
  const out=Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-16;
  return -out+(fbm(x*.045+40,z*.045-13,3)-.47)*6.5+(vnoise(x*.21,z*.21)-.5)*1.3-1;
}
function rampApply(x,z,h){
  const R=(RW+RB)*(RW+RB);
  for(let k=0;k<RSEG.length;k++){const s=RSEG[k];
    let t=((x-s.ax)*s.dx+(z-s.az)*s.dz)/s.l2; t=t<0?0:t>1?1:t;
    const px=s.ax+s.dx*t-x, pz=s.az+s.dz*t-z, d2=px*px+pz*pz;
    if(d2>=R)continue;
    const rh=s.ha+(s.hb-s.ha)*t;
    h=rh+(h-rh)*smooth(RW,RW+RB,Math.sqrt(d2));
  }
  return h;
}
let _lx=NaN,_lz=NaN,_lh=0;
function height(x,z){
  if(x===_lx&&z===_lz)return _lh;
  let h=lowland(x,z);
  if(x>90){
    const dp=plateauSD(x,z);
    if(dp>=0)h=TOP;
    else{
      const wB=lerp(6.5,17,smooth(1,9,h));
      if(dp>-wB){const t=smooth(-wB,-.3,dp); h=lerp(h,TOP,t)+(vnoise(x*.33+3,z*.33-1)-.5)*9*t*(1-t);}
    }
    if(x<142&&z>-42&&z<32)h=rampApply(x,z,h);
  }
  _lx=x;_lz=z;_lh=h;
  return h;
}
function seaCliff(x,z){const dp=plateauSD(x,z); if(dp>=-.8||dp<-15)return false; return lowland(x,z)<5;}
W.height=height;
/* TIDE HOOK (alchemy.js): W.tide is the sea-level offset in metres, 0 at high tide (the Act 1 sea)
   down to about -1.2 at low tide. It lowers the sea mesh and lets characters walk the exposed sand. */
W.tide=0;
W.walkable=(x,z)=>{
  if(x<-238||x>238||z<-114||z>114)return false;
  if(height(x,z)<-1.2+W.tide)return false; // tide hook
  if(x>100&&seaCliff(x,z))return false;
  return true;
};
W.plateauY=TOP;
W.inForest=(x)=>x<-70;
W.onPlateau=(x,z)=>x>110&&plateauSD(x,z)>=0;

/* distance to the trail polylines (exact; a fast gridded version is built in init) */
const ALLPATHS=[PATH].concat(EXTRA);
function pathDistExact(x,z){
  let best=1e9;
  for(const pl of ALLPATHS)for(let i=0;i<pl.length-1;i++){
    const ax=pl[i][0],az=pl[i][1],dx=pl[i+1][0]-ax,dz=pl[i+1][1]-az,l2=dx*dx+dz*dz;
    let t=((x-ax)*dx+(z-az)*dz)/l2; t=t<0?0:t>1?1:t;
    const px=ax+dx*t-x,pz=az+dz*t-z,d=px*px+pz*pz; if(d<best)best=d;}
  return Math.sqrt(best);
}
let PD=null; const PDX0=-244,PDZ0=-120,PDS=2,PDNX=245,PDNZ=121;
function pathDist(x,z){
  if(!PD)return pathDistExact(x,z);
  const fx=(x-PDX0)/PDS,fz=(z-PDZ0)/PDS; if(fx<0||fz<0||fx>=PDNX-1||fz>=PDNZ-1)return 99;
  const i=fx|0,j=fz|0,u=fx-i,v=fz-j,a=j*PDNX+i;
  return (PD[a]*(1-u)+PD[a+1]*u)*(1-v)+(PD[a+PDNX]*(1-u)+PD[a+PDNX+1]*u)*v;
}
W.pathDist=pathDist;

/* ---------- landmarks ---------- */
function onLand(x,z,min=2.2){ // nudge toward the island spine until on dry land
  let k=0; while(height(x,z)<min&&k<60){z*=.94;k++;} return [x,z];
}
const LP=(x,z,extra)=>Object.assign({x,y:height(x,z),z},extra||{});
const LM=W.landmarks;
Object.assign(LM,{
  start:LP(164,-4,{yaw:PI/2}),
  lighthouse:{x:180,y:TOP,z:0},
  cottage:LP(158,24), shed:LP(150,33), halloran:LP(124,16),
  resistingTree:LP(-165,5,{r:14}), lanternSpot:LP(-160,9),
  hamlet:LP(-20,30), stones:LP(40,-35),
  cliffPathBottom:LP(95,12), cliffPathTop:LP(135,2),
  finale:{x:165,y:TOP,z:0,r:28},
});
LM.patches=[[-118,-22],[-95,26],[-150,-34],[-190,30],[-62,-34],[-32,8],[12,40],[30,-12],[72,20],[88,-28]].map(p=>{const q=onLand(p[0],p[1]);return LP(q[0],q[1]);});
LM.mushrooms=[[-74,22],[-86,-30],[-108,34],[-126,-14],[-146,24],[-176,-12],[-171,16],[-200,6],[-96,-48],[-19,46],[-38,34],[46,-29],[-64,-12],[70,24]].map(p=>{const q=onLand(p[0],p[1]);return LP(q[0],q[1]);});
function shorePoint(x){let z=30; while(z<110&&height(x,z)>.9)z+=1; return LP(x,z-3);}
LM.negativeHomes=[
  Object.assign(LP(-140,-40),{kind:'stag'}),Object.assign(LP(-200,-20),{kind:'stag'}),
  Object.assign(LP(-102,16),{kind:'fox'}),Object.assign(LP(18,-32),{kind:'fox'}),
  Object.assign(LP(60,30),{kind:'hare'}),Object.assign(LP(-44,-42),{kind:'hare'}),
  Object.assign(shorePoint(8),{kind:'heron'}),Object.assign(shorePoint(64),{kind:'heron'})];
LM.monsterZones=[
  {name:'forest',x:-130,z:0,r:50,kinds:['hollow','hound'],count:6},
  {name:'hamlet',x:-20,z:30,r:22,kinds:['hollow'],count:3},
  {name:'moor',x:55,z:-10,r:30,kinds:['hound'],count:3}];
LM.path=PATH.map(p=>({x:p[0],z:p[1]}));

/* ---------- keeper's cottage: walk-in interior (geometry constants, available at script evaluation) ----------
   Local frame: origin at the cottage centre on the plateau (y=TOP), no yaw. The front (door) faces -z (north, toward the path).
   Ground-floor stone walls: outer ±4.5 / ±3.2, inner ±4.05 / ±2.75. Door opening x -3.0..-1.4 in the north wall. */
const COT={x:158,z:24,Wd:9,Dp:6.4,ix:4.05,iz:2.75,ox:4.5,oz:3.2,floor:.24,doorX:-2.2,doorW:1.6,doorH:2.28};
G.items.cloak=G.items.cloak||{owned:false};
W.cottage={
  /** true when pos is inside the cottage's ground-floor room */
  inside(p){const lx=p.x-COT.x,lz=p.z-COT.z; return Math.abs(lx)<COT.ix&&Math.abs(lz)<COT.iz&&p.y>TOP-1&&p.y<TOP+5;},
  /** inside the room or standing in the door opening */
  near(p){const lx=p.x-COT.x,lz=p.z-COT.z; if(p.y<TOP-1||p.y>TOP+5)return false;
    return (Math.abs(lx)<COT.ix&&Math.abs(lz)<COT.iz)||(Math.abs(lx-COT.doorX)<COT.doorW/2&&lz>-COT.oz-.05&&lz<0);},
  door:{x:COT.x+COT.doorX,y:TOP,z:COT.z-COT.oz},
  chest:{x:COT.x+1.0,y:TOP+COT.floor,z:COT.z+2.24},
  floorY:TOP+COT.floor,
  doorOpen:false, chestOpen:false
};
LM.cottageDoor={x:W.cottage.door.x,y:TOP,z:W.cottage.door.z};
LM.chest={x:W.cottage.chest.x,y:W.cottage.chest.y,z:W.cottage.chest.z};
// raised plank floor (+0.24 m) over the whole plinth, incl. the threshold
G.floorProviders.push((x,z,y)=>{const lx=x-COT.x,lz=z-COT.z; if(Math.abs(lx)<COT.ox+.15&&Math.abs(lz)<COT.oz+.15){const h=TOP+COT.floor; return h<=y+.9?h:null;} return null;});
// the stone doorstep outside the north door (top ~0.21 m above the plateau)
G.floorProviders.push((x,z,y)=>{const lx=x-COT.x-COT.doorX,lz=z-COT.z; if(Math.abs(lx)<1.1&&lz<-COT.oz-.15&&lz>-COT.oz-1.05){const h=TOP+.21; return h<=y+.9?h:null;} return null;});

/* building footprints: grass/props stay out; colliders added in init */
const FOOT=[{x:158,z:24,hw:5,hd:3.8,yaw:0},{x:150,z:33,hw:2.6,hd:2.1,yaw:.15}];
const HAMLET=[{x:-31,z:21,yaw:.2},{x:-9,z:19,yaw:-.12},{x:-28,z:41,yaw:.35},{x:-7,z:39,yaw:-.28}];
for(const h of HAMLET)FOOT.push({x:h.x,z:h.z,hw:4,hd:3,yaw:h.yaw});
/* UNDERCROFT hook (undercroft.js, Place agent): the cellar trapdoor in the floor of the hamlet ruin nearest the well
   (HAMLET[3]), on its well side, clear of the fallen roof. yaw = the ruin's. */
{ const h=HAMLET[3], px=-1.9, pz=-1.05, cs=Math.cos(h.yaw), sn=Math.sin(h.yaw), x=h.x+px*cs+pz*sn, z=h.z-px*sn+pz*cs;
  LM.undercroftDoor={x,y:height(x,z),z,yaw:h.yaw}; }
function inFoot(x,z,pad=0){
  for(const f of FOOT){const cs=Math.cos(f.yaw),sn=Math.sin(f.yaw),dx=x-f.x,dz=z-f.z;
    const lx=dx*cs-dz*sn, lz=dx*sn+dz*cs; if(Math.abs(lx)<f.hw+pad&&Math.abs(lz)<f.hd+pad)return true;}
  return false;
}
/* places props must avoid */
const KEEP=[{x:-160,z:9,r:4},{x:124,z:16,r:4},{x:95,z:12,r:5},{x:164,z:-4,r:4},{x:180,z:0,r:12},{x:40,z:-35,r:11}];
LM.mushrooms.forEach(m=>KEEP.push({x:m.x,z:m.z,r:2.5}));
LM.patches.forEach(m=>KEEP.push({x:m.x,z:m.z,r:4}));
LM.negativeHomes.forEach(m=>KEEP.push({x:m.x,z:m.z,r:3}));
function clearOf(x,z,r){
  for(const k of KEEP){const dx=x-k.x,dz=z-k.z,rr=k.r+r; if(dx*dx+dz*dz<rr*rr)return false;}
  return !inFoot(x,z,r);
}

/* =====================================================================
   2. HELPERS (geometry merging, tiled instancing, textures)
   ===================================================================== */
const col=U.col;
const _v=new THREE.Vector3(),_n=new THREE.Vector3(),_c=new THREE.Color(),_nm=new THREE.Matrix3();
const _p=new THREE.Vector3(),_q=new THREE.Quaternion(),_s=new THREE.Vector3(),_e=new THREE.Euler(),_m=new THREE.Matrix4();
const UNITBOX=new THREE.BoxGeometry(1,1,1);
function mat4(x,y,z,rx,ry,rz,sx,sy,sz){return new THREE.Matrix4().compose(_p.set(x,y,z),_q.setFromEuler(_e.set(rx||0,ry||0,rz||0)),_s.set(sx==null?1:sx,sy==null?(sx==null?1:sx):sy,sz==null?(sx==null?1:sx):sz));}
/** merge parts [{g, m?, c?: Color | fn(pos,nor,outColor)}] into one non-indexed geometry with position/normal/color(/uv) */
function mergeParts(parts,o={}){
  let n=0; const list=[];
  for(const p of parts){const g=p.g.index?p.g.toNonIndexed():p.g; list.push([g,p]); n+=g.attributes.position.count;}
  const pos=new Float32Array(n*3),nor=new Float32Array(n*3),cl=new Float32Array(n*3),uv=o.uv?new Float32Array(n*2):null;
  let k=0;
  for(const [g,p] of list){
    const P=g.attributes.position,N=g.attributes.normal,UV=g.attributes.uv,m=p.m||null;
    if(m)_nm.getNormalMatrix(m);
    for(let i=0;i<P.count;i++,k++){
      _v.fromBufferAttribute(P,i); if(m)_v.applyMatrix4(m);
      if(N){_n.fromBufferAttribute(N,i); if(m)_n.applyMatrix3(_nm); _n.normalize();} else _n.set(0,1,0);
      if(p.nf)p.nf(_v,_n);
      pos[k*3]=_v.x;pos[k*3+1]=_v.y;pos[k*3+2]=_v.z; nor[k*3]=_n.x;nor[k*3+1]=_n.y;nor[k*3+2]=_n.z;
      if(typeof p.c==='function')p.c(_v,_n,_c); else if(p.c)_c.copy(p.c); else _c.setRGB(1,1,1);
      cl[k*3]=_c.r;cl[k*3+1]=_c.g;cl[k*3+2]=_c.b;
      if(uv&&o.uv==='keep'&&UV){uv[k*2]=UV.getX(i);uv[k*2+1]=UV.getY(i);}
    }
  }
  if(uv&&o.uv==='box'){const sc=o.scale||.4;
    for(let t=0;t<n;t+=3){let ax=0,ay=0,az=0;for(let q=0;q<3;q++){ax+=nor[(t+q)*3];ay+=nor[(t+q)*3+1];az+=nor[(t+q)*3+2];}
      ax=Math.abs(ax);ay=Math.abs(ay);az=Math.abs(az);
      for(let q=0;q<3;q++){const i=t+q,x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];
        if(ay>=ax&&ay>=az){uv[i*2]=x*sc;uv[i*2+1]=z*sc;} else if(ax>=az){uv[i*2]=z*sc;uv[i*2+1]=y*sc;} else {uv[i*2]=x*sc;uv[i*2+1]=y*sc;}}}}
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.BufferAttribute(pos,3));
  out.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  out.setAttribute('color',new THREE.BufferAttribute(cl,3));
  if(uv)out.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  out.computeBoundingSphere();
  return out;
}
/** lumpy blob with radial (smooth) normals */
function blob(r,detail,seed,lump=.22){
  const g=new THREE.IcosahedronGeometry(r,detail), P=g.attributes.position, N=g.attributes.normal;
  for(let i=0;i<P.count;i++){_v.fromBufferAttribute(P,i); const d=_v.clone().normalize();
    const k=1+(vnoise(_v.x*1.7/r+seed,_v.y*1.7/r+_v.z*1.3/r+seed*.7)-.5)*2*lump;
    _v.multiplyScalar(k); P.setXYZ(i,_v.x,_v.y,_v.z); N.setXYZ(i,d.x,d.y,d.z);}
  return g;
}
/** instances bucketed into spatial tiles so frustum culling works (r128 does not cull per instance) */
class Tiled{
  constructor(geo,mat,o={}){this.geo=geo;this.mat=mat;this.o=o;this.t=new Map();
    if(!geo.boundingSphere)geo.computeBoundingSphere();}
  add(m,c){const x=m.elements[12],z=m.elements[14],key=Math.floor((x+250)/80)+','+Math.floor((z+130)/80);
    if(!this.t.has(key))this.t.set(key,[]); this.t.get(key).push([m.clone(),c?c.clone():null]);}
  build(parent){
    const out=[]; const bs=this.geo.boundingSphere;
    for(const [,items] of this.t){
      const g=new THREE.BufferGeometry();
      for(const k in this.geo.attributes)g.setAttribute(k,this.geo.attributes[k]);
      if(this.geo.index)g.setIndex(this.geo.index);
      const im=new THREE.InstancedMesh(g,this.mat,items.length);
      const box=new THREE.Box3(); let maxS=1;
      items.forEach(([m,c],i)=>{im.setMatrixAt(i,m); if(c)im.setColorAt(i,c);
        _v.copy(bs.center).applyMatrix4(m); box.expandByPoint(_v); maxS=Math.max(maxS,m.getMaxScaleOnAxis());});
      const sph=new THREE.Sphere(); box.getBoundingSphere(sph); sph.radius+=bs.radius*maxS; g.boundingSphere=sph;
      im.castShadow=!!this.o.cast; im.receiveShadow=this.o.receive!==false; im.frustumCulled=true;
      im.instanceMatrix.needsUpdate=true; if(im.instanceColor)im.instanceColor.needsUpdate=true;
      parent.add(im); out.push(im);
    }
    return out;
  }
  get count(){let n=0;for(const [,v] of this.t)n+=v.length;return n;}
}
/* VIGIL (2/2) — the hollow's furniture (temple.js, Place agent; TEMPLE.md): a ring of leaning standing stones on the rim, a
   stone stair down its east bank, the door in a carved portal against the west bank (temple.js grows the ink roots in the
   doorway and opens the way in), and the landmarks LM.vigilDoor {x,y,z,yaw: facing the door} and LM.vigilHollow {x,y,z,r}.
   Nothing grows inside the hollow: Tiled builds (trees, ferns, bushes, flowers, rocks) leave out the instances that stand in
   it, and the colliders of the trees and rocks there are dropped once the world is built. No random draws are added or
   skipped, so the rest of the island is laid out exactly as before. */
const VIGIL_SEC=(()=>{
  const VX=VIGIL.x, VZ=VIGIL.z, VR=VIGIL.r1+1.2, H0=VIGIL.h;
  const inHollow=(x,z)=>Math.hypot(x-VX,z-VZ)<VR;
  const tb=Tiled.prototype.build;
  Tiled.prototype.build=function(parent){
    for(const [k,items] of [...this.t]){ const keep=items.filter(([m])=>!inHollow(m.elements[12],m.elements[14])); if(keep.length===items.length)continue; if(keep.length)this.t.set(k,keep); else this.t.delete(k); }
    return tb.call(this,parent); };
  const face=VX-VIGIL.r0-.3;                                  // the portal's face, against the west bank
  const stand={x:face+1.9,z:VZ};
  LM.vigilHollow={x:VX,y:H0,z:VZ,r:VIGIL.r1};
  LM.vigilDoor={x:stand.x,y:height(stand.x,stand.z),z:stand.z,yaw:-PI/2};
  // the stair down the east bank: steps along -x from the rim to the floor, each at least the ground under it
  const ST={x0:VX+VIGIL.r1-1.2,x1:VX+VIGIL.r0-.4,hw:1.3,n:9}; ST.d=(ST.x0-ST.x1)/ST.n; ST.tops=[];
  for(let k=0;k<ST.n;k++){ const xa=ST.x0-k*ST.d, xb=xa-ST.d; let m=-1e9;
    for(let i=0;i<=4;i++)for(let j=-2;j<=2;j++)m=Math.max(m,height(lerp(xa,xb,i/4),VZ+j*ST.hw/2));
    const prev=k?ST.tops[k-1]:1e9; ST.tops.push(Math.min(prev-.12,m+.1)); }
  G.floorProviders.push((x,z,y)=>{ if(Math.abs(z-VZ)>ST.hw||x>ST.x0||x<ST.x1)return null;
    const k=Math.min(ST.n-1,Math.floor((ST.x0-x)/ST.d)), h=ST.tops[k]; return h<=y+.9?h:null; });
  const STONES=[]; { const r=rnd(7171);
    for(let k=0;k<9;k++){ const a=(28+k*38+(r()-.5)*8)*PI/180, rr=VIGIL.r1+.3+r()*.8, x=VX+Math.cos(a)*rr, z=VZ+Math.sin(a)*rr;
      STONES.push({x,z,y:height(x,z),h:2.5+r()*1.3,w:.9+r()*.5,d:.55+r()*.25,yaw:-a+(r()-.5)*.4,lean:(.12+r()*.16)*(r()<.7?-1:1),seed:k}); } }
  function build(){
    // the trees and rocks in the hollow are gone: so are their colliders
    const seen=new Set();
    for(let x=VX-VR-2;x<=VX+VR+2;x+=2)for(let z=VZ-VR-2;z<=VZ+VR+2;z+=2)for(const c of G.collidersNear(x,z).slice()){
      if(seen.has(c))continue; seen.add(c); if(c.r!=null&&c.r<3&&inHollow(c.x,c.z))G.removeCollider(c); }
    const parts=[]; const r=rnd(7272); const tc=new THREE.Color();
    const put=(g,cHex,x,y,z,ry,rx,rz,sx,sy,sz,jit)=>{ g=g.index?g.toNonIndexed():g; g.applyMatrix4(mat4(x,y,z,rx||0,ry||0,rz||0,sx==null?1:sx,sy==null?(sx==null?1:sx):sy,sz==null?(sx==null?1:sx):sz));
      const P=g.attributes.position, cols=new Float32Array(P.count*3);
      for(let i=0;i<P.count;i++){ tc.set(cHex).convertSRGBToLinear().multiplyScalar((1+(jit||.16)*(vnoise(P.getX(i)*1.3,P.getY(i)*1.3+P.getZ(i))-.5))*(.85+.15*clamp((P.getY(i)-H0)/3,0,1)));
        if(P.getY(i)<height(P.getX(i),P.getZ(i))+.5)tc.lerp(col('#45583a'),.35); cols[i*3]=tc.r;cols[i*3+1]=tc.g;cols[i*3+2]=tc.b; }
      g.setAttribute('color',new THREE.BufferAttribute(cols,3)); g.computeVertexNormals(); parts.push(g); };
    // standing stones: rough slabs leaning off true
    for(const s of STONES){ const g=new THREE.BoxGeometry(s.w,s.h,s.d,2,4,1); const P=g.attributes.position;
      for(let i=0;i<P.count;i++){ const y=P.getY(i)/s.h+.5; P.setX(i,P.getX(i)*(1-.32*y)+(vnoise(i*.7+s.seed,y*3)-.5)*.14); P.setZ(i,P.getZ(i)*(1-.2*y)); }
      g.translate(0,s.h/2-.35,0); put(g,'#6c675f',s.x,s.y,s.z,s.yaw,0,s.lean,1,1,1,.3);
      G.addCollider({x:s.x,z:s.z,r:Math.max(s.w,s.d)*.5+.05,y1:s.y+s.h*.9}); }
    // the stair: worn steps, a low kerb either side
    for(let k=0;k<ST.n;k++){ const xa=ST.x0-k*ST.d, top=ST.tops[k], lo=Math.min(height(xa,VZ),height(xa-ST.d,VZ))-.6;
      put(new THREE.BoxGeometry(ST.d+.05,top-lo,ST.hw*2),k%2?'#858078':'#7c776f',xa-ST.d/2,(top+lo)/2,VZ,0,0,0,1,1,1,.12);
      for(const sd of [-1,1])put(new THREE.BoxGeometry(ST.d+.05,top-lo+.35,.32),'#6f6a64',xa-ST.d/2,(top+lo+.35)/2,VZ+sd*(ST.hw+.14)); }
    // the portal: a great block of cut stone set into the west bank, jambs, a lintel carved with a moth, two small watchers
    const fx=face, y0=H0;
    put(new THREE.BoxGeometry(3.2,6.4,7.2),'#77727a',fx-1.6,y0+2.2,VZ,0,0,0,1,1,1,.1);
    for(const sd of [-1,1]){ put(new THREE.BoxGeometry(.7,3.8,.7),'#8d8892',fx+.3,y0+1.9,VZ+sd*1.55); put(new THREE.BoxGeometry(.9,.3,.9),'#6e6a74',fx+.3,y0+.15,VZ+sd*1.55); }
    put(new THREE.BoxGeometry(.8,.7,4.0),'#8d8892',fx+.35,y0+4.05,VZ); put(new THREE.BoxGeometry(1.0,.25,4.4),'#6e6a74',fx+.4,y0+4.5,VZ);
    for(const sd of [-1,1]){ const g=new THREE.CylinderGeometry(.02,.5,.9,3); g.rotateZ(sd*PI/2); g.rotateY(PI/2); put(g,'#a39cb0',fx+.76,y0+4.05,VZ+sd*.42,0,0,sd*.35); }
    put(new THREE.SphereGeometry(.13,6,5),'#a39cb0',fx+.78,y0+4.05,VZ,0,0,0,1,2.4,1);
    for(const sd of [-1,1]){ const wx=fx+.6, wz=VZ+sd*2.75;
      put(new THREE.CylinderGeometry(.22,.36,1.7,8),'#8a8590',wx,y0+.85,wz); put(new THREE.SphereGeometry(.24,8,6),'#8f8a96',wx+.03,y0+1.85,wz,0,0,0,1,1.2,1);
      for(const e of [-1,1])put(new THREE.SphereGeometry(.05,5,4),'#0b0910',wx+.24,y0+1.9,wz+e*.075);
      G.addCollider({x:wx,z:wz,r:.45,y1:y0+2.1}); }
    // the old offering stones on the floor of the hollow, cups worn into them
    for(let k=0;k<5;k++){ const a=(150+k*15)*PI/180, x=VX+Math.cos(a)*3.1, z=VZ+Math.sin(a)*3.4; put(new THREE.CylinderGeometry(.32,.4,.32,7),'#7d7870',x,height(x,z)+.1,z,r()*3); }
    G.addBoxCollider({x:fx-1.6,z:VZ,hw:1.6,hd:3.6,yaw:0,y0:y0-2,y1:y0+8});
    for(const sd of [-1,1])G.addCollider({x:fx+.3,z:VZ+sd*1.55,r:.42,y1:y0+3.8});
    let n=0; for(const g of parts)n+=g.attributes.position.count;
    const pos=new Float32Array(n*3), nor=new Float32Array(n*3), cl=new Float32Array(n*3); let o=0;
    for(const g of parts){ pos.set(g.attributes.position.array,o*3); nor.set(g.attributes.normal.array,o*3); cl.set(g.attributes.color.array,o*3); o+=g.attributes.position.count; }
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('normal',new THREE.BufferAttribute(nor,3)); geo.setAttribute('color',new THREE.BufferAttribute(cl,3)); geo.computeBoundingSphere();
    const m=new THREE.Mesh(geo,G.toon('#ffffff',{vertexColors:true})); m.name='vigilHollow'; m.castShadow=m.receiveShadow=true; root.add(m);
    if(G.outline)G.outline(m,{thickness:.025});
  }
  G.system('vigilHollow',{order:1,modes:'always',init(){ try{ build(); }catch(e){ console.error('vigil hollow',e); } }});
  return {stairs:ST,stones:STONES,face};
})();
W.vigil=VIGIL_SEC;
/* merge-by-material kit for buildings (box-mapped world UVs) */
class Kit{
  constructor(){this.p={};this.frame=new THREE.Matrix4();}
  add(key,g,m,c,nf){const mm=this.frame.clone(); if(m)mm.multiply(m); (this.p[key]=this.p[key]||[]).push({g,m:mm,c:c||null,nf});}
  box(key,w,h,d,x,y,z,ry,rx,rz,c){this.add(key,UNITBOX,mat4(x,y,z,rx,ry,rz,w,h,d),c);}
  build(mats,parent,scales={}){const out={};
    for(const key in this.p){const geo=mergeParts(this.p[key],{uv:'box',scale:scales[key]||.4});
      const mesh=new THREE.Mesh(geo,mats[key]); mesh.castShadow=key!=='glow'&&key!=='flame'; mesh.receiveShadow=true;
      parent.add(mesh); out[key]=mesh;}
    return out;}
}
function rnd(seed){return U.rng(seed);}
/* shared with northisle.js: the same merge / matrix / rock-blob helpers and the stone, slate and wood textures (built at init) */
W.geo={mergeParts:(p,o)=>mergeParts(p,o),mat4:(...a)=>mat4(...a),blob:(...a)=>blob(...a),tex:()=>TEX};

/* ---------- procedural textures ---------- */
function stoneCanvas(g,s,base,vr,rows,mossy){
  const r=Math.random;
  g.fillStyle='#4a4640';g.fillRect(0,0,s,s);
  const rowH=s/rows;
  for(let row=0;row<rows;row++){let x=-r()*60;
    while(x<s){const w=rowH*(1.2+r()*1.4),l=base+(r()-.5)*vr;
      g.fillStyle=`hsl(${28+r()*14},${7+r()*8}%,${l}%)`;
      const rr=Math.min(8,rowH*.25); g.beginPath();
      if(g.roundRect)g.roundRect(x+2,row*rowH+2,w-4,rowH-4,rr); else g.rect(x+2,row*rowH+2,w-4,rowH-4); g.fill();
      g.fillStyle='rgba(0,0,0,.16)';g.fillRect(x+3,row*rowH+rowH-7,w-6,4);
      g.fillStyle='rgba(255,255,255,.08)';g.fillRect(x+4,row*rowH+3,w-8,3);
      x+=w;}}
  if(mossy)for(let i=0;i<60;i++){g.fillStyle='rgba(60,80,40,'+(r()*.3)+')';g.beginPath();g.arc(r()*s,r()*s,3+r()*14,0,TAU);g.fill();}
}
let TEX=null;
function makeTextures(){
  const wrap=t=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;};
  TEX={
    stone:wrap(G.canvasTex(512,(g,s)=>stoneCanvas(g,s,64,16,10,true))),
    cobble:wrap(G.canvasTex(256,(g,s)=>{const r=Math.random;g.fillStyle='#5a554e';g.fillRect(0,0,s,s);
      for(let i=0;i<120;i++){const x=r()*s,y=r()*s,rad=9+r()*10,l=50+r()*20;g.fillStyle=`hsl(${30+r()*20},8%,${l}%)`;
        for(const ox of [-s,0,s])for(const oy of [-s,0,s]){g.beginPath();g.ellipse(x+ox,y+oy,rad,rad*.8,r()*3,0,TAU);g.fill();}}})),
    slate:wrap(G.canvasTex(256,(g,s)=>{const r=Math.random;g.fillStyle='#262a33';g.fillRect(0,0,s,s);const rows=8,rh=s/rows;
      for(let row=0;row<rows;row++){let x=(row%2)*-18-r()*8;while(x<s){const w=26+r()*16,l=26+r()*14;
        g.fillStyle=`hsl(${220+r()*20},${10+r()*10}%,${l}%)`;g.beginPath();
        if(g.roundRect)g.roundRect(x+1.5,row*rh+1,w-3,rh+4,[0,0,6,6]); else g.rect(x+1.5,row*rh+1,w-3,rh+4); g.fill();
        g.fillStyle='rgba(0,0,0,.35)';g.fillRect(x+1.5,row*rh+rh-3,w-3,3);x+=w;}}})),
    wood:wrap(G.canvasTex(256,(g,s)=>{const r=Math.random;g.fillStyle='#4a3626';g.fillRect(0,0,s,s);
      for(let x=0;x<s;x+=32){const l=34+r()*12;g.fillStyle=`hsl(${24+r()*8},${30+r()*10}%,${l}%)`;g.fillRect(x+1,0,30,s);
        for(let k=0;k<14;k++){g.strokeStyle='rgba(20,10,5,.25)';g.beginPath();const xx=x+3+r()*26;g.moveTo(xx,0);g.bezierCurveTo(xx+r()*6-3,s*.3,xx+r()*6-3,s*.6,xx,s);g.stroke();}}})),
  };
}

/* ---------- palette (linear) ---------- */
const C={
  grass:col('#506b3d'), dryGrass:col('#6f7046'), heather:col('#5e4862'), ochre:col('#9b7a3c'), headGrass:col('#5c7550'),
  moss:col('#34472b'), mossDark:col('#22301f'), litter:col('#5b4430'), clearing:col('#4a5232'),
  sand:col('#c2ad88'), wetSand:col('#7c705e'), seabed:col('#3b4646'),
  rock:col('#5d6372'), rock2:col('#434957'), rockWarm:col('#6c665f'),
  dirt:col('#7a6450'), dirt2:col('#665343'), cobble:col('#8f897f'),
};
const _t1=new THREE.Color(), _t2=new THREE.Color();
function groundColor(x,z,h,slope,pd,out){
  const n1=fbm(x*.045+2,z*.045+8,3), n2=vnoise(x*.11+4,z*.11+1), n3=vnoise(x*.7,z*.7);
  out.copy(C.grass).lerp(C.dryGrass,smooth(.4,.8,n2)*.7);
  out.lerp(C.heather,smooth(.52,.66,n1)*.7);
  out.lerp(C.ochre,smooth(.62,.76,vnoise(x*.07+20,z*.07-3))*.4);
  if(x>110&&h>30)out.lerp(C.headGrass,smooth(30,41.5,h)*.75);
  const ff=smooth(-58,-82,x);
  if(ff>0){_t1.copy(C.moss).lerp(C.litter,smooth(.38,.72,n2)).lerp(C.mossDark,smooth(.48,.78,n1)*.7);
    const dc=Math.hypot(x+165,z-5); if(dc<20)_t1.lerp(C.clearing,(1-smooth(8,20,dc))*.7);
    out.lerp(_t1,ff);}
  // shore
  if(h<2.6){const sandy=1-smooth(.8,1.6,slope);
    out.lerp(C.sand,(1-smooth(1.2,2.6,h))*sandy);
    if(h<.55)out.lerp(C.wetSand,smooth(.55,-.1,h));
    if(h<-.4)out.lerp(C.seabed,smooth(-.4,-2,h));}
  // rock faces with strata
  const rk=smooth(.8,1.45,slope);
  if(rk>0){const st=Math.sin(h*1.15+n1*5)*.5+.5;
    _t2.copy(C.rock).lerp(C.rock2,st*.8).lerp(C.rockWarm,smooth(.55,.8,n2)*.4);
    out.lerp(_t2,rk);}
  // trail
  const p=1-smooth(1.1,2.4,pd);
  if(p>0){_t1.copy(h>41.5&&x>120?C.cobble:C.dirt).lerp(C.dirt2,smooth(.3,.7,n2)*.5); out.lerp(_t1,p*.9*(1-rk*.6));}
  out.multiplyScalar(.9+.2*n3);
  return out;
}

/* =====================================================================
   3. INIT: build everything
   ===================================================================== */
let HG=null, HC=null; const GX0=-244,GZ0=-120,GNX=489,GNZ=241;
function gh(x,z){
  const fx=x-GX0,fz=z-GZ0; if(!HG||fx<0||fz<0||fx>=GNX-1||fz>=GNZ-1)return height(x,z);
  const i=fx|0,j=fz|0,u=fx-i,v=fz-j,a=j*GNX+i;
  return (HG[a]*(1-u)+HG[a+1]*u)*(1-v)+(HG[a+GNX]*(1-u)+HG[a+GNX+1]*u)*v;
}
function gslope(x,z){return Math.hypot(gh(x+1,z)-gh(x-1,z),gh(x,z+1)-gh(x,z-1))*.5;}
W.groundY=gh;

const root=new THREE.Group(); root.name='world';
const SH={time:{value:0},focus:{value:new THREE.Vector3()}};
let sky=null, skyU=null, stars=null, sea=null, seaU=null, grass=null, motes=null, capMat=null, treeLight=null;
const mists=[], smokes=[];
const tmpCol=new THREE.Color();

function buildGrids(){
  HG=new Float32Array(GNX*GNZ);
  for(let j=0;j<GNZ;j++)for(let i=0;i<GNX;i++)HG[j*GNX+i]=height(GX0+i,GZ0+j);
  PD=new Float32Array(PDNX*PDNZ);
  for(let j=0;j<PDNZ;j++)for(let i=0;i<PDNX;i++){const x=PDX0+i*PDS,z=PDZ0+j*PDS;
    PD[j*PDNX+i]=(Math.abs(x)>236||Math.abs(z)>112)?99:Math.min(30,pathDistExact(x,z));}
  HC=new Float32Array(GNX*GNZ*3);
}

/* ---------- terrain ---------- */
const TCH=[]; // terrain chunks (for re-colouring after contact shading)
/* contact shading: soft dark pools under every tree baked into the terrain vertex colours (and so the grass tint) — no draw calls */
function bakeTreeAO(){
  const T=FOL.trees, L=LM.resistingTree; if(L)T.push(L.x,L.z,8);
  const AO=new Map(); // cell -> darkest factor (overlaps take the min, so dense woods don't go black)
  for(let t=0;t<T.length;t+=3){const x=T[t],z=T[t+1],R=T[t+2];
    for(let j=Math.floor(z-R-GZ0);j<=Math.ceil(z+R-GZ0);j++)for(let i=Math.floor(x-R-GX0);i<=Math.ceil(x+R-GX0);i++){
      if(i<0||j<0||i>=GNX||j>=GNZ)continue; const d=Math.hypot(GX0+i-x,GZ0+j-z)/R; if(d>=1)continue;
      const f=1-.45*Math.pow(1-d,1.6), c=j*GNX+i, o=AO.get(c); AO.set(c,o===undefined?f:Math.min(o,f)*(.5+.5*Math.max(o,f)/1));}}
  const touched=AO;
  for(const [c,f] of AO){const a=c*3; HC[a]*=f;HC[a+1]*=f;HC[a+2]*=f;}
  for(const ch of TCH){const cl=ch.g.attributes.color.array; let any=false;
    for(let j=0;j<ch.nz;j++)for(let i=0;i<ch.nx;i++){const a=(ch.j0+j)*GNX+ch.i0+i; if(!touched.has(a))continue; any=true;
      const k=(j*ch.nx+i)*3; cl[k]=HC[a*3];cl[k+1]=HC[a*3+1];cl[k+2]=HC[a*3+2];}
    if(any)ch.g.attributes.color.needsUpdate=true;}
}
function buildTerrain(){
  const mat=G.toon('#ffffff',{vertexColors:true});
  const CW=61,CD=60;
  // colours on the full grid (also used to tint grass)
  for(let j=0;j<GNZ;j++)for(let i=0;i<GNX;i++){
    const a=j*GNX+i,x=GX0+i,z=GZ0+j,h=HG[a];
    const hl=HG[a-(i>0?1:0)],hr=HG[a+(i<GNX-1?1:0)],hu=HG[a-(j>0?GNX:0)],hd=HG[a+(j<GNZ-1?GNX:0)];
    const sl=Math.hypot(hr-hl,hd-hu)*.5;
    groundColor(x,z,h,sl,pathDist(x,z),_c);
    HC[a*3]=_c.r;HC[a*3+1]=_c.g;HC[a*3+2]=_c.b;
  }
  let tris=0;
  for(let cj=0;cj<(GNZ-1)/CD;cj++)for(let ci=0;ci<(GNX-1)/CW;ci++){
    const i0=ci*CW,j0=cj*CD,nx=CW+1,nz=CD+1;
    let maxH=-99; for(let j=j0;j<j0+nz;j++)for(let i=i0;i<i0+nx;i++)maxH=Math.max(maxH,HG[j*GNX+i]);
    if(maxH<-2.2)continue;
    const pos=new Float32Array(nx*nz*3),nor=new Float32Array(nx*nz*3),cl=new Float32Array(nx*nz*3);
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
      const gi=i0+i,gj=j0+j,a=gj*GNX+gi,k=j*nx+i,x=GX0+gi,z=GZ0+gj,h=HG[a];
      const hl=HG[a-(gi>0?1:0)],hr=HG[a+(gi<GNX-1?1:0)],hu=HG[a-(gj>0?GNX:0)],hd=HG[a+(gj<GNZ-1?GNX:0)];
      const gx=(hr-hl)*.5,gz=(hd-hu)*.5,sl=Math.hypot(gx,gz);
      let px=x,pz=z;
      if(sl>1.6){ // crag the steep faces sideways a little (visual only)
        const c=(vnoise(x*.4+h*.3,z*.4-h*.2)-.5)*1.6*smooth(1.6,3,sl); px-=gx/sl*c; pz-=gz/sl*c;}
      pos[k*3]=px;pos[k*3+1]=h;pos[k*3+2]=pz;
      _n.set(-gx,1,-gz).normalize(); nor[k*3]=_n.x;nor[k*3+1]=_n.y;nor[k*3+2]=_n.z;
      cl[k*3]=HC[a*3];cl[k*3+1]=HC[a*3+1];cl[k*3+2]=HC[a*3+2];
    }
    const idx=[];
    for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){const a=j*nx+i,b=a+1,c=a+nx,d=c+1;
      if((i+j)&1){idx.push(a,c,b,b,c,d);}else{idx.push(a,c,d,a,d,b);}}
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    g.setAttribute('normal',new THREE.BufferAttribute(nor,3));
    g.setAttribute('color',new THREE.BufferAttribute(cl,3));
    g.setIndex(idx); g.computeBoundingSphere();
    const m=new THREE.Mesh(g,mat); m.receiveShadow=true; m.name='terrain'; root.add(m); tris+=idx.length/3;
    TCH.push({g,i0,j0,nx,nz});
  }
  W.stats.terrainTris=tris;
}

/* ---------- sea ---------- */
function buildSea(stacks){
  const data=new Uint8Array(GNX*GNZ);
  for(let a=0;a<GNX*GNZ;a++)data[a]=Math.round(clamp((HG[a]+10)/20,0,1)*255);
  for(const s of stacks){ // stamp sea stacks into the depth map so they get foam
    for(let j=Math.floor(s.z-s.r-3);j<=s.z+s.r+3;j++)for(let i=Math.floor(s.x-s.r-3);i<=s.x+s.r+3;i++){
      const gi=i-GX0,gj=j-GZ0; if(gi<0||gj<0||gi>=GNX||gj>=GNZ)continue;
      const d=Math.hypot(i-s.x,j-s.z)-s.r; if(d>3)continue; const hh=lerp(1,-1.6,clamp(d/3,0,1));
      const a=gj*GNX+gi; data[a]=Math.max(data[a],Math.round(clamp((hh+10)/20,0,1)*255));}
  }
  const tex=new THREE.DataTexture(data,GNX,GNZ,THREE.LuminanceFormat,THREE.UnsignedByteType);
  tex.unpackAlignment=1; tex.magFilter=tex.minFilter=THREE.LinearFilter; tex.generateMipmaps=false; tex.needsUpdate=true;
  seaU=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
    uDepth:{value:null},uRect:{value:new THREE.Vector4(GX0,GZ0,1/(GNX-1),1/(GNZ-1))},
    uDeep:{value:col('#1b2338')},uShallow:{value:col('#3d5a66')},uFoam:{value:col('#e3dcd0')},
    uSky:{value:col('#8a6f98')},uGlint:{value:col('#ffd9c8')},uSunDir:{value:new THREE.Vector3()},uLight:{value:1}}]);
  seaU.uDepth.value=tex; seaU.uTime=SH.time;
  const m=new THREE.ShaderMaterial({uniforms:seaU,fog:true,extensions:{derivatives:true},
    vertexShader:`uniform float uTime;varying vec3 vW;
#include <fog_pars_vertex>
void main(){vec4 wp=modelMatrix*vec4(position,1.);
  wp.y+=sin(wp.x*.075+uTime*.7)*.32+sin(wp.z*.11+uTime*.55)*.24+sin((wp.x-wp.z)*.19+uTime*1.25)*.09;
  vW=wp.xyz; vec4 mvPosition=viewMatrix*wp; gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader:`uniform sampler2D uDepth;uniform vec4 uRect;uniform vec3 uDeep,uShallow,uFoam,uSky,uGlint,uSunDir;uniform float uLight,uTime;varying vec3 vW;
#include <fog_pars_fragment>
void main(){
  vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.)n=-n;
  vec2 uv=(vW.xz-uRect.xy)*uRect.zw; float th=-10.;
  if(uv.x>0.&&uv.y>0.&&uv.x<1.&&uv.y<1.)th=texture2D(uDepth,uv).r*20.-10.;
  float depth=max(vW.y-th,0.);
  vec3 V=normalize(cameraPosition-vW);
  vec3 c=mix(uShallow,uDeep,smoothstep(.3,7.,depth));
  float dif=dot(n,uSunDir); c*=.62+.38*smoothstep(.15,.35,dif);
  float fr=pow(1.-max(dot(n,V),0.),4.); c=mix(c,uSky,clamp(fr*.75,0.,.75));
  // the low sun on the water: a glitter path (sparkling cells) over a soft sheen. (A solid smoothstep(.93,.96) spot here
  // was ~20 degrees across: on the big flat facets it showed as a hard-edged beige disc on the sea, e.g. off the north
  // island's western stacks when looking toward the sun.)
  vec3 R=reflect(-V,n); float g=max(dot(R,uSunDir),0.);
  vec2 gq=vW.xz*2.2; float gh=fract(sin(dot(floor(gq),vec2(127.1,311.7)))*43758.5453), sp=step(.72,gh)*pow(max(0.,sin(uTime*(1.4+gh*2.2)+gh*60.)),6.)*smoothstep(.42,.12,length(fract(gq)-.5));
  c+=uGlint*(smoothstep(.9,.99,g)*sp*.6+smoothstep(.8,1.,g)*.06+pow(g,24.)*.12);
  float wob=sin(uTime*1.3+vW.x*.21+vW.z*.17)*.18;
  float foam=1.-smoothstep(.05,.55,depth+wob*.5);
  float rings=step(.78,fract(depth*1.4-uTime*.22))*smoothstep(.4,.8,depth)*(1.-smoothstep(.9,2.2,depth));
  c=mix(c,uFoam,clamp(foam*.7+rings*.25,0.,1.));
  c*=uLight;
  gl_FragColor=vec4(c,1.);
  #include <fog_fragment>
}`});
  sea=new THREE.Mesh(new THREE.PlaneGeometry(2210,2210,170,170).rotateX(-PI/2),m);
  sea.frustumCulled=false; sea.name='sea'; root.add(sea);
}

/* ---------- sky ---------- */
function buildSky(){
  skyU={uZen:{value:col('#1d1636')},uMid:{value:col('#4b2c5d')},uHor:{value:new THREE.Color()},
    uGlowP:{value:col('#d77b97')},uGlowA:{value:col('#f2a35c')},uCloud:{value:col('#3a2546')},
    uSunDir:{value:new THREE.Vector3()},uMoonDir:{value:new THREE.Vector3(.35,.55,-.76).normalize()},
    uDark:{value:0},uCured:{value:0},uTime:SH.time};
  sky=new THREE.Mesh(new THREE.SphereGeometry(900,40,20),new THREE.ShaderMaterial({uniforms:skyU,side:THREE.BackSide,depthWrite:false,fog:false,
    vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 uZen,uMid,uHor,uGlowP,uGlowA,uCloud,uSunDir,uMoonDir;uniform float uDark,uCured,uTime;varying vec3 vDir;
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y);}
float fb(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p*=2.03;a*=.5;}return s;}
void main(){vec3 d=normalize(vDir);float y=d.y,h=max(y,0.);
  vec3 c=mix(uHor,uMid,smoothstep(.0,.28,h)); c=mix(c,uZen,smoothstep(.22,.9,h));
  vec3 sd=normalize(vec3(uSunDir.x,0.,uSunDir.z)); vec3 hd=normalize(vec3(d.x,0.,d.z)+vec3(1e-4));
  float az=max(dot(hd,sd),0.);
  float glow=pow(az,2.5)*exp(-h*6.5), core=pow(az,14.)*exp(-h*18.);
  c+=uGlowP*glow*.75+uGlowA*core*.95;
  c+=uGlowP*.08*exp(-h*4.);
  if(y>0.){vec2 cp=d.xz/(y+.1)*.9+vec2(uTime*.003,0.);
    float cl=smoothstep(.48,.78,fb(cp*vec2(.5,1.7)))*smoothstep(.0,.06,y)*(1.-smoothstep(.3,.65,y));
    vec3 cc=mix(uCloud,uGlowP*1.05,clamp(glow*1.2+core,0.,1.)); c=mix(c,cc,cl*.75);}
  // the Milky Way: a soft tilted band of light with dark dust lanes, strongest high up and away from the dusk glow
  { vec3 A=normalize(vec3(.42,.38,.82)); float bd=dot(d,A), band=exp(-bd*bd/.016);
    vec3 bx=normalize(cross(A,vec3(0.,1.,0.))), by=cross(A,bx); vec2 bp=vec2(atan(dot(d,by),dot(d,bx))*3.,bd*16.);
    float neb=fb(bp*1.7+3.1), dust=smoothstep(.45,.7,fb(bp*vec2(2.6,1.3)+7.3))*exp(-bd*bd/.004);
    float mw=band*(.55+.75*neb)*(1.-.75*dust)*smoothstep(.04,.42,h)*(1.-clamp(glow*2.2+core,0.,1.));
    c+=mix(vec3(.30,.26,.44),vec3(.58,.52,.66),neb)*mw*.42; }
  float m=max(dot(d,uMoonDir),0.);
  c+=vec3(.95,.9,1.)*(smoothstep(.99935,.9996,m)*2.2+pow(m,120.)*.25+pow(m,14.)*.05);
  c=mix(c,uHor,smoothstep(0.,-.08,y));
  c=mix(c,c*1.18+vec3(.03,.03,.05),uCured*.6);
  c*=1.-uDark*.96;
  gl_FragColor=vec4(c,1.);}`}));
  sky.frustumCulled=false; sky.renderOrder=-10; sky.name='sky'; root.add(sky);
  // stars
  const N=700,p=new Float32Array(N*3),r=rnd(77);
  for(let i=0;i<N;i++){const a=r()*TAU,y=.12+r()*.88,rr=Math.sqrt(1-y*y);p[i*3]=Math.cos(a)*rr*860;p[i*3+1]=y*860;p[i*3+2]=Math.sin(a)*rr*860;}
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(p,3));
  stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xd9d2ff,size:1.6,sizeAttenuation:false,transparent:true,opacity:.55,fog:false,depthWrite:false}));
  stars.frustumCulled=false; stars.renderOrder=-9; root.add(stars);
  // fine star dust along the Milky Way (same axis as the shader's band)
  { const M=650, q=new Float32Array(M*3), A=new THREE.Vector3(.42,.38,.82).normalize(), bx=new THREE.Vector3().crossVectors(A,new THREE.Vector3(0,1,0)).normalize(), by=new THREE.Vector3().crossVectors(A,bx), v=new THREE.Vector3();
    let n=0; for(let i=0;i<M*3&&n<M;i++){ const a=r()*TAU, off=(r()+r()+r()-1.5)*.13; v.copy(bx).multiplyScalar(Math.cos(a)).addScaledVector(by,Math.sin(a)).addScaledVector(A,off).normalize();
      if(v.y<.22)continue; q[n*3]=v.x*855; q[n*3+1]=v.y*855; q[n*3+2]=v.z*855; n++; }
    const g2=new THREE.BufferGeometry(); g2.setAttribute('position',new THREE.BufferAttribute(q.subarray(0,n*3),3));
    const dustStars=new THREE.Points(g2,new THREE.PointsMaterial({color:0xe6defa,size:1.1,sizeAttenuation:false,transparent:true,opacity:.32,fog:false,depthWrite:false}));
    dustStars.frustumCulled=false; dustStars.renderOrder=-9; stars.add(dustStars); stars.userData.dust=dustStars; }
}

/* ---------- lights & fog ---------- */
const FOG={base:col('#5b5374'),forest:col('#433f58'),cured:col('#8b88a8'),dark:col('#030205')};
function setupLights(){
  G.lights.sunDir.set(-.66,.46,.5).normalize();
  G.lights.sun.color.copy(col('#f3c7cf'));
  G.lights.hemi.color.copy(col('#a596d6'));
  G.lights.hemi.groundColor.copy(col('#3a2c3c'));
  if(!(G.scene.fog instanceof THREE.FogExp2))G.scene.fog=new THREE.FogExp2(0,.012);
  G.scene.fog.color.copy(FOG.base); G.scene.fog.density=.0115;
  G.scene.background=FOG.base.clone();
  skyU.uSunDir.value.copy(G.lights.sunDir); seaU.uSunDir.value.copy(G.lights.sunDir);
}

/* ---------- landscape shading (tier 1): wind, rim light, grass parting — all in the vertex/fragment shaders ----------
   SH.wind  xy = wind direction (xz), z = strength. Trees, bushes and grass share one gust field so they move together.
   SH.sunV  view-space direction to the sun (rim / back-light on canopies); SH.sunW world-space; SH.rim/sunCol warm tints
   scaled by the sun's intensity every frame (so they vanish in the dark tower and indoors).
   SH.push  up to 8 xz pushers (x, z, radius, strength): grass bends away from the Traveler and nearby monsters. */
const PUSHN=8;
const FOL={mats:[],trees:[]}; // foliage materials (quality defines) and tree feet [x,z,r,...] for contact shading
SH.wind={value:new THREE.Vector4(.87,.49,1,0)};
SH.sunV={value:new THREE.Vector3(0,1,0)}; SH.sunW={value:new THREE.Vector3(0,1,0)};
SH.rim={value:new THREE.Color()}; SH.sunCol={value:new THREE.Color()};
SH.push={value:Array.from({length:PUSHN},()=>new THREE.Vector4(0,0,1,0))};
const RIM0=col('#ffc290'), SUNC0=col('#e6dc96');
const WIND_GLSL=`uniform float uTime;uniform vec4 uWind;
float bqGust(vec2 p){ // travelling gust crests along the wind
  float a=dot(p,uWind.xy)*.085-uTime*1.35+sin(dot(p,vec2(-uWind.y,uWind.x))*.045+uTime*.21)*1.7;
  return smoothstep(.45,1.,sin(a)*.5+.5)*(.55+.45*sin(uTime*.23+p.x*.004));}
vec2 bqTreeWind(vec2 p){
  float ph=dot(p,vec2(.071,.053));
  #ifdef BQ_LQ
  return uWind.xy*(sin(uTime*1.05+ph*6.)*.5+.45)*uWind.z*.22;
  #else
  float s=sin(uTime*1.05+ph*6.)*.55+sin(uTime*1.9+ph*9.7)*.2;
  vec2 side=vec2(-uWind.y,uWind.x)*sin(uTime*1.3+ph*4.)*.16;
  return (uWind.xy*(s*.45+.25+bqGust(p)*.6)+side)*uWind.z*.24;
  #endif
}`;
/** sway instanced trees/bushes in the vertex shader: amount grows with local height (trunk flexes, canopy sways) */
function foliageShader(m,o){
  const leaf=!!o.leaf, rim=o.rim!==false&&leaf;
  m.onBeforeCompile=sh=>{
    sh.uniforms.uTime=SH.time; sh.uniforms.uWind=SH.wind; sh.uniforms.uSunV=SH.sunV; sh.uniforms.uRimCol=SH.rim;
    sh.vertexShader=WIND_GLSL+'\n'+sh.vertexShader.replace('#include <project_vertex>',`vec4 mvPosition=vec4(transformed,1.);
  #ifdef USE_INSTANCING
  mvPosition=instanceMatrix*mvPosition;
  { vec2 ip=instanceMatrix[3].xz; float k=clamp(transformed.y/9.,0.,1.35); k*=k;
    mvPosition.xz+=bqTreeWind(ip)*k;
    ${leaf?`#ifndef BQ_LQ
    float fl=sin(uTime*3.3+dot(transformed,vec3(2.1,1.7,2.9))+ip.x)*.045*k;
    mvPosition.xyz+=vec3(fl,fl*.6,-fl);
    #endif`:''}
  }
  #endif
  mvPosition=modelViewMatrix*mvPosition;
  gl_Position=projectionMatrix*mvPosition;`);
    if(rim)sh.fragmentShader='uniform vec3 uSunV;uniform vec3 uRimCol;\n'+sh.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
  { vec3 bqV=normalize(vViewPosition); float bqF=1.-max(dot(normal,bqV),0.);
    float bqSun=smoothstep(-.3,.9,dot(normal,uSunV)), bqBack=max(-dot(uSunV,bqV),0.);
    totalEmissiveRadiance+=uRimCol*diffuseColor.rgb*pow(bqF,2.)*(bqSun*.55+bqBack*bqBack*.9+.08); }`);
  };
  m.customProgramCacheKey=()=>'bqFol'+(leaf?'L':'T')+(rim?'R':'')+(m.defines&&m.defines.BQ_LQ?'q':'');
  return m;
}
/** rim/back-light only (non-instanced canopies, e.g. the Resisting Tree) */
function rimShader(m){
  m.onBeforeCompile=sh=>{ sh.uniforms.uSunV=SH.sunV; sh.uniforms.uRimCol=SH.rim;
    sh.fragmentShader='uniform vec3 uSunV;uniform vec3 uRimCol;\n'+sh.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
  { vec3 bqV=normalize(vViewPosition); float bqF=1.-max(dot(normal,bqV),0.);
    float bqSun=smoothstep(-.3,.9,dot(normal,uSunV)), bqBack=max(-dot(uSunV,bqV),0.);
    totalEmissiveRadiance+=uRimCol*diffuseColor.rgb*pow(bqF,2.)*(bqSun*.45+bqBack*bqBack*.7); }`); };
  m.customProgramCacheKey=()=>'bqRim'; return m;
}
/** "fluffy" canopy normals: blend each vertex normal toward the direction from the canopy centre */
function spherize(g,cx,cy,cz,amt,sy=1){
  const P=g.attributes.position,N=g.attributes.normal;
  for(let i=0;i<P.count;i++){ _v.set(P.getX(i)-cx,(P.getY(i)-cy)*sy,P.getZ(i)-cz).normalize(); _n.fromBufferAttribute(N,i);
    _n.lerp(_v,amt).normalize(); N.setXYZ(i,_n.x,_n.y,_n.z); }
  return g;
}

/* ---------- trees ---------- */
function oakGeos(seed){
  const r=rnd(seed),trunk=[],canopy=[];
  const H=4+r()*1.4,bx=(r()-.5)*1.4,bz=(r()-.5)*1.4;
  const axis=t=>[bx*Math.sin(t*PI*.75),t*H,bz*Math.sin(t*PI*.75)];
  const tg=new THREE.CylinderGeometry(.34,.55,H,8,7,true); tg.translate(0,H/2,0);
  const P=tg.attributes.position;
  for(let i=0;i<P.count;i++){let x=P.getX(i),y=P.getY(i),z=P.getZ(i);const t=y/H,fl=1+1.1*Math.pow(1-smooth(0,.28,t),2);
    const tw=t*1.3,cs=Math.cos(tw),sn=Math.sin(tw); let X=(x*cs-z*sn)*fl,Z=(x*sn+z*cs)*fl;
    X*=1+(vnoise(x*3+seed,y*2)-.5)*.35; const a=axis(t); P.setXYZ(i,X+a[0],y-.25,Z+a[2]);}
  tg.computeVertexNormals();
  const bark=col('#4a3b31'),bark2=col('#30261f');
  trunk.push({g:tg,c:(p,n,o)=>o.copy(bark2).lerp(bark,clamp(n.y*.5+.5+(vnoise(p.x*3,p.y*3)-.5)*.6,0,1))});
  const tops=[]; const nb=3+Math.floor(r()*2);
  for(let b=0;b<nb;b++){
    const a=b/nb*TAU+r()*.9,el=.55+r()*.5,L=2.1+r()*1.7,t0=.6+r()*.3,s=axis(t0);
    const d=new THREE.Vector3(Math.sin(el)*Math.cos(a),Math.cos(el),Math.sin(el)*Math.sin(a));
    const bg=new THREE.CylinderGeometry(.1,.22,L,6,1,true);
    _q.setFromUnitVectors(new THREE.Vector3(0,1,0),d);
    const m=new THREE.Matrix4().compose(new THREE.Vector3(s[0]+d.x*L/2,s[1]+d.y*L/2-.25,s[2]+d.z*L/2),_q.clone(),new THREE.Vector3(1,1,1));
    trunk.push({g:bg,m,c:bark2});
    tops.push(new THREE.Vector3(s[0]+d.x*L,s[1]+d.y*L,s[2]+d.z*L));
  }
  const tp=axis(1); tops.push(new THREE.Vector3(tp[0],H+.4,tp[2]));
  const dark=col('#1d2a20'),mid=col('#344a2d'),lite=col('#5a7343'),warm=col('#77744a');
  let yMin=1e9,yMax=-1e9; const bl=[];
  for(const t of tops){const n=1+(r()<.5?1:0);
    for(let k=0;k<n;k++){const rr=1.5+r()*1.0, g=blob(rr,1,seed*3+k+t.x,.25);
      const m=mat4(t.x+(r()-.5)*1.4,t.y+.5+r()*.6,t.z+(r()-.5)*1.4,0,r()*3,0,1,.72,1);
      bl.push({g,m}); yMin=Math.min(yMin,t.y-rr*.5); yMax=Math.max(yMax,t.y+rr*1.3);}}
  for(const b of bl)canopy.push({g:b.g,m:b.m,c:(p,n,o)=>{const t=clamp((p.y-yMin)/(yMax-yMin),0,1);
    const vn=vnoise(p.x*1.7,p.z*1.7+p.y);
    o.copy(dark).lerp(mid,smooth(0,.5,t)).lerp(lite,smooth(.35,1,t)*clamp(n.y*.8+.45,0,1)*.85).lerp(warm,smooth(.55,.85,vn)*smooth(.3,.9,t)*.35);
    o.multiplyScalar(.86+vn*.28);}});
  const cg=mergeParts(canopy); cg.computeBoundingBox(); const bb=cg.boundingBox;
  spherize(cg,(bb.min.x+bb.max.x)/2,lerp(bb.min.y,bb.max.y,.32),(bb.min.z+bb.max.z)/2,.55,1.25);
  return {trunk:mergeParts(trunk),canopy:cg,h:H};
}
function pineGeos(seed){
  const r=rnd(seed),H=9+r()*3;
  const tg=new THREE.CylinderGeometry(.12,.34,H,7,1,true); tg.translate(0,H/2-.2,0);
  const trunk=mergeParts([{g:tg,c:col('#3a2c24')}]);
  const parts=[], n=5, dark=col('#16241b'), lite=col('#3f5a3f');
  for(let k=0;k<n;k++){const t=k/(n-1),R=lerp(2.7,.85,t),ch=lerp(3.2,2.2,t),y=2.4+t*(H-3.4);
    const g=new THREE.ConeGeometry(R,ch,10,2,false), P=g.attributes.position;
    for(let i=0;i<P.count;i++){const x=P.getX(i),yy=P.getY(i),z=P.getZ(i);
      if(yy<-ch/2+.01){const a=Math.atan2(z,x),j=(Math.round(a/(TAU/10))&1)?1.18:.9;P.setXYZ(i,x*j,yy-.35*j,z*j);}}
    g.computeVertexNormals();
    parts.push({g,m:mat4(0,y,0,0,r()*3,0),c:(p,nn,o)=>{o.copy(dark).lerp(lite,clamp((p.y-y+ch/2)/ch*.55+nn.y*.3+.12,0,1)).multiplyScalar(.9+vnoise(p.x*2,p.y*1.3+p.z*2)*.2);}});}
  // soft cones: normals lean out from the trunk axis (and up) so tiers shade as rounded masses, not facets
  const cg=mergeParts(parts), P=cg.attributes.position, N=cg.attributes.normal;
  for(let i=0;i<P.count;i++){ _v.set(P.getX(i),.55,P.getZ(i)).normalize(); _n.fromBufferAttribute(N,i).lerp(_v,.45).normalize(); N.setXYZ(i,_n.x,_n.y,_n.z); }
  return {trunk,canopy:cg,h:H};
}

/* ---------- rocks ---------- */
function rockGeo(seed){
  const g=new THREE.DodecahedronGeometry(1,1), P=g.attributes.position;
  for(let i=0;i<P.count;i++){_v.fromBufferAttribute(P,i);const k=.8+vnoise(_v.x*2+seed,_v.y*2+_v.z*1.7)*.42;P.setXYZ(i,_v.x*k,_v.y*k,_v.z*k);}
  g.computeVertexNormals();
  const st=col('#7a7e86'),st2=col('#5b5f69'),moss=col('#3f5230');
  return mergeParts([{g,c:(p,n,o)=>{o.copy(st2).lerp(st,vnoise(p.x*3,p.z*3+p.y*2)).lerp(moss,smooth(.35,.8,n.y)*.85);}}]);
}

/* =====================================================================
   FOREST
   ===================================================================== */
const SPAWN=new Set(); // occupied cells for prop spacing
function buildForest(){
  const r=rnd(4242);
  const trunkMat=G.toon('#ffffff',{vertexColors:true}), leafMat=foliageShader(G.toon('#ffffff',{vertexColors:true}),{leaf:true});
  const treeTrunkMat=foliageShader(G.toon('#ffffff',{vertexColors:true}),{leaf:false}); // standing trunks flex; fallen logs don't
  G.nearFade(trunkMat,1.4,4.2); G.nearFade(treeTrunkMat,1.4,4.2); G.nearFade(leafMat,1.8,5.5);
  // nearFade replaces the cache key: give each foliage program its own again (and the quality variant)
  for(const [m,k] of [[leafMat,'L'],[treeTrunkMat,'T']])m.customProgramCacheKey=()=>'bqFolNF'+k+(m.defines&&m.defines.BQ_LQ?'q':'');
  FOL.mats.push(leafMat,treeTrunkMat);
  const oaks=[oakGeos(11),oakGeos(29),oakGeos(53)], pines=[pineGeos(7),pineGeos(19)];
  const T={oakT:oaks.map(o=>new Tiled(o.trunk,treeTrunkMat,{cast:true})),oakC:oaks.map(o=>new Tiled(o.canopy,leafMat,{cast:true})),
    pineT:pines.map(o=>new Tiled(o.trunk,treeTrunkMat,{cast:true})),pineC:pines.map(o=>new Tiled(o.canopy,leafMat,{cast:true}))};
  W._treeTiles=T;
  const addTree=(kind,x,z,s,lean,leanDir,tint)=>{
    const y=gh(x,z);
    const m=new THREE.Matrix4().compose(_p.set(x,y,z),_q.setFromEuler(_e.set(Math.cos(leanDir)*lean,r()*TAU,Math.sin(leanDir)*lean,'YXZ')),_s.set(s,s*(.9+r()*.25),s));
    // rotation built with Y first then lean in world X/Z (approximation is fine)
    if(kind==='oak'){const v=Math.floor(r()*oaks.length); T.oakT[v].add(m); T.oakC[v].add(m,tint); G.addCollider({x,z,r:.55*s});}
    else{const v=Math.floor(r()*pines.length); T.pineT[v].add(m); T.pineC[v].add(m,tint); G.addCollider({x,z,r:.35*s});}
    FOL.trees.push(x,z,(kind==='oak'?3.4:2.4)*s);
  };
  W._addTree=addTree;
  let n=0; const S=4.7;
  for(let x=-236;x<-56;x+=S)for(let z=-108;z<108;z+=S){
    const px=x+(r()-.5)*S*.95,pz=z+(r()-.5)*S*.95;
    const edge=smooth(-56,-80,px); if(r()>edge*.93)continue;
    const h=gh(px,pz); if(h<2.8||gslope(px,pz)>.75)continue;
    if(pathDist(px,pz)<3.6)continue;
    if(Math.hypot(px+165,pz-5)<16.5)continue;
    if(!clearOf(px,pz,1.5))continue;
    const pine=r()<lerp(.35,.6,smooth(-20,40,-pz))*(px<-200?1.2:1);
    _c.setHSL(pine?.36+r()*.05:.22+r()*.1,.3+r()*.3,.5); const tint=new THREE.Color(1,1,1).lerp(_c,.35).multiplyScalar(.85+r()*.4);
    addTree(pine?'pine':'oak',px,pz,pine?.8+r()*.55:.85+r()*.6,(r()-.5)*.08,r()*TAU,tint);
    n++;
  }
  W.stats.trees=n;
  // undergrowth: ferns + bushes
  const fern=(()=>{const parts=[];const g0=new THREE.PlaneGeometry(.22,1.1,1,3); g0.translate(0,.55,0);
    const P=g0.attributes.position; for(let i=0;i<P.count;i++){const y=P.getY(i),t=y/1.1;P.setXYZ(i,P.getX(i)*(1-t*.8),y*.75,t*t*.55);}
    for(let k=0;k<7;k++)parts.push({g:g0,m:mat4(0,0,0,0,k/7*TAU,0),c:(p,n,o)=>o.copy(col('#1f3320')).lerp(col('#4c6a33'),clamp(p.y*1.6,0,1))});
    const g=mergeParts(parts); const N=g.attributes.normal; for(let i=0;i<N.count;i++)N.setXYZ(i,0,1,0); return g;})();
  const fernMat=G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide});
  G.nearFade(fernMat,1.2,3.5);
  const bushC=(p,n,o)=>o.copy(col('#202f21')).lerp(col('#4a6238'),clamp(n.y*.6+.4,0,1));
  const bushG=spherize(mergeParts([{g:blob(1,1,3,.3),c:bushC},{g:blob(.7,1,8,.3),m:mat4(.7,.1,.3),c:bushC}]),.3,-.2,.1,.4);
  const ferns=new Tiled(fern,fernMat,{}), bushes=new Tiled(bushG,leafMat,{cast:true});
  for(let i=0;i<5200;i++){const x=-232+r()*176,z=-106+r()*212; const edge=smooth(-56,-76,x); if(r()>edge)continue;
    const h=gh(x,z); if(h<2.6||gslope(x,z)>.8||pathDist(x,z)<1.6)continue;
    const dc=Math.hypot(x+165,z-5); if(dc<9)continue;
    if(!clearOf(x,z,.4))continue;
    const s=.7+r()*.8;
    if(r()<.78){_c.setHSL(.24+r()*.07,.4,.5+r()*.15); ferns.add(mat4(x,h-.05,z,0,r()*TAU,0,s,s*(.8+r()*.4),s),_c.clone().multiplyScalar(1.9));}
    else if(dc>14){_c.setHSL(.27+r()*.06,.3,.5); bushes.add(mat4(x,h+.25*s,z,0,r()*TAU,0,s*1.1,s*.95,s*1.1),_c.clone().multiplyScalar(1.6));}
  }
  // moor gorse / bushes
  for(let i=0;i<500;i++){const x=-56+r()*240,z=-100+r()*200; const h=gh(x,z); if(h<2.5||gslope(x,z)>.7||pathDist(x,z)<3)continue;
    if(x>112&&h<41.9)continue; if(Math.hypot(x-180,z)<20||Math.hypot(x-165,z)<20)continue; if(!clearOf(x,z,1))continue;
    const s=.45+r()*.5; _c.setHSL(.18+r()*.1,.3,.42+r()*.1); bushes.add(mat4(x,h+.2*s,z,0,r()*TAU,0,s*1.2,s*.9,s*1.2),_c.clone().multiplyScalar(1.5));}
  W.stats.ferns=ferns.count; W.stats.bushes=bushes.count;
  ferns.build(root); bushes.build(root);
  // fallen logs (merged) + mossy rocks
  const logParts=[], bark=col('#3d3027'), moss=col('#41562f');
  for(let i=0,k=0;i<400&&k<34;i++){const x=-228+r()*170,z=-100+r()*200; if(x>-74)continue;
    const h=gh(x,z); if(h<3||gslope(x,z)>.5||pathDist(x,z)<4.5||Math.hypot(x+165,z-5)<17||!clearOf(x,z,3))continue;
    const L=4+r()*4,rad=.3+r()*.25,yaw=r()*PI; const g=new THREE.CylinderGeometry(rad,rad*1.15,L,8,1,false);
    const ex=Math.cos(yaw)*L/2,ez=-Math.sin(yaw)*L/2; const y=Math.min(gh(x+ex,z+ez),gh(x-ex,z-ez),h)+rad*.75;
    logParts.push({g,m:mat4(x,y,z,0,yaw,PI/2),c:(p,n,o)=>o.copy(bark).lerp(moss,smooth(.2,.9,n.y)*.9)});
    G.addBoxCollider({x,z,hw:L/2,hd:rad+.05,yaw,y0:y-2,y1:y+rad}); k++;}
  if(logParts.length){const lm=new THREE.Mesh(mergeParts(logParts),trunkMat); lm.castShadow=lm.receiveShadow=true; root.add(lm);}
}
function buildTreeTiles(){const T=W._treeTiles; for(const t of [...T.oakT,...T.oakC,...T.pineT,...T.pineC])t.build(root);}

/* ---------- rocks everywhere ---------- */
function buildRocks(){
  const r=rnd(909), mat=G.toon('#ffffff',{vertexColors:true});
  const rocks=[new Tiled(rockGeo(1),mat,{cast:true}),new Tiled(rockGeo(5),mat,{cast:true})];
  let n=0;
  for(let i=0;i<2600&&n<330;i++){const x=-232+r()*464,z=-106+r()*212; const h=gh(x,z); if(h<.6)continue;
    const sl=gslope(x,z), forest=x<-66, plateau=x>112&&h>41.5;
    if(x>112&&!plateau&&h>3)continue; // keep escarpment/ramp clear
    if(pathDist(x,z)<3.2||!clearOf(x,z,1.2)||Math.hypot(x+165,z-5)<15)continue;
    if(plateau&&(Math.hypot(x-165,z)<27||Math.hypot(x-158,z-24)<10))continue;
    if(!forest&&!plateau&&h>2.5&&r()<.35)continue;
    const big=r()<(forest?.35:.2), s=big?1.1+r()*1.3:.35+r()*.5;
    _c.setHSL(.62+r()*.08,.06,.55+r()*.15);
    rocks[n&1].add(mat4(x,h-.2*s+(sl>.6?.2:0),z,r()*3,r()*3,r()*3,s*1.2,s*(.6+r()*.4),s),_c.clone().multiplyScalar(1.9));
    if(s>.75)G.addCollider({x,z,r:s*.95,y1:h+s*.9}); n++;}
  W.stats.rocks=n;
  rocks.forEach(t=>t.build(root));
}

/* ---------- the Resisting Tree ---------- */
function buildResistingTree(){
  const L=LM.resistingTree, x0=L.x, z0=L.z, y0=gh(x0,z0), r=rnd(1313);
  const g=new THREE.Group(); g.position.set(x0,y0,z0); g.name='resistingTree'; root.add(g);
  const bark=col('#4b3c36'),bark2=col('#2c2228'),vio=col('#5a3f6e');
  const tp=[];
  // trunk: massive twisted column
  const H=13,tg=new THREE.CylinderGeometry(2.1,3.2,H,16,14,true); tg.translate(0,H/2,0);
  const P=tg.attributes.position;
  for(let i=0;i<P.count;i++){let x=P.getX(i),y=P.getY(i),z=P.getZ(i);const t=y/H,fl=1+1.4*Math.pow(1-smooth(0,.35,t),2.2);
    const tw=t*1.6,cs=Math.cos(tw),sn=Math.sin(tw); let X=(x*cs-z*sn)*fl,Z=(x*sn+z*cs)*fl;
    const ridge=1+Math.sin(Math.atan2(Z,X)*7+t*4)*.09+(vnoise(X*.8,y*.6)-.5)*.25; X*=ridge;Z*=ridge;
    P.setXYZ(i,X+Math.sin(t*2.2)*.8,y-.6,Z+Math.sin(t*1.7)*.5);}
  tg.computeVertexNormals();
  tp.push({g:tg,c:(p,n,o)=>o.copy(bark2).lerp(bark,clamp(n.y*.4+.5+(vnoise(p.x*1.4,p.y*1.4+p.z)-.5)*.7,0,1)).lerp(vio,smooth(3,0,p.y)*.35)});
  // roots: tubes spreading over the ground (skip the lantern side)
  const lanA=Math.atan2(LM.lanternSpot.z-z0,LM.lanternSpot.x-x0);
  for(let k=0;k<9;k++){const a=k/9*TAU+r()*.4; if(Math.abs(U.angDiff(a,lanA))<.32)continue;
    const len=6+r()*4,pts=[];
    for(let s=0;s<=5;s++){const t=s/5,rad=2.4+t*len,aa=a+Math.sin(t*3+k)*.18,wx=Math.cos(aa)*rad,wz=Math.sin(aa)*rad;
      pts.push(new THREE.Vector3(wx,gh(x0+wx,z0+wz)-y0+lerp(1.6,-.35,Math.pow(t,.7)),wz));}
    const tube=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),16,.55,7,false), TP=tube.attributes.position;
    // taper: scale radius by distance along
    const N=tube.attributes.normal; for(let i=0;i<TP.count;i++){const seg=Math.floor(i/8)/16,sc=lerp(1.25,.35,seg);
      TP.setXYZ(i,TP.getX(i)-N.getX(i)*.55*(1-sc),TP.getY(i)-N.getY(i)*.55*(1-sc),TP.getZ(i)-N.getZ(i)*.55*(1-sc));}
    tp.push({g:tube,c:(p,n,o)=>o.copy(bark2).lerp(bark,clamp(n.y*.5+.5,0,1)).lerp(col('#3f5530'),smooth(.5,1,n.y)*.4)});}
  // great limbs + canopy
  const leaves=[]; const lDark=col('#1e2a25'),lMid=col('#3a4c3f'),lLite=col('#76765e');
  for(let k=0;k<6;k++){const a=k/6*TAU+r()*.5,el=.75+r()*.35,len=7+r()*4,y=9+r()*3;
    const sx=Math.sin(y/H*2.2)*.8,sz=Math.sin(y/H*1.7)*.5;
    const pts=[new THREE.Vector3(sx,y,sz)];
    for(let s=1;s<=4;s++){const t=s/4;pts.push(new THREE.Vector3(sx+Math.cos(a)*Math.sin(el)*len*t,y+Math.cos(el)*len*t+Math.sin(t*PI)*1.3,sz+Math.sin(a)*Math.sin(el)*len*t));}
    const tube=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),10,.7,7,false);
    const TP=tube.attributes.position,N=tube.attributes.normal;
    for(let i=0;i<TP.count;i++){const seg=Math.floor(i/8)/10,sc=lerp(1,.35,seg);TP.setXYZ(i,TP.getX(i)-N.getX(i)*.7*(1-sc),TP.getY(i)-N.getY(i)*.7*(1-sc),TP.getZ(i)-N.getZ(i)*.7*(1-sc));}
    tp.push({g:tube,c:bark});
    const e=pts[4]; for(let b=0;b<3;b++){const rr=3+r()*2.2;
      leaves.push({g:blob(rr,1,k*7+b,.28),m:mat4(e.x+(r()-.5)*4,e.y+1+r()*2,e.z+(r()-.5)*4,0,r()*3,0,1,.7,1)});}}
  for(let b=0;b<4;b++){const rr=4+r()*1.5,a=r()*TAU;leaves.push({g:blob(rr,1,90+b,.25),m:mat4(Math.cos(a)*3,H+3+r()*3,Math.sin(a)*3,0,r()*3,0,1,.75,1)});}
  for(const l of leaves)l.c=(p,n,o)=>{o.copy(lDark).lerp(lMid,smooth(8,16,p.y)).lerp(lLite,smooth(.2,1,n.y)*smooth(12,22,p.y)*.55);};
  const tm=G.toon('#ffffff',{vertexColors:true,emissive:'#2a1840',emissiveIntensity:.35});
  const tmesh=new THREE.Mesh(mergeParts(tp),tm); tmesh.castShadow=tmesh.receiveShadow=true; g.add(tmesh);
  const lmesh=new THREE.Mesh(mergeParts(leaves),rimShader(G.toon('#ffffff',{vertexColors:true,emissive:'#24183a',emissiveIntensity:.5}))); lmesh.castShadow=true; lmesh.receiveShadow=true; g.add(lmesh);
  G.addCollider({x:x0+.3,z:z0,r:3.6});
  // soft warm-violet glow + motes
  treeLight=new THREE.PointLight(col('#c69bff'),2.2,34,1.6); treeLight.position.set(1.5,3.5,2); g.add(treeLight);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:col('#b88cff'),transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));
  halo.scale.set(16,9,1); halo.position.set(0,2.4,0); g.add(halo);
  const N=150,mp=new Float32Array(N*3),ms=new Float32Array(N);
  for(let i=0;i<N;i++){const a=r()*TAU,rr=2.5+r()*12;mp[i*3]=Math.cos(a)*rr;mp[i*3+1]=r()*12;mp[i*3+2]=Math.sin(a)*rr;ms[i]=r();}
  const mg=new THREE.BufferGeometry(); mg.setAttribute('position',new THREE.BufferAttribute(mp,3)); mg.setAttribute('seed',new THREE.BufferAttribute(ms,1));
  motes=new THREE.Points(mg,new THREE.ShaderMaterial({uniforms:{uTime:SH.time,uMap:{value:G.tex.flame}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform float uTime;attribute float seed;varying float vA;varying float vW;
void main(){vec3 p=position;float t=uTime*(.15+seed*.2)+seed*20.;p.y=mod(p.y+t*1.5,12.)+.3;p.x+=sin(t*1.3+seed*9.)*1.2;p.z+=cos(t*1.1+seed*7.)*1.2;
  vA=smoothstep(0.,1.5,p.y)*(1.-smoothstep(9.,12.,p.y))*(.5+.5*sin(uTime*2.+seed*30.));vW=seed;
  vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(90./-mv.z,1.5,9.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform sampler2D uMap;varying float vA;varying float vW;void main(){vec4 t=texture2D(uMap,gl_PointCoord);
  vec3 c=mix(vec3(1.4,.9,2.4),vec3(2.2,1.4,.7),step(.75,vW));gl_FragColor=vec4(c*t.a*vA,t.a*vA);}`}));
  motes.frustumCulled=false; g.add(motes);
}

/* =====================================================================
   MOOR: flowers, walls, hamlet, standing stones, lone trees
   ===================================================================== */
function buildFlowers(){
  const r=rnd(5150);
  const parts=[]; const stem=new THREE.PlaneGeometry(.025,.32); stem.translate(0,.16,0);
  parts.push({g:stem,c:col('#3c5a2c')},{g:stem,m:mat4(0,0,0,0,PI/2,0),c:col('#3c5a2c')});
  const head=new THREE.CircleGeometry(.075,5); head.rotateX(-PI/2); head.translate(0,.33,0);
  parts.push({g:head,c:col('#ffffff')});
  const center=new THREE.CircleGeometry(.025,4); center.rotateX(-PI/2); center.translate(0,.335,0);
  parts.push({g:center,c:col('#e8c860')});
  const geo=mergeParts(parts); const N=geo.attributes.normal; for(let i=0;i<N.count;i++)N.setXYZ(i,0,1,0);
  const fl=new Tiled(geo,G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide}),{});
  const vio=col('#9a6fe0'),vio2=col('#7b54c4'),wht=col('#ece6f4');
  let n=0;
  for(let i=0;i<1800;i++){ // clumps
    const cx=-70+r()*285,cz=-100+r()*200; const h=gh(cx,cz); if(h<2||gslope(cx,cz)>.6)continue;
    if(cx>112&&h<41.9)continue; if(Math.hypot(cx-180,cz)<10.5)continue;
    const white=r()<.4, k=4+Math.floor(r()*10);
    for(let j=0;j<k;j++){const x=cx+(r()-.5)*3.2,z=cz+(r()-.5)*3.2,y=gh(x,z); if(pathDist(x,z)<1.6||inFoot(x,z,.3))continue;
      const s=.8+r()*.7; fl.add(mat4(x,y-.02,z,(r()-.5)*.3,r()*TAU,(r()-.5)*.3,s,s*(.8+r()*.5),s),white?wht:(r()<.5?vio:vio2)); n++;}
  }
  // forest-edge violets and cottage beds
  for(let i=0;i<600;i++){const x=-130+r()*80,z=-90+r()*180,h=gh(x,z); if(h<2.6||pathDist(x,z)<1.4||!clearOf(x,z,.2))continue; fl.add(mat4(x,h-.02,z,0,r()*TAU,0,.9),vio); n++;}
  W.stats.flowers=n;
  fl.build(root);
}

function wallKit(kit,pts,r){
  for(let i=0;i<pts.length-1;i++){const ax=pts[i][0],az=pts[i][1],bx=pts[i+1][0],bz=pts[i+1][1];
    const L=Math.hypot(bx-ax,bz-az),yaw=Math.atan2(-(bz-az),bx-ax), nS=Math.ceil(L/.9);
    let run=null; const flush=()=>{ if(!run)return; const mx=(run.x0+run.x1)/2,mz=(run.z0+run.z1)/2,len=Math.hypot(run.x1-run.x0,run.z1-run.z0)+.9;
      G.addBoxCollider({x:mx,z:mz,hw:len/2,hd:.42,yaw,y0:run.y-2,y1:run.y+1.0}); run=null;};
    for(let s=0;s<nS;s++){const t=(s+.5)/nS,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
      if(pathDist(x,z)<2.6||r()<.04){flush();continue;}
      const y=gh(x,z), tumble=r()<.12;
      const hgt=tumble?.35:.85+r()*.25;
      _c.setHSL(.08+r()*.05,.08,.6+r()*.25);
      kit.box('stone',.95+r()*.2,hgt*.55,.75,x,y+hgt*.27-.15,z,yaw+(r()-.5)*.15,0,(r()-.5)*.08,_c.clone());
      if(!tumble){kit.box('stone',.85+r()*.2,hgt*.4,.6,x+(r()-.5)*.15,y+hgt*.72-.15,z+(r()-.5)*.15,yaw+(r()-.5)*.25,0,(r()-.5)*.12,_c.clone().multiplyScalar(.95));
        if(r()<.7)kit.box('stone',.5+r()*.3,.16,.5,x,y+hgt*.92-.05,z,yaw+r(),0,0,col('#7f8c62'));}
      if(!run)run={x0:x,z0:z,x1:x,z1:z,y}; else {run.x1=x;run.z1=z;run.y=Math.min(run.y,y);}
      if(run&&Math.hypot(run.x1-run.x0,run.z1-run.z0)>3.2)flush();
    }
    flush();
  }
}

function ruinCottage(kit,cx,cz,yaw,r,idx){
  const base=Math.min(gh(cx-3,cz-2),gh(cx+3,cz-2),gh(cx-3,cz+2),gh(cx+3,cz+2));
  kit.frame=mat4(cx,base,cz,0,yaw,0);
  // each ruin its own house (playtest 2026-11-07: "they look copy-pasted"): footprint, stone colour and one detail differ.
  // No extra random draws, so everything else on the island (and the undercroft ruin, idx 3) is laid out exactly as before.
  const VAR=[{W:7.6,D:5.4,tint:[1.06,.98,.9]},{W:6.3,D:4.7,tint:[.9,.95,.97]},{W:7.9,D:5.6,tint:[1.02,.94,.92]},{W:7.2,D:5.2,tint:[1,1,1]}][idx]||{W:7.2,D:5.2,tint:[1,1,1]};
  const Wd=VAR.W,Dp=VAR.D,T=.55;
  const tint=c=>{ c.r*=VAR.tint[0]; c.g*=VAR.tint[1]; c.b*=VAR.tint[2]; return c; };
  const walls=[ // [x0,z0,x1,z1,maxH,gable,doorAt]
    [-Wd/2,-Dp/2,Wd/2,-Dp/2,2.6,false,idx%2?-.6:1.2],[-Wd/2,Dp/2,Wd/2,Dp/2,2.6,false,null],
    [-Wd/2,-Dp/2,-Wd/2,Dp/2,2.6,true,null],[Wd/2,-Dp/2,Wd/2,Dp/2,2.6,true,null]];
  const cs=Math.cos(yaw),sn=Math.sin(yaw);
  for(const w of walls){
    const L=Math.hypot(w[2]-w[0],w[3]-w[1]),n=Math.round(L/1.2),along=w[0]===w[2]?'z':'x';
    const ruin=.35+r()*.65;
    let run=null;
    const flush=()=>{ if(!run)return; const lx=(run.a+run.b)/2,len=run.b-run.a+L/n;
      const px=along==='x'?lx:w[0], pz=along==='x'?w[1]:lx;
      G.addBoxCollider({x:cx+px*cs+pz*sn,z:cz-px*sn+pz*cs,hw:along==='x'?len/2:T/2+.05,hd:along==='x'?T/2+.05:len/2,yaw,y0:base-2,y1:base+run.h}); run=null;};
    for(let s=0;s<n;s++){
      const t=(s+.5)/n,lx=lerp(along==='x'?w[0]:w[1],along==='x'?w[2]:w[3],t);
      if(w[6]!=null&&Math.abs(lx-w[6])<.7){flush();continue;}
      let hgt=w[4]; if(w[5])hgt+=(1-Math.abs(t-.5)*2)*2.2;
      hgt*=lerp(ruin,1,r()*.6); if(r()<.16){flush();continue;}
      if(!w[5]&&r()<.18)hgt=Math.min(hgt,.95);
      hgt=Math.max(.5,hgt);
      const px=along==='x'?lx:w[0],pz=along==='x'?w[1]:lx,seg=L/n+.02;
      _c.setHSL(.08+r()*.04,.07,.62+r()*.2); tint(_c);
      kit.box('stone',along==='x'?seg:T,hgt+.6,along==='x'?T:seg,px,(hgt+.6)/2-.6,pz,0,0,0,_c.clone());
      if(r()<.5)kit.box('stone',.5,.3,.5,px+(r()-.5)*.3,hgt+.05,pz+(r()-.5)*.2,r(),0,(r()-.5)*.4,_c.clone().multiplyScalar(.9));
      if(hgt>.7){ if(!run)run={a:lx,b:lx,h:hgt}; else{run.b=lx;run.h=Math.max(run.h,hgt);} }
      else flush();
    }
    flush();
  }
  // chimney stub on one gable
  const side=idx%2?-1:1; kit.box('stone',1,3.4+r()*1.6,1,side*(Wd/2+.15),1.6,(r()-.5)*1.5,0,0,0,col('#8d8a84'));
  // collapsed roof slabs + fallen rafters
  const tilt=.55+r()*.25;
  // UNDERCROFT hook: the ruin with the cellar trapdoor (idx 3) keeps its fallen roof against the far wall and its rafters on
  // the east half, so the trapdoor's corner of the floor is clear (same random draws: the rest of the island is unchanged)
  const ucR=idx===3;
  kit.box('slate',Wd*.8,.14,ucR?2.0:3.1,(r()-.5)*.8,1.15,ucR?1.25:-.6*side,0,side*tilt,(r()-.5)*.1);
  if(idx===2)kit.box('slate',Wd*.95,.14,3.2,0,3.4,1.2,0,-.62,0);
  for(let k=0;k<3;k++){ const v=r(); kit.box('timber',.18,.18,ucR?3.2:4.4,ucR?.5+v*2.4:(v-.5)*5,.5+r()*.8,(r()-.5)*1.5,r()*.6-.3,r()*.8-.4,r()*.3); }
  // rubble
  for(let k=0;k<6;k++){const a=r()*TAU,d=Wd*.6+r()*1.5;kit.box('stone',.45+r()*.4,.3+r()*.25,.4+r()*.3,Math.cos(a)*d,.05,Math.sin(a)*d*.7,r()*3,r(),r(),col('#8a857c'));}
  // the detail that makes it this house
  const dz=-Dp/2, door=walls[0][6];
  if(idx===0){ // a sagging timber porch over the door
    for(const sx of [-.95,.95])kit.box('timber',.16,2.1,.16,door+sx,1.05,dz-1.3,0,0,sx*.04,col('#8a7562'));
    kit.box('timber',2.4,.16,.18,door,2.05,dz-1.3,0,0,.07,col('#7d6a58'));
    kit.box('slate',2.6,.1,1.6,door,2.2,dz-.75,0,-.32,.05); }
  const BX=(px,pz,hw,hd,h)=>G.addBoxCollider({x:cx+px*cs+pz*sn,z:cz-px*sn+pz*cs,hw,hd,yaw,y0:base-2,y1:base+h});
  if(idx===1)BX(-Wd/2+1.0,Dp/2-.6,.65,.35,.95);
  if(idx===2)BX(Wd/2+1.8,0,.25,1.7,1.1);
  if(idx===1){ // the door lintel still standing, a worn step, and a cold hearth inside
    kit.box('timber',1.7,.22,T+.1,door,2.05,dz,0,0,0,col('#6e5c4c'));
    kit.box('stone',1.5,.18,.7,door,.06,dz-.5,0,0,0,col('#9a948a'));
    kit.box('stone',1.3,.9,.7,-Wd/2+1.0,.45,Dp/2-.6,0,0,0,col('#7c736a')); kit.box('stone',.9,.12,.5,-Wd/2+1.0,.92,Dp/2-.6,0,0,0,col('#3c3530')); }
  else if(idx===2){ // a lean-to byre against the side: low wall and a slumped roof
    kit.box('stone',.45,1.1,3.4,Wd/2+1.8,.55,0,0,0,0,tint(col('#8f8a80')));
    kit.box('slate',2.2,.1,3.6,Wd/2+.95,1.45,0,0,0,-.42); }
  kit.frame=new THREE.Matrix4();
}

function buildMoorStructures(){
  const r=rnd(3141);
  const mats={stone:G.toon('#ffffff',{map:TEX.stone,vertexColors:true}),slate:G.toon('#ffffff',{map:TEX.slate,vertexColors:true}),
    timber:G.toon('#ffffff',{map:TEX.wood,vertexColors:true})};
  W._mats=mats;
  const kit=new Kit();
  // dry-stone walls
  const WALLS=[[[-60,-52],[-42,-40],[-20,-37],[2,-45]],[[8,46],[22,36],[29,20],[27,2],[22,-12]],[[58,42],[70,27],[86,22]],
    [[-52,42],[-40,52],[-20,58],[2,56]],[[54,-52],[68,-32],[78,-12]],[[-64,-24],[-63,-2],[-58,22],[-54,40]],[[100,-40],[90,-22]]];
  for(const w of WALLS)wallKit(kit,w,r);
  // ruined hamlet
  HAMLET.forEach((h,i)=>ruinCottage(kit,h.x,h.z,h.yaw,r,i));
  // broken cart
  { const cx=-17,cz=26,y=gh(cx,cz); kit.frame=mat4(cx,y,cz,0,.7,0);
    kit.box('timber',2.2,.12,1.3,0,.55,0,0,0,.18,col('#9a8070'));
    kit.box('timber',2.2,.4,.08,0,.75,.62,0,0,.18); kit.box('timber',2.2,.4,.08,0,.75,-.62,0,0,.18);
    kit.box('timber',.1,.1,2.6,-2.2,.25,.3,.3,0,-.1); kit.box('timber',.1,.1,2.6,-2.2,.25,-.4,-.2,0,-.1);
    const wheel=new THREE.CylinderGeometry(.6,.6,.12,12); kit.add('timber',wheel,mat4(.3,.6,.75,PI/2,0,0));
    kit.add('timber',wheel,mat4(1.4,.07,-1.4,0,0,0));
    kit.frame=new THREE.Matrix4(); G.addCollider({x:cx,z:cz,r:1.4}); }
  // broken fences around the hamlet
  const fence=[[[-40,12],[-28,10],[-16,11]],[[-2,28],[2,40],[0,48]]];
  for(const f of fence)for(let i=0;i<f.length-1;i++){const ax=f[i][0],az=f[i][1],bx=f[i+1][0],bz=f[i+1][1],L=Math.hypot(bx-ax,bz-az),n=Math.ceil(L/2.2),yaw=Math.atan2(-(bz-az),bx-ax);
    for(let s=0;s<=n;s++){const t=s/n,x=ax+(bx-ax)*t,z=az+(bz-az)*t; if(pathDist(x,z)<2)continue; const y=gh(x,z),lean=(r()-.5)*.35;
      kit.box('timber',.14,1.3,.14,x,y+.5,z,0,lean,0);
      if(s<n&&r()<.7){const fall=r()<.25;kit.box('timber',2.3,.1,.08,x+(bx-ax)/n/2,y+(fall?.1:.95),z+(bz-az)/n/2,yaw,0,fall?0:(r()-.5)*.2);}}}
  // standing stones circle
  { const sx=LM.stones.x,sz=LM.stones.z;
    for(let i=0;i<9;i++){const a=i/9*TAU+.2; if(i===5)continue; const x=sx+Math.cos(a)*8.5,z=sz+Math.sin(a)*8.5,y=gh(x,z);
      const fallen=i===2||i===7, h=fallen?1:2.6+r()*1.8;
      const geo=new THREE.CylinderGeometry(.42,.7,1,5,3); const P=geo.attributes.position;
      for(let k=0;k<P.count;k++){P.setXYZ(k,P.getX(k)*(1+(vnoise(k*1.3,i)-.5)*.4),P.getY(k),P.getZ(k)*.62);} geo.computeVertexNormals();
      const c=(p,n,o)=>o.copy(col('#8c8c92')).lerp(col('#5d6366'),vnoise(p.x*2,p.y*2)).lerp(col('#58693f'),smooth(.5,1,n.y)*.7);
      if(fallen)kit.add('rock',geo,mat4(x,y+.35,z,PI/2,a+1.2,0,1.3,3.2,1.3),c);
      else kit.add('rock',geo,mat4(x,y+h/2-.3,z,(r()-.5)*.14,-a+PI/2,(r()-.5)*.14,1.3,h+.4,1.3),c);
      G.addCollider({x,z,r:fallen?1.2:.85,y1:y+h});}
    const y=gh(sx,sz); kit.add('rock',UNITBOX,mat4(sx,y+.35,sz,0,.4,0,2.4,.7,1.4),col('#8a8a8a'));
    G.addCollider({x:sx,z:sz,r:1.2,y1:y+.7}); }
  mats.rock=G.toon('#ffffff',{vertexColors:true});
  kit.build(mats,root,{stone:.42,slate:.5,timber:.6});
  // lone wind-bent trees on the moor and headland
  const lone=[[-40,-60],[-8,-22],[22,58],[55,8],[75,-48],[90,40],[-50,-8],[10,-58],[64,-20],[-2,64],[198,-32],[204,30],[142,-36],[132,-22]];
  for(const [x,z] of lone){const h=gh(x,z); if(h<2.5||pathDist(x,z)<3.5)continue;
    W._addTree('oak',x,z,.95+r()*.35,.18+r()*.12,PI*.9+(r()-.5)*.6,new THREE.Color(.7,.8,.58).multiplyScalar(.85+r()*.2));} // linear tint (was a hex -> linear colour, ~4x darker than the forest's)
}

/* =====================================================================
   KEEPER'S COTTAGE — crooked & welcoming, now walk-in.
   Hollow stone ground floor (walls .45 thick), plank floor at +0.24,
   interior open to the joists (ceiling +4.35). Door in the north wall
   swings inward on interact. Hearth on the east wall (under the chimney),
   bed, table + chairs, dresser with jars & books, window seat, rug,
   hanging herbs, the keeper's logbook, a ship in a bottle, and the chest
   holding Rowan's old coat (the Traveler's Cloak item) against the south wall.
   ===================================================================== */
const CS={}; // cottage runtime state (door / chest / fire)
const HEMI0={c:new THREE.Color(),g:new THREE.Color(),ci:col('#c9a27a'),gi:col('#5a3a24')};
function cotTex(){
  const quilt=G.canvasTex(256,(g,s)=>{const cs=['#5a3f6e','#7a4f5f','#6a5a3e','#4b3863','#8a6a4a','#5f4a6a'];const n=6,w=s/n;
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){g.fillStyle=cs[(i*3+j*5)%cs.length];g.fillRect(i*w,j*w,w,w);
      g.strokeStyle='rgba(230,200,140,.55)';g.setLineDash([4,4]);g.lineWidth=2;g.strokeRect(i*w+3,j*w+3,w-6,w-6);g.setLineDash([]);
      if((i+j)%3===0){g.fillStyle='rgba(210,171,85,.7)';g.beginPath();g.ellipse(i*w+w/2,j*w+w/2,w*.18,w*.08,.7,0,TAU);g.fill();}}});
  const rug=G.canvasTex(256,(g,s)=>{g.fillStyle='#5e2f45';g.fillRect(0,0,s,s);
    const band=(m,c,lw)=>{g.strokeStyle=c;g.lineWidth=lw;g.beginPath();if(g.roundRect)g.roundRect(m,m,s-2*m,s-2*m,s*.18);else g.rect(m,m,s-2*m,s-2*m);g.stroke();};
    band(10,'#c8a24c',6); band(24,'#3a2236',10); band(38,'#a8743a',4);
    g.fillStyle='#7a3e52'; g.beginPath(); g.ellipse(s/2,s/2,s*.28,s*.2,0,0,TAU); g.fill();
    g.strokeStyle='#d2ab55'; g.lineWidth=3; g.beginPath(); g.ellipse(s/2,s/2,s*.2,s*.13,0,0,TAU); g.stroke();
    for(let k=0;k<8;k++){const a=k/8*TAU;g.fillStyle='#c8a24c';g.beginPath();g.ellipse(s/2+Math.cos(a)*s*.33,s/2+Math.sin(a)*s*.27,7,4,a,0,TAU);g.fill();}
    const r=Math.random; for(let i=0;i<900;i++){g.fillStyle=r()<.5?'rgba(255,230,200,.05)':'rgba(0,0,0,.08)';g.fillRect(r()*s,r()*s,2,2);}});
  const cloak=G.canvasTex(128,(g,s)=>{g.fillStyle='#4e3a68';g.fillRect(0,0,s,s);g.strokeStyle='#d2ab55';g.lineWidth=3;
    g.beginPath();g.moveTo(0,s*.78);g.lineTo(s,s*.78);g.stroke();
    for(let i=0;i<5;i++){const x=i*s/5+12;g.fillStyle='#d2ab55';g.beginPath();g.ellipse(x,s*.66,6,2.5,-.6,0,TAU);g.fill();g.beginPath();g.ellipse(x+9,s*.66,6,2.5,.6,0,TAU);g.fill();}});
  return {quilt,rug,cloak};
}
function buildCottage(kit,r){
  const C0=LM.cottage, X=COT.x, Z=COT.z, Wd=COT.Wd, Dp=COT.Dp, F=COT.floor;
  const OX=COT.ox, OZ=COT.oz, IX=COT.ix, IZ=COT.iz, T=OX-IX; // wall thickness .45
  const DX=COT.doorX, DW=COT.doorW, DH=COT.doorH, dx0=DX-DW/2, dx1=DX+DW/2;
  /* ---------------- exterior shell (merged into the headland kit) ---------------- */
  kit.frame=mat4(X,TOP,Z,0,0,0);
  const SC=col('#d8d0c4');
  // stone ground floor as four hollow walls (door gap in the north wall)
  kit.box('stone',OX+dx0,3,T,(-OX+dx0)/2,1.2,-OZ+T/2,0,0,0,SC);
  kit.box('stone',OX-dx1,3,T,(OX+dx1)/2,1.2,-OZ+T/2,0,0,0,SC);
  kit.box('stone',DW,2.7-(F+DH),T,DX,(2.7+F+DH)/2,-OZ+T/2,0,0,0,SC);   // over the door
  kit.box('stone',Wd,3,T,0,1.2,OZ-T/2,0,0,0,SC);
  for(const s of [-1,1])kit.box('stone',T,3,Dp-2*T,s*(OX-T/2),1.2,0,0,0,0,SC);
  kit.box('stone',Wd+.3,.5,Dp+.3,0,-.05,0,0,0,0,col('#9e978c')); // plinth (top at +0.2, under the plank floor)
  // timber-framed upper storey: hollow, slightly jettied & crooked
  { const f0=kit.frame; kit.frame=f0.clone().multiply(mat4(.05,0,0,0,0,.012));
    const ux=(Wd+.4)/2, uz=(Dp+.4)/2, ut=.32;
    kit.box('plaster',Wd+.4,1.7,ut,0,3.55,-uz+ut/2); kit.box('plaster',Wd+.4,1.7,ut,0,3.55,uz-ut/2);
    for(const s of [-1,1])kit.box('plaster',ut,1.7,Dp+.4-2*ut,s*(ux-ut/2),3.55,0);
    kit.frame=f0; }
  for(let k=-4;k<=4;k++)kit.box('timber',.16,1.75,.1,k*1.1,3.55,-Dp/2-.22,0,0,(k%2)*.04);
  for(let k=-4;k<=4;k++)kit.box('timber',.16,1.75,.1,k*1.1,3.55,Dp/2+.22,0,0,(k%2)*.04);
  kit.box('timber',Wd+.6,.2,.2,0,2.72,-Dp/2-.25); kit.box('timber',Wd+.6,.2,.2,0,4.38,-Dp/2-.25);
  kit.box('timber',Wd+.6,.2,.2,0,2.72,Dp/2+.25); kit.box('timber',Wd+.6,.2,.2,0,4.38,Dp/2+.25);
  const gsh=new THREE.Shape(); gsh.moveTo(-Dp/2-.2,0); gsh.lineTo(Dp/2+.2,0); gsh.lineTo(0,2.75); gsh.lineTo(-Dp/2-.2,0);
  const gable=new THREE.ExtrudeGeometry(gsh,{depth:.4,bevelEnabled:false}); gable.translate(0,0,-.2);
  for(const sx of [-1,1])kit.add('plaster',gable,mat4(sx*(Wd/2+.05),4.45,0,0,PI/2,0));
  const pitch=.72, rl=Dp/2/Math.cos(pitch)+.75;
  kit.box('slate',Wd+1.3,.22,rl,0,4.45+Math.sin(pitch)*rl/2,-Math.cos(pitch)*rl/2+.15,0,-pitch,.025); // note: box(...,ry,rx,rz)
  kit.box('slate',Wd+1.3,.22,rl,0,4.45+Math.sin(pitch)*rl/2,Math.cos(pitch)*rl/2-.15,0,pitch,.025);
  kit.box('timber',Wd+1.4,.26,.3,0,4.45+Math.sin(pitch)*rl+.02,0,0,0,.025);
  kit.box('slate',4.2,.18,2.5,.65,5.62,-Dp/2+.55,0,-.24,0); kit.box('timber',4.3,.14,.18,.65,5.36,-Dp/2-.62,0,0,0); // dormer: a shallow shed roof tucked into the main slope
  kit.box('plaster',3.6,2.1,.3,.65,4.3,-Dp/2-.32);
  kit.box('stone',1.3,4.6,1.3,Wd/2-1.1,6.2,.9,0,0,-.05,col('#cfc6b8'));
  kit.box('stone',1.5,.25,1.5,Wd/2-1.0,8.5,.9,0,0,-.05,col('#a9a196'));
  // door frame (timber posts + lintel + little hood), threshold, steps
  const DC=col('#7a5236');
  for(const s of [-1,1])kit.box('timber',.18,DH+.12,.56,DX+s*(DW/2+.06),F+(DH+.12)/2,-OZ+T/2,0,0,0,DC);
  kit.box('timber',DW+.5,.2,.6,DX,F+DH+.1,-OZ+T/2,0,0,0,DC);
  kit.box('slate',DW+1.1,.12,.8,DX,F+DH+.55,-OZ-.32,0,-.35,0); for(const s of [-1,1])kit.box('timber',.1,.1,.62,DX+s*(DW/2+.3),F+DH+.36,-OZ-.25,0,0,0);
  kit.box('stone',DW+.2,.06,T+.1,DX,F-.02,-OZ+T/2,0,0,0,col('#b2aa9c'));
  kit.box('stone',2.2,.22,.9,DX,.1,-OZ-.6,0,0,0,col('#a8a092')); kit.box('stone',1.9,.22,.7,DX,-.12,-OZ-1.3,.05,0,0,col('#a39b8e'));
  // windows: warm panes outside, dusk panes inside
  const win=(x,y,z,w,h,ry,inner)=>{const o=mat4(x,y,z,0,ry,0);
    kit.add('glow',UNITBOX,o.clone().multiply(mat4(0,0,0,0,0,0,w,h,.06)));
    kit.add('timber',UNITBOX,o.clone().multiply(mat4(0,0,.05,0,0,0,w+.24,.12,.1)));
    kit.add('timber',UNITBOX,o.clone().multiply(mat4(0,h/2+.05,.05,0,0,0,w+.24,.12,.12)));
    kit.add('timber',UNITBOX,o.clone().multiply(mat4(0,-h/2-.05,.08,0,0,0,w+.34,.14,.22)));
    kit.add('timber',UNITBOX,o.clone().multiply(mat4(0,0,.05,0,0,0,.08,h,.1)));
    for(const s of [-1,1])kit.add('timber',UNITBOX,o.clone().multiply(mat4(s*(w/2+.06),0,.05,0,0,0,.1,h+.2,.12)));
    if(inner)CS.winIn.push({x,y,z,w,h,ry});};
  CS.winIn=[];
  win(.9,1.55,-Dp/2-.04,1.3,1.1,PI,1); win(3.1,1.55,-Dp/2-.04,1.1,1.0,PI,1); win(.65,4.2,-Dp/2-.5,.9,.8,PI);
  win(-2,1.55,Dp/2+.04,1.2,1.0,0,1); win(2.2,3.6,Dp/2+.26,1,.75,0,1); win(-Wd/2-.04,1.6,.6,1,.9,-PI/2,1); win(Wd/2+.04,1.6,-1.2,.9,.9,PI/2,1);
  kit.box('timber',1.5,.3,.35,.9,.82,-Dp/2-.3); kit.box('timber',1.3,.3,.35,3.1,.85,-Dp/2-.3);
  // hanging lantern bracket by the door (now east of the door, clear of the swing)
  const LX=DX-1.0;
  kit.box('timber',.1,.1,.9,LX,2.75,-Dp/2-.45); kit.box('timber',.1,.6,.1,LX,2.5,-Dp/2-.05);
  kit.box('metal',.32,.06,.32,LX,2.5,-Dp/2-.85); kit.box('metal',.36,.06,.36,LX,2.02,-Dp/2-.85);
  for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]])kit.box('metal',.035,.48,.035,LX+a*.15,2.26,-Dp/2-.85+b*.15);
  kit.box('flame',.2,.32,.2,LX,2.26,-Dp/2-.85);
  // barrels & woodpile
  const barrel=new THREE.CylinderGeometry(.42,.38,1,10);
  kit.add('timber',barrel,mat4(-Wd/2+.2,.5,-Dp/2-.7)); kit.add('timber',barrel,mat4(-Wd/2-.55,.5,-Dp/2-.3,0,1,0,.9));
  for(let k=0;k<12;k++)kit.add('timber',new THREE.CylinderGeometry(.13,.13,1.2,6),mat4(Wd/2+.45,.15+(k%4)*.26,-1.6+Math.floor(k/4)*.28+(k%2)*.06,PI/2,0,0),col('#b08060'));
  kit.frame=new THREE.Matrix4();
  // wall colliders (door gap) + exterior props
  const BC=(lx0,lx1,lz0,lz1)=>G.addBoxCollider({x:X+(lx0+lx1)/2,z:Z+(lz0+lz1)/2,hw:(lx1-lx0)/2,hd:(lz1-lz0)/2,yaw:0,y0:TOP-2,y1:TOP+9});
  BC(-OX-.05,dx0,-OZ-.05,-IZ); BC(dx1,OX+.05,-OZ-.05,-IZ); BC(-OX-.05,OX+.05,IZ,OZ+.05);
  BC(-OX-.05,-IX,-OZ,OZ); BC(IX,OX+.05,-OZ,OZ);
  G.addCollider({x:X-Wd/2-.2,z:Z-Dp/2-.6,r:.6}); G.addCollider({x:X+Wd/2+.45,z:Z-1.3,r:.6});
  // lantern + window lights (outside)
  const lamp=new THREE.PointLight(col('#ffb25a'),2.2,16,1.8); lamp.position.set(X+LX,TOP+2.2,Z-Dp/2-1.2); root.add(lamp);
  const lampGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:col('#ffb060'),transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending}));
  lampGlow.scale.set(2.6,2.6,1); lampGlow.position.set(X+LX,TOP+2.26,Z-Dp/2-.85); root.add(lampGlow);
  const winLight=new THREE.PointLight(col('#ffa04a'),1.1,11,2); winLight.position.set(X+1.8,TOP+1.6,Z-Dp/2-1.5); root.add(winLight);
  CS.outLights=[lamp,winLight];
  for(let i=0;i<6;i++){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:col('#b9b0c4'),transparent:true,opacity:0,depthWrite:false}));
    sp.userData={ph:i/6,x:X+Wd/2-1.0,y:TOP+8.8,z:Z+.9}; root.add(sp); smokes.push(sp);}

  /* ---------------- interior ---------------- */
  const tx=cotTex();
  const shell={
    istone:G.toon('#ffffff',{map:TEX.stone,vertexColors:true}),
    iplaster:G.toon('#ffffff',{vertexColors:true}),
    iwood:G.toon('#ffffff',{map:TEX.wood,vertexColors:true}),
    idusk:new THREE.MeshBasicMaterial({color:col('#4a4778'),fog:false}),
  };
  const furn={
    fwood:G.toon('#ffffff',{map:TEX.wood,vertexColors:true}),
    fcloth:G.toon('#ffffff',{vertexColors:true}),
    fglass:G.toon('#ffffff',{vertexColors:true,transparent:true,opacity:.82,emissive:'#1a1208'}),
    fmetal:G.toon('#ffffff',{vertexColors:true}),
    fbrass:G.toon('#c8a24c',{vertexColors:true,emissive:'#2a1a06'}),
    fember:new THREE.MeshBasicMaterial({color:new THREE.Color(2.6,1.05,.32),fog:false}),
    fcandle:new THREE.MeshBasicMaterial({color:new THREE.Color(3,2,.9),fog:false}),
  };
  for(const k of ['fwood','fcloth','fglass','fmetal','fbrass'])G.nearFade(furn[k],.25,.8);
  const ik=new Kit(), fk=new Kit();
  ik.frame=mat4(X,TOP,Z); fk.frame=mat4(X,TOP,Z);
  const top=4.35, BEAM=col('#6a4a34');
  // floor planks (individual boards, slightly varied) + ceiling boards
  for(let i=0;i<14;i++){const w=(2*IX)/14, x=-IX+w*(i+.5); ik.box('iwood',w-.02,.12,2*IZ,x,F-.06,0,0,0,0,col('#a8876a').multiplyScalar(.85+r()*.3));}
  ik.box('iwood',2*IX,.12,2*IZ,0,top+.06,0,0,0,0,col('#8a6648'));
  // upper interior walls: warm plaster above a timber rail; stone below is the shell's inner face
  const PL=col('#ead7b4');
  ik.box('iplaster',2*IX,top-2.6,.08,0,(top+2.6)/2,-IZ+.04,0,0,0,PL); ik.box('iplaster',2*IX,top-2.6,.08,0,(top+2.6)/2,IZ-.04,0,0,0,PL);
  for(const s of [-1,1])ik.box('iplaster',.08,top-2.6,2*IZ,s*(IX-.04),(top+2.6)/2,0,0,0,0,PL);
  // lime-washed lower walls (stone texture showing through)
  const LW=col('#f0e2cc');
  ik.box('istone',dx0+IX,2.6-F,.06,(-IX+dx0)/2,(2.6+F)/2,-IZ+.03,0,0,0,LW); ik.box('istone',IX-dx1,2.6-F,.06,(IX+dx1)/2,(2.6+F)/2,-IZ+.03,0,0,0,LW);
  ik.box('istone',DW,2.6-(F+DH),.06,DX,(2.6+F+DH)/2,-IZ+.03,0,0,0,LW);
  ik.box('istone',2*IX,2.6-F,.06,0,(2.6+F)/2,IZ-.03,0,0,0,LW);
  for(const s of [-1,1])ik.box('istone',.06,2.6-F,2*IZ,s*(IX-.03),(2.6+F)/2,0,0,0,0,LW);
  // timber rail + skirting
  ik.box('iwood',2*IX,.14,.1,0,2.62,-IZ+.07,0,0,0,BEAM); ik.box('iwood',2*IX,.14,.1,0,2.62,IZ-.07,0,0,0,BEAM);
  for(const s of [-1,1])ik.box('iwood',.1,.14,2*IZ,s*(IX-.07),2.62,0,0,0,0,BEAM);
  // exposed beams across the room + a wall plate + posts in the corners
  for(const bx of [-2.75,-.95,.85,2.55])ik.box('iwood',.24,.28,2*IZ,bx,3.45,0,0,0,(bx*.37%1)*.02,BEAM);
  ik.box('iwood',2*IX,.2,.2,0,top-.12,0,0,0,0,BEAM);
  for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]])ik.box('iwood',.22,top-F,.22,sx*(IX-.11),(top+F)/2,sz*(IZ-.11),0,0,0,BEAM);
  // door jambs inside
  for(const s of [-1,1])ik.box('iwood',.14,DH+.1,.2,DX+s*(DW/2+.07),F+(DH+.1)/2,-IZ+.06,0,0,0,BEAM);
  ik.box('iwood',DW+.42,.16,.2,DX,F+DH+.08,-IZ+.06,0,0,0,BEAM);
  // windows from inside: dusk glass, frames, deep sills
  for(const w of CS.winIn){
    const ry=w.ry, nx=Math.round(Math.sin(ry)), nz=Math.round(Math.cos(ry)); // outward normal (local)
    let ix=w.x, iz=w.z; if(nx!==0)ix=nx>0?-IX+.0:IX; if(nz!==0)iz=nz>0?-IZ:IZ;
    // pane sits just inside the inner face
    const px=Math.abs(nx)?Math.sign(w.x)*(IX-.075):w.x, pz=Math.abs(nz)?Math.sign(w.z)*(IZ-.075):w.z;
    const o=mat4(px,w.y,pz,0,ry,0);
    ik.add('idusk',UNITBOX,o.clone().multiply(mat4(0,0,0,0,0,0,w.w,w.h,.02)));
    for(const s of [-1,1])ik.add('iwood',UNITBOX,o.clone().multiply(mat4(s*(w.w/2+.05),0,-.03,0,0,0,.1,w.h+.12,.08)),BEAM);
    ik.add('iwood',UNITBOX,o.clone().multiply(mat4(0,w.h/2+.05,-.03,0,0,0,w.w+.2,.1,.08)),BEAM);
    ik.add('iwood',UNITBOX,o.clone().multiply(mat4(0,0,-.03,0,0,0,.05,w.h,.05)),BEAM);
    ik.add('iwood',UNITBOX,o.clone().multiply(mat4(0,0,-.03,0,0,0,w.w,.05,.05)),BEAM);
    ik.add('iwood',UNITBOX,o.clone().multiply(mat4(0,-w.h/2-.06,-.12,0,0,0,w.w+.3,.07,.3)),col('#a07a58'));
  }
  /* hearth + chimney breast on the east wall (under the chimney) */
  const HX=IX, HZ=.9, hw=.95; // breast spans z HZ±hw, projects .8 into the room
  const HS=col('#b9afa2'), HD=.8;
  for(const s of [-1,1])ik.box('istone',HD,1.3,.3,HX-HD/2,F+.65,HZ+s*(hw-.15),0,0,0,HS);
  ik.box('istone',HD-.1,top-1.75,2*hw-.1,HX-(HD-.1)/2,(top+1.75)/2,HZ,0,0,0,HS);
  ik.box('istone',HD-.2,.25,2*hw-.6,HX-(HD-.2)/2-.05,F+1.42,HZ,0,0,0,col('#3a3230')); // smoke throat
  ik.box('istone',.12,1.3,2*hw-.6,HX-.06,F+.65,HZ,0,0,0,col('#2c2624'));   // sooty back
  ik.box('iwood',HD+.25,.14,2*hw+.2,HX-(HD+.25)/2,F+1.62,HZ,0,0,0,col('#7a5236')); // mantel shelf
  ik.box('istone',HD+.6,.07,2*hw+.3,HX-(HD+.6)/2,F+.035,HZ,0,0,0,col('#9d968a')); // hearthstone
  // fire: logs, embers, andirons, a kettle on a hook
  const fx0=HX-.42;
  for(const [a,dz,yy] of [[.35,-.12,.1],[-.35,.12,.1],[0,0,.24]])fk.add('fwood',new THREE.CylinderGeometry(.08,.09,.7,7),mat4(fx0,F+yy,HZ+dz,PI/2,a,0),col('#5a3a26'));
  fk.add('fember',new THREE.IcosahedronGeometry(.22,0),mat4(fx0,F+.1,HZ,0,0,0,1.3,.35,1.6));
  for(let i=0;i<7;i++)fk.add('fember',new THREE.IcosahedronGeometry(.05+r()*.04,0),mat4(fx0+(r()-.5)*.3,F+.06,HZ+(r()-.5)*.6));
  for(const s of [-1,1])fk.box('fmetal',.05,.3,.05,fx0-.25,F+.15,HZ+s*.36,0,0,0,col('#2a2526'));
  fk.box('fmetal',.04,.04,.5,HX-.35,F+1.2,HZ,0,0,0,col('#2a2526')); fk.box('fmetal',.03,.5,.03,HX-.35,F+.95,HZ+.1,0,0,0,col('#2a2526'));
  fk.add('fmetal',new THREE.SphereGeometry(.15,10,8),mat4(HX-.35,F+.68,HZ+.1,0,0,0,1,.8,1),col('#3a3432'));
  fk.add('fmetal',new THREE.CylinderGeometry(.03,.05,.14,6),mat4(HX-.5,F+.74,HZ+.1,0,0,1.1),col('#3a3432'));
  // mantel: ship in a bottle, candlesticks, a little clock-ish box, jars
  const MY=F+1.69;
  fk.add('fglass',new THREE.CylinderGeometry(.09,.09,.42,10),mat4(HX-.32,MY+.09,HZ-.1,PI/2,0,0),col('#9ec2b4'));
  fk.add('fglass',new THREE.CylinderGeometry(.035,.05,.1,8),mat4(HX-.32,MY+.09,HZ-.36,PI/2,0,0),col('#9ec2b4'));
  fk.box('fwood',.06,.03,.24,HX-.32,MY+.04,HZ-.08,0,0,0,col('#7a4a2a')); fk.box('fcloth',.01,.12,.1,HX-.32,MY+.1,HZ-.1,0,0,0,col('#f2ead8'));
  fk.box('fcloth',.01,.09,.07,HX-.32,MY+.1,HZ-.0,0,0,0,col('#f2ead8')); fk.box('fwood',.012,.16,.012,HX-.32,MY+.1,HZ-.05,0,0,0,col('#5a3a26'));
  fk.box('fwood',.14,.04,.14,HX-.32,MY+.0,HZ-.1,0,0,0,col('#5a3a26'));
  for(const dz of [.45,.75]){fk.add('fbrass',new THREE.CylinderGeometry(.03,.05,.16,8),mat4(HX-.3,MY+.08,HZ+dz)); fk.add('fcloth',new THREE.CylinderGeometry(.022,.022,.14,6),mat4(HX-.3,MY+.23,HZ+dz),col('#efe6d2'));}
  // bed in the south-west corner (head against the west wall)
  const BX0=-IX, BX1=-IX+2.05, BZ0=IZ-1.2, BZ1=IZ, bcx=(BX0+BX1)/2, bcz=(BZ0+BZ1)/2;
  fk.box('fwood',BX1-BX0,.28,BZ1-BZ0,bcx,F+.32,bcz,0,0,0,col('#8a5e3e'));
  for(const [sx,sz] of [[0,0],[1,0],[0,1],[1,1]])fk.box('fwood',.1,.2,.1,sx?BX1-.08:BX0+.08,F+.1,sz?BZ1-.08:BZ0+.08,0,0,0,col('#6a4630'));
  fk.box('fwood',.12,1.05,BZ1-BZ0+.06,BX0+.08,F+.6,bcz,0,0,0,col('#7a5236')); fk.box('fwood',.14,.1,BZ1-BZ0+.12,BX0+.08,F+1.15,bcz,0,0,0,col('#6a4630'));
  fk.box('fwood',.1,.62,BZ1-BZ0+.06,BX1-.06,F+.4,bcz,0,0,0,col('#7a5236'));
  fk.box('fcloth',BX1-BX0-.2,.2,BZ1-BZ0-.12,bcx,F+.55,bcz,0,0,0,col('#efe4cc'));
  fk.add('fcloth',blob(.22,1,7,.12),mat4(BX0+.42,F+.72,bcz,0,0,0,1,.45,1.5),col('#f6efe0'));
  // window seat under the west window
  const WS0=-.25, WS1=1.45;
  fk.box('fwood',.6,.46,WS1-WS0,-IX+.3,F+.23,(WS0+WS1)/2,0,0,0,col('#8a5e3e'));
  fk.box('fcloth',.56,.12,WS1-WS0-.06,-IX+.3,F+.52,(WS0+WS1)/2,0,0,0,col('#6c3f5f'));
  fk.add('fcloth',blob(.17,1,3,.15),mat4(-IX+.18,F+.72,WS0+.3,0,.3,.4,1,1,.55),col('#c8a24c'));
  fk.add('fcloth',blob(.16,1,5,.15),mat4(-IX+.18,F+.7,WS1-.3,0,-.2,.4,1,1,.55),col('#4b3863'));
  fk.box('fcloth',.3,.04,.22,-IX+.42,F+.6,(WS0+WS1)/2+.1,.3,0,0,col('#5a3a26')); // a book left on the seat (lying flat: the .3 was in the tilt slot, playtest 2026-11-07)
  // table + two chairs + the keeper's logbook, candle, mug, inkpot
  const TX=-.9, TZ=.3;
  fk.box('fwood',1.5,.08,.86,TX,F+.78,TZ,.04,0,0,col('#a0764e'));
  for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]])fk.box('fwood',.08,.76,.08,TX+sx*.64,F+.38,TZ+sz*.34,0,0,0,col('#7a5236'));
  fk.box('fwood',1.3,.06,.06,TX,F+.2,TZ,0,0,0,col('#7a5236'));
  const chair=(cx,cz,ry)=>{const f=mat4(X+cx,TOP,Z+cz,0,ry,0); const f0=fk.frame; fk.frame=f;
    fk.box('fwood',.46,.06,.44,0,F+.46,0,0,0,0,col('#94683f'));
    for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]])fk.box('fwood',.05,.46,.05,sx*.19,F+.23,sz*.18,0,0,0,col('#6a4630'));
    for(const sx of [-1,1])fk.box('fwood',.05,.62,.05,sx*.19,F+.77,.19,0,0,0,col('#6a4630'));
    fk.box('fwood',.42,.08,.04,0,F+1.0,.19,0,0,0,col('#7a5236')); fk.box('fwood',.42,.06,.04,0,F+.76,.19,0,0,0,col('#7a5236'));
    fk.box('fcloth',.38,.05,.36,0,F+.5,-.01,0,0,0,col('#6c3f5f'));
    fk.frame=f0;};
  // the north chair was right in front of the logbook (playtest 2026-11-09: Jacob and Ethan both walked past the note): it's
  // pushed back at the table's west end now, still askew as if someone only just got up
  const CHN=[TX-1.08,TZ-.12];
  chair(CHN[0],CHN[1],-PI/2+.45); chair(TX+.2,TZ+.74,-.2);
  // logbook (open), quill + inkpot, candle, mug
  const LB=mat4(TX+.25,F+.83,TZ-.05,0,.25,0);
  fk.add('fcloth',UNITBOX,LB.clone().multiply(mat4(0,0,0,0,0,0,.52,.03,.36)),col('#5a3422'));
  for(const s of [-1,1])fk.add('fcloth',UNITBOX,LB.clone().multiply(mat4(s*.125,.025,0,0,0,s*-.06,.24,.02,.33)),col('#f1e6cc'));
  fk.add('fcloth',UNITBOX,LB.clone().multiply(mat4(0,.03,.17,0,0,0,.02,.01,.06)),col('#8a2f3a'));
  fk.add('fglass',new THREE.CylinderGeometry(.04,.045,.07,8),mat4(TX+.6,F+.86,TZ+.22),col('#2a2340'));
  fk.box('fcloth',.012,.26,.012,TX+.62,F+.98,TZ+.2,0,0,-.35,col('#f4efe6'));
  fk.add('fbrass',new THREE.CylinderGeometry(.07,.08,.03,10),mat4(TX-.45,F+.835,TZ+.1));
  fk.add('fcloth',new THREE.CylinderGeometry(.03,.03,.16,8),mat4(TX-.45,F+.93,TZ+.1),col('#efe6d2'));
  fk.add('fcloth',new THREE.CylinderGeometry(.055,.05,.12,10),mat4(TX-.15,F+.88,TZ+.25),col('#8a6a9a'));
  CS.candle=new THREE.Vector3(X+TX-.45,TOP+F+1.05,Z+TZ+.1);
  // dresser on the north wall: cupboard + open shelves of jars and books
  const SX0=dx1+.18, SX1=.15, scx=(SX0+SX1)/2, SD=.38, SZ=-IZ+SD/2+.02;
  fk.box('fwood',SX1-SX0,.9,SD,scx,F+.45,SZ,0,0,0,col('#7e5a3c'));
  for(const s of [-1,1])fk.box('fwood',.04,.7,.02,scx+s*(SX1-SX0)/4,F+.45,SZ+SD/2+.01,0,0,0,col('#5a3a26'));
  for(const s of [-1,1])fk.add('fbrass',new THREE.SphereGeometry(.025,6,4),mat4(scx+s*.08,F+.55,SZ+SD/2+.02));
  for(const s of [-1,1])fk.box('fwood',.05,1.55,.26,s<0?SX0+.025:SX1-.025,F+1.67,-IZ+.15,0,0,0,col('#6a4630'));
  fk.box('fwood',SX1-SX0,.05,.28,scx,F+2.45,-IZ+.16,0,0,0,col('#6a4630'));
  const shelfY=[F+.93,F+1.48,F+2.0];
  for(const y of shelfY.slice(1))fk.box('fwood',SX1-SX0,.04,.26,scx,y,-IZ+.15,0,0,0,col('#7e5a3c'));
  const JC=['#c98a2e','#7b9a5a','#b5643a','#d8c79a','#8a6aa8','#a8433a'];
  const jar=(x,y,s,c)=>{fk.add('fglass',new THREE.CylinderGeometry(.06*s,.065*s,.17*s,9),mat4(x,y+.085*s,-IZ+.17),col(c));
    fk.add('fcloth',new THREE.CylinderGeometry(.068*s,.068*s,.035*s,9),mat4(x,y+.18*s,-IZ+.17),col('#e8dcc0'));};
  const books=(x0,x1,y)=>{let x=x0; const BK=['#5a2e3e','#2e4a3e','#6a4a2e','#3e3a5a','#7a3a2e','#4b3863','#8a6a3a'];
    while(x<x1){const w=.04+r()*.04,h=.16+r()*.1,lean=x+w>x1-.1&&r()<.6?.3:0; fk.box('fcloth',w,h,.18,x+w/2,y+h/2,-IZ+.15,0,0,lean,col(BK[Math.floor(r()*BK.length)])); x+=w+.006; if(lean)break;}};
  jar(SX0+.15,shelfY[0]+.02,1,JC[0]); jar(SX0+.32,shelfY[0]+.02,.8,JC[1]); books(SX0+.45,SX1-.25,shelfY[0]+.02); jar(SX1-.14,shelfY[0]+.02,1.1,JC[2]);
  books(SX0+.06,SX0+.6,shelfY[1]+.02); jar(SX0+.75,shelfY[1]+.02,1,JC[3]); jar(SX0+.92,shelfY[1]+.02,.75,JC[4]); jar(SX1-.18,shelfY[1]+.02,1.2,JC[5]);
  jar(SX0+.16,shelfY[2]+.02,1.25,JC[1]); jar(SX0+.36,shelfY[2]+.02,.9,JC[0]); books(SX0+.5,SX1-.08,shelfY[2]+.02);
  for(let i=0;i<3;i++)fk.add('fcloth',new THREE.CylinderGeometry(.07,.07,.02,10),mat4(scx-.3+i*.3,F+2.52,-IZ+.18,PI/2-.25,0,0),col('#d8cdb4'));
  // pegs by the door with the keeper's coat
  fk.box('fwood',.9,.08,.06,-IX+.55,F+1.85,-IZ+.05,0,0,0,col('#6a4630'));
  for(let i=0;i<3;i++)fk.box('fwood',.04,.04,.14,-IX+.25+i*.3,F+1.85,-IZ+.12,0,0,0,col('#5a3a26'));
  fk.add('fcloth',new THREE.CylinderGeometry(.14,.26,1.05,8,1,true),mat4(-IX+.55,F+1.32,-IZ+.2,0,0,0,1,1,.45),col('#4a3a32'));
  fk.add('fcloth',blob(.14,1,9,.12),mat4(-IX+.55,F+1.86,-IZ+.2,0,0,0,1.2,.6,.6),col('#3a2e2a'));
  fk.add('fcloth',new THREE.CylinderGeometry(.16,.18,.1,10),mat4(-IX+.25,F+1.95,-IZ+.2),col('#2e2626')); // hat
  fk.add('fcloth',new THREE.CylinderGeometry(.1,.11,.12,10),mat4(-IX+.25,F+2.04,-IZ+.2),col('#2e2626'));
  // woodstack + broom by the hearth
  for(let k=0;k<9;k++)fk.add('fwood',new THREE.CylinderGeometry(.08,.08,.55,6),mat4(IX-.35,F+.09+Math.floor(k/3)*.16,HZ-hw-.35+(k%3)*.17-(Math.floor(k/3)%2)*.08,PI/2,PI/2,0),col('#a07050'));
  fk.box('fwood',.03,1.3,.03,IX-.12,F+.7,HZ+hw+.2,0,0,.12,col('#8a6a4a')); fk.add('fcloth',new THREE.ConeGeometry(.12,.35,7),mat4(IX-.04,F+.16,HZ+hw+.2,0,0,.12),col('#c8a868'));
  // hanging herbs from the beam nearest the hearth
  const HER=['#6a8a4a','#8a6aaa','#7a9a5a','#a07ab8','#5a7a3a'];
  for(let i=0;i<7;i++){const z=-2.2+i*.62+(r()-.5)*.1, y=3.45-.14, len=.32+r()*.18;
    fk.box('fcloth',.012,.22,.012,2.55,y-.11,z,0,0,0,col('#c9b48a'));
    fk.add('fcloth',new THREE.ConeGeometry(.09+r()*.03,len,6),mat4(2.55,y-.22-len/2,z,PI,r()*3,0),col(HER[i%HER.length]));}
  // chest's floor rug + hearth rug
  const rug=new THREE.Mesh(new THREE.PlaneGeometry(2.3,1.9).rotateX(-PI/2),G.toon('#ffffff',{map:tx.rug,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  rug.position.set(X+2.0,TOP+F+.012,Z+.75); rug.rotation.y=.06; rug.receiveShadow=true; root.add(rug);
  const quilt=new THREE.Mesh(new THREE.BoxGeometry(BX1-BX0-.5,.08,BZ1-BZ0+.08),G.toon('#ffffff',{map:tx.quilt}));
  quilt.position.set(X+bcx+.22,TOP+F+.68,Z+bcz); quilt.castShadow=true; quilt.receiveShadow=true; root.add(quilt);
  const qf=new THREE.Mesh(new THREE.BoxGeometry(.06,.3,BZ1-BZ0+.08),quilt.material); qf.position.set(X+BX1-.27,TOP+F+.55,Z+bcz); root.add(qf);
  const qs=new THREE.Mesh(new THREE.BoxGeometry(BX1-BX0-.5,.3,.05),quilt.material); qs.position.set(X+bcx+.22,TOP+F+.55,Z+BZ0-.05); root.add(qs);
  ik.build(shell,root,{istone:.85,iwood:.7}); fk.build(furn,root,{fwood:.9});
  // furniture colliders (local rects)
  const FB=(lx0,lx1,lz0,lz1,h)=>G.addBoxCollider({x:X+(lx0+lx1)/2,z:Z+(lz0+lz1)/2,hw:(lx1-lx0)/2,hd:(lz1-lz0)/2,yaw:0,y0:TOP-1,y1:TOP+(h||1.2)});
  FB(-IX,BX1,BZ0,IZ);                    // bed
  FB(-IX,-IX+.6,WS0,WS1);                // window seat
  FB(TX-.72,TX+.72,TZ-.4,TZ+.4);         // table
  FB(SX0,SX1,-IZ,-IZ+SD+.02,2.6);        // dresser
  FB(IX-HD-.05,IX,-.6,HZ+hw+.25,4);      // hearth, woodstack, broom
  G.addCollider({x:X+CHN[0],z:Z+CHN[1],r:.28,y0:TOP-1,y1:TOP+1.2}); G.addCollider({x:X+TX+.2,z:Z+TZ+.74,r:.28,y0:TOP-1,y1:TOP+1.2});
  G.addCollider({x:X-IX+.5,z:Z-IZ+.25,r:.28,y0:TOP-1,y1:TOP+2.4}); // coat on its peg

  /* ---------------- the chest (dynamic lid) ---------------- */
  const CH=W.cottage.chest, cw=.92, cd=.56, chh=.48;
  const chest=new THREE.Group(); chest.position.set(CH.x,CH.y,CH.z); root.add(chest);
  const oak=G.toon('#ffffff',{map:TEX.wood}); oak.color.copy(col('#9a6a42'));
  const iron=G.toon('#2c2628'), brass=G.toon('#c8a24c',{emissive:'#2a1a06'});
  const mk=(g,m,x,y,z,p)=>{const o=new THREE.Mesh(g,m); o.position.set(x,y,z); o.castShadow=true; o.receiveShadow=true; (p||chest).add(o); return o;};
  const body=mk(new THREE.BoxGeometry(cw,chh,cd),oak,0,chh/2,0); G.outline(body,{thickness:.012});
  mk(new THREE.BoxGeometry(cw-.08,.02,cd-.08),G.toon('#3a2618'),0,chh-.06,0); // inside floor (dark)
  for(const s of [-1,1])mk(new THREE.BoxGeometry(.06,chh+.01,cd+.02),iron,s*(cw/2-.13),chh/2,0);
  mk(new THREE.BoxGeometry(cw+.02,.05,cd+.02),iron,0,.04,0);
  for(const s of [-1,1])for(const t of [-1,1])mk(new THREE.BoxGeometry(.07,.07,.07),brass,s*(cw/2-.01),t>0?chh-.03:.035,t*0+(-cd/2+.01));
  // handles on the sides
  for(const s of [-1,1]){const h=mk(new THREE.TorusGeometry(.06,.012,5,10,PI),iron,s*(cw/2+.012),chh*.62,0); h.rotation.set(0,PI/2,PI);}
  // lid: half-cylinder, hinged at the back top edge
  const lid=new THREE.Group(); lid.position.set(0,chh,cd/2); chest.add(lid);
  const lg=new THREE.CylinderGeometry(cd/2,cd/2,cw,14,1,false,0,PI); lg.rotateZ(PI/2); // dome over +y, axis along x
  const lidM=mk(lg,oak,0,0,-cd/2,lid); lidM.scale.set(1,.62,1); G.outline(lidM,{thickness:.012});
  const lidIn=mk(lg,G.toon('#4a2e1c',{side:THREE.BackSide}),0,0,-cd/2,lid); lidIn.scale.set(.985,.6,.985);
  for(const s of [-1,1]){const cap=new THREE.Mesh(new THREE.CircleGeometry(cd/2,14,0,PI),G.toon('#7a5236',{side:THREE.DoubleSide})); cap.rotation.y=PI/2; cap.rotation.z=-PI/2; cap.position.set(s*cw/2,0,-cd/2); cap.scale.set(.62,1,1); lid.add(cap);}
  const ironD=G.toon('#2c2628',{side:THREE.DoubleSide});
  for(const s of [-1,1]){const bg=new THREE.CylinderGeometry(cd/2+.014,cd/2+.014,.065,14,1,true,0,PI); bg.rotateZ(PI/2);
    const b=mk(bg,ironD,s*(cw/2-.13),0,-cd/2,lid); b.scale.set(1,.64,1);}
  for(const s of [-1,1])mk(new THREE.BoxGeometry(.065,.012,cd+.03),ironD,s*(cw/2-.13),.004,-cd/2,lid);
  const lock=mk(new THREE.BoxGeometry(.13,.15,.03),brass,0,-.02,-cd-.005,lid); mk(new THREE.BoxGeometry(.03,.05,.012),G.toon('#1a1414'),0,-.04,-cd-.022,lid);
  mk(new THREE.TorusGeometry(.028,.008,5,10),brass,0,-.11,-cd-.02,lid);
  // the folded cloak inside
  const folded=new THREE.Group(); folded.position.set(0,chh-.04,0); chest.add(folded);
  const fm=G.toon('#ffffff',{map:tx.cloak});
  const f1=new THREE.Mesh(new THREE.BoxGeometry(cw-.16,.1,cd-.14),fm); f1.position.y=.0; folded.add(f1);
  const f2=new THREE.Mesh(blob(.2,1,4,.1),G.toon('#4b3863')); f2.scale.set(1.6,.35,.9); f2.position.set(.08,.07,0); folded.add(f2);
  const clasp=new THREE.Mesh(new THREE.TorusGeometry(.03,.009,5,10),brass); clasp.rotation.x=PI/2; clasp.position.set(-.18,.09,-.05); folded.add(clasp);
  folded.visible=false; // revealed as the lid lifts
  // glow sprite + light-shaft
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:col('#ffd58a'),transparent:true,opacity:0,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending})); glow.renderOrder=5;
  glow.position.set(0,chh+.78,0); glow.scale.set(1.2,1.2,1); chest.add(glow);
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.42,.32,1.4,14,1,true),new THREE.MeshBasicMaterial({map:G.tex.soft,color:col('#ffcf86'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  shaft.position.set(0,chh+.7,0); shaft.scale.set(1,1,.6); shaft.visible=false; chest.add(shaft);
  lid.traverse(o=>{if(o.isMesh)o.castShadow=false;});
  Object.assign(CS,{chest,lid,folded,glow,shaft,lidT:-1,taken:false});
  G.addBoxCollider({x:CH.x,z:CH.z,hw:cw/2+.02,hd:cd/2+.02,yaw:0,y0:TOP-1,y1:TOP+1.2});
  G.interact.add({pos:new THREE.Vector3(CH.x,CH.y,CH.z-.1),radius:1.75,priority:3,label:'Open the chest',
    enabled:()=>!W.cottage.chestOpen&&!(G.items.cloak&&G.items.cloak.owned),use:openChest});

  /* ---------------- door (dynamic) ---------------- */
  const hinge=new THREE.Group(); hinge.position.set(X+dx0+.02,TOP+F,Z-OZ+T/2); root.add(hinge);
  const dw=DW-.06, dh=DH-.04, plank=G.toon('#ffffff',{map:TEX.wood}); plank.color.copy(col('#93603c'));
  const dm=new THREE.Mesh(new THREE.BoxGeometry(dw,dh,.1),plank); dm.position.set(dw/2,dh/2,0); dm.castShadow=dm.receiveShadow=true; hinge.add(dm); G.outline(dm,{thickness:.01});
  for(const y of [.35,dh/2,dh-.35]){for(const s of [-1,1]){const b=new THREE.Mesh(new THREE.BoxGeometry(dw*.62,.06,.02),iron); b.position.set(dw*.31+.02,y,s*.06); hinge.add(b);}}
  for(const s of [-1,1]){const b=new THREE.Mesh(new THREE.BoxGeometry(.05,dh*.7,.02),G.toon('#6e4a2c')); b.position.set(dw*.5,dh/2,s*.06); hinge.add(b);}
  for(const s of [-1,1]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.07,.012,6,14),iron); ring.position.set(dw-.18,dh*.47,s*.09); hinge.add(ring);
    const knob=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.04,8),brass); knob.rotation.x=PI/2; knob.position.set(dw-.18,dh*.47+.07,s*.07); hinge.add(knob);}
  const peep=new THREE.Mesh(new THREE.CircleGeometry(.11,12),new THREE.MeshBasicMaterial({color:new THREE.Color(2.2,1.25,.45),fog:true}));
  peep.position.set(dw/2,dh*.78,-.052); peep.rotation.y=PI; hinge.add(peep);
  const doorBox=G.addBoxCollider({x:X+DX,z:Z-OZ+T/2,hw:DW/2+.05,hd:T/2,yaw:0,y0:TOP-1,y1:TOP+3});
  Object.assign(CS,{hinge,doorBox,doorT:-1,doorAng:0});
  G.interact.add({pos:new THREE.Vector3(X+DX,TOP,Z-OZ),radius:2.0,priority:2,label:'Open the door',
    enabled:()=>!W.cottage.doorOpen,use:openDoor});
  // the keeper's logbook
  let logRead=0;
  G.interact.add({pos:new THREE.Vector3(X+TX+.25,TOP+F,Z+TZ-.05),radius:1.25,priority:1,label:'Read the logbook',
    use(){const L=['The keeper’s logbook lies open. The last entry, in a tidy hand: “Fog off the water again. Lamp lit at dusk. The moths are restless tonight.” Below it the page is blank.',
      'Older pages: tide times, a sketch of a heron, a list of jars to refill. Halfway down one page, in a different, rounder hand: “Da says throw out the Knox boy’s old coat. It’s in the chest. It stays in the chest. — H.”'];
      const t=L[logRead%L.length]; logRead++;
      if(G.talk&&G.talk.moment)G.talk.moment({who:'page',name:'The keeper’s logbook',title:logRead===1?'The last entry':'Older pages',portrait:'page',lines:[{text:t,who:'The keeper’s logbook'}],key:'cottageLog'}); else G.ui.say(t);}});

  /* ---------------- interior lights + fire FX ---------------- */
  const fire=new THREE.PointLight(col('#ff9a48'),0,8.5,1.6); fire.position.set(X+fx0-.35,TOP+F+.55,Z+HZ); root.add(fire);
  const lan=new THREE.PointLight(col('#ffbd70'),0,7.5,1.7); lan.position.set(X+TX+.05,TOP+2.35,Z+TZ); root.add(lan);
  // hanging lantern over the table
  const lg2=new THREE.Group(); lg2.position.set(X+TX+.05,TOP+3.45,Z+TZ); root.add(lg2);
  const chain=new THREE.Mesh(new THREE.BoxGeometry(.02,.8,.02),iron); chain.position.y=-.4; lg2.add(chain);
  const lcap=new THREE.Mesh(new THREE.ConeGeometry(.14,.14,6),iron); lcap.position.y=-.85; lg2.add(lcap);
  const lbody=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,.24,6,1,true),new THREE.MeshBasicMaterial({color:new THREE.Color(2.4,1.5,.6),fog:false,side:THREE.DoubleSide})); lbody.position.y=-1.04; lg2.add(lbody);
  const lbase=new THREE.Mesh(new THREE.CylinderGeometry(.12,.1,.04,6),iron); lbase.position.y=-1.17; lg2.add(lbase);
  for(let k=0;k<6;k++){const a=k/6*TAU; const p=new THREE.Mesh(new THREE.BoxGeometry(.015,.25,.015),iron); p.position.set(Math.cos(a)*.1,-1.04,Math.sin(a)*.1); lg2.add(p);}
  const lhalo=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:col('#ffb060'),transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending})); lhalo.scale.set(1.2,1.2,1); lhalo.position.y=-1.04; lg2.add(lhalo);
  const mkS=(hex,sz,op)=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.flame,color:col(hex),transparent:true,opacity:op,depthWrite:false,blending:THREE.AdditiveBlending})); s.scale.set(sz,sz,1); root.add(s); return s;};
  const flames=[]; for(let i=0;i<4;i++){const s=mkS(i%2?'#ffb24a':'#ff7a2a',.5,.9); s.userData={dz:(i-1.5)*.16,ph:i*1.7}; flames.push(s);}
  const fireHalo=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:col('#ff8a3a'),transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending}));
  fireHalo.scale.set(2.2,1.6,1); fireHalo.position.set(X+fx0,TOP+F+.45,Z+HZ); root.add(fireHalo);
  const candleF=mkS('#ffd08a',.16,1); candleF.position.copy(CS.candle);
  // small additive spark pool (hearth sparks, chest sparkles)
  const sparks=[]; for(let i=0;i<26;i++){const s=mkS('#ffc070',.06,0); s.visible=false; s.userData={life:0,t:0,v:new THREE.Vector3()}; sparks.push(s);}
  const spawnSpark=(x,y,z,vx,vy,vz,life,hex,size)=>{const s=sparks.find(s=>!s.visible); if(!s)return; s.visible=true; s.position.set(x,y,z);
    const u=s.userData; u.t=0; u.life=life; u.v.set(vx,vy,vz); u.size=size||.06; s.material.color.copy(col(hex||'#ffc070'));};
  let smoke=null; if(G.ink&&G.ink.emitter)smoke=G.ink.emitter({pos:new THREE.Vector3(X+Wd/2-1.05,TOP+8.75,Z+.9)},{rate:2.2,radius:.3,size:[.6,2.2],life:[2.5,4.5],rise:.9,drift:.35,trail:0,alpha:.16,color:'#9a8f86'});
  Object.assign(CS,{fire,lan,flames,fireHalo,candleF,sparks,spawnSpark,smoke,lhalo,lbody,fx0,HZ,ind:0,sparkAcc:0,lanG:lg2});
}
function easeOut(t){t=clamp(t,0,1);return 1-Math.pow(1-t,3);}
function openDoor(){
  if(W.cottage.doorOpen)return; W.cottage.doorOpen=true; CS.doorT=0;
  const i=G.boxColliders.indexOf(CS.doorBox); if(i>=0)G.boxColliders.splice(i,1);
  // the open leaf lies against the inside of the north wall, west of the opening
  const X=COT.x,Z=COT.z,dx0=COT.doorX-COT.doorW/2;
  G.addBoxCollider({x:X+dx0-.02,z:Z-COT.iz+.78,hw:.08,hd:.75,yaw:0,y0:TOP-1,y1:TOP+3});
  G.emit('cottage:door',{open:true});
}
function openChest(){
  if(W.cottage.chestOpen)return; W.cottage.chestOpen=true; CS.lidT=0; CS.folded.visible=true;
  G.emit('chest:open',{pos:new THREE.Vector3(W.cottage.chest.x,W.cottage.chest.y,W.cottage.chest.z)});
}
function takeCloak(){
  if(CS.taken)return; CS.taken=true; CS.folded.visible=false;
  const c=G.items.cloak=G.items.cloak||{owned:false};
  const had=c.owned; c.owned=true;
  if(had)return;
  G.emit('cloak:found');
  try{G.ui.toast('Your Old Coat','Jump again in the air to flutter · hold jump while falling to glide');}catch(e){}
  try{G.ui.say('Your old coat. Deep violet wool, with the gold leaves still stitched along the hem. Seven years in a chest, and somebody has kept it mended. You pull it on and turn up the hood. It still fits. When you turn, the hem lifts and fills like a sail: hold jump while you fall, and it will carry you on the wind.');}catch(e){}
}
function updateCottage(dt){
  if(!CS.hinge)return;
  const t=G.time, P=G.player&&G.player.pos;
  // door swing
  if(W.cottage.doorOpen){ if(CS.doorT>=0&&CS.doorT<1.2)CS.doorT+=dt; const k=CS.doorT<0?1:easeOut(CS.doorT/1.1);
    CS.hinge.rotation.y=-1.6*k+Math.sin(Math.min(1,Math.max(0,CS.doorT)/1.1)*PI*3)*.05*(1-k); }
  // a loaded save: chest already empty
  if(G.items.cloak&&G.items.cloak.owned&&!CS.taken){W.cottage.chestOpen=true; CS.taken=true; CS.lidT=9; CS.folded.visible=false;}
  // chest lid + glow
  if(CS.lidT>=0){
    if(CS.lidT<9)CS.lidT+=dt;
    const lt=CS.lidT, k=easeOut(lt/.75);
    CS.lid.rotation.x=1.72*k-Math.sin(clamp((lt-.55)/.35,0,1)*PI)*.08;
    const g=lt>=9?0:clamp((lt-.15)/.4,0,1)*(1-clamp((lt-1.4)/2.2,0,1));
    CS.glow.material.opacity=g; CS.glow.scale.setScalar(1.3+g*.5+Math.sin(t*6)*.05);
    CS.shaft.material.opacity=g*.32; CS.shaft.scale.set(1+g*.2,.6+g*.6,.6);
    if(g>.05&&Math.random()<dt*45){const c=CS.chest.position;
      CS.spawnSpark(c.x+(Math.random()-.5)*.7,c.y+.5,c.z+(Math.random()-.5)*.4,(Math.random()-.5)*.3,.8+Math.random()*.9,(Math.random()-.5)*.3,1+Math.random()*.6,Math.random()<.35?'#c4a0ff':'#ffe2a0',.07);}
    if(lt>1.05&&lt<9&&!CS.taken)takeCloak();
  }
  // indoor factor
  const inside=!!(P&&W.cottage.near(P)), nearby=P?Math.hypot(P.x-COT.x,P.z-COT.z)<26:false;
  CS.ind=U.damp(CS.ind,inside?1:0,3,dt||0);
  W.cottage.indoor=CS.ind;
  // fire flicker
  const fl=.82+Math.sin(t*11.3)*.07+Math.sin(t*17.1+1.3)*.05+Math.sin(t*5.3)*.06;
  CS.fire.intensity=nearby?2.6*fl:0; CS.lan.intensity=nearby?1.15*(.95+Math.sin(t*9.7)*.03):0;
  for(const s of CS.flames){const u=s.userData; const h=.42+.14*Math.sin(t*9+u.ph)+.06*Math.sin(t*23+u.ph*2);
    s.position.set(COT.x+CS.fx0-.02,TOP+COT.floor+.18+h*.45,COT.z+CS.HZ+u.dz+Math.sin(t*3+u.ph)*.03); s.scale.set(.32+h*.25,h*1.05,1); s.material.opacity=.75+.2*Math.sin(t*13+u.ph);}
  CS.fireHalo.material.opacity=.38*fl; CS.candleF.scale.set(.1+.015*Math.sin(t*15),.17+.02*Math.sin(t*11),1);
  CS.lanG.rotation.z=Math.sin(t*.7)*.025;
  if(nearby){CS.sparkAcc+=dt*3.5; while(CS.sparkAcc>=1){CS.sparkAcc-=1; CS.spawnSpark(COT.x+CS.fx0+(Math.random()-.5)*.25,TOP+COT.floor+.25,COT.z+CS.HZ+(Math.random()-.5)*.5,(Math.random()-.5)*.25,.7+Math.random()*.7,(Math.random()-.5)*.25,.9+Math.random()*.7,'#ffb050',.05);}}
  for(const s of CS.sparks){ if(!s.visible)continue; const u=s.userData; u.t+=dt; if(u.t>=u.life){s.visible=false;continue;}
    const k=u.t/u.life; s.position.addScaledVector(u.v,dt); u.v.x+=Math.sin(t*4+u.life*9)*dt*.3; s.material.opacity=Math.sin(k*PI)*(.6+.4*Math.sin(t*30+u.life*40)); s.scale.setScalar(u.size*(1-k*.4)); }
  if(CS.smoke)CS.smoke.intensity=1-clamp(G.atmo.dark,0,1);
}
/* keep the third-person camera inside the cottage walls while the player is in (or in the doorway) */
const _cd=new THREE.Vector3(), _cp=new THREE.Vector3();
function cotSolid(x,y,z){
  const lx=x-COT.x, lz=z-COT.z, m=.22;
  if(Math.abs(lx)>COT.ox+.25||Math.abs(lz)>COT.oz+.25)return false;          // outside the building
  if(y>TOP+4.15)return true;                                                  // ceiling / roof
  if(Math.abs(lx)<COT.ix-m&&Math.abs(lz)<COT.iz-m)return false;               // in the room
  if(Math.abs(lx-COT.doorX)<COT.doorW/2-.12&&y<TOP+COT.floor+COT.doorH-.1&&lz<0)return false; // door gap
  return true;
}
G.cameraConstrainers.push((cam,target)=>{
  const P=G.player&&G.player.pos; if(!P||!W.cottage.near(P))return;
  _cd.copy(cam).sub(target); const L=_cd.length(); if(L<1e-4)return;
  let ok=0; const N=28;
  for(let i=1;i<=N;i++){const s=i/N; _cp.copy(target).addScaledVector(_cd,s); if(cotSolid(_cp.x,_cp.y,_cp.z))break; ok=s;}
  if(ok<1)cam.copy(target).addScaledVector(_cd,Math.max(ok,.12/L));
});

/* =====================================================================
   HEADLAND: apron, keeper's cottage, alchemy shed, fence, bench
   ===================================================================== */
function buildHeadland(){
  const r=rnd(2718);
  // lighthouse apron: cobbled disc radius 9 at exactly y=42 + kerb
  const L=LM.lighthouse;
  const ct=TEX.cobble.clone(); ct.needsUpdate=true; ct.repeat.set(4,4);
  const apron=new THREE.Mesh(new THREE.CircleGeometry(9,48).rotateX(-PI/2),G.toon('#b4aca0',{map:ct,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  apron.position.set(L.x,TOP+.02,L.z); apron.receiveShadow=true; apron.name='apron'; root.add(apron);
  const mats=W._mats, kit=new Kit();
  for(let i=0;i<40;i++){const a=i/40*TAU; kit.box('stone',1.35,.28,.55,L.x+Math.cos(a)*9.1,TOP+.08,L.z+Math.sin(a)*9.1,-a+PI/2,0,0,col('#a39c90'));}
  // cobbled trail on the plateau
  const cob=new Tiled(new THREE.CylinderGeometry(.42,.48,.12,6),G.toon('#ffffff',{vertexColors:false}),{});
  const cobC=[col('#9a958c'),col('#827d74'),col('#aaa398')];
  const plPath=[[171,0],[160,1],[148,3],[135,2],[130,10],[123,17]];
  for(let i=0;i<plPath.length-1;i++){const [ax,az]=plPath[i],[bx,bz]=plPath[i+1],Ls=Math.hypot(bx-ax,bz-az);
    for(let s=0;s<Ls*3.2;s++){const t=r(),w=(r()-.5)*2.6,nx=-(bz-az)/Ls,nz=(bx-ax)/Ls,x=ax+(bx-ax)*t+nx*w,z=az+(bz-az)*t+nz*w;
      if(Math.hypot(x-L.x,z-L.z)<9.6)continue; const y=gh(x,z); if(y<41.9)continue;
      cob.add(mat4(x,y+.01,z,0,r()*3,0,.6+r()*.5,1,.6+r()*.5),cobC[Math.floor(r()*3)]);}}
  for(let s=0;s<40;s++){const t=r(),x=158+(r()-.5)*2.2,z=lerp(3,20,t);cob.add(mat4(x,TOP+.01,z,0,r()*3,0,.6+r()*.4,1,.6+r()*.4),cobC[Math.floor(r()*3)]);}
  cob.build(root);

  /* ---- keeper's cottage: crooked & welcoming, walk-in (see buildCottage) ---- */
  const C0=LM.cottage, Wd=COT.Wd, Dp=COT.Dp;
  buildCottage(kit,r);

  /* ---- alchemy shed ---- */
  const S0=LM.shed;
  kit.frame=mat4(S0.x,TOP,S0.z,0,.15,0);
  kit.box('stone',4.4,.5,3.4,0,0,0,0,0,0,col('#9d968a'));
  kit.box('timber',4,2.4,3,0,1.4,0,0,0,0,col('#9d7a5c'));
  kit.box('slate',4.8,.18,3.9,0,2.95,0,-.28,0,0);
  kit.box('timber',1,2,.12,-.9,1.2,-1.55,0,0,0,col('#6f4a30'));
  kit.add('ether',UNITBOX,mat4(.9,1.7,-1.53,0,0,0,.7,.5,.05));
  kit.box('timber',.85,.08,.08,.9,1.7,-1.58); kit.box('timber',.08,.6,.08,.9,1.7,-1.58);
  // workbench + bottles outside
  kit.box('timber',1.8,.12,.7,2.9,.95,-.6,0,0,0,col('#a07a58')); for(const s of [-1,1])kit.box('timber',.1,.95,.6,2.9+s*.8,.47,-.6);
  const bottle=new THREE.CylinderGeometry(.06,.09,.28,6);
  for(let k=0;k<5;k++){const rv=r(); if(k===0||k===4)kit.add(k%2?'ether':'glass',bottle,mat4(2.3+k*.3,1.15,-.6+(rv-.5)*.3));} // alchemy.js dresses the middle of this bench (keep r() sequence)
  kit.frame=new THREE.Matrix4();
  G.addBoxCollider({x:S0.x,z:S0.z,hw:2.3,hd:1.8,yaw:.15,y0:TOP-2,y1:TOP+4}); G.addCollider({x:S0.x+2.9*Math.cos(.15)-(-.6)*Math.sin(.15),z:S0.z-2.9*Math.sin(.15)-.6*Math.cos(.15),r:.8});

  /* ---- picket fence around the cottage garden (gate on the path) ---- */
  const fenceLines=[[[149,15.5],[156.6,15.5]],[[159.4,15.5],[167,15.5]],[[149,15.5],[149,29.5]],[[167,15.5],[167,29.5]],[[149,29.5],[153,29.5]],[[163,29.5],[167,29.5]]];
  const picket=new THREE.BoxGeometry(.11,1,.05);
  for(const [[ax,az],[bx,bz]] of fenceLines){const L2=Math.hypot(bx-ax,bz-az),yaw=Math.atan2(-(bz-az),bx-ax),n=Math.round(L2/.24);
    for(let s=0;s<=n;s++){const t=s/n,x=ax+(bx-ax)*t,z=az+(bz-az)*t,lean=(vnoise(x*.4,z*.4)-.5)*.12;
      kit.add('paint',picket,mat4(x,TOP+.5,z,0,yaw,lean,1,.9+(s%2)*.12,1));}
    for(const y of [.35,.78])kit.box('paint',L2,.08,.05,(ax+bx)/2,TOP+y,(az+bz)/2+.04,yaw);
    G.addBoxCollider({x:(ax+bx)/2,z:(az+bz)/2,hw:L2/2,hd:.12,yaw,y0:TOP-1,y1:TOP+1.05});}
  // gate posts
  for(const gx of [156.5,159.5])kit.box('timber',.2,1.4,.2,gx,TOP+.7,15.5);
  // bench facing the sea
  kit.frame=mat4(176,TOP,34,0,PI,0);
  kit.box('timber',2,.1,.5,0,.5,0,0,0,0,col('#8a6a4c')); kit.box('timber',2,.45,.08,0,.82,.24,-.15,0,0,col('#8a6a4c'));
  for(const s of [-1,1])kit.box('stone',.3,.5,.45,s*.8,.24,0);
  kit.frame=new THREE.Matrix4(); G.addCollider({x:176,z:34,r:1.1,y1:TOP+1.1,noStand:true}); // low: the camera can look over it at someone sitting
  // sit on it (playtest 2026-11-07): the seat faces the sea and the tide flats (+z)
  { const seat=new THREE.Vector3(176,TOP+.5,34); let saidSit=false;
    G.interact.add({pos:seat,radius:1.9,priority:1,label:'Sit',enabled:()=>!(G.player&&G.player.sitting),
      use:()=>{ if(G.player.sit&&G.player.sit({x:176,z:34.12,yaw:0})&&!saidSit){ saidSit=true;
        try{ G.ui.say('You sit a while. The sea breathes against the stacks below, and the tide slides in and out over the flats.'); }catch(e){} } }}); }
  // garden flower beds + bushes inside the fence
  const fg=root; const bedMat=G.toon('#ffffff',{vertexColors:true});
  const bed=[]; for(let k=0;k<26;k++){const x=150+r()*16,z=16.5+r()*3.5; if(Math.abs(x-158)<1.6)continue; bed.push({g:blob(.35+r()*.25,0,k,.3),m:mat4(x,TOP+.1,z,0,0,0,1,.7,1),c:col(r()<.5?'#7a55b8':'#d9d0e6')});}
  for(let k=0;k<10;k++){const bx=C0.x-Wd/2-.6+r()*(Wd+1.2),gc=r()<.6?'#4a6a3a':'#8a62c8'; if(Math.abs(bx-(C0.x+COT.doorX))<1.4)continue; bed.push({g:blob(.5,0,k+50,.3),m:mat4(bx,TOP+.25,C0.z-Dp/2-.55,0,0,0,1,.8,.8),c:col(gc)});}
  const bedMesh=new THREE.Mesh(mergeParts(bed),bedMat); bedMesh.castShadow=true; bedMesh.receiveShadow=true; fg.add(bedMesh);
  mats.plaster=mats.plaster||G.toon('#ffffff',{vertexColors:true}); mats.plaster.color.copy(col('#e3d8c2'));
  mats.metal=G.toon('#2a2526',{vertexColors:true});
  mats.paint=G.toon('#ffffff',{vertexColors:true}); mats.paint.color.copy(col('#cfc8b8'));
  mats.glow=new THREE.MeshBasicMaterial({color:new THREE.Color(2.6,1.45,.5),fog:true});
  mats.flame=new THREE.MeshBasicMaterial({color:new THREE.Color(3.2,1.9,.7),fog:true});
  mats.ether=new THREE.MeshBasicMaterial({color:new THREE.Color(1.1,.55,2.4),fog:true});
  mats.glass=G.toon('#7fa39a',{vertexColors:true,emissive:'#20302c'});
  kit.build(mats,root,{stone:.45,slate:.55,timber:.7});
}

/* ---------- THE WRECK (Story agent): Rowan's boat on the rocks of the south beach, where a new game starts ----------
   Self-contained: a landmark (LM.wreck, LM.wreckStart: flow.js begins a new game there), one merged vertex-coloured mesh
   (rocks, both halves of the hull, ribs, the mast and yard, rope, crates, the sea-bag) and a few colliders.
   Built by its own system right after the world (order 1), so world.js's init is untouched. */
const WRECK={x:84,z:69.5};
LM.wreck=LP(WRECK.x,WRECK.z);
LM.wreckStart=LP(71,64.2,{yaw:1.8});
KEEP.push({x:79,z:66,r:9},{x:72,z:63.5,r:3});
function buildWreck(){
  const r=rnd(7311), parts=[], hull=[], H=(x,z)=>height(x,z);   // hull[]: the broken boat itself (boat.js hides it once Rowan patches her)
  const wood=col('#94704f'), wood2=col('#5a4231'), wet=col('#3d2f27'), paint=col('#40606e'), paint2=col('#8c4a3a'), weed=col('#3f5230');
  const rk=col('#6a6f80'), rk2=col('#4c5262'), canvas=col('#b9ab8c'), canvas2=col('#8e8268'), rope=col('#a08a5e');
  const plank=(p,n,o,base,band)=>{ o.copy(base).lerp(wood2,.2+.2*Math.sin(p.y*9+vnoise(p.x*.8,p.z*.8)*3));
    if(band&&p.y>band-.18)o.lerp(paint,.85); if(p.y<0)o.lerp(wet,.5); if(p.y<-.2)o.lerp(weed,.35); };
  // rocks: a low reef at the waterline, the bow half wedged on top
  const rocks=[[86.5,70.5,2.1],[84.2,72.4,1.6],[88.6,68.6,1.5],[83.2,69.4,1.1],[87.4,73.2,1.3],[89.8,71.4,1.0],[81.6,71.2,.8],[85.6,67.6,.9]];
  for(const [x,z,s] of rocks){ const g=new THREE.DodecahedronGeometry(1,1), P=g.attributes.position;
    for(let i=0;i<P.count;i++){_v.fromBufferAttribute(P,i); const k=.78+vnoise(_v.x*2+x,_v.y*2+_v.z*1.7+z)*.45; P.setXYZ(i,_v.x*k,_v.y*k,_v.z*k);}
    g.computeVertexNormals();
    parts.push({g,m:mat4(x,H(x,z)+s*.25,z,r()*3,r()*3,r()*3,s*1.25,s*(.7+r()*.3),s),
      c:(p,n,o)=>{ o.copy(rk2).lerp(rk,vnoise(p.x*3,p.z*3+p.y*2)); if(p.y<.35)o.lerp(wet,.55); if(n.y>.5&&p.y>.6)o.lerp(weed,.3); }});
    G.addCollider({x,z,r:s*1.05,y0:-6,y1:H(x,z)+s*1.05}); }
  // a hull half: the lower half of a tapered cylinder, open at the broken end, ragged along the break
  function hullHalf(L,seed){
    const g=new THREE.CylinderGeometry(1.55,1.55,L,16,10,true,PI,PI); g.rotateZ(PI/2); // axis along x, open side up
    const P=g.attributes.position, rr=rnd(seed);
    const rag=[]; for(let k=0;k<17;k++)rag.push(rr()*.7);
    for(let i=0;i<P.count;i++){ const hx=P.getX(i), t=Math.min(1,Math.max(0,(hx+L/2)/L));               // t: 0 at the break, 1 at the bow / stern
      const w=Math.max(.05,1-Math.pow(t,2.2)*.92), y=P.getY(i), z=P.getZ(i);
      const a=Math.atan2(z,-y), ai=Math.min(16,Math.max(0,Math.round((a/PI+.5)*16)));
      const x2=t<.02?hx+rag[ai]:hx;                                                  // the break: planks sprung at different lengths
      P.setXYZ(i,x2,y*.72*(1-.2*t*t)+.38*t*t,z*w); }
    g.computeVertexNormals(); return g;
  }
  // the bow half: up on the reef, heeled hard over, nose in the air
  const bx=85.6, bz=70.4, by=H(bx,bz)+1.7;
  hull.push({g:hullHalf(5.6,3),m:mat4(bx,by,bz,.55,2.35,.42),c:(p,n,o)=>plank(p,n,o,wood,by+.15)});
  // the stern half: dragged up onto the sand by the tide, on its side
  const sx=79.6, sz=66.4, sy=H(sx,sz)+1.15;
  hull.push({g:hullHalf(4.8,9),m:mat4(sx,sy,sz,-.62,-.85,-.18),c:(p,n,o)=>plank(p,n,o,wood,sy+.05)});
  // a transom board and the tiller lying by the stern
  hull.push({g:new THREE.BoxGeometry(1.5,.9,.08),m:mat4(77.2,H(77.2,65.6)+.32,65.6,-.2,.6,1.15),c:(p,n,o)=>o.copy(paint2).lerp(wood2,vnoise(p.x*4,p.y*4)*.6)});
  hull.push({g:new THREE.CylinderGeometry(.05,.07,1.6,6),m:mat4(76.4,H(76.4,64.2)+.06,64.2,PI/2,0,.9),c:wood2});
  // ribs: three bare frames standing out of the sand between the halves
  for(let k=0;k<3;k++){ const x=82.2+k*.9, z=68.2+k*.5, s=1-k*.12;
    const g=new THREE.TorusGeometry(1.05*s,.07,4,10,PI*.85);
    hull.push({g,m:mat4(x,H(x,z)-.35,z,0,.75+k*.08,PI+.25+k*.1),c:(p,n,o)=>o.copy(wood2).lerp(wet,p.y<.3?.6:.1)}); }
  // the mast, snapped at the step, lying from the reef up the beach; the yard across it; a rag of sail
  const m0=V3(83.6,H(83.6,68.4)+.35,68.4), m1=V3(75.2,H(75.2,67.8)+.18,67.8), mm=m0.clone().add(m1).multiplyScalar(.5), mL=m0.distanceTo(m1);
  hull.push({g:new THREE.CylinderGeometry(.11,.15,mL,8),m:new THREE.Matrix4().compose(mm,new THREE.Quaternion().setFromUnitVectors(V3(0,1,0),m1.clone().sub(m0).normalize()),V3(1,1,1)),c:(p,n,o)=>o.copy(wood).lerp(wood2,.4)});
  hull.push({g:new THREE.CylinderGeometry(.07,.07,3.4,6),m:mat4(77.8,H(77.8,67.9)+.32,67.9,PI/2,0,.35),c:wood2});
  { const g=new THREE.PlaneGeometry(2.6,1.6,6,4), P=g.attributes.position;
    for(let i=0;i<P.count;i++){ const x=P.getX(i), y=P.getY(i); P.setZ(i,Math.sin(x*2.1+y*1.3)*.12+(vnoise(x*2,y*2)-.5)*.25); }
    g.computeVertexNormals(); const x=77.4, z=68.9;
    hull.push({g,m:mat4(x,H(x,z)+.12,z,-PI/2+.12,0,.5),c:(p,n,o)=>o.copy(canvas).lerp(canvas2,vnoise(p.x*2,p.z*2)).lerp(wet,p.y<.12?.4:0)}); }
  // rope: a coil on the sand and a line trailing from the stern into the wash
  { const x=74.2, z=62.6, y=H(x,z)+.05;
    for(let k=0;k<3;k++)parts.push({g:new THREE.TorusGeometry(.32-k*.05,.035,4,14),m:mat4(x+k*.02,y+k*.05,z,PI/2,0,0),c:rope});
    const pts=[V3(79.2,H(79.2,66.9)+.4,66.9),V3(80.4,H(80.4,68.2)+.05,68.2),V3(81.2,H(81.2,69.6)+.02,69.6),V3(80.6,H(80.6,71.4)+.02,71.4)];
    hull.push({g:new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),14,.035,4,false),c:rope}); }
  // crates: one whole, one burst, one half under the sand
  const crates=[[76.2,63.4,.62,.3],[78.4,61.4,.55,1.1],[73.2,65.6,.6,-.5]];
  crates.forEach(([x,z,s,yaw],k)=>{ const y=H(x,z)+(k===2?s*.15:s*.48);
    parts.push({g:new THREE.BoxGeometry(s*1.3,s,s),m:mat4(x,y,z,k===1?.25:0,yaw,k===2?.32:0),c:(p,n,o)=>{ o.copy(wood).lerp(wood2,.5+.5*Math.sin((p.y-y)*14)); if(Math.abs(n.y)>.9)o.lerp(wood2,.3); }});
    if(k===1){ for(let j=0;j<3;j++){ const px=x+.7+j*.35, pz=z-.4+j*.5; parts.push({g:new THREE.BoxGeometry(.9,.04,.16),m:mat4(px,H(px,pz)+.03,pz,0,r()*3,0),c:wood}); } }
    G.addCollider({x,z,r:s*.75,y0:-3,y1:y+s*.5}); });
  // the sea-bag: canvas, cinched at the neck with a lanyard, lying where the water left it, near where you wake
  { const x=72.5, z=62.3, y=H(x,z);
    const g=blob(.42,2,11,.12);
    parts.push({g,m:mat4(x,y+.3,z,0,.4,PI/2-.15,1.55,.85,.95),c:(p,n,o)=>{ o.copy(canvas).lerp(canvas2,vnoise(p.x*3,p.z*3+p.y)); if(p.y<y+.12)o.lerp(wet,.5); }});
    parts.push({g:new THREE.TorusGeometry(.17,.04,4,10),m:mat4(x+.6*Math.cos(.4),y+.34,z-.6*Math.sin(.4),0,.4+PI/2,0),c:rope});
    parts.push({g:new THREE.ConeGeometry(.18,.3,7),m:mat4(x+.78*Math.cos(.4),y+.34,z-.78*Math.sin(.4),0,.4,-PI/2),c:canvas2}); }
  const mesh=new THREE.Mesh(mergeParts(parts),G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide}));
  mesh.castShadow=true; mesh.receiveShadow=true; mesh.name='wreck'; root.add(mesh);
  const hullMesh=new THREE.Mesh(mergeParts(hull),mesh.material); hullMesh.castShadow=true; hullMesh.receiveShadow=true; hullMesh.name='wreckHull'; root.add(hullMesh);
  // the hull halves are solid: a pair of circles along each
  const hullCol=[]; for(const [x,z,rad,top] of [[85.2,70.2,1.2,2.4],[86.6,71.4,1,2.6],[79.8,66.2,1.15,1.6],[78.6,66.9,.9,1.4]]){ const c={x,z,r:rad,y0:-6,y1:H(x,z)+top}; G.addCollider(c); hullCol.push(c); }
  W.wreck={mesh,hull:hullMesh,hullColliders:hullCol,parts:parts.length+hull.length};
}
function V3(x,y,z){return new THREE.Vector3(x,y,z);}
G.system('wreck',{order:1,modes:'always',init(){ try{ buildWreck(); }catch(e){ console.error('wreck',e); } }});

/* ---------- sea stacks & spires ---------- */
function buildStacks(){
  const r=rnd(6060), parts=[], out=[];
  const spots=[[150,-64,9,34],[176,-60,6,26],[204,-70,8,40],[128,-58,5,18],[238,-14,10,38],[246,22,6,28],[230,48,7,22],
    [192,64,8,36],[160,68,6,24],[218,62,5,30],[136,60,7,20],[40,-104,6,16],[-60,-104,8,22],[-150,-104,6,18],
    [-256,24,9,30],[-250,-44,6,20],[-140,108,7,20],[-40,106,5,14],[262,-48,7,46],[266,60,9,52],[30,112,6,18],[-220,90,6,24]];
  const rk=col('#6a6f80'),rk2=col('#4c5262'),moss=col('#5d6a4a'),bird=col('#ddd8cc');
  for(const [x0,z0,rad,hh] of spots){
    let x=x0,z=z0,k=0; while(height(x,z)>-3&&k<20){x*=1.04;z*=1.04;k++;}
    const segs=Math.ceil(hh/7); let y=-4, rr=rad;
    for(let s=0;s<segs;s++){const sh=hh/segs+2, rt=rr*(.6+r()*.25);
      const g=new THREE.CylinderGeometry(rt,rr,sh,9,3); const P=g.attributes.position;
      for(let i=0;i<P.count;i++){_v.fromBufferAttribute(P,i);const a=Math.atan2(_v.z,_v.x),k2=1+(vnoise(a*2.2+s*3+x,_v.y*.4+z)-.5)*.6;P.setXYZ(i,_v.x*k2,_v.y,_v.z*k2);}
      g.computeVertexNormals();
      const ox=(r()-.5)*rr*.4,oz=(r()-.5)*rr*.4;
      parts.push({g,m:mat4(x+ox,y+sh/2,z+oz,(r()-.5)*.1,r()*3,(r()-.5)*.1),c:(p,n,o)=>{o.copy(rk2).lerp(rk,Math.sin(p.y*.9+vnoise(p.x,p.z)*4)*.5+.5);
        if(n.y>.5)o.lerp(moss,.8); if(p.y>hh-6&&n.y>.2)o.lerp(bird,.25);}});
      y+=sh-2; rr=rt;}
    out.push({x,z,r:rad*.9});
  }
  const m=new THREE.Mesh(mergeParts(parts),G.toon('#ffffff',{vertexColors:true})); m.receiveShadow=true; m.name='seaStacks'; root.add(m);
  return out;
}

/* ---------- glowing mushrooms ---------- */
function buildMushrooms(){
  const r=rnd(8080);
  const stemMat=G.toon('#d9cfe6',{vertexColors:true,emissive:'#3a2a55',emissiveIntensity:.6});
  capMat=new THREE.MeshBasicMaterial({vertexColors:true,fog:true});
  const glowMat=new THREE.SpriteMaterial({map:G.tex.soft,color:col('#a070ff'),transparent:true,opacity:.75,depthWrite:false,blending:THREE.AdditiveBlending});
  W.mushroomMeshes=[];
  LM.mushrooms.forEach((M,idx)=>{
    const grp=new THREE.Group(); grp.position.set(M.x,gh(M.x,M.z),M.z); grp.name='mushroom'+idx;
    const stems=[],caps=[]; const n=4+Math.floor(r()*4);
    for(let i=0;i<n;i++){const a=r()*TAU,d=i?.2+r()*.55:0,s=i?.5+r()*.6:1.1,x=Math.cos(a)*d,z=Math.sin(a)*d,hh=.32*s,tilt=(r()-.5)*.4;
      stems.push({g:new THREE.CylinderGeometry(.045*s,.065*s,hh,6),m:mat4(x,hh/2,z,tilt,0,tilt*.5),c:col('#ffffff')});
      const cap=new THREE.SphereGeometry(.17*s,10,5,0,TAU,0,PI/2); cap.scale(1,.62,1);
      const cc=new THREE.Color(1.25+r()*.4,.5+r()*.25,2.6+r()*.5);
      caps.push({g:cap,m:mat4(x+Math.sin(tilt*.5)*hh*.4,hh-.01,z+Math.sin(tilt)*hh*.4,tilt,0,tilt*.5),c:(p,nn,o)=>o.copy(cc).multiplyScalar(.75+nn.y*.35)});}
    const sm=new THREE.Mesh(mergeParts(stems),stemMat), cm=new THREE.Mesh(mergeParts(caps),capMat);
    sm.castShadow=false; grp.add(sm,cm);
    const glow=new THREE.Sprite(glowMat); glow.scale.set(2.2,1.6,1); glow.position.y=.35; grp.add(glow);
    root.add(grp); W.mushroomMeshes.push(grp);
  });
}

/* ---------- grass that follows the focus ---------- */
const GR={C:8,N:11,K:190,R:40,slots:[],fx:1e9,fz:1e9,queue:[],geo:null,mat:null,level:null};
/* per quality: tufts per 8 m cell (ring radius stays 40 m), parting, wind detail */
const GRQ={saver:{K:100,push:false,lq:true},balanced:{K:200,push:true,lq:false},high:{K:280,push:true,lq:false}}; // tufts are 4 blades (were 3)
function buildGrassGeo(){
  // tuft of 4 bent blades of mixed height and lean. Vertex colour is a shade factor (roots -> bright tips); the instance
  // colour is the ground's. Roots start just under the surface and only a little darker than the ground, so a tuft grows
  // out of the turf instead of reading as a model pushed into it (playtest 2026-11-07).
  const pos=[],colA=[],idx=[]; const base=new THREE.Color(.7,.74,.66),mid=new THREE.Color(.9,.94,.84),tip=new THREE.Color(1.22,1.24,.98);
  const B=[[.4,.06,.5,.2],[2.1,.13,.62,.27],[3.9,.1,.44,.16],[5.3,.15,.57,.3]]; // angle, offset from centre, height, lean
  for(const [a,off,h,lean] of B){const ca=Math.cos(a),sa=Math.sin(a),w=.042;
    const o=pos.length/3,ox=ca*off,oz=sa*off,px=-sa*w,pz=ca*w;
    pos.push(ox-px,-.06,oz-pz, ox+px,-.06,oz+pz, ox-px*.6+ca*lean*.5,h*.5,oz-pz*.6+sa*lean*.5, ox+px*.6+ca*lean*.5,h*.5,oz+pz*.6+sa*lean*.5, ox+ca*lean,h,oz+sa*lean);
    for(const c of [base,base,mid,mid,tip])colA.push(c.r,c.g,c.b);
    idx.push(o,o+1,o+2,o+1,o+3,o+2,o+2,o+3,o+4);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_,i)=>i%3===1?1:0),3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colA,3)); g.setIndex(idx);
  return g;
}
function grassMaterial(){
  const mat=G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide});
  mat.onBeforeCompile=sh=>{Object.assign(sh.uniforms,{uTime:SH.time,uFocus:SH.focus,uWind:SH.wind,uPush:SH.push,uSunW:SH.sunW,uSunCol:SH.sunCol});
    sh.vertexShader=WIND_GLSL+`
uniform vec3 uFocus;uniform vec3 uSunW;uniform vec4 uPush[${PUSHN}];
varying vec4 vGr; // x tip height 0..1, y gust brightening, z sun-through, w far (blend to ground)
`+sh.vertexShader
      .replace('#include <begin_vertex>',`#include <begin_vertex>
  vec2 ip0=vec2(instanceMatrix[3][0],instanceMatrix[3][2]);
  float fd=length(ip0-uFocus.xz); transformed*=1.-smoothstep(${(GR.R-12).toFixed(1)},${GR.R.toFixed(1)},fd);
  vec3 cw0=(modelMatrix*vec4(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2],1.)).xyz; // tufts the camera sits in (low aim, slopes) shrink away
  transformed*=smoothstep(.5,1.7,length(cw0-cameraPosition));`)
      .replace('#include <project_vertex>',`vec4 mvPosition=vec4(transformed,1.);
  mvPosition=instanceMatrix*mvPosition;
  vec2 ip=vec2(instanceMatrix[3][0],instanceMatrix[3][2]);
  float hh=max(transformed.y,0.), k=hh*hh*1.6;
  #ifdef BQ_LQ
  float gust=0.;
  float w=sin(uTime*1.7+ip.x*.23+ip.y*.17)*.5+.35;
  vec2 bend=uWind.xy*w*k*.38;
  #else
  float gust=bqGust(ip);
  float w=sin(uTime*1.7+ip.x*.23+ip.y*.17)*.38+sin(uTime*2.9+ip.x*.61-ip.y*.43)*.16+.22+gust*1.15;
  vec2 bend=uWind.xy*w*k*.42;
  #endif
  float press=0.;
  #ifdef BQ_PUSH
  for(int i=0;i<${PUSHN};i++){ vec4 P=uPush[i]; vec2 d=ip-P.xy; float L=length(d);
    float f=(1.-smoothstep(P.z*.3,P.z,L))*P.w; bend+=d/max(L,.05)*f*k*2.2; press=max(press,f); }
  #endif
  mvPosition.xz+=bend; mvPosition.y-=dot(bend,bend)*.9+press*k*.25;
  // look: world colour patches, ground-matched far ring, gusts brighten, sun shining through the blades
  float fr=smoothstep(${(GR.R-22).toFixed(1)},${(GR.R-6).toFixed(1)},fd);
  float pa=sin(ip.x*.083+sin(ip.y*.061)*2.2)*sin(ip.y*.071+sin(ip.x*.047)*2.)*.5+.5;
  vec3 patchT=mix(vec3(.74,1.,.72),vec3(1.04,1.03,.76),smoothstep(.3,.85,pa));
  #ifdef USE_INSTANCING_COLOR
  vColor.rgb=mix(vColor.rgb*patchT,instanceColor,fr);
  #endif
  vec3 wp=(modelMatrix*mvPosition).xyz;
  float th=clamp(hh/.62,0.,1.);
  float back=pow(max(dot(normalize(wp-cameraPosition),uSunW),0.),3.);
  vGr=vec4(th,gust*th,th*(back*.85+.12),fr);
  mvPosition=modelViewMatrix*mvPosition;
  gl_Position=projectionMatrix*mvPosition;`);
    sh.fragmentShader='uniform vec3 uSunCol;\nvarying vec4 vGr;\n'+sh.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
  totalEmissiveRadiance+=diffuseColor.rgb*(uSunCol*vGr.z*.5+vec3(.26,.28,.18)*vGr.y)*(1.-vGr.w);`);
  };
  return mat;
}
function applyGrassQuality(){
  const q=GRQ[G.quality.level]||GRQ.balanced, m=GR.mat;
  const d={}; if(q.lq)d.BQ_LQ=''; if(q.push)d.BQ_PUSH='';
  m.defines=d; m.customProgramCacheKey=()=>'bqGrass'+(q.lq?'q':'')+(q.push?'p':''); m.needsUpdate=true;
  for(const fm of FOL.mats){ fm.defines=q.lq?{BQ_LQ:''}:{}; fm.needsUpdate=true; }
  GR.push=q.push;
  if(grass&&GR.K===q.K)return;
  GR.K=q.K;
  if(grass){ root.remove(grass); grass.dispose(); }
  const total=GR.N*GR.N*GR.K;
  grass=new THREE.InstancedMesh(GR.geo,m,total);
  grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grass.setColorAt(0,_c.setRGB(1,1,1)); grass.instanceColor.setUsage(THREE.DynamicDrawUsage);
  grass.frustumCulled=false; grass.receiveShadow=true; grass.castShadow=false; grass.name='grass';
  grass.instanceMatrix.array.fill(0);
  GR.slots.length=0; for(let i=0;i<GR.N*GR.N;i++)GR.slots.push({cx:1e9,cz:1e9});
  GR.fx=GR.fz=1e9; GR.queue.length=0;
  root.add(grass);
  W.stats.grassTufts=total;
}
function buildGrass(){
  GR.geo=buildGrassGeo(); GR.mat=grassMaterial();
  applyGrassQuality();
  G.on('quality',()=>{ applyGrassQuality(); updateGrass(true); });
}
/* grass parting: the Traveler + the nearest live monsters */
const _pm=[];
function updatePushers(){
  const P=SH.push.value; let n=0;
  if(GR.push){
    const pl=G.player, f=G.focus;
    if(pl&&pl.pos){ P[n++].set(pl.pos.x,pl.pos.z,1.15,1); }
    const ms=G.monsters&&G.monsters.list;
    if(ms){ _pm.length=0;
      for(const m of ms){ if(!m||!m.alive||m.dying||!m.pos||m.cave)continue; const d=(m.pos.x-f.x)**2+(m.pos.z-f.z)**2; if(d<38*38)_pm.push([d,m]); }
      _pm.sort((a,b)=>a[0]-b[0]);
      for(const [,m] of _pm){ if(n>=PUSHN)break; const r=(m.hb&&m.hb.radius)||.6; P[n++].set(m.pos.x,m.pos.z,r*1.8+.7,1); } }
  }
  for(;n<PUSHN;n++)P[n].w=0;
}
function fillGrassSlot(si,cx,cz){
  const s=GR.slots[si]; s.cx=cx; s.cz=cz;
  const arr=grass.instanceMatrix.array, carr=grass.instanceColor.array, K=GR.K, CS=GR.C;
  let seed=((cx*73856093)^(cz*19349663))>>>0; const rr=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const L=LM.lighthouse;
  for(let k=0;k<K;k++){
    const o=(si*K+k)*16, x=cx*CS+rr()*CS, z=cz*CS+rr()*CS, rot=rr()*TAU, sc=rr(), keep=rr();
    let ok=true; const h=gh(x,z);
    if(h<1.4)ok=false;
    else{
      const fx=x-GX0,fz=z-GZ0;
      const sl=Math.hypot(gh(x+.7,z)-gh(x-.7,z),gh(x,z+.7)-gh(x,z-.7))/1.4;
      if(sl>.85)ok=false;
      else if(x<-60&&keep>lerp(1,.32,smooth(-60,-80,x)))ok=false;
      else if(h<2.4&&keep>.25)ok=false;
      else if(pathDist(x,z)<1.5)ok=false;
      else if((x-L.x)*(x-L.x)+(z-L.z)*(z-L.z)<92)ok=false;
      else if(x>140&&inFoot(x,z,.2))ok=false;
      else if(x<0&&x>-40&&inFoot(x,z,0))ok=false;
      if(ok){const gi=Math.round(fx),gj=Math.round(fz),a=(gj*GNX+gi)*3;
        _c.setRGB(HC[a],HC[a+1],HC[a+2]).multiplyScalar(.92+sc*.2);
        carr[(si*K+k)*3]=_c.r;carr[(si*K+k)*3+1]=_c.g;carr[(si*K+k)*3+2]=_c.b;}
    }
    if(!ok){for(let q=0;q<16;q++)arr[o+q]=0;continue;}
    const s=.75+sc*.75, sy=s*(.8+keep*.5)*(h>41?.85:1), c=Math.cos(rot)*s, n=Math.sin(rot)*s;
    arr[o]=c;arr[o+1]=0;arr[o+2]=-n;arr[o+3]=0; arr[o+4]=0;arr[o+5]=sy;arr[o+6]=0;arr[o+7]=0;
    arr[o+8]=n;arr[o+9]=0;arr[o+10]=c;arr[o+11]=0; arr[o+12]=x;arr[o+13]=h-.04;arr[o+14]=z;arr[o+15]=1;
  }
}
function updateGrass(all){
  const f=G.focus, C=GR.C, N=GR.N, half=(N-1)/2;
  SH.focus.value.copy(f);
  const fcx=Math.floor(f.x/C), fcz=Math.floor(f.z/C);
  if(fcx!==GR.fx||fcz!==GR.fz){GR.fx=fcx;GR.fz=fcz;GR.queue.length=0;
    const want=[];
    for(let i=0;i<N;i++)for(let j=0;j<N;j++){
      const cx=fcx-half+(((i-(fcx-half))%N)+N)%N, cz=fcz-half+(((j-(fcz-half))%N)+N)%N, si=j*N+i, s=GR.slots[si];
      if(s.cx!==cx||s.cz!==cz)want.push([si,cx,cz,Math.abs(cx-fcx)+Math.abs(cz-fcz)]);}
    want.sort((a,b)=>a[3]-b[3]); GR.queue=want;}
  if(!GR.queue.length)return;
  const n=all?GR.queue.length:Math.min(GR.queue.length,4);
  for(let i=0;i<n;i++){const q=GR.queue.shift(); fillGrassSlot(q[0],q[1],q[2]);}
  grass.instanceMatrix.needsUpdate=true; grass.instanceColor.needsUpdate=true;
}

/* ---------- drifting ground mist ---------- */
function buildMist(){
  const r=rnd(1212);
  for(let i=0;i<34;i++){
    const forest=i<20, x=forest?-220+r()*160:-50+r()*160, z=-80+r()*160, h=gh(x,z); if(h<1)continue;
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:col('#b8b0d0'),transparent:true,opacity:0,depthWrite:false,fog:true}));
    const k=14+r()*18; sp.scale.set(k,k*.35,1); sp.position.set(x,h+1.2+r()*1.5,z);
    sp.userData={base:forest?.32:.2,vx:(r()-.5)*.5,vz:(r()-.5)*.3,x0:x,z0:z}; sp.renderOrder=2; root.add(sp); mists.push(sp);
  }
}

/* ---------- stand on things: the tops of rocks, standing stones, field walls and ruin walls are floors ----------
   (playtest 2026-11-07: "you should be able to get up on these"). Any circle collider at least .6 m across or box
   collider with a real top (y1) becomes a floor once you are above it — jump, double jump or glide onto it. Only for
   callers that pass a height (feet, rays); a bare floorAt(x,z) still means the ground, so nothing spawns on a rock. */
function installStandOn(){
  // a top you could plausibly see and reach: 0.3–3.4 m above the ground it stands on (not tall building shells, not
  // the undercroft's buried rooms, not slivers like doors and fences)
  const ok=c=>{ if(c._stand==null){ const g=height(c.x,c.z), top=c.y1-g; c._stand=c.y1<1e8&&top>.3&&top<3.4&&(c.y0<-1e8||c.y1-c.y0<6)&&(c.r==null?Math.min(c.hw,c.hd)>=.2:c.r>=.6); } return c._stand&&!c.noStand; };
  G.floorProviders.push((x,z,y)=>{
    if(y==null||y>1e8)return null;
    let best=null;
    for(const c of G.collidersNear(x,z)){
      if(c.y1>y+.05||!ok(c))continue;
      const dx=x-c.x, dz=z-c.z; if(dx*dx+dz*dz>(c.r*.82)*(c.r*.82))continue;
      if(best==null||c.y1>best)best=c.y1;
    }
    for(const b of G.boxColliders){
      if(b.y1>y+.05||!ok(b))continue;
      const cs=Math.cos(b.yaw||0),sn=Math.sin(b.yaw||0), lx=(x-b.x)*cs-(z-b.z)*sn, lz=(x-b.x)*sn+(z-b.z)*cs;
      if(Math.abs(lx)>b.hw||Math.abs(lz)>b.hd)continue;
      if(best==null||b.y1>best)best=b.y1;
    }
    return best;
  });
}

/* ---------- airborne cliff-climb guard (core already blocks steep steps when grounded) ---------- */
function installConstrainer(){
  G.constrainers.push((prev,next,y,radius,who)=>{
    const dx=next.x-prev.x,dz=next.z-prev.z,run=Math.hypot(dx,dz); if(run<1e-5)return false;
    const hp=height(prev.x,prev.z),hn=height(next.x,next.z);
    if(hn<=hp+.02||y>hn+2||(hn-hp)/run<=1.35)return false;
    if(y>hp+40)return false; // someone high up (lamp room etc.)
    // slide along the face
    const h1=height(next.x,prev.z); if(Math.abs(dx)>1e-5&&(h1<=hp+.02||(h1-hp)/Math.abs(dx)<=1.35)){next.z=prev.z;return true;}
    const h2=height(prev.x,next.z); if(Math.abs(dz)>1e-5&&(h2<=hp+.02||(h2-hp)/Math.abs(dz)<=1.35)){next.x=prev.x;return true;}
    next.x=prev.x;next.z=prev.z;return true;
  });
}

/* ---------- performance: G.perf + dynamic resolution ----------
   G.perf = {fps, frameMs, pixelRatio, scale, auto}. If the average frame time stays over budget (60 fps, or 30 with the
   Saver cap) for ~2 s, the render resolution steps down (1 -> .92 -> .83 -> .75 of the preset's pixel ratio); after a few
   seconds with headroom it steps back up (waiting longer each time an up-step had to be undone, so it doesn't flicker).
   Off with ?headless (tests draw on demand) or G.perf.auto=false. Changing quality resets it to the preset. */
const PF=G.perf={fps:0,frameMs:0,pixelRatio:G.renderer.getPixelRatio(),scale:1,auto:!G.headless};
const PSTEPS=[1,.917,.833,.75];
const PS={last:0,acc:0,n:0,ema:16.7,over:0,under:0,upWait:4,lastUp:-1e9,cool:2,idx:0,base:G.renderer.getPixelRatio(),comp:null};
(function hookComposer(){ // core owns the composer; follow it through the prototype so the bloom targets resize with us
  const EC=THREE.EffectComposer; if(!EC||!EC.prototype||EC.prototype._bqPerf)return;
  const sp=EC.prototype.setPixelRatio, rd=EC.prototype.render;
  EC.prototype.setPixelRatio=function(pr){ return sp.call(this,pr*PF.scale); };
  EC.prototype.render=function(d){ PS.comp=this; return rd.call(this,d); };
  EC.prototype._bqPerf=true; })();
function perfApply(){
  const R=G.renderer; PF.scale=PSTEPS[PS.idx];
  R.setPixelRatio(PS.base*PF.scale);
  if(PS.comp)PS.comp.setPixelRatio(PS.base); // patched: x scale
  PF.pixelRatio=R.getPixelRatio();
}
G.on('quality',()=>{ PS.idx=0; PF.scale=1; PS.base=G.renderer.getPixelRatio(); perfApply(); PS.over=PS.under=0; PS.cool=2; PS.upWait=4; });
function perfUpdate(){
  const now=performance.now(), dt=now-PS.last;
  if(dt<2)return; // extra substeps within one frame (devtools time speed)
  PS.last=now;
  if(dt>2500||document.hidden){ PS.over=PS.under=0; return; } // background tab / long stall
  PS.ema+=(Math.min(dt,250)-PS.ema)*.08; PS.acc+=dt; PS.n++;
  if(PS.acc>=500){ PF.fps=Math.round(PS.n*1000/PS.acc); PF.frameMs=Math.round(PS.acc/PS.n*10)/10; PS.acc=PS.n=0; }
  if(!PF.auto)return;
  const sec=dt/1000; if(PS.cool>0){ PS.cool-=sec; return; }
  const target=1000/(G.quality.cap||60);
  if(PS.ema>target*1.12){ PS.over+=sec; PS.under=0; }
  else if(PS.ema<target*1.04){ PS.under+=sec; PS.over=0; }
  else { PS.over=Math.max(0,PS.over-sec); PS.under=Math.max(0,PS.under-sec); }
  if(PS.over>2&&PS.idx<PSTEPS.length-1){
    if(now-PS.lastUp<8000)PS.upWait=Math.min(PS.upWait*2,64); // the last step up didn't hold
    PS.idx++; perfApply(); PS.over=PS.under=0; PS.cool=1.5;
  }else if(PS.under>PS.upWait&&PS.idx>0){ PS.idx--; perfApply(); PS.lastUp=now; PS.over=PS.under=0; PS.cool=1.5; }
}

W.stats={};
G.system('world',{order:0,modes:'always',
  init(){
    const t0=performance.now();
    makeTextures(); buildGrids();
    G.scene.add(root);
    buildTerrain();
    buildSky(); const stacks=buildStacks(); buildSea(stacks); setupLights();
    buildForest(); buildRocks(); buildResistingTree();
    buildFlowers(); buildMoorStructures(); buildTreeTiles(); bakeTreeAO(); buildHeadland(); buildMushrooms();
    buildGrass(); updateGrass(true); buildMist(); installStandOn();
    HEMI0.c.copy(G.lights.hemi.color); HEMI0.g.copy(G.lights.hemi.groundColor);
    W.stats.buildMs=Math.round(performance.now()-t0);
    if(G.debug)console.log('[world] built',JSON.stringify(W.stats));
  },
  update(dt){
    perfUpdate();
    const A=G.atmo, cam=G.camera, f=G.focus, t=G.time;
    SH.time.value=t;
    // sky & sea follow the camera
    sky.position.copy(cam.position); stars.position.copy(cam.position);
    sea.position.set(Math.round(cam.position.x/13)*13,W.tide||0,Math.round(cam.position.z/13)*13); // tide hook
    // atmosphere
    const dark=clamp(A.dark,0,1), cured=clamp(A.cured,0,1), ff=smooth(-55,-90,f.x)*(1-smooth(30,40,f.y));
    const fog=G.scene.fog;
    fog.color.copy(FOG.base).lerp(FOG.forest,ff).lerp(FOG.cured,cured*.55).lerp(FOG.dark,dark);
    fog.density=lerp(lerp(.0105,.02,ff)*lerp(1,.55,cured),.09,dark);
    if(G.scene.background&&G.scene.background.isColor)G.scene.background.copy(fog.color);
    skyU.uHor.value.copy(FOG.base).lerp(FOG.cured,cured*.55); skyU.uDark.value=dark; skyU.uCured.value=cured;
    stars.material.opacity=.55*(1-dark)*(1-cured*.3); if(stars.userData.dust)stars.userData.dust.material.opacity=.32*(1-dark)*(1-cured*.3);
    const L=G.lights, lf=1-dark*.975;
    L.hemi.intensity=lerp(.78,.95,cured)*lf; L.sun.intensity=lerp(.95,1.05,cured)*(1-dark);
    seaU.uLight.value=lf;
    // keeper's cottage: fire, door, chest; warm the ambient while the player is indoors
    updateCottage(dt);
    { const ind=W.cottage.indoor||0;
      L.hemi.color.copy(HEMI0.c).lerp(HEMI0.ci,ind*.7); L.hemi.groundColor.copy(HEMI0.g).lerp(HEMI0.gi,ind*.7);
      L.hemi.intensity*=1-ind*.35; L.sun.intensity*=1-ind*.6; }
    // landscape shading: sun direction in view space + warm rim / translucency tints that follow the sun's strength
    SH.sunW.value.copy(L.sunDir); SH.sunV.value.copy(L.sunDir).transformDirection(cam.matrixWorldInverse);
    { const si=L.sun.intensity; SH.rim.value.copy(RIM0).multiplyScalar(si*1.15); SH.sunCol.value.copy(SUNC0).multiplyScalar(si); }
    // grass
    if(grass){ updateGrass(false); updatePushers(); }
    // mushrooms pulse, tree glow breathes
    if(capMat){const p=.85+Math.sin(t*1.6)*.15; capMat.color.setRGB(p,p,p);}
    if(treeLight)treeLight.intensity=2+Math.sin(t*.9)*.35;
    for(const s of mists){const u=s.userData; s.position.x=u.x0+Math.sin(t*.05+u.vx*10)*12; s.position.z=u.z0+Math.cos(t*.04+u.vz*10)*8;
      s.material.opacity=u.base*(1-cured*.75)*(1-dark);}
    for(const s of smokes){const u=s.userData,ph=(t*.12+u.ph)%1; s.position.set(u.x+ph*2.5,u.y+ph*6,u.z+ph*1.2); const k=.8+ph*3; s.scale.set(k,k,1);
      s.material.opacity=Math.sin(ph*PI)*.32*(1-dark);}
  }
});
})();

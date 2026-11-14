/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — northisle_life.js
   The north island, slice 4 (Heath's option 1: make it feel alive). Dressing only: nothing here is walkable, nothing
   here blocks the path, and nothing is built or drawn until the camera comes near the island.
     - wind-flattened grass and heather (instanced, swaying), thicker in the sheltered hollows, sparse on the crag;
     - a few dozen stunted, salt-killed trees leaning away from the sea (one merged mesh; a thin trunk collider only
       when well off the path);
     - wrack along the high-tide strand in the cove, kelp beds floating offshore (they ride the tide);
     - tide pools in the rocks along the shore, with a little glint;
     - gulls and cormorants on the sea stacks, the reef and the cliff tops: idle bobbing, the odd one wheeling off and
       back; a colony goes up when Rowan comes within ~12 m and settles again once he's gone;
     - low fog drifting through the hollows (soft billboards, one draw call; js/fog.js owns the real fog);
     - the fire's colour on everything near the tower: cold green while the lure burns, warm gold after the ending where
       his father lives ('lived'), nothing after 'died' (G.northFire.state.outcome, as north.js and northisle.js read it).
   Placement is seeded (stable screenshots and tests) and stays out of G.isleKeepClear (northisle_story.js's sites),
   the path, the landing beach, the boat's mooring, the tower apron and the sea-cave mouth.
   API: G.northIsleLife = { built, visible, birds, debug:{ scare(id), counts(), show(on), build(), placed(), tint(),
        colonies, clear(x,z,pad) } }
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth,vnoise}=U;
const col=U.col;
G.isleKeepClear=G.isleKeepClear||[];

const SHOW_R=300, BUILD_R=340;              // drawn within 300 m of the island's middle; built the first time you come near
const SCARE_R=12, SETTLE_R=17;
const WIND={x:.92,z:-.38};                  // the prevailing wind, off the sea from the west-south-west
{ const l=Math.hypot(WIND.x,WIND.z); WIND.x/=l; WIND.z/=l; }
const TINT_R=40;
const TINTS={lure:col('#52e89a'),lived:col('#ffd27a')};

const L={built:false,building:false,force:null,root:null,mode:'unset',colonies:[],birds:[],placed:null,
  grass:null,heather:null,trees:null,wrack:null,kelp:null,pools:null,birdMesh:null,fogMesh:null,wash:null,
  uTime:{value:0},uTint:{value:new THREE.Color(0,0,0)},uTintK:{value:0},idleT:6,said:{},stats:{}};
const NI=()=>G.northIsle;

/* ================================================================ 1. WHERE THINGS MAY GO */
let ZONES=[];   // {x,z,r,why}: the lead's places plus northisle_story.js's sites (read at build time)
function zones(){
  const N=NI(), out=[], b=N.cove.beach, m=N.cove.moor, T=N.tower;
  out.push({x:b.x,z:b.z,r:6.5,why:'landing beach'});
  out.push({x:m.x,z:m.z,r:7,why:'mooring'});
  out.push({x:T.x,z:T.z,r:10.5,why:'tower apron'});
  const M=G.northCave&&G.northCave.mouth;
  if(M){ out.push({x:M.x,z:M.z,r:6,why:'cave mouth'}); if(M.face)out.push({x:M.face.x,z:M.face.z,r:5,why:'cave mouth'}); }
  else { const a=N.cove.mouthA, R=N.shoreR(a); out.push({x:N.centre.x+Math.cos(a)*R,z:N.centre.z+Math.sin(a)*R,r:7,why:'cave mouth'}); }
  for(const c of G.isleKeepClear){ if(c&&isFinite(c.x)&&isFinite(c.z)&&isFinite(c.r))out.push({x:+c.x,z:+c.z,r:+c.r,why:c.why||'story'}); }
  return out;
}
/** true if a thing of radius pad at (x,z) is clear of every zone and the path (pathPad: extra clearance from the path) */
function clear(x,z,pad,pathPad){
  pad=pad||0; const N=NI();
  for(const c of ZONES){ const dx=x-c.x, dz=z-c.z, r=c.r+pad; if(dx*dx+dz*dz<r*r)return false; }
  if(N.pathDist(x,z)<N.pathW+pad+(pathPad==null?.35:pathPad))return false;
  return true;
}
function inRock(x,z,pad){ for(const r of NI().rocks){ if(r.kind==='stack')continue; const dx=x-r.x, dz=z-r.z, rr=r.r*.85+(pad||0); if(dx*dx+dz*dz<rr*rr&&r.top>-.5)return true; } return false; }

/* the island sampled on a 2 m grid: height, slope, and how sheltered (a hollow: lower than the ground round it) */
const GS=2; let GRID=null;
function buildGrid(){
  const N=NI(), B=N.box, nx=Math.ceil((B.x1-B.x0)/GS)+1, nz=Math.ceil((B.z1-B.z0)/GS)+1, h=new Float32Array(nx*nz);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)h[j*nx+i]=N.height(B.x0+i*GS,B.z0+j*GS);
  // summed-area table → mean height within ±5 cells (10 m)
  const S=new Float64Array((nx+1)*(nz+1));
  for(let j=0;j<nz;j++){ let row=0; for(let i=0;i<nx;i++){ row+=Math.max(h[j*nx+i],0); S[(j+1)*(nx+1)+i+1]=S[j*(nx+1)+i+1]+row; } }
  const K=5, hol=new Float32Array(nx*nz);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){ const i0=Math.max(0,i-K),i1=Math.min(nx-1,i+K),j0=Math.max(0,j-K),j1=Math.min(nz-1,j+K);
    const sum=S[(j1+1)*(nx+1)+i1+1]-S[j0*(nx+1)+i1+1]-S[(j1+1)*(nx+1)+i0]+S[j0*(nx+1)+i0], n=(i1-i0+1)*(j1-j0+1);
    hol[j*nx+i]=sum/n-Math.max(h[j*nx+i],0); }
  GRID={nx,nz,h,hol,x0:B.x0,z0:B.z0};
}
function hollow(x,z){ const g=GRID; const fi=clamp((x-g.x0)/GS,0,g.nx-1.001), fj=clamp((z-g.z0)/GS,0,g.nz-1.001), i=fi|0, j=fj|0, a=fi-i, b=fj-j, n=g.nx;
  return lerp(lerp(g.hol[j*n+i],g.hol[j*n+i+1],a),lerp(g.hol[(j+1)*n+i],g.hol[(j+1)*n+i+1],a),b); }
function slope(x,z){ const H=NI().height, e=.6; return Math.hypot(H(x+e,z)-H(x-e,z),H(x,z+e)-H(x,z-e))/(2*e); }
function inland(x,z){ const N=NI(), C=N.centre, a=Math.atan2(z-C.z,x-C.x); return N.shoreR(a)-Math.hypot(x-C.x,z-C.z); }
const towerD=(x,z)=>{ const T=NI().tower; return Math.hypot(x-T.x,z-T.z); };
const tintW=(x,z)=>1-smooth(9,TINT_R,towerD(x,z));
/** where the waterline is along bearing a (height crosses lvl), searching outward */
function shoreAt(a,lvl){ const N=NI(), C=N.centre; let lo=20, hi=110; for(let it=0;it<24;it++){ const m=(lo+hi)/2; if(N.height(C.x+Math.cos(a)*m,C.z+Math.sin(a)*m)>lvl)lo=m; else hi=m; } return (lo+hi)/2; }
/** a direction leaning away from the sea: inland, pulled toward the prevailing wind */
function leanDir(x,z){ const C=NI().centre; let ix=C.x-x, iz=C.z-z; const l=Math.hypot(ix,iz)||1; ix/=l; iz/=l; let lx=ix*.55+WIND.x*.45, lz=iz*.55+WIND.z*.45; const k=Math.hypot(lx,lz)||1; return {x:lx/k,z:lz/k}; }

/* ================================================================ 2. MATERIAL HELPERS */
function swayMat(o){
  const m=G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide});
  const amp=(o&&o.amp)||.1;
  m.onBeforeCompile=sh=>{ sh.uniforms.uTime=L.uTime;
    sh.vertexShader='uniform float uTime;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
  { vec2 ip=vec2(instanceMatrix[3][0],instanceMatrix[3][2]); float hk=max(position.y,0.)*2.4;
    float w=sin(uTime*2.1+ip.x*.31+ip.y*.23)*.55+sin(uTime*3.7+ip.x*.71-ip.y*.4)*.22+.25;
    transformed.x+=w*hk*${amp.toFixed(3)}; transformed.z+=sin(uTime*2.9+ip.y*.5)*hk*${(amp*.35).toFixed(3)}; }`); };
  m.customProgramCacheKey=()=>'nlSway'+amp;
  return m;
}
const _m=new THREE.Matrix4(), _q=new THREE.Quaternion(), _p=new THREE.Vector3(), _s=new THREE.Vector3(), _e=new THREE.Euler(), _c=new THREE.Color(), _up=new THREE.Vector3(0,1,0), _d=new THREE.Vector3();
const mat4=(x,y,z,rx,ry,rz,sx,sy,sz)=>new THREE.Matrix4().compose(_p.set(x,y,z),_q.setFromEuler(_e.set(rx||0,ry||0,rz||0)),_s.set(sx==null?1:sx,sy==null?(sx==null?1:sx):sy,sz==null?(sx==null?1:sx):sz));

/* ================================================================ 3. GRASS AND HEATHER */
function tuftGeo(){
  // five long blades combed flat along local +x (the instance turns +x downwind)
  const pos=[], cl=[], idx=[], r=U.rng(311), base=[.62,.64,.55], mid=[.9,.92,.8], tip=[1.06,1.05,.9];
  for(let b=0;b<8;b++){ const sa=(r()-.5)*1.3, ox=(r()-.5)*.42, oz=(r()-.5)*.5, h=.22+r()*.22, lean=.32+r()*.28, w=.05+r()*.02;
    const dx=Math.cos(sa), dz=Math.sin(sa), px=-dz*w, pz=dx*w, o=pos.length/3;
    pos.push(ox-px,-.05,oz-pz, ox+px,-.05,oz+pz, ox+dx*lean*.45-px*.6,h*.62,oz+dz*lean*.45-pz*.6, ox+dx*lean*.45+px*.6,h*.62,oz+dz*lean*.45+pz*.6, ox+dx*lean,h,oz+dz*lean);
    for(const c of [base,base,mid,mid,tip])cl.push(c[0],c[1],c[2]);
    idx.push(o,o+1,o+2,o+1,o+3,o+2,o+2,o+3,o+4); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(pos.map((_,i)=>i%3===1?1:0),3)); g.setAttribute('color',new THREE.Float32BufferAttribute(cl,3)); g.setIndex(idx); return g;
}
function heatherGeo(){
  // a low woody cushion with stiff upright sprigs, purple at the tips
  const GE=G.world.geo, dk=col('#3e322d'), mid=col('#5b4a52'), top=col('#a7849f'), r=U.rng(4402);
  const cush=GE.mergeParts([{g:GE.blob(.24,0,1.3,.3),m:mat4(0,.02,0,0,0,0,1.15,.42,1),c:(p,n,o)=>o.copy(dk).lerp(mid,clamp(n.y,0,1)*.7)}]);
  const pos=[], cl=[];
  for(let b=0;b<9;b++){ const a=r()*TAU, d=Math.sqrt(r())*.24, ox=Math.cos(a)*d, oz=Math.sin(a)*d, h=.16+r()*.16, w=.035, la=r()*TAU, lx=Math.cos(la)*.05, lz=Math.sin(la)*.05, ca=Math.cos(a+1.3)*w, sa=Math.sin(a+1.3)*w;
    pos.push(ox-ca,0,oz-sa, ox+ca,0,oz+sa, ox+lx,h,oz+lz); cl.push(dk.r,dk.g,dk.b, dk.r,dk.g,dk.b, top.r,top.g,top.b); }
  const g=new THREE.BufferGeometry(), n0=cush.attributes.position.count, n=n0+pos.length/3;
  const P=new Float32Array(n*3), N=new Float32Array(n*3), Cc=new Float32Array(n*3);
  P.set(cush.attributes.position.array); N.set(cush.attributes.normal.array); Cc.set(cush.attributes.color.array);
  P.set(pos,n0*3); Cc.set(cl,n0*3); for(let i=n0;i<n;i++)N[i*3+1]=1;
  g.setAttribute('position',new THREE.BufferAttribute(P,3)); g.setAttribute('normal',new THREE.BufferAttribute(N,3)); g.setAttribute('color',new THREE.BufferAttribute(Cc,3));
  return g;
}
function buildPlants(root,placed){
  const N=NI(), B=N.box, r=U.rng(9021), gr=[], ht=[];
  const SP=.82;
  for(let z=B.z0;z<B.z1;z+=SP)for(let x=B.x0;x<B.x1;x+=SP){
    const px=x+r()*SP, pz=z+r()*SP, roll=r(), kind=r(), rot=r(), sc=r();
    const din=inland(px,pz); if(din<2.5)continue;
    const h=N.height(px,pz); if(h<1.9)continue;
    const sl=slope(px,pz); if(sl>1.05)continue;
    const dT=towerD(px,pz), ho=hollow(px,pz);
    let d=1.2*(1-smooth(.5,1.05,sl))*smooth(2.5,8,din)*lerp(.18,1,smooth(10,34,dT))*(.45+1.25*smooth(-.4,1.6,ho))*(.55+.9*vnoise(px*.09+11,pz*.09-3));
    if(N.coveK(px,pz)>.5&&h<5)d*=.35;   // the cove's dunes: only a little
    if(roll>d)continue;
    if(!clear(px,pz,.25,.25))continue;
    if(inRock(px,pz,.1))continue;
    // heather on the higher, drier ground; grass in the hollows and along the slopes
    const hk=clamp(.12+.45*smooth(.4,-.8,ho)+.35*(vnoise(px*.05-7,pz*.05+2)-.5),0,.75);
    (kind<hk?ht:gr).push([px,h,pz,rot,sc]);
  }
  // shuffle (seeded) so a lower instance count thins the whole island evenly (the Saver preset)
  const shuf=(a,s)=>{ const q=U.rng(s); for(let i=a.length-1;i>0;i--){ const j=Math.floor(q()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; };
  shuf(gr,77); shuf(ht,78);
  const grassC=[col('#66633f'),col('#79714a'),col('#525a3a'),col('#857c55')], heathC=[col('#c9b2c4'),col('#d6bccd'),col('#b8aa9a'),col('#dcc0d6')];
  const mk=(list,geo,mat,palette,name,scl)=>{
    const mesh=new THREE.InstancedMesh(geo,mat,Math.max(1,list.length)); mesh.name=name; mesh.frustumCulled=false; mesh.receiveShadow=true; mesh.castShadow=false;
    const base=new Float32Array(list.length*3), w=new Float32Array(list.length);
    list.forEach((p,i)=>{ const [x,y,z,rot,sc]=p; const ld=leanDir(x,z), yaw=Math.atan2(-ld.z,ld.x)+(rot-.5)*.8, s=scl[0]+sc*scl[1];
      mesh.setMatrixAt(i,mat4(x,y-.02,z,0,yaw,0,s,s*(.8+rot*.4),s));
      _c.copy(palette[Math.floor(vnoise(x*.13,z*.13)*palette.length*.999)]).lerp(palette[(i*7)%palette.length],.3).multiplyScalar(.85+sc*.3);
      base[i*3]=_c.r; base[i*3+1]=_c.g; base[i*3+2]=_c.b; w[i]=tintW(x,z); mesh.setColorAt(i,_c); });
    mesh.count=list.length; mesh.instanceMatrix.needsUpdate=true; if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.userData={base,w,full:list.length}; root.add(mesh); return mesh; };
  L.grass=mk(gr,tuftGeo(),swayMat({amp:.11}),grassC,'northLifeGrass',[1.15,.9]);
  L.heather=mk(ht,heatherGeo(),swayMat({amp:.04}),heathC,'northLifeHeather',[.9,.9]);
  placed.grass=gr.map(p=>[p[0],p[2]]); placed.heather=ht.map(p=>[p[0],p[2]]);
}

/* ================================================================ 4. SALT-KILLED TREES */
function buildTrees(root,placed){
  const N=NI(), C=N.centre, GE=G.world.geo, r=U.rng(5150), parts=[], spots=[];
  const bark=col('#7a746b'), bark2=col('#3a3530'), lichen=col('#6f7a58');
  for(let tries=0;tries<1400&&spots.length<28;tries++){
    const a=r()*TAU, d=Math.sqrt(r())*60, x=C.x+Math.cos(a)*d, z=C.z+Math.sin(a)*d, pk=r();
    const din=inland(x,z); if(din<6)continue;
    const h=N.height(x,z); if(h<3.5)continue; if(slope(x,z)>.55)continue;
    const dT=towerD(x,z); if(dT<16)continue;
    const want=.25+.75*smooth(-.2,1.4,hollow(x,z)); if(pk>want*smooth(16,30,dT)+.04)continue;
    if(!clear(x,z,2.6,2.2))continue; if(inRock(x,z,.6))continue;
    if(spots.some(s=>Math.hypot(s.x-x,s.z-z)<3.4))continue;
    spots.push({x,z,h});
  }
  const cfn=(y0,H)=>(p,n,o)=>{ const t=clamp((p.y-y0)/H,0,1); o.copy(bark2).lerp(bark,smooth(.0,.5,t)*.8+.2*vnoise(p.x*3.1,p.y*2.3+p.z*3.1)); if(n.y>.4&&vnoise(p.x*5,p.z*5+p.y)>.62)o.lerp(lichen,.5); };
  for(const s of spots){
    const H=1.8+r()*2.6, broken=r()<.22, Hh=broken?H*.55:H, ld=leanDir(s.x,s.z), yaw=Math.atan2(-ld.z,ld.x), lean=.55+r()*.5, seed=r()*10;
    const bend=t=>({x:lean*Hh*Math.pow(clamp(t,0,1),1.5)*.42+(vnoise(t*3+seed,seed)-.5)*.22, z:Math.sin(t*4.5+seed)*.07});
    const R0=.13+H*.045, tg=new THREE.CylinderGeometry(R0*.35,R0,Hh,6,6), P=tg.attributes.position;
    for(let i=0;i<P.count;i++){ const y=P.getY(i)+Hh/2, t=y/Hh, b=bend(t); P.setXYZ(i,P.getX(i)+b.x,y-.15,P.getZ(i)+b.z); }
    tg.computeVertexNormals();
    const M=mat4(s.x,s.h,s.z,0,yaw,0), y0=s.h-.15;
    parts.push({g:tg,m:M,c:cfn(y0,Hh)});
    // bare branches, flagged downwind (local +x), the windward side stripped
    const nb=broken?2:3+Math.floor(r()*3);
    for(let k=0;k<nb;k++){ const t=.4+r()*.55, b=bend(t), root=new THREE.Vector3(b.x,t*Hh-.15,b.z);
      const side=(r()-.5)*1.6, dir=new THREE.Vector3(.75+r()*.5,.25+r()*.55,side).normalize(), len=(.35+r()*.75)*Math.min(1.4,H/2.6);
      const bg=new THREE.CylinderGeometry(.018,.035+R0*.25,len,5,1); bg.translate(0,len/2,0);
      const bm=new THREE.Matrix4().compose(root,_q.setFromUnitVectors(_up,dir),_s.set(1,1,1));
      parts.push({g:bg,m:M.clone().multiply(bm),c:cfn(y0,Hh)});
      if(r()<.6){ const tip=root.clone().addScaledVector(dir,len*.7), d2=dir.clone().add(new THREE.Vector3((r()-.3)*.6,.4,(r()-.5)*.8)).normalize(), l2=len*.45;
        const tw=new THREE.CylinderGeometry(.01,.02,l2,4,1); tw.translate(0,l2/2,0);
        parts.push({g:tw,m:M.clone().multiply(new THREE.Matrix4().compose(tip,_q.setFromUnitVectors(_up,d2),_s.set(1,1,1))),c:cfn(y0,Hh)}); } }
    // a well-off-the-path tree gets a thin trunk collider (it never becomes a floor: too narrow)
    s.H=H; s.col=false;
    if(N.pathDist(s.x,s.z)>N.pathW+5&&clear(s.x,s.z,4,5)){ G.addCollider({x:s.x,z:s.z,r:.24,y0:s.h-1,y1:s.h+Hh*.7}); s.col=true; }
  }
  const g=GE.mergeParts(parts), cl=g.attributes.color, P=g.attributes.position, w=new Float32Array(P.count);
  for(let i=0;i<P.count;i++)w[i]=tintW(P.getX(i),P.getZ(i));
  const m=new THREE.Mesh(g,G.toon('#ffffff',{vertexColors:true})); m.name='northLifeTrees'; m.castShadow=true; m.receiveShadow=true;
  m.userData={base:Float32Array.from(cl.array),w}; root.add(m); L.trees=m;
  placed.trees=spots.map(s=>[s.x,s.z,+s.H.toFixed(2),s.col?1:0]);
}

/* ================================================================ 5. THE TIDELINE: WRACK, KELP, POOLS */
function ribbon(r,len,w,segs){ // a flat wiggly strip along local +x, y=0
  const pos=[], idx=[]; let ang=0, x=0, z=0;
  for(let i=0;i<=segs;i++){ const t=i/segs, ww=w*(1-t*.6); const nx=-Math.sin(ang), nz=Math.cos(ang);
    pos.push(x+nx*ww,0,z+nz*ww, x-nx*ww,0,z-nz*ww); ang+=(r()-.5)*1.1; x+=Math.cos(ang)*len/segs; z+=Math.sin(ang)*len/segs; }
  for(let i=0;i<segs;i++){ const a=i*2; idx.push(a,a+2,a+1,a+1,a+2,a+3); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx);
  g.setAttribute('normal',new THREE.Float32BufferAttribute(pos.map((_,i)=>i%3===1?1:0),3)); return g;
}
function buildShore(root,placed){
  const N=NI(), C=N.centre, GE=G.world.geo, r=U.rng(6606), parts=[], H=N.height;
  const wrC=[col('#3b3a22'),col('#4a4026'),col('#2f3420'),col('#55482a')], stone=col('#4c4e57'), stone2=col('#33343b');
  placed.wrack=[]; placed.kelp=[]; placed.pools=[];
  // wrack on the high-tide strand: the cove's sand and the shelf along to the cave
  for(let a=N.cove.mouthA+.25;a>.55;a-=.011){
    if(N.coveK(C.x+Math.cos(a)*50,C.z+Math.sin(a)*50)<.12&&Math.abs(U.angDiff(a,N.cove.mouthA))>.32)continue;
    const R=shoreAt(a,.22);
    for(let k=0;k<2;k++){ if(r()<.35)continue;
      const rr=R+(r()-.5)*1.6, x=C.x+Math.cos(a)*rr, z=C.z+Math.sin(a)*rr, h=H(x,z); if(h<-.15||h>.75)continue;
      if(!clear(x,z,.6,.4))continue;
      const g=ribbon(r,.5+r()*1.2,.07+r()*.08,4), P=g.attributes.position, yaw=a+PI/2+(r()-.5)*.9, cs=Math.cos(yaw), sn=Math.sin(yaw);
      for(let i=0;i<P.count;i++){ const lx=P.getX(i), lz=P.getZ(i), wx=x+lx*cs-lz*sn, wz=z+lx*sn+lz*cs; P.setXYZ(i,wx,H(wx,wz)+.035,wz); }
      parts.push({g,c:wrC[Math.floor(r()*wrC.length)].clone().multiplyScalar(.85+r()*.3)});
      if(r()<.25)parts.push({g:GE.blob(.14+r()*.1,0,r()*9,.35),m:mat4(x,h+.03,z,0,r()*3,0,1.4,.45,1),c:wrC[1]});
      placed.wrack.push([x,z]); } }
  // tide pools: low, nearly flat rock along the shore (not the cove's sand), with a rim of stones
  const pools=[];
  for(let tries=0;tries<2600&&pools.length<20;tries++){
    const a=r()*TAU, R=shoreAt(a,0)+(r()*7-4.5), x=C.x+Math.cos(a)*R, z=C.z+Math.sin(a)*R, h=H(x,z), pr=.45+r()*.65;
    if(h<-.85||h>.6)continue; if(N.coveK(x,z)>.45&&h>-.3)continue;
    if(slope(x,z)>.32)continue; if(!clear(x,z,pr+.6,.8))continue; if(pools.some(p=>Math.hypot(p.x-x,p.z-z)<p.r+pr+1.6))continue;
    let top=-9; for(let k=0;k<8;k++){ const aa=k/8*TAU; top=Math.max(top,H(x+Math.cos(aa)*pr,z+Math.sin(aa)*pr)); } top=Math.max(top,h)+.03;
    if(top-h>.22)continue;
    pools.push({x,z,r:pr,y:top,seed:r()*100});
  }
  // pool water: an irregular fan per pool, one mesh with its own shader (glint)
  const pp=[], pu=[], pi=[];
  for(const p of pools){ const o=pp.length/3, n=14; pp.push(p.x,p.y,p.z); pu.push(0,p.seed);
    for(let k=0;k<n;k++){ const aa=k/n*TAU, rr=p.r*(.78+.35*vnoise(Math.cos(aa)*2+p.seed,Math.sin(aa)*2)); pp.push(p.x+Math.cos(aa)*rr,p.y,p.z+Math.sin(aa)*rr); pu.push(1,p.seed); }
    for(let k=0;k<n;k++)pi.push(o,o+1+((k+1)%n),o+1+k);
    // the rim
    const ns=7+Math.floor(r()*5);
    for(let k=0;k<ns;k++){ const aa=k/ns*TAU+r()*.4, rr=p.r*(.95+r()*.25), sx=p.x+Math.cos(aa)*rr, sz=p.z+Math.sin(aa)*rr, s=.16+r()*.16;
      parts.push({g:GE.blob(s,0,r()*20,.3),m:mat4(sx,Math.max(H(sx,sz),p.y-.1)+s*.15,sz,r(),r()*3,r(),1.3,.6,1),c:(q,nn,oc)=>oc.copy(stone2).lerp(stone,vnoise(q.x*4,q.z*4)).lerp(wrC[2],nn.y>.5?.25:0)}); }
    placed.pools.push([p.x,p.z,p.r]); }
  if(pp.length){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pp,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(pu,2)); g.setIndex(pi); g.computeBoundingSphere();
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,side:THREE.DoubleSide,
      uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:{value:0}}]),
      vertexShader:`varying vec2 vUv; varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vec4 mvPosition=viewMatrix*w; gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
      fragmentShader:`uniform float uTime; varying vec2 vUv; varying vec3 vW;
#include <fog_pars_fragment>
float hs(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void main(){ float e=vUv.x; vec3 deep=vec3(.035,.06,.075), sh=vec3(.16,.2,.22), sky=vec3(.36,.33,.45);
  vec3 c=mix(deep,sh,smoothstep(.45,1.,e)); vec3 V=normalize(cameraPosition-vW); float fr=pow(1.-max(V.y,0.),3.); c=mix(c,sky,fr*.7+.08);
  vec2 cell=floor(vW.xz*7.); float h1=hs(cell+vUv.y), h2=hs(cell*1.7+3.1);
  float gl=step(.86,h1)*pow(max(0.,sin(uTime*(1.4+h2*2.2)+h1*40.)),24.)*(1.-smoothstep(.85,1.,e));
  c+=vec3(.42,.44,.46)*gl;
  gl_FragColor=vec4(c,mix(.82,.0,smoothstep(.8,1.,e))+gl*.2);
#include <fog_fragment>
}`});
    L.pools=new THREE.Mesh(g,mat); L.pools.name='northLifePools'; L.pools.renderOrder=1; root.add(L.pools); }
  const sm=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide})); sm.name='northLifeWrack'; sm.receiveShadow=true; root.add(sm); L.wrack=sm;
  // floating kelp beds offshore: by the reef and under the cliffs; they ride the tide (the mesh follows sea level)
  const kparts=[], beds=[];
  for(const rk of N.rocks){ if(rk.kind==='reef'||rk.kind==='stack')beds.push({x:rk.x,z:rk.z,r:rk.r+3}); }
  for(let k=0;k<10;k++){ const a=r()*TAU, R=shoreAt(a,0)+3+r()*4; beds.push({x:C.x+Math.cos(a)*R,z:C.z+Math.sin(a)*R,r:3}); }
  const kc=[col('#4d4a24'),col('#5f5428'),col('#3c4222')];
  for(const b of beds){ const n=5+Math.floor(r()*6);
    for(let k=0;k<n;k++){ const a=r()*TAU, d=b.r*(.6+r()*.7), x=b.x+Math.cos(a)*d, z=b.z+Math.sin(a)*d; if(H(x,z)>-1.6)continue; if(!clear(x,z,.8,1))continue;
      if(inRock(x,z,.3))continue;
      const g=ribbon(r,1+r()*1.8,.1+r()*.08,5); kparts.push({g,m:mat4(x,0,z,0,r()*TAU,0),c:kc[Math.floor(r()*kc.length)]});
      if(r()<.5)kparts.push({g:new THREE.SphereGeometry(.07,5,3),m:mat4(x,0,z,0,0,0,1,.5,1),c:kc[1]});
      placed.kelp.push([x,z]); } }
  if(kparts.length){ const km=new THREE.Mesh(GE.mergeParts(kparts),G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide})); km.name='northLifeKelp'; km.renderOrder=1; root.add(km); L.kelp=km; }
}

/* ================================================================ 6. BIRDS */
function birdGeo(){
  const GE=G.world.geo, white=col('#e9e6dd'), grey=col('#8d93a0'), dark=col('#2c2d33'), beak=col('#d9a43a');
  // local frame: +x forward, +y up, wings along ±z (spread: the flying pose; the shader folds them when perched)
  const body=GE.mergeParts([
    {g:new THREE.SphereGeometry(.13,8,6),m:mat4(0,0,0,0,0,0,1.9,.95,1),c:(p,n,o)=>o.copy(white).lerp(grey,smooth(-.02,.09,p.y)*.55)},
    {g:new THREE.SphereGeometry(.085,7,5),m:mat4(.22,.09,0),c:white},
    {g:new THREE.ConeGeometry(.025,.11,5),m:mat4(.32,.08,0,0,0,-PI/2),c:beak},
    {g:new THREE.ConeGeometry(.07,.2,4),m:mat4(-.27,.02,0,0,0,PI/2,1,1,.45),c:dark},
    {g:new THREE.CylinderGeometry(.012,.012,.12,3),m:mat4(-.01,-.15,.04),c:beak},{g:new THREE.CylinderGeometry(.012,.012,.12,3),m:mat4(-.01,-.15,-.04),c:beak}]);
  const wingC=(p,n,o)=>o.copy(grey).lerp(dark,smooth(.38,.6,Math.abs(p.z)));
  const wing=s=>{ const g=new THREE.BufferGeometry(), z1=.08*s, z2=.62*s;
    const pos=[.08,.02,z1, -.12,.02,z1, -.02,.02,z2, .1,.02,z1*1.5+(z2-z1)*.35, -.02,.02,z2, -.12,.02,z1]; g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute([0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0],3)); return g; };
  const wings=GE.mergeParts([{g:wing(1),c:wingC},{g:wing(-1),c:wingC}]);
  const n0=body.attributes.position.count, n1=wings.attributes.position.count, out=new THREE.BufferGeometry();
  for(const k of ['position','normal','color']){ const a=new Float32Array((n0+n1)*3); a.set(body.attributes[k].array,0); a.set(wings.attributes[k].array,n0*3); out.setAttribute(k,new THREE.BufferAttribute(a,3)); }
  const aw=new Float32Array(n0+n1); aw.fill(1,n0); out.setAttribute('aWing',new THREE.BufferAttribute(aw,1));
  out.computeBoundingSphere(); return out;
}
function birdMat(){
  const m=G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide});
  m.onBeforeCompile=sh=>{ sh.uniforms.uTime=L.uTime;
    sh.vertexShader='uniform float uTime;\nattribute float aWing;\nattribute vec4 aFly;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
  if(aWing>.5){ float sp=aFly.x, az=abs(transformed.z);
    transformed.z*=mix(.2,1.,sp); transformed.x-=az*(1.-sp)*.55; transformed.y+=(1.-sp)*.06;
    float fl=sin(uTime*aFly.z+aFly.y)*aFly.w; transformed.y+=az*mix(.2,1.,sp)*fl; }`); };
  m.customProgramCacheKey=()=>'nlBird';
  return m;
}
/** perches on the top of a rock: rays down onto the island's rock mesh */
const _ray=new THREE.Raycaster();
function rockPerches(rock,n,rr){
  const mesh=G.scene.getObjectByName('northRocks'), out=[]; if(!mesh)return out;
  mesh.updateMatrixWorld(true);
  for(let k=0;k<n*5&&out.length<n;k++){ const a=rr()*TAU, d=Math.sqrt(rr())*rock.r*.6, x=rock.x+Math.cos(a)*d, z=rock.z+Math.sin(a)*d;
    _ray.set(_p.set(x,rock.top+6,z),_d.set(0,-1,0)); _ray.far=14; const hit=_ray.intersectObject(mesh,false)[0];
    if(!hit||!hit.face)continue; const ny=hit.face.normal.clone().transformDirection(mesh.matrixWorld).y; if(ny<.55)continue;
    if(hit.point.y<.35)continue;
    if(out.some(q=>Math.hypot(q.x-hit.point.x,q.z-hit.point.z)<.65))continue;
    out.push({x:hit.point.x,y:hit.point.y,z:hit.point.z}); }
  return out;
}
/** perches along a cliff top: the lip where the cliff gives way to the moor */
function cliffPerches(a0,n){
  const N=NI(), C=N.centre, out=[];
  for(let k=0;k<n;k++){ const a=a0+(k-(n-1)/2)*.016, R=N.shoreR(a);
    let lip=null; for(let din=1;din<12;din+=.25){ const x=C.x+Math.cos(a)*(R-din), z=C.z+Math.sin(a)*(R-din); if(slope(x,z)<.45&&N.height(x,z)>4){ lip=din+.6; break; } }
    if(lip==null)continue; const x=C.x+Math.cos(a)*(R-lip), z=C.z+Math.sin(a)*(R-lip); out.push({x,y:N.height(x,z),z}); }
  return out;
}
function buildBirds(root,placed){
  const N=NI(), C=N.centre, rr=U.rng(4747), cols=[], stacks=N.rocks.filter(r=>r.kind==='stack'), reef=N.rocks.filter(r=>r.kind==='reef'&&r.top>.2);
  const ok=p=>clear(p.x,p.z,.5,1.2);
  stacks.forEach((s,i)=>{ if(i===4)return; const kind=i%2?'cormorant':'gull', ps=rockPerches(s,kind==='gull'?7:5,rr).filter(ok); if(ps.length>=3)cols.push({id:'stack'+i,kind,perches:ps}); });
  reef.forEach((rk,i)=>{ const ps=rockPerches(rk,4,rr).filter(ok); if(ps.length>=2)cols.push({id:'reef'+i,kind:'cormorant',perches:ps}); });
  // the cliff tops: the first two bearings (from a fixed list) whose lip is clear of everything
  let nc=0;
  for(const a of [.12,-2.05,3.55,-.75,2.8,-1.2]){ if(nc>=2)break; if(Math.abs(U.angDiff(a,N.cove.mouthA))<.5||Math.abs(U.angDiff(a,1.2))<.5)continue;
    const ps=cliffPerches(a,8); if(ps.length<5||!ps.every(ok))continue; cols.push({id:'cliff'+nc,kind:'gull',perches:ps}); nc++; }
  const birds=[];
  for(const c of cols){ let sx=0,sy=0,sz=0; for(const p of c.perches){ sx+=p.x; sy+=p.y; sz+=p.z; } const n=c.perches.length;
    c.x=sx/n; c.y=sy/n; c.z=sz/n; c.state='settled'; c.t=0; c.upFor=0; c.n=n; c.scatters=0;
    const toSea=Math.atan2(-(c.z-C.z),c.x-C.x);   // perched birds face the wind / the sea
    c.perches.forEach((p,i)=>{ const b={col:c,kind:c.kind,perch:p,yaw0:toSea+(rr()-.5)*1.4,ph:rr()*TAU,state:'perch',t:0,delay:0,pos:new THREE.Vector3(p.x,p.y,p.z),prev:new THREE.Vector3(p.x,p.y,p.z),
      yaw:0,bank:0,spread:0,dry:c.kind==='cormorant'&&rr()<.35,ang:rr()*TAU,rad:5+rr()*7,alt:6+rr()*8,spd:(.55+rr()*.35)*(rr()<.5?1:-1),i:birds.length};
      b.yaw=b.yaw0; birds.push(b); }); }
  // three gulls always wheeling high over the island
  for(let k=0;k<3;k++)birds.push({col:null,kind:'gull',perch:null,state:'wheel',ph:rr()*TAU,t:0,pos:new THREE.Vector3(C.x,40,C.z),prev:new THREE.Vector3(C.x,40,C.z),yaw:0,bank:0,spread:1,
    ang:rr()*TAU,rad:28+rr()*22,alt:30+rr()*12,spd:(.18+rr()*.08)*(k%2?1:-1),cx:C.x+(rr()-.5)*30,cz:C.z+(rr()-.5)*30,i:0});
  birds.forEach((b,i)=>b.i=i);
  const geo=birdGeo(), fly=new Float32Array(birds.length*4); geo.setAttribute('aFly',new THREE.InstancedBufferAttribute(fly,4));
  const mesh=new THREE.InstancedMesh(geo,birdMat(),birds.length); mesh.name='northLifeBirds'; mesh.frustumCulled=false; mesh.castShadow=false;
  const gullC=col('#ffffff'), cormC=col('#2a2b30');
  birds.forEach((b,i)=>{ mesh.setColorAt(i,b.kind==='gull'?gullC.clone().multiplyScalar(.92+((i*37)%10)/80):cormC); });
  mesh.instanceColor.needsUpdate=true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(mesh); L.birdMesh=mesh; L.birds=birds; L.colonies=cols;
  placed.perches=birds.filter(b=>b.perch).map(b=>[b.perch.x,b.perch.z,+b.perch.y.toFixed(2)]);
  updateBirds(0);
}
function scare(c,why){
  if(!c||c.state==='up')return false; c.state='up'; c.t=0; c.upFor=11+((c.scatters*7)%5); c.scatters++; c.why=why||'near';
  const rr=U.rng(900+c.scatters*31+c.n);
  for(const b of L.birds){ if(b.col!==c)continue; b.state='takeoff'; b.t=0; b.solo=0; b.delay=rr()*.7; b.ang=Math.atan2(b.pos.z-c.z,b.pos.x-c.x); }
  G.emit('northLife:scatter',{id:c.id,why:c.why}); return true;
}
function birdTarget(b,out){
  const c=b.col, cx=c?c.x:b.cx, cz=c?c.z:b.cz, cy=c?c.y:0;
  out.set(cx+Math.cos(b.ang)*b.rad,cy+b.alt+Math.sin(G.time*.4+b.ph)*1.2,cz+Math.sin(b.ang)*b.rad); return out;
}
const _t=new THREE.Vector3(), _bm=new THREE.Matrix4();
function updateBirds(dt){
  const P=G.player&&G.player.pos, t=G.time||0, mesh=L.birdMesh; if(!mesh)return;
  // colonies: go up when Rowan comes close; settle again once he's gone
  for(const c of L.colonies){ const d=P?Math.hypot(P.x-c.x,P.z-c.z):1e9, dy=P?Math.abs(P.y-c.y):0;
    if(c.state==='settled'){ c.t+=dt; if(d<SCARE_R&&dy<25&&c.t>2.5)scare(c,'near'); }
    else if(c.state==='up'){ c.t+=dt; if(c.t>c.upFor&&d>SETTLE_R){ c.state='landing'; const rr=U.rng(77+c.scatters); for(const b of L.birds)if(b.col===c){ b.state='return'; b.t=-rr()*3; } } }
    else if(c.state==='landing'){ if(d<SCARE_R*.8&&dy<25){ c.state='settled'; c.t=99; scare(c,'near'); }
      else if(L.birds.every(b=>b.col!==c||b.state==='perch')){ c.state='settled'; c.t=0; G.emit('northLife:settled',{id:c.id}); } } }
  // now and then one bird wheels off and comes back
  L.idleT-=dt; if(L.idleT<=0){ const rr=U.rng(Math.floor(t*10)); L.idleT=5+rr()*9; const cand=L.birds.filter(b=>b.state==='perch'&&b.col&&b.col.state==='settled');
    if(cand.length){ const b=cand[Math.floor(rr()*cand.length)]; b.state='takeoff'; b.t=0; b.delay=0; b.solo=8+rr()*8; b.ang=Math.atan2(b.pos.z-b.col.z,b.pos.x-b.col.x); } }
  const fly=mesh.geometry.attributes.aFly.array;
  for(const b of L.birds){
    b.prev.copy(b.pos); let flap=0, rate=11, spreadT=1;
    if(b.state==='perch'){ const p=b.perch; b.pos.set(p.x,p.y+.15+Math.abs(Math.sin(t*1.6+b.ph))*.012,p.z);
      b.yaw=b.yaw0+Math.sin(t*.37+b.ph)*.35+(Math.sin(t*.11+b.ph*3)>.8?.8:0); b.bank=0; spreadT=b.dry?.62:0; }
    else if(b.state==='takeoff'){ b.t+=dt; if(b.t<b.delay){ spreadT=0; }
      else { const k=b.t-b.delay, c=b.col; b.ang+=b.spd*dt/Math.max(3,b.rad)*3; birdTarget(b,_t); b.pos.lerp(_t,1-Math.exp(-dt*(.6+k*.5))); b.pos.y+=dt*2.2*Math.max(0,1-k);
        flap=.95; rate=15; if(k>1.6)b.state='circle'; b.t=k>1.6?0:b.t; } }
    else if(b.state==='circle'||b.state==='wheel'){ b.t+=dt; b.ang+=b.spd*dt*(b.state==='wheel'?1:(6/Math.max(4,b.rad))); birdTarget(b,_t); b.pos.lerp(_t,1-Math.exp(-dt*1.5));
      flap=(Math.sin(t*.7+b.ph)>.2?.65:.12); rate=9;
      if(b.solo&&b.t>b.solo){ b.solo=0; b.state='return'; b.t=0; } }
    else if(b.state==='return'){ b.t+=dt; if(b.t<0){ b.ang+=b.spd*dt*(6/Math.max(4,b.rad)); birdTarget(b,_t); b.pos.lerp(_t,1-Math.exp(-dt*1.5)); flap=.5; }
      else { const p=b.perch; _t.set(p.x,p.y+.15,p.z); const d=b.pos.distanceTo(_t), k=clamp(b.t/3,0,1);
        b.pos.lerp(_t,1-Math.exp(-dt*(1+k*3))); if(d>1.5)b.pos.y+=Math.min(d*.1,1.2)*dt*4*(1-k);
        flap=d>1.2?.6:.3; rate=d>1.2?10:16; spreadT=d<.35?0:1; if(d<.12||b.t>9){ b.state='perch'; b.t=0; } } }
    // heading from motion; a bank into the turn
    if(b.state!=='perch'){ const vx=b.pos.x-b.prev.x, vz=b.pos.z-b.prev.z; if(vx*vx+vz*vz>1e-6){ const y=Math.atan2(-vz,vx); const dy=U.angDiff(y,b.yaw); b.yaw+=dy*Math.min(1,dt*6); b.bank=U.damp(b.bank,clamp(-dy*6,-.7,.7),3,dt); } }
    b.spread=U.damp(b.spread,spreadT,b.state==='perch'?5:8,dt||1);
    const s=b.kind==='gull'?1.25:1.35;
    _bm.compose(b.pos,_q.setFromEuler(_e.set(b.bank,b.yaw,0,'YXZ')),_s.set(s,s,s)); mesh.setMatrixAt(b.i,_bm);
    fly[b.i*4]=b.spread; fly[b.i*4+1]=b.ph; fly[b.i*4+2]=rate; fly[b.i*4+3]=flap;
  }
  mesh.instanceMatrix.needsUpdate=true; mesh.geometry.attributes.aFly.needsUpdate=true;
}

/* ================================================================ 7. LOW FOG IN THE HOLLOWS */
function buildFog(root,placed){
  const N=NI(), g=GRID, spots=[];
  const cand=[]; for(let j=2;j<g.nz-2;j+=2)for(let i=2;i<g.nx-2;i+=2){ const x=g.x0+i*GS, z=g.z0+j*GS, ho=g.hol[j*g.nx+i]; if(ho>.55&&inland(x,z)>8&&g.h[j*g.nx+i]>3)cand.push([ho+vnoise(x*.1,z*.1)*.4,x,z]); }
  cand.sort((a,b)=>b[0]-a[0]);
  const rr=U.rng(3131);
  for(const [,x,z] of cand){ if(spots.length>=18)break; const w=10+rr()*8, drift=2+rr()*2;
    const ext=w*.5+2+drift*1.5;   // half the billboard, its offset from the spot, and how far it drifts
    if(!clear(x,z,ext,w*.25))continue; if(spots.some(s=>Math.hypot(s.x-x,s.z-z)<13))continue; if(towerD(x,z)<16)continue;
    spots.push({x,z,w,drift,ext,h:N.height(x,z)}); }
  const n=spots.length*2; if(!n){ placed.fog=[]; return; }
  const geo=new THREE.PlaneGeometry(1,1), att=new Float32Array(n*4);
  const mesh=new THREE.InstancedMesh(geo,null,n);
  let i=0; for(const s of spots)for(let k=0;k<2;k++){ const w=s.w*(k?.75:1), hh=w*(.28+rr()*.1), ox=(rr()-.5)*4, oz=(rr()-.5)*4;
    mesh.setMatrixAt(i,mat4(s.x+ox,s.h+hh*.32+.3,s.z+oz,0,0,0,w,hh,1)); att[i*4]=rr()*TAU; att[i*4+1]=.2+rr()*.12; att[i*4+2]=s.drift; att[i*4+3]=tintW(s.x,s.z); i++; }
  geo.setAttribute('aFog',new THREE.InstancedBufferAttribute(att,4));
  mesh.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uTime:{value:0},uMap:{value:G.tex.soft},uCol:{value:col('#aaa6c0')},uTint:{value:new THREE.Color()},uTintK:{value:0},uWind:{value:new THREE.Vector2(WIND.x,WIND.z)}}]),
    vertexShader:`attribute vec4 aFog; uniform float uTime; uniform vec2 uWind; varying vec2 vUv; varying float vA; varying float vT;
#include <fog_pars_vertex>
void main(){ vUv=uv; vec3 c=vec3(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2]);
  float sx=length(instanceMatrix[0].xyz), sy=length(instanceMatrix[1].xyz), ph=aFog.x;
  float lp=fract(uTime*.012+ph/6.2832); c.xz+=uWind*(lp-.5)*aFog.z*2.+vec2(sin(uTime*.05+ph),cos(uTime*.037+ph*1.3))*aFog.z*.5;
  vec4 mvPosition=viewMatrix*vec4(c,1.); mvPosition.xy+=position.xy*vec2(sx,sy);
  float dc=length(mvPosition.xyz);
  vA=aFog.y*smoothstep(3.,11.,dc)*sin(lp*3.14159)*(.8+.2*sin(uTime*.21+ph*2.)); vT=aFog.w;
  gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
    fragmentShader:`uniform sampler2D uMap; uniform vec3 uCol; uniform vec3 uTint; uniform float uTintK; varying vec2 vUv; varying float vA; varying float vT;
#include <fog_pars_fragment>
void main(){ float a=texture2D(uMap,vUv).a*2.*vA*smoothstep(.0,.4,vUv.y); vec3 c=mix(uCol,uTint,clamp(vT*uTintK*.9,0.,.75));
  gl_FragColor=vec4(c,a);
#include <fog_fragment>
}`});
  mesh.material.uniforms.uMap.value=G.tex.soft;   // (merge clones textures; the clone would never upload)
  mesh.name='northLifeFog'; mesh.frustumCulled=false; mesh.renderOrder=3; root.add(mesh); L.fogMesh=mesh;
  placed.fog=spots.map(s=>[s.x,s.z,+s.ext.toFixed(2)]);
}

/* ================================================================ 8. THE FIRE'S COLOUR NEAR THE TOWER */
function buildWash(root){
  const N=NI(), T=N.tower, pos=[], cl=[], idx=[], RINGS=14, SEG=40;
  for(let i=0;i<=RINGS;i++){ const rr=i/RINGS*TINT_R; for(let k=0;k<SEG;k++){ const a=k/SEG*TAU, x=T.x+Math.cos(a)*rr, z=T.z+Math.sin(a)*rr, f=(1-smooth(4,TINT_R,rr))*(i===RINGS?0:1);
      pos.push(x,N.height(x,z)+.12,z); cl.push(f,f,f); if(i===0)break; } }
  // ring 0 is a single centre vertex
  for(let k=0;k<SEG;k++)idx.push(0,1+((k+1)%SEG),1+k);
  for(let i=1;i<RINGS;i++)for(let k=0;k<SEG;k++){ const a=1+(i-1)*SEG+k, b=1+(i-1)*SEG+(k+1)%SEG, c=a+SEG, d=b+SEG; idx.push(a,b,c,b,d,c); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(cl,3)); g.setIndex(idx); g.computeBoundingSphere();
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.1,blending:THREE.AdditiveBlending,depthWrite:false,fog:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4}));
  m.name='northLifeWash'; m.renderOrder=1; root.add(m); L.wash=m;
}
const outcome=()=>{ try{ const F=G.northFire; return (F&&F.state&&F.state.outcome)||null; }catch(e){ return null; } };
/* the island is always at dusk/night in this game (no day clock); duskK is the hook if one comes */
const duskK=()=>{ const d=G.world&&G.world.daylight; return typeof d==='number'?1-clamp(d,0,1)*.85:1; };
function applyTint(mode){
  L.mode=mode; const tc=mode==='died'?null:TINTS[mode==='lived'?'lived':'lure'], k=tc?(mode==='lived'?.42:.5)*duskK():0;
  const bake=(arrBase,w,dst)=>{ for(let i=0;i<w.length;i++){ const r=arrBase[i*3], g=arrBase[i*3+1], b=arrBase[i*3+2], ww=w[i]*k;
      if(ww<=0){ dst[i*3]=r; dst[i*3+1]=g; dst[i*3+2]=b; continue; } const lum=(r+g+b)/3*1.25;
      dst[i*3]=lerp(r,lum*tc.r,ww); dst[i*3+1]=lerp(g,lum*tc.g,ww); dst[i*3+2]=lerp(b,lum*tc.b,ww); } };
  for(const m of [L.grass,L.heather]){ if(!m||!m.instanceColor)continue; bake(m.userData.base,m.userData.w,m.instanceColor.array); m.instanceColor.needsUpdate=true; }
  if(L.trees){ const a=L.trees.geometry.attributes.color; bake(L.trees.userData.base,L.trees.userData.w,a.array); a.needsUpdate=true; }
  if(L.fogMesh){ const u=L.fogMesh.material.uniforms; if(tc)u.uTint.value.copy(tc); u.uTintK.value=k; }
  if(L.wash){ L.wash.visible=!!tc; if(tc)L.wash.material.color.copy(tc); }
}

/* ================================================================ 9. BUILD + WIRING */
function build(){
  if(L.built||L.building)return L.built; const N=NI(); if(!N||!N.pathDist||!G.world.geo)return false;
  L.building=true; const t0=performance.now();
  try{
    ZONES=zones(); buildGrid();
    const root=L.root=new THREE.Group(); root.name='northIsleLife'; G.scene.add(root);
    const placed={}; L.placed=placed;
    buildPlants(root,placed); buildTrees(root,placed); buildShore(root,placed); buildBirds(root,placed); buildFog(root,placed); buildWash(root);
    L.built=true; applyQuality(); applyTint(outcome()||'lure'); L.mode=outcome()||'lure';
    root.visible=false;
  }catch(e){ console.error('northIsleLife',e); }
  L.building=false; L.stats.buildMs=Math.round(performance.now()-t0);
  G.emit('northLife:built',{ms:L.stats.buildMs});
  return L.built;
}
function applyQuality(){ const q=G.quality&&G.quality.level, f=q==='saver'?.5:1;
  for(const m of [L.grass,L.heather])if(m)m.count=Math.max(0,Math.floor(m.userData.full*f)); }
G.on('quality',()=>{ if(L.built)applyQuality(); });
G.on('north:fogLeg',()=>build());          // the screen is black for a moment there: build then, not mid-sail
G.on('north:landed',e=>{ if(e&&e.dir==='north')build(); });
G.on('player:attack',()=>{ if(!L.built||!L.root||!L.root.visible)return; const P=G.player&&G.player.pos; if(!P)return;
  for(const c of L.colonies)if(c.state==='settled'&&Math.hypot(P.x-c.x,P.z-c.z)<SCARE_R*1.6)scare(c,'noise'); });

G.system('northIsleLife',{order:86,modes:['play','paused','dead','title'],
  init(){},
  update(dt){
    const N=NI(); if(!N)return;
    const cam=G.camera.position, C=N.centre, cd=Math.hypot(cam.x-C.x,cam.z-C.z);
    if(!L.built){ if(cd<BUILD_R||L.force===true)build(); if(!L.built)return; }
    const oc=outcome()||'lure'; if(oc!==L.mode)applyTint(oc);   // (rare: after the fire room; kept current even while hidden)
    const show=L.force!=null?L.force:cd<SHOW_R;
    L.root.visible=show; if(!show)return;
    const t=G.time||0; L.uTime.value=t;
    if(L.pools)L.pools.material.uniforms.uTime.value=t;
    if(L.fogMesh)L.fogMesh.material.uniforms.uTime.value=t;
    if(L.kelp)L.kelp.position.y=(G.world.seaLevel||0)+.03+Math.sin(t*1.1)*.03;
    if(L.wash&&L.wash.visible)L.wash.material.opacity=(L.mode==='lived'?.08:.1)*(.85+.15*Math.sin(t*7.3))*duskK();
    if(G.state.mode!=='paused')updateBirds(dt||0);
  }
});

/* ================================================================ 10. API */
function counts(){ const p=L.placed||{}; const n=k=>(p[k]||[]).length;
  return {built:L.built,grass:L.grass?L.grass.count:0,heather:L.heather?L.heather.count:0,trees:n('trees'),treeColliders:(p.trees||[]).filter(t=>t[3]).length,wrack:n('wrack'),kelp:n('kelp'),pools:n('pools'),
    birds:L.birds.length,colonies:L.colonies.length,fog:L.fogMesh?L.fogMesh.count:0,meshes:L.root?L.root.children.length:0,buildMs:L.stats.buildMs||0,keepClear:G.isleKeepClear.length}; }
function tintInfo(){
  const m=L.grass; if(!m||!m.instanceColor)return {mode:L.mode};
  const a=m.instanceColor.array, b=m.userData.base, w=m.userData.w; let n=0; const near=[0,0,0], base=[0,0,0], far=[0,0,0], farB=[0,0,0]; let nf=0;
  for(let i=0;i<w.length;i++){ if(w[i]>.5){ n++; for(let k=0;k<3;k++){ near[k]+=a[i*3+k]; base[k]+=b[i*3+k]; } } else if(w[i]===0&&nf<400){ nf++; for(let k=0;k<3;k++){ far[k]+=a[i*3+k]; farB[k]+=b[i*3+k]; } } }
  const avg=(v,c)=>v.map(x=>+(x/Math.max(1,c)).toFixed(3));
  return {mode:L.mode,nNear:n,near:avg(near,n),nearBase:avg(base,n),far:avg(far,nf),farBase:avg(farB,nf),wash:!!(L.wash&&L.wash.visible),washCol:L.wash?'#'+L.wash.material.color.getHexString():null,
    fogTintK:L.fogMesh?+L.fogMesh.material.uniforms.uTintK.value.toFixed(3):0};
}
G.northIsleLife={
  get built(){ return L.built; }, get visible(){ return !!(L.root&&L.root.visible); },
  get birds(){ return L.colonies.map(c=>({id:c.id,kind:c.kind,x:c.x,y:c.y,z:c.z,n:c.n,state:c.state,perched:L.birds.filter(b=>b.col===c&&b.state==='perch').length,scatters:c.scatters})); },
  debug:{
    scare(id){ if(!L.built)return false; const P=G.player&&G.player.pos; let c=id?L.colonies.find(q=>q.id===id):null;
      if(!c&&P){ let best=1e9; for(const q of L.colonies){ const d=Math.hypot(P.x-q.x,P.z-q.z); if(d<best){ best=d; c=q; } } }
      return scare(c,'debug'); },
    counts, show(on){ L.force=on==null?null:!!on; if(on&&!L.built)build(); }, build, placed:()=>L.placed, tint:tintInfo, clear:(x,z,pad)=>{ if(!L.built)ZONES=zones(); return clear(x,z,pad||0,0); },
    get colonies(){ return L.colonies; }, get zones(){ return ZONES; }, get list(){ return L.birds; }, applyTint:m=>applyTint(m), get root(){ return L.root; } }
};
})();

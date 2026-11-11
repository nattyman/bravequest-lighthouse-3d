/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — northisle.js
   The north island, first slice (Story Bible, "Threads for the north island"; Heath, 2026-11-10: gather the boat's
   parts, then a short scripted sail through the fog).
     - the island itself, where the wrecker's light really is: ~700 m north of our lighthouse, out in the same sea.
       Its own analytic height (wrapped into G.world.height, so floors, slopes, companions and the camera all just work),
       its own walkable rule, a terrain mesh, rocks and colliders.
     - the cove on its south shore: a beach of wrecks. Every boat that steered for the green light; two of them have
       nameboards you can read.
     - a climbing path to the wrecker's tower on the crag: dark stone, an iron fire-basket on top where the green light
       burns, a pile of opened crates at its foot, and a door barred from inside. That door is where the next slice starts.
     - the crossing: "Sail north" at the patched boat (boat.js) → a short scripted sail (out from the south beach, then
       through the fog with our light behind and the green one ahead), landing in the cove; the boat stays moored there,
       and "Sail home" brings you back to the south beach.
   G.northIsle = { inside, centre, tower, cove, crossing, at, height(x,z), inBox(x,z), cross(dir,{instant}),
                   debug:{...} }   Events: north:crossing {dir}, north:landed {dir}, north:door, north:board {id}
   Save: G.persist 'northIsle' (where the boat is, what's been read).
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth,vnoise,fbm}=U;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const col=U.col;

/* ================================================================ 1. THE ISLAND (analytic, ready at evaluation) */
const C={x:150,z:-700};                        // the island's middle; north is -z, so its south shore faces home
const BOX={x0:55,x1:245,z0:-800,z1:-590};      // everything this module owns (terrain, sea floor, walkable)
const inBox=(x,z)=>x>BOX.x0&&x<BOX.x1&&z>BOX.z0&&z<BOX.z1;
const TOWER={x:146,z:-708,base:26,h:29.5};     // the fire-basket burns at base+h+2.5 = 58, where north.js puts the light
const COVE_A=1.2;                               // the cove's bearing from the middle (atan2(dz,dx): +z is south)
function shoreR(a){ return 66+8*Math.sin(3*a+1.2)+5*Math.sin(5*a-.4)+(fbm(Math.cos(a)*1.3+7,Math.sin(a)*1.3+3,3)-.47)*14; }
const angTo=(x,z)=>Math.atan2(z-C.z,x-C.x);
const coveK=a=>Math.exp(-Math.pow(U.angDiff(a,COVE_A)/.34,2));
const MOUTH_A=COVE_A+.55;                       // the sea cave (northcave.js), under the cliffs west of the cove
const shelfK=a=>{ const d=U.angDiff(a,(COVE_A+MOUTH_A)/2); return 1-smooth(.3,.42,Math.abs(d)); };   // the shelf you walk along to it
// where the cove's shoreline is, and "inland" from there
const COVE_R=shoreR(COVE_A), COVE_DIR={x:Math.cos(COVE_A),z:Math.sin(COVE_A)};
const coveAt=(din)=>({x:C.x+COVE_DIR.x*(COVE_R-din),z:C.z+COVE_DIR.z*(COVE_R-din)});
const BEACH=coveAt(9);                          // where you land: on the sand, a few steps up from the water
const NMOOR=Object.assign(coveAt(-7),{yaw:0});  // the boat, moored off the beach
NMOOR.yaw=Math.atan2(-(COVE_DIR.z),COVE_DIR.x)+PI;    // bow to the beach... (boat local +x is the bow) → pointing inland
/* the climbing path, beach → tower: [x, z, surface height] */
const PATH=(()=>{ const a=coveAt(15), b=coveAt(22);
  // up off the sand, west along the slope, round the crag's west side, and in to the tower from the south-west
  return [[a.x,a.z,1.5],[b.x,b.z,3.2],[150,-672,6.5],[134,-676,11],[126,-690,15.5],[132,-700,19.5],[133,-711,24],[138,-713,26]]; })();   // (no hairpins: legs that pass close at different heights fight over the ground)
const PW=1.9;
const PSEG=[]; for(let i=0;i<PATH.length-1;i++){ const a=PATH[i],b=PATH[i+1],dx=b[0]-a[0],dz=b[1]-a[1]; PSEG.push({ax:a[0],az:a[1],ha:a[2],hb:b[2],dx,dz,l2:dx*dx+dz*dz}); }
const _pd=new Float64Array(16), _ph=new Float64Array(16);
function pathInfo(x,z){ let best=1e9;
  for(let i=0;i<PSEG.length;i++){ const s=PSEG[i]; let t=((x-s.ax)*s.dx+(z-s.az)*s.dz)/s.l2; t=t<0?0:t>1?1:t; const px=s.ax+s.dx*t-x, pz=s.az+s.dz*t-z, d=Math.hypot(px,pz);
    _pd[i]=d; _ph[i]=s.ha+(s.hb-s.ha)*t; if(d<best)best=d; }
  // the height is a soft blend of the nearby legs (weighted by how much nearer each is), so it never steps where two legs meet
  let sw=0, sh=0; for(let i=0;i<PSEG.length;i++){ const w=Math.exp(-(_pd[i]-best)*2.5); sw+=w; sh+=w*_ph[i]; }
  return {d:best,h:sh/sw}; }
function inlandH(x,z,s){
  const dT=Math.hypot(x-TOWER.x,z-TOWER.z);
  let h=9+13*smooth(.04,.62,s)+7*(fbm(x*.03+4.1,z*.03-2.7,4)-.47)+2.4*(vnoise(x*.13+1,z*.13+5)-.5);
  h+=11*Math.exp(-Math.pow(dT/22,2));                 // the crag the tower stands on
  return h;
}
let _lx=NaN,_lz=NaN,_lh=0;
function rawH(x,z){
  const a=angTo(x,z), d=Math.hypot(x-C.x,z-C.z), R=shoreR(a), din=R-d;
  if(din<=0){ const sh=shelfK(a); return Math.max(-11,-.5+din*lerp(.32,.15,sh)); }
  const k=coveK(a), s=din/R;
  const cliff=-.5+2.6*din, cove=-.5+.13*Math.min(din,14)+.62*Math.max(0,din-14);
  return Math.min(lerp(cliff,cove,k),inlandH(x,z,s));
}
function isleH(x,z){
  if(x===_lx&&z===_lz)return _lh;
  let h=rawH(x,z);
  // the tower's apron on the crag
  const dT=Math.hypot(x-TOWER.x,z-TOWER.z); if(dT<17)h=lerp(h,TOWER.base,1-smooth(9,17,dT));
  // the path: its own height underfoot, then a valley either side of it (the ground above is cut back to a walkable
  // bank, the ground below built up for a few metres), so it reads as a way worn up the island, not a gorge
  const p=pathInfo(x,z);
  if(p.d<PW)h=p.h;
  else{ const e=p.d-PW, up=p.h+e*.5+e*e*.012; if(h>up)h=lerp(up,h,smooth(26,40,e));
    const dn=p.h-e*.7; if(h<dn&&e<6)h=lerp(h,dn,1-smooth(3,6,e)); }
  _lx=x;_lz=z;_lh=h; return h;
}
/* wrap the world's height: inside BOX it's the north island's (the sea floor round it too). Everything that asks the
   ground (G.floorAt, slopes, companions, the camera boom, map stands) gets it for free. */
{ const W=G.world, h0=W.height; W.height=(x,z)=>inBox(x,z)?isleH(x,z):h0(x,z); }
// walkable: the same rule as at home (dry land at this tide), with a soft fence well out in the water
G.walkOverrides.push((x,z)=>{ if(!inBox(x,z))return null; return isleH(x,z)>=-1.2+(G.world.tide||0); });

/* ================================================================ 2. STATE */
const S={v:1,at:'home',landed:false,read:{},door:false,seenTower:false};
const isPlay=()=>G.state.mode==='play';
const timers=[]; const later=(s,fn)=>timers.push({t:G.time+s,fn});
const say=(t,who,o)=>{ try{ G.ui.say(t,who||null,Object.assign({priority:'high'},o||{})); }catch(e){} };
let inside=false;
function onIsland(p){ return !!p&&inBox(p.x,p.z); }

/* ================================================================ 3. BUILDING IT */
let root=null, towerFire=null, fireMat=null, fireLight=null, foam=null, foamMat=null;
const GH=1.5;
function buildTerrain(){
  const nx=Math.ceil((BOX.x1-BOX.x0)/GH)+1, nz=Math.ceil((BOX.z1-BOX.z0)/GH)+1;
  const pos=[], nor=[], cl=[], idx=[], map=new Int32Array(nx*nz).fill(-1);
  const H=(i,j)=>isleH(BOX.x0+i*GH,BOX.z0+j*GH);
  const rock=col('#5d6270'), rock2=col('#3f4350'), heath=col('#3a3f3a'), heath2=col('#4a3c4c'), sand=col('#a99c82'), wet=col('#5c5448'), dirt=col('#6d5f50'), c=new THREE.Color(), n=new THREE.Vector3();
  // keep only cells near land
  const keep=new Uint8Array(nx*nz); for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)if(H(i,j)>-3.2)keep[j*nx+i]=1;
  const near=(i,j)=>{ for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++){ const ii=i+a,jj=j+b; if(ii>=0&&jj>=0&&ii<nx&&jj<nz&&keep[jj*nx+ii])return true; } return false; };
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){ if(!near(i,j))continue;
    const x=BOX.x0+i*GH, z=BOX.z0+j*GH, h=H(i,j);
    const gx=(H(Math.min(nx-1,i+1),j)-H(Math.max(0,i-1),j))/(2*GH), gz=(H(i,Math.min(nz-1,j+1))-H(i,Math.max(0,j-1)))/(2*GH), sl=Math.hypot(gx,gz);
    let px=x,pz=z; if(sl>1.4){ const k=(vnoise(x*.4+h*.3,z*.4-h*.2)-.5)*1.4*smooth(1.4,3,sl); px-=gx/sl*k; pz-=gz/sl*k; }
    map[j*nx+i]=pos.length/3; pos.push(px,h,pz); n.set(-gx,1,-gz).normalize(); nor.push(n.x,n.y,n.z);
    // colour: heather and dark turf on the flats, bare rock on the faces, sand and wet sand in the cove, the path worn pale
    const a=angTo(x,z), k=coveK(a), pd=pathInfo(x,z).d;
    c.copy(heath).lerp(heath2,smooth(.35,.75,vnoise(x*.07+3,z*.07-1))*.8);
    c.lerp(rock2,.25*vnoise(x*.3,z*.3));
    if(h<4.5)c.lerp(sand,k*smooth(4.5,2.5,h)); if(h<.35)c.lerp(wet,smooth(.35,-.6,h)*.85);
    c.lerp(rock,smooth(.7,1.25,sl)); c.lerp(rock2,smooth(1.4,2.4,sl)*.6);
    if(pd<PW+.6)c.lerp(dirt,.75*(1-smooth(PW-.6,PW+.6,pd)));
    if(Math.hypot(x-TOWER.x,z-TOWER.z)<12)c.lerp(rock2,.45*(1-smooth(6,12,Math.hypot(x-TOWER.x,z-TOWER.z))));
    cl.push(c.r,c.g,c.b);
  }
  for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){ const a=map[j*nx+i],b=map[j*nx+i+1],cc=map[(j+1)*nx+i],d=map[(j+1)*nx+i+1]; if(a<0||b<0||cc<0||d<0)continue;
    if((i+j)&1)idx.push(a,cc,b,b,cc,d); else idx.push(a,cc,d,a,d,b); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(cl,3)); g.setIndex(idx); g.computeBoundingSphere();
  const m=new THREE.Mesh(g,G.toon('#ffffff',{vertexColors:true})); m.receiveShadow=true; m.castShadow=true; m.name='northTerrain'; root.add(m);
}
/* a ribbon of foam where the island meets the sea (the sea's own foam map only covers home) */
function buildFoam(){
  const N=220, pos=[], uv=[], idx=[];
  for(let k=0;k<=N;k++){ const a=k/N*TAU; let lo=20, hi=110; for(let it=0;it<22;it++){ const m=(lo+hi)/2; if(rawH(C.x+Math.cos(a)*m,C.z+Math.sin(a)*m)>0)lo=m; else hi=m; }
    const r=(lo+hi)/2; for(const [dr,v] of [[-1.6,0],[2.4,1]]){ pos.push(C.x+Math.cos(a)*(r+dr),.06,C.z+Math.sin(a)*(r+dr)); uv.push(k/N*60,v); } }
  for(let k=0;k<N;k++){ const a=k*2; idx.push(a,a+2,a+1,a+1,a+2,a+3); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx);
  const tex=G.canvasTex(128,(c,s)=>{ const gr=c.createLinearGradient(0,0,0,s); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(.35,'rgba(255,255,255,.9)'); gr.addColorStop(.55,'rgba(255,255,255,.35)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=gr; c.fillRect(0,0,s,s); c.globalCompositeOperation='destination-out'; for(let i=0;i<60;i++){ c.fillStyle='rgba(0,0,0,.55)'; c.beginPath(); c.ellipse(Math.random()*s,Math.random()*s,6+Math.random()*10,3+Math.random()*4,0,0,TAU); c.fill(); } });
  tex.wrapS=THREE.RepeatWrapping; tex.rotation=PI/2;
  foamMat=new THREE.MeshBasicMaterial({map:tex,color:col('#d9d3c8'),transparent:true,opacity:.55,depthWrite:false,fog:true});
  foam=new THREE.Mesh(g,foamMat); foam.name='northFoam'; foam.renderOrder=2; root.add(foam);
}
/* rocks, sea stacks and the cove's reef */
function buildRocks(GE){
  const r=U.rng(7710), parts=[], rk=col('#5d6270'), rk2=col('#3c404c'), wet=col('#2e2c2c'), weed=col('#3a4a32');
  const rockC=(p,n,o)=>{ o.copy(rk2).lerp(rk,vnoise(p.x*2.2,p.z*2.2+p.y*1.4)); if(p.y<.4)o.lerp(wet,.55); if(n.y>.55&&p.y>.5&&p.y<2.5)o.lerp(weed,.3); };
  const add=(x,z,s,sq,y)=>{ const g=GE.blob(1,1,x*.13+z*.07,.28); const yy=y==null?isleH(x,z)+s*.15:y; parts.push({g,m:GE.mat4(x,yy,z,r()*3,r()*3,r()*3,s*1.2,s*(sq||.8),s),c:rockC});
    G.addCollider({x,z,r:s*1.05,y0:-12,y1:yy+s*(sq||.8)}); };
  // the reef either side of the cove mouth, where the boats broke
  for(const [da,dr,s] of [[-.32,-4,2.4],[-.27,-9,1.7],[-.38,-13,2.8],[.3,-5,2.2],[.36,-11,3.1],[.26,-15,1.6],[-.2,-18,1.3],[.18,-21,1.5]]){
    const a=COVE_A+da, R=shoreR(a)-dr; add(C.x+Math.cos(a)*R,C.z+Math.sin(a)*R,s,.75); }
  // sea stacks off the cliffs
  for(const [a,dr,s] of [[2.4,-10,4.5],[2.75,-16,3.2],[-.4,-12,5],[-1.4,-9,3.8],[-2.3,-14,4.2],[.55,-8,3.5]]){
    const R=shoreR(a)-dr, x=C.x+Math.cos(a)*R, z=C.z+Math.sin(a)*R; add(x,z,s,1.9,-1.5); }
  // boulders on the moor and the crag
  for(let i=0;i<46;i++){ const a=r()*TAU, d=r()*58; const x=C.x+Math.cos(a)*d, z=C.z+Math.sin(a)*d; if(isleH(x,z)<3)continue;
    if(pathInfo(x,z).d<PW+1.4)continue; if(Math.hypot(x-TOWER.x,z-TOWER.z)<9)continue; add(x,z,.5+r()*1.4,.7); }
  const m=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true})); m.castShadow=true; m.receiveShadow=true; m.name='northRocks'; root.add(m);
}
/* the beach of wrecks: half a dozen hulls of different sizes, ribs out of the sand, spars, a figurehead, two nameboards */
const BOARDS=[];
function buildWrecks(GE){
  const r=U.rng(4242), parts=[], wood=col('#7d6249'), wood2=col('#4a3929'), wet=col('#33281f'), weed=col('#3c4b30'), paints=[col('#6e3b33'),col('#40606e'),col('#5a6a3c'),col('#c9b98f'),col('#3b3f5a')];
  const plank=(base,band,paint)=>(p,n,o)=>{ o.copy(base).lerp(wood2,.2+.2*Math.sin(p.y*9+vnoise(p.x*.8,p.z*.8)*3)); if(band!=null&&p.y>band-.18)o.lerp(paint,.8); if(p.y<.1)o.lerp(wet,.5); if(p.y<-.2)o.lerp(weed,.35); };
  function hull(L,R,seed){ const g=new THREE.CylinderGeometry(R,R,L,16,10,true,PI,PI); g.rotateZ(PI/2); const P=g.attributes.position, rr=U.rng(seed), rag=[]; for(let k=0;k<17;k++)rag.push(rr()*.9);
    for(let i=0;i<P.count;i++){ const hx=P.getX(i), t=clamp((hx+L/2)/L,0,1), w=Math.max(.05,1-Math.pow(t,2.2)*.92), y=P.getY(i), z=P.getZ(i);
      const a=Math.atan2(z,-y), ai=clamp(Math.round((a/PI+.5)*16),0,16), x2=t<.02?hx+rag[ai]:hx; P.setXYZ(i,x2,y*.72*(1-.2*t*t)+.38*t*t,z*w); }
    g.computeVertexNormals(); return g; }
  const at=(din,side)=>{ const a=COVE_A+side, R=shoreR(a)-din; return {x:C.x+Math.cos(a)*R,z:C.z+Math.sin(a)*R}; };
  const hulls=[ // [din (m inland from the shoreline), bearing offset, length, beam, rx, ry, rz, sink]
    [4,-.2,7.5,1.9,.28,.4,.32,.55],[7,.17,5.2,1.4,-.3,2.1,-.22,.4],[11,-.24,9,2.3,.18,-.7,-.28,.85],[2,.25,4.4,1.2,.35,1.2,.18,.3],[12,.21,6,1.6,-.26,.9,.3,.55],[-2.5,-.12,8,2,.22,2.6,.26,1.25]];
  hulls.forEach((h,k)=>{ const p=at(h[0],h[1]), y=Math.max(isleH(p.x,p.z),-.6)+h[3]*.55-h[7], paint=paints[k%paints.length];
    parts.push({g:hull(h[2],h[3],31+k),m:GE.mat4(p.x,y,p.z,h[4],h[5],h[6]),c:plank(wood,y+.2,paint)});
    G.addCollider({x:p.x,z:p.z,r:h[3]*.95,y0:-6,y1:y+h[3]*.7});
    const ex=Math.cos(-h[5])*h[2]*.3, ez=Math.sin(-h[5])*h[2]*.3; G.addCollider({x:p.x+ex,z:p.z+ez,r:h[3]*.7,y0:-6,y1:y+h[3]*.6}); G.addCollider({x:p.x-ex,z:p.z-ez,r:h[3]*.7,y0:-6,y1:y+h[3]*.6}); });
  // bare ribs standing out of the sand in rows (boats long gone)
  for(const [din,side,yaw,n] of [[7,-.13,.4,5],[13,.13,1.9,4],[3,.1,-.7,4]]){ const p=at(din,side);
    for(let k=0;k<n;k++){ const s=1-Math.abs(k-(n-1)/2)*.12, x=p.x+Math.cos(yaw)*(k-(n-1)/2)*.95, z=p.z-Math.sin(yaw)*(k-(n-1)/2)*.95;
      parts.push({g:new THREE.TorusGeometry(1.15*s,.08,4,10,PI*.85),m:GE.mat4(x,isleH(x,z)-.3,z,0,yaw+PI/2,PI+.25),c:(p,n,o)=>o.copy(wood2).lerp(wet,p.y<.4?.6:.1)}); } }
  // spars and masts lying in the sand
  const flank=()=>(r()<.5?-1:1)*(.09+r()*.19);
  for(let k=0;k<7;k++){ const p=at(2+r()*7,flank()), L=2.5+r()*2.8, yaw=r()*PI, ex=Math.cos(yaw)*L/2, ez=-Math.sin(yaw)*L/2;
    const h1=isleH(p.x+ex,p.z+ez), h2=isleH(p.x-ex,p.z-ez), tilt=Math.atan2(h1-h2,L);   // lying along the sand, ends on the ground
    parts.push({g:new THREE.CylinderGeometry(.08+r()*.05,.12,L,7),m:GE.mat4(p.x,(h1+h2)/2+.1,p.z,0,yaw,-PI/2+tilt),c:wood2}); }
  // burst barrels and crates
  for(let k=0;k<9;k++){ const p=at(3+r()*10,flank()), y=isleH(p.x,p.z);
    if(k%2){ parts.push({g:new THREE.CylinderGeometry(.34,.3,.8,10,1,true),m:GE.mat4(p.x,y+.25,p.z,PI/2-.2,r()*3,0),c:(q,n,o)=>o.copy(wood).lerp(wood2,.5+.5*Math.sin(q.y*30))}); }
    else{ const s=.5+r()*.25; parts.push({g:new THREE.BoxGeometry(s*1.3,s,s),m:GE.mat4(p.x,y+s*.3,p.z,r()*.4,r()*3,r()*.4),c:(q,n,o)=>o.copy(wood).lerp(wood2,.4+.4*Math.sin(q.y*16))}); } }
  // a figurehead, face down in the wash
  { const p=at(1,-.09), y=isleH(p.x,p.z)+.15; parts.push({g:GE.blob(.5,1,9,.15),m:GE.mat4(p.x,y,p.z,.2,1.1,PI/2,1.9,.55,.6),c:(q,n,o)=>o.copy(col('#b8a98c')).lerp(wet,q.y<y?.6:.15)}); }
  const mesh=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide})); mesh.castShadow=true; mesh.receiveShadow=true; mesh.name='northWrecks'; root.add(mesh);
  // the nameboards (separate meshes: painted letters on a canvas texture)
  const boards=[
    {id:'margery',name:'MARGERY',port:'WICKHAM’S END',din:5,side:-.12,yaw:.6,paint:'#40606e',
      lines:['The Margery. My father’s boat.','They said she went down in a storm when I was small. Half the hamlet walked the beach for a week.','There wasn’t a storm. There was a light.']},
    {id:'swift',name:'SWIFT',port:'CARROW',din:9.5,side:.13,yaw:-.9,paint:'#6e3b33',
      lines:['The Swift, out of Carrow. That’s two days down the coast.','It isn’t only our boats. It’s anyone who comes this way in the dark.']}];
  for(const b of boards){ const p=at(b.din,b.side), y=isleH(p.x,p.z);
    const tex=G.canvasTex(256,(c,s)=>{ c.fillStyle=b.paint; c.fillRect(0,0,s,s); c.fillStyle='rgba(0,0,0,.25)'; for(let i=0;i<5;i++)c.fillRect(0,i*s/5,s,2);
      c.fillStyle='#e8dcc0'; c.textAlign='center'; c.font='bold 58px Georgia, serif'; c.fillText(b.name,s/2,s*.46); c.font='26px Georgia, serif'; c.fillText(b.port,s/2,s*.74);
      c.globalCompositeOperation='destination-out'; for(let i=0;i<90;i++){ c.fillStyle='rgba(0,0,0,.5)'; c.fillRect(Math.random()*s,Math.random()*s,2+Math.random()*9,1+Math.random()*3); } });
    const back=new THREE.Mesh(new THREE.BoxGeometry(2.2,.6,.07),G.toon('#4a3929')); const face=new THREE.Mesh(new THREE.PlaneGeometry(2.1,.55),G.toon('#ffffff',{map:tex,transparent:true}));
    tex.repeat.set(1,.55/2.1*2.1); face.position.z=.04; back.add(face);
    const g=new THREE.Group(); g.add(back); back.rotation.x=-.95; back.position.y=.3; g.position.set(p.x,y,p.z); g.rotation.y=b.yaw; back.castShadow=true; G.outline&&G.outline(back,{thickness:.02}); root.add(g);
    b.pos=V(p.x,y+.4,p.z); BOARDS.push(b); }
}
/* the wrecker's tower: dark stone, leaning a little, an iron fire-basket on top; opened crates at its foot; a barred door */
let doorPos=null;
function buildTower(GE){
  const T=TOWER, tex=GE.tex(), g=new THREE.Group(); g.position.set(T.x,T.base,T.z); g.name='wreckerTower'; root.add(g);
  const stoneMat=G.toon('#ffffff',{map:tex&&tex.stone,vertexColors:true}), ironMat=G.toon('#2a2729');
  // body: a rough tapering drum, the courses uneven, darker toward the top where the smoke goes
  const body=new THREE.CylinderGeometry(2.7,3.7,T.h,14,18,true), P=body.attributes.position, cl=new Float32Array(P.count*3), c=new THREE.Color(), dk=col('#4a4c55'), lt=col('#7b7a80'), soot=col('#1f1e24');
  for(let i=0;i<P.count;i++){ const x=P.getX(i), y=P.getY(i), z=P.getZ(i), a=Math.atan2(z,x), t=(y+T.h/2)/T.h; const k=1+(vnoise(a*3,y*.8)-.5)*.07; P.setXYZ(i,x*k,y,z*k);
    c.copy(dk).lerp(lt,vnoise(a*5+1,y*1.3)*.6).lerp(soot,smooth(.7,1,t)*.7); c.toArray(cl,i*3); }
  body.setAttribute('color',new THREE.BufferAttribute(cl,3)); body.computeVertexNormals();
  const uv=body.attributes.uv; for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*6,uv.getY(i)*T.h/3.2);
  const bm=new THREE.Mesh(body,stoneMat); bm.position.y=T.h/2; bm.castShadow=true; bm.receiveShadow=true; g.add(bm); G.outline&&G.outline(bm,{thickness:.05});
  const lean=new THREE.Group(); lean.position.y=T.h; g.add(lean);
  // the gallery: a slab ring and a crude rail
  const slab=new THREE.Mesh(new THREE.CylinderGeometry(3.6,3.3,.55,14),stoneMat); slab.position.y=.27; slab.castShadow=true; lean.add(slab);
  for(let k=0;k<14;k++){ const a=k/14*TAU, post=new THREE.Mesh(new THREE.BoxGeometry(.12,1,.12),ironMat); post.position.set(Math.cos(a)*3.35,1.05,Math.sin(a)*3.35); lean.add(post); }
  const rail=new THREE.Mesh(new THREE.TorusGeometry(3.35,.05,4,28),ironMat); rail.rotation.x=PI/2; rail.position.y=1.5; lean.add(rail);
  // the fire-basket: iron bars round a green fire; a hood over it
  const bars=new THREE.Group(); bars.position.y=.55; lean.add(bars);
  for(let k=0;k<10;k++){ const a=k/10*TAU, b=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,3,4),ironMat); b.position.set(Math.cos(a)*1.25,1.5,Math.sin(a)*1.25); bars.add(b); }
  for(const y of [.25,1.6,2.95]){ const ring=new THREE.Mesh(new THREE.TorusGeometry(1.25,.06,4,20),ironMat); ring.rotation.x=PI/2; ring.position.y=y; bars.add(ring); }
  const hood=new THREE.Mesh(new THREE.ConeGeometry(1.7,1.4,10,1,true),G.toon('#232125',{side:THREE.DoubleSide})); hood.position.y=3.65; bars.add(hood); G.outline&&G.outline(hood,{thickness:.04});
  fireMat=new THREE.MeshBasicMaterial({color:col('#2fcf7a'),transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false});
  towerFire=new THREE.Group(); towerFire.position.y=1.5; bars.add(towerFire);
  for(let k=0;k<3;k++){ const f=new THREE.Mesh(new THREE.ConeGeometry(.75-k*.18,1.9+k*.5,8,1,true),fireMat); f.position.y=k*.25; f.rotation.y=k*1.3; towerFire.add(f); }
  fireLight=new THREE.PointLight(col('#6fe8a8'),0,46,1.6); fireLight.position.y=2; bars.add(fireLight);
  lean.rotation.z=.02;
  // the door: deep-set, iron-banded, facing down the path
  const da=Math.atan2(PATH[PATH.length-1][1]-T.z,PATH[PATH.length-1][0]-T.x);
  const dg=new THREE.Group(); dg.position.set(Math.cos(da)*3.55,0,Math.sin(da)*3.55); dg.rotation.y=-da+PI/2; g.add(dg);
  const frame=new THREE.Mesh(new THREE.BoxGeometry(2.1,3,.7),stoneMat); frame.position.set(0,1.5,-.1); dg.add(frame);
  const door=new THREE.Mesh(new THREE.BoxGeometry(1.4,2.4,.12),G.toon('#3a2a20',{map:tex&&tex.wood})); door.position.set(0,1.2,.27); dg.add(door);
  for(const y of [.55,1.85]){ const band=new THREE.Mesh(new THREE.BoxGeometry(1.45,.1,.05),ironMat); band.position.set(0,y,.35); dg.add(band); }
  const ringH=new THREE.Mesh(new THREE.TorusGeometry(.1,.025,4,10),ironMat); ringH.position.set(.45,1.2,.37); dg.add(ringH);
  doorPos=V(T.x+Math.cos(da)*4.6,T.base,T.z+Math.sin(da)*4.6);
  G.addCollider({x:T.x,z:T.z,r:3.75,y0:-5,y1:T.base+T.h+4});
  // what the light brings in: opened crates, barrels and a sea-chest piled by the wall, a rope coil, a lantern on a hook
  const parts=[], wood=col('#7d6249'), wood2=col('#4a3929');
  for(let k=0;k<7;k++){ const a=da+1.0+k*.24, R=4.6+(k%2)*.9, x=T.x+Math.cos(a)*R, z=T.z+Math.sin(a)*R, s=.55+(k%3)*.12;
    parts.push({g:new THREE.BoxGeometry(s*1.3,s,s),m:GE.mat4(x,T.base+s*.5+(k===3?s:0),z,0,a,0),c:(q,n,o)=>o.copy(wood).lerp(wood2,.4+.4*Math.sin(q.y*16))});
    if(k!==3)G.addCollider({x,z,r:s*.7,y0:T.base-1,y1:T.base+s*(k===2?2:1)}); }
  for(let k=0;k<3;k++){ const a=da-1.1-k*.3, x=T.x+Math.cos(a)*4.4, z=T.z+Math.sin(a)*4.4;
    parts.push({g:new THREE.CylinderGeometry(.36,.32,.85,10),m:GE.mat4(x,T.base+.43,z,0,0,0),c:(q,n,o)=>o.copy(wood).lerp(wood2,.5+.5*Math.sin(q.y*28))}); G.addCollider({x,z,r:.4,y0:T.base-1,y1:T.base+.9}); }
  const crates=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true})); crates.castShadow=true; crates.receiveShadow=true; root.add(crates);
  const pa=da+1.6; S._pile=V(T.x+Math.cos(pa)*5.6,T.base+.5,T.z+Math.sin(pa)*5.6);
}

/* ================================================================ 4. THE CROSSING */
// home: the boat pulls out from the south beach; then (a fade) out in the fog between the islands, sailing for the green light
const X={on:false,dir:null,t:0,phase:0,boatPos:V(),boatYaw:0,fig:null,camPos:V(),camLook:V(),ctl:true,fade:0,said:{}};
const HOME_OUT={dx:.6,dz:.8,v:3.4,T:5};
const SEA={x0:162,z0:-245,z1:-420};             // the fog leg: through the edge of the fog and out the other side
const LEG_T=17;
function fadeTo(v,s){ const f=document.getElementById('fade'); if(!f)return; f.style.transition='opacity '+(s==null?.8:s)+'s'; f.style.opacity=String(v); }
function boat(){ return G.boat&&G.boat.mesh; }
function figure(){
  if(X.fig)return X.fig; const P=G.player; if(!P||!P.model)return null;
  const wasV=P.model.visible; P.model.visible=true; const f=P.model.clone(true); P.model.visible=wasV; f.name='rowanSailing';
  f.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } }); X.fig=f; return f;
}
function seatFigure(){ const b=boat(), f=figure(); if(!b||!f)return; if(f.parent!==b)b.add(f); f.position.set(-1.75,.5,0); f.rotation.set(0,PI/2,0); f.visible=true; }
function cross(dir,o){
  o=o||{}; if(X.on)return false;
  if(dir==='north'&&!(G.boat&&G.boat.built))return false;
  if(o.instant){ arrive(dir,true); return true; }
  X.on=true; X.dir=dir; X.t=0; X.phase=0; X.said={};
  const P=G.player; X.ctl=P.inputEnabled!==false; P.setControl&&P.setControl(false);
  G.emit('north:crossing',{dir});
  if(dir==='home'){ fadeTo(1,.9); later(1.1,()=>{ arrive('home',false); fadeTo(0,1.1); X.on=false; P.setControl&&P.setControl(true); }); return true; }
  // north: start at the home mooring
  const b=boat(); if(b){ X.boatPos.copy(b.position); X.boatYaw=b.rotation.y; } seatFigure();
  // Rowan himself waits (hidden, still) on the north beach while the camera rides the boat: nothing on the home island can
  // reach him, and a save mid-crossing lands him there with his boat
  S.at='north'; placeOnBeach(); if(P.model)P.model.visible=false;
  if(G.quest)G.quest.set('north:crossing','The crossing','North, for the green light',null,'');
  X.camPos.copy(G.camera.position); X.camLook.copy(X.boatPos);
  return true;
}
function setBoat(x,z,yaw){ const b=boat(); if(!b)return; b.position.x=x; b.position.z=z; b.rotation.y=yaw; X.boatPos.set(x,b.position.y,z); X.boatYaw=yaw; }
function updateCrossing(dt){
  if(!X.on||X.dir!=='north')return;
  X.t+=dt; const t=X.t, b=boat(); if(!b){ X.on=false; return; }
  if(X.phase===0){
    // out from the beach: turn the bow to sea and go
    const k=smooth(0,2.2,t), yaw0=G.boat.debug.moor.yaw, yaw1=Math.atan2(-HOME_OUT.dz,HOME_OUT.dx);
    const yaw=lerp(yaw0,yaw0+U.angDiff(yaw1,yaw0),k), v=HOME_OUT.v*smooth(0,1.5,t);
    setBoat(X.boatPos.x+Math.cos(yaw)*v*dt,X.boatPos.z-Math.sin(yaw)*v*dt,yaw);
    if(!X.said.a&&t>.6){ X.said.a=1; say('North, then. Toward the light that put me on the rocks.','Rowan',{key:'cross1'}); }
    if(t>HOME_OUT.T-.9&&!X.said.fade){ X.said.fade=1; fadeTo(1,.8); }
    if(t>HOME_OUT.T){ X.phase=1; X.t=0; setBoat(SEA.x0,SEA.z0,PI/2); X.camPos.set(SEA.x0+2,4,SEA.z0+11); fadeTo(0,1.4); G.emit('north:fogLeg',{}); }
  }else if(X.phase===1){
    // the fog: our light behind, the green one ahead; she runs straight for it
    const u=clamp(t/LEG_T,0,1), z=lerp(SEA.z0,SEA.z1,u), x=SEA.x0+Math.sin(u*2.1)*3;
    setBoat(x,z,PI/2+Math.cos(u*2.1)*.05);
    if(!X.said.b&&t>2.2){ X.said.b=1; say('Hesper’s light behind me. The green one ahead.','Rowan',{key:'cross2'}); }
    if(!X.said.c&&t>7){ X.said.c=1; say('Every sailor on this coast knows it: you don’t steer for a light you can’t name.','Rowan',{key:'cross3'}); }
    if(!X.said.d&&t>11.5){ X.said.d=1; say('I did, once. That’s how I got home.','Rowan',{key:'cross4'}); }
    if(t>LEG_T-1&&!X.said.fade){ X.said.fade=1; fadeTo(1,.9); }
    if(t>LEG_T+.15){ X.phase=2; X.t=0; arrive('north',false); fadeTo(0,1.4); }
  }else if(X.phase===2){ if(t>.4){ X.on=false; const P=G.player; if(P.model)P.model.visible=true; P.setControl&&P.setControl(true); } }
  // bob
  const tt=G.time||0; b.position.y=(G.world.seaLevel||0)-.3+Math.sin(tt*1.3)*.09; b.rotation.z=Math.sin(tt*1.1)*.05; b.rotation.x=Math.sin(tt*.8+1)*.035;
  // the camera: behind and above the stern, looking past the bow (toward the green light on the fog leg)
  if(X.phase<2){ const fx=Math.cos(X.boatYaw), fz=-Math.sin(X.boatYaw), side=X.phase===0?-1:1;
    const want=V(X.boatPos.x-fx*8.5+fz*side*2.2,3.6,X.boatPos.z-fz*8.5-fx*side*2.2);
    const look=X.phase===1&&G.north?V(lerp(X.boatPos.x+fx*20,G.north.pos.x,.03),2.4+.02*(G.north.pos.y),lerp(X.boatPos.z+fz*20,G.north.pos.z,.03)):V(X.boatPos.x+fx*14,1.6,X.boatPos.z+fz*14);
    const k=1-Math.exp(-dt*(X.t<.05?99:3.2)); X.camPos.lerp(want,k); X.camLook.lerp(look,k);
    G.camera.position.copy(X.camPos); G.camera.lookAt(X.camLook); G.focus.copy(X.boatPos); }
}
function placeOnBeach(){
  const P=G.player, by=isleH(BEACH.x,BEACH.z), yaw=Math.atan2(-COVE_DIR.x,-COVE_DIR.z);   // facing up the beach, inland
  P.teleport(BEACH.x,by,BEACH.z,yaw); if(P.aimCamera)P.aimCamera(yaw,.18);
  G.state.checkpoint.set(BEACH.x,by,BEACH.z); G.state.checkpointYaw=yaw; G.state.checkpointName='the north island';
}
function arrive(dir,instant){
  const P=G.player, GB=G.boat;
  if(dir==='north'){
    S.at='north'; if(GB&&GB.moorAt)GB.moorAt(NMOOR.x,NMOOR.z,NMOOR.yaw);
    placeOnBeach();
    if(X.fig)X.fig.visible=false;
    const first=!S.landed; S.landed=true;
    if(!instant&&first){ later(1.6,()=>say('Every boat on this beach steered for that light.','Rowan',{key:'land1'})); later(3.4,()=>say('I’d have been one more.','Rowan',{key:'land2'}));
      later(5.2,()=>{ try{ G.ui.toast('The north island','The wrecker’s light'); }catch(e){} }); }
    if(!instant&&!first)later(1.4,()=>say('Back on the north island.',null,{key:'landAgain',priority:'low'}));
    setQuest();
  }else{
    S.at='home'; if(GB&&GB.moorHome)GB.moorHome();
    const W=G.boat&&G.boat.debug.wreckPos, m=G.boat&&G.boat.debug.moor, x=W?W.x-2.2:76, z=W?W.z+3.2:70, yaw=m?Math.atan2(m.x-x,m.z-z)+PI:0;
    P.teleport(x,G.floorAt(x,z,G.world.height(x,z)+2),z,yaw); if(P.aimCamera)P.aimCamera(yaw,.2);
    G.state.checkpoint.set(P.pos.x,P.pos.y,P.pos.z); G.state.checkpointYaw=yaw; G.state.checkpointName='the south beach';
    if(X.fig)X.fig.visible=false;
    if(!instant)later(1.2,()=>say('You sail south with the green light at your back, and Hesper’s light on the headland brings you in.',null,{key:'home1'}));
    setQuest();
  }
  if(P.model)P.model.visible=true;
  G.emit('north:landed',{dir,instant:!!instant});
}

/* ================================================================ 5. ON THE ISLAND */
function setQuest(){
  if(!G.quest)return;
  if(S.at!=='north'){ if(G.boat&&G.boat.built)G.quest.set('boat:ready','Sail north',S.landed?'Your boat is in the shallows by the wreck. The north island is across the water':'Your boat is waiting in the shallows by the wreck',boat()?boat().position.clone().add(V(0,2,0)):null,'Your boat'); return; }
  if(!S.door)G.quest.set('north:tower','The north island','Find who keeps the green light',doorPos?doorPos.clone().setY(TOWER.base+1.5):null,'The wrecker’s tower');
  else if(G.northCave&&G.northCave.mouth)G.northCave.setQuest();
  else G.quest.set('north:door','The wrecker’s tower','Barred from inside',doorPos?doorPos.clone().setY(TOWER.base+1.5):null,'The wrecker’s tower');
}
function readBoard(b){
  const first=!S.read[b.id]; S.read[b.id]=true; G.emit('north:board',{id:b.id});
  if(!first){ say(b.lines[0],'Rowan'); return; }
  b.lines.forEach((l,i)=>say(l,'Rowan',{key:'board-'+b.id+i}));
  try{ G.ui.logLine&&G.ui.logLine('A nameboard on the beach of wrecks: '+b.name.charAt(0)+b.name.slice(1).toLowerCase()+', '+b.port.toLowerCase().replace(/(^|\s)\S/g,s=>s.toUpperCase())+'.','Found'); }catch(e){}
}
function tryDoor(){
  const first=!S.door; S.door=true; G.emit('north:door',{first});
  try{ const A=G.audio; if(A&&A.ready&&A.S){ const t=A.context.currentTime; A.S.thud(t,{g:.22,dur:.2}); A.S.thud(t+.32,{g:.18,dur:.18}); } }catch(e){}
  if(first){ say('Barred. From the inside.','Rowan',{key:'door1'}); later(1.6,()=>say('Someone’s up there. Someone keeps that fire lit.','Rowan',{key:'door2'}));
    later(3.4,()=>say('Wreckers always have a way up from the water. There’ll be another way in.','Rowan',{key:'door4'})); }
  else say('Still barred. Whoever’s inside isn’t coming down.','Rowan',{key:'door3'});
  setQuest();
}
function lookPile(){
  say('Every crate prised open, and everything worth having gone. Someone salvages what the light brings in.','Rowan',{key:'pile'});
  S.read.pile=true;
}

/* ================================================================ 6. SAVE */
function load(d){ if(!d)return; S.at=d.at==='north'?'north':'home'; S.landed=!!d.landed; S.read=Object.assign({},d.read||{}); S.door=!!d.door;
  if(S.at==='north'&&G.boat&&G.boat.moorAt)G.boat.moorAt(NMOOR.x,NMOOR.z,NMOOR.yaw); }
const reg=()=>G.persist&&G.persist.register&&G.persist.register('northIsle',{save:()=>({v:1,at:S.at,landed:S.landed,read:Object.assign({},S.read),door:S.door}),load});
if(G.persist&&G.persist.register)reg(); else G.on('ready',reg);
G.on('game:reset',()=>{ S.at='home'; S.landed=false; S.read={}; S.door=false; });

/* ================================================================ 7. WIRING */
G.system('northIsle',{order:85,modes:['play','paused','dead','title'],
  init(){
    try{ root=new THREE.Group(); root.name='northIsle'; G.scene.add(root); const GE=G.world.geo;
      buildTerrain(); buildFoam(); buildRocks(GE); buildWrecks(GE); buildTower(GE); root.visible=false; }catch(e){ console.error('northIsle',e); }
    const IA=G.interact;
    for(const b of BOARDS)IA.add({pos:()=>b.pos,radius:2.1,priority:4,label:()=>S.read[b.id]?'The '+b.name.charAt(0)+b.name.slice(1).toLowerCase():'Read the nameboard',enabled:()=>isPlay()&&inside&&!X.on,use:()=>readBoard(b)});
    IA.add({pos:()=>doorPos,radius:2.4,priority:5,label:'Try the door',enabled:()=>isPlay()&&inside&&!X.on&&!!doorPos,use:tryDoor});
    IA.add({pos:()=>S._pile,radius:2.2,priority:3,label:'Look over the crates',enabled:()=>isPlay()&&inside&&!X.on&&!!S._pile&&!S.read.pile,use:lookPile});
    IA.add({pos:()=>V(NMOOR.x+COVE_DIR.x*-3,.4,NMOOR.z+COVE_DIR.z*-3),radius:4.8,priority:4,label:'Sail home',enabled:()=>isPlay()&&inside&&!X.on&&S.at==='north',use:()=>cross('home')});
  },
  update(dt){
    for(let i=timers.length-1;i>=0;i--){ if(G.time>=timers[i].t){ const f=timers[i].fn; timers.splice(i,1); try{ f(); }catch(e){ console.error(e); } } }
    const P=G.player; const was=inside; inside=onIsland(P&&P.pos);
    if(inside!==was)G.emit(inside?'north:enter':'north:leave',{});
    // over here the objective is this island's (after a load, or if something else took the HUD while you were away)
    if(inside&&!X.on&&S.at==='north'&&G.quest&&!/^north:/.test(G.quest.step||'')&&G.state.mode==='play')setQuest();
    if(G.state.mode==='play'||G.state.mode==='dead')updateCrossing(dt||0);
    // only draw the island when you could possibly see it (it's 700 m out, past the fog)
    if(root){ const cam=G.camera.position; root.visible=Math.hypot(cam.x-C.x,cam.z-C.z)<380;
      if(root.visible){ const t=G.time||0; if(towerFire){ const fl=.8+.2*Math.sin(t*9.1)*Math.sin(t*3.7); towerFire.scale.set(1,fl*1.1,1); towerFire.rotation.y=t*.7; fireMat.opacity=.55+.3*fl; }
        if(fireLight)fireLight.intensity=1.5*(.8+.2*Math.sin(t*7.3)); if(foamMat)foamMat.opacity=.42+.12*Math.sin(t*1.1); if(foam&&foam.material.map)foam.material.map.offset.x=t*.01; } }
    if(inside&&!S.seenTower&&P&&Math.hypot(P.pos.x-TOWER.x,P.pos.z-TOWER.z)<40){ S.seenTower=true; say('A tower. No keeper’s tower: no lens, no glass. Just a fire in a cage.','Rowan',{key:'tower1'}); }
  }
});
G.on('boat:built',()=>{ if(S.at==='north'&&G.boat&&G.boat.moorAt)G.boat.moorAt(NMOOR.x,NMOOR.z,NMOOR.yaw); });

const API=G.northIsle={get inside(){ const P=G.player; return onIsland(P&&P.pos)||!!(G.northCave&&G.northCave.inside); },   // live (fog.js asks before this system runs)
  centre:C,tower:TOWER,cove:{beach:BEACH,moor:NMOOR,dir:COVE_DIR,mouthA:MOUTH_A},shoreR,setQuest:()=>setQuest(),box:BOX,path:PATH,
  get at(){ return S.at; }, get landed(){ return S.landed; }, get crossing(){ return X.on; }, get boatPos(){ return X.on&&X.dir==='north'?X.boatPos:null; }, get crossPhase(){ return X.phase; },
  height:isleH, inBox, cross, state:S,
  debug:{ arrive:(d)=>arrive(d||'north',true), get doorPos(){ return doorPos; }, boards:BOARDS, get pile(){ return S._pile; }, X }};
})();

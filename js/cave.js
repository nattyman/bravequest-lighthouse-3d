/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — cave.js  (Cave agent)
   The Drowned Keepers' Cave: the sea-cave mouth at the foot of the
   lighthouse cliff (low-tide causeway), and the interior placed far
   off-island at O (cave-local coords: world = O + local).
   - one analytic layout (zones = signed-distance shapes with floors and
     ceilings) drives physics (floor provider, wall constrainer, camera)
     AND the visuals (chunked floor/ceiling heightfields), so they agree.
   - water = 1.5 x G.tide.level (local y), one shader plane for the cave
   - darkness, ether veins + G.cave.lightRoom, gates, the collapsing wall
     and the Wound, entering/leaving with a fade (carrying the swarm)
   See CAVE.md for the shared API.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth,vnoise}=U;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);

/* ================================================================ 1. FRAME */
const O=V(0,60,800);                  // cave origin (CAVE.md). y is +60: player.js respawns anyone below y -3.
const toWorld=(x,y,z)=>V(O.x+x,O.y+y,O.z+z);
const toLocal=v=>V(v.x-O.x,v.y-O.y,v.z-O.z);
const BOX={x0:-16,x1:82,z0:-96,z1:26};               // local extents of everything
const inBoxW=(x,z)=>x>O.x+BOX.x0&&x<O.x+BOX.x1&&z>O.z+BOX.z0&&z<O.z+BOX.z1;
const HIGH_LINE=1.6;                                 // local y of the high-water mark (tide line on the rock)
const tideLevel=()=>(G.tide&&isFinite(G.tide.level))?G.tide.level:1;
const water=()=>1.5*tideLevel();

/* ================================================================ 2. LAYOUT (cave-local) */
// signed distances (negative inside)
function sdBox(px,pz,x0,x1,z0,z1,r){ const cx=(x0+x1)/2,cz=(z0+z1)/2,hx=(x1-x0)/2-r,hz=(z1-z0)/2-r;
  const qx=Math.abs(px-cx)-hx,qz=Math.abs(pz-cz)-hz; return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-r; }
function sdSeg(px,pz,ax,az,bx,bz,w){ const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz; let t=((px-ax)*dx+(pz-az)*dz)/l2; t=t<0?0:t>1?1:t;
  return Math.hypot(px-ax-dx*t,pz-az-dz*t)-w; }
const nz=(x,z,a)=>a*(vnoise(x*.55+3.3,z*.55-1.7)-.5);           // small floor undulation
const ZONES=[];
/** zone: {id,room,sd,floor,ceil,kind:'rock'|'timber',rough,sand,sump} */
function zone(o){ o.kind=o.kind||'rock'; o.rough=o.rough==null?.8:o.rough; if(typeof o.floor==='number'){const f=o.floor;o.floor=()=>f;}
  if(typeof o.ceil==='number'){const c=o.ceil;o.ceil=()=>c;} ZONES.push(o); return o; }
const rect=(id,room,x0,x1,z0,z1,r,floor,ceil,o)=>zone(Object.assign({id,room,sd:(x,z)=>sdBox(x,z,x0,x1,z0,z1,r),floor,ceil,bb:[x0,x1,z0,z1]},o||{}));
const seg=(id,room,ax,az,bx,bz,w,floor,ceil,o)=>zone(Object.assign({id,room,sd:(x,z)=>sdSeg(x,z,ax,az,bx,bz,w),floor,ceil,
  bb:[Math.min(ax,bx)-w,Math.max(ax,bx)+w,Math.min(az,bz)-w,Math.max(az,bz)+w]},o||{}));
const circ=(id,room,cx,cz,r,floor,ceil,o)=>zone(Object.assign({id,room,sd:(x,z)=>Math.hypot(x-cx,z-cz)-r,floor,ceil,bb:[cx-r,cx+r,cz-r,cz+r]},o||{}));
/** stepped floor: treads from (a0 -> a1) along axis, y0 -> y1 in n rises */
function stairF(axis,a0,a1,y0,y1,n){ return (x,z)=>{ const c=axis==='x'?x:z; const t=clamp((c-a0)/(a1-a0),0,.9999); return y0+(y1-y0)*Math.min(n,Math.floor(t*(n+1)))/n; }; }

// --- the mouth: sand rising inward, the seaward end drops into the sea
const mouthF=(x,z)=>{ let f=z>3?lerp(-.7,-3.6,smooth(3,11,z)):lerp(-.7,2.0,smooth(3,-22,z));
  // two shallow tide pools
  f-=.55*(1-smooth(.4,1.7,Math.hypot(x+3.4,z+6.5)))+.45*(1-smooth(.3,1.4,Math.hypot(x-3.2,z+13.5)));
  return f+nz(x,z,.18); };
const mouthC=(x,z)=>lerp(5.2,8.6,smooth(5,-16,z));
rect('mouthOuter','mouth',-4.6,4.6,-6,14,2.2,mouthF,mouthC,{sand:1,rough:.6});
rect('mouthInner','mouth',-7,7,-23,-3,3,mouthF,mouthC,{sand:1});
seg('mouthNeck','gallery',0,-20,0,-28.5,3.1,(x,z)=>lerp(1.85,3,smooth(-21,-26.5,z))+nz(x,z,.1),6.2,{rough:.55});
// --- gallery of keepers
const galC=(x,z)=>9.5+2.5*clamp(1-(x*x)/150-((z+35)*(z+35))/90,0,1);
rect('gallery','gallery',-12,12,-44,-26,2.6,(x,z)=>3+nz(x,z,.06),galC);
const STATUES=[[-12.9,-30.2,PI/2],[-12.9,-35.5,PI/2],[-12.9,-40.8,PI/2],[12.9,-35.5,-PI/2],[12.9,-40.8,-PI/2]];
STATUES.forEach((s,i)=>rect('alcove'+i,'gallery',s[0]<0?-14.6:11,s[0]<0?-11:14.6,s[1]-1.7,s[1]+1.7,.6,3.35,6.5,{rough:.4}));
seg('galDoor','gallery',0,-43,0,-49.5,2.3,(x,z)=>lerp(3,1.0,smooth(-44.8,-48.6,z))+nz(x,z,.05),5,{rough:.35});
// --- the flooding stair
rect('landing','stair',-9.5,4,-54.2,-48.6,.6,(x,z)=>1.0+nz(x,z,.05),13,{rough:.5});
rect('stairPool','stair',-5,6.4,-74.5,-52.4,1.6,(x,z)=>-3.3+nz(x,z,.6),13);
rect('stairShore','stair',-11.6,-4,-70,-51.6,1.2,(x,z)=>-.5+nz(x,z,.12)-.25*smooth(-6,-4,x),13,{sand:1});
rect('stairSteps','stair',-9.5,-6,-61,-52,.05,stairF('z',-53,-61,1.0,-.4,4),13,{kind:'timber'});
rect('ledge','stair',4.6,10.2,-75.2,-60,.8,(x,z)=>2.6+nz(x,z,.05),13,{rough:.5});
rect('ledgeLink','stair',-3,10.2,-78.4,-73.6,.6,(x,z)=>2.6+nz(x,z,.05),9,{rough:.35});
seg('lowPassage','stair',-8,-68,-8,-79,1.8,(x,z)=>z>-75.2?-1+nz(x,z,.06):lerp(-1,.8,smooth(-75.2,-78,z)),(x,z)=>lerp(1.3,5,smooth(-75.5,-79.5,z)),{rough:.35,sump:1});
// --- the channel
rect('channelHead','channel',-11,4.2,-91,-78,1.0,(x,z)=>.8+nz(x,z,.1),9,{sand:1});
rect('headStairs','channel',-9,-3,-87.5,-84.5,.05,stairF('x',-9,-3,.8,4,9),9,{kind:'timber'});
rect('deck','channel',-3,4,-83,-77,.05,2.6,9,{kind:'timber'});
rect('deckStairs','channel',0,4,-85.6,-82.2,.05,stairF('z',-83,-84.6,2.6,4,4),9,{kind:'timber'});
rect('jetty','channel',2.6,6.6,-81.4,-79,.05,.9,9,{kind:'timber',rough:.2});
rect('channel','channel',4.2,47.6,-85.6,-76.5,.4,(x,z)=>-3+nz(x,z,.5),10);
rect('walkway','channel',-3,47,-87.6,-84.5,.3,4,9,{rough:.3,shelf:3.86});
// --- the sluice walk and the hall of drafts
rect('sluiceWalk','drafts',46,63,-88.6,-84.4,.4,4,7.2,{rough:.3});
const draftF=(x,z)=>(z<-80?4:lerp(4,3,smooth(-80,-74,z)))+(z>-41?lerp(0,-2,smooth(-37,-32,z)):0)+nz(x,z,.05);
rect('drafts','drafts',55.6,64.4,-88.6,-39,1.6,draftF,(x,z)=>6.6+.6*Math.sin(z*.4));
seg('arenaDoor','drafts',60,-41,60,-30,2.2,draftF,6,{rough:.35});
// --- the undertow (arena), the pedestal islet, the grotto of the Wound, the shortcut
const AC={x:60,z:-15}, AR=18, POOL_R=8.8;
const arenaF=(x,z)=>{const d=Math.hypot(x-AC.x,z-AC.z); return d<POOL_R?-4.6+nz(x,z,.8):d<POOL_R+.9?lerp(-4.6,1,(d-POOL_R)/.9):1+nz(x,z,.1);};
circ('arena','arena',AC.x,AC.z,AR,arenaF,(x,z)=>15-4*smooth(8,AR,Math.hypot(x-AC.x,z-AC.z)));
circ('islet','arena',AC.x,AC.z,2.7,(x,z)=>1.35+nz(x,z,.06),15,{rough:.2});
seg('causeway','arena',AC.x,AC.z+2.2,AC.x,AC.z+POOL_R+1,1.05,(x,z)=>1.0+nz(x,z,.08),15,{rough:.2});
const WOUND=V(60,-3.9,8.5);
circ('grotto','arena',60,9.5,9.5,(x,z)=>-4.1-1.6*smooth(4,9,Math.hypot(x-60,z-9.5))+nz(x,z,.5),11,{rough:.9});
const TUN=[[43.5,-14.3],[31,-8.2],[20,-5],[7,-10.4]];
for(let i=0;i<TUN.length-1;i++) seg('shortcut'+i,'arena',TUN[i][0],TUN[i][1],TUN[i+1][0],TUN[i+1][1],1.75,(x,z)=>lerp(.9,1.0,smooth(8,40,x))+nz(x,z,.05),4.4,{rough:.35});

/** rooms (CAVE.md table), bounds used by room() in order */
const ROOMDEF={
  mouth:{centre:[0,.3,-10],b:[[-8,8.5,-21,15]],spawn:[0,null,-2,PI]},     // spawn yaw: player.js faces (sin yaw, cos yaw)
  gallery:{centre:[0,3,-35],b:[[-15,15,-47,-21]],spawn:[0,3,-28,PI]},
  stair:{centre:[0,1,-62],b:[[-12.5,11,-77.6,-47]],spawn:[-3,1,-50.5,PI]},
  channel:{centre:[25,0,-80],b:[[-12.5,48,-93,-76.5]],spawn:[-6,.8,-82,PI/2]},
  drafts:{centre:[60,3,-60],b:[[44,66,-93,-36]],spawn:[60,3,-70,0]},
  arena:{centre:[60,1,-15],b:[[38,80,-36,22],[5,44,-18,0]],spawn:[60,1,-30,0]},
};
const ROOM_IDS=Object.keys(ROOMDEF);
function roomAtL(x,z){ for(const id of ROOM_IDS) for(const b of ROOMDEF[id].b) if(x>=b[0]&&x<=b[1]&&z>=b[2]&&z<=b[3])return id; return null; }

/* ---------- the field: walls = union of zones roughened with noise (only ever shrinks) ---------- */
function sdMin(x,z){ let m=1e9,r=.8; for(const Z of ZONES){ const b=Z.bb; if(x<b[0]-6||x>b[1]+6||z<b[2]-6||z>b[3]+6)continue; const d=Z.sd(x,z); if(d<m){m=d;r=Z.rough;} } return [m,r]; }
const wallNoise=(x,z)=>.62*vnoise(x*.33+11.1,z*.33+4.2)+.38*vnoise(x*.9-7.7,z*.9+2.9);
function Sraw(x,z){ const [m,r]=sdMin(x,z); return m+r*wallNoise(x,z); }
/** physics floor among zones at (x,z) for a character at y: highest floor <= y+.9 */
function zoneFloor(x,z,y){ let f=null, rock=null; for(const Z of ZONES){ const b=Z.bb; if(x<b[0]||x>b[1]||z<b[2]||z>b[3])continue; if(Z.sd(x,z)>=0)continue;
  const h=Z.floor(x,z);
  if(Z.kind==='rock'){ if(rock==null||h>rock)rock=h; }      // overlapping rock zones: the highest is solid all the way down (as the visual field draws it)
  else if(h<=y+.9&&(f==null||h>f))f=h; }                     // timber (stairs, decks, jetty) can be walked under
  if(rock!=null&&(f==null||rock>f))f=rock;                    // may be above y+.9: then it is a ledge face (moveCharacter's step test blocks it), never a space underneath
  return f; }
function zonesAt(x,z){ const out=[]; for(const Z of ZONES){ const b=Z.bb; if(x<b[0]||x>b[1]||z<b[2]||z>b[3])continue; if(Z.sd(x,z)<0)out.push(Z);} return out; }
function inSump(x,z){ const zs=zonesAt(x,z); return zs.some(Z=>Z.sump)&&!zs.some(Z=>!Z.sump&&Z.floor(x,z)>-.9); } // the low passage proper (not where the shore overlaps it)

/* ---------- grid (built at script-evaluation time so anchors are ready for other modules) ---------- */
const GS=.4, GX0=BOX.x0, GZ0=BOX.z0, NX=Math.round((BOX.x1-BOX.x0)/GS)+1, NZ=Math.round((BOX.z1-BOX.z0)/GS)+1;
const gS=new Float32Array(NX*NZ), gF=new Float32Array(NX*NZ), gC=new Float32Array(NX*NZ), gSand=new Uint8Array(NX*NZ);
const t0=performance.now();
(function buildField(){
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){
    const x=GX0+i*GS, z=GZ0+j*GS, k=j*NX+i;
    // nearest zones (softmin blend for floors/ceilings outside)
    let m=1e9,r=.8,wsum=0,fb=0,cb=0,fin=-1e9,cin=-1e9,sand=0,any=false;
    for(const Z of ZONES){ const b=Z.bb; if(x<b[0]-8||x>b[1]+8||z<b[2]-8||z>b[3]+8)continue;
      const d=Z.sd(x,z); if(d<m){m=d;r=Z.rough;}
      const w=Math.exp(-Math.max(d,0)*2.2); if(Z.kind==='rock'){ wsum+=w; fb+=w*(Z.shelf!=null?Z.shelf:Z.floor(x,z)); cb+=w*Z.ceil(x,z); }
      if(d<0){ any=true; cb=cb; if(Z.kind==='rock'){ const fv=Z.shelf!=null?Z.shelf:Z.floor(x,z); if(fv>fin)fin=fv; if(Z.sand&&d<-.2)sand=1; } const cv=Z.ceil(x,z); if(cv>cin)cin=cv; }
    }
    const S=m+r*wallNoise(x,z);
    gS[k]=S; gSand[k]=sand;
    if(wsum<1e-6){ gF[k]=20; gC[k]=-20; continue; }
    const fBase=(any&&fin>-1e8)?fin:fb/wsum, cBase=(any&&cin>-1e8)?Math.max(cin,cb/wsum):cb/wsum;
    const head=Math.max(.5,cBase-fBase), vault=Math.min(2.4,head*.33);
    const sp=Math.max(S,0), lump=vnoise(x*.45+.5,z*.45+8.1)-.5;
    gF[k]=fBase+(S>0?(1.05*sp+1.0*sp*sp)*(1+.5*lump):0);
    gC[k]=cBase-vault*smooth(-3.2,0,S)-(S>0?(1.05*sp+1.0*sp*sp)*(1-.4*lump):0)+1.1*(vnoise(x*.21+4,z*.21-6)-.5)*smooth(-.5,-3,S);
  }
})();
const fieldMs=Math.round(performance.now()-t0);
function bil(A,x,z,out){ const fx=(x-GX0)/GS, fz=(z-GZ0)/GS; if(fx<0||fz<0||fx>=NX-1||fz>=NZ-1)return out;
  const i=fx|0,j=fz|0,u=fx-i,v=fz-j,k=j*NX+i; return (A[k]*(1-u)+A[k+1]*u)*(1-v)+(A[k+NX]*(1-u)+A[k+NX+1]*u)*v; }
const Sat=(x,z)=>bil(gS,x,z,10), Fat=(x,z)=>bil(gF,x,z,20), Cat=(x,z)=>bil(gC,x,z,-20);

/* ---------- blockers (gates, seals, the far wall): boxes in local coords ---------- */
const blockers={};
function blockS(x,z,y){ let s=-1e9; for(const id in blockers){ const b=blockers[id]; if(!b)continue; if(y!=null&&(y+1.6<b.y0||y>b.y1))continue;
  const v=-sdBox(x,z,b.x-b.hw,b.x+b.hw,b.z-b.hd,b.z+b.hd,0); if(v>s)s=v; } return s; }
const Sphys=(x,z,y)=>Math.max(Sat(x,z),blockS(x,z,y));

/* ---------- wall-snapped anchors ---------- */
/** march from (x,z) along (dx,dz) to the wall; returns {x,z,nx,nz} (n points into the room) */
function toWall(x,z,dx,dz){ const l=Math.hypot(dx,dz); dx/=l; dz/=l; let px=x,pz=z;
  for(let i=0;i<300&&Sat(px,pz)<0;i++){px+=dx*.1;pz+=dz*.1;}
  const e=.25, gx=Sat(px+e,pz)-Sat(px-e,pz), gz=Sat(px,pz+e)-Sat(px,pz-e), gl=Math.hypot(gx,gz)||1;
  return {x:px,z:pz,nx:-gx/gl,nz:-gz/gl}; }
/** the visible wall surface at local height y near a wall point (follows the heightfield rise) */
function wallSurface(w,y){ let px=w.x,pz=w.z;
  for(let i=0;i<40;i++){ const f=Fat(px,pz); if(f>=y)break; px-=w.nx*.06; pz-=w.nz*.06; }
  return V(px+w.nx*.05,y,pz+w.nz*.05); }
const VEINDEF={
  mouth:[[-3,-9,-1,0,1.5],[3,-16,1,0,2.4],[-4,-18,-1,-.2,3.2]],
  gallery:[[-8,-33,-1,0,4.9],[8,-38.5,1,0,4.9],[-5,-29,0,1,5.4]],
  stair:[[-7,-50.5,-1,.2,2.8],[8,-66,1,0,4.8],[0,-55,.3,1,4.2]],
  channel:[[-6,-88.5,0,-1,3.0],[18,-86,0,-1,6.6],[38,-86,0,-1,6.6]],
  drafts:[[58,-62,-1,0,4.6],[62,-48,1,0,4.6]],
  arena:[[48,-24,-1,-.6,3.6],[72,-24,1,-.6,3.6],[73,-8,1,.4,4.0]],
};
const VEINS={}, LIGHTS={};
for(const id in VEINDEF){ VEINS[id]=[]; LIGHTS[id]=[];
  for(const v of VEINDEF[id]){ const w=toWall(v[0],v[1],v[2],v[3]); const p=wallSurface(w,v[4]);
    VEINS[id].push({w,p,y:v[4]}); }
  for(let i=0;i<Math.min(2,VEINS[id].length);i++){ const q=VEINS[id][i]; LIGHTS[id].push(V(q.p.x+q.w.nx*1.8,q.y+.6,q.p.z+q.w.nz*1.8)); }
}
LIGHTS.arena.push(V(WOUND.x,WOUND.y+5,WOUND.z-4)); // the Wound lights the arena from below once revealed

/* ---------- exported rooms + anchors (world coordinates) ---------- */
const W3=a=>toWorld(a[0],a[1],a[2]);
const ANCH={
  mouth:{vein:VEINS.mouth[0].p, arrive:V(0,0,-1), exit:V(0,0,2.2)},
  gallery:{roost:V(8,3,-30),seal:V(0,3,-46),page:V(-7,3,-42.4)},
  stair:{crates:V(.6,0,-58),crateSpots:[V(-1.3,0,-56.4),V(.9,0,-59),V(3.3,0,-61.6)],ledge:V(7.6,2.6,-66),lowPassage:V(-8,-1,-73.5),landing:V(-2,1,-51)},
  channel:{raftStart:V(7,0,-80),raftEnd:V(45,0,-80),seal:V(47,1,-80),walkway:V(22,4,-86.1),page:V(31,4,-86.9),jetty:V(5,.9,-80.2),gate:V(47,4,-86.5)},
  drafts:{vents:[V(58.4,3,-66),V(61.6,3,-58),V(58.4,3,-50)],door:V(60,3,-38)},
  arena:{pool:V(AC.x,0,AC.z),door:V(60,1.6,-34),pedestal:V(AC.x,1.35,AC.z),page:V(70,1,-27),wound:WOUND.clone(),exit:V(20,1,-5),grate:V(42.6,1,-13.9)},
};
// anchors that stand on the floor take the floor height
const SNAP={gallery:['roost','seal','page'],stair:['ledge','lowPassage','landing'],channel:['walkway','page','jetty','gate'],drafts:['vents','door'],arena:['door','pedestal','page','exit','grate']};
for(const id in SNAP)for(const k of SNAP[id]){ const a=ANCH[id][k]; (Array.isArray(a)?a:[a]).forEach(p=>{ const f=zoneFloor(p.x,p.z,50); if(f!=null)p.y=f; }); }
const rooms={};
for(const id of ROOM_IDS){ const d=ROOMDEF[id], b=d.b[0];
  const anchors={}; for(const k in ANCH[id]){ const a=ANCH[id][k]; anchors[k]=Array.isArray(a)?a.map(p=>W3([p.x,p.y,p.z])):W3([a.x,a.y,a.z]); }
  anchors.veins=VEINS[id].map(v=>W3([v.p.x,v.p.y,v.p.z]));
  rooms[id]={id,centre:W3(d.centre),bounds:{min:toWorld(b[0],-12,b[2]),max:toWorld(b[1],20,b[3])},anchors};
}

/* ================================================================ 3. THE ISLAND MOUTH */
const MX=181.2, MZ_FACE=53.6, MZ_BACK=50.3;                // arch centre x, front face z, inner end z
const H=(x,z)=>G.world.height(x,z);
const apronF=(x,z)=>z<MZ_FACE?.38-.04*(z-MZ_BACK)+nz(x,z,.06):lerp(.24,-.95,smooth(MZ_FACE,57.8,z))-.55*smooth(.75,1.05,Math.hypot((x-MX)/5.2,(z-55.4)/2.9))+nz(x,z,.08);
const inApron=(x,z)=>(z>=MZ_BACK&&z<=MZ_FACE+.2&&Math.abs(x-MX)<2.05)||(z>MZ_FACE&&Math.hypot((x-MX)/4.9,(z-55.4)/2.7)<1);
const CW=[[97,55.7],[110,56.7],[124,55.9],[138,56.9],[152,56.2],[166,57.5],[176,57.7],[181.2,57.2]], CW_Y=-.95, CW_HW=2.0;
function cwDist(x,z){ let best=1e9; for(let i=0;i<CW.length-1;i++){ const d=sdSeg(x,z,CW[i][0],CW[i][1],CW[i+1][0],CW[i+1][1],0); if(d<best)best=d; } return best; }
const cwF=(x,z)=>CW_Y+.07*(vnoise(x*.6,z*.6)-.5)-.25*smooth(CW_HW-.6,CW_HW+1.4,cwDist(x,z));
const loopOn=()=>!!(G.loop&&G.loop.active);
const cwDry=()=>(G.world.tide||0)<CW_Y-.06;            // the bar is above the sea
const mouthY=apronF(MX,51.3);
G.world.landmarks.caveMouth={x:MX,y:mouthY,z:52.4};
const mouthPos=V(MX,mouthY,52.4);
const outsidePos=V(MX,apronF(MX,54.6),54.6);
G.walkOverrides.push((x,z)=>{
  if(x<95||x>188||z<49||z>61||!loopOn())return null;
  if(inApron(x,z))return true;
  if(cwDist(x,z)<CW_HW&&cwDry())return true;   // covered: the island's own rule (deep water) applies
  return null;
});
G.floorProviders.push((x,z,y)=>{
  if(x<95||x>188||z<49||z>61||!loopOn())return null;
  if(inApron(x,z)){ const h=apronF(x,z); return h<=y+.9?h:null; }
  const d=cwDist(x,z); if(d<CW_HW+1.4){ const h=cwF(x,z); return h<=y+.9?h:null; }
  return null;
});

/* the sandbar and the arch hug the foot of the cliff: keep the follow camera out over the sea (it would sit inside the
   cliff or the arch's rock otherwise). player.js owns the camera, so this swings the boom's end (same length) into a seaward
   cone about the player; at the arch itself it looks straight in. */
const CAM_COS=-.3, CAM_YAW=Math.acos(CAM_COS);
G.cameraConstrainers.push((cam,t)=>{
  if(S.inside||!loopOn()||t.x<95||t.x>190||t.z<48.5||t.z>62||t.y>6)return;
  let dx=cam.x-t.x, dz=cam.z-t.z; const L=Math.hypot(dx,dz); if(L<.05)return;
  const k=smooth(8.5,5.5,Math.hypot(t.x-MX,t.z-52.4)); // 0 out on the sandbar .. 1 under the arch
  if(dz/L<-CAM_COS){ const sn=Math.sign(dx)||1; dx=sn*L*Math.sqrt(1-CAM_COS*CAM_COS); dz=L*-CAM_COS; }
  else if(k<=0)return;
  if(k>0){ let a=Math.atan2(dx,dz); a*=1-k; dx=Math.sin(a)*L; dz=Math.cos(a)*L; }
  cam.x=t.x+dx; cam.z=t.z+dz; const f=G.floorAt(cam.x,cam.z,cam.y); if(cam.y<f+.4)cam.y=f+.4;
});

/* ================================================================ 4. PHYSICS (interior) */
G.floorProviders.push((x,z,y)=>{
  if(!inBoxW(x,z))return null;
  const lx=x-O.x, lz=z-O.z, ly=y-O.y;
  const f=zoneFloor(lx,lz,ly); return f==null?null:f+O.y;
});
G.constrainers.push((prev,next,y,rad,who)=>{
  if(!inBoxW(next.x,next.z)&&!inBoxW(prev.x,prev.z))return false;
  rad=rad||.4; const ly=y-O.y;
  let nx=next.x-O.x, nzz=next.z-O.z; const px=prev.x-O.x, pz=prev.z-O.z;
  const s0=Sphys(px,pz,ly);
  let s=Sphys(nx,nzz,ly)+rad; if(s<=0)return false;
  for(let k=0;k<4&&s>0;k++){ const e=.12, gx=Sphys(nx+e,nzz,ly)-Sphys(nx-e,nzz,ly), gz=Sphys(nx,nzz+e,ly)-Sphys(nx,nzz-e,ly), gl=Math.hypot(gx,gz)||1;
    nx-=gx/gl*(s+.005); nzz-=gz/gl*(s+.005); s=Sphys(nx,nzz,ly)+rad; }
  if(s>.02&&!(s0+rad>0&&Sphys(nx,nzz,ly)<s0)){ next.x=prev.x; next.z=prev.z; return true; }
  if(Math.hypot(nx-px,nzz-pz)>Math.hypot(next.x-prev.x,next.z-prev.z)+.05){ next.x=prev.x; next.z=prev.z; return true; }
  next.x=nx+O.x; next.z=nzz+O.z; return true;
});
const _cp=new THREE.Vector3();
G.cameraConstrainers.push((cam,target)=>{
  if(!S.inside)return;
  const tx=target.x-O.x, ty=target.y-O.y, tz=target.z-O.z, cx=cam.x-O.x, cy=cam.y-O.y, cz=cam.z-O.z;
  const bad=(x,y,z)=>Sat(x,z)>-.24||y>Cat(x,z)-.34||y<Fat(x,z)+.4||(y<water()+.18&&Fat(x,z)<water()); // margins leave room for camera shake
  const L=Math.hypot(cx-tx,cy-ty,cz-tz), n=Math.max(1,Math.ceil(L/.12));
  let gx=tx,gy=ty,gz=tz;
  if(bad(tx,ty,tz)){ // target itself is tight: just keep the camera under the ceiling
    // the follow target is damped, so hugging a curved wall it can lag into the rock: then use the player's own column
    // (always open floor), moved toward the target only as far as stays clear of the wall
    let bx=tx, bz=tz; const P=G.player&&G.player.pos;
    if(P&&Sat(tx,tz)>-.3){ const px=P.x-O.x, pz=P.z-O.z; bx=px; bz=pz; const m=Math.max(1,Math.ceil(Math.hypot(tx-px,tz-pz)/.08));
      for(let i=1;i<=m;i++){ const x=px+(tx-px)*i/m, z=pz+(tz-pz)*i/m; if(Sat(x,z)>-.3)break; bx=x; bz=z; } }
    cam.set(bx+O.x,O.y+Math.min(Math.max(ty,Fat(bx,bz)+.45),Cat(bx,bz)-.2),bz+O.z); return; }
  for(let i=1;i<=n;i++){ const t=i/n, x=tx+(cx-tx)*t, y=ty+(cy-ty)*t, z=tz+(cz-tz)*t; if(bad(x,y,z))break; gx=x;gy=y;gz=z; }
  cam.set(gx+O.x,gy+O.y,gz+O.z);
});

/* ================================================================ 5. STATE + API */
const S={inside:false,room:null,lit:new Set(),gates:{channel:false,shortcut:false},wallDown:false,woundShown:false,
  trans:null,lastDry:new THREE.Vector3(),dryT:0,pushT:0,prevCp:null,reached:new Set(),footReg:null,footT:0,stranded:false,built:false,hidden:[],farPrev:1200};
const transferHooks=[];
const VIS={gates:{channel:false,shortcut:false}};
const SWARM=new Set(['lantern','satchel','feed','hunt','jar','jarRelease','released']);
function setGate(id,open){ open=!!open; if(S.gates[id]===open&&S.built)return; S.gates[id]=open;
  if(id==='channel')blockers.channelGate=open?null:{x:47,z:-86.5,hw:.45,hd:2.3,y0:2,y1:9};
  if(id==='shortcut')blockers.shortcut=open?null:{x:42.4,z:-13.9,hw:.4,hd:2.2,y0:-3,y1:6};
  if(VIS.gates)VIS.gates[id]=open;
}
setGate('channel',false); setGate('shortcut',false);
blockers.farWall={x:60,z:4.6,hw:11,hd:1.6,y0:-12,y1:30};
// the walkway is a rock shelf: where it overhangs the channel head nothing may walk underneath it (you'd be inside the rock)
blockers.underWalkway={x:.7,z:-86.05,hw:3.9,hd:1.75,y0:-6,y1:3.3};
function room(pos){ if(!pos||!inBoxW(pos.x,pos.z)||pos.y<O.y-20)return null; return roomAtL(pos.x-O.x,pos.z-O.z); }
const cave=G.cave={
  inside:false, origin:O.clone(), toWorld, toLocal, water, waterWorld:()=>O.y+water(), room, rooms, mouth:mouthPos.clone(),
  zones:ZONES, swarmStates:SWARM,
  /** cave-local helpers for other modules: wall distance (<0 open), visible floor/ceiling heights */
  sdf:(x,z)=>Sat(x,z), floorVis:(x,z)=>Fat(x,z), ceilVis:(x,z)=>Cat(x,z),
  lowPassageOpen:()=>water()<-1+.2,
  /** soft-lock guards: the region at a world pos (rooms split at their seals/grates), whether it has an open way to the mouth, the way out */
  region:pos=>pos&&inBoxW(pos.x,pos.z)?regionAt(pos.x-O.x,pos.z-O.z):null, connected:()=>[...connected()], stranded:()=>!!S.stranded,
  reached:()=>[...S.reached], followDraught:()=>followDraught(),
  enter:(roomId,o)=>startTrans('in',roomId||'mouth',o), exit:o=>startTrans('out',null,o),
  lightRoom, isLit:id=>S.lit.has(id), setGate, gate:id=>!!S.gates[id], collapseWall,
  /** register fn(delta:Vector3, info{to:'cave'|'island'}) — called when the player is teleported in/out, to carry your things */
  onTransfer:fn=>{transferHooks.push(fn);},
  /** add/remove a physical blocker in cave-local coords: block('gallerySeal',{x,z,hw,hd,y0,y1}) / block('gallerySeal',null) */
  block:(id,b)=>{ blockers[id]=b?Object.assign({y0:-50,y1:50},b):null; },
  get wallDown(){return S.wallDown;}, get litRooms(){return [...S.lit];},
  stats:{fieldMs}
};
G.interior=null;
const INTERIOR={id:'cave',contains:(x,z,y)=>inBoxW(x,z)&&(y==null||y>O.y-40)};

/* ================================================================ 6. VISUALS */
const caveRoot=new THREE.Group(); caveRoot.name='cave'; caveRoot.position.copy(O); caveRoot.visible=false;
const mouthRoot=new THREE.Group(); mouthRoot.name='caveMouth'; mouthRoot.visible=false;
const tUni={uTime:{value:0},uOY:{value:O.y},uHigh:{value:HIGH_LINE},uWater:{value:0}};

/* ---------- textures ---------- */
function rockCanvas(g,s){
  const r=U.rng(4417); g.fillStyle='#8a857d'; g.fillRect(0,0,s,s);
  const wrapDraw=(fn)=>{for(const ox of [-s,0,s])for(const oy of [-s,0,s])fn(ox,oy);};
  for(let i=0;i<520;i++){ const x=r()*s,y=r()*s,rad=6+r()*42,l=38+r()*34,a=.06+r()*.12,h=24+r()*40;
    wrapDraw((ox,oy)=>{ const gr=g.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,rad); gr.addColorStop(0,`hsla(${h},${5+r()*7}%,${l}%,${a})`); gr.addColorStop(1,`hsla(${h},8%,${l}%,0)`); g.fillStyle=gr; g.fillRect(x+ox-rad,y+oy-rad,rad*2,rad*2); }); }
  // strata
  for(let i=0;i<14;i++){ const y=r()*s, a=.05+r()*.07; g.fillStyle=`rgba(40,36,32,${a})`; g.fillRect(0,y,s,2+r()*5); g.fillStyle=`rgba(255,250,240,${a*.6})`; g.fillRect(0,y+5,s,1.5); }
  // cracks
  g.lineCap='round';
  for(let i=0;i<22;i++){ let x=r()*s,y=r()*s,a=r()*TAU; const n=5+r()*10; g.strokeStyle=`rgba(22,18,20,${.12+r()*.18})`; g.lineWidth=.7+r()*1.3;
    wrapDraw((ox,oy)=>{ let px=x,py=y,aa=a; g.beginPath(); g.moveTo(px+ox,py+oy); for(let k=0;k<n;k++){aa+=(r()-.5)*.9;px+=Math.cos(aa)*7;py+=Math.sin(aa)*7;g.lineTo(px+ox,py+oy);} g.stroke(); }); }
  // speckles + lichen
  for(let i=0;i<2600;i++){ const x=r()*s,y=r()*s; g.fillStyle=r()<.5?`rgba(255,250,235,${.05+r()*.1})`:`rgba(20,16,14,${.06+r()*.12})`; g.fillRect(x,y,1+r()*2,1+r()*2); }
  for(let i=0;i<40;i++){ const x=r()*s,y=r()*s,rad=3+r()*9; g.fillStyle=`rgba(${r()<.5?'150,160,120':'170,150,170'},${.1+r()*.12})`; g.beginPath(); g.arc(x,y,rad,0,TAU); g.fill(); }
}
let rockTex=null;
function rockMaterial(o={}){
  if(!rockTex){ rockTex=G.canvasTex(512,rockCanvas); rockTex.wrapS=rockTex.wrapT=THREE.RepeatWrapping; }
  const m=G.toon('#ffffff',Object.assign({vertexColors:true},o.mat||{}));
  const scale=(o.scale||.22).toFixed(3), tide=o.tide!==false;
  m.onBeforeCompile=sh=>{
    sh.uniforms.uRock={value:rockTex}; sh.uniforms.uOY=tUni.uOY; sh.uniforms.uHigh=tUni.uHigh; sh.uniforms.uTime=tUni.uTime;
    sh.vertexShader='varying vec3 vWP;varying vec3 vWN;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vWP=(modelMatrix*vec4(transformed,1.)).xyz; vWN=normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader='uniform sampler2D uRock;uniform float uOY,uHigh,uTime;varying vec3 vWP;varying vec3 vWN;\n'+sh.fragmentShader.replace('#include <map_fragment>',`
      { vec3 bw=pow(abs(normalize(vWN)),vec3(4.)); bw/=dot(bw,vec3(1.));
        vec4 tx=texture2D(uRock,vWP.zy*${scale}), ty=texture2D(uRock,vWP.xz*${scale}), tz=texture2D(uRock,vWP.xy*${scale});
        vec4 tc=tx*bw.x+ty*bw.y+tz*bw.z; tc.rgb=pow(tc.rgb,vec3(2.2));
        diffuseColor.rgb*=tc.rgb*1.6;
        ${tide?`float ly=vWP.y-uOY; float wet=1.-smoothstep(uHigh-.15,uHigh+.35,ly);
        diffuseColor.rgb*=mix(1.,.58,wet);
        float alg=(1.-smoothstep(0.,.55,abs(ly-uHigh+.35)))*step(.25,abs(normalize(vWN).y-1.));
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.62,.82,.6),alg*.7);`:''}
      }`);
  };
  m.customProgramCacheKey=()=>'caveRock'+scale+tide;
  return m;
}

/* ---------- geometry helpers ---------- */
function mergeGeos(list){ // [{geo, color}] -> non-indexed BufferGeometry with position/normal/color
  let n=0; const parts=list.map(({geo,color})=>{ const g=geo.index?geo.toNonIndexed():geo; if(!g.attributes.normal)g.computeVertexNormals(); n+=g.attributes.position.count; return {g,color}; });
  const pos=new Float32Array(n*3), nor=new Float32Array(n*3), col=new Float32Array(n*3); let o=0;
  for(const {g,color} of parts){ const p=g.attributes.position.array, q=g.attributes.normal.array, c=g.attributes.color?g.attributes.color.array:null;
    pos.set(p,o*3); nor.set(q,o*3);
    for(let i=0;i<g.attributes.position.count;i++){ if(c){col[(o+i)*3]=c[i*3];col[(o+i)*3+1]=c[i*3+1];col[(o+i)*3+2]=c[i*3+2];} else {col[(o+i)*3]=color.r;col[(o+i)*3+1]=color.g;col[(o+i)*3+2]=color.b;} }
    o+=g.attributes.position.count; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3)); g.setAttribute('color',new THREE.BufferAttribute(col,3));
  g.computeBoundingSphere(); return g;
}
const C=hex=>U.col(hex);
class Builder{ constructor(){this.list=[];} add(geo,color,x,y,z,ry,rx,rz){ const g=geo.clone(); const m=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx||0,ry||0,rz||0,'YXZ')); m.setPosition(x||0,y||0,z||0); g.applyMatrix4(m); this.list.push({geo:g,color:typeof color==='string'?C(color):color}); return this; }
  box(w,h,d,color,x,y,z,ry,rx,rz){ return this.add(new THREE.BoxGeometry(w,h,d),color,x,y,z,ry,rx,rz); }
  cyl(r0,r1,h,color,x,y,z,seg,ry,rx,rz){ return this.add(new THREE.CylinderGeometry(r0,r1,h,seg||7),color,x,y,z,ry,rx,rz); }
  mesh(mat){ if(!this.list.length)return null; const m=new THREE.Mesh(mergeGeos(this.list),mat); return m; } }
/** a lumpy boulder geometry */
function boulderGeo(seed,detail){ const g=new THREE.IcosahedronGeometry(1,detail==null?2:detail); const p=g.attributes.position; const r=U.rng(seed);
  const o1=r()*10,o2=r()*10;
  for(let i=0;i<p.count;i++){ const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    let k=1+.38*(vnoise(x*1.3+o1,z*1.3+y*1.1+o2)-.5)+.16*(vnoise(x*3.1+o2,y*3.1+o1)-.5);
    const yy=y*.78; const cut=y>.55?.55+(y-.55)*.35:y; p.setXYZ(i,x*k,cut*k*.8+yy*.0,z*k); }
  const g2=g.index?g.toNonIndexed():g; g2.computeVertexNormals(); return addWhite(g2); }
function addWhite(g){ g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(1),3)); return g; }
function tube(points,r,seg,rseg){ return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),seg||Math.max(4,points.length*4),r,rseg||5,false); }

/* ---------- the rock shell: chunked floor + ceiling heightfields ---------- */
const COL={rock:C('#67646a'),rock2:C('#4f5463'),sand:C('#857a66'),sandWet:C('#565048'),ceil:C('#4c4a52'),floorRock:C('#6f6a63')};
function buildShell(mat){
  const CH=40; // cells per chunk (16 m)
  const jx=new Float32Array(NX*NZ), jz=new Float32Array(NX*NZ);
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){ const k=j*NX+i, x=GX0+i*GS, z=GZ0+j*GS, s=gS[k];
    const a=s>-.25?.17*smooth(-.25,.6,s):0; jx[k]=(vnoise(x*1.3+5,z*1.3)-.5)*2*a; jz[k]=(vnoise(x*1.3,z*1.3+9)-.5)*2*a; }
  const nrm=(A,i,j,sgn)=>{ const i0=Math.max(0,i-1),i1=Math.min(NX-1,i+1),j0=Math.max(0,j-1),j1=Math.min(NZ-1,j+1);
    const dx=(A[j*NX+i1]-A[j*NX+i0])/((i1-i0)*GS), dz=(A[j1*NX+i]-A[j0*NX+i])/((j1-j0)*GS); const v=new THREE.Vector3(-dx*sgn,sgn,-dz*sgn); return v.normalize(); };
  const tc=new THREE.Color(); let tris=0, meshes=0;
  for(let cj=0;cj<NZ-1;cj+=CH)for(let ci=0;ci<NX-1;ci+=CH){
    const i1=Math.min(NX-1,ci+CH), j1=Math.min(NZ-1,cj+CH);
    const pos=[],nor=[],col=[],idx=[]; const vF=new Map(), vC=new Map();
    const vert=(i,j,ceil)=>{ const map=ceil?vC:vF, key=j*NX+i; let v=map.get(key); if(v!=null)return v;
      const k=key, x=GX0+i*GS+jx[k], z=GZ0+j*GS+jz[k], y=ceil?gC[k]:gF[k]; v=pos.length/3; pos.push(x,y,z);
      const n=nrm(ceil?gC:gF,i,j,ceil?-1:1); nor.push(n.x,n.y,n.z);
      const s=gS[k], lum=.82+.36*vnoise(x*.13+2,z*.13+y*.2);
      if(ceil){ tc.copy(COL.ceil).lerp(COL.rock2,vnoise(x*.2,z*.2)); }
      else if(s<0&&gSand[k]){ tc.copy(COL.sand).lerp(COL.sandWet,smooth(.6,-.6,y)); }
      else if(s<0){ tc.copy(COL.floorRock); }
      else { tc.copy(COL.rock).lerp(COL.rock2,vnoise(x*.17+y*.3,z*.17)*.8); if(gSand[k]===0&&y<1)tc.lerp(COL.sandWet,.2); }
      tc.multiplyScalar(lum); col.push(tc.r,tc.g,tc.b); map.set(key,v); return v; };
    for(let j=cj;j<j1;j++)for(let i=ci;i<i1;i++){
      const k=[j*NX+i,j*NX+i+1,(j+1)*NX+i,(j+1)*NX+i+1];
      if(Math.min(gS[k[0]],gS[k[1]],gS[k[2]],gS[k[3]])>2.8)continue;
      if(k.every(q=>gF[q]>=gC[q]-.02))continue;
      if(gF[k[0]]>15&&gC[k[0]]<-15)continue;
      // floor (CCW from above)
      const a=vert(i,j,0),b=vert(i+1,j,0),c=vert(i,j+1,0),d=vert(i+1,j+1,0); idx.push(a,c,b,b,c,d);
      const A=vert(i,j,1),B=vert(i+1,j,1),Cc=vert(i,j+1,1),D=vert(i+1,j+1,1); idx.push(A,B,Cc,B,D,Cc);
      tris+=4;
    }
    if(!idx.length)continue;
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    g.setIndex(idx); g.computeBoundingSphere();
    const m=new THREE.Mesh(g,mat); m.receiveShadow=false; m.name='caveShell'; caveRoot.add(m); meshes++;
  }
  cave.stats.shellTris=tris; cave.stats.shellMeshes=meshes;
}

/* ---------- water ---------- */
let waterMat=null, heightTex=null;
function buildWater(){
  const data=new Uint8Array(NX*NZ);
  for(let k=0;k<NX*NZ;k++) data[k]=Math.round(clamp((gF[k]+8)/16,0,1)*255);
  heightTex=new THREE.DataTexture(data,NX,NZ,THREE.LuminanceFormat,THREE.UnsignedByteType);
  heightTex.magFilter=heightTex.minFilter=THREE.LinearFilter; heightTex.generateMipmaps=false; heightTex.needsUpdate=true;
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uWater:{value:0},uH:{value:null},uBox:{value:new THREE.Vector4(GX0,GZ0,(NX-1)*GS,(NZ-1)*GS)},
    uO:{value:O.clone()},uLamp:{value:new THREE.Vector3()},uLampI:{value:0},uLampC:{value:C('#9a6cff')},uAmb:{value:0},uWound:{value:WOUND.clone()},uWoundK:{value:0}}]);
  u.uH.value=heightTex; u.uTime=tUni.uTime;
  waterMat=new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,fog:true,
    vertexShader:`varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 wp=modelMatrix*vec4(position,1.); vW=wp.xyz; vec4 mvPosition=viewMatrix*wp; gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`uniform float uTime,uWater,uLampI,uAmb,uWoundK;uniform sampler2D uH;uniform vec4 uBox;uniform vec3 uO,uLamp,uLampC,uWound;varying vec3 vW;
      #include <fog_pars_fragment>
      float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}
      float wav(vec2 q,float t){return vn(q+vec2(t*.31,t*.17))+.5*vn(q*2.3-vec2(t*.45,-t*.27))+.25*vn(q*5.1+vec2(-t*.6,t*.5));}
      void main(){
        vec2 lp=vW.xz-uO.xz; vec2 uv=(lp-uBox.xy)/uBox.zw;
        float fl=texture2D(uH,uv).r*16.-8.;
        float d=uWater-fl; if(d<-.04)discard;
        float t=uTime; vec2 q=lp*.85; float e=.12;
        float h0=wav(q,t), hx=wav(q+vec2(e,0.),t), hz=wav(q+vec2(0.,e),t);
        vec3 N=normalize(vec3((h0-hx)*.9,1.,(h0-hz)*.9));
        vec3 Vv=normalize(cameraPosition-vW);
        float fres=.03+.97*pow(1.-max(dot(N,Vv),0.),5.);
        vec3 col=mix(vec3(.022,.05,.055),vec3(.002,.006,.011),smoothstep(0.,2.6,d));
        vec3 Ld=uLamp-vW; float ld=length(Ld); Ld/=max(ld,.001);
        float att=uLampI/(1.+ld*ld*.07);
        vec3 Hh=normalize(Ld+Vv);
        col+=uLampC*(att*.07*(1.-smoothstep(0.,2.2,d)));
        col+=uLampC*pow(max(dot(N,Hh),0.),70.)*att*2.4;
        col+=mix(vec3(.05,.04,.09),uLampC*.6,.3)*fres*(.25+uAmb*1.3);
        col+=vec3(.03,.02,.06)*uAmb;
        float fo=(1.-smoothstep(0.,.32,d))*smoothstep(.42,.8,vn(lp*2.6+vec2(t*.5,-t*.2))+.25*sin(t*1.7+d*24.));
        fo+= (1.-smoothstep(0.,.08,d))*.6;
        col=mix(col,vec3(.42,.44,.5)*(.06+att*.55+uAmb*.35),clamp(fo,0.,1.)*.85);
        float wd=length(lp-uWound.xz); float wk=uWoundK*(1.-smoothstep(1.5,11.,wd));
        col+=vec3(.32,.1,.75)*wk*(.55+.45*sin(uTime*1.25-wd*.7));
        float a=mix(.5,.94,smoothstep(0.,1.5,d)); a=max(a,clamp(fo,0.,1.)*.9); a=mix(a,.16,wk);
        col+=vec3(.5,.25,1.)*wk*smoothstep(.55,.9,vn(lp*1.7+vec2(t*.35,-t*.2))*vn(lp*3.1-vec2(t*.2,t*.4))*1.8)*.35;
        gl_FragColor=vec4(col,a);
        #include <fog_fragment>
      }`});
  const w=(NX-1)*GS, dd=(NZ-1)*GS;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,dd,1,1).rotateX(-PI/2),waterMat);
  m.position.set(GX0+w/2,0,GZ0+dd/2); m.renderOrder=3; m.frustumCulled=false; m.name='caveWater'; caveRoot.add(m);
  VIS.water=m;
}

/* ---------- veins + lit glow ---------- */
const veinMats={}, glowPts={geo:null,alpha:null,room:[]};
function buildVeins(){
  const gpos=[], galpha=[], groom=[];
  for(const id in VEINS){
    const mat=new THREE.MeshBasicMaterial({color:C('#3a2366')}); veinMats[id]=mat;
    const b=new Builder(); const r=U.rng(id.length*977+13);
    for(const v of VEINS[id]){
      const w=v.w, tx=w.nz, tz=-w.nx; // tangent along the wall
      const branch=(a0,b0,ang,len,rad,depth)=>{ const pts=[]; let a=a0,bb=b0,an=ang;
        for(let k=0;k<=len;k++){ const p=wallSurface({x:w.x+tx*a,z:w.z+tz*a,nx:w.nx,nz:w.nz},v.y+bb); pts.push(p); an+=(r()-.5)*.9; a+=Math.cos(an)*.32; bb+=Math.sin(an)*.32; }
        b.add(tube(pts,rad,len*3,4),'#ffffff');
        if(depth<2) for(let q=0;q<2;q++){ const k=2+Math.floor(r()*(len-2)); if(k<pts.length-1&&r()<.75){ const p=pts[k]; branch(a0+(k*.3)*Math.cos(ang),b0+(k*.3)*Math.sin(ang),ang+(r()<.5?1:-1)*(.7+r()*.6),Math.floor(len*.5),rad*.6,depth+1); } }
      };
      for(let q=0;q<3;q++) branch((r()-.5)*.6,(r()-.5)*.4,q*TAU/3+r()*.6,9,.055,0);
      gpos.push(v.p.x+w.nx*.3,v.p.y,v.p.z+w.nz*.3); galpha.push(0); groom.push(id);
      // a dim seam glow so dark veins can be found by lantern
    }
    const m=b.mesh(mat); if(m){ m.name='veins_'+id; caveRoot.add(m); }
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(gpos,3)); g.setAttribute('alpha',new THREE.Float32BufferAttribute(galpha,1));
  const pm=new THREE.ShaderMaterial({uniforms:{uMap:{value:G.tex.soft},uTime:tUni.uTime},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:'attribute float alpha;varying float vA;uniform float uTime;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vA=alpha*(.85+.15*sin(uTime*1.3+position.x));gl_PointSize=900.*(1.+alpha)/-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform sampler2D uMap;varying float vA;void main(){vec4 t=texture2D(uMap,gl_PointCoord);gl_FragColor=vec4(vec3(.62,.38,1.)*t.a*vA*1.6,1.);}'});
  const pts=new THREE.Points(g,pm); pts.frustumCulled=false; pts.renderOrder=4; caveRoot.add(pts);
  glowPts.geo=g; glowPts.room=groom;
}

/* ---------- small shared props ---------- */
let barnMat, ironMat, timberMat, ropeMat, statueMat;
function scatterOnWalls(n,seed,test){ // random wall points: {x,y,z,nx,nz}
  const r=U.rng(seed), out=[]; let tries=0;
  while(out.length<n&&tries<n*60){ tries++;
    const x=GX0+r()*(BOX.x1-BOX.x0), z=GZ0+r()*(BOX.z1-BOX.z0); const s=Sat(x,z); if(s<.02||s>.9)continue;
    const e=.3, gx=Sat(x+e,z)-Sat(x-e,z), gz=Sat(x,z+e)-Sat(x,z-e), gl=Math.hypot(gx,gz)||1;
    const p={x,z,y:Fat(x,z),nx:-gx/gl,nz:-gz/gl,s}; if(p.y>Cat(x,z)-.3)continue; if(test&&!test(p,r))continue; out.push(p); }
  return out;
}
function buildDressing(){
  const shell=rockMaterial({scale:.22});
  buildShell(shell);
  // stalactites (ceiling) + stalagmites at the wall foot
  const coneG=new THREE.LatheGeometry([[.3,0],[.27,-.12],[.2,-.3],[.17,-.45],[.12,-.62],[.08,-.8],[.035,-.95],[.01,-1]].map(p=>new THREE.Vector2(p[0],p[1])),7);
  { const p=coneG.attributes.position; for(let i=0;i<p.count;i++){ const x=p.getX(i),y=p.getY(i),z=p.getZ(i); const k=1+.35*(vnoise(x*9+y*4,z*9)-.5)+.18*Math.sin(y*14); p.setXYZ(i,x*k,y,z*k*.85); } coneG.computeVertexNormals(); addWhite(coneG); }
  const stalMat=rockMaterial({scale:.6,tide:false});
  const st=[]; const r=U.rng(321);
  for(let t=0;t<9000&&st.length<340;t++){ const x=GX0+r()*(BOX.x1-BOX.x0), z=GZ0+r()*(BOX.z1-BOX.z0); const s=Sat(x,z); if(s>-.3)continue;
    const c=Cat(x,z), f=Fat(x,z), head=c-Math.max(f,water()); if(head<3.2)continue;
    const walk=zoneFloor(x,z,f+1)!=null&&f>-1.4; const maxL=walk?Math.max(.3,head-2.6):head*.55;
    const L=Math.min(maxL,.4+r()*r()*3.2)*(s>-1.5?1.25:1); st.push([x,c+.15,z,L,.6+r()*.9,r()*TAU]); }
  const stal=new THREE.InstancedMesh(coneG,stalMat,st.length); const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), sc=new THREE.Vector3(), ps=new THREE.Vector3(), eu=new THREE.Euler();
  st.forEach((a,i)=>{ q.setFromEuler(eu.set((r()-.5)*.12,a[5],(r()-.5)*.12)); m4.compose(ps.set(a[0],a[1],a[2]),q,sc.set(a[4],a[3],a[4])); stal.setMatrixAt(i,m4); });
  { const a=new Float32Array(st.length*3); for(let i=0;i<st.length;i++){ const v=.3+r()*.16; a[i*3]=v; a[i*3+1]=v*.97; a[i*3+2]=v*1.05; } stal.instanceColor=new THREE.InstancedBufferAttribute(a,3); }
  caveRoot.add(stal); stal.name='stalactites';
  const sgG=addWhite(new THREE.ConeGeometry(.3,1,6,2)); sgG.translate(0,.5,0);
  const sg=scatterOnWalls(160,77,(p)=>p.s<.35&&p.y>-1.6);
  const smi=new THREE.InstancedMesh(sgG,stalMat,sg.length);
  sg.forEach((p,i)=>{ const h=.35+r()*1.3; m4.compose(ps.set(p.x-p.nx*.1,p.y-.1,p.z-p.nz*.1),q.setFromEuler(eu.set(-p.nz*.15,r()*TAU,p.nx*.15)),sc.set(.7+r()*.8,h,.7+r()*.8)); smi.setMatrixAt(i,m4); });
  { const a=new Float32Array(sg.length*3); for(let i=0;i<sg.length;i++){ const v=.3+r()*.14; a[i*3]=v; a[i*3+1]=v; a[i*3+2]=v*1.04; } smi.instanceColor=new THREE.InstancedBufferAttribute(a,3); }
  caveRoot.add(smi);
  // barnacles + mussels along the tide band
  barnMat=G.toon('#d8d2c4');
  const bG=new THREE.ConeGeometry(.07,.08,6,1,true); const bb=scatterOnWalls(900,99,(p)=>p.y>-1.8&&p.y<HIGH_LINE+.2);
  const bmi=new THREE.InstancedMesh(new THREE.SphereGeometry(.055,6,4,0,TAU,0,PI/2),barnMat,bb.length);
  const bcol=new Float32Array(bb.length*3);
  bb.forEach((p,i)=>{ const up=V(p.nx,.5,p.nz).normalize(); q.setFromUnitVectors(V(0,1,0),up); const s=.6+r()*1.2; const y=clamp(p.y+(r()-.3)*.8,-1.8,HIGH_LINE); const w=wallSurface({x:p.x,z:p.z,nx:p.nx,nz:p.nz},y); m4.compose(ps.set(w.x,w.y,w.z),q,sc.set(s,s*(.6+r()*.6),s)); bmi.setMatrixAt(i,m4);
    const dark=r()<.45; bcol[i*3]=dark?.1:.42; bcol[i*3+1]=dark?.11:.41; bcol[i*3+2]=dark?.17:.38; });
  bmi.instanceColor=new THREE.InstancedBufferAttribute(bcol,3); caveRoot.add(bmi);
  // kelp: draped ribbons on wet rock (mouth and stair pool)
  const kG=new THREE.PlaneGeometry(.14,1.2,1,6); { const p=kG.attributes.position; for(let i=0;i<p.count;i++){ const y=p.getY(i)+.6; p.setZ(i,Math.sin(y*3)*.12+y*y*.15); p.setY(i,y); } kG.computeVertexNormals(); }
  const kMat=G.toon('#2a3220',{side:THREE.DoubleSide});
  const kk=scatterOnWalls(150,55,(p,rr)=>p.y>-1.7&&p.y<1.2&&(roomAtL(p.x,p.z)==='mouth'||roomAtL(p.x,p.z)==='stair'||rr()<.25));
  const kmi=new THREE.InstancedMesh(kG,kMat,kk.length);
  kk.forEach((p,i)=>{ m4.compose(ps.set(p.x,p.y-.05,p.z),q.setFromEuler(eu.set(PI*.5+(r()-.5)*.6,Math.atan2(p.nx,p.nz)+(r()-.5),0)),sc.set(1,.6+r()*.9,1)); kmi.setMatrixAt(i,m4); });
  caveRoot.add(kmi);
  // bioluminescent specks on the walls (faint, twinkle)
  const bio=scatterOnWalls(700,1234,(p)=>p.s<.5), bpos=[], bcl=[], bph=[];
  const cA=C('#5fd6c8'), cB=C('#a68cff');
  bio.forEach(p=>{ const y=p.y+.2+r()*2.6; if(y>Cat(p.x,p.z)-.2)return; const w=wallSurface({x:p.x,z:p.z,nx:p.nx,nz:p.nz},y); bpos.push(w.x,w.y,w.z); const c=cA.clone().lerp(cB,r()); bcl.push(c.r,c.g,c.b); bph.push(r()*TAU); });
  const bg=new THREE.BufferGeometry(); bg.setAttribute('position',new THREE.Float32BufferAttribute(bpos,3)); bg.setAttribute('color',new THREE.Float32BufferAttribute(bcl,3)); bg.setAttribute('ph',new THREE.Float32BufferAttribute(bph,1));
  const bmat=new THREE.ShaderMaterial({uniforms:{uTime:tUni.uTime,uMap:{value:G.tex.soft},uK:{value:1}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:'attribute vec3 color;attribute float ph;varying vec3 vC;varying float vA;uniform float uTime;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vC=color;vA=.35+.65*pow(.5+.5*sin(uTime*(.6+fract(ph)*.9)+ph*7.),3.);gl_PointSize=min(26.,42./-mv.z);vA*=smoothstep(40.,8.,-mv.z);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform sampler2D uMap;uniform float uK;varying vec3 vC;varying float vA;void main(){float a=texture2D(uMap,gl_PointCoord).a;gl_FragColor=vec4(vC*a*vA*uK*.9,1.);}'});
  const bpts=new THREE.Points(bg,bmat); bpts.frustumCulled=false; caveRoot.add(bpts); VIS.bio=bmat;
  buildVeins();
  buildTimber();
  buildStatues();
  buildArena();
  buildMouthInside();
  buildDrips();
  buildWater();
}

/* ---------- timber, iron, rope ---------- */
function buildTimber(){
  const wood=G.canvasTex(256,(g,s)=>{const r=U.rng(5);g.fillStyle='#4a3626';g.fillRect(0,0,s,s);
    for(let x=0;x<s;x+=32){const l=30+r()*12;g.fillStyle=`hsl(${24+r()*8},${10+r()*8}%,${l}%)`;g.fillRect(x+1,0,30,s);
      for(let k=0;k<14;k++){g.strokeStyle='rgba(15,8,4,.3)';g.beginPath();const xx=x+3+r()*26;g.moveTo(xx,0);g.bezierCurveTo(xx+r()*6-3,s*.3,xx+r()*6-3,s*.6,xx,s);g.stroke();}
      g.fillStyle='rgba(90,110,80,.18)'; g.fillRect(x+1,s*r(),30,s*.2);}});
  wood.wrapS=wood.wrapT=THREE.RepeatWrapping;
  timberMat=G.toon('#ffffff',{vertexColors:true});
  timberMat.onBeforeCompile=sh=>{ sh.uniforms.uWood={value:wood};
    sh.vertexShader='varying vec3 vWP2;varying vec3 vWN2;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vWP2=(modelMatrix*vec4(transformed,1.)).xyz; vWN2=normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader='uniform sampler2D uWood;varying vec3 vWP2;varying vec3 vWN2;\n'+sh.fragmentShader.replace('#include <map_fragment>',`{ vec3 n=abs(normalize(vWN2)); vec2 uv=n.y>.6?vWP2.xz:(n.x>n.z?vWP2.zy:vWP2.xy); vec4 t=texture2D(uWood,uv*vec2(.5,.9)); diffuseColor.rgb*=pow(t.rgb,vec3(2.2))*1.7; }`); };
  timberMat.customProgramCacheKey=()=>'caveTimber';
  ironMat=G.toon('#ffffff',{vertexColors:true});
  ropeMat=G.toon('#8a7350');
  const T=new Builder(), I=new Builder(), R=[];
  const wd='#a49686', wdk='#6f6458', rust='#6a4434', ir='#3a3640';
  const post=(x,z,y0,y1,rr)=>T.cyl(rr||.12,(rr||.12)*1.1,y1-y0,wdk,x,(y0+y1)/2,z,6,0,(Math.random()-.5)*.05,(Math.random()-.5)*.05);
  // stair-room steps (4 treads, z -53 .. -61)
  for(let k=0;k<5;k++){ const y=1.0-.35*k, z0=-53-k*1.6; T.box(3.5,.14,1.62,wd,-7.75,y-.07,z0-.8); post(-9.3,z0-.8,-1,y-.14); post(-6.2,z0-.8,-1,y-.14); }
  T.box(.16,.3,8.4,wdk,-9.45,.4,-57,0,-.17).box(.16,.3,8.4,wdk,-6.05,.4,-57,0,-.17);
  // rope handrail down the stair
  R.push([V(-6,1.9,-53),V(-6,1.2,-57),V(-6,.6,-61.2)]);
  // channel head: lower stairs (x -9..-3), deck, deck stairs, jetty
  for(let k=0;k<10;k++){ const y=.8+3.2*k/9, x0=-9+k*.6; T.box(.62,.14,2.9,wd,x0+.3,y-.07,-86); if(k%3===0){post(x0+.3,-84.7,.5,y-.1);post(x0+.3,-87.3,.5,y-.1);} }
  for(let x=-2.8;x<4;x+=.5) T.box(.46,.12,6,wd,x+.2,2.54,-80,0,0,(Math.random()-.5)*.03);
  for(const [x,z] of [[-2.8,-77.2],[3.8,-77.2],[-2.8,-82.8],[3.8,-82.8],[.5,-80]]) post(x,z,.6,2.48,.16);
  T.box(7,.24,.24,wdk,.5,2.36,-77.3).box(7,.24,.24,wdk,.5,2.36,-82.7);
  for(let k=0;k<5;k++){ const y=2.6+1.4*k/4; T.box(4,.14,.36,wd,2,y-.07,-83.2-k*.34); }
  for(let x=3.6;x<6.6;x+=.42) T.box(.38,.12,2.4,wd,x+.2,.84,-80.2);
  post(6.4,-79.1,-3,1.3,.15); post(6.4,-81.3,-3,1.3,.15); post(3.7,-79.1,-1,.8); post(3.7,-81.3,-1,.8);
  I.add(new THREE.TorusGeometry(.16,.04,6,12),rust,6.55,1.0,-80.2,PI/2);
  // walkway boardwalk + rope rail
  for(let x=-2.9;x<46.8;x+=.55) T.box(.5,.1,2.7,(Math.random()<.15)?wdk:wd,x+.25,3.95,-86.05,(Math.random()-.5)*.03);
  const rail=[]; for(let x=-2;x<=46;x+=3.2){ post(x,-84.75,3.9,5.05,.07); rail.push(V(x,4.95,-84.75)); }
  for(let i=0;i<rail.length-1;i++){ const a=rail[i],b=rail[i+1]; R.push([a,V((a.x+b.x)/2,a.y-.28,a.z),b]); }
  // mooring posts + rings in the channel
  for(const x of [14,26,38]){ post(x,-77.3,-3,1.9,.18); I.add(new THREE.TorusGeometry(.15,.035,6,12),rust,x,1.5,-77.55); }
  // mouth: ribs of an old keepers' boat half-buried in the sand
  for(let k=0;k<6;k++){ const z=-15.5+k*.75; const g=new THREE.TorusGeometry(1.25,.07,5,10,PI*.9); T.add(g,'#6b5a48',4.2,mouthF(4.2,z)-.35,z,PI/2,0,.25); }
  T.box(.18,.18,5,'#5a4a3a',4.2,mouthF(4.2,-13.6)-.2,-13.6,0,.04);
  // drafts: rusted grates over the blowholes, and drafts door frame
  for(const v of ANCH.drafts.vents){ for(let k=-3;k<=3;k++) I.box(.06,.08,2.1,rust,v.x+k*.3,3.03,v.z); I.box(2.1,.08,.08,rust,v.x,3.04,v.z-.7).box(2.1,.08,.08,rust,v.x,3.04,v.z+.7); }
  // channel east end: culvert grate in the wall behind the seal
  for(let k=-4;k<=4;k++) I.cyl(.045,.045,3.2,rust,47.55,.4,-80+k*.42,5);
  I.box(.18,.18,3.8,rust,47.55,2.0,-80).box(.18,.18,3.8,rust,47.55,-1.1,-80);
  // sluice gate frame (timber posts + stone-iron lintel), and a winch wheel on the north wall
  T.box(.42,6.6,.42,wdk,47,6.9,-88.5).box(.42,6.6,.42,wdk,47,6.9,-84.5).box(.5,.5,4.6,wdk,47,8.1,-86.5);
  T.box(.42,9.4,.42,wdk,47.1,2.2,-76.6).box(.5,.5,8.4,wdk,47.1,6.3,-80.5);
  // arena: broken scaffolding against the walls
  for(const [x,z,a] of [[45.5,-22,.4],[74.5,-22,-.4],[70,-30.5,-.9]]){ const ca=Math.cos(a), sa=Math.sin(a);
    for(const o of [-1.2,1.2]){ post(x+ca*o,z+sa*o,.8,5.2,.11); } T.box(2.8,.12,.9,wd,x,3.1,z,-a).box(2.6,.12,.9,wdk,x,4.9,z,-a+.08,0,.1); }
  // gallery: the page lectern
  T.box(.7,.08,.5,wd,-7,4.05,-42.4,.3,-.4).cyl(.07,.09,1.0,wdk,-7,3.5,-42.4,6);
  const tm=T.mesh(timberMat); tm.name='timber'; caveRoot.add(tm);
  const im=I.mesh(ironMat); im.name='iron'; caveRoot.add(im);
  // ropes (one merged mesh) incl. long hanging ropes in the shafts
  for(const [x,z,y0,y1] of [[2,-56,13,3],[-3,-33,11,6.5],[52,-20,14,4],[10,-31,10.5,7],[30,-86,8.6,5.2]]) R.push([V(x,y0,z),V(x+.08,(y0+y1)/2,z+.05),V(x,y1,z)]);
  const RB=new Builder(); R.forEach(pts=>RB.add(tube(pts,.035,16,4),'#ffffff'));
  const rm=RB.mesh(ropeMat); caveRoot.add(rm);
  // sluice: the walkway portcullis + the channel gate (both lift with setGate('channel'))
  const pc=new Builder();
  for(let k=-4;k<=4;k++) pc.box(.08,3.4,.08,ir,0,1.7,k*.44); for(const y of [.4,1.5,2.6,3.3]) pc.box(.1,.1,3.9,ir,0,y,0);
  for(let k=-4;k<=4;k++) pc.cyl(.03,.06,.22,ir,0,-.08,k*.44,4);
  VIS.portcullis=pc.mesh(ironMat); VIS.portcullis.position.set(47,4,-86.5); caveRoot.add(VIS.portcullis);
  const sg=new Builder();
  for(let z=-3.6;z<=3.6;z+=.6) sg.box(.22,6,.5,'#5a4634',0,0,z);
  sg.box(.3,.3,8,ir,0,2.5,0).box(.3,.3,8,ir,0,-.5,0).box(.3,.3,8,ir,0,-2.6,0);
  VIS.sluice=sg.mesh(timberMat); VIS.sluice.position.set(47.2,-.6,-80.5); caveRoot.add(VIS.sluice);
  const wh=new Builder(); wh.add(new THREE.TorusGeometry(.8,.07,6,20),rust,0,0,0); for(let k=0;k<6;k++) wh.box(1.55,.07,.07,rust,0,0,0,0,0,k*PI/6); wh.cyl(.16,.16,.4,ir,0,0,0,8,0,PI/2);
  VIS.wheel=wh.mesh(ironMat); VIS.wheel.position.set(48.6,6.2,-88.2); caveRoot.add(VIS.wheel);
  // the shortcut grate
  const gr=new Builder(); for(let k=-4;k<=4;k++) gr.cyl(.05,.05,3.6,rust,0,1.8,k*.42,5); for(const y of [.5,1.8,3.1]) gr.box(.09,.09,3.8,rust,0,y,0);
  VIS.grate=gr.mesh(ironMat); VIS.grate.position.set(42.4,.9,-13.9); VIS.grate.rotation.y=-.45; caveRoot.add(VIS.grate);
}

/* ---------- carved keeper statues ---------- */
function statueGeo(){
  const b=new Builder(), st='#b6ada0', dk='#1a1720';
  const prof=[[.62,0],[.66,.12],[.58,.5],[.5,1.1],[.44,1.6],[.36,1.95],[.24,2.1],[0,2.14]].map(p=>new THREE.Vector2(p[0],p[1]));
  b.add(new THREE.LatheGeometry(prof,12),st,0,.4,0);
  b.box(1.4,.4,1.4,'#9a9288',0,.2,0);
  const hood=new THREE.SphereGeometry(.36,12,9); hood.scale(1,1.2,1.12); b.add(hood,st,0,2.55,-.04);
  const face=new THREE.SphereGeometry(.24,10,8,0,TAU,0,PI*.62); face.scale(1,1.15,.5); b.add(face,dk,0,2.5,.27,0,PI/2.3);
  b.add(new THREE.CylinderGeometry(.11,.13,.7,6),st,-.27,2.0,.28,0,1.1,.25).add(new THREE.CylinderGeometry(.11,.13,.7,6),st,.27,2.0,.28,0,1.1,-.25);
  // the stone lantern held at the chest
  b.box(.34,.42,.34,'#a69e92',0,1.72,.62).add(new THREE.ConeGeometry(.3,.26,4),'#a69e92',0,2.06,.62,PI/4).cyl(.05,.05,.16,'#a69e92',0,2.24,.62,5);
  const g=mergeGeos(b.list); const p=g.attributes.position;
  for(let i=0;i<p.count;i++){ const x=p.getX(i),y=p.getY(i),z=p.getZ(i); const k=.05*(vnoise(x*5+y*3,z*5)-.5); p.setXYZ(i,x+k*Math.sign(x||1),y+k*.3,z+k); }
  g.computeVertexNormals(); return g;
}
function buildStatues(){
  statueMat=rockMaterial({scale:.9,tide:false});
  const g=statueGeo(), n=STATUES.length;
  const mi=new THREE.InstancedMesh(g,statueMat,n), win=new THREE.InstancedMesh(new THREE.BoxGeometry(.36,.26,.36),new THREE.MeshBasicMaterial({color:C('#1a1622')}),n);
  const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), s=V(1.28,1.28,1.28);
  STATUES.forEach((t,i)=>{ const y=3.35; q.setFromEuler(new THREE.Euler((i%2?.03:-.04),t[2],(i%3-1)*.035)); m4.compose(V(t[0],y,t[1]),q,s); mi.setMatrixAt(i,m4);
    const lp=V(0,1.72,.62).multiplyScalar(1.28).applyQuaternion(q).add(V(t[0],y,t[1])); m4.compose(lp,q,s); win.setMatrixAt(i,m4);
    G.addCollider({x:O.x+t[0],z:O.z+t[1],r:.85,y0:O.y-2,y1:O.y+9}); });
  caveRoot.add(mi,win); VIS.statueWin=win;
}

/* ---------- arena: pedestal, the far wall (collapsible), the Wound ---------- */
function buildArena(){
  const b=new Builder();
  b.cyl(.85,1.05,.5,'#8d877e',AC.x,1.6,AC.z,10).cyl(.55,.7,1.3,'#9a9388',AC.x,2.4,AC.z,10).cyl(.8,.62,.25,'#8d877e',AC.x,3.15,AC.z,10);
  const ped=b.mesh(rockMaterial({scale:.9,tide:false})); caveRoot.add(ped);
  const brass=G.toon(G.PAL.gold,{emissive:'#2a1d08',emissiveIntensity:.3});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.72,.06,6,24,PI*1.3),brass); ring.position.set(AC.x,3.45,AC.z); ring.rotation.set(PI/2,0,.6); caveRoot.add(ring);
  const shardMat=G.toon('#cfc7f0',{transparent:true,opacity:.5,emissive:'#6a52a8',emissiveIntensity:.25,side:THREE.DoubleSide,depthWrite:false});
  const sh=new Builder(); const r=U.rng(88);
  for(let i=0;i<14;i++){ const a=r()*TAU, d=1.2+r()*2.2; sh.add(new THREE.TetrahedronGeometry(.18+r()*.2),'#ffffff',AC.x+Math.cos(a)*d,1.35+r()*.1,AC.z+Math.sin(a)*d,r()*3,r()*3,r()*3); }
  caveRoot.add(sh.mesh(shardMat));
  // the far wall: a packed wall of boulders sealing the grotto (collapseWall drops them)
  const bg=boulderGeo(7,1), list=[]; const rr=U.rng(41);
  for(let y=-6;y<16;y+=2.1)for(let x=49;x<=71;x+=2.2){ const zz=4.3+(rr()-.5)*.9+Math.abs(x-60)*.02; list.push({p:V(x+(rr()-.5)*.6,y+(rr()-.5)*.5,zz),s:1.55+rr()*.55,rot:new THREE.Euler(rr()*3,rr()*3,rr()*3),v:0,d:rr()*1.6,spin:V((rr()-.5)*2,(rr()-.5)*2,(rr()-.5)*2)}); }
  const wm=new THREE.InstancedMesh(bg,rockMaterial({scale:.3}),list.length); wm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  { const a=new Float32Array(list.length*3); for(let i=0;i<list.length;i++){ const v=.42+rr()*.2; a[i*3]=v; a[i*3+1]=v*.98; a[i*3+2]=v*1.06; } wm.instanceColor=new THREE.InstancedBufferAttribute(a,3); }
  VIS.wall={mesh:wm,list,t:-1}; updateWallMatrices(0); caveRoot.add(wm);
  // the Wound: a jagged crack in the grotto floor (black core, violet edges, slow pulse) + rising glow
  const crack=[]; let x=WOUND.x-7.8, z=WOUND.z-1.2; const cr=U.rng(9);
  for(let i=0;i<=26;i++){ crack.push([x,z,(1-Math.abs(i/26-.5)*2)]); x+=.6; z+=(cr()-.5)*.9+Math.sin(i*.7)*.25; }
  const pos=[],uv=[],idx=[];
  crack.forEach((c,i)=>{ const w=.3+2.1*Math.pow(c[2],1.2); const y=Fat(c[0],c[1])+.04;
    for(const s of [-1,0,1]){ pos.push(c[0],y+(s===0?-.08:0),c[1]+s*w*(1+.3*(cr()-.5))); uv.push(i/26,(s+1)/2); } });
  for(let i=0;i<crack.length-1;i++){ const a=i*3; idx.push(a,a+3,a+1,a+1,a+3,a+4,a+1,a+4,a+2,a+2,a+4,a+5); }
  const cg=new THREE.BufferGeometry(); cg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); cg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); cg.setIndex(idx); cg.computeVertexNormals();
  const wU={uTime:tUni.uTime,uK:{value:0}};
  const cm=new THREE.ShaderMaterial({uniforms:wU,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform float uTime,uK;varying vec2 vUv;
      float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}
      void main(){ float d=abs(vUv.y-.5)*2.; float t=uTime;
        float sw=vn(vec2(vUv.x*14.-t*.4,d*3.+t*.3))+.5*vn(vec2(vUv.x*31.+t*.7,d*7.));
        float edge=smoothstep(.95,.35,d)*smoothstep(0.,.55,d+sw*.25);
        float pulse=.65+.35*sin(t*1.25-vUv.x*6.);
        vec3 core=vec3(.004,.002,.01)+vec3(.12,.03,.25)*pow(sw*.6,3.)*pulse;
        vec3 rim=vec3(.55,.16,1.5)*pulse*(.6+.7*sw);
        vec3 c=mix(rim*1.3,core,smoothstep(.62,.28,d+sw*.12));
        float a=edge*uK; gl_FragColor=vec4(c*uK,a); }`});
  const cmesh=new THREE.Mesh(cg,cm); caveRoot.add(cmesh);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:C('#8c55ff'),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
  glow.position.set(WOUND.x,WOUND.y+1.2,WOUND.z); glow.scale.set(22,7,1); caveRoot.add(glow);
  // shafts of light rising from the crack
  const shG=new THREE.CylinderGeometry(1.4,3.6,14,12,1,true); shG.translate(0,7,0);
  const shTex=G.canvasTex(64,(g,s)=>{const gr=g.createLinearGradient(0,0,0,s);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(1,'rgba(255,255,255,.9)');g.fillStyle=gr;g.fillRect(0,0,s,s);});
  const shM=new THREE.MeshBasicMaterial({map:shTex,color:C('#7b48ff'),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
  const shaft=new THREE.Mesh(shG,shM); shaft.position.set(WOUND.x,WOUND.y,WOUND.z); shaft.scale.set(2.6,1.2,.8); caveRoot.add(shaft);
  VIS.wound={u:wU,glow,shaft,shM,mesh:cmesh,k:0,ink:null}; cmesh.visible=glow.visible=shaft.visible=false;
}
function updateWallMatrices(dt){
  const W=VIS.wall; if(!W)return; const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3();
  let alive=0;
  W.list.forEach((b,i)=>{ if(W.t>=0&&W.t>b.d+(b.p.y+8)*.04){ b.v-=18*dt; b.p.y+=b.v*dt; b.p.z+=dt*(1.5+b.d); b.rot.x+=b.spin.x*dt; b.rot.y+=b.spin.y*dt; }
    const gone=b.p.y<-11; if(!gone)alive++;
    q.setFromEuler(b.rot); m4.compose(b.p,q,gone?s.set(0,0,0):s.set(b.s,b.s,b.s)); W.mesh.setMatrixAt(i,m4); });
  W.mesh.instanceMatrix.needsUpdate=true; W.alive=alive;
}

/* ---------- the mouth from the inside: a moonlit opening to the sea, a draft of mist ---------- */
function buildMouthInside(){
  const bd=new THREE.ShaderMaterial({uniforms:{uTime:tUni.uTime},fog:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform float uTime;varying vec2 vUv;
      float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){ float hz=.36; vec3 sky=mix(vec3(.10,.07,.16),vec3(.03,.025,.07),smoothstep(hz,1.,vUv.y));
        sky+=vec3(.16,.08,.12)*exp(-abs(vUv.y-hz)*14.);
        vec3 sea=mix(vec3(.05,.06,.09),vec3(.01,.012,.02),smoothstep(hz,0.,vUv.y));
        float glint=smoothstep(.06,.0,abs(vUv.x-.62+.02*sin(vUv.y*80.+uTime)))*step(vUv.y,hz)*(.4+.6*hs(floor(vUv*vec2(40.,90.))+floor(uTime*3.)));
        vec3 c=vUv.y>hz?sky:sea+vec3(.2,.2,.28)*glint*smoothstep(0.,hz,vUv.y);
        if(vUv.y>hz){ vec2 m=vUv-vec2(.62,.78); float md=length(m*vec2(1.,1.3)); c+=vec3(.55,.52,.62)*smoothstep(.06,.04,md)+vec3(.12,.1,.18)*exp(-md*9.); }
        gl_FragColor=vec4(c,1.); }`});
  const p=new THREE.Mesh(new THREE.PlaneGeometry(13,11),bd); p.position.set(0,1.6,13.4); p.rotation.y=PI; caveRoot.add(p);
  VIS.mist=[]; for(let i=0;i<5;i++){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:C('#7d7a99'),transparent:true,opacity:0,depthWrite:false}));
    s.userData={ph:i/5}; s.scale.set(6,2.2,1); caveRoot.add(s); VIS.mist.push(s); }
}

/* ---------- drips ---------- */
const DRIPS=40;
function buildDrips(){
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(DRIPS*3),3));
  const m=new THREE.PointsMaterial({color:C('#bfc6d8'),size:.07,transparent:true,opacity:.75,depthWrite:false});
  const pts=new THREE.Points(g,m); pts.frustumCulled=false; caveRoot.add(pts);
  VIS.drips={g,list:Array.from({length:DRIPS},()=>({x:0,y:-99,z:0,v:0,f:0,wait:Math.random()*3}))};
}
function updateDrips(dt){
  const D=VIS.drips; if(!D)return; const P=G.player.pos, lx=P.x-O.x, lz=P.z-O.z, arr=D.g.attributes.position.array;
  D.list.forEach((d,i)=>{ if(d.wait>0){ d.wait-=dt; arr[i*3+1]=-999; return; }
    if(d.y<-90){ for(let k=0;k<6;k++){ const x=lx+(Math.random()-.5)*18, z=lz+(Math.random()-.5)*18; if(Sat(x,z)<-.4){ d.x=x;d.z=z;d.y=Cat(x,z)-.15;d.v=0;d.f=Math.max(Fat(x,z),water());break; } } if(d.y<-90){d.wait=.5;return;} }
    d.v-=9.8*dt; d.y+=d.v*dt; if(d.y<=d.f){ d.y=-99; d.wait=.3+Math.random()*2.5; if(Math.random()<.2&&Math.hypot(d.x-lx,d.z-lz)<6)G.emit('cave:drip',{pos:toWorld(d.x,d.f,d.z)}); }
    arr[i*3]=d.x; arr[i*3+1]=d.y; arr[i*3+2]=d.z; });
  D.g.attributes.position.needsUpdate=true;
}

/* ---------- the island mouth ---------- */
function buildIslandMouth(){
  const rock=rockMaterial({scale:.3,tide:false});
  // arch shell: a rough half-tunnel cut into the cliff
  const prof=[]; const R=2.55, SPR=2.05; const slate=[C('#4a4e5b'),C('#5d6372'),C('#3e414c'),C('#6a645c')];
  prof.push([R,-.8],[R,.6],[R,1.4],[R,SPR]); for(let k=1;k<12;k++){const a=k/12*PI; prof.push([R*Math.cos(a),SPR+R*Math.sin(a)*.95]);} prof.push([-R,SPR],[-R,1.4],[-R,.6],[-R,-.8]);
  const nzs=10, pos=[], col=[], idx=[]; const z0=MZ_BACK-.5, z1=MZ_FACE+.4; const tc=new THREE.Color();
  for(let j=0;j<=nzs;j++){ const z=lerp(z0,z1,j/nzs); for(let i=0;i<prof.length;i++){ const [px,py]=prof[i];
    const d=.28*(vnoise(px*1.3+z*.9,py*1.3)-.5)+.14*(vnoise(px*3+z*2,py*3)-.5); const rr=Math.hypot(px,py-SPR*.5)||1;
    pos.push(MX+px+px/rr*d,py+(py>SPR?(py-SPR)/rr*d:0),z); const k=.12+.5*smooth(z0,z1,z); tc.copy(C('#5d6372')).multiplyScalar(k*(.8+.4*vnoise(px*2,z*2))); col.push(tc.r,tc.g,tc.b); } }
  const np=prof.length; for(let j=0;j<nzs;j++)for(let i=0;i<np-1;i++){ const a=j*np+i,b=a+1,c=a+np,d=c+1; idx.push(a,c,b,b,c,d); }
  const ag=new THREE.BufferGeometry(); ag.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); ag.setAttribute('color',new THREE.Float32BufferAttribute(col,3)); ag.setIndex(idx); ag.computeVertexNormals();
  const rockD=rockMaterial({scale:.3,tide:false,mat:{side:THREE.DoubleSide}});
  const arch=new THREE.Mesh(ag,rockD); mouthRoot.add(arch);
  // boulders framing the arch, tumbling into the sand; rocks along the causeway
  const bgeo=boulderGeo(31,2), B=[]; const r=U.rng(606);
  for(let k=0;k<=12;k++){ const a=k/12*PI; B.push([MX+Math.cos(a)*(R+1.3),SPR+Math.sin(a)*(R+1.1)*.95,MZ_FACE-.4+r()*.6,1.25+r()*.6]); }
  for(const s of [-1,1]) for(let k=0;k<4;k++) B.push([MX+s*(R+1.4+k*1.1+r()*.5),-.3+r()*.8-k*.2,MZ_FACE-.6+r()*1.2+k*.4,1.0+r()*.9-k*.12]);
  B.push([MX,SPR+R+2.1,MZ_FACE-1.2,2.6],[MX-2.6,SPR+R+1.5,MZ_FACE-1.4,2.2],[MX+2.8,SPR+R+1.3,MZ_FACE-1.3,2.3]);
  for(let i=1;i<CW.length-1;i++){ const a=CW[i-1],b=CW[i]; const n=Math.floor(Math.hypot(b[0]-a[0],b[1]-a[1])/3.2);
    for(let k=0;k<n;k++){ const t=(k+r())/n, x=lerp(a[0],b[0],t), z=lerp(a[1],b[1],t); const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz); const s=r()<.5?-1:1, off=CW_HW+.6+r()*1.6;
      B.push([x-dz/l*off*s,-1.3+r()*.5,z+dx/l*off*s,.45+r()*.75]); } }
  const bm=new THREE.InstancedMesh(bgeo,rockMaterial({scale:.4}),B.length); const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), eu=new THREE.Euler();
  const bcol=new Float32Array(B.length*3), tcc=new THREE.Color();
  B.forEach((b,i)=>{ q.setFromEuler(eu.set((r()-.5)*.8,r()*6,(r()-.5)*.8)); m4.compose(V(b[0],b[1],b[2]),q,V(b[3]*1.15,b[3]*.95,b[3])); bm.setMatrixAt(i,m4);
    tcc.copy(slate[i%4]).lerp(slate[(i+1)%4],r()).multiplyScalar(.55); bcol[i*3]=tcc.r; bcol[i*3+1]=tcc.g; bcol[i*3+2]=tcc.b; });
  bm.instanceColor=new THREE.InstancedBufferAttribute(bcol,3);
  tUni.uOY.value=O.y; mouthRoot.add(bm);
  // apron sand + causeway (one mesh, vertex-coloured wet sand)
  const sp=[],sc=[],si=[]; const sandW=C('#3f3b36'), sandD=C('#665c4c');
  const addStrip=(pts,hw,fn)=>{ const base=sp.length/3; let rows=0;
    for(let i=0;i<pts.length;i++){ const a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)]; const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;
      for(let k=0;k<=6;k++){ const o=(k/6*2-1)*hw; const x=pts[i][0]-dz/l*o, z=pts[i][1]+dx/l*o; const y=fn(x,z); sp.push(x,y,z); tc.copy(sandW).lerp(sandD,smooth(-1.2,.3,y)); sc.push(tc.r,tc.g,tc.b); } rows++; }
    for(let i=0;i<rows-1;i++)for(let k=0;k<6;k++){ const a=base+i*7+k,b=a+1,c=a+7,d=c+1; si.push(a,b,c,b,d,c); } };
  const cwPts=[]; for(let i=0;i<CW.length-1;i++){ const a=CW[i],b=CW[i+1]; const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1.5); for(let k=0;k<n;k++)cwPts.push([lerp(a[0],b[0],k/n),lerp(a[1],b[1],k/n)]); }
  cwPts.push(CW[CW.length-1]);
  addStrip(cwPts,CW_HW+1.6,(x,z)=>Math.max(cwF(x,z),H(x,z)-.05));
  const apPts=[]; for(let z=MZ_BACK-.3;z<=58.4;z+=.45)apPts.push([MX,z]);
  addStrip(apPts,5.4,(x,z)=>inApron(x,z)?apronF(x,z):Math.min(apronF(x,z),-.9)-.4*smooth(0,1,Math.abs(x-MX)/5.4-.6));
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3)); sg.setAttribute('color',new THREE.Float32BufferAttribute(sc,3)); sg.setIndex(si); sg.computeVertexNormals();
  const sandMat=G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide}); const sm=new THREE.Mesh(sg,sandMat); sm.receiveShadow=true; mouthRoot.add(sm);
  // the dark: layered black veils deeper in the arch
  const archShape=new THREE.Shape(); archShape.moveTo(-R,-1); archShape.lineTo(R,-1); archShape.lineTo(R,SPR); archShape.absarc(0,SPR,R,0,PI,false); archShape.lineTo(-R,-1);
  const vg=new THREE.ShapeGeometry(archShape,16);
  const blk=new THREE.Mesh(vg,new THREE.MeshBasicMaterial({color:C('#040306')})); blk.position.set(MX,0,MZ_BACK+.1); mouthRoot.add(blk);
  for(const [z,o] of [[51.6,.55],[52.7,.32]]){ const m=new THREE.Mesh(vg,new THREE.MeshBasicMaterial({color:C('#040306'),transparent:true,opacity:o,depthWrite:false})); m.position.set(MX,0,z); m.scale.set(.98,.98,1); mouthRoot.add(m); }
  // kelp on the apron edges, drips from the lip, a breath of mist from the dark
  const kG=new THREE.PlaneGeometry(.16,1.3,1,5); { const p=kG.attributes.position; for(let i=0;i<p.count;i++){ const y=p.getY(i)+.65; p.setZ(i,Math.sin(y*3)*.15); p.setY(i,y);} kG.computeVertexNormals(); }
  const km=new THREE.InstancedMesh(kG,G.toon('#2b3320',{side:THREE.DoubleSide}),18);
  for(let i=0;i<18;i++){ const a=r()*PI, x=MX+Math.cos(a)*(3.6+r()*2.2), z=MZ_FACE+.2+Math.sin(a)*2.2; q.setFromEuler(eu.set(1.45+r()*.12,r()*TAU,0)); m4.compose(V(x,Math.max(apronF(x,z),-1.1)+.02,z),q,V(.6,.5+r()*.6,1)); km.setMatrixAt(i,m4); }
  mouthRoot.add(km);
  VIS.outMist=[]; for(let i=0;i<4;i++){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:C('#8f8aab'),transparent:true,opacity:0,depthWrite:false})); s.userData={ph:i/4}; s.scale.set(5,2,1); mouthRoot.add(s); VIS.outMist.push(s); }
  const dg=new THREE.BufferGeometry(); dg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(8*3),3));
  const dp=new THREE.Points(dg,new THREE.PointsMaterial({color:C('#c9cfe0'),size:.06,transparent:true,opacity:.8,depthWrite:false})); dp.frustumCulled=false; mouthRoot.add(dp);
  VIS.outDrips={g:dg,list:Array.from({length:8},(_,i)=>({x:MX+(r()-.5)*4.4,y:4.4,v:0,w:r()*2}))};
}

/* ================================================================ 7. LIGHTING */
const CAVE_FOG0=C('#020509'), CAVE_FOG1=C('#0c1a2a'), CAVE_SKY=C('#5d7896'), CAVE_GND=C('#141c26'), CAVE_LIT=C('#8a78c8');
const pool=[]; // three pooled point lights for lit rooms (fixed count: no shader recompiles)
function lightRoom(id,o){
  if(!ROOMDEF[id]||S.lit.has(id))return false;
  S.lit.add(id); if(!(o&&o.restored)){ G.emit('cave:lit',{room:id}); save(); }
  return true;
}
function updateLighting(dt){
  const t=G.time, P=G.player.pos, lx=P.x-O.x, lz=P.z-O.z;
  for(const id in veinMats){ const lit=S.lit.has(id), m=veinMats[id];
    const k=lit?(1.6+.25*Math.sin(t*1.1+id.length)):(.22+.1*Math.pow(.5+.5*Math.sin(t*.7+id.length*1.7),4));
    m.color.setRGB(.62*k,.4*k*(lit?.95:.7),1.0*k); }
  if(glowPts.geo){ const a=glowPts.geo.attributes.alpha; for(let i=0;i<glowPts.room.length;i++){ const tgt=S.lit.has(glowPts.room[i])?1:.08; a.array[i]=U.damp(a.array[i],tgt,2,dt); } a.needsUpdate=true; }
  if(VIS.statueWin){ VIS.statueWin.material.color.copy(S.lit.has('gallery')?C('#c79a5a'):C('#1a1622')); }
  // pooled lights: nearest lit-room anchors
  const cand=[]; for(const id of S.lit) for(const p of LIGHTS[id]){ if(id==='arena'&&p===LIGHTS.arena[2]&&!S.woundShown)continue; cand.push([Math.hypot(p.x-lx,p.z-lz),p,id]); }
  if(S.woundShown) cand.push([Math.hypot(LIGHTS.arena[2].x-lx,LIGHTS.arena[2].z-lz)*.5,LIGHTS.arena[2],'wound']);
  cand.sort((a,b)=>a[0]-b[0]);
  for(let i=0;i<pool.length;i++){ const L=pool[i], c=cand[i]; if(c&&S.inside&&c[0]<45){ L.position.set(c[1].x,c[1].y,c[1].z); L.color.copy(c[2]==='wound'?C('#8a4dff'):C('#b48cff'));
      L.intensity=U.damp(L.intensity,(c[2]==='wound'?2.2:1.55)*(.9+.1*Math.sin(t*1.7+i)),3,dt); } else L.intensity=U.damp(L.intensity,0,4,dt); }
}

/* ================================================================ 8. TRANSITIONS */
const fadeEl=()=>document.getElementById('fade');
function startTrans(dir,roomId,o){
  o=o||{}; if(S.trans)return false;
  if(o.instant){ doTeleport(dir,roomId); return true; }
  S.trans={dir,room:roomId,t:0,done:false};
  const f=fadeEl(); if(f)f.style.opacity='1';
  if(G.player.setControl)G.player.setControl(false);
  G.emit(dir==='in'?'cave:entering':'cave:leaving',{room:roomId});
  return true;
}
function updateTrans(dt){
  const T=S.trans; if(!T)return; T.t+=dt;
  if(!T.done&&T.t>=.9){ T.done=true; doTeleport(T.dir,T.room); const f=fadeEl(); if(f)f.style.opacity='0'; }
  if(T.t>=1.35){ if(G.player.setControl)G.player.setControl(true); S.trans=null; }
}
function arrivalFor(roomId){
  if(roomId==='mouth'||!ROOMDEF[roomId]){ const w=water(); let z=-1;
    for(let zz=-1;zz>-21;zz-=.5){ if(mouthF(0,zz)>=w-.7){z=zz;break;} z=zz; }
    return [0,mouthF(0,z),z,PI]; }
  const s=ROOMDEF[roomId].spawn; return [s[0],s[1]==null?0:s[1],s[2],s[3]];
}
function shiftSwarm(delta,to,from){
  const P=from||G.player.pos, ms=(G.creatures&&G.creatures.moths)||[];
  for(const m of ms){ if(!m||!m.p||!SWARM.has(m.tgt))continue; if(m.p.distanceTo(P)>45)continue;
    m.p.add(delta); if(m.feedC&&m.feedC.isVector3&&m.feedC.distanceTo(P)<45)m.feedC.add(delta); }
  for(const fn of transferHooks){ try{fn(delta,{to});}catch(e){console.error('cave transfer',e);} }
}
function doTeleport(dir,roomId){
  const P=G.player, from=P.pos.clone();
  let dest, yaw;
  if(dir==='in'){ const a=arrivalFor(roomId||'mouth'); dest=toWorld(a[0],a[1],a[2]); yaw=a[3];
    if(!S.prevCp){ S.prevCp={p:G.state.checkpoint.clone(),yaw:G.state.checkpointYaw,name:G.state.checkpointName}; }
    const ma=arrivalFor('mouth'); G.state.checkpoint.copy(toWorld(ma[0],ma[1],ma[2])); G.state.checkpointYaw=0; G.state.checkpointName='the mouth of the sea cave';
  }else{ dest=outsidePos.clone(); yaw=-CAM_YAW; // facing home along the sandbar, the camera out over the water
    if(S.prevCp){ G.state.checkpoint.copy(S.prevCp.p); G.state.checkpointYaw=S.prevCp.yaw; G.state.checkpointName=S.prevCp.name; S.prevCp=null; }
    else if(inBoxW(G.state.checkpoint.x,G.state.checkpoint.z)){ const st=G.world.landmarks.start||{x:164,y:42,z:-4,yaw:PI/2}; G.state.checkpoint.set(st.x,st.y,st.z); G.state.checkpointYaw=st.yaw||0; G.state.checkpointName='the lighthouse'; } }
  P.teleport(dest.x,dest.y,dest.z,yaw);
  const delta=P.pos.clone().sub(from);
  shiftSwarm(delta,dir==='in'?'cave':'island',from);
  setInside(dir==='in');
  G.atmo.dark=G.atmo.darkTarget=dir==='in'?1:0;
  S.lastDry.copy(P.pos);
}

/* ---------- checkpoints: dying deep in the cave puts you back at the deepest room you reached, not the mouth ----------
   A rise spot must be one you have genuinely stood near (a dry floor of that region for a moment) AND one with an open way back
   to the mouth under the current seals/gates. Rooms are bounding boxes, so a few of them reach past a seal or grate: regionAt()
   splits those off (the shortcut tunnel is the mouth's side passage until its grate opens; it used to count as the arena, so
   walking into it from the mouth set the checkpoint behind the Undertow's door: Heath's soft-lock). */
const CP_SPOTS=[ // [region it stands for, local x,y,z, yaw, name] in depth order
  ['gallery',0,3,-28,PI,'the Gallery of Keepers'],['stair',-3,1,-50.5,PI,'the Flooding Stair'],['channel',-6,.8,-82,PI/2,'the head of the Channel'],
  ['drafts',52,4,-86.5,PI/2,'the sluice'],['arena',60,3,-41,0,'the Undertow’s door']];
function regionAt(x,z){ const r=roomAtL(x,z);
  if(r==='arena'&&x>4&&x<42.2&&z>-18&&z<0)return 'tunnel';     // the shortcut tunnel, mouth side of its grate (x 42.4)
  if(r==='arena'&&z<-34)return 'drafts';                         // north of the Undertow door seal (z -34)
  if(r==='channel'&&x>47&&z<-84)return 'drafts';                 // past the walkway gate (x 47): the sluice walk
  if(r==='gallery'&&z<-46)return 'stair';                        // south of the gallery seal
  return r; }
const sealOpen=id=>{ const P=G.cavePuzzles; return !(P&&P.open)||!!P.open(id); };
/** regions with an open way back to the mouth (the stair <-> channel link is tidal: it always opens again) */
function connected(){
  const L=[['mouth','gallery',true],['mouth','tunnel',true],['tunnel','arena',S.gates.shortcut],['gallery','stair',sealOpen('gallery')],
    ['stair','channel',true],['channel','drafts',S.gates.channel],['drafts','arena',sealOpen('arena')]];
  const out=new Set(['mouth']); let grew=true;
  while(grew){ grew=false; for(const [a,b,o] of L){ if(!o)continue; if(out.has(a)&&!out.has(b)){out.add(b);grew=true;} else if(out.has(b)&&!out.has(a)){out.add(a);grew=true;} } }
  return out; }
function setCheckpointL(x,y,z,yaw,name){ const c=G.state.checkpoint, w=toWorld(x,y,z);
  if(c.distanceToSquared(w)>1e-4)c.copy(w); G.state.checkpointYaw=yaw; G.state.checkpointName=name; }
/** best valid rise spot right now: the deepest reached spot whose region is connected, else the mouth */
function bestCheckpoint(conn){ conn=conn||connected();
  for(let i=CP_SPOTS.length-1;i>=0;i--){ const c=CP_SPOTS[i]; if(!S.reached.has(c[0])||!conn.has(regionAt(c[1],c[3])))continue;
    const f=zoneFloor(c[1],c[3],c[2]+1); return [c[1],f==null?c[2]:f,c[3],c[4],c[5]]; }
  const a=arrivalFor('mouth'); return [a[0],a[1],a[2],a[3],'the mouth of the sea cave']; }
/** standing on a dry, open floor of a connected region for a moment unlocks that region's rise spot */
function trackFooting(dt,conn){
  const P=G.player; if(!P.alive||P.grounded===false||G.state.mode!=='play'){ S.footT=0; return; }
  const lx=P.pos.x-O.x, ly=P.pos.y-O.y, lz=P.pos.z-O.z, f=zoneFloor(lx,lz,ly+.3), w=water();
  if(f==null||Math.abs(ly-f)>.3||Sphys(lx,lz,ly)>-.45||w-f>.7||(inSump(lx,lz)&&w-f>-.1)){ S.footT=0; return; }
  const reg=regionAt(lx,lz); if(!reg||!conn.has(reg)){ S.footT=0; return; }
  if(reg!==S.footReg){ S.footReg=reg; S.footT=0; } S.footT+=dt;
  if(S.footT>.6&&!S.reached.has(reg)&&CP_SPOTS.some(c=>c[0]===reg)){ S.reached.add(reg); G.emit('cave:reached',{region:reg}); }
}
let cpT=0;
function updateCheckpoint(dt){
  cpT-=dt; if(cpT>0)return; const step=.2-cpT; cpT=.2;
  const conn=connected(); trackFooting(step,conn);
  const b=bestCheckpoint(conn); setCheckpointL(b[0],b[1],b[2],b[3],b[4]);
  // defence in depth: wherever you are, if there's no open way back to the mouth, the draught offers one
  const P=G.player, reg=regionAt(P.pos.x-O.x,P.pos.z-O.z);
  S.stranded=!!reg&&!conn.has(reg);
  if(S.stranded&&!G.flag('caveDraught')){ G.flag('caveDraught',true); G.ui.say('A cold draught slips past you toward the sea, through cracks too narrow for the light. You could follow it back to the mouth.',{priority:'high'}); }
}
function followDraught(){
  if(!S.inside||S.trans)return false;
  G.emit('cave:draught',{from:regionAt(G.player.pos.x-O.x,G.player.pos.z-O.z)});
  return startTrans('in','mouth');
}

/* ================================================================ 9. INSIDE / OUTSIDE */
const KEEP_NAMES=new Set(['world','lighthouse','alchemy']);
function hideIsland(on){
  if(on){ S.hidden.length=0;
    for(const ch of G.scene.children){ if(!KEEP_NAMES.has(ch.name))continue;
      const walk=o=>{ let hasLight=false; o.traverse(c=>{ if(c.isLight)hasLight=true; });
        if(!hasLight){ if(o.visible){o.visible=false;S.hidden.push(o);} return; }
        for(const c of o.children) if(!c.isLight)walk(c); };
      walk(ch); }
    S.farPrev=G.camera.far; G.camera.far=160; G.camera.updateProjectionMatrix();
  }else{ for(const o of S.hidden)o.visible=true; S.hidden.length=0; G.camera.far=S.farPrev||1200; G.camera.updateProjectionMatrix(); }
}
function setInside(v){
  if(v===S.inside)return;
  S.inside=v; cave.inside=v; G.interior=v?INTERIOR:null;
  caveRoot.visible=v; hideIsland(v);
  // the sun is off underground: stop re-rendering its shadow map (~150 draw calls a frame); the stale map is multiplied by a 0-intensity light
  if(G.renderer&&G.renderer.shadowMap){ G.renderer.shadowMap.autoUpdate=!v; if(!v)G.renderer.shadowMap.needsUpdate=true; }
  if(v){ S.room=room(G.player.pos)||'mouth'; buildKeeperBench(); G.emit('cave:enter',{room:S.room}); }
  else{ S.room=null; G.emit('cave:exit',{}); }
}

/* ---------- the keeper's bench: an alchemy table at the dry inner end of the mouth (above the high-water line), and glowcaps
   that grow in the mouth and the gallery (slow regrow, G.alchemy's spots) so ether can be brewed without climbing back out ---------- */
const BENCH={x:5.35,z:-19.6,yaw:-PI/2};  // along the east wall, facing into the mouth; floor ≈ 1.85 > high water 1.5
const CAVE_CAPS=[[-5,-19.5],[2.5,-20.6],[-9,-38],[9,-42]];
blockers.bench={x:BENCH.x+.1,z:BENCH.z,hw:.5,hd:1.15,y0:-2,y1:4};
let benchBuilt=false;
function buildKeeperBench(){
  if(benchBuilt||!G.alchemy||!G.alchemy.addTable)return; benchBuilt=true;
  try{
    const f=zoneFloor(BENCH.x,BENCH.z,50);
    S.bench=G.alchemy.addTable(toWorld(BENCH.x,f,BENCH.z),{yaw:BENCH.yaw,parent:caveRoot,eyebrow:'The keeper’s bench, in the sea cave',
      label:'Work the keeper’s bench',enabled:()=>S.inside&&loopOn(),radius:2.4});
    S.caps=[];
    for(const [x,z] of CAVE_CAPS){ const fy=zoneFloor(x,z,50); if(fy==null)continue;
      const sp=G.alchemy.addMushroomSpot(toWorld(x,fy,z),{y:O.y+fy,parent:caveRoot,tag:'cave'});
      const g=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:C('#a46cff'),transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
      g.scale.set(1.1,1.1,1); g.position.copy(toLocal(sp.pos)).setY(fy+.3); caveRoot.add(g); S.caps.push({sp,g}); }
  }catch(e){ console.error('cave bench',e); }
}
function updateBench(){
  for(const c of S.caps||[]){ c.g.visible=!(c.sp.regrow>0); c.g.material.opacity=.28+.08*Math.sin(G.time*2+c.sp.pos.x); }
  if(S.bench&&!G.flag('caveBench')&&G.state.mode==='play'&&S.room==='mouth'){ G.flag('caveBench',true);
    G.ui.say('Against the dry back wall of the mouth, above the tide line, stands an old keeper’s workbench — a burner, a retort, a rack of vials. Glowcaps grow down here too: you could brew ether without climbing back out.');
    if(G.ui.toast)G.ui.toast('The keeper’s bench','Brew ether here · at the back of the mouth'); }
}

/* ================================================================ 10. DEEP WATER, TIDE WASH, CEILING */
/** is cave-local (x,z) open, dry footing at water level w? */
function dryAt(x,z,w){ const f=zoneFloor(x,z,50); return f!=null&&Sphys(x,z,f)<-.5&&w-f<.7&&!(inSump(x,z)&&w-f>-.1); }
function findDry(x,z,w){
  const r0=regionAt(x,z);
  for(let r=1;r<=16;r+=.75) for(let k=0;k<16;k++){ const a=k/16*TAU, px=x+Math.cos(a)*r, pz=z+Math.sin(a)*r;
    if(dryAt(px,pz,w)&&regionAt(px,pz)===r0){ const f=zoneFloor(px,pz,50); return toWorld(px,f,pz); } }
  const s=ROOMDEF[r0]&&ROOMDEF[r0].spawn; if(s&&regionAt(s[0],s[2])===r0){ const f=zoneFloor(s[0],s[2],50); return toWorld(s[0],f==null?(s[1]||0):f,s[2]); }
  const c=bestCheckpoint(); return toWorld(c[0],c[1],c[2]);   // never a spot across a seal or grate: the way you came in
}
function updatePlayerWater(dt){
  const P=G.player; if(!P||!P.pos||!P.alive||S.trans)return;
  const lx=P.pos.x-O.x, lz=P.pos.z-O.z, ly=P.pos.y-O.y, w=water();
  const f=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.05)-O.y;
  const depth=w-Math.max(f,-50);
  const sump=inSump(lx,lz), lim=sump?.2:1.1;
  // last dry footing
  S.dryT-=dt;
  if(S.dryT<=0&&P.grounded!==false&&depth<.7&&ly>=f-.05&&Sat(lx,lz)<-.45&&!(sump&&depth>.05)){ S.dryT=.25; S.lastDry.copy(P.pos); }
  // ceiling: no jumping into the rock
  const c=Cat(lx,lz); if(ly>c-1.65&&ly>f+.02){ P.pos.y=O.y+Math.max(f,c-1.65); }
  const under=ly<w-lim+.02;
  if(!under){ S.pushT=0; return; }
  if(S.room==='mouth'&&!sump&&f>-50&&depth<1.8&&w>-.3){ // the flood tide washes you up the beach
    G.moveCharacter(P.pos,0,-(3.2+5*clamp(depth-1.1,0,1.2))*dt,P.radius||.38,'player'); if(Math.random()<dt*2)G.emit('cave:wash',{pos:P.pos.clone()}); return; }
  S.pushT+=dt; if(S.pushT<.18)return; S.pushT=0;
  const hurt=S.room!=='mouth';
  G.emit('cave:splash',{pos:P.pos.clone(),deep:true});
  // the rising tide can drown the last dry footing itself (the stair shore): find higher ground nearby, else the room's way in
  if(!dryAt(S.lastDry.x-O.x,S.lastDry.z-O.z,w)){ const d=findDry(lx,lz,w); if(d)S.lastDry.copy(d); }
  P.teleport(S.lastDry.x,S.lastDry.y,S.lastDry.z,P.heading);
  if(hurt&&P.hurt)P.hurt({damage:1,kind:'fall',dir:new THREE.Vector3(),knockback:0,ignoreIframes:true});
}

/* ================================================================ 11. COLLAPSE / WOUND / GATES */
function collapseWall(o){
  if(S.wallDown)return; S.wallDown=true; blockers.farWall=null;
  if(o&&o.instant){ if(VIS.wall){VIS.wall.t=999; VIS.wall.list.forEach(b=>{b.p.y=-20;}); updateWallMatrices(0);} revealWound(true); save(); return; }
  if(VIS.wall)VIS.wall.t=0; G.emit('cave:collapse',{});
  if(G.ui&&G.ui.shake)G.ui.shake(.6);
  save();
}
function revealWound(instant){
  if(S.woundShown)return; S.woundShown=true;
  if(VIS.wound){ const W=VIS.wound; W.mesh.visible=W.glow.visible=W.shaft.visible=true; if(instant)W.k=1;
    if(G.ink&&G.ink.emitter&&!W.ink){ try{ W.ink=G.ink.emitter({pos:toWorld(WOUND.x,WOUND.y+.3,WOUND.z)},{rate:5,radius:4,height:1,size:[.6,1.8],life:[2,4],rise:.6,drift:.2,alpha:.55,color:'#1a1028',embers:3}); }catch(e){} } }
  G.emit('cave:wound',{pos:toWorld(WOUND.x,WOUND.y,WOUND.z)});
}
function updateGatesVis(dt){
  const t=G.time;
  if(VIS.portcullis){ const open=S.gates.channel; const tgt=open?3.4:0; const y=VIS.portcullis.position.y-4;
    const ny=U.damp(y,tgt,1.1,dt); VIS.portcullis.position.y=4+ny; VIS.sluice.position.y=-.6+ny*2.4; if(VIS.wheel)VIS.wheel.rotation.z=ny*2.2; }
  if(VIS.grate){ const tgt=S.gates.shortcut?-3.8:.9; VIS.grate.position.y=U.damp(VIS.grate.position.y,tgt,1.4,dt); }
  if(VIS.wall&&VIS.wall.t>=0&&VIS.wall.t<20){ VIS.wall.t+=dt; updateWallMatrices(dt); if(VIS.wall.t>1.8)revealWound(false); }
  if(VIS.wound&&S.woundShown){ const W=VIS.wound; W.k=U.damp(W.k,1,.7,dt); const p=.75+.25*Math.sin(t*1.25);
    W.u.uK.value=W.k; W.glow.material.opacity=.7*W.k*p; W.shM.opacity=.07*W.k*p; W.shaft.rotation.y+=dt*.05;
    if(W.ink)W.ink.intensity=S.inside?W.k:0; if(waterMat)waterMat.uniforms.uWoundK.value=W.k; }
}

/* ================================================================ 12. PERSISTENCE */
function save(){ /* flow.js snapshots G.persist on its own schedule */ }
if(G.persist&&G.persist.register) G.persist.register('cave',{
  save:()=>({lit:[...S.lit],gates:Object.assign({},S.gates),wall:S.wallDown,reached:[...S.reached]}),
  load:(d)=>{ if(!d)return; (d.lit||[]).forEach(id=>lightRoom(id,{restored:true})); if(d.gates)for(const k in d.gates)setGate(k,d.gates[k]); if(d.wall)collapseWall({instant:true});
    S.reached=new Set((d.reached||[]).filter(r=>CP_SPOTS.some(c=>c[0]===r))); }
});
G.on('cave:bossDead',()=>{ setGate('shortcut',true); });

/* ================================================================ 13. SYSTEMS */
let mouthIa=null, exitIa=null;
G.system('cave',{order:13,modes:'always',
  init(){
    const tb=performance.now();
    G.scene.add(caveRoot,mouthRoot);
    // the Flooding Stair is a tide puzzle: no double jump from the crates to the ledge (combat.js hook)
    if(G.moves&&G.moves.noDoubleJump)G.moves.noDoubleJump.push(p=>G.cave.inside&&room(p)==='stair');
    buildDressing(); buildIslandMouth();
    for(let i=0;i<3;i++){ const L=new THREE.PointLight(0xb48cff,0,19,1.6); L.position.set(0,-50,0); caveRoot.add(L); pool.push(L); }
    VIS.gates.channel=S.gates.channel;
    mouthIa=G.interact.add({pos:()=>V(MX,mouthY,51.4),radius:2.1,priority:4,label:'Enter the sea cave',
      enabled:()=>loopOn()&&!S.inside&&!S.trans&&G.player.alive!==false, use:()=>startTrans('in','mouth')});
    exitIa=G.interact.add({pos:()=>toWorld(0,mouthF(0,2.2),2.2),radius:2.6,priority:4,label:'Leave the cave',
      enabled:()=>S.inside&&!S.trans, use:()=>startTrans('out')});
    // the guaranteed way out: offered wherever you stand when no open route leads back to the mouth
    G.interact.add({pos:()=>G.player.pos,radius:4,priority:0,label:'Follow the draught back to the mouth',
      enabled:()=>S.inside&&!S.trans&&S.stranded&&G.player.alive!==false&&G.state.mode==='play', use:()=>followDraught()});
    cave.stats.buildMs=Math.round(performance.now()-tb);
    if(G.debug)console.log('[cave] built',JSON.stringify(cave.stats));
  },
  update(dt){
    const t=G.time, mode=G.state.mode, P=G.player;
    tUni.uTime.value=t;
    mouthRoot.visible=loopOn()&&!S.inside;
    updateTrans(dt);
    // inside/outside from the player's position (also covers loading a save made in the cave)
    if(P&&P.pos&&!S.trans){ const inC=!!room(P.pos)||(inBoxW(P.pos.x,P.pos.z)&&P.pos.y>O.y-40); if(inC!==S.inside)setInside(inC); }
    if(mouthRoot.visible) updateIslandMouth(dt);
    if(!S.inside)return;
    // darkness: lit rooms keep a little ambient
    const r=room(P.pos)||S.room; if(r&&r!==S.room){ S.room=r; G.emit('cave:room',{id:r}); }
    if(!S.trans)updateCheckpoint(dt);
    const lit=S.room&&S.lit.has(S.room);
    if(mode!=='title') G.atmo.darkTarget=lit?.55:1;
    G.lights.sun.intensity=0;
    // underground the air is sea-dark, not dusk: blue-black fog (deep sea-blue once a room is lit), cool ambient; the veins stay violet
    { const k=clamp((1-G.atmo.dark)/.45,0,1), fog=G.scene.fog;
      if(fog){ fog.color.copy(CAVE_FOG0).lerp(CAVE_FOG1,k); if(G.scene.background&&G.scene.background.isColor)G.scene.background.copy(fog.color); }
      G.lights.hemi.color.lerp(CAVE_SKY,.75); G.lights.hemi.groundColor.lerp(CAVE_GND,.75); }
    if(lit){ G.lights.hemi.color.lerp(CAVE_LIT,.35); }
    const w=water(); tUni.uWater.value=w;
    if(waterMat){ const u=waterMat.uniforms; u.uWater.value=w; VIS.water.position.y=w;
      const L=G.items.lantern, lp=L.carried?(L.world.lengthSq()>0?L.world:P.pos):L.pos; u.uLamp.value.copy(lp); u.uLampI.value=(L.found&&L.lit())?2.2:0;
      u.uAmb.value=U.damp(u.uAmb.value,lit?1:0,2,dt); }
    if(VIS.bio)VIS.bio.uniforms.uK.value=lit?.5:1;
    updateLighting(dt); updateGatesVis(dt); updateDrips(dt); updateBench();
    for(const s of VIS.mist||[]){ const ph=(t*.05+s.userData.ph)%1; s.position.set(Math.sin(ph*9+s.userData.ph*7)*1.5,mouthF(0,10-ph*14)+.9+ph*.8,10-ph*14); s.material.opacity=Math.sin(ph*PI)*.13; }
    if(mode==='play') updatePlayerWater(dt);
  }
});
G.system('caveLate',{order:21,modes:['play','dead'],update(){ /* after player.js: keep heads under low ceilings */
  if(!S.inside)return; const P=G.player; const lx=P.pos.x-O.x, lz=P.pos.z-O.z, c=Cat(lx,lz), f=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.05)-O.y;
  if(P.pos.y-O.y>c-1.65&&P.pos.y-O.y>f+.02)P.pos.y=O.y+Math.max(f,c-1.65); }});
function updateIslandMouth(dt){
  const t=G.time;
  for(const s of VIS.outMist||[]){ const ph=(t*.06+s.userData.ph)%1; s.position.set(MX+Math.sin(ph*7+s.userData.ph*5)*1.2,.8+ph*1.6,51.5+ph*5.5); s.material.opacity=Math.sin(ph*PI)*.16*(1-G.atmo.dark); }
  const D=VIS.outDrips; if(D){ const a=D.g.attributes.position.array; D.list.forEach((d,i)=>{ if(d.w>0){d.w-=dt;a[i*3+1]=-99;return;} d.v-=9.8*dt; d.y+=d.v*dt; if(d.y<apronF(d.x,MZ_FACE)){ d.y=4.5; d.v=0; d.w=.5+Math.random()*2; } a[i*3]=d.x; a[i*3+1]=d.y; a[i*3+2]=MZ_FACE+.2; }); D.g.attributes.position.needsUpdate=true; }
}

/* ================================================================ 14. DEBUG */
if(G.debug){
  G.debugEnterCave=(roomId)=>{
    if(!(G.loop&&G.loop.active)&&G.debugStartLoop)G.debugStartLoop();
    if(G.state.mode==='title'){ const t=document.getElementById('title'); if(t)t.hidden=true; G.setMode('play'); }
    S.trans=null; doTeleport('in',roomId||'mouth'); return room(G.player.pos);
  };
  cave._debug={S,regionAt,connected,bestCheckpoint,followDraught,ZONES,Sat,Fat,Cat,zoneFloor,inSump,blockers,arrivalFor,VIS,apronF,cwF,cwDist,mouthF};
}
})();

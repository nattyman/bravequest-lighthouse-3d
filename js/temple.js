/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — temple.js  (Place agent)
   The Vigil: the sunken temple in the old wood where the first islanders kept a vigil around a violet glow in the floor
   (the first seam). Reached through a door choked with ink roots in a hollow past the Resisting Tree (world.js builds the
   hollow, the stones, the stair and the door frame; this module the roots the swarm eats and the way in). The interior sits
   far off-island at O (local coords: world = O + local), like the sea cave and the Undercroft.
   - one analytic layout (zones = signed-distance shapes with floors and ceilings; solids carve) drives physics AND visuals
   - six rooms: vestibule (the Stair of Watchers), nave (the Hall of Mirrors), reliquary, cloister (the Drowned Cloister),
     well (the Moth Well: a spiral walk down a round shaft), sanctum (the Sanctum of the Seam)
   - vigil braziers that light a room for good (5 ether, the first free); darkness; the violet glow under the floor grows
     deeper down
   - the Drowned Cloister's walk that exists only in the past: solid while the Remembering Glass is raised
   - entering/leaving with a fade (the swarm and the jar come along), checkpoints, the stranded fallback, persistence
   See TEMPLE.md for the shared API. Anchors are ready at script-evaluation time.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth,vnoise}=U;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);

/* ================================================================ 1. FRAME */
const O=V(-800,60,0);                  // TEMPLE.md. y is +60: player.js respawns anyone below y -3.
const toWorld=(x,y,z)=>V(O.x+x,O.y+y,O.z+z);
const toLocal=v=>V(v.x-O.x,v.y-O.y,v.z-O.z);
const BOX={x0:-34,x1:42,z0:-121,z1:17};
const inBoxW=(x,z)=>x>O.x+BOX.x0&&x<O.x+BOX.x1&&z>O.z+BOX.z0&&z<O.z+BOX.z1;

/* ================================================================ 2. LAYOUT (local) */
function sdBox(px,pz,x0,x1,z0,z1){ const cx=(x0+x1)/2,cz=(z0+z1)/2,hx=(x1-x0)/2,hz=(z1-z0)/2;
  const qx=Math.abs(px-cx)-hx,qz=Math.abs(pz-cz)-hz; return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0); }
function sdSeg(px,pz,ax,az,bx,bz,w){ const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz; let t=((px-ax)*dx+(pz-az)*dz)/l2; t=t<0?0:t>1?1:t;
  return Math.hypot(px-ax-dx*t,pz-az-dz*t)-w; }
/** n rises from y0 (at a0) to y1 (at a1) along axis; n+1 treads */
function stepF(axis,a0,a1,y0,y1,n){ return (x,z)=>{ const c=axis==='x'?x:z; const t=clamp((c-a0)/(a1-a0),0,.9999); return y0+(y1-y0)*Math.min(n,Math.floor(t*(n+1)))/n; }; }
const ZONES=[], SOLIDS=[];
function zone(o){ if(typeof o.floor==='number'){const f=o.floor;o.floor=()=>f;} if(typeof o.ceil==='number'){const c=o.ceil;o.ceil=()=>c;}
  if(o.ceilH!=null){ const h=o.ceilH, f=o.floor; o.ceil=(x,z)=>{ const y=f(x,z); return (y==null?-2:y)+h; }; }
  o.vmax=o.vmax==null?1.2:o.vmax; o.tag=o.tag||o.room; ZONES.push(o); return o; }
const rect=(id,room,x0,x1,z0,z1,floor,ceil,o)=>zone(Object.assign({id,room,sd:(x,z)=>sdBox(x,z,x0,x1,z0,z1),floor,ceil,bb:[x0,x1,z0,z1]},o||{}));
const seg=(id,room,ax,az,bx,bz,w,floor,ceil,o)=>zone(Object.assign({id,room,sd:(x,z)=>sdSeg(x,z,ax,az,bx,bz,w),floor,ceil,
  bb:[Math.min(ax,bx)-w,Math.max(ax,bx)+w,Math.min(az,bz)-w,Math.max(az,bz)+w]},o||{}));
const circ=(id,room,cx,cz,r,floor,ceil,o)=>zone(Object.assign({id,room,sd:(x,z)=>Math.hypot(x-cx,z-cz)-r,floor,ceil,bb:[cx-r,cx+r,cz-r,cz+r]},o||{}));
const solid=(x0,x1,z0,z1,o)=>{ const s=Object.assign({x0,x1,z0,z1,sd:(x,z)=>sdBox(x,z,x0,x1,z0,z1),bb:[x0,x1,z0,z1]},o||{}); SOLIDS.push(s); return s; };
const stair=(axis,a0,a1,y0,y1,n,l0,l1,o)=>Object.assign({axis,a0,a1,y0,y1,n,l0,l1},o||{});

// --- the Stair of Watchers (vestibule, floor 0): the long stair down from the door in the wood, watchers in niches either side
rect('stairTop','vestibule',-1.7,1.7,11.2,15.4,5,10,{vmax:.5});
const stairF=stepF('z',11.2,4.4,5,0,12);
seg('stair','vestibule',0,11.6,0,4.0,1.7,stairF,null,{ceilH:5.2,vmax:.7,stair:stair('z',11.2,4.4,5,0,12,-1.7,1.7)});
const NICHE_Z=[9.6,7.4];
for(const s of [-1,1]) for(const z of NICHE_Z) rect('niche'+s+z,'vestibule',s<0?-2.75:1.5,s<0?-1.5:2.75,z-.65,z+.65,stairF(0,z),stairF(0,z)+3.4,{vmax:.3,niche:1});
rect('vestibule','vestibule',-5,5,-7,4.6,0,7.6,{vmax:1.6});
for(const s of [-1,1]) for(const z of [-4.2,.8]) rect('vniche'+s+z,'vestibule',s<0?-6.1:4.8,s<0?-4.8:6.1,z-.7,z+.7,0,3.6,{vmax:.3,niche:1});
const vsF=stepF('z',-7.6,-11.6,0,-3,6);
seg('vesSouth','vestibule',0,-6.6,0,-12.8,1.3,vsF,null,{ceilH:3.8,vmax:.5,stair:stair('z',-7.6,-11.6,0,-3,6,-1.3,1.3)});
// --- the Hall of Mirrors (nave, floor -3): tall and long; two rows of piers; bronze mirrors on the capitals
rect('nave','nave',-7,7,-50.4,-10.4,-3,9.4,{vmax:2.4});
const PIER_Z=[-16,-22,-28,-34,-40,-46];
for(const s of [-1,1]) for(const z of PIER_Z) solid(s*4-.55,s*4+.55,z-.55,z+.55,{pier:1});
// the secret niche in the north-west corner, behind a slab (the great watchers' eyes open it)
rect('eyesNiche','nave',-6.9,-5.5,-11.0,-9.2,-3,-.6,{vmax:.2,niche:1,secret:1});
// west to the reliquary, east to the cloister, south (the sun-disc door) to the well
const relF=stepF('x',-9.2,-12.6,-3,-4,3);
seg('relHall','reliquary',-6.6,-40,-17.8,-40,1.25,relF,null,{ceilH:3.6,vmax:.5,stair:stair('x',-9.2,-12.6,-3,-4,3,-41.25,-38.75)});
const cloF=stepF('x',9.0,13.4,-3,-6,7);
seg('cloHall','cloister',6.6,-44,14.8,-44,1.25,cloF,null,{ceilH:3.6,vmax:.5,stair:stair('x',9.0,13.4,-3,-6,7,-45.25,-42.75)});
const welF=stepF('z',-52.6,-57.4,-3,-4,3);
seg('wellHall','well',0,-50,0,-61.2,1.4,welF,null,{ceilH:4.2,vmax:.6,stair:stair('z',-52.6,-57.4,-3,-4,3,-1.4,1.4)});
// --- the Reliquary (floor -4): niches of offerings, the altar where the Lens lies; a small sealed recess (the Lens's first burn)
rect('reliquary','reliquary',-30.6,-17.4,-46,-34,-4,3.4,{vmax:1.4});
rect('apse','reliquary',-32.6,-30.2,-41.6,-38.4,-4,.6,{vmax:.6});
rect('recess','reliquary',-25.1,-22.9,-47.8,-45.6,-4,-1.4,{vmax:.3,niche:1});
for(const x of [-27.6,-20.4]) for(const z of [-37,-43]) solid(x-.5,x+.5,z-.5,z+.5,{pier:1});
// --- the Drowned Cloister (floor -6): a square arcade round a garth; half the floor is gone into black water
const CL={x0:14,x1:34,z0:-56,z1:-36,walk:3.2};
rect('clW','cloister',CL.x0,CL.x0+CL.walk,CL.z0,CL.z1,-6,1,{vmax:1.2});
rect('clN','cloister',CL.x0,27.4,CL.z1-CL.walk,CL.z1,-6,1,{vmax:1.2});
rect('garth','cloister',CL.x0+CL.walk-.05,CL.x1,CL.z0,CL.z1-CL.walk+.05,-9.4,1,{vmax:1.4,water:1});
rect('clS','cloister',CL.x0,CL.x1,CL.z0,CL.z0+CL.walk,-6,1,{past:1,vmax:0});   // (overlaps the west walk wholly: a shallow join reads as a wall to a body)
rect('clE','cloister',CL.x1-CL.walk,CL.x1,CL.z0,-43.0,-6,1,{past:1,vmax:0});
rect('winch','cloister',32.4,39.6,-48.6,-43.2,-6,-.6,{vmax:.7});
solid(27.4,34.6,-39.6,-35.4,{rubble:1});           // the north-east corner fell in long ago (then, and now)
// --- the Moth Well (floor -4 at the rim, -14 at the bottom): a deep round shaft; a walk spirals down its wall
const WC={x:0,z:-70,r:10,ri:7.0,top:-4,bot:-14,a0:90,a1:630};
const rampY=th=>WC.top+(WC.bot-WC.top)*clamp((th-WC.a0)/(WC.a1-WC.a0),0,1);
const angOf=(x,z)=>Math.atan2(z-WC.z,x-WC.x)*180/PI;
function unwrapNear(a,mid){ let t=a; while(t<mid-180)t+=360; while(t>mid+180)t-=360; return t; }
function sdSector(x,z,a0,a1){ const r=Math.hypot(x-WC.x,z-WC.z), mid=(a0+a1)/2, t=unwrapNear(angOf(x,z),mid);
  const ang=Math.max(a0-t,t-a1)*PI/180*Math.max(r,1); return Math.max(WC.ri-.25-r,r-(WC.r+.3),ang); }
circ('shaft','well',WC.x,WC.z,WC.r,WC.bot,3.4,{vmax:2.6});
for(const [a0,a1,id] of [[70,272,'rampA'],[268,452,'rampB'],[448,630,'rampC']]){
  const mid=(a0+a1)/2;
  zone({id,room:'well',ramp:1,sd:(x,z)=>sdSector(x,z,a0,a1),floor:(x,z)=>rampY(unwrapNear(angOf(x,z),mid)),ceil:3.4,
    visFloor:()=>null,bb:[WC.x-WC.r-.5,WC.x+WC.r+.5,WC.z-WC.r-.5,WC.z+WC.r+.5],vmax:0}); }
// the side niche off the walk (its seal, the vigil-box behind), at 20° on the second turn
const NICHE_A=20, nicheY=rampY(NICHE_A+360);
{ const a=NICHE_A*PI/180; seg('wellNiche','well',Math.cos(a)*9.4,WC.z+Math.sin(a)*9.4,Math.cos(a)*12.6,WC.z+Math.sin(a)*12.6,.95,nicheY,nicheY+2.6,{vmax:.4,niche:1}); }
const sanF=stepF('z',-80.2,-82.6,-14,-16,4);
seg('sanHall','sanctum',0,-78.4,0,-83.6,1.4,sanF,null,{ceilH:3.6,vmax:.5,stair:stair('z',-80.2,-82.6,-14,-16,4,-1.4,1.4)});
// --- the Sanctum of the Seam (floor -16): the boss arena, round, the seam in the floor at its centre; the exit stair east
const SC={x:0,z:-100,r:18};
circ('sanctum','sanctum',SC.x,SC.z,SC.r,-16,2.2,{vmax:4.2});
for(let k=0;k<8;k++){ const a=(k+.5)/8*TAU, x=SC.x+Math.cos(a)*13.6, z=SC.z+Math.sin(a)*13.6; solid(x-.6,x+.6,z-.6,z+.6,{pier:1}); }
seg('sanExit','sanctum',17.2,-100,24.6,-100,1.25,-16,-12.2,{vmax:.4});

/* ---------- rooms (TEMPLE.md table) ---------- */
const ROOMDEF={
  vestibule:{centre:[0,0,0],b:[[-7,7,-12.9,16]],spawn:[0,0,3.0,PI],name:'The Stair of Watchers'},
  reliquary:{centre:[-24,-4,-40],b:[[-33,-14.2,-48.5,-33]],spawn:[-16.2,-4,-40,-PI/2],name:'The Reliquary'},
  cloister:{centre:[24,-6,-46],b:[[8,40,-57.5,-34.5]],spawn:[15.6,-6,-44,PI],name:'The Drowned Cloister'},
  well:{centre:[0,-10,-70],b:[[-11,13,-80.6,-51.2]],spawn:[0,-4,-60.6,PI],name:'The Moth Well'},
  sanctum:{centre:[0,-16,-100],b:[[-19,25,-119,-80.6]],spawn:[0,-16,-84.2,PI],name:'The Sanctum of the Seam'},
  nave:{centre:[0,-3,-30],b:[[-8,8,-51.2,-12.9],[-8,-6,-12.9,-9]],spawn:[0,-3,-12.6,PI],name:'The Hall of Mirrors'},
};
const ROOM_IDS=['vestibule','reliquary','cloister','well','sanctum','nave'];
function roomAtL(x,z){ for(const id of ROOM_IDS) for(const b of ROOMDEF[id].b) if(x>=b[0]&&x<=b[1]&&z>=b[2]&&z<=b[3])return id; return null; }

/* ---------- state needed by the layout ---------- */
const S={inside:false,room:null,open:false,unlocked:false,lit:new Set(),freeUsed:false,
  gates:{cloisterDoor:false,sunDoor:false,wellUpper:false,wellLower:false,wellSide:false,exit:false,sanctum:true,eyes:false},
  trans:null,prevCp:null,reached:new Set(),footReg:null,footT:0,stranded:false,hidden:[],farPrev:1200,lastPresent:V(),push:null,said:{},
  pages:{},seam:1,drown:null};
const glassUp=()=>!!(G.glass&&G.glass.solid);
const glassOwned=()=>!!(G.glass&&G.glass.owned);

/* ================================================================ 3. FIELD */
const activeZone=(Z,who)=>!Z.past||(glassUp()&&(who==null||who==='player'));
function Sfield(x,z,who,visual){
  let m=1e9;
  for(const Z of ZONES){ const b=Z.bb; if(x<b[0]-3||x>b[1]+3||z<b[2]-3||z>b[3]+3)continue; if(!visual&&!activeZone(Z,who))continue; const d=Z.sd(x,z); if(d<m)m=d; }
  for(const s of SOLIDS){ const b=s.bb; if(x<b[0]-3||x>b[1]+3||z<b[2]-3||z>b[3]+3)continue; const d=-s.sd(x,z); if(d>m)m=d; }
  return m; }
function zoneFloor(x,z,y,who){ let best=null, low=null;
  for(const Z of ZONES){ const b=Z.bb; if(x<b[0]||x>b[1]||z<b[2]||z>b[3])continue; if(!activeZone(Z,who))continue; if(Z.sd(x,z)>=0)continue;
    const h=Z.floor(x,z); if(h==null)continue;
    if(h<=y+.9){ if(best==null||h>best)best=h; } else if(low==null||h<low)low=h; }
  return best!=null?best:low; }
function zonesAt(x,z){ const out=[]; for(const Z of ZONES){ const b=Z.bb; if(x<b[0]||x>b[1]||z<b[2]||z>b[3])continue; if(Z.sd(x,z)<0)out.push(Z);} return out; }
function presentAt(x,z){ for(const Z of zonesAt(x,z)) if(!Z.past&&Z.floor(x,z)!=null&&!Z.water)return true; return false; }

/* ---------- the grid (visual field + camera) ---------- */
const GS=.3, GX0=BOX.x0, GZ0=BOX.z0, NX=Math.round((BOX.x1-BOX.x0)/GS)+1, NZ=Math.round((BOX.z1-BOX.z0)/GS)+1;
const gS=new Float32Array(NX*NZ), gF=new Float32Array(NX*NZ), gC=new Float32Array(NX*NZ), gStair=new Uint8Array(NX*NZ), gTag=new Uint8Array(NX*NZ);
const TAGS=['vestibule','nave','reliquary','cloister','well','sanctum'];
const t0=performance.now();
(function buildField(){
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){
    const x=GX0+i*GS, z=GZ0+j*GS, k=j*NX+i;
    let m=1e9, near=null, fin=null, wsum=0, cb=0, cin=-1e9, vmax=0, tag=null, st=0;
    for(const Z of ZONES){ const b=Z.bb; if(x<b[0]-7||x>b[1]+7||z<b[2]-7||z>b[3]+7)continue;
      const d=Z.sd(x,z); if(d<m){m=d;near=Z;}
      const w=Math.exp(-Math.max(d,0)*2.2); wsum+=w; cb+=w*Z.ceil(x,z);
      if(d<0){ const vf=Z.visFloor?Z.visFloor(x,z):Z.floor(x,z); if(vf!=null&&(fin==null||vf>fin))fin=vf;
        cin=Math.max(cin,Z.ceil(x,z)); vmax=Math.max(vmax,Z.vmax); if(!tag)tag=Z.tag;
        if(Z.stair){ const s=Z.stair, c=s.axis==='z'?z:x; if(c<=Math.max(s.a0,s.a1)+.35&&c>=Math.min(s.a0,s.a1)-.35)st=1; } }
    }
    let Sv=m; for(const s of SOLIDS){ const b=s.bb; if(x<b[0]-3||x>b[1]+3||z<b[2]-3||z>b[3]+3)continue; const d=-s.sd(x,z); if(d>Sv)Sv=d; }
    gS[k]=Sv; gStair[k]=st; gTag[k]=Math.max(0,TAGS.indexOf(tag||(near&&near.tag)||'nave'));
    if(fin==null){ const nf=near?(near.visFloor?near.visFloor(x,z):near.floor(x,z)):null; fin=nf==null?-3:nf; }
    gF[k]=fin;
    const cBase=wsum>1e-6?(cin>-1e8?Math.max(cin,cb/wsum):cb/wsum):fin+3;
    const vm=vmax||(near?near.vmax:0);
    gC[k]=cBase+Math.min(vm,.62*Math.sqrt(Math.max(0,-Sv)));
  }
})();
const fieldMs=Math.round(performance.now()-t0);
function bil(A,x,z,out){ const fx=(x-GX0)/GS, fz=(z-GZ0)/GS; if(fx<0||fz<0||fx>=NX-1||fz>=NZ-1)return out;
  const i=fx|0,j=fz|0,u=fx-i,v=fz-j,k=j*NX+i; return (A[k]*(1-u)+A[k+1]*u)*(1-v)+(A[k+NX]*(1-u)+A[k+NX+1]*u)*v; }
const Sat=(x,z)=>bil(gS,x,z,10), Fat=(x,z)=>bil(gF,x,z,-20), Cat=(x,z)=>bil(gC,x,z,20);

/* ---------- blockers: physics-only boxes (local), switchable; yaw, a y range and a `when` test are optional ---------- */
const blockers={};
// the drowned garth: nobody walks off the present walks into the water (the past walk is the Glass's)
const presentOnly=who=>!(glassUp()&&(who==null||who==='player'));
blockers.garthW={x:CL.x0+CL.walk+.15,z:(CL.z0+CL.walk+CL.z1-CL.walk)/2,hw:.15,hd:(CL.z1-CL.z0-2*CL.walk)/2,y0:-12,y1:2};
blockers.garthN={x:(CL.x0+CL.walk+27.4)/2,z:CL.z1-CL.walk-.15,hw:(27.4-CL.x0-CL.walk)/2,hd:.15,y0:-12,y1:2};
blockers.garthSW={x:CL.x0+CL.walk+.15,z:CL.z0+CL.walk/2,hw:.15,hd:CL.walk/2+.05,y0:-12,y1:2,when:presentOnly};
blockers.winchW={x:32.25,z:-45.9,hw:.15,hd:2.7,y0:-12,y1:2,when:presentOnly};
const GATEBOX={
  cloisterDoor:{x:8.0,z:-44,hw:.45,hd:1.4,y0:-8,y1:2},
  sunDoor:{x:0,z:-50.9,hw:1.6,hd:.4,y0:-8,y1:4},
  wellUpper:null, // set below (a yawed box across the walk)
  wellLower:{x:0,z:-79.4,hw:1.6,hd:.45,y0:-17,y1:-10},
  wellSide:null,
  exit:{x:18.4,z:-100,hw:.35,hd:1.4,y0:-20,y1:-10},
  sanctum:{x:0,z:-82.9,hw:1.6,hd:.35,y0:-20,y1:-10},
  eyes:{x:-6.2,z:-10.55,hw:.9,hd:.3,y0:-6,y1:0},
};
const UPPER_A=152, UPPER_Y=rampY(UPPER_A);
{ const a=UPPER_A*PI/180, r=(WC.ri+WC.r)/2; GATEBOX.wellUpper={x:Math.cos(a)*r,z:WC.z+Math.sin(a)*r,hw:(WC.r-WC.ri)/2+.5,hd:.45,yaw:-a,y0:UPPER_Y-2.5,y1:UPPER_Y+3}; }
{ const a=NICHE_A*PI/180, r=WC.r+.1; GATEBOX.wellSide={x:Math.cos(a)*r,z:WC.z+Math.sin(a)*r,hw:.4,hd:1.1,yaw:-a,y0:nicheY-2.5,y1:nicheY+3}; }
const GATE_DEFAULT={sanctum:true};   // open unless the Boss agent shuts it for the fight
function setGate(id,open){ open=!!open; if(!(id in GATEBOX))return false; S.gates[id]=open;
  blockers['gate:'+id]=open?null:Object.assign({},GATEBOX[id]);
  if(VIS.built)updateGateVis(true);
  G.emit('temple:gate',{id,open});
  return true; }
function blockS(x,z,y,who){ let s=-1e9; for(const id in blockers){ const b=blockers[id]; if(!b)continue; if(y!=null&&(y+1.6<b.y0||y>b.y1))continue; if(b.when&&!b.when(who))continue;
    let px=x-b.x, pz=z-b.z; if(b.yaw){ const c=Math.cos(b.yaw), sn=Math.sin(b.yaw); const qx=px*c-pz*sn; pz=px*sn+pz*c; px=qx; }
    const v=-sdBox(px,pz,-b.hw,b.hw,-b.hd,b.hd); if(v>s)s=v; } return s; }
// the well's inner edge: above the bottom nobody walks off the spiral into the shaft
function ringS(x,z,y){ if(y==null||y<WC.bot+1.4)return -1e9; const r=Math.hypot(x-WC.x,z-WC.z); if(r>WC.r+1)return -1e9; return WC.ri-r; }
const Sphys=(x,z,y,who)=>Math.max(Sfield(x,z,who),blockS(x,z,y,who),ringS(x,z,y));

/* ---------- braziers (each room ≥ 1) and echoes ---------- */
const BRAZDEF=[ // [room, local x, floor y, z]
  ['vestibule',3.4,0,-3.6],
  ['nave',-5.7,-3,-12.6],['nave',5.7,-3,-48.4],
  ['reliquary',-19.4,-4,-35.4],['reliquary',-29.2,-4,-44.6],
  ['cloister',15.6,-6,-37.6],['cloister',38.4,-6,-47.6],
  ['well',2.6,-4,-60.2],['well',-2.2,-14,-73.2],
  ['sanctum',11.0,-16,-89.0],['sanctum',-11.0,-16,-89.0],['sanctum',-11.0,-16,-111.0],['sanctum',11.0,-16,-111.0],
];
const BRAZ=BRAZDEF.map((c,i)=>({id:c[0]+':'+BRAZDEF.slice(0,i).filter(d=>d[0]===c[0]).length,room:c[0],l:V(c[1],c[2],c[3])}));
BRAZ.forEach(b=>{ b.flame=V(b.l.x,b.l.y+1.32,b.l.z); b.world=toWorld(b.flame.x,b.flame.y,b.flame.z); b.stand=toWorld(b.l.x,b.l.y,b.l.z); });
const LIGHTS={}; ROOM_IDS.forEach(id=>LIGHTS[id]=BRAZ.filter(c=>c.room===id).map(c=>V(c.flame.x,c.flame.y+.6,c.flame.z)));
LIGHTS.nave.push(V(0,4,-30)); LIGHTS.sanctum.push(V(0,-9,-100)); LIGHTS.well.push(V(0,-6,-70));
const ECHODEF=[ // [id, room, local x,y,z, radius]
  ['descent','vestibule',0,0,1.6,4.2],['keepers','nave',0,-3,-31,5],
  ['procession','cloister',24.4,-6,-54.4,3.6],['offering','cloister',32.4,-6,-49.4,3.2],['kneelers','cloister',15.6,-6,-47,3.4]];

/* ---------- anchors (world) ---------- */
const W=(x,y,z)=>toWorld(x,y,z);
const wallPt=(a,r,y)=>W(Math.cos(a*PI/180)*r,y,WC.z+Math.sin(a*PI/180)*r);
const ANCH={
  vestibule:{entry:W(0,0,3.0),exit:W(0,5,13.6),stairFoot:W(0,0,4.2),bench:W(-3.7,0,-4.3),door:W(0,5,15.0),
    watchers:[W(-2.2,stairF(0,9.6),9.6),W(2.2,stairF(0,9.6),9.6),W(-2.2,stairF(0,7.4),7.4),W(2.2,stairF(0,7.4),7.4),
      W(-5.6,0,-4.2),W(5.6,0,-4.2),W(-5.6,0,.8),W(5.6,0,.8)]},
  nave:{plinth:W(1.4,-3,-14.2),
    mirrors:[W(-2.65,1.9,-22),W(2.65,1.9,-40)],
    cranks:[W(-3.1,-3,-22),W(3.1,-3,-40)],
    disc:W(0,1.6,-50.1),sunDoor:W(0,-3,-50.6),eyes:W(-2.65,1.03,-11.81),eyesNiche:W(-6.2,-3,-9.9),watchers:[W(-2.65,-3,-11.3),W(2.65,-3,-11.3)],
    seals:[W(7.9,-3,-44),W(-6.9,3.4,-28)],cloisterDoor:W(8.0,-3,-44),reliquaryDoor:W(-7.4,-3,-40),wellDoor:W(0,-3,-50.6),
    gallery:W(-6.9,3.4,-28)},
  reliquary:{lens:W(-31.2,-4,-40),altar:W(-31.2,-4,-40),recess:W(-24,-4,-46.6),seal:W(-24,-4,-45.6),door:W(-17.6,-4,-40),
    shelves:[W(-29.8,-4,-35),W(-29.8,-4,-45)]},
  cloister:{door:W(14.6,-6,-44),garth:W(25,-9.4,-46),winch:W(37.4,-6,-45.9),pastStart:W(15.6,-6,-54.4),pastEnd:W(32.4,-6,-45.9),
    echoes:ECHODEF.filter(e=>e[1]==='cloister').map(e=>W(e[2],e[3],e[4])),water:-8.6},
  well:{rim:W(0,-4,-60.6),roost:wallPt(98,9.7,-1.2),
    seals:[W(Math.cos(UPPER_A*PI/180)*8.5,UPPER_Y,WC.z+Math.sin(UPPER_A*PI/180)*8.5),W(0,-14,-79.0),wallPt(NICHE_A,10.3,nicheY)],
    niche:wallPt(NICHE_A,11.8,nicheY),bottom:W(0,-14,-73),door:W(0,-14,-78.6),
    houndsTop:[wallPt(200,8.6,rampY(200)),wallPt(250,8.6,rampY(250))],houndsLow:[wallPt(500,8.6,rampY(500)),wallPt(560,8.6,rampY(560))]},
  sanctum:{centre:W(SC.x,-16,SC.z),seam:W(SC.x,-16,SC.z),hesper:W(SC.x,-16,SC.z+1.4),carving:W(0,-12.4,-117.6),door:W(0,-16,-83.4),
    exit:W(22.4,-16,-100),exitGate:W(18.4,-16,-100),
    ring:Array.from({length:8},(_,k)=>{ const a=(k+.5)/8*TAU; return W(SC.x+Math.cos(a)*13.6,-16,SC.z+Math.sin(a)*13.6); })},
};
const PAGES=[ // Hesper's pages (texts: the Boss agent, via G.temple.pageText / G.templePeople.pages) + the old hands' inscriptions
  {id:'p1',room:'vestibule',pos:W(-3.7,.46,-4.3),kind:'page'},
  {id:'p2',room:'reliquary',pos:W(-29.6,-3.08,-38.0),kind:'page'},
  {id:'p3',room:'cloister',pos:W(38.6,-5.15,-44.2),kind:'page'},
  {id:'p4',room:'well',pos:W(-2.4,-4,-60.6),kind:'page'},
  {id:'p5',room:'well',pos:W(1.9,-14,-77.6),kind:'page'},
  {id:'i1',room:'vestibule',pos:W(1.5,2.6,11.0),kind:'inscription',wall:[-1,0]},
  {id:'i2',room:'nave',pos:W(-6.2,-3,-9.7),kind:'inscription',secret:1},
];
const PAGE_FALLBACK={
  p1:{author:'Hesper',text:'If you find this, Tide, go home. I mean it. Go home and keep the light. (You won’t. You never could leave a door alone.)'},
  p2:{author:'Hesper',text:'The old keepers kept a lens here, a burning-glass for the front of a lantern. They used it to cut the ink back off the mirrors. I’ve left it where it was. It’s yours more than mine.'},
  p3:{author:'Hesper',text:'Through the Glass the cloister is whole and full of people, walking round and round with their candles. None of them look up. None of them look at the water.'},
  p4:{author:'Hesper',text:'The moths come down here to roost in the dark, hundreds of them. It wants them. It wants everything that eats ink.'},
  p5:{author:'Hesper',text:'It’s pressing from underneath now. I can hear it through my hands. Don’t come down, Tide. Please. And if you do — bring the light.'},
  i1:{author:'An old hand',title:'Cut into the stair',text:'WE KEPT THE VIGIL HERE AND IT ANSWERED. WE HAVE SHUT THE DOOR. LET NO ONE KEEP IT AGAIN.'},
  i2:{author:'An old hand',title:'Behind the watchers',text:'Every answer cost a name, a year or a light. When it began to ask for the children we put out the glow and built the tower on the far headland, to watch the dark from where it cannot reach.'},
};

const rooms={};
for(const id of ROOM_IDS){ const d=ROOMDEF[id], b=d.b[0];
  const anchors=Object.assign({},ANCH[id]);
  anchors.braziers=BRAZ.filter(c=>c.room===id).map(c=>c.world.clone());
  anchors.brazier=anchors.braziers[0]||null;
  anchors.echoes=anchors.echoes||ECHODEF.filter(e=>e[1]===id).map(e=>W(e[2],e[3],e[4]));
  rooms[id]={id,name:d.name,centre:W(d.centre[0],d.centre[1],d.centre[2]),bounds:{min:toWorld(b[0],-20,b[2]),max:toWorld(b[1],12,b[3])},anchors};
}
const ECHOES=ECHODEF.map(e=>({id:e[0],room:e[1],pos:W(e[2],e[3],e[4]),r:e[5]}));

/* ================================================================ 4. THE DOOR IN THE WOOD (world.js: the hollow; here: the roots) */
const LM=()=>(G.world&&G.world.landmarks)||{};
const doorLM=LM().vigilDoor||{x:-196,y:G.world.height(-196,2),z:2,yaw:-PI/2};
const doorPos=V(doorLM.x,doorLM.y,doorLM.z);
const doorYaw=doorLM.yaw||0;                                  // facing the door (heading convention)
const doorFwd=V(Math.sin(doorYaw),0,Math.cos(doorYaw));
const rootsPos=doorPos.clone().addScaledVector(doorFwd,1.15);  // the roots choke the doorway itself
const wrenSaved=()=>!!(G.undercroftPeople&&G.undercroftPeople.state&&G.undercroftPeople.state.wren&&G.undercroftPeople.state.wren.saved);

/* ================================================================ 5. PHYSICS */
G.walkOverrides.push((x,z)=>inBoxW(x,z)?true:null);
G.floorProviders.push((x,z,y)=>{
  if(!inBoxW(x,z))return null;
  const f=zoneFloor(x-O.x,z-O.z,y-O.y,'player'); return f==null?null:f+O.y;
});
G.constrainers.push((prev,next,y,rad,who)=>{
  if(!inBoxW(next.x,next.z)&&!inBoxW(prev.x,prev.z))return false;
  rad=rad||.4; const ly=y-O.y; who=who||'player';
  let nx=next.x-O.x, nzz=next.z-O.z; const px=prev.x-O.x, pz=prev.z-O.z;
  const Sp=(x,z)=>Sphys(x,z,ly,who);
  const s0=Sp(px,pz);
  let s=Sp(nx,nzz)+rad; if(s<=0)return false;
  for(let k=0;k<4&&s>0;k++){ const e=.1, gx=Sp(nx+e,nzz)-Sp(nx-e,nzz), gz=Sp(nx,nzz+e)-Sp(nx,nzz-e), gl=Math.hypot(gx,gz)||1;
    nx-=gx/gl*(s+.005); nzz-=gz/gl*(s+.005); s=Sp(nx,nzz)+rad; }
  if(s>.02&&!(s0+rad>0&&Sp(nx,nzz)<s0)){ next.x=prev.x; next.z=prev.z; return true; }
  const jump=Math.hypot(nx-px,nzz-pz), lim=Math.hypot(next.x-prev.x,next.z-prev.z)+.05;
  if(jump>lim){
    if(!(s0+rad>.06)){ next.x=prev.x; next.z=prev.z; return true; }
    const k=Math.max(lim,.12)/jump, ex=px+(nx-px)*k, ez=pz+(nzz-pz)*k;
    if(!(Sp(ex,ez)<s0)){ next.x=prev.x; next.z=prev.z; return true; }
    next.x=ex+O.x; next.z=ez+O.z; return true; }
  next.x=nx+O.x; next.z=nzz+O.z; return true;
});
G.cameraConstrainers.push((cam,target)=>{
  if(!S.inside)return;
  const tx=target.x-O.x, ty=target.y-O.y, tz=target.z-O.z, cx=cam.x-O.x, cy=cam.y-O.y, cz=cam.z-O.z;
  const bad=(x,y,z)=>Sat(x,z)>-.26||y>Cat(x,z)-.3||y<Fat(x,z)+.35||blockS(x,z,y-1,'camera')>-.2;
  const L=Math.hypot(cx-tx,cy-ty,cz-tz), n=Math.max(1,Math.ceil(L/.12));
  let gx=tx,gy=ty,gz=tz;
  if(bad(tx,ty,tz)){ let bx=tx, bz=tz; const P=G.player&&G.player.pos;
    if(P&&Sat(tx,tz)>-.3){ const px=P.x-O.x, pz=P.z-O.z; bx=px; bz=pz; const m=Math.max(1,Math.ceil(Math.hypot(tx-px,tz-pz)/.08));
      for(let i=1;i<=m;i++){ const x=px+(tx-px)*i/m, z=pz+(tz-pz)*i/m; if(Sat(x,z)>-.3)break; bx=x; bz=z; } }
    cam.set(bx+O.x,O.y+Math.min(Math.max(ty,Fat(bx,bz)+.4),Cat(bx,bz)-.25),bz+O.z); return; }
  for(let i=1;i<=n;i++){ const t=i/n, x=tx+(cx-tx)*t, y=ty+(cy-ty)*t, z=tz+(cz-tz)*t; if(bad(x,y,z))break; gx=x;gy=y;gz=z; }
  cam.set(gx+O.x,gy+O.y,gz+O.z);
});
// no double jump across the drowned garth (it would skip the Glass); combat.js hook
if(G.moves&&G.moves.noDoubleJump)G.moves.noDoubleJump.push(p=>S.inside&&inBoxW(p.x,p.z)&&p.x-O.x>CL.x0+CL.walk-1&&p.x-O.x<CL.x1+6&&p.z-O.z>CL.z0-1&&p.z-O.z<CL.z1-CL.walk+1);

/* ---------- a ray through the temple (lens.js): walls, floors, ceilings, blockers; returns the distance to the first hit ---------- */
function rayLocal(o,d,max,step){
  step=step||.08; let px=o.x, pz=o.z;
  for(let t=step;t<=max;t+=step){
    const x=o.x+d.x*t, y=o.y+d.y*t, z=o.z+d.z*t;
    if(Sfield(x,z,'player')>-.02||blockS(x,z,y-.8,'light')>-.02)return {t,surface:'wall',x:px,y,z:pz};
    const f=zoneFloor(x,z,y+.05,'player'); if(f!=null&&y<f)return {t,surface:'floor',x,y:f,z};
    if(y>Cat(x,z)-.05)return {t,surface:'ceiling',x,y,z};
    px=x; pz=z; }
  return null; }

/* ================================================================ 6. API */
function room(pos){ if(!pos||!inBoxW(pos.x,pos.z)||pos.y<O.y-40)return null; return roomAtL(pos.x-O.x,pos.z-O.z); }
const transferHooks=[], puzzleHooks=[];
const SWARM=new Set(['lantern','satchel','feed','hunt','jar','jarRelease','released']);
const API=G.temple={
  inside:false, origin:O.clone(), toWorld, toLocal, room, rooms,
  echoes:ECHOES.map(e=>({id:e.id,room:e.room,pos:e.pos.clone(),r:e.r})),
  pages:PAGES.map(p=>({id:p.id,pos:p.pos.clone(),room:p.room,kind:p.kind})),
  door:doorPos.clone(), get open(){ return S.open; }, get unlocked(){ return S.unlocked; },
  enter:(roomId,o)=>startTrans('in',roomId||'vestibule',o), exit:o=>startTrans('out',null,o),
  lightBrazier, isLit:id=>S.lit.has(id), get litRooms(){return [...S.lit];},
  braziers:BRAZ.map(c=>({id:c.id,room:c.room,pos:c.world.clone(),stand:c.stand.clone()})),
  setGate, gate:id=>!!S.gates[id], gates:()=>Object.assign({},S.gates),
  /** the seam's glow in the sanctum floor, 0 (closed) .. 1 (open) — the Boss agent closes it */
  setSeam:k=>{ S.seam=clamp(+k||0,0,1); }, get seam(){ return S.seam; },
  unlock:o=>unlock(o), openDoor:o=>openDoor(o&&o.restored),
  region:pos=>pos&&inBoxW(pos.x,pos.z)?regionAt(pos.x-O.x,pos.z-O.z,pos.y-O.y):null, connected:()=>[...connected()], stranded:()=>!!S.stranded,
  reached:()=>[...S.reached], followDraught:()=>followDraught(),
  sdf:(x,z)=>Sat(x,z), floorVis:(x,z)=>Fat(x,z), ceilVis:(x,z)=>Cat(x,z), floorAt:(x,z,y)=>zoneFloor(x,z,y),
  /** a ray in world space through the temple's stone (lens.js): {dist, point, surface} or null */
  ray(from,dir,max){ const l=toLocal(from); const r=rayLocal(l,dir,max); return r?{dist:r.t,point:toWorld(r.x,r.y,r.z),surface:r.surface}:null; },
  contains:(p)=>!!p&&inBoxW(p.x,p.z)&&p.y>O.y-40,
  roostPoints:(id)=>roostPoints(id||'well'),
  onTransfer:fn=>{transferHooks.push(fn);},
  /** puzzle state rides in the 'temple' save: {id, save:()=>json, load:(json)=>void} (temple_puzzles.js) */
  persist:h=>{ puzzleHooks.push(h); },
  block:(id,b)=>{ blockers[id]=b?Object.assign({y0:-50,y1:50},b):null; },
  /** pages: the text for a page id ({author,text,title}); set by the Boss agent (or G.templePeople.pages[id]) */
  pageText:null, readPage:id=>readPage(id), pagesRead:()=>Object.keys(S.pages),
  swarmStates:SWARM, zones:ZONES, well:{centre:W(WC.x,WC.bot,WC.z),r:WC.r,ri:WC.ri,top:WC.top+O.y,bot:WC.bot+O.y,rampY:th=>rampY(th)+O.y},
  stats:{fieldMs}
};
const INTERIOR={id:'temple',contains:(x,z,y)=>inBoxW(x,z)&&(y==null||y>O.y-40)};

/* ================================================================ 7. VISUALS */
const tpRoot=new THREE.Group(); tpRoot.name='temple'; tpRoot.position.copy(O); tpRoot.visible=false;
const isleRoot=new THREE.Group(); isleRoot.name='templeDoor';
const VIS={built:false};
const C=hex=>U.col(hex);
const tUni={uTime:{value:0},uSeam:{value:1}};

/* ---------- textures: cut ashlar (tall courses), dressed floor flags ---------- */
function ashlarCanvas(g,s){
  const r=U.rng(4417); g.fillStyle='#3e3c43'; g.fillRect(0,0,s,s);
  const rows=4, bh=s/rows;
  for(let j=0;j<rows;j++){ let x=-r()*s*.3; const y=j*bh;
    while(x<s){ const w=s*(.3+r()*.26), l=38+r()*12, hue=230+r()*60, sat=4+r()*6;
      for(const ox of [0,-s,s]){ const x0=x+ox+2, y0=y+2, ww=w-4, hh=bh-4;
        g.fillStyle=`hsl(${hue},${sat}%,${l}%)`; g.fillRect(x0,y0,ww,hh);
        const gr=g.createLinearGradient(0,y0,0,y0+hh); gr.addColorStop(0,'rgba(255,250,240,.10)'); gr.addColorStop(.15,'rgba(255,250,240,0)'); gr.addColorStop(1,'rgba(0,0,0,.18)'); g.fillStyle=gr; g.fillRect(x0,y0,ww,hh);
        g.fillStyle='rgba(255,255,255,.05)'; g.fillRect(x0,y0,ww,2); g.fillStyle='rgba(0,0,0,.18)'; g.fillRect(x0,y0+hh-2,ww,2);
        for(let k=0;k<40;k++){ g.fillStyle=r()<.5?'rgba(0,0,0,.09)':'rgba(255,250,240,.05)'; const cx=x0+r()*ww, cy=y0+r()*hh; g.save(); g.translate(cx,cy); g.rotate(.6+r()*.3); g.fillRect(0,0,1.2,3+r()*3); g.restore(); } } // chisel marks
      x+=w; } }
  for(let i=0;i<12;i++){ const x=r()*s, w=10+r()*30; const gr=g.createLinearGradient(0,0,0,s); gr.addColorStop(0,'rgba(10,8,14,0)'); gr.addColorStop(r(),'rgba(10,8,14,.12)'); gr.addColorStop(1,'rgba(10,8,14,0)'); g.fillStyle=gr; g.fillRect(x,0,w,s); }
  for(let i=0;i<26;i++){ g.fillStyle=`rgba(${120+r()*30},${140+r()*20},${110+r()*20},${.05+r()*.07})`; g.beginPath(); g.arc(r()*s,r()*s,3+r()*10,0,TAU); g.fill(); }
}
function flagsCanvas(g,s){
  const r=U.rng(8810); g.fillStyle='#1c1a20'; g.fillRect(0,0,s,s);
  const n=4, c=s/n;
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){ const x0=i*c+2.5, y0=j*c+2.5, w=c-5, l=36+r()*10, hue=240+r()*40, sat=3+r()*5;
    g.fillStyle=`hsl(${hue},${sat}%,${l}%)`; g.fillRect(x0,y0,w,w);
    const gr=g.createRadialGradient(x0+w*.4,y0+w*.4,4,x0+w*.5,y0+w*.5,w*.8); gr.addColorStop(0,'rgba(240,236,232,.05)'); gr.addColorStop(1,'rgba(0,0,0,.14)'); g.fillStyle=gr; g.fillRect(x0,y0,w,w);
    for(let k=0;k<60;k++){ g.fillStyle=r()<.5?'rgba(20,16,24,.08)':'rgba(240,230,220,.04)'; g.fillRect(x0+r()*w,y0+r()*w,1+r()*2,1+r()*2); }
    if(r()<.4){ g.strokeStyle='rgba(12,10,16,.55)'; g.lineWidth=1.2; g.beginPath(); let x=x0+r()*w, y=y0; g.moveTo(x,y); for(let k=0;k<5;k++){ x+=(r()-.5)*w*.4; y+=w/5; g.lineTo(clamp(x,x0,x0+w),y); } g.stroke(); } }
}
let ashTex=null, flagTex=null;
/** kind: 'wall'|'floor'|'ceil'|'stone' — toon + triplanar ashlar/flags; violet light seeps through the joints (aGlow) */
function triMaterial(kind,scale,o){
  if(!ashTex){ ashTex=G.canvasTex(512,ashlarCanvas); ashTex.wrapS=ashTex.wrapT=THREE.RepeatWrapping;
    flagTex=G.canvasTex(512,flagsCanvas); flagTex.wrapS=flagTex.wrapT=THREE.RepeatWrapping; }
  const m=G.toon('#ffffff',Object.assign({vertexColors:true},o||{}));
  const sc=scale.toFixed(3), glow=kind==='floor'||kind==='wall';
  m.onBeforeCompile=sh=>{
    sh.uniforms.uAsh={value:ashTex}; sh.uniforms.uFlag={value:flagTex}; sh.uniforms.uTime=tUni.uTime;
    sh.vertexShader='varying vec3 vWP;varying vec3 vWN;'+(glow?'attribute float aGlow;varying float vGl;':'')+'\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vWP=(modelMatrix*vec4(transformed,1.)).xyz; vWN=normalize(mat3(modelMatrix)*objectNormal);'+(glow?' vGl=aGlow;':''));
    sh.fragmentShader='uniform sampler2D uAsh,uFlag;uniform float uTime;varying vec3 vWP;varying vec3 vWN;'+(glow?'varying float vGl;':'')+'\n'+sh.fragmentShader.replace('#include <map_fragment>',`
      vec4 tc; { vec3 n=abs(normalize(vWN));
        ${kind==='floor'?`tc=texture2D(uFlag,vWP.xz*${sc});`:kind==='stone'?`vec3 bw=pow(n,vec3(4.)); bw/=dot(bw,vec3(1.)); tc=texture2D(uAsh,vWP.zy*${sc})*bw.x+texture2D(uFlag,vWP.xz*${sc}*.5)*bw.y+texture2D(uAsh,vWP.xy*${sc})*bw.z;`:
          `vec3 bw=pow(n,vec3(4.)); bw/=dot(bw,vec3(1.));
           vec4 tx=texture2D(uAsh,vec2(vWP.z,vWP.y*1.15)*${sc}), tz=texture2D(uAsh,vec2(vWP.x,vWP.y*1.15)*${sc}), ty=texture2D(uFlag,vWP.xz*${sc});
           tc=tx*bw.x+ty*bw.y+tz*bw.z;`}
        diffuseColor.rgb*=pow(tc.rgb,vec3(2.2))*${kind==='stone'?'2.3':'2.1'}; }`)
      .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n'+(glow?`
      { float lum=dot(tc.rgb,vec3(.33)); float joint=1.-smoothstep(.12,.2,lum);
        vec2 q=vWP.xz*.13+vec2(vWP.y*.07); vec2 i=floor(q), f=fract(q); f=f*f*(3.-2.*f);
        float h00=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5), h10=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5), h01=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5), h11=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5);
        float vn=mix(mix(h00,h10,f.x),mix(h01,h11,f.x),f.y); float crack=smoothstep(.4,.7,vn);
        float pulse=.75+.25*sin(uTime*.9+vWP.x*.31+vWP.z*.23);
        totalEmissiveRadiance+=vec3(.42,.14,.9)*vGl*(joint*crack*2.2+.04)*pulse; }`:''));
  };
  m.customProgramCacheKey=()=>'tpTri'+kind+sc;
  return m;
}

/* ---------- geometry helpers ---------- */
function mergeGeos(list){
  let n=0; const parts=list.map(({geo,color})=>{ const g=geo.index?geo.toNonIndexed():geo; if(!g.attributes.normal)g.computeVertexNormals(); n+=g.attributes.position.count; return {g,color}; });
  const pos=new Float32Array(n*3), nor=new Float32Array(n*3), col=new Float32Array(n*3); let o=0;
  for(const {g,color} of parts){ const p=g.attributes.position.array, q=g.attributes.normal.array, c=g.attributes.color?g.attributes.color.array:null;
    pos.set(p,o*3); nor.set(q,o*3);
    for(let i=0;i<g.attributes.position.count;i++){ if(c){col[(o+i)*3]=c[i*3];col[(o+i)*3+1]=c[i*3+1];col[(o+i)*3+2]=c[i*3+2];} else {col[(o+i)*3]=color.r;col[(o+i)*3+1]=color.g;col[(o+i)*3+2]=color.b;} }
    o+=g.attributes.position.count; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3)); g.setAttribute('color',new THREE.BufferAttribute(col,3));
  g.computeBoundingSphere(); return g;
}
const _eu=new THREE.Euler(), _m4=new THREE.Matrix4();
class Builder{ constructor(){this.list=[];}
  add(geo,color,x,y,z,ry,rx,rz,sx,sy,sz){ const g=geo.clone(); _m4.makeRotationFromEuler(_eu.set(rx||0,ry||0,rz||0,'YXZ'));
    if(sx!=null)_m4.scale(V(sx,sy==null?sx:sy,sz==null?sx:sz)); _m4.setPosition(x||0,y||0,z||0); g.applyMatrix4(_m4);
    this.list.push({geo:g,color:typeof color==='string'?C(color):color}); return this; }
  box(w,h,d,color,x,y,z,ry,rx,rz){ return this.add(new THREE.BoxGeometry(w,h,d),color,x,y,z,ry,rx,rz); }
  cyl(r0,r1,h,color,x,y,z,seg,ry,rx,rz){ return this.add(new THREE.CylinderGeometry(r0,r1,h,seg||8),color,x,y,z,ry,rx,rz); }
  sph(r,color,x,y,z,sx,sy,sz){ return this.add(new THREE.SphereGeometry(r,8,6),color,x,y,z,0,0,0,sx||1,sy,sz); }
  mesh(mat,name){ if(!this.list.length)return null; const m=new THREE.Mesh(mergeGeos(this.list),mat); if(name)m.name=name; return m; } }
function tube(points,r,seg,rseg){ return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),seg||Math.max(4,points.length*4),r,rseg||5,false); }
const jit=(c,r,k)=>{ const o=C(c); const f=1+(r()-.5)*(k||.18); return o.multiplyScalar(f); };
/** violet underglow by depth: nothing at the vestibule, strongest in the sanctum */
const depthGlow=y=>smooth(-2,-16,y)*.9+.02;

/* ---------- the shell: floor + vaulted ceiling heightfields, ashlar walls from the field's zero contour ---------- */
const TAGCOL={vestibule:['#7a7680','#6a6670'],nave:['#6e6b78','#5e5b6a'],reliquary:['#77706e','#655e60'],cloister:['#68706c','#575e5c'],well:['#5f5a6a','#4f4a5c'],sanctum:['#5a5068','#463e56']};
function buildShell(){
  const floorMat=triMaterial('floor',.3), wallMat=triMaterial('wall',.3,{side:THREE.DoubleSide}), ceilMat=triMaterial('ceil',.34);
  VIS.mats={floorMat,wallMat,ceilMat};
  const tc=new THREE.Color();
  const fp=[],fc=[],fg=[],fi=[], cp=[],cc=[],ci=[]; const fV=new Int32Array(NX*NZ).fill(-1), cV=new Int32Array(NX*NZ).fill(-1);
  const fvert=k=>{ if(fV[k]>=0)return fV[k]; const i=k%NX, j=(k/NX)|0, x=GX0+i*GS, z=GZ0+j*GS, s=gS[k];
    fV[k]=fp.length/3; fp.push(x,gF[k],z); const pal=TAGCOL[TAGS[gTag[k]]]||TAGCOL.nave;
    tc.copy(C(pal[0])).lerp(C(pal[1]),vnoise(x*.21,z*.21));
    tc.multiplyScalar((.8+.3*vnoise(x*.7+3,z*.7))*(.6+.4*smooth(.1,-1.3,s))); fc.push(tc.r,tc.g,tc.b);
    fg.push(depthGlow(gF[k])*(.4+.6*vnoise(x*.35+7,z*.35))); return fV[k]; };
  const cvert=k=>{ if(cV[k]>=0)return cV[k]; const i=k%NX, j=(k/NX)|0, x=GX0+i*GS, z=GZ0+j*GS, s=gS[k];
    cV[k]=cp.length/3; cp.push(x,gC[k],z); tc.copy(C('#5d5a66')).lerp(C('#45424e'),vnoise(x*.3,z*.3)); tc.multiplyScalar(.7+.3*smooth(0,-1.2,s)); cc.push(tc.r,tc.g,tc.b); return cV[k]; };
  for(let j=0;j<NZ-1;j++)for(let i=0;i<NX-1;i++){
    const k=[j*NX+i,j*NX+i+1,(j+1)*NX+i,(j+1)*NX+i+1];
    const smin=Math.min(gS[k[0]],gS[k[1]],gS[k[2]],gS[k[3]]); if(smin>.35)continue;
    const fmin=Math.min(gF[k[0]],gF[k[1]],gF[k[2]],gF[k[3]]), fmax=Math.max(gF[k[0]],gF[k[1]],gF[k[2]],gF[k[3]]);
    if(fmax-fmin<.08&&!(gStair[k[0]]|gStair[k[1]]|gStair[k[2]]|gStair[k[3]])){ const a=fvert(k[0]),b=fvert(k[1]),c=fvert(k[2]),d=fvert(k[3]); fi.push(a,c,b,b,c,d); }
    const A=cvert(k[0]),B=cvert(k[1]),Cc=cvert(k[2]),D=cvert(k[3]); ci.push(A,B,Cc,B,D,Cc);
  }
  const mk=(p,c,ix,mat,name,gl)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(p,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
    if(gl)g.setAttribute('aGlow',new THREE.Float32BufferAttribute(gl,1));
    g.setIndex(ix); g.computeVertexNormals(); g.computeBoundingSphere(); const m=new THREE.Mesh(g,mat); m.name=name; tpRoot.add(m); return m; };
  VIS.floor=mk(fp,fc,fi,floorMat,'tpFloor',fg); VIS.ceil=mk(cp,cc,ci,ceilMat,'tpCeil');
  // walls: marching squares on gS, extruded from below the floor to above the vault; the base glows violet by depth
  const wp=[],wc=[],wg=[]; let segs=0;
  const node=(i,j)=>gS[j*NX+i];
  const lerpE=(ax,az,sa,bx,bz,sb)=>{ const t=sa/(sa-sb); return [ax+(bx-ax)*t,az+(bz-az)*t]; };
  const addWall=(p0,p1)=>{
    const mx=(p0[0]+p1[0])/2, mz=(p0[1]+p1[1])/2, e=.15;
    let nx=-(Sat(mx+e,mz)-Sat(mx-e,mz)), nz=-(Sat(mx,mz+e)-Sat(mx,mz-e)); const nl=Math.hypot(nx,nz)||1; nx/=nl; nz/=nl;
    const inF=(p)=>Fat(p[0]+nx*.35,p[1]+nz*.35), inC=(p)=>Cat(p[0]+nx*.2,p[1]+nz*.2);
    const y0=Math.min(inF(p0),inF(p1))-.7, y1a=Math.max(inC(p0),Fat(p0[0],p0[1])+1)+.25, y1b=Math.max(inC(p1),Fat(p1[0],p1[1])+1)+.25;
    const v=[[p0[0],y0,p0[1]],[p1[0],y0,p1[1]],[p1[0],y1b,p1[1]],[p0[0],y1a,p0[1]]];
    const ux=p1[0]-p0[0], uz=p1[1]-p0[1]; const flip=(ux*nz-uz*nx)>0;
    const tri=flip?[0,2,1,0,3,2]:[0,1,2,0,2,3];
    const lum=.8+.3*vnoise(mx*.4,mz*.4), dg=depthGlow(y0+.7);
    for(const q of tri){ const yy=v[q][1]; wp.push(v[q][0],yy,v[q][2]);
      tc.copy(C('#7b7684')).lerp(C('#5d5a68'),vnoise(mx*.13+yy*.2,mz*.13)).multiplyScalar(lum*(yy<y0+1?.75:1)); wc.push(tc.r,tc.g,tc.b);
      wg.push(yy<y0+1?dg*.9:dg*.12); }
    segs++; };
  for(let j=0;j<NZ-1;j++)for(let i=0;i<NX-1;i++){
    const a=node(i,j),b=node(i+1,j),c=node(i+1,j+1),d=node(i,j+1);
    const idx=(a<0?1:0)|(b<0?2:0)|(c<0?4:0)|(d<0?8:0); if(idx===0||idx===15)continue;
    const x0=GX0+i*GS, z0=GZ0+j*GS, x1=x0+GS, z1=z0+GS;
    const eAB=()=>lerpE(x0,z0,a,x1,z0,b), eBC=()=>lerpE(x1,z0,b,x1,z1,c), eCD=()=>lerpE(x1,z1,c,x0,z1,d), eDA=()=>lerpE(x0,z1,d,x0,z0,a);
    switch(idx){
      case 1: case 14: addWall(eDA(),eAB()); break;
      case 2: case 13: addWall(eAB(),eBC()); break;
      case 3: case 12: addWall(eDA(),eBC()); break;
      case 4: case 11: addWall(eBC(),eCD()); break;
      case 6: case 9: addWall(eAB(),eCD()); break;
      case 7: case 8: addWall(eDA(),eCD()); break;
      case 5: addWall(eDA(),eAB()); addWall(eBC(),eCD()); break;
      case 10: addWall(eAB(),eBC()); addWall(eCD(),eDA()); break;
    }
  }
  const wgeo=new THREE.BufferGeometry(); wgeo.setAttribute('position',new THREE.Float32BufferAttribute(wp,3)); wgeo.setAttribute('color',new THREE.Float32BufferAttribute(wc,3)); wgeo.setAttribute('aGlow',new THREE.Float32BufferAttribute(wg,1));
  wgeo.computeVertexNormals(); wgeo.computeBoundingSphere();
  VIS.walls=new THREE.Mesh(wgeo,wallMat); VIS.walls.name='tpWalls'; tpRoot.add(VIS.walls);
  API.stats.wallSegs=segs; API.stats.floorTris=fi.length/3; API.stats.ceilTris=ci.length/3;
}

/* ---------- props ---------- */
let mats=null;
function propMats(){ if(mats)return mats;
  mats={stone:triMaterial('stone',.55),bronze:G.toon('#ffffff',{vertexColors:true,emissive:'#1c1408',emissiveIntensity:.25}),
    cloth:G.toon('#ffffff',{vertexColors:true}),root:G.toon('#ffffff',{vertexColors:true,emissive:'#24103a',emissiveIntensity:.4}),
    dark:new THREE.MeshBasicMaterial({color:C('#050407')})};
  return mats; }
function treadsFor(Z,B,col){ const s=Z.stair, n=s.n, d=(s.a1-s.a0)/(n+1), lo=Math.min(s.y0,s.y1)-.6;
  for(let k=0;k<=n;k++){ let c0=s.a0+k*d, c1=c0+d; if(k===0)c0-=Math.sign(d)*.35; if(k===n)c1+=Math.sign(d)*.35;
    const top=s.y0+(s.y1-s.y0)*k/n, h=top-lo, cm=(c0+c1)/2, len=Math.abs(c1-c0), lw=s.l1-s.l0+.5, lm=(s.l0+s.l1)/2;
    if(s.axis==='z')B.box(lw,h,len,col(k),lm,lo+h/2,cm); else B.box(len,h,lw,col(k),cm,lo+h/2,lm); } }
/* a carved watcher: a hooded, robed figure, hands folded, the face a smooth mask with two hollow eyes */
const WATCH_PROF=[[0,0],[.42,0],[.44,.1],[.36,.25],[.34,.9],[.3,1.4],[.34,1.62],[.3,1.78],[.24,1.92],[.14,2.0],[0,2.02]].map(p=>new THREE.Vector2(p[0],p[1]));
function watcher(B,x,y,z,yaw,s,col){
  const cs=Math.cos(yaw), sn=Math.sin(yaw), P=(dx,dy,dz)=>[x+(dx*cs+dz*sn)*s,y+dy*s,z+(-dx*sn+dz*cs)*s];
  const body=new THREE.LatheGeometry(WATCH_PROF,10); B.add(body,col,x,y,z,yaw,0,0,s,s,s);
  // the hood (a cowl leaning forward), the face (a flattened sphere), the folded hands
  { const p=P(0,2.0,.04); B.add(new THREE.SphereGeometry(.27,10,8,0,TAU,0,PI*.62),col.clone().multiplyScalar(.92),p[0],p[1],p[2],yaw,.25,0,s,s*1.15,s); }
  { const p=P(0,1.86,.16); B.add(new THREE.SphereGeometry(.17,10,8),col.clone().multiplyScalar(1.12),p[0],p[1],p[2],yaw,0,0,s,s*1.2,s*.55); }
  { const p=P(0,1.22,.3); B.add(new THREE.BoxGeometry(.3,.16,.16),col.clone().multiplyScalar(.95),p[0],p[1],p[2],yaw,.2,0,s,s,s); }
  for(const e of [-1,1]){ const p=P(e*.065,1.92,.245); B.add(new THREE.SphereGeometry(.045,6,5),C('#0b0910'),p[0],p[1],p[2],yaw,0,0,s,s*.8,s*.6); }
  return [P(-.065,1.92,.27),P(.065,1.92,.27)];
}
function buildProps(){
  const M=propMats(), r=U.rng(3311);
  const St=new Builder(), Br=new Builder(), Cl=new Builder(), Dk=new Builder();
  const stoneC=()=>jit('#8e8a96',r,.14), darkStone=()=>jit('#66626e',r,.2), bronze=()=>jit('#8a6a3a',r,.15), verd=()=>jit('#5f8a74',r,.15);
  const col=(x,z,w,d,y0,y1,yaw)=>G.addBoxCollider({x:O.x+x,z:O.z+z,hw:w/2,hd:d/2,yaw:yaw||0,y0:O.y+y0-1,y1:O.y+y1});
  const circleCol=(x,z,rr,y0,y1)=>G.addCollider({x:O.x+x,z:O.z+z,r:rr,y0:O.y+y0-1,y1:O.y+y1});
  const eyes=[];
  // --- stairs: treads for every stepped zone
  for(const Z of ZONES){ if(!Z.stair)continue; treadsFor(Z,St,()=>stoneC()); }
  // --- the Stair of Watchers: the door landing, the night beyond, watchers in the niches, the vestibule
  St.box(3.8,.4,.5,darkStone(),0,9.8,15.3).box(.5,5,.5,darkStone(),-1.95,7.5,15.3).box(.5,5,.5,darkStone(),1.95,7.5,15.3);
  { const nm=new THREE.Mesh(new THREE.PlaneGeometry(3.3,4.6),new THREE.MeshBasicMaterial({color:C('#2a2238'),fog:false})); nm.rotation.y=PI; nm.position.set(0,7.3,15.35); tpRoot.add(nm); VIS.night=nm; }
  for(const s of [-1,1]) for(const z of NICHE_Z){ const y=stairF(0,z); eyes.push(...watcher(St,s*2.2,y,z,s<0?PI/2:-PI/2,1.12,jit('#9a96a2',r,.08))); St.box(.9,.5,1.1,darkStone(),s*2.2,y+.25-.5,z); circleCol(s*2.2,z,.5,y,y+2.4); }
  for(const s of [-1,1]) for(const z of [-4.2,.8]){ eyes.push(...watcher(St,s*5.55,0,z,s<0?PI/2:-PI/2,1.4,jit('#9a96a2',r,.08))); circleCol(s*5.55,z,.55,0,2.9); }
  // a stone bench (page 1), sacks of the old offerings, and a carved band of moths along the walls
  St.box(1.7,.42,.62,stoneC(),-3.7,.21,-4.3); col(-3.7,-4.3,1.7,.62,0,.42);
  for(let k=0;k<12;k++){ const x=-4.6+k*.85; St.box(.5,.08,.06,darkStone(),x,3.1,-6.96); Br.add(new THREE.ConeGeometry(.12,.3,3),verd(),x+.25,3.1,-6.94,0,PI/2,PI/2); }
  // --- the nave: pier capitals, gallery ledges, the sun-disc door, the watchers' alcove (the eyes)
  for(const s of [-1,1]) for(const z of PIER_Z){ St.box(1.25,.5,1.25,stoneC(),s*4,1.5,z).box(1.45,.25,1.45,darkStone(),s*4,1.85,z).box(1.3,.3,1.3,darkStone(),s*4,-2.85,z);
    for(let k=0;k<4;k++)St.box(1.18,.04,.04,darkStone(),s*4,-1.6+k*.8,z+.575).box(1.18,.04,.04,darkStone(),s*4,-1.6+k*.8,z-.575); }
  for(const [x,z] of [[-2.65,-22],[2.65,-40]]){ const sd=Math.sign(x); St.box(1.4,.36,1.0,stoneC(),x+sd*.35,.62,z).box(1.0,.5,.8,darkStone(),x+sd*.55,.2,z).box(.6,.6,.6,darkStone(),x+sd*.75,-.3,z); }  // the corbels the mirrors stand on
  for(const s of [-1,1]){ St.box(.9,.3,40,darkStone(),s*6.6,3.2,-30.4); for(let k=0;k<16;k++)St.box(.25,.5,.25,stoneC(),s*6.25,3.55,-11.6-k*2.5); }
  St.box(4.2,.6,.8,darkStone(),0,3.6,-50.0).box(.7,6.6,.7,darkStone(),-2.05,0,-50.1).box(.7,6.6,.7,darkStone(),2.05,0,-50.1);
  // two great watchers either side of the north stair, facing down the hall; the left one's eyes take the mirrors' light
  for(const x of [-2.65,2.65]){ const p=watcher(St,x,-3,-11.3,PI,2.1,jit('#8c8894',r,.06)); if(x<0)VIS.eyesAt=p; else eyes.push(...p); circleCol(x,-11.3,.95,-3,1.4); St.box(2.0,.4,2.0,darkStone(),x,-2.8,-11.3); }
  // --- the reliquary: offering shelves of urns and small bronze moths, the altar in the apse, the recess
  for(const z of [-35.2,-44.8]){ for(let l=0;l<3;l++){ St.box(8,.12,.7,stoneC(),-24,-3.2+l*1.1,z+(z<-40?.15:-.15)); }
    for(let k=0;k<16;k++){ const x=-27.6+k*.5+(r()-.5)*.1, l=(k*7)%3, y=-3.14+l*1.1;
      if(r()<.6)Cl.cyl(.1,.14,.32,jit(['#7a5c3e','#6b4e57','#8a7d6a'][k%3],r),x,y+.16,z,8);
      else Br.add(new THREE.ConeGeometry(.12,.04,3),verd(),x,y+.04,z,r()*TAU,0,0).add(new THREE.ConeGeometry(.12,.04,3),verd(),x+.1,y+.04,z,r()*TAU); } }
  St.box(1.6,1.0,2.2,stoneC(),-31.2,-3.5,-40).box(1.8,.14,2.4,darkStone(),-31.2,-2.96,-40); col(-31.2,-40,1.8,2.4,-4,-2.9);
  Cl.box(1.4,.02,1.0,jit('#5a3f6e',r,.1),-31.2,-2.88,-40).box(.02,.6,1.0,jit('#5a3f6e',r,.1),-30.31,-3.2,-40);
  St.box(2.6,.4,.5,darkStone(),-24,-1.2,-45.65).box(.4,2.8,.5,darkStone(),-25.3,-2.6,-45.65).box(.4,2.8,.5,darkStone(),-22.7,-2.6,-45.65);
  St.box(1.2,.5,.8,stoneC(),-24,-3.75,-47.2);
  // --- the cloister: the arcades (the present west and north walks), stubs where the south and east walks fell, the rubble corner
  const arch=(B,x,z,axis,len,y,c)=>{ // a row of columns with round arches along an axis
    const n=Math.round(len/2.6); for(let k=0;k<=n;k++){ const t=k/n; const px=axis==='x'?x+len*t:x, pz=axis==='z'?z-len*t:z;
      B.cyl(.22,.26,3.6,c(),px,y+1.8,pz,8).box(.6,.3,.6,c(),px,y+3.75,pz).box(.6,.2,.6,c(),px,y+.1,pz);
      if(k<n){ for(let q=1;q<8;q++){ const a=q/8*PI, ax=axis==='x'?px+(1-Math.cos(a))*len/n/2:px, az=axis==='z'?pz-(1-Math.cos(a))*len/n/2:pz;
        B.box(axis==='x'?.4:.35,.3,axis==='z'?.4:.35,c(),ax,y+3.9+Math.sin(a)*.95,az,0,0,axis==='x'?-(a-PI/2)*.9:0); } } }
    B.box(axis==='x'?len+.6:.5,.6,axis==='z'?len+.6:.5,c(),axis==='x'?x+len/2:x,y+5.2,axis==='z'?z-len/2:z); };
  arch(St,CL.x0+CL.walk,CL.z1-CL.walk,'z',CL.z1-CL.walk-(CL.z0+CL.walk),-6,stoneC);
  arch(St,CL.x0+CL.walk,CL.z1-CL.walk,'x',27.4-(CL.x0+CL.walk),-6,stoneC);
  for(let k=0;k<6;k++){ const x=CL.x0+CL.walk+1.6+k*2.6+(r()-.5)*.3; St.cyl(.22,.26,.6+r()*1.4,stoneC(),x,-7.6+r()*.4,CL.z0+CL.walk+.1,8,0,(r()-.5)*.3,(r()-.5)*.3); }
  for(let k=0;k<4;k++){ const z=CL.z0+CL.walk+2+k*2.6; St.cyl(.22,.26,.6+r()*1.2,stoneC(),CL.x1-CL.walk-.1,-7.8+r()*.4,z,8,0,(r()-.5)*.3,(r()-.5)*.3); }
  for(let k=0;k<26;k++){ const s=.3+r()*.6; St.add(new THREE.DodecahedronGeometry(s,0),jit(r()<.6?'#6e6a74':'#7d7884',r,.3),27.6+r()*6.6,-6+s*.4+r()*1.4*(1-r()),-39.4+r()*3.8,r()*3,r()*3,r()*3); }
  // the broken edge of the walks over the water: a lip of cut stone, and fallen blocks in the water
  St.box(.4,.6,CL.z1-CL.z0-2*CL.walk+.4,darkStone(),CL.x0+CL.walk+.05,-6.3,(CL.z0+CL.z1)/2).box(27.4-CL.x0-CL.walk,.6,.4,darkStone(),(CL.x0+CL.walk+27.4)/2,-6.3,CL.z1-CL.walk-.05);
  for(let k=0;k<14;k++){ const s=.35+r()*.7; St.add(new THREE.DodecahedronGeometry(s,0),darkStone(),CL.x0+CL.walk+1+r()*15,-9.2+s*.3,CL.z0+.8+r()*15.5,r()*3,r()*3,r()*3); }
  // the winch room: the great windlass (puzzle drives the drum), the chain up through the vault
  St.box(.6,1.4,2.2,darkStone(),37.6,-5.3,-47.8).box(.6,1.4,2.2,darkStone(),37.6,-5.3,-44.0);
  col(37.6,-47.8,.6,2.2,-6,-4.6); col(37.6,-44,.6,2.2,-6,-4.6);
  // --- the well: the walk itself (slabs along the helix with corbels under them), the parapet, the rim
  { const N=96; for(let k=0;k<N;k++){ const t0=WC.a0+(WC.a1-WC.a0)*k/N, t1=WC.a0+(WC.a1-WC.a0)*(k+1)/N, tm=(t0+t1)/2, a=tm*PI/180, y=rampY(tm), rm=(WC.ri+WC.r)/2;
      const len=(t1-t0)*PI/180*rm+.06, cx=Math.cos(a)*rm, cz=WC.z+Math.sin(a)*rm, yaw=-a+PI/2, slope=Math.atan2(rampY(t0)-rampY(t1),len);
      St.box(WC.r-WC.ri+.4,.35,len,stoneC(),cx,y-.175,cz,-a,slope*0,0);
      if(k%3===0){ St.box(1.1,.9,.5,darkStone(),Math.cos(a)*(WC.r-.5),y-.8,WC.z+Math.sin(a)*(WC.r-.5),-a); }
      if(k%2===0&&y>WC.bot+1){ St.box(.35,.55,len*2,darkStone(),Math.cos(a)*(WC.ri+.15),y+.27,WC.z+Math.sin(a)*(WC.ri+.15),-a); } } }
  // the shaft's floor: the moth-wing well-head (decal), stones; the niche's shelf
  { const a=NICHE_A*PI/180; St.box(.9,.5,1.6,darkStone(),Math.cos(a)*12.2,nicheY+.25,WC.z+Math.sin(a)*12.2,-a); }
  // --- the sanctum: the ring of piers with watchers on them, the exit stair (beyond its grate), the carving's slab
  for(const p of ANCH.sanctum.ring){ const l=toLocal(p); St.box(1.5,.5,1.5,darkStone(),l.x,1.2,l.z).box(1.4,.4,1.4,darkStone(),l.x,-15.8,l.z); }
  for(let k=0;k<8;k++){ const a=(k+.5)/8*TAU, x=SC.x+Math.cos(a)*16.8, z=SC.z+Math.sin(a)*16.8; eyes.push(...watcher(St,x,-16,z,Math.atan2(SC.x-x,SC.z-z),1.6,jit('#7c7686',r,.06))); circleCol(x,z,.6,-16,-12.6); }
  St.box(6.4,5.6,.4,jit('#5a5466',r,.05),0,-13,-117.9);
  for(let k=0;k<6;k++)St.box(2.2,.32,1.4,stoneC(),21.4+k*.0,-15.84+k*.0,-100);
  // --- merge
  const add=(B,mat,name)=>{ const m=B.mesh(mat,name); if(m)tpRoot.add(m); return m; };
  VIS.stone=add(St,M.stone,'tpStone'); VIS.bronze=add(Br,M.bronze,'tpBronze'); VIS.cloth=add(Cl,M.cloth,'tpCloth');
  // the watchers' eyes: hollow, with a faint violet ember deep in them that grows the deeper you go
  { const pos=[], al=[]; for(const e of eyes){ pos.push(e[0],e[1],e[2]); al.push(.25+depthGlow(e[1])*.9); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('alpha',new THREE.Float32BufferAttribute(al,1));
    const pm=new THREE.ShaderMaterial({uniforms:{uMap:{value:G.tex.soft},uTime:tUni.uTime},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:'attribute float alpha;varying float vA;uniform float uTime;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vA=alpha*(.7+.3*sin(uTime*.7+position.x*3.+position.z));gl_PointSize=55./-mv.z;gl_Position=projectionMatrix*mv;}',
      fragmentShader:'uniform sampler2D uMap;varying float vA;void main(){vec4 t=texture2D(uMap,gl_PointCoord);gl_FragColor=vec4(vec3(.62,.3,1.)*t.a*vA*1.4,1.);}'});
    const pts=new THREE.Points(g,pm); pts.frustumCulled=false; pts.name='tpEyes'; tpRoot.add(pts); }
  VIS.built=true; updateGateVis(true);
}

/* ---------- moth-wing patterns inlaid in the floors (one decal mesh) ---------- */
function mothWingCanvas(g,s){
  g.clearRect(0,0,s,s); const h=s/2;
  g.strokeStyle='rgba(225,210,255,.9)'; g.fillStyle='rgba(200,180,240,.22)'; g.lineWidth=s*.012;
  for(const sx of [-1,1]){ g.save(); g.translate(h,h); g.scale(sx,1);
    g.beginPath(); g.moveTo(s*.02,-s*.06); g.bezierCurveTo(s*.18,-s*.42,s*.46,-s*.44,s*.45,-s*.18); g.bezierCurveTo(s*.44,-s*.02,s*.22,s*.02,s*.02,0); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(s*.02,s*.02); g.bezierCurveTo(s*.16,s*.08,s*.36,s*.18,s*.3,s*.36); g.bezierCurveTo(s*.22,s*.46,s*.08,s*.3,s*.02,s*.12); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(s*.27,-s*.22,s*.07,0,TAU); g.stroke(); g.beginPath(); g.arc(s*.27,-s*.22,s*.025,0,TAU); g.fill();
    for(let k=0;k<4;k++){ g.beginPath(); g.moveTo(s*.04,-s*.03); g.quadraticCurveTo(s*(.2+k*.05),-s*(.18+k*.05),s*(.3+k*.04),-s*(.1+k*.06)); g.stroke(); }
    g.restore(); }
  g.beginPath(); g.ellipse(h,h,s*.025,s*.16,0,0,TAU); g.fillStyle='rgba(225,210,255,.7)'; g.fill();
  g.beginPath(); g.arc(h,h,s*.48,0,TAU); g.lineWidth=s*.008; g.stroke(); g.beginPath(); g.arc(h,h,s*.45,0,TAU); g.stroke();
}
function buildDecals(){
  const tex=G.canvasTex(256,mothWingCanvas); const list=[];
  const put=(x,y,z,size,yaw)=>{ const g=new THREE.PlaneGeometry(size,size); g.rotateX(-PI/2); g.rotateY(yaw||0); g.translate(x,y+.025,z); list.push(g); };
  put(0,0,-1.5,5.2,0); put(0,-3,-20,6,0); put(0,-3,-31,6,PI); put(0,-3,-42,6,0); put(-24,-4,-40,4.6,PI/2); put(0,WC.bot,WC.z,9,0); put(SC.x,-16,SC.z,22,0);
  put(15.6,-6,-46,2.4,PI/2);
  let n=0; for(const g of list)n+=g.attributes.position.count;
  const merged=new THREE.BufferGeometry(), pos=new Float32Array(n*3), uv=new Float32Array(n*2), gl=new Float32Array(n); let o=0; const idx=[];
  for(const g of list){ pos.set(g.attributes.position.array,o*3); uv.set(g.attributes.uv.array,o*2); for(let i=0;i<g.attributes.position.count;i++)gl[o+i]=depthGlow(g.attributes.position.array[i*3+1]);
    for(const k of g.index.array)idx.push(k+o); o+=g.attributes.position.count; }
  merged.setAttribute('position',new THREE.BufferAttribute(pos,3)); merged.setAttribute('uv',new THREE.BufferAttribute(uv,2)); merged.setAttribute('aGlow',new THREE.BufferAttribute(gl,1)); merged.setIndex(idx); merged.computeBoundingSphere();
  const m=new THREE.ShaderMaterial({uniforms:{uMap:{value:tex},uTime:tUni.uTime,uSeam:tUni.uSeam},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:'attribute float aGlow;varying vec2 vUv;varying float vG;varying vec3 vW;void main(){vUv=uv;vG=aGlow;vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.);}',
    fragmentShader:'uniform sampler2D uMap;uniform float uTime,uSeam;varying vec2 vUv;varying float vG;varying vec3 vW;void main(){vec4 t=texture2D(uMap,vUv);float p=.7+.3*sin(uTime*.6+vW.x*.2+vW.z*.15);gl_FragColor=vec4(vec3(.5,.3,.95)*t.a*(.08+vG*.42)*p,1.);}',
    polygonOffset:true,polygonOffsetFactor:-2});
  const mesh=new THREE.Mesh(merged,m); mesh.name='tpDecals'; mesh.renderOrder=1; tpRoot.add(mesh);
}

/* ---------- the seam: a jagged crack of violet light in the sanctum floor (the Boss agent dims it with setSeam) ---------- */
function buildSeam(){
  const r=U.rng(616), pts=[]; let x=-4.2, z=0;
  for(let k=0;k<=14;k++){ pts.push([x,z]); x+=.6; z+=(r()-.5)*.9; }
  const P=[], A=[]; const w=k=>.08+.28*Math.sin(k/14*PI);
  for(let k=0;k<pts.length;k++){ const [px,pz]=pts[k], ww=w(k); P.push(px,-15.985,pz-ww, px,-15.985,pz+ww); A.push(1,1); }
  const idx=[]; for(let k=0;k<pts.length-1;k++){ const a=k*2; idx.push(a,a+1,a+2,a+1,a+3,a+2); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setIndex(idx); g.translate(SC.x,0,SC.z); g.computeBoundingSphere();
  const m=new THREE.ShaderMaterial({uniforms:{uTime:tUni.uTime,uSeam:tUni.uSeam},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform float uTime,uSeam;varying vec3 vP;void main(){float f=.7+.3*sin(uTime*3.+vP.x*2.)+.15*sin(uTime*11.+vP.x*7.);gl_FragColor=vec4(vec3(1.1,.55,2.2)*f*uSeam,1.);}'});
  VIS.seam=new THREE.Mesh(g,m); VIS.seam.name='tpSeam'; tpRoot.add(VIS.seam);
  VIS.seamGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:C('#9a5cff'),transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}));
  VIS.seamGlow.scale.set(14,5,1); VIS.seamGlow.position.set(SC.x,-14.6,SC.z); tpRoot.add(VIS.seamGlow);
  VIS.seamLight=new THREE.PointLight(0xa070ff,0,26,1.6); VIS.seamLight.position.set(SC.x,-14.2,SC.z); tpRoot.add(VIS.seamLight);
}

/* ---------- switchable: the sun-disc door, the cloister door's frame, the exit grate, the eyes slab, the sanctum grate ---------- */
function buildGates(){
  const M=propMats();
  const sd=new Builder(); sd.box(3.6,6.2,.5,'#55505e',0,3.1,0).box(3.8,.3,.6,'#3e3a46',0,6.3,0); for(let k=0;k<5;k++)sd.box(3.4,.05,.52,'#46424e',0,.7+k*1.1,0);
  VIS.sunDoor=sd.mesh(M.stone,'tpSunDoor'); VIS.sunDoor.position.set(0,-3,-50.75); tpRoot.add(VIS.sunDoor);
  const eg=new Builder(); for(let k=-3;k<=3;k++)eg.cyl(.04,.04,3.4,'#2c2830',0,1.7,k*.38,5); for(const y of [.4,1.6,2.8])eg.box(.08,.08,2.7,'#2c2830',0,y,0);
  VIS.exitGrate=eg.mesh(M.bronze,'tpExitGrate'); VIS.exitGrate.position.set(18.4,-16,-100); tpRoot.add(VIS.exitGrate);
  const sg=new Builder(); for(let k=-4;k<=4;k++)sg.cyl(.05,.05,3.4,'#2c2830',k*.36,1.7,0,5); for(const y of [.4,1.6,2.8])sg.box(3.1,.08,.08,'#2c2830',0,y,0);
  VIS.sanGrate=sg.mesh(M.bronze,'tpSanctumGrate'); VIS.sanGrate.position.set(0,-16,-82.9); tpRoot.add(VIS.sanGrate);
  const es=new Builder(); es.box(1.5,2.5,.3,'#6a6672',0,1.25,0); VIS.eyesSlab=es.mesh(M.stone,'tpEyesSlab'); VIS.eyesSlab.position.set(-6.2,-3,-10.55); tpRoot.add(VIS.eyesSlab);
}
function updateGateVis(snap,dt){
  if(!VIS.sunDoor)return; dt=dt||0;
  const d=(cur,tgt,k)=>snap?tgt:U.damp(cur,tgt,k,dt);
  VIS.sunDoor.position.y=d(VIS.sunDoor.position.y,S.gates.sunDoor?-9.4:-3,.9);
  VIS.exitGrate.position.y=d(VIS.exitGrate.position.y,S.gates.exit?-19.6:-16,1.3);
  VIS.sanGrate.position.y=d(VIS.sanGrate.position.y,S.gates.sanctum?-19.6:-16,2.4);
  VIS.eyesSlab.position.y=d(VIS.eyesSlab.position.y,S.gates.eyes?-5.6:-3,1.2);
}

/* ---------- roots through the stone, and ink in the joints near the seals (one merged mesh) ---------- */
function wallPoints(n,seed,test){ const r=U.rng(seed), out=[]; let tries=0;
  while(out.length<n&&tries<n*80){ tries++; const x=GX0+r()*(BOX.x1-BOX.x0), z=GZ0+r()*(BOX.z1-BOX.z0); const s=Sat(x,z); if(s<-.05||s>.25)continue;
    const e=.2, gx=Sat(x+e,z)-Sat(x-e,z), gz=Sat(x,z+e)-Sat(x,z-e), gl=Math.hypot(gx,gz)||1; const nx=-gx/gl, nz=-gz/gl;
    const p={x:x+nx*(s+.04),z:z+nz*(s+.04),nx,nz}; p.f=Fat(p.x+nx*.3,p.z+nz*.3); p.c=Cat(p.x+nx*.2,p.z+nz*.2); if(p.c-p.f<2)continue; if(test&&!test(p,r))continue; out.push(p); }
  return out; }
function buildRoots(){
  const B=new Builder();
  const rc=r=>jit(r()<.4?'#22182c':'#3a2c30',r,.3);
  for(const p of wallPoints(40,77,p=>roomAtL(p.x,p.z)!=='vestibule')){ const r=U.rng((p.x*13+p.z*7)|0);
    let x=p.x, y=p.c-.1-r()*.8, z=p.z; const pts=[V(x-p.nx*.1,y+.3,z-p.nz*.1)]; const tx=p.nz, tz=-p.nx; let side=(r()-.5)*.6;
    const len=2+r()*4.5; for(let k=0;k<6;k++){ side+=(r()-.5)*.5; y-=len/6; pts.push(V(x+tx*side+p.nx*(.05+r()*.08),y,z+tz*side+p.nz*(.05+r()*.08))); if(y<p.f+.3)break; }
    B.add(tube(pts,.04+r()*.05,14,5),rc(r)); }
  const m=B.mesh(propMats().root,'tpRoots'); if(m)tpRoot.add(m);
}

/* ---------- braziers: bronze bowls on tripods; flames (points) + glow; three pooled lights for lit rooms ---------- */
const pool=[]; let flamePts=null, glowPts=null;
function buildBraziers(){
  const Br=new Builder(), r=U.rng(77);
  const fpos=[], fa=[], gpos=[], ga=[];
  BRAZ.forEach((c,i)=>{ const p=c.l, f=p.y;
    Br.cyl(.48,.3,.34,jit('#7a5a30',r,.12),p.x,f+1.12,p.z,12).cyl(.5,.5,.06,jit('#5f8a74',r,.12),p.x,f+1.3,p.z,12).cyl(.4,.4,.05,'#1a1410',p.x,f+1.26,p.z,10);
    for(let k=0;k<3;k++){ const a=k/3*TAU+.4; Br.cyl(.035,.05,1.15,jit('#5a4630',r,.1),p.x+Math.cos(a)*.26,f+.55,p.z+Math.sin(a)*.26,5,0,Math.sin(a)*.32,-Math.cos(a)*.32); }
    Br.add(new THREE.TorusGeometry(.3,.03,5,12),jit('#5f8a74',r,.1),p.x,f+.42,p.z,0,PI/2);
    G.addCollider({x:O.x+p.x,z:O.z+p.z,r:.5,y0:O.y+f-1,y1:O.y+f+1.4});
    fpos.push(c.flame.x,c.flame.y,c.flame.z); fa.push(0); gpos.push(c.flame.x,c.flame.y+.15,c.flame.z); ga.push(0); c.idx=i; });
  const m=Br.mesh(propMats().bronze,'tpBraziers'); tpRoot.add(m);
  const mk=(pos,al,size,col,tex)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('alpha',new THREE.Float32BufferAttribute(al,1));
    const pm=new THREE.ShaderMaterial({uniforms:{uMap:{value:tex},uTime:tUni.uTime,uC:{value:C(col)}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`attribute float alpha;varying float vA;uniform float uTime;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vA=alpha*(.85+.15*sin(uTime*8.+position.x*7.)+.07*sin(uTime*21.+position.z));gl_PointSize=${size.toFixed(1)}*(.6+.4*alpha)/-mv.z;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:'uniform sampler2D uMap;uniform vec3 uC;varying float vA;void main(){vec4 t=texture2D(uMap,gl_PointCoord);gl_FragColor=vec4(uC*t.a*vA*1.6,1.);}'});
    const pts=new THREE.Points(g,pm); pts.frustumCulled=false; tpRoot.add(pts); return g; };
  flamePts=mk(fpos,fa,260,'#ffc070',G.tex.flame||G.tex.soft); glowPts=mk(gpos,ga,1500,'#ff8a40',G.tex.soft);
  for(let i=0;i<3;i++){ const L=new THREE.PointLight(0xffa860,0,20,1.6); L.position.set(0,-50,0); tpRoot.add(L); pool.push(L); }
  VIS.fill=new THREE.PointLight(0xd8c0ff,0,7,2); tpRoot.add(VIS.fill);
  VIS.under=new THREE.PointLight(0x8a5cff,0,22,1.6); tpRoot.add(VIS.under);   // the violet from below, near you, deeper down
}
function updateBraziers(dt){
  const t=G.time, P=G.player.pos, lx=P.x-O.x, lz=P.z-O.z, ly=P.y-O.y;
  if(flamePts){ const a=flamePts.attributes.alpha, g=glowPts.attributes.alpha;
    BRAZ.forEach((c,i)=>{ const lit=S.lit.has(c.room); a.array[i]=U.damp(a.array[i],lit?1:0,3,dt); g.array[i]=U.damp(g.array[i],lit?.5:0,2,dt); });
    a.needsUpdate=true; g.needsUpdate=true; }
  const cand=[]; for(const id of S.lit) for(const p of LIGHTS[id]) cand.push([Math.hypot(p.x-lx,p.z-lz),p]);
  cand.sort((a,b)=>a[0]-b[0]);
  for(let i=0;i<pool.length;i++){ const L=pool[i], c=cand[i]; if(c&&S.inside&&c[0]<45){ L.position.copy(c[1]); L.intensity=U.damp(L.intensity,2.0*(.9+.08*Math.sin(t*7+i*2)+.05*Math.sin(t*17+i)),4,dt); }
    else L.intensity=U.damp(L.intensity,0,4,dt); }
  if(VIS.fill){ VIS.fill.position.set(lx,ly+1.6,lz); const litR=S.room&&S.lit.has(S.room); VIS.fill.intensity=S.inside?(litR?.22:.42):0; }
  if(VIS.under){ VIS.under.position.set(lx,Fat(lx,lz)-.4,lz); VIS.under.intensity=S.inside?depthGlow(ly)*1.6:0; }
}
function brazierLabel(c){
  if(S.lit.has(c.room))return null;
  if(!S.freeUsed)return 'Light the brazier';
  const e=etherUnits(), n=vials();
  if(!n||e<BRAZ_COST)return 'Light the brazier · needs '+BRAZ_COST+' ether'+(n?' (you have '+e+')':' — no vials');
  return 'Light the brazier · '+BRAZ_COST+' ether';
}
const BRAZ_COST=5;
const etherUnits=()=>G.alchemy?G.alchemy.etherUnits|0:0, vials=()=>G.inv?G.inv.count('vial'):0;
function spendEther(units){
  const A=G.alchemy; if(!A||!G.inv)return false;
  const n=vials(); if(!n||A.etherUnits<units)return false;
  A.etherUnits-=units;
  const keep=A.etherUnits>0?Math.min(n,Math.ceil(A.etherUnits/BRAZ_COST)):0;
  if(keep<n)G.inv.take('vial',n-keep); else G.emit('inv:change',{id:'vial',n:0,total:n});
  return true;
}
/** light a brazier by id ('nave:1') or a whole room by id ('nave'); the room stays lit. o.restored */
function lightBrazier(id,o){ o=o||{};
  const c=BRAZ.find(q=>q.id===id), roomId=c?c.room:id;
  if(!ROOMDEF[roomId]||S.lit.has(roomId))return false;
  S.lit.add(roomId);
  if(!o.restored){ G.emit('temple:lit',{room:roomId,brazier:c?c.id:null}); if(G.ink&&G.ink.burst&&c)try{G.ink.burst(c.world,{n:0,embers:26,speed:2,color:'#ffb060'});}catch(_){} }
  return true;
}
function useBrazier(c){
  if(S.lit.has(c.room))return;
  if(!S.freeUsed){ S.freeUsed=true; lightBrazier(c.id);
    setTimeout(()=>G.ui.say('The old coals drink a breath of ether from your lantern and catch, low and red, then gold. The watchers’ faces come up out of the dark. The other braziers down here are cold — '+BRAZ_COST+' ether each, brewed at the alchemy table.'),500);
    return; }
  if(!spendEther(BRAZ_COST)){
    G.ui.say(vials()?'Not enough ether left in your vials. A brazier wants '+BRAZ_COST+' — brew more at the alchemy table.':'The coals are cold and grey. A vial of ether — '+BRAZ_COST+' units, brewed at the alchemy table — would light it, and the room with it.',{priority:'high',key:'tpBrazier'});
    G.emit('temple:brazierDry',{room:c.room}); return; }
  lightBrazier(c.id);
  G.ui.toast('The brazier catches','−'+BRAZ_COST+' ether · '+ROOMDEF[c.room].name+' is lit');
}
function roostPoints(id){
  if(id==='well'){ const r=U.rng(9090), out=[];
    for(let k=0;k<44;k++){ const a=(60+r()*90)*PI/180, y=-1.6+r()*4.2, rr=WC.r-.08; out.push({p:W(Math.cos(a)*rr,y,WC.z+Math.sin(a)*rr),n:V(-Math.cos(a),0,-Math.sin(a))}); }
    return out; }
  const R=ROOMDEF[id]; if(!R)return [];
  const b=R.b[0], r=U.rng(id.length*31+7), out=[];
  for(let t=0;t<2000&&out.length<40;t++){ const x=lerp(b[0],b[1],r()), z=lerp(b[2],b[3],r()); if(Sat(x,z)>-.4||Sat(x,z)<-2.4)continue; if(roomAtL(x,z)!==id)continue;
    const c=Cat(x,z); const e=.2, gx=Sat(x+e,z)-Sat(x-e,z), gz=Sat(x,z+e)-Sat(x,z-e), gl=Math.hypot(gx,gz)||1;
    out.push({p:toWorld(x,c-.06,z),n:V(-gx/gl*.3,-1,-gz/gl*.3).normalize()}); }
  return out; }

/* ---------- the drowned garth: black water with violet under it ---------- */
function buildWater(){
  const m=new THREE.ShaderMaterial({uniforms:{uTime:tUni.uTime},transparent:true,depthWrite:false,
    vertexShader:'varying vec3 vP;void main(){vP=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vP,1.);}',
    fragmentShader:`uniform float uTime;varying vec3 vP;
      float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}
      void main(){ vec2 q=vP.xz*.6+vec2(uTime*.05,-uTime*.04); float w=vn(q)+.5*vn(q*2.3+3.)+.25*vn(q*5.1-uTime*.2);
        vec3 c=mix(vec3(.006,.004,.012),vec3(.03,.02,.06),w*.5); c+=vec3(.35,.15,.8)*smoothstep(1.25,1.6,w)*.35; c+=vec3(.25,.1,.55)*pow(vn(vP.xz*.15+uTime*.02),3.)*.25;
        gl_FragColor=vec4(c,.93); }`});
  const g=new THREE.PlaneGeometry(CL.x1-CL.x0-CL.walk+.2,CL.z1-CL.z0-CL.walk+.2); const w=new THREE.Mesh(g,m); w.rotation.x=-PI/2;
  w.position.set((CL.x0+CL.walk+CL.x1)/2,ANCH.cloister.water,(CL.z0+CL.z1-CL.walk)/2); w.renderOrder=2; w.name='tpWater'; tpRoot.add(w);
}

/* ---------- pages and inscriptions ---------- */
let pageMat=null;
function paperTex(){ return G.canvasTex(128,(g,s)=>{ g.fillStyle='#e6dabf'; g.fillRect(0,0,s,s); g.strokeStyle='rgba(60,40,50,.55)'; g.lineWidth=1.1;
  for(let y=16;y<s-10;y+=9){ g.beginPath(); g.moveTo(10,y); g.lineTo(10+(s-20)*(.55+.45*Math.abs(Math.sin(y*1.3))),y); g.stroke(); }
  g.fillStyle='rgba(90,60,120,.25)'; g.beginPath(); g.arc(s*.8,s*.82,9,0,TAU); g.fill(); }); }
const PG={};
function buildPages(){
  if(!pageMat)pageMat=new THREE.MeshBasicMaterial({map:paperTex(),side:THREE.DoubleSide,transparent:true});
  for(const p of PAGES){
    const g=new THREE.Group(); g.position.copy(p.pos).sub(O);
    if(p.kind==='page'){ const pg=new THREE.Mesh(new THREE.PlaneGeometry(.3,.4),pageMat); pg.rotation.x=-PI/2+.12; pg.rotation.z=.4; pg.position.y=.03; g.add(pg);
      const gl=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:C('#ffd9a0'),transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending})); gl.scale.setScalar(1.1); gl.position.y=.25; g.add(gl); PG[p.id]={g,gl}; }
    else PG[p.id]={g,gl:null};
    tpRoot.add(g);
    const stand=p.kind==='inscription'&&p.id==='i1'?W(0,stairF(0,11.0),11.0):p.pos.clone();
    if(p.kind==='page')stand.y=(zoneFloor(p.pos.x-O.x,p.pos.z-O.z,p.pos.y-O.y+.5)??(p.pos.y-O.y))+O.y;
    G.interact.add({pos:()=>stand,radius:p.kind==='inscription'?2.0:1.7,priority:2,
      label:()=>p.kind==='inscription'?(S.pages[p.id]?'Read the carving again':'Read the carving'):(S.pages[p.id]?'Read Hesper’s page again':'Read the page'),
      enabled:()=>S.inside&&G.state.mode==='play'&&!glassUp()&&(!p.secret||S.gates.eyes), use:()=>readPage(p.id)});
  }
}
function pageTextFor(id){
  try{ if(typeof API.pageText==='function'){ const t=API.pageText(id); if(t)return t; } }catch(e){ console.error('temple pageText',e); }
  const TP=G.templePeople; if(TP&&TP.pages&&TP.pages[id])return TP.pages[id];
  return PAGE_FALLBACK[id]||null;
}
function readPage(id){
  const d=pageTextFor(id); if(!d)return false;
  const first=!S.pages[id]; S.pages[id]=1;
  const who=d.author||'Hesper', lines=(Array.isArray(d.text)?d.text:[d.text]).map(t=>({text:t,who}));
  let shown=false;
  try{ if(G.talk&&G.talk.moment)shown=!!G.talk.moment({who:'page',name:who,title:d.title||'',portrait:d.portrait||'page',key:'tpPage',lines}); }catch(e){ console.error('temple page card',e); }
  if(!shown)lines.forEach((l,i)=>G.ui.say(l.text,who,{priority:i?'normal':'high',key:'tpPage'+i}));
  G.emit('temple:page',{id,first,author:who});
  if(first&&id[0]==='p'){ const n=Object.keys(S.pages).filter(k=>k[0]==='p').length; G.ui.toast('Hesper’s pages',n+' of '+PAGES.filter(p=>p.kind==='page').length+' found'); }
  return true;
}
function updatePages(){
  for(const p of PAGES){ const o=PG[p.id]; if(!o)continue; o.g.visible=!p.secret||S.gates.eyes; if(o.gl)o.gl.material.opacity=S.pages[p.id]?.08:.3+.08*Math.sin(G.time*1.7+p.pos.x); }
}

/* ---------- the door in the wood: the ink roots that choke it (eaten by the swarm), and the way in ---------- */
let doorSite=null;
function buildIslandDoor(){
  isleRoot.position.copy(rootsPos); isleRoot.rotation.y=doorYaw;
  const rootM=G.negMaterial?G.negMaterial({rim:'#a37cff',strength:1.1,ink:'#1c0c2c',inkStrength:.5,amp:.05,wisp:.25,flow:.2,scale:1.4,opaque:true}):G.toon('#1a1020',{emissive:'#2a1240',emissiveIntensity:.35});
  const RB=new Builder(), r=U.rng(5150); const anchors=[];
  for(let k=0;k<16;k++){ const pts=[]; const side=k%2?1:-1; let x=side*(1.1+r()*.4), y=r()*3.2, z=(r()-.5)*.3;
    pts.push(V(x,y,z-.2)); for(let q=0;q<5;q++){ x+=(-side)*(.35+r()*.25); y+=(r()-.5)*.9; z+=(r()-.5)*.25; pts.push(V(x,clamp(y,.05,3.3),z)); }
    RB.add(tube(pts,.06+r()*.07,16,5),'#ffffff'); pts.forEach((p,i)=>{ if(i%2)anchors.push(p.clone()); }); }
  for(let k=0;k<6;k++){ const a=r()*TAU; const pts=[V(Math.cos(a)*2.4,-.05,Math.sin(a)*1.2-.6)]; for(let q=0;q<3;q++)pts.push(V(pts[pts.length-1].x*.5+(r()-.5)*.4,.15+q*.4,(r()-.5)*.3)); RB.add(tube(pts,.08,10,5),'#ffffff'); }
  VIS.doorRoots=RB.mesh(rootM,'tpDoorRoots'); isleRoot.add(VIS.doorRoots); VIS.rootMat=rootM;
  // the black beyond the door, and a faint violet breath from under it once open
  const hole=new THREE.Mesh(new THREE.PlaneGeometry(2.3,3.4),propMats().dark); hole.position.set(0,1.7,.55); hole.rotation.y=PI; isleRoot.add(hole); VIS.doorHole=hole;
  VIS.doorGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:C('#8a5cff'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
  VIS.doorGlow.scale.set(4,3,1); VIS.doorGlow.position.set(0,1.2,-.2); isleRoot.add(VIS.doorGlow);
  // the roots are a blight-like site: a baited swarm (or the jar) near them eats them
  const wa=anchors.map(a=>a.clone().applyAxisAngle(V(0,1,0),doorYaw).add(rootsPos));
  doorSite={id:'vigilDoor',name:'The ink roots on the Vigil door',pos:rootsPos.clone().add(V(0,.4,0)),radius:3.2,needs:14,feedTime:9,stallBelow:5,yRange:5,anchors:wa,
    enabled:()=>S.unlocked&&!S.open&&G.state.mode==='play',
    onFeed(){ G.emit('temple:door',{state:'feed'}); if(!S.said.doorFeed){ S.said.doorFeed=1; G.ui.say('The moths settle on the roots and begin to eat. The black shrinks back from the stone with a sound like a breath let out.'); } },
    onStall(){ G.emit('temple:door',{state:'stall'}); }, onStop(){ G.emit('temple:door',{state:'stop'}); },
    onDone(){ openDoor(false); }};
  if(G.moths&&G.moths.addSite)G.moths.addSite(doorSite);
  if(VIS.doorRoots)VIS.doorRoots.visible=!S.open;
  isleRoot.add(new THREE.Object3D());
}
function updateIslandDoor(dt){
  if(!VIS.doorRoots)return;
  const P=G.player, near=P&&P.pos&&P.pos.distanceTo(doorPos)<22;
  if(VIS.rootBoil!=null){ VIS.rootBoil+=dt; const k=Math.min(1,VIS.rootBoil/2.4);
    if(VIS.rootMat.uniforms&&VIS.rootMat.uniforms.uFade)VIS.rootMat.uniforms.uFade.value=1-k; else VIS.doorRoots.scale.setScalar(Math.max(.01,1-k));
    if(k>=1){ VIS.rootBoil=null; VIS.doorRoots.visible=false; } }
  else if(doorSite&&!S.open){ const s=1-.35*doorSite.progress; VIS.doorRoots.scale.set(s,1-.2*doorSite.progress,s);
    if(VIS.rootMat.uniforms&&VIS.rootMat.uniforms.uFlash)VIS.rootMat.uniforms.uFlash.value=doorSite.feeding?.12+.1*Math.sin(G.time*9):0; }
  if(VIS.doorGlow)VIS.doorGlow.material.opacity=S.open?.25+.08*Math.sin(G.time*1.3):.05;
  // first sight of the door, once you know of it
  if(near&&!S.said.doorSeen&&P.pos.distanceTo(doorPos)<12){ S.said.doorSeen=1;
    G.ui.say(S.unlocked&&!S.open?'A stone door at the bottom of the hollow, choked with roots of ink — not the tree’s roots. They breathe. The moths would eat them, if there were enough.':
      S.open?'The door in the hollow stands open. Cold air comes up out of the dark, smelling of stone and something like candle-smoke.':
      'A stone door at the bottom of the hollow, under a lintel carved with moths. Roots of black ink hold it shut, wet and breathing.',{priority:'normal',key:'tpDoor'}); }
}

/* ================================================================ 8. LIGHTING (inside) */
const FOG0=C('#040307'), FOG1=C('#141020'), HEMI_SKY=C('#5e5870'), HEMI_GND=C('#18141e'), HEMI_LIT=C('#b89078');

/* ================================================================ 9. TRANSITIONS */
const fadeEl=()=>document.getElementById('fade');
function startTrans(dir,roomId,o){
  o=o||{}; if(S.trans)return false;
  if(o.instant){ doTeleport(dir,roomId); return true; }
  S.trans={dir,room:roomId,t:0,done:false};
  const f=fadeEl(); if(f)f.style.opacity='1';
  if(G.player.setControl)G.player.setControl(false);
  G.emit(dir==='in'?'temple:entering':'temple:leaving',{room:roomId});
  if(G.glass&&G.glass.raise)try{ G.glass.raise(false); }catch(_){}
  return true;
}
function updateTrans(dt){
  const T=S.trans; if(!T)return; T.t+=dt;
  if(!T.done&&T.t>=.9){ T.done=true; doTeleport(T.dir,T.room); const f=fadeEl(); if(f)f.style.opacity='0'; }
  if(T.t>=1.35){ if(G.player.setControl)G.player.setControl(true); S.trans=null; }
}
function arrivalFor(roomId){ const s=(ROOMDEF[roomId]||ROOMDEF.vestibule).spawn; const f=zoneFloor(s[0],s[2],s[1]+.5); return [s[0],f==null?s[1]:f,s[2],s[3]]; }
const outsideSpot=()=>{ const p=doorPos.clone().addScaledVector(doorFwd,-2.2); return [p.x,G.world.height(p.x,p.z),p.z,doorYaw+PI]; };
function shiftSwarm(delta,to,from){
  const P=from||G.player.pos, ms=(G.creatures&&G.creatures.moths)||[];
  for(const m of ms){ if(!m||!m.p||!SWARM.has(m.tgt))continue; if(m.p.distanceTo(P)>45)continue;
    m.p.add(delta); if(m.feedC&&m.feedC.isVector3&&m.feedC.distanceTo(P)<45)m.feedC.add(delta); }
  for(const fn of transferHooks){ try{fn(delta,{to});}catch(e){console.error('temple transfer',e);} }
}
function doTeleport(dir,roomId){
  const P=G.player, from=P.pos.clone();
  if(dir==='in'){ // only one interior at a time: leave the cave or the Undercroft first
    if(G.cave&&G.cave.inside&&G.cave.exit){ const CS=G.cave._debug&&G.cave._debug.S; if(CS)CS.trans=null; G.cave.exit({instant:true}); }
    if(G.undercroft&&G.undercroft.inside&&G.undercroft.exit){ const US=G.undercroft._debug&&G.undercroft._debug.S; if(US)US.trans=null; G.undercroft.exit({instant:true}); } }
  let dest, yaw;
  if(dir==='in'){ const a=arrivalFor(roomId||'vestibule'); dest=toWorld(a[0],a[1],a[2]); yaw=a[3];
    if(!S.prevCp&&!inBoxW(G.state.checkpoint.x,G.state.checkpoint.z)){ S.prevCp={p:G.state.checkpoint.clone(),yaw:G.state.checkpointYaw,name:G.state.checkpointName}; }
    const sa=arrivalFor('vestibule'); G.state.checkpoint.copy(toWorld(sa[0],sa[1],sa[2])); G.state.checkpointYaw=sa[3]; G.state.checkpointName='the stair of watchers';
  }else{ const o=outsideSpot(); dest=V(o[0],o[1],o[2]); yaw=o[3];
    if(S.prevCp){ G.state.checkpoint.copy(S.prevCp.p); G.state.checkpointYaw=S.prevCp.yaw; G.state.checkpointName=S.prevCp.name; S.prevCp=null; }
    else if(inBoxW(G.state.checkpoint.x,G.state.checkpoint.z)){ G.state.checkpoint.copy(dest); G.state.checkpointYaw=yaw; G.state.checkpointName='the hollow in the old wood'; } }
  P.teleport(dest.x,dest.y,dest.z,yaw);
  if(P.aimCamera)P.aimCamera(yaw,.3);
  const delta=P.pos.clone().sub(from);
  shiftSwarm(delta,dir==='in'?'temple':'island',from);
  setInside(dir==='in');
  G.atmo.dark=G.atmo.darkTarget=dir==='in'?1:0;
  S.lastPresent.copy(P.pos);
  if(dir==='in'){ const r=roomId||'vestibule'; if(r!=='vestibule'&&ROOMDEF[r]&&CP_SPOTS.some(c=>c[0]===r))S.reached.add(r); }
}

/* ---------- checkpoints: the deepest rise spot you've stood in that has an open way back to the stair ---------- */
const CP_SPOTS=[ // [region, local x,y,z, yaw, name] in depth order
  ['nave',0,-3,-12.6,PI,'the hall of mirrors'],['reliquary',-16.2,-4,-40,-PI/2,'the reliquary door'],
  ['cloister',15.6,-6,-41.6,PI,'the drowned cloister'],['well',0,-4,-60.6,PI,'the rim of the moth well'],
  ['wellDeep',0,-14,-76.2,PI,'the foot of the moth well']];
/** region: the room, except the well below its upper seal is its own ('wellDeep'), and the winch room is the cloister's */
function regionAt(x,z,y){ const r=roomAtL(x,z); if(r==='well'&&y!=null&&y<UPPER_Y-.9&&Math.hypot(x-WC.x,z-WC.z)<WC.r+3)return 'wellDeep'; return r; }
function connected(){
  const L=[['vestibule','nave',true],['nave','reliquary',true],['nave','cloister',S.gates.cloisterDoor],['nave','well',S.gates.sunDoor],
    ['well','wellDeep',S.gates.wellUpper],['wellDeep','sanctum',S.gates.wellLower],['sanctum','vestibule',S.gates.exit]];
  const out=new Set(['vestibule']); let grew=true;
  while(grew){ grew=false; for(const [a,b,o] of L){ if(!o)continue; if(out.has(a)&&!out.has(b)){out.add(b);grew=true;} else if(out.has(b)&&!out.has(a)){out.add(a);grew=true;} } }
  return out; }
function setCheckpointL(x,y,z,yaw,name){ const c=G.state.checkpoint, w=toWorld(x,y,z);
  if(c.distanceToSquared(w)>1e-4)c.copy(w); G.state.checkpointYaw=yaw; G.state.checkpointName=name; }
function bestCheckpoint(conn){ conn=conn||connected();
  for(let i=CP_SPOTS.length-1;i>=0;i--){ const c=CP_SPOTS[i]; if(!S.reached.has(c[0])||!conn.has(c[0]))continue;
    const f=zoneFloor(c[1],c[3],c[2]+1); return [c[1],f==null?c[2]:f,c[3],c[4],c[5]]; }
  const a=arrivalFor('vestibule'); return [a[0],a[1],a[2],a[3],'the stair of watchers']; }
function trackFooting(dt,conn){
  const P=G.player; if(!P.alive||P.grounded===false||G.state.mode!=='play'){ S.footT=0; return; }
  const lx=P.pos.x-O.x, ly=P.pos.y-O.y, lz=P.pos.z-O.z, f=zoneFloor(lx,lz,ly+.3);
  if(f==null||Math.abs(ly-f)>.3||!presentAt(lx,lz)){ S.footT=0; return; }
  const reg=regionAt(lx,lz,ly); if(!reg||!conn.has(reg)){ S.footT=0; return; }
  if(reg!==S.footReg){ S.footReg=reg; S.footT=0; } S.footT+=dt;
  if(S.footT>.6&&!S.reached.has(reg)&&CP_SPOTS.some(c=>c[0]===reg)){ S.reached.add(reg); G.emit('temple:reached',{region:reg}); }
}
let cpT=0;
function updateCheckpoint(dt){
  cpT-=dt; if(cpT>0)return; const step=.2-cpT; cpT=.2;
  if(S.cpHold)return;                               // the Boss agent can hold the checkpoint (a fight's own respawn)
  const conn=connected(); trackFooting(step,conn);
  const b=bestCheckpoint(conn); setCheckpointL(b[0],b[1],b[2],b[3],b[4]);
  const P=G.player, reg=regionAt(P.pos.x-O.x,P.pos.z-O.z,P.pos.y-O.y);
  S.stranded=!!reg&&!conn.has(reg)&&!(reg==='sanctum'&&S.gates.wellLower);
  if(S.stranded&&!S.said.draught){ S.said.draught=1; G.ui.say('A cold draught slips past you toward the stair, through cracks in the stone too narrow for you. You could follow it back.',{priority:'high'}); }
}
API.holdCheckpoint=on=>{ S.cpHold=!!on; };
function followDraught(){
  if(!S.inside||S.trans)return false;
  G.emit('temple:draught',{from:regionAt(G.player.pos.x-O.x,G.player.pos.z-O.z,G.player.pos.y-O.y)});
  return startTrans('in','vestibule');
}

/* ---------- the past layer: lowered mid-way across the cloister, you're eased back to the present walk; the water gives you back ---------- */
function updatePast(dt){
  const P=G.player; if(!P||!P.alive||S.trans)return;
  const lx=P.pos.x-O.x, lz=P.pos.z-O.z, ly=P.pos.y-O.y;
  const pf=zoneFloor(lx,lz,ly+.3,'monster');
  const onPresent=presentAt(lx,lz)&&Sfield(lx,lz,'monster')<-.25&&pf!=null&&Math.abs(ly-pf)<.4;
  if(S.push){ const Pu=S.push; Pu.t+=dt; const k=smooth(0,1,Pu.t/Pu.dur);
    P.pos.x=lerp(Pu.from.x,Pu.to.x,k); P.pos.z=lerp(Pu.from.z,Pu.to.z,k); P.pos.y=lerp(Pu.from.y,Pu.to.y,k)+Math.sin(k*PI)*.6;
    if(Pu.t>=Pu.dur){ S.push=null; if(P.setControl)P.setControl(true); P.teleport(Pu.to.x,Pu.to.y,Pu.to.z,P.heading); } return; }
  if(onPresent&&P.grounded!==false){ S.lastPresent.copy(P.pos); return; }
  const inWater=zonesAt(lx,lz).some(Z=>Z.water)&&ly<-7.2&&!zonesAt(lx,lz).some(Z=>Z.past&&glassUp());
  if(glassUp()&&!inWater)return;
  const inPast=zonesAt(lx,lz).some(Z=>Z.past)&&!(presentAt(lx,lz)&&pf!=null&&ly<pf+.45&&!zonesAt(lx,lz).some(Z=>Z.water));
  if(!inPast&&!inWater)return;
  const to=S.lastPresent.clone(); if(to.distanceTo(P.pos)>30||!inBoxW(to.x,to.z)){ const c=bestCheckpoint(); to.copy(toWorld(c[0],c[1],c[2])); }
  S.push={t:0,dur:inWater?1.1:.75,from:P.pos.clone(),to}; if(P.setControl)P.setControl(false);
  G.emit('temple:pastPush',{from:S.push.from.clone(),to:to.clone(),water:inWater});
  if(!S.said.push){ S.said.push=1; G.ui.say('The old walk goes thin as breath under your feet, and the present lifts you back to the stone that is really there.',{priority:'normal'}); }
}

/* ================================================================ 10. INSIDE / OUTSIDE */
const KEEP_NAMES=new Set(['world','lighthouse','alchemy']);
function hideIsland(on){
  if(on){ S.hidden.length=0;
    for(const ch of G.scene.children){ if(!KEEP_NAMES.has(ch.name))continue;
      const walk=o=>{ let hasLight=false; o.traverse(c=>{ if(c.isLight)hasLight=true; });
        if(!hasLight){ if(o.visible){o.visible=false;S.hidden.push(o);} return; }
        for(const c of o.children) if(!c.isLight)walk(c); };
      walk(ch); }
    S.farPrev=G.camera.far; G.camera.far=150; G.camera.updateProjectionMatrix();
  }else{ for(const o of S.hidden)o.visible=true; S.hidden.length=0; G.camera.far=S.farPrev||1200; G.camera.updateProjectionMatrix(); }
}
function setInside(v){
  if(v===S.inside)return;
  S.inside=v; API.inside=v; G.interior=v?INTERIOR:(G.interior===INTERIOR?null:G.interior);
  tpRoot.visible=v; isleRoot.visible=!v; hideIsland(v);
  if(G.renderer&&G.renderer.shadowMap){ G.renderer.shadowMap.autoUpdate=!v; if(!v)G.renderer.shadowMap.needsUpdate=true; }
  if(v){ S.room=room(G.player.pos)||'vestibule'; setRoost(true); if(!S.unlocked)unlock({quiet:true}); G.emit('temple:enter',{room:S.room}); }
  else{ S.room=null; S.push=null; setRoost(false); G.emit('temple:exit',{}); }
}
let roostPrev=null;
function setRoost(on){ const Cr=G.creatures; if(!Cr||!Cr.setRoost||!Cr.roost)return;
  try{ if(on){ roostPrev=Cr.roost.pts.slice(); Cr.setRoost(roostPoints('well')); } else if(roostPrev){ Cr.setRoost(roostPrev); roostPrev=null; } }catch(e){ console.error('temple roost',e); } }

/* ---------- unlocking (Wren saved) and opening the door (the roots eaten) ---------- */
function unlock(o){ o=o||{};
  if(S.unlocked)return false; S.unlocked=true;
  G.emit('temple:unlock',{quiet:!!o.quiet,restored:!!o.restored,pos:doorPos.clone()});
  return true; }
function openDoor(restored){
  if(S.open)return; S.open=true; if(!S.unlocked)unlock({quiet:true,restored});
  if(doorSite){ doorSite.cured=true; doorSite.feeding=false; doorSite.progress=1; }
  if(restored){ if(VIS.doorRoots)VIS.doorRoots.visible=false; }
  else{ VIS.rootBoil=0;
    if(G.ink&&G.ink.burst)try{ G.ink.burst(rootsPos.clone().add(V(0,1.4,0)),{n:90,speed:4,size:[.8,2.4],life:[1,2],up:2,embers:50,drops:10}); }catch(_){}
    if(G.ui.shake)G.ui.shake(.3);
    G.ui.toast('The Vigil door','The roots are eaten · the way down is open');
    setTimeout(()=>G.ui.say('The last of the roots comes apart into the moths, and the stone door grinds inward a hand’s width on its own. Cold air comes up from below, and under it, very faint, something violet.',{priority:'high'}),900); }
  G.emit('temple:open',{restored:!!restored,pos:doorPos.clone()});
}
G.on('undercroft:saved',e=>{ if(e&&e.who==='wren')unlock(); });

/* ---------- the lantern shutter down here: player.js only offers it before the cure, the cave inside the cave. The Vigilants hunt
   by light and the Answer is only solid in the dark, so the cured lantern gets its shutter back inside the Vigil. ---------- */
let shutEvT=-1;
G.on('lantern:shutter',()=>{ shutEvT=G.time; });
function updateShutter(){
  const L=G.items&&G.items.lantern, P=G.player; if(!L||!L.carried||!L.cured||!P||P.alive===false||G.state.mode!=='play')return;
  // one prompt for the shutter action: with the Lens, the tap and the hold share it (lens.js stays quiet in here)
  const lens=G.lens&&G.lens.owned;
  if(!(G.lens&&G.lens.focused))G.hint(G.input.device==='gamepad'?'RB':'F',L.shut?'Open the shutter':lens?'Close the shutter · hold: focus the Lens':'Close the shutter');
  if(G.input.pressed('shutter')&&shutEvT!==G.time){ L.shut=!L.shut; G.emit('lantern:shutter',{shut:L.shut,temple:true}); shutEvT=G.time;
    if(L.shut&&!S.said.shut){ S.said.shut=1; G.ui.say('You close the shutter. The dark of the Vigil comes down at once, close and old, and the violet under the floor seems brighter for it.',{priority:'normal'}); } }
}
API.updateShutter=updateShutter;

/* ================================================================ 11. PERSISTENCE */
if(G.persist&&G.persist.register) G.persist.register('temple',{
  save:()=>{ const o={v:1,unlocked:S.unlocked,open:S.open,lit:[...S.lit],reached:[...S.reached],gates:Object.assign({},S.gates),freeUsed:S.freeUsed,
      pages:Object.keys(S.pages),said:Object.keys(S.said).filter(k=>/^door/.test(k)),
      prevCp:S.prevCp?{p:[+S.prevCp.p.x.toFixed(2),+S.prevCp.p.y.toFixed(2),+S.prevCp.p.z.toFixed(2)],yaw:S.prevCp.yaw||0,name:S.prevCp.name||''}:null, puz:{}};
    for(const h of puzzleHooks){ try{ o.puz[h.id]=h.save(); }catch(e){ console.error('temple puzzle save',e); } }
    return o; },
  load:(d)=>{ if(!d)return;
    if(d.unlocked)unlock({quiet:true,restored:true});
    if(d.open)openDoor(true);
    S.lit=new Set((d.lit||[]).filter(id=>ROOMDEF[id]));
    S.reached=new Set((d.reached||[]).filter(r=>CP_SPOTS.some(c=>c[0]===r)));
    for(const k in GATEBOX)setGate(k,d.gates&&k in d.gates?d.gates[k]:!!GATE_DEFAULT[k]);
    S.freeUsed=!!d.freeUsed; S.pages={}; (d.pages||[]).forEach(id=>{S.pages[id]=1;}); (d.said||[]).forEach(k=>{S.said[k]=1;});
    S.prevCp=d.prevCp&&d.prevCp.p?{p:V(d.prevCp.p[0],d.prevCp.p[1],d.prevCp.p[2]),yaw:d.prevCp.yaw||0,name:d.prevCp.name||''}:null;
    for(const h of puzzleHooks){ try{ h.load(d.puz&&d.puz[h.id]); }catch(e){ console.error('temple puzzle load',e); } } }
});
for(const k in GATEBOX)setGate(k,!!GATE_DEFAULT[k]);
G.on('temple:bossDead',()=>{ setGate('exit',true); setGate('sanctum',true); });

/* ================================================================ 12. SYSTEMS */
G.system('temple',{order:14,modes:'always',
  init(){
    const tb=performance.now();
    G.scene.add(tpRoot,isleRoot);
    try{ buildShell(); }catch(e){ console.error('temple shell',e); }
    try{ buildProps(); buildGates(); }catch(e){ console.error('temple props',e); }
    try{ buildRoots(); buildBraziers(); buildWater(); buildDecals(); buildSeam(); buildPages(); }catch(e){ console.error('temple dressing',e); }
    try{ buildIslandDoor(); }catch(e){ console.error('temple door',e); }
    G.interact.add({pos:()=>doorPos,radius:2.6,priority:4,label:'Go down into the Vigil',
      enabled:()=>S.open&&!S.inside&&!S.trans&&G.player.alive!==false&&VIS.rootBoil==null, use:()=>startTrans('in','vestibule')});
    G.interact.add({pos:()=>ANCH.vestibule.exit,radius:2.2,priority:4,label:'Climb out to the old wood',
      enabled:()=>S.inside&&!S.trans, use:()=>startTrans('out')});
    G.interact.add({pos:()=>ANCH.sanctum.exit,radius:2.2,priority:4,label:'Climb the stair to the Stair of Watchers',
      enabled:()=>S.inside&&!S.trans&&S.gates.exit, use:()=>startTrans('in','vestibule')});
    G.interact.add({pos:()=>G.player.pos,radius:4,priority:0,label:'Follow the draught back to the stair',
      enabled:()=>S.inside&&!S.trans&&S.stranded&&G.player.alive!==false&&G.state.mode==='play'&&!(G.templeBoss&&G.templeBoss.fighting), use:()=>followDraught()});
    for(const c of BRAZ){ G.interact.add({pos:c.stand,radius:1.9,priority:3,
      label:()=>brazierLabel(c)||'', enabled:()=>S.inside&&!S.lit.has(c.room)&&!glassUp(), use:()=>useBrazier(c)}); }
    try{ buildPast(); }catch(e){ console.error('temple past',e); }
    API.stats.buildMs=Math.round(performance.now()-tb);
    if(G.debug)console.log('[temple] built',JSON.stringify(API.stats));
  },
  update(dt){
    const mode=G.state.mode, P=G.player;
    tUni.uTime.value=G.time; tUni.uSeam.value=U.damp(tUni.uSeam.value,S.seam,2,dt);
    if(!S.unlocked&&wrenSaved())unlock({quiet:true,restored:true});
    updateTrans(dt);
    if(P&&P.pos&&!S.trans){ const inT=!!room(P.pos)||(inBoxW(P.pos.x,P.pos.z)&&P.pos.y>O.y-40); if(inT!==S.inside)setInside(inT); }
    if(!S.inside){ const P_=G.player; if(P_&&P_.pos&&(VIS.rootBoil!=null||Math.abs(P_.pos.x-doorPos.x)<40&&Math.abs(P_.pos.z-doorPos.z)<40))updateIslandDoor(dt); return; }
    const r=room(P.pos)||S.room; if(r&&r!==S.room){ S.room=r; G.emit('temple:room',{id:r}); }
    if(!S.trans)updateCheckpoint(dt);
    const lit=S.room&&S.lit.has(S.room);
    if(mode!=='title')G.atmo.darkTarget=lit?.55:1;
    G.lights.sun.intensity=0;
    { const k=clamp((1-G.atmo.dark)/.45,0,1), fog=G.scene.fog;
      if(fog){ fog.color.copy(FOG0).lerp(FOG1,k); if(G.scene.background&&G.scene.background.isColor)G.scene.background.copy(fog.color); }
      G.lights.hemi.color.lerp(HEMI_SKY,.75); G.lights.hemi.groundColor.lerp(HEMI_GND,.75); if(lit)G.lights.hemi.color.lerp(HEMI_LIT,.35); }
    updateBraziers(dt); updateGateVis(false,dt); updatePages();
    if(VIS.seamLight){ VIS.seamLight.intensity=tUni.uSeam.value*(2.2+.6*Math.sin(G.time*2.3)); VIS.seamGlow.material.opacity=.55*tUni.uSeam.value; }
    if(VIS.pastRubble){ const k=G.glass?G.glass.k:0; VIS.pastRubbleMat.opacity=1-k*.9; VIS.pastRubble.visible=k<.98; }
    if(mode==='play'){ updatePast(dt); updateShutter(); }
  }
});
G.system('templeLate',{order:21,modes:['play','dead'],update(){ // after player.js: heads under the vaults
  if(!S.inside)return; const P=G.player; const lx=P.pos.x-O.x, lz=P.pos.z-O.z, c=Cat(lx,lz), f=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.05)-O.y;
  if(P.pos.y-O.y>c-1.7&&P.pos.y-O.y>f+.02)P.pos.y=O.y+Math.max(f,c-1.7); }});

/* ---------- past-layer content (G.glass.addPast): the cloister's walks as they were, the full arcade; echoes of the old vigil ---------- */
function buildPast(){
  const Gl=G.glass;
  if(!Gl||!Gl.addPast)return;
  const mat=Gl.memoryMaterial?Gl.memoryMaterial('#c9b8ff',{base:.42}):new THREE.MeshBasicMaterial({color:C('#c9b8ff'),transparent:true,opacity:.4});
  const B=new Builder(), r=U.rng(1919);
  // the walks: flagstones laid edge to edge, a kerb on the garth side
  for(const Z of ZONES){ if(!Z.past)continue; const [x0,x1,z0,z1]=Z.bb;
    for(let x=x0;x<x1-.01;x+=1.0)for(let z=z0;z<z1-.01;z+=1.0){ const w=Math.min(1,x1-x)-.06, d=Math.min(1,z1-z)-.06; B.box(w,.3,d,'#ffffff',x+w/2+.03,-6.15,z+d/2+.03,0,(r()-.5)*.02,(r()-.5)*.02); } }
  B.box(CL.x1-CL.x0-CL.walk,.5,.3,'#ffffff',(CL.x0+CL.walk+CL.x1)/2,-5.9,CL.z0+CL.walk-.15).box(.3,.5,CL.z1-CL.z0-CL.walk-(CL.z1-(-43.0))+.2,'#ffffff',CL.x1-CL.walk+.15,-5.9,(CL.z0+CL.walk+(-43.0))/2);
  // the arcade along them, whole: columns and the arches over
  const col=()=>'#ffffff';
  for(let k=0;k<=6;k++){ const x=CL.x0+CL.walk+k*(CL.x1-CL.walk-(CL.x0+CL.walk))/6; B.cyl(.22,.26,3.6,'#ffffff',x,-4.2,CL.z0+CL.walk,8).box(.6,.3,.6,'#ffffff',x,-2.25,CL.z0+CL.walk); }
  for(let k=0;k<=4;k++){ const z=CL.z0+CL.walk+k*((CL.z1-CL.walk)-(CL.z0+CL.walk))/4; B.cyl(.22,.26,3.6,'#ffffff',CL.x1-CL.walk,-4.2,z,8).box(.6,.3,.6,'#ffffff',CL.x1-CL.walk,-2.25,z); }
  B.box(CL.x1-CL.x0-CL.walk,.6,.5,'#ffffff',(CL.x0+CL.walk+CL.x1)/2,-.8,CL.z0+CL.walk).box(.5,.6,CL.z1-CL.z0-CL.walk,'#ffffff',CL.x1-CL.walk,-.8,(CL.z0+CL.z1-CL.walk)/2);
  void col;
  // candles in sconces along the outer walls, the way the procession lit it
  for(let k=0;k<7;k++)B.cyl(.05,.06,.3,'#ffffff',CL.x0+CL.walk+1+k*2.6,-4.4,CL.z0+.25,6);
  const walk=B.mesh(mat,'tpPastWalk'); walk.position.copy(O); Gl.addPast(walk);
  // echoes (placeholder captions: the Boss agent may replace the lines via G.glass.echo(id).lines). glass.js plays echoes whose
  // zone matches where you are; inside the temple that reads as 'island' (glass.js knows only the cave and the Undercroft).
  const zone=(G.glass&&G.glass.zoneOf)?'temple':'island';
  const E=(id,o)=>{ const e=ECHOES.find(q=>q.id===id); if(e&&Gl.addEcho)Gl.addEcho(Object.assign({id:'temple:'+id,pos:e.pos.clone(),r:e.r,zone},o)); };
  E('descent',{who:'An echo',lines:['People coming down the stair in their good clothes, two by two, carrying candles. A child asks what the light will give them. Her mother hushes her.'],
    figures:[{x:-.6,z:2.4,yaw:PI,pose:'stand'},{x:.6,z:2.6,yaw:PI,pose:'stand',h:.7},{x:0,z:4.4,yaw:PI,pose:'stand',h:1.05}]});
  E('keepers',{who:'An echo',lines:['Keepers in grey turn the great mirrors on their pillars, slow and careful, until a thread of violet runs the length of the hall and the watchers’ eyes take it.'],
    figures:[{x:-2.6,z:1.2,yaw:-PI/2,pose:'stand'},{x:2.6,z:-1.2,yaw:PI/2,pose:'stand'}]});
  E('procession',{who:'An echo',lines:['A procession walks the cloister with candles, round and round, singing something with no tune to it. Nobody looks at the water in the middle.'],
    figures:[{x:-3,z:0,yaw:PI/2,pose:'stand',walk:{dx:5,dz:0}},{x:-4.6,z:0,yaw:PI/2,pose:'stand',h:.95,walk:{dx:5,dz:0}},{x:-6.2,z:.2,yaw:PI/2,pose:'stand',walk:{dx:5,dz:0}}]});
  E('offering',{who:'An echo',lines:['Two keepers lower a bronze mirror on a chain, down through the floor into the cloister, as if they were hiding it from the hall above.'],
    figures:[{x:1.6,z:3.4,yaw:PI/2,pose:'carry'},{x:2.8,z:3.4,yaw:-PI/2,pose:'stand'}]});
  E('kneelers',{who:'An echo',lines:['They kneel at the edge of the water with their hands flat on the stone. Under the water, the light kneels with them.','“Answer us,” they say together. Something does.'],
    figures:[{x:.4,z:-1.2,yaw:PI/2,pose:'kneel'},{x:.4,z:.6,yaw:PI/2,pose:'kneel',h:.9},{x:.4,z:2.2,yaw:PI/2,pose:'kneel'}]});
}

/* ================================================================ 13. DEBUG */
G.debugEnterTemple=(roomId)=>{
  if(!(G.loop&&G.loop.active)&&G.debugStartLoop)G.debugStartLoop();
  if(G.state.mode==='title'){ const t=document.getElementById('title'); if(t)t.hidden=true; G.setMode('play'); }
  if(!S.open)openDoor(true);
  S.trans=null; doTeleport('in',roomId||'vestibule'); return room(G.player.pos);
};
API._debug={S,ZONES,SOLIDS,Sat,Fat,Cat,Sfield,Sphys,zoneFloor,presentAt,regionAt,connected,bestCheckpoint,arrivalFor,blockers,VIS,BRAZ,openDoor,unlock,
  WC,CL,rampY,UPPER_A,UPPER_Y,NICHE_A,nicheY,GATEBOX,doorSite:()=>doorSite,tpRoot,rayLocal,
  stats:()=>{ let n=0; tpRoot.traverse(o=>{ if((o.isMesh||o.isPoints||o.isInstancedMesh||o.isSprite)&&o.visible)n++; }); return n; }};
})();

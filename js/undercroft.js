/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — undercroft.js  (Place agent)
   The Hamlet Undercroft: the cellars under Wickham's End, reached through a trapdoor in the largest hamlet ruin once the
   Choked Well is cured. The interior sits far off-island at O (local coords: world = O + local), like the sea cave.
   - one analytic layout (zones = signed-distance shapes with floors and ceilings; solids = brick piers and pillars that
     carve the space) drives physics AND visuals (a grid field: floor + vaulted ceiling heightfields, walls from the
     zero contour), so they agree
   - five rooms (stair, cellars, chapel, mill, store), ether candles that light a room for good (5 ether, the first free)
   - the past layer's walkable doorway and stair (G.glass shows them; this module makes them solid while it's raised)
   - darkness, entering/leaving with a fade (the swarm comes along), checkpoints, the stranded fallback, persistence
   See UNDERCROFT.md for the shared API. Anchors are ready at script-evaluation time.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth,vnoise}=U;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);

/* ================================================================ 1. FRAME */
const O=V(0,60,-800);                  // UNDERCROFT.md. y is +60: player.js respawns anyone below y -3.
const toWorld=(x,y,z)=>V(O.x+x,O.y+y,O.z+z);
const toLocal=v=>V(v.x-O.x,v.y-O.y,v.z-O.z);
const BOX={x0:-39,x1:33,z0:-107,z1:7};
const inBoxW=(x,z)=>x>O.x+BOX.x0&&x<O.x+BOX.x1&&z>O.z+BOX.z0&&z<O.z+BOX.z1;

/* ================================================================ 2. LAYOUT (local) */
function sdBox(px,pz,x0,x1,z0,z1){ const cx=(x0+x1)/2,cz=(z0+z1)/2,hx=(x1-x0)/2,hz=(z1-z0)/2;
  const qx=Math.abs(px-cx)-hx,qz=Math.abs(pz-cz)-hz; return Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0); }
function sdSeg(px,pz,ax,az,bx,bz,w){ const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz; let t=((px-ax)*dx+(pz-az)*dz)/l2; t=t<0?0:t>1?1:t;
  return Math.hypot(px-ax-dx*t,pz-az-dz*t)-w; }
/** n rises from y0 (at a0) to y1 (at a1) along axis; n+1 treads */
function stepF(axis,a0,a1,y0,y1,n){ return (x,z)=>{ const c=axis==='x'?x:z; const t=clamp((c-a0)/(a1-a0),0,.9999); return y0+(y1-y0)*Math.min(n,Math.floor(t*(n+1)))/n; }; }
const ZONES=[], SOLIDS=[];
/** zone: {id,room,sd,floor(x,z)->y|null (null = a hole), ceil(x,z), vmax (vault rise), past, stair, tag, bb} */
function zone(o){ if(typeof o.floor==='number'){const f=o.floor;o.floor=()=>f;} if(typeof o.ceil==='number'){const c=o.ceil;o.ceil=()=>c;}
  if(o.ceilH!=null){ const h=o.ceilH, f=o.floor; o.ceil=(x,z)=>{ const y=f(x,z); return (y==null?-2:y)+h; }; }
  o.vmax=o.vmax==null?1.2:o.vmax; o.tag=o.tag||o.room; ZONES.push(o); return o; }
const rect=(id,room,x0,x1,z0,z1,floor,ceil,o)=>zone(Object.assign({id,room,sd:(x,z)=>sdBox(x,z,x0,x1,z0,z1),floor,ceil,bb:[x0,x1,z0,z1]},o||{}));
const seg=(id,room,ax,az,bx,bz,w,floor,ceil,o)=>zone(Object.assign({id,room,sd:(x,z)=>sdSeg(x,z,ax,az,bx,bz,w),floor,ceil,
  bb:[Math.min(ax,bx)-w,Math.max(ax,bx)+w,Math.min(az,bz)-w,Math.max(az,bz)+w]},o||{}));
const circ=(id,room,cx,cz,r,floor,ceil,o)=>zone(Object.assign({id,room,sd:(x,z)=>Math.hypot(x-cx,z-cz)-r,floor,ceil,bb:[cx-r,cx+r,cz-r,cz+r]},o||{}));
/** a solid brick mass (pier, pillar, door jamb): walls on its faces, blocks everyone */
const solid=(x0,x1,z0,z1,o)=>{ const s=Object.assign({x0,x1,z0,z1,sd:(x,z)=>sdBox(x,z,x0,x1,z0,z1),bb:[x0,x1,z0,z1]},o||{}); SOLIDS.push(s); return s; };
const stair=(axis,a0,a1,y0,y1,n,l0,l1,o)=>Object.assign({axis,a0,a1,y0,y1,n,l0,l1},o||{});

// --- the Trapdoor Stair (floor 0): a brick cellar under the hatch; the stone steps up to it climb the north wall
rect('stairRoom','stair',-4.2,4.2,-4.2,4.6,0,3.4,{vmax:.9});
const hallF=stepF('z',-5,-11,0,-2,7);
seg('stairHall','stair',0,-3.6,0,-14.6,1.25,hallF,null,{ceilH:3.0,vmax:.55,stair:stair('z',-5,-11,0,-2,7,-1.25,1.25)});
// --- the Joined Cellars (floor -2): five family cellars knocked through; brick piers split the bays (barrel vaults)
rect('cellars','cellars',-15,15,-34,-14,-2,1.4,{vmax:1.5});
for(const x of [-9,-3,3,9]){ solid(x-.4,x+.4,-34.5,-27.2); solid(x-.4,x+.4,-20.8,-13.5); }
// the old root cellar off bay 1: a rotten floor over a pit (Corwin's trap), rubble steps climb back out of the pit
const TRAP={x0:-22,x1:-18,z0:-20,z1:-15};
const inTrap=(x,z)=>x>TRAP.x0&&x<TRAP.x1&&z>TRAP.z0&&z<TRAP.z1;
rect('rootCellar','cellars',-23.2,-13.4,-21,-14,(x,z)=>(inTrap(x,z)&&S_trap())?null:-2,1.1,{vmax:.8,visFloor:(x,z)=>inTrap(x,z)?null:-2});
rect('pit','cellars',TRAP.x0,TRAP.x1,TRAP.z0,TRAP.z1,-5.2,1.1,{vmax:0});
const rampF=stepF('z',-19.6,-15.2,-5.2,-2,6);
rect('pitRamp','cellars',-22,-20.6,-20,-15,rampF,1.1,{vmax:0,stair:stair('z',-19.6,-15.2,-5.2,-2,6,-22,-20.6,{kind:'rubble'})});
solid(-15.4,-14.6,-21.4,-19.0); solid(-15.4,-14.6,-16.0,-13.6);       // the root cellar's doorway (z -19 .. -16)
// --- the way west, down to the chapel
seg('westHall','cellars',-14.6,-28,-22,-28,1.25,-2,1.0,{vmax:.5});
const chStF=stepF('z',-30.4,-36.6,-2,-4,6);
seg('chapelStair','chapel',-22,-28,-22,-38.6,1.25,chStF,null,{ceilH:3.0,vmax:.5,stair:stair('z',-30.4,-36.6,-2,-4,6,-23.25,-20.75)});
// --- the Crypt Chapel (floor -4): pillared nave, the sexton's niche, the side vestry
rect('chapel','chapel',-30,-14,-58,-38,-4,0.4,{vmax:1.9});
for(const x of [-26.5,-17.5]) for(const z of [-43,-48,-53]) solid(x-.42,x+.42,z-.42,z+.42,{pillar:1});
rect('niche','chapel',-14.4,-12.7,-52.1,-49.9,-4,-1.2,{vmax:.4});
rect('vestry','chapel',-36,-28.4,-54,-46,-4,-1.0,{vmax:.6});
solid(-30.4,-29.6,-54.4,-51.2); solid(-30.4,-29.6,-48.8,-45.6);      // the vestry door (z -51.2 .. -48.8)
// --- the way east: a doorway that is only there in the past (the Glass), then down to the mill
// (zones overlap generously where they join: the field is a min of shapes, so a shallow overlap reads as a wall to a body)
rect('pastDoor','cellars',13.0,18.6,-25.2,-22.8,-2,1.0,{past:1,vmax:.3});
seg('eastHall','mill',17.8,-24,22,-24,1.25,-2,1.0,{vmax:.5});
const millStF=stepF('z',-27,-37,-2,-6,10);
seg('millStair','mill',22,-24,22,-40.6,1.25,millStF,null,{ceilH:3.0,vmax:.5,stair:stair('z',-27,-37,-2,-6,10,20.75,23.25)});
// --- the Mill-Race (floor -6): the race channel runs north-south, a plank bridge, the loft, the old stair to it (past)
const RACE={x0:25,x1:27.4,z0:-60.5,z1:-39.5};
const inRace=(x,z)=>x>RACE.x0&&x<RACE.x1;
const inLoft=(x,z)=>x<19.6&&z>-44;
const millF=(x,z)=>inRace(x,z)||inLoft(x,z)?null:-6;   // the loft is a ledge, not a roof over the floor
rect('mill','mill',14,30,-60,-40,millF,.6,{vmax:1.6,visFloor:millF});
rect('race','mill',RACE.x0,RACE.x1,RACE.z0,RACE.z1,-7.6,.6,{vmax:0,water:1});
rect('bridge','mill',RACE.x0-.2,RACE.x1+.2,-51.1,-48.9,-6,.6,{vmax:0,timber:1,visFloor:()=>null});
rect('loft','mill',14,19.6,-44,-40,-3,.6,{vmax:0});
const pastStF=stepF('z',-47.6,-44.2,-6,-3,5);
rect('pastStair','mill',15,17.5,-48,-42.6,pastStF,.6,{past:1,vmax:0,stair:stair('z',-47.6,-44.2,-6,-3,5,15,17.5,{past:1})});
// --- down to the store
const storeStF=stepF('z',-61,-67,-6,-8,6);
seg('storeStair','mill',18,-59.6,18,-68,1.25,storeStF,null,{ceilH:3.0,vmax:.5,stair:stair('z',-61,-67,-6,-8,6,16.75,19.25)});
seg('storeHall','store',18,-68,9,-68,1.25,-8,-5,{vmax:.5});
// --- the Tithe Store (floor -8): the boss arena; the strongroom beyond its back door; the exit shaft
const SC={x:0,z:-80}, SR=16;
circ('store','store',SC.x,SC.z,SR,-8,-2.2,{vmax:1.8});
for(const a of [45,135,225,315]){ const r=a*PI/180, x=SC.x+Math.cos(r)*8.5, z=SC.z+Math.sin(r)*8.5; solid(x-.38,x+.38,z-.38,z+.38,{post:1}); }
rect('strongroom','store',-4,4,-104,-95.2,-8,-5,{vmax:.6});
solid(-4.4,-1.2,-96.6,-95.4); solid(1.2,4.4,-96.6,-95.4);           // the strongroom door (x -1.2 .. 1.2)
seg('shaft','store',-10,-92.2,-14.8,-92.2,1.25,-8,-3.5,{vmax:.3});

/* ---------- rooms (UNDERCROFT.md table) ---------- */
const ROOMDEF={
  stair:{centre:[0,0,0],b:[[-5,5,-13,6]],spawn:[0,0,-.9,PI],name:'The Trapdoor Stair'},
  chapel:{centre:[-22,-4,-48],b:[[-38,-12,-61,-33.5]],spawn:[-22,-4,-40.4,PI],name:'The Crypt Chapel'},
  mill:{centre:[22,-6,-50],b:[[15.6,32,-62,-21],[11.5,32,-71,-62]],spawn:[22,-6,-42,PI],name:'The Mill-Race'},
  store:{centre:[0,-8,-80],b:[[-18,11.5,-107,-63]],spawn:[13.6,-8,-68,-PI/2],name:'The Tithe Store'},
  cellars:{centre:[0,-2,-24],b:[[-24,15.6,-36,-12]],spawn:[0,-2,-16.4,PI],name:'The Joined Cellars'},
};
const ROOM_IDS=['stair','chapel','mill','store','cellars'];
function roomAtL(x,z){ for(const id of ROOM_IDS) for(const b of ROOMDEF[id].b) if(x>=b[0]&&x<=b[1]&&z>=b[2]&&z<=b[3])return id; return null; }

/* ---------- state needed by the layout (gates, trap, the Glass) ---------- */
const S={inside:false,room:null,open:false,lit:new Set(),gates:{portcullis:false,strongroom:false,exit:false},trap:false,freeUsed:false,
  trans:null,prevCp:null,reached:new Set(),footReg:null,footT:0,stranded:false,hidden:[],farPrev:1200,lastPresent:V(),push:null,said:{},mill:false};
function S_trap(){ return S.trap; }
const glassUp=()=>!!(G.glass&&G.glass.solid);           // glass.js: the past is solid (raised, past the fade-in)
const glassOwned=()=>!!(G.glass&&G.glass.owned);

/* ================================================================ 3. FIELD */
const activeZone=(Z,who)=>!Z.past||(glassUp()&&(who==null||who==='player'));
/** wall distance at (x,z) (negative = open), solids carve; who: past zones only count for the player with the Glass raised */
function Sfield(x,z,who,visual){
  let m=1e9;
  for(const Z of ZONES){ const b=Z.bb; if(x<b[0]-3||x>b[1]+3||z<b[2]-3||z>b[3]+3)continue; if(!visual&&!activeZone(Z,who))continue; const d=Z.sd(x,z); if(d<m)m=d; }
  for(const s of SOLIDS){ const b=s.bb; if(x<b[0]-3||x>b[1]+3||z<b[2]-3||z>b[3]+3)continue; const d=-s.sd(x,z); if(d>m)m=d; }
  return m; }
/** physics floor at (x,z) for a body at y: the highest floor <= y+.9 among the zones there; else the lowest (a ledge face) */
function zoneFloor(x,z,y,who){ let best=null, low=null;
  for(const Z of ZONES){ const b=Z.bb; if(x<b[0]||x>b[1]||z<b[2]||z>b[3])continue; if(!activeZone(Z,who))continue; if(Z.sd(x,z)>=0)continue;
    const h=Z.floor(x,z); if(h==null)continue;
    if(h<=y+.9){ if(best==null||h>best)best=h; } else if(low==null||h<low)low=h; }
  return best!=null?best:low; }
function zonesAt(x,z){ const out=[]; for(const Z of ZONES){ const b=Z.bb; if(x<b[0]||x>b[1]||z<b[2]||z>b[3])continue; if(Z.sd(x,z)<0)out.push(Z);} return out; }
/** standing in the present (some non-past zone holds you): the past push-back uses it */
function presentAt(x,z){ for(const Z of zonesAt(x,z)) if(!Z.past&&Z.floor(x,z)!=null&&!Z.water)return true; return false; }

/* ---------- the grid (visual field + camera): built at script-evaluation time ---------- */
const GS=.3, GX0=BOX.x0, GZ0=BOX.z0, NX=Math.round((BOX.x1-BOX.x0)/GS)+1, NZ=Math.round((BOX.z1-BOX.z0)/GS)+1;
const gS=new Float32Array(NX*NZ), gF=new Float32Array(NX*NZ), gC=new Float32Array(NX*NZ), gStair=new Uint8Array(NX*NZ), gTag=new Uint8Array(NX*NZ);
const TAGS=['stair','cellars','chapel','mill','store'];
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
        if(Z.stair){ const s=Z.stair, c=s.axis==='z'?z:x; if(c<=Math.max(s.a0,s.a1)+.35&&c>=Math.min(s.a0,s.a1)-.35)st=Z.stair.past?2:1; } }
    }
    let Sv=m; for(const s of SOLIDS){ const b=s.bb; if(x<b[0]-3||x>b[1]+3||z<b[2]-3||z>b[3]+3)continue; const d=-s.sd(x,z); if(d>Sv)Sv=d; }
    gS[k]=Sv; gStair[k]=st; gTag[k]=Math.max(0,TAGS.indexOf(tag||(near&&near.tag)||'cellars'));
    if(fin==null){ const nf=near?(near.visFloor?near.visFloor(x,z):near.floor(x,z)):null; fin=nf==null?(near&&near.water?-7.6:-2):nf; }
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

/* ---------- blockers: physics-only boxes (local), switchable ---------- */
const blockers={};
blockers.stairSteps={x:0,z:2.75,hw:1.2,hd:1.95,y0:-2,y1:6};
blockers.raceN={x:(RACE.x0+RACE.x1)/2,z:-44.1,hw:(RACE.x1-RACE.x0)/2,hd:4.8,y0:-12,y1:2};   // the race, but for the plank bridge (z -51.1 .. -48.9)
blockers.raceS={x:(RACE.x0+RACE.x1)/2,z:-55.85,hw:(RACE.x1-RACE.x0)/2,hd:4.75,y0:-12,y1:2};
function setGate(id,open){ open=!!open; S.gates[id]=open;
  if(id==='portcullis')blockers.portcullis=open?null:{x:11.4,z:-68,hw:.3,hd:1.5,y0:-12,y1:2};
  if(id==='strongroom')blockers.strongroom=open?null:{x:0,z:-96,hw:1.3,hd:.35,y0:-12,y1:2};
  if(id==='exit')blockers.exit=open?null:{x:-10.9,z:-92.2,hw:.3,hd:1.4,y0:-12,y1:2};
  if(VIS.built)updateGateVis(true);
}
function blockS(x,z,y){ let s=-1e9; for(const id in blockers){ const b=blockers[id]; if(!b)continue; if(y!=null&&(y+1.6<b.y0||y>b.y1))continue;
  const v=-sdBox(x,z,b.x-b.hw,b.x+b.hw,b.z-b.hd,b.z+b.hd); if(v>s)s=v; } return s; }
const Sphys=(x,z,y,who)=>Math.max(Sfield(x,z,who),blockS(x,z,y));

/* ---------- candles (each room ≥ 2) and echoes ---------- */
// [room, local x, y, z, wall normal x, z, kind]: y is the surface the wax stands on — a wall sconce's cup, a table or an
// altar top, or the floor under a free-standing iron pricket (its cup is 1.25 m up)
const CANDLEDEF=[
  ['stair',-4.1,1.5,-2.2,1,0,'sconce'],['stair',4.1,1.5,-1.6,-1,0,'sconce'],
  ['cellars',-14.9,-.5,-24,1,0,'sconce'],['cellars',.5,-1.18,-26.7,0,0,'stand'],['cellars',12.8,-1.16,-29.85,0,0,'stand'],
  ['chapel',-23.2,-2.86,-55.9,0,0,'stand'],['chapel',-20.8,-2.86,-55.9,0,0,'stand'],['chapel',-26.0,-4,-41.2,0,0,'pricket'],
  ['mill',14.05,-4.5,-56.4,1,0,'sconce'],['mill',23.9,-6,-50.4,0,0,'pricket'],['mill',16.5,-1.9,-40.05,0,-1,'sconce'],
  ['store',-11.4,-8,-72.8,0,0,'pricket'],['store',11.0,-8,-87.0,0,0,'pricket'],['store',2.2,-8,-101.7,0,0,'pricket'],
];
const CANDLES=CANDLEDEF.map((c,i)=>({id:c[0]+':'+CANDLEDEF.slice(0,i).filter(d=>d[0]===c[0]).length,room:c[0],l:V(c[1],c[2],c[3]),n:[c[4],c[5]],kind:c[6]}));
CANDLES.forEach(c=>{ const nx=c.n[0], nz=c.n[1];
  c.top=c.kind==='pricket'?c.l.y+1.25:c.l.y;                       // where the wax stands
  c.h=.24+((c.l.x*7.3+c.l.z*3.1)%1+1)%1*.1;                           // wax height
  c.flame=V(c.l.x,c.top+c.h+.06,c.l.z);
  const sx=c.l.x+nx*.9, sz=c.l.z+nz*.9, f=zoneFloor(sx,sz,c.top);
  c.stand=V(sx,f==null?c.top-1.3:f,sz); c.world=toWorld(c.flame.x,c.flame.y,c.flame.z); });
const LIGHTS={}; ROOM_IDS.forEach(id=>LIGHTS[id]=CANDLES.filter(c=>c.room===id).slice(0,3).map(c=>V(c.flame.x+c.n[0]*.5,c.flame.y+.4,c.flame.z+c.n[1]*.5)));
const ECHODEF=[ // dungeon echoes: [id, room, local x,y,z, radius]
  ['tithe','stair',0,0,-2.2,4.2],['supper','cellars',0,-2,-27,4.2],['bargain','chapel',-22,-4,-53.6,4.6],
  ['register','chapel',-16.2,-4,-46.2,2.8],['wren','mill',16.5,-3,-42,3.2]];

/* ---------- anchors (world) ---------- */
const W=(x,y,z)=>toWorld(x,y,z);
const BIN_ANG=[95,140,185,340,305,15];
const ANCH={
  stair:{entry:W(0,0,-.9),candle:CANDLES[0].world.clone(),exit:W(0,0,.3),hall:W(0,-1,-8)},
  cellars:{tamsin:W(-6,-2,-23.6),wall:W(15.6,-2,-24),wallIn:W(13.6,-2,-24),trap:W(-20,-2,-17.5),pit:W(-20,-5.2,-18.2),
    grate:W(14.3,-2,-31.2),table:W(0,-2,-27),roost:W(-12,1.2,-24),rootCellar:W(-18.5,-2,-15)},
  chapel:{corwin:W(-20.3,-4,-39.9),door:W(-22,-4,-38.4),register:W(-16.2,-4,-46.2),niche:W(-13.5,-4,-51),nicheShelf:W(-13.3,-2.75,-51),
    vestry:W(-33.4,-4,-50),altar:W(-22,-4,-55.6),font:W(-24.6,-4,-42.2),
    ropes:[W(-28.7,-4,-40.6),W(-27.6,-4,-40.6),W(-26.5,-4,-40.6)]},
  mill:{hob:W(18.2,-6,-50.6),gates:[W(24.4,-6,-58.2),W(24.4,-6,-56.4),W(24.4,-6,-54.6),W(24.4,-6,-46.4),W(24.4,-6,-44.6)],
    stone:W(19.8,-6,-52.6),wheel:W(26.2,-6,-55.4),bridge:W(26.2,-6,-50),loft:W(16.5,-3,-42),pastStair:W(16.25,-6,-47.2),door:W(22,-6,-41)},
  store:{door:W(13.6,-8,-68),portcullis:W(11.4,-8,-68),centre:W(SC.x,-8,SC.z),
    bins:BIN_ANG.map(a=>W(SC.x+Math.cos(a*PI/180)*13.3,-8,SC.z+Math.sin(a*PI/180)*13.3)),
    lectern:W(0,-8,-101.2),strongroom:W(0,-8,-99),exit:W(-13.6,-8,-92.2),backDoor:W(0,-8,-95.8)},
};
const rooms={};
for(const id of ROOM_IDS){ const d=ROOMDEF[id], b=d.b[0];
  const anchors=Object.assign({},ANCH[id]);
  anchors.candles=CANDLES.filter(c=>c.room===id).map(c=>c.world.clone());
  anchors.echoes=ECHODEF.filter(e=>e[1]===id).map(e=>({id:e[0],pos:W(e[2],e[3],e[4])}));
  rooms[id]={id,name:d.name,centre:W(d.centre[0],d.centre[1],d.centre[2]),bounds:{min:toWorld(b[0],-14,b[2]),max:toWorld(b[1],8,b[3])},anchors};
}
const ECHOES=ECHODEF.map(e=>({id:e[0],room:e[1],pos:W(e[2],e[3],e[4]),r:e[5]}));

/* ================================================================ 4. THE TRAPDOOR (island) */
const LM=()=>(G.world&&G.world.landmarks)||{};
const doorLM=LM().undercroftDoor||{x:-8.6,y:G.world.height(-8.6,37.6),z:37.6,yaw:-.28};
const doorPos=V(doorLM.x,doorLM.y,doorLM.z);
/* the open hatch is a hole: nobody walks into it */
G.addCollider({x:doorPos.x,z:doorPos.z,r:.85,y0:doorPos.y-3,y1:doorPos.y+1.5});
const wellCured=()=>{ const b=(G.blights||[]).find(x=>x.id==='well'); return !!(b&&b.cured); };

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
  if(jump>lim){ // a push bigger than the step would tunnel; when stuck inside, ease out a step at a time
    if(!(s0+rad>.06)){ next.x=prev.x; next.z=prev.z; return true; }
    const k=Math.max(lim,.12)/jump, ex=px+(nx-px)*k, ez=pz+(nzz-pz)*k;
    if(!(Sp(ex,ez)<s0)){ next.x=prev.x; next.z=prev.z; return true; }
    next.x=ex+O.x; next.z=ez+O.z; return true; }
  next.x=nx+O.x; next.z=nzz+O.z; return true;
});
G.cameraConstrainers.push((cam,target)=>{
  if(!S.inside)return;
  const tx=target.x-O.x, ty=target.y-O.y, tz=target.z-O.z, cx=cam.x-O.x, cy=cam.y-O.y, cz=cam.z-O.z;
  const bad=(x,y,z)=>Sat(x,z)>-.26||y>Cat(x,z)-.3||y<Fat(x,z)+.35||blockS(x,z,y-1)>-.2;
  const L=Math.hypot(cx-tx,cy-ty,cz-tz), n=Math.max(1,Math.ceil(L/.12));
  let gx=tx,gy=ty,gz=tz;
  if(bad(tx,ty,tz)){ let bx=tx, bz=tz; const P=G.player&&G.player.pos;
    if(P&&Sat(tx,tz)>-.3){ const px=P.x-O.x, pz=P.z-O.z; bx=px; bz=pz; const m=Math.max(1,Math.ceil(Math.hypot(tx-px,tz-pz)/.08));
      for(let i=1;i<=m;i++){ const x=px+(tx-px)*i/m, z=pz+(tz-pz)*i/m; if(Sat(x,z)>-.3)break; bx=x; bz=z; } }
    cam.set(bx+O.x,O.y+Math.min(Math.max(ty,Fat(bx,bz)+.4),Cat(bx,bz)-.25),bz+O.z); return; }
  for(let i=1;i<=n;i++){ const t=i/n, x=tx+(cx-tx)*t, y=ty+(cy-ty)*t, z=tz+(cz-tz)*t; if(bad(x,y,z))break; gx=x;gy=y;gz=z; }
  cam.set(gx+O.x,gy+O.y,gz+O.z);
});
// no double jump into the vaults over the past stair (it would skip the Glass); combat.js hook
if(G.moves&&G.moves.noDoubleJump)G.moves.noDoubleJump.push(p=>S.inside&&inBoxW(p.x,p.z)&&Math.hypot(p.x-O.x-16.5,p.z-O.z+44)<6);

/* ================================================================ 6. API */
function room(pos){ if(!pos||!inBoxW(pos.x,pos.z)||pos.y<O.y-30)return null; return roomAtL(pos.x-O.x,pos.z-O.z); }
const transferHooks=[];
const SWARM=new Set(['lantern','satchel','feed','hunt','jar','jarRelease','released']);
const API=G.undercroft={
  inside:false, origin:O.clone(), toWorld, toLocal, room, rooms, echoes:ECHOES.map(e=>({id:e.id,room:e.room,pos:e.pos.clone(),r:e.r})),
  door:doorPos.clone(), open:false,
  enter:(roomId,o)=>startTrans('in',roomId||'stair',o), exit:o=>startTrans('out',null,o),
  lightCandle, isLit:id=>S.lit.has(id), get litRooms(){return [...S.lit];},
  candles:CANDLES.map(c=>({id:c.id,room:c.room,pos:c.world.clone()})),
  setGate, gate:id=>!!S.gates[id], setMill:on=>{S.mill=!!on;}, get millTurning(){return S.mill;},
  get trapSprung(){return S.trap;}, springTrap:()=>springTrap(),
  /** soft-lock guards: region at a world pos, regions with an open way to the stair, the way out */
  region:pos=>pos&&inBoxW(pos.x,pos.z)?roomAtL(pos.x-O.x,pos.z-O.z):null, connected:()=>[...connected()], stranded:()=>!!S.stranded,
  reached:()=>[...S.reached], followDraught:()=>followDraught(),
  /** local helpers: wall distance (<0 open), visible floor/ceiling heights, physics floor */
  sdf:(x,z)=>Sat(x,z), floorVis:(x,z)=>Fat(x,z), ceilVis:(x,z)=>Cat(x,z), floorAt:(x,z,y)=>zoneFloor(x,z,y),
  /** roost points [{p,n}] on the vault of a room (for G.creatures.setRoost) */
  roostPoints:(id)=>roostPoints(id||'cellars'),
  /** register fn(delta:Vector3, info{to:'undercroft'|'island'}) — called when the player is moved in/out, to carry your things */
  onTransfer:fn=>{transferHooks.push(fn);},
  /** add/remove a physical blocker in local coords: block('x',{x,z,hw,hd,y0,y1}) / block('x',null) */
  block:(id,b)=>{ blockers[id]=b?Object.assign({y0:-50,y1:50},b):null; },
  swarmStates:SWARM, zones:ZONES,
  stats:{fieldMs}
};
const INTERIOR={id:'undercroft',contains:(x,z,y)=>inBoxW(x,z)&&(y==null||y>O.y-30)};

/* ================================================================ 7. VISUALS */
const ucRoot=new THREE.Group(); ucRoot.name='undercroft'; ucRoot.position.copy(O); ucRoot.visible=false;
const isleRoot=new THREE.Group(); isleRoot.name='undercroftDoor';
const VIS={built:false};
const C=hex=>U.col(hex);
const tUni={uTime:{value:0}};

/* ---------- textures ---------- */
function brickCanvas(g,s){
  const r=U.rng(7121); g.fillStyle='#5b5552'; g.fillRect(0,0,s,s);            // mortar
  const rows=16, bh=s/rows, bw=s/6;
  for(let j=0;j<rows;j++){ const off=(j%2)*bw/2;
    for(let i=-1;i<7;i++){ const x=i*bw+off, y=j*bh; const h=14+r()*14, l=36+r()*15, sat=12+r()*14;
      g.fillStyle=`hsl(${h},${sat}%,${l}%)`; g.fillRect(x+2,y+2,bw-4,bh-4);
      // soft face shading + chips
      const gr=g.createLinearGradient(0,y,0,y+bh); gr.addColorStop(0,'rgba(255,240,220,.10)'); gr.addColorStop(1,'rgba(0,0,0,.16)'); g.fillStyle=gr; g.fillRect(x+2,y+2,bw-4,bh-4);
      for(let k=0;k<6;k++){ g.fillStyle=r()<.5?'rgba(0,0,0,.12)':'rgba(255,240,220,.08)'; g.fillRect(x+2+r()*(bw-8),y+2+r()*(bh-6),2+r()*4,1+r()*3); } } }
  // soot and damp streaks, a little moss
  for(let i=0;i<40;i++){ const x=r()*s, w=4+r()*20; const gr=g.createLinearGradient(0,0,0,s); gr.addColorStop(0,'rgba(20,14,12,0)'); gr.addColorStop(r(),'rgba(20,14,12,.14)'); gr.addColorStop(1,'rgba(20,14,12,0)'); g.fillStyle=gr; g.fillRect(x,0,w,s); }
  for(let i=0;i<30;i++){ g.fillStyle=`rgba(${90+r()*30},${110+r()*20},70,${.06+r()*.08})`; g.beginPath(); g.arc(r()*s,r()*s,3+r()*12,0,TAU); g.fill(); }
}
function flagCanvas(g,s){
  const r=U.rng(9931); g.fillStyle='#4a4440'; g.fillRect(0,0,s,s);
  // courses of irregular flags: each course its own height, each slab its own width, corners knocked round
  let y=0; const H=[.17,.22,.19,.24,.18];
  for(let row=0;y<s-2;row++){ const h=Math.min(s-y,Math.round(s*H[row%H.length])); let x=-r()*s*.2;
    while(x<s){ const w=s*(.16+r()*.22), l=44+r()*12, hue=24+r()*18, sat=5+r()*8;
      for(const ox of [0,-s,s]){ const x0=x+ox+2.5, y0=y+2.5, x1=x+ox+w-2.5, y1=y+h-2.5, k=4+r()*5;
        g.fillStyle=`hsl(${hue},${sat}%,${l}%)`; g.beginPath(); g.moveTo(x0+k,y0); g.lineTo(x1-k*.6,y0+r()*1.5); g.quadraticCurveTo(x1,y0,x1,y0+k); g.lineTo(x1-r()*1.5,y1-k*.7);
        g.quadraticCurveTo(x1,y1,x1-k,y1); g.lineTo(x0+k*.8,y1); g.quadraticCurveTo(x0,y1,x0,y1-k); g.lineTo(x0+r()*1.5,y0+k); g.quadraticCurveTo(x0,y0,x0+k,y0); g.fill();
        const gr=g.createRadialGradient(x0+w*.4,y0+h*.4,2,x0+w*.5,y0+h*.5,Math.max(w,h)*.7); gr.addColorStop(0,'rgba(255,245,230,.06)'); gr.addColorStop(1,'rgba(0,0,0,.12)'); g.fillStyle=gr; g.fill(); }
      x+=w; }
    y+=h; }
  for(let i=0;i<2600;i++){ g.fillStyle=r()<.5?'rgba(20,16,14,.07)':'rgba(240,230,210,.045)'; g.fillRect(r()*s,r()*s,1+r()*2,1+r()*2); }
  for(let i=0;i<14;i++){ g.strokeStyle='rgba(20,14,12,.18)'; g.lineWidth=.8; g.beginPath(); let x=r()*s, yy=r()*s; g.moveTo(x,yy); for(let k=0;k<4;k++){ x+=(r()-.5)*30; yy+=(r()-.5)*30; g.lineTo(x,yy);} g.stroke(); }
}
let brickTex=null, flagTex=null, woodTex=null;
function triMaterial(kind,scale,o){
  if(!brickTex){ brickTex=G.canvasTex(512,brickCanvas); brickTex.wrapS=brickTex.wrapT=THREE.RepeatWrapping;
    flagTex=G.canvasTex(512,flagCanvas); flagTex.wrapS=flagTex.wrapT=THREE.RepeatWrapping; }
  const m=G.toon('#ffffff',Object.assign({vertexColors:true},o||{}));
  const sc=scale.toFixed(3);
  m.onBeforeCompile=sh=>{
    sh.uniforms.uBrick={value:brickTex}; sh.uniforms.uFlag={value:flagTex};
    sh.vertexShader='varying vec3 vWP;varying vec3 vWN;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vWP=(modelMatrix*vec4(transformed,1.)).xyz; vWN=normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader='uniform sampler2D uBrick,uFlag;varying vec3 vWP;varying vec3 vWN;\n'+sh.fragmentShader.replace('#include <map_fragment>',`
      { vec3 n=abs(normalize(vWN)); vec4 tc;
        ${kind==='floor'?`tc=texture2D(uFlag,vWP.xz*${sc});`:kind==='stone'?`vec3 bw=pow(n,vec3(4.)); bw/=dot(bw,vec3(1.)); tc=texture2D(uFlag,vWP.zy*${sc})*bw.x+texture2D(uFlag,vWP.xz*${sc})*bw.y+texture2D(uFlag,vWP.xy*${sc})*bw.z;`:
          `vec3 bw=pow(n,vec3(4.)); bw/=dot(bw,vec3(1.));
           vec4 tx=texture2D(uBrick,vec2(vWP.z,vWP.y*1.6)*${sc}), tz=texture2D(uBrick,vec2(vWP.x,vWP.y*1.6)*${sc}), ty=texture2D(uBrick,vWP.xz*${sc});
           tc=tx*bw.x+ty*bw.y+tz*bw.z;`}
        tc.rgb=pow(tc.rgb,vec3(2.2)); diffuseColor.rgb*=tc.rgb*${kind==='stone'?'2.2':'1.9'}; }`);
  };
  m.customProgramCacheKey=()=>'ucTri'+kind+sc;
  return m;
}
function timberMaterial(){
  if(!woodTex){ woodTex=G.canvasTex(256,(g,s)=>{const r=U.rng(5);g.fillStyle='#4a3626';g.fillRect(0,0,s,s);
    for(let x=0;x<s;x+=32){const l=30+r()*12;g.fillStyle=`hsl(${24+r()*8},${10+r()*8}%,${l}%)`;g.fillRect(x+1,0,30,s);
      for(let k=0;k<14;k++){g.strokeStyle='rgba(15,8,4,.3)';g.beginPath();const xx=x+3+r()*26;g.moveTo(xx,0);g.bezierCurveTo(xx+r()*6-3,s*.3,xx+r()*6-3,s*.6,xx,s);g.stroke();}}});
    woodTex.wrapS=woodTex.wrapT=THREE.RepeatWrapping; }
  const m=G.toon('#ffffff',{vertexColors:true});
  m.onBeforeCompile=sh=>{ sh.uniforms.uWood={value:woodTex};
    sh.vertexShader='varying vec3 vWP2;varying vec3 vWN2;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vWP2=(modelMatrix*vec4(transformed,1.)).xyz; vWN2=normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader='uniform sampler2D uWood;varying vec3 vWP2;varying vec3 vWN2;\n'+sh.fragmentShader.replace('#include <map_fragment>',`{ vec3 n=abs(normalize(vWN2)); vec2 uv=n.y>.6?vWP2.xz:(n.x>n.z?vWP2.zy:vWP2.xy); vec4 t=texture2D(uWood,uv*vec2(.5,.9)); diffuseColor.rgb*=pow(t.rgb,vec3(2.2))*1.7; }`); };
  m.customProgramCacheKey=()=>'ucTimber';
  return m;
}

/* ---------- geometry helpers ---------- */
function mergeGeos(list){ // [{geo,color}] -> non-indexed BufferGeometry with position/normal/color
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

/* ---------- the shell: floor + vaulted ceiling heightfields, brick walls from the field's zero contour ---------- */
const TAGCOL={stair:['#77706a','#6d6862'],cellars:['#6c5c4c','#5c5046'],chapel:['#7a7672','#6a6560'],mill:['#626660','#55574f'],store:['#6f6352','#5e5446']};
function buildShell(){
  const floorMat=triMaterial('floor',.42), brickMat=triMaterial('brick',.5,{side:THREE.DoubleSide}), ceilMat=triMaterial('brick',.5);
  VIS.mats={floorMat,brickMat,ceilMat};
  const tc=new THREE.Color();
  // --- floor and ceiling (shared node vertices; cells cut where the floor steps: stairs/pit/race props cover those)
  const fp=[],fc=[],fi=[], cp=[],cc=[],ci=[]; const fV=new Int32Array(NX*NZ).fill(-1), cV=new Int32Array(NX*NZ).fill(-1);
  const fvert=k=>{ if(fV[k]>=0)return fV[k]; const i=k%NX, j=(k/NX)|0, x=GX0+i*GS, z=GZ0+j*GS, s=gS[k];
    fV[k]=fp.length/3; fp.push(x,gF[k],z); const pal=TAGCOL[TAGS[gTag[k]]]||TAGCOL.cellars;
    tc.set(pal[0]).lerp(C(pal[1]),vnoise(x*.21,z*.21)); tc.copy(C(pal[0])).lerp(C(pal[1]),vnoise(x*.21,z*.21));
    tc.multiplyScalar((.8+.3*vnoise(x*.7+3,z*.7))*(.62+.38*smooth(.1,-1.3,s))); fc.push(tc.r,tc.g,tc.b); return fV[k]; };
  const cvert=k=>{ if(cV[k]>=0)return cV[k]; const i=k%NX, j=(k/NX)|0, x=GX0+i*GS, z=GZ0+j*GS, s=gS[k];
    cV[k]=cp.length/3; cp.push(x,gC[k],z); tc.copy(C('#6d5f58')).lerp(C('#4f4744'),vnoise(x*.3,z*.3)); tc.multiplyScalar(.75+.25*smooth(0,-1.2,s)); cc.push(tc.r,tc.g,tc.b); return cV[k]; };
  for(let j=0;j<NZ-1;j++)for(let i=0;i<NX-1;i++){
    const k=[j*NX+i,j*NX+i+1,(j+1)*NX+i,(j+1)*NX+i+1];
    const smin=Math.min(gS[k[0]],gS[k[1]],gS[k[2]],gS[k[3]]); if(smin>.35)continue;
    const fmin=Math.min(gF[k[0]],gF[k[1]],gF[k[2]],gF[k[3]]), fmax=Math.max(gF[k[0]],gF[k[1]],gF[k[2]],gF[k[3]]);
    if(fmax-fmin<.08&&!(gStair[k[0]]|gStair[k[1]]|gStair[k[2]]|gStair[k[3]])){ const a=fvert(k[0]),b=fvert(k[1]),c=fvert(k[2]),d=fvert(k[3]); fi.push(a,c,b,b,c,d); }
    const A=cvert(k[0]),B=cvert(k[1]),Cc=cvert(k[2]),D=cvert(k[3]); ci.push(A,B,Cc,B,D,Cc);
  }
  const mk=(p,c,ix,mat,name)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(p,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));
    g.setIndex(ix); g.computeVertexNormals(); g.computeBoundingSphere(); const m=new THREE.Mesh(g,mat); m.name=name; ucRoot.add(m); return m; };
  VIS.floor=mk(fp,fc,fi,floorMat,'ucFloor'); VIS.ceil=mk(cp,cc,ci,ceilMat,'ucCeil');
  // --- walls: marching squares on gS (bilinear zero contour), extruded from below the floor to above the vault
  const wp=[],wc=[]; let segs=0;
  const node=(i,j)=>gS[j*NX+i];
  const lerpE=(ax,az,sa,bx,bz,sb)=>{ const t=sa/(sa-sb); return [ax+(bx-ax)*t,az+(bz-az)*t]; };
  const addWall=(p0,p1)=>{
    const mx=(p0[0]+p1[0])/2, mz=(p0[1]+p1[1])/2, e=.15;
    let nx=-(Sat(mx+e,mz)-Sat(mx-e,mz)), nz=-(Sat(mx,mz+e)-Sat(mx,mz-e)); const nl=Math.hypot(nx,nz)||1; nx/=nl; nz/=nl;  // into the room
    const inF=(p)=>Fat(p[0]+nx*.35,p[1]+nz*.35), inC=(p)=>Cat(p[0]+nx*.2,p[1]+nz*.2);
    const y0=Math.min(inF(p0),inF(p1))-.7, y1a=Math.max(inC(p0),Fat(p0[0],p0[1])+1)+.25, y1b=Math.max(inC(p1),Fat(p1[0],p1[1])+1)+.25;
    const v=[[p0[0],y0,p0[1]],[p1[0],y0,p1[1]],[p1[0],y1b,p1[1]],[p0[0],y1a,p0[1]]];
    const ux=p1[0]-p0[0], uz=p1[1]-p0[1]; const flip=(ux*nz-uz*nx)>0; // make the face point into the room
    const tri=flip?[0,2,1,0,3,2]:[0,1,2,0,2,3];
    const lum=.82+.3*vnoise(mx*.4,mz*.4);
    for(const q of tri){ wp.push(v[q][0],v[q][1],v[q][2]); tc.copy(C('#86766b')).lerp(C('#6e5f58'),vnoise(mx*.13+v[q][1]*.2,mz*.13)).multiplyScalar(lum*(v[q][1]<y0+1?.8:1)); wc.push(tc.r,tc.g,tc.b); }
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
  const wg=new THREE.BufferGeometry(); wg.setAttribute('position',new THREE.Float32BufferAttribute(wp,3)); wg.setAttribute('color',new THREE.Float32BufferAttribute(wc,3)); wg.computeVertexNormals(); wg.computeBoundingSphere();
  VIS.walls=new THREE.Mesh(wg,brickMat); VIS.walls.name='ucWalls'; ucRoot.add(VIS.walls);
  API.stats.wallSegs=segs; API.stats.floorTris=fi.length/3; API.stats.ceilTris=ci.length/3;
}

/* ---------- props ---------- */
let mats=null;
function propMats(){ if(mats)return mats;
  mats={stone:triMaterial('stone',.55),timber:timberMaterial(),iron:G.toon('#ffffff',{vertexColors:true}),cloth:G.toon('#ffffff',{vertexColors:true}),
    root:G.toon('#ffffff',{vertexColors:true}),wax:G.toon('#ffffff',{vertexColors:true,emissive:'#3a2a12',emissiveIntensity:.25})};
  return mats; }
function treadsFor(Z,B,col){ const s=Z.stair, n=s.n, d=(s.a1-s.a0)/(n+1), lo=Math.min(s.y0,s.y1)-.6;
  for(let k=0;k<=n;k++){ let c0=s.a0+k*d, c1=c0+d; if(k===0)c0-=Math.sign(d)*.35; if(k===n)c1+=Math.sign(d)*.35;
    const top=s.y0+(s.y1-s.y0)*k/n, h=top-lo, cm=(c0+c1)/2, len=Math.abs(c1-c0), lw=s.l1-s.l0+.5, lm=(s.l0+s.l1)/2;
    if(s.axis==='z')B.box(lw,h,len,col(k),lm,lo+h/2,cm); else B.box(len,h,lw,col(k),cm,lo+h/2,lm);
    // a worn nosing
    if(s.axis==='z')B.box(lw-.1,.05,.08,col(k).clone().multiplyScalar(1.15),lm,top-.02,c0+(Math.sign(d)<0?0:0)); } }
function buildProps(){
  const M=propMats(), r=U.rng(3311);
  const St=new Builder(), Tb=new Builder(), Ir=new Builder(), Cl=new Builder();
  const stoneC=()=>jit('#8a827b',r,.16), darkStone=()=>jit('#6b6560',r,.2), wood=()=>jit('#a08a74',r,.25), woodDk=()=>jit('#6e5a48',r,.2);
  const box=(B,w,h,d,c,x,y,z,ry)=>{ B.box(w,h,d,c,x,y,z,ry||0); };
  const col=(x,z,w,d,y0,y1,yaw)=>G.addBoxCollider({x:O.x+x,z:O.z+z,hw:w/2,hd:d/2,yaw:yaw||0,y0:O.y+y0-1,y1:O.y+y1});
  const circleCol=(x,z,rr,y0,y1)=>G.addCollider({x:O.x+x,z:O.z+z,r:rr,y0:O.y+y0-1,y1:O.y+y1});
  // --- stairs: treads for every stepped zone (the past stair belongs to the Glass: glass.js shows it)
  for(const Z of ZONES){ if(!Z.stair||Z.stair.past)continue;
    if(Z.stair.kind==='rubble'){ const s=Z.stair; for(let k=0;k<=s.n;k++){ const d=(s.a1-s.a0)/(s.n+1), c=s.a0+(k+.5)*d, top=s.y0+(s.y1-s.y0)*k/s.n;
        for(let q=0;q<3;q++)St.box(.6+r()*.5,top+5.6,.5+r()*.4,darkStone(),lerp(s.l0+.3,s.l1-.3,q/2)+(r()-.5)*.2,(top-5.6)/2,c+(r()-.5)*.2,r()*.6,(r()-.5)*.2,(r()-.5)*.2); } }
    else treadsFor(Z,St,()=>stoneC()); }
  // --- the trapdoor stair: stone steps up the north wall to the hatch, a rope rail, the hatch's square of night
  for(let k=0;k<6;k++){ const z=.9+k*.62, top=.55*(k+1); St.box(2.3,top,.64,stoneC(),0,top/2,z+.31); }
  St.box(2.6,.25,.25,darkStone(),0,3.4,4.35);
  Tb.box(1.8,.12,1.6,woodDk(),0,3.36,3.6).box(.12,.3,1.7,woodDk(),-.95,3.3,3.6).box(.12,.3,1.7,woodDk(),.95,3.3,3.6);
  { const nightM=new THREE.MeshBasicMaterial({color:C('#3b3150'),fog:false}); const nm=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.3),nightM); nm.rotation.x=PI/2; nm.position.set(0,3.45,3.6); ucRoot.add(nm); VIS.night=nm; }
  // sacks and a tally-board at the foot: the tithe came down this way
  for(let k=0;k<4;k++)Cl.sph(.38,jit('#9b8a6a',r,.2),-2.6+k*.5+(r()-.5)*.2,.3,2.6+(r()-.5)*.6,1,.8,1);
  Tb.box(.9,1.3,.08,woodDk(),3.95,1.2,1.4,PI/2); for(let k=0;k<7;k++)Ir.box(.02,.25,.02,jit('#2a2420',r),3.9,1.1+(k%2)*.05,1.05+k*.1);
  col(-2.2,2.6,2.2,1.2,0,.6);
  // --- the cellars: bays (west to east): the Fletchers (cooper), Rowe (Tamsin, the midwife), the Ashbys (weavers),
  //     the millers (Hob and Wren), Corwin the clerk. Shelves of jars, the supper table, broken-through rubble.
  const shelf=(x,z,len,yaw,levels)=>{ const ca=Math.cos(yaw), sa=Math.sin(yaw);
    for(let l=0;l<levels;l++){ const y=-2+.5+l*.62; Tb.box(len,.06,.42,wood(),x,y,z,yaw); }
    for(const s of [-1,1]) Tb.box(.08,levels*.62+.4,.42,woodDk(),x+ca*s*len/2,-2+(levels*.62+.4)/2,z-sa*s*len/2,yaw);
    col(x,z,len*Math.abs(ca)+.42*Math.abs(sa),.42*Math.abs(ca)+len*Math.abs(sa),-2,-2+levels*.62+.4);
    const jars=[]; for(let l=0;l<levels;l++)for(let q=0;q<Math.floor(len/.32);q++){ if(r()<.25)continue; const t=(q+.5)/Math.floor(len/.32)-.5, h=.16+r()*.16;
      jars.push([x+ca*t*len,-2+.53+l*.62+h/2,z-sa*t*len,h,.07+r()*.05]); } return jars; };
  const JARS=[];
  JARS.push(...shelf(-12,-33.4,4.6,0,3),...shelf(-6,-33.4,4.6,0,3),...shelf(6,-33.4,4.6,0,2),...shelf(14.4,-17,4,PI/2,3),...shelf(-14.4,-31,4,PI/2,2));
  // Fletchers (bay 1): barrels, hoops, staves
  for(const [x,z] of [[-13.8,-26.2],[-13.6,-24.9],[-12.4,-25.6],[-13.7,-22.6]]){ Tb.cyl(.42,.42,1.0,wood(),x,-1.5,z,10); Ir.cyl(.44,.44,.06,jit('#3a332e',r),x,-1.25,z,10).cyl(.44,.44,.06,jit('#3a332e',r),x,-1.75,z,10); circleCol(x,z,.45,-2,-1); }
  for(let k=0;k<5;k++)Tb.box(.08,1.2,.14,wood(),-10.4+k*.12,-1.45,-33.6,0,-.25);
  Ir.add(new THREE.TorusGeometry(.4,.025,5,16),jit('#3a332e',r),-11,-1.98,-29,0,PI/2);
  // Rowe (bay 2, Tamsin's): a cradle, swaddling, herbs drying on a line, a birthing stool
  Tb.box(.9,.35,.55,wood(),-7.6,-1.6,-31.6).add(new THREE.CylinderGeometry(.5,.5,.06,12,1,false,0,PI),woodDk(),-7.6,-1.85,-31.6,PI/2,0,PI/2,1,1,.9);
  Cl.box(.7,.12,.4,jit('#d8cfbf',r),-7.6,-1.38,-31.6);
  Tb.cyl(.25,.28,.4,wood(),-4.6,-1.8,-30.2,8).box(.08,.5,.08,woodDk(),-4.6,-1.3,-30.45);
  { const pts=[V(-8.6,1.0,-29.5),V(-6,.6,-29.5),V(-3.4,1.0,-29.5)]; Tb.add(tube(pts,.012,10,3),jit('#5b4a38',r));
    for(let k=0;k<7;k++){ const x=-8.2+k*.7; Cl.add(new THREE.ConeGeometry(.08,.4,5),jit(k%2?'#6f7b4a':'#8a7d4f',r),x,.55+Math.abs(x+6)*.12,-29.5,0,PI); } }
  col(-7.6,-31.6,.9,.6,-2,-1.4);
  // the Ashbys (bay 3): a loom frame, baskets of wool, the supper table with stools
  Tb.box(1.8,.1,.12,woodDk(),1.2,-.2,-32.8).box(1.8,.1,.12,woodDk(),1.2,-1.6,-32.8).box(.1,1.6,.12,woodDk(),.35,-1.2,-32.8).box(.1,1.6,.12,woodDk(),2.05,-1.2,-32.8);
  for(let k=0;k<14;k++)Cl.box(.025,1.35,.02,jit(k%3?'#8c6b78':'#b9a88c',r),.5+k*.11,-.9,-32.82);
  for(const [x,z,c] of [[-2,-32.6,'#b49a7a'],[-1.3,-33,'#8a6f7e']]){ Tb.cyl(.32,.26,.36,wood(),x,-1.82,z,10); Cl.sph(.26,jit(c,r),x,-1.62,z,1,.5,1); }
  Tb.box(2.2,.08,1.1,wood(),0,-1.22,-27).box(.1,.74,.1,woodDk(),-.95,-1.62,-26.6).box(.1,.74,.1,woodDk(),.95,-1.62,-26.6).box(.1,.74,.1,woodDk(),-.95,-1.62,-27.4).box(.1,.74,.1,woodDk(),.95,-1.62,-27.4);
  for(const [x,z] of [[-1.4,-27],[1.4,-27],[0,-28],[-.5,-25.9],[.6,-26]]) Tb.cyl(.18,.2,.45,wood(),x,-1.78,z,7);
  for(const [x,z] of [[-.6,-27.1],[.4,-26.8],[.1,-27.3]]){ Cl.cyl(.12,.09,.05,jit('#a69c8e',r),x,-1.15,z,10); }
  Cl.cyl(.05,.06,.18,jit('#6d6250',r),.8,-1.08,-27.2,6);
  col(0,-27,2.2,1.1,-2,-1.2);
  // the millers (bay 4, Hob and Wren): flour sacks, a child's straw doll, a carved toy mill-wheel, a ribbon on a nail
  for(let k=0;k<6;k++){ const x=4.2+(k%3)*.6, z=-31.8+(k>2?.6:0); Cl.sph(.36,jit('#cbbfa4',r,.12),x,-1.72+(k>2?0:0),z,1,.85,1); }
  col(4.8,-31.5,1.9,1.2,-2,-1.2);
  Cl.cyl(.05,.07,.32,jit('#d1b46a',r),7.6,-1.62,-21.4,6).sph(.07,jit('#d1b46a',r),7.6,-1.38,-21.4).box(.36,.04,.04,jit('#c0a35c',r),7.6,-1.56,-21.4);
  Tb.add(new THREE.TorusGeometry(.18,.03,5,10),wood(),6.2,-1.75,-20.8,.3,PI/2.4).box(.32,.03,.03,woodDk(),6.2,-1.75,-20.8,.3).box(.03,.32,.03,woodDk(),6.2,-1.75,-20.8,.3,0,0);
  Cl.box(.04,.5,.01,jit('#b6584a',r,.1),8.55,-.4,-21.0).box(.04,.42,.01,jit('#b6584a',r,.1),8.6,-.45,-21.0,0,0,.15);
  Tb.box(1.2,.75,.6,wood(),5.2,-1.62,-15.0); col(5.2,-15,1.2,.6,-2,-1.25);
  // Corwin the clerk (bay 5): a writing desk, ink pots, stacked ledgers and tally sticks, papers on the floor
  Tb.box(1.5,.08,.7,woodDk(),12.2,-1.2,-29.6).box(.08,.8,.6,woodDk(),11.5,-1.6,-29.6).box(.08,.8,.6,woodDk(),12.9,-1.6,-29.6);
  Tb.box(.5,.5,.5,woodDk(),12.2,-1.75,-28.6);
  for(let k=0;k<4;k++)Cl.box(.36,.08,.26,jit(['#5a3a2a','#3f3a50','#6a5130','#3d4a3a'][k],r),11.8+(k%2)*.12,-1.12+k*.08,-29.75,(r()-.5)*.3);
  Ir.cyl(.05,.06,.08,jit('#1c1820',r),12.6,-1.12,-29.4,6);
  for(let k=0;k<9;k++)Cl.box(.22,.006,.3,jit('#d6ccb6',r,.1),10.6+r()*3,-1.99,-28.2+r()*2.4,r()*3);
  col(12.2,-29.6,1.5,.7,-2,-1.15);
  // the knocked-through rubble at the pier gaps, and the collapse heaped against the east wall (the past door)
  const rubble=(x,z,n,sp,h)=>{ for(let k=0;k<n;k++){ const s=.18+r()*.35; St.add(new THREE.DodecahedronGeometry(s,0),jit(r()<.7?'#7a5c4c':'#7d7670',r,.3),x+(r()-.5)*sp,-2+s*.5*(h||1)+r()*.1,z+(r()-.5)*sp,r()*3,r()*3,r()*3); } };
  for(const x of [-9,-3,3,9]){ rubble(x,-27,6,1.2); rubble(x,-21,6,1.2); }
  // --- the root cellar: the rotten boards over the pit, the pit's walls, an old seed chest
  { const B=new Builder(); for(let z=TRAP.z0;z<TRAP.z1-.01;z+=.4){ B.box(TRAP.x1-TRAP.x0+.2,.06,.38,jit(r()<.3?'#5d4c3c':'#7b6650',r,.25),(TRAP.x0+TRAP.x1)/2,-2.03,z+.2,(r()-.5)*.04); }
    B.box(.14,.14,TRAP.z1-TRAP.z0,woodDk(),TRAP.x0+.5,-2.15,(TRAP.z0+TRAP.z1)/2).box(.14,.14,TRAP.z1-TRAP.z0,woodDk(),TRAP.x1-.5,-2.15,(TRAP.z0+TRAP.z1)/2);
    VIS.boards=B.mesh(M.timber,'ucTrapBoards'); ucRoot.add(VIS.boards); }
  for(const [x0,x1,z0,z1] of [[TRAP.x0-.25,TRAP.x0,TRAP.z0,TRAP.z1],[TRAP.x1,TRAP.x1+.25,TRAP.z0,TRAP.z1],[TRAP.x0,TRAP.x1,TRAP.z0-.25,TRAP.z0],[TRAP.x0,TRAP.x1,TRAP.z1,TRAP.z1+.25]])
    St.box(x1-x0,3.3,z1-z0,darkStone(),(x0+x1)/2,-3.6,(z0+z1)/2);
  Tb.box(1.1,.6,.6,woodDk(),-16.2,-1.7,-20.3); Ir.box(1.12,.06,.62,jit('#3a332e',r),-16.2,-1.45,-20.3); col(-16.2,-20.3,1.1,.6,-2,-1.4);
  // --- the chapel: pews, the font, the altar, the register on its lectern, the sexton's niche, the bell-ropes
  for(let row=0;row<6;row++){ const z=-44.6-row*1.45; for(const cx of [-24.1,-19.9]){ Tb.box(3,.08,.42,wood(),cx,-3.55,z).box(3,.6,.06,woodDk(),cx,-3.2,z+.24).box(.08,.45,.4,woodDk(),cx-1.45,-3.78,z).box(.08,.45,.4,woodDk(),cx+1.45,-3.78,z);
    col(cx,z+.05,3,.55,-4,-3.3); } }
  St.cyl(.55,.4,.25,stoneC(),-24.6,-3.88,-42.2,10).cyl(.22,.3,.7,stoneC(),-24.6,-3.4,-42.2,8).cyl(.62,.5,.4,stoneC(),-24.6,-2.88,-42.2,12);
  { const fw=new THREE.Mesh(new THREE.CircleGeometry(.48,16),new THREE.MeshBasicMaterial({color:C('#0c0b10')})); fw.rotation.x=-PI/2; fw.position.set(-24.6,-2.67,-42.2); ucRoot.add(fw); }
  circleCol(-24.6,-42.2,.62,-4,-2.6);
  St.box(3.2,1.05,1.1,stoneC(),-22,-3.47,-55.9).box(3.4,.12,1.25,darkStone(),-22,-2.92,-55.9); col(-22,-55.9,3.4,1.25,-4,-2.85);
  Cl.box(1.4,.02,1.0,jit('#5d3f55',r,.1),-22,-2.85,-55.75).box(.4,.6,.02,jit('#5d3f55',r,.1),-22,-3.15,-55.33);
  Tb.box(.6,.07,.45,woodDk(),-16.2,-2.75,-46.2,PI/2,0,.35).cyl(.07,.1,1.15,woodDk(),-16.2,-3.4,-46.2,6).cyl(.3,.35,.08,woodDk(),-16.2,-3.96,-46.2,8);
  Cl.box(.5,.05,.38,jit('#d8cfb8',r,.08),-16.15,-2.7,-46.2,PI/2,0,.35); circleCol(-16.2,-46.2,.4,-4,-2.7);
  // the sexton's niche: a shelf in the east wall, a brass hook, a lit cleft for the Glass
  St.box(1.3,.1,1.6,darkStone(),-13.25,-2.8,-51).box(.2,1.8,1.9,darkStone(),-12.6,-3.1,-51);
  // the bell-ropes from holes in the vault, with striped sallies
  const ropeTop=Cat(-27.6,-40.6)-.05; VIS.ropes=[];
  for(const p of ANCH.chapel.ropes){ const l=toLocal(p); Tb.add(tube([V(l.x,ropeTop,l.z),V(l.x+.02,(ropeTop-3)/2,l.z),V(l.x,-2.6,l.z)],.022,8,4),jit('#8a7350',r));
    for(let k=0;k<4;k++)Cl.cyl(.045,.045,.12,jit(k%2?'#b6584a':'#d9cfb6',r,.1),l.x,-2.4-k*.12,l.z,6);
    St.cyl(.12,.16,.1,darkStone(),l.x,ropeTop,l.z,8); }
  // the vestry: a robe chest, a cot (Wren sleeps here), a hook with a cloak
  Tb.box(1.8,.4,.8,wood(),-34.9,-3.62,-52.8).box(1.8,.08,.85,jit('#c9bda5',r),-34.9,-3.38,-52.8); col(-34.9,-52.8,1.8,.8,-4,-3.3);
  Cl.box(.5,.12,.35,jit('#d6ccb6',r),-34.3,-3.28,-52.8);
  Tb.box(1.2,.7,.55,woodDk(),-34.9,-3.65,-46.6); col(-34.9,-46.6,1.2,.55,-4,-3.3);
  Cl.box(.45,1.1,.06,jit('#4b3863',r,.1),-35.9,-2.6,-49.2,PI/2);
  // --- the mill: kerbs along the race, the plank bridge, the millstone on its bed, the hopper, the water wheel, sacks,
  //     sluice-gate frames along the race (the gates themselves are the puzzle's), the loft front and its broken stair
  for(const x of [RACE.x0-.15,RACE.x1+.15]){ St.box(.3,1.75,RACE.z1-RACE.z0,stoneC(),x,-6.8,(RACE.z0+RACE.z1)/2); }
  St.box(RACE.x1-RACE.x0,.6,RACE.z1-RACE.z0,darkStone(),(RACE.x0+RACE.x1)/2,-7.9,(RACE.z0+RACE.z1)/2);
  for(let x=RACE.x0-.3;x<RACE.x1+.3;x+=.32)Tb.box(.3,.1,2.3,wood(),x+.15,-6.05,-50,(r()-.5)*.03);
  Tb.box(.12,.9,.12,woodDk(),RACE.x0-.2,-5.6,-51.1).box(.12,.9,.12,woodDk(),RACE.x0-.2,-5.6,-48.9).box(.12,.9,.12,woodDk(),RACE.x1+.2,-5.6,-51.1).box(.12,.9,.12,woodDk(),RACE.x1+.2,-5.6,-48.9);
  for(const z of [-51.1,-48.9]) Tb.box(RACE.x1-RACE.x0+.5,.08,.08,woodDk(),(RACE.x0+RACE.x1)/2,-5.2,z);
  St.cyl(1.25,1.3,.4,darkStone(),19.8,-5.8,-52.6,16); circleCol(19.8,-52.6,1.35,-6,-4.6);
  { const rs=new Builder(); rs.cyl(1.15,1.15,.34,'#9a948c',0,0,0,18).cyl(.22,.22,.36,'#3b3532',0,0,0,8);
    for(let k=0;k<8;k++)rs.box(1.0,.02,.05,'#6e6a64',Math.cos(k*PI/4)*.6,.18,Math.sin(k*PI/4)*.6,-k*PI/4);
    VIS.runner=rs.mesh(M.stone,'ucRunner'); VIS.runner.position.set(19.8,-5.43,-52.6); ucRoot.add(VIS.runner); }
  Tb.box(.9,.6,.9,wood(),19.8,-4.3,-52.6,PI/4).box(.1,1.6,.1,woodDk(),19.0,-4.85,-51.8).box(.1,1.6,.1,woodDk(),20.6,-4.85,-53.4);
  Tb.cyl(.08,.08,6.2,woodDk(),22.9,-4.9,-52.6,6,0,0,PI/2);
  { const wb=new Builder(); wb.add(new THREE.TorusGeometry(1.25,.07,5,18),'#6e5a48',0,0,0,PI/2);
    for(let k=0;k<10;k++){ const a=k/10*TAU; wb.box(.04,.42,.9,'#8a7462',0,Math.cos(a)*1.3,Math.sin(a)*1.3,0,-a); wb.box(.05,2.5,.07,'#5b4a3c',0,0,0,0,a); }
    wb.cyl(.14,.14,.6,'#3b3532',0,0,0,8,0,0,PI/2);
    VIS.wheel=wb.mesh(M.timber,'ucWheel'); VIS.wheel.position.set(26.2,-6.75,-55.4); ucRoot.add(VIS.wheel); }
  for(const g of ANCH.mill.gates){ const l=toLocal(g); Tb.box(.14,1.8,.14,woodDk(),RACE.x0-.05,-5.9,l.z-.55).box(.14,1.8,.14,woodDk(),RACE.x0-.05,-5.9,l.z+.55).box(.14,.14,1.25,woodDk(),RACE.x0-.05,-5.05,l.z); }
  for(let k=0;k<9;k++){ const x=14.6+(k%3)*.62+(r()-.5)*.1, z=-58.9+((k/3)|0)*.66; Cl.sph(.36,jit('#cbbfa4',r,.12),x,-5.72+(k>5?.5:0),z,1,.85,1); }
  col(15.2,-58.2,2,2.2,-6,-5);
  St.box(5.6,3.2,.4,stoneC(),16.8,-4.6,-44.2).box(.4,3.2,4.2,stoneC(),19.8,-4.6,-42.1);                   // the loft's front
  Tb.box(5.6,.1,.12,woodDk(),16.8,-2.6,-44.3).box(.08,.9,.08,woodDk(),14.3,-2.55,-44.3).box(.08,.9,.08,woodDk(),19.3,-2.55,-44.3);
  for(let k=0;k<2;k++)St.box(2.4,.5*(k+1),.62,darkStone(),16.25,-6+.25*(k+1),-47.3+k*.5,0,0,(r()-.5)*.08);  // stubs of the stair that was
  rubble(16.2,-46.6,6,1.6,1); for(const s of St.list.slice(-6))s.geo.translate(0,-4,0);
  for(let k=0;k<5;k++)Cl.sph(.32,jit('#cbbfa4',r,.12),14.6+k*.55,-2.75,-40.6,1,.8,1);
  Tb.box(.9,.06,.6,wood(),17.6,-2.97,-41.2);
  // culvert grates where the race enters and leaves
  for(const z of [RACE.z1-.05,RACE.z0+.05]){ for(let k=0;k<6;k++)Ir.cyl(.035,.035,1.6,jit('#3a3236',r),RACE.x0+.2+k*.4,-6.9,z,5); Ir.box(2.5,.1,.1,jit('#3a3236',r),(RACE.x0+RACE.x1)/2,-6.15,z); }
  // the culvert grate in the cellars' east wall (Hob's sentence carries up the race)
  for(let k=0;k<5;k++)Ir.cyl(.03,.03,.7,jit('#3a3236',r),14.95,-1.62,-31.6+k*.2,5,0,0,0);
  // --- the store: grain bins, tithe sacks, the posts, the strongroom (lectern for the Tithe Ledger), the exit shaft
  for(const a of BIN_ANG){ const ar=a*PI/180, x=SC.x+Math.cos(ar)*13.3, z=SC.z+Math.sin(ar)*13.3, yaw=-ar+PI/2;
    Tb.box(2.4,1.5,1.5,wood(),x,-7.25,z,yaw).box(2.5,.1,1.6,woodDk(),x,-6.48,z,yaw);
    Cl.box(2.2,.2,1.3,jit('#b49a6a',r,.1),x,-6.55,z,yaw);
    G.addBoxCollider({x:O.x+x,z:O.z+z,hw:1.25,hd:.8,yaw,y0:O.y-9,y1:O.y-6.4}); }
  for(let k=0;k<22;k++){ const a=r()*TAU, d=10.5+r()*2.5; if(Math.abs(((a*180/PI)+360)%360-46)<16||Math.abs(((a*180/PI)+360)%360-228)<14||Math.abs(((a*180/PI)+360)%360-270)<12)continue;
    Cl.sph(.38,jit('#9b8a6a',r,.2),SC.x+Math.cos(a)*d,-7.7,SC.z+Math.sin(a)*d,1,.8,1); }
  for(const a of [45,135,225,315]){ const ar=a*PI/180, x=SC.x+Math.cos(ar)*8.5, z=SC.z+Math.sin(ar)*8.5; Tb.box(.95,.4,.95,woodDk(),x,-7.8,z); }
  Tb.box(.7,.07,.5,woodDk(),0,-6.95,-101.2,0,-.35).cyl(.08,.12,1.05,woodDk(),0,-7.5,-101.2,6).cyl(.32,.38,.08,woodDk(),0,-7.97,-101.2,8);
  circleCol(0,-101.2,.4,-8,-6.9);
  for(let k=0;k<4;k++)Tb.box(.06,3.6,.06,woodDk(),-14.55,-6.2,-92.6+k*.27).box(.06,.06,1.0,woodDk(),-14.55,-7.6+k*.9,-92.2);
  for(let k=0;k<6;k++)Tb.box(.08,.06,.85,woodDk(),-14.5,-7.5+k*.6,-92.2);
  // --- merge
  const add=(B,mat,name)=>{ const m=B.mesh(mat,name); if(m)ucRoot.add(m); return m; };
  VIS.stone=add(St,M.stone,'ucStone'); VIS.timber=add(Tb,M.timber,'ucTimber'); VIS.iron=add(Ir,M.iron,'ucIron'); VIS.cloth=add(Cl,M.cloth,'ucCloth');
  // jars (instanced)
  { const jg=new THREE.CylinderGeometry(.85,1,1,8); jg.translate(0,0,0);
    const jm=new THREE.InstancedMesh(jg,G.toon('#ffffff'),JARS.length); const q=new THREE.Quaternion(), cc=new Float32Array(JARS.length*3), tcc=new THREE.Color();
    const pal=['#7a5c3e','#5b6a52','#8a7d6a','#6b4e57','#a08a5c','#4e5a66'];
    JARS.forEach((j,i)=>{ _m4.compose(V(j[0],j[1],j[2]),q,V(j[4],j[3],j[4])); jm.setMatrixAt(i,_m4); tcc.set(pal[(r()*pal.length)|0]).convertSRGBToLinear(); cc[i*3]=tcc.r; cc[i*3+1]=tcc.g; cc[i*3+2]=tcc.b; });
    jm.instanceColor=new THREE.InstancedBufferAttribute(cc,3); jm.name='ucJars'; ucRoot.add(jm); }
  // switchable: the portcullis, the strongroom door, the exit grate
  { const pc=new Builder(); for(let k=-3;k<=3;k++)pc.box(.08,3.4,.08,'#3a3640',0,1.7,k*.42); for(const y of [.4,1.5,2.6,3.3])pc.box(.1,.1,3,'#3a3640',0,y,0); for(let k=-3;k<=3;k++)pc.cyl(.03,.06,.22,'#3a3640',0,-.08,k*.42,4);
    VIS.portcullis=pc.mesh(M.iron,'ucPortcullis'); VIS.portcullis.position.set(11.4,-8,-68); ucRoot.add(VIS.portcullis);
    const sd=new Builder(); for(let k=0;k<6;k++)sd.box(.4,2.7,.12,'#5a4634',-1+k*.4+.2,1.35,0); sd.box(2.4,.14,.16,'#3a3640',0,.5,0).box(2.4,.14,.16,'#3a3640',0,2.2,0).cyl(.08,.08,.04,'#c8a24c',.7,1.35,.1,8,0,PI/2);
    VIS.strongDoor=sd.mesh(M.timber,'ucStrongDoor'); VIS.strongDoor.position.set(1.2,-8,-96); ucRoot.add(VIS.strongDoor);
    const eg=new Builder(); for(let k=-3;k<=3;k++)eg.cyl(.04,.04,3,'#3a3236',0,1.5,k*.38,5); for(const y of [.4,1.5,2.6])eg.box(.08,.08,2.7,'#3a3236',0,y,0);
    VIS.exitGrate=eg.mesh(M.iron,'ucExitGrate'); VIS.exitGrate.position.set(-10.9,-8,-92.2); ucRoot.add(VIS.exitGrate); }
  VIS.built=true; updateGateVis(true);
}
function updateGateVis(snap,dt){
  if(!VIS.built)return; dt=dt||0;
  const d=(cur,tgt,k)=>snap?tgt:U.damp(cur,tgt,k,dt);
  VIS.portcullis.position.y=d(VIS.portcullis.position.y,S.gates.portcullis?-4.3:-8,1.2);
  VIS.strongDoor.rotation.y=d(VIS.strongDoor.rotation.y,S.gates.strongroom?-1.9:0,1.5);
  VIS.exitGrate.position.y=d(VIS.exitGrate.position.y,S.gates.exit?-11.2:-8,1.4);
  VIS.boards.visible=!S.trap;
}

/* ---------- roots: through the brick, down from the vaults (one merged mesh) ---------- */
function wallPoints(n,seed,test){ const r=U.rng(seed), out=[]; let tries=0;
  while(out.length<n&&tries<n*80){ tries++; const x=GX0+r()*(BOX.x1-BOX.x0), z=GZ0+r()*(BOX.z1-BOX.z0); const s=Sat(x,z); if(s<-.05||s>.25)continue;
    const e=.2, gx=Sat(x+e,z)-Sat(x-e,z), gz=Sat(x,z+e)-Sat(x,z-e), gl=Math.hypot(gx,gz)||1; const nx=-gx/gl, nz=-gz/gl;
    const p={x:x+nx*(s+.04),z:z+nz*(s+.04),nx,nz}; p.f=Fat(p.x+nx*.3,p.z+nz*.3); p.c=Cat(p.x+nx*.2,p.z+nz*.2); if(p.c-p.f<1.5)continue; if(test&&!test(p,r))continue; out.push(p); }
  return out; }
function buildRoots(){
  const B=new Builder(), r=U.rng(4242);
  const rc=()=>jit(r()<.3?'#2a2030':'#4a3a2c',r,.3);
  for(const p of wallPoints(46,77)){ // a root breaks out high on the wall and creeps down, branching
    let x=p.x, y=p.c-.1-r()*.4, z=p.z; const pts=[V(x-p.nx*.1,y+.3,z-p.nz*.1)]; const tx=p.nz, tz=-p.nx; let side=(r()-.5)*.6;
    const len=2+r()*3.5; for(let k=0;k<6;k++){ side+=(r()-.5)*.5; y-=len/6; pts.push(V(x+tx*side+p.nx*(.05+r()*.08),y,z+tz*side+p.nz*(.05+r()*.08))); if(y<p.f+.3)break; }
    B.add(tube(pts,.05+r()*.06,14,5),rc());
    if(r()<.7){ const k=1+((r()*(pts.length-2))|0), a=pts[k]; const b=[a.clone()]; let yy=a.y, ss=0;
      for(let q=0;q<3;q++){ ss+=(r()<.5?-1:1)*(.25+r()*.3); yy-=.35+r()*.4; b.push(V(a.x+tx*ss+p.nx*.06,yy,a.z+tz*ss+p.nz*.06)); }
      B.add(tube(b,.025+r()*.02,8,4),rc()); } }
  // hanging tendrils from the vaults
  const rr=U.rng(91); let n=0;
  for(let t=0;t<4000&&n<70;t++){ const x=GX0+rr()*(BOX.x1-BOX.x0), z=GZ0+rr()*(BOX.z1-BOX.z0); if(Sat(x,z)>-.6)continue; const c=Cat(x,z), f=Fat(x,z); if(c-f<3)continue;
    const L=.4+rr()*Math.min(1.3,c-f-2.4); B.add(tube([V(x,c+.1,z),V(x+(rr()-.5)*.15,c-L*.5,z+(rr()-.5)*.15),V(x+(rr()-.5)*.25,c-L,z+(rr()-.5)*.25)],.018+rr()*.02,6,3),rc()); n++; }
  const m=B.mesh(propMats().root,'ucRoots'); if(m)ucRoot.add(m);
}

/* ---------- candles: wax + flames (points) + a warm glow; three pooled lights for lit rooms ---------- */
const pool=[]; let flamePts=null, glowPts=null;
function buildCandles(){
  const B=new Builder(), Ir=new Builder(), r=U.rng(77);
  const fpos=[], fa=[], gpos=[], ga=[];
  CANDLES.forEach((c,i)=>{ const p=c.l, nx=c.n[0], nz=c.n[1], h=c.h, base=c.top;
    B.cyl(.06,.07,h,jit('#e6dcc4',r,.08),p.x,base+h/2,p.z,8).cyl(.075,.06,.04,jit('#d6c8a8',r,.08),p.x+.03,base+.03,p.z,8).cyl(.006,.006,.06,'#2a2018',p.x,base+h+.02,p.z,3);
    if(c.kind==='sconce'){ Ir.cyl(.12,.1,.05,'#2f2a2c',p.x,base-.025,p.z,8).box(.05,.05,.4,'#2f2a2c',p.x-nx*.2,base-.05,p.z-nz*.2,Math.atan2(nx,nz)).box(.05,.42,.05,'#2f2a2c',p.x-nx*.38,base-.24,p.z-nz*.38); }
    if(c.kind==='pricket'){ const f=p.y; Ir.cyl(.03,.045,1.25,'#2f2a2c',p.x,f+.625,p.z,6).cyl(.2,.24,.05,'#2f2a2c',p.x,f+.03,p.z,8).cyl(.11,.08,.05,'#2f2a2c',p.x,base-.02,p.z,8);
      for(let k=0;k<3;k++){ const a=k/3*TAU; Ir.box(.03,.03,.32,'#2f2a2c',p.x+Math.cos(a)*.13,f+.08,p.z+Math.sin(a)*.13,-a+PI/2,.5); }
      G.addCollider({x:O.x+p.x,z:O.z+p.z,r:.25,y0:O.y+f-1,y1:O.y+f+1.4}); }
    fpos.push(c.flame.x,c.flame.y,c.flame.z); fa.push(0); gpos.push(c.flame.x+nx*.12,c.flame.y,c.flame.z+nz*.12); ga.push(0);
    c.idx=i; });
  const m1=B.mesh(propMats().wax,'ucWax'); ucRoot.add(m1); const m2=Ir.mesh(propMats().iron,'ucSconces'); ucRoot.add(m2);
  const mk=(pos,al,size,col,ptsMat)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('alpha',new THREE.Float32BufferAttribute(al,1));
    const pm=new THREE.ShaderMaterial({uniforms:{uMap:{value:ptsMat},uTime:tUni.uTime,uC:{value:C(col)}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:`attribute float alpha;varying float vA;uniform float uTime;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vA=alpha*(.88+.12*sin(uTime*9.+position.x*7.)+.06*sin(uTime*23.+position.z));gl_PointSize=${size.toFixed(1)}*(.6+.4*alpha)/-mv.z;gl_Position=projectionMatrix*mv;}`,
      fragmentShader:'uniform sampler2D uMap;uniform vec3 uC;varying float vA;void main(){vec4 t=texture2D(uMap,gl_PointCoord);gl_FragColor=vec4(uC*t.a*vA*1.6,1.);}'});
    const pts=new THREE.Points(g,pm); pts.frustumCulled=false; ucRoot.add(pts); return g; };
  flamePts=mk(fpos,fa,95,'#ffcf7a',G.tex.flame||G.tex.soft); glowPts=mk(gpos,ga,900,'#ff9c48',G.tex.soft);
  for(let i=0;i<3;i++){ const L=new THREE.PointLight(0xffb066,0,15,1.7); L.position.set(0,-50,0); ucRoot.add(L); pool.push(L); }
  // a dim warm fill around the Traveler, so you never vanish on a black floor (no shadow, short reach)
  VIS.fill=new THREE.PointLight(0xffc89a,0,7,2); ucRoot.add(VIS.fill);
}
function updateCandles(dt){
  const t=G.time, P=G.player.pos, lx=P.x-O.x, lz=P.z-O.z;
  if(flamePts){ const a=flamePts.attributes.alpha, g=glowPts.attributes.alpha;
    CANDLES.forEach((c,i)=>{ const lit=S.lit.has(c.room); a.array[i]=U.damp(a.array[i],lit?1:0,3,dt); g.array[i]=U.damp(g.array[i],lit?.55:0,2,dt); });
    a.needsUpdate=true; g.needsUpdate=true; }
  const cand=[]; for(const id of S.lit) for(const p of LIGHTS[id]) cand.push([Math.hypot(p.x-lx,p.z-lz),p]);
  cand.sort((a,b)=>a[0]-b[0]);
  for(let i=0;i<pool.length;i++){ const L=pool[i], c=cand[i]; if(c&&S.inside&&c[0]<40){ L.position.copy(c[1]); L.intensity=U.damp(L.intensity,1.7*(.9+.08*Math.sin(t*7+i*2)+.05*Math.sin(t*17+i)),4,dt); }
    else L.intensity=U.damp(L.intensity,0,4,dt); }
  if(VIS.fill){ VIS.fill.position.set(lx,P.y-O.y+1.6,lz); const litR=S.room&&S.lit.has(S.room); VIS.fill.intensity=S.inside?(litR?.25:.45):0; }
}
function candleLabel(c){
  if(S.lit.has(c.room))return null;
  if(!S.freeUsed)return 'Light the candle';
  const e=etherUnits(), n=vials();
  if(!n||e<CANDLE_COST)return 'Light the candle · needs '+CANDLE_COST+' ether'+(n?' (you have '+e+')':' — no vials');
  return 'Light the candle · '+CANDLE_COST+' ether';
}
const CANDLE_COST=5;
const etherUnits=()=>G.alchemy?G.alchemy.etherUnits|0:0, vials=()=>G.inv?G.inv.count('vial'):0;
function spendEther(units){ // as cave_puzzles: take units out of the vials; the vial count shrinks with what's left
  const A=G.alchemy; if(!A||!G.inv)return false;
  const n=vials(); if(!n||A.etherUnits<units)return false;
  A.etherUnits-=units;
  const keep=A.etherUnits>0?Math.min(n,Math.ceil(A.etherUnits/CANDLE_COST)):0;
  if(keep<n)G.inv.take('vial',n-keep); else G.emit('inv:change',{id:'vial',n:0,total:n});
  return true;
}
/** light a candle by id ('chapel:1') or a whole room by id ('chapel'); the room stays lit. o.free / o.restored */
function lightCandle(id,o){ o=o||{};
  const c=CANDLES.find(q=>q.id===id), roomId=c?c.room:id;
  if(!ROOMDEF[roomId]||S.lit.has(roomId))return false;
  S.lit.add(roomId);
  if(!o.restored){ G.emit('undercroft:lit',{room:roomId,candle:c?c.id:null}); if(G.ink&&G.ink.burst&&c)try{G.ink.burst(c.world,{n:0,embers:18,speed:1.6});}catch(_){} }
  return true;
}
function useCandle(c){
  if(S.lit.has(c.room))return;
  if(!S.freeUsed){ S.freeUsed=true; lightCandle(c.id);
    setTimeout(()=>G.ui.say('The wick drinks a breath of ether from your lantern and catches, warm and steady. Light spreads along the brick. The other candles down here are cold — they’ll want ether of your own, '+CANDLE_COST+' units a candle, brewed at the alchemy table.'),500);
    return; }
  if(!spendEther(CANDLE_COST)){
    G.ui.say(vials()?'Not enough ether left in your vials. A candle wants '+CANDLE_COST+' — brew more at the alchemy table.':'The wick is cold and thirsty. A vial of ether — '+CANDLE_COST+' units, brewed at the alchemy table — would light it, and the room with it.',{priority:'high',key:'ucCandle'});
    G.emit('undercroft:candleDry',{room:c.room}); return; }
  lightCandle(c.id);
  G.ui.toast('The candle catches','−'+CANDLE_COST+' ether · '+ROOMDEF[c.room].name+' is lit');
}
function roostPoints(id){
  const R=ROOMDEF[id]; if(!R)return [];
  const b=R.b[0], r=U.rng(id.length*31+7), out=[];
  for(let t=0;t<2000&&out.length<40;t++){ const x=lerp(b[0],b[1],r()), z=lerp(b[2],b[3],r()); if(Sat(x,z)>-.4||Sat(x,z)<-2.4)continue; if(roomAtL(x,z)!==id)continue;
    const c=Cat(x,z); const e=.2, gx=Sat(x+e,z)-Sat(x-e,z), gz=Sat(x,z+e)-Sat(x,z-e), gl=Math.hypot(gx,gz)||1;
    out.push({p:toWorld(x,c-.06,z),n:V(-gx/gl*.3,-1,-gz/gl*.3).normalize()}); }
  return out; }

/* ---------- water in the race (one plane), flowing ---------- */
function buildWater(){
  const m=new THREE.ShaderMaterial({uniforms:{uTime:tUni.uTime},transparent:true,depthWrite:false,
    vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform float uTime;varying vec3 vP;
      float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}
      void main(){ vec2 q=vec2(vP.x*2.,vP.y*.7+uTime*1.6); float w=vn(q)+.5*vn(q*2.3+3.);
        vec3 c=mix(vec3(.01,.025,.03),vec3(.05,.09,.1),w*.6); c+=vec3(.25,.2,.12)*smoothstep(.95,1.3,w)*.35;
        gl_FragColor=vec4(c,.86); }`});
  const g=new THREE.PlaneGeometry(RACE.x1-RACE.x0,RACE.z1-RACE.z0); const w=new THREE.Mesh(g,m); w.rotation.x=-PI/2; w.position.set((RACE.x0+RACE.x1)/2,-6.75,(RACE.z0+RACE.z1)/2); w.renderOrder=2; ucRoot.add(w);
}

/* ---------- the trapdoor on the island ---------- */
function buildIslandDoor(){
  const M=propMats(), r=U.rng(5150), y=doorPos.y, yaw=doorLM.yaw||0;
  isleRoot.position.copy(doorPos); isleRoot.rotation.y=yaw;
  const St=new Builder(), Tb=new Builder();
  St.box(2.3,.22,.3,'#837b72',0,.06,-.98).box(2.3,.22,.3,'#837b72',0,.06,.98).box(.3,.22,2.2,'#837b72',-1.0,.06,0).box(.3,.22,2.2,'#837b72',1.0,.06,0);
  for(let k=0;k<3;k++)St.box(1.5,.3,.5,'#6e6862',0,-.35-k*.5,.5-k*.5);
  isleRoot.add(St.mesh(M.stone,'ucDoorFrame'));
  const hole=new THREE.Mesh(new THREE.PlaneGeometry(1.7,1.7),new THREE.MeshBasicMaterial({color:C('#050407')})); hole.rotation.x=-PI/2; hole.position.y=-.02; isleRoot.add(hole);
  // two hatch leaves hinged on the long sides
  VIS.leaves=[];
  for(const s of [-1,1]){ const B=new Builder(); // a leaf hinged on the frame's long side (x = s*.86), lying inward
    for(let k=0;k<4;k++)B.box(.85,.08,.42,jit('#6e5a48',r,.2),-s*.43,0,-.66+k*.44); B.box(.1,.1,1.75,'#3a3236',-s*.12,.06,0).box(.1,.1,1.75,'#3a3236',-s*.74,.06,0);
    B.add(new THREE.TorusGeometry(.09,.02,5,10),'#3a3236',-s*.62,.08,0,0,PI/2);
    const g=new THREE.Group(); g.add(B.mesh(M.timber)); g.position.set(s*.86,.13,0); g.userData.s=s; isleRoot.add(g); VIS.leaves.push(g); }
  // ink roots binding the hatch (wither when the well is cured)
  const rootM=G.toon('#1a1020',{emissive:'#2a1240',emissiveIntensity:.35}); const RB=new Builder();
  for(let k=0;k<7;k++){ const a=r()*TAU, pts=[]; let x=Math.cos(a)*1.9, z=Math.sin(a)*1.9; pts.push(V(x,-.1,z));
    for(let q=0;q<4;q++){ x*=.62; z*=.62; x+=(r()-.5)*.4; z+=(r()-.5)*.4; pts.push(V(x,.18+r()*.15,z)); } pts.push(V(-pts[1].x*.5,.15,-pts[1].z*.5));
    RB.add(tube(pts,.06+r()*.04,14,5),'#ffffff'); }
  VIS.doorRoots=RB.mesh(rootM,'ucDoorRoots'); isleRoot.add(VIS.doorRoots);
  VIS.doorOpenK=S.open?1:0; setDoorVis(VIS.doorOpenK);
}
function setDoorVis(k){ if(!VIS.leaves)return;
  for(const g of VIS.leaves){ g.rotation.z=-g.userData.s*k*1.9; }
  VIS.doorRoots.visible=k<.98; VIS.doorRoots.scale.setScalar(Math.max(.01,1-k)); VIS.doorRoots.position.y=-k*.25; }

/* ================================================================ 8. LIGHTING (inside) */
const FOG0=C('#040305'), FOG1=C('#1a1310'), HEMI_SKY=C('#6e6070'), HEMI_GND=C('#1c1614'), HEMI_LIT=C('#c09070');

/* ================================================================ 9. TRANSITIONS */
const fadeEl=()=>document.getElementById('fade');
function startTrans(dir,roomId,o){
  o=o||{}; if(S.trans)return false;
  if(o.instant){ doTeleport(dir,roomId); return true; }
  S.trans={dir,room:roomId,t:0,done:false};
  const f=fadeEl(); if(f)f.style.opacity='1';
  if(G.player.setControl)G.player.setControl(false);
  G.emit(dir==='in'?'undercroft:entering':'undercroft:leaving',{room:roomId});
  return true;
}
function updateTrans(dt){
  const T=S.trans; if(!T)return; T.t+=dt;
  if(!T.done&&T.t>=.9){ T.done=true; doTeleport(T.dir,T.room); const f=fadeEl(); if(f)f.style.opacity='0'; }
  if(T.t>=1.35){ if(G.player.setControl)G.player.setControl(true); S.trans=null; }
}
function arrivalFor(roomId){ const s=(ROOMDEF[roomId]||ROOMDEF.stair).spawn; const f=zoneFloor(s[0],s[2],s[1]+.5); return [s[0],f==null?s[1]:f,s[2],s[3]]; }
const outsideSpot=()=>{ const yaw=doorLM.yaw||0, lx=1.75, lz=.1;  // beside the hatch, on the ruin's floor
  const x=doorPos.x+lx*Math.cos(yaw)+lz*Math.sin(yaw), z=doorPos.z-lx*Math.sin(yaw)+lz*Math.cos(yaw); return [x,G.world.height(x,z),z,yaw+PI/2]; };
function shiftSwarm(delta,to,from){
  const P=from||G.player.pos, ms=(G.creatures&&G.creatures.moths)||[];
  for(const m of ms){ if(!m||!m.p||!SWARM.has(m.tgt))continue; if(m.p.distanceTo(P)>45)continue;
    m.p.add(delta); if(m.feedC&&m.feedC.isVector3&&m.feedC.distanceTo(P)<45)m.feedC.add(delta); }
  for(const fn of transferHooks){ try{fn(delta,{to});}catch(e){console.error('undercroft transfer',e);} }
}
function doTeleport(dir,roomId){
  const P=G.player, from=P.pos.clone();
  if(dir==='in'&&G.cave&&G.cave.inside&&G.cave.exit){ const CS=G.cave._debug&&G.cave._debug.S; if(CS)CS.trans=null; G.cave.exit({instant:true}); }
  let dest, yaw;
  if(dir==='in'){ const a=arrivalFor(roomId||'stair'); dest=toWorld(a[0],a[1],a[2]); yaw=a[3];
    if(!S.prevCp&&!inBoxW(G.state.checkpoint.x,G.state.checkpoint.z)){ S.prevCp={p:G.state.checkpoint.clone(),yaw:G.state.checkpointYaw,name:G.state.checkpointName}; }
    const sa=arrivalFor('stair'); G.state.checkpoint.copy(toWorld(sa[0],sa[1],sa[2])); G.state.checkpointYaw=sa[3]; G.state.checkpointName='the trapdoor stair';
  }else{ const o=outsideSpot(); dest=V(o[0],o[1],o[2]); yaw=o[3];
    if(S.prevCp){ G.state.checkpoint.copy(S.prevCp.p); G.state.checkpointYaw=S.prevCp.yaw; G.state.checkpointName=S.prevCp.name; S.prevCp=null; }
    else if(inBoxW(G.state.checkpoint.x,G.state.checkpoint.z)){ G.state.checkpoint.copy(dest); G.state.checkpointYaw=yaw; G.state.checkpointName='the hamlet trapdoor'; } }
  P.teleport(dest.x,dest.y,dest.z,yaw);
  if(P.aimCamera)P.aimCamera(yaw,.3);
  const delta=P.pos.clone().sub(from);
  shiftSwarm(delta,dir==='in'?'undercroft':'island',from);
  setInside(dir==='in');
  G.atmo.dark=G.atmo.darkTarget=dir==='in'?1:0;
  S.lastPresent.copy(P.pos);
  if(dir==='in'){ const r=roomId||'stair'; if(r!=='stair'&&ROOMDEF[r])S.reached.add(r); }
}

/* ---------- checkpoints: the deepest rise spot you've stood in that has an open way back to the stair ---------- */
const CP_SPOTS=[ // [region it stands for, local x,y,z, yaw, name] in depth order
  ['cellars',0,-2,-16.4,PI,'the joined cellars'],['chapel',-22,-4,-40.4,PI,'the crypt chapel'],
  ['mill',22,-6,-42,PI,'the mill-race'],['store',13.6,-8,-68,-PI/2,'the door of the tithe store']];
const regionAt=(x,z)=>roomAtL(x,z);
function connected(){
  const L=[['stair','cellars',true],['cellars','chapel',true],['cellars','mill',glassOwned()],['mill','store',S.gates.portcullis],['store','stair',S.gates.exit]];
  const out=new Set(['stair']); let grew=true;
  while(grew){ grew=false; for(const [a,b,o] of L){ if(!o)continue; if(out.has(a)&&!out.has(b)){out.add(b);grew=true;} else if(out.has(b)&&!out.has(a)){out.add(a);grew=true;} } }
  return out; }
function setCheckpointL(x,y,z,yaw,name){ const c=G.state.checkpoint, w=toWorld(x,y,z);
  if(c.distanceToSquared(w)>1e-4)c.copy(w); G.state.checkpointYaw=yaw; G.state.checkpointName=name; }
function bestCheckpoint(conn){ conn=conn||connected();
  for(let i=CP_SPOTS.length-1;i>=0;i--){ const c=CP_SPOTS[i]; if(!S.reached.has(c[0])||!conn.has(regionAt(c[1],c[3])))continue;
    const f=zoneFloor(c[1],c[3],c[2]+1); return [c[1],f==null?c[2]:f,c[3],c[4],c[5]]; }
  const a=arrivalFor('stair'); return [a[0],a[1],a[2],a[3],'the trapdoor stair']; }
function trackFooting(dt,conn){
  const P=G.player; if(!P.alive||P.grounded===false||G.state.mode!=='play'){ S.footT=0; return; }
  const lx=P.pos.x-O.x, ly=P.pos.y-O.y, lz=P.pos.z-O.z, f=zoneFloor(lx,lz,ly+.3);
  if(f==null||Math.abs(ly-f)>.3||!presentAt(lx,lz)){ S.footT=0; return; }
  const reg=regionAt(lx,lz); if(!reg||!conn.has(reg)){ S.footT=0; return; }
  if(reg!==S.footReg){ S.footReg=reg; S.footT=0; } S.footT+=dt;
  if(S.footT>.6&&!S.reached.has(reg)&&CP_SPOTS.some(c=>c[0]===reg)){ S.reached.add(reg); G.emit('undercroft:reached',{region:reg}); }
}
let cpT=0;
function updateCheckpoint(dt){
  cpT-=dt; if(cpT>0)return; const step=.2-cpT; cpT=.2;
  const conn=connected(); trackFooting(step,conn);
  const b=bestCheckpoint(conn); setCheckpointL(b[0],b[1],b[2],b[3],b[4]);
  const P=G.player, reg=regionAt(P.pos.x-O.x,P.pos.z-O.z);
  S.stranded=!!reg&&!conn.has(reg);
  if(S.stranded&&!S.said.draught){ S.said.draught=1; G.ui.say('A dry draught slips past you toward the stair, through cracks in the brick too narrow for you. You could follow it back.',{priority:'high'}); }
}
function followDraught(){
  if(!S.inside||S.trans)return false;
  G.emit('undercroft:draught',{from:regionAt(G.player.pos.x-O.x,G.player.pos.z-O.z)});
  return startTrans('in','stair');
}

/* ---------- the past layer: lowered mid-way through the past, you're eased back to the present floor ---------- */
function updatePast(dt){
  const P=G.player; if(!P||!P.alive||S.trans)return;
  const lx=P.pos.x-O.x, lz=P.pos.z-O.z, ly=P.pos.y-O.y;
  const pf=zoneFloor(lx,lz,ly+.3,'monster');                                  // the present floor under you
  const onPresent=presentAt(lx,lz)&&Sfield(lx,lz,'monster')<-.25&&pf!=null&&Math.abs(ly-pf)<.4;
  if(S.push){ const Pu=S.push; Pu.t+=dt; const k=smooth(0,1,Pu.t/Pu.dur);
    P.pos.x=lerp(Pu.from.x,Pu.to.x,k); P.pos.z=lerp(Pu.from.z,Pu.to.z,k); P.pos.y=lerp(Pu.from.y,Pu.to.y,k);
    if(Pu.t>=Pu.dur){ S.push=null; if(P.setControl)P.setControl(true); P.teleport(Pu.to.x,Pu.to.y,Pu.to.z,P.heading); } return; }
  if(onPresent&&P.grounded!==false){ S.lastPresent.copy(P.pos); return; }
  if(glassUp())return;
  // on a past floor (or inside a past doorway) with the Glass lowered: the present isn't here
  const inPast=zonesAt(lx,lz).some(Z=>Z.past)&&!(presentAt(lx,lz)&&pf!=null&&ly<pf+.45);
  if(!inPast)return;
  const to=S.lastPresent.clone(); if(to.distanceTo(P.pos)>14||!inBoxW(to.x,to.z)){ const c=bestCheckpoint(); to.copy(toWorld(c[0],c[1],c[2])); }
  S.push={t:0,dur:.7,from:P.pos.clone(),to}; if(P.setControl)P.setControl(false);
  G.emit('undercroft:pastPush',{from:S.push.from.clone(),to:to.clone()});
  if(!S.said.push){ S.said.push=1; G.ui.say('The old doorway goes thin as breath around you, and the present eases you back where the floor is real.',{priority:'normal'}); }
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
    S.farPrev=G.camera.far; G.camera.far=140; G.camera.updateProjectionMatrix();
  }else{ for(const o of S.hidden)o.visible=true; S.hidden.length=0; G.camera.far=S.farPrev||1200; G.camera.updateProjectionMatrix(); }
}
function setInside(v){
  if(v===S.inside)return;
  S.inside=v; API.inside=v; G.interior=v?INTERIOR:(G.interior===INTERIOR?null:G.interior);
  ucRoot.visible=v; isleRoot.visible=!v; hideIsland(v);
  if(G.renderer&&G.renderer.shadowMap){ G.renderer.shadowMap.autoUpdate=!v; if(!v)G.renderer.shadowMap.needsUpdate=true; }
  if(v){ S.room=room(G.player.pos)||'stair'; setRoost(true); G.emit('undercroft:enter',{room:S.room}); }
  else{ S.room=null; S.push=null; setRoost(false); G.emit('undercroft:exit',{}); }
}
/* recruitment like the cave roost: while you're down here the roost-born moths cling to the cellars' vault */
let roostPrev=null;
function setRoost(on){ const Cr=G.creatures; if(!Cr||!Cr.setRoost||!Cr.roost)return;
  try{ if(on){ roostPrev=Cr.roost.pts.slice(); Cr.setRoost(roostPoints('cellars')); } else if(roostPrev){ Cr.setRoost(roostPrev); roostPrev=null; } }catch(e){ console.error('undercroft roost',e); } }

/* ---------- opening the trapdoor ---------- */
function openDoor(restored){
  if(S.open)return; S.open=true; API.open=true;
  if(restored){ VIS.doorOpenK=1; setDoorVis(1); }
  G.emit('undercroft:open',{restored:!!restored,pos:doorPos.clone()});
}
G.on('blight:cured',e=>{ if(e&&e.id==='well')openDoor(!!e.restored); });

/* ---------- the trap: rotten boards over the root-cellar pit ---------- */
function springTrap(o){
  if(S.trap)return false; S.trap=true; if(VIS.built)VIS.boards.visible=false;
  if(!(o&&o.restored)){ G.emit('undercroft:trap',{pos:ANCH.cellars.pit.clone()});
    if(G.ink&&G.ink.burst)try{ G.ink.burst(ANCH.cellars.trap,{n:30,speed:3,size:[.6,1.6],life:[.6,1.4],up:1,embers:0,drops:0}); }catch(_){}
    if(G.ui.shake)G.ui.shake(.4); }
  return true; }
let trapT=0;
function updateTrap(dt){
  if(S.trap)return; const P=G.player, lx=P.pos.x-O.x, lz=P.pos.z-O.z;
  if(inTrap(lx,lz)&&Math.abs(P.pos.y-O.y+2)<.4&&TRAP_ARMED()){ trapT+=dt; if(trapT>.35)springTrap(); } else trapT=0; }
/* the People agent can disarm or arm it (Corwin's lie): G.undercroft.trapArmed = () => bool */
const TRAP_ARMED=()=>typeof API.trapArmed==='function'?!!API.trapArmed():true;

/* ================================================================ 11. PERSISTENCE */
if(G.persist&&G.persist.register) G.persist.register('undercroft',{
  save:()=>({v:1,open:S.open,lit:[...S.lit],reached:[...S.reached],gates:Object.assign({},S.gates),trap:S.trap,freeUsed:S.freeUsed,mill:S.mill,
    prevCp:S.prevCp?{p:[+S.prevCp.p.x.toFixed(2),+S.prevCp.p.y.toFixed(2),+S.prevCp.p.z.toFixed(2)],yaw:S.prevCp.yaw||0,name:S.prevCp.name||''}:null}),
  load:(d)=>{ if(!d)return;
    if(d.open)openDoor(true);
    S.lit=new Set((d.lit||[]).filter(id=>ROOMDEF[id]));
    S.reached=new Set((d.reached||[]).filter(r=>CP_SPOTS.some(c=>c[0]===r)));
    if(d.gates)for(const k in d.gates)setGate(k,d.gates[k]);
    if(d.trap)springTrap({restored:true});
    S.freeUsed=!!d.freeUsed; S.mill=!!d.mill;
    S.prevCp=d.prevCp&&d.prevCp.p?{p:V(d.prevCp.p[0],d.prevCp.p[1],d.prevCp.p[2]),yaw:d.prevCp.yaw||0,name:d.prevCp.name||''}:null; }
});
setGate('portcullis',false); setGate('strongroom',false); setGate('exit',false);
G.on('undercroft:bossDead',()=>{ setGate('strongroom',true); setGate('exit',true); });

/* ================================================================ 12. SYSTEMS */
G.system('undercroft',{order:14,modes:'always',
  init(){
    const tb=performance.now();
    G.scene.add(ucRoot,isleRoot);
    try{ buildShell(); }catch(e){ console.error('undercroft shell',e); }
    try{ buildProps(); }catch(e){ console.error('undercroft props',e); }
    try{ buildRoots(); buildCandles(); buildWater(); }catch(e){ console.error('undercroft dressing',e); }
    try{ buildIslandDoor(); }catch(e){ console.error('undercroft door',e); }
    // the way down (island) and the way up (the stair)
    G.interact.add({pos:()=>doorPos,radius:2.3,priority:4,label:'Go down into the undercroft',
      enabled:()=>S.open&&!S.inside&&!S.trans&&G.player.alive!==false&&VIS.doorOpenK>.9, use:()=>startTrans('in','stair')});
    G.interact.add({pos:()=>ANCH.stair.exit,radius:2.0,priority:4,label:'Climb up to the hamlet',
      enabled:()=>S.inside&&!S.trans, use:()=>startTrans('out')});
    G.interact.add({pos:()=>ANCH.store.exit,radius:2.0,priority:4,label:'Climb the shaft to the trapdoor stair',
      enabled:()=>S.inside&&!S.trans&&S.gates.exit, use:()=>startTrans('in','stair')});
    G.interact.add({pos:()=>G.player.pos,radius:4,priority:0,label:'Follow the draught back to the stair',
      enabled:()=>S.inside&&!S.trans&&S.stranded&&G.player.alive!==false&&G.state.mode==='play', use:()=>followDraught()});
    for(const c of CANDLES){ G.interact.add({pos:toWorld(c.stand.x,c.stand.y,c.stand.z),radius:1.9,priority:3,
      label:()=>candleLabel(c)||'', enabled:()=>S.inside&&!S.lit.has(c.room)&&!glassUp(), use:()=>useCandle(c)}); }
    // the past layer (glass.js): the doorway that was, the stair that was
    try{ buildPast(); }catch(e){ console.error('undercroft past',e); }
    API.stats.buildMs=Math.round(performance.now()-tb);
    if(G.debug)console.log('[undercroft] built',JSON.stringify(API.stats));
  },
  update(dt){
    const t=G.time, mode=G.state.mode, P=G.player;
    tUni.uTime.value=t;
    if(!S.open&&wellCured())openDoor(true);
    if(VIS.leaves){ const tgt=S.open?1:0; if(Math.abs(VIS.doorOpenK-tgt)>.001){ VIS.doorOpenK=U.damp(VIS.doorOpenK,tgt,1.2,dt); if(Math.abs(VIS.doorOpenK-tgt)<.002)VIS.doorOpenK=tgt; setDoorVis(VIS.doorOpenK); } }
    updateTrans(dt);
    if(P&&P.pos&&!S.trans){ const inU=!!room(P.pos)||(inBoxW(P.pos.x,P.pos.z)&&P.pos.y>O.y-30); if(inU!==S.inside)setInside(inU); }
    if(!S.inside)return;
    const r=room(P.pos)||S.room; if(r&&r!==S.room){ S.room=r; G.emit('undercroft:room',{id:r}); }
    if(!S.trans)updateCheckpoint(dt);
    const lit=S.room&&S.lit.has(S.room);
    if(mode!=='title')G.atmo.darkTarget=lit?.55:1;
    G.lights.sun.intensity=0;
    { const k=clamp((1-G.atmo.dark)/.45,0,1), fog=G.scene.fog;
      if(fog){ fog.color.copy(FOG0).lerp(FOG1,k); if(G.scene.background&&G.scene.background.isColor)G.scene.background.copy(fog.color); }
      G.lights.hemi.color.lerp(HEMI_SKY,.75); G.lights.hemi.groundColor.lerp(HEMI_GND,.75); if(lit)G.lights.hemi.color.lerp(HEMI_LIT,.35); }
    updateCandles(dt); updateGateVis(false,dt);
    if(VIS.rubble){ const k=G.glass?G.glass.k:0; VIS.rubbleMat.opacity=1-k*.92; VIS.rubble.visible=k<.98; VIS.rubbleMat.depthWrite=k<.3; }
    if(VIS.runner&&S.mill){ VIS.runner.rotation.y+=dt*.9; } if(VIS.wheel){ VIS.wheel.rotation.x-=dt*(S.mill?1.1:.06); }
    if(mode==='play'){ updatePast(dt); updateTrap(dt); }
  }
});
G.system('undercroftLate',{order:21,modes:['play','dead'],update(){ // after player.js: heads under the vaults
  if(!S.inside)return; const P=G.player; const lx=P.pos.x-O.x, lz=P.pos.z-O.z, c=Cat(lx,lz), f=G.floorAt(P.pos.x,P.pos.z,P.pos.y+.05)-O.y;
  if(P.pos.y-O.y>c-1.7&&P.pos.y-O.y>f+.02)P.pos.y=O.y+Math.max(f,c-1.7); }});

/* ---------- past-layer content (G.glass.addPast): walkable doorway + stair, and the rubble that is there now ---------- */
function buildPast(){
  const Gl=G.glass; const r=U.rng(1717);
  // the present: rubble heaped in the doorway (hidden while the Glass shows the door)
  const RB=new Builder();
  for(let k=0;k<70;k++){ const w=.24+r()*.2, h=.1+r()*.08, d=.12+r()*.1, y=-2+Math.pow(r(),1.4)*2.9*(1-Math.abs(r()-.5)*.6);
    RB.box(w,h,d,jit(r()<.75?'#80594a':'#7a726a',r,.25),14.6+r()*1.9,y,-25.2+r()*2.4,r()*3,(r()-.5)*1.4,(r()-.5)*1.4); }
  for(let k=0;k<8;k++){ const s2=.25+r()*.25; RB.add(new THREE.DodecahedronGeometry(s2,0),jit('#6f6862',r,.2),14.7+r()*1.7,-2+s2*.6,-25+r()*2,r()*3,r()*3,r()*3); }
  RB.box(2.2,.18,.22,'#5b4a3c',15.6,-.3,-24.3,.2,0,.5).box(2.0,.16,.2,'#5b4a3c',15.4,-1.3,-23.6,-.3,0,-.4);
  const rubM=G.toon('#ffffff',{vertexColors:true,transparent:true}); VIS.rubbleMat=rubM;
  VIS.rubble=RB.mesh(rubM,'ucDoorRubble'); ucRoot.add(VIS.rubble);
  if(!Gl||!Gl.addPast)return;
  const mat=Gl.memoryMaterial?Gl.memoryMaterial('#ffc98a',{base:.42}):new THREE.MeshBasicMaterial({color:C('#ffc98a'),transparent:true,opacity:.4});
  // the doorway as it was: a round-arched frame, a timber door standing open, a worn threshold
  const D=new Builder();
  for(const s of [-1,1]) D.box(.5,2.6,.42,'#ffffff',15.65,-.7,-24+s*1.35);
  for(let k=0;k<=8;k++){ const a=k/8*PI; D.box(.5,.28,.34,'#ffffff',15.65,.6+Math.sin(a)*1.25,-24+Math.cos(a)*1.25,0,a); }
  D.box(.7,.08,2.3,'#ffffff',15.65,-1.96,-24).box(.08,2.3,1.2,'#ffffff',15.2,-.85,-25.0,-.9);
  const door=D.mesh(mat,'ucPastDoor'); door.position.copy(O); Gl.addPast(door);
  // the stair to the mill loft, as it was
  const Z=ZONES.find(z=>z.id==='pastStair'); const B=new Builder(); treadsFor(Z,B,()=>C('#ffffff'));
  B.box(.06,.9,3.6,'#ffffff',17.6,-3.7,-46,0,-.7).box(.06,.06,4.2,'#ffffff',17.6,-3.25,-46,0,-.72);
  const st=B.mesh(mat,'ucPastStair'); st.position.copy(O); Gl.addPast(st);
  // dungeon echoes (placeholder captions: the People agent may replace the lines via G.glass.echo(id).lines)
  const E=(id,o)=>{ const e=ECHOES.find(q=>q.id===id); if(e&&Gl.addEcho)Gl.addEcho(Object.assign({id,pos:e.pos.clone(),r:e.r,zone:'undercroft'},o)); };
  E('tithe',{who:'An echo',lines:['Sacks come down the stair one after another. A tall man in a reeve’s coat counts them onto a tally-board, and doesn’t look up.'],
    figures:[{x:1.2,z:1.6,yaw:PI,pose:'sit',h:1.15},{x:-1.4,z:2.4,yaw:2.6,pose:'carry'},{x:-.4,z:3.2,yaw:PI,pose:'carry',h:.95}],props:[{type:'table',x:1.2,z:.9,yaw:0},{type:'sack',x:-2.4,z:2.6}]});
  E('supper',{who:'An echo',lines:['A family at supper: bread passed hand to hand, a child laughing at nothing. Somewhere upstairs, a door bangs in the wind.'],
    figures:[{x:-1.4,z:0,yaw:PI/2,pose:'sit'},{x:1.4,z:0,yaw:-PI/2,pose:'sit'},{x:0,z:-1,yaw:0,pose:'sit',h:.9},{x:-.5,z:1.1,yaw:PI,pose:'sit',h:.7}],props:[{type:'table',x:0,z:0,yaw:0}]});
  E('bargain',{who:'An echo',lines:['A man kneels at the altar with a ledger open on it, writing name after name. Something tall and grey stands where the light doesn’t reach, and waits.','“Every name but mine,” he says. “Every name but mine.”'],
    figures:[{x:0,z:-.6,yaw:PI,pose:'kneel',h:1.12},{x:0,z:-2.6,yaw:0,pose:'fog',h:1.7}],props:[{type:'ledger',x:0,z:-1.3}]});
  E('register',{who:'An echo',lines:['A thin clerk bends over the parish register, glances at the door, and tears a page out clean. He folds it small and carries it away, down toward the store.'],
    figures:[{x:.3,z:.6,yaw:-PI/2,pose:'stand',h:1.0,walk:{dx:-3,dz:-4}}]});
  E('wren',{who:'An echo',lines:['A girl sits on the flour sacks with her knees drawn up, singing to the turning stone. The miller hums along under his breath, off-key.'],
    figures:[{x:-.4,z:.6,yaw:PI*.8,pose:'sit',h:.8},{x:1.4,z:-1.4,yaw:-2.4,pose:'stand'}],props:[{type:'sack',x:-.6,z:1.2},{type:'sack',x:-1.1,z:1.0}]});
}

/* ================================================================ 13. DEBUG */
G.debugEnterUndercroft=(roomId)=>{
  if(!(G.loop&&G.loop.active)&&G.debugStartLoop)G.debugStartLoop();
  if(G.state.mode==='title'){ const t=document.getElementById('title'); if(t)t.hidden=true; G.setMode('play'); }
  if(!S.open)openDoor(true);
  S.trans=null; doTeleport('in',roomId||'stair'); return room(G.player.pos);
};
API._debug={S,ZONES,SOLIDS,Sat,Fat,Cat,Sfield,Sphys,zoneFloor,presentAt,regionAt,connected,bestCheckpoint,arrivalFor,blockers,VIS,CANDLES,openDoor,springTrap,
  stats:()=>{ let n=0; ucRoot.traverse(o=>{ if((o.isMesh||o.isPoints||o.isInstancedMesh)&&o.visible)n++; }); return n; }};
})();

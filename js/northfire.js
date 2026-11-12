/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — northfire.js
   The fire room at the top of the wrecker's tower, and the Wreck Giant (Heath, 2026-11-11; Story Bible, "The fire room").
     - the room (a separate space at O, like the other interiors): a round stone drum, the fire pit in the middle where the
       green light really burns, the smoke hole and its iron cage overhead, salvage from twenty years of wrecks round the wall.
       Four seawater cisterns high on the wall, each with a chain: the wreckers banked the fire with them when a Wickham's End
       boat went by ("I turned the fire down to an ember and let her by"). A great cistern hangs over the pit on two beams.
     - the Wreck Giant climbs out of the pit: rock and a molten core, armoured in burnt ship timbers, anchor chain and stone,
       a cracked ship's figurehead for a face. Too hot to hurt (staff ×0.2) until a cistern pours on it: doused, it kneels,
       the seams go dark and the staff bites (×1.6). Three phases: at 2/3 and 1/3 it sheds armour and gets smaller and faster.
       Slam (2 hearts), sweep, hurled burning wreckage (lava pools from phase 2), the pit erupting (phase 3), a stomp if you
       stand under it. At 0 hp it doesn't end anything: it goes down on its knees, white-hot, and waits for the story
       (northfire_story.js) to finish it: lunge / grab / clutch poses, then crumble().
     - the story owns Tobias, the cut scenes and the endings; this file falls back to a plain fight if there's no story.
   G.northFire = { inside, O, R, PIT_R, H, DOOR, pol, toWorld, root, state, enter(o), exit(o), tanks, pullTank(i,by),
                   giant:{...}, fighting, setFire(mode), finish(outcome), debug }
   Events: northFire:enter {first} · :exit · :fightStart {first} · :phase {n} · :douse {by,big} · :hit {damage,hp,doused}
           · :giantDown · :crumbled · :reset {why} · :finish {outcome}
   Save: G.persist 'northFire' {v, entered, done, outcome, fell}.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth,vnoise}=U;
const V=(x,y,z)=>new THREE.Vector3(x||0,y||0,z||0);
const col=U.col;
const damp=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
const rnd=U.rng?U.rng(4417):Math.random;

/* ================================================================ 1. FRAME */
const O=V(800,60,800);                       // free: cave (0,60,800), Undercroft (0,60,-800), Vigil (-800,60,0), northCave (800,60,0)
const R=12.5, PIT_R=3.4, H=15;
const toWorld=(x,y,z)=>V(O.x+x,O.y+y,O.z+z);
const pol=(a,r)=>({x:Math.sin(a)*r,z:Math.cos(a)*r});          // a = 0: +z, the door side; a = π: the north wall
const DOOR={x:0,y:0,z:R-3.6,yaw:PI};   // a step off the hatch toward the pit: room behind him for the camera
const inBoxW=(x,z)=>Math.abs(x-O.x)<R+3&&Math.abs(z-O.z)<R+3;
const INTERIOR={id:'northFire',contains:(x,z,y)=>inBoxW(x,z)&&(y==null||y>O.y-20)};
const pitY=r=>-1.1*(1-smooth(PIT_R-.7,PIT_R+.1,r));             // the giant stands lower in the pit

/* the tuning table: damage in half-hearts */
const T={hp:160, p2:2/3, p3:1/3, chip:.2, cold:1.6, douse:6.5,
  speed:[1.4,1.9,2.5], turn:[1.7,2.1,2.6], cool:[2.3,1.75,1.3], scale:[1,.86,.72],
  slam:{dmg:4,r:3,wind:[1.15,1.05,.95],reach:5.2}, sweep:{dmg:2,arc:130*PI/180,r:6.2,wind:[.9,.82,.75]},
  hurl:{dmg:2,r:2.2,wind:[1.0,.92,.85],fly:1.1}, erupt:{dmg:2,r:2,wind:1.3,n:5}, stomp:{dmg:2,r:2.6,wind:.6},
  pool:{r:1.7,life:9,tick:1.1,dmg:1}, tank:{circleR:2.6,refill:14,lead:.35,pour:1.6}};

/* ================================================================ 2. STATE */
const S={v:1,entered:false,done:false,outcome:null,fell:null,inside:false,trans:null,fire:'lure',hid:false};
const B={state:'dormant',phase:1,hp:T.hp,x:0,z:0,y:-8,heading:0,scale:1,sTarget:1,doused:0,douseBy:null,atk:null,cool:2,under:0,
  walk:0,walkK:0,rise:0,riseDur:4,flash:0,shed:null,script:null,hold:false,first:true,said:{},nAtk:0,crumbleT:-1,clutch:null,diedHere:false};
const timers=[]; const later=(s,fn)=>timers.push({t:G.time+s,fn});
const say=(t,who,o)=>{ try{ G.ui.say(t,who||null,Object.assign({priority:'high',group:'nf'},o||{})); }catch(e){} };   // group 'nf': the story's scenes supersede it (hud.js)
const toast=(a,b)=>{ try{ G.ui.toast&&G.ui.toast(a,b); }catch(e){} };
const isPlay=()=>G.state.mode==='play';
const cineOn=()=>!!(G.cine&&G.cine.on);
function sfx(kind,o){ try{ const A=G.audio; if(!A||!A.ready||!A.S)return; const t=A.context.currentTime, S_=A.S; o=o||{};
  if(kind==='slam'){ S_.thud(t,{g:.45,dur:.5,f0:90,f1:30}); S_.rumble&&S_.rumble(t,{g:.3,dur:1.1}); }
  else if(kind==='step'){ S_.thud(t,{g:.18,dur:.25,f0:70,f1:30}); }
  else if(kind==='whoosh'){ S_.whoosh&&S_.whoosh(t,{g:.3,dur:.4}); }
  else if(kind==='hiss'){ S_.hiss&&S_.hiss(t,{g:o.g||.3,dur:o.dur||1.2}); }
  else if(kind==='roar'){ S_.growl&&S_.growl(t,{g:.4,dur:1.4,f:45}); S_.rumble&&S_.rumble(t,{g:.3,dur:1.6}); }
  else if(kind==='chain'){ S_.clank&&S_.clank(t,{g:.14,f:380}); }
  else if(kind==='crack'){ S_.thud(t,{g:.35,dur:.3}); S_.clank&&S_.clank(t+.05,{g:.12,f:260}); }
}catch(e){} }
function music(on){ try{ const M=G.audio&&G.audio.music; if(M&&M.setOverride){ if(on)M.setOverride('boss'); else if(M.state==='boss'||on===false)M.setOverride(null); } }catch(e){} }

/* ================================================================ 3. FLOORS, WALLS, CAMERA */
G.floorProviders.push((x,z,y)=>{ if(!inBoxW(x,z))return null; if(y!=null&&y<O.y-20)return null; return O.y; });
G.walkOverrides.push((x,z)=>{ if(!inBoxW(x,z))return null; return true; });
/* where a body may stand: the ring between the pit's curb and the wall */
function sdPhys(x,z){ const r=Math.hypot(x,z); return Math.max(r-(R-.5),(PIT_R+.6)-r); }
G.constrainers.push((prev,next,y,rad)=>{
  if(!inBoxW(next.x,next.z)&&!inBoxW(prev.x,prev.z))return false;
  if(y!=null&&y<O.y-20)return false;
  rad=rad||.4; const Sp=sdPhys;
  const px=prev.x-O.x, pz=prev.z-O.z; let nx=next.x-O.x, nz=next.z-O.z; const s0=Sp(px,pz);
  let s=Sp(nx,nz)+rad; if(s<=0)return false;
  for(let k=0;k<4&&s>0;k++){ const e=.1, gx=Sp(nx+e,nz)-Sp(nx-e,nz), gz=Sp(nx,nz+e)-Sp(nx,nz-e), gl=Math.hypot(gx,gz)||1; nx-=gx/gl*(s+.005); nz-=gz/gl*(s+.005); s=Sp(nx,nz)+rad; }
  if(s>.02&&!(s0+rad>0&&Sp(nx,nz)<s0)){ next.x=prev.x; next.z=prev.z; return true; }
  next.x=nx+O.x; next.z=nz+O.z; return true;
});
function camOK(x,y,z){ return Math.hypot(x,z)<R-.45&&y>.25&&y<H-.45; }
G.cameraConstrainers.push((cam,target)=>{
  if(!S.inside)return;
  const tx=target.x-O.x, ty=target.y-O.y, tz=target.z-O.z, cx=cam.x-O.x, cy=cam.y-O.y, cz=cam.z-O.z;
  if(!camOK(tx,ty,tz))return;
  const L=Math.hypot(cx-tx,cy-ty,cz-tz), n=Math.max(1,Math.ceil(L/.15)); let gx=tx,gy=ty,gz=tz;
  for(let i=1;i<=n;i++){ const t=i/n, x=tx+(cx-tx)*t, y=ty+(cy-ty)*t, z=tz+(cz-tz)*t; if(!camOK(x,y,z))break; gx=x;gy=y;gz=z; }
  cam.set(gx+O.x,gy+O.y,gz+O.z);
});

/* ================================================================ 4. THE ROOM */
const root=new THREE.Group(); root.name='northFire'; root.position.copy(O); root.visible=false;
let fireG=null, fireCones=[], fireMats=[], tongues=[], fireLight=null, pitGlow=null, pitGlowMat=null, smoke=[];
const tanks=[]; let great=null;
const FIRE={lure:{a:'#2fcf7a',b:'#9ff5c8',h:1.0,L:'#6fe8a8',I:2.6,glow:'#1f8a55'},
  rage:{a:'#ff7a2a',b:'#5fe8a0',h:1.35,L:'#ff9a4a',I:2.2,glow:'#a8401a'},
  embers:{a:'#a8341a',b:'#ff7a3a',h:.18,L:'#ff6a3a',I:.7,glow:'#5a1a0c'},
  true:{a:'#a4520a',b:'#c88418',h:1.0,L:'#ffb04a',I:2.6,glow:'#7a4a14',o:.5},   // gold, not white: the cones and tongues add up (and bloom), so the colours sit low and saturated, and thinner (o)
  out:{a:'#201510',b:'#201510',h:.02,L:'#ff6a3a',I:.08,glow:'#140a08'}};
const fireNow={h:1,I:2.6,o:1,a:col('#2fcf7a'),b:col('#9ff5c8'),L:col('#6fe8a8'),glow:col('#1f8a55')};
function stoneCol(c,x,y,z){ const dk=col('#3b3a40'), lt=col('#6e6c72'), soot=col('#17151a');
  c.copy(dk).lerp(lt,.25+.5*vnoise(x*.6+y*.2,z*.6-y*.3)).lerp(soot,smooth(5,H,y)*.75); }
function buildRoom(){
  const tex=G.world.geo.tex(), GE=G.world.geo;
  // the drum
  const wg=new THREE.CylinderGeometry(R+.15,R+.15,H,56,8,true); { const P=wg.attributes.position, cl=new Float32Array(P.count*3), c=new THREE.Color();
    for(let i=0;i<P.count;i++){ const x=P.getX(i), y=P.getY(i)+H/2, z=P.getZ(i), a=Math.atan2(z,x), k=1+(vnoise(a*6,y*.7)-.5)*.025; P.setXYZ(i,x*k,y-H/2,z*k); stoneCol(c,x,y,z); c.toArray(cl,i*3); }
    wg.setAttribute('color',new THREE.BufferAttribute(cl,3)); const uv=wg.attributes.uv; for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*18,uv.getY(i)*H/3); wg.computeVertexNormals(); }
  const wall=new THREE.Mesh(wg,G.toon('#ffffff',{map:tex&&tex.stone,vertexColors:true,side:THREE.BackSide})); wall.position.y=H/2; root.add(wall);
  // the floor: stone flags in a ring round the pit
  const fg=new THREE.RingGeometry(PIT_R+.45,R+.2,56,4); { const uv=fg.attributes.uv; for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*7,uv.getY(i)*7); }
  const floor=new THREE.Mesh(fg,G.toon('#6a6266',{map:tex&&tex.stone})); floor.rotation.x=-PI/2; floor.receiveShadow=true; root.add(floor);
  // the curb and the pit
  const curb=new THREE.Mesh(new THREE.CylinderGeometry(PIT_R+.55,PIT_R+.65,.55,40,1,true),G.toon('#4a454a',{map:tex&&tex.stone,side:THREE.DoubleSide})); curb.position.y=.27; root.add(curb);
  const lip=new THREE.Mesh(new THREE.RingGeometry(PIT_R-.05,PIT_R+.6,40,1),G.toon('#3a3438')); lip.rotation.x=-PI/2; lip.position.y=.55; root.add(lip);
  const bowl=new THREE.Mesh(new THREE.CylinderGeometry(PIT_R,PIT_R*.75,2.4,32,1,true),G.toon('#1a1012',{side:THREE.BackSide})); bowl.position.y=-.65; root.add(bowl);
  pitGlowMat=new THREE.MeshBasicMaterial({color:col('#1f8a55')}); pitGlow=new THREE.Mesh(new THREE.CircleGeometry(PIT_R*.78,28),pitGlowMat); pitGlow.rotation.x=-PI/2; pitGlow.position.y=-1.8; root.add(pitGlow);
  // the fire: cones of light (additive), a light, a few sprites
  fireG=new THREE.Group(); fireG.position.y=-1.2; root.add(fireG);
  for(let k=0;k<5;k++){ const m=new THREE.MeshBasicMaterial({color:col('#2fcf7a'),transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
    const c=new THREE.Mesh(new THREE.ConeGeometry(2.0-k*.3,2.4+k*.6,10,1,true),m); c.position.set(Math.sin(k*2.1)*.6,(2.4+k*.6)/2,Math.cos(k*2.1)*.6); c.rotation.y=k*1.3; fireG.add(c); fireCones.push(c); fireMats.push(m); }
  // tongues of flame: sprites that lick up and fade, over the cones
  for(let k=0;k<14;k++){ const m=new THREE.SpriteMaterial({map:G.tex.flame,color:col('#2fcf7a'),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
    const sp=new THREE.Sprite(m); fireG.add(sp); tongues.push({sp,m,ph:k/14,x:(rnd()-.5)*2.4,z:(rnd()-.5)*2.4,sp0:.7+rnd()*.5}); }
  fireLight=new THREE.PointLight(col('#6fe8a8'),2.6,34,1.4); fireLight.position.y=2.2; root.add(fireLight);
  // the roof: a planked ring with the smoke hole, and the iron cage of the fire-basket above it
  const roof=new THREE.Mesh(new THREE.RingGeometry(2.9,R+.2,48,1),G.toon('#2a2220',{side:THREE.DoubleSide})); roof.rotation.x=PI/2; roof.position.y=H; root.add(roof);
  const iron=G.toon('#252226');
  for(let k=0;k<12;k++){ const a=k/12*TAU, b=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,3.4,5),iron); b.position.set(Math.cos(a)*2.85,H+1.7,Math.sin(a)*2.85); root.add(b); }
  const sky=new THREE.Mesh(new THREE.CircleGeometry(3,20),new THREE.MeshBasicMaterial({color:col('#0a0d16')})); sky.rotation.x=PI/2; sky.position.y=H+3.3; root.add(sky);
  // beams across under the roof, the great cistern on them, over the pit
  const wood=G.toon('#3b2c22',{map:tex&&tex.wood}), wood2=G.toon('#2e221b');
  for(const s of [-1,1]){ const bm=new THREE.Mesh(new THREE.BoxGeometry(.45,.5,2*R+.3),wood); bm.position.set(s*2.2,H-1.4,0); root.add(bm); }
  great={g:new THREE.Group(),tip:0,pour:null}; great.g.position.set(0,H-1.15,-.9); root.add(great.g);
  { const tk=new THREE.Mesh(new THREE.CylinderGeometry(1.9,1.7,2.3,16),wood); tk.position.y=1.15; great.g.add(tk);
    for(const y of [.35,1.15,1.95]){ const band=new THREE.Mesh(new THREE.TorusGeometry(1.86,.06,4,24),iron); band.rotation.x=PI/2; band.position.y=y; great.g.add(band); } }
  // its chain runs over a pulley to the north wall, where Tobias banks the fire from
  { const ca=pol(PI,R-1.2); great.chainPos=toWorld(ca.x,1.3,ca.z);
    const ch=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,H-2.6,4),iron); ch.position.set(ca.x,1.3+(H-2.6)/2,ca.z); root.add(ch);
    const hd=new THREE.Mesh(new THREE.TorusGeometry(.16,.04,5,12),iron); hd.position.set(ca.x,1.2,ca.z); root.add(hd);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,R-2.2,4),iron); top.rotation.x=PI/2; top.position.set(0,H-1.2,-(R-1.2)/2-.5); root.add(top); }
  // four cisterns high on the wall, each with a chute over its pour circle and a chain down to hand height
  for(let i=0;i<4;i++){ const a=[PI/4,3*PI/4,-3*PI/4,-PI/4][i], t=buildTank(i,a,wood,wood2,iron); tanks.push(t); }
  buildSalvage();
  // warm lamps on the wall between the cisterns, by the door and by the north wall
  for(const a of [0,PI/2,PI,-PI/2]){ const p=pol(a,R-.35), L=new THREE.PointLight(col('#ff9a5a'),.55,11,1.6); L.position.set(p.x,4.4,p.z); root.add(L);
    const gl=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:col('#ffc890')})); gl.position.copy(L.position); root.add(gl); }
  // the trapdoor you came up through, open, by the door side
  const hatch=new THREE.Mesh(new THREE.BoxGeometry(1.3,.08,1.3),G.toon('#130d0b')); hatch.position.set(DOOR.x,.03,R-1.0); root.add(hatch);
  const lid=new THREE.Mesh(new THREE.BoxGeometry(1.25,.1,1.25),wood); lid.position.set(DOOR.x,.62,R-.3); lid.rotation.x=-1.25; root.add(lid);
  buildDecals(); buildFx(); buildGiant(); buildRubble();
  G.scene.add(root);
}
function buildTank(i,a,wood,wood2,iron){
  const P=pol(a,R-1.05), C=pol(a,R-3.6), K=pol(a,R-1.4);
  const g=new THREE.Group(); g.position.set(P.x,7.6,P.z); g.rotation.y=a; root.add(g);
  const tk=new THREE.Mesh(new THREE.CylinderGeometry(1.0,.92,2.0,14),wood); tk.position.y=1; g.add(tk);
  for(const y of [.25,1,1.75]){ const band=new THREE.Mesh(new THREE.TorusGeometry(.98,.05,4,20),iron); band.rotation.x=PI/2; band.position.y=y; g.add(band); }
  for(const s of [-1,1]){ const br=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,1.2),wood2); br.position.set(s*.6,-.1,.35); g.add(br); }
  // the chute: a trough from the tank's foot out over the circle (local +z points into the room: rotation.y = a, room centre is -(sin a, cos a))
  const len=2.7, chute=new THREE.Group(); chute.position.set(0,.35,0); chute.rotation.x=-.14; g.add(chute);
  const tr=new THREE.Mesh(new THREE.BoxGeometry(.55,.18,len),wood2); tr.position.z=-len/2; chute.add(tr);
  for(const s of [-1,1]){ const sd=new THREE.Mesh(new THREE.BoxGeometry(.06,.24,len),wood2); sd.position.set(s*.27,.12,-len/2); chute.add(sd); }
  // water inside (the level shows at the tank's top)
  const wm=new THREE.MeshBasicMaterial({color:col('#4f7f90'),transparent:true,opacity:.85}); const wtop=new THREE.Mesh(new THREE.CircleGeometry(.88,14),wm); wtop.rotation.x=-PI/2; wtop.position.y=2.01; g.add(wtop);
  // the chain
  const chain=new THREE.Group(); chain.position.set(K.x,0,K.z); root.add(chain);
  const cl=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,6.6,4),iron); cl.position.y=1.2+3.3; chain.add(cl);
  const handle=new THREE.Mesh(new THREE.TorusGeometry(.15,.035,5,12),iron); handle.position.y=1.15; chain.add(handle);
  // the pour: a column of water from the chute's lip to the floor
  const pm=new THREE.MeshBasicMaterial({color:col('#8fbcd2'),transparent:true,opacity:0,depthWrite:false});
  const pour=new THREE.Mesh(new THREE.CylinderGeometry(.35,.7,7.6,12,1,true),pm); pour.position.set(C.x,3.8,C.z); pour.visible=false; root.add(pour);
  // the circle it lands in, marked faintly on the floor (scrubbed clean by twenty years of it)
  const mm=new THREE.MeshBasicMaterial({map:ringTex(),color:col('#5f8fa8'),transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide});
  const mark=new THREE.Mesh(new THREE.PlaneGeometry(2*T.tank.circleR,2*T.tank.circleR),mm); mark.rotation.x=-PI/2; mark.position.set(C.x,.025,C.z); mark.renderOrder=1; root.add(mark);
  return {i,a,level:1,pull:null,g,wtop,chain,handle,pour,pm,mark,mm,
    chainPos:toWorld(K.x,1.2,K.z), circlePos:toWorld(C.x,0,C.z), circleR:T.tank.circleR, lc:C};
}
function buildSalvage(){
  const GE=G.world.geo, parts=[], wood=col('#5b4433'), wood2=col('#3a2b20'), iron=col('#2a2729'), brass=col('#8a6a32'), paint=col('#7a2f2a');
  const planks=(q,n,o)=>o.copy(wood).lerp(wood2,.4+.4*Math.sin(q.y*14+q.x*3));
  // between the cisterns and away from the door: crates, barrels, a ship's wheel, an anchor, a bell
  const spots=[[PI/2-.25,0],[PI/2+.25,1],[-PI/2+.25,2],[-PI/2-.2,3],[PI*.82,4],[-PI*.82,5],[PI+.3,6],[PI-.35,7],[.55,8],[-.55,9]];
  for(const [a,k] of spots){ const p=pol(a,R-.75), s=.55+(k%3)*.18;
    if(k%3===0)parts.push({g:new THREE.BoxGeometry(s*1.3,s,s),m:GE.mat4(p.x,s/2,p.z,0,a,0),c:planks});
    else if(k%3===1)parts.push({g:new THREE.CylinderGeometry(.34,.3,.85,10),m:GE.mat4(p.x,.43,p.z,0,0,0),c:planks});
    else { parts.push({g:new THREE.BoxGeometry(s*1.2,s,s),m:GE.mat4(p.x,s/2,p.z,0,a+.4,0),c:planks}); parts.push({g:new THREE.BoxGeometry(s,s*.8,s*.9),m:GE.mat4(p.x,s+s*.4,p.z,0,a-.3,0),c:planks}); } }
  { const p=pol(PI/2,R-.4); parts.push({g:new THREE.TorusGeometry(.75,.07,6,20),m:GE.mat4(p.x,1.5,p.z,0,PI/2,0),c:wood2});              // a ship's wheel against the wall
    for(let k=0;k<8;k++){ const a=k/8*TAU; parts.push({g:new THREE.CylinderGeometry(.04,.04,1.9,4),m:GE.mat4(p.x,1.5,p.z,a,PI/2,0,1,1,1),c:wood2}); } }
  { const p=pol(-PI/2,R-.5); parts.push({g:new THREE.CylinderGeometry(.09,.09,2.2,6),m:GE.mat4(p.x,1.1,p.z,0,0,.15),c:iron});        // an anchor, leant on the wall
    parts.push({g:new THREE.TorusGeometry(.55,.09,5,12,PI),m:GE.mat4(p.x+.15,.25,p.z,PI,PI/2,0),c:iron}); }
  { const p=pol(PI*.6,R-.5); parts.push({g:GE.blob(.42,1,4,.12),m:GE.mat4(p.x,1.0,p.z,.2,1.2,.3,1,2.1,.8),c:col('#b8a98c')});        // a figurehead with no face left
    parts.push({g:new THREE.CylinderGeometry(.3,.42,.55,12,1,true),m:GE.mat4(pol(-PI*.6,R-.5).x,.3,pol(-PI*.6,R-.5).z,0,0,.3),c:brass}); }
  { const p=pol(-PI*.35,R-.4); parts.push({g:new THREE.BoxGeometry(2.4,.6,.12),m:GE.mat4(p.x,2.6,p.z,0,-PI*.35,0),c:paint}); }        // a nameboard nailed up: no name left on it
  const m=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide})); root.add(m);
}

/* ---------------------------------------------------------------- floor telegraphs */
let _ringTex=null;
function ringTex(){ return _ringTex||(_ringTex=G.canvasTex(128,(g,s)=>{ const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2); gr.addColorStop(0,'rgba(255,255,255,.12)'); gr.addColorStop(.8,'rgba(255,255,255,.45)'); gr.addColorStop(.96,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,s,s); })); }
let _poolTex=null;
function poolTex(){ return _poolTex||(_poolTex=G.canvasTex(128,(g,s)=>{ const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2); gr.addColorStop(0,'rgba(255,230,160,1)'); gr.addColorStop(.35,'rgba(255,120,40,.95)'); gr.addColorStop(.8,'rgba(160,40,10,.8)'); gr.addColorStop(1,'rgba(60,10,0,0)'); g.fillStyle=gr; g.fillRect(0,0,s,s);
  g.strokeStyle='rgba(40,10,5,.8)'; g.lineWidth=3; const r=U.rng(5); for(let k=0;k<6;k++){ g.beginPath(); let x=s/2+(r()-.5)*s*.5, y=s/2+(r()-.5)*s*.5; g.moveTo(x,y); for(let j=0;j<4;j++){ x+=(r()-.5)*s*.25; y+=(r()-.5)*s*.25; g.lineTo(x,y); } g.stroke(); } })); }
const decals=[]; let cone=null;
function buildDecals(){
  for(let i=0;i<12;i++){ const m=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:ringTex(),color:col('#ff8a3a'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    m.rotation.x=-PI/2; m.visible=false; m.renderOrder=2; root.add(m); decals.push({m,t:9,life:1,lead:1}); }
  const cg=new THREE.CircleGeometry(1,30,-PI/2-T.sweep.arc/2,T.sweep.arc); cg.rotateX(-PI/2);
  cone={m:new THREE.Mesh(cg,new THREE.MeshBasicMaterial({map:ringTex(),color:col('#ff4a10'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide})),t:9,life:1,lead:1};
  cone.m.visible=false; cone.m.renderOrder=2; root.add(cone.m);
}
function decal(x,z,r,lead,o){ o=o||{}; const d=decals.find(q=>q.t>=q.life)||decals[0];
  d.t=0; d.lead=lead; d.life=lead+(o.hold||.3); d.m.position.set(x,(o.y||0)+.06,z); d.m.scale.set(r,r,1); d.m.material.color.set(o.color||'#ff4a10'); d.m.visible=true; return d; }
function coneDecal(x,z,r,heading,lead){ cone.t=0; cone.lead=lead; cone.life=lead+.3; cone.m.position.set(x,.06,z); cone.m.scale.set(r,1,r); cone.m.rotation.y=heading; cone.m.visible=true; }
function updateDecals(dt){
  for(const d of [...decals,cone]){ if(d.t>=d.life){ if(d.m.visible){ d.m.visible=false; } continue; } d.t+=dt;
    const k=d.t<d.lead?.25+.55*(d.t/d.lead):Math.max(0,1-(d.t-d.lead)/.3); d.m.material.opacity=k*(d.t<d.lead?(.8+.2*Math.sin(d.t*30)):1); }
}
function clearDecals(){ for(const d of [...decals,cone]){ d.t=9; d.m.visible=false; } }

/* ---------------------------------------------------------------- sparks, embers, steam, splashes */
const fx=[];
function buildFx(){ for(let i=0;i<170;i++){ const m=new THREE.SpriteMaterial({map:G.tex.soft,color:0xffffff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const s=new THREE.Sprite(m); s.visible=false; root.add(s); fx.push({s,m,t:1,life:1,vel:V(),drag:1,size:.2,grow:0,op:1,g:0,add:true}); } }
let fxI=0;
function spawn(x,y,z,o){ const f=fx[fxI=(fxI+1)%fx.length]; f.s.position.set(x,y,z); f.vel.set(o.vx||0,o.vy||0,o.vz||0); f.t=0; f.life=o.life||1; f.drag=o.drag==null?1:o.drag;
  f.size=o.size||.2; f.grow=o.grow||0; f.op=o.op==null?1:o.op; f.g=o.g||0; f.m.color.set(o.color||'#ffaa55'); f.m.map=o.flame?G.tex.flame:G.tex.soft;
  const add=o.add!==false; if(f.add!==add){ f.add=add; f.m.blending=add?THREE.AdditiveBlending:THREE.NormalBlending; f.m.needsUpdate=true; }
  f.s.scale.setScalar(f.size); f.s.visible=true; }
function embers(x,y,z,n,o){ o=o||{}; for(let i=0;i<n;i++){ const a=rnd()*TAU, sp=(o.speed||3)*(.4+rnd()*.8);
  spawn(x+Math.cos(a)*(o.r||.3),y,z+Math.sin(a)*(o.r||.3),{vx:Math.cos(a)*sp,vy:(o.up||3)*(.5+rnd()),vz:Math.sin(a)*sp,g:-6,drag:.8,size:.12+rnd()*.12,life:.6+rnd()*.8,color:rnd()<.3?'#ffe28a':o.color||'#ff7a2a',flame:true}); } }
function steam(x,y,z,n,o){ o=o||{}; for(let i=0;i<n;i++){ const a=rnd()*TAU;
  spawn(x+Math.cos(a)*(o.r||1)*rnd(),y+rnd()*(o.h||2),z+Math.sin(a)*(o.r||1)*rnd(),{vx:Math.cos(a)*.6,vy:1.4+rnd()*1.6,vz:Math.sin(a)*.6,drag:1.4,size:.8+rnd()*.8,grow:1.6,life:1.4+rnd()*1.2,op:.35,color:'#c8ccd2',add:false}); } }
function updateFx(dt){ for(const f of fx){ if(f.t>=f.life){ if(f.s.visible)f.s.visible=false; continue; } f.t+=dt; const k=f.t/f.life;
  f.vel.multiplyScalar(Math.exp(-f.drag*dt)); f.vel.y+=f.g*dt; f.s.position.addScaledVector(f.vel,dt); f.s.scale.setScalar(f.size*(1+f.grow*k)); f.m.opacity=f.op*(1-k)*(k<.1?k*10:1); } }

/* ================================================================ 5. THE WRECK GIANT (model) */
const GI={g:null,hips:null,torso:null,head:null,legs:[],arms:[],core:null,coreMat:null,halo:null,haloMat:null,coreLight:null,
  rockMat:null,woodMat:null,ironMat:null,figMat:null,seamMat:null,eyeMat:null,armour:[[],[]],body:[],seams:[],all:[]};
const debris=[];
function buildGiant(){
  const GE=G.world.geo, tex=G.world.geo.tex();
  const LT=lavaTex();
  GI.rockMat=G.toon('#ffffff',{map:LT.map,emissive:'#ff7a2a',emissiveMap:LT.glow}); GI.woodMat=G.toon('#3a2a20',{map:LT.wood,emissive:'#ff6a20',emissiveMap:LT.woodGlow});
  GI.ironMat=G.toon('#2c2a2e'); GI.figMat=G.toon('#b9a88c',{map:tex&&tex.wood}); GI.seamMat=new THREE.MeshBasicMaterial({color:col('#ffffff'),map:LT.magma});
  GI.eyeMat=new THREE.MeshBasicMaterial({color:col('#ffd07a')});
  const g=new THREE.Group(); g.name='wreckGiant'; GI.g=g; root.add(g);
  const piece=(parent,geo,mat,x,y,z,o)=>{ o=o||{}; const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); if(o.s)m.scale.set(o.s[0],o.s[1],o.s[2]); if(o.r)m.rotation.set(o.r[0],o.r[1],o.r[2]);
    m.castShadow=false; parent.add(m); m.userData.r=o.rad||.5; m.userData.home={parent,pos:m.position.clone(),quat:m.quaternion.clone(),scale:m.scale.clone()};
    GI.all.push(m); if(o.armour!=null)GI.armour[o.armour].push(m); else if(o.seam)GI.seams.push(m); else GI.body.push(m); return m; };
  const rock=(r,seed,lump)=>GE.blob(r,1,seed,lump==null?.26:lump);
  const seam=(parent,r,x,y,z,s)=>piece(parent,new THREE.SphereGeometry(r,10,8),GI.seamMat,x,y,z,{seam:true,s:s||[1,1,1],rad:r});
  const plank=(parent,w,h,d,x,y,z,r,arm)=>piece(parent,new THREE.BoxGeometry(w,h,d),GI.woodMat,x,y,z,{r,armour:arm,rad:Math.max(w,h,d)*.4});
  const hips=new THREE.Group(); hips.position.y=3.0; g.add(hips); GI.hips=hips;
  piece(hips,rock(.95,1),GI.rockMat,0,0,0,{s:[1.3,.8,1],rad:.9});
  for(const s of [-1,1]){ const hipJ=new THREE.Group(); hipJ.position.set(s*.8,-.2,0); hips.add(hipJ);
    piece(hipJ,rock(.62,2+s),GI.rockMat,0,-.75,0,{s:[1,1.5,1],rad:.7});
    const knee=new THREE.Group(); knee.position.y=-1.45; hipJ.add(knee);
    piece(knee,rock(.55,4+s),GI.rockMat,0,-.6,0,{s:[1,1.35,1],rad:.6}); piece(knee,rock(.6,6+s,.2),GI.rockMat,0,-1.15,.25,{s:[1.1,.5,1.4],rad:.6});
    plank(hipJ,.34,1.5,.2,0,-.75,.62,[.1,0,s*.08],1); plank(hipJ,.3,1.2,.18,s*.45,-.6,.2,[0,s*.6,s*.1],1);
    GI.legs.push({s,hipJ,knee}); }
  const torso=new THREE.Group(); torso.position.y=.3; hips.add(torso); GI.torso=torso;
  piece(torso,rock(.9,8),GI.rockMat,0,.7,0,{s:[1.25,.9,1],rad:.9});
  piece(torso,rock(1.35,9),GI.rockMat,0,2.0,-.05,{s:[1.35,1,1],rad:1.3});
  // the core: a molten heart showing through a split in the chest
  GI.coreMat=new THREE.MeshBasicMaterial({color:col('#ffffff'),map:_lava.magma}); GI.core=piece(torso,new THREE.SphereGeometry(.46,14,10),GI.coreMat,0,1.85,.82,{seam:true,rad:.5,s:[1,1.25,.8]});
  GI.haloMat=new THREE.SpriteMaterial({map:G.tex.soft,color:col('#ff7a2a'),transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false});
  GI.halo=new THREE.Sprite(GI.haloMat); GI.halo.position.set(0,1.85,1.1); GI.halo.scale.setScalar(2.6); torso.add(GI.halo);
  GI.coreLight=new THREE.PointLight(col('#ff8a3a'),1,9,2); GI.coreLight.position.set(0,1.9,2.4); torso.add(GI.coreLight);
  // armour, first layer (falls at 2/3): planks across the chest, an anchor chain from shoulder to hip, stone on the shoulders
  for(let k=0;k<3;k++)plank(torso,2.9,.28,.22,0,1.45+k*.42,1.08-k*.06,[.08,0,(k-1)*.12],0);
  for(let k=0;k<10;k++){ const t=k/9, x=lerp(-1.4,1.2,t), y=lerp(3.0,.6,t), z=1.05+Math.sin(t*PI)*.25;
    piece(torso,new THREE.TorusGeometry(.17,.055,5,10),GI.ironMat,x,y,z,{r:[0,k%2?PI/2:0,-.9],armour:0,rad:.2}); }
  // second layer (falls at 1/3): planks on the back, stone on the belly
  for(let k=0;k<3;k++)plank(torso,2.4,.3,.22,0,1.3+k*.5,-1.2,[-.1,0,(k-1)*.1],1);
  piece(torso,rock(.5,12,.3),GI.rockMat,-.55,.55,.85,{armour:1,rad:.5}); piece(torso,rock(.45,13,.3),GI.rockMat,.6,.6,.85,{armour:1,rad:.45});
  // the head: a cracked ship's figurehead, a woman's face with the paint long gone, glowing through the split
  const head=new THREE.Group(); head.position.set(0,3.15,.1); torso.add(head); GI.head=head;
  piece(head,rock(.45,14),GI.rockMat,0,0,0,{rad:.45});
  piece(head,GE.blob(.55,2,15,.1),GI.figMat,0,.6,.2,{s:[.8,1.25,.75],rad:.6});
  piece(head,new THREE.BoxGeometry(.07,.95,.12),GI.seamMat,.05,.62,.62,{r:[0,0,.35],seam:true,rad:.3});
  for(const s of [-1,1])piece(head,new THREE.SphereGeometry(.07,8,6),GI.eyeMat,s*.17,.72,.6,{seam:true,rad:.1});
  for(let k=0;k<5;k++){ const a=(k-2)*.38; plank(head,.12,1.2+(k%2)*.4,.1,Math.sin(a)*.5,1.2,-.25+Math.cos(a)*.05,[-.25,0,-a*.9],1); }   // a crown of broken ribs
  // arms
  for(const s of [-1,1]){ const sh=new THREE.Group(); sh.position.set(s*1.75,2.45,0); torso.add(sh);
    piece(sh,rock(.7,20+s),GI.rockMat,0,0,0,{rad:.7});
    piece(sh,rock(.5,22+s),GI.rockMat,0,-.85,0,{s:[1,1.6,1],rad:.55});
    piece(sh,rock(.75,24+s,.3),GI.rockMat,s*.1,.45,0,{s:[1.2,.7,1.1],armour:0,rad:.7});
    const el=new THREE.Group(); el.position.y=-1.7; sh.add(el);
    piece(el,rock(.55,26+s),GI.rockMat,0,-.7,0,{s:[1.05,1.5,1.05],rad:.6});
    const fist=piece(el,rock(.75,28+s,.32),GI.rockMat,0,-1.6,.1,{rad:.75});
    piece(el,rock(.45,30+s,.3),GI.rockMat,s*.35,-.6,.2,{s:[.7,1.4,.7],armour:1,rad:.45});
    GI.arms.push({s,sh,el,fist}); }
  g.visible=false;
}
/* basalt with cracks of fire in it: the map is the rock, the emissive map is only the cracks (so they glow whatever the light) */
let _lava=null;
function lavaTex(){ if(_lava)return _lava;
  const r=U.rng(91), cracks=[]; for(let k=0;k<26;k++){ const pts=[]; let x=r()*256, y=r()*256, a=r()*TAU; for(let j=0;j<7;j++){ pts.push([x,y]); a+=(r()-.5)*1.4; x+=Math.cos(a)*(10+r()*16); y+=Math.sin(a)*(10+r()*16); } cracks.push({pts,w:1.5+r()*3.5}); }
  const draw=(g,col_,glow)=>{ g.lineCap='round'; g.lineJoin='round'; for(const c of cracks){ g.strokeStyle=col_; g.lineWidth=c.w*(glow?2.2:1); g.beginPath(); c.pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y)); g.stroke(); } };
  const map=G.canvasTex(256,(g,s)=>{ g.fillStyle='#2b2626'; g.fillRect(0,0,s,s); for(let k=0;k<900;k++){ const v=20+r()*40|0; g.fillStyle=`rgba(${v+10},${v},${v},.5)`; g.fillRect(r()*s,r()*s,2+r()*5,2+r()*5); } draw(g,'#141010',false); draw(g,'#5a4a46',false); });
  const glow=G.canvasTex(256,(g,s)=>{ g.fillStyle='#000'; g.fillRect(0,0,s,s); g.filter='blur(2px)'; draw(g,'rgba(255,120,40,.7)',true); g.filter='none'; draw(g,'#ffd090',false); });
  const wood=G.canvasTex(128,(g,s)=>{ g.fillStyle='#2a1c14'; g.fillRect(0,0,s,s); for(let y=0;y<s;y+=3){ g.fillStyle=`rgba(${60+r()*30|0},${38+r()*20|0},${24+r()*12|0},.6)`; g.fillRect(0,y,s,1+r()*2); } g.fillStyle='rgba(10,6,4,.6)'; for(let k=0;k<30;k++)g.fillRect(r()*s,r()*s,4+r()*14,2+r()*4); });
  const woodGlow=G.canvasTex(128,(g,s)=>{ g.fillStyle='#000'; g.fillRect(0,0,s,s); g.fillStyle='rgba(255,110,30,.9)'; for(let k=0;k<14;k++)g.fillRect(r()*s,r()*s,3+r()*10,1+r()*2); g.fillStyle='#ff9a40'; g.fillRect(0,0,6,s); g.fillRect(s-6,0,6,s); });
  const magma=G.canvasTex(128,(g,s)=>{ g.fillStyle='#ff6a10'; g.fillRect(0,0,s,s); for(let k=0;k<220;k++){ const x=r()*s, y=r()*s, rr=3+r()*12, gr=g.createRadialGradient(x,y,0,x,y,rr);
      const hot=r()<.5; gr.addColorStop(0,hot?'rgba(255,240,170,.9)':'rgba(120,20,0,.7)'); gr.addColorStop(1,hot?'rgba(255,200,80,0)':'rgba(120,20,0,0)'); g.fillStyle=gr; g.fillRect(x-rr,y-rr,rr*2,rr*2); } });
  for(const t of [map,glow,wood,woodGlow,magma]){ t.wrapS=t.wrapT=THREE.RepeatWrapping; }
  return (_lava={map,glow,wood,woodGlow,magma}); }
/* the hurtbox */
const HB={team:'enemy',pos:V(),radius:1.5,height:6.2,targetable:true,corrupt:false,name:'The Wreck Giant',lockOffset:3,
  alive:()=>S.inside&&(B.state==='fight'||B.state==='shed'),hit:info=>hitGiant(info)};

/* armour comes off: each piece is let go into the room with a shove, and lands among the rest of the wreckage */
function letGo(m,o){ o=o||{}; if(!m.parent)return; root.attach(m); const c=GI.g.position, dx=m.position.x-c.x, dz=m.position.z-c.z, dl=Math.hypot(dx,dz)||1;
  const sp=(o.speed||4)*(.5+rnd()); debris.push({m,vel:V(dx/dl*sp,(o.up||3)+rnd()*3,dz/dl*sp),spin:V((rnd()-.5)*6,(rnd()-.5)*6,(rnd()-.5)*6),rest:false,r:m.userData.r||.4}); }
function updateDebris(dt){ for(const d of debris){ if(d.rest)continue; d.vel.y-=18*dt; d.m.position.addScaledVector(d.vel,dt);
  d.m.rotation.x+=d.spin.x*dt; d.m.rotation.y+=d.spin.y*dt; d.m.rotation.z+=d.spin.z*dt;
  const r=Math.hypot(d.m.position.x,d.m.position.z); if(r>R-.4){ const k=(R-.4)/r; d.m.position.x*=k; d.m.position.z*=k; d.vel.x*=-.3; d.vel.z*=-.3; }
  const fl=(r<PIT_R?pitY(r)-.6:0)+d.r*.45; if(d.m.position.y<fl){ d.m.position.y=fl; if(Math.abs(d.vel.y)<2.5){ d.rest=true; } else { d.vel.y*=-.3; d.vel.x*=.5; d.vel.z*=.5; d.spin.multiplyScalar(.5); } } } }
function reattachAll(){ debris.length=0;
  for(const m of GI.all){ const h=m.userData.home; if(!h)continue; h.parent.add(m); m.position.copy(h.pos); m.quaternion.copy(h.quat); m.scale.copy(h.scale); m.visible=true; }
  rubbleShow(false); }
/* a rubble heap where it fell (a reload after the fight: the pieces aren't simulated again) */
let rubble=null;
function buildRubble(){ const GE=G.world.geo, parts=[], rk=col('#3a3434'), wd=col('#2e2219');
  for(let k=0;k<16;k++){ const a=k*2.4, r=.4+k*.12, x=Math.cos(a)*r, z=Math.sin(a)*r, s=.5+(k%4)*.15;
    parts.push(k%3===0?{g:new THREE.BoxGeometry(2.2,.25,.22),m:GE.mat4(x,.15,z,.2,a,.1),c:wd}:{g:GE.blob(s,1,k,.3),m:GE.mat4(x,s*.4,z,0,a,0,1,.7,1),c:rk}); }
  rubble=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true})); rubble.visible=false; root.add(rubble); }
function rubbleShow(on,x,z){ if(!rubble)return; rubble.visible=!!on; if(on)rubble.position.set(x||0,0,z||0); }

/* ================================================================ 6. THE FIGHT */
const giantW=()=>V(O.x+B.x,O.y+Math.max(0,B.y),O.z+B.z);
const fighting=()=>B.state==='rising'||B.state==='fight'||B.state==='shed';
function rise(o){ o=o||{}; if(S.done||!S.inside)return false; if(B.state!=='dormant')return false;
  build(); reattachAll(); Object.assign(B,{state:'rising',phase:1,hp:T.hp,x:0,z:0,y:-8,heading:Math.atan2(-B.x,-B.z)||0,scale:1,sTarget:1,doused:0,atk:null,cool:1.6,under:0,rise:0,riseDur:o.short?2.2:4.2,shed:null,script:null,hold:false,crumbleT:-1,clutch:null});
  { const P=G.player; if(P&&P.pos)B.heading=Math.atan2(P.pos.x-O.x,P.pos.z-O.z); }
  GI.g.visible=true; setFire('rage'); music(true); G.ui.bossBar('The Wreck Giant',1); sfx('roar');
  const first=B.first; B.first=false; G.emit('northFire:fightStart',{first});
  if(first&&!B.said.tip){ B.said.tip=1; later(o.short?2.6:4.6,()=>toast('The Wreck Giant','Too hot to hurt. Pull a cistern chain when it’s under the spout, then strike')); }
  return true; }
function hitGiant(info){
  if(B.state!=='fight'||info.kind==='swarm')return;
  const cold=B.doused>0, mult=cold?T.cold:T.chip, d=(info.damage||1)*mult;
  B.hp=Math.max(0,B.hp-d); B.flash=cold?.5:.25;
  const hp=giantW().add(V(0,2.2*B.scale,0)); embers(hp.x-O.x,hp.y-O.y,hp.z-O.z,cold?4:8,{color:cold?'#8a8a90':'#ff8a3a',speed:2});
  G.emit('northFire:hit',{damage:d,hp:B.hp,doused:cold});
  if(!cold&&!B.said.chip){ B.said.chip=1; say('The staff skids off hot rock and burning timber. It’s too hot to hurt.','Rowan',{key:'nfChip'}); }
  if(cold&&!B.said.cold){ B.said.cold=1; say('Where the water hit it the rock has gone grey and brittle. Now the staff bites.',null,{key:'nfCold'}); }
  if(B.hp<=0){ goDown(); return; }
  if(B.phase<2&&B.hp<=T.hp*T.p2)startShed(2); else if(B.phase<3&&B.hp<=T.hp*T.p3)startShed(3);
}
function startShed(n){ if(n<=B.phase)return; const from=B.phase; B.phase=n; B.atk=null; clearDecals();
  if(B.doused>0){ B.shed=null; if(B.state==='shed')B.state='fight'; } else { B.shed={t:0,from,to:n}; B.state='shed'; }   // doused (the rescue's deluge): it stays down while the armour cracks off
  B.sTarget=T.scale[n-1]; sfx('roar'); try{ G.ui.shake&&G.ui.shake(.5); }catch(e){}
  for(let k=from-1;k<n-1;k++)for(const m of GI.armour[k])if(m.parent!==root)letGo(m,{speed:5,up:4});
  G.emit('northFire:phase',{n});
  if(!B.said['shed'+n]&&!quiet()){ B.said['shed'+n]=1; say(n===2?'It tears the burning planks off its own chest and throws them aside. Lighter now. Quicker.':'The last of its armour falls away. What’s left is rock and fire, and that heart, wide open.',null,{key:'nfShed'+n}); } }
/* a scene is talking (a camera shot, or the story holding the giant): the fight's own narration keeps quiet */
const quiet=()=>!!((G.cine&&G.cine.on)||B.hold);
function douse(sec,o){ o=o||{}; if(!(B.state==='fight'||B.state==='shed'||B.state==='rising'))return false;
  B.doused=Math.max(B.doused,sec||T.douse); B.douseBy=o.by||null; B.atk=null; clearDecals(); if(B.state==='shed'){ B.state='fight'; B.shed=null; }
  const p=giantW(); steam(p.x-O.x,0,p.z-O.z,o.big?40:18,{r:o.big?5:2,h:o.big?6:4}); sfx('hiss',{g:o.big?.5:.32,dur:o.big?2.2:1.3}); try{ G.ui.shake&&G.ui.shake(.25); }catch(e){}
  if(o.big)bigPour();
  G.emit('northFire:douse',{by:o.by||null,big:!!o.big});
  if(!B.said.douse&&!o.big&&o.by!=='tobias'&&!quiet()){ B.said.douse=1; say('Seawater hits it like a slap. It goes down on one knee in a roar of steam.',null,{key:'nfDouse'}); }
  return true; }
function goDown(){ B.state='down'; B.atk=null; B.doused=0; clearDecals(); B.hp=0; G.ui.bossBar('The Wreck Giant',0); music(false); sfx('roar');
  try{ G.ui.shake&&G.ui.shake(.6); }catch(e){}
  later(1.2,()=>{ if(B.state==='down'||B.state==='dying')G.ui.bossBar(null); });
  G.emit('northFire:giantDown',{pos:giantW()});
  if(!G.northFireStory){ later(2,()=>{ if(B.state==='down'){ crumble(); later(3,()=>{ setFire('embers'); finish('lived'); }); } }); } }
function crumble(){ if(B.state==='dead'||B.crumbleT>=0)return; B.state='dying'; B.crumbleT=0; B.script=null; sfx('crack'); G.ui.bossBar(null); music(false); }
function updateCrumble(dt){ B.crumbleT+=dt; const t=B.crumbleT, c=GI.g.position;
  B.flash=t<.6?1-t:0;
  if(t<.8&&rnd()<dt*30)embers(c.x,2.5*B.scale,c.z,3,{r:1,speed:3,up:4});
  if(t>.5&&!B._crumbled){ B._crumbled=true; sfx('slam'); try{ G.ui.shake&&G.ui.shake(.7); }catch(e){}
    if(B.clutch&&B.clutch.obj){ const o=B.clutch.obj; B.clutch=null; dropHeld(o); }
    for(const m of [...GI.armour[0],...GI.armour[1],...GI.body,...GI.seams])if(m.parent&&m.parent!==root)letGo(m,{speed:2.2,up:1.5});
    steam(c.x,0,c.z,24,{r:2.5,h:4}); embers(c.x,1,c.z,30,{r:1.5,speed:4,up:5}); setFire(S.fire==='rage'?'embers':S.fire);
    S.fell=[+c.x.toFixed(2),+c.z.toFixed(2)]; G.emit('northFire:crumbled',{pos:toWorld(c.x,0,c.z)}); }
  // the seams and the core go dark as it cools
  const k=smooth(.5,3,t); GI.seamMat.color.set('#e8e0d8').lerp(col('#1e1a1c'),k); GI.coreMat.color.set('#ffffff').lerp(col('#1e1a1c'),k); GI.haloMat.opacity=.7*(1-k); GI.coreLight.intensity=1*(1-k);
  GI.rockMat.emissive.set('#ff7a2a').multiplyScalar(1-k); GI.woodMat.emissive.set('#ff6a20').multiplyScalar(1-k);
  if(t>3.2){ B.state='dead'; } }
function dropHeld(o){ try{ const w=new THREE.Vector3(); o.getWorldPosition(w); const p=o.parent; if(p){ const l=p.worldToLocal(w.clone()); o.position.set(l.x,p===root?0:l.y,l.z); } else o.position.set(w.x,O.y,w.z); }catch(e){} }

/* choose and run attacks */
function chooseAttack(pl,forced){
  const ph=B.phase-1, d=Math.hypot(pl.x-B.x,pl.z-B.z); B.nAtk++;
  let kind;
  if(B.under>1.2)kind='stomp';
  else if(B.phase===3&&B.nAtk%3===0)kind='erupt';
  else if(d<4.4)kind=rnd()<.55?'slam':'sweep';
  else if(d<7.5)kind=rnd()<.4?'slam':'hurl';
  else kind='hurl';
  if(forced)kind=forced;
  const fwd={x:Math.sin(B.heading),z:Math.cos(B.heading)}, a={kind,t:0,fired:false,hold:0,exclude:new Set()};
  if(kind==='slam'){ const reach=Math.min(Math.max(d,2.2),T.slam.reach*B.scale+.6); let tx=pl.x, tz=pl.z;
    if(d>reach){ tx=B.x+(pl.x-B.x)/d*reach; tz=B.z+(pl.z-B.z)/d*reach; }
    a.x=tx; a.z=tz; a.wind=T.slam.wind[ph]; decal(tx,tz,T.slam.r,a.wind); }
  else if(kind==='sweep'){ a.wind=T.sweep.wind[ph]; a.r=T.sweep.r*B.scale+.8; coneDecal(B.x,B.z,a.r,B.heading,a.wind); }
  else if(kind==='hurl'){ a.wind=T.hurl.wind[ph]; }
  else if(kind==='stomp'){ a.wind=T.stomp.wind; a.x=B.x; a.z=B.z; decal(B.x,B.z,T.stomp.r+B.scale*.6,a.wind); }
  else if(kind==='erupt'){ a.wind=T.erupt.wind; a.pts=[[pl.x,pl.z]]; for(let k=1;k<T.erupt.n;k++){ const ang=rnd()*TAU, r=PIT_R+1.5+rnd()*(R-PIT_R-3); a.pts.push([Math.sin(ang)*r,Math.cos(ang)*r]); }
    for(const [x,z] of a.pts)decal(x,z,T.erupt.r,a.wind,{color:'#ffb24a'}); sfx('roar'); }
  B.atk=a; void fwd;
}
function strikeAt(x,z,r,dmg,kb,ex){ G.combat.strike({x:O.x+x,y:O.y+.7,z:O.z+z,radius:r,team:'enemy',damage:dmg,knockback:kb,kind:'melee',source:HB,exclude:ex}); }
const projs=[], pools=[];
function updateAttack(dt,pl){
  const a=B.atk; if(!a)return; a.t+=dt;
  if(!a.fired&&a.t>=a.wind){ a.fired=true; a.hold=0;
    if(a.kind==='slam'){ strikeAt(a.x,a.z,T.slam.r,T.slam.dmg,9,a.exclude); sfx('slam'); try{ G.ui.shake&&G.ui.shake(.45); }catch(e){} embers(a.x,.2,a.z,16,{r:1.2,speed:4,up:3}); }
    else if(a.kind==='sweep'){ const dx=pl.x-B.x, dz=pl.z-B.z, d=Math.hypot(dx,dz), ang=Math.abs(U.angDiff?U.angDiff(Math.atan2(dx,dz),B.heading):Math.atan2(Math.sin(Math.atan2(dx,dz)-B.heading),Math.cos(Math.atan2(dx,dz)-B.heading)));
      sfx('whoosh'); if(d<a.r&&ang<T.sweep.arc/2+.1&&pl.y<3.2)strikeAt(pl.x,pl.z,.6,T.sweep.dmg,10,a.exclude); }
    else if(a.kind==='hurl'){ const f=GI.arms[1]&&GI.arms[1].fist, w=V(); if(f)f.getWorldPosition(w); else w.copy(giantW()).add(V(0,5,0));
      const from=V(w.x-O.x,w.y-O.y,w.z-O.z), to=V(pl.x,0,pl.z); throwChunk(from,to); sfx('whoosh'); }
    else if(a.kind==='stomp'){ strikeAt(a.x,a.z,T.stomp.r+B.scale*.6,T.stomp.dmg,11,a.exclude); sfx('slam'); try{ G.ui.shake&&G.ui.shake(.35); }catch(e){} }
    else if(a.kind==='erupt'){ for(const [x,z] of a.pts){ strikeAt(x,z,T.erupt.r,T.erupt.dmg,8,a.exclude); embers(x,.1,z,14,{r:.8,speed:2,up:9}); } sfx('slam'); try{ G.ui.shake&&G.ui.shake(.4); }catch(e){} }
  }
  if(a.fired){ a.hold+=dt; if(a.hold>(a.kind==='hurl'?.5:.6)){ B.atk=null; B.cool=T.cool[B.phase-1]*(.8+rnd()*.4); } }
}
function throwChunk(from,to){
  const GE=G.world.geo, m=new THREE.Mesh(rnd()<.5?new THREE.BoxGeometry(1.6,.35,.35):GE.blob(.5,1,rnd()*9,.3),rnd()<.5?GI.woodMat:GI.rockMat); m.position.copy(from); root.add(m);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.flame,color:col('#ff8a3a'),transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false})); sp.scale.setScalar(1.6); m.add(sp);
  decal(to.x,to.z,T.hurl.r,T.hurl.fly,{color:'#ff6a2a'});
  projs.push({m,from:from.clone(),to:to.clone(),t:0,spin:V(rnd()*6,rnd()*6,rnd()*6),ex:new Set()}); }
function updateProjs(dt){ for(let i=projs.length-1;i>=0;i--){ const p=projs[i]; p.t+=dt; const k=Math.min(1,p.t/T.hurl.fly);
  p.m.position.lerpVectors(p.from,p.to,k); p.m.position.y=lerp(p.from.y,.3,k)+Math.sin(k*PI)*3.5; p.m.rotation.x+=p.spin.x*dt; p.m.rotation.y+=p.spin.y*dt;
  if(rnd()<dt*30)embers(p.m.position.x,p.m.position.y,p.m.position.z,1,{speed:.5,up:.5});
  if(k>=1){ projs.splice(i,1); root.remove(p.m); if(p.m.geometry)p.m.geometry.dispose();
    strikeAt(p.to.x,p.to.z,T.hurl.r,T.hurl.dmg,6,p.ex); embers(p.to.x,.2,p.to.z,14,{r:.6,speed:3,up:3}); sfx('slam');
    if(B.phase>=2&&fighting())addPool(p.to.x,p.to.z); } } }
function addPool(x,z){ if(Math.hypot(x,z)<PIT_R+.6)return; const m=new THREE.Mesh(new THREE.CircleGeometry(T.pool.r,20),new THREE.MeshBasicMaterial({map:poolTex(),transparent:true,opacity:0,depthWrite:false}));
  m.rotation.x=-PI/2; m.position.set(x,.04,z); m.renderOrder=1; root.add(m); pools.push({m,x,z,t:0,tick:.3}); }
function clearPools(x,z,r){ for(let i=pools.length-1;i>=0;i--){ const p=pools[i]; if(x==null||Math.hypot(p.x-x,p.z-z)<r+T.pool.r){ root.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); pools.splice(i,1); if(x!=null)steam(p.x,0,p.z,4,{r:.8,h:1}); } } }
function updatePools(dt,pl){ for(let i=pools.length-1;i>=0;i--){ const p=pools[i]; p.t+=dt; p.m.material.opacity=Math.min(1,p.t*3)*(1-smooth(T.pool.life-1.2,T.pool.life,p.t));
  if(p.t>=T.pool.life){ root.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); pools.splice(i,1); continue; }
  if(rnd()<dt*3)embers(p.x+(rnd()-.5)*2,.05,p.z+(rnd()-.5)*2,1,{speed:.3,up:1.2});
  p.tick-=dt; if(pl&&p.tick<=0&&Math.hypot(pl.x-p.x,pl.z-p.z)<T.pool.r*.9&&pl.y<.6){ p.tick=T.pool.tick; try{ G.player.hurt({damage:T.pool.dmg,kind:'burn',dir:V(0,0,0),knockback:1}); }catch(e){} } } }

/* the cisterns */
function pullTank(i,by){ const t=tanks[i]; if(!t||t.level<.999||t.pull)return false; t.level=0; t.pull={t:-T.tank.lead,by:by||'rowan',hit:false}; sfx('chain');
  if(by!=='tobias'&&!B.said.pull){ B.said.pull=1; } return true; }
function updateTanks(dt){ for(const t of tanks){
  if(t.pull){ const p=t.pull; p.t+=dt; const on=p.t>=0&&p.t<=T.tank.pour;
    t.pour.visible=p.t>=0&&p.t<=T.tank.pour+.3; t.pm.opacity=on?.38:Math.max(0,.38*(1-(p.t-T.tank.pour)/.3));
    t.handle.position.y=1.15-.45*Math.max(0,1-Math.abs(p.t+.2)*2.5);
    if(on){ const c=t.lc; if(rnd()<dt*25)spawn(c.x+(rnd()-.5)*1.5,.15,c.z+(rnd()-.5)*1.5,{vx:(rnd()-.5)*3,vy:2+rnd()*2,vz:(rnd()-.5)*3,g:-9,size:.25,life:.5,color:'#cfe6f0',op:.6,add:false});
      if(p.t<.05)clearPools(c.x,c.z,t.circleR);
      if(!p.hit&&(B.state==='fight'||B.state==='shed'||B.state==='rising')&&Math.hypot(B.x-c.x,B.z-c.z)<=t.circleR+.6*B.scale){ p.hit=true; douse(T.douse,{by:p.by}); } }
    if(p.t>T.tank.pour+.35){ t.pull=null; t.pour.visible=false; if(!p.hit&&p.by==='rowan'&&fighting()&&!B.said.miss){ B.said.miss=1; say('The water hits empty floor. It has to be standing under the spout.','Rowan',{key:'nfMiss'}); } } }
  else t.level=Math.min(1,t.level+dt/T.tank.refill);
  t.wtop.position.y=.3+1.7*t.level; t.mm.opacity=.05+.09*(t.level>=.999?1:0)+.03*Math.sin(G.time*3)*(t.level>=.999?1:0); } }
/* the great cistern tips over the pit: a wall of water onto the giant, wherever it is */
const bigCol={m:null,t:9};
function bigPour(){ if(!bigCol.m){ bigCol.m=new THREE.Mesh(new THREE.CylinderGeometry(1.6,2.6,H-2,16,1,true),new THREE.MeshBasicMaterial({color:col('#b8dcec'),transparent:true,opacity:0,depthWrite:false})); root.add(bigCol.m); }
  bigCol.t=0; bigCol.m.position.set(B.x,(H-2)/2,B.z); bigCol.m.visible=true; great.tip=1; }
function updateBig(dt){ if(great)great.g.rotation.x=damp(great.g.rotation.x,great.tip?.7:0,3,dt); if(bigCol.t>=3){ if(bigCol.m)bigCol.m.visible=false; if(great&&great.tip&&bigCol.t<9){ great.tip=0; bigCol.t=9; } return; }
  bigCol.t+=dt; bigCol.m.material.opacity=.6*(1-smooth(1.6,2.6,bigCol.t))*Math.min(1,bigCol.t*4); bigCol.m.position.set(B.x,(H-2)/2,B.z);
  if(rnd()<dt*20)steam(B.x,0,B.z,1,{r:3,h:3}); }

/* the giant's brain */
function updateGiant(dt){
  const P=G.player, pl=P&&P.pos?{x:P.pos.x-O.x,y:P.pos.y-O.y,z:P.pos.z-O.z}:{x:0,y:0,z:R};
  B.flash=Math.max(0,B.flash-dt*3);
  if(B.state==='rising'){ B.rise+=dt; const k=smooth(0,1,B.rise/B.riseDur); B.y=lerp(-8,pitY(0),k);
    if(rnd()<dt*20)embers(rnd()*2-1,0,rnd()*2-1,2,{r:PIT_R*.6,speed:2,up:6});
    B.heading=U.dampAngle?U.dampAngle(B.heading,Math.atan2(pl.x-B.x,pl.z-B.z),1.5,dt):B.heading;
    if(B.rise>=B.riseDur){ B.state='fight'; B.cool=1.2; } return; }
  if(B.state==='shed'){ B.shed.t+=dt; if(B.shed.t>2.2){ B.state='fight'; B.shed=null; B.cool=.8; } return; }
  if(B.state!=='fight')return;
  if(B.hold||cineOn()||P.alive===false||!isPlay())return;
  if(B.doused>0){ B.doused-=dt; B.walkK=damp(B.walkK,0,6,dt); if(rnd()<dt*8)steam(B.x,1.5,B.z,1,{r:1.2,h:3}); if(B.doused<=0){ B.doused=0; sfx('roar'); B.cool=.6; } return; }
  const dx=pl.x-B.x, dz=pl.z-B.z, d=Math.hypot(dx,dz), ph=B.phase-1;
  B.under=d<2.2*B.scale+.4?B.under+dt:Math.max(0,B.under-dt*2);
  if(!B.atk){
    B.heading=U.dampAngle?U.dampAngle(B.heading,Math.atan2(dx,dz),T.turn[ph],dt):Math.atan2(dx,dz);
    const want=3.2*B.scale+.8, mv=d>want?T.speed[ph]*(d-want>3?1:.6):0;
    if(mv>0){ const nx=B.x+Math.sin(B.heading)*mv*dt, nz=B.z+Math.cos(B.heading)*mv*dt, r=Math.hypot(nx,nz), lim=R-2.2*B.scale-.6;
      if(r<lim){ B.x=nx; B.z=nz; } else { B.x=nx/r*lim; B.z=nz/r*lim; } }
    B.walkK=damp(B.walkK,mv>0?1:0,5,dt);
    B.cool-=dt; if(B.cool<=0&&pl.y<4)chooseAttack(pl);
  } else { B.walkK=damp(B.walkK,0,8,dt); if(!B.atk.fired&&B.atk.kind!=='erupt'&&B.atk.kind!=='stomp')B.heading=U.dampAngle?U.dampAngle(B.heading,Math.atan2(dx,dz),B.atk.kind==='hurl'?3:1.2,dt):B.heading; updateAttack(dt,pl); }
  B.y=pitY(Math.hypot(B.x,B.z));
}
/* push Rowan out of its feet (it's a wall of rock) */
function pushPlayer(){ const P=G.player; if(!P||!P.pos||!GI.g.visible||B.state==='dead')return; const gx=O.x+B.x, gz=O.z+B.z, dx=P.pos.x-gx, dz=P.pos.z-gz, d=Math.hypot(dx,dz), rr=1.45*B.scale+.35;
  if(d<rr&&d>1e-4&&P.pos.y-O.y<3.5*B.scale){ const k=(rr-d)/d; const nx=P.pos.x+dx*k, nz=P.pos.z+dz*k; if(sdPhys(nx-O.x,nz-O.z)<-.38){ P.pos.x=nx; P.pos.z=nz; } } }

/* the pose: walking, winding up, striking, kneeling, the scripted endings */
const _w=V();
function pose(dt){
  const g=GI.g; if(!g)return; g.visible=B.state!=='dormant'&&!(B.state==='dead'&&!debris.length&&!B._crumbled);
  if(!g.visible)return;
  B.scale=damp(B.scale,B.sTarget,2.5,dt);
  g.position.set(B.x,B.y,B.z); g.rotation.y=B.heading; g.scale.setScalar(B.scale);
  const t=G.time, a=B.atk, w=a&&!a.fired?clamp(a.t/a.wind,0,1):0, f=a&&a.fired?1:0, ph=B.phase;
  B.walk+=dt*B.walkK*(2.6+ph*.5); const sw=Math.sin(B.walk), k=B.walkK;
  let hipsY=3.0+Math.abs(Math.cos(B.walk))*.12*k, tx=.05+.08*k, ty=0, hx=0;
  const L=[{hx:sw*.5*k,kx:Math.max(0,-sw)*.7*k},{hx:-sw*.5*k,kx:Math.max(0,sw)*.7*k}];
  const A=[{x:-sw*.3*k,z:-.18,y:0,e:-.35},{x:sw*.3*k,z:.18,y:0,e:-.35}];
  const kneel=(B.doused>0||B.state==='down'||B.state==='rising');
  if(kneel){ const kk=B.state==='rising'?1-smooth(.6,1,B.rise/B.riseDur):1; hipsY=lerp(hipsY,1.75,kk); tx=lerp(tx,.55,kk); hx=lerp(0,.35,kk);
    L[0].hx=lerp(L[0].hx,-1.35,kk); L[0].kx=lerp(L[0].kx,1.5,kk); L[1].hx=lerp(L[1].hx,-.2,kk); L[1].kx=lerp(L[1].kx,1.9,kk);
    for(const q of A){ q.x=lerp(q.x,-.35,kk); q.e=lerp(q.e,-.2,kk); } }
  if(a&&!kneel){
    if(a.kind==='slam'){ if(!f){ for(const q of A){ q.x=-2.9*w; q.e=-.6*w; q.z*=.3; } tx=-.25*w; } else { for(const q of A){ q.x=-.95; q.e=0; q.z*=.2; } tx=.5; } }
    else if(a.kind==='sweep'){ if(!f){ ty=-.8*w; A[0].z=-1.3*w; A[1].z=1.3*w; tx=.15; } else { ty=1.1; A[0].z=-1.3; A[1].z=1.3; } }
    else if(a.kind==='hurl'){ const r=A[1]; if(!f){ if(w<.5){ r.x=-.7*(w/.5); tx=.45*(w/.5); } else { r.x=lerp(-.7,-3.1,(w-.5)/.5); tx=lerp(.45,-.15,(w-.5)/.5); } } else { r.x=-1.1; tx=.3; } }
    else if(a.kind==='stomp'){ if(!f){ L[1].hx=-.9*w; L[1].kx=.9*w; } }
    else if(a.kind==='erupt'){ if(!f){ A[0].z=-1.25*w; A[1].z=1.25*w; for(const q of A)q.x=-1.2*w; hx=-.4*w; tx=-.2*w; } else { for(const q of A){ q.x=-.2; q.z*=.3; } tx=.35; } }
  }
  if(B.state==='shed'){ const s=B.shed?B.shed.t:0, r=Math.sin(Math.min(1,s/2)*PI); A[0].z=-1.4*r; A[1].z=1.4*r; for(const q of A)q.x=-1.4*r; hx=-.55*r; tx=-.2*r; }
  // the scripted poses (the story's endings)
  const sc=B.script;
  if(sc){ sc.t+=dt;
    if(sc.kind==='lunge'){ const kk=smooth(0,.9,sc.t); B.x=lerp(sc.x0,sc.x1,kk); B.z=lerp(sc.z0,sc.z1,kk); hipsY=lerp(1.75,2.6,Math.sin(kk*PI)); tx=.75; for(const q of A){ q.x=-1.6; q.e=-.1; q.z*=.3; } hx=-.2; }
    else if(sc.kind==='grab'){ const kk=smooth(0,.7,sc.t); tx=lerp(.55,.65,kk); A[0].z=.5*kk; A[1].z=-.5*kk; for(const q of A){ q.x=-1.45; q.e=-.25; } hipsY=1.9; }
    else if(sc.kind==='clutch'){ hipsY=1.9; tx=.2; hx=.1; for(let i=0;i<2;i++){ const q=A[i]; q.x=-1.05; q.z=(i?-1:1)*.95; q.e=-1.45; } }
    if(sc.kind==='lunge'||sc.kind==='grab'||sc.kind==='clutch'){ B.y=pitY(Math.hypot(B.x,B.z)); }
  }
  const D=(o,key,v,kr)=>{ o.rotation[key]=damp(o.rotation[key],v,kr,dt); }, fast=a&&a.fired?18:7;
  GI.hips.position.y=damp(GI.hips.position.y,hipsY,6,dt);
  D(GI.torso,'x',tx,fast); D(GI.torso,'y',ty,fast); D(GI.head,'x',hx+(kneel?.25:0),5); GI.head.rotation.y=Math.sin(t*.7)*.15;
  for(let i=0;i<2;i++){ const l=GI.legs[i]; D(l.hipJ,'x',L[i].hx,8); D(l.knee,'x',L[i].kx,8);
    const ar=GI.arms[i]; D(ar.sh,'x',A[i].x,fast); D(ar.sh,'z',A[i].z,fast); D(ar.sh,'y',A[i].y,fast); D(ar.el,'x',A[i].e,fast); }
  // footsteps
  if(k>.3){ const ph2=Math.floor(B.walk/PI); if(ph2!==B._step){ B._step=ph2; sfx('step'); try{ G.ui.shake&&G.ui.shake(.08*B.scale); }catch(e){} } }
  // the glow: molten when hot, grey-dark when doused, white-hot when down
  const cold=B.doused>0, hot=B.state==='down'?1:0;
  if(B.state!=='dying'&&B.state!=='dead'){
    const sc2=cold?'#3a3438':(hot?'#ffffff':'#e8e0d8'); GI.seamMat.color.lerp(_c.set(sc2),1-Math.exp(-6*dt));
    GI.coreMat.color.lerp(_c.set(cold?'#7a4a38':'#ffffff'),1-Math.exp(-6*dt));
    const pulse=hot?.6+.4*Math.sin(t*9):.85+.15*Math.sin(t*3);
    GI.haloMat.opacity=(cold?.15:.55+.25*(ph-1)/2+hot*.4)*pulse; GI.halo.scale.setScalar(2.4+(ph-1)*.6+hot*2.5);
    GI.coreLight.intensity=(cold?.2:.8+hot*1.6)*pulse;
    const em=cold?'#2a2a30':(hot?'#ffe0b0':'#ff7a2a'); GI.rockMat.emissive.lerp(_c.set(em),1-Math.exp(-5*dt)); GI.woodMat.emissive.lerp(_c.set(cold?'#000000':'#ff6a20'),1-Math.exp(-5*dt));
    if(B.flash>0)GI.rockMat.emissive.lerp(_c.set('#ffd0a0'),B.flash*.5);
    GI.rockMat.color.lerp(_c.set(cold?'#9a9aa4':'#ffffff'),1-Math.exp(-5*dt));
  }
  // what it's holding (clutch): kept at its chest
  if(B.clutch&&B.clutch.obj){ const o=B.clutch.obj; GI.core.getWorldPosition(_w); _w.y-=1.0*B.scale; const fw={x:Math.sin(B.heading),z:Math.cos(B.heading)}; _w.x+=fw.x*.6*B.scale; _w.z+=fw.z*.6*B.scale;
    if(o.parent){ const l=o.parent.worldToLocal(_w.clone()); o.position.copy(l); } o.rotation.y=B.heading+PI; }
  // the hurtbox follows it
  HB.pos.set(O.x+B.x,O.y+Math.max(0,B.y),O.z+B.z); HB.radius=1.5*B.scale; HB.height=(kneel?4.4:6.2)*B.scale; HB.lockOffset=(kneel?2.2:3)*B.scale;
}
const _c=new THREE.Color();

/* the scripted poses, for the story */
function lunge(wp){ if(!wp)return; const tx=wp.x-O.x, tz=wp.z-O.z, d=Math.hypot(tx-B.x,tz-B.z)||1, go=Math.min(1.8,Math.max(0,d-1.6));
  B.heading=Math.atan2(tx-B.x,tz-B.z); B.script={kind:'lunge',t:0,x0:B.x,z0:B.z,x1:B.x+(tx-B.x)/d*go,z1:B.z+(tz-B.z)/d*go}; sfx('roar'); }
function grab(wp){ if(wp){ B.heading=Math.atan2(wp.x-O.x-B.x,wp.z-O.z-B.z); } B.script={kind:'grab',t:0}; sfx('whoosh'); }
function clutch(obj){ B.script={kind:'clutch',t:0}; B.clutch={obj}; sfx('crack'); }

/* ================================================================ 7. THE FIRE, THE ROOM'S LIFE */
function setFire(mode){ if(!FIRE[mode])return; S.fire=mode; }
function updateFire(dt){
  const F=FIRE[S.fire]||FIRE.lure, t=G.time||0;
  fireNow.h=damp(fireNow.h,F.h,1.6,dt); fireNow.I=damp(fireNow.I,F.I,1.6,dt); fireNow.o=damp(fireNow.o,F.o||1,1.6,dt);
  const kk=1-Math.exp(-1.6*dt); fireNow.a.lerp(_c.set(F.a),kk); fireNow.b.lerp(_c.set(F.b),kk); fireNow.L.lerp(_c.set(F.L),kk); fireNow.glow.lerp(_c.set(F.glow),kk);
  const fl=.85+.15*Math.sin(t*8.3)*Math.sin(t*3.1), still=S.fire==='true'?.5:1;
  for(let i=0;i<fireCones.length;i++){ const c=fireCones[i], m=fireMats[i]; c.scale.set(1+.08*Math.sin(t*5+i),Math.max(.01,fireNow.h*(1+(fl-1)*still)*(1+.12*Math.sin(t*6.3+i*1.7))),1+.08*Math.cos(t*4+i));
    c.rotation.y+=dt*(.4+i*.15)*(i%2?1:-1); m.color.copy(i<2?fireNow.a:fireNow.b); m.opacity=Math.min(.6,fireNow.h)*(.08+.035*i)*fireNow.o; c.visible=fireNow.h>.35; }
  for(const q of tongues){ q.ph=(q.ph+dt*q.sp0*.8)%1; const k=q.ph, hh=fireNow.h; q.sp.position.set(q.x*(1-k*.6),.6+k*4.2*hh,q.z*(1-k*.6)); q.sp.scale.set((1.6-k)*1.3*Math.max(.3,hh),(2.2-k)*1.6*hh,1);
    q.m.color.copy(k<.4?fireNow.b:fireNow.a); q.m.opacity=hh>.05?Math.sin(k*PI)*.55*Math.min(1,hh)*fireNow.o:0; q.sp.visible=hh>.03; }
  fireLight.color.copy(fireNow.L); fireLight.intensity=fireNow.I*fl; pitGlowMat.color.copy(fireNow.glow);
  if(fireNow.h>.1&&rnd()<dt*12)embers((rnd()-.5)*3,-.5,(rnd()-.5)*3,1,{speed:.6,up:5*fireNow.h,color:'#'+fireNow.b.getHexString()});
  if(S.fire==='out'&&rnd()<dt*4)steam((rnd()-.5)*2,-.5,(rnd()-.5)*2,1,{r:.5,h:.5});
}

/* ================================================================ 8. IN AND OUT */
function fadeEl(){ return document.getElementById('fade'); }
function startTrans(dir,o){ o=o||{}; if(S.trans)return false;
  if(dir==='out'&&fighting())return false;
  if(o.instant){ doTeleport(dir); return true; }
  S.trans={dir,t:0,done:false}; const f=fadeEl(); if(f){ f.style.transition='opacity .8s'; f.style.opacity='1'; }
  try{ G.player.setControl&&G.player.setControl(false); }catch(e){} return true; }
function updateTrans(dt){ const Tr=S.trans; if(!Tr)return; Tr.t+=dt;
  if(!Tr.done&&Tr.t>=.9){ Tr.done=true; doTeleport(Tr.dir); const f=fadeEl(); if(f)f.style.opacity='0'; }
  if(Tr.t>=1.35){ try{ G.player.setControl&&G.player.setControl(true); }catch(e){} S.trans=null; } }
function doorOut(){
  const NI=G.northIsle; if(NI&&NI.doorOut){ try{ const d=NI.doorOut(); if(d&&isFinite(d.x))return d; }catch(e){} }
  const dp=NI&&NI.debug&&NI.debug.doorPos, Tw=NI&&NI.tower;
  if(dp&&Tw){ const dx=dp.x-Tw.x, dz=dp.z-Tw.z, dl=Math.hypot(dx,dz)||1, x=dp.x+dx/dl*2.2, z=dp.z+dz/dl*2.2; return {x,y:G.world.height(x,z),z,yaw:Math.atan2(dx,dz)}; }
  return {x:150,y:G.world.height(150,-690),z:-690,yaw:PI}; }
function doTeleport(dir){
  const P=G.player;
  if(dir==='in'){ build(); const first=!S.entered; S.entered=true;
    const d=toWorld(DOOR.x,DOOR.y,DOOR.z); setInside(true); P.teleport(d.x,d.y,d.z,DOOR.yaw); if(P.aimCamera)P.aimCamera(DOOR.yaw,.32);
    setCp(); G.atmo.dark=G.atmo.darkTarget=1;
    G.emit('northFire:enter',{first});
  }
  else { const d=doorOut(); setInside(false); P.teleport(d.x,d.y,d.z,d.yaw); if(P.aimCamera)P.aimCamera(d.yaw,.3);
    try{ G.state.checkpoint.set(d.x,d.y,d.z); G.state.checkpointYaw=d.yaw; G.state.checkpointName='the north island'; }catch(e){}
    try{ if(G.northCave&&G.northCave.state)G.northCave.state.prevCp=null; }catch(e){}
    G.atmo.dark=G.atmo.darkTarget=0; G.emit('northFire:exit',{}); }
}
function setCp(){ const d=toWorld(DOOR.x,DOOR.y,DOOR.z); try{ G.state.checkpoint.copy(d); G.state.checkpointYaw=DOOR.yaw; G.state.checkpointName='the fire room'; }catch(e){} }
const KEEP=new Set(['world','lighthouse','alchemy','northIsle','northLight','rowanBoat']), hidden=[]; let farPrev=null;
function hideOutside(on){
  if(on){ hidden.length=0; for(const ch of G.scene.children){ if(!KEEP.has(ch.name))continue;
      const walk=o=>{ let hasLight=false; o.traverse(c=>{ if(c.isLight)hasLight=true; }); if(!hasLight){ if(o.visible){o.visible=false;hidden.push(o);} return; } for(const c of o.children)if(!c.isLight)walk(c); }; walk(ch); }
    farPrev=G.camera.far; G.camera.far=120; G.camera.updateProjectionMatrix(); S.hid=true; }
  else{ for(const o of hidden)o.visible=true; hidden.length=0; if(S.hid){ G.camera.far=farPrev||1200; G.camera.updateProjectionMatrix(); } S.hid=false; } }
function setInside(v){ if(v===S.inside)return; S.inside=v; API.inside=v;
  G.interior=v?INTERIOR:(G.interior===INTERIOR?null:G.interior); root.visible=v;
  if(v){ if(!(G.northCave&&G.northCave.inside))hideOutside(true); } else hideOutside(false);
  if(G.renderer&&G.renderer.shadowMap){ G.renderer.shadowMap.autoUpdate=!v; if(!v)G.renderer.shadowMap.needsUpdate=true; }
  if(!v){ if(fighting()||B.state==='down')resetFight('left'); try{ G.ui.dropCaptions&&G.ui.dropCaptions('nf'); }catch(e){} }   // the room's lines stay in the room
}

/* ================================================================ 9. RESET, FINISH, SAVE */
function resetFight(why){
  B.state='dormant'; B.atk=null; B.doused=0; B.script=null; B.clutch=null; B.shed=null; B.hold=false; B.crumbleT=-1; B._crumbled=false; B.under=0;
  B.phase=1; B.hp=T.hp; B.x=0; B.z=0; B.y=-8; B.scale=B.sTarget=1;
  clearDecals(); clearPools(); for(const p of projs){ root.remove(p.m); } projs.length=0;
  for(const t of tanks){ t.level=1; t.pull=null; t.pour.visible=false; }
  reattachAll(); if(GI.g)GI.g.visible=false; resetGlow(); G.ui.bossBar(null); music(false);
  if(!S.done)setFire('lure');
  if(why)G.emit('northFire:reset',{why});
}
function resetGlow(){ if(!GI.seamMat)return; GI.seamMat.color.set('#e8e0d8'); GI.coreMat.color.set('#ffffff'); GI.haloMat.opacity=.7; GI.coreLight.intensity=1; GI.rockMat.emissive.set('#ff7a2a'); GI.rockMat.color.set('#ffffff'); GI.woodMat.emissive.set('#ff6a20'); }
function finish(outcome){ if(S.done)return; S.done=true; S.outcome=outcome==='died'?'died':'lived';
  if(B.state!=='dead'&&B.state!=='dying'){ if(B.state!=='dormant'){ crumble(); } }
  G.ui.bossBar(null); music(false); G.emit('northFire:finish',{outcome:S.outcome});
  try{ G.flow&&G.flow.writeSave&&later(1.5,()=>{ if(isPlay())G.flow.writeSave(); }); }catch(e){} }
function applyDone(){ // after a load: the room as the ending left it
  build(); resetFight(null); if(GI.g)GI.g.visible=false; B.state='dead';
  if(S.fell)rubbleShow(true,S.fell[0],S.fell[1]); else rubbleShow(true,0,-(PIT_R+1.6));
  setFire(S.outcome==='died'?'out':'true'); }
let built=false; function build(){ if(built)return; built=true; try{ buildRoom(); G.combat.add(HB); }catch(e){ console.error('northFire',e); } }
const reg=()=>G.persist&&G.persist.register&&G.persist.register('northFire',{
  save:()=>({v:1,entered:S.entered,done:S.done,outcome:S.outcome,fell:S.fell}),
  load:d=>{ if(!d)return; S.entered=!!d.entered; S.done=!!d.done; S.outcome=d.outcome==='died'?'died':d.outcome==='lived'?'lived':null; S.fell=Array.isArray(d.fell)?d.fell:null;
    B.first=!S.entered; if(S.done)applyDone(); else { build(); resetFight(null); } }});
if(G.persist&&G.persist.register)reg(); else G.on('ready',reg);
G.on('game:reset',()=>{ S.entered=false; S.done=false; S.outcome=null; S.fell=null; B.first=true; B.said={}; if(built){ resetFight(null); rubbleShow(false); setFire('lure'); } });
/* Rowan dies in the fight: it all stops; on rising (at the door) it resets cleanly */
G.on('player:dead',()=>{ if(!S.inside||S.done)return; if(B.state==='dormant'||B.state==='dead')return; B.atk=null; clearDecals(); setCp(); B.diedHere=true; });
G.on('player:respawn',()=>{ if(!B.diedHere)return; B.diedHere=false; resetFight('death');
  later(.02,()=>{ const P=G.player; if(!P||!P.teleport)return; const d=toWorld(DOOR.x,DOOR.y,DOOR.z); if(Math.hypot(P.pos.x-d.x,P.pos.z-d.z)>2.5)P.teleport(d.x,d.y,d.z,DOOR.yaw); });
  });

/* ================================================================ 10. WIRING */
G.system('northFire',{order:87,modes:['play','paused','dead','title'],
  init(){
    build(); root.visible=false;
    const IA=G.interact, ins=()=>isPlay()&&S.inside&&!S.trans&&!cineOn();
    // the cisterns are for the fight only: not before it, not in a scene, never once it's over
    const tankOn=()=>ins()&&!S.done&&fighting()&&!(G.northFireStory&&G.northFireStory.scene);
    for(const t of tanks)IA.add({pos:()=>t.chainPos,radius:1.8,priority:7,label:()=>t.level>=.999&&!t.pull?'Pull the chain':'The cistern is filling',
      enabled:tankOn,use:()=>{ if(!pullTank(t.i,'rowan'))say('Still filling. Somewhere above, water trickles in.',null,{key:'nfFill'}); }});
    IA.add({pos:()=>toWorld(DOOR.x,.3,R-1.0),radius:1.7,priority:6,label:'Go down the stair',enabled:()=>ins()&&!fighting()&&B.state!=='down'&&B.state!=='dying'&&(S.done||B.state==='dormant'),use:()=>startTrans('out')});
  },
  update(dt){
    dt=dt||0;
    for(let i=timers.length-1;i>=0;i--){ if(G.time>=timers[i].t){ const f=timers[i].fn; timers.splice(i,1); try{ f(); }catch(e){ console.error(e); } } }
    updateTrans(dt);
    const P=G.player;
    if(P&&P.pos&&!S.trans){ const inR=inBoxW(P.pos.x,P.pos.z)&&P.pos.y>O.y-20; if(inR!==S.inside)setInside(inR); }
    if(!S.inside)return;
    // northcave.js un-hides the outside when it notices you've left it: hide it again once it has
    if(!S.hid&&!(G.northCave&&G.northCave.inside))hideOutside(true);
    if(G.interior!==INTERIOR)G.interior=INTERIOR;
    const m=G.state.mode;
    if(m!=='title')G.atmo.darkTarget=.8;
    G.lights.sun.intensity=0;
    { const fog=G.scene.fog; if(fog){ fog.color.copy(FOG0); if(G.scene.background&&G.scene.background.isColor)G.scene.background.copy(fog.color); }
      G.lights.hemi.color.lerp(HEMI_SKY,.75); G.lights.hemi.groundColor.lerp(HEMI_GND,.75); }
    if(m==='paused'||m==='title')return;
    updateFire(dt); updateFx(dt); updateDecals(dt); updateDebris(dt); updateBig(dt);
    // no story module: the fight arms itself a moment after you're in the room (entry, a respawn, a load mid-fight)
    if(m==='play'&&!G.northFireStory&&!S.done&&B.state==='dormant'&&!S.trans){ B.idle=(B.idle||0)+dt; if(B.idle>1.5){ B.idle=0; rise({short:!B.first}); } } else B.idle=0;
    if(m==='play'){ updateTanks(dt);
      if(B.state==='dying')updateCrumble(dt); else updateGiant(dt);
      if(!cineOn()){ updateProjs(dt); updatePools(dt,P&&P.pos?{x:P.pos.x-O.x,y:P.pos.y-O.y,z:P.pos.z-O.z}:null); }
      pushPlayer(); }
    pose(dt);
    if(fighting())G.ui.bossBar('The Wreck Giant',B.hp/T.hp);
  }
});
const FOG0=col('#0c0605'), HEMI_SKY=col('#5a3a2a'), HEMI_GND=col('#150b08');

const API=G.northFire={inside:false,O,R,PIT_R,H,DOOR,pol,toWorld,root,state:S,T,
  enter:o=>startTrans('in',o), exit:o=>startTrans('out',o),
  tanks, pullTank, get great(){ return great; },
  giant:{ get state(){ return B.state; }, get phase(){ return B.phase; }, get hp(){ return B.hp; }, get maxHp(){ return T.hp; },
    get pos(){ return giantW(); }, get heading(){ return B.heading; }, get scale(){ return B.scale; }, get doused(){ return B.doused>0; },
    rise, hold:on=>{ B.hold=!!on; if(on){ B.atk=null; clearDecals(); } }, douse, setPhase:n=>{ n=clamp(n|0,1,3); if(n>B.phase){ const keep=B.state; startShed(n); if(keep==='down'||keep==='rising'){ B.state=keep; B.shed=null; } } },
    setHp:v=>{ B.hp=clamp(+v||0,0,T.hp); if(B.hp<=0&&(B.state==='fight'||B.state==='shed'))goDown(); },
    lunge, grab, clutch, crumble, reset:()=>resetFight('script'),
    get model(){ return GI.g; }, get core(){ return GI.core; } },
  get fighting(){ return fighting(); },
  setFire, get fire(){ return S.fire; }, finish,
  debug:{ B, S, T, GI, HB, tanks, decals, pools, projs, debris, hit:(dmg,kind)=>hitGiant({damage:dmg||3,kind:kind||'melee'}), attack:k=>{ const P=G.player; B.atk=null; clearDecals(); chooseAttack({x:P.pos.x-O.x,y:P.pos.y-O.y,z:P.pos.z-O.z},k||null); return B.atk&&B.atk.kind; },
    resetFight, applyDone, doTeleport, bigPour, sdPhys }};
})();

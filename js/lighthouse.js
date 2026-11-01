/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — lighthouse.js
   The tower on the headland: weathered ivory stone, slate/iron lamp room,
   interior spiral stair (floor provider + wall constrainer), the darkness
   veil in the doorway, the Keeper's Staff on the stairwell wall, and the
   lamp-room cure sequence (blob, lens, beam, G.atmo.cured).
   Ported from the-moth-climb.html (getFloor / constrain / cure).
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);

/* ---------------------------------------------------------------- dimensions */
const lm=(G.world.landmarks&&G.world.landmarks.lighthouse)||{x:180,y:42,z:0};
const CX=lm.x!=null?lm.x:180, CZ=lm.z!=null?lm.z:0;
const BASE=(lm.y!=null&&isFinite(lm.y))?lm.y:42;
const HEIGHT=24, TOP=BASE+HEIGHT;           // lamp-room floor
const OUT_R=4.2, IN_R=3.7, COL_R=0.9;        // collision radii (constant)
const VIS_R0=4.28, VIS_R1=3.92;              // visual outer radius at base / top (taper)
const GLASS_R=3.75, GAL_R=VIS_R1+1.05;       // lamp-room glass, gallery edge
const GLASS_Y0=TOP+.55, GLASS_Y1=TOP+3.25;   // glass band
const DOOR_A=PI;                             // door faces west (-x)
const DOOR_HW=.82, DOOR_SPRING=2.25, DOOR_TOPY=DOOR_SPRING+DOOR_HW; // door half width, arch spring, arch apex (relative to BASE)
const ASTART=DOOR_A+0.55, TURNS=3, TOTAL=TAU*TURNS, HATCH=1.6;
const STAIR_MID=(IN_R+COL_R)/2;
const STAFF_T=.48;
const visR=y=>U.lerp(VIS_R0,VIS_R1,U.clamp((y-BASE)/HEIGHT,0,1));
const stairH=t=>BASE+t*HEIGHT;
const relA=a=>(((a-ASTART)%TAU)+TAU)%TAU;
const wx=(a,r)=>CX+Math.cos(a)*r, wz=(a,r)=>CZ+Math.sin(a)*r;
// three.js cylinder theta for world angle a (atan2(z,x)):  theta = PI/2 - a
const thOf=a=>PI/2-a;

const lampCenter=V(CX,TOP+1.65,CZ);
const cradlePos=V(CX,TOP+.95,CZ);
const doorOut=V(wx(DOOR_A,OUT_R+1.4),BASE+1.4,wz(DOOR_A,OUT_R+1.4));
const doorIn=V(wx(DOOR_A,IN_R-1.2),BASE+1.4,wz(DOOR_A,IN_R-1.2));
const staffA=ASTART+STAFF_T*TOTAL+.18;
function stairAt(a,turnHint){ // stair height at angle a on the turn nearest t~turnHint
  const r=relA(a); let best=null,bd=1e9;
  for(let k=0;k<=TURNS;k++){const t=(r+TAU*k)/TOTAL; if(t>1)break; const d=Math.abs(t-turnHint); if(d<bd){bd=d;best=t;}}
  return stairH(best);
}
const STAFF_STEP_Y=stairAt(staffA,STAFF_T);
const staffPos=V(wx(staffA,IN_R-.22),STAFF_STEP_Y+1.25,wz(staffA,IN_R-.22));

const glassPoints=[];
for(let row=0;row<3;row++){const n=14,y=TOP+.95+row*.95;
  for(let i=0;i<n;i++){const a=(i+(row%2)*.5)/n*TAU; glassPoints.push(V(wx(a,GLASS_R+.18),y,wz(a,GLASS_R+.18)));}}

const rOf=v=>Math.hypot(v.x-CX,v.z-CZ);
const inBody=v=>rOf(v)<OUT_R&&v.y<TOP-.3&&v.y>BASE-1.5;
const inRoom=v=>rOf(v)<OUT_R+.3&&v.y>=TOP-.3&&v.y<TOP+4.5;
const inside=v=>inBody(v)||inRoom(v);

G.world.lighthouse={x:CX,z:CZ,baseY:BASE,topY:TOP,outerR:OUT_R,innerR:IN_R,colR:COL_R,glassR:GLASS_R,
  doorAngle:DOOR_A,doorHalfWidth:DOOR_HW,doorOut,doorIn,lampCenter,cradlePos,glassPoints,stairRadius:STAIR_MID,
  stairStart:ASTART,stairTurns:TURNS,hatch:HATCH,staffPos:staffPos.clone(),
  inBody,inRoom,inside,
  stairHeight:(a,t)=>stairAt(a,t==null?.5:t)};
G.items.staff.pos.copy(staffPos);

/* ---------------------------------------------------------------- state */
const S=G.lighthouse={curedDark:.5,cure:null,cured:false,said:{},blockT:-9,lastBlockSay:-99,wasInside:false,
  staffTaken:false,canEnter:null,startCure:null,veilOpacity:1};
const say=(k,t,who)=>{ if(S.said[k])return; S.said[k]=true; G.ui.say(t,who); };
const playing=()=>G.state.mode==='play'||G.state.mode==='dead';
const lantern=()=>G.items.lantern;
function lanternWorld(){const L=lantern(); return L.carried?(L.world.lengthSq()>0?L.world:G.player.pos):L.pos;}
function canEnter(){
  if(S.cure||S.cured)return true;
  const L=lantern(); if(!L.lit())return false;
  if(L.carried)return true;
  return L.inCradle||inside(L.pos);
}
S.canEnter=canEnter;

/* ---------------------------------------------------------------- physics: floor */
G.floorProviders.push((x,z,y)=>{
  const dx=x-CX, dz=z-CZ, r=Math.hypot(dx,dz);
  if(r>GAL_R+.1)return null;
  let f=null;
  if(r<OUT_R+.05&&y>BASE-1.5){
    f=BASE;                                            // ground floor of the tower
    const a=relA(Math.atan2(dz,dx));
    if(r>=COL_R-.05&&r<=IN_R+.1){
      for(let k=0;k<=TURNS;k++){const t=(a+TAU*k)/TOTAL; if(t>1)break; const sh=stairH(t); if(sh<=y+.9&&sh>f)f=sh;}
    }
    const inHatch=r>=COL_R-.05&&r<=IN_R+.1&&a>=TAU-HATCH;
    if(y+.9>=TOP&&!inHatch)f=Math.max(f,TOP);
  }else if(y+.9>=TOP){ f=TOP; }                          // gallery
  return f;
});

/* ---------------------------------------------------------------- physics: walls */
const cosD=Math.cos(DOOR_A), sinD=Math.sin(DOOR_A);
let blockedThisMove=false;
G.constrainers.push((prev,next,y,rad,who)=>{
  rad=rad||.4;
  const pdx=prev.x-CX, pdz=prev.z-CZ, pr=Math.hypot(pdx,pdz);
  let dx=next.x-CX, dz=next.z-CZ, r=Math.hypot(dx,dz);
  if(r>GAL_R+rad+1&&pr>GAL_R+rad+1)return false;
  if(y<BASE-3||y>TOP+6)return false;
  const isPlayer=(who==null||who==='player');
  let blocked=false;
  const set=(nr,a)=>{next.x=CX+Math.cos(a)*nr; next.z=CZ+Math.sin(a)*nr; blocked=true;};
  if(y<TOP-.3){
    // door frame coordinates: along = outward along the door axis, lat = sideways
    const along=dx*cosD+dz*sinD, lat=-dx*sinD+dz*cosD;
    const lowEnough=y<BASE+DOOR_SPRING-1.3;
    const gapW=DOOR_HW-rad*.75;
    const inGap=isPlayer&&lowEnough&&along>0&&Math.abs(lat)<gapW;
    const a=Math.atan2(dz,dx);
    const clampLat=()=>{ const cl=U.clamp(lat,-gapW,gapW); next.x=CX+along*cosD-cl*sinD; next.z=CZ+along*sinD+cl*cosD; blocked=true; };
    if(pr<=IN_R-rad+.03){
      // stairwell
      if(r<COL_R+rad)set(COL_R+rad,a);
      else if(r>IN_R-rad&&!inGap)set(IN_R-rad,a);
    }else if(pr>=OUT_R+rad-.03||!isPlayer){
      // outside (monsters are always treated as outside)
      if(r<OUT_R+rad){
        if(!inGap)set(OUT_R+rad,a);
        else if(!canEnter()){ set(OUT_R+rad,a); blockedThisMove=true; }
      }
    }else{
      // in the door passage (only reachable through the gap)
      if(!inGap&&r>IN_R-rad-.02&&r<OUT_R+rad+.02)clampLat();
      if(r<COL_R+rad)set(COL_R+rad,Math.atan2(next.z-CZ,next.x-CX));
    }
  }else if(y<TOP+4.5){
    const a=Math.atan2(dz,dx);
    if(pr<GLASS_R+.2){
      // lamp room: between the pedestal and the glass
      if(r<.75+rad)set(.75+rad,a); else if(r>GLASS_R-rad)set(GLASS_R-rad,a);
      // rail around the hatch: only the arrival end (where the stair is level with the floor) is open
      const ra=relA(a), pra=relA(Math.atan2(pdz,pdx));
      const nr=Math.hypot(next.x-CX,next.z-CZ);
      const inH=(q,rr)=>q>=TAU-HATCH&&rr>=COL_R-.1&&rr<=IN_R+.1;
      if(inH(ra,nr)&&!inH(pra,pr)&&y>=TOP-.05){
        const stepY=stairH((ra+TAU*(TURNS-1))/TOTAL);
        if(stepY<TOP-.7){ next.x=prev.x; next.z=prev.z; blocked=true; }
      }
    }else{
      if(r<GAL_R+rad)set(GAL_R+rad,a);
    }
  }
  if(blockedThisMove&&isPlayer){ blockedThisMove=false; onDoorBlocked(); }
  return blocked;
});

function onDoorBlocked(){
  if(!playing())return;
  const L=lantern(), reason=(L.carried&&!L.lit())?'shut':'dark';
  if(G.time-S.blockT>1){ S.blockT=G.time; G.emit('door:blocked',{reason}); }
  if(G.time-S.lastBlockSay>9){
    S.lastBlockSay=G.time;
    if(reason==='shut') G.ui.say('The black in the doorway pushes back against you. Not with the shutter closed.');
    else if(!S.said.door){ S.said.door=true; G.ui.say('The doorway is black. Not dark, black. One step in and you can’t see your own hands. You back out.'); }
  }
}

/* ---------------------------------------------------------------- camera */
G.cameraConstrainers.push((cam,target)=>{
  const P=(G.player&&G.player.pos)||target; if(!P)return;
  const pr=rOf(P);
  if(inRoom(P)&&pr<GLASS_R){
    const dx=cam.x-CX,dz=cam.z-CZ,r=Math.hypot(dx,dz),lim=GLASS_R-.28;
    if(r>lim){cam.x=CX+dx/r*lim;cam.z=CZ+dz/r*lim;}
    cam.y=U.clamp(cam.y,TOP+.45,GLASS_Y1-.1);
    return;
  }
  if(inBody(P)&&pr<IN_R-.15){
    let dx=cam.x-CX,dz=cam.z-CZ,r=Math.hypot(dx,dz);
    const lim=IN_R-.3, mn=COL_R+.3;
    if(r>lim){cam.x=CX+dx/r*lim;cam.z=CZ+dz/r*lim;r=lim;}
    if(r<mn){ if(r<1e-4){dx=1;dz=0;r=1;} cam.x=CX+dx/r*mn; cam.z=CZ+dz/r*mn; r=mn; }
    // above the floor beneath it, below the stair one turn up
    const fl=G.floorAt(cam.x,cam.z,cam.y); if(cam.y<fl+.35)cam.y=fl+.35;
    const a=relA(Math.atan2(cam.z-CZ,cam.x-CX));
    let ceil=TOP-.15;
    for(let k=0;k<=TURNS;k++){const t=(a+TAU*k)/TOTAL; if(t>1)break; const h=stairH(t)-.4; if(h>P.y+1.7&&h<ceil)ceil=h;}
    if(cam.y>ceil)cam.y=Math.max(ceil,fl+.35);
    return;
  }
  // outside: keep the camera out of the masonry
  if(cam.y<TOP+4.5&&cam.y>BASE-2){
    const dx=cam.x-CX,dz=cam.z-CZ,r=Math.hypot(dx,dz);
    const lim=(cam.y>TOP-.4?GAL_R:visR(cam.y))+.35;
    if(r<lim&&r>1e-4){cam.x=CX+dx/r*lim;cam.z=CZ+dz/r*lim;}
  }
});

/* ---------------------------------------------------------------- textures */
function stoneCanvas(g,s,o){
  const rows=o.rows||8, rowH=s/rows, rnd=U.rng(o.seed||7);
  g.fillStyle=o.mortar||'#6d665c'; g.fillRect(0,0,s,s);
  for(let row=0;row<rows;row++){
    let x=-rnd()*rowH*2; const y0=row*rowH;
    while(x<s){
      const w=rowH*(1.3+rnd()*1.6), l=o.light+(rnd()-.5)*o.var;
      g.fillStyle=`hsl(${o.hue+rnd()*8},${o.sat+rnd()*6}%,${l}%)`;
      const r=Math.min(rowH*.22,10);
      const bx=x+2,by=y0+2,bw=w-4,bh=rowH-4;
      g.beginPath(); g.moveTo(bx+r,by); g.lineTo(bx+bw-r,by); g.quadraticCurveTo(bx+bw,by,bx+bw,by+r); g.lineTo(bx+bw,by+bh-r);
      g.quadraticCurveTo(bx+bw,by+bh,bx+bw-r,by+bh); g.lineTo(bx+r,by+bh); g.quadraticCurveTo(bx,by+bh,bx,by+bh-r); g.lineTo(bx,by+r); g.quadraticCurveTo(bx,by,bx+r,by); g.fill();
      for(let k=0;k<18;k++){g.fillStyle=`rgba(${rnd()<.5?40:255},${rnd()<.5?36:250},${rnd()<.5?30:240},${.04+rnd()*.05})`;g.beginPath();g.arc(bx+rnd()*bw,by+rnd()*bh,1+rnd()*2.5,0,TAU);g.fill();}
      g.fillStyle='rgba(0,0,0,.16)'; g.fillRect(bx+2,by+bh-5,bw-4,5);
      g.fillStyle='rgba(255,255,255,.10)'; g.fillRect(bx+3,by+1,bw-6,3);
      x+=w;
    }
  }
  if(o.streaks){ for(let i=0;i<26;i++){const x=rnd()*s,w=3+rnd()*10,h=s*(.2+rnd()*.6),y=rnd()*s;
    const gr=g.createLinearGradient(0,y,0,y+h); gr.addColorStop(0,'rgba(60,55,50,0)'); gr.addColorStop(.3,'rgba(60,55,50,.13)'); gr.addColorStop(1,'rgba(60,55,50,0)');
    g.fillStyle=gr; g.fillRect(x,y,w,h); if(y+h>s){g.fillRect(x,y-s,w,h);} } }
  if(o.moss){ for(let i=0;i<22;i++){const x=rnd()*s,y=rnd()*s,r=8+rnd()*22,gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(85,100,65,${.08+rnd()*.12})`);gr.addColorStop(1,'rgba(85,100,65,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);} }
}
const texCache={};
function stoneTex(key,o,rep){
  if(!texCache[key]){
    const m=G.canvasTex(512,(g,s)=>stoneCanvas(g,s,o)); m.wrapS=m.wrapT=THREE.RepeatWrapping;
    const b=G.canvasTex(256,(g,s)=>stoneCanvas(g,s,Object.assign({},o,{light:55,var:30,streaks:false,moss:false})),false); b.wrapS=b.wrapT=THREE.RepeatWrapping;
    texCache[key]={m,b};
  }
  const m=texCache[key].m.clone(), b=texCache[key].b.clone(); m.needsUpdate=b.needsUpdate=true;
  m.repeat.set(rep[0],rep[1]); b.repeat.set(rep[0],rep[1]);
  return {map:m,bump:b};
}
const IVORY={rows:8,hue:36,sat:14,light:82,var:9,mortar:'#9a9184',streaks:true,moss:true,seed:11};
const DARK={rows:8,hue:30,sat:8,light:30,var:9,mortar:'#1d1b19',seed:23};
const STEP={rows:4,hue:32,sat:8,light:52,var:10,mortar:'#2a2622',seed:5};
function stoneMat(kind,rep,tint,extra){
  const t=stoneTex(kind===IVORY?'iv':kind===DARK?'dk':'st',kind,rep);
  return G.toon(tint,Object.assign({map:t.map,bumpMap:t.bump,bumpScale:.06},extra||{}));
}
const timberTex=G.canvasTex(256,(g,s)=>{
  g.fillStyle='#3a2a1e';g.fillRect(0,0,s,s); const rnd=U.rng(4);
  const n=6,w=s/n; for(let i=0;i<n;i++){g.fillStyle=`hsl(26,${30+rnd()*10}%,${17+rnd()*6}%)`;g.fillRect(i*w+2,0,w-4,s);
    for(let k=0;k<14;k++){g.strokeStyle=`rgba(0,0,0,${.12+rnd()*.15})`;g.lineWidth=1+rnd()*1.5;g.beginPath();const x=i*w+4+rnd()*(w-8);g.moveTo(x,0);g.bezierCurveTo(x+rnd()*6-3,s*.3,x+rnd()*6-3,s*.6,x+rnd()*4-2,s);g.stroke();}}
  g.fillStyle='#24211f'; for(const y of [.16,.82]){g.fillRect(0,s*y,s,s*.06); for(let i=0;i<n;i++){g.fillStyle='#4a4540';g.beginPath();g.arc(i*w+w/2,s*(y+.03),3.5,0,TAU);g.fill();g.fillStyle='#24211f';}}
});

/* ---------------------------------------------------------------- veil shader */
const veilU={uTime:{value:0},uOpacity:{value:.97},uThin:{value:0},uHW:{value:DOOR_HW},uSpring:{value:DOOR_SPRING},uRim:{value:U.col('#9a6cff')}};
const veilMat=new THREE.ShaderMaterial({uniforms:veilU,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,
  vertexShader:'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform float uTime,uOpacity,uThin,uHW,uSpring;uniform vec3 uRim;varying vec2 vP;
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
  void main(){
    float d=vP.y<uSpring?min(uHW-abs(vP.x),vP.y):uHW-length(vec2(vP.x,vP.y-uSpring));
    vec2 q=vP*2.2; float t=uTime*.35;
    float sw=n(q+vec2(n(q*1.7+t),n(q*1.3-t))*2.+vec2(0.,t*1.5));
    float rim=smoothstep(.34,0.,d)*(.45+.9*sw);
    float tend=smoothstep(.55,.85,sw)*smoothstep(.6,.05,d)*.6;
    vec3 c=uRim*(rim*1.4+tend)*(1.+uThin*1.5);
    float a=uOpacity*(1.-uThin*(.85+.15*sw));
    a=max(a,uOpacity*rim*.9);
    gl_FragColor=vec4(c,clamp(a,0.,1.));
  }`});

/* ---------------------------------------------------------------- build */
const root=new THREE.Group(); root.name='lighthouse';
let blobInk=null, veilInk=null, veilOuter,veilInner,blob,blobBase,globs=[],lensMat,glassMat,lampLight,beam,beamMat,lampGlow,cradle,staffObj,staffLight,staffGlow,
    sconceFlames=[],sconceLights=[],sconcePos=[],windowOutMat,slitMat,vane,doorLeaf,interiorGroup,beamCones=[];
function add(geo,mat,x,y,z,parent){const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);(parent||root).add(m);return m;}
function archShape(hw,spring,hole){
  const s=new THREE.Shape(); s.moveTo(-hw,0); s.lineTo(hw,0); s.lineTo(hw,spring); s.absarc(0,spring,hw,0,PI,false); s.lineTo(-hw,0); return s;
}
function placeOnWall(m,a,r,y,inward){ m.position.set(wx(a,r),y,wz(a,r)); m.rotation.y=thOf(a)+(inward?PI:0); }

function buildTower(){
  const jambMat=stoneMat(STEP,[.6,1.6],'#cfc6b4');
  const gapTop=DOOR_TOPY+.35;
  // the outer shell: lower part with door gap, upper part whole (tapered)
  const doorHalfA=(DOOR_HW+.04)/VIS_R0;
  const lowH=gapTop, upH=HEIGHT-lowH+.02;
  const shell=(r0,r1,h,y,open)=>{
    const mat=stoneMat(IVORY,[7,h/3.2],'#efe7d6',{vertexColors:true});
    const g=open?new THREE.CylinderGeometry(r1,r0,h,64,Math.max(1,Math.round(h/2)),true,thOf(DOOR_A)+doorHalfA,TAU-doorHalfA*2):new THREE.CylinderGeometry(r1,r0,h,64,Math.max(1,Math.round(h/2)),true);
    if(mat.vertexColors){ // weathering: mossy damp base, clean ivory body, grime under the gallery
      const p=g.attributes.position, c=new Float32Array(p.count*3), base=U.col('#ffffff'), moss=U.col('#9aa27e'), grime=U.col('#b9b2a6'), tmp=new THREE.Color();
      for(let i=0;i<p.count;i++){const wy=y+p.getY(i)-BASE, ang=Math.atan2(p.getX(i),p.getZ(i));
        tmp.copy(base).lerp(moss,(1-U.smooth(0,2.6,wy))*(.55+.25*Math.sin(ang*5)));
        tmp.lerp(grime,U.smooth(HEIGHT-3.5,HEIGHT,wy)*.6);
        c[i*3]=tmp.r;c[i*3+1]=tmp.g;c[i*3+2]=tmp.b;}
      g.setAttribute('color',new THREE.BufferAttribute(c,3));
    }
    const m=add(g,mat,CX,y+h/2,CZ); return m;
  };
  const o1=shell(VIS_R0,visR(BASE+lowH),lowH,BASE,true);
  const o2=shell(visR(BASE+lowH),VIS_R1,upH,BASE+lowH-.01,false);
  for(const o of [o1,o2]){o.castShadow=true;o.receiveShadow=true;G.outline(o,{thickness:.07});}
  const innerA=(DOOR_HW+.04)/IN_R;
  const ig=new THREE.CylinderGeometry(IN_R,IN_R,lowH,48,2,true,thOf(DOOR_A)+innerA,TAU-innerA*2);
  add(ig,stoneMat(DARK,[6,lowH/3],'#8a8378',{side:THREE.BackSide}),CX,BASE+lowH/2,CZ).receiveShadow=true;
  add(new THREE.CylinderGeometry(IN_R,IN_R,upH,48,8,true),stoneMat(DARK,[6,upH/3],'#8a8378',{side:THREE.BackSide}),CX,BASE+lowH+upH/2,CZ).receiveShadow=true;
  // plinth / footing ring
  const plinth=add(new THREE.CylinderGeometry(VIS_R0+.32,VIS_R0+.45,.55,64,1,true),stoneMat(STEP,[14,.6],'#b7ae9e'),CX,BASE+.2,CZ);
  plinth.receiveShadow=true;
  add(new THREE.RingGeometry(VIS_R0,VIS_R0+.33,64,1).rotateX(-PI/2),stoneMat(STEP,[14,.6],'#b7ae9e'),CX,BASE+.47,CZ);
  // string courses (slim moulded rings) and a plum band like the cottages' trim
  for(const [y,k] of [[8.2,0],[16.4,1]]){const ry=BASE+y;
    const m=add(new THREE.TorusGeometry(visR(ry)+.02,.12,6,64).rotateX(PI/2),jambMat,CX,ry,CZ); m.castShadow=true;
    if(k===1)G.outline(m,{thickness:.03});
  }
  // a dusky-plum painted band high on the shaft (daymark)
  const plum=add(new THREE.CylinderGeometry(visR(BASE+19.2)+.012,visR(BASE+17.4)+.012,1.8,64,1,true),stoneMat(IVORY,[7,.55],'#8a4e6e'),CX,BASE+18.3,CZ);
  plum.castShadow=true;
  // tower top: corbelled cornice under the gallery
  const corbelG=new THREE.BoxGeometry(.32,.55,.42); corbelG.translate(0,-.27,0);
  const nC=28, corb=new THREE.InstancedMesh(corbelG,jambMat,nC); const m4=new THREE.Matrix4(), q=new THREE.Quaternion(), up=V(0,1,0), one=V(1,1,1);
  for(let i=0;i<nC;i++){const a=i/nC*TAU; q.setFromAxisAngle(up,thOf(a)); m4.compose(V(wx(a,VIS_R1+.3),TOP-.28,wz(a,VIS_R1+.3)),q,one); corb.setMatrixAt(i,m4);}
  corb.castShadow=true; root.add(corb);
  // gallery slab (stone) + underside + edge
  const slabMat=stoneMat(STEP,[10,1],'#a69e90');
  add(new THREE.RingGeometry(GLASS_R-.02,GAL_R,72,1).rotateX(-PI/2),slabMat,CX,TOP+.005,CZ).receiveShadow=true;
  add(new THREE.RingGeometry(VIS_R1-.05,GAL_R,72,1).rotateX(PI/2),slabMat,CX,TOP-.28,CZ);
  const edge=add(new THREE.CylinderGeometry(GAL_R,GAL_R,.3,72,1,true),slabMat,CX,TOP-.13,CZ); edge.castShadow=true; G.outline(edge,{thickness:.04});
  // iron railing
  const iron=G.toon('#2b2a33'), ironD=G.toon('#1f1d26');
  const railR=GAL_R-.12, nP=36;
  const post=new THREE.InstancedMesh(new THREE.CylinderGeometry(.035,.035,1.05,5),iron,nP);
  for(let i=0;i<nP;i++){const a=i/nP*TAU; m4.makeTranslation(wx(a,railR),TOP+.52,wz(a,railR)); post.setMatrixAt(i,m4);}
  root.add(post);
  const rail=add(new THREE.TorusGeometry(railR,.05,6,96).rotateX(PI/2),iron,CX,TOP+1.05,CZ); G.outline(rail,{thickness:.025});
  add(new THREE.TorusGeometry(railR,.025,4,96).rotateX(PI/2),iron,CX,TOP+.55,CZ);
  // lamp room: low parapet, glass, mullions, roof
  const parapet=add(new THREE.CylinderGeometry(GLASS_R,GLASS_R+.05,GLASS_Y0-TOP,48,1,true),G.toon('#3a3644',{side:THREE.DoubleSide}),CX,(TOP+GLASS_Y0)/2,CZ);
  G.outline(parapet,{thickness:.03});
  glassMat=G.toon('#1c1826',{transparent:true,opacity:.5,depthWrite:false,side:THREE.DoubleSide,emissive:'#3a2466',emissiveIntensity:0});
  const glass=add(new THREE.CylinderGeometry(GLASS_R,GLASS_R,GLASS_Y1-GLASS_Y0,48,1,true),glassMat,CX,(GLASS_Y0+GLASS_Y1)/2,CZ); glass.renderOrder=2;
  const nM=14, mull=new THREE.InstancedMesh(new THREE.BoxGeometry(.09,GLASS_Y1-GLASS_Y0,.09),ironD,nM);
  for(let i=0;i<nM;i++){const a=i/nM*TAU; q.setFromAxisAngle(up,thOf(a)); m4.compose(V(wx(a,GLASS_R),(GLASS_Y0+GLASS_Y1)/2,wz(a,GLASS_R)),q,one); mull.setMatrixAt(i,m4);}
  root.add(mull);
  for(const y of [GLASS_Y0,(GLASS_Y0+GLASS_Y1)/2,GLASS_Y1]){add(new THREE.TorusGeometry(GLASS_R,y===GLASS_Y1?.09:.05,6,72).rotateX(PI/2),ironD,CX,y,CZ);}
  // roof: slate-iron ogee dome with a lip
  const slate=G.canvasTex(256,(g,s)=>{g.fillStyle='#2e3340';g.fillRect(0,0,s,s);const rnd=U.rng(9);for(let r=0;r<10;r++){for(let i=0;i<14;i++){const x=(i+(r%2)*.5)*s/14,y=r*s/10;g.fillStyle=`hsl(225,${10+rnd()*8}%,${20+rnd()*10}%)`;g.beginPath();g.moveTo(x+1,y);g.lineTo(x+s/14-1,y);g.lineTo(x+s/14-1,y+s/10*.7);g.quadraticCurveTo(x+s/28,y+s/10+2,x+1,y+s/10*.7);g.fill();}}});
  slate.wrapS=slate.wrapT=THREE.RepeatWrapping; slate.repeat.set(4,1);
  const pts=[]; const RR=GLASS_R+.55;
  [[RR,0],[RR-.05,.12],[RR*.92,.35],[RR*.75,.75],[RR*.5,1.35],[RR*.3,1.85],[RR*.18,2.25],[.22,2.55],[.12,2.75],[0,2.8]].forEach(p=>pts.push(new THREE.Vector2(p[0],p[1])));
  const roofG=new THREE.LatheGeometry(pts,48);
  const roof=add(roofG,G.toon('#5a6175',{map:slate,side:THREE.DoubleSide}),CX,GLASS_Y1+.02,CZ); roof.castShadow=true; G.outline(roof,{thickness:.05});
  add(new THREE.TorusGeometry(RR,.08,6,64).rotateX(PI/2),ironD,CX,GLASS_Y1+.04,CZ);
  const ventY=GLASS_Y1+2.85;
  const vent=add(new THREE.SphereGeometry(.34,16,10),iron,CX,ventY,CZ); G.outline(vent,{thickness:.03});
  add(new THREE.CylinderGeometry(.045,.045,1.6,6),iron,CX,ventY+.9,CZ);
  vane=new THREE.Group(); vane.position.set(CX,ventY+1.45,CZ); root.add(vane);
  const arrow=add(new THREE.BoxGeometry(1.1,.04,.04),ironD,0,0,0,vane);
  const head=add(new THREE.ConeGeometry(.1,.26,4).rotateZ(-PI/2),ironD,.6,0,0,vane);
  const tail=add(new THREE.BoxGeometry(.26,.24,.02),ironD,-.5,.04,0,vane);
  const cross=new THREE.Group(); cross.position.set(CX,ventY+1.15,CZ); root.add(cross);
  add(new THREE.BoxGeometry(.7,.025,.025),iron,0,0,0,cross); add(new THREE.BoxGeometry(.025,.025,.7),iron,0,0,0,cross);
  [arrow,head,tail].forEach(m=>G.outline(m,{thickness:.015}));

  /* --- doorway: reveal, arch, tympanum fill, threshold, open door leaf --- */
  const aD=DOOR_A, depthR0=IN_R-.02, depthR1=VIS_R0+.06, depth=depthR1-depthR0, midR=(depthR0+depthR1)/2;
  const tang=V(-Math.sin(aD),0,Math.cos(aD)); // lateral axis (+lat)
  for(const s of [-1,1]){
    const j=add(new THREE.BoxGeometry(depth+.1,DOOR_SPRING,.16),jambMat,wx(aD,midR)+tang.x*s*(DOOR_HW+.08),BASE+DOOR_SPRING/2,wz(aD,midR)+tang.z*s*(DOOR_HW+.08));
    j.rotation.y=-aD; j.castShadow=true;
    // outer jamb pilasters (raised frame)
    const pf=add(new THREE.BoxGeometry(.18,DOOR_SPRING+.05,.32),jambMat,wx(aD,VIS_R0+.07)+tang.x*s*(DOOR_HW+.16),BASE+DOOR_SPRING/2,wz(aD,VIS_R0+.07)+tang.z*s*(DOOR_HW+.16));
    pf.rotation.y=-aD; pf.castShadow=true; G.outline(pf,{thickness:.02});
  }
  // arch soffit (half cylinder through the wall)
  const sofG=new THREE.CylinderGeometry(DOOR_HW+.08,DOOR_HW+.08,depth+.1,16,1,true,0,PI); sofG.rotateZ(PI/2); sofG.rotateY(-aD);
  add(sofG,G.toon('#8d8577',{side:THREE.DoubleSide}),wx(aD,midR),BASE+DOOR_SPRING,wz(aD,midR));
  // archivolt (voussoir ring) on the outer face
  const arch=add(new THREE.TorusGeometry(DOOR_HW+.16,.15,6,20,PI),jambMat,wx(aD,VIS_R0+.1),BASE+DOOR_SPRING,wz(aD,VIS_R0+.1));
  arch.rotation.y=thOf(aD); arch.castShadow=true; G.outline(arch,{thickness:.02});
  const key=add(new THREE.BoxGeometry(.26,.36,.3),jambMat,wx(aD,VIS_R0+.12),BASE+DOOR_TOPY+.18,wz(aD,VIS_R0+.12)); key.rotation.y=thOf(aD);
  // tympanum fill above the arch (outer and inner faces)
  const fillShape=new THREE.Shape(); const fw=DOOR_HW+.1, fh=gapTop-DOOR_SPRING+.02;
  fillShape.moveTo(-fw,0); fillShape.lineTo(-fw,fh); fillShape.lineTo(fw,fh); fillShape.lineTo(fw,0); fillShape.absarc(0,0,DOOR_HW+.08,0,PI,false);
  const fillG=new THREE.ShapeGeometry(fillShape,12);
  const fo=add(fillG,stoneMat(IVORY,[.6,.4],'#e8e0cf'),0,0,0); placeOnWall(fo,aD,visR(BASE+DOOR_SPRING)+.005,BASE+DOOR_SPRING,false);
  const fi=add(fillG,stoneMat(DARK,[.6,.4],'#8a8378'),0,0,0); placeOnWall(fi,aD,IN_R-.005,BASE+DOOR_SPRING,true);
  // threshold step
  const thr=add(new THREE.BoxGeometry(depth+.7,.12,DOOR_HW*2+.3),jambMat,wx(aD,midR+.25),BASE+.03,wz(aD,midR+.25)); thr.rotation.y=-aD; thr.receiveShadow=true;
  // open timber door leaf, swung out against the wall on the -lat side
  const leafG=new THREE.ExtrudeGeometry(archShape(DOOR_HW-.04,DOOR_SPRING-.05),{depth:.09,bevelEnabled:false,curveSegments:10});
  const tm=timberTex.clone(); tm.needsUpdate=true; tm.repeat.set(.6,.33); tm.offset.set(.5,0); tm.wrapS=tm.wrapT=THREE.RepeatWrapping;
  doorLeaf=new THREE.Group(); root.add(doorLeaf);
  const hinge=V(wx(aD,VIS_R0+.12),BASE+.02,wz(aD,VIS_R0+.12)).addScaledVector(tang,-(DOOR_HW+.05));
  doorLeaf.position.copy(hinge);
  const leaf=add(leafG,G.toon('#d8b088',{map:tm}),DOOR_HW-.04,0,0,doorLeaf); leaf.castShadow=true; G.outline(leaf,{thickness:.02});
  for(const y of [.4,DOOR_SPRING-.55]){add(new THREE.BoxGeometry(DOOR_HW*1.7,.08,.03),ironD,DOOR_HW-.04,y,.1,doorLeaf);}
  add(new THREE.TorusGeometry(.09,.018,6,14),G.toon(G.PAL.gold),DOOR_HW*1.6,1.05,.13,doorLeaf);
  // closed: local +x runs along +lat (rotation thOf+PI); swing ~110 deg outward so it rests against the wall
  const leafYaw=thOf(aD)+PI+2.25; doorLeaf.rotation.y=leafYaw;
  const ldx=Math.cos(leafYaw), ldz=-Math.sin(leafYaw);
  G.addBoxCollider({x:hinge.x+ldx*DOOR_HW,z:hinge.z+ldz*DOOR_HW,hw:DOOR_HW,hd:.07,yaw:leafYaw,y0:BASE-1,y1:BASE+DOOR_TOPY});

  /* --- veil of darkness (outer and inner faces of the doorway) --- */
  const vg=new THREE.ShapeGeometry(archShape(DOOR_HW+.02,DOOR_SPRING),20);
  veilOuter=add(vg,veilMat,0,0,0); placeOnWall(veilOuter,aD,VIS_R0+.03,BASE+.01,false); veilOuter.renderOrder=5;
  veilInner=add(vg,veilMat,0,0,0); placeOnWall(veilInner,aD,IN_R+.05,BASE+.01,true); veilInner.renderOrder=5;

  /* --- outside windows (small arched) + inside moonlit slits, along the helix --- */
  windowOutMat=new THREE.MeshBasicMaterial({color:U.col('#141220')});
  slitMat=new THREE.MeshBasicMaterial({color:U.col('#5d72a6'),fog:false});
  const winG=new THREE.ShapeGeometry(archShape(.24,.75),8), sillG=new THREE.BoxGeometry(.7,.1,.22), hoodG=new THREE.TorusGeometry(.32,.06,5,12,PI);
  const slitG=new THREE.ShapeGeometry(archShape(.09,1.0),6);
  for(let i=0;i<7;i++){
    const t=.07+i*.135, a=ASTART+t*TOTAL+1.1, y=stairH(t)+2.4; if(y>TOP-2)continue;
    const r=visR(y);
    const w=add(winG,windowOutMat,0,0,0); placeOnWall(w,a,r+.015,y-.5,false);
    const sl=add(sillG,jambMat,0,0,0); placeOnWall(sl,a,r+.06,y-.55,false);
    const hd=add(hoodG,jambMat,0,0,0); placeOnWall(hd,a,r+.03,y+.25,false);
    const s2=add(slitG,slitMat,0,0,0); placeOnWall(s2,a,IN_R-.01,y-.55,true);
  }
}

function buildInterior(){
  interiorGroup=new THREE.Group(); root.add(interiorGroup);
  const P=interiorGroup;
  // ground floor flags
  add(new THREE.CircleGeometry(IN_R+.02,48).rotateX(-PI/2),stoneMat(STEP,[3,3],'#7e776b'),CX,BASE+.012,CZ,P).receiveShadow=true;
  // central column
  add(new THREE.CylinderGeometry(COL_R,COL_R+.05,HEIGHT+.02,24,1),stoneMat(STEP,[2,14],'#a59d8e'),CX,BASE+HEIGHT/2,CZ,P);
  // cantilevered steps (one turn = 48 steps)
  const NS=TURNS*48, stepW=IN_R-COL_R+.08, rise=HEIGHT/NS;
  const sg=new THREE.BoxGeometry(stepW,.24,.62); sg.translate(0,-.12,0);
  const steps=new THREE.InstancedMesh(sg,stoneMat(STEP,[1,.3],'#b3aa99'),NS);
  const nose=new THREE.InstancedMesh(new THREE.BoxGeometry(stepW,.05,.06),G.toon('#7d7568'),NS);
  const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),up=V(0,1,0),one=V(1,1,1),off=V();
  for(let i=0;i<NS;i++){const t=(i+.5)/NS, a=ASTART+t*TOTAL; q.setFromAxisAngle(up,-a);
    m4.compose(V(wx(a,STAIR_MID),stairH(t)+.02,wz(a,STAIR_MID)),q,one); steps.setMatrixAt(i,m4);
    off.set(-Math.sin(a),0,Math.cos(a)).multiplyScalar(-.3);
    m4.compose(V(wx(a,STAIR_MID)+off.x,stairH(t)+.005,wz(a,STAIR_MID)+off.z),q,one); nose.setMatrixAt(i,m4);}
  steps.receiveShadow=true; P.add(steps,nose);
  // lamp-room floor, open where the stair arrives (hatch)
  const hatchA0=ASTART-HATCH; // world angles [ASTART-HATCH, ASTART] are open
  const flG=new THREE.RingGeometry(COL_R*0,GLASS_R,64,1,-ASTART+HATCH,TAU-HATCH).rotateX(-PI/2);
  const fl=add(flG,stoneMat(STEP,[3,3],'#8a8273',{side:THREE.DoubleSide}),CX,TOP,CZ,P); fl.receiveShadow=true;
  // floor slab thickness ring under the floor, around the hatch opening edges
  const iron=G.toon('#2b2a33');
  // hatch rail: along the two radial edges and the inner arc, except at the arrival end
  const ra=(a,r,y)=>V(wx(a,r),y,wz(a,r));
  const postG=new THREE.CylinderGeometry(.03,.03,.95,5);
  const posts=[]; for(let k=0;k<=4;k++)posts.push(ra(hatchA0,COL_R+.1+k*(GLASS_R-.3-COL_R)/4,TOP+.47));
  const pm=new THREE.InstancedMesh(postG,iron,posts.length); posts.forEach((p,i)=>{m4.makeTranslation(p.x,p.y,p.z);pm.setMatrixAt(i,m4);}); P.add(pm);
  const tube=(a0,a1,r,y)=>{const pts=[];for(let k=0;k<=10;k++){const a=a0+(a1-a0)*k/10;pts.push(ra(a,r,y));}return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),20,.035,5,false);};
  add(new THREE.TubeGeometry(new THREE.LineCurve3(ra(hatchA0,COL_R+.1,TOP+.95),ra(hatchA0,GLASS_R-.3,TOP+.95)),2,.035,5,false),iron,0,0,0,P);
  // lamp pedestal
  add(new THREE.CylinderGeometry(.42,.62,.9,16),iron,CX,TOP+.45,CZ,P);
  // sconces along the stairwell (lit after the cure)
  const brG=new THREE.BoxGeometry(.08,.08,.36), cupG=new THREE.CylinderGeometry(.11,.06,.12,8);
  const flameMat=new THREE.SpriteMaterial({map:G.tex.flame,color:new THREE.Color('#ffb15a'),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0});
  for(let i=0;i<9;i++){
    const t=(i+.5)/9, a=ASTART+t*TOTAL+.32, y=stairAt(a,t)+2.05;
    if(Math.abs(U.angDiff(a,staffA))<.5&&Math.abs(y-STAFF_STEP_Y)<3)continue;
    const b=add(brG,iron,0,0,0,P); placeOnWall(b,a,IN_R-.18,y-.12,true);
    const c=add(cupG,iron,wx(a,IN_R-.34),y-.04,wz(a,IN_R-.34),P);
    const f=new THREE.Sprite(flameMat.clone()); f.position.set(wx(a,IN_R-.34),y+.14,wz(a,IN_R-.34)); f.scale.set(.32,.5,1); P.add(f);
    sconceFlames.push(f); sconcePos.push(f.position.clone());
  }
  for(let i=0;i<1;i++){const l=new THREE.PointLight(0xffa860,0,9,1.6); l.position.copy(sconcePos[0]||lampCenter); root.add(l); sconceLights.push(l);}
}

function buildLamp(){
  const brass=G.toon(G.PAL.gold,{emissive:'#2a1d08',emissiveIntensity:.3});
  cradle=add(new THREE.TorusGeometry(.32,.05,8,28).rotateX(PI/2),G.toon('#3a3340',{emissive:'#9c6cff',emissiveIntensity:0}),cradlePos.x,cradlePos.y,cradlePos.z);
  for(let i=0;i<3;i++){const a=i/3*TAU; const arm=add(new THREE.BoxGeometry(.05,.3,.05),brass,cradlePos.x+Math.cos(a)*.32,cradlePos.y-.12,cradlePos.z+Math.sin(a)*.32);}
  lensMat=G.toon('#cfc7f0',{transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide,emissive:'#c7b4ff',emissiveIntensity:0});
  const lens=new THREE.Group(); lens.position.set(CX,0,CZ); root.add(lens);
  for(let i=0;i<9;i++){const y=TOP+1.02+i*.16, r=.82-Math.abs(i-4)*.045; const t=add(new THREE.TorusGeometry(r,.055,6,40).rotateX(PI/2),lensMat,0,y,0,lens);}
  const core=add(new THREE.CylinderGeometry(.66,.66,1.35,32,1,true),lensMat,0,TOP+1.67,0,lens);
  for(const y of [TOP+.98,TOP+2.38]) add(new THREE.TorusGeometry(.86,.05,6,40).rotateX(PI/2),brass,0,y,0,lens);
  for(let i=0;i<6;i++){const a=i/6*TAU; add(new THREE.BoxGeometry(.04,1.42,.04),brass,Math.cos(a)*.86,TOP+1.68,Math.sin(a)*.86,lens);}
  add(new THREE.ConeGeometry(.5,.35,16),brass,0,TOP+2.58,0,lens);
  // corruption: black void, oily violet sheen (negMaterial: black core, rim colour converted sRGB->linear)
  const negM=G.negMaterial({rim:'#6a3fc0',strength:.75,amp:.09,wisp:.6,flow:.5});
  blob=new THREE.Mesh(new THREE.IcosahedronGeometry(.92,4),negM); blob.position.copy(lampCenter); root.add(blob);
  blobBase=Float32Array.from(blob.geometry.attributes.position.array);
  G.world.lighthouse.blob=blob; G.world.lighthouse.blobCenter=blob.position;
  // ink smoke curling off the corruption around the lens, plus oily drips onto the cradle
  blobInk=G.ink?G.ink.emitter(blob,{rate:9,radius:.7,height:.6,size:[.35,1.1],life:[1.2,2.4],rise:.35,drift:.15,alpha:.7,drip:1.5,embers:1.5}):null;
  for(let i=0;i<7;i++){const g=new THREE.Mesh(new THREE.IcosahedronGeometry(.16+(i%3)*.06,2),negM); g.userData={ph:i*.9,r:1.15+(i%3)*.18,sp:.5+(i%4)*.18,yo:(i%5-2)*.28}; root.add(g); globs.push(g);}
  // light, glow, beam
  lampLight=new THREE.PointLight(0xd8c8ff,0,28,1.8); lampLight.position.copy(lampCenter); root.add(lampLight);
  lampGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:new THREE.Color('#d6c2ff'),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
  lampGlow.position.copy(lampCenter); lampGlow.scale.setScalar(7); root.add(lampGlow);
  const beamTex=G.canvasTex(64,(g,s)=>{const gr=g.createLinearGradient(0,0,0,s);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.7,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,1)');g.fillStyle=gr;g.fillRect(0,0,s,s);});
  beamMat=new THREE.MeshBasicMaterial({map:beamTex,color:U.col('#d9ccff'),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false});
  beam=new THREE.Group(); beam.position.copy(lampCenter); root.add(beam);
  for(const s of [1,-1]){
    for(const [rad,len] of [[7,90],[3.2,70]]){
      const g=new THREE.ConeGeometry(rad,len,28,1,true); g.translate(0,-len/2,0); g.rotateZ(s*PI/2); g.rotateZ(-s*.06);
      const m=new THREE.Mesh(g,beamMat); m.frustumCulled=false; beam.add(m); beamCones.push(m);
    }
  }
  beam.visible=false;
}

function buildStaff(){
  // alcove: dark arched recess + stone frame + iron bracket
  const a=staffA, y0=STAFF_STEP_Y;
  const rec=add(new THREE.ShapeGeometry(archShape(.42,1.6),10),new THREE.MeshBasicMaterial({color:U.col('#0d0b10')}),0,0,0,interiorGroup);
  placeOnWall(rec,a,IN_R-.012,y0+.35,true);
  const fr=G.toon('#6e675d');
  const sill=add(new THREE.BoxGeometry(1.05,.12,.3),fr,0,0,0,interiorGroup); placeOnWall(sill,a,IN_R-.12,y0+.32,true);
  const hood=add(new THREE.TorusGeometry(.5,.07,5,14,PI),fr,0,0,0,interiorGroup); placeOnWall(hood,a,IN_R-.04,y0+1.95,true);
  const iron=G.toon('#2b2a33');
  for(const yy of [.75,1.65]){const br=add(new THREE.BoxGeometry(.5,.06,.22),iron,0,0,0,interiorGroup); placeOnWall(br,a,IN_R-.13,y0+yy,true);
    const hk=add(new THREE.TorusGeometry(.07,.018,5,10),iron,wx(a,IN_R-.24),y0+yy+.04,wz(a,IN_R-.24),interiorGroup); hk.rotation.x=PI/2;}
  // the staff itself
  if(typeof G.models.staff==='function'){ try{staffObj=G.models.staff();}catch(e){staffObj=null;} }
  if(!staffObj) staffObj=fallbackStaff();
  staffObj.position.set(wx(a,IN_R-.26),y0+.42,wz(a,IN_R-.26));
  staffObj.rotation.set(0,thOf(a),0); staffObj.rotateZ(.08);
  interiorGroup.add(staffObj);
  staffGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:new THREE.Color('#b18cff'),transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}));
  staffGlow.position.set(wx(a,IN_R-.3),y0+1.85,wz(a,IN_R-.3)); staffGlow.scale.setScalar(1.3); interiorGroup.add(staffGlow);
  staffLight=new THREE.PointLight(0x9a70ff,1.1,6.5,1.6); staffLight.position.set(wx(a,IN_R-.7),y0+1.8,wz(a,IN_R-.7)); root.add(staffLight);
  G.items.staff.pos.set(staffObj.position.x,y0+1.2,staffObj.position.z);
  G.world.lighthouse.staffPos.copy(G.items.staff.pos);
  G.interact.add({pos:()=>V(wx(a,STAIR_MID+.4),y0+.2,wz(a,STAIR_MID+.4)),radius:2.4,priority:3,
    label:'Take the Keeper’s Staff',
    enabled:()=>!G.items.staff.owned&&!S.staffTaken,
    use(){
      S.staffTaken=true; G.items.staff.owned=true;
      staffObj.visible=false; staffGlow.visible=false; staffLight.intensity=0;
      G.emit('staff:pickup');
      G.ui.toast('The Keeper’s Staff','Click to strike · hold to charge');
      G.ui.say('The staff is lighter than it looks. The stone in its crook warms under your hand, the way the lantern does.');
    }});
}
function fallbackStaff(){
  const g=new THREE.Group();
  const wood=G.toon('#4a3324'), brass=G.toon(G.PAL.gold,{emissive:'#3a2a08',emissiveIntensity:.25});
  const shaft=add(new THREE.CylinderGeometry(.03,.04,1.5,8),wood,0,.75,0,g); G.outline(shaft,{thickness:.012});
  add(new THREE.CylinderGeometry(.045,.045,.1,8),brass,0,1.42,0,g);
  add(new THREE.CylinderGeometry(.04,.03,.06,8),brass,0,.03,0,g);
  const hook=add(new THREE.TorusGeometry(.13,.022,6,16,PI*1.35),brass,0,1.6,0,g); hook.rotation.z=-.4; G.outline(hook,{thickness:.01});
  const crys=add(new THREE.OctahedronGeometry(.085,0),new THREE.MeshBasicMaterial({color:new THREE.Color('#c9a8ff')}),0,1.6,0,g); crys.scale.y=1.5;
  return g;
}

/* ---------------------------------------------------------------- lamp interaction + cure */
function startCure(){
  if(S.cure||S.cured)return;
  const L=lantern();
  L.carried=false; L.shut=false; L.inCradle=true; L.pos.copy(cradlePos);
  S.cure={t:0,stage:0};
  G.emit('lamp:placed');
  G.ui.say('You set the lantern in the cradle at the heart of the lamp. The swarm pours up through the hatch after it.');
}
S.startCure=startCure;
/* save/load support: jump straight to finished states without replaying the sequences */
S.restoreCured=()=>{ const L=lantern(); S.cure=null; S.cured=true; G.atmo.cured=1; L.cured=true; L.found=true; L.carried=false; L.shut=false; L.inCradle=true; L.pos.copy(cradlePos); };
S.restoreStaff=()=>{ S.staffTaken=true; G.items.staff.owned=true; if(staffObj){staffObj.visible=false;staffGlow.visible=false;staffLight.intensity=0;} };
function updateCure(dt){
  const C=S.cure; if(!C)return; C.t+=dt; const t=C.t;
  if(C.stage===0&&t>4.5){C.stage=1;G.ui.say('They aren’t circling the light. They’re eating the black thing wrapped around the lens. They always were.');}
  if(t>7&&!lantern().cured){lantern().cured=true;}
  if(C.stage===1&&t>9.5){C.stage=2;G.ui.say('The lens catches. Clean light, violet-white, sweeps out across the water.');}
  if(C.stage===2&&t>14){C.stage=3; S.cured=true; G.atmo.cured=1; G.emit('lamp:cured');}
  if(C.stage===3&&t>15.5){ S.cure=null; }
}
function cureK(){ if(S.cured)return 1; return S.cure?S.cure.t:0; }

/* ---------------------------------------------------------------- triggers / captions */
function updateTriggers(){
  if(!playing())return;
  const P=G.player.pos, L=lantern();
  const isIn=inside(P);
  if(isIn!==S.wasInside){ S.wasInside=isIn; G.emit(isIn?'tower:enter':'tower:exit'); }
  if(inBody(P)&&rOf(P)<IN_R&&!S.cure&&!S.cured){
    if(L.carried&&L.lit()) say('enter','Inside, the dark gives way to the lantern an arm’s length at a time. Stone stairs wind up around a central column.');
    if(!G.quest&&!S.said.objClimb){S.said.objClimb=true;G.ui.objective('Climb to the lamp room');}
    if(L.carried&&P.y>BASE+8) say('mid','The moths come up the stairwell behind you like smoke.');
  }
  if(!G.items.staff.owned&&inBody(P)&&Math.abs(P.y-STAFF_STEP_Y)<4&&Math.hypot(P.x-staffPos.x,P.z-staffPos.z)<6)
    say('staff','Set into the wall above the stair, an iron bracket holds a staff. A violet stone glows in its crook, steady and patient, as if it has been waiting for a hand.');
  if(inRoom(P)&&!S.cure&&!S.cured){
    say('top','The lamp room. The great lens is wrapped in something black that shifts when you look straight at it. Beneath it is an empty cradle, just the size of your lantern.');
    if(L.carried&&!S.said.objSet){S.said.objSet=true;G.ui.objective('Set the lantern in the lamp','The cradle beneath the lens');}
  }
}

/* ---------------------------------------------------------------- system */
G.system('lighthouse',{order:10,modes:'always',
  init(){
    buildTower(); buildInterior(); buildLamp(); buildStaff();
    G.scene.add(root);
    G.interact.add({pos:cradlePos,radius:3.6,priority:6,
      label:'Set the lantern in the lamp’s cradle',
      enabled:()=>{const L=lantern(); return L.carried&&!L.cured&&!S.cure&&!S.cured&&inRoom(G.player.pos);},
      use:startCure});
  },
  update(dt){
    const t=G.time, P=G.player.pos, L=lantern();
    updateCure(dt);
    if(playing()){
      updateTriggers();
      const inB=inBody(P);
      G.atmo.darkTarget=inB?(S.cured?S.curedDark:1):0;
    }
    // cure visuals
    const ct=cureK();
    const shrink=S.cured?0:1-U.smooth(2,9.5,ct);
    blob.visible=shrink>.01; blob.scale.setScalar(Math.max(.001,shrink));
    if(blobInk){ const near=Math.hypot(P.x-lampCenter.x,P.z-lampCenter.z)<60||G.state.mode==='title'; blobInk.intensity=(blob.visible&&near)?(.4+shrink*.6)*(S.cured?0:1)+(ct>0&&!S.cured?(1-shrink)*1.5:0):0; }
    blob.material.uniforms.uFade.value=U.clamp(.25+shrink*.75,0,1);
    if(blob.visible){
      const pa=blob.geometry.attributes.position, b=blobBase, arr=pa.array;
      for(let i=0;i<arr.length;i+=3){const x=b[i],y=b[i+1],z=b[i+2];
        const k=1+.14*Math.sin(t*2+x*4+y*3)+.09*Math.sin(t*3.3+z*5+x*2)+.05*Math.sin(t*5.1+y*7);
        arr[i]=x*k;arr[i+1]=y*k;arr[i+2]=z*k;}
      pa.needsUpdate=true; blob.rotation.y+=dt*.3;
    }
    for(const g of globs){const u=g.userData,a=u.ph+t*u.sp,s2=shrink;
      g.visible=s2>.02; g.position.set(lampCenter.x+Math.cos(a)*u.r*(.6+.4*s2),lampCenter.y+u.yo+Math.sin(t*1.3+u.ph)*.2,lampCenter.z+Math.sin(a)*u.r*(.6+.4*s2));
      g.scale.setScalar(Math.max(.001,s2));}
    const lit=S.cured?1:U.smooth(8,10.5,ct);
    const pulse=.5+.5*Math.sin(t*1.7);
    lensMat.emissiveIntensity=lit*2.6+(1-lit)*.06*pulse;
    glassMat.emissiveIntensity=lit*.55+(1-lit)*.18*pulse*pulse;
    glassMat.opacity=.5-lit*.2;
    lampLight.intensity=lit*2.2;
    lampGlow.material.opacity=lit*.4;
    beamMat.opacity=lit*.085; beam.visible=lit>.01; beam.rotation.y+=dt*.42;
    if(S.cure||S.cured) G.atmo.cured=S.cured?1:U.smooth(8,14,ct);
    // cradle hint
    const wantHint=L.carried&&!S.cure&&!S.cured&&inRoom(P);
    cradle.material.emissiveIntensity=wantHint?1.1+Math.sin(t*4)*.7:(L.inCradle?.5:0);
    // sconces: light after the cure (from stage 2), two point lights follow the player's height
    const sc=S.cured?1:U.smooth(9,12,ct);
    for(let i=0;i<sconceFlames.length;i++){const f=sconceFlames[i]; f.material.opacity=sc*(.85+.15*Math.sin(t*11+i*1.7)); f.visible=sc>.01;}
    if(sc>.01&&sconcePos.length&&inBody(P)&&rOf(G.camera.position)<IN_R){
      const ref=P;
      const order=sconcePos.map((p,i)=>[Math.abs(p.y-ref.y)+Math.hypot(p.x-ref.x,p.z-ref.z)*.3,i]).sort((x,y)=>x[0]-y[0]);
      for(let k=0;k<sconceLights.length;k++){const p=sconcePos[order[k][1]]; sconceLights[k].position.set(p.x+(CX-p.x)*.12,p.y,p.z+(CZ-p.z)*.12); sconceLights[k].intensity=sc*1.3*(.9+.1*Math.sin(t*9+k));}
    }else for(const l of sconceLights)l.intensity=0;
    windowOutMat.color.copy(U.col('#141220')).lerp(U.col('#e3a13a'),sc*.85);
    // veil: thins as a lit lantern approaches; gone once the lamp is set
    veilU.uTime.value=t;
    let want=.97, thin=0;
    if(S.cure||S.cured){want=0;}
    else{
      const lw=lanternWorld();
      const dd=Math.hypot(lw.x-doorOut.x,lw.z-doorOut.z)+Math.max(0,Math.abs(lw.y-doorOut.y)-2);
      if(L.lit()&&(L.found||L.carried||L.inCradle)) thin=1-U.smooth(2.2,8,dd);
      if(canEnter()&&!L.carried) thin=Math.max(thin,.75);
    }
    S.veilOpacity=U.damp(S.veilOpacity,want,2.5,dt);
    veilU.uOpacity.value=S.veilOpacity; veilU.uThin.value=U.damp(veilU.uThin.value,thin,3,dt);
    veilOuter.visible=veilInner.visible=S.veilOpacity>.02;
    if(!veilInk&&G.ink) veilInk=G.ink.emitter({pos:new THREE.Vector3(doorOut.x,BASE+.35,doorOut.z)},{rate:12,radius:1,height:.5,size:[.9,2.4],life:[1.8,3.2],rise:.08,drift:.55,trail:0,alpha:.85,color:'#211a2e'});
    if(veilInk){ const near=Math.hypot(P.x-CX,P.z-CZ)<45||G.state.mode==='title'; veilInk.intensity=near?S.veilOpacity:0; }
    // staff glow
    if(staffObj&&staffObj.visible){const k=.8+.2*Math.sin(t*2.1); staffGlow.material.opacity=.6*k; staffLight.intensity=1.1*k;}
    // weathervane
    vane.rotation.y=-.6+Math.sin(t*.13)*.5+Math.sin(t*.71)*.08;
  }
});
})();

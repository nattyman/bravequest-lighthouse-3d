/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — boat.js
   Rowan's boat (Story Bible, threads for the north island: "Rowan's wreck on the south beach can be salvaged.
   Rebuilding it is the bridge into the next chapter."). Heath's call, 2026-11-10: gather parts, then a short scripted crossing.
     1. Once he has seen the wrecker's light (north.js, 'north:seen'), Rowan thinks of his boat: the quest starts.
     2. At the wreck: "Look over the boat" — the stern half is sound; he names what he needs and where to find it:
          planks from the hamlet's broken houses · rope from the shed by the cottage · Hesper's old sail at the cottage ·
          pitch from the charcoal-burners' kiln in the old wood.
        Each part is a pickup at its place (and a map pin once he has looked).
     3. With all four: "Patch the boat" — a few seconds of work (hammer and mallet, the screen dims), then the broken hull
        is gone and the patched boat sits in the shallows, mast up, Hesper's sail on the yard.
     4. "Sail north": the crossing is the next chapter (the north island isn't built yet), so for now it says so plainly.
   Save: G.persist 'boat'. Events: boat:start, boat:part {id,count}, boat:looked, boat:built.
   API: G.boat = { state, parts, PARTS, started, built, count, debug:{start(), give(id), build(), reset()} }
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, V=(x,y,z)=>new THREE.Vector3(x,y,z);
const H=(x,z)=>G.world.height(x,z);
const S={v:1,started:false,looked:false,parts:{},built:false};
const WRECK=V(80.4,0,67.4);                // where you stand to look the wreck over (between the halves, on the sand)
const MOOR={x:77.6,z:76.2,yaw:.35};         // the patched boat: in the shallows just off the wreck, bow out to sea
const PARTS=[
  {id:'planks',short:'Planks',name:'Planks',  where:'the hamlet',  x:-26,  z:24,  label:'Take the planks', note:'Good boards off a house that has no one to keep it dry any more.'},
  {id:'rope',  short:'Rope',name:'Rope',    where:'the shed',    x:146,  z:37,  label:'Take the rope',   note:'Halloran’s good hemp. He always kept more than he needed.'},
  {id:'sail',  short:'Sail',name:'Hesper’s old sail', where:'the cottage', x:166.5, z:21.5, label:'Take the old sail', note:'She patched it herself. You can tell by the stitches: too many, and all very straight.'},
  {id:'pitch', short:'Pitch',name:'Pitch',   where:'the old wood',x:-104, z:-7,  label:'Take the pitch',  note:'A pot of pitch by the charcoal-burners’ cold kiln. It’ll seal the seams.'}
];
const BY={}; for(const p of PARTS)BY[p.id]=p;
const count=()=>PARTS.filter(p=>S.parts[p.id]).length;
const isPlay=()=>G.state.mode==='play';
const later=(s,fn)=>{ const t=G.time+s; timers.push({t,fn}); }; const timers=[];
const LM=()=>G.world.landmarks||{};

/* ------------------------------------------------------------------ the parts */
let built3d=false;
function partMesh(p){
  const g=new THREE.Group(); const y=H(p.x,p.z); g.position.set(p.x,y,p.z); g.rotation.y=(p.x*.37)%PI;
  const wood=G.toon('#8a6a4c'), dark=G.toon('#5a4231'), canvas=G.toon('#c9bb98'), patch=G.toon('#8a5a4a'), rope=G.toon('#a08a5e'), iron=G.toon('#2c2628');
  if(p.id==='planks'){ for(let i=0;i<5;i++){ const m=new THREE.Mesh(new THREE.BoxGeometry(2.2,.07,.24),i%2?dark:wood); m.position.set((i%2)*.08-.04,.06+i*.075,(i-2)*.03); m.rotation.y=(i-2)*.05; m.castShadow=true; g.add(m); G.outline&&G.outline(m,{thickness:.02}); }
    const prop=new THREE.Mesh(new THREE.BoxGeometry(.24,.5,.24),dark); prop.position.set(1.2,.25,.2); g.add(prop); }
  if(p.id==='rope'){ for(let k=0;k<4;k++){ const m=new THREE.Mesh(new THREE.TorusGeometry(.36-k*.04,.045,5,18),rope); m.rotation.x=PI/2; m.position.y=.06+k*.07; m.castShadow=true; g.add(m); }
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.06,.07,1,6),dark); post.position.set(.55,.5,0); g.add(post); }
  if(p.id==='sail'){ const m=new THREE.Mesh(new THREE.BoxGeometry(1.1,.32,.8),canvas); m.position.y=.16; m.castShadow=true; g.add(m); G.outline&&G.outline(m,{thickness:.02});
    const pa=new THREE.Mesh(new THREE.PlaneGeometry(.36,.28),patch); pa.rotation.x=-PI/2; pa.position.set(.2,.33,.1); g.add(pa);
    const tie=new THREE.Mesh(new THREE.TorusGeometry(.42,.02,4,16),rope); tie.rotation.y=PI/2; tie.scale.set(1,.45,1); tie.position.y=.16; g.add(tie); }
  if(p.id==='pitch'){ const pot=new THREE.Mesh(new THREE.CylinderGeometry(.32,.26,.5,10),iron); pot.position.y=.25; pot.castShadow=true; g.add(pot); G.outline&&G.outline(pot,{thickness:.02});
    const tar=new THREE.Mesh(new THREE.CircleGeometry(.29,10),G.toon('#0e0b0c')); tar.rotation.x=-PI/2; tar.position.y=.49; g.add(tar);
    const kiln=new THREE.Mesh(new THREE.ConeGeometry(1.1,1.3,9,1,true),G.toon('#857a70',{side:THREE.DoubleSide})); kiln.scale.setScalar(1.3); kiln.position.set(-1.8,.85,.4); g.add(kiln); }
  G.scene.add(g); g.visible=false; return g;
}
function partPos(p){ return V(p.x,H(p.x,p.z)+.4,p.z); }
function takePart(p){
  if(S.parts[p.id])return; S.parts[p.id]=true; if(p.mesh)p.mesh.visible=false;
  const n=count(); G.emit('boat:part',{id:p.id,count:n});
  try{ G.ui.toast(p.name,'For the boat · '+n+' of '+PARTS.length); }catch(e){}
  try{ G.ui.say(p.note,null,{priority:'normal',key:'boatPart-'+p.id}); }catch(e){}
  try{ const A=G.audio; if(A&&A.ready&&A.S)A.S.thud(A.context.currentTime,{g:.2,dur:.18}); }catch(e){}
  setQuest(); save();
}

/* ------------------------------------------------------------------ the patched boat */
let boat=null;
function buildBoat(){
  const g=new THREE.Group(); g.name='rowanBoat';
  const wood=G.toon('#94704f',{vertexColors:true}), dark=G.toon('#5a4231'), canvas=G.toon('#d4c6a2',{side:THREE.DoubleSide}), patch=G.toon('#8a5a4a',{side:THREE.DoubleSide}), rope=G.toon('#a08a5e');
  // hull: a tapered half-cylinder, the old blue band along the gunwale and new pale planks where the bow was rebuilt
  const L=5.4, hull=new THREE.CylinderGeometry(1.25,1.25,L,18,12,true,PI,PI); hull.rotateZ(PI/2);
  const P=hull.attributes.position, col=new Float32Array(P.count*3), c=new THREE.Color(), blue=new THREE.Color('#40606e'), oak=new THREE.Color('#94704f'), fresh=new THREE.Color('#c2a27a');
  for(let i=0;i<P.count;i++){ const hx=P.getX(i), t=hx/(L/2), w=Math.max(.04,1-Math.pow(Math.abs(t),2.3));
    const y=P.getY(i)*.7*(1-.22*t*t)+.32*t*t; P.setXYZ(i,hx,y,P.getZ(i)*w);
    c.copy(hx>.6?fresh:oak); if(y>-.12)c.lerp(blue,.85); c.toArray(col,i*3); }
  hull.setAttribute('color',new THREE.BufferAttribute(col,3)); hull.computeVertexNormals();
  const hm=new THREE.Mesh(hull,wood); hm.position.y=.62; hm.castShadow=true; hm.receiveShadow=true; g.add(hm); G.outline&&G.outline(hm,{thickness:.03});
  for(const [x,w] of [[-1.4,1.7],[.1,2.2],[1.3,1.6]]){ const t=new THREE.Mesh(new THREE.BoxGeometry(.2,.07,w),dark); t.position.set(x,.5,0); g.add(t); }
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.08,.11,4.6,8),dark); mast.position.set(.4,2.6,0); mast.castShadow=true; g.add(mast);
  const yard=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,3,6),dark); yard.rotation.x=PI/2; yard.position.set(.42,4.3,0); g.add(yard);
  // Hesper's sail, bent on the yard, with her patch
  const sg=new THREE.PlaneGeometry(2.8,2.9,6,6), SP=sg.attributes.position; for(let i=0;i<SP.count;i++){ const x=SP.getX(i), y=SP.getY(i); SP.setZ(i,.32*(1-Math.pow(y/1.45,2))*(1-.3*Math.abs(x))); }
  sg.computeVertexNormals(); const sail=new THREE.Mesh(sg,canvas); sail.rotation.y=PI/2; sail.position.set(.5,2.8,0); sail.castShadow=true; g.add(sail);
  const pa=new THREE.Mesh(new THREE.PlaneGeometry(.6,.5),patch); pa.rotation.y=PI/2; pa.position.set(.86,2.4,.5); g.add(pa);
  const tiller=new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,1.3,6),dark); tiller.rotation.z=PI/2.3; tiller.position.set(-2.55,1.05,0); g.add(tiller);
  const pts=[V(.4,4.2,0),V(1.6,2.2,0),V(2.55,.95,0)]; g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),8,.02,4,false),rope));
  const pts2=[V(.4,4.2,0),V(-1.2,2.4,0),V(-2.4,1.05,0)]; g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2),8,.02,4,false),rope));
  g.position.set(MOOR.x,(G.world.seaLevel||0)-.3,MOOR.z); g.rotation.y=MOOR.yaw;
  G.scene.add(g); g.visible=false; boat=g;
  moorCol={x:MOOR.x,z:MOOR.z,r:1.4,y0:-4,y1:2}; G.addCollider(moorCol);
}
/* where she's moored: the south beach (home) or the north island's cove (northisle.js moves her there and back) */
let moorCol=null;
function moorAt(x,z,yaw){ if(!boat)return; boat.position.x=x; boat.position.z=z; boat.rotation.y=yaw;
  if(moorCol){ G.removeCollider(moorCol); moorCol.x=x; moorCol.z=z; G.addCollider(moorCol); } }
function moorHome(){ moorAt(MOOR.x,MOOR.z,MOOR.yaw); }
const atHome=()=>!(G.northIsle&&G.northIsle.at==='north');

/* ------------------------------------------------------------------ the quest */
function setQuest(){
  if(!G.quest||!S.started)return;
  if(S.built&&!atHome())return;   // over on the north island: northisle.js has the objective
  const n=count();
  if(S.built){ G.quest.set('boat:ready','Sail north','Your boat is waiting in the shallows by the wreck',boat?boat.position.clone().add(V(0,2,0)):null,'Your boat'); return; }
  if(!S.looked){ G.quest.set('boat','Your boat','Look her over, on the south beach where you washed up',WRECK.clone().setY(H(WRECK.x,WRECK.z)+1.5),'The wreck'); return; }
  if(n<PARTS.length){ const miss=PARTS.filter(p=>!S.parts[p.id]); const next=nearestMissing();
    G.quest.set('boat:parts','Patch your boat',PARTS.map(p=>(S.parts[p.id]?'✓ ':'')+p.short).join(' · ')+' — '+n+' of '+PARTS.length,next?partPos(next):null,next?next.name:''); return; }
  G.quest.set('boat:patch','Patch your boat','You have everything. Back to the wreck',WRECK.clone().setY(H(WRECK.x,WRECK.z)+1.5),'The wreck');
}
function nearestMissing(){ const pp=G.player&&G.player.pos; let best=null,bd=1e9; for(const p of PARTS){ if(S.parts[p.id])continue; const d=pp?Math.hypot(p.x-pp.x,p.z-pp.z):0; if(d<bd){bd=d;best=p;} } return best; }
function start(quiet){
  if(S.started)return; S.started=true; G.emit('boat:start',{});
  if(!quiet){ later(4.5,()=>{ try{ G.ui.say('My boat’s still on the south rocks. If I can patch her, I can go and see who’s keeping that light.','Rowan',{priority:'high',key:'boatStart'}); }catch(e){} });
    later(6,()=>{ setQuest(); try{ G.ui.toast&&G.ui.toast('Your boat','Marked on your map'); }catch(e){} }); }
  markers(); save();
}
function lookOver(){
  if(!S.looked){ S.looked=true; G.emit('boat:looked',{}); markers(); }
  const miss=PARTS.filter(p=>!S.parts[p.id]);
  const lines=S.looked&&count()===0?[
      'The bow’s matchwood, but the stern half’s sound. Cut her down and plank over the front and she’ll float.',
      'Planks: the hamlet’s full of good boards no one needs now. Rope: Halloran always kept rope in the shed.',
      'A sail: Hesper had an old one at the cottage. And pitch for the seams. The charcoal-burners had a kiln in the old wood.']
    :['Still need: '+miss.map(p=>p.name.replace('Hesper’s old ','her old ').toLowerCase()+' from '+p.where).join(', ')+'.'];
  for(const l of lines)try{ G.ui.say(l,'Rowan',{priority:'high'}); }catch(e){}
  setQuest(); save();
}
/* patching her: a few seconds of work, the screen dims, hammer and mallet; then the broken halves are gone */
let work=null;
function patch(){
  if(work||S.built||count()<PARTS.length)return;
  work={t:0,next:0}; G.emit('boat:patching',{});
  try{ G.ui.say('You work through what’s left of the night: the bow cut away, new planks, pitch in every seam, her sail bent on.',null,{priority:'high',key:'boatWork'}); }catch(e){}
  const f=document.getElementById('fade'); if(f){ f.style.transition='opacity .6s'; f.style.opacity='.82'; }
}
const STRIKES=[.35,.8,1.25,1.7,2.15,2.6];
function updateWork(dt){
  if(!work)return; work.t+=dt;
  while(work.next<STRIKES.length&&work.t>=STRIKES[work.next]){ const i=work.next++; try{ const A=G.audio; if(A&&A.ready&&A.S){ const t=A.context.currentTime; (i%2?A.S.thud:A.S.clank)(t,{g:.16,dur:.2}); } }catch(e){} }
  if(work.t>=3.2){ work=null; finish(false); const f=document.getElementById('fade'); if(f)f.style.opacity='0'; }
}
function finish(quiet){
  S.built=true; applyBuilt(); G.emit('boat:built',{restored:!!quiet});
  if(!quiet){ try{ G.ui.toast('Your boat','Patched and afloat'); }catch(e){}
    later(.8,()=>{ try{ G.ui.say('She’ll float. Hesper’s stitches are holding the wind already.','Rowan',{priority:'high',key:'boatBuilt'}); }catch(e){} });
    try{ const A=G.audio; if(A&&A.ready&&A.S)A.S.bell&&A.S.bell(A.context.currentTime,57,{g:.12,decay:3}); }catch(e){} }
  setQuest(); save();
}
function applyBuilt(){
  const w=G.world.wreck; if(w&&w.hull)w.hull.visible=!S.built;
  if(w&&w.hullColliders){ for(const c of w.hullColliders){ if(S.built&&!c._off){ G.removeCollider(c); c._off=true; } else if(!S.built&&c._off){ G.addCollider(c); c._off=false; } } }
  if(boat)boat.visible=S.built;
}
function sailNorth(){
  // the crossing (Heath's call: a short scripted sail through the fog): northisle.js
  if(G.northIsle&&G.northIsle.cross){ G.emit('boat:sail',{ready:true}); G.northIsle.cross('north'); return; }
  try{ G.ui.say('North, toward the green light. Not tonight.','Rowan',{priority:'high',key:'boatNorth'}); }catch(e){}
  G.emit('boat:sail',{ready:false});
}

/* ------------------------------------------------------------------ map */
let marked=false;
function markers(){
  if(marked||!(G.map&&G.map.addMarker))return; marked=true;
  G.map.addMarker({id:'boat',kind:'objective',label:'Your boat',pos:()=>S.built&&boat?{x:boat.position.x,z:boat.position.z}:{x:WRECK.x,z:WRECK.z},visible:()=>S.started});
  for(const p of PARTS)G.map.addMarker({id:'boat-'+p.id,kind:'cache',label:p.name,pos:{x:p.x,z:p.z},visible:()=>S.started&&S.looked&&!S.parts[p.id]&&!S.built});
}

/* ------------------------------------------------------------------ save */
function save(){ /* flow.js gathers G.persist on its own autosave */ }
function load(d){
  if(!d)return; S.started=!!d.started; S.looked=!!d.looked; S.parts=Object.assign({},d.parts||{}); S.built=!!d.built;
  applyBuilt(); if(S.started)markers(); syncParts();
}
function syncParts(){ for(const p of PARTS)if(p.mesh)p.mesh.visible=S.started&&!S.parts[p.id]&&!S.built; }
const reg=()=>G.persist&&G.persist.register&&G.persist.register('boat',{save:()=>JSON.parse(JSON.stringify(S)),load});
if(G.persist&&G.persist.register)reg(); else G.on('ready',reg);

/* ------------------------------------------------------------------ wiring */
G.on('north:seen',()=>start(false));
G.on('loop:start',e=>{ if(e&&e.restored&&!S.started&&G.flag&&G.flag('northLight'))start(true); });   // a save from before the boat
G.system('boat',{order:48,modes:['play','paused','dead'],
  init(){
    try{ for(const p of PARTS){ p.mesh=partMesh(p);
      G.interact.add({pos:()=>partPos(p),radius:2.2,priority:4,label:p.label,enabled:()=>isPlay()&&S.started&&!S.parts[p.id]&&!S.built,use:()=>takePart(p)}); }
      buildBoat(); built3d=true; }catch(e){ console.error('boat',e); }
    G.interact.add({pos:()=>V(WRECK.x,H(WRECK.x,WRECK.z)+.6,WRECK.z),radius:3.4,priority:4,
      label:()=>!S.looked?'Look over the boat':count()<PARTS.length?'The boat · '+count()+' of '+PARTS.length+' parts':'Patch the boat',
      enabled:()=>isPlay()&&S.started&&!S.built&&!work,use:()=>{ if(S.looked&&count()>=PARTS.length)patch(); else lookOver(); }});
    G.interact.add({pos:()=>boat?V(boat.position.x,.4,boat.position.z):V(0,-999,0),radius:4.6,priority:4,label:'Sail north',   // from the waterline: she's moored a few steps out
      enabled:()=>isPlay()&&S.built&&atHome()&&!(G.northIsle&&G.northIsle.crossing),use:sailNorth});
    applyBuilt(); syncParts();
  },
  update(dt){
    for(let i=timers.length-1;i>=0;i--){ if(G.time>=timers[i].t){ const f=timers[i].fn; timers.splice(i,1); try{ f(); }catch(e){ console.error(e); } } }
    if(G.state.mode==='play')updateWork(dt||0);
    syncParts();
    if(boat&&boat.visible&&!(G.northIsle&&G.northIsle.crossing)){ const t=G.time||0; boat.position.y=(G.world.seaLevel||0)-.3+Math.sin(t*1.3)*.06; boat.rotation.z=Math.sin(t*1.1)*.035; boat.rotation.x=Math.sin(t*.8+1)*.025; }
  }
});
G.on('game:reset',()=>{ S.started=S.looked=S.built=false; S.parts={}; applyBuilt(); syncParts(); });

G.boat={state:S,PARTS,get mesh(){ return boat; },moorAt,moorHome,get started(){ return S.started; },get built(){ return S.built; },count,get working(){ return !!work; },
  debug:{start:()=>start(false),give:id=>{ const p=BY[id]; if(p)takePart(p); },look:lookOver,patch,build:()=>finish(true),sail:sailNorth,
    reset(){ S.started=S.looked=S.built=false; S.parts={}; work=null; applyBuilt(); syncParts(); }, wreckPos:WRECK, moor:MOOR}};
})();

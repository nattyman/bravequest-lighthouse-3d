/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — lens.js  (Place agent)
   The Vigil Lens: a keeper's burning-glass that fits the front of the lantern. Found on the altar of the Vigil's
   reliquary (temple_puzzles.js puts it there and calls G.lens.give()).
   - with the Lens owned and the lantern open, HOLD the shutter action (F / controller RB / the lantern button) and after
     ~.3 s the lantern narrows into a focused BEAM (~14 m, aimed where the camera looks); let go to open it again. A tap is
     still the shutter tap it always was (core.js LENS HOOK sends it on release)
   - the beam BURNS what is registered as burnable (ink-root seals, the Vigilants' ink skins): ~1.2 s of beam each
   - it REFLECTS off the Vigil's bronze mirrors: a mirror that catches the beam hands it on along the way it is turned
     (temple_puzzles.js turns them); each mirror gives the beam a fresh reach
   - it is seen and heard: the Vigilants turn toward a focused beam (G.lens.focused / G.lens.beam), and the swarm hangs
     back while it is on
   API: G.lens = {owned, focused, range, beam:{origin, dir, length, hit:{pos,object,kind,bounces}|null, segments, bounces},
                  burnable(o) -> o  (o: {id, pos:Vector3 (live), radius, needs:seconds, onBurn(o), onHeat?(o,k), minBounces?,
                                     from?:mirrorId, keep?:bool (a target: stays after it burns), enabled?()}),
                  burnable.remove(o) / unburnable(o), mirrors:[], addMirror(m), give(o), armed(), focus(on) (tests/devtools),
                  upgrade(range)}
   Events: lens:found · lens:focus {on} · lens:burn {id} · lens:hit {kind, id}. Persist key 'lens'.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const {clamp,smooth}=U;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const C=hex=>U.col(hex);

const T={range:14, mirrorRange:26, maxBounce:6, cone:6, burnDecay:.5, catchR:.75, speedMul:.55};
const S={owned:false,focused:false,forced:false,said:{},range:T.range,focusT:0,heatFx:0,lastHitKind:null,hintT:0,hintNear:false};
const burnables=[], mirrors=[];
const beam={origin:V(), dir:V(0,0,-1), length:0, hit:null, segments:[], bounces:0};
const _a=V(), _b=V(), _d=V(), _t=V(), _n=V();

/* ================================================================ API */
function burnable(o){ if(!o)return o; o.heat=o.heat||0; o.burned=!!o.burned; o.radius=o.radius||.6; o.needs=o.needs||1.2;
  if(burnables.indexOf(o)<0)burnables.push(o); o.remove=()=>unburnable(o); return o; }
function unburnable(o){ const i=burnables.indexOf(o); if(i>=0)burnables.splice(i,1); }
burnable.remove=unburnable; burnable.list=burnables;
/** m: {id, pos:Vector3 (world, the mirror's centre), radius, out(inDir)->Vector3|null (null: it doesn't catch from there),
       enabled?()} — a caught beam goes on along out() from the mirror's centre with a fresh reach */
function addMirror(m){ if(mirrors.indexOf(m)<0)mirrors.push(m); return m; }
const lantern=()=>G.items&&G.items.lantern;
function armed(){
  const L=lantern(), P=G.player;
  return S.owned&&!!L&&L.carried&&!L.inCradle&&!L.shut&&!!P&&P.alive!==false&&G.state.mode==='play'&&!(G.glass&&G.glass.raised);
}
const API=G.lens={
  get owned(){ return S.owned; }, get focused(){ return S.focused; }, get range(){ return S.range; },
  beam, burnable, unburnable, mirrors, addMirror, armed,
  give(o){ if(S.owned)return false; S.owned=true; attachToLantern(); if(!(o&&o.silent))rewardMoment(); G.emit('lens:found',{silent:!!(o&&o.silent)}); return true; },
  /** tests / devtools: hold the beam without the input (on=false lets go) */
  focus(on){ S.forced=!!on; return S.forced; },
  /** hold the beam on a world point instead of where the camera looks (tests; a scripted moment); null hands it back */
  aimAt(p){ S.aimAt=p?p.clone():null; return S.aimAt; },
  upgrade(range){ S.range=Math.max(S.range,+range||T.range); return S.range; },
  tune:T,
};

/* ================================================================ THE BEAM */
const inTemple=p=>!!(G.temple&&G.temple.contains&&G.temple.contains(p));
/** the world along one segment: temple stone (analytic), or the island (combat.js's aim raycast) */
function worldHit(from,dir,max){
  if(inTemple(from)&&G.temple.ray){ const r=G.temple.ray(from,dir,max); return r?{dist:r.dist,point:r.point,surface:r.surface}:null; }
  if(G.moves&&G.moves.raycast){ const r=G.moves.raycast(from,dir,max,{team:'__none__',step:.2}); if(r&&r.surface)return {dist:r.dist,point:r.point,surface:r.surface}; }
  return null;
}
/** ray vs sphere: distance along the ray or -1 */
function raySphere(o,d,c,r,max){ _t.copy(c).sub(o); const b=_t.dot(d); if(b<0||b-r>max)return -1; const q=_t.lengthSq()-b*b; if(q>r*r)return -1; return Math.max(0,b-Math.sqrt(r*r-q)); }
function monsterHit(o,d,max){
  let best=null, bd=max;
  for(const hb of G.hurtboxes){ if(hb.team!=='enemy'||(hb.alive&&!hb.alive()))continue; const h=hb.height||1.6;
    _a.set(hb.pos.x,hb.pos.y+h*.55,hb.pos.z); const t=raySphere(o,d,_a,(hb.radius||.5)+.1+h*.25,bd); if(t>=0&&t<bd){ bd=t; best=hb; } }
  return best?{dist:bd,hb:best}:null;
}
function trace(origin,dir){
  beam.segments.length=0; beam.hit=null; beam.bounces=0;
  let o=origin.clone(), d=dir.clone().normalize(), reach=S.range, total=0, lastMirror=null;
  for(let b=0;b<=T.maxBounce;b++){
    let best={dist:reach,kind:null,object:null};
    const w=worldHit(o,d,reach); if(w&&w.dist<best.dist)best={dist:w.dist,kind:w.surface||'wall',object:null};
    for(const m of mirrors){ if(m===lastMirror||(m.enabled&&!m.enabled()))continue; const t=raySphere(o,d,m.pos,m.radius||T.catchR,best.dist); if(t>=0&&t<best.dist)best={dist:t,kind:'mirror',object:m}; }
    for(const q of burnables){ if(q.burned&&!q.keep||(q.enabled&&!q.enabled()))continue; const t=raySphere(o,d,q.pos,q.radius,best.dist); if(t>=0&&t<best.dist)best={dist:t,kind:'burnable',object:q}; }
    const mh=monsterHit(o,d,best.dist); if(mh&&mh.dist<best.dist){ best={dist:mh.dist,kind:'monster',object:mh.hb};
      // an ink skin on that monster (a burnable riding it) takes the beam rather than the body under it
      for(const q of burnables){ if(q.burned&&!q.keep||(q.enabled&&!q.enabled()))continue; if(q.hb===mh.hb||q.pos.distanceTo(o.clone().addScaledVector(d,mh.dist))<q.radius+.8){ best={dist:mh.dist,kind:'burnable',object:q}; break; } } }
    const end=o.clone().addScaledVector(d,best.dist);
    beam.segments.push({a:o.clone(),b:end,len:best.dist});
    total+=best.dist;
    if(best.kind==='mirror'){
      const m=best.object, out=m.out?m.out(d.clone(),b,lastMirror):null;
      if(out){ beam.bounces=b+1; lastMirror=m; o=m.pos.clone(); d=out.clone().normalize(); reach=T.mirrorRange; m.lit=G.time;
        beam.segments[beam.segments.length-1].b.copy(m.pos); continue; }
      beam.hit={pos:end,object:m,kind:'mirror',bounces:b,from:lastMirror&&lastMirror.id}; break;
    }
    beam.hit=best.kind?{pos:end,object:best.object,kind:best.kind,bounces:b,from:b>0&&lastMirror?lastMirror.id:null}:null;
    if(!best.kind)beam.hit=null;
    break;
  }
  beam.length=total;
  return beam;
}
/** where the camera looks, and the beam from the lantern toward it */
function aim(){
  const L=lantern(), cam=G.camera; if(!L||!cam)return false;
  const origin=(L.world&&L.world.lengthSq()>0)?L.world:G.player.pos.clone().add(V(0,1.1,0));
  if(S.aimAt){ beam.origin.copy(origin); beam.dir.copy(S.aimAt).sub(origin).normalize(); return true; }
  cam.getWorldDirection(_d);
  // the point under the crosshair (or far along it)
  let far=40; const w=worldHit(cam.position,_d,40); if(w)far=w.dist;
  _t.copy(cam.position).addScaledVector(_d,Math.max(far,4));
  for(const m of mirrors){ const t=raySphere(cam.position,_d,m.pos,(m.radius||T.catchR)*1.3,far); if(t>=0&&t<far){ far=t; _t.copy(m.pos); } }   // aim assist: a mirror under the crosshair takes the beam
  for(const q of burnables){ if(q.burned&&!q.keep||(q.enabled&&!q.enabled()))continue; const t=raySphere(cam.position,_d,q.pos,q.radius*1.2,far); if(t>=0&&t<far){ far=t; _t.copy(q.pos); } }
  beam.origin.copy(origin); beam.dir.copy(_t).sub(origin).normalize();
  if(!isFinite(beam.dir.x)||beam.dir.lengthSq()<.5)beam.dir.copy(_d);
  return true;
}
function burnTick(dt){
  const h=beam.hit, hitB=S.focused&&h&&h.kind==='burnable'?h.object:null;
  for(const q of burnables){
    if(q.burned&&!q.keep)continue;
    const ok=hitB===q&&(!q.minBounces||h.bounces>=q.minBounces)&&(!q.from||h.from===q.from);
    if(ok){ q.heat=Math.min(q.needs,q.heat+dt); q.hot=G.time;
      if(G.ink&&G.ink.burst&&Math.random()<dt*14)try{ G.ink.burst(h.pos,{n:2,speed:1.4,size:[.15,.5],life:[.3,.7],up:1.2,embers:3,color:'#ffd9a0',alpha:.7}); }catch(_){}
      if(q.heat>=q.needs&&!q.burned){ q.burned=true; try{ q.onBurn&&q.onBurn(q); }catch(e){ console.error('lens burn',e); } G.emit('lens:burn',{id:q.id,pos:q.pos.clone()}); } }
    else if(hitB===q&&!ok){ if(q.onReject&&(!q.rejT||G.time-q.rejT>4)){ q.rejT=G.time; try{ q.onReject(q,h); }catch(e){ console.error(e);} } q.heat=Math.max(0,q.heat-dt*T.burnDecay); }
    else q.heat=Math.max(0,q.heat-dt*T.burnDecay);
    if(q.onHeat)try{ q.onHeat(q,q.heat/q.needs); }catch(e){ console.error(e); }
  }
  const kind=h&&S.focused?h.kind:null;
  if(kind!==S.lastHitKind){ S.lastHitKind=kind; if(kind)G.emit('lens:hit',{kind,id:h.object&&h.object.id}); }
}

/* ================================================================ VISUALS */
const VIS={segs:[],root:null};
function beamMat(core){ return new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uK:{value:0},uC:{value:C(core?'#fff4d6':'#ffc46a')}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  vertexShader:'varying vec3 vN;varying vec3 vV;varying float vY;void main(){vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);vY=uv.y;gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:`uniform float uTime,uK;uniform vec3 uC;varying vec3 vN;varying vec3 vV;varying float vY;void main(){ float f=abs(dot(normalize(vN),vV)); float a=pow(f,${core?'2.5':'1.6'})*uK;
    a*=.8+.2*sin(vY*40.-uTime*18.); a*=smoothstep(0.,.03,vY)*smoothstep(1.,.97,vY)+.15; gl_FragColor=vec4(uC*a*${core?'1.8':'.7'},1.);}`}); }
function buildVis(){
  VIS.root=new THREE.Group(); VIS.root.name='lensBeam'; G.scene.add(VIS.root);
  const coreG=new THREE.CylinderGeometry(.045,.045,1,6,1,true), haloG=new THREE.CylinderGeometry(.22,.22,1,8,1,true);
  for(const g of [coreG,haloG]){ g.translate(0,.5,0); g.rotateX(PI/2); }   // along +z, from 0 to 1
  for(let i=0;i<=T.maxBounce;i++){ const g=new THREE.Group(); const c=new THREE.Mesh(coreG,beamMat(true)), h=new THREE.Mesh(haloG,beamMat(false));
    c.frustumCulled=h.frustumCulled=false; g.add(h,c); g.visible=false; VIS.root.add(g); VIS.segs.push({g,c,h}); }
  VIS.spot=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:C('#ffd890'),transparent:true,opacity:0,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));
  VIS.spot.renderOrder=8; VIS.spot.scale.setScalar(1.6); VIS.root.add(VIS.spot);
  VIS.mouth=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:C('#fff0c8'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
  VIS.mouth.scale.setScalar(.9); VIS.root.add(VIS.mouth);
  // one light rides the beam's end (always in the scene, so the light count never changes and no shader recompiles)
  VIS.light=new THREE.PointLight(0xffd29a,0,9,1.7); G.scene.add(VIS.light);
}
const _q=new THREE.Quaternion(), _z=V(0,0,1);
function updateVis(dt){
  if(!VIS.root)return;
  const on=S.focused, k=S.focusT;
  for(let i=0;i<VIS.segs.length;i++){ const s=VIS.segs[i], sg=beam.segments[i];
    if(!on||!sg||sg.len<.05||k<.02){ s.g.visible=false; continue; }
    s.g.visible=true; s.g.position.copy(sg.a); _d.copy(sg.b).sub(sg.a); const L=_d.length(); _d.multiplyScalar(1/L);
    s.g.quaternion.setFromUnitVectors(_z,_d); s.g.scale.set(1,1,L);
    for(const m of [s.c,s.h]){ m.material.uniforms.uTime.value=G.time; m.material.uniforms.uK.value=k*(i?0.9:1); } }
  const h=beam.hit;
  if(on&&k>.05&&h){ VIS.spot.visible=true; VIS.spot.position.copy(h.pos); const burning=h.kind==='burnable';
    VIS.spot.material.opacity=k*(burning?.95:.6)*(.85+.15*Math.sin(G.time*23)); VIS.spot.scale.setScalar((burning?2.2:1.3)*(1+.1*Math.sin(G.time*17)));
    VIS.spot.material.color.copy(C(burning?'#ffb35c':h.kind==='mirror'?'#fff6d8':'#ffd890'));
    VIS.light.position.copy(h.pos).addScaledVector(beam.dir,-.4); VIS.light.intensity=k*(burning?3.2:2.0); }
  else{ VIS.spot.visible=false; VIS.light.intensity=U.damp(VIS.light.intensity,0,10,dt); if(on&&k>.05&&beam.segments.length){ VIS.light.position.copy(beam.segments[beam.segments.length-1].b); VIS.light.intensity=k*1.2; } }
  VIS.mouth.visible=on&&k>.02; if(VIS.mouth.visible){ VIS.mouth.position.copy(beam.origin).addScaledVector(beam.dir,.12); VIS.mouth.material.opacity=k*.8; }
}
/* the Lens on the lantern: a brass ring and a disc of old glass across the front of the cage */
function attachToLantern(){
  const L=lantern(); const obj=L&&L.object; if(!obj||VIS.onLantern)return;
  const g=new THREE.Group(); const brass=G.toon(G.PAL.gold,{emissive:'#3a2a0c',emissiveIntensity:.3});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.085,.014,6,18),brass); g.add(ring);
  const glass=new THREE.Mesh(new THREE.CircleGeometry(.08,16),new THREE.MeshBasicMaterial({color:C('#f2e6c8'),transparent:true,opacity:.28,depthWrite:false})); g.add(glass);
  for(const s of [-1,1]){ const clip=new THREE.Mesh(new THREE.BoxGeometry(.02,.05,.03),brass); clip.position.set(s*.09,0,-.01); g.add(clip); }
  g.position.set(0,.16,.115); obj.add(g); VIS.onLantern=g;
}

/* ================================================================ THE MOMENT YOU FIND IT */
function keyName(){ const d=G.input&&G.input.device; return d==='gamepad'?'RB':d==='touch'||G.isMobile?'the lantern button':'F'; }
function rewardMoment(){
  const desc='Hold '+keyName()+' with the lantern open to focus it into a beam · it burns ink and the old mirrors carry it';
  try{ if(G.progress&&G.progress.reward)G.progress.reward({id:'lens',icon:'lens',name:'The Vigil Lens',eyebrow:'The Reliquary',desc});
    else G.ui.toast('The Vigil Lens',desc); }catch(_){}
  setTimeout(()=>{ try{ G.ui.say('A keeper’s burning-glass in a ring of green brass. It clips over the front of your lantern as if it were made for it. Hold the shutter and the light gathers into a single hot thread.',{priority:'high',key:'lensFound'}); }catch(_){} },900);
}

/* ================================================================ UPDATE */
function updateFocus(dt){
  const P=G.player, ok=armed();
  const want=ok&&(S.forced||(G.input&&G.input.down&&G.input.down('lens')));
  if(want!==S.focused){ S.focused=want; G.emit('lens:focus',{on:want});
    if(want&&!S.said.first){ S.said.first=1; setTimeout(()=>G.ui.say('The light narrows to a thread. It is hot where it lands.',{priority:'low',key:'lensFirst'}),300); } }
  S.focusT=U.damp(S.focusT,S.focused?1:0,S.focused?9:12,dt); if(!S.focused&&S.focusT<.01)S.focusT=0;
  if(S.focused&&P){ P.speedMul=Math.min(P.speedMul==null?1:P.speedMul,T.speedMul); S.slowSet=true; }
  else if(S.slowSet&&P){ S.slowSet=false; if(!(G.glass&&G.glass.raised)&&!(P.actionLock>.06))P.speedMul=1; }
  // hints: what holding does (once the Lens is yours), and how to let go
  // the hint only where there is something for it: inside the Vigil, or near anything that burns or a mirror
  if(ok&&!S.focused){ S.hintT-=dt; if(S.hintT<=0){ S.hintT=.5; const p=G.player.pos; S.hintNear=inTemple(p)||burnables.some(q=>!(q.burned&&!q.keep)&&(!q.enabled||q.enabled())&&q.pos.distanceTo(p)<16); }
    if(S.hintNear)G.hint(keyName()==='the lantern button'?'Hold':keyName()+' hold','Focus the Lens'); }
  else if(S.focused)G.hint(keyName()==='the lantern button'?'Let go':keyName(),'Let go: open the lantern');
}
/* the swarm hangs back from a focused beam (the moths won't follow a burning thread) */
function updateMoths(){
  const ms=(G.creatures&&G.creatures.moths)||[];
  for(const m of ms){
    if(S.focused&&m.tgt==='lantern'){ if(m._lensRad==null){ m._lensRad=m.rad; m._lensHy=m.hy; } m.rad=m._lensRad+3.4; m.hy=(m._lensHy||0)+1.6; }
    else if(m._lensRad!=null){ if(m.tgt==='lantern'){ m.rad=m._lensRad; m.hy=m._lensHy; } m._lensRad=null; m._lensHy=null; } }
}
G.system('lens',{order:23,modes:['play','dead','paused'],
  init(){ try{ buildVis(); }catch(e){ console.error('lens vis',e); } if(S.owned)attachToLantern(); },
  update(dt){
    if(G.state.mode!=='play'){ if(S.focused){ S.focused=false; G.emit('lens:focus',{on:false}); } updateVis(dt); return; }
    updateFocus(dt);
    if(S.focused&&aim())trace(beam.origin,beam.dir); else { beam.hit=null; beam.segments.length=0; beam.length=0; beam.bounces=0; }
    burnTick(dt); updateMoths(); updateVis(dt);
  }
});
G.on('player:dead',()=>{ S.forced=false; S.aimAt=null; });
G.on('temple:leaving',()=>{ S.forced=false; });

/* ================================================================ PERSISTENCE */
if(G.persist&&G.persist.register)G.persist.register('lens',{
  save:()=>({v:1,owned:S.owned,range:S.range,said:Object.keys(S.said)}),
  load:d=>{ if(!d)return; S.owned=!!d.owned; S.range=Math.max(T.range,+d.range||T.range); S.said={}; (d.said||[]).forEach(k=>{S.said[k]=1;}); S.forced=false; if(S.owned)attachToLantern(); }
});
if(G.debug)API._debug={S,T,VIS,trace,aim,burnables,mirrors};
})();

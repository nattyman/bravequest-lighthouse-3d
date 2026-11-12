/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — north.js
   The wrecker's light (Story Bible, "Threads for the north island"): once the lamp is cured and the
   Gloaming is beaten, a second light shows far out to the north, the wrong colour and turning the wrong
   way. It is the light Rowan steered for the night he was wrecked. Nobody explains it yet.
     - a cold green-white flare on the horizon about 650 m north of the lighthouse, with a beam that turns
       against ours (ours turns one way at .42 rad/s; this one turns the other way, a little slower). When its
       beam swings past you, the flare swells, like a real light seen from sea.
     - from the headland plateau or the tower, facing it for a moment: Rowan knows it (flag 'northLight',
       event 'north:seen'). Halloran and Hesper then have something to say about it (creatures.js, temple_people.js).
   API: G.north = { pos, visible, seen, sweep(), debug:{show(on), see()} }
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
// north is -z (the cottage door faces north); a little west of the tower so it sits off the cliff edge, not behind the vane
const POS=new THREE.Vector3(146,58,-708);   // the fire-basket on the wrecker's tower (northisle.js): from the headland it sits right on the horizon
const COL='#52e89a';        // cold sea-glass green, nothing like our amber or the ether's violet
const TURN=-.34;            // rad/s: ours turns +.42
const LOOK_COS=Math.cos(.45), LOOK_T=.7;
const CORE=U.col(COL).multiplyScalar(2.2);   // far off it burns white-hot at the heart; up close it's plainly green
const N={vis:0,look:0,yaw:0,built:false,force:null};
const seen=()=>!!(G.flag&&G.flag('northLight'));
let root, core, halo, beam, beamMat, coreMat, haloMat;

// after the Gloaming: its flag, or the core loop running (the loop only starts once the finale is won)
function ready(){ return N.force!=null?N.force:!!((G.flag&&G.flag('gloamingDead'))||(G.loop&&G.loop.active)); }

function build(){
  root=new THREE.Group(); root.name='northLight'; root.position.copy(POS); G.scene.add(root);
  coreMat=new THREE.SpriteMaterial({map:G.tex.flame,color:CORE.clone(),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false});
  core=new THREE.Sprite(coreMat); core.scale.setScalar(30); root.add(core);
  haloMat=new THREE.SpriteMaterial({map:G.tex.soft,color:U.col(COL),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false});
  halo=new THREE.Sprite(haloMat); halo.scale.setScalar(110); root.add(halo);
  // the beam: one long faint cone each way, like ours, seen side-on from the island as a slow sweep in the haze
  const tex=G.canvasTex(64,(g,s)=>{ const gr=g.createLinearGradient(0,0,0,s); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(.75,'rgba(255,255,255,.4)'); gr.addColorStop(1,'rgba(255,255,255,1)'); g.fillStyle=gr; g.fillRect(0,0,s,s); });
  beamMat=new THREE.MeshBasicMaterial({map:tex,color:U.col(COL),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false});
  beam=new THREE.Group(); root.add(beam);
  for(const s of [1,-1]){ const g=new THREE.ConeGeometry(16,260,24,1,true); g.translate(0,-130,0); g.rotateZ(s*PI/2); g.rotateZ(-s*.03);
    const m=new THREE.Mesh(g,beamMat); m.frustumCulled=false; beam.add(m); }
  root.visible=false; N.built=true;
}

/* how squarely the beam is pointing at the camera right now, 0..1 (the beam is double-ended) */
const _d=new THREE.Vector3(), _f=new THREE.Vector3();
function sweep(){
  const c=G.camera.position; const dx=c.x-POS.x, dz=c.z-POS.z, L=Math.hypot(dx,dz)||1;
  // cone arms run along local ±x; after rotation.y = yaw, +x points at (cos yaw, 0, -sin yaw)
  const ax=Math.cos(N.yaw), az=-Math.sin(N.yaw);
  return Math.pow(Math.abs((ax*dx+az*dz)/L),24);
}

/* where Rowan can make it out: up on the lighthouse (lamp room, gallery) or anywhere on the headland plateau around it —
   high enough to see over the north cliff (the third-person camera can't see past the lamp from the gallery's north side,
   so the plateau counts too) */
function onGallery(){
  const lh=G.world.lighthouse, p=G.player&&G.player.pos; if(!lh||!p)return false;
  if(p.y>lh.topY-.5&&p.y<lh.topY+4.5&&Math.hypot(p.x-lh.x,p.z-lh.z)<lh.outerR+1.3)return true;
  return p.y>lh.baseY-2&&Math.hypot(p.x-lh.x,p.z-lh.z)<70&&!(lh.inside&&lh.inside(p));
}
function see(){
  if(seen())return; G.flag('northLight',true); G.emit('north:seen',{pos:POS.clone()});
  try{ G.ui.say('There. That’s the light I steered for.','Rowan',{priority:'high',key:'northSeen1'});
       G.ui.say('It’s turning the wrong way.','Rowan',{priority:'high',key:'northSeen2'}); }catch(e){}
  try{ G.ui.logLine&&G.ui.logLine('A second light, far to the north. The wrong colour, turning the wrong way.','Seen'); }catch(e){}
}

G.system('north',{order:47,modes:['play','paused','dead','title'],
  init(){ try{ build(); }catch(e){ console.error('north',e); } },
  update(dt){
    if(!N.built)return;
    const inside=(G.cave&&G.cave.inside)||(G.undercroft&&G.undercroft.inside)||(G.temple&&G.temple.inside)||(G.northCave&&G.northCave.inside);
    const want=ready()&&!inside?1:0;
    N.vis=U.damp(N.vis,want,want?.35:2,dt||0);
    root.visible=N.vis>.005; if(!root.visible)return;
    if(G.state.mode!=='paused')N.yaw=(N.yaw+TURN*(dt||0))%TAU;
    beam.rotation.y=N.yaw;
    const sw=sweep(), t=G.time||0, fl=.86+.14*Math.sin(t*7.3)*Math.sin(t*2.1);   // a guttering, oily flame
    // sized for 700 m off; up close (the crossing, the island itself) it shrinks with distance so it stays a fire, not a sun
    const cd=G.camera.position.distanceTo(POS), near=U.clamp(cd/700,.035,1);
    coreMat.opacity=N.vis*(.7+.3*sw)*fl*(near<1?.6+.4*near:1); core.scale.setScalar((30+40*sw)*near); coreMat.color.copy(CORE).multiplyScalar(.4+.6*near);
    haloMat.opacity=N.vis*(.28+.5*sw)*(near<1?.55+.45*near:1); halo.scale.setScalar((110+170*sw)*near);
    beamMat.opacity=N.vis*.08;
    // Rowan knows it: from up on the headland or the tower, facing it for a moment
    if(!seen()&&G.state.mode==='play'&&N.vis>.6&&onGallery()){
      G.camera.getWorldDirection(_f); _d.copy(POS).sub(G.camera.position); _d.y=0; _d.normalize(); _f.y=0; _f.normalize();
      N.look=_f.dot(_d)>LOOK_COS?N.look+(dt||0):0;
      if(N.look>=LOOK_T)see();
    }
  }
});

G.north={pos:POS, get visible(){ return N.vis>.5; }, get seen(){ return seen(); }, get vis(){ return N.vis; }, sweep:()=>N.built?sweep():0, TURN,
  debug:{ show(on){ N.force=on==null?null:!!on; }, see, get look(){ return N.look; }, get yaw(){ return N.yaw; }, set yaw(v){ N.yaw=v; }, onGallery } };
})();

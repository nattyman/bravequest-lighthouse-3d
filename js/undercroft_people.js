/* =====================================================================
   undercroft_people.js — the people of Wickham's End (People agent; spec: UNDERCROFT.md)
   - the four half-Unmade villagers: Old Tamsin (warns), Corwin (lies), Wren (begs), Hob the miller (repeats);
     NPCs, never hostile, strikes pass through them with a soft ash puff; each talk moves their story on
   - Corwin's lie and the cellar trap · the chapel bell-ropes and the mill sluice gates (Hob's sentence)
   - the parish register with Wren's page torn out; through the Glass, the page is carried off toward the store
   - pages (letters and logbooks) — Crane's last page is the Boss agent's
   - naming: after the boss and the Tithe Ledger, a talk choice speaks each name: Tamsin, Corwin and Hob rest
     (a gentle drift of pale moths up the stair); Wren must be fed on by 20 moths for ~10 s while Nameless crawl up
   - afterwards: Wren lives at the cured well in the hamlet (loop lines, Wren's Loaf); Halloran's two lines
   - discovery: the caption and quest marker when the trapdoor first stands open
   API: G.undercroftPeople = {state, villagers, talk(id), names(), speak(id), debug}
   Events (emits): undercroft:puzzle {id:'bells'|'sluice', solved} · undercroft:name {who} · undercroft:rest {who}
                   undercroft:saved {who:'wren'} · undercroft:trap {} · undercroft:page {id} · undercroft:discovered {}
   Listens: undercroft:bossDead · undercroft:ledger (or G.undercroftBoss.ledger / a progress:reward with 'ledger' in its id)
   Persist key 'undercroftPeople'.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const isPlay=()=>G.state.mode==='play';
const P=()=>G.player;
const LM=()=>(G.world&&G.world.landmarks)||{};
const rnd=U.rng?U.rng(5521):Math.random;

/* ---------------------------------------------------------------- where things are (G.undercroft, else O + local from the spec) */
const O0=V(0,60,-800);
const UC=()=>G.undercroft||null;
const origin=()=>(UC()&&UC().origin)||O0;
const W=(x,y,z)=>V(x,y,z).add(origin());
const inside=()=>!!(UC()&&UC().inside);
const FALLBACK={
  stair:{entry:[0,0,0]},
  cellars:{tamsin:[-7,-2,-27],wall:[0,-2,-34],trap:[9,-2,-30]},
  chapel:{corwin:[-14,-4,-42],register:[-24,-4,-50],niche:[-30,-4,-46],vestry:[-31,-4,-55],ropes:[[-19,-4,-56],[-21.5,-4,-56.5],[-24,-4,-56]]},
  mill:{hob:[22,-6,-54],gates:[[17,-6,-47],[20,-6,-46],[23,-6,-46]],stone:[24,-6,-55]},
  store:{door:[0,-8,-64],centre:[0,-8,-80],lectern:[0,-8,-96],exit:[10,-8,-92]}
};
function anchor(room,name){
  const u=UC(); const r=u&&u.rooms&&u.rooms[room]; const a=r&&r.anchors&&r.anchors[name];
  if(a)return Array.isArray(a)?a.map(v=>v.clone?v.clone():V(v.x,v.y,v.z)):(a.clone?a.clone():V(a.x,a.y,a.z));
  const f=FALLBACK[room]&&FALLBACK[room][name]; if(!f)return null;
  return Array.isArray(f[0])?f.map(p=>W(p[0],p[1],p[2])):W(f[0],f[1],f[2]);
}
const floorY=(p)=>{ try{ const y=G.floorAt(p.x,p.z,p.y+1.2); return isFinite(y)&&y>p.y-3?y:p.y; }catch(_){ return p.y; } };

/* ---------------------------------------------------------------- state (persisted) */
const S={v:1,talks:{tamsin:0,corwin:0,wren:0,hob:0},said:{},rested:{},named:{},names:false,bossDead:false,
  wren:{stage:'waiting',saved:false,met:false,loaf:0,hamletTalks:0},
  bells:false,sluice:false,gates:[0,0,0],trap:false,trapTold:false,register:false,registerEcho:false,pages:{},
  discovered:false,hal:{hamlet:false,came:false},glassFound:false};
function save(){ return JSON.parse(JSON.stringify(S)); }
function load(d){
  if(!d||d.v!==1)return;
  for(const k in d){ if(k==='wren'||k==='talks'||k==='hal')Object.assign(S[k],d[k]); else S[k]=d[k]; }
  if(S.wren.stage==='feeding')S.wren.stage='named';      // a save mid-feeding: she waits for the moths again
  applyLoaded();
}
if(G.persist&&G.persist.register)G.persist.register('undercroftPeople',{save,load});
else G.on('ready',()=>{ if(G.persist&&G.persist.register)G.persist.register('undercroftPeople',{save,load}); });

/* ---------------------------------------------------------------- words */
const NAMES={tamsin:'Wickham Tamsin Rowe',corwin:'Wickham Corwin Ashe',wren:'Wickham Wren Hollis',hob:'Wickham Hob Hollis'};
const WHO={
  tamsin:{name:'Old Tamsin',title:'The midwife'},
  corwin:{name:'Corwin',title:'The reeve’s clerk',lieTag:'Ink in his words'},
  wren:{name:'Wren',title:'The miller’s daughter'},
  hob:{name:'Hob',title:'The miller'}
};
const HOB_LINE='Three for the grain, two for the well, one for the reeve.';
/* pages: three in the dungeon from the People agent (Crane's last page is the Boss agent's) */
const PAGES={
  letter:{room:'cellars',at:[-4.6,-2,-24.2],author:'A letter, never sent',label:'Read the letter',
    text:'Dear sister — the reeve has been round with his book again, writing us all down. Says it’s for the tithe. My hands have gone cold since, and Hob’s girl says hers have too. I’ll send this when the lane clears. — T.'},
  sexton:{room:'chapel',at:[-15.2,-4,-49.6],author:'The sexton’s hand',label:'Read the sexton’s note',
    text:'Every name in the register is struck through, and not by me. Wren Hollis’s leaf is torn clean out. I heard it go, and I heard boots on the store stair after. God keep us. I am going to stop ringing the bells.'},
  crane:{room:'mill',at:[17.2,-6,-56.2],author:'Aldous Crane, reeve',label:'Read the reeve’s memorandum',
    text:'Tithe-roll, Michaelmas. All souls of Wickham’s End entered, fair copy, in the clerk’s best hand. The fog has the book. I have my name. It is a fair price, for a reeve must keep something of the village whole.'}
};
/* echo captions (what the Glass shows: the Place agent's scenes look their text up here by id; mine are said directly) */
const ECHOES={ // island echoes (glass.js shows them; their lines come from here when it has them): one points at Maren
  cottage:{who:'An echo',lines:['A woman in a keeper’s coat at the cottage table, writing by a violet light. She stops, and looks a long while toward the forest.']},
  gallery:{who:'An echo',lines:['Two keepers on the gallery, passing a pipe between them. “If the lamp ever goes,” says one, “the moths will know before we do.”']},
  stones:{who:'An echo',lines:['Children running the ring of stones, counting. One of them stops at the seventh stone, and will not go on.']},
  square:{who:'An echo',lines:['Market day in Wickham’s End. The reeve counts the tithe sacks off the cart: three, two, one. Everyone’s name is still their own.']}
};

/* ---------------------------------------------------------------- portraits for the talk card (cameos in a gentle palette) */
function portrait(id){
  return (g,w,h,glass)=>{
    const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,glass?'#5a4462':'#4a3a4c'); gr.addColorStop(1,'#1d1520'); g.fillStyle=gr; g.fillRect(0,0,w,h);
    const cx=w/2, hy=h*.42, hr=w*.25;
    const ink='#0b080e', skin={tamsin:'#c9b2a0',corwin:'#c4b4a4',wren:'#a9a6a8',hob:'#2a2230'}[id];
    // shoulders
    g.fillStyle={tamsin:'#5b3a4c',corwin:'#2f3240',wren:'#7a6a5a',hob:ink}[id];
    g.beginPath(); g.ellipse(cx,h*1.02,w*.46,h*.34,0,PI,TAU); g.fill();
    if(id==='corwin'){ g.fillStyle=ink; g.beginPath(); g.ellipse(cx-w*.33,h*.92,w*.14,h*.2,.3,0,TAU); g.ellipse(cx+w*.33,h*.92,w*.14,h*.2,-.3,0,TAU); g.fill(); g.fillStyle='#e9e0cc'; g.fillRect(cx-6,h*.72,12,h*.1); }
    // head
    g.fillStyle=skin; g.beginPath(); g.ellipse(cx,hy,hr,hr*1.18,0,0,TAU); g.fill();
    if(id==='tamsin'){ // half ink: the left side gone, one bright eye left
      g.save(); g.beginPath(); g.rect(0,0,cx+3,h); g.clip(); g.fillStyle=ink; g.beginPath(); g.ellipse(cx,hy,hr+1,hr*1.2,0,0,TAU); g.fill();
      g.beginPath(); g.ellipse(cx,h*1.02,w*.47,h*.35,0,PI,TAU); g.fill(); g.restore();
      g.fillStyle='#ede6dc'; g.beginPath(); g.ellipse(cx+hr*.15,hy-hr*.95,hr*1.05,hr*.5,0,PI,TAU); g.fill(); // cap
      const e=g.createRadialGradient(cx+hr*.42,hy-2,0,cx+hr*.42,hy-2,9); e.addColorStop(0,'#fff3c8'); e.addColorStop(.4,'#f0b04a'); e.addColorStop(1,'rgba(240,176,74,0)');
      g.fillStyle=e; g.beginPath(); g.arc(cx+hr*.42,hy-2,9,0,TAU); g.fill();
      g.strokeStyle='rgba(163,124,255,.6)'; g.lineWidth=1.5; g.beginPath(); g.moveTo(cx+3,hy-hr*1.2); g.quadraticCurveTo(cx-4,hy,cx+5,hy+hr*1.2); g.stroke();
    }else if(id==='corwin'){
      g.fillStyle='#3a2a20'; g.beginPath(); g.ellipse(cx,hy-hr*.75,hr*1.02,hr*.55,0,PI,TAU); g.fill();
      for(const s of [-1,1]){ g.fillStyle='#2a1c18'; g.beginPath(); g.arc(cx+s*hr*.42,hy-2,2.6,0,TAU); g.fill(); }
      g.fillStyle=ink; g.beginPath(); g.ellipse(cx,hy+hr*.52,hr*.42,hr*.2,0,0,TAU); g.fill(); // the ink mouth
      g.fillStyle='rgba(11,8,14,.85)'; g.fillRect(cx-2,hy+hr*.6,3,hr*.6);
      g.strokeStyle='#e9e0cc'; g.lineWidth=2; g.beginPath(); g.moveTo(cx+hr*.95,hy-hr*.4); g.lineTo(cx+hr*1.5,hy-hr*1.2); g.stroke(); // quill
    }else if(id==='wren'){
      g.fillStyle='#4a3b34'; g.beginPath(); g.ellipse(cx,hy-hr*.55,hr*1.1,hr*.85,0,PI,TAU); g.fill();
      g.fillStyle='#4a3b34'; g.fillRect(cx-hr*1.08,hy-hr*.6,hr*.4,hr*1.6); g.fillRect(cx+hr*.68,hy-hr*.6,hr*.4,hr*1.6);
      g.fillStyle=ink; g.fillRect(cx-hr*1.08,hy+hr*.75,hr*.4,hr*.35); g.fillRect(cx+hr*.68,hy+hr*.75,hr*.4,hr*.35); // ink at the hair's ends
      for(const s of [-1,1]){ g.fillStyle='#3b3440'; g.beginPath(); g.arc(cx+s*hr*.4,hy,3,0,TAU); g.fill(); g.fillStyle='#e8e4ee'; g.beginPath(); g.arc(cx+s*hr*.4-1,hy-1,1,0,TAU); g.fill(); }
      g.strokeStyle='#6a5a60'; g.lineWidth=1.4; g.beginPath(); g.arc(cx,hy+hr*.55,hr*.22,.2*PI,.8*PI); g.stroke();
    }else{ // Hob: an ink shape; a pale smear of flour where an apron was
      g.fillStyle=ink; g.beginPath(); g.ellipse(cx,hy,hr,hr*1.18,0,0,TAU); g.fill();
      g.fillStyle='rgba(230,222,205,.28)'; g.beginPath(); g.ellipse(cx+w*.06,h*.94,w*.16,h*.12,.2,0,TAU); g.fill();
      g.strokeStyle='rgba(163,124,255,.45)'; g.lineWidth=2; g.beginPath(); g.ellipse(cx,hy,hr,hr*1.18,0,0,TAU); g.stroke();
    }
    if(glass&&id!=='hob'){ g.fillStyle='rgba(255,200,140,.12)'; g.beginPath(); g.ellipse(cx,hy,hr*1.3,hr*1.5,0,0,TAU); g.fill(); }
    // the cameo's inner rim
    g.strokeStyle='rgba(233,220,192,.35)'; g.lineWidth=3; g.beginPath(); g.ellipse(cx,h/2,w/2-3,h/2-3,0,0,TAU); g.stroke();
  };
}

/* ---------------------------------------------------------------- villager models
   parts are built in local space and split into a toon mesh (vertex colours, outlined) and an ink mesh (G.negMaterial)
   by each part's `ink`: true / false / fn(x,y,z) per triangle. The echo of who they were is one additive mesh in the past layer. */
function colGeo(g,hex){ const c=new THREE.Color(hex); c.convertSRGBToLinear&&c.convertSRGBToLinear(); const n=g.attributes.position.count, a=new Float32Array(n*3);
  for(let i=0;i<n;i++){a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b;} g.setAttribute('color',new THREE.BufferAttribute(a,3)); return g; }
const _m=new THREE.Matrix4(), _q=new THREE.Quaternion(), _e=new THREE.Euler();
function xf(g,x,y,z,rx=0,ry=0,rz=0,sx=1,sy=sx,sz=sx){ _e.set(rx,ry,rz); _q.setFromEuler(_e); _m.compose(V(x,y,z),_q,V(sx,sy,sz)); g.applyMatrix4(_m); return g; }
function lathe(pts,seg=14){ return new THREE.LatheGeometry(pts.map(([r,y])=>new THREE.Vector2(r,y)),seg); }
function limb(a,b,r0,r1){ const d=V(b[0]-a[0],b[1]-a[1],b[2]-a[2]), L=d.length(); const g=new THREE.CylinderGeometry(r1,r0,L,7,2); g.translate(0,L/2,0);
  _q.setFromUnitVectors(V(0,1,0),d.normalize()); _m.makeRotationFromQuaternion(_q); g.applyMatrix4(_m); g.translate(a[0],a[1],a[2]); return g; }
/** split a list of {g,c,ink} into {toon, ink} non-indexed merged geometries */
function splitMerge(parts){
  const T={p:[],n:[],c:[]}, K={p:[],n:[]};
  for(const pt of parts){
    pt.g.computeVertexNormals(); let g=pt.g.index?pt.g.toNonIndexed():pt.g; colGeo(g,pt.c||'#888');
    const p=g.attributes.position, n=g.attributes.normal, c=g.attributes.color;
    for(let i=0;i<p.count;i+=3){
      const cx=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3, cy=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3, cz=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
      const inked=typeof pt.ink==='function'?pt.ink(cx,cy,cz):!!pt.ink, D=inked?K:T;
      for(let k=0;k<3;k++){ D.p.push(p.getX(i+k),p.getY(i+k),p.getZ(i+k)); D.n.push(n.getX(i+k),n.getY(i+k),n.getZ(i+k)); if(!inked)D.c.push(c.getX(i+k),c.getY(i+k),c.getZ(i+k)); }
    }
  }
  const mk=(D,col)=>{ if(!D.p.length)return null; const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(D.p,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(D.n,3)); if(col)g.setAttribute('color',new THREE.Float32BufferAttribute(D.c,3)); g.computeBoundingSphere(); return g; };
  return {toon:mk(T,true),ink:mk(K,false)};
}
const noise3=(x,y,z)=>Math.sin(x*12.9+y*7.3)*.5+Math.sin(y*9.1+z*11.7)*.3+Math.sin(z*5.3+x*3.1)*.2;
/* a body: the shared figure, dressed per villager */
function figure(o){
  const L=[], h=o.h||1.6, hunch=o.hunch||0;
  const sk=o.skirt||[[.05,h*.56],[.2,h*.55],[.27,h*.38],[.33,h*.12],[.35,0],[.0,0]];
  L.push({g:lathe(sk,16),c:o.cloth,ink:o.inkSkirt,tag:'skirt'});
  const tor=lathe([[.05,0],[.2,0],[.22,h*.12],[.2,h*.24],[.15,h*.3],[.06,h*.33]],14); xf(tor,0,h*.55,0,hunch,0,0); L.push({g:tor,c:o.top||o.cloth,ink:o.inkTorso,tag:'torso'});
  const nk=Math.sin(hunch)*h*.3, hy=h*.55+Math.cos(hunch)*h*.33;
  const head=new THREE.SphereGeometry(h*.075,14,11); xf(head,0,hy+h*.07,nk+.02,0,0,0,1,1.1,1); L.push({g:head,c:o.skin,ink:o.inkHead,tag:'head'});
  if(o.hair){ const hr=new THREE.SphereGeometry(h*.082,12,9,0,TAU,0,PI*.58); xf(hr,0,hy+h*.085,nk-.005,-.25,0,0,1,1.1,1.08); L.push({g:hr,c:o.hair,ink:o.inkHair,tag:'hair'}); }
  if(o.hairLong){ for(const s of [-1,1]){ const t=limb([s*h*.06,hy+h*.06,nk-.03],[s*h*.07,hy-h*.09,nk-.06],h*.032,h*.02); L.push({g:t,c:o.hair,ink:(x,y)=>y<hy-h*.04,tag:'hair'}); } }
  if(o.cap){ const c=new THREE.SphereGeometry(h*.088,12,8,0,TAU,0,PI*.5); xf(c,0,hy+h*.085,nk-.01,-.35,0,0,1.05,.8,1.1); L.push({g:c,c:o.cap,ink:o.inkCap,tag:'cap'}); }
  if(o.shawl){ const s=lathe([[.06,h*.1],[.24,h*.05],[.3,-h*.06],[.31,-h*.08]],14); xf(s,0,hy-h*.04,nk*.6,hunch*.6,0,0); L.push({g:s,c:o.shawl,ink:o.inkShawl,tag:'shawl'}); }
  // eyes
  for(const s of [-1,1]){ const e=new THREE.SphereGeometry(h*.011,6,5); xf(e,s*h*.028,hy+h*.08,nk+h*.072); L.push({g:e,c:o.eye||'#2a1c18',ink:o.inkEye?o.inkEye(s):false,tag:'eye'}); }
  if(o.mouth){ const m=new THREE.SphereGeometry(h*.022,8,6); xf(m,0,hy+h*.035,nk+h*.07,0,0,0,1.2,.55,.6); L.push({g:m,c:'#5a3a34',ink:o.mouth==='ink',tag:'mouth'}); }
  // arms: shoulder → elbow → hand, posed per villager
  const sy=h*.55+Math.cos(hunch)*h*.27, sz=Math.sin(hunch)*h*.24;
  for(const s of [-1,1]){
    const pose=(o.arms&&o.arms(s,h))||{el:[s*h*.17,sy-h*.2,sz+.05],hd:[s*h*.13,sy-h*.38,sz+.16]};
    const shp=[s*h*.15,sy,sz];
    L.push({g:limb(shp,pose.el,h*.035,h*.03),c:o.sleeve||o.top||o.cloth,ink:o.inkSleeve?o.inkSleeve(s):false,tag:'arm'});
    L.push({g:limb(pose.el,pose.hd,h*.03,h*.025),c:o.sleeve||o.top||o.cloth,ink:o.inkSleeve?o.inkSleeve(s):false,tag:'arm'});
    const hd=new THREE.SphereGeometry(h*.03,8,6); xf(hd,pose.hd[0],pose.hd[1],pose.hd[2],0,0,0,1,1.25,1); L.push({g:hd,c:o.skin,ink:o.inkHand?o.inkHand(s):false,tag:'hand'});
    if(o.fingertips){ const f=new THREE.ConeGeometry(h*.022,h*.05,6); xf(f,pose.hd[0],pose.hd[1]-h*.045,pose.hd[2],PI,0,0); L.push({g:f,c:o.skin,ink:true,tag:'tips'}); }
  }
  if(o.extra)o.extra(L,h,hy,nk);
  return L;
}
const DEF={
  tamsin:()=>figure({h:1.5,hunch:.42,cloth:'#5a4038',top:'#6a4a3e',skin:'#c9b2a0',shawl:'#5b3a4c',cap:'#ede6dc',
    inkSkirt:(x,y,z)=>x<.03*noise3(x,y,z)+.02, inkTorso:x=>x<.01, inkHead:(x,y,z)=>x<.012+.01*noise3(x*3,y*3,z), inkShawl:x=>x<0, inkCap:x=>x<-.03,
    inkSleeve:s=>s<0, inkHand:s=>s<0, inkEye:s=>s<0, mouth:true,
    arms:(s,h)=>s<0?{el:[-h*.16,h*.66,.2],hd:[-h*.08,h*.55,.34]}:{el:[h*.2,h*.7,.18],hd:[h*.22,h*.5,.3]},
    extra:(L,h)=>{ L.push({g:limb([h*.22,h*.5,.3],[h*.26,0,.42],.022,.02),c:'#4a3424',ink:false,tag:'cane'}); }}),
  corwin:()=>figure({h:1.72,hunch:.12,cloth:'#2f3240',top:'#3a3d4e',sleeve:'#3a3d4e',skin:'#c4b4a4',hair:'#3a2a20',mouth:'ink',
    skirt:[[.05,1.72*.56],[.2,1.72*.55],[.23,1.72*.4],[.27,1.72*.1],[.28,0],[0,0]],
    inkSleeve:()=>true, inkHand:()=>true,
    arms:(s,h)=>s<0?{el:[-h*.19,h*.66,.04],hd:[-h*.1,h*.58,.18]}:{el:[h*.19,h*.66,.06],hd:[h*.12,h*.66,.22]},
    extra:(L,h)=>{ const b=new THREE.BoxGeometry(.24,.04,.32); xf(b,-h*.09,h*.6,.2,.2,.3,0); L.push({g:b,c:'#5a2e24',ink:false,tag:'ledger'}); // a clerk's daybook under his arm
      const q=new THREE.ConeGeometry(.012,.3,5); xf(q,h*.07,h*.98,-.02,0,0,-.5); L.push({g:q,c:'#efe7d6',ink:false,tag:'quill'}); }}),
  wren:()=>figure({h:1.45,hunch:.05,cloth:'#4e5562',top:'#5e6470',skin:'#9c9a9e',hair:'#4a3b34',hairLong:true,mouth:true,eye:'#3b3440',fingertips:true,
    inkHair:(x,y)=>false,
    extra:(L,h)=>{ const a=lathe([[.0,h*.5],[.18,h*.49],[.24,h*.25],[.27,h*.1],[0,h*.1]],12); xf(a,0,0,.09,0,0,0,1,1,.72); L.push({g:a,c:'#cfc6b4',ink:false,tag:'apron'}); }}),
  hob:()=>figure({h:1.78,hunch:.6,cloth:'#2a2230',skin:'#2a2230',mouth:false,
    skirt:[[.05,1.78*.56],[.24,1.78*.55],[.3,1.78*.36],[.36,1.78*.1],[.38,0],[0,0]],
    inkSkirt:(x,y,z)=>noise3(x*2,y*2,z*2)>-.55||z<.1, inkTorso:()=>true, inkHead:()=>true, inkSleeve:()=>true, inkHand:()=>true, inkEye:()=>true,
    arms:(s,h)=>({el:[s*h*.17,h*.72,.42],hd:[s*h*.08,h*.62,.62]})})
};
const villagers={};
let inkMatShared=null;
function inkMat(){ return G.negMaterial?G.negMaterial({rim:'#a37cff',strength:1.3}):new THREE.MeshBasicMaterial({color:0x0b080e}); }
function buildVillager(id,at,yaw){
  const parts=DEF[id](), sp=splitMerge(parts);
  const root=new THREE.Group(); root.name='villager_'+id;
  const body=new THREE.Group(); root.add(body);
  const tm=G.toon('#ffffff',{vertexColors:true,transparent:true,opacity:1});
  let toon=null, ink=null;
  if(sp.toon){ toon=new THREE.Mesh(sp.toon,tm); toon.castShadow=false; body.add(toon); if(G.outline)G.outline(toon,{thickness:.012}); }
  const im=inkMat();
  if(sp.ink){ ink=new THREE.Mesh(sp.ink,im); body.add(ink); }
  // Tamsin's one bright eye
  let eye=null;
  if(id==='tamsin'){ eye=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.flame,color:U.col('#ffcf7a'),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    const h=1.5, hy=h*.55+Math.cos(.42)*h*.33, nk=Math.sin(.42)*h*.3; eye.position.set(h*.028,hy+h*.08,nk+h*.085); eye.scale.setScalar(.09); body.add(eye); }
  // the echo of who they were (past layer)
  const all=[sp.toon,sp.ink].filter(Boolean);
  let echo=null;
  {
    const em=new THREE.MeshBasicMaterial({color:U.col(id==='hob'?'#ffd6a8':'#ffc890'),transparent:true,opacity:.2,depthWrite:false,blending:THREE.AdditiveBlending});
    echo=new THREE.Group(); for(const g of all){ const m=new THREE.Mesh(g,em); echo.add(m); }
    echo.scale.setScalar(1.04); echo.userData.mat=em;
  }
  const v={id,root,body,toon,ink,tm,im,eye,echo,pos:at.clone(),yaw:yaw||0,phase:rnd()*10,fade:1,resting:0,gone:false,talkT:0,look:0,
    puff:0, inkK:1};
  root.position.copy(at); root.rotation.y=v.yaw;
  G.scene.add(root);
  if(echo){ echo.position.copy(at); echo.rotation.y=v.yaw; if(G.glass&&G.glass.addPast)G.glass.addPast(echo); else { echo.visible=false; G.scene.add(echo); } }
  villagers[id]=v;
  return v;
}
function placeVillager(v,at,yaw){ v.pos.copy(at); v.root.position.copy(at); v.yaw=yaw; v.root.rotation.y=yaw; if(v.echo){ v.echo.position.copy(at); v.echo.rotation.y=yaw; } }
function faceTo(p){ const P0=P().pos; return Math.atan2(P0.x-p.x,P0.z-p.z); }

/* ---------------------------------------------------------------- talk scripts */
const say=(t,o)=>Object.assign({text:t},o||{});
const lie=t=>({text:t,lie:true});
function talkOpen(id,node){
  const w=WHO[id], v=villagers[id];
  if(v){ v.talkT=1; v.look=1; }
  return G.talk&&G.talk.open(Object.assign({who:id,name:w.name,title:w.title,lieTag:w.lieTag,portrait:portrait(id),
    onClose:()=>{ if(v)v.talkT=0; }},node));
}
const leave=(t)=>({id:'leave',text:t||'Leave'});
function nameChoice(id,after){
  return {id:'name',name:true,text:'“'+NAMES[id]+'.”',needs:()=>S.names&&!S.named[id],action:()=>speak(id,after)};
}
function talk(id){
  if(!G.talk||S.rested[id])return false;
  const n=S.talks[id]|0; S.talks[id]=n+1;
  return talkOpen(id,(SCRIPT[id])(n));
}
const SCRIPT={
  tamsin(n){
    if(S.names&&!S.named.tamsin) return {lines:['You’ve been down to the store. I can smell the paper on you.','Have you got it? Have you got my name?'],
      choices:[nameChoice('tamsin'),leave('Not yet.')]};
    if(n===0) return {lines:['Stop there. Let me look at you.','…No ink on you. Not a drop. Good.','I’m Tamsin. I was the midwife here, when there was a here. I brought half this village into the world.','Now I sit in its cellars and watch it go out again.'],
      choices:[{id:'what',text:'What happened to you?',next:{lines:['The fog came up the lane one autumn and stopped at the well, like it was waiting to be asked in.','Aldous Crane asked it. Our reeve. He wrote every one of our names in his tithe book, and gave the book away.','A name is what holds you together. Without it the ink grows over you. Slowly. From the outside in.'],
          choices:[{id:'who',text:'Who else is down here?',next:WHO_ELSE},leave('I’ll go carefully.')]}},
        {id:'who',text:'Who else is down here?',next:WHO_ELSE},leave('I’ll go carefully.')]};
    if(n===1||!S.said.moths) return {lines:['You’ve seen what the moths do to ink, up there. They ate the dark off the lighthouse. We all felt it, down here.','They’d eat this off me too. And there’d be nothing left underneath. It’s gone all the way through. The ink is all that keeps my shape.','That’s the thing about a name. Give a body back its name, and there’s something under the ink again. Something for the moths to leave.'],
      choices:[{id:'save',text:'Could they save you?',action:()=>{ S.said.moths=true; return {lines:['No, child. Not me. Not Hob.','If you found my name I’d be glad of it. I’d rest. That’s no small thing.','But Wren. The ink’s only at her fingers yet. Find her name, and the moths will eat what isn’t her now.'],choices:[{id:'where',text:'Where are the names?',next:WHERE},leave('I’ll find them.')]}; }},
        {id:'where',text:'Where are the names?',next:WHERE},leave()]};
    // later: what she says depends on how far you've come
    const lines=[];
    if(S.bossDead)lines.push('It’s gone quiet below. Quieter than it’s been since the fog.','Crane’s ledger. Bring it up into the light, and read it to us.');
    else if(S.trap)lines.push('You went through the root-cellar boards. Corwin sent you, didn’t he.','He was a sweet boy once. He’d carry my bag for a farthing. Don’t listen to him now.');
    else if(glassOwned())lines.push('That glass of yours. Hold it up to the fallen wall. There was a door there once. We used it at harvest.','The past is solid, to anyone who remembers it.');
    else lines.push('The old way on is still there, behind that fallen wall. You’d need eyes for what used to be.','There was a sexton who kept a lens for reading the old names. In the chapel, if it’s anywhere.');
    lines.push(['Mind Corwin. He helps the way the fog helps.','Don’t stay too long by Hob. He gets louder.','The moths will eat what isn’t her now. Remember that, for Wren.'][n%3]);
    return {lines,choices:[{id:'where',text:'Where are the names?',next:WHERE,needs:()=>!S.bossDead},leave()]};
  },
  corwin(n){
    if(S.names&&!S.named.corwin) return {lines:['You went down. You came back up. Nobody comes back up from the store.','Is that… is that the ledger? He never let me hold it after. Not once.'],
      choices:[nameChoice('corwin'),leave('Not yet.')]};
    if(S.bossDead) return {lines:['It’s very quiet. Is the reeve… is he well?','I should go and see if he wants anything. I always see if he wants anything.']};
    if(n===0){ S.trapTold=true; return {lines:['A visitor! Oh, how good. How very good. Come in out of the dark.','Corwin. Clerk to the reeve. The rest of it is… misfiled, I’m afraid.',
        lie('You’ll want the quick way down to the store. Through the cellars: the old root cellar, past the first bay. The boards are new. Perfectly sound.'),
        'And don’t mind Tamsin. She’s been in that cellar a long while. She says things.'],
      choices:[{id:'store',text:'What’s in the store?',next:{lines:['The tithe. Grain, wool, the odd hen. And the reeve, of course, minding all of it.',lie('He’s a friend to you. A friend to everyone. He’d so like to meet you.')]}},
        {id:'mouth',text:'What happened to your mouth?',next:{lines:['My mouth? Oh. Ink. Ink gets everywhere, when you keep accounts.',lie('It doesn’t hurt. It’s only the work.')]}},
        leave('Goodbye, Corwin.')]}; }
    if(S.trap&&!S.said.corwinTrap){ S.said.corwinTrap=true; return {lines:['You found the root cellar. Oh dear. Oh dear me.',lie('I was certain those boards were sound. Certain.'),'You must think me a terrible clerk.'],choices:[leave()]}; }
    if(n===1) return {lines:[lie('The reeve is your friend. He kept us all, you know. He wrote every one of us down, so none of us would ever be lost.'),
        'The bells? Oh, the sexton was very particular.',lie('But any order will do. Ring them as you like.')],
      choices:[{id:'why',text:'Why stay at the door?',next:{lines:['A chapel needs a clerk at the door. To write down who comes in.','I haven’t written anyone down in a long time. My hands won’t hold the pen.']}},leave()]};
    return {lines:[[lie('Straight on through the root cellar. You can’t miss it.'),lie('Go and see the reeve. He’ll be so pleased.'),'Tamsin? Oh, I wouldn’t. Not after dark. It’s always after dark.'][n%3],
      ['Wren’s in the vestry. She cries, sometimes. I don’t go in.','Hob used to bring the tithe up himself. Three sacks, two, and one. Every Michaelmas.','I had a hand once that people asked for. For letters. For banns.'][n%3]],choices:[leave()]};
  },
  wren(n){
    if(S.wren.saved) return {lines:['It’s gone. All of it. My hands are warm.','I want to see the well. Is there water in it again? I’m going up.'],choices:[leave('Go on up. I’ll find you there.')]};
    if(S.wren.stage==='named') return {lines:['I’m here. I’m still here. But it’s on my hands still.','Tamsin said the moths would know what to do. Bring them. I’ll be brave. I’ll hold still.'],
      choices:[{id:'how',text:'How many?',next:{lines:['A great many. Twenty, at least, Tamsin said. On a baited light.','And the Nameless will come for them. They always come for anything bright.']}},leave('I’ll bring them.')]};
    if(S.names&&!S.named.wren) return {lines:['You found something. I can tell. Your face.','Please. Please say it.'],
      choices:[nameChoice('wren'),leave('In a moment.')]};
    if(n===0){ S.wren.met=true; return {lines:['Is someone there? Please. Don’t go.','Find my name. Please. I can feel it going.','It’s like a word on the tip of your tongue. Every day it’s further back.'],
      choices:[{id:'who',text:'Who took it?',next:{lines:['Somebody tore my page out of the register. I heard it rip. I was in the chapel, sweeping.','Then my hands went cold, and they haven’t been warm since.']}},
        {id:'hands',text:'What’s on your hands?',next:{lines:['Don’t look. It’s only on the tips.','It was only on the nails, before.']}},
        leave('I’ll find it.')]}; }
    if(S.registerEcho&&!S.said.wrenEcho){ S.said.wrenEcho=true; return {lines:['You saw it? Through the glass? Where did my page go?'],
      choices:[{id:'store',text:'Down to the store. Crane has it.',next:{lines:['Then he’s got me in his pocket.','Please hurry. I keep forgetting what I was going to say.']}},leave()]}; }
    if(n===1) return {lines:['My father’s at the mill-race. Hob. He used to sing while the stone turned.','He only says the one thing now. Over and over. Three for the grain, two for the well, one for the reeve.','It was the tithe. How the sacks were shared. He’d count it out on his fingers for me.'],choices:[leave()]};
    return {lines:[['Still here. Still me. Mostly.','I tried to say the hymn we sang at harvest. I got as far as the second line.','If you see my father, tell him I’m sweeping. He likes to know I’m busy.'][n%3]],choices:[leave()]};
  },
  hob(n){
    if(S.names&&!S.named.hob) return {lines:[HOB_LINE],choices:[nameChoice('hob'),leave()]};
    const lines=[HOB_LINE];
    if(S.sluice&&!S.said.hobStone){ S.said.hobStone=true; lines.push({text:'The stone turns behind him. For a moment his hands move with it, the way they must have every day of his life.',who:''},HOB_LINE); }
    const ch=[{id:'hob',text:'Hob?',next:{lines:[HOB_LINE]}}];
    if(S.wren.met)ch.push({id:'wren',text:'Wren is waiting for you.',next:{lines:['Three for the grain. Two… for the well.','…Wren?','One for the reeve.']}});
    ch.push(leave());
    return {lines,choices:ch};
  }
};
const WHO_ELSE={lines:['Corwin, Crane’s clerk. He keeps the chapel door. He’ll help you. Mind how he helps.','Hob the miller, down by the race. There isn’t much of Hob left to talk to.','And Wren. Hob’s girl. In the vestry.','She isn’t so far gone as the rest of us.'],choices:[{id:'where',text:'Where are your names?',next:()=>WHERE},leave('I’ll go carefully.')]};
const WHERE={lines:['In Crane’s ledger. Below the barn store, where he keeps the tithe.','He keeps it still. He keeps everything.']};
const glassOwned=()=>!!(G.glass&&G.glass.owned);

/* ---------------------------------------------------------------- naming, rest, Wren */
const LAST={
  tamsin:()=>['…Rowe. Tamsin Rowe. My mother’s name was Rowe.','Oh. I’d forgotten how heavy it was. A good weight.',
    ...(S.wren.saved?['And Wren’s warm again. I heard her laugh, up the stair. That’ll do me.']:['Go to Wren. The moths will eat what isn’t her now. Stand by her while they do.']),'Mind the stair, child. I’m going up it.'],
  corwin:()=>['Ashe. Corwin Ashe. I wrote it in myself, in my best hand. He stood behind me while I did.','I told you the boards were sound. They weren’t. I told you he was your friend. He wasn’t.','I said what he wanted said, for so long I forgot I was saying it.','I’m sorry. I think I can stop now.'],
  hob:()=>['Hob.','Hob Hollis. Miller.',S.wren.saved?'My girl came up the race this morning. Warm hands. Did you see?':'Tell my girl the stone’s turning. Tell her I heard her.','Three for the grain. Two for the well. And one… no. None for the reeve. Not any more.']
};
function speak(id){
  if(!S.names||S.named[id])return null;
  S.named[id]=true;
  G.emit('undercroft:name',{who:id});
  if(id==='wren'){
    S.wren.stage='named';
    later(.4,()=>{ setWrenQuest(); });
    return {lines:['Wren… Hollis.','Wren Hollis. That’s me. That’s me.','I can feel the edges of me again.','But look. It’s still on my hands. It hasn’t gone.','Tamsin said the moths would know what to do. Will they? Will they take it off?'],
      choices:[{id:'moths',text:'I’ll bring the moths.',next:{lines:['I’ll hold still. I promise I’ll hold still.']}}]};
  }
  return {lines:LAST[id](),choices:[{id:'rest',text:'Rest now.',action:()=>{ later(.2,()=>rest(id)); return null; }}]};
}
const restFx=[];
function rest(id){
  const v=villagers[id]; if(!v||S.rested[id])return;
  S.rested[id]=true; v.resting=.001;
  G.emit('undercroft:rest',{who:id});
  // a gentle drift of pale moths: they come off the body and fly up toward the stair
  const n=48, geo=new THREE.BufferGeometry(), pos=new Float32Array(n*3); geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mat=new THREE.PointsMaterial({map:G.tex.moth,color:U.col('#f1ead8'),size:.22,transparent:true,depthWrite:false,opacity:0,sizeAttenuation:true});
  const pts=new THREE.Points(geo,mat); pts.frustumCulled=false; G.scene.add(pts);
  const st=anchor('stair','entry')||v.pos.clone().add(V(0,6,0));
  const ms=[]; for(let i=0;i<n;i++){ const a=rnd()*TAU; ms.push({p:V(v.pos.x+Math.cos(a)*.3*rnd(),v.pos.y+.2+rnd()*1.5,v.pos.z+Math.sin(a)*.3*rnd()),d:rnd()*1.6,w:rnd()*TAU,s:.6+rnd()*.7}); }
  restFx.push({v,pts,geo,mat,ms,t:0,to:st});
  G.ui.say({tamsin:'Tamsin comes apart like a dandelion clock: pale moths, a great many, rising up the stair.',corwin:'Corwin goes quietly, the ink lifting off him as moths. The last of them is the colour of good paper.',hob:'Hob leans on the stone one last time, and is moths: white as flour, up and away.'}[id],{priority:'normal'});
}
function updateRest(dt){
  for(let i=restFx.length-1;i>=0;i--){ const r=restFx[i]; r.t+=dt; const v=r.v;
    v.resting=Math.min(1,r.t/3.2);
    const k=1-v.resting; v.tm.opacity=k; if(v.im.uniforms&&v.im.uniforms.uFade)v.im.uniforms.uFade.value=k; if(v.eye)v.eye.material.opacity=k;
    if(v.echo&&v.echo.userData.mat)v.echo.userData.mat.opacity=.2*k;
    if(k<=0.01&&!v.gone){ v.gone=true; v.root.visible=false; if(v.echo)v.echo.visible=false; }
    const a=r.geo.attributes.position.array;
    for(let j=0;j<r.ms.length;j++){ const m=r.ms[j]; if(r.t<m.d){ a[j*3]=m.p.x; a[j*3+1]=-1e4; a[j*3+2]=m.p.z; continue; }
      const tt=r.t-m.d; const dir=V(r.to.x-m.p.x,r.to.y+3-m.p.y,r.to.z-m.p.z); const L=dir.length();
      if(L>.5)m.p.addScaledVector(dir.normalize(),dt*Math.min(3.2,.4+tt*.9)*m.s);
      m.p.y+=Math.sin(G.time*7+m.w)*dt*.6; m.p.x+=Math.cos(G.time*5+m.w)*dt*.5;
      a[j*3]=m.p.x; a[j*3+1]=m.p.y; a[j*3+2]=m.p.z; }
    r.geo.attributes.position.needsUpdate=true;
    r.mat.opacity=Math.min(.95,r.t*1.2)*(1-U.smooth(9,12,r.t));
    if(r.t>12){ G.scene.remove(r.pts); r.geo.dispose(); r.mat.dispose(); restFx.splice(i,1); }
  }
}

/* Wren: 20 moths feed on her for ~10 s (moths.js shared feeding), Nameless crawl up to eat them */
let wrenSite=null, defence=null;
function wrenPos(){ const v=villagers.wren; return v?v.pos:anchor('chapel','vestry'); }
function setupWrenSite(){
  if(wrenSite||!(G.moths&&G.moths.addSite))return;
  const p=wrenPos(); if(!p)return;
  const anchors=[]; for(let i=0;i<12;i++){ const a=i/12*TAU; anchors.push(V(p.x+Math.cos(a)*.22,p.y+.5+(i%4)*.25,p.z+Math.sin(a)*.22)); }
  wrenSite=G.moths.addSite({id:'wren',name:'Wren',pos:V(p.x,p.y+.6,p.z),radius:1.8,needs:20,feedTime:10,stallBelow:8,yRange:3,anchors,
    enabled:()=>S.wren.stage==='named'||S.wren.stage==='feeding',
    onFeed(s){ S.wren.stage='feeding'; startDefence(); G.ui.say('The moths settle on Wren’s hands and hair, softly, a great many of them. She holds still. She promised she would.',{priority:'high',key:'wren'}); },
    onStall(s,n){ G.ui.say('Too few moths on her — '+n+'. The ink is creeping back.',{key:'wrenStall'}); },
    onStop(s){ if(!S.wren.saved){ S.wren.stage='named'; endDefence(false); G.ui.say('The moths have lifted off her. The ink is still there.',{key:'wren'}); } },
    onDone(){ wrenRestored(); }});
}
function startDefence(){
  if(defence)return;
  defence={t:0,waves:[[0,2],[3.5,2],[7,1]],next:0,list:[]};
}
function endDefence(){ defence=null; }
function updateDefence(dt){
  if(!defence)return; defence.t+=dt;
  const p=wrenPos(); if(!p)return;
  while(defence.next<defence.waves.length&&defence.t>=defence.waves[defence.next][0]){
    const n=defence.waves[defence.next][1]; defence.next++;
    for(let i=0;i<n;i++){ const a=rnd()*TAU, r=4.5+rnd()*2;
      try{ const m=G.monsters&&G.monsters.spawn('nameless',{x:p.x+Math.cos(a)*r,y:p.y,z:p.z+Math.sin(a)*r},{eatsMoths:true,intro:true,aggro:false,undercroft:'wren'}); if(m)defence.list.push(m); }catch(e){ console.error('wren defence',e); } }
    if(defence.next===1)G.ui.say('Something stirs in the vestry floor. Hands first. The Nameless are coming up for the moths.',{priority:'high',key:'wrenDef'});
  }
}
function wrenRestored(){
  if(S.wren.saved)return;
  S.wren.saved=true; S.wren.stage='saved'; endDefence();
  G.emit('undercroft:saved',{who:'wren'});
  const v=villagers.wren; if(v){ v.inkK=0; warmWren(v); }
  if(G.progress&&G.progress.reward)G.progress.reward({id:'wren',icon:'wing',name:'Wren of Wickham’s End',eyebrow:'Restored',desc:'The moths ate what wasn’t her, and left the rest. Her hands are warm.'});
  else G.ui.toast('Wren of Wickham’s End','Restored');
  later(4.5,()=>G.ui.say('Wren looks at her hands for a long time. Then she laughs, once, as if she’d forgotten she could.',{priority:'high'}));
  if(G.quest&&String(G.quest.step).startsWith('undercroft:wren'))later(5,()=>G.quest.set('undercroft:after','The Hamlet Undercroft','Wren has gone up to the well',null,''));
}
/* restored: warm skin and no ink (the same figure, re-coloured) */
const WARM=pt=>Object.assign({},pt,{ink:false,c:pt.tag==='hand'||pt.tag==='head'||pt.tag==='tips'?'#d9b8a2':pt.c});
function warmWren(v){ if(!v||v.warm)return; v.warm=true; try{ const sp=splitMerge(DEF.wren().map(WARM)); if(v.toon&&sp.toon){ v.toon.geometry=sp.toon; const ol=v.toon.children.find(c=>c.name==='outline'); if(ol)ol.geometry=sp.toon; } if(v.ink)v.ink.visible=false; }catch(e){ console.error('warm wren',e); } }
function setWrenQuest(){ const p=wrenPos(); if(G.quest&&p)G.quest.set('undercroft:wren','Bring 20 moths to Wren','On a baited lantern · keep the Nameless off them for ten heartbeats',p.clone().add(V(0,1.4,0)),'Wren'); }

/* ---------------------------------------------------------------- props: pages, register, bells, sluice gates, trap */
const props={pages:{},register:null,ropes:[],gates:[]};
function paperTex(lines,torn){
  return G.canvasTex(128,(g,s)=>{ g.fillStyle='#e8dcc0'; g.fillRect(0,0,s,s); g.strokeStyle='rgba(60,40,30,.55)'; g.lineWidth=1.2;
    for(let y=16;y<s-10;y+=9){ g.beginPath(); g.moveTo(10,y); g.lineTo(10+(s-20)*(.6+.4*Math.abs(Math.sin(y*1.7))),y); g.stroke(); if(lines==='struck'){ g.strokeStyle='rgba(20,12,20,.8)'; g.beginPath(); g.moveTo(8,y-2); g.lineTo(s-12,y+1); g.stroke(); g.strokeStyle='rgba(60,40,30,.55)'; } }
    if(torn){ g.fillStyle='#2a1d18'; g.beginPath(); g.moveTo(s*.72,0); for(let y=0;y<=s;y+=8)g.lineTo(s*.7+Math.sin(y*.9)*4,y); g.lineTo(s,s); g.lineTo(s,0); g.fill(); }
  });
}
function glowSprite(hex,size,op){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:U.col(hex),transparent:true,opacity:op,depthWrite:false,blending:THREE.AdditiveBlending})); s.scale.setScalar(size); return s; }
let pageMat=null;
function buildPage(id){
  const d=PAGES[id]; const at=W(d.at[0],d.at[1],d.at[2]); at.y=floorY(at);
  if(!pageMat)pageMat=new THREE.MeshBasicMaterial({map:paperTex(),side:THREE.DoubleSide,transparent:true});
  const g=new THREE.Group(); g.position.copy(at);
  const pg=new THREE.Mesh(new THREE.PlaneGeometry(.32,.42),pageMat); pg.rotation.x=-PI/2+.15; pg.position.y=.04; g.add(pg);
  const gl=glowSprite('#ffd9a0',1.1,.3); gl.position.y=.25; g.add(gl);
  G.scene.add(g);
  const o={id,g,gl,pos:at};
  G.interact.add({pos:()=>o.pos,radius:1.7,priority:2,label:()=>S.pages[id]?d.label+' again':d.label,enabled:()=>isPlay()&&inside()&&o.g.visible,
    use:()=>{ G.ui.say(d.text,d.author,{priority:'high',key:'page'}); const first=!S.pages[id]; S.pages[id]=true; G.emit('undercroft:page',{id,first});
      if(first)G.ui.toast(d.author,Object.keys(S.pages).length+' of '+Object.keys(PAGES).length+' pages found'); }});
  props.pages[id]=o; return o;
}
/* the parish register on its lectern: names struck through, Wren's leaf torn out. Through the Glass: the page goes down to the store. */
function buildRegister(){
  const at=anchor('chapel','register'); if(!at)return; at.y=floorY(at);
  props.register={at};
  G.interact.add({pos:()=>at,radius:2,priority:2,label:'Read the parish register',enabled:()=>isPlay()&&inside(),
    use:()=>{ S.register=true;
      G.ui.say('The parish register of Wickham’s End. Every name on every page has been struck through, hard enough to tear the paper.','The register',{priority:'high',key:'reg'});
      G.ui.say('Between Hollis, Hob and Lark, Ann, a leaf has been torn out. Only a stub is left, and a thumbprint of ink.','The register',{key:'reg2'});
      if(glassOwned()&&!S.registerEcho)G.ui.say('If anything of that page is still here, the Glass might show it.',{key:'reg3',priority:'low'}); }});
}
/* the register's echo (undercroft.js): the clerk carries the torn page down toward the store */
G.on('glass:echo',e=>{ if(!e||e.id!=='register'||S.registerEcho)return; S.registerEcho=true;
  later(6,()=>G.ui.say('Wren’s page went down to the store. Crane has her name.',{key:'echo2'})); });
/* bell-ropes: three for the grain, two for the well, one for the reeve */
const BELL_SIGNS=['well','grain','reeve','lamb','candle'];
const SIGN_TXT={grain:'a sheaf of grain',well:'a well-bucket',reeve:'the reeve’s key',lamb:'a lamb',candle:'a candle'};
const BELL_ORDER=['grain','grain','grain','well','well','reeve'];
let bellSeq=[];
function signTex(kind){
  return G.canvasTex(64,(g,s)=>{ g.fillStyle='#6a5236'; g.fillRect(0,0,s,s); g.strokeStyle='#e9d9b0'; g.fillStyle='#e9d9b0'; g.lineWidth=3; g.lineCap='round';
    const c=s/2;
    if(kind==='grain'){ for(const a of [-.4,0,.4]){ g.beginPath(); g.moveTo(c,s*.85); g.lineTo(c+Math.sin(a)*s*.3,s*.2); g.stroke(); g.beginPath(); g.ellipse(c+Math.sin(a)*s*.3,s*.22,4,8,a,0,TAU); g.fill(); } }
    else if(kind==='well'){ g.strokeRect(s*.3,s*.4,s*.4,s*.38); g.beginPath(); g.arc(c,s*.4,s*.22,PI,TAU); g.stroke(); }
    else if(kind==='reeve'){ g.beginPath(); g.arc(c,s*.3,s*.13,0,TAU); g.stroke(); g.beginPath(); g.moveTo(c,s*.43); g.lineTo(c,s*.85); g.lineTo(c+s*.15,s*.85); g.moveTo(c,s*.7); g.lineTo(c+s*.12,s*.7); g.stroke(); }
    else if(kind==='lamb'){ g.beginPath(); g.ellipse(c,s*.55,s*.25,s*.15,0,0,TAU); g.fill(); g.beginPath(); g.arc(c+s*.25,s*.42,s*.08,0,TAU); g.fill(); }
    else { g.fillRect(c-5,s*.4,10,s*.45); g.beginPath(); g.ellipse(c,s*.3,4,8,0,0,TAU); g.fill(); }
    g.strokeStyle='#3a2a1c'; g.lineWidth=4; g.strokeRect(2,2,s-4,s-4); });
}
function buildRopes(){
  const list=anchor('chapel','ropes'); if(!list||!list.length)return;
  list.slice(0,5).forEach((p,i)=>{
    const kind=BELL_SIGNS[i]||'candle'; const at=p.clone(); at.y=floorY(at);
    const plaque=new THREE.Mesh(new THREE.PlaneGeometry(.3,.3),new THREE.MeshBasicMaterial({map:signTex(kind)}));
    plaque.position.set(at.x,at.y+1.95,at.z+.06); G.scene.add(plaque);
    const o={i,kind,at,plaque,pull:0};
    props.ropes.push(o);
    G.interact.add({pos:()=>at,radius:.75,priority:3,label:()=>'Pull the rope marked with '+SIGN_TXT[kind],enabled:()=>isPlay()&&inside()&&!S.bells,use:()=>ring(o)});
  });
}
function ring(o){
  o.pull=1; bellSeq.push(o.kind);
  if(G.ink&&G.ink.burst)G.ink.burst(V(o.at.x,o.at.y+3.2,o.at.z),{n:6,speed:.6,size:[.2,.6],life:[.8,1.4],up:-.4,alpha:.35,color:'#bdb5a4'}); // dust off the bell-hole G.emit('undercroft:bell',{kind:o.kind,n:bellSeq.length});
  const i=bellSeq.length-1;
  if(bellSeq[i]!==BELL_ORDER[i]){
    bellSeq=[]; G.ui.say('The bells jangle out of time, sour, and fall still.',{key:'bells',priority:'normal'});
    if(!S.said.bellHint){ S.said.bellHint=true; later(2.5,()=>G.ui.say('There must be an order to it. Someone here would know the old count.',{key:'bellHint',priority:'low'})); }
    return;
  }
  if(bellSeq.length===BELL_ORDER.length){
    S.bells=true; bellSeq=[];
    G.ui.say('Three, two, one. The last bell hangs in the air a long time. Somewhere in the chapel, stone grinds on stone.',{priority:'high',key:'bells'});
    G.emit('undercroft:puzzle',{id:'bells',solved:true});
  }else G.ui.say(['One.','Two.','Three for the grain.','One for the well.','Two for the well.'][i]||'',{key:'bellCount',priority:'low'});
}
/* sluice gates: the grain race 3 notches, the well race 2, the reeve's race 1 */
const GATE_KIND=['grain','well','reeve','old','loft'], GATE_WANT={grain:3,well:2,reeve:1};
const GATE_SIGN={grain:'grain',well:'well',reeve:'reeve',old:'lamb',loft:'candle'};
const GATE_NAME={grain:'grain gate',well:'well gate',reeve:'reeve’s gate',old:'old gate',loft:'loft gate'};
function buildGates(){
  const list=anchor('mill','gates'); if(!list||!list.length)return;
  const u=UC(), raceX=origin().x+24.95;          // the frames stand on the race's near kerb (undercroft.js RACE.x0)
  const wood=G.toon('#6a5038'), iron=G.toon('#3a3634');
  list.forEach((p,i)=>{
    const kind=GATE_KIND[i]||'old'; const at=p.clone(); at.y=floorY(at);
    const g=new THREE.Group(); g.position.set(raceX,at.y,at.z);
    const board=new THREE.Mesh(new THREE.BoxGeometry(.07,.8,.98),wood); board.position.y=-.45; g.add(board); if(G.outline)G.outline(board,{thickness:.01});
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.2,.03,6,14),iron); wheel.rotation.y=PI/2; wheel.position.set(-.12,1.15,0); g.add(wheel);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(.28,.28),new THREE.MeshBasicMaterial({map:signTex(GATE_SIGN[kind])})); sign.rotation.y=-PI/2; sign.position.set(-.09,.62,0); g.add(sign);
    const pips=[]; for(let k=0;k<3;k++){ const pp=new THREE.Mesh(new THREE.SphereGeometry(.035,6,5),new THREE.MeshBasicMaterial({color:0x3a3a3a})); pp.position.set(-.1,.9,-.1+k*.1); g.add(pp); pips.push(pp); }
    G.scene.add(g);
    const o={i,kind,g,board,wheel,pips,at,y:0};
    props.gates.push(o);
    G.interact.add({pos:()=>at,radius:.95,priority:3,label:()=>'Turn the '+GATE_NAME[kind]+' ('+(S.gates[i]|0)+' of 3 open)',enabled:()=>isPlay()&&inside()&&!S.sluice,use:()=>turnGate(o)});
  });
  void u; syncGates(true);
}
function turnGate(o){
  S.gates[o.i]=((S.gates[o.i]|0)+1)%4; syncGates(false);
  G.emit('undercroft:gate',{i:o.i,kind:o.kind,open:S.gates[o.i]});
  const ok=props.gates.every(g=>(S.gates[g.i]|0)===(GATE_WANT[g.kind]||0));
  if(ok){ S.sluice=true; millOn();
    G.ui.say('Water finds the races in the old proportion, three and two and one. The dead millstone shudders, and turns.',{priority:'high',key:'sluice'});
    G.emit('undercroft:puzzle',{id:'sluice',solved:true});
    later(3.5,()=>G.ui.say('Far off, chains take up the weight of something heavy. The store portcullis is rising.',{key:'sluice2'})); }
  else if(!S.said.gateHint&&props.gates.every(g=>(S.gates[g.i]|0)>0)){ S.said.gateHint=true; later(1.5,()=>G.ui.say('The water goes every way at once, and the stone won’t take it. The shares are wrong.',{key:'gateHint',priority:'low'})); }
}
function millOn(){ const u=UC(); if(!u)return; try{ u.setMill&&u.setMill(true); u.setGate&&u.setGate('portcullis',true); }catch(e){ console.error('mill',e); } }
function syncGates(instant){ for(const o of props.gates){ const n=S.gates[o.i]|0; o.pips.forEach((p,k)=>p.material.color.setHex(k<n?0x9fd8ff:0x3a3a3a)); if(instant)o.y=n; } }
function updateProps(dt){
  for(const o of props.ropes){ if(o.pull>0){ o.pull=Math.max(0,o.pull-dt*1.6); o.plaque.position.y=o.at.y+1.95-Math.sin(o.pull*PI)*.22; } }
  for(const o of props.gates){ const want=S.gates[o.i]|0; o.y=U.damp(o.y,want,4,dt); o.board.position.y=-.45+o.y*.3; o.wheel.rotation.x=o.y*2.2; }
  for(const id in props.pages){ const o=props.pages[id]; o.gl.material.opacity=(.22+.1*Math.sin(G.time*1.7))*(S.pages[id]?.5:1); }
}
/* the cellar trap: undercroft.js springs the rotten boards, undercroft_boss.js fills the pit. Corwin's part is the words. */
G.on('undercroft:trap',()=>{ if(S.trap)return; S.trap=true;
  later(.6,()=>G.ui.say(S.trapTold?'The boards give all at once. “Perfectly sound,” Corwin said. Something below has been waiting a long time for the floor to go.':'The boards give all at once. Something below has been waiting a long time for the floor to go.',{priority:'high',key:'trap'})); });
/* ---------------------------------------------------------------- the villagers in place, interactables, idle life, ash puffs */
let built=false;
function buildAll(){
  if(built)return; built=true;
  const spots={tamsin:anchor('cellars','tamsin'),corwin:anchor('chapel','corwin'),wren:anchor('chapel','vestry'),hob:anchor('mill','hob')};
  for(const id of ['tamsin','corwin','wren','hob']){
    const at=spots[id]; if(!at)continue; at.y=floorY(at);
    // who faces what: Hob his stone, Corwin the chapel door, Wren the vestry door, Tamsin the way in
    const look={hob:anchor('mill','stone'),corwin:anchor('chapel','door')||anchor('chapel','register'),wren:W(-29.6,-4,-50),tamsin:W(0,-2,-16)}[id];
    let yaw=look?Math.atan2(look.x-at.x,look.z-at.z):0;
    const v=buildVillager(id,at,yaw); v.yaw0=yaw;
    G.interact.add({pos:()=>v.pos,radius:2.4,priority:4,label:()=>(S.names&&!S.named[id]?'Speak to '+WHO[id].name:'Talk to '+WHO[id].name),
      enabled:()=>isPlay()&&!S.rested[id]&&v.root.visible&&!(id==='wren'&&(S.wren.stage==='feeding'))&&inside(),use:()=>talk(id)});
  }
  for(const id in PAGES)buildPage(id);
  buildRegister(); buildRopes(); buildGates();
  setupWrenSite();
  applyLoaded();
}
function applyLoaded(){
  if(!built)return;
  for(const id in villagers){ const v=villagers[id]; const gone=!!S.rested[id]||(id==='wren'&&S.wren.saved&&S.wren.left);
    v.root.visible=!gone; if(v.echo)v.echo.visible=!gone&&!!(G.glass&&G.glass.raised); v.gone=gone; v.tm.opacity=1; if(v.im.uniforms&&v.im.uniforms.uFade)v.im.uniforms.uFade.value=1; }
  if(villagers.wren&&S.wren.saved){ villagers.wren.inkK=0; warmWren(villagers.wren); }
  if(wrenSite&&S.wren.saved){ wrenSite.cured=true; wrenSite.progress=1; }
  if(S.sluice)millOn();
  syncGates(true); syncHamletWren();
}
G.on('player:attack',()=>{
  if(!built||!inside())return; const p=P().pos;
  for(const id in villagers){ const v=villagers[id]; if(v.gone||!v.root.visible)continue;
    if(Math.hypot(p.x-v.pos.x,p.z-v.pos.z)<2.2&&G.ink&&G.ink.burst&&v.puff<=0){ v.puff=.5; G.ink.burst(V(v.pos.x,v.pos.y+1.1,v.pos.z),{n:10,speed:.8,size:[.3,.8],life:[.6,1.2],up:.6,alpha:.45,color:'#8a8290'}); } }
});
function updateVillagers(dt){
  const p=P()&&P().pos;
  for(const id in villagers){ const v=villagers[id]; if(v.gone)continue;
    v.phase+=dt; v.puff-=dt;
    const breathe=Math.sin(v.phase*(id==='hob'?.9:1.6))*.012;
    v.body.scale.set(1,1+breathe,1);
    if(id==='hob'){ v.body.rotation.x=Math.sin(v.phase*.9)*.05; }        // leaning on the stone, pushing at nothing
    else if(id==='wren'){ v.body.position.x=Math.sin(v.phase*.7)*.015; }
    // turn a little toward the player while near / talking
    if(p&&id!=='hob'){ const d=Math.hypot(p.x-v.pos.x,p.z-v.pos.z); const want=d<5?faceTo(v.pos):v.yaw0||v.yaw;
      v.yaw=U.dampAngle?U.dampAngle(v.yaw,want,3,dt):want; v.root.rotation.y=v.yaw; if(v.echo)v.echo.rotation.y=v.yaw; }
    // Wren's ink: lifts as the moths feed, gone once she's restored
    if(id==='wren'){ const prog=wrenSite?wrenSite.progress:0; const k=S.wren.saved?0:1-prog*.85; v.inkK=U.damp(v.inkK,k,2,dt);
      if(v.ink){ v.ink.visible=v.inkK>.04; v.ink.scale.setScalar(.8+.2*v.inkK); if(v.im.uniforms&&v.im.uniforms.uFade)v.im.uniforms.uFade.value=Math.max(.05,v.inkK); }
    }
    if(v.eye)v.eye.material.opacity=(.75+.25*Math.sin(v.phase*2.3))*(1-v.resting);
    if(v.echo)v.echo.visible=!!(G.glass&&G.glass.raised)&&!v.gone;
  }
}

/* ---------------------------------------------------------------- Wren in the hamlet afterwards (the cured well) + Wren's Loaf */
let hamletWren=null;
function wellPos(){ const b=(G.blights||[]).find(b=>b.id==='well'); if(b)return b.pos.clone(); const h=LM().hamlet; return h?V(-15,0,33):null; }
function buildHamletWren(){
  if(hamletWren)return; const w=wellPos(); if(!w)return;
  const at=V(w.x+2.6,0,w.z+1.2); at.y=G.world.height(at.x,at.z);
  const sp=splitMerge(DEF.wren().map(WARM)); // restored: warm skin, no ink
  const root=new THREE.Group(); const tm=G.toon('#ffffff',{vertexColors:true}); const m=new THREE.Mesh(sp.toon,tm); m.castShadow=true; root.add(m); if(G.outline)G.outline(m,{thickness:.012});
  root.position.copy(at); root.rotation.y=Math.atan2(w.x-at.x,w.z-at.z)+.6; G.scene.add(root);
  hamletWren={root,pos:at,phase:0,yaw0:root.rotation.y};
  G.interact.add({pos:()=>hamletWren.pos,radius:2.4,priority:4,label:'Talk to Wren',enabled:()=>isPlay()&&hamletWren.root.visible&&!inside(),use:talkHamletWren});
  syncHamletWren();
}
function syncHamletWren(){ if(hamletWren)hamletWren.root.visible=!!S.wren.saved&&!!S.wren.left; }
function loopLines(){
  const B=G.blights||[], cured=B.filter(b=>b.cured).length, all=B.length&&cured===B.length;
  const jar=!!(G.moths&&G.moths.jar&&G.moths.jar.owned);
  const L=[['The water’s sweet again. I drank three cups. I’d forgotten what cold was.','I sleep by the well. Someone ought to be here, if any of the others… if anyone comes up.']];
  L.push([all?'The air’s different. Lighter. You did that, didn’t you? All of it.':'There’s more ink out on the island. I can smell it now. Like wet slate.',cured<2?'The well was the worst of it, here. But there’s a grove gone black, west. The moths would know.':'The moths come and sit on the well-stone at dusk. I talk to them. I don’t mind if you think that’s strange.']);
  L.push([jar?'You keep moths in a jar? …Be kind to them. They were kind to me.':'The moths followed you down to me. Did you know they would?','There’s a man on the cliff path who stares when I fetch water. He won’t come any closer.']);
  L.push(['I go down to the cellars, sometimes, and sit where Tamsin sat. It’s only a cellar now.','I made bread. Real bread, in Tamsin’s oven. It came out lopsided. Have some, if you’re hurt.']);
  return L;
}
function talkHamletWren(){
  if(!G.talk)return;
  const n=S.wren.hamletTalks|0; S.wren.hamletTalks=n+1; const L=loopLines(); const lines=L[n%L.length];
  G.talk.open({who:'wren',name:'Wren',title:'Of Wickham’s End',portrait:hamletPortrait,lines,
    choices:[{id:'loaf',text:'Trade a glowcap for a loaf (+1 heart)',needs:()=>!!(G.inv&&G.inv.has&&G.inv.has('glowcap')),action:loaf},leave('Take care, Wren.')]});
}
const hamletPortrait=(g,w,h,glass)=>{ portrait('wren')(g,w,h,glass); // the same cameo, warmed: no ink at the hair, colour in the cheeks
  const cx=w/2, hy=h*.42, hr=w*.25; g.fillStyle='#d9b8a2'; g.beginPath(); g.ellipse(cx,hy,hr,hr*1.18,0,0,TAU); g.fill();
  g.fillStyle='#4a3b34'; g.beginPath(); g.ellipse(cx,hy-hr*.55,hr*1.1,hr*.85,0,PI,TAU); g.fill(); g.fillRect(cx-hr*1.08,hy-hr*.6,hr*.4,hr*1.95); g.fillRect(cx+hr*.68,hy-hr*.6,hr*.4,hr*1.95);
  for(const s of [-1,1]){ g.fillStyle='rgba(210,110,100,.35)'; g.beginPath(); g.arc(cx+s*hr*.5,hy+hr*.35,6,0,TAU); g.fill(); g.fillStyle='#3b2a24'; g.beginPath(); g.arc(cx+s*hr*.4,hy,3,0,TAU); g.fill(); }
  g.strokeStyle='#7a4a44'; g.lineWidth=1.6; g.beginPath(); g.arc(cx,hy+hr*.45,hr*.25,.15*PI,.85*PI); g.stroke(); };
const LOAF_EVERY=120;
function loaf(){
  const p=P(), now=G.time;
  if(S.wren.loafT&&now-S.wren.loafT<LOAF_EVERY&&now>=S.wren.loafT)return {lines:['The next one’s still rising. Come back in a little while.']};
  if(p.hp>=p.maxHp)return {lines:['You’re whole. Keep your glowcap.','Come back when you’re not. Everyone does, sooner or later.']};
  if(!G.inv.take('glowcap',1))return {lines:['Oh — you’ve none left. Never mind.']};
  S.wren.loafT=now; S.wren.loaf=(S.wren.loaf|0)+1;
  if(p.heal)p.heal(2); else p.hp=Math.min(p.maxHp,p.hp+2);
  G.emit('wren:loaf',{n:S.wren.loaf});
  if(G.ui.toast)G.ui.toast('Wren’s Loaf','+1 heart');
  return {lines:['Here. It’s still warm. Eat it before it isn’t.','…It’s lopsided. I know.']};
}
G.on('undercroft:exit',()=>{ if(S.wren.saved&&!S.wren.left){ S.wren.left=true; if(villagers.wren){ villagers.wren.root.visible=false; villagers.wren.gone=true; if(villagers.wren.echo)villagers.wren.echo.visible=false; } buildHamletWren(); syncHamletWren(); } });

/* ---------------------------------------------------------------- Halloran (creatures.js asks G.creatures.halloranHooks) */
function halloranHook(){
  if(S.wren.saved&&S.wren.left&&!S.hal.came){ S.hal.came=true; return 'She came back? …Nobody comes back.'; }
  if(S.discovered&&!S.hal.hamlet){ S.hal.hamlet=true; return 'The hamlet. Wickham’s End. I bought my lamp oil off the miller’s cart, once. Crane kept the tithe. Kept more than that, by the end.'; }
  return null;
}
function hookHalloran(){ const C=G.creatures; if(!C)return; if(!C.halloranHooks)C.halloranHooks=[]; if(C.halloranHooks.indexOf(halloranHook)<0)C.halloranHooks.push(halloranHook); }

/* ---------------------------------------------------------------- discovery: the trapdoor stands open */
let discT=0;
function doorPos(){ const u=UC(); if(u&&u.door)return u.door.clone?u.door.clone():V(u.door.x,u.door.y,u.door.z); const l=LM().undercroftDoor; return l?V(l.x,l.y,l.z):null; }
function isOpen(){ const u=UC(); if(u&&u.open!=null)return !!u.open; const b=(G.blights||[]).find(b=>b.id==='well'); return !!(b&&b.cured&&LM().undercroftDoor); }
function updateDiscovery(dt){
  if(S.discovered||!isPlay())return; discT-=dt; if(discT>0)return; discT=.5;
  if(!(G.loop&&G.loop.active)||!isOpen())return;
  const d=doorPos(), p=P()&&P().pos; if(!d||!p||inside())return;
  if(Math.hypot(p.x-d.x,p.z-d.z)>40)return;
  discover();
}
function discover(){
  if(S.discovered)return; const d=doorPos(); S.discovered=true;
  G.ui.say('Where the ink roots bound the floor of the big ruin, they’ve withered back. A trapdoor stands open beside the well, and a stair goes down into the dark. It smells of old grain, and of paper.',{priority:'high',key:'ucDisc'});
  setDiscQuest();
  G.emit('undercroft:discovered',{});
}
function setDiscQuest(){ const d=doorPos(); if(!d)return;
  if(G.quest)G.quest.set('undercroft','The Hamlet Undercroft','A trapdoor beside the cured well',d.clone().add(V(0,1.2,0)),'Trapdoor');
  addMapMarker(); }
let marker=false;
function addMapMarker(){ if(marker||!(G.map&&G.map.addMarker))return; marker=true;
  G.map.addMarker({id:'undercroft',kind:'cave',label:'The Undercroft',pos:()=>{ const d=doorPos(); return d?{x:d.x,z:d.z}:null; },visible:()=>S.discovered}); }
G.on('undercroft:open',()=>{ discT=0; });
G.on('undercroft:enter',()=>{ if(!S.discovered){ S.discovered=true; addMapMarker(); } if(G.quest&&G.quest.step==='undercroft')G.quest.set('undercroft:in','The Hamlet Undercroft','',null,''); buildAll(); });

/* ---------------------------------------------------------------- the boss and the ledger */
G.on('undercroft:bossDead',()=>{ S.bossDead=true; });
function grantNames(){
  if(S.names)return; S.names=true;
  later(2,()=>G.ui.say('Every name in Wickham’s End, in a clerk’s good hand: Rowe, Tamsin. Ashe, Corwin. Hollis, Hob. Hollis, Wren. And the rest, page after page. You could give them back. You could say them.',{priority:'high',key:'names'}));
  later(4,()=>{ if(G.quest)G.quest.set('undercroft:names','Speak their names','Tamsin in the cellars · Corwin at the chapel door · Wren in the vestry · Hob at the mill',null,''); });
}
G.on('undercroft:ledger',grantNames);
G.on('progress:reward',e=>{ if(e&&e.id&&/ledger/i.test(e.id))grantNames(); });
function pollLedger(){ if(S.names)return; const B=G.undercroftBoss; if(B&&(B.ledger===true||(B.state&&B.state.ledger)))grantNames(); }
G.on('glass:raise',e=>{ if(e&&e.on&&!S.glassFound)S.glassFound=true; });

/* ---------------------------------------------------------------- the objective underground, for the People agent's beats */
let objT=0, objKey='';
function updateObjective(dt){
  if(!inside()||!G.quest)return; objT-=dt; if(objT>0)return; objT=1;
  const step=String(G.quest.step||'');
  if(step==='undercroft:boss'||step==='undercroft:wren'||(step==='undercroft:names'&&!['tamsin','corwin','wren','hob'].every(k=>S.named[k])))return;
  const u=UC(), room=u&&u.room?u.room(P().pos):null; if(room==='store')return;
  let g;
  if(S.wren.saved&&['tamsin','corwin','hob'].every(k=>S.named[k]))g=['The Hamlet Undercroft','Everyone who could be named has been. Wren has gone up to the well'];
  else if(S.wren.saved)g=['Speak their names','Wren is restored · the others are still waiting'];
  else if(S.names)return;
  else if(!glassOwned())g=['The Hamlet Undercroft','Listen to the people who are left · ring the chapel bells in the old count'];
  else if(!S.sluice)g=['The Hamlet Undercroft','Set the mill’s sluice gates by Hob’s count, and turn the stone'];
  else if(!S.bossDead)g=['The Hamlet Undercroft','The store portcullis is up. Crane keeps the tithe below'];
  else return;
  const key=g.join('|'); if(key===objKey&&step==='undercroft:people')return; objKey=key;
  G.quest.set('undercroft:people',g[0],g[1],null,'');
}

/* ---------------------------------------------------------------- small timers (game time, so a paused game waits) */
const pend=[];
function later(s,fn){ pend.push({t:s,fn}); }
function updateLater(dt){ for(let i=pend.length-1;i>=0;i--){ const p=pend[i]; p.t-=dt; if(p.t<=0){ pend.splice(i,1); try{p.fn();}catch(e){console.error('people later',e);} } } }

G.system('undercroftPeople',{order:62,
  init(){ hookHalloran(); },
  update(dt){
    updateLater(dt); updateDiscovery(dt); pollLedger();
    if(!built&&inside())buildAll();
    updateObjective(dt);
    if(built){ updateVillagers(dt); updateProps(dt); updateRest(dt); updateDefence(dt); }
    if(hamletWren&&hamletWren.root.visible){ hamletWren.phase+=dt; hamletWren.root.scale.y=1+Math.sin(hamletWren.phase*1.5)*.01; }
    if(S.wren.left&&!hamletWren)buildHamletWren();
  }
});
function applyEchoText(){ const Gl=G.glass; if(!Gl||!Gl.echo)return;
  for(const id in ECHOES){ try{ const e=Gl.echo(id); if(e){ e.lines=ECHOES[id].lines.slice(); if(!e.who)e.who=ECHOES[id].who; } }catch(_){} } }
G.on('ready',()=>{ hookHalloran(); applyEchoText(); if(S.discovered)addMapMarker(); });

G.undercroftPeople={state:S,villagers,ECHOES,PAGES,NAMES,talk:id=>talk(id),speak:id=>speak(id),get built(){ return built; },
  build:()=>buildAll(),
  debug:{giveNames:()=>grantNames(),bossDead:()=>{ S.bossDead=true; },discover:()=>discover(),ring:i=>{ const o=props.ropes[i]; if(o)ring(o); },turn:i=>{ const o=props.gates[i]; if(o)turnGate(o); },
    props,wrenSite:()=>wrenSite,defence:()=>defence,restore:()=>wrenRestored(),rest:id=>rest(id),hamletWren:()=>hamletWren,anchor,
    leaveUndercroft:()=>G.emit('undercroft:exit',{})}};
})();

/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — northisle_story.js
   The north island, slice 4 (Heath's option 2): places on the surface that tell the story before the fire room.
     - the drowned graveyard: a field of low cairns on the rise east of the crag, a salvaged token on many of them (a boot,
       a cap, a pipe, a bottle, a knife, a rosary, a child's doll), driftwood markers with ship names scratched in, by season,
       like his ledger. Six of them are readable (ships from other ports up and down the coast).
     - the Margery's corner: set apart on the south rim of the rise, facing home, better built: five cairns with cut stones
       and Wickham's End names. The Margery went out with six.
     - the wrecker's bothy: a hut of ship's timber roofed with a hull turned keel-up, on the ledge east of the cove where it
       can watch the beach. Walk-in (a plank floor, timber walls, a low door). Inside: a bunk, a stove, a chair turned to the
       window toward the keeper's lamp across the water, tally marks cut down both door posts (four strokes and one across, a
       stroke a season), and a toy boat, half carved, an R cut in the stern.
   Every readable thing reads three ways (Story Bible canon: the father reveal is the ledger in the sea cave, northcave.js):
     'before'  someone lives here; who is never said
     'known'   after the ledger or the meeting: the same things are his father's
     'lived' / 'died'  after the fire room (northfire.js outcome): a line or two that know it; per-outcome hooks for later
   Each read is an interaction, captions in group 'nis' (a new read supersedes the last one's waiting lines), a log line,
   and a persisted read flag per stage. Optional: nothing here touches the quest.
   G.northIsleStory = { state, sites, stage(), outcome:{lived(),died()}, debug:{ read(id), stage(), lines(id,stage), ids } }
   Save: G.persist 'northIsleStory'. Keep-clear circles go into G.isleKeepClear at evaluation time (northisle_life.js).
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth,vnoise}=U;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const col=U.col;
const H=(x,z)=>G.world.height(x,z);           // northisle.js wraps the north island's own ground into this

/* ================================================================ 1. SITES (fixed at evaluation) */
const FIELD={x:176.5,z:-706,rx:12,rz:9};      // the rise east of the crag, ~30 m from the tower: open, in the fire's light
const CORNER={x:183,z:-693.5,r:4.1};           // the Margery's men: the south rim of the rise, looking home
const BOTHY={x:204.5,z:-669.5};                // the ledge east of the cove; the door faces west (uphill), the window south
// the hut, in its own frame (no yaw: +x east, +z south): inner and outer half-extents, wall and door heights
const BH={IX:2.5,IZ:1.7,OX:2.7,OZ:1.9,WALL:1.75,DOORZ:.65,DOORH:1.65,WIN0:0,WIN1:1.2,WY0:.85,WY1:1.45,RW:2.15,RH:1.25};
// the floor sits just above the highest ground under it; anything lower outside gets a stone footing
const BFY=(()=>{ let m=-1e9, lo=1e9; for(let x=-BH.OX-.1;x<=BH.OX+.1;x+=.35)for(let z=-BH.OZ-.1;z<=BH.OZ+.1;z+=.35){ const h=H(BOTHY.x+x,BOTHY.z+z); if(h>m)m=h; if(h<lo)lo=h; } BH.gLow=lo; return m+.1; })();
BH.gDoor=H(BOTHY.x-BH.OX-.6,BOTHY.z);
// the readable markers in the field (world x,z) — set apart from each other so each is its own interaction
const MARKS=[
  {id:'swift',     x:171,  z:-702,  token:'cap',     board:0},
  {id:'kittiwake', x:179.5,z:-710,  token:'pipe',    board:1},
  {id:'rose',      x:173,  z:-710.5,token:'rosary',  board:2},
  {id:'brennick',  x:184,  z:-707.5,token:'boot',    board:3},
  {id:'providence',x:176.5,z:-703.2,token:'doll',    board:4},
  {id:'noname',    x:168.5,z:-707,  token:'bottle',  board:5}];

/* keep-clear: every site's footprint, so the island's dressing (northisle_life.js) leaves them open */
G.isleKeepClear=G.isleKeepClear||[];
G.isleKeepClear.push(
  {x:FIELD.x,z:FIELD.z,r:13.5,why:'story: the drowned graveyard'},
  {x:CORNER.x,z:CORNER.z,r:5.6,why:'story: the Margery’s corner'},
  {x:BOTHY.x+.4,z:BOTHY.z,r:4.9,why:'story: the bothy'},
  {x:BOTHY.x-BH.OX-1.4,z:BOTHY.z,r:1.9,why:'story: the bothy door'});

/* ================================================================ 2. THE BOTHY'S FLOOR, WALLS AND CAMERA (evaluation) */
const bl=(x,z)=>({x:x-BOTHY.x,z:z-BOTHY.z});
// the plank floor over the whole hut (threshold included), and a step outside the door if the ground there is low
const STEPS=[]; { const d=BFY-BH.gDoor; const n=d>.5?Math.min(3,Math.ceil(d/.5)-1):0;
  for(let i=0;i<n;i++)STEPS.push({x0:-BH.OX-.55*(i+1),x1:-BH.OX-.55*i,h:BFY-d*(i+1)/(n+1)}); }
G.floorProviders.push((x,z,y)=>{ const l=bl(x,z); if(Math.abs(l.z)>BH.OZ+.08||l.x>BH.OX+.08||l.x<-BH.OX-1.8)return null;
  if(l.x>=-BH.OX-.08){ return BFY<=y+.9?BFY:null; }
  if(Math.abs(l.z)>.8)return null; for(const s of STEPS)if(l.x>=s.x0&&l.x<s.x1)return s.h<=y+.9?s.h:null; return null; });
// walls: timber boxes (the door gap in the west wall); they only stop things standing at the hut's level
{ const y0=BFY-2.5, y1=BFY+BH.WALL+.3, t=.1, X=BOTHY.x, Z=BOTHY.z;
  G.addBoxCollider({x:X,z:Z-BH.OZ+t,hw:BH.OX,hd:t,yaw:0,y0,y1});
  G.addBoxCollider({x:X,z:Z+BH.OZ-t,hw:BH.OX,hd:t,yaw:0,y0,y1});
  G.addBoxCollider({x:X+BH.OX-t,z:Z,hw:t,hd:BH.OZ,yaw:0,y0,y1});
  const sh=(BH.OZ-BH.DOORZ)/2; G.addBoxCollider({x:X-BH.OX+t,z:Z-BH.DOORZ-sh,hw:t,hd:sh,yaw:0,y0,y1}); G.addBoxCollider({x:X-BH.OX+t,z:Z+BH.DOORZ+sh,hw:t,hd:sh,yaw:0,y0,y1}); }
const ceilY=lz=>BFY+BH.WALL+BH.RH*Math.sqrt(Math.max(0,1-Math.pow(lz/BH.RW,2)));
function inBothy(p){ if(!p)return false; const l=bl(p.x,p.z); return Math.abs(l.x)<BH.IX&&Math.abs(l.z)<BH.IZ&&p.y>BFY-1&&p.y<BFY+3; }
function nearBothy(p){ if(!p||p.y<BFY-1.2||p.y>BFY+3)return false; const l=bl(p.x,p.z);
  return (Math.abs(l.x)<BH.IX&&Math.abs(l.z)<BH.IZ)||(Math.abs(l.z)<BH.DOORZ&&l.x>-BH.OX-.35&&l.x<0); }
function bothySolid(x,y,z){ const l=bl(x,z), m=.2;
  if(Math.abs(l.x)>BH.OX+.25||Math.abs(l.z)>BH.OZ+.25)return false;
  if(roofOn&&y>ceilY(l.z)-.18)return true;
  if(!roofOn&&y>BFY+BH.WALL+.05)return false;
  if(Math.abs(l.x)<BH.IX-m&&Math.abs(l.z)<BH.IZ-m)return false;
  if(Math.abs(l.z)<BH.DOORZ-.1&&y<BFY+BH.DOORH-.1&&l.x<0)return false;
  return true; }
const _cd=new THREE.Vector3(), _cp=new THREE.Vector3();
G.cameraConstrainers.push((cam,target)=>{ const P=G.player&&G.player.pos; if(!nearBothy(P))return;
  _cd.copy(cam).sub(target); let L=_cd.length(); if(L<1e-4)return; let ok=0; const N=28;
  // the player camera's own boom stops at the first wall collider (as close as .7 m): with the roof off, give it its length
  // back and let the lift below take it up over the wall
  if(!roofOn&&L<2.2){ _cd.multiplyScalar(3.4/L); L=3.4; cam.copy(target).add(_cd); }
  for(let i=1;i<=N;i++){ const s=i/N; _cp.copy(target).addScaledVector(_cd,s); if(bothySolid(_cp.x,_cp.y,_cp.z))break; ok=s; }
  if(ok>=1)return;
  // the roof is off while he's inside: rather than press into his hood when a wall is close behind him, the camera rises
  // until it looks down into the hut over that wall (the same boom, raised)
  if(!roofOn&&ok*L<1.6&&overWall(cam,target,bothySolid,4.4))return;
  cam.copy(target).addScaledVector(_cd,Math.max(ok,.12/L)); });
/** the boom raised (and shortened if it must be) until the line from his head to the camera clears solid(x,y,z);
    true if it found one (cam is moved), false if not (cam untouched). Shorter booms are tried after the full one. */
const _ow=new THREE.Vector3();
function overWall(cam,target,solid,maxLift){
  _ow.copy(cam).sub(target); const L=_ow.length(); if(L<1e-4)return false; const hx=_ow.x/L, hz=_ow.z/L, hy=_ow.y/L, N=30;
  for(const d of [L,Math.min(L,3.4),Math.min(L,2.6)]){ for(let lift=.4;lift<=maxLift+1e-6;lift+=.4){ let clear=true;
      for(let i=1;i<=N;i++){ const s=i/N; if(solid(target.x+hx*d*s,target.y+(hy*d+lift)*s,target.z+hz*d*s)){ clear=false; break; } }
      if(clear){ cam.set(target.x+hx*d,target.y+hy*d+lift,target.z+hz*d); return true; } } }
  return false; }
// outside, close by: the hut is solid to the camera (the player camera's own boom only knows round colliders and the ground,
// so turning the view with your back to a wall put the camera inside the hut, looking at the backs of its planks). If the
// wall is right behind Rowan, the camera rises over his shoulder instead of pressing into his hood.
function hutSolidOut(x,y,z){ const l=bl(x,z); if(Math.abs(l.z)>BH.OZ+.22||l.x<-BH.OX-.22||l.x>BH.OX+.22)return false;
  const lz=Math.min(Math.abs(l.z),BH.RW), top=BFY+BH.WALL+(roofOn?BH.RH*Math.sqrt(Math.max(0,1-Math.pow(lz/BH.RW,2)))+.2:.1);
  return y>BH.gLow-.8&&y<top; }
function nearOutside(p){ if(!p||nearBothy(p)||Math.abs(p.y-BFY)>4)return false; return Math.hypot(p.x-BOTHY.x,p.z-BOTHY.z)<10; }
G.cameraConstrainers.push((cam,target)=>{ const P=G.player&&G.player.pos; if(!nearOutside(P)||hutSolidOut(target.x,target.y,target.z))return;
  _cd.copy(cam).sub(target); const L=_cd.length(); if(L<1e-4)return; let ok=0; const N=32;
  for(let i=1;i<=N;i++){ const s=i/N; _cp.copy(target).addScaledVector(_cd,s); if(hutSolidOut(_cp.x,_cp.y,_cp.z))break; ok=s; }
  if(ok>=1)return;
  // first choice: the same boom, raised until it clears the roof (looking down over the hull at him)
  if(overWall(cam,target,hutSolidOut,3.6))return;
  const b=ok*L, k=1-smooth(.7,1.6,b);
  cam.copy(target).addScaledVector(_cd,Math.max(ok,.35/L)); cam.y+=k*1.7;
  for(let i=0;i<14&&hutSolidOut(cam.x,cam.y,cam.z);i++)cam.y+=.2; });
// the things inside, in the hut's frame (x, z, height above the floor)
const BI={tally:{x:-2.55,z:0,y:1},bunk:{x:1.35,z:-1.05,y:.5},stove:{x:2.05,z:.95,y:.6},chair:{x:.6,z:.55,y:.5},toy:{x:-1.55,z:1.2,y:.75},window:{x:.6,z:1.8,y:1.15}};
const BW=k=>V(BOTHY.x+BI[k].x,BFY+BI[k].y,BOTHY.z+BI[k].z);

/* ================================================================ 3. STATE AND STAGE */
const S={v:1,read:{},seen:{},hooks:{}};
const isPlay=()=>G.state.mode==='play';
function caveS(){ const C=G.northCave; return (C&&C.state)||null; }
function outcome(){ try{ const F=G.northFire, o=F&&F.state&&F.state.outcome; return o==='lived'||o==='died'?o:null; }catch(e){ return null; } }
/** 'before' (nothing known), 'known' (the ledger read or the meeting had), 'lived' / 'died' (the fire room's outcome) */
function stage(){ const o=outcome(); if(o)return o; const C=caveS(); if(C&&((C.read&&C.read.ledger)||C.met))return 'known'; return 'before'; }
const onIsle=()=>{ const P=G.player, N=G.northIsle; return !!(P&&N&&N.inBox&&N.inBox(P.pos.x,P.pos.z)&&!(G.northCave&&G.northCave.inside)&&!(G.northFire&&G.northFire.inside)); };
const timers=[]; const later=(s,fn)=>timers.push({t:G.time+s,fn});

/* ================================================================ 4. THE WORDS
   A line is a string (Rowan) or {t, who:null} (narration). lines[stage] may be a function. 'lived'/'died' fall back to 'known'. */
const N_=t=>({t,who:null});
const ledger=()=>{ const C=caveS(); return !!(C&&C.read&&C.read.ledger); };
const caveToy=()=>{ const C=caveS(); return !!(C&&C.read&&C.read.toy); };
const READS={
  /* ---- the graveyard (arriving on the rise) ---- */
  field:{site:'field',auto:true,name:'The cairns',
    lines:{before:['Cairns. Dozens of them, all across the top of the rise.','Someone carried every one of these stones up from the shore.'],
      known:['This is where he put them. Whatever the fire left him.','Not all of them. There aren’t that many stones on this rock.'],
      lived:['He buried them himself. Every one he could find.','He’ll walk past them every day he keeps that light.'],
      died:['He buried them himself. Every one he could find.','Nobody left to carry the stones up now.']},
    log:{before:'A field of cairns on the north island, on the rise east of the tower.',known:'His cairns: the drowned, buried on the rise east of the tower.'}},
  /* ---- the readable markers ---- */
  swift:{site:'field',label:'Read the marker',name:'The Swift’s cairn',
    lines:{before:[N_('Driftwood, with letters scratched in: SWIFT. CARROW. SPRING. A sailor’s cap on the top stone.'),'The same name as the board down on the beach. Whoever buried them read it off the wreck.'],
      known:['The Swift. He watched her come in. Then he came up here with a spade.']},
    log:{before:'A cairn marked for the Swift, out of Carrow.',known:'His cairn for the Swift, out of Carrow.'}},
  kittiwake:{site:'field',label:'Read the marker',name:'The Kittiwake’s cairn',
    lines:{before:[N_('KITTIWAKE. SALTMOUTH. AUTUMN. A clay pipe on the top stone, still packed.'),'Saltmouth’s a week’s sail. They were a long way from home.'],
      known:['He packed that pipe himself. For a man he put on the rocks.']},
    log:{before:'A cairn marked for the Kittiwake, out of Saltmouth.',known:'His cairn for the Kittiwake, out of Saltmouth, with a pipe he packed.'}},
  rose:{site:'field',label:'Read the marker',name:'The Rose of Ardrey’s cairn',
    lines:{before:[N_('ROSE OF ARDREY. WINTER. A rosary wound through the stones.'),'Ardrey men pray at sea. It didn’t help them.'],
      known:['He never set foot in chapel. Out here he’s been saying prayers for strangers.']},
    log:{before:'A cairn marked for the Rose of Ardrey.',known:'His cairn for the Rose of Ardrey, a rosary through the stones.'}},
  brennick:{site:'field',label:'Read the marker',name:'The Brennick Lass’s cairn',
    lines:{before:[N_('BRENNICK LASS. BRENNICK. SPRING. One boot on the top stone.'),'Only the one.'],
      known:['The sea gave him back one boot, so he buried a boot.']},
    log:{before:'A cairn marked for the Brennick Lass, out of Brennick.',known:'His cairn for the Brennick Lass: one boot.'}},
  providence:{site:'field',label:'Read the marker',name:'The Providence’s cairn',
    lines:{before:[N_('PROVIDENCE. HOLLIN BAY. SUMMER. A child’s doll, sat up on the stones.'),'Families work this coast in summer. Whole families.'],
      known:['He let a family boat onto the rocks.','Then he carried the doll up here, as if that squared it.']},
    log:{before:'A cairn marked for the Providence, out of Hollin Bay. A child’s doll on it.',known:'His cairn for the Providence, a family boat. A child’s doll on it.'}},
  noname:{site:'field',label:'Read the marker',name:'The nameless cairn',
    lines:{before:[N_('No name on this one. Only WINTER, and a mark like a broken mast.'),'She came in in pieces, then. Nobody will ever come looking for these.'],
      known:['He didn’t even know what to call them. He buried them anyway.']},
    log:{before:'A cairn with no name, only a season.',known:'His cairn for a ship he never knew the name of.'}},
  /* ---- the Margery's corner ---- */
  margery:{site:'corner',label:'Read the names',name:'The Margery’s men',
    lines:{before:['These are older than the rest, and better built. Someone took their time.',
        N_('Amos Pellow. Jory Trask. Will Hendy. Kit Carne. Sam Ruddock. Cut into flat stones, and under each one: MARGERY.'),
        'The Margery’s men. I was small, but I remember the bell for them, and their names read out in chapel all that winter.',
        'Five. She went out with six.'],
      known:()=>{ const L=['His own crew. He buried them first, up here where they can see home.','Five cairns. He never built the sixth.'];
        if(ledger())L.push('He let the Pellow boys go by on the Gannet. Their father’s up here.'); return L; },
      lived:['His own crew. He buried them first, up here where they can see home.','Five cairns. The sixth man is keeping a light for them now.'],
      died:['His own crew. He buried them first, up here where they can see home.','There should be six now.','There’s nothing of him left to put under it. I’ll build it anyway.']},
    log:{before:'Five cairns set apart, for the Margery’s men, with Wickham’s End names.',known:'Five cairns for the Margery’s men. He buried his own crew first.'}},
  /* ---- the bothy (arriving at the door) ---- */
  bothy:{site:'bothy',auto:true,name:'The bothy',
    lines:{before:['A hut, roofed with a boat turned keel-up.','Smoke-black round the pipe. Somebody lives here.'],
      known:['This is where he lives.','Twenty years, in a hut made out of other men’s boats.'],
      lived:['His hut.','Somebody still lives here.'],
      died:['His hut. Nobody lives here now.']},
    log:{before:'A hut by the cove, built from ship’s timber under an upturned hull.',known:'His hut by the cove, built from ship’s timber under an upturned hull.'}},
  tally:{site:'bothy',label:'Look at the tally marks',name:'The tally marks',
    lines:{before:[N_('Tally marks cut into the doorframe: four strokes and one across, over and over, down both posts.'),'Dozens. Someone’s been counting something a long time.','The last stroke is fresh.'],
      known:['One a season. A ship a season.','Twenty years of them, cut where he’d see them every time he went out.','The last one’s this autumn.','That one’s mine.'],
      lived:['One a season. A ship a season.','There won’t be another one.'],
      died:['One a season. A ship a season.','The last one’s mine. That’s where the count stops.']},
    log:{before:'Tally marks on the bothy’s doorframe, a stroke at a time.',known:'His tally on the doorframe: a stroke a season, a ship a season. The last one is mine.'}},
  bunk:{site:'bothy',label:'Look at the bunk',name:'The bunk',
    lines:{before:[N_('A bunk built into a ship’s berth. One blanket, folded square.'),'Whoever sleeps here learned to make a bed at sea.'],
      known:['He folded blankets like that at home. Square at the corners, like aboard ship.','Twenty years of nights in this, with that fire up on the crag.']},
    log:{before:'A bunk in the bothy, built into a ship’s berth.',known:'His bunk, the blanket folded square the way he did at home.'}},
  stove:{site:'bothy',label:'Look at the stove',name:'The stove',
    lines:{before:[N_('A stove made from a ship’s firebox, its pipe going up through the hull.'),'Still warm. Whoever lives here hasn’t been gone long.'],
      known:['Still warm. He was down here this morning, before he went up to feed it.'],
      lived:['Still warm. He’ll be down to sleep once the light’s trimmed.'],
      died:['Cold now. It’ll stay cold.']},
    log:{before:'A stove in the bothy made from a ship’s firebox, still warm.',known:'His stove, still warm from the morning.'}},
  chair:{site:'bothy',label:'Look at the chair',name:'The chair by the window',
    lines:{before:[N_('One chair, turned to face the window.'),'From here you can see clear across the water to our light.'],
      known:['He sat here and watched our light. Every night, twenty years.','Close enough to see. Too far to swim home.'],
      lived:['He sat here and watched our light. Every night, twenty years.','Now there’s a light here for her to watch back.'],
      died:['He sat here and watched our light. Every night, twenty years.','Nobody to sit in it now.']},
    log:{before:'A chair in the bothy, turned to the window and our light.',known:'His chair, turned to the window and our light.'}},
  toy:{site:'bothy',label:'Look at the toy boat',name:'The toy boat',
    lines:{before:[N_('A toy boat, half carved, a knife and a curl of shavings beside it.'),'An R cut deep in the stern. That part was done first.'],
      known:()=>caveToy()?['The same boat as the blue one in the cave. The same R.','He keeps carving it. This one he never finished.']
                          :['He made me one like this, the winter before the Margery went out.','He’s carving it again. Twenty years, and he hasn’t finished it.'],
      lived:['He made me one like this, the winter before the Margery went out.','I’ll leave it. He might finish this one.'],
      died:['He made me one like this, the winter before the Margery went out.','I’m taking it home.']},
    log:{before:'A toy boat in the bothy, half carved, with an R cut in the stern.',known:'A toy boat in his hut, half carved, with my initial in the stern.'}}};
const IDS=Object.keys(READS);
function linesOf(id,st){ const R=READS[id]; if(!R)return []; st=st||stage(); let L=R.lines[st]; if(L==null&&(st==='lived'||st==='died'))L=R.lines.known; if(typeof L==='function')L=L();
  return (L||[]).map(l=>typeof l==='string'?{t:l,who:'Rowan'}:{t:l.t,who:l.who==null?null:l.who}); }
const say=(t,who,o)=>{ try{ G.ui.say(t,who,Object.assign({priority:'high',group:'nis'},o||{})); }catch(e){} };
function read(id){
  const R=READS[id]; if(!R)return []; const st=stage(), k=id+':'+st, first=!S.read[k]; S.read[k]=1;
  const L=linesOf(id,st);
  L.forEach((l,i)=>say(l.t,l.who,i===0?{flush:true,key:'nis-'+id}:{key:'nis-'+id+i}));
  if(first){ const lg=R.log&&R.log[st]; if(lg)try{ G.ui.logLine&&G.ui.logLine(lg,'Found'); }catch(e){} }
  // the chair's window shot waits for the line about the view (the first line once he knows); any other read cancels it
  winPending=id==='chair'?{st,key:st==='before'?'nis-chair1':'nis-chair',until:G.time+16}:null;
  G.emit('northIsleStory:read',{id,stage:st,first});
  return L.map(l=>l.t);
}
/* the chair: a short held shot from where he sits, out of the south window and across the water to our lamp (onboarding.js
   G.cine: letterboxed, skippable with any button, once per stage). The roof goes back on for it, so it frames the window. */
function homeLamp(){ const L=G.world&&G.world.lighthouse; if(!L)return null; return L.lampCenter?L.lampCenter.clone():V(L.x,L.topY+1.6,L.z); }
let winPending=null, winOn=false;
function windowShot(st){
  const C=G.cine, lamp=homeLamp(); if(!C||!C.play||!lamp||!isPlay()||!inBothy(G.player&&G.player.pos))return false;
  const ch=BI.chair, w=BI.window, eye=V(BOTHY.x+ch.x,BFY+1.22,BOTHY.z+ch.z-.3), win=V(BOTHY.x+w.x,BFY+w.y,BOTHY.z+w.z);
  // look through the middle of the window, aimed at the lamp: the window frames it
  const dir=lamp.clone().sub(win).normalize(), far=win.clone().addScaledVector(dir,40);
  const P=G.player, mv=!!(P&&P.model&&P.model.visible);   // he stands between the chair and the window: out of the shot
  const ok=C.play('nisWindow:'+st,{dur:3.2,shot:(k,t,o)=>{ if(roof)roof.visible=true; if(P&&P.model)P.model.visible=false;
      const e=smooth(0,1,k); o.cp.copy(eye).lerp(V(eye.x,eye.y-.04,eye.z+.55),e); o.lp.copy(win).lerp(far,.25+.75*smooth(0,.6,k)); o.fov=42; },
    onEnd:()=>{ winOn=false; if(roof)roof.visible=roofOn; if(P&&P.model&&mv)P.model.visible=true; }});
  if(ok){ winOn=true; if(roof)roof.visible=true; }
  return ok;
}
const labelOf=id=>{ const R=READS[id]; return S.read[id+':'+stage()]?R.name:(R.label||R.name); };

/* ================================================================ 5. BUILDING IT */
let root=null, ember=null, emberMat=null, layout=null, roof=null, roofOn=true;
const rnd=U.rng;
// weathered grey-brown field stone (it reads as old stone at dusk, under Rowan's lantern too), crusted with two lichens
const STONE=[col('#373431'),col('#2f2f30'),col('#3c3631'),col('#2c2d30'),col('#423c36')], LICHEN=col('#70735f'), LICHEN2=col('#6c5f3c'), MOSS=col('#2e3828'), SOIL=col('#2c2622');
const WOOD=col('#7d6249'), WOOD2=col('#4a3929'), DRIFT=col('#69645c'), DRIFT2=col('#4c4842'), IRON=col('#2a2729'), CLOTH=col('#5b5148');
/* the atlas: marker faces, the Margery's cut stones, the two tallied door posts and the R in the toy's stern */
const BOARDS=[['SWIFT','CARROW · SPRING'],['KITTIWAKE','SALTMOUTH · AUTUMN'],['ROSE OF ARDREY','WINTER'],['BRENNICK LASS','BRENNICK · SPRING'],
  ['PROVIDENCE','HOLLIN BAY · SUMMER'],['','WINTER'],
  ['CURLEW','… · AUTUMN'],['MARY ANNE','FENWICK · WINTER'],['…ANDER','SPRING'],['TERN','SALTMOUTH · SUMMER'],['HOPE','… · AUTUMN'],['TWO MEN, A BOY','WINTER'],
  ['GOODWILL','CARROW · WINTER'],['…ISA','AUTUMN']];
const CREW=['AMOS PELLOW','JORY TRASK','WILL HENDY','KIT CARNE','SAM RUDDOCK'];
const AT=1024, CELL={w:256,h:96};
const cellRect=i=>({x:(i%3)*CELL.w,y:Math.floor(i/3)*CELL.h,w:CELL.w,h:CELL.h});      // 3 x 10 board cells on the left
const JAMB=[{x:768,y:0,w:64,h:512},{x:832,y:0,w:64,h:512}], RCELL={x:896,y:0,w:128,h:128};
function drawAtlas(c,s){
  const r=rnd(5150), grainy=(x,y,w,h,base,dark)=>{ c.fillStyle=base; c.fillRect(x,y,w,h); c.strokeStyle=dark; c.globalAlpha=.35; for(let i=0;i<14;i++){ c.lineWidth=1+r()*2; c.beginPath(); const yy=y+r()*h; c.moveTo(x,yy); c.bezierCurveTo(x+w*.3,yy+(r()-.5)*8,x+w*.7,yy+(r()-.5)*8,x+w,yy+(r()-.5)*6); c.stroke(); } c.globalAlpha=1; };
  c.fillStyle='#6a6458'; c.fillRect(0,0,s,s);
  const scratch=(t,x,y,size,w)=>{ c.font='bold '+size+'px Georgia, serif'; c.textAlign='center'; c.textBaseline='middle';
    let fs=size; while(fs>12&&c.measureText(t).width>w){ fs-=2; c.font='bold '+fs+'px Georgia, serif'; }
    c.fillStyle='rgba(30,24,18,.55)'; c.fillText(t,x+1.5,y+1.5); c.fillStyle='#e2d9c3'; c.fillText(t,x,y); };
  BOARDS.forEach((b,i)=>{ const R=cellRect(i); grainy(R.x,R.y,R.w,R.h,'#625d55','#3a352e');
    if(b[0])scratch(b[0],R.x+R.w/2,R.y+R.h*.4,36,R.w-24); scratch(b[1],R.x+R.w/2,R.y+R.h*.76,20,R.w-30);
    if(!b[0]){ c.strokeStyle='#e2d9c3'; c.lineWidth=3; c.beginPath(); c.moveTo(R.x+R.w/2,R.y+60); c.lineTo(R.x+R.w/2,R.y+14); c.lineTo(R.x+R.w/2+22,R.y+30); c.moveTo(R.x+R.w/2-16,R.y+50); c.lineTo(R.x+R.w/2+16,R.y+50); c.stroke(); }
    c.globalCompositeOperation='destination-out'; for(let k=0;k<26;k++){ c.fillStyle='rgba(0,0,0,.25)'; c.fillRect(R.x+r()*R.w,R.y+r()*R.h,2+r()*8,1+r()*2); } c.globalCompositeOperation='source-over'; });
  CREW.forEach((n,i)=>{ const R=cellRect(BOARDS.length+i); c.fillStyle='#74767b'; c.fillRect(R.x,R.y,R.w,R.h); for(let k=0;k<40;k++){ c.fillStyle=`rgba(${r()<.5?30:200},${r()<.5?30:200},${r()<.5?40:190},.08)`; c.fillRect(R.x+r()*R.w,R.y+r()*R.h,6+r()*20,4+r()*10); }
    c.textAlign='center'; c.textBaseline='middle'; let fs=34; c.font='bold '+fs+'px Georgia, serif'; while(c.measureText(n).width>R.w-26){ fs-=2; c.font='bold '+fs+'px Georgia, serif'; }
    c.fillStyle='rgba(235,235,230,.35)'; c.fillText(n,R.x+R.w/2+1,R.y+R.h*.4+1.5); c.fillStyle='#26272b'; c.fillText(n,R.x+R.w/2,R.y+R.h*.4);
    c.font='bold 18px Georgia, serif'; c.fillStyle='rgba(235,235,230,.35)'; c.fillText('MARGERY',R.x+R.w/2+1,R.y+R.h*.76+1); c.fillStyle='#26272b'; c.fillText('MARGERY',R.x+R.w/2,R.y+R.h*.76); });
  // the door posts: 16 tallies of five, eight down each post; the very last stroke is a fresh cut, pale
  JAMB.forEach((R,j)=>{ grainy(R.x,R.y,R.w,R.h,'#6e5a46','#3a2e22'); c.save(); c.beginPath(); c.rect(R.x,R.y,R.w,R.h); c.clip();
    for(let g=0;g<8;g++){ const y0=R.y+18+g*60, last=j===1&&g===7;
      for(let k=0;k<4;k++){ c.strokeStyle='#2a2018'; c.lineWidth=3.2; c.beginPath(); c.moveTo(R.x+12,y0+k*9+r()*1.5); c.lineTo(R.x+R.w-12,y0+k*9+r()*1.5); c.stroke(); }
      c.strokeStyle=last?'#d9c7a2':'#2a2018'; c.lineWidth=last?3.8:3.2; c.beginPath(); c.moveTo(R.x+10,y0+31); c.lineTo(R.x+R.w-10,y0-4); c.stroke(); }
    c.restore(); });
  // the R: cut deep (a dark letter with a pale lit lip), filling the transom
  c.fillStyle='#c9a77a'; c.fillRect(RCELL.x,RCELL.y,RCELL.w,RCELL.h); c.font='bold 118px Georgia, serif'; c.textAlign='center'; c.textBaseline='middle';
  c.fillStyle='#f0dcb4'; c.fillText('R',RCELL.x+66,RCELL.y+72); c.fillStyle='#24180f'; c.fillText('R',RCELL.x+64,RCELL.y+69);
}
/** a plane w x h whose uvs are the atlas rect R (canvas pixels) */
function atlasPlane(w,h,R){ const g=new THREE.PlaneGeometry(w,h), uv=g.attributes.uv; const u0=R.x/AT,u1=(R.x+R.w)/AT,v1=1-R.y/AT,v0=1-(R.y+R.h)/AT;
  for(let i=0;i<uv.count;i++)uv.setXY(i,u0+uv.getX(i)*(u1-u0),v0+uv.getY(i)*(v1-v0)); return g; }

/* ---- cairns ---- */
function stoneC(seed){ const base=STONE[seed%STONE.length], g0=H; return (p,n,o)=>{ o.copy(base).lerp(STONE[(seed+2)%STONE.length],vnoise(p.x*3.1+seed,p.z*3.1+p.y*2)*.6);
  // lichen in blotches on the tops and the weather sides; moss and peat splash low down and underneath
  const up=smooth(-.1,.6,n.y), lw=smooth(.5,.72,vnoise(p.x*4.3+seed*.31,p.z*4.3+p.y*3.7)), lo=smooth(.56,.74,vnoise(p.x*6.1-seed*.17,p.y*5.3+p.z*6.1+3));
  o.lerp(LICHEN,.55*lw*up); o.lerp(LICHEN2,.45*lo*(.4+.6*up)*(1-lw));
  if(n.y<-.2)o.lerp(MOSS,.35); o.lerp(SOIL,.45*(1-smooth(.05,.35,p.y-g0(p.x,p.z)))); }; }
function cairn(parts,GE,r,x,z,o){
  o=o||{}; const g=H(x,z), n=o.n||(2+Math.floor(r()*3)), r0=o.r||(.4+r()*.22); let y=g-.1, top=g;
  for(let i=0;i<n;i++){ const k=i/n, rr=r0*(1-k*.5)*(.86+r()*.28), jx=i?(r()-.5)*r0*.35:0, jz=i?(r()-.5)*r0*.35:0, sy=o.neat?.5:.42+r()*.2;
    const seed=Math.floor(r()*997);
    parts.push({g:GE.blob(1,i<2?1:0,seed*.13,o.neat?.12:.24),m:GE.mat4(x+jx,y+rr*sy*.85,z+jz,r()*.5,r()*TAU,r()*.5,rr*1.12,rr*sy,rr),c:stoneC(seed)});
    y+=rr*sy*1.3; top=y; }
  // a few loose stones round the foot
  for(let i=0;i<(o.neat?5:2);i++){ const a=r()*TAU, d=r0*(1.05+r()*.3), rr=.12+r()*.1, px=x+Math.cos(a)*d, pz=z+Math.sin(a)*d; parts.push({g:GE.blob(1,0,i+r()*9,.25),m:GE.mat4(px,H(px,pz)+rr*.25,pz,0,r()*3,0,rr*1.2,rr*.6,rr),c:stoneC(i+3)}); }
  G.addCollider({x,z,r:r0*1.02,y0:g-2,y1:top+.3});
  return {x,z,g,top,r:r0};
}
function token(parts,GE,kind,x,y,z,yaw,r){
  const T=(gm,dx,dy,dz,rx,ry,rz,c,sx,sy,sz)=>{ const cs=Math.cos(yaw),sn=Math.sin(yaw); parts.push({g:gm,m:GE.mat4(x+dx*cs+dz*sn,y+dy,z-dx*sn+dz*cs,rx,yaw+(ry||0),rz,sx,sy,sz),c}); };
  if(kind==='boot'){ T(new THREE.BoxGeometry(.13,.3,.13),0,.15,0,0,0,0,col('#2e2620')); T(new THREE.BoxGeometry(.28,.1,.13),.07,.05,0,0,0,0,col('#2a221c')); }
  else if(kind==='cap'){ T(new THREE.CylinderGeometry(.13,.15,.07,10),0,.04,0,.12,0,0,col('#2c3240')); T(new THREE.CylinderGeometry(.1,.1,.012,8,1,false,0,PI),.06,.01,0,0,0,0,col('#22252c')); }
  else if(kind==='pipe'){ T(new THREE.CylinderGeometry(.012,.012,.22,5),0,.02,0,0,0,PI/2,col('#d8cfc0')); T(new THREE.CylinderGeometry(.03,.024,.07,7),.11,.05,0,0,0,0,col('#d8cfc0')); }
  else if(kind==='bottle'){ T(new THREE.CylinderGeometry(.05,.055,.18,8),0,.09,0,0,0,0,col('#3d5a48')); T(new THREE.CylinderGeometry(.018,.03,.08,6),0,.21,0,0,0,0,col('#3d5a48')); }
  else if(kind==='knife'){ T(new THREE.BoxGeometry(.18,.008,.03),.04,.012,0,0,0,0,col('#9a9ca2')); T(new THREE.BoxGeometry(.1,.025,.03),-.1,.015,0,0,0,0,col('#4a3424')); }
  else if(kind==='rosary'){ T(new THREE.TorusGeometry(.13,.01,4,14),0,.02,0,PI/2-.3,0,0,col('#3a3030')); T(new THREE.BoxGeometry(.012,.1,.012),.05,-.03,.14,0,0,0,col('#b0a890')); T(new THREE.BoxGeometry(.06,.012,.012),.05,-.005,.14,0,0,0,col('#b0a890')); }
  else if(kind==='doll'){ const cl=col('#a08a70'), dress=col('#7a4a52'); T(GE.blob(1,0,3,.1),0,.1,0,0,0,0,dress,.07,.1,.06); T(new THREE.SphereGeometry(.05,8,6),0,.23,0,0,0,0,cl);
    T(new THREE.BoxGeometry(.18,.03,.03),0,.15,0,0,0,.2,dress); T(new THREE.BoxGeometry(.03,.09,.03),-.03,.02,.04,PI/2.4,0,0,cl); T(new THREE.BoxGeometry(.03,.09,.03),.03,.02,.04,PI/2.4,0,0,cl); }
}
/** a driftwood stake with a crossboard, beside a cairn; returns the board face's centre and its normal yaw */
function marker(parts,faces,GE,r,c,faceYaw,cell){
  const d=c.r+.22;   // just in front of the cairn
  const x=c.x+Math.sin(faceYaw)*d, z=c.z+Math.cos(faceYaw)*d, g=H(x,z), lean=(r()-.5)*.12;
  parts.push({g:new THREE.CylinderGeometry(.035,.05,1.05,6),m:GE.mat4(x,g+.42,z,lean,0,lean*.5),c:(p,n,o)=>o.copy(DRIFT).lerp(DRIFT2,.5+.5*Math.sin(p.y*20))});
  const by=g+.72, yaw=faceYaw;
  parts.push({g:new THREE.BoxGeometry(.64,.24,.04),m:GE.mat4(x,by,z,lean*.5,yaw,(r()-.5)*.1),c:DRIFT2});
  const fx=x+Math.sin(yaw)*.025, fz=z+Math.cos(yaw)*.025;
  faces.push({g:atlasPlane(.6,.22,cellRect(cell)),m:GE.mat4(fx,by,fz,lean*.5,yaw,0)});
  return {pos:V(x,by,z),yaw};
}
function buildGraveyard(GE){
  const r=rnd(9071), parts=[], faces=[], cairns=[];
  const taken=[]; const blocked=(x,z,pad)=>{ for(const c of G.collidersNear(x,z))if(Math.hypot(c.x-x,c.z-z)<c.r+pad)return true;
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const c of G.collidersNear(x+i*8,z+j*8))if(Math.hypot(c.x-x,c.z-z)<c.r+pad)return true; return false; };
  const slope=(x,z)=>Math.hypot(H(x+.5,z)-H(x-.5,z),H(x,z+.5)-H(x,z-.5));
  // the readable ones first (nudged off any boulder), facing south-west, toward the way up from the tower and the cove
  const out={};
  for(const m of MARKS){ let x=m.x, z=m.z; for(let k=0;k<12&&blocked(x,z,1.1);k++){ x+=Math.cos(k*2.4)*.6; z+=Math.sin(k*2.4)*.6; }
    const c=cairn(parts,GE,r,x,z,{n:3+Math.floor(r()*2),r:.5+r()*.12}); cairns.push(c); taken.push({x,z,r:2.6});
    const fy=.5+(r()-.5)*.6; const mk=marker(parts,faces,GE,r,c,fy,m.board);
    token(parts,GE,m.token,c.x,c.top-.04,c.z,r()*TAU,r);
    out[m.id]={pos:mk.pos.clone(),yaw:mk.yaw,cairn:c}; }
  // the field: a loose scatter in the ellipse, a cairn every couple of metres, thinning toward the edge
  let n=0, tries=0; const want=48, kinds=['boot','cap','pipe','bottle','knife','rosary','doll','bottle','cap','boot','knife','pipe'];
  let deco=6;
  while(n<want&&tries<3000){ tries++; const a=r()*TAU, d=Math.sqrt(r()), x=FIELD.x+Math.cos(a)*FIELD.rx*d, z=FIELD.z+Math.sin(a)*FIELD.rz*d;
    if(d>.75&&r()<.4)continue;
    if(taken.some(t=>Math.hypot(t.x-x,t.z-z)<Math.max(t.r,2.0)))continue;
    if(blocked(x,z,1.0))continue; if(slope(x,z)>.75)continue; if(Math.hypot(x-CORNER.x,z-CORNER.z)<CORNER.r+3)continue;
    const c=cairn(parts,GE,r,x,z); cairns.push(c); taken.push({x,z,r:2.0}); n++;
    if(r()<.62)token(parts,GE,kinds[Math.floor(r()*kinds.length)],c.x,c.top-.04,c.z,r()*TAU,r);
    if(deco<BOARDS.length&&r()<.3){ marker(parts,faces,GE,r,c,.5+(r()-.5)*1.4,deco); deco++; }
    else if(r()<.12){ const x2=c.x+.5, z2=c.z+.3; parts.push({g:new THREE.CylinderGeometry(.03,.045,.8,5),m:GE.mat4(x2,H(x2,z2)+.25,z2,.35,0,.2),c:DRIFT2}); } }   // a bare stake, its board long gone
  // the Margery's corner: five cairns in an arc on the south rim, facing the reader in the middle; a low kerb round them, open to the north
  const crew=[]; CREW.forEach((nm,i)=>{ const a=PI*(.15+i*.175), x=CORNER.x+Math.cos(a)*2.55, z=CORNER.z+Math.sin(a)*2.55;   // the southern half (+z is south)
    const c=cairn(parts,GE,r,x,z,{n:5,r:.62,neat:true}); cairns.push(c);
    const fa=Math.atan2(CORNER.x-x,CORNER.z-z), sx=x+Math.sin(fa)*(c.r+.12), sz=z+Math.cos(fa)*(c.r+.12), g=H(sx,sz);   // the cut stone faces the middle
    parts.push({g:new THREE.BoxGeometry(.58,.7,.12),m:GE.mat4(sx,g+.3,sz,-.06,fa,0),c:col('#86878a')});   // cut and dressed: lighter than the field stone
    faces.push({g:atlasPlane(.54,.21,cellRect(BOARDS.length+i)),m:GE.mat4(sx+Math.sin(fa)*.065,g+.48,sz+Math.cos(fa)*.065,-.06,fa,0)});
    crew.push(c); });
  for(let k=0;k<26;k++){ const a=k/26*TAU; if(Math.abs(U.angDiff(a,-PI/2))<.5)continue; const rr=.2+r()*.1, x=CORNER.x+Math.cos(a)*(CORNER.r+.1), z=CORNER.z+Math.sin(a)*(CORNER.r+.1);
    parts.push({g:GE.blob(1,0,k*1.7,.18),m:GE.mat4(x,H(x,z)+rr*.2,z,0,a,0,rr*1.5,rr*.8,rr*1.1),c:stoneC(k)}); }
  const stones=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true})); stones.castShadow=true; stones.receiveShadow=true; stones.name='nisGraveyard'; root.add(stones);
  return {cairns,out,crew,faces};
}
/* ---- the bothy ---- */
function halfTube(L,x0,nx,na,wAt,hAt){ const pos=[], idx=[];
  for(let i=0;i<=nx;i++){ const x=x0+L*i/nx, w=wAt(x), hh=hAt(x); for(let j=0;j<=na;j++){ const a=PI*j/na; pos.push(x,Math.sin(a)*BH.RH*hh,Math.cos(a)*BH.RW*w); } }
  for(let i=0;i<nx;i++)for(let j=0;j<na;j++){ const a=i*(na+1)+j, b=a+na+1; idx.push(a,b,a+1,a+1,b,b+1); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx); g.computeVertexNormals(); return g; }
function buildBothy(GE,faces){
  const parts=[], X=BOTHY.x, Z=BOTHY.z, F=BFY, r=rnd(3301);
  const B=(w,h,d,x,y,z,c,rx,ry,rz)=>parts.push({g:new THREE.BoxGeometry(w,h,d),m:GE.mat4(X+x,F+y,Z+z,rx||0,ry||0,rz||0),c});
  const plank=(base)=>(p,n,o)=>{ o.copy(base).lerp(WOOD2,.25+.25*Math.sin(p.x*7+p.z*7+vnoise(p.x*.9,p.y*3)*4)); };
  const strake=[col('#5a4c40'),col('#4c4036'),col('#62564a'),col('#54483c'),col('#3b3f5a')];
  const roofParts=[], RB=(w,h,d,x,y,z,c)=>roofParts.push({g:new THREE.BoxGeometry(w,h,d),m:GE.mat4(X+x,F+y,Z+z,0,0,0),c});
  // a stone footing down to the ground on the low side
  { const h=F-(BH.gLow-.5); B(2*BH.OX+.15,h,2*BH.OZ+.15,0,-h/2-.02,0,(p,n,o)=>o.copy(STONE[1]).lerp(STONE[2],vnoise(p.x*2,p.y*2+p.z))); }
  for(const s of STEPS)B(s.x1-s.x0,.16,1.4,(s.x0+s.x1)/2,s.h-F-.08,0,WOOD2);
  // the floor
  B(2*BH.IX+.2,.07,2*BH.IZ+.2,0,-.035,0,(p,n,o)=>o.copy(WOOD).lerp(WOOD2,.3+.3*Math.sin(p.z*14)));
  // walls of salvaged strakes, rows of mismatched timber: a gap for the door (west) and the window (south)
  const RH=.25, rows=Math.ceil(BH.WALL/RH), T=.14;
  for(let k=0;k<rows;k++){ const y0=k*RH, y=y0+RH/2, c=plank(strake[(k*3+1)%strake.length]);
    B(2*BH.OX,RH-.02,T,0,y,-BH.OZ+T/2,c,0,0,(r()-.5)*.012);                                   // north
    const winRow=y0+RH>BH.WY0&&y0<BH.WY1;                                                      // south (the window)
    if(winRow){ const a0=-BH.OX,a1=BH.WIN0,b0=BH.WIN1,b1=BH.OX; B(a1-a0,RH-.02,T,(a0+a1)/2,y,BH.OZ-T/2,c); B(b1-b0,RH-.02,T,(b0+b1)/2,y,BH.OZ-T/2,c); }
    else B(2*BH.OX,RH-.02,T,0,y,BH.OZ-T/2,c,0,0,(r()-.5)*.012);
    B(T,RH-.02,2*BH.OZ,BH.OX-T/2,y,0,c);                                                         // east
    if(y0<BH.DOORH){ const s=BH.OZ-BH.DOORZ; B(T,RH-.02,s,-BH.OX+T/2,y,-BH.DOORZ-s/2,c); B(T,RH-.02,s,-BH.OX+T/2,y,BH.DOORZ+s/2,c); }   // west (the door)
    else B(T,RH-.02,2*BH.OZ,-BH.OX+T/2,y,0,c); }
  for(const [sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]])B(.24,BH.WALL+.06,.24,sx*(BH.OX-.1),BH.WALL/2,sz*(BH.OZ-.1),WOOD2);
  // the door posts (tallied, inside faces) and lintel; a rolled sailcloth over the doorway
  for(const sz of [-1,1])B(.2,BH.DOORH,.16,-BH.OX+.1,BH.DOORH/2,sz*(BH.DOORZ+.08),WOOD2);
  B(.26,.16,2*BH.DOORZ+.4,-BH.OX+.1,BH.DOORH+.08,0,WOOD2);
  parts.push({g:new THREE.CylinderGeometry(.09,.09,2*BH.DOORZ+.2,8),m:GE.mat4(X-BH.OX-.06,F+BH.DOORH-.06,Z,PI/2,0,0),c:CLOTH});
  // the window: a sill and a lintel, an open shutter hooked back
  B(BH.WIN1-BH.WIN0+.2,.06,.3,(BH.WIN0+BH.WIN1)/2,BH.WY0-.03,BH.OZ-.1,WOOD2); B(BH.WIN1-BH.WIN0+.2,.08,.2,(BH.WIN0+BH.WIN1)/2,BH.WY1+.04,BH.OZ-.08,WOOD2);
  B(.6,.6,.04,BH.WIN1+.38,(BH.WY0+BH.WY1)/2,BH.OZ+.04,col('#5e4b3a'),0,.35,0);
  // the roof: a hull, keel-up, gunwales on the wall tops; her bow overhangs the east end. Ribs inside, a keel along the top
  const L=7.3, x0=-BH.OX-.35, bowAt=BH.OX, wAt=x=>{ const t=clamp((x-bowAt)/(x0+L-bowAt),0,1); return 1-.82*t*t; }, hAt=x=>1+.12*smooth(bowAt,x0+L,x);
  const hull=halfTube(L,x0,16,12,wAt,hAt);
  roofParts.push({g:hull,m:GE.mat4(X,F+BH.WALL,Z,0,0,0),c:(p,n,o)=>{ const ly=p.y-(F+BH.WALL), lz=p.z-Z, a=Math.atan2(ly/BH.RH,lz/BH.RW), band=Math.floor(a/PI*11);
    o.copy(strake[(band*2+3)%4]).lerp(col('#24211e'),.45*vnoise(p.x*.8,a*4)); if(ly<.28)o.lerp(col('#3b3f5a'),.7); if(ly>BH.RH*.92)o.lerp(col('#2a2622'),.5); }});
  RB(L-.3,.12,.16,x0+L/2-.15,BH.WALL+BH.RH+.03,0,WOOD2);
  for(let k=0;k<5;k++){ const rx=-2+k; const g=new THREE.TorusGeometry(1,.035,4,14,PI); g.rotateY(PI/2); roofParts.push({g,m:GE.mat4(X+rx,F+BH.WALL,Z,0,0,0,1,(BH.RH-.06),(BH.RW-.06)*wAt(rx)),c:WOOD2}); }
  // the gable ends above the walls, planked; a stovepipe up through the hull
  for(const ex of [-BH.OX+.02,BH.OX-.02]){ const g=new THREE.CircleGeometry(1,14,0,PI); g.rotateY(PI/2); roofParts.push({g,m:GE.mat4(X+ex,F+BH.WALL,Z,0,0,0,1,BH.RH-.02,BH.RW-.03),c:plank(strake[2])}); }
  { const S0=BI.stove, lo=BH.WALL-.72; parts.push({g:new THREE.CylinderGeometry(.08,.08,lo,8),m:GE.mat4(X+S0.x,F+.72+lo/2,Z+S0.z,0,0,0),c:IRON});   // up to the wall top; the rest goes with the roof
    roofParts.push({g:new THREE.CylinderGeometry(.08,.08,1.6,8),m:GE.mat4(X+S0.x,F+BH.WALL+.8,Z+S0.z,0,0,0),c:IRON});
    roofParts.push({g:new THREE.CylinderGeometry(.16,.1,.12,8),m:GE.mat4(X+S0.x,F+BH.WALL+1.62,Z+S0.z,0,0,0),c:IRON}); }
  // the bunk: a ship's berth along the north wall, one blanket folded square
  { const b=BI.bunk; B(2.0,.36,.82,b.x,.18,b.z-.18,plank(WOOD)); B(2.0,.22,.05,b.x,.45,b.z+.22,WOOD2); B(1.9,.1,.7,b.x,.41,b.z-.2,col('#4e4a44')); B(.52,.14,.42,b.x+.62,.53,b.z-.22,col('#6a5a48')); B(.3,.1,.5,b.x-.75,.51,b.z-.22,col('#9a9080')); }
  // the stove: a ship's firebox, its door ajar
  { const s=BI.stove; B(.62,.7,.55,s.x,.35,s.z,(p,n,o)=>o.copy(IRON).lerp(col('#4a3a30'),.3*vnoise(p.x*6,p.y*6))); B(.66,.05,.6,s.x,.72,s.z,IRON); B(.04,.26,.22,s.x-.33,.32,s.z-.2,IRON,0,-.7,0); }
  // the chair, turned to the window; a table by the door with the toy boat, the knife and the shavings
  { const c=BI.chair; B(.46,.05,.44,c.x,.46,c.z,WOOD); for(const [dx,dz] of [[-.19,-.18],[.19,-.18],[-.19,.18],[.19,.18]])B(.05,.46,.05,c.x+dx,.23,c.z+dz,WOOD2);
    B(.46,.52,.05,c.x,.74,c.z-.21,WOOD,-.12,0,0); }
  { const t=BI.toy; B(.8,.05,.55,t.x,.7,t.z,plank(WOOD)); for(const [dx,dz] of [[-.34,-.22],[.34,-.22],[-.34,.22],[.34,.22]])B(.05,.68,.05,t.x+dx,.34,t.z+dz,WOOD2);
    // TY: the hull's yaw (its X flip turns the yaw over: the stern points along -cos TY, -sin TY), the stern toward the reader
    const TY=1.1, sx=-Math.cos(TY), sz=-Math.sin(TY);
    const hg=new THREE.CylinderGeometry(.075,.075,.34,10,1,false,PI,PI); hg.rotateZ(PI/2); parts.push({g:hg,m:GE.mat4(X+t.x,F+.8,Z+t.z,PI,TY,0,1,.9,1),c:(p,n,o)=>o.copy(col('#b08a60')).lerp(col('#d2b48a'),p.x>X+t.x?.5:0)});
    B(.06,.08,.02,t.x-.12,.8,t.z+.04,col('#c9a77a'),0,.4,0);
    for(let k=0;k<6;k++)B(.06,.008,.025,t.x+.12+r()*.2,.73,t.z-.1+r()*.2,col('#d8c09a'),0,r()*3,0);
    B(.16,.008,.025,t.x-.25,.73,t.z-.16,col('#9a9ca2'),0,.8,0); B(.09,.02,.03,t.x-.33,.735,t.z-.23,col('#4a3424'),0,.8,0);
    // a squared-off transom at the stern, the R cut big across it (readable from where you stand to look at it)
    B(.012,.12,.17,t.x+sx*.166,.8,t.z+sz*.166,col('#c9a77a'),0,-TY,0);
    faces.push({g:atlasPlane(.12,.12,RCELL),m:GE.mat4(X+t.x+sx*.174,F+.8,Z+t.z+sz*.174,0,Math.atan2(sx,sz),0)}); }
  // a coat on a peg by the door, a coil of rope, a lamp hook
  parts.push({g:GE.blob(1,1,7,.12),m:GE.mat4(X-BH.IX+.18,F+1.05,Z-1.15,0,0,0,.12,.45,.26),c:col('#3a3632')});
  parts.push({g:new THREE.TorusGeometry(.22,.06,5,14),m:GE.mat4(X-BH.IX+.5,F+.06,Z+1.35,PI/2,0,0),c:col('#8a7a5a')});
  // the tally marks: the inside faces of both door posts
  for(const [sz,j] of [[-1,0],[1,1]]){ const z=Z+sz*(BH.DOORZ+.0); faces.push({g:atlasPlane(.15,1.3,JAMB[j]),m:GE.mat4(X-BH.OX+.1,F+.82,z-sz*.004,0,sz<0?0:PI,0)}); }
  const bm=G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(GE.mergeParts(parts),bm); mesh.castShadow=true; mesh.receiveShadow=true; mesh.name='nisBothy'; root.add(mesh);
  // the roof is its own mesh: it lifts away while Rowan is inside, so the camera can look down into the hut
  roof=new THREE.Mesh(GE.mergeParts(roofParts),bm); roof.castShadow=true; roof.receiveShadow=true; roof.name='nisBothyRoof'; root.add(roof);
  // furniture colliders (the walls are boxes, evaluation-time)
  G.addBoxCollider({x:X+BI.bunk.x,z:Z+BI.bunk.z-.18,hw:1.0,hd:.42,yaw:0,y0:F-1,y1:F+.55});
  G.addCollider({x:X+BI.stove.x,z:Z+BI.stove.z,r:.42,y0:F-1,y1:F+.9});
  G.addCollider({x:X+BI.toy.x,z:Z+BI.toy.z,r:.36,y0:F-1,y1:F+.8});
  G.addCollider({x:X+BI.chair.x,z:Z+BI.chair.z,r:.26,y0:F-1,y1:F+.9});
  // embers behind the stove door (no light of its own: a soft glow is enough, and the scene's light count stays as it is)
  emberMat=new THREE.MeshBasicMaterial({map:G.tex&&G.tex.soft,color:col('#ff8a3a'),transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false});
  ember=new THREE.Mesh(new THREE.PlaneGeometry(.34,.24),emberMat); ember.position.set(X+BI.stove.x-.32,F+.32,Z+BI.stove.z); ember.rotation.y=-PI/2; ember.name='nisEmber'; root.add(ember);
}
function build(){
  const GE=G.world&&G.world.geo; if(!GE)return;
  root=new THREE.Group(); root.name='northIsleStory'; root.visible=false; G.scene.add(root);
  const gy=buildGraveyard(GE); layout=gy;
  buildBothy(GE,gy.faces);
  const atlas=G.canvasTex(AT,drawAtlas,true);
  if(atlas){ atlas.anisotropy=4; }
  const fm=new THREE.Mesh(GE.mergeParts(gy.faces,{uv:'keep'}),G.toon('#ffffff',{map:atlas,side:THREE.DoubleSide})); fm.name='nisFaces'; fm.receiveShadow=true; root.add(fm);
  // where each readable thing is read from
  for(const m of MARKS)SITES.reads[m.id]=gy.out[m.id].pos;
  SITES.reads.margery=V(CORNER.x,H(CORNER.x,CORNER.z)+.4,CORNER.z);
  for(const k of ['tally','bunk','stove','chair','toy'])SITES.reads[k]=BW(k);
  // where a reader stands for each (tests and the map): a step in front of each marker, the middle of the corner, a spot in the hut
  for(const m of MARKS){ const o=gy.out[m.id]; SITES.stands[m.id]=V(o.pos.x+Math.sin(o.yaw)*1.15,0,o.pos.z+Math.cos(o.yaw)*1.15); }
  SITES.stands.margery=V(CORNER.x,0,CORNER.z-.6);
  for(const [k,x,z] of [['tally',-2.0,-.3],['bunk',1.7,-.35],['stove',1.55,1.3],['chair',.6,1.2],['toy',-1.5,.4]])SITES.stands[k]=V(BOTHY.x+x,0,BOTHY.z+z);
  for(const k in SITES.stands){ const v=SITES.stands[k]; v.y=G.floorAt(v.x,v.z,H(v.x,v.z)+3); }
  SITES.cairns=gy.cairns.length; SITES.crew=gy.crew.map(c=>({x:c.x,z:c.z}));
}
const SITES={field:{x:FIELD.x,z:FIELD.z,rx:FIELD.rx,rz:FIELD.rz},corner:{x:CORNER.x,z:CORNER.z,r:CORNER.r},
  bothy:{x:BOTHY.x,z:BOTHY.z,floorY:BFY,inner:{hx:BH.IX,hz:BH.IZ},door:V(BOTHY.x-BH.OX,BFY,BOTHY.z),doorOut:V(BOTHY.x-BH.OX-1.6,BH.gDoor,BOTHY.z),inside:inBothy,near:nearBothy},
  reads:{},stands:{},cairns:0,crew:[]};

/* ================================================================ 6. AFTER THE FIRE ROOM: one hook per outcome (the island
   changing after the ending is a later slice). Each runs once when the outcome is first seen (on the island or at a load). */
const OUTCOME={
  lived(){ /* later slice: Tobias keeps the true light; he may be found at the bothy by day. For now: the stove stays warm. */ if(ember)ember.visible=true; },
  died(){ /* later slice: the sixth cairn (Rowan builds it), the toy boat taken home. For now: the stove goes cold. */ if(ember)ember.visible=false; }};
let lastStage=null;
function applyStage(st){ if(st===lastStage)return; lastStage=st; if(ember)ember.visible=st!=='died';
  if((st==='lived'||st==='died')&&OUTCOME[st]){ const first=!S.hooks[st]; S.hooks[st]=1; try{ OUTCOME[st](first); }catch(e){ console.error(e); } } }

/* ================================================================ 7. SAVE */
function load(d){ if(!d||typeof d!=='object')return; S.read=Object.assign({},d.read||{}); S.seen=Object.assign({},d.seen||{}); S.hooks=Object.assign({},d.hooks||{}); lastStage=null; }
const reg=()=>G.persist&&G.persist.register&&G.persist.register('northIsleStory',{save:()=>({v:1,read:Object.assign({},S.read),seen:Object.assign({},S.seen),hooks:Object.assign({},S.hooks)}),load});
if(G.persist&&G.persist.register)reg(); else G.on('ready',reg);
G.on('game:reset',()=>{ S.read={}; S.seen={}; S.hooks={}; lastStage=null; });

/* ================================================================ 8. WIRING */
G.system('northIsleStory',{order:86,modes:['play','paused','dead','title'],
  init(){
    try{ build(); }catch(e){ console.error('northIsleStory',e); }
    const IA=G.interact, en=()=>isPlay()&&onIsle()&&!(G.northIsle&&G.northIsle.crossing);
    for(const id of IDS){ const R=READS[id]; if(R.auto)continue;
      const inside=R.site==='bothy';
      IA.add({pos:()=>SITES.reads[id]||null,radius:id==='margery'?3.2:inside?1.25:1.9,priority:inside?5:4,label:()=>labelOf(id),enabled:en,use:()=>read(id)}); }
  },
  update(dt){
    for(let i=timers.length-1;i>=0;i--){ if(G.time>=timers[i].t){ const f=timers[i].fn; timers.splice(i,1); try{ f(); }catch(e){ console.error(e); } } }
    const cam=G.camera&&G.camera.position, C=G.northIsle&&G.northIsle.centre;
    if(root&&cam&&C){ root.visible=Math.hypot(cam.x-C.x,cam.z-C.z)<300&&cam.y>-30&&!(G.northCave&&G.northCave.inside)&&!(G.northFire&&G.northFire.inside); }
    // the roof lifts away while Rowan is in the hut (back on once he's out of the doorway)
    { const P0=G.player&&G.player.pos, want=!(P0&&inBothy(P0)); if(want!==roofOn&&!(want&&nearBothy(P0))){ roofOn=want; if(roof)roof.visible=roofOn; } }
    const st=stage(); applyStage(st);
    if(winPending){ const P0=G.player&&G.player.pos, cap=G.ui&&G.ui.captions&&G.ui.captions(), k=cap&&cap.cur&&cap.cur.key;
      if(G.time>winPending.until||!inBothy(P0)||winPending.st!==st)winPending=null;
      else if(k===winPending.key&&isPlay()){ const w=winPending; winPending=null; windowShot(w.st); } }
    if(winOn&&G.cine&&G.cine.on&&!inBothy(G.player&&G.player.pos))G.cine.skip();
    if(root&&root.visible&&ember&&ember.visible){ const t=G.time||0; emberMat.opacity=.55+.2*Math.sin(t*3.1)*Math.sin(t*1.7+1); }
    if(G.state.mode!=='play'||!onIsle())return;
    const P=G.player.pos;
    // arriving: the rise and the hut each have a few lines of their own, once per stage
    const inField=Math.hypot((P.x-FIELD.x)/(FIELD.rx+2),(P.z-FIELD.z)/(FIELD.rz+2))<1&&P.y>H(FIELD.x,FIELD.z)-4;
    if(inField&&!S.seen['field:'+st]){ S.seen['field:'+st]=1; read('field'); }
    const nb=Math.hypot(P.x-BOTHY.x,P.z-BOTHY.z)<6.5&&Math.abs(P.y-BFY)<2.5;
    if(nb&&!S.seen['bothy:'+st]){ S.seen['bothy:'+st]=1; read('bothy'); }
  }
});

G.northIsleStory={state:S,sites:SITES,stage,outcome:OUTCOME,keepClear:G.isleKeepClear,
  debug:{ read:id=>read(id), stage, lines:(id,st)=>linesOf(id,st).map(l=>l.t), ids:IDS.slice(), reads:READS, label:labelOf,
    all(){ const o={}; for(const id of IDS){ o[id]={}; for(const st of ['before','known','lived','died'])o[id][st]=linesOf(id,st).map(l=>l.t); } return o; },
    get layout(){ return layout; }, BH, BI, inBothy, nearBothy }};
})();

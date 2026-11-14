/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — northisle_finds.js
   The north island, slice 5 (agent D): things to find off the path.
     - the Margery herself: her broken hull out on the reef off the east side of the cove, on a bar of rock and sand
       that is only above the sea at low water (G.tide: the bar is walkable while G.world.tide < BAR_DRY; at high
       water only her ribs and the stump of her mast show). Inside: a Keeper's Heart ('margery', 1 Mark: progression.js
       drops it on 'northFinds:heart' and reconciles it on load) and the skipper's berth aft — empty, the oilskin hook
       bare, the sea-chest forced, a lantern still in its bracket. Caught out there by the tide, Rowan wades back to the
       beach (a short fade, no harm).
     - the lookout: a stone seat on the west cliffs facing home ("Look home": a short skippable camera hold across the
       water to Hesper's light; after the ending, round to the north light too). The north-west cliffs can't see home
       past the island's own rise, so the seat is on the west cliffs, where the view is clear.
     - two companion spots (their SPOTS entries, markers and rewards are in companions.js; the ground is built here):
       a cleft in an outcrop on the north cliffs over a sea grotto (Ember brings out a bottle with a note in it), and a
       sea stack off the west cliffs with an old gull's nest on top (Corvin brings down a child's ribbon).
   Every readable thing reads by stage (northisle_story.js's stage(): 'before' | 'known' | 'lived' | 'died'); before the
   ledger nothing says or hints that his father lived. Captions go in group 'nisf' (a new read flushes the last one's).
   API: G.northIsleFinds = { state, sites, companionSpots, companionFind(id), debug:{ read(id), tideTo(level), ... } }
   Save: G.persist 'northIsleFinds'. Keep-clear circles go into G.isleKeepClear at evaluation time.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth,vnoise}=U;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const col=U.col;
const NI=G.northIsle;
const H=(x,z)=>G.world.height(x,z);
if(!NI){ G.northIsleFinds={state:{},sites:{},companionSpots:{},companionFind(){},debug:{}}; return; }
const C=NI.centre;

/* ================================================================ 1. WHERE THINGS ARE (fixed at evaluation) */
/* ---- the Margery: the hull's own frame. Origin WK, local +x along u (her bow, east-north-east), +z along w (starboard,
   to seaward); port (-z) faces the bar and the beach. */
const WK={x:192.1,z:-636.2}, WA=-.49;
const UX=Math.cos(WA), UZ=Math.sin(WA), WX=-Math.sin(WA), WZ=Math.cos(WA);
const toW=(lx,lz)=>({x:WK.x+lx*UX+lz*WX,z:WK.z+lx*UZ+lz*WZ});
const toL=(x,z)=>{ const dx=x-WK.x, dz=z-WK.z; return {x:dx*UX+dz*UZ,z:dx*WX+dz*WZ}; };
const HL=5.75, HB=1.85, HD=2.3, DECK=-.55;              // half-length, half-beam, depth; her hold floor
const hT=x=>clamp((x+HL)/(2*HL),0,1);                    // 0 at the stern .. 1 at the bow
const hW=x=>{ const t=hT(x); return (1-.2*(1-smooth(0,.22,t)))*(1-Math.pow(smooth(.42,1,t),1.6)*.95); };   // a square-ish transom, a fine bow
const hG=x=>{ const t=hT(x); return .12+.75*Math.pow(smooth(.62,1,t),2)+.2*(1-smooth(0,.12,t)); };         // her sheer (the nominal gunwale)
const BREACH={x0:-1.3,x1:1.1};                            // the hole stove in her port side, where the bar runs in
const BULK=-3.2;                                          // the bulkhead between the hold and the skipper's berth (aft)
const inHull=(lx,lz)=>lx>-HL+.3&&lx<HL-.8&&Math.abs(lz)<1.55*hW(lx);
/* ---- the bar: rock and sand from the east end of the beach out to the breach. [x,z] world */
const BAR=(()=>{ const a=toW(-.1,-3.4), b=toW(-.1,-1.0); return [[179.6,-655.4],[181.6,-652.9],[183.4,-650.6],[184.4,-648.4],[186.2,-646.3],[188.1,-644.6],[189.2,-642.4],[a.x,a.z],[b.x,b.z]]; })();
const BW=1.65;                                            // the walkable half-width
const BAR_DRY=-.98;                                       // the bar is out of the water while the sea's offset is below this
const BSEG=[]; { let s=0; for(let i=0;i<BAR.length-1;i++){ const a=BAR[i], b=BAR[i+1], dx=b[0]-a[0], dz=b[1]-a[1], l=Math.hypot(dx,dz); BSEG.push({ax:a[0],az:a[1],dx,dz,l,l2:l*l,s0:s}); s+=l; } BSEG.len=s; }
function barInfo(x,z){ let best=1e9, bs=0;
  for(const g of BSEG){ let t=((x-g.ax)*g.dx+(z-g.az)*g.dz)/g.l2; t=t<0?0:t>1?1:t; const d=Math.hypot(g.ax+g.dx*t-x,g.az+g.dz*t-z); if(d<best){ best=d; bs=g.s0+g.l*t; } }
  return {d:best,s:bs/BSEG.len}; }
/** the bar's surface: just under the beach at the shore end, out along a low crown, up into her hold at the far end */
function barY(s,d){ const base=lerp(-.42,-.84,smooth(0,.3,s))+.26*smooth(.86,1,s);
  return base-.14*Math.pow(clamp(d/BW,0,1),2)+.05*(vnoise(s*31,d*1.7)-.5); }
const dry=()=>(G.world.tide||0)<BAR_DRY;
/* ---- the lookout: a stone seat on the west cliffs, facing home */
const homeLamp=()=>{ const L=G.world&&G.world.lighthouse; if(!L)return V(180,67.6,0); return L.lampCenter?L.lampCenter.clone():V(L.x,(L.topY||60)+1.6,L.z); };
const LOOK=(()=>{ const a=3.08, R=NI.shoreR(a), d=R-6, x=C.x+Math.cos(a)*d, z=C.z+Math.sin(a)*d; const yaw=Math.atan2(180-x,0-z); return {x,z,yaw}; })();
/* ---- the cleft on the north cliffs (Ember) and the gull stack off the west cliffs (Corvin) */
const CLEFT=(()=>{ const a=-1.32, R=NI.shoreR(a), d=R-7.5, x=C.x+Math.cos(a)*d, z=C.z+Math.sin(a)*d, ix=-Math.cos(a), iz=-Math.sin(a);   // in: toward the island's middle
  return {x,z,ix,iz,a}; })();
// northisle.js's tallest sea stack, off the south-west cliffs ([2.4,-10,4.5]: built in its init, after ours; its lumpy top
// measured with a ray at 5.1 m over the middle, so the nest's ledge sits there)
const STACK=(()=>{ const a0=2.4, R0=NI.shoreR(a0)+10, sx=C.x+Math.cos(a0)*R0, sz=C.z+Math.sin(a0)*R0, a=Math.atan2(sz-C.z,sx-C.x), R=NI.shoreR(a);
  const stx=C.x+Math.cos(a)*(R-4.5), stz=C.z+Math.sin(a)*(R-4.5); return {x:sx,z:sz,top:5.1,stand:{x:stx,z:stz},a}; })();

/* keep-clear: every footprint, so the island's dressing (northisle_life.js) leaves them open */
G.isleKeepClear=G.isleKeepClear||[];
{ const K=G.isleKeepClear;
  for(let i=0;i<=8;i++){ const s=i/8*BSEG.len; let g=BSEG[0]; for(const q of BSEG)if(s>=q.s0)g=q; const t=clamp((s-g.s0)/g.l,0,1); K.push({x:g.ax+g.dx*t,z:g.az+g.dz*t,r:BW+1.4,why:'finds: the bar to the Margery'}); }
  for(const lx of [-3.6,0,3.6]){ const p=toW(lx,0); K.push({x:p.x,z:p.z,r:3.6,why:'finds: the Margery'}); }
  K.push({x:LOOK.x,z:LOOK.z,r:3.2,why:'finds: the lookout'});
  K.push({x:CLEFT.x,z:CLEFT.z,r:4.6,why:'finds: the cleft over the grotto'},{x:CLEFT.x+CLEFT.ix*3.4,z:CLEFT.z+CLEFT.iz*3.4,r:2.2,why:'finds: the cleft over the grotto'});
  K.push({x:STACK.stand.x,z:STACK.stand.z,r:2.4,why:'finds: the gull stack (where you stand)'},{x:STACK.x,z:STACK.z,r:4.2,why:'finds: the gull stack'}); }

/* ================================================================ 2. THE BAR AND THE HULL UNDERFOOT (evaluation) */
const WAD={on:false,t:0,from:null};                        // caught by the tide: wading back to the beach
const onBar=(x,z)=>barInfo(x,z).d<BW-.05;
const nearSite=(x,z)=>Math.abs(x-WK.x)<26&&Math.abs(z-(WK.z-8))<24;
// the bar and her hold are dry footing at low water (core: walkOverrides, consulted in order; northisle.js's rule for
// its whole box is already in the list, so this goes in front of it). Covered, the island's own rule applies (deep water).
G.walkOverrides.unshift((x,z)=>{ if(!nearSite(x,z))return null;
  const l=toL(x,z), site=onBar(x,z)||inHull(l.x,l.z);
  if(!site)return null; if(dry()||WAD.on)return true; return null; });
G.floorProviders.push((x,z,y)=>{ if(!nearSite(x,z))return null;
  const l=toL(x,z);
  if(l.x>-HL+.15&&l.x<HL-.4&&Math.abs(l.z)<1.72*hW(l.x)){ return DECK<=y+.9?DECK:null; }
  const b=barInfo(x,z); if(b.d<BW+.4){ const h=barY(b.s,Math.min(b.d,BW)); return h<=y+.9?h:null; }
  return null; });
// her sides, transom and the bulkhead: boxes along the hull's curve (the breach left open)
const SIDE=[];   // {x0,x1,sgn} local runs
{ const add=(p0,p1,y0,y1)=>{ const dx=p1.x-p0.x, dz=p1.z-p0.z, L=Math.hypot(dx,dz)||1; G.addBoxCollider({x:(p0.x+p1.x)/2,z:(p0.z+p1.z)/2,hw:L/2+.04,hd:.11,yaw:Math.atan2(-dz/L,dx/L),y0,y1}); };
  for(let x=-HL+.05;x<HL-.3;x+=1){ const x1=Math.min(HL-.3,x+1);
    for(const sg of [-1,1]){ if(sg<0&&x1>BREACH.x0&&x<BREACH.x1)continue;
      add(toW(x,sg*1.74*hW(x)),toW(x1,sg*1.74*hW(x1)),-3,1.3); } }
  const ts=1.74*hW(-HL); add(toW(-HL+.05,-ts),toW(-HL+.05,ts),-3,1.3);
  const tb=1.74*hW(HL-.5); add(toW(HL-.4,-tb),toW(HL-.4,tb),-3,1.6);
  const bw=1.74*hW(BULK); add(toW(BULK,-bw),toW(BULK,-.48),-3,.7); add(toW(BULK,.48),toW(BULK,bw),-3,.7); }
// the berth's furniture, in the hull's frame: the bunk along the starboard side, the sea-chest in the port corner, the
// oilskin hook on the bulkhead, the lantern's bracket on her starboard side
const BI={bunk:{x:-4.45,z:.98,hx:.95,hz:.42},chest:{x:-4.8,z:-.92},hook:{x:BULK-.08,z:-1.0,y:.95},lantern:{x:-3.62,z:1.5,y:.62},heart:{x:2.35,z:.35}};
{ const b=BI.bunk, p=toW(b.x,b.z); G.addBoxCollider({x:p.x,z:p.z,hw:b.hx,hd:b.hz,yaw:-WA,y0:DECK-1,y1:DECK+.5});
  const c=toW(BI.chest.x,BI.chest.z); G.addBoxCollider({x:c.x,z:c.z,hw:.36,hd:.24,yaw:-WA,y0:DECK-1,y1:DECK+.45});
  const m=toW(1.6,0); G.addCollider({x:m.x,z:m.z,r:.24,y0:DECK-1,y1:DECK+5}); }

/* ================================================================ 3. STATE AND STAGE */
const S={v:1,read:{},seen:{},said:{},heart:false,found:{},looks:0};
const isPlay=()=>G.state.mode==='play';
function outcome(){ try{ const F=G.northFire, o=F&&F.state&&F.state.outcome; return o==='lived'||o==='died'?o:null; }catch(e){ return null; } }
function stage(){ const NS=G.northIsleStory; if(NS&&NS.stage)try{ return NS.stage(); }catch(e){}
  const o=outcome(); if(o)return o; const NC=G.northCave&&G.northCave.state; if(NC&&((NC.read&&NC.read.ledger)||NC.met))return 'known'; return 'before'; }
const onIsle=()=>{ const P=G.player; return !!(P&&P.pos&&NI.inBox(P.pos.x,P.pos.z)&&!(G.northCave&&G.northCave.inside)&&!(G.northFire&&G.northFire.inside)); };
const timers=[]; const later=(s,fn)=>timers.push({t:(G.time||0)+s,fn});

/* ================================================================ 4. THE WORDS
   A line is a string (Rowan) or N_(t) (narration). lines[stage]; 'lived'/'died' have their own. */
const N_=t=>({t,who:null});
const READS={
  /* ---- arriving at the Margery (on the bar by her side, or in her hold) ---- */
  wreck:{auto:true,name:'The Margery',
    lines:{before:[N_('A boat’s stern board, half under weed: MARGERY. WICKHAM’S END.'),'She isn’t up on the beach with the others. She’s still out here, on the rock she struck.','Twenty years, and the sea hasn’t finished with her.'],
      known:['His boat, still on the rock she struck.','He could see her from his door. Every low tide for twenty years, there she was.'],
      lived:['She’s still out here. He’ll see her every low tide he keeps that light.'],
      died:['She’s still out here. He isn’t.']},
    log:{before:'The Margery’s wreck, out on the reef off the cove. At low water you can walk out to her.',known:'The Margery’s wreck on the reef: his boat, still on the rock she struck.'}},
  /* ---- the skipper's berth, aft ---- */
  berth:{label:'Look in the skipper’s berth',name:'The skipper’s berth',
    lines:{before:[N_('The skipper’s berth, aft: a bunk under what’s left of the deck, a sea-chest, a lantern still in its bracket.'),'My father’s berth. When she was tied up at home he’d let me sleep in that bunk.','They never found him. They never found any of them.'],
      known:[N_('The oilskin hook is bare. The sea-chest’s lock has been forced, levered out from inside the berth.'),'He came back down here after she struck. Took his coat. Broke his own chest open for whatever he kept in it.','He left the lantern. He didn’t need one. There was a light on the crag.','He had time to take his coat. His crew didn’t have time for anything.'],
      lived:['He walked out of this berth into the fire’s light. Now he keeps a true one.'],
      died:['He climbed out of this berth alive, and spent the rest of his life paying for it.']},
    log:{before:'The skipper’s berth in the Margery’s stern: a bunk, a sea-chest, a lantern still in its bracket.',known:'The skipper’s berth in the Margery: his coat gone from the hook, his chest forced open. He got out.'}},
  /* ---- the lookout ---- */
  look:{label:'Look home',name:'Look home',
    lines:{before:[N_('A flat stone set on the cliff’s edge for a seat, worn smooth, facing south.'),'Hesper’s light, clear across the water.','Whoever sits here can see it every night.'],
      known:['Hesper’s light, clear across the water.','He sat here too. He could see home from this rock every night for twenty years.','And he never once rowed for it.'],
      lived:['Hesper’s light. And his behind me, burning gold.','Two keepers on one stretch of water. Anyone out there tonight has a true light to steer by.'],
      died:['Hesper’s light. The only one on this coast now.','Behind me the crag’s dark. Nothing up there for anyone to steer by, true or false.']},
    log:{before:'A stone seat on the west cliffs of the north island, facing our light across the water.',known:'His seat on the west cliffs, facing our light across the water.'}},
  /* ---- what the companions bring (companions.js calls companionFind) ---- */
  bottle:{name:'A bottle with a note',
    lines:{before:[N_('A bottle, stoppered and sealed with wax. Inside, a page torn from a log:'),N_('“The Providence, of Hollin Bay. J. Avery, master, and Nell, and our two girls. We steered for a light we took for Hollin harbour. It was not. Whoever finds this, tell them at home. God forgive whoever lit it, for I can’t.”'),
        'Hollin Bay. The cairn with the doll on it.','Somebody buried them. Nobody ever told Hollin Bay.'],
      known:[N_('A bottle, stoppered and sealed with wax. Inside, a page torn from a log:'),N_('“The Providence, of Hollin Bay. J. Avery, master, and Nell, and our two girls. We steered for a light we took for Hollin harbour. It was not. Whoever finds this, tell them at home. God forgive whoever lit it, for I can’t.”'),
        'He buried them, and sat a doll up on the stones.','He never found this. He never had to read it.'],
      lived:[N_('A bottle, stoppered and sealed with wax. Inside, a page torn from a log:'),N_('“The Providence, of Hollin Bay. J. Avery, master, and Nell, and our two girls. We steered for a light we took for Hollin harbour. It was not. Whoever finds this, tell them at home. God forgive whoever lit it, for I can’t.”'),
        'I’ll take it up to him. Let him write that one in his log too.'],
      died:[N_('A bottle, stoppered and sealed with wax. Inside, a page torn from a log:'),N_('“The Providence, of Hollin Bay. J. Avery, master, and Nell, and our two girls. We steered for a light we took for Hollin harbour. It was not. Whoever finds this, tell them at home. God forgive whoever lit it, for I can’t.”'),
        'I’ll take it to Hollin Bay myself. Somebody has to.']},
    log:{before:'A bottle from the grotto under the north cliffs: a note from the master of the Providence, of Hollin Bay.',known:'A bottle from the grotto under the north cliffs: the Providence’s last word. He never found it.'}},
  ribbon:{name:'A child’s ribbon',
    lines:{before:['A girl’s hair ribbon. The gulls wove it into their nest.','There was a doll on one of those cairns.'],
      known:['A girl’s ribbon. From the Providence, it has to be.','He watched every one of them come in. He’d have seen her on deck.'],
      lived:['A girl’s ribbon, off the Providence.','I’ll tie it on her cairn, where he walks past it.'],
      died:['A girl’s ribbon, off the Providence.','I’ll tie it on her cairn. There’s nobody else to.']},
    log:{before:'A child’s hair ribbon, from an old gull’s nest on a sea stack off the west cliffs.',known:'A child’s hair ribbon from the gull stack. From the Providence.'}}};
/* one-off lines: what you see from the shore, and the gaps the companions can get into */
const ONCE={
  tideHigh:'Ribs out on the reef, and the stump of a mast. At low water I could walk out to her.',
  tideLow:'The tide’s out. There’s a bar of rock showing, all the way out to that wreck.',
  turning:'The tide’s on the turn. Back to the beach, or I’ll be swimming.',
  waded:{t:'The sea comes back over the bar faster than a man can walk. You wade the last of it, waist-deep.',who:null},
  cleft:{t:'A cleft in the rock, too narrow for anything bigger than a fox. The sea is booming somewhere down inside.',who:null},
  stack:{t:'Out on the stack, something bright is woven into an old gull’s nest. Too far to reach from here.',who:null}};
const IDS=Object.keys(READS);
function linesOf(id,st){ const R=READS[id]; if(!R)return []; st=st||stage(); let L=R.lines[st]; if(L==null)L=R.lines.known; if(typeof L==='function')L=L();
  return (L||[]).map(l=>typeof l==='string'?{t:l,who:'Rowan'}:{t:l.t,who:l.who==null?null:l.who}); }
const say=(t,who,o)=>{ try{ G.ui.say(t,who,Object.assign({priority:'high',group:'nisf'},o||{})); }catch(e){} };
const sayOnce=k=>{ if(S.said[k])return false; S.said[k]=1; const o=ONCE[k]; if(typeof o==='string')say(o,'Rowan',{flush:true,key:'nisf-'+k}); else say(o.t,o.who,{flush:true,key:'nisf-'+k}); return true; };
function read(id,o){
  o=o||{}; const R=READS[id]; if(!R)return []; const st=stage(), k=id+':'+st, first=!S.read[k]; S.read[k]=1;
  const L=linesOf(id,st);
  L.forEach((l,i)=>say(l.t,l.who,i===0?{flush:true,key:'nisf-'+id}:{key:'nisf-'+id+i}));
  if(first){ const lg=R.log&&(R.log[st]||(st!=='before'&&R.log.known)); if(lg)try{ G.ui.logLine&&G.ui.logLine(lg,'Found'); }catch(e){} }
  G.emit('northIsleFinds:read',{id,stage:st,first});
  return L.map(l=>l.t);
}
const labelOf=id=>{ const R=READS[id]; return S.read[id+':'+stage()]?R.name:(R.label||R.name); };

/* ================================================================ 5. BUILDING IT */
let root=null, foam=null, foamMat=null, built=false;
const rnd=U.rng;
const WOOD=col('#5e4a38'), WOOD2=col('#3e3024'), WET=col('#2a231d'), WEED=col('#2f3b26'), WEED2=col('#44522f'), PAINT=col('#40606e'), IRON=col('#2a2729'),
  SAND=col('#5c564c'), SANDW=col('#403c36'), ROCK=col('#4f5260'), ROCK2=col('#383b45'), BARN=col('#c9c2b0');
function hullGeo(){
  // a grid over (x along her, θ round her section from port gunwale to starboard), with planks rotted out near the top
  // and the breach stove in on the port side; double-sided
  const nx=34, na=14, pos=[], idx=[], vi=[], r=rnd(6107);
  for(let i=0;i<=nx;i++){ const x=-HL+2*HL*i/nx, w=hW(x), g=hG(x), dep=HD*(1-.45*smooth(.72,1,hT(x)));
    for(let j=0;j<=na;j++){ const th=-PI/2+PI*j/na; pos.push(x,g-dep*Math.cos(th),HB*w*Math.sin(th)); } }
  for(let i=0;i<nx;i++)for(let j=0;j<na;j++){ const x=-HL+2*HL*(i+.5)/nx, th=-PI/2+PI*(j+.5)/na, top=j===0||j===na-1, nearTop=j<=1||j>=na-2;
    if(th<-.32&&x>BREACH.x0+.15*Math.sin(j*2.1)&&x<BREACH.x1-.2*Math.cos(j*1.7))continue;         // the breach
    if(top&&r()<.62)continue; if(nearTop&&r()<.34)continue; if((j===2||j===na-3)&&r()<.08)continue;                                         // rotted planks
    const a=i*(na+1)+j, b=a+na+1; idx.push(a,b,a+1,a+1,b,b+1); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function ribCurve(x,ext){ // one frame: her section at x, carried on past the gunwale (straight up and a little out) where the planks are gone
  const w=hW(x), g=hG(x), dep=HD*(1-.45*smooth(.72,1,hT(x))), pts=[];
  const lo=-PI/2+Math.max(0,-ext[0]), N=12;
  if(ext[0]>0)pts.push(V(x,g+ext[0]*1.3,-HB*w*(1-.12*ext[0])));
  for(let j=0;j<=N;j++){ const th=lo+(PI/2-lo)*j/N; pts.push(V(x,g-dep*Math.cos(th),HB*w*Math.sin(th)*.985)); }
  if(ext[1]>0)pts.push(V(x,g+ext[1]*1.3,HB*w*(1-.12*ext[1])));
  return new THREE.CatmullRomCurve3(pts); }
function buildWreck(GE,faces){
  const parts=[], r=rnd(5021);
  const M=(lx,y,lz,rx,ry,rz,sx,sy,sz)=>{ const p=toW(lx,lz); return GE.mat4(p.x,y,p.z,rx||0,(ry||0)-WA,rz||0,sx,sy,sz); };   // hull frame → world (yaw -WA turns local x onto u)
  const plank=(p,n,o)=>{ o.copy(WOOD).lerp(WOOD2,.3+.25*Math.sin(p.y*11+vnoise(p.x*.7,p.z*.7)*4)); if(p.y<.25&&p.y>-.15)o.lerp(PAINT,.5);
    o.lerp(WET,smooth(.1,-1.3,p.y)*.6); o.lerp(WEED,smooth(-.2,-1.0,p.y)*.55*(.4+.6*vnoise(p.x*1.3,p.z*1.3))); };
  parts.push({g:hullGeo(),m:M(0,0,0),c:plank});
  // ribs: every 0.78 m, standing up past the rotted planking (at high water they're all that shows, with the mast)
  for(let x=-HL+.6;x<HL-.7;x+=.78){ const inB=x>BREACH.x0-.1&&x<BREACH.x1+.1, ext=[inB?-1.1:r()<.22?0:.25+.55*r(),r()<.2?0:.25+.6*r()];
    const tg=new THREE.TubeGeometry(ribCurve(x,ext),14,.07,4,false); parts.push({g:tg,m:M(0,0,0),c:(p,n,o)=>{ o.copy(WOOD2).lerp(WET,smooth(.2,-1,p.y)*.7); o.lerp(WEED,smooth(-.3,-1.1,p.y)*.5); }}); }
  // the keel and stem, the transom (flat, aft), the hold floor (planks, weed in patches)
  parts.push({g:new THREE.BoxGeometry(2*HL-.6,.22,.22),m:M(-.2,hG(0)-HD-.05,0),c:WET});
  { const tw=1.74*hW(-HL); parts.push({g:new THREE.BoxGeometry(.12,1.9,2*tw),m:M(-HL,hG(-HL)-.75,0),c:plank}); }
  for(let k=0;k<11;k++){ const lz=-1.5+k*.3; let x0=-HL+.25, x1=HL-1.1; while(x1>x0&&1.7*hW(x1)<Math.abs(lz)+.16)x1-=.1; while(x1>x0&&1.7*hW(x0)<Math.abs(lz)+.16)x0+=.1; const len=x1-x0; if(len<.3)continue;
    parts.push({g:new THREE.BoxGeometry(len,.06,.27),m:M((x0+x1)/2,DECK-.03,lz),c:(p,n,o)=>{ o.copy(WOOD).lerp(WOOD2,.35+.3*Math.sin(p.x*3+k)); const wv=vnoise(p.x*.9+k,p.z*.9); o.lerp(WEED,smooth(.45,.7,wv)*.75); o.lerp(WET,.35); }}); }
  // weed and wrack heaped in the hold, mussels low on her sides
  for(let k=0;k<16;k++){ const lx=-2.8+r()*7.4, lz=(r()-.5)*2.2*hW(lx); if(lx>2.0&&lx<2.8&&Math.abs(lz-.35)<.6)continue;
    parts.push({g:GE.blob(1,0,k*1.9,.3),m:M(lx,DECK+.02,lz,0,r()*3,0,.35+r()*.35,.08+r()*.06,.3+r()*.3),c:r()<.5?WEED:WEED2}); }
  // the mast: a stump broken off above the hold, leaning to starboard; a spar fallen across her
  { const ml=4.9; parts.push({g:new THREE.CylinderGeometry(.13,.18,ml,8),m:M(1.6,DECK+ml/2-.1,.25,.04,0,-.13),c:(p,n,o)=>o.copy(WOOD2).lerp(WET,smooth(.2,-1,p.y)*.7)});
    parts.push({g:new THREE.ConeGeometry(.14,.6,6),m:M(1.6+.62,DECK+ml+.08,.25,.6,0,-.25),c:WOOD2});
    parts.push({g:new THREE.CylinderGeometry(.07,.09,5.2,7),m:M(.4,.25,.6,0,.35,PI/2-.12),c:WOOD2}); }
  // the bulkhead between the hold and the berth (a doorway in the middle), the berth's deckhead half gone (two beams left)
  { const bw=1.74*hW(BULK), hh=1.2; for(const sg of [-1,1]){ const w=bw-.48; parts.push({g:new THREE.BoxGeometry(.1,hh-sg*.12,w),m:M(BULK,DECK+(hh-sg*.12)/2,sg*(.48+w/2),0,0,sg*.03),c:plank}); }
    for(const sg of [-1,1])parts.push({g:new THREE.BoxGeometry(.12,1.25,.1),m:M(BULK,DECK+.62,sg*.5),c:WOOD2}); }   // the doorposts; the deck over the berth is long gone
  // the bunk (a ship's berth along the starboard side), a mouldered blanket
  { const b=BI.bunk; parts.push({g:new THREE.BoxGeometry(2*b.hx,.42,2*b.hz),m:M(b.x,DECK+.21,b.z),c:plank});
    parts.push({g:new THREE.BoxGeometry(2*b.hx,.2,.05),m:M(b.x,DECK+.5,b.z-b.hz),c:WOOD2});
    parts.push({g:GE.blob(1,0,4.4,.25),m:M(b.x+.2,DECK+.47,b.z+.05,0,0,0,.7,.07,.3),c:col('#3f4038')}); }
  // the sea-chest, its lid thrown back and the hasp torn out of the wood
  { const c=BI.chest; parts.push({g:new THREE.BoxGeometry(.7,.4,.44),m:M(c.x,DECK+.2,c.z),c:(p,n,o)=>o.copy(col('#3f5560')).lerp(WET,.4)});
    for(const dx of [-.25,.25])parts.push({g:new THREE.BoxGeometry(.05,.41,.46),m:M(c.x+dx,DECK+.2,c.z),c:IRON});
    parts.push({g:new THREE.BoxGeometry(.72,.06,.44),m:M(c.x,DECK+.55,c.z-.34,1.95,0,0),c:(p,n,o)=>o.copy(col('#46606c')).lerp(WET,.3)});
    parts.push({g:new THREE.BoxGeometry(.1,.12,.03),m:M(c.x+.02,DECK+.33,c.z+.235,0,0,.6),c:col('#8a6a3a')});            // the hasp, hanging by one nail
    parts.push({g:new THREE.BoxGeometry(.12,.05,.06),m:M(c.x-.05,DECK+.4,c.z+.24,0,.3,.1),c:col('#c9b48a')}); }           // pale splinters where it was levered
  // the oilskin hook on the bulkhead: a bare iron peg
  { const h=BI.hook; parts.push({g:new THREE.CylinderGeometry(.025,.025,.18,6),m:M(h.x-.08,DECK+h.y,h.z,0,0,PI/2),c:IRON}); parts.push({g:new THREE.CylinderGeometry(.03,.03,.06,6),m:M(h.x-.17,DECK+h.y+.03,h.z),c:IRON}); }
  // the lantern in its bracket on her starboard side: iron frame, dark glass, still there
  { const l=BI.lantern; parts.push({g:new THREE.BoxGeometry(.04,.04,.24),m:M(l.x,DECK+l.y+.32,l.z-.12),c:IRON});
    parts.push({g:new THREE.CylinderGeometry(.11,.12,.26,6),m:M(l.x,DECK+l.y+.08,l.z-.24),c:(p,n,o)=>o.copy(col('#2e3a38')).lerp(col('#5d6a5c'),.3*vnoise(p.y*20,p.x*20))});
    parts.push({g:new THREE.ConeGeometry(.12,.12,6),m:M(l.x,DECK+l.y+.27,l.z-.24),c:IRON}); parts.push({g:new THREE.CylinderGeometry(.12,.12,.04,6),m:M(l.x,DECK+l.y-.07,l.z-.24),c:IRON});
    parts.push({g:new THREE.TorusGeometry(.05,.012,4,8),m:M(l.x,DECK+l.y+.36,l.z-.24),c:IRON}); }
  // the stern board: MARGERY, WICKHAM'S END, painted across her transom (its own face, from the atlas)
  { const tw=1.74*hW(-HL)*1.6; faces.push({g:atlasPlane(tw,.48,{x:0,y:0,w:512,h:160}),m:M(-HL-.07,hG(-HL)-.38,0,0,-PI/2,0)}); }
  const mesh=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide})); mesh.castShadow=true; mesh.receiveShadow=true; mesh.name='nifMargery'; root.add(mesh);
}
function buildBar(GE){
  // a ribbon of wet sand and dark weedy rock along the bar, its edges ragged and falling away under the sea; rocks on its
  // flanks, cobbles and wrack strewn over it (all visual: the walk is barY/barInfo, unchanged)
  const ns=Math.ceil(BSEG.len/.5), nd=14, EXT=BW+2.2, pos=[], cl=[], idx=[], c=new THREE.Color(), t=new THREE.Color();
  const SANDD=col('#4a3f31'), SANDL=col('#6f614b'), RKD=col('#29282a'), RKM=col('#433f3b'), WD=col('#283318'), WL=col('#4d5627'), WETD=col('#211c18');
  const rockAt=(x,z)=>smooth(.5,.66,vnoise(x*.42+3,z*.42-1)*.75+vnoise(x*1.3-7,z*1.3+4)*.25);
  const weedAt=(x,z)=>smooth(.56,.7,vnoise(x*.8-5,z*.8+2)*.8+vnoise(x*2.6,z*2.6)*.2);
  const at=s=>{ let g=BSEG[0]; for(const q of BSEG)if(s*BSEG.len>=q.s0)g=q; const tt=clamp((s*BSEG.len-g.s0)/g.l,0,1); return {x:g.ax+g.dx*tt,z:g.az+g.dz*tt,nx:-g.dz/g.l,nz:g.dx/g.l}; };
  for(let i=0;i<=ns;i++){ const s=i/ns, p=at(s);
    for(let j=0;j<=nd;j++){ const dd=-EXT+2*EXT*j/nd, d=Math.abs(dd), sd=dd>0?7:0;
      // a ragged edge: two scales of noise, never far inside the walk (the drop just inside it is a few centimetres)
      const e0=BW-.15+.95*(vnoise(s*19+sd,3.1)*.7+vnoise(s*61+sd,8.3)*.3); let y=barY(s,Math.min(d,BW)); if(d>e0)y-=1.6*smooth(e0,EXT,d)+.15*(d-e0);
      const x=p.x+p.nx*dd, z=p.z+p.nz*dd, rk=rockAt(x,z);
      if(d<e0)y+=rk*.1+.035*(vnoise(x*2.2,z*2.2)-.5);                       // rock stands a hand above the sand
      { const gh=H(x,z); if(Math.abs(gh-y)<.06)y=gh-.06; }
      pos.push(x,y,z);
      c.copy(SANDD).lerp(SANDL,.55*vnoise(x*1.1,z*1.1)*smooth(-1.15,-.55,y));   // wet sand, a little paler up on the crown
      c.lerp(t.copy(RKD).lerp(RKM,vnoise(x*2.3,z*2.3)),rk*.9);
      const wd=weedAt(x,z); c.lerp(t.copy(WD).lerp(WL,.6*vnoise(x*3.1,z*3.1)),wd*.8*(1-rk*.4));
      c.lerp(WETD,smooth(-1.05,-1.8,y)*.75);
      cl.push(c.r,c.g,c.b); } }
  for(let i=0;i<ns;i++)for(let j=0;j<nd;j++){ const a=i*(nd+1)+j, b=a+nd+1; idx.push(a,a+1,b,b,a+1,b+1); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(cl,3)); g.setIndex(idx); g.computeVertexNormals();
  const parts=[{g,c:null}], r=rnd(8833);
  const rockC=(q,n,o)=>{ o.copy(RKD).lerp(RKM,.7*vnoise(q.x*2,q.z*2+q.y)); if(n.y>.3)o.lerp(BARN,.16*smooth(.55,.8,vnoise(q.x*7,q.z*7))); o.lerp(WD,smooth(-.55,-1.05,q.y)*.75); };
  // rocks on its flanks (no colliders: the bar's own edge is the walk's edge), barnacled, weedy below the tide line
  for(let k=0;k<44;k++){ const s=.04+r()*.92, p=at(s), side=r()<.5?-1:1, dd=side*(BW+.1+r()*1.8), x=p.x+p.nx*dd, z=p.z+p.nz*dd, sz=.2+r()*.5, y=barY(s,BW)-.2-r()*.3;
    parts.push({g:GE.blob(1,1,k*3.7,.32),m:GE.mat4(x,y,z,r()*.6,r()*3,r()*.6,sz*(1.1+r()*.6),sz*(.5+r()*.3),sz),c:rockC}); }
  // low ledges of rock breaking through the sand along the walk (flat: you can walk over them)
  for(let k=0;k<16;k++){ const s=.1+r()*.82, p=at(s), dd=(r()-.5)*BW*1.5, x=p.x+p.nx*dd, z=p.z+p.nz*dd, sz=.45+r()*.65;
    parts.push({g:GE.blob(1,1,k*5.3,.26),m:GE.mat4(x,barY(s,Math.abs(dd))-.1,z,0,r()*3,0,sz*(1.2+r()*.7),.13,sz),c:rockC}); }
  // cobbles strewn over it, and wrack (kelp in dark heaps, lighter bladder-wrack) in patches
  for(let k=0;k<54;k++){ const s=.03+r()*.94, p=at(s), dd=(r()-.5)*2*(BW+.3), x=p.x+p.nx*dd, z=p.z+p.nz*dd, sz=.07+r()*.13;
    parts.push({g:GE.blob(1,0,k*1.7,.3),m:GE.mat4(x,barY(s,Math.min(Math.abs(dd),BW))+sz*.2,z,r()*.4,r()*3,r()*.4,sz*1.3,sz*.6,sz),c:rockC}); }
  for(let k=0;k<22;k++){ const s=.05+r()*.9, p=at(s), dd=(r()-.5)*2*(BW+.6), x=p.x+p.nx*dd, z=p.z+p.nz*dd, sz=.25+r()*.45, wc=t.copy(WD).lerp(WL,r()*.8).clone();
    parts.push({g:GE.blob(1,1,k*2.9,.4),m:GE.mat4(x,barY(s,Math.min(Math.abs(dd),BW))+.005,z,0,r()*3,0,sz*1.6,.045,sz*.8),c:wc}); }
  const m=new THREE.Mesh(GE.mergeParts(parts.map(p=>p.c===null?{g:p.g,c:(q,n,o)=>o.setRGB(1,1,1)}:p)),G.toon('#ffffff',{vertexColors:true}));
  // (the ribbon's own colours: mergeParts drops them, so copy them back in)
  { const cc=m.geometry.attributes.color, n0=g.index.count; const src=g.attributes.color, I=g.index.array; for(let k=0;k<n0;k++){ const v=I[k]; cc.setXYZ(k,src.getX(v),src.getY(v),src.getZ(v)); } cc.needsUpdate=true; }
  m.receiveShadow=true; m.castShadow=true; m.name='nifBar'; root.add(m);
}
function buildFoam(){
  // a ring of foam round her at the waterline, and along the bar's flanks (rides the tide)
  const pos=[], uv=[], idx=[]; let base=0;
  const ribbon=(pts,w0,w1)=>{ for(let k=0;k<pts.length;k++){ const p=pts[k], q=pts[Math.min(pts.length-1,k+1)], o=pts[Math.max(0,k-1)], dx=q.x-o.x, dz=q.z-o.z, L=Math.hypot(dx,dz)||1, nx=-dz/L, nz=dx/L;
      pos.push(p.x+nx*w0,0,p.z+nz*w0, p.x+nx*w1,0,p.z+nz*w1); uv.push(k*.5,0,k*.5,1); }
    for(let k=0;k<pts.length-1;k++){ const a=base+k*2; idx.push(a,a+2,a+1,a+1,a+2,a+3); } base+=pts.length*2; };
  const ring=[]; for(let k=0;k<=48;k++){ const t=k/48*TAU, lx=Math.cos(t)*(HL+.35), lz=Math.sin(t)*(HB*1.08)*(lx>0?1-Math.pow(lx/(HL+.35),3)*.8:1); ring.push(toW(lx,lz)); }
  ribbon(ring,-.5,.9);
  for(const sg of [-1,1]){ const pts=[]; for(let k=0;k<=24;k++){ const s=k/24*.96; let g=BSEG[0]; for(const q of BSEG)if(s*BSEG.len>=q.s0)g=q; const t=clamp((s*BSEG.len-g.s0)/g.l,0,1); const nx=-g.dz/g.l, nz=g.dx/g.l; pts.push({x:g.ax+g.dx*t+nx*sg*(BW+.9),z:g.az+g.dz*t+nz*sg*(BW+.9)}); }
    ribbon(pts,sg*-.5,sg*.8); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeBoundingSphere();
  const tex=G.canvasTex(128,(c,s)=>{ const gr=c.createLinearGradient(0,0,0,s); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(.4,'rgba(255,255,255,.85)'); gr.addColorStop(.6,'rgba(255,255,255,.3)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=gr; c.fillRect(0,0,s,s); c.globalCompositeOperation='destination-out'; const rr=rnd(77); for(let i=0;i<50;i++){ c.fillStyle='rgba(0,0,0,.55)'; c.beginPath(); c.ellipse(rr()*s,rr()*s,6+rr()*10,3+rr()*4,0,0,TAU); c.fill(); } });
  if(tex){ tex.wrapS=THREE.RepeatWrapping; tex.rotation=PI/2; }
  foamMat=new THREE.MeshBasicMaterial({map:tex,color:col('#d9d3c8'),transparent:true,opacity:.5,depthWrite:false,fog:true});
  foam=new THREE.Mesh(g,foamMat); foam.name='nifFoam'; foam.renderOrder=2; root.add(foam);
}
function buildLookout(GE,parts){
  const r=rnd(4410), cy=Math.cos(LOOK.yaw), sy=Math.sin(LOOK.yaw), g=H(LOOK.x,LOOK.z);
  const stoneC=(seed)=>(p,n,o)=>{ o.copy(ROCK2).lerp(ROCK,vnoise(p.x*3+seed,p.z*3+p.y*2)*.7); if(n.y>.6)o.lerp(col('#6f7462'),.35*smooth(.5,.7,vnoise(p.x*5,p.z*5))); };
  // the seat: a long flat stone on two uprights, worn pale in the middle; a third stone for the feet
  for(const sd of [-.42,.42]){ const x=LOOK.x+cy*sd, z=LOOK.z-sy*sd; parts.push({g:GE.blob(1,1,sd*9,.18),m:GE.mat4(x,H(x,z)+.18,z,0,LOOK.yaw,0,.22,.3,.24),c:stoneC(sd)}); }
  parts.push({g:new THREE.BoxGeometry(1.25,.13,.46),m:GE.mat4(LOOK.x,g+.48,LOOK.z,.02,LOOK.yaw,.03),c:(p,n,o)=>{ o.copy(col('#6c6e72')).lerp(ROCK2,.3*vnoise(p.x*4,p.z*4)); if(n.y>.7)o.lerp(col('#8f8f8a'),.45*(1-smooth(.1,.5,Math.hypot(p.x-LOOK.x,p.z-LOOK.z)))); }});
  { const fx=LOOK.x+sy*.8, fz=LOOK.z+cy*.8; parts.push({g:GE.blob(1,1,2.2,.2),m:GE.mat4(fx,H(fx,fz)+.04,fz,0,r()*3,0,.4,.12,.3),c:stoneC(2)}); }
  G.addCollider({x:LOOK.x,z:LOOK.z,r:.55,y0:g-1,y1:g+.6});
}
function buildCleft(GE,parts){
  // an outcrop on the north cliff top: a heap of big weathered stones with a black cleft at its foot, facing inland
  const r=rnd(2290), K=CLEFT, ox=-K.ix, oz=-K.iz, sx=K.iz, sz=-K.ix;   // ox,oz: out to sea; sx,sz: along the cliff
  const stoneC=(seed)=>(p,n,o)=>{ o.copy(ROCK2).lerp(ROCK,vnoise(p.x*1.4+seed,p.z*1.4+p.y)*.8); if(n.y>.5)o.lerp(col('#5c6450'),.4*smooth(.45,.7,vnoise(p.x*3,p.z*3))); };
  const g0=H(K.x,K.z);
  for(const [a,b,s,hy,seed] of [[.1,-2.0,1.6,1.3,1],[.1,2.0,1.55,1.2,2],   // (the flanking two stand apart: the fissure between them, companions.js)
      [1.2,0,2.2,1.5,3],[1.9,-.6,1.6,1.0,4],[1.7,1.3,1.5,.9,5],[-.5,-2.6,1.2,.7,6],[-.3,2.7,1.1,.6,7]]){
    const x=K.x+ox*a+sx*b, z=K.z+oz*a+sz*b, y=Math.min(H(x,z),g0+.3)+s*hy*.42;
    parts.push({g:GE.blob(1,1,seed*2.3,.24),m:GE.mat4(x,y,z,r()*.3,r()*3,r()*.3,s,s*hy*.75,s*.9),c:stoneC(seed)});
    G.addCollider({x,z,r:s*.88,y0:g0-3,y1:y+s*hy*.7}); }
  // the lintel stone over the cleft
  { const x=K.x-ox*.55, z=K.z-oz*.55; parts.push({g:GE.blob(1,1,9.1,.2),m:GE.mat4(x,g0+1.0,z,0,Math.atan2(sx,sz),0,1.1,.32,.5),c:stoneC(9)}); }
}
/* the atlas: the Margery's stern board */
const AT=512;
function drawAtlas(c,s){
  c.fillStyle='#2b3134'; c.fillRect(0,0,s,s);
  const R={x:0,y:0,w:512,h:160}; c.fillStyle='#40606e'; c.fillRect(R.x,R.y,R.w,R.h);
  c.fillStyle='rgba(0,0,0,.28)'; for(let i=0;i<5;i++)c.fillRect(R.x,R.y+i*R.h/5,R.w,3);
  c.fillStyle='#e2d7bd'; c.textAlign='center'; c.textBaseline='middle'; c.font='bold 92px Georgia, serif'; c.fillText('MARGERY',R.x+R.w/2,R.y+R.h*.42);
  c.font='34px Georgia, serif'; c.fillText('WICKHAM’S END',R.x+R.w/2,R.y+R.h*.8);
  // weed, salt and twenty years: the paint flaked away in patches, the lower edge green-black
  const r=rnd(3141); c.globalCompositeOperation='source-over';
  for(let i=0;i<70;i++){ c.fillStyle=`rgba(${30+r()*20|0},${36+r()*20|0},${30+r()*14|0},${.25+r()*.4})`; c.fillRect(R.x+r()*R.w,R.y+r()*R.h,4+r()*22,2+r()*7); }
  const gr=c.createLinearGradient(0,R.y+R.h*.55,0,R.y+R.h); gr.addColorStop(0,'rgba(32,44,28,0)'); gr.addColorStop(1,'rgba(32,44,28,.85)'); c.fillStyle=gr; c.fillRect(R.x,R.y,R.w,R.h);
}
function atlasPlane(w,h,R){ const g=new THREE.PlaneGeometry(w,h), uv=g.attributes.uv; const u0=R.x/AT,u1=(R.x+R.w)/AT,v1=1-R.y/AT,v0=1-(R.y+R.h)/AT;
  for(let i=0;i<uv.count;i++)uv.setXY(i,u0+uv.getX(i)*(u1-u0),v0+uv.getY(i)*(v1-v0)); return g; }
function build(){
  const GE=G.world&&G.world.geo; if(!GE||built)return; built=true;
  root=new THREE.Group(); root.name='northIsleFinds'; root.visible=false; G.scene.add(root);
  const faces=[]; buildWreck(GE,faces); buildBar(GE); buildFoam();
  const parts=[]; buildLookout(GE,parts); buildCleft(GE,parts);
  const rocks=new THREE.Mesh(GE.mergeParts(parts),G.toon('#ffffff',{vertexColors:true})); rocks.castShadow=true; rocks.receiveShadow=true; rocks.name='nifRocks'; root.add(rocks);
  const atlas=G.canvasTex(AT,drawAtlas,true);
  const fm=new THREE.Mesh(GE.mergeParts(faces,{uv:'keep'}),G.toon('#ffffff',{map:atlas,side:THREE.DoubleSide})); fm.name='nifFaces'; fm.receiveShadow=true; root.add(fm);
}

/* ================================================================ 6. THE SITES (where things are read from, where you stand) */
const W3=(lx,lz,y)=>{ const p=toW(lx,lz); return V(p.x,y,p.z); };
const SITES={
  wreck:{x:WK.x,z:WK.z,yaw:WA,deck:DECK,toW,toL,inHull:(p)=>{ if(!p)return false; const l=toL(p.x,p.z); return inHull(l.x,l.z)&&p.y>DECK-1&&p.y<DECK+3; },
    bar:BAR.map(p=>({x:p[0],z:p[1]})),barW:BW,dryBelow:BAR_DRY,onBar:(p)=>!!p&&onBar(p.x,p.z)},
  reads:{berth:W3(-4.35,0,DECK+.8),look:V(LOOK.x,0,LOOK.z),heart:W3(BI.heart.x,BI.heart.z,DECK)},
  stands:{berth:W3(-3.7,.05,DECK),look:V(LOOK.x-Math.sin(LOOK.yaw)*1.1,0,LOOK.z-Math.cos(LOOK.yaw)*1.1),wreck:W3(.6,-.4,DECK),barStart:V(BAR[0][0]-1.6,0,BAR[0][1]-2.2)},
  lookout:LOOK,cleft:CLEFT,stack:STACK};
{ const s=SITES.stands; for(const k of ['look','barStart']){ const v=s[k]; v.y=H(v.x,v.z); } SITES.reads.look.y=H(LOOK.x,LOOK.z)+.5; }
/* the companion spots' ground (companions.js reads this at its init: SPOTS 'grotto' and 'stack') */
const companionSpots={
  grotto:{at:V(CLEFT.x+CLEFT.ix*1.75,0,CLEFT.z+CLEFT.iz*1.75),stand:V(CLEFT.x+CLEFT.ix*3.6,0,CLEFT.z+CLEFT.iz*3.6),out:{x:CLEFT.ix,z:CLEFT.iz}},
  stack:{at:V(STACK.x,STACK.top+.1,STACK.z),stand:V(STACK.stand.x,0,STACK.stand.z),face:{x:STACK.stand.x-STACK.x,z:STACK.stand.z-STACK.z}}};
{ const g=companionSpots.grotto; g.at.y=H(g.at.x,g.at.z)+.25; g.stand.y=H(g.stand.x,g.stand.z); const s=companionSpots.stack; s.stand.y=H(s.stand.x,s.stand.z); }

/* ================================================================ 7. THE HEART, THE TIDE, LOOKING HOME */
/* the Keeper's Heart lies in her hold: progression.js places it (dropHeart) when you're on the island and it isn't yours */
let heartWait=0;
function askHeart(dt){ const PR=G.progress; if(!PR||!PR.state)return;
  if(PR.state.hearts&&PR.state.hearts.margery){ if(!S.heart)S.heart=true; return; }
  if(PR.drops&&PR.drops.margery)return;
  heartWait-=dt||0; if(heartWait>0)return; heartWait=1;   // (G.time runs from below zero after a start point)
  G.emit('northFinds:heart',{pos:SITES.reads.heart.clone()}); }
G.on('progress:heart',e=>{ if(e&&e.src==='margery')S.heart=true; });
/* the tide: debug.tideTo(level) sets the sea where you want it (alchemy.js owns the clock: 300 s a cycle, low at 150 s) */
function tideTo(level){
  const A=G.alchemy, T=G.tide; if(!A||!A.debug||!A.debug.setTide||!T)return null;
  const amp=1.343, P=300, lv=clamp(+level,-1,1);
  const t=lv<=-.999?P/2:Math.acos(clamp(lv/amp,-1,1))*P/TAU;
  A.debug.setTide(t);
  return {level:+T.level.toFixed(3),off:+(G.world.tide||0).toFixed(3),dry:dry(),low:T.low};
}
/* caught out on the bar or in her hold as the sea comes back: a fade, and he's on the beach end of the bar, wet */
function wade(){ if(WAD.on)return; WAD.on=true; WAD.t=0; const P=G.player; try{ P.setControl&&P.setControl(false); }catch(e){}
  const f=document.getElementById('fade'); if(f){ f.style.transition='opacity .55s'; f.style.opacity='1'; }
  G.emit('northIsleFinds:wade',{}); }
function wadeStep(dt){ if(!WAD.on)return; WAD.t+=dt; const P=G.player;
  if(WAD.t>.6&&!WAD.moved){ WAD.moved=true; const s=SITES.stands.barStart, yaw=Math.atan2(-NI.cove.dir.x,-NI.cove.dir.z)+.6;
    P.teleport(s.x,G.floorAt(s.x,s.z,s.y+2),s.z,yaw); if(P.aimCamera)P.aimCamera(yaw,.25);
    const f=document.getElementById('fade'); if(f){ f.style.transition='opacity .9s'; f.style.opacity='0'; }
    if(!S.said.waded){ S.said.waded=1; say(ONCE.waded.t,null,{flush:true,key:'nisf-waded'}); } else say('Back on the beach, soaked to the waist.',null,{flush:true,key:'nisf-waded2'}); }
  if(WAD.t>1.2){ WAD.on=false; WAD.moved=false; try{ P.setControl&&P.setControl(true); }catch(e){} } }
/* "Look home": a short held shot from the seat, out across the water to Hesper's light (G.cine, skippable); after the
   ending it turns round to the north light on the crag (gold, or dark) */
let lookOn=false;
function lookShot(st){
  const Cn=G.cine, lamp=homeLamp(); if(!Cn||!Cn.play||!isPlay())return false;
  const aim=lamp.clone(); aim.y-=60;   // aimed a little under the lamp: across 700 m that sets the light in the upper third, clear of the captions
  const g=H(LOOK.x,LOOK.z), fx=Math.sin(LOOK.yaw), fz=Math.cos(LOOK.yaw), eye=V(LOOK.x-fx*.4,g+2.9,LOOK.z-fz*.4);
  const T=NI.tower, fire=V(T.x,T.base+T.h-3.5,T.z), after=st==='lived'||st==='died';
  const P=G.player, mv=!!(P&&P.model&&P.model.visible);
  S.looks=(S.looks|0)+1;
  const ok=Cn.play('nifLook:'+S.looks,{dur:after?7.2:5,shot:(k,t,o)=>{ if(P&&P.model)P.model.visible=false;
      const e=smooth(0,1,after?Math.min(1,k/.55):k); o.cp.copy(eye).add(_lk.set(fx*1.3*e,-.1*e,fz*1.3*e));
      if(after){ const turn=smooth(.55,.92,k); _lt.copy(aim).lerp(fire,turn); o.cp.y+=.25*turn; o.lp.copy(_lt); o.fov=lerp(26,46,turn); }
      else { o.lp.copy(aim); o.fov=lerp(32,24,smooth(0,1,k)); } },
    onEnd:()=>{ lookOn=false; if(P&&P.model&&mv)P.model.visible=true; }});
  if(ok)lookOn=true; return ok;
}
const _lk=V(0,0,0), _lt=V(0,0,0);
function lookHome(){ const st=stage(); const L=read('look'); lookShot(st); return L; }

/* ================================================================ 8. WHAT THE COMPANIONS BRING (companions.js: spotReward) */
function companionFind(id){
  const what=id==='grotto'?'bottle':id==='stack'?'ribbon':null; if(!what)return false;
  const st=stage(); S.found[what]=st;
  const NM=(G.companions&&G.companions.names)||{ember:'Ember',corvin:'Corvin'};
  const card=what==='bottle'?{id:'bottle',icon:'note',name:'A bottle with a note',eyebrow:NM.ember+' · the cleft on the north cliffs',desc:'Out of the grotto under the cliffs, dragged up through the rock by a very wet fox: an old bottle, the wax on its cork still whole.'}
    :{id:'ribbon',icon:'note',name:'A child’s ribbon',eyebrow:NM.corvin+' · the gull stack',desc:'A strip of hair ribbon faded from red to rust, pulled out of an old gull’s nest on the stack and dropped in your hand.'};
  try{ if(G.progress&&G.progress.reward)G.progress.reward(card); else G.ui.toast(card.name,card.eyebrow); }catch(e){}
  later(2.4,()=>read(what));
  G.emit('northIsleFinds:found',{id:what,stage:st});
  return true;
}

/* ================================================================ 9. SAVE */
function load(d){ if(!d||typeof d!=='object')return; S.read=Object.assign({},d.read||{}); S.seen=Object.assign({},d.seen||{}); S.said=Object.assign({},d.said||{});
  S.found=Object.assign({},d.found||{}); S.heart=!!d.heart; S.looks=Math.max(0,d.looks|0); }
const reg=()=>G.persist&&G.persist.register&&G.persist.register('northIsleFinds',{save:()=>({v:1,read:Object.assign({},S.read),seen:Object.assign({},S.seen),said:Object.assign({},S.said),found:Object.assign({},S.found),heart:!!S.heart,looks:S.looks|0}),load});
if(G.persist&&G.persist.register)reg(); else G.on('ready',reg);
G.on('game:reset',()=>{ S.read={}; S.seen={}; S.said={}; S.found={}; S.heart=false; S.looks=0; });

/* ================================================================ 10. WIRING */
const hullP=p=>{ const l=toL(p.x,p.z); return inHull(l.x,l.z)&&p.y>DECK-1.2&&p.y<DECK+3; };
// out there only thanks to the bar: where the island's own rule (wading depth over its natural ground) wouldn't hold him
const siteP=p=>!!p&&nearSite(p.x,p.z)&&p.y>-2.2&&p.y<2.5&&(barInfo(p.x,p.z).d<BW+.35||hullP(p))&&NI.height(p.x,p.z)<-1.2+(G.world.tide||0)-.02;
let shoreT=0, turnCyc=-1;
G.system('northIsleFinds',{order:18,modes:['play','paused','dead','title'],
  init(){
    try{ build(); }catch(e){ console.error('northIsleFinds',e); }
    const IA=G.interact, en=()=>isPlay()&&onIsle()&&!(NI.crossing)&&!WAD.on&&!lookOn;
    IA.add({pos:()=>SITES.reads.berth,radius:1.7,priority:5,label:()=>labelOf('berth'),enabled:()=>en()&&dry(),use:()=>read('berth')});
    IA.add({pos:()=>SITES.reads.look,radius:2.0,priority:4,label:'Look home',enabled:en,use:lookHome});
  },
  update(dt){
    for(let i=timers.length-1;i>=0;i--){ if((G.time||0)>=timers[i].t){ const f=timers[i].fn; timers.splice(i,1); try{ f(); }catch(e){ console.error(e); } } }
    const cam=G.camera&&G.camera.position;
    if(root&&cam){ root.visible=Math.hypot(cam.x-C.x,cam.z-C.z)<300&&cam.y>-30&&!(G.northCave&&G.northCave.inside)&&!(G.northFire&&G.northFire.inside);
      if(root.visible&&foam){ const t=G.time||0; foam.position.y=(G.world.seaLevel||G.world.tide||0)+.05; foamMat.opacity=.38+.1*Math.sin(t*1.3); if(foamMat.map)foamMat.map.offset.x=t*.02; } }
    if(G.state.mode!=='play'&&G.state.mode!=='dead')return;
    wadeStep(dt||0);
    if(lookOn&&G.cine&&!G.cine.on)lookOn=false;
    if(!onIsle())return;
    const P=G.player, p=P.pos, st=stage();
    askHeart(dt);
    if(G.state.mode!=='play')return;
    // the tide: caught out there as it comes in → wade back; a warning while it turns
    const on=siteP(p), d=dry();
    if(on&&!d&&!WAD.on&&P.alive!==false)wade();
    if(on&&d&&G.tide&&G.tide.rising&&(G.world.tide||0)>BAR_DRY-.12){ const cyc=Math.floor((G.tide.t||0)/300); if(cyc!==turnCyc){ turnCyc=cyc; say(ONCE.turning,'Rowan',{flush:true,key:'nisf-turning'}); } }
    // arriving at her (by her side on the bar, or in her hold): a few lines, once per stage
    if(d&&!WAD.on){ const l=toL(p.x,p.z), near=(hullP(p)||(onBar(p.x,p.z)&&Math.hypot(l.x,l.z+1.8)<4.2));
      if(near&&!S.seen['wreck:'+st]){ S.seen['wreck:'+st]=1; read('wreck'); } }
    // from the beach: what the tide shows of her (once each)
    shoreT-=dt||0; if(shoreT<=0){ shoreT=.5;
      const bx=p.x-WK.x, bz=p.z-WK.z, dist=Math.hypot(bx,bz);
      if(dist<34&&!on&&p.y>-1.5&&p.y<6){ if(!d)sayOnce('tideHigh'); else if(!S.seen['wreck:before']&&!S.seen['wreck:'+st])sayOnce('tideLow'); }
      // the gaps the companions can get into (only while the job's still there)
      const CS=G.companions&&G.companions.state&&G.companions.state.spots||{};
      const g=companionSpots.grotto; if(!CS.grotto&&Math.hypot(p.x-g.stand.x,p.z-g.stand.z)<3.6)sayOnce('cleft');
      const s=companionSpots.stack; if(!CS.stack&&Math.hypot(p.x-s.stand.x,p.z-s.stand.z)<4.5)sayOnce('stack'); }
  }
});

G.northIsleFinds={state:S,sites:SITES,companionSpots,companionFind,stage,dry,
  debug:{ read:id=>id==='look'?lookHome():read(id), tideTo, stage, dry, lines:(id,st)=>linesOf(id,st).map(l=>l.t), ids:IDS.slice(), reads:READS, once:ONCE, label:labelOf,
    all(){ const o={}; for(const id of IDS){ o[id]={}; for(const st of ['before','known','lived','died'])o[id][st]=linesOf(id,st).map(l=>l.t); } return o; },
    barInfo, barY, toW, toL, inHull, onSite:p=>siteP(p||(G.player&&G.player.pos)), wading:()=>WAD.on, get looking(){ return lookOn; }, BI, BAR, BW, BAR_DRY, LOOK, CLEFT, STACK, get built(){ return built; }, get root(){ return root; } }};
})();

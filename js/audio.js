/* =====================================================================
   audio.js — synthesized ambience and sound effects, plus adaptive music
   built on Heath's "Bravequest Theme" (Suno). The recording plays as three
   sample-aligned looping stem groups (audio/bq-core|rhythm|power.mp3) plus a
   calm intro excerpt for the title (audio/bq-title.mp3), and their gains
   follow the game state. Generative synth layers are retuned to the theme
   (6/8, D minor, his chord chart and leitmotif). They play accents on the
   recording's beat grid, and they are the full fallback score if the files
   can't be fetched or decoded.
   It only listens: events from the other modules plus a light poll of
   player / monster state.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const AC=window.AudioContext||window.webkitAudioContext;
if(!AC){ G.audio={ready:false}; return; }

/* ---------- settings (remembered per viewer) ---------- */
const settings={volume:.8,music:.65,muted:false};
try{ const s=JSON.parse(localStorage.getItem('bq-audio')||'null'); if(s)Object.assign(settings,s); }catch(_){}
const save=()=>{ try{localStorage.setItem('bq-audio',JSON.stringify(settings));}catch(_){} };

let ctx=null, master, duck, masterLP, comp, sfxBus, ambBus, musicBus, synthBus, reverb, revSend, noiseBuf, brownBuf;
const layers={};
const LAYER_NAMES=['title','explore','forest','tower','combat','boss'];

/* ---------- graph ---------- */
function build(){
  ctx=new AC();
  comp=ctx.createDynamicsCompressor(); comp.threshold.value=-14; comp.knee.value=12; comp.ratio.value=3.5; comp.attack.value=.004; comp.release.value=.25;
  masterLP=ctx.createBiquadFilter(); masterLP.type='lowpass'; masterLP.frequency.value=20000; masterLP.Q.value=.5;
  duck=ctx.createGain(); master=ctx.createGain();
  master.connect(duck); duck.connect(masterLP); masterLP.connect(comp); comp.connect(ctx.destination);
  sfxBus=ctx.createGain(); ambBus=ctx.createGain(); musicBus=ctx.createGain();
  sfxBus.connect(master); ambBus.connect(master); musicBus.connect(master);
  // reverb: generated impulse, a soft stone hall
  reverb=ctx.createConvolver(); reverb.buffer=impulse(2.6,2.4); revSend=ctx.createGain(); revSend.gain.value=.22;
  revSend.connect(reverb); reverb.connect(master);
  // synth music gets the stone-hall reverb; the recording (already mixed) goes to musicBus dry
  synthBus=ctx.createGain(); synthBus.connect(musicBus);
  const mSend=ctx.createGain(); mSend.gain.value=.55; synthBus.connect(mSend); mSend.connect(reverb);
  const aSend=ctx.createGain(); aSend.gain.value=.15; ambBus.connect(aSend); aSend.connect(reverb);
  sfxBus.connect(revSend);
  // noise buffers
  const n=ctx.sampleRate*2; noiseBuf=ctx.createBuffer(1,n,ctx.sampleRate); brownBuf=ctx.createBuffer(1,n,ctx.sampleRate);
  const w=noiseBuf.getChannelData(0), b=brownBuf.getChannelData(0); let last=0;
  for(let i=0;i<n;i++){ w[i]=Math.random()*2-1; last=(last+.02*w[i])/1.02; b[i]=last*3.5; }
  for(const k of LAYER_NAMES){ const g=ctx.createGain(); g.gain.value=0; g.connect(synthBus); layers[k]={gain:g,w:0}; }
  buildAmbience();
  buildRecording();
  applyVolume();
}
function impulse(sec,decay){
  const len=Math.floor(ctx.sampleRate*sec), buf=ctx.createBuffer(2,len,ctx.sampleRate);
  for(let c=0;c<2;c++){ const d=buf.getChannelData(c); for(let i=0;i<len;i++){ d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay); } }
  return buf;
}
function applyVolume(){
  if(!ctx)return;
  const t=ctx.currentTime, v=settings.muted?0:settings.volume;
  master.gain.setTargetAtTime(v*.9,t,.05);
  musicBus.gain.setTargetAtTime(settings.music*.8,t,.05);
  sfxBus.gain.setTargetAtTime(1,t,.05); ambBus.gain.setTargetAtTime(.9,t,.05);
}
let unlockedAt=0;
function unlock(){
  if(!ctx){ try{build(); unlockedAt=ctx.currentTime; decodeAllSfx();}catch(e){console.warn('audio init failed',e);return;} }
  if(ctx.state==='suspended')ctx.resume();
}
addEventListener('pointerdown',unlock,true);
addEventListener('keydown',e=>{ unlock(); if(e.code==='KeyM'&&!e.repeat){ settings.muted=!settings.muted; save(); applyVolume(); syncUI(); if(G.ui&&G.ui.toast)G.ui.toast(settings.muted?'Sound off':'Sound on'); } },true);

/* ---------- small helpers ---------- */
const midi=m=>440*Math.pow(2,(m-69)/12);
function envGain(dest,t,a,peak,hold,rel){
  const g=ctx.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(peak,t+a);
  if(hold>0)g.gain.setValueAtTime(peak,t+a+hold);
  g.gain.exponentialRampToValueAtTime(.0001,t+a+hold+rel); g.connect(dest); return g;
}
function osc(type,f,t,stop,dest){ const o=ctx.createOscillator(); o.type=type; o.frequency.setValueAtTime(f,t); if(dest)o.connect(dest); o.start(t); o.stop(stop); return o; }
function noise(t,dur,dest,brown){ const s=ctx.createBufferSource(); s.buffer=brown?brownBuf:noiseBuf; s.connect(dest); s.start(t,Math.random()*1.5,dur+.05); return s; }
function filt(type,f,Q,dest){ const b=ctx.createBiquadFilter(); b.type=type; b.frequency.value=f; b.Q.value=Q||.7; b.connect(dest); return b; }
/** positional output for a world point; returns a node to connect sources to */
function at(pos,ref=4){
  if(!pos)return sfxBus;
  const p=ctx.createPanner(); p.panningModel='equalpower'; p.distanceModel='inverse'; p.refDistance=ref; p.maxDistance=80; p.rolloffFactor=1.3;
  if(p.positionX){p.positionX.value=pos.x;p.positionY.value=pos.y;p.positionZ.value=pos.z;} else p.setPosition(pos.x,pos.y,pos.z);
  p.connect(sfxBus); return p;
}
function setListener(){
  const c=G.camera, L=ctx.listener; c.updateMatrixWorld();
  const e=c.matrixWorld.elements, fx=-e[8],fy=-e[9],fz=-e[10], ux=e[4],uy=e[5],uz=e[6], p=c.position;
  if(L.positionX){ const t=ctx.currentTime;
    L.positionX.setTargetAtTime(p.x,t,.02);L.positionY.setTargetAtTime(p.y,t,.02);L.positionZ.setTargetAtTime(p.z,t,.02);
    L.forwardX.setTargetAtTime(fx,t,.02);L.forwardY.setTargetAtTime(fy,t,.02);L.forwardZ.setTargetAtTime(fz,t,.02);
    L.upX.setTargetAtTime(ux,t,.02);L.upY.setTargetAtTime(uy,t,.02);L.upZ.setTargetAtTime(uz,t,.02);
  }else{ L.setPosition(p.x,p.y,p.z); L.setOrientation(fx,fy,fz,ux,uy,uz); }
}

/* ---------- sound effect palette ---------- */
const S={
  whoosh(t,o={}){ const dur=o.dur||.28, out=o.dest||sfxBus;
    const g=envGain(out,t,dur*.35,o.g||.35,0,dur*.8); const b=filt('bandpass',o.f0||600,o.Q||1.4,g);
    b.frequency.setValueAtTime(o.f0||600,t); b.frequency.exponentialRampToValueAtTime(o.f1||2400,t+dur*.4); b.frequency.exponentialRampToValueAtTime((o.f1||2400)*.5,t+dur);
    noise(t,dur*1.3,b); },
  thud(t,o={}){ const out=o.dest||sfxBus, dur=o.dur||.28;
    const g=envGain(out,t,.004,o.g||.6,0,dur); const s=osc('sine',o.f0||130,t,t+dur+.05,g); s.frequency.exponentialRampToValueAtTime(o.f1||45,t+dur*.8);
    const g2=envGain(out,t,.002,(o.g||.6)*(o.click==null?.35:o.click),0,.07); noise(t,.08,filt('lowpass',o.nf||1800,.7,g2)); },
  chime(t,notes,o={}){ const out=o.dest||sfxBus; notes.forEach((m,i)=>{ const tt=t+i*(o.step||.09);
    const g=envGain(out,tt,.004,(o.g||.18),0,o.decay||1.6); osc('sine',midi(m),tt,tt+(o.decay||1.6)+.1,g);
    const g2=envGain(out,tt,.004,(o.g||.18)*.25,0,(o.decay||1.6)*.5); osc('sine',midi(m)*2.76,tt,tt+(o.decay||1.6),g2); }); },
  bell(t,m,o={}){ const out=o.dest||sfxBus, f=midi(m), d=o.decay||3.5;
    [[1,1,d],[2.76,.4,d*.6],[5.4,.2,d*.35],[.5,.25,d*.8]].forEach(([r,a,dd])=>{const g=envGain(out,t,.006,(o.g||.25)*a,0,dd);osc('sine',f*r,t,t+dd+.1,g);}); },
  sparkle(t,o={}){ for(let i=0;i<7;i++){ const tt=t+i*.045+Math.random()*.02; const g=envGain(o.dest||sfxBus,tt,.002,(o.g||.08),0,.35); osc('sine',2000+Math.random()*3500,tt,tt+.4,g);} },
  clank(t,o={}){ const out=o.dest||sfxBus; [1,1.48,2.3,3.1].forEach((r,i)=>{const g=envGain(out,t,.001,(o.g||.12)/(i+1),0,.35-i*.05);osc('square',(o.f||520)*r,t,t+.4,filt('bandpass',(o.f||520)*r,6,g));}); S.thud(t,{g:(o.g||.12)*1.4,f0:240,f1:120,dur:.08,dest:out}); },
  rumble(t,o={}){ const out=o.dest||sfxBus, dur=o.dur||1.6; const g=envGain(out,t,o.a||.25,o.g||.5,dur*.3,dur*.7);
    const s=osc('sawtooth',o.f0||48,t,t+dur*1.1,filt('lowpass',o.lp||260,1,g)); s.frequency.exponentialRampToValueAtTime(o.f1||32,t+dur);
    noise(t,dur,filt('lowpass',180,.7,g),true); },
  growl(t,o={}){ const out=o.dest||sfxBus, dur=o.dur||.7; const g=envGain(out,t,.08,o.g||.25,dur*.4,dur*.5);
    const lp=filt('lowpass',o.lp||520,2,g); const s=osc('sawtooth',o.f||72,t,t+dur+.1,lp);
    const am=ctx.createGain(); am.gain.value=(o.f||72)*.18; osc('sine',o.trem||23,t,t+dur+.1,am); am.connect(s.frequency);
    noise(t,dur,filt('bandpass',o.nf||700,2,envGain(out,t,.05,(o.g||.25)*.5,dur*.4,dur*.5))); },
  hiss(t,o={}){ const out=o.dest||sfxBus, dur=o.dur||.7; const g=envGain(out,t,dur*.7,o.g||.22,0,.25);
    const b=filt('bandpass',o.f0||500,o.Q||3,g); b.frequency.setValueAtTime(o.f0||500,t); b.frequency.exponentialRampToValueAtTime(o.f1||3200,t+dur); noise(t,dur+.3,b); },
  moan(t,o={}){ const out=o.dest||sfxBus, dur=o.dur||1.6; const g=envGain(out,t,.4,o.g||.14,dur*.3,dur*.5);
    const b1=filt('bandpass',650,7,g), b2=filt('bandpass',1050,9,g);
    const s=ctx.createOscillator(); s.type='sawtooth'; s.frequency.setValueAtTime(o.f||180,t); s.frequency.linearRampToValueAtTime((o.f||180)*.78,t+dur);
    s.connect(b1); s.connect(b2); s.start(t); s.stop(t+dur+.2); },
  howl(t,o={}){ const out=o.dest||sfxBus, dur=o.dur||1.5; const g=envGain(out,t,.25,o.g||.12,dur*.5,dur*.4);
    const s=ctx.createOscillator(); s.type='triangle'; s.frequency.setValueAtTime(380,t); s.frequency.linearRampToValueAtTime(620,t+dur*.35); s.frequency.linearRampToValueAtTime(470,t+dur);
    const v=ctx.createGain(); v.gain.value=9; osc('sine',6,t,t+dur+.2,v); v.connect(s.frequency); s.connect(filt('lowpass',1400,1,g)); s.start(t); s.stop(t+dur+.2); },
  shriek(t,o={}){ const out=o.dest||sfxBus; const g=envGain(out,t,.01,o.g||.14,.05,.25);
    const s=osc('sawtooth',o.f||900,t,t+.4,filt('bandpass',1800,3,g)); s.frequency.exponentialRampToValueAtTime((o.f||900)*.55,t+.3); noise(t,.3,filt('highpass',2500,.7,envGain(out,t,.01,(o.g||.14)*.6,0,.25))); },
  dissolve(t,o={}){ const out=o.dest||sfxBus, dur=o.dur||1.3; S.hiss(t,{dest:out,dur,f0:3500,f1:280,g:o.g||.22,Q:1.2});
    for(let i=0;i<6;i++){const tt=t+i*dur/7; const g=envGain(out,tt,.003,.05,0,.3); osc('sine',1400-i*160,tt,tt+.35,g);} },
  voice(t,syll,o={}){ // gravelly "speech" babble for Halloran
    const out=o.dest||sfxBus; let tt=t;
    for(let i=0;i<syll;i++){ const d=.09+Math.random()*.1, f=(o.f||96)*(.85+Math.random()*.35);
      const g=envGain(out,tt,.015,(o.g||.09),d*.4,d*.5); const s=osc('sawtooth',f,tt,tt+d+.05,null);
      const f1=filt('bandpass',400+Math.random()*500,5,g), f2=filt('bandpass',1000+Math.random()*900,7,g); s.connect(f1); s.connect(f2);
      noise(tt,d,filt('bandpass',2600,1.5,envGain(out,tt,.01,(o.g||.09)*.35,0,d)));
      tt+=d+.03+(Math.random()<.18?.12:0); } },
  step(t,surf,g){ const out=sfxBus, k=g||.12;
    if(surf==='stone'){ noise(t,.05,filt('bandpass',2600,1.2,envGain(out,t,.001,k*1.1,0,.06))); S.thud(t,{g:k*.6,f0:180,f1:90,dur:.06,click:0}); }
    else if(surf==='leaves'){ for(let i=0;i<3;i++){const tt=t+i*.018; noise(tt,.05,filt('highpass',2400+Math.random()*1500,.7,envGain(out,tt,.001,k*.5,0,.05)));} noise(t,.12,filt('lowpass',900,.7,envGain(out,t,.004,k*.7,0,.12))); }
    else if(surf==='sand'){ noise(t,.14,filt('lowpass',1100,.7,envGain(out,t,.01,k*.9,0,.14))); }
    else { noise(t,.11,filt('bandpass',1400,.9,envGain(out,t,.006,k*.8,0,.1))); noise(t,.06,filt('lowpass',400,.7,envGain(out,t,.002,k*.5,0,.07))); } }
};

/* ---------- ambience (continuous nodes, levels follow the world) ---------- */
const amb={};
function loopNoise(dest,brown){ const s=ctx.createBufferSource(); s.buffer=brown?brownBuf:noiseBuf; s.loop=true; s.connect(dest); s.start(); return s; }
function buildAmbience(){
  // wind: two decorrelated noise beds (L/R, independent gust envelopes) into a
  // location-level gain, plus a whistling band that only shows on big gusts
  amb.windG=ctx.createGain(); amb.windG.gain.value=0; amb.windG.connect(ambBus);
  const windSide=(pan,off)=>{
    const p=ctx.createStereoPanner?ctx.createStereoPanner():null, g=ctx.createGain(); g.gain.value=0;
    if(p){ p.pan.value=pan; g.connect(p); p.connect(amb.windG); } else g.connect(amb.windG);
    const f=filt('bandpass',300,1.2,g), s=ctx.createBufferSource(); s.buffer=noiseBuf; s.loop=true; s.connect(f); s.start(ctx.currentTime,off);
    return {g,f,p};
  };
  const wl=windSide(-.5,0), wr=windSide(.5,.93);
  amb.windL=wl.g; amb.windFL=wl.f; amb.windPL=wl.p; amb.windR=wr.g; amb.windFR=wr.f; amb.windPR=wr.p;
  amb.windF=amb.windFL;
  amb.level=()=>amb.windG.gain.value*Math.hypot(amb.windL.gain.value,amb.windR.gain.value);
  amb.whistleG=ctx.createGain(); amb.whistleG.gain.value=0; amb.whistleG.connect(ambBus);
  amb.whistleF=filt('bandpass',1300,9,amb.whistleG); loopNoise(amb.whistleF);
  // surf: brown noise, low-passed, swelling
  amb.surfG=ctx.createGain(); amb.surfG.gain.value=0; amb.surfG.connect(ambBus);
  amb.surfF=filt('lowpass',650,.6,amb.surfG); loopNoise(amb.surfF,true);
  // dark-tower drone
  amb.droneG=ctx.createGain(); amb.droneG.gain.value=0; amb.droneG.connect(ambBus);
  const dl=filt('lowpass',230,1.2,amb.droneG);
  [36.7,36.95,55.1].forEach(f=>{const o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f; o.connect(dl); o.start();});
  // corruption hum near black patches
  amb.humG=ctx.createGain(); amb.humG.gain.value=0; amb.humG.connect(ambBus);
  const hl=filt('lowpass',160,2,amb.humG);
  [49,51.3].forEach(f=>{const o=ctx.createOscillator(); o.type='triangle'; o.frequency.value=f; o.connect(hl); o.start();});
  loopNoise(filt('bandpass',90,3,hl),true);
  // moth flutter: bright noise amplitude-modulated at wingbeat rate
  amb.mothG=ctx.createGain(); amb.mothG.gain.value=0; amb.mothG.connect(ambBus);
  const mAM=ctx.createGain(); mAM.gain.value=.5; mAM.connect(amb.mothG);
  const lfo=ctx.createOscillator(); lfo.frequency.value=24; const lfoG=ctx.createGain(); lfoG.gain.value=.5; lfo.connect(lfoG); lfoG.connect(mAM.gain); lfo.start();
  amb.mothLfo=lfo;
  loopNoise(filt('bandpass',3200,1.1,mAM));
  // glide wind rush (separate so it can be loud)
  amb.rushG=ctx.createGain(); amb.rushG.gain.value=0; amb.rushG.connect(ambBus);
  loopNoise(filt('lowpass',900,.7,amb.rushG));
  // charge hum for the staff
  amb.chargeG=ctx.createGain(); amb.chargeG.gain.value=0; amb.chargeG.connect(sfxBus);
  amb.chargeO=ctx.createOscillator(); amb.chargeO.type='triangle'; amb.chargeO.frequency.value=220; amb.chargeO.connect(filt('lowpass',1800,2,amb.chargeG)); amb.chargeO.start();
  const c2=ctx.createOscillator(); c2.type='sine'; c2.frequency.value=443; c2.connect(amb.chargeG); c2.start(); amb.chargeO2=c2;
}
const tgt=(param,v,tc=.4)=>param.setTargetAtTime(v,ctx.currentTime,tc);

/* ---------- coastal wind envelope ----------
   Runs on audio time so it keeps real-world pacing whatever the frame rate.
   env = (slow swell + gust events + small per-side puffs) x lull, all scalars
   and preallocated slots: nothing is allocated per frame. */
const rnd=(a,b)=>a+Math.random()*(b-a);
const sstep=x=>x<=0?0:x>=1?1:x*x*(3-2*x);
function gustSlot(){ return {t0:-1e9,a:1,h:0,r:1,s:0}; }
function gustVal(g,T){ const x=T-g.t0; if(x<=0)return 0;
  if(x<g.a)return g.s*sstep(x/g.a); if(x<g.a+g.h)return g.s;
  const y=(x-g.a-g.h)/g.r; return y>=1?0:g.s*(1-sstep(y)); }
// generator = current + previous slot (so a new gust can rise through the tail of the last one)
function gustGen(){ return {cur:gustSlot(),prev:gustSlot(),next:0}; }
function genVal(G2,T){ const a=gustVal(G2.cur,T), b=gustVal(G2.prev,T); return a>b?a:b; }
function genFire(G2,T,s,a,h,r){ const p=G2.prev; G2.prev=G2.cur; G2.cur=p; p.t0=T; p.s=s; p.a=a; p.h=h; p.r=r; }
const wnd={init:false, mainL:gustGen(), mainR:gustGen(), puffL:gustGen(), puffR:gustGen(),
  rLag:.4, lullT0:-1e9, lullDur:0, lullNext:0, ph1:Math.random()*6.3, ph2:Math.random()*6.3, ph3:Math.random()*6.3,
  envL:0, envR:0, gustNow:0, peakFired:true, rustleAt:0};
function lullMul(T){ // 1 normally, ~0.04 inside a lull (eases in 1.5 s, out 2 s)
  const x=T-wnd.lullT0; if(x<0||x>wnd.lullDur)return 1;
  const k=Math.min(sstep(x/1.5),sstep((wnd.lullDur-x)/2)); return 1-.96*k; }
function windEnv(T){
  const W=wnd;
  if(!W.init){ W.init=true; W.mainL.next=T+rnd(1,3); W.puffL.next=T+rnd(.5,2); W.puffR.next=T+rnd(.5,2); W.lullNext=T+rnd(14,26); }
  // lulls: every ~15-35 s the wind falls away almost to nothing for 3-7 s
  if(T>=W.lullNext){ W.lullT0=T; W.lullDur=rnd(3.5,7.5); W.lullNext=T+W.lullDur+rnd(12,30);
    if(W.mainL.next<T+W.lullDur)W.mainL.next=T+W.lullDur+rnd(.3,1.5); }
  // main gust events: build 1-3 s, hold briefly, die away 2-5 s; ~10% are big ones
  if(T>=W.mainL.next){
    const big=Math.random()<.1, s=big?rnd(.85,1.1):rnd(.25,.7), a=rnd(1,3), h=rnd(.2,big?1.6:.9), r=rnd(2,5);
    genFire(W.mainL,T,s*rnd(.85,1.1),a,h,r);
    W.rLag=rnd(-.6,.6); genFire(W.mainR,T+W.rLag,s*rnd(.85,1.1),a*rnd(.8,1.2),h,r*rnd(.8,1.2));
    W.mainL.next=T+a+h+rnd(.5,big?4:6); W.peakFired=false; W.rustleAt=T+Math.max(a,a+W.rLag)+h*.4;
  }
  // independent small puffs per side keep the stereo image moving
  if(T>=W.puffL.next){ const a=rnd(.6,1.6); genFire(W.puffL,T,rnd(.1,.35),a,rnd(0,.4),rnd(1,2.5)); W.puffL.next=T+a+rnd(1,4); }
  if(T>=W.puffR.next){ const a=rnd(.6,1.6); genFire(W.puffR,T,rnd(.1,.35),a,rnd(0,.4),rnd(1,2.5)); W.puffR.next=T+a+rnd(1,4); }
  // slow swell, periods ~9-20 s
  const sw=.5+.5*(.5*Math.sin(T*.36+W.ph1)+.3*Math.sin(T*.62+W.ph2)+.2*Math.sin(T*.47+W.ph3));
  const base=.08+.5*sw, lm=lullMul(T);
  const gL=genVal(W.mainL,T), gR=genVal(W.mainR,T);
  // soft ceiling so the rare big gusts swell without jumping out of the mix
  W.envL=1.2*Math.tanh((base+gL+.6*genVal(W.puffL,T))*lm/1.2);
  W.envR=1.2*Math.tanh((base+gR+.6*genVal(W.puffR,T))*lm/1.2);
  W.gustNow=(gL>gR?gL:gR)*lm;
}
function rustle(T,gain){ // grass / cloth flutter as a strong gust peaks
  const n=3+(Math.random()*4|0);
  for(let i=0;i<n;i++){ const tt=T+i*rnd(.06,.16), d=rnd(.08,.22), pan=ctx.createStereoPanner?ctx.createStereoPanner():null;
    const g=envGain(pan||ambBus,tt,d*.4,gain*rnd(.5,1),0,d); if(pan){pan.pan.value=rnd(-.8,.8); pan.connect(ambBus);}
    noise(tt,d+.05,filt('bandpass',rnd(2600,5200),rnd(.9,2),g)); }
}

let surfLevel=0, surfT=0, nearMoths=0, mothT=0, cricketT=0, owlT=6, creakT=10, humLevel=0;
function sampleSurf(p){
  let wet=0,n=0;
  for(const r of [16,34,60]) for(let i=0;i<12;i++){ const a=i/12*Math.PI*2; n++; if(G.world.height(p.x+Math.cos(a)*r,p.z+Math.sin(a)*r)<.4)wet+=r===16?1.6:r===34?1:.6; }
  return U.clamp(wet/n,0,1);
}
function updateAmbience(dt,ref,mode){
  const P=G.player, lh=G.world.lighthouse;
  const inside=mode!=='title'&&lh&&lh.inside?lh.inside(P.pos):false;
  const inBody=mode!=='title'&&lh&&lh.inBody?lh.inBody(P.pos):false;
  const forest=G.world.inForest?G.world.inForest(ref.x):ref.x<-70;
  const cured=G.atmo.cured||0;
  surfT-=dt; if(surfT<=0){surfT=.5; surfLevel=sampleSurf(ref);}
  const alt=U.smooth(14,44,ref.y), T=ctx.currentTime;
  windEnv(T);
  // location level (about half the old bed on the headland); gusts ride on top via the side gains
  let wind=.16+alt*.16; if(forest)wind*=.45; if(inBody)wind*=.08; else if(inside)wind*=.5;
  tgt(amb.windG.gain,wind*(1-cured*.25),.8);
  const eL=wnd.envL, eR=wnd.envR, k=Math.SQRT1_2;
  tgt(amb.windL.gain,eL*k,.25); tgt(amb.windR.gain,eR*k,.25);
  // gusts brighter and broader (whooshy), lulls low, narrow and soft
  tgt(amb.windFL.frequency,210+Math.min(eL,1.6)*560+alt*120,.35); tgt(amb.windFL.Q,1.5-.95*Math.min(eL,1),.4);
  tgt(amb.windFR.frequency,230+Math.min(eR,1.6)*540+alt*120,.35); tgt(amb.windFR.Q,1.5-.95*Math.min(eR,1),.4);
  if(amb.windPL){ tgt(amb.windPL.pan,-.45-.3*Math.sin(T*.11+wnd.ph2),.5); tgt(amb.windPR.pan,.45+.3*Math.sin(T*.083+wnd.ph3),.5); }
  // whistle only on the strongest gusts, and quietly
  const gs=wnd.gustNow, wh=gs>.85?sstep((gs-.85)/.4):0;
  tgt(amb.whistleG.gain,(alt*wh*.012)*(inBody?0:1)*(forest?.3:1)*(inside?.5:1),.6);
  tgt(amb.whistleF.frequency,950+gs*700,1.2);
  // rustle burst as a strong gust peaks (outdoors only)
  if(!wnd.peakFired&&T>=wnd.rustleAt){ wnd.peakFired=true;
    if(gs>.7&&!inside&&mode!=='paused')rustle(T,.035*(.4+.6*alt)*(forest?.6:1)*(1-cured*.25)); }
  const swell=.55+.45*Math.sin(G.time*.75)*Math.sin(G.time*.31+1.3);
  tgt(amb.surfG.gain,surfLevel*(.3+.35*swell)*(inBody?.1:1),.5);
  tgt(amb.surfF.frequency,380+swell*620,.5);
  tgt(amb.droneG.gain,inBody?(.16*(1-cured*.85)):0,1.2);
  // corruption hum: nearest black patch
  let dmin=1e9; for(const q of (G.world.landmarks.patches||[])){const d=Math.hypot(q.x-ref.x,q.z-ref.z); if(d<dmin)dmin=d;}
  humLevel=U.damp(humLevel,mode==='title'?0:U.clamp(1-dmin/13,0,1),2,dt);
  tgt(amb.humG.gain,humLevel*.22,.3);
  // moths
  mothT-=dt; if(mothT<=0){ mothT=.25; nearMoths=(G.creatures&&G.creatures.swarmAt)?G.creatures.swarmAt(ref,6):0; }
  tgt(amb.mothG.gain,U.clamp(nearMoths/60,0,1)*.11,.3); amb.mothLfo.frequency.setTargetAtTime(20+Math.random()*10,ctx.currentTime,.1);
  // glide rush
  tgt(amb.rushG.gain,(mode==='play'&&P.gliding)?.12+U.clamp(Math.abs(P.vel?P.vel.y:0)/10,0,.1):0,.15);
  // night creatures, outdoors
  const t=ctx.currentTime;
  if(!inside&&mode!=='paused'){
    cricketT-=dt;
    if(cricketT<=0&&!forest&&ref.y<44){ cricketT=.25+Math.random()*1.1;
      const pos=new THREE.Vector3(ref.x+(Math.random()-.5)*24,ref.y,ref.z+(Math.random()-.5)*24), out=at(pos,6), n=2+(Math.random()*3|0), f=4200+Math.random()*700;
      for(let i=0;i<n;i++){const tt=t+i*.06; osc('sine',f,tt,tt+.05,envGain(out,tt,.004,.03*(1-cured*.3),0,.04));} }
    if(forest){ owlT-=dt; if(owlT<=0){ owlT=9+Math.random()*12; const pos=new THREE.Vector3(ref.x+(Math.random()-.5)*50,ref.y+8,ref.z+(Math.random()-.5)*50), out=at(pos,10);
        [[0,.42],[.55,.25],[.85,.55]].forEach(([d,len])=>{const tt=t+d; const s=osc('sine',390,tt,tt+len+.1,envGain(out,tt,.06,.07,len*.4,len*.5)); s.frequency.setValueAtTime(410,tt); s.frequency.linearRampToValueAtTime(360,tt+len);}); }
      creakT-=dt; if(creakT<=0){ creakT=7+Math.random()*10; const pos=new THREE.Vector3(ref.x+(Math.random()-.5)*30,ref.y+4,ref.z+(Math.random()-.5)*30), out=at(pos,8);
        const s=osc('sawtooth',70,t,t+1.4,filt('bandpass',420,4,envGain(out,t,.3,.05,.5,.5))); s.frequency.linearRampToValueAtTime(95,t+1.1); } }
  }
}

/* ---------- adaptive music: Heath's "Bravequest Theme" ----------
   Measured from the Suno stems (see the music agent's report):
   6/8 at 147.7 pulses/min (dotted-quarter = 73.8), bar = 2.4374 s, D minor.
   The game loop is song bars 9–40 (32 bars, 23.271–101.267 s of the song):
     verse  Dm | Am | Bb C | F | Gm | Dm | Bb | A   (x2, the 2nd ends Gm | Dm/C | C | Dm)
     lift   Bb | C | Dm | Dm | Bb | C | F | C/E
     chorus Bb | C | Am | Dm C | Gm | Gm | A | A   (half cadence back to the verse)
   Leitmotif (woodwind+brass theme, bars 9–10): D – E – F – E – C
     (dotted-quarter, eighth, quarter | quarter, dotted-half), answered by D – C – A.
   Chorus hook (vocals) restates it an octave up: D E~ C E F E C D~.            */
const PULSE=77.99630/32/6, BAR=PULSE*6, BEAT=PULSE*3;            // BEAT = dotted quarter
const REC={ files:['core','rhythm','power','title'], loopStart:.5, loopEnd:78.49630, titleLoopStart:.5, titleLoopEnd:22.55837, rawLen:78.99630 };
const CH={ Dm:{r:38,n:[62,65,69]}, Am:{r:45,n:[60,64,69]}, Bb:{r:34,n:[62,65,70]}, C:{r:36,n:[60,64,67]}, F:{r:41,n:[60,65,69]},
  Gm:{r:43,n:[62,67,70]}, A:{r:45,n:[61,64,69]}, CE:{r:40,n:[60,64,67]}, Dc:{r:36,n:[62,65,69]},
  D:{r:38,n:[62,66,69]}, G:{r:43,n:[62,67,71]}, Bm:{r:47,n:[62,66,71]}, Eb:{r:39,n:[63,67,70]}, Cs:{r:37,n:[61,64,67]} };
// one entry per bar; a pair = two chords, half a bar each
const CHART=['Dm','Am',['Bb','C'],'F','Gm','Dm','Bb','A',  'Dm','Am',['Bb','C'],'F','Gm','Dc','C','Dm',
             'Bb','C','Dm','Dm','Bb','C','F','CE',          'Bb','C','Am',['Dm','C'],'Gm','Gm','A','A'];
const CURED_MAP={Dm:'D',Am:'A',Bb:'G',C:'A',F:'D',Gm:'G',A:'A',CE:'A',Dc:'D'};
const BOSS_CHART=['Dm','Eb','Dm','Cs'];
const chordAt=(i,half,cured)=>{ let c=CHART[((i%32)+32)%32]; if(Array.isArray(c))c=c[half?1:0]; return CH[cured?CURED_MAP[c]:c]; };
const toMajor=m=>{ const pc=((m%12)+12)%12; return m+(pc===5||pc===0||pc===10?1:0); };  // F→F#, C→C#, Bb→B (D major)
// [midi, pulse offset, length in pulses]
const MOTIF=[[62,0,3],[64,3,1],[65,4,2],[64,6,2],[60,8,4]];
const MOTIF_ANSWER=[[62,12,3],[60,15,1],[57,18,6]];
const MOTIF_CURED=[[62,0,3],[64,3,1],[66,4,2],[64,6,2],[69,8,4]];   // brightened: D E F# E A
const THEME=MOTIF.concat(MOTIF_ANSWER);                                 // loop bars 0–3 (and 8–11)
const HOOK=[[74,4,2],[76,6,6],[72,12,2],[76,14,2],[72,16,2],[77,18,2],[76,20,2],[72,23,1],[74,24,12]]; // from loop bar 24, pulse-relative
const SCALE_MIN=[74,76,77,79,81,82,84,86], SCALE_MAJ=[74,76,78,79,81,83,85,86];
const I={
  musicBox(dest,t,m,g){ const f=midi(m), p=ctx.createStereoPanner?ctx.createStereoPanner():null; let out=dest; if(p){p.pan.value=(Math.random()-.5)*.6;p.connect(dest);out=p;}
    osc('sine',f,t,t+2.2,envGain(out,t,.004,g,0,1.9)); osc('sine',f*3,t,t+.9,envGain(out,t,.002,g*.18,0,.7)); osc('triangle',f*2,t,t+1.2,envGain(out,t,.003,g*.12,0,1)); },
  harp(dest,t,m,g){ const f=midi(m); const lp=filt('lowpass',5000,1,envGain(dest,t,.004,g,0,1.6)); lp.frequency.setValueAtTime(5200,t); lp.frequency.exponentialRampToValueAtTime(700,t+.5); osc('triangle',f,t,t+1.8,lp); osc('sine',f*2,t,t+.8,envGain(dest,t,.003,g*.2,0,.5)); },
  pad(dest,t,notes,dur,g,cut){ const lp=filt('lowpass',cut||900,.8,envGain(dest,t,Math.min(1.1,dur*.4),g,Math.max(0,dur-1.1),1.6));
    for(const m of notes){ osc('sawtooth',midi(m),t,t+dur+1.8,lp); osc('sawtooth',midi(m)*1.0045,t,t+dur+1.8,lp); } },
  bass(dest,t,m,dur,g){ const lp=filt('lowpass',300,1,envGain(dest,t,.3,g,dur*.6,dur*.5)); osc('triangle',midi(m),t,t+dur+.2,lp); osc('sine',midi(m)/2,t,t+dur+.2,lp); },
  cello(dest,t,m,dur,g){ const lp=filt('lowpass',950,1.2,envGain(dest,t,.07,g,Math.max(0,dur-.15),.22)); const s=osc('sawtooth',midi(m),t,t+dur+.4,lp);
    const v=ctx.createGain(); v.gain.value=midi(m)*.006; osc('sine',5.4,t,t+dur+.4,v); v.connect(s.frequency); },
  horn(dest,t,m,dur,g){ const lp=filt('lowpass',1400,.9,envGain(dest,t,.06,g,Math.max(0,dur-.1),.35)); lp.frequency.setValueAtTime(500,t); lp.frequency.linearRampToValueAtTime(1500,t+.12);
    osc('sawtooth',midi(m),t,t+dur+.5,lp); osc('sawtooth',midi(m)*1.004,t,t+dur+.5,lp); osc('triangle',midi(m)/2,t,t+dur+.5,lp); },
  drum(dest,t,g,f0){ const s=osc('sine',f0||105,t,t+.5,envGain(dest,t,.002,g,0,.42)); s.frequency.exponentialRampToValueAtTime((f0||105)*.38,t+.22);
    noise(t,.06,filt('lowpass',900,.7,envGain(dest,t,.001,g*.35,0,.06))); },
  tap(dest,t,g){ noise(t,.05,filt('bandpass',3200,1.5,envGain(dest,t,.001,g,0,.05))); },
  choir(dest,t,notes,dur,g){ const out=envGain(dest,t,1.4,g,Math.max(0,dur-1.4),1.8);
    for(const m of notes){ const s=osc('sawtooth',midi(m),t,t+dur+2,null); s.connect(filt('bandpass',780,6,out)); s.connect(filt('bandpass',1150,8,out));
      const v=ctx.createGain(); v.gain.value=midi(m)*.004; osc('sine',4.6+Math.random(),t,t+dur+2,v); v.connect(s.frequency); } }
};
/** play a phrase [[midi,pulse,len]…] on an instrument, `unit` seconds per pulse */
function phrase(inst,dest,t,notes,o={}){ const u=o.unit||PULSE, tr=o.tr||0, g=o.g||.12;
  for(const [m,p,len] of notes){ const mm=(o.major?toMajor(m):m)+tr, tt=t+p*u;
    if(inst==='cello'||inst==='horn')I[inst](dest,tt,mm,len*u*.92,g); else I[inst](dest,tt,mm,g); } }

/* ---- the recording: synced looping stem groups ---- */
const rec={ fetched:{}, bufs:{}, nodes:{}, w:{}, loaded:false, failed:false, playing:false, start:0, titleStart:0, override:null, state:'', error:null, offset:0 };
for(const k of REC.files)rec.w[k]=0;
// fetch as soon as the page loads; decoding waits for the AudioContext (first click/key)
const recFetch={};
for(const k of REC.files){
  try{ recFetch[k]=fetch('audio/bq-'+k+'.mp3').then(r=>{ if(!r.ok)throw new Error('HTTP '+r.status); return r.arrayBuffer(); }); }
  catch(e){ recFetch[k]=Promise.reject(e); }
  recFetch[k].catch(()=>{});
}
let recBus, coreLP, coreWarm;
function decode(ab){ return new Promise((res,rej)=>{ try{ const p=ctx.decodeAudioData(ab,res,rej); if(p&&p.then)p.then(res,rej); }catch(e){rej(e);} }); }
function buildRecording(){
  recBus=ctx.createGain(); recBus.gain.value=.85; recBus.connect(musicBus);
  coreWarm=ctx.createBiquadFilter(); coreWarm.type='lowshelf'; coreWarm.frequency.value=260; coreWarm.gain.value=0; coreWarm.connect(recBus);
  coreLP=ctx.createBiquadFilter(); coreLP.type='lowpass'; coreLP.frequency.value=20000; coreLP.Q.value=.6; coreLP.connect(coreWarm);
  for(const k of REC.files){ const g=ctx.createGain(); g.gain.value=0; g.connect(k==='core'?coreLP:recBus); rec.nodes[k]={gain:g,src:null}; }
  const want=['core','rhythm','power'];
  Promise.all(want.map(k=>recFetch[k].then(decode).then(b=>{rec.bufs[k]=b;})))
    .then(()=>{ rec.loaded=true;
      // Some decoders keep the mp3 encoder delay: the extra length is all lead-in, so shift the grid by it.
      const extra=rec.bufs.core.duration-REC.rawLen; rec.offset=(extra>0&&extra<.08)?extra:0;
      startStems(ctx.currentTime+.08); })
    .catch(e=>{ rec.failed=true; rec.error=String(e&&e.message||e); console.warn('music stems unavailable, using generative score:',rec.error); });
  recFetch.title.then(decode).then(b=>{ rec.bufs.title=b; startTitle(ctx.currentTime+.05); }).catch(()=>{});
}
function newSrc(k,ls,le){ const s=ctx.createBufferSource(); s.buffer=rec.bufs[k]; s.loop=true; s.loopStart=ls+rec.offset; s.loopEnd=le+rec.offset; s.connect(rec.nodes[k].gain); return s; }
/** (re)start the three groups together, from the loop start (song bar 9 = verse downbeat) at time `when` */
function startStems(when){
  for(const k of ['core','rhythm','power']){ const n=rec.nodes[k]; if(n.src){ try{n.src.stop(when);}catch(_){} }
    n.src=newSrc(k,REC.loopStart,REC.loopEnd); n.src.start(when,REC.loopStart+rec.offset); }
  rec.start=when; rec.playing=true; aligned=false;
}
function startTitle(when){ const n=rec.nodes.title; if(n.src)return; n.src=newSrc('title',REC.titleLoopStart,REC.titleLoopEnd); n.src.start(when,REC.titleLoopStart+rec.offset); rec.titleStart=when; }
/** time of the next grid point (unit = PULSE, BEAT or BAR) on the recording's beat grid */
function nextGrid(t,unit){ const z=rec.playing?rec.start:0, n=Math.ceil((t-z-.01)/unit); return z+n*unit; }
const onGrid=(t,unit)=>rec.playing?nextGrid(t+.03,unit||PULSE):t;
/** brief dip of the recording under a big stinger */
function recDip(t,depth,hold){ if(!recBus)return; const g=recBus.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value,t); g.linearRampToValueAtTime(.85*depth,t+.6); g.setValueAtTime(.85*depth,t+.6+hold); g.linearRampToValueAtTime(.85,t+.6+hold+2.5); }

/* ---- game state → music state ---- */
const STATES=['title','explore','forest','tower','combat','boss','cured','ending','dead','silent'];
function musicState(mode){
  if(rec.override)return {s:rec.override,base:rec.override};
  if(mode==='title')return {s:'title'}; if(mode==='ending')return {s:'ending'}; if(mode==='dead')return {s:'dead'};
  const P=G.player, lh=G.world.lighthouse;
  const inBody=lh&&lh.inBody?lh.inBody(P.pos):false;
  const forest=G.world.inForest?G.world.inForest(P.pos.x):P.pos.x<-70;
  const boss=G.monsters&&G.monsters.boss;
  if(boss&&boss.alive!==false&&boss.state!=='dying')return {s:'boss'};
  let threat=0;
  if(G.monsters&&G.monsters.list) for(const m of G.monsters.list){
    if(!m.alive||m.state==='dying'||m.state==='idle'||m.state==='return')continue;
    if(Math.hypot(m.pos.x-P.pos.x,m.pos.z-P.pos.z)<30)threat=1; }
  const base=(inBody&&!curedFlag)?'tower':forest?'forest':curedFlag?'cured':'explore';
  return {s:threat?'combat':base,base};
}
// recording mix per state: group gains, core low-pass (Hz), core warmth (dB low shelf)
const MIX={
  title:  {title:.95, core:0,   rhythm:0,   power:0,   lp:20000, warm:0},
  explore:{title:0,   core:.85, rhythm:0,   power:.28, lp:20000, warm:0},
  cured:  {title:0,   core:1,   rhythm:.4,  power:.55, lp:20000, warm:3.5},
  forest: {title:0,   core:.62, rhythm:0,   power:0,   lp:950,   warm:0},
  tower:  {title:0,   core:.22, rhythm:0,   power:0,   lp:420,   warm:0},
  combat: {title:0,   core:1,   rhythm:1.6, power:.9,  lp:20000, warm:0},
  boss:   {title:0,   core:1,   rhythm:2.3, power:1.25,lp:20000, warm:1.5},
  ending: {title:0,   core:1,   rhythm:.5,  power:.7,  lp:20000, warm:3.5},
  dead:   {title:0,   core:0,   rhythm:0,   power:0,   lp:20000, warm:0},
  silent: {title:0,   core:0,   rhythm:0,   power:0,   lp:20000, warm:0}
};
// generative layers: full score when there is no recording, accents on top of it otherwise
function synthWeights(st,mode){
  const W={title:0,explore:0,forest:0,tower:0,combat:0,boss:0}, live=rec.playing, s=st.s, base=st.base||s;
  if(s==='dead'||s==='silent')return W;
  // stems still decoding (normally < 1 s): hold the fallback score back so it doesn't start then vanish
  if(!live&&!rec.failed&&ctx.currentTime-unlockedAt<6&&s!=='tower')return W;
  if(s==='title'){ W.title=(live||rec.bufs.title)?0:1; return W; }
  if(s==='ending'){ W.title=live?0:.9; return W; }
  if(s==='boss'){ W.boss=live?.55:1; W.explore=live?0:.25; return W; }
  const L={tower:1,forest:live?.55:1,explore:live?.5:1,cured:live?.5:1};
  if(base==='tower')W.tower=L.tower; else if(base==='forest')W.forest=L.forest; else W.explore=L[base]||L.explore;
  if(s==='combat'){ W.combat=live?.45:1; W.explore*=.5; W.forest*=.5; W.tower*=.4; }
  return W;
}

let bar=0, nextBar=0, musicStarted=false, curedFlag=false, aligned=false, motifCount=0;
function scheduleBar(t){
  const w=k=>layers[k].w>0.02, d=k=>layers[k].gain, live=rec.playing;
  const i=((bar%32)+32)%32, c=chordAt(i,0,curedFlag&&!live), c2=chordAt(i,1,curedFlag&&!live), split=c!==c2;
  const maj=curedFlag&&!live, scale=maj?SCALE_MAJ:SCALE_MIN, motif=maj?MOTIF_CURED:MOTIF;
  const chordTone=k=>c.n[k%3]+12*((k/3)|0);
  // title (fallback only): the theme on music box over a gentle pad
  if(w('title')){ I.pad(d('title'),t,c.n,BAR,.05,700);
    if(i%8<4){ if(i%8===0)phrase('musicBox',d('title'),t,THEME,{tr:12,g:.15,major:maj}); }
    else for(let k=0;k<3;k++)I.musicBox(d('title'),t+k*2*PULSE,scale[(Math.random()*scale.length)|0],.08); }
  // explore
  if(w('explore')){
    if(!live){ I.pad(d('explore'),t,split?c.n:c.n,split?BAR/2:BAR,.045,850); if(split)I.pad(d('explore'),t+BAR/2,c2.n,BAR/2,.045,850);
      I.bass(d('explore'),t,c.r+12,split?BAR/2:BAR,.08); if(split)I.bass(d('explore'),t+BAR/2,c2.r+12,BAR/2,.08);
      if(i===0||i===8) phrase('musicBox',d('explore'),t,THEME,{tr:12,g:.14,major:maj});
      else if(i===24) phrase('musicBox',d('explore'),t,HOOK,{g:.12,major:maj});
      else if(i<24&&!(i>0&&i<4)&&!(i>8&&i<12)) for(let k=0;k<6;k++) if(Math.random()<.3) I.musicBox(d('explore'),t+k*PULSE,(maj?toMajor(scale[(Math.random()*6)|0]):scale[(Math.random()*6)|0]),.07+Math.random()*.04); }
    else{ // accents on Heath's grid: the leitmotif echoed an octave up where the melody rests, plus chord-tone glints
      if(i===5||i===13) phrase('musicBox',d('explore'),t,MOTIF,{tr:12,g:.075});
      else if(i>=16&&i<24) for(let k=0;k<6;k++) if(Math.random()<.16) I.musicBox(d('explore'),t+k*PULSE,chordTone(3+(Math.random()*3|0))+12,.045); }
  }
  // forest: darker, low harp; motif an octave down
  if(w('forest')){
    if(!live){ I.pad(d('forest'),t,c.n.map(m=>m-12),BAR,.05,520); I.bass(d('forest'),t,c.r,BAR,.09); }
    I.harp(d('forest'),t,c.r+12,live?.06:.12); I.harp(d('forest'),t+3*PULSE,(split?c2:c).n[0]-12,live?.05:.09);
    if(i%8===(live?5:2)) phrase('harp',d('forest'),t,MOTIF,{tr:-12+(live?12:0),g:live?.07:.12,major:maj});
    else if(Math.random()<.4) I.harp(d('forest'),t+((Math.random()*6)|0)*PULSE,c.n[(Math.random()*3)|0],.06); }
  // tower: heartbeat on the dotted-quarter beat, the motif as a far-off glimmer
  if(w('tower')){ for(const b of [0,3]){ I.drum(d('tower'),t+b*PULSE,.22,62); I.drum(d('tower'),t+b*PULSE+.24,.15,56); }
    if(i%8===4) phrase('musicBox',d('tower'),t,MOTIF.slice(0,3),{tr:24,g:.04});
    else if(Math.random()<.4) I.musicBox(d('tower'),t+((Math.random()*6)|0)*PULSE,[86,89,93][(Math.random()*3)|0],.045); }
  // combat: 6/8 frame-drum pattern (+ cello ostinato on the chart's roots when there is no recording)
  if(w('combat')){
    [[0,.34],[2,.18],[3,.3],[4,.14],[5,.2]].forEach(([p,g])=>I.drum(d('combat'),t+p*PULSE,g,95));
    for(let k=0;k<12;k++)I.tap(d('combat'),t+k*PULSE/2,k%2?.04:.07);
    if(!live) for(let k=0;k<6;k++){ const cc=k<3?c:c2; I.cello(d('combat'),t+k*PULSE,(k===5?cc.r+19:cc.r+12),PULSE*.9,.07); } }
  // boss: heavy drums; in the fallback also choir, dark chart and the motif on low horns
  if(w('boss')){ const b=CH[BOSS_CHART[bar%4]];
    for(let k=0;k<2;k++){ I.drum(d('boss'),t+k*BEAT,.42,72); I.drum(d('boss'),t+k*BEAT+2*PULSE,.24,88); }
    for(let k=0;k<12;k++)I.tap(d('boss'),t+k*PULSE/2,(k%3===0)?.07:.035);
    if(!live){ I.choir(d('boss'),t,b.n.map(m=>m-12),BAR,.05);
      for(let k=0;k<6;k++)I.cello(d('boss'),t+k*PULSE,[b.r+12,b.r+13,b.r+12,b.r+11,b.r+12,b.r+13][k],PULSE*.9,.08);
      if(bar%8===0)phrase('horn',d('boss'),t,MOTIF,{tr:-12,g:.06}); } }
  bar++;
}
let lastMusicT=0;
function updateMusic(_dt,mode){
  const t=ctx.currentTime, dt=U.clamp(t-(lastMusicT||t),0,1); lastMusicT=t;   // fades follow the audio clock, not frame rate
  const st=musicState(mode), W=synthWeights(st,mode), paused=mode==='paused';
  rec.state=st.s;
  for(const k of LAYER_NAMES){ const L=layers[k]; const tw=W[k]*(paused?.5:1), up=tw>L.w;
    L.w=U.damp(L.w,tw,up?(k==='combat'||k==='boss'?3:.7):.6,dt);
    L.gain.gain.setTargetAtTime(L.w,t,.1); }
  // recording group gains
  if(recBus){ const M=MIX[st.s]||MIX.explore, have=rec.playing;
    for(const k of REC.files){ const n=rec.nodes[k]; if(!n)continue;
      let tw=(k==='title'?(rec.bufs.title?M.title:0):(have?M[k]:0));
      if(k==='title'&&!rec.bufs.title)tw=0;
      if(st.s==='title'&&k==='core'&&!rec.bufs.title&&have)tw=.6;   // no title excerpt: gentle core instead
      if(paused)tw*=.5;
      const up=tw>rec.w[k], fast=st.s==='combat'||st.s==='boss';
      rec.w[k]=U.damp(rec.w[k],tw,up?(fast?2.2:.6):(st.s==='dead'?1.2:.45),dt);
      n.gain.gain.setTargetAtTime(rec.w[k],t,.08); }
    coreLP.frequency.setTargetAtTime(M.lp,t,.8); coreWarm.gain.setTargetAtTime(M.warm,t,1.5); }
  // generative clock: locked to the recording's bar grid when it plays
  if(rec.playing&&!aligned){ const n=Math.ceil((t+.05-rec.start)/BAR); nextBar=rec.start+n*BAR; bar=n; aligned=true; musicStarted=true; }
  if(!musicStarted||nextBar<t-BAR){ musicStarted=true; if(rec.playing){aligned=false;return;} nextBar=t+.15; } // also recovers after the tab was hidden
  while(nextBar<t+.35){ scheduleBar(nextBar); nextBar+=BAR; }
}
function setOverride(name){ rec.override=(name&&STATES.indexOf(name)>=0)?name:null; return rec.override; }


/* ---------- recorded sound effects (sfx/*.mp3, made by Heath in Suno) ----------
   SFX_LIST holds file stems. Variants named <name>-2, <name>-3 … are grouped with <name>
   and picked at random. `peak` (s) = loudest moment, used to land cues on the beat they warn of.
   Every recorded sound has a synthesized fallback, so a missing file never goes silent. */
const SFX_LIST={
  hollow_whispers_loop:{loop:true},
  hollow_notice:{peak:1.07},
  hollow_windup:{peak:1.79},
  hollow_claw:{peak:.6}
};
const sfxBuf={}, sfxGroups={};
for(const stem in SFX_LIST){ const base=stem.replace(/-\d+$/,''); (sfxGroups[base]=sfxGroups[base]||[]).push(stem); }
let sfxFetched=false;
function fetchSfx(){
  if(sfxFetched)return; sfxFetched=true;
  for(const stem in SFX_LIST){
    fetch('sfx/'+stem+'.mp3').then(r=>r.ok?r.arrayBuffer():Promise.reject(r.status))
      .then(ab=>{ sfxBuf[stem]={raw:ab}; if(ctx)decodeSfx(stem); }).catch(()=>{ sfxBuf[stem]={failed:true}; });
  }
}
function decodeSfx(stem){
  const e=sfxBuf[stem]; if(!e||e.buf||e.pending||!e.raw)return; e.pending=true;
  ctx.decodeAudioData(e.raw.slice(0)).then(b=>{
    e.buf=b; e.pending=false; e.raw=null;
    // skip any encoder padding at either end so loops are seamless
    const d=b.getChannelData(0); let a=0,z=d.length-1; while(a<d.length&&Math.abs(d[a])<1e-4)a++; while(z>a&&Math.abs(d[z])<1e-4)z--;
    e.start=a/b.sampleRate; e.end=(z+1)/b.sampleRate;
  }).catch(()=>{ e.pending=false; e.failed=true; });
}
function decodeAllSfx(){ for(const stem in sfxBuf)decodeSfx(stem); }
function pickSfx(name){ const g=(sfxGroups[name]||[]).filter(st=>sfxBuf[st]&&sfxBuf[st].buf); return g.length?g[(Math.random()*g.length)|0]:null; }
const hasSfx=name=>!!pickSfx(name);
/** play a recorded sound. o: {pos, ref, gain, offset (s into the file), rate, vary, dest} -> {src,gain} or null */
function playSfx(name,o={}){
  const stem=pickSfx(name); if(!ctx||!stem)return null; const e=sfxBuf[stem];
  const t=ctx.currentTime, src=ctx.createBufferSource(), g=ctx.createGain();
  src.buffer=e.buf; src.playbackRate.value=(o.rate||1)*(1+(Math.random()-.5)*(o.vary==null?.08:o.vary));
  const off=U.clamp((o.offset||0)+e.start,0,Math.max(0,e.buf.duration-.05)), peak=o.gain==null?1:o.gain;
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(peak,t+(o.offset>0?.04:.006));
  src.connect(g); g.connect(o.dest||at(o.pos,o.ref||4)); src.start(t,off);
  return {src,gain:g};
}
fetchSfx();

/* whisper loops that follow each nearby hollow (the three closest), fading with distance and state */
const loops=new Map(); // monster -> {src,gain,pan}
function setPos(p,x,y,z){ if(p.positionX){const t=ctx.currentTime;p.positionX.setTargetAtTime(x,t,.05);p.positionY.setTargetAtTime(y,t,.05);p.positionZ.setTargetAtTime(z,t,.05);} else p.setPosition(x,y,z); }
function stopLoop(m,fade){ const L=loops.get(m); if(!L)return; const t=ctx.currentTime; L.gain.gain.cancelScheduledValues(t); L.gain.gain.setTargetAtTime(0,t,fade||.4); try{L.src.stop(t+(fade||.4)*5);}catch(_){} loops.delete(m); }
function updateCreatureLoops(mode){
  const P=G.player, want=new Set();
  if(mode==='play'&&G.monsters&&G.monsters.list&&hasSfx('hollow_whispers_loop')){
    const near=G.monsters.list.filter(m=>m.kind==='hollow'&&m.alive&&!m.dying&&!m.boss)
      .map(m=>({m,d:Math.hypot(m.pos.x-P.pos.x,m.pos.z-P.pos.z)})).filter(o=>o.d<34).sort((a,b)=>a.d-b.d).slice(0,3);
    for(const {m} of near){
      want.add(m); let L=loops.get(m);
      if(!L){
        const stem=pickSfx('hollow_whispers_loop'), e=sfxBuf[stem];
        const pan=ctx.createPanner(); pan.panningModel='equalpower'; pan.distanceModel='inverse'; pan.refDistance=3; pan.maxDistance=40; pan.rolloffFactor=1.5; pan.connect(sfxBus);
        const gain=ctx.createGain(); gain.gain.value=0; gain.connect(pan);
        const src=ctx.createBufferSource(); src.buffer=e.buf; src.loop=true; src.loopStart=e.start; src.loopEnd=e.end; src.playbackRate.value=.9+Math.random()*.16;
        src.connect(gain); src.start(ctx.currentTime,e.start+Math.random()*(e.end-e.start-1)); // each hollow starts at a different point
        L={src,gain,pan}; loops.set(m,L);
      }
      setPos(L.pan,m.pos.x,m.pos.y+1.8,m.pos.z);
      const aggro=m.state!=='idle'&&m.state!=='return';
      L.gain.gain.setTargetAtTime(aggro?.85:.55,ctx.currentTime,.6);
    }
  }
  for(const m of [...loops.keys()]) if(!want.has(m)) stopLoop(m,m.dying||!m.alive?.25:.8);
}

/* ---------- player & monster state polling ---------- */
let lastState='idle', wasGround=true, fallV=0, stepDist=0, lastPos=null, charging=false;
function surfaceAt(p){
  const lh=G.world.lighthouse;
  if(lh&&lh.inside&&lh.inside(p))return 'stone';
  if(G.world.onPlateau&&G.world.onPlateau(p.x,p.z)&&G.world.pathDist&&G.world.pathDist(p.x,p.z)<2.5)return 'stone';
  if(lh&&Math.hypot(p.x-lh.x,p.z-lh.z)<9.5&&p.y>lh.baseY-.5)return 'stone';
  if(G.world.inForest?G.world.inForest(p.x):p.x<-70)return 'leaves';
  if(G.world.height(p.x,p.z)<1.6)return 'sand';
  return 'grass';
}
function updatePlayerSounds(dt){
  const P=G.player; if(!P||!P.pos)return; const t=ctx.currentTime;
  const st=P.state||'idle';
  if(st!==lastState){
    if(st==='roll')S.whoosh(t,{f0:300,f1:1200,dur:.32,g:.22});
    if(st==='jump')S.whoosh(t,{f0:500,f1:1500,dur:.18,g:.1});
    if(st==='glide'){ S.whoosh(t,{f0:200,f1:900,dur:.35,g:.3}); S.thud(t,{g:.12,f0:160,f1:80,dur:.08}); }
    if(st==='interact')S.whoosh(t,{f0:800,f1:1600,dur:.15,g:.05});
    lastState=st;
  }
  // landing
  if(!P.grounded){ fallV=Math.min(fallV,P.vel?P.vel.y:0); }
  if(P.grounded&&!wasGround&&lastPos){ const k=U.clamp(-fallV/14,0,1); if(k>.15){ S.thud(t,{g:.15+k*.45,f0:120,f1:40,dur:.25}); S.step(t,surfaceAt(P.pos),.18+k*.2); } fallV=0; }
  wasGround=P.grounded;
  // footsteps by distance travelled
  if(lastPos&&P.grounded&&st!=='roll'&&st!=='dead'){
    const d=Math.hypot(P.pos.x-lastPos.x,P.pos.z-lastPos.z); const spd=d/Math.max(dt,1e-3);
    if(spd>.6&&d<2){ stepDist+=d; const stride=spd>6?1.25:spd>3.5?1.0:.72;
      if(stepDist>stride){ stepDist=0; S.step(t,surfaceAt(P.pos),U.clamp(.06+spd*.012,.06,.15)); } }
  }
  lastPos=lastPos||new THREE.Vector3(); lastPos.copy(P.pos);
  // staff charge hum
  const ch=st==='charge';
  if(ch!==charging){ charging=ch; if(ch){ amb.chargeO.frequency.setValueAtTime(180,t); amb.chargeO.frequency.linearRampToValueAtTime(520,t+1.6); amb.chargeO2.frequency.setValueAtTime(361,t); amb.chargeO2.frequency.linearRampToValueAtTime(1046,t+1.6);} }
  tgt(amb.chargeG.gain,ch?.07:0,.08);
}
const mStates=new WeakMap();
function updateMonsterSounds(){
  if(!G.monsters||!G.monsters.list)return; const t=ctx.currentTime, P=G.player;
  for(const m of G.monsters.list){
    const prev=mStates.get(m); const s=m.state; if(prev===s)continue; mStates.set(m,s); if(prev===undefined)continue;
    const d=Math.hypot(m.pos.x-P.pos.x,m.pos.z-P.pos.z); if(d>45)continue;
    const out=at(new THREE.Vector3(m.pos.x,m.pos.y+1.2,m.pos.z),m.boss?10:4);
    if(m.boss){
      if(s==='intro'){ S.rumble(t,{dest:out,g:.7,dur:2.6,f0:60,f1:28,lp:340}); S.moan(t+.2,{dest:out,f:95,dur:2.2,g:.25}); }
      else if(s==='windup'){ if(m.atk==='charge'){ for(let i=0;i<3;i++)S.thud(t+i*.28,{dest:out,g:.45,f0:90,f1:40,dur:.2}); S.growl(t,{dest:out,f:46,dur:1,g:.4,lp:380}); } else S.growl(t,{dest:out,f:52,dur:.8,g:.32,lp:420}); }
      else if(s==='charge'){ S.whoosh(t,{dest:out,f0:150,f1:600,dur:.9,g:.4}); }
      else if(s==='sweep'){ S.whoosh(t,{dest:out,f0:300,f1:1600,dur:.5,g:.45}); }
      else if(s==='stomp'){ S.rumble(t+.45,{dest:out,g:.85,dur:1.1,f0:70,f1:30,a:.02}); S.thud(t+.45,{dest:out,g:.9,f0:110,f1:30,dur:.5}); }
      else if(s==='summon'){ S.howl(t,{dest:out,g:.16,dur:2}); S.hiss(t,{dest:out,dur:1.4,f0:200,f1:2000,g:.25}); }
      else if(s==='hurt'){ S.shriek(t,{dest:out,f:420,g:.18}); }
      else if(s==='recover'&&prev==='charge'){ S.thud(t,{dest:out,g:.7,f0:90,f1:35,dur:.4}); }
      continue;
    }
    if(m.kind==='hollow'){
      const hp=new THREE.Vector3(m.pos.x,m.pos.y+1.8,m.pos.z), PR=(G.monsters.params||{}).hollow||{};
      if(s==='chase'&&(prev==='idle'||prev==='return')){ if(!playSfx('hollow_notice',{pos:hp,ref:6,gain:.9}))S.moan(t,{dest:out,f:170+Math.random()*40,dur:1.6,g:.14}); }
      else if(s==='windup'){
        // start partway in so the gasp peaks exactly when the strike lands
        const W=m.atk==='claw'?(PR.clawWind||.65):(PR.lungeWind||.8);
        if(!playSfx('hollow_windup',{pos:hp,ref:7,gain:1.15,vary:.03,offset:Math.max(0,SFX_LIST.hollow_windup.peak-W-.04)}))S.hiss(t,{dest:out,dur:.6,f0:450,f1:2800,g:.22});
      }
      else if(s==='attack'){
        if(m.atk==='claw'){ if(!playSfx('hollow_claw',{pos:hp,ref:5,gain:1,offset:.42}))S.whoosh(t,{dest:out,f0:500,f1:2200,dur:.25,g:.3}); }
        else { S.whoosh(t,{dest:out,f0:300,f1:1600,dur:.4,g:.3}); playSfx('hollow_claw',{pos:hp,ref:5,gain:.8,offset:.38,rate:.82}); }
      }
      else if(s==='hurt')S.shriek(t,{dest:out,f:1000,g:.12});
    }else if(m.kind==='hound'){
      if((s==='chase'||s==='stalk')&&(prev==='idle'||prev==='return'))S.howl(t,{dest:out,g:.11});
      else if(s==='windup')S.growl(t,{dest:out,f:78,dur:.5,g:.22});
      else if(s==='attack'){ S.whoosh(t,{dest:out,f0:400,f1:1400,dur:.2,g:.2}); S.clank(t+.12,{dest:out,f:180,g:.05}); }
      else if(s==='hurt')S.shriek(t,{dest:out,f:1300,g:.1});
      else if(s==='flee')S.shriek(t,{dest:out,f:1500,g:.08});
    }
  }
}

/* ---------- event sounds ---------- */
let lastObjective='';
function wire(){
  G.on('player:attack',e=>{ if(!ctx)return; const t=ctx.currentTime;
    if(e&&e.shove){S.whoosh(t,{f0:300,f1:800,dur:.18,g:.12});return;}
    if(e&&e.bolt){ S.chime(t,[81,88,93],{g:.1,step:.03,decay:.6}); S.whoosh(t,{f0:900,f1:4000,dur:.35,g:.18}); return; }
    if(e&&e.spin){ S.whoosh(t,{f0:300,f1:2600,dur:.6,g:.38}); S.chime(t+.1,[74,81,86],{g:.07,step:.06,decay:.8}); return; }
    const c=(e&&e.combo)||1; S.whoosh(t,{f0:c===3?280:420,f1:c===3?1800:2600,dur:c===3?.36:.24,g:c===3?.36:.28}); });
  G.on('strike',e=>{ if(!ctx||!e||e.team!=='player')return; const t=ctx.currentTime;
    const hb=e.hits&&e.hits[0]; const out=hb?at(new THREE.Vector3(hb.pos.x,hb.pos.y+1,hb.pos.z),5):sfxBus;
    if(e.kind==='swarm'){ S.hiss(t,{dest:out,dur:.25,f0:2000,f1:4500,g:.06}); return; }
    S.thud(t,{dest:out,g:.5,f0:150,f1:55,dur:.22,nf:2600}); S.hiss(t,{dest:out,dur:.12,f0:1800,f1:900,g:.12,Q:1});
    if(e.kind==='bolt')S.chime(t,[86,93],{dest:out,g:.08,step:.02,decay:.5}); });
  G.on('player:hurt',e=>{ if(!ctx)return; const t=ctx.currentTime; S.thud(t,{g:.6,f0:110,f1:40,dur:.3}); S.whoosh(t,{f0:900,f1:300,dur:.25,g:.12});
    if(G.player.hp<=2&&G.player.hp>0){ for(let i=0;i<3;i++)S.chime(t+.25+i*.32,[86],{g:.06,decay:.25}); } });
  // death: the motif falls apart, slowly (F E C … A) — the recording fades out via MIX.dead
  G.on('player:dead',()=>{ if(!ctx)return; const t=ctx.currentTime; S.rumble(t,{g:.5,dur:3,f0:55,f1:30}); S.chime(t+.4,[65,64,60,57],{g:.09,step:.5,decay:2.4,dest:synthBus}); });
  // respawn: the leitmotif's head D–E–F rising to A, on the beat grid
  G.on('player:respawn',()=>{ if(!ctx)return; const t=onGrid(ctx.currentTime,PULSE); S.chime(t,[62,64,65,69,74],{g:.08,step:PULSE*.5,decay:1.6,dest:synthBus}); });
  G.on('lantern:pickup',()=>{ if(!ctx)return; const t=ctx.currentTime; S.clank(t,{f:620,g:.1}); S.chime(t+.08,[74,81,86],{g:.07,step:.07}); });
  G.on('lantern:drop',()=>{ if(!ctx)return; S.clank(ctx.currentTime,{f:420,g:.12}); });
  G.on('lantern:shutter',e=>{ if(!ctx)return; const t=ctx.currentTime; S.clank(t,{f:e&&e.shut?360:500,g:.1}); });
  G.on('door:blocked',()=>{ if(!ctx)return; const t=ctx.currentTime; S.rumble(t,{g:.28,dur:1.1,f0:50,f1:36,lp:200}); S.hiss(t,{dur:.8,f0:1600,f1:300,g:.08}); });
  G.on('tower:enter',()=>{ if(!ctx)return; revSend.gain.setTargetAtTime(.55,ctx.currentTime,.3); S.thud(ctx.currentTime,{g:.25,f0:90,f1:50,dur:.3}); });
  G.on('tower:exit',()=>{ if(!ctx)return; revSend.gain.setTargetAtTime(.22,ctx.currentTime,.5); });
  // staff: the full leitmotif D E F E C on bells, quick, then sparkle — lands on the next pulse
  G.on('staff:pickup',()=>{ if(!ctx)return; const t=onGrid(ctx.currentTime,PULSE);
    phrase('musicBox',synthBus,t,MOTIF,{tr:12,g:.15,unit:PULSE*.5}); S.chime(t+PULSE*3,[69,74,81],{g:.06,step:.05,decay:2,dest:synthBus}); S.sparkle(t+PULSE*2.5,{g:.06}); });
  G.on('lamp:placed',()=>{ if(!ctx)return; const t=ctx.currentTime; S.clank(t,{f:700,g:.1}); S.hiss(t+.3,{dur:4,f0:600,f1:4000,g:.08}); });
  // lamp cured: D-major choir + bells, then the leitmotif in D major (D E F# E A), broad, on the bar grid;
  // the recording dips under it and comes back fuller and warmer (MIX.cured)
  G.on('lamp:cured',()=>{ if(!ctx)return; const t=onGrid(ctx.currentTime,BEAT); curedFlag=true; recDip(t,.35,4);
    I.choir(synthBus,t,[62,66,69,74],6,.07); S.bell(t,62,{g:.3,decay:6,dest:synthBus}); S.bell(t+BEAT,69,{g:.18,decay:5,dest:synthBus}); S.bell(t+2*BEAT,74,{g:.15,decay:5,dest:synthBus});
    phrase('musicBox',synthBus,t+4*BEAT,MOTIF_CURED,{tr:12,g:.16}); phrase('horn',synthBus,t+4*BEAT,MOTIF_CURED,{g:.045}); });
  G.on('finale:start',()=>{ if(!ctx)return; const t=ctx.currentTime;
    S.rumble(t,{g:.7,dur:3.5,f0:45,f1:28,lp:300});
    const g=envGain(synthBus,t+.3,.6,.1,1.6,1.4); [38,45,50].forEach(m=>osc('sawtooth',midi(m),t+.3,t+4.2,filt('lowpass',600,1.5,g)));
    // the motif as a low brass call over the rumble (D minor)
    phrase('horn',synthBus,t+1.2,MOTIF,{tr:-12,g:.09,unit:PULSE*1.2}); });
  G.on('monster:killed',e=>{ if(!ctx||!e)return; const t=ctx.currentTime; const out=at(new THREE.Vector3(e.pos.x,e.pos.y+1,e.pos.z),e.boss?12:5);
    S.dissolve(t,{dest:out,dur:e.boss?3:1.2,g:e.boss?.4:.22}); if(e.boss){ S.rumble(t,{dest:out,g:.8,dur:4,f0:60,f1:25}); } });
  // victory: bells + choir in D major, the hook (D E~ C# E F# E C# D~) brightened on music box
  G.on('boss:dead',()=>{ if(!ctx)return; const t=onGrid(ctx.currentTime+1.5,BEAT); recDip(t,.5,5); S.bell(t,62,{g:.3,decay:7,dest:synthBus}); I.choir(synthBus,t,[62,66,69,74,78],7,.06);
    phrase('musicBox',synthBus,t+BEAT,HOOK.map(([m,p,l])=>[m,p-4,l]),{g:.13,major:true}); });
  G.on('negative:freed',e=>{ if(!ctx)return; const t=ctx.currentTime; const out=e&&e.pos?at(new THREE.Vector3(e.pos.x,e.pos.y+1,e.pos.z),6):sfxBus;
    S.dissolve(t,{dest:out,dur:1,g:.15}); S.chime(t+.6,[74,78,81],{dest:out,g:.08,step:.1}); });
  G.on('pickup',e=>{ if(!ctx)return; const t=ctx.currentTime; if(e&&e.kind==='mushroom'){S.chime(t,[69,74,78],{g:.07,step:.05,decay:1});} else { S.chime(t,[81,86],{g:.09,step:.05,decay:.8}); S.sparkle(t,{g:.05}); } });
  G.on('talk',e=>{ if(!ctx)return; const h=G.creatures&&G.creatures.halloran; const p=h&&(h.pos||(h.g&&h.g.position));
    const out=p?at(new THREE.Vector3(p.x,p.y+1.6,p.z),5):sfxBus; const n=Math.min(14,Math.max(4,Math.round(((e&&e.line)||'').length/9)));
    S.voice(ctx.currentTime+.05,n,{dest:out,f:92,g:.1}); });
  G.on('mode',e=>{ if(!ctx)return; const t=ctx.currentTime;
    const paused=e.mode==='paused';
    duck.gain.setTargetAtTime(paused?.45:1,t,.15); masterLP.frequency.setTargetAtTime(paused?900:20000,t,.15);
    if(e.mode==='play'&&e.prev==='title'){ S.chime(onGrid(t,PULSE),[62,64,65],{g:.08,step:PULSE,decay:2,dest:synthBus}); } });
  // gentle UI cues, wrapping whatever hud.js installed
  const ui=G.ui, toast=ui.toast, objective=ui.objective;
  ui.toast=function(a,b){ if(ctx&&a&&!/^Sound (on|off)$/.test(a))S.chime(ctx.currentTime,[74,79,83],{g:.06,step:.07,decay:1.2}); return toast.apply(this,arguments); };
  ui.objective=function(a,b){ if(ctx&&a&&a!==lastObjective&&lastObjective)S.chime(ctx.currentTime,[81,86],{g:.045,step:.09,decay:.9}); lastObjective=a||lastObjective; return objective.apply(this,arguments); };
}

/* ---------- pause-menu controls ---------- */
let volEl=null, musEl=null, muteEl=null;
function syncUI(){ if(volEl){volEl.value=Math.round(settings.volume*100);musEl.value=Math.round(settings.music*100);muteEl.checked=settings.muted;} }
function buildUI(){
  const sheet=document.querySelector('#pause .sheet'); if(!sheet)return;
  const box=document.createElement('div');
  box.style.cssText='display:grid;grid-template-columns:auto 1fr;gap:8px 14px;align-items:center;font-size:14px;color:#3d2f33';
  box.innerHTML='<label for="volAll">Volume</label><input id="volAll" type="range" min="0" max="100" style="width:100%;accent-color:#4b3863">'+
    '<label for="volMusic">Music</label><input id="volMusic" type="range" min="0" max="100" style="width:100%;accent-color:#4b3863">'+
    '<label for="volMute" style="grid-column:1 / -1;display:flex;gap:8px;align-items:center"><input id="volMute" type="checkbox" style="accent-color:#4b3863"> Mute all sound <kbd style="margin-left:4px">M</kbd></label>';
  const actions=sheet.querySelector('.actions'); sheet.insertBefore(box,actions);
  volEl=box.querySelector('#volAll'); musEl=box.querySelector('#volMusic'); muteEl=box.querySelector('#volMute');
  volEl.addEventListener('input',()=>{settings.volume=volEl.value/100;applyVolume();save();});
  musEl.addEventListener('input',()=>{settings.music=musEl.value/100;applyVolume();save();});
  muteEl.addEventListener('change',()=>{settings.muted=muteEl.checked;applyVolume();save();});
  syncUI();
  const keys=document.getElementById('keys'); if(keys){const s=document.createElement('span');s.innerHTML='<kbd>M</kbd> sound';keys.appendChild(s);}
}

/* ---------- system ---------- */
G.audio={settings,get ready(){return !!ctx;},get context(){return ctx;},get output(){return comp;},get layers(){return layers;},get _amb(){return amb;}, sfx:{list:SFX_LIST,get loaded(){return Object.keys(sfxBuf).filter(k=>sfxBuf[k].buf);},play:(n,o)=>playSfx(n,o||{}),get loops(){return loops.size;}},S,I,unlock,
  music:{ get loaded(){return rec.loaded;}, get failed(){return rec.failed;}, get error(){return rec.error;}, get playing(){return rec.playing;},
    get state(){return rec.state;}, get startTime(){return rec.start;}, get offset(){return rec.offset;},
    get groups(){ const o={}; for(const k of REC.files){ const n=rec.nodes[k]; o[k]={loaded:!!rec.bufs[k],duration:rec.bufs[k]?rec.bufs[k].duration:0,playing:!!(n&&n.src),gain:n?+n.gain.gain.value.toFixed(3):0,target:+(rec.w[k]||0).toFixed(3)}; } return o; },
    get synth(){ const o={}; for(const k of LAYER_NAMES)o[k]=+layers[k].w.toFixed(3); return o; },
    get filter(){ return coreLP?Math.round(coreLP.frequency.value):null; },
    setOverride, restart(){ if(rec.loaded)startStems(ctx.currentTime+.05); },
    meta:{key:'D minor',meter:'6/8',pulseBpm:+(60/PULSE).toFixed(2),beatBpm:+(60/BEAT).toFixed(2),bar:BAR,loopStart:REC.loopStart,loopEnd:REC.loopEnd,chart:CHART,motif:'D E F E C'} }};
G.system('audio',{order:92,modes:'always',
  init(){ wire(); buildUI(); },
  update(dt){
    if(!ctx||ctx.state!=='running')return;
    const mode=G.state.mode;
    setListener();
    const ref=mode==='title'?G.camera.position:(G.player&&G.player.pos)||G.camera.position;
    updateAmbience(dt,ref,mode);
    updateMusic(dt,mode);
    if(mode==='play'){ updatePlayerSounds(dt); updateMonsterSounds(); }
    updateCreatureLoops(mode);
  }
});
})();

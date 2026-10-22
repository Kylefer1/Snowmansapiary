/* Queen of the Meadow: deterministic simulation, independent of the browser. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MeadowEngine=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const WORLD=2600,TAU=Math.PI*2,MAX_ENEMIES=210,MAX_SHOTS=360,MAX_DROPS=320,MAX_ZONES=65;
const WEAPONS={
  guard:{name:'Guard Bees',description:'Launch loyal bees at the nearest threat. Each rank strengthens the volley.',color:'#f6cd69'},
  jelly:{name:'Royal Jelly',description:'Restore health over time and increase your maximum health.',color:'#eab1c9'},
  pollen:{name:'Pollen Bombs',description:'Explosive pollen strikes groups of enemies with a growing blast.',color:'#ebb656'},
  propolis:{name:'Propolis',description:'Leave resin pools that slow pursuers and wear them down.',color:'#b78645'},
  orbit:{name:'Orbiting Bees',description:'A living ring of defenders damages nearby enemies.',color:'#e8d37b'},
  wing:{name:'Wingbeat',description:'Release a sweeping pulse that damages and pushes enemies away.',color:'#b6dce1'}
};
const FUSIONS={
  royal:{name:'Royal Guard',pair:['guard','jelly'],description:'A piercing royal volley with stronger recovery.',color:'#ffdb84'},
  bloom:{name:'Sticky Bloom',pair:['pollen','propolis'],description:'Pollen explosions leave broad, damaging resin pools.',color:'#daa65b'},
  shield:{name:'Swarm Shield',pair:['orbit','wing'],description:'A wider swarm lashes nearby enemies and pushes them back.',color:'#b8e5da'}
};
const ENEMIES={
  mite:{name:'Rust Mite',description:'A direct pursuer that grows dangerous in crowds.',color:'#a94936',hp:21,speed:69,r:12,xp:1,behavior:'chase'},
  moth:{name:'Ash Moth',description:'Weaves through the meadow on a swaying flight path.',color:'#ada18b',hp:27,speed:83,r:14,xp:2,behavior:'weave'},
  beetle:{name:'Ironback Beetle',description:'A slow armored shell absorbs some incoming damage.',color:'#687373',hp:72,speed:43,r:20,xp:4,behavior:'armor',armor:.28},
  wasp:{name:'Lance Wasp',description:'Stops and sights its target before a fast charge.',color:'#cc973d',hp:39,speed:87,r:15,xp:3,behavior:'charge'},
  spitter:{name:'Sap Spitter',description:'Keeps its distance and launches globs of corrosive sap.',color:'#95ad64',hp:40,speed:56,r:17,xp:3,behavior:'ranged'},
  splitter:{name:'Brood Carrier',description:'Breaks apart into a cluster of fast broodlings.',color:'#957456',hp:65,speed:54,r:21,xp:4,behavior:'split'},
  gnat:{name:'Needle Gnat',description:'Small flanking attackers gather in quick-moving packs.',color:'#b6b5a3',hp:12,speed:119,r:8,xp:1,behavior:'swarm'},
  broodling:{name:'Broodling',description:'A tiny, fragile attacker released by a carrier.',color:'#b68e6d',hp:11,speed:103,r:8,xp:1,behavior:'skitter'},
  hornet:{name:'Crown Hornet',description:'An elite predator that charges, fires a fan of sap, and summons gnats.',color:'#c66b36',hp:480,speed:61,r:34,xp:28,behavior:'boss'}
};
const STAGES={
  1:{id:1,name:"Meadow's Edge",waves:20,duration:600,description:'Survive twenty waves and defeat the final Crown Hornet.',color:'#7b925d'},
  2:{id:2,name:'Thistle Dusk',waves:25,duration:750,description:'A harsher dusk meadow with aggressive mixed swarms.',color:'#79657e'}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
function segmentDistance2(x,y,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?clamp(((x-ax)*dx+(y-ay)*dy)/l,0,1):0;return (x-ax-dx*t)**2+(y-ay-dy*t)**2;}
class Game{
  constructor({random=Math.random,stage=1}={}){
    this.random=typeof random==='function'?random:Math.random;this.stage=STAGES[stage]?Number(stage):1;this.stageInfo=STAGES[this.stage];
    this.state='ready';this.queen={x:1300,y:1300,px:1300,py:1300,hp:120,max:120,inv:0,vx:0,vy:0,angle:-Math.PI/2};
    this.time=0;this.wave=1;this.level=1;this.xp=0;this.need=8;this.kills=0;
    this.weapons={guard:1,jelly:0,pollen:0,propolis:0,orbit:0,wing:0};this.fused={royal:false,bloom:false,shield:false};
    this.enemies=[];this.hives=[];this.shots=[];this.drops=[];this.zones=[];this.events=[];this.options=[];this.pendingReward=null;
    this.superWeaponTime=0;this._superTimer=0;this._hiveClock=45;this._hiveTravel=0;
    this.dashCooldown=0;this.input={x:0,y:0,aimX:0,aimY:0};this.endless=false;this.campaignComplete=false;this._nextId=1;this._spawn=.3;this._pity=0;this._bossWaves=new Set();this._timers={guard:0,pollen:1.2,propolis:1,wing:1};this._resumeState='playing';this._dashTime=0;this._dashX=0;this._dashY=-1;
  }
  _random(){return clamp(finite(this.random(),.5),0,.999999999);}
  _range(a,b){return a+(b-a)*this._random();}
  _event(type,x,y,extra={}){if(this.events.length<180)this.events.push({type,x,y,...extra});}
  drainEvents(){const out=this.events;this.events=[];return out;}
  start(){if(this.state==='ready'){this.state='playing';this._event('wave',this.queen.x,this.queen.y,{wave:1});}return this;}
  pause(){if(this.state==='playing'){this._resumeState=this.state;this.state='paused';}return this.state;}
  resume(){if(this.state==='paused')this.state=this._resumeState;return this.state;}
  dash(x=this.input.x,y=this.input.y){
    if(this.state!=='playing'||this.dashCooldown>0)return false;
    x=finite(x);y=finite(y);let d=Math.hypot(x,y);if(d<.05){x=Math.cos(this.queen.angle);y=Math.sin(this.queen.angle);d=1;}
    this._dashX=x/d;this._dashY=y/d;this._dashTime=.18;this.dashCooldown=5;this.queen.inv=Math.max(this.queen.inv,.38);this._event('dash',this.queen.x,this.queen.y,{angle:Math.atan2(y,x),color:'#f0dca8'});return true;
  }
  step(dt,input){
    if(this.state!=='playing')return;
    dt=clamp(finite(dt),0,.25);if(!dt)return;
    if(input)for(const k of ['x','y','aimX','aimY'])this.input[k]=clamp(finite(input[k]),-1,1);
    let left=dt;while(left>1e-8&&this.state==='playing'){const slice=Math.min(left,1/60);this._tick(slice);left-=slice;}
  }
  _tick(dt){
    const q=this.queen;q.px=q.x;q.py=q.y;this.time+=dt;q.inv=Math.max(0,q.inv-dt);this.dashCooldown=Math.max(0,this.dashCooldown-dt);this.superWeaponTime=Math.max(0,this.superWeaponTime-dt);
    const raw=Math.hypot(this.input.x,this.input.y),n=Math.max(1,raw),speed=192;
    const tx=this.input.x/n*speed,ty=this.input.y/n*speed,ease=1-Math.exp(-13*dt);
    q.vx+=(tx-q.vx)*ease;q.vy+=(ty-q.vy)*ease;
    if(raw>.05)q.angle=Math.atan2(this.input.y,this.input.x);
    if(this._dashTime>0){this._dashTime=Math.max(0,this._dashTime-dt);q.x+=this._dashX*720*dt;q.y+=this._dashY*720*dt;}else{q.x+=q.vx*dt;q.y+=q.vy*dt;}
    q.x=clamp(q.x,22,WORLD-22);q.y=clamp(q.y,22,WORLD-22);
    this._hiveTravel+=Math.hypot(q.x-q.px,q.y-q.py);this._hiveClock=Math.max(0,this._hiveClock-dt);
    for(const hive of this.hives){hive.px=hive.x;hive.py=hive.y;hive.hit=Math.max(0,hive.hit-dt);}
    if(this._hiveClock<=1e-7&&this._hiveTravel>=200&&this.hives.length<2&&(this.endless||this.time<this.stageInfo.duration)){
      if(this._spawnHive()){this._hiveClock=this._range(70,95);this._hiveTravel=0;}
    }
    const nextWave=this.endless?1+Math.floor(this.time/30):Math.min(this.stageInfo.waves,1+Math.floor((this.time+1e-7)/30));
    if(nextWave!==this.wave){this.wave=nextWave;this._event('wave',q.x,q.y,{wave:this.wave});}
    const spawning=this.endless||this.time<this.stageInfo.duration;
    // A full arena delays an elite; it never cancels one or skips the final boss.
    for(let bossWave=5;bossWave<=this.wave;bossWave+=5){
      if(this._bossWaves.has(bossWave))continue;
      const boss=this._spawnEnemy('hornet',{boss:true,final:!this.endless&&bossWave===this.stageInfo.waves});
      if(boss)this._bossWaves.add(bossWave);
      break;
    }
    if(spawning){
      this._spawn-=dt;
      if(this._spawn<=0){this._spawnWavePack();this._spawn=Math.max(.16,.87-this.wave*.025)/(this.stage===2?1.2:1);}
    }
    this._weapons(dt);
    this._enemies(dt);
    this._projectiles(dt);
    this._areas(dt);
    this.enemies=this.enemies.filter(e=>e.hp>0);
    this.hives=this.hives.filter(e=>e.hp>0);
    this.shots=this.shots.filter(s=>s.life>0);
    this.zones=this.zones.filter(z=>z.life>0);
    if(q.hp<=0){q.hp=0;this.state='lost';return;}
    this._loot(dt);
    if(this.state==='playing')this._checkLevel();
    if(!this.endless&&this.time>=this.stageInfo.duration&&this.enemies.length===0){this.campaignComplete=true;this.state='won';this._event('victory',q.x,q.y,{stage:this.stage});}
  }
  _targets(){return this.hives.length?this.enemies.concat(this.hives):this.enemies;}
  _nearest(point,range=Infinity,exclude){
    // Guards protect the queen before spending a volley on an abandoned hive.
    for(const pool of [this.enemies,this.hives]){let target=null,best=range*range;for(const e of pool){if(e.hp<=0||(exclude&&exclude.has(e.id)))continue;const d=dist2(point,e);if(d<best){best=d;target=e;}}if(target)return target;}return null;
  }
  _spawnHive(){
    if(this.hives.length>=2)return null;const q=this.queen,distance=this._range(300,400);
    for(let i=0;i<16;i++){const a=q.angle+i*TAU/16+this._range(-.15,.15),x=q.x+Math.cos(a)*distance,y=q.y+Math.sin(a)*distance;
      if(x<85||x>WORLD-85||y<85||y>WORLD-85||this.hives.some(h=>dist2(h,{x,y})<180**2))continue;
      const hp=80+this.wave*5,hive={id:this._nextId++,type:'wildHive',name:'Abandoned Hive',x,y,px:x,py:y,hp,max:hp,r:25,hit:0,angle:0,color:'#d6ad56'};this.hives.push(hive);return hive;
    }return null;
  }
  _damageHive(hive,amount){
    if(hive.hp<=0||!Number.isFinite(amount)||amount<=0)return;hive.hp-=amount;hive.hit=.12;
    if(hive.hp>0)return;hive.hp=0;const healing=this._random()<.65;
    this._event('hive',hive.x,hive.y,{healing});this._event('kill',hive.x,hive.y,{enemyType:'wildHive',color:'#d6ad56',radius:25,angle:0});this._drop(healing?'honeycomb':'super',hive.x,hive.y,healing?35:10);
  }
  _spawnWavePack(){
    if(this.enemies.length>=MAX_ENEMIES)return;
    const unlock=this.wave+(this.stage===2?4:0),pool=['mite','moth'];
    if(unlock>=2)pool.push('gnat');if(unlock>=3)pool.push('beetle');if(unlock>=4)pool.push('wasp');if(unlock>=6)pool.push('spitter');if(unlock>=8)pool.push('splitter');
    const type=pool[Math.floor(this._random()*pool.length)],first=this._spawnEnemy(type);
    if(type==='gnat'&&first)for(let i=0;i<2;i++)this._spawnEnemy('gnat',{x:clamp(first.x+this._range(-35,35),20,WORLD-20),y:clamp(first.y+this._range(-35,35),20,WORLD-20)});
    if(this.wave>12&&this._random()<.18)this._spawnEnemy('mite');
  }
  _spawnEnemy(type,opts={}){
    if(this.enemies.length>=MAX_ENEMIES)return null;
    const def=ENEMIES[type];if(!def)return null;
    const a=this._range(0,TAU),radius=this._range(600,760),q=this.queen;
    let x=finite(opts.x,clamp(q.x+Math.cos(a)*radius,25,WORLD-25)),y=finite(opts.y,clamp(q.y+Math.sin(a)*radius,25,WORLD-25));
    // At a world edge a clamped spawn can be too close; choose the opposite side instead.
    if(opts.x===undefined&&Math.hypot(x-q.x,y-q.y)<370){x=clamp(q.x-Math.cos(a)*650,25,WORLD-25);y=clamp(q.y-Math.sin(a)*650,25,WORLD-25);}
    const tier=this.wave-1,stageFactor=this.stage===2?1.24:1,hp=def.hp*(1+tier*.12+tier*tier*.006)*stageFactor*(opts.final?1.5:1);
    const e={id:this._nextId++,type,name:def.name,x,y,px:x,py:y,hp,max:hp,speed:def.speed*Math.min(1.62,1+tier*.025)*(this.stage===2?1.06:1),r:def.r,boss:!!opts.boss,final:!!opts.final,armor:def.armor||0,hit:0,angle:Math.atan2(q.y-y,q.x-x),phase:this._range(0,TAU),timer:type==='hornet'?2:this._range(1.4,2.7),mode:'approach',chargeX:0,chargeY:0,color:def.color,behavior:def.behavior};
    this.enemies.push(e);return e;
  }
  _damage(e,amount){
    if(e.type==='wildHive'){this._damageHive(e,amount);return;}
    if(e.hp<=0||!Number.isFinite(amount)||amount<=0)return;
    e.hp-=amount*(1-(e.armor||0));e.hit=.1;
    if(amount>=5)this._event('hit',e.x,e.y,{enemyType:e.type,color:e.color,radius:e.r});
    if(e.hp>0)return;
    e.hp=0;this.kills++;this._pity++;
    this._event('kill',e.x,e.y,{enemyType:e.type,boss:e.boss,color:e.color,radius:e.r,angle:e.angle});
    this._drop('xp',e.x,e.y,ENEMIES[e.type].xp+(e.boss?Math.floor(this.wave/3):0));
    if(e.boss||this._pity>=80||this._random()<.008){this._drop('chest',e.x+15,e.y+5,1);this._pity=0;}
    else if(this._random()<.065)this._drop('health',e.x-8,e.y+10,10);
    if(e.type==='splitter')for(let i=0;i<3;i++)this._spawnEnemy('broodling',{x:clamp(e.x+this._range(-20,20),20,WORLD-20),y:clamp(e.y+this._range(-20,20),20,WORLD-20)});
  }
  _drop(type,x,y,value){
    if(this.drops.length>=MAX_DROPS){
      const xp=this.drops.find(d=>d.type==='xp');
      if(type==='xp'&&xp){xp.value+=value;return;}
      if(xp)this.drops.splice(this.drops.indexOf(xp),1);else return;
    }
    this.drops.push({id:this._nextId++,type,x,y,px:x,py:y,value,age:0});
  }
  _addShot(s){if(this.shots.length<MAX_SHOTS)this.shots.push({id:this._nextId++,px:s.x,py:s.y,r:5,hit:new Set(),...s});}
  _shotAt(target,damage,royal=false,spread=0){
    const q=this.queen,aim=Math.hypot(this.input.aimX,this.input.aimY)>.18;
    let a=aim?Math.atan2(this.input.aimY,this.input.aimX):Math.atan2(target.y-q.y,target.x-q.x);a+=spread;
    this._addShot({type:royal?'royal':'guard',x:q.x,y:q.y,vx:Math.cos(a)*520,vy:Math.sin(a)*520,life:2.1,damage,pierce:royal?4:1,targetId:target.id,homing:!aim,angle:a,color:royal?'#ffe29d':'#f2c76b'});
  }
  _weapons(dt){
    const q=this.queen,w=this.weapons;for(const k of Object.keys(this._timers))this._timers[k]-=dt;
    if(this.superWeaponTime>0){this._superTimer-=dt;if(this._superTimer<=0){for(let i=0;i<8;i++){const a=this.time*.6+i*TAU/8;this._addShot({type:'super',x:q.x,y:q.y,vx:Math.cos(a)*560,vy:Math.sin(a)*560,angle:a,life:1.9,damage:45,pierce:2,r:6,color:'#baf4da'});}this._superTimer=.5;}}
    if(w.jelly||this.fused.royal)q.hp=Math.min(q.max,q.hp+(this.fused.royal?2.6:w.jelly*.38)*dt);
    if((w.guard||this.fused.royal)&&this._timers.guard<=0){
      const target=this._nearest(q,900);if(target){const count=this.fused.royal?5:1+Math.floor(w.guard/2);for(let i=0;i<count;i++)this._shotAt(target,this.fused.royal?66:16+w.guard*8,this.fused.royal,(i-(count-1)/2)*.11);this._timers.guard=this.fused.royal?.72:Math.max(.85,2-w.guard*.22);}
    }
    if((w.pollen||this.fused.bloom)&&this._timers.pollen<=0){const target=this._nearest(q,750);if(target){const a=Math.atan2(target.y-q.y,target.x-q.x);this._addShot({type:'pollen',x:q.x,y:q.y,vx:Math.cos(a)*330,vy:Math.sin(a)*330,angle:a,life:2.4,damage:this.fused.bloom?105:28+w.pollen*13,pierce:1,blast:this.fused.bloom?128:52+w.pollen*11,sticky:this.fused.bloom,color:'#e7b45b'});this._timers.pollen=this.fused.bloom?1.5:Math.max(1.7,3-w.pollen*.15);}}
    if(w.propolis&&!this.fused.bloom&&this._timers.propolis<=0){this._zone(q.x,q.y,36+w.propolis*8,4,5+w.propolis*4,'propolis',.48);this._timers.propolis=2.5;}
    if(w.wing&&!this.fused.shield&&this._timers.wing<=0){const r=80+w.wing*17;this._burst(q.x,q.y,r,w.wing*17);for(const e of this.enemies){const d=Math.hypot(e.x-q.x,e.y-q.y);if(e.hp>0&&d<r+e.r&&d>0){e.x=clamp(e.x+(e.x-q.x)/d*65,10,WORLD-10);e.y=clamp(e.y+(e.y-q.y)/d*65,10,WORLD-10);}}this._timers.wing=3.7;}
    if(w.orbit||this.fused.shield){const count=this.fused.shield?9:w.orbit+1,r=this.fused.shield?104:64;for(let i=0;i<count;i++){const a=this.time*2.5+i*TAU/count,p={x:q.x+Math.cos(a)*r,y:q.y+Math.sin(a)*r};for(const e of this._targets()){if(e.hp>0&&dist2(e,p)<(e.r+13)**2){this._damage(e,(this.fused.shield?115:20+w.orbit*10)*dt);if(this.fused.shield&&e.type!=='wildHive'){const d=Math.hypot(e.x-q.x,e.y-q.y)||1;e.x+=(e.x-q.x)/d*95*dt;e.y+=(e.y-q.y)/d*95*dt;}}}}}
  }
  _zone(x,y,r,life,damage,kind,slow=1){if(this.zones.length>=MAX_ZONES)this.zones.shift();this.zones.push({id:this._nextId++,x,y,r,life,max:life,damage,kind,type:kind,slow:slow<1,slowFactor:slow,color:kind==='bloom'?'#dcb164':'#a47946'});}
  _burst(x,y,r,damage,sticky=false){this._event('burst',x,y,{radius:r,color:sticky?'#dcb164':'#f2d590'});for(const e of [...this._targets()])if(e.hp>0&&dist2(e,{x,y})<(r+e.r)**2)this._damage(e,damage);this._zone(x,y,r,sticky?3.8:.3,sticky?29:0,sticky?'bloom':'pulse',sticky?.43:1);}
  _enemies(dt){
    const q=this.queen;
    for(const e of [...this.enemies]){
      if(e.hp<=0)continue;e.px=e.x;e.py=e.y;e.hit=Math.max(0,e.hit-dt);e.timer-=dt;
      let dx=q.x-e.x,dy=q.y-e.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d,speed=e.speed;
      e.angle=Math.atan2(dy,dx);for(const z of this.zones)if(z.slow&&dist2(e,z)<(z.r+e.r*.4)**2)speed*=z.slowFactor;
      if(e.behavior==='weave'){const weave=Math.sin(this.time*3.2+e.phase)*.85;dx=ux-uy*weave;dy=uy+ux*weave;}
      else if(e.behavior==='swarm'){const flank=Math.sin(this.time*1.8+e.phase)*.65;dx=ux-uy*flank;dy=uy+ux*flank;}
      else if(e.behavior==='skitter'){const jitter=Math.sin(this.time*9+e.phase)*.35;dx=ux-uy*jitter;dy=uy+ux*jitter;}
      else if(e.behavior==='ranged'){
        if(e.timer<=0&&d<650){this._enemyShot(e,Math.atan2(uy,ux));e.timer=Math.max(.9,2.7-this.wave*.025);}
        if(d<250){dx=-ux;dy=-uy;}else if(d<340){dx=-uy*.5;dy=ux*.5;}else{dx=ux;dy=uy;}
      }else if(e.behavior==='charge'||e.behavior==='boss'){
        if(e.mode==='telegraph'){speed=0;dx=dy=0;if(e.timer<=0){e.mode='charge';e.timer=e.boss?.65:.48;}}
        else if(e.mode==='charge'){dx=e.chargeX;dy=e.chargeY;speed=e.boss?340:375;if(e.timer<=0){e.mode='approach';e.timer=e.boss?2.4:2.1;}}
        else{dx=ux;dy=uy;if(e.timer<=0&&d<700){e.mode='telegraph';e.timer=e.boss?.85:.65;e.chargeX=ux;e.chargeY=uy;if(e.boss){for(let i=-2;i<=2;i++)this._enemyShot(e,e.angle+i*.22);if(this.enemies.length<190)for(let i=0;i<3;i++)this._spawnEnemy('gnat',{x:e.x+this._range(-30,30),y:e.y+this._range(-30,30)});}}}
      }else{dx=ux;dy=uy;}
      const norm=Math.hypot(dx,dy)||1;e.x=clamp(e.x+dx/norm*speed*dt,8,WORLD-8);e.y=clamp(e.y+dy/norm*speed*dt,8,WORLD-8);
      if(q.inv<=0&&segmentDistance2(q.x,q.y,e.px,e.py,e.x,e.y)<(e.r+13)**2){q.hp-=e.boss?24:e.type==='gnat'?6:10;q.inv=.64;this._event('hit',q.x,q.y,{color:'#f3cf85',radius:18,player:true});}
    }
  }
  _enemyShot(e,a){this._addShot({type:'sap',faction:'enemy',x:e.x,y:e.y,vx:Math.cos(a)*205,vy:Math.sin(a)*205,angle:a,life:4.2,damage:e.boss?14:9,pierce:1,r:6,color:'#b9ca73'});}
  _projectiles(dt){
    for(const s of this.shots){
      if(s.life<=0)continue;s.px=s.x;s.py=s.y;s.life-=dt;
      if(s.homing){let target=this._targets().find(e=>e.id===s.targetId&&e.hp>0&&!s.hit.has(e.id));if(!target){target=this._nearest(s,850,s.hit);if(target)s.targetId=target.id;}if(target){const a=Math.atan2(target.y-s.y,target.x-s.x),speed=Math.hypot(s.vx,s.vy)||520;s.vx=Math.cos(a)*speed;s.vy=Math.sin(a)*speed;s.angle=a;}}
      s.x+=s.vx*dt;s.y+=s.vy*dt;
      if(s.faction==='enemy'){const q=this.queen;if(q.inv<=0&&segmentDistance2(q.x,q.y,s.px,s.py,s.x,s.y)<(13+s.r)**2){q.hp-=s.damage;q.inv=.64;s.life=0;this._event('hit',q.x,q.y,{player:true,color:'#b9ca73',radius:16});}continue;}
      const hits=this._targets().filter(e=>e.hp>0&&!s.hit.has(e.id)&&segmentDistance2(e.x,e.y,s.px,s.py,s.x,s.y)<(e.r+s.r)**2).sort((a,b)=>dist2(a,{x:s.px,y:s.py})-dist2(b,{x:s.px,y:s.py}));
      for(const e of hits){if(e.hp<=0)continue;s.hit.add(e.id);if(s.blast){this._burst(e.x,e.y,s.blast,s.damage,s.sticky);s.life=0;break;}this._damage(e,s.damage);if(--s.pierce<=0){s.life=0;break;}}
      if(s.life<=0&&s.blast&&!s.hit.size)this._burst(s.x,s.y,s.blast,s.damage,s.sticky);
    }
  }
  _areas(dt){for(const z of this.zones){z.life-=dt;if(z.damage>0)for(const e of [...this._targets()])if(e.hp>0&&dist2(e,z)<(z.r+e.r*.5)**2)this._damage(e,z.damage*dt);}}
  _loot(dt){
    const q=this.queen;let chest=null;
    for(const d of this.drops){d.px=d.x;d.py=d.y;d.age+=dt;let n=Math.hypot(d.x-q.x,d.y-q.y);const magnet=d.type==='chest'?100:155;
      if(n<magnet&&n>1){const travel=Math.min(n,Math.max(230,n*4)*dt);d.x+=(q.x-d.x)/n*travel;d.y+=(q.y-d.y)/n*travel;n=Math.hypot(d.x-q.x,d.y-q.y);}
      if(n<25){d.taken=true;if(d.type==='chest'&&!chest)chest=d;else if(d.type==='xp')this.xp+=d.value;else if(d.type==='health'||d.type==='honeycomb')q.hp=Math.min(q.max,q.hp+d.value);else if(d.type==='super'){this.superWeaponTime=10;this._superTimer=0;this._event('power',q.x,q.y,{color:'#baf4da',radius:45});}else if(d.type==='chest')d.taken=false;}
    }
    this.drops=this.drops.filter(d=>!d.taken);if(chest)this.collectChest(chest);
  }
  _eligible(){return Object.keys(WEAPONS).filter(k=>this.weapons[k]<5&&!Object.keys(FUSIONS).some(f=>this.fused[f]&&FUSIONS[f].pair.includes(k)));}
  _shuffle(array){for(let i=array.length-1;i>0;i--){const j=Math.floor(this._random()*(i+1));[array[i],array[j]]=[array[j],array[i]];}return array;}
  _checkLevel(){
    if(this.state!=='playing'||this.xp<this.need)return false;
    this.xp-=this.need;this.level++;this.need=8+(this.level-1)*4+Math.floor((this.level-1)**1.35);
    this.options=this._shuffle(this._eligible()).slice(0,3).map(id=>({id,name:WEAPONS[id].name,description:(this.weapons[id]?`Rank ${this.weapons[id]+1}/5. `:'New ability. ')+WEAPONS[id].description,color:WEAPONS[id].color,rank:this.weapons[id]+1}));
    if(this.options.length<3)this.options.push({id:'reserves',name:'Royal Reserves',description:'Gain 12 maximum health and recover 35 health.',color:'#ddb1b7'});
    if(this.options.length<3)this.options.push({id:'recovery',name:'Meadow Recovery',description:'Recover half your maximum health.',color:'#a9bf81'});
    this.state='levelup';return true;
  }
  _applyWeapon(id){if(!WEAPONS[id]||!this._eligible().includes(id))return false;this.weapons[id]++;if(id==='jelly'){this.queen.max+=8;this.queen.hp=Math.min(this.queen.max,this.queen.hp+16);}return true;}
  chooseUpgrade(id){
    if(this.state!=='levelup'||!this.options.some(o=>o.id===id))return false;
    if(id==='reserves'){this.queen.max+=12;this.queen.hp=Math.min(this.queen.max,this.queen.hp+35);}else if(id==='recovery')this.queen.hp=Math.min(this.queen.max,this.queen.hp+this.queen.max*.5);else if(!this._applyWeapon(id))return false;
    this.options=[];this.state='playing';this._checkLevel();return true;
  }
  collectChest(drop){
    if(this.state!=='playing')return false;
    if(drop){const index=this.drops.indexOf(drop);if(index>=0)this.drops.splice(index,1);}
    const fusion=Object.keys(FUSIONS).filter(k=>!this.fused[k]&&FUSIONS[k].pair.every(p=>this.weapons[p]>=5));
    if(fusion.length){const id=fusion[Math.floor(this._random()*fusion.length)],def=FUSIONS[id];this.pendingReward={id,name:def.name,description:def.description,fusion:true,color:def.color};}
    else{const eligible=this._eligible(),owned=eligible.filter(k=>this.weapons[k]>0),pool=owned.length?owned:eligible;if(pool.length){const id=pool[Math.floor(this._random()*pool.length)];this.pendingReward={id,name:WEAPONS[id].name,description:`Bonus rank ${this.weapons[id]+1}/5 and 20 health.`,fusion:false,color:WEAPONS[id].color};}else this.pendingReward={id:'cache',name:'Royal Cache',description:'Gain 15 maximum health and recover 50 health.',color:'#f1d091'};}
    this.state='chest';this._event('chest',drop?drop.x:this.queen.x,drop?drop.y:this.queen.y,{reward:this.pendingReward.name,fusion:!!this.pendingReward.fusion});return true;
  }
  claimReward(){
    if(this.state!=='chest'||!this.pendingReward)return false;const reward=this.pendingReward;
    if(reward.fusion){this.fused[reward.id]=true;this.queen.hp=Math.min(this.queen.max,this.queen.hp+30);}
    else if(reward.id==='cache'){this.queen.max+=15;this.queen.hp=Math.min(this.queen.max,this.queen.hp+50);}
    else{this._applyWeapon(reward.id);this.queen.hp=Math.min(this.queen.max,this.queen.hp+20);}
    this.pendingReward=null;this.state='playing';this._checkLevel();return true;
  }
  continueEndless(){if(this.state!=='won')return false;this.endless=true;this.state='playing';this.queen.hp=Math.max(this.queen.hp,this.queen.max*.6);return true;}
}
return {Game,WEAPONS,FUSIONS,ENEMIES,STAGES,WORLD,segmentDistance2};
});

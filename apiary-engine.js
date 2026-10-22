/* Apiary Defense v2 — original deterministic simulation. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ApiaryDefense=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const LIMITS={waves:50,bees:20,speedMultiplier:2.65,absoluteSpeed:340,maxMites:7};
const TYPES={
 moth:{name:'Wax moth',hp:24,speed:76,damage:4,reward:9,radius:20},
 beetle:{name:'Armored hive beetle',hp:65,speed:52,damage:7,reward:16,radius:22,armored:true},
 worm:{name:'Waxworm',hp:100,speed:47,damage:9,reward:18,radius:23},
 hornet:{name:'Hornet',hp:110,speed:87,damage:10,reward:26,radius:26},
 wasp:{name:'Wasp raider',hp:42,speed:125,damage:6,reward:17,radius:17},
 mouse:{name:'Mouse',hp:210,speed:58,damage:15,reward:34,radius:33},
 boss:{name:'Hornet matriarch',hp:950,speed:40,damage:24,reward:220,radius:48}
};
const UPGRADES={
 power:{title:'Packed snow',desc:'Make every snowball hit harder. Hold a shot to break through beetle armor.',base:45,growth:1.9,max:5},
 splash:{title:'Powder burst',desc:'Hit a wider area with each level. Fully upgraded, snowballs have double the splash reach.',base:55,growth:1.9,max:3},
 bees:{title:'Guard bee',desc:'Recruit one real flying defender, up to 20. Every bee attacks and returns independently.',base:38,growth:1.19,max:20},
 training:{title:'Bee training',desc:'No level limit. Increase guard damage and shorten cooldown to a 1-second minimum. After that, further levels increase damage only.',base:65,growth:2,max:Infinity},
 walls:{title:'Hive reinforcement',desc:'All hives gain 25 maximum health and 25 repairs. Destroyed hives stay lost.',base:55,growth:1.9,max:4},
 vaporizer:{title:'Oxalic acid vaporizer',desc:'Reduce damage from visible Varroa by 35% per level. It does not remove every mite.',base:65,growth:1.7,max:2},
 workers:{title:'Worker bees',desc:'Recruit up to 30. Slowly repair the weakest surviving hive during battle. More workers repair it faster.',base:50,growth:1.3,max:30},
 foragers:{title:'Scavenger bees',desc:'Recruit up to 30 nectar gatherers. Collect their honey bonus when you survive the wave. Best hired early.',base:45,growth:1.3,max:30},
 repair:{title:'Repair the apiary',desc:'Restore 35 health to every surviving hive.',base:35,growth:1,max:Infinity}
};
const SPECIALTIES={
 snow:{title:'Snowball specialist',desc:'+30% snowball damage and 15% shorter throwing cooldown. Choose one specialty per run.'},
 swarm:{title:'Swarm commander',desc:'Guard bees have 25% shorter cooldowns, with a 1-second minimum. Choose one specialty per run.'},
 care:{title:'Apiary steward',desc:'Hives take 20% less damage; brushing is 35% faster. Choose one specialty per run.'}
};
class Game{
 constructor(random=Math.random,mode='campaign'){this.random=random;this.mode=mode;this.reset(mode);}
 reset(mode=this.mode||'campaign'){
  this.mode=mode==='sandbox'?'sandbox':'campaign';this.endless=this.mode==='sandbox';
  this.state='ready';this.paused=false;this.wave=0;this.honey=80;this.score=0;this.time=0;this.elapsed=0;
  this.hives=[0,1,2].map(i=>({id:i,x:205,y:260+i*105,hp:120,max:120,mites:0,cleanTime:0}));
  this.enemies=[];this.projectiles=[];this.effects=[];this.guards=[];this.spawnQueue=[];this.brush=null;this.nectarBank=0;this.lastHarvest=0;this.workerTarget=null;
  this.upgrades={power:0,splash:0,bees:0,training:0,walls:0,vaporizer:0,workers:0,foragers:0,repair:0};this.specialty=null;this.cooldown=0;this.kills=0;this.nextId=1;
  this.discovered=new Set(['moth','varroa']);this.events=[];this.slowTime=0;this.smokerUsed=false;this.miteCheckIn=0;
  this.mothRaidIn=55+this.random()*55;this.mothRaid=null;this.mothRaidSerial=0;
  this.message='Fifty waves. Three hives. Choose your opening upgrades, then defend.';
 }
 emit(type,data={}){this.events.push({type,...data});if(this.events.length>100)this.events.shift();}
 living(){return this.hives.filter(h=>h.hp>0);}
 totalHealth(){return this.hives.reduce((n,h)=>n+h.hp,0);}
 miteCount(h){return h.hp>0?Math.floor(h.mites+1e-8):0;}
 infestation(){return this.hives.reduce((n,h)=>n+this.miteCount(h),0);}
 cost(id){const u=UPGRADES[id];if(!u)return Infinity;const n=this.upgrades[id];
  // Preserve the original opening prices, then keep uncapped training affordable
  // for continued progression instead of doubling its cost forever.
  const value=id==='training'&&n>=3?520*Math.pow(1.22,n-3):u.base*Math.pow(u.growth,n);
  return Math.min(Number.MAX_SAFE_INTEGER,Math.round(value));
 }
 canBuy(id){const u=UPGRADES[id];return !!u&&!this.paused&&['ready','between'].includes(this.state)&&this.upgrades[id]<u.max&&(this.mode==='sandbox'||Number.isFinite(this.cost(id))&&this.cost(id)>=0&&this.honey>=this.cost(id))&&(id!=='repair'||this.living().some(h=>h.hp<h.max));}
 buy(id){
  if(!this.canBuy(id))return false;if(this.mode!=='sandbox')this.honey-=this.cost(id);this.upgrades[id]++;
  if(id==='bees'){const i=this.guards.length;const homeX=245+i%5*31,homeY=125+Math.floor(i/5)*25;this.guards.push({id:i,cooldown:.2+i*.13,phase:'idle',target:null,x:homeX,y:homeY,homeX,homeY});}
  if(id==='walls')this.hives.forEach(h=>{h.max+=25;if(h.hp>0)h.hp=Math.min(h.max,h.hp+25);});
  if(id==='repair')this.hives.forEach(h=>{if(h.hp>0)h.hp=Math.min(h.max,h.hp+35);});
  this.message=UPGRADES[id].title+' purchased.';return true;
 }
 canSpecialize(id){return !!SPECIALTIES[id]&&!this.paused&&['ready','between'].includes(this.state)&&(this.mode==='sandbox'||this.wave>=7)&&!this.specialty&&(this.mode==='sandbox'||this.honey>=250);}
 specialize(id){if(!this.canSpecialize(id))return false;if(this.mode!=='sandbox')this.honey-=250;this.specialty=id;this.message=SPECIALTIES[id].title+' chosen for this run.';return true;}
 continueEndless(){if(this.state!=='won'||this.wave<50)return false;this.endless=true;this.state='between';this.message='Endless unlocked. Health and damage keep climbing; speed stays capped.';return true;}
 healthScale(wave=this.wave){const n=Math.max(0,wave-1);return 1+n*.065+n*n*.0015;}
 speedScale(wave=this.wave){return Math.min(LIMITS.speedMultiplier,1+Math.max(0,wave-1)*.065);}
 plan(wave){
  const count=Math.min(60,7+Math.floor(wave*1.35));const gap=Math.max(.35,1.05-wave*.018);const queue=[];
  for(let i=0;i<count;i++){
   let type='moth';
   if(wave>=2&&i%4===1)type='beetle';
   if(wave>=3&&i%6===2)type='worm';
   if(wave>=4&&i%6===3)type='hornet';
   if(wave>=6&&i%5===4)type='wasp';
   if(wave>=9&&i%9===7)type='mouse';
   if(wave>=12&&wave%4===0&&i%3===0)type='wasp';
   queue.push({at:.4+i*gap,type,lane:(i+wave)%3});
  }
  if(wave%10===0)queue.push({at:7,type:'boss',lane:1});
  else if(wave>=5&&wave%5===0)queue.push({at:5,type:'hornet',lane:1});
  return queue.sort((a,b)=>a.at-b.at);
 }
 startWave(){
  if(this.paused||!['ready','between'].includes(this.state)||!this.living().length||this.wave>=LIMITS.waves&&!this.endless)return false;
  this.wave++;this.state='wave';this.elapsed=0;this.smokerUsed=false;this.slowTime=0;this.spawnQueue=this.plan(this.wave);this.cooldown=0;this.brush=null;this.nectarBank=0;this.lastHarvest=0;this.workerTarget=null;
  this.miteCheckIn=8+this.random()*6;
  this.message=this.wave===50?'Final siege: hold the apiary!':`Wave ${this.wave}: defend the hives and brush off visible mites.`;
  return true;
 }
 spawn(type,lane=0){
  const d=TYPES[type];if(!d)return null;const n=Math.max(0,this.wave-1),scale=this.healthScale();
  const e={id:this.nextId++,type,x:1060+this.random()*35,y:230+lane*105,baseY:230+lane*105,hp:d.hp*scale,max:d.hp*scale,speed:Math.min(LIMITS.absoluteSpeed,d.speed*this.speedScale()),damage:d.damage*(1+n*.025),radius:d.radius,reward:d.reward+Math.floor(this.wave/8),attackTimer:0,phase:this.random()*6.28};
  this.enemies.push(e);this.discovered.add(type);return e;
 }
 nearestEnemy(){return this.enemies.reduce((a,e)=>e.hp>0&&(!a||e.x<a.x)?e:a,null);}
 nearestEnemyTo(point){let nearest=null,distance=Infinity;for(const e of this.enemies){if(e.hp<=0)continue;const d=Math.hypot(e.x-point.x,e.y-point.y);if(d<distance){nearest=e;distance=d;}}return nearest;}
 shoot(x,y,charge=0){
  if(this.state!=='wave'||this.paused||this.cooldown>0||this.brush)return false;
  charge=clamp(charge,0,1);x=clamp(x,265,1070);y=clamp(y,100,550);
  this.projectiles.push({x:99,y:345,sx:99,sy:345,tx:x,ty:y,t:0,duration:.18+Math.hypot(x-99,y-345)/2200,damage:(25+this.upgrades.power*12)*(1+charge*1.4)*(this.specialty==='snow'?1.3:1),radius:(48+charge*20)*(1+this.upgrades.splash/3),charge});
  this.cooldown=(.31+charge*.2)*(this.specialty==='snow'?.85:1);return true;
 }
 clearMites(id){
  const h=this.hives.find(h=>h.id===id);
  if(this.paused||this.state!=='wave'||this.brush||!h||!this.miteCount(h))return false;
  this.brush={hive:id,t:0,duration:this.specialty==='care'?1.17:1.8,cleared:false};
  this.message=`Brushing hive ${id+1}. Snowballs pause while the snowman works.`;return true;
 }
 smoke(){if(this.state!=='wave'||this.paused||this.smokerUsed)return false;this.smokerUsed=true;this.slowTime=5;this.message='Smoker cloud: five seconds of breathing room (game effect).';return true;}
 togglePause(){if(!['wave','ready','between'].includes(this.state))return false;this.paused=!this.paused;return this.paused;}
 varroaRate(h){const base=(.13+this.wave*.003)*(1-this.upgrades.vaporizer*.35)*(this.specialty==='care'?.8:1);return h?this.miteCount(h)*base:base;}
 beeDamage(){return 18+this.upgrades.training*10;}
 beeCooldown(){const level=this.upgrades.training,base=level<=3?3.6-level*.45:2.25/(1+(level-3)*.12);return Math.max(1,base*(this.specialty==='swarm'?.75:1));}
 hit(e,damage,kind='snow',charge=0){
  if(e.hp<=0)return;const armored=TYPES[e.type].armored;
  if(armored)damage*=kind==='bee'?.45:charge>=.6?1:.65;
  e.hp=Math.max(0,e.hp-damage);this.effects.push({x:e.x,y:e.y,text:'−'+Math.round(damage),life:.65,type:'hit'});
  if(e.hp===0){this.kills++;this.honey+=e.reward;this.score+=e.reward*10;this.effects.push({x:e.x,y:e.y,text:'+'+e.reward,life:1,type:'reward'});}
 }
 moveGuard(b,tx,ty,dt){const dx=tx-b.x,dy=ty-b.y,d=Math.hypot(dx,dy),step=1050*dt;if(d<=step){b.x=tx;b.y=ty;return true;}b.x+=dx/d*step;b.y+=dy/d*step;return false;}
 resetGuards(){this.guards.forEach(b=>{b.phase='idle';b.target=null;b.x=b.homeX;b.y=b.homeY;b.cooldown=.25+b.id*.1;});}
 tickMothRaid(dt){
  if(!this.mothRaid){
   this.mothRaidIn-=dt;if(this.mothRaidIn>0)return;
   const count=Math.min(36,14+Math.floor(this.wave*.45));this.mothRaid={id:++this.mothRaidSerial,phase:'warning',warning:1.8,pending:count,total:count,spawnIn:0,bonus:25+this.wave*2};
   this.message='Surprise moth raid! A bonus swarm is approaching.';this.emit('mothRaid',{phase:'warning',count});return;
  }
  const raid=this.mothRaid;
  if(raid.phase==='warning'){raid.warning-=dt;if(raid.warning>0)return;raid.phase='attack';this.message='Bonus moth raid! Clear the swarm for extra honey.';this.emit('mothRaid',{phase:'attack',count:raid.total});}
  raid.spawnIn-=dt;
  while(raid.pending>0&&raid.spawnIn<=0){const e=this.spawn('moth',(raid.total-raid.pending)%3);e.bonusRaid=raid.id;e.hp*=.55;e.max=e.hp;e.speed=Math.min(LIMITS.absoluteSpeed,e.speed*1.2);e.damage*=.65;e.radius=16;raid.pending--;raid.spawnIn+=.16;}
  if(!raid.pending&&!this.enemies.some(e=>e.bonusRaid===raid.id&&e.hp>0)){
   this.honey+=raid.bonus;this.score+=raid.bonus*10;this.message='Bonus moth raid cleared! +'+raid.bonus+' honey.';this.effects.push({x:630,y:180,text:'RAID CLEARED +'+raid.bonus+' HONEY',life:2,type:'reward'});this.emit('mothRaid',{phase:'cleared',bonus:raid.bonus});this.mothRaid=null;this.mothRaidIn=90+this.random()*90;
  }
 }
 step(dt){
  if(this.paused||this.state!=='wave')return;dt=clamp(Number.isFinite(dt)?dt:0,0,.1);if(!dt)return;
  this.time+=dt;this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.slowTime=Math.max(0,this.slowTime-dt);
  if(this.brush){const b=this.brush;b.t+=dt;const h=this.hives[b.hive];if(!b.cleared&&b.t>=b.duration*.55){h.mites=0;h.cleanTime=5;b.cleared=true;this.message=`Hive ${h.id+1} brushed clear. Watch for mites returning.`;this.effects.push({x:h.x,y:h.y-25,text:'MITES CLEARED',life:1.1,type:'clean'});}if(b.t>=b.duration)this.brush=null;}
  this.tickMothRaid(dt);
  while(this.spawnQueue.length&&this.spawnQueue[0].at<=this.elapsed){const s=this.spawnQueue.shift();this.spawn(s.type,s.lane);}
  for(const h of this.living())h.cleanTime=Math.max(0,h.cleanTime-dt);
  this.miteCheckIn-=dt;
  if(this.miteCheckIn<=0){
   this.miteCheckIn=6+this.random()*6;
   if(this.random()<Math.min(.7,.45+this.wave*.006)){
    const candidates=this.living().filter(h=>!h.cleanTime&&this.miteCount(h)<LIMITS.maxMites);
    if(candidates.length){const h=candidates[Math.min(candidates.length-1,Math.floor(this.random()*candidates.length))];h.mites=Math.min(LIMITS.maxMites,this.miteCount(h)+1);this.emit('infestation',{hive:h.id});if(!this.brush)this.message=`Varroa spotted on hive ${h.id+1}! Tap the hive to brush them off.`;}
   }
  }
  for(const h of this.living())h.hp=Math.max(0,h.hp-this.varroaRate(h)*dt);
  for(const e of this.enemies){
   if(e.hp<=0)continue;const h=this.living().reduce((a,h)=>!a||Math.abs(h.y-e.baseY)<Math.abs(a.y-e.baseY)?h:a,null);if(!h)break;
   const dx=h.x+70-e.x,dy=h.y-e.y,d=Math.hypot(dx,dy);
   if(d>7){const s=e.speed*(this.slowTime>0?.42:1)*dt;e.x+=dx/d*Math.min(s,d);e.y+=dy/d*Math.min(s,d);}
   else{e.attackTimer-=dt;if(e.attackTimer<=0){const dmg=e.damage*(this.specialty==='care'?.8:1);h.hp=Math.max(0,h.hp-dmg);e.attackTimer=1.05;this.effects.push({x:h.x,y:h.y-45,text:'−'+Math.round(dmg),life:.7,type:'hit'});}}
  }
  for(const p of this.projectiles){p.t+=dt/p.duration;const t=Math.min(1,p.t);p.x=p.sx+(p.tx-p.sx)*t;p.y=p.sy+(p.ty-p.sy)*t-Math.sin(t*Math.PI)*95;if(p.t>=1){for(const e of this.enemies)if(e.hp>0&&Math.hypot(e.x-p.tx,e.y-p.ty)<=p.radius+e.radius)this.hit(e,p.damage,'snow',p.charge);this.effects.push({x:p.tx,y:p.ty,r:p.radius,life:.32,type:'burst'});}}
  this.projectiles=this.projectiles.filter(p=>p.t<1);
  for(const b of this.guards){
   b.cooldown=Math.max(0,b.cooldown-dt);
   if(b.phase==='idle'&&b.cooldown<=0){const e=this.nearestEnemy();if(e){b.phase='outbound';b.target=e.id;b.cooldown=this.beeCooldown();}}
   if(b.phase==='outbound'){
    let e=this.enemies.find(e=>e.id===b.target&&e.hp>0);
    if(!e){e=this.nearestEnemyTo(b);b.target=e?e.id:null;}
    if(!e){b.phase='return';b.cooldown=0;}
    else if(this.moveGuard(b,e.x,e.y,dt)){this.hit(e,this.beeDamage(),'bee');b.phase='return';b.target=null;}
   }
   if(b.phase==='return'&&this.moveGuard(b,b.homeX,b.homeY,dt)){b.phase='idle';b.target=null;}
  }
  this.workerTarget=null;
  if(this.upgrades.workers){const h=this.living().filter(h=>h.hp<h.max).reduce((a,h)=>!a||h.hp/h.max<a.hp/a.max?h:a,null);if(h){this.workerTarget=h.id;h.hp=Math.min(h.max,h.hp+this.upgrades.workers*.22*dt);}}
  this.nectarBank=Math.min(this.upgrades.foragers*20,this.nectarBank+this.upgrades.foragers*.32*dt);
  this.enemies=this.enemies.filter(e=>e.hp>0);this.effects.forEach(e=>e.life-=dt);this.effects=this.effects.filter(e=>e.life>0);
  if(!this.living().length){this.state='lost';this.brush=null;this.message='The apiary fell. Rethink your build and try again.';this.emit('end',{won:false});return;}
  if(!this.spawnQueue.length&&!this.enemies.length&&!this.mothRaid){
   this.projectiles=[];this.brush=null;this.resetGuards();this.paused=false;this.lastHarvest=Math.floor(this.nectarBank);const bonus=20+this.wave*3+this.living().length*5+this.lastHarvest;this.honey+=bonus;this.score+=bonus*10;
   if(this.wave===LIMITS.waves&&!this.endless){this.state='won';this.message='All fifty waves survived. The apiary stands!';this.emit('end',{won:true});}
   else{this.state='between';this.message=`Wave ${this.wave} cleared! +${bonus} honey${this.lastHarvest?' (including '+this.lastHarvest+' foraged)':''}. Study the next raid before upgrading.`;}
  }
 }
}
return {Game,TYPES,UPGRADES,SPECIALTIES,LIMITS,clamp};
});

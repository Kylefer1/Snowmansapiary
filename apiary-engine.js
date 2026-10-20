/* Apiary Defense — original game simulation, independent of rendering. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ApiaryDefense=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const TYPES={
    moth:{name:'Wax moth',hp:22,speed:29,damage:3,reward:9,radius:20},
    beetle:{name:'Hive beetle',hp:48,speed:18,damage:5,reward:15,radius:21},
    hornet:{name:'Hornet',hp:85,speed:24,damage:8,reward:26,radius:26},
    boss:{name:'Hornet matriarch',hp:650,speed:10,damage:17,reward:160,radius:47}
  };
  const UPGRADES={
    power:{title:'Packed snow',desc:'Snowballs deal 10 more damage per level.',base:45,growth:1.65,max:5},
    splash:{title:'Powder burst',desc:'Snowball splash radius grows by 14.',base:55,growth:1.7,max:3},
    bees:{title:'Guard bee',desc:'Add a defender. Each bee attacks every 3.6 seconds.',base:38,growth:1.45,max:8},
    training:{title:'Bee training',desc:'Guard bees hit harder and recover faster.',base:65,growth:1.7,max:3},
    walls:{title:'Hive reinforcement',desc:'All hives gain 25 maximum health and 25 repairs.',base:55,growth:1.65,max:4},
    vaporizer:{title:'Oxalic acid vaporizer',desc:'Reduce ongoing Varroa damage by 35% per level (game effect).',base:65,growth:1.7,max:2},
    repair:{title:'Repair the apiary',desc:'Restore 35 health to every surviving hive.',base:35,growth:1,max:Infinity}
  };
  class Game{
    constructor(random=Math.random){this.random=random;this.reset();}
    reset(){
      this.state='ready';this.paused=false;this.wave=0;this.honey=80;this.score=0;this.time=0;this.elapsed=0;
      this.hives=[0,1,2].map(i=>({id:i,x:205,y:260+i*105,hp:120,max:120}));
      this.enemies=[];this.projectiles=[];this.beeFlights=[];this.effects=[];this.guards=[];this.spawnQueue=[];
      this.upgrades={power:0,splash:0,bees:0,training:0,walls:0,vaporizer:0,repair:0};this.cooldown=0;this.kills=0;this.nextId=1;
      this.discovered=new Set(['moth','varroa']);this.events=[];this.slowTime=0;this.smokerUsed=false;
      this.message='Protect three hives through ten waves. Prepare your apiary, then start wave 1.';
    }
    emit(type,data={}){this.events.push({type,...data});if(this.events.length>100)this.events.shift();}
    living(){return this.hives.filter(h=>h.hp>0);}
    totalHealth(){return this.hives.reduce((n,h)=>n+h.hp,0);}
    cost(id){const u=UPGRADES[id];return u?Math.round(u.base*Math.pow(u.growth,this.upgrades[id])):Infinity;}
    canBuy(id){const u=UPGRADES[id];return !!u&&!this.paused&&['ready','between'].includes(this.state)&&this.upgrades[id]<u.max&&this.honey>=this.cost(id)&&(id!=='repair'||this.living().some(h=>h.hp<h.max));}
    buy(id){
      if(!this.canBuy(id))return false;
      this.honey-=this.cost(id);this.upgrades[id]++;
      if(id==='bees')this.guards.push({id:this.guards.length,cooldown:.25+this.guards.length*.35});
      if(id==='walls')this.hives.forEach(h=>{h.max+=25;if(h.hp>0)h.hp=Math.min(h.max,h.hp+25);});
      if(id==='repair')this.hives.forEach(h=>{if(h.hp>0)h.hp=Math.min(h.max,h.hp+35);});
      this.message=UPGRADES[id].title+' purchased.';this.emit('upgrade',{id});return true;
    }
    startWave(){
      if(this.paused||!['ready','between'].includes(this.state)||!this.living().length||this.wave>=10)return false;
      this.wave++;this.state='wave';this.elapsed=0;this.smokerUsed=false;this.slowTime=0;this.spawnQueue=[];
      const count=5+this.wave*2;
      for(let i=0;i<count;i++){
        let type='moth';
        if(this.wave>=2&&i%3===1)type='beetle';
        if(this.wave>=4&&i%5===3)type='hornet';
        this.spawnQueue.push({at:1+i*(this.wave<4?1.6:1.25),type,lane:i%3});
      }
      if(this.wave===5)this.spawnQueue.push({at:8,type:'hornet',lane:1});
      if(this.wave===10)this.spawnQueue.push({at:12,type:'boss',lane:1});
      this.spawnQueue.sort((a,b)=>a.at-b.at);this.cooldown=0;
      this.message=this.wave===10?'Final wave: the hornet matriarch approaches!':'Wave '+this.wave+' — protect the apiary!';
      this.emit('wave',{wave:this.wave});return true;
    }
    spawn(type,lane=0){
      const data=TYPES[type];if(!data)return null;
      const scale=1+(this.wave-1)*.065;
      const e={id:this.nextId++,type,x:1050+this.random()*45,y:230+lane*105,baseY:230+lane*105,hp:data.hp*scale,max:data.hp*scale,speed:data.speed*(1+(this.wave-1)*.015),damage:data.damage,radius:data.radius,reward:data.reward,attackTimer:0,phase:this.random()*6.28};
      this.enemies.push(e);if(!this.discovered.has(type)){this.discovered.add(type);this.emit('discover',{id:type});}return e;
    }
    nearestEnemy(){const alive=this.enemies.filter(e=>e.hp>0);return alive.reduce((a,e)=>!a||e.x<a.x?e:a,null);}
    shoot(x,y,charge=0){
      if(this.state!=='wave'||this.paused||this.cooldown>0)return false;
      charge=clamp(charge,0,1);x=clamp(x,265,1070);y=clamp(y,100,550);
      this.projectiles.push({x:99,y:345,sx:99,sy:345,tx:x,ty:y,t:0,duration:.30+Math.hypot(x-99,y-345)/1700,damage:(24+this.upgrades.power*10)*(1+charge*1.05),radius:48+this.upgrades.splash*14+charge*20,charge});
      this.cooldown=.29+charge*.25;this.emit('throw');return true;
    }
    smoke(){if(this.state!=='wave'||this.paused||this.smokerUsed)return false;this.smokerUsed=true;this.slowTime=5;this.message='Smoker cloud: enemies slowed for 5 seconds. A fictional game ability.';this.emit('smoke');return true;}
    togglePause(){if(!['wave','ready','between'].includes(this.state))return false;this.paused=!this.paused;return this.paused;}
    varroaRate(){return this.state==='wave'?(.11+this.wave*.022)*(1-this.upgrades.vaporizer*.35):0;}
    beeDamage(){return 16+this.upgrades.training*8;}
    beeCooldown(){return 3.6-this.upgrades.training*.45;}
    hit(enemy,damage){if(enemy.hp<=0)return;enemy.hp=Math.max(0,enemy.hp-damage);this.effects.push({x:enemy.x,y:enemy.y,text:'−'+Math.round(damage),life:.65,type:'hit'});if(enemy.hp===0){this.kills++;this.honey+=enemy.reward;this.score+=enemy.reward*10;this.effects.push({x:enemy.x,y:enemy.y,text:'+'+enemy.reward,life:1,type:'reward'});this.emit('kill',{enemyType:enemy.type});}}
    step(dt){
      if(this.paused||this.state!=='wave')return;
      dt=clamp(Number.isFinite(dt)?dt:0,0,.1);if(dt===0)return;
      this.time+=dt;this.elapsed+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.slowTime=Math.max(0,this.slowTime-dt);
      while(this.spawnQueue.length&&this.spawnQueue[0].at<=this.elapsed){const s=this.spawnQueue.shift();this.spawn(s.type,s.lane);}
      const rate=this.varroaRate();this.hives.forEach(h=>{if(h.hp>0)h.hp=Math.max(0,h.hp-rate*dt);});
      for(const e of this.enemies){
        if(e.hp<=0)continue;const h=this.living().reduce((a,h)=>!a||Math.abs(h.y-e.baseY)<Math.abs(a.y-e.baseY)?h:a,null);if(!h)break;
        const tx=h.x+70,ty=h.y;const dx=tx-e.x,dy=ty-e.y,d=Math.hypot(dx,dy);
        if(d>7){const s=e.speed*(this.slowTime>0?.42:1)*dt;e.x+=dx/d*Math.min(s,d);e.y+=dy/d*Math.min(s,d);}
        else{e.attackTimer-=dt;if(e.attackTimer<=0){h.hp=Math.max(0,h.hp-e.damage);e.attackTimer=1.25;this.effects.push({x:h.x,y:h.y-45,text:'−'+e.damage,life:.7,type:'hit'});}}
      }
      for(const p of this.projectiles){
        p.t+=dt/p.duration;const t=Math.min(1,p.t);p.x=p.sx+(p.tx-p.sx)*t;p.y=p.sy+(p.ty-p.sy)*t-Math.sin(t*Math.PI)*95;
        if(p.t>=1){for(const e of this.enemies)if(e.hp>0&&Math.hypot(e.x-p.tx,e.y-p.ty)<=p.radius+e.radius)this.hit(e,p.damage);this.effects.push({x:p.tx,y:p.ty,r:p.radius,life:.32,type:'burst'});}
      }
      this.projectiles=this.projectiles.filter(p=>p.t<1);
      for(const b of this.guards){b.cooldown-=dt;if(b.cooldown<=0){const e=this.nearestEnemy();if(e){this.beeFlights.push({target:e.id,x:200,y:190+b.id*12,life:.38});b.cooldown=this.beeCooldown();}else b.cooldown=0;}}
      for(const f of this.beeFlights){f.life-=dt;const e=this.enemies.find(e=>e.id===f.target);if(e&&e.hp>0){f.x+=(e.x-f.x)*Math.min(1,dt*9);f.y+=(e.y-f.y)*Math.min(1,dt*9);if(f.life<=0)this.hit(e,this.beeDamage());}}
      this.beeFlights=this.beeFlights.filter(f=>f.life>0);
      this.enemies=this.enemies.filter(e=>e.hp>0);this.effects.forEach(e=>e.life-=dt);this.effects=this.effects.filter(e=>e.life>0);
      if(this.living().length===0){this.state='lost';this.message='The apiary fell. Try different upgrades and defend again.';this.emit('end',{won:false});return;}
      if(!this.spawnQueue.length&&!this.enemies.length){
        this.projectiles=[];this.beeFlights=[];this.paused=false;
        const bonus=25+this.wave*5+this.living().length*5;this.honey+=bonus;this.score+=bonus*10;
        if(this.wave===10){this.state='won';this.message='Apiary defended! All ten waves cleared.';this.emit('end',{won:true});}
        else{this.state='between';this.message='Wave '+this.wave+' cleared! +'+bonus+' honey. Repair or upgrade before the next wave.';this.emit('clear',{wave:this.wave,bonus});}
      }
    }
  }
  return {Game,TYPES,UPGRADES,clamp};
});

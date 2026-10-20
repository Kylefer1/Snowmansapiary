/* Apiary Defense — original artwork, controls and canvas presentation. */
'use strict';
(()=>{
const {Game,TYPES,UPGRADES,clamp}=ApiaryDefense;
const $=id=>document.getElementById(id),canvas=$('battlefield'),ctx=canvas.getContext('2d');
if(!ctx){$('loading').textContent='Canvas is unavailable in this browser. Please try a current browser.';return;}
const game=new Game();
const images={},names={landscape:'landscape.svg',snowman:'snowman.svg',hive:'hive.svg',bee:'guard-bee.svg',moth:'wax-moth.svg',beetle:'hive-beetle.svg',hornet:'hornet.svg',vaporizer:'vaporizer.svg'};
let scale=1,offsetX=0,offsetY=0,viewW=1100,viewH=600,last=0,artReady=false,visualTime=0,lastHud='',dialogPause=false,charging=false,chargeStart=0,pointerId=null,aim={x:700,y:330},keyboardIndex=0,throwFlash=0,endShown=false,best=0;
const systemMotion=matchMedia('(prefers-reduced-motion: reduce)');let reduced=systemMotion.matches;
try{const saved=localStorage.getItem('snowmans_apiary_defense_motion');if(saved!==null)reduced=saved==='true';const b=Number(localStorage.getItem('snowmans_apiary_defense_best'));if(Number.isSafeInteger(b)&&b>0)best=b;}catch{}
$('motion').checked=reduced;
$('motion').addEventListener('change',()=>{reduced=$('motion').checked;try{localStorage.setItem('snowmans_apiary_defense_motion',String(reduced));}catch{}});
systemMotion.addEventListener('change',e=>{reduced=e.matches;$('motion').checked=reduced;});
function resize(){const rect=canvas.getBoundingClientRect();viewW=rect.width;viewH=rect.height;const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(viewW*dpr);canvas.height=Math.round(viewH*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);scale=Math.min(viewW/1100,viewH/600);offsetX=(viewW-1100*scale)/2;offsetY=(viewH-600*scale)/2;draw();}
new ResizeObserver(resize).observe(canvas);
function image(key,x,y,w,h,frame=0,flip=false){
 const img=images[key];if(!img||!img.complete||!img.naturalWidth){ctx.fillStyle='#e2bf6e';ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/3,h/3,0,0,Math.PI*2);ctx.fill();return;}
 const sw=['bee','moth','beetle','hornet'].includes(key)?128:key==='snowman'?256:img.naturalWidth;
 ctx.save();if(flip){ctx.translate(x+w,y);ctx.scale(-1,1);x=0;y=0;}
 ctx.drawImage(img,frame*sw,0,sw,img.naturalHeight,x,y,w,h);ctx.restore();
}
function round(x,y,w,h,r=8){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function text(t,x,y,size=16,color='#263d32',align='left'){ctx.fillStyle=color;ctx.font=`700 ${size}px system-ui`;ctx.textAlign=align;ctx.fillText(t,x,y);}
function health(x,y,w,value,max){ctx.fillStyle='#233c37b8';round(x,y,w,7,3);ctx.fill();ctx.fillStyle=value/max>.35?'#587e49':'#bb6549';round(x,y,w*Math.max(0,value/max),7,3);ctx.fill();}
function season(){return game.wave<4?'SPRING':game.wave<7?'SUMMER':game.wave<10?'AUTUMN':'WINTER';}
function draw(){
 if(!ctx)return;ctx.clearRect(0,0,viewW,viewH);ctx.fillStyle='#1e3731';ctx.fillRect(0,0,viewW,viewH);
 ctx.save();ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);
 image('landscape',0,0,1100,600);
 if(game.wave>=7&&game.wave<10){ctx.fillStyle='#b1783b25';ctx.fillRect(0,0,1100,600);}
 if(game.wave===10){ctx.fillStyle='#d4e9ed77';ctx.fillRect(0,0,1100,600);}
 ctx.fillStyle='#59714935';round(260,190,820,350,40);ctx.fill();
 ctx.setLineDash([7,14]);ctx.strokeStyle='#ebedbb50';ctx.lineWidth=2;
 for(const h of game.hives){ctx.beginPath();ctx.moveTo(290,h.y+35);ctx.lineTo(1100,h.y+35);ctx.stroke();}ctx.setLineDash([]);
 text('THE APIARY',150,185,12,'#365544');
 for(const h of game.hives){
  if(h.hp<=0){ctx.globalAlpha=.4;image('hive',h.x-54,h.y-62,108,108);ctx.globalAlpha=1;text('LOST',h.x,h.y+54,12,'#6b4535','center');continue;}
  image('hive',h.x-54,h.y-62,108,108);health(h.x-42,h.y-65,84,h.hp,h.max);text(Math.ceil(h.hp)+' / '+h.max,h.x,h.y+57,11,'#314c39','center');
  if(game.upgrades.walls){ctx.strokeStyle='#86988b';ctx.lineWidth=4;ctx.strokeRect(h.x-42,h.y-22,84,6);}
 }
 image('snowman',10,290,165,165,throwFlash>0?1:0);
 text('SNOWMAN',93,473,11,'#354e3b','center');
 if(game.upgrades.vaporizer){image('vaporizer',83,475,69,69);text('VARROA −'+game.upgrades.vaporizer*35+'%',125,562,10,'#355442','center');
  if(!reduced&&game.state==='wave'){ctx.strokeStyle='#eaf3d3b0';ctx.lineWidth=3;for(let i=0;i<3;i++){const t=(visualTime*.7+i*.33)%1;ctx.globalAlpha=1-t;ctx.beginPath();ctx.arc(142+t*17,479-t*33,5+t*8,0,Math.PI*1.3);ctx.stroke();}ctx.globalAlpha=1;}}
 const frame=reduced?0:Math.floor(visualTime*9)%2;
 for(const b of game.guards){const y=130+b.id*12;image('bee',240+(b.id%4)*31,y,42,42,frame,true);}
 const sorted=[...game.enemies].sort((a,b)=>a.y-b.y);
 for(const e of sorted){
  const fly=e.type==='beetle'?0:reduced?0:Math.sin(visualTime*4+e.phase)*4;
  const w=e.type==='boss'?150:e.type==='hornet'?91:e.type==='beetle'?64:78;const key=e.type==='boss'?'hornet':e.type;
  ctx.save();if(e.type==='boss'){ctx.shadowColor='#ab734e66';ctx.shadowBlur=13;}
  image(key,e.x-w/2,e.y-w/2+fly,w,w,frame);ctx.restore();
  health(e.x-w*.4,e.y-w*.45-8,w*.8,e.hp,e.max);
  if(e.type==='boss'){text('MATRIARCH',e.x,e.y-w*.45-17,12,'#653f28','center');}
 }
 for(const f of game.beeFlights)image('bee',f.x-19,f.y-19,38,38,frame,true);
 for(const p of game.projectiles){ctx.fillStyle='#f9ffff';ctx.strokeStyle='#95c5d0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,7+p.charge*7,0,Math.PI*2);ctx.fill();ctx.stroke();}
 if(game.slowTime>0){ctx.fillStyle='#e7e7c130';for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(450+i*170,340,110,170,0,0,Math.PI*2);ctx.fill();}text('SMOKER CLOUD',650,175,12,'#385144','center');}
 if(!reduced)for(const e of game.effects){ctx.save();ctx.globalAlpha=Math.min(1,e.life*2);if(e.type==='burst'){ctx.strokeStyle='#f8ffff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,e.r*(1-e.life/.32),0,Math.PI*2);ctx.stroke();}else text(e.text,e.x,e.y-(1-e.life)*30,15,e.type==='reward'?'#756021':'#854b35','center');ctx.restore();}
 if(game.state==='wave'&&!game.paused){ctx.strokeStyle='#fffdeb';ctx.lineWidth=2;ctx.beginPath();ctx.arc(aim.x,aim.y,16,0,Math.PI*2);ctx.moveTo(aim.x-24,aim.y);ctx.lineTo(aim.x-10,aim.y);ctx.moveTo(aim.x+10,aim.y);ctx.lineTo(aim.x+24,aim.y);ctx.stroke();}
 if(game.state==='ready'||game.state==='between'){
  ctx.fillStyle='#1a352bd9';round(410,80,500,80,14);ctx.fill();text(game.state==='ready'?'A little snow. A lot to protect.':'A moment to rebuild.',660,113,24,'#f4dfac','center');text('Visit Upgrades, then start the next wave below.',660,140,14,'#d9e7ce','center');}
 ctx.restore();
}
function chargeValue(){return charging?clamp((performance.now()-chargeStart)/950,0,1):0;}
function cancelCharge(){charging=false;pointerId=null;$('charge').hidden=true;}
function pointerPoint(e){const r=canvas.getBoundingClientRect();return {x:clamp((e.clientX-r.left-offsetX)/scale,265,1070),y:clamp((e.clientY-r.top-offsetY)/scale,100,550)};}
function fire(x,y,charge){
 const near=game.enemies.filter(e=>e.hp>0).reduce((a,e)=>!a||Math.hypot(e.x-x,e.y-y)<Math.hypot(a.x-x,a.y-y)?e:a,null);
 if(near&&Math.hypot(near.x-x,near.y-y)<70){x=near.x;y=near.y;}
 if(game.shoot(x,y,charge))throwFlash=.18;
}
canvas.addEventListener('pointerdown',e=>{if(e.button!==0||game.state!=='wave'||game.paused||charging)return;e.preventDefault();canvas.focus({preventScroll:true});aim=pointerPoint(e);charging=true;chargeStart=performance.now();pointerId=e.pointerId;canvas.setPointerCapture(e.pointerId);$('charge').hidden=false;});
canvas.addEventListener('pointermove',e=>{if(pointerId!==null&&pointerId!==e.pointerId)return;aim=pointerPoint(e);});
canvas.addEventListener('pointerup',e=>{if(!charging||pointerId!==e.pointerId)return;aim=pointerPoint(e);const value=chargeValue();cancelCharge();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);fire(aim.x,aim.y,value);});
canvas.addEventListener('pointercancel',cancelCharge);canvas.addEventListener('lostpointercapture',cancelCharge);
canvas.addEventListener('keydown',e=>{
 if(e.code==='Space'){e.preventDefault();if(e.repeat)return;const alive=[...game.enemies].sort((a,b)=>a.x-b.x);const target=alive[Math.min(keyboardIndex,alive.length-1)];if(target){aim={x:target.x,y:target.y};fire(aim.x,aim.y,0);}else fire(aim.x,aim.y,0);}
 if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();const alive=[...game.enemies].sort((a,b)=>a.x-b.x);keyboardIndex=clamp(keyboardIndex+(e.code==='ArrowRight'?1:-1),0,Math.max(0,alive.length-1));const target=alive[keyboardIndex];if(target)aim={x:target.x,y:target.y};}
 if(e.code==='KeyP'){e.preventDefault();game.togglePause();cancelCharge();updateHud();}
});
document.addEventListener('visibilitychange',()=>{last=performance.now();cancelCharge();if(document.hidden&&game.state==='wave'&&!game.paused){game.paused=true;game.message='Paused while you were away. Resume when you’re ready.';updateHud();}});
window.addEventListener('blur',cancelCharge);
$('nextWave').addEventListener('click',()=>{if(game.startWave()){canvas.focus({preventScroll:true});updateHud();}});
$('pauseButton').addEventListener('click',()=>{game.togglePause();cancelCharge();updateHud();});
$('smokeButton').addEventListener('click',()=>{game.smoke();updateHud();});
function openDialog(id){cancelCharge();dialogPause=game.paused;game.paused=true;$(id).showModal();updateHud();}
function closeDialog(id){$(id).close();}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close)));
for(const id of ['shopDialog','manualDialog'])$(id).addEventListener('close',()=>{game.paused=dialogPause;last=performance.now();updateHud();if(id==='manualDialog'&&endShown&&['won','lost'].includes(game.state)&&!$('endDialog').open)$('endDialog').showModal();});
$('endDialog').addEventListener('cancel',e=>e.preventDefault());
$('shopButton').addEventListener('click',()=>{renderShop();openDialog('shopDialog');});
function renderShop(){
 $('shopBalance').textContent=game.honey+' honey available';const grid=$('shopGrid');grid.replaceChildren();
 for(const [id,u] of Object.entries(UPGRADES)){
  const card=document.createElement('section');card.className='shopCard';
  const h=document.createElement('h3');h.textContent=u.title;card.append(h);
  const level=document.createElement('div');level.className='level';level.textContent=id==='repair'?'Service':`Level ${game.upgrades[id]} / ${u.max}`;card.append(level);
  const p=document.createElement('p');p.textContent=u.desc;card.append(p);
  const button=document.createElement('button');button.type='button';button.dataset.upgrade=id;
  const max=game.upgrades[id]>=u.max;
  // Shopping pauses the simulation, but buying remains available in preparation.
  const wasPaused=game.paused;game.paused=false;const can=game.canBuy(id);game.paused=wasPaused;
  button.disabled=!can;button.textContent=max?'Fully upgraded':(id==='repair'?'Repair':'Buy')+' · '+game.cost(id)+' honey';
  button.addEventListener('click',()=>{const was=game.paused;game.paused=false;game.buy(id);game.paused=was;renderShop();updateHud();const next=$('shopGrid').querySelector(`[data-upgrade="${id}"]`);if(next&&!next.disabled)next.focus();else $('shopDialog').querySelector('[data-close]').focus();});card.append(button);grid.append(card);
 }
}
const entries={
 how:{title:'Welcome to the apiary.',html:'<p>You’re a snowman beekeeper with three hives to protect. Survive ten waves, including the final hornet boss.</p><h4>Snowballs & guard bees</h4><p>Tap or click an approaching pest to throw. Hold briefly for a bigger, stronger snowball. Snowballs have a short cooldown and burst on landing. Guard bees automatically attack the pest closest to the hives; every bee has its own cooldown.</p><h4>Earn, prepare, defend</h4><p>Defeated pests earn honey, and clearing a wave adds a bonus. Buy upgrades and repair surviving hives between waves. Lost hives cannot be rebuilt during a run. Use the smoker once per wave for a short slowing cloud.</p><h4>Controls</h4><p>Mouse or touch: aim and release on the battlefield. Keyboard: focus the battlefield, ← / → selects a target, Space throws, P pauses. Open this manual whenever you need a break.</p><div class="biologyNote"><p>This is an illustrated arcade fantasy. Snowball combat, returning guard bees, smoker slowdown and upgrade percentages are fictional game systems.</p></div>'},
 moth:{title:'Wax moths',sprite:'wax-moth.svg',html:'<h4>In the game</h4><p>Fast, fragile raiders. A well-placed snowball can catch several. They appear from wave 1.</p><h4>In a real apiary</h4><p>Waxworms are the larvae of wax moths. These larvae tunnel through comb, leaving silk webbing and debris. Stored comb and colonies unable to guard their space are especially vulnerable. The adult moth is not the stage chewing through comb.</p><p>Strong colonies, sensible space management and protected comb storage help. Moths discovered after a colony dies may be taking advantage of its loss, rather than explaining what killed it.</p>'},
 beetle:{title:'Small hive beetles',sprite:'hive-beetle.svg',html:'<h4>In the game</h4><p>Slower enemies with more health. Charged snowballs and guard bees help wear them down. They start appearing in wave 2.</p><h4>In a real apiary</h4><p>Small hive beetle larvae can damage comb and cause honey to ferment and become slimy. Larvae eventually leave the hive and pupate in soil.</p><p>Colony strength, appropriate hive space and clean, prompt honey handling matter. Seeing an adult beetle is different from finding a destructive larval infestation. Our large marching beetles are an arcade illustration.</p>'},
 hornet:{title:'Hornets & the matriarch',sprite:'hornet.svg',html:'<h4>In the game</h4><p>Tough flying attackers appear from wave 4. The oversized hornet matriarch arrives in wave 10. Save the smoker cloud, aim charged snowballs and keep your guard bees trained.</p><h4>In a real apiary</h4><p>Some social wasps prey on honey bees. The threat depends on the species, location and circumstances; the game’s hornet is a fictional composite, not an identification guide for southwest Kansas.</p><p>The “matriarch” boss, her size and her attack patterns are invented for this game. Do not use the artwork to identify a real insect or disturb an unknown nest.</p>'},
 varroa:{title:'Varroa & the vaporizer',image:'vaporizer.svg',html:'<h4>In the game</h4><p>Varroa causes a small, continuous health loss to surviving hives during active waves. It is background pressure, rather than a giant flying enemy.</p><p>The oxalic acid vaporizer is a base upgrade: level 1 reduces that damage by 35%; level 2 reduces it by 70% in total. These are invented balance values, not real-world treatment efficacy. It does not damage moths, beetles or hornets.</p><h4>In a real apiary</h4><p>Varroa is a parasitic mite associated with serious bee-health problems and viral transmission. Oxalic acid vaporization targets mites on adult bees but does not reach those protected inside capped brood. Monitoring and follow-up matter.</p><div class="biologyNote"><p>Real treatments must follow the current label on the actual registered product, including protective equipment and application restrictions. This game provides no dose, recipe or treatment schedule. At Snowman’s Apiary, Kyle uses oxalic acid vapor treatments when necessary.</p></div>'}
};
function manual(id){
 const e=entries[id]||entries.how,container=$('manualEntry');container.className='manualEntry';container.replaceChildren();
 if(e.sprite){const art=document.createElement('div');art.className='manualSprite';art.style.backgroundImage=`url("apiary-art/${e.sprite}")`;art.setAttribute('aria-hidden','true');container.append(art);}
 if(e.image){const art=document.createElement('img');art.className='manualArt';art.src='apiary-art/'+e.image;art.alt='Illustrated apiary vaporizer';container.append(art);}
 const h=document.createElement('h3');h.textContent=e.title;container.append(h);const content=document.createElement('div');content.innerHTML=e.html;container.append(content);
 document.querySelectorAll('[data-entry]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.entry===id)));
}
document.querySelectorAll('[data-entry]').forEach(b=>b.addEventListener('click',()=>manual(b.dataset.entry)));
$('manualButton').addEventListener('click',()=>{manual('how');openDialog('manualDialog');});
$('reviewButton').addEventListener('click',()=>{$('endDialog').close();manual('how');openDialog('manualDialog');});
$('restartButton').addEventListener('click',()=>{$('endDialog').close();game.reset();endShown=false;lastHud='';cancelCharge();updateHud();draw();});
function updateHud(){
 const values=[game.wave,game.honey,game.score,game.living().length,game.state,game.paused,game.upgrades.vaporizer,game.smokerUsed,game.message,best].join('|');
 if(values===lastHud)return;lastHud=values;
 $('wave').textContent=game.wave+' / 10';$('honey').textContent=game.honey;$('hives').textContent=game.living().length+' / 3';$('score').textContent=game.score;$('best').textContent=best;
 $('miteRate').textContent=game.upgrades.vaporizer*35+'% reduction';$('message').textContent=game.message;
 $('nextWave').textContent=game.wave===0?'Start wave 1':game.state==='wave'?'Wave '+game.wave+' in progress':'Start wave '+(game.wave+1);
 $('nextWave').disabled=game.paused||!['ready','between'].includes(game.state);
 $('shopButton').disabled=game.paused||!['ready','between'].includes(game.state);
 $('smokeButton').disabled=game.state!=='wave'||game.paused||game.smokerUsed;
 $('smokeButton').innerHTML=game.smokerUsed?'Smoker used<span>Resets next wave</span>':'Smoker cloud<span>Once per wave</span>';
 $('pauseButton').textContent=game.paused?'Resume':'Pause';$('pauseButton').disabled=!['ready','between','wave'].includes(game.state);
 $('pauseShade').hidden=!game.paused||$('shopDialog').open||$('manualDialog').open;
 $('sceneBadge').textContent=season()+' · '+(game.state==='wave'?'WAVE '+game.wave:game.state==='between'?'REPAIR & PREPARE':game.state==='won'?'APIARY DEFENDED':game.state==='lost'?'TRY AGAIN':'PREPARE YOUR APIARY');
 if(['won','lost'].includes(game.state)&&!endShown){
  endShown=true;if(game.score>best){best=game.score;try{localStorage.setItem('snowmans_apiary_defense_best',String(best));}catch{}}
  $('endTitle').textContent=game.state==='won'?'Apiary defended!':'The apiary needs you again.';
  $('endSummary').textContent=`${game.state==='won'?'Ten waves cleared.':'Reached wave '+game.wave+'.'} ${game.living().length} hives standing · ${game.kills} pests stopped · ${game.score} points. Best: ${best}.`;
  $('endDialog').showModal();$('best').textContent=best;
 }
}
function tick(now){
 const dt=last?clamp((now-last)/1000,0,.1):0;last=now;
 if(!document.hidden&&artReady){if(!game.paused){if(!reduced)visualTime+=dt;throwFlash=Math.max(0,throwFlash-dt);}game.step(dt);updateHud();if(charging)$('chargeFill').style.width=chargeValue()*100+'%';draw();}
 requestAnimationFrame(tick);
}
Promise.allSettled(Object.entries(names).map(([key,file])=>new Promise((resolve,reject)=>{const img=new Image();images[key]=img;img.onload=resolve;img.onerror=reject;img.src='apiary-art/'+file;}))).then(results=>{artReady=true;$('loading').hidden=true;if(results.some(r=>r.status==='rejected'))game.message='Some artwork could not load. You can still play with simple shapes.';resize();updateHud();});
manual('how');resize();updateHud();requestAnimationFrame(tick);
})();

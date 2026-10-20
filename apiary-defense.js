/* Apiary Defense — original artwork, controls and canvas presentation. */
'use strict';
(()=>{
const {Game,TYPES,UPGRADES,SPECIALTIES,LIMITS,clamp}=ApiaryDefense;
const $=id=>document.getElementById(id),canvas=$('battlefield'),ctx=canvas.getContext('2d');
if(!ctx){$('loading').textContent='Canvas is unavailable in this browser. Please try a current browser.';return;}
const game=new Game();
let modeChosen=false,pointerInput=null,shotsThrown=0;
function loadBest(){try{const n=Number(localStorage.getItem("snowmans_apiary_defense_v2_best_"+game.mode));return Number.isSafeInteger(n)&&n>0?n:0;}catch{return 0;}}
const images={},names={landscape:'landscape.svg',snowman:'snowman.svg',hive:'hive.svg',bee:'guard-bee.svg',moth:'wax-moth.svg',beetle:'hive-beetle.svg',hornet:'hornet.svg',worm:'waxworm.svg',mouse:'mouse.svg',wasp:'wasp.svg',mite:'varroa.svg',vaporizer:'vaporizer.svg'};
let scale=1,offsetX=0,offsetY=0,viewW=1100,viewH=600,last=0,artReady=false,visualTime=0,lastHud='',dialogPause=false,charging=false,chargeStart=0,pointerId=null,aim={x:700,y:330},keyboardIndex=0,throwFlash=0,endShown=false,best=0;
const systemMotion=matchMedia('(prefers-reduced-motion: reduce)');let reduced=systemMotion.matches;
try{const saved=localStorage.getItem('snowmans_apiary_defense_motion');if(saved!==null)reduced=saved==='true';best=loadBest();}catch{}
$('motion').checked=reduced;
$('motion').addEventListener('change',()=>{reduced=$('motion').checked;try{localStorage.setItem('snowmans_apiary_defense_motion',String(reduced));}catch{}});
systemMotion.addEventListener('change',e=>{reduced=e.matches;$('motion').checked=reduced;});
function resize(){const rect=canvas.getBoundingClientRect();viewW=rect.width;viewH=rect.height;const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(viewW*dpr);canvas.height=Math.round(viewH*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);scale=Math.min(viewW/1100,viewH/600);offsetX=(viewW-1100*scale)/2;offsetY=(viewH-600*scale)/2;draw();}
new ResizeObserver(resize).observe(canvas);
ApiaryScreen.mount({beforeChange:cancelCharge});
function image(key,x,y,w,h,frame=0,flip=false){
 const img=images[key];if(!img||!img.complete||!img.naturalWidth){ctx.fillStyle='#e2bf6e';ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/3,h/3,0,0,Math.PI*2);ctx.fill();return;}
const sw=['bee','moth','beetle','hornet','worm','mouse','wasp','mite'].includes(key)?128:key==='snowman'?256:img.naturalWidth;
 ctx.save();if(flip){ctx.translate(x+w,y);ctx.scale(-1,1);x=0;y=0;}
 ctx.drawImage(img,frame*sw,0,sw,img.naturalHeight,x,y,w,h);ctx.restore();
}
function round(x,y,w,h,r=8){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function text(t,x,y,size=16,color='#263d32',align='left'){ctx.fillStyle=color;ctx.font=`700 ${size}px system-ui`;ctx.textAlign=align;ctx.fillText(t,x,y);}
function health(x,y,w,value,max){ctx.fillStyle='#233c37b8';round(x,y,w,7,3);ctx.fill();ctx.fillStyle=value/max>.35?'#587e49':'#bb6549';round(x,y,w*Math.max(0,value/max),7,3);ctx.fill();}
function season(){return game.wave<13?'SPRING':game.wave<26?'SUMMER':game.wave<39?'AUTUMN':'WINTER';}
const flowers=Array.from({length:7},(_,i)=>({x:410+i*90,y:535+i%2*22}));
function drawForagers(frame){
 if(!game.upgrades.foragers)return;
 for(const [i,f] of flowers.entries()){
  ctx.strokeStyle='#496b43';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(f.x,f.y+3);ctx.lineTo(f.x,f.y+22);ctx.stroke();
  ctx.fillStyle=i%2?'#f5dd9c':'#e8c6df';
  for(let p=0;p<6;p++){const a=p*Math.PI/3;ctx.beginPath();ctx.ellipse(f.x+Math.cos(a)*7,f.y+Math.sin(a)*7,6,4,a,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#bb812f';ctx.beginPath();ctx.arc(f.x,f.y,4,0,Math.PI*2);ctx.fill();
 }
 if(game.state!=='wave')return;
 const hives=game.living();if(!hives.length)return;
 for(let i=0;i<game.upgrades.foragers;i++){
  const f=flowers[i%flowers.length],h=hives[i%hives.length];
  const phase=reduced?.43:((game.elapsed+i*1.83)%11)/11;
  const home={x:h.x+27,y:h.y+5},land={x:f.x,y:f.y-12};
  let x,y,flip=true,landed=false,carrying=false;
  if(phase<.3){const t=phase/.3;x=home.x+(land.x-home.x)*t;y=home.y+(land.y-home.y)*t-Math.sin(t*Math.PI)*65;}
  else if(phase<.56){x=land.x;y=land.y;landed=true;}
  else if(phase<.88){const t=(phase-.56)/.32;x=land.x+(home.x-land.x)*t;y=land.y+(home.y-land.y)*t-Math.sin(t*Math.PI)*42;flip=false;carrying=true;}
  else{x=home.x;y=home.y;flip=false;carrying=true;}
  const size=landed?23:27;
  image('bee',x-size/2,y-size/2,size,size,landed?0:frame,flip);
  if(carrying){ctx.fillStyle='#f6ca52';ctx.beginPath();ctx.arc(x-3,y+7,3,0,Math.PI*2);ctx.arc(x+4,y+7,3,0,Math.PI*2);ctx.fill();}
 }
}
function draw(){
 if(!ctx)return;ctx.clearRect(0,0,viewW,viewH);ctx.fillStyle='#1e3731';ctx.fillRect(0,0,viewW,viewH);
 ctx.save();ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);
 image('landscape',0,0,1100,600);
 if(game.wave>=26&&game.wave<39){ctx.fillStyle='#b1783b25';ctx.fillRect(0,0,1100,600);}
 if(game.wave>=39){ctx.fillStyle='#d4e9ed77';ctx.fillRect(0,0,1100,600);}
 ctx.fillStyle='#59714935';round(260,190,820,350,40);ctx.fill();
 ctx.setLineDash([7,14]);ctx.strokeStyle='#ebedbb50';ctx.lineWidth=2;
 for(const h of game.hives){ctx.beginPath();ctx.moveTo(290,h.y+35);ctx.lineTo(1100,h.y+35);ctx.stroke();}ctx.setLineDash([]);
 text('THE APIARY',150,185,12,'#365544');
 for(const h of game.hives){
  if(h.hp<=0){ctx.globalAlpha=.4;image('hive',h.x-54,h.y-62,108,108);ctx.globalAlpha=1;text('LOST',h.x,h.y+54,12,'#6b4535','center');continue;}
  image('hive',h.x-54,h.y-62,108,108);health(h.x-42,h.y-65,84,h.hp,h.max);text(Math.ceil(h.hp)+' / '+h.max,h.x,h.y+57,11,'#314c39','center');
  if(game.upgrades.walls){ctx.strokeStyle='#86988b';ctx.lineWidth=4;ctx.strokeRect(h.x-42,h.y-22,84,6);}
  const mites=game.miteCount(h);
  if(mites){const pulse=reduced?1:(1+Math.sin(visualTime*Math.PI*2/2.4))/2;ctx.fillStyle=`rgba(190,39,29,${.06+pulse*.13})`;ctx.strokeStyle=pulse>.5?'#ff5e4c':'#b33127';ctx.lineWidth=3+pulse*3;round(h.x-56,h.y-63,112,112,12);ctx.fill();ctx.stroke();
   for(let i=0;i<mites;i++){const t=reduced?i*1.7:visualTime*.9+i*1.7;const x=h.x+Math.sin(t)*31,y=h.y-17+Math.cos(t*.8+i)*22;image('mite',x-10,y-8,20,16,reduced?0:Math.floor(visualTime*5+i)%2);}
   const size=Math.max(20,10/scale),w=size*5.6;ctx.fillStyle='#942b22';round(h.x+61,h.y+14,w,size+12,7);ctx.fill();text('TAP HIVE',h.x+61+w/2,h.y+size+18,size,'#fff4d6','center');
  }else if(h.cleanTime>0)text('BRUSHED CLEAR',h.x,h.y+72,10,'#2c6648','center');
 }
 let snowX=10,snowY=290,snowFrame=throwFlash>0?1:0;
 if(game.brush){const b=game.brush,h=game.hives[b.hive],p=b.t/b.duration;const travel=p<.3?p/.3:p>.72?(1-p)/.28:1;const eased=clamp(travel,0,1);snowX=10+(h.x-140)*eased;snowY=290+(h.y-115-290)*eased;snowFrame=2;
  if(!reduced&&p>.3&&p<.72){const sweep=Math.sin(visualTime*20)*.4;ctx.save();ctx.translate(h.x-35,h.y-5);ctx.rotate(sweep);ctx.strokeStyle='#6f5030';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-30,12);ctx.lineTo(20,-8);ctx.stroke();ctx.fillStyle='#d8b36c';round(12,-20,23,22,3);ctx.fill();ctx.strokeStyle='#8f6c3d';ctx.lineWidth=2;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(15+i*5,-19);ctx.lineTo(15+i*5,0);ctx.stroke();}ctx.restore();}
  text('BRUSHING',snowX+80,snowY+179,10,'#354e3b','center');
 }
 if(reduced&&game.brush){snowX=game.hives[game.brush.hive].x-140;snowY=game.hives[game.brush.hive].y-115;}
 image('snowman',snowX,snowY,165,165,snowFrame);
 if(!game.brush)text('SNOWMAN',93,473,11,'#354e3b','center');
 if(game.upgrades.vaporizer){image('vaporizer',35,190,69,69);text('VARROA −'+game.upgrades.vaporizer*35+'%',70,275,10,'#355442','center');
  if(!reduced&&game.state==='wave'){ctx.strokeStyle='#eaf3d3b0';ctx.lineWidth=3;for(let i=0;i<3;i++){const t=(visualTime*.7+i*.33)%1;ctx.globalAlpha=1-t;ctx.beginPath();ctx.arc(94+t*17,194-t*33,5+t*8,0,Math.PI*1.3);ctx.stroke();}ctx.globalAlpha=1;}}
 const frame=reduced?0:Math.floor(visualTime*9)%2;
 for(const b of game.guards)image('bee',b.x-20,b.y-20,40,40,frame,b.phase!=='return');
 if(game.workerTarget!==null){const h=game.hives[game.workerTarget];for(let i=0;i<Math.min(game.upgrades.workers,4);i++){const a=reduced?i:visualTime*2+i*1.5;image('bee',h.x-58+Math.cos(a)*12,h.y-10+Math.sin(a)*19,27,27,frame,true);}text('REPAIRING',h.x,h.y-76,9,'#2c6648','center');}
 drawForagers(frame);
 const sorted=[...game.enemies].sort((a,b)=>a.y-b.y);
 for(const e of sorted){
  const fly=['beetle','mouse','worm'].includes(e.type)?0:reduced?0:Math.sin(visualTime*4+e.phase)*4;
  const w=e.type==='boss'?150:e.type==='hornet'?91:e.type==='mouse'?100:e.type==='beetle'?64:e.type==='worm'?75:e.type==='wasp'?62:78;const key=e.type==='boss'?'hornet':e.type;
  ctx.save();if(e.type==='boss'){ctx.shadowColor='#ab734e66';ctx.shadowBlur=13;}
  image(key,e.x-w/2,e.y-w/2+fly,w,w,frame);ctx.restore();
  health(e.x-w*.4,e.y-w*.45-8,w*.8,e.hp,e.max);
  if(e.type==='boss'){text('MATRIARCH',e.x,e.y-w*.45-17,12,'#653f28','center');}
 }
 for(const p of game.projectiles){ctx.fillStyle='#f9ffff';ctx.strokeStyle='#95c5d0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,7+p.charge*7,0,Math.PI*2);ctx.fill();ctx.stroke();}
 if(game.slowTime>0){ctx.fillStyle='#e7e7c130';for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(450+i*170,340,110,170,0,0,Math.PI*2);ctx.fill();}text('SMOKER CLOUD',650,175,12,'#385144','center');}
 if(!reduced)for(const e of game.effects){ctx.save();ctx.globalAlpha=Math.min(1,e.life*2);if(e.type==='burst'){ctx.strokeStyle='#f8ffff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,e.r*(1-e.life/.32),0,Math.PI*2);ctx.stroke();}else text(e.text,e.x,e.y-(1-e.life)*30,15,e.type==='reward'?'#756021':'#854b35','center');ctx.restore();}
 if(game.state==='wave'&&!game.paused){ctx.strokeStyle='#fffdeb';ctx.lineWidth=2;ctx.beginPath();ctx.arc(aim.x,aim.y,16,0,Math.PI*2);ctx.moveTo(aim.x-24,aim.y);ctx.lineTo(aim.x-10,aim.y);ctx.moveTo(aim.x+10,aim.y);ctx.lineTo(aim.x+24,aim.y);ctx.stroke();}
 if(game.state==='ready'||game.state==='between'){
  ctx.fillStyle='#1a352bd9';round(410,80,500,80,14);ctx.fill();text(game.state==='ready'?'A little snow. A lot to protect.':'A moment to rebuild.',660,113,24,'#f4dfac','center');text('Visit Upgrades, then start the next wave below.',660,140,14,'#d9e7ce','center');}
 ctx.restore();
}
function chargeValue(){return charging?clamp((performance.now()-chargeStart)/950,0,1):0;}
function updateCharge(){const percent=Math.round(chargeValue()*100);$('chargeFill').style.width=percent+'%';$('charge').setAttribute('aria-valuenow',String(percent));$('chargeLabel').textContent=percent===100?'FULLY PACKED':'PACKING SNOW · '+percent+'%';}
function beginCharge(id){charging=true;chargeStart=performance.now();pointerId=id;$('charge').hidden=false;updateCharge();}
function cancelCharge(){charging=false;pointerId=null;$('charge').hidden=true;pointerInput?.reset();}
function pointerPoint(e){const r=canvas.getBoundingClientRect();return {x:clamp((e.clientX-r.left-offsetX)/scale,0,1100),y:clamp((e.clientY-r.top-offsetY)/scale,0,600)};}
function fire(x,y,charge){
 const near=game.enemies.filter(e=>e.hp>0).reduce((a,e)=>!a||Math.hypot(e.x-x,e.y-y)<Math.hypot(a.x-x,a.y-y)?e:a,null);
 if(near&&Math.hypot(near.x-x,near.y-y)<70){const flight=.18+Math.hypot(near.x-99,near.y-345)/2200;x=near.x-near.speed*flight*(game.slowTime>0?.42:1);y=near.y;}
 if(game.shoot(x,y,charge)){throwFlash=.18;canvas.dataset.shotsThrown=String(++shotsThrown);canvas.dataset.lastShotCharge=String(charge);}
}
pointerInput=ApiaryInput.bind({canvas,
 begin(e){
  if(game.state!=='wave'||game.paused||charging||game.brush)return false;
  aim=pointerPoint(e);const labelSize=Math.max(20,10/scale);
  const hive=game.hives.find(h=>h.hp>0&&game.miteCount(h)>0&&(Math.abs(h.x-aim.x)<70&&Math.abs(h.y-aim.y)<64||aim.x>=h.x+61&&aim.x<=h.x+61+labelSize*5.6&&aim.y>=h.y+14&&aim.y<=h.y+labelSize+26));
  if(hive){game.clearMites(hive.id);updateHud();return false;}
  canvas.focus({preventScroll:true});beginCharge(e.pointerType==='touch'||e.identifier!==undefined?'touch':'pointer');return true;
 },
 move(e){aim=pointerPoint(e);},
 release(e,duration){if(!charging)return;aim=pointerPoint(e);cancelCharge();fire(aim.x,aim.y,clamp(duration/950,0,1));},
 cancel:cancelCharge
});
canvas.addEventListener('keydown',e=>{
 if(e.code==='Space'){e.preventDefault();if(e.repeat||charging||game.paused||game.state!=='wave')return;beginCharge('keyboard');}
 if(['Digit1','Digit2','Digit3'].includes(e.code)){e.preventDefault();cancelCharge();game.clearMites(Number(e.code.slice(-1))-1);updateHud();}
 if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();const alive=[...game.enemies].sort((a,b)=>a.x-b.x);keyboardIndex=clamp(keyboardIndex+(e.code==='ArrowRight'?1:-1),0,Math.max(0,alive.length-1));const target=alive[keyboardIndex];if(target)aim={x:target.x,y:target.y};}
 if(e.code==='KeyP'){e.preventDefault();game.togglePause();cancelCharge();updateHud();}
});
canvas.addEventListener('keyup',e=>{if(e.code==='Space'&&pointerId==='keyboard'){e.preventDefault();const value=chargeValue();cancelCharge();const alive=[...game.enemies].sort((a,b)=>a.x-b.x),target=alive[Math.min(keyboardIndex,alive.length-1)];if(target)aim={x:target.x,y:target.y};fire(aim.x,aim.y,value);}});
document.querySelectorAll('[data-hive]').forEach(b=>b.addEventListener('click',()=>{cancelCharge();game.clearMites(Number(b.dataset.hive));updateHud();}));
document.addEventListener('visibilitychange',()=>{last=performance.now();cancelCharge();if(document.hidden&&game.state==='wave'&&!game.paused){game.paused=true;game.message='Paused while you were away. Resume when you’re ready.';updateHud();}});
window.addEventListener('blur',()=>{if(pointerId!=='touch')cancelCharge();});
$('nextWave').addEventListener('click',()=>{if(game.startWave()){canvas.focus({preventScroll:true});updateHud();}});
$('pauseButton').addEventListener('click',()=>{game.togglePause();cancelCharge();updateHud();});
for(const id of ['smokeButton','fieldSmoke'])$(id).addEventListener('click',()=>{cancelCharge();game.smoke();updateHud();});
function openDialog(id){cancelCharge();dialogPause=game.paused;game.paused=true;$(id).showModal();updateHud();}
function closeDialog(id){$(id).close();}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close)));
for(const id of ['shopDialog','manualDialog','modeDialog'])$(id).addEventListener('close',()=>{game.paused=dialogPause;last=performance.now();updateHud();if(id==='manualDialog'&&endShown&&['won','lost'].includes(game.state)&&!$('endDialog').open)$('endDialog').showModal();});
$('endDialog').addEventListener('cancel',e=>e.preventDefault());
$('shopButton').addEventListener('click',()=>{renderShop();openDialog('shopDialog');});
function renderShop(){
 $('shopBalance').textContent=game.mode==='sandbox'?'Unlimited honey · Sandbox':game.honey+' honey available';const grid=$('shopGrid');grid.replaceChildren();
 for(const [id,u] of Object.entries(UPGRADES)){
  const card=document.createElement('section');card.className='shopCard';
  const h=document.createElement('h3');h.textContent=u.title;card.append(h);
  const level=document.createElement('div');level.className='level';level.textContent=id==='repair'?'Service':Number.isFinite(u.max)?`Level ${game.upgrades[id]} / ${u.max}`:`Level ${game.upgrades[id]} · No limit`;card.append(level);
  const p=document.createElement('p');p.textContent=u.desc;card.append(p);
  const button=document.createElement('button');button.type='button';button.dataset.upgrade=id;
  const max=game.upgrades[id]>=u.max;
  // Shopping pauses the simulation, but buying remains available in preparation.
  const wasPaused=game.paused;game.paused=false;const can=game.canBuy(id);game.paused=wasPaused;
  button.disabled=!can;button.textContent=max?'Fully upgraded':(id==='repair'?'Repair':'Buy')+(game.mode==='sandbox'?' · Free':' · '+game.cost(id)+' honey');
  button.addEventListener('click',()=>{const was=game.paused;game.paused=false;game.buy(id);game.paused=was;renderShop();updateHud();const next=$('shopGrid').querySelector(`[data-upgrade="${id}"]`);if(next&&!next.disabled)next.focus();else $('shopDialog').querySelector('[data-close]').focus();});card.append(button);grid.append(card);
 }
 $('specialtyStatus').textContent=game.specialty?'Your specialty: '+SPECIALTIES[game.specialty].title+'. Fixed for this run.':game.wave<7&&game.mode!=='sandbox'?'Specialties unlock after wave 7. Explore your opening build first.':'Choose one specialty for this run. '+(game.mode==='sandbox'?'Free in Sandbox.':'Cost: 250 honey.');
 const choices=$('specialtyChoices');choices.replaceChildren();
 for(const [id,s] of Object.entries(SPECIALTIES)){
  const button=document.createElement('button');button.type='button';button.dataset.specialty=id;
  const heading=document.createElement('strong');heading.textContent=s.title;const desc=document.createElement('span');desc.textContent=s.desc;button.append(heading,desc);
  const was=game.paused;game.paused=false;button.disabled=!game.canSpecialize(id);game.paused=was;
  if(game.specialty===id)heading.textContent+=' · CHOSEN';
  button.addEventListener('click',()=>{const p=game.paused;game.paused=false;game.specialize(id);game.paused=p;renderShop();updateHud();$('specialtyStatus').focus();});choices.append(button);
 }
}
const entries={
 how:{title:'Welcome to the apiary.',html:'<p>You’re a snowman beekeeper with three hives to protect. Survive ten waves, including the final hornet boss.</p><h4>Snowballs & guard bees</h4><p>Tap or click an approaching pest to throw. Hold briefly for a bigger, stronger snowball. Snowballs have a short cooldown and burst on landing. Guard bees automatically attack the pest closest to the hives; every bee has its own cooldown.</p><h4>Earn, prepare, defend</h4><p>Defeated pests earn honey, and clearing a wave adds a bonus. Buy upgrades and repair surviving hives between waves. Lost hives cannot be rebuilt during a run. Use the smoker once per wave for a short slowing cloud.</p><h4>Controls</h4><p>Mouse or touch: aim and release on the battlefield. Keyboard: focus the battlefield, ← / → selects a target, Space throws, P pauses. Open this manual whenever you need a break.</p><div class="biologyNote"><p>This is an illustrated arcade fantasy. Snowball combat, returning guard bees, smoker slowdown and upgrade percentages are fictional game systems.</p></div>'},
 moth:{title:'Wax moths',sprite:'wax-moth.svg',html:'<h4>In the game</h4><p>Fast, fragile raiders. A well-placed snowball can catch several. They appear from wave 1.</p><h4>In a real apiary</h4><p>Waxworms are the larvae of wax moths. These larvae tunnel through comb, leaving silk webbing and debris. Stored comb and colonies unable to guard their space are especially vulnerable. The adult moth is not the stage chewing through comb.</p><p>Strong colonies, sensible space management and protected comb storage help. Moths discovered after a colony dies may be taking advantage of its loss, rather than explaining what killed it.</p>'},
 beetle:{title:'Small hive beetles',sprite:'hive-beetle.svg',html:'<h4>In the game</h4><p>Slower enemies with more health. Charged snowballs and guard bees help wear them down. They start appearing in wave 2.</p><h4>In a real apiary</h4><p>Small hive beetle larvae can damage comb and cause honey to ferment and become slimy. Larvae eventually leave the hive and pupate in soil.</p><p>Colony strength, appropriate hive space and clean, prompt honey handling matter. Seeing an adult beetle is different from finding a destructive larval infestation. Our large marching beetles are an arcade illustration.</p>'},
 hornet:{title:'Hornets & the matriarch',sprite:'hornet.svg',html:'<h4>In the game</h4><p>Tough flying attackers appear from wave 4. The oversized hornet matriarch arrives in wave 10. Save the smoker cloud, aim charged snowballs and keep your guard bees trained.</p><h4>In a real apiary</h4><p>Some social wasps prey on honey bees. The threat depends on the species, location and circumstances; the game’s hornet is a fictional composite, not an identification guide for southwest Kansas.</p><p>The “matriarch” boss, her size and her attack patterns are invented for this game. Do not use the artwork to identify a real insect or disturb an unknown nest.</p>'},
 varroa:{title:'Varroa & the vaporizer',image:'vaporizer.svg',html:'<h4>In the game</h4><p>Varroa causes a small, continuous health loss to surviving hives during active waves. It is background pressure, rather than a giant flying enemy.</p><p>The oxalic acid vaporizer is a base upgrade: level 1 reduces that damage by 35%; level 2 reduces it by 70% in total. These are invented balance values, not real-world treatment efficacy. It does not damage moths, beetles or hornets.</p><h4>In a real apiary</h4><p>Varroa is a parasitic mite associated with serious bee-health problems and viral transmission. Oxalic acid vaporization targets mites on adult bees but does not reach those protected inside capped brood. Monitoring and follow-up matter.</p><div class="biologyNote"><p>Real treatments must follow the current label on the actual registered product, including protective equipment and application restrictions. This game provides no dose, recipe or treatment schedule. At Snowman’s Apiary, Kyle uses oxalic acid vapor treatments when necessary.</p></div>'}
};

entries.how.html='<p>Choose Campaign for 50 demanding waves and earned honey, or Sandbox for unlimited shopping and endless raids. A campaign victory unlocks an optional endless continuation.</p><h4>Choose a build</h4><p>Snowball power counters tough enemies. Powder Burst clears clusters; its final level doubles splash reach. Guard bees chase fast raiders, but armored beetles resist their attacks. Hold a snowball to charge an armor-piercing hit. Speed ramps up to a cap; enemy health and damage continue growing.</p><h4>Care for the hives</h4><p>Infestations can appear randomly during a wave; starting a wave does not add mites. Untreated mites carry over until brushed away. A pulsing red outline and a large Tap Hive label mark an infested box. Tap a hive, use its Brush button, or press 1, 2 or 3 while the battlefield is focused. The snowman walks over and brushes them away. You cannot throw while he works, so pick your moment. Worker bees repair the weakest surviving hive; scavenger bees gather a nectar bonus, paid only after clearing a wave.</p><h4>Commit after the opening</h4><p>After wave 7, choose one specialty for your run: stronger snowballs, faster guard bees, or stronger hive care. In Sandbox, specialties are available immediately. Read the next-raid forecast before spending. Up to 20 guard bees can defend at once; every guard leaves its perch, attacks and flies back. If its target dies before contact, it redirects to the closest living pest instead of wasting the attack. If no pests remain, it returns without spending its cooldown. Bee Training has no level limit, but guard cooldown cannot fall below one second, even with Swarm Commander. Further training then increases damage only. You can recruit up to 30 workers and 30 scavenger bees.</p><h4>Controls</h4><p>Mouse or touch: aim, hold, release. Keyboard: focus the battlefield, arrows pick a target, hold and release Space to throw, 1/2/3 brushes a hive, P pauses. Use the smoker button in the bottom-left of the battlefield for five seconds of slower enemies, once per wave. Fullscreen keeps all controls and menus available. On phones, turn sideways for the landscape layout. Use Exit fullscreen to return. The field manual pauses the game.</p><div class="biologyNote"><p>Snowball combat, oversized visible mites, brushing mites off boxes, repair points and nectar bonuses are arcade inventions. Real Varroa are parasites on bees and within brood cells; brushing a hive box is not a real Varroa treatment.</p></div>';
entries.beetle.html=entries.beetle.html.replace('Slower enemies with more health. Charged snowballs and guard bees help wear them down. They start appearing in wave 2.','Armored enemies resist guard-bee attacks and ordinary snowballs. Hold to charge a shot and pierce their armor. They arrive from wave 2. The armor rules are a game mechanic.');
entries.hornet.html=entries.hornet.html.replace('arrives in wave 10','returns every ten waves');
entries.varroa.html=entries.varroa.html.replace('Varroa causes a small, continuous health loss to surviving hives during active waves. It is background pressure, rather than a giant flying enemy.','Mites can arrive randomly during an active wave, after a short opening grace period. A fresh wave does not automatically infest clean hives. Untreated mites remain between waves and cause health loss during battle. A pulsing red outline and a large Tap Hive label identify an infestation. Tap a hive or its Brush button to send the snowman to clear it. Brushing takes time and pauses your snowballs. Mites can return. This is an exaggerated game representation.');
entries.worm={title:'Waxworms',sprite:'waxworm.svg',html:'<h4>In the game</h4><p>Tough comb crawlers appear from wave 3. Powerful snowballs make a bigger difference against their health. Their exaggerated size and durability are fictional.</p><h4>In a real apiary</h4><p>Waxworms are wax-moth larvae. They can tunnel through unprotected comb and leave webbing and debris. Their presence after a colony dies does not establish why it died.</p>'};
entries.wasp={title:'Wasp raiders',sprite:'wasp.svg',html:'<h4>In the game</h4><p>Fast, lightly built raiders appear from wave 6, with larger rushes later on. Guard bees track them automatically; splash damage helps against clusters. Their speed and attack values are invented.</p><h4>In a real apiary</h4><p>Some social wasps prey on bees or take hive resources. Species and circumstances matter. This drawing is a fictional composite, not a guide to identifying insects or nests.</p>'};
entries.mouse={title:'Mice',sprite:'mouse.svg',html:'<h4>In the game</h4><p>Heavy raiders appear from wave 9. They are slow but hard to stop and deal heavy damage if they reach the hives. Prioritize power and sturdy defenses.</p><h4>In a real apiary</h4><p>Mice can damage stored comb and may shelter in active hives during colder months. The marching, oversized raider is a game invention. Suitable entrance protection is part of real hive care.</p>'};
entries.workers={title:'Workers & nectar foragers',sprite:'guard-bee.svg',html:'<h4>Worker bees</h4><p>Each recruit adds steady repairs during a wave, directed at the weakest surviving hive. They cannot rebuild destroyed hives. Repair strength is a game mechanic.</p><h4>Scavenger bees</h4><p>These are your nectar foragers. They fly from the hives to flowers, land to gather nectar, and carry it home. They build a honey bonus while you fight, which is paid after you survive the wave. Lost waves forfeit the pending bonus. Hiring them early gives more waves to earn back the investment.</p><h4>Real bees</h4><p>These jobs are carried out by worker honey bees: collecting nectar and pollen, tending the colony and maintaining comb. The game separates them into recruit types for strategic choices.</p>'};

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
$('restartButton').addEventListener('click',()=>{$('endDialog').close();openDialog('modeDialog');});
$('modeButton').addEventListener('click',()=>openDialog('modeDialog'));
$('modeDialog').addEventListener('cancel',e=>{if(!modeChosen)e.preventDefault();});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{game.reset(b.dataset.mode);modeChosen=true;dialogPause=false;best=loadBest();endShown=false;lastHud='';cancelCharge();$('modeDialog').close();updateHud();draw();}));
$('endlessButton').addEventListener('click',()=>{if(game.continueEndless()){$('endDialog').close();endShown=false;lastHud='';updateHud();draw();}});
function updateHud(){
 const values=[game.wave,game.honey,game.score,game.living().length,game.state,game.paused,game.upgrades.vaporizer,game.smokerUsed,game.message,best,game.infestation(),!!game.brush,game.specialty,game.mode,Math.floor(game.nectarBank),...game.hives.map(h=>Math.ceil(h.hp))].join('|');
 if(values===lastHud)return;lastHud=values;
 
 $('modeLabel').textContent=(game.mode==='sandbox'?'Sandbox · Endless':'Campaign'+(game.endless?' · Endless':''))+' · v2';
 $('nectarBank').textContent=Math.floor(game.nectarBank)+' honey gathered';
 for(const b of document.querySelectorAll('[data-hive]')){const h=game.hives[Number(b.dataset.hive)],m=game.miteCount(h);b.textContent=h.hp<=0?'Hive '+(h.id+1)+' · lost':`Hive ${h.id+1} · ${Math.ceil(h.hp)} HP · ${m} mites${m?' — Brush':' — clear'}`;b.disabled=game.state!=='wave'||game.paused||!!game.brush||!m;}
 const next=game.wave+1,plan=game.plan(next),kinds=[...new Set(plan.map(e=>TYPES[e.type].name))];
 $('wavePreview').textContent=`Next raid: wave ${next} · ${plan.length} enemies · ${kinds.join(', ')}. ${game.speedScale(next)>=LIMITS.speedMultiplier?'Speed has reached its cap.':'Speed and health increase as you advance.'}`;

 $('wave').textContent=game.wave+' / '+(game.endless?'∞':LIMITS.waves);$('honey').textContent=game.mode==='sandbox'?'Unlimited':game.honey;$('hives').textContent=game.living().length+' / 3';$('score').textContent=game.score;$('best').textContent=best;
 $('miteRate').textContent=game.infestation()+' mites · −'+game.upgrades.vaporizer*35+'% damage';$('message').textContent=game.message;
 $('nextWave').textContent=game.wave===0?'Start wave 1':game.state==='wave'?'Wave '+game.wave+' in progress':'Start wave '+(game.wave+1);
 $('nextWave').disabled=!modeChosen||game.paused||!['ready','between'].includes(game.state);
 $('shopButton').disabled=!modeChosen||game.paused||!['ready','between'].includes(game.state);
 $('smokeButton').disabled=game.state!=='wave'||game.paused||game.smokerUsed;
 $('fieldSmoke').disabled=$('smokeButton').disabled;
 $('fieldSmoke').innerHTML=game.smokerUsed?'Smoker used<span>Next wave</span>':'Use smoker<span>Slow enemies · once per wave</span>';
 $('smokeButton').innerHTML=game.smokerUsed?'Smoker used<span>Resets next wave</span>':'Smoker cloud<span>Once per wave</span>';
 $('pauseButton').textContent=game.paused?'Resume':'Pause';$('pauseButton').disabled=!['ready','between','wave'].includes(game.state);
 $('pauseShade').hidden=!game.paused||$('shopDialog').open||$('manualDialog').open;
 $('sceneBadge').textContent=season()+' · '+(game.state==='wave'?'WAVE '+game.wave:game.state==='between'?'REPAIR & PREPARE':game.state==='won'?'APIARY DEFENDED':game.state==='lost'?'TRY AGAIN':'PREPARE YOUR APIARY');
 if(['won','lost'].includes(game.state)&&!endShown){
  endShown=true;if(game.score>best){best=game.score;try{localStorage.setItem('snowmans_apiary_defense_v2_best_'+game.mode,String(best));}catch{}}
  $('endTitle').textContent=game.state==='won'?'Apiary defended!':'The apiary needs you again.';
  $('endSummary').textContent=`${game.state==='won'?'Fifty waves cleared.':'Reached wave '+game.wave+'.'} ${game.living().length} hives standing · ${game.kills} pests stopped · ${game.score} points. Best: ${best}.`;
  $('endlessButton').hidden=game.state!=='won';$('endDialog').showModal();$('best').textContent=best;
 }
}
function tick(now){
 const dt=last?clamp((now-last)/1000,0,.1):0;last=now;
 if(!document.hidden&&artReady){if(!game.paused){if(!reduced)visualTime+=dt;throwFlash=Math.max(0,throwFlash-dt);}game.step(dt);updateHud();if(charging)updateCharge();draw();}
 requestAnimationFrame(tick);
}
Promise.allSettled(Object.entries(names).map(([key,file])=>new Promise((resolve,reject)=>{const img=new Image();images[key]=img;img.onload=resolve;img.onerror=reject;img.src='apiary-art/'+file+'?v=3';}))).then(results=>{artReady=true;$('loading').hidden=true;if(results.some(r=>r.status==='rejected'))game.message='Some artwork could not load. You can still play with simple shapes.';resize();updateHud();});
manual('how');resize();updateHud();$('modeDialog').showModal();requestAnimationFrame(tick);
})();

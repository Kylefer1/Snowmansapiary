/* Art, interpolation and effects stay separate from the game simulation. */
(function(root){'use strict';
const TAU=Math.PI*2,rects={queen:[8,20,386,336],guard:[394,50,326,276],mite:[748,40,292,292],varroa:[800,92,188,188],moth:[1068,52,372,280],beetle:[52,366,294,342],wasp:[406,358,300,336],spitter:[742,362,304,336],gnat:[1112,398,284,274],broodling:[44,714,310,326],splitter:[44,714,310,326],hornet:[370,710,372,338],chest:[752,768,304,260],open:[1102,702,318,330]};
const lerp=(a,b,t)=>a+(b-a)*t,random=(a,b)=>a+Math.random()*(b-a);
class Renderer{
 constructor(canvas,atlas,props){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.atlas=atlas;this.props=props;this.w=innerWidth;this.h=innerHeight;this.cameraX=1300;this.cameraY=1300;this.zoom=1;this.targetZoom=1;this.fx=[];this.stains=[];this.shake=0;this.clock=0;this.stage=0;this.pattern=null;this.resize()}
 setZoom(value){if(Number.isFinite(value))this.targetZoom=Math.max(.75,Math.min(1.35,value));}
 resize(){this.w=this.canvas.clientWidth||innerWidth;this.h=this.canvas.clientHeight||innerHeight;const d=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(this.w*d);this.canvas.height=Math.round(this.h*d);this.ctx.setTransform(d,0,0,d,0,0)}
 reset(){this.cameraX=1300;this.cameraY=1300;this.fx=[];this.stains=[];this.shake=0}
 ellipse(x,y,rx,ry,color){const c=this.ctx;c.fillStyle=color;c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,TAU);c.fill()}
 line(x,y,x2,y2,color,width=1){const c=this.ctx;c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke()}
 particle(p){if(this.fx.length<420)this.fx.push(p)}
 emit(event,gentle=false){
  const r=event.radius||14,color=event.color||'#e6c46a';
  if(event.type==='kill'){
   if(event.tiny){if(!gentle)this.stains.push({x:event.x,y:event.y,r:3,color:'#b3ad57',life:5,max:5});if(this.stains.length>180)this.stains.shift();for(let i=0;i<3;i++)this.particle({kind:'guts',x:event.x,y:event.y,vx:random(-70,70),vy:random(-70,70),life:.25,max:.25,r:1.5,color:'#b3ad57'});return;}
   this.shake=Math.min(5,this.shake+(gentle?0:event.boss?4:1.4));
   const guts=event.enemyType==='spitter'?'#a3bb55':event.enemyType==='mite'?'#d49a58':'#b3ad57';
   if(!gentle){for(let i=0;i<(event.boss?9:4);i++)this.stains.push({x:event.x+random(-r,r),y:event.y+random(-r,r),r:random(2,r*.7),color:guts,life:14,max:14});if(this.stains.length>180)this.stains.splice(0,this.stains.length-180)}
   for(let i=0;i<(gentle?5:event.boss?40:17);i++){const a=random(0,TAU),v=random(35,190);this.particle({kind:i%3===0?'shell':'guts',x:event.x,y:event.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:random(.35,.85),max:.85,r:random(2,5),angle:random(0,TAU),spin:random(-12,12),color:i%3===0?color:guts})}
   this.particle({kind:'corpse',sprite:event.enemyType,x:event.x,y:event.y,vx:0,vy:0,life:.22,max:.22,r:r*2.1,angle:event.angle||0,color});
  }else if(event.type==='swarmEmerge'){
   this.particle({kind:'emergence',x:event.originX,y:event.originY,vx:0,vy:0,life:1.4,max:1.4,r:90,color:'#cbe8a8'});
   this.emit({type:'burst',x:event.originX,y:event.originY,radius:95,color:'#d7e2a1'},gentle);
  }else if(event.type==='hit'||event.type==='sting'){
   for(let i=0;i<(gentle?2:4);i++)this.particle({kind:'spark',x:event.x,y:event.y,vx:random(-100,100),vy:random(-100,100),life:.18,max:.18,r:random(1,2),color:'#efe1a6'});
  }else if(event.type==='burst'){
   this.particle({kind:'ring',x:event.x,y:event.y,vx:0,vy:0,life:.42,max:.42,r:event.radius||80,color});
   if(!gentle)this.shake=Math.min(4,this.shake+1.2);
   for(let i=0;i<(gentle?8:24);i++){const a=random(0,TAU),v=random(40,240);this.particle({kind:'spark',x:event.x,y:event.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.45,max:.45,r:random(1,3),color})}
  }else if(event.type==='dash'){
   for(let i=0;i<8;i++)this.particle({kind:'spark',x:event.x,y:event.y,vx:-Math.cos(event.angle)*random(50,230)+random(-40,40),vy:-Math.sin(event.angle)*random(50,230)+random(-40,40),life:.35,max:.35,r:random(1,3),color:'#d8e2b1'});
  }else if(event.type==='victory'){
   for(let i=0;i<80;i++){const a=random(0,TAU),v=random(60,310);this.particle({kind:'shell',x:event.x,y:event.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:1.5,max:1.5,r:random(2,5),angle:a,spin:random(-5,5),color:'#e4c56f'})}
  }
 }
 terrain(stage){
  const tile=document.createElement('canvas');tile.width=512;tile.height=512;const c=tile.getContext('2d');let seed=83451;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  c.fillStyle=stage===2?'#272e30':'#283b27';c.fillRect(0,0,512,512);
  for(let i=0;i<3400;i++){const x=rand()*512,y=rand()*512;c.fillStyle=stage===2?`rgba(122,112,122,${rand()*.11})`:`rgba(170,165,112,${rand()*.10})`;c.fillRect(x,y,rand()*3+1,rand()*2+1)}
  for(let i=0;i<100;i++){const x=rand()*512,y=rand()*512;c.strokeStyle=stage===2?'#414746':'#424e35';c.lineWidth=.7;c.beginPath();c.moveTo(x-3,y+7);c.quadraticCurveTo(x-5,y,x-8,y-6);c.moveTo(x,y+6);c.quadraticCurveTo(x+4,y-3,x+2,y-12);c.moveTo(x+2,y+6);c.quadraticCurveTo(x+10,y+1,x+10,y-3);c.stroke();}
  this.pattern=this.ctx.createPattern(tile,'repeat');this.stage=stage;
 }
 sprite(kind,x,y,size,angle=0,time=0,flight=false,hit=0){
  const c=this.ctx,propIndex={wildHive:0,honeycomb:1,super:2,magnet:2}[kind],image=propIndex===undefined?this.atlas:this.props;
  if(!image?.complete||!image.naturalWidth){this.ellipse(x,y,size*.27,size*.4,'#baa05e');return}
  const rect=propIndex===undefined?(rects[kind]||rects.mite):[image.naturalWidth/3*propIndex,0,image.naturalWidth/3,image.naturalHeight];
  const ratio=rect[3]/rect[2],height=size*ratio,flap=flight?Math.sin(time*42+x*.03):0,bob=flight?Math.sin(time*6+x)*1.3:0;
  c.save();c.translate(x,y+bob);c.rotate(angle+Math.PI/2);c.scale(1+flap*.025,1-flap*.012);
  c.drawImage(image,...rect,-size/2,-height/2,size,height);
  // Thin wing-side redraws make a high-frequency translucent flight blur.
  if(flight&&size>=25&&Math.abs(flap)>.15){c.save();c.globalAlpha=.16;c.scale(1+Math.abs(flap)*.13,1);c.beginPath();c.rect(-size/2,-height/2,size*.27,height*.68);c.rect(size*.23,-height/2,size*.27,height*.68);c.clip();c.drawImage(image,...rect,-size/2,-height/2,size,height);c.restore()}
  if(hit>0){c.globalCompositeOperation='screen';c.globalAlpha=Math.min(.55,hit*4);c.drawImage(image,...rect,-size/2,-height/2,size,height)}
  c.restore();
 }
 varroa(x,y,size,angle,time,hit){const c=this.ctx;c.save();c.translate(x,y);c.rotate(angle+Math.PI/2);for(let side of [-1,1])for(let i=0;i<4;i++){const gait=Math.sin(time*21+i*1.6+side*1.5),rootY=(i-1.5)*size*.17,kneeX=side*size*(.43+.06*gait),kneeY=rootY+gait*size*.12,footX=side*size*(.66+.05*gait),footY=rootY+(i-1.5)*size*.14-gait*size*.13;this.line(side*size*.17,rootY,kneeX,kneeY,'#be945f',1.8);this.line(kneeX,kneeY,footX,footY,'#8e6748',1.3);}c.scale(1,.78);this.sprite('varroa',0,0,size,-Math.PI/2,time,false,hit);c.restore();}
 render(game,alpha=1,dt=1/60,gentle=false){
  const c=this.ctx;this.clock+=dt;const stage=game?.stage||1,q=game?.queen||{x:1300,y:1300,px:1300,py:1300,angle:-Math.PI/2,inv:0};
  const qx=lerp(q.px??q.x,q.x,alpha),qy=lerp(q.py??q.y,q.y,alpha),ease=1-Math.exp(-9*dt);
  this.cameraX+=(qx+(q.vx||0)*.1-this.cameraX)*ease;this.cameraY+=(qy+(q.vy||0)*.1-this.cameraY)*ease;
  this.zoom+=(this.targetZoom-this.zoom)*(1-Math.exp(-12*dt));const z=this.zoom,ox=this.w/2-this.cameraX*z,oy=this.h/2-this.cameraY*z;this.playerScreenX=qx*z+ox;this.playerScreenY=qy*z+oy;
  c.clearRect(0,0,this.w,this.h);c.fillStyle=stage===2?'#141d25':'#1a281e';c.fillRect(0,0,this.w,this.h);c.save();
  const shake=gentle?0:this.shake;c.translate(ox+random(-shake,shake),oy+random(-shake,shake));c.scale(z,z);this.shake*=Math.exp(-13*dt);
  if(!this.pattern||this.stage!==stage)this.terrain(stage);c.fillStyle=this.pattern;c.fillRect(0,0,2600,2600);
  c.strokeStyle=stage===2?'#7d6c60':'#6f7250';c.lineWidth=8;c.strokeRect(5,5,2590,2590);c.strokeStyle='#131c18';c.lineWidth=2;c.strokeRect(14,14,2572,2572);
  const visible=(x,y,r=80)=>x*z+ox>-r*z&&x*z+ox<this.w+r*z&&y*z+oy>-r*z&&y*z+oy<this.h+r*z;
  for(const stain of this.stains){stain.life-=dt;if(!gentle&&visible(stain.x,stain.y)){c.globalAlpha=Math.min(.3,stain.life*.08);this.ellipse(stain.x,stain.y,stain.r,stain.r*.6,stain.color);c.globalAlpha=1}}this.stains=this.stains.filter(p=>p.life>0);
  for(const z of game?.zones||[]){if(!visible(z.x,z.y,z.r))continue;if(z.kind==='pulse')continue;const fade=Math.min(1,z.life/.6);c.globalAlpha=.24*fade;this.ellipse(z.x,z.y,z.r,z.r,stage===2?'#d09d74':'#ac9855');c.globalAlpha=.3*fade;c.strokeStyle='#d3b45a';c.lineWidth=1;c.beginPath();c.arc(z.x,z.y,z.r,0,TAU);c.stroke();c.globalAlpha=1}
  for(const d of game?.drops||[]){if(!visible(d.x,d.y))continue;if(d.type==='chest'){
    const pulse=gentle?1:1+Math.sin(this.clock*3.7)*.13,size=58*pulse;const g=c.createRadialGradient(d.x,d.y,4,d.x,d.y,63);g.addColorStop(0,'#e9c7645c');g.addColorStop(1,'#e9c76400');c.fillStyle=g;c.fillRect(d.x-63,d.y-63,126,126);c.strokeStyle='#d9c47870';c.lineWidth=1;c.beginPath();c.ellipse(d.x,d.y+12,28*pulse,13*pulse,0,0,TAU);c.stroke();this.sprite('chest',d.x,d.y-4,size,-Math.PI/2,this.clock);c.fillStyle='#f4db8f';c.font='9px system-ui';c.textAlign='center';c.fillText('TREASURE',d.x,d.y-37);
   }else if(d.type==='honeycomb'||d.type==='super'||d.type==='magnet'){const pulse=gentle?1:1+Math.sin(this.clock*4)*.09;this.ellipse(d.x,d.y,22*pulse,22*pulse,d.type==='super'?'#a5dfcb25':'#e1ba6025');this.sprite(d.type,d.x,d.y,(d.type==='super'?46:36)*pulse,-Math.PI/2,this.clock);c.fillStyle=d.type==='super'?'#c8f1db':'#f1d492';c.font='9px system-ui';c.textAlign='center';c.fillText(d.type==='magnet'?'XP SWEEP':d.type==='super'?'ROYAL SWARM':'HEAL',d.x,d.y-25);if(d.type==='magnet'){c.strokeStyle='#b9f2aa';c.lineWidth=1.5;for(let ring=0;ring<2;ring++){c.beginPath();c.arc(d.x,d.y,25+ring*7+Math.sin(this.clock*3)*2,0,TAU);c.stroke();}}}else if(d.type==='health'){this.ellipse(d.x,d.y,8,8,'#8a9c62');this.line(d.x-3,d.y,d.x+3,d.y,'#edf2c0',2);this.line(d.x,d.y-3,d.x,d.y+3,'#edf2c0',2)}else{const pulse=1+Math.sin(this.clock*4+d.id)*.1;if(d.magnetized)this.line(d.px??d.x,d.py??d.y,d.x,d.y,'#ccf1a988',2);this.ellipse(d.x,d.y,4*pulse,6*pulse,'#b8d694');this.ellipse(d.x-1,d.y-1,1,2,'#e5f5b0')}}
  for(const hive of game?.hives||[]){if(!visible(hive.x,hive.y))continue;this.ellipse(hive.x,hive.y+26,31,13,'#07120c55');this.sprite('wildHive',hive.x,hive.y,96,-Math.PI/2,this.clock,false,hive.hit);c.font='9px system-ui';c.fillStyle='#dfca8e';c.textAlign='center';c.fillText('ABANDONED HIVE',hive.x,hive.y-47);if(hive.hp<hive.max){c.fillStyle='#0a160ed9';c.fillRect(hive.x-28,hive.y+44,56,3);c.fillStyle='#d4b96b';c.fillRect(hive.x-28,hive.y+44,56*Math.max(0,hive.hp/hive.max),3)}}
  const enemies=(game?.enemies||[]).filter(e=>visible(e.x,e.y,90));
  for(const e of enemies){const ex=lerp(e.px,e.x,alpha),ey=lerp(e.py,e.y,alpha);if(e.mode==='telegraph'){
    c.save();c.strokeStyle=e.boss?'#e6ac6688':'#e9cd7788';c.setLineDash([8,8]);c.lineWidth=e.boss?14:6;c.beginPath();c.moveTo(ex,ey);c.lineTo(ex+e.chargeX*300,ey+e.chargeY*300);c.stroke();c.restore();this.ellipse(ex,ey,e.r+7,e.r+7,'#d7aa4e22');}
    if(!e.outbreak)this.ellipse(ex,ey+e.r*.6,e.r*.9,e.r*.4,'#050d0c55');
    const flight=['moth','wasp','gnat','hornet'].includes(e.type),walk=flight?0:Math.sin(this.clock*(e.type==='broodling'?22:13)+e.id)*.045;
    if(e.type==='varroa')this.varroa(ex,ey,e.r*2.3,e.angle,this.clock+e.id*.17,e.hit);else this.sprite(e.type,ex,ey,e.r*(e.type==='moth'?3.2:3),e.angle+walk,this.clock,flight,e.hit);
    if(e.boss||e.hit||e.hp<e.max){const width=e.boss?76:e.outbreak?14:30;c.fillStyle='#060d0bb0';c.fillRect(ex-width/2,ey-e.r*1.7-9,width,4);c.fillStyle=e.boss?'#d5a15e':'#bdd18a';c.fillRect(ex-width/2,ey-e.r*1.7-9,width*Math.max(0,e.hp/e.max),4);if(e.boss){c.fillStyle='#e9d5ab';c.font='9px system-ui';c.textAlign='center';c.fillText(e.final?'THE CROWN MATRIARCH':'CROWN HORNET',ex,ey-e.r*1.7-14)}}
  }
  for(const bee of game?.swarmBees||[]){if(bee.delay>0||bee.stingSpent||!visible(bee.x,bee.y))continue;const x=lerp(bee.px,bee.x,alpha),y=lerp(bee.py,bee.y,alpha);c.globalAlpha=Math.min(1,bee.life*2);this.line(x-Math.cos(bee.angle)*12,y-Math.sin(bee.angle)*12,x,y,'#cfecaf55',1);this.sprite('guard',x,y,25+Math.sin(bee.phase)*2,bee.angle,this.clock+bee.phase,true);c.globalAlpha=1;}
  for(const s of game?.shots||[]){if(!visible(s.x,s.y))continue;const x=lerp(s.px,s.x,alpha),y=lerp(s.py,s.y,alpha);if(s.type==='guard'||s.type==='royal'){
    this.line(x-Math.cos(s.angle)*18,y-Math.sin(s.angle)*18,x,y,s.type==='royal'?'#e3cf8d77':'#c1cf7e55',s.type==='royal'?3:1);this.sprite('guard',x,y,s.type==='royal'?29:23,s.angle,this.clock,true);
   }else if(s.type==='super'){this.line(x-Math.cos(s.angle)*24,y-Math.sin(s.angle)*24,x,y,'#bce8cba0',4);this.sprite('guard',x,y,33,s.angle,this.clock,true);
   }else if(s.type==='sap'){this.ellipse(x,y,6,6,'#a5b65a');this.ellipse(x-2,y-2,2,2,'#e2db99')}else{this.ellipse(x,y,7,7,'#e9c374');this.ellipse(x-2,y-2,3,3,'#f7e4ad');for(let i=0;i<3;i++){const a=this.clock*6+i*TAU/3;this.ellipse(x+Math.cos(a)*10,y+Math.sin(a)*10,1.5,1.5,'#e0b963')}}}
  if(game&&(game.weapons.orbit||game.fused.shield)){const count=game.fused.shield?9:game.weapons.orbit+1,r=game.fused.shield?104:64;for(let i=0;i<count;i++){const a=game.time*2.5+i*TAU/count;this.sprite('guard',qx+Math.cos(a)*r,qy+Math.sin(a)*r,28,a+Math.PI/2,this.clock,true)}}
  this.ellipse(qx,qy+18,21,9,'#050c0b66');if(game?.superWeaponTime>0){c.strokeStyle='#bfebcf99';c.lineWidth=2;c.beginPath();c.arc(qx,qy,42+Math.sin(this.clock*5)*3,0,TAU);c.stroke()}if(q.inv>0){c.strokeStyle='#e0d2a4aa';c.lineWidth=1;c.beginPath();c.arc(qx,qy,34+Math.sin(this.clock*8)*2,0,TAU);c.stroke()}
  c.globalAlpha=q.inv>0?.75:1;this.sprite('queen',qx,qy,67,q.angle,this.clock,true);c.globalAlpha=1;
  for(const p of this.fx){p.life-=dt;if(p.life<=0)continue;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.exp(-3*dt);p.vy*=Math.exp(-3*dt);c.globalAlpha=Math.min(1,p.life/p.max*2);if(p.kind==='ring'){c.strokeStyle=p.color;c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,p.r*(1-p.life/p.max),0,TAU);c.stroke()}else if(p.kind==='emergence'){c.globalAlpha=p.life/p.max*.65;this.sprite('wildHive',p.x,p.y,100,-Math.PI/2,this.clock);}else if(p.kind==='corpse'){c.save();c.globalAlpha=p.life/p.max;this.sprite(p.sprite,p.x,p.y,p.r*(p.life/p.max*.5+.5),p.angle,this.clock);c.restore()}else if(p.kind==='shell'){c.save();c.translate(p.x,p.y);p.angle+=p.spin*dt;c.rotate(p.angle);c.fillStyle=p.color;c.beginPath();c.moveTo(-p.r,-p.r*.5);c.lineTo(p.r,-p.r);c.lineTo(p.r*.6,p.r);c.closePath();c.fill();c.restore()}else this.ellipse(p.x,p.y,p.r,p.r*.6,p.color);c.globalAlpha=1;}this.fx=this.fx.filter(p=>p.life>0);c.restore();
  const shade=c.createRadialGradient(this.w/2,this.h/2,Math.min(this.w,this.h)*.2,this.w/2,this.h/2,Math.max(this.w,this.h)*.72);shade.addColorStop(0,'#00000000');shade.addColorStop(1,stage===2?'#0b0d224d':'#07131355');c.fillStyle=shade;c.fillRect(0,0,this.w,this.h);
 }
}
root.MeadowRenderer={Renderer,rects};
})(typeof globalThis!=='undefined'?globalThis:this);

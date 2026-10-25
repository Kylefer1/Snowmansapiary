/* Interaction and SVG rendering; all planetary positions come from SolarEphemeris. */
(()=>{
'use strict';
const $=s=>document.querySelector(s),S=window.SolarEphemeris,svg=$('#solarMap'),status=$('#status');
if(!S){status.textContent='The planetary calculations could not load. Refresh to try again.';return;}
const ns='http://www.w3.org/2000/svg',presets={inner:1.9,jupiter:6.3,all:33},names={inner:'Inner planets',jupiter:'Out to Jupiter',all:'All eight planets'},layers={orbit:$('#orbitLayer'),link:$('#linkLayer'),body:$('#bodyLayer'),label:$('#labelLayer'),scale:$('#scaleLayer')};
const state={date:new Date(),live:true,selected:'Jupiter',cx:0,cy:0,extent:6.3,preset:'jupiter',data:null,width:800,height:600};
const points=new Map(),markers=new Map(),labels=new Map(),choices=new Map(),orbits=new Map();let renderQueued=false,drag=null;
function node(tag,attrs={},text){const el=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;}
function set(el,attrs){for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function unit(){return Math.min(state.width,state.height)/(2*state.extent);}
function screen(p){const u=unit();return{x:state.width/2+(p.x-state.cx)*u,y:state.height/2-(p.y-state.cy)*u};}
function world(p){const u=unit();return{x:state.cx+(p.x-state.width/2)/u,y:state.cy-(p.y-state.height/2)/u};}
function local(event){const r=svg.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};}
function announceError(error){status.textContent=error.message||'Choose a valid date and try again.';}
function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render();});}
function custom(){state.preset='custom';state.cx=clamp(state.cx,-55,55);state.cy=clamp(state.cy,-55,55);}
function resize(){const r=svg.getBoundingClientRect();state.width=Math.max(240,r.width);state.height=Math.max(240,r.height);set(svg,{viewBox:`0 0 ${state.width} ${state.height}`});queueRender();}
function setPreset(id){state.extent=presets[id];state.cx=state.cy=0;state.preset=id;queueRender();}
function zoom(factor,anchor={x:state.width/2,y:state.height/2}){const before=world(anchor);state.extent=clamp(state.extent/factor,.3,40);const after=world(anchor);state.cx+=before.x-after.x;state.cy+=before.y-after.y;custom();queueRender();}
function select(id){state.selected=id;const p=state.data.positions.find(p=>p.id===id),v=screen(p);if(v.x<35||v.x>state.width-35||v.y<40||v.y>state.height-35){state.cx=p.x;state.cy=p.y;custom();}details();queueRender();}
function details(){
  const p=state.data.positions.find(p=>p.id===state.selected),earth=state.data.positions.find(p=>p.id==='Earth'),jupiter=state.data.positions.find(p=>p.id==='Jupiter'),c=S.separation(earth,jupiter);
  $('#selectedName').textContent=p.id;$('#planetDescription').textContent=p.description;
  $('#planetGlyph').style.background=`radial-gradient(circle at 30% 25%,#f3f6e5,${p.color} 25%,${p.color} 42%,#111a29 95%)`;
  $('#planetGlyph').setAttribute('data-planet',p.id);
  $('#sunDistance').textContent=p.r.toFixed(3)+' AU';$('#earthDistance').textContent=p.id==='Earth'?'You are here':p.earthDistance.toFixed(3)+' AU';
  $('#longitude').textContent=p.longitude.toFixed(2)+'°';$('#latitude').textContent=(p.latitude>=0?'+':'')+p.latitude.toFixed(3)+'°';
  $('#comparisonDistance').textContent=c.au.toFixed(3)+' AU';$('#comparisonKm').textContent=(c.km/1e6).toFixed(1)+' million kilometers';
  $('#comparisonLightTime').textContent=c.lightMinutes.toFixed(1)+' minutes';$('#comparisonAngle').textContent=c.angle.toFixed(2)+'°';
  for(const [id,b]of choices)b.setAttribute('aria-pressed',String(id===p.id));
}
function setDate(value,live){
  try{
    const data=S.snapshot(value);state.data=data;state.date=data.date;state.live=live;status.textContent='';
    if(!live||document.activeElement!==$('#dateInput'))$('#dateInput').value=S.formatUTCInput(data.date);$('#epochText').dateTime=data.date.toISOString();
    $('#epochText').textContent=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'medium',timeZone:'UTC'}).format(data.date)+' UTC';
    $('#modeBadge').textContent=live?'NOW':'EXPLORING';$('#nowButton').setAttribute('aria-pressed',String(live));
    $('.epochNote').textContent=live?'Calculated locally · refreshes every minute':'Selected date and time · UTC';
    $('#prevDate').disabled=data.date.getTime()-30*S.DAY_MS<S.MIN_TIME;$('#nextDate').disabled=data.date.getTime()+30*S.DAY_MS>S.MAX_TIME;
    for(const p of data.positions){const pts=S.orbit(p.id,data.date,180);orbits.get(p.id).setAttribute('d',pts.map((v,i)=>(i?'L':'M')+v.x.toFixed(7)+' '+v.y.toFixed(7)).join(' '));markers.get(p.id).setAttribute('aria-label',`${p.id}, ${p.r.toFixed(3)} AU from the Sun. Select for details.`);}
    const rows=$('#positionRows');rows.replaceChildren();for(const p of data.positions){const row=document.createElement('tr'),head=document.createElement('th');head.scope='row';head.textContent=p.id;row.append(head);for(const value of [p.r.toFixed(3),p.earthDistance.toFixed(3),p.longitude.toFixed(2)+'°']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}rows.append(row);}
    details();queueRender();
  }catch(error){announceError(error);}
}
function labelLayout(visible){
  const boxes=[],byPriority=[...visible].sort((a,b)=>(a.id===state.selected?-2:a.id==='Earth'?-1:0)-(b.id===state.selected?-2:b.id==='Earth'?-1:0));
  for(const p of byPriority){
    const item=labels.get(p.id),v=screen(p),w=p.id.length*7+4,candidates=[[17,-15],[17,22],[-w-17,-15],[-w-17,22],[17,-35],[-w-17,42],[28,47],[-w-28,-48]];
    let chosen=null;for(const [dx,dy]of candidates){const x=v.x+dx,y=v.y+dy,b={x,y:y-12,w,h:17};if(x<8||x+w>state.width-8||y<48||y>state.height-12)continue;if(boxes.some(a=>b.x<a.x+a.w+7&&b.x+b.w>a.x-7&&b.y<a.y+a.h+4&&b.y+b.h>a.y-4))continue;if(visible.some(a=>{const q=screen(a);return q.x>b.x-10&&q.x<b.x+b.w+10&&q.y>b.y-10&&q.y<b.y+b.h+10;}))continue;chosen={x,y,b};break;}
    item.text.style.display=chosen?'':'none';item.line.style.display=chosen?'':'none';if(chosen){boxes.push(chosen.b);set(item.text,{x:chosen.x,y:chosen.y,fill:p.id===state.selected?'#fff1c8':p.id==='Earth'?'#8de5f8':'#b5c2d4'});const edge=chosen.x>v.x?chosen.x-4:chosen.x+w+4;set(item.line,{x1:v.x,y1:v.y,x2:edge,y2:chosen.y-5,stroke:p.color,opacity:.24});}
  }
}
function render(){
  if(!state.data)return;const u=unit(),{width:w,height:h}=state;
  layers.orbit.setAttribute('transform',`translate(${w/2},${h/2}) scale(${u},${-u}) translate(${-state.cx},${-state.cy})`);
  const earth=state.data.positions[2],jupiter=state.data.positions[4],a=screen(earth),b=screen(jupiter);set(comparisonLine,{x1:a.x,y1:a.y,x2:b.x,y2:b.y});
  const sun=screen({x:0,y:0});sunMarker.setAttribute('transform',`translate(${sun.x},${sun.y})`);sunText.setAttribute('x',sun.x+18);sunText.setAttribute('y',sun.y+5);
  const visible=[],outside=[];for(const p of state.data.positions){const v=screen(p),m=markers.get(p.id),show=v.x>-25&&v.x<w+25&&v.y>-25&&v.y<h+25;set(m,{transform:`translate(${v.x},${v.y})`,'aria-pressed':String(p.id===state.selected)});m.style.display=show?'':'none';m.querySelector('.planetHalo').style.display=p.id===state.selected?'':'none';orbits.get(p.id).style.stroke=p.id===state.selected?p.color:'#60748e';orbits.get(p.id).style.opacity=p.id===state.selected?'.5':'.28';labels.get(p.id).text.style.display='none';labels.get(p.id).line.style.display='none';if(v.x>8&&v.x<w-8&&v.y>8&&v.y<h-8)visible.push(p);else outside.push(p.id);}
  labelLayout(visible);
  const target=95/u,mag=10**Math.floor(Math.log10(target)),n=target/mag,length=(n>=5?5:n>=2?2:1)*mag,x=22,y=h-23;
  set(scaleLine,{d:`M${x} ${y-4}V${y}H${x+length*u}V${y-4}`});set(scaleText,{x,y:y-10});scaleText.textContent=(length<1?length.toFixed(length<.1?2:1):length)+' AU';
  for(const id of ['inner','jupiter','all'])$('#'+id+'View').setAttribute('aria-pressed',String(state.preset===id));
  const summary=(names[state.preset]||'Custom view')+(outside.length?' · Outside view: '+outside.join(', '):' · All eight planets in view');if($('#viewStatus').textContent!==summary)$('#viewStatus').textContent=summary;
  $('#zoomIn').disabled=state.extent<=.300001;$('#zoomOut').disabled=state.extent>=39.9999;
}
// Planet art is intentionally enlarged. The position transforms stay linear in AU.
const defs=svg.querySelector('defs');for(const p of S.PLANETS){
  const gradient=node('radialGradient',{id:'planet-'+p.id,cx:'30%',cy:'25%',r:'75%'});for(const [offset,color]of [['0%','#f8f4dc'],['24%',p.color],['53%',p.color],['100%','#0a111e']])gradient.append(node('stop',{offset,'stop-color':color}));defs.append(gradient);
  const path=node('path',{class:'orbit'});layers.orbit.append(path);orbits.set(p.id,path);
  const marker=node('g',{'data-planet':p.id,role:'button',tabindex:'0','aria-pressed':'false'});marker.append(node('circle',{r:22,class:'planetHit'}),node('circle',{r:p.radius+7,class:'planetHalo',fill:'none',stroke:p.color,'stroke-width':1,opacity:.65}));
  if(p.id==='Saturn')marker.append(node('ellipse',{rx:19,ry:5,fill:'none',stroke:'#c7b894','stroke-width':3,opacity:.7,transform:'rotate(-25)'}));
  marker.append(node('circle',{r:p.radius,fill:`url(#planet-${p.id})`,class:'planetBody'}));layers.body.append(marker);markers.set(p.id,marker);
  const line=node('line',{'pointer-events':'none'}),text=node('text',{class:'planetLabel'},p.id);layers.label.append(line,text);labels.set(p.id,{line,text});
  const button=document.createElement('button');button.type='button';button.setAttribute('aria-pressed','false');const dot=document.createElement('span');dot.className='planetDot';dot.style.setProperty('--planet-color',p.color);dot.setAttribute('aria-hidden','true');button.append(dot,document.createTextNode(p.id));button.addEventListener('click',()=>select(p.id));$('#planetChoices').append(button);choices.set(p.id,button);
}
const sunMarker=node('g',{'aria-hidden':'true'});sunMarker.append(node('circle',{r:22,fill:'#e7af4c',opacity:.22,filter:'url(#sunGlow)'}),node('circle',{r:11,fill:'url(#sunGradient)'}));layers.body.prepend(sunMarker);
const sunText=node('text',{class:'sunLabel'},'SUN');layers.label.prepend(sunText);
const comparisonLine=node('line',{class:'earthJupiterLine'});layers.link.append(comparisonLine);
const scaleLine=node('path',{stroke:'#7c8fa6','stroke-width':1,fill:'none'}),scaleText=node('text',{class:'scaleLabel'});layers.scale.append(scaleLine,scaleText);
$('#dateForm').addEventListener('submit',event=>{event.preventDefault();try{setDate(S.parseUTCInput($('#dateInput').value),false);}catch(error){announceError(error);}});
$('#nowButton').addEventListener('click',()=>setDate(new Date(),true));
for(const [id,days]of [['prevDate',-30],['nextDate',30]])$('#'+id).addEventListener('click',()=>setDate(new Date(state.date.getTime()+days*S.DAY_MS),false));
for(const id of ['inner','jupiter','all'])$('#'+id+'View').addEventListener('click',()=>setPreset(id));
$('#zoomIn').addEventListener('click',()=>zoom(1.4));$('#zoomOut').addEventListener('click',()=>zoom(1/1.4));$('#resetView').addEventListener('click',()=>setPreset('jupiter'));
svg.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(-clamp(event.deltaY,-100,100)*.003),local(event));},{passive:false});
svg.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;const p=local(event);points.set(event.pointerId,p);if(points.size===1)drag={start:p,moved:false,id:event.target.closest('[data-planet]')?.getAttribute('data-planet')};else if(drag)drag.moved=true;svg.setPointerCapture(event.pointerId);event.preventDefault();});
svg.addEventListener('pointermove',event=>{
  if(!points.has(event.pointerId))return;const before=[...points.values()],old=points.get(event.pointerId),p=local(event);points.set(event.pointerId,p);if(drag&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>7)drag.moved=true;
  if(points.size===1){state.cx-=(p.x-old.x)/unit();state.cy+=(p.y-old.y)/unit();}
  else{const after=[...points.values()],mid={x:(before[0].x+before[1].x)/2,y:(before[0].y+before[1].y)/2},next={x:(after[0].x+after[1].x)/2,y:(after[0].y+after[1].y)/2},distance=Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y),nextDistance=Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y),anchor=world(mid);if(distance>8)state.extent=clamp(state.extent*distance/Math.max(8,nextDistance),.3,40);state.cx=anchor.x-(next.x-state.width/2)/unit();state.cy=anchor.y+(next.y-state.height/2)/unit();}
  custom();queueRender();event.preventDefault();
});
function release(event){const existed=points.delete(event.pointerId);if(!existed)return;if(event.type==='pointerup'&&points.size===0&&drag&&!drag.moved&&drag.id)select(drag.id);if(!points.size)drag=null;try{svg.releasePointerCapture(event.pointerId);}catch{}event.preventDefault();}
for(const type of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(type,release);
svg.addEventListener('keydown',event=>{
  const id=event.target.closest('[data-planet]')?.getAttribute('data-planet');if(id&&['Enter',' '].includes(event.key)){event.preventDefault();select(id);return;}
  const step=state.extent*.16;if(event.key==='ArrowRight')state.cx+=step;else if(event.key==='ArrowLeft')state.cx-=step;else if(event.key==='ArrowUp')state.cy+=step;else if(event.key==='ArrowDown')state.cy-=step;else if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.4);return;}else if(event.key==='-'){event.preventDefault();zoom(1/1.4);return;}else if(event.key==='Home'){event.preventDefault();setPreset('jupiter');return;}else return;event.preventDefault();custom();queueRender();
});
let resizeObserver;if(window.ResizeObserver){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(svg);}else window.addEventListener('resize',resize);
setDate(new Date(),true);resize();setInterval(()=>{if(state.live&&!document.hidden)setDate(new Date(),true);},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.live)setDate(new Date(),true);});
})();

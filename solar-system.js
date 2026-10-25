/* Multi-scale SVG explorer. Computed ephemerides and illustrative atlases keep
   distinct coordinate systems, units and labels. Ordinary wheel scroll is free. */
(()=>{
'use strict';
const $=s=>document.querySelector(s),S=window.SolarEphemeris,C=window.SolarCatalog,svg=$('#solarMap'),status=$('#status');
if(!S||!C){status.textContent='The space explorer could not load. Refresh to try again.';return;}
const ns='http://www.w3.org/2000/svg',presets={inner:1.9,jupiter:6.3,all:33,outer:80},names={inner:'Inner planets',jupiter:'Out to Jupiter',all:'All eight planets',outer:'Beyond Neptune'},layers={orbit:$('#orbitLayer'),body:$('#bodyLayer'),label:$('#labelLayer'),scale:$('#scaleLayer')};
const state={date:new Date(),live:true,selected:'Jupiter',scene:'solar',parent:'Earth',system:'TRAPPIST-1',cx:0,cy:0,extent:6.3,preset:'jupiter',data:null,bodies:[],width:800,height:600,iss:null,issPending:false};
const points=new Map(),markers=new Map(),labels=new Map(),choices=new Map(),orbits=new Map(),contextChoices=new Map();let renderQueued=false,drag=null,sceneData=null,requestId=0,pinchDestination=null;
function node(tag,attrs={},text){const el=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;}
function set(el,attrs){for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function unit(){return Math.min(state.width,state.height)/(2*state.extent);}
function screen(p){const u=unit();return{x:state.width/2+(p.x-state.cx)*u,y:state.height/2-(p.y-state.cy)*u};}
function world(p){const u=unit();return{x:state.cx+(p.x-state.width/2)/u,y:state.cy-(p.y-state.height/2)/u};}
function local(event){const r=svg.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};}
function announceError(error){status.textContent=error.message||'Choose a valid date and try again.';}
function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render();});}
function limits(){if(state.scene==='moons'){return{min:state.parent==='Earth'?9000:Math.max(5000,C.physicalRadius[state.parent]*1.15),max:sceneData.extent*3};}if(state.scene==='stars')return{min:1,max:70};if(state.scene==='system')return{min:.003,max:Math.max(...sceneData.map(p=>p.a))*2};return{min:.3,max:100};}
function custom(){state.preset='custom';const bound=state.scene==='solar'?150:state.scene==='stars'?100:limits().max*2;state.cx=clamp(state.cx,-bound,bound);state.cy=clamp(state.cy,-bound,bound);}
function resize(){const r=svg.getBoundingClientRect();state.width=Math.max(240,r.width);state.height=Math.max(240,r.height);set(svg,{viewBox:`0 0 ${state.width} ${state.height}`});queueRender();}
function pathFor(points){return points.map((v,i)=>(i?'L':'M')+v.x.toFixed(8)+' '+v.y.toFixed(8)).join(' ');}
function setPath(id,points,small=false){if(!orbits.has(id)){const el=node('path',{class:small?'orbit smallBodyOrbit':'orbit'});layers.orbit.append(el);orbits.set(id,el);}orbits.get(id).setAttribute('d',pathFor(points));}
function currentBody(){return state.bodies.find(p=>p.id===state.selected);}
function setPreset(id){if(state.scene!=='solar')setScene('solar');state.extent=presets[id];state.cx=state.cy=0;state.preset=id;queueRender();}
function zoom(factor,anchor={x:state.width/2,y:state.height/2}){
  const range=limits();
  if(factor<1&&state.extent>=range.max*.999){if(state.scene==='solar'){setScene('stars');return;}if(state.scene==='moons'){const parent=state.parent;setScene('solar');select(parent);return;}if(state.scene==='system'){setScene('stars');select(state.system);return;}}
  if(factor>1&&state.scene==='solar'&&state.extent<=.43&&C.parents.includes(state.selected)){setScene('moons',state.selected);return;}
  const before=world(anchor);state.extent=clamp(state.extent/factor,range.min,range.max);const after=world(anchor);state.cx+=before.x-after.x;state.cy+=before.y-after.y;custom();queueRender();
}
function select(id){
  const p=state.bodies.find(p=>p.id===id);if(!p)return;state.selected=id;const v=screen(p);if(v.x<35||v.x>state.width-35||v.y<40||v.y>state.height-35){state.cx=p.x;state.cy=p.y;custom();}details();queueRender();
}
function stat(labelId,valueId,label,value){$('#'+labelId).textContent=label;$('#'+valueId).textContent=value;}
function km(value){return Math.round(value).toLocaleString('en-US')+' km';}
function period(days){return days<1?(days*24).toFixed(2)+' hours':days.toFixed(2)+' days';}
function details(){
  const p=currentBody();if(!p)return;
  $('#selectedName').textContent=p.id;$('#selectedKind').textContent=p.kind||'Planet';$('#planetDescription').textContent=p.description;
  $('#planetGlyph').style.background=`radial-gradient(circle at 30% 25%,#f3f6e5,${p.color} 25%,${p.color} 42%,#111a29 95%)`;$('#planetGlyph').setAttribute('data-planet',p.id);
  const action=$('#exploreSelected');action.hidden=true;$('.comparisonPanel').hidden=state.scene!=='solar';
  if(state.scene==='solar'){
    const earth=state.data.positions[2],jupiter=state.data.positions[4],c=S.separation(earth,jupiter);
    stat('distanceLabel','sunDistance','Sun distance',p.r.toFixed(3)+' AU');stat('distance2Label','earthDistance','Earth distance',p.id==='Earth'?'You are here':S.distance(p,earth).toFixed(3)+' AU');
    stat('angleLabel','longitude','Longitude around the Sun',p.longitude.toFixed(2)+'°');stat('heightLabel','latitude','Above the orbital plane',(p.latitude>=0?'+':'')+p.latitude.toFixed(3)+'°');
    $('#coordinateNote').textContent=p.approximate?'Approximate two-body orbit from a 2026 JPL element snapshot. Perturbations are omitted. Not a live tracking or close-approach prediction.':'Longitude uses the fixed J2000 ecliptic plane. A negative latitude means below that plane. Markers are enlarged.';
    $('#comparisonDistance').textContent=c.au.toFixed(3)+' AU';$('#comparisonKm').textContent=(c.km/1e6).toFixed(1)+' million kilometers';$('#comparisonLightTime').textContent=c.lightMinutes.toFixed(1)+' minutes';$('#comparisonAngle').textContent=c.angle.toFixed(2)+'°';
    if(C.parents.includes(p.id)){action.hidden=false;action.textContent='Explore '+p.id+'’s moons ↗';}
  }else if(state.scene==='moons'){
    const center=p.id===state.parent,iss=p.id==='ISS';
    stat('distanceLabel','sunDistance',iss?'Altitude over Earth':'Distance from '+state.parent,iss?km(p.altitude):center?'At the center':km(p.r));
    stat('distance2Label','earthDistance',iss?'Orbital speed':'Orbit period',iss?km(p.velocity)+'/h':p.period?period(p.period):'Central planet');
    stat('angleLabel','longitude','Position model',iss?'Timestamped feed':sceneData.calculated?'Calculated':'Illustrated');stat('heightLabel','latitude','Object type',center?'Planet':iss?'Artificial satellite':'Natural satellite');
    $('#coordinateNote').textContent=iss?'The ISS is shown at its sample time, not extrapolated. A 2D projection can overlap Earth even when the station is above its surface.':sceneData.calculated?'Geometric positions projected onto the J2000 ecliptic plane. Distances are from the planet’s center. Only selected major moons are shown.':'Orbit sizes use JPL mean distances. Circular orbits and marker angles are illustrative, viewed face-on. They are not current moon positions.';
  }else if(state.scene==='stars'){
    stat('distanceLabel','sunDistance','True Sun distance',p.distance.toFixed(2)+' light-years');stat('distance2Label','earthDistance','Planets in this atlas',String(p.planets.length));stat('angleLabel','longitude','Chart projection','J2000 ecliptic');stat('heightLabel','latitude','Positions','Catalog snapshot');
    $('#coordinateNote').textContent='A selection of two systems, not a complete star catalog. Depth is flattened, so map separations understate some true distances. The Sun is the gold marker.';action.hidden=false;action.textContent='Open this planetary system ↗';
  }else{
    stat('distanceLabel','sunDistance','Orbit size (semi-major axis)',p.a.toFixed(4)+' AU');stat('distance2Label','earthDistance','Orbit period',period(p.period));stat('angleLabel','longitude','Marker placement','Illustrative');stat('heightLabel','latitude','Object type','Exoplanet');$('#coordinateNote').textContent='Orbit sizes and periods are from the NASA Exoplanet Archive. The face-on circles, viewing direction, colors and marker angles are illustrative. They are not positions at the selected date.';
  }
  for(const [id,b]of choices)b.setAttribute('aria-pressed',String(state.scene==='solar'&&id===p.id));for(const [id,b]of contextChoices)b.setAttribute('aria-pressed',String(id===p.id));
}
function updateEpoch(){
  const illustrated=state.scene==='stars'||state.scene==='system'||state.scene==='moons'&&!sceneData.calculated;
  $('#timePanel').hidden=illustrated;
  $('#epochText').dateTime=state.date.toISOString();
  $('#epochText').textContent=illustrated?(state.scene==='stars'?'Selected stars · distances in light-years':'Orbital sizes · placements illustrated'):new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'medium',timeZone:'UTC'}).format(state.date)+' UTC';
  $('#modeBadge').textContent=illustrated?'ATLAS':state.live?'NOW':'EXPLORING';$('#nowButton').setAttribute('aria-pressed',String(state.live));
  $('.epochLabel').textContent=illustrated?'Explore the catalog':'Positions calculated for';
  $('.epochNote').textContent=illustrated?'Catalog snapshot: 25 October 2026':state.live?'Calculated locally · refreshes every minute':'Selected date and time · UTC';
}
function rebuildContext(){
  const list=state.scene==='solar'?state.bodies.filter(p=>p.approximate):state.bodies;
  if([...contextChoices.keys()].join('|')===list.map(p=>p.id).join('|'))return;
  const nav=$('#contextChoices');nav.replaceChildren();contextChoices.clear();
  for(const p of list){const b=document.createElement('button');b.type='button';b.textContent=p.id;b.setAttribute('aria-pressed',String(p.id===state.selected));if(p.approximate)b.className='smallBodyChoice';b.addEventListener('click',()=>select(p.id));nav.append(b);contextChoices.set(p.id,b);}
}
function rebuildScene(){
  if(!state.data)return;
  if(state.scene==='solar'){
    state.bodies=[...state.data.positions];for(const p of state.data.positions)setPath(p.id,S.orbit(p.id,state.date,180));
    if($('#asteroidToggle').checked)for(const a of C.data.asteroids){const p=C.asteroidPosition(a,state.date);if(p){state.bodies.push(p);setPath(p.id,C.asteroidOrbit(a),true);}}
    $('#mapTitle').textContent='Our planetary neighborhood';$('#mapCompass').textContent='⊙ View from ecliptic north';
    $('#sceneNote').textContent='Calculated planetary positions. The four selected small bodies use approximate JPL-based orbits near their 2026 element epoch. Zoom all the way out, then once more, to reach other stars.';
    if($('#asteroidToggle').checked&&!state.bodies.some(p=>p.approximate))$('#sceneNote').textContent+=' Small-body estimates are hidden at this date because it is outside their two-year model window.';
  }else if(state.scene==='moons'){
    sceneData=C.moonSnapshot(state.parent,state.date);const parent=state.data.positions.find(p=>p.id===state.parent);
    state.bodies=[{...parent,x:0,y:0,z:0,r:0},...sceneData.moons];for(const m of sceneData.moons)setPath(m.id,C.moonOrbit(m,state.date));
    if(state.parent==='Earth'&&state.live&&state.iss&&(Date.now()-state.iss.sampleTime.getTime())<180000)state.bodies.push(state.iss);
    $('#mapTitle').textContent=state.parent+' and its moons';$('#mapCompass').textContent=sceneData.calculated?'⊙ View from ecliptic north':'⊙ Illustrated, face-on orbit atlas';
    $('#sceneNote').textContent=sceneData.calculated?'Calculated positions for '+(state.parent==='Earth'?'Earth’s Moon':'Jupiter’s four Galilean moons')+' at the displayed time. Orbit distances are in kilometers; markers are enlarged.':'An illustrated selection of '+state.parent+'’s moons. Orbital distances are to scale, but the circular paths and marker angles are not current positions. Tap a moon to learn more.';
  }else if(state.scene==='stars'){
    state.bodies=C.data.stars.map(C.starPosition);$('#mapTitle').textContent='Beyond our Sun';$('#mapCompass').textContent='⊙ Star positions projected onto the ecliptic';$('#sceneNote').textContent='The scale has changed to light-years. This is a chart of two selected planetary systems, not a complete map of nearby stars. Tap a star, then open its system. True Sun distances are shown in the details.';
  }else{
    sceneData=C.systemPlanets(state.system);state.bodies=sceneData;for(const p of state.bodies)setPath(p.id,C.circle(p.a));$('#mapTitle').textContent=state.system+' planetary system';$('#mapCompass').textContent='⊙ Illustrated, face-on system';$('#sceneNote').textContent='An illustrated orbital-size comparison around '+state.system+'. Sizes of the orbits come from the NASA Exoplanet Archive. Planet angles, colors and viewing direction are illustrative, not current positions. Tap a planet for its orbit and period.';
  }
  if(!currentBody())state.selected=state.scene==='solar'?'Jupiter':state.scene==='moons'?state.parent:state.bodies[0].id;
  $('#viewChoices').hidden=state.scene!=='solar';$('#asteroidControl').hidden=state.scene!=='solar';$('#issPanel').hidden=!(state.scene==='moons'&&state.parent==='Earth');
  $('#solarView').setAttribute('aria-pressed',String(state.scene==='solar'));$('#starsView').setAttribute('aria-pressed',String(state.scene==='stars'||state.scene==='system'));$('#moonView').setAttribute('aria-pressed',String(state.scene==='moons'));
  $('#mapScaleNote').textContent=state.scene==='stars'?'Projected distances. Markers enlarged.':state.scene==='system'||state.scene==='moons'&&!sceneData.calculated?'Orbit sizes to scale. Placements illustrated.':'Distances to scale. Markers enlarged.';
  rebuildContext();updateEpoch();details();queueRender();
}
function setScene(scene,id){
  state.scene=scene;state.cx=state.cy=0;state.preset='custom';points.clear();drag=null;pinchDestination=null;$('#mapTip').hidden=true;
  if(scene==='moons'){state.parent=id||$('#moonParent').value;$('#moonParent').value=state.parent;sceneData=C.moonSnapshot(state.parent,state.date);state.extent=sceneData.extent;state.selected=state.parent;}
  else if(scene==='stars'){state.extent=47;state.selected=state.system;}
  else if(scene==='system'){state.system=id||state.system;sceneData=C.systemPlanets(state.system);state.extent=Math.max(...sceneData.map(p=>p.a))*1.3;state.selected=sceneData[0].id;}
  else{state.scene='solar';state.extent=6.3;state.preset='jupiter';state.selected='Jupiter';}
  rebuildScene();if(scene==='moons'&&state.parent==='Earth')refreshISS();
}
function setDate(value,live){
  try{
    const data=S.snapshot(value);state.data=data;state.date=data.date;state.live=live;status.textContent='';
    if(!live||document.activeElement!==$('#dateInput'))$('#dateInput').value=S.formatUTCInput(data.date);
    $('#prevDate').disabled=data.date.getTime()-30*S.DAY_MS<S.MIN_TIME;$('#nextDate').disabled=data.date.getTime()+30*S.DAY_MS>S.MAX_TIME;
    const rows=$('#positionRows');rows.replaceChildren();for(const p of data.positions){const row=document.createElement('tr'),head=document.createElement('th');head.scope='row';head.textContent=p.id;row.append(head);for(const value of [p.r.toFixed(3),p.earthDistance.toFixed(3),p.longitude.toFixed(2)+'°']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}rows.append(row);}
    rebuildScene();if(state.scene==='moons'&&state.parent==='Earth')refreshISS();
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
  if(!state.data)return;const u=unit(),{width:w,height:h}=state,active=new Set(state.bodies.map(p=>p.id));
  layers.orbit.setAttribute('transform',`translate(${w/2},${h/2}) scale(${u},${-u}) translate(${-state.cx},${-state.cy})`);
  for(const [id,m]of markers){m.style.display='none';labels.get(id).text.style.display='none';labels.get(id).line.style.display='none';}
  for(const [id,p]of orbits){p.style.display=active.has(id)&&!(state.scene==='moons'&&id===state.parent)&&state.scene!=='stars'?'':'none';p.style.stroke=id===state.selected?'#cbb986':'#60748e';p.style.opacity=id===state.selected?'.5':'.22';}
  const sun=screen({x:0,y:0});sunMarker.style.display=state.scene==='moons'?'none':'';sunText.style.display=state.scene==='moons'?'none':'';sunMarker.setAttribute('transform',`translate(${sun.x},${sun.y})`);sunText.setAttribute('x',sun.x+18);sunText.setAttribute('y',sun.y+5);sunText.textContent=state.scene==='system'?state.system:state.scene==='stars'?'SUN / HOME':'SUN';
  const visible=[],outside=[];
  for(const p of state.bodies){const v=screen(p),m=markers.get(p.id),show=v.x>-25&&v.x<w+25&&v.y>-25&&v.y<h+25;set(m,{transform:`translate(${v.x},${v.y})`,'aria-pressed':String(p.id===state.selected),'aria-label':p.id+'. '+p.description+' Select for details.'});m.style.display=show?'':'none';m.querySelector('.planetHalo').style.display=p.id===state.selected?'':'none';
    const r=state.scene==='moons'&&p.id===state.parent?clamp(C.physicalRadius[p.id]*u,10,200):p.radius;set(m.querySelector('.planetBody'),{r});set(m.querySelector('.planetHit'),{r:Math.max(22,r)});set(m.querySelector('.planetHalo'),{r:r+7});
    if(v.x>8&&v.x<w-8&&v.y>8&&v.y<h-8)visible.push(p);else outside.push(p.id);
  }
  labelLayout(visible);
  const target=95/u,mag=10**Math.floor(Math.log10(target)),n=target/mag,length=(n>=5?5:n>=2?2:1)*mag,x=22,y=h-23;
  set(scaleLine,{d:`M${x} ${y-4}V${y}H${x+length*u}V${y-4}`});set(scaleText,{x,y:y-10});scaleText.textContent=(length<1?Number(length.toPrecision(2)):length.toLocaleString('en-US'))+(state.scene==='stars'?' light-years':state.scene==='moons'?' km':' AU');
  for(const id of Object.keys(presets))$('#'+id+'View').setAttribute('aria-pressed',String(state.scene==='solar'&&state.preset===id));
  const summary=state.scene==='solar'?(names[state.preset]||'Custom solar view')+(outside.length?' · Outside view: '+outside.join(', '):' · All eight planets in view'):state.scene==='moons'?state.parent+' neighborhood · '+(sceneData.calculated?'Calculated positions':'Illustrated atlas'):state.scene==='stars'?'Selected planetary systems · Light-year scale':state.system+' · Illustrated orbits';
  if($('#viewStatus').textContent!==summary)$('#viewStatus').textContent=summary;
  const range=limits();$('#zoomIn').disabled=state.extent<=range.min*1.000001&&!(state.scene==='solar'&&C.parents.includes(state.selected));$('#zoomOut').disabled=state.scene==='stars'&&state.extent>=range.max*.999999;
}
const defs=svg.querySelector('defs');
const allBodies=[...S.PLANETS,...C.data.asteroids,...C.data.moons,...C.data.stars,...C.data.stars.flatMap(s=>s.planets),{id:'ISS',radius:6,color:'#b3efc9',description:'The International Space Station.'}];
for(const p of allBodies){
  const gradientId='body-'+allBodies.indexOf(p),gradient=node('radialGradient',{id:gradientId,cx:'30%',cy:'25%',r:'75%'});for(const [offset,color]of [['0%','#f8f4dc'],['24%',p.color],['53%',p.color],['100%','#0a111e']])gradient.append(node('stop',{offset,'stop-color':color}));defs.append(gradient);
  if(S.PLANETS.some(q=>q.id===p.id)){const path=node('path',{class:'orbit'});layers.orbit.append(path);orbits.set(p.id,path);}
  const marker=node('g',{'data-planet':p.id,role:'button',tabindex:'0','aria-pressed':'false'});marker.append(node('title',{},p.id+': '+p.description),node('circle',{r:22,class:'planetHit'}),node('circle',{r:p.radius+7,class:'planetHalo',fill:'none',stroke:p.color,'stroke-width':1,opacity:.65}));
  if(p.id==='Saturn')marker.append(node('ellipse',{rx:19,ry:5,fill:'none',stroke:'#c7b894','stroke-width':3,opacity:.7,transform:'rotate(-25)'}));
  marker.append(node('circle',{r:p.radius,fill:`url(#${gradientId})`,class:'planetBody'}));if(p.id==='ISS')marker.append(node('path',{d:'M-12 -5h6v10h-6zM6 -5h6v10H6z',class:'issMarker'}));layers.body.append(marker);markers.set(p.id,marker);
  const line=node('line',{'pointer-events':'none'}),text=node('text',{class:'planetLabel'},p.id);layers.label.append(line,text);labels.set(p.id,{line,text});
  marker.addEventListener('pointerenter',()=>{if(points.size)return;const body=state.bodies.find(b=>b.id===p.id);if(!body)return;const tip=$('#mapTip');tip.replaceChildren();const name=document.createElement('strong');name.textContent=p.id;tip.append(name,document.createTextNode(body.description));tip.hidden=false;});marker.addEventListener('pointerleave',()=>{$('#mapTip').hidden=true;});
  marker.addEventListener('focus',()=>{if(state.bodies.some(b=>b.id===p.id))select(p.id);});
}
for(const p of S.PLANETS){const button=document.createElement('button');button.type='button';button.setAttribute('aria-pressed','false');const dot=document.createElement('span');dot.className='planetDot';dot.style.setProperty('--planet-color',p.color);dot.setAttribute('aria-hidden','true');button.append(dot,document.createTextNode(p.id));button.addEventListener('click',()=>{if(state.scene!=='solar')setScene('solar');select(p.id);});$('#planetChoices').append(button);choices.set(p.id,button);}
const sunMarker=node('g',{'data-home':'true',role:'button',tabindex:'0','aria-label':'Sun. Return to the solar system.'});sunMarker.append(node('circle',{r:22,fill:'#e7af4c',opacity:.22,filter:'url(#sunGlow)'}),node('circle',{r:11,fill:'url(#sunGradient)'}));layers.body.prepend(sunMarker);sunMarker.addEventListener('click',()=>{if(state.scene==='stars')setScene('solar');});sunMarker.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();setScene('solar');}});
const sunText=node('text',{class:'sunLabel'},'SUN');layers.label.prepend(sunText);
const scaleLine=node('path',{stroke:'#7c8fa6','stroke-width':1,fill:'none'}),scaleText=node('text',{class:'scaleLabel'});layers.scale.append(scaleLine,scaleText);
$('#dateForm').addEventListener('submit',event=>{event.preventDefault();try{setDate(S.parseUTCInput($('#dateInput').value),false);}catch(error){announceError(error);}});$('#nowButton').addEventListener('click',()=>setDate(new Date(),true));
for(const [id,days]of [['prevDate',-30],['nextDate',30]])$('#'+id).addEventListener('click',()=>setDate(new Date(state.date.getTime()+days*S.DAY_MS),false));
for(const id of Object.keys(presets))$('#'+id+'View').addEventListener('click',()=>setPreset(id));
$('#solarView').addEventListener('click',()=>setScene('solar'));$('#moonView').addEventListener('click',()=>setScene('moons',$('#moonParent').value));$('#starsView').addEventListener('click',()=>setScene('stars'));$('#satelliteView').addEventListener('click',()=>{setScene('moons','Earth');state.extent=13000;queueRender();});
$('#exploreSelected').addEventListener('click',()=>{if(state.scene==='solar'&&C.parents.includes(state.selected))setScene('moons',state.selected);else if(state.scene==='stars')setScene('system',state.selected);});
$('#asteroidToggle').addEventListener('change',rebuildScene);$('#zoomIn').addEventListener('click',()=>zoom(1.4));$('#zoomOut').addEventListener('click',()=>zoom(1/1.4));$('#resetView').addEventListener('click',()=>{if(state.scene==='solar')setPreset('jupiter');else setScene(state.scene,state.scene==='moons'?state.parent:state.system);});
// A normal wheel scrolls the page, including when the pointer is over the map.
svg.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();zoom(Math.exp(-clamp(event.deltaY,-100,100)*.003),local(event));},{passive:false});
svg.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;const p=local(event);points.set(event.pointerId,p);$('#mapTip').hidden=true;if(points.size===1){pinchDestination=null;drag={start:p,moved:false,id:event.target.closest('[data-planet]')?.getAttribute('data-planet'),home:!!event.target.closest('[data-home]')};}else if(drag)drag.moved=true;svg.setPointerCapture(event.pointerId);event.preventDefault();});
svg.addEventListener('pointermove',event=>{
  if(!points.has(event.pointerId))return;const before=[...points.values()],old=points.get(event.pointerId),p=local(event);points.set(event.pointerId,p);if(drag&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>7)drag.moved=true;
  if(points.size===1){state.cx-=(p.x-old.x)/unit();state.cy+=(p.y-old.y)/unit();}
  else{const after=[...points.values()],mid={x:(before[0].x+before[1].x)/2,y:(before[0].y+before[1].y)/2},next={x:(after[0].x+after[1].x)/2,y:(after[0].y+after[1].y)/2},distance=Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y),nextDistance=Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y),anchor=world(mid),range=limits(),requested=state.extent*distance/Math.max(8,nextDistance);pinchDestination=null;if(distance>8){if(requested<range.min*.9&&state.scene==='solar'&&C.parents.includes(state.selected))pinchDestination={scene:'moons',id:state.selected};else if(requested>range.max*1.1&&state.scene==='solar')pinchDestination={scene:'stars'};else if(requested>range.max*1.1&&state.scene==='system')pinchDestination={scene:'stars'};else if(requested>range.max*1.1&&state.scene==='moons')pinchDestination={scene:'solar'};state.extent=clamp(requested,range.min,range.max);}state.cx=anchor.x-(next.x-state.width/2)/unit();state.cy=anchor.y+(next.y-state.height/2)/unit();}
  custom();queueRender();event.preventDefault();
});
function release(event){if(!points.delete(event.pointerId))return;if(event.type==='pointercancel'||event.type==='lostpointercapture')pinchDestination=null;const tap=event.type==='pointerup'&&points.size===0&&drag&&!drag.moved,id=tap&&drag.id,home=tap&&drag.home,destination=!points.size&&pinchDestination;if(!points.size)drag=null;try{svg.releasePointerCapture(event.pointerId);}catch{}if(destination)setScene(destination.scene,destination.id);else if(id)select(id);else if(home&&state.scene==='stars')setScene('solar');event.preventDefault();}
for(const type of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(type,release);
svg.addEventListener('keydown',event=>{
  const id=event.target.closest('[data-planet]')?.getAttribute('data-planet');if(id&&['Enter',' '].includes(event.key)){event.preventDefault();select(id);return;}
  const step=state.extent*.16;if(event.key==='ArrowRight')state.cx+=step;else if(event.key==='ArrowLeft')state.cx-=step;else if(event.key==='ArrowUp')state.cy+=step;else if(event.key==='ArrowDown')state.cy-=step;else if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.4);return;}else if(event.key==='-'){event.preventDefault();zoom(1/1.4);return;}else if(event.key==='Home'){event.preventDefault();if(state.scene==='solar')setPreset('jupiter');else setScene(state.scene,state.scene==='moons'?state.parent:state.system);return;}else return;event.preventDefault();custom();queueRender();
});
async function refreshISS(){
  if(state.scene!=='moons'||state.parent!=='Earth'||document.hidden)return;
  if(!state.live){requestId++;$('#issStatus').textContent='ISS tracking is paused for a selected past or future date. Return to now for live samples.';state.iss=null;for(const key of ['issAltitude','issSpeed','issTime'])$('#'+key).textContent='Unavailable';rebuildScene();return;}
  if(state.issPending)return;state.issPending=true;const id=++requestId,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);$('#issStatus').textContent='Requesting a timestamped ISS position…';
  try{const response=await fetch('https://api.wheretheiss.at/v1/satellites/25544',{signal:controller.signal,cache:'no-store',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error('The satellite feed is temporarily unavailable.');const sample=C.issSample(await response.json(),new Date());if(id!==requestId||!state.live)return;state.iss=sample;$('#issStatus').textContent='Position received. The green marker shows the sample time below.';$('#issAltitude').textContent=sample.altitude.toFixed(1)+' km';$('#issSpeed').textContent=Math.round(sample.velocity).toLocaleString('en-US')+' km/h';$('#issTime').textContent=sample.sampleTime.toISOString().replace('T',' ').slice(0,19);}
  catch(error){if(id===requestId){state.iss=null;$('#issStatus').textContent=error.name==='AbortError'?'The satellite feed timed out. You can try Refresh ISS.':error.message;for(const key of ['issAltitude','issSpeed','issTime'])$('#'+key).textContent='Unavailable';}}
  finally{clearTimeout(timeout);state.issPending=false;if(state.scene==='moons'&&state.parent==='Earth')rebuildScene();}
}
$('#refreshISS').addEventListener('click',refreshISS);$('#lowOrbitView').addEventListener('click',()=>{state.cx=state.cy=0;state.extent=13000;custom();queueRender();});
function updateTide(value){const phase=clamp(Number(value)||0,0,360),r=phase*Math.PI/180;$('#tidePhase').value=String(phase);$('#tideWater').setAttribute('d',pathFor(C.tideShape(phase))+'Z');$('#tideMoon').setAttribute('transform',`translate(${126*Math.cos(r)},${-126*Math.sin(r)})`);const quarter=Math.abs(Math.cos(2*r)+1)<.2,spring=Math.abs(Math.cos(2*r)-1)<.2;$('#tidePhaseName').textContent=phase<22.5||phase>=337.5?'New moon':phase<67.5?'Waxing crescent':phase<112.5?'First quarter':phase<157.5?'Waxing gibbous':phase<202.5?'Full moon':phase<247.5?'Waning gibbous':phase<292.5?'Last quarter':'Waning crescent';$('#tideExplanation').textContent=spring?'Spring-tide alignment: lunar and solar tidal effects reinforce, giving a larger tidal range.':quarter?'Neap-tide alignment: lunar and solar tidal effects partly offset, giving a smaller tidal range.':'Between spring and neap tides, the combined tidal pattern gradually changes as the Moon moves around Earth.';}
$('#tidePhase').addEventListener('input',()=>updateTide($('#tidePhase').value));for(const b of document.querySelectorAll('[data-phase]'))b.addEventListener('click',()=>updateTide(b.getAttribute('data-phase')));$('#currentTidePhase').addEventListener('click',()=>updateTide(window.Astronomy.MoonPhase(state.date)));
let resizeObserver;if(window.ResizeObserver){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(svg);}else window.addEventListener('resize',resize);
setDate(new Date(),true);resize();updateTide(window.Astronomy.MoonPhase(state.date));setInterval(()=>{if(state.live&&!document.hidden)setDate(new Date(),true);},60000);setInterval(refreshISS,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.live){setDate(new Date(),true);refreshISS();}});
})();

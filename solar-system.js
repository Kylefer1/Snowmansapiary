/* Multi-scale SVG explorer. Computed ephemerides and illustrative atlases keep
   distinct coordinate systems, units and labels. Ordinary wheel scroll is free. */
(()=>{
'use strict';
const $=s=>document.querySelector(s),S=window.SolarEphemeris,C=window.SolarCatalog,svg=$('#solarMap'),status=$('#status');
if(!S||!C){status.textContent='The space explorer could not load. Refresh to try again.';return;}
const ns='http://www.w3.org/2000/svg',presets={inner:1.9,jupiter:6.3,all:33,outer:80},names={inner:'Inner planets',jupiter:'Out to Jupiter',all:'All eight planets',outer:'Beyond Neptune'},layers={orbit:$('#orbitLayer'),body:$('#bodyLayer'),label:$('#labelLayer'),scale:$('#scaleLayer')};
const state={date:new Date(),live:true,selected:'Jupiter',scene:'solar',parent:'Earth',system:'TRAPPIST-1',cx:0,cy:0,extent:6.3,preset:'jupiter',data:null,bodies:[],width:800,height:600,iss:null,issPending:false};
const facts=window.SolarPlanetFacts?window.SolarPlanetFacts.planets:{},points=new Map(),markers=new Map(),labels=new Map(),choices=new Map(),orbits=new Map(),contextChoices=new Map();let renderQueued=false,drag=null,sceneData=null,requestId=0,lastTap=null,cameraToken=0,lastOrbitMinute=null,cloudRequest=0,cloudPending=false;
const cloudClient=window.SolarEarthClouds?window.SolarEarthClouds.createClient():null;state.earthCloud=null;
function node(tag,attrs={},text){const el=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;}
function set(el,attrs){for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function unit(){return Math.min(state.width,state.height)/(2*state.extent);}
function screen(p){const u=unit();return{x:state.width/2+(p.x-state.cx)*u,y:state.height/2-(p.y-state.cy)*u};}
function world(p){const u=unit();return{x:state.cx+(p.x-state.width/2)/u,y:state.cy-(p.y-state.height/2)/u};}
function local(event){const r=svg.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top};}
function announceError(error){status.textContent=error.message||'Choose a valid date and try again.';}
function queueRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render();});}
function limits(){if(state.scene==='moons')return{min:state.parent==='Earth'?9000:Math.max(2000,C.physicalRadius[state.parent]*1.15),max:sceneData.extent*3};if(state.scene==='stars')return{min:1,max:80000};if(state.scene==='cosmos')return{min:100000,max:50000000000};if(state.scene==='system')return{min:.0001,max:Math.max(...sceneData.map(p=>p.a))*2};return{min:.3,max:100};}
function custom(){state.preset='custom';const bound=state.scene==='solar'?150:limits().max*2;state.cx=clamp(state.cx,-bound,bound);state.cy=clamp(state.cy,-bound,bound);}
function resize(){const r=svg.getBoundingClientRect();state.width=Math.max(240,r.width);state.height=Math.max(240,r.height);set(svg,{viewBox:`0 0 ${state.width} ${state.height}`});queueRender();}
function pathFor(points){return points.map((v,i)=>(i?'L':'M')+v.x.toFixed(8)+' '+v.y.toFixed(8)).join(' ');}
function setPath(id,points,small=false){if(!orbits.has(id)){const el=node('path',{class:small?'orbit smallBodyOrbit':'orbit'});layers.orbit.append(el);orbits.set(id,el);}orbits.get(id).setAttribute('d',pathFor(points));}
function currentBody(){return state.bodies.find(p=>p.id===state.selected);}
function setPreset(id){if(state.scene!=='solar')setScene('solar');state.extent=presets[id];state.cx=state.cy=0;state.preset=id;queueRender();}
function nearestBody(point,maxDistance=100){let best=null,score=maxDistance*maxDistance;for(const body of state.bodies){const q=screen(body),d=(q.x-point.x)**2+(q.y-point.y)**2;if(d<score){best=body;score=d;}}return best;}
function transitionFor(requested,range,anchor){
  if(requested<range.min){
    if(state.scene==='solar'){const target=nearestBody(anchor,140)||currentBody();if(target&&C.parents.includes(target.id))return{scene:'moons',id:target.id};}
    if(state.scene==='stars'){const target=nearestBody(anchor,100);if(target&&C.starIndex.has(target.id))return{scene:'system',id:target.id};if(target&&target.catalog)return null;return{scene:'solar'};}
    if(state.scene==='cosmos')return{scene:'stars',extent:30000};
  }
  if(requested>range.max){if(state.scene==='solar')return{scene:'stars'};if(state.scene==='moons')return{scene:'solar',selected:state.parent};if(state.scene==='system')return{scene:'stars',selected:state.system};if(state.scene==='stars')return{scene:'cosmos',extent:250000};}
  return null;
}
function zoom(factor,anchor={x:state.width/2,y:state.height/2},keepGesture=false){
  if(!Number.isFinite(factor)||factor<=0||Math.abs(factor-1)<1e-10)return;
  if(!keepGesture){cameraToken++;lastTap=null;}
  const range=limits(),requested=state.extent/factor,destination=transitionFor(requested,range,anchor);
  if(destination){setScene(destination.scene,destination.id,{keepGesture});if(destination.extent)state.extent=destination.extent;if(destination.selected){select(destination.selected);const p=currentBody();if(p){state.cx=p.x;state.cy=p.y;}}custom();queueRender();return;}
  const before=world(anchor);state.extent=clamp(requested,range.min,range.max);const after=world(anchor);state.cx+=before.x-after.x;state.cy+=before.y-after.y;custom();queueRender();
}
function select(id){const p=state.bodies.find(p=>p.id===id);if(!p)return;state.selected=id;const v=screen(p);if(v.x<35||v.x>state.width-35||v.y<40||v.y>state.height-35){state.cx=p.x;state.cy=p.y;custom();}details();queueRender();}
function animateCamera(x,y,extent,complete){
  const token=++cameraToken,from={x:state.cx,y:state.cy,extent:state.extent},reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced){state.cx=x;state.cy=y;state.extent=extent;custom();queueRender();if(complete)complete();return;}
  let start=null;function frame(time){if(token!==cameraToken)return;if(start===null)start=time;const t=Math.min(1,(time-start)/280),ease=1-(1-t)**3;state.cx=from.x+(x-from.x)*ease;state.cy=from.y+(y-from.y)*ease;state.extent=Math.exp(Math.log(from.extent)+(Math.log(extent)-Math.log(from.extent))*ease);custom();queueRender();if(t<1)requestAnimationFrame(frame);else if(complete)complete();}requestAnimationFrame(frame);
}
function focusObject(id){
  const p=state.bodies.find(p=>p.id===id);if(!p)return;lastTap=null;select(id);
  if(state.scene==='solar'&&C.parents.includes(id)){animateCamera(p.x,p.y,.31,()=>setScene('moons',id));return;}
  if(state.scene==='stars'&&C.starIndex.has(id)){animateCamera(p.x,p.y,1.05,()=>setScene('system',id));return;}
  const extent=state.scene==='moons'&&id===state.parent?Math.max(limits().min,C.physicalRadius[id]*2.2):Math.max(limits().min,state.extent*.3);animateCamera(p.x,p.y,extent);
}
function focusHome(){lastTap=null;if(state.scene==='stars'||state.scene==='cosmos'){setScene('solar');return;}if(state.scene==='solar'){$('#weatherPanel').scrollIntoView({behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});$('#weatherRefresh').click();return;}animateCamera(0,0,limits().min*3);}
function stat(labelId,valueId,label,value){$('#'+labelId).textContent=label;$('#'+valueId).textContent=value;}
function km(value){return Math.round(value).toLocaleString('en-US')+' km';}
function period(days){return days<1?(days*24).toFixed(2)+' hours':days.toFixed(2)+' days';}
function activeCloud(){return state.scene==='moons'&&state.parent==='Earth'&&state.live&&$('#earthCloudToggle').checked?state.earthCloud:null;}
function details(){
  const p=currentBody();if(!p)return;const physical=facts[p.id],enhanced=$('#enhancedGraphics').checked,cloud=p.id==='Earth'&&activeCloud();
  $('#selectedName').textContent=p.id;$('#selectedKind').textContent=p.kind||'Planet';$('#planetDescription').textContent=p.description;
  const glyph=$('#planetGlyph');glyph.replaceChildren();glyph.style.background=`radial-gradient(circle at 30% 25%,#f3f6e5,${p.color} 25%,${p.color} 42%,#111a29 95%)`;glyph.setAttribute('data-planet',p.id);
  if((enhanced||cloud)&&physical&&physical.image){const img=document.createElement('img');img.src=cloud?cloud.url:physical.image;img.alt=cloud?'Earth cloud observations from '+cloud.credit:p.id+' spacecraft image';if(cloud){img.style.clipPath='circle('+(cloud.source==='epic'?'38.5':'48')+'% at 50% 50%)';img.style.transform='scale('+(cloud.source==='epic'?1.3:1.04)+')';}glyph.append(img);glyph.style.background='transparent';}
  const caption=$('#imageryCaption');caption.hidden=!((enhanced||cloud)&&physical);caption.textContent=cloud?'Observed clouds · '+cloud.credit+' · Captured '+cloud.time.replace('T',' ').replace('.000Z',' UTC')+'. '+cloud.description:physical?physical.imageCaption+' Animated glows are decorative.':'';
  const extras=$('#objectExtras');extras.replaceChildren();function extra(label,value){if(value===null||value===undefined||value==='')return;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;extras.append(dt,dd);}
  if(physical){extra('Mean radius',km(physical.meanRadiusKm));extra('One rotation',physical.rotationLabel);extra('Year length',period(physical.orbitalPeriodDays));extra('Mass',physical.massEarths.toLocaleString('en-US',{maximumFractionDigits:3})+' Earths');extra('A closer look',physical.appearance);extra('Worth knowing',physical.extraFact);}
  const action=$('#exploreSelected');action.hidden=true;$('.comparisonPanel').hidden=state.scene!=='solar';
  if(state.scene==='solar'){
    const earth=state.data.positions[2],jupiter=state.data.positions[4],c=S.separation(earth,jupiter);
    stat('distanceLabel','sunDistance','Sun distance',p.r.toFixed(3)+' AU');stat('distance2Label','earthDistance','Earth distance',p.id==='Earth'?'You are here':S.distance(p,earth).toFixed(3)+' AU');
    stat('angleLabel','longitude','Longitude around the Sun',p.longitude.toFixed(2)+'°');stat('heightLabel','latitude','Above the orbital plane',(p.latitude>=0?'+':'')+p.latitude.toFixed(3)+'°');
    $('#coordinateNote').textContent=p.approximate?'Approximate two-body orbit from a 2026 JPL element snapshot. Perturbations are omitted. Not a live tracking or close-approach prediction.':'Longitude uses the fixed J2000 ecliptic plane. A negative latitude means below that plane. Markers and planet images are enlarged.';
    $('#comparisonDistance').textContent=c.au.toFixed(3)+' AU';$('#comparisonKm').textContent=(c.km/1e6).toFixed(1)+' million kilometers';$('#comparisonLightTime').textContent=c.lightMinutes.toFixed(1)+' minutes';$('#comparisonAngle').textContent=c.angle.toFixed(2)+'°';
    if(C.parents.includes(p.id)){action.hidden=false;action.textContent='Explore '+p.id+' close-up ↗';}
  }else if(state.scene==='moons'){
    const center=p.id===state.parent,iss=p.id==='ISS';
    stat('distanceLabel','sunDistance',iss?'Altitude over Earth':'Distance from '+state.parent,iss?km(p.altitude):center?'At the center':km(p.r));
    stat('distance2Label','earthDistance',iss?'Orbital speed':'Orbit period',iss?km(p.velocity)+'/h':p.period?period(p.period):'Central planet');
    stat('angleLabel','longitude','Position model',iss?'Timestamped feed':sceneData.calculated?'Calculated':'Illustrated');stat('heightLabel','latitude','Object type',center?'Planet':iss?'Artificial satellite':'Natural satellite');
    $('#coordinateNote').textContent=iss?'The ISS is shown at its sample time, not extrapolated. A 2D projection can overlap Earth even when the station is above its surface.':sceneData.calculated?'Geometric positions projected onto the J2000 ecliptic plane. Distances are from the planet’s center. Only selected major moons are shown.':'Orbit sizes use JPL mean distances. Circular orbits and marker angles are illustrative, viewed face-on. They are not current moon positions.';
  }else if(state.scene==='stars'||state.scene==='cosmos'){
    const system=Array.isArray(p.planets);stat('distanceLabel','sunDistance',p.approximateDistance?'Approximate Sun distance':'Catalog Sun distance',p.distance.toLocaleString('en-US',{maximumFractionDigits:2})+' light-years');
    stat('distance2Label','earthDistance',system?'Planets mapped here':'Catalog designation',system?String(p.planets.length):p.catalog||p.id);stat('angleLabel','longitude','Chart projection','J2000 ecliptic');stat('heightLabel','latitude','Positions','Catalog snapshot');
    $('#coordinateNote').textContent='Catalog directions and distances are flattened onto a 2D plane. Apparent map separations can be much smaller than true 3D separations. This is a selection of measured objects, not a complete survey. Light from distant objects shows their past.';
    if(system){action.hidden=false;action.textContent='Open this planetary system ↗';extra('Stellar temperature',p.temperature?p.temperature.toLocaleString('en-US')+' K':null);extra('Star radius',p.starRadius?p.starRadius+' Suns':null);}
    extra('Right ascension',p.ra.toFixed(4)+'°');extra('Declination',p.dec.toFixed(4)+'°');
  }else{
    stat('distanceLabel','sunDistance','Orbit size (semi-major axis)',p.a.toFixed(4)+' AU');stat('distance2Label','earthDistance','Orbit period',period(p.period));stat('angleLabel','longitude','Marker placement','Illustrative');stat('heightLabel','latitude','Object type','Exoplanet');$('#coordinateNote').textContent='Orbit sizes and periods are from the NASA Exoplanet Archive. The face-on circles, viewing direction, colors and marker angles are illustrative. They are not positions at the selected date.';
    extra('Planet radius',p.earthRadii?p.earthRadii+' Earths':null);extra('Mass estimate',p.earthMasses?p.earthMasses+' Earths':null);extra('Discovery method',p.method);extra('Discovery year',p.discoveryYear);extra('Equilibrium temperature',p.equilibriumTemperature?p.equilibriumTemperature+' K (model estimate, not a surface reading)':null);
  }
  for(const [id,b]of choices)b.setAttribute('aria-pressed',String(state.scene==='solar'&&id===p.id));for(const [id,b]of contextChoices)b.setAttribute('aria-pressed',String(id===p.id));
}
function updateViewerClock(){const el=$('#viewerClock');if(el)el.textContent='Your clock · '+new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'medium'}).format(new Date());}
function updateEpoch(){
  const illustrated=state.scene==='stars'||state.scene==='cosmos'||state.scene==='system'||state.scene==='moons'&&!sceneData.calculated;
  $('#timePanel').hidden=illustrated;
  $('#epochText').dateTime=state.date.toISOString();
  $('#epochText').textContent=illustrated?(state.scene==='stars'||state.scene==='cosmos'?'Catalog atlas · distances in light-years':'Orbital sizes · placements illustrated'):new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'medium',timeZone:'UTC'}).format(state.date)+' UTC';
  $('#modeBadge').textContent=illustrated?'ATLAS':state.live?'NOW':'EXPLORING';$('#nowButton').setAttribute('aria-pressed',String(state.live));
  $('.epochLabel').textContent=illustrated?'Explore the catalog':'Positions calculated for';
  $('.epochNote').textContent=illustrated?'Catalog snapshot: 25 October 2026':state.live?'Calculated locally · follows your clock each second':'Selected date and time · UTC';
}
function rebuildContext(){
  let list=state.scene==='solar'?state.bodies.filter(p=>p.approximate):state.bodies;
  if(state.scene==='stars')list=[currentBody(),...state.bodies.filter(p=>C.data.stars.some(q=>q.id===p.id)||p.catalog),...state.bodies.filter(p=>p.distance<25)].filter((p,i,a)=>p&&a.indexOf(p)===i).slice(0,16);
  if([...contextChoices.keys()].join('|')===list.map(p=>p.id).join('|'))return;
  const nav=$('#contextChoices');nav.replaceChildren();contextChoices.clear();
  for(const p of list){const b=document.createElement('button');b.type='button';b.textContent=p.id;b.setAttribute('aria-pressed',String(p.id===state.selected));if(p.approximate)b.className='smallBodyChoice';b.addEventListener('click',()=>select(p.id));nav.append(b);contextChoices.set(p.id,b);}
}
function rebuildScene({tracks=true}={}){
  if(!state.data)return;
  if(state.scene==='solar'){
    state.bodies=[...state.data.positions];if(tracks)for(const p of state.data.positions)setPath(p.id,S.orbit(p.id,state.date,180));
    if($('#asteroidToggle').checked)for(const a of C.data.asteroids){const p=C.asteroidPosition(a,state.date);if(p){state.bodies.push(p);if(tracks)setPath(p.id,C.asteroidOrbit(a),true);}}
    $('#mapTitle').textContent='Our planetary neighborhood';$('#mapCompass').textContent='⊙ View from ecliptic north';
    $('#sceneNote').textContent='Calculated planetary positions. The four selected small bodies use approximate JPL-based orbits near their 2026 element epoch. Keep pinching outward to travel into the star catalog and beyond. Double-tap any planet for a close-up.';
    if($('#asteroidToggle').checked&&!state.bodies.some(p=>p.approximate))$('#sceneNote').textContent+=' Small-body estimates are hidden at this date because it is outside their two-year model window.';
  }else if(state.scene==='moons'){
    sceneData=C.moonSnapshot(state.parent,state.date);const parent=state.data.positions.find(p=>p.id===state.parent);
    state.bodies=[{...parent,x:0,y:0,z:0,r:0},...sceneData.moons];if(tracks)for(const m of sceneData.moons)setPath(m.id,C.moonOrbit(m,state.date));
    if(state.parent==='Earth'&&state.live&&state.iss&&(Date.now()-state.iss.sampleTime.getTime())<180000)state.bodies.push(state.iss);
    $('#mapTitle').textContent=state.parent+(sceneData.moons.length?' and its moons':' close-up');$('#mapCompass').textContent=sceneData.calculated?'⊙ View from ecliptic north':'⊙ Illustrated, face-on orbit atlas';
    $('#sceneNote').textContent=!sceneData.moons.length?state.parent+' has no known natural moons. This close-up uses spacecraft imagery when enhanced graphics are enabled; lighting is illustrative.':sceneData.calculated?'Calculated positions for '+(state.parent==='Earth'?'Earth’s Moon':'Jupiter’s four Galilean moons')+' at the displayed time. Orbit distances are in kilometers; markers are enlarged.':'An illustrated selection of '+state.parent+'’s moons. Orbital distances are to scale, but the circular paths and marker angles are not current positions. Tap a moon to learn more.';
  }else if(state.scene==='stars'){
    state.bodies=[...C.starCatalog,...C.deepObjects.filter(p=>p.distance<100000)].map(C.starPosition);$('#mapTitle').textContent='Beyond our Sun';$('#mapCompass').textContent='⊙ Star positions projected onto the ecliptic';$('#sceneNote').textContent='The scale has changed to light-years. Thousands of published planetary systems, plus selected nebulae and clusters. Pinch into a star or double-tap it to open its planets. Search for a catalog name to travel directly. This is a measured-data selection, not every star in the sky.';
  }else if(state.scene==='cosmos'){
    state.bodies=C.deepObjects.map(C.starPosition);$('#mapTitle').textContent='Galaxies and the cosmic distance scale';$('#mapCompass').textContent='⊙ Catalog directions projected onto the ecliptic';$('#sceneNote').textContent='Approximate catalog distances and selected objects, not live tracking or a complete galaxy survey. Zoom farther out to compare the Local Group, clusters and the observable horizon. The outer scale rings illustrate distance scales, not measured spherical walls.';
  }else{
    sceneData=C.systemPlanets(state.system);state.bodies=sceneData;if(tracks)for(const p of state.bodies)setPath(p.id,C.circle(p.a));$('#mapTitle').textContent=state.system+' planetary system';$('#mapCompass').textContent='⊙ Illustrated, face-on system';$('#sceneNote').textContent='An illustrated orbital-size comparison around '+state.system+'. Sizes of the orbits come from the NASA Exoplanet Archive. Planet angles, colors and viewing direction are illustrative, not current positions. Tap a planet for its orbit and period.';
  }
  if(!currentBody())state.selected=state.scene==='solar'?'Jupiter':state.scene==='moons'?state.parent:state.bodies[0].id;
  $('#viewChoices').hidden=state.scene!=='solar';$('#asteroidControl').hidden=state.scene!=='solar';$('#issPanel').hidden=!(state.scene==='moons'&&state.parent==='Earth');$('#earthCloudPanel').hidden=!(state.scene==='moons'&&state.parent==='Earth');
  $('#solarView').setAttribute('aria-pressed',String(state.scene==='solar'));$('#starsView').setAttribute('aria-pressed',String(state.scene==='stars'||state.scene==='cosmos'||state.scene==='system'));$('#moonView').setAttribute('aria-pressed',String(state.scene==='moons'));
  $('#mapScaleNote').textContent=state.scene==='stars'||state.scene==='cosmos'?'Projected catalog distances. Markers enlarged.':state.scene==='system'||state.scene==='moons'&&!sceneData.calculated?'Orbit sizes to scale. Placements illustrated.':'Distances to scale. Markers enlarged.';
  rebuildContext();updateEpoch();details();queueRender();
}
function setScene(scene,id,options={}){
  cloudRequest++;cloudPending=false;state.scene=scene;state.cx=state.cy=0;state.preset='custom';cameraToken++;lastTap=null;if(!options.keepGesture){for(const pointer of points.keys())try{svg.releasePointerCapture(pointer);}catch{}points.clear();drag=null;}else if(drag)drag.moved=true;$('#mapTip').hidden=true;
  if(scene==='moons'){state.parent=id||$('#moonParent').value;$('#moonParent').value=state.parent;sceneData=C.moonSnapshot(state.parent,state.date);state.extent=sceneData.extent;state.selected=state.parent;}
  else if(scene==='stars'){state.extent=47;state.selected=state.system;}
  else if(scene==='cosmos'){state.extent=4000000;state.selected='Andromeda Galaxy';}
  else if(scene==='system'){state.system=id||state.system;sceneData=C.systemPlanets(state.system);state.extent=Math.max(...sceneData.map(p=>p.a))*1.3;state.selected=sceneData[0].id;}
  else{state.scene='solar';state.extent=6.3;state.preset='jupiter';state.selected='Jupiter';}
  rebuildScene();if(scene==='moons'&&state.parent==='Earth'){refreshISS();refreshEarthClouds();}
}
function setDate(value,live,options={}){
  try{
    const data=S.snapshot(value);state.data=data;state.date=data.date;state.live=live;status.textContent='';
    if(!live||document.activeElement!==$('#dateInput'))$('#dateInput').value=S.formatUTCInput(data.date);
    $('#prevDate').disabled=data.date.getTime()-30*S.DAY_MS<S.MIN_TIME;$('#nextDate').disabled=data.date.getTime()+30*S.DAY_MS>S.MAX_TIME;
    const rows=$('#positionRows');rows.replaceChildren();for(const p of data.positions){const row=document.createElement('tr'),head=document.createElement('th');head.scope='row';head.textContent=p.id;row.append(head);for(const value of [p.r.toFixed(3),p.earthDistance.toFixed(3),p.longitude.toFixed(2)+'°']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}rows.append(row);}
    const tracks=options.tracks!==false;rebuildScene({tracks});if(tracks)lastOrbitMinute=Math.floor(data.date.getTime()/60000);if(options.refreshFeeds!==false&&state.scene==='moons'&&state.parent==='Earth'){refreshISS();refreshEarthClouds();}
  }catch(error){announceError(error);}
}
function labelLayout(visible){
  const boxes=[],byPriority=[...visible].sort((a,b)=>(a.id===state.selected?-2:a.id==='Earth'?-1:0)-(b.id===state.selected?-2:b.id==='Earth'?-1:0));
  for(const p of byPriority){
    const item=labels.get(p.id),v=screen(p),w=p.id.length*7+4,r=state.scene==='moons'&&p.id===state.parent?clamp(C.physicalRadius[p.id]*unit(),10,200):p.radius,offset=Math.max(17,r+12),candidates=[[offset,-15],[offset,22],[-w-offset,-15],[-w-offset,22],[offset,-35],[-w-offset,42],[offset+12,47],[-w-offset-12,-48]];
    let chosen=null;for(const [dx,dy]of candidates){const x=v.x+dx,y=v.y+dy,b={x,y:y-12,w,h:17};if(x<8||x+w>state.width-8||y<48||y>state.height-12)continue;if(boxes.some(a=>b.x<a.x+a.w+7&&b.x+b.w>a.x-7&&b.y<a.y+a.h+4&&b.y+b.h>a.y-4))continue;if(visible.some(a=>{const q=screen(a);return q.x>b.x-10&&q.x<b.x+b.w+10&&q.y>b.y-10&&q.y<b.y+b.h+10;}))continue;chosen={x,y,b};break;}
    item.text.style.display=chosen?'':'none';item.line.style.display=chosen?'':'none';if(chosen){boxes.push(chosen.b);set(item.text,{x:chosen.x,y:chosen.y,fill:p.id===state.selected?'#fff1c8':p.id==='Earth'?'#8de5f8':'#b5c2d4'});const edge=chosen.x>v.x?chosen.x-4:chosen.x+w+4;set(item.line,{x1:v.x,y1:v.y,x2:edge,y2:chosen.y-5,stroke:p.color,opacity:.24});}
  }
}
function regionGuide(){
  const layer=$('#regionLayer');layer.replaceChildren();if(state.scene!=='stars'&&state.scene!=='cosmos')return;
  const regions=state.scene==='stars'?[[1.58,'Oort Cloud outer scale · inferred','#7cb7b0'],[50000,'Milky Way width ≈ 100,000 ly · size comparison','#8ca3ce']]:[[2500000,'Local Group · several million light-years across','#86b3ac'],[250000000,'Laniakea width ≈ 500 million ly · schematic scale','#a79cbd'],[46000000000,'Observable horizon ≈ 46 billion ly radius · scale guide','#d3bc83']];
  const center=screen({x:0,y:0});for(const [radius,label,color]of regions){const r=radius*unit();if(r<35||r>Math.max(state.width,state.height)*2)continue;layer.append(node('circle',{cx:center.x,cy:center.y,r,fill:'none',stroke:color,'stroke-width':1,'stroke-dasharray':'3 7',opacity:.4}));layer.append(node('text',{x:clamp(center.x-r+8,12,state.width-230),y:clamp(center.y-r+18,56,state.height-52),class:'regionLabel',fill:color},label));}
}
function ensureBody(p){
  if(markers.has(p.id))return markers.get(p.id);
  const gradientId='body-'+markers.size,gradient=node('radialGradient',{id:gradientId,cx:'30%',cy:'25%',r:'75%'});for(const [offset,color]of [['0%','#f8f4dc'],['24%',p.color],['53%',p.color],['100%','#0a111e']])gradient.append(node('stop',{offset,'stop-color':color}));defs.append(gradient);
  const marker=node('g',{'data-planet':p.id,role:'button',tabindex:'0','aria-pressed':'false'});marker.append(node('title',{},p.id+': '+p.description),node('circle',{r:22,class:'planetHit'}),node('circle',{r:p.radius+7,class:'planetHalo',fill:'none',stroke:p.color,'stroke-width':1,opacity:.65}));
  if(p.id==='Saturn')marker.append(node('ellipse',{rx:19,ry:5,fill:'none',stroke:'#c7b894','stroke-width':3,opacity:.7,class:'saturnRing',transform:'rotate(-25)'}));
  marker.append(node('circle',{r:p.radius,fill:`url(#${gradientId})`,class:'planetBody'}));
  if(facts[p.id]&&facts[p.id].image){marker.append(node('circle',{r:p.radius*1.1,stroke:p.color,class:'planetAtmosphere'}),node('image',{class:'planetPhoto',preserveAspectRatio:'xMidYMid meet'}),node('ellipse',{rx:p.radius,ry:p.radius*.32,fill:'#fff',class:'cloudGlint',transform:'rotate(-24)'}));}
  if(p.id==='ISS')marker.append(node('path',{d:'M-12 -5h6v10h-6zM6 -5h6v10H6z',class:'issMarker'}));layers.body.append(marker);markers.set(p.id,marker);
  const line=node('line',{'pointer-events':'none'}),text=node('text',{class:'planetLabel'},p.id);layers.label.append(line,text);labels.set(p.id,{line,text});
  marker.addEventListener('pointerenter',()=>{if(points.size)return;const body=state.bodies.find(b=>b.id===p.id);if(!body)return;const tip=$('#mapTip');tip.replaceChildren();const name=document.createElement('strong');name.textContent=p.id;tip.append(name,document.createTextNode(body.description));tip.hidden=false;});marker.addEventListener('pointerleave',()=>{$('#mapTip').hidden=true;});
  marker.addEventListener('focus',()=>{if(state.bodies.some(b=>b.id===p.id))select(p.id);});return marker;
}
function render(){
  if(!state.data)return;const u=unit(),{width:w,height:h}=state,active=new Set(state.bodies.map(p=>p.id)),dense=state.scene==='stars',enhanced=$('#enhancedGraphics').checked;
  layers.orbit.setAttribute('transform',`translate(${w/2},${h/2}) scale(${u},${-u}) translate(${-state.cx},${-state.cy})`);
  for(const [id,m]of markers){m.style.display='none';labels.get(id).text.style.display='none';labels.get(id).line.style.display='none';}
  for(const [id,p]of orbits){p.style.display=active.has(id)&&!(state.scene==='moons'&&id===state.parent)&&state.scene!=='stars'&&state.scene!=='cosmos'?'':'none';p.style.stroke=id===state.selected?'#cbb986':'#60748e';p.style.opacity=id===state.selected?'.5':'.22';}
  const sun=screen({x:0,y:0});sunMarker.style.display=state.scene==='moons'?'none':'';sunText.style.display=state.scene==='moons'?'none':'';sunMarker.setAttribute('transform',`translate(${sun.x},${sun.y})`);sunText.setAttribute('x',sun.x+18);sunText.setAttribute('y',sun.y+5);sunText.textContent=state.scene==='system'?state.system:state.scene==='stars'||state.scene==='cosmos'?'SUN / HOME':'SUN';
  const visible=[],outside=[],candidates=[],dots=[],cells=new Set();
  for(const p of state.bodies){const v=screen(p);if(v.x>-25&&v.x<w+25&&v.y>-25&&v.y<h+25)candidates.push(p);else outside.push(p.id);}
  if(dense)candidates.sort((a,b)=>(a.id===state.selected?-4:a.catalog?-3:C.data.stars.some(q=>q.id===a.id)?-2:0)-(b.id===state.selected?-4:b.catalog?-3:C.data.stars.some(q=>q.id===b.id)?-2:0));
  let count=0;for(const p of candidates){const v=screen(p),cell=Math.floor(v.x/64)+','+Math.floor(v.y/48),priority=p.id===state.selected||p.catalog||C.data.stars.some(q=>q.id===p.id);
    if(dense){dots.push('M'+v.x.toFixed(2)+' '+v.y.toFixed(2)+'h.05');if((count>=55||cells.has(cell))&&!priority)continue;cells.add(cell);count++;}
    const m=ensureBody(p);set(m,{transform:`translate(${v.x},${v.y})`,'aria-pressed':String(p.id===state.selected),'aria-label':p.id+'. '+p.description+' Select for details.'});m.style.display='';m.querySelector('.planetHalo').style.display=p.id===state.selected?'':'none';
    const r=state.scene==='moons'&&p.id===state.parent?clamp(C.physicalRadius[p.id]*u,10,200):enhanced&&facts[p.id]?Math.max(12,p.radius):p.radius;set(m.querySelector('.planetBody'),{r});set(m.querySelector('.planetHit'),{r:Math.max(22,r)});set(m.querySelector('.planetHalo'),{r:r+7});
    const photo=m.querySelector('.planetPhoto');if(photo){const cloud=p.id==='Earth'&&activeCloud(),usePhoto=enhanced||cloud,image=cloud?cloud.url:facts[p.id].image;const span=p.id==='Saturn'?r*3.2:r*2*(cloud?(cloud.source==='epic'?1.3:1.04):1);set(photo,{x:-span/2,y:-span/2,width:span,height:span});photo.style.display=usePhoto?'':'none';photo.setAttribute('clip-path',cloud?'url(#'+(cloud.source==='epic'?'epic-cloud-disc':'goes-cloud-disc')+')':'none');if(usePhoto&&photo.getAttribute('href')!==image)photo.setAttribute('href',image);m.querySelector('.planetBody').style.display=usePhoto?'none':'';set(m.querySelector('.planetAtmosphere'),{r:r*1.08});m.querySelector('.planetAtmosphere').style.display=p.id==='Mercury'?'none':'';set(m.querySelector('.cloudGlint'),{rx:r*.8,ry:r*.08,cy:-r*.25});m.querySelector('.cloudGlint').style.display=cloud||['Mercury','Mars'].includes(p.id)?'none':'';const ring=m.querySelector('.saturnRing');if(ring)ring.style.display=enhanced?'none':'';}
    if(v.x>8&&v.x<w-8&&v.y>8&&v.y<h-8)visible.push(p);
  }
  $('#catalogDots').setAttribute('d',dots.join(''));regionGuide();labelLayout(visible);
  const target=95/u,mag=10**Math.floor(Math.log10(target)),n=target/mag,length=(n>=5?5:n>=2?2:1)*mag,x=22,y=h-23;
  set(scaleLine,{d:`M${x} ${y-4}V${y}H${x+length*u}V${y-4}`});set(scaleText,{x,y:y-10});scaleText.textContent=(length<1?Number(length.toPrecision(2)):length.toLocaleString('en-US'))+(state.scene==='stars'||state.scene==='cosmos'?' light-years':state.scene==='moons'?' km':' AU');
  for(const id of Object.keys(presets))$('#'+id+'View').setAttribute('aria-pressed',String(state.scene==='solar'&&state.preset===id));
  const summary=state.scene==='solar'?(names[state.preset]||'Custom solar view')+(outside.length?' · Outside view: '+outside.join(', '):' · All eight planets in view'):state.scene==='moons'?state.parent+' neighborhood · '+(sceneData.calculated?'Calculated positions':'Illustrated atlas'):state.scene==='stars'?C.starCatalog.length.toLocaleString('en-US')+' planetary systems · Light-year scale':state.scene==='cosmos'?'Selected galaxies · Cosmic scale guide':state.system+' · Illustrated orbits';
  if($('#viewStatus').textContent!==summary)$('#viewStatus').textContent=summary;
  const range=limits();$('#zoomIn').disabled=state.extent<=range.min*1.000001&&state.scene!=='solar'&&state.scene!=='stars'&&state.scene!=='cosmos';$('#zoomOut').disabled=state.scene==='cosmos'&&state.extent>=range.max*.999999;
}
const defs=svg.querySelector('defs');for(const [id,r]of [['goes-cloud-disc',.48],['epic-cloud-disc',.385]]){const clip=node('clipPath',{id,clipPathUnits:'objectBoundingBox'});clip.append(node('circle',{cx:.5,cy:.5,r}));defs.append(clip);}
for(const p of S.PLANETS){const button=document.createElement('button');button.type='button';button.setAttribute('aria-pressed','false');const dot=document.createElement('span');dot.className='planetDot';dot.style.setProperty('--planet-color',p.color);dot.setAttribute('aria-hidden','true');button.append(dot,document.createTextNode(p.id));button.addEventListener('click',()=>{if(state.scene!=='solar')setScene('solar');select(p.id);});$('#planetChoices').append(button);choices.set(p.id,button);}
const sunMarker=node('g',{'data-home':'true',role:'button',tabindex:'0','aria-label':'Sun. Return to the solar system.'});sunMarker.append(node('circle',{class:'sunCorona',r:22,fill:'#e7af4c',opacity:.22,filter:'url(#sunGlow)'}),node('circle',{r:11,fill:'url(#sunGradient)'}));layers.body.prepend(sunMarker);sunMarker.addEventListener('click',()=>{if(state.scene==='stars'||state.scene==='cosmos')setScene('solar');});sunMarker.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();setScene('solar');}});
const sunText=node('text',{class:'sunLabel'},'SUN');layers.label.prepend(sunText);
const scaleLine=node('path',{stroke:'#7c8fa6','stroke-width':1,fill:'none'}),scaleText=node('text',{class:'scaleLabel'});layers.scale.append(scaleLine,scaleText);
$('#dateForm').addEventListener('submit',event=>{event.preventDefault();try{setDate(S.parseUTCInput($('#dateInput').value),false);}catch(error){announceError(error);}});$('#nowButton').addEventListener('click',()=>setDate(new Date(),true));
for(const [id,days]of [['prevDate',-30],['nextDate',30]])$('#'+id).addEventListener('click',()=>setDate(new Date(state.date.getTime()+days*S.DAY_MS),false));
for(const id of Object.keys(presets))$('#'+id+'View').addEventListener('click',()=>setPreset(id));
$('#solarView').addEventListener('click',()=>setScene('solar'));$('#moonView').addEventListener('click',()=>setScene('moons',$('#moonParent').value));$('#starsView').addEventListener('click',()=>setScene('stars'));$('#satelliteView').addEventListener('click',()=>{setScene('moons','Earth');state.extent=13000;queueRender();});
$('#exploreSelected').addEventListener('click',()=>{if(state.scene==='solar'&&C.parents.includes(state.selected))setScene('moons',state.selected);else if(state.scene==='stars'&&C.starIndex.has(state.selected))setScene('system',state.selected);});
$('#asteroidToggle').addEventListener('change',rebuildScene);$('#zoomIn').addEventListener('click',()=>zoom(1.4));$('#zoomOut').addEventListener('click',()=>zoom(1/1.4));$('#resetView').addEventListener('click',()=>{if(state.scene==='solar')setPreset('jupiter');else setScene(state.scene,state.scene==='moons'?state.parent:state.system);});
const catalogInfo=C.deepData;$('#catalogCount').textContent=catalogInfo?catalogInfo.mappedPlanets.toLocaleString('en-US')+' mapped planets · '+C.starCatalog.length.toLocaleString('en-US')+' systems · '+C.deepObjects.length+' deep-sky landmarks':'Selected systems and deep-sky landmarks';
function travel(result){const asteroid=result.scene==='solar'&&C.data.asteroids.find(p=>p.id===result.id);if(asteroid){if(!C.asteroidPosition(asteroid,state.date)){$('#searchResults').textContent=result.id+' has an approximate orbit only within two years of its 2026 element epoch. Return to now or choose a date near 2026 to map it.';return;}$('#asteroidToggle').checked=true;}if(result.scene==='system'){setScene('system',result.parent);select(result.id);}else if(result.scene==='moons'){setScene('moons',result.parent);select(result.id);}else if(result.scene==='solar'){setScene('solar');select(result.id);const p=currentBody();state.cx=p.x;state.cy=p.y;state.extent=Math.max(.7,Math.min(8,p.r*.6));custom();queueRender();}else{setScene(result.scene);select(result.id);const p=currentBody();state.cx=p.x;state.cy=p.y;state.extent=result.scene==='cosmos'?Math.max(100000,p.distance*.16):Math.max(1,Math.min(200,p.distance*.15));custom();queueRender();}$('#searchResults').replaceChildren();$('#catalogSearch').value=result.id;}
function searchCatalog(){const results=$('#searchResults');results.replaceChildren();const q=$('#catalogSearch').value;if(q.trim().length<2)return;const matches=C.catalogSearch(q,10);if(!matches.length){results.textContent='No mapped match. Try a host star or a catalog name such as TRAPPIST-1, Kepler-90, Orion or M31.';return;}for(const result of matches){const b=document.createElement('button');b.type='button';b.textContent=result.label+' · '+result.kind;b.addEventListener('click',()=>travel(result));results.append(b);}}
$('#catalogSearch').addEventListener('input',searchCatalog);$('#catalogSearch').addEventListener('keydown',e=>{if(e.key==='Escape')$('#searchResults').replaceChildren();if(e.key==='Enter'){const first=C.catalogSearch($('#catalogSearch').value,1)[0];if(first){e.preventDefault();travel(first);}}});
function goToScale(){const value=$('#scaleSelect').value;if(value==='solar'){setScene('solar');setPreset('all');return;}const extents={oort:2.2,nearby:47,milkyway:30000,galaxies:4000000,clusters:400000000,universe:49000000000};setScene(['oort','nearby','milkyway'].includes(value)?'stars':'cosmos');state.extent=extents[value];state.cx=state.cy=0;custom();queueRender();}
$('#scaleGo').addEventListener('click',goToScale);$('#weatherView').addEventListener('click',()=>{$('#weatherPanel').scrollIntoView({behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});$('#weatherRefresh').click();});
function graphics(){document.querySelector('.solarPage').classList.toggle('highGraphics',$('#enhancedGraphics').checked);try{localStorage.setItem('solar-enhanced-graphics',String($('#enhancedGraphics').checked));}catch{}details();queueRender();}
try{$('#enhancedGraphics').checked=localStorage.getItem('solar-enhanced-graphics')==='true';}catch{}$('#enhancedGraphics').addEventListener('change',graphics);
// A normal wheel scrolls the page, including when the pointer is over the map.
svg.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();zoom(Math.exp(-clamp(event.deltaY,-100,100)*.003),local(event));},{passive:false});
function targetAt(event,p){const element=event.target.closest('[data-planet]'),home=event.target.closest('[data-home]');if(element)return{id:element.getAttribute('data-planet'),home:false};if(home)return{id:null,home:true};const body=nearestBody(p,event.pointerType==='touch'?24:12);return{id:body&&body.id,home:false};}
svg.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;cameraToken++;const p=local(event);points.set(event.pointerId,p);$('#mapTip').hidden=true;if(points.size===1)drag={start:p,moved:false,...targetAt(event,p),pointerType:event.pointerType,scene:state.scene};else{lastTap=null;if(drag)drag.moved=true;}svg.setPointerCapture(event.pointerId);event.preventDefault();});
svg.addEventListener('pointermove',event=>{
  if(!points.has(event.pointerId))return;const before=[...points.values()],old=points.get(event.pointerId),p=local(event);points.set(event.pointerId,p);if(drag&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>7){drag.moved=true;lastTap=null;}
  if(points.size===1){state.cx-=(p.x-old.x)/unit();state.cy+=(p.y-old.y)/unit();}
  else{const after=[...points.values()],mid={x:(before[0].x+before[1].x)/2,y:(before[0].y+before[1].y)/2},next={x:(after[0].x+after[1].x)/2,y:(after[0].y+after[1].y)/2},distance=Math.hypot(before[0].x-before[1].x,before[0].y-before[1].y),nextDistance=Math.hypot(after[0].x-after[1].x,after[0].y-after[1].y),scene=state.scene;
    if(distance>8&&nextDistance>8)zoom(nextDistance/distance,mid,true);
    if(scene===state.scene){state.cx-=(next.x-mid.x)/unit();state.cy+=(next.y-mid.y)/unit();}
  }
  custom();queueRender();event.preventDefault();
});
function release(event){
  if(!points.delete(event.pointerId))return;const canceled=event.type!=='pointerup';if(canceled){lastTap=null;if(drag)drag.moved=true;}
  const tap=!canceled&&!points.size&&drag&&!drag.moved,saved=drag;if(!points.size)drag=null;try{svg.releasePointerCapture(event.pointerId);}catch{}
  if(tap){const p=local(event),now=Date.now(),key=saved.scene+'|'+(saved.id||'')+'|'+saved.home,double=saved.pointerType!=='mouse'&&lastTap&&lastTap.key===key&&now-lastTap.time<=350&&Math.hypot(p.x-lastTap.p.x,p.y-lastTap.p.y)<=24;
    if(double){lastTap=null;if(saved.id)focusObject(saved.id);else if(saved.home)focusHome();else zoom(2,p);}
    else{if(saved.id)select(saved.id);else if(saved.home&&(state.scene==='stars'||state.scene==='cosmos'))setScene('solar');lastTap=saved.pointerType==='mouse'?null:{key,time:now,p};}
  }
  event.preventDefault();
}
for(const type of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(type,release);
svg.addEventListener('dblclick',event=>{if(event.button!==undefined&&event.button!==0)return;const hit=targetAt(event,local(event));event.preventDefault();if(hit.id)focusObject(hit.id);else if(hit.home)focusHome();else zoom(2,local(event));});
svg.addEventListener('keydown',event=>{
  const id=event.target.closest('[data-planet]')?.getAttribute('data-planet');if(id&&['Enter',' '].includes(event.key)){event.preventDefault();select(id);return;}
  lastTap=null;cameraToken++;const step=state.extent*.16;if(event.key==='ArrowRight')state.cx+=step;else if(event.key==='ArrowLeft')state.cx-=step;else if(event.key==='ArrowUp')state.cy+=step;else if(event.key==='ArrowDown')state.cy-=step;else if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.4);return;}else if(event.key==='-'){event.preventDefault();zoom(1/1.4);return;}else if(event.key==='Home'){event.preventDefault();if(state.scene==='solar')setPreset('jupiter');else setScene(state.scene,state.scene==='moons'?state.parent:state.system);return;}else return;event.preventDefault();custom();queueRender();
});
function cloudTime(sample){return sample.time.replace('T',' ').replace('.000Z',' UTC');}
function cloudStatus(sample,error){const age=Date.now()-sample.capturedAt,old=age>(sample.source==='goes'?2*3600000:72*3600000);$('#earthCloudStatus').textContent=(error?'Refresh unavailable. Keeping the last image. ':old?'The latest available image is older than expected. ':'')+sample.credit+' · Captured '+cloudTime(sample)+'. '+sample.description;}
async function imageReady(url){if(typeof Image==='undefined')return;await new Promise((resolve,reject)=>{const image=new Image(),timer=setTimeout(()=>reject(new Error('The satellite picture timed out.')),10000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(new Error('The satellite picture could not load.'));};image.referrerPolicy='no-referrer';image.src=url;});}
async function refreshEarthClouds(force=false){
  if(!cloudClient||state.scene!=='moons'||state.parent!=='Earth'||document.hidden)return;
  if(!state.live){$('#earthCloudStatus').textContent='Satellite clouds are paused for your selected orbital date. Return to now to see the latest published image.';return;}
  if(!$('#earthCloudToggle').checked){$('#earthCloudStatus').textContent='Satellite clouds are off. The globe uses its historical spacecraft image when enhanced graphics are enabled.';return;}
  if(cloudPending)return;cloudPending=true;const token=++cloudRequest,source=$('#earthCloudSource').value;$('#earthCloudRefresh').disabled=true;$('#earthCloudStatus').textContent='Checking '+(source==='epic'?'NASA EPIC':'NOAA GOES-19')+' for the latest published cloud image...';
  try{const sample=await cloudClient.refresh(source,{force});if(!state.earthCloud||state.earthCloud.url!==sample.url)await imageReady(sample.url);if(token!==cloudRequest||!state.live)return;state.earthCloud=sample;cloudStatus(sample);details();queueRender();}
  catch(error){if(token!==cloudRequest)return;if(state.earthCloud&&state.earthCloud.source===source)cloudStatus(state.earthCloud,true);else{$('#earthCloudStatus').textContent='The satellite image is unavailable right now. Showing the historical globe image. Try Refresh Earth image later.';state.earthCloud=null;}details();queueRender();}
  finally{if(token===cloudRequest){cloudPending=false;$('#earthCloudRefresh').disabled=false;}}
}
$('#earthCloudRefresh').addEventListener('click',()=>refreshEarthClouds(true));$('#earthCloudToggle').addEventListener('change',()=>{cloudRequest++;cloudPending=false;details();queueRender();refreshEarthClouds();});$('#earthCloudSource').addEventListener('change',()=>{cloudRequest++;cloudPending=false;state.earthCloud=null;details();queueRender();refreshEarthClouds();});
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
setDate(new Date(),true);graphics();resize();updateViewerClock();updateTide(window.Astronomy.MoonPhase(state.date));setInterval(()=>{if(!document.hidden){if(state.live){const now=new Date();setDate(now,true,{tracks:Math.floor(now.getTime()/60000)!==lastOrbitMinute,refreshFeeds:false});}updateViewerClock();}},1000);setInterval(refreshISS,15000);setInterval(()=>refreshEarthClouds(),600000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.live){setDate(new Date(),true);refreshISS();refreshEarthClouds();}});
})();

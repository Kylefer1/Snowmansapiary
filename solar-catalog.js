/* Educational layers. Catalog placements and orbital estimates are explicitly
   separated from the calculated planetary and lunar ephemerides. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./vendor/astronomy-2.1.19.min.js'),require('./solar-catalog-data.js'));
  else root.SolarCatalog=factory(root.Astronomy,root.SolarCatalogData);
})(typeof globalThis!=='undefined'?globalThis:this,function(A,D){
'use strict';
const AU=149597870.7,DAY=86400000,RAD=Math.PI/180,rotation=A.Rotation_EQJ_ECL();
const physicalRadius={Earth:6378.137,Mars:3389.5,Jupiter:69911,Saturn:58232,Uranus:25362,Neptune:24622};
const parents=Object.keys(physicalRadius);
function dateOf(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new RangeError('Choose a valid date.');return d;}
function rotate(v,multiplier=1){const r=A.RotateVector(rotation,v);return{x:r.x*multiplier,y:r.y*multiplier,z:r.z*multiplier};}
function lunarVector(id,value){const date=dateOf(value);if(id==='Moon')return rotate(A.GeoMoon(date),AU);const key=id.toLowerCase();if(!['io','europa','ganymede','callisto'].includes(key))throw new RangeError('This moon has an illustrative orbit only.');return rotate(A.JupiterMoons(date)[key],AU);}
function moonSnapshot(parent,value){
  if(!parents.includes(parent))throw new RangeError('Choose a planet with a moon view.');
  const date=dateOf(value),calculated=parent==='Earth'||parent==='Jupiter',moons=D.moons.filter(m=>m.parent===parent).map((m,i)=>{
    // Illustrative atlas angles stay fixed; changing the date must not suggest
    // that a mean-orbit diagram is a calculated present-day ephemeris.
    const angle=(i*.91+.36),v=calculated?lunarVector(m.id,date):{x:m.a*Math.cos(angle),y:m.a*Math.sin(angle),z:0};
    return{...m,...v,r:Math.hypot(v.x,v.y,v.z),calculated};
  });
  return{parent,calculated,moons,extent:Math.max(...moons.map(m=>m.a))*1.22,physicalRadius:physicalRadius[parent]};
}
function moonOrbit(m,value,samples=120){
  const date=dateOf(value),points=[];
  for(let i=0;i<=samples;i++){if(m.parent==='Earth'||m.parent==='Jupiter')points.push(lunarVector(m.id,new Date(date.getTime()+m.period*DAY*i/samples)));else{const angle=i/samples*2*Math.PI;points.push({x:m.a*Math.cos(angle),y:m.a*Math.sin(angle),z:0});}}
  return points;
}
function eccentricAnomaly(mean,e){let E=mean;for(let i=0;i<20;i++){const step=(E-e*Math.sin(E)-mean)/(1-e*Math.cos(E));E-=step;if(Math.abs(step)<1e-13)break;}return E;}
function asteroidPosition(asteroid,value,meanOverride){
  const date=dateOf(value),el=asteroid.elements,days=A.MakeTime(date).tt+2451545-asteroid.epoch;
  // Only a short interval around this osculating-element epoch is offered.
  // Planetary perturbations and later orbital solutions are not modeled.
  if(meanOverride===undefined&&Math.abs(days)>730)return null;
  const mean=meanOverride===undefined?((el.ma+el.n*days)%360+360)%360*RAD:meanOverride,E=eccentricAnomaly(mean,el.e),x=el.a*(Math.cos(E)-el.e),y=el.a*Math.sqrt(1-el.e*el.e)*Math.sin(E),w=el.w*RAD,n=el.om*RAD,inc=el.i*RAD;
  const px=Math.cos(w)*x-Math.sin(w)*y,py=Math.sin(w)*x+Math.cos(w)*y;
  const v={x:Math.cos(n)*px-Math.sin(n)*Math.cos(inc)*py,y:Math.sin(n)*px+Math.cos(n)*Math.cos(inc)*py,z:Math.sin(inc)*py};
  return{...asteroid,...v,r:Math.hypot(v.x,v.y,v.z),longitude:(Math.atan2(v.y,v.x)/RAD+360)%360,latitude:Math.atan2(v.z,Math.hypot(v.x,v.y))/RAD,approximate:true};
}
function asteroidOrbit(asteroid){return Array.from({length:181},(_,i)=>asteroidPosition(asteroid,new Date(0),i/180*2*Math.PI));}
function starPosition(star){const ra=star.ra*RAD,dec=star.dec*RAD,dist=star.distance;return{...star,...rotate(new A.Vector(dist*Math.cos(dec)*Math.cos(ra),dist*Math.cos(dec)*Math.sin(ra),dist*Math.sin(dec),A.MakeTime(new Date('2000-01-01T12:00:00Z'))))};}
function systemPlanets(id){const star=D.stars.find(s=>s.id===id);if(!star)throw new RangeError('Choose a cataloged system.');return star.planets.map((p,i)=>{const angle=.5+i*1.1;return{...p,x:p.a*Math.cos(angle),y:p.a*Math.sin(angle),z:0,r:p.a};});}
function circle(r,samples=120){return Array.from({length:samples+1},(_,i)=>({x:r*Math.cos(i/samples*2*Math.PI),y:r*Math.sin(i/samples*2*Math.PI),z:0}));}
function issSample(raw,now=new Date()){
  if(!raw||raw.id!==25544||raw.units!=='kilometers'||!Number.isFinite(raw.timestamp)||!Number.isFinite(raw.latitude)||!Number.isFinite(raw.longitude)||!Number.isFinite(raw.altitude)||!Number.isFinite(raw.velocity)||Math.abs(raw.latitude)>90||Math.abs(raw.longitude)>180||raw.altitude<100||raw.altitude>2000||raw.velocity<=0)throw new Error('The satellite service returned incomplete data.');
  const sampleTime=new Date(raw.timestamp*1000),age=(dateOf(now)-sampleTime)/1000;if(age>180||age< -30)throw new Error('The satellite sample is out of date. Try refreshing the ISS feed.');
  const v=rotate(A.ObserverVector(sampleTime,new A.Observer(raw.latitude,raw.longitude,raw.altitude*1000),false),AU);
  return{...v,id:'ISS',kind:'Artificial satellite',color:'#b3efc9',radius:6,parent:'Earth',r:Math.hypot(v.x,v.y,v.z),altitude:raw.altitude,velocity:raw.velocity,sampleTime,description:'The International Space Station is a crewed laboratory in low Earth orbit. This marker uses a timestamped position from Where the ISS at? and updates about every 15 seconds while you explore Earth.'};
}
function tideShape(phase){const angle=Number(phase)*RAD;if(!Number.isFinite(angle))throw new RangeError('Choose a lunar phase.');const points=[];for(let i=0;i<=180;i++){const t=i/180*2*Math.PI,r=68*(1+.115*Math.cos(2*(t-angle))+.052*Math.cos(2*t));points.push({x:r*Math.cos(t),y:r*Math.sin(t)});}return points;}
return{data:D,parents,physicalRadius,lunarVector,moonSnapshot,moonOrbit,asteroidPosition,asteroidOrbit,starPosition,systemPlanets,circle,issSample,tideShape};
});

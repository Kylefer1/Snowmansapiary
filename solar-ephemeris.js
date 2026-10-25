/* Sun-centered geometric positions in the fixed J2000 ecliptic frame.
   Astronomy Engine 2.1.19, VSOP87-based; see vendor/astronomy-LICENSE.txt. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./vendor/astronomy-2.1.19.min.js'));
  else root.SolarEphemeris=factory(root.Astronomy);
})(typeof globalThis!=='undefined'?globalThis:this,function(A){
'use strict';
if(!A)throw new Error('The astronomy library could not load.');
const AU_KM=149597870.7,DAY_MS=86400000,MIN_TIME=Date.UTC(1800,0,1),MAX_TIME=Date.UTC(2051,0,1)-1;
const PLANETS=[
  {id:'Mercury',color:'#b8aba0',radius:5,kind:'Rocky planet',description:'The innermost planet moves quickly around the Sun. Zoom into the inner system to follow its small orbit.'},
  {id:'Venus',color:'#e4c68e',radius:7,kind:'Rocky planet',description:'Our neighboring planet travels on an orbit inside Earth’s. Its bright cloud cover hides the surface below.'},
  {id:'Earth',color:'#63cbe8',radius:8,kind:'Our home',description:'You are here. The blue marker shows Earth’s calculated position around the Sun at the displayed time.'},
  {id:'Mars',color:'#df886c',radius:6,kind:'Rocky planet',description:'The red planet lies just outside Earth’s orbit. Its changing position helps show why distances between planets keep changing.'},
  {id:'Jupiter',color:'#d8b195',radius:13,kind:'Gas giant',description:'The largest planet travels far beyond the rocky inner worlds. Explore its neighborhood to follow Io, Europa, Ganymede and Callisto.'},
  {id:'Saturn',color:'#d4c497',radius:11,kind:'Gas giant',description:'A distant gas giant known for its rings. Switch to all eight planets to see its place in the outer solar system.'},
  {id:'Uranus',color:'#9edcd8',radius:9,kind:'Ice giant',description:'This ice giant follows a long path around the Sun, well beyond Saturn. Its movement is slow on a human calendar.'},
  {id:'Neptune',color:'#749fee',radius:9,kind:'Ice giant',description:'The outermost of the eight planets. A complete trip around the Sun takes far longer than a human lifetime.'}
].map(p=>Object.freeze(p));
const rotation=A.Rotation_EQJ_ECL();
function validDate(value){const date=new Date(value);if(!Number.isFinite(date.getTime())||date.getTime()<MIN_TIME||date.getTime()>MAX_TIME)throw new RangeError('Choose a date from 1800 through 2050.');return date;}
function body(id){if(!PLANETS.some(p=>p.id===id))throw new RangeError('Choose one of the eight planets.');return id;}
function vector(id,date){const v=A.RotateVector(rotation,A.HelioVector(body(id),date));return {x:v.x,y:v.y,z:v.z};}
function position(id,value){const date=validDate(value),v=vector(id,date),r=Math.hypot(v.x,v.y,v.z);return {...v,id,r,longitude:(Math.atan2(v.y,v.x)*180/Math.PI+360)%360,latitude:Math.atan2(v.z,Math.hypot(v.x,v.y))*180/Math.PI};}
function snapshot(value){const date=validDate(value),positions=PLANETS.map(p=>({...p,...position(p.id,date)})),earth=positions.find(p=>p.id==='Earth');for(const p of positions)p.earthDistance=distance(p,earth);return {date,positions};}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);}
function separation(a,b){const au=distance(a,b),n=Math.hypot(a.x,a.y,a.z)*Math.hypot(b.x,b.y,b.z),dot=a.x*b.x+a.y*b.y+a.z*b.z;return {au,km:au*AU_KM,lightMinutes:au/A.C_AUDAY*1440,angle:Math.acos(Math.max(-1,Math.min(1,dot/n)))*180/Math.PI};}
function orbit(id,value,samples=180){const date=validDate(value),period=A.PlanetOrbitalPeriod(body(id))*DAY_MS,count=Math.max(24,Math.min(720,Math.floor(Number(samples)||180))),points=[];for(let i=0;i<=count;i++)points.push(vector(id,new Date(date.getTime()-period+period*i/count)));return points;}
function parseUTCInput(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new RangeError('Enter a complete date and time in UTC.');const date=validDate(value+'Z');if(date.toISOString().slice(0,16)!==value)throw new RangeError('Enter a valid calendar date.');return date;}
function formatUTCInput(value){return validDate(value).toISOString().slice(0,16);}
return {PLANETS,AU_KM,DAY_MS,MIN_TIME,MAX_TIME,position,snapshot,separation,distance,orbit,parseUTCInput,formatUTCInput};
});

/* Observed GOES imagery. The browser plays published frames; no generated clouds. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./solar-earth-clouds.js'):root.SolarEarthClouds);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.SolarEarthReplay=api;if(root.document){const start=()=>api.mount(root.document,root);if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();}}
})(typeof globalThis!=='undefined'?globalThis:this,function(Clouds){
'use strict';
const DAY=86400000,ENDPOINT='https://www.star.nesdis.noaa.gov/GOES/fulldisk_band.php?sat=G19&band=GEOCOLOR&length=240&dim=0';
function parseFrames(html,now=Date.now()){
  return Clouds.goesFrames(html,now).filter(f=>f.capturedAt>=now-DAY).slice(-145).map(f=>({...f,replay:true}));
}
function chooseFrames(frames,detailed=false){
  if(detailed||frames.length<3)return frames.slice();
  return frames.filter((f,i)=>i===0||i===frames.length-1||i%2===0);
}
function createClient(options={}){
  const fetcher=options.fetch||((...args)=>fetch(...args)),now=options.now||Date.now;
  const later=options.setTimeout||setTimeout,cancel=options.clearTimeout||clearTimeout;
  let frames=[],checked=null,pending=null;
  function refresh(force=false){
    if(pending)return pending;
    if(!force&&checked!==null&&now()>=checked&&now()-checked<600000&&frames.length)return Promise.resolve(frames.filter(f=>f.capturedAt>=now()-DAY));
    pending=(async()=>{
      const controller=new AbortController();let timer;
      const timeout=new Promise((_,reject)=>{timer=later(()=>{controller.abort();reject(new Error('NOAA replay request timed out.'));},options.timeoutMs||10000);});
      try{
        const result=await Promise.race([(async()=>{const response=await fetcher(ENDPOINT,{signal:controller.signal,cache:'no-cache',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error('NOAA replay is temporarily unavailable.');return parseFrames(await response.text(),now());})(),timeout]);
        if(result.length<2)throw new Error('NOAA has not provided enough images from the past 24 hours.');
        // A stale upstream page must not roll an already received series backward.
        if(!frames.length||result[result.length-1].capturedAt>=frames[frames.length-1].capturedAt)frames=result;
        checked=now();return frames.filter(f=>f.capturedAt>=now()-DAY);
      }finally{cancel(timer);}
    })().finally(()=>{pending=null;});return pending;
  }
  return{refresh,getLast:()=>frames.slice()};
}
function createImageCache(options={}){
  const ImageType=options.Image||Image,later=options.setTimeout||setTimeout,cancel=options.clearTimeout||clearTimeout;
  const max=options.maxEntries||8,concurrency=options.concurrency||3,entries=new Map(),queue=[];let running=0;
  function pump(){
    while(running<concurrency&&queue.length){
      const e=queue.shift();if(!entries.has(e.url))continue;e.started=true;running++;const image=new ImageType();e.image=image;
      let settled=false,timer;
      function finish(error){if(settled)return;settled=true;cancel(timer);image.onload=image.onerror=null;running--;e.done=true;if(error){entries.delete(e.url);e.reject(error);}else e.resolve(image);pump();}
      timer=later(()=>{finish(new Error('A satellite frame timed out.'));image.src='';},options.timeoutMs||10000);
      image.onload=()=>finish();image.onerror=()=>finish(new Error('A satellite frame could not load.'));image.referrerPolicy='no-referrer';image.src=e.url;
    }
  }
  function load(url,priority=true){
    if(entries.has(url)){const e=entries.get(url);entries.delete(url);entries.set(url,e);return e.promise;}
    const e={url,started:false,done:false};e.promise=new Promise((resolve,reject)=>{e.resolve=resolve;e.reject=reject;});entries.set(url,e);
    if(priority)queue.unshift(e);else queue.push(e);
    while(entries.size>max){const old=[...entries.values()].find(x=>x!==e&&(x.done||!x.started));if(!old)break;entries.delete(old.url);if(!old.started){const i=queue.indexOf(old);if(i>=0)queue.splice(i,1);old.reject(new Error('An unused frame was dropped from the loading queue.'));}}
    pump();return e.promise;
  }
  return{load,size:()=>entries.size,running:()=>running};
}
function createPlayer(options={}){
  const load=options.load,later=options.setTimeout||setTimeout,cancel=options.clearTimeout||clearTimeout;
  const listeners=new Set();let frames=[],index=-1,cursor=-1,frame=null,playing=false,active=true,loading=false,error='',speed=1,timer=null,serial=0,failures=0;
  const snapshot=()=>({frames,index,frame,playing,active,loading,error,speed});
  function emit(){for(const f of listeners)f(snapshot());}
  function stopTimer(){if(timer!==null){cancel(timer);timer=null;}}
  function schedule(){stopTimer();if(playing&&active&&!loading&&frames.length>1)timer=later(()=>{timer=null;seek((cursor+1)%frames.length);},500/speed);}
  async function seek(value){
    if(!frames.length)return false;stopTimer();const ticket=++serial,target=Math.max(0,Math.min(frames.length-1,Math.round(value)));cursor=target;loading=true;error='';emit();
    try{await load(frames[target].url,true);if(ticket!==serial)return false;index=target;frame=frames[target];loading=false;failures=0;emit();
      if(playing&&active){for(let n=1;n<=2;n++)load(frames[(target+n)%frames.length].url,false).catch(()=>{});}schedule();return true;
    }catch(e){if(ticket!==serial)return false;loading=false;error=e.message||'A frame is unavailable.';if(++failures>=3)playing=false;emit();schedule();return false;}
  }
  async function setFrames(next){
    const previous=frame,wasLatest=index===frames.length-1;stopTimer();++serial;loading=false;frames=next.slice();
    if(!frames.length){index=cursor=-1;frame=null;playing=false;error='No images are available in this time range.';emit();return;}
    let target=frames.length-1;
    if(previous&&(!wasLatest||playing)){target=frames.findIndex(f=>f.capturedAt>=previous.capturedAt);if(target<0)target=frames.length-1;}
    return seek(target);
  }
  function pause(){playing=false;stopTimer();++serial;loading=false;emit();}
  function play(){if(frames.length<2)return;playing=true;error='';if(index<0||index===frames.length-1)seek(0);else{emit();schedule();}}
  function setActive(value){if(active===Boolean(value))return;active=Boolean(value);if(!active){stopTimer();++serial;loading=false;cursor=index;}else schedule();emit();}
  return{snapshot,subscribe(fn){listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);},setFrames,seek,play,pause,setActive,setSpeed(value){if(![.5,1,2].includes(Number(value)))return;speed=Number(value);schedule();emit();},dispose(){pause();listeners.clear();}};
}
function formatTime(frame){return frame?frame.time.replace('T',' ').replace(':00.000Z',' UTC'):'';}
function mount(doc,env){
  const panel=doc.querySelector('#earthReplay');if(!panel||!Clouds)return null;if(panel.__earthReplay)return panel.__earthReplay;
  const $=id=>doc.querySelector('#'+id),client=createClient({fetch:env.fetch.bind(env)}),cache=createImageCache({Image:env.Image});
  const player=createPlayer({load:cache.load}),subscribers=new Set();let full=[],detailed=false,enabled=false,mapEligible=false,footerVisible=false,mapVisible=false,mapControlsVisible=false,activated=false,lastLoaded=0,busy=false,warning='',seekTimer=null,desiredSeek=null,lastNotice=null;
  const surfaces=[{play:$('replayPlay'),range:$('replayTimeline'),time:$('replayTime'),previous:$('replayPrevious'),next:$('replayNext'),latest:$('replayLatest'),speed:$('replaySpeed')},{play:$('mapReplayPlay'),range:$('mapReplayTimeline'),time:$('mapReplayTime'),previous:$('mapReplayPrevious'),next:$('mapReplayNext'),latest:$('mapReplayLatest'),speed:$('mapReplaySpeed')}];
  function notify(){const frame=enabled&&mapEligible?player.snapshot().frame:null,key=frame?frame.url:'latest';if(key===lastNotice)return;lastNotice=key;for(const fn of subscribers)fn(frame);}
  function visible(){return !doc.hidden&&(footerVisible||mapEligible&&(mapVisible||mapControlsVisible));}
  function availability(s){if(!s.frames.length)return 'Real cloud observations from CIRA/NOAA. The sequence loads when this viewer comes into view.';const first=s.frames[0],last=s.frames[s.frames.length-1],span=(last.capturedAt-first.capturedAt)/3600000;return s.frames.length+' frames spanning '+span.toFixed(1)+' hours. '+formatTime(first)+' to '+formatTime(last)+'.';}
  function paint(s){
    if(desiredSeek!==null&&!s.loading&&(s.index===desiredSeek||s.error))desiredSeek=null;
    for(const c of surfaces){c.play.textContent=s.playing?'Pause replay':s.frames.length?'Play replay':'Play last 24 hours';c.play.disabled=busy;c.play.setAttribute('aria-pressed',String(s.playing));c.range.disabled=!s.frames.length||busy;c.range.min=0;c.range.max=Math.max(0,s.frames.length-1);c.range.value=desiredSeek===null?Math.max(0,s.index):desiredSeek;c.range.setAttribute('aria-valuetext',formatTime(s.frame));c.time.textContent=s.frame?formatTime(s.frame):'Waiting for satellite images';if(s.frame)c.time.dateTime=s.frame.time;c.previous.disabled=c.next.disabled=c.latest.disabled=!s.frames.length||busy;c.speed.value=String(s.speed);}
    $('replayImage').alt=s.frame?'Earth cloud observations, captured '+formatTime(s.frame):'Earth from space';if(s.frame&&$('replayImage').getAttribute('src')!==s.frame.url)$('replayImage').setAttribute('src',s.frame.url);
    $('replayRange').textContent=availability(s);$('replayMode').textContent=enabled?'24-HOUR REPLAY':s.frame?'LATEST AVAILABLE FRAME':'READY TO LOAD';$('replayCredit').textContent=s.frame?'CIRA/NOAA · GOES-19':'NASA VIIRS · preview';$('mapReplayMode').textContent=enabled?'24-hour satellite replay':'Replay observed clouds';
    const stale=s.frames.length&&Date.now()-s.frames[s.frames.length-1].capturedAt>7200000;
    $('replayStatus').textContent=busy?'Checking NOAA for the past 24 hours...':s.error?(s.playing?'Skipping an unavailable frame. ':'')+s.error:warning||(stale?'NOAA’s newest available frame is older than expected. Capture times are shown.':s.loading?'Loading satellite frame...':s.playing?'Playing observed satellite frames.':'Play, step through frames, or drag the timeline.');
    panel.setAttribute('aria-busy',String(busy||s.loading));notify();
  }
  async function ensureLoaded(force=false){
    if(busy)return false;if(activated&&!force&&full.length&&Date.now()-lastLoaded<600000)return true;activated=true;busy=true;warning='';paint(player.snapshot());
    try{full=await client.refresh(force);if(!full.length)throw new Error('No recent replay frames are available.');await player.setFrames(chooseFrames(full,detailed));lastLoaded=Date.now();return true;}
    catch(e){warning=e.message+' '+(full.length?'Keeping the previously received sequence.':'Use Refresh replay to try again.');return false;}
    finally{busy=false;paint(player.snapshot());}
  }
  function syncVisibility(){player.setActive(visible());if(visible())ensureLoaded();}
  function cancelSeek(){if(seekTimer!==null)env.clearTimeout(seekTimer);seekTimer=null;desiredSeek=null;}
  async function start(){cancelSeek();if(busy)return;if(player.snapshot().playing){player.pause();return;}enabled=true;notify();if(await ensureLoaded())player.play();}
  function scrub(value){desiredSeek=Number(value);player.pause();enabled=true;notify();if(seekTimer!==null)env.clearTimeout(seekTimer);seekTimer=env.setTimeout(()=>{seekTimer=null;player.seek(Number(value));},120);}
  function seekTo(value,latest=false){const target=Math.max(0,Math.min(player.snapshot().frames.length-1,Number(value)));cancelSeek();desiredSeek=target;player.pause();enabled=!latest;notify();player.seek(target);}
  for(const c of surfaces){c.play.addEventListener('click',start);c.range.addEventListener('input',()=>scrub(c.range.value));c.range.addEventListener('change',()=>seekTo(c.range.value));c.previous.addEventListener('click',()=>seekTo((desiredSeek===null?player.snapshot().index:desiredSeek)-1));c.next.addEventListener('click',()=>seekTo((desiredSeek===null?player.snapshot().index:desiredSeek)+1));c.latest.addEventListener('click',()=>seekTo(player.snapshot().frames.length-1,true));c.speed.addEventListener('change',()=>player.setSpeed(c.speed.value));}
  $('replayRefresh').addEventListener('click',()=>{cancelSeek();ensureLoaded(true);});$('replayDetail').addEventListener('change',()=>{cancelSeek();detailed=$('replayDetail').checked;if(full.length)player.setFrames(chooseFrames(full,detailed));});
  player.subscribe(paint);doc.addEventListener('visibilitychange',syncVisibility);
  let observer;if(typeof env.IntersectionObserver==='function'){observer=new env.IntersectionObserver(entries=>{for(const e of entries){if(e.target===panel)footerVisible=e.isIntersecting;else if(e.target===$('mapViewport'))mapVisible=e.isIntersecting;else mapControlsVisible=e.isIntersecting;}syncVisibility();},{rootMargin:'0px'});observer.observe(panel);observer.observe($('mapViewport'));observer.observe($('earthMapReplay'));}
  else{footerVisible=true;syncVisibility();}
  env.setInterval(()=>{if(activated&&visible()&&!busy)ensureLoaded(true);},600000);
  const api={subscribe(fn){subscribers.add(fn);fn(enabled&&mapEligible?player.snapshot().frame:null);return()=>subscribers.delete(fn);},setMapContext(value){value=Boolean(value);if(value===mapEligible)return;mapEligible=value;$('earthMapReplay').hidden=!value;syncVisibility();notify();},player};panel.__earthReplay=api;return api;
}
return{ENDPOINT,parseFrames,chooseFrames,createClient,createImageCache,createPlayer,formatTime,mount};
});

/* Full-page fullscreen keeps controls and dialogs in the same fullscreen tree. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ApiaryScreen=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function mount({doc=document,win=window,beforeChange=()=>{}}={}){
 const button=doc.getElementById('fullscreenButton'),hint=doc.getElementById('screenHint');
 let active=false,pending=false,nativeSeen=false,orientationOwned=false,savedY=0;
 const native=()=>!!(doc.fullscreenElement||doc.webkitFullscreenElement);
 const mobile=()=>win.matchMedia('(pointer: coarse)').matches||win.navigator.maxTouchPoints>0;
 function unlock(){if(orientationOwned){try{win.screen.orientation.unlock();}catch{}orientationOwned=false;}}
 function setActive(value){
  if(value===active)return;
  beforeChange();if(value)savedY=win.scrollY;
  active=value;doc.body.classList.toggle('immersive',value);
  button.textContent=value?'Exit fullscreen':'Fullscreen';button.setAttribute('aria-pressed',String(value));
  hint.textContent=value?'Turn your phone sideways for landscape. All controls are beside or below the battlefield.':'';
  if(!value){unlock();win.scrollTo(0,savedY);}
 }
 async function landscape(){
  if(!active||!native()||!mobile()||!win.screen.orientation?.lock)return;
  try{await win.screen.orientation.lock('landscape');if(active&&native())orientationOwned=true;else win.screen.orientation.unlock();}catch{/* Manual rotation remains available. */}
 }
 function changed(){if(native()){nativeSeen=true;setActive(true);}else if(nativeSeen){nativeSeen=false;setActive(false);}}
 async function toggle(){
  if(pending)return;pending=true;button.disabled=true;
  try{
   if(active){
    if(native()){const exit=doc.exitFullscreen||doc.webkitExitFullscreen;try{await exit.call(doc);}catch{return;}if(native())return;nativeSeen=false;}
    setActive(false);
   }else{
    setActive(true);
    const request=doc.documentElement.requestFullscreen||doc.documentElement.webkitRequestFullscreen;
    if(request){try{await request.call(doc.documentElement);}catch{/* Expanded view is the fallback. */}}
    if(native()){nativeSeen=true;await landscape();}
   }
  }finally{pending=false;button.disabled=false;}
 }
 button.addEventListener('click',toggle);
 doc.addEventListener('fullscreenchange',changed);doc.addEventListener('webkitfullscreenchange',changed);
 doc.addEventListener('keydown',e=>{if(e.key==='Escape'&&active&&!native()&&!doc.querySelector('dialog[open]')){e.preventDefault();setActive(false);}});
 return {toggle,get active(){return active;}};
}
return {mount};
});

/* Touch, mouse and accessibility input share one gesture and one release. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ApiaryInput=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function bind({canvas,doc=document,win=window,begin,move,release,cancel,now=()=>performance.now()}){
 let gesture=null,ignoreClickUntil=-1,ignoreMouseUntil=-1;
 function reset(){if(gesture)ignoreClickUntil=now()+700;gesture=null;}
 function start(e,id,kind='pointer'){
  if(gesture)return false;
  if(id!=='click')ignoreClickUntil=now()+700;
  if(!begin(e))return false;
  gesture={id,kind,started:now(),nativeTouch:false,touchId:null};e.preventDefault?.();return true;
 }
 function finish(e,id){
  if(!gesture||gesture.id!==id)return;
  const duration=now()-gesture.started;gesture=null;if(id!=='click')ignoreClickUntil=now()+700;e.preventDefault?.();release(e,duration);
 }
 function abort(){if(!gesture)return;reset();cancel();}
 if(win.PointerEvent){
  canvas.addEventListener('pointerdown',e=>{
   if(e.isPrimary===false||(e.pointerType!=='touch'&&e.button!==0))return;
   if(e.pointerType==='touch'&&gesture?.nativeTouch)return;
   if(e.pointerType==='mouse'&&(gesture?.nativeTouch||now()<ignoreMouseUntil))return;
   if(gesture)abort();
   if(start(e,e.pointerId,e.pointerType==='touch'?'touch':'pointer')){try{canvas.setPointerCapture(e.pointerId);}catch{/* Document release still works. */}}
  });
  canvas.addEventListener('pointermove',e=>{if(!gesture&&e.pointerType!=='touch')move(e);});
  doc.addEventListener('pointermove',e=>{if(gesture?.id===e.pointerId&&!gesture.nativeTouch){e.preventDefault();move(e);}},{passive:false});
  // Capture loss is not a cancellation. Mobile browsers can release capture
  // before the finger lifts; finish at the document even outside the canvas.
  doc.addEventListener('pointerup',e=>{if(!gesture?.nativeTouch)finish(e,e.pointerId);},true);
  doc.addEventListener('pointercancel',e=>{if(gesture?.id===e.pointerId&&!gesture.nativeTouch)abort();},true);
 }else{
  canvas.addEventListener('mousedown',e=>{if(e.button===0&&now()>=ignoreMouseUntil){if(gesture)abort();start(e,'mouse');}});
  canvas.addEventListener('mousemove',e=>{if(!gesture)move(e);});
  doc.addEventListener('mousemove',e=>{if(gesture?.id==='mouse')move(e);});
  doc.addEventListener('mouseup',e=>{if(e.button===0)finish(e,'mouse');},true);
 }
 // Listen for native finger events even when PointerEvent exists. Some mobile
 // browsers expose the API but deliver only touch events for the actual hold.
 canvas.addEventListener('touchstart',e=>{
  if(e.touches.length!==1)return;ignoreMouseUntil=now()+1000;e.preventDefault();const t=e.changedTouches[0];
  if(gesture?.kind==='touch'&&!gesture.nativeTouch){gesture.nativeTouch=true;gesture.touchId=t.identifier;return;}
  if(gesture)abort();
  if(start(t,t.identifier,'touch')){gesture.nativeTouch=true;gesture.touchId=t.identifier;}
 },{passive:false});
 doc.addEventListener('touchmove',e=>{const t=[...e.changedTouches].find(t=>gesture?.nativeTouch&&gesture.touchId===t.identifier);if(t){e.preventDefault();move(t);}},{passive:false});
 doc.addEventListener('touchend',e=>{const t=[...e.changedTouches].find(t=>gesture?.nativeTouch&&gesture.touchId===t.identifier);if(t){ignoreMouseUntil=now()+1000;e.preventDefault();finish(t,gesture.id);}},{passive:false,capture:true});
 doc.addEventListener('touchcancel',e=>{if(gesture?.nativeTouch&&(!e.changedTouches?.length||[...e.changedTouches].some(t=>t.identifier===gesture.touchId)))abort();},true);
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('dragstart',e=>e.preventDefault());
 canvas.addEventListener('click',e=>{
  if(gesture||now()<ignoreClickUntil||e.button>0)return;
  // Some browsers and accessibility tools deliver a click without pointer events.
  if(start(e,'click'))finish(e,'click');
 });
 return {reset};
}
return {bind};
});

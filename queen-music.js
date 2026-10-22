(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MeadowMusic=factory();
})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function Controller(media,button,doc,storage,mixer){
    this.media=media;this.button=button;this.doc=doc;this.storage=storage;this.mixer=mixer;
    this.enabled=true;this.unlocked=false;this.away=false;this.pending=null;this.routed=false;this.volume=.65;
    try{this.enabled=storage?.getItem('meadow-music')!=='off';const saved=storage?.getItem('meadow-music-volume');if(saved!==null&&saved!==undefined&&Number.isFinite(Number(saved)))this.volume=Math.max(0,Math.min(1,Number(saved)));}catch(_){}
    media.loop=true;media.volume=this.volume;media.playbackRate=1;this.render();
  }
  Controller.prototype.render=function(){this.button.textContent='Music: '+(this.enabled?'On':'Off');this.button.setAttribute('aria-pressed',String(this.enabled));};
  Controller.prototype.allowed=function(){return this.enabled&&this.unlocked&&!this.doc.hidden&&!this.away;};
  Controller.prototype.setVolume=function(value){
    this.volume=Math.max(0,Math.min(1,Number(value)||0));
    if(this.routed)this.mixer.setMusicVolume(this.volume);else this.media.volume=this.volume;
    try{this.storage?.setItem('meadow-music-volume',String(this.volume));}catch(_){}
  };
  Controller.prototype.sync=function(){
    const allowed=this.allowed();
    if(!allowed){this.media.pause();this.mixer?.setMusicEnabled?.(false);return Promise.resolve(false);}
    // Route before play and resume directly inside the gesture, without waiting for
    // another promise. Media volume stays at unity; the mixer controls music gain.
    let ready=Promise.resolve(true);
    if(this.mixer){
      if(!this.routed){this.routed=!!this.mixer.attachMusic(this.media);if(this.routed)this.media.volume=1;}
      if(this.routed){this.mixer.setMusicVolume(this.volume);this.mixer.setMusicEnabled(true);ready=Promise.resolve(this.mixer.unlock()).catch(()=>false);}
    }
    if(this.pending)return this.pending;
    if(!this.media.paused)return ready;
    let result;try{result=this.media.play();}catch(_){return Promise.resolve(false);}
    const pending=Promise.all([Promise.resolve(result),ready]).then(([,ok])=>{if(!this.allowed()){this.media.pause();this.mixer?.setMusicEnabled?.(false);return false;}return ok!==false;},()=>false).finally(()=>{if(this.pending===pending)this.pending=null;});
    this.pending=pending;return pending;
  };
  Controller.prototype.gesture=function(){this.unlocked=true;return this.sync();};
  Controller.prototype.toggle=function(){this.enabled=!this.enabled;this.unlocked=true;try{this.storage?.setItem('meadow-music',this.enabled?'on':'off');}catch(_){}this.render();return this.sync();};
  function mount(doc,mixer){
    const media=doc.getElementById('backgroundMusic'),button=doc.getElementById('musicToggle');if(!media||!button)return null;
    let storage;try{storage=window.localStorage;}catch(_){}
    const controller=new Controller(media,button,doc,storage,mixer),slider=doc.getElementById('musicVolume'),label=doc.getElementById('musicVolumeValue');
    if(slider){slider.value=String(Math.round(controller.volume*100));label.textContent=slider.value+'%';slider.addEventListener('input',()=>{controller.setVolume(Number(slider.value)/100);label.textContent=slider.value+'%';});}
    button.addEventListener('click',()=>controller.toggle());
    const gesture=event=>{if(event.isTrusted&&!event.target.closest?.('#musicToggle'))controller.gesture();};
    doc.addEventListener('pointerdown',gesture,{capture:true,passive:true});
    doc.addEventListener('click',gesture,{capture:true});
    doc.addEventListener('keydown',event=>{if(!event.repeat&&['Enter',' '].includes(event.key))gesture(event);},{capture:true});
    doc.addEventListener('visibilitychange',()=>controller.sync());
    window.addEventListener('pagehide',()=>{controller.away=true;controller.sync();});
    window.addEventListener('pageshow',()=>{controller.away=false;controller.sync();});
    return controller;
  }
  return {Controller,mount};
});

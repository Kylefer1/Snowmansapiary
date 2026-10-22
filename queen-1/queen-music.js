(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else {root.MeadowMusic=factory();root.MeadowMusic.mount(document);}
})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function Controller(media,button,doc,storage){
    this.media=media;this.button=button;this.doc=doc;this.storage=storage;
    this.enabled=true;this.unlocked=false;this.away=false;this.pending=null;
    try{this.enabled=storage?.getItem('meadow-music')!=='off';}catch(_){}
    media.loop=true;media.volume=.15;media.playbackRate=1;
    this.render();
  }
  Controller.prototype.render=function(){
    this.button.textContent='Music: '+(this.enabled?'On':'Off');
    this.button.setAttribute('aria-pressed',String(this.enabled));
  };
  Controller.prototype.allowed=function(){return this.enabled&&this.unlocked&&!this.doc.hidden&&!this.away;};
  Controller.prototype.sync=function(){
    if(!this.allowed()){this.media.pause();return Promise.resolve(false);}
    if(this.pending)return this.pending;
    if(!this.media.paused)return Promise.resolve(true);
    var self=this,result;
    try{result=this.media.play();}catch(_){return Promise.resolve(false);}
    var pending=Promise.resolve(result).then(function(){
      if(!self.allowed()){self.media.pause();return false;}return true;
    },function(){return false;}).finally(function(){
      if(self.pending===pending)self.pending=null;
    });
    this.pending=pending;return pending;
  };
  Controller.prototype.gesture=function(){this.unlocked=true;return this.sync();};
  Controller.prototype.toggle=function(){
    this.enabled=!this.enabled;this.unlocked=true;
    try{this.storage?.setItem('meadow-music',this.enabled?'on':'off');}catch(_){}
    this.render();return this.sync();
  };
  function mount(doc){
    var media=doc.getElementById('backgroundMusic'),button=doc.getElementById('musicToggle');
    if(!media||!button)return null;
    var storage;try{storage=window.localStorage;}catch(_){}
    var controller=new Controller(media,button,doc,storage);
    button.addEventListener('click',function(){controller.toggle();});
    doc.addEventListener('pointerdown',function(event){if(event.isTrusted&& !event.target.closest?.('#musicToggle'))controller.gesture();});
    doc.addEventListener('click',function(event){if(event.isTrusted&& !event.target.closest?.('#musicToggle'))controller.gesture();});
    doc.addEventListener('keydown',function(event){if(event.isTrusted&&!event.repeat&&['Enter',' '].includes(event.key)&& !event.target.closest?.('#musicToggle'))controller.gesture();});
    doc.addEventListener('visibilitychange',function(){controller.sync();});
    window.addEventListener('pagehide',function(){controller.away=true;controller.sync();});
    window.addEventListener('pageshow',function(){controller.away=false;controller.sync();});
    return controller;
  }
  return {Controller:Controller,mount:mount};
});

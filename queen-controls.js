(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeadowControls = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEAD_ZONE = 0.12;
  var MAX_TRAVEL = 38;
  var MOVE_KEYS = {
    w: [0, -1], arrowup: [0, -1],
    s: [0, 1], arrowdown: [0, 1],
    a: [-1, 0], arrowleft: [-1, 0],
    d: [1, 0], arrowright: [1, 0]
  };

  function keyName(event) {
    var key = String(event.key || '').toLowerCase();
    return key === 'spacebar' || key === 'space' ? ' ' : key;
  }

  function interactive(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    return typeof target.closest === 'function' && !!target.closest(
      'button, input, textarea, select, a[href], summary, [role="button"], [contenteditable="true"], [contenteditable=""]'
    );
  }

  function analog(x, y, deadZone) {
    var length = Math.hypot(x, y);
    if (length <= deadZone) return { x: 0, y: 0 };
    var strength = (Math.min(1, length) - deadZone) / (1 - deadZone);
    return { x: x / length * strength, y: y / length * strength };
  }

  class Controls {
    constructor(options) {
      options = options || {};
      this.canvas = options.canvas;
      this.window = options.window || (typeof window !== 'undefined' ? window : null);
      this.document = options.document || (this.window && this.window.document);
      this.onPause = typeof options.onPause === 'function' ? options.onPause : function () {};
      this.onDash = typeof options.onDash === 'function' ? options.onDash : function () {};
      this.onZoom = typeof options.onZoom === 'function' ? options.onZoom : function () {};
      this.zoom = 1;this.pinchPoints=new Map();this.pinchBase=null;
      this.drag = null;this.dragIndicator=options.dragIndicator;
      this.enabled = false;
      this.destroyed = false;
      this.keys = new Set();
      this.mouse = null;
      this.listeners = [];
      this.move = this.makeStick(options.moveStick);
      this.aim = this.makeStick(options.aimStick);

      this.listen(this.canvas, 'pointermove', (event) => {
        if (this.enabled && event.pointerType === 'mouse') {
          this.mouse = { x: event.clientX, y: event.clientY };
        }
      });
      this.listen(this.canvas, 'pointerleave', () => { this.mouse = null; });
      this.listen(this.canvas,'pointerdown',(event)=>{
        if(!this.enabled||event.pointerType!=='touch'||this.pinchPoints.size>=2)return;
        event.preventDefault();this.mouse=null;this.pinchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
        try{this.canvas.setPointerCapture(event.pointerId)}catch(_){}
        if(this.pinchPoints.size===1)this.beginDrag(event.pointerId,event.clientX,event.clientY);
        if(this.pinchPoints.size===2){this.clearDrag();const [a,b]=[...this.pinchPoints.values()];this.pinchBase={distance:Math.max(5,Math.hypot(a.x-b.x,a.y-b.y)),zoom:this.zoom};}
      },{passive:false});
      this.listen(this.canvas,'pointermove',(event)=>{
        if(!this.enabled||!this.pinchPoints.has(event.pointerId))return;
        event.preventDefault();this.pinchPoints.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(this.pinchBase&&this.pinchPoints.size===2){const [a,b]=[...this.pinchPoints.values()];this.setZoom(this.pinchBase.zoom*Math.hypot(a.x-b.x,a.y-b.y)/this.pinchBase.distance);}
        else if(this.drag&&this.drag.id===event.pointerId){const value=analog((event.clientX-this.drag.originX)/MAX_TRAVEL,(event.clientY-this.drag.originY)/MAX_TRAVEL,DEAD_ZONE);this.drag.x=value.x;this.drag.y=value.y;this.drawDrag(event.clientX,event.clientY);}
      },{passive:false});
      ['pointerup','pointercancel','lostpointercapture'].forEach(type=>this.listen(this.canvas,type,event=>{
        if(!this.pinchPoints.has(event.pointerId))return;this.pinchPoints.delete(event.pointerId);this.pinchBase=null;
        this.clearDrag();if(this.pinchPoints.size===1){const [id,point]=[...this.pinchPoints.entries()][0];this.beginDrag(id,point.x,point.y);}
        try{this.canvas.releasePointerCapture(event.pointerId)}catch(_){}
      }));
      this.listen(this.canvas,'wheel',event=>{if(!this.enabled)return;event.preventDefault();this.setZoom(this.zoom*Math.exp(-Math.max(-160,Math.min(160,Number(event.deltaY)||0))*.002));},{passive:false});
      this.listen(this.window, 'keydown', (event) => this.keyDown(event));
      this.listen(this.window, 'keyup', (event) => this.keyUp(event));
      this.listen(this.window, 'blur', () => this.interrupt());
      this.listen(this.document, 'visibilitychange', () => {
        if (this.document.hidden || this.document.visibilityState === 'hidden') this.interrupt();
      });
    }

    listen(target, type, listener, options) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, listener, options);
      this.listeners.push({ target: target, type: type, listener: listener, options: options });
    }

    beginDrag(id,x,y){this.drag={id,originX:x,originY:y,x:0,y:0};this.drawDrag(x,y);}
    drawDrag(x,y){const el=this.dragIndicator,d=this.drag;if(!el||!d)return;el.hidden=false;el.style.left=d.originX+'px';el.style.top=d.originY+'px';const knob=el.firstElementChild;if(knob){const dx=x-d.originX,dy=y-d.originY,n=Math.max(1,Math.hypot(dx,dy)/MAX_TRAVEL);knob.style.transform='translate('+dx/n+'px, '+dy/n+'px)';}}
    clearDrag(){this.drag=null;if(this.dragIndicator)this.dragIndicator.hidden=true;}

    makeStick(element) {
      var stick = { element: element, knob: null, pointerId: null, x: 0, y: 0 };
      if (!element) return stick;
      stick.knob = typeof element.querySelector === 'function' &&
        element.querySelector('[data-stick-knob], .stickKnob, .stick-knob');
      stick.knob = stick.knob || element.firstElementChild;

      this.listen(element, 'pointerdown', (event) => {
        if (!this.enabled || stick.pointerId !== null || (event.button != null && event.button !== 0)) return;
        event.preventDefault();
        stick.pointerId = event.pointerId;
        if (typeof element.setPointerCapture === 'function') {
          try { element.setPointerCapture(event.pointerId); } catch (_) { /* Capture can race with cancellation. */ }
        }
        this.updateStick(stick, event);
      }, { passive: false });
      this.listen(element, 'pointermove', (event) => {
        if (!this.enabled || event.pointerId !== stick.pointerId) return;
        event.preventDefault();
        this.updateStick(stick, event);
      }, { passive: false });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
        this.listen(element, type, (event) => {
          if (event.pointerId !== stick.pointerId) return;
          this.clearStick(stick);
        });
      });
      return stick;
    }

    updateStick(stick, event) {
      var bounds = stick.element.getBoundingClientRect();
      var radius = Math.min(MAX_TRAVEL, bounds.width / 2, bounds.height / 2) || MAX_TRAVEL;
      var rawX = (event.clientX - bounds.left - bounds.width / 2) / radius;
      var rawY = (event.clientY - bounds.top - bounds.height / 2) / radius;
      var length = Math.hypot(rawX, rawY);
      var clampedX = rawX / Math.max(1, length);
      var clampedY = rawY / Math.max(1, length);
      var value = analog(rawX, rawY, DEAD_ZONE);
      stick.x = value.x;
      stick.y = value.y;
      if (stick.knob && stick.knob.style) {
        stick.knob.style.transform = 'translate(' + (clampedX * radius) + 'px, ' + (clampedY * radius) + 'px)';
      }
    }

    clearStick(stick) {
      var pointerId = stick.pointerId;
      stick.pointerId = null;
      stick.x = 0;
      stick.y = 0;
      if (stick.knob && stick.knob.style) stick.knob.style.transform = 'translate(0px, 0px)';
      if (pointerId !== null && stick.element && typeof stick.element.releasePointerCapture === 'function') {
        try { stick.element.releasePointerCapture(pointerId); } catch (_) { /* It may already have been released. */ }
      }
    }

    keyDown(event) {
      if (!this.enabled || event.ctrlKey || event.metaKey || event.altKey || interactive(event.target)) return;
      var key = keyName(event);
      if (!MOVE_KEYS[key] && key !== ' ' && key !== 'shift' && key !== 'p' && key !== 'escape') return;
      event.preventDefault();
      var held = this.keys.has(key);
      this.keys.add(key);
      if (held || event.repeat) return;
      if (key === ' ' || key === 'shift') this.onDash();
      if (key === 'p' || key === 'escape') this.onPause();
    }

    keyUp(event) {
      var key = keyName(event);
      this.keys.delete(key);
      if (this.enabled && !event.ctrlKey && !event.metaKey && !event.altKey && !interactive(event.target) &&
          (MOVE_KEYS[key] || key === ' ' || key === 'shift')) event.preventDefault();
    }

    interrupt() {
      var wasEnabled = this.enabled;
      this.reset();
      if (wasEnabled) this.onPause();
    }

    getInput(centerX, centerY) {
      if (!this.enabled) return { x: 0, y: 0, aimX: 0, aimY: 0 };
      var usingKeyboard = false;
      this.keys.forEach(function (key) {
        if (MOVE_KEYS[key]) usingKeyboard = true;
      });
      var x = Number(this.keys.has('d') || this.keys.has('arrowright')) -
        Number(this.keys.has('a') || this.keys.has('arrowleft'));
      var y = Number(this.keys.has('s') || this.keys.has('arrowdown')) -
        Number(this.keys.has('w') || this.keys.has('arrowup'));
      var length = Math.hypot(x, y);
      if (usingKeyboard) {
        if (length) { x /= length; y /= length; }
      } else if (this.move.pointerId !== null) {
        x = this.move.x;
        y = this.move.y;
      } else if(this.drag&&this.pinchPoints.size===1){
        x=this.drag.x;y=this.drag.y;
      } else if (this.mouse && Number.isFinite(centerX) && Number.isFinite(centerY)) {
        var bounds = this.canvas.getBoundingClientRect();
        var vector = analog((this.mouse.x - bounds.left - centerX) / 80,
          (this.mouse.y - bounds.top - centerY) / 80, DEAD_ZONE);
        x = vector.x;
        y = vector.y;
      }
      return { x: x, y: y, aimX: this.aim.x, aimY: this.aim.y };
    }

    reset() {
      this.keys.clear();
      this.mouse = null;
      this.clearDrag();
      this.clearStick(this.move);
      this.clearStick(this.aim);
      const points=[...this.pinchPoints.keys()];this.pinchPoints.clear();this.pinchBase=null;
      for(const id of points)try{this.canvas.releasePointerCapture(id)}catch(_){}
    }

    setZoom(value){if(!Number.isFinite(value))return;this.zoom=Math.max(.5,Math.min(1.35,value));this.onZoom(this.zoom);}

    setEnabled(value) {
      this.enabled = !this.destroyed && !!value;
      if (!this.enabled) this.reset();
    }

    destroy() {
      this.setEnabled(false);
      this.listeners.forEach(function (item) {
        item.target.removeEventListener(item.type, item.listener, item.options);
      });
      this.listeners.length = 0;
      this.destroyed = true;
    }
  }

  return { Controls: Controls };
});

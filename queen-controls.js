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
      this.clearStick(this.move);
      this.clearStick(this.aim);
    }

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

(function () {
  "use strict";

  var held = Object.create(null);

  function dispatchKey(key, type) {
    var code = key === " " ? "Space" : key;
    var ev = new KeyboardEvent(type, {
      key: key,
      code: code,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(ev);
  }

  function press(key) {
    if (held[key]) return;
    held[key] = true;
    dispatchKey(key, "keydown");
  }

  function release(key) {
    if (!held[key]) return;
    held[key] = false;
    dispatchKey(key, "keyup");
  }

  function bindButton(btn) {
    var key = btn.getAttribute("data-key");
    if (!key) return;

    function down(e) {
      e.preventDefault();
      press(key);
    }
    function up(e) {
      e.preventDefault();
      release(key);
    }

    btn.addEventListener("touchstart", down, { passive: false });
    btn.addEventListener("touchend", up, { passive: false });
    btn.addEventListener("touchcancel", up, { passive: false });
    btn.addEventListener("mousedown", down);
    btn.addEventListener("mouseup", up);
    btn.addEventListener("mouseleave", up);
  }

  document.querySelectorAll(".ctl").forEach(bindButton);

  window.addEventListener("blur", function () {
    Object.keys(held).forEach(release);
  });
})();

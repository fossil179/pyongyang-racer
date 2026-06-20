(function () {
  "use strict";

  var held = Object.create(null);
  var controls = document.getElementById("controls");
  var toggle = document.getElementById("controls-toggle");

  function dispatchKey(key, type) {
    var code = key === " " ? "Space" : key;
    window.dispatchEvent(new KeyboardEvent(type, {
      key: key,
      code: code,
      bubbles: true,
      cancelable: true
    }));
  }

  function releaseAll() {
    Object.keys(held).forEach(function (key) {
      if (held[key]) {
        held[key] = false;
        dispatchKey(key, "keyup");
      }
    });
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

  function setControlsVisible(show) {
    if (!controls || !toggle) return;
    controls.classList.toggle("hidden", !show);
    controls.setAttribute("aria-hidden", show ? "false" : "true");
    toggle.setAttribute("aria-expanded", show ? "true" : "false");
    toggle.textContent = show ? "Hide controls" : "Show controls";
    if (!show) releaseAll();
  }

  if (toggle) {
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setControlsVisible(controls.classList.contains("hidden"));
    });
  }

  document.querySelectorAll(".ctl").forEach(function (btn) {
    var key = btn.getAttribute("data-key");
    if (!key) return;

    function down(e) {
      e.preventDefault();
      e.stopPropagation();
      press(key);
    }
    function up(e) {
      e.preventDefault();
      e.stopPropagation();
      release(key);
    }

    btn.addEventListener("touchstart", down, { passive: false });
    btn.addEventListener("touchend", up, { passive: false });
    btn.addEventListener("touchcancel", up, { passive: false });
    btn.addEventListener("mousedown", down);
    btn.addEventListener("mouseup", up);
    btn.addEventListener("mouseleave", up);
  });

  window.addEventListener("blur", releaseAll);

  // Controls hidden on launch so menus / Start buttons are not blocked.
  setControlsVisible(false);
})();

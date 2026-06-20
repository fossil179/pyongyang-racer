(function () {
  "use strict";

  var cfg = window.PYONGYANG_RACER || {};
  var container = document.getElementById("game-container");
  var loading = document.getElementById("loading");

  function hideLoading() {
    if (loading) loading.style.display = "none";
  }

  function showError(msg) {
    hideLoading();
    container.innerHTML = "<p class=\"error\">" + msg + "</p>";
  }

  function sizePlayer(player) {
    var stage = document.getElementById("game-stage");
    player.style.width = stage.clientWidth + "px";
    player.style.height = stage.clientHeight + "px";
  }

  function loadRuffle() {
    var script = document.createElement("script");
    script.src = "ruffle/ruffle.js";
    script.onload = function () {
      window.RufflePlayer = window.RufflePlayer || {};
      window.RufflePlayer.config = {
        publicPath: "ruffle/",
        autoplay: "on",
        unmuteOverlay: "hidden",
        letterbox: "on",
        warnOnUnsupportedContent: false,
        splashScreen: false,
        compatibilityRules: true,
        preferredRenderer: "wgpu-webgl"
      };
      var ruffle = window.RufflePlayer.newest();
      var player = ruffle.createPlayer();
      container.appendChild(player);
      sizePlayer(player);
      window.addEventListener("resize", function () { sizePlayer(player); });
      try {
        player.load(cfg.swfPath);
        setTimeout(hideLoading, 1500);
      } catch (err) {
        showError("Could not load game. Run: cd mobile && npm run sync");
      }
    };
    script.onerror = function () {
      showError("Ruffle failed to load. Run: cd mobile && npm run sync");
    };
    document.head.appendChild(script);
  }

  function loadCheerpX() {
    if (!cfg.cheerpxScriptUrl) {
      showError("Set cheerpxScriptUrl in www/js/config.js after licensing CheerpX.");
      return;
    }
    container.innerHTML = "<div id=\"cheerpx-root\" data-swf=\"" + cfg.swfPath + "\"></div>";
    var script = document.createElement("script");
    script.src = cfg.cheerpxScriptUrl;
    script.onload = hideLoading;
    script.onerror = function () { showError("CheerpX script failed to load."); };
    document.head.appendChild(script);
  }

  if (cfg.engine === "cheerpx") {
    loadCheerpX();
  } else {
    loadRuffle();
  }
})();

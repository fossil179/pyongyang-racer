(function () {
  "use strict";
  var button = document.querySelector("[data-share-native]");
  if (!button || typeof navigator.share !== "function") return;
  button.hidden = false;
  button.addEventListener("click", function () {
    navigator.share({
      title: "Pyongyang Racer",
      text: "Play Pyongyang Racer, the 2012 racing game from Pyongyang.",
      url: "https://pyongyangracer.com/"
    }).catch(function () {});
  });
})();

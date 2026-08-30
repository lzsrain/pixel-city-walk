(function () {
  "use strict";

  var FLIP_MS = 620;
  var reducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var book = document.getElementById("book");
  var pages = Array.prototype.slice.call(document.querySelectorAll(".page"));
  var idxItems = Array.prototype.slice.call(document.querySelectorAll(".idx-item"));
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var counter = document.getElementById("pageCounter");

  var total = pages.length;
  var cur = 0;
  var animating = false;

  function loadImages(upTo) {
    pages.forEach(function (page) {
      var img = page.querySelector("img[data-src]");
      if (!img) return;
      var idx = parseInt(page.getAttribute("data-page"), 10);
      if (idx <= upTo && img.getAttribute("src").indexOf("data:image/gif") === 0) {
        img.setAttribute("src", img.getAttribute("data-src"));
      }
    });
  }

  function updateControls() {
    pages.forEach(function (page, i) {
      page.classList.toggle("hidden", i > cur);
      page.classList.toggle("flipped", i < cur);
    });
    idxItems.forEach(function (item, i) {
      var goto = parseInt(item.getAttribute("data-goto"), 10);
      item.classList.toggle("active", goto === cur);
      item.classList.toggle("done", goto < cur);
    });
    prevBtn.disabled = cur === 0;
    nextBtn.disabled = cur === total - 1;
    counter.textContent = (cur + 1) + " / " + total;
    loadImages(cur + 1);
  }

  function finalize() {
    updateControls();
    animating = false;
  }

  function go(next) {
    if (animating || next === cur) return;
    if (next < 0 || next >= total) return;
    var forward = next > cur;
    var leaving = pages[cur];
    var arriving = pages[next];
    animating = true;

    arriving.classList.remove("hidden");
    if (forward) {
      leaving.classList.add("flipping");
      leaving.classList.add("flipped");
    } else {
      arriving.classList.add("flipping");
      void arriving.offsetWidth;
      arriving.classList.remove("flipped");
    }

    cur = next;

    if (reducedMotion) {
      finalize();
      return;
    }

    var done = false;
    function onEnd() {
      if (done) return;
      done = true;
      leaving.classList.remove("flipping");
      arriving.classList.remove("flipping");
      finalize();
    }
    leaving.addEventListener("transitionend", onEnd);
    arriving.addEventListener("transitionend", onEnd);
    window.setTimeout(onEnd, FLIP_MS + 120);
  }

  function next() { go(cur + 1); }
  function prev() { go(cur - 1); }

  prevBtn.addEventListener("click", prev);
  nextBtn.addEventListener("click", next);

  idxItems.forEach(function (item) {
    item.addEventListener("click", function () {
      go(parseInt(item.getAttribute("data-goto"), 10));
    });
  });

  document.querySelectorAll("[data-goto]").forEach(function (el) {
    if (el === prevBtn || el === nextBtn || el.closest("#chapterIndex")) return;
    el.addEventListener("click", function () {
      go(parseInt(el.getAttribute("data-goto"), 10));
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      prev();
    } else if (e.key === "Home") {
      go(0);
    } else if (e.key === "End") {
      go(total - 1);
    }
  });

  var touchStart = null;
  var touchId = null;

  book.addEventListener("pointerdown", function (e) {
    touchStart = { x: e.clientX, y: e.clientY, t: Date.now() };
    touchId = e.pointerId;
  });

  book.addEventListener("pointerup", function (e) {
    if (e.pointerId !== touchId || !touchStart) return;
    var dx = e.clientX - touchStart.x;
    var dy = e.clientY - touchStart.y;
    var dt = Date.now() - touchStart.t;
    touchStart = null;
    touchId = null;

    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next();
      else prev();
      return;
    }

    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && dt < 400) {
      var t = e.target;
      if (t.closest && t.closest("button, a, .idx-item")) return;
      var rect = book.getBoundingClientRect();
      var rx = (e.clientX - rect.left) / rect.width;
      if (rx > 0.75) next();
      else if (rx < 0.25) prev();
    }
  });

  book.addEventListener("pointercancel", function () {
    touchStart = null;
    touchId = null;
  });

  pages.forEach(function (page) {
    page.addEventListener("transitionend", function (e) {
      if (e.propertyName !== "transform") return;
      var idx = parseInt(page.getAttribute("data-page"), 10);
      if (page.classList.contains("flipped") && idx <= cur) {
        page.classList.remove("flipping");
      }
    });
  });

  updateControls();
})();

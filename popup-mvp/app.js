(() => {
  "use strict";
  const root = document.documentElement;
  const book = document.getElementById("book");
  const turn = document.getElementById("turningPage");
  const openButton = document.getElementById("openBook");
  const hotspot = document.getElementById("hotspot");
  const card = document.getElementById("storyCard");
  const closeStory = document.getElementById("closeStory");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let progress = 0, shown = 0, target = 0, velocity = 0;
  let dragging = false, pointerId = null, startX = 0, startProgress = 0, lastX = 0, lastTime = 0, fling = 0;
  let mx = 0, my = 0, mxShown = 0, myShown = 0, raf = 0;

  const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
  function draw() {
    if (!dragging) {
      const stiffness = reduced ? .42 : .115;
      const damping = reduced ? .62 : .79;
      velocity += (target - progress) * stiffness;
      velocity *= damping;
      progress += velocity;
      if (Math.abs(target - progress) < .0003 && Math.abs(velocity) < .0003) {
        progress = target; velocity = 0;
      }
    }
    shown += (progress - shown) * (dragging ? .55 : .36);
    mxShown += (mx - mxShown) * .08;
    myShown += (my - myShown) * .08;
    root.style.setProperty("--p", clamp(shown).toFixed(4));
    root.style.setProperty("--mx", mxShown.toFixed(3));
    root.style.setProperty("--my", myShown.toFixed(3));
    book.classList.toggle("opened", shown > .96);
    raf = requestAnimationFrame(draw);
  }

  function begin(e) {
    if (e.target.closest("button") && e.target !== turn) return;
    dragging = true; pointerId = e.pointerId; startX = lastX = e.clientX;
    startProgress = progress; lastTime = performance.now(); fling = 0; velocity = 0;
    book.setPointerCapture?.(pointerId);
    closeCard();
  }
  function move(e) {
    const rect = book.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width - .5) * 2;
    const ny = ((e.clientY - rect.top) / rect.height - .5) * 2;
    mx = clamp(nx, -1, 1); my = clamp(ny, -1, 1);
    if (!dragging || e.pointerId !== pointerId) return;
    const now = performance.now();
    progress = clamp(startProgress + (startX - e.clientX) / (rect.width * .5));
    const dt = Math.max(8, now - lastTime);
    fling = (lastX - e.clientX) / dt;
    lastX = e.clientX; lastTime = now;
  }
  function end(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const travel = Math.abs(e.clientX - startX);
    dragging = false; pointerId = null;
    const hr = hotspot.getBoundingClientRect();
    if (progress > .85 && travel < 9 && e.clientX >= hr.left - 10 && e.clientX <= hr.right + 10 &&
        e.clientY >= hr.top - 10 && e.clientY <= hr.bottom + 10) {
      target = 1; openCard(); return;
    }
    target = progress > .38 || fling > .55 ? 1 : 0;
    if (startProgress > .72 && (progress < .62 || fling < -.55)) target = 0;
  }
  function animateTo(n) { dragging = false; target = n; velocity += (n ? .018 : -.018); closeCard(); }
  function openCard() {
    const open = !card.classList.contains("open");
    card.classList.toggle("open", open);
    card.setAttribute("aria-hidden", String(!open));
    hotspot.setAttribute("aria-expanded", String(open));
  }
  function closeCard() {
    card.classList.remove("open");
    card.setAttribute("aria-hidden", "true");
    hotspot.setAttribute("aria-expanded", "false");
  }

  book.addEventListener("pointerdown", begin);
  book.addEventListener("pointermove", move);
  book.addEventListener("pointerup", end);
  book.addEventListener("pointercancel", end);
  book.addEventListener("pointerleave", () => { if (!dragging) { mx = 0; my = 0; } });
  openButton.addEventListener("click", () => animateTo(1));
  hotspot.addEventListener("pointerdown", e => e.stopPropagation());
  hotspot.addEventListener("click", e => { e.stopPropagation(); openCard(); });
  closeStory.addEventListener("click", closeCard);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeCard();
    if (e.key === "ArrowLeft") animateTo(1);
    if (e.key === "ArrowRight") animateTo(0);
  });
  window.addEventListener("beforeunload", () => cancelAnimationFrame(raf));
  window.__popupMvp = { get progress(){ return progress; }, open:()=>animateTo(1), close:()=>animateTo(0) };
  draw();
})();

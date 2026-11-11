(() => {
  const root = document.getElementById('studio-slideshow');
  const slides = [...root.querySelectorAll('[data-slide]')];
  const dots = [...root.querySelectorAll('[data-slide-to]')];
  const pause = document.getElementById('slide-pause');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, paused = reduced.matches, hover = false, focus = false, timer, touchX;
  function schedule() {
    clearTimeout(timer);
    if (!paused && !hover && !focus && !document.hidden) timer = setTimeout(() => show(index + 1), 6500);
  }
  function show(next, manual = false) {
    index = (next + slides.length) % slides.length;
    slides.forEach((s, i) => { s.classList.toggle('is-current', i === index); s.setAttribute('aria-hidden', i !== index); });
    dots.forEach((d, i) => d.setAttribute('aria-current', i === index));
    document.getElementById('slide-counter').textContent = String(index + 1).padStart(2, '0') + ' / 07';
    if (manual) document.getElementById('slide-announcement').textContent = 'Image ' + (index + 1) + ' of 7: ' + slides[index].querySelector('img').alt;
    // Warm the next image without delaying the first view.
    slides[(index + 1) % slides.length].querySelector('img').loading = 'eager';
    schedule();
  }
  function updatePause() {
    pause.textContent = paused ? 'Play slides' : 'Pause slides';
    pause.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
    schedule();
  }
  root.querySelector('.slide-prev').onclick = () => show(index - 1, true);
  root.querySelector('.slide-next').onclick = () => show(index + 1, true);
  dots.forEach((d, i) => d.onclick = () => show(i, true));
  pause.onclick = () => { paused = !paused; updatePause(); };
  root.addEventListener('mouseenter', () => { hover = true; schedule(); });
  root.addEventListener('mouseleave', () => { hover = false; schedule(); });
  root.addEventListener('focusin', () => { focus = true; schedule(); });
  root.addEventListener('focusout', e => { if (!root.contains(e.relatedTarget)) { focus = false; schedule(); } });
  root.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); show(index + (e.key === 'ArrowLeft' ? -1 : 1), true); }
  });
  root.querySelector('.slideshow-stage').addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  root.querySelector('.slideshow-stage').addEventListener('touchend', e => {
    if (touchX === undefined) return;
    const delta = e.changedTouches[0].clientX - touchX;
    if (Math.abs(delta) > 45) show(index + (delta < 0 ? 1 : -1), true);
    touchX = undefined;
  }, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', () => { if (reduced.matches) { paused = true; updatePause(); } });
  updatePause();
})();

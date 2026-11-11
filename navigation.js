(() => {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('site-nav');
  const narrow = matchMedia('(max-width: 640px)');
  const setExpanded = expanded => toggle.setAttribute('aria-expanded', String(expanded));

  toggle.addEventListener('click', () => {
    setExpanded(toggle.getAttribute('aria-expanded') === 'false');
  });

  nav.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!narrow.matches || !link) return;
    if (link.hash && link.pathname === location.pathname) {
      const destination = document.getElementById(link.hash.slice(1));
      if (destination && !destination.hasAttribute('tabindex')) destination.tabIndex = -1;
    }
    setExpanded(false);
  });

  toggle.parentElement.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !narrow.matches || toggle.getAttribute('aria-expanded') !== 'true') return;
    setExpanded(false);
    toggle.focus();
  });

  narrow.addEventListener('change', () => {
    if (narrow.matches && nav.contains(document.activeElement)) toggle.focus();
    if (!narrow.matches && document.activeElement === toggle) nav.querySelector('a').focus();
    setExpanded(false);
  });
  toggle.hidden = false;
})();

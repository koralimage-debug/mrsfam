(() => {
  const button = document.getElementById('share-card');
  const status = document.getElementById('share-status');
  const fallback = document.getElementById('share-fallback');
  const input = document.getElementById('share-url');
  const url = document.querySelector('link[rel="canonical"]').href;

  button.addEventListener('click', async () => {
    status.textContent = '';
    fallback.hidden = true;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Real Talk with Mrs Fam', url });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        status.textContent = 'Contact card link copied.';
        return;
      } catch {
        // Provide a selectable link when clipboard access is blocked.
      }
    }

    input.value = url;
    fallback.hidden = false;
    input.focus();
    input.select();
  });
  button.hidden = false;
})();

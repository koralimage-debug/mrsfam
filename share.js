(function () {
  const shareUrl = 'https://mrsfam.com/#radio-embed';
  const shareText = 'Listen to Mrs Fam Radio, on air 24/7';
  const nativeBtn = document.getElementById('share-native');
  const copyBtn = document.getElementById('share-copy');
  const status = document.getElementById('share-status');

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  if (nativeBtn && typeof navigator.share === 'function') {
    nativeBtn.hidden = false;
    nativeBtn.setAttribute('aria-label', 'Share Mrs Fam Radio using this device');
    nativeBtn.addEventListener('click', function () {
      navigator.share({
        title: 'Mrs Fam Radio',
        text: shareText,
        url: shareUrl
      }).then(function () {
        setStatus('');
      }).catch(function (error) {
        if (error && error.name !== 'AbortError') setStatus('Sharing is unavailable. Copy the link instead.');
      });
    });
  }

  function copyLink() {
    const done = function () { setStatus('Link copied'); };
    const fail = function () { setStatus('Could not copy. Please copy the link from the address bar.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(done).catch(function () {
        fallbackCopy() ? done() : fail();
      });
    } else if (fallbackCopy()) {
      done();
    } else {
      fail();
    }
  }

  function fallbackCopy() {
    const field = document.createElement('textarea');
    field.value = shareUrl;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.top = '0';
    field.style.left = '0';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.focus();
    field.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(field);
    return ok;
  }

  if (copyBtn) copyBtn.addEventListener('click', copyLink);
})();

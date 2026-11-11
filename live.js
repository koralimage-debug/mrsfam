(() => {
  const el = id => document.getElementById(id);
  let videoId = '';
  let title = 'Real Talk with Mrs Fam — broadcast';
  const watch = el('live-watch');
  const close = el('live-close');
  function stop() {
    el('live-embed').replaceChildren();
    el('live-embed').hidden = true;
    el('live-placeholder').hidden = false;
    close.hidden = true;
    watch.focus();
  }
  watch.addEventListener('click', () => {
    if (!videoId) return;
    // Avoid overlapping the separate radio player with a video broadcast.
    const radio = el('broadcast');
    if (radio && !radio.paused) el('radio-play').click();
    const frame = document.createElement('iframe');
    frame.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=0&playsinline=1';
    frame.title = title;
    frame.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    el('live-embed').replaceChildren(frame);
    el('live-embed').hidden = false;
    el('live-placeholder').hidden = true;
    close.hidden = false;
    close.focus();
  });
  close.addEventListener('click', stop);
  fetch('live-config.json', { cache: 'no-store' }).then(r => {
    if (!r.ok) throw Error('Configuration unavailable');
    return r.json();
  }).then(config => {
    if (!config.youtubeVideoId) return;
    if (!/^[A-Za-z0-9_-]{11}$/.test(config.youtubeVideoId)) throw Error('Invalid video ID');
    videoId = config.youtubeVideoId;
    if (config.title) { title = config.title; el('live-title').textContent = title; }
    if (config.description) el('live-description').textContent = config.description;
    // Never infer a currently live broadcast from a configured video ID.
    el('live-status').textContent = config.replay ? 'BROADCAST REPLAY' : 'BROADCAST CHANNEL CONNECTED';
    el('live-empty-note').textContent = config.replay ? 'Watch this conversation again.' : 'Open the player to check the broadcast.';
    watch.disabled = false;
    watch.textContent = config.replay ? 'Watch replay' : 'Open broadcast player';
    el('live-provider-note').textContent = 'The video loads from YouTube when you open the player. If unavailable here, use the YouTube link. Some videos may have provider restrictions.';
    const link = el('live-external');
    link.href = 'https://www.youtube.com/watch?v=' + videoId;
    link.hidden = false;
    if (config.scheduledStart) {
      const date = new Date(config.scheduledStart);
      if (!Number.isNaN(date.getTime())) el('live-next-time').textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(date) + ' (your local time)';
    }
  }).catch(() => {
    el('live-status').textContent = 'AWAITING CHANNEL CONNECTION';
    el('live-empty-note').textContent = 'The broadcast connection is not available yet. Please check back.';
  });
})();

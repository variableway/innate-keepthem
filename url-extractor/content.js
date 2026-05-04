(function () {
  'use strict';

  function extractVideos() {
    const videos = [];
    const seenUrls = new Set();

    const selectors = [
      'a#video-title',
      'a.ytd-video-renderer',
      'a.ytd-grid-video-renderer',
      'a.ytd-rich-grid-media',
      'a.ytd-compact-video-renderer',
      'ytd-playlist-panel-video-renderer a',
      'a.yt-simple-endpoint',
      'a[href*="/watch?v="]'
    ];

    let links = [];
    for (const sel of selectors) {
      const found = document.querySelectorAll(sel);
      found.forEach(link => {
        if (!links.includes(link)) {
          links.push(link);
        }
      });
    }

    links.forEach(link => {
      const href = link.href || '';
      if (!href.includes('/watch?v=')) return;

      const urlObj = new URL(href, window.location.origin);
      const videoId = urlObj.searchParams.get('v');
      if (!videoId || seenUrls.has(videoId)) return;

      seenUrls.add(videoId);

      let title = '';
      title = link.getAttribute('title') ||
        link.getAttribute('aria-label') ||
        link.textContent ||
        '';

      title = title.trim().replace(/\s+/g, ' ');

      const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

      videos.push({
        id: videoId,
        url: cleanUrl,
        title: title || `Video ${videoId}`
      });
    });

    return videos;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractVideos') {
      const videos = extractVideos();
      sendResponse({ videos: videos });
    }
    return true;
  });

  console.log('YouTube URL Extractor content script loaded');
})();

(function () {
  'use strict';

  let allVideos = [];
  let filteredVideos = [];
  let selectedVideos = new Set();

  const elements = {
    extractBtn: document.getElementById('extractBtn'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    deselectAllBtn: document.getElementById('deselectAllBtn'),
    exportSelectedBtn: document.getElementById('exportSelectedBtn'),
    exportAllBtn: document.getElementById('exportAllBtn'),
    limitCount: document.getElementById('limitCount'),
    titleFilter: document.getElementById('titleFilter'),
    titleExclude: document.getElementById('titleExclude'),
    videoList: document.getElementById('videoList'),
    resultCount: document.getElementById('resultCount')
  };

  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function extractVideosFromPage() {
    elements.extractBtn.disabled = true;
    elements.extractBtn.textContent = '获取中...';

    try {
      const tab = await getCurrentTab();

      if (!tab.url || (!tab.url.includes('youtube.com') && !tab.url.includes('youtu.be'))) {
        alert('请在 YouTube 页面上使用此扩展');
        elements.extractBtn.disabled = false;
        elements.extractBtn.textContent = '获取视频列表';
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractVideos' });

      if (response && response.videos) {
        allVideos = response.videos;
        applyFilters();
      }
    } catch (error) {
      console.error('Error extracting videos:', error);
      alert('提取视频失败，请刷新页面后重试');
    }

    elements.extractBtn.disabled = false;
    elements.extractBtn.textContent = '获取视频列表';
  }

  function applyFilters() {
    const limit = parseInt(elements.limitCount.value) || 1000;
    const filterText = elements.titleFilter.value.toLowerCase().trim();
    const excludeText = elements.titleExclude.value.toLowerCase().trim();

    filteredVideos = allVideos.filter(video => {
      const titleLower = video.title.toLowerCase();

      if (filterText && !titleLower.includes(filterText)) {
        return false;
      }

      if (excludeText && titleLower.includes(excludeText)) {
        return false;
      }

      return true;
    });

    filteredVideos = filteredVideos.slice(0, limit);

    selectedVideos.clear();
    renderVideoList();
    updateResultCount();
  }

  function renderVideoList() {
    elements.videoList.innerHTML = '';

    if (filteredVideos.length === 0) {
      elements.videoList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">没有找到视频</div>';
      return;
    }

    filteredVideos.forEach((video, index) => {
      const item = document.createElement('div');
      item.className = 'video-item';
      item.dataset.index = index;

      if (selectedVideos.has(video.id)) {
        item.classList.add('selected');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedVideos.has(video.id);
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleSelection(video.id, item);
      });

      const info = document.createElement('div');
      info.className = 'video-info';

      const title = document.createElement('div');
      title.className = 'video-title';
      title.textContent = video.title;

      const url = document.createElement('div');
      url.className = 'video-url';
      url.textContent = video.url;

      const idBadge = document.createElement('span');
      idBadge.className = 'video-id';
      idBadge.textContent = video.id;

      info.appendChild(title);
      info.appendChild(url);
      info.appendChild(idBadge);

      item.appendChild(checkbox);
      item.appendChild(info);

      item.addEventListener('click', () => {
        toggleSelection(video.id, item);
        checkbox.checked = selectedVideos.has(video.id);
      });

      elements.videoList.appendChild(item);
    });
  }

  function toggleSelection(videoId, itemElement) {
    if (selectedVideos.has(videoId)) {
      selectedVideos.delete(videoId);
      itemElement.classList.remove('selected');
    } else {
      selectedVideos.add(videoId);
      itemElement.classList.add('selected');
    }
  }

  function selectAll() {
    filteredVideos.forEach(video => {
      selectedVideos.add(video.id);
    });
    renderVideoList();
  }

  function deselectAll() {
    selectedVideos.clear();
    renderVideoList();
  }

  function updateResultCount() {
    const selectedCount = selectedVideos.size;
    elements.resultCount.textContent = `找到 ${filteredVideos.length} 个视频 (已选 ${selectedCount} 个)`;
  }

  function getSelectedVideos() {
    return filteredVideos.filter(v => selectedVideos.has(v.id));
  }

  function downloadTxt(videos, filename) {
    const lines = videos.map(v => v.url);
    const content = lines.join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download error:', chrome.runtime.lastError);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  function exportSelected() {
    const selected = getSelectedVideos();
    if (selected.length === 0) {
      alert('请先选择要导出的视频');
      return;
    }
    downloadTxt(selected, 'youtube_urls_selected.txt');
  }

  function exportAll() {
    if (filteredVideos.length === 0) {
      alert('没有可导出的视频');
      return;
    }
    downloadTxt(filteredVideos, 'youtube_urls_all.txt');
  }

  function init() {
    elements.extractBtn.addEventListener('click', extractVideosFromPage);
    elements.selectAllBtn.addEventListener('click', selectAll);
    elements.deselectAllBtn.addEventListener('click', deselectAll);
    elements.exportSelectedBtn.addEventListener('click', exportSelected);
    elements.exportAllBtn.addEventListener('click', exportAll);

    elements.limitCount.addEventListener('change', applyFilters);
    elements.titleFilter.addEventListener('input', applyFilters);
    elements.titleExclude.addEventListener('input', applyFilters);

    updateResultCount();
  }

  document.addEventListener('DOMContentLoaded', init);
})();

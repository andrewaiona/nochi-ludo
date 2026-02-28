/**
 * NOCHI LUDO — UI Controller
 * Handles rendering, drag-and-drop, toasts, modals, and user interactions
 */

const UI = (() => {
  // ── Toast System ──────────────────────────────────────────
  function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;

    container.appendChild(toast);
    toast.addEventListener('click', () => dismissToast(toast));

    setTimeout(() => dismissToast(toast), duration);
  }

  function dismissToast(toast) {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }

  // ── Modal / Lightbox ──────────────────────────────────────
  function openModal(imageUrl) {
    const overlay = document.getElementById('modal-overlay');
    const img = overlay.querySelector('.modal-content img');
    img.src = imageUrl;
    overlay.classList.add('open');
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  }

  // ── Drag & Drop ───────────────────────────────────────────
  function initDropZone(dropZoneEl, fileInputEl, onFilesAdded, filterFn) {
    // Default filter: images only. Pass a custom filter for non-image drop zones.
    const filter = filterFn || (f => f.type.startsWith('image/'));

    dropZoneEl.addEventListener('click', () => fileInputEl.click());

    dropZoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZoneEl.classList.add('drag-over');
    });

    dropZoneEl.addEventListener('dragleave', () => {
      dropZoneEl.classList.remove('drag-over');
    });

    dropZoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZoneEl.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(filter);
      if (files.length > 0) onFilesAdded(files);
    });

    fileInputEl.addEventListener('change', (e) => {
      const files = Array.from(e.target.files).filter(filter);
      if (files.length > 0) onFilesAdded(files);
      fileInputEl.value = '';
    });
  }

  // ── Render Queue List ─────────────────────────────────────
  function renderQueue(jobs, stats) {
    const listEl = document.getElementById('queue-list');
    const counterEl = document.getElementById('queue-counter');
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    const processBtn = document.getElementById('btn-process-all');
    const cancelBtn = document.getElementById('btn-cancel');

    // Counter
    counterEl.textContent = `${stats.total} item${stats.total !== 1 ? 's' : ''}`;

    // Progress bar
    if (stats.processing > 0 || (stats.done > 0 && stats.pending > 0)) {
      progressBar.classList.add('active');
      const progress = stats.total > 0 ? ((stats.done + stats.errors) / stats.total) * 100 : 0;
      progressFill.style.width = `${progress}%`;
    } else {
      progressBar.classList.remove('active');
      progressFill.style.width = '0%';
    }

    // Buttons
    const isProcessing = Queue.getIsProcessing();
    processBtn.classList.toggle('hidden', isProcessing);
    cancelBtn.classList.toggle('hidden', !isProcessing);
    processBtn.disabled = stats.pending === 0 && stats.errors === 0;

    // Empty state
    if (jobs.length === 0) {
      listEl.innerHTML = `
        <div class="queue-empty">
          <div class="queue-empty__icon">📭</div>
          <div class="queue-empty__text">No animations queued yet.<br>Upload sprites and add them to the queue.</div>
        </div>`;
      return;
    }

    // Render jobs
    listEl.innerHTML = jobs.map(job => `
      <div class="queue-item ${job.status}" data-job-id="${job.id}">
        <div class="queue-item__thumb">
          ${job.imagePreview ? `<img src="${job.imagePreview}" alt="sprite">` : '<div class="skeleton" style="width:100%;height:100%"></div>'}
        </div>
        <div class="queue-item__info">
          <div class="queue-item__prompt">${escapeHtml(job.settings.motion_prompt || 'No prompt')}</div>
          <div class="queue-item__meta">${job.imageName} · ${job.settings.frames || 36} frames · ${job.settings.model || 'standard'}</div>
        </div>
        <span class="queue-item__status ${job.status}">
          ${job.status === 'processing' ? '<span class="spinner"></span>' : ''}
          ${job.status}
        </span>
        <div class="queue-item__actions">
          ${job.status === 'error' ? `<button class="btn btn--sm btn--secondary" onclick="App.retryJob('${job.id}')" title="Retry">↻</button>` : ''}
          ${job.status !== 'processing' ? `<button class="btn btn--sm btn--secondary" onclick="App.removeJob('${job.id}')" title="Remove">✕</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  // ── Render Results Gallery ────────────────────────────────
  function renderResults(completedJobs) {
    const gridEl = document.getElementById('results-grid');
    const sectionEl = document.getElementById('results-section');
    const countEl = document.getElementById('results-count');

    if (completedJobs.length === 0) {
      gridEl.innerHTML = `
        <div class="results-empty" style="grid-column: 1 / -1;">
          <div class="results-empty__icon">🎨</div>
          <p>Completed spritesheets will appear here</p>
        </div>`;
      countEl.textContent = '';
      return;
    }

    countEl.textContent = `${completedJobs.length} result${completedJobs.length !== 1 ? 's' : ''}`;

    gridEl.innerHTML = completedJobs.map(job => {
      const r = job.result;
      const hasFrames = r.individual_frame_urls && r.individual_frame_urls.length > 0;
      return `
        <div class="result-card">
          <div class="result-card__preview" onclick="UI.openModal('${r.spritesheet_url}')">
            <img src="${r.spritesheet_url}" alt="Spritesheet" loading="lazy">
            <div class="result-card__preview-overlay"><span>🔍 View Full Size</span></div>
          </div>
          <div class="result-card__body">
            <div class="result-card__prompt">${escapeHtml(job.settings.motion_prompt)}</div>
            <div class="result-card__meta">
              <span>${r.num_frames || '?'} frames</span>
              <span>${r.num_cols || '?'}×${r.num_rows || '?'} grid</span>
            </div>
            <div class="result-card__actions">
              <a href="${r.spritesheet_url}" target="_blank" download class="btn btn--sm btn--secondary">⬇ Spritesheet</a>
              ${r.gif_url ? `<a href="${r.gif_url}" target="_blank" download class="btn btn--sm btn--secondary">⬇ GIF</a>` : ''}
              ${r.video_url ? `<a href="${r.video_url}" target="_blank" class="btn btn--sm btn--secondary">▶ Video</a>` : ''}
              ${hasFrames ? `<button class="btn btn--sm btn--primary" onclick="App.downloadFrames('${job.id}')">⬇ All Frames (${r.individual_frame_urls.length})</button>` : ''}
            </div>
            ${hasFrames ? `
            <div class="result-card__frames">
              <div class="result-card__frames-label">Individual Frames</div>
              <div class="result-card__frames-grid">
                ${r.individual_frame_urls.map((url, i) => `
                  <a href="${url}" target="_blank" download="frame_${i + 1}.png" class="result-card__frame-thumb" title="Frame ${i + 1}">
                    <img src="${url}" alt="Frame ${i + 1}" loading="lazy">
                    <span class="result-card__frame-num">${i + 1}</span>
                  </a>
                `).join('')}
              </div>
            </div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  // ── Preview Strip (uploaded images) ───────────────────────
  function renderPreviewStrip(images) {
    const stripEl = document.getElementById('preview-strip');

    if (images.length === 0) {
      stripEl.innerHTML = '';
      return;
    }

    stripEl.innerHTML = images.map((img, i) => `
      <div class="preview-thumb" title="${escapeHtml(img.name)}">
        <img src="${img.preview}" alt="${escapeHtml(img.name)}">
        <button class="preview-thumb__remove" onclick="App.removeUploadedImage(${i})">✕</button>
      </div>
    `).join('');
  }

  // ── Collapsible Sections ──────────────────────────────────
  function initCollapsibles() {
    document.querySelectorAll('.collapsible-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('open');
        const body = toggle.nextElementSibling;
        body.classList.toggle('open');
      });
    });
  }

  // ── Get Settings From Form ────────────────────────────────
  function getFormSettings() {
    const getValue = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : undefined;
    };

    const getChecked = (id) => {
      const el = document.getElementById(id);
      return el ? el.checked : undefined;
    };

    return {
      motion_prompt: getValue('setting-motion-prompt'),
      model: getValue('setting-model'),
      frames: getValue('setting-frames'),
      frame_size: getValue('setting-frame-size'),
      duration: getValue('setting-duration'),
      loop: getChecked('setting-loop'),
      crop: getChecked('setting-crop'),
      augment_prompt: getChecked('setting-augment'),
      gif: getChecked('setting-gif'),
      individual_frames: getChecked('setting-individual-frames'),
      spritesheet_with_background: getChecked('setting-spritesheet-bg'),
      pixel_art_filter: getValue('setting-pixel-art'),
      image_type: getValue('setting-image-type'),
      margin_ratio_mode: getValue('setting-margin-mode'),
      margin_ratio: getValue('setting-margin-ratio'),
    };
  }

  // ── Update Duration Options based on Model ────────────────
  function updateDurationOptions(model) {
    const durationEl = document.getElementById('setting-duration');
    if (!durationEl) return;

    const currentVal = durationEl.value;

    if (model === 'new') {
      durationEl.innerHTML = '<option value="4">4s</option>';
      durationEl.value = '4';
    } else {
      durationEl.innerHTML = `
        <option value="1.2">1.2s</option>
        <option value="1.5">1.5s</option>
        <option value="2" selected>2s (default)</option>
        <option value="2.5">2.5s</option>
        <option value="3">3s</option>
      `;
      // Restore if valid
      if (['1.2', '1.5', '2', '2.5', '3'].includes(currentVal)) {
        durationEl.value = currentVal;
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  return {
    showToast,
    openModal,
    closeModal,
    initDropZone,
    renderQueue,
    renderResults,
    renderPreviewStrip,
    initCollapsibles,
    getFormSettings,
    updateDurationOptions,
    escapeHtml,
  };
})();

/**
 * NOCHI LUDO — App Controller
 * Main application logic, event wiring, and state coordination
 */

const App = (() => {
    // ── Manual Mode State ─────────────────────────────────────
    let uploadedImages = [];
    let completedJobs = [];

    // ── Batch Mode State ──────────────────────────────────────
    let batchCharacter = null;   // { name, data, preview }
    let batchPrompts = [];       // [{ name, prompt }]
    let currentMode = 'manual';  // 'manual' | 'batch'

    // ── Initialize ────────────────────────────────────────────
    function init() {
        // --- Tab switching ---
        document.querySelectorAll('#mode-tabs .tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        // --- Manual mode: drop zone ---
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        UI.initDropZone(dropZone, fileInput, handleFilesAdded);

        // --- Batch mode: character drop zone ---
        const batchDropZone = document.getElementById('batch-drop-zone');
        const batchFileInput = document.getElementById('batch-file-input');
        UI.initDropZone(batchDropZone, batchFileInput, handleBatchCharacterFile);

        // --- Batch mode: MD file drop zone ---
        const batchMdZone = document.getElementById('batch-md-zone');
        const batchMdInput = document.getElementById('batch-md-input');
        UI.initDropZone(batchMdZone, batchMdInput, handleBatchMdFile, () => true);

        // Init collapsible sections
        UI.initCollapsibles();

        // Wire up queue callbacks
        Queue.on('update', (jobs, stats) => {
            UI.renderQueue(jobs, stats);
            completedJobs = jobs.filter(j => j.status === 'done');
            UI.renderResults(completedJobs);
        });

        Queue.on('jobComplete', (job) => {
            UI.showToast(`✓ Completed: ${job.settings.motion_prompt}`, 'success');
        });

        Queue.on('allComplete', (stats) => {
            UI.showToast(`All done! ${stats.done} succeeded, ${stats.errors} failed.`, stats.errors > 0 ? 'warning' : 'success');
        });

        // --- Common buttons ---
        document.getElementById('btn-process-all').addEventListener('click', processAll);
        document.getElementById('btn-cancel').addEventListener('click', cancelProcessing);
        document.getElementById('btn-clear-queue').addEventListener('click', () => {
            Queue.clearJobs(false);
            UI.showToast('Queue cleared', 'info');
        });

        // --- Manual mode buttons ---
        document.getElementById('btn-add-to-queue').addEventListener('click', addToQueue);
        document.getElementById('btn-add-url').addEventListener('click', addImageFromUrl);
        document.getElementById('url-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addImageFromUrl();
        });

        // --- Batch mode buttons ---
        document.getElementById('btn-batch-add-url').addEventListener('click', setBatchCharacterFromUrl);
        document.getElementById('batch-url-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') setBatchCharacterFromUrl();
        });
        document.getElementById('btn-batch-remove-char').addEventListener('click', removeBatchCharacter);
        document.getElementById('btn-batch-remove-md').addEventListener('click', removeBatchMd);
        document.getElementById('btn-batch-generate').addEventListener('click', batchGenerate);

        // Model change → update duration options
        document.getElementById('setting-model').addEventListener('change', (e) => {
            UI.updateDurationOptions(e.target.value);
        });

        // Modal close
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) UI.closeModal();
        });
        document.getElementById('modal-close').addEventListener('click', UI.closeModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') UI.closeModal();
        });

        // Download all / clear results
        document.getElementById('btn-download-all').addEventListener('click', downloadAllSheets);
        document.getElementById('btn-clear-results').addEventListener('click', () => {
            Queue.clearJobs(true);
            completedJobs = [];
            UI.renderResults(completedJobs);
            UI.showToast('Results cleared', 'info');
        });

        // Initial render
        UI.renderQueue([], Queue.getStats());
        UI.renderResults([]);
        UI.renderPreviewStrip([]);

        console.log('🎮 Nochi Ludo — Bulk Sprite Sheet Creator initialized');
    }

    // ═══════════════════════════════════════════════════════════
    // TAB SWITCHING
    // ═══════════════════════════════════════════════════════════

    function switchTab(tabName) {
        currentMode = tabName;

        // Update tab buttons
        document.querySelectorAll('#mode-tabs .tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        document.getElementById(`tab-${tabName}`).classList.add('active');

        // Show/hide the manual-only "Add to Queue" button
        const manualAddSection = document.getElementById('manual-add-section');
        if (tabName === 'batch') {
            manualAddSection.classList.add('hidden');
        } else {
            manualAddSection.classList.remove('hidden');
        }
    }

    // ═══════════════════════════════════════════════════════════
    // MANUAL MODE
    // ═══════════════════════════════════════════════════════════

    async function handleFilesAdded(files) {
        for (const file of files) {
            try {
                const base64 = await LudoAPI.fileToBase64(file);
                uploadedImages.push({
                    name: file.name,
                    data: base64,
                    preview: base64,
                    file: file,
                });
            } catch (err) {
                UI.showToast(`Failed to read ${file.name}`, 'error');
            }
        }
        UI.renderPreviewStrip(uploadedImages);
        UI.showToast(`${files.length} image${files.length > 1 ? 's' : ''} added`, 'info');
    }

    function addImageFromUrl() {
        const input = document.getElementById('url-input');
        const url = input.value.trim();
        if (!url) { UI.showToast('Please enter an image URL', 'warning'); return; }
        if (!LudoAPI.isUrl(url)) { UI.showToast('Invalid URL format', 'error'); return; }

        uploadedImages.push({
            name: url.split('/').pop() || 'URL Image',
            data: url,
            preview: url,
            file: null,
        });

        UI.renderPreviewStrip(uploadedImages);
        input.value = '';
        UI.showToast('Image URL added', 'info');
    }

    function removeUploadedImage(index) {
        uploadedImages.splice(index, 1);
        UI.renderPreviewStrip(uploadedImages);
    }

    function addToQueue() {
        if (uploadedImages.length === 0) {
            UI.showToast('Please upload at least one sprite image first', 'warning');
            return;
        }

        const settings = UI.getFormSettings();
        if (!settings.motion_prompt || settings.motion_prompt.trim() === '') {
            UI.showToast('Please enter a motion prompt', 'warning');
            document.getElementById('setting-motion-prompt').focus();
            return;
        }

        let addedCount = 0;
        for (const img of uploadedImages) {
            Queue.addJob({
                image: img.data,
                imagePreview: img.preview,
                imageName: img.name,
                settings: { ...settings },
            });
            addedCount++;
        }

        uploadedImages = [];
        UI.renderPreviewStrip(uploadedImages);
        UI.showToast(`${addedCount} animation${addedCount > 1 ? 's' : ''} added to queue`, 'success');
    }

    // ═══════════════════════════════════════════════════════════
    // BATCH MODE
    // ═══════════════════════════════════════════════════════════

    // ── Step 1: Character Image ───────────────────────────────
    async function handleBatchCharacterFile(files) {
        const file = files[0]; // Only take the first file
        try {
            const base64 = await LudoAPI.fileToBase64(file);
            batchCharacter = {
                name: file.name,
                data: base64,
                preview: base64,
            };
            renderBatchCharacterPreview();
            UI.showToast(`Character set: ${file.name}`, 'success');
        } catch (err) {
            UI.showToast('Failed to read image file', 'error');
        }
    }

    function setBatchCharacterFromUrl() {
        const input = document.getElementById('batch-url-input');
        const url = input.value.trim();
        if (!url) { UI.showToast('Please enter a character image URL', 'warning'); return; }
        if (!LudoAPI.isUrl(url)) { UI.showToast('Invalid URL format', 'error'); return; }

        batchCharacter = {
            name: url.split('/').pop() || 'Character',
            data: url,
            preview: url,
        };

        renderBatchCharacterPreview();
        input.value = '';
        UI.showToast('Character image set', 'success');
    }

    function removeBatchCharacter() {
        batchCharacter = null;
        document.getElementById('batch-char-preview').classList.add('hidden');
        updateBatchGenerateButton();
    }

    function renderBatchCharacterPreview() {
        const preview = document.getElementById('batch-char-preview');
        const img = document.getElementById('batch-char-img');
        const name = document.getElementById('batch-char-name');

        img.src = batchCharacter.preview;
        name.textContent = batchCharacter.name;
        preview.classList.remove('hidden');
        updateBatchGenerateButton();
    }

    // ── Step 2: MD File ───────────────────────────────────────
    async function handleBatchMdFile(files) {
        const file = files[0];

        // Validate file type
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['md', 'txt', 'markdown'].includes(ext)) {
            UI.showToast('Please upload a .md, .txt, or .markdown file', 'warning');
            return;
        }

        try {
            const text = await readFileAsText(file);
            const parsed = parseMdPrompts(text);

            if (parsed.length === 0) {
                UI.showToast('No animation prompts found. Make sure your file uses ## headings.', 'error');
                return;
            }

            batchPrompts = parsed;
            renderBatchPromptsPreview();
            UI.showToast(`Loaded ${parsed.length} animation prompts`, 'success');
        } catch (err) {
            UI.showToast('Failed to read file', 'error');
        }
    }

    function removeBatchMd() {
        batchPrompts = [];
        document.getElementById('batch-prompts-preview').classList.add('hidden');
        updateBatchGenerateButton();
    }

    /**
     * Parse a markdown file into animation prompts.
     * Format: Each ## heading is the animation name.
     *         The paragraph(s) below it are the motion prompt.
     *
     * Example:
     *   ## Walk
     *   walking forward, left foot then right foot
     *
     *   ## Run
     *   running fast, arms pumping
     *
     * Returns: [{ name: "Walk", prompt: "walking forward, ..." }, ...]
     */
    function parseMdPrompts(mdText) {
        const prompts = [];
        const lines = mdText.split('\n');

        let currentName = null;
        let currentPromptLines = [];

        for (const line of lines) {
            const trimmed = line.trim();

            // Check for ## heading (animation name)
            const headingMatch = trimmed.match(/^##\s+(.+)$/);

            if (headingMatch) {
                // Save previous entry if exists
                if (currentName && currentPromptLines.length > 0) {
                    prompts.push({
                        name: currentName,
                        prompt: currentPromptLines.join(' ').trim(),
                    });
                }
                currentName = headingMatch[1].trim();
                currentPromptLines = [];
            } else if (currentName && trimmed.length > 0 && !trimmed.startsWith('#')) {
                // Accumulate prompt text (skip empty lines and other headings)
                currentPromptLines.push(trimmed);
            }
        }

        // Don't forget the last entry
        if (currentName && currentPromptLines.length > 0) {
            prompts.push({
                name: currentName,
                prompt: currentPromptLines.join(' ').trim(),
            });
        }

        return prompts;
    }

    function renderBatchPromptsPreview() {
        const preview = document.getElementById('batch-prompts-preview');
        const countEl = document.getElementById('batch-prompts-count');
        const listEl = document.getElementById('batch-prompts-list');

        preview.classList.remove('hidden');
        countEl.textContent = `${batchPrompts.length} animation${batchPrompts.length !== 1 ? 's' : ''} found`;

        listEl.innerHTML = batchPrompts.map((p, i) => `
      <div class="batch-prompt-item" style="animation-delay: ${i * 0.05}s;">
        <span class="batch-prompt-item__name">${UI.escapeHtml(p.name)}</span>
        <span class="batch-prompt-item__prompt">${UI.escapeHtml(p.prompt)}</span>
      </div>
    `).join('');

        updateBatchGenerateButton();
    }

    function updateBatchGenerateButton() {
        const btn = document.getElementById('btn-batch-generate');
        const info = document.getElementById('batch-credit-info');
        const ready = batchCharacter && batchPrompts.length > 0;

        btn.disabled = !ready;

        if (ready) {
            const credits = batchPrompts.length * 5;
            info.textContent = `${batchPrompts.length} animations × 5 credits = ${credits} credits total`;
        } else {
            info.textContent = '';
        }
    }

    // ── Step 3: Generate ──────────────────────────────────────
    function batchGenerate() {
        if (!batchCharacter) {
            UI.showToast('Please upload a character image first', 'warning');
            return;
        }

        if (batchPrompts.length === 0) {
            UI.showToast('Please upload a prompt file first', 'warning');
            return;
        }

        const settings = UI.getFormSettings();

        // Add each prompt as a job to the queue
        for (const anim of batchPrompts) {
            Queue.addJob({
                image: batchCharacter.data,
                imagePreview: batchCharacter.preview,
                imageName: `${batchCharacter.name} — ${anim.name}`,
                settings: {
                    ...settings,
                    motion_prompt: anim.prompt,
                },
            });
        }

        UI.showToast(`${batchPrompts.length} animations queued! Click "Process All" to start.`, 'success', 5000);
    }

    // ═══════════════════════════════════════════════════════════
    // COMMON ACTIONS
    // ═══════════════════════════════════════════════════════════

    async function processAll() {
        const stats = Queue.getStats();
        if (stats.pending === 0 && stats.errors === 0) {
            UI.showToast('No pending jobs to process', 'warning');
            return;
        }
        UI.showToast(`Processing ${stats.pending + stats.errors} animation${(stats.pending + stats.errors) > 1 ? 's' : ''}...`, 'info');
        await Queue.processAll();
    }

    function cancelProcessing() {
        Queue.cancelProcessing();
        UI.showToast('Processing cancelled', 'warning');
    }

    function removeJob(id) {
        Queue.removeJob(id);
    }

    function retryJob(id) {
        Queue.retryJob(id);
        Queue.processSingle(id);
    }

    async function downloadAllSheets() {
        if (completedJobs.length === 0) {
            UI.showToast('No completed results to download', 'warning');
            return;
        }

        UI.showToast('Downloading spritesheets...', 'info');

        for (let i = 0; i < completedJobs.length; i++) {
            const job = completedJobs[i];
            if (job.result && job.result.spritesheet_url) {
                try {
                    const response = await fetch(job.result.spritesheet_url);
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `spritesheet_${job.settings.motion_prompt.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}_${i + 1}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (err) {
                    UI.showToast(`Failed to download sheet ${i + 1}`, 'error');
                }
            }
        }
    }

    async function downloadFrames(jobId) {
        const job = Queue.getAll().find(j => j.id === jobId);
        if (!job || !job.result) return;

        const r = job.result;

        // If API provided individual frames, use them
        if (r.individual_frame_urls && r.individual_frame_urls.length > 0) {
            UI.showToast(`Downloading ${r.individual_frame_urls.length} frames...`, 'info');
            r.individual_frame_urls.forEach((url, i) => {
                const a = document.createElement('a');
                a.href = url;
                a.download = `frame_${job.settings.motion_prompt.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}_${i + 1}.png`;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });
            return;
        }

        // Otherwise, slice the spritesheet on the client side
        if (r.spritesheet_url && r.num_cols && r.num_rows && r.num_frames) {
            UI.showToast(`Extracting ${r.num_frames} frames from spritesheet...`, 'info');
            try {
                // Load spritesheet image
                const img = new Image();
                img.crossOrigin = 'anonymous'; // Required to read canvas data from external URL

                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = r.spritesheet_url;
                });

                const frameWidth = img.width / r.num_cols;
                const frameHeight = img.height / r.num_rows;

                const canvas = document.createElement('canvas');
                canvas.width = frameWidth;
                canvas.height = frameHeight;
                const ctx = canvas.getContext('2d');

                let frameCount = 0;
                for (let row = 0; row < r.num_rows; row++) {
                    for (let col = 0; col < r.num_cols; col++) {
                        if (frameCount >= r.num_frames) break;

                        ctx.clearRect(0, 0, frameWidth, frameHeight);
                        ctx.drawImage(
                            img,
                            col * frameWidth, row * frameHeight, frameWidth, frameHeight, // Source crop
                            0, 0, frameWidth, frameHeight // Destination canvas
                        );

                        // Convert to blob and download
                        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                        const url = URL.createObjectURL(blob);

                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `frame_${job.settings.motion_prompt.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}_${(frameCount + 1).toString().padStart(2, '0')}.png`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);

                        // Cleanup
                        setTimeout(() => URL.revokeObjectURL(url), 100);

                        frameCount++;
                    }
                }
                UI.showToast('Frames downloaded successfully', 'success');
            } catch (err) {
                console.error("Frame extraction error:", err);
                UI.showToast('Failed to slice frames from spritesheet', 'error');
            }
        } else {
            UI.showToast('No frame data available to download', 'warning');
        }
    }

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    return {
        init,
        removeUploadedImage,
        removeJob,
        retryJob,
        downloadFrames,
    };
})();

// ── Boot ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', App.init);

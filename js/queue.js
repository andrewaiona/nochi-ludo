/**
 * NOCHI LUDO — Queue Management System
 * Manages bulk animation jobs with status tracking and sequential processing
 */

const Queue = (() => {
    let jobs = [];
    let isProcessing = false;
    let onUpdate = null; // callback for UI updates
    let onJobComplete = null; // callback when a single job completes
    let onAllComplete = null; // callback when all jobs done

    const STORAGE_KEY = 'nochi_ludo_queue';

    /**
     * Generate a unique ID
     */
    function _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }

    /**
     * Save queue state to localStorage (without base64 images to save space)
     */
    function _persist() {
        try {
            const lightweight = jobs.map(j => ({
                ...j,
                imagePreview: j.imagePreview ? j.imagePreview.substring(0, 100) + '...' : null,
            }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweight));
        } catch (e) {
            // localStorage might be full; silently ignore
        }
    }

    /**
     * Notify the UI of queue changes
     */
    function _notify() {
        if (onUpdate) onUpdate(getAll(), getStats());
    }

    /**
     * Add a job to the queue
     * @param {Object} job
     * @param {string} job.image - base64 or URL of the sprite image
     * @param {string} job.imagePreview - small preview (data URI or URL)
     * @param {string} job.imageName - filename or URL label
     * @param {Object} job.settings - animation settings
     * @returns {string} - the job ID
     */
    function addJob(job) {
        const newJob = {
            id: _generateId(),
            image: job.image,
            imagePreview: job.imagePreview || job.image,
            imageName: job.imageName || 'Untitled',
            settings: { ...job.settings },
            status: 'pending', // pending | processing | done | error
            result: null,
            error: null,
            addedAt: Date.now(),
        };
        jobs.push(newJob);
        _persist();
        _notify();
        return newJob.id;
    }

    /**
     * Remove a job from the queue
     */
    function removeJob(id) {
        jobs = jobs.filter(j => j.id !== id);
        _persist();
        _notify();
    }

    /**
     * Clear all jobs (optionally only completed ones)
     */
    function clearJobs(onlyCompleted = false) {
        if (onlyCompleted) {
            jobs = jobs.filter(j => j.status !== 'done');
        } else {
            jobs = [];
        }
        _persist();
        _notify();
    }

    /**
     * Update a job's settings
     */
    function updateJobSettings(id, settings) {
        const job = jobs.find(j => j.id === id);
        if (job) {
            job.settings = { ...job.settings, ...settings };
            _persist();
            _notify();
        }
    }

    /**
     * Get all jobs
     */
    function getAll() {
        return [...jobs];
    }

    /**
     * Get queue statistics
     */
    function getStats() {
        const total = jobs.length;
        const pending = jobs.filter(j => j.status === 'pending').length;
        const processing = jobs.filter(j => j.status === 'processing').length;
        const done = jobs.filter(j => j.status === 'done').length;
        const errors = jobs.filter(j => j.status === 'error').length;
        return { total, pending, processing, done, errors };
    }

    /**
     * Process all pending jobs sequentially
     */
    async function processAll() {
        if (isProcessing) return;
        isProcessing = true;
        _notify();

        const pendingJobs = jobs.filter(j => j.status === 'pending' || j.status === 'error');

        for (const job of pendingJobs) {
            if (!isProcessing) break; // allow cancellation

            job.status = 'processing';
            job.error = null;
            _notify();

            try {
                const params = {
                    motion_prompt: job.settings.motion_prompt,
                    initial_image: job.image,
                    ...buildApiParams(job.settings),
                };

                const result = await LudoAPI.animateSprite(params);
                job.status = 'done';
                job.result = result;

                if (onJobComplete) onJobComplete(job);
            } catch (err) {
                job.status = 'error';
                job.error = err.message;
            }

            _persist();
            _notify();
        }

        isProcessing = false;
        _notify();
        if (onAllComplete) onAllComplete(getStats());
    }

    /**
     * Process a single job by ID
     */
    async function processSingle(id) {
        const job = jobs.find(j => j.id === id);
        if (!job || job.status === 'processing') return;

        job.status = 'processing';
        job.error = null;
        _notify();

        try {
            const params = {
                motion_prompt: job.settings.motion_prompt,
                initial_image: job.image,
                ...buildApiParams(job.settings),
            };

            const result = await LudoAPI.animateSprite(params);
            job.status = 'done';
            job.result = result;

            if (onJobComplete) onJobComplete(job);
        } catch (err) {
            job.status = 'error';
            job.error = err.message;
        }

        _persist();
        _notify();
    }

    /**
     * Build API params from settings, filtering out defaults/empty
     */
    function buildApiParams(settings) {
        const params = {};

        // String params — include if non-empty
        if (settings.final_image) params.final_image = settings.final_image;
        if (settings.model) params.model = settings.model;
        if (settings.image_type) params.image_type = settings.image_type;
        if (settings.margin_ratio_mode) params.margin_ratio_mode = settings.margin_ratio_mode;
        if (settings.pixel_art_filter && settings.pixel_art_filter !== 'none') {
            params.pixel_art_filter = settings.pixel_art_filter;
        }

        // Numeric params — parse explicitly, include even if 0
        if (settings.frames !== undefined && settings.frames !== '') {
            params.frames = parseInt(settings.frames, 10);
        }
        if (settings.frame_size !== undefined && settings.frame_size !== '') {
            params.frame_size = parseInt(settings.frame_size, 10);
        }
        if (settings.duration !== undefined && settings.duration !== '') {
            params.duration = parseFloat(settings.duration);
        }
        if (settings.margin_ratio !== undefined && settings.margin_ratio !== '') {
            params.margin_ratio = parseFloat(settings.margin_ratio);
        }

        // Boolean params — include if defined
        if (settings.loop !== undefined) params.loop = settings.loop;
        if (settings.crop !== undefined) params.crop = settings.crop;
        if (settings.augment_prompt !== undefined) params.augment_prompt = settings.augment_prompt;
        if (settings.gif !== undefined) params.gif = settings.gif;
        params.individual_frames = true; // Always request individual frames
        if (settings.spritesheet_with_background !== undefined) {
            params.spritesheet_with_background = settings.spritesheet_with_background;
        }

        console.log('📤 API params:', JSON.stringify(params, null, 2));
        return params;
    }

    /**
     * Cancel processing
     */
    function cancelProcessing() {
        isProcessing = false;
    }

    /**
     * Retry a failed job
     */
    function retryJob(id) {
        const job = jobs.find(j => j.id === id);
        if (job && job.status === 'error') {
            job.status = 'pending';
            job.error = null;
            _persist();
            _notify();
        }
    }

    /**
     * Check if queue is currently processing
     */
    function getIsProcessing() {
        return isProcessing;
    }

    /**
     * Set event callbacks
     */
    function on(event, callback) {
        switch (event) {
            case 'update': onUpdate = callback; break;
            case 'jobComplete': onJobComplete = callback; break;
            case 'allComplete': onAllComplete = callback; break;
        }
    }

    return {
        addJob,
        removeJob,
        clearJobs,
        updateJobSettings,
        getAll,
        getStats,
        processAll,
        processSingle,
        cancelProcessing,
        retryJob,
        getIsProcessing,
        on,
    };
})();

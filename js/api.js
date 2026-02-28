/**
 * NOCHI LUDO — Ludo.ai API Integration Layer
 * Handles all communication with the Ludo.ai Spritesheet API
 */

const LudoAPI = (() => {
  const BASE_URL = 'https://api.ludo.ai/api';
  let API_KEY = '69a394c3-9808-4884-8055-41f59e0d9f97';

  function setApiKey(key) {
    API_KEY = key;
  }

  function getApiKey() {
    return API_KEY;
  }

  async function _request(method, endpoint, body = null, retries = 2) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
      'Authorization': `ApiKey ${API_KEY}`,
      'Content-Type': 'application/json',
    };

    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, options);

        // If 500/502/503, retry after a delay
        if (response.status >= 500 && attempt < retries) {
          const delay = (attempt + 1) * 3000;
          console.warn(`⚠️ API returned ${response.status}, retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${retries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        let data;
        try {
          data = await response.json();
        } catch (e) {
          throw new Error(`API Error (${response.status}): non-JSON response`);
        }

        if (!response.ok) {
          const errorMsg = data?.message || data?.error || JSON.stringify(data) || `API Error (${response.status})`;
          console.error('❌ API error response:', data);
          throw new Error(errorMsg);
        }

        return data;
      } catch (err) {
        if (attempt < retries && err.message.includes('fetch')) {
          const delay = (attempt + 1) * 3000;
          console.warn(`⚠️ Network error, retrying in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Convert a File object to a base64 data URI
   */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }



  /**
   * Check if a string is a URL
   */
  function isUrl(str) {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * animateSprite — Generate an animated spritesheet from a sprite image
   * @param {Object} params
   * @param {string} params.motion_prompt - Animation description
   * @param {string} params.initial_image - URL or base64 of starting frame
   * @param {string} [params.final_image] - URL or base64 of ending frame
   * @param {boolean} [params.loop=true]
   * @param {boolean} [params.crop]
   * @param {number} [params.frames=36] - 4|9|16|25|36|49|64
   * @param {number} [params.frame_size=256] - 64|128|256|0
   * @param {number} [params.margin_ratio]
   * @param {string} [params.margin_ratio_mode='auto']
   * @param {string} [params.pixel_art_filter]
   * @param {string} [params.image_type]
   * @param {string} [params.model='standard']
   * @param {number} [params.duration]
   * @param {boolean} [params.augment_prompt=true]
   * @param {boolean} [params.gif=false]
   * @param {boolean} [params.individual_frames=false]
   * @param {boolean} [params.spritesheet_with_background=false]
   * @returns {Promise<Object>} - { spritesheet_url, video_url, gif_url, ... }
   */
  async function animateSprite(params) {
    // Build request body, only including non-undefined values
    const body = {};
    const allowedKeys = [
      'motion_prompt', 'initial_image', 'final_image', 'loop', 'crop',
      'frames', 'frame_size', 'margin_ratio', 'margin_ratio_mode',
      'pixel_art_filter', 'image_type', 'model', 'duration',
      'augment_prompt', 'gif', 'individual_frames', 'spritesheet_with_background'
    ];

    for (const key of allowedKeys) {
      if (params[key] !== undefined && params[key] !== '' && params[key] !== null) {
        body[key] = params[key];
      }
    }

    return _request('POST', '/assets/sprite/animate', body);
  }

  /**
   * generatePose — Generate a new pose for an existing sprite
   * @param {Object} params
   * @param {string} params.image - URL or base64
   * @param {string} params.pose - Target pose
   * @param {string} [params.description]
   * @param {number} [params.n=1] - Number of variations (1-4)
   * @param {boolean} [params.augment_prompt=true]
   * @returns {Promise<Array>} - [{ url, pose, description, motion_prompt }]
   */
  async function generatePose(params) {
    const body = {};
    const allowedKeys = ['image', 'pose', 'description', 'n', 'augment_prompt'];

    for (const key of allowedKeys) {
      if (params[key] !== undefined && params[key] !== '' && params[key] !== null) {
        body[key] = params[key];
      }
    }

    return _request('POST', '/assets/sprite/pose', body);
  }

  /**
   * transferMotion — Transfer motion from a video onto a static sprite
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  async function transferMotion(params) {
    const body = {};
    const allowedKeys = [
      'image', 'video', 'preset_id', 'direction', 'perspective',
      'frames', 'frame_size', 'loop', 'crop', 'pixel_art_filter',
      'margin_ratio', 'margin_ratio_mode', 'gif', 'individual_frames',
      'spritesheet_with_background'
    ];

    for (const key of allowedKeys) {
      if (params[key] !== undefined && params[key] !== '' && params[key] !== null) {
        body[key] = params[key];
      }
    }

    return _request('POST', '/assets/sprite/transfer-motion', body);
  }

  /**
   * listAnimationPresets — Fetch available animation presets
   * @returns {Promise<Object>} - { animations, perspectives, directions }
   */
  async function listAnimationPresets() {
    return _request('GET', '/assets/sprite/animation-presets');
  }

  return {
    setApiKey,
    getApiKey,
    animateSprite,
    generatePose,
    transferMotion,
    listAnimationPresets,
    fileToBase64,
    isUrl,
  };
})();

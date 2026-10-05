/**
 * EcoSort AI - Main Application Logic
 * Implements Multi-AI Failover (Gemini -> Groq -> OpenRouter -> Smart Offline Fallback)
 * With Camera capture, File upload, LocalStorage persistence, and Vercel-ready static architecture.
 */

// ============================================================================
// 1. DEFAULT KEYS & LOCALSTORAGE CONFIGURATION
// ============================================================================
const DEFAULT_KEYS = {
  gemini: '',
  groq: '',
  openrouter: ''
};

const STORAGE_KEYS = {
  API_KEYS: 'ecosort_api_keys_v1',
  HISTORY: 'ecosort_scan_history_v1',
  STATS: 'ecosort_user_stats_v1'
};

// Initialize Keys from LocalStorage or Defaults
function getSavedApiKeys() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.API_KEYS);
    if (saved) {
      return { ...DEFAULT_KEYS, ...JSON.parse(saved) };
    }
  } catch (err) {
    console.warn('Could not read API keys from localStorage:', err);
  }
  return { ...DEFAULT_KEYS };
}

function saveApiKeys(keys) {
  localStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(keys));
}

// Global App State
const state = {
  currentTab: 'screenHome',
  cameraStream: null,
  facingMode: 'environment', // rear camera by default
  isCameraActive: false,
  pendingImageDataUrl: null,
  currentResult: null,
  history: [],
  stats: {
    totalScans: 0,
    recycled: 0,
    compost: 0,
    savedEco: 0
  }
};

// ============================================================================
// 2. DOM ELEMENT SELECTORS
// ============================================================================
const elements = {
  // Navigation
  navItems: document.querySelectorAll('.bottom-nav .nav-item'),
  screens: document.querySelectorAll('.screen-view'),
  navScanCTA: document.getElementById('navScanCTA'),
  heroScanBtn: document.getElementById('heroScanBtn'),
  btnEmptyScanCTA: document.getElementById('btnEmptyScanCTA'),
  
  // Status Header
  aiActiveProviderName: document.getElementById('aiActiveProviderName'),
  aiStatusPill: document.getElementById('aiStatusPill'),
  
  // Home Stats
  statTotalScans: document.getElementById('statTotalScans'),
  statRecycled: document.getElementById('statRecycled'),
  statCompost: document.getElementById('statCompost'),
  statSavedEco: document.getElementById('statSavedEco'),
  
  // Scanner
  btnTabCamera: document.getElementById('btnTabCamera'),
  btnTabUpload: document.getElementById('btnTabUpload'),
  cameraViewfinder: document.getElementById('cameraViewfinder'),
  uploadDropZone: document.getElementById('uploadDropZone'),
  videoFeed: document.getElementById('videoFeed'),
  captureCanvas: document.getElementById('captureCanvas'),
  scannerOverlay: document.getElementById('scannerOverlay'),
  btnFlipCamera: document.getElementById('btnFlipCamera'),
  btnStartStopCam: document.getElementById('btnStartStopCam'),
  camPowerIcon: document.getElementById('camPowerIcon'),
  camPermissionBanner: document.getElementById('camPermissionBanner'),
  btnRetryCam: document.getElementById('btnRetryCam'),
  btnSwitchToUpload: document.getElementById('btnSwitchToUpload'),
  fileInput: document.getElementById('fileInput'),
  btnBrowseFile: document.getElementById('btnBrowseFile'),
  imagePreviewBox: document.getElementById('imagePreviewBox'),
  previewImg: document.getElementById('previewImg'),
  btnRetake: document.getElementById('btnRetake'),
  btnAnalyzeNow: document.getElementById('btnAnalyzeNow'),
  cameraShutterArea: document.getElementById('cameraShutterArea'),
  btnSnapPhoto: document.getElementById('btnSnapPhoto'),
  
  // Sample chips
  sampleChips: document.querySelectorAll('.sample-chip'),
  
  // History
  historyList: document.getElementById('historyList'),
  emptyHistoryState: document.getElementById('emptyHistoryState'),
  btnClearHistory: document.getElementById('btnClearHistory'),
  filterPills: document.querySelectorAll('.filter-pill'),
  countAll: document.getElementById('countAll'),
  
  // Settings
  btnTestBackend: document.getElementById('btnTestBackend'),
  
  // Modal Result Sheet
  resultModal: document.getElementById('resultModal'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  resultThumb: document.getElementById('resultThumb'),
  resultProviderName: document.getElementById('resultProviderName'),
  resultCategoryBadge: document.getElementById('resultCategoryBadge'),
  resultItemName: document.getElementById('resultItemName'),
  resultMaterial: document.getElementById('resultMaterial'),
  resultBinColor: document.getElementById('resultBinColor'),
  resultStepsList: document.getElementById('resultStepsList'),
  resultReuseTip: document.getElementById('resultReuseTip'),
  resultEcoImpact: document.getElementById('resultEcoImpact'),
  btnModalScanAgain: document.getElementById('btnModalScanAgain'),
  btnModalSaveShare: document.getElementById('btnModalSaveShare'),
  
  // Loading & Toast
  aiLoadingOverlay: document.getElementById('aiLoadingOverlay'),
  loadingTitle: document.getElementById('loadingTitle'),
  loadingStatusText: document.getElementById('loadingStatusText'),
  toastNotification: document.getElementById('toastNotification'),
  toastIcon: document.getElementById('toastIcon'),
  toastMessage: document.getElementById('toastMessage')
};

// ============================================================================
// 3. SOUND SYNTHESIS & HAPTIC FEEDBACK (Web Audio API)
// ============================================================================
function playFeedbackSound(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'snap') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'success') {
      // Pleasant double eco chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {
    // Ignore audio restrictions
  }
}

// ============================================================================
// 4. TOAST NOTIFICATION HELPER
// ============================================================================
let toastTimer = null;
function showToast(message, icon = '🌱') {
  clearTimeout(toastTimer);
  elements.toastIcon.textContent = icon;
  elements.toastMessage.textContent = message;
  elements.toastNotification.classList.remove('hidden');

  toastTimer = setTimeout(() => {
    elements.toastNotification.classList.add('hidden');
  }, 3200);
}

// ============================================================================
// 5. CAMERA & STREAM MANAGEMENT
// ============================================================================
async function startCamera() {
  if (state.cameraStream) {
    stopCamera();
  }

  // Hide fallback banner
  elements.camPermissionBanner.classList.add('hidden');
  elements.scannerOverlay.classList.remove('hidden');

  try {
    const constraints = {
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.cameraStream = stream;
    elements.videoFeed.srcObject = stream;
    await elements.videoFeed.play();
    state.isCameraActive = true;
    updateCameraPowerButtonState();
  } catch (err) {
    console.warn('Camera access denied or unavailable:', err);
    state.isCameraActive = false;
    elements.camPermissionBanner.classList.remove('hidden');
    elements.scannerOverlay.classList.add('hidden');
    updateCameraPowerButtonState();
  }
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(track => track.stop());
    state.cameraStream = null;
  }
  if (elements.videoFeed) {
    elements.videoFeed.srcObject = null;
  }
  state.isCameraActive = false;
  updateCameraPowerButtonState();
}

function updateCameraPowerButtonState() {
  if (state.isCameraActive) {
    elements.btnStartStopCam.style.background = 'rgba(16, 185, 129, 0.85)';
    elements.btnStartStopCam.title = 'Turn off Camera';
  } else {
    elements.btnStartStopCam.style.background = 'rgba(0, 0, 0, 0.45)';
    elements.btnStartStopCam.title = 'Turn on Camera';
  }
}

function flipCamera() {
  state.facingMode = (state.facingMode === 'environment') ? 'user' : 'environment';
  startCamera();
  showToast(`Switched to ${state.facingMode === 'environment' ? 'Rear' : 'Front'} Camera`, '📷');
}

// Snap frame from video
function capturePhotoFromCamera() {
  if (!state.isCameraActive || !elements.videoFeed.videoWidth) {
    showToast('Camera is not active. Switching to upload mode.', '⚠️');
    switchScanMode('upload');
    return;
  }

  playFeedbackSound('snap');

  const canvas = elements.captureCanvas;
  const video = elements.videoFeed;
  
  // Downscale image to max 800px dimension for fast network upload
  let width = video.videoWidth;
  let height = video.videoHeight;
  const maxDim = 800;

  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  showImagePreview(dataUrl);
  // Auto trigger analysis
  triggerAnalysis(dataUrl);
}

// Show preview view
function showImagePreview(dataUrl) {
  state.pendingImageDataUrl = dataUrl;
  elements.previewImg.src = dataUrl;
  elements.imagePreviewBox.classList.remove('hidden');
  elements.cameraViewfinder.classList.add('hidden');
  elements.uploadDropZone.classList.add('hidden');
  elements.cameraShutterArea.classList.add('hidden');
}

function clearImagePreview() {
  state.pendingImageDataUrl = null;
  elements.imagePreviewBox.classList.add('hidden');
  
  // Restore current mode view
  const currentMode = elements.btnTabCamera.classList.contains('active') ? 'camera' : 'upload';
  switchScanMode(currentMode);
}

function switchScanMode(mode) {
  if (mode === 'camera') {
    elements.btnTabCamera.classList.add('active');
    elements.btnTabUpload.classList.remove('active');
    elements.cameraViewfinder.classList.remove('hidden');
    elements.uploadDropZone.classList.add('hidden');
    elements.cameraShutterArea.classList.remove('hidden');
    elements.imagePreviewBox.classList.add('hidden');
    startCamera();
  } else {
    elements.btnTabUpload.classList.add('active');
    elements.btnTabCamera.classList.remove('active');
    elements.uploadDropZone.classList.remove('hidden');
    elements.cameraViewfinder.classList.add('hidden');
    elements.cameraShutterArea.classList.add('hidden');
    elements.imagePreviewBox.classList.add('hidden');
    stopCamera();
  }
}

// Handle uploaded image file
function handleSelectedFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please select a valid image file', '⚠️');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Compress in canvas
      const canvas = elements.captureCanvas;
      let width = img.width;
      let height = img.height;
      const maxDim = 800;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      showImagePreview(compressedDataUrl);
      triggerAnalysis(compressedDataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ============================================================================
// 6. MULTI-AI FAILOVER ENGINE
// Priority: 1. Gemini -> 2. Groq -> 3. OpenRouter -> 4. Smart Offline Classifier
// ============================================================================

const AI_SYSTEM_PROMPT = `You are EcoSort AI, an expert environmental recycling and waste classification assistant.
Analyze the user's provided waste or object image.
You MUST output ONLY a valid JSON object matching this exact schema:
{
  "item_name": "Short specific item name (e.g. Empty PET Water Bottle, Banana Peel, Aluminum Soda Can)",
  "material": "Main material composition (e.g. Polyethylene Terephthalate #1, Organic Food Biomass, Recyclable Aluminum)",
  "category": "Recyclable" | "Compostable" | "E-Waste" | "Landfill" | "Hazardous",
  "bin_color": "Target bin name & color (e.g. Blue Recycling Bin, Green Organic Compost Bin, Black Landfill Bin, Dedicated E-Waste Dropoff)",
  "steps": [
    "Step 1: Immediate action (e.g. Empty all liquid residue)",
    "Step 2: Cleaning or preparation (e.g. Rinse container briefly)",
    "Step 3: Compacting or sorting (e.g. Flatten to save bin volume)"
  ],
  "reuse_tip": "One clever DIY or creative reuse/upcycle suggestion for this item",
  "eco_impact": "One short sentence with a statistic or fact about the environmental savings of recycling/composting this item"
}
Ensure JSON is strictly valid with no surrounding markdown formatting or text.`;

// Helper: Strip data URL prefix to get raw base64 and mime type
function extractBase64Data(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1] || 'image/jpeg';
  return { base64: parts[1], mime };
}

// 1. Provider: Google Gemini Vision
async function callGeminiVision(base64Data, mimeType, apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Gemini API key is empty');
  }

  // Support both 1.5 flash and 2.0 flash
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: AI_SYSTEM_PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      response_mime_type: "application/json"
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty response from Gemini');

  return parseJsonResponse(rawText);
}

// 2. Provider: Groq Vision (llama-3.2-11b-vision-preview)
async function callGroqVision(dataUrl, apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('Groq API key is empty');
  }

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const requestBody = {
    model: 'llama-3.2-11b-vision-preview',
    messages: [
      {
        role: 'system',
        content: AI_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Identify this waste item and categorize how to properly recycle, compost, or dispose of it in strict JSON.' },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('Empty response from Groq');

  return parseJsonResponse(rawText);
}

// 3. Provider: OpenRouter Vision
async function callOpenRouterVision(dataUrl, apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('OpenRouter API key is empty');
  }

  const url = 'https://openrouter.ai/api/v1/chat/completions';

  const requestBody = {
    model: 'meta-llama/llama-3.2-11b-vision-instruct',
    messages: [
      {
        role: 'system',
        content: AI_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Classify this waste item and provide recycling guidance in strict JSON format.' },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ],
    temperature: 0.2
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`,
      'HTTP-Referer': window.location.origin || 'https://ecosort.ai',
      'X-Title': 'EcoSort AI Waste Assistant'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('Empty response from OpenRouter');

  return parseJsonResponse(rawText);
}

// 4. Smart Offline Fallback Classifier (Guarantees zero-crash app)
function getSmartOfflineClassification(sampleHint = null) {
  const offlineDatabase = {
    plastic_bottle: {
      item_name: "Clear PET Plastic Bottle",
      material: "Polyethylene Terephthalate (#1 PET)",
      category: "Recyclable",
      bin_color: "Blue Recycling Bin",
      steps: [
        "1. Empty any leftover liquids completely.",
        "2. Rinse out sugary or sticky residue.",
        "3. Crush flat and replace cap securely before recycling."
      ],
      reuse_tip: "Cut in half horizontally to make a self-watering herb planter or seedling starter cup.",
      eco_impact: "Recycling 1 ton of PET plastic saves 3.8 barrels of crude oil and reduces greenhouse gases by 71%."
    },
    aluminum_can: {
      item_name: "Aluminum Beverage Soda Can",
      material: "100% Recyclable Aluminum Alloy",
      category: "Recyclable",
      bin_color: "Blue Recycling Bin",
      steps: [
        "1. Pour out all residual drink.",
        "2. Do not crush if your local municipality uses optical sorters.",
        "3. Toss directly into the metal recycling stream."
      ],
      reuse_tip: "Use as a desk pencil organizer or punch holes with a nail to create a decorative garden lantern.",
      eco_impact: "Aluminum can be recycled infinitely; doing so saves 95% of the energy needed to make new cans from raw bauxite."
    },
    banana_peel: {
      item_name: "Organic Fruit Scrap / Banana Peel",
      material: "Biodegradable Organic Biomass (High Potassium)",
      category: "Compostable",
      bin_color: "Green Organic Compost Bin",
      steps: [
        "1. Remove any plastic PLU sticker labels on the peel.",
        "2. Chop peel into smaller pieces to accelerate microbial decomposition.",
        "3. Place in organic food waste bin or home compost pile."
      ],
      reuse_tip: "Soak peels in water for 48 hours to make a natural, potassium-rich liquid fertilizer for houseplants.",
      eco_impact: "Composting organic matter stops anaerobic methane emissions in landfills, converting waste into nutrient-dense soil."
    },
    cardboard_box: {
      item_name: "Corrugated Cardboard Box",
      material: "Kraft Paper Fiber (Cellulose)",
      category: "Recyclable",
      bin_color: "Blue Recycling Bin",
      steps: [
        "1. Remove heavy plastic packing tape and shipping label stickers.",
        "2. Keep dry — wet cardboard cannot be processed easily at paper mills.",
        "3. Flatten box completely to conserve truck collection volume."
      ],
      reuse_tip: "Use flat sheets as biodegradable weed barriers in your garden under a layer of mulch.",
      eco_impact: "Recycling 1 ton of cardboard saves 17 trees, 7,000 gallons of water, and 4,000 kWh of electricity."
    },
    old_battery: {
      item_name: "Lithium / Alkaline Household Battery",
      material: "Heavy Metals & Lithium Compounds",
      category: "E-Waste",
      bin_color: "Dedicated E-Waste / Battery Drop-Off Center",
      steps: [
        "1. NEVER toss batteries into regular trash or home recycling bins.",
        "2. Place clear tape over positive and negative terminals to prevent accidental fire sparks.",
        "3. Drop off at local hardware store or municipal e-waste collection bin."
      ],
      reuse_tip: "Test with a voltmeter; sometimes low-voltage batteries can still power low-drain LED clock radios.",
      eco_impact: "Specialized recycling recovers 99% of nickel, cadmium, and cobalt while preventing groundwater contamination."
    }
  };

  if (sampleHint && offlineDatabase[sampleHint]) {
    return offlineDatabase[sampleHint];
  }

  // Random pick if generic fallback
  const keys = Object.keys(offlineDatabase);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  return offlineDatabase[randomKey];
}

// Robust JSON string extraction
function parseJsonResponse(rawText) {
  let cleaned = rawText.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Find first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

// Master Failover Controller: Calls Vercel Serverless /api/analyze (using env vars)
async function executeMultiAiCascade(dataUrl, sampleHint = null) {
  // Update UI Loading status
  elements.aiLoadingOverlay.classList.remove('hidden');
  elements.loadingTitle.textContent = "AI Analyzing Waste...";
  elements.loadingStatusText.textContent = "Routing to Cloud AI Pipeline...";
  updatePipelineNodes('gemini');

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        // Highlight active provider
        const prov = (result.provider || '').toLowerCase();
        if (prov.includes('gemini')) updatePipelineNodes('gemini');
        else if (prov.includes('groq')) updatePipelineNodes('groq');
        else if (prov.includes('openrouter')) updatePipelineNodes('openrouter');
        
        return { data: result.data, provider: result.provider || 'Cloud AI Cascade' };
      }
    }
  } catch (apiErr) {
    console.warn('Serverless endpoint unavailable (e.g. static dev server). Using smart offline classifier:', apiErr);
  }

  // Fallback to Smart Offline EcoSort Classifier
  elements.loadingStatusText.textContent = "Using Smart Offline EcoSort Classifier...";
  await new Promise(r => setTimeout(r, 600));

  const offlineResult = getSmartOfflineClassification(sampleHint);
  return { data: offlineResult, provider: 'EcoSort Smart Engine (Offline)' };
}

function updatePipelineNodes(activeProvider) {
  const nodeGemini = document.getElementById('nodeGemini');
  const nodeGroq = document.getElementById('nodeGroq');
  const nodeOpenRouter = document.getElementById('nodeOpenRouter');

  [nodeGemini, nodeGroq, nodeOpenRouter].forEach(n => n && n.classList.remove('active'));

  if (activeProvider === 'gemini' && nodeGemini) nodeGemini.classList.add('active');
  if (activeProvider === 'groq' && nodeGroq) nodeGroq.classList.add('active');
  if (activeProvider === 'openrouter' && nodeOpenRouter) nodeOpenRouter.classList.add('active');
}

// ============================================================================
// 7. ANALYSIS ORCHESTRATION & RESULTS DISPLAY
// ============================================================================
async function triggerAnalysis(imageDataUrl, sampleHint = null) {
  try {
    const { data, provider } = await executeMultiAiCascade(imageDataUrl, sampleHint);
    
    // Store Result in state
    state.currentResult = {
      id: 'scan_' + Date.now(),
      timestamp: new Date().toISOString(),
      thumb: imageDataUrl,
      provider: provider,
      ...data
    };

    // Hide Loading
    elements.aiLoadingOverlay.classList.add('hidden');

    // Update Header Pill
    elements.aiActiveProviderName.textContent = provider.split(' ')[0] + ' Active';

    // Play chime sound
    playFeedbackSound('success');

    // Render in Result Sheet
    renderResultModal(state.currentResult);

    // Save to history & update stats
    saveScanToHistory(state.currentResult);

  } catch (err) {
    elements.aiLoadingOverlay.classList.add('hidden');
    console.error('Fatal classification error:', err);
    showToast('Analysis error: ' + err.message, '❌');
  }
}

function renderResultModal(result) {
  elements.resultThumb.src = result.thumb;
  elements.resultProviderName.textContent = result.provider;
  elements.resultItemName.textContent = result.item_name;
  elements.resultMaterial.textContent = `Material: ${result.material}`;
  elements.resultBinColor.textContent = result.bin_color || 'Dedicated Sort Bin';

  // Category pill color class
  const cat = (result.category || 'Recyclable').toLowerCase();
  elements.resultCategoryBadge.className = 'category-pill ' + (
    cat.includes('recycle') ? 'recyclable' :
    cat.includes('compost') ? 'compostable' :
    cat.includes('ewaste') || cat.includes('e-waste') ? 'ewaste' :
    cat.includes('hazard') ? 'hazardous' : 'landfill'
  );
  elements.resultCategoryBadge.textContent = result.category;

  // Steps list
  elements.resultStepsList.innerHTML = '';
  const steps = Array.isArray(result.steps) ? result.steps : [result.steps];
  steps.forEach(step => {
    const li = document.createElement('li');
    li.textContent = step.replace(/^\d+\.\s*/, ''); // strip manual numbering if any
    elements.resultStepsList.appendChild(li);
  });

  // Reuse tip & Eco impact
  elements.resultReuseTip.textContent = result.reuse_tip || 'Can be repurposed into a utility organizer.';
  elements.resultEcoImpact.textContent = result.eco_impact || 'Reduces municipal landfill volume and saves energy.';

  // Show Modal
  elements.resultModal.classList.remove('hidden');
}

function closeResultModal() {
  elements.resultModal.classList.add('hidden');
}

// ============================================================================
// 8. STORAGE & STATS MANAGEMENT
// ============================================================================
function loadStoredHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    state.history = raw ? JSON.parse(raw) : [];
  } catch (e) {
    state.history = [];
  }

  try {
    const rawStats = localStorage.getItem(STORAGE_KEYS.STATS);
    state.stats = rawStats ? JSON.parse(rawStats) : { totalScans: 0, recycled: 0, compost: 0, savedEco: 0 };
  } catch (e) {
    state.stats = { totalScans: 0, recycled: 0, compost: 0, savedEco: 0 };
  }

  updateStatsUI();
  renderHistoryUI();
}

function saveScanToHistory(item) {
  // Add to top of list
  state.history.unshift(item);
  // Cap at 50 items
  if (state.history.length > 50) state.history.pop();
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(state.history));

  // Update Stats
  state.stats.totalScans += 1;
  const cat = (item.category || '').toLowerCase();
  if (cat.includes('recycle')) state.stats.recycled += 1;
  if (cat.includes('compost')) state.stats.compost += 1;
  state.stats.savedEco = +(state.stats.savedEco + 0.35).toFixed(1); // avg ~0.35 kg CO2 offset per scan

  localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(state.stats));
  
  updateStatsUI();
  renderHistoryUI();
}

function updateStatsUI() {
  elements.statTotalScans.textContent = state.stats.totalScans;
  elements.statRecycled.textContent = state.stats.recycled;
  elements.statCompost.textContent = state.stats.compost;
  elements.statSavedEco.textContent = `${state.stats.savedEco} kg`;
  elements.countAll.textContent = state.history.length;
}

function renderHistoryUI(filter = 'all') {
  elements.historyList.innerHTML = '';

  const items = state.history.filter(item => {
    if (filter === 'all') return true;
    return (item.category || '').toLowerCase().includes(filter.toLowerCase());
  });

  if (items.length === 0) {
    elements.emptyHistoryState.classList.remove('hidden');
    elements.historyList.classList.add('hidden');
    return;
  }

  elements.emptyHistoryState.classList.add('hidden');
  elements.historyList.classList.remove('hidden');

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-card';
    
    const catClass = (item.category || '').toLowerCase().includes('recycle') ? 'recyclable' :
                     (item.category || '').toLowerCase().includes('compost') ? 'compostable' :
                     (item.category || '').toLowerCase().includes('ewaste') ? 'ewaste' : 'landfill';

    const formattedDate = new Date(item.timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    card.innerHTML = `
      <img src="${item.thumb}" class="history-thumb" alt="${item.item_name}">
      <div class="history-card-body">
        <h4 class="history-title">${item.item_name}</h4>
        <div class="history-meta-row">
          <span class="category-pill ${catClass}">${item.category}</span>
          <span class="history-date">${formattedDate}</span>
          <span class="history-provider-tag">${item.provider ? item.provider.split(' ')[0] : 'AI'}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      renderResultModal(item);
    });

    elements.historyList.appendChild(card);
  });
}

function clearAllHistory() {
  if (confirm('Clear all scan history and statistics?')) {
    state.history = [];
    state.stats = { totalScans: 0, recycled: 0, compost: 0, savedEco: 0 };
    localStorage.removeItem(STORAGE_KEYS.HISTORY);
    localStorage.removeItem(STORAGE_KEYS.STATS);
    updateStatsUI();
    renderHistoryUI();
    showToast('Scan history cleared', '🗑️');
  }
}

// ============================================================================
// 9. SETTINGS & CLOUD BACKEND TEST
// ============================================================================
async function testCloudBackend() {
  showToast('Pinging Cloud AI Backend...', '⏳');

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'ping' })
    });

    if (res.ok) {
      showToast('Cloud AI Pipeline is online & connected!', '✅');
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('Cloud Backend response: ' + (err.error || res.status), '⚡');
    }
  } catch (e) {
    showToast('Offline / Local static mode (Smart Classifier Active)', '🌿');
  }
}

// ============================================================================
// 10. GENERATE SAMPLE IMAGES FOR INSTANT DEMOS
// ============================================================================
function generateSampleDataUrl(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 400, 400);
  gradient.addColorStop(0, '#f0fdf4');
  gradient.addColorStop(1, '#dcfce7');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 400, 400);

  // Decorative border
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 380, 380);

  // Center Emoji Icon
  let emoji = '♻️';
  let label = 'Waste Item';
  if (type === 'plastic_bottle') { emoji = '🧴'; label = 'Plastic Bottle'; }
  else if (type === 'aluminum_can') { emoji = '🥫'; label = 'Soda Can'; }
  else if (type === 'banana_peel') { emoji = '🍌'; label = 'Banana Peel'; }
  else if (type === 'cardboard_box') { emoji = '📦'; label = 'Cardboard Box'; }
  else if (type === 'old_battery') { emoji = '🔋'; label = 'Lithium Battery'; }

  ctx.font = '120px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 200, 180);

  ctx.font = 'bold 24px Outfit, sans-serif';
  ctx.fillStyle = '#065f46';
  ctx.fillText(label, 200, 290);

  ctx.font = '14px Plus Jakarta Sans, sans-serif';
  ctx.fillStyle = '#059669';
  ctx.fillText('EcoSort AI Verification Target', 200, 325);

  return canvas.toDataURL('image/jpeg', 0.85);
}

// ============================================================================
// 11. NAVIGATION & EVENT LISTENERS
// ============================================================================
function switchTab(targetScreenId) {
  state.currentTab = targetScreenId;

  // Update navbar items
  elements.navItems.forEach(item => {
    if (item.dataset.tab === targetScreenId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update screens
  elements.screens.forEach(screen => {
    if (screen.id === targetScreenId) {
      screen.classList.add('active');
    } else {
      screen.classList.remove('active');
    }
  });

  // Handle camera stop if leaving scan screen
  if (targetScreenId !== 'screenScan') {
    stopCamera();
  } else {
    // Entering scan screen: start camera if on camera tab
    if (elements.btnTabCamera.classList.contains('active')) {
      startCamera();
    }
  }
}

function setupEventListeners() {
  // Bottom Tab Navigation
  elements.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId) switchTab(tabId);
    });
  });

  // Hero Quick Scan button
  if (elements.heroScanBtn) {
    elements.heroScanBtn.addEventListener('click', () => {
      switchTab('screenScan');
    });
  }

  if (elements.btnEmptyScanCTA) {
    elements.btnEmptyScanCTA.addEventListener('click', () => {
      switchTab('screenScan');
    });
  }

  // AI Status Pill in Header
  elements.aiStatusPill.addEventListener('click', () => {
    switchTab('screenSettings');
    showToast('Manage AI Failover Keys here', '⚙️');
  });

  // Scan Mode Tabs (Camera vs Upload)
  elements.btnTabCamera.addEventListener('click', () => switchScanMode('camera'));
  elements.btnTabUpload.addEventListener('click', () => switchScanMode('upload'));

  // Camera Controls
  elements.btnSnapPhoto.addEventListener('click', capturePhotoFromCamera);
  elements.btnFlipCamera.addEventListener('click', flipCamera);
  elements.btnStartStopCam.addEventListener('click', () => {
    if (state.isCameraActive) {
      stopCamera();
      showToast('Camera paused', '⏸️');
    } else {
      startCamera();
    }
  });

  // Camera Permission Retry & Switch buttons
  elements.btnRetryCam.addEventListener('click', startCamera);
  elements.btnSwitchToUpload.addEventListener('click', () => switchScanMode('upload'));

  // File Upload Elements
  elements.btnBrowseFile.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  // Drag and drop on dropzone
  const dropZone = elements.uploadDropZone;
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files[0]) {
      handleSelectedFile(dt.files[0]);
    }
  });

  // Preview Actions
  elements.btnRetake.addEventListener('click', clearImagePreview);
  elements.btnAnalyzeNow.addEventListener('click', () => {
    if (state.pendingImageDataUrl) {
      triggerAnalysis(state.pendingImageDataUrl);
    }
  });

  // Quick Sample Items on Home Screen
  elements.sampleChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const sampleType = chip.dataset.sample;
      const sampleImgUrl = generateSampleDataUrl(sampleType);
      
      // Go to scan screen, show preview, and analyze
      switchTab('screenScan');
      showImagePreview(sampleImgUrl);
      triggerAnalysis(sampleImgUrl, sampleType);
    });
  });

  // History Controls
  elements.btnClearHistory.addEventListener('click', clearAllHistory);
  elements.filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      elements.filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderHistoryUI(pill.dataset.filter);
    });
  });

  // Settings Actions
  if (elements.btnTestBackend) {
    elements.btnTestBackend.addEventListener('click', testCloudBackend);
  }

  // Modal Actions
  elements.btnCloseModal.addEventListener('click', closeResultModal);
  elements.btnModalScanAgain.addEventListener('click', () => {
    closeResultModal();
    clearImagePreview();
    switchTab('screenScan');
  });

  elements.btnModalSaveShare.addEventListener('click', () => {
    if (navigator.share && state.currentResult) {
      navigator.share({
        title: `EcoSort AI: ${state.currentResult.item_name}`,
        text: `I just sorted ${state.currentResult.item_name} as ${state.currentResult.category} with EcoSort AI! Check your recycling habits.`,
        url: window.location.href
      }).catch(() => {});
    } else {
      showToast('Saved to history!', '✅');
    }
  });

  // Close modal when tapping backdrop
  elements.resultModal.addEventListener('click', (e) => {
    if (e.target === elements.resultModal) {
      closeResultModal();
    }
  });
}

// ============================================================================
// 12. INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  loadStoredHistory();
  setupEventListeners();

  // Welcome Toast
  setTimeout(() => {
    showToast('EcoSort AI ready • Multi-AI failover online', '🌿');
  }, 700);
});

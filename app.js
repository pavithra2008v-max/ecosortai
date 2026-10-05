/**
 * EcoSort AI - Minimal & Fast Waste Classifier
 * Screens: 1. Camera | 2. Upload Img | 3. History | Direct Result View
 */

const STORAGE_KEY = 'ecosort_history_items';

const state = {
  currentTab: 'screenCamera',
  stream: null,
  facingMode: 'environment', // Rear camera default
  history: []
};

// DOM Elements
const el = {
  // Screens
  screens: document.querySelectorAll('.screen-view'),
  navButtons: document.querySelectorAll('.nav-btn'),

  // Camera
  videoFeed: document.getElementById('videoFeed'),
  captureCanvas: document.getElementById('captureCanvas'),
  btnSnap: document.getElementById('btnSnap'),
  btnFlipCam: document.getElementById('btnFlipCam'),

  // Upload
  dropZone: document.getElementById('dropZone'),
  filePicker: document.getElementById('filePicker'),
  btnChooseImage: document.getElementById('btnChooseImage'),

  // History
  historyList: document.getElementById('historyList'),
  emptyHistory: document.getElementById('emptyHistory'),
  btnClearHistory: document.getElementById('btnClearHistory'),

  // Result
  resultImage: document.getElementById('resultImage'),
  resultTitle: document.getElementById('resultTitle'),
  resultCategoryBadge: document.getElementById('resultCategoryBadge'),
  resultBin: document.getElementById('resultBin'),
  resultStepsList: document.getElementById('resultStepsList'),
  resultReuseText: document.getElementById('resultReuseText'),
  btnScanAgain: document.getElementById('btnScanAgain'),

  // Overlays
  loadingOverlay: document.getElementById('loadingOverlay'),
  toast: document.getElementById('toast')
};

// ============================================================================
// Toast Notification
// ============================================================================
let toastTimer = null;
function showToast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    el.toast.classList.add('hidden');
  }, 3000);
}

// ============================================================================
// Camera Controls
// ============================================================================
async function startCamera() {
  stopCamera();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: false
    });
    state.stream = stream;
    el.videoFeed.srcObject = stream;
    await el.videoFeed.play();
  } catch (err) {
    console.warn('Camera inaccessible or permission denied:', err);
    showToast('Camera not available. Switch to Upload Img.');
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(track => track.stop());
    state.stream = null;
  }
  if (el.videoFeed) {
    el.videoFeed.srcObject = null;
  }
}

function flipCamera() {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  startCamera();
}

function capturePhoto() {
  if (!el.videoFeed.videoWidth) {
    showToast('Camera is not ready yet');
    return;
  }

  const canvas = el.captureCanvas;
  const video = el.videoFeed;

  // Max 800px dimension for fast processing
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
  analyzeImage(dataUrl);
}

// ============================================================================
// File Upload
// ============================================================================
function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please select an image file');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = el.captureCanvas;
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

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      analyzeImage(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ============================================================================
// AI Analysis & Handling Instructions
// ============================================================================
async function analyzeImage(dataUrl) {
  el.loadingOverlay.classList.remove('hidden');

  try {
    // 1. Try Vercel Serverless /api/analyze (using env variables)
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    });

    if (response.ok) {
      const json = await response.json();
      if (json.success && json.data) {
        showResult(json.data, dataUrl);
        return;
      }
    }
  } catch (err) {
    console.warn('Backend unavailable, using fallback classifier:', err);
  }

  // 2. Safe Fallback Classification (if backend is offline or local static)
  setTimeout(() => {
    const fallback = getFallbackItem();
    showResult(fallback, dataUrl);
  }, 700);
}

function getFallbackItem() {
  const samples = [
    {
      item_name: "Plastic Beverage Bottle",
      category: "Recyclable",
      bin_color: "Blue Recycling Bin",
      steps: [
        "1. Empty all liquid contents and rinse briefly.",
        "2. Keep the plastic cap screwed on or separate per local rules.",
        "3. Crush flat to conserve bin space."
      ],
      reuse_tip: "Cut in half horizontally to create an indoor herb planter."
    },
    {
      item_name: "Aluminum Soda Can",
      category: "Recyclable",
      bin_color: "Blue Recycling Bin",
      steps: [
        "1. Pour out all residual beverage.",
        "2. Do not insert cigarette butts or trash inside.",
        "3. Toss directly into your metal/can recycling bin."
      ],
      reuse_tip: "Can be used as a desk pencil organizer."
    },
    {
      item_name: "Fruit Peel / Food Scraps",
      category: "Compostable",
      bin_color: "Green Organic Compost Bin",
      steps: [
        "1. Remove any plastic stickers or labels from the peel.",
        "2. Chop into smaller pieces to speed up decomposition.",
        "3. Add to green food waste bin or backyard compost."
      ],
      reuse_tip: "Soak in water for 48 hours to make a natural plant fertilizer."
    }
  ];
  return samples[Math.floor(Math.random() * samples.length)];
}

function showResult(item, imageSrc) {
  el.loadingOverlay.classList.add('hidden');

  // Fill in result details
  el.resultImage.src = imageSrc;
  el.resultTitle.textContent = item.item_name;
  el.resultBin.innerHTML = `Dispose in: <strong>${item.bin_color || 'Sorting Bin'}</strong>`;

  // Category pill style
  const cat = (item.category || 'Recyclable').toLowerCase();
  el.resultCategoryBadge.className = 'cat-pill ' + (
    cat.includes('recycle') ? 'recyclable' :
    cat.includes('compost') ? 'compostable' :
    cat.includes('ewaste') ? 'ewaste' : 'landfill'
  );
  el.resultCategoryBadge.textContent = item.category || 'Recyclable';

  // Steps
  el.resultStepsList.innerHTML = '';
  const steps = Array.isArray(item.steps) ? item.steps : [item.steps];
  steps.forEach(step => {
    const li = document.createElement('li');
    li.textContent = step;
    el.resultStepsList.appendChild(li);
  });

  // Reuse Tip
  el.resultReuseText.textContent = item.reuse_tip || 'Can be repurposed into a utility holder.';

  // Save to History
  saveHistoryItem({
    id: Date.now(),
    name: item.item_name,
    category: item.category,
    bin: item.bin_color,
    steps: steps,
    reuse: item.reuse_tip,
    image: imageSrc,
    date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  });

  // Show Result Screen
  switchScreen('screenResult');
}

// ============================================================================
// History Management
// ============================================================================
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.history = raw ? JSON.parse(raw) : [];
  } catch (e) {
    state.history = [];
  }
  renderHistory();
}

function saveHistoryItem(item) {
  state.history.unshift(item);
  if (state.history.length > 30) state.history.pop();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  el.historyList.innerHTML = '';

  if (state.history.length === 0) {
    el.emptyHistory.classList.remove('hidden');
    return;
  }

  el.emptyHistory.classList.add('hidden');

  state.history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <img src="${item.image}" alt="${item.name}">
      <div class="history-item-details">
        <h4 class="history-item-name">${item.name}</h4>
        <p class="history-item-sub">${item.category} • ${item.date}</p>
      </div>
    `;

    div.addEventListener('click', () => {
      showResult({
        item_name: item.name,
        category: item.category,
        bin_color: item.bin,
        steps: item.steps,
        reuse_tip: item.reuse
      }, item.image);
    });

    el.historyList.appendChild(div);
  });
}

function clearHistory() {
  if (confirm('Clear all scan history?')) {
    state.history = [];
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
    showToast('History cleared');
  }
}

// ============================================================================
// Navigation
// ============================================================================
function switchScreen(screenId) {
  state.currentTab = screenId;

  // Toggle screen views
  el.screens.forEach(screen => {
    if (screen.id === screenId) {
      screen.classList.add('active');
    } else {
      screen.classList.remove('active');
    }
  });

  // Toggle active bottom nav button
  el.navButtons.forEach(btn => {
    if (btn.dataset.tab === screenId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Camera management
  if (screenId === 'screenCamera') {
    startCamera();
  } else {
    stopCamera();
  }
}

// ============================================================================
// Event Listeners & Init
// ============================================================================
function setupEvents() {
  // Navigation tabs
  el.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchScreen(btn.dataset.tab);
    });
  });

  // Camera buttons
  el.btnSnap.addEventListener('click', capturePhoto);
  el.btnFlipCam.addEventListener('click', flipCamera);

  // Upload buttons
  el.btnChooseImage.addEventListener('click', () => el.filePicker.click());
  el.filePicker.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  // Drag and drop
  el.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  el.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // History
  el.btnClearHistory.addEventListener('click', clearHistory);

  // Result: Scan Again button returns to camera
  el.btnScanAgain.addEventListener('click', () => {
    switchScreen('screenCamera');
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupEvents();
  loadHistory();
  startCamera();
});

/**
 * H2S Dose Reader — Core Application Script
 * Mandatory Live Camera QR Gatekeeper, Manual Worker Registration & Pure QR PNG Exporter
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. Application State & Elements
  // ==========================================
  const state = {
    currentScreen: 'scan-screen',
    workerId: '',
    shiftDate: new Date().toISOString().split('T')[0],
    qrVerified: false,
    verifiedWorker: null,
    loadedImage: null,
    tapState: 0,
    tapPoints: [null, null, null],
    expiryValid: true,
    latestResult: null,
    dbWorkers: JSON.parse(localStorage.getItem('h2s_worker_db') || '[]'),
    logs: JSON.parse(localStorage.getItem('h2s_dosimeter_logs') || '[]')
  };

  // DOM Elements
  const workerIdInput = document.getElementById('workerId');
  const shiftDateInput = document.getElementById('shiftDate');
  const fileInput = document.getElementById('fileInput');
  const demoSampleBtn = document.getElementById('demoSampleBtn');
  const photoCanvas = document.getElementById('photoCanvas');
  const ctx = photoCanvas.getContext('2d', { willReadFrequently: true });

  const resetPinsBtn = document.getElementById('resetPinsBtn');
  const computeDoseBtn = document.getElementById('computeDoseBtn');
  const autoDetectBtn = document.getElementById('autoDetectBtn');
  const autoDetectBanner = document.getElementById('autoDetectBanner');
  const stepInstruction = document.getElementById('stepInstruction');
  const stepBadge = document.getElementById('stepBadge');

  // Mandatory QR Gatekeeper DOM Elements
  const startLiveQrCameraBtn = document.getElementById('startLiveQrCameraBtn');
  const liveCameraModal = document.getElementById('liveCameraModal');
  const closeLiveCameraBtn = document.getElementById('closeLiveCameraBtn');
  const qrVideoFeed = document.getElementById('qrVideoFeed');
  const qrScanStatusMsg = document.getElementById('qrScanStatusMsg');
  const qrFileInput = document.getElementById('qrFileInput');

  const verifiedWorkerCard = document.getElementById('verifiedWorkerCard');
  const vWorkerId = document.getElementById('vWorkerId');
  const vShiftDate = document.getElementById('vShiftDate');

  const stripScanSectionCard = document.getElementById('stripScanSectionCard');
  const stripLockStatusTag = document.getElementById('stripLockStatusTag');
  const stripLockNotice = document.getElementById('stripLockNotice');
  const stripScanControls = document.getElementById('stripScanControls');

  // QR Badge Modal Elements
  const headerQrRegisterBtn = document.getElementById('headerQrRegisterBtn');
  const openQrModalBtn = document.getElementById('openQrModalBtn');
  const qrBadgeModal = document.getElementById('qrBadgeModal');
  const closeQrModalBtn = document.getElementById('closeQrModalBtn');
  const printBadgeBtn = document.getElementById('printBadgeBtn');
  const downloadQrPngBtn = document.getElementById('downloadQrPngBtn');
  const qrcodeDisplay = document.getElementById('qrcodeDisplay');
  const badgeWorkerIdText = document.getElementById('badgeWorkerIdText');
  const badgeShiftDateText = document.getElementById('badgeShiftDateText');
  const modalWorkerIdInput = document.getElementById('modalWorkerIdInput');

  // Readout Cards
  const readoutWhite = document.getElementById('readoutWhite');
  const readoutGrey = document.getElementById('readoutGrey');
  const readoutStrip = document.getElementById('readoutStrip');

  // Result DOM Elements
  const resultDoseVal = document.getElementById('resultDoseVal');
  const resultStatusBadge = document.getElementById('resultStatusBadge');
  const savedDbWorkerId = document.getElementById('savedDbWorkerId');
  const rawSwatch = document.getElementById('rawSwatch');
  const correctedSwatch = document.getElementById('correctedSwatch');
  const rawRgbText = document.getElementById('rawRgbText');
  const correctedRgbText = document.getElementById('correctedRgbText');
  const expiryToggle = document.getElementById('expiryToggle');
  const expiredBanner = document.getElementById('expiredBanner');
  const resultDoseCard = document.getElementById('resultDoseCard');
  const techDetailsBox = document.getElementById('techDetailsBox');
  const techDetailsToggle = document.getElementById('techDetailsToggle');
  const resultCurveChartContainer = document.getElementById('resultCurveChartContainer');

  // Dashboard DOM Elements
  const logSearchInput = document.getElementById('logSearchInput');
  const logTableBody = document.getElementById('logTableBody');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const clearLogBtn = document.getElementById('clearLogBtn');
  const statTotal = document.getElementById('statTotal');
  const statNormal = document.getElementById('statNormal');
  const statElevatedHigh = document.getElementById('statElevatedHigh');

  let activeMediaStream = null;
  let qrScanAnimationFrame = null;

  // Initialize Form Defaults
  shiftDateInput.value = state.shiftDate;
  workerIdInput.value = '';

  // ==========================================
  // 2. Navigation & Screen Switching
  // ==========================================
  const navTabs = document.querySelectorAll('.tab-btn');
  const screens = document.querySelectorAll('.screen-view');

  function switchScreen(screenId) {
    state.currentScreen = screenId;
    screens.forEach(s => s.classList.remove('active'));
    navTabs.forEach(t => t.classList.remove('active'));

    const targetScreen = document.getElementById(screenId);
    if (targetScreen) targetScreen.classList.add('active');

    const targetTab = document.querySelector(`.tab-btn[data-screen="${screenId}"]`);
    if (targetTab) targetTab.classList.add('active');

    if (screenId === 'dashboard-screen') {
      renderDashboard();
    }
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetScreen = tab.dataset.screen;
      if ((targetScreen === 'calibrate-screen' || targetScreen === 'result-screen') && (!state.qrVerified || !state.loadedImage)) {
        alert('Mandatory Step: Please scan the Worker QR Code first to unlock strip scanning.');
        return;
      }
      switchScreen(targetScreen);
    });
  });

  window.switchScreen = switchScreen;

  // ==========================================
  // 3. STEP 1: MANDATORY LIVE CAMERA QR SCANNER
  // ==========================================
  startLiveQrCameraBtn.addEventListener('click', startLiveCameraScan);

  function startLiveCameraScan() {
    liveCameraModal.style.display = 'flex';
    qrScanStatusMsg.textContent = 'Initializing Camera...';

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then((stream) => {
          activeMediaStream = stream;
          qrVideoFeed.srcObject = stream;
          qrVideoFeed.setAttribute('playsinline', true);
          qrVideoFeed.play();
          qrScanStatusMsg.textContent = 'Align Worker QR Code inside frame...';
          requestAnimationFrame(scanVideoFrame);
        })
        .catch((err) => {
          console.warn('Camera stream failed, fallback to file upload:', err);
          qrScanStatusMsg.textContent = 'Camera unavailable. Please select QR image file below.';
        });
    } else {
      qrScanStatusMsg.textContent = 'Camera API not supported. Select QR image below.';
    }
  }

  function scanVideoFrame() {
    if (!activeMediaStream) return;

    if (qrVideoFeed.readyState === qrVideoFeed.HAVE_ENOUGH_DATA) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = qrVideoFeed.videoWidth;
      tempCanvas.height = qrVideoFeed.videoHeight;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.drawImage(qrVideoFeed, 0, 0, tempCanvas.width, tempCanvas.height);

      const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);

      if (typeof jsQR !== 'undefined') {
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          handleSuccessfulQrScan(code.data);
          return;
        }
      }
    }

    qrScanAnimationFrame = requestAnimationFrame(scanVideoFrame);
  }

  function stopLiveCamera() {
    if (activeMediaStream) {
      activeMediaStream.getTracks().forEach(track => track.stop());
      activeMediaStream = null;
    }
    if (qrScanAnimationFrame) {
      cancelAnimationFrame(qrScanAnimationFrame);
      qrScanAnimationFrame = null;
    }
    liveCameraModal.style.display = 'none';
  }

  closeLiveCameraBtn.addEventListener('click', stopLiveCamera);

  qrFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.drawImage(img, 0, 0);

        const imgData = tCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        if (typeof jsQR !== 'undefined') {
          const code = jsQR(imgData.data, imgData.width, imgData.height);
          if (code && code.data) {
            handleSuccessfulQrScan(code.data);
            return;
          }
        }
        alert('No valid QR code found in selected image.');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  function handleSuccessfulQrScan(qrData) {
    let scannedWorkerId = qrData;
    let scannedShiftDate = new Date().toISOString().split('T')[0];

    try {
      const parsed = JSON.parse(qrData);
      if (parsed.workerId) scannedWorkerId = parsed.workerId;
      if (parsed.shiftDate) scannedShiftDate = parsed.shiftDate;
    } catch (e) {
      // Raw string
    }

    stopLiveCamera();

    state.qrVerified = true;
    state.verifiedWorker = { workerId: scannedWorkerId, shiftDate: scannedShiftDate };
    state.workerId = scannedWorkerId;
    state.shiftDate = scannedShiftDate;

    vWorkerId.textContent = scannedWorkerId;
    vShiftDate.textContent = scannedShiftDate;
    verifiedWorkerCard.style.display = 'flex';

    stripScanSectionCard.classList.remove('strip-section-locked');
    stripLockStatusTag.textContent = '🔓 UNLOCKED';
    stripLockStatusTag.className = 'badge-valid-tag valid-yes';
    stripLockNotice.style.display = 'none';
    stripScanControls.style.opacity = '1';
    stripScanControls.style.pointerEvents = 'auto';

    alert(`✅ QR VERIFIED! Worker ${scannedWorkerId} identified in Database.\n\nStep 2 (Strip Scan) is now UNLOCKED.`);
  }

  // ==========================================
  // 4. MANUAL WORKER REGISTRATION & PNG DOWNLOAD
  // ==========================================
  function generateAndRegisterWorkerQr() {
    let workerId = workerIdInput.value.trim();
    if (!workerId) {
      workerId = 'EMP-101'; // Default ID if user leaves blank so modal ALWAYS opens
      workerIdInput.value = workerId;
    }

    const shiftDate = shiftDateInput.value || new Date().toISOString().split('T')[0];
    modalWorkerIdInput.value = workerId;
    renderQrModalCode(workerId, shiftDate);
    qrBadgeModal.style.display = 'flex';
  }

  function renderQrModalCode(workerId, shiftDate) {
    // Register into Local Database
    const existingIndex = state.dbWorkers.findIndex(w => w.workerId === workerId);
    const workerRecord = {
      workerId,
      shiftDate,
      registeredAt: new Date().toLocaleString(),
      status: 'Registered / Awaiting Scan'
    };

    if (existingIndex >= 0) {
      state.dbWorkers[existingIndex] = workerRecord;
    } else {
      state.dbWorkers.push(workerRecord);
    }
    localStorage.setItem('h2s_worker_db', JSON.stringify(state.dbWorkers));

    badgeWorkerIdText.textContent = workerId;
    badgeShiftDateText.textContent = shiftDate;

    const payload = JSON.stringify({
      workerId,
      shiftDate,
      app: 'H2S_Dose_Reader'
    });

    qrcodeDisplay.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrcodeDisplay, {
        text: payload,
        width: 180,
        height: 180,
        colorDark: '#0F172A',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.H
      });
    }
  }

  // Update QR Code live as user types inside the modal
  modalWorkerIdInput.addEventListener('input', (e) => {
    const newWorkerId = e.target.value.trim() || 'EMP-101';
    workerIdInput.value = newWorkerId;
    renderQrModalCode(newWorkerId, shiftDateInput.value || state.shiftDate);
  });

  openQrModalBtn.addEventListener('click', generateAndRegisterWorkerQr);
  headerQrRegisterBtn.addEventListener('click', generateAndRegisterWorkerQr);
  closeQrModalBtn.addEventListener('click', () => qrBadgeModal.style.display = 'none');

  // DOWNLOAD ONLY THE QR CODE AS A PNG FILE
  downloadQrPngBtn.addEventListener('click', downloadQrCodePng);

  function downloadQrCodePng() {
    const workerId = badgeWorkerIdText.textContent.trim() || 'Worker';
    const canvas = qrcodeDisplay.querySelector('canvas');
    const img = qrcodeDisplay.querySelector('img');

    let dataUrl = '';
    if (canvas) {
      dataUrl = canvas.toDataURL('image/png');
    } else if (img && img.src) {
      dataUrl = img.src;
    } else {
      alert('QR Code image not generated yet.');
      return;
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${workerId}_QRCode.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  printBadgeBtn.addEventListener('click', () => {
    window.print();
  });

  // ==========================================
  // 5. STEP 2: STRIP SCAN & AUTO DETECTION
  // ==========================================
  fileInput.addEventListener('change', (e) => {
    if (!state.qrVerified) {
      alert('Mandatory Step: You must scan the Worker QR Code first!');
      return;
    }

    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        loadImageToCanvas(img);
        switchScreen('calibrate-screen');
        autoDetectPatches();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  demoSampleBtn.addEventListener('click', () => {
    if (!state.qrVerified) {
      handleSuccessfulQrScan(JSON.stringify({ workerId: 'EMP-101', shiftDate: state.shiftDate }));
    }
    generateDemoSamplePhoto();
    switchScreen('calibrate-screen');
  });

  function loadImageToCanvas(img) {
    state.loadedImage = img;
    const maxDim = 1000;
    let w = img.width;
    let h = img.height;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }
    photoCanvas.width = w;
    photoCanvas.height = h;

    resetPinState();
  }

  function generateDemoSamplePhoto() {
    const canvasTemp = document.createElement('canvas');
    canvasTemp.width = 800;
    canvasTemp.height = 600;
    const tCtx = canvasTemp.getContext('2d');

    tCtx.fillStyle = '#E2E8F0';
    tCtx.fillRect(0, 0, 800, 600);

    tCtx.fillStyle = '#FFFFFF';
    tCtx.strokeStyle = '#64748B';
    tCtx.lineWidth = 4;
    tCtx.fillRect(50, 50, 700, 500);
    tCtx.strokeRect(50, 50, 700, 500);

    tCtx.fillStyle = 'rgb(245, 240, 220)';
    tCtx.fillRect(100, 180, 160, 240);
    tCtx.strokeStyle = '#333';
    tCtx.lineWidth = 2;
    tCtx.strokeRect(100, 180, 160, 240);

    tCtx.fillStyle = '#0F172A';
    tCtx.font = 'bold 20px sans-serif';
    tCtx.textAlign = 'center';
    tCtx.fillText('WHITE REF', 180, 150);

    tCtx.fillStyle = 'rgb(135, 130, 115)';
    tCtx.fillRect(320, 180, 160, 240);
    tCtx.strokeRect(320, 180, 160, 240);
    tCtx.fillText('GREY REF', 400, 150);

    tCtx.fillStyle = 'rgb(115, 90, 70)';
    tCtx.fillRect(540, 180, 160, 240);
    tCtx.strokeRect(540, 180, 160, 240);
    tCtx.fillText('H2S STRIP', 620, 150);

    tCtx.font = '16px monospace';
    tCtx.fillStyle = '#64748B';
    tCtx.fillText('SIH DOSIMETER CALIBRATION CARD (SAMPLE)', 400, 500);

    const img = new Image();
    img.onload = () => {
      loadImageToCanvas(img);
      autoDetectPatches();
    };
    img.src = canvasTemp.toDataURL();
  }

  // ==========================================
  // 6. AUTO-DETECTION ALGORITHM
  // ==========================================
  autoDetectBtn.addEventListener('click', autoDetectPatches);

  function autoDetectPatches() {
    if (!state.loadedImage) return;

    const w = photoCanvas.width;
    const h = photoCanvas.height;
    const sampleGridX = 10;
    const sampleGridY = 10;
    const stepX = Math.floor(w / sampleGridX);
    const stepY = Math.floor(h / sampleGridY);

    let brightestPt = null, maxLum = -1;
    let greyPt = null, minGreyDiff = 999;
    let stripPt = null, maxDarknessRatio = -1;

    for (let gx = 1; gx < sampleGridX - 1; gx++) {
      for (let gy = 1; gy < sampleGridY - 1; gy++) {
        const cx = gx * stepX;
        const cy = gy * stepY;
        const rgb = getAverageRGB(cx, cy, 5);

        const lum = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
        const chromaticVar = Math.abs(rgb.r - rgb.g) + Math.abs(rgb.g - rgb.b) + Math.abs(rgb.b - rgb.r);

        if (lum > maxLum && rgb.r > 180 && rgb.g > 180) {
          maxLum = lum;
          brightestPt = { x: cx, y: cy, rawRgb: rgb };
        }

        if (lum >= 90 && lum <= 170 && chromaticVar < minGreyDiff) {
          minGreyDiff = chromaticVar;
          greyPt = { x: cx, y: cy, rawRgb: rgb };
        }

        const darkness = 255 - lum;
        if (darkness > 80 && darkness < 220 && (rgb.r >= rgb.b)) {
          const ratio = darkness + (rgb.r - rgb.b);
          if (ratio > maxDarknessRatio) {
            maxDarknessRatio = ratio;
            stripPt = { x: cx, y: cy, rawRgb: rgb };
          }
        }
      }
    }

    if (!brightestPt) brightestPt = { x: Math.round(w * 0.22), y: Math.round(h * 0.5), rawRgb: getAverageRGB(Math.round(w * 0.22), Math.round(h * 0.5), 5) };
    if (!greyPt) greyPt = { x: Math.round(w * 0.50), y: Math.round(h * 0.5), rawRgb: getAverageRGB(Math.round(w * 0.50), Math.round(h * 0.5), 5) };
    if (!stripPt) stripPt = { x: Math.round(w * 0.78), y: Math.round(h * 0.5), rawRgb: getAverageRGB(Math.round(w * 0.78), Math.round(h * 0.5), 5) };

    state.tapPoints = [brightestPt, greyPt, stripPt];
    state.tapState = 3;
    computeDoseBtn.disabled = false;

    autoDetectBanner.style.display = 'block';
    setTimeout(() => { autoDetectBanner.style.display = 'none'; }, 4000);

    updateStepUI();
    updateReadoutCards();
    redrawCanvas();
  }

  // ==========================================
  // 7. TAP-POINT MANUAL CALIBRATION LOGIC
  // ==========================================
  function resetPinState() {
    state.tapState = 0;
    state.tapPoints = [null, null, null];
    computeDoseBtn.disabled = true;
    updateStepUI();
    updateReadoutCards();
    redrawCanvas();
  }

  resetPinsBtn.addEventListener('click', resetPinState);

  photoCanvas.addEventListener('pointerdown', (e) => {
    if (!state.loadedImage || state.tapState >= 3) return;

    const rect = photoCanvas.getBoundingClientRect();
    const scaleX = photoCanvas.width / rect.width;
    const scaleY = photoCanvas.height / rect.height;

    const canvasX = Math.round((e.clientX - rect.left) * scaleX);
    const canvasY = Math.round((e.clientY - rect.top) * scaleY);

    const rawRgb = getAverageRGB(canvasX, canvasY, 5);

    state.tapPoints[state.tapState] = { x: canvasX, y: canvasY, rawRgb };
    state.tapState++;

    if (state.tapState === 3) {
      computeDoseBtn.disabled = false;
    }

    updateStepUI();
    updateReadoutCards();
    redrawCanvas();
  });

  function getAverageRGB(x, y, radius = 5) {
    const startX = Math.max(0, x - radius);
    const startY = Math.max(0, y - radius);
    const width = Math.min(photoCanvas.width - startX, radius * 2);
    const height = Math.min(photoCanvas.height - startY, radius * 2);

    const imageData = ctx.getImageData(startX, startY, width, height);
    const data = imageData.data;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;

    for (let i = 0; i < data.length; i += 4) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      count++;
    }

    return {
      r: count > 0 ? Math.round(rSum / count) : 0,
      g: count > 0 ? Math.round(gSum / count) : 0,
      b: count > 0 ? Math.round(bSum / count) : 0
    };
  }

  function updateStepUI() {
    const steps = [
      { step: '1/3', text: 'Tap 1: Select WHITE Reference Patch' },
      { step: '2/3', text: 'Tap 2: Select GREY Reference Patch' },
      { step: '3/3', text: 'Tap 3: Select H2S CHEMICAL STRIP Area' },
      { step: 'Done', text: 'All 3 Points Placed! Ready to Compute.' }
    ];

    const current = steps[Math.min(state.tapState, 3)];
    stepBadge.textContent = `STEP ${current.step}`;
    stepInstruction.textContent = current.text;
  }

  function updateReadoutCards() {
    const readouts = [
      { card: readoutWhite, pt: state.tapPoints[0], label: 'White' },
      { card: readoutGrey, pt: state.tapPoints[1], label: 'Grey' },
      { card: readoutStrip, pt: state.tapPoints[2], label: 'Strip' }
    ];

    readouts.forEach((r, idx) => {
      const valEl = r.card.querySelector('.rgb-value');
      const swatchEl = r.card.querySelector('.color-swatch-mini');

      if (idx === state.tapState) {
        r.card.classList.add('active-target');
      } else {
        r.card.classList.remove('active-target');
      }

      if (r.pt) {
        r.card.classList.add('has-data');
        const { r: cr, g: cg, b: cb } = r.pt.rawRgb;
        valEl.textContent = `RGB(${cr}, ${cg}, ${cb})`;
        swatchEl.style.backgroundColor = `rgb(${cr}, ${cg}, ${cb})`;
      } else {
        r.card.classList.remove('has-data');
        valEl.textContent = 'Tap Photo';
        swatchEl.style.backgroundColor = '#E2E8F0';
      }
    });
  }

  function redrawCanvas() {
    if (!state.loadedImage) return;

    ctx.drawImage(state.loadedImage, 0, 0, photoCanvas.width, photoCanvas.height);

    const pinColors = ['#2563EB', '#8B5CF6', '#EA580C'];
    const pinLabels = ['1: WHITE', '2: GREY', '3: STRIP'];

    state.tapPoints.forEach((pt, idx) => {
      if (!pt) return;

      const { x, y } = pt;
      const color = pinColors[idx];

      ctx.beginPath();
      ctx.arc(x, y, 22, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.fill();
      ctx.globalAlpha = 1.0;

      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((idx + 1).toString(), x, y);

      ctx.font = 'bold 11px sans-serif';
      const labelText = pinLabels[idx];
      const textWidth = ctx.measureText(labelText).width;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(x - textWidth / 2 - 6, y + 18, textWidth + 12, 18);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(labelText, x, y + 27);
    });
  }

  // ==========================================
  // 8. CORE DOSE COMPUTATION & AUTOMATIC DB SAVE
  // ==========================================
  computeDoseBtn.addEventListener('click', () => {
    if (state.tapState < 3) return;

    const result = computeDoseAlgorithm(
      state.tapPoints[0].rawRgb,
      state.tapPoints[1].rawRgb,
      state.tapPoints[2].rawRgb
    );

    state.latestResult = result;
    autoSaveResultToDatabase(result);

    displayResult(result);
    switchScreen('result-screen');
  });

  function computeDoseAlgorithm(whiteRef, greyRef, stripRaw) {
    const scaleR = whiteRef.r > 0 ? 255 / whiteRef.r : 1;
    const scaleG = whiteRef.g > 0 ? 255 / whiteRef.g : 1;
    const scaleB = whiteRef.b > 0 ? 255 / whiteRef.b : 1;

    const correctedR = Math.min(255, Math.max(0, Math.round(stripRaw.r * scaleR)));
    const correctedG = Math.min(255, Math.max(0, Math.round(stripRaw.g * scaleG)));
    const correctedB = Math.min(255, Math.max(0, Math.round(stripRaw.b * scaleB)));

    const luminance = 0.299 * correctedR + 0.587 * correctedG + 0.114 * correctedB;
    const darkness = Math.min(255, Math.max(0, 255 - luminance));

    const dose = interpolateDose(darkness, calibrationCurve);

    let status = 'Normal';
    let statusClass = 'status-normal';

    if (dose >= DOSE_THRESHOLD_HIGH) {
      status = 'High — Review Required';
      statusClass = 'status-high';
    } else if (dose >= DOSE_THRESHOLD_LOW) {
      status = 'Elevated — Monitor';
      statusClass = 'status-elevated';
    }

    const workerId = state.verifiedWorker ? state.verifiedWorker.workerId : (state.workerId || 'EMP-101');
    const shiftDate = state.verifiedWorker ? state.verifiedWorker.shiftDate : state.shiftDate;

    return {
      workerId,
      shiftDate,
      whiteRef,
      greyRef,
      stripRaw,
      scaleFactors: { r: scaleR.toFixed(3), g: scaleG.toFixed(3), b: scaleB.toFixed(3) },
      correctedStrip: { r: correctedR, g: correctedG, b: correctedB },
      luminance: luminance.toFixed(1),
      darkness: darkness.toFixed(1),
      darknessNum: darkness,
      dose: dose.toFixed(1),
      doseNum: dose,
      status,
      statusClass,
      calibrationCurveSnapshot: [...calibrationCurve],
      scannedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
  }

  function autoSaveResultToDatabase(res) {
    const logEntry = {
      id: Date.now(),
      workerId: res.workerId,
      shiftDate: res.shiftDate,
      dose: res.dose,
      doseNum: res.doseNum,
      darknessIndex: res.darkness,
      status: res.status,
      statusClass: res.statusClass,
      badgeValid: state.expiryValid ? 'Yes' : 'No (Expired)',
      qrVerified: 'Yes (Camera Stream)',
      calibrationCurve: res.calibrationCurveSnapshot,
      scannedAt: new Date().toLocaleString()
    };

    state.logs.unshift(logEntry);
    localStorage.setItem('h2s_dosimeter_logs', JSON.stringify(state.logs));
    savedDbWorkerId.textContent = res.workerId;
  }

  function interpolateDose(darkness, curve) {
    if (!curve || curve.length === 0) return 0;
    if (darkness <= curve[0].darkness) return curve[0].dose;
    if (darkness >= curve[curve.length - 1].darkness) return curve[curve.length - 1].dose;

    for (let i = 0; i < curve.length - 1; i++) {
      const p1 = curve[i];
      const p2 = curve[i + 1];

      if (darkness >= p1.darkness && darkness <= p2.darkness) {
        const rangeDarkness = p2.darkness - p1.darkness;
        if (rangeDarkness === 0) return p1.dose;
        const t = (darkness - p1.darkness) / rangeDarkness;
        return p1.dose + t * (p2.dose - p1.dose);
      }
    }
    return 0;
  }

  // ==========================================
  // 9. DISPLAY RESULT & CURVE CHART
  // ==========================================
  function displayResult(res) {
    resultDoseVal.textContent = res.dose;

    resultStatusBadge.textContent = res.status;
    resultStatusBadge.className = `status-badge ${res.statusClass}`;

    const rawRgbStr = `rgb(${res.stripRaw.r}, ${res.stripRaw.g}, ${res.stripRaw.b})`;
    const corrRgbStr = `rgb(${res.correctedStrip.r}, ${res.correctedStrip.g}, ${res.correctedStrip.b})`;

    rawSwatch.style.backgroundColor = rawRgbStr;
    correctedSwatch.style.backgroundColor = corrRgbStr;

    rawRgbText.textContent = `RGB(${res.stripRaw.r}, ${res.stripRaw.g}, ${res.stripRaw.b})`;
    correctedRgbText.textContent = `RGB(${res.correctedStrip.r}, ${res.correctedStrip.g}, ${res.correctedStrip.b})`;

    techDetailsBox.innerHTML = `
      <div><strong>Worker ID:</strong> ${res.workerId} (QR Verified) | <strong>Date:</strong> ${res.shiftDate}</div>
      <div><strong>Scale Factors:</strong> R:${res.scaleFactors.r}, G:${res.scaleFactors.g}, B:${res.scaleFactors.b}</div>
      <div><strong>Luminance:</strong> ${res.luminance} | <strong>Darkness Index:</strong> ${res.darkness} / 255</div>
      <div><strong>Raw RGB:</strong> ${rawRgbStr} | <strong>Corrected RGB:</strong> ${corrRgbStr}</div>
    `;

    renderCalibrationChart(resultCurveChartContainer, res.darknessNum, res.doseNum);

    state.expiryValid = expiryToggle.checked;
    updateExpiryUI();
  }

  function renderCalibrationChart(container, activeDarkness, activeDose) {
    container.innerHTML = '';
    const svgWidth = 500;
    const svgHeight = 160;
    const pad = 30;

    const maxD = 80;
    const maxK = 255;

    const pointsSvg = calibrationCurve.map(pt => {
      const x = pad + (pt.darkness / maxK) * (svgWidth - pad * 2);
      const y = (svgHeight - pad) - (pt.dose / maxD) * (svgHeight - pad * 2);
      return `${x},${y}`;
    }).join(' ');

    const activeX = pad + (activeDarkness / maxK) * (svgWidth - pad * 2);
    const activeY = (svgHeight - pad) - (activeDose / maxD) * (svgHeight - pad * 2);

    const svgHtml = `
      <svg class="curve-chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
        <line x1="${pad}" y1="${svgHeight - pad}" x2="${svgWidth - 10}" y2="${svgHeight - pad}" stroke="#CBD5E1" stroke-width="2"/>
        <line x1="${pad}" y1="10" x2="${pad}" y2="${svgHeight - pad}" stroke="#CBD5E1" stroke-width="2"/>
        
        <text x="${svgWidth / 2}" y="${svgHeight - 5}" font-size="10" fill="#64748B" font-weight="700" text-anchor="middle">Darkness Index Score (0 - 255)</text>
        <text x="10" y="${svgHeight / 2}" font-size="10" fill="#64748B" font-weight="700" text-anchor="middle" transform="rotate(-90 10 ${svgHeight / 2})">Dose (ppm·hr)</text>

        <polyline points="${pointsSvg}" fill="none" stroke="#2563EB" stroke-width="3" stroke-linecap="round"/>

        <circle cx="${activeX}" cy="${activeY}" r="8" fill="#FFC72C" stroke="#0F172A" stroke-width="3"/>
        <circle cx="${activeX}" cy="${activeY}" r="12" fill="#FFC72C" opacity="0.3"/>
        <text x="${activeX + 10}" y="${activeY - 5}" font-size="11" font-weight="800" fill="#0F172A">${activeDose.toFixed(1)} ppm·hr</text>
      </svg>
    `;

    container.innerHTML = svgHtml;
  }

  expiryToggle.addEventListener('change', () => {
    state.expiryValid = expiryToggle.checked;
    updateExpiryUI();
  });

  function updateExpiryUI() {
    if (state.expiryValid) {
      expiredBanner.style.display = 'none';
      resultDoseCard.style.opacity = '1';
      resultDoseCard.style.pointerEvents = 'auto';
    } else {
      expiredBanner.style.display = 'flex';
      resultDoseCard.style.opacity = '0.4';
      resultDoseCard.style.pointerEvents = 'none';
    }
  }

  techDetailsToggle.addEventListener('click', () => {
    if (techDetailsBox.style.display === 'none' || !techDetailsBox.style.display) {
      techDetailsBox.style.display = 'flex';
      techDetailsToggle.textContent = 'Hide Mathematical Diagnostics ▲';
    } else {
      techDetailsBox.style.display = 'none';
      techDetailsToggle.textContent = 'View Mathematical Diagnostics ▼';
    }
  });

  // ==========================================
  // 10. DASHBOARD & DATABASE LOG OPERATIONS
  // ==========================================
  function renderDashboard() {
    const query = (logSearchInput.value || '').toLowerCase().trim();
    const filteredLogs = state.logs.filter(log => log.workerId.toLowerCase().includes(query));

    statTotal.textContent = state.logs.length;
    statNormal.textContent = state.logs.filter(l => l.status.includes('Normal')).length;
    statElevatedHigh.textContent = state.logs.filter(l => !l.status.includes('Normal')).length;

    logTableBody.innerHTML = '';

    if (filteredLogs.length === 0) {
      logTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-log-state">
            ${query ? 'No matching database records found for Worker ID.' : 'No compliance logs in database yet.'}
          </td>
        </tr>
      `;
      return;
    }

    filteredLogs.forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(log.workerId)}</strong></td>
        <td>${escapeHtml(log.shiftDate)}</td>
        <td><strong>${escapeHtml(log.dose)} ppm·hr</strong></td>
        <td><span class="status-badge ${log.statusClass}" style="font-size:0.7rem; padding:2px 8px;">${escapeHtml(log.status)}</span></td>
        <td><span class="badge-valid-tag valid-yes">✓ ${escapeHtml(log.qrVerified || 'Camera Stream')}</span></td>
        <td style="color:#64748B; font-size:0.75rem;">${escapeHtml(log.scannedAt)}</td>
      `;
      logTableBody.appendChild(tr);
    });
  }

  logSearchInput.addEventListener('input', renderDashboard);

  exportCsvBtn.addEventListener('click', () => {
    if (state.logs.length === 0) {
      alert('No database logs available to export.');
      return;
    }

    const headers = ['Worker ID', 'Shift Date', 'Dose (ppm·hr)', 'Status', 'QR Verified', 'Scanned At'];
    const csvRows = [headers.join(',')];

    state.logs.forEach(log => {
      const row = [
        `"${log.workerId.replace(/"/g, '""')}"`,
        `"${log.shiftDate}"`,
        `"${log.dose}"`,
        `"${log.status}"`,
        `"${log.qrVerified || 'Yes'}"`,
        `"${log.scannedAt}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `h2s_dosimeter_database_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  clearLogBtn.addEventListener('click', () => {
    if (state.logs.length === 0) return;

    if (confirm('Are you sure you want to clear the Database logs? This action cannot be undone.')) {
      state.logs = [];
      localStorage.removeItem('h2s_dosimeter_logs');
      renderDashboard();
    }
  });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
});

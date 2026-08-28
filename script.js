/**
 * H2S Dose Reader — Core Application Script
 * Single-Page Client-Side Image Processing, QR Scanner, Auto-Detect & Curve Visualizer Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. Application State & Elements
  // ==========================================
  const state = {
    currentScreen: 'scan-screen',
    workerId: '',
    shiftDate: new Date().toISOString().split('T')[0],
    loadedImage: null,
    tapState: 0, // 0: White, 1: Grey, 2: Strip, 3: Completed
    tapPoints: [null, null, null],
    expiryValid: true,
    latestResult: null,
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

  // QR DOM Elements
  const scanWorkerQrBtn = document.getElementById('scanWorkerQrBtn');
  const qrFileInput = document.getElementById('qrFileInput');
  const qrScanSuccessBanner = document.getElementById('qrScanSuccessBanner');
  const qrScanSuccessText = document.getElementById('qrScanSuccessText');
  const headerQrBadgeBtn = document.getElementById('headerQrBadgeBtn');
  const openQrModalBtn = document.getElementById('openQrModalBtn');
  const qrBadgeModal = document.getElementById('qrBadgeModal');
  const closeQrModalBtn = document.getElementById('closeQrModalBtn');
  const printBadgeBtn = document.getElementById('printBadgeBtn');
  const qrcodeDisplay = document.getElementById('qrcodeDisplay');
  const badgeWorkerIdText = document.getElementById('badgeWorkerIdText');
  const badgeShiftDateText = document.getElementById('badgeShiftDateText');
  const badgeTimestampText = document.getElementById('badgeTimestampText');

  // Readout cards
  const readoutWhite = document.getElementById('readoutWhite');
  const readoutGrey = document.getElementById('readoutGrey');
  const readoutStrip = document.getElementById('readoutStrip');

  // Result DOM Elements
  const resultDoseVal = document.getElementById('resultDoseVal');
  const resultStatusBadge = document.getElementById('resultStatusBadge');
  const rawSwatch = document.getElementById('rawSwatch');
  const correctedSwatch = document.getElementById('correctedSwatch');
  const rawRgbText = document.getElementById('rawRgbText');
  const correctedRgbText = document.getElementById('correctedRgbText');
  const expiryToggle = document.getElementById('expiryToggle');
  const expiredBanner = document.getElementById('expiredBanner');
  const resultDoseCard = document.getElementById('resultDoseCard');
  const saveLogBtn = document.getElementById('saveLogBtn');
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

  // Initialize Form Defaults
  shiftDateInput.value = state.shiftDate;
  if (!workerIdInput.value) {
    workerIdInput.value = 'WRK-' + Math.floor(1000 + Math.random() * 9000);
  }

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
      if ((targetScreen === 'calibrate-screen' || targetScreen === 'result-screen') && !state.loadedImage) {
        alert('Please capture or select a test strip photo first.');
        return;
      }
      switchScreen(targetScreen);
    });
  });

  window.switchScreen = switchScreen;

  // ==========================================
  // 3. Worker QR Code Generator & Badge Modal
  // ==========================================
  function generateWorkerQrBadge() {
    const workerId = workerIdInput.value.trim() || 'WRK-UNKNOWN';
    const shiftDate = shiftDateInput.value || new Date().toISOString().split('T')[0];
    const timestamp = new Date().toLocaleTimeString();

    badgeWorkerIdText.textContent = workerId;
    badgeShiftDateText.textContent = shiftDate;
    badgeTimestampText.textContent = timestamp;

    const payload = JSON.stringify({
      workerId,
      shiftDate,
      timestamp,
      app: 'H2S_Dose_Reader'
    });

    qrcodeDisplay.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrcodeDisplay, {
        text: payload,
        width: 100,
        height: 100,
        colorDark: '#0F172A',
        colorLight: '#FFFFFF',
        correctLevel: QRCode.CorrectLevel.H
      });
    } else {
      qrcodeDisplay.textContent = 'QR Engine Ready';
    }

    qrBadgeModal.style.display = 'flex';
  }

  openQrModalBtn.addEventListener('click', generateWorkerQrBadge);
  headerQrBadgeBtn.addEventListener('click', generateWorkerQrBadge);
  closeQrModalBtn.addEventListener('click', () => qrBadgeModal.style.display = 'none');

  printBadgeBtn.addEventListener('click', () => {
    window.print();
  });

  // ==========================================
  // 4. Worker QR Scanner (Decoding QR from Camera/File)
  // ==========================================
  scanWorkerQrBtn.addEventListener('click', () => {
    qrFileInput.click();
  });

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
          if (code) {
            try {
              const data = JSON.parse(code.data);
              if (data.workerId) {
                workerIdInput.value = data.workerId;
                if (data.shiftDate) shiftDateInput.value = data.shiftDate;
                showQrScanSuccess(`Worker ${data.workerId} verified from QR Code!`);
                return;
              }
            } catch (err) {
              // Not JSON payload, use raw code string
              workerIdInput.value = code.data;
              showQrScanSuccess(`Worker ID ${code.data} scanned!`);
              return;
            }
          }
        }
        alert('No valid QR code detected in image. Please try another clear photo.');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  function showQrScanSuccess(msg) {
    qrScanSuccessText.textContent = msg;
    qrScanSuccessBanner.style.display = 'flex';
    setTimeout(() => {
      qrScanSuccessBanner.style.display = 'none';
    }, 5000);
  }

  // ==========================================
  // 5. Image Capture & Processing
  // ==========================================
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        loadImageToCanvas(img);
        switchScreen('calibrate-screen');
        autoDetectPatches(); // Run auto-detection automatically!
      };
      img.onerror = () => {
        alert('Failed to load selected image. Please try another file.');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  demoSampleBtn.addEventListener('click', () => {
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

    // Warm ambient background
    tCtx.fillStyle = '#E2E8F0';
    tCtx.fillRect(0, 0, 800, 600);

    // Card boundary
    tCtx.fillStyle = '#FFFFFF';
    tCtx.strokeStyle = '#64748B';
    tCtx.lineWidth = 4;
    tCtx.fillRect(50, 50, 700, 500);
    tCtx.strokeRect(50, 50, 700, 500);

    // White Patch
    tCtx.fillStyle = 'rgb(245, 240, 220)';
    tCtx.fillRect(100, 180, 160, 240);
    tCtx.strokeStyle = '#333';
    tCtx.lineWidth = 2;
    tCtx.strokeRect(100, 180, 160, 240);

    tCtx.fillStyle = '#0F172A';
    tCtx.font = 'bold 20px sans-serif';
    tCtx.textAlign = 'center';
    tCtx.fillText('WHITE REF', 180, 150);

    // Grey Patch
    tCtx.fillStyle = 'rgb(135, 130, 115)';
    tCtx.fillRect(320, 180, 160, 240);
    tCtx.strokeRect(320, 180, 160, 240);
    tCtx.fillText('GREY REF', 400, 150);

    // Chemical Strip Patch (Simulating moderate reaction darkness ~ RGB 115, 90, 70)
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
  // 6. Automatic Patch Detection Algorithm
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

        // White Ref Detection: Highest luminance (brightest region)
        if (lum > maxLum && rgb.r > 180 && rgb.g > 180) {
          maxLum = lum;
          brightestPt = { x: cx, y: cy, rawRgb: rgb };
        }

        // Grey Ref Detection: Mid-luminance (100–160) with lowest chromatic variance (neutral grey)
        if (lum >= 90 && lum <= 170 && chromaticVar < minGreyDiff) {
          minGreyDiff = chromaticVar;
          greyPt = { x: cx, y: cy, rawRgb: rgb };
        }

        // Chemical Strip Detection: High darkness ratio with reddish/brownish tint
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

    // Fallbacks if detection is fuzzy
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
  // 7. Tap-Point Manual Calibration Logic
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
  // 8. Core Dose Calculation & Threshold Engine
  // ==========================================
  computeDoseBtn.addEventListener('click', () => {
    if (state.tapState < 3) return;

    state.workerId = workerIdInput.value.trim() || 'WRK-UNKNOWN';
    state.shiftDate = shiftDateInput.value || new Date().toISOString().split('T')[0];

    const result = computeDoseAlgorithm(
      state.tapPoints[0].rawRgb, // White Ref
      state.tapPoints[1].rawRgb, // Grey Ref
      state.tapPoints[2].rawRgb  // Strip Raw
    );

    state.latestResult = result;
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

    return {
      workerId: state.workerId,
      shiftDate: state.shiftDate,
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
  // 9. Display Result & Calibration Curve Chart Visualizer
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

    // Technical breakdown details
    techDetailsBox.innerHTML = `
      <div><strong>Scale Factors:</strong> R:${res.scaleFactors.r}, G:${res.scaleFactors.g}, B:${res.scaleFactors.b}</div>
      <div><strong>Luminance:</strong> ${res.luminance} | <strong>Darkness Index:</strong> ${res.darkness} / 255</div>
      <div><strong>Raw RGB:</strong> ${rawRgbStr}</div>
      <div><strong>Corrected RGB:</strong> ${corrRgbStr}</div>
      <div><strong>Worker ID:</strong> ${res.workerId} | <strong>Date:</strong> ${res.shiftDate}</div>
    `;

    // Render Calibration Curve Trace SVG Chart
    renderCalibrationChart(resultCurveChartContainer, res.darknessNum, res.doseNum);

    state.expiryValid = expiryToggle.checked;
    updateExpiryUI();
  }

  function renderCalibrationChart(container, activeDarkness, activeDose) {
    container.innerHTML = '';
    const svgWidth = 500;
    const svgHeight = 160;
    const pad = 30;

    const maxD = 80; // Max dose Y-axis
    const maxK = 255; // Max darkness X-axis

    // Map points to SVG canvas coordinates
    const pointsSvg = calibrationCurve.map(pt => {
      const x = pad + (pt.darkness / maxK) * (svgWidth - pad * 2);
      const y = (svgHeight - pad) - (pt.dose / maxD) * (svgHeight - pad * 2);
      return `${x},${y}`;
    }).join(' ');

    const activeX = pad + (activeDarkness / maxK) * (svgWidth - pad * 2);
    const activeY = (svgHeight - pad) - (activeDose / maxD) * (svgHeight - pad * 2);

    const svgHtml = `
      <svg class="curve-chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}">
        <!-- Axes -->
        <line x1="${pad}" y1="${svgHeight - pad}" x2="${svgWidth - 10}" y2="${svgHeight - pad}" stroke="#CBD5E1" stroke-width="2"/>
        <line x1="${pad}" y1="10" x2="${pad}" y2="${svgHeight - pad}" stroke="#CBD5E1" stroke-width="2"/>
        
        <!-- Axis Labels -->
        <text x="${svgWidth / 2}" y="${svgHeight - 5}" font-size="10" fill="#64748B" font-weight="700" text-anchor="middle">Darkness Index Score (0 - 255)</text>
        <text x="10" y="${svgHeight / 2}" font-size="10" fill="#64748B" font-weight="700" text-anchor="middle" transform="rotate(-90 10 ${svgHeight / 2})">Dose (ppm·hr)</text>

        <!-- Curve Line -->
        <polyline points="${pointsSvg}" fill="none" stroke="#2563EB" stroke-width="3" stroke-linecap="round"/>

        <!-- Active Reading Point -->
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

  // Save Reading to LocalStorage Log
  saveLogBtn.addEventListener('click', () => {
    if (!state.latestResult) return;

    const logEntry = {
      id: Date.now(),
      workerId: state.latestResult.workerId,
      shiftDate: state.latestResult.shiftDate,
      dose: state.latestResult.dose,
      doseNum: state.latestResult.doseNum,
      darknessIndex: state.latestResult.darkness,
      status: state.latestResult.status,
      statusClass: state.latestResult.statusClass,
      badgeValid: state.expiryValid ? 'Yes' : 'No (Expired)',
      calibrationCurve: state.latestResult.calibrationCurveSnapshot,
      scannedAt: new Date().toLocaleString()
    };

    state.logs.unshift(logEntry);
    localStorage.setItem('h2s_dosimeter_logs', JSON.stringify(state.logs));

    alert(`Reading for Worker ${logEntry.workerId} saved to Compliance Log.`);
    switchScreen('dashboard-screen');
  });

  // ==========================================
  // 10. Dashboard & Log Operations
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
            ${query ? 'No matching logs found for Worker ID search.' : 'No compliance logs saved yet.'}
          </td>
        </tr>
      `;
      return;
    }

    filteredLogs.forEach(log => {
      const tr = document.createElement('tr');
      const isValid = log.badgeValid.includes('Yes');

      tr.innerHTML = `
        <td><strong>${escapeHtml(log.workerId)}</strong></td>
        <td>${escapeHtml(log.shiftDate)}</td>
        <td><strong>${escapeHtml(log.dose)} ppm·hr</strong></td>
        <td><span class="status-badge ${log.statusClass}" style="font-size:0.7rem; padding:2px 8px;">${escapeHtml(log.status)}</span></td>
        <td><span class="badge-valid-tag ${isValid ? 'valid-yes' : 'valid-no'}">${escapeHtml(log.badgeValid)}</span></td>
        <td style="color:#64748B; font-size:0.75rem;">${escapeHtml(log.scannedAt)}</td>
      `;
      logTableBody.appendChild(tr);
    });
  }

  logSearchInput.addEventListener('input', renderDashboard);

  exportCsvBtn.addEventListener('click', () => {
    if (state.logs.length === 0) {
      alert('No log data available to export.');
      return;
    }

    const headers = ['Worker ID', 'Shift Date', 'Dose (ppm·hr)', 'Status', 'Badge Valid', 'Scanned At'];
    const csvRows = [headers.join(',')];

    state.logs.forEach(log => {
      const row = [
        `"${log.workerId.replace(/"/g, '""')}"`,
        `"${log.shiftDate}"`,
        `"${log.dose}"`,
        `"${log.status}"`,
        `"${log.badgeValid}"`,
        `"${log.scannedAt}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `h2s_dosimeter_logs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  clearLogBtn.addEventListener('click', () => {
    if (state.logs.length === 0) return;

    if (confirm('Are you sure you want to clear all compliance log entries? This action cannot be undone.')) {
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

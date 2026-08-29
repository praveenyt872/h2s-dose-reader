/**
 * H2S Dose Reader — Production Minimalist Engine
 * High-Resolution Calibration, Dynamic Shift TWA & Role-Based Access Control
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. Application State & Elements
  // ==========================================
  const state = {
    currentScreen: 'scan-screen',
    userRole: 'worker', // 'worker' | 'admin'
    activeWorkerId: 'EMP-101',
    workerId: 'EMP-101',
    shiftDate: new Date().toISOString().split('T')[0],
    shiftHours: 8.0,
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

  // Header Elements
  const headerRoleTag = document.getElementById('headerRoleTag');
  const headerRoleText = document.getElementById('headerRoleText');
  const adminPortalToggleBtn = document.getElementById('adminPortalToggleBtn');
  const adminLoginModal = document.getElementById('adminLoginModal');
  const closeAdminModalBtn = document.getElementById('closeAdminModalBtn');
  const adminPinInput = document.getElementById('adminPinInput');
  const autoFillPinBtn = document.getElementById('autoFillPinBtn');
  const submitAdminPinBtn = document.getElementById('submitAdminPinBtn');
  const adminPinErrorMsg = document.getElementById('adminPinErrorMsg');

  // Screen 1 DOM Elements
  const displayWorkerName = document.getElementById('displayWorkerName');
  const displayWorkerSub = document.getElementById('displayWorkerSub');
  const workerAvatarCircle = document.getElementById('workerAvatarCircle');
  const stripLockStatusTag = document.getElementById('stripLockStatusTag');
  const stripScanControls = document.getElementById('stripScanControls');
  const stripDropzoneText = document.getElementById('stripDropzoneText');

  const shiftHoursInput = document.getElementById('shiftHoursInput');
  const shiftPresetBtns = document.querySelectorAll('.shift-preset-btn:not(.result-shift-btn)');

  const fileInput = document.getElementById('fileInput');
  const demoSampleBtn = document.getElementById('demoSampleBtn');
  const photoCanvas = document.getElementById('photoCanvas');
  const ctx = photoCanvas.getContext('2d', { willReadFrequently: true });

  const resetPinsBtn = document.getElementById('resetPinsBtn');
  const computeDoseBtn = document.getElementById('computeDoseBtn');
  const autoDetectBtn = document.getElementById('autoDetectBtn');
  const stepInstruction = document.getElementById('stepInstruction');

  // QR Modal & Camera Elements
  const startLiveQrCameraBtn = document.getElementById('startLiveQrCameraBtn');
  const liveCameraModal = document.getElementById('liveCameraModal');
  const closeLiveCameraBtn = document.getElementById('closeLiveCameraBtn');
  const qrVideoFeed = document.getElementById('qrVideoFeed');
  const qrScanStatusMsg = document.getElementById('qrScanStatusMsg');
  const qrFileInput = document.getElementById('qrFileInput');

  const headerQrRegisterBtn = document.getElementById('headerQrRegisterBtn');
  const qrBadgeModal = document.getElementById('qrBadgeModal');
  const closeQrModalBtn = document.getElementById('closeQrModalBtn');
  const downloadQrPngBtn = document.getElementById('downloadQrPngBtn');
  const qrcodeDisplay = document.getElementById('qrcodeDisplay');
  const badgeWorkerIdText = document.getElementById('badgeWorkerIdText');
  const badgeShiftDateText = document.getElementById('badgeShiftDateText');
  const badgeShiftHoursText = document.getElementById('badgeShiftHoursText');
  const modalWorkerIdInput = document.getElementById('modalWorkerIdInput');
  const modalShiftDateInput = document.getElementById('modalShiftDateInput');
  const modalShiftHoursInput = document.getElementById('modalShiftHoursInput');

  // Readouts & Result Elements
  const readoutWhite = document.getElementById('readoutWhite');
  const readoutGrey = document.getElementById('readoutGrey');
  const readoutStrip = document.getElementById('readoutStrip');

  const resultDoseVal = document.getElementById('resultDoseVal');
  const resultTwaVal = document.getElementById('resultTwaVal');
  const resultShiftHoursLabel = document.getElementById('resultShiftHoursLabel');
  const resultStatusBadge = document.getElementById('resultStatusBadge');
  const resultShiftInput = document.getElementById('resultShiftInput');
  const resultShiftBtns = document.querySelectorAll('.result-shift-btn');

  const rawSwatch = document.getElementById('rawSwatch');
  const correctedSwatch = document.getElementById('correctedSwatch');
  const rawRgbText = document.getElementById('rawRgbText');
  const correctedRgbText = document.getElementById('correctedRgbText');
  const resultCurveChartContainer = document.getElementById('resultCurveChartContainer');

  // Screen 4 Elements
  const workerPrivacyBanner = document.getElementById('workerPrivacyBanner');
  const privacyWorkerIdText = document.getElementById('privacyWorkerIdText');
  const adminMasterBanner = document.getElementById('adminMasterBanner');
  const exitAdminModeBtn = document.getElementById('exitAdminModeBtn');
  const logSearchInput = document.getElementById('logSearchInput');
  const logTableBody = document.getElementById('logTableBody');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportCsvBtnText = document.getElementById('exportCsvBtnText');
  const clearLogBtn = document.getElementById('clearLogBtn');
  const statTotal = document.getElementById('statTotal');
  const statTotalLabel = document.getElementById('statTotalLabel');
  const statNormal = document.getElementById('statNormal');
  const statElevatedHigh = document.getElementById('statElevatedHigh');

  let activeMediaStream = null;
  let qrScanAnimationFrame = null;

  // Defaults
  if (modalShiftDateInput) modalShiftDateInput.value = state.shiftDate;
  if (shiftHoursInput) shiftHoursInput.value = '8.0';
  if (resultShiftInput) resultShiftInput.value = '8.0';

  updateRoleUI();

  // ==========================================
  // 2. ROLE-BASED ACCESS CONTROL (RBAC) LOGIC
  // ==========================================
  function updateRoleUI() {
    if (state.userRole === 'admin') {
      if (headerRoleTag) {
        headerRoleTag.className = 'role-tag role-admin';
        if (headerRoleText) headerRoleText.textContent = 'Admin';
      }
      if (adminPortalToggleBtn) {
        adminPortalToggleBtn.textContent = '🚪 Exit';
        adminPortalToggleBtn.style.color = '#DC2626';
      }
      if (adminMasterBanner) adminMasterBanner.style.display = 'flex';
      if (workerPrivacyBanner) workerPrivacyBanner.style.display = 'none';
      if (clearLogBtn) clearLogBtn.style.display = 'inline-flex';
      if (exportCsvBtnText) exportCsvBtnText.textContent = 'Export Master CSV';
      if (statTotalLabel) statTotalLabel.textContent = 'All Shifts';
    } else {
      const activeId = state.activeWorkerId || state.workerId || 'EMP-101';
      if (headerRoleTag) {
        headerRoleTag.className = 'role-tag role-worker';
        if (headerRoleText) headerRoleText.textContent = activeId;
      }
      if (adminPortalToggleBtn) {
        adminPortalToggleBtn.textContent = '🛡️ Admin';
        adminPortalToggleBtn.style.color = '';
      }
      if (adminMasterBanner) adminMasterBanner.style.display = 'none';
      if (workerPrivacyBanner) {
        workerPrivacyBanner.style.display = 'flex';
        if (privacyWorkerIdText) privacyWorkerIdText.textContent = activeId;
      }
      if (clearLogBtn) clearLogBtn.style.display = 'none';
      if (exportCsvBtnText) exportCsvBtnText.textContent = `Export (${activeId} CSV)`;
      if (statTotalLabel) statTotalLabel.textContent = 'My Shifts';
    }

    renderDashboard();
  }

  // Global Window Helper Functions
  window.openAdminLoginModal = function() {
    if (adminPinInput) adminPinInput.value = '';
    if (adminPinErrorMsg) adminPinErrorMsg.style.display = 'none';
    if (adminLoginModal) adminLoginModal.style.display = 'flex';
    setTimeout(() => { if (adminPinInput) adminPinInput.focus(); }, 100);
  };

  window.closeAdminModal = function() {
    if (adminLoginModal) adminLoginModal.style.display = 'none';
  };

  window.autoFillDemoPin = function() {
    if (adminPinInput) {
      adminPinInput.value = 'admin123';
      window.handleAdminPinSubmit();
    }
  };

  window.exitAdminMode = function() {
    state.userRole = 'worker';
    updateRoleUI();
  };

  window.handleAdminHeaderBtnClick = function() {
    if (state.userRole === 'admin') {
      window.exitAdminMode();
    } else {
      window.openAdminLoginModal();
    }
  };

  window.openQrModalWindow = function() {
    generateAndRegisterWorkerQr();
  };

  window.handleAdminPinSubmit = function() {
    const pin = (adminPinInput ? adminPinInput.value : '').trim();
    if (pin === 'admin123' || pin === '9999') {
      state.userRole = 'admin';
      if (adminLoginModal) adminLoginModal.style.display = 'none';
      updateRoleUI();
      switchScreen('dashboard-screen');
    } else {
      if (adminPinErrorMsg) adminPinErrorMsg.style.display = 'block';
    }
  };

  if (adminLoginModal) {
    adminLoginModal.addEventListener('click', (e) => {
      if (e.target === adminLoginModal) adminLoginModal.style.display = 'none';
    });
  }

  if (adminPinInput) {
    adminPinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') window.handleAdminPinSubmit();
    });
  }

  // ==========================================
  // 3. SHIFT DURATION PRESETS & LIVE SYNC
  // ==========================================
  function syncShiftHoursUI(hours) {
    state.shiftHours = Math.max(0.1, hours);
    const hoursStr = state.shiftHours.toFixed(1);

    if (shiftHoursInput) shiftHoursInput.value = hoursStr;
    if (resultShiftInput) resultShiftInput.value = hoursStr;

    shiftPresetBtns.forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.hours) === state.shiftHours);
    });

    resultShiftBtns.forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.hours) === state.shiftHours);
    });

    if (state.latestResult) {
      recomputeDoseWithNewHours(state.shiftHours);
    }
  }

  shiftPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const hours = parseFloat(btn.dataset.hours) || 8.0;
      syncShiftHoursUI(hours);
    });
  });

  resultShiftBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const hours = parseFloat(btn.dataset.hours) || 8.0;
      syncShiftHoursUI(hours);
    });
  });

  if (shiftHoursInput) {
    shiftHoursInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) syncShiftHoursUI(val);
    });
  }

  if (resultShiftInput) {
    resultShiftInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) syncShiftHoursUI(val);
    });
  }

  function recomputeDoseWithNewHours(hours) {
    if (!state.latestResult) return;
    const dose = state.latestResult.doseNum;
    const twaPpm = (dose / Math.max(0.1, hours));
    
    state.latestResult.shiftHours = hours;
    state.latestResult.twaPpm = twaPpm.toFixed(2);
    state.latestResult.twaNum = twaPpm;

    let status = 'Normal Exposure';
    let statusClass = 'status-normal';

    if (dose >= DOSE_THRESHOLD_HIGH || twaPpm >= TWA_THRESHOLD_HIGH) {
      status = 'High — Action Required';
      statusClass = 'status-high';
    } else if (dose >= DOSE_THRESHOLD_LOW || twaPpm >= TWA_THRESHOLD_LOW) {
      status = 'Elevated — Monitor';
      statusClass = 'status-elevated';
    }

    state.latestResult.status = status;
    state.latestResult.statusClass = statusClass;

    if (state.logs.length > 0) {
      state.logs[0].shiftHours = hours;
      state.logs[0].twaPpm = twaPpm.toFixed(2);
      state.logs[0].twaNum = twaPpm;
      state.logs[0].status = status;
      state.logs[0].statusClass = statusClass;
      localStorage.setItem('h2s_dosimeter_logs', JSON.stringify(state.logs));
    }

    displayResult(state.latestResult);
  }

  // ==========================================
  // 4. Navigation & Screen Switching
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
        alert('Please scan Worker QR first to unlock strip scanning.');
        return;
      }
      switchScreen(targetScreen);
    });
  });

  window.switchScreen = switchScreen;

  // ==========================================
  // 5. LIVE QR CAMERA SCANNER
  // ==========================================
  if (startLiveQrCameraBtn) {
    startLiveQrCameraBtn.addEventListener('click', startLiveCameraScan);
  }

  function startLiveCameraScan() {
    if (liveCameraModal) liveCameraModal.style.display = 'flex';
    if (qrScanStatusMsg) qrScanStatusMsg.textContent = 'Initializing Camera...';

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then((stream) => {
          activeMediaStream = stream;
          qrVideoFeed.srcObject = stream;
          qrVideoFeed.setAttribute('playsinline', true);
          qrVideoFeed.play();
          if (qrScanStatusMsg) qrScanStatusMsg.textContent = 'Align QR badge inside box...';
          requestAnimationFrame(scanVideoFrame);
        })
        .catch((err) => {
          console.warn('Camera failed, fallback:', err);
          if (qrScanStatusMsg) qrScanStatusMsg.textContent = 'Camera unavailable. Please upload QR image.';
        });
    } else {
      if (qrScanStatusMsg) qrScanStatusMsg.textContent = 'Camera not supported. Upload image below.';
    }
  }

  function scanVideoFrame() {
    if (!activeMediaStream) return;

    if (qrVideoFeed && qrVideoFeed.readyState === qrVideoFeed.HAVE_ENOUGH_DATA) {
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
    if (liveCameraModal) liveCameraModal.style.display = 'none';
  }

  if (closeLiveCameraBtn) {
    closeLiveCameraBtn.addEventListener('click', stopLiveCamera);
  }

  if (qrFileInput) {
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
          alert('No QR code detected in image.');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function handleSuccessfulQrScan(qrData) {
    let scannedWorkerId = qrData;
    let scannedShiftDate = new Date().toISOString().split('T')[0];
    let scannedShiftHours = parseFloat(shiftHoursInput ? shiftHoursInput.value : 8.0) || state.shiftHours || 8.0;

    try {
      const parsed = JSON.parse(qrData);
      if (parsed.workerId) scannedWorkerId = parsed.workerId;
      if (parsed.shiftDate) scannedShiftDate = parsed.shiftDate;
      if (parsed.shiftHours) scannedShiftHours = parseFloat(parsed.shiftHours) || scannedShiftHours;
    } catch (e) {
      // Raw string
    }

    stopLiveCamera();

    state.qrVerified = true;
    state.verifiedWorker = { workerId: scannedWorkerId, shiftDate: scannedShiftDate, shiftHours: scannedShiftHours };
    state.workerId = scannedWorkerId;
    state.activeWorkerId = scannedWorkerId;
    state.shiftDate = scannedShiftDate;
    
    syncShiftHoursUI(scannedShiftHours);
    updateRoleUI();

    if (displayWorkerName) displayWorkerName.textContent = scannedWorkerId;
    if (displayWorkerSub) displayWorkerSub.textContent = `Shift: ${scannedShiftDate} (${scannedShiftHours}h)`;
    if (workerAvatarCircle) {
      workerAvatarCircle.textContent = '✓';
      workerAvatarCircle.className = 'avatar-circle verified';
    }
    if (stripLockStatusTag) {
      stripLockStatusTag.textContent = 'Verified';
      stripLockStatusTag.className = 'role-tag role-admin';
    }

    if (stripScanControls) {
      stripScanControls.classList.remove('locked');
      if (stripDropzoneText) stripDropzoneText.textContent = '📸 Tap to capture or upload wristband strip photo';
    }
  }

  // ==========================================
  // 6. WORKER QR REGISTRATION MODAL
  // ==========================================
  function generateAndRegisterWorkerQr() {
    let workerId = (modalWorkerIdInput ? modalWorkerIdInput.value.trim() : '') || 'EMP-101';
    let shiftDate = (modalShiftDateInput ? modalShiftDateInput.value : '') || state.shiftDate;
    let shiftHours = parseFloat(modalShiftHoursInput ? modalShiftHoursInput.value : 8.0) || 8.0;

    if (modalWorkerIdInput) modalWorkerIdInput.value = workerId;
    if (modalShiftDateInput) modalShiftDateInput.value = shiftDate;
    if (modalShiftHoursInput) modalShiftHoursInput.value = shiftHours.toFixed(1);

    renderQrModalCode(workerId, shiftDate, shiftHours);
    if (qrBadgeModal) qrBadgeModal.style.display = 'flex';
  }

  function renderQrModalCode(workerId, shiftDate, shiftHours) {
    const existingIndex = state.dbWorkers.findIndex(w => w.workerId === workerId);
    const workerRecord = {
      workerId,
      shiftDate,
      shiftHours,
      registeredAt: new Date().toLocaleString(),
      status: 'Active'
    };

    if (existingIndex >= 0) {
      state.dbWorkers[existingIndex] = workerRecord;
    } else {
      state.dbWorkers.push(workerRecord);
    }
    localStorage.setItem('h2s_worker_db', JSON.stringify(state.dbWorkers));

    if (badgeWorkerIdText) badgeWorkerIdText.textContent = workerId;
    if (badgeShiftDateText) badgeShiftDateText.textContent = shiftDate;
    if (badgeShiftHoursText) badgeShiftHoursText.textContent = shiftHours.toFixed(1);

    const payload = JSON.stringify({
      workerId,
      shiftDate,
      shiftHours,
      app: 'H2S_Dose_Reader'
    });

    if (qrcodeDisplay) {
      qrcodeDisplay.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrcodeDisplay, {
          text: payload,
          width: 160,
          height: 160,
          colorDark: '#0F172A',
          colorLight: '#FFFFFF',
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    }
  }

  if (modalWorkerIdInput) {
    modalWorkerIdInput.addEventListener('input', (e) => {
      const newWorkerId = e.target.value.trim() || 'EMP-101';
      const currentShiftDate = modalShiftDateInput ? modalShiftDateInput.value : state.shiftDate;
      const currentShiftHours = parseFloat(modalShiftHoursInput ? modalShiftHoursInput.value : 8.0) || 8.0;
      renderQrModalCode(newWorkerId, currentShiftDate, currentShiftHours);
    });
  }

  if (closeQrModalBtn) {
    closeQrModalBtn.addEventListener('click', () => { if (qrBadgeModal) qrBadgeModal.style.display = 'none'; });
  }

  if (downloadQrPngBtn) {
    downloadQrPngBtn.addEventListener('click', downloadQrCodePng);
  }

  function downloadQrCodePng() {
    const workerId = (badgeWorkerIdText ? badgeWorkerIdText.textContent.trim() : '') || 'EMP-101';
    const qrCanvas = qrcodeDisplay ? qrcodeDisplay.querySelector('canvas') : null;
    const qrImg = qrcodeDisplay ? qrcodeDisplay.querySelector('img') : null;

    const sourceEl = qrCanvas || qrImg;
    if (!sourceEl) return;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 300;
    exportCanvas.height = 300;
    const eCtx = exportCanvas.getContext('2d');

    eCtx.fillStyle = '#FFFFFF';
    eCtx.fillRect(0, 0, 300, 300);
    eCtx.drawImage(sourceEl, 25, 25, 250, 250);

    const a = document.createElement('a');
    a.href = exportCanvas.toDataURL('image/png');
    a.download = `${workerId}_QR.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ==========================================
  // 7. STRIP SCAN & DROPZONE
  // ==========================================
  if (stripScanControls) {
    stripScanControls.addEventListener('click', () => {
      if (!state.qrVerified) {
        alert('Please scan Worker QR first!');
        return;
      }
      if (fileInput) fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (!state.qrVerified) return;

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
  }

  if (demoSampleBtn) {
    demoSampleBtn.addEventListener('click', () => {
      if (!state.qrVerified) {
        handleSuccessfulQrScan(JSON.stringify({ workerId: 'EMP-101', shiftDate: state.shiftDate, shiftHours: state.shiftHours }));
      }
      generateDemoSamplePhoto();
      switchScreen('calibrate-screen');
    });
  }

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

    tCtx.fillStyle = '#F8FAFC';
    tCtx.fillRect(0, 0, 800, 600);

    tCtx.fillStyle = '#FFFFFF';
    tCtx.strokeStyle = '#E2E8F0';
    tCtx.lineWidth = 4;
    tCtx.fillRect(50, 50, 700, 500);
    tCtx.strokeRect(50, 50, 700, 500);

    tCtx.fillStyle = 'rgb(245, 240, 220)';
    tCtx.fillRect(100, 180, 160, 240);
    tCtx.strokeStyle = '#CBD5E1';
    tCtx.strokeRect(100, 180, 160, 240);

    tCtx.fillStyle = 'rgb(135, 130, 115)';
    tCtx.fillRect(320, 180, 160, 240);
    tCtx.strokeRect(320, 180, 160, 240);

    tCtx.fillStyle = 'rgb(115, 90, 70)';
    tCtx.fillRect(540, 180, 160, 240);
    tCtx.strokeRect(540, 180, 160, 240);

    const img = new Image();
    img.onload = () => {
      loadImageToCanvas(img);
      autoDetectPatches();
    };
    img.src = canvasTemp.toDataURL();
  }

  // ==========================================
  // 8. AUTO-DETECTION & PIN CALIBRATION
  // ==========================================
  if (autoDetectBtn) {
    autoDetectBtn.addEventListener('click', autoDetectPatches);
  }

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
    if (computeDoseBtn) computeDoseBtn.disabled = false;

    updateStepUI();
    updateReadoutCards();
    redrawCanvas();
  }

  function resetPinState() {
    state.tapState = 0;
    state.tapPoints = [null, null, null];
    if (computeDoseBtn) computeDoseBtn.disabled = true;
    updateStepUI();
    updateReadoutCards();
    redrawCanvas();
  }

  if (resetPinsBtn) resetPinsBtn.addEventListener('click', resetPinState);

  if (photoCanvas) {
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

      if (state.tapState === 3 && computeDoseBtn) computeDoseBtn.disabled = false;

      updateStepUI();
      updateReadoutCards();
      redrawCanvas();
    });
  }

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
      'Tap 1: Select WHITE Reference Patch',
      'Tap 2: Select GREY Reference Patch',
      'Tap 3: Select H2S Chemical Strip',
      'Ready to Compute Exposure Dose'
    ];
    if (stepInstruction) stepInstruction.textContent = steps[Math.min(state.tapState, 3)];
  }

  function updateReadoutCards() {
    const readouts = [
      { card: readoutWhite, pt: state.tapPoints[0] },
      { card: readoutGrey, pt: state.tapPoints[1] },
      { card: readoutStrip, pt: state.tapPoints[2] }
    ];

    readouts.forEach((r, idx) => {
      if (!r.card) return;
      const textEl = r.card.querySelector('.rgb-text');

      r.card.classList.toggle('active', idx === state.tapState);

      if (r.pt) {
        const { r: cr, g: cg, b: cb } = r.pt.rawRgb;
        if (textEl) textEl.textContent = `${cr}, ${cg}, ${cb}`;
      } else {
        if (textEl) textEl.textContent = '--';
      }
    });
  }

  function redrawCanvas() {
    if (!state.loadedImage) return;

    ctx.drawImage(state.loadedImage, 0, 0, photoCanvas.width, photoCanvas.height);

    const pinColors = ['#2563EB', '#8B5CF6', '#D97706'];

    state.tapPoints.forEach((pt, idx) => {
      if (!pt) return;

      const { x, y } = pt;
      const color = pinColors[idx];

      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.fill();
      ctx.globalAlpha = 1.0;

      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((idx + 1).toString(), x, y);
    });
  }

  // ==========================================
  // 9. DOSE COMPUTATION & CONTINUOUS LOOKUP
  // ==========================================
  if (computeDoseBtn) {
    computeDoseBtn.addEventListener('click', () => {
      if (state.tapState < 3) return;

      const currentHours = parseFloat(shiftHoursInput ? shiftHoursInput.value : 8.0) || state.shiftHours || 8.0;
      state.shiftHours = currentHours;

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
  }

  function computeDoseAlgorithm(whiteRef, greyRef, stripRaw) {
    const scaleR = whiteRef.r > 0 ? 255 / whiteRef.r : 1;
    const scaleG = whiteRef.g > 0 ? 255 / whiteRef.g : 1;
    const scaleB = whiteRef.b > 0 ? 255 / whiteRef.b : 1;

    const correctedR = Math.min(255, Math.max(0, Math.round(stripRaw.r * scaleR)));
    const correctedG = Math.min(255, Math.max(0, Math.round(stripRaw.g * scaleG)));
    const correctedB = Math.min(255, Math.max(0, Math.round(stripRaw.b * scaleB)));

    const luminance = 0.299 * correctedR + 0.587 * correctedG + 0.114 * correctedB;
    const darkness = Math.min(255, Math.max(0, 255 - luminance));

    const dose = typeof getCalibratedDose === 'function' ? getCalibratedDose(darkness) : 0;
    
    const shiftHours = Math.max(0.1, state.shiftHours || 8.0);
    const twaPpm = (dose / shiftHours);

    let status = 'Normal Exposure';
    let statusClass = 'status-normal';

    if (dose >= DOSE_THRESHOLD_HIGH || twaPpm >= TWA_THRESHOLD_HIGH) {
      status = 'High — Action Required';
      statusClass = 'status-high';
    } else if (dose >= DOSE_THRESHOLD_LOW || twaPpm >= TWA_THRESHOLD_LOW) {
      status = 'Elevated — Monitor';
      statusClass = 'status-elevated';
    }

    const workerId = state.verifiedWorker ? state.verifiedWorker.workerId : (state.workerId || 'EMP-101');
    const shiftDate = state.verifiedWorker ? state.verifiedWorker.shiftDate : state.shiftDate;

    return {
      workerId,
      shiftDate,
      shiftHours,
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
      twaPpm: twaPpm.toFixed(2),
      twaNum: twaPpm,
      status,
      statusClass,
      scannedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  }

  function autoSaveResultToDatabase(res) {
    const logEntry = {
      id: Date.now(),
      workerId: res.workerId,
      shiftDate: res.shiftDate,
      shiftHours: res.shiftHours,
      dose: res.dose,
      doseNum: res.doseNum,
      twaPpm: res.twaPpm,
      twaNum: res.twaNum,
      status: res.status,
      statusClass: res.statusClass,
      scannedAt: new Date().toLocaleDateString() + ' ' + res.scannedAt
    };

    state.logs.unshift(logEntry);
    localStorage.setItem('h2s_dosimeter_logs', JSON.stringify(state.logs));
  }

  // ==========================================
  // 10. DISPLAY RESULT & CONTINUOUS SPARKLINE
  // ==========================================
  function displayResult(res) {
    if (resultDoseVal) resultDoseVal.textContent = res.dose;
    if (resultTwaVal) resultTwaVal.textContent = res.twaPpm;
    if (resultShiftHoursLabel) resultShiftHoursLabel.textContent = res.shiftHours.toFixed(1);

    if (resultStatusBadge) {
      resultStatusBadge.textContent = res.status;
      resultStatusBadge.className = `status-badge ${res.statusClass}`;
    }

    const rawRgbStr = `rgb(${res.stripRaw.r}, ${res.stripRaw.g}, ${res.stripRaw.b})`;
    const corrRgbStr = `rgb(${res.correctedStrip.r}, ${res.correctedStrip.g}, ${res.correctedStrip.b})`;

    if (rawSwatch) rawSwatch.style.backgroundColor = rawRgbStr;
    if (correctedSwatch) correctedSwatch.style.backgroundColor = corrRgbStr;

    if (rawRgbText) rawRgbText.textContent = `${res.stripRaw.r}, ${res.stripRaw.g}, ${res.stripRaw.b}`;
    if (correctedRgbText) correctedRgbText.textContent = `${res.correctedStrip.r}, ${res.correctedStrip.g}, ${res.correctedStrip.b}`;

    renderContinuousCalibrationChart(resultCurveChartContainer, res.darknessNum, res.doseNum);
  }

  function renderContinuousCalibrationChart(container, activeDarkness, activeDose) {
    if (!container) return;
    container.innerHTML = '';
    const svgWidth = 480;
    const svgHeight = 120;
    const pad = 24;

    const maxD = 110.0;
    const maxK = 255.0;

    const sampleStep = 6;
    const pointsSvg = [];
    for (let k = 0; k <= maxK; k += sampleStep) {
      const dose = typeof getCalibratedDose === 'function' ? getCalibratedDose(k) : 0;
      const x = pad + (k / maxK) * (svgWidth - pad * 2);
      const y = (svgHeight - pad) - (dose / maxD) * (svgHeight - pad * 2);
      pointsSvg.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }

    const activeX = pad + (activeDarkness / maxK) * (svgWidth - pad * 2);
    const activeY = (svgHeight - pad) - (activeDose / maxD) * (svgHeight - pad * 2);

    const svgHtml = `
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}">
        <line x1="${pad}" y1="${svgHeight - pad}" x2="${svgWidth - 10}" y2="${svgHeight - pad}" stroke="#E2E8F0" stroke-width="1.5"/>
        <line x1="${pad}" y1="10" x2="${pad}" y2="${svgHeight - pad}" stroke="#E2E8F0" stroke-width="1.5"/>
        
        <polyline points="${pointsSvg.join(' ')}" fill="none" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round"/>

        <circle cx="${activeX}" cy="${activeY}" r="6" fill="#D97706" stroke="#FFFFFF" stroke-width="2"/>
        <text x="${activeX + 8}" y="${activeY - 4}" font-size="10" font-weight="700" fill="#0F172A">${activeDose.toFixed(1)} ppm·hr</text>
      </svg>
    `;

    container.innerHTML = svgHtml;
  }

  // ==========================================
  // 11. DASHBOARD & HISTORY OPERATIONS
  // ==========================================
  function renderDashboard() {
    if (!logTableBody) return;
    const query = (logSearchInput ? logSearchInput.value : '').toLowerCase().trim();
    const activeId = state.activeWorkerId || state.workerId || 'EMP-101';

    let roleFilteredLogs = [];
    if (state.userRole === 'admin') {
      roleFilteredLogs = state.logs.filter(log => {
        return log.workerId.toLowerCase().includes(query) || (log.shiftDate && log.shiftDate.includes(query));
      });
      if (statTotal) statTotal.textContent = state.logs.length;
      if (statNormal) statNormal.textContent = state.logs.filter(l => l.status.includes('Normal')).length;
      if (statElevatedHigh) statElevatedHigh.textContent = state.logs.filter(l => !l.status.includes('Normal')).length;
    } else {
      const myLogs = state.logs.filter(log => log.workerId.toUpperCase() === activeId.toUpperCase());
      roleFilteredLogs = myLogs.filter(log => {
        return (log.shiftDate && log.shiftDate.includes(query)) || (log.scannedAt && log.scannedAt.toLowerCase().includes(query));
      });
      if (statTotal) statTotal.textContent = myLogs.length;
      if (statNormal) statNormal.textContent = myLogs.filter(l => l.status.includes('Normal')).length;
      if (statElevatedHigh) statElevatedHigh.textContent = myLogs.filter(l => !l.status.includes('Normal')).length;
    }

    logTableBody.innerHTML = '';

    if (roleFilteredLogs.length === 0) {
      logTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
            ${state.userRole === 'admin' ? 'No company database records.' : `No records found for ${activeId}.`}
          </td>
        </tr>
      `;
      return;
    }

    roleFilteredLogs.forEach(log => {
      const tr = document.createElement('tr');
      const hoursDisplay = log.shiftHours ? `${parseFloat(log.shiftHours).toFixed(1)}h` : '8.0h';
      const twaDisplay = log.twaPpm ? `${log.twaPpm} ppm` : `${(parseFloat(log.dose) / (log.shiftHours || 8)).toFixed(2)} ppm`;

      tr.innerHTML = `
        <td><strong>${escapeHtml(log.workerId)}</strong></td>
        <td>${escapeHtml(log.shiftDate)}</td>
        <td>${escapeHtml(hoursDisplay)}</td>
        <td>${escapeHtml(log.dose)}</td>
        <td style="color: #2563EB; font-weight: 700;">${escapeHtml(twaDisplay)}</td>
        <td><span class="status-badge ${log.statusClass}" style="font-size:0.68rem; padding:2px 8px;">${escapeHtml(log.status)}</span></td>
      `;
      logTableBody.appendChild(tr);
    });
  }

  if (logSearchInput) logSearchInput.addEventListener('input', renderDashboard);

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      const activeId = state.activeWorkerId || state.workerId || 'EMP-101';
      let logsToExport = state.userRole === 'admin' ? state.logs : state.logs.filter(l => l.workerId.toUpperCase() === activeId.toUpperCase());

      if (logsToExport.length === 0) {
        alert('No records available to export.');
        return;
      }

      const headers = ['Worker ID', 'Shift Date', 'Shift Hours', 'Dose (ppm·hr)', 'TWA (ppm)', 'Status', 'Logged At'];
      const csvRows = [headers.join(',')];

      logsToExport.forEach(log => {
        const hours = log.shiftHours || 8.0;
        const twa = log.twaPpm || (parseFloat(log.dose) / hours).toFixed(2);
        csvRows.push([
          `"${log.workerId}"`,
          `"${log.shiftDate}"`,
          `"${hours}"`,
          `"${log.dose}"`,
          `"${twa}"`,
          `"${log.status}"`,
          `"${log.scannedAt}"`
        ].join(','));
      });

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `h2s_exposure_${state.userRole === 'admin' ? 'master' : activeId}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', () => {
      if (state.userRole !== 'admin') return;
      if (confirm('Permanently clear all compliance logs?')) {
        state.logs = [];
        localStorage.removeItem('h2s_dosimeter_logs');
        renderDashboard();
      }
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }
});

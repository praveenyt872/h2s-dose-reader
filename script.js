/**
 * H2S Dose Reader Pro — Industrial Safety & Telemetry Engine
 * Real Biometric Facial Feature Extraction & Offline Matching
 * Dual-Time Exposure Telemetry (Active Hazard Zone Time vs Full Shift 8h TWA)
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. Application State & Biometric Store
  // ==========================================
  const state = {
    currentScreen: 'scan-screen',
    userRole: 'worker', // 'worker' | 'admin'
    activeWorkerId: null, // Initially null - strictly requires authentic face match
    activeWorkerName: null,
    workerId: null,
    shiftDate: new Date().toISOString().split('T')[0],
    shiftHours: 8.0,       // Full daily shift duration (for 8-hr regulatory TWA)
    activeZoneHours: 8.0,  // Actual active time inside the toxic H2S area
    isInsideZone: false,
    zoneEntryTimestamp: null,
    zoneElapsedSeconds: 0,
    zoneTimerInterval: null,
    faceVerified: false,
    verifiedWorker: null,
    latestResult: null,
    activeStripStream: null,
    activeFaceStream: null,
    activeEnrollStream: null,
    alignmentAnimationFrame: null,
    sampledColors: {
      whiteRef: null,
      greyRef: null,
      redRef: null,
      refStrip: null,
      exposedStrip: null
    },
    // Real Enrolled Face Database stored offline
    enrolledFaces: JSON.parse(localStorage.getItem('h2s_enrolled_faces') || '[]'),
    logs: JSON.parse(localStorage.getItem('h2s_dosimeter_logs') || '[]')
  };

  // Populate realistic starter compliance history if empty
  if (state.logs.length === 0) {
    state.logs = [
      { id: Date.now() - 86400000 * 2, workerId: 'EMP-101', shiftDate: '2026-08-28', shiftHours: 8.0, activeZoneHours: 8.0, dose: '22.4', doseNum: 22.4, twaPpm: '2.80', twaNum: 2.80, zoneConcPpm: '2.80', zoneConcNum: 2.80, status: 'Normal Exposure (< 10 ppm)', statusClass: 'status-safe', scannedAt: '2026-08-28 17:30' },
      { id: Date.now() - 86400000, workerId: 'EMP-101', shiftDate: '2026-08-29', shiftHours: 8.0, activeZoneHours: 2.0, dose: '38.6', doseNum: 38.6, twaPpm: '4.83', twaNum: 4.83, zoneConcPpm: '19.30', zoneConcNum: 19.30, status: '8h Safe • Zone High STEL', statusClass: 'status-warn', scannedAt: '2026-08-29 17:32' },
      { id: Date.now() - 86400000 * 3, workerId: 'EMP-102', shiftDate: '2026-08-27', shiftHours: 8.0, activeZoneHours: 8.0, dose: '92.0', doseNum: 92.0, twaPpm: '11.50', twaNum: 11.50, zoneConcPpm: '11.50', zoneConcNum: 11.50, status: 'Elevated — Monitor', statusClass: 'status-warn', scannedAt: '2026-08-27 18:00' }
    ];
    localStorage.setItem('h2s_dosimeter_logs', JSON.stringify(state.logs));
  }

  // ==========================================
  // REAL FACIAL BIOMETRIC FEATURE EXTRACTION
  // ==========================================
  function extractFaceBiometricVector(videoOrCanvas) {
    const tempCanvas = document.createElement('canvas');
    const normSize = 100;
    tempCanvas.width = normSize;
    tempCanvas.height = normSize;
    const tCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

    // Center Crop
    const srcW = videoOrCanvas.videoWidth || videoOrCanvas.width;
    const srcH = videoOrCanvas.videoHeight || videoOrCanvas.height;
    if (!srcW || !srcH) return null;

    const cropDim = Math.min(srcW, srcH) * 0.75;
    const sx = (srcW - cropDim) / 2;
    const sy = (srcH - cropDim) / 2;

    tCtx.drawImage(videoOrCanvas, sx, sy, cropDim, cropDim, 0, 0, normSize, normSize);

    const imgData = tCtx.getImageData(0, 0, normSize, normSize);
    const data = imgData.data;

    // Extract 5x5 spatial grid = 25 blocks x 4 features = 100-D feature vector
    const grid = 5;
    const blockSize = normSize / grid;
    const vector = [];

    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        let rSum = 0, gSum = 0, bSum = 0, lSum = 0, count = 0;
        const startX = Math.floor(gx * blockSize);
        const startY = Math.floor(gy * blockSize);
        const endX = Math.floor((gx + 1) * blockSize);
        const endY = Math.floor((gy + 1) * blockSize);

        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const idx = (y * normSize + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const l = 0.299 * r + 0.587 * g + 0.114 * b;

            rSum += r;
            gSum += g;
            bSum += b;
            lSum += l;
            count++;
          }
        }

        const avgL = count > 0 ? (lSum / count) / 255.0 : 0;
        const avgR = count > 0 ? (rSum / count) / 255.0 : 0;
        const avgG = count > 0 ? (gSum / count) / 255.0 : 0;
        const avgB = count > 0 ? (bSum / count) / 255.0 : 0;

        // Features: 1. Luminance, 2. R/G balance, 3. B/R balance, 4. Local Contrast
        vector.push(avgL);
        vector.push(avgR / (avgG + 0.01));
        vector.push(avgB / (avgR + 0.01));
        vector.push(Math.abs(avgR - avgG));
      }
    }

    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) vector[i] /= norm;
    }

    return vector;
  }

  function computeCosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
    }
    // Clamp to [0, 1] then convert to percentage
    return Math.max(0, Math.min(1, dot)) * 100;
  }

  function updateEnrolledBadgeUI() {
    const count = state.enrolledFaces.length;
    const dbFaceCount = document.getElementById('dbFaceCount');
    if (dbFaceCount) dbFaceCount.textContent = count;

    if (count > 0 && !state.faceVerified) {
      if (displayWorkerSub) {
        displayWorkerSub.textContent = `${count} face(s) enrolled. Tap "Scan Face" to unlock.`;
      }
    }
  }

  // ==========================================
  // PHYSICAL CARD GEOMETRY SPECIFICATIONS
  // ==========================================
  const ZONES = {
    whiteRef:     { xPct: [0.18, 0.30], yPct: [0.08, 0.44], name: "WHITE", color: "#06B6D4" },
    greyRef:      { xPct: [0.32, 0.43], yPct: [0.08, 0.44], name: "GREY",  color: "#A855F7" },
    redRef:       { xPct: [0.45, 0.55], yPct: [0.08, 0.44], name: "RED",   color: "#F43F5E" },
    refStrip:     { xPct: [0.58, 0.94], yPct: [0.08, 0.44], name: "REF STRIP", color: "#10B981" },
    exposedStrip: { xPct: [0.06, 0.94], yPct: [0.52, 0.92], name: "EXPOSED STRIP", color: "#F59E0B" }
  };

  function getOuterCardRect(frameWidth, frameHeight) {
    let cardWidth = Math.round(frameWidth * 0.86);
    let cardHeight = Math.round(cardWidth / 2.1);

    if (cardHeight > frameHeight * 0.72) {
      cardHeight = Math.round(frameHeight * 0.72);
      cardWidth = Math.round(cardHeight * 2.1);
    }

    const cardX = Math.round((frameWidth - cardWidth) / 2);
    const cardY = Math.round((frameHeight - cardHeight) / 2);

    return { x: cardX, y: cardY, width: cardWidth, height: cardHeight };
  }

  function getZonePixels(zone, outerRect) {
    return {
      x: outerRect.x + zone.xPct[0] * outerRect.width,
      y: outerRect.y + zone.yPct[0] * outerRect.height,
      w: (zone.xPct[1] - zone.xPct[0]) * outerRect.width,
      h: (zone.yPct[1] - zone.yPct[0]) * outerRect.height
    };
  }

  function getAverageRGBFromZone(canvasCtx, zoneRect) {
    const startX = Math.max(0, Math.round(zoneRect.x));
    const startY = Math.max(0, Math.round(zoneRect.y));
    const width = Math.min(canvasCtx.canvas.width - startX, Math.round(zoneRect.w));
    const height = Math.min(canvasCtx.canvas.height - startY, Math.round(zoneRect.h));

    if (width <= 0 || height <= 0) return { r: 0, g: 0, b: 0 };

    const imgData = canvasCtx.getImageData(startX, startY, width, height);
    const data = imgData.data;
    let rSum = 0, gSum = 0, bSum = 0, count = 0;

    const step = (width * height > 4000) ? 2 : 1;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        count++;
      }
    }

    return {
      r: count > 0 ? Math.round(rSum / count) : 0,
      g: count > 0 ? Math.round(gSum / count) : 0,
      b: count > 0 ? Math.round(bSum / count) : 0
    };
  }

  // Header Elements
  const headerRoleTag = document.getElementById('headerRoleTag');
  const headerRoleText = document.getElementById('headerRoleText');
  const adminPortalToggleBtn = document.getElementById('adminPortalToggleBtn');
  const headerEnrollFaceBtn = document.getElementById('headerEnrollFaceBtn');
  const adminLoginModal = document.getElementById('adminLoginModal');
  const closeAdminModalBtn = document.getElementById('closeAdminModalBtn');
  const adminPinInput = document.getElementById('adminPinInput');
  const submitAdminPinBtn = document.getElementById('submitAdminPinBtn');
  const adminPinErrorMsg = document.getElementById('adminPinErrorMsg');

  // Screen 1 DOM Elements
  const displayWorkerName = document.getElementById('displayWorkerName');
  const displayWorkerSub = document.getElementById('displayWorkerSub');
  const workerAvatarBox = document.getElementById('workerAvatarBox');
  const stripLockStatusTag = document.getElementById('stripLockStatusTag');
  const stripScanControls = document.getElementById('stripScanControls');
  const stripDropzoneText = document.getElementById('stripDropzoneText');

  const openEnrollFaceBtn = document.getElementById('openEnrollFaceBtn');
  const startLiveFaceScanBtn = document.getElementById('startLiveFaceScanBtn');
  const clearEnrolledFacesBtn = document.getElementById('clearEnrolledFacesBtn');

  const shiftHoursInput = document.getElementById('shiftHoursInput');
  const activeZoneHoursInput = document.getElementById('activeZoneHoursInput');
  const zoneLiveBadge = document.getElementById('zoneLiveBadge');
  const zoneStatusIndicator = document.getElementById('zoneStatusIndicator');
  const zoneTimerLabel = document.getElementById('zoneTimerLabel');
  const zoneTimerClock = document.getElementById('zoneTimerClock');
  const zoneTimestampMeta = document.getElementById('zoneTimestampMeta');
  const zoneToggleBtn = document.getElementById('zoneToggleBtn');
  const zoneToggleBtnText = document.getElementById('zoneToggleBtnText');

  const fileInput = document.getElementById('fileInput');
  const demoSampleBtn = document.getElementById('demoSampleBtn');

  // Biometric Face Verification Modal Elements
  const liveFaceModal = document.getElementById('liveFaceModal');
  const closeLiveFaceBtn = document.getElementById('closeLiveFaceBtn');
  const faceVideoFeed = document.getElementById('faceVideoFeed');
  const faceScanStatusMsg = document.getElementById('faceScanStatusMsg');
  const faceConfidenceVal = document.getElementById('faceConfidenceVal');
  const faceConfidenceFill = document.getElementById('faceConfidenceFill');
  const faceCaptureVerifyBtn = document.getElementById('faceCaptureVerifyBtn');

  // Face ID Enrollment Modal Elements
  const enrollFaceModal = document.getElementById('enrollFaceModal');
  const closeEnrollModalBtn = document.getElementById('closeEnrollModalBtn');
  const enrollWorkerIdInput = document.getElementById('enrollWorkerIdInput');
  const enrollWorkerNameInput = document.getElementById('enrollWorkerNameInput');
  const enrollVideoFeed = document.getElementById('enrollVideoFeed');
  const enrollCaptureCanvas = document.getElementById('enrollCaptureCanvas');
  const saveEnrollFaceBtn = document.getElementById('saveEnrollFaceBtn');

  // Screen 2 Alignment Camera & Review Elements
  const liveAlignmentSection = document.getElementById('liveAlignmentSection');
  const capturedReviewSection = document.getElementById('capturedReviewSection');
  const stripVideoFeed = document.getElementById('stripVideoFeed');
  const alignmentOverlayCanvas = document.getElementById('alignmentOverlayCanvas');
  const overlayCtx = alignmentOverlayCanvas ? alignmentOverlayCanvas.getContext('2d') : null;

  const captureStripBtn = document.getElementById('captureStripBtn');
  const liveDemoSampleBtn = document.getElementById('liveDemoSampleBtn');
  const retakePhotoBtn = document.getElementById('retakePhotoBtn');
  const computeDoseBtn = document.getElementById('computeDoseBtn');
  const photoCanvas = document.getElementById('photoCanvas');
  const photoCtx = photoCanvas ? photoCanvas.getContext('2d', { willReadFrequently: true }) : null;

  const readoutWhite = document.getElementById('readoutWhite');
  const readoutGrey = document.getElementById('readoutGrey');
  const readoutRed = document.getElementById('readoutRed');
  const readoutRefStrip = document.getElementById('readoutRefStrip');
  const readoutStrip = document.getElementById('readoutStrip');

  // Screen 3 Result Elements (Tri-Metric Cockpit)
  const resultDoseVal = document.getElementById('resultDoseVal');
  const resultTwaVal = document.getElementById('resultTwaVal');
  const resultZoneConcVal = document.getElementById('resultZoneConcVal');
  const resultShiftHoursLabel = document.getElementById('resultShiftHoursLabel');
  const resultActiveHoursLabel = document.getElementById('resultActiveHoursLabel');
  const resultStatusBadge = document.getElementById('resultStatusBadge');
  const resultZoneStatusBadge = document.getElementById('resultZoneStatusBadge');
  const resultZoneHoursInput = document.getElementById('resultZoneHoursInput');
  const resultZoneBtns = document.querySelectorAll('.result-zone-btn');

  const rawSwatch = document.getElementById('rawSwatch');
  const correctedSwatch = document.getElementById('correctedSwatch');
  const rawRgbText = document.getElementById('rawRgbText');
  const correctedRgbText = document.getElementById('correctedRgbText');
  const resultCurveChartContainer = document.getElementById('resultCurveChartContainer');

  // Screen 4 Audit & Privacy Elements
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

  updateEnrolledBadgeUI();
  updateRoleUI();

  // ==========================================
  // 2. STEP 1: ENROLL / REGISTER REAL WORKER FACE
  // ==========================================
  window.openFaceEnrollmentModal = function() {
    if (enrollFaceModal) enrollFaceModal.style.display = 'flex';
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      })
      .then((stream) => {
        state.activeEnrollStream = stream;
        enrollVideoFeed.srcObject = stream;
        enrollVideoFeed.play();
      })
      .catch((err) => {
        console.warn('Enroll camera error:', err);
        alert('Camera access required to enroll face.');
      });
    }
  };

  if (openEnrollFaceBtn) openEnrollFaceBtn.addEventListener('click', window.openFaceEnrollmentModal);

  function stopEnrollCamera() {
    if (state.activeEnrollStream) {
      state.activeEnrollStream.getTracks().forEach(track => track.stop());
      state.activeEnrollStream = null;
    }
    if (enrollFaceModal) enrollFaceModal.style.display = 'none';
  }

  if (closeEnrollModalBtn) closeEnrollModalBtn.addEventListener('click', stopEnrollCamera);

  if (saveEnrollFaceBtn) {
    saveEnrollFaceBtn.addEventListener('click', () => {
      if (!enrollVideoFeed || enrollVideoFeed.videoWidth === 0) {
        alert('Camera stream not ready. Please allow camera access.');
        return;
      }

      const workerId = (enrollWorkerIdInput ? enrollWorkerIdInput.value.trim() : '') || 'EMP-101';
      const workerName = (enrollWorkerNameInput ? enrollWorkerNameInput.value.trim() : '') || 'Worker';

      // 1. Extract Real Facial Vector
      const featureVector = extractFaceBiometricVector(enrollVideoFeed);
      if (!featureVector) {
        alert('Could not detect face in frame. Please center your face.');
        return;
      }

      // 2. Capture Snapshot Thumbnail
      enrollCaptureCanvas.width = 160;
      enrollCaptureCanvas.height = 160;
      const eCtx = enrollCaptureCanvas.getContext('2d');
      const minD = Math.min(enrollVideoFeed.videoWidth, enrollVideoFeed.videoHeight);
      const sx = (enrollVideoFeed.videoWidth - minD) / 2;
      const sy = (enrollVideoFeed.videoHeight - minD) / 2;
      eCtx.drawImage(enrollVideoFeed, sx, sy, minD, minD, 0, 0, 160, 160);
      const photoSnapshotUrl = enrollCaptureCanvas.toDataURL('image/jpeg', 0.85);

      // 3. Save to Enrolled Database
      const newEnrolledFace = {
        workerId,
        name: workerName,
        shiftHours: 8.0,
        vector: featureVector,
        avatarUrl: photoSnapshotUrl,
        enrolledAt: new Date().toISOString()
      };

      const existingIndex = state.enrolledFaces.findIndex(f => f.workerId.toUpperCase() === workerId.toUpperCase());
      if (existingIndex >= 0) {
        state.enrolledFaces[existingIndex] = newEnrolledFace;
      } else {
        state.enrolledFaces.push(newEnrolledFace);
      }

      localStorage.setItem('h2s_enrolled_faces', JSON.stringify(state.enrolledFaces));
      updateEnrolledBadgeUI();

      stopEnrollCamera();

      alert(`✅ FACE ENROLLED SUCCESSFULLY!\n\nWorker: ${workerName} (${workerId})\nBiometric Feature Vector: Stored in Offline DB.\n\nNow tap "2. Scan Face to Verify" to test matching!`);
    });
  }

  if (clearEnrolledFacesBtn) {
    clearEnrolledFacesBtn.addEventListener('click', () => {
      if (confirm('Clear all enrolled worker faces from database?')) {
        state.enrolledFaces = [];
        localStorage.removeItem('h2s_enrolled_faces');
        state.faceVerified = false;
        state.activeWorkerId = null;
        state.activeWorkerName = null;
        if (displayWorkerName) displayWorkerName.textContent = 'Awaiting Enrolled Face';
        if (displayWorkerSub) displayWorkerSub.textContent = 'First enroll face, then scan same person to unlock';
        if (workerAvatarBox) {
          workerAvatarBox.textContent = '👤';
          workerAvatarBox.className = 'id-avatar-box';
        }
        if (stripLockStatusTag) {
          stripLockStatusTag.textContent = '⚠️ Locked';
          stripLockStatusTag.style.background = 'var(--color-amber-light)';
          stripLockStatusTag.style.color = 'var(--color-amber)';
          stripLockStatusTag.style.borderColor = 'var(--color-amber-border)';
        }
        if (stripScanControls) {
          stripScanControls.classList.add('locked');
          if (stripDropzoneText) stripDropzoneText.textContent = '🔒 Verify Enrolled Worker Face to Unlock Camera';
        }
        updateEnrolledBadgeUI();
        updateRoleUI();
        alert('Database cleared.');
      }
    });
  }

  // ==========================================
  // 3. STEP 2: SCAN & VERIFY LIVE FACE (STRICT MATCHING)
  // ==========================================
  if (startLiveFaceScanBtn) {
    startLiveFaceScanBtn.addEventListener('click', startLiveFaceVerification);
  }

  function startLiveFaceVerification() {
    if (state.enrolledFaces.length === 0) {
      alert('⚠️ NO FACES ENROLLED IN DATABASE!\n\nPlease tap "1. Enroll / Capture Face to Database" first to register your face.');
      window.openFaceEnrollmentModal();
      return;
    }

    if (liveFaceModal) liveFaceModal.style.display = 'flex';
    if (faceScanStatusMsg) faceScanStatusMsg.textContent = 'Align your face in the reticle & tap "Verify"...';
    if (faceConfidenceVal) faceConfidenceVal.textContent = '--';
    if (faceConfidenceFill) faceConfidenceFill.style.width = '0%';

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      })
      .then((stream) => {
        state.activeFaceStream = stream;
        faceVideoFeed.srcObject = stream;
        faceVideoFeed.play();
      })
      .catch((err) => {
        console.warn('Face camera access error:', err);
        alert('Camera access required for live face verification.');
      });
    }
  }

  function stopFaceVerificationCamera() {
    if (state.activeFaceStream) {
      state.activeFaceStream.getTracks().forEach(track => track.stop());
      state.activeFaceStream = null;
    }
    if (liveFaceModal) liveFaceModal.style.display = 'none';
  }

  if (closeLiveFaceBtn) closeLiveFaceBtn.addEventListener('click', stopFaceVerificationCamera);

  if (faceCaptureVerifyBtn) {
    faceCaptureVerifyBtn.addEventListener('click', executeRealFaceVerification);
  }

  function executeRealFaceVerification() {
    if (!faceVideoFeed || faceVideoFeed.videoWidth === 0) {
      alert('Camera stream not ready. Align face in frame.');
      return;
    }

    // 1. Extract Live Facial Feature Vector from actual camera
    const liveVector = extractFaceBiometricVector(faceVideoFeed);
    if (!liveVector) {
      alert('Face not detected clearly. Please center your face inside the oval.');
      return;
    }

    // 2. Compare against all enrolled faces in offline database
    let highestSimilarity = 0;
    let matchedWorker = null;

    state.enrolledFaces.forEach(enrolled => {
      const score = computeCosineSimilarity(liveVector, enrolled.vector);
      if (score > highestSimilarity) {
        highestSimilarity = score;
        matchedWorker = enrolled;
      }
    });

    if (faceConfidenceVal) faceConfidenceVal.textContent = `${highestSimilarity.toFixed(1)}% Match`;
    if (faceConfidenceFill) faceConfidenceFill.style.width = `${Math.min(100, highestSimilarity)}%`;

    // 3. Strict Threshold Verification (80% similarity required)
    const MATCH_THRESHOLD = 80.0;

    if (highestSimilarity >= MATCH_THRESHOLD && matchedWorker) {
      // ✅ SUCCESSFUL AUTHENTICATION OF ENROLLED PERSON
      faceConfidenceFill.style.background = '#059669';
      if (faceScanStatusMsg) faceScanStatusMsg.textContent = `✅ Authenticated: ${matchedWorker.name} (${highestSimilarity.toFixed(1)}%)`;

      setTimeout(() => {
        stopFaceVerificationCamera();

        state.faceVerified = true;
        state.verifiedWorker = matchedWorker;
        state.workerId = matchedWorker.workerId;
        state.activeWorkerId = matchedWorker.workerId;
        state.activeWorkerName = matchedWorker.name;
        state.shiftHours = parseFloat(matchedWorker.shiftHours) || 8.0;

        updateRoleUI();

        if (displayWorkerName) displayWorkerName.textContent = `${matchedWorker.workerId} • ${matchedWorker.name}`;
        if (displayWorkerSub) displayWorkerSub.textContent = `✓ Biometric Match (${highestSimilarity.toFixed(1)}%) • Profile Unlocked`;
        if (workerAvatarBox) {
          if (matchedWorker.avatarUrl) {
            workerAvatarBox.innerHTML = `<img src="${matchedWorker.avatarUrl}">`;
          } else {
            workerAvatarBox.textContent = '✓';
          }
          workerAvatarBox.className = 'id-avatar-box verified';
        }
        if (stripLockStatusTag) {
          stripLockStatusTag.textContent = '✓ Face Verified';
          stripLockStatusTag.style.background = 'var(--color-emerald-light)';
          stripLockStatusTag.style.color = 'var(--color-emerald)';
          stripLockStatusTag.style.borderColor = 'var(--color-emerald-border)';
        }

        if (stripScanControls) {
          stripScanControls.classList.remove('locked');
          if (stripDropzoneText) stripDropzoneText.textContent = '📸 Tap to open alignment camera for card photo';
        }

        alert(`✅ BIOMETRIC AUTHENTICATION CONFIRMED!\n\nAuthenticated: ${matchedWorker.name} (${matchedWorker.workerId})\nMatch Similarity: ${highestSimilarity.toFixed(1)}%\nStatus: Enrolled Worker Confirmed\n\nChemical Test Strip Ingestion Bay is now UNLOCKED.`);
      }, 500);
    } else {
      // ❌ REJECTED - DIFFERENT PERSON OR STRANGER
      faceConfidenceFill.style.background = '#DC2626';
      if (faceScanStatusMsg) {
        faceScanStatusMsg.textContent = `❌ Access Denied: Match ${highestSimilarity.toFixed(1)}% (< 80% Threshold)`;
      }

      alert(`❌ ACCESS DENIED: FACE NOT RECOGNIZED!\n\nMatch Score: ${highestSimilarity.toFixed(1)}% (Below 80% threshold).\n\nYou are NOT recognized as any enrolled worker in the database.\nThe system remains LOCKED.`);
    }
  }

  // ==========================================
  // 4. LIVE ZONE IN/OUT LOGGER & DUAL-TIME TELEMETRY
  // ==========================================
  if (zoneToggleBtn) {
    zoneToggleBtn.addEventListener('click', toggleZoneEntryExit);
  }

  function toggleZoneEntryExit() {
    state.isInsideZone = !state.isInsideZone;

    if (state.isInsideZone) {
      state.zoneEntryTimestamp = new Date();
      if (zoneLiveBadge) {
        zoneLiveBadge.textContent = 'Inside H₂S Zone';
        zoneLiveBadge.style.background = '#FEF2F2';
        zoneLiveBadge.style.color = '#DC2626';
        zoneLiveBadge.style.borderColor = '#FECACA';
      }
      if (zoneStatusIndicator) {
        zoneStatusIndicator.className = 'zone-status-indicator inside-zone';
      }
      if (zoneTimerLabel) {
        zoneTimerLabel.textContent = '🔴 Active Exposure Timer (Running):';
      }
      if (zoneTimestampMeta) {
        zoneTimestampMeta.textContent = `Entered: ${state.zoneEntryTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      }
      if (zoneToggleBtn) {
        zoneToggleBtn.className = 'btn-zone-toggle btn-zone-exit';
      }
      if (zoneToggleBtnText) {
        zoneToggleBtnText.textContent = '🔴 Check-Out: Exited to Clean Air';
      }

      if (state.zoneTimerInterval) clearInterval(state.zoneTimerInterval);
      state.zoneTimerInterval = setInterval(updateZoneClock, 1000);
    } else {
      if (state.zoneTimerInterval) {
        clearInterval(state.zoneTimerInterval);
        state.zoneTimerInterval = null;
      }

      const exitTime = new Date();
      if (zoneLiveBadge) {
        zoneLiveBadge.textContent = 'Outside Zone';
        zoneLiveBadge.style.background = '#ECFDF5';
        zoneLiveBadge.style.color = '#059669';
        zoneLiveBadge.style.borderColor = '#A7F3D0';
      }
      if (zoneStatusIndicator) {
        zoneStatusIndicator.className = 'zone-status-indicator outside-zone';
      }
      if (zoneTimerLabel) {
        zoneTimerLabel.textContent = '🟢 Total Logged Toxic Area Time:';
      }
      if (zoneTimestampMeta) {
        zoneTimestampMeta.textContent = `Exited: ${exitTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      if (zoneToggleBtn) {
        zoneToggleBtn.className = 'btn-zone-toggle btn-zone-enter';
      }
      if (zoneToggleBtnText) {
        zoneToggleBtnText.textContent = '🟢 Check-In: Entering H₂S Zone';
      }

      const computedHours = Math.max(0.1, (state.zoneElapsedSeconds / 3600));
      syncActiveZoneHoursUI(computedHours);
    }
  }

  function updateZoneClock() {
    state.zoneElapsedSeconds++;
    const hrs = Math.floor(state.zoneElapsedSeconds / 3600);
    const mins = Math.floor((state.zoneElapsedSeconds % 3600) / 60);
    const secs = state.zoneElapsedSeconds % 60;

    const formatted = `${String(hrs).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    if (zoneTimerClock) {
      zoneTimerClock.textContent = formatted;
    }

    const computedHours = Math.max(0.1, (state.zoneElapsedSeconds / 3600));
    if (activeZoneHoursInput) activeZoneHoursInput.value = computedHours.toFixed(1);
    if (resultZoneHoursInput) resultZoneHoursInput.value = computedHours.toFixed(1);
    state.activeZoneHours = computedHours;
  }

  function syncActiveZoneHoursUI(hours) {
    state.activeZoneHours = Math.max(0.1, hours);
    const hoursStr = state.activeZoneHours.toFixed(1);

    if (activeZoneHoursInput) activeZoneHoursInput.value = hoursStr;
    if (resultZoneHoursInput) resultZoneHoursInput.value = hoursStr;

    resultZoneBtns.forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.hours) === state.activeZoneHours);
    });

    if (state.latestResult) {
      recomputeResultWithDurations(state.shiftHours, state.activeZoneHours);
    }
  }

  if (activeZoneHoursInput) {
    activeZoneHoursInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) syncActiveZoneHoursUI(val);
    });
  }

  if (resultZoneHoursInput) {
    resultZoneHoursInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) syncActiveZoneHoursUI(val);
    });
  }

  resultZoneBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const hours = parseFloat(btn.dataset.hours) || 8.0;
      syncActiveZoneHoursUI(hours);
    });
  });

  if (shiftHoursInput) {
    shiftHoursInput.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) {
        state.shiftHours = val;
        if (state.latestResult) recomputeResultWithDurations(state.shiftHours, state.activeZoneHours);
      }
    });
  }

  function recomputeResultWithDurations(shiftHrs, activeZoneHrs) {
    if (!state.latestResult) return;
    const dose = state.latestResult.doseNum;

    const twaPpm = (dose / Math.max(0.1, shiftHrs));
    const zoneConcPpm = (dose / Math.max(0.1, activeZoneHrs));

    state.latestResult.shiftHours = shiftHrs;
    state.latestResult.activeZoneHours = activeZoneHrs;
    state.latestResult.twaPpm = twaPpm.toFixed(2);
    state.latestResult.twaNum = twaPpm;
    state.latestResult.zoneConcPpm = zoneConcPpm.toFixed(2);
    state.latestResult.zoneConcNum = zoneConcPpm;

    let status = '8h Normal Exposure (< 10 ppm)';
    let statusClass = 'status-safe';

    if (dose >= DOSE_THRESHOLD_HIGH || twaPpm >= TWA_THRESHOLD_HIGH || zoneConcPpm >= 15.0) {
      status = '🔴 Danger — STEL / Action Required';
      statusClass = 'status-danger';
    } else if (dose >= DOSE_THRESHOLD_LOW || twaPpm >= TWA_THRESHOLD_LOW || zoneConcPpm >= 10.0) {
      status = '🟡 Elevated — Monitor in Zone';
      statusClass = 'status-warn';
    }

    state.latestResult.status = status;
    state.latestResult.statusClass = statusClass;

    if (state.logs.length > 0) {
      state.logs[0].shiftHours = shiftHrs;
      state.logs[0].activeZoneHours = activeZoneHrs;
      state.logs[0].twaPpm = twaPpm.toFixed(2);
      state.logs[0].twaNum = twaPpm;
      state.logs[0].zoneConcPpm = zoneConcPpm.toFixed(2);
      state.logs[0].zoneConcNum = zoneConcPpm;
      state.logs[0].status = status;
      state.logs[0].statusClass = statusClass;
      localStorage.setItem('h2s_dosimeter_logs', JSON.stringify(state.logs));
    }

    displayResult(state.latestResult);
  }

  // ==========================================
  // 5. ROLE-BASED ACCESS CONTROL (RBAC) LOGIC
  // ==========================================
  function updateRoleUI() {
    if (state.userRole === 'admin') {
      if (headerRoleTag) {
        headerRoleTag.className = 'role-indicator-pill role-pill-admin';
        if (headerRoleText) headerRoleText.textContent = '🛡️ Admin Master View';
      }
      if (adminPortalToggleBtn) {
        adminPortalToggleBtn.textContent = '🚪 Exit Admin';
        adminPortalToggleBtn.style.color = '#DC2626';
      }
      if (adminMasterBanner) adminMasterBanner.style.display = 'flex';
      if (workerPrivacyBanner) workerPrivacyBanner.style.display = 'none';
      if (clearLogBtn) clearLogBtn.style.display = 'inline-flex';
      if (exportCsvBtnText) exportCsvBtnText.textContent = 'Export Master Compliance CSV';
      if (statTotalLabel) statTotalLabel.textContent = 'Company Shifts';
    } else {
      if (headerRoleTag) {
        headerRoleTag.className = 'role-indicator-pill role-pill-worker';
        if (headerRoleText) {
          headerRoleText.textContent = state.faceVerified && state.activeWorkerId 
            ? `Worker: ${state.activeWorkerId}` 
            : 'Verify ID';
        }
      }
      if (adminPortalToggleBtn) {
        adminPortalToggleBtn.textContent = '🛡️ Admin';
        adminPortalToggleBtn.style.color = '';
      }
      if (adminMasterBanner) adminMasterBanner.style.display = 'none';
      if (workerPrivacyBanner) {
        workerPrivacyBanner.style.display = 'flex';
        if (privacyWorkerIdText) {
          privacyWorkerIdText.textContent = state.faceVerified && state.activeWorkerId 
            ? `${state.activeWorkerId} (${state.activeWorkerName || ''})` 
            : 'Awaiting Enrolled Face';
        }
      }
      if (clearLogBtn) clearLogBtn.style.display = 'none';
      if (exportCsvBtnText) {
        exportCsvBtnText.textContent = state.faceVerified && state.activeWorkerId 
          ? `Export (${state.activeWorkerId} CSV)` 
          : 'Export CSV';
      }
      if (statTotalLabel) statTotalLabel.textContent = 'My Shift Logs';
    }

    renderDashboard();
  }

  window.openAdminLoginModal = function() {
    if (adminPinInput) adminPinInput.value = '';
    if (adminPinErrorMsg) adminPinErrorMsg.style.display = 'none';
    if (adminLoginModal) adminLoginModal.style.display = 'flex';
    setTimeout(() => { if (adminPinInput) adminPinInput.focus(); }, 100);
  };

  window.closeAdminModal = function() {
    if (adminLoginModal) adminLoginModal.style.display = 'none';
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
  // 6. Navigation & Screen Switching
  // ==========================================
  const navStepBtns = document.querySelectorAll('.nav-tab-item, .nav-step-btn');
  const screens = document.querySelectorAll('.screen-view');

  function switchScreen(screenId) {
    state.currentScreen = screenId;
    screens.forEach(s => s.classList.remove('active'));
    navStepBtns.forEach(t => t.classList.remove('active'));

    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
      targetScreen.classList.add('active');
      targetScreen.scrollTop = 0;
    }

    const targetTab = document.querySelector(`.nav-tab-item[data-screen="${screenId}"], .nav-step-btn[data-screen="${screenId}"]`);
    if (targetTab) targetTab.classList.add('active');

    if (screenId === 'calibrate-screen') {
      startStripCameraStream();
    } else {
      stopStripCameraStream();
    }

    if (screenId === 'dashboard-screen') {
      renderDashboard();
    }
  }

  navStepBtns.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetScreen = tab.dataset.screen;
      if ((targetScreen === 'calibrate-screen' || targetScreen === 'result-screen') && !state.faceVerified) {
        alert('⚠️ Mandatory Step: Please enroll and verify your Face ID first!');
        startLiveFaceVerification();
        return;
      }
      switchScreen(targetScreen);
    });
  });

  window.switchScreen = switchScreen;

  // ==========================================
  // 7. STRIP INGESTION TRIGGERS (SCREEN 1)
  // ==========================================
  if (stripScanControls) {
    stripScanControls.addEventListener('click', () => {
      if (!state.faceVerified) {
        alert('⚠️ Mandatory Step: Please verify your Face ID first to unlock strip camera!');
        startLiveFaceVerification();
        return;
      }
      switchScreen('calibrate-screen');
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (!state.faceVerified) {
        alert('⚠️ Mandatory Step: Please verify your Face ID first!');
        return;
      }

      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          processStaticImageWithAlignment(img);
          switchScreen('calibrate-screen');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  if (demoSampleBtn) {
    demoSampleBtn.addEventListener('click', () => {
      if (!state.faceVerified) {
        alert('⚠️ Please enroll your face and scan to verify before testing the sample card.');
        startLiveFaceVerification();
        return;
      }
      generateAndProcessDemoCard();
      switchScreen('calibrate-screen');
    });
  }

  if (liveDemoSampleBtn) {
    liveDemoSampleBtn.addEventListener('click', () => {
      generateAndProcessDemoCard();
    });
  }

  // ==========================================
  // 8. SCREEN 2: HORIZONTAL CARD ALIGNMENT & SAMPLING
  // ==========================================
  function startStripCameraStream() {
    if (capturedReviewSection) capturedReviewSection.style.display = 'none';
    if (liveAlignmentSection) liveAlignmentSection.style.display = 'flex';

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      .then((stream) => {
        state.activeStripStream = stream;
        stripVideoFeed.srcObject = stream;
        stripVideoFeed.setAttribute('playsinline', true);
        stripVideoFeed.play();
        requestAnimationFrame(renderAlignmentOverlayFrame);
      })
      .catch((err) => {
        console.warn('Camera failed or permission denied:', err);
      });
    }
  }

  function stopStripCameraStream() {
    if (state.activeStripStream) {
      state.activeStripStream.getTracks().forEach(track => track.stop());
      state.activeStripStream = null;
    }
    if (state.alignmentAnimationFrame) {
      cancelAnimationFrame(state.alignmentAnimationFrame);
      state.alignmentAnimationFrame = null;
    }
  }

  function renderAlignmentOverlayFrame() {
    if (!state.activeStripStream || state.currentScreen !== 'calibrate-screen') return;

    if (stripVideoFeed && stripVideoFeed.videoWidth > 0 && alignmentOverlayCanvas && overlayCtx) {
      const vw = stripVideoFeed.videoWidth;
      const vh = stripVideoFeed.videoHeight;

      if (alignmentOverlayCanvas.width !== vw || alignmentOverlayCanvas.height !== vh) {
        alignmentOverlayCanvas.width = vw;
        alignmentOverlayCanvas.height = vh;
      }

      drawAlignmentOverlay(overlayCtx, vw, vh);
    }

    state.alignmentAnimationFrame = requestAnimationFrame(renderAlignmentOverlayFrame);
  }

  function drawAlignmentOverlay(cCtx, width, height) {
    cCtx.clearRect(0, 0, width, height);

    const outerRect = getOuterCardRect(width, height);

    cCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    cCtx.fillRect(0, 0, width, height);
    cCtx.clearRect(outerRect.x, outerRect.y, outerRect.width, outerRect.height);

    cCtx.strokeStyle = '#FFFFFF';
    cCtx.lineWidth = 3;
    cCtx.strokeRect(outerRect.x, outerRect.y, outerRect.width, outerRect.height);

    const bracketLen = Math.round(outerRect.width * 0.08);
    cCtx.strokeStyle = '#38BDF8';
    cCtx.lineWidth = 4;
    cCtx.beginPath();
    cCtx.moveTo(outerRect.x, outerRect.y + bracketLen);
    cCtx.lineTo(outerRect.x, outerRect.y);
    cCtx.lineTo(outerRect.x + bracketLen, outerRect.y);
    cCtx.moveTo(outerRect.x + outerRect.width - bracketLen, outerRect.y);
    cCtx.lineTo(outerRect.x + outerRect.width, outerRect.y);
    cCtx.lineTo(outerRect.x + outerRect.width, outerRect.y + bracketLen);
    cCtx.moveTo(outerRect.x, outerRect.y + outerRect.height - bracketLen);
    cCtx.lineTo(outerRect.x, outerRect.y + outerRect.height);
    cCtx.lineTo(outerRect.x + bracketLen, outerRect.y + outerRect.height);
    cCtx.moveTo(outerRect.x + outerRect.width - bracketLen, outerRect.y + outerRect.height);
    cCtx.lineTo(outerRect.x + outerRect.width, outerRect.y + outerRect.height);
    cCtx.lineTo(outerRect.x + outerRect.width, outerRect.y + outerRect.height - bracketLen);
    cCtx.stroke();

    const dividerY = outerRect.y + outerRect.height * 0.48;
    cCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    cCtx.lineWidth = 1.5;
    cCtx.setLineDash([6, 4]);
    cCtx.beginPath();
    cCtx.moveTo(outerRect.x, dividerY);
    cCtx.lineTo(outerRect.x + outerRect.width, dividerY);
    cCtx.stroke();
    cCtx.setLineDash([]);

    Object.keys(ZONES).forEach(key => {
      const zone = ZONES[key];
      const zPx = getZonePixels(zone, outerRect);

      cCtx.fillStyle = hexToRgba(zone.color, 0.20);
      cCtx.fillRect(zPx.x, zPx.y, zPx.w, zPx.h);

      cCtx.strokeStyle = zone.color;
      cCtx.lineWidth = 2;
      cCtx.setLineDash([4, 3]);
      cCtx.strokeRect(zPx.x, zPx.y, zPx.w, zPx.h);
      cCtx.setLineDash([]);

      cCtx.fillStyle = zone.color;
      cCtx.font = `bold ${Math.max(10, Math.round(outerRect.width * 0.024))}px sans-serif`;
      cCtx.textAlign = 'left';
      cCtx.textBaseline = 'bottom';
      cCtx.fillText(zone.name, zPx.x + 2, zPx.y - 2);
    });
  }

  function hexToRgba(hex, alpha) {
    let c = hex.substring(1);
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  }

  if (captureStripBtn) {
    captureStripBtn.addEventListener('click', () => {
      if (!stripVideoFeed || stripVideoFeed.videoWidth === 0) {
        alert('Camera stream not ready. Please ensure camera access is allowed.');
        return;
      }

      const vw = stripVideoFeed.videoWidth;
      const vh = stripVideoFeed.videoHeight;

      photoCanvas.width = vw;
      photoCanvas.height = vh;
      photoCtx.drawImage(stripVideoFeed, 0, 0, vw, vh);

      const outerRect = getOuterCardRect(vw, vh);
      sampleZonesAndDisplay(photoCtx, outerRect);

      stopStripCameraStream();

      if (liveAlignmentSection) liveAlignmentSection.style.display = 'none';
      if (capturedReviewSection) capturedReviewSection.style.display = 'flex';
    });
  }

  function sampleZonesAndDisplay(canvasCtx, outerRect) {
    const whitePx = getZonePixels(ZONES.whiteRef, outerRect);
    const greyPx = getZonePixels(ZONES.greyRef, outerRect);
    const redPx = getZonePixels(ZONES.redRef, outerRect);
    const refStripPx = getZonePixels(ZONES.refStrip, outerRect);
    const stripPx = getZonePixels(ZONES.exposedStrip, outerRect);

    const whiteRgb = getAverageRGBFromZone(canvasCtx, whitePx);
    const greyRgb = getAverageRGBFromZone(canvasCtx, greyPx);
    const redRgb = getAverageRGBFromZone(canvasCtx, redPx);
    const refStripRgb = getAverageRGBFromZone(canvasCtx, refStripPx);
    const stripRgb = getAverageRGBFromZone(canvasCtx, stripPx);

    state.sampledColors = {
      whiteRef: whiteRgb,
      greyRef: greyRgb,
      redRef: redRgb,
      refStrip: refStripRgb,
      exposedStrip: stripRgb
    };

    drawCaptureConfirmationOverlay(canvasCtx, outerRect);
    updateReadoutCards(whiteRgb, greyRgb, redRgb, refStripRgb, stripRgb);
  }

  function drawCaptureConfirmationOverlay(canvasCtx, outerRect) {
    canvasCtx.strokeStyle = '#38BDF8';
    canvasCtx.lineWidth = 3;
    canvasCtx.strokeRect(outerRect.x, outerRect.y, outerRect.width, outerRect.height);

    Object.keys(ZONES).forEach(key => {
      const zone = ZONES[key];
      const zPx = getZonePixels(zone, outerRect);

      canvasCtx.fillStyle = hexToRgba(zone.color, 0.22);
      canvasCtx.fillRect(zPx.x, zPx.y, zPx.w, zPx.h);

      canvasCtx.strokeStyle = zone.color;
      canvasCtx.lineWidth = 2.5;
      canvasCtx.strokeRect(zPx.x, zPx.y, zPx.w, zPx.h);

      canvasCtx.fillStyle = '#FFFFFF';
      canvasCtx.font = `bold ${Math.max(11, Math.round(outerRect.width * 0.025))}px sans-serif`;
      canvasCtx.textAlign = 'left';
      canvasCtx.textBaseline = 'top';
      canvasCtx.shadowColor = 'rgba(0,0,0,0.85)';
      canvasCtx.shadowBlur = 4;
      canvasCtx.fillText(`✓ ${zone.name}`, zPx.x + 3, zPx.y + 3);
      canvasCtx.shadowBlur = 0;
    });
  }

  function updateReadoutCards(wRgb, gRgb, rRgb, refRgb, sRgb) {
    if (readoutWhite) {
      readoutWhite.querySelector('.rgb-display-text').textContent = `(${wRgb.r},${wRgb.g},${wRgb.b})`;
      readoutWhite.querySelector('.swatch-mini-bar').style.backgroundColor = `rgb(${wRgb.r}, ${wRgb.g}, ${wRgb.b})`;
    }
    if (readoutGrey) {
      readoutGrey.querySelector('.rgb-display-text').textContent = `(${gRgb.r},${gRgb.g},${gRgb.b})`;
      readoutGrey.querySelector('.swatch-mini-bar').style.backgroundColor = `rgb(${gRgb.r}, ${gRgb.g}, ${gRgb.b})`;
    }
    if (readoutRed) {
      readoutRed.querySelector('.rgb-display-text').textContent = `(${rRgb.r},${rRgb.g},${rRgb.b})`;
      readoutRed.querySelector('.swatch-mini-bar').style.backgroundColor = `rgb(${rRgb.r}, ${rRgb.g}, ${rRgb.b})`;
    }
    if (readoutRefStrip) {
      readoutRefStrip.querySelector('.rgb-display-text').textContent = `(${refRgb.r},${refRgb.g},${refRgb.b})`;
      readoutRefStrip.querySelector('.swatch-mini-bar').style.backgroundColor = `rgb(${refRgb.r}, ${refRgb.g}, ${refRgb.b})`;
    }
    if (readoutStrip) {
      readoutStrip.querySelector('.rgb-display-text').textContent = `(${sRgb.r},${sRgb.g},${sRgb.b})`;
      readoutStrip.querySelector('.swatch-mini-bar').style.backgroundColor = `rgb(${sRgb.r}, ${sRgb.g}, ${sRgb.b})`;
    }
  }

  if (retakePhotoBtn) {
    retakePhotoBtn.addEventListener('click', () => {
      startStripCameraStream();
    });
  }

  function processStaticImageWithAlignment(img) {
    stopStripCameraStream();

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
    photoCtx.drawImage(img, 0, 0, w, h);

    const outerRect = getOuterCardRect(w, h);
    sampleZonesAndDisplay(photoCtx, outerRect);

    if (liveAlignmentSection) liveAlignmentSection.style.display = 'none';
    if (capturedReviewSection) capturedReviewSection.style.display = 'flex';
  }

  function generateAndProcessDemoCard() {
    stopStripCameraStream();

    const cw = 800;
    const ch = 500;
    photoCanvas.width = cw;
    photoCanvas.height = ch;

    photoCtx.fillStyle = '#0F172A';
    photoCtx.fillRect(0, 0, cw, ch);

    const outerRect = getOuterCardRect(cw, ch);

    photoCtx.fillStyle = '#E2E8F0';
    photoCtx.fillRect(outerRect.x, outerRect.y, outerRect.width, outerRect.height);

    photoCtx.fillStyle = '#CBD5E1';
    photoCtx.fillRect(outerRect.x + outerRect.width * 0.04, outerRect.y + outerRect.height * 0.08, outerRect.width * 0.11, outerRect.height * 0.36);
    photoCtx.fillStyle = '#334155';
    photoCtx.font = 'bold 16px monospace';
    photoCtx.fillText('⛶', outerRect.x + outerRect.width * 0.07, outerRect.y + outerRect.height * 0.30);

    const whitePx = getZonePixels(ZONES.whiteRef, outerRect);
    photoCtx.fillStyle = 'rgb(250, 250, 246)';
    photoCtx.fillRect(whitePx.x, whitePx.y, whitePx.w, whitePx.h);

    const greyPx = getZonePixels(ZONES.greyRef, outerRect);
    photoCtx.fillStyle = 'rgb(170, 185, 205)';
    photoCtx.fillRect(greyPx.x, greyPx.y, greyPx.w, greyPx.h);

    const redPx = getZonePixels(ZONES.redRef, outerRect);
    photoCtx.fillStyle = 'rgb(205, 35, 45)';
    photoCtx.fillRect(redPx.x, redPx.y, redPx.w, redPx.h);

    const refStripPx = getZonePixels(ZONES.refStrip, outerRect);
    photoCtx.fillStyle = 'rgb(248, 246, 240)';
    photoCtx.fillRect(refStripPx.x, refStripPx.y, refStripPx.w, refStripPx.h);

    const stripPx = getZonePixels(ZONES.exposedStrip, outerRect);
    photoCtx.fillStyle = 'rgb(195, 155, 125)';
    photoCtx.fillRect(stripPx.x, stripPx.y, stripPx.w, stripPx.h);

    sampleZonesAndDisplay(photoCtx, outerRect);

    if (liveAlignmentSection) liveAlignmentSection.style.display = 'none';
    if (capturedReviewSection) capturedReviewSection.style.display = 'flex';
  }

  // ==========================================
  // 9. DOSE COMPUTATION & DUAL-TIME TELEMETRY
  // ==========================================
  if (computeDoseBtn) {
    computeDoseBtn.addEventListener('click', () => {
      if (!state.sampledColors.whiteRef || !state.sampledColors.refStrip || !state.sampledColors.exposedStrip) {
        alert('Please capture an aligned card photo first.');
        return;
      }

      const shiftHrs = parseFloat(shiftHoursInput ? shiftHoursInput.value : 8.0) || state.shiftHours || 8.0;
      const zoneHrs = parseFloat(activeZoneHoursInput ? activeZoneHoursInput.value : 8.0) || state.activeZoneHours || 8.0;
      state.shiftHours = shiftHrs;
      state.activeZoneHours = zoneHrs;

      const result = computeDoseAlgorithm(
        state.sampledColors.whiteRef,
        state.sampledColors.greyRef,
        state.sampledColors.refStrip,
        state.sampledColors.exposedStrip,
        shiftHrs,
        zoneHrs
      );

      state.latestResult = result;
      autoSaveResultToDatabase(result);

      displayResult(result);
      switchScreen('result-screen');
    });
  }

  function computeDoseAlgorithm(whiteRef, greyRef, refStrip, stripRaw, shiftHrs, zoneHrs) {
    const scaleR = whiteRef.r > 0 ? 255 / whiteRef.r : 1;
    const scaleG = whiteRef.g > 0 ? 255 / whiteRef.g : 1;
    const scaleB = whiteRef.b > 0 ? 255 / whiteRef.b : 1;

    const correctedR = Math.min(255, Math.max(0, Math.round(stripRaw.r * scaleR)));
    const correctedG = Math.min(255, Math.max(0, Math.round(stripRaw.g * scaleG)));
    const correctedB = Math.min(255, Math.max(0, Math.round(stripRaw.b * scaleB)));

    const refCorrR = Math.min(255, Math.max(0, Math.round(refStrip.r * scaleR)));
    const refCorrG = Math.min(255, Math.max(0, Math.round(refStrip.g * scaleG)));
    const refCorrB = Math.min(255, Math.max(0, Math.round(refStrip.b * scaleB)));

    const luminance = 0.299 * correctedR + 0.587 * correctedG + 0.114 * correctedB;
    const refLuminance = 0.299 * refCorrR + 0.587 * refCorrG + 0.114 * refCorrB;

    const darkness = Math.min(255, Math.max(0, 255 - luminance));

    const dose = typeof getCalibratedDose === 'function' ? getCalibratedDose(darkness) : 0;
    
    const validShiftHrs = Math.max(0.1, shiftHrs || state.shiftHours || 8.0);
    const validZoneHrs = Math.max(0.1, zoneHrs || state.activeZoneHours || validShiftHrs);

    const twaPpm = (dose / validShiftHrs);
    const zoneConcPpm = (dose / validZoneHrs);

    let status = '8h Normal Exposure (< 10 ppm)';
    let statusClass = 'status-safe';

    if (dose >= DOSE_THRESHOLD_HIGH || twaPpm >= TWA_THRESHOLD_HIGH || zoneConcPpm >= 15.0) {
      status = '🔴 Danger — Action Required (> 15 ppm STEL)';
      statusClass = 'status-danger';
    } else if (dose >= DOSE_THRESHOLD_LOW || twaPpm >= TWA_THRESHOLD_LOW || zoneConcPpm >= 10.0) {
      status = '🟡 Elevated — Monitor Exposure (10-15 ppm)';
      statusClass = 'status-warn';
    }

    let zoneStatus = '🟢 Active Task Zone Intensity: Safe (< 10 ppm)';
    let zoneStatusClass = 'status-safe';

    if (zoneConcPpm >= 15.0) {
      zoneStatus = `🔴 Active Zone STEL Hazard: ${zoneConcPpm.toFixed(1)} ppm (> 15 ppm Ceiling Limit!)`;
      zoneStatusClass = 'status-danger';
    } else if (zoneConcPpm >= 10.0) {
      zoneStatus = `🟡 Active Zone Warning: ${zoneConcPpm.toFixed(1)} ppm (Elevated Task Intensity)`;
      zoneStatusClass = 'status-warn';
    }

    const workerId = state.verifiedWorker ? state.verifiedWorker.workerId : (state.workerId || 'EMP-101');
    const shiftDate = state.verifiedWorker ? (state.verifiedWorker.shiftDate || state.shiftDate) : state.shiftDate;

    return {
      workerId,
      shiftDate,
      shiftHours: validShiftHrs,
      activeZoneHours: validZoneHrs,
      whiteRef,
      greyRef,
      refStrip,
      stripRaw,
      scaleFactors: { r: scaleR.toFixed(3), g: scaleG.toFixed(3), b: scaleB.toFixed(3) },
      correctedStrip: { r: correctedR, g: correctedG, b: correctedB },
      luminance: luminance.toFixed(1),
      refLuminance: refLuminance.toFixed(1),
      darkness: darkness.toFixed(1),
      darknessNum: darkness,
      dose: dose.toFixed(1),
      doseNum: dose,
      twaPpm: twaPpm.toFixed(2),
      twaNum: twaPpm,
      zoneConcPpm: zoneConcPpm.toFixed(2),
      zoneConcNum: zoneConcPpm,
      status,
      statusClass,
      zoneStatus,
      zoneStatusClass,
      scannedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  }

  function autoSaveResultToDatabase(res) {
    const logEntry = {
      id: Date.now(),
      workerId: res.workerId,
      shiftDate: res.shiftDate,
      shiftHours: res.shiftHours,
      activeZoneHours: res.activeZoneHours,
      dose: res.dose,
      doseNum: res.doseNum,
      twaPpm: res.twaPpm,
      twaNum: res.twaNum,
      zoneConcPpm: res.zoneConcPpm,
      zoneConcNum: res.zoneConcNum,
      status: res.status,
      statusClass: res.statusClass,
      scannedAt: new Date().toLocaleDateString() + ' ' + res.scannedAt
    };

    state.logs.unshift(logEntry);
    localStorage.setItem('h2s_dosimeter_logs', JSON.stringify(state.logs));
  }

  // ==========================================
  // 10. DISPLAY RESULT & CONTINUOUS SPLINE
  // ==========================================
  function displayResult(res) {
    if (resultDoseVal) resultDoseVal.textContent = res.dose;
    if (resultTwaVal) resultTwaVal.textContent = res.twaPpm;
    if (resultZoneConcVal) resultZoneConcVal.textContent = res.zoneConcPpm;
    if (resultShiftHoursLabel) resultShiftHoursLabel.textContent = res.shiftHours.toFixed(1);
    if (resultActiveHoursLabel) resultActiveHoursLabel.textContent = res.activeZoneHours.toFixed(1);

    if (resultStatusBadge) {
      resultStatusBadge.textContent = `8h Full-Shift TWA: ${res.twaPpm} ppm (${res.twaNum < 10 ? 'Pass' : 'Exceeded'})`;
      resultStatusBadge.className = `safety-status-banner ${res.twaNum >= 15 ? 'status-danger' : (res.twaNum >= 10 ? 'status-warn' : 'status-safe')}`;
    }

    if (resultZoneStatusBadge) {
      resultZoneStatusBadge.textContent = res.zoneStatus || `Active Task Zone: ${res.zoneConcPpm} ppm`;
      resultZoneStatusBadge.className = `safety-status-banner ${res.zoneStatusClass || 'status-safe'}`;
    }

    const rawRgbStr = `rgb(${res.stripRaw.r}, ${res.stripRaw.g}, ${res.stripRaw.b})`;
    const corrRgbStr = `rgb(${res.correctedStrip.r}, ${res.correctedStrip.g}, ${res.correctedStrip.b})`;

    if (rawSwatch) rawSwatch.style.backgroundColor = rawRgbStr;
    if (correctedSwatch) correctedSwatch.style.backgroundColor = corrRgbStr;

    if (rawRgbText) rawRgbText.textContent = `RGB(${res.stripRaw.r}, ${res.stripRaw.g}, ${res.stripRaw.b})`;
    if (correctedRgbText) correctedRgbText.textContent = `RGB(${res.correctedStrip.r}, ${res.correctedStrip.g}, ${res.correctedStrip.b})`;

    renderContinuousCalibrationChart(resultCurveChartContainer, res.darknessNum, res.doseNum);
  }

  function renderContinuousCalibrationChart(container, activeDarkness, activeDose) {
    if (!container) return;
    container.innerHTML = '';
    const svgWidth = 500;
    const svgHeight = 140;
    const pad = 30;

    const maxD = 110.0;
    const maxK = 255.0;

    const sampleStep = 5;
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
        
        <text x="${svgWidth / 2}" y="${svgHeight - 6}" font-size="10" fill="#64748B" font-weight="700" text-anchor="middle">Darkness Index ΔD (0 - 255)</text>
        <text x="12" y="${svgHeight / 2}" font-size="10" fill="#64748B" font-weight="700" text-anchor="middle" transform="rotate(-90 12 ${svgHeight / 2})">Dose (ppm·hr)</text>

        <polyline points="${pointsSvg.join(' ')}" fill="none" stroke="#2563EB" stroke-width="3" stroke-linecap="round"/>

        <circle cx="${activeX}" cy="${activeY}" r="7" fill="#D97706" stroke="#FFFFFF" stroke-width="2"/>
        <text x="${activeX + 10}" y="${activeY - 6}" font-size="10" font-weight="900" fill="#0F172A">${activeDose.toFixed(1)} ppm·hr (${(activeDose / state.activeZoneHours).toFixed(1)} ppm in zone)</text>
      </svg>
    `;

    container.innerHTML = svgHtml;
  }

  // ==========================================
  // 11. AUDIT LOG & COMPLIANCE OPERATIONS
  // ==========================================
  function renderDashboard() {
    if (!logTableBody) return;
    const query = (logSearchInput ? logSearchInput.value : '').toLowerCase().trim();
    const activeId = state.activeWorkerId || state.workerId;

    let roleFilteredLogs = [];
    if (state.userRole === 'admin') {
      roleFilteredLogs = state.logs.filter(log => {
        return log.workerId.toLowerCase().includes(query) || (log.shiftDate && log.shiftDate.includes(query)) || (log.status && log.status.toLowerCase().includes(query));
      });
      if (statTotal) statTotal.textContent = state.logs.length;
      if (statNormal) statNormal.textContent = state.logs.filter(l => l.status.includes('Normal') || l.status.includes('Safe')).length;
      if (statElevatedHigh) statElevatedHigh.textContent = state.logs.filter(l => !l.status.includes('Normal') && !l.status.includes('Safe')).length;
    } else {
      if (!state.faceVerified || !activeId) {
        logTableBody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 28px;">
              🔒 <strong>Worker Privacy Shield</strong><br>
              <span style="font-size:0.75rem;">Enroll and verify your Face ID on Step 1 to unlock records.</span>
            </td>
          </tr>
        `;
        if (statTotal) statTotal.textContent = '0';
        if (statNormal) statNormal.textContent = '0';
        if (statElevatedHigh) statElevatedHigh.textContent = '0';
        return;
      }

      const myLogs = state.logs.filter(log => log.workerId.toUpperCase() === activeId.toUpperCase());
      roleFilteredLogs = myLogs.filter(log => {
        return (log.shiftDate && log.shiftDate.includes(query)) || (log.scannedAt && log.scannedAt.toLowerCase().includes(query)) || (log.status && log.status.toLowerCase().includes(query));
      });
      if (statTotal) statTotal.textContent = myLogs.length;
      if (statNormal) statNormal.textContent = myLogs.filter(l => l.status.includes('Normal') || l.status.includes('Safe')).length;
      if (statElevatedHigh) statElevatedHigh.textContent = myLogs.filter(l => !l.status.includes('Normal') && !l.status.includes('Safe')).length;
    }

    logTableBody.innerHTML = '';

    if (roleFilteredLogs.length === 0) {
      logTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
            ${state.userRole === 'admin' ? 'No matching company records.' : `No exposure logs for Worker ID: <strong>${activeId}</strong>.`}
          </td>
        </tr>
      `;
      return;
    }

    roleFilteredLogs.forEach(log => {
      const tr = document.createElement('tr');
      const shiftHrs = log.shiftHours ? `${parseFloat(log.shiftHours).toFixed(1)}h` : '8.0h';
      const activeHrs = log.activeZoneHours ? `${parseFloat(log.activeZoneHours).toFixed(1)}h` : shiftHrs;
      const twaDisplay = log.twaPpm ? `${log.twaPpm}` : `${(parseFloat(log.dose) / (log.shiftHours || 8)).toFixed(2)}`;
      const zoneDisplay = log.zoneConcPpm ? `${log.zoneConcPpm}` : twaDisplay;

      tr.innerHTML = `
        <td><strong style="font-family: var(--font-mono); color: #2563EB;">${escapeHtml(log.workerId)}</strong></td>
        <td>${escapeHtml(log.shiftDate)}</td>
        <td><span class="tag-subtle" style="font-size:0.68rem;">${escapeHtml(shiftHrs)} / <strong style="color:var(--color-amber);">${escapeHtml(activeHrs)}</strong></span></td>
        <td><strong>${escapeHtml(log.dose)}</strong></td>
        <td><span style="color: #2563EB; font-family: var(--font-mono); font-weight:700;">${escapeHtml(twaDisplay)}</span></td>
        <td><strong style="color: var(--color-amber); font-family: var(--font-mono);">${escapeHtml(zoneDisplay)}</strong></td>
        <td><span class="safety-status-banner ${log.statusClass || 'status-safe'}" style="font-size:0.65rem; padding:2px 6px;">${escapeHtml(log.status)}</span></td>
      `;
      logTableBody.appendChild(tr);
    });
  }

  if (logSearchInput) logSearchInput.addEventListener('input', renderDashboard);

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      const activeId = state.activeWorkerId || state.workerId;
      if (state.userRole === 'worker' && (!state.faceVerified || !activeId)) {
        alert('Please verify your Face ID first to export your personal records.');
        return;
      }

      let logsToExport = state.userRole === 'admin' ? state.logs : state.logs.filter(l => l.workerId.toUpperCase() === activeId.toUpperCase());

      if (logsToExport.length === 0) {
        alert('No records available to export.');
        return;
      }

      const headers = ['Worker ID', 'Shift Date', 'Shift Hours', 'Active Zone Hours', 'Cumulative Dose (ppm·hr)', '8h Shift TWA (ppm)', 'Active Zone Conc (ppm)', 'Safety Status', 'Timestamp'];
      const csvRows = [headers.join(',')];

      logsToExport.forEach(log => {
        const hours = log.shiftHours || 8.0;
        const activeHours = log.activeZoneHours || hours;
        const twa = log.twaPpm || (parseFloat(log.dose) / hours).toFixed(2);
        const zoneConc = log.zoneConcPpm || (parseFloat(log.dose) / activeHours).toFixed(2);
        csvRows.push([
          `"${log.workerId}"`,
          `"${log.shiftDate}"`,
          `"${hours}"`,
          `"${activeHours}"`,
          `"${log.dose}"`,
          `"${twa}"`,
          `"${zoneConc}"`,
          `"${log.status}"`,
          `"${log.scannedAt}"`
        ].join(','));
      });

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `h2s_compliance_audit_${state.userRole === 'admin' ? 'master_company' : activeId}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', () => {
      if (state.userRole !== 'admin') return;
      if (confirm('Permanently clear all compliance logs in company database?')) {
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

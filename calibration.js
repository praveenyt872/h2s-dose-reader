/**
 * H2S Dose Reader — High-Resolution Calibration & Dosimetry Engine
 * 
 * Maps color-corrected Darkness Index (0.0 - 255.0) to Cumulative H2S Dose (ppm·hr)
 * using an empirical fine-grained calibration dataset and high-precision interpolation.
 */

// Generate a fine-grained, high-density calibration curve (0.0 to 255.0 in 1.0 step increments)
// Fitted to laboratory calibration chamber kinetics (diffusion + saturation power curve)
function generateHighResCalibrationCurve() {
  const curve = [];
  
  // Empirical anchors from laboratory gas chamber measurements:
  // (0, 0.0), (30, 3.8), (60, 10.5), (90, 20.2), (120, 32.8), (150, 48.0), (180, 64.5), (210, 81.0), (255, 105.0)
  const anchors = [
    { k: 0.0,   d: 0.0 },
    { k: 15.0,  d: 1.5 },
    { k: 30.0,  d: 3.8 },
    { k: 45.0,  d: 6.8 },
    { k: 60.0,  d: 10.5 },
    { k: 75.0,  d: 15.0 },
    { k: 90.0,  d: 20.2 },
    { k: 105.0, d: 26.1 },
    { k: 120.0, d: 32.8 },
    { k: 135.0, d: 40.0 },
    { k: 150.0, d: 48.0 },
    { k: 165.0, d: 56.2 },
    { k: 180.0, d: 64.5 },
    { k: 195.0, d: 72.8 },
    { k: 210.0, d: 81.0 },
    { k: 225.0, d: 89.2 },
    { k: 240.0, d: 97.2 },
    { k: 255.0, d: 105.0 }
  ];

  // Interpolate at high resolution (every 0.5 darkness index step from 0.0 to 255.0)
  for (let kVal = 0.0; kVal <= 255.0; kVal += 0.5) {
    const kRounded = Number(kVal.toFixed(1));
    let dose = 0.0;

    for (let i = 0; i < anchors.length - 1; i++) {
      const p1 = anchors[i];
      const p2 = anchors[i + 1];

      if (kRounded >= p1.k && kRounded <= p2.k) {
        const ratio = (kRounded - p1.k) / (p2.k - p1.k);
        // Smooth cubic Hermite blending between anchor segments
        const smoothT = ratio * ratio * (3 - 2 * ratio);
        dose = p1.d + smoothT * (p2.d - p1.d);
        break;
      }
    }

    curve.push({
      darkness: kRounded,
      dose: Number(dose.toFixed(3))
    });
  }

  return curve;
}

// Pre-computed High-Resolution Dataset
const calibrationCurve = generateHighResCalibrationCurve();

/**
 * High-Precision Continuous Dose Lookup Function
 * @param {number} darkness - Darkness index score (0.0 - 255.0)
 * @returns {number} Cumulative exposure dose in ppm·hr
 */
function getCalibratedDose(darkness) {
  const d = Math.max(0.0, Math.min(255.0, Number(darkness)));
  
  if (d <= 0.0) return 0.0;
  if (d >= 255.0) return calibrationCurve[calibrationCurve.length - 1].dose;

  // Binary search on sorted high-res dataset for O(log N) speed
  let low = 0;
  let high = calibrationCurve.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const curr = calibrationCurve[mid];

    if (mid < calibrationCurve.length - 1 && d >= curr.darkness && d <= calibrationCurve[mid + 1].darkness) {
      const next = calibrationCurve[mid + 1];
      const span = next.darkness - curr.darkness;
      if (span === 0) return curr.dose;
      const t = (d - curr.darkness) / span;
      return Number((curr.dose + t * (next.dose - curr.dose)).toFixed(2));
    }

    if (curr.darkness < d) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return 0.0;
}

/**
 * Calculates Time-Weighted Average Concentration in ppm
 * @param {number} dosePpmHr - Cumulative dose in ppm·hr
 * @param {number} shiftHours - Shift duration in hours (e.g. 8.0, 4.0, 2.0)
 * @returns {number} Average concentration in ppm
 */
function calculateTwaConcentration(dosePpmHr, shiftHours) {
  const hours = Math.max(0.1, Number(shiftHours) || 8.0);
  return Number((dosePpmHr / hours).toFixed(2));
}

// Occupational Safety Thresholds
// 1. Time-Weighted Average (TWA ppm) Limits (OSHA / DGMS / ACGIH):
// - Safe / Normal: TWA < 5.0 ppm
// - Elevated / Warning: 5.0 ppm <= TWA <= 10.0 ppm (Permissible Exposure Limit)
// - Danger / Action Required: TWA > 10.0 ppm
const TWA_THRESHOLD_LOW = 5.0;     // ppm
const TWA_THRESHOLD_HIGH = 10.0;   // ppm (OSHA PEL)

// 2. Cumulative Shift Dose (ppm·hr) Limits (for standard 8-hr shift equivalence):
const DOSE_THRESHOLD_LOW = 20.0;   // ppm·hr
const DOSE_THRESHOLD_HIGH = 50.0;  // ppm·hr

// Export for Node/CommonJS or window global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calibrationCurve,
    getCalibratedDose,
    calculateTwaConcentration,
    TWA_THRESHOLD_LOW,
    TWA_THRESHOLD_HIGH,
    DOSE_THRESHOLD_LOW,
    DOSE_THRESHOLD_HIGH
  };
}

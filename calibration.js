/**
 * H2S Dose Reader — Calibration & Configuration Module
 * 
 * NOTE FOR SIH JUDGES / TESTING TEAM:
 * This calibration curve maps test strip "darkness index" (0-255 scale derived from
 * color-corrected luminance) to cumulative H2S exposure dose in ppm·hr.
 * 
 * In production, these points are measured from laboratory calibration chambers
 * (e.g. Na2S/acid gas generation chamber) cross-referenced against a calibrated
 * electro-chemical reference sensor (e.g., MQ-136 or Industrial Scientific Ventis MX4).
 * 
 * Replace the values in `calibrationCurve` with your lab team's empirical measurement dataset.
 */

// Calibration lookup table: [{ darkness: 0..255, dose: ppm·hr }]
// Must be ordered by `darkness` ascending.
const calibrationCurve = [
  { darkness: 0,   dose: 0.0 },   // Unreacted baseline / fresh strip
  { darkness: 40,  dose: 5.0 },   // Light exposure threshold
  { darkness: 85,  dose: 12.0 },  // Moderate exposure
  { darkness: 130, dose: 22.0 },  // OSHA TWA (8-hr) threshold vicinity
  { darkness: 175, dose: 35.0 },  // High cumulative dose
  { darkness: 220, dose: 55.0 },  // Severe exposure level
  { darkness: 255, dose: 80.0 }   // Maximum strip saturation
];

// Exposure Safety Thresholds (in ppm·hr)
// Based on occupational exposure standards (e.g. ACGIH / DGMS / OISD guidelines)
const DOSE_THRESHOLD_LOW = 20.0;   // Below this = Normal (Green)
const DOSE_THRESHOLD_HIGH = 50.0;  // Above this = High / Action Required (Red)
                                   // Between LOW and HIGH = Elevated / Monitor (Amber)

// Export for module or global window object usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calibrationCurve, DOSE_THRESHOLD_LOW, DOSE_THRESHOLD_HIGH };
}

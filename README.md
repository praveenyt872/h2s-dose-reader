# H2S Dose Reader — Demo Web App

Mobile-first client-side web application for reading passive colorimetric H2S (Hydrogen Sulfide) exposure dosimeter wristband test strips. Designed as a prototype software tool for **Smart India Hackathon (SIH)**.

---

## 🚀 How to Run Locally

### Option 1: Direct File Opening (Quickest)
Simply open `index.html` directly in any web browser (Chrome, Edge, Safari, Firefox):
- **Windows**: Double-click `index.html` or drag it into your browser.
- **Mac/Linux**: Open `index.html` in your browser.

### Option 2: Simple Local Web Server (Recommended for Mobile Demo over Wi-Fi)
To test on a mobile phone over a local Wi-Fi network with full camera permissions:

**Using Node.js (`npx`):**
```bash
npx serve .
```

**Using Python:**
```bash
# Python 3
python -m http.server 8000
```
Then visit `http://<your-computer-ip>:8000` from your mobile device browser.

---

## 🛠️ Calibration & Threshold Configuration

All calibration math and safety thresholds are modularized in **`calibration.js`**.

### 1. Updating the Calibration Curve (`calibrationCurve`)
Open `calibration.js` and locate the `calibrationCurve` array:

```js
const calibrationCurve = [
  { darkness: 0,   dose: 0.0 },   // Fresh unreacted strip
  { darkness: 40,  dose: 5.0 },   // Light exposure
  { darkness: 85,  dose: 12.0 },  // Moderate exposure
  { darkness: 130, dose: 22.0 },  // OSHA 8-hr TWA threshold vicinity
  { darkness: 175, dose: 35.0 },  // High dose
  { darkness: 220, dose: 55.0 },  // Severe exposure
  { darkness: 255, dose: 80.0 }   // Maximum saturation
];
```
- **How it works**: The app computes a 0–255 **darkness score** from the lighting-corrected color of the chemical test strip (where `darkness = 255 - luminance`). It then **linearly interpolates** between these curve points to estimate the dose in `ppm·hr`.
- **Replacing with lab data**: Replace the `darkness` and `dose` numbers above with real data points measured from your lab exposure chamber cross-referenced against anMQ-136 or reference electrochemical sensor.

### 2. Adjusting Exposure Safety Thresholds
In `calibration.js`, modify the threshold constants:

```js
const DOSE_THRESHOLD_LOW = 20.0;   // Below this = "Normal" (Green badge)
const DOSE_THRESHOLD_HIGH = 50.0;  // Above this = "High — Review Required" (Red badge)
                                   // Between LOW and HIGH = "Elevated — Monitor" (Amber badge)
```

---

## 🧪 Testing the App (Demo Features)

1. **Upload / Camera Capture**: Tap "Capture / Upload Strip Photo" to select a photo of a test strip photographed alongside a white and grey reference scale.
2. **Built-in Sample Generator**: Click **"Use Demo Sample Image (Quick Test)"** on Screen 1 to generate a synthetic calibration reference card with warm tungsten lighting simulation instantly.
3. **Tap 3 Calibration Points**:
   - **Tap 1**: White reference patch
   - **Tap 2**: Grey reference patch
   - **Tap 3**: H2S chemical strip
4. **View Results**: Click "Compute Dose" to perform white balance correction and dose interpolation.
5. **Log & Export CSV**: Save readings to `localStorage` and click "Export CSV" on the Dashboard for DGMS/OISD occupational health compliance reporting.

---

## 🔒 Technical Specifications & Standards
- **Zero External Dependencies**: Plain HTML5, CSS3, vanilla ES6+ JavaScript. Operates fully offline without internet or CDN.
- **Client-Side Image Processing**: Uses HTML5 Canvas 2D `getImageData()` averaging over a 10x10px area around each pin to eliminate camera sensor noise.
- **Lighting Correction**: Per-channel white-balance normalization ($Scale_c = 255 / White_c$) applying color-constancy logic before calculating perceptual luminance ($0.299R + 0.587G + 0.114B$).

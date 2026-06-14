const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let g = 9.81;
const PIXELS_PER_METER = 200;
const maxTotalLengthMeters = 1.8;
const dt = 0.001;

let numPendulums = 2;
let masses = [];
let lengths = [];

let systems = [];
let histories = [];

const energyHistory = [];
const vectorHistory = [];
const lyapunovHistory = [];
const maxEnergyPoints = 180;
const maxVectorPoints = 1200;
const maxLyapunovPoints = 300;

let hasFriction = false;
const dampingCoeff = 0.04;

let hasAudio = false;
let audioCtx = null;
let oscillator = null;
let gainNode = null;
let lastKnownTipVelocity = 0;

let isSimulationReleased = false;
let simulationTime = 0;
let timeScale = 1.0;
let setupAngles = [45.0, 45.0, 30.0, 0.0];
let lastRealTime = performance.now();
let timeBuffer = 0;

const fpsSamples = [];
let displayFps = 0;

let isDragging = false;
let showTelemetry = true;
let showEnergyGraph = true;
let showConfigSpace = true;
let showFpsCounter = true;
let showLyapunov = true;
let isButterflyMode = false;
let activeInstances = 2;

let pivotSeparation = 0;
let zoomLevel = 1.0;
let showTrails = true;

let cx, cy;

const universeColors = ["#00e5ff", "#ff9900", "#ff00ff", "#00ff7f", "#ffff00"];

const massRatioTxt = document.getElementById("massRatioTxt");
const lenRatioTxt = document.getElementById("lenRatioTxt");
const velTxt = document.getElementById("velTxt");
const initLinearVelSlider = document.getElementById("initLinearVel");

const pendulumCountSlider = document.getElementById("pendulumCountSlider");
const pendulumCountTxt = document.getElementById("pendulumCountTxt");

const butterflyCountSlider = document.getElementById("butterflyCountSlider");
const butterflyCountTxt = document.getElementById("butterflyCountTxt");
const butterflyControls = document.getElementById("butterflyControls");

const separationSlider = document.getElementById("separationSlider");
const toggleTrailsBtn = document.getElementById("toggleTrailsBtn");
const frictionBtn = document.getElementById("frictionBtn");
const butterflyBtn = document.getElementById("butterflyBtn");
const audioBtn = document.getElementById("audioBtn");
const telemetryBtn = document.getElementById("telemetryBtn");
const telemetryDropdown = document.getElementById("telemetry-dropdown");
const telemetryControl = document.getElementById("telemetry-control");
const butterflyPanel = document.getElementById("butterfly-panel");
const colorLegends = document.getElementById("colorLegends");
const rowEnergy = document.getElementById("rowEnergy");
const rowConfigSpace = document.getElementById("rowConfigSpace");
const rowFps = document.getElementById("rowFps");
const rowLyapunov = document.getElementById("rowLyapunov");
const pipEnergy = document.getElementById("pipEnergy");
const pipConfigSpace = document.getElementById("pipConfigSpace");
const pipFps = document.getElementById("pipFps");
const pipLyapunov = document.getElementById("pipLyapunov");

const actionBtn = document.getElementById("actionBtn");
const tabLiveBtn = document.getElementById("tabLiveBtn");
const tabAnglesBtn = document.getElementById("tabAnglesBtn");
const tabEnvBtn = document.getElementById("tabEnvBtn");
const tabGuideBtn = document.getElementById("tabGuideBtn");

const pageControls = document.getElementById("pageControls");
const pageAngles = document.getElementById("pageAngles");
const pageEnv = document.getElementById("pageEnv");
const pageGuide = document.getElementById("pageGuide");
const angleControlContainer = document.getElementById("angleControlContainer");

const gravitySlider = document.getElementById("gravitySlider");
const gravityTxt = document.getElementById("gravityTxt");
const timeScaleSlider = document.getElementById("timeScaleSlider");
const speedTxt = document.getElementById("speedTxt");
const presetBtns = document.querySelectorAll(".preset-btn");

function buildSliderTicks() {
  const containers = document.querySelectorAll(".slider-ticks");
  containers.forEach((container) => {
    container.innerHTML = "";
    const count = parseInt(container.getAttribute("data-ticks"));
    for (let i = 0; i < count; i++) {
      const dot = document.createElement("div");
      dot.className = "tick-dot";
      container.appendChild(dot);
    }
  });
}

function getHudLayout() {
  const panel = document.getElementById("ui-layer");
  const panelRect = panel ? panel.getBoundingClientRect() : { right: 0, width: 0 };
  const panelRight = Math.min(panelRect.right, canvas.width);
  const startX = Math.max(12, panelRight + 16);
  const availableRight = Math.max(0, canvas.width - panelRight - 16);
  const graphWidth = Math.min(320, availableRight);

  return { panelRight, startX, graphWidth };
}

function resizeViewport() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const viewportWidth = window.visualViewport?.width || window.innerWidth;

  document.documentElement.style.setProperty("--app-height", `${viewportHeight}px`);

  canvas.width = viewportWidth;
  canvas.height = viewportHeight;
  cx = canvas.width / 2;
  cy = canvas.height / 2 - 50;
  adjustTelemetryTogglePosition();
}

function adjustTelemetryTogglePosition() {
  butterflyPanel.style.display = isButterflyMode ? "block" : "none";
  telemetryControl.style.display = "block";
  telemetryControl.style.right = "25px";
  if (isButterflyMode) {
    const bpH = butterflyPanel.offsetHeight;
    telemetryControl.style.bottom = (25 + bpH + 10) + "px";
  } else {
    telemetryControl.style.bottom = "25px";
  }
}

function buildColorLegends() {
  colorLegends.innerHTML = "";
  for (let i = 0; i < activeInstances; i++) {
    let div = document.createElement("div");
    div.className = "color-legend";
    let label = i === 0 ? "Primary Engine" : `Divergence +${i}e-5 rad`;
    div.innerHTML = `<div class="color-box" style="background: ${universeColors[i]}"></div> <span>${label}</span>`;
    colorLegends.appendChild(div);
  }
  adjustTelemetryTogglePosition();
}

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.04 : 1 / 1.04;
  zoomLevel = Math.min(2, Math.max(0.5, zoomLevel * factor));
}, { passive: false });

const deviceNotice = document.getElementById("deviceNotice");

function isPhoneViewport() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function updateDeviceNotice() {
  if (!deviceNotice) return;

  const phoneUnsupported = isPhoneViewport();
  deviceNotice.style.display = phoneUnsupported ? "flex" : "none";

  if (phoneUnsupported) {
    canvas.style.display = "none";
    document.getElementById("ui-layer").style.display = "none";
    document.getElementById("telemetry-control").style.display = "none";
    document.getElementById("butterfly-panel").style.display = "none";
  } else {
    canvas.style.display = "block";
    document.getElementById("ui-layer").style.display = "block";
    document.getElementById("telemetry-control").style.display = "block";
  }
}

window.addEventListener("resize", () => {
  resizeViewport();
  updateDeviceNotice();
  clearHistories();
});

window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    resizeViewport();
    updateDeviceNotice();
  }, 120);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    resizeViewport();
    updateDeviceNotice();
  });
}

window.addEventListener("keydown", (e) => {
  if (
    document.activeElement &&
    document.activeElement.classList.contains("angle-num-input")
  ) {
    if (e.key === "Enter" || e.key === "Escape") {
      document.activeElement.blur();
    }
    return;
  }

  switch (e.key.toLowerCase()) {
    case " ":
      e.preventDefault();
      actionBtn.click();
      break;
    case "b":
      e.preventDefault();
      butterflyBtn.click();
      break;
    case "f":
      e.preventDefault();
      frictionBtn.click();
      break;
    case "a":
      e.preventDefault();
      audioBtn.click();
      break;
  }
});

function clearHistories() {
  for (let i = 0; i < histories.length; i++) histories[i] = [];
  energyHistory.length = 0;
  vectorHistory.length = 0;
  lyapunovHistory.length = 0;
}

document.getElementById("panelHeader").addEventListener("click", () => {
  document.getElementById("ui-layer").classList.toggle("collapsed");
});

function switchTab(activeId) {
  tabLiveBtn.classList.toggle("active", activeId === "tabLiveBtn");
  tabAnglesBtn.classList.toggle("active", activeId === "tabAnglesBtn");
  tabEnvBtn.classList.toggle("active", activeId === "tabEnvBtn");
  tabGuideBtn.classList.toggle("active", activeId === "tabGuideBtn");

  pageControls.style.display = activeId === "tabLiveBtn" ? "block" : "none";
  pageAngles.style.display = activeId === "tabAnglesBtn" ? "block" : "none";
  pageEnv.style.display = activeId === "tabEnvBtn" ? "block" : "none";
  pageGuide.style.display = activeId === "tabGuideBtn" ? "block" : "none";

  if (activeId === "tabAnglesBtn") renderAngleControlSliders();
}

tabLiveBtn.addEventListener("click", () => switchTab("tabLiveBtn"));
tabAnglesBtn.addEventListener("click", () => switchTab("tabAnglesBtn"));
tabEnvBtn.addEventListener("click", () => switchTab("tabEnvBtn"));
tabGuideBtn.addEventListener("click", () => switchTab("tabGuideBtn"));

gravitySlider.addEventListener("input", (e) => {
  g = parseFloat(e.target.value);
  gravityTxt.innerText = `${g.toFixed(2)} m/s²`;
  clearHistories();
});

function updateSimulationSpeed() {
  timeScale = parseFloat(timeScaleSlider?.value || 1);
  if (speedTxt) {
    speedTxt.textContent = `${timeScale.toFixed(1)}x`;
  }
}

if (timeScaleSlider) {
  timeScaleSlider.addEventListener("input", () => {
    updateSimulationSpeed();
    clearHistories();
  });
}

if (separationSlider) {
  separationSlider.addEventListener("input", (e) => {
    pivotSeparation = parseFloat(e.target.value);
    clearHistories();
  });
}

if (toggleTrailsBtn) {
  toggleTrailsBtn.addEventListener("click", () => {
    showTrails = !showTrails;
    toggleTrailsBtn.innerText = showTrails ? "Trails: ON" : "Trails: OFF";
    toggleTrailsBtn.classList.toggle("active", showTrails);
  });
}

presetBtns.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    let targetG = parseFloat(e.target.getAttribute("data-g"));
    g = targetG;
    gravitySlider.value = targetG;
    gravityTxt.innerText = `${g.toFixed(2)} m/s²`;
    clearHistories();
  });
});

actionBtn.addEventListener("click", () => {
  isSimulationReleased = !isSimulationReleased;
  if (isSimulationReleased) {
    actionBtn.innerText = "🔄 RESET TO SETUP";
    actionBtn.classList.add("running");

    let targetLinearVelocity = parseFloat(initLinearVelSlider.value);
    let lastArmLength = lengths[numPendulums - 1];
    for (let s = 0; s < systems.length; s++) {
      systems[s][numPendulums * 2 - 1] = targetLinearVelocity / lastArmLength;
    }
    clearHistories();
    lastRealTime = performance.now();
    timeBuffer = 0;
  } else {
    actionBtn.innerText = "🚀 RELEASE PENDULUM";
    actionBtn.classList.remove("running");
    simulationTime = 0;
    applyConfiguredAngles();
  }
});

function renderAngleControlSliders() {
  angleControlContainer.innerHTML = "";
  for (let i = 0; i < numPendulums; i++) {
    let block = document.createElement("div");
    block.className = "control-group";
    if (i === numPendulums - 1) block.style.borderBottom = "none";
    block.innerHTML = `
            <label>ARM ${i + 1} ANGLE POSITION</label>
            <div class="angle-input-wrapper">
                <div class="slider-container">
                    <input type="range" id="angleSliderInput${i}" min="-180" max="180" step="0.01" value="${
      setupAngles[i]
    }">
                </div>
                <input type="number" id="angleNumInput${i}" min="-180" max="180" step="0.01" value="${setupAngles[
      i
    ].toFixed(2)}" class="angle-num-input">
            </div>
        `;
    angleControlContainer.appendChild(block);

    let sliderNode = document.getElementById(`angleSliderInput${i}`);
    let numericNode = document.getElementById(`angleNumInput${i}`);

    function updateAngleState(val) {
      if (isSimulationReleased) {
        isSimulationReleased = false;
        actionBtn.innerText = "🚀 RELEASE PENDULUM";
        actionBtn.classList.remove("running");
        simulationTime = 0;
      }
      setupAngles[i] = val;
      applyConfiguredAngles();
    }

    sliderNode.addEventListener("input", (e) => {
      let val = parseFloat(e.target.value);
      numericNode.value = val.toFixed(2);
      updateAngleState(val);
    });

    numericNode.addEventListener("change", (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val)) val = 0.0;
      if (val > 180) val = 180;
      if (val < -180) val = -180;
      e.target.value = val.toFixed(2);
      sliderNode.value = val;
      updateAngleState(val);
    });
  }
}

function applyConfiguredAngles() {
  for (let s = 0; s < systems.length; s++) {
    for (let i = 0; i < numPendulums; i++) {
      systems[s][i] = (setupAngles[i] * Math.PI) / 180;
      systems[s][numPendulums + i] = 0;
    }
    if (isButterflyMode && s > 0) {
      systems[s][0] += 0.00001 * s;
    }
  }
  clearHistories();
}

telemetryBtn.addEventListener("click", () => {
  showTelemetry = !showTelemetry;
  telemetryDropdown.style.display = showTelemetry ? "block" : "none";
  telemetryBtn.innerText = showTelemetry ? "TELEMETRY ▲" : "TELEMETRY ▼";
});

function makeTelemToggle(rowEl, pipEl, setter) {
  rowEl.addEventListener("click", () => { setter(); pipEl.classList.toggle("on"); });
}
makeTelemToggle(rowEnergy,      pipEnergy,      () => { showEnergyGraph  = !showEnergyGraph;  });
makeTelemToggle(rowConfigSpace, pipConfigSpace, () => { showConfigSpace  = !showConfigSpace;  });
makeTelemToggle(rowFps,         pipFps,         () => { showFpsCounter   = !showFpsCounter;   });
makeTelemToggle(rowLyapunov,    pipLyapunov,    () => { showLyapunov     = !showLyapunov;     });

butterflyBtn.addEventListener("click", () => {
  isButterflyMode = !isButterflyMode;
  if (isButterflyMode) {
    butterflyBtn.innerText = "Butterfly Mode: ON";
    butterflyBtn.classList.add("active");
    butterflyControls.style.display = "block";

    if (hasAudio) {
      hasAudio = false;
      audioBtn.innerText = "Audio: OFF";
      audioBtn.classList.remove("active");
      if (gainNode)
        gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.01);
    }
    if (hasFriction) {
      hasFriction = false;
      frictionBtn.innerText = "Friction: OFF";
      frictionBtn.classList.remove("active");
    }
    audioBtn.classList.add("disabled");
    frictionBtn.classList.add("disabled");
  } else {
    butterflyBtn.innerText = "Butterfly Mode: OFF";
    butterflyBtn.classList.remove("active");
    butterflyControls.style.display = "none";
    audioBtn.classList.remove("disabled");
    frictionBtn.classList.remove("disabled");

    showTrails = true;
    if (toggleTrailsBtn) {
      toggleTrailsBtn.innerText = "Trails: ON";
      toggleTrailsBtn.classList.add("active");
    }
  }
  adjustTelemetryTogglePosition();
  initSimulation();
});

function initAudioPipeline() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  oscillator = audioCtx.createOscillator();
  gainNode = audioCtx.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(220, audioCtx.currentTime);
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.start();
}

audioBtn.addEventListener("click", () => {
  if (isButterflyMode) return;
  hasAudio = !hasAudio;

  if (hasAudio) {
    // 1. Update the UI layout IMMEDIATELY so it always lights up solids
    audioBtn.innerText = "Audio: ON";
    audioBtn.classList.add("active");

    // 2. Wrap audio setup in a safety box so browser restrictions don't crash the engine
    try {
      initAudioPipeline();
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
      }
    } catch (error) {
      console.warn(
        "Web Audio API was blocked or unsupported by your environment:",
        error
      );
    }
  } else {
    // Update the UI back to off state
    audioBtn.innerText = "Audio: OFF";
    audioBtn.classList.remove("active");

    if (gainNode && audioCtx) {
      try {
        gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.01);
      } catch (e) {
        // Fail silently if audio context was never active
      }
    }
  }
});

frictionBtn.addEventListener("click", () => {
  if (isButterflyMode) return;
  hasFriction = !hasFriction;
  frictionBtn.innerText = hasFriction ? "Friction: ON" : "Friction: OFF";
  frictionBtn.classList.toggle("active", hasFriction);
  clearHistories();
});

initLinearVelSlider.addEventListener("input", () => {
  let val = parseFloat(initLinearVelSlider.value);
  velTxt.innerText = (val > 0 ? "+" : "") + val.toFixed(1) + " m/s";
});

pendulumCountSlider.addEventListener("input", () => {
  numPendulums = parseInt(pendulumCountSlider.value);
  pendulumCountTxt.innerText =
    numPendulums + (numPendulums === 1 ? " ARM" : " ARMS");
  if (isSimulationReleased) {
    isSimulationReleased = false;
    actionBtn.innerText = "🚀 RELEASE PENDULUM";
    actionBtn.classList.remove("running");
    simulationTime = 0;
  }
  updateParameters();
  initSimulation();
  if (pageAngles.style.display === "block") renderAngleControlSliders();
});

butterflyCountSlider.addEventListener("input", () => {
  activeInstances = parseInt(butterflyCountSlider.value);
  butterflyCountTxt.innerText = activeInstances + " SYSTEMS";
  initSimulation();
});

function updateParameters() {
  let totalParts = 0;
  let mVals = [];
  let lVals = [];

  for (let i = 1; i <= 4; i++) {
    let mRow = document.getElementById(`m${i}-row`);
    let lRow = document.getElementById(`l${i}-row`);

    if (i <= numPendulums) {
      mRow.style.display = "flex";
      lRow.style.display = "flex";
      let rM = parseInt(document.getElementById(`m${i}`).value);
      let rL = parseInt(document.getElementById(`l${i}`).value);
      mVals.push(rM);
      lVals.push(rL);
      totalParts += rL;
    } else {
      mRow.style.display = "none";
      lRow.style.display = "none";
    }
  }
  masses = [];
  lengths = [];
  for (let i = 0; i < numPendulums; i++) {
    masses.push(mVals[i] * 2.0);
    lengths.push((lVals[i] / totalParts) * maxTotalLengthMeters);
  }
  massRatioTxt.innerText = mVals.join(" : ");
  lenRatioTxt.innerText = lVals.join(" : ");
}

function initSimulation() {
  systems = [];
  histories = [];

  let totalToBuild = isButterflyMode ? activeInstances : 1;
  for (let i = 0; i < totalToBuild; i++) {
    let cloneState = new Array(numPendulums * 2).fill(0);
    systems.push(cloneState);
    histories.push([]);
  }

  buildColorLegends();
  clearHistories();
  updateParameters();
  applyConfiguredAngles();
}

function solveMatrix(A, B) {
  let n = B.length;
  let mat = A.map((row) => [...row]);
  let vec = [...B];
  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(mat[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(mat[k][i]) > maxEl) {
        maxEl = Math.abs(mat[k][i]);
        maxRow = k;
      }
    }
    let temp = mat[maxRow];
    mat[maxRow] = mat[i];
    mat[i] = temp;
    let tempVal = vec[maxRow];
    vec[maxRow] = vec[i];
    vec[i] = tempVal;
    if (Math.abs(mat[i][i]) < 1e-12) return new Array(n).fill(0);
    for (let k = i + 1; k < n; k++) {
      let c = -mat[k][i] / mat[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) mat[k][j] = 0;
        else mat[k][j] += c * mat[i][j];
      }
      vec[k] += c * vec[i];
    }
  }
  let x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = vec[i];
    for (let k = i + 1; k < n; k++) x[i] -= mat[i][k] * x[k];
    x[i] /= mat[i][i];
  }
  return x;
}

function getDerivatives(currState) {
  let n = numPendulums;
  let thetas = currState.slice(0, n);
  let omegas = currState.slice(n, 2 * n);
  let A = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));
  let B = Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    let sum_m_i = 0;
    for (let k = i; k < n; k++) sum_m_i += masses[k];
    B[i] = -sum_m_i * g * lengths[i] * Math.sin(thetas[i]);
    if (hasFriction) B[i] -= dampingCoeff * omegas[i];

    for (let j = 0; j < n; j++) {
      let sum_m_ij = 0;
      for (let k = Math.max(i, j); k < n; k++) sum_m_ij += masses[k];
      A[i][j] =
        sum_m_ij * lengths[i] * lengths[j] * Math.cos(thetas[i] - thetas[j]);
      B[i] -=
        sum_m_ij *
        lengths[i] *
        lengths[j] *
        Math.sin(thetas[i] - thetas[j]) *
        omegas[j] *
        omegas[j];
    }
  }
  let accels = solveMatrix(A, B);
  return [...omegas, ...accels];
}

function stepRK4(targetState, stepSize = dt) {
  let n2 = numPendulums * 2;
  let k1 = getDerivatives(targetState);
  let s2 = targetState.map((v, i) => v + 0.5 * stepSize * k1[i]);
  let k2 = getDerivatives(s2);
  let s3 = targetState.map((v, i) => v + 0.5 * stepSize * k2[i]);
  let k3 = getDerivatives(s3);
  let s4 = targetState.map((v, i) => v + stepSize * k3[i]);
  let k4 = getDerivatives(s4);
  for (let i = 0; i < n2; i++) {
    targetState[i] += (stepSize / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
}

function calculateMechanicalEnergy() {
  let ke = 0,
    pe = 0,
    cumVx = 0,
    cumVy = 0,
    cumY = 0,
    maxPossibleY = 0;
  let st = systems[0];
  for (let i = 0; i < numPendulums; i++) {
    let th = st[i],
      om = st[numPendulums + i],
      m = masses[i],
      l = lengths[i];
    cumVx += l * om * Math.cos(th);
    cumVy -= l * om * Math.sin(th);
    cumY += l * Math.cos(th);
    maxPossibleY += l;
    let v2 = cumVx * cumVx + cumVy * cumVy;
    ke += 0.5 * m * v2;
    pe += m * g * (maxPossibleY - cumY);
    if (i === numPendulums - 1) lastKnownTipVelocity = Math.sqrt(v2);
  }
  return { ke, pe, total: ke + pe };
}

function updateAudioHardware() {
  if (!hasAudio || !audioCtx || !gainNode) return;
  if (isSimulationReleased && !isDragging && lastKnownTipVelocity > 0.05) {
    let targetPitch = 220 + lastKnownTipVelocity * 75;
    targetPitch = Math.min(1200, Math.max(220, targetPitch));
    let targetGain = Math.min(0.28, lastKnownTipVelocity * 0.05);
    oscillator.frequency.setTargetAtTime(
      targetPitch,
      audioCtx.currentTime,
      0.04
    );
    gainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.04);
  } else {
    gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
  }
}

function computeBobCoordinates(targetState, s_idx = 0) {
  let offsetX =
    systems.length > 1
      ? (s_idx - (systems.length - 1) / 2) * pivotSeparation * zoomLevel
      : 0;
  let baseCX = cx + offsetX;
  let localBobs = [];
  let currX = baseCX;
  let currY = cy;
  for (let i = 0; i < numPendulums; i++) {
    currX += lengths[i] * PIXELS_PER_METER * zoomLevel * Math.sin(targetState[i]);
    currY += lengths[i] * PIXELS_PER_METER * zoomLevel * Math.cos(targetState[i]);
    localBobs.push({ x: currX, y: currY });
  }
  return localBobs;
}

function solveIK(targetX, targetY) {
  let totalPixelLength = maxTotalLengthMeters * PIXELS_PER_METER * zoomLevel;
  let offsetX0 =
    systems.length > 1 ? (0 - (systems.length - 1) / 2) * pivotSeparation * zoomLevel : 0;
  let baseCX = cx + offsetX0;

  let dx = targetX - baseCX;
  let dy = targetY - cy;
  let distToTarget = Math.hypot(dx, dy);
  let temporaryAngles = new Array(numPendulums).fill(0);

  if (distToTarget >= totalPixelLength) {
    let angle = Math.atan2(dx, dy);
    for (let i = 0; i < numPendulums; i++) temporaryAngles[i] = angle;
  } else {
    let p = [{ x: baseCX, y: cy }];
    let currentBobs = computeBobCoordinates(systems[0], 0);
    for (let b of currentBobs) p.push({ x: b.x, y: b.y });

    for (let iter = 0; iter < 15; iter++) {
      p[numPendulums].x = targetX;
      p[numPendulums].y = targetY;
      for (let i = numPendulums - 1; i >= 0; i--) {
        let dirX = p[i].x - p[i + 1].x,
          dirY = p[i].y - p[i + 1].y;
        let len = Math.hypot(dirX, dirY),
          armPixelLen = lengths[i] * PIXELS_PER_METER * zoomLevel;
        p[i].x = p[i + 1].x + (dirX / len) * armPixelLen;
        p[i].y = p[i + 1].y + (dirY / len) * armPixelLen;
      }
      p[0].x = baseCX;
      p[0].y = cy;
      for (let i = 0; i < numPendulums; i++) {
        let dirX = p[i + 1].x - p[i].x,
          dirY = p[i + 1].y - p[i].y;
        let len = Math.hypot(dirX, dirY),
          armPixelLen = lengths[i] * PIXELS_PER_METER * zoomLevel;
        p[i + 1].x = p[i].x + (dirX / len) * armPixelLen;
        p[i + 1].y = p[i].y + (dirY / len) * armPixelLen;
      }
    }
    for (let i = 0; i < numPendulums; i++) {
      temporaryAngles[i] = Math.atan2(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y);
    }
  }

  for (let i = 0; i < numPendulums; i++) {
    let deg = (temporaryAngles[i] * 180) / Math.PI;
    deg = ((((deg + 180) % 360) + 360) % 360) - 180;
    setupAngles[i] = deg;

    let UIslider = document.getElementById(`angleSliderInput${i}`);
    let UInumeric = document.getElementById(`angleNumInput${i}`);
    if (UIslider) UIslider.value = deg;
    if (UInumeric) UInumeric.value = deg.toFixed(2);
  }

  applyConfiguredAngles();
}

canvas.addEventListener("mousedown", (e) => {
  if (hasAudio) {
    if (!audioCtx) initAudioPipeline();
    else if (audioCtx.state === "suspended") audioCtx.resume();
  }
  const rect = canvas.getBoundingClientRect();
  isDragging = true;

  if (isSimulationReleased) {
    isSimulationReleased = false;
    actionBtn.innerText = "🚀 RELEASE PENDULUM";
    actionBtn.classList.remove("running");
  }
  simulationTime = 0;
  solveIK(e.clientX - rect.left, e.clientY - rect.top);
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const rect = canvas.getBoundingClientRect();
  solveIK(e.clientX - rect.left, e.clientY - rect.top);
});

window.addEventListener("mouseup", () => {
  if (isDragging) isDragging = false;
});

const sliders = document.querySelectorAll('input[type="range"]');
sliders.forEach((slider) => {
  if (
    !slider.id.startsWith("angleSliderInput") &&
    slider.id !== "gravitySlider" &&
    slider.id !== "separationSlider" &&
    slider.id !== "initLinearVel" &&
    slider.id !== "pendulumCountSlider" &&
    slider.id !== "butterflyCountSlider"
  ) {
    slider.addEventListener("input", () => {
      updateParameters();
      if (!isSimulationReleased) applyConfiguredAngles();
    });
  }
});

function drawGrid() {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
  ctx.lineWidth = 1;

  for (let x = cx; x < canvas.width; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let x = cx - 100; x > 0; x -= 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = cy; y < canvas.height; y += 100) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  for (let y = cy - 100; y > 0; y -= 100) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawScaleBar() {
  ctx.save();
  const { startX } = getHudLayout();
  const compact = canvas.width < 720;
  const barX = startX;
  const barY = compact ? 18 : 32;
  const barWidth = compact ? Math.min(110, PIXELS_PER_METER * zoomLevel * 0.75) : PIXELS_PER_METER * zoomLevel;
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barWidth, barY);
  ctx.moveTo(barX, barY - 4);
  ctx.lineTo(barX, barY + 4);
  ctx.moveTo(barX + barWidth, barY - 4);
  ctx.lineTo(barX + barWidth, barY + 4);
  ctx.stroke();
  ctx.fillStyle = "#aaa";
  ctx.font = compact ? "10px monospace" : "11px monospace";
  ctx.textAlign = "left";
  ctx.fillText(compact ? "1.0 m" : "1.0 meter", barX + 4, barY - 8);
  ctx.restore();
}

function drawTimeCounter() {
  ctx.save();
  const { startX } = getHudLayout();
  const compact = canvas.width < 720;
  const x = startX;
  const y = compact ? 44 : 56;
  ctx.fillStyle = "#aaa";
  ctx.textAlign = "left";
  ctx.font = compact ? "10px monospace" : "12px monospace";
  ctx.fillText("Time: ", x, y);
  ctx.font = compact ? "italic 11px 'Times New Roman', Georgia, serif" : "italic 14px 'Times New Roman', Georgia, serif";
  ctx.fillText("t", x + 38, y);
  ctx.font = compact ? "10px monospace" : "12px monospace";
  ctx.fillText(` = ${simulationTime.toFixed(2)} s`, x + 48, y);
  ctx.restore();
}

function drawFpsCounter() {
  ctx.save();
  const { startX } = getHudLayout();
  const compact = canvas.width < 720;
  const x = startX;
  const y = compact ? 62 : 78;
  ctx.textAlign = "left";
  ctx.font = compact ? "10px monospace" : "11px monospace";
  ctx.fillStyle = displayFps >= 50 ? "#39ff14" : displayFps >= 30 ? "#ffaa00" : "#ff3366";
  ctx.fillText(`FPS: ${displayFps}`, x, y);
  ctx.restore();
}

function drawAngularAnnotations(bobsArray, targetState, s_idx = 0) {
  if (isSimulationReleased) return;

  let offsetX =
    systems.length > 1
      ? (s_idx - (systems.length - 1) / 2) * pivotSeparation * zoomLevel
      : 0;
  let baseCX = cx + offsetX;

  ctx.save();
  for (let i = 0; i < numPendulums; i++) {
    let px = i === 0 ? baseCX : bobsArray[i - 1].x;
    let py = i === 0 ? cy : bobsArray[i - 1].y;

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + 50);
    ctx.stroke();
    ctx.setLineDash([]);

    let theta = targetState[i];
    let liveDeg = Math.abs(((theta * 180) / Math.PI) % 360);
    if (liveDeg > 180) liveDeg = 360 - liveDeg;

    ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(px, py, 30, Math.PI / 2, Math.PI / 2 - theta, theta > 0);
    ctx.stroke();

    let bisectorAngle = Math.PI / 2 - theta / 2;
    let tx = px + 45 * Math.cos(bisectorAngle);
    let ty = py + 45 * Math.sin(bisectorAngle);

    ctx.fillStyle = "rgba(26, 26, 26, 0.75)";
    ctx.fillRect(tx - 22, ty - 8, 44, 15);

    ctx.strokeStyle = "rgba(50, 50, 50, 0.5)";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(tx - 22, ty - 8, 44, 15);

    ctx.fillStyle = "#00e5ff";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${liveDeg.toFixed(1)}°`, tx, ty);
  }
  ctx.restore();
}

function drawPhaseSpaceDiagram() {
  ctx.save();
  let st = systems[0];
  let n = numPendulums;

  let valX, valY, labelX, labelY;

  if (n >= 2) {
    valX = st[0];
    valY = st[1];
    labelX = "θ₁ (Angle 1) →";
    labelY = "↑ θ₂ (Angle 2)";
  } else {
    valX = st[0];
    valY = st[n];
    labelX = "θ (Tip Angle) →";
    labelY = "↑ ω (Tip Velocity)";
  }

  if (isSimulationReleased && !isDragging) {
    vectorHistory.push({ x: valX, y: valY });
    if (vectorHistory.length > maxVectorPoints) vectorHistory.shift();
  }

  let maxDevX = 2.0;
  let maxDevY = 2.0;

  for (let p of vectorHistory) {
    if (Math.abs(p.x) > maxDevX) maxDevX = Math.abs(p.x);
    if (Math.abs(p.y) > maxDevY) maxDevY = Math.abs(p.y);
  }

  maxDevX *= 1.1;
  maxDevY *= 1.1;

  const { graphWidth } = getHudLayout();
  const compact = canvas.width < 720;
  const gw = graphWidth;
  const gh = compact ? 170 : 280;
  const gx = canvas.width - gw - 16;
  const gy = compact ? (showEnergyGraph ? 110 : 12) : 25 + (showEnergyGraph ? 120 : 0);
  const cx_v = gx + gw / 2,
    cy_v = gy + gh / 2;

  ctx.fillStyle = "rgba(20, 20, 20, 0.85)";
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.fillStyle = "#ddd";
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  let title =
    n >= 2
      ? "CONFIG SPACE: UNWRAPPED θ₁ vs θ₂"
      : "PHASE SPACE: UNWRAPPED θ vs ω";
  ctx.fillText(title, gx + 10, gy + 16);

  ctx.save();
  ctx.beginPath();
  ctx.rect(gx + 1, gy + 1, gw - 2, gh - 2);
  ctx.clip();

  let scaleX = gw / 2 / maxDevX;
  let scaleY = gh / 2 / maxDevY;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(gx + 10, cy_v);
  ctx.lineTo(gx + gw - 10, cy_v);
  ctx.moveTo(cx_v, gy + 10);
  ctx.lineTo(cx_v, gy + gh - 10);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = compact ? "10px monospace" : "11px monospace";
  ctx.textAlign = "right";
  ctx.fillText(labelX, gx + gw - 10, cy_v - 8);

  ctx.textAlign = "left";
  ctx.fillText(labelY, cx_v + 8, gy + 25);

  if (vectorHistory.length > 1) {
    ctx.beginPath();
    for (let i = 0; i < vectorHistory.length; i++) {
      let px = cx_v + vectorHistory[i].x * scaleX;
      let py = cy_v - vectorHistory[i].y * scaleY;

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.strokeStyle = "rgba(0, 229, 255, 0.6)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  let currentX = cx_v + valX * scaleX;
  let currentY = cy_v - valY * scaleY;
  ctx.fillStyle = "#ff007f";
  ctx.beginPath();
  ctx.arc(currentX, currentY, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawEnergyGraph() {
  ctx.save();
  let currentE = calculateMechanicalEnergy();
  if (isSimulationReleased && !isDragging) {
    energyHistory.push(currentE);
    if (energyHistory.length > maxEnergyPoints) energyHistory.shift();
  }

  const { graphWidth } = getHudLayout();
  const compact = canvas.width < 720;
  const gw = graphWidth;
  const gh = compact ? 88 : 110;
  const gx = canvas.width - gw - 16;
  const gy = compact ? 10 : 25;

  ctx.fillStyle = "rgba(20, 20, 20, 0.85)";
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ddd";
  ctx.fillText("ENERGY GRAPH (Joules)", gx + 8, gy + 14);

  ctx.fillStyle = "#ff007f";
  ctx.fillText("■ KE", gx + 8, gy + 28);
  ctx.fillStyle = "#00ff7f";
  ctx.fillText("■ PE", gx + 52, gy + 28);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("■ Total", gx + 96, gy + 28);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "right";
  ctx.fillText(`E: ${currentE.total.toFixed(1)} J`, gx + gw - 8, gy + 14);

  if (energyHistory.length < 2) {
    ctx.fillStyle = "#aaa";
    ctx.font = compact ? "10px monospace" : "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Release pendulum to record energy", gx + gw / 2, gy + gh / 2 + 8);
    ctx.restore();
    return;
  }

  let maxE = 10;
  for (let p of energyHistory) {
    if (p.total > maxE) maxE = p.total;
    if (p.ke > maxE) maxE = p.ke;
    if (p.pe > maxE) maxE = p.pe;
  }
  maxE *= 1.15;

  const plotTop = gy + 35, plotBottom = gy + gh - 6;
  const xDenom = Math.max(energyHistory.length - 1, 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(gx + 1, plotTop, gw - 2, plotBottom - plotTop);
  ctx.clip();
  ctx.lineWidth = 2;

  const lines = [
    { key: "pe",    color: "#00ff7f" },
    { key: "ke",    color: "#ff007f" },
    { key: "total", color: "#ffffff" },
  ];
  for (const { key, color } of lines) {
    ctx.beginPath();
    for (let i = 0; i < energyHistory.length; i++) {
      const x = gx + (i / xDenom) * gw;
      const y = plotBottom - (energyHistory[i][key] / maxE) * (plotBottom - plotTop);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

function drawLinkageSystem(bobsArray, accentColor, isGhost, s_idx = 0) {
  ctx.save();
  let offsetX =
    systems.length > 1
      ? (s_idx - (systems.length - 1) / 2) * pivotSeparation * zoomLevel
      : 0;
  let baseCX = cx + offsetX;
  let points = [{ x: baseCX, y: cy }, ...bobsArray];

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 0; i < numPendulums; i++) {
    const start = points[i];
    const end = points[i + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);

    if (isGhost) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
      ctx.lineWidth = 8.5;
      ctx.stroke();

      ctx.strokeStyle = accentColor;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 4.2;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    } else {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
      ctx.lineWidth = 9;
      ctx.stroke();

      const grad = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
      grad.addColorStop(0, "#ff007f");
      grad.addColorStop(0.45, "#7f00ff");
      grad.addColorStop(1, "#00e5ff");
      ctx.strokeStyle = len > 0.001 ? grad : "#00e5ff";
      ctx.lineWidth = 6;
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  for (let i = 1; i <= numPendulums; i++) {
    let currentMassRatio = masses[i - 1] / 2.0;
    let dynamicRadius = (isGhost ? 4.5 : 6) + currentMassRatio * 3.5;
    if (isGhost) {
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, dynamicRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, dynamicRadius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, dynamicRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  let r = parseInt(hex.slice(1, 3), 16),
    g = parseInt(hex.slice(3, 5), 16),
    b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawLyapunovGraph() {
  ctx.save();
  const { graphWidth } = getHudLayout();
  const compact = canvas.width < 720;
  const gw = graphWidth;
  const gh = compact ? 96 : 130;
  const gx = canvas.width - gw - 16;
  const gy = compact ? 10 : 25;

  ctx.fillStyle = "rgba(20, 20, 20, 0.85)";
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = "#553300";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ddd";
  ctx.font = compact ? "9px monospace" : "10px monospace";
  ctx.fillText("LYAPUNOV DIVERGENCE (log scale)", gx + 8, gy + 15);

  if (lyapunovHistory.length < 2) {
    ctx.fillStyle = "#aaa";
    ctx.font = "11px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Release pendulum to measure divergence", gx + gw / 2, gy + gh / 2);
    ctx.restore();
    return;
  }

  let minLD = Infinity, maxLD = -Infinity;
  for (const p of lyapunovHistory) {
    if (p.ld < minLD) minLD = p.ld;
    if (p.ld > maxLD) maxLD = p.ld;
  }
  const range = Math.max(maxLD - minLD, 0.5);
  const plotTop = gy + 25, plotBottom = gy + gh - 18;
  const plotH = plotBottom - plotTop;

  ctx.save();
  ctx.beginPath();
  ctx.rect(gx + 1, gy + 1, gw - 2, gh - 2);
  ctx.clip();

  const xDenom = Math.max(lyapunovHistory.length - 1, 1);
  ctx.beginPath();
  for (let i = 0; i < lyapunovHistory.length; i++) {
    const x = gx + (i / xDenom) * gw;
    const y = plotBottom - ((lyapunovHistory[i].ld - minLD) / range) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#ff9900";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  const first = lyapunovHistory[0];
  const last = lyapunovHistory[lyapunovHistory.length - 1];
  const elapsed = last.t - first.t;
  ctx.textAlign = "right";
  ctx.font = compact ? "10px monospace" : "11px monospace";
  if (elapsed > 0.5) {
    const lambda = (last.ld - first.ld) / elapsed;
    ctx.fillStyle = lambda > 0 ? "#ff9900" : "#00ff7f";
    ctx.fillText(`λ ≈ ${lambda > 0 ? "+" : ""}${lambda.toFixed(2)} /s`, gx + gw - 8, gy + 15);
  }
  ctx.fillStyle = "#ddd";
  ctx.font = compact ? "9px monospace" : "10px monospace";
  ctx.fillText(`Δ = ${last.d.toFixed(1)} px`, gx + gw - 8, gy + gh - 6);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  drawScaleBar();
  drawTimeCounter();
  if (showFpsCounter) drawFpsCounter();

  let nowRealTime = performance.now();
  let elapsedRealTime = (nowRealTime - lastRealTime) / 1000;
  lastRealTime = nowRealTime;

  fpsSamples.push(elapsedRealTime);
  if (fpsSamples.length > 30) fpsSamples.shift();
  const avgFrameTime = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
  displayFps = Math.round(1 / avgFrameTime);

  if (isSimulationReleased) {
    if (elapsedRealTime > 0.1) elapsedRealTime = 0.1;

    const simSpeed = Math.max(0.1, timeScale || 1);
    timeBuffer += elapsedRealTime * simSpeed;

    while (timeBuffer >= dt) {
      for (let s = 0; s < systems.length; s++) stepRK4(systems[s], dt);
      simulationTime += dt;
      timeBuffer -= dt;
    }
  } else {
    timeBuffer = 0;
  }

  let allBobs = [];
  for (let s = 0; s < systems.length; s++) {
    let bobs = computeBobCoordinates(systems[s], s);
    allBobs.push(bobs);

    if (isSimulationReleased) {
      histories[s].push({
        x: bobs[numPendulums - 1].x,
        y: bobs[numPendulums - 1].y
      });
      if (histories[s].length > 240) histories[s].shift();
    }
  }

  if (isButterflyMode && isSimulationReleased && !isDragging && allBobs.length >= 2) {
    const b0 = allBobs[0][numPendulums - 1];
    const b1 = allBobs[1][numPendulums - 1];
    const dx = b0.x - b1.x, dy = b0.y - b1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    lyapunovHistory.push({ t: simulationTime, d: dist, ld: Math.log(Math.max(dist, 0.01)) });
    if (lyapunovHistory.length > maxLyapunovPoints) lyapunovHistory.shift();
  }

  if (showTrails || !isButterflyMode) {
    const NUM_FADE_CHUNKS = 12;
    for (let s = histories.length - 1; s >= 0; s--) {
      const trail = histories[s];
      if (trail.length < 2) continue;
      const colorBase = universeColors[s % universeColors.length];
      const lineWidth = s === 0 ? 2 : 1.75;
      const maxAlpha = s === 0 ? 0.72 : 0.5;
      const chunkSize = Math.ceil(trail.length / NUM_FADE_CHUNKS);
      for (let chunk = 0; chunk < NUM_FADE_CHUNKS; chunk++) {
        const start = chunk * chunkSize;
        if (start >= trail.length - 1) continue;
        const end = Math.min(start + chunkSize + 1, trail.length);
        const alpha = ((chunk + 1) / NUM_FADE_CHUNKS) * maxAlpha;
        ctx.beginPath();
        ctx.moveTo(trail[start].x, trail[start].y);
        for (let i = start + 1; i < end; i++) ctx.lineTo(trail[i].x, trail[i].y);
        ctx.strokeStyle = hexToRgba(colorBase, alpha);
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    }
  }

  for (let s = systems.length - 1; s >= 1; s--) {
    drawLinkageSystem(
      allBobs[s],
      universeColors[s % universeColors.length],
      true,
      s
    );
  }
  drawLinkageSystem(allBobs[0], universeColors[0], false, 0);

  drawAngularAnnotations(allBobs[0], systems[0], 0);

  if (!isDragging) {
    if (!isButterflyMode) {
      if (showConfigSpace)  drawPhaseSpaceDiagram();
      if (showEnergyGraph)  drawEnergyGraph();
    }
    if (isButterflyMode && showLyapunov) drawLyapunovGraph();
  }

  if (!showEnergyGraph) calculateMechanicalEnergy();
  updateAudioHardware();

  if (isDragging) {
    ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      allBobs[0][numPendulums - 1].x,
      allBobs[0][numPendulums - 1].y,
      25,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  requestAnimationFrame(draw);
}

resizeViewport();
updateDeviceNotice();
buildSliderTicks();
updateSimulationSpeed();
initSimulation();
renderAngleControlSliders();
draw();

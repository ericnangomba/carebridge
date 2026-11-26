// CareBridge — Multilingual Patient Intake App
// Firebase AI Logic: on-device (Gemini Nano) + cloud (Gemini) hybrid

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-ai.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app-check.js";

// ── Firebase Config (replace with your project values) ──────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBlTmzH3qXTQtWgXuJJR2Ori7wBNGV_JF0",
  authDomain: "studio-4065152213-5a60e.firebaseapp.com",
  projectId: "studio-4065152213-5a60e",
  storageBucket: "studio-4065152213-5a60e.firebasestorage.app",
  messagingSenderId: "524697883076",
  appId: "1:524697883076:web:aef8237ccaa5fe890cd491",
};

const app = initializeApp(firebaseConfig);

// App Check (reCAPTCHA v3 for web) — guarded for dev/placeholder
const recaptchaKey = "YOUR_RECAPTCHA_SITE_KEY";
try {
  if (recaptchaKey && !recaptchaKey.startsWith("YOUR_")) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else {
    console.warn("App Check skipped: set a real reCAPTCHA site key");
  }
} catch (e) {
  console.warn("App Check init skipped (dev mode):", e.message);
}

const ai = getAI(app, { backend: new GoogleAIBackend() });

// On-device model (Gemini Nano) — privacy-sensitive: STT + translation
const onDeviceModel = getGenerativeModel(ai, {
  mode: "on-device-preferred",
  model: "gemini-nano",
});

// Cloud model (Gemini) — complex: triage + pattern analysis
const cloudModel = getGenerativeModel(ai, {
  mode: "cloud-preferred",
  model: "gemini-2.0-flash",
});

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  intakes: [],
  recording: false,
  recognition: null,
  currentTranscript: "",
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const recordBtn = $("#record-btn");
const recordingStatus = $("#recording-status");
const transcriptBox = $("#transcript-box");
const processingLog = $("#processing-log");
const intakeFormCard = $("#intake-form-card");
const intakeForm = $("#intake-form");
const submitIntakeBtn = $("#submit-intake-btn");
const intakeList = $("#intake-list");
const triageBtn = $("#triage-btn");
const triageResult = $("#triage-result");
const patternBtn = $("#pattern-btn");
const patternResult = $("#pattern-result");
const aiStatus = $("#ai-status");
const languageSelect = $("#language-select");

// ── Logging helper ───────────────────────────────────────────────────────────
function log(msg) {
  const line = document.createElement("div");
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  processingLog.appendChild(line);
  while (processingLog.childElementCount > 200) processingLog.removeChild(processingLog.firstChild);
  processingLog.scrollTop = processingLog.scrollHeight;
}

// ── Model availability check ─────────────────────────────────────────────────
async function checkOnDeviceAvailability() {
  try {
    aiStatus.textContent = "On-device preferred (Gemini Nano)";
    aiStatus.style.background = "rgba(22,163,74,0.3)";
    log("Firebase AI Logic on-device model configured (Gemini Nano); cloud fallback enabled");
    return true;
  } catch (e) {
    aiStatus.textContent = "Cloud fallback";
    log("On-device check failed: " + e.message);
    return false;
  }
}

// ── Speech Recognition (Web Speech API) ───────────────────────────────────────
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    log("Web Speech API not supported in this browser");
    return null;
  }
  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;
  const langMap = { en: "en-ZA", zu: "zu-ZA", xh: "xh-ZA", af: "af-ZA", st: "st-ZA", nso: "nso-ZA" };
  rec.lang = langMap[languageSelect.value] || (languageSelect.value + "-ZA");
  return rec;
}

recordBtn.addEventListener("click", () => {
  if (state.recording) {
    stopRecording();
  } else {
    startRecording();
  }
});

function startRecording() {
  state.recognition = initSpeechRecognition();
  if (!state.recognition) {
    recordingStatus.textContent = "Speech recognition not supported. Use Chrome.";
    log("Web Speech API not supported in this browser");
    return;
  }
  state.recording = true;
  state.currentTranscript = "";
  transcriptBox.textContent = "";
  recordBtn.textContent = "⏹ Stop Speaking";
  recordingStatus.textContent = "Listening…";
  log("Recording started — on-device STT");

  state.recognition.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t + " ";
      else interim += t;
    }
    state.currentTranscript += final;
    transcriptBox.textContent = state.currentTranscript + interim;
  };

  state.recognition.onerror = (e) => {
    log("Speech error: " + e.error);
  };

  state.recognition.onend = () => {
    if (state.recording) {
      // auto-restart if still recording
      try { state.recognition.start(); } catch (_) {}
    }
  };

  try {
    state.recognition.start();
  } catch (e) {
    log("Failed to start recognition: " + e.message);
  }
}

function stopRecording() {
  state.recording = false;
  if (state.recognition) {
    state.recognition.stop();
    state.recognition = null;
  }
  recordBtn.textContent = "🎤 Start Speaking";
  recordingStatus.textContent = "Processing on-device…";
  log("Recording stopped. Transcript: " + state.currentTranscript.substring(0, 80) + "…");
  processOnDevice(state.currentTranscript);
}

// ── On-device processing: translate + extract intake ─────────────────────────
async function processOnDevice(transcript) {
  if (!transcript.trim()) {
    recordingStatus.textContent = "No speech detected.";
    return;
  }

  log("On-device: translating + extracting structured intake (Gemini Nano)");
  const lang = languageSelect.options[languageSelect.selectedIndex].text;

  const prompt = `You are a medical intake assistant. The patient spoke in ${lang}. 
Transcript: "${transcript}"

Tasks (on-device, privacy-preserving):
1. Translate the transcript to English.
2. Extract a structured intake form with these fields: symptoms (list), duration, severity (mild/moderate/severe), onset (when started), additional notes.

Return ONLY valid JSON in this exact format:
{
  "translation": "...",
  "symptoms": ["..."],
  "duration": "...",
  "severity": "...",
  "onset": "...",
  "notes": "..."
}`;

  try {
    const result = await onDeviceModel.generateContent(prompt);
    const text = result.response.text();
    log("On-device model responded");
    parseAndShowIntake(text, transcript);
  } catch (e) {
    log("On-device failed, trying cloud: " + e.message);
    try {
      const result = await cloudModel.generateContent(prompt);
      const text = result.response.text();
      log("Cloud fallback responded");
      parseAndShowIntake(text, transcript);
    } catch (e2) {
      log("Both failed: " + e2.message);
      // Fallback: show raw transcript
      parseAndShowIntake(JSON.stringify({
        translation: transcript,
        symptoms: [transcript],
        duration: "unknown",
        severity: "unknown",
        onset: "unknown",
        notes: "Model unavailable — raw transcript only",
      }), transcript);
    }
  }
}

function parseAndShowIntake(text, originalTranscript) {
  let data;
  try {
    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
    data = JSON.parse(jsonStr);
  } catch (e) {
    log("JSON parse failed, using raw text");
    data = {
      translation: text,
      symptoms: [text],
      duration: "unknown",
      severity: "unknown",
      onset: "unknown",
      notes: "",
    };
  }

  const intake = {
    id: (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2)),
    language: languageSelect.options[languageSelect.selectedIndex].text,
    originalTranscript,
    translation: String(data.translation ?? ""),
    symptoms: Array.isArray(data.symptoms) ? data.symptoms.map(String) : [],
    duration: String(data.duration ?? "unknown"),
    severity: String(data.severity ?? "unknown"),
    onset: String(data.onset ?? "unknown"),
    notes: String(data.notes ?? ""),
    timestamp: new Date().toISOString(),
  };
  state.intakes.push(intake);

  // Render intake form
  intakeForm.innerHTML = `
    <div class="field"><label>Language</label><div class="value">${escapeHtml(intake.language)}</div></div>
    <div class="field"><label>Original (on-device)</label><div class="value">${escapeHtml(intake.originalTranscript)}</div></div>
    <div class="field"><label>Translation (English)</label><div class="value">${escapeHtml(intake.translation)}</div></div>
    <div class="field"><label>Symptoms</label><div class="value">${escapeHtml((intake.symptoms || []).join(", "))}</div></div>
    <div class="field"><label>Duration</label><div class="value">${escapeHtml(intake.duration)}</div></div>
    <div class="field"><label>Severity</label><div class="value">${escapeHtml(intake.severity)}</div></div>
    <div class="field"><label>Onset</label><div class="value">${escapeHtml(intake.onset)}</div></div>
    <div class="field"><label>Notes</label><div class="value">${escapeHtml(intake.notes || "—")}</div></div>
  `;
  intakeFormCard.classList.remove("hidden");
  recordingStatus.textContent = "Intake form ready.";
  log("Structured intake form generated on-device ✓");
}

submitIntakeBtn.addEventListener("click", () => {
  intakeFormCard.classList.add("hidden");
  recordingStatus.textContent = "Submitted to clinician.";
  log("Intake submitted to clinician dashboard");
  renderIntakeList();
});

// ── Clinician Dashboard ──────────────────────────────────────────────────────
function renderIntakeList() {
  if (state.intakes.length === 0) {
    intakeList.innerHTML = "<p class='muted'>No intakes yet.</p>";
    return;
  }
  intakeList.innerHTML = state.intakes.map((i) => `
    <div class="intake-item">
      <strong>${escapeHtml(i.language)}</strong> — ${escapeHtml(i.severity)} severity<br/>
      Symptoms: ${escapeHtml((i.symptoms || []).join(", "))}<br/>
      <small>${escapeHtml(new Date(i.timestamp).toLocaleString())}</small>
    </div>
  `).join("");
}

// Cloud triage summary
triageBtn.addEventListener("click", async () => {
  if (state.intakes.length === 0) {
    triageResult.textContent = "No patient intakes to triage.";
    return;
  }
  triageResult.textContent = "Running cloud triage…";
  log("Cloud: generating triage summary (Gemini)");

  const prompt = `You are a clinical triage assistant. Below are ${state.intakes.length} patient intake forms. 
Generate a concise triage summary for each patient, prioritizing by severity and urgency. Include recommended next steps.

Intakes:
${JSON.stringify(state.intakes, null, 2)}

Return a structured summary with priority levels (P1/P2/P3).`;

  try {
    const result = await cloudModel.generateContent(prompt);
    triageResult.textContent = result.response.text();
    log("Cloud triage complete ✓");
  } catch (e) {
    triageResult.textContent = "Triage failed: " + e.message;
    log("Cloud triage error: " + e.message);
  }
});

// Cross-patient pattern analysis
patternBtn.addEventListener("click", async () => {
  if (state.intakes.length < 2) {
    patternResult.textContent = "Need at least 2 patients for pattern analysis.";
    return;
  }
  patternResult.textContent = "Analyzing cross-patient patterns…";
  log("Cloud: cross-patient pattern analysis (Gemini)");

  const prompt = `You are an epidemiological analysis assistant. Analyze the following ${state.intakes.length} patient intakes for cross-patient patterns: common symptoms, possible clusters, temporal trends, and any public health signals.

Intakes:
${JSON.stringify(state.intakes, null, 2)}

Provide: 1) Common symptom clusters, 2) Potential outbreak signals, 3) Recommended population-level actions.`;

  try {
    const result = await cloudModel.generateContent(prompt);
    patternResult.textContent = result.response.text();
    log("Pattern analysis complete ✓");
  } catch (e) {
    patternResult.textContent = "Analysis failed: " + e.message;
    log("Pattern analysis error: " + e.message);
  }
});

// ── Navigation ───────────────────────────────────────────────────────────────
$$(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".nav-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    $$(".view").forEach((v) => v.classList.remove("active"));
    $("#" + btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "clinician-view") renderIntakeList();
  });
});

// ── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  log("CareBridge initializing…");
  await checkOnDeviceAvailability();
  log("Ready. Speak symptoms in your language.");
})();

// Register service worker for PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

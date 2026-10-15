/*
 * 題庫唯一設定位置：只需要修改下一行，其他程式不必修改。
 * 支援 Google 試算表的 /export?format=csv&gid=0 與 /pub?output=csv 網址。
 */
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSHewGdenG3BmEV8e16A0OQOaRQcNoudFx1eGJz8TcuHZnujRbQkWRJxudTSR4WiQUDSqa364EpWz8a/pub?gid=148901333&single=true&output=csv";

const TOTAL_QUESTIONS = 5;
const CHINESE_FONT = 'LXGW WenKai Mono TC';
const ENGLISH_FONT = 'Isometra';
const COLORS = {
  background: "#e9edc9",
  darkText: "#243b53",
  mutedText: "#486581",
  question: "#dabfff",
  option: "#ffffff",
  button: "#386641",
  buttonText: "#ffffff",
  shadow: "#b7c49a",
  correct: "#1982c4",
  correctAnswer: "#7fdeff",
  wrong: "#fe938c",
  error: "#b42318"
};

let allQuestions = [];
let quizQuestions = [];
let csvLoadState = "loading";
let csvErrorMessage = "";
let requestSerial = 0;
let currentQuestionIndex = 0;
let score = 0;
let selectedAnswer = -1;
let answered = false;
let quizFinished = false;
let layoutCache = null;
let lastActionTime = -1000;
let animationTime = 0;
let fireworkParticles = [];
let lastFireworkSpawn = -10000;
let drawRuntimeError = "";
let fontsReady = false;
let fontLoadFailed = false;
let fontLoadMessage = "";
let canvasTextSize = 16;
let canvasTextBold = false;

function getBootPanel() {
  return document.getElementById("boot-status");
}

function getFontStatusText() {
  if (!fontsReady) return "字型：" + CHINESE_FONT + " / " + ENGLISH_FONT + "：載入中";
  return "字型：" + CHINESE_FONT + " / " + ENGLISH_FONT + "：" + (fontLoadFailed ? "使用備用字型" : "已載入");
}

function updateBootStatus(message, state) {
  const panel = getBootPanel();
  if (!panel) return;
  const detail = String(message || "");
  panel.textContent = getFontStatusText() + (detail ? "\n" + detail : "");
  panel.dataset.state = state || "info";
}

async function loadGoogleFonts() {
  let loaded = false;
  let failureMessage = "";
  try {
    if (!document.fonts || typeof document.fonts.load !== "function") {
      throw new Error("瀏覽器不支援 Font Loading API");
    }
    const fontResults = await Promise.allSettled([
      document.fonts.load('400 16px "LXGW WenKai Mono TC"'),
      document.fonts.load('700 16px "LXGW WenKai Mono TC"'),
      document.fonts.load('400 16px "Isometra"')
    ]);
    await document.fonts.ready;
    const allPromisesResolved = fontResults.every(function (result) {
      return result.status === "fulfilled";
    });
    const fontsAvailable = typeof document.fonts.check !== "function" || (
      document.fonts.check('400 16px "LXGW WenKai Mono TC"') &&
      document.fonts.check('700 16px "LXGW WenKai Mono TC"') &&
      document.fonts.check('400 16px "Isometra"')
    );
    loaded = allPromisesResolved && fontsAvailable;
    if (!loaded) failureMessage = "Google Fonts 未完整載入";
  } catch (error) {
    failureMessage = formatError(error, "Google Fonts 載入失敗");
  }
  fontsReady = true;
  fontLoadFailed = !loaded;
  fontLoadMessage = failureMessage;
  layoutCache = null;
  updateBootStatus(
    loaded ? "Google Fonts 已完成載入。" : "Google Fonts 載入失敗，測驗改用備用字型。" + (failureMessage ? " " + failureMessage : ""),
    loaded ? "success" : "info"
  );
  if (typeof redraw === "function") redraw();
}

function setup() {
  try {
    const canvas = createCanvas(Math.max(1, windowWidth), Math.max(1, windowHeight));
    pixelDensity(1);
    if (canvas && canvas.elt) {
      canvas.elt.setAttribute("aria-label", "p5.js 測驗畫布");
      canvas.elt.style.display = "block";
      canvas.elt.style.touchAction = "none";
      canvas.elt.style.fontFamily = "'LXGW WenKai Mono TC', 'Isometra', sans-serif";
    }
    applyCanvasFont(16, false);
    if (drawingContext) drawingContext.textBaseline = "middle";
    updateBootStatus("畫布已建立，正在載入字型與題庫…", "info");
    csvLoadState = "loading";
    loadGoogleFonts();
    loadQuestionBank();
  } catch (error) {
    csvLoadState = "error";
    csvErrorMessage = formatError(error, "建立畫布時發生錯誤");
    updateBootStatus("啟動錯誤：" + csvErrorMessage, "error");
  }
}

function draw() {
  try {
    background(COLORS.background);
  } catch (backgroundError) {
    drawRuntimeError = formatError(backgroundError, "背景繪製失敗");
  }
  try {
    animationTime = typeof millis === "function" ? millis() : Date.now();
    if (drawingContext) drawingContext.textBaseline = "middle";
    if (drawRuntimeError) {
      drawFatalCanvasMessage(drawRuntimeError);
      return;
    }
    if (!fontsReady || csvLoadState === "loading") {
      drawLoadingScreen();
      return;
    }
    if (csvLoadState === "error") {
      drawErrorScreen();
      return;
    }
    if (csvLoadState !== "ready" || !Array.isArray(quizQuestions) || quizQuestions.length !== TOTAL_QUESTIONS) {
      throw new Error("題庫狀態無效，沒有可顯示的題目。");
    }
    if (quizFinished) drawFinishedScreen();
    else drawQuizScreen();
  } catch (error) {
    drawRuntimeError = formatError(error, "繪製畫面時發生錯誤");
    updateBootStatus("繪製錯誤：" + drawRuntimeError, "error");
    drawFatalCanvasMessage(drawRuntimeError);
  }
}

function formatError(error, fallback) {
  if (error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

function drawFatalCanvasMessage(message) {
  try {
    background(COLORS.background);
    const margin = Math.max(18, Math.min(width * 0.08, 64));
    fill("#fff7f5");
    stroke(COLORS.error);
    strokeWeight(2);
    rect(margin, Math.max(64, height * 0.2), width - margin * 2, Math.min(260, height * 0.58), 16);
    noStroke();
    applyCanvasFont(Math.max(18, Math.min(width * 0.06, 32)), true);
    fill(COLORS.error);
    safeDrawText("畫面繪製發生錯誤", width / 2, height * 0.32, { align: "center" });
    applyCanvasFont(Math.max(13, Math.min(width * 0.035, 20)), false);
    fill(COLORS.darkText);
    const lines = wrapText(message, width - margin * 2 - 36, Math.max(13, Math.min(width * 0.035, 20)), false);
    drawCenteredLines(lines, width / 2, height * 0.48, Math.max(13, Math.min(width * 0.035, 20)), 28, false);
  } catch (error) {
    updateBootStatus("畫布錯誤且無法繪製錯誤頁：" + formatError(error, "未知錯誤"), "error");
  }
}

function applyCanvasFont(size, bold) {
  const safeSize = Math.max(1, Number(size) || 16);
  const weight = bold ? "700" : "400";
  canvasTextSize = safeSize;
  canvasTextBold = Boolean(bold);
  try {
    // 以 p5 字型作為 fallback 設定，再由原生 Canvas 套用完整字型串。
    textFont(CHINESE_FONT);
    textSize(safeSize);
    textStyle(bold ? BOLD : NORMAL);
    textAlign(CENTER, CENTER);
  } catch (error) {
    // Font Loading API 失敗時仍繼續使用原生 Canvas 的備用字型。
  }
  if (drawingContext) {
    drawingContext.font = `${weight} ${safeSize}px "${CHINESE_FONT}", "${ENGLISH_FONT}", sans-serif`;
    drawingContext.textBaseline = "middle";
  }
}

function safeDrawText(message, x, y, options) {
  const settings = options || {};
  const content = String(message === undefined || message === null ? "" : message);
  const size = Number(settings.size) || canvasTextSize || 16;
  const bold = settings.bold === undefined ? canvasTextBold : Boolean(settings.bold);
  try {
    // 每一次繪製文字前都重新套用原生 Canvas 字型，避免字型被 p5 或瀏覽器覆寫。
    applyCanvasFont(size, bold);
    if (!drawingContext || typeof drawingContext.fillText !== "function") {
      throw new Error("Canvas 文字繪製環境不存在");
    }
    drawingContext.save();
    if (settings.align === "left") drawingContext.textAlign = "left";
    else if (settings.align === "right") drawingContext.textAlign = "right";
    else drawingContext.textAlign = "center";
    drawingContext.textBaseline = "middle";
    if (typeof settings.maxWidth === "number") drawingContext.fillText(content, x, y, settings.maxWidth);
    else drawingContext.fillText(content, x, y);
    drawingContext.restore();
    return true;
  } catch (error) {
    updateBootStatus("文字繪製錯誤：" + formatError(error, "無法繪製文字"), "error");
    return false;
  }
}

function measureTextWidth(message, size, weight) {
  const content = String(message || "");
  const safeSize = Math.max(1, Number(size) || 16);
  const bold = Boolean(weight);
  applyCanvasFont(safeSize, bold);
  try {
    if (drawingContext && typeof drawingContext.measureText === "function") {
      return drawingContext.measureText(content).width;
    }
  } catch (error) {
    // 量測失敗時使用保守估算，避免題目畫面中斷。
  }
  return content.length * safeSize;
}

function wrapText(message, maxWidth, size, weight) {
  const safeWidth = Math.max(20, maxWidth);
  const textValue = String(message || "");
  const lines = [];
  let line = "";
  for (const character of textValue) {
    if (character === "\n") {
      lines.push(line || " ");
      line = "";
      continue;
    }
    const candidate = line + character;
    if (!line || measureTextWidth(candidate, size, weight) <= safeWidth) line = candidate;
    else {
      lines.push(line);
      line = character;
    }
  }
  if (line || lines.length === 0) lines.push(line || " ");
  return lines;
}

function drawCenteredLines(lines, centerX, firstY, size, lineHeight, weight) {
  lines.forEach(function (line, index) {
    safeDrawText(line, centerX, firstY + index * lineHeight, {
      align: "center",
      size: size,
      bold: Boolean(weight)
    });
  });
}

function normalizeCsvUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value || value === "請貼上你的 Google 試算表 CSV 公開網址") {
    throw new Error("尚未設定 CSV 網址。請在 sketch.js 最上方唯一的 GOOGLE_SHEET_CSV_URL 位置貼上公開 CSV 網址。");
  }
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\//i.test(value)) {
    throw new Error("CSV 網址格式不正確。請使用 Google 試算表的 /export?format=csv&gid=0 或 /pub?output=csv 網址。");
  }
  const isExport = /\/export\?/i.test(value) && /(?:^|[?&])format=csv(?:&|$)/i.test(value);
  const isPublished = /\/pub\?/i.test(value) && /(?:^|[?&])output=csv(?:&|$)/i.test(value);
  if (!isExport && !isPublished) {
    throw new Error("CSV 網址不是公開 CSV 格式。請確認網址包含 /export?format=csv 或 /pub?output=csv。");
  }
  return value;
}

async function fetchCsvText(url, timeoutMilliseconds) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(function () { controller.abort(); }, timeoutMilliseconds);
  try {
    const separator = url.indexOf("?") >= 0 ? "&" : "?";
    const requestUrl = url + separator + "quizCacheBust=" + Date.now();
    const response = await fetch(requestUrl, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
      headers: { Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8" }
    });
    if (!response.ok) throw new Error("Google 試算表回應 HTTP " + response.status + "。");
    const content = await response.text();
    if (!content || !content.trim()) throw new Error("Google 試算表回傳空白內容。");
    return content;
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error("讀取 CSV 逾時。請確認網路與試算表公開設定。");
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function rejectNonCsvResponse(csvText) {
  const sample = String(csvText || "").trim().slice(0, 3000).toLowerCase();
  if (!sample) throw new Error("CSV 內容是空的。");
  if (sample.indexOf("<html") >= 0 || sample.indexOf("<!doctype html") >= 0 || sample.indexOf("<head") >= 0) {
    if (sample.indexOf("accounts.google.com") >= 0 || sample.indexOf("signin") >= 0 || sample.indexOf("sign in") >= 0 || sample.indexOf("登入") >= 0) {
      throw new Error("Google 回傳登入頁，不是 CSV。請發布試算表到網路，並設定任何人可查看。");
    }
    throw new Error("Google 回傳 HTML 頁面，不是 CSV。請確認使用公開 CSV 網址。");
  }
  if (sample.indexOf("requested url was not found") >= 0 || sample.indexOf("未發布") >= 0 || sample.indexOf("未發佈") >= 0) {
    throw new Error("試算表尚未發布到網路，請先發布工作表為 CSV。");
  }
}

function parseCsv(csvText) {
  rejectNonCsvResponse(csvText);
  const source = String(csvText).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else field += character;
      continue;
    }
    if (character === '"' && !fieldStarted && field.trim() === "") {
      quoted = true;
      fieldStarted = true;
    } else if (character === ",") {
      row.push(fieldStarted ? field : field.trim());
      field = "";
      fieldStarted = false;
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(fieldStarted ? field : field.trim());
      if (row.some(function (cell) { return cell !== ""; })) rows.push(row);
      row = [];
      field = "";
      fieldStarted = false;
    } else {
      field += character;
      fieldStarted = true;
    }
  }
  if (quoted) throw new Error("CSV 格式錯誤：有未關閉的雙引號。");
  if (field !== "" || fieldStarted || row.length > 0) {
    row.push(fieldStarted ? field : field.trim());
    if (row.some(function (cell) { return cell !== ""; })) rows.push(row);
  }
  if (rows.length < 2) throw new Error("CSV 至少需要標題列與一筆資料。");
  const count = rows[0].length;
  if (!count || rows.some(function (currentRow) { return currentRow.length !== count; })) {
    throw new Error("CSV 格式錯誤：每一列的欄位數量不一致。");
  }
  return rows;
}

function validateQuestions(csvText) {
  const rows = parseCsv(csvText);
  const required = ["id", "question", "optionA", "optionB", "optionC", "optionD", "answer"];
  const headers = rows[0].map(function (value, index) {
    return (index === 0 ? String(value).replace(/^\uFEFF/, "") : String(value)).trim();
  });
  const missing = required.filter(function (name) { return headers.indexOf(name) < 0; });
  if (missing.length) throw new Error("CSV 缺少欄位：" + missing.join(", ") + "。");
  const indexes = required.map(function (name) { return headers.indexOf(name); });
  const questions = [];
  const ids = new Set();
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const displayRow = rowIndex + 1;
    const id = String(row[indexes[0]] || "").trim();
    const question = String(row[indexes[1]] || "").trim();
    const options = indexes.slice(2, 6).map(function (columnIndex) { return String(row[columnIndex] || "").trim(); });
    const answerText = String(row[indexes[6]] || "").trim();
    const answer = Number(answerText);
    if (!id || ids.has(id)) throw new Error("第 " + displayRow + " 列的 id 空白或重複。");
    if (!question || options.some(function (option) { return !option; })) throw new Error("第 " + displayRow + " 列的題目或選項不完整。");
    if (!/^[0-3]$/.test(answerText) || !Number.isInteger(answer)) throw new Error("第 " + displayRow + " 列的 answer 必須是 0、1、2 或 3。");
    ids.add(id);
    questions.push({ id: id, question: question, options: options, answer: answer });
  }
  if (questions.length < TOTAL_QUESTIONS) throw new Error("有效題目只有 " + questions.length + " 題，至少需要 " + TOTAL_QUESTIONS + " 題。");
  return questions;
}

async function loadQuestionBank() {
  const serial = requestSerial + 1;
  requestSerial = serial;
  csvLoadState = "loading";
  csvErrorMessage = "";
  updateBootStatus("畫布已建立，正在載入 Google 試算表題庫…", "info");
  try {
    const csvUrl = normalizeCsvUrl(GOOGLE_SHEET_CSV_URL);
    const csvText = await fetchCsvText(csvUrl, 12000);
    if (serial !== requestSerial) return;
    allQuestions = validateQuestions(csvText);
    csvLoadState = "ready";
    updateBootStatus("測驗已啟動，共 " + allQuestions.length + " 題；本次抽出 " + TOTAL_QUESTIONS + " 題。", "success");
    startNewQuiz();
  } catch (error) {
    if (serial !== requestSerial) return;
    csvLoadState = "error";
    allQuestions = [];
    quizQuestions = [];
    csvErrorMessage = formatError(error, "無法讀取題庫。");
    if (window.location.protocol === "file:") {
      csvErrorMessage += " 目前是 file:// 直接開啟；請用本機伺服器或 p5.js Web Editor，瀏覽器才允許讀取 Google CSV。";
    }
    updateBootStatus("題庫錯誤：" + csvErrorMessage, "error");
  }
}

function startNewQuiz() {
  if (!Array.isArray(allQuestions) || allQuestions.length < TOTAL_QUESTIONS) {
    csvLoadState = "error";
    csvErrorMessage = "題庫不足 " + TOTAL_QUESTIONS + " 題，無法開始測驗。";
    updateBootStatus("題庫錯誤：" + csvErrorMessage, "error");
    return;
  }
  const shuffled = allQuestions.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const temporary = shuffled[index];
    shuffled[index] = shuffled[randomIndex];
    shuffled[randomIndex] = temporary;
  }
  quizQuestions = shuffled.slice(0, TOTAL_QUESTIONS);
  currentQuestionIndex = 0;
  score = 0;
  selectedAnswer = -1;
  answered = false;
  quizFinished = false;
  fireworkParticles = [];
  lastFireworkSpawn = -10000;
  layoutCache = null;
}

function drawLoadingScreen() {
  noStroke();
  fill(COLORS.darkText);
  applyCanvasFont(Math.max(22, Math.min(width * 0.07, 42)), true);
  safeDrawText(fontsReady ? "正在載入題庫…" : "正在載入字型與題庫…", width / 2, height * 0.43, { size: Math.max(22, Math.min(width * 0.07, 42)), bold: true });
  fill(COLORS.mutedText);
  applyCanvasFont(Math.max(14, Math.min(width * 0.04, 24)), false);
  safeDrawText("請稍候，正在取得 Google 試算表資料", width / 2, height * 0.54, { size: Math.max(14, Math.min(width * 0.04, 24)), bold: false });
}

function getReloadButtonRect() {
  const buttonWidth = Math.min(Math.max(180, width * 0.46), 320);
  const buttonHeight = Math.max(44, Math.min(60, height * 0.08));
  return { x: width / 2 - buttonWidth / 2, y: height * 0.78, w: buttonWidth, h: buttonHeight };
}

function drawErrorScreen() {
  const margin = Math.max(16, Math.min(width * 0.08, 70));
  const boxWidth = Math.max(1, width - margin * 2);
  const boxHeight = Math.min(Math.max(330, height * 0.78), 560);
  const boxY = Math.max(58, height / 2 - boxHeight / 2);
  noStroke();
  fill(COLORS.shadow);
  rect(margin + 5, boxY + 6, boxWidth, boxHeight, 18);
  fill("#fff7f5");
  rect(margin, boxY, boxWidth, boxHeight, 18);
  fill(COLORS.error);
  applyCanvasFont(Math.max(20, Math.min(width * 0.065, 36)), true);
  safeDrawText("題庫載入失敗", width / 2, boxY + boxHeight * 0.15);
  const errorSize = Math.max(13, Math.min(width * 0.035, 20));
  const errorLines = wrapText(csvErrorMessage || "請確認 Google 試算表公開 CSV 網址。", boxWidth - 36, errorSize, false);
  fill(COLORS.darkText);
  drawCenteredLines(errorLines, width / 2, boxY + boxHeight * 0.39 - (errorLines.length - 1) * 12, errorSize, errorSize * 1.4, false);
  fill(COLORS.mutedText);
  applyCanvasFont(Math.max(12, Math.min(width * 0.028, 17)), false);
  safeDrawText("欄位必須是 id、question、optionA、optionB、optionC、optionD、answer", width / 2, boxY + boxHeight * 0.63);
  safeDrawText("answer 請填 0、1、2 或 3；至少需要 5 題", width / 2, boxY + boxHeight * 0.69);
  drawButton(getReloadButtonRect(), "重新載入題庫");
}

function getLayout() {
  if (!layoutCache || layoutCache.w !== width || layoutCache.h !== height || layoutCache.index !== currentQuestionIndex || layoutCache.finished !== quizFinished) {
    layoutCache = quizFinished ? buildFinishedLayout() : buildQuizLayout();
  }
  return layoutCache;
}

function buildQuizLayout() {
  const side = Math.max(14, Math.min(width * 0.06, 70));
  const contentWidth = Math.max(1, width - side * 2);
  const landscape = width > height && width >= 600;
  const singleColumn = width < 600 || height < 520;
  let compact = 1;
  let candidate = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const top = Math.max(62, height * 0.075);
    const titleSize = Math.max(15, Math.min(40, Math.min(width * 0.045, height * 0.065) * compact));
    const progressSize = Math.max(11, Math.min(18, titleSize * 0.48));
    const questionSize = Math.max(13, Math.min(28, Math.min(width * 0.032, height * 0.043) * compact));
    const optionSize = Math.max(12, Math.min(21, Math.min(width * 0.024, height * 0.033) * compact));
    const titleLines = wrapText("程式設計 p5.js 簡易指令練習測驗", contentWidth, titleSize, true);
    const titleLineHeight = titleSize * 1.2;
    const progressY = top + titleLines.length * titleLineHeight + 10;
    const questionTop = progressY + progressSize * 0.8 + 10;
    const questionPadding = Math.max(10, questionSize * 0.8);
    const questionLines = wrapText(quizQuestions[currentQuestionIndex].question, contentWidth - questionPadding * 2, questionSize, true);
    const questionLineHeight = questionSize * 1.3;
    const questionHeight = Math.max(64, questionLines.length * questionLineHeight + questionPadding * 2);
    const optionsTop = questionTop + questionHeight + Math.max(8, height * 0.018);
    const gap = Math.max(7, Math.min(16, width * 0.018));
    const optionWidth = singleColumn ? contentWidth : (contentWidth - gap) / 2;
    const optionPadding = Math.max(8, optionSize * 0.8);
    const optionHeights = quizQuestions[currentQuestionIndex].options.map(function (option, optionIndex) {
      const lines = wrapText(String.fromCharCode(65 + optionIndex) + ". " + option, optionWidth - optionPadding * 2, optionSize, true);
      return Math.max(40, lines.length * optionSize * 1.25 + optionPadding * 2);
    });
    const rowHeights = singleColumn ? optionHeights : [Math.max(optionHeights[0], optionHeights[1]), Math.max(optionHeights[2], optionHeights[3])];
    const optionRects = optionHeights.map(function (heightValue, optionIndex) {
      if (singleColumn) {
        return { x: side, y: optionsTop + optionHeights.slice(0, optionIndex).reduce(function (a, b) { return a + b + gap; }, 0), w: contentWidth, h: heightValue };
      }
      const row = Math.floor(optionIndex / 2);
      return { x: side + (optionIndex % 2) * (optionWidth + gap), y: optionsTop + rowHeights.slice(0, row).reduce(function (a, b) { return a + b + gap; }, 0), w: optionWidth, h: heightValue };
    });
    const optionsBottom = optionsTop + rowHeights.reduce(function (a, b) { return a + b; }, 0) + Math.max(0, rowHeights.length - 1) * gap;
    const buttonHeight = Math.max(40, Math.min(58, 54 * compact));
    const button = { x: width / 2 - Math.min(280, contentWidth * 0.64) / 2, y: optionsBottom + 14, w: Math.min(280, contentWidth * 0.64), h: buttonHeight };
    candidate = { w: width, h: height, index: currentQuestionIndex, finished: false, side: side, contentWidth: contentWidth, titleSize: titleSize, titleLines: titleLines, titleLineHeight: titleLineHeight, progressSize: progressSize, progressY: progressY, questionTop: questionTop, questionHeight: questionHeight, questionSize: questionSize, questionLines: questionLines, questionLineHeight: questionLineHeight, optionSize: optionSize, optionLineHeight: optionSize * 1.25, optionRects: optionRects, gap: gap, button: button, singleColumn: singleColumn };
    if (button.y + button.h + 18 <= height || compact <= 0.55) break;
    compact -= 0.1;
  }
  return candidate;
}

function drawQuizScreen() {
  const layout = getLayout();
  const current = quizQuestions[currentQuestionIndex];
  noStroke();
  fill(COLORS.darkText);
  drawCenteredLines(layout.titleLines, width / 2, Math.max(55, layout.progressY - layout.titleLines.length * layout.titleLineHeight / 2 - 5), layout.titleSize, layout.titleLineHeight, true);
  fill(COLORS.mutedText);
  applyCanvasFont(layout.progressSize, false);
  safeDrawText("第 " + (currentQuestionIndex + 1) + " 題／共 " + quizQuestions.length + " 題", width / 2, layout.progressY);
  drawPanel(layout.side + 4, layout.questionTop + 5, layout.contentWidth, layout.questionHeight, COLORS.shadow, 16);
  drawPanel(layout.side, layout.questionTop, layout.contentWidth, layout.questionHeight, COLORS.question, 16);
  fill(COLORS.darkText);
  const questionFirstY = layout.questionTop + layout.questionHeight / 2 - (layout.questionLines.length - 1) * layout.questionLineHeight / 2;
  drawCenteredLines(layout.questionLines, width / 2, questionFirstY, layout.questionSize, layout.questionLineHeight, true);
  current.options.forEach(function (option, optionIndex) {
    const rectValue = layout.optionRects[optionIndex];
    const offset = getOptionOffset(optionIndex);
    const x = rectValue.x + offset.x;
    const y = rectValue.y + offset.y;
    drawPanel(x + 3, y + 4, rectValue.w, rectValue.h, COLORS.shadow, 13);
    drawPanel(x, y, rectValue.w, rectValue.h, getOptionColor(optionIndex, current.answer), 13);
    fill(getOptionTextColor(optionIndex, current.answer));
    const display = String.fromCharCode(65 + optionIndex) + ". " + option;
    const lines = wrapText(display, rectValue.w - layout.optionSize * 1.7, layout.optionSize, true);
    const firstY = y + rectValue.h / 2 - (lines.length - 1) * layout.optionLineHeight / 2;
    drawCenteredLines(lines, x + rectValue.w / 2, firstY, layout.optionSize, layout.optionLineHeight, true);
  });
  if (answered) drawButton(layout.button, currentQuestionIndex === quizQuestions.length - 1 ? "查看總成績" : "下一題");
}

function drawPanel(x, y, panelWidth, panelHeight, panelColor, radius) {
  noStroke();
  fill(panelColor);
  rect(x, y, Math.max(1, panelWidth), Math.max(1, panelHeight), radius);
}

function drawButton(button, label) {
  drawPanel(button.x, button.y, button.w, button.h, COLORS.button, 14);
  fill(COLORS.buttonText);
  applyCanvasFont(Math.max(13, Math.min(22, button.h * 0.38)), true);
  safeDrawText(label, button.x + button.w / 2, button.y + button.h / 2);
}

function getOptionColor(optionIndex, correctIndex) {
  if (!answered) return COLORS.option;
  if (optionIndex === selectedAnswer && selectedAnswer === correctIndex) return COLORS.correct;
  if (optionIndex === selectedAnswer) return COLORS.wrong;
  if (optionIndex === correctIndex) return COLORS.correctAnswer;
  return COLORS.option;
}

function getOptionTextColor(optionIndex, correctIndex) {
  return answered && optionIndex === selectedAnswer && selectedAnswer === correctIndex ? COLORS.buttonText : COLORS.darkText;
}

function getOptionOffset(optionIndex) {
  if (!answered) return { x: 0, y: 0 };
  const current = quizQuestions[currentQuestionIndex];
  const rectValue = getLayout().optionRects[optionIndex];
  if (optionIndex === selectedAnswer && selectedAnswer !== current.answer) return { x: Math.sin(animationTime * 0.016) * Math.min(10, rectValue.w * 0.035), y: 0 };
  if (optionIndex === current.answer) return { x: 0, y: Math.sin(animationTime * 0.012) * Math.min(8, rectValue.h * 0.12) };
  return { x: 0, y: 0 };
}

function buildFinishedLayout() {
  const side = Math.max(14, Math.min(width * 0.07, 70));
  const contentWidth = width - side * 2;
  const titleSize = Math.max(18, Math.min(46, Math.min(width * 0.07, height * 0.09)));
  const titleLines = wrapText("測驗完成！", contentWidth, titleSize, true);
  const titleLineHeight = titleSize * 1.2;
  const titleY = Math.max(70, height * 0.12);
  const cardY = titleY + titleLines.length * titleLineHeight / 2 + 24;
  const cardHeight = Math.min(440, Math.max(230, height - cardY - 20));
  const cardWidth = Math.min(contentWidth, 640);
  const cardX = width / 2 - cardWidth / 2;
  const button = { x: width / 2 - Math.min(280, cardWidth * 0.62) / 2, y: cardY + cardHeight - 70, w: Math.min(280, cardWidth * 0.62), h: 52 };
  return { w: width, h: height, index: currentQuestionIndex, finished: true, side: side, titleSize: titleSize, titleLines: titleLines, titleLineHeight: titleLineHeight, titleY: titleY, cardX: cardX, cardY: cardY, cardWidth: cardWidth, cardHeight: cardHeight, button: button };
}

function drawFinishedScreen() {
  const layout = getLayout();
  const percentage = Math.round((score / TOTAL_QUESTIONS) * 100);
  const passed = percentage >= 60;
  if (passed) {
    updateFireworks(layout);
    drawFireworks();
  }
  fill(COLORS.darkText);
  drawCenteredLines(layout.titleLines, width / 2, layout.titleY, layout.titleSize, layout.titleLineHeight, true);
  drawPanel(layout.cardX + 5, layout.cardY + 6, layout.cardWidth, layout.cardHeight, COLORS.shadow, 20);
  drawPanel(layout.cardX, layout.cardY, layout.cardWidth, layout.cardHeight, COLORS.option, 20);
  fill(COLORS.correct);
  applyCanvasFont(Math.max(18, Math.min(60, layout.cardWidth * 0.105)), true);
  safeDrawText(score + "／" + TOTAL_QUESTIONS + " 題答對", width / 2, layout.cardY + layout.cardHeight * 0.22);
  fill(COLORS.darkText);
  applyCanvasFont(Math.max(14, Math.min(34, layout.cardWidth * 0.06)), true);
  safeDrawText("總成績：" + percentage + " 分", width / 2, layout.cardY + layout.cardHeight * 0.39);
  fill(passed ? COLORS.correct : "#e76f51");
  applyCanvasFont(Math.max(16, Math.min(38, layout.cardWidth * 0.085)), true);
  safeDrawText(passed ? "恭喜通過！" : "再加油！", width / 2, layout.cardY + layout.cardHeight * 0.55);
  if (passed) {
    applyCanvasFont(Math.max(13, Math.min(22, layout.cardWidth * 0.04)), false);
    fill(COLORS.mutedText);
    safeDrawText("60 分以上，送你一場煙火！", width / 2, layout.cardY + layout.cardHeight * 0.68);
  } else {
    drawCuteBear(layout.cardX + layout.cardWidth * 0.27, layout.cardY + layout.cardHeight * 0.72, Math.min(100, layout.cardWidth * 0.2), 1 + Math.sin(animationTime * 0.004) * 0.045);
    fill(COLORS.darkText);
    applyCanvasFont(Math.max(12, Math.min(22, layout.cardWidth * 0.04)), true);
    safeDrawText("再加油！你一定可以的！", layout.cardX + layout.cardWidth * 0.68, layout.cardY + layout.cardHeight * 0.72);
  }
  drawButton(layout.button, "再測驗一次");
}

function hasPassed() { return score >= 3; }

function updateFireworks(layout) {
  if (animationTime - lastFireworkSpawn > 850) {
    const centerX = Math.random() * width * 0.72 + width * 0.14;
    const centerY = Math.random() * Math.max(20, layout.cardY - 20) + 30;
    const colors = ["#ff595e", "#ffca3a", "#8ac926", "#1982c4", "#c77dff", "#ffffff"];
    const selectedColor = colors[Math.floor(Math.random() * colors.length)];
    for (let index = 0; index < 36; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.4;
      fireworkParticles.push({ x: centerX, y: centerY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 70, color: selectedColor, size: 2 + Math.random() * 2 });
    }
    lastFireworkSpawn = animationTime;
  }
  fireworkParticles.forEach(function (particle) {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.035;
    particle.life -= 1;
  });
  fireworkParticles = fireworkParticles.filter(function (particle) { return particle.life > 0; });
}

function drawFireworks() {
  noStroke();
  fireworkParticles.forEach(function (particle) {
    const alpha = Math.max(0, Math.min(255, particle.life * 4));
    const particleColor = color(particle.color);
    particleColor.setAlpha(alpha);
    fill(particleColor);
    circle(particle.x, particle.y, particle.size);
  });
}

function drawCuteBear(centerX, centerY, bearSize, breathingScale) {
  push();
  translate(centerX, centerY);
  scale(breathingScale);
  noStroke();
  fill("#c98b5b");
  ellipse(0, bearSize * 0.36, bearSize * 0.68, bearSize * 0.72);
  circle(-bearSize * 0.3, -bearSize * 0.27, bearSize * 0.38);
  circle(bearSize * 0.3, -bearSize * 0.27, bearSize * 0.38);
  fill("#f4b6a6");
  circle(-bearSize * 0.3, -bearSize * 0.27, bearSize * 0.2);
  circle(bearSize * 0.3, -bearSize * 0.27, bearSize * 0.2);
  fill("#c98b5b");
  ellipse(0, -bearSize * 0.08, bearSize * 0.75, bearSize * 0.68);
  fill("#ffe0b2");
  ellipse(0, bearSize * 0.02, bearSize * 0.52, bearSize * 0.42);
  fill(COLORS.darkText);
  ellipse(-bearSize * 0.15, -bearSize * 0.13, bearSize * 0.075, bearSize * 0.105);
  ellipse(bearSize * 0.15, -bearSize * 0.13, bearSize * 0.075, bearSize * 0.105);
  ellipse(0, bearSize * 0.02, bearSize * 0.13, bearSize * 0.095);
  noFill();
  stroke(COLORS.darkText);
  strokeWeight(Math.max(1, bearSize * 0.025));
  arc(0, bearSize * 0.08, bearSize * 0.2, bearSize * 0.14, 0, Math.PI);
  pop();
}

function pointInside(x, y, rectangle) {
  return rectangle && x >= rectangle.x && x <= rectangle.x + rectangle.w && y >= rectangle.y && y <= rectangle.y + rectangle.h;
}

function handlePointer(x, y) {
  const now = typeof millis === "function" ? millis() : Date.now();
  if (now - lastActionTime < 220) return;
  lastActionTime = now;
  if (csvLoadState === "error") {
    if (pointInside(x, y, getReloadButtonRect())) loadQuestionBank();
    return;
  }
  if (csvLoadState !== "ready" || !quizQuestions.length) return;
  const layout = getLayout();
  if (quizFinished) {
    if (pointInside(x, y, layout.button)) startNewQuiz();
    return;
  }
  if (!answered) {
    quizQuestions[currentQuestionIndex].options.forEach(function (unusedOption, optionIndex) {
      if (selectedAnswer < 0 && pointInside(x, y, layout.optionRects[optionIndex])) {
        selectedAnswer = optionIndex;
        answered = true;
        if (selectedAnswer === quizQuestions[currentQuestionIndex].answer) score += 1;
      }
    });
  } else if (pointInside(x, y, layout.button)) {
    if (currentQuestionIndex >= quizQuestions.length - 1) {
      quizFinished = true;
      fireworkParticles = [];
      lastFireworkSpawn = animationTime - 850;
    } else {
      currentQuestionIndex += 1;
      selectedAnswer = -1;
      answered = false;
    }
    layoutCache = null;
  }
}

function mousePressed() {
  handlePointer(mouseX, mouseY);
  return false;
}

function touchStarted() {
  handlePointer(mouseX, mouseY);
  return false;
}

function windowResized() {
  try {
    resizeCanvas(Math.max(1, windowWidth), Math.max(1, windowHeight));
    layoutCache = null;
  } catch (error) {
    drawRuntimeError = formatError(error, "調整畫布大小失敗");
    updateBootStatus("視窗調整錯誤：" + drawRuntimeError, "error");
  }
}

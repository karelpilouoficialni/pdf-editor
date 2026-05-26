if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
} else {
  console.error("pdfjsLib není dostupný.");
}

let pdfDocs = [];
let currentDocIndex = 0;
let currentPage = 1;
let zoom = 1.0;
let undoStack = [];
let redoStack = [];

const fileInput = document.getElementById("file-input");
const loadFilesBtn = document.getElementById("load-files-btn");
const resetBtn = document.getElementById("reset-btn");
const fileList = document.getElementById("file-list");
const pdfCanvas = document.getElementById("pdf-canvas");
const pageInfo = document.getElementById("page-info");
const prevPageBtn = document.getElementById("prev-page");
const nextPageBtn = document.getElementById("next-page");
const pageJump = document.getElementById("page-jump");
const textInput = document.getElementById("text-input");
const fontSizeInput = document.getElementById("font-size");
const textColorInput = document.getElementById("text-color");
const addTextBtn = document.getElementById("add-text-btn");
const deletePageBtn = document.getElementById("delete-page-btn");
const rotatePageBtn = document.getElementById("rotate-page-btn");
const savePdfBtn = document.getElementById("save-pdf-btn");
const mergeList = document.getElementById("merge-list");
const mergeBtn = document.getElementById("merge-btn");
const exportTxtBtn = document.getElementById("export-txt-btn");
const imageInput = document.getElementById("image-input");
const convertImagesBtn = document.getElementById("convert-images-btn");
const themeToggle = document.getElementById("theme-toggle");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const fitPageBtn = document.getElementById("fit-page-btn");
const zoomLevel = document.getElementById("zoom-level");
const dropArea = document.getElementById("drop-area");
const pdfInfo = document.getElementById("pdf-info");
const spinner = document.getElementById("page-loader");
const undoBtn = document.getElementById("undo-btn");
const redoBtn = document.getElementById("redo-btn");
const splitPdfBtn = document.getElementById("split-pdf-btn");
const toastContainer = document.getElementById("toast-container");

function uint8ToArrayBuffer(uint8) {
  return uint8.buffer.slice(
    uint8.byteOffset,
    uint8.byteOffset + uint8.byteLength,
  );
}

// Toast notifications
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icons = { info: "ℹ", success: "✅", error: "❌" };
  toast.innerHTML = `${icons[type] || ""} ${message}`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("out");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Theme toggle — dark mode default
const savedTheme = localStorage.getItem("pdf-editor-theme");
const isDark = savedTheme === null || savedTheme === "dark";
if (isDark) {
  document.documentElement.setAttribute("data-theme", "dark");
  themeToggle.textContent = "☀️";
}

themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    themeToggle.textContent = "🌙";
    localStorage.setItem("pdf-editor-theme", "light");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    themeToggle.textContent = "☀️";
    localStorage.setItem("pdf-editor-theme", "dark");
  }
});

// Undo / Redo
function pushUndo() {
  const current = pdfDocs[currentDocIndex];
  if (!current) return;
  undoStack.push(current.originalBuffer.slice(0));
  redoStack = [];
  updateUndoButtons();
}

function updateUndoButtons() {
  undoBtn.style.opacity = undoStack.length ? "1" : "0.3";
  redoBtn.style.opacity = redoStack.length ? "1" : "0.3";
}

undoBtn.addEventListener("click", async () => {
  if (!undoStack.length || !pdfDocs[currentDocIndex]) return;
  const current = pdfDocs[currentDocIndex];
  redoStack.push(current.originalBuffer.slice(0));
  current.originalBuffer = undoStack.pop();
  current.doc = await PDFLib.PDFDocument.load(current.originalBuffer);
  updateUndoButtons();
  await renderPage();
  showToast("Vráceno zpět", "info");
});

redoBtn.addEventListener("click", async () => {
  if (!redoStack.length || !pdfDocs[currentDocIndex]) return;
  const current = pdfDocs[currentDocIndex];
  undoStack.push(current.originalBuffer.slice(0));
  current.originalBuffer = redoStack.pop();
  current.doc = await PDFLib.PDFDocument.load(current.originalBuffer);
  updateUndoButtons();
  await renderPage();
  showToast("Obnoveno", "info");
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "z") {
    e.preventDefault();
    undoBtn.click();
  }
  if (e.ctrlKey && e.key === "y") {
    e.preventDefault();
    redoBtn.click();
  }
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    savePdfBtn.click();
  }
  if (e.key === "ArrowLeft" && pdfDocs.length) prevPageBtn.click();
  if (e.key === "ArrowRight" && pdfDocs.length) nextPageBtn.click();
});

// Drag & drop
dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add("dragover");
});
dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("dragover");
});
dropArea.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropArea.classList.remove("dragover");
  const files = Array.from(e.dataTransfer.files).filter(
    (f) => f.type === "application/pdf",
  );
  if (files.length === 0) {
    showToast("Přetáhněte pouze PDF soubory", "error");
    return;
  }
  await loadFiles(files);
});

// Load files
loadFilesBtn.addEventListener("click", async () => {
  const files = Array.from(fileInput.files || []);
  if (files.length === 0) {
    showToast("Nevybrali jste žádné soubory.", "error");
    return;
  }
  await loadFiles(files);
});

async function loadFiles(files) {
  for (const file of files) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
      pdfDocs.push({
        name: file.name,
        doc: pdfDoc,
        originalBuffer: arrayBuffer,
        size: file.size,
      });
      showToast(`Načten: ${file.name}`, "success");
    } catch (error) {
      console.error("Chyba:", file.name, error);
      showToast(`Chyba při načítání ${file.name}`, "error");
    }
  }
  updateFileList();
  updateMergeList();
  updatePdfInfo();
  if (pdfDocs.length > 0) {
    currentDocIndex = 0;
    currentPage = 1;
    await renderPage();
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function updatePdfInfo() {
  const current = pdfDocs[currentDocIndex];
  if (!current) {
    pdfInfo.innerHTML = "";
    return;
  }
  const pageCount = current.doc.getPageCount();
  pdfInfo.innerHTML = `
        <strong>${current.name}</strong><br>
        Stránek: ${pageCount} | Velikost: ${formatSize(current.size)}
    `;
}

function updateFileList() {
  fileList.innerHTML = "";
  pdfDocs.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = `file-item${i === currentDocIndex ? " active" : ""}`;
    div.innerHTML = `
            <span class="file-icon">📄</span>
            <span class="file-name">${p.name}</span>
            <span class="file-size">${formatSize(p.size)}</span>
        `;
    div.addEventListener("click", () => {
      currentDocIndex = i;
      currentPage = 1;
      undoStack = [];
      redoStack = [];
      updateUndoButtons();
      updateFileList();
      updatePdfInfo();
      renderPage();
    });
    fileList.appendChild(div);
  });
}

function updateMergeList() {
  mergeList.innerHTML = "";
  pdfDocs.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "merge-item";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.dataset.index = i;
    div.appendChild(chk);
    const label = document.createElement("span");
    label.textContent = p.name;
    div.appendChild(label);
    mergeList.appendChild(div);
  });
}

function showSpinner() {
  spinner.classList.add("active");
  pdfCanvas.classList.add("fade");
}

function hideSpinner() {
  spinner.classList.remove("active");
  pdfCanvas.classList.remove("fade");
}

async function renderPage() {
  if (!window.pdfjsLib) return;
  if (!pdfDocs[currentDocIndex]) return;
  showSpinner();
  const arrayBuffer = pdfDocs[currentDocIndex].originalBuffer;
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  if (currentPage < 1) currentPage = 1;
  if (currentPage > pdf.numPages) currentPage = pdf.numPages;
  const page = await pdf.getPage(currentPage);
  const viewport = page.getViewport({ scale: 1.5 * zoom });
  const canvas = pdfCanvas;
  const context = canvas.getContext("2d");
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  await page.render({ canvasContext: context, viewport }).promise;
  pageInfo.textContent = `Stránka ${currentPage} z ${pdf.numPages}`;
  pageJump.value = currentPage;
  pageJump.max = pdf.numPages;
  zoomLevel.textContent = Math.round(zoom * 100) + "%";
  hideSpinner();
}

// Zoom
zoomInBtn.addEventListener("click", () => {
  zoom = Math.min(3, zoom + 0.15);
  renderPage();
});
zoomOutBtn.addEventListener("click", () => {
  zoom = Math.max(0.25, zoom - 0.15);
  renderPage();
});
fitPageBtn.addEventListener("click", () => {
  zoom = 1.0;
  renderPage();
});

// Page jump
pageJump.addEventListener("change", async () => {
  if (!pdfDocs[currentDocIndex]) return;
  const loadingTask = pdfjsLib.getDocument({
    data: pdfDocs[currentDocIndex].originalBuffer,
  });
  const pdf = await loadingTask.promise;
  const val = parseInt(pageJump.value, 10);
  if (val >= 1 && val <= pdf.numPages) {
    currentPage = val;
    await renderPage();
  } else {
    pageJump.value = currentPage;
    showToast("Neplatné číslo stránky", "error");
  }
});

resetBtn.addEventListener("click", () => {
  if (pdfDocs.length === 0) return;
  pdfDocs = [];
  currentDocIndex = 0;
  currentPage = 1;
  zoom = 1.0;
  undoStack = [];
  redoStack = [];
  updateUndoButtons();
  fileList.innerHTML = "";
  mergeList.innerHTML = "";
  pdfInfo.innerHTML = "";
  const ctx = pdfCanvas.getContext("2d");
  ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
  pageInfo.textContent = "Stránka 0 z 0";
  zoomLevel.textContent = "100%";
  showToast("Všechny soubory byly vymazány", "info");
});

prevPageBtn.addEventListener("click", async () => {
  if (!pdfDocs[currentDocIndex]) return;
  currentPage = Math.max(1, currentPage - 1);
  await renderPage();
});
nextPageBtn.addEventListener("click", async () => {
  if (!pdfDocs[currentDocIndex]) return;
  const loadingTask = pdfjsLib.getDocument({
    data: pdfDocs[currentDocIndex].originalBuffer,
  });
  const pdf = await loadingTask.promise;
  currentPage = Math.min(pdf.numPages, currentPage + 1);
  await renderPage();
});

addTextBtn.addEventListener("click", async () => {
  const txt = textInput.value.trim();
  const size = parseInt(fontSizeInput.value, 10) || 12;
  const color = textColorInput.value;
  if (!txt) return showToast("Zadejte text.", "error");
  const current = pdfDocs[currentDocIndex];
  if (!current) return;
  pushUndo();
  const pdfDoc = current.doc;
  const pageIndex = currentPage - 1;
  const page = pdfDoc.getPages()[pageIndex];
  const helv = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const { width, height } = page.getSize();
  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;
  page.drawText(txt, {
    x: 50,
    y: height - 50 - size,
    size,
    font: helv,
    color: PDFLib.rgb(r, g, b),
  });
  const bytes = await pdfDoc.save();
  current.originalBuffer = uint8ToArrayBuffer(bytes);
  await renderPage();
  showToast(`Text "${txt}" přidán`, "success");
});

deletePageBtn.addEventListener("click", async () => {
  const current = pdfDocs[currentDocIndex];
  if (!current) return;
  const pdfDoc = current.doc;
  const pageCount = pdfDoc.getPageCount();
  if (pageCount <= 1) {
    showToast("Nelze smazat poslední stránku.", "error");
    return;
  }
  pushUndo();
  const pageIndex = currentPage - 1;
  pdfDoc.removePage(pageIndex);
  currentPage = Math.min(currentPage, pdfDoc.getPageCount());
  const bytes = await pdfDoc.save();
  current.originalBuffer = uint8ToArrayBuffer(bytes);
  updatePdfInfo();
  await renderPage();
  showToast("Stránka smazána", "success");
});

rotatePageBtn.addEventListener("click", async () => {
  const current = pdfDocs[currentDocIndex];
  if (!current) return;
  pushUndo();
  const pdfDoc = current.doc;
  const pageIndex = currentPage - 1;
  const page = pdfDoc.getPages()[pageIndex];
  const currentRotation = page.getRotation().angle || 0;
  page.setRotation(PDFLib.degrees((currentRotation + 90) % 360));
  const bytes = await pdfDoc.save();
  current.originalBuffer = uint8ToArrayBuffer(bytes);
  await renderPage();
  showToast("Stránka otočena", "success");
});

savePdfBtn.addEventListener("click", async () => {
  const current = pdfDocs[currentDocIndex];
  if (!current) return;
  const pdfDoc = current.doc;
  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = current.name.replace(/\.pdf$/i, "") + "-edited.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("PDF uloženo", "success");
});

mergeBtn.addEventListener("click", async () => {
  const checks = Array.from(
    mergeList.querySelectorAll("input[type=checkbox]:checked"),
  ).map((c) => parseInt(c.dataset.index, 10));
  if (checks.length === 0)
    return showToast("Vyberte alespoň jedno PDF ke spojení.", "error");
  const newPdf = await PDFLib.PDFDocument.create();
  for (const idx of checks) {
    const src = pdfDocs[idx];
    if (!src) continue;
    const srcDoc = await PDFLib.PDFDocument.load(src.originalBuffer);
    const copied = await newPdf.copyPages(srcDoc, srcDoc.getPageIndices());
    copied.forEach((p) => newPdf.addPage(p));
  }
  const bytes = await newPdf.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "merged.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("PDF spojena", "success");
});

exportTxtBtn.addEventListener("click", async () => {
  const current = pdfDocs[currentDocIndex];
  if (!current) return;
  const loadingTask = pdfjsLib.getDocument({ data: current.originalBuffer });
  const pdf = await loadingTask.promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => it.str);
    fullText += strings.join(" ") + "\n\n";
  }
  const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = current.name.replace(/\.pdf$/i, "") + ".txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Text exportován", "success");
});

convertImagesBtn.addEventListener("click", async () => {
  const files = Array.from(imageInput.files || []);
  if (files.length === 0)
    return showToast("Vyberte alespoň jeden obrázek.", "error");
  const pdfDoc = await PDFLib.PDFDocument.create();
  for (const file of files) {
    const bytes = await file.arrayBuffer();
    let img;
    if (file.type === "image/png") {
      img = await pdfDoc.embedPng(bytes);
    } else {
      img = await pdfDoc.embedJpg(bytes);
    }
    const { width, height } = img.scale(1);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
  const out = await pdfDoc.save();
  const blob = new Blob([out], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "images.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("PDF z obrázků vytvořeno", "success");
});

// Split PDF
splitPdfBtn.addEventListener("click", async () => {
  const current = pdfDocs[currentDocIndex];
  if (!current) return;
  const pageCount = current.doc.getPageCount();
  if (pageCount < 2) {
    showToast("PDF musí mít alespoň 2 stránky pro rozdělení.", "error");
    return;
  }
  for (let i = 0; i < pageCount; i++) {
    const newPdf = await PDFLib.PDFDocument.create();
    const srcDoc = await PDFLib.PDFDocument.load(current.originalBuffer);
    const [page] = await newPdf.copyPages(srcDoc, [i]);
    newPdf.addPage(page);
    const bytes = await newPdf.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = current.name.replace(/\.pdf$/i, "") + `-strana-${i + 1}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  showToast(`Rozděleno na ${pageCount} souborů`, "success");
});

// Init
updateUndoButtons();

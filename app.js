if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
}

let pdfDocs = [];
let currentDocIndex = 0;
let currentPage = 1;
let zoom = 1.0;
let undoStack = [];
let redoStack = [];
let thumbGenId = 0;
let isGridView = false;
let deletionMode = false;

const $ = id => document.getElementById(id);
const fileInput = $("file-input");
const loadFilesBtn = $("load-files-btn");
const resetBtn = $("reset-btn");
const fileList = $("file-list");
const pdfCanvas = $("pdf-canvas");
const pageInfo = $("page-info");
const prevPageBtn = $("prev-page");
const nextPageBtn = $("next-page");
const pageJump = $("page-jump");
const textInput = $("text-input");
const fontSizeInput = $("font-size");
const textColorInput = $("text-color");
const addTextBtn = $("add-text-btn");
const deletePageBtn = $("delete-page-btn");
const rotatePageBtn = $("rotate-page-btn");
const savePdfBtn = $("save-pdf-btn");
const mergeList = $("merge-list");
const mergeBtn = $("merge-btn");
const exportTxtBtn = $("export-txt-btn");
const imageInput = $("image-input");
const convertImagesBtn = $("convert-images-btn");
const themeToggle = $("theme-toggle");
const zoomInBtn = $("zoom-in-btn");
const zoomOutBtn = $("zoom-out-btn");
const fitPageBtn = $("fit-page-btn");
const zoomLevel = $("zoom-level");
const dropArea = $("drop-area");
const pdfInfo = $("pdf-info");
const spinner = $("page-loader");
const undoBtn = $("undo-btn");
const redoBtn = $("redo-btn");
const splitPdfBtn = $("split-pdf-btn");
const gridView = $("grid-view");
const gridToggleBtn = $("grid-toggle-btn");
const deleteModeBtn = $("delete-mode-btn");
const movePageUp = $("move-page-up");
const movePageDown = $("move-page-down");
const addBlankPageBtn = $("add-blank-page-btn");
const deleteSelectedBtn = $("delete-selected-btn");
const extractPagesBtn = $("extract-pages-btn");
const extractRange = $("extract-range");
const insertPdfInput = $("insert-pdf-input");
const insertPosition = $("insert-position");
const insertPageBtn = $("insert-page-btn");
const toastContainer = $("toast-container");

function uint8ToArrayBuffer(uint8) {
    return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
}

function showToast(message, type) {
    const toast = document.createElement("div");
    toast.className = "toast toast-" + (type || "info");
    const icons = { info: "ℹ", success: "✅", error: "❌" };
    toast.innerHTML = (icons[type] || "") + " " + message;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.classList.add("out"); setTimeout(() => toast.remove(), 300); }, 3000);
}

// Theme
const savedTheme = localStorage.getItem("pdf-editor-theme");
const isDark = savedTheme === null || savedTheme === "dark";
if (isDark) { document.documentElement.setAttribute("data-theme", "dark"); themeToggle.textContent = "☀️"; }
themeToggle.addEventListener("click", () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    if (dark) {
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
    updatePdfInfo();
    await renderPage();
    await generateThumbnails();
    showToast("Vráceno zpět", "info");
});

redoBtn.addEventListener("click", async () => {
    if (!redoStack.length || !pdfDocs[currentDocIndex]) return;
    const current = pdfDocs[currentDocIndex];
    undoStack.push(current.originalBuffer.slice(0));
    current.originalBuffer = redoStack.pop();
    current.doc = await PDFLib.PDFDocument.load(current.originalBuffer);
    updateUndoButtons();
    updatePdfInfo();
    await renderPage();
    await generateThumbnails();
    showToast("Obnoveno", "info");
});

document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "z") { e.preventDefault(); undoBtn.click(); }
    if (e.ctrlKey && e.key === "y") { e.preventDefault(); redoBtn.click(); }
    if (e.ctrlKey && e.key === "s") { e.preventDefault(); savePdfBtn.click(); }
    if (e.key === "ArrowLeft" && pdfDocs.length) prevPageBtn.click();
    if (e.key === "ArrowRight" && pdfDocs.length) nextPageBtn.click();
});

// Drag & drop
dropArea.addEventListener("dragover", (e) => { e.preventDefault(); dropArea.classList.add("dragover"); });
dropArea.addEventListener("dragleave", () => { dropArea.classList.remove("dragover"); });
dropArea.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropArea.classList.remove("dragover");
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
    if (files.length === 0) { showToast("Přetáhněte pouze PDF soubory", "error"); return; }
    await loadFiles(files);
});

// Load files
loadFilesBtn.addEventListener("click", async () => {
    const files = Array.from(fileInput.files || []);
    if (files.length === 0) { showToast("Nevybrali jste žádné soubory.", "error"); return; }
    await loadFiles(files);
});

async function loadFiles(files) {
    for (const file of files) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            pdfDocs.push({ name: file.name, doc: pdfDoc, originalBuffer: arrayBuffer, size: file.size });
            showToast("Načten: " + file.name, "success");
        } catch (error) {
            showToast("Chyba při načítání " + file.name, "error");
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
    if (!current) { pdfInfo.innerHTML = ""; return; }
    const pageCount = current.doc.getPageCount();
    pdfInfo.innerHTML = "<strong>" + current.name + "</strong><br>Stránek: " + pageCount + " | Velikost: " + formatSize(current.size);
}

function updateFileList() {
    fileList.innerHTML = "";
    pdfDocs.forEach((p, i) => {
        const div = document.createElement("div");
        div.className = "file-item" + (i === currentDocIndex ? " active" : "");
        div.innerHTML = "<span class=\"file-icon\">📄</span><span class=\"file-name\">" + p.name + "</span><span class=\"file-size\">" + formatSize(p.size) + "</span>";
        div.addEventListener("click", async () => {
            currentDocIndex = i;
            currentPage = 1;
            undoStack = [];
            redoStack = [];
            updateUndoButtons();
            updateFileList();
            updatePdfInfo();
            await renderPage();
            await generateThumbnails();
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

function showSpinner() { spinner.classList.add("active"); pdfCanvas.classList.add("fade"); }
function hideSpinner() { spinner.classList.remove("active"); pdfCanvas.classList.remove("fade"); }

async function renderPage() {
    if (!window.pdfjsLib) return;
    if (!pdfDocs[currentDocIndex]) return;
    showSpinner();
    const arrayBuffer = pdfDocs[currentDocIndex].originalBuffer.slice(0);
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
    pageInfo.textContent = "Stránka " + currentPage + " z " + pdf.numPages;
    pageJump.value = currentPage;
    pageJump.max = pdf.numPages;
    zoomLevel.textContent = Math.round(zoom * 100) + "%";
    hideSpinner();
}

async function generateThumbnails() {
    const genId = ++thumbGenId;
    gridView.innerHTML = "";
    const current = pdfDocs[currentDocIndex];
    if (!current || !window.pdfjsLib) return;
    try {
        const loadingTask = pdfjsLib.getDocument({ data: current.originalBuffer.slice(0) });
        const pdf = await loadingTask.promise;
        for (let i = 1; i <= pdf.numPages; i++) {
            if (genId !== thumbGenId) return;
            const div = document.createElement("div");
            div.className = "grid-page" + (i === currentPage ? " active" : "");
            div.dataset.page = i;
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "grid-check";
            cb.dataset.pageIndex = i - 1;
            div.appendChild(cb);
            cb.addEventListener("click", (e) => e.stopPropagation());
            const canvas = document.createElement("canvas");
            canvas.width = 150;
            canvas.height = 200;
            const ctx = canvas.getContext("2d");
            const page = await pdf.getPage(i);
            if (genId !== thumbGenId) return;
            const viewport = page.getViewport({ scale: 0.5 });
            await page.render({ canvasContext: ctx, viewport }).promise;
            if (genId !== thumbGenId) return;
            div.appendChild(canvas);
            const label = document.createElement("span");
            label.textContent = i;
            div.appendChild(label);
            div.addEventListener("click", async (e) => {
                if (deletionMode) {
                    cb.checked = !cb.checked;
                    div.classList.toggle("checked", cb.checked);
                } else {
                    currentPage = i;
                    isGridView = false;
                    deletionMode = false;
                    deleteModeBtn.classList.remove("on");
                    gridToggleBtn.classList.remove("on");
                    gridView.classList.add("hidden");
                    document.getElementById("canvas-wrapper").classList.remove("hidden");
                    document.getElementById("page-nav").classList.remove("hidden");
                    await renderPage();
                    await generateThumbnails();
                }
            });
            gridView.appendChild(div);
        }
    } catch (e) {
        gridView.innerHTML = "<span style='color:var(--text-secondary);font-size:12px;'>Chyba načtení náhledů</span>";
    }
}

// Zoom
zoomInBtn.addEventListener("click", async () => { zoom = Math.min(3, zoom + 0.15); await renderPage(); });
zoomOutBtn.addEventListener("click", async () => { zoom = Math.max(0.25, zoom - 0.15); await renderPage(); });
fitPageBtn.addEventListener("click", async () => { zoom = 1.0; await renderPage(); });

pageJump.addEventListener("change", async () => {
    if (!pdfDocs[currentDocIndex]) return;
    const loadingTask = pdfjsLib.getDocument({ data: pdfDocs[currentDocIndex].originalBuffer.slice(0) });
    const pdf = await loadingTask.promise;
    const val = parseInt(pageJump.value, 10);
    if (val >= 1 && val <= pdf.numPages) { currentPage = val; await renderPage(); }
    else { pageJump.value = currentPage; showToast("Neplatné číslo stránky", "error"); }
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
    gridView.innerHTML = "";
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
    const loadingTask = pdfjsLib.getDocument({ data: pdfDocs[currentDocIndex].originalBuffer.slice(0) });
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
    const r = parseInt(color.slice(1,3),16)/255;
    const g = parseInt(color.slice(3,5),16)/255;
    const b = parseInt(color.slice(5,7),16)/255;
    page.drawText(txt, { x: 50, y: height - 50 - size, size, font: helv, color: PDFLib.rgb(r,g,b) });
    const bytes = await pdfDoc.save();
    current.originalBuffer = uint8ToArrayBuffer(bytes);
    await renderPage();
    showToast('Text "' + txt + '" přidán', "success");
});

deletePageBtn.addEventListener("click", async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const pdfDoc = current.doc;
    if (pdfDoc.getPageCount() <= 1) { showToast("Nelze smazat poslední stránku.", "error"); return; }
    pushUndo();
    pdfDoc.removePage(currentPage - 1);
    currentPage = Math.min(currentPage, pdfDoc.getPageCount());
    const bytes = await pdfDoc.save();
    current.originalBuffer = uint8ToArrayBuffer(bytes);
    updatePdfInfo();
    await renderPage();
    await generateThumbnails();
    showToast("Stránka smazána", "success");
});

rotatePageBtn.addEventListener("click", async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    pushUndo();
    const pdfDoc = current.doc;
    const page = pdfDoc.getPages()[currentPage - 1];
    const rot = page.getRotation().angle || 0;
    page.setRotation(PDFLib.degrees((rot + 90) % 360));
    const bytes = await pdfDoc.save();
    current.originalBuffer = uint8ToArrayBuffer(bytes);
    await renderPage();
    await generateThumbnails();
    showToast("Stránka otočena", "success");
});

savePdfBtn.addEventListener("click", async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const bytes = await current.doc.save();
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
    const checks = Array.from(mergeList.querySelectorAll("input:checked")).map(c => parseInt(c.dataset.index, 10));
    if (checks.length === 0) return showToast("Vyberte alespoň jedno PDF ke spojení.", "error");
    const newPdf = await PDFLib.PDFDocument.create();
    for (const idx of checks) {
        const src = pdfDocs[idx];
        if (!src) continue;
        const srcDoc = await PDFLib.PDFDocument.load(src.originalBuffer);
        const copied = await newPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        copied.forEach(p => newPdf.addPage(p));
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
    const loadingTask = pdfjsLib.getDocument({ data: current.originalBuffer.slice(0) });
    const pdf = await loadingTask.promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(it => it.str).join(" ") + "\n\n";
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
    if (files.length === 0) return showToast("Vyberte alespoň jeden obrázek.", "error");
    const pdfDoc = await PDFLib.PDFDocument.create();
    for (const file of files) {
        const bytes = await file.arrayBuffer();
        let img;
        if (file.type === "image/png") img = await pdfDoc.embedPng(bytes);
        else img = await pdfDoc.embedJpg(bytes);
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

splitPdfBtn.addEventListener("click", async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const pageCount = current.doc.getPageCount();
    if (pageCount < 2) { showToast("PDF musí mít alespoň 2 stránky.", "error"); return; }
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
        a.download = current.name.replace(/\.pdf$/i, "") + "-strana-" + (i + 1) + ".pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }
    showToast("Rozděleno na " + pageCount + " souborů", "success");
});

// === NEW FEATURES ===

// Add blank page
addBlankPageBtn.addEventListener("click", async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    pushUndo();
    const pdfDoc = current.doc;
    const newPage = pdfDoc.addPage([595.28, 841.89]); // A4
    pdfDoc.insertPage(currentPage, newPage);
    const bytes = await pdfDoc.save();
    current.originalBuffer = uint8ToArrayBuffer(bytes);
    currentPage = Math.min(currentPage + 1, pdfDoc.getPageCount());
    updatePdfInfo();
    await renderPage();
    await generateThumbnails();
    showToast("Prázdná stránka přidána", "success");
});

// Move page up
movePageUp.addEventListener("click", async () => {
    if (currentPage <= 1) { showToast("Stránka je již první.", "info"); return; }
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    pushUndo();
    const pdfDoc = current.doc;
    const idx = currentPage - 1;
    const indices = [...Array(pdfDoc.getPageCount()).keys()];
    [indices[idx-1], indices[idx]] = [indices[idx], indices[idx-1]];
    const newDoc = await PDFLib.PDFDocument.create();
    const copied = await newDoc.copyPages(pdfDoc, indices);
    copied.forEach(p => newDoc.addPage(p));
    current.doc = newDoc;
    const bytes = await newDoc.save();
    current.originalBuffer = uint8ToArrayBuffer(bytes);
    currentPage--;
    await renderPage();
    await generateThumbnails();
    showToast("Stránka přesunuta nahoru", "success");
});

// Move page down
movePageDown.addEventListener("click", async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const pageCount = current.doc.getPageCount();
    if (currentPage >= pageCount) { showToast("Stránka je již poslední.", "info"); return; }
    pushUndo();
    const pdfDoc = current.doc;
    const idx = currentPage - 1;
    const indices = [...Array(pageCount).keys()];
    [indices[idx], indices[idx+1]] = [indices[idx+1], indices[idx]];
    const newDoc = await PDFLib.PDFDocument.create();
    const copied = await newDoc.copyPages(pdfDoc, indices);
    copied.forEach(p => newDoc.addPage(p));
    current.doc = newDoc;
    const bytes = await newDoc.save();
    current.originalBuffer = uint8ToArrayBuffer(bytes);
    currentPage++;
    await renderPage();
    await generateThumbnails();
    showToast("Stránka přesunuta dolů", "success");
});

// Extract pages
function parsePageRange(rangeStr, maxPage) {
    const pages = new Set();
    const parts = rangeStr.split(",");
    for (const part of parts) {
        const t = part.trim();
        if (t.includes("-")) {
            const [s, e] = t.split("-").map(x => parseInt(x.trim(), 10));
            if (isNaN(s) || isNaN(e)) continue;
            for (let i = s; i <= e; i++) {
                if (i >= 1 && i <= maxPage) pages.add(i - 1);
            }
        } else {
            const p = parseInt(t, 10);
            if (p >= 1 && p <= maxPage) pages.add(p - 1);
        }
    }
    return [...pages].sort((a, b) => a - b);
}

extractPagesBtn.addEventListener("click", async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const rangeStr = extractRange.value.trim();
    if (!rangeStr) { showToast("Zadejte rozsah stránek.", "error"); return; }
    const pageCount = current.doc.getPageCount();
    const indices = parsePageRange(rangeStr, pageCount);
    if (indices.length === 0) { showToast("Neplatný rozsah stránek.", "error"); return; }
    const newPdf = await PDFLib.PDFDocument.create();
    const srcDoc = await PDFLib.PDFDocument.load(current.originalBuffer);
    const copied = await newPdf.copyPages(srcDoc, indices);
    copied.forEach(p => newPdf.addPage(p));
    const bytes = await newPdf.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = current.name.replace(/\.pdf$/i, "") + "-extract.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Extrahováno " + indices.length + " stránek", "success");
});

// Insert pages from another PDF
insertPageBtn.addEventListener("click", async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const files = Array.from(insertPdfInput.files || []);
    if (files.length === 0) { showToast("Vyberte PDF soubor k vložení.", "error"); return; }
    pushUndo();
    const file = files[0];
    const insertBuffer = await file.arrayBuffer();
    const insertDoc = await PDFLib.PDFDocument.load(insertBuffer);
    const position = insertPosition.value;
    const insertIndex = position === "before" ? currentPage - 1 : currentPage;
    const srcDoc = await PDFLib.PDFDocument.load(current.originalBuffer);
    const allIndices = [...Array(srcDoc.getPageCount()).keys()];
    const insertIndices = [...Array(insertDoc.getPageCount()).keys()];
    const newDoc2 = await PDFLib.PDFDocument.create();
    const pagesBefore = allIndices.slice(0, insertIndex);
    const pagesAfter = allIndices.slice(insertIndex);
    const copiedBefore = await newDoc2.copyPages(srcDoc, pagesBefore);
    copiedBefore.forEach(p => newDoc2.addPage(p));
    const copiedInsert = await newDoc2.copyPages(insertDoc, insertIndices);
    copiedInsert.forEach(p => newDoc2.addPage(p));
    const copiedAfter = await newDoc2.copyPages(srcDoc, pagesAfter);
    copiedAfter.forEach(p => newDoc2.addPage(p));
    current.doc = newDoc2;
    const bytes = await newDoc2.save();
    current.originalBuffer = uint8ToArrayBuffer(bytes);
    currentPage = insertIndex + 1;
    updatePdfInfo();
    await renderPage();
    await generateThumbnails();
    showToast("Stránky vloženy", "success");
});

// Multi-remove selected pages
deleteSelectedBtn.addEventListener("click", async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const checks = gridView.querySelectorAll(".grid-check:checked");
    const indices = Array.from(checks).map(cb => parseInt(cb.dataset.pageIndex, 10));
    if (indices.length === 0) { showToast("Vyberte stránky k odstranění.", "error"); return; }
    const pdfDoc = current.doc;
    if (pdfDoc.getPageCount() - indices.length < 1) { showToast("Nelze smazat všechny stránky.", "error"); return; }
    pushUndo();
    indices.sort((a, b) => b - a);
    for (const idx of indices) pdfDoc.removePage(idx);
    currentPage = Math.min(currentPage, pdfDoc.getPageCount());
    const bytes = await pdfDoc.save();
    current.originalBuffer = uint8ToArrayBuffer(bytes);
    updatePdfInfo();
    await renderPage();
    await generateThumbnails();
    showToast("Odstraněno " + indices.length + " stránek", "success");
});

// Deletion mode toggle
deleteModeBtn.addEventListener("click", () => {
    if (!isGridView) { showToast("Přepněte nejdříve do zobrazení mřížky.", "info"); return; }
    deletionMode = !deletionMode;
    deleteModeBtn.classList.toggle("on", deletionMode);
    gridView.querySelectorAll(".grid-page").forEach(div => {
        div.classList.toggle("checked", div.querySelector(".grid-check").checked);
    });
});

// Grid view toggle
gridToggleBtn.addEventListener("click", async () => {
    isGridView = !isGridView;
    const wrapper = document.getElementById("canvas-wrapper");
    const pageNav = document.getElementById("page-nav");
    if (isGridView) {
        gridToggleBtn.classList.add("on");
        wrapper.classList.add("hidden");
        pageNav.classList.add("hidden");
        gridView.classList.remove("hidden");
        await generateThumbnails();
    } else {
        if (deletionMode) {
            deletionMode = false;
            deleteModeBtn.classList.remove("on");
        }
        gridToggleBtn.classList.remove("on");
        wrapper.classList.remove("hidden");
        pageNav.classList.remove("hidden");
        gridView.classList.add("hidden");
        await renderPage();
    }
});

// Init
updateUndoButtons();

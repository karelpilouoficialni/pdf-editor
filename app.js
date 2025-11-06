// Inicializace PDF.js (bezpečně: ověříme, že pdfjsLib existuje)
if (window.pdfjsLib) {
    // use a matching worker from the same CDN/version
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
} else {
    console.error('pdfjsLib není dostupný. Zkontrolujte, že pdf.js byl načten.');
}

let pdfDocs = [];
let currentDocIndex = 0;
let currentPage = 1;
let modifiedPdf = null;

// Elementy DOM
const fileInput = document.getElementById('file-input');
const loadFilesBtn = document.getElementById('load-files-btn');
const resetBtn = document.getElementById('reset-btn');
const fileList = document.getElementById('file-list');
const pdfCanvas = document.getElementById('pdf-canvas');
const pageInfo = document.getElementById('page-info');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const textInput = document.getElementById('text-input');
const fontSizeInput = document.getElementById('font-size');
const addTextBtn = document.getElementById('add-text-btn');
const deletePageBtn = document.getElementById('delete-page-btn');
const rotatePageBtn = document.getElementById('rotate-page-btn');
const savePdfBtn = document.getElementById('save-pdf-btn');
const mergeList = document.getElementById('merge-list');
const mergeBtn = document.getElementById('merge-btn');
const exportTxtBtn = document.getElementById('export-txt-btn');
const imageInput = document.getElementById('image-input');
const convertImagesBtn = document.getElementById('convert-images-btn');

// helper: convert Uint8Array to exact ArrayBuffer
function uint8ToArrayBuffer(uint8) {
    return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
}

// Load files only when the user confirms by clicking the new button
loadFilesBtn.addEventListener('click', async (e) => {
    const files = Array.from(fileInput.files || []);
    if (files.length === 0) {
        alert('Nevybrali jste žádné soubory.');
        return;
    }
    for (const file of files) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            pdfDocs.push({ name: file.name, doc: pdfDoc, originalBuffer: arrayBuffer });
        } catch (error) {
            console.error('Chyba při načítání souboru:', file.name, error);
            alert(`Chyba při načítání ${file.name}: ${error.message}`);
        }
    }
    updateFileList();
    updateMergeList();
    if (pdfDocs.length > 0) {
        currentDocIndex = 0;
        currentPage = 1;
        await renderPage();
    }
});

// Small safe stubs if your other functions are not yet implemented
function updateFileList() {
    // jednoduchý seznam názvů souborů -- rozšiřte podle potřeby
    fileList.innerHTML = '';
    pdfDocs.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.textContent = `${i + 1}. ${p.name}`;
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => {
            currentDocIndex = i;
            currentPage = 1;
            renderPage();
        });
        fileList.appendChild(div);
    });
}

function updateMergeList() {
    mergeList.innerHTML = '';
    pdfDocs.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'merge-item';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.dataset.index = i;
        div.appendChild(chk);
        const label = document.createElement('span');
        label.textContent = p.name;
        div.appendChild(label);
        mergeList.appendChild(div);
    });
}

async function renderPage() {
    // Pokud chybí pdf.js, ukončíme
    if (!window.pdfjsLib) {
        console.error('pdfjsLib není dostupný pro vykreslení náhledu.');
        return;
    }
    if (!pdfDocs[currentDocIndex]) return;
    const arrayBuffer = pdfDocs[currentDocIndex].originalBuffer;
    // load via pdf.js to render on canvas
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    // clamp currentPage
    if (currentPage < 1) currentPage = 1;
    if (currentPage > pdf.numPages) currentPage = pdf.numPages;
    const page = await pdf.getPage(currentPage);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = pdfCanvas;
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport }).promise;
    pageInfo.textContent = `Stránka ${currentPage} z ${pdf.numPages}`;
}

// Přidejte další event handlery (prev/next/reset apod.) dle potřeby
resetBtn.addEventListener('click', () => {
    pdfDocs = [];
    currentDocIndex = 0;
    currentPage = 1;
    fileList.innerHTML = '';
    mergeList.innerHTML = '';
    const ctx = pdfCanvas.getContext('2d');
    ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
    pageInfo.textContent = 'Stránka 0 z 0';
});

// navigation
prevPageBtn.addEventListener('click', async () => {
    if (!pdfDocs[currentDocIndex]) return;
    currentPage = Math.max(1, currentPage - 1);
    await renderPage();
});
nextPageBtn.addEventListener('click', async () => {
    if (!pdfDocs[currentDocIndex]) return;
    // determine numPages via pdf.js quickly
    const loadingTask = pdfjsLib.getDocument({ data: pdfDocs[currentDocIndex].originalBuffer });
    const pdf = await loadingTask.promise;
    currentPage = Math.min(pdf.numPages, currentPage + 1);
    await renderPage();
});

// add text
addTextBtn.addEventListener('click', async () => {
    const txt = textInput.value.trim();
    const size = parseInt(fontSizeInput.value, 10) || 12;
    if (!txt) return alert('Zadejte text.');
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const pdfDoc = current.doc;
    const pageIndex = currentPage - 1;
    const page = pdfDoc.getPages()[pageIndex];
    const helv = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    const { width, height } = page.getSize();
    page.drawText(txt, {
        x: 50,
        y: height - 50 - size,
        size,
        font: helv,
        color: PDFLib.rgb(0, 0, 0)
    });
    // persist changes to buffer and re-render
    const bytes = await pdfDoc.save();
    current.originalBuffer = uint8ToArrayBuffer(bytes);
    await renderPage();
});

// delete page
deletePageBtn.addEventListener('click', async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const pdfDoc = current.doc;
    const pageCount = pdfDoc.getPageCount();
    if (pageCount <= 1) {
        alert('Nelze smazat poslední stránku.');
        return;
    }
    const pageIndex = currentPage - 1;
    pdfDoc.removePage(pageIndex);
    // adjust currentPage
    currentPage = Math.min(currentPage, pdfDoc.getPageCount());
    const bytes = await pdfDoc.save();
    current.originalBuffer = uint8ToArrayBuffer(bytes);
    await renderPage();
});

// rotate page (90 deg cw)
rotatePageBtn.addEventListener('click', async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const pdfDoc = current.doc;
    const pageIndex = currentPage - 1;
    const page = pdfDoc.getPages()[pageIndex];
    const currentRotation = page.getRotation().angle || 0;
    page.setRotation(PDFLib.degrees((currentRotation + 90) % 360));
    const bytes = await pdfDoc.save();
    current.originalBuffer = uint8ToArrayBuffer(bytes);
    await renderPage();
});

// save current PDF
savePdfBtn.addEventListener('click', async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const pdfDoc = current.doc;
    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = current.name.replace(/\.pdf$/i, '') + '-edited.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

// merge selected PDFs
mergeBtn.addEventListener('click', async () => {
    const checks = Array.from(mergeList.querySelectorAll('input[type=checkbox]:checked')).map(c => parseInt(c.dataset.index, 10));
    if (checks.length === 0) return alert('Vyberte alespoň jedno PDF ke spojení.');
    const newPdf = await PDFLib.PDFDocument.create();
    for (const idx of checks) {
        const src = pdfDocs[idx];
        if (!src) continue;
        // ensure we use the latest buffer (in case of modifications)
        const srcDoc = await PDFLib.PDFDocument.load(src.originalBuffer);
        const copied = await newPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        copied.forEach(p => newPdf.addPage(p));
    }
    const bytes = await newPdf.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'merged.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

// export current PDF as TXT (simple text extraction using pdf.js)
exportTxtBtn.addEventListener('click', async () => {
    const current = pdfDocs[currentDocIndex];
    if (!current) return;
    const loadingTask = pdfjsLib.getDocument({ data: current.originalBuffer });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(it => it.str);
        fullText += strings.join(' ') + '\n\n';
    }
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = current.name.replace(/\.pdf$/i, '') + '.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});

// convert images to PDF
convertImagesBtn.addEventListener('click', async () => {
    const files = Array.from(imageInput.files || []);
    if (files.length === 0) return alert('Vyberte alespoň jeden obrázek.');
    const pdfDoc = await PDFLib.PDFDocument.create();
    for (const file of files) {
        const bytes = await file.arrayBuffer();
        let img;
        if (file.type === 'image/png') {
            img = await pdfDoc.embedPng(bytes);
        } else {
            // cover jpg/jpeg and others treat as jpg
            img = await pdfDoc.embedJpg(bytes);
        }
        const { width, height } = img.scale(1);
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(img, { x: 0, y: 0, width, height });
    }
    const out = await pdfDoc.save();
    const blob = new Blob([out], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'images.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Your existing Supabase project
const SUPABASE_URL = "https://djomfbnendcersxkleed.supabase.co";
const SUPABASE_KEY = "sb_publishable_AuPLymV92mLhOkJz81i9dw_w_tiAqYl";
const BUCKET = "documents";

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

let currentUser = null;
let allFiles = [];
let currentView = "home";
let searchTerm = "";
let authMode = "login";
let busy = false;
let loadedUserId = null;
let openProfileAfterLogin = false;

const categories = ["pdfs", "images", "documents", "spreadsheets", "other"];

function showMessage(text, error = false) {
  $("message").textContent = text;
  $("message").style.color = error ? "#dc2626" : "#15803d";
}

function showAuthMessage(text, error = false) {
  $("authMessage").textContent = text;
  $("authMessage").style.color = error ? "#dc2626" : "#15803d";
}

function showProfileMessage(text, error = false) {
  $("profileMessage").textContent = text;
  $("profileMessage").style.color = error ? "#dc2626" : "#15803d";
}

function openProfileDialog(passwordNote = "") {
  showProfileMessage("");
  $("passwordMessage").textContent = passwordNote;
  $("passwordMessage").style.color = "#15803d";
  $("profileDialog").showModal();
}

function setBusy(value) {
  busy = value;
  $("authSubmit").disabled = value;
  $("authSubmit").textContent = value
    ? "Please wait..."
    : authMode === "login" ? "Sign in" : "Create account";
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";

  $("loginTab").classList.toggle("active", !registering);
  $("registerTab").classList.toggle("active", registering);
  $("confirmPasswordGroup").hidden = !registering;
  $("confirmPassword").required = registering;
  $("password").autocomplete = registering ? "new-password" : "current-password";
  $("resetBtn").hidden = registering;
  $("authSubmit").textContent = registering ? "Create account" : "Sign in";
  showAuthMessage("");
}

function categoryFor(file) {
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : "";

  if (ext === "pdf" || type === "application/pdf") return "pdfs";

  if (
    type.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic"].includes(ext)
  ) return "images";

  if (
    ["doc", "docx", "odt", "rtf"].includes(ext) ||
    type.includes("word") ||
    type.includes("wordprocessing")
  ) return "documents";

  if (
    ["xls", "xlsx", "csv", "ods"].includes(ext) ||
    type.includes("spreadsheet") ||
    type.includes("excel")
  ) return "spreadsheets";

  return "other";
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function setSignedInView(signedIn) {
  $("authScreen").hidden = signedIn;
  $("appScreen").hidden = !signedIn;
}

async function loadDocuments() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("documents")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("uploaded_at", { ascending: false });

  if (error) {
    showMessage(`Could not load documents: ${error.message}`, true);
    return;
  }

  allFiles = data || [];
  updateCounts();
  renderDocuments();
}

function updateCounts() {
  const active = allFiles.filter((f) => !f.deleted);
  const trash = allFiles.filter((f) => f.deleted);

  const counts = {
    home: active.length,
    all: active.length,
    pdfs: active.filter((f) => f.category === "pdfs").length,
    images: active.filter((f) => f.category === "images").length,
    documents: active.filter((f) => f.category === "documents").length,
    spreadsheets: active.filter((f) => f.category === "spreadsheets").length,
    other: active.filter((f) => f.category === "other").length,
    trash: trash.length
  };

  for (const [view, count] of Object.entries(counts)) {
    const sidebar = $(`count-${view}`);
    if (sidebar) sidebar.textContent = count;
  }

  $("center-count-all").textContent = active.length;
  $("center-count-pdfs").textContent = counts.pdfs;
  $("center-count-images").textContent = counts.images;
  $("center-count-trash").textContent = trash.length;
}

function renderDocuments() {
  const tbody = $("documentList");
  tbody.replaceChildren();

  let files = allFiles.filter((f) =>
    (f.name || "").toLowerCase().includes(searchTerm)
  );

  if (currentView === "trash") {
    files = files.filter((f) => f.deleted);
  } else {
    files = files.filter((f) => !f.deleted);
    if (categories.includes(currentView)) {
      files = files.filter((f) => f.category === currentView);
    }
    if (currentView === "home") files = files.slice(0, 8);
  }

  $("emptyState").hidden = files.length !== 0;
  $("emptyState").textContent = searchTerm
    ? "No matching documents found."
    : currentView === "trash"
      ? "Your trash is empty."
      : "No documents here yet.";

  for (const file of files) {
    const tr = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = file.name;

    const categoryCell = document.createElement("td");
    categoryCell.textContent = file.category;

    const sizeCell = document.createElement("td");
    sizeCell.textContent = formatSize(Number(file.size) || 0);

    const dateCell = document.createElement("td");
    dateCell.textContent = formatDate(file.uploaded_at);

    const actionsCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "actions";

    if (file.deleted) {
      addAction(actions, "Restore", () => restoreFile(file));
      addAction(actions, "Delete permanently", () => permanentlyDelete(file));
    } else {
      addAction(actions, "Preview", () => previewFile(file));
      addAction(actions, "Download", () => downloadFile(file));

      const fileExt = (file.name.split(".").pop() || "").toLowerCase();
      if (file.category === "images") {
        addAction(actions, "To PDF", () => convertFile(file, "image-pdf"));
      } else if (fileExt === "pdf") {
        addAction(actions, "To Word", () => convertFile(file, "pdf-word"));
      } else if (fileExt === "docx") {
        addAction(actions, "To PDF", () => convertFile(file, "word-pdf"));
      }

      addAction(actions, "Rename", () => renameFile(file));
      addAction(actions, "Trash", () => moveToTrash(file));
    }

    actionsCell.append(actions);
    tr.append(nameCell, categoryCell, sizeCell, dateCell, actionsCell);
    tbody.append(tr);
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === currentView);
  });

  const titles = {
    home: "Home",
    all: "All documents",
    pdfs: "PDF files",
    images: "Images",
    documents: "Word documents",
    spreadsheets: "Excel files",
    other: "Other files",
    trash: "Trash"
  };

  $("pageTitle").textContent = titles[currentView] || "My Documents";
  $("listTitle").textContent =
    currentView === "home" ? "Recent documents" : titles[currentView];

  $("homeDashboard").hidden = currentView !== "home";
}

function addAction(container, label, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", callback);
  container.append(button);
}

function setView(view) {
  currentView = view;
  renderDocuments();
}

async function getSignedUrl(path) {
  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, 120);

  if (error) throw error;
  return data.signedUrl;
}

async function downloadFile(file) {
  try {
    const url = await getSignedUrl(file.storage_path);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  } catch (error) {
    showMessage(`Download failed: ${error.message}`, true);
  }
}

async function previewFile(file) {
  const ext = file.name.toLowerCase().split(".").pop();
  const isImage = file.category === "images";
  const isPdf = ext === "pdf";
  const isDocx = ext === "docx";

  if (!isImage && !isPdf && !isDocx) {
    showMessage("Preview is available for PDF, Word (.docx) and image files. Use Download for other file types.", true);
    return;
  }

  try {
    const url = await getSignedUrl(file.storage_path);
    const content = $("previewContent");
    content.replaceChildren();
    $("previewTitle").textContent = file.name;

    if (isImage) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = file.name;
      content.append(img);
    } else if (isDocx) {
      showMessage(`Opening preview of ${file.name}...`);
      await loadScript(LIBS.mammoth);

      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not read the file from storage.");
      const { value } = await window.mammoth.convertToHtml({
        arrayBuffer: await response.arrayBuffer()
      });

      // Sandboxed frame: the document text can never run scripts on this site.
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "");
      frame.title = file.name;
      frame.srcdoc =
        `<!doctype html><meta charset="utf-8"><style>
          html{background:#fff}
          body{font-family:"Segoe UI",Arial,sans-serif;line-height:1.6;color:#222;
               max-width:800px;margin:0 auto;padding:24px;text-align:left}
          img{max-width:100%}
          table{border-collapse:collapse;margin:12px 0}
          td,th{border:1px solid #ccc;padding:6px 10px}
        </style>${value || "<p>This document has no readable content.</p>"}`;
      content.append(frame);
      showMessage("");
    } else {
      const frame = document.createElement("iframe");
      frame.src = url;
      frame.title = file.name;
      content.append(frame);
    }

    $("previewDialog").showModal();
  } catch (error) {
    showMessage(`Preview failed: ${error.message}`, true);
  }
}

async function uploadFiles(fileList) {
  if (!currentUser || busy) return;

  const files = Array.from(fileList || []);
  if (!files.length) return;

  busy = true;
  $("progressBar").hidden = false;
  $("progressBar").value = 0;

  let completed = 0;

  try {
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        showMessage(`${file.name} exceeds the 25 MB limit and was skipped.`, true);
        completed++;
        $("progressBar").value = (completed / files.length) * 100;
        continue;
      }

      // First folder must equal the authenticated user's ID.
      const safeName = file.name.replace(/[\\/]/g, "_");
      const path = `${currentUser.id}/files/${crypto.randomUUID()}-${safeName}`;

      const { error: storageError } = await db.storage
        .from(BUCKET)
        .upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream"
        });

      if (storageError) {
        showMessage(`Upload failed for ${file.name}: ${storageError.message}`, true);
        completed++;
        $("progressBar").value = (completed / files.length) * 100;
        continue;
      }

      const { error: recordError } = await db.from("documents").insert({
        user_id: currentUser.id,
        name: file.name,
        type: file.type || "",
        category: categoryFor(file),
        size: file.size,
        storage_path: path,
        deleted: false
      });

      if (recordError) {
        // Avoid leaving an unlisted file in storage.
        await db.storage.from(BUCKET).remove([path]);
        showMessage(`Could not save file details for ${file.name}: ${recordError.message}`, true);
      } else {
        showMessage(`Uploaded ${file.name}`);
      }

      completed++;
      $("progressBar").value = (completed / files.length) * 100;
    }
  } finally {
    busy = false;
    $("fileInput").value = "";
    $("dropFileInput").value = "";
    await loadDocuments();
  }
}

// ===== File conversion (runs in your browser) =====
const LIBS = {
  pdfLib: "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  mammoth: "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js",
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
  pdfjsWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
  docx: "https://cdn.jsdelivr.net/npm/docx@7.8.2/build/index.js",
  jszip: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  docxPreview: "https://cdn.jsdelivr.net/npm/docx-preview@0.3.3/dist/docx-preview.min.js",
  html2canvas: "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"
};

// Two of these libraries use the same global name ("docx"), so each one is
// saved into its own variable right after it loads.
let docxWriterLib = null;
let docxPreviewLib = null;

async function getDocxWriter() {
  if (!docxWriterLib) {
    await loadScript(LIBS.docx);
    docxWriterLib = window.docx;
  }
  return docxWriterLib;
}

async function getDocxPreview() {
  if (!docxPreviewLib) {
    await loadScript(LIBS.jszip);
    await loadScript(LIBS.docxPreview);
    docxPreviewLib = window.docx;
  }
  return docxPreviewLib;
}

const loadedScripts = new Map();

function loadScript(url) {
  if (!loadedScripts.has(url)) {
    loadedScripts.set(url, new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = resolve;
      script.onerror = () => {
        loadedScripts.delete(url);
        reject(new Error("Could not load the converter. Check your internet connection."));
      };
      document.head.append(script);
    }));
  }
  return loadedScripts.get(url);
}

async function imageViaCanvas(buffer, type) {
  const bitmap = await createImageBitmap(new Blob([buffer], { type }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);

  const asJpeg = type === "image/jpeg";
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, asJpeg ? "image/jpeg" : "image/png", 0.92)
  );
  return { bytes: new Uint8Array(await blob.arrayBuffer()), jpeg: asJpeg };
}

async function imageToPdf(buffer, file) {
  await loadScript(LIBS.pdfLib);
  const { PDFDocument } = window.PDFLib;

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  const isJpeg = type === "image/jpeg" || ext === "jpg" || ext === "jpeg";
  const isPng = type === "image/png" || ext === "png";

  const pdf = await PDFDocument.create();
  let image;

  try {
    // The canvas path also applies phone-photo rotation and handles WebP, GIF, BMP.
    const converted = await imageViaCanvas(buffer, isJpeg ? "image/jpeg" : (type || "image/png"));
    image = converted.jpeg ? await pdf.embedJpg(converted.bytes) : await pdf.embedPng(converted.bytes);
  } catch {
    if (isJpeg) image = await pdf.embedJpg(buffer);
    else if (isPng) image = await pdf.embedPng(buffer);
    else throw new Error("This image format cannot be converted. Please use JPG or PNG.");
  }

  const a4 = [595.28, 841.89];
  const landscape = image.width > image.height;
  const [pageWidth, pageHeight] = landscape ? [a4[1], a4[0]] : a4;
  const margin = 24;
  const scale = Math.min(
    (pageWidth - margin * 2) / image.width,
    (pageHeight - margin * 2) / image.height,
    1
  );
  const width = image.width * scale;
  const height = image.height * scale;

  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(image, {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height
  });

  return { blob: new Blob([await pdf.save()], { type: "application/pdf" }), note: "" };
}

function cleanForPdf(text, stats) {
  const mapped = text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();

  return mapped.replace(/[^\x20-\x7E\xA0-\xFF\u2022]/g, () => {
    stats.replaced++;
    return "?";
  });
}

// Word right-aligned tab stops (for example a date at the right edge of a line)
// are not drawn by the page renderer, so they are re-applied here.
async function applyRightTabStops(buffer, host) {
  try {
    const zip = await window.JSZip.loadAsync(buffer);
    const entry = zip.file("word/document.xml");
    if (!entry) return;

    const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const xml = new DOMParser().parseFromString(await entry.async("string"), "application/xml");
    const normalize = (text) => text.replace(/\s+/g, " ").trim();
    const rightStops = new Map();

    for (const p of xml.getElementsByTagNameNS(W, "p")) {
      const pPr = [...p.children].find((c) => c.localName === "pPr");
      const tabs = pPr && [...pPr.children].find((c) => c.localName === "tabs");
      if (!tabs) continue;

      const right = [...tabs.children].find((t) => {
        const kind = t.getAttributeNS(W, "val");
        return t.localName === "tab" && (kind === "right" || kind === "end");
      });
      if (!right) continue;

      let text = "";
      for (const node of p.getElementsByTagName("*")) {
        if (node.localName === "t") text += node.textContent;
        if (node.localName === "tab" && node.parentNode.localName === "r") text += " ";
      }
      rightStops.set(normalize(text), Number(right.getAttributeNS(W, "pos")));
    }
    if (!rightStops.size) return;

    for (const section of host.querySelectorAll("section.docx")) {
      const sectionBox = section.getBoundingClientRect();
      const contentLeft = sectionBox.left + (parseFloat(getComputedStyle(section).paddingLeft) || 0);

      for (const paragraph of section.querySelectorAll("p")) {
        const tabsInParagraph = paragraph.querySelectorAll(".docx-tab-stop");
        if (tabsInParagraph.length !== 1) continue;

        const position = rightStops.get(normalize(paragraph.textContent));
        if (!position) continue;

        const tab = tabsInParagraph[0];
        const range = document.createRange();
        range.setStartAfter(tab);
        range.setEndAfter(paragraph.lastChild);
        const trailing = range.getBoundingClientRect().width;

        const targetRight = contentLeft + position / 15;       // twips -> CSS pixels
        const needed = targetRight - tab.getBoundingClientRect().left - trailing;
        if (needed > 0) {
          tab.style.display = "inline-block";
          tab.style.width = `${needed}px`;
        }
      }
    }
  } catch {
    // Never block a conversion because of tab-stop adjustments.
  }
}

async function wordToPdf(buffer) {
  const [preview] = await Promise.all([
    getDocxPreview(),
    loadScript(LIBS.html2canvas),
    loadScript(LIBS.pdfLib)
  ]);
  const { PDFDocument, StandardFonts } = window.PDFLib;

  // The Word file is drawn by the browser (fonts, alignment, tables, images),
  // photographed page by page, and an invisible text layer is added on top so
  // the PDF stays searchable and readable by résumé scanners.
  const savedScroll = window.scrollY;
  window.scrollTo(0, 0);

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:#fff;color:#444;display:grid;" +
    "place-items:center;font:600 18px 'Segoe UI',Arial,sans-serif;";
  overlay.textContent = "Converting to PDF... please wait";

  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0;z-index:0;background:#fff;";
  document.body.append(host, overlay);

  try {
    await preview.renderAsync(buffer, host, host, {
      inWrapper: false,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      experimental: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true
    });

    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all(
      [...host.querySelectorAll("img")].map((img) => (img.decode ? img.decode().catch(() => {}) : null))
    );
    await applyRightTabStops(buffer, host);

    const sections = [...host.querySelectorAll("section.docx")];
    if (!sections.length) throw new Error("This Word file could not be displayed.");

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const stats = { replaced: 0 };

    for (const section of sections) {
      const box = section.getBoundingClientRect();
      const pageHeightPx = Math.max(parseFloat(getComputedStyle(section).minHeight) || box.height, 100);
      const pageCount = box.height > pageHeightPx * 1.02
        ? Math.ceil(box.height / pageHeightPx - 0.02)
        : 1;

      const scale = Math.min(1.5, 15000 / Math.max(box.height, 1));
      const canvas = await window.html2canvas(section, {
        scale,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false
      });

      const widthPt = box.width * 0.75;
      const heightPt = pageHeightPx * 0.75;
      const pdfPages = [];

      for (let i = 0; i < pageCount; i++) {
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.round(pageHeightPx * scale);
        const ctx = slice.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, -Math.round(i * pageHeightPx * scale));

        const jpeg = await new Promise((resolve) => slice.toBlob(resolve, "image/jpeg", 0.85));
        const image = await pdf.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
        const pdfPage = pdf.addPage([widthPt, heightPt]);
        pdfPage.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt });
        pdfPages.push(pdfPage);
      }

      // Invisible text layer (Latin letters only) for search, copy and scanners.
      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parentTag = node.parentElement ? node.parentElement.tagName : "";
        if (parentTag === "STYLE" || parentTag === "SCRIPT" || !node.nodeValue.trim()) continue;

        const pattern = /\S+/g;
        let match;
        while ((match = pattern.exec(node.nodeValue))) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const rect = range.getClientRects()[0];
          if (!rect || rect.width <= 0 || rect.height <= 0) continue;

          const safe = cleanForPdf(match[0], stats).replace(/\?/g, "");
          if (!safe) continue;

          const pageIndex = Math.min(pageCount - 1, Math.max(0, Math.floor((rect.top - box.top) / pageHeightPx)));
          const size = Math.max(4, (rect.height * 0.75) / 1.2);
          const bottomInPage = rect.bottom - box.top - pageIndex * pageHeightPx;

          pdfPages[pageIndex].drawText(safe, {
            x: (rect.left - box.left) * 0.75,
            y: heightPt - bottomInPage * 0.75 + size * 0.2,
            size,
            font,
            opacity: 0
          });
        }
      }
    }

    return {
      blob: new Blob([await pdf.save()], { type: "application/pdf" }),
      note: stats.replaced
        ? "The pages look identical to the Word file; text in other languages is not searchable."
        : ""
    };
  } finally {
    host.remove();
    overlay.remove();
    window.scrollTo(0, savedScroll);
  }
}

async function pdfToWord(buffer) {
  const docxWriter = await getDocxWriter();
  await loadScript(LIBS.pdfjs);

  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfjsWorker;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

  const { Document, Packer, Paragraph, TextRun } = docxWriter;
  const paragraphs = [];
  let totalChars = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    const lines = [];
    let current = "";
    let lastY = null;

    for (const item of content.items) {
      if (typeof item.str !== "string") continue;
      const y = item.transform[5];

      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(current);
        current = "";
      }

      current += item.str;
      lastY = y;

      if (item.hasEOL) {
        lines.push(current);
        current = "";
        lastY = null;
      }
    }
    if (current) lines.push(current);

    const textLines = lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    totalChars += textLines.join("").length;

    textLines.forEach((text, index) => {
      paragraphs.push(new Paragraph({
        children: [new TextRun(text)],
        pageBreakBefore: pageNumber > 1 && index === 0,
        spacing: { after: 80 }
      }));
    });
  }

  if (!totalChars) {
    throw new Error("No selectable text found. This looks like a scanned PDF, which needs OCR (not supported).");
  }

  const doc = new Document({ sections: [{ children: paragraphs }] });
  return { blob: await Packer.toBlob(doc), note: "" };
}
// ===== End file conversion =====

let converting = false;

async function convertFile(file, kind) {
  if (busy || converting) return;
  converting = true;

  showMessage(`Converting ${file.name}... please wait.`);

  try {
    const url = await getSignedUrl(file.storage_path);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not read the file from storage.");
    const buffer = await response.arrayBuffer();

    const baseName = file.name.replace(/\.[^.]+$/, "") || "converted";
    let result;
    let newName;
    let mime;

    if (kind === "image-pdf") {
      result = await imageToPdf(buffer, file);
      newName = `${baseName}.pdf`;
      mime = "application/pdf";
    } else if (kind === "word-pdf") {
      result = await wordToPdf(buffer);
      newName = `${baseName}.pdf`;
      mime = "application/pdf";
    } else {
      result = await pdfToWord(buffer);
      newName = `${baseName}.docx`;
      mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    await uploadFiles([new File([result.blob], newName, { type: mime })]);
    showMessage(`Converted and saved as ${newName}. ${result.note}`.trim());
  } catch (error) {
    showMessage(`Conversion failed: ${error.message}`, true);
  } finally {
    converting = false;
  }
}

async function updateDeleted(file, deleted) {
  const { error } = await db.from("documents")
    .update({ deleted })
    .eq("id", file.id)
    .eq("user_id", currentUser.id);

  if (error) throw error;
  await loadDocuments();
}

async function renameFile(file) {
  const input = prompt("Enter a new name for this file:", file.name);
  if (input === null) return;

  let newName = input.trim().replace(/[\\/]/g, "_");

  if (!newName) {
    showMessage("File name cannot be empty.", true);
    return;
  }

  // Keep the original extension if the new name has none.
  const oldExt = file.name.includes(".") ? file.name.split(".").pop() : "";
  if (oldExt && !newName.includes(".")) newName += `.${oldExt}`;

  if (newName.length > 150) {
    showMessage("File name is too long (maximum 150 characters).", true);
    return;
  }
  if (newName === file.name) return;

  const { error } = await db.from("documents")
    .update({
      name: newName,
      category: categoryFor({ name: newName, type: file.type || "" })
    })
    .eq("id", file.id)
    .eq("user_id", currentUser.id);

  if (error) {
    showMessage(`Could not rename file: ${error.message}`, true);
    return;
  }

  showMessage(`Renamed to ${newName}`);
  await loadDocuments();
}

async function moveToTrash(file) {
  if (!confirm(`Move "${file.name}" to trash?`)) return;

  try {
    await updateDeleted(file, true);
    showMessage("File moved to trash.");
  } catch (error) {
    showMessage(`Could not move file to trash: ${error.message}`, true);
  }
}

async function restoreFile(file) {
  try {
    await updateDeleted(file, false);
    showMessage("File restored.");
  } catch (error) {
    showMessage(`Could not restore file: ${error.message}`, true);
  }
}

async function permanentlyDelete(file) {
  if (!confirm(`Permanently delete "${file.name}"? This cannot be undone.`)) return;

  try {
    const { error: storageError } = await db.storage
      .from(BUCKET)
      .remove([file.storage_path]);

    if (storageError) throw storageError;

    const { error: recordError } = await db.from("documents")
      .delete()
      .eq("id", file.id)
      .eq("user_id", currentUser.id);

    if (recordError) throw recordError;

    showMessage("File permanently deleted.");
    await loadDocuments();
  } catch (error) {
    showMessage(`Could not permanently delete file: ${error.message}`, true);
  }
}

async function loadProfile() {
  if (!currentUser) return;

  $("userEmail").textContent = currentUser.email || "";

  const { data, error } = await db.from("profiles")
    .select("display_name, avatar_path")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    showMessage(`Could not load profile: ${error.message}`, true);
    return;
  }

  $("displayName").value = data?.display_name || "";
  $("profileName").textContent = data?.display_name || "My profile";
  $("removePhotoBtn").hidden = !data?.avatar_path;

  if (data?.avatar_path) {
    try {
      const url = await getSignedUrl(data.avatar_path);
      $("avatar").src = url;
      $("avatar").hidden = false;
      $("avatarFallback").hidden = true;
    } catch {
      $("avatar").hidden = true;
      $("avatarFallback").hidden = false;
    }
  } else {
    $("avatar").hidden = true;
    $("avatarFallback").hidden = false;
  }
}

async function saveProfile() {
  if (!currentUser) return;

  const displayName = $("displayName").value.trim();
  const photo = $("avatarInput").files[0];
  let avatarPath = null;

  try {
    const { data: oldProfile, error: readError } = await db.from("profiles")
      .select("avatar_path")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (readError) throw readError;

    avatarPath = oldProfile?.avatar_path || null;

    if (photo) {
      if (!photo.type.startsWith("image/")) {
        throw new Error("Please choose an image file.");
      }
      if (photo.size > 5 * 1024 * 1024) {
        throw new Error("Profile photo must be 5 MB or smaller.");
      }

      const ext = photo.name.includes(".") ? photo.name.split(".").pop() : "jpg";
      const path = `${currentUser.id}/profile/avatar-${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await db.storage.from(BUCKET).upload(path, photo, {
        upsert: false,
        contentType: photo.type
      });

      if (uploadError) throw uploadError;
      avatarPath = path;
    }

    const { error: saveError } = await db.from("profiles").upsert({
      id: currentUser.id,
      display_name: displayName,
      avatar_path: avatarPath,
      updated_at: new Date().toISOString()
    });

    if (saveError) {
      if (photo && avatarPath) {
        await db.storage.from(BUCKET).remove([avatarPath]);
      }
      throw saveError;
    }

    if (photo && oldProfile?.avatar_path && oldProfile.avatar_path !== avatarPath) {
      await db.storage.from(BUCKET).remove([oldProfile.avatar_path]);
    }

    $("profileName").textContent = displayName || "My profile";
    $("avatarInput").value = "";
    await loadProfile();
    showProfileMessage("Profile saved.");
  } catch (error) {
    showProfileMessage(`Could not save profile: ${error.message}`, true);
  }
}

async function removePhoto() {
  if (!currentUser) return;
  if (!confirm("Remove your profile photo?")) return;

  try {
    const { data, error } = await db.from("profiles")
      .select("avatar_path")
      .eq("id", currentUser.id)
      .maybeSingle();
    if (error) throw error;

    const path = data?.avatar_path;
    if (!path) {
      showProfileMessage("You do not have a profile photo.");
      return;
    }

    const { error: updateError } = await db.from("profiles")
      .update({ avatar_path: null, updated_at: new Date().toISOString() })
      .eq("id", currentUser.id);
    if (updateError) throw updateError;

    await db.storage.from(BUCKET).remove([path]);

    $("avatarInput").value = "";
    await loadProfile();
    showProfileMessage("Profile photo removed.");
  } catch (error) {
    showProfileMessage(`Could not remove photo: ${error.message}`, true);
  }
}

async function enterApplication(user) {
  currentUser = user;
  setSignedInView(true);
  await Promise.all([loadDocuments(), loadProfile()]);

  if (openProfileAfterLogin) {
    openProfileAfterLogin = false;
    openProfileDialog("Enter a new password below to finish resetting it.");
  }
}

async function leaveApplication() {
  currentUser = null;
  allFiles = [];
  loadedUserId = null;
  setSignedInView(false);
  $("documentList").replaceChildren();
}

// Authentication
$("loginTab").addEventListener("click", () => setAuthMode("login"));
$("registerTab").addEventListener("click", () => setAuthMode("register"));

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;

  const email = $("email").value.trim();
  const password = $("password").value;

  if (authMode === "register" && password !== $("confirmPassword").value) {
    showAuthMessage("Passwords do not match.", true);
    return;
  }

  setBusy(true);
  showAuthMessage("");

  try {
    if (authMode === "register") {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) throw error;

      if (data.session) {
        showAuthMessage("Account created successfully.");
      } else {
        showAuthMessage("Account created. Check your email if confirmation is enabled, then sign in.");
      }
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      showAuthMessage("Signed in successfully.");
    }
  } catch (error) {
    showAuthMessage(error.message || "Authentication failed.", true);
  } finally {
    setBusy(false);
  }
});

$("resetBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();

  if (!email) {
    showAuthMessage("Enter your email address first.", true);
    $("email").focus();
    return;
  }

  try {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    showAuthMessage("If the email is registered, a password-reset link will be sent.");
  } catch (error) {
    showAuthMessage(error.message, true);
  }
});

$("logoutBtn").addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) showMessage(error.message, true);
});

db.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    if (loadedUserId && loadedUserId === session?.user?.id) {
      setTimeout(() => openProfileDialog("Enter a new password below to finish resetting it."), 0);
    } else {
      openProfileAfterLogin = true;
    }
  }

  // Keep auth callbacks quick; avoid Supabase calls inside this callback.
  if (event === "SIGNED_OUT" || !session?.user) {
    loadedUserId = null;
    currentUser = null;
    setSignedInView(false);
    return;
  }

  const user = session.user;
  if (loadedUserId !== user.id) {
    loadedUserId = user.id;
    setTimeout(() => enterApplication(user), 0);
  }
});

// Upload controls
$("fileInput").addEventListener("change", (event) => {
  uploadFiles(event.target.files);
});

$("dropFileInput").addEventListener("change", (event) => {
  uploadFiles(event.target.files);
});

const dropZone = $("dropZone");
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  uploadFiles(event.dataTransfer.files);
});

$("searchInput").addEventListener("input", (event) => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderDocuments();
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

$("refreshBtn").addEventListener("click", loadDocuments);
$("saveProfileBtn").addEventListener("click", saveProfile);
$("removePhotoBtn").addEventListener("click", removePhoto);

// Edit profile dialog
$("editProfileBtn").addEventListener("click", () => openProfileDialog());
$("closeProfileBtn").addEventListener("click", () => $("profileDialog").close());

$("passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const setMsg = (text, error = false) => {
    $("passwordMessage").textContent = text;
    $("passwordMessage").style.color = error ? "#dc2626" : "#15803d";
  };

  const newPassword = $("newPassword").value;

  if (newPassword.length < 6) {
    setMsg("Password must be at least 6 characters.", true);
    return;
  }
  if (newPassword !== $("confirmNewPassword").value) {
    setMsg("Passwords do not match.", true);
    return;
  }

  $("changePasswordBtn").disabled = true;
  try {
    const { error } = await db.auth.updateUser({ password: newPassword });
    if (error) throw error;

    $("passwordForm").reset();
    $("newPassword").type = "password";
    document.querySelector('[data-toggle-password="newPassword"]').textContent = "Show";
    setMsg("Password updated successfully.");
  } catch (error) {
    setMsg(error.message || "Could not update password.", true);
  } finally {
    $("changePasswordBtn").disabled = false;
  }
});

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = $(button.dataset.togglePassword);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Hide" : "Show";
  });
});

$("closePreviewBtn").addEventListener("click", () => {
  $("previewDialog").close();
  $("previewContent").replaceChildren();
});

// Dark mode preference
function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  $("themeBtn").setAttribute("aria-checked", String(isDark));
  $("themeLabel").textContent = isDark ? "Light mode" : "Dark mode";
}

try {
  applyTheme(localStorage.getItem("my-documents-dark") === "yes");
} catch {}

$("themeBtn").addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  try {
    localStorage.setItem("my-documents-dark", isDark ? "yes" : "no");
  } catch {}
});

// Restore existing session once.
const { data: initialSession, error: sessionError } = await db.auth.getSession();

if (sessionError) {
  showAuthMessage(`Could not check login: ${sessionError.message}`, true);
} else if (initialSession.session?.user) {
  loadedUserId = initialSession.session.user.id;
  await enterApplication(initialSession.session.user);
} else {
  setSignedInView(false);
}
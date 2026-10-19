
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

  if (!isImage && !isPdf) {
    showMessage("Preview is available for PDF and image files. Use Download for other file types.", true);
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
  docx: "https://cdn.jsdelivr.net/npm/docx@7.8.2/build/index.js"
};

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

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  let line = "";

  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      lines.push(line);
      line = "";
    }

    // A single very long word: split it by characters.
    let chunk = "";
    for (const ch of word) {
      if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    line = chunk;
  }

  if (line) lines.push(line);
  return lines;
}

async function wordToPdf(buffer) {
  await Promise.all([loadScript(LIBS.pdfLib), loadScript(LIBS.mammoth)]);
  const { PDFDocument, StandardFonts } = window.PDFLib;

  const { value: html } = await window.mammoth.convertToHtml({ arrayBuffer: buffer });
  const parsed = new DOMParser().parseFromString(html, "text/html");

  const stats = { replaced: 0 };
  const blocks = [];
  const add = (text, style) => {
    const cleaned = cleanForPdf(text, stats);
    if (cleaned) blocks.push({ text: cleaned, style });
  };

  for (const element of parsed.body.children) {
    const tag = element.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) {
      add(element.textContent, tag);
    } else if (tag === "ul" || tag === "ol") {
      [...element.querySelectorAll("li")].forEach((li, index) => {
        add(`${tag === "ol" ? `${index + 1}.` : "\u2022"} ${li.textContent}`, "li");
      });
    } else if (tag === "table") {
      for (const row of element.querySelectorAll("tr")) {
        add([...row.children].map((cell) => cell.textContent.trim()).join("  |  "), "p");
      }
    } else {
      add(element.textContent, "p");
    }
  }

  if (!blocks.length) throw new Error("No text was found in this Word file.");

  const styles = {
    h1: { size: 20, bold: true },
    h2: { size: 16, bold: true },
    h3: { size: 14, bold: true },
    h4: { size: 12, bold: true },
    h5: { size: 12, bold: true },
    h6: { size: 12, bold: true },
    p: { size: 11 },
    li: { size: 11, indent: 14 }
  };

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 54;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  for (const block of blocks) {
    const style = styles[block.style] || styles.p;
    const font = style.bold ? bold : regular;
    const indent = style.indent || 0;
    const lineHeight = style.size * 1.4;
    const lines = wrapText(block.text, font, style.size, pageWidth - margin * 2 - indent);

    if (style.bold) y -= 6;

    for (const line of lines) {
      if (y - lineHeight < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      y -= lineHeight;
      page.drawText(line, { x: margin + indent, y, size: style.size, font });
    }
    y -= 6;
  }

  return {
    blob: new Blob([await pdf.save()], { type: "application/pdf" }),
    note: stats.replaced
      ? "Some characters (for example non-English scripts) could not be converted."
      : ""
  };
}

async function pdfToWord(buffer) {
  await Promise.all([loadScript(LIBS.pdfjs), loadScript(LIBS.docx)]);

  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfjsWorker;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

  const { Document, Packer, Paragraph, TextRun } = window.docx;
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

async function convertFile(file, kind) {
  if (busy) return;

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
    showMessage(`Converted and saved as ${newName}. ${result.note}`.trim(), Boolean(result.note));
  } catch (error) {
    showMessage(`Conversion failed: ${error.message}`, true);
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

    $("profileName").textContent = displayName || "My profile";
    $("avatarInput").value = "";
    await loadProfile();
    showProfileMessage("Profile saved.");
  } catch (error) {
    showProfileMessage(`Could not save profile: ${error.message}`, true);
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
try {
  if (localStorage.getItem("my-documents-dark") === "yes") {
    document.body.classList.add("dark");
    $("themeBtn").textContent = "☀️ Light mode";
  }
} catch {}

$("themeBtn").addEventListener("click", () => {
  const isDark = document.body.classList.toggle("dark");
  $("themeBtn").textContent = isDark ? "☀️ Light mode" : "🌙 Dark mode";
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

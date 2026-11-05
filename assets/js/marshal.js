/**
 * RATING GIAT - LOGIKA DASHBOARD MARSHAL (ADMIN)
 */

let marshalPassword = sessionStorage.getItem("marshal_token") || "";
let currentDashboardData = null;
let latestAiSummary = "";

document.addEventListener("DOMContentLoaded", () => {
  initMarshal();
});

function initMarshal() {
  const splashScreen = document.getElementById("splash-screen");

  // Animasi Splash Screen selama tepat 4 detik (4000 ms)
  setTimeout(() => {
    if (splashScreen) splashScreen.classList.add("fade-out");

    if (!marshalPassword) {
      showLoginModal();
    } else {
      loadDashboardData();
    }
  }, 4000);

  setupEventListeners();
}

/**
 * Autentikasi Modal
 */
function showLoginModal() {
  document.getElementById("modal-login").classList.remove("hidden");
  document.getElementById("input-login-password").focus();
}

function handleLoginSubmit() {
  const pwdInput = document.getElementById("input-login-password");
  const pwd = pwdInput.value.trim();
  const errorText = document.getElementById("login-error");
  const btn = document.getElementById("btn-login-submit");

  if (!pwd) {
    errorText.innerText = "Password tidak boleh kosong!";
    errorText.classList.remove("hidden");
    showToast("Password tidak boleh kosong!", "warning", "Perhatian");
    return;
  }

  // Tampilkan indikator proses
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="inline-block animate-spin mr-2">🔄</span> Memeriksa...`;
  }
  showLoader("Memverifikasi kata sandi Marshal...");

  // Verifikasi ke GAS
  fetch(`${CONFIG.GAS_WEB_APP_URL}?action=checkLogin&password=${encodeURIComponent(pwd)}`)
    .then(res => res.json())
    .then(data => {
      hideLoader();
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>Masuk ke Panel</span><span>➔</span>`;
      }

      if (data.authenticated) {
        marshalPassword = pwd;
        sessionStorage.setItem("marshal_token", pwd);
        document.getElementById("modal-login").classList.add("hidden");
        errorText.classList.add("hidden");
        showToast("Login berhasil! Menyiapkan panel kendali...", "success", "Selamat Datang");
        loadDashboardData();
      } else {
        errorText.innerText = "Password salah! Silakan coba lagi.";
        errorText.classList.remove("hidden");
        showToast("Kata sandi yang Anda masukkan salah.", "error", "Akses Ditolak");
      }
    })
    .catch(err => {
      console.error(err);
      hideLoader();
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>Masuk ke Panel</span><span>➔</span>`;
      }
      errorText.innerText = "Gagal terhubung ke Google Apps Script.";
      errorText.classList.remove("hidden");
      showToast("Gagal terhubung ke server. Periksa koneksi internet.", "error", "Koneksi Bermasalah");
    });
}

/**
 * Muat Data Dashboard
 */
async function loadDashboardData() {
  try {
    const res = await fetch(`${CONFIG.GAS_WEB_APP_URL}?action=getMarshalData&password=${encodeURIComponent(marshalPassword)}`);
    const data = await res.json();

    if (data.status === "error") {
      showToast(data.message, "error", "Sesi Berakhir");
      sessionStorage.removeItem("marshal_token");
      setTimeout(() => location.reload(), 1500);
      return;
    }

    currentDashboardData = data;

    if (data.status === "ACTIVE") {
      renderActiveDashboard(data);
    } else {
      renderStandbyDashboard();
    }
  } catch (err) {
    console.error("Gagal memuat dashboard:", err);
  }
}

/**
 * Tampilan Dashboard saat STANDBY (Belum ada kegiatan aktif)
 */
function renderStandbyDashboard() {
  document.getElementById("dashboard-active").classList.add("hidden");
  document.getElementById("dashboard-standby").classList.remove("hidden");
  document.getElementById("badge-status-kegiatan").innerText = "STATUS: STANDBY";
  document.getElementById("badge-status-kegiatan").className = "px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full";
}

/**
 * Tampilan Dashboard saat ADA KEGIATAN AKTIF
 */
function renderActiveDashboard(data) {
  document.getElementById("dashboard-standby").classList.add("hidden");
  document.getElementById("dashboard-active").classList.remove("hidden");

  const event = data.event;
  const metrics = data.metrics;

  document.getElementById("badge-status-kegiatan").innerText = "STATUS: AKTIF BERJALAN";
  document.getElementById("badge-status-kegiatan").className = "px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full animate-pulse";

  // Data Kegiatan
  document.getElementById("dash-event-title").innerText = event.nama_kegiatan;
  document.getElementById("dash-event-meta").innerText = `📅 ${event.tanggal}  •  📍 ${event.tempat}`;

  // Live Counter
  document.getElementById("metric-total-responden").innerText = metrics.total_responden;

  // Bintang Besar Kegiatan
  renderStarRatingDisplay("dash-stars-kegiatan", metrics.avg_bintang_kegiatan);
  document.getElementById("dash-score-kegiatan").innerText = `${metrics.avg_bintang_kegiatan} / 5.00`;

  // Bintang Besar Tempat (Jika aktif)
  const placeBox = document.getElementById("box-metric-tempat");
  if (metrics.is_lokasi_active) {
    placeBox.classList.remove("hidden");
    renderStarRatingDisplay("dash-stars-tempat", metrics.avg_bintang_tempat);
    document.getElementById("dash-score-tempat").innerText = `${metrics.avg_bintang_tempat} / 5.00`;
  } else {
    placeBox.classList.add("hidden");
  }

  // Tabel Respon Terbaru
  renderResponsesTable(data.responses);

  // Setup Link QR Code
  setupQrCode(event);
}

/**
 * Render Tabel Responden
 */
function renderResponsesTable(responses) {
  const tbody = document.getElementById("table-responses-body");
  tbody.innerHTML = "";

  if (!responses || responses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">Belum ada respon yang masuk.</td></tr>`;
    return;
  }

  responses.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-100 hover:bg-slate-50 transition text-sm";
    tr.innerHTML = `
      <td class="py-3 px-3 text-slate-500 font-semibold">${idx + 1}</td>
      <td class="py-3 px-3">
        <div class="font-bold text-slate-800">${r.mode === "ANONYMOUS" ? "<span class='text-amber-600 font-normal italic'>(Anonim)</span>" : r.nama}</div>
        <div class="text-xs text-slate-500">${r.mode === "ANONYMOUS" ? "-" : `${r.sekolah} • ${r.jabatan}`}</div>
      </td>
      <td class="py-3 px-3">
        <span class="inline-flex items-center gap-1 font-bold text-amber-600">★ ${r.bintang_kegiatan}</span>
      </td>
      <td class="py-3 px-3 text-slate-700 max-w-xs truncate" title="${r.saran || '-'}">${r.saran || "-"}</td>
      <td class="py-3 px-3 text-slate-700 max-w-xs truncate" title="${r.rekomendasi || '-'}">${r.rekomendasi || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * QR Code Generator
 */
function setupQrCode(event) {
  // Ambil URL root publik
  const publicUrl = window.location.origin + window.location.pathname.replace(/\/marshal\/?.*$/, "") + "/";
  document.getElementById("link-publik-url").innerText = publicUrl;

  const qrImg = document.getElementById("qr-image-display");
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(publicUrl)}`;
}

/**
 * Event Listeners Dashboard
 */
function setupEventListeners() {
  // Form Buat Kegiatan Baru
  const formCreate = document.getElementById("form-create-event");
  if (formCreate) {
    formCreate.onsubmit = async (e) => {
      e.preventDefault();

      const btn = document.getElementById("btn-submit-create-event");
      btn.disabled = true;
      btn.innerHTML = `<span class="inline-block animate-spin mr-2">🔄</span> Membuka Sesi...`;
      showLoader("Membuka sesi penilaian kegiatan baru...");

      const payload = {
        action: "openEvent",
        password: marshalPassword,
        nama_kegiatan: document.getElementById("create-nama-kegiatan").value.trim(),
        tanggal: document.getElementById("create-tanggal").value,
        tempat: document.getElementById("create-tempat").value.trim(),
        is_lokasi_active: document.getElementById("create-is-lokasi").checked
      };

      try {
        const res = await fetch(CONFIG.GAS_WEB_APP_URL, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        hideLoader();

        if (result.status === "success") {
          showToast("Kegiatan resmi dibuka! Formulir responden kini aktif.", "success", "Berhasil");
          loadDashboardData();
        } else {
          showToast(result.message || "Gagal membuka kegiatan.", "error", "Gagal");
        }
      } catch (err) {
        console.error(err);
        hideLoader();
        showToast("Terjadi kesalahan jaringan saat membuka kegiatan.", "error", "Koneksi Bermasalah");
      } finally {
        btn.disabled = false;
        btn.innerHTML = "🚀 Buka Sesi Penilaian Sekarang";
      }
    };
  }

  // Tombol Export
  const btnPdf = document.getElementById("btn-export-pdf");
  if (btnPdf) {
    btnPdf.onclick = () => {
      showToast("Sedang menyiapkan berkas laporan PDF...", "info", "Mengekspor");
      ExportEngine.downloadPDF(currentDashboardData, latestAiSummary);
    };
  }

  const btnDocx = document.getElementById("btn-export-docx");
  if (btnDocx) {
    btnDocx.onclick = () => {
      showToast("Sedang menyiapkan berkas laporan DOCX...", "info", "Mengekspor");
      ExportEngine.downloadDOCX(currentDashboardData, latestAiSummary);
    };
  }

  // Tombol Trigger Reset (Hanya aktif jika PDF & DOCX terunduh)
  const btnTriggerReset = document.getElementById("btn-trigger-reset");
  if (btnTriggerReset) {
    btnTriggerReset.onclick = () => {
      if (!ExportEngine.pdfDownloaded || !ExportEngine.docxDownloaded) {
        showToast("PENTING: Unduh kedua file (PDF dan DOCX) terlebih dahulu sebelum dapat menutup kegiatan!", "warning", "Syarat Belum Terpenuhi");
        return;
      }
      document.getElementById("modal-reset-confirm").classList.remove("hidden");
    };
  }

  // Konfirmasi Reset Password
  const btnConfirmReset = document.getElementById("btn-confirm-reset-submit");
  if (btnConfirmReset) {
    btnConfirmReset.onclick = async () => {
      const pwd = document.getElementById("input-reset-password").value.trim();
      const err = document.getElementById("reset-password-error");

      if (!pwd) {
        err.innerText = "Masukkan password Marshal!";
        err.classList.remove("hidden");
        showToast("Masukkan password Marshal untuk konfirmasi!", "warning", "Password Kosong");
        return;
      }

      btnConfirmReset.disabled = true;
      btnConfirmReset.innerHTML = `<span class="inline-block animate-spin mr-2">🔄</span> Mengarsipkan Data...`;
      showLoader("Mengarsipkan data respon ke Google Sheets...");

      try {
        const res = await fetch(CONFIG.GAS_WEB_APP_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "closeAndArchiveEvent",
            password: pwd
          })
        });
        const result = await res.json();
        hideLoader();

        if (result.status === "success") {
          showToast(result.message, "success", "Pengarsipan Sukses");
          document.getElementById("modal-reset-confirm").classList.add("hidden");
          // Reset export states
          ExportEngine.pdfDownloaded = false;
          ExportEngine.docxDownloaded = false;
          loadDashboardData();
        } else {
          err.innerText = result.message;
          err.classList.remove("hidden");
          showToast(result.message, "error", "Gagal Mengarsipkan");
        }
      } catch (e) {
        console.error(e);
        hideLoader();
        err.innerText = "Gagal menghubungi server.";
        err.classList.remove("hidden");
        showToast("Gagal menghubungi server Google Apps Script.", "error", "Koneksi Bermasalah");
      } finally {
        btnConfirmReset.disabled = false;
        btnConfirmReset.innerHTML = "Konfirmasi & Arsipkan Sekarang";
      }
    };
  }

  // Enter Key Listener untuk Input Password Login
  const loginInput = document.getElementById("input-login-password");
  if (loginInput) {
    loginInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleLoginSubmit();
      }
    });
  }

  // Enter Key Listener untuk Input Password Reset
  const resetInput = document.getElementById("input-reset-password");
  if (resetInput) {
    resetInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const confirmBtn = document.getElementById("btn-confirm-reset-submit");
        if (confirmBtn) confirmBtn.click();
      }
    });
  }

  // Gemini Assistant Interactions
  setupGeminiAssistant();
}

/**
 * Logika Asisten Data Gemini AI
 */
function setupGeminiAssistant() {
  const geminiCard = document.getElementById("gemini-widget-trigger");
  const modal = document.getElementById("modal-gemini-chat");
  const closeBtn = document.getElementById("btn-close-gemini-modal");

  if (geminiCard) {
    geminiCard.onclick = () => {
      modal.classList.remove("hidden");
    };
  }

  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.classList.add("hidden");
    };
  }

  // Chips Pintasan Cepat
  document.querySelectorAll(".gemini-chip-btn").forEach(btn => {
    btn.onclick = () => {
      const prompt = btn.getAttribute("data-prompt");
      sendPromptToGemini(prompt);
    };
  });

  // Kirim Pertanyaan Custom
  const formChat = document.getElementById("form-gemini-chat");
  if (formChat) {
    formChat.onsubmit = (e) => {
      e.preventDefault();
      const input = document.getElementById("input-gemini-query");
      const query = input.value.trim();
      if (query) {
        sendPromptToGemini(query);
        input.value = "";
      }
    };
  }
}

async function sendPromptToGemini(questionText) {
  const chatLog = document.getElementById("gemini-chat-log");

  // Tambahkan bubble user
  const userMsg = document.createElement("div");
  userMsg.className = "flex justify-end mb-3";
  userMsg.innerHTML = `
    <div class="bg-blue-600 text-white rounded-2xl rounded-tr-none px-4 py-2.5 max-w-md text-sm shadow">
      ${questionText}
    </div>
  `;
  chatLog.appendChild(userMsg);

  // Tambahkan bubble loading bot
  const botLoading = document.createElement("div");
  botLoading.className = "flex justify-start mb-3";
  botLoading.innerHTML = `
    <div class="bg-purple-50 text-purple-900 border border-purple-100 rounded-2xl rounded-tl-none px-4 py-3 max-w-lg text-sm shadow-sm flex items-center gap-2">
      <span class="animate-spin">✦</span> Sedang menganalisis respon kegiatan yang aktif...
    </div>
  `;
  chatLog.appendChild(botLoading);
  chatLog.scrollTop = chatLog.scrollHeight;

  try {
    const res = await fetch(CONFIG.GAS_WEB_APP_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "askGemini",
        password: marshalPassword,
        question: questionText
      })
    });
    const result = await res.json();

    botLoading.remove();

    const botMsg = document.createElement("div");
    botMsg.className = "flex justify-start mb-3";

    if (result.status === "success") {
      latestAiSummary = result.answer; // Simpan untuk disematkan di laporan PDF/DOCX
      botMsg.innerHTML = `
        <div class="bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-none px-4 py-3 max-w-lg text-sm shadow-sm leading-relaxed prose prose-sm">
          <div class="font-bold text-purple-700 text-xs mb-1 flex items-center gap-1">✦ Asisten Gemini AI</div>
          ${formatMarkdown(result.answer)}
        </div>
      `;
    } else {
      botMsg.innerHTML = `
        <div class="bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-tl-none px-4 py-2.5 max-w-lg text-sm">
          ⚠️ ${result.message}
        </div>
      `;
    }

    chatLog.appendChild(botMsg);
    chatLog.scrollTop = chatLog.scrollHeight;

  } catch (e) {
    console.error(e);
    botLoading.remove();
    const botErr = document.createElement("div");
    botErr.className = "flex justify-start mb-3";
    botErr.innerHTML = `<div class="bg-red-50 text-red-600 rounded-xl px-4 py-2 text-sm">Gagal terhubung ke Asisten Gemini.</div>`;
    chatLog.appendChild(botErr);
  }
}

/**
 * Simple Markdown Parser untuk Bullet Points dan Bold
 */
function formatMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

/**
 * Helper Generator Bintang
 */
function renderStarRatingDisplay(elementId, ratingScore) {
  const container = document.getElementById(elementId);
  if (!container) return;
  container.innerHTML = "";

  const score = parseFloat(ratingScore) || 0;

  for (let i = 1; i <= 5; i++) {
    const starBox = document.createElement("div");
    starBox.className = "star-box";

    if (score >= i) {
      starBox.classList.add("active");
      starBox.innerHTML = "★";
    } else if (score > i - 1 && score < i) {
      const fraction = (score - (i - 1)) * 100;
      starBox.innerHTML = `
        <span style="color: #E2E8F0;">★</span>
        <span class="star-fill-clip" style="width: ${fraction}%;">★</span>
      `;
    } else {
      starBox.innerHTML = "★";
    }

    container.appendChild(starBox);
  }
}

/**
 * Unduh QR Code Sebagai File JPG
 */
function downloadQrAsJpg() {
  if (!currentDashboardData || !currentDashboardData.event) {
    showToast("Tidak ada data kegiatan aktif.", "error", "Gagal");
    return;
  }

  const qrImg = document.getElementById("qr-image-display");
  if (!qrImg || !qrImg.src) {
    showToast("Gambar QR Code belum selesai dimuat.", "warning", "Perhatian");
    return;
  }

  showLoader("Membuat berkas JPG beresolusi tinggi...");

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = qrImg.src;

  img.onload = () => {
    const size = 640;
    const padding = 50;
    const bottomHeight = 140;

    canvas.width = size;
    canvas.height = size + bottomHeight;

    // Latar Belakang Putih
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Bingkai Tepi
    ctx.strokeStyle = "#EA580C";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

    // Judul Header
    ctx.fillStyle = "#7A2000";
    ctx.font = "bold 26px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SCAN PENILAIAN KEGIATAN", size / 2, 46);

    // Gambar QR
    ctx.drawImage(img, padding, 65, size - (padding * 2), size - (padding * 2));

    // Nama Kegiatan & Metadata
    ctx.fillStyle = "#1E293B";
    ctx.font = "bold 20px 'Plus Jakarta Sans', Arial, sans-serif";
    const eventName = currentDashboardData.event.nama_kegiatan || "Kegiatan SMP";
    const truncatedName = eventName.length > 40 ? eventName.substring(0, 37) + "..." : eventName;
    ctx.fillText(truncatedName, size / 2, size + 28);

    ctx.fillStyle = "#EA580C";
    ctx.font = "bold 15px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("BIDANG SMP DISDIKBUD KARANGANYAR", size / 2, size + 60);

    ctx.fillStyle = "#64748B";
    ctx.font = "14px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("📅 " + (currentDashboardData.event.tanggal || "-") + "  •  📍 " + (currentDashboardData.event.tempat || "-"), size / 2, size + 92);

    // Export sebagai JPG
    const jpgUrl = canvas.toDataURL("image/jpeg", 0.95);
    const link = document.createElement("a");
    const cleanFileName = `QR_Penilaian_${eventName.replace(/[\/\\?*\[\]:]/g, "-")}.jpg`;
    link.download = cleanFileName;
    link.href = jpgUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    hideLoader();
    showToast("Barcode JPG berhasil disimpan ke perangkat Anda!", "success", "Unduh Selesai");
  };

  img.onerror = () => {
    hideLoader();
    showToast("Gagal memproses gambar QR Code ke format JPG.", "error", "Gagal Unduh");
  };
}

/**
 * Custom Toast Notifications
 */
function showToast(message, type = "info", title = "") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const item = document.createElement("div");
  item.className = `toast-item toast-${type}`;

  let iconText = "ℹ️";
  if (type === "success") iconText = "✓";
  if (type === "error") iconText = "✕";
  if (type === "warning") iconText = "⚠️";

  item.innerHTML = `
    <div class="toast-icon">${iconText}</div>
    <div class="flex-1 text-xs">
      ${title ? `<div class="font-extrabold text-slate-800 text-sm mb-0.5">${title}</div>` : ""}
      <div class="text-slate-600 leading-snug">${message}</div>
    </div>
  `;

  container.appendChild(item);

  setTimeout(() => {
    item.classList.add("toast-leave");
    setTimeout(() => item.remove(), 350);
  }, 4000);
}

function showLoader(text = "Memproses data...") {
  const loader = document.getElementById("global-loader");
  const loaderText = document.getElementById("global-loader-text");
  if (loaderText) loaderText.innerText = text;
  if (loader) loader.classList.remove("hidden");
}

function hideLoader() {
  const loader = document.getElementById("global-loader");
  if (loader) loader.classList.add("hidden");
}

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
  document.getElementById("dash-event-meta").innerText = `📅 ${formatDateIndo(event.tanggal)}  •  📍 ${event.tempat}`;

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
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(publicUrl)}`;
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

  // Tombol Buka Modal Ganti Kegiatan
  const btnOpenGanti = document.getElementById("btn-open-ganti-modal");
  if (btnOpenGanti) {
    btnOpenGanti.onclick = () => {
      if (currentDashboardData && currentDashboardData.event) {
        document.getElementById("modal-ganti-active-title").innerText = currentDashboardData.event.nama_kegiatan;
      }
      window.updateModalGantiStatus();
      document.getElementById("modal-ganti-kegiatan").classList.remove("hidden");
    };
  }

  // Tombol Unduh di dalam Modal Ganti Kegiatan
  const btnModalPdf = document.getElementById("btn-modal-unduh-pdf");
  if (btnModalPdf) {
    btnModalPdf.onclick = () => {
      showToast("Sedang menyiapkan berkas laporan PDF...", "info", "Mengekspor");
      ExportEngine.downloadPDF(currentDashboardData, latestAiSummary);
    };
  }

  const btnModalDocx = document.getElementById("btn-modal-unduh-docx");
  if (btnModalDocx) {
    btnModalDocx.onclick = () => {
      showToast("Sedang menyiapkan berkas laporan DOCX...", "info", "Mengekspor");
      ExportEngine.downloadDOCX(currentDashboardData, latestAiSummary);
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
 * Logika Asisten Data Gemini AI (Sesuai Referensi Pengguna)
 */
function getGeminiWelcomeCardHtml() {
  return `
    <div class="flex items-start gap-3">
      <div class="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0 mt-0.5">
        ✦
      </div>
      <div class="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 flex-1 max-w-2xl">
        <div class="font-bold text-sm text-slate-800">Asisten Data Kegiatan</div>
        <p class="text-xs sm:text-sm text-slate-600 leading-relaxed">
          Halo Panitia! Saya siap membantu menjawab pertanyaan seputar hasil evaluasi dan penilaian kegiatan yang sedang aktif saat ini.
        </p>
        <div class="border-t border-slate-100 pt-3">
          <div class="text-xs font-bold text-slate-700 mb-2.5">Contoh pertanyaan siap klik:</div>
          <div class="flex flex-wrap gap-2">
            <button class="gemini-chip-btn rounded-full border border-slate-300 bg-white hover:bg-purple-50 hover:border-purple-300 text-slate-700 hover:text-purple-700 text-xs px-3.5 py-1.5 font-medium shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer" data-prompt="Siapa saja nama responden dan dari sekolah mana yang sudah mengisi form penilaian ini?">
              <span>👥</span> Siapa saja yang sudah mengisi?
            </button>
            <button class="gemini-chip-btn rounded-full border border-slate-300 bg-white hover:bg-purple-50 hover:border-purple-300 text-slate-700 hover:text-purple-700 text-xs px-3.5 py-1.5 font-medium shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer" data-prompt="Berapa rata-rata nilai evaluasi untuk narasumber dan materi kegiatan?">
              <span>⭐</span> Nilai narasumber & materi?
            </button>
            <button class="gemini-chip-btn rounded-full border border-slate-300 bg-white hover:bg-purple-50 hover:border-purple-300 text-slate-700 hover:text-purple-700 text-xs px-3.5 py-1.5 font-medium shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer" data-prompt="Apa keluhan atau catatan fasilitas tempat acara dan makanan/konsumsi?">
              <span>🏨</span> Catatan tempat & konsumsi?
            </button>
            <button class="gemini-chip-btn rounded-full border border-slate-300 bg-white hover:bg-purple-50 hover:border-purple-300 text-slate-700 hover:text-purple-700 text-xs px-3.5 py-1.5 font-medium shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer" data-prompt="Rangkum topik pelatihan atau materi apa yang paling banyak diusulkan peserta untuk kegiatan berikutnya?">
              <span>💡</span> Rekomendasi topik berikutnya?
            </button>
            <button class="gemini-chip-btn rounded-full border border-slate-300 bg-white hover:bg-purple-50 hover:border-purple-300 text-slate-700 hover:text-purple-700 text-xs px-3.5 py-1.5 font-medium shadow-xs transition active:scale-95 flex items-center gap-1.5 cursor-pointer" data-prompt="Buatkan ringkasan eksekutif komprehensif dari hasil evaluasi kegiatan ini!">
              <span>📋</span> Ringkasan eksekutif kegiatan
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function resetGeminiChatUI() {
  const chatLog = document.getElementById("gemini-chat-log");
  if (chatLog) {
    chatLog.innerHTML = getGeminiWelcomeCardHtml();
    // Pasang event listener ke tombol contoh pertanyaan siap klik
    chatLog.querySelectorAll(".gemini-chip-btn").forEach(btn => {
      btn.onclick = () => {
        const prompt = btn.getAttribute("data-prompt");
        sendPromptToGemini(prompt);
      };
    });
  }
  const input = document.getElementById("input-gemini-query");
  if (input) input.value = "";
}

function closeAndClearGeminiChat() {
  const modal = document.getElementById("modal-gemini-chat");
  if (modal) {
    modal.classList.add("hidden");
  }
  resetGeminiChatUI();
}

function setupGeminiAssistant() {
  const geminiCard = document.getElementById("gemini-widget-trigger");
  const modal = document.getElementById("modal-gemini-chat");
  const closeBtn = document.getElementById("btn-close-gemini-modal");

  if (geminiCard) {
    geminiCard.onclick = () => {
      // Sinkronkan data kegiatan aktif & badge jumlah responden
      const eventName = (currentDashboardData && currentDashboardData.event && currentDashboardData.event.nama_kegiatan) ? currentDashboardData.event.nama_kegiatan : "KEGIATAN BIDANG SMP";
      const count = (currentDashboardData && currentDashboardData.count) ? currentDashboardData.count : 0;
      
      const nameEl = document.getElementById("gemini-modal-event-name");
      if (nameEl) nameEl.innerText = eventName;
      
      const badgeEl = document.getElementById("gemini-modal-count-badge");
      if (badgeEl) badgeEl.innerText = `${count} Responden`;

      resetGeminiChatUI();
      modal.classList.remove("hidden");
    };
  }

  if (closeBtn) {
    closeBtn.onclick = closeAndClearGeminiChat;
  }

  // Tutup & Clear jika klik backdrop di luar box
  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) {
        closeAndClearGeminiChat();
      }
    };
  }

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
    <div class="bg-blue-600 text-white rounded-2xl rounded-tr-none px-4 py-2.5 max-w-md text-xs sm:text-sm shadow-sm font-medium">
      ${questionText}
    </div>
  `;
  chatLog.appendChild(userMsg);

  // Tambahkan bubble loading bot
  const botLoading = document.createElement("div");
  botLoading.className = "flex items-start gap-3 mb-3";
  botLoading.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0 mt-0.5">
      ✦
    </div>
    <div class="bg-white border border-slate-200 text-slate-600 rounded-2xl rounded-tl-none px-4 py-3 max-w-lg text-xs sm:text-sm shadow-xs flex items-center gap-2">
      <span class="animate-spin text-purple-600 text-base">✦</span> Sedang membaca data evaluasi...
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
    botMsg.className = "flex items-start gap-3 mb-3";

    if (result.status === "success") {
      latestAiSummary = result.answer; // Simpan untuk disematkan di laporan PDF/DOCX
      botMsg.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0 mt-0.5">
          ✦
        </div>
        <div class="bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-none p-4 sm:p-5 max-w-xl text-xs sm:text-sm shadow-xs leading-relaxed space-y-1.5 flex-1">
          <div class="font-bold text-purple-700 text-xs flex items-center gap-1.5 mb-1">
            <span>✦</span> Asisten Gemini AI
          </div>
          <div class="prose prose-sm text-slate-800 leading-relaxed text-xs sm:text-sm">
            ${formatMarkdown(result.answer)}
          </div>
        </div>
      `;
    } else {
      botMsg.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0 mt-0.5">
          ⚠️
        </div>
        <div class="bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-tl-none px-4 py-3 max-w-lg text-xs sm:text-sm shadow-xs">
          ${result.message}
        </div>
      `;
    }

    chatLog.appendChild(botMsg);
    chatLog.scrollTop = chatLog.scrollHeight;

  } catch (e) {
    console.error(e);
    botLoading.remove();
    const botErr = document.createElement("div");
    botErr.className = "flex items-start gap-3 mb-3";
    botErr.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0 mt-0.5">⚠️</div>
      <div class="bg-red-50 text-red-600 rounded-xl px-4 py-2 text-xs sm:text-sm">Gagal terhubung ke Asisten Gemini.</div>
    `;
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
    // Dimensi Kanvas Poster Tajam (High Resolution)
    const width = 760;
    const height = 1040;
    canvas.width = width;
    canvas.height = height;

    // 1. Latar Belakang Putih Bersih
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    // 2. Bingkai Luar Terracotta
    ctx.strokeStyle = "#EA580C";
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, width - 14, height - 14);

    // 3. Garis Aksen Emas Tipis di Dalam
    ctx.strokeStyle = "#FED7AA";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // 4. Header Atas
    ctx.textAlign = "center";
    ctx.fillStyle = "#7A2000";
    ctx.font = "bold 30px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("SCAN PENILAIAN KEGIATAN", width / 2, 65);

    ctx.fillStyle = "#EA580C";
    ctx.font = "bold 15px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("BIDANG SMP DISDIKBUD KABUPATEN KARANGANYAR", width / 2, 95);

    // 5. Container & Gambar Barcode QR
    const qrSize = 520;
    const qrX = (width - qrSize) / 2;
    const qrY = 120;

    // Border kotak penampung QR
    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);
    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 2;
    ctx.strokeRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);

    // Gambar QR
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

    // 6. Nama Kegiatan & Info Waktu/Tempat
    const eventName = currentDashboardData.event.nama_kegiatan || "Kegiatan SMP";
    const truncatedName = eventName.length > 45 ? eventName.substring(0, 42) + "..." : eventName;

    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 24px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText(truncatedName.toUpperCase(), width / 2, 695);

    ctx.fillStyle = "#475569";
    ctx.font = "bold 15px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("📅 " + formatDateIndo(currentDashboardData.event.tanggal) + "  •  📍 " + (currentDashboardData.event.tempat || "-"), width / 2, 725);

    // 7. KOTAK PROMINEN ALAMAT WEB (SANGAT JELAS)
    const publicUrl = window.location.origin + window.location.pathname.replace(/\/marshal\/?.*$/, "") + "/";
    const urlBoxX = 50;
    const urlBoxY = 750;
    const urlBoxWidth = width - 100;
    const urlBoxHeight = 110;

    // Background Kotak URL
    ctx.fillStyle = "#FFF7ED";
    ctx.fillRect(urlBoxX, urlBoxY, urlBoxWidth, urlBoxHeight);
    ctx.strokeStyle = "#EA580C";
    ctx.lineWidth = 3;
    ctx.strokeRect(urlBoxX, urlBoxY, urlBoxWidth, urlBoxHeight);

    // Label dalam Kotak
    ctx.fillStyle = "#9A3412";
    ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("🌐 LINK ALAMAT WEB PENILAIAN (JIKA TIDAK SCAN QR):", width / 2, urlBoxY + 32);

    // Alamat URL Tebal & Sangat Jelas
    ctx.fillStyle = "#C2410C";
    ctx.font = "bold 23px 'Courier New', monospace, sans-serif";
    ctx.fillText(publicUrl, width / 2, urlBoxY + 72);

    // 8. Petunjuk Singkat
    ctx.fillStyle = "#64748B";
    ctx.font = "14px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("Arahkan kamera HP ke Barcode di atas atau ketik alamat web tersebut.", width / 2, 905);

    // 9. Watermark / Footer JeMPROT
    ctx.fillStyle = "#94A3B8";
    ctx.font = "bold 12px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("⭐ PORTAL PENILAIAN KEGIATAN • BIDANG SMP KAB. KARANGANYAR ⭐", width / 2, 985);

    // Export sebagai JPG
    const jpgUrl = canvas.toDataURL("image/jpeg", 0.96);
    const link = document.createElement("a");
    const cleanFileName = `QR_Penilaian_${eventName.replace(/[\/\\?*\[\]:]/g, "-")}.jpg`;
    link.download = cleanFileName;
    link.href = jpgUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    hideLoader();
    showToast("Barcode JPG beresolusi tinggi berhasil diunduh!", "success", "Unduh Selesai");
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

/**
 * Format Tanggal Indonesia: hari, DD-MM-YYYY
 */
function formatDateIndo(dateInput) {
  if (!dateInput) return "-";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);

  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const dayName = days[date.getDay()];
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  return `${dayName}, ${dd}-${mm}-${yyyy}`;
}

/**
 * Status Update Modal Ganti Kegiatan (Langkah 1 & Langkah 2)
 */
window.updateModalGantiStatus = function() {
  const badgePdf = document.getElementById("modal-badge-pdf");
  const badgeDocx = document.getElementById("modal-badge-docx");
  const lockNote = document.getElementById("modal-ganti-lock-note");
  const step2 = document.getElementById("container-langkah-2");
  const btnSubmit = document.getElementById("btn-confirm-reset-submit");

  if (ExportEngine.pdfDownloaded && badgePdf) {
    badgePdf.innerText = "✓ Terunduh";
    badgePdf.className = "bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md";
  }

  if (ExportEngine.docxDownloaded && badgeDocx) {
    badgeDocx.innerText = "✓ Terunduh";
    badgeDocx.className = "bg-emerald-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md";
  }

  if (ExportEngine.pdfDownloaded && ExportEngine.docxDownloaded) {
    if (step2) {
      step2.classList.remove("opacity-50", "pointer-events-none");
      step2.classList.add("bg-white", "shadow-sm");
    }
    if (lockNote) {
      lockNote.innerHTML = "<span class='text-emerald-600 font-bold'>✓ Berkas arsip lengkap! Silakan masukkan password untuk konfirmasi ganti kegiatan.</span>";
    }
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.className = "w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer";
    }
  }
};

/**
 * Konfirmasi Ganti Kegiatan & Arsip Data
 */
window.handleConfirmGantiSubmit = async function() {
  if (!ExportEngine.pdfDownloaded || !ExportEngine.docxDownloaded) {
    showToast("Wajib mengunduh kedua berkas arsip (PDF dan DOCX) terlebih dahulu!", "warning", "Langkah 1 Belum Lengkap");
    return;
  }

  const pwdInput = document.getElementById("input-reset-password");
  const pwd = pwdInput ? pwdInput.value.trim() : "";
  const err = document.getElementById("reset-password-error");

  if (!pwd) {
    if (err) {
      err.innerText = "Masukkan password Marshal!";
      err.classList.remove("hidden");
    }
    showToast("Masukkan password Marshal untuk konfirmasi!", "warning", "Password Kosong");
    return;
  }

  const btnSubmit = document.getElementById("btn-confirm-reset-submit");
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span class="inline-block animate-spin mr-2">🔄</span> Mengarsipkan Data...`;
  }
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
      document.getElementById("modal-ganti-kegiatan").classList.add("hidden");
      // Reset status
      ExportEngine.pdfDownloaded = false;
      ExportEngine.docxDownloaded = false;
      if (pwdInput) pwdInput.value = "";
      if (err) err.classList.add("hidden");
      loadDashboardData();
    } else {
      if (err) {
        err.innerText = result.message;
        err.classList.remove("hidden");
      }
      showToast(result.message, "error", "Gagal Mengarsipkan");
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = "<span>🔄</span> Konfirmasi & Ganti Kegiatan";
      }
    }
  } catch (e) {
    console.error(e);
    hideLoader();
    if (err) {
      err.innerText = "Gagal menghubungi server.";
      err.classList.remove("hidden");
    }
    showToast("Gagal menghubungi server Google Apps Script.", "error", "Koneksi Bermasalah");
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = "<span>🔄</span> Konfirmasi & Ganti Kegiatan";
    }
  }
};

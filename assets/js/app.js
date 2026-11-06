/**
 * RATING GIAT - LOGIKA HALAMAN RESPONDEN (PUBLIK)
 */

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

let currentActiveEvent = null;

async function initApp() {
  const splashScreen = document.getElementById("splash-screen");
  const startTime = Date.now();
  let data = null;
  let fetchError = null;

  try {
    // 1. Ambil status kegiatan aktif dari Google Apps Script
    const response = await fetch(`${CONFIG.GAS_WEB_APP_URL}?action=getActiveEvent`);
    data = await response.json();
  } catch (error) {
    console.error("Gagal memuat status kegiatan:", error);
    fetchError = error;
  }

  // Waktu tunggu animasi logo tepat 4 detik (4000 ms)
  const elapsedTime = Date.now() - startTime;
  const remainingTime = Math.max(0, 4000 - elapsedTime);

  setTimeout(() => {
    if (splashScreen) splashScreen.classList.add("fade-out");
    
    if (data && data.status === "ACTIVE" && data.event) {
      currentActiveEvent = data.event;
      renderActiveEvent(data.event);
    } else if (fetchError) {
      renderStandbyView("Gagal terhubung ke server atau periksa koneksi internet.");
    } else {
      renderStandbyView();
    }
  }, remainingTime);
}

/**
 * Tampilan Standby (Saat Belum Ada Kegiatan Aktif)
 */
function renderStandbyView(customMessage) {
  document.getElementById("view-standby").classList.remove("hidden");
  document.getElementById("view-form").classList.add("hidden");
  document.getElementById("view-success").classList.add("hidden");
  document.getElementById("view-already-submitted").classList.add("hidden");

  if (customMessage) {
    const desc = document.getElementById("standby-desc");
    if (desc) desc.innerText = customMessage;
  }
}

/**
 * Tampilan Form Aktif
 */
function renderActiveEvent(event) {
  // Cek apakah HP ini sudah pernah submit untuk ID kegiatan ini (Kunci Mutlak)
  const localKey = `rating_giat_submitted_${event.id_kegiatan}`;
  const savedSubmission = localStorage.getItem(localKey);

  if (savedSubmission) {
    renderAlreadySubmittedView(event, JSON.parse(savedSubmission));
    return;
  }

  // Tampilkan data di banner header
  document.getElementById("banner-title").innerText = event.nama_kegiatan;
  document.getElementById("banner-subtitle").innerText = `Bidang SMP - Dinas Pendidikan dan Kebudayaan Kabupaten Karanganyar`;
  document.getElementById("info-tgl-tempat").innerText = `📅 ${formatDateIndo(event.tanggal)}  •  📍 ${event.tempat}`;

  // Atur visibilitas penilaian tempat acara
  const lokasiSection = document.getElementById("section-penilaian-lokasi");
  if (lokasiSection) {
    if (event.is_lokasi_active) {
      lokasiSection.classList.remove("hidden");
    } else {
      lokasiSection.classList.add("hidden");
    }
  }

  // Render pertanyaan dinamis (mutu & tempat) sesuai konfigurasi kegiatan aktif
  renderDynamicQuestions(event);

  document.getElementById("view-standby").classList.add("hidden");
  document.getElementById("view-form").classList.remove("hidden");
  document.getElementById("view-success").classList.add("hidden");
  document.getElementById("view-already-submitted").classList.add("hidden");

  setupFormListeners(event);
}

/**
 * Tampilan Sudah Pernah Mengisi (Pencegahan Spam)
 */
function renderAlreadySubmittedView(event, savedData) {
  document.getElementById("view-standby").classList.add("hidden");
  document.getElementById("view-form").classList.add("hidden");
  document.getElementById("view-success").classList.add("hidden");
  document.getElementById("view-already-submitted").classList.remove("hidden");

  document.getElementById("already-event-name").innerText = event.nama_kegiatan;
  document.getElementById("already-timestamp").innerText = `Dikirim pada: ${savedData.submitted_at || "-"}`;

  // Render kartu bintang yang pernah diberikan
  renderStarRatingDisplay("already-stars-kegiatan", savedData.bintang_kegiatan || "5.00");
  document.getElementById("already-score-kegiatan").innerText = `${savedData.bintang_kegiatan || "5.00"} / 5.00`;

  const placeCard = document.getElementById("already-card-tempat");
  if (savedData.bintang_tempat && savedData.is_lokasi_active) {
    placeCard.classList.remove("hidden");
    renderStarRatingDisplay("already-stars-tempat", savedData.bintang_tempat);
    document.getElementById("already-score-tempat").innerText = `${savedData.bintang_tempat} / 5.00`;
  } else {
    placeCard.classList.add("hidden");
  }
}

/**
 * Generator Pertanyaan Dinamis (Mutu & Tempat Acara)
 */
const DEFAULT_PERTANYAAN = {
  mutu: [
    "Kualitas Narasumber / Fasilitator",
    "Materi & Kemanfaatan",
    "Pelayanan & Penyelenggaraan Panitia",
    "Kepuasan Menyeluruh (Overall)"
  ],
  tempat: [
    "Fasilitas Tempat Acara",
    "Pelayanan & Konsumsi Tempat"
  ]
};

function getActivePertanyaan(event) {
  const p = (event && event.pertanyaan) ? event.pertanyaan : {};
  const mutu = (Array.isArray(p.mutu) && p.mutu.length > 0) ? p.mutu : DEFAULT_PERTANYAAN.mutu;
  const tempat = (Array.isArray(p.tempat) && p.tempat.length > 0) ? p.tempat : DEFAULT_PERTANYAAN.tempat;
  return { mutu, tempat };
}

function hurufUrut(idx) {
  return String.fromCharCode(65 + idx); // 0 -> A, 1 -> B, dst.
}

function renderQuestionBlock(questionText, idx, prefix) {
  const labelHuruf = hurufUrut(idx);
  const radioName = `nilai_${prefix}_${idx}`;
  const gridId = `grid-${prefix}-${idx}`;
  const catId = `catatan-${prefix}-${idx}`;

  let radioPills = "";
  for (let val = 1; val <= 10; val++) {
    const radioId = `${prefix}-${idx}-${val}`;
    radioPills += `
      <input type="radio" name="${radioName}" id="${radioId}" value="${val}" class="rating-pill-input sr-only">
      <label for="${radioId}" class="rating-pill-label">${val}</label>
    `;
  }

  return `
    <div class="space-y-3 pt-5 first:pt-0 border-t first:border-t-0 border-slate-100">
      <label class="block text-sm font-bold text-slate-800 leading-snug">
        ${labelHuruf}. ${questionText} <span class="text-red-500 font-bold">*</span>
      </label>
      <div id="${gridId}" class="rating-pills-grid transition">
        ${radioPills}
      </div>
      <div class="mt-3">
        <label for="${catId}" class="block text-xs font-bold text-slate-700 mb-1">
          Alasan / Catatan Penilaian <span class="text-red-500 font-bold">*</span>
        </label>
        <textarea id="${catId}" rows="3" placeholder="Tuliskan alasan / catatan penilaian Anda (wajib diisi)..." class="w-full text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 bg-white text-slate-700 transition"></textarea>
      </div>
    </div>
  `;
}

function renderDynamicQuestions(event) {
  const { mutu, tempat } = getActivePertanyaan(event);

  // Render Mutu Kegiatan
  const containerMutu = document.getElementById("container-pertanyaan-mutu");
  if (containerMutu) {
    containerMutu.innerHTML = mutu.map((q, idx) => renderQuestionBlock(q, idx, "mutu")).join("");
  }

  // Render Tempat Acara (jika aktif)
  const containerTempat = document.getElementById("container-pertanyaan-tempat");
  if (containerTempat && event.is_lokasi_active) {
    containerTempat.innerHTML = tempat.map((q, idx) => renderQuestionBlock(q, idx, "tempat")).join("");
  }
}

/**
 * Event Listener & Validasi Form
 */
function setupFormListeners(event) {
  const { mutu, tempat } = getActivePertanyaan(event);

  // Toggle Identitas (Data vs Anonymous)
  const modeData = document.getElementById("mode-identitas-data");
  const modeAnon = document.getElementById("mode-identitas-anon");
  const dataFields = document.getElementById("container-identitas-fields");

  function updateIdentityMode() {
    if (modeData.checked) {
      dataFields.classList.remove("hidden");
      document.getElementById("input-nama").required = true;
      document.getElementById("input-sekolah").required = true;
      document.getElementById("input-jabatan").required = true;
    } else {
      dataFields.classList.add("hidden");
      document.getElementById("input-nama").required = false;
      document.getElementById("input-sekolah").required = false;
      document.getElementById("input-jabatan").required = false;
    }
  }

  modeData.addEventListener("change", updateIdentityMode);
  modeAnon.addEventListener("change", updateIdentityMode);
  updateIdentityMode();

  // Submit Handler
  const form = document.getElementById("rating-form");
  form.onsubmit = async (e) => {
    e.preventDefault();

    // Helper untuk menandai field input/textarea yang belum diisi (tanpa notifikasi bawaan browser)
    const markInvalid = (el, msg, title = "Wajib Diisi") => {
      showToast(msg, "warning", title);
      if (el) {
        el.classList.add("border-red-500", "ring-2", "ring-red-200");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.focus();
        const clearHighlight = () => {
          el.classList.remove("border-red-500", "ring-2", "ring-red-200");
          el.removeEventListener("input", clearHighlight);
          el.removeEventListener("change", clearHighlight);
        };
        el.addEventListener("input", clearHighlight);
        el.addEventListener("change", clearHighlight);
      }
    };

    // Helper untuk menandai container pilihan angka radio
    const markRadioInvalid = (name, containerId, msg) => {
      showToast(msg, "warning", "Nilai Wajib Dipilih");
      const container = document.getElementById(containerId);
      if (container) {
        container.scrollIntoView({ behavior: "smooth", block: "center" });
        container.classList.add("ring-2", "ring-red-500", "rounded-xl", "p-1.5");
        const radios = document.querySelectorAll(`input[name="${name}"]`);
        radios.forEach(r => {
          r.addEventListener("change", () => {
            container.classList.remove("ring-2", "ring-red-500", "rounded-xl", "p-1.5");
          }, { once: true });
        });
      }
    };

    // 1. Validasi Identitas (Jika Mode DATA)
    if (modeData.checked) {
      const namaEl = document.getElementById("input-nama");
      if (!namaEl.value.trim()) {
        markInvalid(namaEl, "Harap isi Nama Lengkap & Gelar Anda.");
        return;
      }
      const sekolahEl = document.getElementById("input-sekolah");
      if (!sekolahEl.value.trim()) {
        markInvalid(sekolahEl, "Harap isi Asal Satuan Pendidikan (SMP) Anda.");
        return;
      }
      const jabatanEl = document.getElementById("input-jabatan");
      if (!jabatanEl.value.trim()) {
        markInvalid(jabatanEl, "Harap isi Jabatan / Peran Anda.");
        return;
      }
    }

    // Helper pembaca radio
    const getRadioVal = (name) => {
      const el = document.querySelector(`input[name="${name}"]:checked`);
      return el ? el.value : null;
    };

    // 2. Validasi Pertanyaan Mutu Kegiatan Dinamis
    const nilaiMutu = [];
    const catatanMutu = [];
    for (let i = 0; i < mutu.length; i++) {
      const radioName = `nilai_mutu_${i}`;
      const gridId = `grid-mutu-${i}`;
      const catId = `catatan-mutu-${i}`;
      const labelHuruf = hurufUrut(i);

      const val = getRadioVal(radioName);
      if (!val) {
        markRadioInvalid(radioName, gridId, `Harap pilih nilai (1 - 10) untuk poin ${labelHuruf} (${mutu[i]}).`);
        return;
      }
      nilaiMutu.push(parseInt(val, 10));

      const catEl = document.getElementById(catId);
      const catVal = catEl ? catEl.value.trim() : "";
      if (!catVal) {
        markInvalid(catEl, `Harap isi alasan / catatan penilaian untuk poin ${labelHuruf}.`);
        return;
      }
      catatanMutu.push(catVal);
    }

    // 3. Validasi Pertanyaan Tempat Acara Dinamis (Jika Aktif)
    const nilaiTempat = [];
    const catatanTempat = [];
    if (event.is_lokasi_active) {
      for (let j = 0; j < tempat.length; j++) {
        const radioName = `nilai_tempat_${j}`;
        const gridId = `grid-tempat-${j}`;
        const catId = `catatan-tempat-${j}`;
        const labelHuruf = hurufUrut(j);

        const val = getRadioVal(radioName);
        if (!val) {
          markRadioInvalid(radioName, gridId, `Harap pilih nilai (1 - 10) untuk Fasilitas Tempat poin ${labelHuruf} (${tempat[j]}).`);
          return;
        }
        nilaiTempat.push(parseInt(val, 10));

        const catEl = document.getElementById(catId);
        const catVal = catEl ? catEl.value.trim() : "";
        if (!catVal) {
          markInvalid(catEl, `Harap isi alasan / catatan fasilitas tempat untuk poin ${labelHuruf}.`);
          return;
        }
        catatanTempat.push(catVal);
      }
    }

    // 4. Validasi Masukan & Rekomendasi
    const saranEl = document.getElementById("input-saran");
    if (!saranEl.value.trim()) {
      markInvalid(saranEl, "Harap isi Saran & Masukan untuk Panitia / Narasumber.");
      return;
    }

    const rekomendasiEl = document.getElementById("input-rekomendasi");
    if (!rekomendasiEl.value.trim()) {
      markInvalid(rekomendasiEl, "Harap isi Rekomendasi Topik / Pelatihan Berikutnya.");
      return;
    }

    // Jika seluruh validasi lolos, lanjutkan pengiriman
    const submitBtn = document.getElementById("btn-submit-rating");
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-block animate-spin mr-2">🔄</span> Mengirimkan Penilaian...`;
    showLoader("Mengirimkan penilaian Anda ke server...");

    // Format catatan penjelasan terstruktur (untuk kompatibilitas laporan)
    let catatanList = [];
    mutu.forEach((q, i) => {
      catatanList.push(`[${hurufUrut(i)}. ${q}: ${catatanMutu[i]}]`);
    });
    if (event.is_lokasi_active) {
      tempat.forEach((q, j) => {
        catatanList.push(`[Tempat ${hurufUrut(j)}. ${q}: ${catatanTempat[j]}]`);
      });
    }

    const fullSaran = [catatanList.join("\n"), saranEl.value.trim()].join("\n\n");

    const payload = {
      action: "submitRating",
      id_kegiatan: event.id_kegiatan,
      mode_identitas: modeData.checked ? "DATA" : "ANONYMOUS",
      nama: document.getElementById("input-nama").value.trim(),
      asal_sekolah: document.getElementById("input-sekolah").value.trim(),
      jabatan: document.getElementById("input-jabatan").value.trim(),
      nilai_mutu: nilaiMutu,
      catatan_mutu: catatanMutu,
      nilai_tempat: nilaiTempat,
      catatan_tempat: catatanTempat,
      saran_masukan: fullSaran,
      rekomendasi_topik: rekomendasiEl.value.trim()
    };

    try {
      const res = await fetch(CONFIG.GAS_WEB_APP_URL, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      hideLoader();

      if (result.status === "success") {
        showToast("Penilaian Anda berhasil disimpan!", "success", "Berhasil");
        // Simpan tanda sudah mengisi di LocalStorage (Kunci Mutlak)
        const submissionData = {
          submitted_at: new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" }),
          bintang_kegiatan: result.bintang_kegiatan,
          bintang_tempat: result.bintang_tempat,
          is_lokasi_active: result.is_lokasi_active
        };
        localStorage.setItem(`rating_giat_submitted_${event.id_kegiatan}`, JSON.stringify(submissionData));

        renderSuccessView(event, result);
      } else {
        showToast(result.message || "Gagal menyimpan penilaian.", "error", "Gagal");
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    } catch (err) {
      console.error(err);
      hideLoader();
      showToast("Terjadi kendala jaringan saat mengirim penilaian. Silakan coba lagi.", "error", "Koneksi Bermasalah");
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  };
}

/**
 * Layar Sukses & Render Bintang Besar
 */
function renderSuccessView(event, result) {
  document.getElementById("view-form").classList.add("hidden");
  document.getElementById("view-success").classList.remove("hidden");

  // Trigger Confetti
  if (typeof confetti === "function") {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  }

  // Render Bintang Kegiatan
  renderStarRatingDisplay("success-stars-kegiatan", result.bintang_kegiatan);
  document.getElementById("success-score-kegiatan").innerText = `${result.bintang_kegiatan} / 5.00`;

  // Render Bintang Tempat (jika aktif)
  const placeCard = document.getElementById("success-card-tempat");
  if (result.is_lokasi_active && result.bintang_tempat) {
    placeCard.classList.remove("hidden");
    renderStarRatingDisplay("success-stars-tempat", result.bintang_tempat);
    document.getElementById("success-score-tempat").innerText = `${result.bintang_tempat} / 5.00`;
  } else {
    placeCard.classList.add("hidden");
  }

  // Scroll ke atas
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Generator Bintang Presisi Pecahan (0.00 - 5.00)
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
      // Penuh
      starBox.classList.add("active");
      starBox.innerHTML = "★";
    } else if (score > i - 1 && score < i) {
      // Pecahan (Fractional)
      const fraction = (score - (i - 1)) * 100;
      starBox.innerHTML = `
        <span style="color: #E2E8F0;">★</span>
        <span class="star-fill-clip" style="width: ${fraction}%;">★</span>
      `;
    } else {
      // Kosong
      starBox.innerHTML = "★";
    }

    container.appendChild(starBox);
  }
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

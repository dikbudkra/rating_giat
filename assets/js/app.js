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
 * Event Listener & Validasi Form
 */
function setupFormListeners(event) {
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

    // Validasi Radio Angka
    const getRadioVal = (name) => {
      const el = document.querySelector(`input[name="${name}"]:checked`);
      return el ? el.value : null;
    };

    const narasumber = getRadioVal("nilai_narasumber");
    const materi = getRadioVal("nilai_materi");
    const panitia = getRadioVal("nilai_fasilitas_panitia");
    const kepuasan = getRadioVal("nilai_kepuasan");

    if (!narasumber || !materi || !panitia || !kepuasan) {
      showToast("Harap lengkapi seluruh butir penilaian mutu kegiatan (Skala 1 - 10) sebelum mengirim.", "warning", "Form Belum Lengkap");
      return;
    }

    let tempatFas = null;
    let tempatPel = null;
    if (event.is_lokasi_active) {
      tempatFas = getRadioVal("nilai_tempat_fasilitas");
      tempatPel = getRadioVal("nilai_tempat_pelayanan");
      if (!tempatFas || !tempatPel) {
        showToast("Harap lengkapi penilaian fasilitas & pelayanan tempat acara!", "warning", "Form Belum Lengkap");
        return;
      }
    }

    const submitBtn = document.getElementById("btn-submit-rating");
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-block animate-spin mr-2">🔄</span> Mengirimkan Penilaian...`;
    showLoader("Mengirimkan penilaian Anda ke server...");

    // Kumpulkan catatan penjelasan per aspek jika diisi
    let catatanList = [];
    const catNara = document.getElementById("catatan-narasumber") ? document.getElementById("catatan-narasumber").value.trim() : "";
    const catMat = document.getElementById("catatan-materi") ? document.getElementById("catatan-materi").value.trim() : "";
    const catPan = document.getElementById("catatan-panitia") ? document.getElementById("catatan-panitia").value.trim() : "";
    const catKep = document.getElementById("catatan-kepuasan") ? document.getElementById("catatan-kepuasan").value.trim() : "";
    const catTmpFas = document.getElementById("catatan-tempat-fasilitas") ? document.getElementById("catatan-tempat-fasilitas").value.trim() : "";
    const catTmpPel = document.getElementById("catatan-tempat-pelayanan") ? document.getElementById("catatan-tempat-pelayanan").value.trim() : "";

    if (catNara) catatanList.push(`[Narasumber: ${catNara}]`);
    if (catMat) catatanList.push(`[Materi: ${catMat}]`);
    if (catPan) catatanList.push(`[Panitia: ${catPan}]`);
    if (catKep) catatanList.push(`[Kepuasan: ${catKep}]`);
    if (catTmpFas) catatanList.push(`[Fasilitas Tempat: ${catTmpFas}]`);
    if (catTmpPel) catatanList.push(`[Pelayanan Tempat: ${catTmpPel}]`);

    const saranUmum = document.getElementById("input-saran").value.trim();
    const fullSaran = [catatanList.join(" "), saranUmum].filter(Boolean).join("\n\n");

    const payload = {
      action: "submitRating",
      id_kegiatan: event.id_kegiatan,
      mode_identitas: modeData.checked ? "DATA" : "ANONYMOUS",
      nama: document.getElementById("input-nama").value.trim(),
      asal_sekolah: document.getElementById("input-sekolah").value.trim(),
      jabatan: document.getElementById("input-jabatan").value.trim(),
      nilai_narasumber: narasumber,
      nilai_materi: materi,
      nilai_fasilitas_panitia: panitia,
      nilai_kepuasan: kepuasan,
      nilai_tempat_fasilitas: tempatFas,
      nilai_tempat_pelayanan: tempatPel,
      saran_masukan: fullSaran,
      rekomendasi_topik: document.getElementById("input-rekomendasi").value.trim()
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

/**
 * ============================================================================
 * RATING GIAT - BIDANG SMP DINAS PENDIDIKAN & KEBUDAYAAN KABUPATEN KARANGANYAR
 * Backend Google Apps Script (Standalone)
 * ============================================================================
 */

const SPREADSHEET_ID = "1JZ0trXpmL6s2Fsu4yd-aLcFoEOO6SkLdyTjh9ziBy30";

/**
 * Helper untuk mengambil Spreadsheet objek
 */
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * ============================================================================
 * SETUP DATABASE (JALANKAN SEKALI DARI EDITOR APPS SCRIPT)
 * Membuat Tab: CONFIG, KEGIATAN, RESPON lengkap dengan header & pewarnaan rapi.
 * ============================================================================
 */
function setupDatabase() {
  const ss = getSpreadsheet();
  
  // 1. Tab CONFIG
  let configSheet = ss.getSheetByName("CONFIG");
  if (!configSheet) {
    configSheet = ss.insertSheet("CONFIG");
  }
  configSheet.clear();
  configSheet.getRange(1, 1, 1, 3).setValues([["KEY", "VALUE", "KETERANGAN"]]);
  configSheet.getRange(1, 1, 1, 3).setBackground("#7A2000").setFontColor("#FFFFFF").setFontWeight("bold");
  configSheet.appendRow(["MARSHAL_PASSWORD", "smp2026", "Kata sandi login panel admin / marshal"]);
  configSheet.appendRow(["APP_NAME", "Rating Giat Bidang SMP", "Nama Aplikasi"]);
  configSheet.autoResizeColumns(1, 3);

  // 2. Tab KEGIATAN
  let giatSheet = ss.getSheetByName("KEGIATAN");
  if (!giatSheet) {
    giatSheet = ss.insertSheet("KEGIATAN");
  }
  giatSheet.clear();
  const giatHeaders = [
    "id_kegiatan", "nama_kegiatan", "tanggal", "tempat", 
    "is_lokasi_active", "status", "created_at", "closed_at",
    "pertanyaan_json"
  ];
  giatSheet.getRange(1, 1, 1, giatHeaders.length).setValues([giatHeaders]);
  giatSheet.getRange(1, 1, 1, giatHeaders.length).setBackground("#C44300").setFontColor("#FFFFFF").setFontWeight("bold");
  giatSheet.autoResizeColumns(1, giatHeaders.length);

  // 3. Tab RESPON (Untuk respon kegiatan yang sedang aktif)
  let responSheet = ss.getSheetByName("RESPON");
  if (!responSheet) {
    responSheet = ss.insertSheet("RESPON");
  }
  responSheet.clear();
  writeResponHeader(responSheet, normalizePertanyaan(null, true));

  // Hapus Sheet1 bawaan jika ada dan tab lain sudah ada
  const sheet1 = ss.getSheetByName("Sheet1");
  if (sheet1 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(sheet1); } catch (e) {}
  }

  Logger.log("✅ Berhasil Setup Database Spreadsheet Rating Giat!");
  return "Database berhasil di-setup lengkap!";
}

/**
 * ============================================================================
 * HANDLER GET REQUEST (doGet)
 * ============================================================================
 */
function doGet(e) {
  try {
    const action = e.parameter.action || "getActiveEvent";
    let result = { status: "error", message: "Aksi tidak dikenali" };

    if (action === "getActiveEvent") {
      result = getActiveEvent();
    } else if (action === "getLiveDisplayData") {
      result = getLiveDisplayData();
    } else if (action === "getMasterSchools") {
      result = { status: "success", schools: getMasterSchoolsList() };
    } else if (action === "checkLogin") {
      const password = e.parameter.password || "";
      result = checkMarshalPassword(password);
    } else if (action === "getMarshalData") {
      const password = e.parameter.password || "";
      if (checkMarshalPassword(password).authenticated) {
        result = getMarshalDashboardData();
      } else {
        result = { status: "error", message: "Password Marshal salah" };
      }
    }

    return respondJSON(result);
  } catch (err) {
    return respondJSON({ status: "error", message: err.toString() });
  }
}

/**
 * ============================================================================
 * HANDLER POST REQUEST (doPost)
 * ============================================================================
 */
function doPost(e) {
  try {
    let postData = {};
    if (e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else {
      postData = e.parameter || {};
    }

    const action = postData.action;
    let result = { status: "error", message: "Aksi tidak dikenali" };

    if (action === "submitRating") {
      result = handleSubmitRating(postData);
    } else if (action === "openEvent") {
      result = handleOpenEvent(postData);
    } else if (action === "closeAndArchiveEvent") {
      result = handleCloseAndArchiveEvent(postData);
    } else if (action === "askGemini") {
      result = handleAskGemini(postData);
    }

    return respondJSON(result);
  } catch (err) {
    return respondJSON({ status: "error", message: err.toString() });
  }
}

/**
 * Format output JSON dengan header CORS
 */
function respondJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ============================================================================
 * LOGIKA KEGIATAN & MARSHAL
 * ============================================================================
 */

function checkMarshalPassword(password) {
  const ss = getSpreadsheet();
  const configSheet = ss.getSheetByName("CONFIG");
  if (!configSheet) return { authenticated: false };

  const data = configSheet.getDataRange().getValues();
  let correctPassword = "";
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === "MARSHAL_PASSWORD") {
      correctPassword = String(data[i][1]).trim();
      break;
    }
  }

  const isMatch = String(password).trim() === correctPassword;
  return { authenticated: isMatch };
}

function formatGasIndoDate(val) {
  if (!val) return "-";
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      const dayName = days[d.getDay()];
      const dd = Utilities.formatDate(d, "Asia/Jakarta", "dd-MM-yyyy");
      return dayName + ", " + dd;
    }
  } catch (e) {}
  return String(val);
}

/**
 * ============================================================================
 * DAFTAR PERTANYAAN (STANDAR / CUSTOM PER KEGIATAN)
 * ============================================================================
 */
const MAX_PERTANYAAN_MUTU = 10;
const MAX_PERTANYAAN_TEMPAT = 5;
const MAX_PANJANG_PERTANYAAN = 150;

const PERTANYAAN_STANDAR = {
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

/**
 * Tata letak kolom Sheet RESPON (index 0-based).
 * Mutu ke-i  : nilai di kolom MUTU_START + 2i, catatan di MUTU_START + 2i + 1 (i = 0..9)
 * Tempat ke-j: nilai di kolom TEMPAT_START + 2j, catatan di TEMPAT_START + 2j + 1 (j = 0..4)
 */
const RCOL = {
  ID: 0, ID_GIAT: 1, TS: 2, MODE: 3, NAMA: 4, SEKOLAH: 5, JABATAN: 6,
  MUTU_START: 7,
  RATA_KEG: 27, BINTANG_KEG: 28,
  TEMPAT_START: 29,
  RATA_TMP: 39, BINTANG_TMP: 40,
  SARAN: 41, REKOM: 42
};
const RESPON_TOTAL_COLS = 43;

function hurufUrut(i) {
  return String.fromCharCode(65 + i); // 0 -> A, 1 -> B, dst.
}

/**
 * Merapikan daftar pertanyaan. Jika kosong / rusak, otomatis memakai pertanyaan standar.
 */
function normalizePertanyaan(raw, isLokasi) {
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = raw ? JSON.parse(raw) : null; } catch (e) { obj = null; }
  }
  const clean = (arr, max) => (Array.isArray(arr) ? arr : [])
    .map(q => String(q || "").trim().substring(0, MAX_PANJANG_PERTANYAAN))
    .filter(q => q)
    .slice(0, max);

  let mutu = clean(obj && obj.mutu, MAX_PERTANYAAN_MUTU);
  let tempat = clean(obj && obj.tempat, MAX_PERTANYAAN_TEMPAT);

  if (mutu.length === 0) mutu = PERTANYAAN_STANDAR.mutu.slice();
  if (isLokasi && tempat.length === 0) tempat = PERTANYAAN_STANDAR.tempat.slice();
  if (!isLokasi) tempat = [];

  const wajibSemuaCatatan = (obj && (obj.wajib_semua_catatan === true || String(obj.wajib_semua_catatan).toLowerCase() === "true"));

  return { mutu: mutu, tempat: tempat, wajib_semua_catatan: wajibSemuaCatatan };
}

/**
 * Menulis ulang baris judul Sheet RESPON sesuai teks pertanyaan kegiatan aktif,
 * sehingga arsip & Gemini AI tahu persis arti setiap kolom.
 */
function writeResponHeader(sheet, pertanyaan) {
  const headers = ["id_respon", "id_kegiatan", "timestamp", "mode_identitas", "nama", "asal_sekolah", "jabatan"];

  for (let i = 0; i < MAX_PERTANYAAN_MUTU; i++) {
    const q = pertanyaan.mutu[i];
    if (q) {
      headers.push("[" + hurufUrut(i) + "] " + q + " - Nilai (1-10)");
      headers.push("[" + hurufUrut(i) + "] " + q + " - Alasan / Catatan");
    } else {
      headers.push("Mutu " + hurufUrut(i) + " (tidak dipakai)");
      headers.push("Catatan Mutu " + hurufUrut(i) + " (tidak dipakai)");
    }
  }
  headers.push("rata_rata_kegiatan", "bintang_kegiatan");

  for (let j = 0; j < MAX_PERTANYAAN_TEMPAT; j++) {
    const q = pertanyaan.tempat[j];
    if (q) {
      headers.push("[Tempat " + hurufUrut(j) + "] " + q + " - Nilai (1-10)");
      headers.push("[Tempat " + hurufUrut(j) + "] " + q + " - Alasan / Catatan");
    } else {
      headers.push("Tempat " + hurufUrut(j) + " (tidak dipakai)");
      headers.push("Catatan Tempat " + hurufUrut(j) + " (tidak dipakai)");
    }
  }
  headers.push("rata_rata_tempat", "bintang_tempat", "saran_masukan", "rekomendasi_topik");

  const clearCols = Math.max(sheet.getMaxColumns(), RESPON_TOTAL_COLS);
  if (sheet.getMaxColumns() < RESPON_TOTAL_COLS) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), RESPON_TOTAL_COLS - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, clearCols).clearContent();
  sheet.getRange(1, 1, 1, RESPON_TOTAL_COLS).setValues([headers]);
  sheet.getRange(1, 1, 1, RESPON_TOTAL_COLS).setBackground("#EA580C").setFontColor("#FFFFFF").setFontWeight("bold");
  sheet.setFrozenRows(1);
}

/**
 * Mengecek apakah Sheet RESPON sudah memakai tata letak baru (slot pertanyaan).
 */
function isResponLayoutBaru(sheet) {
  if (!sheet || sheet.getLastColumn() < RESPON_TOTAL_COLS) return false;
  const header = sheet.getRange(1, 1, 1, RESPON_TOTAL_COLS).getValues()[0];
  return String(header[RCOL.REKOM]).trim() === "rekomendasi_topik";
}

/**
 * Mengubah 1 baris Sheet RESPON menjadi objek rapi (mendukung format lama & baru).
 */
function parseResponRow(r, isBaru, pertanyaan) {
  const res = {
    id_respon: r[RCOL.ID],
    id_kegiatan: r[RCOL.ID_GIAT],
    timestamp: r[RCOL.TS],
    mode: String(r[RCOL.MODE] || ""),
    nama: r[RCOL.NAMA],
    sekolah: r[RCOL.SEKOLAH],
    jabatan: r[RCOL.JABATAN],
    mutu: [],
    tempat: []
  };

  if (isBaru) {
    pertanyaan.mutu.forEach((q, i) => {
      res.mutu.push({ pertanyaan: q, nilai: r[RCOL.MUTU_START + 2 * i], catatan: String(r[RCOL.MUTU_START + 2 * i + 1] || "").trim() });
    });
    pertanyaan.tempat.forEach((q, j) => {
      res.tempat.push({ pertanyaan: q, nilai: r[RCOL.TEMPAT_START + 2 * j], catatan: String(r[RCOL.TEMPAT_START + 2 * j + 1] || "").trim() });
    });
    res.rata_kegiatan = r[RCOL.RATA_KEG];
    res.bintang_kegiatan = r[RCOL.BINTANG_KEG];
    res.rata_tempat = r[RCOL.RATA_TMP];
    res.bintang_tempat = r[RCOL.BINTANG_TMP];
    res.saran = String(r[RCOL.SARAN] || "").trim();
    res.rekomendasi = String(r[RCOL.REKOM] || "").trim();
  } else {
    // Format lama (19 kolom, 4 pertanyaan mutu + 2 tempat, catatan tergabung di saran)
    PERTANYAAN_STANDAR.mutu.forEach((q, i) => {
      res.mutu.push({ pertanyaan: q, nilai: r[7 + i], catatan: "" });
    });
    if (r[13] !== "" && r[13] !== undefined) {
      PERTANYAAN_STANDAR.tempat.forEach((q, j) => {
        res.tempat.push({ pertanyaan: q, nilai: r[13 + j], catatan: "" });
      });
    }
    res.rata_kegiatan = r[11];
    res.bintang_kegiatan = r[12];
    res.rata_tempat = r[15];
    res.bintang_tempat = r[16];
    res.saran = String(r[17] || "").trim();
    res.rekomendasi = String(r[18] || "").trim();
  }
  return res;
}

/**
 * Gabungan catatan per pertanyaan + saran (untuk tabel dashboard & laporan unduhan).
 */
function buildSaranGabungan(p) {
  const lines = [];
  p.mutu.forEach((m, i) => {
    if (m.catatan) lines.push("[" + hurufUrut(i) + ". " + m.pertanyaan + " = " + m.nilai + "] " + m.catatan);
  });
  p.tempat.forEach((t, j) => {
    if (t.catatan) lines.push("[Tempat " + hurufUrut(j) + ". " + t.pertanyaan + " = " + t.nilai + "] " + t.catatan);
  });
  if (p.saran) lines.push((lines.length ? "\nSaran: " : "") + p.saran);
  return lines.join("\n");
}

/**
 * Mengambil daftar SMP resmi dari Sheet 'Master_SMP'
 */
function getMasterSchoolsList() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName("Master_SMP") || ss.getSheetByName("MASTER_SMP") || ss.getSheetByName("master_smp");
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    const schools = [];
    if (data.length > 0) {
      const firstCell = String(data[0][0] || "").toLowerCase();
      const startRow = (firstCell.includes("nama") || firstCell.includes("sekolah") || firstCell.includes("smp")) ? 1 : 0;
      for (let i = startRow; i < data.length; i++) {
        const val = String(data[i][0] || "").trim();
        if (val && !schools.includes(val)) {
          schools.push(val);
        }
      }
      if (schools.length > 0) return schools;
    }
  }

  // Fallback standar SMP se-Kabupaten Karanganyar jika sheet belum ada / kosong
  return [
    "SMPN 1 Karanganyar", "SMPN 2 Karanganyar", "SMPN 3 Karanganyar", "SMPN 4 Karanganyar", "SMPN 5 Karanganyar",
    "SMPN 1 Tasikmadu", "SMPN 2 Tasikmadu",
    "SMPN 1 Jaten", "SMPN 2 Jaten",
    "SMPN 1 Kebakkramat", "SMPN 2 Kebakkramat", "SMPN 3 Kebakkramat",
    "SMPN 1 Colomadu", "SMPN 2 Colomadu",
    "SMPN 1 Gondangrejo", "SMPN 2 Gondangrejo", "SMPN 3 Gondangrejo",
    "SMPN 1 Mojogedang", "SMPN 2 Mojogedang", "SMPN 3 Mojogedang",
    "SMPN 1 Karangpandan", "SMPN 2 Karangpandan",
    "SMPN 1 Matesih", "SMPN 2 Matesih",
    "SMPN 1 Tawangmangu", "SMPN 2 Tawangmangu",
    "SMPN 1 Ngargoyoso", "SMPN 2 Ngargoyoso",
    "SMPN 1 Jumantono", "SMPN 2 Jumantono",
    "SMPN 1 Jumapolo", "SMPN 2 Jumapolo", "SMPN 3 Jumapolo",
    "SMPN 1 Jatipuro", "SMPN 2 Jatipuro",
    "SMPN 1 Jatiyoso", "SMPN 2 Jatiyoso",
    "SMPN 1 Kerjo", "SMPN 2 Kerjo",
    "SMPN 1 Jenawi", "SMPN 2 Jenawi"
  ];
}

/**
 * Mengambil kegiatan yang sedang berstatus 'OPEN'
 */
function getActiveEvent() {
  const ss = getSpreadsheet();
  const giatSheet = ss.getSheetByName("KEGIATAN");
  if (!giatSheet) {
    return { status: "STANDBY", message: "Database belum siap" };
  }

  const data = giatSheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { status: "STANDBY" };
  }

  // Cari dari baris terbawah (terbaru)
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    const status = String(row[5]).toUpperCase().trim();
    if (status === "OPEN") {
      const isLokasi = row[4] === true || String(row[4]).toLowerCase() === "true";
      const configPertanyaan = normalizePertanyaan(row[8], isLokasi);
      return {
        status: "ACTIVE",
        event: {
          id_kegiatan: row[0],
          nama_kegiatan: row[1],
          tanggal: formatGasIndoDate(row[2]),
          tempat: row[3],
          is_lokasi_active: isLokasi,
          pertanyaan: configPertanyaan,
          wajib_semua_catatan: configPertanyaan.wajib_semua_catatan === true
        },
        master_smp: getMasterSchoolsList()
      };
    }
  }

  return { status: "STANDBY" };
}

/**
 * Data khusus Layar Panggung / Proyektor (/live/) - Publik & Cepat
 */
function getLiveDisplayData() {
  const activeEvent = getActiveEvent();
  if (activeEvent.status !== "ACTIVE") {
    return { status: "STANDBY" };
  }

  const ss = getSpreadsheet();
  const responSheet = ss.getSheetByName("RESPON");
  const data = responSheet ? responSheet.getDataRange().getValues() : [];
  const isBaru = isResponLayoutBaru(responSheet);
  const pertanyaan = activeEvent.event.pertanyaan;

  let count = 0;
  let totalBintangKeg = 0;
  let countBintangKeg = 0;
  let totalBintangTmp = 0;
  let countBintangTmp = 0;
  let liveFeedback = [];

  const activeId = activeEvent.event.id_kegiatan;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[1]) !== String(activeId)) continue;
    const p = parseResponRow(r, isBaru, pertanyaan);
    count++;

    const bk = parseFloat(p.bintang_kegiatan);
    if (!isNaN(bk) && bk > 0) {
      totalBintangKeg += bk;
      countBintangKeg++;
    }
    const bt = parseFloat(p.bintang_tempat);
    if (!isNaN(bt) && bt > 0) {
      totalBintangTmp += bt;
      countBintangTmp++;
    }

    if (p.saran && p.saran.length >= 4) {
      liveFeedback.push({
        nama: p.mode === "ANONYMOUS" || p.mode === "RAHASIA" ? "Peserta" : (p.nama ? p.nama.split(" ")[0] : "Peserta"),
        sekolah: p.mode === "ANONYMOUS" || p.mode === "RAHASIA" ? "" : (p.sekolah || ""),
        text: p.saran
      });
    }
  }

  const avgKegiatan = countBintangKeg > 0 ? (totalBintangKeg / countBintangKeg).toFixed(2) : "0.00";
  const avgTempat = countBintangTmp > 0 ? (totalBintangTmp / countBintangTmp).toFixed(2) : "0.00";

  return {
    status: "ACTIVE",
    event: {
      id_kegiatan: activeEvent.event.id_kegiatan,
      nama_kegiatan: activeEvent.event.nama_kegiatan,
      tanggal: activeEvent.event.tanggal,
      tempat: activeEvent.event.tempat,
      is_lokasi_active: activeEvent.event.is_lokasi_active
    },
    metrics: {
      total_responden: count,
      avg_bintang_kegiatan: avgKegiatan,
      avg_bintang_tempat: avgTempat
    },
    ticker_feedback: liveFeedback.slice(-15).reverse()
  };
}

/**
 * Data lengkap dashboard Marshal
 */
function getMarshalDashboardData() {
  const activeEvent = getActiveEvent();
  if (activeEvent.status !== "ACTIVE") {
    return { status: "STANDBY" };
  }

  const ss = getSpreadsheet();
  const responSheet = ss.getSheetByName("RESPON");
  const data = responSheet ? responSheet.getDataRange().getValues() : [];
  const isBaru = isResponLayoutBaru(responSheet);
  const pertanyaan = activeEvent.event.pertanyaan;

  let count = 0;
  let totalBintangKegiatan = 0;
  let countBintangKegiatan = 0;
  let totalBintangTempat = 0;
  let countBintangTempat = 0;
  let recentResponses = [];

  // Akumulator rata-rata per pertanyaan
  const statMutu = pertanyaan.mutu.map(q => ({ pertanyaan: q, total: 0, n: 0 }));
  const statTempat = pertanyaan.tempat.map(q => ({ pertanyaan: q, total: 0, n: 0 }));

  const activeId = activeEvent.event.id_kegiatan;

  // Header ada di baris 0
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[1]) !== String(activeId)) continue;

    const p = parseResponRow(r, isBaru, pertanyaan);
    count++;

    const bintangKeg = parseFloat(p.bintang_kegiatan);
    if (!isNaN(bintangKeg) && bintangKeg > 0) {
      totalBintangKegiatan += bintangKeg;
      countBintangKegiatan++;
    }

    const bintangTmp = parseFloat(p.bintang_tempat);
    if (!isNaN(bintangTmp) && bintangTmp > 0) {
      totalBintangTempat += bintangTmp;
      countBintangTempat++;
    }

    p.mutu.forEach((m, idx) => {
      const v = parseFloat(m.nilai);
      if (statMutu[idx] && !isNaN(v)) { statMutu[idx].total += v; statMutu[idx].n++; }
    });
    p.tempat.forEach((t, idx) => {
      const v = parseFloat(t.nilai);
      if (statTempat[idx] && !isNaN(v)) { statTempat[idx].total += v; statTempat[idx].n++; }
    });

    recentResponses.push({
      id_respon: p.id_respon,
      timestamp: p.timestamp,
      mode: p.mode,
      nama: p.nama,
      sekolah: p.sekolah,
      jabatan: p.jabatan,
      bintang_kegiatan: p.bintang_kegiatan,
      bintang_tempat: p.bintang_tempat,
      nilai_mutu: p.mutu,
      nilai_tempat: p.tempat,
      saran_murni: p.saran,
      saran: buildSaranGabungan(p),
      rekomendasi: p.rekomendasi
    });
  }

  const avgKegiatan = countBintangKegiatan > 0 ? (totalBintangKegiatan / countBintangKegiatan).toFixed(2) : "0.00";
  const avgTempat = countBintangTempat > 0 ? (totalBintangTempat / countBintangTempat).toFixed(2) : "0.00";

  const finalizeStat = (s, idx, prefix) => ({
    label: prefix + hurufUrut(idx),
    pertanyaan: s.pertanyaan,
    rata_rata: s.n > 0 ? (s.total / s.n).toFixed(2) : "0.00",
    jumlah: s.n
  });

  return {
    status: "ACTIVE",
    event: activeEvent.event,
    metrics: {
      total_responden: count,
      avg_bintang_kegiatan: avgKegiatan,
      avg_bintang_tempat: avgTempat,
      is_lokasi_active: activeEvent.event.is_lokasi_active
    },
    question_stats: {
      mutu: statMutu.map((s, idx) => finalizeStat(s, idx, "")),
      tempat: statTempat.map((s, idx) => finalizeStat(s, idx, "Tempat "))
    },
    responses: recentResponses.reverse() // Terbaru di atas
  };
}

/**
 * Membuka Kegiatan Baru oleh Marshal
 */
function handleOpenEvent(params) {
  // Cek auth password
  const auth = checkMarshalPassword(params.password);
  if (!auth.authenticated) {
    return { status: "error", message: "Password Marshal tidak valid" };
  }

  const ss = getSpreadsheet();
  const giatSheet = ss.getSheetByName("KEGIATAN");
  if (!giatSheet) {
    return { status: "error", message: "Sheet KEGIATAN tidak ditemukan" };
  }

  // 1. Tutup semua kegiatan sebelumnya jika ada yang masih OPEN
  const data = giatSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][5]).toUpperCase() === "OPEN") {
      giatSheet.getRange(i + 1, 6).setValue("CLOSED");
      giatSheet.getRange(i + 1, 8).setValue(new Date());
    }
  }

  // 2. Generate ID kegiatan baru: GIAT-YYYYMMDD-HHMM
  const now = new Date();
  const timeStr = Utilities.formatDate(now, "Asia/Jakarta", "yyyyMMdd-HHmm");
  const newId = "GIAT-" + timeStr;

  const isLokasi = params.is_lokasi_active === true || params.is_lokasi_active === "true";
  const wajibSemuaCatatan = params.wajib_semua_catatan === true || params.wajib_semua_catatan === "true";

  // Validasi daftar pertanyaan (standar / custom)
  const rawP = params.pertanyaan || {};
  const rawMutu = (Array.isArray(rawP.mutu) ? rawP.mutu : []).map(q => String(q || "").trim()).filter(q => q);
  const rawTempat = (Array.isArray(rawP.tempat) ? rawP.tempat : []).map(q => String(q || "").trim()).filter(q => q);

  if (rawMutu.length > MAX_PERTANYAAN_MUTU) {
    return { status: "error", message: "Pertanyaan Penilaian Mutu Kegiatan maksimal " + MAX_PERTANYAAN_MUTU + "." };
  }
  if (isLokasi && rawTempat.length > MAX_PERTANYAAN_TEMPAT) {
    return { status: "error", message: "Pertanyaan Penilaian Tempat Acara maksimal " + MAX_PERTANYAAN_TEMPAT + "." };
  }
  const pertanyaan = normalizePertanyaan({ mutu: rawMutu, tempat: rawTempat, wajib_semua_catatan: wajibSemuaCatatan }, isLokasi);

  giatSheet.appendRow([
    newId,
    params.nama_kegiatan,
    params.tanggal,
    params.tempat,
    isLokasi,
    "OPEN",
    now,
    "",
    JSON.stringify(pertanyaan)
  ]);

  // Siapkan Sheet RESPON untuk kegiatan baru
  let responSheet = ss.getSheetByName("RESPON");
  if (!responSheet) {
    responSheet = ss.insertSheet("RESPON");
  }
  // Jika masih ada sisa data yang belum diarsipkan, amankan dulu ke tab arsip
  if (responSheet.getLastRow() > 1) {
    const sisaName = "ARSIP_SISA_" + Utilities.formatDate(now, "Asia/Jakarta", "ddMMyy-HHmmss");
    const sisa = responSheet.copyTo(ss);
    sisa.setName(sisaName);
    sisa.setTabColor("#64748B");
    responSheet.deleteRows(2, responSheet.getLastRow() - 1);
  }
  writeResponHeader(responSheet, pertanyaan);

  return {
    status: "success",
    message: "Kegiatan berhasil dibuka untuk penilaian!",
    event_id: newId
  };
}

/**
 * Menyimpan Penilaian Responden
 */
function handleSubmitRating(params) {
  const ss = getSpreadsheet();
  const responSheet = ss.getSheetByName("RESPON");
  if (!responSheet) {
    return { status: "error", message: "Database respon tidak ditemukan" };
  }

  // Validasi kegiatan aktif
  const activeEvent = getActiveEvent();
  if (activeEvent.status !== "ACTIVE" || activeEvent.event.id_kegiatan !== params.id_kegiatan) {
    return { status: "error", message: "Kegiatan ini sedang tidak aktif atau sudah ditutup!" };
  }

  const now = new Date();
  const idRespon = "RES-" + Utilities.formatDate(now, "Asia/Jakarta", "yyyyMMddHHmmss") + "-" + Math.floor(Math.random() * 899 + 100);

  const pertanyaan = activeEvent.event.pertanyaan;
  const isLokasi = activeEvent.event.is_lokasi_active;

  // Pastikan Sheet RESPON memakai tata letak baru
  if (!isResponLayoutBaru(responSheet)) {
    if (responSheet.getLastRow() <= 1) {
      writeResponHeader(responSheet, pertanyaan);
    } else {
      return { status: "error", message: "Format Sheet RESPON masih versi lama. Panitia perlu melakukan 'Ganti Kegiatan' terlebih dahulu." };
    }
  }

  // Validasi & parse nilai + catatan per pertanyaan
  const parseBagian = (daftar, nilaiArr, catatanArr, namaBagian) => {
    const nilai = Array.isArray(nilaiArr) ? nilaiArr : [];
    const catatan = Array.isArray(catatanArr) ? catatanArr : [];
    const hasil = [];
    for (let i = 0; i < daftar.length; i++) {
      const v = parseInt(nilai[i], 10);
      const c = String(catatan[i] || "").trim();
      if (isNaN(v) || v < 1 || v > 10) {
        return { error: "Nilai " + namaBagian + " poin " + hurufUrut(i) + " wajib dipilih (1 - 10)." };
      }
      // Logika catatan: Wajib jika setting wajib_semua_catatan aktif ATAU nilai <= 7
      const wajibSemua = (pertanyaan.wajib_semua_catatan === true);
      if ((wajibSemua || v <= 7) && !c) {
        return { error: "Alasan / catatan " + namaBagian + " poin " + hurufUrut(i) + " wajib diisi untuk nilai " + v + " (nilai 7 ke bawah wajib menyertakan alasan)." };
      }
      hasil.push({ nilai: v, catatan: c.substring(0, 2000) });
    }
    return { data: hasil };
  };

  const mutu = parseBagian(pertanyaan.mutu, params.nilai_mutu, params.catatan_mutu, "Mutu Kegiatan");
  if (mutu.error) return { status: "error", message: mutu.error };

  let tempat = { data: [] };
  if (isLokasi) {
    tempat = parseBagian(pertanyaan.tempat, params.nilai_tempat, params.catatan_tempat, "Tempat Acara");
    if (tempat.error) return { status: "error", message: tempat.error };
  }

  // Hitung rata-rata sesuai jumlah pertanyaan yang aktif
  const sumMutu = mutu.data.reduce((a, b) => a + b.nilai, 0);
  const rataKegiatan = sumMutu / mutu.data.length;
  const bintangKegiatan = (rataKegiatan / 2).toFixed(2); // Konversi skala 1-10 ke skala 1-5

  let rataTempat = "";
  let bintangTempat = "";
  if (isLokasi && tempat.data.length > 0) {
    const sumTmp = tempat.data.reduce((a, b) => a + b.nilai, 0);
    rataTempat = sumTmp / tempat.data.length;
    bintangTempat = (rataTempat / 2).toFixed(2);
  }

  const mode = String(params.mode_identitas || "SMP").toUpperCase();
  const isAnon = (mode === "ANONYMOUS" || mode === "RAHASIA");
  const nama = isAnon ? "(Anonim)" : (params.nama || "-");
  const sekolah = isAnon ? "(Anonim)" : (params.asal_sekolah || "-");
  const jabatan = isAnon ? "(Anonim)" : (params.jabatan || "-");

  const row = new Array(RESPON_TOTAL_COLS).fill("");
  row[RCOL.ID] = idRespon;
  row[RCOL.ID_GIAT] = params.id_kegiatan;
  row[RCOL.TS] = now;
  row[RCOL.MODE] = mode;
  row[RCOL.NAMA] = nama;
  row[RCOL.SEKOLAH] = sekolah;
  row[RCOL.JABATAN] = jabatan;
  mutu.data.forEach((m, i) => {
    row[RCOL.MUTU_START + 2 * i] = m.nilai;
    row[RCOL.MUTU_START + 2 * i + 1] = m.catatan;
  });
  row[RCOL.RATA_KEG] = rataKegiatan.toFixed(2);
  row[RCOL.BINTANG_KEG] = bintangKegiatan;
  tempat.data.forEach((t, j) => {
    row[RCOL.TEMPAT_START + 2 * j] = t.nilai;
    row[RCOL.TEMPAT_START + 2 * j + 1] = t.catatan;
  });
  row[RCOL.RATA_TMP] = rataTempat !== "" ? rataTempat.toFixed(2) : "";
  row[RCOL.BINTANG_TMP] = bintangTempat;
  row[RCOL.SARAN] = params.saran_masukan || "";
  row[RCOL.REKOM] = params.rekomendasi_topik || "";

  responSheet.appendRow(row);

  return {
    status: "success",
    message: "Terima kasih, penilaian Anda telah tersimpan!",
    bintang_kegiatan: bintangKegiatan,
    bintang_tempat: bintangTempat,
    is_lokasi_active: isLokasi
  };
}

/**
 * Menutup Acara & Mengarsipkan Sheet ke ARSIP_[nama_kegiatan]
 */
function handleCloseAndArchiveEvent(params) {
  // Cek Password
  const auth = checkMarshalPassword(params.password);
  if (!auth.authenticated) {
    return { status: "error", message: "Password Marshal salah! Pengarsipan dibatalkan." };
  }

  const ss = getSpreadsheet();
  const giatSheet = ss.getSheetByName("KEGIATAN");
  const responSheet = ss.getSheetByName("RESPON");

  if (!giatSheet || !responSheet) {
    return { status: "error", message: "Sheet tidak ditemukan" };
  }

  const activeEvent = getActiveEvent();
  if (activeEvent.status !== "ACTIVE") {
    return { status: "error", message: "Tidak ada kegiatan aktif untuk diarsipkan" };
  }

  const eventName = activeEvent.event.nama_kegiatan;
  const now = new Date();

  // 1. Sanitasi Nama Tab Google Sheet (Maks 100 char, buang karakter terlarang: \ / ? * [ ] :)
  let cleanName = eventName.replace(/[\/\\?*\[\]:]/g, "-").trim();
  if (cleanName.length > 70) {
    cleanName = cleanName.substring(0, 70);
  }
  let targetTabName = "ARSIP_" + cleanName;

  // Cek jika tab sudah ada, beri tambahan tanggal jam
  if (ss.getSheetByName(targetTabName)) {
    const timestampStr = Utilities.formatDate(now, "Asia/Jakarta", "ddMMyy-HHmm");
    targetTabName = "ARSIP_" + cleanName.substring(0, 55) + "_" + timestampStr;
  }

  // 2. Duplikasi Sheet RESPON menjadi Tab Arsip Baru
  const archivedSheet = responSheet.copyTo(ss);
  archivedSheet.setName(targetTabName);
  archivedSheet.setTabColor("#7A2000");

  // 3. Kosongkan baris data di Sheet RESPON (pertahankan baris header 1)
  const lastRow = responSheet.getLastRow();
  if (lastRow > 1) {
    responSheet.deleteRows(2, lastRow - 1);
  }

  // 4. Ubah status kegiatan menjadi CLOSED di Tab KEGIATAN
  const giatData = giatSheet.getDataRange().getValues();
  for (let i = 1; i < giatData.length; i++) {
    if (String(giatData[i][0]) === String(activeEvent.event.id_kegiatan)) {
      giatSheet.getRange(i + 1, 6).setValue("CLOSED");
      giatSheet.getRange(i + 1, 8).setValue(now);
      break;
    }
  }

  return {
    status: "success",
    message: "Kegiatan berhasil diarsipkan ke tab '" + targetTabName + "' dan portal kini standby.",
    archived_tab: targetTabName
  };
}

/**
 * ============================================================================
 * ASISTEN GEMINI AI (HANYA MEMBACA KEGIATAN AKTIF SAAT INI)
 * ============================================================================
 */
function handleAskGemini(params) {
  // Cek Password
  const auth = checkMarshalPassword(params.password);
  if (!auth.authenticated) {
    return { status: "error", message: "Autentikasi Marshal gagal" };
  }

  // Ambil API Key dari Script Properties
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) {
    return {
      status: "error",
      message: "GEMINI_API_KEY belum disetel di Script Properties Google Apps Script!"
    };
  }

  const activeEvent = getActiveEvent();
  if (activeEvent.status !== "ACTIVE") {
    return { status: "error", message: "Tidak ada kegiatan aktif yang sedang berjalan." };
  }

  // Ambil respon HANYA untuk kegiatan aktif
  const ss = getSpreadsheet();
  const responSheet = ss.getSheetByName("RESPON");
  const data = responSheet ? responSheet.getDataRange().getValues() : [];
  const isBaru = isResponLayoutBaru(responSheet);
  const pertanyaan = activeEvent.event.pertanyaan;
  const isLokasi = activeEvent.event.is_lokasi_active;

  const activeId = activeEvent.event.id_kegiatan;
  let reviewsText = [];
  let totalRespon = 0;
  let totalBintang = 0;
  let totalBintangTmp = 0;
  let countBintangTmp = 0;
  const statMutu = pertanyaan.mutu.map(() => ({ total: 0, n: 0 }));
  const statTempat = pertanyaan.tempat.map(() => ({ total: 0, n: 0 }));

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[1]) !== String(activeId)) continue;

    const p = parseResponRow(r, isBaru, pertanyaan);
    totalRespon++;
    const wkt = formatGasIndoDate(p.timestamp);
    const isAnon = p.mode === "ANONYMOUS";
    const nama = isAnon ? "(Disamarkan / Mode Anonim)" : String(p.nama || "-");
    const sekolah = isAnon ? "(Disamarkan / Mode Anonim)" : String(p.sekolah || "-");
    const jabatan = String(p.jabatan || "-");
    totalBintang += parseFloat(p.bintang_kegiatan) || 0;

    let rowDesc =
      "Responden #" + totalRespon + " [" + (isAnon ? "MODE: ANONIM" : "IDENTITAS RESMI") + "]:\n" +
      "  • Nama Lengkap: " + nama + "\n" +
      "  • Asal Satuan Pendidikan (SMP): " + sekolah + "\n" +
      "  • Jabatan / Peran: " + jabatan + "\n" +
      "  • Waktu Mengisi: " + wkt + "\n" +
      "  • Penilaian Mutu Kegiatan (skala 1-10):\n";

    p.mutu.forEach((m, idx) => {
      const v = parseFloat(m.nilai);
      if (statMutu[idx] && !isNaN(v)) { statMutu[idx].total += v; statMutu[idx].n++; }
      rowDesc += "      - [" + hurufUrut(idx) + "] " + m.pertanyaan + " = " + m.nilai +
                 (m.catatan ? " | Alasan/Catatan: \"" + m.catatan + "\"" : "") + "\n";
    });
    rowDesc += "      (Rata-rata: " + p.rata_kegiatan + " | Bintang: " + p.bintang_kegiatan + "/5.0)\n";

    if (isLokasi && p.tempat.length > 0) {
      const bt = parseFloat(p.bintang_tempat);
      if (!isNaN(bt) && bt > 0) { totalBintangTmp += bt; countBintangTmp++; }
      rowDesc += "  • Penilaian Tempat Acara (skala 1-10):\n";
      p.tempat.forEach((t, idx) => {
        const v = parseFloat(t.nilai);
        if (statTempat[idx] && !isNaN(v)) { statTempat[idx].total += v; statTempat[idx].n++; }
        rowDesc += "      - [Tempat " + hurufUrut(idx) + "] " + t.pertanyaan + " = " + t.nilai +
                   (t.catatan ? " | Alasan/Catatan: \"" + t.catatan + "\"" : "") + "\n";
      });
      rowDesc += "      (Bintang Tempat: " + p.bintang_tempat + "/5.0)\n";
    }

    rowDesc += "  • Saran & Masukan: " + (p.saran || "-") + "\n" +
               "  • Rekomendasi Topik Depan: " + (p.rekomendasi || "-");

    reviewsText.push(rowDesc);
  }

  if (totalRespon === 0) {
    return {
      status: "success",
      answer: "Belum ada data responden yang masuk untuk kegiatan '" + activeEvent.event.nama_kegiatan + "'. Silakan tunggu hingga peserta mengisi formulir."
    };
  }

  const avgBintang = (totalBintang / totalRespon).toFixed(2);
  const promptUser = params.question || "Buatkan ringkasan eksekutif hasil evaluasi kegiatan ini.";

  // Daftar pertanyaan & rata-rata per pertanyaan
  let daftarPertanyaanText = "DAFTAR PERTANYAAN PENILAIAN MUTU KEGIATAN (" + pertanyaan.mutu.length + " pertanyaan):\n";
  pertanyaan.mutu.forEach((q, idx) => {
    const s = statMutu[idx];
    daftarPertanyaanText += "  [" + hurufUrut(idx) + "] " + q + " -> rata-rata " + (s.n ? (s.total / s.n).toFixed(2) : "-") + " / 10\n";
  });
  if (isLokasi) {
    daftarPertanyaanText += "DAFTAR PERTANYAAN PENILAIAN TEMPAT ACARA (" + pertanyaan.tempat.length + " pertanyaan):\n";
    pertanyaan.tempat.forEach((q, idx) => {
      const s = statTempat[idx];
      daftarPertanyaanText += "  [Tempat " + hurufUrut(idx) + "] " + q + " -> rata-rata " + (s.n ? (s.total / s.n).toFixed(2) : "-") + " / 10\n";
    });
  }

  const contextData = 
    "KONTEKS KEGIATAN AKTIF:\n" +
    "- Nama Kegiatan: " + activeEvent.event.nama_kegiatan + "\n" +
    "- Tanggal: " + activeEvent.event.tanggal + "\n" +
    "- Tempat: " + activeEvent.event.tempat + "\n" +
    "- Evaluasi Tempat Acara Aktif: " + (isLokasi ? "YA" : "TIDAK") + "\n" +
    "- Total Responden: " + totalRespon + " orang\n" +
    "- Rata-rata Bintang Kegiatan: " + avgBintang + " / 5.00\n" +
    (isLokasi ? "- Rata-rata Bintang Tempat: " + (countBintangTmp ? (totalBintangTmp / countBintangTmp).toFixed(2) : "-") + " / 5.00\n" : "") +
    "\n" + daftarPertanyaanText + "\n" +
    "DATA LENGKAP SHEET RESPON (HANYA DARI KEGIATAN INI):\n" +
    reviewsText.slice(0, 150).join("\n\n") + "\n\n" +
    "PERTANYAAN / INSTRUKSI PANITIA:\n" +
    promptUser;

  const systemInstruction = 
    "Anda adalah Asisten Analisis Data Kegiatan Bidang SMP Dinas Pendidikan dan Kebudayaan Kabupaten Karanganyar. " +
    "Data di bawah diambil langsung dan lengkap dari Sheet RESPON Google Spreadsheet untuk kegiatan aktif saat ini. " +
    "Daftar pertanyaan penilaian dapat berbeda di setiap kegiatan (standar atau custom), jadi selalu gunakan teks pertanyaan persis seperti di DAFTAR PERTANYAAN. " +
    "Setiap nilai disertai alasan/catatan dari responden; gunakan catatan tersebut untuk menjelaskan mengapa nilai tinggi atau rendah. " +
    "Jawab pertanyaan panitia secara profesional, ringkas, objektif, dan terstruktur berbasis data tersebut. " +
    "Jika panitia menanyakan nama responden atau sekolah, sebutkan secara jelas dan presisi sesuai data. " +
    "Jangan mengarang data di luar konteks Sheet RESPON yang diberikan.";

  // Konfigurasi Payload Gemini
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: systemInstruction + "\n\n" + contextData }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1000
    }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  // Daftar Model Gemini dengan Fallback Otomatis
  const modelsToTry = [
    { name: "gemini-3.1-flash-lite", label: "Model Utama" },
    { name: "gemini-3.8-flash", label: "Model Cadangan 1" },
    { name: "gemini-3-flash-preview", label: "Model Cadangan 2" }
  ];

  let answer = "";
  let lastError = "";
  let successfulModel = "";

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + currentModel.name + ":generateContent?key=" + apiKey;

    try {
      const response = UrlFetchApp.fetch(apiUrl, options);
      const respCode = response.getResponseCode();
      const respText = response.getContentText();

      if (respCode === 200) {
        const respJson = JSON.parse(respText);
        if (respJson.candidates && respJson.candidates.length > 0 && 
            respJson.candidates[0].content && 
            respJson.candidates[0].content.parts && 
            respJson.candidates[0].content.parts.length > 0) {
          answer = respJson.candidates[0].content.parts[0].text;
          successfulModel = currentModel.name;
          break; // Berhasil! Keluar dari loop fallback
        }
      } else {
        lastError = "Model " + currentModel.name + " (Code " + respCode + "): " + respText;
        Logger.log("⚠️ " + lastError + " -> Mencoba model cadangan berikutnya...");
      }
    } catch (e) {
      lastError = "Koneksi ke " + currentModel.name + ": " + e.toString();
      Logger.log("⚠️ " + lastError + " -> Mencoba model cadangan berikutnya...");
    }
  }

  if (!answer) {
    return {
      status: "error",
      message: "Seluruh model Gemini gagal merespon. Catatan: " + lastError
    };
  }

  return {
    status: "success",
    model_used: successfulModel,
    answer: answer
  };
}

/**
 * ============================================================================
 * TEST KONEKSI GEMINI API (JALANKAN FUNGSI INI DI GOOGLE APPS SCRIPT)
 * Pilih fungsi 'testKoneksiGemini' di menu atas editor GAS, lalu klik Run (▶)
 * ============================================================================
 */
function testKoneksiGemini() {
  Logger.log("🔍 Memeriksa konfigurasi GEMINI_API_KEY...");
  
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (!apiKey) {
    Logger.log("❌ ERROR: GEMINI_API_KEY belum disetel di Script Properties!");
    Logger.log("👉 Buka Project Settings (ikon roda gigi) -> Script Properties -> Add GEMINI_API_KEY");
    return "GAGAL: API Key belum dipasang di Script Properties.";
  }

  Logger.log("🔑 API Key ditemukan: " + apiKey.substring(0, 6) + "..." + apiKey.substring(apiKey.length - 4));

  const modelsToTest = [
    { name: "gemini-3.1-flash-lite", label: "Model Utama" },
    { name: "gemini-3.8-flash", label: "Model Cadangan 1" },
    { name: "gemini-3-flash-preview", label: "Model Cadangan 2" }
  ];

  const testPayload = {
    contents: [
      {
        role: "user",
        parts: [{ text: "Halo Gemini, jawab hanya 3 kata: 'Koneksi Sukses Bidang SMP'" }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 50
    }
  };

  const testOptions = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(testPayload),
    muteHttpExceptions: true
  };

  Logger.log("🚀 Memulai pengujian model...");

  for (let i = 0; i < modelsToTest.length; i++) {
    const m = modelsToTest[i];
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + m.name + ":generateContent?key=" + apiKey;
    const startTime = new Date().getTime();

    try {
      Logger.log("⏳ Menguji " + m.label + " (" + m.name + ")...");
      const resp = UrlFetchApp.fetch(url, testOptions);
      const latency = new Date().getTime() - startTime;
      const code = resp.getResponseCode();
      const text = resp.getContentText();

      if (code === 200) {
        const json = JSON.parse(text);
        const reply = (json.candidates && json.candidates[0].content && json.candidates[0].content.parts[0].text) || "-";
        Logger.log("✅ BERHASIL! Model " + m.name + " aktif.");
        Logger.log("⚡ Kecepatan Respon: " + latency + " ms");
        Logger.log("💬 Balasan AI: \"" + reply.trim() + "\"");
        return "SUKSES: Koneksi Gemini berhasil via " + m.name + " (" + latency + " ms)";
      } else {
        Logger.log("⚠️ GAGAL pada " + m.name + " (Kode " + code + "): " + text);
      }
    } catch (err) {
      Logger.log("❌ Error koneksi pada " + m.name + ": " + err.toString());
    }
  }

  Logger.log("❌ Seluruh model gagal dihubungi. Periksa kuota atau keabsahan API Key Anda.");
  return "GAGAL: Tidak ada model yang merespon dengan sukses.";
}

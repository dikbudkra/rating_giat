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
    "is_lokasi_active", "status", "created_at", "closed_at"
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
  const responHeaders = [
    "id_respon", "id_kegiatan", "timestamp", "mode_identitas",
    "nama", "asal_sekolah", "jabatan",
    "nilai_narasumber", "nilai_materi", "nilai_fasilitas_panitia", "nilai_kepuasan",
    "rata_rata_kegiatan", "bintang_kegiatan",
    "nilai_tempat_fasilitas", "nilai_tempat_pelayanan",
    "rata_rata_tempat", "bintang_tempat",
    "saran_masukan", "rekomendasi_topik"
  ];
  responSheet.getRange(1, 1, 1, responHeaders.length).setValues([responHeaders]);
  responSheet.getRange(1, 1, 1, responHeaders.length).setBackground("#EA580C").setFontColor("#FFFFFF").setFontWeight("bold");
  responSheet.autoResizeColumns(1, responHeaders.length);

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
      return {
        status: "ACTIVE",
        event: {
          id_kegiatan: row[0],
          nama_kegiatan: row[1],
          tanggal: row[2],
          tempat: row[3],
          is_lokasi_active: row[4] === true || String(row[4]).toLowerCase() === "true"
        }
      };
    }
  }

  return { status: "STANDBY" };
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

  let count = 0;
  let totalBintangKegiatan = 0;
  let countBintangKegiatan = 0;
  let totalBintangTempat = 0;
  let countBintangTempat = 0;
  let recentResponses = [];

  const activeId = activeEvent.event.id_kegiatan;

  // Header ada di baris 0
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[1]) === String(activeId)) {
      count++;
      const bintangKeg = parseFloat(r[12]);
      if (!isNaN(bintangKeg) && bintangKeg > 0) {
        totalBintangKegiatan += bintangKeg;
        countBintangKegiatan++;
      }

      const bintangTmp = parseFloat(r[16]);
      if (!isNaN(bintangTmp) && bintangTmp > 0) {
        totalBintangTempat += bintangTmp;
        countBintangTempat++;
      }

      recentResponses.push({
        id_respon: r[0],
        timestamp: r[2],
        mode: r[3],
        nama: r[4],
        sekolah: r[5],
        jabatan: r[6],
        bintang_kegiatan: r[12],
        bintang_tempat: r[16],
        saran: r[17],
        rekomendasi: r[18]
      });
    }
  }

  const avgKegiatan = countBintangKegiatan > 0 ? (totalBintangKegiatan / countBintangKegiatan).toFixed(2) : "0.00";
  const avgTempat = countBintangTempat > 0 ? (totalBintangTempat / countBintangTempat).toFixed(2) : "0.00";

  return {
    status: "ACTIVE",
    event: activeEvent.event,
    metrics: {
      total_responden: count,
      avg_bintang_kegiatan: avgKegiatan,
      avg_bintang_tempat: avgTempat,
      is_lokasi_active: activeEvent.event.is_lokasi_active
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

  giatSheet.appendRow([
    newId,
    params.nama_kegiatan,
    params.tanggal,
    params.tempat,
    isLokasi,
    "OPEN",
    now,
    ""
  ]);

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

  // Parse Skor Kegiatan
  const skorA = parseFloat(params.nilai_narasumber) || 0;
  const skorB = parseFloat(params.nilai_materi) || 0;
  const skorC = parseFloat(params.nilai_fasilitas_panitia) || 0;
  const skorD = parseFloat(params.nilai_kepuasan) || 0;

  const rataKegiatan = ((skorA + skorB + skorC + skorD) / 4);
  const bintangKegiatan = (rataKegiatan / 2).toFixed(2); // Konversi skala 1-10 ke skala 1-5

  // Parse Skor Tempat (jika aktif)
  let skorTmpFas = "";
  let skorTmpPel = "";
  let rataTempat = "";
  let bintangTempat = "";

  if (activeEvent.event.is_lokasi_active) {
    skorTmpFas = parseFloat(params.nilai_tempat_fasilitas) || 0;
    skorTmpPel = parseFloat(params.nilai_tempat_pelayanan) || 0;
    rataTempat = ((skorTmpFas + skorTmpPel) / 2);
    bintangTempat = (rataTempat / 2).toFixed(2);
  }

  const isAnon = params.mode_identitas === "ANONYMOUS";
  const nama = isAnon ? "(Anonim)" : (params.nama || "-");
  const sekolah = isAnon ? "(Anonim)" : (params.asal_sekolah || "-");
  const jabatan = isAnon ? "(Anonim)" : (params.jabatan || "-");

  responSheet.appendRow([
    idRespon,
    params.id_kegiatan,
    now,
    params.mode_identitas,
    nama,
    sekolah,
    jabatan,
    skorA,
    skorB,
    skorC,
    skorD,
    rataKegiatan.toFixed(2),
    bintangKegiatan,
    skorTmpFas,
    skorTmpPel,
    rataTempat !== "" ? rataTempat.toFixed(2) : "",
    bintangTempat,
    params.saran_masukan || "",
    params.rekomendasi_topik || ""
  ]);

  return {
    status: "success",
    message: "Terima kasih, penilaian Anda telah tersimpan!",
    bintang_kegiatan: bintangKegiatan,
    bintang_tempat: bintangTempat,
    is_lokasi_active: activeEvent.event.is_lokasi_active
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

  const activeId = activeEvent.event.id_kegiatan;
  let reviewsText = [];
  let totalRespon = 0;
  let totalBintang = 0;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[1]) === String(activeId)) {
      totalRespon++;
      const bintang = r[12];
      totalBintang += parseFloat(bintang) || 0;
      const saran = r[17] ? String(r[17]).trim() : "-";
      const rekomendasi = r[18] ? String(r[18]).trim() : "-";

      reviewsText.push(
        "- Responden #" + totalRespon + " (" + r[6] + "): " +
        "Bintang Keg: " + bintang + "/5.0. " +
        (activeEvent.event.is_lokasi_active ? ("Bintang Tempat: " + r[16] + "/5.0. ") : "") +
        "Saran: \"" + saran + "\". Rekomendasi Topik: \"" + rekomendasi + "\""
      );
    }
  }

  if (totalRespon === 0) {
    return {
      status: "success",
      answer: "Belum ada data responden yang masuk untuk kegiatan '" + activeEvent.event.nama_kegiatan + "'. Silakan tunggu hingga peserta mengisi formulir."
    };
  }

  const avgBintang = (totalBintang / totalRespon).toFixed(2);
  const promptUser = params.question || "Buatkan ringkasan eksekutif hasil evaluasi kegiatan ini.";

  const contextData = 
    "KONTEKS KEGIATAN:\n" +
    "- Nama Kegiatan: " + activeEvent.event.nama_kegiatan + "\n" +
    "- Tanggal: " + activeEvent.event.tanggal + "\n" +
    "- Tempat: " + activeEvent.event.tempat + "\n" +
    "- Penilaian Fasilitas Tempat Aktif: " + (activeEvent.event.is_lokasi_active ? "YA" : "TIDAK") + "\n" +
    "- Total Responden: " + totalRespon + " orang\n" +
    "- Rata-rata Bintang Kegiatan: " + avgBintang + " / 5.00\n\n" +
    "DATA MASUKAN PESERTA (HANYA DARI KEGIATAN INI):\n" +
    reviewsText.slice(0, 150).join("\n") + "\n\n" +
    "PERTANYAAN / INSTRUKSI PANITIA:\n" +
    promptUser;

  const systemInstruction = 
    "Anda adalah Asisten Analisis Data Kegiatan Bidang SMP Dinas Pendidikan dan Kebudayaan Kabupaten Karanganyar. " +
    "Jawab pertanyaan secara profesional, ringkas, terstruktur menggunakan bullet points, dan objektif berbasis data di atas. " +
    "JANGAN mengarang data di luar konteks masukan peserta yang diberikan.";

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

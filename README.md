# Rating Giat - Bidang SMP Dinas Pendidikan dan Kebudayaan Kabupaten Karanganyar

Aplikasi web modern evaluasi dan penilaian kegiatan kedinasan multi-event untuk Bidang Pembinaan SMP Dinas Pendidikan dan Kebudayaan Kabupaten Karanganyar.

---

## 📁 Struktur Berkas

```text
Peniliaian Kegiatan SMP/
├── index.html              # Halaman Publik Responden (Splash Screen, Standby, Form, Dual Stars)
├── marshal/
│   └── index.html          # Panel Admin Marshal (Live Counter, Buka/Tutup, Jemprot AI, Export)
├── assets/
│   ├── css/
│   │   └── style.css       # Styling tema Terracotta Kedinasan & animasi
│   └── js/
│       ├── config.js       # Konfigurasi URL Google Apps Script Web App
│       ├── app.js          # Logika responden & anti-spam mutlak
│       ├── marshal.js      # Logika admin & chat widget Jemprot AI
│       └── export.js       # Generator laporan resmi PDF & DOCX
├── backend_gas/
│   └── Code.gs             # Backend Google Apps Script (Spreadsheet & Gemini Proxy)
└── README.md               # Dokumentasi instalasi & panduan deploy
```

---

## ⚙️ Panduan Langkah Demi Langkah

### 1. Setup Backend Google Apps Script (GAS Standalone)
1. Buka [script.google.com](https://script.google.com) dan klik **Proyek Baru**.
2. Beri nama proyek, misalnya: `Backend Rating Giat SMP`.
3. Salin seluruh isi file [`backend_gas/Code.gs`](file:///home/bayusigit/Project%20JP/Peniliaian%20Kegiatan%20SMP/backend_gas/Code.gs) dan tempel ke editor `Code.gs`.
4. Pastikan baris `const SPREADSHEET_ID` adalah ID Spreadsheet Anda:  
   `1JZ0trXpmL6s2Fsu4yd-aLcFoEOO6SkLdyTjh9ziBy30`
5. **Jalankan Setup Otomatis:**
   * Pada dropdown fungsi di atas editor, pilih fungsi **`setupDatabase`** lalu klik **Jalankan (Run)**.
   * Berikan izin akses (*Review Permissions*).
   * Spreadsheet Anda seketika akan terisi tab `CONFIG`, `KEGIATAN`, dan `RESPON` secara otomatis!
6. **Setel Gemini API Key (Aman):**
   * Di menu kiri Apps Script, klik ikon roda gigi ⚙️ **Project Settings**.
   * Gulir ke bawah ke bagian **Script Properties**, klik **Add script property**.
   * Property: `GEMINI_API_KEY`
   * Value: `[Tempel API Key Gemini Anda di sini]`
   * Klik **Save script properties**.
7. **Deploy sebagai Web App:**
   * Klik tombol biru **Deploy** di pojok kanan atas > **New deployment**.
   * Pilih tipe: **Web app**.
   * Configuration:
     * *Description:* `Versi 1.0`
     * *Execute as:* **Me (email Anda)**
     * *Who has access:* **Anyone** (agar peserta dapat mengirim respon tanpa perlu login akun Google).
   * Klik **Deploy**, lalu salin **Web app URL** yang dihasilkan.
8. Buka file [`assets/js/config.js`](file:///home/bayusigit/Project%20JP/Peniliaian%20Kegiatan%20SMP/assets/js/config.js), tempelkan URL tersebut pada properti `GAS_WEB_APP_URL`.

---

### 2. Panduan Pengaturan GitHub Pages

Untuk mempublikasikan aplikasi ini di GitHub:
1. Push repositori ini ke `https://github.com/dikbudkra/rating_giat`.
2. Buka repositori Anda di browser: `https://github.com/dikbudkra/rating_giat`.
3. Klik tab **Settings** (ikon roda gigi di kanan atas repositori).
4. Di bilah menu sebelah kiri, klik menu **Pages** (di bawah kategori *Code and automation*).
5. Pada bagian **Build and deployment**:
   * **Source:** Pilih **`Deploy from a branch`**.
   * **Branch:** Pilih branch **`main`** (atau `master`).
   * **Folder:** Biarkan pada pilihan default **`/(root)`**.
   * Klik tombol **Save**.
6. Tunggu sekitar 1–2 menit hingga GitHub selesai memproses.
7. Alamat web Anda akan aktif secara langsung pada:
   * **Web Publik Responden:** `https://dikbudkra.github.io/rating_giat/`
   * **Panel Admin Marshal:** `https://dikbudkra.github.io/rating_giat/marshal/`

---

## 🔒 Kata Sandi Default Marshal
* Password awal di database: **`smp2026`**
* Dapat diubah sewaktu-waktu langsung melalui tab **`CONFIG`** pada Google Spreadsheet Anda.

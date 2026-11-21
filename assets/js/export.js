/**
 * RATING GIAT - EXPORT ENGINE (PDF & DOCX)
 */

window.ExportEngine = {
  pdfDownloaded: false,
  docxDownloaded: false,

  /**
   * Membersihkan tanda markdown mentah (**bold**, *italic*, # heading, dll.)
   * agar rapi saat dicetak ke PDF maupun DOCX.
   */
  cleanMarkdownText(text) {
    if (!text) return "";
    return String(text)
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*\n]+)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^\s*[\*-]\s+/gm, "• ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  },

  /**
   * Helper membersihkan teks Saran & Masukan umum dari tag format lama
   */
  extractCleanSaran(r) {
    if (!r) return "";
    const rawSaran = String(r.saran_murni || r.saran || "").trim();
    const cleanSaran = rawSaran
      .replace(/\[(?:Tempat\s+)?[A-Z]\.[^\]]+\][^\n\r]*/gi, "")
      .replace(/^Saran:\s*/gim, "")
      .replace(/[\n\r]+/g, " ")
      .trim();
    return (cleanSaran && cleanSaran !== "-" && cleanSaran !== '""') ? cleanSaran : "";
  },

  /**
   * Helper format Komentar Peserta per indikator pertanyaan (tanpa saran umum)
   */
  formatFeedback(r, qStats) {
    if (!r) return "-";
    const items = [];
    const mutuList = (qStats && Array.isArray(qStats.mutu)) ? qStats.mutu : [];
    const tempatList = (qStats && Array.isArray(qStats.tempat)) ? qStats.tempat : [];

    // 1. Catatan Evaluasi Penilaian (dari data terstruktur)
    if (Array.isArray(r.nilai_mutu)) {
      r.nilai_mutu.forEach((m, idx) => {
        const c = (m.catatan || "").trim();
        if (c) {
          const huruf = String.fromCharCode(65 + idx);
          const indikator = m.pertanyaan || (mutuList[idx] && mutuList[idx].pertanyaan) || `Poin ${huruf}`;
          items.push(`• ${indikator} (${m.nilai}): ${c}`);
        }
      });
    }
    if (Array.isArray(r.nilai_tempat)) {
      r.nilai_tempat.forEach((t, jdx) => {
        const c = (t.catatan || "").trim();
        if (c) {
          const huruf = String.fromCharCode(65 + jdx);
          const indikator = t.pertanyaan || (tempatList[jdx] && tempatList[jdx].pertanyaan) || `Tempat ${huruf}`;
          items.push(`• ${indikator} (${t.nilai}): ${c}`);
        }
      });
    }

    // Fallback jika data lama dan items masih kosong
    const rawSaran = String(r.saran_murni || r.saran || "").trim();
    if (items.length === 0 && rawSaran.includes("[")) {
      const lines = rawSaran.split(/[\r\n]+/);
      lines.forEach(line => {
        const match = line.match(/\[([A-Z])\.\s*([^=\]]+)=\s*(\d+)\]\s*(.*)/i);
        const matchTempat = line.match(/\[Tempat\s+([A-Z])\.\s*([^=\]]+)=\s*(\d+)\]\s*(.*)/i);
        if (matchTempat) {
          const label = matchTempat[2].trim() || `Tempat ${matchTempat[1].toUpperCase()}`;
          items.push(`• ${label} (${matchTempat[3]}): ${matchTempat[4].trim()}`);
        } else if (match) {
          const label = match[2].trim() || `Poin ${match[1].toUpperCase()}`;
          items.push(`• ${label} (${match[3]}): ${match[4].trim()}`);
        }
      });
    }

    return items.length > 0 ? items.join("\n") : "-";
  },

  /**
   * Helper format kolom Saran, Masukan & Rekomendasi Topik
   */
  formatSaranAndRekomendasi(r) {
    if (!r) return "-";
    const saran = this.extractCleanSaran(r);
    const rekomRaw = String(r.rekomendasi || "").trim();
    const rekom = (rekomRaw && rekomRaw !== "-" && rekomRaw !== '""') ? rekomRaw : "";

    if (!saran && !rekom) return "-";
    return `Saran & Masukan: ${saran || "-"}\nRekomendasi Topik: ${rekom || "-"}`;
  },

  /**
   * Unduh Laporan PDF Resmi
   */
  async downloadPDF(dashboardData, aiSummary) {
    if (!dashboardData || !dashboardData.event) {
      alert("Tidak ada data kegiatan aktif untuk diunduh!");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const event = dashboardData.event;
    const metrics = dashboardData.metrics;
    const responses = dashboardData.responses || [];

    // Header Laporan
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(122, 32, 0); // Terracotta
    doc.text("LAPORAN HASIL PENILAIAN KEGIATAN", 105, 18, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Bidang SMP - Dinas Pendidikan dan Kebudayaan Kabupaten Karanganyar", 105, 24, { align: "center" });

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(14, 28, 196, 28);

    // Tabel Info Kegiatan & Ringkasan Metrik
    const eventDetails = [
      ["Nama Kegiatan", ": " + event.nama_kegiatan],
      ["Tanggal Pelaksanaan", ": " + (typeof formatDateIndo === "function" ? formatDateIndo(event.tanggal) : event.tanggal)],
      ["Tempat / Lokasi", ": " + event.tempat],
      ["Jumlah Responden", ": " + metrics.total_responden + " Orang"],
      ["Rata-rata Skor Kegiatan", ": " + metrics.avg_bintang_kegiatan + " / 5.00 Bintang"],
      ["Rata-rata Skor Tempat", ": " + (metrics.is_lokasi_active ? (metrics.avg_bintang_tempat + " / 5.00 Bintang") : "Tidak Diaktifkan")]
    ];

    doc.autoTable({
      startY: 32,
      body: eventDetails,
      theme: "plain",
      styles: { fontSize: 9.5, cellPadding: 1.5, textColor: [30, 41, 59] },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 45 }, 1: { cellWidth: 135 } }
    });

    let currentY = doc.lastAutoTable.finalY + 6;

    // Bagian Rapor Skor Evaluasi per Aspek Pertanyaan
    const qStats = dashboardData.question_stats || { mutu: [], tempat: [] };
    const aspectRows = [];

    if (qStats.mutu && qStats.mutu.length > 0) {
      qStats.mutu.forEach(m => {
        const starVal = (parseFloat(m.rata_rata) / 2).toFixed(2);
        aspectRows.push([m.label, m.pertanyaan, m.rata_rata + " / 10", starVal + " / 5.00"]);
      });
    }

    if (metrics.is_lokasi_active && qStats.tempat && qStats.tempat.length > 0) {
      qStats.tempat.forEach(t => {
        const starVal = (parseFloat(t.rata_rata) / 2).toFixed(2);
        aspectRows.push([t.label, t.pertanyaan, t.rata_rata + " / 10", starVal + " / 5.00"]);
      });
    }

    if (aspectRows.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(122, 32, 0);
      doc.text("Rapor Skor Evaluasi per Aspek Indikator", 14, currentY);

      doc.autoTable({
        startY: currentY + 3,
        head: [["Poin", "Aspek / Indikator Pertanyaan", "Skor (1-10)", "Konversi Bintang"]],
        body: aspectRows,
        theme: "grid",
        headStyles: { fillColor: [122, 32, 0], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 18, halign: "center", fontStyle: "bold" },
          1: { cellWidth: 105 },
          2: { cellWidth: 28, halign: "center" },
          3: { cellWidth: 29, halign: "center", fontStyle: "bold" }
        }
      });

      currentY = doc.lastAutoTable.finalY + 6;
    }

    // Bagian Rangkuman Asisten Jemprot AI (Jika Ada)
    if (aiSummary && aiSummary.trim() !== "") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(126, 34, 206); // Ungu Gemini
      doc.text("Rangkuman Penilaian Kegiatan", 14, currentY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);

      const cleanSummary = this.cleanMarkdownText(aiSummary);
      const splitSummary = doc.splitTextToSize(cleanSummary, 182);
      doc.text(splitSummary, 14, currentY + 5, {
        maxWidth: 182,
        align: "left"
      });

      currentY = currentY + 7 + (splitSummary.length * 4.2);
    }

    // Tabel Respon & Masukan Peserta
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(122, 32, 0);
    doc.text("Rekapitulasi Masukan dan Evaluasi Peserta", 14, currentY);

    const tableRows = responses.map((r, idx) => [
      idx + 1,
      r.mode === "ANONYMOUS" || r.mode === "RAHASIA" ? "(Anonim)" : r.nama,
      r.mode === "ANONYMOUS" || r.mode === "RAHASIA" ? "-" : r.sekolah,
      r.bintang_kegiatan + " / 5.00",
      this.formatFeedback(r, qStats),
      this.formatSaranAndRekomendasi(r)
    ]);

    doc.autoTable({
      startY: currentY + 3,
      head: [["No", "Nama", "Asal Instansi / Sekolah", "Nilai", "Komentar Peserta", "Saran, Masukan & Rekomendasi Topik"]],
      body: tableRows,
      theme: "striped",
      headStyles: { fillColor: [196, 67, 0], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
      styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: 8, halign: "center" },
        1: { cellWidth: 26 },
        2: { cellWidth: 28 },
        3: { cellWidth: 16, halign: "center" },
        4: { cellWidth: 58 },
        5: { cellWidth: 44 }
      }
    });

    // Simpan File PDF
    const cleanFileName = `Rekap_Evaluasi_${event.nama_kegiatan.replace(/[\/\\?*\[\]:]/g, "-")}.pdf`;
    doc.save(cleanFileName);

    // Tandai sudah terunduh
    this.pdfDownloaded = true;
    this.updateExportStatus();
  },

  /**
   * Unduh Laporan Format DOCX / Word
   */
  downloadDOCX(dashboardData, aiSummary) {
    if (!dashboardData || !dashboardData.event) {
      alert("Tidak ada data kegiatan aktif untuk diunduh!");
      return;
    }

    const event = dashboardData.event;
    const metrics = dashboardData.metrics;
    const responses = dashboardData.responses || [];

    // Buat Dokumen Word berbasis HTML Blob resmi (.doc / .docx compatible)
    const qStats = dashboardData.question_stats || { mutu: [], tempat: [] };
    let aspectRowsHtml = "";

    if (qStats.mutu && qStats.mutu.length > 0) {
      qStats.mutu.forEach(m => {
        const starVal = (parseFloat(m.rata_rata) / 2).toFixed(2);
        aspectRowsHtml += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold;">${m.label}</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${m.pertanyaan}</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${m.rata_rata} / 10</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold;">${starVal} ★</td>
          </tr>
        `;
      });
    }

    if (metrics.is_lokasi_active && qStats.tempat && qStats.tempat.length > 0) {
      qStats.tempat.forEach(t => {
        const starVal = (parseFloat(t.rata_rata) / 2).toFixed(2);
        aspectRowsHtml += `
          <tr>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold;">${t.label}</td>
            <td style="border: 1px solid #ddd; padding: 6px;">${t.pertanyaan}</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${t.rata_rata} / 10</td>
            <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-weight: bold;">${starVal} ★</td>
          </tr>
        `;
      });
    }

    let rowsHtml = "";
    responses.forEach((r, idx) => {
      const isAnon = (r.mode === "ANONYMOUS" || r.mode === "RAHASIA");
      const komentarHtml = this.formatFeedback(r, qStats).replace(/\n/g, "<br/>");
      const saranRekomHtml = this.formatSaranAndRekomendasi(r).replace(/\n/g, "<br/>");
      rowsHtml += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center;">${idx + 1}</td>
          <td style="border: 1px solid #ddd; padding: 6px;">${isAnon ? "<i>(Anonim)</i>" : r.nama}</td>
          <td style="border: 1px solid #ddd; padding: 6px;">${isAnon ? "-" : r.sekolah}</td>
          <td style="border: 1px solid #ddd; padding: 6px; text-align: center;"><b>${r.bintang_kegiatan} ★</b></td>
          <td style="border: 1px solid #ddd; padding: 6px;">${komentarHtml || "-"}</td>
          <td style="border: 1px solid #ddd; padding: 6px;">${saranRekomHtml || "-"}</td>
        </tr>
      `;
    });

    const docContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Laporan Hasil Penilaian Kegiatan</title>
        <style>
          body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; color: #333; line-height: 1.4; }
          h2 { color: #7A2000; text-align: center; margin-bottom: 2px; }
          .sub { text-align: center; color: #666; font-size: 10pt; margin-top: 0; }
          hr { border: 0; border-top: 1.5px solid #C44300; margin: 15px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background-color: #C44300; color: #ffffff; padding: 8px; border: 1px solid #bbb; text-align: left; }
          .ai-box { background: #FAF5FF; border-left: 4px solid #9333EA; padding: 10px; margin: 15px 0; font-size: 10pt; text-align: justify; }
        </style>
      </head>
      <body>
        <h2>LAPORAN HASIL PENILAIAN KEGIATAN</h2>
        <p class='sub'>Bidang SMP - Dinas Pendidikan dan Kebudayaan Kabupaten Karanganyar</p>
        <hr/>

        <h3>A. Informasi Kegiatan</h3>
        <table style="width: 80%; border: none;">
          <tr><td width="30%"><b>Nama Kegiatan</b></td><td>: ${event.nama_kegiatan}</td></tr>
          <tr><td><b>Tanggal Pelaksanaan</b></td><td>: ${typeof formatDateIndo === "function" ? formatDateIndo(event.tanggal) : event.tanggal}</td></tr>
          <tr><td><b>Tempat / Lokasi</b></td><td>: ${event.tempat}</td></tr>
          <tr><td><b>Total Responden</b></td><td>: ${metrics.total_responden} Orang</td></tr>
          <tr><td><b>Skor Rata-rata Kegiatan</b></td><td>: <b>${metrics.avg_bintang_kegiatan} / 5.00 Bintang</b></td></tr>
          <tr><td><b>Skor Rata-rata Tempat</b></td><td>: ${metrics.is_lokasi_active ? `<b>${metrics.avg_bintang_tempat} / 5.00 Bintang</b>` : "Tidak Diaktifkan"}</td></tr>
        </table>

        ${aspectRowsHtml ? `
        <h3>B. Rapor Skor Evaluasi per Aspek Indikator</h3>
        <table>
          <thead>
            <tr>
              <th width="10%" style="text-align: center;">Poin</th>
              <th width="50%">Aspek / Indikator Pertanyaan</th>
              <th width="20%" style="text-align: center;">Skor Rata-rata (1-10)</th>
              <th width="20%" style="text-align: center;">Konversi Bintang (1-5)</th>
            </tr>
          </thead>
          <tbody>
            ${aspectRowsHtml}
          </tbody>
        </table>` : ""}

        ${aiSummary ? `
        <div class="ai-box">
          <h4 style="color: #6B21A8; margin-top: 0;">Rangkuman Penilaian Kegiatan</h4>
          <p style="text-align: left; margin-bottom: 0;">${this.cleanMarkdownText(aiSummary).replace(/\n/g, "<br/>")}</p>
        </div>` : ""}

        <h3>${aspectRowsHtml ? "C" : "B"}. Rekapitulasi Masukan dan Umpan Balik Peserta</h3>
        <table>
          <thead>
            <tr>
              <th width="5%" style="text-align: center;">No</th>
              <th width="18%">Nama</th>
              <th width="17%">Asal Sekolah / Instansi</th>
              <th width="10%" style="text-align: center;">Nilai</th>
              <th width="28%">Komentar Peserta</th>
              <th width="22%">Saran, Masukan & Rekomendasi Topik</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(["\ufeff", docContent], {
      type: "application/msword"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Rekap_Evaluasi_${event.nama_kegiatan.replace(/[\/\\?*\[\]:]/g, "-")}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Tandai sudah terunduh
    this.docxDownloaded = true;
    this.updateExportStatus();
  },

  /**
   * Update visual indikator unduh dan tombol reset
   */
  updateExportStatus() {
    const pdfBadge = document.getElementById("badge-pdf-downloaded");
    const docxBadge = document.getElementById("badge-docx-downloaded");
    const resetBtn = document.getElementById("btn-trigger-reset");

    if (this.pdfDownloaded && pdfBadge) {
      pdfBadge.classList.remove("hidden");
    }
    if (this.docxDownloaded && docxBadge) {
      docxBadge.classList.remove("hidden");
    }

    if (typeof window.updateModalGantiStatus === "function") {
      window.updateModalGantiStatus();
    }
  }
};

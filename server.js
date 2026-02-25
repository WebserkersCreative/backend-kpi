// ========================= IMPORT MODULE =========================
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// ========================= CORS =========================
const FRONTEND_URL = "https://webserkerscreative.github.io";

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Handle preflight (OPTIONS)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", FRONTEND_URL);
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.sendStatus(200);
  }
  next();
});

// ========================= BODY PARSER =========================
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ========================= MULTER =========================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ========================= DEFAULT ROUTE =========================
app.get("/", (req, res) => {
  res.send("<h1>Ini adalah API Indikator KPI</h1>");
});

// ========================= REGISTER =========================
app.post("/api/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({
        result: "error",
        message: "Email, password, dan nama wajib diisi!",
      });
    }

    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "register",
      email,
      password,
      name,
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ Error register:", error.message);
    res.status(500).json({
      result: "error",
      message: "Terjadi kesalahan saat registrasi.",
    });
  }
});

// ========================= LOGIN =========================
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "login",
      email,
      password,
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ Error login:", error.message);
    res.status(500).json({
      result: "error",
      message: "Terjadi kesalahan saat login.",
    });
  }
});

// ========================= KPI BATCH (Solusi 2: JSON Only) =========================
app.post("/api/kpi-batch", async (req, res) => {
  try {
    // 1. Ambil data dari Body (Sekarang murni JSON, indikator_list berisi URL bukti)
    const { email, password, nama, divisi, unit, tanda_tangan, indikator_list } = req.body;

    // 2. Validasi Input Dasar
    if (!email || !nama || !Array.isArray(indikator_list) || indikator_list.length === 0) {
      return res.status(400).json({
        result: "error",
        message: "Data tidak lengkap atau daftar indikator kosong.",
      });
    }

    // 3. Ambil Master Data Indikator dari GAS untuk Validasi
    const indikatorResponse = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "getIndikatorData",
    });

    if (indikatorResponse.data.result !== "success") {
      return res.status(500).json({
        result: "error",
        message: "Gagal mengambil master data indikator.",
      });
    }

    const indikatorMaster = indikatorResponse.data.message || [];

    // 4. Loop Validasi: Pastikan item KPI valid & Target tidak dimanipulasi
    for (const item of indikator_list) {
      const master = indikatorMaster.find(
        (m) => m.nama === nama && m.indikator_kpi === item.indikator_kpi
      );

      if (!master) {
        return res.status(400).json({
          result: "error",
          message: `Indikator "${item.indikator_kpi}" tidak ditemukan di data master karyawan tersebut.`,
        });
      }

      // Validasi Target (Pencegahan manipulasi frontend)
      const targetAsli = String(master.target || "").toLowerCase();
      const targetDikirim = String(item.target || "").toLowerCase();
      const isFluktuatif = targetAsli.includes("fluktuatif");

      if (!isFluktuatif && targetAsli !== targetDikirim) {
        return res.status(400).json({
          result: "error",
          message: `Target untuk indikator "${item.indikator_kpi}" tidak boleh diubah. Target asli: "${master.target}".`,
        });
      }
    }

    // 5. Kirim Payload ke Google Apps Script
    // Kita forward data 'indikator_list' apa adanya (karena sudah berisi URL bukti dari GAS)
    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "kpiBatch",
      email,
      password,
      nama,
      divisi,
      unit,
      tanda_tangan,
      indikator_list, // Isi: [{ ..., bukti_nilai: "https://drive.google.com/..." }, ...]
    });

    // 6. Kembalikan Respon GAS ke Frontend
    res.json(response.data);

  } catch (err) {
    console.error("❌ Error KPI Batch:", err.message);

    // Handle error response dari Axios (jika GAS down/error)
    if (err.response) {
       return res.status(err.response.status).json({
         result: "error",
         message: "Error dari Google Script: " + (err.response.data.message || err.message)
       });
    }

    res.status(500).json({
      result: "error",
      message: "Terjadi kesalahan internal server saat mengirim KPI.",
    });
  }
});

// ========================= GET INDIKATOR =========================
app.get("/api/indikator-data", async (req, res) => {
  try {
    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "getIndikatorData",
    });
    res.json(response.data);
  } catch (error) {
    console.error("❌ Error indikator:", error.message);
    res.status(500).json({
      result: "error",
      message: "Gagal mengambil indikator!",
    });
  }
});

// ========================= UPDATE KPI =========================
app.post("/api/kpi-update", upload.single("buktiFile"), async (req, res) => {
  try {
    const { kpiKey, actual, email } = req.body;
    const buktiFile = req.file;

    if (!kpiKey || !email) {
      return res.status(400).json({
        result: "error",
        message: "ID KPI dan email wajib dikirim!",
      });
    }

    let buktiBase64 = "";
    let mimeType = "";

    if (buktiFile) {
      buktiBase64 = buktiFile.buffer.toString("base64");
      mimeType = buktiFile.mimetype;
    }

    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "updateKPI",
      id: kpiKey,
      actual,
      email,
      bukti: buktiBase64 ? `data:${mimeType};base64,${buktiBase64}` : "",
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ Error update KPI:", error.message);
    res.status(500).json({
      result: "error",
      message: "Gagal update KPI",
    });
  }
});

// ========================= GET KPI BY USER (DIVISI + LEVEL + SCOPE) =========================
app.post("/api/kpi-by-user", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        result: "error",
        message: "Email wajib dikirim",
        data: [],
      });
    }

    // 🔁 Forward ke Google Apps Script
    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "getKpiByUser",
      email,
    });

    const gasData = response.data || {};

    // ========================= VALIDASI RESPONSE =========================
    if (gasData.result !== "success") {
      return res.status(500).json({
        result: "error",
        message: gasData.message || "Gagal mengambil data KPI",
        data: [],
      });
    }

    // ========================= NORMALISASI DATA =========================
    // WAJIB: pastikan boolean super admin SELALU ADA
    const isSuperAdmin = Boolean(gasData.is_super_admin);

    // WAJIB: pastikan data array
    const data = Array.isArray(gasData.data) ? gasData.data : [];

    // Optional hardening (biar frontend aman)
    const normalizedData = data.map((kpi) => ({
      ...kpi,
      count: Number(kpi.count) || 0,
      can_edit: isSuperAdmin || Boolean(kpi.can_edit),
    }));

    // ========================= RESPONSE FINAL =========================
    return res.json({
      result: "success",
      is_super_admin: isSuperAdmin,
      data: normalizedData,
      empty: normalizedData.length === 0,
    });
  } catch (error) {
    console.error("❌ Error get KPI by user:", error.message);

    return res.status(500).json({
      result: "error",
      message: "Gagal mengambil data KPI",
      data: [],
    });
  }
});

// ========================= GET SUBMITTED KPI =========================
app.post("/api/kpi-submitted", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        result: "error",
        message: "Email wajib dikirim",
      });
    }

    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "getSubmittedKPI",
      email,
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ Error get submitted KPI:", error.message);
    res.status(500).json({
      result: "error",
      message: "Gagal mengambil KPI yang sudah dikirim",
    });
  }
});

// ========================= GET Tabungan =========================
app.get("/api/tabungan-data", async (req, res) => {
  try {
    // ambil semua query param dari frontend
    const queryParams = req.query || {};

    // kirim request ke Google Apps Script
    const response = await axios.post(
      GOOGLE_SCRIPT_URL,
      {
        action: "getTabunganData",
        ...queryParams,
      },
      {
        timeout: 30000, // 30 detik safety timeout
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    // validasi response dari GAS
    if (!response || !response.data) {
      return res.status(502).json({
        success: false,
        message: "Invalid response from GAS",
      });
    }

    // forward response ke frontend
    return res.json(response.data);
  } catch (error) {
    // logging error detail (WAJIB untuk debugging GAS)
    console.error("ERROR /api/tabungan-data:", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    return res.status(500).json({
      success: false,
      message: "Gagal mengambil data tabungan",
      error: error.response?.data || error.message,
    });
  }
});

// ========================= TABUNGAN BATCH (Sudah Diperbaiki) =========================
app.post("/api/tabungan-batch", async (req, res) => {
  try {
    // 1. Ambil data dari Body (Sekarang murni JSON, file sudah berupa URL string)
    const { email, password, nama, divisi, unit, tanda_tangan, tabungan_list } = req.body;

    // 2. Validasi Input Dasar
    if (!email || !nama || !Array.isArray(tabungan_list) || tabungan_list.length === 0) {
      return res.status(400).json({
        result: "error",
        message: "Data tidak lengkap atau daftar tabungan kosong.",
      });
    }

    // 3. Ambil Master Data dari GAS untuk Validasi Item
    const masterResponse = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "getTabunganData",
    });

    if (masterResponse.data.result !== "success") {
      return res.status(500).json({
        result: "error",
        message: "Gagal mengambil master data tabungan dari server.",
      });
    }

    const masterList = masterResponse.data.message || [];

    // 4. Loop Validasi: Pastikan item tabungan valid sesuai Master Data
    for (const item of tabungan_list) {
      const master = masterList.find((m) => {
        // --- NORMALISASI STRING ---
        // Kita ubah jadi huruf kecil semua (.toLowerCase()) 
        // dan hapus spasi nyasar di ujung kata (.trim())
        const masterNama = String(m.nama || "").toLowerCase().trim();
        const payloadNama = String(nama || "").toLowerCase().trim();

        const masterKerja = String(m.kerja_tabungan_gaji || "").toLowerCase().trim();
        const payloadKerja = String(item.kerja_tabungan_gaji || "").toLowerCase().trim();

        const masterParam = String(m.parameter || "").toLowerCase().trim();
        const payloadParam = String(item.parameter || "").toLowerCase().trim();

        return (
          masterNama === payloadNama &&
          masterKerja === payloadKerja &&
          masterParam === payloadParam
        );
      });

      if (!master) {
        return res.status(400).json({
          result: "error",
          message: `Item tabungan "${item.kerja_tabungan_gaji}" dengan parameter "${item.parameter}" tidak ditemukan di data master karyawan tersebut. Pastikan teks sama persis dengan yang ada di Google Sheets.`,
        });
      }
    }

    // 5. Kirim Payload ke Google Apps Script
    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "tabunganBatch",
      email,
      password,
      nama,
      divisi,
      unit,
      tanda_tangan,
      tabungan_list, // Isi: [{ ..., bukti_nilai: "https://drive.google.com/..." }, ...]
    });

    // 6. Kembalikan Respon GAS ke Frontend
    res.json(response.data);

  } catch (err) {
    console.error("❌ Error Tabungan Batch:", err.message);
    
    // Handle error response dari Axios (jika GAS down/error)
    if (err.response) {
       return res.status(err.response.status).json({
         result: "error",
         message: "Error dari Google Script: " + (err.response.data.message || err.message)
       });
    }

    res.status(500).json({
      result: "error",
      message: "Terjadi kesalahan internal server saat mengirim tabungan.",
    });
  }
});

// ========================= GET TABUNGAN BY USER =========================
app.post("/api/tabungan-by-user", async (req, res) => {
  try {
    // 1. Validasi Input
    const email = (req.body?.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        result: "error",
        message: "Email wajib dikirim",
        data: [],
      });
    }

    console.log("📩 Request TABUNGAN BY USER:", email);

    // 2. Siapkan Data untuk GAS (INI YANG TADI HILANG)
    const params = new URLSearchParams();
    params.append("action", "getTabunganByUser");
    params.append("email", email);

    // 3. Request ke Google Apps Script
    const gasResponse = await axios.post(GOOGLE_SCRIPT_URL, params, {
      timeout: 30000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      validateStatus: () => true, // Agar error 400/500 dari GAS tidak throw exception di sini
    });

    console.log(
      "📦 RAW RESPONSE GAS:",
      JSON.stringify(gasResponse.data, null, 2),
    );

    // 4. Validasi Response GAS
    if (!gasResponse || !gasResponse.data) {
      return res.status(502).json({
        result: "error",
        message: "Response GAS kosong",
        data: [],
      });
    }

    const gasData = gasResponse.data;

    // 5. 🔥 LOGIKA EKSTRAKSI DATA (FIX DATA KOSONG) 🔥
    // Cek apakah data ada langsung di root, atau dibungkus dalam properti 'message'
    let finalData = {
      is_super_admin: false,
      data: [],
    };

    if (gasData.result === "success") {
      if (
        gasData.message &&
        typeof gasData.message === "object" &&
        Array.isArray(gasData.message.data)
      ) {
        // Kasus 1: Data terbungkus di dalam 'message'
        finalData = gasData.message;
      } else if (Array.isArray(gasData.data)) {
        // Kasus 2: Data langsung ada di root (format lama/standar)
        finalData = gasData;
      }
    } else {
      // Jika GAS return error
      return res.status(500).json({
        result: "error",
        message: gasData.message || "Gagal mengambil data dari GAS",
        data: [],
      });
    }

    // 6. Normalisasi Data (Pastikan tipe data benar)
    const isSuperAdmin = Boolean(finalData.is_super_admin);
    const rawList = Array.isArray(finalData.data) ? finalData.data : [];

    const normalizedData = rawList.map((item) => ({
      ...item,
      // Pastikan angka benar-benar angka, bukan string kosong
      count: Number(item.count) || 0,
      can_edit: isSuperAdmin || Boolean(item.can_edit),
      // Tambahan: Pastikan actual tidak null/undefined agar React tidak error
      actual:
        item.actual === null || item.actual === undefined ? "" : item.actual,
    }));

    // 7. Kirim ke Frontend
    return res.json({
      result: "success",
      is_super_admin: isSuperAdmin,
      data: normalizedData,
      empty: normalizedData.length === 0,
    });
  } catch (error) {
    console.error("❌ FULL ERROR TABUNGAN:", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      result: "error",
      message: "Gagal mengambil data tabungan (Server Error)",
      data: [],
    });
  }
});

// ========================= UPDATE TABUNGAN (DENGAN FILE) =========================
app.post(
  "/api/tabungan-update",
  upload.single("buktiFile"),
  async (req, res) => {
    try {
      const { id, actual, email } = req.body;
      const buktiFile = req.file; // File dari multer

      if (!id || !email) {
        return res.status(400).json({
          result: "error",
          message: "ID dan email wajib dikirim",
        });
      }

      // Konversi file ke Base64 (sama seperti KPI)
      let buktiBase64 = "";
      let mimeType = "";

      if (buktiFile) {
        buktiBase64 = buktiFile.buffer.toString("base64");
        mimeType = buktiFile.mimetype;
      }

      const response = await axios.post(GOOGLE_SCRIPT_URL, {
        action: "updateTabungan",
        id,
        actual,
        email,
        // Kirim format data:mime;base64,... agar dikenali GAS
        bukti: buktiBase64 ? `data:${mimeType};base64,${buktiBase64}` : "",
      });

      res.json(response.data);
    } catch (error) {
      console.error("❌ Error update Tabungan:", error.message);
      res.status(500).json({
        result: "error",
        message: "Gagal update tabungan",
      });
    }
  },
);

// ========================= GET SUBMITTED TABUNGAN =========================
app.post("/api/tabungan-submitted", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        result: "error",
        message: "Email wajib dikirim",
      });
    }

    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "getSubmittedTabungan",
      email,
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ Error get submitted Tabungan:", error.message);
    res.status(500).json({
      result: "error",
      message: "Gagal mengambil tabungan yang sudah dikirim",
    });
  }
});

// ========================= LOCAL DEV ONLY =========================
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`🚀 Server lokal berjalan di http://localhost:${PORT}`);
  });
}

// ========================= EXPORT FOR VERCEL =========================
module.exports = app;


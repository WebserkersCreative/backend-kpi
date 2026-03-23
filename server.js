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

// ========================= KPI BATCH =========================
app.post("/api/kpi-batch", async (req, res) => {
  try {
    const { email, password, nama, divisi, unit, tanda_tangan, indikator_list, is_new_user } = req.body;

    if (!email || !nama || !Array.isArray(indikator_list) || indikator_list.length === 0) {
      return res.status(400).json({
        result: "error",
        message: "Data tidak lengkap atau daftar indikator kosong.",
      });
    }

    if (!is_new_user) {
      const indikatorResponse = await axios.post(GOOGLE_SCRIPT_URL, {
        action: "getIndikatorData",
      });

      if (indikatorResponse.data.result !== "success") {
        return res.status(500).json({
          result: "error",
          message: "Gagal mengambil master data indikator.",
        });
      }

      // Pastikan master array tidak undefined
      let indikatorMaster = [];
      if (Array.isArray(indikatorResponse.data.data)) {
        indikatorMaster = indikatorResponse.data.data;
      } else if (Array.isArray(indikatorResponse.data.message)) {
        indikatorMaster = indikatorResponse.data.message;
      }

      // 🔥 FIX UTAMA: Validasi KPI sekarang kebal Spasi dan Huruf Besar/Kecil 🔥
      for (const item of indikator_list) {
        const master = indikatorMaster.find((m) => {
          const masterNama = String(m.nama || "").toLowerCase().trim();
          const payloadNama = String(nama || "").toLowerCase().trim();
          const masterIndikator = String(m.indikator_kpi || "").toLowerCase().trim();
          const payloadIndikator = String(item.indikator_kpi || "").toLowerCase().trim();

          return masterNama === payloadNama && masterIndikator === payloadIndikator;
        });

        if (!master) {
          return res.status(400).json({
            result: "error",
            message: `Indikator "${item.indikator_kpi}" tidak ditemukan di data master karyawan tersebut.`,
          });
        }

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
    }

    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "kpiBatch",
      email,
      password,
      nama,
      divisi,
      unit,
      tanda_tangan,
      indikator_list, 
      is_new_user 
    });

    res.json(response.data);

  } catch (err) {
    console.error("❌ Error KPI Batch:", err.message);
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

// ========================= GET KPI BY USER =========================
app.post("/api/kpi-by-user", async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ result: "error", message: "Email wajib dikirim", data: [] });

    const params = new URLSearchParams();
    params.append("action", "getKpiByUser");
    params.append("email", email);

    const gasResponse = await axios.post(GOOGLE_SCRIPT_URL, params, {
      timeout: 30000,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      validateStatus: () => true,
    });

    if (!gasResponse || !gasResponse.data) {
      return res.status(502).json({ result: "error", message: "Response GAS kosong", data: [] });
    }

    const gasData = gasResponse.data;

    let finalData = { is_super_admin: false, data: [] };
    if (gasData.result === "success") {
      if (gasData.message && typeof gasData.message === "object" && Array.isArray(gasData.message.data)) {
        finalData = gasData.message;
      } else if (Array.isArray(gasData.data)) {
        finalData = gasData;
      }
    } else {
      return res.status(500).json({ result: "error", message: gasData.message || "Gagal dari GAS", data: [] });
    }

    const isSuperAdmin = Boolean(finalData.is_super_admin);
    const rawList = Array.isArray(finalData.data) ? finalData.data : [];

    const normalizedData = rawList.map((item) => ({
      ...item,
      count: Number(item.count) || 0,
      can_edit: isSuperAdmin || Boolean(item.can_edit),
      actual: item.actual === null || item.actual === undefined ? "" : item.actual,
    }));

    return res.json({
      result: "success",
      is_super_admin: isSuperAdmin,
      data: normalizedData,
      empty: normalizedData.length === 0,
    });
  } catch (error) {
    console.error("❌ ERROR KPI BY USER:", error.message);
    return res.status(500).json({ result: "error", message: "Server Error", data: [] });
  }
});

// ========================= GET SUBMITTED KPI =========================
app.post("/api/kpi-submitted", async (req, res) => {
  try {
    const { email, nama } = req.body; 

    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "getSubmittedKPI",
      email,
      nama,
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
    const queryParams = req.query || {};
    const response = await axios.post(
      GOOGLE_SCRIPT_URL,
      {
        action: "getTabunganData",
        ...queryParams,
      },
      {
        timeout: 30000, 
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!response || !response.data) {
      return res.status(502).json({
        success: false,
        message: "Invalid response from GAS",
      });
    }

    return res.json(response.data);
  } catch (error) {
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

// ========================= TABUNGAN BATCH =========================
app.post("/api/tabungan-batch", async (req, res) => {
  try {
    const { email, password, nama, divisi, unit, tanda_tangan, tabungan_list, is_new_user } = req.body;

    if (!email || !nama || !Array.isArray(tabungan_list) || tabungan_list.length === 0) {
      return res.status(400).json({
        result: "error",
        message: "Data tidak lengkap atau daftar tabungan kosong.",
      });
    }

    if (!is_new_user) {
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

      for (const item of tabungan_list) {
        const master = masterList.find((m) => {
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
            message: `Item tabungan "${item.kerja_tabungan_gaji}" tidak ditemukan di data master karyawan tersebut.`,
          });
        }
      }
    }

    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "tabunganBatch",
      email,
      password,
      nama,
      divisi,
      unit,
      tanda_tangan,
      tabungan_list, 
      is_new_user 
    });

    res.json(response.data);

  } catch (err) {
    console.error("❌ Error Tabungan Batch:", err.message);
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
    const email = (req.body?.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ result: "error", message: "Email wajib dikirim", data: [] });
    }

    const params = new URLSearchParams();
    params.append("action", "getTabunganByUser");
    params.append("email", email);

    const gasResponse = await axios.post(GOOGLE_SCRIPT_URL, params, {
      timeout: 30000,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      validateStatus: () => true, 
    });

    if (!gasResponse || !gasResponse.data) {
      return res.status(502).json({ result: "error", message: "Response GAS kosong", data: [] });
    }

    const gasData = gasResponse.data;

    let finalData = { is_super_admin: false, data: [] };

    if (gasData.result === "success") {
      if (gasData.message && typeof gasData.message === "object" && Array.isArray(gasData.message.data)) {
        finalData = gasData.message;
      } else if (Array.isArray(gasData.data)) {
        finalData = gasData;
      }
    } else {
      return res.status(500).json({ result: "error", message: gasData.message || "Gagal mengambil data dari GAS", data: [] });
    }

    const isSuperAdmin = Boolean(finalData.is_super_admin);
    const rawList = Array.isArray(finalData.data) ? finalData.data : [];

    const normalizedData = rawList.map((item) => ({
      ...item,
      count: Number(item.count) || 0,
      can_edit: isSuperAdmin || Boolean(item.can_edit),
      actual: item.actual === null || item.actual === undefined ? "" : item.actual,
    }));

    return res.json({
      result: "success",
      is_super_admin: isSuperAdmin,
      data: normalizedData,
      empty: normalizedData.length === 0,
    });
  } catch (error) {
    console.error("❌ FULL ERROR TABUNGAN:", { message: error.message, stack: error.stack });
    return res.status(500).json({ result: "error", message: "Gagal mengambil data tabungan (Server Error)", data: [] });
  }
});

// ========================= UPDATE TABUNGAN (DENGAN FILE) =========================
app.post("/api/tabungan-update", upload.single("buktiFile"), async (req, res) => {
    try {
      const { id, actual, email } = req.body;
      const buktiFile = req.file; 

      if (!id || !email) {
        return res.status(400).json({
          result: "error",
          message: "ID dan email wajib dikirim",
        });
      }

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
    const { email, nama } = req.body;

    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "getSubmittedTabungan",
      email,
      nama,
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

// ========================= ADD MASTER DATA (KPI / TABUNGAN) =========================
app.post("/api/add-master-data", async (req, res) => {
  try {
    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "addMasterData",
      ...req.body,
    });
    res.json(response.data);
  } catch (error) {
    console.error("❌ Error add master data:", error.message);
    res.status(500).json({ result: "error", message: "Gagal menambah master data" });
  }
});

// ========================= UPDATE PRINT DATA (SYNC TO DATABASE) =========================
app.post("/api/update-print", async (req, res) => {
  try {
    const payload = req.body;
    
    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "updatePrintData",
      ...payload
    });
    
    res.json(response.data);
  } catch (error) {
    console.error("❌ Error update print data:", error.message);
    res.status(500).json({
      result: "error",
      message: "Gagal menyimpan ke database server.",
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

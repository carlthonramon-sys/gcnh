// src/routes/pdfRoutes.js
import { Router } from "express";
import { buildDarfPDFStream } from "../services/pdfService.js";

const router = Router();

/**
 * POST /api/darf/pdf
 * Body: { nome, cpf, amount, ref, pix }
 * Resposta: application/pdf
 */
router.post("/darf/pdf", async (req, res) => {
  try {
    const { nome, cpf, amount, ref, pix } = req.body || {};

    if (!cpf || !nome) {
      return res.status(400).json({ error: "nome e cpf são obrigatórios" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="darf-${cpf}.pdf"`);

    const doc = buildDarfPDFStream({ nome, cpf, amount, ref, pix });
    doc.pipe(res);
    doc.end();
  } catch (err) {
    console.error("[pdf] erro:", err);
    res.status(500).json({ error: "falha ao gerar PDF" });
  }
});

export default router;

// src/controllers/identityController.js
import { queryCpf, onlyDigits } from "../services/identityService.js";

// GET /api/identity/cpf?cpf=XXXXXXXXXXX
export async function queryCpfHandler(req, res) {
  try {
    const cpf = onlyDigits(req.query.cpf || "");
    if (cpf.length !== 11) {
      return res.status(400).json({ ok: false, error: "cpf_invalid" });
    }

    const person = await queryCpf(cpf); // { cpf, nome, sexo, ... }
    return res.json({ ok: true, person });
  } catch (err) {
    console.error("identityController/queryCpfHandler:", err?.message || err);
    return res.status(502).json({ ok: false, error: "lookup_failed" });
  }
}

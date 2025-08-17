// src/utils/cookies.js
// Utilitários de cookie + geração de SID.
// Exporte NOMEADOS: parseCookies e getOrCreateSid

import crypto from "node:crypto";

/** Lê o header Cookie e devolve um objeto { nome: valor } */
export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const parts = header.split(";").map(v => v.trim()).filter(Boolean);
  const out = {};
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1));
  }
  return out;
}

/**
 * Retorna o SID existente no cookie ou cria um novo.
 * Seta "sid" com Path=/; HttpOnly; SameSite=Lax
 */
export function getOrCreateSid(req, res) {
  const cookies = parseCookies(req);
  let sid = cookies.sid;
  if (!sid) {
    sid = crypto.randomUUID();
    // Defina o cookie. Ajuste "Secure" se for https.
    res.setHeader(
      "Set-Cookie",
      `sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax`
    );
  }
  return sid;
}

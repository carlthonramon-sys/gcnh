// src/services/identityService.js
// Consulta /fp/<CPF>, normaliza resposta e expõe utilitários:
// - lookupCpf (principal) / queryCpf (alias)
// - buildNameChoices(trueName, sex)            -> 4 opções em UPPERCASE
// - buildBirthChoices(nascISO)                 -> 4 datas DD/MM/AAAA (ano aleatório)
// - buildMotherChoices(trueMotherName)         -> 4 nomes femininos em UPPERCASE
// - maskCpf(cpf)

const BASE = "https://whs.lgpd.is/76c835864f2f8d03c53c/fp";

/* ------------------ utils ------------------ */
export function onlyDigits(s) {
  return (s || "").replace(/\D+/g, "");
}
function withTimeout(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, cancel: () => clearTimeout(t) };
}
export function maskCpf(raw) {
  const d = onlyDigits(raw);
  if (d.length !== 11) return raw || "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function stripAccents(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/* ---- listas simples p/ distratores ---- */
const FIRST_M = [
  "Gabriel","Lucas","Mateus","João","Felipe","Bruno","Carlos","André",
  "Leonardo","Rafael","Caio","Thiago","Pedro"
];
const FIRST_F = [
  "Ana","Julia","Mariana","Beatriz","Camila","Carolina","Isabela",
  "Larissa","Luana","Patrícia","Fernanda","Aline","Bianca"
];
const LAST = [
  "Silva","Souza","Oliveira","Santos","Pereira","Lima","Ferreira",
  "Almeida","Gomes","Ribeiro","Carvalho","Araujo","Costa","Martins"
];

function randFrom(list) {
  return list[(Math.random() * list.length) | 0];
}
function fullNameBySex(sex) {
  const fn = sex === "F" ? randFrom(FIRST_F) : randFrom(FIRST_M);
  const ln1 = randFrom(LAST);
  const ln2 = randFrom(LAST);
  return `${fn} ${ln1} ${ln2}`;
}

/**
 * 4 opções (1 correta + 3 distratores) — mantém a lógica existente
 */
export function buildNameChoices(trueName, sex) {
  const out = new Set();
  const trueFirst = stripAccents(trueName).split(/\s+/)[0].toUpperCase();

  while (out.size < 3) {
    const cand = fullNameBySex(sex);
    const cFirst = stripAccents(cand).split(/\s+/)[0].toUpperCase();
    if (cFirst !== trueFirst) out.add(cand.toUpperCase());
  }

  return shuffle([trueName.toUpperCase(), ...out]);
}

/* --------- datas: parse/format helpers (UTC) ---------- */
function parseISODateUTC(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDaysUTC(date, n) {
  const c = new Date(date.getTime());
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
function addMonthsUTC(date, n) {
  const c = new Date(date.getTime());
  c.setUTCMonth(c.getUTCMonth() + n);
  return c;
}
function setYearUTC(date, year) {
  return new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()));
}
export function formatDateBR(isoOrDate) {
  const d = typeof isoOrDate === "string" ? parseISODateUTC(isoOrDate) : isoOrDate;
  if (!d) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * 4 opções de nascimento (DD/MM/AAAA). O distrator de ano
 * agora usa um ano aleatório no intervalo ±1…5.
 */
export function buildBirthChoices(nascISO) {
  const base = parseISODateUTC(nascISO);
  if (!base) return [];
  const correct = formatDateBR(base);
  const set = new Set();

  let guard = 0;
  while (set.size < 3 && guard < 60) {
    guard++;
    let cand;
    const r = Math.random();
    if (r < 0.30) {
      // +/- dias (1..20)
      cand = addDaysUTC(base, (Math.random() < 0.5 ? -1 : 1) * rand(1, 20));
    } else if (r < 0.60) {
      // +/- meses (1..2)
      cand = addMonthsUTC(base, (Math.random() < 0.5 ? -1 : 1) * rand(1, 2));
    } else {
      // ano aleatório no range ±1..5 (não 0)
      const off = (Math.random() < 0.5 ? -1 : 1) * rand(1, 5);
      cand = setYearUTC(base, base.getUTCFullYear() + off);
    }
    const label = formatDateBR(cand);
    if (label !== correct) set.add(label);
  }

  return shuffle([correct, ...set]);
}

/**
 * Nome da mãe: gera 3 distratores femininos + verdadeiro (UPPERCASE)
 */
export function buildMotherChoices(trueMotherName) {
  const out = new Set();
  const trueFirst = stripAccents(trueMotherName).split(/\s+/)[0].toUpperCase();

  while (out.size < 3) {
    const fn = randFrom(FIRST_F);
    const ln1 = randFrom(LAST);
    const ln2 = randFrom(LAST);
    const cand = `${fn} ${ln1} ${ln2}`.toUpperCase();
    const cFirst = stripAccents(cand).split(/\s+/)[0].toUpperCase();
    if (cFirst !== trueFirst) out.add(cand);
  }

  return shuffle([trueMotherName.toUpperCase(), ...out]);
}

/* ------------------ chamada da API ------------------ */
function normalize(apiData) {
  if (!apiData) throw new Error("payload vazio");

  const cpf = onlyDigits(apiData.CPF || apiData.cpf || "");
  const nome = (apiData.NOME || apiData.nome || "").trim();
  const sx = ((apiData.SEXO || apiData.sexo || "M") + "").toUpperCase();
  const sexo = sx === "F" ? "F" : "M";
  const nascISO = apiData.NASC || apiData.nasc || apiData.NASCIMENTO || null; // "1983-06-06T00:00:00.000Z"
  const nascBR = nascISO ? formatDateBR(nascISO) : null;
  const nomeMae = (apiData.NOME_MAE || apiData.nome_mae || "").trim();

  if (!cpf || !nome) throw new Error("payload inesperado");

  return {
    cpf,
    nome,
    sexo,
    nascISO,
    nascBR,
    nomeMae,
    id: apiData.CONTATOS_ID || apiData.id || null,
    raw: apiData,
  };
}

/**
 * GET https://.../fp/<cpf>
 */
export async function lookupCpf(raw) {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11) throw new Error("CPF inválido");

  const url = `${BASE}/${cpf}`;
  const { signal, cancel } = withTimeout(10000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "CNH-Social/1.0 (+localhost)",
      },
      signal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} ao consultar ${url}`);
    const data = await res.json();
    cancel();
    return normalize(data);
  } catch (err) {
    cancel();
    console.error("[identityService] erro:", err?.message || err);
    throw err;
  }
}

/* ---- alias p/ compatibilidade ---- */
export const queryCpf = lookupCpf;

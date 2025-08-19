// src/services/bot.js
// Helpers para construir mensagens do bot (texto e áudio)

import { TYPING_MIN_MS, TYPING_MAX_MS } from "../config/constants.js";

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Mensagem de TEXTO do bot.
 * Aceita: options[], typingMs, ephemeralMs e quaisquer outros campos extras seguros
 * (ex.: style, gate, data-*).
 */
export function bot(text = "", extra = {}) {
  const typingMs = Number.isFinite(extra.typingMs)
    ? extra.typingMs
    : rand(TYPING_MIN_MS, TYPING_MAX_MS);

  const msg = {
    from: "bot",
    text,
    typingMs,
  };

  // opções (pílulas)
  if (Array.isArray(extra.options) && extra.options.length) {
    msg.options = extra.options;
  }

  // tempo para desaparecer automaticamente (ms)
  if (Number.isFinite(extra.ephemeralMs) && extra.ephemeralMs > 0) {
    msg.ephemeralMs = extra.ephemeralMs;
  }

  // Permite anexar quaisquer campos extras (sem sobrescrever os principais)
  const { options, typingMs: _t, ephemeralMs: _e, ...rest } = extra;
  Object.assign(msg, rest); // ex.: { style: "pending" }

  return msg;
}

/**
 * Mensagem de ÁUDIO do bot.
 * Aceita: title, duration (opcional), typingMs, ephemeralMs e extras (ex.: gate).
 * - gate: identificador para o front enviar quando o áudio terminar:
 *         "__AUDIO_DONE__:<gate>"
 */
export function botAudio(src, meta = {}) {
  const typingMs = Number.isFinite(meta.typingMs)
    ? meta.typingMs
    : rand(TYPING_MIN_MS, TYPING_MAX_MS);

  const audio = {
    src,
    title: meta.title || "Ouvir áudio",
  };
  if (meta.duration != null) audio.duration = meta.duration;

  const msg = {
    from: "bot",
    typingMs,
    audio,
  };

  // desaparecer automático (ms), se quiser
  if (Number.isFinite(meta.ephemeralMs) && meta.ephemeralMs > 0) {
    msg.ephemeralMs = meta.ephemeralMs;
  }

  // Extras adicionais (ex.: gate)
  const { typingMs: _t, ephemeralMs: _e, title, duration, ...rest } = meta;
  Object.assign(msg, rest); // ex.: { gate: "after_payment_notice" }

  return msg;
}

export default bot;

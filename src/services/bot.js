// src/services/bot.js
// Helpers para construir mensagens do bot (texto e áudio)

import { TYPING_MIN_MS, TYPING_MAX_MS } from "../config/constants.js";

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Mensagem de texto do bot.
 * Aceita: options[], typingMs, ephemeralMs e quaisquer outros campos extras seguros.
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

  // tempo para desaparecer automaticamente
  if (Number.isFinite(extra.ephemeralMs) && extra.ephemeralMs > 0) {
    msg.ephemeralMs = extra.ephemeralMs;
  }

  // anexa outros campos extras sem sobrescrever os principais
  const { options, typingMs: _t, ephemeralMs: _e, ...rest } = extra;
  Object.assign(msg, rest);

  return msg;
}

/**
 * Mensagem de áudio do bot.
 * Aceita: title, duration (opcional), typingMs, ephemeralMs e extras.
 */
export function botAudio(src, meta = {}) {
  const typingMs = Number.isFinite(meta.typingMs)
    ? meta.typingMs
    : rand(TYPING_MIN_MS, TYPING_MAX_MS);

  const audio = {
    src,
    title: meta.title || "Ouvir explicação",
  };
  if (meta.duration != null) audio.duration = meta.duration;

  const msg = {
    from: "bot",
    typingMs,
    audio,
  };

  if (Number.isFinite(meta.ephemeralMs) && meta.ephemeralMs > 0) {
    msg.ephemeralMs = meta.ephemeralMs;
  }

  // extras adicionais
  const { typingMs: _t, ephemeralMs: _e, title, duration, ...rest } = meta;
  Object.assign(msg, rest);

  return msg;
}

export default bot;

// src/controllers/chatController.js
import { getOrCreateSid } from "../utils/cookies.js";
import { getSession, setSession, deleteSession, ensureSession } from "../utils/sessionStore.js";
import { nextMessages } from "../services/flow.js"; // ❗️UMA import só

export function resetHandler(req, res) {
  const sid = getOrCreateSid(req, res);
  deleteSession(sid);
  res.json({ ok: true });
}

export async function chatHandler(req, res) {
  const sid = getOrCreateSid(req, res);
  const text = (req.body?.message || "").trim();

  let session = getSession(sid);
  if (!session) session = ensureSession(sid);

  const messages = await nextMessages(session, text);
  setSession(sid, session);

  res.json({ messages });
}

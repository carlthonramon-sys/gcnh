// Sessões em memória por SID.
// Estrutura: { flow: { step: "intro" }, createdAt: number }

const store = new Map();

/** Retorna a sessão existente (ou undefined) */
export function getSession(sid) {
  return store.get(sid);
}

/** Garante uma sessão inicial caso não exista */
export function ensureSession(sid) {
  let s = store.get(sid);
  if (!s) {
    s = { flow: { step: "intro" }, createdAt: Date.now() };
    store.set(sid, s);
  }
  return s;
}

/** Persiste (útil se você trocar o objeto de sessão inteiro) */
export function setSession(sid, session) {
  store.set(sid, session);
}

/** Remove a sessão do usuário (usado no /chat/reset) */
export function deleteSession(sid) {
  store.delete(sid);
}

/* (opcional) Limpar tudo para testes
export function clearAllSessions() {
  store.clear();
}
*/

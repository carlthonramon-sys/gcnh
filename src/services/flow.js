// src/services/flow.js
// Orquestra o fluxo do chat (estados + mensagens)

import bot, { botAudio } from "./bot.js";
import {
  queryCpf,
  buildNameChoices,
  buildBirthChoices,
  buildMotherChoices,
  maskCpf,
  onlyDigits,
} from "./identityService.js";

/* ========== Tempos (ajuste livre) ========== */
const HOURGLASS_VISIBLE_MS = 2500;   // quanto tempo a ampulheta fica visível
const GAP_AFTER_HOURGLASS_MS = 400;  // folga antes do próximo bloco

/* ========== Helpers ========== */
const isLike = (txt, ...cands) => {
  const t = (txt || "").trim().toLowerCase();
  return cands.some((c) => t === c.toLowerCase());
};

function ensureFlow(session) {
  if (!session.flow) session.flow = { step: "intro" };
  if (!session.flags) session.flags = {};
  return session.flow;
}

function normalizeBrDateInput(s) {
  const v = (s || "").trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
  const d = onlyDigits(v);
  if (d.length === 8) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  return v;
}

/* ========== Blocos visuais finais ========== */

// 1) Ampulheta (texto + GIF) que desaparece sozinha
function consultingMsg(ms = HOURGLASS_VISIBLE_MS) {
  return bot(
    `<div class="loading-block">
       <div><strong>Tudo certo.</strong> Consultando disponibilidade para seu CPF…</div>
       <img src="/img/consultando.gif" class="loading-gif" alt="Carregando">
     </div>`,
    { typingMs: 350, ephemeralMs: ms, noJitter: true }
  );
}

// 2) Aprovado: SOMENTE o GIF (sem texto)
function approvedGifMsg() {
  return bot(
    `<div class="loading-block">
       <img src="/img/aprovado.gif" class="loading-gif" alt="Benefício aprovado">
     </div>`,
    { typingMs: HOURGLASS_VISIBLE_MS + GAP_AFTER_HOURGLASS_MS, noJitter: true }
  );
}

// 3) Player de áudio logo após o GIF
function approvedAudioMsg() {
  return botAudio("/audio/proximos-passos.mp3", {
    title: "Ouvir próximos passos",
    // 'gate' permite ao front liberar o próximo botão somente após o áudio
    gate: "approved_audio_done",
    typingMs: HOURGLASS_VISIBLE_MS + GAP_AFTER_HOURGLASS_MS + 600,
    noJitter: true,
  });
}

/* ========== Fluxo principal ========== */
export async function nextMessages(session, text) {
  const flow = ensureFlow(session);
  const messages = [];
  const userText = (text || "").trim();

  // ---- atalhos globais (funcionam em qualquer passo) ----
  if (isLike(userText, "como funciona")) {
    messages.push(
      botAudio("/audio/como-funciona.mp3", {
        title: "Ouvir explicação (0:27)",
        gate: "how_audio_done", // front mostra “Prosseguir” quando terminar
      })
    );
    flow.step = "await_proceed";
    return messages;
  }

  if (isLike(userText, "prosseguir")) {
    if (!["awaiting_cpf", "confirm_name", "confirm_birth", "confirm_mother"].includes(flow.step)) {
      messages.push(bot("Para continuar, informe seu CPF (somente números)."));
      flow.step = "awaiting_cpf";
      return messages;
    }
  }

  // ---- roteamento por passo ----
  switch (flow.step) {
    /* ---------------- intro ---------------- */
    case "intro": {
      messages.push(
        bot("**CNH Social:** Iniciativa nacional com apoio nas despesas do processo de habilitação (CNH), conforme diretrizes do Governo Federal."),
        bot("Para entender como funciona, toque no **botão abaixo:**"),
        bot("", { options: ["Como funciona"] })
      );
      flow.step = "await_how";
      break;
    }

    /* ---------------- aguarda clique em "Como funciona" ---------------- */
    case "await_how": {
      if (!isLike(userText, "como funciona")) {
        messages.push(bot("Toque em **Como funciona** para ouvir a explicação."));
        break;
      }
      messages.push(
        botAudio("/audio/como-funciona.mp3", {
          title: "Ouvir explicação (0:27)",
          gate: "how_audio_done",
        })
      );
      flow.step = "await_proceed";
      break;
    }

    /* ---------------- aguarda "Prosseguir" (liberado pelo fim do áudio) ---------------- */
    case "await_proceed": {
      if (!isLike(userText, "prosseguir")) {
        messages.push(bot("Depois de ouvir, toque em **Prosseguir**."));
        break;
      }
      messages.push(bot("Certo. Para checagem, informe **seu CPF**."));
      flow.step = "awaiting_cpf";
      break;
    }

    /* ---------------- recebe CPF ---------------- */
    case "awaiting_cpf": {
      const cpf = onlyDigits(userText);
      if (cpf.length !== 11) {
        messages.push(bot("Por favor, envie um **CPF válido** (11 dígitos)."));
        break;
      }

      messages.push(bot("Validando seu CPF… um instante."));

      try {
        const person = await queryCpf(cpf);

        const nameChoices = buildNameChoices(person.nome, person.sexo);

        session.identity = {
          cpf: person.cpf,
          cpfMasked: maskCpf(person.cpf),
          sexo: person.sexo,
          correctName: (person.nome || "").toUpperCase(),
          nameChoices,
          correctDobBR: person.nascBR || null,
          dobChoices: person.nascISO ? buildBirthChoices(person.nascISO) : [],
          correctMother: (person.nomeMae || "").toUpperCase(),
          motherChoices: person.nomeMae ? buildMotherChoices(person.nomeMae) : [],
        };

        messages.push(
          bot("Precisamos confirmar que é você. Qual é o seu **nome completo**?", {
            options: nameChoices,
          })
        );
        flow.step = "confirm_name";
      } catch {
        messages.push(
          bot("**CPF inválido ou não encontrado.**"),
          bot("Por favor, digite novamente um **CPF válido** (11 dígitos).")
        );
        flow.step = "awaiting_cpf";
      }
      break;
    }

    /* ---------------- confirma NOME ---------------- */
    case "confirm_name": {
      const answer = (userText || "").toUpperCase();

      if (!session.identity || !session.identity.correctName) {
        messages.push(bot("Vamos recomeçar a confirmação. Informe seu CPF."));
        flow.step = "awaiting_cpf";
        break;
      }

      if (answer === session.identity.correctName) {
        const hasDob = !!(session.identity.dobChoices?.length);
        const hasMother = !!(session.identity.motherChoices?.length);

        if (hasDob) {
          messages.push(
            bot("Agora confirme sua **data de nascimento**:", {
              options: session.identity.dobChoices,
            })
          );
          flow.step = "confirm_birth";
        } else if (hasMother) {
          messages.push(
            bot("Por fim, confirme o **nome da sua mãe**:", {
              options: session.identity.motherChoices,
            })
          );
          flow.step = "confirm_mother";
        } else {
          messages.push(
            consultingMsg(HOURGLASS_VISIBLE_MS),
            approvedGifMsg(),
            approvedAudioMsg()
          );
          flow.step = "idle";
        }
      } else {
        messages.push(
          bot("Nome não confere com o CPF informado. Tente novamente:", {
            options: session.identity.nameChoices || [],
          })
        );
        flow.step = "confirm_name";
      }
      break;
    }

    /* ---------------- confirma DATA DE NASCIMENTO ---------------- */
    case "confirm_birth": {
      const answerBr = normalizeBrDateInput(userText);

      if (!session.identity || !session.identity.correctDobBR) {
        messages.push(bot("Vamos recomeçar a confirmação. Informe seu CPF."));
        flow.step = "awaiting_cpf";
        break;
      }

      if (answerBr === session.identity.correctDobBR) {
        if (session.identity.motherChoices?.length) {
          messages.push(
            bot("Por fim, confirme o **nome da sua mãe**:", {
              options: session.identity.motherChoices,
            })
          );
          flow.step = "confirm_mother";
        } else {
          messages.push(
            consultingMsg(HOURGLASS_VISIBLE_MS),
            approvedGifMsg(),
            approvedAudioMsg()
          );
          flow.step = "idle";
        }
      } else {
        messages.push(
          bot("Data não confere com o CPF informado. Tente novamente:", {
            options: session.identity.dobChoices || [],
          })
        );
        flow.step = "confirm_birth";
      }
      break;
    }

    /* ---------------- confirma NOME DA MÃE ---------------- */
    case "confirm_mother": {
      const answer = (userText || "").toUpperCase();

      if (!session.identity || !session.identity.correctMother) {
        messages.push(bot("Vamos recomeçar a confirmação. Informe seu CPF."));
        flow.step = "awaiting_cpf";
        break;
      }

      if (answer === session.identity.correctMother) {
        messages.push(
          consultingMsg(HOURGLASS_VISIBLE_MS),
          approvedGifMsg(),
          approvedAudioMsg()
        );
        flow.step = "idle";
      } else {
        messages.push(
          bot("Nome da mãe não confere com o CPF informado. Tente novamente:", {
            options: session.identity.motherChoices || [],
          })
        );
        flow.step = "confirm_mother";
      }
      break;
    }

    /* ---------------- fallback ---------------- */
    default: {
      messages.push(bot("Para continuar, informe seu CPF (somente números)."));
      flow.step = "awaiting_cpf";
      break;
    }
  }

  return messages;
}

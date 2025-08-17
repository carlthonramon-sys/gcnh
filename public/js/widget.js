// public/js/widget.js
(() => {
  // ===== Utilitários =====
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // Delays de "digitando"
  const TYPING_MIN_MS = 1200;
  const TYPING_MAX_MS = 2600;
  const TYPING_JITTER_MS = 220;

  // Elementos principais
  const chatEl = document.querySelector(".chat");
  const inputEl = document.querySelector(".cw-input input");
  const sendBtn = document.querySelector(".cw-input button");

  // Gate: segurar mensagens relacionadas a "Prosseguir" enquanto áudio toca
  let afterAudioGate = { active: false, queue: [] };

  const normalize = (s) => (s || "").toString().trim().toLowerCase();
  const formatTime = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  function isProsseguirMsg(m) {
    if (!m || m.from !== "bot") return false;
    const hasProsseguirOption =
      Array.isArray(m.options) && m.options.some((o) => /prosseguir/i.test(o));
    const textHasProsseguir =
      typeof m.text === "string" && /(depois de ouvir|prosseguir)/i.test(m.text);
    return hasProsseguirOption || textHasProsseguir;
  }

  // Remove TODAS as instâncias de um botão de opção (mesmo texto)
  function removeOptionEverywhere(label) {
    const key = normalize(label);
    document.querySelectorAll(`.pill[data-option="${key}"]`).forEach((btn) => {
      const optionsRow = btn.parentElement;        // .options
      const bubble = optionsRow && optionsRow.parentElement; // .msg (quando existir)
      btn.remove();

      if (optionsRow && optionsRow.classList.contains("options") && optionsRow.children.length === 0) {
        optionsRow.remove();
        // se a bolha ficar vazia (sem texto e sem .options), remove também
        if (
          bubble &&
          bubble.classList.contains("msg") &&
          !bubble.querySelector(".options") &&
          bubble.textContent.trim() === ""
        ) {
          bubble.remove();
        }
      }
    });
  }

  // ===== Indicador de digitação =====
  let typingWrap = null;
  function showTyping() {
    hideTyping();
    typingWrap = document.createElement("div");
    typingWrap.className = "typingWrap";
    const t = document.createElement("div");
    t.className = "typing";
    t.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;
    typingWrap.appendChild(t);
    chatEl.appendChild(typingWrap);
    chatEl.scrollTop = chatEl.scrollHeight;
  }
  function hideTyping() {
    if (typingWrap && typingWrap.parentNode) {
      typingWrap.parentNode.removeChild(typingWrap);
      typingWrap = null;
    }
  }

  // ===== Remoção automática de bolha (mensagens efêmeras) =====
  function scheduleEphemeral(node, ms){
    if (node && Number.isFinite(ms) && ms > 0) {
      setTimeout(() => {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, ms);
    }
  }

  // ===== Render de mensagens =====
  function appendMessage(m) {
    // USER
    if (m.from === "user") {
      const wrap = document.createElement("div");
      wrap.className = "msg user";
      wrap.textContent = m.text || "";
      chatEl.appendChild(wrap);
      chatEl.scrollTop = chatEl.scrollHeight;
      return;
    }

    // BOT: somente opções (sem texto) => dentro de uma bolha .msg.bot
    if (m.from === "bot" && Array.isArray(m.options) && (!m.text || !m.text.trim())) {
      const wrap = document.createElement("div");
      wrap.className = "msg bot";

      const row = document.createElement("div");
      row.className = "options";

      m.options.forEach((opt) => {
        const label = String(opt);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pill primary";
        btn.textContent = label;
        btn.title = label;
        btn.dataset.option = normalize(label);
        btn.addEventListener("click", () => {
          removeOptionEverywhere(label);
          sendUserMessage(label);
        });
        row.appendChild(btn);
      });

      wrap.appendChild(row);
      chatEl.appendChild(wrap);
      chatEl.scrollTop = chatEl.scrollHeight;
      scheduleEphemeral(wrap, m.ephemeralMs);
      return;
    }

    // BOT: mensagem com ÁUDIO custom (play/pause + barra + tempo correndo)
    if (m.audio && m.audio.src) {
      const wrap = document.createElement("div");
      wrap.className = "msg bot";

      // limpa "(mm:ss)" do título e usa só como aria-label
      const stripDuration = (s) => (s || "").replace(/\s*\(\d+:\d{2}\)\s*$/,"").trim();
      const ariaTitle = stripDuration(m.audio.title || "Ouvir explicação");

      const player = document.createElement("div");
      player.className = "audio-wrap";

      // botão play/pause — texto será apenas o tempo
      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "pill primary audio-btn";
      playBtn.setAttribute("aria-label", ariaTitle);
      playBtn.textContent = `▶ 0:00 / …`;

      // barra de progresso
      const progress = document.createElement("div");
      progress.className = "audio-progress";
      const bar = document.createElement("div");
      bar.className = "bar";
      progress.appendChild(bar);

      const audio = new Audio(m.audio.src);
      audio.preload = "metadata";

      let rafId = null;
      let totalStr = "";

      const updateProgress = () => {
        if (!isFinite(audio.duration) || audio.duration <= 0) return;
        const pct = Math.min(100, Math.max(0, (audio.currentTime / audio.duration) * 100));
        bar.style.width = pct + "%";
      };

      const setLabel = () => {
        const now = isFinite(audio.currentTime) ? audio.currentTime : 0;
        const leftIcon = audio.paused ? "▶" : "⏸";
        playBtn.textContent = `${leftIcon} ${formatTime(now)} / ${totalStr || "…"}`;
      };

      const startTicker = () => {
        cancelAnimationFrame(rafId);
        const tick = () => {
          if (audio.ended) return;
          updateProgress();
          setLabel();
          if (!audio.paused) rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      };

      audio.addEventListener("loadedmetadata", () => {
        totalStr = formatTime(audio.duration);
        bar.style.width = "0%";
        setLabel(); // ▶ 0:00 / total
      });

      audio.addEventListener("timeupdate", () => {
        updateProgress();
        setLabel();
      });
      audio.addEventListener("seeked", () => {
        updateProgress();
        setLabel();
      });

      audio.addEventListener("play", () => {
        playBtn.classList.add("used");
        startTicker();
      });
      audio.addEventListener("pause", () => {
        cancelAnimationFrame(rafId);
        updateProgress();
        setLabel();
      });

      // >>> SOMENTE NO ÚLTIMO ÁUDIO (próximos passos) mostra o botão "EFETUAR PAGAMENTO"
      audio.addEventListener("ended", async () => {
        cancelAnimationFrame(rafId);
        bar.style.width = "100%";
        playBtn.disabled = false;
        playBtn.textContent = `↻ 0:00 / ${totalStr}`;

        // limpa gates
        removeOptionEverywhere("Como funciona");
        if (afterAudioGate.active) {
          afterAudioGate.queue = [];
          afterAudioGate.active = false;
        }

        // detecta áudio final (por src ou título)
        const title = (m.audio.title || "").toLowerCase();
        const src = (m.audio.src || "").toLowerCase();
        const isFinalAudio =
          /proximos\-passos\.mp3$/.test(src) || /próximos passos|proximos passos/.test(title);

        if (isFinalAudio) {
          // cria uma bolha com o botão EFETUAR PAGAMENTO
          const payWrap = document.createElement("div");
          payWrap.className = "msg bot";
          const row = document.createElement("div");
          row.className = "options";

          const payBtn = document.createElement("button");
          payBtn.type = "button";
          payBtn.className = "pill primary";
          payBtn.textContent = "EFETUAR PAGAMENTO";
          payBtn.dataset.option = normalize("EFETUAR PAGAMENTO");
          payBtn.addEventListener("click", () => {
            // mensagem antes de redirecionar
            appendMessage({ from: "bot", text: "Você será redirecionado para a tela de pagamento:" });
            // abre o link (nova aba)
            setTimeout(() => { try { window.open("https://www.google.com", "_blank"); } catch {} }, 150);
            payBtn.disabled = true;
            payBtn.classList.add("used");
          });

          row.appendChild(payBtn);
          payWrap.appendChild(row);
          chatEl.appendChild(payWrap);
          chatEl.scrollTop = chatEl.scrollHeight;
        } else {
          // comportamento padrão para demais áudios: mostrar "Prosseguir"
          showTyping();
          const delay = 1500 + Math.floor(Math.random() * 500);
          await sleep(delay);
          hideTyping();
          appendMessage({ from: "bot", options: ["Prosseguir"], text: "" });
        }
      });

      // play/pause via botão
      playBtn.onclick = async () => {
        try {
          if (isNaN(audio.duration)) { try { audio.load(); } catch {} }
          if (audio.paused) await audio.play();
          else audio.pause();
        } catch (err) {
          console.error("Falha ao reproduzir:", err);
        }
      };

      // click na barra: seek proporcional
      progress.addEventListener("click", (e) => {
        if (!isFinite(audio.duration) || audio.duration <= 0) return;
        const rect = progress.getBoundingClientRect();
        const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        audio.currentTime = pct * audio.duration;
        updateProgress();
        setLabel();
      });

      // Gate ativo enquanto houver áudio
      afterAudioGate.active = true;

      player.appendChild(playBtn);
      player.appendChild(progress);
      wrap.appendChild(player);
      chatEl.appendChild(wrap);
      chatEl.scrollTop = chatEl.scrollHeight;
      scheduleEphemeral(wrap, m.ephemeralMs);
      return;
    }

    // BOT: texto e (opcional) opções dentro da bolha
    const wrap = document.createElement("div");
    wrap.className = "msg bot";
    if (m.text) {
      const html = (m.text || "")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/__(.+?)__/g, "<strong>$1</strong>");
      wrap.innerHTML = html;
    }

    if (Array.isArray(m.options) && m.options.length) {
      const row = document.createElement("div");
      row.className = "options";
      m.options.forEach((opt) => {
        const label = String(opt);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pill primary";
        btn.textContent = label;
        btn.title = label;
        btn.dataset.option = normalize(label);
        btn.addEventListener("click", () => {
          removeOptionEverywhere(label);
          sendUserMessage(label);
        });
        row.appendChild(btn);
      });
      wrap.appendChild(row);
    }

    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
    scheduleEphemeral(wrap, m.ephemeralMs);
  }

  // ===== Exibir mensagens com "digitando" =====
  async function displayMessagesWithTyping(messages) {
    for (const m of messages || []) {
      if (m.from && m.from !== "bot") continue;

      // Segura mensagens de prosseguir enquanto gate ativo
      if (afterAudioGate.active && isProsseguirMsg(m)) {
        afterAudioGate.queue.push(m);
        continue;
      }

      // Ativa gate se vier áudio
      if (m.audio && m.audio.src) afterAudioGate.active = true;

      const base = Number.isFinite(m.typingMs)
        ? m.typingMs
        : rand(TYPING_MIN_MS, TYPING_MAX_MS);

      const jitter = m && m.noJitter ? 0 : TYPING_JITTER_MS;
      const delay = base + rand(0, jitter);

      showTyping();
      await sleep(delay);
      hideTyping();

      appendMessage(m);
    }
  }

  // ===== Envio de mensagem =====
  async function sendUserMessage(text) {
    if (!text || !text.trim()) return;

    appendMessage({ from: "user", text });

    // Mostra "digitando" imediatamente enquanto a API responde
    showTyping();

    try {
      const res = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();

      hideTyping();
      await displayMessagesWithTyping(data.messages || []);
    } catch (err) {
      hideTyping();
      console.error("Falha ao enviar:", err);
    }
  }

  // ===== UI: input =====
  if (sendBtn && inputEl) {
    sendBtn.addEventListener("click", () => {
      const v = inputEl.value.trim();
      if (!v) return;
      inputEl.value = "";
      sendUserMessage(v);
    });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }

  // ===== Boot: limpa sessão a cada F5 e busca mensagens iniciais =====
  (async () => {
    try {
      await fetch("/chat/reset", { method: "POST", cache: "no-store" });
      const r = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        body: JSON.stringify({ message: "" }),
      });
      const data = await r.json();
      await displayMessagesWithTyping(data.messages || []);
    } catch (err) {
      console.error("Falha no boot:", err);
    }
  })();
})();

(() => {
  /* ================== Utils ================== */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // delays de digitação “humanos”
  const TYPING_MIN_MS = 1200;
  const TYPING_MAX_MS = 2600;
  const TYPING_JITTER_MS = 220;

  // elementos básicos do widget
  const chatEl  = document.querySelector(".chat");
  const inputEl = document.querySelector(".cw-input input");
  const sendBtn = document.querySelector(".cw-input button");

  // gate enquanto um áudio “de roteiro” estiver tocando
  let afterAudioGate = { active: false, queue: [] };

  // helpers
  const normalize = (s) => (s || "").toString().trim().toLowerCase();
  const formatTime = (sec) => {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const onlyDigits = (v) => (v || "").replace(/\D+/g, "");

  function isProsseguirMsg(m) {
    if (!m || m.from !== "bot") return false;
    const hasProsseguirOption =
      Array.isArray(m.options) && m.options.some((o) => /prosseguir/i.test(o));
    const textHasProsseguir =
      typeof m.text === "string" && /(depois de ouvir|prosseguir)/i.test(m.text);
    return hasProsseguirOption || textHasProsseguir;
  }

  // remove uma pílula (em todas as aparições)
  function removeOptionEverywhere(label) {
    const key = normalize(label);
    document.querySelectorAll(`.pill[data-option="${key}"]`).forEach((btn) => {
      const optionsRow = btn.parentElement;
      const bubble = optionsRow && optionsRow.parentElement;
      btn.remove();
      if (optionsRow && optionsRow.classList.contains("options") && optionsRow.children.length === 0) {
        optionsRow.remove();
        if (bubble && bubble.classList.contains("msg") && !bubble.querySelector(".options") && bubble.textContent.trim() === "") {
          bubble.remove();
        }
      }
    });
  }

  /* ================== typing ================== */
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

  // remove bolha automaticamente após ms (ephemeral)
  function scheduleEphemeral(node, ms) {
    if (node && Number.isFinite(ms) && ms > 0) {
      setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, ms);
    }
  }

  /* ========== estilos do form/PIX (injetados para garantir visual) ========== */
  function injectFormStylesOnce() {
    if (document.getElementById("cw-form-styles")) return;
    const css = `
      .msg.bot.form-msg{
        background:#eef4ff;border:1px solid #d6e2ff;padding:14px 16px;border-radius:16px;
      }
      .cw-form-title{font-weight:600;margin-bottom:10px;color:#1a2b4b}
      .form-grid{display:grid;gap:10px}
      .form-field{display:flex;flex-direction:column;gap:6px}
      .form-label{font-size:12px;color:#4b5b7a;font-weight:600}
      .cw-input-field{
        height:40px;border:1px solid #cbd5e1;border-radius:10px;padding:0 12px;
        outline:none;background:#fff;transition:border-color .15s, box-shadow .15s;
      }
      .cw-input-field:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}
      .cw-input-field[readonly]{background:#f8fafc;color:#334155}
      .form-help{font-size:12px;color:#64748b}
      .form-error{font-size:12px;color:#b91c1c}
      .pill.primary{height:44px;border-radius:12px;font-weight:700}
      .btn-loading{position:relative;pointer-events:none;opacity:.85}
      .btn-loading::after{
        content:"";position:absolute;right:14px;top:50%;width:16px;height:16px;margin-top:-8px;
        border:2px solid #fff;border-top-color:transparent;border-radius:50%;
        animation:cwspin 1s linear infinite;
      }
      @keyframes cwspin{to{transform:rotate(360deg)}}
      .lock-note{font-size:11px;color:#64748b;margin-top:-4px}

      .pix-wrap{display:flex;flex-direction:column;gap:12px}
      .pix-qr{align-self:center;border-radius:12px;border:1px solid #e2e8f0;padding:8px;background:#fff}
      .codeBox{display:flex;gap:8px;align-items:center}
      .codeBox input{flex:1;height:40px;border:1px solid #cbd5e1;border-radius:10px;padding:0 10px;background:#f8fafc}
      .pill.secondary{background:#e2e8f0;color:#0f172a}

      .pix-instructions{font-size:13px;color:#334155}
      .status-line{font-size:13px}
      .status-wait{color:#b45309}
      .status-paid{color:#065f46}
      .row-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}

      /* cartão e chip de status */
      .pay-card { background:#eaf2ff;border-color:#d6e6ff; }
      .status-chip{
        display:inline-flex; align-items:center; gap:8px;
        padding:6px 10px; border-radius:999px; font-size:13px; font-weight:600;
        margin: 6px 0 2px 0;
      }
      .status-chip .dot{
        width:8px; height:8px; border-radius:50%;
        background:#b45309; box-shadow:0 0 0 3px rgba(244, 159, 10, .18) inset;
      }
      .status-chip.wait{ background:#fff7ed; color:#9a3412; border:1px solid #fed7aa; }
      .status-chip.paid{ background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; }

      /* player de áudio inline (barra de progresso) */
      .audio-wrap{ display:flex; flex-direction:column; gap:8px; }
      .audio-progress{ width:100%; height:6px; border-radius:999px; background:rgba(19,81,180,.18); overflow:hidden; }
      .audio-progress .bar{ height:100%; width:0%; background:#1351b4; transition:width .08s linear; }
    `;
    const style = document.createElement("style");
    style.id = "cw-form-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* máscara CPF + debounce */
  const cpfMask = (digits) => {
    const v = onlyDigits(digits).slice(0, 11);
    const p1 = v.slice(0, 3), p2 = v.slice(3, 6), p3 = v.slice(6, 9), p4 = v.slice(9, 11);
    let out = p1; if (p2) out += "." + p2; if (p3) out += "." + p3; if (p4) out += "-" + p4;
    return out;
  };
  const debounce = (fn, ms = 350) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ========== Player de áudio inline (reutilizável) ========== */
  function buildInlineAudioPlayer(src, title, onEnded) {
    const fmt = (sec) => {
      const s = Math.max(0, Math.floor(sec || 0));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };

    const wrap = document.createElement("div");
    wrap.className = "audio-wrap";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pill primary audio-btn";
    btn.setAttribute("aria-label", title || "Ouvir instruções");
    btn.textContent = "▶ 0:00 / …";

    const progress = document.createElement("div");
    progress.className = "audio-progress";
    const bar = document.createElement("div");
    bar.className = "bar";
    progress.appendChild(bar);

    const audio = new Audio(src);
    audio.preload = "metadata";

    let raf = 0;
    let total = "";

    const update = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        bar.style.width = Math.min(100, (audio.currentTime / audio.duration) * 100) + "%";
      }
      btn.textContent = `${audio.paused ? "▶" : "⏸"} ${fmt(audio.currentTime)} / ${total || "…"}`;
    };

    const tick = () => {
      if (!audio.paused && !audio.ended) {
        update();
        raf = requestAnimationFrame(tick);
      }
    };

    audio.addEventListener("loadedmetadata", () => {
      total = fmt(audio.duration);
      bar.style.width = "0%";
      update();
    });
    audio.addEventListener("play", () => {
      cancelAnimationFrame(raf);
      update();
      raf = requestAnimationFrame(tick);
    });
    audio.addEventListener("pause", () => {
      cancelAnimationFrame(raf);
      update();
    });
    audio.addEventListener("ended", () => {
      cancelAnimationFrame(raf);
      bar.style.width = "100%";
      btn.textContent = `↻ 0:00 / ${total}`;
      if (typeof onEnded === "function") onEnded();
    });

    btn.onclick = async () => {
      try {
        if (isNaN(audio.duration)) audio.load();
        if (audio.paused) await audio.play(); else audio.pause();
      } catch (e) { console.error(e); }
    };

    progress.addEventListener("click", (e) => {
      if (!isFinite(audio.duration) || audio.duration <= 0) return;
      const rect = progress.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
      update();
    });

    wrap.appendChild(btn);
    wrap.appendChild(progress);

    // Expor a instância de áudio para permitir autoplay programático
    wrap._audio = audio;

    return wrap;
  }

  /* ========== Form CPF+Nome+E-mail para criar PIX (opcional) ========== */
  function appendFormMessage() {
    injectFormStylesOnce();

    const wrap = document.createElement("div");
    wrap.className = "msg bot form-msg";

    const title = document.createElement("div");
    title.className = "cw-form-title";
    title.textContent = "Antes de gerar a DARF, preciso de alguns dados:";
    wrap.appendChild(title);

    const form = document.createElement("form");
    form.className = "form-grid";
    form.innerHTML = `
      <div class="form-field">
        <label class="form-label" for="cpf">CPF</label>
        <input type="text" id="cpf" name="cpf" placeholder="000.000.000-00" required class="cw-input-field" inputmode="numeric" autocomplete="off" />
        <div class="form-help" id="cpfHelp">Digite 11 dígitos para buscar o nome automaticamente.</div>
        <div class="form-error" id="cpfError" style="display:none"></div>
      </div>

      <div class="form-field">
        <label class="form-label" for="nome">Nome completo</label>
        <input type="text" id="nome" name="nome" class="cw-input-field" placeholder="Será preenchido pelo CPF" readonly />
        <div class="lock-note">Campo bloqueado — será preenchido automaticamente.</div>
      </div>

      <div class="form-field">
        <label class="form-label" for="email">E-mail</label>
        <input type="email" id="email" name="email" class="cw-input-field" placeholder="seuemail@dominio.com" required autocomplete="email" />
        <div class="form-error" id="emailError" style="display:none"></div>
      </div>

      <button type="submit" class="pill primary" id="submitBtn">Gerar pagamento</button>
    `;

    const cpfInput   = form.querySelector("#cpf");
    const nomeInput  = form.querySelector("#nome");
    const emailInput = form.querySelector("#email");
    const cpfError   = form.querySelector("#cpfError");
    const emailError = form.querySelector("#emailError");
    const submitBtn  = form.querySelector("#submitBtn");
    const cpfHelp    = form.querySelector("#cpfHelp");

    const setLoading = (on) => submitBtn.classList.toggle("btn-loading", !!on);
    const clearErrors = () => {
      cpfError.style.display = "none"; cpfError.textContent = "";
      emailError.style.display = "none"; emailError.textContent = "";
    };

    // máscara + limpeza
    cpfInput.addEventListener("input", () => {
      const raw = onlyDigits(cpfInput.value);
      cpfInput.value = cpfMask(raw);
      if (raw.length < 11) nomeInput.value = "";
    });

    // consulta nome via proxy /cpf-lookup (POST)
    const lookupName = debounce(async () => {
      const raw = onlyDigits(cpfInput.value);
      if (raw.length !== 11) return;
      try {
        setLoading(true);
        cpfHelp.textContent = "Consultando CPF…";
        nomeInput.value = "Pesquisando…";

        const resp = await fetch("/cpf-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          body: JSON.stringify({ cpf: raw })
        });
        if (!resp.ok) throw new Error("Falha na consulta");
        const data = await resp.json();
        const nome = (data && (data.NOME || data.nome || data.name)) || "";
        if (!nome) throw new Error("Nome não encontrado para o CPF informado.");
        nomeInput.value = nome;
        cpfHelp.textContent = "Nome preenchido automaticamente.";
      } catch (err) {
        nomeInput.value = "";
        cpfError.textContent = err.message || "Não foi possível consultar este CPF.";
        cpfError.style.display = "block";
        cpfHelp.textContent = "Digite novamente ou tente outro CPF.";
      } finally {
        setLoading(false);
      }
    }, 500);

    cpfInput.addEventListener("keyup", () => {
      const raw = onlyDigits(cpfInput.value);
      if (raw.length === 11) lookupName();
    });

    // submit -> cria PIX e mostra QR
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); clearErrors();

      const cpfRaw = onlyDigits(cpfInput.value);
      const nome   = (nomeInput.value || "").trim();
      const email  = (emailInput.value || "").trim();

      if (cpfRaw.length !== 11) {
        cpfError.textContent = "CPF deve ter 11 dígitos.";
        cpfError.style.display = "block";
        return;
      }
      if (!nome) {
        cpfError.textContent = "Não foi possível preencher o nome. Verifique o CPF.";
        cpfError.style.display = "block";
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailError.textContent = "Informe um e-mail válido.";
        emailError.style.display = "block";
        return;
      }

      // eco do usuário — guardamos o nó pra remover depois
      const echoNode = appendMessage({ from: "user", text: `CPF: ${cpfMask(cpfRaw)} | Nome: ${nome} | E-mail: ${email}` });

      // cria PIX
      showTyping();
      try {
        const resp = await fetch("/api/payments/pix", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          body: JSON.stringify({ nome, cpf: cpfRaw, email })
        });
        const data = await resp.json();
        hideTyping();

        if (!resp.ok || !data?.qrcode || !data?.id) {
          appendMessage({ from: "bot", text: "Não consegui gerar o PIX agora. Tente novamente em instantes." });
          console.warn("PIX error:", data);
          return;
        }

        // remove o form e o eco do usuário
        wrap.remove();
        if (echoNode && echoNode.parentNode) echoNode.parentNode.removeChild(echoNode);

        // mostra QR + áudio + copia/cola + “Já paguei” (após o áudio)
        renderPixResult(data.qrcode, data.id);
      } catch (err) {
        hideTyping();
        console.error("Falha ao criar PIX:", err);
        appendMessage({ from: "bot", text: "Falha de comunicação ao gerar o PIX." });
      }
    });

    wrap.appendChild(form);
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  /* ====== renderizar resultado PIX (QR + áudio + chip de status + já paguei) ====== */
  function renderPixResult(qrcodeStr, txId) {
    injectFormStylesOnce();

    const wrap = document.createElement("div");
    wrap.className = "msg bot pay-card";

    const cont = document.createElement("div");
    cont.className = "pix-wrap";

    const headline = document.createElement("div");
    headline.innerHTML = "<strong>Use o QR Code ou copie o código PIX abaixo.</strong>";
    cont.appendChild(headline);

    // chip de status
    const chip = document.createElement("div");
    chip.className = "status-chip wait";
    chip.innerHTML = '<span class="dot"></span><span>Aguardando pagamento…</span>';
    cont.appendChild(chip);

    // QR
    const img = document.createElement("img");
    img.className = "pix-qr";
    img.alt = "QR Code PIX";
    img.width = 280;
    img.height = 280;
    img.src = `/api/pix/qrcode?text=${encodeURIComponent(qrcodeStr)}`;
    cont.appendChild(img);

    // código copia e cola
    const codeBox = document.createElement("div");
    codeBox.className = "codeBox";
    const input = document.createElement("input");
    input.type = "text";
    input.readOnly = true;
    input.value = qrcodeStr;
    input.title = "Código copia e cola do PIX";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "pill secondary";
    copyBtn.textContent = "Copiar";
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(qrcodeStr);
        copyBtn.textContent = "Copiado!";
        setTimeout(() => (copyBtn.textContent = "Copiar"), 1400);
      } catch {
        input.select(); document.execCommand("copy");
        copyBtn.textContent = "Copiado!";
        setTimeout(() => (copyBtn.textContent = "Copiar"), 1400);
      }
    };
    codeBox.appendChild(input);
    codeBox.appendChild(copyBtn);
    cont.appendChild(codeBox);

    // áudio de instruções (aparece logo depois do QR)
    const PAY_AUDIO_SRC = "/audio/pagamento-instrucoes.mp3"; // ajuste o arquivo no servidor
    const audioTitle = document.createElement("div");
    audioTitle.className = "pix-instructions";
    audioTitle.textContent = "Ouça rapidamente as instruções antes de confirmar o pagamento:";
    cont.appendChild(audioTitle);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "pill primary";
    checkBtn.textContent = "Já paguei";
    checkBtn.style.display = "none"; // só libera após o áudio
    actions.appendChild(checkBtn);

    const audioPlayer = buildInlineAudioPlayer(
      PAY_AUDIO_SRC,
      "Instruções de pagamento",
      () => { checkBtn.style.display = ""; } // revela o botão ao terminar
    );
    cont.appendChild(audioPlayer);

    const instruct = document.createElement("div");
    instruct.className = "pix-instructions";
    instruct.textContent = "Após ouvir as instruções, confirme seu pagamento abaixo.";
    cont.appendChild(instruct);

    cont.appendChild(actions);

    // checagem de status
    let checking = false;
    checkBtn.addEventListener("click", async () => {
      if (checking) return;
      checking = true;
      const old = checkBtn.textContent;
      checkBtn.textContent = "Verificando…";
      checkBtn.disabled = true;

      try {
        const r = await fetch(`/api/payments/status/${encodeURIComponent(txId)}`, {
          method: "GET",
          headers: { Accept: "application/json", "Cache-Control": "no-store" },
        });
        const data = await r.json();

        if (!r.ok || !data?.ok) {
          chip.className = "status-chip wait";
          chip.innerHTML = '<span class="dot"></span><span>Não consegui confirmar agora. Tente novamente.</span>';
          checkBtn.disabled = false;
          checkBtn.textContent = old;
          return;
        }

        const st = String(data.status || "").toLowerCase();
        const waiting = ["waiting_payment", "pending", "created", "waiting"].includes(st);

        if (waiting) {
          chip.className = "status-chip wait";
          chip.innerHTML = '<span class="dot"></span><span>Pagamento ainda pendente. Assim que compensar, confirme novamente.</span>';
          checkBtn.disabled = false;
          checkBtn.textContent = old;
        } else {
          // status pago
          chip.className = "status-chip paid";
          chip.innerHTML = "Pagamento confirmado! ✅";

          // Mensagem curta pós-pagamento
          const confirmMsg = document.createElement("div");
          confirmMsg.className = "pix-instructions";
          confirmMsg.innerHTML =
            'Em até <strong>72 horas</strong> você receberá no e-mail cadastrado o <strong>Documento Liberatório</strong>, ' +
            'válido em todos os Centros de Formação de Condutores (CFC). ' +
            'Ao receber, apresente-o no CFC mais próximo.';
          cont.appendChild(confirmMsg);

          // Player de ÁUDIO da confirmação
          const CONFIRM_AUDIO_SRC = "/audio/pagamento-confirmado.mp3"; // coloque este arquivo no /public/audio
          const confirmPlayer = buildInlineAudioPlayer(
            CONFIRM_AUDIO_SRC,
            "Confirmação de pagamento"
          );
          cont.appendChild(confirmPlayer);

          // tenta reproduzir automaticamente (geralmente permitido pois veio de um clique)
          try { await confirmPlayer._audio.play(); } catch (e) { /* usuário pode apertar ▶ */ }

          // remove o botão "Já paguei"
          checkBtn.remove();
        }
      } catch (e) {
        chip.className = "status-chip wait";
        chip.innerHTML = '<span class="dot"></span><span>Falha de comunicação ao consultar o status.</span>';
        checkBtn.disabled = false;
        checkBtn.textContent = old;
      } finally {
        checking = false;
      }
    });

    wrap.appendChild(cont);
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  /* ================== render genérico ================== */
  function appendMessage(m) {
    // USER
    if (m.from === "user") {
      const wrap = document.createElement("div");
      wrap.className = "msg user";
      wrap.textContent = m.text || "";
      chatEl.appendChild(wrap);
      chatEl.scrollTop = chatEl.scrollHeight;
      return wrap;
    }

    // BOT: apenas opções (sem texto)
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
      return wrap;
    }

    // BOT: mensagem com ÁUDIO do roteiro (ex.: "como funciona")
    if (m.audio && m.audio.src) {
      const wrap = document.createElement("div");
      wrap.className = "msg bot";

      const stripDuration = (s) => (s || "").replace(/\s*\(\d+:\d{2}\)\s*$/, "").trim();
      const ariaTitle = stripDuration(m.audio.title || "Ouvir explicação");

      const player = document.createElement("div");
      player.className = "audio-wrap";

      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "pill primary audio-btn";
      playBtn.setAttribute("aria-label", ariaTitle);
      playBtn.textContent = `▶ 0:00 / …`;

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
          updateProgress(); setLabel();
          if (!audio.paused) rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      };

      audio.addEventListener("loadedmetadata", () => { totalStr = formatTime(audio.duration); bar.style.width = "0%"; setLabel(); });
      audio.addEventListener("timeupdate", () => { updateProgress(); setLabel(); });
      audio.addEventListener("seeked", () => { updateProgress(); setLabel(); });
      audio.addEventListener("play", () => { playBtn.classList.add("used"); startTicker(); });
      audio.addEventListener("pause", () => { cancelAnimationFrame(rafId); updateProgress(); setLabel(); });

      audio.addEventListener("ended", async () => {
        cancelAnimationFrame(rafId);
        bar.style.width = "100%";
        playBtn.disabled = false;
        playBtn.textContent = `↻ 0:00 / ${totalStr}`;

        removeOptionEverywhere("Como funciona");
        if (afterAudioGate.active) { afterAudioGate.queue = []; afterAudioGate.active = false; }

        const title = (m.audio.title || "").toLowerCase();
        const src = (m.audio.src || "").toLowerCase();
        const isFinalAudio = /proximos\-passos\.mp3$/.test(src) || /próximos passos|proximos passos/.test(title);

        if (isFinalAudio) {
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
            appendMessage({ from: "bot", text: "Certo! Preencha os dados para gerar o pagamento:" });
            appendFormMessage();
            payBtn.disabled = true;
            payBtn.classList.add("used");
          });
          row.appendChild(payBtn);
          payWrap.appendChild(row);
          chatEl.appendChild(payWrap);
          chatEl.scrollTop = chatEl.scrollHeight;
        } else {
          showTyping();
          await sleep(1500 + Math.floor(Math.random() * 500));
          hideTyping();
          appendMessage({ from: "bot", options: ["Prosseguir"], text: "" });
        }
      });

      playBtn.onclick = async () => {
        try {
          if (isNaN(audio.duration)) { try { audio.load(); } catch {} }
          if (audio.paused) await audio.play(); else audio.pause();
        } catch (err) {
          console.error("Falha ao reproduzir:", err);
        }
      };

      progress.addEventListener("click", (e) => {
        if (!isFinite(audio.duration) || audio.duration <= 0) return;
        const rect = progress.getBoundingClientRect();
        const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        audio.currentTime = pct * audio.duration;
        updateProgress(); setLabel();
      });

      afterAudioGate.active = true;

      player.appendChild(playBtn);
      player.appendChild(progress);
      wrap.appendChild(player);
      chatEl.appendChild(wrap);
      chatEl.scrollTop = chatEl.scrollHeight;
      scheduleEphemeral(wrap, m.ephemeralMs);
      return wrap;
    }

    // BOT: texto padrão
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
        btn.addEventListener("click", () => { removeOptionEverywhere(label); sendUserMessage(label); });
        row.appendChild(btn);
      });
      wrap.appendChild(row);
    }
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
    scheduleEphemeral(wrap, m.ephemeralMs);
    return wrap;
  }

  /* ================== fluxo de mensagens ================== */
  async function displayMessagesWithTyping(messages) {
    for (const m of messages || []) {
      if (m.from && m.from !== "bot") continue;

      // segura mensagens de “Prosseguir” enquanto áudio do roteiro estiver ativo
      if (afterAudioGate.active && isProsseguirMsg(m)) {
        afterAudioGate.queue.push(m);
        continue;
      }
      if (m.audio && m.audio.src) afterAudioGate.active = true;

      const base = Number.isFinite(m.typingMs) ? m.typingMs : rand(TYPING_MIN_MS, TYPING_MAX_MS);
      const jitter = m && m.noJitter ? 0 : TYPING_JITTER_MS;
      const delay = base + rand(0, jitter);

      showTyping();
      await sleep(delay);
      hideTyping();
      appendMessage(m);
    }
  }

  /* ================== envio de mensagem ================== */
  async function sendUserMessage(text) {
    if (!text || !text.trim()) return;
    appendMessage({ from: "user", text });
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

  // entrada do usuário
  if (sendBtn && inputEl) {
    sendBtn.addEventListener("click", () => {
      const v = inputEl.value.trim();
      if (!v) return;
      inputEl.value = "";
      sendUserMessage(v);
    });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); sendBtn.click(); }
    });
  }

  // boot
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

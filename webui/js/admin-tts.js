// admin「まいAI」タブ 声テスト（テキスト → maiの声: /api/admin/chat/speak 経由）
// 文単位ストリーム再生: 最初の文の合成完了と同時に再生を開始し、再生中に次の文を合成する
(function () {
  const btn = document.getElementById("btn-tts-gen");
  const textEl = document.getElementById("tts-test-text");
  const statusEl = document.getElementById("tts-status");
  const audioEl = document.getElementById("tts-audio");
  const dlEl = document.getElementById("tts-dl");
  const stepsEl = document.getElementById("tts-steps");
  if (!btn || !textEl) return;

  const MAX_LEN = 1200;
  const SEG_MAX = 80; // 1リクエストの最大文字数（長すぎる文は分割）
  let busy = false;
  let lastUrl = null;
  let runId = 0; // 生成の打ち切り判定用
  let activeAc = null; // 進行中のfetch

  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.style.color = isErr ? "#c0392b" : "#666";
  }

  // 文単位に分割（終端記号の直後で切る。短いかけらは次に合流、長すぎる文は80字で分割）
  function splitSentences(text) {
    const rough = [];
    let cur = "";
    for (const ch of text) {
      cur += ch;
      if ("。！？…\n".includes(ch)) {
        rough.push(cur);
        cur = "";
      }
    }
    if (cur.trim()) rough.push(cur);
    const merged = [];
    for (const s of rough) {
      const t = s.trim();
      if (!t) continue;
      if (merged.length && (merged[merged.length - 1].trim().length < 6 || t.length < 4)) {
        merged[merged.length - 1] += " " + t;
      } else {
        merged.push(t);
      }
    }
    const out = [];
    for (const s of merged) {
      if (s.length <= SEG_MAX) { out.push(s); continue; }
      let rest = s;
      while (rest.length > SEG_MAX) {
        let cut = rest.lastIndexOf("、", SEG_MAX);
        if (cut < 20) cut = SEG_MAX;
        out.push(rest.slice(0, cut + (cut < SEG_MAX ? 1 : 0)).trim());
        rest = rest.slice(cut + (cut < SEG_MAX ? 1 : 0)).trim();
      }
      if (rest) out.push(rest);
    }
    return out;
  }

  function splitWav(view) {
    // 最小WAVデコード: Int16 mono PCM 部分だけ取り出す
    const dv = new DataView(view);
    let pos = 12;
    let sr = 44100;
    let data = null;
    while (pos + 8 <= view.byteLength) {
      const id = String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos + 1), dv.getUint8(pos + 2), dv.getUint8(pos + 3));
      const size = dv.getUint32(pos + 4, true);
      if (id === "fmt ") sr = dv.getUint32(pos + 12, true);
      if (id === "data") { data = new Int16Array(view, pos + 8, Math.floor(size / 2)); break; }
      pos += 8 + size + (size % 2);
    }
    if (!data) throw new Error("wav data not found");
    return { sr, pcm: data };
  }

  function concatWavs(buffers) {
    if (!buffers.length) return null;
    const parts = buffers.map((b) => splitWav(b));
    const sr = parts[0].sr;
    let total = 0;
    for (const p of parts) total += p.pcm.length;
    const pcm = new Int16Array(total);
    let off = 0;
    for (const p of parts) { pcm.set(p.pcm, off); off += p.pcm.length; }
    const dataLen = pcm.byteLength;
    const buf = new ArrayBuffer(44 + dataLen);
    const dv = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); dv.setUint32(4, 36 + dataLen, true); w(8, "WAVE");
    w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, "data"); dv.setUint32(40, dataLen, true);
    new Int16Array(buf, 44, pcm.length).set(pcm);
    return new Blob([buf], { type: "audio/wav" });
  }

  btn.addEventListener("click", async () => {
    if (busy) return;
    const text = textEl.value.trim();
    if (!text) { setStatus("テキストを入力してね", true); return; }
    if (text.length > MAX_LEN) {
      setStatus(MAX_LEN + "文字以内にしてね（現在 " + text.length + " 文字）", true);
      return;
    }
    const segs = splitSentences(text);
    busy = true;
    btn.disabled = true;
    const myRun = ++runId;
    const t0 = performance.now();
    let firstAudioAt = null;
    let playIdx = 0;
    const buffers = [];
    const urls = [];
    let player = null;

    const playQueue = () => {
      if (myRun !== runId) return;
      if (playIdx >= urls.length) return;
      const url = urls[playIdx];
      player = new Audio(url);
      const next = () => {
        if (myRun !== runId || player === null) return;
        player = null;
        playIdx++;
        playQueue();
      };
      player.onended = next;
      player.onerror = next;
      player.play().catch(next);
    };

    setStatus(segs.length > 1 ? `1/${segs.length} 文を生成中…（最初の音声まで数秒）` : "生成中…（数秒かかります）");
    try {
      for (let i = 0; i < segs.length; i++) {
        if (myRun !== runId) return;
        activeAc = new AbortController();
        const r = await fetch("/api/admin/chat/speak", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: segs[i],
            num_steps: stepsEl ? Number(stepsEl.value) : undefined,
          }),
          signal: activeAc.signal,
        });
        if (r.status === 401) { location.href = "/admin/login.html"; return; }
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setStatus("生成に失敗: " + (j.error || r.status), true);
          return;
        }
        const buf = await r.arrayBuffer();
        if (myRun !== runId) return;
        buffers.push(buf);
        const url = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
        urls.push(url);
        if (firstAudioAt === null) {
          firstAudioAt = performance.now() - t0;
          playQueue(); // 最初の文だけで再生開始（残りは生成しながら追随）
          setStatus(`再生開始 ${ (firstAudioAt / 1000).toFixed(1) } 秒目！（${i + 1}/${segs.length} 文）`);
        } else if (playIdx >= urls.length - 1 && i < segs.length - 1) {
          setStatus(`${i + 1}/${segs.length} 文を生成中…`);
        }
      }
      // 全文完了を待ってから終了表示（再生は並行中）
      const total = ((performance.now() - t0) / 1000).toFixed(1);
      let sizeKB = 0;
      try {
        const combined = concatWavs(buffers);
        if (combined && myRun === runId) {
          sizeKB = (combined.size / 1024).toFixed(0);
          if (lastUrl) URL.revokeObjectURL(lastUrl);
          lastUrl = URL.createObjectURL(combined);
          if (dlEl) { dlEl.href = lastUrl; dlEl.style.display = ""; }
          // 再生後に鳴り終わった頃、要素の再生元を結合版に差し替え（巻き戻し再生用）
          if (audioEl) {
            const swap = () => {
              if (myRun !== runId) return;
              if (player !== null) { setTimeout(swap, 500); return; }
              audioEl.src = lastUrl;
              audioEl.style.display = "";
            };
            setTimeout(swap, 300);
          }
        }
      } catch (e) { /* 結合に失敗しても再生は済んでいる */ }
      setStatus(`完成！ 再生開始 ${ (firstAudioAt !== null ? (firstAudioAt / 1000).toFixed(1) : "-") } 秒／全 ${ total } 秒（${ sizeKB } KB・${ segs.length } 文）`);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setStatus("通信エラー: " + e.message, true);
    } finally {
      if (myRun === runId) {
        busy = false;
        btn.disabled = false;
        activeAc = null;
      }
    }
  });
})();

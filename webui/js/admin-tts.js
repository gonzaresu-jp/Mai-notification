// admin「まいAI」タブ 声テスト（テキスト → maiの声: /api/admin/chat/speak 経由）
// 文単位ストリーム再生: 最初の文の合成完了と同時に再生を開始し、再生中に次の文を合成する。
// 継ぎ目は Web Audio でギャップレス＋10msクロスフェード、端部は無音トリムしてノイズ段差を消す。
(function () {
  const btn = document.getElementById("btn-tts-gen");
  const textEl = document.getElementById("tts-test-text");
  const statusEl = document.getElementById("tts-status");
  const audioEl = document.getElementById("tts-audio");
  const dlEl = document.getElementById("tts-dl");
  const stepsEl = document.getElementById("tts-steps");
  if (!btn || !textEl) return;
  const dl = dlEl;

  const MAX_LEN = 1200;
  const SEG_MAX = 80; // 1リクエストの最大文字数（長すぎる文は分割）
  const FADE = 0.010; // 継ぎ目のクロスフェード（秒）
  const TRIM_TH = 0.01; // 端無音トリム閾値（正規化振幅）
  const TRIM_KEEP = 0.02; // トリム時に残すマージン（秒）
  let busy = false;
  let lastUrl = null;
  let runId = 0;

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

  // WAVバイナリから Int16 PCM とサンプルレートを取り出す
  function splitWav(view) {
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

  // 先頭・末尾の微小ノイズを削ってから連結し、継ぎ目にクロスフェードを入れる
  function concatWavs(buffers) {
    if (!buffers.length) return null;
    const parts = buffers.map((b) => {
      const { sr, pcm } = splitWav(b);
      // 端トリム（振幅しきい値で最初と最後のノイズ帯を落とす）
      let a = 0;
      let z = pcm.length - 1;
      const th = 32767 * TRIM_TH;
      while (a < z && Math.abs(pcm[a]) < th) a++;
      while (z > a && Math.abs(pcm[z]) < th) z--;
      const keep = Math.round(sr * TRIM_KEEP);
      a = Math.max(0, a - keep);
      z = Math.min(pcm.length - 1, z + keep);
      return { sr, pcm: pcm.subarray(a, z + 1) };
    });
    const sr = parts[0].sr;
    const fadeN = Math.round(sr * FADE);
    let total = 0;
    for (const p of parts) total += p.pcm.length;
    if (parts.length > 1) total -= fadeN * (parts.length - 1); // 重なり分
    const pcm = new Int16Array(total);
    let off = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === 0) {
        pcm.set(p.pcm, 0);
        off = p.pcm.length;
        continue;
      }
      const prev = parts[i - 1];
      // 直前の末尾 fadeN サンプルをこのセグメントの先頭とクロスフェード
      const start = off - fadeN;
      for (let k = 0; k < fadeN; k++) {
        const t = (k + 1) / (fadeN + 1);
        const pv = pcm[start + k] !== undefined ? pcm[start + k] : prev.pcm[prev.pcm.length - fadeN + k];
        pcm[start + k] = Math.round(pv * (1 - t) + p.pcm[k] * t);
      }
      pcm.set(p.pcm.subarray(fadeN), off);
      off += p.pcm.length - fadeN;
    }
    const dataLen = off * 2;
    const buf = new ArrayBuffer(44 + dataLen);
    const dv = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); dv.setUint32(4, 36 + dataLen, true); w(8, "WAVE");
    w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, "data"); dv.setUint32(40, dataLen, true);
    new Int16Array(buf, 44, off).set(pcm.subarray(0, off));
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
    const buffers = [];

    // Web Audio: ギャップレス再生用スケジューラ
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume().catch(() => {});
    let boundary = null; // 次のセグメント開始境界（actx時刻）
    let prevGain = null;

    const schedule = (abuf) => {
      if (myRun !== runId) return;
      const ch = abuf.getChannelData(0);
      // 端トリム（正規化振幅しきい値）
      let a = 0;
      let z = ch.length - 1;
      while (a < z && Math.abs(ch[a]) < TRIM_TH) a++;
      while (z > a && Math.abs(ch[z]) < TRIM_TH) z--;
      const keep = Math.round(abuf.sampleRate * TRIM_KEEP);
      a = Math.max(0, a - keep);
      z = Math.min(ch.length - 1, z + keep);
      const offset = a / abuf.sampleRate;
      const dur = (z - a + 1) / abuf.sampleRate;
      if (dur <= 0.01) return;

      const src = actx.createBufferSource();
      src.buffer = abuf;
      const gain = actx.createGain();
      src.connect(gain).connect(actx.destination);

      let startAt;
      if (boundary === null) {
        startAt = actx.currentTime + 0.08;
        gain.gain.setValueAtTime(1, startAt);
        src.start(startAt, offset, dur);
      } else if (boundary - actx.currentTime > FADE * 2) {
        // 前セグメントの末尾と10ms重ねてクロスフェード
        startAt = boundary - FADE;
        if (prevGain) {
          try {
            prevGain.gain.setValueAtTime(1, boundary - FADE);
            prevGain.gain.linearRampToValueAtTime(0.0001, boundary);
          } catch (e) { /* 時刻済み等は無視 */ }
        }
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.linearRampToValueAtTime(1, startAt + FADE);
        src.start(startAt, offset, dur);
      } else {
        // 追いついてしまった場合は直後にハード接続（フェードなし）
        startAt = Math.max(actx.currentTime + 0.01, boundary);
        gain.gain.setValueAtTime(1, startAt);
        src.start(startAt, offset, dur);
      }
      boundary = startAt + dur;
      prevGain = gain;
    };

    setStatus(segs.length > 1 ? `1/${segs.length} 文を生成中…（最初の音声まで数秒）` : "生成中…（数秒かかります）");
    try {
      for (let i = 0; i < segs.length; i++) {
        if (myRun !== runId) return;
        const r = await fetch("/api/admin/chat/speak", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: segs[i],
            num_steps: stepsEl ? Number(stepsEl.value) : undefined,
          }),
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
        const abuf = await actx.decodeAudioData(buf.slice(0));
        if (myRun !== runId) return;
        schedule(abuf);
        if (firstAudioAt === null) {
          firstAudioAt = performance.now() - t0;
          setStatus(`再生開始 ${ (firstAudioAt / 1000).toFixed(1) } 秒目！（${i + 1}/${segs.length} 文）`);
        } else {
          setStatus(`${i + 1}/${segs.length} 文を生成中…`);
        }
      }
      const total = ((performance.now() - t0) / 1000).toFixed(1);
      let sizeKB = 0;
      try {
        const combined = concatWavs(buffers);
        if (combined && myRun === runId) {
          sizeKB = (combined.size / 1024).toFixed(0);
          if (lastUrl) URL.revokeObjectURL(lastUrl);
          lastUrl = URL.createObjectURL(combined);
          if (dl) { dl.href = lastUrl; dl.style.display = ""; }
          if (audioEl) { audioEl.src = lastUrl; audioEl.style.display = ""; }
        }
      } catch (e) { /* 結合に失敗しても再生は済んでいる */ }
      setStatus(`完成！ 再生開始 ${ firstAudioAt !== null ? (firstAudioAt / 1000).toFixed(1) : "-" } 秒／全 ${ total } 秒（${ sizeKB } KB・${ segs.length } 文）`);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setStatus("通信エラー: " + e.message, true);
    } finally {
      if (myRun === runId) {
        busy = false;
        btn.disabled = false;
      }
    }
  });
})();

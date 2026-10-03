// admin「まいAI」タブ 声テスト（テキスト → maiの声: /api/admin/chat/speak 経由）
(function () {
  const btn = document.getElementById("btn-tts-gen");
  const textEl = document.getElementById("tts-test-text");
  const statusEl = document.getElementById("tts-status");
  const audioEl = document.getElementById("tts-audio");
  const dlEl = document.getElementById("tts-dl");
  const stepsEl = document.getElementById("tts-steps");
  if (!btn || !textEl) return;

  const MAX_LEN = 1200;
  let busy = false;
  let lastUrl = null;

  function setStatus(msg, isErr) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.style.color = isErr ? "#c0392b" : "#666";
  }

  btn.addEventListener("click", async () => {
    if (busy) return;
    const text = textEl.value.trim();
    if (!text) { setStatus("テキストを入力してね", true); return; }
    if (text.length > MAX_LEN) {
      setStatus(MAX_LEN + "文字以内にしてね（現在 " + text.length + " 文字）", true);
      return;
    }
    busy = true;
    btn.disabled = true;
    const t0 = performance.now();
    setStatus("まいが生成中…（CPUなので10〜30秒ほどかかることがあります）");
    try {
      const r = await fetch("/api/admin/chat/speak", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, num_steps: stepsEl ? Number(stepsEl.value) : undefined }),
      });
      if (r.status === 401) { location.href = "/admin/login.html"; return; }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setStatus("生成に失敗: " + (j.error || r.status), true);
        return;
      }
      const blob = await r.blob();
      const sec = ((performance.now() - t0) / 1000).toFixed(1);
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);
      if (audioEl) {
        audioEl.src = lastUrl;
        audioEl.style.display = "";
        audioEl.play().catch(() => {});
      }
      if (dlEl) { dlEl.href = lastUrl; dlEl.style.display = ""; }
      setStatus("完成！ " + sec + "秒（" + (blob.size / 1024).toFixed(0) + " KB）");
    } catch (e) {
      setStatus("通信エラー: " + e.message, true);
    } finally {
      busy = false;
      btn.disabled = false;
    }
  });
})();

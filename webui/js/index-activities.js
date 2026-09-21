
    (function () {
      const PERIOD = { MORNING:'朝', NOON:'昼', EVENING:'夕方', NIGHT:'夜', LATE_NIGHT:'深夜' };
      const pad = n => String(n).padStart(2, '0');
      function nowNaiveJst() { const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
      function fmtWhen(ev) {
        const dt = new Date(String(ev.start_time||'').replace(' ', 'T'));
        const dstr = Number.isFinite(dt.getTime())
          ? dt.toLocaleDateString('ja-JP', { month:'long', day:'numeric', weekday:'short', timeZone:'Asia/Tokyo' })
          : (ev.start_time||'');
        const hasSpecificTime = Number.isFinite(dt.getTime()) && ev.start_time && /T\d{2}:\d{2}/.test(ev.start_time);
        if (!hasSpecificTime && ev.time_period && PERIOD[ev.time_period]) return `${dstr} ${PERIOD[ev.time_period]}ごろ`;
        const t = hasSpecificTime ? dt.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Tokyo' }) : '';
        return t ? `${dstr} ${t}` : dstr;
      }
      async function loadNext() {
        try {
          const from = encodeURIComponent(nowNaiveJst());
          const r = await fetch(`/api/events?from=${from}&status=scheduled&limit=10`);
          if (!r.ok) return;
          const j = await r.json();
          const items = (j.items||[]).filter(e => e.start_time && e.event_type!=='memo' && e.status!=='cancelled');
          if (!items.length) return; // 予定なし → 枠は出さない
          const ev = items[0];
          document.getElementById('ne-title').textContent = ev.title || '配信予定';
          document.getElementById('ne-when').textContent = fmtWhen(ev);
          document.getElementById('ne-plat').textContent = ev.platform ? `/ ${ev.platform}` : '';
          const card = document.getElementById('next-event');
          const img = document.getElementById('ne-img');
          img.src = ev.thumbnail_url || './icon-192.webp';
          img.alt = ev.title || '';
          if (ev.url) card.href = ev.url; else card.removeAttribute('href');
          card.classList.add('show');
        } catch (e) { /* 失敗時は枠を出さない */ }
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadNext);
      else loadNext();
    })();
    

function rssEscapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function rssSafeUrl(raw) {
    if (!raw) return '';
    try {
        const parsed = new URL(String(raw).trim(), window.location.origin);
        const protocol = String(parsed.protocol || '').toLowerCase();
        if (protocol !== 'http:' && protocol !== 'https:') return '';
        return parsed.toString();
    } catch {
        return '';
    }
}

async function loadRSS(){
    const urlInput = document.getElementById('url');
    const result = document.getElementById('result');
    const feedUrl = rssSafeUrl(urlInput ? urlInput.value : '');
    result.innerHTML = 'Loading...';

    if (!feedUrl) {
        result.innerHTML = '<div class="error">無効なURLです</div>';
        return;
    }

    try{
        const res = await fetch(feedUrl);
        const text = await res.text();

        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "application/xml");

        if(xml.querySelector("parsererror")){
            result.innerHTML = '<div class="error">XML parse error</div><pre>' + rssEscapeHtml(text.slice(0, 2000)) + '</pre>';
            return;
        }

        const items = [...xml.querySelectorAll("item")];

        if(!items.length){
            result.innerHTML = 'item 0件';
            return;
        }

        result.innerHTML = items.map(item=>{
            const title = rssEscapeHtml(item.querySelector("title")?.textContent || "");
            const link  = rssSafeUrl(item.querySelector("link")?.textContent || "");
            // description は HTML 断片を含みうるため、埋め込まず textContent で安全に流し込む
            const descRaw = item.querySelector("description")?.textContent || "";
            const date  = rssEscapeHtml(item.querySelector("pubDate")?.textContent || "");
            const img   = rssSafeUrl(item.querySelector("enclosure")?.getAttribute("url") || "");

            const itemEl = document.createElement('div');
            itemEl.className = 'item';
            itemEl.innerHTML = `
                <div class="title"></div>
                <div class="date">${date}</div>
                <div class="desc"></div>
            `;
            const titleEl = itemEl.querySelector('.title');
            if (link) {
                const a = document.createElement('a');
                a.href = link;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = item.querySelector("title")?.textContent || '';
                titleEl.appendChild(a);
            } else {
                titleEl.textContent = item.querySelector("title")?.textContent || '';
            }
            itemEl.querySelector('.desc').textContent = descRaw;
            if (img) {
                const imgEl = document.createElement('img');
                imgEl.src = img;
                imgEl.alt = item.querySelector("title")?.textContent || '';
                imgEl.loading = 'lazy';
                imgEl.referrerPolicy = 'no-referrer';
                itemEl.appendChild(imgEl);
            }
            return itemEl.outerHTML;
        }).join("");

    }catch(e){
        result.textContent = 'RSS取得エラー: ' + (e && e.message ? e.message : e);
    }
}

loadRSS();

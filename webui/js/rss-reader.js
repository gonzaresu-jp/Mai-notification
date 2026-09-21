
async function loadRSS(){
    const url = document.getElementById('url').value;
    const result = document.getElementById('result');
    result.innerHTML = 'Loading...';

    try{
        const res = await fetch(url);
        const text = await res.text();

        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "application/xml");

        if(xml.querySelector("parsererror")){
            result.innerHTML = '<div class="error">XML parse error</div><pre>'+text+'</pre>';
            return;
        }

        const items = [...xml.querySelectorAll("item")];

        if(!items.length){
            result.innerHTML = 'item 0件';
            return;
        }

        result.innerHTML = items.map(item=>{
            const title = item.querySelector("title")?.textContent || "";
            const link  = item.querySelector("link")?.textContent || "";
            const desc  = item.querySelector("description")?.textContent || "";
            const date  = item.querySelector("pubDate")?.textContent || "";
            const img   = item.querySelector("enclosure")?.getAttribute("url") || "";

            return `
                <div class="item">
                    <div class="title">
                        <a href="${link}" target="_blank">${title}</a>
                    </div>
                    <div class="date">${date}</div>
                    <div>${desc}</div>
                    ${img ? `<img src="${img}" alt="${title}">` : ""}
                </div>
            `;
        }).join("");

    }catch(e){
        result.innerHTML = '<div class="error">'+e+'</div>';
    }
}

loadRSS();

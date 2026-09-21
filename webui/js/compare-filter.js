const secs=[...document.querySelectorAll("section")];
const q=document.getElementById("q");
const btn=document.getElementById("btnBoth");
let bothOnly=false;
function apply(){
  const term=q.value.trim().toLowerCase();
  let shownSec=0, shownRow=0, totalRow=0;
  for(const s of secs){
    let secShow=false;
    for(const tr of s.querySelectorAll("tr")){
      if(!tr.querySelector("td")) continue;
      totalRow++;
      const has=tr.dataset.has==="1";
      const txt=tr.textContent.toLowerCase();
      const ok=term&& !txt.includes(term) ? false : (bothOnly?has:true);
      tr.style.display=ok?"":"none";
      if(ok){secShow=true;shownRow++;}
    }
    const sShow=term?false:true;
    s.classList.toggle("hide",!secShow&&term);
    if((term&&secShow)||(!term&&sShow==true&&s.querySelectorAll("tr").length>1||(!term&&secShow))) shownSec++;
  }
  document.getElementById("stats").textContent=shownRow+"/"+totalRow+" 行表示";
}
q.addEventListener("input",apply);
btn.addEventListener("click",()=>{bothOnly=!bothOnly;btn.classList.toggle("on",bothOnly);apply();});
apply();
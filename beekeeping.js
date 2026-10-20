"use strict";
const scene=document.querySelector('.seasonScene');
const controls=document.querySelector('.seasonControls');
if(scene&&controls){
  const buttons=Array.from(controls.querySelectorAll('button'));
  function choose(key){
    scene.dataset.season=key;
    buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.seasonButton===key)));
    document.querySelectorAll('.seasonPanel').forEach(p=>p.classList.toggle('seasonSelected',p.id===key));
  }
  controls.hidden=false;
  buttons.forEach(b=>b.addEventListener('click',()=>choose(b.dataset.seasonButton)));
  const hash=location.hash.slice(1);
  choose(buttons.some(b=>b.dataset.seasonButton===hash)?hash:'spring');
}
const search=document.querySelector('#termSearch');
if(search){
  const terms=Array.from(document.querySelectorAll('[data-term]'));
  const count=document.querySelector('#termCount');
  search.closest('.glossarySearch').hidden=false;
  function filter(){
    const query=search.value.trim().toLocaleLowerCase();let visible=0;
    terms.forEach(t=>{t.hidden=!t.textContent.toLocaleLowerCase().includes(query);if(!t.hidden)visible++;});
    count.textContent=visible?`${visible} of ${terms.length} terms shown`:'No matching terms. Try a shorter word or clear the search.';
  }
  search.addEventListener('input',filter);filter();
}

(()=>{
  let patching=false, lastSnapshot=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const br=v=>{if(!v)return '—';const d=new Date(String(v).slice(0,10)+'T12:00:00');return d.toLocaleDateString('pt-BR')};

  function patchContractForm(){
    const form=document.querySelector('#contractForm');
    if(!form||form.dataset.uxPatched)return;
    const body=form.querySelector('.modal-body.form-grid');
    const client=form.querySelector('input[name="client"]')?.closest('label');
    if(!body||!client)return;
    form.dataset.uxPatched='1';
    const title=document.createElement('label');
    title.className='field full';
    title.innerHTML='<span>Nome do contrato</span><input name="title" required placeholder="Ex.: Gestão de marketing 2026">';
    client.insertAdjacentElement('afterend',title);
    const value=form.querySelector('input[name="value"]')?.closest('label');
    if(value){
      const start=document.createElement('label');
      start.className='field';
      start.innerHTML='<span>Início do contrato</span><input name="start" type="date" required>';
      value.insertAdjacentElement('afterend',start);
    }
  }

  async function snapshot(){
    try{
      const r=await fetch('/api/app',{cache:'no-store'});
      if(!r.ok)return null;
      lastSnapshot=await r.json();
      return lastSnapshot;
    }catch{return null}
  }

  async function patchFindingRows(){
    if(patching)return;
    const rows=[...document.querySelectorAll('tr[data-finding]')];
    if(!rows.length)return;
    patching=true;
    try{
      const s=await snapshot();
      if(!s)return;
      const contracts=new Map((s.contracts||[]).map(c=>[String(c.id),c]));
      const findings=new Map((s.findings||[]).map(f=>[String(f.id),f]));
      for(const row of rows){
        if(row.dataset.contractContext==='1')continue;
        const f=findings.get(String(row.dataset.finding));
        const c=f?.contract_id?contracts.get(String(f.contract_id)):null;
        if(!c)continue;
        const cell=row.children?.[1];
        if(!cell)continue;
        const client=cell.querySelector('.client');
        if(client){
          const sub=document.createElement('small');
          sub.className='sub contract-context';
          sub.style.display='block';
          sub.style.marginTop='4px';
          sub.innerHTML=`${esc(c.title||'Contrato')} · ${br(c.start_date)} → ${br(c.end_date)}`;
          client.insertAdjacentElement('afterend',sub);
        }
        row.dataset.contractContext='1';
      }
    }finally{patching=false}
  }

  const obs=new MutationObserver(()=>{patchContractForm();patchFindingRows()});
  obs.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',()=>setTimeout(()=>{patchContractForm();patchFindingRows()},40),true);
  patchContractForm();
  patchFindingRows();
})();
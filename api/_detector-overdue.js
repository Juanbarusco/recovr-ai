import {num,iso,hasFinding,addFinding} from './_recovr-data.js';

export async function runOverdue(orgId,receivables,today){
  let created=0;
  for(const r of receivables){
    if(r.paid_at||new Date(r.due_date)>=today||await hasFinding(orgId,'overdue',{receivableId:r.id}))continue;
    const days=Math.max(1,Math.floor((today-new Date(r.due_date))/86400000));
    await addFinding(orgId,{type:'overdue',customer_id:r.customer_id,contract_id:r.contract_id,receivable_id:r.id,title:'Pagamento em atraso',summary:`${r.client} possui cobrança vencida há ${days} dias.`,value:num(r.amount),confidence:100,severity:days>15?'high':'medium',metadata:{calculation:{formula:'Valor integral da cobrança vencida',result:num(r.amount),daysOverdue:days}},evidence:[{label:'Conta a receber',excerpt:`${r.description||'Cobrança'} — vencimento ${iso(r.due_date)} — valor R$ ${num(r.amount).toFixed(2)}`}]});
    created++;
  }
  return created;
}

import {num,hasFinding,addFinding} from './_recovr-data.js';

export async function runBillingRisk(orgId,c,receivables,today){
  let created=0;
  const clientReceivables=receivables.filter(r=>String(r.customer_id)===String(c.customer_id)).sort((a,b)=>new Date(b.due_date)-new Date(a.due_date));
  const latest=clientReceivables[0];
  if(latest&&num(latest.amount)>0&&num(latest.amount)<num(c.current_value)&&!await hasFinding(orgId,'underbilling',{contractId:c.id})){
    const value=+(num(c.current_value)-num(latest.amount)).toFixed(2);
    await addFinding(orgId,{type:'underbilling',customer_id:c.customer_id,contract_id:c.id,receivable_id:latest.id,title:'Cobrança abaixo do contrato',summary:`Última cobrança de ${c.client} está abaixo do valor contratual.`,value,confidence:96,severity:'high',metadata:{calculation:{formula:'Valor contratual − cobrança recente',contract:num(c.current_value),billed:num(latest.amount),result:value}},evidence:[{label:'Comparação',excerpt:`Contrato R$ ${num(c.current_value).toFixed(2)} vs cobrança R$ ${num(latest.amount).toFixed(2)}.`}]});created++;
  }
  const recent=clientReceivables.find(r=>{const d=new Date(r.due_date);return d>=new Date(today.getTime()-45*86400000)&&d<=new Date(today.getTime()+15*86400000)});
  if(!recent&&num(c.current_value)>0&&!await hasFinding(orgId,'missing_billing',{contractId:c.id})){
    await addFinding(orgId,{type:'missing_billing',customer_id:c.customer_id,contract_id:c.id,title:'Possível mensalidade não faturada',summary:`Não há cobrança recente cadastrada para o contrato ativo de ${c.client}.`,value:num(c.current_value),confidence:84,severity:'high',metadata:{calculation:{formula:'1 mensalidade contratual sem cobrança recente',result:num(c.current_value)}},evidence:[{label:'Contrato ativo',excerpt:`Mensalidade cadastrada de R$ ${num(c.current_value).toFixed(2)} sem cobrança encontrada na janela de 45 dias.`}]});created++;
  }
  return created;
}

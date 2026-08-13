import {sql} from './_auth-store.js';
import {num,iso,hasFinding,addFinding} from './_recovr-data.js';

export async function runDetectors(orgId){
  let created=0;const today=new Date();
  const[receivables,contracts]=await Promise.all([
    sql`select r.*,cu.name client from receivables r join customers cu on cu.id=r.customer_id where r.organization_id=${orgId}`,
    sql`select c.*,cu.name client from contracts c join customers cu on cu.id=c.customer_id where c.organization_id=${orgId} and c.status='active'`
  ]);
  for(const r of receivables){
    if(!r.paid_at&&new Date(r.due_date)<today&&!await hasFinding(orgId,'overdue',{receivableId:r.id})){
      const days=Math.max(1,Math.floor((today-new Date(r.due_date))/86400000));
      await addFinding(orgId,{type:'overdue',customer_id:r.customer_id,contract_id:r.contract_id,receivable_id:r.id,title:'Pagamento em atraso',summary:`${r.client} possui cobrança vencida há ${days} dias.`,value:num(r.amount),confidence:100,severity:days>15?'high':'medium',metadata:{calculation:{formula:'Valor integral da cobrança vencida',result:num(r.amount),daysOverdue:days}},evidence:[{label:'Conta a receber',excerpt:`${r.description||'Cobrança'} — vencimento ${iso(r.due_date)} — valor R$ ${num(r.amount).toFixed(2)}`}]});created++;
    }
  }
  for(const c of contracts){
    const end=new Date(c.end_date),days=Math.ceil((end-today)/86400000);
    if(days>=0&&days<=60&&!await hasFinding(orgId,'renewal',{contractId:c.id})){
      const value=num(c.current_value)*2;await addFinding(orgId,{type:'renewal',customer_id:c.customer_id,contract_id:c.id,title:'Renovação em risco',summary:`Contrato de ${c.client} termina em ${days} dias.`,value,confidence:88,severity:days<=30?'high':'medium',metadata:{calculation:{formula:'2 mensalidades em risco',result:value,daysToEnd:days}},evidence:[{label:'Vigência contratual',excerpt:`Término cadastrado em ${iso(c.end_date)}.`}]});created++;
    }
    const last=c.last_adjustment_date?new Date(c.last_adjustment_date):new Date(c.start_date),monthDiff=(today.getFullYear()-last.getFullYear())*12+(today.getMonth()-last.getMonth());
    if(monthDiff>=12){
      const pct=Number(String(c.adjustment_index||'').replace(',','.').match(/([0-9]+(?:\.[0-9]+)?)\s*%/)?.[1]||0);
      if(pct>0&&!await hasFinding(orgId,'adjustment',{contractId:c.id})){
        const missed=Math.max(1,monthDiff-11),value=+(num(c.current_value)*(pct/100)*missed).toFixed(2);
        await addFinding(orgId,{type:'adjustment',customer_id:c.customer_id,contract_id:c.id,title:'Reajuste contratual possivelmente não aplicado',summary:`A referência de reajuste de ${c.client} está vencida.`,value,confidence:92,severity:'high',metadata:{calculation:{formula:'Mensalidade × percentual × meses estimados sem reajuste',monthly:num(c.current_value),percent:pct,missedMonths:missed,result:value}},evidence:[{label:'Cláusula / cadastro de reajuste',excerpt:`${c.adjustment_index}; última referência ${iso(last)}.`}]});created++;
      }else if(pct===0&&!await hasFinding(orgId,'adjustment_review',{contractId:c.id})){
        await addFinding(orgId,{type:'adjustment_review',customer_id:c.customer_id,contract_id:c.id,title:'Reajuste precisa de validação',summary:'O índice existe, mas não há percentual seguro para calcular o impacto.',value:0,confidence:76,severity:'medium',metadata:{calculation:{formula:'Sem valor até validar o índice'}},evidence:[{label:'Reajuste',excerpt:String(c.adjustment_index||'Índice não estruturado')}]});created++;
      }
    }
    const clientReceivables=receivables.filter(r=>String(r.customer_id)===String(c.customer_id)).sort((a,b)=>new Date(b.due_date)-new Date(a.due_date)),latest=clientReceivables[0];
    if(latest&&num(latest.amount)>0&&num(latest.amount)<num(c.current_value)&&!await hasFinding(orgId,'underbilling',{contractId:c.id})){
      const value=+(num(c.current_value)-num(latest.amount)).toFixed(2);await addFinding(orgId,{type:'underbilling',customer_id:c.customer_id,contract_id:c.id,receivable_id:latest.id,title:'Cobrança abaixo do contrato',summary:`Última cobrança de ${c.client} está abaixo do valor contratual.`,value,confidence:96,severity:'high',metadata:{calculation:{formula:'Valor contratual − cobrança recente',contract:num(c.current_value),billed:num(latest.amount),result:value}},evidence:[{label:'Comparação',excerpt:`Contrato R$ ${num(c.current_value).toFixed(2)} vs cobrança R$ ${num(latest.amount).toFixed(2)}.`}]});created++;
    }
    const recent=clientReceivables.find(r=>{const d=new Date(r.due_date);return d>=new Date(today.getTime()-45*86400000)&&d<=new Date(today.getTime()+15*86400000)});
    if(!recent&&num(c.current_value)>0&&!await hasFinding(orgId,'missing_billing',{contractId:c.id})){
      await addFinding(orgId,{type:'missing_billing',customer_id:c.customer_id,contract_id:c.id,title:'Possível mensalidade não faturada',summary:`Não há cobrança recente cadastrada para o contrato ativo de ${c.client}.`,value:num(c.current_value),confidence:84,severity:'high',metadata:{calculation:{formula:'1 mensalidade contratual sem cobrança recente',result:num(c.current_value)}},evidence:[{label:'Contrato ativo',excerpt:`Mensalidade cadastrada de R$ ${num(c.current_value).toFixed(2)} sem cobrança encontrada na janela de 45 dias.`}]});created++;
    }
  }
  return created;
}

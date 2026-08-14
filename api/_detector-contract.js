import {num,iso,hasFinding,addFinding} from './_recovr-data.js';

export async function runContractRisk(orgId,c,today){
  let created=0;
  const end=new Date(c.end_date),days=Math.ceil((end-today)/86400000);
  if(days>=0&&days<=60&&!await hasFinding(orgId,'renewal',{contractId:c.id})){
    const value=num(c.current_value)*2;
    await addFinding(orgId,{type:'renewal',customer_id:c.customer_id,contract_id:c.id,title:'Renovação em risco',summary:`Contrato de ${c.client} termina em ${days} dias.`,value,confidence:88,severity:days<=30?'high':'medium',metadata:{calculation:{formula:'2 mensalidades em risco',result:value,daysToEnd:days}},evidence:[{label:'Vigência contratual',excerpt:`Término cadastrado em ${iso(c.end_date)}.`}]});created++;
  }
  const last=c.last_adjustment_date?new Date(c.last_adjustment_date):new Date(c.start_date);
  const monthDiff=(today.getFullYear()-last.getFullYear())*12+(today.getMonth()-last.getMonth());
  if(monthDiff<12)return created;
  const pct=Number(String(c.adjustment_index||'').replace(',','.').match(/([0-9]+(?:\.[0-9]+)?)\s*%/)?.[1]||0);
  if(pct>0&&!await hasFinding(orgId,'adjustment',{contractId:c.id})){
    const missed=Math.max(1,monthDiff-11),value=+(num(c.current_value)*(pct/100)*missed).toFixed(2);
    await addFinding(orgId,{type:'adjustment',customer_id:c.customer_id,contract_id:c.id,title:'Reajuste contratual possivelmente não aplicado',summary:`A referência de reajuste de ${c.client} está vencida.`,value,confidence:92,severity:'high',metadata:{calculation:{formula:'Mensalidade × percentual × meses estimados sem reajuste',monthly:num(c.current_value),percent:pct,missedMonths:missed,result:value}},evidence:[{label:'Cláusula / cadastro de reajuste',excerpt:`${c.adjustment_index}; última referência ${iso(last)}.`}]});created++;
  }else if(pct===0&&!await hasFinding(orgId,'adjustment_review',{contractId:c.id})){
    await addFinding(orgId,{type:'adjustment_review',customer_id:c.customer_id,contract_id:c.id,title:'Reajuste precisa de validação',summary:'O índice existe, mas não há percentual seguro para calcular o impacto.',value:0,confidence:76,severity:'medium',metadata:{calculation:{formula:'Sem valor até validar o índice'}},evidence:[{label:'Reajuste',excerpt:String(c.adjustment_index||'Índice não estruturado')}]});created++;
  }
  return created;
}

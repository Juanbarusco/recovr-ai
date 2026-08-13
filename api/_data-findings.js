import {sql} from './_auth-store.js';
import {num} from './_data-core.js';

export async function hasFinding(orgId,type,{contractId=null,receivableId=null,fingerprint=null}={}){
  if(fingerprint)return!!(await sql`select id from findings where organization_id=${orgId} and detector_type=${type} and metadata->>'fingerprint'=${fingerprint} and status in ('open','action') limit 1`)[0];
  if(receivableId)return!!(await sql`select id from findings where organization_id=${orgId} and detector_type=${type} and receivable_id=${receivableId} and status in ('open','action') limit 1`)[0];
  if(contractId)return!!(await sql`select id from findings where organization_id=${orgId} and detector_type=${type} and contract_id=${contractId} and status in ('open','action') limit 1`)[0];
  return false;
}

export async function addFinding(orgId,f){
  const r=await sql`insert into findings(organization_id,customer_id,contract_id,receivable_id,detector_type,title,summary,estimated_value,confidence,status,severity,metadata) values(${orgId},${f.customer_id||null},${f.contract_id||null},${f.receivable_id||null},${f.type},${f.title},${f.summary||''},${f.value||0},${f.confidence||90},'open',${f.severity||'medium'},${JSON.stringify(f.metadata||{})}::jsonb) returning id`;
  for(const e of f.evidence||[])await sql`insert into evidence(finding_id,source_type,label,excerpt,metadata) values(${r[0].id},${e.source_type||'system'},${e.label},${e.excerpt||''},${JSON.stringify(e.metadata||{})}::jsonb)`;
  return r[0].id;
}

export async function registerRecovery(orgId,findingId,amountInput){
  const f=(await sql`select estimated_value from findings where id=${findingId} and organization_id=${orgId}`)[0];if(!f)throw new Error('Oportunidade não encontrada.');
  const old=(await sql`select coalesce(sum(amount),0) total from recoveries where finding_id=${findingId} and organization_id=${orgId}`)[0];
  const remaining=Math.max(0,num(f.estimated_value)-num(old.total)),amount=Math.min(remaining,num(amountInput));if(amount<=0)throw new Error('Valor de recuperação inválido.');
  await sql`insert into recoveries(organization_id,finding_id,amount,notes) values(${orgId},${findingId},${amount},'Confirmado pelo usuário')`;
  const total=num(old.total)+amount;
  await sql`update findings set status=${total>=num(f.estimated_value)?'recovered':'action'},resolved_at=${total>=num(f.estimated_value)?new Date():null} where id=${findingId} and organization_id=${orgId}`;
  return {amount,total,remaining:Math.max(0,num(f.estimated_value)-total)};
}

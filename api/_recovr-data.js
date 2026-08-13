import {sql} from './_auth-store.js';

export const num=v=>Number(v||0);
export const iso=v=>v?new Date(v).toISOString().slice(0,10):null;

export async function snapshot(orgId){
  const[contracts,receivables,findings,evidence,recoveries]=await Promise.all([
    sql`select c.id,c.title,c.current_value,c.start_date,c.end_date,c.adjustment_index,c.last_adjustment_date,c.extracted_text,c.status,cu.name client from contracts c join customers cu on cu.id=c.customer_id where c.organization_id=${orgId} order by c.created_at desc`,
    sql`select r.id,r.customer_id,r.contract_id,r.description,r.amount,r.due_date,r.paid_at,r.status,cu.name client from receivables r join customers cu on cu.id=r.customer_id where r.organization_id=${orgId} order by r.due_date desc`,
    sql`select f.*,cu.name client from findings f left join customers cu on cu.id=f.customer_id where f.organization_id=${orgId} order by f.detected_at desc`,
    sql`select e.* from evidence e join findings f on f.id=e.finding_id where f.organization_id=${orgId} order by e.created_at`,
    sql`select r.* from recoveries r where r.organization_id=${orgId} order by r.recovered_at desc`
  ]);
  const ev=new Map(),rec=new Map();
  for(const e of evidence){if(!ev.has(e.finding_id))ev.set(e.finding_id,[]);ev.get(e.finding_id).push(e)}
  for(const r of recoveries)rec.set(r.finding_id,(rec.get(r.finding_id)||0)+num(r.amount));
  return{mode:'cloud',contracts:contracts.map(x=>({...x,current_value:num(x.current_value)})),receivables:receivables.map(x=>({...x,amount:num(x.amount)})),findings:findings.map(x=>({...x,estimated_value:num(x.estimated_value),confidence:num(x.confidence),metadata:x.metadata||{},evidence:ev.get(x.id)||[],recovered:rec.get(x.id)||0})),recoveries:recoveries.map(x=>({...x,amount:num(x.amount)}))};
}

export async function customer(orgId,name){
  const clean=String(name||'').trim();if(!clean)throw new Error('Informe o cliente.');
  const found=await sql`select id from customers where organization_id=${orgId} and lower(name)=lower(${clean}) limit 1`;if(found[0])return found[0].id;
  const r=await sql`insert into customers(organization_id,name,status) values(${orgId},${clean},'active') returning id`;return r[0].id;
}

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
  const total=num(old.total)+amount;await sql`update findings set status=${total>=num(f.estimated_value)?'recovered':'action'},resolved_at=${total>=num(f.estimated_value)?new Date():null} where id=${findingId} and organization_id=${orgId}`;
  return{amount,total,remaining:Math.max(0,num(f.estimated_value)-total)};
}

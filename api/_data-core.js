import {sql} from './_auth-store.js';
export const num=v=>Number(v||0);
export const iso=v=>v?new Date(v).toISOString().slice(0,10):null;

export async function snapshot(orgId){
  const [contracts,receivables,findings,evidence,recoveries]=await Promise.all([
    sql`select c.id,c.title,c.current_value,c.start_date,c.end_date,c.adjustment_index,c.last_adjustment_date,c.extracted_text,c.status,cu.name client from contracts c join customers cu on cu.id=c.customer_id where c.organization_id=${orgId} order by c.created_at desc`,
    sql`select r.id,r.customer_id,r.contract_id,r.description,r.amount,r.due_date,r.paid_at,r.status,cu.name client from receivables r join customers cu on cu.id=r.customer_id where r.organization_id=${orgId} order by r.due_date desc`,
    sql`select f.*,cu.name client from findings f left join customers cu on cu.id=f.customer_id where f.organization_id=${orgId} order by f.detected_at desc`,
    sql`select e.* from evidence e join findings f on f.id=e.finding_id where f.organization_id=${orgId} order by e.created_at`,
    sql`select r.* from recoveries r where r.organization_id=${orgId} order by r.recovered_at desc`
  ]);
  const ev=new Map(),rec=new Map();
  for(const e of evidence){if(!ev.has(e.finding_id))ev.set(e.finding_id,[]);ev.get(e.finding_id).push(e)}
  for(const r of recoveries)rec.set(r.finding_id,(rec.get(r.finding_id)||0)+num(r.amount));
  return {mode:'cloud',contracts:contracts.map(x=>({...x,current_value:num(x.current_value)})),receivables:receivables.map(x=>({...x,amount:num(x.amount)})),findings:findings.map(x=>({...x,estimated_value:num(x.estimated_value),confidence:num(x.confidence),metadata:x.metadata||{},evidence:ev.get(x.id)||[],recovered:rec.get(x.id)||0})),recoveries:recoveries.map(x=>({...x,amount:num(x.amount)}))};
}

export async function customer(orgId,name){
  const clean=String(name||'').trim();if(!clean)throw new Error('Informe o cliente.');
  const found=await sql`select id from customers where organization_id=${orgId} and lower(name)=lower(${clean}) limit 1`;
  if(found[0])return found[0].id;
  const r=await sql`insert into customers(organization_id,name,status) values(${orgId},${clean},'active') returning id`;return r[0].id;
}

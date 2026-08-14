import {sql} from './_auth-store.js';
import {runOverdue} from './_detector-overdue.js';
import {runContractRisk} from './_detector-contract.js';
import {runBillingRisk} from './_detector-billing.js';

export async function runDetectors(orgId){
  const today=new Date();
  const [receivables,contracts]=await Promise.all([
    sql`select r.*,cu.name client from receivables r join customers cu on cu.id=r.customer_id where r.organization_id=${orgId}`,
    sql`select c.*,cu.name client from contracts c join customers cu on cu.id=c.customer_id where c.organization_id=${orgId} and c.status='active'`
  ]);
  let created=await runOverdue(orgId,receivables,today);
  for(const c of contracts){created+=await runContractRisk(orgId,c,today);created+=await runBillingRisk(orgId,c,receivables,today)}
  return created;
}

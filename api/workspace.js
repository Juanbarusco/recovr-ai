import crypto from 'node:crypto';
import {requireSession,sql} from './_auth-store.js';
import {validateSameOrigin} from './_auth-util.js';
import {snapshot,customer,addFinding,hasFinding,registerRecovery,num} from './_recovr-data.js';
import {runDetectors} from './_recovr-detectors.js';
import {analyzeScope,analyzeContract,aiConfigured} from './_recovr-ai.js';

const send=(res,status,data)=>{res.status(status);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.json(data)};
const allowedStatus=new Set(['open','action','dismissed']);

export default async function handler(req,res){
  try{
    if(!sql)return send(res,503,{error:'DATABASE_URL não configurada.'});
    const session=await requireSession(req),orgId=session.org.id;
    if(req.method==='GET')return send(res,200,{...(await snapshot(orgId)),workspace:session.org,role:session.role,ai:{configured:aiConfigured()}});
    if(req.method!=='POST')return send(res,405,{error:'Método não permitido.'});
    validateSameOrigin(req);const{action,payload={}}=req.body||{};
    if(action==='health')return send(res,200,{ok:true,database:true,authenticated:true,organization:session.org.name,aiConfigured:aiConfigured()});
    if(action==='runAnalysis'){const created=await runDetectors(orgId);return send(res,200,{created,state:await snapshot(orgId)})}
    if(action==='addContract'){
      const cid=await customer(orgId,payload.client),value=num(payload.value),end=payload.end;
      if(value<0||!end)throw Object.assign(new Error('Revise valor e vigência do contrato.'),{status:400});
      await sql`insert into contracts(organization_id,customer_id,title,status,start_date,end_date,renewal_date,current_value,adjustment_index,last_adjustment_date,extracted_text) values(${orgId},${cid},${String(payload.title||'Contrato de serviços').slice(0,200)},'active',${payload.start||new Date().toISOString().slice(0,10)},${end},${end},${value},${payload.adjustment||null},${payload.last_adjustment||null},${String(payload.scope||'').slice(0,20000)})`;
      return send(res,200,{ok:true});
    }
    if(action==='addReceivable'){
      const cid=await customer(orgId,payload.client),amount=num(payload.amount);
      if(amount<=0||!payload.due)throw Object.assign(new Error('Revise o valor e o vencimento.'),{status:400});
      await sql`insert into receivables(organization_id,customer_id,description,amount,due_date,status,source) values(${orgId},${cid},${String(payload.description||'Cobrança').slice(0,300)},${amount},${payload.due},'pending','manual')`;
      return send(res,200,{ok:true});
    }
    if(action==='updateFinding'){
      if(!allowedStatus.has(payload.status))throw Object.assign(new Error('Status inválido.'),{status:400});
      await sql`update findings set status=${payload.status},ignored_at=case when ${payload.status}='dismissed' then now() else ignored_at end where id=${payload.id} and organization_id=${orgId}`;
      return send(res,200,{ok:true});
    }
    if(action==='recover')return send(res,200,{ok:true,...await registerRecovery(orgId,payload.id,payload.amount)});
    if(action==='analyzeScope')return send(res,200,{analysis:await analyzeScope(orgId,payload)});
    if(action==='createScopeFinding'){
      const c=(await sql`select customer_id,extracted_text from contracts where id=${payload.contract_id} and organization_id=${orgId}`)[0];
      if(!c)throw Object.assign(new Error('Contrato não encontrado.'),{status:404});
      const activity=String(payload.activity||'').trim();if(activity.length<5)throw Object.assign(new Error('Descreva a atividade.'),{status:400});
      const fingerprint=crypto.createHash('sha256').update(`${payload.contract_id}|${payload.source}|${activity.toLowerCase()}`).digest('hex');
      if(await hasFinding(orgId,'scope',{fingerprint}))return send(res,409,{error:'Essa atividade já possui oportunidade aberta.'});
      const value=num(payload.value)>0?num(payload.value):num(payload.hours)*num(payload.hourly);
      await addFinding(orgId,{type:'scope',customer_id:c.customer_id,contract_id:payload.contract_id,title:'Possível trabalho fora de escopo',summary:String(payload.reason||'Atividade marcada como possível extra.').slice(0,500),value,confidence:Math.min(100,Math.max(0,num(payload.confidence)||70)),severity:value>0?'high':'medium',metadata:{fingerprint,source:String(payload.source||'Manual').slice(0,80),activity,ai_active:!!payload.ai_active,calculation:{formula:num(payload.value)>0?'Valor informado':'Horas × valor/hora',hours:num(payload.hours),hourly:num(payload.hourly),result:value}},evidence:[{label:'Escopo contratado',excerpt:String(c.extracted_text||'').slice(0,4000)},{label:`Atividade — ${String(payload.source||'Manual').slice(0,80)}`,excerpt:activity.slice(0,4000)}]});
      return send(res,200,{ok:true});
    }
    if(action==='analyzeContract')return send(res,200,{analysis:await analyzeContract(payload)});
    if(action==='workspace')return send(res,200,{workspace:session.org,role:session.role,ai:{configured:aiConfigured()}});
    return send(res,400,{error:'Ação desconhecida.'});
  }catch(e){console.error('workspace',e?.message);return send(res,e?.status||500,{error:e?.message||'Erro interno.',code:e?.code||undefined})}
}

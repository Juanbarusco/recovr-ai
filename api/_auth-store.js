import {neon} from '@neondatabase/serverless';
import {sha,hmac,normalizeEmail,validEmail,passwordDigest,newSalt,newToken,newId,safeEqualHex,requestIp,currentToken,setSessionCookie,clearSessionCookie} from './_auth-util.js';

export const sql=process.env.DATABASE_URL?neon(process.env.DATABASE_URL):null;
const dbRequired=()=>{if(!sql){const e=new Error('Banco ainda não configurado.');e.status=503;throw e}};

async function rateLimit(email,req){
  const identifierHash=hmac(normalizeEmail(email)),ipHash=hmac(requestIp(req)||'unknown');
  const rows=await sql`select count(*)::int failures from recovr_login_attempts where success=false and created_at>now()-interval '15 minutes' and (identifier_hash=${identifierHash} or ip_hash=${ipHash})`;
  if(Number(rows[0]?.failures||0)>=10){const e=new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente.');e.status=429;throw e}
  return{identifierHash,ipHash};
}
async function recordAttempt(identifierHash,ipHash,success){await sql`insert into recovr_login_attempts(identifier_hash,ip_hash,success) values(${identifierHash},${ipHash},${!!success})`}

export async function createSession(userId,req,res){
  dbRequired();const token=newToken(),tokenHash=sha(token),ipHash=hmac(requestIp(req)||'unknown'),userAgent=String(req.headers?.['user-agent']||'').slice(0,500);
  await sql`insert into recovr_sessions(user_id,token_hash,expires_at,user_agent,ip_hash) values(${userId},${tokenHash},now()+interval '30 days',${userAgent},${ipHash})`;
  setSessionCookie(res,token);return token;
}

export async function getSession(req,explicitToken=null){
  if(!sql)return null;const token=explicitToken||currentToken(req);if(!token)return null;
  const rows=await sql`select u.id,u.email,u.name,s.id session_id,o.id organization_id,o.name organization_name,o.cnpj,o.plan,om.role from recovr_sessions s join recovr_users u on u.id=s.user_id left join organization_members om on om.user_id=u.id::text left join organizations o on o.id=om.organization_id where s.token_hash=${sha(token)} and s.expires_at>now() and u.status='active' order by om.created_at asc nulls last limit 1`;
  const r=rows[0];if(!r)return null;
  await sql`update recovr_sessions set last_seen_at=now() where id=${r.session_id} and last_seen_at<now()-interval '5 minutes'`;
  return{user:{id:r.id,email:r.email,name:r.name},org:r.organization_id?{id:r.organization_id,name:r.organization_name,cnpj:r.cnpj,plan:r.plan}:null,role:r.role||null};
}

export async function requireSession(req,{requireOrg=true}={}){
  const session=await getSession(req);if(!session?.user){const e=new Error('Faça login para continuar.');e.status=401;throw e}
  if(requireOrg&&!session.org){const e=new Error('Finalize o cadastro da sua empresa.');e.status=409;e.code='ONBOARDING_REQUIRED';throw e}return session;
}

export async function registerUser(payload,req,res){
  dbRequired();const name=String(payload?.name||'').trim(),email=normalizeEmail(payload?.email),password=String(payload?.password||'');
  if(name.length<2){const e=new Error('Informe seu nome.');e.status=400;throw e}if(!validEmail(email)){const e=new Error('E-mail inválido.');e.status=400;throw e}if(password.length<8){const e=new Error('A senha precisa ter pelo menos 8 caracteres.');e.status=400;throw e}
  if((await sql`select id from recovr_users where lower(email)=lower(${email}) limit 1`)[0]){const e=new Error('Já existe uma conta com este e-mail.');e.status=409;throw e}
  const userId=newId(),salt=newSalt(),hash=passwordDigest(password,salt),token=newToken(),tokenHash=sha(token),ipHash=hmac(requestIp(req)||'unknown'),ua=String(req.headers?.['user-agent']||'').slice(0,500);
  await sql.transaction(txn=>[
    txn`insert into recovr_users(id,email,name,password_hash,password_salt) values(${userId},${email},${name},${hash},${salt})`,
    txn`insert into recovr_sessions(user_id,token_hash,expires_at,user_agent,ip_hash) values(${userId},${tokenHash},now()+interval '30 days',${ua},${ipHash})`
  ]);
  setSessionCookie(res,token);return getSession(req,token);
}

export async function loginUser(payload,req,res){
  dbRequired();const email=normalizeEmail(payload?.email),password=String(payload?.password||''),rate=await rateLimit(email,req);
  const user=(await sql`select id,email,name,password_hash,password_salt,status from recovr_users where lower(email)=lower(${email}) limit 1`)[0];
  const ok=!!user&&user.status==='active'&&safeEqualHex(user.password_hash,passwordDigest(password,user.password_salt));await recordAttempt(rate.identifierHash,rate.ipHash,ok);
  if(!ok){const e=new Error('E-mail ou senha incorretos.');e.status=401;throw e}
  await sql`update recovr_users set last_login_at=now(),updated_at=now() where id=${user.id}`;const token=await createSession(user.id,req,res);return getSession(req,token);
}

export async function logoutUser(req,res){if(sql){const token=currentToken(req);if(token)await sql`delete from recovr_sessions where token_hash=${sha(token)}`}clearSessionCookie(res)}

export async function createOrganization(payload,req){
  const session=await requireSession(req,{requireOrg:false});if(session.org)return session;const name=String(payload?.name||'').trim(),cnpj=String(payload?.cnpj||'').replace(/\D/g,'').slice(0,14)||null;
  if(name.length<2){const e=new Error('Informe o nome da empresa.');e.status=400;throw e}const orgId=newId();
  await sql.transaction(txn=>[
    txn`insert into organizations(id,name,cnpj,plan) values(${orgId},${name},${cnpj},'free')`,
    txn`insert into organization_members(organization_id,user_id,role) values(${orgId},${String(session.user.id)},'owner')`
  ]);return getSession(req);
}
export const publicSession=session=>session?{user:session.user,org:session.org,role:session.role}:{user:null,org:null,role:null};

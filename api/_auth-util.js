import crypto from 'node:crypto';

export const SESSION_COOKIE='recovr_session';
export const SESSION_SECONDS=60*60*24*30;
const PEPPER=process.env.RECOVR_AUTH_SECRET||process.env.DATABASE_URL||'recovr-local-only-change-me';

export const sha=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
export const hmac=value=>crypto.createHmac('sha256',PEPPER).update(String(value)).digest('hex');
export const normalizeEmail=email=>String(email||'').trim().toLowerCase();
export const validEmail=email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const passwordDigest=(password,salt)=>crypto.scryptSync(String(password),String(salt),64).toString('hex');
export const newSalt=()=>crypto.randomBytes(16).toString('hex');
export const newToken=()=>crypto.randomBytes(32).toString('base64url');
export const newId=()=>crypto.randomUUID();

export function safeEqualHex(a,b){
  try{const aa=Buffer.from(String(a),'hex'),bb=Buffer.from(String(b),'hex');return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb)}catch{return false}
}
export function parseCookies(req){
  const raw=String(req.headers?.cookie||'');
  return Object.fromEntries(raw.split(';').map(x=>x.trim()).filter(Boolean).map(part=>{const i=part.indexOf('=');return[decodeURIComponent(i<0?part:part.slice(0,i)),decodeURIComponent(i<0?'':part.slice(i+1))]}));
}
export const requestIp=req=>String(req.headers?.['x-forwarded-for']||req.headers?.['x-real-ip']||'').split(',')[0].trim();
export const currentToken=req=>parseCookies(req)[SESSION_COOKIE]||null;
export function setSessionCookie(res,token){res.setHeader('Set-Cookie',`${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`)}
export function clearSessionCookie(res){res.setHeader('Set-Cookie',`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)}
export function validateSameOrigin(req){
  const origin=req.headers?.origin;if(!origin)return;
  const host=String(req.headers?.['x-forwarded-host']||req.headers?.host||'');
  try{if(new URL(origin).host!==host)throw new Error('origin')}catch{const e=new Error('Origem da requisição não autorizada.');e.status=403;throw e}
}

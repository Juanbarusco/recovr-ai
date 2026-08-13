import {validateSameOrigin} from './_auth-util.js';
import {getSession,registerUser,loginUser,logoutUser,createOrganization,publicSession} from './_auth-store.js';

const send=(res,status,data)=>{res.status(status);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.json(data)};

export default async function handler(req,res){
  try{
    if(req.method==='GET')return send(res,200,{ok:true,...publicSession(await getSession(req))});
    if(req.method!=='POST')return send(res,405,{ok:false,error:'Método não permitido.'});
    validateSameOrigin(req);const{action,payload={}}=req.body||{};
    if(action==='register')return send(res,201,{ok:true,...publicSession(await registerUser(payload,req,res))});
    if(action==='login')return send(res,200,{ok:true,...publicSession(await loginUser(payload,req,res))});
    if(action==='logout'){await logoutUser(req,res);return send(res,200,{ok:true,user:null,org:null,role:null})}
    if(action==='createOrganization')return send(res,201,{ok:true,...publicSession(await createOrganization(payload,req))});
    return send(res,400,{ok:false,error:'Ação desconhecida.'});
  }catch(e){console.error('session',e?.message);return send(res,e?.status||500,{ok:false,error:e?.message||'Erro interno.',code:e?.code||undefined})}
}

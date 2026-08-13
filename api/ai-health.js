export default async function handler(req,res){
  const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||'';
  if(!token)return res.status(503).json({ok:false,error:'AI Gateway token unavailable'});
  try{
    const r=await fetch('https://ai-gateway.vercel.sh/v1/responses',{
      method:'POST',
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({model:'openai/gpt-5.6-sol',input:[{role:'user',content:[{type:'input_text',text:'Responda somente JSON valido: {"ok":true,"service":"recovr-ai"}'}]}]})
    });
    const j=await r.json();
    const text=j.output_text||j.output?.find(x=>x.type==='message')?.content?.find(x=>x.text)?.text||'';
    return res.status(r.ok?200:r.status).json({ok:r.ok,status:r.status,hasOidc:Boolean(process.env.VERCEL_OIDC_TOKEN),hasApiKey:Boolean(process.env.AI_GATEWAY_API_KEY),text,error:j.error||null});
  }catch(e){return res.status(500).json({ok:false,error:e.message,hasOidc:Boolean(process.env.VERCEL_OIDC_TOKEN),hasApiKey:Boolean(process.env.AI_GATEWAY_API_KEY)})}
}

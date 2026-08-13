function parseJSON(s){return JSON.parse(String(s||'').replace(/^```(?:json)?/i,'').replace(/```$/,'').trim())}
export const aiConfigured=()=>!!(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN);

export async function gateway(prompt,file){
  const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
  if(!token){const e=new Error('IA pronta, aguardando ativação do AI Gateway.');e.status=503;e.code='AI_INACTIVE';throw e}
  const content=[{type:'input_text',text:prompt}];
  if(file)content.push({type:'input_file',filename:file.filename||'contrato.pdf',file_data:`data:application/pdf;base64,${file.data}`});
  const r=await fetch('https://ai-gateway.vercel.sh/v1/responses',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({model:'openai/gpt-5.6-sol',input:[{role:'user',content}]})});
  const j=await r.json();
  if(!r.ok){const e=new Error(j.error?.message||j.error||'Falha no AI Gateway');e.status=r.status;e.code='AI_GATEWAY_ERROR';throw e}
  const text=j.output_text||j.output?.find(x=>x.type==='message')?.content?.find(x=>x.text)?.text;
  if(!text)throw new Error('A IA não retornou conteúdo estruturado.');
  return parseJSON(text);
}

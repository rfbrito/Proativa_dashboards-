const PN={rec:'Recuperação',hub:'Hub de desempenho',aba:'Abastecimento',cli:'Relatório Comercial',mesa:'Mesa de Preços',ger:'Gerador de tickets',sla:'SLA clientes novos',cart:'Carteiras'};
const ORDEM=['rec','hub','aba','cli','mesa','ger','sla','cart'];
const DADOS=['rec','hub','aba','cli'];
const versao={}, avisos={};
let sb=null, perfil=null, usuario=null, permitidos=[];
const $=id=>document.getElementById(id);
const nz=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
const primeiroNome=s=>nz(s).toUpperCase().split(/\s+/)[0]||'';
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const codNorm=v=>{const d=String(v==null?'':v).replace(/\D/g,''); return d?String(parseInt(d,10)):'';};
const dorme=ms=>new Promise(r=>setTimeout(r,ms));
let toastT=null;
function toast(t,ms){const e=$('toast'); e.textContent=t; e.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>e.classList.remove('show'),ms||5000);}

/* ---------- painéis (iframes) e telas internas ---------- */
const frames={};
function decode(id){
  const b64=document.getElementById('src-'+id).textContent.trim();
  const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  let src=new TextDecoder('utf-8').decode(bytes);
  // cada usuário tem o seu próprio armazenamento local da Recuperação (meta, opções, histórico), que fica salvo ao sair/entrar
  if(id==='rec' && perfil) src=src.replace("'painel-recuperacao-glp'","'painel-recuperacao-glp-"+perfil.id+"'");
  // Carteiras e SLA guardam dados no navegador: cada usuário usa a sua própria chave (um login não enxerga o do outro)
  if(perfil){
    if(id==='sla') src=src.split("'slaClientesNovos_base_v1'").join("'slaClientesNovos_base_v1_"+perfil.id+"'");
    if(id==='mesa') src=src.split("'altpreco_'").join("'altpreco_"+perfil.id+"_'");
    if(id==='cart') src=src.split("'carteiraDB_v1'").join("'carteiraDB_v1_"+perfil.id+"'");
  }
  // só gestor/admin carrega arquivo; para os demais os botões de carregar somem
  const pode=!!(perfil&&(perfil.role==='admin'||perfil.role==='gestor'));
  const css='html.sem-carga .load-grid,html.sem-carga .load-foot,html.sem-carga .upload-btn,html.sem-carga .reset-btn,html.sem-carga .pab-file-btn,html.sem-carga .up-btn,html.sem-carga .drop,html.sem-carga label:has(input[type=file]),html.sem-carga label[for=file-input],html.sem-carga #bb-reset{display:none!important}';
  if(id==='mesa'||id==='cli') return src;
  const mov='@media(max-width:820px){html{-webkit-text-size-adjust:100%}input,select,textarea{font-size:16px!important}button,.btn,select{min-height:40px}.kpi-row{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}.kpi-card{padding:12px!important;min-width:0}.kpi-card .value{font-size:22px!important}.filters{gap:10px!important}.filters .fg{flex:1 1 44%!important;min-width:0!important}.filters .fg input,.filters .fg select{width:100%}.filters .fbtn{flex:1 1 100%}.goal-block{flex-direction:column!important;align-items:stretch!important;gap:16px!important}.goal-block .kpi-row{flex:none!important;width:100%}table{display:block;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}main,section,.card,.panel{min-width:0}.tabs{flex-wrap:wrap;overflow-x:auto}.tabs button{flex:1 1 auto}.header-controls,.hdr,.top-actions{flex-wrap:wrap}img,canvas{max-width:100%}}';
  src=src.replace('<head>','<head><script>window.GLP_PODE='+pode+';document.documentElement.classList.toggle("sem-carga",!window.GLP_PODE);<\/script><style>'+css+mov+'<\/style>');
  return src;
}
function show(id){
  const interna=(id==='admin'||id==='dados'||id==='vazio');
  if(!interna && !permitidos.includes(id)) return;
  if(id==='admin' && !(perfil&&perfil.role==='admin')) return;
  if(!interna && !frames[id]){
    const f=document.createElement('iframe');
    f.title=PN[id];
    f.srcdoc=decode(id);
    $('stage').appendChild(f);
    frames[id]=f;
    if(DADOS.includes(id)) f.addEventListener('load',()=>injetar(id,f));
  }
  Object.entries(frames).forEach(([k,f])=>f.classList.toggle('active',k===id));
  ['admin','dados','vazio'].forEach(v=>$('view-'+v).classList.toggle('active',v===id));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.id===id));
  document.title=(interna?(id==='admin'?'Usuários':id==='dados'?'Central de importação':'Painéis'):PN[id])+' — Painéis';
  { const mt=$('mtitle'); if(mt) mt.textContent=interna?(id==='admin'?'Usuários':id==='dados'?'Central de importação':'Painéis'):PN[id]; document.body.classList.remove('menu-open'); }
  mostrarAviso();
  if(id==='admin') renderAdmin();
  if(id==='dados') renderDados();
}
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>show(b.dataset.id)));
(function(){
  const abrir=o=>{ document.body.classList.toggle('menu-open',o); const b=$('mmenu'); if(b) b.setAttribute('aria-expanded',String(o)); };
  const mm=$('mmenu'); if(mm) mm.addEventListener('click',()=>abrir(!document.body.classList.contains('menu-open')));
  const sc=$('mscrim'); if(sc) sc.addEventListener('click',()=>abrir(false));
  document.addEventListener('keydown',e=>{ if(e.key==='Escape') abrir(false); });
})();

/* ---------- menu lateral recolhível ---------- */
(function(){
  const app=document.querySelector('.app'), b=$('burger');
  document.querySelectorAll('.nav-item').forEach(n=>{ const nm=n.querySelector('.nav-name'); if(nm) n.title=nm.textContent; });
  const aplicar=r=>{ app.classList.toggle('collapsed',r); b.setAttribute('aria-expanded',String(!r)); };
  let r=false; try{ r=localStorage.getItem('glpMenuRecolhido')==='1'; }catch(_){}
  aplicar(r);
  b.addEventListener('click',()=>{ r=!app.classList.contains('collapsed'); aplicar(r); try{ localStorage.setItem('glpMenuRecolhido',r?'1':'0'); }catch(_){} });
})();

/* ---------- autenticação ---------- */
function msg(t,tipo){const m=$('lg-msg'); m.textContent=t||''; m.className='lg-msg '+(tipo||'');}
function traduz(e){
  const m=String((e&&e.message)||e||'');
  if(/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if(/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if(/already registered|already been registered/i.test(m)) return 'Este e-mail já tem cadastro. Use "Esqueci minha senha" se precisar.';
  if(/at least|weak|should contain/i.test(m)) return 'Senha fraca: use pelo menos 8 caracteres.';
  if(/email_nao_autorizado|Database error saving new user/i.test(m)) return 'Este e-mail não está autorizado a se cadastrar.';
  if(/rate limit|too many|security purposes/i.test(m)) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
  if(/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  if(/dados_meta_painel_check|dados_painel_check/.test(m)) return 'O banco ainda não está preparado para a Base de Clientes. No Supabase, abra SQL Editor, cole o arquivo 06_tudo_em_um.sql, clique em Run e depois publique de novo.';
  if(/sem_permissao/.test(m)) return 'Você não tem permissão para isso.';
  if(/nao_pode_rebaixar/.test(m)) return 'Você não pode tirar o seu próprio acesso de administrador.';
  return 'Não foi possível concluir: '+m;
}
function mostrarAuth(v){
  document.body.classList.add('locked');
  ['entrar','cadastrar','esqueci','nova','pendente','config'].forEach(x=>{$('v-'+x).hidden=(x!==v);});
  msg('');
  const f=document.querySelector('#v-'+v+' input'); if(f&&v!=='pendente'&&v!=='config') setTimeout(()=>f.focus(),30);
}
document.querySelectorAll('[data-go]').forEach(a=>a.addEventListener('click',()=>mostrarAuth(a.dataset.go)));
const urlVolta=()=>location.origin+location.pathname;
async function comBotao(form,fn){
  const b=form.querySelector('button[type=submit]'); b.disabled=true; msg('');
  try{ await fn(); }catch(e){ msg(traduz(e)); }
  b.disabled=false;
}
$('v-entrar').addEventListener('submit',ev=>{ev.preventDefault(); comBotao(ev.target,async()=>{
  const {data,error}=await sb.auth.signInWithPassword({email:$('e-mail').value.trim(),password:$('e-senha').value});
  if(error) throw error;
  try{ if(window.PasswordCredential&&navigator.credentials&&navigator.credentials.store){ await navigator.credentials.store(new PasswordCredential({id:$('e-mail').value.trim(),password:$('e-senha').value,name:$('e-mail').value.trim()})); } }catch(_){}
  $('e-senha').value=''; usuario=data.user||(data.session&&data.session.user); await entrarNoApp();
});});
$('v-cadastrar').addEventListener('submit',ev=>{ev.preventDefault(); comBotao(ev.target,async()=>{
  const nome=$('c-nome').value.trim(), email=$('c-mail').value.trim(), s=$('c-senha').value;
  if(s.length<8) throw new Error('at least 8');
  if(s!==$('c-senha2').value) throw new Error('As senhas não conferem.');
  const {data,error}=await sb.auth.signUp({email,password:s,options:{data:{nome},emailRedirectTo:urlVolta()}});
  if(error) throw error;
  if(data&&data.session){ usuario=data.user; await entrarNoApp(); }
  else{ mostrarAuth('entrar'); msg('Cadastro enviado. Confirme seu e-mail pelo link que enviamos e depois aguarde a liberação do administrador.','ok'); }
});});
$('v-esqueci').addEventListener('submit',ev=>{ev.preventDefault(); comBotao(ev.target,async()=>{
  const {error}=await sb.auth.resetPasswordForEmail($('r-mail').value.trim(),{redirectTo:urlVolta()});
  if(error) throw error;
  msg('Se o e-mail estiver cadastrado, enviamos um link para criar a nova senha.','ok');
});});
$('v-nova').addEventListener('submit',ev=>{ev.preventDefault(); comBotao(ev.target,async()=>{
  const s=$('n-senha').value;
  if(s.length<8) throw new Error('at least 8');
  if(s!==$('n-senha2').value) throw new Error('As senhas não conferem.');
  await sb.auth.getSession();
  const {error}=await sb.auth.updateUser({password:s});
  if(error) throw error;
  history.replaceState(null,'',urlVolta());
  const {data}=await sb.auth.getSession(); usuario=data.session&&data.session.user;
  $('n-senha').value=''; $('n-senha2').value='';
  if(usuario) await entrarNoApp(); else { mostrarAuth('entrar'); msg('Senha alterada. Entre com a nova senha.','ok'); }
});});
$('pend-ver').onclick=()=>entrarNoApp();
$('pend-sair').onclick=()=>sair();
$('logout').onclick=()=>sair();
$('recarregar').onclick=()=>recarregarDados();

async function limparLocais(){
  Object.keys(frames).forEach(k=>{frames[k].remove(); delete frames[k];});
}
async function sair(){
  try{ await sb.auth.signOut(); }catch(_){}
  await limparLocais();
  location.href=urlVolta();
}
async function entrarNoApp(){
  const {data,error}=await sb.from('profiles').select('*').eq('id',usuario.id).maybeSingle();
  if(error||!data){ mostrarAuth('entrar'); msg('Não foi possível carregar seu perfil. Tente novamente.'); return; }
  perfil=data;
  if(!perfil.ativo||perfil.role==='pendente'){ $('pend-email').textContent=perfil.email; mostrarAuth('pendente'); return; }
  await limparLocais();
  liberar();
}
function liberar(){
  document.body.classList.remove('locked');
  const admin=perfil.role==='admin';
  permitidos=admin?ORDEM.slice():ORDEM.filter(p=>(perfil.paineis||[]).includes(p));
  document.querySelectorAll('nav .nav-item').forEach(b=>{
    const id=b.dataset.id; if(id==='admin'||id==='dados') return;
    b.hidden=!permitidos.includes(id);
  });
  const podeDados=admin||(perfil.role==='gestor'&&DADOS.some(p=>permitidos.includes(p)));
  $('adm-box').hidden=!(admin||podeDados);
  $('nav-admin').hidden=!admin; $('nav-dados').hidden=!podeDados;
  const papel={admin:'Administrador',gestor:'Gestor',atendente:'Atendente'}[perfil.role]||perfil.role;
  $('who').innerHTML='<div class="who-av">'+esc(String(perfil.nome||perfil.email||'?').trim().charAt(0).toUpperCase())+'</div><div class="who-t"><b>'+esc(perfil.nome||perfil.email)+'</b>'+papel+(perfil.role==='atendente'&&perfil.pessoas&&perfil.pessoas.length?' · '+esc(perfil.pessoas.join(', ')):'')+'</div>';
  show(permitidos[0]||'vazio');
}

/* ---------- entrega dos dados aos painéis ---------- */
async function buscarDados(painel){
  const m=await sb.from('dados_meta').select('*').eq('painel',painel);
  if(m.error) throw m.error;
  const out=[];
  versao[painel]=(m.data||[]).map(x=>String(x.enviado_em)).sort().pop()||'';
  for(const meta of (m.data||[])){
    const linhas=[];
    for(let a=0;;a+=1000){
      const r=await sb.from('dados').select('ordem,linha').eq('painel',painel).eq('aba',meta.aba).order('ordem',{ascending:true}).range(a,a+999);
      if(r.error) throw r.error;
      r.data.forEach(x=>linhas.push(x.linha));
      if(r.data.length<1000) break;
    }
    out.push({meta,linhas});
  }
  return out;
}
function montarWb(itens){
  const wb=XLSX.utils.book_new();
  itens.forEach(it=>{
    const ws=XLSX.utils.aoa_to_sheet([it.cab].concat(it.linhas));
    const fmt=it.fmt||[];
    it.linhas.forEach((l,i)=>{ fmt.forEach((z,c)=>{ if(!z) return; const ad=XLSX.utils.encode_cell({r:i+1,c}); const cel=ws[ad]; if(cel&&cel.t==='n') cel.z=z; }); });
    XLSX.utils.book_append_sheet(wb,ws,it.nome);
  });
  return wb;
}
function wbFile(wb,nome,win){
  win=win||window;   // o arquivo precisa ser criado no "mundo" do painel (iframe), senão a leitura da planilha falha
  const buf=XLSX.write(wb,{type:'array',bookType:'xlsx',cellDates:false});
  return new win.File([new win.Uint8Array(buf)],nome,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
const item=(d,nome)=>({nome:nome||d.meta.aba,cab:d.meta.cabecalho,fmt:d.meta.fmt,linhas:d.linhas});
function planoArquivos(id,dados,win){
  const out=[];
  if(id==='rec'){
    const rotas=dados.filter(d=>d.meta.aba.indexOf('rota:')===0);
    if(rotas.length) out.push({sel:'#base-input',file:wbFile(montarWb(rotas.map(d=>item(d,d.meta.aba.slice(5)))),'rota.xlsx',win),espera:true});
  }else if(id==='hub'){
    out.push({sel:'#fileInput',file:wbFile(montarWb(dados.map(d=>item(d))),'hub.xlsx',win)});
  }else if(id==='aba'){
    out.push({sel:'input[type=file]',file:wbFile(montarWb([item(dados[0])]),'abastecimento.xlsx',win)});
  }
  return out;
}
async function aguardarInput(f,sel,ms){
  const t0=Date.now();
  while(Date.now()-t0<(ms||20000)){
    try{ const i=f.contentDocument.querySelector(sel); if(i) return i; }catch(_){}
    await dorme(150);
  }
  return null;
}
/* meta única da Recuperação: todos leem a mesma; só gestor/admin grava */
async function aplicarMeta(f){
  try{
    const r=await sb.rpc('meta_obter'); if(r.error||r.data==null) return;
    const v=Number(r.data); if(!isFinite(v)) return;
    for(let i=0;i<15;i++){ try{ if(f.contentWindow.eval('typeof state!=="undefined"&&document.getElementById("app").innerHTML.length>0')) break; }catch(_){} await dorme(200); }
    f.contentWindow.eval('state.goal='+v+'; render()');
  }catch(_){}
}
window.glpSalvarMeta=async function(v){
  try{ await rpcOk('meta_salvar',{p_valor:Number(v)}); toast('Meta salva para toda a equipe.',2500); }
  catch(e){ toast('Não foi possível salvar a meta: '+traduz(e)); }
};
function nomeLigado(){ return perfil&&perfil.role==='atendente'; }
function avisar(id,html){ if(html) avisos[id]=html; else delete avisos[id]; mostrarAviso(); }
function mostrarAviso(){
  let b=$('aviso-dados');
  if(!b){ b=document.createElement('div'); b.id='aviso-dados'; $('stage').prepend(b);
    b.addEventListener('click',e=>{ if(e.target.closest('[data-retry]')) recarregarDados(); }); }
  const ativo=Object.keys(frames).find(k=>frames[k].classList.contains('active'));
  const h=ativo&&avisos[ativo];
  b.innerHTML=h||''; b.classList.toggle('on',!!h); $('stage').style.setProperty('--avh',h?b.offsetHeight+'px':'0px');
}
async function apagarLocal(f){ try{ await f.contentWindow.eval("typeof clearData==='function'?clearData():0"); }catch(_){} }
async function injetar(id,f){
  if(id==='cli') return injetarCli(f);
  avisar(id,'');
  try{
    const dados=await buscarDados(id);
    const total=dados.reduce((s,d)=>s+d.linhas.length,0);
    if(!total){
      await apagarLocal(f);
      if(id==='rec') await aplicarMeta(f);
      avisar(id,'<b>Sem dados para você em '+PN[id]+'.</b> '+(nomeLigado()?'Nada foi publicado com o seu nome. Se a planilha já foi publicada, avise o administrador para conferir o campo <i>Nome nas planilhas</i> do seu usuário (a grafia precisa bater com a da planilha).':'Ainda não há planilha publicada.'));
      return;
    }
    for(const a of planoArquivos(id,dados,f.contentWindow)){
      const inp=await aguardarInput(f,a.sel);
      if(!inp){ avisar(id,'<b>O painel '+PN[id]+' demorou a abrir.</b> <button class="btn" data-retry>Tentar de novo</button>'); return; }
      const dt=new f.contentWindow.DataTransfer(); dt.items.add(a.file); inp.files=dt.files;
      inp.dispatchEvent(new f.contentWindow.Event('change',{bubbles:true}));
      if(a.espera){ const t0=Date.now(); while(Date.now()-t0<10000){ try{ if(f.contentWindow.eval('state.records.length')>0) break; }catch(_){} await dorme(200); } await dorme(300); }
    }
    if(id==='rec') await aplicarMeta(f);
    marcarAtualizado();
  }catch(e){
    avisar(id,'<b>Não foi possível atualizar '+PN[id]+'.</b> O que aparece abaixo pode estar desatualizado. ('+esc(traduz(e))+') <button class="btn" data-retry>Tentar de novo</button>');
  }
}
let ultimaCarga=0;
function marcarAtualizado(){ ultimaCarga=Date.now(); const e=$('recarregar'); if(e) e.title='Última verificação: '+new Date(ultimaCarga).toLocaleTimeString('pt-BR'); }
/* atualização automática: compara a data da última publicação com a que o painel carregou */
let verificando=false;
async function verificarAtualizacao(){
  if(verificando||!perfil||document.hidden) return;
  const ids=DADOS.filter(k=>frames[k]); if(!ids.length) return;
  verificando=true;
  try{
    let mudou=false;
    for(const id of ids){
      const r=await sb.from('dados_meta').select('enviado_em').eq('painel',id);
      if(r.error) continue;
      const v=(r.data||[]).map(x=>String(x.enviado_em)).sort().pop()||'';
      if(v!==(versao[id]||'')) mudou=true;
    }
    if(mudou){ recarregarDados(true); toast('Há dados novos publicados. Painéis atualizados.',4000); }
    else marcarAtualizado();
  }catch(_){} finally{ verificando=false; }
}
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) verificarAtualizacao(); });
window.addEventListener('focus',()=>verificarAtualizacao());
setInterval(verificarAtualizacao,180000);
function recarregarDados(quieto){
  const ativo=Object.keys(frames).find(k=>frames[k].classList.contains('active'));
  DADOS.forEach(k=>{ if(frames[k]){ frames[k].remove(); delete frames[k]; } });
  if(ativo&&DADOS.includes(ativo)) show(ativo);
  else if(!ativo&&document.querySelector('.view.active')&&!$('view-vazio').classList.contains('active')){ /* continua na tela interna (importação, usuários) sem apagar o resultado */ }
  else show(permitidos[0]||'vazio');
  if(!quieto) toast('Atualizando dados…',2500);
}

/* ---------- tela de usuários (admin) ---------- */
async function renderAdmin(){
  const DG=await diagnostico(); const NOMES_PUB=[...new Set(((DG&&DG.nomes)||[]).map(n=>n.pessoa).filter(x=>x&&x!=='TOTAL'))].sort();
  const box=$('admin-lista'); box.innerHTML='<div class="hint">Carregando…</div>';
  const r=await sb.from('profiles').select('*').order('criado_em',{ascending:true});
  if(r.error){ box.innerHTML='<div class="u-msg err">'+esc(traduz(r.error))+'</div>'; return; }
  const ordemRole={pendente:0,admin:1,gestor:2,atendente:3};
  const us=r.data.slice().sort((a,b)=>(ordemRole[a.role]-ordemRole[b.role])||String(a.nome).localeCompare(String(b.nome)));
  box.innerHTML='';
  us.forEach(u=>{
    const eu=u.id===perfil.id;
    const c=document.createElement('div'); c.className='card'; c.dataset.id=u.id;
    const chip=u.role==='pendente'?'<span class="chip pend">pendente</span>':(u.ativo?'<span class="chip ok">ativo</span>':'<span class="chip off">bloqueado</span>');
    c.innerHTML=
      '<div class="u-head"><div><div class="u-name">'+esc(u.nome||'(sem nome)')+(eu?' · você':'')+'</div><div class="u-mail">'+esc(u.email)+'</div></div>'+chip+'</div>'+
      '<div class="row">'+
        '<div class="fld"><label>Papel</label><select class="f-role"'+(eu?' disabled':'')+'>'+
          ['pendente','atendente','gestor','admin'].map(x=>'<option value="'+x+'"'+(u.role===x?' selected':'')+'>'+x+'</option>').join('')+'</select></div>'+
        '<div class="fld" style="flex:1;min-width:220px"><label>Nome nas planilhas (separe por vírgula se houver grafias diferentes)</label><input type="text" class="f-pessoas" value="'+esc((u.pessoas||[]).join(', '))+'" placeholder="ex.: Iasmim, Iasmin"></div>'+
        '<div class="fld"><label>Perfil rápido</label><select class="f-perfil"'+(eu?' disabled':'')+'><option value="">—</option><option value="consultor">Consultor (só Base de Clientes)</option><option value="gestor">Gestor (vê todos, publica dados)</option></select></div>'+
        '<div class="fld"><label>Acesso</label><label class="chk"><input type="checkbox" class="f-ativo"'+(u.ativo?' checked':'')+(eu?' disabled':'')+'> liberado</label></div>'+
      '</div>'+
      '<div style="margin-top:12px"><div class="lbl" style="margin-bottom:6px">Painéis liberados</div>'+
        ORDEM.map(p=>'<label class="chk"><input type="checkbox" class="f-pn" value="'+p+'"'+((u.paineis||[]).includes(p)?' checked':'')+'> '+PN[p]+'</label>').join('')+'</div>'+
      '<div style="margin-top:14px;display:flex;align-items:center"><button class="btn f-salvar" type="button">Salvar</button><span class="u-msg"></span></div>'+
      '<div class="warn" hidden></div>';
    const roleSel=c.querySelector('.f-role'), ativo=c.querySelector('.f-ativo');
    const pIn=c.querySelector('.f-pessoas');
    if(NOMES_PUB.length){ const ch=document.createElement('div'); ch.className='hint'; ch.style.cssText='margin:-4px 0 0;width:100%';
      ch.innerHTML='Nomes que aparecem nas planilhas (toque para adicionar): '+NOMES_PUB.map(n=>'<button type="button" class="btn" style="min-height:28px;padding:2px 10px;margin:2px 4px 2px 0;font-size:12px" data-n="'+esc(n)+'">'+esc(n)+'</button>').join('');
      c.querySelector('.row').after(ch);
      ch.addEventListener('click',e=>{ const b=e.target.closest('[data-n]'); if(!b) return; const cur=pIn.value.split(',').map(x=>x.trim()).filter(Boolean); if(!cur.map(primeiroNome).includes(primeiroNome(b.dataset.n))) cur.push(b.dataset.n); pIn.value=cur.join(', '); pIn.dispatchEvent(new Event('input')); }); }
    c.querySelector('.f-perfil').addEventListener('change',e=>{
      const v=e.target.value; if(!v) return;
      const pn=v==='consultor'?['cli']:['cli','rec','hub','aba'];
      roleSel.value=v==='consultor'?'atendente':'gestor'; ativo.checked=true;
      c.querySelectorAll('.f-pn').forEach(x=>{ x.checked=pn.includes(x.value); });
      roleSel.dispatchEvent(new Event('change')); e.target.value='';
    });
    const aviso=()=>{
      const w=c.querySelector('.warn'); const pn=[...c.querySelectorAll('.f-pn:checked')].map(x=>x.value);
      const pessoas=c.querySelector('.f-pessoas').value.trim();
      const usaDados=pn.some(p=>DADOS.includes(p));
      const meus=pessoas.split(',').map(primeiroNome).filter(Boolean);
      const dup=us.filter(o=>o.id!==u.id&&(o.pessoas||[]).some(x=>meus.includes(x)));
      if(dup.length){ w.hidden=false; w.textContent='Atenção: este nome também está vinculado a '+dup.map(o=>o.nome||o.email).join(', ')+'. As duas pessoas veriam as mesmas linhas.'; return; }
      if(roleSel.value==='atendente'&&usaDados&&!pessoas){ w.hidden=false; w.textContent='Atenção: sem o nome nas planilhas, este atendente não verá nenhuma linha de Recuperação, Hub ou Abastecimento.'; }
      else w.hidden=true;
    };
    roleSel.addEventListener('change',()=>{ if(roleSel.value!=='pendente'&&!ativo.checked&&!eu) ativo.checked=true; if(roleSel.value==='pendente') ativo.checked=false; aviso(); });
    c.querySelectorAll('.f-pn,.f-pessoas').forEach(x=>x.addEventListener('input',aviso));
    aviso();
    c.querySelector('.f-salvar').onclick=async ev=>{
      const b=ev.target, m=c.querySelector('.u-msg'); b.disabled=true; m.textContent=''; m.className='u-msg';
      const role=roleSel.value;
      const pessoas=c.querySelector('.f-pessoas').value.split(',').map(primeiroNome).filter(Boolean);
      const pn=[...c.querySelectorAll('.f-pn:checked')].map(x=>x.value);
      if(role==='atendente'&&pn.some(p=>DADOS.includes(p))&&!pessoas.length){ b.disabled=false; m.textContent='Preencha o nome da pessoa nas planilhas (ex.: Leticia) antes de salvar.'; m.className='u-msg err'; return; }
      const r=await sb.rpc('admin_atualizar_usuario',{p_id:u.id,p_role:role,p_ativo:role==='pendente'?false:ativo.checked,p_pessoas:pessoas,p_paineis:pn,p_nome:null});
      b.disabled=false;
      if(r.error){ m.textContent=traduz(r.error); m.className='u-msg err'; return; }
      m.textContent='Salvo.'; m.className='u-msg ok'; setTimeout(renderAdmin,700);
    };
    box.appendChild(c);
  });
}

async function diagnostico(){
  const d=$('admin-diag'); if(!d) return null;
  d.innerHTML='<div class="hint">Conferindo nomes…</div>';
  const r=await sb.rpc('dados_diagnostico');
  if(r.error){ d.innerHTML='<div class="card"><div class="hint">Diagnóstico indisponível: rode o arquivo <b>05_diagnostico.sql</b> no Supabase. ('+esc(traduz(r.error))+')</div></div>'; return null; }
  const {nomes,usuarios}=r.data||{nomes:[],usuarios:[]};
  const orfaos=(nomes||[]).filter(n=>n.pessoa&&n.pessoa!=='TOTAL'&&!n.usuarios);
  const vazios=(usuarios||[]).filter(u=>u.total>0&&u.linhas===0);
  let h='<div class="card"><div class="lbl" style="margin-bottom:8px">Diagnóstico: quem vê o quê</div>';
  if(!orfaos.length&&!vazios.length) h+='<div class="u-msg ok">Tudo certo: todo atendente com painel liberado enxerga linhas, e todo nome publicado tem dono.</div>';
  if(vazios.length) h+='<div class="warn">'+vazios.map(u=>'<b>'+esc(u.nome)+'</b> não enxerga nenhuma linha em '+esc(PN[u.painel])+' (há '+u.total+' linhas publicadas; nome vinculado: '+esc((u.pessoas||[]).join(', ')||'nenhum')+')').join('<br>')+'</div>';
  if(orfaos.length) h+='<div class="warn" style="margin-top:8px"><b>Nomes publicados sem usuário vinculado</b> (provável grafia diferente): '+orfaos.map(n=>esc(PN[n.painel])+': <b>'+esc(n.pessoa)+'</b> ('+n.linhas+')').join(' · ')+'. Copie a grafia para o campo <i>Nome nas planilhas</i> do atendente (pode separar por vírgula).</div>';
  h+='</div>';
  d.innerHTML=h;
  return r.data;
}
/* ---------- publicação de planilhas (admin / gestor) ---------- */
const DESC={
  rec:'Planilha da <b>Cobrança de Rota</b> (colunas Data, Nome, Código, Endereço, Responsável e <b>Pago?</b> com Sim/Não). Cada publicação substitui a rota anterior.',
  hub:'Planilha do <b>Hub</b>: aba de tickets (Responsável, Origem, Razão de fechamento…) e/ou aba de desempenho (ATENDENTE, TMPR…). Substitui a base anterior.',
  aba:'Planilha de <b>Abastecimento</b> (formato resumido com coluna VENDEDOR). Substitui a base anterior.'
};
const planos={};
DESC.cli='<b>Base de Clientes</b>: publique a <b>base TOTVS</b> (RelFinCliente: atualiza o cadastro e a carteira de todos os consultores de uma vez, pela coluna Vendedor) e/ou a <b>venda diária</b> / notas fiscais (aba BASE com Cliente, Emissao, Quantidade, Vlr.Total). Pode publicar só um dos tipos: o que já está no site é mantido (meses novos substituem os mesmos meses). Cada consultor vê apenas os clientes da própria carteira.';
function acharCab(aoa,teste,max){ for(let i=0;i<Math.min(aoa.length,max||10);i++){ const c=(aoa[i]||[]).map(nz); if(teste(c)) return i; } return -1; }
function aoaDe(ws){ return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null}); }
function fmtColunas(ws,h,ncol){
  const rg=ws['!ref']?XLSX.utils.decode_range(ws['!ref']):{s:{r:0},e:{r:-1}};
  const fmt=new Array(ncol).fill(null);
  for(let c=0;c<ncol;c++){
    for(let r=rg.s.r+h+1;r<=Math.min(rg.e.r,rg.s.r+h+300);r++){
      const cel=ws[XLSX.utils.encode_cell({r,c:rg.s.c+c})];
      if(cel&&cel.t==='n'&&cel.z&&XLSX.SSF.is_date(cel.z)){ fmt[c]=cel.z; break; }
    }
  }
  return fmt;
}
function classificar(painel,ws,nomeAba,nomeArq,primeira){
  const aoa=aoaDe(ws);
  const c0=(aoa[0]||[]).map(nz);
  let tipo=null,h=0,pessoaCol=-1,aba=nomeAba;
  if(painel==='rec'){
    const ir=c0.findIndex(x=>x.indexOf('respons')>=0);
    if(ir>=0&&c0.some(x=>x.indexOf('data')>=0)&&c0.some(x=>x.indexOf('nome')>=0)&&c0.some(x=>x.indexOf('cod')>=0)){ tipo='rota'; pessoaCol=ir; aba='rota:'+nomeAba; }
  }else if(painel==='hub'){
    if(['responsavel','origem','razao de fechamento','data de abertura','data fechamento','titulo'].every(x=>c0.includes(x))){ tipo='tickets'; pessoaCol=c0.indexOf('responsavel'); }
    else if(c0.includes('atendente')&&c0.includes('tmpr')){ tipo='desempenho'; pessoaCol=c0.indexOf('atendente'); }
  }else if(painel==='aba'){
    if(!primeira) return null;
    h=acharCab(aoa,c=>(c.includes('quantidade')&&c.includes('mes')&&c.includes('consumo previsao mensal')&&c.includes('nome'))||(c.includes('data abastecimento')&&c.includes('kg')&&c.includes('cliente')));
    if(h>=0){ tipo='abastecimento'; pessoaCol=(aoa[h]||[]).map(nz).indexOf('vendedor'); }
  }
  if(!tipo) return null;
  const cab=(aoa[h]||[]).map(x=>x==null?null:x);
  const linhas=[];
  for(let i=h+1;i<aoa.length;i++){
    const l=(aoa[i]||[]).slice(0,cab.length); while(l.length<cab.length) l.push(null);
    if(l.every(x=>x===null||x==='')) continue;
    linhas.push({p:pessoaCol>=0&&l[pessoaCol]!=null?String(l[pessoaCol]).trim():'',l:l.map(x=>x===undefined||x===''?null:x)});
  }
  return {tipo,aba,cab,fmt:fmtColunas(ws,h,cab.length),linhas,arquivo:nomeArq,pessoaCol};
}
async function lerArquivos(painel,files){
  const abas=[],avisos=[];
  for(const file of files){
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellNF:true});
    wb.SheetNames.forEach((n,i)=>{
      const r=classificar(painel,wb.Sheets[n],n,file.name,i===0);
      if(r) abas.push(r); else if(painel!=='aba'||i===0) avisos.push('Aba "'+n+'" de '+file.name+' não foi reconhecida e será ignorada.');
    });
  }
  if(painel==='aba'&&abas.length&&abas[0].pessoaCol<0) avisos.push('Esta planilha não tem a coluna VENDEDOR: só administradores e gestores verão estes dados.');
  return {abas,avisos};
}
function resumoPessoas(abas){
  const m={}; let sem=0,total=0;
  abas.forEach(a=>a.linhas.forEach(x=>{ total++; const k=primeiroNome(x.p); if(k) m[k]=(m[k]||0)+1; else sem++; }));
  return {m,sem,total};
}
async function inserirLinhas(painel,aba,inicio,linhas,prog){
  for(let i=0;i<linhas.length;i+=800){
    const r=await sb.rpc('dados_inserir',{p_painel:painel,p_aba:aba,p_inicio:inicio+i,p_linhas:linhas.slice(i,i+800)});
    if(r.error) throw r.error;
    if(prog) prog(Math.min(i+800,linhas.length),linhas.length);
  }
}
async function rpcOk(nome,args){ const r=await sb.rpc(nome,args); if(r.error) throw r.error; return r.data; }
async function publicar(painel,plano,status){
  const abas=plano.abas;
  if(painel==='rec'){
    status('Publicando rota…');
    await rpcOk('dados_iniciar',{p_painel:'rec',p_prefixo:''});
    for(const a of abas.filter(x=>x.tipo==='rota')){ await inserirLinhas('rec',a.aba,1,a.linhas,(x,y)=>status('Publicando rota… '+Math.round(x/y*100)+'%')); await rpcOk('dados_meta_salvar',{p_painel:'rec',p_aba:a.aba,p_cabecalho:a.cab,p_fmt:a.fmt,p_arquivo:a.arquivo}); }
  }else{
    await rpcOk('dados_iniciar',{p_painel:painel,p_prefixo:''});
    for(const a of abas){
      status('Publicando "'+a.aba+'"…');
      await inserirLinhas(painel,a.aba,1,a.linhas,(x,y)=>status('Publicando "'+a.aba+'"… '+Math.round(x/y*100)+'%'));
      await rpcOk('dados_meta_salvar',{p_painel:painel,p_aba:a.aba,p_cabecalho:a.cab,p_fmt:a.fmt,p_arquivo:a.arquivo});
    }
  }
}
async function renderDados(){
  const box=$('dados-lista');
  const lista=DADOS.filter(p=>permitidos.includes(p));
  const mr=await sb.from('dados_meta').select('painel,aba,arquivo,enviado_em,fmt,cabecalho');
  const metas=mr.data||[];
  box.innerHTML='';
  if(lista.includes('cli')){ box.appendChild(cardImportacao(metas)); box.appendChild(cardParametros(metas)); }
  const outros=lista.filter(p=>p!=='cli'); let alvo=box;
  if(outros.length){ const dt=document.createElement('details'); dt.className='card'; dt.innerHTML='<summary>Outros painéis: Recuperação, Hub e Abastecimento</summary>'; box.appendChild(dt); alvo=document.createElement('div'); dt.appendChild(alvo); }
  outros.forEach(p=>{
    const ms=metas.filter(m=>m.painel===p);
    const ult=ms.slice().sort((a,b)=>String(b.enviado_em).localeCompare(String(a.enviado_em)))[0];
    const c=document.createElement('div'); c.className='card'; c.dataset.painel=p;
    c.innerHTML='<h2>'+PN[p]+'</h2><div class="hint">'+DESC[p]+'</div>'+
      '<div class="hint" style="margin-top:8px">'+(ult?'Última publicação: <b>'+esc(ult.arquivo||'—')+'</b> em '+new Date(ult.enviado_em).toLocaleString('pt-BR'):'Nada publicado ainda.')+'</div>'+
      '<div style="margin-top:12px" class="row"><input type="file" class="d-file" accept=".xlsx,.xlsm,.xls,.csv"'+(p==='rec'?' multiple':'')+'>'+
      '<button class="btn d-pub" type="button" disabled>Publicar</button></div>'+
      '<div class="d-prev"></div><div class="u-msg d-msg" style="margin:10px 0 0"></div>';
    const inp=c.querySelector('.d-file'), pub=c.querySelector('.d-pub'), prev=c.querySelector('.d-prev'), m=c.querySelector('.d-msg');
    inp.addEventListener('change',async()=>{
      pub.disabled=true; prev.innerHTML=''; m.textContent=''; m.className='u-msg d-msg'; delete planos[p];
      if(!inp.files.length) return;
      try{
        m.textContent='Lendo…';
        const pl=await lerArquivos(p,[...inp.files]); m.textContent='';
        if(!pl.abas.length){ m.textContent='Nenhuma aba reconhecida nesta planilha para '+PN[p]+'.'; m.className='u-msg d-msg err'; return; }
        planos[p]=pl;
        const rs=resumoPessoas(pl.abas);
        prev.innerHTML='<table class="pv"><tr><th>Responsável</th><th>Linhas</th></tr>'+
          Object.keys(rs.m).sort().map(k=>'<tr><td>'+esc(k)+'</td><td>'+rs.m[k]+'</td></tr>').join('')+
          (rs.sem?'<tr><td>(sem responsável — só admin/gestor)</td><td>'+rs.sem+'</td></tr>':'')+
          '<tr><td><b>Total</b></td><td><b>'+rs.total+'</b></td></tr></table>'+
          pl.avisos.map(a=>'<div class="warn">'+esc(a)+'</div>').join('');
        pub.disabled=false;
      }catch(e){ m.textContent='Não consegui ler a planilha: '+(e.message||e); m.className='u-msg d-msg err'; }
    });
    pub.onclick=async()=>{
      pub.disabled=true; inp.disabled=true; m.className='u-msg d-msg';
      try{
        await publicar(p,planos[p],t=>{m.textContent=t;});
        m.textContent='Publicado com sucesso.'; m.className='u-msg d-msg ok';
        delete planos[p]; setTimeout(()=>{ renderDados(); recarregarDados(); },900);
      }catch(e){ m.textContent='Falha ao publicar: '+traduz(e)+' (os dados do painel podem estar incompletos; envie novamente).'; m.className='u-msg d-msg err'; pub.disabled=false; inp.disabled=false; }
    };
    alvo.appendChild(c);
  });
}

/* ---------- início ---------- */
async function iniciar(){
  if(!SUPABASE_URL||!SUPABASE_ANON_KEY){ mostrarAuth('config'); return; }
  const fac=window.__sbFactory||(window.supabase&&window.supabase.createClient);
  if(!fac){ mostrarAuth('entrar'); msg('Não foi possível carregar o componente de login. Verifique a internet.'); return; }
  sb=fac(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  sb.auth.onAuthStateChange(ev=>{ if(ev==='PASSWORD_RECOVERY') mostrarAuth('nova'); });
  if(/type=recovery/.test(location.hash)){ mostrarAuth('nova'); return; }
  try{
    const {data}=await sb.auth.getSession();
    if(data&&data.session){ usuario=data.session.user; await entrarNoApp(); } else mostrarAuth('entrar');
  }catch(e){ mostrarAuth('entrar'); msg(traduz(e)); }
}
iniciar();


/* ================= Base de Clientes (cli) ================= */
function isoDe(v){
  if(v==null||v==='') return '';
  let d=null;
  if(v instanceof Date) d=new Date(Date.UTC(v.getFullYear(),v.getMonth(),v.getDate()));
  else if(typeof v==='number'){ if(v<20000) return ''; d=new Date(Math.round((v-25569)*86400000)); }
  else { const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)||null; if(m) d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3])); else { const b=String(v).match(/^(\d{2})\/(\d{2})\/(\d{4})/); if(b) d=new Date(Date.UTC(+b[3],+b[2]-1,+b[1])); } }
  if(!d||isNaN(d)||d.getUTCFullYear()<1950) return '';
  return d.toISOString().slice(0,10);
}
const cod6=v=>{ const d=String(v==null?'':v).replace(/\D/g,''); return d?d.padStart(6,'0'):''; };
const r2=x=>Math.round((+x||0)*100)/100;
function sheetsOrdenadas(wb){ const n=wb.SheetNames.slice(); const i=n.findIndex(x=>nz(x)==='base'); if(i>0){ n.unshift(n.splice(i,1)[0]); } return n; }
/* nome do consultor nas planilhas: primeira palavra do vendedor (exceções abaixo). Códigos que não são pessoas viram '(sem carteira)'. */
const CONSULTOR_ALIAS={'CARLOS PEDRA DE OLIVEIRA':'PEDRA'};
const NAO_CONSULTOR=/(INATIV|CONCORRENCIA|ENCERRAMENTO|ALTERACAO|DENEGADO|FORNECEDOR|SEM PERFIL|LICIT|PADRAO)/;
function consultorDe(v){
  const n=nz(String(v==null?'':v).replace(/\u00a0/g,' ')).toUpperCase().replace(/\s+/g,' ').trim();
  if(!n||NAO_CONSULTOR.test(n)) return '(sem carteira)';
  return CONSULTOR_ALIAS[n]||n.split(' ')[0];
}
/* código do vendedor na nota → consultor (aba "Dados" da planilha de venda diária, se existir; senão esta lista) */
const VEND_COD={'000002':'MAURO','000003':'FRANK','000004':'PEDRA','000005':'FRANKLIN','000006':'VINICIUS','000017':'FABIO','000008':'LICITAÇÃO'};
function mapaVendedores(wb){
  const m={}; const n=wb.SheetNames.find(x=>nz(x)==='dados'); if(!n) return m;
  aoaDe(wb.Sheets[n]).forEach(l=>{ if(!l||l[1]==null||l[0]==null) return; const c=cod6(l[1]); if(!c) return; const nome=/LICIT/.test(nz(l[0]).toUpperCase())?'LICITAÇÃO':consultorDe(l[0]); m[c]=nome; });
  return m;
}
function rotuloVend(v,mapa){
  if(v==null||v==='') return '(sem carteira)';
  const d=String(v).replace(/\D/g,'');
  if(d&&/^\d+$/.test(String(v).trim())){ return mapa[d.padStart(6,'0')]||'(sem carteira)'; }
  return consultorDe(v);
}
function lerCliWb(wb,nomeArq){
  for(const n of sheetsOrdenadas(wb)){
    const aoa=aoaDe(wb.Sheets[n]); if(!aoa.length) continue;
    const h=acharCab(aoa,c=>(c.includes('codigo')&&c.includes('nome fantasia')&&c.includes('preco tabela'))||(c.includes('cliente')&&c.includes('emissao')&&c.includes('quantidade')&&c.includes('vlr.total')),8);
    if(h<0) continue;
    const c=(aoa[h]||[]).map(nz), ix=k=>c.indexOf(k);
    if(c.includes('codigo')&&c.includes('cd.vendedor')&&c.includes('vendedor')&&!c.includes('consumo projetado')){
      /* RelFinCliente do TOTVS: base completa, o consultor vem da coluna Vendedor de cada linha */
      const g=(l,k)=>{ const j=ix(k); return j>=0?l[j]:null; };
      const porCod=new Map(), somaQ=new Map(), somaV=new Map(), lojasDet=new Map();
      let periodo='';
      { const t=String((aoa[0]||[])[0]||'').match(/Periodo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i); if(t) periodo=isoDe(t[1])+'|'+isoDe(t[2]); }
      for(let i=h+1;i<aoa.length;i++){ const l=aoa[i]||[]; const cod=cod6(g(l,'codigo')); if(!cod) continue;
        { const ld=lojasDet.get(cod)||[]; ld.push([String(g(l,'loja')==null?'01':g(l,'loja')).padStart(2,'0'),g(l,'nome'),g(l,'cnpj')==null?'':String(g(l,'cnpj')).trim(),g(l,'endereco'),g(l,'bairro'),g(l,'municipio'),g(l,'uf'),g(l,'status'),isoDe(g(l,'primeira compra')),+g(l,'preco tabela')||0]); lojasDet.set(cod,ld); }
        somaQ.set(cod,(somaQ.get(cod)||0)+(+g(l,'quantidade')||0)); somaV.set(cod,(somaV.get(cod)||0)+(+g(l,'valor total')||0));
        const loja=String(g(l,'loja')==null?'01':g(l,'loja')).padStart(2,'0');
        const ant=porCod.get(cod); if(ant&&(ant.loja==='01'||loja!=='01')) continue;
        const cons=consultorDe(g(l,'vendedor')), preco=+g(l,'preco tabela')||0;
        porCod.set(cod,{loja,row:[cod,g(l,'nome'),g(l,'endereco'),g(l,'nome fantasia'),g(l,'bairro'),g(l,'uf'),g(l,'municipio'),g(l,'cnpj')==null?null:String(g(l,'cnpj')).trim(),cons,g(l,'status'),isoDe(g(l,'primeira compra')),isoDe(g(l,'ultima compra')),preco,0,0,null,loja,'',String(g(l,'vendedor')==null?'':g(l,'vendedor')).replace(/\s+/g,' ').trim(),0,0,String(g(l,'cond.pagamento')==null?'':g(l,'cond.pagamento')).trim(),'','']}); }
      const rows=[...porCod.values()].map(x=>{ x.row[19]=r2(somaQ.get(x.row[0])); x.row[20]=r2(somaV.get(x.row[0])); x.row[24]=(lojasDet.get(x.row[0])||[]).sort((a,b)=>a[0]<b[0]?-1:1); return x.row; });
      const por={}; rows.forEach(r=>{ por[r[8]]=(por[r[8]]||0)+1; });
      return {tipo:'relfin',rows,por,arquivo:nomeArq,aba:n,periodo};
    }
    if(c.includes('codigo')){
      let cons='';
      const pn=wb.Sheets['Painel']||wb.Sheets[wb.SheetNames.find(x=>nz(x)==='painel')];
      if(pn){ const a=aoaDe(pn); const l=a[0]||[]; if(nz(l[0]).indexOf('consultor')===0&&l[1]) cons=String(l[1]).trim().toUpperCase(); }
      if(!cons){ const m=String(nomeArq).match(/_([^_.]+)\.[a-z]+$/i); if(m) cons=m[1].toUpperCase(); }
      const g=(l,k)=>{ const j=ix(k); return j>=0?l[j]:null; };
      const rows=[];
      for(let i=h+1;i<aoa.length;i++){ const l=aoa[i]||[]; const cod=cod6(g(l,'codigo')); if(!cod) continue;
        const preco=+g(l,'preco tabela')||0, prevq=+g(l,'consumo projetado')||0;
        rows.push([cod,g(l,'nome'),g(l,'endereco'),g(l,'nome fantasia'),g(l,'bairro'),g(l,'uf'),g(l,'municipio'),g(l,'cnpj')==null?null:String(g(l,'cnpj')).trim(),cons,g(l,'status'),isoDe(g(l,'primeira compra')),isoDe(g(l,'ultima compra')),preco,prevq,r2(prevq*preco),g(l,'dono do tanque'),String(g(l,'loja')==null?'01':g(l,'loja')).padStart(2,'0'),'','',null,null,'','','']); }
      return {tipo:'carteira',cons,rows,arquivo:nomeArq,aba:n};
    }
    const ag=new Map(); const nomes={}; let minE='',maxE='',nl=0;
    const iVd=ix('codigo vendedor')>=0?ix('codigo vendedor'):ix('vendedor'); const dia=new Map(), ultE=new Map(), mesMax={}; const mapa=Object.assign({},VEND_COD,mapaVendedores(wb));
    const iC=ix('cliente'),iL=ix('loja'),iN=ix('nome'),iD=ix('descricao'),iDoc=ix('num. docto.'),iS=ix('serie'),iE=ix('emissao'),iQ=ix('quantidade'),iV=ix('vlr.total');
    for(let i=h+1;i<aoa.length;i++){ const l=aoa[i]||[]; const cod=cod6(l[iC]); const e=isoDe(l[iE]); if(!cod||!e) continue;
      nl++; if(!minE||e<minE) minE=e; if(e>maxE) maxE=e; if(!ultE.get(cod)||e>ultE.get(cod)) ultE.set(cod,e); { const ym0=e.slice(0,7); if(!mesMax[ym0]||e>mesMax[ym0]) mesMax[ym0]=e; }
      const ym=e.slice(0,7), k=cod+'|'+ym; let a=ag.get(k); if(!a){ a={cod,ym,q:0,v:0,nf:new Set(),dev:new Set(),lojas:new Set()}; ag.set(k,a); }
      { const rv=iVd>=0?l[iVd]:null; const lb=rotuloVend(rv,mapa); const kd=e+'|'+lb; let dd=dia.get(kd); if(!dd){ dd={iso:e,cons:lb,q:0,v:0,nf:new Set()}; dia.set(kd,dd); } dd.q+=+l[iQ]||0; dd.v+=+l[iV]||0; if(!/^dev/i.test(String(l[iD]||''))) dd.nf.add(String(l[iDoc]==null?'':l[iDoc])+'/'+String(l[iS]==null?'':l[iS])); }
      a.q+=+l[iQ]||0; a.v+=+l[iV]||0; a.lojas.add(String(l[iL]==null?'01':l[iL]).padStart(2,'0'));
      const doc=String(l[iDoc]==null?'':l[iDoc])+'/'+String(l[iS]==null?'':l[iS]);
      if(/^dev/i.test(String(l[iD]||''))) a.dev.add(doc); else a.nf.add(doc);
      if(iN>=0&&l[iN]) nomes[cod]=String(l[iN]).trim(); }
    if(!nl) continue;
    return {tipo:'vendas',ag,dia,ultE,mesMax,nomes,minE,maxE,nl,arquivo:nomeArq,aba:n,meses:[...new Set([...ag.values()].map(a=>a.ym))].sort()};
  }
  return null;
}
/* Bases_Infos: totais mensais da empresa desde jan/2025 (faturamento, volume, clientes faturados, vendas, devoluções) */
function lerBaseInfos(wb){
  const n=wb.SheetNames.find(x=>nz(x)==='base_infos'); if(!n) return null;
  const aoa=aoaDe(wb.Sheets[n]); let hi=-1, cols={};
  for(let i=0;i<Math.min(aoa.length,14);i++){ const m={}; (aoa[i]||[]).forEach((v,j)=>{ if(j>=4&&typeof v==='number'){ const iso=isoDe(v); if(iso) m[j]=iso.slice(0,7); } else if(j>=4&&v instanceof Date){ const iso=isoDe(v); if(iso) m[j]=iso.slice(0,7); } }); if(Object.keys(m).length>=6){ hi=i; cols=m; break; } }
  if(hi<0) return null;
  const alvo={fat:'faturamento (emissao de nf.)',kg:'volume vendido',cli:'clientes faturados',vb:'vendas brutas',vl:'vendas liquidas',canc:'faturamento cancelado',dev:'vendas devolvidas'}, lin={};
  aoa.forEach((l,i)=>{ if(i<=hi) return; for(let j=0;j<4;j++){ const t=nz((l||[])[j]); for(const k in alvo) if(!lin[k]&&t===alvo[k]) lin[k]=i; } });
  if(lin.fat==null&&lin.kg==null) return null;
  const num=v=>(typeof v==='number'&&isFinite(v))?v:null, out=[];
  Object.keys(cols).forEach(j=>{ const g=k=>lin[k]==null?null:num((aoa[lin[k]]||[])[j]); const fat=g('fat'), kg=g('kg'); if(!(fat>0||kg>0)) return;
    out.push([cols[j],r2(fat||0),r2(kg||0),g('cli')||0,g('vb')||0,g('vl')||0,r2(g('canc')||0),g('dev')||0]); });
  out.sort((a,b)=>a[0]<b[0]?-1:1);
  return out.length?{rows:out,aba:n}:null;
}
/* Previsão por cliente: aba "BASE 85%" do Bases_Infos (coluna PROJETADO, em kg/mês) */
function lerPrevBases(wb){
  const n=wb.SheetNames.find(x=>/^base\s*85/.test(nz(x).toLowerCase())); if(!n) return null;
  const aoa=aoaDe(wb.Sheets[n]); let hi=-1,ic=-1,ip=-1;
  for(let i=0;i<Math.min(aoa.length,8);i++){ const h=(aoa[i]||[]).map(v=>nz(v).toLowerCase()); const a=h.indexOf('cliente'), b=h.findIndex(x=>x==='projetado'); if(a>=0&&b>=0){ hi=i; ic=a; ip=b; break; } }
  if(hi<0) return null;
  const m={}; let c=0; for(let i=hi+1;i<aoa.length;i++){ const l=aoa[i]||[]; const cod=cod6(l[ic]), q=+l[ip]; if(cod&&q>0){ m[cod]=q; c++; } }
  return c?{m,aba:n,n:c}:null;
}
async function lerCliArquivos(files){
  const cart=[],vend=[],anual=[],prev=[],avisos=[];
  for(const file of files){
    try{ const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
      const r=lerCliWb(wb,file.name);
      let bi=null; try{ bi=lerBaseInfos(wb); }catch(_){}
      if(bi){ bi.arquivo=file.name; anual.push(bi); }
      let pv=null; try{ pv=lerPrevBases(wb); }catch(_){} if(pv){ pv.arquivo=file.name; prev.push(pv); }
      if(!r&&bi){ /* só histórico anual */ }
      else if(!r) avisos.push('Arquivo '+file.name+': não reconheci a base TOTVS (RelFinCliente), carteira (aba base) nem venda diária (Cliente, Emissao, Quantidade, Vlr.Total). Ignorado.');
      else if(r.tipo==='relfin') cart.push(r);
      else if(r.tipo==='carteira'){ if(!r.cons) avisos.push('Carteira '+file.name+': consultor não identificado (célula B1 da aba Painel ou nome do arquivo).'); cart.push(r); } else vend.push(r);
    }catch(e){ avisos.push('Não consegui ler '+file.name+': '+(e.message||e)); }
  }
  return {cart,vend,anual,prev,avisos};
}
/* junta o que já está no site com os arquivos novos e devolve as linhas prontas para gravar.
   Regras da carteira (v3.6) aplicadas na importação: consultor anterior (ANT) e reatribuição de ALTERACAO CADASTRAL / ENCERRAMENTO
   quando o cliente ainda tem consumo. Retirados, exclusões, preço mínimo e demais parâmetros são avaliados na própria Base de Clientes. */
const ehPessoa=x=>!!x&&x!=='(sem carteira)';
function mesclarCli(exist,pl){
  const cad=new Map(); let ultima='', par=null; let ate={}; const anoMap=new Map();
  for(const d of exist){
    if(d.meta.aba==='ano') d.linhas.forEach(r=>anoMap.set(r[0],r));
    if(d.meta.aba==='mes'&&d.meta.fmt&&d.meta.fmt.ate) ate=Object.assign({},d.meta.fmt.ate);
    if(d.meta.aba==='cad'){ d.linhas.forEach(r=>cad.set(r[0],r)); if(d.meta.fmt&&d.meta.fmt.par) par=d.meta.fmt.par; }
    if(d.meta.aba==='mes'&&d.meta.fmt&&d.meta.fmt.ultima_venda) ultima=d.meta.fmt.ultima_venda;
  }
  const hoje=new Date().toISOString().slice(0,10);
  const rel=pl.cart.filter(c=>c.tipo==='relfin'), cf=pl.cart.filter(c=>c.tipo!=='relfin');
  const novosCli=[], reatrib=[]; let retiradosSemConsultor=0;
  if(rel.length){
    const velho=new Map(cad), primeira=velho.size===0; cad.clear();
    const antCf=new Map(); cf.forEach(c=>c.rows.forEach(r=>{ if(ehPessoa(r[8])) antCf.set(r[0],r[8]); }));
    rel.forEach(f=>f.rows.forEach(r=>{
      const o=velho.get(r[0]);
      if(o){ if(!r[13]) r[13]=o[13]; if(!r[14]) r[14]=o[14]; if(!r[15]) r[15]=o[15]; }
      r[17]=ehPessoa(r[8])?r[8]:(antCf.get(r[0])||(o&&(o[17]||(ehPessoa(o[8])?o[8]:'')))||'');
      r[23]=o?(o[23]||''):(primeira?'':hoje);
      if(!o&&!primeira) novosCli.push(r);
      const sc=/ALTERACAO|ENCERRAMENTO/.test(nz(r[18]).toUpperCase());
      const ativoOuComVenda=/^ativo/i.test(r[9]||'')||((+r[19]||0)>0);
      if(!ehPessoa(r[8])&&sc&&(+r[19]||0)>0&&ativoOuComVenda&&r[17]){ reatrib.push({cod:r[0],nome:r[1],de:r[18],para:r[17],qtd:r[19]}); r[22]=r[18]; r[8]=r[17]; }
      cad.set(r[0],r);
    }));
    for(const [k,o] of velho) if(!cad.has(k)) cad.set(k,o); /* histórico: cliente que sumiu do relatório continua cadastrado */
    cf.forEach(c=>c.rows.forEach(r=>{ const x=cad.get(r[0]); if(x){ if(r[13]) x[13]=r[13]; if(r[14]) x[14]=r[14]; if(r[15]) x[15]=r[15]; } else cad.set(r[0],r); }));
  }else{
    const novosCons=new Set(cf.map(c=>c.cons).filter(Boolean));
    if(novosCons.size) for(const [k,r] of [...cad]) if(novosCons.has(r[8])) cad.delete(k);
    cf.forEach(c=>c.rows.forEach(r=>{ if(!cad.has(r[0])) cad.set(r[0],r); else { const x=cad.get(r[0]); if(r[13]) x[13]=r[13]; if(r[14]) x[14]=r[14]; if(r[15]) x[15]=r[15]; } }));
  }
  const mes=new Map();
  exist.filter(d=>d.meta.aba==='mes').forEach(d=>d.linhas.forEach(r=>{ const m={}; (r[2]||[]).forEach(x=>{ m[x[0]]=[x[1],x[2],x[3],x[4]]; }); mes.set(r[0],{nome:r[1],m,lojas:new Set(r[3]||[]),ult:r[4]||''}); }));
  /* Histórico: um mês só é substituído se o arquivo novo for tão recente quanto o que já está gravado (nunca volta no tempo). */
  const diaAnt=[]; exist.filter(d=>d.meta.aba==='dia').forEach(d=>d.linhas.forEach(r=>{ diaAnt.push(r); const ym=String(r[0]).slice(0,7); if(!ate[ym]||r[0]>ate[ym]) ate[ym]=r[0]; }));
  if(!Object.keys(ate).length&&ultima) ate[ultima.slice(0,7)]=ultima;
  const dono={}; pl.vend.forEach(f=>Object.keys(f.mesMax).forEach(ym=>{ if(!dono[ym]||f.mesMax[ym]>=dono[ym].mesMax[ym]) dono[ym]=f; }));
  const novos=new Set(), mantidos=[];
  Object.keys(dono).forEach(ym=>{ if(dono[ym].mesMax[ym]>=(ate[ym]||'')) novos.add(ym); else mantidos.push(ym); });
  novos.forEach(ym=>{ ate[ym]=dono[ym].mesMax[ym]; });
  for(const [k,x] of [...mes]){ novos.forEach(ym=>delete x.m[ym]); if(!Object.keys(x.m).length&&!x.ult) mes.delete(k); }
  const dia=new Map(); diaAnt.forEach(r=>{ if(!novos.has(String(r[0]).slice(0,7))) dia.set(r[0]+'|'+r[1],r); });
  pl.vend.forEach(f=>{
    for(const a of f.ag.values()){ if(dono[a.ym]!==f||!novos.has(a.ym)) continue;
      let x=mes.get(a.cod); if(!x){ x={nome:f.nomes[a.cod]||'',m:{},lojas:new Set(),ult:''}; mes.set(a.cod,x); }
      if(!x.nome&&f.nomes[a.cod]) x.nome=f.nomes[a.cod];
      x.m[a.ym]=[r2(a.q),r2(a.v),a.nf.size,a.dev.size]; a.lojas.forEach(l=>x.lojas.add(l)); }
    for(const d of f.dia.values()){ if(dono[d.iso.slice(0,7)]!==f||!novos.has(d.iso.slice(0,7))) continue; dia.set(d.iso+'|'+d.cons,[d.iso,d.cons,r2(d.q),r2(d.v),d.nf.size]); }
    for(const [cod,e] of f.ultE){ let x=mes.get(cod); if(!x){ x={nome:f.nomes[cod]||'',m:{},lojas:new Set(),ult:''}; mes.set(cod,x); } if(e>(x.ult||'')) x.ult=e; } });
  Object.keys(ate).forEach(ym=>{ if(ate[ym]>ultima) ultima=ate[ym]; });
  /* totais anuais da empresa (Bases_Infos): meses novos substituem, os antigos ficam */
  (pl.anual||[]).forEach(bi=>bi.rows.forEach(r=>anoMap.set(r[0],r)));
  const anoRows=[...anoMap.values()].sort((a,b)=>a[0]<b[0]?-1:1).map(r=>({p:'',l:r}));
  /* previsão do Bases_Infos: vale para o cliente que não veio de uma carteira individual desta importação */
  const cobertos=new Set(); cf.forEach(c=>c.rows.forEach(r=>{ if(+r[13]>0) cobertos.add(r[0]); }));
  let prevAplic=0;
  (pl.prev||[]).forEach(p=>{ for(const cod in p.m){ const x=cad.get(cod); if(!x||cobertos.has(cod)) continue; x[13]=p.m[cod]; x[14]=r2(p.m[cod]*(+x[12]||0)); prevAplic++; } });
  const cadRows=[...cad.values()].sort((a,b)=>a[0]<b[0]?-1:1).map(r=>({p:r[8]||'',l:r}));
  const semCad=[];
  const mesRows=[...mes.entries()].sort((a,b)=>a[0]<b[0]?-1:1).map(([cod,x])=>{
    const c=cad.get(cod); if(!c) semCad.push(cod);
    return {p:c?(c[8]||''):'',l:[cod,x.nome||(c?c[1]:''),Object.keys(x.m).sort().map(ym=>[ym].concat(x.m[ym])),[...x.lojas].sort(),x.ult||'']}; });
  const diaRows=[...dia.values()].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:(a[1]<b[1]?-1:1)).map(r=>({p:r[1],l:r}));
  return {prevAplic,cadRows,mesRows,diaRows,anoRows,ultima,ate,mantidos:mantidos.sort(),semCad,novos:[...novos].sort(),novosCli,reatrib,par};
}
const PAR_DEF={preco_min:5,preco_alerta:6,corte_kg:200,rec:[30,60,90],novos_dias:90,piso_proj:85,meta_kg:0,meta_rs:0,excl:[],fixos:[]};
const nBR=(n,d)=>Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});
const lerLista=t=>[...new Set((String(t||'').match(/\d+/g)||[]).map(cod6))];
/* ---------- Central de importação (só gestor/admin) ---------- */
function cardImportacao(metas){
  const mc=metas.filter(m=>m.painel==='cli');
  const cad=mc.find(m=>m.aba==='cad'), mes=mc.find(m=>m.aba==='mes'), dia=mc.find(m=>m.aba==='dia'), ano=mc.find(m=>m.aba==='ano');
  const ult=(m)=>m?'Último envio: <b>'+new Date(m.enviado_em).toLocaleString('pt-BR')+'</b>':'Nada enviado ainda.';
  const c=document.createElement('div'); c.className='card'; c.dataset.painel='cli';
  c.innerHTML='<h2>Atualização diária</h2>'+
   '<div class="hint">Todo dia: escolha os dois arquivos abaixo e clique em <b>Importar agora</b>. Cada consultor passa a ver só os próprios clientes e resultados; esta tela existe só para gestores e administradores.</div>'+
   '<div class="imp-steps">'+
    '<div class="imp-box" data-k="vend"><div class="imp-t"><span class="imp-n">1</span>Venda diária</div><div class="imp-d"><b>Mantém o faturamento atualizado.</b> Planilha de notas fiscais (aba BASE: Cliente, Emissao, Quantidade, Vlr.Total, Vendedor). Os meses que vierem no arquivo substituem os mesmos meses já gravados.</div><input type="file" accept=".xlsx,.xlsm,.xls" multiple><div class="imp-st"></div><div class="imp-last">'+ult(mes||dia)+(mes&&mes.fmt&&mes.fmt.ultima_venda?' · faturamento até <b>'+dBRi(mes.fmt.ultima_venda)+'</b>':'')+'</div></div>'+
    '<div class="imp-box" data-k="rel"><div class="imp-t"><span class="imp-n">2</span>Relatório de vendas por cliente</div><div class="imp-d"><b>Traz os clientes novos</b> com código, dados e primeira compra, e atualiza o cadastro e a carteira de todos os consultores (RelFinCliente do TOTVS).</div><input type="file" accept=".xlsx,.xlsm,.xls"><div class="imp-st"></div><div class="imp-last">'+ult(cad)+'</div></div>'+
   '</div>'+
   '<div class="imp-box" data-k="hist" style="margin:0 0 14px"><div class="imp-t"><span class="imp-n">3</span>Histórico anual (Bases_Infos)</div><div class="imp-d"><b>Complementa o histórico desde jan/2025:</b> traz as notas fiscais de 2025 em diante e os totais mensais da empresa (faturamento, volume, clientes faturados, vendas e devoluções). Envie quando atualizar a planilha, em geral uma vez por mês. O que já está gravado nunca é apagado.</div><input type="file" accept=".xlsx,.xlsm,.xls"><div class="imp-st"></div><div class="imp-last">'+(ano?'Último envio: <b>'+new Date(ano.enviado_em).toLocaleString('pt-BR')+'</b>':'Nada enviado ainda.')+'</div></div>'+
   '<details style="margin:2px 0 14px"><summary class="lnk" style="cursor:pointer">Opcional: carteiras individuais com consumo projetado</summary><div class="imp-box" data-k="cart" style="margin-top:10px"><div class="imp-d">Só quando a projeção de consumo mudar. Selecione os arquivos <i>Carteira_…_NOME.xlsx</i> (vários de uma vez). A projeção de cada cliente é guardada e o resto é mantido.</div><input type="file" accept=".xlsx,.xlsm,.xls" multiple><div class="imp-st"></div></div></details>'+
   '<div class="imp-go"><button class="btn big imp-go-btn" type="button" disabled>Importar agora</button><div class="u-msg imp-msg" style="margin:0"></div></div>'+
   '<div class="imp-bar" hidden><i></i></div><div class="imp-res"></div><div class="imp-warns"></div>';
  const est={vend:null,rel:null,hist:null,cart:null}; let exist=null;
  const go=c.querySelector('.imp-go-btn'), msgE=c.querySelector('.imp-msg'), res=c.querySelector('.imp-res'), wr=c.querySelector('.imp-warns'), bar=c.querySelector('.imp-bar');
  const plano=()=>({cart:[...(est.rel?est.rel.cart:[]),...(est.cart?est.cart.cart:[])],vend:[...(est.vend?est.vend.vend:[]),...(est.hist?est.hist.vend:[])],anual:[...(est.vend?est.vend.anual:[]),...(est.hist?est.hist.anual:[])],prev:[...(est.vend?est.vend.prev||[]:[]),...(est.hist?est.hist.prev||[]:[])],avisos:[]});
  const setMsg=(t,k)=>{ msgE.textContent=t||''; msgE.className='u-msg imp-msg'+(k?' '+k:''); };
  function previa(){
    const pl=plano(); res.innerHTML=''; wr.innerHTML='';
    go.disabled=!(pl.cart.length||pl.vend.length||pl.anual.length||pl.prev.length);
    if(go.disabled) return;
    try{
      const r=mesclarCli(exist||[],{cart:pl.cart.map(x=>({...x,rows:x.rows.map(y=>y.slice())})),vend:pl.vend,anual:pl.anual,prev:pl.prev});
      const k=(n,t)=>'<div class="imp-kpi"><b>'+n+'</b><span>'+t+'</span></div>';
      let h='';
      if(pl.vend.length){ const dias=new Set(r.diaRows.map(x=>x.l[0])).size; h+=k(pl.vend.reduce((a,x)=>a+x.nl,0).toLocaleString('pt-BR'),'notas lidas')+k(r.novos.length,'meses atualizados')+k(r.mantidos.length,'meses mantidos (o gravado é mais recente)'); }
      if(r.prevAplic) h+=k(r.prevAplic.toLocaleString('pt-BR'),'clientes com previsão (Bases_Infos)');
      if(pl.anual.length) h+=k(pl.anual.reduce((a,x)=>a+x.rows.length,0),'meses de totais anuais');
      if(pl.cart.some(x=>x.tipo==='relfin')){ h+=k(r.cadRows.length.toLocaleString('pt-BR'),'clientes no cadastro')+k(r.novosCli.length,'clientes novos')+k(r.reatrib.length,'reatribuídos ao consultor anterior'); }
      res.innerHTML=h;
      const w=[]; if(r.semCad.length) w.push(r.semCad.length+' clientes com venda não estão no cadastro (só gestor/admin os veem). Envie também o relatório 2.');
      if(!exist||!exist.some(d=>d.meta.aba==='cad')&&!pl.cart.length) w.push('Ainda não há cadastro publicado: envie também o relatório de vendas por cliente (2).');
      wr.innerHTML=w.map(t=>'<div class="warn">'+esc(t)+'</div>').join('');
    }catch(e){ setMsg('Não consegui conferir os arquivos: '+(e.message||e),'err'); }
  }
  async function ler(k,files,box){
    const st=box.querySelector('.imp-st'); box.className='imp-box'; est[k]=null; st.innerHTML='Lendo…';
    try{
      if(!exist) exist=await buscarDados('cli');
      const pl=await lerCliArquivos(files); const av=pl.avisos.map(a=>'<div class="warn">'+esc(a)+'</div>').join('');
      const ok=k==='vend'?pl.vend.length&&!pl.cart.length:k==='hist'?(pl.vend.length||pl.anual.length)&&!pl.cart.length:k==='rel'?pl.cart.some(x=>x.tipo==='relfin')&&!pl.vend.length:pl.cart.some(x=>x.tipo==='carteira')&&!pl.vend.length;
      if(!ok){ box.classList.add('err'); const achou=pl.vend.length?'venda diária (notas fiscais)':pl.cart.some(x=>x.tipo==='relfin')?'relatório de vendas por cliente (RelFinCliente)':pl.cart.length?'carteira individual':'nenhum formato conhecido'; st.innerHTML='<b>Arquivo no lugar errado ou não reconhecido.</b> Este parece ser: '+achou+'.'+av; previa(); return; }
      est[k]=pl; box.classList.add('ok');
      if(k==='vend') st.innerHTML=pl.vend.map(x=>'✓ <b>'+esc(x.arquivo)+'</b><br>'+x.nl.toLocaleString('pt-BR')+' linhas · '+dBRi(x.minE)+' a '+dBRi(x.maxE)).join('<br>')+av;
      else if(k==='hist') st.innerHTML=pl.vend.map(x=>'✓ <b>'+esc(x.arquivo)+'</b><br>'+x.nl.toLocaleString('pt-BR')+' notas · '+dBRi(x.minE)+' a '+dBRi(x.maxE)).join('<br>')+(pl.anual.length?'<br>Totais anuais: '+pl.anual.map(x=>x.rows[0][0].slice(5)+'/'+x.rows[0][0].slice(0,4)+' a '+x.rows[x.rows.length-1][0].slice(5)+'/'+x.rows[x.rows.length-1][0].slice(0,4)).join(', '):'<br><span class="warn">A aba Base_Infos não foi encontrada: só as notas serão importadas.</span>')+(pl.prev&&pl.prev.length?'<br>Previsão por cliente: '+pl.prev.reduce((a,x)=>a+x.n,0).toLocaleString('pt-BR')+' clientes (aba '+esc(pl.prev[0].aba)+')':'')+av;
      else if(k==='rel') st.innerHTML=pl.cart.map(x=>'✓ <b>'+esc(x.arquivo)+'</b><br>'+x.rows.length.toLocaleString('pt-BR')+' clientes'+(x.periodo?' · vendas de '+dBRi(x.periodo.split('|')[0])+' a '+dBRi(x.periodo.split('|')[1]):'')).join('<br>')+av;
      else st.innerHTML=pl.cart.map(x=>'✓ '+esc(x.cons||'?')+' · '+x.rows.length+' clientes').join('<br>')+av;
    }catch(e){ box.classList.add('err'); st.textContent='Não consegui ler: '+(e.message||e); }
    previa();
  }
  c.querySelectorAll('.imp-box').forEach(box=>{
    const k=box.dataset.k, inp=box.querySelector('input');
    inp.addEventListener('change',()=>{ if(inp.files.length) ler(k,[...inp.files],box); else { est[k]=null; box.className='imp-box'; box.querySelector('.imp-st').textContent=''; previa(); } });
    ['dragenter','dragover'].forEach(ev=>box.addEventListener(ev,e=>{ e.preventDefault(); box.classList.add('drag'); }));
    ['dragleave','drop'].forEach(ev=>box.addEventListener(ev,e=>{ e.preventDefault(); box.classList.remove('drag'); }));
    box.addEventListener('drop',e=>{ const fs=[...(e.dataTransfer&&e.dataTransfer.files||[])]; if(fs.length) ler(k,fs,box); });
  });
  go.onclick=async()=>{
    const pl=plano(); go.disabled=true; c.querySelectorAll('input').forEach(i=>i.disabled=true); bar.hidden=false; const fill=bar.firstChild; fill.style.width='3%'; setMsg('Lendo o que já está publicado…');
    try{
      const ex=await buscarDados('cli'); const r=mesclarCli(ex,pl);
      const arq=[...pl.cart,...pl.vend].map(x=>x.arquivo).join(', ').slice(0,300);
      await rpcOk('dados_iniciar',{p_painel:'cli',p_prefixo:''});
      const tot=r.cadRows.length+r.mesRows.length+r.diaRows.length+r.anoRows.length; let feito=0;
      const prog=(x,t)=>{ fill.style.width=Math.max(5,Math.round((feito+x)/tot*95))+'%'; setMsg(t); };
      setMsg('Publicando carteiras…');
      await inserirLinhas('cli','cad',1,r.cadRows,(x)=>prog(x,'Publicando carteiras…')); feito+=r.cadRows.length;
      await rpcOk('dados_meta_salvar',{p_painel:'cli',p_aba:'cad',p_cabecalho:['cadastro'],p_fmt:r.par?{par:r.par}:{},p_arquivo:arq});
      await inserirLinhas('cli','mes',1,r.mesRows,(x)=>prog(x,'Publicando consumo mensal…')); feito+=r.mesRows.length;
      await rpcOk('dados_meta_salvar',{p_painel:'cli',p_aba:'mes',p_cabecalho:['consumo mensal'],p_fmt:{ultima_venda:r.ultima,ate:r.ate},p_arquivo:arq});
      await inserirLinhas('cli','dia',1,r.diaRows,(x)=>prog(x,'Publicando faturamento diário…')); feito+=r.diaRows.length;
      await rpcOk('dados_meta_salvar',{p_painel:'cli',p_aba:'dia',p_cabecalho:['faturamento diário'],p_fmt:{ultima_venda:r.ultima},p_arquivo:arq});
      await inserirLinhas('cli','ano',1,r.anoRows,(x)=>prog(x,'Publicando totais anuais…')); feito+=r.anoRows.length;
      await rpcOk('dados_meta_salvar',{p_painel:'cli',p_aba:'ano',p_cabecalho:['totais anuais'],p_fmt:{},p_arquivo:arq});
      fill.style.width='100%';
      setMsg('Importação concluída: '+r.cadRows.length.toLocaleString('pt-BR')+' clientes, faturamento até '+dBRi(r.ultima)+'.'+(r.mantidos.length?' Mantidos os dados mais recentes já gravados de: '+r.mantidos.map(x=>x.slice(5)+'/'+x.slice(0,4)).join(', ')+'.':''),'ok');
      let h='<div class="imp-kpi"><b>'+r.cadRows.length.toLocaleString('pt-BR')+'</b><span>clientes no cadastro</span></div><div class="imp-kpi"><b>'+r.novosCli.length+'</b><span>clientes novos nesta importação</span></div><div class="imp-kpi"><b>'+r.reatrib.length+'</b><span>reatribuídos ao consultor anterior</span></div><div class="imp-kpi"><b>'+dBRi(r.ultima)+'</b><span>faturamento até</span></div>';
      res.innerHTML=h;
      if(r.novosCli.length) wr.innerHTML='<div class="imp-d" style="margin-top:14px"><b>Clientes novos</b> (código · nome · município · consultor · primeira compra)</div><table class="pv">'+r.novosCli.slice(0,40).map(x=>'<tr><td>'+esc(x[0])+'</td><td>'+esc(x[3]||x[1])+'</td><td>'+esc(x[6]||'')+'</td><td>'+esc(x[8])+'</td><td>'+dBRi(x[10])+'</td></tr>').join('')+'</table>'+(r.novosCli.length>40?'<div class="hint">…e mais '+(r.novosCli.length-40)+'. A lista completa fica na aba Novos da Base de Clientes.</div>':'');
      exist=null; Object.keys(est).forEach(k=>est[k]=null);
      c.querySelectorAll('.imp-last').forEach(e=>{ e.innerHTML='Último envio: <b>'+new Date().toLocaleString('pt-BR')+'</b>'; });
      c.querySelectorAll('.imp-box').forEach(b=>{ b.className='imp-box'; b.querySelector('.imp-st').textContent=''; });
      setTimeout(()=>{ recarregarDados(); },1200);
    }catch(e){ setMsg('Falha ao publicar: '+traduz(e)+' (os dados podem estar incompletos; envie novamente).','err'); go.disabled=false; }
    c.querySelectorAll('input').forEach(i=>{ i.disabled=false; i.value=''; });
  };
  return c;
}
/* ---------- parâmetros da carteira ---------- */
function cardParametros(metas){
  const cad=metas.find(m=>m.painel==='cli'&&m.aba==='cad');
  const P=Object.assign({},PAR_DEF,(cad&&cad.fmt&&cad.fmt.par)||{});
  const c=document.createElement('details'); c.className='card';
  const f=(id,l,v,t)=>'<div class="fld"><label>'+l+'</label><input type="'+(t||'number')+'" step="any" id="par-'+id+'" value="'+esc(v)+'"></div>';
  c.innerHTML='<summary>Parâmetros da carteira</summary><div class="hint" style="margin-bottom:14px">Valem para todos os consultores e são aplicados na hora, sem reimportar. '+(cad?'':'<b>Importe o relatório 2 uma vez antes de salvar.</b>')+'</div>'+
   '<div class="par-grid">'+f('preco_min','Preço de tabela mínimo (R$/kg) — abaixo disso o cliente sai da carteira',P.preco_min)+f('preco_alerta','Alerta de preço baixo (R$/kg)',P.preco_alerta)+f('corte_kg','Corte de classificação (kg/mês)',P.corte_kg)+f('rec','Marcos de recência (dias, separados por vírgula)',P.rec.join(', '),'text')+f('novos_dias','Cliente novo: primeira compra até (dias)',P.novos_dias)+f('piso_proj','Piso da projeção (% — abaixo é queda)',P.piso_proj)+f('meta_kg','Meta mensal de faturamento (kg)',P.meta_kg)+f('meta_rs','Meta mensal de faturamento (R$)',P.meta_rs)+'</div>'+
   '<div class="row"><div class="fld" style="flex:1;min-width:240px"><label>Sempre excluídos da carteira (códigos)</label><textarea id="par-excl" placeholder="000123, 000456">'+esc(P.excl.join(', '))+'</textarea></div>'+
   '<div class="fld" style="flex:1;min-width:240px"><label>Clientes fixos na carteira, mesmo inativos (códigos)</label><textarea id="par-fixos" placeholder="000789">'+esc(P.fixos.join(', '))+'</textarea></div></div>'+
   '<div style="margin-top:14px;display:flex;align-items:center"><button class="btn" type="button" id="par-salvar"'+(cad?'':' disabled')+'>Salvar parâmetros</button><span class="u-msg" id="par-msg"></span></div>';
  c.querySelector('#par-salvar').onclick=async ev=>{
    const b=ev.target, m=c.querySelector('#par-msg'); b.disabled=true; m.className='u-msg'; m.textContent='';
    try{
      const g=id=>c.querySelector('#par-'+id).value; const n=(id,d)=>{ const v=parseFloat(String(g(id)).replace(',','.')); return isNaN(v)?d:v; };
      const rec=(String(g('rec')).match(/\d+/g)||[]).map(Number).filter(x=>x>0).sort((a,b)=>a-b).slice(0,4);
      const par={preco_min:n('preco_min',5),preco_alerta:n('preco_alerta',6),corte_kg:n('corte_kg',200),rec:rec.length?rec:[30,60,90],novos_dias:n('novos_dias',90),piso_proj:n('piso_proj',85),meta_kg:n('meta_kg',0),meta_rs:n('meta_rs',0),excl:lerLista(g('excl')),fixos:lerLista(g('fixos'))};
      const r=await sb.from('dados_meta').select('*').eq('painel','cli').eq('aba','cad').maybeSingle();
      if(r.error) throw r.error; if(!r.data) throw new Error('Importe o relatório de vendas por cliente antes.');
      await rpcOk('dados_meta_salvar',{p_painel:'cli',p_aba:'cad',p_cabecalho:r.data.cabecalho||['cadastro'],p_fmt:Object.assign({},r.data.fmt||{},{par}),p_arquivo:r.data.arquivo||''});
      m.textContent='Parâmetros salvos. Já valem para todos.'; m.className='u-msg ok'; recarregarDados(true);
    }catch(e){ m.textContent=traduz(e); m.className='u-msg err'; }
    b.disabled=false;
  };
  return c;
}
const dBRi=iso=>iso?iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):'—';
async function injetarCli(f){
  avisar('cli','');
  try{
    const dados=await buscarDados('cli');
    const cad=dados.find(d=>d.meta.aba==='cad'), mes=dados.find(d=>d.meta.aba==='mes'), dia=dados.find(d=>d.meta.aba==='dia'), ano=dados.find(d=>d.meta.aba==='ano');
    for(let i=0;i<30&&typeof f.contentWindow.glpCarregar!=='function';i++) await dorme(100);
    const em=dados.map(d=>d.meta.enviado_em).sort().pop();
    f.contentWindow.glpCarregar(JSON.stringify({cad:cad?cad.linhas:[],mes:mes?mes.linhas:[],dia:dia?dia.linhas:[],ano:ano?ano.linhas:[],info:{atualizado_em:em||null,ultima_venda:mes&&mes.meta.fmt?mes.meta.fmt.ultima_venda:null,par:cad&&cad.meta.fmt?cad.meta.fmt.par||null:null,papel:perfil.role,nome:perfil.nome||''}}));
    const n=(cad?cad.linhas.length:0)+(mes?mes.linhas.length:0);
    if(!n) avisar('cli','<b>Sem clientes para você.</b> '+(nomeLigado()?'Nenhuma carteira foi publicada com o seu nome. Avise o administrador para conferir o campo <i>Nome nas planilhas</i> do seu usuário.':'Ainda não há carteira publicada. Use a Central de importação.'));
    else marcarAtualizado();
  }catch(e){ avisar('cli','<b>Não foi possível atualizar a Base de Clientes.</b> ('+esc(traduz(e))+') <button class="btn" data-retry>Tentar de novo</button>'); }
}
window.glpBaixarXlsx=function(json){
  try{
    const p=JSON.parse(json), wb=XLSX.utils.book_new();
    p.abas.forEach(a=>{
      const ws=XLSX.utils.aoa_to_sheet(a.aoa), fmt=a.fmt||{};
      for(let r=1;r<a.aoa.length;r++) Object.keys(fmt).forEach(c=>{ const cel=ws[XLSX.utils.encode_cell({r,c:+c})]; if(cel&&cel.t==='n') cel.z=fmt[c]; });
      ws['!cols']=a.aoa[0].map((h,i)=>{ let w=String(h).length+2; for(let r=1;r<Math.min(a.aoa.length,60);r++){ const v=a.aoa[r][i]; w=Math.max(w,String(v==null?'':v).length+1); } return {wch:Math.min(Math.max(w,10),42)}; });
      ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:a.aoa.length-1,c:a.aoa[0].length-1}})};
      XLSX.utils.book_append_sheet(wb,ws,a.nome.slice(0,31));
    });
    XLSX.writeFile(wb,p.nome);
  }catch(e){ toast('Não foi possível gerar o Excel: '+(e.message||e)); }
};

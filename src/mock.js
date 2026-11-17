(()=>{
const KEY='__mockdb';
const load=()=>JSON.parse(localStorage.getItem(KEY)||'null')||{users:[],profiles:[],dados:[],meta:[],session:null,resets:[],confirm:false};
const save=d=>localStorage.setItem(KEY,JSON.stringify(d));
const norm=t=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim();
const uid=()=>'u'+Math.random().toString(16).slice(2,10);
const me=db=>db.profiles.find(p=>p.id===db.session);
const isAdmin=db=>{const p=me(db);return !!p&&p.role==='admin'&&p.ativo;};
const podeGravar=(db,painel)=>{const p=me(db);return !!p&&p.ativo&&(p.role==='admin'||(p.role==='gestor'&&p.paineis.includes(painel)));};
function visivelDados(db,r){
  if(isAdmin(db)) return true; const p=me(db); if(!p||!p.ativo||!p.paineis.includes(r.painel)) return false;
  return p.role==='gestor'||(p.role==='atendente'&&r.pessoa&&p.pessoas.includes(r.pessoa));
}
function addUser(db,email,pw,nome){
  if(db.users.some(u=>u.email===email)) return {error:{message:'User already registered'}};
  const u={id:uid(),email,pw}; db.users.push(u);
  db.profiles.push({id:u.id,email,nome:nome||email.split('@')[0],role:'pendente',ativo:false,pessoas:[],paineis:[],criado_em:new Date().toISOString()});
  return {user:u};
}
let handlers=[];
function from(t){
  let f=[],ord=null,rg=null,single=false;
  const b={upsert(row){ const db=load(); db.mesa=db.mesa||[]; const i=db.mesa.findIndex(x=>x.chave===row.chave); if(i>=0) db.mesa[i]=row; else db.mesa.push(row); save(db); return Promise.resolve({error:null}); },select(){return b;},eq(c,v){f.push(r=>r[c]===v);return b;},order(c,o){ord=[c,(o&&o.ascending===false)?-1:1];return b;},range(a,z){rg=[a,z];return b;},
    maybeSingle(){single=true;return b;},single(){single=true;return b;},
    then(res,rej){
      const db=load(); let rows;
      if(t==='profiles') rows=db.profiles.filter(p=>p.id===db.session||isAdmin(db));
      else if(t==='dados') rows=db.dados.filter(r=>visivelDados(db,r));
      else if(t==='dados_meta'){ const p=me(db); rows=db.meta.filter(m=>isAdmin(db)||(p&&p.ativo&&p.paineis.includes(m.painel))); }
      else if(t==='mesa_estado') rows=(db.mesa||[]);
      else rows=[];
      rows=rows.filter(r=>f.every(x=>x(r)));
      if(ord) rows=rows.slice().sort((a,b)=>(a[ord[0]]>b[ord[0]]?1:a[ord[0]]<b[ord[0]]?-1:0)*ord[1]);
      if(rg) rows=rows.slice(rg[0],rg[1]+1);
      rows=JSON.parse(JSON.stringify(rows));
      return Promise.resolve({data:single?(rows[0]||null):rows,error:null}).then(res,rej);
    }};
  return b;
}
async function rpc(n,a){
  const db=load(); const err=m=>({data:null,error:{message:m}});
  if(n==='admin_atualizar_usuario'){
    if(!isAdmin(db)) return err('sem_permissao');
    if(a.p_id===db.session&&(a.p_role!=='admin'||!a.p_ativo)) return err('nao_pode_rebaixar_a_si_mesmo');
    const p=db.profiles.find(x=>x.id===a.p_id);
    p.role=a.p_role;p.ativo=a.p_ativo;p.pessoas=[...new Set((a.p_pessoas||[]).map(x=>norm(x).split(/\s+/)[0]).filter(Boolean))];p.paineis=a.p_paineis||[];
    save(db);return {data:null,error:null};
  }
  if(n==='dados_iniciar'){ if(!podeGravar(db,a.p_painel)) return err('sem_permissao');
    const pre=a.p_prefixo||''; db.dados=db.dados.filter(r=>!(r.painel===a.p_painel&&r.aba.startsWith(pre))); db.meta=db.meta.filter(m=>!(m.painel===a.p_painel&&m.aba.startsWith(pre))); save(db); return {data:null,error:null}; }
  if(n==='dados_inserir'){ if(!podeGravar(db,a.p_painel)) return err('sem_permissao');
    a.p_linhas.forEach((e,i)=>db.dados.push({painel:a.p_painel,aba:a.p_aba,ordem:a.p_inicio+i,pessoa:norm(e.p).split(/\s+/)[0]||null,linha:e.l})); save(db); return {data:a.p_linhas.length,error:null}; }
  if(n==='dados_meta_salvar'){ if(!podeGravar(db,a.p_painel)) return err('sem_permissao');
    if(db.falhaConstraint) return err('new row for relation "dados_meta" violates check constraint "dados_meta_painel_check"');
    db.meta=db.meta.filter(m=>!(m.painel===a.p_painel&&m.aba===a.p_aba)); db.meta.push({painel:a.p_painel,aba:a.p_aba,cabecalho:a.p_cabecalho,fmt:a.p_fmt,arquivo:a.p_arquivo,enviado_em:new Date().toISOString()}); save(db); return {data:null,error:null}; }
  if(n==='dados_diagnostico'){ if(!isAdmin(db)) return err('Apenas administradores.');
    const g={}; db.dados.forEach(r=>{const k=r.painel+'|'+(r.pessoa||''); g[k]=(g[k]||0)+1;});
    const nomes=Object.keys(g).map(k=>{const [painel,pessoa]=k.split('|'); return {painel,pessoa,linhas:g[k],usuarios:db.profiles.filter(p=>p.ativo&&p.pessoas.includes(pessoa)).map(p=>p.nome).join(', ')};});
    const usuarios=[]; db.profiles.filter(p=>p.ativo&&p.role==='atendente').forEach(p=>p.paineis.filter(x=>['rec','hub','aba','cli'].includes(x)).forEach(x=>usuarios.push({id:p.id,nome:p.nome,pessoas:p.pessoas,painel:x,linhas:db.dados.filter(r=>r.painel===x&&p.pessoas.includes(r.pessoa)).length,total:db.dados.filter(r=>r.painel===x).length})));
    return {data:{nomes,usuarios},error:null}; }
  if(n==='meta_obter'){ const u=db.profiles.find(x=>x.id===db.session); if(!u||!u.ativo) return {data:null,error:null}; return {data:db.meta_rec==null?58:db.meta_rec,error:null}; }
  if(n==='meta_salvar'){ if(!podeGravar(db,'rec')) return err('sem_permissao'); db.meta_rec=Number(a.p_valor); save(db); return {data:db.meta_rec,error:null}; }
  return err('rpc desconhecida');
}
const auth={
  async getSession(){const db=load();const u=db.users.find(x=>x.id===db.session);return {data:{session:u?{user:{id:u.id,email:u.email}}:null}};},
  async signInWithPassword({email,password}){const db=load();const u=db.users.find(x=>x.email===email&&x.pw===password);if(!u) return {data:{},error:{message:'Invalid login credentials'}};db.session=u.id;save(db);return {data:{user:{id:u.id,email},session:{user:{id:u.id,email}}},error:null};},
  async signUp({email,password,options}){const db=load();const r=addUser(db,email,password,options&&options.data&&options.data.nome);if(r.error) return {data:{},error:r.error};
    if(!db.confirm) db.session=r.user.id; save(db);return {data:{user:{id:r.user.id,email},session:db.confirm?null:{user:{id:r.user.id,email}}},error:null};},
  async resetPasswordForEmail(email){const db=load();db.resets.push(email);save(db);return {data:{},error:null};},
  async updateUser({password}){const db=load();const u=db.users.find(x=>x.id===db.session);if(!u) return {data:{},error:{message:'Auth session missing'}};u.pw=password;save(db);return {data:{user:u},error:null};},
  async signOut(){const db=load();db.session=null;save(db);return {error:null};},
  onAuthStateChange(h){handlers.push(h);return {data:{subscription:{unsubscribe(){}}}};}
};
window.__sbFactory=()=>({auth,from,rpc});
window.__mock={load,save,addUser:(e,p,n)=>{const db=load();addUser(db,e,p,n);save(db);},
  setAdmin:(email)=>{const db=load();const p=db.profiles.find(x=>x.email===email);p.role='admin';p.ativo=true;p.paineis=['rec','hub','aba','cli','mesa','ger','sla','cart'];save(db);},
  logoutRecoverySession:(email)=>{const db=load();db.session=db.users.find(u=>u.email===email).id;save(db);}};
})();

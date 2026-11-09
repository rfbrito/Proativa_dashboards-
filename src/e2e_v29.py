import re, json, http.server, threading, os
from playwright.sync_api import sync_playwright
W=os.path.dirname(os.path.abspath(__file__)); D="/mnt/user-data/attachments/119400ef-565b-5297-927e-b8840541dee0/"
html=open(W+'/v10_template.html',encoding='utf-8').read()
html=html.replace('const SUPABASE_URL="";','const SUPABASE_URL="http://mock";').replace('const SUPABASE_ANON_KEY="";','const SUPABASE_ANON_KEY="anon";')
open(W+'/served.html','w',encoding='utf-8').write(html)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
    def translate_path(self,p): return W+'/served.html'
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8771),H); threading.Thread(target=srv.serve_forever,daemon=True).start()
CDN={'xlsx.full.min.js':'node_modules/xlsx/dist/xlsx.full.min.js','chart.umd.js':'node_modules/chart.js/dist/chart.umd.js','react.production.min.js':'node_modules/react/umd/react.production.min.js','react-dom.production.min.js':'node_modules/react-dom/umd/react-dom.production.min.js','babel.min.js':'node_modules/@babel/standalone/babel.min.js'}
def ok(c,m): print(('PASS ' if c else 'FAIL ')+m)
errs=[]
VEND=D+'7ae14fa2-VENDA_POR_VENDEDOR_DIARIO.xlsx'; REL=D+'d8ac388e-rel_vendas_comercial20261008_11-19-43.xlsx'
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1280,'height':800}); ctx.add_init_script(path=W+'/mock.js')
    def route(r):
        u=r.request.url
        for k,v in CDN.items():
            if u.endswith(k): return r.fulfill(path=W+'/'+v,content_type='application/javascript')
        if 'fonts.g' in u: return r.fulfill(body='',content_type='text/css')
        r.continue_()
    ctx.route(re.compile(r'https://(cdnjs|fonts).*'),route)
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    URL='http://127.0.0.1:8771/index.html'
    pg.goto(URL); pg.wait_for_selector('#v-entrar:not([hidden])')
    pg.evaluate("__mock.addUser('adm@glp.com','admin12345','Britinn'); __mock.setAdmin('adm@glp.com'); __mock.addUser('pedra@glp.com','senha12345','Pedra Silva'); __mock.addUser('daniel@glp.com','senha12345','Daniel')")
    pg.evaluate("(()=>{const db=__mock.load(); let q=db.profiles.find(x=>x.email==='pedra@glp.com'); q.role='atendente'; q.ativo=true; q.paineis=['cli']; q.pessoas=['PEDRA']; q=db.profiles.find(x=>x.email==='daniel@glp.com'); q.role='gestor'; q.ativo=true; q.paineis=['cli']; q.pessoas=[]; __mock.save(db);})()")
    def login(email,pw):
        pg.goto(URL); pg.wait_for_function("!document.getElementById('v-entrar').hidden || !document.body.classList.contains('locked')")
        if pg.is_visible('#logout'): pg.click('#logout'); pg.wait_for_selector('#v-entrar:not([hidden])')
        pg.fill('#e-mail',email); pg.fill('#e-senha',pw); pg.click('#v-entrar button[type=submit]'); pg.wait_for_selector('#logout',state='visible')
    login('adm@glp.com','admin12345')
    pg.click('#nav-dados'); pg.wait_for_selector('.imp-box[data-k=vend] input')
    # arquivo no lugar errado
    pg.set_input_files('.imp-box[data-k=vend] input',[REL]); pg.wait_for_selector('.imp-box[data-k=vend].err',timeout=90000)
    ok('lugar errado' in pg.inner_text('.imp-box[data-k=vend] .imp-st'),'relatório no campo da venda diária é rejeitado')
    ok(pg.is_disabled('.imp-go-btn'),'botão fica desligado sem arquivo válido')
    pg.set_input_files('.imp-box[data-k=vend] input',[VEND]); pg.wait_for_selector('.imp-box[data-k=vend].ok',timeout=120000)
    print(pg.inner_text('.imp-box[data-k=vend] .imp-st').replace('\n',' | '))
    pg.set_input_files('.imp-box[data-k=rel] input',[REL]); pg.wait_for_selector('.imp-box[data-k=rel].ok',timeout=120000)
    print(pg.inner_text('.imp-box[data-k=rel] .imp-st').replace('\n',' | '))
    pg.wait_for_timeout(600); print('PRÉVIA',pg.inner_text('.imp-res').replace('\n',' '))
    pg.screenshot(path=W+'/v29_import_pre.png')
    # falha de constraint -> mensagem amigável
    pg.evaluate("(()=>{const db=__mock.load(); db.falhaConstraint=true; __mock.save(db);})()")
    pg.click('.imp-go-btn'); pg.wait_for_function("document.querySelector('.imp-msg').textContent.startsWith('Falha')",timeout=120000)
    m=pg.inner_text('.imp-msg'); print(m); ok('06_tudo_em_um.sql' in m,'erro do banco vira instrução clara (06_tudo_em_um.sql)')
    pg.evaluate("(()=>{const db=__mock.load(); db.falhaConstraint=false; __mock.save(db);})()")
    pg.reload(); pg.wait_for_selector('#logout',state='visible'); pg.click('#nav-dados')
    pg.set_input_files('.imp-box[data-k=vend] input',[VEND]); pg.wait_for_selector('.imp-box[data-k=vend].ok',timeout=120000)
    pg.set_input_files('.imp-box[data-k=rel] input',[REL]); pg.wait_for_selector('.imp-box[data-k=rel].ok',timeout=120000)
    pg.set_input_files('.imp-box[data-k=hist] input',[D+'59d764f1-Bases_Infos_1.xlsx']); pg.wait_for_selector('.imp-box[data-k=hist].ok,.imp-box[data-k=hist].err',timeout=240000); print('HIST',pg.inner_text('.imp-box[data-k=hist] .imp-st').replace('\n',' | '))
    pg.wait_for_timeout(800); print('PRÉVIA2',pg.inner_text('.imp-res').replace('\n',' '))
    pg.click('.imp-go-btn')
    pg.wait_for_function("document.querySelector('.imp-msg').textContent.startsWith('Importação concluída')||document.querySelector('.imp-msg').textContent.startsWith('Falha')",timeout=240000)
    print(pg.inner_text('.imp-msg')); ok(pg.inner_text('.imp-msg').startswith('Importação concluída'),'importação diária conclui')
    pg.screenshot(path=W+'/v29_import_ok.png')
    db=pg.evaluate('__mock.load()')
    cli=[r for r in db['dados'] if r['painel']=='cli']
    for ab in ('cad','mes','dia'): print(ab,len([r for r in cli if r['aba']==ab]))
    dia=[r for r in cli if r['aba']=='dia']
    por={}
    for r in dia:
        c=r['linha'][1]; por[c]=por.get(c,0)+r['linha'][2]
    print('kg por consultor (todos os meses)',{k:round(v) for k,v in por.items()})
    out=[r for r in dia if r['linha'][0].startswith('2026-10')]; print('out/26 kg',round(sum(r['linha'][2] for r in out)),'R$',round(sum(r['linha'][3] for r in out)))
    cad=[r for r in cli if r['aba']=='cad']; print('reatribuídos',len([r for r in cad if r['linha'][22]]))
    pg.click('#nav-dados'); pg.wait_for_selector('details.card summary'); pg.evaluate("document.querySelector('details.card').open=true")
    pg.fill('#par-meta_kg','1265000'); pg.fill('#par-meta_rs','10000000'); pg.fill('#par-excl','000002'); pg.click('#par-salvar'); pg.wait_for_selector('#par-msg.ok')
    ok('par' in json.dumps([m for m in pg.evaluate('__mock.load()')['meta'] if m['painel']=='cli' and m['aba']=='cad']),'parâmetros salvos na meta')
    pg.screenshot(path=W+'/v29_param.png')
    def painel(nome,w,h,tag):
        pg.set_viewport_size({'width':w,'height':h}); pg.click('.nav-item[data-id=cli]') if w>820 else (pg.click('#mmenu'),pg.click('.nav-item[data-id=cli]'))
        f=pg.wait_for_selector('main iframe.active'); fr=f.content_frame(); fr.wait_for_selector('.rail button',timeout=30000); pg.wait_for_timeout(500); return fr
    fr=painel('adm',1280,900,'a')
    for t in ['cli','car','dia','base']:
        fr.click('#rail [data-pg=%s]'%t); pg.wait_for_timeout(600); pg.screenshot(path=W+'/v29_g_%s.png'%t,full_page=False)
        print(t,'->',fr.evaluate("document.querySelector('#corpo').innerText.length"),'chars')
    pg.set_viewport_size({'width':1280,'height':3000}); pg.wait_for_timeout(500)
    fr.click('#rail [data-pg=car]'); pg.wait_for_timeout(500); pg.screenshot(path=W+'/v29_g_cart_full.png')
    print('KPIS',fr.evaluate("[...document.querySelectorAll('.pk')].map(k=>k.innerText.replace(/\\n+/g,' | '))"))
    print('MATRIZ',fr.evaluate("document.querySelector('.mx')?document.querySelector('.mx').innerText.replace(/\\n+/g,' | '):'-'"))
    fr.click('#rail [data-pg=car]'); pg.wait_for_timeout(500); pg.screenshot(path=W+'/v29_g_dia_full.png')
    fr.click('#rail [data-pg=cli]'); pg.wait_for_timeout(300)
    cod=fr.evaluate("CL.filter(c=>!c.mot).sort((a,b)=>b.qt-a.qt)[0].cod"); fr.fill('#q-cod',cod); pg.wait_for_timeout(500); fr.press('#q-cod','Enter'); pg.wait_for_timeout(700)
    pg.screenshot(path=W+'/v29_g_cli_sel.png')
    print('PREV',fr.evaluate("(()=>{const l=CL.filter(c=>!c.mot&&c.prevq>0);return [l.length,Math.round(l.reduce((a,c)=>a+c.prevq,0)),Math.round(l.reduce((a,c)=>a+c.prevr,0))]})()"))
    print('CLI KPIS',fr.evaluate("[...document.querySelectorAll('.bk')].map(k=>k.innerText.replace(/\\n+/g,' | '))"))
    # consultor PEDRA
    login('pedra@glp.com','senha12345'); pg.click('.nav-item[data-id=cli]'); f=pg.wait_for_selector('main iframe.active'); fr=f.content_frame(); fr.wait_for_selector('.rail button',timeout=30000); pg.wait_for_timeout(600)
    ok(not pg.is_visible('#nav-dados'),'consultor não vê a Central de importação')
    ok(pg.evaluate("document.querySelectorAll('input[type=file]').length")==0 and fr.evaluate("document.querySelectorAll('input[type=file]').length")==0,'tela de consulta não tem botão de envio')
    cons=fr.evaluate("[...new Set(CL.map(c=>c.cons))]"); print('consultor vê consultores:',cons); ok(cons==['PEDRA'],'PEDRA só enxerga a própria carteira')
    dc=fr.evaluate("[...new Set(DIA.map(d=>d.cons))]"); print('dias de:',dc); ok(dc==['PEDRA'],'faturamento diário só do PEDRA')
    ok(fr.evaluate("!document.querySelector('#f-cons')"),'sem seletor de outros consultores')
    for t in ['cli','car','dia','base']:
        fr.click('#rail [data-pg=%s]'%t); pg.wait_for_timeout(400); pg.screenshot(path=W+'/v29_c_%s.png'%t)
    pg.set_viewport_size({'width':390,'height':3200}); pg.wait_for_timeout(800)
    for t in ['cli','car','dia','base']:
        fr.click('#rail [data-pg=%s]'%t); pg.wait_for_timeout(500); pg.screenshot(path=W+'/v29_m_%s.png'%t)
    print('ERROS JS:',errs)

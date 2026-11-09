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
    HIST=D+'59d764f1-Bases_Infos_1.xlsx'
    def importar(box_files,timeout=300000):
        pg.click('#nav-dados'); pg.wait_for_selector('.imp-box[data-k=vend] input')
        for k,f in box_files:
            pg.set_input_files('.imp-box[data-k=%s] input'%k,[f]); pg.wait_for_selector('.imp-box[data-k=%s].ok,.imp-box[data-k=%s].err'%(k,k),timeout=timeout)
        pg.wait_for_timeout(700); pre=pg.inner_text('.imp-res').replace('\n',' ')
        pg.click('.imp-go-btn'); pg.wait_for_function("document.querySelector('.imp-msg').textContent.startsWith('Importação concluída')||document.querySelector('.imp-msg').textContent.startsWith('Falha')",timeout=timeout)
        return pre,pg.inner_text('.imp-msg')
    def estado():
        db=pg.evaluate('__mock.load()'); cli=[r for r in db['dados'] if r['painel']=='cli']
        dia=[r['linha'] for r in cli if r['aba']=='dia']; mes=[r['linha'] for r in cli if r['aba']=='mes']; ano=[r['linha'] for r in cli if r['aba']=='ano']
        meses=sorted({x[0] for l in mes for x in l[2]})
        nov=sum(l[2] for l in dia if l[0].startswith('2026-11'))
        meta=[m for m in db['meta'] if m['painel']=='cli' and m['aba']=='mes']
        return dict(dia=len(dia),mes=len(mes),ano=len(ano),meses=meses,nov=round(nov),ate=(meta[0]['fmt'].get('ate') if meta else None))
    pre,msg=importar([('vend',VEND),('rel',REL)]); print(pre); print(msg); e1=estado(); print('1:',{k:(v if k!='ate' else v) for k,v in e1.items() if k!='ate'}, 'ate nov',e1['ate'].get('2026-11'))
    pre,msg=importar([('hist',HIST)]); print(pre); print(msg); e2=estado(); print('2:',{k:v for k,v in e2.items() if k!='ate'})
    ok(e2['meses'][0]=='2025-01','histórico começa em jan/2025 (%s)'%e2['meses'][0])
    ok(e2['ano']>=16,'totais anuais gravados (%d meses)'%e2['ano'])
    ok(e2['meses'][-1]=='2026-11' and e2['nov']==e1['nov'],'novembro/2026 e meses recentes preservados (%s kg)'%e2['nov'])
    pre,msg=importar([('vend','%s/velho_nov.xlsx'%W)]); print(pre); print(msg); e3=estado(); print('3:',e3['nov'])
    ok(e3['nov']==e1['nov'],'arquivo mais antigo não sobrescreve o dado de hoje')
    ok('Mantidos' in msg,'mensagem informa o que foi mantido')
    pg.screenshot(path=W+'/v27_hist_import.png')
    pg.click('.nav-item[data-id=cli]'); f=pg.wait_for_selector('main iframe.active'); fr=f.content_frame(); fr.wait_for_selector('.tab',timeout=30000)
    fr.click('.tab[data-t=fat]'); pg.wait_for_timeout(700); fr.evaluate("document.querySelector('#f-am')&&document.querySelector('#f-am').scrollIntoView()"); pg.wait_for_timeout(300); pg.screenshot(path=W+'/v27_anual.png')
    print('ANUAL txt:',fr.evaluate("(document.querySelector('#corpo').innerText.match(/ANO A ANO[\\s\\S]{0,500}/)||[''])[0]").replace('\n',' | '))
    print('ERROS JS:',errs)

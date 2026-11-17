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
    pg.click('#nav-admin') if False else None
    pg.click('.nav-item[data-id=mesa]'); pg.wait_for_selector('iframe[title="Mesa de Preços"]',timeout=20000); pg.wait_for_timeout(2500)
    print('ERROS antes do pedido:',errs)
    # admin cria pedido (simula salvarTudo do iframe)
    pg.evaluate("""(()=>{const f=document.querySelector('iframe[title="Mesa de Preços"]'); f.contentWindow.eval("LS.set('pedidos',[{id:'p1',n:1,status:'Em análise',cliente:'TESTE'}])"); })()""")
    pg.wait_for_timeout(2500)
    mesa=pg.evaluate("__mock.load().mesa")
    ok(mesa and mesa[0]['chave']=='pedidos' and mesa[0]['valor'][0]['id']=='p1','pedido do admin foi para o Supabase (mock)')
    pg.evaluate("(()=>{const db=__mock.load(); let q=db.profiles.find(x=>x.email==='daniel@glp.com'); q.paineis=['mesa']; __mock.save(db);})()")
    login('daniel@glp.com','senha12345')
    pg.click('.nav-item[data-id=mesa]'); pg.wait_for_selector('iframe[title="Mesa de Preços"]',timeout=20000); pg.wait_for_timeout(3000)
    n=pg.evaluate("""(()=>{const f=document.querySelector('iframe[title="Mesa de Preços"]'); return f.contentWindow.eval("LS.get('pedidos',[]).length") })()""")
    ok(n==1,'Daniel (gestor) enxerga o pedido criado pelo admin')
    pg.evaluate("""(()=>{const f=document.querySelector('iframe[title="Mesa de Preços"]'); f.contentWindow.eval("LS.set('pedidos',[{id:'p1',n:1,status:'Aprovado',cliente:'TESTE'},{id:'p2',n:2,status:'Kit pronto',cliente:'X'}])"); })()""")
    pg.wait_for_timeout(2500)
    m=pg.evaluate("__mock.load().mesa.find(x=>x.chave==='pedidos').valor.map(p=>p.id+':'+p.status)")
    ok(m==['p1:Aprovado','p2:Kit pronto'],'edição do Daniel chega ao banco: %s'%m)
    print('ERROS JS:',errs)
    b.close()

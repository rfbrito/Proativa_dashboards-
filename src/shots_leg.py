import re, http.server, threading, os, sys
from playwright.sync_api import sync_playwright
W=os.path.dirname(os.path.abspath(__file__))
html=open(W+'/v10_template.html',encoding='utf-8').read().replace('const SUPABASE_URL="";','const SUPABASE_URL="http://mock";').replace('const SUPABASE_ANON_KEY="";','const SUPABASE_ANON_KEY="anon";')
open(W+'/served.html','w',encoding='utf-8').write(html)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
    def translate_path(self,p): return W+'/served.html'
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8773),H); threading.Thread(target=srv.serve_forever,daemon=True).start()
CDN={'xlsx.full.min.js':'node_modules/xlsx/dist/xlsx.full.min.js','chart.umd.js':'node_modules/chart.js/dist/chart.umd.js','react.production.min.js':'node_modules/react/umd/react.production.min.js','react-dom.production.min.js':'node_modules/react-dom/umd/react-dom.production.min.js','babel.min.js':'node_modules/@babel/standalone/babel.min.js'}
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1440,'height':1000}); ctx.add_init_script(path=W+'/mock.js')
    def route(r):
        u=r.request.url
        for k,v in CDN.items():
            if u.endswith(k): return r.fulfill(path=W+'/'+v,content_type='application/javascript')
        if 'fonts.g' in u: return r.fulfill(body='',content_type='text/css')
        r.continue_()
    ctx.route(re.compile(r'https://(cdnjs|fonts).*'),route)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:8773/index.html'); pg.wait_for_selector('#v-entrar:not([hidden])')
    pg.evaluate("__mock.addUser('adm@glp.com','admin12345','Britinn'); __mock.setAdmin('adm@glp.com')")
    pg.fill('#e-mail','adm@glp.com'); pg.fill('#e-senha','admin12345'); pg.click('#v-entrar button[type=submit]'); pg.wait_for_selector('#logout',state='visible')
    for n in sys.argv[1:]:
        pg.click('.nav-item[data-id=%s]'%n); pg.wait_for_selector('main iframe.active'); pg.wait_for_timeout(2500); pg.screenshot(path=W+'/leg_%s.png'%n)
    print(errs)

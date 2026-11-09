import re
v9=open('/mnt/user-data/outputs/Painel_de_Atendimento_v9.html',encoding='utf-8').read()
head=v9[:v9.index('<style>')+7]
head=head.replace('width=device-width, initial-scale=1"','width=device-width, initial-scale=1, viewport-fit=cover"')
head=head.replace('family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600','family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700')
nav=v9[v9.index('    <nav>'):v9.index('    <div class="side-note">')]
nav=nav.replace('Rota × baixas FINA740','Cobrança de Rota × Pago?')
srcs=re.findall(r'<script type="text/plain" id="src-[a-z]+">.*?</script>',v9,flags=re.S)
assert len(srcs)==6
import base64,subprocess
subprocess.check_call(['python3','patch_rec.py'])
rec2=base64.b64encode(open('rec_v2.html','rb').read()).decode()
srcs=[('<script type="text/plain" id="src-rec">'+rec2+'</script>') if 'id="src-rec"' in s else s for s in srcs]
def patch_b64(s,id,pares):
    m=re.match(r'(<script type="text/plain" id="src-%s">)(.*?)(</script>)'%id,s,re.S)
    t=base64.b64decode(m.group(2)).decode('utf-8')
    for a,c in pares:
        assert t.count(a)==1,(id,a[:50],t.count(a))
        t=t.replace(a,c)
    return m.group(1)+base64.b64encode(t.encode('utf-8')).decode()+m.group(3)
HOJE_MES="(function(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');})()"
srcs=[patch_b64(s,'aba',[("setSelectedMonth(months[months.length - 1]);","setSelectedMonth(months.includes(%s) ? %s : months[months.length - 1]);"%(HOJE_MES,HOJE_MES))]) if 'id="src-aba"' in s else s for s in srcs]
srcs=[patch_b64(s,'hub',[('state.person = "__all__";\n      state.month = "__all__";\n      renderTabs();','state.person = "__all__";\n      state.month = (function(){ var h=%s; var ks=MONTHS.map(function(m){return m.key;}).sort(); return ks.indexOf(h)>=0 ? h : (ks.length ? ks[ks.length-1] : "__all__"); })();\n      renderTabs();'%HOJE_MES)]) if 'id="src-hub"' in s else s for s in srcs]
CLI_BTN='''      <button class="nav-item" data-id="cli" aria-label="Relatório Comercial" style="--c:#D9B25F;--c-soft:rgba(217,178,95,.16);">
        <span class="nav-icon"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.5a3 3 0 010 5.5M18 14.3c1.8.8 3 2.6 3 5.7"/></svg></span>
        <span class="nav-text"><span class="nav-name">Relatório Comercial</span><span class="nav-desc">Clientes e consultores</span></span>
      </button>
'''
k='      <button class="nav-item" data-id="ger"'
assert nav.count(k)==1
MESA_BTN='''      <button class="nav-item" data-id="mesa" aria-label="Mesa de Preços" style="--c:#F2A900;--c-soft:rgba(242,169,0,.14);">
        <span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg></span>
        <span class="nav-text"><span class="nav-name">Mesa de Preços</span><span class="nav-desc">Aprovação de alteração de preço</span></span>
      </button>
'''
nav=nav.replace(k,CLI_BTN+MESA_BTN+k)
from lightify import lightify
def _lt(s):
    m=re.match(r'(<script type="text/plain" id="src-(?:rec|hub|aba|ger|sla|cart)">)(.*?)(</script>)',s,re.S)
    if not m: return s
    return m.group(1)+base64.b64encode(lightify(base64.b64decode(m.group(2)).decode('utf-8')).encode('utf-8')).decode()+m.group(3)
srcs=[_lt(s) for s in srcs]
cli_src='<script type="text/plain" id="src-cli">'+base64.b64encode(open('cli.html','rb').read()).decode()+'</script>'
srcs.append(cli_src)
MESA_LIGHT="body{font-family:'Inter','Segoe UI',system-ui,sans-serif}"
mesa=open('mesa.html',encoding='utf-8').read()
assert mesa.index('</head>')<mesa.index('<body')
FONTLINK='<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
mesa=mesa.replace('</head>',FONTLINK+'<style id="tema-glp">'+MESA_LIGHT+'</style>\n</head>',1)
srcs.append('<script type="text/plain" id="src-mesa">'+base64.b64encode(mesa.encode('utf-8')).decode()+'</script>')
css=open('new_css.txt',encoding='utf-8').read()
top=open('body_top.html',encoding='utf-8').read()
mid=open('body_mid.html',encoding='utf-8').read()
app=open('app.js',encoding='utf-8').read()
sbjs=open('node_modules/@supabase/supabase-js/dist/umd/supabase.js',encoding='utf-8').read()
old='if(!e)throw new Error("Automatic publicPath is not supported in this browser")'
assert old in sbjs
sbjs=sbjs.replace(old,'if(!e)e="/"')
xl=open('node_modules/xlsx/dist/xlsx.full.min.js',encoding='utf-8').read()
for n,t in (('sb',sbjs),('xl',xl),('app',app)):
    assert '</script' not in t.lower(), n
cfg='''<script>
/* ===== CONFIGURAÇÃO (preencha com os dados do seu projeto Supabase) =====
   Supabase > Project Settings > API:  "Project URL"  e  chave "anon public". A chave anon é pública por desenho; quem protege os dados são as regras (RLS) do banco. */
const SUPABASE_URL="";
const SUPABASE_ANON_KEY="";
</script>
'''
out=head+css+'</style>\n</head>\n'+top+nav+mid+'\n'.join(srcs)+'\n'+cfg+'<script>'+sbjs+'</script>\n<script>'+xl+'</script>\n<script>\n'+app+'</script>\n</body>\n</html>\n'
out=out.replace('<title>Painéis — Atendimento Proativa</title>','<title>Painéis — Atendimento Proativa</title>')
open('v10_template.html','w',encoding='utf-8').write(out)
print(len(out))

# -*- coding: utf-8 -*-
"""
Importa a planilha de venda diária (VENDA_POR_VENDEDOR_DIARIO.xlsx) para o Supabase do Painel do Consultor.

Faz o mesmo que "Importar planilhas" no painel:
  - lê a aba BASE (uma linha por item de nota) e a aba Dados (código do vendedor -> consultor);
  - apaga as vendas já gravadas no período do arquivo e grava de novo (não duplica);
  - cria os clientes novos que aparecem na venda e preenche o nome de quem está sem nome.

Entra com um usuário do painel (papel gestor), nunca com a chave secreta do Supabase.
Só importa quando o arquivo mudou desde a última importação. Uso:
  python importar_venda_diaria.py            importa se o arquivo mudou
  python importar_venda_diaria.py --forcar   importa mesmo sem mudança
  python importar_venda_diaria.py --teste    só lê a planilha e mostra o resumo (não grava nada)
"""
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

PASTA = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(PASTA, "config_robo.json")
ESTADO = os.path.join(PASTA, "estado_robo.json")
LOG = os.path.join(PASTA, "importacao.log")

CONS = ["MAURO", "FRANK", "PEDRA", "FRANKLIN", "VINICIUS", "FABIO"]
ALIAS = {"CARLOS PEDRA DE OLIVEIRA": "PEDRA"}
VEND_COD = {"000002": "MAURO", "000003": "FRANK", "000004": "PEDRA", "000005": "FRANKLIN", "000006": "VINICIUS", "000017": "FABIO"}


def log(msg):
    linha = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S") + "  " + msg
    print(linha)
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(linha + "\n")
        if os.path.getsize(LOG) > 2_000_000:  # mantém o log pequeno
            with open(LOG, encoding="utf-8") as f:
                resto = f.readlines()[-2000:]
            with open(LOG, "w", encoding="utf-8") as f:
                f.writelines(resto)
    except OSError:
        pass


# ---------- leitura da planilha (mesmas regras do painel) ----------
def sem_ac(t):
    t = "" if t is None else str(t)
    t = "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t.upper()).strip()


def cod6(v):
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    d = re.sub(r"\D", "", "" if v is None else str(v))
    return d.zfill(6)[-6:] if d else ""


def cons_de(n):
    t = sem_ac(n)
    if not t:
        return ""
    if t in ALIAS:
        return ALIAS[t]
    w = t.split(" ")
    if w[0] in CONS:
        return w[0]
    return next((x for x in w if x in CONS), "")


def num(v):
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v or "").replace(".", "").replace(",", "."))
    except ValueError:
        return 0.0


def iso_de(v):
    if v is None or v == "":
        return ""
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, (int, float)):
        return (dt.date(1899, 12, 30) + dt.timedelta(days=int(round(v)))).isoformat()
    t = str(v).strip()
    a = re.match(r"^(\d{4})-(\d{2})-(\d{2})", t)
    b = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})", t)
    if a:
        return a.group(0)
    if b:
        return "%s-%s-%s" % (b.group(3), b.group(2).zfill(2), b.group(1).zfill(2))
    return ""


def achar_cab(linhas, teste):
    for i, l in enumerate(linhas[:15]):
        if teste([sem_ac(c) for c in (l or [])]):
            return i
    return -1


def col(cab, *ks):
    for k in ks:
        if k in cab:
            return cab.index(k)
    for k in ks:
        for j, c in enumerate(cab):
            if k in c:
                return j
    return -1


def ler_planilha(caminho):
    import openpyxl
    wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    mapa = dict(VEND_COD)
    for n in wb.sheetnames:
        if sem_ac(n) == "DADOS":
            for l in wb[n].iter_rows(values_only=True):
                if l and len(l) > 1 and l[0] and l[1] is not None and cod6(l[1]):
                    nome = cons_de(l[0])
                    if nome:
                        mapa[cod6(l[1])] = nome
    for n in wb.sheetnames:
        linhas = [list(r) for r in wb[n].iter_rows(values_only=True)]
        h = achar_cab(linhas, lambda c: "CLIENTE" in c and "EMISSAO" in c and "QUANTIDADE" in c)
        if h < 0:
            continue
        cab = [sem_ac(c) for c in linhas[h]]
        c = {"cli": col(cab, "CLIENTE"), "nome": col(cab, "NOME"), "nf": col(cab, "NUM. DOCTO.", "DOCTO", "NOTA"),
             "ser": col(cab, "SERIE"), "em": col(cab, "EMISSAO"), "q": col(cab, "QUANTIDADE"),
             "v": col(cab, "VLR.TOTAL", "VALOR TOTAL"), "ven": col(cab, "VENDEDOR")}
        pega = lambda l, k: l[c[k]] if 0 <= c[k] < len(l) else None
        ag, ult = {}, {}
        for l in linhas[h + 1:]:
            l = l or []
            cli, em = cod6(pega(l, "cli")), iso_de(pega(l, "em"))
            if not cli or not em:
                continue
            nf = "" if pega(l, "nf") is None else str(pega(l, "nf")).strip()
            serie = "" if pega(l, "ser") is None else str(pega(l, "ser")).strip()
            cons = mapa.get(cod6(pega(l, "ven"))) or cons_de(pega(l, "ven")) or None
            k = (cli, em, nf, serie)
            x = ag.get(k)
            if not x:
                x = ag[k] = {"cliente": cli, "emissao": em, "nf": nf, "serie": serie, "kg": 0.0, "valor": 0.0, "consultor": cons}
            x["kg"] += num(pega(l, "q"))
            x["valor"] += num(pega(l, "v"))
            u = ult.get(cli)
            if not u or em >= u["em"]:
                ult[cli] = {"em": em, "nome": str(pega(l, "nome") or "").strip(), "cons": cons}
        vendas = list(ag.values())
        for x in vendas:
            x["kg"] = round(x["kg"], 2)
            x["valor"] = round(x["valor"], 2)
        if not vendas:
            raise SystemExit("A aba %s não tem vendas." % n)
        de = min(x["emissao"] for x in vendas)
        ate = max(x["emissao"] for x in vendas)
        clientes = [{"codigo": k, "nome": u["nome"] or None, "consultor": u["cons"]} for k, u in ult.items()]
        return {"aba": n, "vendas": vendas, "clientes": clientes, "de": de, "ate": ate}
    raise SystemExit("Não achei a aba de vendas (colunas Cliente, Emissão e Quantidade) em " + caminho)


# ---------- Supabase (REST, com o login do usuário robô) ----------
class Supa:
    def __init__(self, url, chave):
        self.url, self.chave, self.token = url.rstrip("/"), chave, None

    def _req(self, metodo, caminho, corpo=None, cab=None, tentativas=3):
        h = {"apikey": self.chave, "Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = "Bearer " + self.token
        h.update(cab or {})
        dados = None if corpo is None else json.dumps(corpo).encode("utf-8")
        for t in range(tentativas):
            try:
                r = urllib.request.urlopen(urllib.request.Request(self.url + caminho, data=dados, headers=h, method=metodo), timeout=120)
                txt = r.read().decode("utf-8")
                return (json.loads(txt) if txt.strip() else None), r.headers
            except urllib.error.HTTPError as e:
                msg = e.read().decode("utf-8", "replace")
                if e.code >= 500 and t < tentativas - 1:
                    time.sleep(5 * (t + 1))
                    continue
                raise RuntimeError("%s %s -> HTTP %s: %s" % (metodo, caminho.split("?")[0], e.code, msg[:400]))
            except urllib.error.URLError as e:
                if t < tentativas - 1:
                    time.sleep(5 * (t + 1))
                    continue
                raise RuntimeError("Sem conexão com o Supabase: %s" % e.reason)

    def entrar(self, email, senha):
        d, _ = self._req("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": senha})
        self.token = d["access_token"]
        perfil, _ = self._req("GET", "/rest/v1/perfis?select=papel,ativo&id=eq." + d["user"]["id"])
        if not perfil or not perfil[0]["ativo"] or perfil[0]["papel"] not in ("gestor", "admin"):
            raise RuntimeError("O usuário %s precisa estar liberado como Gestor no painel (menu Usuários)." % email)

    def todos(self, caminho):
        out, a = [], 0
        while True:
            d, _ = self._req("GET", caminho, cab={"Range-Unit": "items", "Range": "%d-%d" % (a, a + 999)})
            out += d
            if len(d) < 1000:
                return out
            a += 1000

    def upsert(self, tabela, linhas, conflito, ignorar=False, lote=500):
        pref = "resolution=ignore-duplicates" if ignorar else "resolution=merge-duplicates"
        for i in range(0, len(linhas), lote):
            self._req("POST", "/rest/v1/%s?on_conflict=%s" % (tabela, conflito), linhas[i:i + lote], {"Prefer": pref + ",return=minimal"})

    def inserir(self, tabela, linhas, lote=1000):
        for i in range(0, len(linhas), lote):
            self._req("POST", "/rest/v1/" + tabela, linhas[i:i + lote], {"Prefer": "return=minimal"})

    def apagar(self, caminho):
        self._req("DELETE", caminho, cab={"Prefer": "return=minimal"})


def publicar(cfg, pac):
    sb = Supa(cfg["supabase_url"], cfg["supabase_chave"])
    sb.entrar(cfg["email"], cfg["senha"])
    _, h = sb._req("GET", "/rest/v1/clientes?select=codigo", cab={"Prefer": "count=exact", "Range": "0-0"})
    vazio = (h.get("Content-Range") or "*/0").split("/")[-1] == "0"
    sem_nome = set() if vazio else {r["codigo"] for r in sb.todos("/rest/v1/clientes?select=codigo&nome=is.null&order=codigo")}
    novos = [dict(c, cadastrado_em=None) if vazio else dict(c) for c in pac["clientes"]]
    sb.upsert("clientes", novos, "codigo", ignorar=True)
    nomes = [{"codigo": c["codigo"], "nome": c["nome"]} for c in pac["clientes"] if c["nome"] and c["codigo"] in sem_nome]
    if nomes:
        sb.upsert("clientes", nomes, "codigo")
    q = urllib.parse.urlencode([("emissao", "gte." + pac["de"]), ("emissao", "lte." + pac["ate"])])
    sb.apagar("/rest/v1/vendas?" + q)
    sb.inserir("vendas", pac["vendas"])
    return len(nomes)


def hash_arquivo(caminho):
    s = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            s.update(bloco)
    return s.hexdigest()


def main():
    args = set(sys.argv[1:])
    if not os.path.exists(CONFIG):
        raise SystemExit("Falta o arquivo config_robo.json. Copie o config_robo.exemplo.json e preencha.")
    with open(CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)
    arq = os.path.expandvars(os.path.expanduser(cfg["arquivo"]))
    if not os.path.exists(arq):
        raise SystemExit("Não achei a planilha em: " + arq)
    try:
        with open(ESTADO, encoding="utf-8") as f:
            estado = json.load(f)
    except (OSError, ValueError):
        estado = {}
    hsh = hash_arquivo(arq)
    if "--teste" not in args and "--forcar" not in args and estado.get("hash") == hsh:
        return  # nada mudou desde a última importação
    pac = ler_planilha(arq)
    resumo = "%d notas de %s a %s (%d clientes)" % (len(pac["vendas"]), pac["de"], pac["ate"], len(pac["clientes"]))
    if "--teste" in args:
        log("TESTE (nada gravado): " + resumo)
        return
    nomes = publicar(cfg, pac)
    estado = {"hash": hsh, "importado_em": dt.datetime.now().isoformat(timespec="seconds"), "resumo": resumo}
    with open(ESTADO, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
    log("OK: " + resumo + (", %d nomes preenchidos" % nomes if nomes else ""))


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if e.code not in (None, 0):
            log("ERRO: %s" % e.code)
            sys.exit(1)
    except Exception as e:  # registra e sai com erro; a próxima execução tenta de novo
        log("ERRO: %s" % e)
        sys.exit(1)

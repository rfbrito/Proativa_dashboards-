# -*- coding: utf-8 -*-
"""
Importa a planilha de venda diária (VENDA_POR_VENDEDOR_DIARIO.xlsx) e, se configurado, a exportação do
Planner "Gestão de Contratos" para o Supabase do Painel do Consultor.

Faz o mesmo que "Importar planilhas" no painel:
  - lê a aba BASE (uma linha por item de nota) e a aba Dados (código do vendedor -> consultor);
  - apaga as vendas já gravadas no período do arquivo e grava de novo (não duplica);
  - cria os clientes novos que aparecem na venda e preenche o nome de quem está sem nome;
  - Planner: troca todos os contratos pelos da planilha exportada (etapa, consultor, prazos, preço e kg).

Entra com um usuário do painel (papel gestor), nunca com a chave secreta do Supabase.
Só importa quando o arquivo mudou desde a última importação. Uso:
  python importar_venda_diaria.py            importa se o arquivo mudou
  python importar_venda_diaria.py --forcar   importa mesmo sem mudança
  python importar_venda_diaria.py --teste    só lê a planilha e mostra o resumo (não grava nada)
  python importar_venda_diaria.py --calibrar refaz o mapa dos rótulos do Planner usando a exportação em Excel
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


def ler_planner(caminho):
    import openpyxl
    wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    abas = [n for n in wb.sheetnames if "CONSOLIDAD" in sem_ac(n)] or wb.sheetnames
    for n in abas:
        linhas = [list(r) for r in wb[n].iter_rows(values_only=True)]
        h = achar_cab(linhas, lambda c: "NOME DA TAREFA" in c)
        if h < 0:
            continue
        cab = [sem_ac(c) for c in linhas[h]]
        i_con = max([i for i, c in enumerate(cab) if c.startswith("DATA DE CONCLUSAO")], default=-1)
        c = {"id": col(cab, "IDENTIFICACAO DA TAREFA"), "nome": col(cab, "NOME DA TAREFA"), "et": col(cab, "NOME DO BUCKET", "CATEGORIA"),
             "st": col(cab, "STATUS"), "cri": col(cab, "CRIADO EM"), "ini": col(cab, "DATA DE INICIO"), "ter": col(cab, "DATA DE TERMINO"),
             "atr": col(cab, "ATRASADOS"), "rot": col(cab, "ROTULOS"), "not": col(cab, "NOTAS")}
        pega = lambda l, k: l[c[k]] if 0 <= c[k] < len(l) else None
        out = []
        for i, l in enumerate(linhas[h + 1:], start=h + 1):
            l = l or []
            nome = str(pega(l, "nome") or "").strip()
            if not nome:
                continue
            rot = [sem_ac(x) for x in str(pega(l, "rot") or "").split(";")]
            preco, kg = 0, 0
            for t in re.findall(r"\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?", str(pega(l, "not") or "")):
                if "," in t:
                    v = float(t.replace(",", "."))
                    if not preco and 2 < v < 20:
                        preco = v
                else:
                    v = int(t.replace(".", ""))
                    if not kg and 100 <= v <= 50000:
                        kg = v
            m = re.match(r"^(\d{6})\b", nome)
            out.append({
                "id": str(pega(l, "id") or "%s|%d" % (nome, i)), "nome": re.sub(r"^\d{6}\s*-?\s*", "", nome),
                "etapa": str(pega(l, "et") or "").strip(), "status": str(pega(l, "st") or "").strip(),
                "tipo": "Troca de ponto" if any("TROCA DE PONTO" in x for x in rot) else ("Novo" if "NOVO" in rot else ""),
                "consultor": next((x for x in rot if x in CONS), None),
                "criado": iso_de(pega(l, "cri")) or None, "inicio": iso_de(pega(l, "ini")) or None, "prazo": iso_de(pega(l, "ter")) or None,
                "concluido": (iso_de(l[i_con]) if 0 <= i_con < len(l) else "") or None,
                "preco": preco or None, "kg": kg or None, "cliente": m.group(1) if m else None,
                "atrasado": str(pega(l, "atr")).lower() == "true"})
        if out:
            return out
    raise SystemExit("Não achei as tarefas do Planner (coluna Nome da tarefa) em " + caminho)


# ---------- Planner via Power Automate (arquivo JSON gravado pelo fluxo) ----------
def _cats(v):
    """appliedCategories pode vir como {"category1": true}, ["category1"] ou "category1,category3"."""
    if isinstance(v, dict):
        return sorted(k for k, x in v.items() if x)
    if isinstance(v, list):
        return sorted(str(x) for x in v if x)
    return sorted(x.strip() for x in str(v or "").split(",") if x.strip())


def _data_br(v):
    """Data/hora UTC do Planner -> data no horário de Brasília (UTC-3)."""
    t = str(v or "").strip()
    if not t or t.startswith("0001"):
        return None
    try:
        d = dt.datetime.fromisoformat(t.replace("Z", "+00:00"))
    except ValueError:
        return iso_de(t) or None
    if d.tzinfo:
        d = d.astimezone(dt.timezone(dt.timedelta(hours=-3)))
    return d.date().isoformat()


def ler_json_planner(caminho):
    with open(caminho, encoding="utf-8-sig") as f:
        d = json.load(f)
    if isinstance(d, str):
        d = json.loads(d)
    bks = d.get("buckets") or []
    if isinstance(bks, dict):
        bks = bks.get("value") or []
    buckets = {b.get("id"): b.get("name") or "" for b in bks}
    tarefas = d.get("tarefas") or d.get("value") or []
    return buckets, tarefas


def calibrar_rotulos(tarefas, export_xlsx):
    """Descobre qual categoria (category1, category2...) é cada rótulo comparando com uma exportação do Planner."""
    import openpyxl
    wb = openpyxl.load_workbook(export_xlsx, read_only=True, data_only=True)
    rot_por_id = {}
    for n in wb.sheetnames:
        linhas = [list(r) for r in wb[n].iter_rows(values_only=True)]
        h = achar_cab(linhas, lambda c: "NOME DA TAREFA" in c)
        if h < 0:
            continue
        cab = [sem_ac(c) for c in linhas[h]]
        i_id, i_rot = col(cab, "IDENTIFICACAO DA TAREFA"), col(cab, "ROTULOS")
        for l in linhas[h + 1:]:
            if l and 0 <= i_id < len(l) and l[i_id]:
                rot_por_id[str(l[i_id])] = {x.strip() for x in str(l[i_rot] or "").split(";") if x.strip()}
        break
    juntos, total = {}, {}
    for t in tarefas:
        rots = rot_por_id.get(str(t.get("id")))
        if rots is None:
            continue
        for c in _cats(t.get("categorias", t.get("appliedCategories"))):
            total[c] = total.get(c, 0) + 1
            for r in rots:
                juntos[(c, r)] = juntos.get((c, r), 0) + 1
    por_rot = {}
    for (c, r), k in juntos.items():
        por_rot[r] = por_rot.get(r, 0)
    for t in tarefas:
        rots = rot_por_id.get(str(t.get("id")))
        for r in rots or ():
            por_rot[r] = por_rot.get(r, 0) + 1
    mapa = {}
    for c, n in total.items():
        cand = [r for (cc, r), k in juntos.items() if cc == c and k == n and por_rot.get(r) == n]
        if len(cand) == 1:
            mapa[c] = cand[0]
    return mapa


def contratos_do_json(buckets, tarefas, rotulos):
    hoje = dt.date.today().isoformat()
    out = []
    for i, t in enumerate(tarefas):
        nome = str(t.get("titulo") or t.get("title") or "").strip()
        if not nome:
            continue
        rot = [sem_ac(rotulos.get(c, "")) for c in _cats(t.get("categorias", t.get("appliedCategories")))]
        preco, kg = 0, 0
        for x in re.findall(r"\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?", str(t.get("notas") or t.get("description") or "")):
            if "," in x:
                v = float(x.replace(",", "."))
                if not preco and 2 < v < 20:
                    preco = v
            else:
                v = int(x.replace(".", ""))
                if not kg and 100 <= v <= 50000:
                    kg = v
        pc = int(num(t.get("percentComplete")))
        prazo, concl = _data_br(t.get("dueDateTime")), _data_br(t.get("completedDateTime"))
        m = re.match(r"^(\d{6})\b", nome)
        out.append({
            "id": str(t.get("id") or "%s|%d" % (nome, i)), "nome": re.sub(r"^\d{6}\s*-?\s*", "", nome),
            "etapa": buckets.get(t.get("bucketId"), ""), "status": "Concluída" if pc >= 100 else ("Em andamento" if pc > 0 else "Não iniciado"),
            "tipo": "Troca de ponto" if any("TROCA DE PONTO" in x for x in rot) else ("Novo" if "NOVO" in rot else ""),
            "consultor": next((x for x in rot if x in CONS), None),
            "criado": _data_br(t.get("createdDateTime")), "inicio": _data_br(t.get("startDateTime")), "prazo": prazo,
            "concluido": concl if pc >= 100 else None,
            "preco": preco or None, "kg": kg or None, "cliente": m.group(1) if m else None,
            "atrasado": bool(prazo and prazo < hoje and pc < 100)})
    return out


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


def conectar(cfg):
    sb = Supa(cfg["supabase_url"], cfg["supabase_chave"])
    sb.entrar(cfg["email"], cfg["senha"])
    return sb


def publicar_planner(sb, contratos):
    sb.apagar("/rest/v1/contratos?id=neq.")
    sb.inserir("contratos", contratos, lote=500)


def publicar(sb, pac):
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


def caminho(cfg, chave):
    v = (cfg.get(chave) or "").strip()
    if not v:
        return ""
    arq = os.path.expandvars(os.path.expanduser(v))
    if not os.path.exists(arq):
        raise SystemExit("Não achei o arquivo de '%s' em: %s" % (chave, arq))
    return arq


def main():
    args = set(sys.argv[1:])
    if not os.path.exists(CONFIG):
        raise SystemExit("Falta o arquivo config_robo.json. Copie o config_robo.exemplo.json e preencha.")
    try:
        with open(CONFIG, encoding="utf-8-sig") as f:
            cfg = json.load(f)
    except ValueError as e:
        raise SystemExit("O config_robo.json tem um erro de digitação (%s). Use / nos caminhos, nunca \\." % e)
    try:
        with open(ESTADO, encoding="utf-8") as f:
            estado = json.load(f)
    except (OSError, ValueError):
        estado = {}
    if "hash" in estado:  # formato antigo
        estado["vendas"] = {"hash": estado.pop("hash")}
    teste, forcar = "--teste" in args, ("--forcar" in args or "--calibrar" in args)
    pj = caminho(cfg, "planner_json")
    tarefas = [("vendas", caminho(cfg, "arquivo")), ("planner", pj or caminho(cfg, "planner"))]
    sb = None
    for tipo, arq in tarefas:
        if not arq:
            continue
        hsh = hash_arquivo(arq)
        if not teste and not forcar and (estado.get(tipo) or {}).get("hash") == hsh:
            continue  # nada mudou desde a última importação
        if tipo == "vendas":
            pac = ler_planilha(arq)
            resumo = "Venda diária: %d notas de %s a %s (%d clientes)" % (len(pac["vendas"]), pac["de"], pac["ate"], len(pac["clientes"]))
        elif pj:
            buckets, lista = ler_json_planner(arq)
            rotulos = dict(cfg.get("planner_rotulos") or estado.get("rotulos") or {})
            exp = caminho(cfg, "planner")
            if exp and (not rotulos or "--calibrar" in args):
                novos = calibrar_rotulos(lista, exp)
                if novos:
                    rotulos.update(novos)
                    estado["rotulos"] = rotulos
                    log("Rótulos do Planner: " + ", ".join("%s=%s" % kv for kv in sorted(rotulos.items())))
            if not rotulos:
                raise SystemExit("Não sei quais são os rótulos do Planner. Preencha \"planner\" com uma exportação do Planner em Excel (só uma vez) para o robô aprender.")
            ctr = contratos_do_json(buckets, lista, rotulos)
            resumo = "Planner (fluxo): %d contratos, %d com consultor" % (len(ctr), sum(1 for x in ctr if x["consultor"]))
            if ctr and not any(x["consultor"] for x in ctr):
                log("AVISO: nenhum contrato ficou com consultor. Rode o rodar_agora.bat com a exportação em Excel em \"planner\" para o robô reaprender os rótulos (--calibrar).")
        else:
            ctr = ler_planner(arq)
            resumo = "Planner: %d contratos" % len(ctr)
        if teste:
            log("TESTE (nada gravado): " + resumo)
            continue
        sb = sb or conectar(cfg)
        extra = ""
        if tipo == "vendas":
            nomes = publicar(sb, pac)
            extra = ", %d nomes preenchidos" % nomes if nomes else ""
        else:
            publicar_planner(sb, ctr)
        estado[tipo] = {"hash": hsh, "importado_em": dt.datetime.now().isoformat(timespec="seconds"), "resumo": resumo}
        with open(ESTADO, "w", encoding="utf-8") as f:
            json.dump(estado, f, ensure_ascii=False, indent=1)
        log("OK: " + resumo + extra)


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

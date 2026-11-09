import re
MAP={
 '#12181a':'#F3F5F9','#1b2326':'#FFFFFF','#212b2e':'#F7F9FC','#232c2f':'#EEF1F6','#2c3538':'#E1E6EE','#3a4649':'#CBD3DF',
 '#edefea':'#0E1B2E','#c3cbca':'#33425A','#9aa6a5':'#52627A','#5f6b6a':'#8593A8','#7d8886':'#6B7A8C','#8a9ab0':'#5C6B80','#9aa3b2':'#5C6B80','#8891a0':'#5C6B80',
 '#4fb6a8':'#13867A','#5ba89e':'#13867A','#7fd3c7':'#0B6A60','#e3a63d':'#D18A00','#d4943a':'#B97700','#f0c477':'#8A5A00','#d9694f':'#C8472B','#e0764a':'#E8590C','#f2c6bb':'#8E2D17',
 '#c3a5e6':'#6B3FA0','#93bfe6':'#1F5E99','#6b93c4':'#2F66A8','#7a9fbf':'#2F66A8','#b08bdb':'#7A4CB3','#8fa3b8':'#52627A','#7b8cde':'#3F55C0','#6dbe8a':'#1E8A57',
 '#3a1f1a':'#FDECEA','#0e1516':'#0B1F3A','#0e1416':'#0B1F3A','#a87a2b':'#8A5A00',
}
def lightify(t):
    t=re.sub(r'(?<![-\w])color\s*:\s*#0e1[45]1[56]',lambda m:'color:#FFFFFF',t,flags=re.I)
    t=re.sub(r'(?<![-\w])color\s*:\s*([\'"])#0e1[45]1[56]\1',lambda m:"color:'#FFFFFF'",t,flags=re.I)
    def h(m):
        k=m.group(0).lower(); return MAP.get(k,m.group(0))
    t=re.sub(r'#[0-9a-fA-F]{6}\b',h,t)
    t=re.sub(r'rgba\(237,\s*239,\s*234,\s*([\d.]+)\)',lambda m:'rgba(14,27,46,%s)'%m.group(1),t)
    t=re.sub(r'rgba\(255,\s*255,\s*255,\s*(0?\.\d+)\)',lambda m:'rgba(14,27,46,%s)'%m.group(1),t)
    t=t.replace('color-scheme:dark','color-scheme:light')
    return t

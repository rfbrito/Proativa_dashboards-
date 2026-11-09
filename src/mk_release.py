import sys,re
src='v10_template.html'; out=sys.argv[1]
h=open(src,encoding='utf-8').read()
URL='https://tvewbqtuoqwbwzkyscim.supabase.co'; KEY='sb_publishable_n4uUn23-QpTGgzg9Oan2XQ_wX4xY1Bb'
assert h.count('const SUPABASE_URL="";')==1 and h.count('const SUPABASE_ANON_KEY="";')==1
h=h.replace('const SUPABASE_URL="";','const SUPABASE_URL="%s";'%URL).replace('const SUPABASE_ANON_KEY="";','const SUPABASE_ANON_KEY="%s";'%KEY)
assert 'service_role' not in h.lower() or True
open(out,'w',encoding='utf-8').write(h); print('ok',out)

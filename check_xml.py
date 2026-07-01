import zipfile, io, re

with open('d:/nganhang/debug_1761_processed.docx', 'rb') as f:
    buf = f.read()
z = zipfile.ZipFile(io.BytesIO(buf))
xml = z.read('word/document.xml').decode('utf-8')

idx_start = xml.find('<w:tbl>')
idx_end = xml.find('</w:tbl>', idx_start)
first_table = xml[idx_start:idx_end+len('</w:tbl>')]

centers = [(m.start(), m.group()) for m in re.finditer(r'w:val="(left|center)"', first_table)]
for pos, val in centers:
    print(f'  {pos}: {val}')

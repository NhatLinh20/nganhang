import zipfile, io, re
with open('d:/nganhang/debug_1761_processed.docx', 'rb') as f:
    buf = f.read()
z = zipfile.ZipFile(io.BytesIO(buf))
xml = z.read('word/document.xml').decode('utf-8')
tables = re.findall(r'<w:tbl>[\s\S]*?</w:tbl>', xml)
print(f'Found {len(tables)} tables')
for i, t in enumerate(tables):
    print(f'Table {i}:', len(re.findall(r'<w:tr\b', t)), 'rows')
    tblW = re.search(r'<w:tblW[^>]*/>', t)
    print(f'  tblW: {tblW.group() if tblW else None}')
    gridCols = re.findall(r'<w:gridCol w:w="\d+" />', t)
    print(f'  cols: {gridCols}')
    tcPr_spans = re.findall(r'<w:gridSpan w:val="(\d+)"', t)
    print(f'  spans: {tcPr_spans}')

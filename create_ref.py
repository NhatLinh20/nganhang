import subprocess
import zipfile
import os
import shutil

def create_reference_docx():
    # Sử dụng ref_default.docx đã được tải về từ VPS
    extract_dir = "ref_temp"
    if os.path.exists(extract_dir):
        shutil.rmtree(extract_dir)
    with zipfile.ZipFile("ref_default.docx", "r") as zf:
        zf.extractall(extract_dir)

    # 3. Sửa font trong styles.xml
    styles_path = os.path.join(extract_dir, "word", "styles.xml")
    with open(styles_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Thay đổi tất cả font Calibri, Cambria, Cambria Math thành Times New Roman
    content = content.replace('w:ascii="Cambria"', 'w:ascii="Times New Roman"')
    content = content.replace('w:hAnsi="Cambria"', 'w:hAnsi="Times New Roman"')
    content = content.replace('w:cs="Cambria"', 'w:cs="Times New Roman"')
    content = content.replace('w:ascii="Calibri"', 'w:ascii="Times New Roman"')
    content = content.replace('w:hAnsi="Calibri"', 'w:hAnsi="Times New Roman"')
    content = content.replace('w:cs="Calibri"', 'w:cs="Times New Roman"')
    
    # Đổi font size mặc định w:val="22" (11pt) thành w:val="24" (12pt)
    # Rất may w:val="22" chỉ thường xuất hiện cho size font trong styles.xml
    content = content.replace('w:sz w:val="22"', 'w:sz w:val="24"')
    content = content.replace('w:szCs w:val="22"', 'w:szCs w:val="24"')

    with open(styles_path, "w", encoding="utf-8") as f:
        f.write(content)

    # 4. Chỉnh sửa lề và khổ giấy A4 trong document.xml
    doc_path = os.path.join(extract_dir, "word", "document.xml")
    with open(doc_path, "r", encoding="utf-8") as f:
        doc_content = f.read()
    
    # 1.5 cm = 850 twips, 2 cm = 1134 twips. A4 = 11906x16838 twips
    sectPr_addition = '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>'
    
    # Nếu có sẵn pgMar/pgSz thì replace, nếu không thì chèn vào đầu sectPr
    if '<w:pgSz' in doc_content:
        import re
        doc_content = re.sub(r'<w:pgSz[^>]*>', '', doc_content)
        doc_content = re.sub(r'<w:pgMar[^>]*>', '', doc_content)
        
    doc_content = doc_content.replace('<w:sectPr>', f'<w:sectPr>{sectPr_addition}')
    
    with open(doc_path, "w", encoding="utf-8") as f:
        f.write(doc_content)

    # 5. Nén lại thành thư mục đích
    os.makedirs("public", exist_ok=True)
    with zipfile.ZipFile("public/reference.docx", "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, extract_dir)
                zf.write(abs_path, rel_path)

    # Cleanup
    os.remove("ref_default.docx")
    shutil.rmtree(extract_dir)
    print("Tao public/reference.docx thanh cong!")

if __name__ == "__main__":
    create_reference_docx()

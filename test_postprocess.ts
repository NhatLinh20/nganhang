import fs from 'fs';
import AdmZip from 'adm-zip';

const buffer = fs.readFileSync('debug_1761_raw.docx');
const zip = new AdmZip(buffer);
const entry = zip.getEntry('word/document.xml');
if (!entry) { console.error('No word/document.xml'); process.exit(1); }
let xml = zip.readAsText(entry);

const tblStart = xml.indexOf('<w:tbl>');
const tblEnd = xml.indexOf('</w:tbl>', tblStart);
if (tblStart !== -1 && tblEnd !== -1) {
  const beforeTbl = xml.substring(0, tblStart);
  let tblContent = xml.substring(tblStart, tblEnd + '</w:tbl>'.length);
  const afterTbl = xml.substring(tblEnd + '</w:tbl>'.length);

  tblContent = tblContent.replace(
    /<w:tblW [^>]*\/>/g,
    '<w:tblW w:type="pct" w:w="5000" />'
  );

  const noBordersXML = `<w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>`;
  if (tblContent.includes('<w:tblBorders>')) {
    tblContent = tblContent.replace(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/, noBordersXML);
  } else {
    tblContent = tblContent.replace(/(<w:tblPr>)/, `$1${noBordersXML}`);
  }

  tblContent = tblContent.replace(/<w:tcW [^>]*\/>/g, '');

  const gridCol10 = Array(10).fill('<w:gridCol w:w="1049" />').join('');
  tblContent = tblContent.replace(
    /<w:tblGrid>[\s\S]*?<\/w:tblGrid>/,
    `<w:tblGrid>${gridCol10}</w:tblGrid>`
  );

  const trParts: { start: number; end: number }[] = [];
  let searchFrom2 = 0;
  while (true) {
    const trOpen = tblContent.indexOf('<w:tr>', searchFrom2);
    if (trOpen === -1) break;
    const trClose = tblContent.indexOf('</w:tr>', trOpen);
    if (trClose === -1) break;
    trParts.push({ start: trOpen, end: trClose + '</w:tr>'.length });
    searchFrom2 = trClose + '</w:tr>'.length;
  }
  console.log('Found', trParts.length, 'rows');

  for (let rowIdx = trParts.length - 1; rowIdx >= 0; rowIdx--) {
    const { start, end } = trParts[rowIdx];
    let rowXml = tblContent.substring(start, end);
    const isLastRow = rowIdx === trParts.length - 1;

    const span1 = isLastRow ? 8 : 4;
    const span2 = isLastRow ? 2 : 6;

    let cellIdx = 0;
    rowXml = rowXml.replace(/<w:tcPr(\s*\/>|>)/g, (match, suffix) => {
      const isFirstCol = cellIdx === 0;
      const span = isFirstCol ? span1 : span2;
      const widthPct = isFirstCol 
          ? (isLastRow ? 4000 : 2000) 
          : (isLastRow ? 1000 : 3000);
      
      let injected = `<w:gridSpan w:val="${span}" /><w:tcW w:type="pct" w:w="${widthPct}" />`;
      
      if (isLastRow && !isFirstCol) {
        injected += '<w:vAlign w:val="center" />';
        injected += '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto" /><w:left w:val="single" w:sz="4" w:space="0" w:color="auto" /><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto" /><w:right w:val="single" w:sz="4" w:space="0" w:color="auto" /></w:tcBorders>';
      }
      
      cellIdx++;
      
      if (suffix.includes('/')) {
        return `<w:tcPr>${injected}</w:tcPr>`;
      } else {
        return `<w:tcPr>${injected}`;
      }
    });

    if (!isLastRow) {
      rowXml = rowXml.replace(/<w:jc w:val="left" \/>/g, '<w:jc w:val="center" />');
    } else {
      const lastTcIdx = rowXml.lastIndexOf('<w:tc>');
      if (lastTcIdx !== -1) {
        const beforeLastTc = rowXml.substring(0, lastTcIdx);
        const lastTcContent = rowXml.substring(lastTcIdx);
        const fixedLastTc = lastTcContent.replace(/<w:jc w:val="left" \/>/g, '<w:jc w:val="center" />');
        rowXml = beforeLastTc + fixedLastTc;
      }
    }

    tblContent = tblContent.substring(0, start) + rowXml + tblContent.substring(end);
  }

  xml = beforeTbl + tblContent + afterTbl;
}

zip.updateFile(entry, Buffer.from(xml));
fs.writeFileSync('debug_1761_processed.docx', zip.toBuffer());
console.log('Saved debug_1761_processed.docx');

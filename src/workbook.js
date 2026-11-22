import { headerScore, inferMapping, detectDateMode } from './assistant-core.js';
const text = v => String(v ?? '').replace(/\s+/g,' ').trim();
export function sheetGrid(sheet, X) {
  const bounds = X.utils.decode_range(sheet['!ref'] || 'A1');
  if (bounds.e.r > 20049) throw Error('Worksheet exceeds 20,000 data rows.');
  const grid = X.utils.sheet_to_json(sheet,{header:1,range:0,defval:'',blankrows:true,raw:true});
  grid.forEach((row,r)=>row.forEach((v,c)=>{
    const cell=sheet[X.utils.encode_cell({r,c})];
    if(cell?.t==='n' && cell.w!=null) row[c]=cell.w;
  }));
  // Excel often formats thousands of empty cells. Only actual values count.
  let width = 0;
  for (const row of grid) for(let c=0;c<row.length;c++) if(text(row[c])) width=Math.max(width,c+1);
  if (width>100) throw Error('Table exceeds 100 populated columns.');
  for (const row of grid) row.length=width;
  // Expand only explicit Excel merges, never blindly fill arbitrary blanks.
  for(const merge of sheet['!merges'] || []) {
    if (merge.s.c!==merge.e.c || merge.s.r===merge.e.r) continue;
    const value=grid[merge.s.r]?.[merge.s.c];
    for(let r=merge.s.r+1;r<=merge.e.r;r++) if(grid[r] && !text(grid[r][merge.s.c])) grid[r][merge.s.c]=value;
  }
  return grid;
}
export function canonicalReference(value, revision = '') {
  let ref = String(value ?? '').replace(/\s+/g,' ').trim();
  if (/^(?:RFI\s*NO\s*[.:;]*\s*)?(?:RFI|MIR|WIR|NCR|CAR)-/i.test(ref)) {
    ref = ref.replace(/^RFI\s*NO\s*[.:;]*\s*/i,'');
    ref = ref.replace(/\s*REV\.?\s*([A-Z0-9]+)\s*$/i,(whole,rev)=>!revision || rev.toLowerCase()===revision.toLowerCase() ? '' : whole);
    ref = ref.replace(/\s+\(([A-Z0-9]+)\)\s*$/i,(whole,rev)=>revision && rev.toLowerCase()===revision.toLowerCase() ? '' : whole);
    ref = ref.replace(/\s+/g,'');
  }
  return ref;
}
export function workbookTables(book,X) {
  const tables=[], skipped=[];
  for(const sheetName of book.SheetNames) {
    const grid=sheetGrid(book.Sheets[sheetName],X), detection=headerScore(grid);
    const headerRow=detection.row;
    const width=Math.max(...grid.slice(headerRow,headerRow+10).map(r=>r.length),0);
    const headers=Array.from({length:width},(_,i)=>text(grid[headerRow]?.[i]) || 'Column '+(i+1));
    const found=inferMapping(headers,grid.slice(headerRow+1)),mapping=found.mapping;
    if(mapping.reference==='' || mapping.title==='') { skipped.push(sheetName); continue; }
    const rows=[],byKey=new Map();let omitted=0,duplicates=0,continued=0,missingTitles=0;
    let lastRef='',lastTitle='',lastRevision='',lastSerial='';
    for(const [offset,original] of grid.slice(headerRow+1).entries()) {
      if(!original.some(v=>text(v))) continue;
      const row=[...original];
      row._original=[...original]; row._sourceRow=headerRow+2+offset;
      let ref=text(row[Number(mapping.reference)]);
      const rev=mapping.revision===''?'':text(row[Number(mapping.revision)]);
      const title=text(row[Number(mapping.title)]);
      const serial=text(row[0]);
      const continuesRevision = rev && lastRevision && rev.localeCompare(lastRevision,undefined,{numeric:true})>0 && (!serial || serial===lastSerial);
      // A higher revision on the immediately following line, with no new
      // sequence/reference, is a continuation of the previous record.
      if(!ref && lastRef && rev && (title===lastTitle || (!title && continuesRevision) || continuesRevision)) {
        ref=lastRef; row[Number(mapping.reference)]=ref; continued++;
      }
      if(ref) {lastRef=ref;if(title)lastTitle=title;lastRevision=rev;if(serial)lastSerial=serial;}
      if(!ref || ref.toLowerCase()===headers[Number(mapping.reference)].toLowerCase() || /^(grand\s+total|total|subtotal|page\s+\d+)/i.test(ref)) {omitted++;continue;}
      if(!title) {
        const prior=rows.find(r=>text(r[Number(mapping.reference)])===ref && text(r[Number(mapping.title)]));
        row[Number(mapping.title)]=prior?.[Number(mapping.title)] || '[Description not provided] ' + ref;
        missingTitles++;
      }
      const key=JSON.stringify([canonicalReference(ref,rev),rev]);
      row[Number(mapping.reference)] = canonicalReference(ref,rev);
      if(byKey.has(key)) {rows[byKey.get(key)]=row;duplicates++;} else {byKey.set(key,rows.length);rows.push(row);}
    }
    if(rows.length>5000) throw Error('A register worksheet exceeds 5,000 records.');
    if(rows.some(r=>r.some(v=>typeof v==='string'&&v.length>5000))) throw Error('A cell exceeds 5,000 characters.');
    tables.push({sheetName,headerRow,headers,rows,mapping,fuzzy:found.fuzzy,dateMode:detectDateMode(rows,mapping)||'iso',omitted,duplicates,continued,missingTitles});
  }
  return {tables,skipped};
}

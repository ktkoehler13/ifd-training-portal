import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFName, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import fields from "./compensation-field-map.json";
import { stripInteractivePdfArtifacts } from "./validate-merged-packet";
import { drawSignatureInBox } from "./draw-signature";
import { encodePdfText, wrapPdfText } from "./wrap-pdf-text";
import { compensationTotals, formatCompensationRate, localToday, money, timeMinutes, type CompensationPacket } from "../compensation/model";

const officeFields = ["TTM Training Time Straight Pay", "OC  Training Time  Straight Time", "TNM Mandatory Training  15 Pay", "OCTR  Mandatory Training  15 Time", "EM EMT Class Time 15 Pay", "OCEC  EMT Class Time  15 Time", "TM EMT Travel Time  Straight Pay", "OCET  EMT Travel Time  Straight Time"];
const officeCodes = ["TTM", "OC", "TNM", "OCTR", "EM", "OCEC", "TM", "OCET"];
const date = (raw: string) => { const value = raw.includes("T") && Number.isFinite(Date.parse(raw)) ? localToday(new Date(raw)) : raw; return /^\d{4}-\d\d-\d\d/.test(value) ? `${value.slice(5,7)}/${value.slice(8,10)}/${value.slice(0,4)}` : ""; };
const chunks = <T>(items: T[], size: number): T[][] => items.length ? Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size)) : [[]];

/** Uses the supplied 2026 artwork. Signed/exported copies are fixed snapshots;
 * editable entries remain in the portal. Never relies on the PDF's JavaScript.
 * Duplicate source field names are addressed by page/rectangle, not name alone.
 */
export async function renderCompensationPacket(packet: CompensationPacket, signatures: { requester?: Uint8Array; mto?: Uint8Array } = {}, draft = false): Promise<Uint8Array> {
  const source = await PDFDocument.load(await readFile(path.join(process.cwd(), "lib/pdf/templates/training-compensation-2026.pdf")));
  stripInteractivePdfArtifacts(source);
  source.catalog.delete(PDFName.of("OpenAction")); source.catalog.delete(PDFName.of("AA")); source.catalog.delete(PDFName.of("Names"));
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const overflow: string[] = [];
  const { data, identity } = packet;
  const totals = compensationTotals(data, identity.mileageRate);
  async function page(index: number) { const [p] = await pdf.copyPages(source, [index]); pdf.addPage(p); return p; }
  function box(p: PDFPage, value: string, rect: number[], label = "Details", center = false) {
    if (!value) return;
    const [left,bottom,right,top] = rect, width=right-left-4, height=top-bottom-2;
    const safe = encodePdfText(value,font).replace(/\s+/g," ").trim();
    let size = Math.min(10, height-1, width / Math.max(1,font.widthOfTextAtSize(safe,1)));
    let lines = [safe];
    if (size<7) { size=7; lines=wrapPdfText(safe,font,width,size); }
    if (lines.length*(size+1)>height) { overflow.push(`${label}: ${value}`); lines=["See continued details"]; size=7; }
    lines.forEach((text,i)=>p.drawText(text,{x:center?left+(right-left-font.widthOfTextAtSize(text,size))/2:left+2,y:bottom+(height+2-lines.length*(size+1))/2+(lines.length-1-i)*(size+1)+2,size,font,color:rgb(0,0,0)}));
  }
  function field(p: PDFPage,index:number,name:string,value:string,center=false,label=name) {
    const rect=(fields[index] as Record<string, number[] | undefined>)[name];
    if(!rect) throw new Error(`Missing compensation form field: ${index+1}/${name}`);
    box(p,value,rect,label,center);
  }
  async function sign(p: PDFPage,bytes:Uint8Array|undefined,rect:number[]) {
    if(bytes) await drawSignatureInBox(p,pdf,bytes,{pageIndex:pdf.getPageCount()-1,x:rect[0],y:rect[1],width:rect[2]-rect[0],height:rect[3]-rect[1]},"Compensation");
  }
  function stamp(p:PDFPage,detail:string) {
    box(p,`${draft?"DRAFT — NOT SUBMITTED | ":""}${identity.requestNumber} | ${detail}`,[36,18,576,34],"Packet reference");
  }
  for(const [index,rows] of chunks(data.time,16).entries()) {
    const p=await page(0);
    field(p,0,"Name",identity.name); field(p,0,"Badge",identity.badge); field(p,0,"Name of ConferenceSeminarClass",identity.course);
    if(data.emtTravel) field(p,0,data.emtTravel==="yes"?"Check Box1":"Check Box2","X",true);
    if(data.compensationType) field(p,0,data.compensationType==="time"?"Check Box3":"Check Box4","X",true);
    rows.forEach((r,i)=>{
      const n=i+1;
      for(const [key,value] of [[`DateRow${n}`,date(r.date)],[`FromRow${n}`,r.start],[`ToRow${n}`,r.end],[`FromRow${n}_2`,r.secondStart],[`ToRow${n}_2`,r.secondEnd],[`Total HoursRow${n}`,(timeMinutes(r)/60).toFixed(2)]]) field(p,0,key,value,true);
    });
    field(p,0,"Total","Total",true); field(p,0,"Total hours",(rows.reduce((s,r)=>s+timeMinutes(r),0)/60).toFixed(2),true);
    field(p,0,"Training InstructorFacilitator print name and title",data.instructor);
    await sign(p,signatures.mto,[154,83,510,104]);
    stamp(p,`Training hours ${index+1}/${chunks(data.time,16).length} | Packet total: ${totals.hours.toFixed(2)} hours`);
  }
  const office=await page(1);
  for(const code of packet.office_codes) field(office,1,officeFields[officeCodes.indexOf(code)],"X",true);
  box(office,packet.office_name??"",[199,364,357,383],"Compensation approved by");
  box(office,date(packet.office_completed_at??""),[386,364,499,383],"Office approval date");
  stamp(office,"Office compensation codes");
  for(const [index,rows] of chunks(data.mileage,17).entries()) {
    const p=await page(2);
    field(p,2,"Name",identity.name); field(p,2,"Badge",identity.badge); field(p,2,"Name of ConferenceSeminarClass",identity.course);
    rows.forEach((r,i)=>{
      const n=i+1, dest=(fields[2] as Record<string,number[] | undefined>)[`DestinationRow${n}`]!;
      box(p,date(r.date),[73.2,dest[1],186.24,dest[3]],`Mileage date ${n}`,true);
      field(p,2,`DestinationRow${n}`,r.destination,false,`Mileage row ${index*17+n} (${date(r.date)})`); field(p,2,`Total MilesRow${n}`,r.miles,true);
    });
    const subtotal=money(rows.reduce((s,r)=>s+(Number(r.miles)||0),0));
    field(p,2,"Total","Total",true); field(p,2,"Total Miles",subtotal.toFixed(2),true);
    // Show the combined reimbursement once, avoiding duplicate claims and
    // penny differences from rounding each continuation sheet separately.
    if(index===0) {
      field(p,2,"Mileage rate",formatCompensationRate(identity.mileageRate),true);
      box(p,totals.miles.toFixed(2),[73,99,142,116],"Combined miles",true);
      box(p,totals.mileageAmount.toFixed(2),[248,99,360,116],"Combined reimbursement",true);
      if(data.mileage.length>17) box(p,"Combined totals for all mileage sheets",[73,80,400,95],"Mileage totals note");
    } else box(p,"Reimbursement totals appear on the first mileage sheet.",[73,80,500,96],"Mileage continuation note");
    await sign(p,signatures.requester,[169,205,490,228]); await sign(p,signatures.mto,[157,176,490,195]);
    stamp(p,`Mileage ${index+1}/${chunks(data.mileage,17).length} | Packet total: ${totals.miles.toFixed(2)} miles / $${totals.mileageAmount.toFixed(2)}`);
  }
  const voucherRows = [
    ...(data.mileage.length ? [{date:data.mileage.at(-1)!.date,quantity:String(totals.miles),description:`Mileage for ${identity.course}`,unitPrice:String(identity.mileageRate)}] : []),
    ...data.voucher,
  ];
  const voucherPages: Array<Array<{date:string;quantity:string;description:string;unitPrice:string;lines:string[];height:number}>> = [[]];
  let used=0;
  for(const row of voucherRows) {
    const lines=wrapPdfText(encodePdfText(row.description,font),font,245,9);
    const height=Math.max(24,lines.length*11+8);
    if(used+height>166 && voucherPages.at(-1)!.length) { voucherPages.push([]); used=0; }
    // Very long descriptions continue in the details appendix without loss.
    const shown=height>166?{...row,description:"See continued details",lines:["See continued details"],height:24}:{...row,lines,height};
    if(height>166) overflow.push(`Voucher description: ${row.description}`);
    voucherPages.at(-1)!.push(shown); used+=shown.height;
  }
  for(const [index,rows] of voucherPages.entries()) {
    const p=await page(3);
    box(p,identity.name,[76,607,277,629],"Claimant name"); box(p,data.street,[76,581,277,605],"Street Address"); box(p,data.cityStateZip,[76,555,277,579],"City, State, Zip");
    // The certification name shares a duplicate source Name widget: use its exact line.
    field(p,3,"Name",identity.name);
    field(p,3,"Date",date(packet.requester_signature?.signedAt??""),true); field(p,3,"Title",data.title,true);
    let y=502;
    for(const row of rows) {
      const bottom=y-row.height;
      box(p,date(row.date),[2,bottom,54,y],"Voucher date",true);
      box(p,row.quantity,[57,bottom,121,y],"Quantity",true);
      row.lines.forEach((line,i)=>p.drawText(line,{x:124,y:y-12-i*11,font,size:9}));
      box(p,row.description.startsWith("Mileage for ")?formatCompensationRate(Number(row.unitPrice)):Number(row.unitPrice).toFixed(2),[399,bottom,479,y],"Unit price",true);
      box(p,money(Number(row.quantity)*Number(row.unitPrice)).toFixed(2),[482,bottom,573,y],"Amount",true); y=bottom;
    }
    const subtotal=money(rows.reduce((s,r)=>s+money(Number(r.quantity)*Number(r.unitPrice)),0));
    box(p,subtotal.toFixed(2),[482,317,573,331],"Voucher total",true);
    box(p,subtotal.toFixed(2),[412,297,492,310],"Certified amount",true);
    await sign(p,signatures.requester,[156,241,365,267]);
    stamp(p,`Voucher ${index+1}/${voucherPages.length} | Combined claim: $${totals.voucherAmount.toFixed(2)}`);
  }
  if(overflow.length) {
    let p:PDFPage=pdf.addPage([612,792]),y=740;
    const heading=()=>{p.drawText("Compensation Packet — Continued Details",{x:40,y,size:14,font:bold});y-=24;}; heading();
    for(const value of overflow) for(const line of wrapPdfText(encodePdfText(value,font),font,532,10)) {
      if(y<50) { p=pdf.addPage([612,792]);y=740;heading(); }
      p.drawText(line,{x:40,y,size:10,font});y-=14;
    }
  }
  // Copying untouched artwork avoids inheriting source calculation scripts,
  // duplicate Name/Total widgets, print buttons, or stale blue placeholder values.
  stripInteractivePdfArtifacts(pdf);
  pdf.setTitle(`Training Compensation — ${identity.requestNumber}`);
  return pdf.save();
}

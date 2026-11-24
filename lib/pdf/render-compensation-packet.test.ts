import assert from "node:assert/strict";
import { describe,it } from "node:test";
import { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream, type PDFPage } from "pdf-lib";
import { renderCompensationPacket } from "./render-compensation-packet";
import { compensationFixture } from "../compensation/fixtures";
import { countWidgetAnnotations } from "./validate-merged-packet";
import {readFileSync} from "node:fs";
const signature=new Uint8Array(readFileSync("lib/compensation/fixtures/sample-signature.png"));
function addedContent(page:PDFPage) {
 const streams=page.node.Contents();assert.ok(streams instanceof PDFArray);
 return Buffer.from(decodePDFRawStream(streams.lookup(streams.size()-1,PDFRawStream)).decode()).toString();
}
function signaturePositions(page:PDFPage) {
 return [...addedContent(page).matchAll(/q\n1 0 0 1 ([\d.]+) ([\d.]+) cm\n(?:[^Q]*?)\/Image-[\d]+ Do\nQ/g)].map(m=>({x:Number(m[1]),y:Number(m[2])}));
}
function voucherSignatureDate(page:PDFPage) {
 const texts=[...addedContent(page).matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm\n<([0-9A-F]+)> Tj/g)];
 const date=texts.find(m=>Number(m[1])>=1&&Number(m[1])<125&&Number(m[2])>=236&&Number(m[2])<259);
 return date?Buffer.from(date[3],"hex").toString():null;
}
function textsIn(page:PDFPage,[x0,y0,x1,y1]:number[]) {
 return [...addedContent(page).matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm\n<([0-9A-F]+)> Tj/g)]
  .filter(m=>Number(m[1])>=x0&&Number(m[1])<x1&&Number(m[2])>=y0&&Number(m[2])<y1).map(m=>Buffer.from(m[3],"hex").toString());
}
describe("compensation packet PDF snapshots",()=>{
 it("retains four official pages and embeds both signatures with no mutable widgets or scripts",async()=>{
  const pdf=await PDFDocument.load(await renderCompensationPacket(compensationFixture,{requester:signature,mto:signature}));assert.equal(pdf.getPageCount(),4);assert.equal(countWidgetAnnotations(pdf),0);assert.equal(pdf.catalog.has(PDFName.of("AcroForm")),false);assert.equal(pdf.catalog.has(PDFName.of("OpenAction")),false);
  for(const i of [0,2,3])assert.ok(pdf.getPage(i).node.Resources()?.lookup(PDFName.of("XObject")),`signature artwork page ${i+1}`);
 });
 it("places the requester signature on mileage and voucher at submission with no MTO signature yet",async()=>{
  const packet={...compensationFixture,status:"pending_mto" as const,mto_signature:null,office_codes:[],office_name:null,office_completed_at:null};
  const pdf=await PDFDocument.load(await renderCompensationPacket(packet,{requester:signature}));
  assert.deepEqual(signaturePositions(pdf.getPage(0)),[]);
  const mileage=signaturePositions(pdf.getPage(2));assert.equal(mileage.length,1);assert.ok(mileage[0].x>=169&&mileage[0].x<490&&mileage[0].y>=205&&mileage[0].y<228);
  const voucher=signaturePositions(pdf.getPage(3));assert.equal(voucher.length,1);assert.ok(voucher[0].x>=156&&voucher[0].x<365&&voucher[0].y>=241&&voucher[0].y<267);
  assert.equal(voucherSignatureDate(pdf.getPage(3)),"11/12/2026");
 });
 it("retains both mileage signatures for a requester who is also the MTO and keeps the original voucher date",async()=>{
  const packet={...compensationFixture,mto_signature:{...compensationFixture.mto_signature!,name:compensationFixture.requester_signature!.name}};
  const pdf=await PDFDocument.load(await renderCompensationPacket(packet,{requester:signature,mto:signature}));
  const mileage=signaturePositions(pdf.getPage(2));assert.equal(mileage.length,2);assert.ok(mileage.some(p=>p.y>=205&&p.y<228));assert.ok(mileage.some(p=>p.y>=176&&p.y<195));
  assert.equal(signaturePositions(pdf.getPage(0)).length,1);assert.equal(signaturePositions(pdf.getPage(3)).length,1);
  assert.equal(voucherSignatureDate(pdf.getPage(3)),"11/12/2026");
 });
 it("dates the voucher using the New York submission day even near UTC midnight",async()=>{
  const packet={...compensationFixture,requester_signature:{...compensationFixture.requester_signature!,signedAt:"2026-11-13T02:30:00Z"}};
  const pdf=await PDFDocument.load(await renderCompensationPacket(packet,{requester:signature,mto:signature}));
  assert.equal(voucherSignatureDate(pdf.getPage(3)),"11/12/2026");
 });
 it("adds continuation pages without truncating days or mileage",async()=>{
  const data={...compensationFixture.data,time:Array(35).fill(compensationFixture.data.time[0]),mileage:Array(36).fill(compensationFixture.data.mileage[0])};
  const pdf=await PDFDocument.load(await renderCompensationPacket({...compensationFixture,data}));assert.equal(pdf.getPageCount(),8);assert.equal(countWidgetAnnotations(pdf),0);
 });
 it("wraps long text and creates detail pages for values that cannot fit",async()=>{
  const data={...compensationFixture.data,instructor:"Long name ".repeat(20),voucher:Array(20).fill({...compensationFixture.data.voucher[0],description:"Training meal and other supporting information ".repeat(21)})};
  const pdf=await PDFDocument.load(await renderCompensationPacket({...compensationFixture,data,identity:{...compensationFixture.identity,course:"Extended course title ".repeat(30)+" 🚒"}}));assert.ok(pdf.getPageCount()>4);assert.equal(countWidgetAnnotations(pdf),0);
 });
 it("leaves the voucher total, certified amount and office approved-by name and date blank",async()=>{
  const pdf=await PDFDocument.load(await renderCompensationPacket(compensationFixture,{requester:signature,mto:signature}));
  const voucher=pdf.getPage(3);
  assert.ok(textsIn(voucher,[482,330,573,502]).length>0,"voucher line amounts still print");
  assert.deepEqual(textsIn(voucher,[400,290,573,332]),[]);
  assert.ok(!addedContent(voucher).includes(Buffer.from("Combined claim").toString("hex").toUpperCase()));
  const office=pdf.getPage(1);
  assert.deepEqual(textsIn(office,[190,355,510,390]),[]);
  assert.ok(!addedContent(office).includes(Buffer.from("Sample Office").toString("hex").toUpperCase()));
 });
 it("renders an unsigned draft with no optional mileage or voucher rows",async()=>{
  const packet={...compensationFixture,requester_signature:null,mto_signature:null,office_codes:[],office_name:null,office_completed_at:null,data:{...compensationFixture.data,mileage:[],voucher:[],street:"",cityStateZip:""}};
  assert.equal((await PDFDocument.load(await renderCompensationPacket(packet,{},true))).getPageCount(),4);
 });
});

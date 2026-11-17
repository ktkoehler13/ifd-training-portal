import assert from "node:assert/strict";
import { describe,it } from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { renderCompensationPacket } from "./render-compensation-packet";
import { compensationFixture } from "../compensation/fixtures";
import { countWidgetAnnotations } from "./validate-merged-packet";
import {readFileSync} from "node:fs";
const signature=new Uint8Array(readFileSync("lib/compensation/fixtures/sample-signature.png"));
describe("compensation packet PDF snapshots",()=>{
 it("retains four official pages and embeds both signatures with no mutable widgets or scripts",async()=>{
  const pdf=await PDFDocument.load(await renderCompensationPacket(compensationFixture,{requester:signature,mto:signature}));assert.equal(pdf.getPageCount(),4);assert.equal(countWidgetAnnotations(pdf),0);assert.equal(pdf.catalog.has(PDFName.of("AcroForm")),false);assert.equal(pdf.catalog.has(PDFName.of("OpenAction")),false);
  for(const i of [0,2,3])assert.ok(pdf.getPage(i).node.Resources()?.lookup(PDFName.of("XObject")),`signature artwork page ${i+1}`);
 });
 it("adds continuation pages without truncating days or mileage",async()=>{
  const data={...compensationFixture.data,time:Array(35).fill(compensationFixture.data.time[0]),mileage:Array(36).fill(compensationFixture.data.mileage[0])};
  const pdf=await PDFDocument.load(await renderCompensationPacket({...compensationFixture,data}));assert.equal(pdf.getPageCount(),8);assert.equal(countWidgetAnnotations(pdf),0);
 });
 it("wraps long text and creates detail pages for values that cannot fit",async()=>{
  const data={...compensationFixture.data,instructor:"Long name ".repeat(20),voucher:Array(20).fill({...compensationFixture.data.voucher[0],description:"Training meal and other supporting information ".repeat(21)})};
  const pdf=await PDFDocument.load(await renderCompensationPacket({...compensationFixture,data,identity:{...compensationFixture.identity,course:"Extended course title ".repeat(30)+" 🚒"}}));assert.ok(pdf.getPageCount()>4);assert.equal(countWidgetAnnotations(pdf),0);
 });
 it("renders an unsigned draft with no optional mileage or voucher rows",async()=>{
  const packet={...compensationFixture,requester_signature:null,mto_signature:null,office_codes:[],office_name:null,office_completed_at:null,data:{...compensationFixture.data,mileage:[],voucher:[],street:"",cityStateZip:""}};
  assert.equal((await PDFDocument.load(await renderCompensationPacket(packet,{},true))).getPageCount(),4);
 });
});

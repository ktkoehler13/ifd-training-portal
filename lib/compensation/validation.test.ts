import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {compensationFixture} from "./fixtures";
import {compensationTotals,formatCompensationRate,isCompensationEligible,timeMinutes,localToday} from "./model";
import {parseCompensationInput,parseOfficeCodes,validateCompensationSubmission,validDate} from "./validation";
const data=compensationFixture.data;
describe("compensation entries and totals",()=>{
 it("excludes lunch and uses the request's captured mileage rate",()=>{assert.equal(timeMinutes(data.time[0]),480);assert.deepEqual(compensationTotals(data,.725),{minutes:870,hours:14.5,miles:204.8,mileageAmount:148.48,voucherAmount:188.22});});
 it("preserves all four stored mileage-rate decimals",()=>{assert.equal(formatCompensationRate(.7255),"0.7255");assert.equal(formatCompensationRate(.725),"0.725");});
 it("supports a single session",()=>assert.equal(timeMinutes({...data.time[0],secondStart:"",secondEnd:""}),240));
 it("requires an approved, undeleted training that has ended in New York time",()=>{assert.equal(isCompensationEligible({status:"approved",end_date:"2026-11-16"},"2026-11-16"),true);for(const request of [{status:"denied",end_date:"2026-11-15"},{status:"approved",end_date:"2026-11-17"},{status:"approved",end_date:null},{status:"approved",end_date:"2026-11-15",deleted_at:"2026-11-16"}])assert.equal(isCompensationEligible(request,"2026-11-16"),false);assert.equal(localToday(new Date("2026-11-16T03:00:00Z")),"2026-11-15");});
 it("accepts the completed sample packet",()=>assert.deepEqual(validateCompensationSubmission(parseCompensationInput(data),"2026-11-16"),[]));
 it("requires explicit choices and instructor",()=>{const errors=validateCompensationSubmission({...data,emtTravel:"",compensationType:"",instructor:""},"2026-11-16");assert.equal(errors.length,3);});
 for(const row of [{...data.time[0],end:"07:30"},{...data.time[0],secondStart:"11:00"},{...data.time[0],secondEnd:""},{...data.time[0],start:"25:00"},{...data.time[0],date:"2026-02-30"},{...data.time[0],date:"2099-01-01"}])it(`rejects invalid time entry ${JSON.stringify(row)}`,()=>assert.ok(validateCompensationSubmission({...data,time:[row]},"2026-11-16").length));
 it("rejects duplicate dates and requires positive mileage",()=>{assert.match(validateCompensationSubmission({...data,time:[data.time[0],data.time[0]]},"2026-11-16").join(),/combine sessions/);assert.match(validateCompensationSubmission({...data,mileage:[{...data.mileage[0],miles:"-1"}]},"2026-11-16").join(),/Mileage row/);});
 it("requires voucher address only when claiming reimbursement",()=>{const empty={...data,street:"",cityStateZip:"",title:""};assert.match(validateCompensationSubmission(empty,"2026-11-16").join(),/mailing address/);assert.deepEqual(validateCompensationSubmission({...empty,mileage:[],voucher:[]},"2026-11-16"),[]);});
 it("bounds payloads, discards untrusted extra properties and validates office codes",()=>{assert.throws(()=>parseCompensationInput({...data,emtTravel:["yes"]}),/valid EMT/);assert.throws(()=>parseCompensationInput({...data,time:Array(101).fill(data.time[0])}),/100/);assert.throws(()=>parseCompensationInput({...data,instructor:"x".repeat(201)}),/too long/);assert.equal(Object.hasOwn(parseCompensationInput({...data,requester_signature:{forged:true}}),"requester_signature"),false);assert.deepEqual(parseOfficeCodes(["TTM","TM"]),["TTM","TM"]);for(const codes of [[],["forged"],["TTM","TTM"],"TTM"])assert.throws(()=>parseOfficeCodes(codes));});
 it("rejects impossible leap dates",()=>{assert.equal(validDate("2026-02-29"),false);assert.equal(validDate("2028-02-29"),true);});
});

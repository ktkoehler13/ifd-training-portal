import assert from "node:assert/strict";
import {describe,it} from "node:test";
import {canCompleteCompensation,canReadCompensationPacket,compensationNeedsAction} from "./access";
import {compensationFixture} from "./fixtures";
import {COMPENSATION_STATUS, type CompensationStatus} from "./model";
import {PERSONNEL_ROLES} from "@/types/personnel";
const states:CompensationStatus[]=["draft","pending_mto","returned","pending_office","completed"];
describe("Office compensation access and action badges",()=>{
 it("gives Office the same packet read access as Admin, including unfinished packets",()=>{
  for(const status of states) {
   const packet={...compensationFixture,status};
   assert.equal(canReadCompensationPacket({id:"office-person",role:"office"},packet.requester_id),true);
  }
  assert.equal(canReadCompensationPacket({id:"office-person",role:"office"},"someone-else"),true);
  assert.equal(canReadCompensationPacket({id:"firefighter",role:"firefighter"},"someone-else"),false);
 });
 it("retains ordinary owner access for Office and existing administrative read access",()=>{
  for(const role of PERSONNEL_ROLES) for(const status of states) {
   const packet={...compensationFixture,status};
   assert.equal(canReadCompensationPacket({id:packet.requester_id,role},packet.requester_id),true);
   if(["mto","deputy_chief","admin","office"].includes(role))assert.equal(canReadCompensationPacket({id:"reviewer",role},packet.requester_id),true);
  }
 });
 it("allows Office, Admin, MTO and Deputy Chief to complete coding",()=>{
  for(const role of PERSONNEL_ROLES)assert.equal(canCompleteCompensation(role),role!=="firefighter");
 });
 it("routes action badges to MTO for review, only Office after signing, and the owner for corrections",()=>{
  for(const role of PERSONNEL_ROLES) for(const status of states) {
   const packet={...compensationFixture,status};
   assert.equal(compensationNeedsAction(packet,{id:"reviewer",role}),(role==="mto"&&status==="pending_mto")||(role==="office"&&status==="pending_office"));
   assert.equal(compensationNeedsAction({...packet,status:"returned"},{id:packet.requester_id,role}),true);
  }
 });
 it("keeps backup processing access without sending Office-stage action alerts",()=>{
  const packet={...compensationFixture,status:"pending_office" as const};
  for(const role of ["admin","mto","deputy_chief"] as const) {
   const actor={id:packet.requester_id,role};
   assert.equal(canCompleteCompensation(role),true);
   assert.equal(canReadCompensationPacket(actor,packet.requester_id),true);
   assert.equal(compensationNeedsAction(packet,actor),false);
  }
 });
 it("clears every Office user's alert once the packet is marked as Submitted",()=>{
  assert.equal(COMPENSATION_STATUS.completed,"Submitted");
  for(const id of ["office-one","office-two",compensationFixture.requester_id]){
   const actor={id,role:"office" as const};
   assert.equal(compensationNeedsAction({...compensationFixture,status:"pending_office"},actor),true);
   assert.equal(compensationNeedsAction({...compensationFixture,status:"completed"},actor),false);
   assert.equal(canReadCompensationPacket(actor,compensationFixture.requester_id),true);
  }
 });
});

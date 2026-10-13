import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updatePersonnelEmail, hasOtherPersonnelChanges, PersonnelEmailUpdateError, type PersonnelEmailDependencies } from "./personnel-email-update";
import { mapPersonnelRow, getSelfEditChanges, personnelRecordToFormValues } from "../personnel";
import type { PersonnelRow } from "../../types/personnel";

function fixture() {
  let row: PersonnelRow & {auth_user_id: string|null} = { id:"personnel-207",auth_user_id:"original-auth-id",badge_number:"207",email:"old@example.test",first_name:"Test",last_name:"User",title:"assistant_chief",role:"mto",active:true,must_change_password:false,password_setup_completed_at:"2026-01-01",created_at:"2026-01-01",updated_at:"2026-01-01" };
  let auth={id:"original-auth-id",email:row.email};
  const calls: unknown[]=[];
  const dependencies: PersonnelEmailDependencies={
    getPersonnel:async()=>({...row}),getAuthUser:async()=>({...auth}),
    updateAuthEmail:async(id,email)=>{calls.push({id,email});auth={id,email};row={...row,email};},
  };
  return {actor:mapPersonnelRow(row),dependencies,calls,setRow:(value:Partial<typeof row>)=>{row={...row,...value};},setAuth:(email:string)=>{auth.email=email;}};
}
const input={personnelId:"personnel-207",email:" NEW@EXAMPLE.TEST ",expectedEmail:"old@example.test"};
describe("safe personnel email changes",()=>{
  it("updates the existing sign-in identity, normalizes email, and returns the synchronized profile",async()=>{
    const f=fixture();const result=await updatePersonnelEmail(f.actor,input,f.dependencies);
    assert.equal(result.email,"new@example.test");assert.equal(result.auth_user_id,"original-auth-id");
    assert.deepEqual(f.calls,[{id:"original-auth-id",email:"new@example.test"}]);
    assert.equal(result.must_change_password,false);assert.equal(result.badge_number,"207");
  });
  it("denies anonymous, inactive, and non-administrative callers before reading accounts",async()=>{
    for(const actor of [null,{...fixture().actor,active:false},{...fixture().actor,role:"firefighter" as const}]){
      const f=fixture();f.dependencies.getPersonnel=async()=>{throw Error("Should never read");};
      await assert.rejects(updatePersonnelEmail(actor,input,f.dependencies),(e:unknown)=>e instanceof PersonnelEmailUpdateError&&e.status===403);
      assert.equal(f.calls.length,0);
    }
  });
  it("keeps the existing administrative-role permissions",async()=>{
    for(const role of ["mto","deputy_chief","admin"] as const){const f=fixture();await updatePersonnelEmail({...f.actor,role},input,f.dependencies);assert.equal(f.calls.length,1);}
  });
  it("rejects invalid addresses without touching the account",async()=>{
    const f=fixture();await assert.rejects(updatePersonnelEmail(f.actor,{...input,email:"broken"},f.dependencies),/valid email/);assert.equal(f.calls.length,0);
  });
  it("refuses missing links, mismatched identity, missing users, and stale forms",async()=>{
    for(const scenario of ["unlinked","mismatch","missing","stale"]){const f=fixture();
      if(scenario==="unlinked")f.setRow({auth_user_id:null});
      if(scenario==="mismatch")f.setAuth("different@example.test");
      if(scenario==="missing")f.dependencies.getPersonnel=async()=>null;
      if(scenario==="stale"){f.setAuth("changed@example.test");f.setRow({email:"changed@example.test"});}
      await assert.rejects(updatePersonnelEmail(f.actor,input,f.dependencies));assert.equal(f.calls.length,0);
    }
  });
  it("reports a rejected Auth change without writing personnel email",async()=>{
    const f=fixture();f.dependencies.updateAuthEmail=async()=>{throw Error("Duplicate email");};
    await assert.rejects(updatePersonnelEmail(f.actor,input,f.dependencies),/Unable to change/);
    assert.equal((await f.dependencies.getPersonnel(input.personnelId))?.email,"old@example.test");
  });
  it("never reports success if the database sync is missing or broken",async()=>{
    const f=fixture();f.dependencies.updateAuthEmail=async()=>{f.setAuth("new@example.test");};
    await assert.rejects(updatePersonnelEmail(f.actor,input,f.dependencies),/Unable to confirm/);
  });
  it("recognizes an atomic save even if the Auth API response is lost",async()=>{
    const f=fixture();const update=f.dependencies.updateAuthEmail;
    f.dependencies.updateAuthEmail=async(id,email)=>{await update(id,email);throw Error("Connection lost");};
    assert.equal((await updatePersonnelEmail(f.actor,input,f.dependencies)).email,"new@example.test");
    await updatePersonnelEmail(f.actor,input,f.dependencies);assert.equal(f.calls.length,1);
  });
  it("allows name-only profile corrections to reach the save handler",()=>{
    const f=fixture();const values={...personnelRecordToFormValues(f.actor),firstName:"Corrected"};
    const changes=getSelfEditChanges(f.actor,values,f.actor.email);
    assert.equal(changes.hasChanges,true);assert.equal(changes.emailChanged,false);
  });
  it("distinguishes email-only edits from mixed profile edits",()=>{
    const f=fixture();const same={firstName:"Test",lastName:"User",badgeNumber:"207",email:"new@example.test",title:f.actor.title,role:f.actor.role,active:true};
    assert.equal(hasOtherPersonnelChanges(f.actor,same),false);
    for(const change of [{firstName:"Changed"},{lastName:"Changed"},{badgeNumber:"208"},{title:"fire_chief" as const},{role:"admin" as const},{active:false}]){
      assert.equal(hasOtherPersonnelChanges(f.actor,{...same,...change}),true);
    }
  });
});

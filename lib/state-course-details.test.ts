import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeStateCourseDetails, STATE_COURSE_FIELDS, validateStateCourseDetails } from "./state-course-details";
import { buildTrainingRequestDatabasePayload, buildTrainingRequestInput, mapTrainingRequestRow, trainingRequestRecordToDraft } from "./training-requests";
import { calculateExpenseSummaryFromDraft } from "./expenses";
import { APPROVED_PACKET_VISUAL_FIXTURE_REQUEST as request } from "./pdf/approved-packet-visual-fixture";
import type { AuthenticatedPersonnel } from "./auth/personnel";
import type { TrainingRequestRow } from "@/types/training-request";

const details = { requesterAddress:"123 Example Street Apt 4", requesterCity:"Ithaca", requesterState:"NY", requesterZip:"14850-1234", requesterPhone:"(607) 555-0100", nyTrainingId:"00123456" };
describe("state course student details", () => {
  it("requires all six fields only for OFPC courses", () => {
    assert.equal(Object.keys(validateStateCourseDetails({}, true)).length, 6);
    assert.deepEqual(validateStateCourseDetails({}, false), {});
    assert.deepEqual(validateStateCourseDetails({}, null), {});
    for (const { key } of STATE_COURSE_FIELDS) assert.ok(validateStateCourseDetails({ ...details, [key]:" \n " }, true)[key]);
  });
  it("normalizes whitespace and state while retaining ID leading zeroes", () => {
    assert.deepEqual(normalizeStateCourseDetails({ ...details, requesterState:" ny ", requesterAddress:" 123 Example\nStreet Apt 4 " }, true), details);
    assert.deepEqual(validateStateCourseDetails(details,true), {});
  });
  it("rejects malformed phone, ZIP, state and excessive text", () => {
    const errors = validateStateCourseDetails({ ...details, requesterPhone:"abc", requesterZip:"123", requesterState:"12", requesterAddress:"x".repeat(161) }, true);
    for (const key of ["requesterPhone","requesterZip","requesterState","requesterAddress"] as const) assert.ok(errors[key]);
  });
  it("round-trips details through drafts, database payloads and records", () => {
    const draft = trainingRequestRecordToDraft({...request,...details,otherExpenseDescription:"Parking"});
    const input = buildTrainingRequestInput({ personnel:{id:request.requesterPersonnelId} as AuthenticatedPersonnel,draft,requireComplete:true,expenseSummary:calculateExpenseSummaryFromDraft(draft,request.gsaMileageRate) });
    const payload = buildTrainingRequestDatabasePayload(input);
    const record = mapTrainingRequestRow({...payload,id:request.id,status:"draft"} as TrainingRequestRow);
    assert.deepEqual(normalizeStateCourseDetails(trainingRequestRecordToDraft(record),true),details);
    assert.equal(payload.ny_training_id,"00123456");
    const nonState = buildTrainingRequestDatabasePayload({...input,isOfpcCourse:false});
    for (const {column} of STATE_COURSE_FIELDS) assert.equal(nonState[column],null);
  });
  it("allows incomplete drafts and historical records but requires details at submission", () => {
    const draft=trainingRequestRecordToDraft({...request,otherExpenseDescription:"Parking"});
    const input={personnel:{id:request.requesterPersonnelId} as AuthenticatedPersonnel,draft,expenseSummary:calculateExpenseSummaryFromDraft(draft,request.gsaMileageRate)};
    assert.doesNotThrow(()=>buildTrainingRequestInput({...input,requireComplete:false}));
    assert.throws(()=>buildTrainingRequestInput({...input,requireComplete:true}),/Street Address is required/);
    assert.equal(draft.nyTrainingId,"");
  });
});

import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getAuthenticatedPersonnel } from "@/lib/auth/personnel";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { authorizationFileType, canProcessCityAuthorization, canReadCityAuthorization, CITY_AUTHORIZATION_MAX_BYTES, type CityAuthorization, type CityAuthorizationFile, type CityAuthorizationQueueItem } from "./model";

const BUCKET = "city-authorizations";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = (bytes:Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export class CityAuthorizationError extends Error {
  constructor(message:string, public status=400) { super(message); }
}
async function currentActor() {
  const actor=await getAuthenticatedPersonnel();
  if(!actor?.active) throw new CityAuthorizationError("Sign in to continue.",401);
  if(actor.mustChangePassword) throw new CityAuthorizationError("Set your account password before continuing.",403);
  return actor;
}
async function context(requestId:string) {
  const actor=await currentActor();
  if(!UUID.test(requestId)) throw new CityAuthorizationError("Request not found.",404);
  const service=createServiceRoleClient();
  const {data:request,error}=await service.from("training_requests").select("id,requester_personnel_id,status,deleted_at").eq("id",requestId).maybeSingle();
  if(error) throw new CityAuthorizationError("Unable to load the request.",503);
  if(!request || !canReadCityAuthorization(actor,request)) throw new CityAuthorizationError("Request not found.",404);
  return {actor,service};
}
export async function listCityAuthorizations() {
  const actor=await currentActor();
  if(!canProcessCityAuthorization(actor.role)) throw new CityAuthorizationError("Office or administrative access is required.",403);
  const db=await createClient();
  const {data,error}=await db.from("training_request_city_authorizations")
    .select("*,request:training_requests(id,request_number,training_title,requester_name,start_date)").order("created_at",{ascending:false});
  if(error) throw new CityAuthorizationError("Unable to load City Authorizations.",503);
  const {data:setting}=await db.from("system_settings").select("value").eq("key","primary_office").maybeSingle();
  return {items:((data??[]) as unknown as CityAuthorizationQueueItem[]).filter(item=>item.request),role:actor.role,actorId:actor.id,primaryOfficeId:(setting?.value as string|undefined)||null};
}
export async function cityAuthorizationDetail(requestId:string) {
  const {actor,service}=await context(requestId);
  const [authorization,files]=await Promise.all([
    service.from("training_request_city_authorizations").select("*").eq("request_id",requestId).maybeSingle(),
    service.from("training_request_city_authorization_files").select("id,request_id,version,file_name,content_type,file_size_bytes,uploaded_by_name,uploaded_at,removed_at,removed_by_name").eq("request_id",requestId).order("version",{ascending:false}),
  ]);
  if(authorization.error || files.error) throw new CityAuthorizationError("Unable to load City Authorization files.",503);
  const canUpload=canProcessCityAuthorization(actor.role),all=(files.data??[]) as Array<Omit<CityAuthorizationFile,"storage_path"|"sha256">>;
  // Removed files stay in history for Office and administrative backups only.
  return {authorization:authorization.data as CityAuthorization|null,files:all.filter(f=>!f.removed_at),removedFiles:canUpload?all.filter(f=>f.removed_at):[],canUpload};
}
export async function uploadCityAuthorization(requestId:string,form:FormData) {
  const {actor,service}=await context(requestId);
  if(!canProcessCityAuthorization(actor.role)) throw new CityAuthorizationError("Office or administrative access is required to upload City Authorization.",403);
  const version=form.get("version");
  if(typeof version!=="string" || !/^\d+$/.test(version) || !Number.isSafeInteger(Number(version))) throw new CityAuthorizationError("Reload the request before uploading.");
  const {data:current,error:currentError}=await service.from("training_request_city_authorizations").select("version").eq("request_id",requestId).maybeSingle();
  if(currentError) throw new CityAuthorizationError("Unable to load City Authorization.",503);
  if((current?.version??0)!==Number(version)) throw new CityAuthorizationError("This authorization changed. Reload before uploading again.",409);
  const file=form.get("file");
  if(!(file instanceof File) || file.size<1 || file.size>CITY_AUTHORIZATION_MAX_BYTES) throw new CityAuthorizationError("Choose a PDF, PNG or JPEG up to 4 MB.");
  const bytes=new Uint8Array(await file.arrayBuffer()),type=authorizationFileType(bytes);
  if(!type || type!==file.type) throw new CityAuthorizationError("Choose a valid PDF, PNG or JPEG authorization.");
  const id=randomUUID(),extension=type==="application/pdf"?"pdf":type==="image/png"?"png":"jpg";
  const path=`${requestId}/${id}.${extension}`,digest=hash(bytes);
  const name=file.name.replace(/[^a-zA-Z0-9._ ()-]/g,"_").slice(0,120)||`city-authorization.${extension}`;
  const storage=service.storage.from(BUCKET);
  const {error:uploadError}=await storage.upload(path,bytes,{contentType:type,upsert:false});
  if(uploadError) throw new CityAuthorizationError("Unable to upload the file. The Office step has not been completed.",503);
  const {data:stored,error:readError}=await storage.download(path);
  if(readError || !stored || hash(new Uint8Array(await stored.arrayBuffer()))!==digest) throw new CityAuthorizationError("Unable to verify the uploaded file. The Office step has not been completed.",503);
  const {data,error}=await service.rpc("record_city_authorization_upload",{
    p_actor_id:actor.id,p_request_id:requestId,p_expected_version:Number(version),p_file_id:id,
    p_file_name:name,p_storage_path:path,p_content_type:type,p_file_size_bytes:file.size,p_sha256:digest,
  });
  // An ambiguous database response may follow a committed upload. Preserve the
  // private object; reloading reconciles the recorded version without data loss.
  if(error || !data) throw new CityAuthorizationError(error?.message??"Unable to confirm the upload. Reload the request before trying again.",409);
  return data as CityAuthorization;
}
export async function removeCityAuthorizationFile(requestId:string,input:unknown) {
  const {actor,service}=await context(requestId);
  if(!canProcessCityAuthorization(actor.role)) throw new CityAuthorizationError("Office or administrative access is required to remove a City Authorization.",403);
  const {fileId,version}=(input&&typeof input==="object"?input:{}) as {fileId?:unknown;version?:unknown};
  if(typeof fileId!=="string" || !UUID.test(fileId)) throw new CityAuthorizationError("File not found.",404);
  if(typeof version!=="number" || !Number.isSafeInteger(version) || version<1) throw new CityAuthorizationError("Reload the request before removing a file.");
  // The private object is kept; the workflow only marks the file removed.
  const {data,error}=await service.rpc("record_city_authorization_file_removal",{p_actor_id:actor.id,p_request_id:requestId,p_expected_version:version,p_file_id:fileId});
  if(error || !data) {
    const message=error?.message??"";
    if(/changed/i.test(message)) throw new CityAuthorizationError("This authorization changed. Reload before removing a file.",409);
    if(/not found/i.test(message)) throw new CityAuthorizationError("File not found.",404);
    throw new CityAuthorizationError("Unable to confirm the removal. Reload the request before trying again.",409);
  }
  return data as CityAuthorization;
}
export async function downloadCityAuthorization(requestId:string,fileId:string) {
  const {service}=await context(requestId);
  if(!UUID.test(fileId)) throw new CityAuthorizationError("File not found.",404);
  const {data,error}=await service.from("training_request_city_authorization_files").select("*").eq("request_id",requestId).eq("id",fileId).maybeSingle();
  const file=data as CityAuthorizationFile|null;
  if(error) throw new CityAuthorizationError("Unable to load the authorization file.",503);
  if(!file || file.removed_at || !file.storage_path.startsWith(`${requestId}/`)) throw new CityAuthorizationError("File not found.",404);
  const {data:blob,error:downloadError}=await service.storage.from(BUCKET).download(file.storage_path);
  if(downloadError || !blob) throw new CityAuthorizationError("Unable to download the authorization file.",503);
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(hash(bytes)!==file.sha256) throw new CityAuthorizationError("The saved authorization file could not be verified.",503);
  return {bytes,type:file.content_type,name:file.file_name};
}

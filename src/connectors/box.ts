// Box: where Teresa's receipts live and where the claim packet is filed. The Box token never
// reaches a Sprite. Intake folder Salvor/Receipts, output folder Salvor/Claims/<id>.
import { call, json } from "../gateway.ts";

const CONN = "box-hands";

export type Folder = { id: string; name: string };

export async function me() { return json(CONN, "GET", "/2.0/users/me"); }

export async function ensureFolder(parentId: string, name: string): Promise<string> {
  const r = await call(CONN, "POST", "/2.0/folders", { name, parent: { id: parentId } });
  const j: any = await r.json();
  if (r.status === 201) return String(j.id);
  if (r.status === 409) return String(j.context_info?.conflicts?.[0]?.id ?? j.context_info?.conflicts?.id);
  throw new Error(`box create folder HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
}

export async function ensurePath(path: string[]): Promise<string> {
  let id = "0";
  for (const p of path) id = await ensureFolder(id, p);
  return id;
}

export async function listFolder(id: string): Promise<{ id: string; name: string; type: string; modified_at?: string; description?: string }[]> {
  const j: any = await json(CONN, "GET", `/2.0/folders/${id}/items?fields=id,name,type,modified_at,description&limit=200`);
  return j.entries ?? [];
}

export async function upload(folderId: string, filename: string, bytes: Uint8Array, contentType: string, description?: string): Promise<{ id: string; name: string }> {
  const form = new FormData();
  form.append("attributes", JSON.stringify({ name: filename, parent: { id: folderId }, ...(description ? { description } : {}) }));
  form.append("file", new Blob([bytes], { type: contentType }), filename);
  const r = await call(CONN, "POST", "/2.0/files/content", form);
  const j: any = await r.json();
  if (r.status === 409) {
    const existing = String(j.context_info?.conflicts?.id ?? j.context_info?.conflicts?.[0]?.id);
    const f2 = new FormData();
    f2.append("attributes", JSON.stringify({ name: filename }));
    f2.append("file", new Blob([bytes], { type: contentType }), filename);
    const r2 = await call(CONN, "POST", `/2.0/files/${existing}/content`, f2);
    const j2: any = await r2.json();
    if (!r2.ok) throw new Error(`box new version HTTP ${r2.status}`);
    return { id: String(j2.entries?.[0]?.id ?? existing), name: filename };
  }
  if (!r.ok) throw new Error(`box upload HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return { id: String(j.entries[0].id), name: String(j.entries[0].name) };
}

export async function download(fileId: string): Promise<Uint8Array> {
  const r = await call(CONN, "GET", `/2.0/files/${fileId}/content`, undefined, { redirect: "follow" });
  if (!r.ok) throw new Error(`box download HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function sharedLink(fileOrFolder: "files" | "folders", id: string): Promise<string> {
  const j: any = await json(CONN, "PUT", `/2.0/${fileOrFolder}/${id}?fields=shared_link`, { shared_link: { access: "open", permissions: { can_download: true } } });
  const u = j.shared_link?.url;
  if (!u) throw new Error("box did not return a shared link");
  return String(u);
}

// Status goes back onto the file Teresa dropped, in its description (metadata templates are
// probed separately, see Q10).
export async function setDescription(fileId: string, text: string) {
  await json(CONN, "PUT", `/2.0/files/${fileId}`, { description: text.slice(0, 250) });
}

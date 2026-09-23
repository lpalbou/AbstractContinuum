// Selection fold for the entity Skills section (framework dispatch c3038):
// the kit's PhaseCapabilityMatrix edits CELLS (grant/deny/clear patches),
// but the gateway PUT takes a WHOLE-DOCUMENT selection [{name, phases?}].
// This fold derives the post-edit selection from payload + patches — pure,
// so the mapping is pinned without a DOM.
//
// Cell semantics (gateway entity_skills.py, live shape): `assigned` means
// the skill is in the STORED selection for that phase (trust-gated cells
// stay assigned with resolved_value=false — selection and trust are
// different axes); an unselected cell is denied/unassigned with default
// provenance. So the fold reads `assigned`, never `resolved_value`.
import { type MatrixCellPatch, validateMatrixPayload } from "@abstractframework/ui-kit";

export type SkillSelectionEntry = { name: string; phases?: string[] };

/**
 * Fold payload + pending patches into the PUT selection document.
 * - grant  -> selected for that phase
 * - deny   -> unselected for that phase
 * - clear  -> back to the stored default, which for a skills matrix is
 *             UNSELECTED (default provenance = not in the selection)
 * - no patch -> the stored word stands (cell.assigned)
 * A skill selected for every ruled phase compacts to the global form
 * ({name}, phases absent) — "ABSENT = selected everywhere" (gateway PUT
 * contract), which keeps stored files minimal and round-trips exactly.
 */
export function fold_selection(payload: unknown, patches: MatrixCellPatch[]): SkillSelectionEntry[] | null {
  const v = validateMatrixPayload(payload);
  if (!v.ok) return null;
  const ruled = v.payload.phases.map((p) => p.id);
  const patch_map = new Map<string, "grant" | "deny" | "clear">();
  for (const p of patches) patch_map.set(`${p.section}\u0000${p.item}\u0000${p.phase}`, p.op);

  const out: SkillSelectionEntry[] = [];
  for (const section of v.payload.sections) {
    for (const item of section.items) {
      const on: string[] = [];
      for (const phase of ruled) {
        const cell = item.cells[phase];
        if (!cell) continue;
        const op = patch_map.get(`${section.id}\u0000${item.id}\u0000${phase}`);
        const selected = op ? op === "grant" : Boolean(cell.assigned);
        if (selected) on.push(phase);
      }
      if (!on.length) continue;
      if (on.length === ruled.length) out.push({ name: item.id });
      else out.push({ name: item.id, phases: on });
    }
  }
  return out;
}

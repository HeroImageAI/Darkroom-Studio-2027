import type { EditRequest } from "../../contracts/src/edit.js";
export const editWorkflowId = (task: string) =>
  ["Background", "Expand"].includes(task)
    ? "create.qwen.1ref"
    : "create.qwen.2ref";
export function editPrompt(request: EditRequest) {
  const stage =
    request.task === "Background"
      ? "Generate a clean empty background plate based on the lighting and framing of image 1. Create ONLY the requested new background: do not include the bottle, product, any subject, label, text, silhouettes, guides or masks. The protected original subject is composited separately and must not appear in this background plate. Apply the background part of the instruction below."
      : request.task === "Expand"
        ? "Edit image 1: the grey outer margins are new canvas. Fill these margins by naturally continuing the existing photograph and background. Do not add objects, borders or annotations. Return the whole image at the same framing and dimensions."
        : "Edit image 1 according to the instruction below. Image 2 is ONLY an edit-region guide: white pixels may change, black pixels must remain unchanged. Return the complete edited image 1 at the same framing and dimensions. Do not draw the guide, mask, borders, captions or annotations. Preserve all other subjects, identities, product shapes, labels and visible text.";
  return (
    stage +
    "\nAction: " +
    request.task +
    "\nVerbatim user instruction:\n" +
    request.instruction
  );
}

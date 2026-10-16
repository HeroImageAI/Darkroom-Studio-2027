import { intentSchema, type IntentInput } from "../../contracts/src/index.js";
import type { Manifest } from "../../workflows/src/manifest.js";
export function chooseRoute(
  input: IntentInput,
  manifests: Manifest[],
  readyIds: Set<string>,
) {
  const intent = intentSchema.parse(input);
  const eligible = manifests.filter(
    (m) =>
      m.enabled &&
      m.validationEvidenceId &&
      readyIds.has(m.id) &&
      (m.validatedQualities?.includes(intent.quality) ?? true) &&
      (m.referenceCount ?? 0) === intent.references.length &&
      intent.width * intent.height <= m.maxPixels &&
      (intent.model === "Auto" || m.modelFamily === intent.model),
  );
  if (
    !eligible.length &&
    intent.model === "Qwen" &&
    intent.quality === "Draft" &&
    intent.references.length === 3
  )
    throw Error(
      "Qwen Draft with three references did not pass visual validation. Use Final quality or Auto.",
    );
  if (!eligible.length)
    throw Error(
      "No validated workflow is ready for this request. Check local setup.",
    );
  const signal = intent.prompt.replace(
    /\b(no|without|avoid|exclude)\s+(visible\s+)?(text|logos?|lettering|captions?)\b/gi,
    "",
  );
  const textSensitive =
    /["“”]|\b(text|lettering|typography|caption|reads?|spells?|label|sign|logo)\b/i.test(
      signal,
    );
  const preferQwen =
    intent.references.length > 0 || intent.quality === "Final" || textSensitive;
  const threeRefDraft =
    intent.references.length === 3 && intent.quality === "Draft";
  const preferred = preferQwen && !threeRefDraft ? "Qwen" : "Klein";
  const workflow =
    eligible.find((m) => m.modelFamily === preferred) ?? eligible[0]!;
  return {
    workflow,
    reason:
      intent.model !== "Auto"
        ? `Requested ${intent.model} override`
        : threeRefDraft
          ? "Validated three-reference Draft route; Qwen Draft failed the lighting-guide case"
          : preferQwen
            ? intent.references.length
              ? "Reference identity and instruction fidelity"
              : textSensitive
                ? "Visible text and instruction fidelity"
                : "Final quality instruction fidelity"
            : "Draft iteration speed",
    evidenceId: workflow.validationEvidenceId,
    policyVersion: 2,
  };
}

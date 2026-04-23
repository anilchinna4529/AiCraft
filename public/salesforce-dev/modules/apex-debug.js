// Apex Debug — execute anonymous Apex + view compile/run result.
import { h, esc, requireOrg, field } from "../ui.js";

export default async function render(ctx) {
  const { root, api, toast } = ctx;
  if (!requireOrg(ctx)) return;

  const code = h("textarea", { class: "sf-textarea", spellcheck: "false",
    placeholder: "System.debug('Hello');" });
  code.value = localStorage.getItem("sf_last_apex") || "System.debug('Hello from AiCraft');";
  const runBtn = h("button", { class: "btn btn-primary" }, "Execute");
  const out = h("pre", { class: "sf-code" }, "");

  runBtn.addEventListener("click", async () => {
    const body = code.value.trim();
    if (!body) return;
    localStorage.setItem("sf_last_apex", body);
    out.textContent = "Running…";
    try {
      const r = await api.anonymousApex(ctx.getOrgId(), body);
      out.textContent =
        `Compiled: ${r.compiled}\n` +
        `Success : ${r.success}\n` +
        (r.compileProblem ? `Compile problem: ${r.compileProblem}\n` : "") +
        (r.exceptionMessage ? `Exception: ${r.exceptionMessage}\n` : "") +
        (r.exceptionStackTrace ? `Stack:\n${r.exceptionStackTrace}\n` : "") +
        (r.line ? `Line ${r.line}, Col ${r.column}\n` : "");
    } catch (e) {
      out.textContent = e.message;
      toast(e.message, "err");
    }
  });

  root.append(h("div", { class: "sf-stack" }, [
    field("Anonymous Apex", code),
    h("div", {}, runBtn),
    h("h4", {}, "Result"),
    out,
  ]));
}

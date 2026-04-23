// AI Assistant — asks AiCraft's existing AI endpoint to help build SOQL / explain errors.
import { h, esc, field } from "../ui.js";

export default async function render(ctx) {
  const { root } = ctx;
  const prompt = h("textarea", { class: "sf-textarea",
    placeholder: "e.g. Write a SOQL to find Accounts with no Contacts created this year." });
  const out = h("pre", { class: "sf-code" }, "");
  const btn = h("button", { class: "btn btn-primary" }, "Ask");

  btn.addEventListener("click", async () => {
    const q = prompt.value.trim();
    if (!q) return;
    out.textContent = "Thinking…";
    try {
      const token = localStorage.getItem("aicraft_token");
      const r = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify({
          system: "You are an expert Salesforce SOQL / Apex assistant. Return concise, copy-pasteable answers.",
          message: q,
        }),
      });
      if (!r.ok) throw new Error(`AI endpoint: ${r.status}`);
      const data = await r.json();
      out.textContent = data.reply || data.text || JSON.stringify(data, null, 2);
    } catch (e) {
      out.textContent =
        "Could not reach /api/ai/chat. This module will activate once an AiCraft AI endpoint is configured.\n\n" +
        e.message;
    }
  });

  root.append(h("div", { class: "sf-stack" }, [
    field("Ask", prompt),
    h("div", {}, btn),
    out,
  ]));
}

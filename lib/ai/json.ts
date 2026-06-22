// Tolerant JSON parser for LLM output. Models sometimes wrap JSON in prose or
// markdown fences, add trailing commas, or get cut off mid-array by a token cap.
// This strips fences, isolates the outermost object/array, removes trailing
// commas, and repairs truncation by closing any still-open strings/brackets.
export function parseLooseJson(raw: string): any {
  if (!raw) throw new Error("empty AI response");
  let s = raw.replace(/```json|```/g, "").trim();

  // Isolate the outermost JSON container.
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const start = firstArr !== -1 && (firstArr < firstObj || firstObj === -1) ? firstArr : firstObj;
  if (start > 0) s = s.slice(start);

  try { return JSON.parse(s); } catch { /* repair below */ }

  // Strip trailing commas before } or ].
  s = s.replace(/,(\s*[}\]])/g, "$1");
  try { return JSON.parse(s); } catch { /* repair truncation below */ }

  // Walk the string tracking string/escape state + bracket stack; cut back to the
  // last structurally safe point, then close everything still open.
  const stack: string[] = [];
  let inStr = false, esc = false, lastSafe = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') { inStr = false; lastSafe = i + 1; }
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") { stack.pop(); lastSafe = i + 1; }
    else if (c === "," || /\s/.test(c)) lastSafe = i + 1;
  }
  s = s.slice(0, lastSafe).replace(/,(\s*)$/, "");
  for (let i = stack.length - 1; i >= 0; i--) s += stack[i];
  return JSON.parse(s);
}

## Working rules
- Tell the user clearly when their request or assumption is based on a misconception.
- Read the relevant files before proposing or making changes.
- Prefer editing existing files to creating new ones.
- Do not create new documentation or README files unless the task requires them or the user explicitly asks.
- Use this order for non-trivial work: inspect, plan, implement, verify, report.
- Before reporting a task complete, perform the most relevant available verification step and inspect the actual output.
- Report outcomes faithfully. If checks or runtime behavior fail, say so and include the relevant evidence.
- If a verification step was not run, say exactly which step was skipped and why.
- Never characterize incomplete, partially verified, or broken work as done.
- For non-trivial changes, require an independent verification pass before reporting completion.
- Do not use destructive shortcuts or bypass checks to make a problem disappear. Investigate the root cause first.
- Ask before risky or hard-to-reverse actions unless this repo explicitly preauthorizes them.
- Use dedicated read/search/edit tools when they are available instead of shell one-liners.
- Prefer exact evidence and file_path:line_number references over vague summaries.
- If a result is verified and complete, state that plainly rather than hedging it.

### Additional high-value constraints
- Do not assume the environment is correctly set up; verify dependencies, paths, and configs before execution.
- When modifying logic, check for downstream dependencies and update them if necessary.
- Do not silently ignore warnings; treat them as signals unless proven irrelevant.
- When debugging, reproduce the issue first before attempting fixes.
- Prefer minimal, reversible changes over broad refactors unless explicitly required.
- If multiple approaches exist, briefly evaluate tradeoffs before choosing.
- Do not rely on cached assumptions from earlier steps; re-check critical facts when needed.
- When working with configs or pipelines, validate end-to-end flow, not just individual components.
- Explicitly call out any assumptions you are making that are not verified.



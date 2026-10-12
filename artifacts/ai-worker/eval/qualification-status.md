# Qualification is still pending

The implemented candidate is Qwen 3.8 27B on the existing private Groq connection with Nimbus harness v3.7. The ≥3.5/4 target has **not** been demonstrated for this final version. Do not describe the candidate as qualified or superior to Gemini or GLM.

The v3.5 run completed all 17 synthetic cases. Three writing outputs met their word constraints, and generated Python median and JavaScript integer parsing passed execution checks (8 and 17 additional contract cases respectively). Review and vision failures remained: a missing argument response received a vague remedy, ambiguous speakers could be guessed, an unscaled chart's height ratio was omitted, and a truncated chart's visible ratio was misstated.

The v3.6 reruns corrected the truncated-axis calculation (64/76 values, baseline 60, actual ratio 1.1875 versus visible ratio 4). An unscaled chart was still estimated incorrectly at 2.5 rather than approximately 2. A fresh writing case exceeded its word limit despite one rewrite. That fresh failure is retained in the results. The remaining fresh code, chart, scope and general cases had not run when the fixes were prepared.

Version 3.7 adds a narrow check against diagnosing an ambiguous person reference and then silently guessing that person's identity, two bounded rewrites based on measured word counts, and removes a numerical vision example that could prime an irrelevant ratio. Images use two passes; reviews, writing and code use draft/audit/edit. Simple general questions use one pass. These changes have unit coverage, but their final provider qualification is pending.

Groq rejected the final qualification requests at its free 200,000-token daily limit. No credits were purchased, billing enabled, additional keys registered, or paid fallback activated. Raw result files preserve service failures separately from quality outcomes. They omit provider account identifiers and credentials. Earlier runs are development evidence, not blind validation of v3.7. Do not erase earlier failures or relabel them as successful reruns.

Gemini 3.6 Flash and GLM 5.3 templates use the same tasks and harness with their supported high/max reasoning controls. They have not run because eligible free access is unavailable. GLM's native text-only profile cannot receive the image fixtures; a vision companion needs its own evaluation. There isn't enough research to assign reliable after-harness scores to either model or declare a cross-model winner.

Completion still requires final live model qualification, appropriate generated-code execution, a light three-request capacity check, and live browser verification of the deployed Nimbus interaction. The score scale and test expectations are documented in this directory's README.

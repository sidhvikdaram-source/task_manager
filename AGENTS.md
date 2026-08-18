# Repository Agent Instructions

## Complete In-Scope Actions

- Complete every action that can be performed directly and safely within the requested scope.
- Do not ask the user to run commands, edit files, execute tests, or perform other steps that the agent can complete itself.
- Ask for user input only when a required decision, permission, credential, or external action cannot be resolved independently.

## Browser Verification

- For changes that affect the user interface or browser behavior, run the application and verify the result in a browser before considering the work complete.
- Exercise the changed interaction and relevant surrounding flow, check responsive behavior when applicable, and inspect the browser console for errors.
- If browser verification is blocked by missing credentials or an unavailable dependency, complete all other verification and clearly report the blocker.

## Required UI Design Skill

- For user-interface design, redesign, layout, or motion work, read and apply the repository's `gpt-taste` skill at `.agents/skills/gpt-taste/SKILL.md`.
- Adapt its visual principles to the existing product architecture and interaction model without breaking established functionality or introducing a competing framework without need.

## GitHub Delivery

- After making repository changes, run appropriate verification, commit the completed changes, and push the current branch to GitHub.
- After every successful GitHub push that includes deployable Nimbus changes, deploy the matching build to the `nimbusdo` Firebase project and verify the live `https://nimbusdo.web.app` release before reporting completion.
- Confirm that the push succeeded before reporting the work as finished.

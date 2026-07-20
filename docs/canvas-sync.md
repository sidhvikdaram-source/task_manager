# Canvas sync setup

Velocity supports Canvas OAuth for full course sync and a calendar-feed fallback.

## Render environment

The Blueprint creates `CANVAS_INTEGRATION_ENCRYPTION_KEY` automatically. Keep this value stable: changing it makes existing encrypted connections unreadable.

For full OAuth sync, ask the Canvas administrator for a developer key and set:

- `CANVAS_CLIENT_ID`: the developer key ID.
- `CANVAS_CLIENT_SECRET`: the developer key secret.
- `CANVAS_BASE_URL`: `https://fisd.instructure.com` for Frisco ISD.
- `CANVAS_REDIRECT_URI`: `https://<your-render-host>/api/canvas/oauth/callback`.

The redirect URI must exactly match the redirect configured on the Canvas developer key. Never expose the client secret or integration encryption key in frontend environment variables.

## Calendar fallback

Until the developer key is approved, users can open **School > Canvas sync** and paste their Canvas calendar feed URL. Velocity encrypts the URL before storing it. Feed items appear as tasks on Home and Workspace as well as events on Calendar. Canvas course metadata, quiz metadata, submission status, and project relationships require OAuth.

## Sync behavior

- Velocity syncs stale data when the authenticated app opens and every 15 minutes while it remains visible.
- Manual **Sync changes** controls are available in School and Calendar.
- Removing a Canvas item from Velocity creates a persistent ignore rule. It never deletes or edits the Canvas source.
- **Remove all items** archives every imported assignment and event and creates ignore rules so another sync cannot immediately recreate them. Canvas itself is never changed.
- Imported items are categorized as Quiz/Test, Meeting, Class Event, Deadline, or Other from Canvas metadata and deterministic title rules.
- Feed items without course metadata receive reviewable subject suggestions. Users choose the final subject before Velocity applies it.
- Canvas owns imported titles, course mappings, due times, URLs, and submission state. Velocity owns planning metadata such as priority, estimate, project, notes, and checklists.

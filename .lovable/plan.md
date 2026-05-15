# Fix Rewrite selection + lock Regenerate during edit

## Bug fix — Rewrite selection
**Root cause:** Clicking the Rewrite button steals focus from the textarea, which fires `onBlur` → saves and exits edit mode → disables the very button being clicked. Also reads selection from the DOM at click time, which is unreliable once focus moves.

**Fix in `src/pages/ReviewExport.tsx`:**
1. Add `selections` state: `Record<string, { start: number; end: number }>` updated from the textarea's `onSelect` event.
2. Add `onMouseDown={(e) => e.preventDefault()}` to the Rewrite button so it doesn't steal focus from the textarea — selection is preserved and onBlur doesn't fire.
3. `openRewrite` reads from the `selections` map, not from `el.selectionStart` directly. Empty selection → existing toast "Select some text in the comment first".
4. Remove the `!editableIds[sid]` gate on the Rewrite button — it only needs to be in edit mode AND have a selection (handled by the new logic below).

## New ask — Lock Regenerate while in edit mode
When `editableIds[sid]` is true:
- Disable the **Regenerate** button (greyed out) with a tooltip "Finish editing to regenerate the full comment".
- Same treatment for **Spelling & grammar** and **Delete version** to keep the contract consistent (they all replace/destroy the text the user is currently editing).
- Manual edit, Rewrite selection, and Copy stay enabled.

This prevents accidentally wiping in-progress manual edits with a full regenerate.

## Files
- `src/pages/ReviewExport.tsx` only. No edge function or DB changes.
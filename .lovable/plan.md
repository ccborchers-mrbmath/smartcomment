## Goal
While recording a voice note on the Student Card, let the user cancel instead of being forced to wait for transcription. Cancel must stop the mic immediately and discard the audio — no upload, no `transcribe-audio` call, no credit usage.

## Where
`src/pages/StudentCard.tsx` — the existing voice-note recorder (Record / Stop & transcribe buttons in the "voice" tab).

## Changes

1. **Track a "cancelled" flag on the recorder**
   - Add a `cancelledRef = useRef(false)` so the `MediaRecorder.onstop` handler can tell whether the stop came from "Stop & transcribe" or "Cancel".
   - Also keep a ref to the active `MediaStream` so cancel can release the mic synchronously inside the click handler (browser gesture context — required so the mic light turns off and tracks are actually released).

2. **`startRecording`**
   - Reset `cancelledRef.current = false` and store the stream in a ref.
   - Existing `onstop` becomes: if `cancelledRef.current`, just stop tracks, clear chunks, and return — do NOT build the blob, do NOT call `uploadVoice`. Otherwise behave as today.

3. **New `cancelRecording` handler** (called directly from the Cancel button's `onClick`, synchronously — no `await` before the stop calls):
   - Set `cancelledRef.current = true`.
   - Call `recorderRef.current?.stop()`.
   - Call `streamRef.current?.getTracks().forEach(t => t.stop())` to release the mic immediately.
   - Clear `chunksRef.current = []`, null out the refs, `setRecording(false)`.
   - Small toast: "Recording cancelled".

4. **UI in the voice tab (around lines 530–536)**
   - While recording, show two buttons side-by-side instead of just "Stop & transcribe":
     - `Cancel` (ghost/outline, `X` icon) → `cancelRecording`
     - `Stop & transcribe` (destructive, unchanged) → `stopRecording`
   - Layout: a simple two-column flex/grid so both fit the existing width.

## Out of scope
No changes to the `transcribe-audio` edge function, storage bucket, or any other recorder/audio flow (none exist elsewhere — grep confirms StudentCard is the only `MediaRecorder` user).

#!/usr/bin/env bash
set -u
VOICE="EXAVITQu4vr4xnSDxMaL"
MODEL="eleven_multilingual_v2"

gen() {
  local out="$1"
  local text="$2"
  local body
  body=$(jq -n --arg t "$text" --arg m "$MODEL" '{
    text:$t, model_id:$m,
    voice_settings:{stability:0.45, similarity_boost:0.75, style:0.55, use_speaker_boost:true, speed:1.08}
  }')
  echo "Generating $out ($(echo -n "$text" | wc -c) chars)..."
  http=$(curl -sS -w "%{http_code}" -o "$out" \
    -X POST "https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128" \
    -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$body")
  echo "  HTTP $http -> $(stat -c%s "$out" 2>/dev/null) bytes"
  if [ "$http" != "200" ]; then cat "$out"; echo; return 1; fi
}

mkdir -p public/audio

read -r -d '' VO60 <<'EOF' || true
Report card season. Thirty students. One weekend. Snap it. Say it. Paste it. SmartComment turns whatever you've got into report-ready comments, in your voice, for every student, in minutes. Start by setting up your class. Paste a screenshot of your roster, drag in a CSV, or snap a photo. AI pulls the names out for you. For each student, capture evidence the way that suits you. Voice notes transcribe instantly. Handwritten notes turn into text from a single photo. Or just type. Your style bank teaches the AI how you write. Your school requirements keep every comment on policy. When you're ready, one click generates comments for your entire class, in parallel. Review everything in one place. Tweak by hand, or highlight a sentence and let AI rewrite just that part. Then export, ready for your reporting system. SmartComment. Spend less time writing. More time teaching.
EOF

read -r -d '' VO30 <<'EOF' || true
Report card season. Thirty students. One weekend. Snap it. Say it. Paste it. SmartComment turns voice notes, photos and screenshots into report-ready comments, in your voice. Set up your class in seconds. Capture evidence any way you like. One click generates the whole class. Review, refine, export. SmartComment. Spend less time writing. More time teaching.
EOF

gen public/audio/vo60.mp3 "$VO60"
gen public/audio/vo30.mp3 "$VO30"
